/**
 * Click-to-load video: swaps the poster facade for the real iframe.
 *
 * Extracted from the component's inline <script> so a test can import it. The
 * component now carries only
 *
 *     <script>
 *       import '~/scripts/video-facade';
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

/**
 * Wire every unbound facade under `root`.
 *
 * Scoped to a root rather than always scanning the document because
 * `scripts/video-feed.ts` calls this with a freshly cloned tile after the feed
 * changes. Re-scanning the page there would attach a second listener to every
 * tile that already had one.
 */
export function bindFacades(root: ParentNode): void {
  root.querySelectorAll<HTMLElement>('[data-video-facade]').forEach((facade) => {
    const button = facade.querySelector('button');
    if (!button) return;

    button.addEventListener(
      'click',
      () => {
        const src = facade.dataset.src;
        if (!src) return;

        const iframe = document.createElement('iframe');
        iframe.src = src;
        iframe.title = facade.dataset.title ?? '';
        iframe.loading = 'lazy';
        iframe.allow =
          'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
        iframe.allowFullscreen = true;
        iframe.className = 'absolute inset-0 h-full w-full border-0';

        facade.replaceChildren(iframe);
        iframe.focus();
      },
      { once: true },
    );
  });
}

// One delegated listener for every facade already on the page.
bindFacades(document);
