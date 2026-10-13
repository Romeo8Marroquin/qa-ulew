/**
 * Refresh the committed snapshot of the YouTube feeds.
 *
 *   pnpm --filter @qa-ulew/web content:youtube
 *
 * WHY A SNAPSHOT EXISTS AT ALL
 *
 * YouTube's public Atom feed needs no API key, which is why it was chosen —
 * but it is rate limited, and when it throttles it answers **404**, not 429.
 * An unlucky build therefore sees "channel not found", falls back to nothing,
 * and silently deploys a landing page with an empty videos section. That has
 * already happened once here: the same channel id returned videos, then 404
 * from the same machine half an hour later.
 *
 * Cloudflare Pages builds from shared IPs, so they are more likely to be
 * throttled than a laptop, not less.
 *
 * The snapshot removes that failure mode. `lib/youtube.ts` still tries the live
 * feeds on every build and uses them when they work, but falls back to this
 * file instead of to nothing. The worst case degrades from "no videos at all"
 * to "the videos from the last successful refresh".
 *
 * It holds both lists the page shows: `videos` (the newest uploads) and
 * `popular` (the most viewed). Each is refreshed independently, and a list
 * that cannot be fetched keeps its previous contents rather than emptying.
 *
 * The parser and the channel id are imported from the site's own source —
 * Node strips TypeScript types natively — so this script cannot disagree with
 * the build about what a feed says. It used to carry its own copy of both.
 *
 * This script fails LOUDLY on error, unlike the build-time fetch — the whole
 * point is to notice when it did not work.
 */
import { readFile, writeFile } from 'node:fs/promises';

import { YOUTUBE } from '../src/config/site.ts';
import {
  BROWSER_UA,
  channelFeedUrl,
  decodeEntities,
  mergePopular,
  parseFeed,
  playlistFeedUrl,
  popularPlaylists,
} from '../src/lib/youtube-feed.ts';

const OUT = 'src/data/youtube-feed.json';
const LIMIT = YOUTUBE.limit;

const get = (url, accept) => fetch(url, { headers: { accept, 'user-agent': BROWSER_UA } });

async function feed(url) {
  const response = await get(url, 'application/atom+xml,application/xml');
  if (!response.ok) throw new Error(`feed HTTP ${response.status}`);
  return parseFeed(await response.text(), LIMIT);
}

/**
 * Recent, source 1 — the Atom feed. Preferred: clean structure, real publish
 * dates and view counts.
 */
async function fromFeed() {
  const videos = await feed(channelFeedUrl(YOUTUBE.channelId));
  if (videos.length === 0) throw new Error('feed had no entries');
  return videos;
}

/**
 * Recent, source 2 — the channel's /videos page, plus one watch page per upload.
 *
 * The Atom feed is rate limited far more aggressively than YouTube's HTML
 * pages, and when throttled it answers 404. This path exists so a throttled
 * feed cannot leave the snapshot empty.
 *
 * It deliberately does NOT read YouTube's internal `ytInitialData` JSON. That
 * shape changes without notice — it moved to `lockupViewModel` during this
 * project, which broke a first attempt at exactly that. Instead it uses two
 * anchors that have been stable for years:
 *
 *   ids     the thumbnail URL, i.ytimg.com/vi/<ID>/
 *   title   the watch page's <meta name="title">, with og:title as backup
 *
 * The cost is one extra request per video, which is fine for a handful of
 * uploads run occasionally from a laptop. It learns no view counts.
 */
