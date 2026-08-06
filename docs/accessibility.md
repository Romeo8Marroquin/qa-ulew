# Accessibility

The target is **WCAG 2.2 Level AA**, and the site meets it. This document is
the record of how — which decisions were deliberate, which trade-offs were
accepted and why, and what will break it.

Most of it is not extra work bolted on. The site was already static HTML with
real headings, real links and almost no JavaScript, which is most of the job.
What follows is what that did not cover.

## The one rule that matters most

**An `alt`, an `aria-label` or a hidden hint is copy.** It is read aloud, in the
visitor's language, to a person. So it lives in `src/i18n/locales/es.ts` with
every other sentence on the site, under `a11y.*`, and is reached through `t()`.

A hardcoded `alt="Fotografía del lago"` is the same bug as a hardcoded heading —
it is simply one that only some people hit. When a second language is added, a
hardcoded label leaves those users on an English page being read Spanish.

This is Hard Rule 1 in `CLAUDE.md`. It has no exception for accessibility
strings; if anything it matters more there, because nobody reviewing the page
visually will notice the omission.

## Structure

### Landmarks

A screen reader offers a list of landmarks as a way to move around a page. That
list is only useful if the entries are distinct.

| Landmark        | Comes from                       | Named by         |
| --------------- | -------------------------------- | ---------------- |
| `banner`        | `<header>` in `Header.astro`     | implicit         |
| `navigation`    | desktop `<nav>`                  | `nav.primaryNav` |
| `navigation`    | mobile panel `<nav>`             | `nav.mobileNav`  |
| `main`          | `<main>` in `BaseLayout.astro`   | implicit         |
| `region` ×3     | each `<Section>`                 | its own `<h2>`   |
| `complementary` | `<AdSlot>`, when ads are enabled | `ads.label`      |
| `contentinfo`   | `<footer>`                       | implicit         |

Two things here are easy to get wrong and were both wrong:

- **All three navigation labels were the same string** (`nav.home`, "Inicio"),
  which turned the landmark list into three identical entries and made it
  useless as a way to navigate.
- **`<section>` is not a landmark on its own.** HTML-AAM exposes it as `region`
  only when it has an accessible name, so the whole page offered exactly three
  landmarks and no way to jump to the videos or the contact details.
  `Section.astro` now points `aria-labelledby` at the `<h2>` it already renders,
  deriving the id from the section's own `id`.

### Skip link and `<main>`

`<main>` carries a permanent `tabindex="-1"`.

Following a fragment to a non-focusable element moves the scroll position and
the sequential-navigation starting point, but **not focus** — and browsers have
disagreed about the details for twenty years. A negative tabindex makes it a
real focus target without adding it to the tab order, which every browser
handles identically. It never shows a ring: focus arrives by fragment or by
script, never by keyboard, so `:focus-visible` does not match.

The skip link reveals itself on `:focus` **and** `:focus-visible`. The two agree
for a keyboard Tab, but `:focus-visible` is a heuristic, and this is the one
control where a browser guessing wrong leaves a sighted keyboard user staring at
a link they cannot see while their focus sits inside it. A mouse cannot reach
it, so the broader selector costs nothing.

### Lists

Every `<ul>` on the site carries an explicit `role="list"`.

This is not redundant. Tailwind's preflight sets `list-style: none`, and Safari
responds by stripping list semantics from the element — so VoiceOver stops
announcing "list, 4 items" and the count is lost. Restating the role puts it
back. It applies to the mobile menu, the social links and the contact methods.

## Images

| Image                | Treatment                                         |
| -------------------- | ------------------------------------------------- |
| Hero photograph      | **Described** — `a11y.hero.photo`                 |
| Wordmark (`Logo`)    | `role="img"` + `aria-label` on the wrapper        |
| Video poster         | Decorative — the `<figcaption>` carries the title |
| Icons (`astro-icon`) | `aria-hidden` — every one is beside real text     |

### The hero photograph is not decorative

It sits behind the type, which is normally the definition of a decorative
background. It is described anyway, because it is the channel: the lake it comes
from, in the archival black and white the whole identity is built on. An empty
`alt` means a visitor using a screen reader arrives at a wordmark and a tagline
with nothing underneath them, while everyone else arrives somewhere specific.

The description is written as a description of the **frame** — water, volcanoes,
the road, the figures, the millstones — so it stays true if the image is
re-cropped or rescanned. It is also the only thing telling a search engine what
this page is about, image-wise.

### Why the wordmark's name is on a wrapper

