# Design system — applying the real brand

The designs, logo, icons, palette and fonts do not exist yet. The site is built
so that when they arrive, the visual change is concentrated in **one file**.

## Everything routes through tokens

`apps/web/src/styles/tokens.css` defines every colour, font, radius and shadow
as a CSS custom property. `global.css` maps those to Tailwind utilities via
`@theme inline`, so `bg-brand` and `text-fg-muted` resolve to `var(--qa-brand)`
and `var(--qa-fg-muted)` at runtime.

The consequence: **changing a value in `tokens.css` re-skins the whole site**,
in both themes, with no component edits and no class renaming.

The current values are neutral placeholders chosen only to be legible and
accessible. They are not a brand proposal — the green is a stand-in.

## Applying the palette

Replace the values in `tokens.css`. Both blocks need updating:

```css
:root {
  --qa-brand: #1f7a53; /* replace: the real brand colour */
  --qa-brand-hover: #196745; /* replace: roughly 8% darker */
  --qa-brand-fg: #ffffff; /* replace: text drawn ON the brand colour */
  /* ... */
}

[data-theme="dark"] {
  --qa-brand: #4fbc8b; /* replace: usually lighter/desaturated for dark */
  /* ... */
}
```

Dark mode is **not** an inversion. A brand colour that passes contrast on white
usually fails on near-black and has to be lightened. Check both.

### Contrast requirements

Every foreground/background pair must meet WCAG AA — 4.5:1 for body text, 3:1
for large text and UI borders. The pairs that matter:

| Foreground      | Background       |
| --------------- | ---------------- |
| `--qa-fg`       | `--qa-bg`        |
| `--qa-fg-muted` | `--qa-bg`        |
| `--qa-fg-muted` | `--qa-bg-subtle` |
| `--qa-brand-fg` | `--qa-brand`     |
| `--qa-brand`    | `--qa-bg`        |

Verify in both themes.

## Applying fonts

1. Put the files in `apps/web/public/fonts/` — `.woff2` only, it is the only
   format worth shipping.
2. Declare them at the top of `tokens.css`:

```css
@font-face {
  font-family: "Brand Sans";
  src: url("/fonts/brand-sans.woff2") format("woff2");
  font-weight: 400 700; /* a variable font covers the range */
  font-display: swap; /* text is visible during load */
  font-style: normal;
}
```

3. Point the token at it:

```css
--qa-font-sans: "Brand Sans", ui-sans-serif, system-ui, sans-serif;
--qa-font-display: "Brand Display", var(--qa-font-sans);
```

4. Preload the one font used above the fold, in `BaseHead.astro`:

```astro
<link rel="preload" href="/fonts/brand-sans.woff2" as="font" type="font/woff2" crossorigin />
```

Always keep the system-font fallbacks in the stack. `font-display: swap` plus a
fallback means text renders immediately instead of flashing invisible.

## Applying the logo

Two things to replace:

- `apps/web/public/favicon.svg` — currently a placeholder "QU" square.
- The wordmark in `Header.astro` — currently the same "QU" square plus text.
  Swap for the real mark: put `logo.svg` in `public/` and reference it, or
  inline the SVG for theme-aware colouring.

If the logo needs to differ between light and dark themes, inline it and use
`currentColor`, or render both and toggle with the `dark:` variant.

Also add a real `public/og-default.png` at **1200×630** — the social share image
is referenced in `BaseHead.astro` and currently points at a file that does not
exist.

## Theme behaviour

The default is **follow the system**. An inline script in `BaseLayout.astro`
runs before first paint and writes a concrete `data-theme="light|dark"` onto
`<html>`, resolving `localStorage` first and `prefers-color-scheme` otherwise.
There is no flash of the wrong theme.

Once the user clicks the toggle, their choice is stored and wins. While they
have not, the site keeps following the OS live — including if the OS switches
at sunset with the page already open.

Because a concrete attribute is always present, `dark:` in Tailwind keys off
`[data-theme='dark']` rather than the media query. Single source of truth, and
the toggle actually works.

## Conventions

- **No raw colour values outside `tokens.css`.** A hex in a component will not
  respond to the theme and will survive the rebrand. This is the one rule that
  keeps the token system worth having.
- Use the semantic tokens (`bg-surface`, `text-fg-muted`) rather than inventing
  new ones. If something genuinely has no token, add it to `tokens.css` in both
  themes and map it in `global.css`.
- Shared layout widths and gutters go through the `.qa-container` class.
- Respect `prefers-reduced-motion` — `global.css` already disables animation
  globally for those users. Do not override it.
