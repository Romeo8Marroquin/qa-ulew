/**
 * Hard Rule 3: **unconfigured data renders nothing.**
 *
 * The channel's real social URLs, video ids and ad account do not exist yet.
 * The site has to look finished anyway — so a component given nothing must emit
 * nothing, never a dead link, an empty box, or a broken iframe. This is the
 * rule most likely to be broken by accident, because the placeholder state is
 * not the state anyone develops against.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import AdSlot from '~/components/AdSlot.astro';
import LocalePicker from '~/components/LocalePicker.astro';
import SocialLinks from '~/components/SocialLinks.astro';
import VideoEmbed from '~/components/VideoEmbed.astro';
import { render } from '../helpers/render';

afterEach(() => {
  vi.resetModules();
  vi.doUnmock('~/config/site');
  vi.doUnmock('~/i18n/config');
});

describe('SocialLinks', () => {
  it('renders only the platforms that have a URL', async () => {
    const { queryAll } = await render(SocialLinks);
    const hrefs = queryAll('a').map((link) => link.getAttribute('href'));

    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) expect(href).not.toBe('');
  });

  it('renders nothing at all when none are configured', async () => {
    // Not an empty <ul>, which would still occupy layout and read as a list of
    // zero items.
    vi.doMock('~/config/site', async () => {
      const actual = await vi.importActual<typeof import('~/config/site')>('~/config/site');
      return { ...actual, activeSocialLinks: () => [] };
    });

    const Component = (await import('~/components/SocialLinks.astro')).default;
    const { html } = await render(Component);

    expect(html.trim()).toBe('');
  });

  it('prints the platform name only in the labelled variant', async () => {
    const icons = await render(SocialLinks);
    const labelled = await render(SocialLinks, { props: { variant: 'labelled' } });

    expect(icons.query('a')?.textContent?.trim()).toBe('');
    expect(labelled.query('a')?.textContent?.trim()).toBe('YouTube');
  });

  it('falls back to a title attribute when the name is not visible', async () => {
    // A tooltip is the only hint a sighted mouse user gets from a bare glyph.
    const { query } = await render(SocialLinks);

    expect(query('a')?.getAttribute('title')).toBe('YouTube');
  });
});

describe('VideoEmbed', () => {
  it('renders a click-to-load facade, never an iframe up front', async () => {
    // A stock YouTube embed costs ~1 MB of third-party JS and sets cookies
    // before the visitor has asked for anything.
    const { query } = await render(VideoEmbed, {
      props: { provider: 'youtube', id: 'abc123', title: 'Reportaje' },
    });

    expect(query('iframe')).toBeNull();
    expect(query('[data-video-facade]')).not.toBeNull();
  });

  it('holds the privacy-preserving embed URL until the click', async () => {
    const { query } = await render(VideoEmbed, {
      props: { provider: 'youtube', id: 'abc123', title: 'Reportaje' },
    });

    const src = query('[data-video-facade]')?.getAttribute('data-src') ?? '';
    expect(src).toContain('youtube-nocookie.com');
    expect(src).toContain('abc123');
  });

  it('derives the YouTube poster from the id', async () => {
    // hqdefault always exists; maxresdefault 404s on older uploads.
    const { query } = await render(VideoEmbed, {
      props: { provider: 'youtube', id: 'abc123', title: 'Reportaje' },
    });

    expect(query('img')?.getAttribute('src')).toContain('i.ytimg.com/vi/abc123/hqdefault.jpg');
  });

  it('escapes an id rather than trusting it into a URL', async () => {
    const { query } = await render(VideoEmbed, {
      props: { provider: 'youtube', id: 'a b&c', title: 'Raro' },
    });

    expect(query('[data-video-facade]')?.getAttribute('data-src')).toContain('a%20b%26c');
  });

  it('names the play button with the video it plays', async () => {
    // Six identical "Reproducir video" buttons are six buttons a screen reader
    // user cannot tell apart.
    const { query } = await render(VideoEmbed, {
      props: { provider: 'youtube', id: 'abc', title: 'Fiesta de Sololá' },
    });

    expect(query('button')?.getAttribute('aria-label')).toBe('Reproducir video: Fiesta de Sololá');
  });

  it('links out to the original platform', async () => {
    const { queryAll } = await render(VideoEmbed, {
      props: { provider: 'youtube', id: 'abc', title: 'T' },
    });
    const watch = queryAll('a').find((link) => link.getAttribute('href')?.includes('watch'));

    expect(watch?.getAttribute('href')).toBe('https://www.youtube.com/watch?v=abc');
    expect(watch?.textContent).toContain('Ver en YouTube');
  });

  it('supports Facebook, whose id is a full permalink', async () => {
    const { query } = await render(VideoEmbed, {
      props: {
        provider: 'facebook',
        id: 'https://www.facebook.com/watch/?v=1',
        title: 'FB',
        poster: '/poster.jpg',
      },
    });

    expect(query('[data-video-facade]')?.getAttribute('data-src')).toContain(
      'facebook.com/plugins/video.php',
    );
    // Facebook exposes no public thumbnail URL, so the poster must be supplied.
    expect(query('img')?.getAttribute('src')).toBe('/poster.jpg');
  });

  it('refuses to render a Stream video while Stream is not configured', async () => {
    /*
     * Otherwise this emits a facade pointing at `customer-.cloudflarestream.com`
     * — a URL with the account id missing, which fails only once someone
     * presses play.
     *
     * Asserted on the markup rather than on an empty string: the Container API
     * still emits this component's `<script>` tag, so "renders nothing" means
     * no figure, not a zero-length render.
     */
    const { query } = await render(VideoEmbed, {
      props: { provider: 'cloudflare-stream', id: 'uid', title: 'Stream' },
    });

    expect(query('figure')).toBeNull();
    expect(query('[data-video-facade]')).toBeNull();
  });

  it('renders a Stream video once a customer code exists', async () => {
    vi.doMock('~/config/site', async () => {
      const actual = await vi.importActual<typeof import('~/config/site')>('~/config/site');
      return { ...actual, STREAM: { customerCode: 'abc123' } };
    });

    const Component = (await import('~/components/VideoEmbed.astro')).default;
    const { query } = await render(Component, {
      props: { provider: 'cloudflare-stream', id: 'uid', title: 'Stream' },
    });

    expect(query('[data-video-facade]')?.getAttribute('data-src')).toContain(
      'customer-abc123.cloudflarestream.com',
    );
    // No public watch page for a Stream video, so no "watch on" link.
    expect(query('figcaption a')).toBeNull();
  });

  it('falls back to a gradient when there is no poster', async () => {
    vi.doMock('~/config/site', async () => {
      const actual = await vi.importActual<typeof import('~/config/site')>('~/config/site');
      return { ...actual, STREAM: { customerCode: 'abc123' } };
    });

    const Component = (await import('~/components/VideoEmbed.astro')).default;
    const { query } = await render(Component, {
      props: { provider: 'cloudflare-stream', id: 'uid', title: 'Stream' },
    });

    expect(query('img')).toBeNull();
    expect(query('[data-video-facade] div')).not.toBeNull();
  });

  it('eager-loads only the first poster', async () => {
    const first = await render(VideoEmbed, {
      props: { provider: 'youtube', id: 'a', title: 'T', eager: true },
    });
    const rest = await render(VideoEmbed, {
      props: { provider: 'youtube', id: 'b', title: 'T' },
    });

    expect(first.query('img')?.getAttribute('loading')).toBe('eager');
    expect(rest.query('img')?.getAttribute('loading')).toBe('lazy');
  });
});

