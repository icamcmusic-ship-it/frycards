/**
 * Fry Cards stack & APNAP priority tests: cards and triggers wait on the
 * stack, either player gets a window to answer, items resolve last-in
 * first-out, and an item whose target left in response fizzles.
 */
import { describe, expect, test } from 'vitest';
import { CardDef } from './cards';
import {
  DeckDef,
  GameState,
  PlayerId,
  apnapOrder,
  canInvoke,
  createGame,
  declareAttackers,
  declareGuards,
  endPhase,
  findUnit,
  hasInstantResponse,
  hasPriority,
  invokeCard,
  isInstantSpeed,
  makeCardInst,
  mulberry32,
  passPriority,
  resolveClash,
  settleStack,
  summonUnit,
  opponentOf,
} from './engine';
import { playTurn } from './ai';

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

/** A free Quick Event that shatters an enemy unit — the response card. */
const QUICK_KILL: CardDef = {
  id: 'quick_kill',
  name: 'Quick Kill',
  type: 'Event',
  subtype: 'Quick',
  cost: { generic: 0, pips: {} },
  onInvoke: { action: 'shatter', value: 0, target: 'enemyUnit' },
};

const SLOW_KILL: CardDef = { ...QUICK_KILL, id: 'slow_kill', name: 'Slow Kill', subtype: 'Slow' };

const POOL: Record<string, CardDef> = { [LEADER.id]: LEADER };

function game(): GameState {
  const dd: DeckDef = { leaderId: LEADER.id, cards: [] };
  return createGame(dd, dd, POOL, { rng: mulberry32(7), shuffle: false, handSize: 0 });
}

function toHand(state: GameState, pid: PlayerId, def: CardDef): string {
  const inst = makeCardInst(def);
  state.players[pid].hand.push(inst);
  return inst.iid;
}

describe('stack basics', () => {
  test('a game starts with an empty stack and no open priority window', () => {
    const s = game();
    expect(s.stack).toEqual([]);
    expect(s.priority).toBeNull();
  });

  test('APNAP order is active player first', () => {
    const s = game();
    expect(apnapOrder(s)).toEqual([s.active, s.active === 'P1' ? 'P2' : 'P1']);
  });

  test('instant speed is Quick Events and Ambush units only', () => {
    expect(isInstantSpeed(QUICK_KILL)).toBe(true);
    expect(isInstantSpeed(SLOW_KILL)).toBe(false);
    expect(isInstantSpeed(U('amb', 1, 1, ['Ambush']))).toBe(true);
    expect(isInstantSpeed(U('plain', 1, 1))).toBe(false);
  });

  test('with no possible response the stack drains inside invokeCard', () => {
    const s = game();
    const iid = toHand(s, 'P1', U('body', 2, 2));
    expect(invokeCard(s, 'P1', iid)).toBe(true);
    expect(s.stack).toHaveLength(0);
    expect(s.players.P1.field).toHaveLength(1);
  });
});

describe('priority windows', () => {
  test('the opponent holds priority over a card they can answer', () => {
    const s = game();
    toHand(s, 'P2', QUICK_KILL);
    expect(hasInstantResponse(s, 'P2')).toBe(true);

    const body = toHand(s, 'P1', U('body', 2, 2));
    expect(invokeCard(s, 'P1', body)).toBe(true);
    // Not resolved: P2 gets to answer first.
    expect(s.stack).toHaveLength(1);
    expect(hasPriority(s, 'P2')).toBe(true);
    expect(s.players.P1.field).toHaveLength(0);

    // P2 declines; the unit resolves and the window closes.
    passPriority(s, 'P2');
    settleStack(s);
    expect(s.stack).toHaveLength(0);
    expect(s.players.P1.field).toHaveLength(1);
  });

  test('a player never stops the loop to respond to their own card', () => {
    const s = game();
    toHand(s, 'P1', QUICK_KILL); // P1 holds an answer, but it is P1 acting
    const body = toHand(s, 'P1', U('body', 2, 2));
    expect(invokeCard(s, 'P1', body)).toBe(true);
    expect(s.stack).toHaveLength(0);
    expect(s.players.P1.field).toHaveLength(1);
  });

  test('a player with no affordable answer is auto-passed', () => {
    const s = game();
    const pricey: CardDef = { ...QUICK_KILL, cost: { generic: 5, pips: {} } };
    toHand(s, 'P2', pricey);
    expect(hasInstantResponse(s, 'P2')).toBe(false);
    const body = toHand(s, 'P1', U('body', 2, 2));
    invokeCard(s, 'P1', body);
    expect(s.stack).toHaveLength(0);
  });

  test('passPriority is refused from the player who does not hold it', () => {
    const s = game();
    toHand(s, 'P2', QUICK_KILL);
    invokeCard(s, 'P1', toHand(s, 'P1', U('body', 2, 2)));
    expect(passPriority(s, 'P1')).toBe(false);
    expect(passPriority(s, 'P2')).toBe(true);
  });
});

