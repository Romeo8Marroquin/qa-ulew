/**
 * Generate the favicon and PWA icon set from the wordmark.
 *
 *   pnpm --filter @qa-ulew/web brand:icons
 *
 * Output goes to `public/icons/` plus `public/favicon.ico`.
 *
 * Two decisions worth knowing:
 *
 * 1. App icons are ALWAYS on white, in both themes. A launcher or bookmark bar
 *    has its own background that we do not control, and a transparent mark
 *    disappears against half of them. A solid tile is also what the platform
 *    icon guidelines expect.
 *
 * 2. Only the "Q" is used, not the wordmark. At 32px — let alone 16px — the
 *    full mark is an unreadable smear.
 *
 * 3. The Q is not one mark but two, and which one is used depends on size.
 *    The Q contains a church façade: dome, columns, a clock and the words
 *    "9 DE FEBRERO DE 1914". Those strokes are a few pixels wide in a 300px
 *    source, so below ~96px they average into grey mush — the icon stops being
 *    a logo and becomes a smudge. Everything at or under 48px therefore uses a
 *    SIMPLIFIED Q, just the outer ring and its tail, derived automatically
 *    below. See docs/seo.md for the size split and why it falls where it does.
 */
import { mkdir, writeFile } from 'node:fs/promises';
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
 * The simplified Q used at 48px and below: the outer ring only, church removed.
 *
 * Derived rather than drawn, so it cannot fall out of sync with the logo — and
 * because there is no simplified mark in `assets/brand` to draw it from.
 *
 * The separation is by STROKE WIDTH, which is the one property that reliably
 * distinguishes the two: the ring is a ~14px brush stroke, every church detail
 * is under ~6px. A morphological opening — erode then dilate by the same
 * radius — deletes anything thinner than twice the radius and restores the
 * rest to its original weight. Radii are fractions of the source width so
 * re-exporting the logo at another resolution does not silently change what
 * survives.
 */
const { width: W, height: H } = meta;
const raw = await sharp(glyph)
  .flatten({ background: '#ffffff' })
  .greyscale()
  .raw()
  .toBuffer({ resolveWithObject: true });

const ink = new Uint8Array(W * H);
for (let i = 0; i < W * H; i++) ink[i] = raw.data[i] < 128 ? 1 : 0;

const disk = (r) => {
  const offsets = [];
  for (let dy = -r; dy <= r; dy++)
    for (let dx = -r; dx <= r; dx++) if (dx * dx + dy * dy <= r * r) offsets.push([dx, dy]);
  return offsets;
};

/** Erode keeps a pixel only if every neighbour is ink; dilate if any is. */
function morph(src, radius, mode) {
  if (radius <= 0) return src;
  const offsets = disk(radius);
  const out = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let value = mode === 'erode' ? 1 : 0;
      for (const [dx, dy] of offsets) {
        const nx = x + dx;
        const ny = y + dy;
        // Outside the canvas counts as background, so the frame erodes inwards
        // rather than the edge pixels being treated as solid ink.
        const neighbour = nx < 0 || ny < 0 || nx >= W || ny >= H ? 0 : src[ny * W + nx];
        if (mode === 'erode') {
          if (!neighbour) {
            value = 0;
            break;
          }
        } else if (neighbour) {
          value = 1;
          break;
        }
      }
      out[y * W + x] = value;
    }
  }
  return out;
}

/**
 * Opening alone leaves the two thickest church details behind — the clock face
 * and the rose window are round blobs wide enough to survive it. They are also
 * tiny and disconnected, so they go by area.
 *
 * Discarding everything except the single largest region would be simpler and
 * is wrong: the ring is a hand-drawn stroke that thins on the right, so the
 * erosion breaks it into several pieces. Dropping all but the largest deletes
 * the right-hand side of the Q.
 */
function dropSmallRegions(src, minArea) {
  const seen = new Uint8Array(W * H);
  const out = new Uint8Array(W * H);
  for (let start = 0; start < W * H; start++) {
    if (!src[start] || seen[start]) continue;
    const region = [start];
    const queue = [start];
    seen[start] = 1;
    while (queue.length > 0) {
      const p = queue.pop();
      const x = p % W;
      const y = (p - x) / W;
      for (const [dx, dy] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const n = ny * W + nx;
        if (src[n] && !seen[n]) {
          seen[n] = 1;
          region.push(n);
          queue.push(n);
        }
      }
    }
    if (region.length >= minArea) for (const p of region) out[p] = 1;
  }
  return out;
}

