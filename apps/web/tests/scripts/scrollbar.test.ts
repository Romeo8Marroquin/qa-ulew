// @vitest-environment happy-dom
/**
 * The safeguard is the thing to protect here.
 *
 * `global.css` hides the native scrollbar behind `html[data-custom-scrollbar]`,
 * and ONLY this script sets that attribute. So the order is load-bearing: if
 * this module never runs — blocked, errored, a touch device — the native bar
 * stays exactly where it was and the page is never left with no way to see or
 * drag the scroll position. Several tests below exist purely to hold that line.
 *
 * The geometry is stubbed because happy-dom does no layout: every measurement
 * would be 0 and the maths would divide its way to NaN. The numbers used are
 * what a browser reports for a 2000px page in an 800px viewport.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDom, removeResizeObserver, setScrollY, stubLayout, type Dom } from '../helpers/dom';

const MARKUP = `
  <div class="qa-scrollbar" aria-hidden="true" data-scrollbar hidden>
    <div class="qa-scrollbar-thumb" data-scrollbar-thumb></div>
  </div>
`;

/** Matches IDLE_MS in the module. */
const IDLE_MS = 700;

function setup(markup = MARKUP, { fine = true }: { fine?: boolean } = {}): Dom {
  const dom = createDom(markup);
  dom.setMedia('(pointer: fine)', fine);
  stubLayout(dom);

  const thumb = dom.document.querySelector('[data-scrollbar-thumb]');
  if (thumb) {
    // happy-dom implements neither, and both are called during a drag.
    Object.assign(thumb, {
      setPointerCapture: vi.fn(),
      releasePointerCapture: vi.fn(),
    });
  }
  return dom;
}

async function load(dom: Dom) {
  vi.resetModules();
  await import('~/scripts/scrollbar');
  return dom;
}

const bar = (dom: Dom) => dom.document.querySelector('[data-scrollbar]')!;
const thumb = (dom: Dom) => dom.document.querySelector('[data-scrollbar-thumb]') as HTMLElement;

/** A pointer event carrying the fields the module reads. */
function pointer(
  dom: Dom,
  type: string,
  fields: Partial<{ clientX: number; clientY: number; pointerType: string; pointerId: number }>,
) {
  const event = new dom.Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { pointerType: 'mouse', pointerId: 1, clientX: 0, clientY: 0, ...fields });
  return event;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('mounting, and the safeguard around it', () => {
  it('reveals the custom bar and only then hides the native one', async () => {
    const dom = await load(setup());

    expect(bar(dom).hasAttribute('hidden')).toBe(false);
    expect(dom.document.documentElement.hasAttribute('data-custom-scrollbar')).toBe(true);
  });

  it('leaves the native scrollbar alone on a touch device', async () => {
    // Touch platforms already draw transient overlay scrollbars that behave
    // correctly. Replacing them would be worse, not better.
    const dom = await load(setup(MARKUP, { fine: false }));

    expect(dom.document.documentElement.hasAttribute('data-custom-scrollbar')).toBe(false);
    expect(bar(dom).hasAttribute('hidden')).toBe(true);
  });

  it('leaves the native scrollbar alone when the markup is missing', async () => {
    // The critical failure mode: never hide the real bar without putting a
    // working one in its place.
    const dom = await load(setup('<p>No scrollbar markup</p>'));

    expect(dom.document.documentElement.hasAttribute('data-custom-scrollbar')).toBe(false);
  });

  it('leaves it alone when the thumb is missing', async () => {
    const dom = await load(setup('<div data-scrollbar hidden></div>'));

    expect(dom.document.documentElement.hasAttribute('data-custom-scrollbar')).toBe(false);
  });

  it('is hidden from assistive tech — it duplicates native scrolling', async () => {
    const dom = await load(setup());

    expect(bar(dom).getAttribute('aria-hidden')).toBe('true');
  });
});

