/// <reference types="astro/client" />

/**
 * Build-time environment variables.
 *
 * Only `PUBLIC_`-prefixed values are readable from `import.meta.env`. Set them
 * in the Cloudflare Pages dashboard per environment (Production / Preview).
 * Anything secret must NOT be PUBLIC_ — it would be inlined into the HTML.
 */
interface ImportMetaEnv {
  /**
   * 'production' on the live site, 'preview' on branch deploys.
   * Preview builds emit <meta name="robots" content="noindex"> so the
   * *.pages.dev URLs never compete with qa-ulew.tv in search results.
   */
  readonly PUBLIC_ENV?: 'production' | 'preview' | 'development';
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
