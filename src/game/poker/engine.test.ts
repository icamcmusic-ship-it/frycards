import { describe, expect, it } from 'vitest';
import { UNIT, MODES } from './constants';
import {
  applyAction,
  betOptions,
  canCast,
  castCost,
  chipsInPlay,
  createMatch,
  IllegalAction,
  replay,
  waitingOn,
  type Action,
  type Match,
} from './engine';
import { act, give, power, rigHand, table } from './testkit';
import { viewFor } from './view';
import { cpuTableSetup, simulateMatch } from './sim';

const total = (m: Match) => chipsInPlay(m);

describe('blinds and action order', () => {
  it('heads-up: the button posts the small blind and acts first pre-flop, last after', () => {
    const m = rigHand(table(2), { button: 0 });
    const h = m.hand!;
    expect(h.sbSeat).toBe(0);
    expect(h.bbSeat).toBe(1);
    expect(h.toAct).toBe(0);
    act(m, { type: 'call', seat: 0 }, { type: 'check', seat: 1 });
    expect(m.hand!.street).toBe('flop');
    expect(m.hand!.toAct).toBe(1);
  });

  it('three seats: blinds left of the button, under the gun first', () => {
    const m = rigHand(table(3), { button: 0 });
    const h = m.hand!;
    expect([h.sbSeat, h.bbSeat]).toEqual([1, 2]);
    expect(h.toAct).toBe(0);
    expect(h.committed).toEqual([0, 50, 100]);
  });

  it('folding around gives the big blind the pot and conserves chips', () => {
    const m = rigHand(table(3), { button: 0 });
    const before = total(m);
    act(m, { type: 'fold', seat: 0 }, { type: 'fold', seat: 1 });
    expect(m.hand!.done).toBe(true);
    expect(m.seats[2].stack).toBe(50 * UNIT + 50);
    expect(total(m)).toBe(before);
  });

  it('the big blind keeps the option when everyone limps', () => {
    const m = rigHand(table(3), { button: 0 });
    act(m, { type: 'call', seat: 0 }, { type: 'call', seat: 1 });
    expect(m.hand!.street).toBe('preflop');
    expect(m.hand!.toAct).toBe(2);
    expect(betOptions(m, 2)!.canCheck).toBe(true);
  });
});

describe('pot-limit betting', () => {
  it('caps a raise at the pot after calling', () => {
    const m = rigHand(table(3), { button: 0 });
    const o = betOptions(m, 0)!;
    // Pot 150 + call 100 = 250 on top of the 100 bet.
    expect(o.maxRaiseTo).toBe(350);
    expect(o.minRaiseTo).toBe(200);
    expect(() => act(m, { type: 'raise', seat: 0, to: 400 })).toThrow(IllegalAction);
    act(m, { type: 'raise', seat: 0, to: 350 });
    expect(m.hand!.currentBet).toBe(350);
  });

  it('applyAction is pure: an illegal action leaves the input untouched', () => {
    const m = rigHand(table(3), { button: 0 });
    const snap = JSON.stringify(m);
    expect(() => applyAction(m, { type: 'check', seat: 0 })).toThrow(IllegalAction);
    const next = applyAction(m, { type: 'fold', seat: 0 });
    expect(JSON.stringify(m)).toBe(snap);
    expect(next.hand!.folded[0]).toBe(true);
  });
});