async function fromChannelPage() {
  const response = await get(`https://www.youtube.com/${YOUTUBE.handle}/videos`, 'text/html');
  if (!response.ok) throw new Error(`channel page HTTP ${response.status}`);

  const html = await response.text();
  const ids = [
    ...new Set([...html.matchAll(/i\.ytimg\.com\/vi\/([A-Za-z0-9_-]{11})\//g)].map((m) => m[1])),
  ].slice(0, LIMIT);

  if (ids.length === 0) throw new Error('channel page contained no uploads');

  const videos = [];
  for (const id of ids) {
    const page = await get(`https://www.youtube.com/watch?v=${id}`, 'text/html');
    if (!page.ok) continue;
    const watch = await page.text();

    const title =
      watch.match(/<meta\s+name="title"\s+content="([^"]*)"/)?.[1] ??
      watch.match(/<meta\s+property="og:title"\s+content="([^"]*)"/)?.[1];
    if (!title) continue;

    const description =
      watch.match(/<meta\s+name="description"\s+content="([^"]*)"/)?.[1] ??
      watch.match(/<meta\s+property="og:description"\s+content="([^"]*)"/)?.[1] ??
      '';

    videos.push({
      id,
      title: decodeEntities(title),
      published: watch.match(/"publishDate":"([^"]*)"/)?.[1] ?? '',
      description: decodeEntities(description).slice(0, 300),
      views: null,
    });
  }

  if (videos.length === 0) throw new Error('no watch pages yielded a title');

  // Newest first, matching the feed's ordering.
  return videos.sort((a, b) => (a.published < b.published ? 1 : -1));
}

/**
 * Most viewed, from the channel's popular playlists. One that does not exist
 * for this channel answers 404 like a throttled one, so it is only a failure
 * when none of them answers.
 */
async function fromPopularPlaylists() {
  const lists = [];
  for (const id of popularPlaylists(YOUTUBE.channelId)) {
    try {
      lists.push(await feed(playlistFeedUrl(id)));
    } catch {
      // Expected for a playlist the channel does not have.
    }
  }
  const videos = mergePopular(lists, LIMIT);
  if (videos.length === 0) throw new Error('no popular playlist answered');
  return videos;
}

/** Try each source in order, retrying the whole chain with backoff. */
async function collect(name, sources, attempts = 3) {
  const problems = [];

  for (let attempt = 1; attempt <= attempts; attempt++) {
    for (const [source, run] of sources) {
      try {
        const videos = await run();
        console.log(`  ${name}: ${source} (attempt ${attempt})`);
        return videos;
      } catch (error) {
        problems.push(`attempt ${attempt} ${source}: ${error.message}`);
      }
    }
    if (attempt < attempts) await new Promise((r) => setTimeout(r, attempt * 4000));
  }

  console.error(
    `could not refresh ${name}.\n  ${problems.join('\n  ')}\n\n` +
      `YouTube answers 404 when it rate limits, so this usually means "try again\n` +
      `in a few minutes" rather than "the channel is gone".`,
  );
  return null;
}

const previous = JSON.parse(await readFile(OUT, 'utf8').catch(() => '{}'));

const videos = await collect('recent', [
  ['feed', fromFeed],
  ['channel page', fromChannelPage],
]);
const popular = await collect('popular', [['popular playlists', fromPopularPlaylists]]);

// Both failed: nothing was learned, and the existing file stays untouched.
if (!videos && !popular) {
  throw new Error('nothing refreshed; the existing snapshot is left as it was');
}

await writeFile(
  OUT,
  `${JSON.stringify(
    {
      note: 'Committed snapshot of the YouTube feeds. Refresh with: pnpm --filter @qa-ulew/web content:youtube',
      fetchedAt: new Date().toISOString(),
      videos: videos ?? previous.videos ?? [],
      popular: popular ?? previous.popular ?? [],
    },
    null,
    2,
  )}\n`,
  'utf8',
);

console.log(`wrote ${OUT}`);
for (const [name, list] of [
  ['recent', videos],
  ['popular', popular],
]) {
  if (!list) {
    console.log(`  ${name}: kept the previous list`);
    continue;
  }
  console.log(`  ${name}: ${list.length} video(s)`);
  for (const v of list)
    console.log(`    ${v.id}  ${String(v.views ?? '-').padStart(6)}  ${v.title}`);
}
