# Content: videos, embeds and social links

All channel data lives in `apps/web/src/config/site.ts`. No component hardcodes
a URL or an ID.

## Social links

```ts
export const SOCIAL_LINKS: SocialLink[] = [
  { id: "youtube", label: "YouTube", url: "https://youtube.com/@..." },
  { id: "facebook", label: "Facebook", url: "" }, // '' = hidden
];
```

An empty `url` means "not configured": the entry is filtered out and nothing is
rendered. The site never ships a dead link, and it looks intentional while the
accounts are still being confirmed.

Icons come from Simple Icons via `astro-icon` and are keyed off `id`. Adding a
platform means adding its name to the `simple-icons` list in `astro.config.ts`.

## Featured videos

```ts
export const FEATURED_VIDEOS: FeaturedVideo[] = [
  {
    provider: "youtube",
    id: "dQw4w9WgXcQ", // the 11-char video id, not the URL
    title: "Nombre del reportaje",
  },
  {
    provider: "facebook",
    id: "https://www.facebook.com/qaulew/videos/123456789/", // full permalink
    title: "Transmisión en vivo",
    poster: "/posters/transmision.jpg", // required for FB
  },
];
```

An empty array is valid — the section renders a "coming soon" message instead.

### What `id` means per provider

| Provider            | `id`                         | Poster                       |
| ------------------- | ---------------------------- | ---------------------------- |
| `youtube`           | the 11-character video id    | derived automatically        |
| `facebook`          | the full video permalink URL | **required** — no public API |
| `cloudflare-stream` | the video UID                | optional                     |

Facebook exposes no predictable thumbnail URL, so a poster image must be placed
in `public/` and referenced. Without one the embed still works but shows a plain
gradient.

## Keeping the lists current

The home page shows **two lists**, each its own section and landmark:

| Section           | List      | Source                                     | Details under each title |
| ----------------- | --------- | ------------------------------------------ | ------------------------ |
| _Lo más reciente_ | `recent`  | the uploads feed, live stream pinned first | when ("hace 3 horas")    |
| _Lo más visto_    | `popular` | YouTube's own popular playlists, by views  | views and when           |

Both come from the keyless Atom feed. No API key exists anywhere in the
pipeline, and none is needed for any of this.

### How many videos appear

Each list holds up to `YOUTUBE.limit` — **15**, which is the Atom feed's own
ceiling — and shows `YOUTUBE.initial` (**3**) of them. "Ver N videos más"
reveals `YOUTUBE.step` (**12**) more, which reaches all fifteen in one press;
"Ver todo en YouTube" beside it is the way to the rest of the channel. The
button only appears when there is something left to show.

