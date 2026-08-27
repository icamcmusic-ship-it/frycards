import { describe, expect, test } from 'vitest';
import { checkProducibleColors, drawTestHand, seededShuffle } from './goldfish';
import { POOL_BY_ID, POOL_LEADERS } from '../game/v3/cardpool';
import { buildDeck, randomArchetype } from '../game/v3/decks';
import { mulberry32 } from '../game/v3/engine';
import { LEADER_COLORS } from '../game/v3/colors';

const deck = buildDeck(randomArchetype(mulberry32(1337)));

describe('seededShuffle', () => {
  test('same seed, same order', () => {
    expect(seededShuffle(deck.cards, 42)).toEqual(seededShuffle(deck.cards, 42));
  });

  test('different seeds diverge', () => {
    expect(seededShuffle(deck.cards, 42)).not.toEqual(seededShuffle(deck.cards, 43));
  });

  test('it is a permutation, not a sample', () => {
    const shuffled = seededShuffle(deck.cards, 7);
    expect(shuffled).toHaveLength(deck.cards.length);
    expect([...shuffled].sort()).toEqual([...deck.cards].sort());
  });
});

describe('drawTestHand', () => {
  test('deals the opening hand size and is reproducible from its seed', () => {
    const a = drawTestHand(deck.cards, POOL_BY_ID, 99);
    const b = drawTestHand(deck.cards, POOL_BY_ID, 99);
    expect(a.cards).toHaveLength(7);
    expect(a.cards.map((c) => c.id)).toEqual(b.cards.map((c) => c.id));
    expect(a.seed).toBe(99);
  });

  test('reports the average cost of the hand it actually dealt', () => {
    const hand = drawTestHand(deck.cards, POOL_BY_ID, 5);
    const manual =
      hand.cards.reduce(
        (s, c) =>
          s +
          (c.cost
            ? c.cost.generic + Object.values(c.cost.pips).reduce((x, y) => x + (y ?? 0), 0)
            : 0),
        0,
      ) / hand.cards.length;
    expect(hand.averageCost).toBeCloseTo(manual, 2);
  });

  test('an empty deck does not divide by zero', () => {
    const hand = drawTestHand([], POOL_BY_ID, 1);
    expect(hand.cards).toEqual([]);
    expect(hand.averageCost).toBe(0);
    expect(hand.noUnits).toBe(true);
  });

  test('unknown card ids are dropped rather than crashing', () => {
    const hand = drawTestHand(['not_a_card', ...deck.cards], POOL_BY_ID, 3);
    expect(hand.cards.every((c) => !!c)).toBe(true);
  });
});

describe('checkProducibleColors', () => {
  test('an auto-built deck can produce every colour it asks for', () => {
    // buildDeck filters on colour identity, so this is the invariant the
    // warning exists to catch a violation of.
    const check = checkProducibleColors(deck.leaderId, deck.cards, POOL_BY_ID);
    expect(check.unproducible).toEqual([]);
    for (const c of LEADER_COLORS[deck.leaderId] ?? []) {
      expect(check.producible).toContain(c);
    }
  });

  test('flags a colour the deck demands but cannot produce', () => {
    const leader = POOL_LEADERS[0];
    const identity = LEADER_COLORS[leader.id] ?? [];
    // Find any card whose pips sit entirely outside this Leader's identity —
    // the shape an imported deck code could smuggle in.
    const offColor = Object.values(POOL_BY_ID).find(
      (c) =>
        c.type !== 'Leader' &&
        Object.entries(c.cost?.pips ?? {}).some(
          ([col, n]) => !!n && !identity.includes(col as never),
        ),
    );
    expect(offColor).toBeTruthy();
    const check = checkProducibleColors(leader.id, [offColor!.id], POOL_BY_ID);
    expect(check.unproducible.length).toBeGreaterThan(0);
  });

  test('a Sanctum adds its own produced colour to the producible set', () => {
    const sanctum = Object.values(POOL_BY_ID).find((c) => c.type === 'Location' && c.produces);
    expect(sanctum).toBeTruthy();
    const check = checkProducibleColors(null, [sanctum!.id], POOL_BY_ID);
    expect(check.producible).toContain(sanctum!.produces);
    expect(check.sanctums).toBe(1);
  });
});
