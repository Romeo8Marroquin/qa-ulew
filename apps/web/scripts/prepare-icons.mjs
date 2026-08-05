/**
 * Generate the favicon and PWA icon set from the wordmark.
 *
 *   pnpm --filter @qa-ulew/web brand:icons
 *
 * Output goes to `public/icons/` plus `public/favicon.svg`.
 *
 * Two decisions worth knowing:
 *
 * 1. App icons are ALWAYS on white, in both themes. A launcher or bookmark bar
 *    has its own background that we do not control, and a transparent mark
 *    disappears against half of them. A solid tile is also what the platform
 *    icon guidelines expect.
 *
 * 2. Only the "Q" is used, not the wordmark. At 32px — let alone 16px — the
 *    full mark is an unreadable smear. The Q with the church inside is
 *    distinctive on its own and survives being tiny, which is the entire job
 *    of an app icon.
 */
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const SRC = '../../assets/brand/logo_qa_ulew_black.png';
const OUT = 'public/icons';
await mkdir(OUT, { recursive: true });

// The Q occupies the left ~26% of the 1141x563 artwork.
const Q = { left: 0, top: 0, width: 300, height: 563 };

const glyph = await sharp(SRC).ensureAlpha().extract(Q).trim({ threshold: 1 }).toBuffer();
const meta = await sharp(glyph).metadata();
console.log(`Q glyph ${meta.width}x${meta.height}`);

/**
 * `maskable` icons are cropped to a circle by Android, so the artwork must sit
 * inside a "safe zone" of the middle 80%. A normal icon can use more of the
 * tile. Two sets, because using maskable padding everywhere makes the icon
 * look small on platforms that do not crop.
 */
async function tile(size, { maskable = false } = {}) {
  const inset = maskable ? 0.56 : 0.74;
  const art = await sharp(glyph)
    .resize({
      width: Math.round(size * inset),
      height: Math.round(size * inset),
      fit: 'inside',
      kernel: 'lanczos3',
    })
    .toBuffer();

  const { width, height } = await sharp(art).metadata();

  return sharp({
    create: { width: size, height: size, channels: 4, background: '#ffffff' },
  })
    .composite([
      {
        input: art,
        left: Math.round((size - width) / 2),
        top: Math.round((size - height) / 2),
      },
    ])
    .png({ compressionLevel: 9 });
}

for (const size of [192, 512]) {
  await (await tile(size)).toFile(`${OUT}/icon-${size}.png`);
  await (await tile(size, { maskable: true })).toFile(`${OUT}/icon-maskable-${size}.png`);
  console.log(`icon-${size}.png, icon-maskable-${size}.png`);
}

// Apple ignores the manifest and needs its own link tag. It also does not
// respect transparency, which is another reason the tile is opaque.
await (await tile(180)).toFile(`${OUT}/apple-touch-icon.png`);
console.log('apple-touch-icon.png');

// A 32px PNG favicon for browsers that prefer raster, alongside the SVG.
await (await tile(32)).toFile(`${OUT}/favicon-32.png`);
console.log('favicon-32.png');
