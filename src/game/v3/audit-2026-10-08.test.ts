/**
 * Regression tests for the 2026-10-08 audit's engine/AI findings (§1.2):
 *  E1  canInvoke validates the CHOSEN target (not autoTarget's preference)
 *  E2  endPhase / resolveClash refuse to skip an opponent's open response
 *  E3  the CPU's response windows tap only the chosen card's cost
 *  E4  "whenever this deals clash damage" fires once per damage sub-step
 *  E6  simultaneous zero Vitality is a draw
 *  E8  damage autoTarget prefers a kill, then lethal/face
 */
import { describe, expect, test } from 'vitest';
import { CardDef } from './cards';
import {
  DeckDef,
  GameState,
  PlayerId,
  applyEffect,
  autoTarget,
  canInvoke,
  canTarget,
  createGame,
  declareAttackers,
  declareGuards,
  endPhase,
  findUnit,
  invokeCard,
  isDraw,
  legalTargets,
  makeCardInst,
  mulberry32,
  passPriority,
  resolveClash,
  stateBasedChecks,
  summonUnit,
  winnerSeat,
} from './engine';
import { playTurn, reactionPlays, respondToStack } from './ai';

const U = (
  id: string,
  might: number,
  grit: number,
  keywords: string[] = [],
  extra: Partial<CardDef> = {},
): CardDef => ({
  id,
  name: id,
  type: 'Unit',
  cost: { generic: 0, pips: {} },
  might,
  grit,
  keywords,
  ...extra,
});

const LEADER: CardDef = {
  id: 'test_leader',
  name: 'Test Leader',
  type: 'Leader',
  cost: { generic: 1, pips: {} },
  resolve: 3,
};

const event = (
  id: string,
  subtype: 'Quick' | 'Slow',
  onInvoke: CardDef['onInvoke'],
  generic = 0,
): CardDef => ({
  id,
  name: id,
  type: 'Event',
  subtype,
  cost: { generic, pips: {} },
  onInvoke,
});

const QUICK_KILL = event('quick_kill', 'Quick', {
  action: 'shatter',
  value: 0,
  target: 'enemyUnit',
});
const SLOW_KILL = event('slow_kill', 'Slow', { action: 'shatter', value: 0, target: 'enemyUnit' });
const SLOW_RECOVER = event('slow_recover', 'Slow', {
  action: 'recover',
  value: 0,
  target: 'friendlyUnit',
});

const POOL: Record<string, CardDef> = { [LEADER.id]: LEADER };

/** P1 is the active player in Main I, empty hands and boards. */
function game(): GameState {
  const dd: DeckDef = { leaderId: LEADER.id, cards: [] };
  const s = createGame(dd, dd, POOL, {
    rng: mulberry32(7),
    shuffle: false,
    handSize: 0,
    firstPlayer: 'P1',
  });
  s.phase = 'Main1';
  return s;
}

function toHand(state: GameState, pid: PlayerId, def: CardDef): string {
  const inst = makeCardInst(def);
  state.players[pid].hand.push(inst);
  return inst.iid;
}

let locCounter = 0;
function addLocations(state: GameState, pid: PlayerId, n: number): void {
  for (let i = 0; i < n; i++) {
    state.players[pid].locations.push({
      iid: `loc#${++locCounter}`,
      produces: 'Ember',
      exhausted: false,
    });
  }
}

