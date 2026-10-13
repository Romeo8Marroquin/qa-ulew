// @vitest-environment happy-dom
/**
 * The lists are baked at build time, so they are only as current as the last
 * deploy. This module is what makes the page honest at the moment it is
 * visited — it asks `/api/videos` and reconciles each list with the answer.
 *
 * Almost every test here is really the same question: **can this make the page
 * worse than not running at all?** A page that already shows videos must not
 * end up blank because the API had a bad second, and a tile that is still
 * correct must not be torn down and rebuilt for nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDom, type Dom } from '../helpers/dom';
import { list, type ListOptions, pageDom, tile, type TileOptions } from '../helpers/video-markup';

type PayloadVideo = {
  id: string;
  title: string;
  embeddable?: boolean;
  published?: string;
  views?: number | null;
  live?: boolean;
};

/** A `fetch` answering `/api/videos` with the given payload. */
const answering = (payload: Record<string, PayloadVideo[]> | null, status = 200) =>
  vi.fn(async () => ({
    ok: status < 400,
    status,
    json: async () => payload,
  }));

async function load(dom: Dom, fetchImpl: unknown) {
  vi.stubGlobal('fetch', fetchImpl);
  vi.resetModules();
  await import('~/scripts/video-feed');
  return dom;
}

const recentPage = (items: TileOptions[], options: ListOptions = {}) =>
  pageDom([list('recent', items, options)]);

const ids = (dom: Dom, name = 'recent'): string[] =>
  [...dom.document.querySelectorAll(`[data-video-list="${name}"] [data-video-tile]`)].map(
    (element) => element.getAttribute('data-video-id') ?? '',
  );

const tileFor = (dom: Dom, id: string) =>
  dom.document.querySelector<HTMLElement>(`[data-video-id="${id}"]`)!;

const itemFor = (dom: Dom, id: string) => tileFor(dom, id).closest('li')!;

/**
 * The module starts its work at import and exposes no handle on the promise.
 * A macrotask boundary drains every microtask queued behind the stubbed fetch.
 */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('when nothing needs to change', () => {
  it('keeps every element if the API agrees with the HTML', async () => {
    // The common case, and the one that has to be free: the deploy is current.
    // Rebuilding here would relayout the section and drop the reveal state for
    // no reason a visitor could perceive as anything but a flicker.
    const dom = recentPage([
      { id: 'aaa', title: 'Uno' },
      { id: 'bbb', title: 'Dos' },
    ]);
    const before = [itemFor(dom, 'aaa'), itemFor(dom, 'bbb')];

    await load(
      dom,
      answering({
        recent: [
          { id: 'aaa', title: 'Uno', embeddable: true },
          { id: 'bbb', title: 'Dos', embeddable: true },
        ],
      }),
    );
    await settled();

    expect([itemFor(dom, 'aaa'), itemFor(dom, 'bbb')]).toEqual(before);
    expect(itemFor(dom, 'aaa')).toBe(before[0]);
  });

  it('rebuilds a tile whose title changed', async () => {
    // Live streams are routinely renamed once they end, and the title is in
    // the play button's name and the iframe's title, not only the caption.
    const dom = recentPage([{ id: 'aaa', title: 'En vivo' }]);
    const before = itemFor(dom, 'aaa');

    await load(dom, answering({ recent: [{ id: 'aaa', title: 'Grabación completa' }] }));
    await settled();

    expect(itemFor(dom, 'aaa')).not.toBe(before);
    expect(tileFor(dom, 'aaa').querySelector('[data-video-title]')?.textContent).toBe(
      'Grabación completa',
    );
    expect(tileFor(dom, 'aaa').querySelector('button')?.getAttribute('aria-label')).toBe(
      'Reproducir video: Grabación completa',
    );
  });

  it('rebuilds a tile whose embeddability changed', async () => {
    const dom = recentPage([{ id: 'aaa', title: 'Uno' }]);

    await load(dom, answering({ recent: [{ id: 'aaa', title: 'Uno', embeddable: false }] }));
    await settled();

    expect(tileFor(dom, 'aaa').querySelector('[data-video-facade]')).toBeNull();
  });

  it('keeps the shape of a tile the Function did not probe', async () => {
    // The Function probes to a budget. "Not asked" is not news that a blocked
    // video became playable.
    const dom = recentPage([{ id: 'aaa', title: 'Uno', embeddable: false }]);
    const before = itemFor(dom, 'aaa');

    await load(dom, answering({ recent: [{ id: 'aaa', title: 'Uno' }] }));
    await settled();

    expect(itemFor(dom, 'aaa')).toBe(before);
    expect(tileFor(dom, 'aaa').querySelector('[data-video-facade]')).toBeNull();
  });

  it('builds an unprobed new video as playable', async () => {
    // The player reports a block itself if it turns out to be one; see
    // video-facade.ts.
    const dom = recentPage([{ id: 'old', title: 'Viejo' }]);

    await load(dom, answering({ recent: [{ id: 'new', title: 'Nuevo' }] }));
    await settled();

    expect(tileFor(dom, 'new').querySelector('[data-video-facade]')).not.toBeNull();
  });
});

