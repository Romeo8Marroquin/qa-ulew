/**
 * `lib/youtube.ts` is the only module here that talks to the network, and its
 * governing rule is that **a content fetch must never be able to fail a
 * deploy**. Every test below is really one question: does this failure mode
 * still ship a page?
 *
 * The snapshot fallback matters more than it looks. YouTube's public feed
 * answers **404** when it rate-limits, which is indistinguishable from a
 * deleted channel — and Cloudflare Pages builds from shared IPs, so it is
 * throttled more often than a laptop is. Without the fallback, one unlucky
 * build silently deploys an empty videos section.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { YOUTUBE } from '~/config/site';
import snapshot from '~/data/youtube-feed.json';
import { fetchLatestVideos, mergeVideos } from '~/lib/youtube';

/** A minimal Atom document in the shape YouTube actually publishes. */
function feed(entries: { id?: string; title?: string; published?: string }[]): string {
  const body = entries
    .map((entry) => {
      const parts = [
        entry.id === undefined ? '' : `<yt:videoId>${entry.id}</yt:videoId>`,
        entry.title === undefined ? '' : `<title>${entry.title}</title>`,
        entry.published === undefined ? '' : `<published>${entry.published}</published>`,
      ];
      return `<entry>${parts.join('')}</entry>`;
    })
    .join('');
  return `<?xml version="1.0"?><feed><title>Channel</title>${body}</feed>`;
}

function ok(body: string): Response {
  return { ok: true, status: 200, text: async () => body } as Response;
}

const status = (code: number): Response =>
  ({ ok: code < 400, status: code, text: async () => '' }) as Response;

const isOembed = (url: string): boolean => url.includes('/oembed');

/**
 * A fetch that answers the Atom feed and the oEmbed probes differently.
 *
 * Every test in this file now makes two kinds of request — one for the feed and
 * one per video — and most of what is worth asserting lives in the gap between
 * them: a feed that works while the probes 404, or the reverse.
 */
function routed(feedResponse: () => Response, probe: (id: string) => Response) {
  return vi.fn(async (url: string) => {
    if (!isOembed(url)) return feedResponse();
    const id = decodeURIComponent(url).match(/[?&]v=([^&]+)/)?.[1] ?? '';
    return probe(id);
  });
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  // The module logs on every fallback. That is wanted in a build log and pure
  // noise in test output, so it is silenced and asserted on instead.
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('fetchLatestVideos — the happy path', () => {
  it('returns the feed entries, newest first, mapped to featured videos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ok(
          feed([
            { id: 'aaaaaaaaaaa', title: 'Primero', published: '2026-01-02T00:00:00+00:00' },
            { id: 'bbbbbbbbbbb', title: 'Segundo', published: '2026-01-01T00:00:00+00:00' },
          ]),
        ),
      ),
    );

    await expect(fetchLatestVideos()).resolves.toEqual([
      { provider: 'youtube', id: 'aaaaaaaaaaa', title: 'Primero', embeddable: true },
      { provider: 'youtube', id: 'bbbbbbbbbbb', title: 'Segundo', embeddable: true },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('requests the configured channel with a browser user-agent', async () => {
    // Not decoration: a browser UA measurably reduces how often the feed
    // throttles, which is the failure this whole module is built around.
    const fetchMock = vi.fn(async () => ok(feed([{ id: 'x', title: 'T' }])));
    vi.stubGlobal('fetch', fetchMock);

    await fetchLatestVideos();

    // The mock is untyped, so its recorded arguments come back as `[] | undefined`.
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain(encodeURIComponent(YOUTUBE.channelId));
    expect(url).toContain('youtube.com/feeds/videos.xml');
    expect((init.headers as Record<string, string>)['user-agent']).toContain('Mozilla/5.0');
    expect(init.signal).toBeDefined();
  });

  it('stops at the configured limit', async () => {
    const entries = Array.from({ length: YOUTUBE.limit + 4 }, (_, index) => ({
      id: `id${index}`,
      title: `Video ${index}`,
    }));
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(feed(entries))),
    );

    await expect(fetchLatestVideos()).resolves.toHaveLength(YOUTUBE.limit);
  });

  it('decodes the XML entities YouTube escapes in titles', async () => {
    // Titles routinely carry apostrophes and ampersands. `&amp;` is unescaped
    // last on purpose — doing it first would turn `&amp;lt;` into `<`.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ok(
          feed([{ id: 'a', title: 'Fiesta &amp; tradici&#39;on &lt;3 &quot;vivo&quot; &apos;24' }]),
        ),
      ),
    );

    const [video] = await fetchLatestVideos();
    expect(video?.title).toBe(`Fiesta & tradici'on <3 "vivo" '24`);
  });

  it('trims whitespace around a title', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(feed([{ id: 'a', title: '\n  Espaciado  \n' }]))),
    );

    const [video] = await fetchLatestVideos();
    expect(video?.title).toBe('Espaciado');
  });

  it('skips entries with no id or no title', async () => {
    // A malformed entry must be dropped, not rendered as a broken embed.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ok(
          feed([
            { title: 'Sin id' },
            { id: 'no-title' },
            { id: 'good', title: 'Completo', published: '2026-01-01T00:00:00+00:00' },
          ]),
        ),
      ),
    );

    await expect(fetchLatestVideos()).resolves.toEqual([
      { provider: 'youtube', id: 'good', title: 'Completo', embeddable: true },
    ]);
  });

  it('tolerates an entry with no published date', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(feed([{ id: 'a', title: 'Sin fecha' }]))),
    );

    await expect(fetchLatestVideos()).resolves.toEqual([
      { provider: 'youtube', id: 'a', title: 'Sin fecha', embeddable: true },
    ]);
  });
});

