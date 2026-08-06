/**
 * Header behaviour: the scrolled state, the home link, and the mobile menu.
 *
 * Extracted from the component's inline <script> so a test can import it. The
 * component now carries only
 *
 *     <script>
 *       import '~/scripts/header';
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
// --- Scrolled state -----------------------------------------------------
const header = document.querySelector<HTMLElement>('[data-site-header]');

if (header) {
  // TWO independent states, deliberately decoupled:
  //
  //   data-scrolled   the backdrop. Comes in as soon as the page moves at
  //                   all, so navigation never floats bare over scrolling
  //                   content — which is what made the links illegible as
  //                   the hero passed beneath them.
  //   data-past-hero  the wordmark. Waits until the hero has fully cleared,
  //                   so the mark is never on screen twice.
  //
  // These used to be one flag, which forced a choice between those two bugs.
  let atTop = true;
  let menuOpen = false;

  // The mobile menu also forces the backdrop on: an open panel over a
  // transparent header would show the page through the links.
  const syncBackdrop = () => header.toggleAttribute('data-scrolled', !atTop || menuOpen);

  // Driven by IntersectionObserver rather than scroll listeners — the browser
  // does this work off the main thread, so it cannot cause scroll jank.
  const sentinel = document.createElement('div');
  sentinel.setAttribute('aria-hidden', 'true');
  sentinel.style.cssText = 'position:absolute;top:0;height:1px;width:1px;pointer-events:none';
  document.body.prepend(sentinel);

  new IntersectionObserver(
    ([entry]) => {
      atTop = entry?.isIntersecting ?? true;
      syncBackdrop();
    },
    { threshold: 0 },
  ).observe(sentinel);

  const hero = document.querySelector('.qa-hero');

  if (header.hasAttribute('data-overlay') && hero) {
    // `rootMargin` accepts only px and %, never rem, so the header height is
    // measured rather than read from the custom property.
    const headerHeight = Math.round(header.getBoundingClientRect().height) || 72;

    new IntersectionObserver(
      ([entry]) => {
        header.toggleAttribute('data-past-hero', !(entry?.isIntersecting ?? true));
      },
      { rootMargin: `-${headerHeight}px 0px 0px 0px`, threshold: 0 },
    ).observe(hero);
  }

  // Header.astro owns both behaviours, so the menu reports its state here.
  document.addEventListener('qa:menu', (event) => {
    menuOpen = (event as CustomEvent<boolean>).detail;
    syncBackdrop();
  });
}

// --- Home link ----------------------------------------------------------
//
// The wordmark is a real <a href="/"> — correct for SEO, for middle-click,
// for "open in new tab", and for the day a second page exists. But when the
// visitor is ALREADY on that page, following it triggers a full document
// reload: the browser tears down and repaints, the theme boot script runs
// again, and the result is the flicker.
//
// So when the destination is the current page, cancel the navigation and
// scroll instead. The link keeps all its semantics; only the redundant
// reload is skipped.
document.querySelectorAll<HTMLAnchorElement>('[data-home-link]').forEach((link) => {
  link.addEventListener('click', (event) => {
    // Never hijack modified clicks — those are deliberate new-tab/window
    // requests and must behave normally.
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    if (event.button !== 0) return;
    if (link.pathname !== window.location.pathname) return;

    event.preventDefault();

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });

    // Drop any '#section' left in the address bar so the URL matches what is
    // now on screen. `replaceState` avoids adding a history entry, so Back
    // still goes where the visitor expects.
    if (window.location.hash) {
      history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    // Move focus to the top of the document so keyboard and screen-reader
    // users follow the scroll instead of being left mid-page. <main> carries
    // a permanent `tabindex="-1"` (see BaseLayout), so there is nothing to
    // add and remove here.
    document.getElementById('main')?.focus({ preventScroll: true });
  });
});

// --- Mobile menu --------------------------------------------------------
const toggle = document.querySelector<HTMLButtonElement>('[data-menu-toggle]');
const nav = document.querySelector<HTMLElement>('[data-mobile-nav]');

if (toggle && nav) {
  const isOpen = () => nav.hasAttribute('data-open');

  const setOpen = (open: boolean) => {
    if (open === isOpen()) return;

    nav.toggleAttribute('data-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    // Tells the scroll handler above to keep the header backdrop up while
    // the panel is on screen.
    document.dispatchEvent(new CustomEvent('qa:menu', { detail: open }));

    if (open) {
      // Move into the panel so keyboard users land on the first item.
      nav.querySelector<HTMLAnchorElement>('a')?.focus({ preventScroll: true });
    } else if (nav.contains(document.activeElement)) {
      // Only reclaim focus if it is still inside the panel being closed —
      // otherwise clicking elsewhere on the page would yank it back.
      toggle.focus({ preventScroll: true });
    }
  };

  toggle.addEventListener('click', () => setOpen(!isOpen()));

  // Close after following an in-page anchor.
  nav.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('a')) setOpen(false);
  });

  /*
   * Click outside closes it.
   *
   * `pointerdown` rather than `click`: it fires before focus moves, so the
   * panel is already closing as the press lands rather than a frame later.
   * The toggle is excluded so its own handler is not immediately undone.
   */
  document.addEventListener('pointerdown', (event) => {
    if (!isOpen()) return;
    const target = event.target as Node;
    if (nav.contains(target) || toggle.contains(target)) return;
    setOpen(false);
  });

  /*
   * Escape closes it, and `setOpen` returns focus to the toggle — which is
   * the half that matters. Dismissing a panel while focus is still inside it
   * leaves a keyboard user focused on nothing, and the next Tab restarts
   * from the top of the document.
   */
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') setOpen(false);
  });

  /*
   * Tabbing past the last link closes it too.
   *
   * The panel is a disclosure, not a modal, so focus is deliberately NOT
   * trapped — trapping means Escape becomes the only way out, and anyone who
   * does not know that is stuck. But a panel left hanging open behind the
   * focus is visual noise over the content the user has moved on to, so it
   * closes itself when focus lands outside.
   *
   * `relatedTarget` is where focus is GOING. It is null when focus leaves the
   * document entirely (switching tabs, clicking browser chrome) — that must
   * not close the panel, or coming back would find it gone.
   */
  nav.addEventListener('focusout', (event) => {
    const next = event.relatedTarget as Node | null;
    if (!next) return;
    if (nav.contains(next) || toggle.contains(next)) return;
    setOpen(false);
  });

  window.matchMedia('(min-width: 768px)').addEventListener('change', (event) => {
    if (event.matches) setOpen(false);
  });
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
