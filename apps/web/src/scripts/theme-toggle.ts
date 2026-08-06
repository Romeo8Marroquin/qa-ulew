/**
 * Light/dark switching, persistence, and following the OS.
 *
 * Extracted from the component's inline <script> so a test can import it. The
 * component now carries only
 *
 *     <script>
 *       import '~/scripts/theme-toggle';
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
const STORAGE_KEY = 'qa-theme';

type Theme = 'light' | 'dark';

const root = document.documentElement;

// Must match the 200ms fade-out in Hero.astro's `[data-theme-shift]` rule.
const FADE_OUT = 200;

const current = (): Theme => (root.dataset.theme === 'dark' ? 'dark' : 'light');

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let pending: number | undefined;

/**
 * Swap the theme.
 *
 * A straight cross-fade of the hero overlay passes through mid-grey, washing
 * the photograph out at the midpoint. Instead the overlay fades out, the
 * tokens swap while it is invisible, and the new one fades in — the viewer
 * sees the bare photograph for an instant rather than a muddy blend.
 *
 * The attribute goes on <html> so the CSS can react; the flip happens on a
 * timer rather than a transitionend, because transitionend does not fire when
 * the element is off-screen or when motion is reduced.
 */
const apply = (theme: Theme) => {
  window.clearTimeout(pending);

  if (reducedMotion()) {
    root.dataset.theme = theme;
    return;
  }

  root.setAttribute('data-theme-shift', '');
  pending = window.setTimeout(() => {
    root.dataset.theme = theme;
    root.removeAttribute('data-theme-shift');
  }, FADE_OUT);
};

document.querySelectorAll<HTMLButtonElement>('[data-theme-toggle]').forEach((button) => {
  button.addEventListener('click', () => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    apply(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Private mode / storage disabled — the toggle still works for this page view.
    }
  });
});

// Keep following the OS while the user has not made an explicit choice.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (event) => {
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  if (stored !== 'light' && stored !== 'dark') {
    apply(event.matches ? 'dark' : 'light');
  }
});

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