/**
 * The feed cannot say whether a video is still there or may be embedded, and
 * both of those produced a visibly broken tile in production: one showing
 * YouTube's *"La persona que subió el video lo quitó"*, one showing *"El
 * propietario del video inhabilitó la reproducción en otros sitios web"*.
 */
describe('fetchLatestVideos — the oEmbed probe', () => {
  const twoVideos = () =>
    ok(
      feed([
        { id: 'aaa', title: 'Uno' },
        { id: 'bbb', title: 'Dos' },
      ]),
    );

  it('marks a video the owner blocked from embedding', async () => {
    // 401 is what oEmbed answers for "Permitir insertar" turned off — the state
    // both of the channel's current videos are actually in.
    vi.stubGlobal(
      'fetch',
      routed(twoVideos, (id) => status(id === 'bbb' ? 401 : 200)),
    );

    const videos = await fetchLatestVideos();

    expect(videos.map((video) => video.embeddable)).toEqual([true, false]);
  });

  it('treats a 403 the same as a 401', async () => {
    vi.stubGlobal(
      'fetch',
      routed(twoVideos, (id) => status(id === 'bbb' ? 403 : 200)),
    );

    await expect(fetchLatestVideos()).resolves.toHaveLength(2);
    expect((await fetchLatestVideos())[1]?.embeddable).toBe(false);
  });

  it('drops a video that is gone, so a stale snapshot cannot resurrect it', async () => {
    // The bug this was written for: a deleted video kept its tile because the
    // committed snapshot still listed it.
    vi.stubGlobal(
      'fetch',
      routed(twoVideos, (id) => status(id === 'aaa' ? 404 : 200)),
    );

    await expect(fetchLatestVideos()).resolves.toEqual([
      { provider: 'youtube', id: 'bbb', title: 'Dos', embeddable: true },
    ]);
  });

  it('ignores the probes entirely when every one says gone', async () => {
    // Rate limiting answers 404 across the board. Believing it would empty the
    // section — the precise failure the snapshot fallback exists to prevent.
    vi.stubGlobal(
      'fetch',
      routed(twoVideos, () => status(404)),
    );

    await expect(fetchLatestVideos()).resolves.toEqual([
      { provider: 'youtube', id: 'aaa', title: 'Uno', embeddable: true },
      { provider: 'youtube', id: 'bbb', title: 'Dos', embeddable: true },
    ]);
  });

  it('assumes embeddable when a probe fails for any other reason', async () => {
    // A 429, a timeout, YouTube having a bad minute. Guessing "no" would stop
    // working videos from playing inline; guessing "yes" costs nothing we did
    // not already have.
    vi.stubGlobal(
      'fetch',
      routed(twoVideos, () => status(429)),
    );

    const videos = await fetchLatestVideos();
    expect(videos.every((video) => video.embeddable)).toBe(true);
  });

  it('probes each video exactly once, in parallel with the others', async () => {
    const fetchMock = routed(twoVideos, () => status(200));
    vi.stubGlobal('fetch', fetchMock);

    await fetchLatestVideos();

    const probed = fetchMock.mock.calls.map(([url]) => url).filter(isOembed);
    expect(probed).toHaveLength(2);
  });
});

