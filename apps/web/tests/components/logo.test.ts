import { describe, expect, it } from 'vitest';

import Logo from '~/components/Logo.astro';
import { SITE } from '~/config/site';
import { render } from '../helpers/render';

/**
 * The bug this component's shape exists to prevent:
 *
 * Both artworks — black ink and white ink — are always in the DOM, and a token
 * decides which is `display: block`. An `alt` on one of them is an accessible
 * name that exists in exactly ONE theme. It was on the black mark, so in dark
 * mode the footer logo announced nothing at all, and the failure was invisible
 * in light mode, which is where it was looked at.
 *
 * A test cannot flip a CSS custom property, so it asserts the property that
 * makes the theme irrelevant: the name is on the wrapper, and neither image
 * carries one.
 */
describe('the accessible name', () => {
  it('lives on the wrapper, not on either artwork', async () => {
    const { query, queryAll } = await render(Logo);

    const wrapper = query('[role="img"]');
    expect(wrapper?.getAttribute('aria-label')).toBe(SITE.name);

    // Whichever artwork the theme shows, the name is unaffected.
    const images = queryAll('img');
    expect(images).toHaveLength(2);
    for (const image of images) expect(image.getAttribute('alt')).toBe('');
  });

  it('can be overridden for a caller that supplies its own', async () => {
    const { query } = await render(Logo, { props: { alt: 'Volver al inicio' } });

    expect(query('[role="img"]')?.getAttribute('aria-label')).toBe('Volver al inicio');
  });

  it('disappears entirely when the caller passes an empty alt', async () => {
    // The hero and the header link both name themselves. A second name here
    // would have a screen reader read the brand twice for one control.
    const { query, html } = await render(Logo, { props: { alt: '' } });

    expect(query('[role="img"]')).toBeNull();
    expect(html).toContain('aria-hidden="true"');
  });
});

describe('the two artworks', () => {
  it('ships both, so neither is synthesised with a filter', async () => {
    const { queryAll } = await render(Logo);
    const sources = queryAll('img').map((image) => image.getAttribute('src') ?? '');

    expect(sources.some((src) => src.includes('black'))).toBe(true);
    expect(sources.some((src) => src.includes('white'))).toBe(true);
  });

  it('tags each so the tokens can pick one', async () => {
    const { query } = await render(Logo);

    expect(query('.qa-logo-ink')).not.toBeNull();
    expect(query('.qa-logo-paper')).not.toBeNull();
  });
});

describe('variants and sizing', () => {
  it('uses the reduced mark by default', async () => {
    // The full artwork's tagline and "TV" collapse into specks at header size.
    const { queryAll } = await render(Logo);

    expect(queryAll('img')[0]?.getAttribute('src')).toContain('mark');
  });

  it('uses the full artwork when asked', async () => {
    const { queryAll } = await render(Logo, { props: { variant: 'full' } });

    expect(queryAll('img')[0]?.getAttribute('src')).toContain('full');
  });

  it('pins a fixed height by default', async () => {
    const { query } = await render(Logo, { props: { height: 34 } });

    expect(query('span')?.getAttribute('style')).toContain('34px');
  });

  it('yields to the caller CSS when fluid', async () => {
    // The hero scales with clamp(); an inline height would win on specificity
    // and pin it to a fixed size.
    const { query } = await render(Logo, { props: { fluid: true } });

    expect(query('span')?.hasAttribute('style')).toBe(false);
  });

  it('lazy-loads unless told the mark is above the fold', async () => {
    const lazy = await render(Logo);
    expect(lazy.queryAll('img')[0]?.getAttribute('loading')).toBe('lazy');

    const eager = await render(Logo, { props: { eager: true } });
    expect(eager.queryAll('img')[0]?.getAttribute('loading')).toBe('eager');
  });

  it('always emits width and height, so the box never shifts', async () => {
    // Layout shift from an unsized image is the classic CLS failure.
    const { queryAll } = await render(Logo);

    for (const image of queryAll('img')) {
      expect(Number(image.getAttribute('width'))).toBeGreaterThan(0);
      expect(Number(image.getAttribute('height'))).toBeGreaterThan(0);
    }
  });
});
