# Architecture

## Repository layout

```
qa-ulew/
├── apps/
│   └── web/                    Astro landing page → qa-ulew.tv
│       ├── public/             copied verbatim to dist/ (_headers, robots.txt, favicon)
│       └── src/
│           ├── components/     presentational .astro components
│           ├── config/site.ts  channel data, feature flags — NOT copy
│           ├── i18n/           locale config, translations, t() helper
│           ├── layouts/        page shells
│           ├── pages/          file-based routes
│           └── styles/         tokens.css (the brand) + global.css (Tailwind)
├── packages/                   shared libraries — empty for now
├── docs/                       this documentation
├── pnpm-workspace.yaml         workspace definition
└── package.json                workspace tooling only, no app dependencies
```

## Why a monorepo from day one

Today there is one app. The plan already includes Workers, an API and
Cloudflare Stream. Converting a single-app repo into a workspace later means
moving every file, rewriting every config path and breaking the deploy — for
no benefit over doing it now, which costs one extra `package.json`.

Adding a second unit is then just:

```bash
mkdir apps/api           # package.json named @qa-ulew/api
```

pnpm picks it up automatically from `pnpm-workspace.yaml`. Nothing else changes.

### Root vs. per-app `package.json`

The root `package.json` is **required** by pnpm to define the workspace, but it
deliberately holds no app dependencies — only:

- workspace-wide tooling (Prettier and its plugins)
- orchestration scripts that delegate (`pnpm build` → `pnpm -r build`)
- the toolchain pins (`packageManager`, `engines`)

Every real dependency lives in `apps/web/package.json`. That keeps each app
self-contained and independently deployable, and stops one app's dependency
from silently satisfying another's import.

## Technology choices

| Choice             | Why                                                                  |
| ------------------ | -------------------------------------------------------------------- |
| Astro 7            | Ships zero JS by default. A landing page is content, not an app.     |
| `output: 'static'` | Prerendered HTML — fastest and cheapest thing Pages can serve.       |
| No adapter         | A static site does not need one; see docs/deployment.md §6.          |
| Tailwind v4        | Configured in CSS, so tokens and utilities live in the same place.   |
| Design tokens      | One file (`tokens.css`) re-skins the whole site when designs arrive. |
| `astro-icon`       | Icons inlined as SVG at build time — no icon font, no runtime JS.    |
| Astro native i18n  | Routing comes from config; adding a language adds no page files.     |

## JavaScript budget

The site currently ships **one small module** (~1 KB) covering the theme toggle,
the mobile menu and the video facades. Everything else is HTML and CSS.

Keep it that way. Before adding a client-side dependency, check whether the
thing can be done at build time or with CSS.

## Rendering and data flow

Everything resolves at build time:

```
config/site.ts   ─┐
i18n/locales/*.ts ├─→ .astro components ─→ static HTML in dist/
public/*         ─┘
```

There is no runtime data fetching and no database. Updating the site means
editing `config/site.ts` or a locale file and pushing — Pages rebuilds.

## Conventions

- **Copy lives in `i18n/locales/`**, never inline in a component. A hardcoded
  Spanish string is a bug: it cannot be translated later.
- **Data lives in `config/site.ts`**, never inline in a component.
- **Colours live in `tokens.css`**. A raw hex anywhere else is a bug — it will
  not respond to the dark theme and will survive the rebrand.
- **Components degrade gracefully.** Unconfigured data (an empty social URL, an
  empty video list) must render nothing rather than a broken link or an empty
  box. The site has to look finished before the real content exists.
- Import with the `~/` alias (`~/components/Header.astro`), not `../../`.
