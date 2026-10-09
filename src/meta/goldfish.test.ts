import { describe, expect, test } from 'vitest';
import {
  drawTestHand,
  isCastableInformation,
  isCastableRevive,
  powerCards,
  seededShuffle,
  simulateOpenings,
} from './goldfish';
import { POOL, POOL_BY_ID } from '../game/poker/cardpool';
import { buildDeck, deckCardIds, deckDefFromCustom } from '../game/poker/deck';
import { createMatch } from '../game/poker/engine';
import { MODES } from '../game/poker/constants';
import { rngOn } from '../game/poker/rng';
import type { CardDef } from '../game/poker/cards';

const leader = POOL_BY_ID['ethereal_sea_witch']; // Tide / Light: revive and information both legal
const deck = buildDeck(leader, MODES.standard, rngOn({ rng: 1337 }));
const ids = deckCardIds(deck);

describe('seededShuffle', () => {
  test('same seed, same order', () => {
    expect(seededShuffle(ids, 42)).toEqual(seededShuffle(ids, 42));
  });

  test('different seeds diverge', () => {
    expect(seededShuffle(ids, 42)).not.toEqual(seededShuffle(ids, 43));
  });

  test('it is a permutation, not a sample', () => {
    const shuffled = seededShuffle(ids, 7);
    expect(shuffled).toHaveLength(ids.length);
    expect([...shuffled].sort()).toEqual([...ids].sort());
  });
});

describe('drawTestHand', () => {
  test('is the opening power hand a real match deals the first seat on that seed', () => {
    for (const mode of ['quick', 'standard', 'deep'] as const) {
      const d = buildDeck(leader, MODES[mode], rngOn({ rng: 5 }));
      const list = deckCardIds(d);
      for (const seed of [1, 99, 123456]) {
        const def = deckDefFromCustom(leader.id, list, 'Test');
        const m = createMatch({
          seed,
          mode,
          seats: [
            { name: 'A', human: true, deck: def },
            { name: 'B', human: false, deck: def },
          ],
        });
        const shown = drawTestHand(list, POOL_BY_ID, seed, mode).cards.map((c) => c.id);
        expect(m.seats[0].hand.map((p) => p.def.id)).toEqual(shown);
      }
    }
  });

  test('deals the opening hand size for the format and is reproducible from its seed', () => {
    const a = drawTestHand(ids, POOL_BY_ID, 99);
    const b = drawTestHand(ids, POOL_BY_ID, 99);
    expect(a.cards).toHaveLength(MODES.standard.handStart);
    expect(a.cards.map((c) => c.id)).toEqual(b.cards.map((c) => c.id));
    expect(a.seed).toBe(99);
    expect(drawTestHand(ids, POOL_BY_ID, 99, 'quick').cards).toHaveLength(MODES.quick.handStart);
    expect(drawTestHand(ids, POOL_BY_ID, 99, 'deep').cards).toHaveLength(MODES.deep.handStart);
  });

  test('never deals the Location — only powers go in the hand', () => {
    for (let seed = 0; seed < 30; seed++) {
      expect(drawTestHand(ids, POOL_BY_ID, seed).cards.every((c) => c.type !== 'Location')).toBe(
        true,
      );
    }
    expect(powerCards(ids, POOL_BY_ID)).toHaveLength(MODES.standard.powers);
  });

  test('reports the average tier and Units of the hand it actually dealt', () => {
    const hand = drawTestHand(ids, POOL_BY_ID, 5);
    const manual = hand.cards.reduce((s, c) => s + (c.tier ?? 0), 0) / hand.cards.length;
    expect(hand.averageTier).toBeCloseTo(manual, 2);
    expect(hand.units).toBe(hand.cards.filter((c) => c.type === 'Unit').length);
    expect(hand.noUnits).toBe(hand.units === 0);
  });

  test('an empty deck does not divide by zero', () => {
    const hand = drawTestHand([], POOL_BY_ID, 1);
    expect(hand.cards).toEqual([]);
    expect(hand.averageTier).toBe(0);
    expect(hand.noUnits).toBe(true);
  });

  test('unknown card ids are dropped rather than crashing', () => {
    const hand = drawTestHand(['not_a_card', ...ids], POOL_BY_ID, 3);
    expect(hand.cards.every((c) => !!c)).toBe(true);
  });
});

describe('castable revive / information', () => {
  test('a revive keyword counts only below the second-cost tier', () => {
    const redraw = (tier: number): CardDef => ({
      id: 'r',
      name: 'r',
      type: 'Event',
      colors: [],
      tier,
      effect: { kw: 'Redraw' },
    });
    expect(isCastableRevive(redraw(2))).toBe(true);
    expect(isCastableRevive(redraw(4))).toBe(false);
    expect(isCastableInformation(redraw(2))).toBe(false);
  });
});

describe('simulateOpenings', () => {
  test('is pure and seeded', () => {
    const a = simulateOpenings(ids, POOL_BY_ID, 'standard', { trials: 200, seed: 9 });
    const b = simulateOpenings(ids, POOL_BY_ID, 'standard', { trials: 200, seed: 9 });
    expect(a).toEqual(b);
  });

  test('odds only grow hand over hand, and cards seen follow the format', () => {
    const s = simulateOpenings(ids, POOL_BY_ID, 'standard', { trials: 300, hands: 5 });
    expect(s.byHand.map((h) => h.seen)).toEqual([4, 5, 6, 7, 8]);
    for (let i = 1; i < s.byHand.length; i++) {
      expect(s.byHand[i].revive).toBeGreaterThanOrEqual(s.byHand[i - 1].revive);
      expect(s.byHand[i].information).toBeGreaterThanOrEqual(s.byHand[i - 1].information);
      expect(s.byHand[i].unit).toBeGreaterThanOrEqual(s.byHand[i - 1].unit);
    }
    expect(s.byHand[0].unit).toBe(s.openingWithUnit);
    expect(s.averageOpeningTier).toBeGreaterThanOrEqual(1);
    expect(s.averageOpeningTier).toBeLessThanOrEqual(5);
  });

  test('a deck of nothing but Units always opens with one', () => {
    const units = POOL.filter((c) => c.type === 'Unit')
      .slice(0, 12)
      .flatMap((c) => [c.id, c.id]);
    const s = simulateOpenings(units, POOL_BY_ID, 'standard', { trials: 50 });
    expect(s.openingWithUnit).toBe(1);
  });

  test('a deck with no revive power never finds one', () => {
    const noRevive = powerCards(ids, POOL_BY_ID)
      .filter((c) => !isCastableRevive(c))
      .map((c) => c.id);
    const s = simulateOpenings(noRevive, POOL_BY_ID, 'standard', { trials: 50 });
    expect(s.byHand.every((h) => h.revive === 0)).toBe(true);
  });

  test('an empty deck returns zeros', () => {
    const s = simulateOpenings([], POOL_BY_ID, 'quick');
    expect(s.openingWithUnit).toBe(0);
    expect(s.byHand.every((h) => h.seen === 0 && h.unit === 0)).toBe(true);
  });
});
