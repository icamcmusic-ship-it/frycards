import { describe, expect, test } from 'vitest';
import { POOL } from '../game/poker/cardpool';
import { weeklyFeatured } from './weeklyFeatured';

describe('weeklyFeatured (Q19)', () => {
  test('stable within a week, a Leader and a Location', () => {
    const a = weeklyFeatured(POOL, '2026-W41');
    expect(weeklyFeatured(POOL, '2026-W41')).toEqual(a);
    expect(a.leader?.type).toBe('Leader');
    expect(a.location?.type).toBe('Location');
  });
  test('rotates across weeks', () => {
    const ids = new Set(
      Array.from({ length: 12 }, (_, i) => weeklyFeatured(POOL, `2026-W${10 + i}`).leader?.id),
    );
    expect(ids.size).toBeGreaterThan(3);
  });
  test('empty pool is safe', () => {
    expect(weeklyFeatured([], '2026-W41').leader).toBeUndefined();
  });
});