describe('responding on the stack', () => {
  test('a response resolves before the card it answers (LIFO)', () => {
    const s = game();
    const victim = summonUnit(s, 'P1', U('victim', 3, 3));
    const answer = toHand(s, 'P2', QUICK_KILL);

    // P1 invokes a second body; P2 responds by killing the one already out.
    invokeCard(s, 'P1', toHand(s, 'P1', U('body', 2, 2)));
    expect(hasPriority(s, 'P2')).toBe(true);
    expect(invokeCard(s, 'P2', answer, { targetIid: victim.iid })).toBe(true);

    settleStack(s);
    expect(s.stack).toHaveLength(0);
    // The response killed the older unit; the answered card still resolved.
    expect(findUnit(s, victim.iid)).toBeUndefined();
    expect(s.players.P1.field.map((u) => u.def.id)).toEqual(['body']);
  });

  test('an Event fizzles when its target dies in response', () => {
    const s = game();
    const target = summonUnit(s, 'P2', U('target', 3, 3));
    // P1 aims removal at P2's unit; P2 answers by shattering it first, so
    // P1's Event has nothing left to hit.
    const p1Kill = toHand(s, 'P1', QUICK_KILL);
    const p2Sac = toHand(s, 'P2', {
      ...QUICK_KILL,
      id: 'sac',
      name: 'Sac',
      onInvoke: { action: 'shatter', value: 0, target: 'friendlyUnit' },
    });

    expect(invokeCard(s, 'P1', p1Kill, { targetIid: target.iid })).toBe(true);
    expect(hasPriority(s, 'P2')).toBe(true);
    expect(invokeCard(s, 'P2', p2Sac, { targetIid: target.iid })).toBe(true);

    settleStack(s);
    expect(findUnit(s, target.iid)).toBeUndefined();
    expect(s.log.some((l) => l.includes('fizzles'))).toBe(true);
  });

  test('an Item whose bond target dies in response is not lost silently', () => {
    const s = game();
    const host = summonUnit(s, 'P1', U('host', 2, 2));
    const item: CardDef = {
      id: 'item',
      name: 'Item',
      type: 'Item',
      subtype: 'Weapon',
      cost: { generic: 0, pips: {} },
    };
    const itemIid = toHand(s, 'P1', item);
    const answer = toHand(s, 'P2', QUICK_KILL);

    expect(invokeCard(s, 'P1', itemIid, { bondTargetIid: host.iid })).toBe(true);
    expect(invokeCard(s, 'P2', answer, { targetIid: host.iid })).toBe(true);
    settleStack(s);

    expect(findUnit(s, host.iid)).toBeUndefined();
    // Worn Items survive their host, so it lands in the Worn row unbonded.
    expect(s.players.P1.unbondedItems.map((c) => c.iid)).toContain(itemIid);
  });
});

describe('timing windows', () => {
  test('sorcery speed is blocked while something is on the stack', () => {
    const s = game();
    toHand(s, 'P2', QUICK_KILL); // keeps the window open
    const slow = toHand(s, 'P1', SLOW_KILL);
    summonUnit(s, 'P2', U('bait', 1, 1));

    invokeCard(s, 'P1', toHand(s, 'P1', U('body', 2, 2)));
    expect(s.stack).toHaveLength(1);
    expect(canInvoke(s, 'P1', slow)).toBe(false);
  });

  test('the clash reaction window opens a real priority round', () => {
    const s = game();
    const atk = summonUnit(s, 'P1', U('atk', 2, 2));
    endPhase(s); // Main1 -> Clash
    expect(declareAttackers(s, [atk.iid])).toBe(true);
    expect(declareGuards(s, {})).toBe(true);
    // APNAP: the active player speaks first in the window.
    expect(s.priority?.holder).toBe(s.active);
  });

  test('resolveClash closes the window and clears priority', () => {
    const s = game();
    const atk = summonUnit(s, 'P1', U('atk', 2, 2));
    endPhase(s);
    declareAttackers(s, [atk.iid]);
    declareGuards(s, {});
    expect(resolveClash(s)).toBe(true);
    expect(s.priority).toBeNull();
    expect(s.stack).toHaveLength(0);
  });
});

