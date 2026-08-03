# Advertising

**Nothing ad-related is active.** `ADS.provider` is `'none'`, `<AdSlot>` renders
nothing, and no third-party script is loaded. This document records the plan and
the decisions so turning ads on later is a config change rather than a redesign.

## What already exists

`<AdSlot placement="..." />` is placed at three points on the landing page:
`header`, `in-feed` and `footer`. While ads are off it renders **nothing at
all** — no empty box, no reserved gap.

The important part is that the placements are decided now. The component
reserves its height via CSS custom properties when enabled, so switching ads on
does not push content around. Retrofitting ad slots into a finished layout is
the usual cause of a wrecked Cumulative Layout Shift score, and it is entirely
avoidable by deciding placement up front.

## Turning ads on

```ts
// config/site.ts
export const ADS = {
  provider: "adsense",
  adsenseClientId: "ca-pub-XXXXXXXXXXXXXXXX",
} as const;
```

`AdSlot` then renders the `<ins class="adsbygoogle">` element. You must **also**
add the AdSense loader script to `BaseHead.astro`, guarded by `adsEnabled()` —
it is intentionally not there yet, so that no third-party script can reach
visitors by accident.

## The two paths

### Google AdSense — the fast path

Works with the current static site. Requires an approved AdSense account, which
needs real published content and a privacy policy page (which does not exist
yet — see below).

Cost: a heavy third-party script, third-party cookies, and consent obligations.
Revenue per view is low unless traffic is substantial.

### Custom ads on Cloudflare Stream — the better path

Once video is served from Cloudflare Stream rather than embedded from YouTube,
the player is ours, and so is the ad inventory:

- pre-roll and mid-roll spots sold directly to local advertisers
- house promos for the channel's own content
- no third-party script, no cookie banner, no revenue share

This is worth more per impression than AdSense for a regional channel, and it is
the reason `VideoEmbed` was written with a `cloudflare-stream` provider from the
start. It requires Stream to be active and a decision on the player.

**Recommendation:** do not enable AdSense before the channel has meaningful
traffic. The layout is ready either way, and shipping a landing page covered in
low-yield display ads works against building the audience that would make ads
worth selling.

## Prerequisites before any ads go live

- [ ] A privacy policy page (`/privacidad`) — required by AdSense, and by
      several jurisdictions once third-party tracking is present.
- [ ] A cookie consent mechanism, if the provider sets cookies. Cloudflare Web
      Analytics is cookie-free and needs none; AdSense is not and does.
- [ ] `Content-Security-Policy` in `public/_headers` updated to allow the ad
      provider's domains — see [deployment.md](./deployment.md) §5.
- [ ] A check that ads do not appear on the 404 page.

## Analytics

`ANALYTICS.cloudflareToken` in `config/site.ts` wires up Cloudflare Web
Analytics: free, privacy-friendly, cookie-free, no consent banner required. No
script is emitted while the token is empty. This is the recommended default and
is independent of any ad decision.
