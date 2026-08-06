# Testing

**289 tests. 100% coverage of every line of TypeScript the site ships**, with
the threshold enforced so it cannot quietly slip.

```bash
pnpm test              # run once
pnpm test:watch        # re-run on change
pnpm test:coverage     # + the coverage report and its thresholds
pnpm lint              # ESLint, including 34 accessibility rules
pnpm verify            # format + lint + types + coverage + build
```

`pnpm verify` is the gate. It now fails on a lint error, a type error, a failing
test, or coverage dropping below 100% — not only on a broken build.

## The tools, and why each one

| Tool                    | Job                                          |
| ----------------------- | -------------------------------------------- |
| **Vitest**              | Runner. Shares Astro's own Vite pipeline     |
| **@vitest/coverage-v8** | Coverage, thresholded at 100%                |
| **happy-dom**           | A DOM for the browser scripts                |
| **Astro Container API** | Renders real `.astro` components to HTML     |
| **ESLint + jsx-a11y**   | Correctness, and a static accessibility gate |

Vitest rather than Jest because `getViteConfig()` from `astro/config` hands the
test runner **the same resolver the real build uses**. That is not a
convenience: `i18n/utils.ts` imports `astro:i18n`, a virtual module that only
exists inside Astro's pipeline, so without it the module cannot even be loaded.
It also means `~/` comes from the project config rather than being restated in a
second place where it can drift.

## Layout

```
apps/web/
├── vitest.config.ts        the config, and the three reasons it looks odd
└── tests/
    ├── setup.ts            disables the network
    ├── helpers/
    │   ├── dom.ts          a fresh browser per test
    │   └── render.ts       Container API → queryable document
    ├── i18n/               translation, locale resolution, hreflang
    ├── config/             feature flags, placeholders, contact details
    ├── lib/                the YouTube feed and every way it can fail
    ├── scripts/            the five browser modules
    └── components/         rendered markup, contracts, metadata
```

## The client scripts were moved out of the components

Each component's inline `<script>` now lives in `src/scripts/` and the component
carries only an import:

```astro
<script>
  import "~/scripts/header";
</script>
```

A test cannot import a `<script>` tag, so before this, roughly 375 lines — the
theme toggle, the mobile menu, the scroll reveal, the custom scrollbar and the
video facade — were untestable. That was most of the site's actual runtime
behaviour and all of the part most likely to break silently.

**The shipped JavaScript is unchanged.** Astro bundles an imported module
exactly as it bundled the inline block; the built bundle was diffed against the
pre-extraction build and is byte-for-byte identical, filename hash included.

The modules still **run on import**, exactly as an inline module script does.
They do not export an `init()` for tests to call, because that would have made
this a rewrite rather than a move and left the tests exercising a shape the site
does not ship. So a test builds its DOM first, then calls `vi.resetModules()`
and re-imports.

Each also ends with `export {}`. TypeScript decides module-vs-script from the
file's own syntax, and without a top-level import or export it puts every
top-level `const` in the global scope — three of these declare `root` or
`reducedMotion`, so they collided. The bundler erases it.

## Three things that will cost you an afternoon

### The default environment is `node`, not a DOM

Vitest picks Vite's resolve conditions from the environment, and **a DOM
environment selects the `browser` condition** — for which Astro publishes a stub
that throws `Astro components cannot be used in the browser` instead of the
compiled component.

So under happy-dom the Container API cannot render anything importing `<Image>`
or `<Icon>`, and it fails with `No valid renderer was found for this file
extension` naming a component it cannot identify. A long way from the cause.

Browser code opts in per file:

```ts
// @vitest-environment happy-dom
```

### `<Image>` and `<Icon>` need `ssr.noExternal`

Both are `.astro` files inside `node_modules`. Vite externalises node_modules
for SSR, so they reached Node unprocessed. `ssr.noExternal: ['astro',
'astro-icon']` puts them back through the compiler, which is what the real build
does.

### `window.setTimeout` is not `setTimeout`

