/**
 * Render a real `.astro` component and hand back a queryable document.
 *
 * Astro's Container API runs the component through the same pipeline the build
 * uses, so what these tests assert is the actual shipped markup — not a
 * reimplementation of it in a test double. That is the whole reason the
 * component tests are worth having: they can catch an `aria-label` that stopped
 * being rendered, which no amount of unit-testing the frontmatter would.
 *
 * The result is parsed with happy-dom so tests can use `querySelector` and read
 * attributes, rather than matching against an HTML string with regexes that
 * pass for the wrong reasons.
 */
import { experimental_AstroContainer as AstroContainer } from 'astro/container';
import { Window } from 'happy-dom';
import type { AstroComponentFactory } from 'astro/runtime/server/index.js';

export interface RenderOptions {
  props?: Record<string, unknown>;
  slots?: Record<string, unknown>;
  /** Sets `Astro.currentLocale`, which every component here reads. */
  locale?: string;
}

export interface Rendered {
  /** The raw string, for the rare assertion that needs it. */
  html: string;
  /** Parsed, for everything else. */
  document: Document;
  query(selector: string): Element | null;
  queryAll(selector: string): Element[];
}

/**
 * The container is created per render rather than shared.
 *
 * Sharing one across a file is faster, but a container carries the request that
 * produced the last render — including its locale — and a component reading
 * `Astro.currentLocale` would then see whatever the previous test set. Correct
 * beats fast at this size.
 */
export async function render(
  Component: AstroComponentFactory,
  { props = {}, slots = {}, locale }: RenderOptions = {},
): Promise<Rendered> {
  const container = await AstroContainer.create();

  const html = await container.renderToString(Component, {
    props,
    slots,
    // The pathname is what Astro derives `currentLocale` from. Spanish is
    // served from the root, so the default locale needs no prefix.
    request: new Request(`https://qa-ulew.tv/${locale && locale !== 'es' ? locale + '/' : ''}`),
  });

  const window = new Window({ url: 'https://qa-ulew.tv/' });
  // `body.innerHTML` would silently drop a <head>-only fragment, which is
  // exactly what BaseHead renders — so parse the fragment as a whole document.
  window.document.write(`<!doctype html><html><head></head><body>${html}</body></html>`);
  const document = window.document as unknown as Document;

  return {
    html,
    document,
    query: (selector) => document.querySelector(selector),
    queryAll: (selector) => [...document.querySelectorAll(selector)],
  };
}

/**
 * Parse a `<head>` fragment.
 *
 * `BaseHead` emits `<meta>`, `<link>` and `<title>` with no body content. A
 * parser puts those in `<head>`, so a test that dropped them into `<body>`
 * would find nothing — and would pass for the wrong reason if it asserted
 * absence.
 */
export async function renderHead(
  Component: AstroComponentFactory,
  options: RenderOptions = {},
): Promise<Rendered> {
  const container = await AstroContainer.create();
  const html = await container.renderToString(Component, {
    props: options.props ?? {},
    request: new Request('https://qa-ulew.tv/'),
  });

  const window = new Window({ url: 'https://qa-ulew.tv/' });
  window.document.write(`<!doctype html><html><head>${html}</head><body></body></html>`);
  const document = window.document as unknown as Document;

  return {
    html,
    document,
    query: (selector) => document.querySelector(selector),
    queryAll: (selector) => [...document.querySelectorAll(selector)],
  };
}
