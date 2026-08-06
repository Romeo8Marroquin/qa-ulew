// @vitest-environment happy-dom
/**
 * The facade pattern's whole value is that **nothing third-party loads until
 * the visitor asks for it** — no YouTube JavaScript, no cookies set before
 * consent, ~1 MB per video not downloaded. So the tests care as much about what
 * does not happen before the click as about what happens after it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDom, type Dom } from '../helpers/dom';

const SRC = 'https://www.youtube-nocookie.com/embed/abc123?autoplay=1&rel=0&modestbranding=1';

function facadeMarkup({
  src = SRC,
  title = 'Fiesta de Sololá',
  withButton = true,
}: Partial<{ src: string | null; title: string | null; withButton: boolean }> = {}): string {
  const attrs = [
    'data-video-facade',
    src === null ? '' : `data-src="${src}"`,
    title === null ? '' : `data-title="${title}"`,
  ].join(' ');
  return `
    <div ${attrs}>
      <img src="poster.jpg" alt="" />
      ${withButton ? '<button type="button" aria-label="Reproducir video: x"></button>' : ''}
    </div>
  `;
}

async function load(dom: Dom) {
  vi.resetModules();
  await import('~/scripts/video-facade');
  return dom;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('before the click', () => {
  it('loads no iframe', async () => {
    const dom = await load(createDom(facadeMarkup()));

    expect(dom.document.querySelector('iframe')).toBeNull();
    expect(dom.document.querySelector('img')).not.toBeNull();
  });
});

describe('on click', () => {
  it('replaces the poster with the iframe', async () => {
    const dom = await load(createDom(facadeMarkup()));

    dom.document.querySelector('button')?.click();

    const iframe = dom.document.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('src')).toBe(SRC);
    // `replaceChildren` — the poster and the button are gone, not stacked
    // behind the player.
    expect(dom.document.querySelector('img')).toBeNull();
    expect(dom.document.querySelector('button')).toBeNull();
  });

  it('titles the iframe, which is its accessible name', async () => {
    // An untitled iframe is announced as "frame" and nothing else.
    const dom = await load(createDom(facadeMarkup({ title: 'Fiesta de Sololá' })));

    dom.document.querySelector('button')?.click();

    expect(dom.document.querySelector('iframe')?.getAttribute('title')).toBe('Fiesta de Sololá');
  });

  it('falls back to an empty title rather than "undefined"', async () => {
    const dom = await load(createDom(facadeMarkup({ title: null })));

    dom.document.querySelector('button')?.click();

    expect(dom.document.querySelector('iframe')?.getAttribute('title')).toBe('');
  });

  it('grants the permissions a player needs, and allows fullscreen', async () => {
    const dom = await load(createDom(facadeMarkup()));

    dom.document.querySelector('button')?.click();
    const iframe = dom.document.querySelector('iframe')!;

    for (const permission of ['autoplay', 'encrypted-media', 'picture-in-picture', 'web-share']) {
      expect(iframe.getAttribute('allow')).toContain(permission);
    }
    // Asserted as a PROPERTY, not an attribute. The module sets
    // `iframe.allowFullscreen = true`, which is the correct DOM API and which a
    // browser reflects to the attribute — happy-dom does not implement that
    // reflection, so checking `hasAttribute` here would be testing the fake.
    expect(iframe.allowFullscreen).toBe(true);
  });

  it('lazy-loads and fills the frame it replaced', async () => {
    const dom = await load(createDom(facadeMarkup()));

    dom.document.querySelector('button')?.click();
    const iframe = dom.document.querySelector('iframe')!;

    // `loading` is the other property happy-dom does not reflect; see above.
    expect(iframe.loading).toBe('lazy');
    expect(iframe.getAttribute('class')).toBe('absolute inset-0 h-full w-full border-0');
  });

  it('moves focus into the player', async () => {
    // The button that had focus has just been removed from the document. Not
    // moving focus would drop a keyboard user back to the top of the page.
    const dom = await load(createDom(facadeMarkup()));

    dom.document.querySelector('button')?.click();

    expect(dom.document.activeElement?.tagName.toLowerCase()).toBe('iframe');
  });

  it('does nothing without a source', async () => {
    // `data-src` is absent when the provider cannot be embedded — a Cloudflare
    // Stream video before the account has Stream. Better an inert poster than a
    // broken iframe.
    const dom = await load(createDom(facadeMarkup({ src: null })));

    dom.document.querySelector('button')?.click();

    expect(dom.document.querySelector('iframe')).toBeNull();
    expect(dom.document.querySelector('img')).not.toBeNull();
  });
});

describe('multiple videos on the page', () => {
  it('wires each facade independently', async () => {
    const dom = await load(
      createDom(`
        <div data-video-facade data-src="${SRC}" data-title="Uno">
          <button type="button" id="a"></button>
        </div>
        <div data-video-facade data-src="${SRC}&amp;x=2" data-title="Dos">
          <button type="button" id="b"></button>
        </div>
      `),
    );

    dom.document.getElementById('a')?.click();

    expect(dom.document.querySelectorAll('iframe')).toHaveLength(1);
    expect(dom.document.getElementById('b')).not.toBeNull();

    dom.document.getElementById('b')?.click();
    expect(dom.document.querySelectorAll('iframe')).toHaveLength(2);
  });
});

describe('malformed markup', () => {
  it('skips a facade with no play button', async () => {
    const dom = createDom(facadeMarkup({ withButton: false }));

    await expect(load(dom)).resolves.toBeDefined();
    expect(dom.document.querySelector('iframe')).toBeNull();
  });

  it('does not throw on a page with no videos at all', async () => {
    // The empty state: the channel has published nothing, and the section
    // renders a placeholder instead of a grid.
    await expect(
      load(createDom('<p>Pronto publicaremos contenido acá.</p>')),
    ).resolves.toBeDefined();
  });
});
