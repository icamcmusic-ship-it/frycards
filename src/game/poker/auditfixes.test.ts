/**
 * Regressions for the 2026-10-11 audit, §1 part A (engine and rules).
 */
import { describe, expect, it } from 'vitest';
import type { KwRef } from './cards';
import {
  applyInPlace,
  betOptions,
  canCast,
  canUseLeader,
  castCost,
  chipsInPlay,
  extraOptions,
  fallbackAction,
  IllegalAction,
  legalTargets,
  waitingOn,
  type Action,
  type Match,
} from './engine';
import { act, give, power, rigHand, table } from './testkit';
import { viewFor } from './view';

const clear = (m: Match) => {
  for (const s of m.seats) s.hand = [];
  return m;
};
const passAll = (m: Match) => {
  for (let w = waitingOn(m); w.kind === 'window'; w = waitingOn(m))
    applyInPlace(m, { type: 'pass', seat: w.seats[0] });
};

describe('A7 · fallbackAction', () => {
  it('is always legal: pass a window, choose a card, check or fold', () => {
    const m = clear(table(3));
    rigHand(m, { button: 0 });
    // Bet, facing the big blind: fold.
    expect(fallbackAction(m)).toEqual({ type: 'fold', seat: 0 });
    const actor = m.hand!.toAct!;
    const uid = give(m, actor, power({ kw: 'Cut' }));
    give(m, 1, power({ kw: 'Cut' }, { subtype: 'Quick', id: '__q1' }));
    applyInPlace(m, { type: 'cast', seat: actor, uid, costs: [] });
    expect(fallbackAction(m)).toEqual({ type: 'pass', seat: 1 });
    expect(fallbackAction(m, 2)).toBeNull();
    applyInPlace(m, fallbackAction(m)!);
    // Back to the bet; a redraw opens a choice.
    const r = give(m, actor, power({ kw: 'Redraw' }, { id: '__rd' }));
    m.seats[1].hand = [];
    applyInPlace(m, { type: 'cast', seat: actor, uid: r, costs: [] });
    expect(fallbackAction(m)).toEqual({ type: 'choose', seat: actor, index: 0 });
    applyInPlace(m, fallbackAction(m)!);
    act(m, { type: 'call', seat: 0 }, { type: 'call', seat: 1 });
    expect(fallbackAction(m)).toEqual({ type: 'check', seat: 2 });
  });
});

describe('A8 · one response per window', () => {
  it('a Redraw cast as a response does not let the responder answer twice', () => {
    const m = clear(table(3));
    rigHand(m, { button: 0 });
    const actor = m.hand!.toAct!;
    const [o1, o2] = [0, 1, 2].filter((i) => i !== actor);
    const slow = give(m, actor, power({ kw: 'Cut' }));
    const r1 = give(m, o1, power({ kw: 'Redraw' }, { subtype: 'Quick', id: '__qr1' }));
    const r1b = give(m, o1, power({ kw: 'Cut' }, { subtype: 'Quick', id: '__qc1' }));
    give(m, o2, power({ kw: 'Cut' }, { subtype: 'Quick', id: '__qc2' }));
    applyInPlace(m, { type: 'cast', seat: actor, uid: slow, costs: [] });
    applyInPlace(m, { type: 'cast', seat: o1, uid: r1, costs: [] });
    applyInPlace(m, { type: 'choose', seat: o1, index: 0 });
    const w = waitingOn(m);
    expect(w).toMatchObject({ kind: 'window', seats: [o2] });
    expect(canCast(m, o1, r1b).ok).toBe(false);
  });

  it('a window whose last responder chose a card closes instead of stalling', () => {
    const m = clear(table(2));
    rigHand(m, { button: 0 });
    const actor = m.hand!.toAct!;
    const o = 1 - actor;
    const slow = give(m, actor, power({ kw: 'Cut' }));
    const r = give(m, o, power({ kw: 'Redraw' }, { subtype: 'Quick', id: '__qr' }));
    applyInPlace(m, { type: 'cast', seat: actor, uid: slow, costs: [] });
    applyInPlace(m, { type: 'cast', seat: o, uid: r, costs: [] });
    applyInPlace(m, { type: 'choose', seat: o, index: 0 });
    expect(waitingOn(m)).toEqual({ kind: 'bet', seat: actor });
    expect(m.hand!.casts[0].status).toBe('resolved');
  });
});