`theme-toggle.ts` calls `window.setTimeout` — correct browser code, where the
two are the same function. A happy-dom `Window` brings its own timer
implementation, and `vi.useFakeTimers()` patches only the globals, so
`advanceTimersByTime` drove a clock the module was not watching and the 200ms
theme swap never landed. `helpers/dom.ts` routes the window's timers back to the
globals.

## A fresh browser per test

Vitest gives one DOM per test **file**, and these modules attach listeners to
`document` at import time — so the second test in a file would run against a
document still carrying the first test's handlers. Those failures are
order-dependent and miserable to diagnose.

`createDom()` builds a real new `Window` per test and points the globals at it.
It also supplies what happy-dom does not implement and what a test needs to
drive by hand:

| Helper                       | For                                                   |
| ---------------------------- | ----------------------------------------------------- |
| `dom.observers`              | IntersectionObservers, in construction order          |
| `dom.resizeObservers`        | ResizeObservers                                       |
| `dom.setMedia(query, bool)`  | Answer a media query before the module loads          |
| `dom.scrolls`                | Calls to `window.scrollTo`                            |
| `stubLayout(dom, …)`         | Geometry — happy-dom does no layout, so it is 0       |
| `removeIntersectionObserver` | The old-browser path, where content must stay visible |

Observers are identified **by construction order**, because the scripts create
them anonymously. `header.ts` builds the scroll sentinel first and the hero
observer second, and its tests assert that ordering so a future reordering
cannot silently repoint them.

`dom.Event` and `dom.MouseEvent` are happy-dom's constructors typed as the DOM
ones. The two are structurally different, so without a single cast in the helper
every `dispatchEvent` in every test would need its own — or the tests would have
to be excluded from `astro check`, which is precisely how the "not a module"
problem above would have gone unnoticed.

## The network is off

`tests/setup.ts` replaces `fetch` with one that throws. `pages/index.astro`
calls `fetchLatestVideos()` while rendering, so a component test would hit
youtube.com unless it stubbed `fetch` — slow, offline-fragile, and different
depending on whether YouTube happened to be rate-limiting that day. It would
also make the fallback tests meaningless, since they exist to prove what happens
when the request does _not_ succeed.

Tests that mean to exercise it say so:

```ts
vi.stubGlobal('fetch', vi.fn(async () => ok(feed([…]))));
```

## What the component tests are for

They render real components through the Container API and assert the
**accessibility and degradation contracts** — every one of which was a defect at
some point, and every one invisible to a sighted review:

- Each `<nav>` has a distinct name; each `<section>` has one at all
- The skip link is the first focusable thing, and `<main>` can take focus
- Exactly one `<h1>`, and no heading level is skipped
- Every `<ul>` states `role="list"`; every icon is hidden; every control has a name
- Links opening a new tab say so — in the `aria-label` where an `aria-label`
  would otherwise replace the content
- Unconfigured social links, videos and ad slots render **nothing**

`.astro` files are **not** in the coverage denominator. V8 line-maps compiled
Astro output unreliably, and a percentage nobody can act on is worse than none —
so components are covered by assertions about their output rather than by a
number.

## Coverage is 100%, and enforced

```
Statements   100% (369/369)
Branches     100% (181/181)
Functions    100% ( 77/77 )
Lines        100% (315/315)
```

A threshold below 100 on a codebase this size is a budget for untested code, and
budgets get spent. If something genuinely cannot be covered, mark it with a v8
ignore comment **and a reason** rather than lowering the number.

`include: ['src/**/*.ts']` is what makes it mean anything: a module nobody
tested is reported at 0% and fails, rather than being absent from the report.
Excluded are `env.d.ts` (ambient types, no runtime) and `i18n/locales/**` (a
frozen object of strings — a test would assert that a literal equals itself).

### `functions/` is type-checked but not covered

