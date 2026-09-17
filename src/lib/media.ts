/**
 * Storage media sizing — the project's cached-egress governor.
 *
 * The card art is raw generator output: ~150 PNGs averaging ~6 MB (up to
 * 11 MB) plus webp masters around 700 kB. Every one of them was being served
 * byte-for-byte into a box that is at most 240 CSS px wide, so a single browse
 * session could pull hundreds of megabytes to paint thumbnails.
 *
 * The first fix routed those URLs through Supabase's image transformation
 * endpoint. That endpoint is a paid add-on, and it is **not enabled on this
 * project** — so every card face was requesting a derivative, getting an
 * error, and falling back to the full-resolution original. The rewrite cost a
 * wasted round trip per image and saved nothing.
 *
 * So the resizing happens ahead of time instead. `scripts/migrate-art.ts`
 * generates a webp at each ladder width and uploads it alongside the original,
 * and `mediaUrl()` points at those static objects. Same saving as an on-demand
 * transformation, no add-on, no per-transformation cost.
 *
 * Because the derivatives are ordinary objects, the host stops mattering — this
 * works anywhere that serves files over https, and `VITE_ART_BASE_URL` is what
 * points the app at it. The art stays on Supabase; that variable names the same
 * bucket the catalog already uses, and the saving comes from serving small
 * copies out of it rather than from moving anywhere. See docs/ART_MIGRATION.md,
 * which also covers moving hosts for anyone who later wants to.
 *
 * Two deliberate properties, both carried over from the transformation design:
 *
 * - **Ladder, not exact widths.** Requests snap to a short list of widths, so
 *   every card at a given tier shares one object. Generating a derivative per
 *   layout pixel size would multiply the object count for no visible gain.
 * - **Never fatal.** A derivative that fails to load falls back to the
 *   original via `originalMediaUrl()` rather than showing a broken image, so
 *   an incomplete migration degrades to "expensive but correct" instead of
 *   "blank card".
 *
 * Until the migration has run, `VITE_ART_BASE_URL` is unset, every URL still
 * points at Supabase, and `mediaUrl()` returns it untouched. That is the
 * honest behaviour for a project with no transformation add-on: no saving,
 * but no wasted request pretending at one either.
 *
 * Videos are passed through untouched — they are re-encoded once, offline, by
 * `scripts/shrink-video-art.ts`, and their bytes are already gated behind
 * visibility (see VisibleVideo).
 */

/**
 * Base URL the card art is served from, with no trailing slash — the storage
 * bucket's public base, or a CDN in front of it. Set for real deploys in
 * .github/workflows/deploy-pages.yml, since Vite inlines VITE_* at build time
 * and a Pages deploy has no server to read env from later.
 *
 * Unset — in dev, in CI, and before `scripts/migrate-art.ts` has run — every
 * URL resolves to the stored master instead. That is correct, just larger than
 * anything on screen needs.
 */
function artBase(): string {
  // Read per call rather than once at module load: this module is imported by
  // the migration script under plain node, where `import.meta.env` does not
  // exist at all, and by tests that need to vary the base.
  const raw =
    typeof import.meta.env === 'undefined' ? '' : (import.meta.env.VITE_ART_BASE_URL ?? '');
  return String(raw).replace(/\/+$/, '');
}

/** Key prefix the pre-generated derivatives live under. */
const DERIVED_PREFIX = 'derived';

/** Matches the derived key shape, `derived/<width>/<original key>.webp`. The
 * original key keeps its own extension, which is what makes the rewrite
 * reversible: `a.png` becomes `derived/320/a.png.webp`, never `a.webp`, so
 * two originals that differ only by extension cannot collide and the fallback
 * can always reconstruct the source. */
const DERIVED_RE = new RegExp(`/${DERIVED_PREFIX}/(\\d+)/(.+)\\.webp$`);

/** Shared widths, in device pixels. Keeping the set small is what makes the
 * derivatives worth generating; every card face lands on one of these.
 *
 * The 240 and 320 rungs exist because the original five left the two most
 * common card tiers paying for pixels nobody sees: `compact` (110 CSS px)
 * needs 220 device pixels and was rounded up to 320, and `standard`
 * (140 px) needs 280 and was rounded up to 480 — 2.9x the pixel area it
 * renders. Snapping them to 240 and 320 is a pure reduction with no visible
 * change, which is why it is done here rather than by lowering MAX_DPR: a
 * softer thumbnail is a real cost, and this costs nothing.
 *
 * Exported because the generator must produce exactly this set — a rung the
 * app asks for that was never generated is a 404 and a fallback to the
 * multi-megabyte original.
 */
