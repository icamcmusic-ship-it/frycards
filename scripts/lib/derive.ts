/**
 * The image encoding rules shared by the art pipeline and its tests.
 *
 * These live apart from `scripts/migrate-art.ts` because that script is a
 * top-level-await CLI — importing it to test anything would run it. Keeping
 * the sharp calls here means the sizing logic can be exercised against real
 * pixels instead of asserted against source text.
 */
import sharp from 'sharp';
import { WIDTH_LADDER } from '../../src/lib/media';

/** Width the stored master is capped at, in pixels.
 *
 * Nothing in the app ever requests more: WIDTH_LADDER tops out at 960, which
 * is a 480 CSS px box on a 2x screen, and no image is presented wider than
 * that. A 4K generator PNG is therefore ~40x the pixels anything will ever ask
 * for, and it costs that on the storage line every month forever.
 *
 * 1200 rather than exactly 960 buys one rung of headroom — a future 1200
 * ladder entry would not need every card re-ingested — at about 1.5x the bytes
 * of a 960 master, which on a ~130 kB file is noise.
 *
 * This is the display master, not an archival one. Keep full-resolution
 * originals off-platform if you may ever reprint or re-crop them.
 */
export const MASTER_WIDTH = 1200;

/** Master quality, a little above the derivatives': this is the fallback the
 * app paints when a rung 404s, and the source any future re-derive comes
 * from, so it should not be the first thing to show compression. */
export const MASTER_QUALITY = 78;

/** WebP quality for the derivatives. 62 is visually indistinguishable at card
 * scale and roughly half the bytes of the 80 most encoders default to. */
export const DERIVED_QUALITY = 62;

/** Encode `source` down to the display master: at most MASTER_WIDTH wide,
 * webp, never upscaled. */
export async function masterBytes(source: string | Buffer): Promise<Buffer> {
  return sharp(source)
    .resize({ width: MASTER_WIDTH, withoutEnlargement: true })
    .webp({ quality: MASTER_QUALITY })
    .toBuffer();
}

/** Encode `source` at one ladder rung. A rung wider than the source is
 * produced at the source's own width rather than upscaled — but it is still
 * produced, because the app picks a rung without knowing any source's
 * dimensions and a missing object 404s into the full-size fallback. */
export async function derivedBytes(source: string | Buffer, width: number): Promise<Buffer> {
  return sharp(source)
    .resize({ width, withoutEnlargement: true })
    .webp({ quality: DERIVED_QUALITY })
    .toBuffer();
}

/** Every ladder rung for one source, in ladder order. */
export async function allRungs(
  source: string | Buffer,
): Promise<{ width: number; body: Buffer }[]> {
  const out: { width: number; body: Buffer }[] = [];
  for (const width of WIDTH_LADDER) {
    out.push({ width, body: await derivedBytes(source, width) });
  }
  return out;
}