describe('AdSlot', () => {
  it('renders nothing and loads no script while ads are off', async () => {
    const { html } = await render(AdSlot, { props: { placement: 'header' } });

    expect(html.trim()).toBe('');
  });

  it('names the region as advertising once enabled', async () => {
    // A complementary landmark a screen reader can announce and skip, rather
    // than an unlabelled block dropped mid-page.
    vi.doMock('~/config/site', async () => {
      const actual = await vi.importActual<typeof import('~/config/site')>('~/config/site');
      return {
        ...actual,
        ADS: { provider: 'adsense', adsenseClientId: 'ca-pub-0000000000000000' },
        adsEnabled: () => true,
      };
    });

    const Component = (await import('~/components/AdSlot.astro')).default;
    const { query } = await render(Component, { props: { placement: 'in-feed' } });

    const aside = query('aside');
    expect(aside?.getAttribute('aria-label')).toBe('Publicidad');
    expect(aside?.getAttribute('data-ad-placement')).toBe('in-feed');
  });

  it('reserves its height up front, so enabling ads shifts nothing', async () => {
    // Layout shift from ads bolted on afterwards is what most often tanks CLS.
    vi.doMock('~/config/site', async () => {
      const actual = await vi.importActual<typeof import('~/config/site')>('~/config/site');
      return {
        ...actual,
        ADS: { provider: 'custom', adsenseClientId: '' },
        adsEnabled: () => true,
      };
    });

    const Component = (await import('~/components/AdSlot.astro')).default;
    const { query } = await render(Component, {
      props: { placement: 'footer', height: [250, 90] },
    });

    const style = query('aside')?.getAttribute('style') ?? '';
    expect(style).toContain('--qa-ad-h-mobile:250px');
    expect(style).toContain('--qa-ad-h-desktop:90px');
  });
});

describe('LocalePicker', () => {
  it('renders nothing while the site has one language', async () => {
    // No dead UI today; it appears on its own the moment a locale is added.
    const { html } = await render(LocalePicker);

    expect(html.trim()).toBe('');
  });

  it('appears with no code change once a second locale exists', async () => {
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
      getRelativeLocaleUrl: (locale: string, path: string) =>
        locale === 'es' ? path : `/${locale}${path}`,
    }));

    const Component = (await import('~/components/LocalePicker.astro')).default;
    const { queryAll, query } = await render(Component);

    const links = queryAll('a');
    expect(links.map((link) => link.textContent?.trim())).toEqual(['Español', 'English']);
    // `hreflang` tells the browser and search engines what it is switching to.
    expect(links[1]?.getAttribute('hreflang')).toBe('en');
    // The active language is marked, not just styled differently.
    expect(query('[aria-current="true"]')?.textContent?.trim()).toBe('Español');
    expect(query('nav')?.getAttribute('aria-label')).toBe('Cambiar idioma');

    vi.doUnmock('astro:i18n');
  });
});
