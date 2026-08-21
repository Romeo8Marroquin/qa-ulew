/**
 * Building a video tile from the <template>s the page already rendered.
 *
 * WHY THIS IS ITS OWN MODULE
 *
 * Two scripts need to produce a tile after load, for unrelated reasons:
 * `video-feed.ts` rebuilds the whole grid when YouTube's feed disagrees with
 * the deploy, and `video-facade.ts` swaps a single tile down to its link form
 * when the player turns out to be blocked. Both must produce markup identical
 * to `VideoEmbed.astro`'s, and the only way to guarantee that is for neither to
 * write any — they clone the prototypes `index.astro` renders with the same
 * component, and stamp the two slots.
 *
 * `video-feed.ts` imports `bindFacades` from `video-facade.ts`, so this cannot
 * live in either of them without one importing the other in a circle.
 */

/** Placeholders the templates are rendered with, replaced per video. */
export const ID_SLOT = '__ID__';
export const TITLE_SLOT = '__TITLE__';

export interface TileVideo {
  id: string;
  title: string;
  embeddable: boolean;
}

/**
 * Stamp one video into a cloned template.
 *
 * Every slot lives in an attribute — href, src, aria-label, data-src, data-title
 * — except the caption, so attributes are swept generically and the caption is
 * set explicitly. Sweeping means a new attribute in `VideoEmbed.astro` that
 * mentions the id or the title is handled here without a change.
 *
 * `setAttribute` and `textContent` never parse markup, so a title containing
 * `<` or a quote is inert. Nothing here builds HTML from a string.
 */
export function fill(fragment: DocumentFragment, video: TileVideo): void {
  for (const element of fragment.querySelectorAll<HTMLElement>('*')) {
    for (const attribute of [...element.attributes]) {
      const next = attribute.value
        .replaceAll(ID_SLOT, video.id)
        .replaceAll(TITLE_SLOT, video.title);
      if (next !== attribute.value) element.setAttribute(attribute.name, next);
    }
  }

  const caption = fragment.querySelector('[data-video-title]');
  if (caption) caption.textContent = video.title;
}

/**
 * One filled tile, or `null` if the page carries no prototype for that shape.
 *
 * A missing template means the page was rendered without the feed enabled.
 * Both callers treat `null` as "leave the DOM alone": a partial grid, or a
 * half-replaced tile, is worse than the stale one already on screen.
 *
 * Looked up per call rather than cached at import. The cost is one
 * `querySelector` on a path that runs a handful of times per visit, and it
 * removes the question of whether the module was imported before or after the
 * templates were parsed.
 */
export function cloneTile(video: TileVideo): DocumentFragment | null {
  const shape = video.embeddable ? 'embeddable' : 'link';
  const template = document.querySelector<HTMLTemplateElement>(`[data-video-template="${shape}"]`);
  if (!template) return null;

  const tile = template.content.cloneNode(true) as DocumentFragment;
  fill(tile, video);
  return tile;
}
