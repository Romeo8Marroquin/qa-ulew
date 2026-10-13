// @vitest-environment happy-dom
/**
 * The rule this module exists to obey: **content is never hidden by CSS that
 * something else has to come along and undo.** The hidden state is applied by
 * this script, only once it knows an observer will run to remove it. If the
 * script is blocked, errors, or lands in a browser without
 * IntersectionObserver, the page is simply visible.
 *
 * So the two "nothing happens" tests below are the important ones. A regression
 * there is a blank page, not a missing animation.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDom, removeIntersectionObserver, type Dom } from '../helpers/dom';

const MARKUP = `
  <div data-reveal id="one">First</div>
  <div data-reveal id="two">Second</div>
`;

async function load(dom: Dom) {
  vi.resetModules();
  await import('~/scripts/reveal');
  return dom;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('when the observer will run', () => {
  it('hides the items, then observes them', async () => {
    const dom = await load(createDom(MARKUP));

    for (const id of ['one', 'two']) {
      expect(dom.document.getElementById(id)?.hasAttribute('data-reveal-hidden')).toBe(true);
    }
    expect(dom.observers[0]?.observed).toHaveLength(2);
  });

  it('reveals an item when it intersects', async () => {
    const dom = await load(createDom(MARKUP));
    const one = dom.document.getElementById('one')!;

    dom.observers[0]?.trigger([{ target: one, isIntersecting: true }]);

    expect(one.hasAttribute('data-revealed')).toBe(true);
    expect(one.hasAttribute('data-reveal-hidden')).toBe(false);
  });

  it('stops observing an item once revealed', async () => {
    // Re-animating on scroll-up is distracting, so each element reveals once.
    const dom = await load(createDom(MARKUP));
    const one = dom.document.getElementById('one')!;

    dom.observers[0]?.trigger([{ target: one, isIntersecting: true }]);

    expect(dom.observers[0]?.unobserved).toEqual([one]);
  });

  it('leaves an item alone while it is not intersecting', async () => {
    const dom = await load(createDom(MARKUP));
    const one = dom.document.getElementById('one')!;

    dom.observers[0]?.trigger([{ target: one, isIntersecting: false }]);

    expect(one.hasAttribute('data-revealed')).toBe(false);
    expect(one.hasAttribute('data-reveal-hidden')).toBe(true);
    expect(dom.observers[0]?.unobserved).toEqual([]);
  });

  it('handles a batch containing both states', async () => {
    // The observer delivers several entries at once when a screenful arrives
    // together, which is the normal case rather than an edge one.
    const dom = await load(createDom(MARKUP));
    const one = dom.document.getElementById('one')!;
    const two = dom.document.getElementById('two')!;

    dom.observers[0]?.trigger([
      { target: one, isIntersecting: true },
      { target: two, isIntersecting: false },
    ]);

    expect(one.hasAttribute('data-revealed')).toBe(true);
    expect(two.hasAttribute('data-revealed')).toBe(false);
  });

  it('waits until the element is a little way up the screen', async () => {
    // The negative bottom margin holds the entrance until the element is past
    // the bottom 12%, so the visitor sees it arrive rather than finding it
    // already there.
    const dom = await load(createDom(MARKUP));

    expect(dom.observers[0]?.options).toEqual({
      rootMargin: '0px 0px -12% 0px',
      threshold: 0.05,
    });
  });
});

describe('when the window is resized', () => {
  /** Frames run when the test says so, the way a browser runs them before paint. */
  function frames() {
    const queue: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
      queue.push(callback),
    );
    return {
      queue,
      run: () => queue.splice(0).forEach((callback) => callback(0)),
    };
  }

  /** happy-dom does no layout; place an element on (or off) an 800px screen. */
  const place = (element: Element, top: number, height = 100) => {
    element.getBoundingClientRect = () => ({ top, bottom: top + height, height }) as DOMRect;
  };

  const MORE = `${MARKUP}<div data-reveal id="three">Third</div><div data-reveal id="four">Fourth</div>`;

  async function resized(markup = MORE) {
    const frame = frames();
    const dom = await load(createDom(markup));
    Object.defineProperty(dom.window, 'innerHeight', { value: 800, configurable: true });
    return { dom, frame, el: (id: string) => dom.document.getElementById(id)! };
  }

  it('shows what a resize left on screen, at once and without the entrance', async () => {
    // Dragging a window wider reflows content into the bottom band the
    // observer ignores, where it sat blank until the visitor scrolled.
    const { dom, frame, el } = await resized();
    place(el('one'), 700); // in the bottom band
    place(el('two'), -60); // peeking in at the top

    dom.window.dispatchEvent(new dom.Event('resize'));
    frame.run();

    for (const id of ['one', 'two']) {
      expect(el(id).hasAttribute('data-revealed')).toBe(true);
      expect(el(id).hasAttribute('data-reveal-hidden')).toBe(false);
      // The override is gone again: later transitions (theme, hover) still run.
      expect(el(id).style.transition).toBe('');
    }
    expect(dom.observers[0]?.unobserved).toEqual([el('one'), el('two')]);
  });

  it('leaves alone what is off screen, or not displayed at all', async () => {
    // Those still arrive the normal way, as the visitor scrolls to them.
    const { dom, frame, el } = await resized();
    place(el('one'), 900); // below
    place(el('two'), -300); // above
    place(el('three'), 100, 0); // display: none — a tile behind "ver más"
    place(el('four'), 200);

    dom.window.dispatchEvent(new dom.Event('resize'));
    frame.run();

    for (const id of ['one', 'two', 'three']) {
      expect(el(id).hasAttribute('data-reveal-hidden'), id).toBe(true);
    }
    expect(el('four').hasAttribute('data-revealed')).toBe(true);
  });

  it('does the work once per frame, however many resize events arrive', async () => {
    const { dom, frame } = await resized();

    for (let i = 0; i < 5; i += 1) dom.window.dispatchEvent(new dom.Event('resize'));
    expect(frame.queue).toHaveLength(1);

    frame.run();
    dom.window.dispatchEvent(new dom.Event('resize'));
    expect(frame.queue).toHaveLength(1);
  });

  it('touches nothing that has already been revealed', async () => {
    const { dom, frame, el } = await resized();
    dom.observers[0]?.trigger([{ target: el('one'), isIntersecting: true }]);
    place(el('one'), 100);
    el('one').style.transitionDelay = '80ms';

    dom.window.dispatchEvent(new dom.Event('resize'));
    frame.run();

    expect(el('one').style.transitionDelay).toBe('80ms');
  });
});

describe('when the animation must not run', () => {
  it('leaves everything visible under prefers-reduced-motion', async () => {
    const dom = createDom(MARKUP);
    dom.setMedia('(prefers-reduced-motion: reduce)', true);

    await load(dom);

    expect(dom.document.getElementById('one')?.hasAttribute('data-reveal-hidden')).toBe(false);
    // No observer at all — not an observer that fires immediately.
    expect(dom.observers).toHaveLength(0);
  });

  it('leaves everything visible when IntersectionObserver is missing', async () => {
    // The failure this guard prevents: hidden content in a browser where
    // nothing will ever un-hide it.
    const dom = createDom(MARKUP);
    removeIntersectionObserver(dom);

    await load(dom);

    expect(dom.document.getElementById('one')?.hasAttribute('data-reveal-hidden')).toBe(false);
  });
});

describe('when there is nothing to reveal', () => {
  it('does not throw on a page with no [data-reveal] elements', async () => {
    const dom = createDom('<p>Plain page</p>');

    await expect(load(dom)).resolves.toBeDefined();
    // The observer is still constructed; it simply observes nothing.
    expect(dom.observers[0]?.observed).toEqual([]);
  });
});