describe('A9 · folded targets are untouchable', () => {
  const run = (def: ReturnType<typeof power>) => {
    const m = clear(table(3));
    rigHand(m, { button: 0 });
    const uid = give(m, 0, def);
    applyInPlace(m, { type: 'cast', seat: 0, uid, target: 1, costs: [] });
    passAll(m);
    act(m, { type: 'call', seat: 0 });
    const before = m.seats[1].stack;
    act(m, { type: 'fold', seat: 1 }, { type: 'check', seat: 2 });
    expect(m.hand!.street).toBe('flop');
    return { m, before };
  };
  it('a Fused Kindle fizzles when its target folded', () => {
    const { m, before } = run(power({ kw: 'Kindle', n: 2 }, { mods: [{ kw: 'Fuse', n: 1 }] }));
    expect(m.seats[1].stack).toBe(before);
    expect(m.hand!.casts[0].status).toBe('fizzled');
  });
  it('a Thriving Kindle Unit does not drain a folded target', () => {
    const { m, before } = run(
      power(
        { kw: 'Kindle', n: 2 },
        { type: 'Unit', subtype: undefined, mods: [{ kw: 'Thriving' }] },
      ),
    );
    expect(m.seats[1].stack).toBe(before);
  });
});

describe('A10 · Veil hides the target until the street ends', () => {
  for (const kw of ['Kindle', 'Lock', 'Needle', 'Venomous', 'Bounty', 'Erode'] as KwRef['kw'][]) {
    it(`${kw}: no log line, hit flag or mark gives the target away`, () => {
      const m = clear(table(4));
      rigHand(m, { button: 0 });
      const a = m.hand!.toAct!;
      const t = [0, 1, 2, 3].find((i) => i !== a)!;
      const obs = [0, 1, 2, 3].find((i) => i !== a && i !== t)!;
      const uid = give(m, a, power({ kw, n: 1 }, { mods: [{ kw: 'Veil' }] }));
      applyInPlace(m, { type: 'cast', seat: a, uid, target: t, costs: [] });
      passAll(m);
      const v = viewFor(m, obs);
      expect(v.hand!.casts[0].target).toBeNull();
      expect(v.hand!.hostileHit.some(Boolean)).toBe(false);
      expect(v.hand!.locked.some(Boolean)).toBe(false);
      expect(v.hand!.venom).toHaveLength(0);
      expect(v.hand!.bounty).toHaveLength(0);
      expect(v.log.filter((l) => l.text.includes(`S${t}`))).toEqual([]);
      // The target and the caster still read it in full.
      expect(viewFor(m, t).log.some((l) => l.text.includes(`S${t}`))).toBe(true);
      // The observer's picker offers the seat; the engine refuses it neutrally.
      const probe = power({ kw: 'Kindle', n: 1 }, { id: '__probe' });
      expect(legalTargets(v, obs, probe)).toContain(t);
    });
  }

  it('an observer casting at the hidden target gets a neutral, coded refusal', () => {
    const m = clear(table(3));
    rigHand(m, { button: 0 });
    const uid = give(m, 0, power({ kw: 'Kindle', n: 1 }, { mods: [{ kw: 'Veil' }] }));
    applyInPlace(m, { type: 'cast', seat: 0, uid, target: 1, costs: [] });
    passAll(m);
    act(m, { type: 'call', seat: 0 });
    act(m, { type: 'call', seat: 1 });
    const k2 = give(m, 2, power({ kw: 'Kindle', n: 1 }, { id: '__k3' }));
    let err: unknown;
    try {
      applyInPlace(m, { type: 'cast', seat: 2, uid: k2, target: 1, costs: [] });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(IllegalAction);
    expect((err as IllegalAction).message).toBe('No legal target');
    expect((err as IllegalAction).code).toBe('hiddenTarget');
  });
});

describe('A11 · the seed is hidden mid-match', () => {
  it('views carry seed 0 until the match is over', () => {
    const m = table(2, 'standard', 4242);
    applyInPlace(m, { type: 'start' });
    expect(viewFor(m, 0).seed).toBe(0);
    m.phase = 'over';
    expect(viewFor(m, 0).seed).toBe(4242);
  });
});

describe('A12 / A13 · Leader ability checks', () => {
  it('Tilt Zone: the doubled nerve cost must be payable', () => {
    const m = clear(table(3));
    rigHand(m, { button: 0, rule: 'tiltZone' });
    const s = m.seats[0];
    s.leader = {
      ...s.leader,
      abilities: [{ nerve: -2, effect: { kw: 'Foresee', n: 1 }, text: '−2: Foresee 1' }],
    };
    s.nerve = 3;
    expect(canUseLeader(m, 0, 0)).toMatchObject({ ok: false, why: 'Needs 4 nerve' });
    s.nerve = 4;
    expect(canUseLeader(m, 0, 0).ok).toBe(true);
  });
  it('Leader Windfall needs a deck of 8+', () => {
    const m = clear(table(3));
    rigHand(m, { button: 0 });
    const s = m.seats[0];
    s.leader = {
      ...s.leader,
      abilities: [{ nerve: -2, effect: { kw: 'Windfall' }, text: '−2: Windfall' }],
    };
    m.hand!.deck = m.hand!.deck.slice(0, 5);
    expect(canUseLeader(m, 0, 0)).toMatchObject({ ok: false, why: 'Deck too thin' });
  });
});

describe('A14 · Roulette respects the one-hostile-per-street cap', () => {
  it('never lands on a seat already hit this street', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const m = clear(table(3, 'standard', seed));
      rigHand(m, { button: 0 });
      const k = give(m, 0, power({ kw: 'Kindle', n: 1 }, { id: '__kk' }));
      applyInPlace(m, { type: 'cast', seat: 0, uid: k, target: 1, costs: [] });
      passAll(m);
      const r = give(
        m,
        0,
        power({ kw: 'Kindle', n: 1 }, { id: '__rr', mods: [{ kw: 'Roulette' }] }),
      );
      applyInPlace(m, { type: 'cast', seat: 0, uid: r, costs: [] });
      passAll(m);
      expect(m.hand!.casts[1].target).not.toBe(1);
    }
  });
});

