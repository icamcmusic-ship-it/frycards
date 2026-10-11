/**
 * Audit 2026-10-11 §3.3–3.6: balance numbers and the new keywords.
 */
import { describe, expect, it } from 'vitest';
import { POOL_BY_ID, POOL_LEADERS, REPRINTS, buildCost } from './cardpool';
import { TIER_N, UNIT, bigBlindAt, MODES } from './constants';
import {
  applyInPlace,
  betOptions,
  castCost,
  chipsInPlay,
  potTotal,
  waitingOn,
  type Match,
} from './engine';
import { act, give, power, rigHand, table } from './testkit';
import { viewFor } from './view';

const clear = (m: Match) => {
  for (const s of m.seats) s.hand = [];
  return m;
};
const settle = (m: Match) => {
  for (let g = 0; g < 30; g++) {
    const w = waitingOn(m);
    if (w.kind === 'window') applyInPlace(m, { type: 'pass', seat: w.seats[0] });
    else if (w.kind === 'choice') applyInPlace(m, { type: 'choose', seat: w.seat, index: 0 });
    else break;
  }
};
/** Check/call every street down to the end of the hand. */
const checkDown = (m: Match) => {
  for (let g = 0; g < 60; g++) {
    settle(m);
    const w = waitingOn(m);
    if (w.kind !== 'bet') break;
    const o = betOptions(m, w.seat)!;
    applyInPlace(m, o.canCheck ? { type: 'check', seat: w.seat } : { type: 'call', seat: w.seat });
  }
};

describe('Soulbound and Weapons (C-3)', () => {
  it('return to hand only when the hand ends, and Soulbound costs one step more', () => {
    const m = clear(table(3));
    rigHand(m, { button: 0 });
    const plain = power({ kw: 'Foresee', n: 1 }, { id: '__f' });
    const soul = power({ kw: 'Foresee', n: 1 }, { id: '__fs', mods: [{ kw: 'Soulbound' }] });
    expect(castCost(m, 0, soul).step).toBe(castCost(m, 0, plain).step + 1);
    const uid = give(m, 0, soul);
    act(m, { type: 'cast', seat: 0, uid, costs: [] });
    settle(m);
    expect(m.seats[0].hand.some((p) => p.uid === uid)).toBe(false);
    act(m, { type: 'fold', seat: 0 }, { type: 'fold', seat: 1 });
    expect(m.hand!.done).toBe(true);
    expect(m.seats[0].hand.some((p) => p.uid === uid)).toBe(true);
  });

  it('a Weapon is back only at the end of the hand too', () => {
    const m = clear(table(3));
    rigHand(m, { button: 0 });
    const w = power({ kw: 'Foresee', n: 1 }, { id: '__w', type: 'Item', subtype: 'Weapon' });
    const uid = give(m, 0, w);
    act(m, { type: 'cast', seat: 0, uid, costs: [] });
    settle(m);
    expect(m.seats[0].hand.some((p) => p.uid === uid)).toBe(false);
    act(m, { type: 'fold', seat: 0 }, { type: 'fold', seat: 1 });
    expect(m.seats[0].hand.some((p) => p.uid === uid)).toBe(true);
  });
});

describe('formulas (F-1, F-2b)', () => {
  it('Erode grows with tier; Siphon steals 1.5× its cost', () => {
    const chips = (kw: string) => TIER_N[kw].slice(1).map((u) => u * UNIT);
    expect(chips('Erode')).toEqual([8, 16, 24, 40, 64]);
    expect(chips('Siphon')).toEqual([12, 24, 48, 72, 120]);
    expect(chips('Blessed')).toEqual([16, 32, 48, 80, 128]);
  });

  it('Blessed never refunds its own cost', () => {
    const m = clear(table(3));
    rigHand(m, { button: 0 });
    const uid = give(m, 0, power({ kw: 'Blessed', n: 2 }, { id: '__b' }));
    const before = m.seats[0].stack;
    act(m, { type: 'cast', seat: 0, uid, costs: [] });
    settle(m);
    expect(m.seats[0].stack).toBe(before - 8);
  });

  it('Tax charges at most three opponents', () => {
    const m = clear(table(6));
    rigHand(m, { button: 0 });
    const actor = m.hand!.toAct!;
    const uid = give(m, actor, power({ kw: 'Tax', n: 1 }, { id: '__tax' }));
    const before = m.seats.map((s) => s.stack);
    act(m, { type: 'cast', seat: actor, uid, costs: [] });
    settle(m);
    const paid = m.seats.filter((s, i) => i !== actor && s.stack === before[i] - 16).length;
    expect(paid).toBe(3);
  });

  it('Resonant costs one step more', () => {
    const m = clear(table(3));
    rigHand(m, { button: 0 });
    const a = power({ kw: 'Kindle', n: 1 }, { tier: 2, id: '__k' });
    const b = power({ kw: 'Kindle', n: 1 }, { tier: 2, id: '__kr', mods: [{ kw: 'Resonant' }] });
    expect(castCost(m, 0, b).step).toBe(castCost(m, 0, a).step + 1);
  });

  it('blind steps stay between ×1.48 and ×1.56', () => {
    const mode = MODES.standard;
    const bbs = Array.from({ length: 12 }, (_, l) => bigBlindAt(mode, l));
    expect(bbs.slice(0, 9)).toEqual([16, 24, 36, 54, 80, 120, 180, 270, 400]);
    for (let l = 1; l < bbs.length; l++) {
      expect(bbs[l] / bbs[l - 1]).toBeGreaterThan(1.47);
      expect(bbs[l] / bbs[l - 1]).toBeLessThan(1.57);
    }
  });

  it('Leader build abilities cost what their effect is worth, never more (C-7)', () => {
    expect(buildCost('Erode')).toBe(1);
    expect(buildCost('Mark')).toBe(0.5);
    for (const l of POOL_LEADERS) {
      const plus = l.abilities![1];
      expect(plus.chipCost ?? 0).toBeLessThanOrEqual(1);
    }
    // Legendary Diver builds with a Straddle now, not Pass.
    expect(POOL_LEADERS.find((l) => l.id === 'legendary_diver')!.abilities![1].effect.kw).toBe(
      'Straddle',
    );
  });
});

