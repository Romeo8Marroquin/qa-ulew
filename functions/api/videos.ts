/**
 * GET /api/videos — the channel's videos as they are *right now*.
 *
 * WHY THIS EXISTS
 *
 * The video grids are rendered at build time (see `lib/youtube.ts`), which
 * means they are only as current as the last deploy. A video deleted on YouTube
 * kept its tile on the landing page until someone happened to redeploy, and a
 * live stream that started after the build did not appear at all.
 *
 * The obvious fix — fetch the feed from the browser — is not available:
 * `youtube.com/feeds/videos.xml` sends no `Access-Control-Allow-Origin` header,
 * so the request is blocked before it is made. A server has to do it, and this
 * is the smallest server that can.
 *
 * WHAT IT ANSWERS
 *
 *   { recent: [...], popular: [...] }
 *
 * `recent` is the uploads feed with the live stream, if any, moved to the top
 * and flagged — the feed alone cannot do either; see `parseLive`. `popular` is
 * the channel's most viewed, from YouTube's own popular playlists. Each entry
 * carries its view count and publish date so the page can show them current.
 *
 * WHY A PAGES FUNCTION AND NOT A WORKER
 *
 * This is not a separate Cloudflare project. Pages compiles any `functions/`
 * directory found in the build root into the existing deployment, so there is
 * no second dashboard entry, no `wrangler.toml`, no extra build settings, and
 * nothing to keep in sync. The site stays a static build; this one route is the
 * only thing that executes. `dist/` is untouched and still flat.
 *
 * IT MUST NEVER BREAK THE PAGE
 *
 * Every failure path answers with the last good answer if one is cached, and
 * otherwise 503 with empty lists rather than throwing. The client
 * (`src/scripts/video-feed.ts`) leaves the build-time HTML alone unless it gets
 * a 200 with videos in it. A visitor with JavaScript off, or one who arrives
 * while YouTube is throttling us, sees at worst what the build shipped.
 */
import { SITE, YOUTUBE } from '../../apps/web/src/config/site';
import {
  BROWSER_UA,
  buildCatalog,
  type Catalog,
  type CatalogVideo,
  channelFeedUrl,
  type FeedVideo,
  fetchLive,
  mergePopular,
  parseFeed,
  playlistFeedUrl,
  popularPlaylists,
  probeEmbeddable,
} from '../../apps/web/src/lib/youtube-feed';

const TIMEOUT_MS = 5000;

/**
 * How long the edge holds a response.
 *
 * The compromise between the two things that can go wrong. Too long and a live
 * stream is missing from a page that claims to be current. Too short and every
 * visitor becomes a request to YouTube from Cloudflare's shared egress IPs —
 * which is precisely how the Atom feed starts rate limiting us, and it signals
 * that by answering 404, indistinguishable from a deleted channel. Caching here
 * protects the upstream more than it protects us.
 *
 * Three minutes rather than the five this started with: "en vivo" is the one
 * thing on the page a visitor will notice being late.
 */
const CACHE_SECONDS = 180;

/** The browser's copy is kept shorter, so a reload soon after is not stuck. */
const BROWSER_SECONDS = 60;

/**
 * The last good answer, kept for a day under its own key.
 *
 * WHY: when YouTube throttles a cache miss, the alternative to this is a 503 —
 * and the page then keeps the build-time HTML, which can be days old. That is
 * what made the site show a previous video while the channel was on air.
 * Minutes-stale beats days-stale.
 */
const LAST_GOOD_SECONDS = 86_400;

/**
 * Distinct videos probed per cache miss.
 *
 * The free plan allows 50 subrequests per invocation. Three feeds and the live
 * page are 4; a probe is 1, or 2 when a bad verdict is re-checked. 20 probes
 * stays under the ceiling even if every one needed confirming — and covers the
 * whole recent list plus the top of the popular one, which is what a visitor
 * sees without pressing "ver más".
 */
const PROBE_BUDGET = 20;

/** Bumped when the payload shape changes, so an old cached body is not served. */
const CACHE_VERSION = 2;

/** Only what a tile renders. The description stays server-side. */
interface VideoPayload {
  id: string;
  title: string;
  published: string;
  views: number | null;
  live: boolean;
  /** Absent when not probed — see `CatalogVideo.embeddable`. */
  embeddable?: boolean;
}

