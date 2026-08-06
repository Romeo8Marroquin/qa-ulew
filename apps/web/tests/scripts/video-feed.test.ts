// @vitest-environment happy-dom
/**
 * The grid is baked at build time, so it is only as current as the last deploy.
 * This module is what makes the page honest at the moment it is visited — it
 * asks `/api/videos` and rebuilds the tiles if YouTube disagrees with the HTML.
 *
 * Almost every test here is really the same question: **can this make the page
 * worse than not running at all?** A page that already shows videos must not
 * end up blank because the API had a bad second, and a build-time grid that is
 * still correct must not be torn down and rebuilt for nothing.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDom, type Dom } from '../helpers/dom';

const EMBED = 'https://www.youtube-nocookie.com/embed/__ID__?autoplay=1&rel=0&modestbranding=1';
const WATCH = 'https://www.youtube.com/watch?v=__ID__';
const POSTER = 'https://i.ytimg.com/vi/__ID__/hqdefault.jpg';

/** A facade tile, as `VideoEmbed.astro` renders one. */
const facadeTile = (id = '__ID__', title = '__TITLE__') => `
  <figure data-video-tile data-video-id="${id}">
    <div data-video-facade data-src="${EMBED.replace('__ID__', id)}" data-title="${title}">
      <img src="${POSTER.replace('__ID__', id)}" alt="" />
      <button type="button" aria-label="Reproducir video: ${title}"></button>
    </div>
    <figcaption>
      <span data-video-title>${title}</span>
      <a href="${WATCH.replace('__ID__', id)}">Ver en YouTube</a>
    </figcaption>
  </figure>
`;

/** The same tile in its non-embeddable form: a link, and no facade. */
const linkTile = (id = '__ID__', title = '__TITLE__') => `
  <figure data-video-tile data-video-id="${id}">
    <div>
      <img src="${POSTER.replace('__ID__', id)}" alt="" />
      <a href="${WATCH.replace('__ID__', id)}" aria-label="Ver &quot;${title}&quot; en YouTube"></a>
    </div>
    <figcaption>
      <span data-video-title>${title}</span>
    </figcaption>
  </figure>
`;

interface PageOptions {
  tiles?: string;
  templates?: boolean;
  /** Drop the caption slot, to exercise a template that carries no title node. */
  captionless?: boolean;
  empty?: boolean;
}

function page({
  tiles = '',
  templates = true,
  captionless = false,
  empty = true,
}: PageOptions = {}) {
  const embeddable = captionless
    ? '<figure data-video-tile data-video-id="__ID__"><div data-video-facade></div></figure>'
    : facadeTile();

  return `
    <div class="grid" data-video-grid>${tiles}</div>
    ${empty ? '<div data-video-empty hidden><p>Pronto publicaremos contenido acá.</p></div>' : ''}
    ${
      templates
        ? `<template data-video-template="embeddable"><div data-reveal>${embeddable}</div></template>
           <template data-video-template="link"><div data-reveal>${linkTile()}</div></template>`
        : ''
    }
  `;
}

type Payload = { id: string; title: string; embeddable: boolean }[];

/** A `fetch` answering `/api/videos` with the given payload. */
const answering = (videos: Payload, status = 200) =>
  vi.fn(async () => ({
    ok: status < 400,
    status,
    json: async () => ({ videos }),
  }));

async function load(dom: Dom, fetchImpl: unknown) {
  vi.stubGlobal('fetch', fetchImpl);
  vi.resetModules();
  await import('~/scripts/video-feed');
  return dom;
}

const ids = (dom: Dom): string[] =>
  [...dom.document.querySelectorAll('[data-video-grid] [data-video-tile]')].map(
    (tile) => tile.getAttribute('data-video-id') ?? '',
  );

/**
 * The module starts its work at import and exposes no handle on the promise.
 * A macrotask boundary drains every microtask queued behind the stubbed fetch.
 */
