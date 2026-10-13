/**
 * The video tile and the video list, rendered for real.
 *
 * Two jobs. The first is the usual one: assert what a visitor and a screen
 * reader get. The second is specific to this pair — the browser scripts are
 * tested against hand-written markup (`tests/helpers/video-markup.ts`, because
 * happy-dom cannot run the Container API), and the `HOOKS` test below is what
 * holds that markup to the real component. If `VideoEmbed` drops or renames a
 * hook a script reads, it fails here instead of the script tests going on
 * passing against a shape the site no longer ships.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import VideoEmbed from '~/components/VideoEmbed.astro';
import VideoList from '~/components/VideoList.astro';
import VideoTemplates from '~/components/VideoTemplates.astro';
import type { FeaturedVideo } from '~/config/site';
import { render } from '../helpers/render';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

const PUBLISHED = '2026-10-13T02:00:00Z';

const embed = (props: Record<string, unknown> = {}) =>
  render(VideoEmbed, {
    props: { provider: 'youtube', id: 'abc123', title: 'Desfile', ...props },
  });

describe('VideoEmbed — the details line', () => {
  /** Every element a browser script finds a tile's parts by. */
  const HOOKS = [
    '[data-video-tile]',
    '[data-video-live-badge]',
    '[data-video-title]',
    '[data-video-meta]',
    '[data-video-live]',
    '[data-video-views]',
    '[data-video-views-count]',
    '[data-video-separator]',
    '[data-video-date]',
  ];

  it('renders every hook the scripts read, in both tile shapes', async () => {
    for (const embeddable of [true, false]) {
      const { query } = await embed({ embeddable });
      for (const hook of HOOKS) expect(query(hook), `${hook} (${embeddable})`).not.toBeNull();
    }
  });

  it('carries the raw values the scripts read back', async () => {
    const { query } = await embed({ published: PUBLISHED, views: 92, live: true });
    const tile = query('[data-video-tile]');

    expect(tile?.getAttribute('data-video-id')).toBe('abc123');
    expect(tile?.getAttribute('data-published')).toBe(PUBLISHED);
    expect(tile?.getAttribute('data-views')).toBe('92');
    expect(tile?.hasAttribute('data-live')).toBe(true);
  });

  it('omits values it does not have, rather than writing empty ones', async () => {
    const tile = (await embed()).query('[data-video-tile]');

    expect(tile?.hasAttribute('data-published')).toBe(false);
    expect(tile?.hasAttribute('data-views')).toBe(false);
    expect(tile?.hasAttribute('data-live')).toBe(false);
  });

  it('prints the date in the channel’s time zone', async () => {
    // 02:00 UTC on the 13th is the evening of the 12th in Sololá.
    const { query } = await embed({ published: PUBLISHED, meta: ['date'] });
    const time = query('[data-video-date]');

    expect(time?.hasAttribute('hidden')).toBe(false);
    expect(time?.getAttribute('datetime')).toBe(PUBLISHED);
    expect(time?.textContent?.trim()).toBe('12 oct 2026');
    expect(time?.getAttribute('title')).toContain('12 de octubre de 2026');
  });

  it('shows views only when its list asks for them', async () => {
    const recent = await embed({ published: PUBLISHED, views: 92, meta: ['date'] });
    expect(recent.query('[data-video-views]')?.hasAttribute('hidden')).toBe(true);

    const popular = await embed({ published: PUBLISHED, views: 92, meta: ['views', 'date'] });
    expect(popular.query('[data-video-views]')?.hasAttribute('hidden')).toBe(false);
    expect(popular.query('[data-video-views-count]')?.textContent).toBe('92');
    expect(popular.query('[data-video-separator]')?.hasAttribute('hidden')).toBe(false);
  });

  it('names the view count for a screen reader', async () => {
    // The eye icon is hidden from assistive tech; a bare "92" means nothing.
    const { query } = await embed({ views: 92, meta: ['views'] });

    expect(query('[data-video-views] .qa-sr-only')?.textContent).toBe('Visualizaciones:');
    expect(query('[data-video-views] svg')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('says only "en vivo" about a stream on air', async () => {
    const { query } = await embed({
      published: PUBLISHED,
      views: 3,
      live: true,
      meta: ['views', 'date'],
    });

    expect(query('[data-video-live-badge]')?.hasAttribute('hidden')).toBe(false);
    expect(query('[data-video-live]')?.hasAttribute('hidden')).toBe(false);
    expect(query('[data-video-live]')?.textContent).toContain('Transmitiendo ahora');
    expect(query('[data-video-views]')?.hasAttribute('hidden')).toBe(true);
    expect(query('[data-video-date]')?.hasAttribute('hidden')).toBe(true);
  });

  it('keeps the thumbnail badge out of the accessibility tree and out of the way', async () => {
    // The caption says the same thing as text. And the badge sits over the
    // play button, so it must not swallow the click.
    const badge = (await embed({ live: true })).query('[data-video-live-badge]');

    expect(badge?.getAttribute('aria-hidden')).toBe('true');
    expect(badge?.getAttribute('class')).toContain('pointer-events-none');
    expect(badge?.textContent?.trim()).toBe('En vivo');
  });

  it('renders the line empty and hidden for a template', async () => {
    const { query } = await embed({ id: '__ID__', title: '__TITLE__' });

    for (const part of ['[data-video-live]', '[data-video-views]', '[data-video-date]']) {
      expect(query(part)?.hasAttribute('hidden'), part).toBe(true);
    }
    expect(query('[data-video-live-badge]')?.hasAttribute('hidden')).toBe(true);
  });
});

const videos = (count: number): FeaturedVideo[] =>
  Array.from({ length: count }, (_, index) => ({
    provider: 'youtube',
    id: `video${String(index).padStart(6, '0')}`,
    title: `Video ${index}`,
    published: PUBLISHED,
    views: index,
  }));

const list = (props: Record<string, unknown>) =>
  render(VideoList, { props: { name: 'recent', meta: ['date'], videos: [], ...props } });

describe('VideoList', () => {
  it('is a real list, every tile an item', async () => {
    const { query, queryAll } = await list({ videos: videos(4) });

    expect(query('ul')?.getAttribute('role')).toBe('list');
    expect(queryAll('ul > li')).toHaveLength(4);
  });

  it('tells the grid what is left over when every tile is shown', async () => {
    // The HTML shows all of them, so its remainders are for the whole list.
    // `.qa-video-grid` promotes that many tiles to the top row.
    const grid = (await list({ videos: videos(14) })).query('ul');

    expect(grid?.getAttribute('class')).toContain('qa-video-grid');
    expect(grid?.getAttribute('data-rem-2')).toBe('0');
    expect(grid?.getAttribute('data-rem-3')).toBe('2');
  });

  it('ships every tile visible', async () => {
    // Collapsing the list is the script's job. Without JavaScript the visitor
    // gets everything, not three tiles and a dead button.
    const { queryAll } = await list({ videos: videos(15) });

    expect(queryAll('ul > li[hidden]')).toHaveLength(0);
  });

  it('ships the button hidden, pointing at the grid it controls', async () => {
    const { query } = await list({ videos: videos(15) });
    const button = query('[data-video-more]');

    expect(button?.hasAttribute('hidden')).toBe(true);
    expect(button?.getAttribute('type')).toBe('button');
    expect(button?.getAttribute('aria-controls')).toBe('recent-videos');
    expect(query('#recent-videos')).not.toBeNull();
  });

  it('gives the script both plural forms of the label, unformatted', async () => {
    const button = (await list({ videos: videos(15) })).query('[data-video-more]');

    expect(button?.getAttribute('data-label-one')).toBe('Ver {count} video más');
    expect(button?.getAttribute('data-label-other')).toBe('Ver {count} videos más');
    expect(button?.textContent?.trim()).toBe('Ver 12 videos más');
  });

  it('carries the list’s sizes and details for the scripts', async () => {
    const root = (
      await list({ name: 'popular', meta: ['views', 'date'], videos: videos(2) })
    ).query('[data-video-list]');

    expect(root?.getAttribute('data-video-list')).toBe('popular');
    expect(root?.getAttribute('data-video-meta')).toBe('views date');
    expect(root?.getAttribute('data-initial')).toBe('3');
    expect(root?.getAttribute('data-step')).toBe('12');
  });

  it('links to the whole channel, saying it opens a new window', async () => {
    const link = (await list({ videos: videos(2) })).query(
      'a[href="https://www.youtube.com/@QaUlew"]',
    );

    expect(link?.textContent).toContain('Ver todo en YouTube');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(link?.querySelector('.qa-sr-only')?.textContent).toBe('Se abre en una ventana nueva');
  });

  it('has a status line that is silent until used', async () => {
    const status = (await list({ videos: videos(2) })).query('[data-video-status]');

    expect(status?.getAttribute('role')).toBe('status');
    expect(status?.textContent?.trim()).toBe('');
    expect(status?.getAttribute('data-template')).toBe('Mostrando {shown} de {total} videos');
  });

  it('loads only the first poster eagerly, and only when asked', async () => {
    const eager = await list({ videos: videos(3), eager: true });
    expect(eager.queryAll('img[loading="eager"]')).toHaveLength(1);

    const lazy = await list({ videos: videos(3) });
    expect(lazy.queryAll('img[loading="eager"]')).toHaveLength(0);
  });

  describe('with nothing in it', () => {
    it('shows the empty message, and no way out to an empty channel', async () => {
      const { query } = await list({ videos: [] });

      expect(query('[data-video-empty]')?.hasAttribute('hidden')).toBe(false);
      expect(query('a[href*="youtube.com/@"]')).toBeNull();
    });

    it('drops the channel link when no handle is configured', async () => {
      vi.doMock('~/config/site', async () => {
        const actual = await vi.importActual<typeof import('~/config/site')>('~/config/site');
        return { ...actual, youtubeChannelUrl: () => '' };
      });
      const Component = (await import('~/components/VideoList.astro')).default;

      const { query } = await render(Component, {
        props: { name: 'recent', meta: ['date'], videos: videos(2) },
      });

      expect(query('a[href*="youtube.com/@"]')).toBeNull();
      vi.doUnmock('~/config/site');
    });
  });
});

describe('VideoTemplates', () => {
  it('renders one prototype of each shape, wrapped as a list item', async () => {
    const { queryAll } = await render(VideoTemplates);
    const templates = queryAll('template');

    expect(templates.map((template) => template.getAttribute('data-video-template'))).toEqual([
      'embeddable',
      'link',
    ]);
    for (const template of templates) {
      const content = (template as HTMLTemplateElement).content;
      // Rendered alone, the template is where Astro first meets these
      // components, so their <script>s land in it too. `cloneTile` strips
      // them; what is left must be the one list item.
      const elements = [...content.children].filter((element) => element.tagName !== 'SCRIPT');
      expect(elements.map((element) => element.tagName)).toEqual(['LI']);
      expect(content.querySelector('[data-video-tile]')?.getAttribute('data-video-id')).toBe(
        '__ID__',
      );
    }
  });

  it('renders nothing when the feed is off', async () => {
    vi.doMock('~/config/site', async () => {
      const actual = await vi.importActual<typeof import('~/config/site')>('~/config/site');
      return { ...actual, youtubeFeedEnabled: () => false };
    });
    const Component = (await import('~/components/VideoTemplates.astro')).default;

    const { queryAll } = await render(Component);

    expect(queryAll('template')).toHaveLength(0);
    vi.doUnmock('~/config/site');
  });
});

describe('the home page', () => {
  async function renderIndex() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network disabled in tests');
      }),
    );
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Index = (await import('~/pages/index.astro')).default;
    return render(Index);
  }

  it('renders both lists, each in its own named section', async () => {
    const { query } = await renderIndex();

    expect(query('#videos [data-video-list="recent"]')).not.toBeNull();
    expect(query('#popular [data-video-list="popular"]')).not.toBeNull();
    expect(query('#popular')?.getAttribute('aria-labelledby')).toBe('popular-title');
    expect(query('#popular-title')?.textContent).toBe('Lo más visto');
  });

  it('shows dates on the recent list and views with dates on the popular one', async () => {
    const { query } = await renderIndex();

    expect(query('[data-video-list="recent"]')?.getAttribute('data-video-meta')).toBe('date');
    expect(query('[data-video-list="popular"]')?.getAttribute('data-video-meta')).toBe(
      'views date',
    );
  });

  it('renders the templates once, for both lists', async () => {
    const { queryAll } = await renderIndex();

    expect(queryAll('template[data-video-template="embeddable"]')).toHaveLength(1);
    expect(queryAll('template[data-video-template="link"]')).toHaveLength(1);
  });

  it('ships no live badge from the build', async () => {
    // Live state comes only from the Function. Baked into static HTML, a badge
    // would still say "en vivo" days later.
    const { queryAll } = await renderIndex();

    expect(queryAll('[data-video-live-badge]:not([hidden])')).toHaveLength(0);
  });

  it('leaves the popular section out when there is nothing to show', async () => {
    vi.doMock('~/lib/youtube', async () => {
      const actual = await vi.importActual<typeof import('~/lib/youtube')>('~/lib/youtube');
      return {
        ...actual,
        fetchVideoCatalog: async () => ({
          recent: [{ provider: 'youtube', id: 'abcdefghijk', title: 'Uno' }],
          popular: [],
        }),
      };
    });

    const { query } = await renderIndex();

    expect(query('#popular')).toBeNull();
    expect(query('#videos [data-video-list="recent"]')).not.toBeNull();
    vi.doUnmock('~/lib/youtube');
  });
});
