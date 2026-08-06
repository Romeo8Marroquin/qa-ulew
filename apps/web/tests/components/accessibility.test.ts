/**
 * The accessibility contracts, asserted against the REAL rendered markup.
 *
 * Everything here was a defect at some point, and every one of them was
 * invisible to a sighted review of the page — which is exactly why they are
 * worth pinning in a test rather than in a document. `docs/accessibility.md`
 * explains the reasoning; this file is what stops it silently becoming fiction.
 *
 * There is no automated accessibility gate in this repo (no axe, no Lighthouse
 * in CI), so these are the only checks that run on every change.
 */
import { describe, expect, it, vi } from 'vitest';

import ContactMethods from '~/components/ContactMethods.astro';
import Header from '~/components/Header.astro';
import Hero from '~/components/Hero.astro';
import Section from '~/components/Section.astro';
import SocialLinks from '~/components/SocialLinks.astro';
import VideoEmbed from '~/components/VideoEmbed.astro';
import { render } from '../helpers/render';

/** Renders the landing page with the network stubbed out. */
async function renderIndex() {
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
}

describe('landmarks are distinct', () => {
  it('gives each navigation its own name', async () => {
    /*
     * All three used to be `t('nav.home')` — "Inicio". A screen reader lists
     * landmarks as a way to move around the page, and three identical entries
     * make that list useless.
     */
    const { queryAll } = await render(Header);
    const labels = queryAll('nav').map((nav) => nav.getAttribute('aria-label'));

    expect(labels).toEqual(['Navegación principal', 'Navegación del menú']);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('names every section, which is what makes it a landmark at all', async () => {
    /*
     * HTML-AAM exposes <section> as `region` ONLY when it has an accessible
     * name. Without this the whole page offered three landmarks — banner, main,
     * contentinfo — and no way to jump to the videos or the contact details.
     */
    const { queryAll, document } = await renderIndex();

    const sections = queryAll('section[id]');
    expect(sections.length).toBeGreaterThanOrEqual(3);

    for (const section of sections) {
      const id = section.getAttribute('aria-labelledby');
      expect(id, `section#${section.id} has no accessible name`).toBeTruthy();
      // The reference has to resolve — a dangling id names nothing.
      expect(document.getElementById(id!), `#${id} does not exist`).not.toBeNull();
    }
  });

  it('does not name a section that has no id to derive one from', async () => {
    // Better a plain grouping element than an `aria-labelledby` pointing at an
    // id that does not exist.
    const { query } = await render(Section, {
      props: { title: 'Sin id' },
      slots: { default: 'content' },
    });

    expect(query('section')?.hasAttribute('aria-labelledby')).toBe(false);
  });
});

describe('the skip link and its target', () => {
  it('points at a <main> that can actually take focus', async () => {
    /*
     * Following a fragment to a non-focusable element moves the scroll position
     * but not focus, and browsers have disagreed on the details for twenty
     * years. `tabindex="-1"` is the fix they all agree on.
     */
    const { query } = await renderIndex();

    const skip = query('a[href="#main"]');
    expect(skip?.textContent?.trim()).toBe('Saltar al contenido principal');

    const main = query('main#main');
    expect(main?.getAttribute('tabindex')).toBe('-1');
  });

  it('puts the skip link first, before anything else focusable', async () => {
    // A skip link that is not the first stop is a skip link nobody reaches.
    const { queryAll } = await renderIndex();
    const focusable = queryAll('a[href], button, [tabindex]:not([tabindex="-1"])');

    expect(focusable[0]?.getAttribute('href')).toBe('#main');
  });
});

describe('the hero photograph', () => {
  it('is described rather than hidden', async () => {
    /*
     * It sits behind the type, which is normally the definition of decorative.
     * It is described anyway because it is the channel — the lake it comes
     * from. An empty alt means a screen-reader visitor arrives at a wordmark
     * and a tagline with nothing underneath them.
     */
    const { queryAll } = await render(Hero);
    const described = queryAll('img').filter((image) => (image.getAttribute('alt') ?? '') !== '');

    expect(described).toHaveLength(1);
    expect(described[0]?.getAttribute('alt')).toContain('Atitlán');
  });

  it('announces the brand exactly once in the h1', async () => {
    // The wordmark image and the hidden heading text both used to carry the
    // name, so the level-one heading read "Qa Ulew. Qa Ulew - Conectando…".
    const { query } = await render(Hero);
    const heading = query('h1');

    expect(heading?.textContent?.trim()).toBe('Qa Ulew - Conectando con nuestra cultura');
    expect(heading?.querySelectorAll('[role="img"]')).toHaveLength(0);
  });

  it('hides the decoration from assistive tech', async () => {
    const { query } = await render(Hero);

    expect(query('.qa-hero-scrim')?.getAttribute('aria-hidden')).toBe('true');
    expect(query('.qa-scroll-cue')?.closest('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('exactly one h1, and headings in order', () => {
  it('has a single level-one heading', async () => {
    const { queryAll } = await renderIndex();

    expect(queryAll('h1')).toHaveLength(1);
  });

  it('never skips a heading level', async () => {
    // Jumping h2 -> h4 breaks heading navigation, which is how many screen
    // reader users move through a page.
    const { queryAll } = await renderIndex();
    const levels = queryAll('h1, h2, h3, h4, h5, h6').map((heading) => Number(heading.tagName[1]));

    for (let index = 1; index < levels.length; index += 1) {
      expect(levels[index]! - levels[index - 1]!).toBeLessThanOrEqual(1);
    }
  });
});

describe('lists keep their semantics', () => {
  it('states role="list" on every list', async () => {
    // Tailwind's preflight sets `list-style: none`, and Safari responds by
    // stripping list semantics — so VoiceOver stops announcing the item count.
    const { queryAll } = await renderIndex();
    const lists = queryAll('ul');

    expect(lists.length).toBeGreaterThan(0);
    for (const list of lists) expect(list.getAttribute('role')).toBe('list');
  });
});

describe('links that leave the site say so', () => {
  it('warns inside the aria-label, where social links can be read', async () => {
    /*
     * An `aria-label` REPLACES the element's contents, so a hidden span inside
     * one is never read. The label still contains the visible platform name,
     * which WCAG 2.5.3 requires so voice control can act on "click YouTube".
     */
    const { queryAll } = await render(SocialLinks, { props: { variant: 'labelled' } });
    const external = queryAll('a[target="_blank"]');

    expect(external.length).toBeGreaterThan(0);
    for (const link of external) {
      const label = link.getAttribute('aria-label') ?? '';
      expect(label).toContain('Se abre en una ventana nueva');
      expect(label).toContain(link.textContent?.trim());
    }
  });

  it('warns with hidden text where the name comes from content', async () => {
    const { queryAll } = await render(ContactMethods);
    const external = queryAll('a[target="_blank"]');

    expect(external.length).toBeGreaterThan(0);
    for (const link of external) {
      expect(link.querySelector('.qa-sr-only')?.textContent).toBe('Se abre en una ventana nueva');
    }
  });

  it('does not warn on tel: and mailto:, which open no window', async () => {
    // They hand off to the OS dialler and mail app. Claiming a new window
    // would simply be untrue.
    const { queryAll } = await render(ContactMethods);
    const handoffs = queryAll('a[href^="tel:"], a[href^="mailto:"]');

    expect(handoffs).toHaveLength(2);
    for (const link of handoffs) {
      expect(link.hasAttribute('target')).toBe(false);
      expect(link.querySelector('.qa-sr-only')).toBeNull();
    }
  });

  it('carries rel="noopener noreferrer" on everything it opens', async () => {
    const { queryAll } = await renderIndex();

    for (const link of queryAll('a[target="_blank"]')) {
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    }
  });
});

describe('controls are labelled and state is exposed', () => {
  it('gives the menu button one constant name plus aria-expanded', async () => {
    /*
     * It used to read "Abrir menú" in both states, so once open a screen reader
     * announced "Abrir menú, expandido" — a control contradicting its own
     * state. The ARIA disclosure pattern is one name and one state attribute.
     */
    const { query } = await render(Header);
    const toggle = query('[data-menu-toggle]');

    expect(toggle?.getAttribute('aria-label')).toBe('Menú');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.getAttribute('aria-controls')).toBe('qa-mobile-nav');
  });

  it('points aria-controls at a panel that exists', async () => {
    const { query, document } = await render(Header);
    const controls = query('[data-menu-toggle]')?.getAttribute('aria-controls');

    expect(document.getElementById(controls!)).not.toBeNull();
  });

  it('leaves no button or link without an accessible name', async () => {
    const { queryAll } = await renderIndex();

    for (const control of queryAll('a, button')) {
      const name = control.getAttribute('aria-label')?.trim() || control.textContent?.trim() || '';
      expect(name, `${control.tagName} "${control.outerHTML.slice(0, 90)}" has no name`).not.toBe(
        '',
      );
    }
  });

  it('hides every decorative icon', async () => {
    /*
     * Each one sits beside real text; announced, they would double it.
     *
     * Checked via `closest`, not on the element itself — `aria-hidden` is
     * inherited by the whole subtree, and the theme toggle correctly hides its
     * two cross-fading glyphs with one attribute on the wrapper that stacks
     * them. Requiring it on each `<svg>` would be asserting a style, not the
     * behaviour.
     */
    const { queryAll } = await renderIndex();
    const svgs = queryAll('svg');

    expect(svgs.length).toBeGreaterThan(0);
    for (const svg of svgs) {
      expect(
        svg.closest('[aria-hidden="true"]'),
        `icon "${svg.getAttribute('data-icon')}" is exposed to assistive tech`,
      ).not.toBeNull();
    }
  });
});

describe('focus that would otherwise be invisible', () => {
  it('draws the video play button ring inward', async () => {
    /*
     * The default ring is offset 3px OUTSIDE the element, and this button is
     * `inset-0` inside a rounded `overflow-hidden` frame — so every pixel of it
     * was clipped and a keyboard user got no ring at all.
     */
    const { query } = await render(VideoEmbed, {
      props: { provider: 'youtube', id: 'abc123', title: 'Prueba' },
    });

    expect(query('button')?.getAttribute('class')).toContain('qa-focus-inset');
  });
});

describe('the document shell', () => {
  it('declares the language and direction', async () => {
    const { html } = await renderIndex();

    expect(html).toContain('lang="es-GT"');
    expect(html).toContain('dir="ltr"');
  });

  it('lets the page be zoomed', async () => {
    // A `maximum-scale` or `user-scalable=no` here is the classic mobile
    // accessibility failure.
    const { html } = await renderIndex();

    expect(html).toContain('width=device-width, initial-scale=1');
    expect(html).not.toContain('maximum-scale');
    expect(html).not.toContain('user-scalable');
  });
});
