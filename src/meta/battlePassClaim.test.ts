import { describe, expect, test, vi } from 'vitest';
import { claimAllMessage, claimAllTiers, groupTiers } from './battlePassClaim';

const tiers = [5, 1, 3, 2, 4].map((tier) => ({ tier }));

describe('groupTiers', () => {
  test('splits ready / upcoming / claimed, each lowest tier first', () => {
    // 2 XP per tier: 6 XP unlocks tiers 1-3; tier 2 is already claimed.
    const g = groupTiers(tiers, 6, 2, new Set([2]));
    expect(g.ready.map((t) => t.tier)).toEqual([1, 3]);
    expect(g.upcoming.map((t) => t.tier)).toEqual([4, 5]);
    expect(g.claimed.map((t) => t.tier)).toEqual([2]);
  });

  test('a claimed tier is never ready, even when unlocked', () => {
    const g = groupTiers(tiers, 100, 2, new Set([1, 2, 3, 4, 5]));
    expect(g.ready).toEqual([]);
    expect(g.claimed).toHaveLength(5);
  });

  test('nothing is ready at zero XP', () => {
    const g = groupTiers(tiers, 0, 2, new Set());
    expect(g.ready).toEqual([]);
    expect(g.upcoming).toHaveLength(5);
  });
});

describe('claimAllTiers', () => {
  test('claims every tier in order and reports progress', async () => {
    const claim = vi.fn(async (_tier: number): Promise<string | null> => null);
    const seen: [number, number, number][] = [];
    const r = await claimAllTiers([1, 2, 3], claim, (t, done, total) =>
      seen.push([t, done, total]),
    );
    expect(claim.mock.calls.map((c) => c[0])).toEqual([1, 2, 3]);
    expect(r).toEqual({ claimed: [1, 2, 3], failed: null, total: 3 });
    expect(seen).toEqual([
      [1, 1, 3],
      [2, 2, 3],
      [3, 3, 3],
    ]);
  });

  test('stops at the first failure and does not call the rest', async () => {
    const claim = vi.fn(async (t: number) => (t === 2 ? 'Tier not unlocked' : null));
    const r = await claimAllTiers([1, 2, 3, 4], claim);
    expect(claim).toHaveBeenCalledTimes(2);
    expect(r.claimed).toEqual([1]);
    expect(r.failed).toEqual({ tier: 2, error: 'Tier not unlocked' });
    expect(claimAllMessage(r)).toBe('Claimed 1 of 4 before stopping at tier 2: Tier not unlocked');
  });

  test('a rejected call is a failure, not an unhandled rejection', async () => {
    const claim = vi.fn(async (t: number) => {
      if (t === 1) throw new Error('offline');
      return null;
    });
    const r = await claimAllTiers([1, 2], claim);
    expect(r.claimed).toEqual([]);
    expect(r.failed?.tier).toBe(1);
    expect(claim).toHaveBeenCalledTimes(1);
  });

  test('success message pluralises', () => {
    expect(claimAllMessage({ claimed: [1], failed: null, total: 1 })).toBe('Claimed 1 tier.');
    expect(claimAllMessage({ claimed: [1, 2], failed: null, total: 2 })).toBe('Claimed 2 tiers.');
  });
});
