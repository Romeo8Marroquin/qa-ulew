/**
 * Locale configuration.
 *
 * The site ships Spanish-only. Adding a language is intentionally a 3-step,
 * no-refactor change:
 *
 *   1. Add the code to `LOCALES` below and give it an entry in `LOCALE_META`.
 *   2. Copy `locales/es.ts` to `locales/<code>.ts` and translate the values.
 *      TypeScript will fail the build until every key is present.
 *   3. Register it in `locales/index.ts`.
 *
 * Astro handles the routing from `LOCALES` alone — no new page files, no new
 * routes. See docs/i18n.md.
 */

export const DEFAULT_LOCALE = 'es' as const;

/** Add new codes here. Order controls the language-picker order. */
export const LOCALES = ['es'] as const;

export type Locale = (typeof LOCALES)[number];

export interface LocaleMeta {
  /** Name of the language, written in that language. */
  label: string;
  /** BCP-47 tag for the `lang` attribute and `Intl` formatting. */
  htmlLang: string;
  /** Value for `og:locale`. */
  ogLocale: string;
  dir: 'ltr' | 'rtl';
}

export const LOCALE_META: Record<Locale, LocaleMeta> = {
  es: { label: 'Español', htmlLang: 'es-GT', ogLocale: 'es_GT', dir: 'ltr' },
};

export const isLocale = (value: unknown): value is Locale =>
  typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
