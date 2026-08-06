/**
 * The overlay scrollbar: geometry, proximity, and dragging.
 *
 * Extracted from the component's inline <script> so a test can import it. The
 * component now carries only
 *
 *     <script>
 *       import '~/scripts/scrollbar';
 *     </script>
 *
 * which Astro bundles exactly as it bundled the inline block — the shipped
 * JavaScript is unchanged, and was diffed against the previous build to prove
 * it. Nothing here changed but its address.
 *
 * It still runs on import, the way an inline module script does. So the tests
 * build a DOM, call `vi.resetModules()` and re-import, rather than exporting an
 * `init()` for them to call — which would have made this a rewrite rather
 * than a move, and left the tests exercising a shape the site does not ship.
 */
const MIN_THUMB = 32; // px — below this it becomes impossible to grab
const IDLE_MS = 700; // how long the bar lingers after scrolling stops
const EDGE_PX = 44; // within this of the right edge: show it, thin

/*
 * The footprint the thumb will OCCUPY once thickened — `right: 3px` plus
 * `width: 7px` in the stylesheet, so 3..10px in from the viewport edge.
 *
 * Thickening triggers only inside that exact box, vertically bounded by the
 * thumb itself. Anywhere else near the edge merely reveals it. Earlier this
 * used a generous halo, which meant the bar inflated while the cursor was
 * still nowhere near it.
 */
const HOT_X = 10;

const root = document.documentElement;
const bar = document.querySelector<HTMLElement>('[data-scrollbar]');
const thumb = document.querySelector<HTMLElement>('[data-scrollbar-thumb]');

// Touch platforms already draw transient overlay scrollbars that behave
// correctly; replacing them would be worse, not better.
if (bar && thumb && window.matchMedia('(pointer: fine)').matches) {
  bar.hidden = false;
  // Only now is it safe to hide the native bar.
  root.setAttribute('data-custom-scrollbar', '');

  let idle: number | undefined;
  let dragging = false;
  let dragOffset = 0;

  // Cached geometry. Reading layout on every pointermove forces a reflow per
  // frame, which is the difference between a drag that tracks the cursor and
  // one that lags behind it.
  let track = 0;
  let scrollable = 0;
  let thumbHeight = 0;
  let travel = 0;
  let thumbTop = 0;
  let barTop = 0;

  const measure = () => {
    // Horizontal proximity is measured from the viewport edge, so only the
    // bar's vertical origin is needed here.
    barTop = bar.getBoundingClientRect().top;
    track = bar.clientHeight;
    scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const ratio = window.innerHeight / document.documentElement.scrollHeight;
    thumbHeight = Math.max(MIN_THUMB, Math.round(track * ratio));
    travel = track - thumbHeight;
  };

  const render = () => {
    // Nothing to scroll: no scrollbar to show.
    if (scrollable <= 0) {
      bar.removeAttribute('data-visible');
      thumb.style.height = '0px';
      return;
    }

    const progress = Math.min(1, Math.max(0, window.scrollY / scrollable));
    thumbTop = Math.round(progress * travel);
    thumb.style.height = `${thumbHeight}px`;
    thumb.style.transform = `translateY(${thumbTop}px)`;
  };

  const refresh = () => {
    measure();
    render();
  };

  const show = () => {
    bar.setAttribute('data-visible', '');
    window.clearTimeout(idle);
    idle = window.setTimeout(() => {
      // Stay up while the pointer is beside it or a drag is in progress.
      if (!dragging && !bar.hasAttribute('data-hot') && !bar.matches(':hover')) {
        bar.removeAttribute('data-visible');
      }
    }, IDLE_MS);
  };

  // `passive` so scrolling is never blocked waiting on this listener.
  window.addEventListener(
    'scroll',
    () => {
      render();
      show();
    },
    { passive: true },
  );

  window.addEventListener('resize', refresh, { passive: true });

  /*
   * Proximity, in two steps:
   *   near the edge  -> show it, thin
   *   beside the thumb -> also thicken it
   */
  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse' || dragging) return;

      const fromRight = window.innerWidth - event.clientX;
      if (fromRight > EDGE_PX) {
        bar.removeAttribute('data-hot');
        return;
      }

      show();

      // Exactly the box the thickened thumb will fill — no halo.
      const y = event.clientY - barTop;
      const over = fromRight <= HOT_X && y >= thumbTop && y <= thumbTop + thumbHeight;
      bar.toggleAttribute('data-hot', over);
    },
    { passive: true },
  );

  // --- Dragging ---------------------------------------------------------
  thumb.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    // Measure once, at the start — never mid-drag.
    measure();
    dragging = true;
    dragOffset = event.clientY - (barTop + thumbTop);
    bar.setAttribute('data-dragging', '');
    thumb.setPointerCapture(event.pointerId);
  });

  thumb.addEventListener('pointermove', (event) => {
    if (!dragging || travel <= 0) return;

    const y = event.clientY - barTop - dragOffset;
    const progress = Math.min(1, Math.max(0, y / travel));

    /*
     * `instant`, NOT `auto`.
     *
     * Per CSSOM-View, `auto` means "use the computed scroll-behavior" — and
     * this page sets `scroll-behavior: smooth` on <html> for anchor links.
     * So `auto` routed every drag frame through the smooth scroller, and the
     * thumb visibly trailed the cursor. `instant` overrides it outright.
     */
    window.scrollTo({ top: progress * scrollable, behavior: 'instant' });
  });

  const endDrag = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    bar.removeAttribute('data-dragging');
    thumb.releasePointerCapture(event.pointerId);
    show();
  };

  thumb.addEventListener('pointerup', endDrag);
  thumb.addEventListener('pointercancel', endDrag);

  refresh();
  // Content can change height after fonts and images settle, which changes
  // both the thumb's size and how far it can travel.
  if ('ResizeObserver' in window) {
    new ResizeObserver(refresh).observe(document.body);
  }
}

/*
 * Marks this file as a module rather than a global script.
 *
 * Astro and Vite already treat it as one — the component imports it. But
 * TypeScript decides from the file's own syntax, and without a top-level
 * `import` or `export` it classifies the file as a global script: every
 * top-level `const` lands in the global scope. Three of these declare `root`
 * or `reducedMotion`, so they collided with each other and `astro check`
 * failed on redeclarations that do not exist at runtime.
 *
 * Erased entirely by the bundler — the emitted JavaScript is unchanged.
 */
export {};