describe('fetchLatestVideos — every way it can fail', () => {
  const expectSnapshot = (videos: unknown) => {
    expect(videos).toEqual(
      snapshot.videos.slice(0, YOUTUBE.limit).map((video) => ({
        provider: 'youtube',
        id: video.id,
        title: video.title,
        embeddable: true,
      })),
    );
  };

  it('falls back to the snapshot on a 404 — which is how the feed rate-limits', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 404, text: async () => '' }) as Response),
    );

    expectSnapshot(await fetchLatestVideos());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('404'));
  });

  it('falls back to the snapshot on a 500', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, text: async () => '' }) as Response),
    );

    expectSnapshot(await fetchLatestVideos());
  });

  it('falls back when the feed is reachable but has no usable entries', async () => {
    // A 200 carrying an empty or unparseable feed. Returning [] here would ship
    // an empty videos section just as surely as a 404 would.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(feed([]))),
    );

    expectSnapshot(await fetchLatestVideos());
  });

  it('falls back when the network throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    expectSnapshot(await fetchLatestVideos());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('ECONNREFUSED'));
  });

  it('falls back when something non-Error is thrown', async () => {
    // The `error instanceof Error ? … : String(error)` branch. An aborted
    // fetch or a stray string rejection must not crash the build.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw 'plain string rejection';
      }),
    );

    expectSnapshot(await fetchLatestVideos());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('plain string rejection'));
  });

  it('never throws, whatever happens', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom');
      }),
    );

    await expect(fetchLatestVideos()).resolves.toBeInstanceOf(Array);
  });

  it('returns an empty list when no channel is configured', async () => {
    // The one case that does NOT fall back: no channel id means the feature is
    // off, so the snapshot would be resurrecting a channel nobody asked for.
    vi.doMock('~/config/site', async () => {
      const actual = await vi.importActual<typeof import('~/config/site')>('~/config/site');
      return { ...actual, YOUTUBE: { ...actual.YOUTUBE, channelId: '' } };
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { fetchLatestVideos: withoutChannel } = await import('~/lib/youtube');

    await expect(withoutChannel()).resolves.toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();

    vi.doUnmock('~/config/site');
  });
});

describe('fetchLatestVideos — the timeout', () => {
  it('clears its abort timer on success, so the build can exit', async () => {
    // A pending timer keeps the Node process alive. On a build runner that is
    // an eight-second stall on every single build.
    vi.useFakeTimers();
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(feed([{ id: 'a', title: 'T' }]))),
    );

    await fetchLatestVideos();

    expect(clear).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('clears its abort timer on failure too', async () => {
    vi.useFakeTimers();
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('nope');
      }),
    );

    await fetchLatestVideos();

    expect(clear).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('aborts the request once the timeout elapses', async () => {
    vi.useFakeTimers();
    let seen: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        seen = init.signal ?? undefined;
        // Never resolves on its own; the abort is what has to end it.
        return new Promise<Response>(() => {});
      }),
    );

    void fetchLatestVideos();
    await Promise.resolve();
    expect(seen?.aborted).toBe(false);

    vi.advanceTimersByTime(8000);
    expect(seen?.aborted).toBe(true);

    vi.useRealTimers();
  });
});

describe('mergeVideos', () => {
  const pinned = { provider: 'youtube', id: 'pinned', title: 'Curated title' } as const;

  it('puts pinned videos first', () => {
    const result = mergeVideos(
      [pinned],
      [{ provider: 'youtube', id: 'fresh', title: 'From the feed' }],
    );

    expect(result.map((video) => video.id)).toEqual(['pinned', 'fresh']);
  });

  it('drops the feed copy of a pinned video, keeping the curated title', () => {
    // A pinned video also appears in the feed. The pinned entry has to win, or
    // the hand-written title and position are lost.
    const result = mergeVideos(
      [pinned],
      [{ provider: 'youtube', id: 'pinned', title: 'Raw YouTube title' }],
    );

    expect(result).toEqual([pinned]);
  });

  it('treats the same id on different providers as different videos', () => {
    // The key is `provider:id`, not `id` — a Facebook permalink and a YouTube
    // id occupy separate namespaces and could collide.
    const result = mergeVideos(
      [{ provider: 'youtube', id: 'same', title: 'YT' }],
      [{ provider: 'facebook', id: 'same', title: 'FB' }],
    );

    expect(result).toHaveLength(2);
  });

  it('returns the feed unchanged when nothing is pinned — today’s real case', () => {
    const feedVideos = [{ provider: 'youtube', id: 'a', title: 'A' }] as const;
    expect(mergeVideos([], [...feedVideos])).toEqual(feedVideos);
  });

  it('returns an empty list when both sides are empty', () => {
    expect(mergeVideos([], [])).toEqual([]);
  });

  it('does not mutate either input', () => {
    const pinnedList = [pinned];
    const feedList = [{ provider: 'youtube', id: 'fresh', title: 'F' } as const];

    mergeVideos(pinnedList, [...feedList]);

    expect(pinnedList).toHaveLength(1);
    expect(feedList).toHaveLength(1);
  });
});
