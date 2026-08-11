/**
 * v22 interactive-seam suite — the Wellspring gate the stress driver found.
 *
 * The match UI computes a `why` for every action it offers and disables the
 * control when there is one (`invokeWhy`, `leaderInvokeWhy`, `abilityWhy`). The
 * Wellspring row was the last control rendered on a bare "is it my main phase"
 * check, and the engine's gate is strictly narrower than that: `playWellspring`
 * requires `inOwnMainClear`, which is `inOwnMain` AND an empty stack.
 *
 * So with anything waiting to resolve, the seven Wellspring dots stayed live,
 * coloured and clickable, and a click was answered with "One Wellspring per
 * turn, in your own main phase" — a sentence wrong about both halves of why it
 * failed. The Playwright driver found it the way a harness finds this class of
 * bug: it pressed the control, nothing happened, it pressed it again, and the
 * board never moved for the rest of the match.
 *
 * What is pinned here is the ENGINE half — the exact predicate the UI's gate
 * has to mirror. If `playWellspring` ever loosens or tightens, this fails and
 * the UI gate gets revisited with it, rather than the two drifting apart again
 * and being rediscovered by a hang.
 */
import { describe, expect, test } from 'vitest';
import { CardDef } from './cards';
import {
  DeckDef,
  GameState,
  createGame,
  endPhase,
  invokeCard,
  makeCardInst,
  mulberry32,
  playWellspring,
  summonUnit,
  wellspringAllowance,
} from './engine';

const LEADER: CardDef = {
  id: 'test_leader',
  name: 'Test Leader',
  type: 'Leader',
  cost: { generic: 1, pips: {} },
  resolve: 3,
};

/** A free Quick Event, so it can sit on the stack without needing essence. */
const QUICK: CardDef = {
  id: 'quick_hold',
  name: 'Quick Hold',
  type: 'Event',
  subtype: 'Quick',
  cost: { generic: 0, pips: {} },
  onInvoke: { action: 'draw', value: 1, target: 'self' },
};

/** A free removal Quick Event — the idle player's reason to hold priority. */
const QUICK_KILL: CardDef = {
  id: 'quick_kill',
  name: 'Quick Kill',
  type: 'Event',
  subtype: 'Quick',
  cost: { generic: 0, pips: {} },
  onInvoke: { action: 'shatter', value: 0, target: 'enemyUnit' },
};

const FILLER: CardDef = {
  id: 'filler',
  name: 'Filler',
  type: 'Unit',
  cost: { generic: 0, pips: {} },
  might: 1,
  grit: 1,
};

const POOL: Record<string, CardDef> = { [LEADER.id]: LEADER, [FILLER.id]: FILLER };

function game(): GameState {
  const dd: DeckDef = { leaderId: LEADER.id, cards: Array(30).fill(FILLER.id) };
  return createGame(dd, dd, POOL, { rng: mulberry32(3), shuffle: false, handSize: 0 });
}

describe('the Wellspring gate the UI has to mirror', () => {
  test('a Wellspring is refused while anything is on the stack', () => {
    const state = game();
    const active = state.active;
    const idle = active === 'P1' ? 'P2' : 'P1';
    // The stack only HOLDS while the other player has an answer worth keeping
    // priority for — `invokeCard` settles it otherwise. A free removal Quick
    // Event and a body worth aiming it at is the same shape the v20 suite uses,
    // and it is the shape a real match produces constantly.
    summonUnit(state, active, {
      id: 'colossus',
      name: 'Tide Colossus',
      type: 'Unit',
      cost: { generic: 0, pips: {} },
      might: 7,
      grit: 7,
    });
    const answer = makeCardInst(QUICK_KILL);
    state.players[idle].hand.push(answer);

    // Something waiting to resolve, in the active player's own Main I.
    const inst = makeCardInst(QUICK);
    state.players[active].hand.push(inst);
    expect(invokeCard(state, active, inst.iid)).toBe(true);
    expect(state.stack.length).toBeGreaterThan(0);

    // The allowance is untouched — this is purely the stack clause.
    expect(state.players[active].wellspringPlayedThisTurn).toBe(false);
    expect(wellspringAllowance(state, active)).toBeGreaterThan(0);
    expect(playWellspring(state, active, 'Tide')).toBe(false);
    expect(state.players[active].locations).toHaveLength(0);
  });

  test('and allowed again the moment the stack is clear', () => {
    const state = game();
    const active = state.active;
    expect(playWellspring(state, active, 'Tide')).toBe(true);
    expect(state.players[active].locations).toHaveLength(1);
  });

  test('the allowance, not the boolean, is what runs out', () => {
    const state = game();
    const active = state.active;
    const allowance = wellspringAllowance(state, active);
    for (let i = 0; i < allowance; i++) {
      expect(playWellspring(state, active, 'Tide')).toBe(true);
    }
    expect(state.players[active].wellspringPlayedThisTurn).toBe(true);
    expect(playWellspring(state, active, 'Tide')).toBe(false);
    expect(state.players[active].locations).toHaveLength(allowance);
  });

  test('a Wellspring is refused outside the main phases', () => {
    const state = game();
    const active = state.active;
    endPhase(state); // Main1 -> Clash
    expect(state.phase).toBe('Clash');
    expect(playWellspring(state, active, 'Tide')).toBe(false);
    expect(state.players[active].locations).toHaveLength(0);
  });

  test('and refused on the opponent’s turn', () => {
    const state = game();
    const idle = state.active === 'P1' ? 'P2' : 'P1';
    expect(playWellspring(state, idle, 'Tide')).toBe(false);
    expect(state.players[idle].locations).toHaveLength(0);
  });
});
