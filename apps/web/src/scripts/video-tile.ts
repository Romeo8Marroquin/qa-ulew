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
import {
  formatDateTime,
  formatRelative,
  formatViews,
  type MetaField,
  type MetaSource,
  metaState,
  parseFields,
} from '~/lib/video-meta';

/** Placeholders the templates are rendered with, replaced per video. */
export const ID_SLOT = '__ID__';
export const TITLE_SLOT = '__TITLE__';

export interface TileVideo extends MetaSource {
  id: string;
  title: string;
  embeddable: boolean;
}

/** The language the page is in, which is what every date and count is formatted for. */
const pageLang = (): string => document.documentElement.lang || 'es';

/*
 * Writers that do nothing when the value is already right. The common refresh
 * changes nothing, and "no change means no DOM work" is a rule of
 * `video-feed.ts` — these are what keep it true down at the attribute level.
 */
const setText = (element: Element | null, value: string): void => {
  if (element && element.textContent !== value) element.textContent = value;
};

const setHidden = (element: HTMLElement | null, hidden: boolean): void => {
  if (element && element.hidden !== hidden) element.hidden = hidden;
};

const setAttr = (element: Element | null, name: string, value: string | null): void => {
  if (!element || element.getAttribute(name) === value) return;
  if (value === null) element.removeAttribute(name);
  else element.setAttribute(name, value);
};

/** Which details a tile's list shows, from `data-video-meta` on the list. */
export const readFields = (element: Element): MetaField[] =>
  parseFields(element.closest('[data-video-list]')?.getAttribute('data-video-meta') ?? undefined);

/**
 * Everything a tile knows about its video, read back from its own markup.
 *
 * The figure carries the raw values as data attributes — the formatted text
 * ("1,2 mil", "hace 3 horas") cannot be turned back into what it came from.
 * Embeddability is read from the shape rather than duplicated: a facade tile is
 * exactly one that carries `data-video-facade`.
 */
export function readTile(tile: Element): TileVideo {
  const views = tile.getAttribute('data-views');
  return {
    id: tile.getAttribute('data-video-id') ?? '',
    title: tile.querySelector('[data-video-title]')?.textContent ?? '',
    embeddable: tile.querySelector('[data-video-facade]') !== null,
    published: tile.getAttribute('data-published') ?? '',
    views: views === null || views === '' ? null : Number(views),
    live: tile.hasAttribute('data-live'),
  };
}

/**
 * Bring the line under the title — and the live badge — in line with `video`.
 *
 * Mirrors `VideoEmbed.astro` exactly, through the same `metaState`, with one
 * difference: the date becomes relative ("hace 3 horas") where the build
 * printed it absolute. That is the reason it runs over build-time tiles on
 * load as well as over cloned ones.
 */
export function applyMeta(
  tile: Element,
  video: MetaSource,
  fields: readonly MetaField[],
  now: number = Date.now(),
): void {
  const lang = pageLang();
  const state = metaState(video, fields);
  const published = video.published ?? '';

  setAttr(tile, 'data-published', published || null);
  setAttr(tile, 'data-views', typeof video.views === 'number' ? String(video.views) : null);
  setAttr(tile, 'data-live', state.live ? '' : null);

  setHidden(tile.querySelector<HTMLElement>('[data-video-live-badge]'), !state.live);
  setHidden(tile.querySelector<HTMLElement>('[data-video-live]'), !state.live);

  setHidden(tile.querySelector<HTMLElement>('[data-video-views]'), !state.views);
  setText(
    tile.querySelector('[data-video-views-count]'),
    // `state.views` is only true for a numeric count.
    state.views ? formatViews(Number(video.views), lang) : '',
  );

  setHidden(
    tile.querySelector<HTMLElement>('[data-video-separator]'),
    !(state.views && state.date),
  );

  const time = tile.querySelector<HTMLElement>('[data-video-date]');
  setHidden(time, !state.date);
  setAttr(time, 'datetime', state.date ? published : null);
  setAttr(time, 'title', state.date ? formatDateTime(published, lang) : null);
  setText(time, state.date ? formatRelative(published, lang, now) : '');
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
 *
 * `fields` comes from the list the tile is going into — the templates are
 * shared by both lists and render the details line empty.
 */
export function cloneTile(
  video: TileVideo,
  fields: readonly MetaField[] = [],
): DocumentFragment | null {
  const shape = video.embeddable ? 'embeddable' : 'link';
  const template = document.querySelector<HTMLTemplateElement>(`[data-video-template="${shape}"]`);
  if (!template) return null;

  const tile = template.content.cloneNode(true) as DocumentFragment;

  // Astro emits a component's <script> where the component is first rendered.
  // When that is inside a template — a page whose lists were empty at build —
  // the clone carries it, and inserting it would run that module a second
  // time and bind every facade twice.
  for (const script of tile.querySelectorAll('script')) script.remove();

  fill(tile, video);

  const figure = tile.querySelector('[data-video-tile]');
  if (figure) applyMeta(figure, video, fields);
  return tile;
}
