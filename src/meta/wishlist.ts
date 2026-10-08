/**
 * The wishlist of card ids: the cards a player is hunting for.
 *
 * For a signed-in player the SERVER (`player_wishlist`, own-rows RLS) is the
 * source of truth, so it follows the account across devices. localStorage is
 * only a per-account cache that readers can use synchronously (pack-opening's
 * WISHLIST HIT badge, guests):
 *
 *  - The cache is keyed by user id (`frycards:wishlist:<uid>`; guests use
 *    `frycards:wishlist:guest`). It used to be one un-keyed list that was
 *    unioned into whichever account synced next, so on a shared browser
 *    account A's wishlist was uploaded into account B.
 *  - A sync never uploads a cache it merely finds on disk. The one thing that
 *    flows up is the account's own queued edits (the outbox below): a toggle
 *    that could not reach the server (offline, request failed) is retried on
 *    the next sync, which is also what makes removals stick -- a removal
 *    that never reached the server would otherwise be resurrected by the next
 *    pull, and a union-merge could never delete at all.
 *  - The legacy un-keyed list cannot be attributed to any account, so it is
 *    never uploaded. A one-time migration (behind `frycards:wishlist-migrated`)
 *    moves it to the guest slot, which is the only owner it can safely be
 *    given, and deletes the old key. Accounts that visited the Collection since
 *    the server list shipped (2026-10-07) already have those entries
 *    server-side; the rest start from their server list.
 */
import { supabase } from '../lib/supabase';

/** The pre-2026-10-08 un-keyed key. Only read by the one-time migration. */
export const LEGACY_WISHLIST_KEY = 'frycards:wishlist';
export const WISHLIST_MIGRATED_KEY = 'frycards:wishlist-migrated';

/** localStorage key for one owner's wishlist cache (no uid = guest). */
export function wishlistKey(userId?: string | null): string {
  return `frycards:wishlist:${userId || 'guest'}`;
}
function pendingKey(userId: string): string {
  return `frycards:wishlist-pending:${userId}`;
}

function readIds(key: string): string[] | null {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** Move the legacy un-keyed list into the guest slot, once. Idempotent and
 * safe to call from every reader. */
export function migrateLegacyWishlist(): void {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage.getItem(WISHLIST_MIGRATED_KEY)) return;
    const legacy = readIds(LEGACY_WISHLIST_KEY);
    if (legacy && legacy.length > 0 && readIds(wishlistKey(null)) === null) {
      window.localStorage.setItem(wishlistKey(null), JSON.stringify(legacy));
    }
    window.localStorage.removeItem(LEGACY_WISHLIST_KEY);
    window.localStorage.setItem(WISHLIST_MIGRATED_KEY, '1');
  } catch {
    /* storage blocked -- nothing to migrate and nothing to protect */
  }
}

export function loadWishlist(userId?: string | null): Set<string> {
  if (typeof window === 'undefined') return new Set();
  migrateLegacyWishlist();
  return new Set(readIds(wishlistKey(userId)) ?? []);
}

export function saveWishlist(ids: ReadonlySet<string>, userId?: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(wishlistKey(userId), JSON.stringify([...ids]));
  } catch {
    /* storage blocked or full -- the wishlist just will not persist */
  }
}

/** A new set with `id` added or removed. */
export function toggleWishlisted(ids: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(ids);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

// ---- outbox: this account's edits the server has not acknowledged yet -------

export interface PendingWishlistOps {
  add: string[];
  remove: string[];
}

/** The outbox after one more toggle. A later edit of the same card replaces
 * the earlier one (add then remove = remove), so the two lists never overlap. */
export function queueWishlistOp(
  pending: PendingWishlistOps,
  cardId: string,
  wished: boolean,
): PendingWishlistOps {
  const add = pending.add.filter((id) => id !== cardId);
  const remove = pending.remove.filter((id) => id !== cardId);
  (wished ? add : remove).push(cardId);
  return { add, remove };
}

/** `ids` with the outbox applied on top: what this account's wishlist is once
 * its queued edits land. */
export function applyPendingOps(ids: ReadonlySet<string>, p: PendingWishlistOps): Set<string> {
  const out = new Set(ids);
  for (const id of p.remove) out.delete(id);
  for (const id of p.add) out.add(id);
  return out;
}

function loadPending(userId: string): PendingWishlistOps {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(pendingKey(userId)) ?? 'null');
    const strs = (v: unknown) =>
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
    return { add: strs(parsed?.add), remove: strs(parsed?.remove) };
  } catch {
    return { add: [], remove: [] };
  }
}
function savePending(userId: string, p: PendingWishlistOps): void {
  try {
    if (p.add.length === 0 && p.remove.length === 0)
      window.localStorage.removeItem(pendingKey(userId));
    else window.localStorage.setItem(pendingKey(userId), JSON.stringify(p));
  } catch {
    /* an unsaved outbox only costs a retry after a reload */
  }
}

// Flushes run one at a time: an add and a later remove of the same card are
// two requests, and if they overtook each other the server would end up with
// the card the player just removed.
let flushChain: Promise<unknown> = Promise.resolve();

/** Send the outbox to the server. Resolves true when it is empty afterwards. */
export function flushWishlistOutbox(userId: string): Promise<boolean> {
  const run = flushChain.then(() => doFlush(userId));
  flushChain = run.catch(() => {});
  return run;
}

async function doFlush(userId: string): Promise<boolean> {
  const sent = loadPending(userId);
  if (sent.add.length === 0 && sent.remove.length === 0) return true;
  try {
    if (sent.add.length > 0) {
      const { error } = await supabase.from('player_wishlist').upsert(
        sent.add.map((card_id) => ({ user_id: userId, card_id })),
        { ignoreDuplicates: true },
      );
      if (error) return false;
    }
    if (sent.remove.length > 0) {
      const { error } = await supabase
        .from('player_wishlist')
        .delete()
        .eq('user_id', userId)
        .in('card_id', sent.remove);
      if (error) return false;
    }
  } catch {
    return false;
  }
  // Drop only what was acknowledged: the player may have toggled again while
  // the request was in flight, and that newer edit must stay queued.
  const now = loadPending(userId);
  const left = {
    add: now.add.filter((id) => !sent.add.includes(id)),
    remove: now.remove.filter((id) => !sent.remove.includes(id)),
  };
  savePending(userId, left);
  return left.add.length === 0 && left.remove.length === 0;
}

/** Make the account's wishlist match the server: send any queued edits, pull
 * the server list, apply whatever is still queued on top (so an offline edit
 * is not undone by the pull), cache and return it. If the server cannot be
 * reached the cached list is returned unchanged. */
export async function syncWishlist(userId: string): Promise<Set<string>> {
  const cached = loadWishlist(userId);
  try {
    await flushWishlistOutbox(userId);
    const { data, error } = await supabase
      .from('player_wishlist')
      .select('card_id')
      .eq('user_id', userId);
    if (error) return cached;
    const server = new Set((data ?? []).map((r: { card_id: string }) => r.card_id));
    const merged = applyPendingOps(server, loadPending(userId));
    saveWishlist(merged, userId);
    return merged;
  } catch {
    return cached;
  }
}

/** Record one toggle for the account and try to send it. The local cache has
 * already moved (the caller saves it); the outbox keeps the edit until the
 * server confirms it. */
export function pushWishlistToggle(userId: string, cardId: string, wished: boolean): Promise<void> {
  savePending(userId, queueWishlistOp(loadPending(userId), cardId, wished));
  return flushWishlistOutbox(userId).then(
    () => {},
    () => {},
  );
}
