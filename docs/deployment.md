# Deployment — Cloudflare Pages

The landing is a **static** Astro build. `apps/web/dist/` contains nothing but
HTML, CSS, JS and assets, so Cloudflare Pages serves it directly — no adapter,
no server rendering.

One route is the exception: `/api/videos`, a Pages Function that keeps the video
grid current between deploys. It is compiled from the repository's `functions/`
directory, deploys with the same push, and needs no configuration of its own —
see §13. Nothing else executes, and `dist/` is untouched by it.

This document is the authoritative record of the production configuration.
If the project has to be recreated, or a new environment added, everything
needed is here.

---

## 0. Use Pages, not Workers Builds

Cloudflare's dashboard offers two git-connected products, and it steers new
users toward Workers. **This project uses Pages.** Picking the wrong one wastes
a setup cycle, so check before filling anything in.

You are in the **right** place (Pages) if the form asks for:

- Framework preset
- Build command
- **Build output directory**

You are in the **wrong** place (Workers Builds) if the form asks for:

- **Deploy command** (defaults to `npx wrangler deploy`)
- **Non-production branch deploy command** (`npx wrangler versions upload`)
- **Path**
- An **API token** to be created automatically

Workers Builds cannot deploy this repository as it stands. `wrangler deploy`
requires a `wrangler.jsonc`/`wrangler.toml` with either a Worker entry point or
an `assets` directive, and this repo has neither — see §11 for why. If a Wrangler
config is absent, `wrangler deploy` triggers automatic project configuration and
opens a pull request against the repository, which is not something you want
happening unattended.

Correct path: **Workers & Pages → Create → Pages tab → Connect to Git**.

---

## 1. Configuration record

Everything currently set in production. Re-entering exactly this reproduces the
deployment.

### Build settings

| Setting                             | Value                                |
| ----------------------------------- | ------------------------------------ |
| Product                             | Cloudflare **Pages** (git-connected) |
| Repository                          | `Romeo8Marroquin/qa-ulew`            |
| Production branch                   | `main`                               |
| Framework preset                    | **None**                             |
| Build command                       | `pnpm --filter @qa-ulew/web build`   |
| Build output directory              | `apps/web/dist`                      |
| Root directory                      | _(empty — repo root)_                |
| Non-production branch build command | `pnpm --filter @qa-ulew/web build`   |
| Build watch paths                   | see §5 (optional)                    |
| Preview deployments                 | **None** — see §6                    |
| Automatic production deployments    | Enabled                              |
| `main` branch protection            | None — direct pushes allowed, see §6 |

### Environment variables

| Variable       | Production   | Preview   | Required                             |
| -------------- | ------------ | --------- | ------------------------------------ |
| `PNPM_VERSION` | `11.20.0`    | `11.20.0` | **Yes — the build fails without it** |
| `NODE_VERSION` | `24.19.0`    | `24.19.0` | No — `.nvmrc` already covers it      |
| `PUBLIC_ENV`   | `production` | `preview` | Only if branch previews are used     |

`PNPM_VERSION` and `NODE_VERSION` are **not** environment settings despite living
in this screen — they pin the toolchain of Cloudflare's build container, and
would be required with a single environment just the same. Only `PUBLIC_ENV`
describes an environment.

**Minimum viable configuration: `PNPM_VERSION` alone.** `.nvmrc` handles Node,
and `PUBLIC_ENV` has no effect unless non-production branches are being built.
The site renders correctly with `PUBLIC_ENV` unset — the code treats an absent
value as "not a preview" and indexes normally.

### Domains

| Domain              | Role                                                          |
| ------------------- | ------------------------------------------------------------- |
| `qa-ulew.tv`        | apex, production — Pages custom domain                        |
| `www.qa-ulew.tv`    | 301 to apex via Redirect Rule — **not** a Pages custom domain |
| `qa-ulew.pages.dev` | Cloudflare default, serves the production build               |

SSL/TLS encryption mode: **Full (strict)**.

### Why these values

**Framework preset "None".** The Astro preset assumes a single-app repository
and would run `npm run build` at the repo root with an output directory of
`dist`. This is a pnpm workspace: the build must be filtered to the
`@qa-ulew/web` package, and the output is one level down.

**Root directory empty.** `pnpm-lock.yaml` and `pnpm-workspace.yaml` live at the
repo root, and Pages runs its install step in the root directory. Pointing it at
`apps/web` breaks workspace resolution. Keep it at the repo root and let
`--filter` select the app.

