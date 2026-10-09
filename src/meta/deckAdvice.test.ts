import { describe, expect, it } from 'vitest';
import type { CardDef, CardType } from '../game/poker/cards';
import type { Keyword } from '../game/poker/keywords';
import type { Color } from '../game/poker/colors';
import {
  DeckEntry,
  deriveDeckAdvice,
  MAX_WORKABLE_COLORS,
  THEMES,
  TIER_TARGETS,
} from './deckAdvice';

function power(
  id: string,
  tier: number,
  type: CardType = 'Unit',
  extra: Partial<CardDef> & { kw?: Keyword } = {},
): CardDef {
  const { kw, ...rest } = extra;
  return {
    id,
    name: id,
    type,
    colors: [],
    tier,
    effect: { kw: kw ?? 'Kindle', n: 1 },
    mods: [],
    ...rest,
  };
}

const location: CardDef = {
  id: 'loc',
  name: 'loc',
  type: 'Location',
  colors: [],
  rule: { id: 'fog' },
};

const e = (card: CardDef, n: number): DeckEntry => ({ card, n });

/** A Standard deck (24 powers) laid out on the pool's pyramid, with a
 * healthy Unit/Item/Event mix and one of each theme. */
function pyramidDeck(): DeckEntry[] {
  return [
    e(location, 1),
    // tier 1: 8 (35% of 24 = 8.4)
    e(power('u1', 1, 'Unit', { kw: 'Redraw' }), 2),
    e(power('u1b', 1, 'Unit', { kw: 'Peek' }), 2),
    e(power('i1', 1, 'Item', { kw: 'Siphon' }), 2),
    e(power('e1', 1, 'Event', { kw: 'Bulwark' }), 2),
    // tier 2: 7
    e(power('u2', 2, 'Unit'), 2),
    e(power('u2b', 2, 'Unit', { kw: 'Needle' }), 2),
    e(power('i2', 2, 'Item', { kw: 'Tax' }), 1),
    e(power('e2', 2, 'Event', { kw: 'Foresee' }), 2),
    // tier 3: 5
    e(power('u3', 3, 'Unit', { kw: 'Insurance' }), 2),
    e(power('i3', 3, 'Item', { kw: 'Toll' }), 1),
    e(power('e3', 3, 'Event', { kw: 'Exhume' }), 2),
    // tier 4: 3
    e(power('u4', 4, 'Unit'), 1),
    e(power('i4', 4, 'Item'), 2),
    // tier 5: 1
    e(power('e5', 5, 'Event', { kw: 'Wild' }), 1),
  ];
}

