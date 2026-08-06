import { YOUTUBE, type FeaturedVideo } from '~/config/site';
import snapshot from '~/data/youtube-feed.json';
import { applyVerdicts, type FeedVideo, parseFeed, probeEmbeddable } from '~/lib/youtube-feed';

/**
 * Build-time fetch of the channel's public YouTube Atom feed.
 *
 * Runs during `astro build`, never in the browser. The result is baked into
 * static HTML, so the page paints a correct video grid with no JavaScript and
 * there is no API key anywhere in the pipeline.
 *
 * It is baked, not final: `functions/api/videos.ts` re-fetches the same feed on
 * request and `src/scripts/video-feed.ts` reconciles the grid after load, so a
 * video deleted or a stream started since the last deploy is corrected for
 * anyone with JavaScript. This module is what everyone else sees, and what the
 * first paint shows before that lands.
 *
 * Design constraint that shapes this whole file: **a content fetch must never
 * be able to block a deploy.** If YouTube is slow, rate-limiting the build
 * runner, or briefly down, the build has to carry on and ship the manually
 * curated videos instead. Every failure path below returns a list rather than
 * throwing.
 */

const FEED_URL = 'https://www.youtube.com/feeds/videos.xml?channel_id=';
const TIMEOUT_MS = 8000;

/**
 * The committed snapshot, used when the live feed is unavailable.
 *
 * Refresh it with `pnpm --filter @qa-ulew/web content:youtube`.
 */
function fromSnapshot(): FeedVideo[] {
  return (snapshot.videos as FeedVideo[]).slice(0, YOUTUBE.limit);
}

/**
 * Latest entries from the configured channel, newest first.
 *
 * Tries the live feed, falls back to the committed snapshot, and never throws.
 *
 * The fallback is not paranoia. YouTube's public feed is rate limited, and when
 * it throttles it answers **404** rather than 429 — indistinguishable from a
 * deleted channel. Observed here: the same channel id served videos and then
 * 404'd from the same machine half an hour later. Cloudflare Pages builds from
 * shared IPs, so they are throttled more often, not less.
 *
 * Without the snapshot, one unlucky build silently deploys an empty videos
 * section. With it, the worst case is videos from the last refresh.
 */
async function fetchFeed(): Promise<FeedVideo[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(`${FEED_URL}${encodeURIComponent(YOUTUBE.channelId)}`, {
      signal: controller.signal,
      headers: {
        accept: 'application/atom+xml,application/xml',
        // A browser UA measurably reduces how often the feed throttles.
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      const fallback = fromSnapshot();
      console.warn(
        `[youtube] feed returned ${response.status} (rate limiting answers 404); ` +
          `using snapshot of ${fallback.length} video(s)`,
      );
      return fallback;
    }

    const live = parseFeed(await response.text(), YOUTUBE.limit);
    return live.length === 0 ? fromSnapshot() : live;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const fallback = fromSnapshot();
    console.warn(
      `[youtube] feed unavailable (${reason}); using snapshot of ${fallback.length} video(s)`,
    );
    return fallback;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Latest videos, with each one checked against oEmbed before it is rendered.
 *
 * The probe answers two questions the Atom feed cannot:
 *
 * 1. **Is it still there?** A deleted video vanishes from the feed, but not
 *    from the snapshot — so on a throttled build the page would resurrect it
 *    and show YouTube's *"La persona que subió el video lo quitó"* panel. A
 *    404 from oEmbed drops it here instead.
 * 2. **May we embed it?** If the owner disabled embedding, the iframe renders
 *    a grey error inside our layout. `embeddable: false` turns the tile into a
 *    link to YouTube, which works.
 *
 * Probes are failure-tolerant on purpose — see `probeEmbeddable` for a single
 * bad answer and `applyVerdicts` for a unanimously bad one — so this cannot
 * turn a working build into an empty page. The worst it can do is leave a tile
 * exactly as it would have been without the check.
 */
export async function fetchLatestVideos(): Promise<FeaturedVideo[]> {
  if (!YOUTUBE.channelId) return [];

  const videos = await fetchFeed();
  const verdicts = await Promise.all(videos.map((video) => probeEmbeddable(video.id)));

  return applyVerdicts(videos, verdicts).map((video) => ({
    provider: 'youtube' as const,
    id: video.id,
    title: video.title,
    embeddable: video.embeddable,
  }));
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
