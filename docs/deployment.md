# Deployment — Cloudflare Pages

The landing is a **fully static** Astro build. `apps/web/dist/` contains nothing
but HTML, CSS, JS and assets, so Cloudflare Pages serves it directly — no
adapter, no Functions, no runtime.

---

## 1. Cloudflare Pages project settings

Create the project from **Workers & Pages → Create → Pages → Connect to Git**,
then use exactly these settings.

| Setting                             | Value                              |
| ----------------------------------- | ---------------------------------- |
| Production branch                   | `main`                             |
| Framework preset                    | **None** (do _not_ pick "Astro")   |
| Build command                       | `pnpm --filter @qa-ulew/web build` |
| Build output directory              | `apps/web/dist`                    |
| Root directory                      | _(leave empty — repo root)_        |
| Non-production branch build command | `pnpm --filter @qa-ulew/web build` |

### Why "Framework preset: None"

The Astro preset assumes a single-app repo and would run `npm run build` in the
repo root with an output directory of `dist`. This is a **pnpm workspace**: the
build has to be filtered to the `@qa-ulew/web` package and the output lives one
level down.

### Why the root directory stays empty

`pnpm-lock.yaml` and `pnpm-workspace.yaml` live at the repo root. Pages runs its
install step in the root directory, so pointing it at `apps/web` would break
workspace resolution. Keep it at the repo root and let the `--filter` flag
select the app.

---

## 2. Environment variables (required)

Set these under **Settings → Environment variables**. Note the differences
between the two environments.

| Variable       | Production   | Preview   | Required                             |
| -------------- | ------------ | --------- | ------------------------------------ |
| `PNPM_VERSION` | `11.20.0`    | `11.20.0` | **Yes — the build fails without it** |
| `NODE_VERSION` | `24.19.0`    | `24.19.0` | Recommended                          |
| `PUBLIC_ENV`   | `production` | `preview` | Recommended                          |

### `PNPM_VERSION` is not optional

The Pages v3 build image ships **pnpm 10.11.1**, and Cloudflare does _not_
detect the pnpm version from `pnpm-lock.yaml` or from the `packageManager`
field. Two things break without this variable:

1. The lockfile is written by pnpm 11 and pnpm 10 cannot read it.
2. `.npmrc` sets `engine-strict=true`, and the root `package.json` requires
   `pnpm >=11.20.0`, so the install aborts by design.

That second one is intentional — a loud, early failure beats a deploy built with
the wrong toolchain.

### `NODE_VERSION`

`.nvmrc` (`24.19.0`) is committed at the repo root and Pages honours it, so this
variable is belt-and-braces. Worth setting anyway: the image default is Node
22.16.0, and `engines.node` requires `>=24.19.0 <25`.

### `PUBLIC_ENV`

Setting this to `preview` on the Preview environment makes every branch deploy
emit `<meta name="robots" content="noindex, nofollow">`. Without it, your
`*.pages.dev` preview URLs get indexed and compete with `qa-ulew.tv` for the
same content. Only `PUBLIC_`-prefixed variables reach the build — which also
means **never** put a secret behind that prefix; it would be inlined into the
HTML.

---

## 3. Custom domain (`qa-ulew.tv`)

1. Add the domain as a zone in Cloudflare (**Add a site**) and point the
   registrar at Cloudflare's nameservers.
2. In the Pages project → **Custom domains** → **Set up a domain** → `qa-ulew.tv`.
3. Add `www.qa-ulew.tv` too and let Cloudflare create the redirect to the apex.
4. SSL/TLS → set encryption mode to **Full (strict)**.

DNS records are created automatically when the zone is already on Cloudflare.

---

## 4. Deploying from the CLI (optional)

Git integration is the normal path. For a one-off manual deploy:

```bash
pnpm build
pnpm --filter @qa-ulew/web cf:deploy   # wrangler pages deploy ./dist
```

This needs a Cloudflare API token with the **Cloudflare Pages: Edit**
permission, exposed as `CLOUDFLARE_API_TOKEN` (plus `CLOUDFLARE_ACCOUNT_ID`).
Create it at **My Profile → API Tokens**. Do not commit it.

To preview the production build locally against the Pages runtime:

```bash
pnpm build
pnpm --filter @qa-ulew/web cf:preview   # wrangler pages dev ./dist
```

---

## 5. Response headers

`apps/web/public/_headers` is copied verbatim into `dist/` and applied by Pages.
It currently sets baseline security headers and immutable caching for
`/_astro/*` (safe — Astro fingerprints those filenames).

A `Content-Security-Policy` is deliberately **not** set yet. Adding one before
the video embeds and any ad provider are final would break them; the policy
needs `frame-src` entries for `youtube-nocookie.com` and `facebook.com` at
minimum. Revisit once `config/site.ts` has real values.

---

## 6. Adding server-side rendering later

Everything is static today. When a page genuinely needs a server — signed
Cloudflare Stream URLs, geo-targeted ads, a contact form — do this:

```bash
pnpm --filter @qa-ulew/web add @astrojs/cloudflare
```

```ts
// astro.config.ts
import cloudflare from "@astrojs/cloudflare";
export default defineConfig({
  output: "static",
  adapter: cloudflare(),
  // ...
});
```

```astro
---
// only this page becomes server-rendered
export const prerender = false;
---
```

**Be aware of what this changes.** The adapter targets Cloudflare _Workers_, not
Pages. It splits the build into `dist/client` + `dist/server` and writes a
`wrangler.json` into the served directory, hiding it via `.assetsignore` — a
mechanism Pages does not honour, so that file would be publicly readable at
`/wrangler.json`. When that day comes, migrate the project to **Workers with
Static Assets**, which is also where Cloudflare is putting all new investment.
That migration is straightforward and is the reason this repo is a monorepo:
`apps/web` stays put and the deploy target changes around it.

Until then, a static site needs no adapter, and not having one keeps `dist/`
clean and the Pages configuration trivial.