Three is one row on a desktop (three columns); on a tablet (two columns) the
first tile spans both. In general, whatever would be left over on the last row
is promoted to the top — one tile full width, or two at half width — so a list
of thirteen or fourteen never ends with a stranded tile. See
[design.md](./design.md#video-lists).

The HTML carries **every** tile visible; `scripts/video-list.ts` collapses the
list on load. Without JavaScript a visitor simply gets all fifteen. Hidden
tiles cost nothing: their posters are `loading="lazy"` and `display: none`, so
they are never downloaded unless someone presses the button.

`FEATURED_VIDEOS` (pinned, curated, currently empty) still goes first in the
recent list, with duplicates removed by `mergeVideos`.

One wrinkle worth knowing: the limit is applied when a feed is **parsed**, and
videos judged `gone` are dropped **after** that. There is no backfill, so a list
can be one or two short of fifteen. That is deliberate — reaching further down a
feed to top up would mean probing videos nobody asked for.

### Most viewed, without an API key

Every channel has auto-generated playlists named by swapping the `UC` of its id
for a prefix, and two of them are its most viewed uploads, already sorted:

| Playlist | Holds                | For this channel                              |
| -------- | -------------------- | --------------------------------------------- |
| `UULP`   | popular videos       | **404** — it uploads almost only live streams |
| `UUPV`   | popular live streams | everything                                    |

Both are read through the same Atom feed, merged by `mergePopular` (a video in
both keeps its higher count) and cut to fifteen. A playlist that does not exist
404s exactly like a throttled one, so each is optional; only when **neither**
answers does the build fall back to the snapshot. The shorts equivalent
(`UUPS`) is left out on purpose — a vertical short cropped into a 16:9 tile
looks broken.

The view counts are the feed's `media:statistics`, so they are as current as
the last refresh — minutes old on a page with JavaScript.

### Live streams

**This was the bug where the page showed the previous video while the channel
was on air.** The Atom feed has no notion of "live", and it orders by
`published` — which for a stream is when the broadcast was _created_, not when
it went on air. Measured on a channel that was live: its stream sat sixth in its
own feed.

So the Pages Function also reads `youtube.com/channel/<id>/live`
(`fetchLive` in `lib/youtube-feed.ts`). When the channel is on air, that page's
player bootstrap carries `"videoDetails":{"videoId":…,"isLive":true}`; the stream
is then moved to the top of the recent list (or added, if the feed has not
caught up), flagged, and drawn with a red "En vivo" badge and "Transmitiendo
ahora" in place of its date. A stream that is only scheduled (`isUpcoming`) or
has ended is ignored.

The page is ~1.3 MB with the answer ~800 KB in, so it is **streamed and
abandoned** as soon as it can answer — after a few kilobytes when the channel is
not on air, because the canonical link at the top already says so.

Live state comes **only** from the Function, never from the build. A badge baked
into static HTML would still say "en vivo" days later to anyone whose refresh did
not land.

### Two fetches, not one

The feed videos are not curated. They come from the channel's public Atom feed,
and the site fetches it in **two places** — which is the answer to "why did a
deleted video stay on the page for two days".

| When            | Where                     | What it produces                     |
| --------------- | ------------------------- | ------------------------------------ |
| `astro build`   | `src/lib/youtube.ts`      | the lists baked into `index.html`    |
| Every page load | `functions/api/videos.ts` | JSON the page reconciles itself with |

**Build time** is what a visitor sees first, what a visitor with JavaScript off
sees, and what Google indexes. It is also frozen at the moment of the last
deploy, which was the whole bug: a podcast deleted on YouTube kept its tile, and
a live stream that started afterwards never appeared.

**Load time** fixes that. `src/scripts/video-feed.ts` asks `/api/videos` and
reconciles each list **tile by tile**: an unchanged video keeps its element, its
details line is patched only where a value moved (a view count that grew), only
a new or reshaped video is cloned from a template, and a tile is moved only if
the order changed. In the normal case — a current deploy — that is a few text
updates and nothing else. Build-time dates ("12 oct 2026", right for a visitor
without JavaScript) become relative ones ("hace 3 horas") on load.

The Function caches its answer for three minutes, and keeps the last good one
for a day so a throttled refresh serves minutes-old data rather than a 503; see
[deployment.md §13](./deployment.md#13-the-one-pages-function).

It cannot go via the browser directly: `youtube.com/feeds/videos.xml` sends no
`Access-Control-Allow-Origin` header, so the request is blocked before it is
made. That is the only reason a server-side route exists at all; see
[deployment.md §13](./deployment.md#13-the-one-pages-function).

### The snapshot is a third source

`src/data/youtube-feed.json` is a committed fallback for when the live feeds
are unavailable **at build time**. It holds both lists — `videos` (recent) and
`popular` — with their view counts. YouTube rate-limits the Atom feed and signals it
with **404**, indistinguishable from a deleted channel — and Cloudflare builds
from shared IPs, so they are throttled more often than a laptop is. Without the
snapshot, one unlucky build deploys an empty videos section.

Refresh it when the channel publishes something you want in the fallback:

```bash
pnpm --filter @qa-ulew/web content:youtube
```

It fails loudly, unlike the build-time fetch, because the point is to notice. A
list it cannot refresh keeps its previous contents rather than emptying. The
script imports the site's own parser and channel id (Node strips TypeScript
types natively), so it cannot disagree with the build about what a feed says.

### Videos that cannot be embedded

Neither the feed nor the snapshot says whether a video may be played in an
iframe, and getting it wrong is visible: YouTube renders its own grey error
panel inside our layout. There are two separate causes, and they are unrelated:

1. **The owner** turned off "Permitir insertar". Live streams started from some
   clients default to embedding off, so this is not rare.
2. **A rights holder** blocked embedded playback of content inside the video —
   _"Este video tiene contenido de LatinAutor - UMPG, quien bloqueó su
   reproducción en este sitio web o en esta aplicación."_

Both fetch paths therefore probe **the embed page itself**, which is the page
the iframe would load, and read `previewPlayabilityStatus` out of its bootstrap
JSON:

| Status           | Meaning                      | What the page does               |
| ---------------- | ---------------------------- | -------------------------------- |
| `OK`             | plays here                   | normal facade tile, plays inline |
| `UNPLAYABLE`     | blocked — either cause       | tile links to YouTube instead    |
| `ERROR`          | deleted, private, no Referer | dropped from the grid            |
| `LOGIN_REQUIRED` | private or age restricted    | dropped from the grid            |
| anything else    | the probe learned nothing    | treated as embeddable            |

**The `Referer` header is the whole mechanism.** The verdict is per embedding
site — that is what _"en este sitio web"_ means — so YouTube has to be told who
is asking, and `probeEmbeddable` takes the origin as an argument for that
reason. Without the header every video answers `ERROR` (player error 153),
including ones that play perfectly. A query parameter does not substitute for
it; this was tested. Verified working in both runtimes: Node at build time and
workerd via `wrangler pages dev`.

> **This replaced an oEmbed probe**, which asked `youtube.com/oembed` and read
> `401`/`403` as blocked and `404` as gone. oEmbed answers only the first of the
> two causes above: it returned `200` for six of the channel's fifteen videos
> that do not in fact play in an embed. It was also unstable — a video answered
> `401` in one run and `200` minutes later. The embed page agreed with the
> browser on every video tested, three runs running.

Three deliberate biases, all in `lib/youtube-feed.ts`, and all pushing the same
way: **when in doubt, leave the tile alone.**

- **A failed or unparseable probe means "embeddable".** Guessing "no" would stop
  working videos from playing inline; guessing "yes" costs nothing we did not
  already have. An unrecognised status counts as unparseable — YouTube is free
  to add one, and inventing a meaning for it is how a working video silently
  stops playing.
- **A bad verdict is re-checked before it counts.** `blocked` and `gone` each
  need two agreeing probes, and a disagreement resolves to `embeddable`. The
  embed page is steadier than oEmbed was, but steadier is not proven, and only
  the unhappy path pays the extra request.
- **A unanimous `ERROR` is ignored entirely.** Two things produce it: rate
  limiting, and a `Referer` that did not survive the runtime. Believing either
  would empty the section — the exact failure the snapshot exists to prevent.
  This is what makes a stripped header degrade to "no probing at all" rather
  than to a blank page.

Get this wrong in the safe direction and a visitor sees YouTube's error panel,
which is what happened before any of this existed. Get it wrong in the unsafe
direction and a working video silently stops playing, or disappears. The two are
not equally bad, and the code is not neutral between them.

To make a video play inline again, turn embedding back on in YouTube Studio —
the video's **Detalles → Mostrar más → Permitir insertar**, or for a live
stream, **Sala de control → Editar → Personalización**. Nothing in this
repository can override it.

### The safety net, for when the probe is wrong anyway

The probe runs on a server, and a server is not the visitor. Two gaps remain
that no amount of probing closes:

- **Region.** A rights-holder block can differ by country. The build probes from
  wherever Cloudflare built, the Function from the edge nearest the visitor —
  neither is guaranteed to match the visitor's own answer.
- **Time.** A tile rendered at build time is up to five minutes stale even with
  the Function refreshing it, and a claim can be applied at any moment.

So the player gets the last word too. `scripts/video-facade.ts` loads the embed
with `enablejsapi=1` and listens for the `onError` frame YouTube posts when it
cannot play — no YouTube script, just the documented widget handshake. On error
the tile is rebuilt from the `link` `<template>`, so it becomes exactly the tile
the probe would have produced, and focus moves to the link that replaced the
play button the visitor just pressed.

The error code is not inspected. `101`/`150` mean "not allowed in an embed",
`100` "gone", `5` a player fault, `2` a bad parameter — and to someone looking
at a tile that will not play they are one situation, with one right answer.

This costs a click, so it is the fallback and not the mechanism: the probe is
what makes the tile right _before_ anyone clicks. Expect this path to fire
rarely. If it starts firing often, the probe is being lied to — check that the
`Referer` still reaches YouTube.

## How embedding works — and why

`<VideoEmbed>` uses the **facade pattern**. On page load it renders only a
poster image and a play button. The real `<iframe>` is injected on click.

This matters:

- A stock YouTube embed pulls roughly **1 MB of third-party JavaScript per
  video**, before the visitor has decided to watch anything. Three embeds on a
  landing page will visibly hurt load time on a mobile connection.
- No third-party cookie is set until the visitor actively starts playback,
  which keeps the site out of consent-banner territory.
- YouTube is loaded from `youtube-nocookie.com`.

The tradeoff is one extra click to start a video. On a landing page that is the
right trade.

## Migrating to Cloudflare Stream later

`VideoEmbed` already supports `provider: 'cloudflare-stream'`. When the account
has Stream:

1. Set `STREAM.customerCode` in `config/site.ts` (the value in your Stream embed
   URLs: `https://customer-<code>.cloudflarestream.com/...`).
2. Change a video's `provider` to `'cloudflare-stream'` and its `id` to the
   video UID.

That is the entire migration for a given video — a data change, not a code
change. Until `customerCode` is set, Stream entries render nothing rather than a
broken iframe, so a half-finished migration cannot ship a broken page.

Self-hosting on Stream is what makes **custom pre-roll ads** possible; see
[ads.md](./ads.md).

## When a second language arrives

`FEATURED_VIDEOS` has a single `title` string because the site is Spanish-only.
At that point, move the list to an Astro content collection:

```
src/content/videos/
  es/reportaje-uno.md
  en/reportaje-uno.md
```

and query it with `getCollection('videos')` filtered by locale. Doing it now
would be premature — one language does not need a content layer.
