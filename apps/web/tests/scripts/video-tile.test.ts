// @vitest-environment happy-dom
/**
 * `video-tile.ts` builds and updates tiles for both `video-feed.ts` and
 * `video-facade.ts`. Most of it is exercised through those two; what is here is
 * the part neither of them can see — that an update with nothing new in it
 * writes nothing at all, and the edges of reading a tile back.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyMeta, cloneTile, readFields, readTile } from '~/scripts/video-tile';
import { createDom } from '../helpers/dom';
import { list, pageDom, tile } from '../helpers/video-markup';

afterEach(() => {
  vi.unstubAllGlobals();
});

const hoursAgo = (hours: number) => new Date(Date.now() - hours * 3_600_000).toISOString();

describe('applyMeta', () => {
  it('writes nothing when nothing changed', async () => {
    // "No change means no DOM work" is a rule of the refresh. A view count
    // re-set to the same text is still a mutation, and still a repaint.
    const dom = pageDom([list('popular', [{ id: 'a', title: 'A' }], { meta: 'views date' })]);
    const element = dom.document.querySelector('[data-video-tile]')!;
    const video = { published: hoursAgo(4), views: 12, live: false };
    applyMeta(element, video, ['views', 'date']);

    const records: MutationRecord[] = [];
    // The window's own observer: the global one belongs to Vitest's document.
    const { MutationObserver: Observer } = dom.window as unknown as typeof globalThis;
    const observer = new Observer((batch) => records.push(...batch));
    observer.observe(element, {
      subtree: true,
      attributes: true,
      childList: true,
      characterData: true,
    });

    applyMeta(element, video, ['views', 'date']);
    await Promise.resolve();
    observer.disconnect();

    expect(records).toHaveLength(0);
  });

  it('formats for the page language, and for Spanish when it has none', () => {
    const dom = createDom(tile({ id: 'a', title: 'A' }));
    const element = dom.document.querySelector('[data-video-tile]')!;

    applyMeta(element, { views: 1500 }, ['views']);

    expect(element.querySelector('[data-video-views-count]')?.textContent).toBe('1500');
  });

  it('tolerates a tile missing the parts it would write to', () => {
    const dom = createDom('<figure data-video-tile></figure>');
    const element = dom.document.querySelector('[data-video-tile]')!;

    applyMeta(element, { published: hoursAgo(1), views: 3, live: true }, ['views', 'date']);

    expect(element.hasAttribute('data-live')).toBe(true);
  });
});

describe('readTile', () => {
  it('reads a tile back into the video it shows', () => {
    const published = hoursAgo(2);
    const dom = createDom(tile({ id: 'abc', title: 'Desfile', views: 9, published, live: true }));

    expect(readTile(dom.document.querySelector('[data-video-tile]')!)).toEqual({
      id: 'abc',
      title: 'Desfile',
      embeddable: true,
      published,
      views: 9,
      live: true,
    });
  });

  it('reads an empty count as unknown, not as zero', () => {
    const dom = createDom('<figure data-video-tile data-views=""></figure>');

    expect(readTile(dom.document.querySelector('[data-video-tile]')!)).toEqual({
      id: '',
      title: '',
      embeddable: false,
      published: '',
      views: null,
      live: false,
    });
  });
});

describe('readFields', () => {
  it('reads the details its list shows', () => {
    const dom = pageDom([list('popular', [{ id: 'a', title: 'A' }], { meta: 'views date' })]);

    expect(readFields(dom.document.querySelector('[data-video-tile]')!)).toEqual(['views', 'date']);
  });

  it('reads nothing outside a list', () => {
    const dom = createDom(tile({ id: 'a', title: 'A' }));

    expect(readFields(dom.document.querySelector('[data-video-tile]')!)).toEqual([]);
  });
});

describe('cloneTile', () => {
  it('still returns a template that has no figure in it', () => {
    // Nothing to fill, but nothing to throw over either.
    const dom = createDom(
      '<template data-video-template="embeddable"><li>__TITLE__</li></template>',
    );

    const fragment = cloneTile({ id: 'a', title: 'A', embeddable: true });

    expect(fragment?.firstElementChild?.tagName).toBe('LI');
    expect(dom.document.querySelector('li')).toBeNull();
  });
});
