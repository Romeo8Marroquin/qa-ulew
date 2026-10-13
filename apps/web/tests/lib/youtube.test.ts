/**
 * `lib/youtube.ts` is the only module here that talks to the network at build
 * time, and its governing rule is that **a content fetch must never be able to
 * fail a deploy**. Every test below is really one question: does this failure
 * mode still ship a page?
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
import { fetchVideoCatalog, mergeVideos } from '~/lib/youtube';

interface Entry {
  id?: string;
  title?: string;
  published?: string;
  views?: number;
}

/** A minimal Atom document in the shape YouTube actually publishes. */
function feed(entries: Entry[]): string {
  const body = entries
    .map((entry) => {
      const parts = [
        entry.id === undefined ? '' : `<yt:videoId>${entry.id}</yt:videoId>`,
        entry.title === undefined ? '' : `<title>${entry.title}</title>`,
        entry.published === undefined ? '' : `<published>${entry.published}</published>`,
        entry.views === undefined ? '' : `<media:statistics views="${entry.views}"/>`,
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

/**
 * The embed page carrying one verdict, escaped the way YouTube ships it —
 * the JSON lives inside a <script>, so its quotes arrive backslashed.
 */
const verdict = (playability: string): Response =>
  ({
    ok: true,
    status: 200,
    text: async () =>
      `<script>{\\"previewPlayabilityStatus\\":{\\"status\\":\\"${playability}\\"}}</script>`,
  }) as Response;

const isProbe = (url: string): boolean => url.includes('/embed/');
const isPopular = (url: string): boolean => url.includes('playlist_id=');

interface Routes {
  /** The uploads feed. */
  uploads?: () => Response;
  /** A popular playlist feed, by playlist id. Defaults to 404, as for a channel without one. */
  popular?: (playlist: string) => Response;
  /** An embed-page probe, by video id. Defaults to OK. */
  probe?: (id: string) => Response;
}

/**
 * A fetch that answers the three kinds of request a build makes — the uploads
 * feed, the popular playlists, and one embed-page probe per video — each in
 * its own way. Most of what is worth asserting lives in the gap between them.
 */
function routed({
  uploads = () => ok(feed([])),
  popular = () => status(404),
  probe = () => verdict('OK'),
}: Routes) {
  // `init` is declared even though the router ignores it, so the recorded calls
  // are typed as the two-argument tuple the referrer assertion reads.
  return vi.fn(async (url: string, _init?: RequestInit) => {
    if (isProbe(url)) return probe(decodeURIComponent(url).split('/embed/')[1] ?? '');
    if (isPopular(url)) return popular(new URL(url).searchParams.get('playlist_id') ?? '');
    return uploads();
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

const recentOf = async () => (await fetchVideoCatalog()).recent;
const popularOf = async () => (await fetchVideoCatalog()).popular;

describe('fetchVideoCatalog — the recent list', () => {
  it('returns the feed entries, newest first, with their date and views', async () => {
    vi.stubGlobal(
      'fetch',
      routed({
        uploads: () =>
          ok(
            feed([
              { id: 'aaa', title: 'Primero', published: '2026-01-02T00:00:00+00:00', views: 7 },
              { id: 'bbb', title: 'Segundo', published: '2026-01-01T00:00:00+00:00' },
            ]),
          ),
      }),
    );

    await expect(recentOf()).resolves.toEqual([
      {
        provider: 'youtube',
        id: 'aaa',
        title: 'Primero',
        embeddable: true,
        published: '2026-01-02T00:00:00+00:00',
        views: 7,
      },
      {
        provider: 'youtube',
        id: 'bbb',
        title: 'Segundo',
        embeddable: true,
        published: '2026-01-01T00:00:00+00:00',
        views: null,
      },
    ]);
  });

  it('never marks anything live', async () => {
    // A badge baked into static HTML would still say "en vivo" days later to
    // anyone whose refresh did not land. Live state is the Function's job.
    vi.stubGlobal('fetch', routed({ uploads: () => ok(feed([{ id: 'a', title: 'T' }])) }));

    const [video] = await recentOf();
    expect(video).not.toHaveProperty('live');
  });

  it('requests the configured channel with a browser user-agent', async () => {
    // Not decoration: a browser UA measurably reduces how often the feed
    // throttles, which is the failure this whole module is built around.
    const fetchMock = routed({ uploads: () => ok(feed([{ id: 'x', title: 'T' }])) });
    vi.stubGlobal('fetch', fetchMock);

    await fetchVideoCatalog();

    const [url, init] = fetchMock.mock.calls.find(
      ([called]) => !isProbe(called) && !isPopular(called),
    ) as [string, RequestInit];
    expect(url).toContain(`channel_id=${encodeURIComponent(YOUTUBE.channelId)}`);
    expect(url).toContain('youtube.com/feeds/videos.xml');
    expect((init.headers as Record<string, string>)['user-agent']).toContain('Mozilla/5.0');
    expect(init.signal).toBeDefined();
  });

  it('stops at the configured limit', async () => {
    const entries = Array.from({ length: YOUTUBE.limit + 4 }, (_, index) => ({
      id: `id${index}`,
      title: `Video ${index}`,
    }));
    vi.stubGlobal('fetch', routed({ uploads: () => ok(feed(entries)) }));

    await expect(recentOf()).resolves.toHaveLength(YOUTUBE.limit);
  });

  it('decodes the XML entities YouTube escapes in titles', async () => {
    // Titles routinely carry apostrophes and ampersands. `&amp;` is unescaped
    // last on purpose — doing it first would turn `&amp;lt;` into `<`.
    vi.stubGlobal(
      'fetch',
      routed({
        uploads: () =>
          ok(
            feed([
              { id: 'a', title: 'Fiesta &amp; tradici&#39;on &lt;3 &quot;vivo&quot; &apos;24' },
            ]),
          ),
      }),
    );

    const [video] = await recentOf();
    expect(video?.title).toBe(`Fiesta & tradici'on <3 "vivo" '24`);
  });

  it('skips entries with no id or no title', async () => {
    // A malformed entry must be dropped, not rendered as a broken embed.
    vi.stubGlobal(
      'fetch',
      routed({
        uploads: () =>
          ok(feed([{ title: 'Sin id' }, { id: 'no-title' }, { id: 'good', title: 'Completo' }])),
      }),
    );

    expect((await recentOf()).map((video) => video.id)).toEqual(['good']);
  });
});

describe('fetchVideoCatalog — the most-viewed list', () => {
  it('reads both popular playlists and orders the union by views', async () => {
    const fetchMock = routed({
      uploads: () => ok(feed([{ id: 'r', title: 'Reciente' }])),
      popular: (playlist) =>
        playlist.startsWith('UUPV')
          ? ok(
              feed([
                { id: 'live1', title: 'Desfile', views: 92 },
                { id: 'live2', title: 'Reina', views: 40 },
              ]),
            )
          : ok(feed([{ id: 'vid1', title: 'Reportaje', views: 60 }])),
    });
    vi.stubGlobal('fetch', fetchMock);

    const popular = await popularOf();

    expect(popular.map((video) => [video.id, video.views])).toEqual([
      ['live1', 92],
      ['vid1', 60],
      ['live2', 40],
    ]);
    const asked = fetchMock.mock.calls.map(([url]) => url).filter(isPopular);
    expect(asked.map((url) => new URL(url).searchParams.get('playlist_id'))).toEqual([
      `UULP${YOUTUBE.channelId.slice(2)}`,
      `UUPV${YOUTUBE.channelId.slice(2)}`,
    ]);
  });

  it('takes one missing playlist in its stride', async () => {
    // This channel has no ordinary uploads, so UULP 404s on every build. That
    // is the normal case, not a failure, and must not reach for the snapshot.
    vi.stubGlobal(
      'fetch',
      routed({
        uploads: () => ok(feed([{ id: 'r', title: 'R' }])),
        popular: (playlist) =>
          playlist.startsWith('UUPV') ? ok(feed([{ id: 'p', title: 'P', views: 5 }])) : status(404),
      }),
    );

    expect((await popularOf()).map((video) => video.id)).toEqual(['p']);
    // Nor fill the build log with a warning that is true on every build.
    expect(warn).not.toHaveBeenCalled();
  });

  it('still warns about a popular playlist failing any other way', async () => {
    vi.stubGlobal(
      'fetch',
      routed({
        uploads: () => ok(feed([{ id: 'r', title: 'R' }])),
        popular: (playlist) =>
          playlist.startsWith('UUPV') ? ok(feed([{ id: 'p', title: 'P', views: 5 }])) : status(500),
      }),
    );

    await fetchVideoCatalog();

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('500'));
  });

  it('probes the popular videos too', async () => {
    vi.stubGlobal(
      'fetch',
      routed({
        uploads: () => ok(feed([{ id: 'r', title: 'R' }])),
        popular: () => ok(feed([{ id: 'blocked', title: 'B', views: 3 }])),
        probe: (id) => verdict(id === 'blocked' ? 'UNPLAYABLE' : 'OK'),
      }),
    );

    expect((await popularOf())[0]?.embeddable).toBe(false);
  });

  it('falls back to the snapshot when no playlist answers', async () => {
    vi.stubGlobal('fetch', routed({ uploads: () => ok(feed([{ id: 'r', title: 'R' }])) }));

    const popular = await popularOf();

    expect(popular.map((video) => video.id)).toEqual(
      snapshot.popular.slice(0, YOUTUBE.limit).map((video) => video.id),
    );
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('popular'));
  });
});

/**
 * The feed cannot say whether a video is still there or may be embedded, and
 * both of those produced a visibly broken tile in production: one showing
 * YouTube's *"La persona que subió el video lo quitó"*, one showing *"El
 * propietario del video inhabilitó la reproducción en otros sitios web"*.
 */
describe('fetchVideoCatalog — the embed-page probe', () => {
  const twoVideos = () =>
    ok(
      feed([
        { id: 'aaa', title: 'Uno' },
        { id: 'bbb', title: 'Dos' },
      ]),
    );

  it('marks a video that will not play in an embed', async () => {
    // UNPLAYABLE covers both real causes: the owner turning "Permitir insertar"
    // off, and a rights holder blocking embedded playback of the content in it.
    vi.stubGlobal(
      'fetch',
      routed({ uploads: twoVideos, probe: (id) => verdict(id === 'bbb' ? 'UNPLAYABLE' : 'OK') }),
    );

    expect((await recentOf()).map((video) => video.embeddable)).toEqual([true, false]);
  });

  it('drops a video that is gone, so a stale snapshot cannot resurrect it', async () => {
    // The bug this was written for: a deleted video kept its tile because the
    // committed snapshot still listed it.
    vi.stubGlobal(
      'fetch',
      routed({ uploads: twoVideos, probe: (id) => verdict(id === 'aaa' ? 'ERROR' : 'OK') }),
    );

    expect((await recentOf()).map((video) => video.id)).toEqual(['bbb']);
  });

  it('ignores the probes entirely when every one says gone', async () => {
    // Two ways this happens at once: throttling, and a Referer header that did
    // not survive the runtime — without it YouTube answers "error 153" for
    // every video, including ones that play. Believing that would empty the
    // section, the precise failure the snapshot fallback exists to prevent.
    vi.stubGlobal('fetch', routed({ uploads: twoVideos, probe: () => verdict('ERROR') }));

    const recent = await recentOf();
    expect(recent.map((video) => video.id)).toEqual(['aaa', 'bbb']);
    expect(recent.every((video) => video.embeddable)).toBe(true);
  });

  it('assumes embeddable when a probe fails for any other reason', async () => {
    // A 429, a timeout, YouTube having a bad minute. Guessing "no" would stop
    // working videos from playing inline; guessing "yes" costs nothing we did
    // not already have.
    vi.stubGlobal('fetch', routed({ uploads: twoVideos, probe: () => status(429) }));

    expect((await recentOf()).every((video) => video.embeddable)).toBe(true);
  });

  it('probes each video exactly once, even one in both lists', async () => {
    const fetchMock = routed({
      uploads: twoVideos,
      popular: () => ok(feed([{ id: 'bbb', title: 'Dos', views: 9 }])),
    });
    vi.stubGlobal('fetch', fetchMock);

    await fetchVideoCatalog();

    const probed = fetchMock.mock.calls.map(([url]) => url).filter(isProbe);
    expect(probed).toHaveLength(2);
  });

  it('presents this site as the referrer', async () => {
    // The verdict is per embedding site, so asking as anybody else answers a
    // different question — or, with no referrer at all, none.
    const fetchMock = routed({ uploads: twoVideos });
    vi.stubGlobal('fetch', fetchMock);

    await fetchVideoCatalog();

    const probe = fetchMock.mock.calls.find(([url]) => isProbe(url));
    const init = probe?.[1] as RequestInit;
    expect((init.headers as Record<string, string>).referer).toBe('https://qa-ulew.tv');
  });
});

describe('fetchVideoCatalog — every way it can fail', () => {
  const expectSnapshot = (videos: { id: string; views?: number | null }[]) => {
    expect(videos.map((video) => video.id)).toEqual(
      snapshot.videos.slice(0, YOUTUBE.limit).map((video) => video.id),
    );
  };

  it('falls back to the snapshot on a 404 — which is how the feed rate-limits', async () => {
    vi.stubGlobal('fetch', routed({ uploads: () => status(404) }));

    expectSnapshot(await recentOf());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('404'));
  });

  it('carries the snapshot view counts through', async () => {
    vi.stubGlobal('fetch', routed({ uploads: () => status(404) }));

    const [first] = await recentOf();
    expect(first?.views).toBe(snapshot.videos[0]?.views);
  });

  it('falls back to the snapshot on a 500', async () => {
    vi.stubGlobal('fetch', routed({ uploads: () => status(500) }));

    expectSnapshot(await recentOf());
  });

  it('falls back when the feed is reachable but has no usable entries', async () => {
    // A 200 carrying an empty or unparseable feed. Returning [] here would ship
    // an empty videos section just as surely as a 404 would.
    vi.stubGlobal('fetch', routed({ uploads: () => ok(feed([])) }));

    expectSnapshot(await recentOf());
  });

  it('falls back when the network throws', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      }),
    );

    const catalog = await fetchVideoCatalog();
    expectSnapshot(catalog.recent);
    expect(catalog.popular.length).toBeGreaterThan(0);
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

    expectSnapshot(await recentOf());
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('plain string rejection'));
  });

  it('copes with a snapshot written before view counts and the popular list existed', async () => {
    vi.doMock('~/data/youtube-feed.json', () => ({
      default: { videos: [{ id: 'old', title: 'Viejo', published: '2026-01-01T00:00:00Z' }] },
    }));
    vi.stubGlobal('fetch', routed({ uploads: () => status(404) }));

    const { fetchVideoCatalog: withOldSnapshot } = await import('~/lib/youtube');
    const catalog = await withOldSnapshot();

    expect(catalog.recent).toEqual([
      expect.objectContaining({ id: 'old', views: null, embeddable: true }),
    ]);
    expect(catalog.popular).toEqual([]);

    vi.doUnmock('~/data/youtube-feed.json');
  });

  it('never throws, whatever happens', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('boom');
      }),
    );

    await expect(fetchVideoCatalog()).resolves.toEqual({
      recent: expect.any(Array),
      popular: expect.any(Array),
    });
  });

  it('returns empty lists when no channel is configured', async () => {
    // The one case that does NOT fall back: no channel id means the feature is
    // off, so the snapshot would be resurrecting a channel nobody asked for.
    vi.doMock('~/config/site', async () => {
      const actual = await vi.importActual<typeof import('~/config/site')>('~/config/site');
      return { ...actual, YOUTUBE: { ...actual.YOUTUBE, channelId: '' } };
    });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const { fetchVideoCatalog: withoutChannel } = await import('~/lib/youtube');

    await expect(withoutChannel()).resolves.toEqual({ recent: [], popular: [] });
    expect(fetchMock).not.toHaveBeenCalled();

    vi.doUnmock('~/config/site');
  });
});

describe('fetchVideoCatalog — the timeout', () => {
  it('clears its abort timers on success, so the build can exit', async () => {
    // A pending timer keeps the Node process alive. On a build runner that is
    // an eight-second stall on every single build.
    vi.useFakeTimers();
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    vi.stubGlobal('fetch', routed({ uploads: () => ok(feed([{ id: 'a', title: 'T' }])) }));

    await fetchVideoCatalog();

    // One per feed: the uploads and both popular playlists.
    expect(clear).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('clears its abort timers on failure too', async () => {
    vi.useFakeTimers();
    const clear = vi.spyOn(globalThis, 'clearTimeout');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('nope');
      }),
    );

    await fetchVideoCatalog();

    expect(clear).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('aborts the request once the timeout elapses', async () => {
    vi.useFakeTimers();
    const seen: AbortSignal[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        if (init.signal) seen.push(init.signal);
        // Never resolves on its own; the abort is what has to end it.
        return new Promise<Response>(() => {});
      }),
    );

    void fetchVideoCatalog();
    await Promise.resolve();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((signal) => !signal.aborted)).toBe(true);

    vi.advanceTimersByTime(8000);
    expect(seen.every((signal) => signal.aborted)).toBe(true);

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
