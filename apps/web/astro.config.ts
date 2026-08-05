import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import icon from 'astro-icon';
import tailwindcss from '@tailwindcss/vite';

import { SITE } from './src/config/site';
import { DEFAULT_LOCALE, LOCALES } from './src/i18n/config';

// https://astro.build/config
export default defineConfig({
  site: SITE.url,

  // 100% prerendered to static HTML. `dist/` therefore contains nothing but the
  // site itself, which is exactly what Cloudflare Pages wants to serve.
  //
  // No adapter on purpose. @astrojs/cloudflare targets Workers: it splits the
  // build into dist/client + dist/server and writes a wrangler.json INTO the
  // served directory, relying on `.assetsignore` to hide it — a mechanism Pages
  // does not honour, so that file would be published at /wrangler.json.
  // A static site needs no adapter at all. See docs/deployment.md for the exact
  // steps to add one when a page genuinely needs server rendering.
  output: 'static',

  i18n: {
    defaultLocale: DEFAULT_LOCALE,
    locales: [...LOCALES],
    routing: {
      // Spanish is served from the root: qa-ulew.tv/ (not /es/).
      // Any locale added later gets a prefix: qa-ulew.tv/en/
      //
      // Note: `redirectToDefaultLocale` is only valid together with
      // `prefixDefaultLocale: true` — Astro rejects the combination otherwise.
      prefixDefaultLocale: false,
    },
  },

  integrations: [
    // Icons are inlined as SVG at build time — no runtime JS, no icon font.
    // `simple-icons` covers social brand marks, `lucide` the UI glyphs.
    icon({
      include: {
        'simple-icons': [
          'youtube',
          'facebook',
          'messenger',
          'tiktok',
          'instagram',
          'whatsapp',
          'x',
        ],
        lucide: [
          'sun',
          'moon',
          'menu',
          'x',
          'play',
          'arrow-right',
          'arrow-up-right',
          'mail',
          'phone',
          'map-pin',
          'languages',
          'external-link',
        ],
      },
    }),
    sitemap({
      i18n: {
        defaultLocale: DEFAULT_LOCALE,
        locales: Object.fromEntries(LOCALES.map((locale) => [locale, locale])),
      },
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },

  build: {
    // Emit `/about/index.html` style routes so Cloudflare Pages serves clean URLs.
    format: 'directory',
    inlineStylesheets: 'auto',
  },

  prefetch: {
    prefetchAll: true,
    defaultStrategy: 'viewport',
  },

  devToolbar: {
    enabled: false,
  },
});
