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
