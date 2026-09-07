/**
 * The pure half of `scripts/reencode-card-art.ts` — deciding what a stored
 * image should become, with no network and no filesystem, so the rules that
 * govern a destructive bucket rewrite are unit-testable.
 *
 * The bucket holds raw generator output: multi-megapixel PNGs averaging ~6 MB
 * that paint into card faces at most 240 CSS pixels wide. Re-encoding them to
 * bounded WebP is what makes the art cheap to serve *at the origin*, without
 * depending on the image transformation add-on being enabled.
 */
import sharp, { type Metadata, type Sharp } from 'sharp';

/**
 * Longest-edge ceiling, in pixels. Card art renders into at most 240 CSS px
 * (480 device px at the 2x cap in src/lib/media.ts), so 1024 is roughly a 2x
 * headroom over the largest thing the app can display — enough for a future
 * zoomed or printed view, without paying for the 4K master nobody sees.
 */
export const MAX_EDGE = 1024;

/** WebP quality. 82 is visually lossless at this scale on illustration-style
 * art; the difference from the default 80 is a rounding error in bytes and
 * buys margin on gradients, which is what this art is mostly made of. */
export const QUALITY = 82;

/**
 * Don't rewrite a file unless the new one is meaningfully smaller. Re-encoding
 * an already-small asset costs a generation of quality to save a few hundred
 * bytes, and every rewrite is a chance to break something.
 */
export const MIN_SAVING_RATIO = 0.75;

/** Extensions this script will touch. Videos and anything unrecognised are
 * left strictly alone. */
const STILL = /\.(png|jpe?g|webp)$/i;

export type Plan =
  | { action: 'skip'; reason: string }
  | {
      action: 'rewrite';
      data: Buffer;
      width: number;
      height: number;
      bytesBefore: number;
      bytesAfter: number;
    };

/** True when `key` names a still image this script is willing to re-encode. */
export function isStill(key: string): boolean {
  return STILL.test(key);
}

/**
 * Decide what to do with one stored object, and produce the replacement bytes
 * if there is one.
 *
 * Returns a `skip` plan rather than throwing for every expected non-case — a
 * video, an unreadable file, art that is already small enough — so one bad
 * object in a bucket of hundreds can never abort the run.
 */
export async function planReencode(key: string, input: Buffer): Promise<Plan> {
  if (!isStill(key)) return { action: 'skip', reason: 'not a still image' };

  let image: Sharp;
  let meta: Metadata;
  try {
    image = sharp(input, { failOn: 'error' });
    meta = await image.metadata();
  } catch {
    return { action: 'skip', reason: 'undecodable' };
  }
  if (!meta.width || !meta.height) return { action: 'skip', reason: 'no dimensions' };

  // Animated source (an animated WebP/GIF masquerading as card art) would be
  // flattened to a single frame by the resize below, silently killing the
  // animation. Leave it to the video path.
  if ((meta.pages ?? 1) > 1) return { action: 'skip', reason: 'animated' };

  const data = await image
    .rotate() // honour EXIF orientation before it is dropped with the metadata
    .resize({
      width: MAX_EDGE,
      height: MAX_EDGE,
      fit: 'inside',
      // Never upscale: a source already under the ceiling keeps its own size
      // and is only re-encoded.
      withoutEnlargement: true,
    })
    .webp({ quality: QUALITY, effort: 6 })
    .toBuffer();

  if (data.length >= input.length * MIN_SAVING_RATIO) {
    return { action: 'skip', reason: `already efficient (${pct(data.length, input.length)})` };
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(meta.width, meta.height));
  return {
    action: 'rewrite',
    data,
    width: Math.round(meta.width * scale),
    height: Math.round(meta.height * scale),
    bytesBefore: input.length,
    bytesAfter: data.length,
  };
}

function pct(after: number, before: number): string {
  return `${Math.round((after / before) * 100)}% of original`;
}

/** Human-readable byte count for the run report. */
export function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['kB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}