**`--filter` rather than `pnpm run build`.** Both work today. The explicit
filter keeps behaving correctly once `apps/api` or a Worker is added, where the
root script would recurse into every package.

---

## 2. Creating the project

1. **Workers & Pages → Create → Pages tab → Connect to Git.**
2. Authorise GitHub and select `Romeo8Marroquin/qa-ulew`.
3. Enter the build settings from §1.
4. Expand **Environment variables (advanced)** and add `PNPM_VERSION` —
   **before** the first build, see §3. The other two are optional.
5. **Save and Deploy.** The first build takes roughly two minutes.
6. Apply the deployment triggers in §6 — they can only be set after the project
   exists.

---

## 3. Environment variables in detail

Set under **Settings → Environment variables**, per environment.

### `PNPM_VERSION` is not optional

The Pages v3 build image ships **pnpm 10.11.1**, and Cloudflare does _not_
detect the pnpm version from `pnpm-lock.yaml` or from the `packageManager`
field. Two things break without this variable:

1. The lockfile is written by pnpm 11 and pnpm 10 cannot read it.
2. `.npmrc` sets `engine-strict=true`, and the root `package.json` requires
   `pnpm >=11.20.0`, so the install aborts by design.

The second is intentional — a loud, early failure beats a deploy built with the
wrong toolchain. If you forget the variable, add it and use **Retry
deployment**; nothing in the repository needs to change.

### `NODE_VERSION` — optional

`.nvmrc` (`24.19.0`) is committed at the repo root and Pages honours it, so Node
is already pinned without this variable. Setting it is belt-and-braces only.
Leaving it unset is arguably better: bumping `.nvmrc` then updates local, CI and
Cloudflare together, with nothing to remember in the dashboard.

### `PUBLIC_ENV` — optional

Setting this to `preview` on the Preview environment makes every branch deploy
emit `<meta name="robots" content="noindex, nofollow">`. Without it, the
`*.pages.dev` preview URLs get indexed and compete with `qa-ulew.tv` for the
same content.

This only matters if non-production branches are being built, and on this
project they are not — preview deployments are disabled (§6). The variable is
therefore unset. It becomes relevant only if branch previews are ever turned
back on.

If the variable is absent entirely, `import.meta.env.PUBLIC_ENV` is `undefined`,
`BaseHead.astro` treats the build as non-preview, and the page indexes normally.
No code change is needed to run without it.

Only `PUBLIC_`-prefixed variables reach the build. That also means **never** put
a secret behind that prefix — it would be inlined into the HTML.

---

## 4. Custom domain

1. Add the domain as a zone in Cloudflare (**Add a site** → `qa-ulew.tv`) and
   point the registrar at the two Cloudflare nameservers it issues. Wait for the
   zone to report **Active**.
2. Pages project → **Custom domains** → **Set up a domain** → `qa-ulew.tv`.
3. Repeat for `www.qa-ulew.tv`.
4. **SSL/TLS** → encryption mode → **Full (strict)**.
5. Add the `www` → apex redirect rule (below). It is not automatic.

### A DNS record alone is not enough

Every hostname must be registered under **Custom domains** on the Pages project.
Creating only a `CNAME` to `qa-ulew.pages.dev` is not sufficient: per Cloudflare's
documentation, a CNAME added "without first associating the domain (or
subdomains) in the Cloudflare Pages dashboard … will result in your domain
failing to resolve at the CNAME record address, and display a 522 error".

So a DNS record and a custom domain entry are both required, for each hostname.

### `www` does not redirect on its own

Adding both the apex and `www` as Pages custom domains makes **both serve the
site** — Pages creates no redirect. The better arrangement is not to add `www` to
Pages at all, and to redirect it at the edge instead.

A Redirect Rule requires only that the hostname is **proxied** by Cloudflare (the
orange cloud on its DNS record). The rule runs before any origin fetch, so `www`
never reaches Pages and never needs to be registered there.

**Dashboard → the `qa-ulew.tv` zone → Rules → Overview → Create rule → Redirect Rule**

| Field                        | Value                      |
| ---------------------------- | -------------------------- |
| Rule name                    | `www to apex`              |
| When incoming requests match | **Wildcard pattern**       |
| Request URL                  | `http*://www.qa-ulew.tv/*` |
| Then — Type                  | **Dynamic**                |
| Target URL                   | `https://qa-ulew.tv/${2}`  |
| Status code                  | **301**                    |
| Preserve query string        | Enabled                    |