/** Minimal shape of the Pages Function context. Typing only what is used. */
interface FunctionContext {
  request: Request;
  waitUntil(promise: Promise<unknown>): void;
}

/**
 * The Workers cache. Not in lib.dom's `CacheStorage`, hence the cast — the
 * alternative is pulling in `@cloudflare/workers-types` for one property.
 */
const edgeCache = (caches as unknown as { default: Cache }).default;

const json = (body: BodyInit | null, status: number, cacheControl: string): Response =>
  new Response(body, {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
    },
  });

/** What the browser is told, whatever lifetime the edge copy was stored with. */
const toBrowser = (body: BodyInit | null): Response =>
  json(body, 200, `public, max-age=${BROWSER_SECONDS}`);

const unavailable = (): Response =>
  json(JSON.stringify({ recent: [], popular: [] }), 503, 'no-store');

async function feed(url: string): Promise<FeedVideo[]> {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: 'application/atom+xml,application/xml', 'user-agent': BROWSER_UA },
  });
  if (!response.ok) throw new Error(`feed HTTP ${response.status}`);
  return parseFeed(await response.text(), YOUTUBE.limit);
}

const toPayload = ({
  id,
  title,
  published,
  views,
  live,
  embeddable,
}: CatalogVideo): VideoPayload => ({
  id,
  title,
  published,
  views,
  live,
  embeddable,
});

async function collect(): Promise<{ recent: VideoPayload[]; popular: VideoPayload[] }> {
  // All four at once: in sequence they would dominate the response time of a
  // route whose whole point is to be quick enough to run on every page load.
  const [recent, popularLists, live] = await Promise.all([
    feed(channelFeedUrl(YOUTUBE.channelId)),
    // A popular playlist that does not exist for this channel 404s, exactly
    // like a throttled one. Each is optional; the uploads feed is not.
    Promise.all(
      popularPlaylists(YOUTUBE.channelId).map((id) =>
        feed(playlistFeedUrl(id)).catch((): FeedVideo[] => []),
      ),
    ),
    fetchLive(YOUTUBE.channelId, fetch, AbortSignal.timeout(TIMEOUT_MS)),
  ]);

  const catalog: Catalog = await buildCatalog({
    recent,
    popular: mergePopular(popularLists, YOUTUBE.limit),
    live,
    limit: YOUTUBE.limit,
    probe: (id) => probeEmbeddable(id, SITE.url),
    budget: PROBE_BUDGET,
  });

  return { recent: catalog.recent.map(toPayload), popular: catalog.popular.map(toPayload) };
}

export const onRequestGet = async (context: FunctionContext): Promise<Response> => {
  if (!YOUTUBE.channelId) return unavailable();

  // Keyed on a fixed URL, not the incoming one: a stray `?utm_source=…` must
  // not miss the cache and send another request upstream.
  const base = new URL('/api/videos', context.request.url);
  const cacheKey = new Request(`${base.href}?v=${CACHE_VERSION}`);
  const lastGoodKey = new Request(`${base.href}?v=${CACHE_VERSION}&last-good`);

  const hit = await edgeCache.match(cacheKey);
  if (hit) return toBrowser(hit.body);

  let payload: { recent: VideoPayload[]; popular: VideoPayload[] } | null = null;
  try {
    payload = await collect();
  } catch {
    // Deliberately quiet. This runs per request, not per build, so a throttled
    // minute would otherwise fill the log with noise nobody reads.
  }

  // An empty recent list is far more likely to be throttling than a channel
  // that genuinely emptied overnight, and caching it would pin that state in
  // place. Fall back, and try again on the next request.
  if (!payload || payload.recent.length === 0) {
    const stale = await edgeCache.match(lastGoodKey);
    return stale ? toBrowser(stale.body) : unavailable();
  }

  const body = JSON.stringify({ ...payload, fetchedAt: new Date().toISOString() });

  // Separate responses, not clones: each copy carries its own lifetime, and the
  // Cache API reads the lifetime from the response's own headers.
  context.waitUntil(
    Promise.all([
      edgeCache.put(cacheKey, json(body, 200, `public, max-age=${CACHE_SECONDS}`)),
      edgeCache.put(lastGoodKey, json(body, 200, `public, max-age=${LAST_GOOD_SECONDS}`)),
    ]),
  );

  return toBrowser(body);
};
