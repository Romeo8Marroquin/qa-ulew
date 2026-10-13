/**
 * `lib/youtube-feed.ts` is the half of the YouTube pipeline that two runtimes
 * share: Node during `astro build`, and the Workers runtime inside
 * `functions/api/videos.ts` on every cache miss.
 *
 * That is why it is tested on its own rather than only through `lib/youtube.ts`.
 * The Pages Function is bundled from the repository root and cannot be loaded
 * by Vitest through the Astro resolver, so these tests are the only ones that
 * cover the logic it runs — and both callers must agree, or the grid would
 * change under a visitor for no reason a second after load.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  buildCatalog,
  type CatalogInput,
  channelFeedUrl,
  decodeEntities,
  type Embeddability,
  type FeedVideo,
  fetchLive,
  mergePopular,
  parseFeed,
  parseLive,
  playlistFeedUrl,
  popularPlaylists,
  probeEmbeddable,
} from '~/lib/youtube-feed';

const entry = (parts: string): string => `<entry>${parts}</entry>`;

const video = (id: string, overrides: Partial<FeedVideo> = {}): FeedVideo => ({
  id,
  title: `Title ${id}`,
  published: '2026-01-01T00:00:00+00:00',
  description: '',
  views: null,
  ...overrides,
});

describe('decodeEntities', () => {
  it('decodes every entity the Atom feed escapes', () => {
    expect(decodeEntities('&lt;a&gt; &quot;b&quot; &#39;c&apos; &amp;')).toBe(`<a> "b" 'c' &`);
  });

  it('unescapes &amp; last, so &amp;lt; survives as text', () => {
    // Doing it first would turn `&amp;lt;` into `<` — a double-decode that
    // silently rewrites a title containing a literal entity.
    expect(decodeEntities('&amp;lt;')).toBe('&lt;');
  });

  it('leaves a plain string alone', () => {
    expect(decodeEntities('Sololá 2026')).toBe('Sololá 2026');
  });
});

describe('parseFeed', () => {
  it('reads id, title, published date and description', () => {
    const xml = entry(
      '<yt:videoId>abc</yt:videoId><title>En vivo</title>' +
        '<published>2026-08-06T21:42:19+00:00</published>' +
        '<media:description>Desde Sololá</media:description>',
    );

    expect(parseFeed(xml, 6)).toEqual([
      {
        id: 'abc',
        title: 'En vivo',
        published: '2026-08-06T21:42:19+00:00',
        description: 'Desde Sololá',
        views: null,
      },
    ]);
  });

  it('defaults published and description when the entry omits them', () => {
    const xml = entry('<yt:videoId>abc</yt:videoId><title>Sin extras</title>');

    expect(parseFeed(xml, 6)).toEqual([
      { id: 'abc', title: 'Sin extras', published: '', description: '', views: null },
    ]);
  });

  it('decodes entities in both the title and the description', () => {
    const xml = entry(
      '<yt:videoId>abc</yt:videoId><title>Fiesta &amp; tradici&#39;on</title>' +
        '<media:description>&quot;Vivo&quot;</media:description>',
    );

    const [parsed] = parseFeed(xml, 6);
    expect(parsed?.title).toBe(`Fiesta & tradici'on`);
    expect(parsed?.description).toBe('"Vivo"');
  });

  it('trims surrounding whitespace', () => {
    const xml = entry(
      '<yt:videoId>abc</yt:videoId><title>\n  Espaciado \n</title>' +
        '<media:description>\n  Texto \n</media:description>',
    );

    const [parsed] = parseFeed(xml, 6);
    expect(parsed?.title).toBe('Espaciado');
    expect(parsed?.description).toBe('Texto');
  });

  it('caps a description at 300 characters', () => {
    // It exists only to feed VideoObject structured data; an entire YouTube
    // description with its wall of hashtags belongs in neither the page nor the
    // JSON payload the Worker returns.
    const xml = entry(
      `<yt:videoId>abc</yt:videoId><title>T</title><media:description>${'x'.repeat(400)}</media:description>`,
    );

    expect(parseFeed(xml, 6)[0]?.description).toHaveLength(300);
  });

  it('skips an entry with no id and one with no title', () => {
    const xml =
      entry('<title>Sin id</title>') +
      entry('<yt:videoId>no-title</yt:videoId>') +
      entry('<yt:videoId>ok</yt:videoId><title>Completo</title>');

    expect(parseFeed(xml, 6).map((parsed) => parsed.id)).toEqual(['ok']);
  });

  it('stops at the limit', () => {
    const xml = Array.from({ length: 10 }, (_, index) =>
      entry(`<yt:videoId>id${index}</yt:videoId><title>T${index}</title>`),
    ).join('');

    expect(parseFeed(xml, 3)).toHaveLength(3);
  });

  it('returns nothing for a feed with no entries', () => {
    expect(parseFeed('<?xml version="1.0"?><feed><title>Canal</title></feed>', 6)).toEqual([]);
  });
});

describe('probeEmbeddable', () => {
  const ORIGIN = 'https://qa-ulew.tv';

  /**
   * The embed page, as YouTube serves it: the bootstrap JSON is inside a
   * <script>, so every quote arrives backslash escaped. The probe has to read
   * it in that form, which is the whole reason these fixtures are not tidy
   * JSON.
   */
  const embedPage = (status: string) =>
    `<!DOCTYPE html><html><body><script>var x = {\\"previewPlayabilityStatus\\":` +
    `{\\"status\\":\\"${status}\\",\\"reason\\":\\"Video no disponible\\"}};</script></body></html>`;

  /** Answers each call with the next page in the list, repeating the last. */
  const responds = (...pages: (string | null)[]) => {
    let call = 0;
    return vi.fn(async () => {
      const page = pages[Math.min(call, pages.length - 1)];
      call += 1;
      return {
        ok: page !== null,
        text: async () => page ?? '',
      } as Response;
    }) as unknown as typeof fetch;
  };

  const serves = (status: string) => responds(embedPage(status));

  it('asks the embed page for the right video, as this site', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => embedPage('OK') }));

    await probeEmbeddable('abc123', ORIGIN, fetchMock as unknown as typeof fetch);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://www.youtube-nocookie.com/embed/abc123');
    // The verdict is per embedding site. Without this header YouTube answers
    // "error 153" for every video, including ones that play perfectly.
    expect((init.headers as Record<string, string>).referer).toBe(ORIGIN);
  });

  it('reads OK as embeddable, in a single request', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, text: async () => embedPage('OK') }));

    await expect(probeEmbeddable('a', ORIGIN, fetchMock as unknown as typeof fetch)).resolves.toBe(
      'embeddable',
    );
    // The happy path is every video on a healthy build. It must not double.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('reads a confirmed UNPLAYABLE as blocked', async () => {
    // Covers both reasons at once: the owner disabling embedding, and a rights
    // holder blocking playback of the content inside the video. The page says
    // UNPLAYABLE for both, and the tile answer is the same either way.
    await expect(probeEmbeddable('a', ORIGIN, serves('UNPLAYABLE'))).resolves.toBe('blocked');
  });

  it('reads a confirmed ERROR as gone', async () => {
    await expect(probeEmbeddable('a', ORIGIN, serves('ERROR'))).resolves.toBe('gone');
  });

  it('reads a confirmed LOGIN_REQUIRED as gone', async () => {
    // A private or age-restricted video. Nothing we can render.
    await expect(probeEmbeddable('a', ORIGIN, serves('LOGIN_REQUIRED'))).resolves.toBe('gone');
  });

  it('reads an unrecognised status as embeddable rather than degrading the tile', async () => {
    // YouTube is free to add one. Inventing a meaning for it is how a working
    // video silently stops playing.
    await expect(probeEmbeddable('a', ORIGIN, serves('SOMETHING_NEW'))).resolves.toBe('embeddable');
  });

  it('reads a page with no verdict in it as embeddable', async () => {
    // A consent interstitial, a throttling page, or a markup change. None of
    // them are evidence about the video.
    await expect(probeEmbeddable('a', ORIGIN, responds('<html>nope</html>'))).resolves.toBe(
      'embeddable',
    );
  });

  it('reads a failed response as embeddable', async () => {
    // A 429 or a 500 says nothing about the video, only about the probe.
    await expect(probeEmbeddable('a', ORIGIN, responds(null))).resolves.toBe('embeddable');
  });

  it('survives the request throwing', async () => {
    const boom = vi.fn(async () => {
      throw new Error('offline');
    });

    await expect(probeEmbeddable('a', ORIGIN, boom as unknown as typeof fetch)).resolves.toBe(
      'embeddable',
    );
  });

  describe('a bad verdict has to be confirmed', () => {
    // The embed page is far steadier than the oEmbed endpoint this replaced,
    // but steadier is not proven, and the two wrong answers are not equally
    // cheap: `blocked` turns a working video into a plain link, `gone` removes
    // it from the page.

    it('does not trust an UNPLAYABLE that a second probe contradicts', async () => {
      await expect(
        probeEmbeddable('a', ORIGIN, responds(embedPage('UNPLAYABLE'), embedPage('OK'))),
      ).resolves.toBe('embeddable');
    });

    it('does not trust an ERROR that a second probe contradicts', async () => {
      await expect(
        probeEmbeddable('a', ORIGIN, responds(embedPage('ERROR'), embedPage('OK'))),
      ).resolves.toBe('embeddable');
    });

    it('resolves two different bad verdicts in favour of the video', async () => {
      await expect(
        probeEmbeddable('a', ORIGIN, responds(embedPage('UNPLAYABLE'), embedPage('ERROR'))),
      ).resolves.toBe('embeddable');
      await expect(
        probeEmbeddable('a', ORIGIN, responds(embedPage('ERROR'), embedPage('UNPLAYABLE'))),
      ).resolves.toBe('embeddable');
    });

    it('re-checks exactly once, not in a loop', async () => {
      const fetchMock = vi.fn(async () => ({
        ok: true,
        text: async () => embedPage('UNPLAYABLE'),
      }));

      await probeEmbeddable('a', ORIGIN, fetchMock as unknown as typeof fetch);

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});

describe('parseFeed — view counts', () => {
  it('reads the count from media:statistics', () => {
    const xml = entry(
      '<yt:videoId>abc</yt:videoId><title>T</title>' +
        '<media:community><media:starRating count="0"/><media:statistics views="1234"/></media:community>',
    );

    expect(parseFeed(xml, 6)[0]?.views).toBe(1234);
  });

  it('keeps zero as zero', () => {
    // A brand-new stream really has 0 views. That is a count, not an absence.
    const xml = entry('<yt:videoId>abc</yt:videoId><title>T</title><media:statistics views="0"/>');

    expect(parseFeed(xml, 6)[0]?.views).toBe(0);
  });

  it('reports an entry without statistics as unknown, not as zero', () => {
    expect(
      parseFeed(entry('<yt:videoId>abc</yt:videoId><title>T</title>'), 6)[0]?.views,
    ).toBeNull();
  });
});

describe('feed URLs', () => {
  it('builds the uploads feed for a channel', () => {
    expect(channelFeedUrl('UCabc')).toBe(
      'https://www.youtube.com/feeds/videos.xml?channel_id=UCabc',
    );
  });

  it('builds a playlist feed, encoding the id', () => {
    expect(playlistFeedUrl('UU a&b')).toBe(
      'https://www.youtube.com/feeds/videos.xml?playlist_id=UU%20a%26b',
    );
  });
});

describe('popularPlaylists', () => {
  it('derives both popular playlists from the channel id', () => {
    // The channel uploads almost only live streams, so UUPV is the one that
    // exists for it today. A channel with ordinary videos has UULP as well.
    expect(popularPlaylists('UCDM5XlH9kA65lLmjrHyspfw')).toEqual([
      'UULPDM5XlH9kA65lLmjrHyspfw',
      'UUPVDM5XlH9kA65lLmjrHyspfw',
    ]);
  });

  it('derives nothing from an id that is not a channel id', () => {
    // Swapping a prefix that is not there would ask YouTube for a playlist
    // belonging to nobody.
    expect(popularPlaylists('')).toEqual([]);
    expect(popularPlaylists('@QaUlew')).toEqual([]);
  });
});

describe('mergePopular', () => {
  it('orders by views, most viewed first', () => {
    const merged = mergePopular(
      [[video('low', { views: 3 }), video('high', { views: 90 })], [video('mid', { views: 40 })]],
      10,
    );

    expect(merged.map((entry) => entry.id)).toEqual(['high', 'mid', 'low']);
  });

  it('lists a video in several playlists once, at its higher count', () => {
    // Each feed carries its own snapshot of the count, taken at its own time.
    const merged = mergePopular(
      [[video('a', { views: 10 })], [video('a', { views: 12 })], [video('a', { views: 11 })]],
      10,
    );

    expect(merged).toEqual([video('a', { views: 12 })]);
  });

  it('puts unknown counts last and keeps feed order between equals', () => {
    const merged = mergePopular(
      [
        [
          video('unknown'),
          video('first', { views: 5 }),
          video('also-unknown'),
          video('second', { views: 5 }),
        ],
      ],
      10,
    );

    expect(merged.map((entry) => entry.id)).toEqual(['first', 'second', 'unknown', 'also-unknown']);
  });

  it('prefers a known count over an unknown one for the same video', () => {
    const merged = mergePopular([[video('a')], [video('a', { views: 4 })], [video('a')]], 10);

    expect(merged).toEqual([video('a', { views: 4 })]);
  });

  it('stops at the limit', () => {
    const many = Array.from({ length: 20 }, (_, index) => video(`v${index}`, { views: index }));

    expect(mergePopular([many], 15)).toHaveLength(15);
  });

  it('merges nothing into nothing', () => {
    expect(mergePopular([], 15)).toEqual([]);
    expect(mergePopular([[], []], 15)).toEqual([]);
  });
});

const CHANNEL = 'UCDM5XlH9kA65lLmjrHyspfw';

/**
 * The `/live` page in the shape YouTube serves it: a canonical link in the
 * head, and much later the player bootstrap with `videoDetails` in plain JSON.
 */
const livePage = ({
  id = 'abcdefghijk',
  live = true,
  channel = CHANNEL,
  title = 'Desfile en vivo',
  canonical = `https://www.youtube.com/watch?v=${id}`,
  description = true,
}: Partial<{
  id: string;
  live: boolean;
  channel: string;
  title: string | null;
  canonical: string;
  description: boolean;
}> = {}): string =>
  `<html><head><link rel="canonical" href="${canonical}"></head><body>` +
  `<script>var ytInitialPlayerResponse = {"videoDetails":{"videoId":"${id}",` +
  (title === null ? '' : `"title":${JSON.stringify(title)},`) +
  `"lengthSeconds":"0",${live ? '"isLive":true,' : '"isUpcoming":true,'}` +
  `"keywords":["Sololá","en vivo"],"channelId":"${channel}","isOwnerViewing":false` +
  (description ? `,"shortDescription":"Transmisión"` : '') +
  `}};</script></body></html>`;

describe('parseLive', () => {
  it('reads the stream that is on air', () => {
    expect(parseLive(livePage(), CHANNEL)).toEqual({ id: 'abcdefghijk', title: 'Desfile en vivo' });
  });

  it('decodes the JSON escapes in the title', () => {
    const page = livePage({ title: 'Fiesta "patronal" á \\ fin' });

    expect(parseLive(page, CHANNEL)?.title).toBe('Fiesta "patronal" á \\ fin');
  });

  it('ignores a stream that is only scheduled', () => {
    // `isUpcoming`, not `isLive`. A tile saying "en vivo" for something that
    // starts on Friday is worse than no tile.
    expect(parseLive(livePage({ live: false }), CHANNEL)).toBeNull();
  });

  it('ignores a stream belonging to another channel', () => {
    expect(parseLive(livePage({ channel: 'UCsomeoneelse' }), CHANNEL)).toBeNull();
  });

  it('finds nothing on a page with no player', () => {
    expect(parseLive('<html><head></head></html>', CHANNEL)).toBeNull();
  });

  it('rejects an id that is not a video id', () => {
    expect(parseLive(livePage({ id: 'short' }), CHANNEL)).toBeNull();
  });

  it('rejects a stream with no title, or a blank one', () => {
    // The title names the play button and the iframe. A tile without one
    // cannot be rendered accessibly, so it is not rendered.
    expect(parseLive(livePage({ title: null }), CHANNEL)).toBeNull();
    expect(parseLive(livePage({ title: '   ' }), CHANNEL)).toBeNull();
  });

  it('rejects a title that is not valid JSON', () => {
    const broken = livePage().replace('"title":"Desfile en vivo"', '"title":"bad \\x escape"');

    expect(parseLive(broken, CHANNEL)).toBeNull();
  });

  it('still reads the object when the field after it has moved', () => {
    // `shortDescription` is only used to find where videoDetails ends.
    expect(parseLive(livePage({ description: false }), CHANNEL)?.id).toBe('abcdefghijk');
  });
});

describe('fetchLive', () => {
  /**
   * A response whose body arrives in the given chunks, recording how many were
   * pulled and whether the reader gave up — which is the whole point of
   * streaming a 1.3 MB page.
   */
  const streamed = (chunks: string[], { failCancel = false } = {}) => {
    const encoder = new TextEncoder();
    const state = { pulled: 0, cancelled: false };
    const body = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          const next = chunks[state.pulled];
          state.pulled += 1;
          if (next === undefined) controller.close();
          else controller.enqueue(encoder.encode(next));
        },
        cancel() {
          state.cancelled = true;
          if (failCancel) throw new Error('cancel failed');
        },
      },
      // Pull only when the reader asks. The default prefetches one chunk
      // ahead, which would count a chunk the code never read.
      { highWaterMark: 0 },
    );
    return { response: new Response(body), state };
  };

  const serving = (response: Response) => vi.fn(async () => response) as unknown as typeof fetch;

  /** Split a string into pieces of `size`, so markers straddle chunk edges. */
  const pieces = (text: string, size: number): string[] =>
    Array.from({ length: Math.ceil(text.length / size) }, (_, index) =>
      text.slice(index * size, (index + 1) * size),
    );

  it('asks the channel live page, as a browser', async () => {
    const { response } = streamed([livePage()]);
    const fetchMock = vi.fn(async () => response);

    await fetchLive(CHANNEL, fetchMock as unknown as typeof fetch);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://www.youtube.com/channel/${CHANNEL}/live`);
    expect((init.headers as Record<string, string>)['user-agent']).toContain('Mozilla/5.0');
  });

  it('reads a live stream even when every marker straddles a chunk edge', async () => {
    // Seven-byte chunks cut every marker in the page in two at least once.
    const { response } = streamed(pieces(livePage(), 7));

    await expect(fetchLive(CHANNEL, serving(response))).resolves.toEqual({
      id: 'abcdefghijk',
      title: 'Desfile en vivo',
    });
  });

  it('stops at the canonical link when the channel is not on air', async () => {
    // The real page is ~1.3 MB with the player ~800 KB in. Not live is
    // knowable from the first few KB, and on a 10 ms CPU budget the rest is
    // not worth decoding.
    const head = '<html><head><link rel="canonical" href="https://www.youtube.com/channel/UCx">';
    const { response, state } = streamed([head, 'x'.repeat(1000), 'never read', 'never read']);

    await expect(fetchLive(CHANNEL, serving(response))).resolves.toBeNull();
    expect(state.pulled).toBe(1);
    expect(state.cancelled).toBe(true);
  });

  it('waits for the canonical href to close before judging it', async () => {
    // Cut mid-URL, the first half has no "/watch?v=" yet. Judging there would
    // call a live channel "not live".
    const page = livePage();
    const cut = page.indexOf('/watch?v=') + 3;
    const { response } = streamed([page.slice(0, cut), page.slice(cut)]);

    await expect(fetchLive(CHANNEL, serving(response))).resolves.not.toBeNull();
  });

  it('stops once the player object is complete', async () => {
    const { response, state } = streamed([livePage(), 'rest of page', 'more', 'more']);

    await fetchLive(CHANNEL, serving(response));

    expect(state.pulled).toBe(1);
    expect(state.cancelled).toBe(true);
  });

  it('reads to the end when there is no canonical link at all', async () => {
    // If YouTube changes the tag, the early exit stops firing and the parse
    // still runs on the whole page: slower, never wrong.
    const page = livePage({ description: false }).replace(/<link[^>]*>/, '');
    const { response } = streamed(pieces(page, 50));

    await expect(fetchLive(CHANNEL, serving(response))).resolves.toEqual({
      id: 'abcdefghijk',
      title: 'Desfile en vivo',
    });
  });

  it('gives up on a page far larger than the real one', async () => {
    const { response, state } = streamed(['x'.repeat(4_000_001), 'more', 'more']);

    await expect(fetchLive(CHANNEL, serving(response))).resolves.toBeNull();
    expect(state.pulled).toBe(1);
  });

  it('survives the stream refusing to cancel', async () => {
    const { response } = streamed([livePage(), 'more'], { failCancel: true });

    await expect(fetchLive(CHANNEL, serving(response))).resolves.not.toBeNull();
  });

  it('reads a failed response as not live', async () => {
    const fetchMock = vi.fn(async () => new Response('nope', { status: 404 }));

    await expect(fetchLive(CHANNEL, fetchMock as unknown as typeof fetch)).resolves.toBeNull();
  });

  it('reads a response without a body as not live', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, body: null }) as Response);

    await expect(fetchLive(CHANNEL, fetchMock as unknown as typeof fetch)).resolves.toBeNull();
  });

  it('reads a request that throws as not live', async () => {
    const boom = vi.fn(async () => {
      throw new Error('offline');
    });

    await expect(fetchLive(CHANNEL, boom as unknown as typeof fetch)).resolves.toBeNull();
  });
});