describe('new keywords (§3.6)', () => {
  it('every reprint carries its new keyword', () => {
    for (const [id, o] of Object.entries(REPRINTS)) {
      const c = POOL_BY_ID[id];
      expect(c, id).toBeDefined();
      expect(c.effect!.kw).toBe(o.effect!.kw);
      expect(c.mods!.map((x) => x.kw)).toEqual(o.mods!.map((x) => x.kw));
    }
    const kws = Object.values(POOL_BY_ID).flatMap((c) => c.keywords ?? []);
    for (const kw of ['Overbet', 'Tell', 'Boat Bonus', 'Last Stand']) expect(kws).toContain(kw);
  });

  it('Overbet lifts the pot-limit cap for the rest of the street', () => {
    const m = clear(table(3));
    rigHand(m, { button: 0 });
    const before = betOptions(m, 0)!.maxRaiseTo; // 16 + (24 + 16) = 56
    const uid = give(m, 0, power({ kw: 'Overbet', n: 1 }, { id: '__ob' }));
    act(m, { type: 'cast', seat: 0, uid, costs: [] });
    settle(m);
    const o = betOptions(m, 0)!;
    // The cast's 8 chips joined the pot: 16 + 2 × (32 + 16) = 112.
    expect(before).toBe(56);
    expect(o.maxRaiseTo).toBe(112);
    act(m, { type: 'raise', seat: 0, to: 112 });
    settle(m);
    act(m, { type: 'call', seat: 1 }, { type: 'call', seat: 2 });
    // Next street: back to the plain pot limit.
    expect(m.hand!.street).toBe('flop');
    const w = waitingOn(m) as { seat: number };
    const ob = betOptions(m, w.seat)!;
    expect(ob.maxRaiseTo).toBe(potTotal(m.hand!));
  });

  it('Tell tells only the caster the target’s hand category', () => {
    const m = clear(table(3));
    rigHand(m, { button: 0, holes: ['As Ks', 'Qh Qd', '3h 9s'] });
    const uid = give(m, 0, power({ kw: 'Tell' }, { id: '__tell', colors: ['Light'] }));
    act(m, { type: 'cast', seat: 0, uid, target: 1, costs: [] });
    settle(m);
    expect(viewFor(m, 0).log.some((l) => l.text === 'Tell: S1 holds Pair.')).toBe(true);
    expect(viewFor(m, 2).log.some((l) => l.text.startsWith('Tell:'))).toBe(false);
    expect(m.hand!.hostileHit[1]).toBe(true);
  });

  it('Boat Bonus: a full-house showdown win collects N from every other seat in', () => {
    const m = clear(table(3));
    rigHand(m, {
      button: 0,
      holes: ['As Ah', 'Kd Qc', '7c 2d'],
      deck: 'Ad Kh Ks 4c 9h',
    });
    const before = chipsInPlay(m);
    const uid = give(
      m,
      0,
      power({ kw: 'Foresee', n: 1 }, { id: '__bb', mods: [{ kw: 'Boat Bonus', n: 1 }] }),
    );
    act(m, { type: 'cast', seat: 0, uid, costs: [] });
    checkDown(m);
    const r = m.hand!.result!;
    expect(r.winners).toEqual([0]);
    expect(m.log.filter((l) => l.text.startsWith('Boat Bonus:'))).toHaveLength(2);
    expect(chipsInPlay(m)).toBe(before);
  });

  it('Last Stand: free at 10 big blinds or less', () => {
    const m = clear(table(3));
    rigHand(m, { button: 0 });
    const def = power(
      { kw: 'Kindle', n: 1 },
      { tier: 2, id: '__ls', mods: [{ kw: 'Last Stand' }] },
    );
    expect(castCost(m, 0, def).chips).toBe(16);
    m.seats[0].stack = 160;
    expect(castCost(m, 0, def).chips).toBe(0);
  });
});
