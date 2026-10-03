import { describe, expect, test } from 'vitest';
import type { CardDef } from '../game/v3/cards';
import { cardOfTheDay, utcDayKey } from './cardOfTheDay';

const pool = Array.from({ length: 50 }, (_, i) => ({ id: `c${i}`, name: `C${i}` }) as CardDef);

describe('cardOfTheDay', () => {
  test('is stable for a day and varies across days', () => {
    expect(cardOfTheDay(pool, '2026-09-30')).toBe(cardOfTheDay(pool, '2026-09-30'));
    const picks = new Set(
      Array.from(
        { length: 60 },
        (_, d) => cardOfTheDay(pool, `2026-10-${String(d + 1).padStart(2, '0')}`)?.id,
      ),
    );
    expect(picks.size).toBeGreaterThan(15);
  });
  test('an empty pool has no card', () => {
    expect(cardOfTheDay([], '2026-09-30')).toBeUndefined();
  });
  test('the day key is UTC', () => {
    expect(utcDayKey(new Date('2026-09-30T23:59:59Z'))).toBe('2026-09-30');
    expect(utcDayKey(new Date('2026-10-01T00:00:00Z'))).toBe('2026-10-01');
  });
});
