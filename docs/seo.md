# SEO, sharing and analytics

What is implemented, what was configured outside the repo, and what still needs
doing. Written so any of it can be repeated or reversed without rediscovering
how it works.

Deployment and build settings live in [deployment.md](./deployment.md); this
document is only about being found and being shared.

---

## 1. Current status

| Area                     | State                                                             |
| ------------------------ | ----------------------------------------------------------------- |
| Metadata, Open Graph, X  | Live                                                              |
| Structured data          | Live — 4 valid items                                              |
| Share image              | Live at `/og-default.png`                                         |
| Icons + PWA manifest     | Live                                                              |
| Search-result favicon    | Fixed in repo (96px + `/favicon.ico`), **awaiting deploy**        |
| robots.txt + sitemap     | Live                                                              |
| IndexNow                 | Key file + ping script in repo, **awaiting deploy**               |
| Google Search Console    | Verified, sitemap accepted, indexing requested                    |
| Bing Webmaster Tools     | Verified, sitemap accepted, homepage _Discovered but not crawled_ |
| Facebook / WhatsApp      | Scraped, card renders correctly                                   |
| Cloudflare Web Analytics | Token committed in `9a978f9` but **no beacon on the live page**   |

---

## 2. In the repository

### Metadata and sharing — `src/components/BaseHead.astro`

Everything in `<head>` is generated there from `config/site.ts` and the locale
files. Nothing is hardcoded per page.

- **Open Graph** is the one that must be complete: WhatsApp, Messenger,
  Facebook, LinkedIn, Slack, Discord and Telegram all read it. X reads its own
  `twitter:` tags and falls back to Open Graph, so those only cover what differs.
- `og:image` is an **absolute URL**. Several scrapers, WhatsApp included, will
  not resolve a relative one and render a blank card.
- `og:image:width`/`height` are declared so a scraper can lay the card out
  before fetching the image. Without them the _first_ share of a link often
  shows no picture, because the crawler gave up waiting.
- Production emits `index, follow, max-image-preview:large, max-snippet:-1,
max-video-preview:-1`. Without `max-image-preview:large` Google shows a
  thumbnail rather than a full-width image.
- Preview deploys and the 404 emit `noindex, nofollow`.

### Structured data

One `@graph`, cross-referenced by `@id`:

| Node                | Why                                                                                       |
| ------------------- | ----------------------------------------------------------------------------------------- |
| `TelevisionStation` | A `LocalBusiness` subtype, so the address and phone are meaningful rather than decorative |
| `WebSite`           | Published by the organisation                                                             |
| `VideoObject` × N   | From the YouTube snapshot                                                                 |

Google reports this as **4 valid items** — _Empresas locales_, _Organización_
and 2 × _Vídeos_. `TelevisionStation` registers as the first two because it
inherits from both.

Videos are only emitted when they have a description: Google requires `name`,
`description`, `thumbnailUrl` and `uploadDate`, and an incomplete `VideoObject`
is worse than none.

### Share image — `pnpm --filter @qa-ulew/web brand:og`

1200×630, black wordmark on white, written to `public/og-default.png`.

The mark sits inside the middle ~62%. Platforms crop the card to different
ratios — X uses 2:1, WhatsApp shows a near-square thumbnail in some layouts —
and anything near the edge is the first thing lost.

PNG, not JPEG: the artwork is flat line work, where JPEG rings around the
strokes and saves nothing at this size.

### Icons — `pnpm --filter @qa-ulew/web brand:icons`

Favicon, Apple touch icon and PWA icons in `public/icons/`, plus
`public/favicon.ico`, from the wordmark's Q on an opaque white tile.

Only the Q, because the full wordmark is an unreadable smear at 32px. Opaque,
because a launcher's background is not ours to control and a transparent mark
vanishes against half of them. Maskable variants use a tighter 56% inset for
Android's circular crop.