describe('buildCatalog', () => {
  // Takes the id it is asked about, so a mock of it records which ones were.
  const always =
    (verdict: Embeddability = 'embeddable') =>
    async (_id: string) =>
      verdict;

  const input = (overrides: Partial<CatalogInput> = {}): CatalogInput => ({
    recent: [],
    popular: [],
    live: null,
    limit: 15,
    probe: always(),
    ...overrides,
  });

  const ids = (videos: { id: string }[]) => videos.map((entry) => entry.id);

  it('passes both lists through with their verdicts', async () => {
    const catalog = await buildCatalog(
      input({ recent: [video('a'), video('b')], popular: [video('p', { views: 9 })] }),
    );

    expect(catalog.recent).toEqual([
      { ...video('a'), live: false, embeddable: true },
      { ...video('b'), live: false, embeddable: true },
    ]);
    expect(catalog.popular).toEqual([
      { ...video('p', { views: 9 }), live: false, embeddable: true },
    ]);
  });

  describe('the live stream', () => {
    it('moves it to the top and flags it', async () => {
      // The bug: the feed orders by when a broadcast was created, so the
      // stream on air sat under older uploads.
      const catalog = await buildCatalog(
        input({
          recent: [video('older'), video('onair'), video('oldest')],
          live: { id: 'onair', title: 'En vivo ahora' },
        }),
      );

      expect(ids(catalog.recent)).toEqual(['onair', 'older', 'oldest']);
      expect(catalog.recent.map((entry) => entry.live)).toEqual([true, false, false]);
      // The feed's own entry is kept, with its title and date.
      expect(catalog.recent[0]?.title).toBe('Title onair');
    });

    it('adds it from the live page when the feed has not caught up', async () => {
      const catalog = await buildCatalog(
        input({ recent: [video('a')], live: { id: 'new', title: 'Recién empezó' } }),
      );

      expect(catalog.recent[0]).toEqual({
        id: 'new',
        title: 'Recién empezó',
        published: '',
        description: '',
        views: null,
        live: true,
        embeddable: true,
      });
      expect(ids(catalog.recent)).toEqual(['new', 'a']);
    });

    it('keeps the list within the limit when it adds one', async () => {
      const catalog = await buildCatalog(
        input({
          recent: [video('a'), video('b')],
          live: { id: 'new', title: 'T' },
          limit: 2,
        }),
      );

      expect(ids(catalog.recent)).toEqual(['new', 'a']);
    });

    it('flags it in the popular list too', async () => {
      const catalog = await buildCatalog(
        input({ popular: [video('x'), video('onair')], live: { id: 'onair', title: 'T' } }),
      );

      expect(catalog.popular.map((entry) => entry.live)).toEqual([false, true]);
    });

    it('is never dropped as gone', async () => {
      // We have just watched it be on air. The embed page can disagree for
      // reasons of region or Referer, not because the stream is not there.
      const catalog = await buildCatalog(
        input({
          recent: [video('onair'), video('a')],
          live: { id: 'onair', title: 'T' },
          probe: async (id) => (id === 'onair' ? 'gone' : 'embeddable'),
        }),
      );

      expect(ids(catalog.recent)).toEqual(['onair', 'a']);
      expect(catalog.recent[0]?.embeddable).toBe(true);
    });

    it('cannot outvote a unanimous "gone" from everything else', async () => {
      // Unanimity is judged before the live exception. Otherwise one live
      // stream would make a throttled build believe every other probe, and
      // empty the section.
      const catalog = await buildCatalog(
        input({
          recent: [video('onair'), video('a'), video('b')],
          live: { id: 'onair', title: 'T' },
          probe: always('gone'),
        }),
      );

      expect(ids(catalog.recent)).toEqual(['onair', 'a', 'b']);
      expect(catalog.recent.every((entry) => entry.embeddable)).toBe(true);
    });
  });

  describe('probing', () => {
    it('drops a gone video and marks a blocked one', async () => {
      const catalog = await buildCatalog(
        input({
          recent: [video('gone'), video('blocked'), video('fine')],
          probe: async (id) =>
            id === 'gone' ? 'gone' : id === 'blocked' ? 'blocked' : 'embeddable',
        }),
      );

      expect(ids(catalog.recent)).toEqual(['blocked', 'fine']);
      expect(catalog.recent.map((entry) => entry.embeddable)).toEqual([false, true]);
    });

    it('drops a gone video from both lists', async () => {
      const catalog = await buildCatalog(
        input({
          recent: [video('gone'), video('a')],
          popular: [video('gone'), video('b')],
          probe: async (id) => (id === 'gone' ? 'gone' : 'embeddable'),
        }),
      );

      expect(ids(catalog.popular)).toEqual(['b']);
    });

    it('keeps everything, embeddable, when every probe says gone', async () => {
      // Unanimity means rate limiting, or a Referer that did not survive the
      // runtime — not a channel that emptied itself.
      const catalog = await buildCatalog(
        input({ recent: [video('a'), video('b')], probe: always('gone') }),
      );

      expect(catalog.recent.map((entry) => entry.embeddable)).toEqual([true, true]);
    });

    it('asks once about a video that is in both lists', async () => {
      const probe = vi.fn(always());

      await buildCatalog(
        input({ recent: [video('a'), video('b')], popular: [video('b'), video('c')], probe }),
      );

      expect(probe.mock.calls.map(([id]) => id)).toEqual(['a', 'b', 'c']);
    });

    it('probes within the budget, most visible first, and says so', async () => {
      // The Function's subrequest ceiling. What it could not afford to ask
      // about comes back without a verdict, so a page that already shows that
      // tile keeps the shape it has rather than being handed a guess.
      const probe = vi.fn(always('blocked'));

      const catalog = await buildCatalog(
        input({ recent: [video('a'), video('b')], popular: [video('c')], probe, budget: 2 }),
      );

      expect(probe.mock.calls.map(([id]) => id)).toEqual(['a', 'b']);
      expect(catalog.recent.map((entry) => entry.embeddable)).toEqual([false, false]);
      expect(catalog.popular[0]?.embeddable).toBeUndefined();
    });

    it('leaves unprobed videos unprobed even when the probes were unanimous', async () => {
      const catalog = await buildCatalog(
        input({ recent: [video('a'), video('b')], probe: always('gone'), budget: 1 }),
      );

      expect(catalog.recent.map((entry) => entry.embeddable)).toEqual([true, undefined]);
    });
  });

  it('cuts the popular list to the limit', async () => {
    const popular = Array.from({ length: 5 }, (_, index) => video(`p${index}`));

    const catalog = await buildCatalog(input({ popular, limit: 3 }));

    expect(ids(catalog.popular)).toEqual(['p0', 'p1', 'p2']);
  });

  it('handles empty lists', async () => {
    await expect(buildCatalog(input())).resolves.toEqual({ recent: [], popular: [] });
  });
});
