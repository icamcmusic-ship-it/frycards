/**
 * The card of the day: one card per UTC calendar day, the same for every
 * player, with no server involved. A pure function of the date string and the
 * pool, so it is stable across reloads and testable.
 */
import type { CardDef } from '../game/v3/cards';

/** FNV-1a over the date string — small, well-spread, no dependencies. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** `YYYY-MM-DD` in UTC, so the pick rolls over at the same instant everywhere. */
export function utcDayKey(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The day's card from `pool`, or undefined for an empty pool. Leaders are
 * eligible: they are cards too. Pass the pool in a stable order. */
export function cardOfTheDay(
  pool: readonly CardDef[],
  day: string = utcDayKey(),
): CardDef | undefined {
  if (pool.length === 0) return undefined;
  return pool[hash(`fry-cards:${day}`) % pool.length];
}