**The search-result favicon.** Google renders the icon beside the result and
[recommends serving something larger than 48×48](https://developers.google.com/search/docs/appearance/favicon-in-search).
This site shipped a single 32px PNG and no `/favicon.ico` — that URL returned
404 — which is why Google showed the generic globe. The set is now 32, 48 and
96 px PNGs plus a real `.ico` at the root holding 16/32/48.

**Two marks, split at 48px.** The Q contains a church façade — dome, columns,
clock, "9 DE FEBRERO DE 1914" — drawn in strokes a few pixels wide. Below about
96px those average into grey mush; the 16px icon was illegible. So:

| Size          | Mark        | Where it is seen                  |
| ------------- | ----------- | --------------------------------- |
| 16, 32, 48 px | Q ring only | Browser tabs, bookmarks, Explorer |
| 96 px and up  | Full Q      | Google's result, app + PWA icons  |

A browser picks its tab icon by device pixels — 16 at 1×, 32 at 2×, 48 at 3× —
so a tab shows the clean Q on every screen, while search results and launchers
show the real logo. The mark never changes within one context.

The ring is **derived, not drawn**, in `prepare-icons.mjs`, because there is no
simplified mark in `assets/brand` and a hand-made one would drift from the logo.
It separates the two by stroke width, the one property that reliably tells them
apart: a morphological opening (erode then dilate by the same radius) deletes
everything thinner than the ring's ~14px brush and restores the rest. Two round
church details survive that and are dropped by area; the ring is then thickened
so it still resolves to solid black at 16px instead of pale grey.

Radii are fractions of the source width, so re-exporting the logo at a different
resolution does not silently change what survives. If the logo is ever redrawn,
re-run `brand:icons` and **look at the output** — the 16px tile is the one that
will show a mistake first.

The `.ico` is written by hand in `prepare-icons.mjs` rather than via a
converter dependency: since Vista the format may embed PNGs verbatim, so it is
a 6-byte header, a 16-byte directory entry per image, then the PNGs sharp has
already produced.

`/favicon.ico` matters beyond Google. Crawlers, feed readers and chat clients
request it blindly without reading the HTML, and treat a 404 as "no icon".

### robots.txt and sitemap

`robots.txt` is hand-written; the sitemap is generated by `@astrojs/sitemap`.

Preview deploys are excluded by the `noindex` meta tag, **not** from
robots.txt. That file controls crawling, not indexing: a blocked page can still
be listed if something links to it, and because the crawler may not read it, it
never sees the `noindex`.

### IndexNow — `pnpm --filter @qa-ulew/web seo:indexnow`

A sitemap is passive: it says "here are my URLs, come back whenever". IndexNow
is a push — "this URL changed, now" — and is the supported way to get Bing off
_Discovered but not crawled_ in hours rather than weeks. Bing, Yandex, Seznam
and Naver all consume it; submitting to `api.indexnow.org` fans out to all of
them, where pinging `bing.com` directly would reach only Bing.

The key in `config/site.ts` is **public by design**, not a secret. Ownership is
proved by serving the same value at `/<key>.txt`, so it is readable by
definition; its only job is to stop a stranger submitting URLs for this domain.

The script writes the key file before pinging, from the same constant the ping
uses, so the two cannot drift. **The key file must be deployed before a ping is
accepted** — a 403 means the live site is not yet serving it.

Not to be enabled at the same time as Cloudflare's **Crawler Hints** (Caching →
Configuration), which pings IndexNow with its own key. Either is fine; both is
two keys claiming the same domain for no benefit.

### Analytics — `config/site.ts` → `ANALYTICS.cloudflareToken`

Empty string emits no script at all.

The token is **not a secret**. It is a write-only beacon id that ships in the
HTML of every page, so it is public either way. It cannot read analytics data
and grants no account access — the same category as a Google Analytics
measurement id.

Installed manually rather than through Cloudflare's automatic injection.
Automatic injection rewrites HTML at a proxied _origin_, and Cloudflare Pages
is not one, so enabling it had no effect — verified by fetching the live page
and finding no beacon.

**Do not enable both.** Automatic injection plus the token would emit two
beacons and double-count every visit.

---

## 3. Configured outside the repository

These live in third-party dashboards. If the site is ever rebuilt from scratch,
these have to be redone.

### Google Search Console

- **Property type:** Domain (`qa-ulew.tv`) — covers `www`, every subdomain and
  both protocols under one verification. A URL-prefix property would need a
  separate entry for each.
- **Verification:** DNS `TXT` record on the apex, `google-site-verification=…`.
  **Do not delete it** — Google re-checks periodically and removing it
  un-verifies the property.
- **Sitemap:** submitted as the **full URL**,
  `https://qa-ulew.tv/sitemap-index.xml`. A Domain property rejects a relative
  path, because it cannot infer the protocol or subdomain.
- **Indexing:** requested for the homepage via URL Inspection.

### Bing Webmaster Tools

Imported from Search Console, which copies the property and verification but
**not** submitted sitemaps — those must be added separately, again as a full URL.

Covers Bing, DuckDuckGo, Yahoo and ChatGPT search, all of which use Bing's index.

### Cloudflare Web Analytics

Site added, RUM set to **"Enable with JS Snippet installation"**, token pasted
into `config/site.ts`.

---

## 4. Pending

### The live site is behind `main`

