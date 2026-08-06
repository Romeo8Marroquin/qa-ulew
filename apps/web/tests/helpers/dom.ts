/**
 * A fresh browser per test, for the modules in `src/scripts`.
 *
 * WHY NOT JUST USE THE happy-dom ENVIRONMENT'S `document`
 *
 * Those modules do their work at import time and attach listeners to `document`
 * and `window`. Vitest gives one DOM per test *file*, not per test, so the
 * second test in a file would run against a document still carrying the first
 * test's listeners — an Escape handler from a menu that no longer exists, a
 * `pointerdown` handler closing a panel under test. Those failures are
 * order-dependent and miserable to diagnose.
 *
 * So each test builds a real new `Window`, points the globals at it, and
 * re-imports the module under test with `vi.resetModules()`. Nothing survives
 * between tests because nothing is shared.
 */
/*
 * Imported under an alias so it does not shadow the global `Window` TYPE.
 *
 * The `Dom` interface below deliberately exposes the browser as `lib.dom`'s
 * `Window` and `Document`, not happy-dom's. The two are structurally different
 * — happy-dom's `Event` has no `isTrusted`/`returnValue`/`srcElement` — and
 * exposing happy-dom's types made every `dispatchEvent` in every test a type
 * error in one direction or the other. Casting once here means the tests are
 * written against the same API the source is, and stay type-checked.
 */
import { Window as HappyWindow } from 'happy-dom';
import { vi } from 'vitest';

/** An IntersectionObserver whose callbacks the test fires by hand. */
export interface FakeObserver {
  /** Every element passed to `.observe()`, in order. */
  observed: Element[];
  /** Fire the observer callback with the given entries. */
  trigger(entries: { target: Element; isIntersecting: boolean }[]): void;
  /** Elements passed to `.unobserve()`. */
  unobserved: Element[];
  options: unknown;
}

export interface Dom {
  /** Typed as the DOM Window, backed by happy-dom. See the import note above. */
  window: Window;
  document: Document;
  /**
   * happy-dom's event constructors, typed as the DOM ones.
   *
   * They are structurally different from `lib.dom`'s (`isTrusted`,
   * `returnValue` and `srcElement` are missing), so `dispatchEvent` rejects
   * them and every call site would need its own cast. Casting once, here, keeps
   * `astro check` running over the test files — which is where it found that
   * the extracted scripts were not modules — instead of the tests being
   * excluded from type-checking to keep it quiet.
   */
  Event: typeof Event;
  MouseEvent: typeof MouseEvent;
  /**
   * One entry per `new IntersectionObserver(...)`, in construction order.
   *
   * Order is the only handle a test has on which observer is which — the
   * scripts construct them anonymously. `header.ts` builds the scroll sentinel
   * first and the hero observer second; that ordering is asserted in its tests
   * so a future reordering cannot silently repoint them.
   */
  observers: FakeObserver[];
  /** Every `new ResizeObserver(...)`, same idea. */
  resizeObservers: { observed: Element[]; trigger(): void }[];
  /** Media queries the code asked about, and what we answered. */
  media: Map<string, FakeMediaQueryList>;
  /** Set the answer for a media query before the module is imported. */
  setMedia(query: string, matches: boolean): void;
  /** Calls to `window.scrollTo`. */
  scrolls: { top?: number; behavior?: string }[];
}

interface FakeMediaQueryList {
  matches: boolean;
  media: string;
  addEventListener(type: string, listener: (event: { matches: boolean }) => void): void;
  removeEventListener(type: string, listener: unknown): void;
  /** Flip the query and notify listeners, as a real browser would. */
  emit(matches: boolean): void;
  listeners: ((event: { matches: boolean }) => void)[];
}

function makeMediaQueryList(query: string, matches: boolean): FakeMediaQueryList {
  const listeners: FakeMediaQueryList['listeners'] = [];
  return {
    media: query,
    matches,
    listeners,
    addEventListener(_type, listener) {
      listeners.push(listener);
    },
    removeEventListener() {},
    emit(next) {
      this.matches = next;
      for (const listener of listeners) listener({ matches: next });
    },
  };
}

/**
 * Build a document and install it as the global one.
 *
 * Call BEFORE importing the module under test — these modules read `document`
 * as they are evaluated, so a DOM created afterwards is a DOM they never saw.
 */
