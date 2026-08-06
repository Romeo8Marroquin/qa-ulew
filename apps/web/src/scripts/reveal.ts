/**
 * Scroll reveal: unhides [data-reveal] elements as they enter the viewport.
 *
 * Extracted from the component's inline <script> so a test can import it. The
 * component now carries only
 *
 *     <script>
 *       import '~/scripts/reveal';
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
const items = document.querySelectorAll<HTMLElement>('[data-reveal]');

// Honour the OS setting: no entrance animation, everything simply present.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (!reducedMotion && 'IntersectionObserver' in window) {
  // Hide only now that we know the observer will run to un-hide them.
  items.forEach((item) => item.setAttribute('data-reveal-hidden', ''));

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const target = entry.target as HTMLElement;
        target.setAttribute('data-revealed', '');
        target.removeAttribute('data-reveal-hidden');
        // Reveal once. Re-animating on scroll-up is distracting.
        observer.unobserve(target);
      }
    },
    {
      // Start slightly before the element reaches the fold, so it finishes
      // arriving as it becomes properly visible.
      rootMargin: '0px 0px -12% 0px',
      threshold: 0.05,
    },
  );

  items.forEach((item) => observer.observe(item));
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
