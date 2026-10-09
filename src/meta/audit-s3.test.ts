/** Regressions for the 2026-09-29 formula audit (section 3). */
import { describe, expect, test } from 'vitest';
import { gradedQuicksellPrice } from './grading';
import { deriveDeckAdvice, TIER_TARGETS, TIER_TOLERANCE } from './deckAdvice';
import type { CardDef } from '../game/poker/cards';
import { MODES } from '../game/poker/constants';
import { slotOdds } from './packodds';
import { createMatch } from '../game/poker/engine';
import { cpuTableSetup } from '../game/poker/sim';
import { newMatchSeed, winRatePct } from '../lib/utils';
import { encodeDeckCode } from './deckcode';
import type { PackType } from '../lib/supabase';

describe('F5 slab price uses exact arithmetic', () => {
  // Foil Rare: ceil(40 x 2.5) = 100 base since the 2026-10-06 quicksell rescale.
  test('foil Rare, grade 5, TCA is 176, not 177', () => {
    expect(gradedQuicksellPrice('Rare', true, 5, 'tca')).toBe(176);
  });
});

describe('F6 tier band edges are symmetric', () => {
  // The MTG-era cost-curve buckets are gone; poker decks are judged on the
  // 1–5 tier pyramid with the same ± tolerance on both sides.
  const card = (id: string, tier: number): CardDef => ({
    id,
    name: id,
    type: 'Unit',
    colors: [],
    tier,
    effect: { kw: 'Redraw' },
  });
  const P = MODES.standard.powers;
  const curve = (n5: number) =>
    deriveDeckAdvice(
      [
        { card: card('big', 5), n: n5 },
        { card: card('small', 1), n: P - n5 },
      ],
      { mode: 'standard' },
    ).curve;
  // Smallest tier-5 count whose share sits past the band, and the one below.
  const over = Math.floor((TIER_TARGETS[4] + TIER_TOLERANCE) * P + 1e-9) + 1;
  test('the tier-5 bucket reads high one copy past the band, ok at its edge', () => {
    expect(curve(over)[4].status).toBe('high');
    expect(curve(over - 1)[4].status).toBe('ok');
  });
  test('an all-tier-1 list reads tier 1 high and the middle tiers low', () => {
    const c = curve(0);
    expect(c[0].status).toBe('high');
    expect(c[1].status).toBe('low');
    expect(c[2].status).toBe('low');
    expect(c.map((b) => b.tier)).toEqual([1, 2, 3, 4, 5]);
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
  test('the first dealer button is a pure function of the seed and varies', () => {
    const button = (seed: number) =>
      createMatch(cpuTableSetup({ seed, mode: 'quick', seats: 4 })).button;
    expect(button(5)).toBe(button(5));
    const seats = new Set(Array.from({ length: 50 }, (_, i) => button(i + 1)));
    expect(seats.size).toBe(4);
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
    expect(encodeDeckCode('l', ['b', 'B', 'a_b', 'ab'])).toBe('FRY2:standard:l:B,a_b,ab,b');
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
