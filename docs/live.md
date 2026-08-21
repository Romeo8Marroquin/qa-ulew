# Live: putting the 24/7 channel on the landing page

**Status: researched, not built.** `STREAM.customerCode` in `config/site.ts` is
still empty and `<VideoEmbed>` renders nothing for `provider:
'cloudflare-stream'` until it is set. This is the plan and the arithmetic behind
it.

## The requirement

The landing page should carry the **channel itself, 24/7**, the same signal that
goes out on the analog cable. Not events — the channel.

Social media (YouTube, Facebook, Instagram, TikTok) is a **separate, occasional**
thing: interviews and notable events, streamed from vMix as it is today. Those
are not part of this and should not be entangled with it.

So the shape is: **duplicate the program output**, one copy to the cable
provider, one copy to whatever serves the website.

```
                    ┌─→ SDI/analog ──→ cable provider      (unchanged)
vMix program out ───┤
                    └─→ ~1.5 Mbps ───→ web origin ──→ CDN ──→ qa-ulew.tv
                        24/7                                   (24/7)
```

## The one number that decides everything

**Average concurrent viewers (ACV)** on the website — not total visits, not peak.
The average number of people with the player actually running, across the month.

A 24/7 month is **43,200 minutes**. One viewer watching the whole month is
43,200 viewer-minutes; ten viewers is 432,000. Every option below is priced off
that number, and **nobody knows it yet**. Measuring it is step one.

## Cloudflare Stream is the wrong tool here — this is a correction

I previously costed Cloudflare Stream for _event_ streaming and recommended it.
For a **24/7** channel that recommendation is wrong, and the reason is a billing
detail that only bites at 24/7:

> Stream bills **$1 per 1,000 minutes delivered**, counted **per viewer**, and
> the price does **not** depend on bitrate or resolution.

At 24/7 that means **≈ $43 per month for every one average concurrent viewer**,
forever, and there is no lever to pull. You cannot drop to 480p to save money —
a 480p viewer-minute and a 1080p viewer-minute cost exactly the same. The one
thing you can control (quality) is free, and the one thing you cannot (whether
someone is watching) is the entire bill.

Storage is fixable — set `recording: { mode: "off" }` on the live input and
recordings stop being generated, so a 24/7 stream costs nothing to store. But
delivery is the problem, and it has no off switch.

Stream is priced for VOD and for events that start and stop. It is genuinely
excellent at that. A channel that never stops is the case it is worst at.

## The options, with the actual arithmetic

Bandwidth per average concurrent viewer per month, at bitrate _B_ Mbps:
**_B_ × 324 GB**. So 1.5 Mbps ≈ 486 GB per ACV per month.

| Option                     | ACV 1 | ACV 5 | ACV 20 | Bitrate a cost lever? | Ops        |
| -------------------------- | ----- | ----- | ------ | --------------------- | ---------- |
| **YouTube 24/7, embedded** | $0    | $0    | $0     | n/a                   | none       |
| **VPS origin only**        | ~$6   | ~$6   | ~$16   | **yes**               | you own it |
| **VPS origin + Bunny CDN** | ~$11  | ~$29  | ~$102  | **yes**               | you own it |
| **Cloudflare Stream**      | ~$48  | ~$221 | ~$869  | **no**                | none       |

Assumptions: 1.5 Mbps; Hetzner-class VPS ≈ $6/mo with included traffic and
~$1/TB beyond; Bunny CDN at the **$0.01/GB** Europe/North-America rate; Stream
at $1/1,000 viewer-minutes plus its $5 minimum, recording off.

Two things to notice. **Cloudflare Stream is an order of magnitude more
expensive than anything else at this duty cycle.** And **the gap widens as the
audience grows**, because it is the only option where quality cannot be traded
for cost.

### Where each one actually hurts

