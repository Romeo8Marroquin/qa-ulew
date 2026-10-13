/**
 * Video markup for the browser-script tests, in the shape `VideoEmbed.astro`
 * and `VideoList.astro` render it.
 *
 * Hand-written because those tests run under happy-dom, where the Container API
 * cannot render a component (see docs/testing.md). The risk is drift, so the
 * hooks used here — every `data-video-*` attribute a script reads — are also
 * asserted against the real component in `tests/components/video.test.ts`.
 * If one changes, that test fails rather than these silently testing a shape
 * the site no longer ships.
 */
import { createDom, type Dom } from './dom';

const EMBED = (id: string) =>
  `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0&modestbranding=1`;
const WATCH = (id: string) => `https://www.youtube.com/watch?v=${id}`;
const POSTER = (id: string) => `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;

export interface TileOptions {
  id?: string;
  title?: string;
  embeddable?: boolean;
  published?: string;
  views?: number | null;
  live?: boolean;
  /** Drop the caption, to exercise a template that carries no title node. */
  captionless?: boolean;
}

const attr = (name: string, value: string | number | null | undefined) =>
  value === null || value === undefined || value === '' ? '' : ` ${name}="${value}"`;

/** One tile. The details line ships empty and hidden, as the templates do. */
export function tile({
  id = '__ID__',
  title = '__TITLE__',
  embeddable = true,
  published,
  views,
  live = false,
  captionless = false,
}: TileOptions = {}): string {
  const frame = embeddable
    ? `<div data-video-facade data-src="${EMBED(id)}" data-title="${title}">`
    : '<div>';
  const control = embeddable
    ? `<button type="button" aria-label="Reproducir video: ${title}"></button>`
    : `<a href="${WATCH(id)}" target="_blank" aria-label="Ver &quot;${title}&quot; en YouTube"></a>`;

  return `
    <figure data-video-tile${attr('data-video-id', id)}${attr('data-published', published)}${attr(
      'data-views',
      views,
    )}${live ? ' data-live' : ''}>
      ${frame}
        <span data-video-live-badge${live ? '' : ' hidden'} aria-hidden="true">En vivo</span>
        <img src="${POSTER(id)}" alt="" />
        ${control}
      </div>
      ${
        captionless
          ? ''
          : `<figcaption>
        <span><span data-video-title>${title}</span></span>
        <span>
          <span data-video-meta>
            <span data-video-live hidden>Transmitiendo ahora</span>
            <span data-video-views hidden><span class="qa-sr-only">Visualizaciones:</span>
              <span data-video-views-count></span></span>
            <span data-video-separator hidden aria-hidden="true">·</span>
            <time data-video-date hidden></time>
          </span>
          <a href="${WATCH(id)}" target="_blank">Ver en YouTube</a>
        </span>
      </figcaption>`
      }
    </figure>
  `;
}

/** A tile inside its `<Reveal as="li">` wrapper. */
export const item = (options: TileOptions = {}): string => `<li data-reveal>${tile(options)}</li>`;

export interface ListOptions {
  meta?: string;
  initial?: number;
  step?: number;
  empty?: boolean;
  button?: boolean;
}

/** A `VideoList`: the grid, the empty state, "ver más" and the status line. */
export function list(
  name: string,
  items: TileOptions[],
  { meta = 'date', initial = 3, step = 12, empty = true, button = true }: ListOptions = {},
): string {
  return `
    <div data-video-list="${name}" data-video-meta="${meta}" data-initial="${initial}" data-step="${step}">
      <ul role="list" id="${name}-videos" data-video-grid>${items.map(item).join('')}</ul>
      ${empty ? `<div data-video-empty${items.length > 0 ? ' hidden' : ''}><p>Pronto publicaremos contenido acá.</p></div>` : ''}
      ${
        button
          ? `<button type="button" data-video-more aria-controls="${name}-videos" hidden
               data-label-one="Ver {count} video más" data-label-other="Ver {count} videos más">
               <span data-video-more-label></span>
             </button>`
          : ''
      }
      <p role="status" data-video-status data-template="Mostrando {shown} de {total} videos"></p>
    </div>
  `;
}

export interface PageOptions {
  templates?: boolean;
  /** Render the embeddable template without its caption. */
  captionless?: boolean;
  lang?: string;
}

/**
 * A page holding some lists and the two shared templates, installed as the
 * global document. The scripts format dates and counts for
 * `document.documentElement.lang`, which `createDom` leaves empty — so it is
 * set here, to what `BaseLayout` renders.
 */
export function pageDom(
  lists: string[],
  { templates = true, captionless = false, lang = 'es-GT' }: PageOptions = {},
): Dom {
  const prototypes = templates
    ? `<template data-video-template="embeddable"><li data-reveal>${tile({ captionless })}</li></template>
       <template data-video-template="link"><li data-reveal>${tile({ embeddable: false })}</li></template>`
    : '';

  const dom = createDom(`${lists.join('')}${prototypes}`);
  dom.document.documentElement.lang = lang;
  return dom;
}
