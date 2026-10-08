/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, test, vi } from 'vitest';

// An in-memory player_wishlist: enough of the query builder for wishlist.ts.
// Never the live project -- the module under test only sees this fake.
const db = vi.hoisted(() => ({
  rows: [] as { user_id: string; card_id: string }[],
  /** When set, every request fails the way an offline client's does. */
  offline: false,
  calls: [] as string[],
}));

vi.mock('../lib/supabase', () => {
  const fail = { error: { message: 'offline' } };
  return {
    supabase: {
      from: () => ({
        select: () => ({
          eq: async (_c: string, uid: string) => {
            db.calls.push('select');
            return db.offline
              ? { data: null, ...fail }
              : { data: db.rows.filter((r) => r.user_id === uid), error: null };
          },
        }),
        upsert: async (rows: { user_id: string; card_id: string }[]) => {
          db.calls.push('upsert');
          if (db.offline) return fail;
          for (const r of rows)
            if (!db.rows.some((x) => x.user_id === r.user_id && x.card_id === r.card_id))
              db.rows.push(r);
          return { error: null };
        },
        delete: () => ({
          eq: (_c: string, uid: string) => ({
            in: async (_c2: string, ids: string[]) => {
              db.calls.push('delete');
              if (db.offline) return fail;
              db.rows = db.rows.filter((r) => !(r.user_id === uid && ids.includes(r.card_id)));
              return { error: null };
            },
          }),
        }),
      }),
    },
  };
});

import {
  LEGACY_WISHLIST_KEY,
  applyPendingOps,
  loadWishlist,
  pushWishlistToggle,
  queueWishlistOp,
  saveWishlist,
  syncWishlist,
  toggleWishlisted,
  wishlistKey,
} from './wishlist';

beforeEach(() => {
  localStorage.clear();
  db.rows = [];
  db.offline = false;
  db.calls = [];
});

describe('wishlist', () => {
  test('round-trips through storage', () => {
    saveWishlist(new Set(['a', 'b']), 'u1');
    expect([...loadWishlist('u1')].sort()).toEqual(['a', 'b']);
  });
  test('toggle adds then removes without mutating the input', () => {
    const start = new Set(['a']);
    const added = toggleWishlisted(start, 'b');
    expect([...added].sort()).toEqual(['a', 'b']);
    expect([...start]).toEqual(['a']);
    expect([...toggleWishlisted(added, 'a')]).toEqual(['b']);
  });
  test('corrupt or hand-edited storage yields an empty list, not a crash', () => {
    localStorage.setItem(wishlistKey('u1'), '{not json');
    expect(loadWishlist('u1').size).toBe(0);
    localStorage.setItem(wishlistKey('u1'), '{"a":1}');
    expect(loadWishlist('u1').size).toBe(0);
    localStorage.setItem(wishlistKey('u1'), JSON.stringify(['ok', 3, null]));
    expect([...loadWishlist('u1')]).toEqual(['ok']);
  });
});

describe('per-account cache (audit M3)', () => {
  test('each account and the guest have their own key', () => {
    expect(wishlistKey('u1')).toBe('frycards:wishlist:u1');
    expect(wishlistKey(null)).toBe('frycards:wishlist:guest');
    expect(wishlistKey(undefined)).toBe(wishlistKey(null));
    saveWishlist(new Set(['a']), 'u1');
    saveWishlist(new Set(['g']));
    expect([...loadWishlist('u1')]).toEqual(['a']);
    expect(loadWishlist('u2').size).toBe(0);
    expect([...loadWishlist()]).toEqual(['g']);
  });

  test("account A's wishlist never reaches account B on a shared browser", async () => {
    db.rows = [{ user_id: 'A', card_id: 'a1' }];
    await syncWishlist('A');
    expect([...loadWishlist('A')]).toEqual(['a1']);
    // B signs in on the same browser: nothing of A's is read or uploaded.
    const b = await syncWishlist('B');
    expect(b.size).toBe(0);
    expect(db.rows.filter((r) => r.user_id === 'B')).toEqual([]);
    expect(db.calls).not.toContain('upsert');
  });
});