- **YouTube 24/7** is free and infinitely scalable, and we already know its
  weakness first-hand: this channel's videos get **embed-blocked**, both by the
  owner setting and by rights holders — a LatinAutor claim blocked one outright
  (see [content.md](./content.md#videos-that-cannot-be-embedded)). A 24/7
  channel carrying marimba and live music is a standing invitation for content
  claims, and a claim can kill the **embed** while the stream still plays on
  youtube.com. The landing page would break without warning, and we would find
  out from a viewer. It is free, and it is the least reliable.
- **VPS origin** is by far the cheapest controllable option, and the bill barely
  moves with audience. The cost is **operational**: a 24/7 channel means a box
  that must not go down, monitoring, and someone to fix it at 23:00 during the
  feria. That someone is you.
- **VPS + CDN** is the same thing with the traffic spike absorbed by Bunny.
  Worth adding **when** the audience justifies it, not before.
- **Cloudflare Stream** is the only zero-ops option. You are paying roughly
  $40/month per concurrent viewer for never touching a server.

## Recommendation

**Start on YouTube, measure, then move.**

Not because YouTube is the right long-term home — the embed risk is real and we
have proof — but because it is the only option that answers the question that
governs every other decision, and it answers it for free. Two or three weeks of
a 24/7 YouTube stream embedded on the page tells you the ACV. Then you buy the
right thing instead of guessing.

If the embed breaks during that window, that is not a wasted experiment. That is
the answer to "can we rely on YouTube", delivered early and cheaply.

Then, at the numbers this channel is realistically likely to see (single-digit
to low-double-digit ACV): **a small VPS origin, adding a CDN only if it starts
to hurt.**

## Step by step

### Phase 0 — measure and check, spend nothing

1. **Uplink at the house, sustained.** Not a burst speed test — a sustained one,
   at the hour the connection is worst. A 24/7 stream at 1.5 Mbps needs ~2 Mbps
   of reliable upload **that never stops**. This is the single most likely thing
   to sink the whole project, and it is a property of the house.
2. **Is there anything at the cable headend with better connectivity?** If the
   provider's facility has business internet, originating the web feed from
   there instead of the house removes the hardest constraint. Worth one phone
   call before designing around a residential line.
3. **Decide how the signal gets duplicated** — see below.
4. **Pick the bitrate.** A cable-quality channel does not need 1080p60. 720p at
   1.5 Mbps is honest for this content and roughly halves every bandwidth number
   in this document. On everything except Cloudflare Stream, that is a direct
   50% saving.

### Phase 1 — duplicate the signal

Two ways, and the difference is what happens to vMix:

|                                         | Extra vMix load          | One-time cost | Note                                                                           |
| --------------------------------------- | ------------------------ | ------------- | ------------------------------------------------------------------------------ |
| **Another vMix streaming destination**  | One more encode + upload | $0            | Simplest. vMix already does this for social.                                   |
| **Hardware split → standalone encoder** | **None**                 | ~$100–250     | SDI/HDMI distribution amp + a small H.264 streaming encoder. vMix never knows. |

If vMix is comfortable and the machine is not near its limit, use another
destination — it is free and there is nothing to buy. If the machine is already
working hard, or if you want the 24/7 web feed to be **independent of vMix
restarts**, the hardware split is the more robust answer and it is genuinely
"duplicating the signal" rather than asking vMix for more.

Either way the uplink cost is the same. The bits have to leave the house once.

### Phase 2 — the free measurement

5. Start a **24/7 YouTube live stream** from that second output.
6. Put it on the landing page behind the **existing facade** — poster image,
   click to load. See the cost-control section below; this is not optional.
7. Watch YouTube Analytics for two to three weeks. Record **average concurrent
   viewers**, and whether the embed ever breaks.

### Phase 3 — move it, if the numbers say so

8. Stand up an origin. Single-bitrate **passthrough** — take RTMP in, repackage
   to HLS out, no transcoding — so a very small VPS is enough. Purpose-built
   options exist for exactly this; no custom code is needed.
9. Point the second vMix destination (or the hardware encoder) at it.
10. Put a CDN in front **only when** the traffic bill starts to exceed the
    CDN's minimum.
11. On the site: the player is already written. `<VideoEmbed>` builds
    Cloudflare's iframe URL, and a generic HLS source would need a small player
    module instead — that is the one piece of new client code this needs, and it
    should be weighed against the [JavaScript budget](./architecture.md#javascript-budget).

## Cost controls that matter more than the provider choice

These apply to every option and are worth more than any negotiation:

- **Never autoplay.** The facade pattern the video grid already uses is the
  single biggest cost control available. Cloudflare states explicitly that
  _"client-side preloading and buffering is counted as billable delivery"_ — an
  autoplaying 24/7 player bills for every visitor who scrolled past, including
  the ones who left the tab open in the background. Click-to-play means you pay
  only for people who chose to watch.
- **Bitrate is a 2× lever on everything except Stream.** 720p/1.5 Mbps versus
  1080p/3 Mbps is half the bill, on content where most viewers will not notice.
- **`recording: { mode: "off" }`** if Cloudflare Stream is ever used for the
  24/7 input, or storage accrues 43,200 minutes a month forever.
- **No spend cap exists** on any usage-based option here. Set a calendar
  reminder to look at the bill after the first week, not the first month.

## Open questions — verify, do not assume

- **What is the ACV?** Everything above is parameterised on a number nobody has.
  This is why Phase 2 exists.
- **Does the house uplink hold 1.5–2 Mbps up, continuously, for weeks?** A 24/7
  stream fails differently from a two-hour broadcast: it finds every brief
  outage the connection has.
- **Which Bunny region does Guatemala bill at?** Their published tiers are
  Europe/North America $0.01/GB and South America $0.045/GB, and Central America
  is not listed. That is a **4.5× swing** in the CDN column above — confirm it
  with Bunny before committing to that path.
- **Who is on call?** The honest cost of the VPS option is not the $6. A channel
  that is meant to be on 24/7 is a support commitment, and it should be an
  explicit decision rather than a consequence.

## What this does not change

- **The analog cable feed.** It leaves vMix over SDI and never touches the
  internet.
- **Social media streaming.** Interviews and events keep going out of vMix
  directly to YouTube and Facebook, exactly as today. Nothing here consolidates
  them, and nothing here should.
- **The videos grid.** It stays driven by the YouTube Atom feed and is unrelated
  to the live channel.
