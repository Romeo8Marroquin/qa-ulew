# Design system

## The identity

Derived from the channel's own assets: a hand-lettered wordmark and black-and-
white documentary photography of the Guatemalan highlands.

| Element  | What it is                                                                                 |
| -------- | ------------------------------------------------------------------------------------------ |
| Wordmark | Custom hand lettering. The Q encloses a domed church, a volcano and "9 de febrero de 1914" |
| Tagline  | "Conectando con nuestra cultura"                                                           |
| Palette  | **Strictly monochrome** — no brand colour at all                                           |
| Imagery  | Black-and-white landscape photography                                                      |
| Motifs   | Maya-inspired diamonds between letters, a wheat pattern on the W                           |

The monochrome palette is a **deliberate strength, not a gap**. It is what makes
the identity distinctive and it lets the photography carry the emotion. Do not
introduce a colour accent without a real reason — it would fight both the logo
and the imagery.

The neutrals are very slightly **warm** (a trace of red/yellow rather than pure
grey). Against black-and-white photography this reads as paper and film rather
than as screen chrome, and it stops large light surfaces feeling clinical.

## Typography

The logo is custom lettering, not a typeface — stroke weights vary per letter
and the baseline wobbles. Nothing will match it, and a hand-drawn lookalike
(Amatic SC, Caveat) would read as a cheap imitation. So the logo is used **as an
image**, paired with a type system that shares its warmth without copying it.

| Role      | Face              | Why                                                                                             |
| --------- | ----------------- | ----------------------------------------------------------------------------------------------- |
| Display   | Fraunces Variable | Old-style serif with soft, slightly irregular forms — heritage warmth that echoes the lettering |
| Body / UI | Inter Variable    | Neutral and highly legible, for text that is read rather than looked at                         |

Both are **self-hosted** via `@fontsource-variable/*`: no request to Google, no
third-party host that can be slow or go down, and nothing to disclose in a
privacy policy.

**Only the weight axis is loaded** (`/wght.css`), which is 36 KB for Fraunces
against 118 KB for the full build. The full build adds SOFT and WONK axes that
would warm the terminals slightly closer to the logo, but not by enough to
justify tripling the payload. To change that, swap the import in
`BaseLayout.astro` to `@fontsource-variable/fraunces/soft.css` and add
`font-variation-settings: 'SOFT' 40` in `global.css`.

## How tokens work

`src/styles/tokens.css` defines every colour, font, radius, shadow and timing as
a CSS custom property. `global.css` maps them to Tailwind utilities with
`@theme inline`, so `bg-brand` resolves to `var(--qa-brand)` at runtime.

**Changing a value in `tokens.css` re-skins the whole site**, in both themes,
with no component edits.

In a monochrome system there is no separate brand hue: `--qa-brand` is simply
ink — near-black on light, near-white on dark. Buttons are pure contrast,
exactly like the logo.

### Surfaces that are dark regardless of theme

The hero photograph is dark whatever theme the page is in. Rather than
hardcoding white on each child and adding `dark:` variants that would be wrong
there, wrap the subtree in **`.qa-on-dark`**, which overrides the tokens locally:

```astro
<div class="qa-on-dark">
  <SocialLinks />
</div>
```

The site header uses the same technique while it overlays the hero, scoped to
`[data-overlay]:not([data-scrolled])`.

## Brand assets

Derived from the supplied artwork by two scripts. Re-run either if the source
changes:

```bash
pnpm --filter @qa-ulew/web brand:logo    # wordmark variants
pnpm --filter @qa-ulew/web brand:icons   # favicon + PWA icons
```

| Variant | Where          | Contains                               |
| ------- | -------------- | -------------------------------------- |
| `full`  | Hero           | Everything — tagline and "TV" included |
| `mark`  | Header, footer | Tagline and "TV" removed               |

