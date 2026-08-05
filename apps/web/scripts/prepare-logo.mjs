/**
 * Derive the small "mark" wordmark from the supplied artwork.
 *
 *   pnpm --filter @qa-ulew/web brand:logo
 *
 * Two variants ship:
 *
 *   logo-full-*   the artwork exactly as supplied — tagline, "TV" and all.
 *                 Used in the hero, where every detail is legible.
 *   logo-mark-*   the same mark with the tagline and the "TV" removed. Used in
 *                 the header and footer, where both collapse into illegible
 *                 specks. Everything that still reads at that size is kept:
 *                 the church inside the Q, the founding date, the diamonds on
 *                 the U and E, the wheat on the W.
 *
 * Both erase rectangles were MEASURED from the artwork's alpha channel, not
 * guessed:
 *
 *   tagline  ink below y=492 on the right side belongs only to the tagline;
 *            the Q's descending tail stays left of x=515.
 *   TV       a column scan found zero ink at x=1072..1078, a clean gutter
 *            between the W and the TV, so everything right of it is the TV.
 *
 * A vector original from the designer would make this unnecessary and would
 * also fix the pixelation visible when zooming. Tracing the raster was tried
 * and rejected: settings small enough to beat the PNG erase the thin bars of
 * the L and E, and settings that keep them produce a far larger file.
 */
import sharp from 'sharp';

const SRC = '../../assets/brand';
const OUT = 'src/assets/brand';

/** Regions to clear for the small mark. */
const ERASE = [
  { name: 'tagline', left: 520, top: 492, width: 621, height: 71 },
  { name: 'tv', left: 1076, top: 0, width: 65, height: 300 },
];

/**
 * Tight bounding box of everything still visible.
 *
 * `sharp.trim()` is not used: it silently left the full 1141x563 canvas in
 * place, so the mark kept ~70px of dead space where the "TV" had been and
 * rendered smaller than its box at any given height. Measuring the alpha
 * channel directly is unambiguous.
 */
async function inkBounds(buffer) {
  const { data, info } = await sharp(buffer)
    .ensureAlpha()
    .extractChannel(3)
    .raw()
    .toBuffer({ resolveWithObject: true });

  let x0 = info.width;
  let y0 = info.height;
  let x1 = 0;
  let y1 = 0;

  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (data[y * info.width + x] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }

  return { left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 };
}

/** A solid rectangle; `dest-out` erases where the SOURCE is opaque. */
const cutter = ({ left, top, width, height }) => ({
  input: {
    create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 1 } },
  },
  left,
  top,
  blend: 'dest-out',
});

for (const [source, ink] of [
  ['logo_qa_ulew_black.png', 'black'],
  ['logo_qa_ulew_white.png', 'white'],
]) {
  // Full: passed through untouched so the hero shows the real artwork.
  await sharp(`${SRC}/${source}`)
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/logo-full-${ink}.png`);

  // Mark: tagline and TV removed, then cropped tight to what remains.
  const erased = await sharp(`${SRC}/${source}`)
    .ensureAlpha()
    .composite(ERASE.map(cutter))
    .png()
    .toBuffer();

  await sharp(erased)
    .extract(await inkBounds(erased))
    .png({ compressionLevel: 9 })
    .toFile(`${OUT}/logo-mark-${ink}.png`);

  for (const file of [`logo-full-${ink}.png`, `logo-mark-${ink}.png`]) {
    const m = await sharp(`${OUT}/${file}`).metadata();
    console.log(`${file.padEnd(24)} ${m.width}x${m.height}`);
  }
}
