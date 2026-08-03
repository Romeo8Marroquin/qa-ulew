import { getRelativeLocaleUrl } from 'astro:i18n';

import { DEFAULT_LOCALE, LOCALE_META, LOCALES, isLocale, type Locale } from './config';
import { translations, type TranslationKey } from './locales';

/**
 * Resolve the active locale from a request URL.
 *
 * Prefer `Astro.currentLocale` inside components; this exists for the places
 * Astro cannot infer it (middleware, endpoints, the 404 page).
 */
export function getLocaleFromUrl(url: URL): Locale {
  const [, maybeLocale] = url.pathname.split('/');
  return isLocale(maybeLocale) ? maybeLocale : DEFAULT_LOCALE;
}

export type Translator = (key: TranslationKey, params?: Record<string, string | number>) => string;

/**
 * Returns a `t()` bound to a locale.
 *
 *   const t = useTranslations(Astro.currentLocale);
 *   t('hero.title')
 *   t('footer.copyright', { year: 2026 })
 *
 * Unknown keys are impossible — `TranslationKey` is a closed union.
 */
export function useTranslations(locale: string | undefined): Translator {
  const active: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const table = translations[active];

  return (key, params) => {
    const raw = table[key];
    if (!params) return raw;
    return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
      name in params ? String(params[name]) : match,
    );
  };
}

/** Locale-aware href. `/videos` -> `/videos` for es, `/en/videos` for en. */
export function localePath(path: string, locale: string | undefined): string {
  const active: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  return getRelativeLocaleUrl(active, path);
}

/**
 * `hreflang` alternates for <head>. Returns an empty list while only one
 * locale exists, which is exactly what search engines expect.
 */
export function alternateLocales(currentPath: string, siteUrl: string) {
  if (LOCALES.length < 2) return [];
  return LOCALES.map((locale) => ({
    locale,
    hrefLang: LOCALE_META[locale].htmlLang,
    href: new URL(getRelativeLocaleUrl(locale, currentPath), siteUrl).href,
  }));
}

export { LOCALE_META, LOCALES, DEFAULT_LOCALE, type Locale, type TranslationKey };
