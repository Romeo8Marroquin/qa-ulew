# Assets

Working and source material for the project. **Nothing here is served.** This
folder is outside the Astro app and is never part of a build.

## Layout

```
assets/
├── brand/       logo source files, palette swatches, type specimens
├── reference/   screenshots, mockups, anything "here is the idea"
└── raw/         originals straight from a camera, phone or export
```

Create the folders as they are needed; none of them are required up front.

## The rule

| Folder             | Purpose                    | Served to visitors |
| ------------------ | -------------------------- | ------------------ |
| `assets/`          | source and working files   | No                 |
| `apps/web/public/` | final, optimised, shipping | Yes                |

A file only moves into `apps/web/public/` when it is final and web-ready:
correct dimensions, compressed, and in a modern format. Everything served from
`public/` is downloaded by every visitor, so a stray 4 MB PNG there is a real
cost. In `assets/` it costs nothing.

## Preparing files for the web

| Use                | Format       | Notes                                      |
| ------------------ | ------------ | ------------------------------------------ |
| Logo, icons        | SVG          | Scales to any size, tiny, theme-colourable |
| Photos             | WebP or AVIF | Use Astro's `<Image>` so it optimises them |
| Social share image | PNG          | Exactly 1200×630 → `public/og-default.png` |
| Fonts              | WOFF2 only   | → `public/fonts/`                          |

Astro optimises images imported from `src/`, but copies `public/` through
untouched. Prefer importing from `src/assets/` for content images; reserve
`public/` for files that need a fixed, predictable URL — the favicon, the OG
image, `robots.txt`.

## Not a dumping ground

Large binaries live in git history forever, even after deletion. Keep originals
of things that matter here; put genuinely huge raw material (video, RAW photos,
full design-tool exports) in shared storage instead and link to it from the
relevant document.
