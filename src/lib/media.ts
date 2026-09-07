/**
 * Storage media sizing — the project's cached-egress governor.
 *
 * The card art in the `Card Images` bucket is raw generator output: ~150 PNGs
 * averaging ~6 MB (up to 11 MB) plus webp masters around 700 kB. Every one of
 * them was being served byte-for-byte out of the storage CDN into a box that
 * is at most 240 CSS px wide, so a single browse session could pull hundreds
 * of megabytes of cached egress to paint thumbnails.
 *
 * `mediaUrl()` rewrites a public storage object URL onto Supabase's image
 * transformation endpoint, asking for a width that matches the box the image
 * actually renders into. A 6 MB 4K PNG comes back as a ~40-90 kB WebP — a
 * 50-150x cut — and the derivative is itself CDN-cached, so the saving is
 * permanent rather than per-request.
 *
 * Two deliberate properties:
 *
 * - **Ladder, not exact widths.** Requests snap to a short list of widths so
 *   every card at a given tier shares one cached derivative. Passing the exact
 *   layout width would mint a separate origin transformation per pixel size.
 * - **Never fatal.** If the transformation endpoint is unavailable (it is a
 *   paid add-on and can be switched off on the project), callers fall back to
 *   the untransformed URL via `originalMediaUrl()` rather than showing a
 *   broken image. Enabling or disabling the add-on changes cost, never
 *   correctness.
 *
 * Videos are passed through untouched — the endpoint only transforms stills,
 * and video bytes are already gated behind visibility (see VisibleVideo).
 */

/** Public object path marker in a Supabase storage URL. */
const OBJECT_PATH = '/storage/v1/object/public/';
const RENDER_PATH = '/storage/v1/render/image/public/';

/** Shared widths, in device pixels. Keeping the set small is what makes the
 * derivatives cache-friendly; every card face lands on one of these. */
const WIDTH_LADDER = [160, 320, 480, 640, 960] as const;

/** WebP quality. 62 is visually indistinguishable at card scale and roughly
 * half the bytes of the endpoint's default 80. */
const QUALITY = 62;

/** Cap the device-pixel multiplier. A 3x phone gains nothing visible over 2x
 * on art this small, and would cost 2.25x the bytes. */
const MAX_DPR = 2;

/** True when `url` points at a video file rather than a still image — kept in
 * sync with CardFaceV4's isVideoSrc, since Full-Art/Mythic cards print .mp4
 * art. */
export function isVideoSrc(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
}

/** True when `url` is a transformed (render/image) storage URL. */
export function isTransformedUrl(url: string): boolean {
  return url.includes(RENDER_PATH);
}

/**
 * The untransformed original for `url`. Safe to call on any URL: one that was
 * never transformed comes back unchanged. Used as the fallback when a
 * transformed request fails, so art still paints on a project without the
 * image transformation add-on.
 */
export function originalMediaUrl(url: string): string {
  if (!isTransformedUrl(url)) return url;
  const [path] = url.split('?');
  return path.replace(RENDER_PATH, OBJECT_PATH);
}

function devicePixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  return Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
}

/** Smallest ladder width that still covers `needed` device pixels. */
function ladderWidth(needed: number): number {
  return WIDTH_LADDER.find((w) => w >= needed) ?? WIDTH_LADDER[WIDTH_LADDER.length - 1];
}

/**
 * Rewrite a public storage image URL to be served at roughly `boxWidth` CSS
 * pixels instead of at full resolution.
 *
 * Returns `url` unchanged — never null — when there is nothing to do: a video,
 * a non-storage URL (a data URI, a bundled asset, an off-site avatar), an
 * already-transformed URL, or a missing `boxWidth`.
 */
export function mediaUrl(url: string | null | undefined, boxWidth?: number): string | null {
  if (!url) return null;
  if (!boxWidth || boxWidth <= 0) return url;
  if (isVideoSrc(url) || isTransformedUrl(url)) return url;
  if (!url.includes(OBJECT_PATH)) return url;
  const width = ladderWidth(Math.ceil(boxWidth * devicePixelRatio()));
  const [path, query] = url.split('?');
  const params = new URLSearchParams(query);
  params.set('width', String(width));
  params.set('resize', 'contain');
  params.set('quality', String(QUALITY));
  return `${path.replace(OBJECT_PATH, RENDER_PATH)}?${params.toString()}`;
}