describe('E1 — canInvoke validates the chosen target', () => {
  test('shattering an Unbreakable unit with its save up is castable and spends the save', () => {
    const s = game();
    const wall = summonUnit(s, 'P2', U('wall', 1, 4, ['Unbreakable']));
    const iid = toHand(s, 'P1', SLOW_KILL);
    expect(legalTargets(s, 'P1', SLOW_KILL.onInvoke!)).toEqual([wall.iid]);
    expect(canInvoke(s, 'P1', iid)).toBe(true);
    expect(canInvoke(s, 'P1', iid, { targetIid: wall.iid })).toBe(true);
    expect(invokeCard(s, 'P1', iid, { targetIid: wall.iid })).toBe(true);
    expect(findUnit(s, wall.iid)).toBeDefined();
    expect(findUnit(s, wall.iid)!.unbreakableSpent).toBe(true);
  });

  test('with no explicit target the Unbreakable-only board is still castable', () => {
    const s = game();
    const wall = summonUnit(s, 'P2', U('wall', 1, 4, ['Unbreakable']));
    const iid = toHand(s, 'P1', SLOW_KILL);
    expect(invokeCard(s, 'P1', iid)).toBe(true);
    expect(findUnit(s, wall.iid)!.unbreakableSpent).toBe(true);
  });

  test('Recover with no exhausted unit still has a legal target', () => {
    const s = game();
    const mine = summonUnit(s, 'P1', U('mine', 2, 2));
    const iid = toHand(s, 'P1', SLOW_RECOVER);
    expect(canTarget(s, 'P1', SLOW_RECOVER.onInvoke!, mine.iid)).toBe(true);
    expect(canInvoke(s, 'P1', iid)).toBe(true);
    expect(invokeCard(s, 'P1', iid, { targetIid: mine.iid })).toBe(true);
  });

  test('an illegal chosen target is refused even when autoTarget would find a legal one', () => {
    const s = game();
    const mine = summonUnit(s, 'P1', U('mine', 2, 2));
    summonUnit(s, 'P2', U('foe', 2, 2));
    const iid = toHand(s, 'P1', SLOW_KILL);
    // Aiming "enemy unit" removal at your own unit is not legal.
    expect(canInvoke(s, 'P1', iid)).toBe(true);
    expect(canInvoke(s, 'P1', iid, { targetIid: mine.iid })).toBe(false);
    expect(invokeCard(s, 'P1', iid, { targetIid: mine.iid })).toBe(false);
    expect(s.players.P1.hand.some((c) => c.iid === iid)).toBe(true);
  });

  test('a Warded enemy is not a legal explicit target, and alone makes the Event dead', () => {
    const s = game();
    const ward = summonUnit(s, 'P2', U('ward', 2, 2, ['Warded']));
    const iid = toHand(s, 'P1', SLOW_KILL);
    expect(canInvoke(s, 'P1', iid, { targetIid: ward.iid })).toBe(false);
    expect(canInvoke(s, 'P1', iid)).toBe(false);
  });

  test('canInvoke agrees with legalTargets across the board states above', () => {
    const s = game();
    const iid = toHand(s, 'P1', SLOW_KILL);
    expect(legalTargets(s, 'P1', SLOW_KILL.onInvoke!)).toEqual([]);
    expect(canInvoke(s, 'P1', iid)).toBe(false);
    summonUnit(s, 'P2', U('foe', 1, 1));
    expect(legalTargets(s, 'P1', SLOW_KILL.onInvoke!)).toHaveLength(1);
    expect(canInvoke(s, 'P1', iid)).toBe(true);
  });
});

describe('E2 — a phase or clash cannot be advanced over an open response', () => {
  test('endPhase is refused while the opponent holds priority over a pending card', () => {
    const s = game();
    toHand(s, 'P2', QUICK_KILL);
    invokeCard(s, 'P1', toHand(s, 'P1', U('body', 2, 2)));
    expect(s.stack).toHaveLength(1);
    expect(s.priority?.holder).toBe('P2');

    expect(endPhase(s)).toBe(false);
    expect(s.phase).toBe('Main1');
    expect(s.stack).toHaveLength(1);

    // The opponent passing is what lets the card resolve and the phase end.
    passPriority(s, 'P2');
    expect(s.stack).toHaveLength(0);
    expect(endPhase(s)).toBe(true);
    expect(s.phase).toBe('Clash');
  });

  test('only the active player can end a phase', () => {
    const s = game();
    expect(endPhase(s, 'P2')).toBe(false);
    expect(endPhase(s, 'P1')).toBe(true);
  });

  test('resolveClash is refused while the opponent holds priority over a pending card', () => {
    const s = game();
    const atk = summonUnit(s, 'P1', U('atk', 2, 2));
    toHand(s, 'P2', QUICK_KILL);
    endPhase(s);
    declareAttackers(s, [atk.iid]);
    declareGuards(s, {});
    invokeCard(
      s,
      'P1',
      toHand(s, 'P1', event('ping', 'Quick', { action: 'damage', value: 1, target: 'anyTarget' })),
    );
    expect(s.stack).toHaveLength(1);
    expect(s.priority?.holder).toBe('P2');

    expect(resolveClash(s)).toBe(false);
    expect(s.clash?.step).toBe('reaction');
    expect(s.stack).toHaveLength(1);

    passPriority(s, 'P2');
    expect(resolveClash(s)).toBe(true);
    expect(s.players.P2.vitality).toBeLessThan(20);
  });

  test('the holder may still concede: ending the phase drains their own pending window', () => {
    const s = game();
    toHand(s, 'P2', QUICK_KILL);
    toHand(s, 'P1', QUICK_KILL); // P1 can answer, so the window stops at them
    invokeCard(s, 'P1', toHand(s, 'P1', U('body', 2, 2)));
    // P2 casts something in response; priority comes back to P1, who ends the phase.
    const foe = summonUnit(s, 'P1', U('mine', 1, 1));
    expect(invokeCard(s, 'P2', s.players.P2.hand[0].iid, { targetIid: foe.iid })).toBe(true);
    expect(s.priority?.holder).toBe('P1');
    expect(endPhase(s)).toBe(true);
    expect(s.stack).toHaveLength(0);
  });
});

