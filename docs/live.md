# Live: a 24/7 live-only channel on the landing page

> **Status: planned, not built.** Nothing in this repository implements it yet.
> This document exists so the work can be picked up later without redoing the
> research. Read [§ Decisions already made](#decisions-already-made) before
> changing the approach — most of the obvious alternatives were evaluated and
> rejected for reasons that have not changed.

## Goal

Carry **the channel itself, 24/7** on qa-ulew.tv — the same program that goes out
on the analog cable.

**Live only.** No VOD, no DVR, no "back ten seconds", nothing retained. The
YouTube channel is already the video archive and stays that way. This is a cable
TV channel that happens to arrive over HTTP.

Social media (YouTube, Facebook, Instagram, TikTok) is separate and occasional —
interviews and events, streamed from vMix directly, as today. **Out of scope,
and it should stay out**; entangling the two is how the 24/7 feed ends up
competing with event streams for the same uplink.

## Architecture

```
                  ┌─→ SDI ──→ cable provider                    (unchanged)
vMix program out ─┤
                  └─→ RTMP ──→ origin ──→ R2 ──→ qa-ulew.tv
                      1 push     MediaMTX   free egress   <video> + HLS
                      24/7       (a VPS)    global edge
```

One push leaves the origination site. Everything after that fans out on
infrastructure that scales without touching the encoder — which is the entire
point of the design.

**The origin never talks to a viewer.** It uploads one copy of the stream to R2
and stops there, so audience size cannot affect the encoder, the origination
site's connection, or the size of the box.

## Decisions already made

Do not re-open these without new information. Each was measured or read from
vendor documentation, not assumed.

| Decision                             | Why                                                                                                                                                                                                                                                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Not Cloudflare Stream**            | It has no live-only mode. Its docs: recording `off` means the input is _"not recorded **or available for playback**"_. Recording is what makes it watchable, so a 24/7 input generates 43,200 recorded minutes/month we do not want, at $5/1,000 min, accumulating. `deleteRecordingAfterDays` has a 30-day floor. |
| **Not Cloudflare Realtime / WebRTC** | Live-only and cheap, but _"WHIP and WHEP must be used together — we do not yet support streaming using RTMP/SRT and playing using WHEP."_ vMix cannot push WHIP. Also beta, with pricing moving to per-minute at GA.                                                                                               |
| **Not Mux, not Livepeer**            | Both bill live **encoding per minute**. A 24/7 channel is 43,200 minutes every month: ~$1,080/mo and ~$237/mo respectively, before any viewer. This is the trap in most "video API" pricing — it is built for events.                                                                                              |
| **Not a CDN in front of the origin** | Cloudflare's terms still restrict serving video from an origin **outside** Cloudflare through their CDN. R2 is a Cloudflare service, so it is explicitly permitted. A third-party CDN (Bunny) is a valid alternative if R2 is ever unsuitable.                                                                     |
| **A VPS is unavoidable**             | Something must hold a long-lived TCP connection and turn a video stream into files. R2 is HTTP object storage and cannot accept RTMP. Workers speak HTTP; RTMP is raw TCP. No Cloudflare product does this.                                                                                                        |
| **HLS, not WebRTC or LL-HLS**        | A TV channel does not need sub-second latency. HLS is the most compatible and the least operationally exciting. Low latency can be added later; it is not a requirement.                                                                                                                                           |

### Reconsider if…

- **Bunny Stream Live** leaves preview at their usual per-GB rate. It opened a
  closed preview in August 2026 with RTMP ingest and stated vMix compatibility.
  If it prices like their CDN, it is a strong managed option and removes the VPS
  entirely.
- **Nobody is available to operate a server.** Then the answer is a managed
  24/7 playout provider (Castr and similar sit around $20/month). The gap
  between that and ~$6 buys away the on-call burden, which is the real cost of
  self-hosting. Choosing it is a legitimate decision, not a failure.

## How it works

### vMix side — nothing special

vMix has a built-in **Custom RTMP Server** destination: a URL and a stream key,
exactly as it already does for YouTube and Facebook. It does not know the other
end is ours. **No plugin, no integration to build.**

Settings that matter:

| Setting             | Value            | Why                                                       |
| ------------------- | ---------------- | --------------------------------------------------------- |
| Video / audio       | H.264 / AAC      | passed through; anything else forces transcoding          |
| Rate control        | CBR              | steady bitrate is what a long-lived link wants            |
| Keyframe interval   | 2 s              | bounds segment duration and start-up delay                |
| Bitrate             | ~1.5 Mbps (720p) | chosen for the **uplink**, not for the bill               |
| Automatic reconnect | **on**           | over months the link will drop; it must return unattended |

### Origin side — RTMP in, HLS out, nothing kept

[MediaMTX](https://github.com/bluenviron/mediamtx) is a single static binary
that ingests RTMP/SRT and serves HLS. **It records nothing by default**, which
is the requirement rather than a setting someone must remember.

The stream is **passed through, not re-encoded**, so this is a relay, not a
transcoder, and needs very little CPU.

Shape of the config — values are placeholders, real ones are not committed:

```yml
# mediamtx.yml — illustrative
hlsVariant: mpegts
hlsSegmentDuration: 6s
hlsSegmentCount: 5 # ~30 s window; nothing older exists
paths:
  <PATH_NAME>:
    source: publisher
```

### What HLS actually is

Two kinds of file, and understanding this is what makes the rest obvious:

| File          | What it is                                    | Changes                      |
| ------------- | --------------------------------------------- | ---------------------------- |
| `stream.m3u8` | text playlist naming the most recent segments | **every ~6 seconds**         |
| `seg-NNNN.ts` | ~6 s of video, ~1.1 MB at 1.5 Mbps            | written once, never modified |

For live, the playlist is a **sliding window** listing roughly five segments —
about thirty seconds. **There is no index of everything that ever aired.** That
is what makes this live-only _by construction_ rather than by configuration, and
it is why no "delete the recordings" job is needed.

The player fetches the playlist every few seconds, sees the newest segment, and
downloads it. That is the whole protocol.

### Cleanup — free, by design

As a segment falls out of the window it is deleted from R2.

> **`DeleteObject` is free in R2**, listed among Cloudflare's free operations
> alongside `DeleteBucket` and `AbortMultipartUpload`.

So cleanup costs nothing, needs no lifecycle rules, and can be eager.
Steady-state storage is **20–30 MB** against a 10 GB free tier. Nothing
accumulates.

## Cost

| Meter                        | Rate                     | 24/7 usage           |
| ---------------------------- | ------------------------ | -------------------- |
| VPS                          | ~$6/mo flat              | fixed                |
| R2 **Class A** (`PutObject`) | $4.50/M, **1 M free**    | ~864 k/mo → **free** |
| R2 **Class B** (`GetObject`) | $0.36/M, **10 M free**   | scales with watching |
| R2 storage                   | $0.015/GB-mo, 10 GB free | ~25 MB → **free**    |
| R2 **egress**                | **$0**                   | any audience         |
| `DeleteObject`               | **free**                 | —                    |

**Writes:** 6-second segments = 600 segments + 600 playlist rewrites per hour =
**864,000 writes/month against a 1,000,000 free tier**. The stream itself runs
for free.

**Reads:** ~1,200 `GetObject` per viewer-hour. The 10,000,000 free tier is
therefore ≈ **8,300 viewer-hours per month** before a cent.

| Audience                     | Viewer-hours/mo |  R2 | VPS | **Total** |
| ---------------------------- | --------------: | --: | --: | --------: |
| **Nobody watching**          |               0 |  $0 |  $6 |    **$6** |
| Quiet — 500 sessions × 8 min |              67 |  $0 |  $6 |    **$6** |
| Realistic — 3,000 × 8 min    |             400 |  $0 |  $6 |    **$6** |
| Busy — 10,000 × 8 min        |           1,333 |  $0 |  $6 |    **$6** |
| ~11 watching 24/7            |           8,300 |  $0 |  $6 |    **$6** |
| ~28 watching 24/7            |          20,000 |  $5 |  $6 |   **$11** |
| ~70 watching 24/7            |          50,000 | $18 |  $6 |   **$24** |
| ~140 watching 24/7           |         100,000 | $40 |  $6 |   **$46** |

**Flat at ~$6/month until the channel is genuinely popular**, then roughly
**$0.36 per 833 viewer-hours**. No per-minute meter, no bandwidth bill, no cliff.

Caveats, stated rather than buried:

- The read counts assume **no edge caching**. Segments are immutable and should
  cache well behind a custom domain, but Cloudflare does not clearly document
  whether an R2 cache hit still bills a Class B operation. **The table is the
  pessimistic case.**
- The origin uploads ~486 GB/month to R2 regardless of audience — inside any
  VPS allowance, and it **does not grow with viewers**.
- All figures are from vendor pricing pages at the time of writing. **Re-check
  before committing money**; this is exactly the kind of thing that changes.

## Implementation plan

### Phase 0 — verify before spending anything

1. **Sustained upload capacity at the origination site**, measured at the worst
   hour of the day, not a burst test. 24/7 at 1.5 Mbps needs roughly 2 Mbps that
   never stops. **This is the single most likely reason the project fails**, it
   cannot be fixed in software, and it should be measured before anything is
   bought.
2. **Check whether the cable headend has a business connection.** Originating
   the web feed there instead removes the hardest constraint. Worth asking
   before designing around a consumer link.
3. **Decide how the signal is duplicated:**

   |                                     | Extra vMix load          | One-time  |
   | ----------------------------------- | ------------------------ | --------- |
   | Another vMix streaming destination  | one more encode + upload | $0        |
   | Hardware split → standalone encoder | **none**                 | ~$100–250 |

   A second vMix destination is free and simplest. A hardware split (SDI
   distribution amplifier into a small H.264 encoder) costs money but adds no
   load to vMix **and keeps the 24/7 feed alive across vMix restarts** — worth
   real consideration for a channel that is meant never to stop.

**Abort criteria:** if step 1 cannot deliver a stable ~2 Mbps up, stop. Every
option in this document assumes it, including the managed ones.

### Phase 1 — origin only, no R2, no site changes

4. Smallest available VPS. **Region matters more than specs** — choose for
   network path to Guatemala, not for CPU.
5. Install MediaMTX; RTMP in, HLS out, recording off (default).
6. TLS on the HLS endpoint — the landing page is HTTPS and browsers refuse mixed
   content.
7. Restrict ingest: a stream key always; source IP restriction as well if the
   origination site has a static address.
8. Point vMix at it and **let it run for a full day before going further.** A
   24/7 stream fails differently from a two-hour broadcast: it finds every brief
   dropout the link has. Watch it in VLC, not in a browser, to keep the variables
   down.

This phase is independently useful — the channel is watchable by anyone with the
URL, with nothing else built.

### Phase 2 — R2 in front

9. Create the bucket, attach a custom domain, confirm public reads.
10. Upload each segment and the rewritten playlist as they are produced; delete
    segments as they fall out of the window.
11. Point the player at the R2 domain and stop serving HLS from the origin.

**R2 is deliberately a separate phase.** It changes where files are served from
and nothing else, so it can be deferred without redesigning anything — and
skipping it is a legitimate way to get on air sooner.

### Phase 3 — the landing page

12. **A new provider branch in `<VideoEmbed>`.** It currently handles YouTube,
    Facebook and Cloudflare Stream, none of which is a plain HLS URL.
13. **An HLS player module.** Safari and iOS play HLS natively via `<video>`;
    everything else needs a JavaScript library. **This is the only new
    client-side JavaScript the feature requires**, and the whole site currently
    ships ~12 KB — so it must be weighed against the
    [JavaScript budget](./architecture.md#javascript-budget) _before_ it is
    written. Load it only on click, never on page load.
14. **Keep the facade.** Poster, click to load — the pattern the video grid
    already uses. On a 24/7 channel this is also what stops the page streaming
    video to everyone who merely scrolled past.
15. **Hide the section when the channel is off air.** MediaMTX's API reports
    whether a path is currently publishing. Mirror `/api/videos`: a Pages
    Function at `/api/live`, edge-cached 15–30 s (not five minutes — "live" has
    to be timely), with the same contract that any failure leaves the page
    exactly as rendered. A dead player is worse than no player.
16. **Copy in `i18n/locales/es.ts`** under `live.*`, accessibility strings under
    `a11y.live.*`. No hardcoded strings, including the `aria-label`.

## Where the code goes

**This repository.** It is already a monorepo and the live channel is the same
product, not a different one.

```
apps/web/            landing page (unchanged) + the live player
apps/live-origin/    MediaMTX config, the R2 uploader, deploy notes
functions/api/live   the on-air check the page calls
```

Three traps, because the deploy targets differ:

1. **Pages builds this repository.** The root script is
   `pnpm -r --stream build`, so a new workspace package **must not** have a real
   `build` script, or Pages runs it on every deploy.
2. **`dist/` must stay flat and public.** Origin config and scripts must never
   reach the published output.
3. **`functions/` at the root is compiled by Pages.** Only the on-air check
   belongs there; the uploader runs on the VPS, not at the edge.

The VPS is deployed by hand or by a small script — **not** by Pages. That is the
one genuinely new operational surface this project would gain, and it is the
thing to be honest about when deciding between self-hosted and managed.

### Secrets

Nothing here belongs in the repository. The stream key, the R2 credentials and
the origin hostname are configuration, not code. `.dev.vars` is already
gitignored and `.dev.vars.example` documents the pattern — follow it. **This
repository is public.**

## Open questions

Unresolved at the time of writing. Each needs a real measurement, not a guess.

- **Does the origination site sustain ~2 Mbps up, continuously, for weeks?** The
  one that decides whether any of this happens.
- **Who operates it?** The honest cost of self-hosting is not the $6/month. If
  the answer is "nobody", choose a managed provider and skip Phases 1–2.
- **Do R2 cache hits bill as Class B operations?** Only affects the large end of
  the cost table.
- **Which VPS region actually performs best to Sololá?** Test rather than assume.
- **Has Bunny Stream Live reached general availability, and at what price?** It
  could remove the VPS entirely.

## What this does not change

- **The analog cable feed** leaves vMix over SDI and never touches the internet.
- **Social media streaming** continues from vMix directly.
- **The videos grid**, which is driven by the YouTube Atom feed — see
  [content.md](./content.md#keeping-the-grid-current). YouTube remains the
  archive; this feature adds no VOD of any kind.