describe('when YouTube disagrees with the build', () => {
  it('drops a deleted video and adds one published since the deploy', async () => {
    // Exactly the production bug: a deleted podcast kept its tile, and the live
    // stream that replaced it never appeared.
    const dom = recentPage([{ id: 'deleted', title: 'Podcast' }]);

    await load(
      dom,
      answering({
        recent: [
          { id: 'live', title: 'Descendimiento', embeddable: true },
          { id: 'kept', title: 'Podcast', embeddable: true },
        ],
      }),
    );
    await settled();

    expect(ids(dom)).toEqual(['live', 'kept']);
  });

  it('moves a live stream to the top without rebuilding the tiles around it', async () => {
    // The reported bug: the channel was on air and the page showed the
    // previous video first. Moving costs nothing; rebuilding would reload
    // every poster below it.
    const dom = recentPage([
      { id: 'a', title: 'A' },
      { id: 'b', title: 'B' },
      { id: 'onair', title: 'En vivo' },
    ]);
    const kept = { a: itemFor(dom, 'a'), b: itemFor(dom, 'b'), onair: itemFor(dom, 'onair') };

    await load(
      dom,
      answering({
        recent: [
          { id: 'onair', title: 'En vivo', live: true },
          { id: 'a', title: 'A' },
          { id: 'b', title: 'B' },
        ],
      }),
    );
    await settled();

    expect(ids(dom)).toEqual(['onair', 'a', 'b']);
    expect(itemFor(dom, 'onair')).toBe(kept.onair);
    expect(itemFor(dom, 'a')).toBe(kept.a);
    expect(itemFor(dom, 'b')).toBe(kept.b);
  });

  it('shows the live badge and the live line, and hides the date', async () => {
    const dom = recentPage([{ id: 'onair', title: 'T', published: hoursAgo(2) }]);

    await load(dom, answering({ recent: [{ id: 'onair', title: 'T', live: true }] }));
    await settled();

    const onair = tileFor(dom, 'onair');
    expect(onair.hasAttribute('data-live')).toBe(true);
    expect(onair.querySelector<HTMLElement>('[data-video-live-badge]')?.hidden).toBe(false);
    expect(onair.querySelector<HTMLElement>('[data-video-live]')?.hidden).toBe(false);
    expect(onair.querySelector<HTMLElement>('[data-video-date]')?.hidden).toBe(true);
  });

  it('takes the badge off a stream that has ended', async () => {
    const dom = recentPage([{ id: 'ended', title: 'T', live: true }]);

    await load(
      dom,
      answering({ recent: [{ id: 'ended', title: 'T', live: false, published: hoursAgo(5) }] }),
    );
    await settled();

    const ended = tileFor(dom, 'ended');
    expect(ended.hasAttribute('data-live')).toBe(false);
    expect(ended.querySelector<HTMLElement>('[data-video-live-badge]')?.hidden).toBe(true);
    expect(ended.querySelector('[data-video-date]')?.textContent).toBe('hace 5 horas');
  });

  it('brings view counts up to date in place', async () => {
    const dom = pageDom([
      list('popular', [{ id: 'p', title: 'P', views: 80 }], { meta: 'views date' }),
    ]);
    const before = itemFor(dom, 'p');

    await load(dom, answering({ popular: [{ id: 'p', title: 'P', views: 92 }] }));
    await settled();

    expect(itemFor(dom, 'p')).toBe(before);
    expect(tileFor(dom, 'p').querySelector('[data-video-views-count]')?.textContent).toBe('92');
    expect(tileFor(dom, 'p').getAttribute('data-views')).toBe('92');
  });

  it('stamps the id into every attribute that carries it', async () => {
    const dom = recentPage([{ id: 'old', title: 'Viejo' }]);

    await load(dom, answering({ recent: [{ id: 'nuevo123', title: 'Nuevo', embeddable: true }] }));
    await settled();

    const created = tileFor(dom, 'nuevo123');
    expect(created.querySelector('img')?.getAttribute('src')).toContain('nuevo123');
    expect(created.querySelector('[data-video-facade]')?.getAttribute('data-src')).toContain(
      'nuevo123',
    );
    expect(created.querySelector('figcaption a')?.getAttribute('href')).toContain('v=nuevo123');
  });

  it('fills the details line of a new tile for its list', async () => {
    // The templates are shared by both lists and render it empty.
    const dom = pageDom([
      list('recent', [{ id: 'r', title: 'R' }], { meta: 'date' }),
      list('popular', [{ id: 'p', title: 'P' }], { meta: 'views date' }),
    ]);
    const published = hoursAgo(3);

    await load(
      dom,
      answering({
        recent: [{ id: 'r2', title: 'R2', published, views: 4 }],
        popular: [{ id: 'p2', title: 'P2', published, views: 1500 }],
      }),
    );
    await settled();

    const recent = tileFor(dom, 'r2');
    expect(recent.querySelector('[data-video-date]')?.textContent).toBe('hace 3 horas');
    expect(recent.querySelector('[data-video-date]')?.getAttribute('datetime')).toBe(published);
    expect(recent.querySelector<HTMLElement>('[data-video-views]')?.hidden).toBe(true);

    const popular = tileFor(dom, 'p2');
    expect(popular.querySelector<HTMLElement>('[data-video-views]')?.hidden).toBe(false);
    expect(popular.querySelector('[data-video-views-count]')?.textContent).toBe('1,500');
    expect(popular.querySelector<HTMLElement>('[data-video-separator]')?.hidden).toBe(false);
  });

  it('stamps the title into the caption and the accessible name', async () => {
    const dom = recentPage([{ id: 'old', title: 'Viejo' }]);

    await load(dom, answering({ recent: [{ id: 'a', title: 'Fiesta de Sololá' }] }));
    await settled();

    const created = tileFor(dom, 'a');
    expect(created.querySelector('[data-video-title]')?.textContent).toBe('Fiesta de Sololá');
    expect(created.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Reproducir video: Fiesta de Sololá',
    );
    expect(created.querySelector('[data-video-facade]')?.getAttribute('data-title')).toBe(
      'Fiesta de Sololá',
    );
  });

  it('builds a non-embeddable video from the link template', async () => {
    const dom = recentPage([{ id: 'old', title: 'Viejo' }]);

    await load(
      dom,
      answering({ recent: [{ id: 'blocked', title: 'Bloqueado', embeddable: false }] }),
    );
    await settled();

    const created = tileFor(dom, 'blocked');
    expect(created.querySelector('[data-video-facade]')).toBeNull();
    expect(created.querySelector('a')?.getAttribute('href')).toContain('v=blocked');
    expect(created.querySelector('a')?.getAttribute('aria-label')).toContain('Bloqueado');
  });

  it('wires the play button on a tile it just created', async () => {
    // The facade script bound the tiles that were in the HTML at load. A tile
    // created afterwards would be an inert poster without this.
    const dom = recentPage([{ id: 'old', title: 'Viejo' }]);

    await load(dom, answering({ recent: [{ id: 'nuevo', title: 'Nuevo' }] }));
    await settled();

    tileFor(dom, 'nuevo').querySelector('button')?.click();

    const iframe = dom.document.querySelector('iframe');
    expect(iframe?.getAttribute('src')).toContain('nuevo');
  });

  it('refreshes each list from its own key, and leaves an absent one alone', async () => {
    const dom = pageDom([
      list('recent', [{ id: 'r', title: 'R' }]),
      list('popular', [{ id: 'p', title: 'P' }], { meta: 'views date' }),
    ]);

    await load(dom, answering({ recent: [{ id: 'r2', title: 'R2' }] }));
    await settled();

    expect(ids(dom, 'recent')).toEqual(['r2']);
    expect(ids(dom, 'popular')).toEqual(['p']);
  });

  it('collapses the list again after a refresh adds to it', async () => {
    // A live stream arriving at the top pushes the third tile behind "ver más"
    // rather than making the visible part longer.
    const dom = recentPage(
      [
        { id: 'a', title: 'A' },
        { id: 'b', title: 'B' },
        { id: 'c', title: 'C' },
      ],
      { initial: 3 },
    );

    await load(
      dom,
      answering({
        recent: [
          { id: 'live', title: 'L', live: true },
          { id: 'a', title: 'A' },
          { id: 'b', title: 'B' },
          { id: 'c', title: 'C' },
        ],
      }),
    );
    await settled();

    expect(itemFor(dom, 'c').hidden).toBe(true);
    expect(itemFor(dom, 'live').hidden).toBe(false);
    expect(dom.document.querySelector<HTMLElement>('[data-video-more]')?.hidden).toBe(false);
  });

  it('hides the empty-state message once it has tiles to show', async () => {
    // The build shipped no videos — YouTube was throttling the deploy — so the
    // page rendered the placeholder. It cannot stay once tiles arrive.
    const dom = recentPage([]);
    dom.document.querySelector('[data-video-empty]')?.removeAttribute('hidden');

    await load(dom, answering({ recent: [{ id: 'a', title: 'Uno' }] }));
    await settled();

    expect(dom.document.querySelector('[data-video-empty]')?.hasAttribute('hidden')).toBe(true);
    expect(ids(dom)).toEqual(['a']);
  });

  it('works on a list with no empty-state element at all', async () => {
    const dom = pageDom([list('recent', [], { empty: false })]);

    await load(dom, answering({ recent: [{ id: 'a', title: 'Uno' }] }));
    await settled();

    expect(ids(dom)).toEqual(['a']);
  });

  it('treats a title containing markup as text, not HTML', async () => {
    const dom = recentPage([{ id: 'old', title: 'Viejo' }]);

    await load(
      dom,
      answering({ recent: [{ id: 'a', title: '<img src=x onerror=alert(1)> "quoted"' }] }),
    );
    await settled();

    const caption = dom.document.querySelector('[data-video-title]')!;
    expect(caption.querySelector('img')).toBeNull();
    expect(caption.textContent).toBe('<img src=x onerror=alert(1)> "quoted"');
  });

  it('lists a video the answer repeats twice, as two tiles', async () => {
    // Defensive: the Function deduplicates. If it ever did not, the second
    // copy must not steal the first one's element out from under it.
    const dom = recentPage([{ id: 'a', title: 'A' }]);

    await load(
      dom,
      answering({
        recent: [
          { id: 'a', title: 'A' },
          { id: 'a', title: 'A' },
        ],
      }),
    );
    await settled();

    expect(ids(dom)).toEqual(['a', 'a']);
  });
});