describe('E3 — the CPU taps only what the chosen card costs', () => {
  const untapped = (s: GameState, pid: PlayerId) =>
    s.players[pid].locations.filter((l) => !l.exhausted).length;

  test('a reaction window with nothing to play taps nothing', () => {
    const s = game();
    const atk = summonUnit(s, 'P1', U('atk', 2, 2));
    addLocations(s, 'P2', 4);
    toHand(s, 'P2', U('plain', 2, 2)); // not instant speed
    endPhase(s);
    declareAttackers(s, [atk.iid]);
    declareGuards(s, {});
    expect(reactionPlays(s, 'P2')).toBe(0);
    expect(untapped(s, 'P2')).toBe(4);
  });

  test('a reaction play pays for the card and leaves the rest untapped', () => {
    const s = game();
    const atk = summonUnit(s, 'P1', U('atk', 4, 4));
    addLocations(s, 'P2', 4);
    toHand(
      s,
      'P2',
      event('cheap_kill', 'Quick', { action: 'shatter', value: 0, target: 'enemyUnit' }, 1),
    );
    endPhase(s);
    declareAttackers(s, [atk.iid]);
    declareGuards(s, {});
    expect(reactionPlays(s, 'P2')).toBe(1);
    expect(untapped(s, 'P2')).toBe(3);
    expect(findUnit(s, atk.iid)).toBeUndefined();
  });

  test('respondToStack pays only for its answer', () => {
    const s = game();
    addLocations(s, 'P2', 4);
    summonUnit(s, 'P1', U('victim', 3, 3));
    toHand(
      s,
      'P2',
      event('cheap_kill', 'Quick', { action: 'shatter', value: 0, target: 'enemyUnit' }, 1),
    );
    invokeCard(s, 'P1', toHand(s, 'P1', U('body', 2, 2)));
    expect(s.priority?.holder).toBe('P2');
    expect(respondToStack(s, 'P2')).toBe(1);
    expect(untapped(s, 'P2')).toBe(3);
  });

  test('a response window the CPU passes on leaves its Main II mana alone', () => {
    const s = game();
    addLocations(s, 'P2', 3);
    toHand(s, 'P2', QUICK_KILL); // no worthwhile target: the CPU passes
    invokeCard(s, 'P1', toHand(s, 'P1', U('body', 2, 2)));
    respondToStack(s, 'P2');
    expect(untapped(s, 'P2')).toBe(3);
  });

  test('playTurn still completes with reactions in hand', () => {
    const s = game();
    addLocations(s, 'P1', 2);
    toHand(s, 'P1', U('body', 1, 1));
    expect(() => playTurn(s, 'P1')).not.toThrow();
  });
});

describe('E4 — Doublestrike fires "deals clash damage" triggers per hit', () => {
  const ping = (extra: string[]) =>
    U('striker', 2, 4, extra, {
      triggers: [
        { when: 'dealsClashDamage', effect: { action: 'damage', value: 1, target: 'enemyPlayer' } },
      ],
    });

  function faceHit(keywords: string[]): number {
    const s = game();
    const atk = summonUnit(s, 'P1', ping(keywords));
    endPhase(s);
    declareAttackers(s, [atk.iid]);
    declareGuards(s, {});
    resolveClash(s);
    return 20 - s.players.P2.vitality;
  }

  test('a plain unit fires once', () => {
    expect(faceHit([])).toBe(2 + 1);
  });

  test('a Doublestrike unit fires once for each sub-step it connects in', () => {
    expect(faceHit(['Doublestrike'])).toBe(2 + 2 + 1 + 1);
  });

  test('Quickstrike alone is still one hit', () => {
    expect(faceHit(['Quickstrike'])).toBe(2 + 1);
  });
});

