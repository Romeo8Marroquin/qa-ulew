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

### The palette has a floor

A monochrome palette is a contrast palette — the tonal steps _are_ the design,
so there is no colour to fall back on when one of them is too pale. Two
constraints therefore bind every value in the text ramp:

- **Measure against `--qa-bg-subtle`, not `--qa-bg`.** The muted sections are
  the tighter case by roughly 0.4 of a ratio, and both are in play everywhere.
- **`--qa-fg-subtle` is the floor,** not a free choice. It sits at 4.5–5.0:1 —
  a pass with little margin, deliberately, because it is the palest step that
  clears AA. It was lighter and failed at 3.3–4.1:1.

`tokens.css` also carries a `prefers-contrast: more` block with firmer values
for the rules and the palest text step. Move a token and you move two: the
default and its high-contrast counterpart.

Every figure, and what breaks if these move, is in
[accessibility.md](accessibility.md).

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
| "Ver más"         | `video-list.ts`    | New tiles fade up as they enter view, 70ms apart; one smooth scroll      |

Three rules that matter more than the animations themselves:

1. **Never hide content behind an animation that might not run.** `Reveal`
   applies the _hidden_ state from JavaScript, so if the script fails,
   everything is simply visible. Hiding in CSS and revealing in JS is a blank
   page waiting to happen.
2. **Keep travel small.** Reveals move 14px. Large entrance movement impresses
   once and feels sluggish every time after.
3. **Reveal once.** Re-animating on scroll-up is distracting.
4. **A resize is not a scroll.** Dragging a window wider reflows content into
   the bottom 12% band the observer waits on, where it used to sit blank until
   the visitor scrolled — measured, two thirds of a drag across the about
   section showed empty blocks. After a resize, anything hidden but on screen is
   shown at once, without the entrance. Rotating a phone is the same case.
5. **Name what animates.** `transition`, never `transition-all`: "all" also
   animates whatever layout property happens to change one day. Tailwind v4's
   `transition` already covers colour, opacity, shadow, filter, transform,
   translate and scale.

`prefers-reduced-motion: reduce` disables all of it — `global.css` neutralises
transitions and animations globally, and `Reveal` skips the observer entirely
rather than leaving elements hidden. Do not override this.

## Preferences the design answers to

Motion is one of four OS settings the palette responds to. The other three also
change how the site looks, and all of them are handled in `tokens.css` rather
than per component — a preference implemented component by component is one that
will be missing from half of them.

| Preference                     | What changes                                                    |
| ------------------------------ | --------------------------------------------------------------- |
| `prefers-reduced-motion`       | Animations, reveals, smooth scroll, the hero's theme cross-fade |
| `prefers-contrast: more`       | Hairline rules and `--qa-fg-subtle` firm up                     |
| `prefers-reduced-transparency` | The veil goes opaque; the header bar and hero scrim solidify    |
| `forced-colors` (Windows HC)   | Glass surfaces take real system backgrounds                     |

These are the only conditions under which the design is allowed to differ from
what is in this document, and none of them are exposed as site controls — an OS
setting is the one the visitor actually configured. Details and exact values in
[accessibility.md](accessibility.md).

## Video lists

Two lists on the home page, _Lo más reciente_ and _Lo más visto_, each its own
section. They continue one muted band, divided by the single hairline the first
section already draws — two muted sections would stack two hairlines into one
heavy rule.

One column on a phone, two on a tablet, three on a desktop — and **whatever
would be left over on the last row goes on top instead**:

| Left over | Tablet (2 columns)     | Desktop (3 columns)                  |
| --------- | ---------------------- | ------------------------------------ |
| 0         | plain grid             | plain grid                           |
| 1         | first tile, full width | first tile, full width, as a feature |
| 2         | —                      | first two, half width each           |

So the newest — or most viewed — video gets the room, which is what its position
already says about it, and no row ever ends with a tile stranded on its own.
With three shown that is one big tile and a pair on a tablet, and a row of three
on a desktop.

A full-width tile on a desktop would be a second hero — a 16:9 image over
1,100px wide — so it becomes a **feature**: the image across two thirds, the
title beside it in Fraunces at 1.75rem. A promoted tile anywhere else gets a
slightly larger title to match its image.

It is all `.qa-video-grid` in `global.css`: six tracks, so a half-width tile is
a whole number of them at every size, and two attributes, `data-rem-2` and
`data-rem-3`, written by `VideoList.astro` for the HTML and by
`scripts/video-list.ts` whenever the number shown changes. The selectors use
`li:first-of-type`, never `:first-child` — Astro can emit a component's
`<script>` inside the list, and a `:first-child` rule then lands on the script.
That is how one list once featured its first tile and the other did not.

Three tiles show, then "Ver 12 videos más" (`.qa-btn-outline`, with a chevron
that dips on hover) and "Ver todo en YouTube" beside it.

Under each title, one quiet line in `--qa-fg-subtle`: when, for the recent list;
an eye icon, the count and when, for the most viewed. A stream on air says only
"Transmitiendo ahora".

### "Ver más" in motion

A press reveals the next batch with the same fade-and-rise as every `Reveal`,
staggered 70ms per tile in the order they **arrive in view** rather than by
their index — so a row cascades correctly in one, two or three columns, and
tiles further down wait and settle in as the visitor scrolls to them. The
cascade is capped at five steps so the last of a tall screen does not lag.

Focus moves to the first new tile without scrolling, and the page then glides
**once**, only downward, only far enough to show that tile whole — never
pushing its top under the fixed header. Letting `focus()` scroll instead
jumped the page in a single frame and stopped with the tile cut off at the
bottom edge; measured, then fixed. If the tile is already in view, nothing
moves.

When a press changes the leftover count — three shown leave none over, fourteen
leave two — the tiles already on screen change size. That runs as a **View
Transition**: each of them glides from its old box to its new one as a single
image. Not the default cross-fade, which showed every title twice mid-morph; and
the page root is left uncaptured meanwhile, so everything that is not morphing
stays live and the new tiles cascade in as usual. Only the column count on
screen now is considered, so a press that changes nothing visible animates
nothing. Browsers without View Transitions get the new layout at once.

Under `prefers-reduced-motion` nothing fades, nothing morphs, and the scroll is
instant.

### The one colour: live

`--qa-live` is a red, and the single exception to the monochrome rule. A red dot
is the broadcast convention for "on air", read without a word by every visitor,
and nothing else on the site is red, so it cannot be mistaken for decoration.
It is only ever a small dot beside the words "En vivo" — never text, never a
surface — and it pulses (stilled by `prefers-reduced-motion`). On the thumbnail
it sits in a solid white pill, the same material as the play button.

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
