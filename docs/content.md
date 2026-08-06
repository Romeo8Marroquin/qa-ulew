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

## Keeping the grid current

The feed videos are not curated. They come from the channel's public Atom feed,
and the site fetches it in **two places** — which is the answer to "why did a
deleted video stay on the page for two days".

| When            | Where                     | What it produces                     |
| --------------- | ------------------------- | ------------------------------------ |
| `astro build`   | `src/lib/youtube.ts`      | the grid baked into `index.html`     |
| Every page load | `functions/api/videos.ts` | JSON the page reconciles itself with |

**Build time** is what a visitor sees first, what a visitor with JavaScript off
sees, and what Google indexes. It is also frozen at the moment of the last
deploy, which was the whole bug: a podcast deleted on YouTube kept its tile, and
a live stream that started afterwards never appeared.

**Load time** fixes that. `src/scripts/video-feed.ts` asks `/api/videos`,
compares the answer to what is already rendered, and rebuilds the grid only if
they differ. In the normal case — a current deploy — it compares, finds no
change, and touches nothing.

It cannot go via the browser directly: `youtube.com/feeds/videos.xml` sends no
`Access-Control-Allow-Origin` header, so the request is blocked before it is
made. That is the only reason a server-side route exists at all; see
[deployment.md §13](./deployment.md#13-the-one-pages-function).

### The snapshot is a third source

`src/data/youtube-feed.json` is a committed fallback for when the live feed is
unavailable **at build time**. YouTube rate-limits the Atom feed and signals it
with **404**, indistinguishable from a deleted channel — and Cloudflare builds
from shared IPs, so they are throttled more often than a laptop is. Without the
snapshot, one unlucky build deploys an empty videos section.

Refresh it when the channel publishes something you want in the fallback:

```bash
pnpm --filter @qa-ulew/web content:youtube
```

It fails loudly, unlike the build-time fetch, because the point is to notice.

### Videos that cannot be embedded

Neither the feed nor the snapshot says whether a video may be played in an
iframe, and getting it wrong is visible: YouTube renders its own grey _"El
propietario del video inhabilitó la reproducción en otros sitios web"_ panel
inside our layout. Live streams started from some clients default to embedding
**off**, so this is not rare.

Both fetch paths therefore probe YouTube's oEmbed endpoint per video:

| Response      | Meaning                   | What the page does               |
| ------------- | ------------------------- | -------------------------------- |
| `200`         | embeddable                | normal facade tile, plays inline |
| `401` / `403` | owner disabled embedding  | tile links to YouTube instead    |
| `404`         | deleted, private or gone  | dropped from the grid            |
| anything else | the probe learned nothing | treated as embeddable            |

Three deliberate biases, all in `lib/youtube-feed.ts`, and all pushing the same
way: **when in doubt, leave the tile alone.**

- **A failed probe means "embeddable".** Guessing "no" would stop working videos
  from playing inline; guessing "yes" costs nothing we did not already have.
- **A bad verdict is re-checked before it counts.** Both of the channel's videos
  answered `401` and then `200` an hour later, from the same machine, with
  nothing changed in between. So `blocked` and `gone` each need two agreeing
  probes, and a disagreement resolves to `embeddable`. Only the unhappy path
  pays the extra request.
- **A unanimous `404` is ignored entirely.** Rate limiting answers 404 across
  the board, so believing it would empty the section — the exact failure the
  snapshot exists to prevent. A channel losing every video at once is not worth
  optimising for; being throttled demonstrably is.

Get this wrong in the safe direction and a visitor sees YouTube's error panel,
which is what happened before any of this existed. Get it wrong in the unsafe
direction and a working video silently stops playing, or disappears. The two are
not equally bad, and the code is not neutral between them.

To make a video play inline again, turn embedding back on in YouTube Studio —
the video's **Detalles → Mostrar más → Permitir insertar**, or for a live
stream, **Sala de control → Editar → Personalización**. Nothing in this
repository can override it.

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
