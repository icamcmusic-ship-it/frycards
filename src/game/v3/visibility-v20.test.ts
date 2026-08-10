/**
 * v20 CPU-visibility suite — the stack, and where an attack is pointed.
 *
 * Three passes have now closed a place the CPU acted without saying so: v18
 * the clash reaction window, v19 the guard step. This one closes the last of
 * them, the CPU's PRIORITY WINDOW over the stack, and fixes the half of the
 * attack beat that never said what the attack was aimed at.
 *
 * What is pinned here:
 *
 *  1. `respondToStack` reports what it played, with the catalog id the
 *     mid-board spotlight looks the card face up by. The observer parameter
 *     has existed since the AI was written and the match UI passed nothing, so
 *     the CPU's counter-play arrived as a banner over a board that had already
 *     changed. The narration is only as good as this event stream, so the
 *     stream is what a test can hold still.
 *  2. A window in which the CPU has no answer produces NO events and returns
 *     0 — which is what lets the UI gate the narration run on `plays > 0`
 *     instead of parking an empty bubble on a board that is waiting for the
 *     player.
 *  3. The event's `targetIid` is the unit the answer was aimed at, so the red
 *     ring lands on the thing that is about to die rather than nowhere.
 *  4. An attack beat carries the defending player's seat in `targets`. v19
 *     gave the mirror case a ring — when the CPU declines to guard,
 *     `buildGuardBeats` rings the CPU's own Vitality plate because that is
 *     what the unblocked Might is pointed at — and the declaration itself,
 *     the louder half, still rang nothing but the attackers.
 */
import { describe, expect, test } from 'vitest';
import { buildCpuBeats } from '../../components/GameV4';
import { respondToStack, type CpuTurnEvent } from './ai';
import { CardDef } from './cards';
import {
  DeckDef,
  GameState,
  PlayerId,
  createGame,
  hasPriority,
  invokeCard,
  makeCardInst,
  mulberry32,
  summonUnit,
} from './engine';

const U = (id: string, might: number, grit: number, keywords: string[] = []): CardDef => ({
  id,
  name: id,
  type: 'Unit',
  cost: { generic: 0, pips: {} },
  might,
  grit,
  keywords,
});

const LEADER: CardDef = {
  id: 'test_leader',
  name: 'Test Leader',
  type: 'Leader',
  cost: { generic: 1, pips: {} },
  resolve: 3,
};

/** A free Quick Event that shatters an enemy unit — the CPU's answer. */
const QUICK_KILL: CardDef = {
  id: 'quick_kill',
  name: 'Quick Kill',
  type: 'Event',
  subtype: 'Quick',
  cost: { generic: 0, pips: {} },
  onInvoke: { action: 'shatter', value: 0, target: 'enemyUnit' },
};

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

/**
 * P1 (the human seat) invokes a body while P2 (the CPU) holds a free answer
 * and has a worthwhile target already on the board — the shape of every
 * "I played a card and the CPU answered it" moment in a real match.
 */
function stackWithCpuAnswer(): { state: GameState; victimIid: string } {
  const state = game();
  // A big enough body that the CPU's own judgement rates it worth answering.
  const victim = summonUnit(state, 'P1', U('Tide Colossus', 7, 7))!;
  toHand(state, 'P2', QUICK_KILL);
  expect(invokeCard(state, 'P1', toHand(state, 'P1', U('Reef Hound', 2, 2)))).toBe(true);
  // Not resolved — the CPU holds priority over it.
  expect(hasPriority(state, 'P2')).toBe(true);
  return { state, victimIid: victim.iid };
}

describe("the CPU's answers on the stack are observable", () => {
  test('respondToStack reports the card it played, with the id the spotlight needs', () => {
    const { state } = stackWithCpuAnswer();
    const events: CpuTurnEvent[] = [];
    const plays = respondToStack(state, 'P2', (ev) => events.push(ev));

    expect(plays).toBeGreaterThan(0);
    const invokes = events.filter((e) => e.kind === 'invoke');
    expect(invokes).toHaveLength(1);
    const ev = invokes[0] as Extract<CpuTurnEvent, { kind: 'invoke' }>;
    expect(ev.name).toBe('Quick Kill');
    // Without defId the beat has a name and no face, which is the difference
    // the mid-board spotlight exists to make.
    expect(ev.defId).toBe('quick_kill');
  });

  test('the event names the unit the answer was aimed at', () => {
    const { state, victimIid } = stackWithCpuAnswer();
    const events: CpuTurnEvent[] = [];
    respondToStack(state, 'P2', (ev) => events.push(ev));
    const ev = events.find((e) => e.kind === 'invoke') as Extract<CpuTurnEvent, { kind: 'invoke' }>;
    expect(ev.targetIid).toBe(victimIid);
  });

  test('a window with nothing to answer with reports nothing at all', () => {
    const state = game();
    summonUnit(state, 'P1', U('Tide Colossus', 7, 7));
    // The CPU's only instant is unaffordable, so it never gets priority.
    const pricey: CardDef = { ...QUICK_KILL, cost: { generic: 9, pips: {} } };
    toHand(state, 'P2', pricey);
    invokeCard(state, 'P1', toHand(state, 'P1', U('Reef Hound', 2, 2)));

    const events: CpuTurnEvent[] = [];
    const plays = respondToStack(state, 'P2', (ev) => events.push(ev));
    expect(plays).toBe(0);
    expect(events).toEqual([]);
  });

  test('the beat built from that event carries the card face and the target ring', () => {
    const { state, victimIid } = stackWithCpuAnswer();
    const logStart = state.log.length;
    const events: CpuTurnEvent[] = [];
    respondToStack(state, 'P2', (ev) => {
      // The UI stamps logAt itself here — respondToStack has no playTurn
      // wrapper doing it, exactly as for the clash reactions in v18.
      ev.logAt = state.log.length;
      events.push(ev);
    });

    const lines = state.log.slice(logStart);
    expect(lines.length).toBeGreaterThan(0);
    const beats = buildCpuBeats(lines, logStart, events);
    expect(beats).toHaveLength(lines.length);
    const spotlit = beats.find((b) => b.cardId === 'quick_kill');
    expect(spotlit).toBeDefined();
    expect(spotlit!.targets).toContain(victimIid);
  });
});

describe('an attack beat says what it is aimed at', () => {
  test("the defending player's seat is a target, so their Vitality plate rings", () => {
    const beats = buildCpuBeats(['attacks with 2 unit(s).'], 0, [
      { kind: 'attack', iids: ['a1', 'a2'], names: ['A', 'B'], logAt: 1 },
    ]);
    expect(beats[0].attacking).toBe(true);
    expect(beats[0].actors).toEqual(['a1', 'a2']);
    // 'P1' — the human seat. The attackers lunge AND the plate they are
    // pointed at pulses, the same grammar buildGuardBeats uses in reverse.
    expect(beats[0].targets).toEqual(['P1']);
  });

  test('a non-attack beat does not ring the player for free', () => {
    const beats = buildCpuBeats(['invokes Glass Squid.'], 0, [
      { kind: 'invoke', name: 'Glass Squid', iid: 'u1', defId: 'glass_squid', logAt: 1 },
    ]);
    expect(beats[0].targets).toEqual([]);
    expect(beats[0].attacking).toBeUndefined();
  });
});