describe('A15 · no dead CAST button', () => {
  it('extraOptions counts only the exclusions still allowed', () => {
    const m = clear(table(3));
    rigHand(m, { button: 0, holes: ['As Ks', '2c 7d', '3h 9s'] });
    const h = m.hand!;
    for (const c of h.holes[0]) c.blinded = true;
    h.exclusions[0] = [8];
    const def = power({ kw: 'Foresee', n: 1 }, { tier: 4, id: '__t4' });
    const uid = give(m, 0, def);
    m.seats[0].stack = 40; // the 25% cap forces a second extra cost
    expect(castCost(m, 0, def).extra).toBe(2);
    expect(extraOptions(m, 0, uid)).toBe(1);
    expect(canCast(m, 0, uid)).toMatchObject({ ok: false, why: 'Cannot pay the second cost' });
  });
});

describe('A18 · log copy agrees with "You"', () => {
  it('reads "You fold", "You call" and "You check"', () => {
    const m = clear(table(3));
    m.seats[0].name = 'You';
    rigHand(m, { button: 0 });
    act(m, { type: 'call', seat: 0 }, { type: 'call', seat: 1 }, { type: 'check', seat: 2 });
    act(m, { type: 'check', seat: 1 }, { type: 'check', seat: 2 }, { type: 'check', seat: 0 });
    const text = m.log.map((l) => l.text).join('\n');
    expect(text).toContain('You call 16');
    expect(text).toContain('You check.');
    expect(text).toContain('S1 checks.');
    expect(text).not.toMatch(/You (calls|checks|folds|is)\b/);
  });
});