`Logo.astro` always has **both** artworks in the DOM — black ink and white ink —
and a token decides which is `display: block`.

An `alt` on one of them is therefore an accessible name that exists in exactly
one theme. It was on the black mark, so in dark mode, where that one is
`display: none` and the white one was `aria-hidden`, **the footer logo had no
name at all.** The bug was invisible in light mode, which is where it was
looked at.

So both images are decorative, always, and the name is `role="img"` +
`aria-label` on the wrapper — theme-independent by construction. There is no
arrangement of the tokens that can make it disappear.

Pass `alt=""` where the surrounding markup already names it: the hero, whose
`<h1>` carries the name and tagline as hidden live text, and the header link,
which has its own `aria-label`. Otherwise the brand is announced twice in a row.

## Controls

### The menu button

One constant name (`nav.menu.label`, "Menú") plus `aria-expanded`. The label
does **not** change when the panel opens.

It used to read "Abrir menú" in both states, so once open a screen reader
announced "Abrir menú, expandido" — a control contradicting its own state. The
WAI-ARIA disclosure pattern is one name and one state attribute; that is why
there is no longer a "Cerrar menú" string.

The panel is a **disclosure, not a modal**, so focus is deliberately not
trapped: trapping makes Escape the only way out, and anyone who does not know
that is stuck. Instead it closes on Escape, on outside pointerdown, and when
focus moves out of it (`focusout` with a non-null `relatedTarget` — null means
focus left the document entirely, e.g. switching browser tabs, which must not
close it). Every close path returns focus to the toggle if focus was inside.

### The theme toggle

The accessible name is "Cambiar tema" in both states — it names the action, not
the current theme. A screen-reader user can operate it but cannot tell which
theme is currently active without listening for the change.

**This is a known, accepted gap**, kept deliberately so the visible tooltip is
not state-dependent. The fix, if it is ever wanted, is to have the toggle's
existing script write `aria-label` and `title` from a pair of new keys —
"Cambiar a tema oscuro" / "Cambiar a tema claro" — after it resolves the theme.

### External links

Every link that opens a new tab says so, via `a11y.newWindow`. Without it the
warning exists only for people who can see the little arrow glyph coming — and
that glyph is `aria-hidden`.

Two mechanisms, and the difference matters:

- **Inside an `aria-label`** (`SocialLinks`), because an `aria-label` replaces
  the element's contents entirely and a hidden span there would never be read.
  The label still contains the visible platform name, which is what WCAG 2.5.3
  requires so voice control can act on "click YouTube".
- **A `.qa-sr-only` span** (`ContactMethods`, `VideoEmbed`), where the name comes
  from the content and can simply be extended.

`tel:` and `mailto:` do **not** get the warning — they hand off to the OS rather
than opening a window, so it would be a lie.

## Focus

The ring is `2px solid var(--qa-focus)` at `3px` offset: ink on paper, paper on
ink. 17.5:1 against the page in light, 17.4:1 in dark. It is the same ring in
both themes on purpose — a focus style that has to be redesigned per theme is
one that will be wrong in whichever theme is looked at less.

Three things about it are load-bearing:

**The offset is not cosmetic.** It leaves a band of page colour between the
control and the ring, which is what makes the ring readable on the solid ink
button. Drawn flush, that ring would be ink on ink.

**There is no `border-radius`.** There used to be, which meant focusing anything
reshaped it — a pill-shaped control squared off to 4px the moment it was tabbed
to. Browsers already draw the outline following the element's own radius, so the
correct value is no value.

**`.qa-focus-inset` exists because a clipped ring is no ring.** An offset ring
is drawn outside the border box, so on a control filling an `overflow: hidden`
parent — the video play button, `inset-0` inside the rounded poster frame —
every pixel of it was clipped and keyboard users got nothing. That class flips
the offset inward.

Separately, `html { scroll-padding-top: var(--qa-header-height) }` keeps the
fixed header from covering whatever the browser scrolls to. That is WCAG 2.4.11
(Focus Not Obscured): tab to something off-screen, and without it the element
you are now focused on is behind the bar. It applies to every scroll the browser
performs, not only the ones we wrote code for, which is why the `scroll-mt-*` on
individual sections is now belt-and-braces rather than the only defence.

## Colour and contrast

Measured with the WCAG 2.x relative-luminance formula against **both**
backgrounds in each theme. `--qa-bg-subtle` is the tighter constraint by roughly
0.4 of a ratio — check against that one, not `--qa-bg`.

