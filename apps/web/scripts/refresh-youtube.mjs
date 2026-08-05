/**
 * Refresh the committed snapshot of the YouTube feed.
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
 * feed on every build and uses it when it works, but falls back to this file
 * instead of to nothing. The worst case degrades from "no videos at all" to
 * "the videos from the last successful refresh".
 *
 * This script fails LOUDLY on error, unlike the build-time fetch — the whole
 * point is to notice when it did not work.
 */
import { writeFile } from 'node:fs/promises';

const CHANNEL_ID = 'UCDM5XlH9kA65lLmjrHyspfw';
const LIMIT = 12;
const OUT = 'src/data/youtube-feed.json';

const decode = (value) =>
  value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

const get = (url, accept) => fetch(url, { headers: { accept, 'user-agent': UA } });

/**
 * Source 1 — the Atom feed. Preferred: clean structure and real publish dates.
 */
async function fromFeed() {
  const response = await get(
    `https://www.youtube.com/feeds/videos.xml?channel_id=${CHANNEL_ID}`,
    'application/atom+xml,application/xml',
  );
  if (!response.ok) throw new Error(`feed HTTP ${response.status}`);

  const xml = await response.text();
  const videos = [];
  for (const entry of xml.split('<entry>').slice(1)) {
    const id = entry.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1];
    const title = entry.match(/<title>([\s\S]*?)<\/title>/)?.[1];
    const published = entry.match(/<published>([^<]+)<\/published>/)?.[1];
    // Used for VideoObject structured data, which requires a description.
    const description = entry.match(/<media:description>([\s\S]*?)<\/media:description>/)?.[1];
    if (!id || !title) continue;
    videos.push({
      id,
      title: decode(title.trim()),
      published: published ?? '',
      description: description ? decode(description.trim()).slice(0, 300) : '',
    });
    if (videos.length >= LIMIT) break;
  }
  if (videos.length === 0) throw new Error('feed had no entries');
  return videos;
}

/**
 * Source 2 — the channel's /videos page, plus one watch page per upload.
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
 * uploads run occasionally from a laptop.
 */
async function fromChannelPage() {
  const response = await get('https://www.youtube.com/@QaUlew/videos', 'text/html');
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
      title: decode(title),
      published: watch.match(/"publishDate":"([^"]*)"/)?.[1] ?? '',
      description: decode(description).slice(0, 300),
    });
  }

  if (videos.length === 0) throw new Error('no watch pages yielded a title');

  // Newest first, matching the feed's ordering.
  return videos.sort((a, b) => (a.published < b.published ? 1 : -1));
}

/** Try each source in order, retrying the whole chain with backoff. */
async function collect(attempts = 3) {
  const problems = [];

  for (let attempt = 1; attempt <= attempts; attempt++) {
    for (const [name, source] of [
      ['feed', fromFeed],
      ['channel page', fromChannelPage],
    ]) {
      try {
        const videos = await source();
        console.log(`  source: ${name} (attempt ${attempt})`);
        return videos;
      } catch (error) {
        problems.push(`attempt ${attempt} ${name}: ${error.message}`);
      }
    }
    if (attempt < attempts) await new Promise((r) => setTimeout(r, attempt * 4000));
  }

  throw new Error(
    `could not reach any source.\n  ${problems.join('\n  ')}\n\n` +
      `YouTube answers 404 when it rate limits, so this usually means "try again\n` +
      `in a few minutes" rather than "the channel is gone". The existing snapshot\n` +
      `is left untouched, so nothing is lost.`,
  );
}

const videos = await collect();

await writeFile(
  OUT,
  `${JSON.stringify(
    {
      note: 'Committed snapshot of the YouTube feed. Refresh with: pnpm --filter @qa-ulew/web content:youtube',
      fetchedAt: new Date().toISOString(),
      videos,
    },
    null,
    2,
  )}\n`,
  'utf8',
);

console.log(`wrote ${videos.length} videos to ${OUT}`);
for (const v of videos) console.log(`  ${v.id}  ${v.title}`);
