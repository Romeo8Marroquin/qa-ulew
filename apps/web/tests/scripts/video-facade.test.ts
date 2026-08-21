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
    expect(iframe?.getAttribute('src')).toContain(SRC);
    // `replaceChildren` — the poster and the button are gone, not stacked
    // behind the player.
    expect(dom.document.querySelector('img')).toBeNull();
    expect(dom.document.querySelector('button')).toBeNull();
  });

  it('opts the player into the JS API so it can report a block', async () => {
    // Without these two the player never posts anything back, and a video the
    // rights holder blocked would sit there showing YouTube's grey panel
    // inside our layout. `origin` is not optional: the player refuses to post
    // to a parent it was not told to expect.
    const dom = await load(createDom(facadeMarkup()));

    dom.document.querySelector('button')?.click();
    const src = new URL(dom.document.querySelector('iframe')!.getAttribute('src')!);

    expect(src.searchParams.get('enablejsapi')).toBe('1');
    expect(src.searchParams.get('origin')).toBe('https://qa-ulew.tv');
    // The parameters it was already built with survive.
    expect(src.searchParams.get('autoplay')).toBe('1');
  });

  it('leaves a non-YouTube embed URL alone', async () => {
    // Facebook and Cloudflare Stream do not speak this protocol; handing them
    // parameters they do not recognise is at best noise in the URL.
    const other = 'https://www.facebook.com/plugins/video.php?href=x&autoplay=true';
    const dom = await load(createDom(facadeMarkup({ src: other })));

    dom.document.querySelector('button')?.click();

    expect(dom.document.querySelector('iframe')?.getAttribute('src')).toBe(other);
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

/**
 * A video the *rights holder* blocked, rather than the channel owner.
 *
 * oEmbed says this video is embeddable and it is — the block is applied by
 * whoever owns the music in it, per embedding site, and only once the player
 * boots. The player is the only thing that knows, so the tile has to be able to
 * change its mind after the visitor has already clicked.
 */
describe('when the player reports it cannot play', () => {
  const PLAYER_ORIGIN = 'https://www.youtube-nocookie.com';

  /** A tile inside its <Reveal> wrapper, plus the link prototype to rebuild from. */
  const blockablePage = ({ template = true, reveal = true, caption = true } = {}) => `
    <div data-video-grid>
      ${reveal ? '<div data-reveal>' : ''}
        <figure data-video-tile data-video-id="abc123">
          <div data-video-facade data-src="${SRC}" data-title="Marimba">
            <img src="poster.jpg" alt="" />
            <button type="button" aria-label="Reproducir video: Marimba"></button>
          </div>
          <figcaption>${caption ? '<span data-video-title>Marimba</span>' : ''}</figcaption>
        </figure>
      ${reveal ? '</div>' : ''}
    </div>
    ${
      template
        ? `<template data-video-template="link">
             <div data-reveal>
               <figure data-video-tile data-video-id="__ID__">
                 <div>
                   <img src="https://i.ytimg.com/vi/__ID__/hqdefault.jpg" alt="" />
                   <a href="https://www.youtube.com/watch?v=__ID__"
                      aria-label="Ver &quot;__TITLE__&quot; en YouTube"></a>
                 </div>
                 <figcaption><span data-video-title>__TITLE__</span></figcaption>
               </figure>
             </div>
           </template>`
        : ''
    }
  `;

  /**
   * Play, then let the player answer.
   *
   * `contentWindow` is stubbed with a real object rather than left as
   * happy-dom's `null`: the module identifies a player by comparing the message
   * source against it, and with null on both sides that comparison would pass
   * for any source at all — the test would be asserting nothing.
   */
  function play(dom: Dom) {
    dom.document.querySelector('button')?.click();
    const iframe = dom.document.querySelector('iframe')!;
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: () => {} },
      configurable: true,
    });
    iframe.dispatchEvent(new dom.Event('load'));
    return iframe;
  }

  function post(
    dom: Dom,
    iframe: HTMLIFrameElement,
    data: unknown,
    origin: string = PLAYER_ORIGIN,
    source: unknown = undefined,
  ) {
    dom.window.dispatchEvent(
      new dom.MessageEvent('message', {
        data: typeof data === 'string' ? data : JSON.stringify(data),
        origin,
        source: (source === undefined ? iframe.contentWindow : source) as Window,
      }),
    );
  }

  it('rebuilds the tile as a link out to YouTube', async () => {
    const dom = await load(createDom(blockablePage()));
    const iframe = play(dom);

    post(dom, iframe, { event: 'onError', info: 150 });

    // The player is gone and the tile is the link shape, cloned from the same
    // template a build-time non-embeddable video uses.
    expect(dom.document.querySelector('iframe')).toBeNull();
    const link = dom.document.querySelector('[data-video-tile] a');
    expect(link?.getAttribute('href')).toBe('https://www.youtube.com/watch?v=abc123');
    expect(link?.getAttribute('aria-label')).toBe('Ver "Marimba" en YouTube');
    expect(dom.document.querySelector('[data-video-title]')?.textContent).toBe('Marimba');
  });

  it('replaces the wrapper, not just the figure', async () => {
    // The template carries its own <Reveal>. Swapping only the <figure> would
    // nest a second wrapper inside the old one every time a video failed.
    const dom = await load(createDom(blockablePage()));
    const iframe = play(dom);

    post(dom, iframe, { event: 'onError', info: 150 });

    expect(dom.document.querySelectorAll('[data-video-grid] > [data-reveal]')).toHaveLength(1);
    expect(dom.document.querySelectorAll('[data-reveal] [data-reveal]')).toHaveLength(0);
  });

  it('replaces the figure directly when there is no wrapper', async () => {
    // `<VideoEmbed>` does not require `<Reveal>` around it; index.astro happens
    // to use one. Climbing to a parent that is not the wrapper would swap out
    // the grid itself.
    const dom = await load(createDom(blockablePage({ reveal: false })));
    const iframe = play(dom);

    post(dom, iframe, { event: 'onError', info: 150 });

    expect(dom.document.querySelector('[data-video-grid]')).not.toBeNull();
    expect(dom.document.querySelectorAll('[data-video-tile]')).toHaveLength(1);
    expect(dom.document.querySelector('[data-video-tile] a')?.getAttribute('href')).toBe(
      'https://www.youtube.com/watch?v=abc123',
    );
  });

  it('falls back to an empty title when the tile has no caption', async () => {
    const dom = await load(createDom(blockablePage({ caption: false })));
    const iframe = play(dom);

    post(dom, iframe, { event: 'onError', info: 150 });

    // The slot is still substituted — with nothing — rather than left showing
    // the raw `__TITLE__` placeholder to a visitor.
    expect(dom.document.querySelector('[data-video-tile] a')?.getAttribute('aria-label')).toBe(
      'Ver "" en YouTube',
    );
  });

  it('moves focus to the link that replaced the button', async () => {
    const dom = await load(createDom(blockablePage()));
    const iframe = play(dom);

    post(dom, iframe, { event: 'onError', info: 150 });

    expect(dom.document.activeElement?.tagName.toLowerCase()).toBe('a');
  });

  it('treats every error code the same', async () => {
    // 101/150 is "not allowed in an embed", 100 is "gone", 5 a player fault,
    // 2 a bad parameter. To a visitor in front of a tile that will not play
    // they are one situation, and YouTube is the answer to all of them.
    for (const info of [2, 5, 100, 101, 150]) {
      const dom = await load(createDom(blockablePage()));
      const iframe = play(dom);

      post(dom, iframe, { event: 'onError', info });

      expect(dom.document.querySelector('iframe')).toBeNull();
    }
  });

  it('keeps playing when the player reports anything else', async () => {
    const dom = await load(createDom(blockablePage()));
    const iframe = play(dom);

    post(dom, iframe, { event: 'onReady', info: null });
    post(dom, iframe, { event: 'infoDelivery', info: { playerState: 1 } });

    expect(dom.document.querySelector('iframe')).not.toBeNull();
  });

  it('ignores a message from anywhere but the player', async () => {
    // Any page that can reach this window can post to it. An "onError" from an
    // ad frame must not be able to tear a video tile down.
    const dom = await load(createDom(blockablePage()));
    const iframe = play(dom);

    post(dom, iframe, { event: 'onError', info: 150 }, 'https://evil.example');

    expect(dom.document.querySelector('iframe')).not.toBeNull();
  });

  it('ignores an error from a different player', async () => {
    // A visitor can open several videos. One failing must not close another.
    const dom = await load(createDom(blockablePage()));
    const iframe = play(dom);

    post(dom, iframe, { event: 'onError', info: 150 }, PLAYER_ORIGIN, { other: true });

    expect(dom.document.querySelector('iframe')).not.toBeNull();
  });

  it('ignores a frame that is not JSON', async () => {
    const dom = await load(createDom(blockablePage()));
    const iframe = play(dom);

    post(dom, iframe, 'not json at all');

    expect(dom.document.querySelector('iframe')).not.toBeNull();
  });

  it('leaves the tile alone when the page has no link prototype', async () => {
    // Rendered without the feed enabled. YouTube's own panel inside our layout
    // is poor, but a half-removed tile is worse.
    const dom = await load(createDom(blockablePage({ template: false })));
    const iframe = play(dom);

    post(dom, iframe, { event: 'onError', info: 150 });

    expect(dom.document.querySelector('iframe')).not.toBeNull();
  });

  it('leaves the tile alone when it carries no video id', async () => {
    const dom = await load(
      createDom(`
        <div data-video-facade data-src="${SRC}" data-title="Suelto">
          <button type="button"></button>
        </div>
      `),
    );
    const iframe = play(dom);

    post(dom, iframe, { event: 'onError', info: 150 });

    expect(dom.document.querySelector('iframe')).not.toBeNull();
  });

  it('greets the player so it starts reporting at all', async () => {
    // No handshake, no events — the player only answers a parent that asked.
    const dom = await load(createDom(blockablePage()));

    dom.document.querySelector('button')?.click();
    const iframe = dom.document.querySelector('iframe')!;
    const sent: unknown[] = [];
    Object.defineProperty(iframe, 'contentWindow', {
      value: { postMessage: (message: unknown) => sent.push(message) },
      configurable: true,
    });

    iframe.dispatchEvent(new dom.Event('load'));

    expect(sent).toHaveLength(1);
    expect(JSON.parse(String(sent[0]))).toMatchObject({ event: 'listening', id: 'abc123' });
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
