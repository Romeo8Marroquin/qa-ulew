import { SITE, YOUTUBE, type FeaturedVideo } from '~/config/site';
import snapshot from '~/data/youtube-feed.json';
import {
  BROWSER_UA,
  buildCatalog,
  type CatalogVideo,
  channelFeedUrl,
  type FeedVideo,
  mergePopular,
  parseFeed,
  playlistFeedUrl,
  popularPlaylists,
  probeEmbeddable,
} from '~/lib/youtube-feed';

/**
 * Build-time fetch of the channel's public YouTube Atom feeds.
 *
 * Runs during `astro build`, never in the browser. The result is baked into
 * static HTML, so the page paints a correct video grid with no JavaScript and
 * there is no API key anywhere in the pipeline.
 *
 * It is baked, not final: `functions/api/videos.ts` re-fetches the same feeds
 * on request and `src/scripts/video-feed.ts` reconciles the grids after load,
 * so a video deleted, a stream started or a view count grown since the last
 * deploy is corrected for anyone with JavaScript. This module is what everyone
 * else sees, and what the first paint shows before that lands.
 *
 * Design constraint that shapes this whole file: **a content fetch must never
 * be able to block a deploy.** If YouTube is slow, rate-limiting the build
 * runner, or briefly down, the build has to carry on and ship the manually
 * curated videos instead. Every failure path below returns a list rather than
 * throwing.
 *
 * WHY NO "EN VIVO" BADGE AT BUILD TIME
 *
 * The page is static. A badge baked during a broadcast would still say "en
 * vivo" days later to anyone whose refresh did not land — JavaScript off, or
 * the Function unavailable. Not highlighting a stream is a small loss; claiming
 * one is on air when it is not is a wrong page. So live state comes only from
 * the Function, which answers with what is true now.
 */

const TIMEOUT_MS = 8000;

interface SnapshotVideo {
  id: string;
  title: string;
  published: string;
  description?: string;
  views?: number | null;
}

/**
 * The committed snapshot, used when a live feed is unavailable.
 *
 * Refresh it with `pnpm --filter @qa-ulew/web content:youtube`. Snapshots
 * written before view counts or the popular list existed lack them, hence the
 * defaults.
 */
function fromSnapshot(list: SnapshotVideo[] | undefined): FeedVideo[] {
  return (list ?? []).slice(0, YOUTUBE.limit).map((video) => ({
    id: video.id,
    title: video.title,
    published: video.published,
    description: video.description ?? '',
    views: video.views ?? null,
  }));
}

const snapshotLists = snapshot as { videos?: SnapshotVideo[]; popular?: SnapshotVideo[] };

/**
 * One feed, or `null` on any failure. Never throws.
 *
 * The fallback is not paranoia. YouTube's public feed is rate limited, and when
 * it throttles it answers **404** rather than 429 — indistinguishable from a
 * deleted channel. Observed here: the same channel id served videos and then
 * 404'd from the same machine half an hour later. Cloudflare Pages builds from
 * shared IPs, so they are throttled more often, not less.
 *
 * `expectMissing` is for a feed that may legitimately not exist — a popular
 * playlist the channel does not have. Its 404 is then routine, and a warning
 * on every build would teach whoever reads the log to ignore the real ones.
 */
