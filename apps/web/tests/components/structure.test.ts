import { describe, expect, it, vi } from 'vitest';

import ContactMethods from '~/components/ContactMethods.astro';
import Footer from '~/components/Footer.astro';
import Header from '~/components/Header.astro';
import Reveal from '~/components/Reveal.astro';
import Section from '~/components/Section.astro';
import { CONTACT } from '~/config/site';
import { render } from '../helpers/render';

describe('Section', () => {
  it('wires the heading id to the section that owns it', async () => {
    const { query } = await render(Section, {
      props: { id: 'videos', title: 'Lo más reciente' },
      slots: { default: '<p>content</p>' },
    });

    expect(query('section')?.getAttribute('aria-labelledby')).toBe('videos-title');
    expect(query('h2')?.getAttribute('id')).toBe('videos-title');
  });

  it('renders its slot', async () => {
    const { query } = await render(Section, {
      props: { id: 'x', title: 'T' },
      slots: { default: '<p id="slotted">contenido</p>' },
    });

    expect(query('#slotted')?.textContent).toBe('contenido');
  });

  it('omits the header entirely when there is no title or subtitle', async () => {
    const { query } = await render(Section, { slots: { default: '<p>only content</p>' } });

    expect(query('h2')).toBeNull();
    expect(query('header')).toBeNull();
  });

  it('renders a subtitle without a title', async () => {
    const { query } = await render(Section, {
      props: { subtitle: 'Solo subtítulo' },
      slots: { default: '<p>c</p>' },
    });

    expect(query('h2')).toBeNull();
    expect(query('header p')?.textContent).toBe('Solo subtítulo');
  });

  it('offsets its scroll position for the fixed header', async () => {
    // Belt-and-braces alongside `scroll-padding-top` on <html>: an in-page
    // anchor must not land underneath the bar.
    const { query } = await render(Section, {
      props: { id: 'about', title: 'T' },
      slots: { default: '<p>c</p>' },
    });

    expect(query('section')?.getAttribute('class')).toContain('scroll-mt-24');
  });

  it('alternates the background when asked', async () => {
    const { query } = await render(Section, {
      props: { id: 'x', title: 'T', muted: true },
      slots: { default: '<p>c</p>' },
    });

    expect(query('section')?.getAttribute('class')).toContain('bg-bg-subtle');
  });

  it('hides the decorative rule under the heading', async () => {
    const { query } = await render(Section, {
      props: { id: 'x', title: 'T' },
      slots: { default: '<p>c</p>' },
    });

    expect(query('header span')?.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('Reveal', () => {
  it('never hides content in the markup itself', async () => {
    /*
     * The hidden state is applied by JavaScript, only once the observer is
     * known to be running. If the script is blocked or errors, the content is
     * simply visible — hiding in CSS and revealing in JS is a blank page
     * waiting to happen.
     */
    const { query } = await render(Reveal, { slots: { default: '<p>visible</p>' } });

    const wrapper = query('[data-reveal]');
    expect(wrapper?.hasAttribute('data-reveal-hidden')).toBe(false);
    expect(wrapper?.getAttribute('style')).toBeNull();
  });

  it('renders a div by default and a semantic tag on request', async () => {
    // So a stagger wrapper does not add a meaningless <div> around a <header>.
    const plain = await render(Reveal, { slots: { default: 'x' } });
    const semantic = await render(Reveal, { props: { as: 'header' }, slots: { default: 'x' } });

    expect(plain.query('[data-reveal]')?.tagName.toLowerCase()).toBe('div');
    expect(semantic.query('[data-reveal]')?.tagName.toLowerCase()).toBe('header');
  });

  it('staggers siblings with a transition delay', async () => {
    const { query } = await render(Reveal, {
      props: { delay: 90 },
      slots: { default: 'x' },
    });

    expect(query('[data-reveal]')?.getAttribute('style')).toBe('transition-delay:90ms');
  });
});

describe('Header', () => {
  it('links every in-page section', async () => {
    const { queryAll } = await render(Header);
    const navLinks = queryAll('nav a').map((link) => link.getAttribute('href'));

    expect(new Set(navLinks)).toEqual(new Set(['#videos', '#about', '#contact']));
  });

  it('repeats the same items in the mobile panel', async () => {
    // Two navigations with different contents is a trap on a narrow screen.
    const { queryAll } = await render(Header);
    const desktop = queryAll('header nav a').map((link) => link.getAttribute('href'));
    const mobile = queryAll('#qa-mobile-nav a').map((link) => link.getAttribute('href'));

    expect(mobile).toEqual(desktop);
  });

  it('names the home link by destination, not by brand', async () => {
    // A link's name should say where it goes; the wordmark is already
    // announced by the hero heading and the footer.
    const { query } = await render(Header);
    const home = query('[data-home-link]');

    expect(home?.getAttribute('aria-label')).toBe('Inicio');
    expect(home?.getAttribute('href')).toBe('/');
    expect(home?.querySelector('[role="img"]')).toBeNull();
  });

  it('keeps the mobile panel a sibling of the header, never a child', async () => {
    /*
     * `backdrop-filter` samples the backdrop root. A composited `position:
     * fixed` ancestor carrying its own backdrop-filter — exactly what <header>
     * is — leaves the panel nothing to sample, and the page renders through it
     * perfectly sharp. Nothing inside the panel can fix that.
     */
    const { query } = await render(Header);
    const panel = query('#qa-mobile-nav');

    expect(panel).not.toBeNull();
    expect(panel?.closest('header')).toBeNull();
  });

  it('marks the overlay variant only when asked', async () => {
    const plain = await render(Header);
    const overlay = await render(Header, { props: { overlay: true } });

    expect(plain.query('[data-site-header]')?.hasAttribute('data-overlay')).toBe(false);
    expect(overlay.query('[data-site-header]')?.hasAttribute('data-overlay')).toBe(true);
  });
});

describe('ContactMethods', () => {
  it('renders each detail as an action, not as text to copy out', async () => {
    const { queryAll } = await render(ContactMethods);
    const schemes = queryAll('a').map((link) => link.getAttribute('href') ?? '');

    expect(schemes.some((href) => href.startsWith('tel:'))).toBe(true);
    expect(schemes.some((href) => href.startsWith('mailto:'))).toBe(true);
    expect(schemes.some((href) => href.includes('m.me/'))).toBe(true);
    expect(schemes.some((href) => href.includes('google.com/maps'))).toBe(true);
  });

  it('dials E.164 while displaying the local format', async () => {
    // The href has to work from any country; the visible value is how the
    // number is written in Guatemala.
    const { query } = await render(ContactMethods);
    const phone = query('a[href^="tel:"]');

    expect(phone?.getAttribute('href')).toBe(`tel:${CONTACT.phone}`);
    expect(phone?.textContent).toContain(CONTACT.phoneDisplay);
  });

  it('labels each row so the value is not announced bare', async () => {
    const { queryAll } = await render(ContactMethods);
    const text = queryAll('li').map((item) => item.textContent ?? '');

    expect(text.some((value) => value.includes('Teléfono'))).toBe(true);
    expect(text.some((value) => value.includes('Correo'))).toBe(true);
  });
});

describe('Footer', () => {
  it('names the wordmark, which is the case that used to break in dark mode', async () => {
    const { query } = await render(Footer);

    expect(query('[role="img"]')?.getAttribute('aria-label')).toBe('Qa Ulew');
  });

  it('is the contentinfo landmark', async () => {
    const { query } = await render(Footer);

    expect(query('footer')).not.toBeNull();
  });

  it('stamps the build year rather than scripting it', async () => {
    // The site is fully prerendered, so this is the year of the last deploy —
    // cheaper and more reliable than a client-side script.
    const { html } = await render(Footer);

    expect(html).toContain(`© ${new Date().getFullYear()} Qa Ulew`);
  });
});

describe('the 404 page', () => {
  it('has a real h1 and a way back', async () => {
    const NotFound = (await import('~/pages/404.astro')).default;
    const { query } = await render(NotFound);

    expect(query('h1')?.textContent?.trim()).toBe('Página no encontrada');
    expect(query('a[href="/"]')).not.toBeNull();
  });

  it('pads its content clear of the fixed header', async () => {
    // It has no full-bleed hero, so <main> must not start underneath the bar.
    const NotFound = (await import('~/pages/404.astro')).default;
    const { query } = await render(NotFound);

    expect(query('main')?.getAttribute('class')).toContain('pt-[var(--qa-header-height)]');
  });

  it('is never indexed', async () => {
    const NotFound = (await import('~/pages/404.astro')).default;
    const { html } = await render(NotFound);

    expect(html).toContain('noindex, nofollow');
  });
});

describe('the landing page', () => {
  const renderIndex = async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network disabled in tests');
      }),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Index = (await import('~/pages/index.astro')).default;
    const result = await render(Index);
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    return result;
  };

  it('lets the hero sit under the transparent header', async () => {
    const { query } = await renderIndex();

    expect(query('main')?.getAttribute('class')).not.toContain('pt-[var(--qa-header-height)]');
    expect(query('[data-site-header]')?.hasAttribute('data-overlay')).toBe(true);
  });

  it('renders the three anchored sections the nav points at', async () => {
    // A nav link to a section that does not exist scrolls nowhere.
    const { query, queryAll } = await renderIndex();

    for (const link of queryAll('header nav a')) {
      const id = link.getAttribute('href')?.replace('#', '');
      expect(query(`#${id}`), `no section for ${link.getAttribute('href')}`).not.toBeNull();
    }
  });

  it('explains the logo as term/description pairs', async () => {
    // A <dl> because these genuinely are pairs — not a list of links, not a
    // table.
    const { queryAll, query } = await renderIndex();

    expect(query('dl')?.getAttribute('aria-labelledby')).toBe('identity-title');
    expect(queryAll('dl dt')).toHaveLength(4);
    expect(queryAll('dl dd')).toHaveLength(4);
  });

  it('still renders the video grid when the feed is unreachable', async () => {
    // The whole point of the snapshot fallback: a YouTube outage during a
    // build must not ship an empty videos section.
    const { queryAll } = await renderIndex();

    expect(queryAll('[data-video-facade]').length).toBeGreaterThan(0);
  });
});