`http*://` matches both schemes, so plain HTTP is caught too.

#### It is `${2}`, not `${1}`

The pattern contains **two** wildcards, and this is easy to get wrong:

```
http*://www.qa-ulew.tv/*
    ^                  ^
   ${1}               ${2}
```

The first `*` captures the **`s` of `https`**, not the path. Using `${1}` sends
every HTTPS visitor to `https://qa-ulew.tv/s` — a 404 — while plain HTTP appears
to work, because there the first wildcard matches an empty string. Cloudflare's
own documentation shows `${1}` for this pattern, which is wrong.

`${2}` is the path. Verified behaviour with `${2}`:

| Request                             | Location                        |
| ----------------------------------- | ------------------------------- |
| `https://www.qa-ulew.tv/`           | `https://qa-ulew.tv/`           |
| `https://www.qa-ulew.tv/contacto`   | `https://qa-ulew.tv/contacto`   |
| `https://www.qa-ulew.tv/videos?x=1` | `https://qa-ulew.tv/videos?x=1` |
| `http://www.qa-ulew.tv/algo`        | `https://qa-ulew.tv/algo`       |

#### Test with 302, ship with 301

Set the status code to **302** while getting a redirect rule right, and change it
to **301** only once verified. Browsers cache a 301 essentially permanently: a
wrong one keeps replaying from cache long after the rule is fixed, for every
visitor who hit it, and there is no way to reach into their browsers and clear
it. A 302 is disposable.

If a stale 301 is already cached locally, a private window bypasses it. Clearing
it properly means **Clear browsing data → Cached images and files**; the browser's
DNS cache page (`vivaldi://net-internals/#dns`) does not hold redirects.

**Keep the `CNAME www → qa-ulew.pages.dev` record, and keep it proxied.** It looks
redundant but is doing a different job than it appears: it is the only reason
`www.qa-ulew.tv` resolves to Cloudflare at all, and the rule can only fire on
traffic that reaches Cloudflare's edge. Deleting it trades a 522 for `NXDOMAIN`.
The CNAME target is never followed once the rule is live — the 301 is answered
before any origin fetch.

#### Expected warning when deploying

Cloudflare shows: _"This rule may not apply to your traffic — your DNS
configuration may not be proxying traffic for **http**"_.

This is a false positive. The validator takes the substring before the first `*`
in `http*://www.qa-ulew.tv/*`, reads it as a hostname called `http`, finds no
such DNS record and warns. It never inspects `www`.

Choose **Ignore and deploy rule anyway**. Do _not_ choose "Create a new proxied
DNS record" — that creates a junk `http.qa-ulew.tv` record.

To confirm the hostname really is proxied before ignoring the warning, check that
it returns Cloudflare-generated headers:

```bash
curl.exe -sS -I https://www.qa-ulew.tv/ | findstr /I "server cf-ray"
# Server: cloudflare
# CF-RAY: ...
```

Any Cloudflare-generated response — including a 522 — proves the edge is handling
the hostname.

If the wildcard form ever fails to match, the equivalent custom filter expression
avoids the parser entirely: match `Hostname` equals `www.qa-ulew.tv`, then a
Dynamic redirect to `concat("https://qa-ulew.tv", http.request.uri.path)`.

Verify:

```bash
curl -I https://www.qa-ulew.tv/
# HTTP/2 301
# location: https://qa-ulew.tv/
```

### Which hostnames to serve

Only `qa-ulew.tv` and `www.qa-ulew.tv`. Resist adding more:

- `m.` is an obsolete pattern — separate mobile subdomains were made redundant
  by responsive design, and the site already adapts.
- `app.` should not point at the landing page. Reserve it for a real application
  and add it when one exists, otherwise the subdomain serves marketing content
  under a name that promises something else.

If extra hostnames are ever pointed here anyway, the duplicate-content risk is
already contained: `astro.config.ts` sets `site: 'https://qa-ulew.tv'`, so every
page emits a canonical URL on the apex no matter which hostname served it.

### Email hardening — deferred, not configured

**Status: not applied.** No mailbox exists and none is planned for now, so the
records below have deliberately not been created. Recorded here so the decision
is a choice rather than an oversight.

The domain sends and receives no mail, which makes it an easy spoofing target —
Cloudflare's DNS panel flags this. When it is worth closing off, publish records
that say so explicitly:

| Type | Name         | Value                                    |
| ---- | ------------ | ---------------------------------------- |
| MX   | `qa-ulew.tv` | `.` with priority `0` (RFC 7505 null MX) |
| TXT  | `qa-ulew.tv` | `v=spf1 -all`                            |
| TXT  | `_dmarc`     | `v=DMARC1; p=reject; rua=mailto:<inbox>` |

This declares that the domain accepts no mail and authorises no sender, so
forged messages claiming to be from `@qa-ulew.tv` get rejected. Revisit if a real
mailbox is set up later — see also the empty `SITE.email` in `config/site.ts`.

---

## 5. Build watch paths (optional, monorepo)

**Settings → Builds → Build watch paths**, include:

```
apps/web/*
packages/*
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
```

Once `apps/api` or a Worker exists, this stops Cloudflare rebuilding the landing
when only unrelated code changed. Leave it unset while `apps/web` is the only
app — it has no effect either way.

---

## 6. Deployment triggers

Production updates **only when a pull request is merged into `main`**. Automatic
branch previews are switched off: they are useful on a larger team, but on a
project this size they publish URLs nobody is watching and add noise to every
push.

This needs one setting on each side. Cloudflare cannot distinguish a merge from
a direct push — a merge _is_ a push to `main` — so GitHub has to be the thing
that enforces the pull request.

### Cloudflare — disable branch previews

**Settings → Build → Branch control** (pencil icon)

Cloudflare's own documentation still describes the older layout,
**Settings → Builds & deployments → Configure Production deployments**. The
redesigned dashboard calls the same panel **Branch control**. The fields are
identical; only the name moved.

| Setting               | Value       |
| --------------------- | ----------- |
| Production branch     | `main`      |
| Automatic deployments | **Enabled** |
| Preview branches      | **None**    |

`None` disables automatic builds for every non-production branch. The default,
`All non-Production branches`, is what creates a public deployment for each
branch pushed. Changes must be saved explicitly.

### GitHub — branch protection (not applied)

**Status: deliberately not configured.** Direct pushes to `main` are allowed and
deploy straight to production. On a single-maintainer project of this size the
pull-request ceremony costs more than it protects, and the deploy is a static
site that can be rolled back from the Cloudflare dashboard in seconds.

The setup below is recorded for the day that changes — a second contributor, or
content important enough to want a review gate.

#### If a pull request requirement is wanted later

**Repository → Settings → Rules → Rulesets → New ruleset → New branch ruleset**

- Target: **Include default branch** (`main`)
- Enable **Require a pull request before merging**
- Set **Required approvals** to **0**
- Optionally enable **Block force pushes** and **Restrict deletions**

The zero approvals is deliberate. As the sole maintainer, requiring even one
approval makes every pull request unmergeable — there is no second person to
approve it. Zero still forces the PR flow while allowing you to merge your own
work.

### Resulting behaviour

As currently configured — Cloudflare previews off, no GitHub ruleset:

| Action                           | Production deploy? |
| -------------------------------- | ------------------ |
| Push to a feature branch         | No                 |
| Open a pull request              | No                 |
| Merge a pull request into `main` | **Yes**            |
| Direct push to `main`            | **Yes**            |

Anything that lands on `main`, by any route, deploys. Nothing else builds at all.

To roll back a bad deploy: **Deployments → the last good deployment → … →
Retry deployment**, which republishes that build without touching git.

### Re-enabling a preview later

Prefer **Custom branches** over `All non-Production branches`: include a single
named branch such as `preview` or `staging`. Then set `PUBLIC_ENV=preview` on
the Preview environment (§3) so those builds carry `noindex` and cannot compete
with `qa-ulew.tv` in search.

---

## 7. Post-deploy verification

Run through this after the first deploy, and after any settings change.

- [ ] `https://qa-ulew.tv/` loads
- [ ] `https://qa-ulew.tv/algo-inexistente` renders the 404 page
- [ ] `https://qa-ulew.tv/wrangler.json` returns **404** (see §11)
- [ ] `https://qa-ulew.tv/robots.txt` resolves
- [ ] `https://qa-ulew.tv/sitemap-index.xml` resolves
- [ ] `www.qa-ulew.tv` redirects to the apex
- [ ] Theme follows the OS setting; the toggle overrides it with no flash on reload
- [ ] Response headers include `X-Content-Type-Options` and `Strict-Transport-Security`
- [ ] `/_astro/*` responses carry `Cache-Control: immutable`
- [ ] On a preview URL, page source contains `<meta name="robots" content="noindex, nofollow">`

---

## 8. Troubleshooting

