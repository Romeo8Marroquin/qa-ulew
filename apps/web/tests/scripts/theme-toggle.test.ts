// @vitest-environment happy-dom
/**
 * Two behaviours that are easy to conflate and must not be:
 *
 *   clicking      an explicit choice. Stored, and it wins from then on.
 *   the OS moving followed ONLY while no explicit choice has been stored.
 *
 * Getting the second one wrong is the bug where a visitor picks light mode, the
 * sun goes down, and the site overrides them.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDom, type Dom } from '../helpers/dom';

const MARKUP = '<button data-theme-toggle type="button">Cambiar tema</button>';

/** Must match `FADE_OUT` in the module and the 200ms rule in Hero.astro. */
const FADE_OUT = 200;

async function load(dom: Dom) {
  vi.resetModules();
  await import('~/scripts/theme-toggle');
  return dom.document.querySelector('[data-theme-toggle]') as HTMLButtonElement;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('clicking the toggle', () => {
  it('goes from light to dark', async () => {
    const dom = createDom(MARKUP);
    dom.document.documentElement.dataset.theme = 'light';
    const button = await load(dom);

    button.click();
    vi.advanceTimersByTime(FADE_OUT);

    expect(dom.document.documentElement.dataset.theme).toBe('dark');
  });

  it('goes from dark back to light', async () => {
    const dom = createDom(MARKUP);
    dom.document.documentElement.dataset.theme = 'dark';
    const button = await load(dom);

    button.click();
    vi.advanceTimersByTime(FADE_OUT);

    expect(dom.document.documentElement.dataset.theme).toBe('light');
  });

  it('treats an unset theme as light', async () => {
    // `current()` reads `=== 'dark'`, so anything else means light. The boot
    // script always writes a concrete value, but the module must not depend on
    // having run after it.
    const dom = createDom(MARKUP);
    const button = await load(dom);

    button.click();
    vi.advanceTimersByTime(FADE_OUT);

    expect(dom.document.documentElement.dataset.theme).toBe('dark');
  });

  it('stores the choice so it survives a reload', async () => {
    const dom = createDom(MARKUP);
    dom.document.documentElement.dataset.theme = 'light';
    const button = await load(dom);

    button.click();

    expect(dom.window.localStorage.getItem('qa-theme')).toBe('dark');
  });

  it('still switches when storage throws — private mode', async () => {
    // Safari private browsing throws on setItem. The toggle has to keep working
    // for this page view rather than dying on the write.
    const dom = createDom(MARKUP);
    dom.document.documentElement.dataset.theme = 'light';
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    });
    const button = await load(dom);

    expect(() => button.click()).not.toThrow();
    vi.advanceTimersByTime(FADE_OUT);
    expect(dom.document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('the hero cross-fade', () => {
  it('marks the shift, waits, then swaps and clears', async () => {
    /*
     * The sequence is the point. A straight cross-fade of the hero scrim passes
     * through mid-grey and washes the photograph out, so instead: the scrim
     * fades out, the tokens flip while it is invisible, and the new one fades
     * in. Flipping the theme immediately would show the muddy blend.
     */
    const dom = createDom(MARKUP);
    dom.document.documentElement.dataset.theme = 'light';
    const root = dom.document.documentElement;
    const button = await load(dom);

    button.click();

    expect(root.hasAttribute('data-theme-shift')).toBe(true);
    expect(root.dataset.theme).toBe('light');

    vi.advanceTimersByTime(FADE_OUT - 1);
    expect(root.dataset.theme).toBe('light');

    vi.advanceTimersByTime(1);
    expect(root.dataset.theme).toBe('dark');
    expect(root.hasAttribute('data-theme-shift')).toBe(false);
  });

  it('swaps instantly under prefers-reduced-motion', async () => {
    const dom = createDom(MARKUP);
    dom.setMedia('(prefers-reduced-motion: reduce)', true);
    dom.document.documentElement.dataset.theme = 'light';
    const button = await load(dom);

    button.click();

    // No timer, and no transitional attribute to leave stranded.
    expect(dom.document.documentElement.dataset.theme).toBe('dark');
    expect(dom.document.documentElement.hasAttribute('data-theme-shift')).toBe(false);
  });

  it('cancels a pending swap when clicked twice quickly', async () => {
    // Without `clearTimeout`, two rapid clicks queue two swaps and the theme
    // ends up wherever the last stale timer lands.
    const dom = createDom(MARKUP);
    dom.document.documentElement.dataset.theme = 'light';
    const button = await load(dom);

    button.click();
    vi.advanceTimersByTime(FADE_OUT / 2);
    button.click();
    vi.advanceTimersByTime(FADE_OUT);

    // Two clicks from light: the first targets dark, the second is computed
    // from the theme still on screen — light — so it targets dark as well.
    expect(dom.document.documentElement.dataset.theme).toBe('dark');
    expect(dom.document.documentElement.hasAttribute('data-theme-shift')).toBe(false);
  });
});

describe('following the operating system', () => {
  it('follows a change while no explicit choice is stored', async () => {
    const dom = createDom(MARKUP);
    dom.setMedia('(prefers-color-scheme: dark)', false);
    dom.document.documentElement.dataset.theme = 'light';
    await load(dom);

    dom.media.get('(prefers-color-scheme: dark)')?.emit(true);
    vi.advanceTimersByTime(FADE_OUT);

    expect(dom.document.documentElement.dataset.theme).toBe('dark');
  });

  it('follows back to light as well', async () => {
    const dom = createDom(MARKUP);
    dom.setMedia('(prefers-color-scheme: dark)', true);
    dom.document.documentElement.dataset.theme = 'dark';
    await load(dom);

    dom.media.get('(prefers-color-scheme: dark)')?.emit(false);
    vi.advanceTimersByTime(FADE_OUT);

    expect(dom.document.documentElement.dataset.theme).toBe('light');
  });

  it('ignores the OS once the visitor has chosen light', async () => {
    // The important one. An explicit choice outranks the system from then on.
    const dom = createDom(MARKUP);
    dom.setMedia('(prefers-color-scheme: dark)', false);
    dom.window.localStorage.setItem('qa-theme', 'light');
    dom.document.documentElement.dataset.theme = 'light';
    await load(dom);

    dom.media.get('(prefers-color-scheme: dark)')?.emit(true);
    vi.advanceTimersByTime(FADE_OUT);

    expect(dom.document.documentElement.dataset.theme).toBe('light');
  });

  it('ignores the OS once the visitor has chosen dark', async () => {
    const dom = createDom(MARKUP);
    dom.setMedia('(prefers-color-scheme: dark)', true);
    dom.window.localStorage.setItem('qa-theme', 'dark');
    dom.document.documentElement.dataset.theme = 'dark';
    await load(dom);

    dom.media.get('(prefers-color-scheme: dark)')?.emit(false);
    vi.advanceTimersByTime(FADE_OUT);

    expect(dom.document.documentElement.dataset.theme).toBe('dark');
  });

  it('follows the OS when a junk value is in storage', async () => {
    // Only the two exact strings count as a choice. Anything else — a stale
    // key, a value from another site's script — means "no preference".
    const dom = createDom(MARKUP);
    dom.setMedia('(prefers-color-scheme: dark)', false);
    dom.window.localStorage.setItem('qa-theme', 'sepia');
    dom.document.documentElement.dataset.theme = 'light';
    await load(dom);

    dom.media.get('(prefers-color-scheme: dark)')?.emit(true);
    vi.advanceTimersByTime(FADE_OUT);

    expect(dom.document.documentElement.dataset.theme).toBe('dark');
  });

  it('follows the OS when reading storage throws', async () => {
    // The `catch { /* ignore */ }` around getItem. Storage being unavailable
    // must not stop the site tracking the system.
    const dom = createDom(MARKUP);
    dom.setMedia('(prefers-color-scheme: dark)', false);
    dom.document.documentElement.dataset.theme = 'light';
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {},
    });
    await load(dom);

    dom.media.get('(prefers-color-scheme: dark)')?.emit(true);
    vi.advanceTimersByTime(FADE_OUT);

    expect(dom.document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('when there is no toggle on the page', () => {
  it('still registers the OS listener', async () => {
    // The listener is not attached inside the button loop, so a page without a
    // toggle keeps following the system.
    const dom = createDom('<p>No toggle here</p>');
    dom.setMedia('(prefers-color-scheme: dark)', false);
    await load(dom);

    dom.media.get('(prefers-color-scheme: dark)')?.emit(true);
    vi.advanceTimersByTime(FADE_OUT);

    expect(dom.document.documentElement.dataset.theme).toBe('dark');
  });
});
