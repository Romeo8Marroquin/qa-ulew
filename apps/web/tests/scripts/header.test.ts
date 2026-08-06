// @vitest-environment happy-dom
/**
 * Three independent behaviours share this file because they share a component:
 * the scrolled state, the home link, and the mobile menu.
 *
 * The one worth reading the comments for is the pair of observers. The backdrop
 * (`data-scrolled`) and the wordmark (`data-past-hero`) used to be one flag,
 * which forced a choice between navigation floating illegibly over the moving
 * hero and the wordmark appearing while the hero's own was still on screen.
 * They are deliberately decoupled, and these tests are what stop them being
 * recombined by someone who reads the code and not the reason.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createDom, type Dom } from '../helpers/dom';

const HEADER = `
  <header data-site-header class="qa-header">
    <a href="/" data-home-link aria-label="Inicio"><span>logo</span></a>
    <nav aria-label="Navegación principal"><a href="#videos">Videos</a></nav>
    <button type="button" data-menu-toggle aria-expanded="false" aria-controls="qa-mobile-nav">
      Menú
    </button>
  </header>
  <div id="qa-mobile-nav" data-mobile-nav>
    <nav aria-label="Navegación del menú">
      <ul role="list">
        <li><a href="#videos" id="first-link">Videos</a></li>
        <li><a href="#about" id="second-link">Nosotros</a></li>
      </ul>
    </nav>
  </div>
  <main id="main" tabindex="-1">
    <section class="qa-hero">Hero</section>
  </main>
  <a href="/elsewhere" id="outside">Outside</a>
`;

/** The overlay variant, which is what the landing page renders. */
const OVERLAY_HEADER = HEADER.replace('data-site-header', 'data-site-header data-overlay');

async function load(dom: Dom) {
  vi.resetModules();
  await import('~/scripts/header');
  return dom;
}

const el = (dom: Dom, selector: string) => dom.document.querySelector(selector)!;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('the scrolled state', () => {
  it('adds a top sentinel that is hidden from assistive tech', async () => {
    // It is an empty 1px div with no content. Left in the accessibility tree it
    // is a stray unlabelled node at the very top of every page.
    const dom = await load(createDom(HEADER));
    const sentinel = dom.document.body.firstElementChild!;

    expect(sentinel.getAttribute('aria-hidden')).toBe('true');
    // happy-dom re-serialises cssText ("position: absolute; top: 0px"), so the
    // comparison drops whitespace rather than depending on how it formats.
    const style = sentinel.getAttribute('style')?.replace(/\s+/g, '') ?? '';
    expect(style).toContain('position:absolute');
    expect(style).toContain('pointer-events:none');
  });

  it('observes the sentinel rather than listening to scroll', async () => {
    // An IntersectionObserver is handled off the main thread; a scroll listener
    // runs on it, on every frame, and is a classic source of jank.
    const dom = await load(createDom(HEADER));

    expect(dom.observers[0]?.observed[0]).toBe(dom.document.body.firstElementChild);
    expect(dom.observers[0]?.options).toEqual({ threshold: 0 });
  });

  it('is off at the top of the page', async () => {
    const dom = await load(createDom(HEADER));
    const sentinel = dom.document.body.firstElementChild!;

    dom.observers[0]?.trigger([{ target: sentinel, isIntersecting: true }]);

    expect(el(dom, '[data-site-header]').hasAttribute('data-scrolled')).toBe(false);
  });

  it('comes on as soon as the page moves at all', async () => {
    const dom = await load(createDom(HEADER));
    const sentinel = dom.document.body.firstElementChild!;

    dom.observers[0]?.trigger([{ target: sentinel, isIntersecting: false }]);

    expect(el(dom, '[data-site-header]').hasAttribute('data-scrolled')).toBe(true);
  });

  it('assumes the top when the observer reports nothing', async () => {
    // The `?? true` fallback. A missing entry must not read as "scrolled".
    const dom = await load(createDom(HEADER));

    dom.observers[0]?.trigger([]);

    expect(el(dom, '[data-site-header]').hasAttribute('data-scrolled')).toBe(false);
  });

  it('does nothing at all on a page with no header', async () => {
    const dom = createDom('<main id="main">Just content</main>');

    await expect(load(dom)).resolves.toBeDefined();
    expect(dom.observers).toHaveLength(0);
  });
});

