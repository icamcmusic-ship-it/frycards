/**
 * The wishlist of card ids: the cards a player is hunting for.
 *
 * Since 2026-10 the source of truth for a signed-in player is the server
 * (`player_wishlist`, own-rows RLS), so it follows the account across
 * devices. localStorage stays as the cache every reader uses synchronously
 * (pack-opening's WISHLIST HIT badge, guests), and `syncWishlist` merges the
 * two once per Collection visit — union, so neither side loses an entry.
 */
import { supabase } from '../lib/supabase';
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

/** Merge the local cache with the server list (union), push local-only ids
 * up, store the result locally and return it. On any failure the local set is
 * returned unchanged. */
export async function syncWishlist(userId: string): Promise<Set<string>> {
  const local = loadWishlist();
  try {
    const { data, error } = await supabase
      .from('player_wishlist')
      .select('card_id')
      .eq('user_id', userId);
    if (error) return local;
    const server = new Set((data ?? []).map((r: { card_id: string }) => r.card_id));
    const up = [...local].filter((id) => !server.has(id));
    if (up.length > 0)
      await supabase.from('player_wishlist').upsert(
        up.map((card_id) => ({ user_id: userId, card_id })),
        { ignoreDuplicates: true },
      );
    const merged = new Set([...server, ...local]);
    saveWishlist(merged);
    return merged;
  } catch {
    return local;
  }
}

/** Mirror one toggle to the server (fire-and-forget; the cache already moved). */
export function pushWishlistToggle(userId: string, cardId: string, wished: boolean): void {
  const q = wished
    ? supabase
        .from('player_wishlist')
        .upsert({ user_id: userId, card_id: cardId }, { ignoreDuplicates: true })
    : supabase.from('player_wishlist').delete().eq('user_id', userId).eq('card_id', cardId);
  void Promise.resolve(q).catch(() => {});
}
