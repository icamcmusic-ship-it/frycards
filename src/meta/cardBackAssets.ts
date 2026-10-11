/**
 * Card backs published from the repo (art/cardbacks/) to the
 * frycards-showcase Cloudflare Pages project as CardBacks/<slug>.webp, with a
 * 375px thumb at CardBacks/thumb/<slug>.webp.
 *
 * The app also ships a copy of each under public/cardbacks/ (plain static
 * files next to index.html, not in the JS bundle). Until the showcase-art
 * workflow has deployed a back — it needs Cloudflare secrets — the Pages URL
 * 404s and every renderer falls back to that bundled copy, so a back works the
 * moment its shop_items row exists.
 */
const CARDBACK_RE = /^https:\/\/frycards-[a-z0-9-]+\.pages\.dev\/CardBacks\/([a-z0-9-]+)\.webp$/;

/** Widest box (CSS px) the 375px thumb is used for. */
const THUMB_MAX_BOX = 240;

export function cardBackSlug(url: string | null | undefined): string | null {
  return url ? (CARDBACK_RE.exec(url)?.[1] ?? null) : null;
}

function appBase(): string {
  const raw = typeof import.meta.env === 'undefined' ? '/' : (import.meta.env.BASE_URL ?? '/');
  return String(raw).endsWith('/') ? String(raw) : `${raw}/`;
}

/** The copy shipped with the app, or null when `url` isn't a repo card back. */
export function bundledCardBack(url: string | null | undefined, thumb = false): string | null {
  const slug = cardBackSlug(url);
  return slug ? `${appBase()}cardbacks/${thumb ? 'thumb/' : ''}${slug}.webp` : null;
}

/** Ordered sources for a repo card back drawn `boxWidth` CSS px wide: the
 * Cloudflare copy, then the bundled one. Null for any other URL. */
export function cardBackSources(url: string, boxWidth?: number): string[] | null {
  const slug = cardBackSlug(url);
  if (!slug) return null;
  const thumb = boxWidth != null && boxWidth <= THUMB_MAX_BOX;
  const cf = thumb ? url.replace(/\/CardBacks\//, '/CardBacks/thumb/') : url;
  return [cf, bundledCardBack(url, thumb)!];
}