describe('geometry', () => {
  it('sizes the thumb to the visible fraction of the page', async () => {
    // 800/2000 of an 800px track = 320px.
    const dom = await load(setup());

    expect(thumb(dom).style.height).toBe('320px');
  });

  it('never lets the thumb get too small to grab', async () => {
    // A very long page would compute a few pixels. MIN_THUMB is 32.
    const dom = setup();
    stubLayout(dom, { scrollHeight: 500000, innerHeight: 800, barHeight: 800 });

    await load(dom);

    expect(thumb(dom).style.height).toBe('32px');
  });

  it('collapses the thumb when there is nothing to scroll', async () => {
    // A short page. Drawing a full-height thumb that cannot move is worse than
    // drawing none.
    const dom = setup();
    stubLayout(dom, { scrollHeight: 800, innerHeight: 800, barHeight: 800 });

    await load(dom);

    expect(thumb(dom).style.height).toBe('0px');
    expect(bar(dom).hasAttribute('data-visible')).toBe(false);
  });

  it('positions the thumb from the scroll position', async () => {
    const dom = setup();
    // Halfway down 1200px of scrollable height, across 480px of travel.
    setScrollY(dom, 600);
    await load(dom);

    expect(thumb(dom).style.transform).toBe('translateY(240px)');
  });

  it('pins the thumb to the bottom rather than overshooting', async () => {
    // `Math.min(1, …)` — elastic overscroll on macOS reports a scrollY past
    // the maximum, which would push the thumb below the track.
    const dom = setup();
    setScrollY(dom, 99999);
    await load(dom);

    expect(thumb(dom).style.transform).toBe('translateY(480px)');
  });

  it('pins it to the top on negative overscroll', async () => {
    const dom = setup();
    setScrollY(dom, -200);
    await load(dom);

    expect(thumb(dom).style.transform).toBe('translateY(0px)');
  });

  it('re-measures when the content changes height', async () => {
    // Fonts and images settling change both the thumb's size and its travel.
    const dom = setup();
    await load(dom);

    stubLayout(dom, { scrollHeight: 4000, innerHeight: 800, barHeight: 800 });
    dom.resizeObservers[0]?.trigger();

    expect(thumb(dom).style.height).toBe('160px');
  });

  it('observes the body for those height changes', async () => {
    const dom = await load(setup());

    expect(dom.resizeObservers[0]?.observed).toEqual([dom.document.body]);
  });

  it('works in a browser with no ResizeObserver', async () => {
    const dom = setup();
    removeResizeObserver(dom);

    await expect(load(dom)).resolves.toBeDefined();
    expect(thumb(dom).style.height).toBe('320px');
  });

  it('re-measures on resize', async () => {
    const dom = await load(setup());

    stubLayout(dom, { scrollHeight: 4000, innerHeight: 800, barHeight: 800 });
    dom.window.dispatchEvent(new dom.Event('resize'));

    expect(thumb(dom).style.height).toBe('160px');
  });
});

describe('showing and hiding', () => {
  it('appears while the page is scrolling', async () => {
    const dom = await load(setup());

    setScrollY(dom, 400);
    dom.window.dispatchEvent(new dom.Event('scroll'));

    expect(bar(dom).hasAttribute('data-visible')).toBe(true);
    expect(thumb(dom).style.transform).toBe('translateY(160px)');
  });

  it('fades out once scrolling stops', async () => {
    const dom = await load(setup());

    dom.window.dispatchEvent(new dom.Event('scroll'));
    vi.advanceTimersByTime(IDLE_MS);

    expect(bar(dom).hasAttribute('data-visible')).toBe(false);
  });

  it('stays up while the pointer is beside it', async () => {
    const dom = await load(setup());

    dom.window.dispatchEvent(new dom.Event('scroll'));
    dom.window.dispatchEvent(pointer(dom, 'pointermove', { clientX: 1195, clientY: 100 }));
    vi.advanceTimersByTime(IDLE_MS);

    expect(bar(dom).hasAttribute('data-visible')).toBe(true);
  });

  it('stays up mid-drag', async () => {
    const dom = await load(setup());

    thumb(dom).dispatchEvent(pointer(dom, 'pointerdown', { clientY: 10 }));
    dom.window.dispatchEvent(new dom.Event('scroll'));
    vi.advanceTimersByTime(IDLE_MS);

    expect(bar(dom).hasAttribute('data-visible')).toBe(true);
  });

  it('resets the timer on each scroll rather than stacking them', async () => {
    const dom = await load(setup());

    dom.window.dispatchEvent(new dom.Event('scroll'));
    vi.advanceTimersByTime(IDLE_MS - 100);
    dom.window.dispatchEvent(new dom.Event('scroll'));
    vi.advanceTimersByTime(IDLE_MS - 100);

    expect(bar(dom).hasAttribute('data-visible')).toBe(true);
  });
});