describe('showdown and side pots', () => {
  it('awards the best hand and splits ties', () => {
    const m = rigHand(table(2), { button: 0, holes: ['As Ks', 'Ad Kd'], deck: '2c 7h 9s Tc 3h' });
    act(m, { type: 'call', seat: 0 }, { type: 'check', seat: 1 });
    for (let i = 0; i < 3; i++) act(m, { type: 'check', seat: 1 }, { type: 'check', seat: 0 });
    expect(m.hand!.done).toBe(true);
    expect(m.hand!.result!.winners.sort()).toEqual([0, 1]);
    expect(m.seats[0].stack).toBe(50 * UNIT);
  });

  it('builds side pots for short all-ins', () => {
    const m = table(3);
    m.seats[0].stack = 10 * UNIT;
    m.seats[1].stack = 30 * UNIT;
    m.seats[2].stack = 50 * UNIT;
    rigHand(m, {
      button: 0,
      // Seat 0 best, seat 1 second, seat 2 worst.
      holes: ['Ah Ad', 'Kh Kd', '7c 2d'],
      deck: 'Qs 9c 4h 3s 8d',
    });
    const before = total(m);
    // Everyone pushes as hard as pot-limit allows until all are in.
    let guard = 0;
    while (!m.hand!.done && guard++ < 60) {
      const w = waitingOn(m);
      if (w.kind === 'window') {
        act(m, { type: 'pass', seat: w.seats[0] });
        continue;
      }
      if (w.kind !== 'bet') break;
      const o = betOptions(m, w.seat)!;
      const a: Action = o.canRaise
        ? { type: 'raise', seat: w.seat, to: o.maxRaiseTo }
        : o.canCall
          ? { type: 'call', seat: w.seat }
          : { type: 'check', seat: w.seat };
      act(m, a);
    }
    expect(m.hand!.done).toBe(true);
    expect(total(m)).toBe(before);
    // Seat 0 wins the main pot (3 × its 10 units); seat 1 beats seat 2 for the side pot.
    expect(m.seats[0].stack).toBe(30 * UNIT);
    expect(m.seats[1].stack).toBe(40 * UNIT);
    expect(m.seats[2].stack).toBe(20 * UNIT);
  });
});

describe('hand exclusions', () => {
  it('an excluded winning category passes the pot to the best eligible hand', () => {
    const m = rigHand(table(2), { button: 0, holes: ['Ah Ad', 'Kh Qd'], deck: '2c 7h 9s Tc 3h' });
    m.hand!.exclusions[0] = [1]; // seat 0 cannot win with a pair
    act(m, { type: 'call', seat: 0 }, { type: 'check', seat: 1 });
    for (let i = 0; i < 3; i++) act(m, { type: 'check', seat: 1 }, { type: 'check', seat: 0 });
    expect(m.hand!.result!.winners).toEqual([1]);
  });

  it('if every contender is excluded, exclusions are ignored', () => {
    const m = rigHand(table(2), { button: 0, holes: ['Ah Ad', 'Kh Kd'], deck: '2c 7h 9s Tc 3h' });
    m.hand!.exclusions = [[1], [1]];
    act(m, { type: 'call', seat: 0 }, { type: 'check', seat: 1 });
    for (let i = 0; i < 3; i++) act(m, { type: 'check', seat: 1 }, { type: 'check', seat: 0 });
    expect(m.hand!.result!.winners).toEqual([0]);
  });
});