describe('legacy un-keyed list', () => {
  test('moves to the guest slot once and is never uploaded to an account', async () => {
    localStorage.setItem(LEGACY_WISHLIST_KEY, JSON.stringify(['old1', 'old2']));
    // First read triggers the migration.
    expect([...loadWishlist()].sort()).toEqual(['old1', 'old2']);
    expect(localStorage.getItem(LEGACY_WISHLIST_KEY)).toBeNull();
    // A signed-in account that syncs afterwards does not inherit it.
    const synced = await syncWishlist('A');
    expect(synced.size).toBe(0);
    expect(db.rows).toEqual([]);
  });

  test('a legacy key that reappears after the migration is ignored', () => {
    loadWishlist();
    localStorage.setItem(LEGACY_WISHLIST_KEY, JSON.stringify(['late']));
    expect(loadWishlist().size).toBe(0);
  });

  test('does not overwrite a guest list that already exists', () => {
    saveWishlist(new Set(['mine']));
    localStorage.setItem(LEGACY_WISHLIST_KEY, JSON.stringify(['old']));
    expect([...loadWishlist()]).toEqual(['mine']);
  });
});

describe('server is the source of truth', () => {
  test('sync replaces the cache with the server list (no union)', async () => {
    saveWishlist(new Set(['stale-local']), 'A');
    db.rows = [{ user_id: 'A', card_id: 'srv' }];
    const merged = await syncWishlist('A');
    expect([...merged]).toEqual(['srv']);
    expect([...loadWishlist('A')]).toEqual(['srv']);
  });

  test('a removal made on one device sticks when another device syncs', async () => {
    db.rows = [
      { user_id: 'A', card_id: 'x' },
      { user_id: 'A', card_id: 'y' },
    ];
    // Device 1 removes x; device 2 still has it cached and then syncs.
    await pushWishlistToggle('A', 'x', false);
    saveWishlist(new Set(['x', 'y']), 'A'); // device 2's stale cache
    const d2 = await syncWishlist('A');
    expect([...d2]).toEqual(['y']);
    expect(db.rows.map((r) => r.card_id)).toEqual(['y']);
  });

  test('a removal that could not reach the server is retried, not undone', async () => {
    db.rows = [{ user_id: 'A', card_id: 'x' }];
    db.offline = true;
    await pushWishlistToggle('A', 'x', false);
    // Still offline: the pull fails and the cache is returned as-is.
    saveWishlist(new Set(), 'A');
    expect((await syncWishlist('A')).size).toBe(0);
    // Back online: the queued delete goes out first, so x does not return.
    db.offline = false;
    const after = await syncWishlist('A');
    expect(after.size).toBe(0);
    expect(db.rows).toEqual([]);
  });

  test('an add made offline is uploaded on the next sync', async () => {
    db.offline = true;
    await pushWishlistToggle('A', 'n', true);
    db.offline = false;
    const after = await syncWishlist('A');
    expect([...after]).toEqual(['n']);
    expect(db.rows).toEqual([{ user_id: 'A', card_id: 'n' }]);
  });

  test('add then remove of the same card before it is sent nets out to a remove', () => {
    const p = queueWishlistOp(queueWishlistOp({ add: [], remove: [] }, 'c', true), 'c', false);
    expect(p).toEqual({ add: [], remove: ['c'] });
    expect([...applyPendingOps(new Set(['c', 'd']), p)]).toEqual(['d']);
  });

  test('a failed pull leaves the cached list alone', async () => {
    saveWishlist(new Set(['keep']), 'A');
    db.offline = true;
    expect([...(await syncWishlist('A'))]).toEqual(['keep']);
  });
});