describe('deriveDeckAdvice', () => {
  it('measures the tier curve against the 35/28/20/12/5 pyramid', () => {
    expect(TIER_TARGETS).toEqual([0.35, 0.28, 0.2, 0.12, 0.05]);
    const advice = deriveDeckAdvice(pyramidDeck(), { mode: 'standard' });
    expect(advice.powers).toBe(24);
    expect(advice.curve.map((b) => b.count)).toEqual([8, 7, 5, 3, 1]);
    expect(advice.curve.map((b) => b.target)).toEqual([8, 7, 5, 3, 1]);
    expect(advice.curve.every((b) => b.status === 'ok')).toBe(true);
    expect(advice.suggestions).toEqual([]);
  });

  it('flags a top-heavy deck and a missing low end', () => {
    const advice = deriveDeckAdvice([e(location, 1), e(power('big', 4), 24)], {
      mode: 'standard',
    });
    expect(advice.curve[0].status).toBe('low');
    expect(advice.curve[3].status).toBe('high');
    expect(advice.suggestions.some((s) => s.includes('tier-1'))).toBe(true);
    expect(advice.suggestions.some((s) => s.startsWith('Top-heavy'))).toBe(true);
  });

  it('reports average tier and printed chip cost', () => {
    const advice = deriveDeckAdvice([e(power('a', 1), 1), e(power('b', 3), 1)]);
    expect(advice.averageTier).toBe(2);
    // Tier 1 costs ½ unit, tier 3 costs 2 → mean 1.25.
    expect(advice.averageCostUnits).toBe(1.25);
  });

  it('asks for a Location, and for only one', () => {
    const none = deriveDeckAdvice([e(power('u', 1), 4)]);
    expect(none.locations).toBe(0);
    expect(none.suggestions.some((s) => s.startsWith('No Location'))).toBe(true);
    const two = deriveDeckAdvice([e(location, 2), e(power('u', 1), 4)]);
    expect(two.suggestions.some((s) => s.includes('exactly one'))).toBe(true);
  });

  it('holds the tier-5 budget to the format', () => {
    const deck = [e(location, 1), e(power('t5', 5, 'Event'), 2), e(power('u', 1), 14)];
    const quick = deriveDeckAdvice(deck, { mode: 'quick' });
    expect(quick.tier5).toBe(2);
    expect(quick.suggestions.some((s) => s.includes('Quick allows 1'))).toBe(true);
    const standard = deriveDeckAdvice(deck, { mode: 'standard' });
    expect(standard.suggestions.some((s) => s.includes('tier-5 cards'))).toBe(false);
  });

  it('flags a Unit-only deck against the per-hand Unit cap', () => {
    const advice = deriveDeckAdvice([e(location, 1), e(power('u', 1), 24)]);
    const unit = advice.types.find((t) => t.type === 'Unit')!;
    expect(unit.status).toBe('high');
    expect(advice.suggestions.some((s) => s.includes('only 2 can be out per hand'))).toBe(true);
    expect(advice.suggestions.some((s) => s.startsWith('No Items'))).toBe(true);
    expect(advice.suggestions.some((s) => s.includes('Events'))).toBe(true);
  });

  it('flags off-colour cards against the Leader, and a third colour without one', () => {
    const colored = (id: string, c: Color) => power(id, 1, 'Unit', { colors: [c] });
    const deck = [
      e(colored('r', 'Ember'), 4),
      e(colored('t', 'Tide'), 4),
      e(colored('s', 'Shadow'), 4),
    ];
    const loose = deriveDeckAdvice(deck);
    expect(loose.colors.distinct).toBe(3);
    expect(loose.colors.overstretched).toBe(true);
    expect(MAX_WORKABLE_COLORS).toBe(2);
    expect(loose.suggestions.some((s) => s.includes('3 colours'))).toBe(true);
    const led = deriveDeckAdvice(deck, { identity: ['Ember', 'Tide'] });
    expect(led.colors.offColour).toBe(4);
    expect(led.suggestions.some((s) => s.includes("outside the Leader's colours"))).toBe(true);
  });

  it('counts the effect themes and names a missing one on a full deck', () => {
    expect(THEMES.map((t) => t.id)).toEqual(['information', 'revive', 'economy', 'defence']);
    const advice = deriveDeckAdvice(
      [
        e(location, 1),
        e(power('a', 1, 'Unit', { kw: 'Kindle' }), 8),
        e(power('b', 2, 'Item', { kw: 'Bulwark' }), 6),
        e(power('c', 1, 'Event', { kw: 'Peek' }), 6),
        e(power('d', 3, 'Unit', { kw: 'Siphon' }), 4),
      ],
      { mode: 'standard', identity: ['Light', 'Tide'] },
    );
    const count = (id: string) => advice.themes.find((t) => t.theme.id === id)!.count;
    expect(count('economy')).toBe(12);
    expect(count('defence')).toBe(6);
    expect(count('information')).toBe(6);
    expect(count('revive')).toBe(0);
    expect(advice.suggestions.some((s) => s.startsWith('No revive powers'))).toBe(true);
    expect(advice.distinctEffects).toBe(4);
  });

  it('explains that information is Light-only for a Leader without Light', () => {
    const advice = deriveDeckAdvice(
      [e(location, 1), e(power('a', 1, 'Unit', { kw: 'Redraw' }), 24)],
      {
        identity: ['Ember', 'Void'],
      },
    );
    expect(advice.suggestions.some((s) => s.includes('Light-only'))).toBe(true);
    expect(advice.suggestions.some((s) => s.includes('different effect'))).toBe(true);
  });

  it('stays quiet about the mix while the deck is half-built', () => {
    const advice = deriveDeckAdvice([e(location, 1), e(power('u', 4), 5)]);
    expect(advice.curve.every((b) => b.status === 'ok')).toBe(true);
    expect(advice.types.every((t) => t.status === 'ok')).toBe(true);
    expect(advice.suggestions).toEqual([]);
  });

  it('handles an empty deck without noise', () => {
    const advice = deriveDeckAdvice([]);
    expect(advice.curve.every((b) => b.status === 'ok')).toBe(true);
    expect(advice.averageTier).toBe(0);
    expect(advice.suggestions).toEqual([]);
  });
});
