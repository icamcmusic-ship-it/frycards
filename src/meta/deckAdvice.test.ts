import { describe, expect, it } from 'vitest';
import type { CardDef } from '../game/v3/cards';
import {
  ARCHETYPE_PROFILES,
  CURVE_TARGETS,
  curveBucket,
  DeckEntry,
  deriveDeckAdvice,
  MAX_WORKABLE_COLORS,
  SANCTUM_BAND,
} from './deckAdvice';

function unit(id: string, cost: number, extra: Partial<CardDef> = {}): CardDef {
  return {
    id,
    name: id,
    type: 'Unit',
    cost: { generic: cost, pips: {} },
    might: 2,
    grit: 2,
    ...extra,
  };
}

const e = (card: CardDef, n: number): DeckEntry => ({ card, n });

describe('deriveDeckAdvice', () => {
  it('mirrors the sim curve buckets (1-2 / 3-4 / 5+)', () => {
    expect(curveBucket(unit('a', 1))).toBe(0);
    expect(curveBucket(unit('b', 2))).toBe(0);
    expect(curveBucket(unit('c', 3))).toBe(1);
    expect(curveBucket(unit('d', 4))).toBe(1);
    expect(curveBucket(unit('e', 5))).toBe(2);
    expect(CURVE_TARGETS).toEqual([0.4, 0.4, 0.2]);
  });

  it('flags a top-heavy curve and a missing low end', () => {
    // 60 cards all at cost 6: low bucket empty, high bucket way over 20%+10%.
    const advice = deriveDeckAdvice([e(unit('big', 6), 60)]);
    expect(advice.curve[0].status).toBe('low');
    expect(advice.curve[2].status).toBe('high');
    expect(advice.suggestions.some((s) => s.includes('1–2 cost'))).toBe(true);
    expect(advice.suggestions.some((s) => s.includes('Top-heavy'))).toBe(true);
  });

  it('accepts a deck sitting on the target curve', () => {
    const advice = deriveDeckAdvice([
      e(unit('low', 2), 24), // 40%
      e(unit('mid', 3), 24), // 40%
      e(unit('high', 5), 12), // 20%
    ]);
    expect(advice.curve.map((b) => b.status)).toEqual(['ok', 'ok', 'ok']);
  });

  it('flags a deck stretched past the 2-color Leader identity ceiling', () => {
    const advice = deriveDeckAdvice([
      e(unit('r', 2, { cost: { generic: 1, pips: { Ember: 1 } } }), 20),
      e(unit('t', 3, { cost: { generic: 2, pips: { Tide: 1 } } }), 20),
      e(unit('s', 3, { cost: { generic: 2, pips: { Shadow: 1 } } }), 20),
    ]);
    expect(advice.colors.distinct).toBe(3);
    expect(advice.colors.overstretched).toBe(true);
    expect(MAX_WORKABLE_COLORS).toBe(2);
    expect(advice.suggestions.some((s) => s.includes('Essence Types'))).toBe(true);
  });

  it('matches an aggro deck to the Aggro profile', () => {
    const advice = deriveDeckAdvice([
      e(unit('rush', 1, { keywords: ['Reckless', 'Quickstrike'] }), 24),
      e(unit('bolt', 2, { onInvoke: { action: 'damage', value: 3, target: 'anyTarget' } }), 24),
      e(unit('mid', 4), 12),
    ]);
    expect(advice.archetype?.profile.id).toBe('aggro');
    expect(ARCHETYPE_PROFILES.some((p) => p.id === 'control')).toBe(true);
  });

  it('flags a Sanctum count above the auto-builder band', () => {
    const sanctum: CardDef = {
      id: 'sanc',
      name: 'sanc',
      type: 'Location',
      subtype: 'Sanctum',
      cost: { generic: 2, pips: {} },
    };
    const advice = deriveDeckAdvice([e(sanctum, SANCTUM_BAND[1] + 7), e(unit('u', 2), 47)]);
    expect(advice.suggestions.some((s) => s.includes('Sanctums is above'))).toBe(true);
  });

  it('flags a spell count below the auto-builder floor (14, not the vestigial 8)', () => {
    // v7.8 bug hunt: the builder's literal Math.max(8, …) can never bind —
    // its real floor is DECK_SIZE − 40 units − 6 sanctums = 14. A 12-spell
    // deck must get the thin-spells suggestion.
    const charm: CardDef = {
      id: 'ch',
      name: 'ch',
      type: 'Charm',
      subtype: 'Bound',
      cost: { generic: 2, pips: {} },
    };
    const advice = deriveDeckAdvice([e(charm, 12), e(unit('u', 2), 48)]);
    expect(advice.suggestions.some((s) => s.includes('Only 12 Charms/Events'))).toBe(true);
  });

  it('stays quiet about under-band composition while the deck is half-built', () => {
    const advice = deriveDeckAdvice([e(unit('u', 2), 10)]);
    expect(advice.suggestions.some((s) => s.includes('auto-builder runs'))).toBe(false);
    expect(advice.suggestions.some((s) => s.includes('Charms/Events'))).toBe(false);
  });

  it('handles an empty deck without noise', () => {
    const advice = deriveDeckAdvice([]);
    expect(advice.curve.every((b) => b.status === 'ok')).toBe(true);
    expect(advice.archetype).toBeNull();
    expect(advice.suggestions).toEqual([]);
  });
});