const openRadius = Math.round(W * 0.0133);
const boldRadius = Math.round(W * 0.02);
const opened = morph(morph(ink, openRadius, 'erode'), openRadius, 'dilate');
const cleaned = dropSmallRegions(opened, Math.round(W * H * 0.0024));

/**
 * Finally thicken the ring. At 16px the stroke lands on well under one pixel
 * and antialiases to pale grey — a ring that is technically correct and looks
 * like a smudge. Fattening it at source resolution is what makes it resolve to
 * solid black once downscaled.
 */
const ringMask = morph(cleaned, boldRadius, 'dilate');

const ringPixels = Buffer.alloc(W * H * 4, 0);
for (let i = 0; i < W * H; i++) if (ringMask[i]) ringPixels[i * 4 + 3] = 255;
const ring = await sharp(ringPixels, { raw: { width: W, height: H, channels: 4 } })
  .png()
  .toBuffer();
console.log(`simplified Q ring (open r=${openRadius}, bold r=${boldRadius})`);

/**
 * `maskable` icons are cropped to a circle by Android, so the artwork must sit
 * inside a "safe zone" of the middle 80%. A normal icon can use more of the
 * tile. Two sets, because using maskable padding everywhere makes the icon
 * look small on platforms that do not crop.
 */
async function tile(
  size,
  { maskable = false, source = glyph, inset = maskable ? 0.56 : 0.74 } = {},
) {
  const art = await sharp(source)
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

/**
 * Favicons, and the size at which the mark switches.
 *
 * Google's guidance is to serve something LARGER than 48x48 — it renders the
 * icon beside the result on high-density screens, and a 32px source is upscaled
 * into mush. So 96 exists for Google and carries the full mark, church and all.
 *
 * 48 and below carry the simplified ring. A browser picks its tab icon from
 * these by device pixels — 16 at 1x, 32 at 2x, 48 at 3x — so this split has the
 * useful property that a tab shows the clean Q on every screen while search
 * results and app icons show the real logo. The mark never changes within one
 * context, only between contexts that render at very different sizes.
 *
 * Favicons use more of the tile than the app icons do: nothing crops them, so
 * the padding an Android launcher needs is only wasted resolution here.
 */
const RING_MAX = 48;
const faviconArt = (size) => (size <= RING_MAX ? { source: ring, inset: 0.94 } : { inset: 0.86 });

for (const size of [32, 48, 96]) {
  await (await tile(size, faviconArt(size))).toFile(`${OUT}/favicon-${size}.png`);
  console.log(`favicon-${size}.png${size <= RING_MAX ? ' (ring)' : ' (full mark)'}`);
}

/**
 * `/favicon.ico` at the document root.
 *
 * The <link rel="icon"> tags below cover every modern browser, so this exists
 * for the clients that never read the HTML: crawlers, feed readers and chat
 * previews request /favicon.ico blindly and take a 404 as "no icon". It was
 * 404ing here.
 *
 * Written by hand rather than pulling in a converter. An .ico is a 6-byte
 * header, one 16-byte directory entry per image, then the images — and since
 * Vista those images may be PNGs verbatim, which is what every current browser
 * and Googlebot read. So the whole format is a bit of pointer arithmetic over
 * PNGs sharp has already produced.
 */
const icoSizes = [16, 32, 48];
const icoImages = await Promise.all(
  icoSizes.map(async (size) => (await tile(size, faviconArt(size))).toBuffer()),
);

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // 1 = icon (2 would be a cursor)
header.writeUInt16LE(icoSizes.length, 4);

const directory = Buffer.alloc(16 * icoSizes.length);
let offset = header.length + directory.length;

icoSizes.forEach((size, i) => {
  const entry = i * 16;
  // 0 means 256 in this byte; none of our sizes hit that, but the cast is the
  // reason the field is a single byte and worth not tripping over later.
  directory.writeUInt8(size % 256, entry);
  directory.writeUInt8(size % 256, entry + 1);
  directory.writeUInt8(0, entry + 2); // palette size: 0 for truecolour
  directory.writeUInt8(0, entry + 3); // reserved
  directory.writeUInt16LE(1, entry + 4); // colour planes
  directory.writeUInt16LE(32, entry + 6); // bits per pixel
  directory.writeUInt32LE(icoImages[i].length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += icoImages[i].length;
});

await writeFile('public/favicon.ico', Buffer.concat([header, directory, ...icoImages]));
console.log(`favicon.ico (${icoSizes.join(', ')})`);
