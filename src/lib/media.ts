/**
 * Storage media sizing — the project's cached-egress governor.
 *
 * v1 of this file rewrote public storage URLs onto Supabase's image
 * transformation endpoint (`/storage/v1/render/image/...`) so a card box got
 * a resized derivative instead of the multi-megabyte original. That worked
 * for egress, but transformation is billed per DISTINCT ORIGIN IMAGE touched
 * in the billing period — not per request and not per size variant — so
 * browsing the ~300-card catalog touches essentially the whole bucket once a
 * month and maxes the transformation quota by itself. Routing traffic through
 * that endpoint traded one billing ceiling for a worse one.
 *
 * The real fix is at the source: `scripts/reencode-card-art.ts` shrinks the
 * stored originals themselves (capped at 1024px, re-encoded to WebP), so the
 * object storage already serves small files with no transformation involved.
 * Once that has been run, this file has nothing left to do — `mediaUrl()` is
 * an identity function, kept (rather than deleted) so `CardArt` / `SafeImage`
 * don't need to change their call sites again if a future need for
 * server-side resizing comes back with a quota that can actually take it.
 *
 * `isVideoSrc()` is unrelated to the transform question — it identifies
 * `.mp4`/`.webm`/`.mov` art so video isn't fed to an `<img>`, and stays real.
 */

/** True when `url` points at a video file rather than a still image — kept in
 * sync with CardFaceV4's isVideoSrc, since Full-Art/Mythic cards print .mp4
 * art. */
export function isVideoSrc(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
}

/**
 * The untransformed original for `url`. A no-op today (see file header) —
 * kept so callers that fall back to "the original" on a load error keep
 * working unchanged if resizing is reintroduced.
 */
export function originalMediaUrl(url: string): string {
  return url;
}

/**
 * Returns `url` unchanged. See file header: routing card art through the
 * storage image transformation endpoint is what maxed out the transformation
 * quota, so this no longer rewrites anything — sizing is handled once, at
 * upload time, by `scripts/reencode-card-art.ts`.
 */
export function mediaUrl(url: string | null | undefined, _boxWidth?: number): string | null {
  return url ?? null;
}