Both erase rectangles were **measured from the alpha channel**, not guessed:
tagline ink sits below y=492 right of x=520 (the Q's tail stays left of x=515),
and a column scan found a clean gutter with zero ink at x=1072–1078 separating
the "TV" from the W. Everything that still reads small is kept — the church,
the 1914 date, the diamonds on the U and E, the wheat on the W.

**App icons use only the Q**, on an opaque white tile in both themes. At 32px
the full wordmark is an unreadable smear, while the Q with the church inside
stays distinctive. The tile is opaque because a launcher's background is not
ours to control and a transparent mark vanishes against half of them. Maskable
variants use a tighter 56% inset for Android's circular crop.

**Vector tracing was tried and rejected.** `potrace` at settings small enough to
beat the PNG erased the thin bars of the L and E — "ULEW" came out as "UI FW" —
and settings that preserved them produced 265 KB against 59 KB for the raster.
The mark's distressed texture is the cause. **Getting the original vector from
the designer is the real fix** for the pixelation visible when zooming.

The wordmark uses **both supplied artworks**, one displayed at a time, rather
than one file inverted with `filter`. Tokens decide which:

```css
--qa-logo-ink: block; /* black artwork  */
--qa-logo-paper: none; /* white artwork  */
```

`.qa-on-dark` flips them for surfaces that are dark regardless of theme. The
mark is therefore always the artwork the brand actually supplied.

The tradeoff is that the hidden variant is still downloaded — roughly 30–40 KB
across the page. Accepted deliberately: a `<picture>` with
`prefers-color-scheme` would download only one, but it follows the OS setting
and would ignore the manual toggle, which is worse.

**Known constraint:** `landscape.jpg` is only 799×483, so it is upscaled on
desktop. It is held at low opacity behind a heavy scrim, which is what stops
that showing. A higher-resolution scan would let the photograph be used far
more boldly.

**Still worth doing:** an SVG wordmark. A fraction of the size, crisp at any
scale, and one file coloured with `currentColor` instead of two raster files.

## The hero

The photograph sits **behind** the page rather than on top of it: a scrim in
the page background colour is laid over it, so the hero is light in light mode
and dark in dark mode.

An earlier version was dark in both themes — a deliberate choice, and the wrong
one. It made light mode a lie. The identity is monochrome, not dark.

In light mode the photograph is **inverted**. The source is a mid-grey archival
scan; laid straight onto paper it reads as a muddy wash, whereas the negative
reads as an intentional darkroom treatment and keeps the tonal range wide.

Rules it exists to enforce:

- **One logo visible at a time.** The header wordmark is hidden while the hero
  is on screen and fades in only once the hero's bottom edge passes under the
  header. Three simultaneous marks — one baked into the old banner, one
  overlaid, one in the header — was the original mistake.
- **Exactly `min-h-svh`.** The _small_ viewport unit, so a mobile browser with
  a retracting URL bar cannot leave a sliver of the next section showing. `vh`
  and any value below 100% both did.
- **`clamp()` for the mark, not breakpoints.** It scales continuously, so there
  is no width at which it looks stranded between two steps.
- **Grain.** A flat panel reads as an empty div; broadcast imagery always
  carries noise. An inline SVG turbulence filter, a few hundred bytes, at ~5%
  opacity. It also masks gradient banding on 8-bit displays.

Because the hero now follows the theme, the header needs no colour override
while overlaying it — one fewer special case than the previous version.

## Controls

Defined once in `global.css`, not repeated as class soup at each usage.

| Class             | Used for                   |
| ----------------- | -------------------------- |
| `.qa-btn`         | Base button geometry       |
| `.qa-btn-solid`   | Primary action             |
| `.qa-btn-outline` | Secondary action           |
| `.qa-icon-btn`    | Theme toggle, menu trigger |

Interaction rules that matter:

- **Buttons get `cursor: pointer`.** Every browser defaults `<button>` to
  `cursor: default`, which makes it feel inert next to a link. A global rule
  covers `button`, `[role="button"]`, `summary` and `label[for]`; disabled
  controls get `not-allowed`.
- **Hover lifts 1px, active returns to 0.** The press should reverse the
  movement, not continue it, or the control feels like it is falling away from
  the tap.
- **Icon buttons scale their hover surface from 85%** rather than fading a
  background in. Fading is the default everyone reaches for and reads as flat;
  scaling gives the press a sense of origin.
- **The theme toggle cross-fades with a rotation**, so the two states feel like
  one object turning over. It shows the icon for what clicking will _do_, not
  for what is currently active.

### The header wordmark does not reload the page

It stays a real `<a href="/">` — correct for SEO, middle-click, "open in new
tab", and the day a second page exists. But when the visitor is already on that
page, following it triggers a full document reload: the browser repaints and
the theme boot script runs again, which is the flicker.

A click handler therefore cancels the navigation **only when the destination is
the current page**, scrolls to the top, strips any leftover `#section` from the
URL with `replaceState`, and moves focus to `#main` so keyboard users follow the
scroll. It never intercepts modified clicks (⌘/Ctrl/Shift/Alt, middle button) —
those are deliberate new-tab requests.

## Contact details

They live in `config/site.ts`, **not** environment variables. Everything there
is public: printed on the page, indexed, and already published on the channel's
Facebook profile. A `PUBLIC_`-prefixed variable is inlined into the HTML anyway,
so it would be equally visible while being harder to review, impossible to
type-check, and invisible in code review. Environment variables are for values
that differ per environment or must stay secret; neither applies to a phone
number meant to be dialled.

Each detail renders as an action with the correct URL scheme, which is what
makes mobile work without any user-agent sniffing — the OS owns these:

| Scheme    | Behaviour                                                    |
| --------- | ------------------------------------------------------------ |
| `tel:`    | Opens the dialler. Stored in E.164 so it dials from anywhere |
| `mailto:` | Opens the default mail app, composing to the address         |
| `m.me`    | Deep-links into the Messenger app, falling back to web       |
| maps URL  | Opens the preferred map app                                  |

`m.me` is a **separate entry from the Facebook page link** deliberately:
visiting the profile URL shows the page, it does not open a conversation.

## Scrollbar

The browser default is the loudest unstyled element on a monochrome page and
does not follow the theme. Both syntaxes are set: `scrollbar-width` /
`scrollbar-color` (the standard) and `::-webkit-scrollbar` (Safari, older
Chromium). The thumb is inset with a transparent border plus `background-clip`,
which keeps it thin-looking without shrinking the hit area — a hairline
scrollbar looks refined and is genuinely harder to grab.

## Motion

One easing curve (`--qa-ease`) and three durations, used everywhere. Consistent
timing is most of what makes an interface feel smooth; varying curves per
component reads as noise.

| Pattern           | Where              | How                                                                      |
| ----------------- | ------------------ | ------------------------------------------------------------------------ |
| Hero entrance     | `Hero.astro`       | CSS `@keyframes` on load — no observer, so no flash while a script boots |
| Scroll reveal     | `Reveal.astro`     | IntersectionObserver adds `data-revealed`                                |
| Header background | `Header.astro`     | Observer on a sentinel, not a scroll listener                            |
| Mobile menu       | `Header.astro`     | `grid-template-rows` 0fr → 1fr (`height: auto` cannot animate)           |
| Thumbnail hover   | `VideoEmbed.astro` | Grayscale → colour, slight scale                                         |

Three rules that matter more than the animations themselves:

1. **Never hide content behind an animation that might not run.** `Reveal`
   applies the _hidden_ state from JavaScript, so if the script fails,
   everything is simply visible. Hiding in CSS and revealing in JS is a blank
   page waiting to happen.
2. **Keep travel small.** Reveals move 14px. Large entrance movement impresses
   once and feels sluggish every time after.
3. **Reveal once.** Re-animating on scroll-up is distracting.

`prefers-reduced-motion: reduce` disables all of it — `global.css` neutralises
transitions and animations globally, and `Reveal` skips the observer entirely
rather than leaving elements hidden. Do not override this.

## Video thumbnails

YouTube returns thumbnails in full colour, which would break the monochrome
grid. They are desaturated by default and return to colour on hover — which also
signals the tile is interactive.

## Still outstanding

- `public/og-default.png` at **1200×630** — referenced by `BaseHead.astro` but
  does not exist, so link shares have no preview image
- `public/favicon.svg` is a simplified "Q" glyph. The full mark (church,
  volcano, date) turns to mud at 16px, so a reduced glyph remains correct even
  once the vector original arrives
- The meaning of **9 de febrero de 1914** is undocumented. It is deliberately
  not surfaced as a fact on the site — see the note in `pages/index.astro`
