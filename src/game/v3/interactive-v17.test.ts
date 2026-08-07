/**
 * v17 interactive-seam suite — the paths the headless sims never exercise,
 * where this pass's bug hunt found real defects:
 *
 *  1. Dusk shed choice vs "At Dusk" draws: the engine's shed used to run
 *     from the end of the hand AFTER Dusk triggers drew, so the drawn card
 *     was always auto-shed with no player input. The `chooseShed` hook now
 *     runs post-trigger, may pause (throw), and `finishDuskShed` resumes.
 *  2. Tool "weakens a target enemy unit": the invoke's explicit target is
 *     honored (the UI offers the pick); autoTarget stays the fallback.
 *  3. `reactionPlays` with `onOpponentPriority`: a reaction the opponent can
 *     answer pauses instead of force-resolving through their window, and the
 *     call is re-entrant after the window closes.
 *  4. The new log lines (leader ability uses, invoke targets, clash hits)
 *     exist and don't collide with the sim's log greps.
 */
import { describe, expect, test } from 'vitest';
import { CardDef, MAX_HAND } from './cards';
import {
  DeckDef,
  GameState,
  activateLeaderAbility,
  declareAttackers,
  declareGuards,
  effMight,
  endPhase,
  finishDuskShed,
  findUnit,
  hasPriority,
  invokeCard,
  invokeLeader,
  makeCardInst,
  mulberry32,
  passPriority,
  resolveClash,
  settleStack,
  summonUnit,
  createGame,
} from './engine';
import { reactionPlays } from './ai';

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
  resolve: 4,
  leaderAbilities: [
    {
      resolveDelta: -1,
      effect: { action: 'damage', value: 2, target: 'anyTarget' },
      text: '-1: Deal 2 damage to any target.',
    },
    { resolveDelta: 1, effect: { action: 'draw', value: 1, target: 'none' }, text: '+1: Deal.' },
  ],
};
const POOL: Record<string, CardDef> = { [LEADER.id]: LEADER };

function game(): GameState {
  const filler = Array.from({ length: 40 }, (_, i) => `pad${i}`);
  for (const id of filler) POOL[id] = U(id, 1, 1);
  const dd = (): DeckDef => ({ leaderId: LEADER.id, cards: filler });
  return createGame(dd(), dd(), POOL, { rng: mulberry32(11), shuffle: false, handSize: 0 });
}

function bigEssence(state: GameState, pid: 'P1' | 'P2'): void {
  state.players[pid].essence = {
    Ember: 9,
    Tide: 9,
    Root: 9,
    Gale: 9,
    Light: 9,
    Shadow: 9,
    Void: 9,
  };
}

/** Walk the active player from Main1 to Main2 without a clash. */
function toMain2(state: GameState): void {
  expect(state.phase).toBe('Main1');
  endPhase(state); // -> Clash
  endPhase(state); // -> Main2
  expect(state.phase).toBe('Main2');
}

const DUSK_DRAWER = U('dusk_drawer', 1, 3, [], {
  triggers: [{ when: 'atDusk', effect: { action: 'draw', value: 1, target: 'none' } }],
});