describe('dates', () => {
  it('rewrites build-time dates as relative ones on load', async () => {
    // The build prints "12 oct 2026", which stays true in HTML nobody
    // refreshes. With a clock available, "hace 3 horas" reads faster.
    const published = hoursAgo(3);
    const dom = recentPage([{ id: 'a', title: 'A', published }]);
    dom.document.querySelector('[data-video-date]')!.textContent = '12 oct 2026';

    await load(dom, answering(null, 503));
    await settled();

    expect(dom.document.querySelector('[data-video-date]')?.textContent).toBe('hace 3 horas');
  });
});

describe('every way the refresh can fail', () => {
  const unchanged = async (fetchImpl: unknown) => {
    const dom = recentPage([{ id: 'aaa', title: 'Uno' }]);
    const before = itemFor(dom, 'aaa');
    await load(dom, fetchImpl);
    await settled();
    expect(ids(dom)).toEqual(['aaa']);
    expect(itemFor(dom, 'aaa')).toBe(before);
    return dom;
  };

  it('keeps the build-time grid when the route is not deployed', async () => {
    // `astro dev` and `astro preview` serve no Functions, so this is the
    // everyday case in local development.
    await unchanged(answering({ recent: [] }, 404));
  });

  it('keeps the grid when the function reports itself unavailable', async () => {
    await unchanged(answering({ recent: [] }, 503));
  });

  it('keeps the grid when the network throws', async () => {
    await unchanged(
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
  });

  it('keeps the grid when the body is not JSON', async () => {
    await unchanged(
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Unexpected token');
        },
      })),
    );
  });

  it('keeps the grid when the body is null', async () => {
    await unchanged(answering(null));
  });

  it('keeps the grid when the payload has no list for it', async () => {
    await unchanged(answering({}));
  });

  it('ignores an answer in the shape this script replaced', async () => {
    // `{ videos: [...] }` — an edge cache still holding a pre-deploy body.
    await unchanged(answering({ videos: [{ id: 'x', title: 'X' }] }));
  });

  it('never blanks a populated grid on an empty answer', async () => {
    // An empty list is far likelier to be rate limiting than a channel that
    // emptied itself, and blanking the page is the one outcome worse than
    // showing something stale.
    await unchanged(answering({ recent: [] }));
  });

  it('leaves the grid alone when the templates are missing', async () => {
    // A page rendered with the feed disabled has a grid but no prototypes.
    // Half a grid is worse than the one that is already there.
    const dom = pageDom([list('recent', [{ id: 'aaa', title: 'Uno' }])], { templates: false });

    await load(
      dom,
      answering({
        recent: [
          { id: 'aaa', title: 'Uno' },
          { id: 'otro', title: 'Otro' },
        ],
      }),
    );
    await settled();

    expect(ids(dom)).toEqual(['aaa']);
  });

  it('leaves a list with no grid alone', async () => {
    const dom = pageDom([
      '<div data-video-list="recent" data-video-meta="date"><div data-video-empty></div></div>',
    ]);

    await load(dom, answering({ recent: [{ id: 'a', title: 'A' }] }));
    await settled();

    expect(dom.document.querySelector('[data-video-empty]')?.hasAttribute('hidden')).toBe(false);
  });

  it('does not call the API at all on a page with no video list', async () => {
    // Every other page on the site.
    const dom = createDom('<main><h1>Contacto</h1></main>');
    const fetchMock = answering({ recent: [{ id: 'a', title: 'Uno' }] });

    await load(dom, fetchMock);
    await settled();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('reading the current grid back', () => {
  it('copes with a tile missing its id and its caption', async () => {
    // Defensive: these come from our own component, so an absence is a bug —
    // but it must be a bug that triggers a rebuild, not a crash.
    const dom = pageDom([
      `<div data-video-list="recent" data-video-meta="date"><ul data-video-grid>` +
        `<li><figure data-video-tile></figure></li><li>not a tile</li></ul></div>`,
    ]);

    await load(dom, answering({ recent: [{ id: 'a', title: 'Uno' }] }));
    await settled();

    expect(ids(dom)).toEqual(['a']);
    expect(dom.document.querySelectorAll('[data-video-grid] > li')).toHaveLength(1);
  });

  it('does not re-run a script that a template happened to carry', async () => {
    // Astro emits a component's <script> where the component is first rendered,
    // which on a page with empty lists is inside the template.
    const dom = pageDom([list('recent', [{ id: 'old', title: 'Viejo' }])]);
    const template = dom.document.querySelector<HTMLTemplateElement>(
      '[data-video-template="embeddable"]',
    )!;
    template.content.prepend(dom.document.createElement('script'));
    template.content.querySelector('li')!.append(dom.document.createElement('script'));

    await load(dom, answering({ recent: [{ id: 'nuevo', title: 'Nuevo' }] }));
    await settled();

    expect(ids(dom)).toEqual(['nuevo']);
    expect(dom.document.querySelectorAll('[data-video-grid] script')).toHaveLength(0);
  });

  it('copes with a template that carries no caption slot', async () => {
    const dom = pageDom([list('recent', [{ id: 'old', title: 'Viejo' }])], { captionless: true });

    await load(dom, answering({ recent: [{ id: 'nuevo', title: 'Nuevo' }] }));
    await settled();

    expect(ids(dom)).toEqual(['nuevo']);
  });
});

// Keeps the fixture honest: the markup helper must produce what it claims.
describe('fixture', () => {
  it('renders a tile with every hook the scripts read', () => {
    const dom = createDom(tile({ id: 'x', title: 'X', views: 3, published: hoursAgo(1) }));
    for (const hook of [
      '[data-video-live-badge]',
      '[data-video-live]',
      '[data-video-views]',
      '[data-video-views-count]',
      '[data-video-separator]',
      '[data-video-date]',
      '[data-video-title]',
    ]) {
      expect(dom.document.querySelector(hook), hook).not.toBeNull();
    }
  });
});