describe('the wordmark, past the hero', () => {
  it('watches the hero only on an overlay page', async () => {
    const dom = await load(createDom(OVERLAY_HEADER));

    // Second observer: the sentinel is first. Order is the only handle on
    // which is which, so it is asserted rather than assumed.
    expect(dom.observers).toHaveLength(2);
    expect(dom.observers[1]?.observed[0]).toBe(el(dom, '.qa-hero'));
  });

  it('offsets the observer by the measured header height', async () => {
    // `rootMargin` accepts px and % only — never rem — so the height has to be
    // measured rather than read from the custom property that defines it.
    const dom = createDom(OVERLAY_HEADER);
    const header = el(dom, '[data-site-header]');
    header.getBoundingClientRect = () => ({ height: 72 }) as DOMRect;

    await load(dom);

    expect(dom.observers[1]?.options).toEqual({
      rootMargin: '-72px 0px 0px 0px',
      threshold: 0,
    });
  });

  it('falls back to 72px when the header cannot be measured', async () => {
    // happy-dom reports 0 here, which is also what a browser returns before
    // layout. `|| 72` keeps the margin from collapsing to nothing.
    const dom = await load(createDom(OVERLAY_HEADER));

    expect(dom.observers[1]?.options).toEqual({
      rootMargin: '-72px 0px 0px 0px',
      threshold: 0,
    });
  });

  it('shows the wordmark once the hero has cleared', async () => {
    const dom = await load(createDom(OVERLAY_HEADER));

    dom.observers[1]?.trigger([{ target: el(dom, '.qa-hero'), isIntersecting: false }]);

    expect(el(dom, '[data-site-header]').hasAttribute('data-past-hero')).toBe(true);
  });

  it('hides it again while any of the hero is visible', async () => {
    const dom = await load(createDom(OVERLAY_HEADER));

    dom.observers[1]?.trigger([{ target: el(dom, '.qa-hero'), isIntersecting: true }]);

    expect(el(dom, '[data-site-header]').hasAttribute('data-past-hero')).toBe(false);
  });

  it('keeps it hidden when the observer reports nothing', async () => {
    const dom = await load(createDom(OVERLAY_HEADER));

    dom.observers[1]?.trigger([]);

    expect(el(dom, '[data-site-header]').hasAttribute('data-past-hero')).toBe(false);
  });

  it('does not watch the hero on a page without the overlay', async () => {
    // The 404 page: a normal header, no hero, so the wordmark is simply
    // always visible and there is nothing to observe.
    const dom = await load(createDom(HEADER));

    expect(dom.observers).toHaveLength(1);
  });

  it('does not watch when the header overlays but the page has no hero', async () => {
    const dom = await load(createDom(OVERLAY_HEADER.replace('qa-hero', 'not-a-hero')));

    expect(dom.observers).toHaveLength(1);
  });
});

describe('the backdrop and the menu together', () => {
  it('forces the backdrop on while the menu is open, even at the top', async () => {
    // An open panel over a transparent header shows the page through the links.
    const dom = await load(createDom(HEADER));

    el(dom, '[data-menu-toggle]').dispatchEvent(new dom.Event('click', { bubbles: true }));

    expect(el(dom, '[data-site-header]').hasAttribute('data-scrolled')).toBe(true);
  });

  it('releases it again when the menu closes at the top of the page', async () => {
    const dom = await load(createDom(HEADER));
    const toggle = el(dom, '[data-menu-toggle]') as HTMLButtonElement;

    toggle.click();
    toggle.click();

    expect(el(dom, '[data-site-header]').hasAttribute('data-scrolled')).toBe(false);
  });

  it('keeps it on after the menu closes if the page is scrolled', async () => {
    const dom = await load(createDom(HEADER));
    const toggle = el(dom, '[data-menu-toggle]') as HTMLButtonElement;
    const sentinel = dom.document.body.firstElementChild!;

    dom.observers[0]?.trigger([{ target: sentinel, isIntersecting: false }]);
    toggle.click();
    toggle.click();

    expect(el(dom, '[data-site-header]').hasAttribute('data-scrolled')).toBe(true);
  });
});