describe('pointer proximity', () => {
  it('reveals the bar near the right edge', async () => {
    const dom = await load(setup());

    dom.window.dispatchEvent(pointer(dom, 'pointermove', { clientX: 1170, clientY: 100 }));

    expect(bar(dom).hasAttribute('data-visible')).toBe(true);
  });

  it('thickens it only when the pointer is over the thumb itself', async () => {
    // TWO zones on purpose. One combined zone meant drifting anywhere near the
    // edge inflated the bar, which felt like the interface lunging at the
    // cursor. `clientX: 1195` is 5px from the edge; the thumb spans 0–320.
    const dom = await load(setup());

    dom.window.dispatchEvent(pointer(dom, 'pointermove', { clientX: 1195, clientY: 100 }));

    expect(bar(dom).hasAttribute('data-hot')).toBe(true);
  });

  it('does not thicken while merely near the edge', async () => {
    // 30px in: inside EDGE_PX (44) but outside HOT_X (10).
    const dom = await load(setup());

    dom.window.dispatchEvent(pointer(dom, 'pointermove', { clientX: 1170, clientY: 100 }));

    expect(bar(dom).hasAttribute('data-visible')).toBe(true);
    expect(bar(dom).hasAttribute('data-hot')).toBe(false);
  });

  it('does not thicken when beside the track but above the thumb', async () => {
    const dom = setup();
    setScrollY(dom, 1200);
    await load(dom);

    // Thumb is at the bottom (480–800); the pointer is at the top.
    dom.window.dispatchEvent(pointer(dom, 'pointermove', { clientX: 1195, clientY: 10 }));

    expect(bar(dom).hasAttribute('data-hot')).toBe(false);
  });

  it('cools off when the pointer leaves the edge', async () => {
    const dom = await load(setup());

    dom.window.dispatchEvent(pointer(dom, 'pointermove', { clientX: 1195, clientY: 100 }));
    expect(bar(dom).hasAttribute('data-hot')).toBe(true);

    dom.window.dispatchEvent(pointer(dom, 'pointermove', { clientX: 300, clientY: 100 }));
    expect(bar(dom).hasAttribute('data-hot')).toBe(false);
  });

  it('ignores a pen or a finger', async () => {
    // The bar is a mouse-shaped affordance; a touch should not summon it.
    const dom = await load(setup());

    dom.window.dispatchEvent(
      pointer(dom, 'pointermove', { clientX: 1195, clientY: 100, pointerType: 'touch' }),
    );

    expect(bar(dom).hasAttribute('data-visible')).toBe(false);
  });

  it('ignores proximity mid-drag', async () => {
    // During a drag the pointer routinely leaves the edge; recomputing "hot"
    // would make the thumb thin out under the cursor holding it.
    const dom = await load(setup());

    dom.window.dispatchEvent(pointer(dom, 'pointermove', { clientX: 1195, clientY: 100 }));
    thumb(dom).dispatchEvent(pointer(dom, 'pointerdown', { clientY: 10 }));
    dom.window.dispatchEvent(pointer(dom, 'pointermove', { clientX: 300, clientY: 100 }));

    expect(bar(dom).hasAttribute('data-hot')).toBe(true);
  });
});

