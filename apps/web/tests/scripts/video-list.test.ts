// @vitest-environment happy-dom
/**
 * "Ver más". The contract worth testing is less the arithmetic than the two
 * promises in the module header: nothing is hidden unless this script is
 * running to un-hide it, and a keyboard user who presses the button lands on
 * the first new video rather than on a button that has moved below them.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { type Dom, removeIntersectionObserver } from '../helpers/dom';
import { list, type ListOptions, pageDom, type TileOptions } from '../helpers/video-markup';

const videos = (count: number): TileOptions[] =>
  Array.from({ length: count }, (_, index) => ({ id: `v${index}`, title: `Video ${index}` }));

async function load(dom: Dom) {
  vi.resetModules();
  await import('~/scripts/video-list');
  return dom;
}

const listDom = (count: number, options: ListOptions = {}) =>
  pageDom([list('recent', videos(count), options)]);

const visible = (dom: Dom) =>
  [...dom.document.querySelectorAll<HTMLElement>('[data-video-grid] > li')].filter(
    (item) => !item.hidden,
  ).length;

/** The scroll waits for the layout to settle, which is at least a microtask. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

const button = (dom: Dom) => dom.document.querySelector<HTMLElement>('[data-video-more]')!;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('on load', () => {
  it('shows the first few and offers the rest', async () => {
    const dom = await load(listDom(15, { initial: 3, step: 12 }));

    expect(visible(dom)).toBe(3);
    expect(button(dom).hidden).toBe(false);
    expect(button(dom).textContent?.trim()).toBe('Ver 12 videos más');
  });

  it('offers only what is left when that is less than a batch', async () => {
    const dom = await load(listDom(8, { initial: 3, step: 12 }));

    expect(button(dom).textContent?.trim()).toBe('Ver 5 videos más');
  });

  it('uses the singular for one', async () => {
    const dom = await load(listDom(4, { initial: 3, step: 12 }));

    expect(button(dom).textContent?.trim()).toBe('Ver 1 video más');
  });

  it('offers nothing when everything already fits', async () => {
    // "Only if there are more videos" — a button that reveals nothing is a
    // control that lies.
    const dom = await load(listDom(3, { initial: 3 }));

    expect(visible(dom)).toBe(3);
    expect(button(dom).hidden).toBe(true);
  });

  it('remembers how many are shown on the list itself', async () => {
    const dom = await load(listDom(15, { initial: 3 }));

    expect(dom.document.querySelector<HTMLElement>('[data-video-list]')?.dataset.shown).toBe('3');
  });

  it('shows everything when the list carries no counts', async () => {
    // Unreadable attributes mean "no limit". Hiding everything because a
    // number was missing would be the worst possible reading of it.
    const dom = pageDom([list('recent', videos(5))]);
    const element = dom.document.querySelector<HTMLElement>('[data-video-list]')!;
    delete element.dataset.initial;
    delete element.dataset.step;
    await load(dom);

    expect(visible(dom)).toBe(5);
    expect(button(dom).hidden).toBe(true);
  });

  it('copes with a list that has no grid, or no button', async () => {
    const dom = pageDom([
      '<div data-video-list="a" data-initial="3"></div>',
      list('b', videos(5), { button: false }),
    ]);

    await load(dom);

    expect(visible(dom)).toBe(3);
  });
});

describe('pressing it', () => {
  it('reveals the next batch', async () => {
    const dom = await load(listDom(15, { initial: 3, step: 5 }));

    button(dom).click();

    expect(visible(dom)).toBe(8);
    expect(button(dom).textContent?.trim()).toBe('Ver 5 videos más');
  });

  it('moves focus to the first new video', async () => {
    // Otherwise focus stays on a button that is now below the new tiles, and
    // the next Tab leaves the list without passing through them.
    const dom = await load(listDom(15, { initial: 3, step: 12 }));

    button(dom).click();

    const fourth = dom.document.querySelector('[data-video-id="v3"]');
    expect(dom.document.activeElement).toBe(fourth?.querySelector('button'));
  });

  it('says how far through the list that is', async () => {
    const dom = await load(listDom(15, { initial: 3, step: 12 }));

    button(dom).click();

    expect(dom.document.querySelector('[data-video-status]')?.textContent).toBe(
      'Mostrando 15 de 15 videos',
    );
  });

  it('retires itself once nothing is left', async () => {
    const dom = await load(listDom(15, { initial: 3, step: 12 }));

    button(dom).click();

    expect(visible(dom)).toBe(15);
    expect(button(dom).hidden).toBe(true);
  });

  it('works without a label span or a status line', async () => {
    const dom = listDom(5, { initial: 1, step: 1 });
    dom.document.querySelector('[data-video-more-label]')?.remove();
    dom.document.querySelector('[data-video-status]')?.remove();
    await load(dom);

    button(dom).click();

    // Three are left but a batch is one, so the label offers one.
    expect(visible(dom)).toBe(2);
    expect(button(dom).textContent).toBe('Ver 1 video más');
  });

  it('picks the plural form in Spanish when the page declares no language', async () => {
    const dom = pageDom([list('recent', videos(4), { initial: 3 })], { lang: '' });
    await load(dom);

    expect(button(dom).textContent?.trim()).toBe('Ver 1 video más');
  });

  it('announces nothing rather than a placeholder when the status has no template', async () => {
    const dom = listDom(5, { initial: 1 });
    delete dom.document.querySelector<HTMLElement>('[data-video-status]')!.dataset.template;
    await load(dom);

    button(dom).click();

    expect(dom.document.querySelector('[data-video-status]')?.textContent).toBe('');
  });

  it('writes an empty label rather than a template, if the forms are missing', async () => {
    const dom = listDom(5, { initial: 1 });
    delete button(dom).dataset.labelOther;
    await load(dom);

    expect(button(dom).textContent?.trim()).toBe('');
  });

  it('counts on from an unreadable position as if from the start', async () => {
    const dom = await load(listDom(6, { initial: 2, step: 2 }));
    const element = dom.document.querySelector<HTMLElement>('[data-video-list]')!;
    element.dataset.shown = 'nonsense';

    button(dom).click();

    // "nonsense" reads as "no limit", so everything is already shown and the
    // press settles on all of it.
    expect(visible(dom)).toBe(6);
  });
});

describe('how a press moves', () => {
  const REDUCE = '(prefers-reduced-motion: reduce)';

  /** Place an element: happy-dom does no layout, so every box is 0×0. */
  const place = (element: Element, top: number, height = 300) => {
    element.getBoundingClientRect = () => ({ top, bottom: top + height }) as DOMRect;
  };

  const press = async (dom: Dom, { reduce = false, padding = '' } = {}) => {
    dom.setMedia(REDUCE, reduce);
    if (padding) dom.document.documentElement.style.scrollPaddingTop = padding;
    Object.defineProperty(dom.window, 'innerHeight', { value: 800, configurable: true });
    const scrollBy = vi.fn();
    dom.window.scrollBy = scrollBy as unknown as Window['scrollBy'];
    await load(dom);
    return scrollBy;
  };

  const items = (dom: Dom) => [
    ...dom.document.querySelectorAll<HTMLElement>('[data-video-grid] > li'),
  ];

  it('holds the new tiles back until they come into view, then cascades them', async () => {
    const dom = listDom(15, { initial: 3, step: 12 });
    await press(dom);

    button(dom).click();

    const fresh = items(dom).slice(3);
    expect(fresh.every((item) => item.hasAttribute('data-reveal-hidden'))).toBe(true);

    // One row arrives together; each tile waits a little longer than the last.
    const [observer] = dom.observers;
    observer!.trigger(fresh.slice(0, 3).map((target) => ({ target, isIntersecting: true })));

    expect(fresh.slice(0, 3).map((item) => item.style.transitionDelay)).toEqual([
      '0ms',
      '70ms',
      '140ms',
    ]);
    expect(fresh[0]?.hasAttribute('data-revealed')).toBe(true);
    expect(fresh[0]?.hasAttribute('data-reveal-hidden')).toBe(false);
    expect(observer!.unobserved).toContain(fresh[0]);
    // The rest are still waiting for the visitor to scroll to them.
    expect(fresh[3]?.hasAttribute('data-reveal-hidden')).toBe(true);
  });

  it('caps the cascade, so the last of many does not lag', async () => {
    const dom = listDom(15, { initial: 3, step: 12 });
    await press(dom);
    button(dom).click();

    const fresh = items(dom).slice(3);
    dom.observers[0]!.trigger([
      { target: fresh[0]!, isIntersecting: false },
      ...fresh.slice(1, 9).map((target) => ({ target, isIntersecting: true })),
    ]);

    expect(fresh[8]?.style.transitionDelay).toBe('350ms');
    expect(fresh[0]?.hasAttribute('data-reveal-hidden')).toBe(true);
  });

  it('replays the entrance for a tile that had already been revealed once', async () => {
    // A refresh can push a visible tile behind "ver más"; when it comes back it
    // should arrive like the others, not pop in.
    const dom = listDom(5, { initial: 3 });
    items(dom)[3]!.setAttribute('data-revealed', '');
    await press(dom);

    button(dom).click();

    expect(items(dom)[3]?.hasAttribute('data-revealed')).toBe(false);
    expect(items(dom)[3]?.hasAttribute('data-reveal-hidden')).toBe(true);
  });

  it('hides nothing and animates nothing with reduced motion', async () => {
    const dom = listDom(15, { initial: 3 });
    await press(dom, { reduce: true });

    button(dom).click();

    expect(items(dom).some((item) => item.hasAttribute('data-reveal-hidden'))).toBe(false);
    expect(dom.observers).toHaveLength(0);
  });

  it('hides nothing where IntersectionObserver does not exist', async () => {
    const dom = listDom(15, { initial: 3 });
    removeIntersectionObserver(dom);
    await press(dom);

    button(dom).click();

    expect(items(dom).some((item) => item.hasAttribute('data-reveal-hidden'))).toBe(false);
  });

  it('glides just far enough to show the first new tile whole', async () => {
    // Bottom at 1000 in an 800px window: 200 over, plus the 24px margin.
    const dom = listDom(15, { initial: 3 });
    const scrollBy = await press(dom);
    place(items(dom)[3]!, 700);

    button(dom).click();
    await settle();

    expect(scrollBy).toHaveBeenCalledWith({ top: 224, behavior: 'smooth' });
  });

  it('moves focus without letting focus do the scrolling', async () => {
    // `focus()` alone jumped the page in one frame and stopped short.
    const dom = listDom(15, { initial: 3 });
    await press(dom);
    const control = items(dom)[3]!.querySelector('button')!;
    const focus = vi.spyOn(control, 'focus');

    button(dom).click();

    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
  });

  it('never scrolls the tile’s top under the fixed header', async () => {
    // A tile taller than the window: showing its bottom would hide its top.
    const dom = listDom(15, { initial: 3 });
    const scrollBy = await press(dom, { padding: '72px' });
    place(items(dom)[3]!, 200, 900);

    button(dom).click();
    await settle();

    expect(scrollBy).toHaveBeenCalledWith({ top: 200 - 72 - 24, behavior: 'smooth' });
  });

  it('does not scroll when the tile is already in view', async () => {
    const dom = listDom(15, { initial: 3 });
    const scrollBy = await press(dom);
    place(items(dom)[3]!, 300);

    button(dom).click();
    await settle();

    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('jumps instead of gliding with reduced motion', async () => {
    const dom = listDom(15, { initial: 3 });
    const scrollBy = await press(dom, { reduce: true });
    place(items(dom)[3]!, 700);

    button(dom).click();
    await settle();

    expect(scrollBy).toHaveBeenCalledWith({ top: 224, behavior: 'instant' });
  });

  it('does nothing to focus or scroll when there is nothing new to show', async () => {
    const dom = listDom(3, { initial: 3 });
    const scrollBy = await press(dom);

    button(dom).click();

    expect(scrollBy).not.toHaveBeenCalled();
    expect(dom.document.activeElement).toBe(dom.document.body);
  });
});

