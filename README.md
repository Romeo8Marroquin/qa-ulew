# Qa Ulew

Monorepo for the **Qa Ulew** TV channel — landing page and future Cloudflare
services. Production domain: **[qa-ulew.tv](https://qa-ulew.tv)**.

> **Status: scaffolding.** The structure, tooling, i18n, theming and deployment
> path are done and verified. The visual design, logo, icons, fonts, palette and
> real channel content are pending — every placeholder is marked `TODO` in
> `apps/web/src/config/site.ts` and `apps/web/src/styles/tokens.css`.

---

## Stack

| Layer     | Choice                                           |
| --------- | ------------------------------------------------ |
| Framework | Astro 7 (`output: 'static'`, zero JS by default) |
| Styling   | Tailwind CSS v4 + CSS design tokens              |
| Icons     | astro-icon (Simple Icons + Lucide), inlined SVG  |
| i18n      | Astro native — Spanish today, more on demand     |
| Hosting   | Cloudflare Pages                                 |
| Toolchain | Node 24.19.0 LTS · pnpm 11.20.0 · TypeScript 6   |

---

## Requirements

- **Node 24.19.0** (latest LTS) — `nvm use` reads `.nvmrc`
- **pnpm 11.20.0** — `corepack enable pnpm` picks it up from `packageManager`

`engine-strict` is on: the wrong Node or pnpm fails the install immediately
rather than producing a subtly different build.

```bash
nvm install 24.19.0 && nvm use 24.19.0
corepack enable pnpm
pnpm install
```

## Commands

Run from the repo root.

| Command        | What it does                                            |
| -------------- | ------------------------------------------------------- |
| `pnpm dev`     | Dev server at http://localhost:4321                     |
| `pnpm build`   | Build every workspace package                           |
| `pnpm preview` | Serve the production build locally                      |
| `pnpm check`   | Type-check `.astro` and `.ts` (`astro check`)           |
| `pnpm format`  | Format everything with Prettier                         |
| `pnpm verify`  | `format:check` + `check` + `build` — run before pushing |
| `pnpm clean`   | Remove build output and `node_modules`                  |

Target a single package with `--filter`:

```bash
pnpm --filter @qa-ulew/web dev
```

## Layout

```
apps/web/          Astro landing page → qa-ulew.tv
packages/          shared libraries (empty — first tenants: ui, tsconfig)
docs/              architecture, deployment, i18n, content, ads, design
```

Future Workers, APIs and services become new folders under `apps/`. pnpm picks
them up automatically.

---

## Where to change things

| To change...                   | Edit                              |
| ------------------------------ | --------------------------------- |
| Any user-visible text          | `apps/web/src/i18n/locales/es.ts` |
| Social links, videos, ad flags | `apps/web/src/config/site.ts`     |
| Colours, fonts, radii, shadows | `apps/web/src/styles/tokens.css`  |
| Response headers / caching     | `apps/web/public/_headers`        |

Three rules keep this working:

1. **No hardcoded copy in components** — it cannot be translated later.
2. **No raw colour values outside `tokens.css`** — it will not respond to the
   dark theme and will survive the rebrand.
3. **Unconfigured data renders nothing** — never a dead link or an empty box.

---

## Documentation

| Document                                | Covers                                                    |
| --------------------------------------- | --------------------------------------------------------- |
| [architecture.md](docs/architecture.md) | Repo layout, technology choices, conventions              |
| [deployment.md](docs/deployment.md)     | **Exact Cloudflare Pages settings**, domain, env vars     |
| [design.md](docs/design.md)             | Applying the real palette, fonts and logo; theming        |
| [i18n.md](docs/i18n.md)                 | Using translations; adding a language                     |
| [content.md](docs/content.md)           | Videos, embeds, social links, Cloudflare Stream migration |
| [ads.md](docs/ads.md)                   | Ad strategy, AdSense vs. custom, prerequisites            |

---

## Deployment

Cloudflare **Pages** builds from `main`. The settings that matter:

- Build command: `pnpm --filter @qa-ulew/web build`
- Build output directory: `apps/web/dist`
- Root directory: _empty_ (repo root — the pnpm workspace lives there)
- Framework preset: **None**
- **`PNPM_VERSION=11.20.0` is required** — the build image ships pnpm 10 and
  cannot read this lockfile.

Use **Pages**, not Workers Builds. If the dashboard is asking for a "Deploy
command" or a "Path", you are in the wrong product and it cannot deploy this
repository — see [docs/deployment.md](docs/deployment.md) §0.

The full configuration record — every value currently set in production, plus
the custom domain, preview variables, a verification checklist and a
troubleshooting table — is in [docs/deployment.md](docs/deployment.md).

---

## What's built

- Static Astro site, ~1 KB of JavaScript total
- Light/dark theming that follows the OS, with a manual override and no
  flash of the wrong theme on load
- Spanish (Guatemalan _voseo_) with type-safe translations; adding a language
  is a 3-step change that touches no page files
- Click-to-load video embeds for YouTube and Facebook that load no third-party
  JavaScript until the visitor presses play — and a `cloudflare-stream`
  provider already wired for later
- Inert ad slots with placement decided and layout space reserved
- SEO: canonical URLs, Open Graph, Twitter cards, sitemap, `robots.txt`, and
  automatic `noindex` on preview deploys
- Accessibility: skip link, visible focus rings, `prefers-reduced-motion`,
  labelled controls

## What's pending

- Designs, logo, icons, fonts, palette → `tokens.css`, `favicon.svg`, `Header.astro`
- Real social URLs and featured videos → `config/site.ts`
- `public/og-default.png` (1200×630) — referenced but not yet created
- Contact email → `config/site.ts`
- Privacy policy page — required before any advertising

## License

MIT — see [LICENSE](LICENSE).