export function createDom(bodyHtml = '', options: { url?: string } = {}): Dom {
  const happyWindow = new HappyWindow({ url: options.url ?? 'https://qa-ulew.tv/' });
  const window = happyWindow as unknown as Window;
  const document = happyWindow.document as unknown as Document;
  document.body.innerHTML = bodyHtml;

  const observers: FakeObserver[] = [];
  const resizeObservers: Dom['resizeObservers'] = [];
  const media = new Map<string, FakeMediaQueryList>();
  const scrolls: Dom['scrolls'] = [];

  class FakeIntersectionObserver {
    constructor(
      private callback: (entries: unknown[]) => void,
      opts?: unknown,
    ) {
      observers.push({
        observed: [],
        unobserved: [],
        options: opts,
        trigger: (entries) => {
          this.callback(entries.map((entry) => ({ ...entry })));
        },
      });
      this.index = observers.length - 1;
    }
    private index: number;
    observe(element: Element) {
      observers[this.index]?.observed.push(element);
    }
    unobserve(element: Element) {
      observers[this.index]?.unobserved.push(element);
    }
    disconnect() {}
  }

  class FakeResizeObserver {
    constructor(private callback: () => void) {
      resizeObservers.push({ observed: [], trigger: () => this.callback() });
      this.index = resizeObservers.length - 1;
    }
    private index: number;
    observe(element: Element) {
      resizeObservers[this.index]?.observed.push(element);
    }
    disconnect() {}
  }

  const matchMedia = (query: string) => {
    const existing = media.get(query);
    if (existing) return existing;
    // Unasked-for queries default to false — the same as a browser that does
    // not match them, so a test only has to declare what it cares about.
    const created = makeMediaQueryList(query, false);
    media.set(query, created);
    return created;
  };

  Object.assign(happyWindow, {
    matchMedia,
    IntersectionObserver: FakeIntersectionObserver,
    ResizeObserver: FakeResizeObserver,
    scrollTo: (arg: { top?: number; behavior?: string }) => {
      scrolls.push(arg);
    },

    /**
     * Route the window's timers through the global ones.
     *
     * `theme-toggle.ts` calls `window.setTimeout` — correct browser code, where
     * `window.setTimeout === setTimeout`. But a happy-dom `Window` brings its
     * OWN timer implementation, and `vi.useFakeTimers()` only patches the
     * globals. So `vi.advanceTimersByTime` drove a clock the module was not
     * watching, the 200ms swap never landed, and every theme assertion failed
     * on a value that was simply still in flight.
     *
     * Read at call time, not captured, so the fake timers can be installed and
     * removed around any individual test.
     */
    setTimeout: (handler: () => void, ms?: number) => globalThis.setTimeout(handler, ms),
    clearTimeout: (id?: number) => globalThis.clearTimeout(id),
  });

  // `localStorage` and `history` are read as bare globals by the scripts, so
  // they have to be stubbed as globals too, not just hung off `window`.
  vi.stubGlobal('window', happyWindow);
  vi.stubGlobal('document', document);
  vi.stubGlobal('localStorage', happyWindow.localStorage);
  vi.stubGlobal('history', happyWindow.history);
  vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver);
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  vi.stubGlobal('CustomEvent', happyWindow.CustomEvent);
  vi.stubGlobal('Event', happyWindow.Event);
  vi.stubGlobal('HTMLElement', happyWindow.HTMLElement);

  return {
    window,
    document,
    Event: happyWindow.Event as unknown as typeof Event,
    MouseEvent: happyWindow.MouseEvent as unknown as typeof MouseEvent,
    observers,
    resizeObservers,
    media,
    scrolls,
    setMedia(query, matches) {
      media.set(query, makeMediaQueryList(query, matches));
    },
  };
}

/**
 * `IntersectionObserver` is absent — an old browser, or a locked-down one.
 *
 * `reveal.ts` guards on `'IntersectionObserver' in window` precisely so content
 * is never left hidden when the observer will not run, and that guard is worth
 * a test of its own.
 */
export function removeIntersectionObserver(dom: Dom): void {
  delete (dom.window as unknown as Record<string, unknown>).IntersectionObserver;
  vi.stubGlobal('IntersectionObserver', undefined);
}

/** Same, for `scrollbar.ts`'s `'ResizeObserver' in window` guard. */
export function removeResizeObserver(dom: Dom): void {
  delete (dom.window as unknown as Record<string, unknown>).ResizeObserver;
  vi.stubGlobal('ResizeObserver', undefined);
}

/**
 * happy-dom does no layout, so every measurement is 0 and the scrollbar's
 * geometry maths divides its way to `NaN`. These are the numbers a real browser
 * would have reported for a 2000px page in an 800px viewport.
 */
export function stubLayout(
  dom: Dom,
  {
    scrollHeight = 2000,
    innerHeight = 800,
    innerWidth = 1200,
    barHeight = 800,
    barTop = 0,
  }: Partial<{
    scrollHeight: number;
    innerHeight: number;
    innerWidth: number;
    barHeight: number;
    barTop: number;
  }> = {},
): void {
  Object.defineProperty(dom.document.documentElement, 'scrollHeight', {
    value: scrollHeight,
    configurable: true,
  });
  Object.defineProperty(dom.window, 'innerHeight', { value: innerHeight, configurable: true });
  Object.defineProperty(dom.window, 'innerWidth', { value: innerWidth, configurable: true });

  const bar = dom.document.querySelector('[data-scrollbar]');
  if (bar) {
    Object.defineProperty(bar, 'clientHeight', { value: barHeight, configurable: true });
    bar.getBoundingClientRect = () => ({ top: barTop }) as DOMRect;
  }
}

/** Move `window.scrollY`, which happy-dom exposes as a plain property. */
export function setScrollY(dom: Dom, value: number): void {
  Object.defineProperty(dom.window, 'scrollY', { value, configurable: true });
}