| Symptom                                                            | Cause                                                                                                                               | Fix                                                         |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `ERR_PNPM_UNSUPPORTED_LOCKFILE_VERSION` or a lockfile parse error  | Build image is on pnpm 10                                                                                                           | Set `PNPM_VERSION=11.20.0`, retry deployment                |
| `Unsupported engine` / `EBADENGINE` during install                 | `engine-strict=true` with the wrong Node or pnpm                                                                                    | Set both `PNPM_VERSION` and `NODE_VERSION` per §1           |
| `No projects matched the filters`                                  | Root directory is set to `apps/web`                                                                                                 | Clear the root directory so it is the repo root             |
| Build succeeds, deploy serves a 404 at `/`                         | Build output directory wrong                                                                                                        | Set it to `apps/web/dist`, not `dist`                       |
| `wrangler deploy` errors, or a config PR appears                   | Project was created as Workers Builds, not Pages                                                                                    | Delete the Worker project and recreate under Pages — see §0 |
| "This project is disconnected from your Git account"               | Cloudflare's GitHub App was uninstalled or its access revoked — commonly after abandoning a Workers Builds project on the same repo | See §8.1 below                                              |
| Pushes to `main` no longer trigger a build                         | Same as above — the git link is broken, not the build config                                                                        | See §8.1 below                                              |
| Preview URLs appearing in Google                                   | `PUBLIC_ENV` not set to `preview` on the Preview env                                                                                | Add it, then redeploy the branch                            |
| Fonts or images 404 after a rebrand                                | Asset placed outside `apps/web/public/`                                                                                             | Anything served verbatim must live in `public/`             |
| **522** on a hostname that has a correct CNAME                     | Hostname not registered under **Custom domains** on the Pages project                                                               | Add it there — see §4                                       |
| `www` serves the site instead of redirecting to the apex           | Pages serves every custom domain; it creates no redirect                                                                            | Create the Redirect Rule in §4                              |
| `www` redirects to `/s` and loses the path                         | Redirect rule uses `${1}`, which captures the `s` of `https`, not the path                                                          | Change the target to `${2}` — see §4                        |
| A redirect keeps misbehaving after the rule was fixed              | The browser cached the old **301** permanently                                                                                      | Verify in a private window; clear cached files — see §4     |
| `DNS_PROBE_FINISHED_NXDOMAIN` on a hostname that resolves publicly | Negative DNS result cached locally from before the record existed                                                                   | `ipconfig /flushdns`, then clear the browser host cache     |

### 8.1 Reconnecting a disconnected Git account

The banner "This project is disconnected from your Git account" means Cloudflare
has lost its GitHub authorisation. Build settings are unaffected — they are
stored on the project — but **no push will trigger a build** until it is fixed.

The usual cause is the Cloudflare GitHub App being uninstalled or having its
repository access revoked. Creating and then abandoning a Workers Builds project
against the same repository can do this, because that flow installs the app with
its own token.

1. **Settings → Build → Git repository → Manage.** This opens the GitHub App
   page. Confirm **Cloudflare Workers and Pages** is installed and that
   `Romeo8Marroquin/qa-ulew` appears under **Repository access**.
2. If it does not, reinstall cleanly: on that GitHub page choose
   **Uninstall "Cloudflare Workers and Pages"** and confirm.
3. In Cloudflare, **Disconnect** the repository, then reconnect it —
   **+ Add account** → **Install & Authorize**.
4. Push a commit to `main` and confirm a build starts under **Deployments**.

Deployments already published stay online throughout; only new builds are
blocked.

---

## 9. Deploying from the CLI (optional)

Git integration is the normal path. For a one-off manual deploy:

```bash
pnpm build
pnpm --filter @qa-ulew/web cf:deploy   # wrangler pages deploy ./dist
```

This needs a Cloudflare API token with the **Cloudflare Pages: Edit**
permission, exposed as `CLOUDFLARE_API_TOKEN` (plus `CLOUDFLARE_ACCOUNT_ID`).
Create it at **My Profile → API Tokens**. Never commit it.

To preview the production build locally against the Pages runtime:

```bash
pnpm build
pnpm --filter @qa-ulew/web cf:preview   # wrangler pages dev ./dist
```

Neither is required for normal operation. If you never deploy from the CLI, the
`wrangler` devDependency and `apps/web/.dev.vars.example` can be removed.

---

## 10. Response headers

`apps/web/public/_headers` is copied verbatim into `dist/` and applied by Pages.
It sets baseline security headers and immutable caching for `/_astro/*` (safe —
Astro fingerprints those filenames).

