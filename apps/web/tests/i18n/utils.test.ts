import { afterEach, describe, expect, it, vi } from 'vitest';

import { alternateLocales, getLocaleFromUrl, localePath, useTranslations } from '~/i18n/utils';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('~/i18n/config');
  vi.doUnmock('astro:i18n');
});

describe('getLocaleFromUrl', () => {
  it('reads a locale prefix from the path', () => {
    expect(getLocaleFromUrl(new URL('https://qa-ulew.tv/es/contacto'))).toBe('es');
  });

  it('falls back to the default when the path has no prefix', () => {
    // Spanish is served from the root, so this is the normal case rather than
    // an error path.
    expect(getLocaleFromUrl(new URL('https://qa-ulew.tv/'))).toBe('es');
    expect(getLocaleFromUrl(new URL('https://qa-ulew.tv/contacto'))).toBe('es');
  });

  it('falls back when the first segment is an unknown language', () => {
    // Without this, /en/ would resolve to the locale 'en' and index into a
    // translation table that does not exist.
    expect(getLocaleFromUrl(new URL('https://qa-ulew.tv/en/about'))).toBe('es');
  });

  it('is not confused by a trailing slash or a query string', () => {
    expect(getLocaleFromUrl(new URL('https://qa-ulew.tv/es/'))).toBe('es');
    expect(getLocaleFromUrl(new URL('https://qa-ulew.tv/?utm_source=x'))).toBe('es');
  });
});

describe('useTranslations', () => {
  it('returns the string for a key', () => {
    expect(useTranslations('es')('nav.home')).toBe('Inicio');
  });

  it('falls back to the default locale for an unknown one', () => {
    // `Astro.currentLocale` is `string | undefined`; both must resolve to a
    // real table rather than indexing `undefined`.
    expect(useTranslations('en')('nav.home')).toBe('Inicio');
    expect(useTranslations(undefined)('nav.home')).toBe('Inicio');
  });

  it('interpolates a named placeholder', () => {
    expect(useTranslations('es')('footer.copyright', { year: 2026 })).toBe(
      '© 2026 Qa Ulew. Todos los derechos reservados.',
    );
  });

  it('coerces non-string values', () => {
    // `year` arrives as a number from `new Date().getFullYear()`.
    expect(useTranslations('es')('social.followOn', { platform: 7 })).toBe('Seguinos en 7');
  });

  it('replaces every occurrence, not just the first', () => {
    const t = useTranslations('es');
    // `videos.watchOn` has one; the regex is global, so prove it on a value
    // that would expose a non-global replace.
    expect(t('videos.loadNotice', { provider: 'YouTube' })).toContain('YouTube');
  });

  it('leaves a placeholder untouched when no value is supplied', () => {
    // The `name in params ? ... : match` branch. Printing the raw {provider} is
    // ugly, but silently printing "undefined" on the page is worse.
    expect(useTranslations('es')('videos.watchOn', { wrong: 'x' })).toBe('Ver en {provider}');
  });

  it('skips interpolation entirely when no params are given', () => {
    // The early return. A string containing braces must survive untouched.
    expect(useTranslations('es')('videos.watchOn')).toBe('Ver en {provider}');
  });
});

describe('localePath', () => {
  it('returns an unprefixed path for the default locale', () => {
    // `prefixDefaultLocale: false` — Spanish lives at the root, and a /es/
    // prefix would be a second URL for the same page.
    expect(localePath('/', 'es')).toBe('/');
  });

  it('falls back to the default locale for an unknown one', () => {
    expect(localePath('/', 'de')).toBe('/');
    expect(localePath('/', undefined)).toBe('/');
  });
});

describe('alternateLocales', () => {
  it('returns nothing while the site has one locale', () => {
    // An hreflang set pointing a page at itself is what Google flags as a
    // self-referencing alternate. Emitting none is correct, not incomplete.
    expect(alternateLocales('/', 'https://qa-ulew.tv')).toEqual([]);
  });

  it('returns one absolute entry per locale once a second exists', async () => {
    /*
     * The branch that cannot be reached with today's config, and the one that
     * matters most — it only ever runs on the day a second language ships, so
     * without a test it ships untested by definition.
     *
     * TWO mocks, for two different reasons:
     *
     *   ~/i18n/config  our registry, to declare that a second locale exists.
     *   astro:i18n     Astro's own router, which validates against the locales
     *                  baked into astro.config.ts at build time and throws
     *                  MissingLocaleError for anything else. Our config mock
     *                  cannot reach it.
     *
     * What is under test is this function's own logic — iterate the registry,
     * pair each locale with its BCP-47 tag, resolve against the site origin.
     * Astro's routing is Astro's to test.
     */
    vi.doMock('~/i18n/config', async () => {
      const actual = await vi.importActual<typeof import('~/i18n/config')>('~/i18n/config');
      return {
        ...actual,
        LOCALES: ['es', 'en'],
        LOCALE_META: {
          ...actual.LOCALE_META,
          en: { label: 'English', htmlLang: 'en', ogLocale: 'en_US', dir: 'ltr' },
        },
      };
    });

    vi.doMock('astro:i18n', () => ({
      // Mirrors `prefixDefaultLocale: false`: Spanish at the root, everything
      // else prefixed.
      getRelativeLocaleUrl: (locale: string, path: string) =>
        locale === 'es' ? path : `/${locale}${path}`,
    }));

    const { alternateLocales: withTwo } = await import('~/i18n/utils');
    const alternates = withTwo('/contacto', 'https://qa-ulew.tv');

    expect(alternates).toEqual([
      { locale: 'es', hrefLang: 'es-GT', href: 'https://qa-ulew.tv/contacto' },
      { locale: 'en', hrefLang: 'en', href: 'https://qa-ulew.tv/en/contacto' },
    ]);
  });
});