describe('casting', () => {
  it('Peek: the caster learns the card, nobody else does', () => {
    const m = rigHand(table(3), { button: 0, holes: ['As Ks', 'Qh Jh', '2c 3d'] });
    const uid = give(m, 0, power({ kw: 'Peek', n: 1 }, { colors: ['Light'] }));
    act(m, { type: 'cast', seat: 0, uid, target: 1 });
    // Response window may open; pass it if so.
    while (waitingOn(m).kind === 'window') {
      const w = waitingOn(m) as { seats: number[] };
      act(m, { type: 'pass', seat: w.seats[0] });
    }
    const known = m.hand!.holes[1].filter((c) => c.knownTo.includes(0));
    expect(known).toHaveLength(1);
    expect(viewFor(m, 0).hand!.holes[1].some((c) => c.r > 0)).toBe(true);
    expect(viewFor(m, 2).hand!.holes[1].every((c) => c.r === 0)).toBe(true);
    // Still seat 0's turn: casting does not use up the action.
    expect(m.hand!.toAct).toBe(0);
  });

  it('one hostile power per target per street', () => {
    const m = rigHand(table(3), { button: 0 });
    const a = give(m, 0, power({ kw: 'Kindle', n: 0.5 }, { colors: ['Ember'] }));
    const b = give(m, 0, power({ kw: 'Kindle', n: 0.5 }, { colors: ['Ember'], id: 'k2' }));
    act(m, { type: 'cast', seat: 0, uid: a, target: 1 });
    while (waitingOn(m).kind === 'window') act(m, { type: 'pass', seat: (waitingOn(m) as { seats: number[] }).seats[0] });
    expect(() => act(m, { type: 'cast', seat: 0, uid: b, target: 1 })).toThrow(IllegalAction);
  });

  it('costs follow the tier ladder, and tier 4+ needs a second cost', () => {
    const m = rigHand(table(3), { button: 0 });
    const t2 = power({ kw: 'Siphon', n: 1 }, { tier: 2 });
    const t4 = power({ kw: 'Siphon', n: 3 }, { tier: 4 });
    expect(castCost(m, 0, t2)).toMatchObject({ chips: 1 * UNIT, extra: 0 });
    expect(castCost(m, 0, t4)).toMatchObject({ chips: 3.5 * UNIT, extra: 1 });
    const uid = give(m, 0, t4);
    expect(() => act(m, { type: 'cast', seat: 0, uid })).toThrow(/non-chip/);
    act(m, { type: 'cast', seat: 0, uid, costs: [{ kind: 'debuff', hole: 0 }] });
    expect(m.hand!.holes[0][0].blinded).toBe(true);
    expect(viewFor(m, 0).hand!.holes[0][0].r).toBe(0);
  });

  it('no cast costs more than a quarter of the stack; the excess becomes a second cost', () => {
    const m = table(3);
    m.seats[0].stack = 8 * UNIT;
    rigHand(m, { button: 0 });
    const c = castCost(m, 0, power({ kw: 'Siphon', n: 2 }, { tier: 3 }));
    expect(c.chips).toBe(2 * UNIT);
    const c5 = castCost(m, 0, power({ kw: 'Siphon', n: 5 }, { tier: 5 }));
    expect(c5.chips).toBe(2 * UNIT);
    expect(c5.extra).toBe(2);
  });

  it('a cast whose target folds before it resolves fizzles with no refund', () => {
    const m = rigHand(table(3), { button: 0 });
    // Seat 1 holds a Quick response so the window opens; it folds instead.
    give(m, 1, power({ kw: 'Siphon', n: 0.5 }, { subtype: 'Quick' }));
    const uid = give(m, 0, power({ kw: 'Kindle', n: 1 }, { tier: 2 }));
    const stack = m.seats[0].stack;
    act(m, { type: 'cast', seat: 0, uid, target: 2 });
    // Fold can't happen mid-window, so mark it directly (as if it folded earlier).
    m.hand!.folded[2] = true;
    act(m, { type: 'pass', seat: 1 });
    const rec = m.hand!.casts[0];
    expect(rec.status).toBe('fizzled');
    expect(m.seats[0].stack).toBe(stack - 1 * UNIT);
  });

  it('Snuff cancels a cast in its response window', () => {
    const m = rigHand(table(3), { button: 0 });
    const snuff = give(m, 1, power({ kw: 'Snuff' }, { subtype: 'Quick', tier: 3, colors: ['Void'] }));
    const uid = give(m, 0, power({ kw: 'Siphon', n: 1 }, { tier: 2 }));
    act(m, { type: 'cast', seat: 0, uid });
    expect(waitingOn(m)).toMatchObject({ kind: 'window', seats: [1] });
    act(m, { type: 'cast', seat: 1, uid: snuff });
    expect(m.hand!.casts[0].status).toBe('snuffed');
    expect(waitingOn(m)).toMatchObject({ kind: 'bet', seat: 0 });
  });

  it('Feint fizzles in secret; Call Out catches it and refunds the caller', () => {
    const m = rigHand(table(3), { button: 0 });
    const feint = give(m, 0, power({ kw: 'Siphon', n: 1 }, { tier: 2, mods: [{ kw: 'Feint' }, { kw: 'Quickstrike' }] }));
    const potBefore = m.hand!.dead;
    act(m, { type: 'cast', seat: 0, uid: feint, feint: true });
    expect(m.hand!.casts[0].status).toBe('resolved');
    expect(m.hand!.dead).toBe(potBefore + 1 * UNIT); // nothing siphoned
    expect(viewFor(m, 1).hand!.casts[0].feinted).toBe(false);
    act(m, { type: 'call', seat: 0 });
    const call = give(m, 1, power({ kw: 'Call Out' }, { colors: ['Light'], mods: [{ kw: 'Quickstrike' }] }));
    const nerve = m.seats[0].nerve;
    const stack = m.seats[1].stack;
    act(m, { type: 'cast', seat: 1, uid: call, targetCast: m.hand!.casts[0].id });
    expect(m.seats[0].nerve).toBeLessThan(nerve);
    expect(m.seats[1].stack).toBe(stack); // paid ½ and got it back
  });

  it('caps Units at two and five stars a hand', () => {
    const m = rigHand(table(3), { button: 0 });
    const u3 = give(m, 0, power({ kw: 'Decoy' }, { type: 'Unit', subtype: undefined, tier: 3, mods: [{ kw: 'Quickstrike' }] }));
    const u3b = give(m, 0, power({ kw: 'Decoy' }, { type: 'Unit', subtype: undefined, tier: 3, id: 'u3b' }));
    act(m, { type: 'cast', seat: 0, uid: u3 });
    expect(canCast(m, 0, u3b)).toMatchObject({ ok: false });
  });
});