describe('the home link', () => {
  it('scrolls instead of reloading when already on that page', async () => {
    // Following the link would tear down and repaint the document, re-run the
    // theme boot script, and flicker — for a navigation to where you already
    // are.
    const dom = await load(createDom(HEADER));
    const event = new dom.MouseEvent('click', { bubbles: true, cancelable: true });

    el(dom, '[data-home-link]').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(dom.scrolls).toEqual([{ top: 0, behavior: 'smooth' }]);
  });

  it('jumps rather than glides under prefers-reduced-motion', async () => {
    const dom = createDom(HEADER);
    dom.setMedia('(prefers-reduced-motion: reduce)', true);
    await load(dom);

    el(dom, '[data-home-link]').dispatchEvent(
      new dom.MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    expect(dom.scrolls).toEqual([{ top: 0, behavior: 'auto' }]);
  });

  it('moves focus to <main> so keyboard users follow the scroll', async () => {
    const dom = await load(createDom(HEADER));

    el(dom, '[data-home-link]').dispatchEvent(
      new dom.MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    expect(dom.document.activeElement?.id).toBe('main');
  });

  it('clears a leftover #hash from the address bar', async () => {
    // The URL should match what is now on screen, and `replaceState` avoids a
    // history entry so Back still goes where the visitor expects.
    const dom = createDom(HEADER, { url: 'https://qa-ulew.tv/#contact' });
    const replaceState = vi.fn();
    vi.stubGlobal('history', { replaceState });
    await load(dom);

    el(dom, '[data-home-link]').dispatchEvent(
      new dom.MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    expect(replaceState).toHaveBeenCalledWith(null, '', '/');
  });

  it('leaves the URL alone when there is no hash', async () => {
    const dom = createDom(HEADER, { url: 'https://qa-ulew.tv/' });
    const replaceState = vi.fn();
    vi.stubGlobal('history', { replaceState });
    await load(dom);

    el(dom, '[data-home-link]').dispatchEvent(
      new dom.MouseEvent('click', { bubbles: true, cancelable: true }),
    );

    expect(replaceState).not.toHaveBeenCalled();
  });

  it('navigates normally when the destination is a different page', async () => {
    // The 404 page's header links home from /404, which is a real navigation.
    const dom = createDom(HEADER, { url: 'https://qa-ulew.tv/404' });
    await load(dom);
    const event = new dom.MouseEvent('click', { bubbles: true, cancelable: true });

    el(dom, '[data-home-link]').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(dom.scrolls).toEqual([]);
  });

  it.each([
    ['meta', 'metaKey'],
    ['ctrl', 'ctrlKey'],
    ['shift', 'shiftKey'],
    ['alt', 'altKey'],
  ])('never hijacks a %s-click — that is a deliberate new tab', async (_name, key) => {
    const dom = await load(createDom(HEADER));
    const event = new dom.MouseEvent('click', { bubbles: true, cancelable: true });
    Object.assign(event, { [key]: true, button: 0 });

    el(dom, '[data-home-link]').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    expect(dom.scrolls).toEqual([]);
  });

  it('ignores a middle-click, which opens a new tab', async () => {
    const dom = await load(createDom(HEADER));
    const event = new dom.MouseEvent('click', { bubbles: true, cancelable: true });
    Object.assign(event, { button: 1 });

    el(dom, '[data-home-link]').dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  it('stands down if something else already handled the click', async () => {
    const dom = await load(createDom(HEADER));
    const link = el(dom, '[data-home-link]');
    link.addEventListener('click', (event) => event.preventDefault(), { capture: true });

    const event = new dom.MouseEvent('click', { bubbles: true, cancelable: true });
    link.dispatchEvent(event);

    expect(dom.scrolls).toEqual([]);
  });
});

describe('the mobile menu', () => {
  const open = (dom: Dom) => (el(dom, '[data-menu-toggle]') as HTMLButtonElement).click();

  it('opens on the toggle and reports it in aria-expanded', async () => {
    const dom = await load(createDom(HEADER));

    open(dom);

    expect(el(dom, '[data-mobile-nav]').hasAttribute('data-open')).toBe(true);
    expect(el(dom, '[data-menu-toggle]').getAttribute('aria-expanded')).toBe('true');
  });

  it('closes on a second press', async () => {
    const dom = await load(createDom(HEADER));

    open(dom);
    open(dom);

    expect(el(dom, '[data-mobile-nav]').hasAttribute('data-open')).toBe(false);
    expect(el(dom, '[data-menu-toggle]').getAttribute('aria-expanded')).toBe('false');
  });

  it('moves focus to the first link on open', async () => {
    // Opening a panel and leaving focus behind means the next Tab starts from
    // the toggle, not from the menu that just appeared.
    const dom = await load(createDom(HEADER));

    open(dom);

    expect(dom.document.activeElement?.id).toBe('first-link');
  });

  it('returns focus to the toggle when closed from inside', async () => {
    const dom = await load(createDom(HEADER));

    open(dom);
    dom.document.dispatchEvent(new dom.Event('keydown'));
    const event = new dom.Event('keydown') as KeyboardEvent;
    Object.assign(event, { key: 'Escape' });
    dom.document.dispatchEvent(event);

    expect(dom.document.activeElement).toBe(el(dom, '[data-menu-toggle]'));
  });

  it('closes on Escape', async () => {
    const dom = await load(createDom(HEADER));

    open(dom);
    const event = new dom.Event('keydown');
    Object.assign(event, { key: 'Escape' });
    dom.document.dispatchEvent(event);

    expect(el(dom, '[data-mobile-nav]').hasAttribute('data-open')).toBe(false);
  });

  it('ignores other keys', async () => {
    const dom = await load(createDom(HEADER));

    open(dom);
    const event = new dom.Event('keydown');
    Object.assign(event, { key: 'a' });
    dom.document.dispatchEvent(event);

    expect(el(dom, '[data-mobile-nav]').hasAttribute('data-open')).toBe(true);
  });

  it('closes after following an in-page link', async () => {
    const dom = await load(createDom(HEADER));

    open(dom);
    dom.document
      .getElementById('first-link')
      ?.dispatchEvent(new dom.Event('click', { bubbles: true }));

    expect(el(dom, '[data-mobile-nav]').hasAttribute('data-open')).toBe(false);
  });

  it('stays open when the click inside missed a link', async () => {
    const dom = await load(createDom(HEADER));

    open(dom);
    el(dom, '[data-mobile-nav] ul').dispatchEvent(new dom.Event('click', { bubbles: true }));

    expect(el(dom, '[data-mobile-nav]').hasAttribute('data-open')).toBe(true);
  });

  it('closes on a press outside', async () => {
    const dom = await load(createDom(HEADER));

    open(dom);
    const event = new dom.Event('pointerdown', { bubbles: true });
    dom.document.getElementById('outside')?.dispatchEvent(event);

    expect(el(dom, '[data-mobile-nav]').hasAttribute('data-open')).toBe(false);
  });

  it('survives a press on the toggle itself', async () => {
    // The toggle is excluded from the outside-press handler, or its own click
    // handler would be immediately undone and the menu could never open.
    const dom = await load(createDom(HEADER));

    open(dom);
    el(dom, '[data-menu-toggle]').dispatchEvent(new dom.Event('pointerdown', { bubbles: true }));

    expect(el(dom, '[data-mobile-nav]').hasAttribute('data-open')).toBe(true);
  });

  it('survives a press inside the panel', async () => {
    const dom = await load(createDom(HEADER));

    open(dom);
    dom.document
      .getElementById('first-link')
      ?.dispatchEvent(new dom.Event('pointerdown', { bubbles: true }));

    expect(el(dom, '[data-mobile-nav]').hasAttribute('data-open')).toBe(true);
  });

  it('ignores presses while it is already closed', async () => {
    const dom = await load(createDom(HEADER));

    dom.document
      .getElementById('outside')
      ?.dispatchEvent(new dom.Event('pointerdown', { bubbles: true }));

    expect(el(dom, '[data-mobile-nav]').hasAttribute('data-open')).toBe(false);
  });

  it('closes when focus tabs out of the panel', async () => {
    // A disclosure, not a modal: focus is deliberately not trapped, so the
    // panel has to close itself once focus moves past it.
    const dom = await load(createDom(HEADER));

    open(dom);
    const event = new dom.Event('focusout', { bubbles: true });
    Object.assign(event, { relatedTarget: dom.document.getElementById('outside') });
    el(dom, '[data-mobile-nav]').dispatchEvent(event);

    expect(el(dom, '[data-mobile-nav]').hasAttribute('data-open')).toBe(false);
  });

  it('stays open while focus moves between its own links', async () => {
    const dom = await load(createDom(HEADER));

    open(dom);
    const event = new dom.Event('focusout', { bubbles: true });
    Object.assign(event, { relatedTarget: dom.document.getElementById('second-link') });
    el(dom, '[data-mobile-nav]').dispatchEvent(event);

    expect(el(dom, '[data-mobile-nav]').hasAttribute('data-open')).toBe(true);
  });

  it('stays open when focus moves back to the toggle', async () => {
    const dom = await load(createDom(HEADER));

    open(dom);
    const event = new dom.Event('focusout', { bubbles: true });
    Object.assign(event, { relatedTarget: el(dom, '[data-menu-toggle]') });
    el(dom, '[data-mobile-nav]').dispatchEvent(event);

    expect(el(dom, '[data-mobile-nav]').hasAttribute('data-open')).toBe(true);
  });

  it('stays open when focus leaves the document entirely', async () => {
    // `relatedTarget` is null when the user switches browser tabs or clicks
    // the address bar. Closing then means coming back to find the menu gone.
    const dom = await load(createDom(HEADER));

    open(dom);
    const event = new dom.Event('focusout', { bubbles: true });
    Object.assign(event, { relatedTarget: null });
    el(dom, '[data-mobile-nav]').dispatchEvent(event);

    expect(el(dom, '[data-mobile-nav]').hasAttribute('data-open')).toBe(true);
  });

  it('closes when the viewport grows past the mobile breakpoint', async () => {
    // The toggle is `md:hidden`. Rotating a tablet with the menu open would
    // otherwise leave a panel on screen with no way to dismiss it.
    const dom = createDom(HEADER);
    dom.setMedia('(min-width: 768px)', false);
    await load(dom);

    open(dom);
    dom.media.get('(min-width: 768px)')?.emit(true);

    expect(el(dom, '[data-mobile-nav]').hasAttribute('data-open')).toBe(false);
  });

  it('does nothing when the viewport shrinks', async () => {
    const dom = createDom(HEADER);
    dom.setMedia('(min-width: 768px)', true);
    await load(dom);

    open(dom);
    dom.media.get('(min-width: 768px)')?.emit(false);

    expect(el(dom, '[data-mobile-nav]').hasAttribute('data-open')).toBe(true);
  });

  it('does nothing when asked to close while already closed', async () => {
    /*
     * The `if (open === isOpen()) return` guard. Escape is a global listener,
     * so it fires on every press anywhere on the page — without the guard each
     * one would re-announce `aria-expanded="false"`, dispatch another `qa:menu`
     * event, and recompute the header backdrop, for a menu that is not there.
     */
    const dom = await load(createDom(HEADER));
    const events: unknown[] = [];
    dom.document.addEventListener('qa:menu', (event) => events.push(event));

    const escape = new dom.Event('keydown');
    Object.assign(escape, { key: 'Escape' });
    dom.document.dispatchEvent(escape);
    dom.document.dispatchEvent(escape);

    expect(events).toHaveLength(0);
    expect(el(dom, '[data-menu-toggle]').getAttribute('aria-expanded')).toBe('false');
  });

  it('does not steal focus back when focus has already moved on', async () => {
    /*
     * The `else if (nav.contains(document.activeElement))` guard. Closing the
     * panel returns focus to the toggle ONLY when focus is still inside the
     * thing being closed. Without the check, clicking somewhere else on the
     * page would close the menu and then yank the cursor back up to the header
     * — focus jumping to somewhere the user did not put it.
     */
    const dom = await load(createDom(HEADER));
    const outside = dom.document.getElementById('outside') as HTMLAnchorElement;

    (el(dom, '[data-menu-toggle]') as HTMLButtonElement).click();
    outside.focus();

    const escape = new dom.Event('keydown');
    Object.assign(escape, { key: 'Escape' });
    dom.document.dispatchEvent(escape);

    expect(dom.document.activeElement).toBe(outside);
    expect(el(dom, '[data-mobile-nav]').hasAttribute('data-open')).toBe(false);
  });

  it('is inert on a page with no menu', async () => {
    const dom = createDom('<header data-site-header></header><main id="main"></main>');

    await expect(load(dom)).resolves.toBeDefined();
  });
});