describe('Dusk shed choice vs At Dusk draws (chooseShed / finishDuskShed)', () => {
  test('chooseShed runs AFTER Dusk triggers, so the drawn card is choosable', () => {
    const s = game();
    summonUnit(s, 'P1', DUSK_DRAWER);
    // Exactly MAX_HAND in hand: only the Dusk draw pushes over the limit.
    for (let i = 0; i < MAX_HAND; i++) s.players.P1.hand.push(makeCardInst(U(`h${i}`, 1, 1)));
    toMain2(s);
    let seenCount = -1;
    let seenHandSize = -1;
    let drawnIid = '';
    s.chooseShed = (state, pid, count) => {
      expect(pid).toBe('P1');
      seenCount = count;
      const hand = state.players.P1.hand;
      seenHandSize = hand.length;
      drawnIid = hand[hand.length - 1].iid; // the card the Dusk trigger drew
      return [drawnIid];
    };
    endPhase(s); // Dusk: trigger draws 1 (hand 8), chooser picks the drawn card
    expect(seenCount).toBe(1);
    expect(seenHandSize).toBe(MAX_HAND + 1);
    expect(s.players.P1.hand).toHaveLength(MAX_HAND);
    expect(s.players.P1.ashPile.some((c) => c.iid === drawnIid)).toBe(true);
    expect(s.active).toBe('P2'); // the turn completed normally
  });

  test('a throwing chooseShed pauses mid-Dusk and finishDuskShed resumes with the picks', () => {
    const s = game();
    summonUnit(s, 'P1', DUSK_DRAWER);
    for (let i = 0; i < MAX_HAND; i++) s.players.P1.hand.push(makeCardInst(U(`h${i}`, 1, 1)));
    toMain2(s);
    const PAUSE = new Error('dusk pause');
    s.chooseShed = () => {
      throw PAUSE;
    };
    expect(() => endPhase(s)).toThrow(PAUSE);
    // Paused mid-Dusk: still P1's turn, hand over the limit, nothing shed.
    expect(s.active).toBe('P1');
    expect(s.players.P1.hand).toHaveLength(MAX_HAND + 1);
    // Resume with an explicit pick — the FIRST card, which the old
    // shed-from-the-end could never have discarded here.
    const pick = s.players.P1.hand[0].iid;
    finishDuskShed(s, [pick]);
    expect(s.players.P1.hand).toHaveLength(MAX_HAND);
    expect(s.players.P1.hand.some((c) => c.iid === pick)).toBe(false);
    expect(s.players.P1.ashPile.some((c) => c.iid === pick)).toBe(true);
    expect(s.active).toBe('P2');
  });

  test('without the hook, headless behavior is unchanged (shed from the end)', () => {
    const s = game();
    summonUnit(s, 'P1', DUSK_DRAWER);
    for (let i = 0; i < MAX_HAND; i++) s.players.P1.hand.push(makeCardInst(U(`h${i}`, 1, 1)));
    toMain2(s);
    endPhase(s);
    expect(s.players.P1.hand).toHaveLength(MAX_HAND);
    expect(s.active).toBe('P2');
  });
});

describe('Tool nerf targeting', () => {
  const TOOL = (id: string): CardDef => ({
    id,
    name: id,
    type: 'Item',
    subtype: 'Tool',
    cost: { generic: 0, pips: {} },
    bond: { might: 1 },
    nerf: 2,
  });

  test('an explicit invoke target directs the weaken (not the biggest enemy)', () => {
    const s = game();
    const friendly = summonUnit(s, 'P1', U('fr', 2, 2));
    const big = summonUnit(s, 'P2', U('big', 5, 5));
    const small = summonUnit(s, 'P2', U('small', 2, 2));
    const tool = makeCardInst(TOOL('tool_a'));
    s.players.P1.hand.push(tool);
    bigEssence(s, 'P1');
    expect(
      invokeCard(s, 'P1', tool.iid, { bondTargetIid: friendly.iid, targetIid: small.iid }),
    ).toBe(true);
    settleStack(s, { interactive: false });
    expect(effMight(s, small)).toBe(0); // 2 - 2
    expect(effMight(s, big)).toBe(5); // untouched
  });

  test('with no explicit target the old autoTarget fallback still applies', () => {
    const s = game();
    const friendly = summonUnit(s, 'P1', U('fr', 2, 2));
    const big = summonUnit(s, 'P2', U('big', 5, 5));
    summonUnit(s, 'P2', U('small', 2, 2));
    const tool = makeCardInst(TOOL('tool_b'));
    s.players.P1.hand.push(tool);
    bigEssence(s, 'P1');
    expect(invokeCard(s, 'P1', tool.iid, { bondTargetIid: friendly.iid })).toBe(true);
    settleStack(s, { interactive: false });
    expect(effMight(s, big)).toBe(3); // autoTarget picked the biggest
  });
});