| Token            | Light (bg / bg-subtle) | Dark (bg / bg-subtle) |
| ---------------- | ---------------------- | --------------------- |
| `--qa-fg`        | 17.53 / 16.07          | 17.36 / 16.35         |
| `--qa-fg-muted`  | 6.92 / 6.34            | 7.72 / 7.27           |
| `--qa-fg-subtle` | 4.94 / 4.52            | 5.04 / 4.74           |

### What changed, and why it had to

`--qa-fg-subtle` **failed AA** and was the only text token that did:

| Theme | Was       | Measured    | Now       | Measured    |
| ----- | --------- | ----------- | --------- | ----------- |
| Light | `#8a8478` | 3.56 / 3.26 | `#726d62` | 4.94 / 4.52 |
| Dark  | `#77726a` | 4.07 / 3.83 | `#888176` | 5.04 / 4.74 |

AA asks 4.5:1 for text under 24px, and **every** use of this token is small: the
footer copyright, the identity `dt` labels, the contact-row labels, the "Ver en
YouTube" link. So the palest step of the ramp was the one place the page was
genuinely unreadable for anyone with reduced contrast sensitivity — and it looks
fine on a good monitor, which is exactly why it survived this long.

The new values are the **lightest** warm greys that clear 4.5:1 against both
backgrounds. Same hue, one step darker. `--qa-fg-muted` is untouched, so the
three-step ramp survives.

(`#837d73` was the first dark-mode candidate and lands at 4.48:1 on
`--qa-bg-subtle`. Two hundredths short is still a fail.)

### Borders are below 3:1, and that is accepted

`--qa-border` measures 1.2–1.3:1 and `--qa-border-strong` 1.5–1.9:1 against the
page. WCAG 1.4.11 asks 3:1 for a boundary that is **required to identify a
control**.

These are not that. They are hairline rules between rows and under headings —
decoration, which the criterion explicitly excludes. The one arguable case is
`.qa-btn-outline`, whose border is its only edge; it is identifiable by its
17.5:1 text label and its position beside the solid button, which satisfies the
criterion's own carve-out for controls identifiable without the boundary.

Anyone who needs those rules to be visible gets them — see below.

## OS preferences

Four, all handled at the **token** level in `tokens.css` rather than per
component. That is the point: a preference that has to be implemented in each
component is a preference that will be forgotten in half of them.

None of these have a UI control on the site, and none should. An OS setting is
the one the user has actually configured; duplicating it in page chrome means
two switches that can disagree.

### `prefers-reduced-motion: reduce`

Handled in `global.css` and per component. Entrance animations off, scroll
reveals never hide in the first place, `scroll-behavior` back to `auto`, the
theme swap applies instantly instead of cross-fading the hero, and the custom
scrollbar stays visible rather than appearing on approach.

### `prefers-contrast: more`

The rules and the palest text step firm up:

| Token                | Light     | Dark      | Ratio vs `bg-subtle` |
| -------------------- | --------- | --------- | -------------------- |
| `--qa-border`        | `#8a8478` | `#77726a` | 3.26 / 3.83          |
| `--qa-border-strong` | `#5a574e` | `#a8a396` | 6.34 / 7.27          |
| `--qa-fg-subtle`     | `#5a574e` | `#a8a396` | 6.34 / 7.27          |

The default palette is deliberately soft, and it meets AA. For someone who has
asked their OS for more contrast it is not enough — the hairlines in particular
vanish. 3:1 is the 1.4.11 threshold for a non-text boundary; the text step goes
to full AA-with-margin by collapsing onto `--qa-fg-muted`.

### `prefers-reduced-transparency: reduce`

Three surfaces on this site get their legibility from a backdrop blur, which is
precisely the arrangement this preference exists to switch off:

- **`--qa-veil` → opaque, `--qa-veil-blur` → `none`.** Covers the header pills
  and the mobile menu panel in one move.
- **The header bar** goes to a solid gradient (`Header.astro`). Without this it
  would end up in its _worst_ state: 78%/62% translucent with the blur removed.
  The bottom mask is kept — it only feathers the 1rem overhang, where no text
  sits, so the design intent survives and the see-through does not.
- **The hero scrim thickens** (0.34 → 0.78 light, 0.50 → 0.85 dark). This is the
  strongest case on the page: live photographic detail directly behind the
  wordmark, the subtitle and two buttons.

The scrim is **raised, not made opaque**. Erasing the photograph would answer the
preference by deleting the content, and the request is for legible text, not for
a blank panel.

### `forced-colors: active` (Windows High Contrast)