describe('Locations', () => {
  const playToEnd = (m: Match) => {
    let g = 0;
    while (!m.hand!.done && g++ < 60) {
      const w = waitingOn(m);
      if (w.kind === 'bet') {
        const o = betOptions(m, w.seat)!;
        act(m, o.canCheck ? { type: 'check', seat: w.seat } : { type: 'call', seat: w.seat });
      } else if (w.kind === 'choice') act(m, { type: 'choose', seat: w.seat, index: 0 });
      else if (w.kind === 'window') act(m, { type: 'pass', seat: w.seats[0] });
      else break;
    }
  };

  it('Short Board ends after the turn', () => {
    const m = rigHand(table(2), { button: 0, rule: 'shortBoard' });
    playToEnd(m);
    expect(m.hand!.board).toHaveLength(4);
  });

  it('Bomb Pot: everyone antes, no blinds, play starts on the flop', () => {
    const m = rigHand(table(3), { button: 0, rule: 'bombPot', param: 1 });
    expect(m.hand!.street).toBe('flop');
    expect(m.hand!.dead).toBe(3 * UNIT);
    expect(m.hand!.committed).toEqual([0, 0, 0]);
  });

  it('Pineapple deals three and makes everyone discard after the flop', () => {
    const m = rigHand(table(2), { button: 0, rule: 'pineapple' });
    expect(m.hand!.holes[0]).toHaveLength(3);
    act(m, { type: 'call', seat: 0 }, { type: 'check', seat: 1 });
    expect(waitingOn(m).kind).toBe('choice');
    playToEnd(m);
    expect(m.hand!.holes[0]).toHaveLength(2);
  });

  it('Double Board deals two turn/river runs and splits each pot', () => {
    const m = rigHand(table(2), { button: 0, rule: 'doubleBoard' });
    playToEnd(m);
    expect(m.hand!.board2).toHaveLength(5);
    expect(m.hand!.result!.pots.some((p) => p.board === 2)).toBe(true);
  });

  it('High Stakes raises the blinds', () => {
    const m = rigHand(table(2), { button: 0, rule: 'highStakes', param: 2 });
    expect(m.hand!.bb).toBe(200);
  });

  it('Open Hand turns every lowest hole card face-up', () => {
    const m = rigHand(table(3), { button: 0, rule: 'openHand' });
    for (const holes of m.hand!.holes) expect(holes.some((c) => c.public)).toBe(true);
  });
});

describe('match flow', () => {
  it('blinds rise with the match clock, not the hand count', () => {
    const m = table(2, 'standard');
    act(m, { type: 'start' });
    act(m, { type: 'fold', seat: m.hand!.toAct!, dt: MODES.standard.levelMs + 1 });
    act(m, { type: 'start' });
    expect(m.level).toBe(1);
    expect(m.hand!.bb).toBe(150);
  });

  it('replays the same match from its seed and action log', () => {
    const setup = cpuTableSetup({ seed: 99, mode: 'quick', seats: 4 });
    const { match, actions } = simulateMatch(setup, 5);
    const again = replay(setup, actions);
    expect(again.placements).toEqual(match.placements);
    expect(again.seats.map((s) => s.stack)).toEqual(match.seats.map((s) => s.stack));
  });

  it('places the last seat standing first and the first bust last', () => {
    const setup = cpuTableSetup({ seed: 12, mode: 'quick', seats: 3 });
    const { match } = simulateMatch(setup, 3);
    expect(match.phase).toBe('over');
    const first = match.seats[match.placements![0]];
    const last = match.seats[match.placements![2]];
    if (!match.capped) expect(first.busted).toBe(false);
    if (last.busted && match.seats.filter((s) => s.busted).length > 1) expect(last.bustOrder).toBe(1);
  });

  it('createMatch refuses fewer than two seats', () => {
    expect(() => createMatch({ seed: 1, mode: 'quick', seats: [] })).toThrow();
  });
});
