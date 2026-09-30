/** Regressions for the 2026-09-29 formula audit (section 3). */
import { describe, expect, test } from 'vitest';
import { gradedQuicksellPrice } from './grading';
import { curveAtOrOver, curveAtOrUnder } from '../game/v3/decks';
import { deriveDeckAdvice } from './deckAdvice';
import type { CardDef } from '../game/v3/cards';
import { slotOdds } from './packodds';
import { firstPlayerForSeed } from '../game/v3/engine';
import { newMatchSeed, winRatePct } from '../lib/utils';
import { encodeDeckCode } from './deckcode';
import type { PackType } from '../lib/supabase';

describe('F5 slab price uses exact arithmetic', () => {
  test('Rare, grade 5, TCA is 176, not 177', () => {
    expect(gradedQuicksellPrice('Rare', false, 5, 'tca')).toBe(176);
  });
});

describe('F6 curve band edges are symmetric', () => {
  test('5+ bucket reads high at 18/60 (30%) as low reads at 6/60 (10%)', () => {
    expect(curveAtOrOver(18, 60, 2)).toBe(true);
    expect(curveAtOrOver(17, 60, 2)).toBe(false);
    expect(curveAtOrUnder(6, 60, 2)).toBe(true);
    expect(curveAtOrUnder(7, 60, 2)).toBe(false);
  });
  test('deriveDeckAdvice flags exactly 18 of 60 five-plus cards as high', () => {
    const card = (id: string, cost: number): CardDef => ({
      id,
      name: id,
      type: 'Unit',
      cost: { generic: cost, pips: {} },
      might: 1,
      grit: 1,
    });
    const advice = (n5: number) =>
      deriveDeckAdvice([
        { card: card('big', 5), n: n5 },
        { card: card('small', 1), n: 60 - n5 },
      ]).curve[2].status;
    expect(advice(18)).toBe('high');
    expect(advice(17)).toBe('ok');
  });
});

describe('F7 pack odds mirror the server', () => {
  const pack = { foil_chance: 0.1 } as unknown as PackType;
  test('a Leader slot is never foil', () => {
    expect(slotOdds(pack, { slot_type: 'chase', card_type: 'Leader' }).foilChance).toBe(0);
    expect(slotOdds(pack, { slot_type: 'chase' }).foilChance).toBe(0.1);
  });
  test('a legacy slot keeps its count', () => {
    expect(slotOdds(pack, { type: 'foundation', count: 3 }).count).toBe(3);
  });
  test('the minimum-rarity floor is reported', () => {
    expect(slotOdds(pack, { slot_type: 'x', guaranteed_min_rarity: 'Rare' }).minRarity).toBe(
      'Rare',
    );
  });
});

describe('F3 seeds', () => {
  test('first player is a pure function of the seed and varies', () => {
    expect(firstPlayerForSeed(5)).toBe(firstPlayerForSeed(5));
    const seats = new Set(Array.from({ length: 50 }, (_, i) => firstPlayerForSeed(i + 1)));
    expect(seats.size).toBe(2);
  });
  test('new seeds are non-negative 31-bit integers', () => {
    for (let i = 0; i < 100; i++) {
      const s = newMatchSeed();
      expect(Number.isInteger(s)).toBe(true);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(2 ** 31);
    }
  });
});

describe('F11 win rate never overstates', () => {
  test('199/200 is 99, 1/1000 is 1, and perfect records keep their extremes', () => {
    expect(winRatePct(199, 200)).toBe(99);
    expect(winRatePct(1, 1000)).toBe(1);
    expect(winRatePct(200, 200)).toBe(100);
    expect(winRatePct(0, 50)).toBe(0);
    expect(winRatePct(0, 0)).toBe(0);
    expect(winRatePct(3, 4)).toBe(75);
  });
});

describe('F10 deck code is locale independent', () => {
  test('cards are ordered by code point', () => {
    expect(encodeDeckCode('l', ['b', 'B', 'a_b', 'ab'])).toBe('FRY1:l:B,a_b,ab,b');
  });
});

describe('pack quicksell value', () => {
  test('matches a hand calculation and lifts foil slots by the foil multiplier', async () => {
    const { expectedQuicksellValue } = await import('./packodds');
    const { quicksellPrice } = await import('./economy');
    const pack = {
      foil_chance: 0,
      slot_config: [{ slot_type: 'x', count: 2, rarity_weights: { Common: 1 } }],
    } as unknown as PackType;
    expect(expectedQuicksellValue(pack)).toBe(2 * quicksellPrice('Common', false));
    const foilPack = {
      foil_chance: 0,
      slot_config: [{ slot_type: 'foil', count: 1, rarity_weights: { Common: 1 } }],
    } as unknown as PackType;
    expect(expectedQuicksellValue(foilPack)).toBeCloseTo(quicksellPrice('Common', false) * 2.5);
  });
});