The OS forces `color`, `background-color` and `border-color` — but **not**
gradients, **not** `backdrop-filter`, and it drops `box-shadow` entirely. So
anything whose legibility comes from a blur, a shadow or a gradient looks
correct in devtools and is unusable on screen.

Three things fail that way and are fixed where they live:

| Element           | Failure                                         | Fix                                  |
| ----------------- | ----------------------------------------------- | ------------------------------------ |
| Mobile menu panel | Blur ignored, shadow dropped → links on page    | `Canvas` bg + `CanvasText` border    |
| Header bar        | Masked gradient paints our paper colour         | `Canvas` bg, mask off, bottom border |
| Custom scrollbar  | Alpha token not translated → no scroll position | `CanvasText` + `forced-color-adjust` |

Plus `outline-color: Highlight` on `:focus-visible` and a border on the skip
link, both in `global.css`.

**These live in the components' own `<style>` blocks, not in `global.css`.**
Astro scopes component styles with an extra `[data-astro-cid-*]` attribute
selector, which out-specifies a bare class in a global sheet — a global override
would silently lose. It is also simply where they belong: a component should own
how it degrades.

Use the system keywords (`Canvas`, `CanvasText`, `Highlight`), never a fixed
colour. That is what makes this correct for every high-contrast theme rather
than only the black-on-white one that gets tested.

## Known gaps

Honest list. None of these break AA.

- **The theme toggle does not announce the active theme.** See above.
- **The native scrollbar is replaced** (`Scrollbar.astro`), and the replacement
  appears on scroll or pointer proximity rather than being permanently visible.
  It is mounted only for fine pointers, and it stays visible under both
  `prefers-reduced-motion` and `forced-colors`. Keyboard scrolling is untouched.
- **`--qa-fg-subtle` sits at 4.5–5.0:1**, which is a pass with little margin.
  Any future darkening of `--qa-bg-subtle` needs re-measuring.
- **The focus ring over the hero photograph** is measured against the page, not
  against the photograph behind it. WCAG 2.4.13 (focus appearance against
  adjacent colours) is AAA and is not claimed. The CTAs sit in the bright centre
  of the frame, where the ring reads clearly.
- **`text-fg-subtle` on the `videos.empty` placeholder** is only reachable when
  the channel has no videos, which is not the live state.

## Before you change something

Structural things that will quietly break this:

1. **Adding a `<nav>`** — give it a distinct label, or the landmark list stops
   being navigation.
2. **Adding a `<Section>` without an `id`** — it silently loses its
   `aria-labelledby` and stops being a landmark.
3. **Adding a `<ul>`** — it needs `role="list"` or Safari drops the semantics.
4. **Adding an image** — decide decorative vs described, and if described, put
   the text in `es.ts` under `a11y.*`.
5. **Adding a control inside an `overflow: hidden` box** — it needs
   `qa-focus-inset` or its focus ring is clipped away.
6. **Changing a colour token** — re-measure against `--qa-bg-subtle`, and
   remember `prefers-contrast: more` has its own values that need to move with
   it.
7. **Adding a translucent surface** — it needs a
   `prefers-reduced-transparency` fallback and a `forced-colors` one, in its own
   component.

## What is now checked automatically

Two gates, both wired into `pnpm verify`. Neither existed when this document was
first written, and neither replaces a keyboard and a screen reader.

**ESLint** runs 34 `astro/jsx-a11y` rules over every component — an image with
no alt, a click handler on a div, an anchor with no href, a positive tabindex.
It cannot judge whether alt text is _good_, only that it exists.

> `eslint-plugin-jsx-a11y` must stay installed. It is an optional peer of
> `eslint-plugin-astro`, and without it the a11y config resolves to an **empty
> rule set** — a linter reporting success while checking nothing. That is how it
> was first set up here, and it was caught only by planting deliberate
> violations and confirming they were flagged.

**`tests/components/accessibility.test.ts`** asserts the contracts in this
document against the real rendered markup: distinct landmark names, a named
region per section, one `<h1>`, no skipped heading level, `role="list"`
everywhere, every control named, every icon hidden, new-window warnings present,
`tabindex="-1"` on `<main>`. That file and this document are meant to agree — if
you change one, change the other.

## What is still manual

Neither gate can see any of this:

- Whether the hero photograph's description is _accurate_
- What a screen reader actually announces, in order
- Whether the focus ring is visible against the photograph behind it
- Windows High Contrast, Reduce Transparency, Increase Contrast
- Reflow at 400% zoom

The passes listed above still have to be done by a person.