const settled = () => new Promise((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('when nothing needs to change', () => {
  it('leaves the grid untouched if the API agrees with the HTML', async () => {
    // The common case, and the one that has to be free: the deploy is current.
    // Rebuilding here would relayout the section and drop the reveal state for
    // no reason a visitor could perceive as anything but a flicker.
    const dom = createDom(page({ tiles: facadeTile('aaa', 'Uno') }));
    const original = dom.document.querySelector('[data-video-tile]');

    await load(dom, answering([{ id: 'aaa', title: 'Uno', embeddable: true }]));
    await settled();

    expect(dom.document.querySelector('[data-video-tile]')).toBe(original);
  });

  it('does rebuild when only the title changed', async () => {
    // Live streams are routinely renamed once they end.
    const dom = createDom(page({ tiles: facadeTile('aaa', 'En vivo') }));

    await load(dom, answering([{ id: 'aaa', title: 'Grabación completa', embeddable: true }]));
    await settled();

    expect(dom.document.querySelector('[data-video-title]')?.textContent).toBe(
      'Grabación completa',
    );
  });

  it('does rebuild when only embeddability changed', async () => {
    const dom = createDom(page({ tiles: facadeTile('aaa', 'Uno') }));

    await load(dom, answering([{ id: 'aaa', title: 'Uno', embeddable: false }]));
    await settled();

    expect(dom.document.querySelector('[data-video-facade]')).toBeNull();
  });
});

describe('when YouTube disagrees with the build', () => {
  it('drops a deleted video and adds one published since the deploy', async () => {
    // Exactly the production bug: a deleted podcast kept its tile, and the live
    // stream that replaced it never appeared.
    const dom = createDom(page({ tiles: facadeTile('deleted', 'Podcast') }));

    await load(
      dom,
      answering([
        { id: 'live', title: 'Descendimiento', embeddable: true },
        { id: 'kept', title: 'Podcast', embeddable: true },
      ]),
    );
    await settled();

    expect(ids(dom)).toEqual(['live', 'kept']);
  });

  it('stamps the id into every attribute that carries it', async () => {
    const dom = createDom(page({ tiles: facadeTile('old', 'Viejo') }));

    await load(dom, answering([{ id: 'nuevo123', title: 'Nuevo', embeddable: true }]));
    await settled();

    const tile = dom.document.querySelector('[data-video-tile]')!;
    expect(tile.querySelector('img')?.getAttribute('src')).toContain('nuevo123');
    expect(tile.querySelector('[data-video-facade]')?.getAttribute('data-src')).toContain(
      'nuevo123',
    );
    expect(tile.querySelector('a')?.getAttribute('href')).toContain('v=nuevo123');
  });

  it('stamps the title into the caption and the accessible name', async () => {
    const dom = createDom(page({ tiles: facadeTile('old', 'Viejo') }));

    await load(dom, answering([{ id: 'a', title: 'Fiesta de Sololá', embeddable: true }]));
    await settled();

    const tile = dom.document.querySelector('[data-video-tile]')!;
    expect(tile.querySelector('[data-video-title]')?.textContent).toBe('Fiesta de Sololá');
    expect(tile.querySelector('button')?.getAttribute('aria-label')).toBe(
      'Reproducir video: Fiesta de Sololá',
    );
    expect(tile.querySelector('[data-video-facade]')?.getAttribute('data-title')).toBe(
      'Fiesta de Sololá',
    );
  });

  it('builds a non-embeddable video from the link template', async () => {
    const dom = createDom(page({ tiles: facadeTile('old', 'Viejo') }));

    await load(dom, answering([{ id: 'blocked', title: 'Bloqueado', embeddable: false }]));
    await settled();

    const tile = dom.document.querySelector('[data-video-tile]')!;
    expect(tile.querySelector('[data-video-facade]')).toBeNull();
    expect(tile.querySelector('a')?.getAttribute('href')).toContain('v=blocked');
    expect(tile.querySelector('a')?.getAttribute('aria-label')).toContain('Bloqueado');
  });

  it('mixes both tile shapes in one grid', async () => {
    const dom = createDom(page({ tiles: facadeTile('old', 'Viejo') }));

    await load(
      dom,
      answering([
        { id: 'plays', title: 'Uno', embeddable: true },
        { id: 'blocked', title: 'Dos', embeddable: false },
      ]),
    );
    await settled();

    expect(dom.document.querySelectorAll('[data-video-facade]')).toHaveLength(1);
    expect(ids(dom)).toEqual(['plays', 'blocked']);
  });

  it('wires the play button on a tile it just created', async () => {
    // The facade script bound the tiles that were in the HTML at load. A tile
    // created afterwards would be an inert poster without this.
    const dom = createDom(page({ tiles: facadeTile('old', 'Viejo') }));

    await load(dom, answering([{ id: 'nuevo', title: 'Nuevo', embeddable: true }]));
    await settled();

    dom.document.querySelector('button')?.click();

    const iframe = dom.document.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toContain('nuevo');
  });

  it('hides the empty-state message once it has tiles to show', async () => {
    // The build shipped no videos — YouTube was throttling the deploy — so the
    // page rendered the placeholder. It cannot stay once tiles arrive.
    const dom = createDom(page({ tiles: '' }));
    dom.document.querySelector('[data-video-empty]')?.removeAttribute('hidden');

    await load(dom, answering([{ id: 'a', title: 'Uno', embeddable: true }]));
    await settled();

    expect(dom.document.querySelector('[data-video-empty]')?.hasAttribute('hidden')).toBe(true);
    expect(ids(dom)).toEqual(['a']);
  });

  it('works on a page with no empty-state element at all', async () => {
    const dom = createDom(page({ tiles: '', empty: false }));

    await load(dom, answering([{ id: 'a', title: 'Uno', embeddable: true }]));
    await settled();

    expect(ids(dom)).toEqual(['a']);
  });

  it('treats a title containing markup as text, not HTML', async () => {
    const dom = createDom(page({ tiles: facadeTile('old', 'Viejo') }));

    await load(
      dom,
      answering([{ id: 'a', title: '<img src=x onerror=alert(1)> "quoted"', embeddable: true }]),
    );
    await settled();

    const caption = dom.document.querySelector('[data-video-title]')!;
    expect(caption.querySelector('img')).toBeNull();
    expect(caption.textContent).toBe('<img src=x onerror=alert(1)> "quoted"');
  });
});

describe('every way the refresh can fail', () => {
  const unchanged = async (fetchImpl: unknown) => {
    const dom = createDom(page({ tiles: facadeTile('aaa', 'Uno') }));
    await load(dom, fetchImpl);
    await settled();
    expect(ids(dom)).toEqual(['aaa']);
    return dom;
  };

  it('keeps the build-time grid when the route is not deployed', async () => {
    // `astro dev` and `astro preview` serve no Functions, so this is the
    // everyday case in local development.
    await unchanged(answering([], 404));
  });

  it('keeps the grid when the function reports itself unavailable', async () => {
    await unchanged(answering([], 503));
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

  it('keeps the grid when the payload has no videos array', async () => {
    await unchanged(vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) })));
  });

  it('never blanks a populated grid on an empty answer', async () => {
    // An empty list is far likelier to be rate limiting than a channel that
    // emptied itself, and blanking the page is the one outcome worse than
    // showing something stale.
    await unchanged(answering([]));
  });

  it('leaves the grid alone when the templates are missing', async () => {
    // A page rendered with the feed disabled has a grid but no prototypes.
    // Half a grid is worse than the one that is already there.
    const dom = createDom(page({ tiles: facadeTile('aaa', 'Uno'), templates: false }));

    await load(dom, answering([{ id: 'otro', title: 'Otro', embeddable: true }]));
    await settled();

    expect(ids(dom)).toEqual(['aaa']);
  });

  it('does not call the API at all on a page with no video grid', async () => {
    // Every other page on the site.
    const dom = createDom('<main><h1>Contacto</h1></main>');
    const fetchMock = answering([{ id: 'a', title: 'Uno', embeddable: true }]);

    await load(dom, fetchMock);
    await settled();

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('reading the current grid back', () => {
  it('copes with a tile missing its id and its caption', async () => {
    // Defensive: these come from our own component, so an absence is a bug —
    // but it must be a bug that triggers a rebuild, not a crash.
    const dom = createDom(page({ tiles: '<figure data-video-tile></figure>' }));

    await load(dom, answering([{ id: 'a', title: 'Uno', embeddable: true }]));
    await settled();

    expect(ids(dom)).toEqual(['a']);
  });

  it('copes with a template that carries no caption slot', async () => {
    const dom = createDom(page({ tiles: facadeTile('old', 'Viejo'), captionless: true }));

    await load(dom, answering([{ id: 'nuevo', title: 'Nuevo', embeddable: true }]));
    await settled();

    expect(ids(dom)).toEqual(['nuevo']);
  });
});