describe('triggers on the stack', () => {
  test("an 'enters' trigger goes on the stack and can be responded to", () => {
    const s = game();
    const bait = summonUnit(s, 'P1', U('bait', 1, 1));
    const answer = toHand(s, 'P2', QUICK_KILL);
    const trigUnit = U('trig', 1, 1, [], {
      triggers: [{ when: 'enters', effect: { action: 'damage', value: 1, target: 'enemyUnit' } }],
    });

    invokeCard(s, 'P1', toHand(s, 'P1', trigUnit));
    // P2 answers the unit itself before its trigger ever exists.
    expect(hasPriority(s, 'P2')).toBe(true);
    expect(invokeCard(s, 'P2', answer, { targetIid: bait.iid })).toBe(true);
    settleStack(s);
    expect(s.stack).toHaveLength(0);
    expect(findUnit(s, bait.iid)).toBeUndefined();
  });

  test('Dawn and Dusk triggers resolve with no response window', () => {
    const s = game();
    toHand(s, 'P2', QUICK_KILL);
    summonUnit(
      s,
      s.active,
      U('dawner', 1, 1, [], {
        triggers: [{ when: 'atDusk', effect: { action: 'draw', value: 1, target: 'none' } }],
      }),
    );
    s.players[s.active].deck.push(makeCardInst(U('card', 1, 1)));
    const before = s.players[s.active].hand.length;
    const acting = s.active;
    endPhase(s); // Main1 -> Clash
    endPhase(s); // Clash -> Main2
    endPhase(s); // Main2 -> Dusk, turn passes
    expect(s.players[acting].hand.length).toBeGreaterThan(before);
    expect(s.stack).toHaveLength(0);
  });
});

describe('handing a response window to the opponent', () => {
  /** A deck the CPU can actually develop out of, so playTurn has plays to
   * make and something to put on the stack. */
  const BODY = U('body', 2, 2);
  const TURN_POOL: Record<string, CardDef> = { ...POOL, [BODY.id]: BODY };

  function turnGame(): GameState {
    const dd: DeckDef = { leaderId: LEADER.id, cards: Array(20).fill(BODY.id) };
    return createGame(dd, dd, TURN_POOL, { rng: mulberry32(3), shuffle: false, handSize: 4 });
  }

  test('playTurn resolves through response windows when no hook is installed', () => {
    const s = turnGame();
    toHand(s, opponentOf(s.active), QUICK_KILL);
    playTurn(s, s.active);
    // Nobody was there to take the window, so nothing is left waiting.
    expect(s.stack).toHaveLength(0);
    expect(s.priority).toBeNull();
  });

  test('onOpponentPriority fires with the opponent holding a real window', () => {
    const s = turnGame();
    const foe = opponentOf(s.active);
    toHand(s, foe, QUICK_KILL);
    const seen: PlayerId[] = [];
    playTurn(s, s.active, {
      onOpponentPriority: (state, to) => {
        seen.push(to);
        // Take the window the way the UI does — pass and settle.
        passPriority(state, to);
        settleStack(state, { interactive: false });
      },
    });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((p) => p === foe)).toBe(true);
    expect(s.stack).toHaveLength(0);
  });

  test('a hook that throws leaves the turn paused with the window open', () => {
    const s = turnGame();
    const foe = opponentOf(s.active);
    toHand(s, foe, QUICK_KILL);
    const PAUSE = { pause: true };
    expect(() =>
      playTurn(s, s.active, {
        onOpponentPriority: () => {
          throw PAUSE;
        },
      }),
    ).toThrow();
    expect(s.stack.length).toBeGreaterThan(0);
    expect(hasPriority(s, foe)).toBe(true);

    // Resuming is just re-entering playTurn once the window is closed.
    passPriority(s, foe);
    settleStack(s, { interactive: false });
    playTurn(s, s.active, { onOpponentPriority: () => settleStack(s, { interactive: false }) });
    expect(s.stack).toHaveLength(0);
  });
});
