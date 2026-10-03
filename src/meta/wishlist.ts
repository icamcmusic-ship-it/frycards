/**
 * A local wishlist of card ids: the cards a player is hunting for. Kept in
 * localStorage (per browser), because nothing server-side reads it — it exists
 * so the collection can filter down to "what I'm still after" and mark those
 * cards in the full-set view.
 */
export const WISHLIST_KEY = 'frycards:wishlist';

export function loadWishlist(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const parsed = JSON.parse(window.localStorage.getItem(WISHLIST_KEY) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : []);
  } catch {
    return new Set();
  }
}

export function saveWishlist(ids: ReadonlySet<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(WISHLIST_KEY, JSON.stringify([...ids]));
  } catch {
    /* storage blocked or full — the wishlist just will not persist */
  }
}

/** A new set with `id` added or removed. */
export function toggleWishlisted(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