async function fetchFeed(
  url: string,
  name: string,
  expectMissing = false,
): Promise<FeedVideo[] | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/atom+xml,application/xml', 'user-agent': BROWSER_UA },
    });

    if (!response.ok) {
      if (!(expectMissing && response.status === 404)) {
        console.warn(
          `[youtube] ${name} feed returned ${response.status} (rate limiting answers 404)`,
        );
      }
      return null;
    }

    const videos = parseFeed(await response.text(), YOUTUBE.limit);
    return videos.length === 0 ? null : videos;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.warn(`[youtube] ${name} feed unavailable (${reason})`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Latest uploads, newest first: the live feed, else the snapshot.
 *
 * Without the snapshot, one unlucky build silently deploys an empty videos
 * section. With it, the worst case is videos from the last refresh.
 */
async function fetchRecent(): Promise<FeedVideo[]> {
  const live = await fetchFeed(channelFeedUrl(YOUTUBE.channelId), 'uploads');
  if (live) return live;

  const fallback = fromSnapshot(snapshotLists.videos);
  console.warn(`[youtube] using snapshot of ${fallback.length} recent video(s)`);
  return fallback;
}

/**
 * Most viewed, from whichever popular playlists answer.
 *
 * A playlist that does not exist for this channel 404s exactly like a
 * throttled one, so one failing is normal and says nothing. Only when none
 * answers does the snapshot stand in.
 */
async function fetchPopular(): Promise<FeedVideo[]> {
  const lists = await Promise.all(
    popularPlaylists(YOUTUBE.channelId).map((id) => fetchFeed(playlistFeedUrl(id), id, true)),
  );
  const found = lists.filter((list): list is FeedVideo[] => list !== null);
  if (found.length > 0) return mergePopular(found, YOUTUBE.limit);

  const fallback = fromSnapshot(snapshotLists.popular);
  console.warn(`[youtube] using snapshot of ${fallback.length} popular video(s)`);
  return fallback;
}

const toFeatured = (video: CatalogVideo): FeaturedVideo => ({
  provider: 'youtube',
  id: video.id,
  title: video.title,
  // Unprobed counts as playable. The build probes everything, so this is the
  // type being honest rather than a case that arises.
  embeddable: video.embeddable !== false,
  published: video.published,
  views: video.views,
});

export interface VideoCatalog {
  recent: FeaturedVideo[];
  popular: FeaturedVideo[];
}

/**
 * Both lists, with each video checked against the embed page before it is
 * rendered.
 *
 * The probe answers two questions the Atom feed cannot:
 *
 * 1. **Is it still there?** A deleted video vanishes from the feed, but not
 *    from the snapshot — so on a throttled build the page would resurrect it
 *    and show YouTube's *"La persona que subió el video lo quitó"* panel. A
 *    probe that answers ERROR drops it here instead.
 * 2. **Will it play here?** If the owner disabled embedding, or a rights
 *    holder blocked embedded playback of the content in it, the iframe renders
 *    a grey error inside our layout. `embeddable: false` turns the tile into a
 *    link to YouTube, which works.
 *
 * Probes are failure-tolerant on purpose — see `probeEmbeddable` for a single
 * bad answer and `buildCatalog` for a unanimously bad one — so this cannot
 * turn a working build into an empty page. The worst it can do is leave a tile
 * exactly as it would have been without the check.
 */
export async function fetchVideoCatalog(): Promise<VideoCatalog> {
  if (!YOUTUBE.channelId) return { recent: [], popular: [] };

  const [recent, popular] = await Promise.all([fetchRecent(), fetchPopular()]);

  const catalog = await buildCatalog({
    recent,
    popular,
    live: null,
    limit: YOUTUBE.limit,
    // `SITE.url` is the referrer the probe presents: the verdict is per
    // embedding site, so asking as anyone else answers a different question.
    probe: (id) => probeEmbeddable(id, SITE.url),
  });

  return { recent: catalog.recent.map(toFeatured), popular: catalog.popular.map(toFeatured) };
}

/**
 * Pinned videos first, then the feed, with duplicates removed.
 *
 * A video pinned in FEATURED_VIDEOS will also appear in the feed; the pinned
 * entry wins so its curated title and position are preserved.
 */
export function mergeVideos(pinned: FeaturedVideo[], feed: FeaturedVideo[]): FeaturedVideo[] {
  const seen = new Set(pinned.map((video) => `${video.provider}:${video.id}`));
  return [...pinned, ...feed.filter((video) => !seen.has(`${video.provider}:${video.id}`))];
}
