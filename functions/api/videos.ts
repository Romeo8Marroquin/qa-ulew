/**
 * GET /api/videos — the channel's uploads as they are *right now*.
 *
 * WHY THIS EXISTS
 *
 * The videos grid is rendered at build time (see `lib/youtube.ts`), which means
 * it is only as current as the last deploy. A video deleted on YouTube kept its
 * tile on the landing page until someone happened to redeploy, and a live
 * stream that started after the build did not appear at all.
 *
 * The obvious fix — fetch the feed from the browser — is not available:
 * `youtube.com/feeds/videos.xml` sends no `Access-Control-Allow-Origin` header,
 * so the request is blocked before it is made. A server has to do it, and this
 * is the smallest server that can.
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
 * Every failure path answers 503 with an empty list rather than throwing, and
 * the client (`src/scripts/video-feed.ts`) leaves the build-time HTML alone
 * unless it gets a 200 with videos in it. A visitor with JavaScript off, or one
 * who arrives while YouTube is throttling us, sees exactly what they see today.
 */
import { YOUTUBE } from '../../apps/web/src/config/site';
import { applyVerdicts, parseFeed, probeEmbeddable } from '../../apps/web/src/lib/youtube-feed';

const FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const TIMEOUT_MS = 5000;

/**
 * How long the edge holds a response.
 *
 * Five minutes is the compromise between the two things that can go wrong. Too
 * long and a live stream is missing from a page that claims to be current. Too
 * short and every visitor becomes a request to YouTube from Cloudflare's shared
 * egress IPs — which is precisely how the Atom feed starts rate limiting us,
 * and it signals that by answering 404, indistinguishable from a deleted
 * channel. Caching here protects the upstream more than it protects us.
 */
const CACHE_SECONDS = 300;

/**
 * A browser UA measurably reduces how often the feed throttles. Same string as
 * the build-time fetch, for the same reason.
 */
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

interface VideoPayload {
  id: string;
  title: string;
  /** False when the owner disabled embedding; the tile links out instead. */
  embeddable: boolean;
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

const json = (body: unknown, status: number, cacheControl: string): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': cacheControl,
    },
  });

const unavailable = (): Response => json({ videos: [] }, 503, 'no-store');

async function collect(): Promise<VideoPayload[]> {
  const response = await fetch(`${FEED_URL}${encodeURIComponent(YOUTUBE.channelId)}`, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { accept: 'application/atom+xml,application/xml', 'user-agent': UA },
  });

  if (!response.ok) throw new Error(`feed HTTP ${response.status}`);

  const videos = parseFeed(await response.text(), YOUTUBE.limit);

  // Probed together rather than in sequence: six round trips to YouTube one
  // after another would dominate the response time of a route whose whole
  // point is to be quick enough to run on every page load.
  const verdicts = await Promise.all(videos.map((video) => probeEmbeddable(video.id)));

  return applyVerdicts(videos, verdicts).map((video) => ({
    id: video.id,
    title: video.title,
    embeddable: video.embeddable,
  }));
}

export const onRequestGet = async (context: FunctionContext): Promise<Response> => {
  if (!YOUTUBE.channelId) return unavailable();

  // Keyed on a fixed URL, not the incoming one: a stray `?utm_source=…` must
  // not miss the cache and send another request upstream.
  const cacheKey = new Request(new URL('/api/videos', context.request.url).toString());

  const hit = await edgeCache.match(cacheKey);
  if (hit) return hit;

  let videos: VideoPayload[];
  try {
    videos = await collect();
  } catch {
    // Deliberately quiet. This runs per request, not per build, so a throttled
    // minute would otherwise fill the log with noise nobody reads. The client
    // treats any non-200 as "keep what is already on the page".
    return unavailable();
  }

  // An empty list is far more likely to be throttling than a channel that
  // genuinely emptied overnight, and caching it would pin that state in place
  // for five minutes. Answer 503 and try again on the next request.
  if (videos.length === 0) return unavailable();

  const response = json({ videos }, 200, `public, max-age=${CACHE_SECONDS}`);

  // The clone is required: a Response body can only be read once, and
  // `cache.put` consumes it. waitUntil lets the write outlive the response.
  context.waitUntil(edgeCache.put(cacheKey, response.clone()));

  return response;
};
