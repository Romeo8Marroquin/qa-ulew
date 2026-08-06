import { describe, expect, it } from 'vitest';

import { DEFAULT_LOCALE, LOCALES, LOCALE_META, isLocale } from '~/i18n/config';

describe('isLocale', () => {
  it('accepts a registered locale', () => {
    expect(isLocale('es')).toBe(true);
  });

  it('rejects an unregistered language code', () => {
    expect(isLocale('en')).toBe(false);
    expect(isLocale('fr')).toBe(false);
  });

  it('rejects non-strings without throwing', () => {
    // It guards `Astro.currentLocale`, which is `string | undefined`, and the
    // 404 page reaches it with whatever was in the URL. Anything at all can
    // arrive here, so nothing may throw.
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale(null)).toBe(false);
    expect(isLocale(42)).toBe(false);
    expect(isLocale({})).toBe(false);
    expect(isLocale(['es'])).toBe(false);
  });

  it('rejects a locale-shaped string that is not registered', () => {
    // `includes` on the array, not a regex on the shape — 'es-GT' is a valid
    // BCP-47 tag and still not one of ours.
    expect(isLocale('es-GT')).toBe(false);
    expect(isLocale('ES')).toBe(false);
  });
});

describe('locale registry', () => {
  it('has an entry in LOCALE_META for every locale', () => {
    // The pair is what stops a locale being added to routing while the site has
    // no `lang` tag or label for it.
    for (const locale of LOCALES) {
      expect(LOCALE_META[locale]).toBeDefined();
    }
    expect(Object.keys(LOCALE_META)).toHaveLength(LOCALES.length);
  });

  it('lists the default locale', () => {
    expect(LOCALES).toContain(DEFAULT_LOCALE);
  });

  it('describes Spanish as Guatemalan and left-to-right', () => {
    // These three feed `<html lang>`, `<html dir>` and `og:locale`. Guatemalan
    // Spanish specifically — the copy is written in voseo.
    expect(LOCALE_META.es).toEqual({
      label: 'Español',
      htmlLang: 'es-GT',
      ogLocale: 'es_GT',
      dir: 'ltr',
    });
  });
});
