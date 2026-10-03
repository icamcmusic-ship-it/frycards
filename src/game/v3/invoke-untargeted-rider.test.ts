/**
 * A Unit, Item or Location whose "enters" rider has no legal target keeps its
 * body and loses only the rider. Only an Event — which is nothing but its
 * effect — is refused. `canInvoke` must agree with `invokeCard` either way.
 */
import { describe, expect, test } from 'vitest';
import { CardDef } from './cards';
import { DeckDef, GameState, canInvoke, createGame, invokeCard, mulberry32 } from './engine';

const LEADER: CardDef = {
  id: 'test_leader',
  name: 'Test Leader',
  type: 'Leader',
  cost: { generic: 0, pips: {} },
  resolve: 3,
  leaderAbilities: [],
};
const FILLER: CardDef = {
  id: 'filler',
  name: 'Filler',
  type: 'Unit',
  cost: { generic: 0, pips: {} },
  might: 1,
  grit: 1,
};
const zap = { action: 'damage', value: 2, target: 'enemyUnit' } as const;
const RIDER_UNIT: CardDef = { ...FILLER, id: 'rider_unit', name: 'Rider Unit', onInvoke: zap };
const RIDER_EVENT: CardDef = {
  id: 'rider_event',
  name: 'Rider Event',
  type: 'Event',
  subtype: 'Slow',
  cost: { generic: 0, pips: {} },
  onInvoke: zap,
};
const POOL: Record<string, CardDef> = Object.fromEntries(
  [LEADER, FILLER, RIDER_UNIT, RIDER_EVENT].map((c) => [c.id, c]),
);

function emptyBoard(): GameState {
  const dd = (): DeckDef => ({ leaderId: LEADER.id, cards: Array(30).fill(FILLER.id) });
  const s = createGame(dd(), dd(), POOL, { rng: mulberry32(3), shuffle: false, handSize: 0 });
  s.phase = 'Main1';
  return s;
}

const give = (s: GameState, def: CardDef): string => {
  const iid = `${def.id}#t`;
  s.players[s.active].hand.push({ iid, def } as never);
  return iid;
};

describe('targeted rider with no legal target', () => {
  test('a Unit still enters and only the rider fizzles', () => {
    const s = emptyBoard();
    const pid = s.active;
    const iid = give(s, RIDER_UNIT);
    expect(canInvoke(s, pid, iid)).toBe(true);
    expect(invokeCard(s, pid, iid)).toBe(true);
    expect(s.players[pid].field.map((u) => u.def.id)).toContain('rider_unit');
  });

  test('an Event is refused, and canInvoke says so', () => {
    const s = emptyBoard();
    const pid = s.active;
    const iid = give(s, RIDER_EVENT);
    expect(canInvoke(s, pid, iid)).toBe(false);
    expect(invokeCard(s, pid, iid)).toBe(false);
    expect(s.players[pid].hand.some((c) => c.iid === iid)).toBe(true);
  });

  test('an explicitly chosen illegal target is still refused', () => {
    const s = emptyBoard();
    const pid = s.active;
    const iid = give(s, RIDER_UNIT);
    expect(invokeCard(s, pid, iid, { targetIid: 'nope#1' })).toBe(false);
  });

  test('the rider still fires when a target exists', () => {
    const s = emptyBoard();
    const pid = s.active;
    const foeUnit = { ...FILLER, id: 'foe', name: 'Foe', grit: 5 };
    s.players[pid === 'P1' ? 'P2' : 'P1'].field.push({
      iid: 'foe#1',
      def: foeUnit,
      owner: pid === 'P1' ? 'P2' : 'P1',
      damage: 0,
      exhausted: false,
      enteredThisTurn: false,
      permMight: 0,
      permGrit: 0,
      items: [],
    } as never);
    const iid = give(s, RIDER_UNIT);
    expect(invokeCard(s, pid, iid)).toBe(true);
    const foe = s.players[pid === 'P1' ? 'P2' : 'P1'].field[0];
    expect(foe.damage).toBe(2);
  });
});