`9a978f9` added the analytics token and is pushed, but the deployed HTML has no
beacon:

```bash
curl -s https://qa-ulew.tv/ | grep -c beacon.min.js   # returns 0, expected 1
```

The commit is on `origin/main`, so this is a Cloudflare Pages problem, not a git
one — the build for that commit either failed or never ran. Check
**Workers & Pages → qa-ulew → Deployments** before assuming any of the fixes
below are live, because they all ship through the same build.

Note the beacon will not count your own visits if you use an ad blocker — most
block `cloudflareinsights.com`. That is the usual reason it looks broken when it
is not.

### Bing: get past _Discovered but not crawled_

Bing has seen the sitemap and the URL; it has chosen not to spend a crawl yet.
That is the normal state for a domain with no history and, critically, **no
inbound links** — Bing weights those far more heavily than Google does for a
first crawl.

In order of actual effect:

1. **Link to the site from the YouTube channel and the Facebook page.** Both are
   already-crawled properties that Bing trusts. This is the highest-value action
   and it is not a code change.
2. **IndexNow** (above), once the key file is deployed.
3. **Request indexing** again. Re-requesting daily does nothing — the URL is
   already queued and re-submitting does not raise its priority.

There is nothing to fix in the repository for this. The page is reachable,
returns 200 to Bingbot, is not blocked by `robots.txt` and carries no `noindex`
— all verified directly against the live site.

---

## 5. Not problems

Two things that look like errors and are not.

**`fb:app_id` missing**, in the Facebook Sharing Debugger. Meta labels it a
missing _required_ property, which overstates it: the tag attributes shares to a
registered Meta app so they appear in that app's Domain Insights, and has no
bearing on whether the card renders. Ours renders, which is the proof.

`SITE.facebookAppId` in `config/site.ts` emits the tag when set and omits it
when empty. To silence the warning properly:

1. [developers.facebook.com/apps](https://developers.facebook.com/apps) →
   **Create App** → use case **Other** → type **Business**.
2. Copy the numeric **App ID** from the dashboard.
3. Set `facebookAppId` to it, deploy, then **Scrape Again** in the debugger.

Do this only if the Insights are actually wanted. Never invent an id to quiet
the warning — it would attribute the channel's shares to whichever real app owns
that number.

**"Problemas no críticos"** on the Rich Results Test. Suggestions for optional
fields such as opening hours. Green check means valid; only red errors matter.

---

## 6. Recurring

### After any content change worth sharing

Re-scrape so the messengers drop their cached copy:

- [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) →
  **Scrape Again**. Covers Facebook, Messenger **and** WhatsApp — they share
  infrastructure.
- [LinkedIn Post Inspector](https://www.linkedin.com/post-inspector/) and the X
  Cards Validator if either matters.

These caches are long-lived. The first scrape after launch mattered because the
share image had been a 404 while the placeholder build was up.

### When new videos are published

```bash
pnpm --filter @qa-ulew/web content:youtube
```

Then commit `src/data/youtube-feed.json`.

Cloudflare rebuilds will **not** pick up new videos on their own. The build does
try the live feed first, but YouTube rate-limits it and answers **404** when it
throttles — indistinguishable from a deleted channel — so it falls back to the
committed snapshot. See [content.md](./content.md).

### If `qa-ulew.pages.dev` appears in search results

It serves the same site on a different domain, so it can compete with
`qa-ulew.tv`. Every page already declares a canonical URL on the apex, which
should consolidate them. If it does surface, add a Cloudflare Redirect Rule
sending `*.pages.dev` → `qa-ulew.tv`, the same shape as the `www` rule in
[deployment.md](./deployment.md) §4. Not worth doing pre-emptively.

---

## 7. Reversing any of it

| To undo             | Do this                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| Analytics           | Set `ANALYTICS.cloudflareToken` to `''`. No script is emitted.                                  |
| Structured data     | Remove the `ld+json` block in `BaseHead.astro`. Nothing else reads it.                          |
| Search Console      | Remove the property. Keep the DNS TXT record only if re-verifying later.                        |
| Bing                | Remove the site. Independent of Google.                                                         |
| Share image         | Delete `public/og-default.png` and clear `SITE.ogImage`. Cards fall back to no image.           |
| IndexNow            | Delete `public/<key>.txt` and the `seo:indexnow` script. Nothing else reads it.                 |
| `fb:app_id`         | Clear `SITE.facebookAppId`. The tag is not emitted.                                             |
| Indexing, site-wide | In `BaseHead.astro`, force `blockIndexing` to `true` — emits `noindex, nofollow` on every page. |
