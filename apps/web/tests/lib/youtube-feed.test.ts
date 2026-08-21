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
  applyVerdicts,
  decodeEntities,
  type Embeddability,
  type FeedVideo,
  parseFeed,
  probeEmbeddable,
} from '~/lib/youtube-feed';

const entry = (parts: string): string => `<entry>${parts}</entry>`;

const video = (id: string, overrides: Partial<FeedVideo> = {}): FeedVideo => ({
  id,
  title: `Title ${id}`,
  published: '2026-01-01T00:00:00+00:00',
  description: '',
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
      },
    ]);
  });

  it('defaults published and description when the entry omits them', () => {
    const xml = entry('<yt:videoId>abc</yt:videoId><title>Sin extras</title>');

    expect(parseFeed(xml, 6)).toEqual([
      { id: 'abc', title: 'Sin extras', published: '', description: '' },
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

describe('applyVerdicts', () => {
  const verdicts = (...list: Embeddability[]): Embeddability[] => list;

  it('keeps embeddable videos as they are', () => {
    expect(applyVerdicts([video('a')], verdicts('embeddable'))).toEqual([
      { ...video('a'), embeddable: true },
    ]);
  });

  it('marks a blocked video without dropping it', () => {
    // The video is fine, it just cannot play in our page — the tile has to
    // survive and link out.
    expect(applyVerdicts([video('a')], verdicts('blocked'))).toEqual([
      { ...video('a'), embeddable: false },
    ]);
  });

  it('drops a gone video when the other probes worked', () => {
    const result = applyVerdicts([video('a'), video('b')], verdicts('gone', 'embeddable'));

    expect(result.map((entry) => entry.id)).toEqual(['b']);
  });

  it('keeps everything, embeddable, when every probe says gone', () => {
    // Unanimity here means rate limiting, not a channel that emptied itself.
    // This is the guard that stops the check causing the outage it prevents.
    const result = applyVerdicts([video('a'), video('b')], verdicts('gone', 'gone'));

    expect(result).toEqual([
      { ...video('a'), embeddable: true },
      { ...video('b'), embeddable: true },
    ]);
  });

  it('assumes embeddable for a video with no verdict at all', () => {
    // Defensive: the two arrays are built together, so a length mismatch would
    // be a bug — but it must not be one that hides a video.
    const result = applyVerdicts([video('a'), video('b')], verdicts('blocked'));

    expect(result).toEqual([
      { ...video('a'), embeddable: false },
      { ...video('b'), embeddable: true },
    ]);
  });

  it('handles an empty list', () => {
    expect(applyVerdicts([], [])).toEqual([]);
  });
});