describe('the leftover row', () => {
  const grid = (dom: Dom) => dom.document.querySelector<HTMLElement>('[data-video-grid]')!;
  const remainders = (dom: Dom) => [
    grid(dom).getAttribute('data-rem-2'),
    grid(dom).getAttribute('data-rem-3'),
  ];

  it('tells the grid what is left over for the tiles shown, not for the whole list', async () => {
    // Fourteen in the HTML leave two over on three columns; the three shown
    // after load leave none.
    const dom = await load(listDom(14, { initial: 3 }));

    expect(remainders(dom)).toEqual(['1', '0']);
  });

  it('updates it when a press shows more', async () => {
    const dom = await load(listDom(14, { initial: 3 }));

    button(dom).click();

    expect(remainders(dom)).toEqual(['0', '2']);
  });

  it('copes with a list that has no grid', async () => {
    const dom = pageDom(['<div data-video-list="x" data-initial="3"></div>']);

    await expect(load(dom)).resolves.toBeDefined();
  });
});

describe('when a press resizes tiles already on screen', () => {
  const DESKTOP = '(min-width: 1024px)';
  const TABLET = '(min-width: 640px)';

  /** A View Transition that runs its update at once, as the browser would before animating. */
  const withViewTransitions = (dom: Dom, finished: Promise<unknown> = Promise.resolve()) => {
    const named: string[][] = [];
    const rootLive: boolean[] = [];
    const start = vi.fn((update: () => void) => {
      rootLive.push(dom.document.documentElement.hasAttribute('data-video-morph'));
      named.push(
        [...dom.document.querySelectorAll<HTMLElement>('[data-video-grid] > li')]
          .map((item) => item.style.getPropertyValue('view-transition-name'))
          .filter(Boolean),
      );
      update();
      return { finished };
    });
    (dom.document as unknown as { startViewTransition: unknown }).startViewTransition = start;
    return { start, named, rootLive };
  };

  const names = (dom: Dom) =>
    [...dom.document.querySelectorAll<HTMLElement>('[data-video-grid] > li')]
      .map((item) => item.style.getPropertyValue('view-transition-name'))
      .filter(Boolean);

  it('morphs them, naming only the tiles that were on screen', async () => {
    // Three columns: 3 shown leave none over, 14 leave two, so the first two
    // tiles go from a third of the row to half of it.
    const dom = listDom(14, { initial: 3 });
    dom.setMedia(DESKTOP, true);
    const { start, named, rootLive } = withViewTransitions(dom);
    await load(dom);

    button(dom).click();
    await settle();

    expect(start).toHaveBeenCalledTimes(1);
    expect(named[0]).toEqual(['qa-recent-0', 'qa-recent-1', 'qa-recent-2']);
    // The rest of the page stays live during the morph rather than being
    // captured and cross-faded.
    expect(rootLive).toEqual([true]);
    // Cleared afterwards, so the next unrelated transition is not a morph.
    expect(names(dom)).toEqual([]);
    expect(dom.document.documentElement.hasAttribute('data-video-morph')).toBe(false);
  });

  it('applies the change inside the transition, focus included', async () => {
    const dom = listDom(14, { initial: 3 });
    dom.setMedia(DESKTOP, true);
    withViewTransitions(dom);
    await load(dom);

    button(dom).click();

    expect(dom.document.querySelector('[data-video-grid]')?.getAttribute('data-rem-3')).toBe('2');
    expect(dom.document.activeElement).toBe(
      dom.document.querySelector('[data-video-id="v3"] button'),
    );
  });

  it('clears the names even if the transition is abandoned', async () => {
    const dom = listDom(14, { initial: 3 });
    dom.setMedia(DESKTOP, true);
    withViewTransitions(dom, Promise.reject(new Error('skipped')));
    await load(dom);

    button(dom).click();
    await settle();

    expect(names(dom)).toEqual([]);
  });

  it('uses the columns on screen now, not every breakpoint', async () => {
    // 3 → 15 leaves one over on two columns both times: on a tablet nothing
    // on screen changes size, so there is nothing to morph.
    const dom = listDom(15, { initial: 3 });
    dom.setMedia(TABLET, true);
    const { start } = withViewTransitions(dom);
    await load(dom);

    button(dom).click();

    expect(start).not.toHaveBeenCalled();
  });

  it('does morph on a tablet when the two-column remainder changes', async () => {
    const dom = listDom(14, { initial: 3 });
    dom.setMedia(TABLET, true);
    const { start } = withViewTransitions(dom);
    await load(dom);

    button(dom).click();

    expect(start).toHaveBeenCalledTimes(1);
  });

  it('never morphs on a phone, where there is one column', async () => {
    const dom = listDom(14, { initial: 3 });
    const { start } = withViewTransitions(dom);
    await load(dom);

    button(dom).click();

    expect(start).not.toHaveBeenCalled();
  });

  it('changes instantly with reduced motion', async () => {
    const dom = listDom(14, { initial: 3 });
    dom.setMedia(DESKTOP, true);
    dom.setMedia('(prefers-reduced-motion: reduce)', true);
    const { start } = withViewTransitions(dom);
    await load(dom);

    button(dom).click();

    expect(start).not.toHaveBeenCalled();
    expect(dom.document.querySelector('[data-video-grid]')?.getAttribute('data-rem-3')).toBe('2');
  });

  it('changes instantly where View Transitions do not exist', async () => {
    const dom = listDom(14, { initial: 3 });
    dom.setMedia(DESKTOP, true);
    await load(dom);

    button(dom).click();

    expect(dom.document.querySelector('[data-video-grid]')?.getAttribute('data-rem-3')).toBe('2');
  });
});

describe('applyPaging', () => {
  it('keeps the visitor’s place when the list changes under it', async () => {
    const dom = await load(listDom(15, { initial: 3, step: 4 }));
    button(dom).click();

    // A refresh puts a new tile at the top.
    const grid = dom.document.querySelector('[data-video-grid]')!;
    const extra = dom.document.createElement('li');
    grid.prepend(extra);

    const { applyPaging } = await import('~/scripts/video-list');
    applyPaging(dom.document.querySelector<HTMLElement>('[data-video-list]')!);

    expect(visible(dom)).toBe(7);
    expect(extra.hidden).toBe(false);
  });

  it('leaves an already-correct label alone', async () => {
    const dom = await load(listDom(15, { initial: 3 }));
    const label = dom.document.querySelector('[data-video-more-label]')!;
    const text = label.firstChild;

    const { applyPaging } = await import('~/scripts/video-list');
    applyPaging(dom.document.querySelector<HTMLElement>('[data-video-list]')!);

    expect(label.firstChild).toBe(text);
  });
});
