/**
 * Metadata fails silently by definition: a broken share card looks perfect in
 * the browser and only shows up when someone posts the link. These tests are
 * the only place that failure surfaces before a visitor does.
 *
 * The two details that are skipped most often, and both cause real problems:
 *
 *   og:image MUST be absolute. WhatsApp and several other scrapers will not
 *   resolve a relative one, and the card renders blank.
 *
 *   og:image:width/height let a scraper lay the card out before it has fetched
 *   the image. Without them the first share of a link often shows no picture at
 *   all, because the crawler gave up waiting.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import BaseHead from '~/components/BaseHead.astro';
import { CONTACT, SITE } from '~/config/site';
import { renderHead } from '../helpers/render';

const content = (rendered: Awaited<ReturnType<typeof renderHead>>, selector: string) =>
  rendered.query(selector)?.getAttribute('content');

afterEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('the basics', () => {
  it('titles the page with the site name and tagline', async () => {
    const head = await renderHead(BaseHead);

    expect(head.query('title')?.textContent).toBe('Qa Ulew - Conectando con nuestra cultura');
  });

  it('appends the site name to a page title', async () => {
    const head = await renderHead(BaseHead, { props: { title: 'Página no encontrada' } });

    expect(head.query('title')?.textContent).toBe('Página no encontrada - Qa Ulew');
  });

  it('describes the channel as sololateco, not guatemalteco', async () => {
    // Naming the country claims a reach the channel does not have, and competes
    // for queries against every channel in Guatemala rather than the ones it
    // can win.
    const head = await renderHead(BaseHead);

    expect(content(head, 'meta[name="description"]')).toContain('sololateco');
  });

  it('declares a canonical URL', async () => {
    const head = await renderHead(BaseHead);

    expect(head.query('link[rel="canonical"]')?.getAttribute('href')).toBe(`${SITE.url}/`);
  });
});

describe('indexing', () => {
  it('invites indexing with the limits removed', async () => {
    // Without `max-snippet:-1` and friends the listing is quietly downgraded.
    const head = await renderHead(BaseHead);
    const robots = content(head, 'meta[name="robots"]') ?? '';

    expect(robots).toContain('index, follow');
    expect(robots).toContain('max-image-preview:large');
    expect(robots).toContain('max-snippet:-1');
  });

  it('blocks indexing when a page asks for it', async () => {
    const head = await renderHead(BaseHead, { props: { noindex: true } });

    expect(content(head, 'meta[name="robots"]')).toBe('noindex, nofollow');
  });

  it('blocks indexing on preview deploys', async () => {
    // A *.pages.dev preview competing with qa-ulew.tv for the same content is
    // duplicate content the site loses to itself.
    vi.stubEnv('PUBLIC_ENV', 'preview');

    const Component = (await import('~/components/BaseHead.astro')).default;
    const head = await renderHead(Component);

    expect(content(head, 'meta[name="robots"]')).toBe('noindex, nofollow');
  });
});

describe('share cards', () => {
  it('makes og:image absolute', async () => {
    const head = await renderHead(BaseHead);
    const image = content(head, 'meta[property="og:image"]') ?? '';

    expect(image.startsWith('https://')).toBe(true);
    expect(() => new URL(image)).not.toThrow();
  });

  it('declares the image dimensions so the card lays out before it loads', async () => {
    const head = await renderHead(BaseHead);

    expect(content(head, 'meta[property="og:image:width"]')).toBe('1200');
    expect(content(head, 'meta[property="og:image:height"]')).toBe('630');
  });

  it('describes the share image', async () => {
    const head = await renderHead(BaseHead);

    expect(content(head, 'meta[property="og:image:alt"]')).toBe(
      'Qa Ulew - Conectando con nuestra cultura',
    );
  });

  it('carries the Open Graph set that every chat app reads', async () => {
    // WhatsApp, Messenger, Facebook, LinkedIn, Slack, Discord and Telegram all
    // read Open Graph, so this is the set that has to be complete.
    const head = await renderHead(BaseHead);

    for (const property of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url']) {
      expect(head.query(`meta[property="${property}"]`), property).not.toBeNull();
    }
    expect(content(head, 'meta[property="og:locale"]')).toBe('es_GT');
  });

  it('adds only what X does not inherit from Open Graph', async () => {
    const head = await renderHead(BaseHead);

    expect(content(head, 'meta[name="twitter:card"]')).toBe('summary_large_image');
  });

  it('omits handles and app ids that do not exist', async () => {
    // A fabricated fb:app_id attributes our traffic to someone else's app.
    const head = await renderHead(BaseHead);

    expect(SITE.twitterHandle).toBe('');
    expect(head.query('meta[name="twitter:site"]')).toBeNull();
    expect(head.query('meta[property="fb:app_id"]')).toBeNull();
  });
});

describe('structured data', () => {
  const graph = async () => {
    const head = await renderHead(BaseHead);
    return JSON.parse(head.query('script[type="application/ld+json"]')?.textContent ?? '{}');
  };

  it('emits one @graph rather than loose blocks', async () => {
    // A graph lets nodes reference each other by @id, so a search engine treats
    // them as one entity instead of unrelated fragments.
    const data = await graph();

    expect(data['@context']).toBe('https://schema.org');
    expect(Array.isArray(data['@graph'])).toBe(true);
  });

  it('describes the channel as a TelevisionStation', async () => {
    // A LocalBusiness subtype, so the address and phone are meaningful rather
    // than ignored as decoration.
    const [org] = (await graph())['@graph'];

    expect(org['@type']).toBe('TelevisionStation');
    expect(org.telephone).toBe(CONTACT.phone);
    expect(org.address.addressLocality).toBe('Sololá');
    expect(org.address.addressCountry).toBe('GT');
  });

  it('claims Sololá, not the whole country', async () => {
    // Claiming Guatemala competes for queries the station cannot win and
    // dilutes the ones it can.
    const [org] = (await graph())['@graph'];

    expect(org.areaServed.name).toBe('Sololá');
    expect(org.areaServed.containedInPlace.name).toBe('Guatemala');
  });

  it('links the site to the channel profiles as the same entity', async () => {
    const [org] = (await graph())['@graph'];

    expect(org.sameAs.length).toBeGreaterThan(0);
    for (const url of org.sameAs) expect(url).not.toBe('');
  });

  it('makes the website node reference the organisation', async () => {
    const [org, site] = (await graph())['@graph'];

    expect(site['@type']).toBe('WebSite');
    expect(site.publisher['@id']).toBe(org['@id']);
  });

  it('emits video nodes only with every field Google requires', async () => {
    // An incomplete VideoObject is worse than none — Google rejects the lot.
    const videos = (await graph())['@graph'].filter(
      (node: { '@type': string }) => node['@type'] === 'VideoObject',
    );

    for (const video of videos) {
      expect(video.name).toBeTruthy();
      expect(video.description).toBeTruthy();
      expect(video.thumbnailUrl).toBeTruthy();
      expect(video.uploadDate).toBeTruthy();
    }
  });

  it('keeps video nodes off subpages', async () => {
    // They describe the landing page's content, not the 404.
    const head = await renderHead(BaseHead, { props: { title: 'Página no encontrada' } });
    const data = JSON.parse(head.query('script[type="application/ld+json"]')?.textContent ?? '{}');

    expect(
      data['@graph'].some((node: { '@type': string }) => node['@type'] === 'VideoObject'),
    ).toBe(false);
  });
});

describe('icons and browser chrome', () => {
  it('serves an icon larger than 48px for search results', async () => {
    // Google picks the result icon from these, and upscales a lone 32px one —
    // often preferring a generic globe instead.
    const head = await renderHead(BaseHead);
    const sizes = head.queryAll('link[rel="icon"]').map((link) => link.getAttribute('sizes'));

    expect(sizes).toContain('96x96');
  });

  it('declares an apple-touch-icon, which ignores the manifest', async () => {
    const head = await renderHead(BaseHead);

    expect(head.query('link[rel="apple-touch-icon"]')).not.toBeNull();
    expect(head.query('link[rel="manifest"]')).not.toBeNull();
  });

  it('matches the browser chrome to each colour scheme', async () => {
    const head = await renderHead(BaseHead);
    const colors = head.queryAll('meta[name="theme-color"]');

    expect(colors).toHaveLength(2);
    expect(colors.map((meta) => meta.getAttribute('content'))).toEqual(['#fbfaf8', '#0e0d0b']);
  });
});

describe('third parties', () => {
  it('warms up the video hosts without contacting them', async () => {
    const head = await renderHead(BaseHead);

    expect(head.query('link[rel="preconnect"]')?.getAttribute('href')).toContain(
      'youtube-nocookie.com',
    );
  });

  it('emits no analytics script when no token is set', async () => {
    vi.doMock('~/config/site', async () => {
      const actual = await vi.importActual<typeof import('~/config/site')>('~/config/site');
      return { ...actual, ANALYTICS: { cloudflareToken: '' } };
    });

    const Component = (await import('~/components/BaseHead.astro')).default;
    const head = await renderHead(Component);

    expect(head.html).not.toContain('cloudflareinsights.com');

    vi.doUnmock('~/config/site');
  });

  it('emits the cookie-free beacon when a token is set', async () => {
    // Cloudflare Web Analytics: no cookies, so no consent banner is required.
    const head = await renderHead(BaseHead);

    expect(head.html).toContain('static.cloudflareinsights.com/beacon.min.js');
  });
});

describe('hreflang', () => {
  it('emits none while the site has one language', async () => {
    // A self-referencing alternate set is what Google flags.
    const head = await renderHead(BaseHead);

    expect(head.queryAll('link[rel="alternate"]')).toHaveLength(0);
  });
});