export const WIDTH_LADDER = [160, 240, 320, 480, 640, 960] as const;

/** Cap the device-pixel multiplier. A 3x phone gains nothing visible over 2x
 * on art this small, and would cost 2.25x the bytes. */
const MAX_DPR = 2;

/** True when `url` points at a video file rather than a still image — kept in
 * sync with CardFaceV4's isVideoSrc, since Full-Art/Mythic cards print .mp4
 * art. */
export function isVideoSrc(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
}

/** True when `url` already points at a pre-generated derivative. */
export function isDerivedUrl(url: string): boolean {
  return DERIVED_RE.test(url.split('?')[0]);
}

/**
 * The full-size original for `url`. Safe to call on any URL: one that is not
 * a derivative comes back unchanged. Used as the fallback when a derivative
 * fails to load, so art still paints where the migration has not reached.
 */
export function originalMediaUrl(url: string): string {
  const [path, query] = url.split('?');
  const match = path.match(DERIVED_RE);
  if (!match) return url;
  const restored = path.replace(DERIVED_RE, `/${match[2]}`);
  return query ? `${restored}?${query}` : restored;
}

function devicePixelRatio(): number {
  if (typeof window === 'undefined') return 1;
  return Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
}

/** Smallest ladder width that still covers `needed` device pixels. */
function ladderWidth(needed: number): number {
  return WIDTH_LADDER.find((w) => w >= needed) ?? WIDTH_LADDER[WIDTH_LADDER.length - 1];
}

/** Marks a public object on Supabase storage. */
const SUPABASE_OBJECT_PATH = '/storage/v1/object/public/';

/**
 * True when `url` is a full-size original on Supabase storage — i.e. every
 * request for it is billed egress against the project's quota, and no
 * pre-generated derivative exists to serve instead.
 *
 * The app has no binary upload path: every image in the product is a URL
 * somebody pasted into a form. A pasted Supabase storage link is therefore the
 * one way new art can quietly reappear on the metered host after the migration
 * — it looks like any other link, and nothing downstream resizes it. This is
 * what the submission forms check so that it is caught at the point of entry
 * rather than discovered on a bill.
 *
 * A URL already on the configured art host is not metered, and neither is an
 * off-site link (Midjourney, an avatar service): those cost this project
 * nothing.
 */
export const METERED_ART_MESSAGE =
  'That image is on the project’s own storage, which is billed per view at ' +
  'full resolution. Link the original source instead, or add it through the ' +
  'art pipeline (npm run media:add) so a resized copy exists.';

export function isMeteredStorageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const base = artBase();
  if (base && url.startsWith(`${base}/`)) return false;
  return url.includes(SUPABASE_OBJECT_PATH);
}

/** The derived key for `key` at `width`, as both the app and the generator
 * must compute it. Exported so the generator cannot drift from the app. */
export function derivedKey(key: string, width: number): string {
  return `${DERIVED_PREFIX}/${width}/${key}.webp`;
}

/**
 * Rewrite a card-art URL to the pre-generated derivative that matches the box
 * it renders into, roughly `boxWidth` CSS pixels wide.
 *
 * Returns `url` unchanged — never null — when there is nothing to do: a video,
 * a URL that is not on the art host (a data URI, a bundled asset, an off-site
 * avatar, or the Supabase original before the migration has run), an
 * already-derived URL, or a missing `boxWidth`.
 */
export function mediaUrl(url: string | null | undefined, boxWidth?: number): string | null {
  if (!url) return null;
  if (!boxWidth || boxWidth <= 0) return url;
  if (isVideoSrc(url) || isDerivedUrl(url)) return url;
  // No art host configured yet, or an image hosted somewhere else entirely:
  // there is no derivative to point at, and inventing one would 404 into the
  // fallback path for every image on the screen.
  const base = artBase();
  if (!base || !url.startsWith(`${base}/`)) return url;
  const [path, query] = url.split('?');
  const key = path.slice(base.length + 1);
  if (!key) return url;
  const width = ladderWidth(Math.ceil(boxWidth * devicePixelRatio()));
  const derived = `${base}/${derivedKey(key, width)}`;
  return query ? `${derived}?${query}` : derived;
}