A `Content-Security-Policy` is deliberately **not** set yet. Adding one before
the video embeds and any ad provider are final would break them; the policy
needs `frame-src` entries for `youtube-nocookie.com` and `facebook.com` at
minimum. Revisit once `config/site.ts` has real values.

---

## 11. Why there is no adapter

`astro.config.ts` sets `output: 'static'` with no adapter, on purpose.

`@astrojs/cloudflare` targets Cloudflare **Workers**, not Pages. It splits the
build into `dist/client` + `dist/server` and writes a `wrangler.json` into the
served directory, relying on `.assetsignore` to hide it — a mechanism Pages does
not honour. Deployed to Pages, that file would be publicly readable at
`/wrangler.json`, exposing the binding layout and local filesystem paths. The
verification step in §7 checks for exactly this.

A static site needs no adapter, and not having one keeps `dist/` flat and the
Pages configuration trivial.

## 12. Adding server-side rendering later

When a page genuinely needs a server — signed Cloudflare Stream URLs,
geo-targeted ads, a contact form:

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

At that point, migrate the project to **Workers with Static Assets**, which is
where the adapter's output shape belongs and where Cloudflare is directing new
investment. The migration is straightforward and is part of why this repository
is a monorepo: `apps/web` stays put and the deploy target changes around it.
The build settings in §1 would then be replaced by a Workers Builds
configuration of the kind described in §0.

---

## 13. The one Pages Function

```
functions/
  api/
    videos.ts     ->  https://qa-ulew.tv/api/videos
```

`/api/videos` re-fetches the YouTube feed on request so the page can correct
itself after load. Why it exists at all is in
[content.md](./content.md#keeping-the-grid-current); this section is about how
it deploys.

### Nothing was configured to make it work

**It is not a Worker.** There is no second Cloudflare project, no
`wrangler.toml`, no deploy command, no dashboard entry, and nothing in §1
changed. Pages looks for a `functions/` directory in the **root directory**
build setting — which is empty here, so the repository root — compiles whatever
it finds, and serves those routes alongside the static assets. Push to `main`
and it ships with everything else.

The route path comes from the file path: `functions/api/videos.ts` answers
`/api/videos`. Static assets win any collision, so a real file at that path
would shadow it.

### Why the directory is at the repository root

Not in `apps/web/`, which is where everything else lives. Pages resolves
`functions/` against the root directory setting, and that has to stay at the
repository root for pnpm workspace resolution (§8). Moving the directory into
the app would mean Pages never finds it and the route silently 404s — with the
site still deploying perfectly, which is the worst kind of failure to diagnose.

`functions/api/videos.ts` therefore imports across that boundary:

```ts
import { YOUTUBE } from "../../apps/web/src/config/site";
import { applyVerdicts, parseFeed } from "../../apps/web/src/lib/youtube-feed";
```

Relative, not `~/` — the Functions bundler is esbuild running at the repository
root and knows nothing about the Astro project's alias. `youtube-feed.ts` is
written with **no imports of its own** specifically so it can be pulled across
that line; adding one to it would break this build, not the app's.

### Verifying it before pushing

`astro dev` and `astro preview` serve no Functions, so the route 404s there and
the page quietly keeps its build-time grid. To exercise the real thing:

```bash
pnpm build
pnpm --filter @qa-ulew/web cf:preview
curl http://127.0.0.1:8788/api/videos
```

That script carries `--cwd ../..` for a reason worth not undoing: wrangler
resolves `functions/` against its working directory, and pnpm runs the script
from `apps/web`, where there is none. Without the flag the site preview works
perfectly and the route 404s — which reads exactly like the Function being
broken.

To type-check and compile it without serving:

```bash
wrangler pages functions build --outdir=<tmp>   # from the repository root
```

`apps/web/tsconfig.json` includes `../../functions/**/*.ts`, so `pnpm verify`
type-checks the Function even though it lives outside the app.

### What it costs

Pages Functions bill as Workers requests: 100,000 per day on the free plan. The
response is cached at the edge for five minutes and the cache is keyed on a
fixed URL, so a burst of traffic collapses to roughly 288 invocations a day
regardless of visitor count. Nothing here approaches the free tier.

### If it ever needs to be turned off

Delete `functions/` and the route stops existing. The page keeps working: the
client script treats a 404 as "keep the build-time grid" (see rule 1 in
`src/scripts/video-feed.ts`), which is exactly what it already does in `astro
dev`.
