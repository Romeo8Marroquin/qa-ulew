/**
 * Generate the social share image.
 *
 *   pnpm --filter @qa-ulew/web brand:og
 *
 * This is the card WhatsApp, Messenger, Facebook, X, LinkedIn, Slack, Discord
 * and Telegram render when someone pastes a link. It is very often the first
 * thing anyone sees of the channel, so it uses the mark exactly as the brand
 * presents it: the black wordmark on white.
 *
 * 1200x630 — the size every one of those platforms crops toward. Going smaller
 * gets upscaled and blurry; going larger just wastes bytes.
 *
 * The mark is inset generously. Several platforms crop the card to different
 * aspect ratios (X uses 2:1, WhatsApp shows a near-square thumbnail in some
 * layouts), and anything close to the edge is the first thing to be cut off.
 * Keeping the artwork inside the middle ~62% survives every crop in use.
 */
import { mkdir } from 'node:fs/promises';
import sharp from 'sharp';

const W = 1200;
const H = 630;
const OUT = 'public';

await mkdir(OUT, { recursive: true });

const logo = await sharp('src/assets/brand/logo-full-black.png')
  .resize({ width: Math.round(W * 0.62), fit: 'inside', kernel: 'lanczos3' })
  .toBuffer();

const { width, height } = await sharp(logo).metadata();
if (!width || !height) throw new Error('could not measure the resized logo');

await sharp({
  create: { width: W, height: H, channels: 4, background: '#ffffff' },
})
  .composite([
    {
      input: logo,
      left: Math.round((W - width) / 2),
      // Optically centred: sitting it on the exact middle looks low, because
      // the mark's descender (the Q's tail) carries visual weight downward.
      top: Math.round((H - height) / 2) - 12,
    },
  ])
  // PNG rather than JPEG: the artwork is flat line work, where JPEG leaves
  // visible ringing around the strokes and saves nothing at this size.
  .png({ compressionLevel: 9 })
  .toFile(`${OUT}/og-default.png`);

const meta = await sharp(`${OUT}/og-default.png`).metadata();
console.log(`og-default.png  ${meta.width}x${meta.height}`);