describe('E6 — simultaneous zero Vitality is a draw', () => {
  test('both at 0 in one check is a draw, not a loss for the active player', () => {
    const s = game();
    s.players.P1.vitality = 0;
    s.players.P2.vitality = -2;
    stateBasedChecks(s);
    expect(s.winner).toBe('draw');
    expect(isDraw(s)).toBe(true);
    expect(winnerSeat(s)).toBeNull();
    expect(s.log[s.log.length - 1]).toMatch(/draw/i);
  });

  test('a single death still names the other seat', () => {
    const s = game();
    s.players.P1.vitality = 0;
    stateBasedChecks(s);
    expect(s.winner).toBe('P2');
    expect(isDraw(s)).toBe(false);
    expect(winnerSeat(s)).toBe('P2');
  });

  test('a live game has no winner seat and is no draw', () => {
    const s = game();
    expect(winnerSeat(s)).toBeNull();
    expect(isDraw(s)).toBe(false);
  });

  test('a drawn game accepts no further actions and the CPU stands down', () => {
    const s = game();
    s.players.P1.vitality = 0;
    s.players.P2.vitality = 0;
    stateBasedChecks(s);
    expect(endPhase(s)).toBe(false);
    expect(playTurn(s, 'P1')).toEqual([]);
    expect(s.winner).toBe('draw');
  });

  test('a mutual lethal exchange (Siphon-less trade through Wildfire) ends the game as a draw', () => {
    const s = game();
    s.players.P1.vitality = 2;
    s.players.P2.vitality = 2;
    // Each side's unit dies at the clash and Wildfire pings the opposing face.
    const fire = (id: string) =>
      U(id, 3, 1, ['Wildfire'], {
        triggers: [{ when: 'dies', effect: { action: 'damage', value: 2, target: 'enemyPlayer' } }],
      });
    const atk = summonUnit(s, 'P1', fire('atk'));
    const blk = summonUnit(s, 'P2', fire('blk'));
    endPhase(s);
    declareAttackers(s, [atk.iid]);
    declareGuards(s, { [atk.iid]: [blk.iid] });
    resolveClash(s);
    expect(s.players.P1.vitality).toBeLessThanOrEqual(0);
    expect(s.players.P2.vitality).toBeLessThanOrEqual(0);
    expect(s.winner).toBe('draw');
  });
});

describe('E8 — damage autoTarget prefers a kill, then the face', () => {
  const ping2 = { action: 'damage', value: 2, target: 'anyTarget' } as const;

  test('a 2-damage ping into only a 6-Grit body goes face', () => {
    const s = game();
    summonUnit(s, 'P2', U('wall', 1, 6));
    expect(autoTarget(s, 'P1', ping2)).toBe('P2');
  });

  test('it kills a smaller unit rather than bruising the biggest', () => {
    const s = game();
    summonUnit(s, 'P2', U('wall', 5, 6));
    const small = summonUnit(s, 'P2', U('small', 2, 2));
    expect(autoTarget(s, 'P1', ping2)).toBe(small.iid);
  });

  test('among several kills it takes the most valuable body', () => {
    const s = game();
    summonUnit(s, 'P2', U('one', 1, 1));
    const best = summonUnit(s, 'P2', U('best', 3, 2));
    summonUnit(s, 'P2', U('two', 1, 2));
    expect(autoTarget(s, 'P1', ping2)).toBe(best.iid);
  });

  test('lethal to the face beats a kill', () => {
    const s = game();
    summonUnit(s, 'P2', U('small', 2, 2));
    s.players.P2.vitality = 2;
    expect(autoTarget(s, 'P1', ping2)).toBe('P2');
  });

  test('damage already marked on a body counts towards the kill', () => {
    const s = game();
    const hurt = summonUnit(s, 'P2', U('hurt', 4, 6));
    hurt.damage = 4;
    expect(autoTarget(s, 'P1', ping2)).toBe(hurt.iid);
  });

  test('Hardened, an Unbreakable save and Warded all stop a body counting as a kill', () => {
    const s = game();
    summonUnit(s, 'P2', U('hard', 2, 2, ['Hardened']));
    summonUnit(s, 'P2', U('safe', 2, 2, ['Unbreakable']));
    summonUnit(s, 'P2', U('ward', 2, 2, ['Warded']));
    expect(autoTarget(s, 'P1', ping2)).toBe('P2');
  });

  test('a unit-only damage effect with no kill keeps the old biggest-body pick', () => {
    const s = game();
    summonUnit(s, 'P2', U('mid', 2, 5));
    const big = summonUnit(s, 'P2', U('big', 5, 6));
    expect(autoTarget(s, 'P1', { action: 'damage', value: 2, target: 'enemyUnit' })).toBe(big.iid);
  });

  test('a unit-only damage effect still prefers the kill', () => {
    const s = game();
    summonUnit(s, 'P2', U('big', 5, 6));
    const small = summonUnit(s, 'P2', U('small', 1, 2));
    expect(autoTarget(s, 'P1', { action: 'damage', value: 2, target: 'enemyUnit' })).toBe(
      small.iid,
    );
  });

  test('non-damage effects are untouched', () => {
    const s = game();
    const big = summonUnit(s, 'P2', U('big', 5, 6));
    summonUnit(s, 'P2', U('small', 1, 1));
    expect(autoTarget(s, 'P1', { action: 'weaken', value: 2, target: 'enemyUnit' })).toBe(big.iid);
  });

  test('end to end: an untargeted ping hits the face when it cannot kill', () => {
    const s = game();
    const wall = summonUnit(s, 'P2', U('wall', 1, 6));
    applyEffect(s, 'P1', ping2);
    expect(s.players.P2.vitality).toBe(18);
    expect(findUnit(s, wall.iid)!.damage).toBe(0);
  });
});
