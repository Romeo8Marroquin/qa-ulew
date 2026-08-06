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

  it('starts revealing slightly before the element reaches the fold', async () => {
    // The negative bottom margin is what makes an element finish arriving as it
    // becomes properly visible, rather than starting to move at that point.
    const dom = await load(createDom(MARKUP));

    expect(dom.observers[0]?.options).toEqual({
      rootMargin: '0px 0px -12% 0px',
      threshold: 0.05,
    });
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
