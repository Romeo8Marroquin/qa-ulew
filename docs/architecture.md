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
│           ├── lib/            build-time data fetching (the YouTube feed)
│           ├── pages/          file-based routes
│           ├── scripts/        client-side modules, imported by components
│           └── styles/         tokens.css (the brand) + global.css (Tailwind)
│       └── tests/              Vitest — unit, component and browser-script
├── functions/                  Cloudflare Pages Functions — ONE route, see below
│   └── api/videos.ts           → /api/videos
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

The site currently ships **~4.3 KB of JavaScript, ~1.9 KB over the wire**,
covering the theme toggle, the mobile menu, the scroll reveal, the custom
scrollbar, the video facades and the video-feed refresh. Everything else is HTML
and CSS.

Keep it that way. Before adding a client-side dependency, check whether the
thing can be done at build time or with CSS.

The refresh (`scripts/video-feed.ts`, ~1.3 KB) is the one thing here that could
_not_ be, and it is worth reading as the standard for when to spend the budget:
the grid is baked at deploy time, so without it a deleted video keeps its tile
until someone happens to redeploy. It degrades to nothing — no fetch on pages
without a grid, no DOM work when the answer matches, and any failure leaves the
build-time HTML untouched.

That code lives in **`src/scripts/`**, one module per component, and the
component carries only an import:

```astro
<script>
  import "~/scripts/header";
</script>
```

Astro bundles the result exactly as it bundled an inline block — the shipped
bundle is byte-for-byte identical either way — and a module can be imported by a
test, which a `<script>` tag cannot. That is the whole reason for the
indirection. See `docs/testing.md`.

## Testing

`pnpm verify` runs format, lint, types, tests and build. Coverage of
`src/**/*.ts` is **100% and enforced**; components are covered by rendering them
through Astro's Container API and asserting their accessibility and degradation
contracts. Details, and the three environment gotchas that cost real time, are
in `docs/testing.md`.

## Rendering and data flow

Almost everything resolves at build time:

```
config/site.ts   ─┐
i18n/locales/*.ts ├─→ .astro components ─→ static HTML in dist/
public/*         ─┘
lib/youtube.ts   ─┘  (fetches the YouTube feed during the build)
```

There is no database, and no page is server-rendered. Updating the site means
editing `config/site.ts` or a locale file and pushing — Pages rebuilds.

The single exception is the video grid, which cannot be correct at build time
because YouTube changes without a deploy:

```
functions/api/videos.ts ─→ /api/videos ─→ scripts/video-feed.ts ─→ the grid
```

Both ends share `lib/youtube-feed.ts` so the build and the runtime cannot
disagree about what the feed says. See
[content.md](./content.md#keeping-the-grid-current) for why, and
[deployment.md §13](./deployment.md#13-the-one-pages-function) for how it ships.

## Conventions

- **Copy lives in `i18n/locales/`**, never inline in a component. A hardcoded
  Spanish string is a bug: it cannot be translated later.
- **Data lives in `config/site.ts`**, never inline in a component.
- **Colours live in `tokens.css`**. A raw hex anywhere else is a bug — it will
  not respond to the dark theme and will survive the rebrand.
- **Components degrade gracefully.** Unconfigured data (an empty social URL, an
  empty video list) must render nothing rather than a broken link or an empty
  box. The site has to look finished before the real content exists.
- **Accessibility strings are copy too.** `alt`, `aria-label` and hidden hints go
  in `i18n/locales/` under `a11y.*`, never inline — they are read aloud in the
  visitor's language. See `docs/accessibility.md`.
- Import with the `~/` alias (`~/components/Header.astro`), not `../../`.