describe('reactionPlays pause contract (onOpponentPriority)', () => {
  const QUICK_HIT = (id: string): CardDef => ({
    id,
    name: id,
    type: 'Event',
    subtype: 'Quick',
    cost: { generic: 0, pips: {} },
    onInvoke: { action: 'damage', value: 2, target: 'enemyUnit' },
  });

  function clashSetup() {
    const s = game();
    const attacker = summonUnit(s, 'P1', U('atk', 3, 3));
    attacker.enteredThisTurn = false;
    summonUnit(s, 'P2', U('def', 1, 4)).enteredThisTurn = false;
    endPhase(s); // -> Clash
    expect(declareAttackers(s, [attacker.iid])).toBe(true);
    expect(declareGuards(s, {})).toBe(true); // opens the reaction window
    // Defender holds a Quick answer; so does the attacker (so the window
    // must stop for them).
    s.players.P2.hand.push(makeCardInst(QUICK_HIT('p2_quick')));
    s.players.P1.hand.push(makeCardInst(QUICK_HIT('p1_quick')));
    return { s, attacker };
  }

  test("a defender reaction the attacker can answer pauses instead of resolving through, and the pause sentinel doesn't leak into later calls", () => {
    const { s } = clashSetup();
    const SENT = new Error('priority pause');
    expect(() =>
      reactionPlays(s, 'P2', undefined, {
        onOpponentPriority: () => {
          throw SENT;
        },
      }),
    ).toThrow(SENT);
    // Paused: the defender's Quick Event sits on the stack, attacker holds
    // priority, nothing has resolved yet.
    expect(s.stack.length).toBe(1);
    expect(hasPriority(s, 'P1')).toBe(true);
    // The attacker passes; the reaction resolves.
    passPriority(s, 'P1');
    settleStack(s, { interactive: false });
    expect(s.stack.length).toBe(0);
    // Re-entry continues the window without throwing (nothing left to cast —
    // the hook must have been uninstalled by the finally, not left dangling).
    expect(() => reactionPlays(s, 'P2')).not.toThrow();
  });

  test('without the option, behavior is the old force-resolve (sims unchanged)', () => {
    const { s, attacker } = clashSetup();
    reactionPlays(s, 'P2');
    expect(s.stack.length).toBe(0);
    expect(attacker.damage).toBeGreaterThan(0); // the Quick hit resolved
  });
});

describe('v17 log lines', () => {
  test('leader ability uses are logged (with target), and invoke logs name its target', () => {
    const s = game();
    const victim = summonUnit(s, 'P2', U('victim', 2, 5));
    bigEssence(s, 'P1');
    expect(invokeLeader(s, 'P1')).toBe(true);
    expect(activateLeaderAbility(s, 'P1', 0, victim.iid)).toBe(true);
    const line = s.log.find((l) => l.includes('uses'));
    expect(line).toBeTruthy();
    expect(line).toContain('Test Leader');
    expect(line).toContain('victim');
    // None of the new lines may collide with the sim's shed grep.
    expect(s.log.filter((l) => l.includes('sheds'))).toHaveLength(0);
  });

  test('clash damage packets are logged', () => {
    const s = game();
    const attacker = summonUnit(s, 'P1', U('slugger', 3, 3));
    attacker.enteredThisTurn = false;
    endPhase(s); // -> Clash
    expect(declareAttackers(s, [attacker.iid])).toBe(true);
    expect(declareGuards(s, {})).toBe(true);
    expect(findUnit(s, attacker.iid)).toBeTruthy();
    expect(resolveClash(s)).toBe(true);
    expect(s.log.some((l) => l.includes('hits P2 for 3 Vitality'))).toBe(true);
  });
});