describe('dragging', () => {
  it('captures the pointer and suppresses the default drag', async () => {
    const dom = await load(setup());
    const event = pointer(dom, 'pointerdown', { clientY: 10 });

    thumb(dom).dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(bar(dom).hasAttribute('data-dragging')).toBe(true);
    expect(thumb(dom).setPointerCapture).toHaveBeenCalledWith(1);
  });

  it('scrolls the page as the pointer moves', async () => {
    const dom = await load(setup());

    thumb(dom).dispatchEvent(pointer(dom, 'pointerdown', { clientY: 0 }));
    thumb(dom).dispatchEvent(pointer(dom, 'pointermove', { clientY: 240 }));

    // Half of 480px of travel = half of 1200px of scrollable height.
    expect(dom.scrolls.at(-1)).toEqual({ top: 600, behavior: 'instant' });
  });

  it('scrolls instantly, never through the smooth scroller', async () => {
    /*
     * `instant`, not `auto`. Per CSSOM-View `auto` means "use the computed
     * scroll-behavior" — and this page sets `scroll-behavior: smooth` on <html>
     * for anchor links. `auto` therefore routed every drag frame through the
     * smooth scroller and the thumb visibly trailed the cursor.
     */
    const dom = await load(setup());

    thumb(dom).dispatchEvent(pointer(dom, 'pointerdown', { clientY: 0 }));
    thumb(dom).dispatchEvent(pointer(dom, 'pointermove', { clientY: 100 }));

    expect(dom.scrolls.every((call) => call.behavior === 'instant')).toBe(true);
  });

  it('holds the grab offset so the thumb does not jump on grab', async () => {
    // Grabbing the middle of the thumb and not moving must not scroll at all.
    const dom = await load(setup());

    thumb(dom).dispatchEvent(pointer(dom, 'pointerdown', { clientY: 160 }));
    thumb(dom).dispatchEvent(pointer(dom, 'pointermove', { clientY: 160 }));

    expect(dom.scrolls.at(-1)).toEqual({ top: 0, behavior: 'instant' });
  });

  it('clamps at both ends of the track', async () => {
    const dom = await load(setup());

    thumb(dom).dispatchEvent(pointer(dom, 'pointerdown', { clientY: 0 }));
    thumb(dom).dispatchEvent(pointer(dom, 'pointermove', { clientY: 99999 }));
    expect(dom.scrolls.at(-1)).toEqual({ top: 1200, behavior: 'instant' });

    thumb(dom).dispatchEvent(pointer(dom, 'pointermove', { clientY: -500 }));
    expect(dom.scrolls.at(-1)).toEqual({ top: 0, behavior: 'instant' });
  });

  it('ignores a move when no drag is in progress', async () => {
    const dom = await load(setup());

    thumb(dom).dispatchEvent(pointer(dom, 'pointermove', { clientY: 200 }));

    expect(dom.scrolls).toEqual([]);
  });

  it('ignores a drag when the thumb has nowhere to travel', async () => {
    /*
     * A very short viewport: the 32px minimum thumb is taller than the 20px
     * track, so `travel` comes out NEGATIVE. Without the guard, `y / travel`
     * inverts the drag — pulling down would scroll up — and the clamp would
     * pin it at one end.
     */
    const dom = setup();
    stubLayout(dom, { scrollHeight: 2000, innerHeight: 800, barHeight: 20 });
    await load(dom);

    thumb(dom).dispatchEvent(pointer(dom, 'pointerdown', { clientY: 0 }));
    thumb(dom).dispatchEvent(pointer(dom, 'pointermove', { clientY: 200 }));

    expect(dom.scrolls).toEqual([]);
  });

  it('releases on pointerup', async () => {
    const dom = await load(setup());

    thumb(dom).dispatchEvent(pointer(dom, 'pointerdown', { clientY: 10 }));
    thumb(dom).dispatchEvent(pointer(dom, 'pointerup', {}));

    expect(bar(dom).hasAttribute('data-dragging')).toBe(false);
    expect(thumb(dom).releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it('releases on pointercancel — a gesture the OS took over', async () => {
    const dom = await load(setup());

    thumb(dom).dispatchEvent(pointer(dom, 'pointerdown', { clientY: 10 }));
    thumb(dom).dispatchEvent(pointer(dom, 'pointercancel', {}));

    expect(bar(dom).hasAttribute('data-dragging')).toBe(false);
  });

  it('ignores a release when nothing was being dragged', async () => {
    // Without the guard this would release a pointer capture that was never
    // taken, which throws in a real browser.
    const dom = await load(setup());

    thumb(dom).dispatchEvent(pointer(dom, 'pointerup', {}));

    expect(thumb(dom).releasePointerCapture).not.toHaveBeenCalled();
  });

  it('lets the bar fade again after the drag ends', async () => {
    const dom = await load(setup());

    thumb(dom).dispatchEvent(pointer(dom, 'pointerdown', { clientY: 10 }));
    thumb(dom).dispatchEvent(pointer(dom, 'pointerup', {}));
    vi.advanceTimersByTime(IDLE_MS);

    expect(bar(dom).hasAttribute('data-visible')).toBe(false);
  });
});