describe('A22 · dead money is winnable by every live seat', () => {
  it('a Bomb Pot short stack all-in on the ante can win the main pot', () => {
    const m = clear(table(3));
    m.seats[1].stack = 10;
    rigHand(m, {
      button: 0,
      rule: 'bombPot',
      param: 1,
      holes: ['2c 7d', 'As Ah', 'Kd Qc'],
      deck: 'Ac 4d 3h 8s 9h',
    });
    const before = chipsInPlay(m);
    for (let w = waitingOn(m); w.kind !== 'start'; w = waitingOn(m)) {
      let a: Action;
      if (w.kind === 'window') a = { type: 'pass', seat: w.seats[0] };
      else if (w.kind === 'bet') {
        const o = betOptions(m, w.seat)!;
        a =
          w.seat === 2 && o.canRaise && m.hand!.street === 'flop' && m.hand!.currentBet === 0
            ? { type: 'raise', seat: 2, to: o.minRaiseTo }
            : o.canCheck
              ? { type: 'check', seat: w.seat }
              : { type: 'call', seat: w.seat };
      } else break;
      applyInPlace(m, a);
    }
    const r = m.hand!.result!;
    expect(r.pots[0].eligible).toContain(1);
    expect(r.pots[0].winners).toEqual([1]);
    expect(m.seats[1].stack).toBe(16 * 3 - 6); // three antes (one short)
    expect(chipsInPlay(m)).toBe(before);
  });
});

describe('A25 · rule edge cases', () => {
  it('a short all-in raise does not re-open the betting', () => {
    const m = clear(table(3));
    rigHand(m, { button: 0 });
    // S0 raises to 48; S1 short-shoves to 56 (a raise of 8 < 32).
    m.seats[1].stack = 56 - 8;
    act(m, { type: 'raise', seat: 0, to: 48 });
    passAll(m);
    act(m, { type: 'raise', seat: 1, to: 56 });
    passAll(m);
    act(m, { type: 'call', seat: 2 });
    passAll(m);
    const o = betOptions(m, 0)!;
    expect(o.canCall).toBe(true);
    expect(o.canRaise).toBe(false);
  });

  it('a full raise still re-opens it', () => {
    const m = clear(table(3));
    rigHand(m, { button: 0 });
    act(m, { type: 'raise', seat: 0, to: 48 }, { type: 'raise', seat: 1, to: 112 });
    passAll(m);
    act(m, { type: 'call', seat: 2 });
    expect(betOptions(m, 0)!.canRaise).toBe(true);
  });

  it('time-cap stack ties do not always favour seat 0', () => {
    let seat0First = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const m = clear(table(2, 'quick', seed));
      rigHand(m, { button: 0 });
      act(m, { type: 'call', seat: 0 }, { type: 'check', seat: 1 });
      for (let k = 0; k < 3; k++) act(m, { type: 'check', seat: 1 }, { type: 'check', seat: 0 });
      // Force a chopped pot so both seats end level, then hit the cap.
      m.seats[0].stack = m.seats[1].stack = 480;
      m.hand!.stackAtStart = [480, 480];
      m.clockMs = 1e9;
      applyInPlace(m, { type: 'start' });
      if (m.placements![0] === 0) seat0First++;
    }
    expect(seat0First).toBeGreaterThan(2);
    expect(seat0First).toBeLessThan(18);
  });

  it('Pass: the passer still knows the card they passed', () => {
    const m = clear(table(3));
    rigHand(m, { button: 0, holes: ['As Ks', '2c 7d', '3h 9s'] });
    const uid = give(m, 0, power({ kw: 'Pass' }));
    act(m, { type: 'cast', seat: 0, uid, costs: [] });
    passAll(m);
    const v = viewFor(m, 0);
    // Seat 0 passed one card to seat 1; seat 0's view of seat 1 shows it.
    const seen = v.hand!.holes[1].filter((c) => c.r !== 0);
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen.some((c) => c.r === 14 || c.r === 13)).toBe(true);
  });
});