The Pages Function (`functions/api/videos.ts`) sits outside `src/`, so it is
outside the coverage `include`. That is deliberate rather than an oversight:
Vitest loads modules through the Astro resolver, and the Function is bundled by
esbuild from the repository root under a different runtime, so importing it here
would test a shape that is not what ships.

It is not untested territory, because it holds no logic of its own. Everything
it does — parsing the feed, reading an oEmbed verdict, deciding what a unanimous
404 means — lives in `src/lib/youtube-feed.ts`, which is covered directly by
`tests/lib/youtube-feed.test.ts` for exactly this reason. What remains in the
Function is caching, headers and error mapping.

`astro check` still type-checks it: `tsconfig.json` includes
`../../functions/**/*.ts`. And it compiles under the real bundler with

```bash
wrangler pages functions build --outdir=<tmp>   # from the repository root
```

which is the check that catches the failure mode this arrangement actually has —
an import that Vite resolves and esbuild does not.

## Lint

Three tools, no overlap. **Prettier** owns formatting and
`eslint-config-prettier` is last in the config so ESLint never argues with it.
**`astro check`** owns types. **ESLint** owns correctness and accessibility.

The accessibility rules are the reason it exists. `docs/accessibility.md` notes
the repo had no automated accessibility gate; `astro/jsx-a11y/*` is that gate
for what can be seen statically — an image with no alt, a click handler on a
div, an anchor with no href, a positive tabindex. It cannot judge whether alt
text is _good_, so it supplements the component tests rather than replacing
them.

**`eslint-plugin-jsx-a11y` must stay installed.** It is an optional peer of
`eslint-plugin-astro`, and without it the a11y config resolves to an **empty
rule set** — the linter reports success while checking nothing. That is how it
was first configured here, and it was caught only by planting deliberate
violations and confirming they were flagged. Worth repeating if the config is
ever changed.

Two rules are deliberately off, both documented in `eslint.config.js`:

- **`astro/jsx-a11y/no-redundant-roles`** — it says `role="list"` on a `<ul>` is
  redundant. True of the spec, false of Safari, which strips list semantics from
  any list styled `list-style: none` — which Tailwind's preflight applies to
  every list here. Obeying the rule would remove list semantics for VoiceOver
  users, so the rule loses.
- **`no-var` in `BaseLayout.astro`** — the theme boot script is `is:inline`, so
  it ships unprocessed and runs before first paint. It is written in the most
  conservative JavaScript available on purpose; a syntax error there leaves
  every visitor on the wrong theme with the page frozen mid-parse.

Flat config resolves **last match wins**, so the project-wide rules sit _before_
the per-area exceptions. With them after, their unscoped `no-console` and
`no-var` silently overrode every exception and the config looked right while
doing nothing.

Scripts inside a component are linted as virtual files named
`<Component>.astro/*.js` and `*.ts`, so an override targeting the component
alone never reaches them.

## Adding tests

1. **A new function in `src/**/*.ts`** — it must reach 100%, including every
   branch. `verify` will tell you if it does not.
2. **A new browser script** — put it in `src/scripts/`, import it from the
   component's `<script>`, end it with `export {}`, and test it with
   `createDom()` + `vi.resetModules()`.
3. **A new component** — render it through `helpers/render.ts` and assert its
   contracts, not its classes. A test that asserts Tailwind utilities breaks on
   every restyle and catches nothing.
4. **A new accessibility guarantee** — add it to
   `tests/components/accessibility.test.ts` and to `docs/accessibility.md`.
   Those two are meant to agree.

## What this does not cover

- **No browser.** happy-dom is not Chrome; layout, real focus behaviour and
  actual CSS are not exercised. The scrollbar's geometry is stubbed.
- **No screen reader.** The tests assert markup, which is a proxy for what a
  screen reader announces, not a measurement of it.
- **No visual regression.** Nothing here would notice the page turning green.
- **`.astro` files are not in the coverage number**, so a component with no test
  fails nothing. It is the one place the 100% figure does not protect you.

The manual passes in `docs/accessibility.md` still matter, and still have to be
done by a person.
