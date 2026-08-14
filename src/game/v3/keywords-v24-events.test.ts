/**
 * v24 content tests: the Event keyword generation — Kindle (Ember),
 * Tailwind (Gale), Luminous (Light).
 *
 * Events had printable colour text in Tide, Root, Void and Shadow but nothing
 * in Ember, Gale or Light — the widest colour hole any type still carried.
 * These three are implemented and pinned here engine-side; NONE is printed on
 * a pool card (no roll band includes them, UNPRINTED_KEYWORDS lists all
 * three), so the generated pool is byte-identical and the print is a future
 * content pass's own decision — the v7.5/v23 sequencing lesson.
 */
import { describe, expect, test } from 'vitest';
import { CardDef, LEADER_HP } from './cards';
import {
  DeckDef,
  GameState,
  createGame,
  invokeCard,
  mulberry32,
  settleStack,
  summonUnit,
} from './engine';

const LEADER: CardDef = {
  id: 'test_leader',
  name: 'Test Leader',
  type: 'Leader',
  cost: { generic: 0, pips: {} },
  resolve: 3,
  leaderAbilities: [],
};
const VANILLA: CardDef = {
  id: 'vanilla',
  name: 'Vanilla',
  type: 'Unit',
  cost: { generic: 0, pips: {} },
  might: 2,
  grit: 2,
};

const ev = (id: string, keywords: string[], onInvoke?: CardDef['onInvoke']): CardDef => ({
  id,
  name: id,
  type: 'Event',
  subtype: 'Quick',
  cost: { generic: 0, pips: {} },
  keywords,
  onInvoke,
});

const POOL: Record<string, CardDef> = {
  [LEADER.id]: LEADER,
  [VANILLA.id]: VANILLA,
};

function game(): GameState {
  const dd = (): DeckDef => ({ leaderId: LEADER.id, cards: Array(30).fill(VANILLA.id) });
  const s = createGame(dd(), dd(), POOL, { rng: mulberry32(7), shuffle: false, handSize: 0 });
  s.phase = 'Main1';
  s.active = 'P1';
  return s;
}

function cast(s: GameState, def: CardDef, iid: string): boolean {
  POOL[def.id] = def;
  s.players.P1.hand.push({ iid, def });
  return invokeCard(s, 'P1', iid, {});
}

// ---------------------------------------------------------------------------
describe('v24 Event keyword — Kindle', () => {
  test('deals 1 damage to the enemy player on resolve', () => {
    const s = game();
    expect(cast(s, ev('kindle_ev', ['Kindle']), 'k#1')).toBe(true);
    expect(s.players.P2.vitality).toBe(LEADER_HP - 1);
    expect(s.log.some((l) => l.includes('Kindle'))).toBe(true);
  });

  test('a Bulwark Sanctum absorbs the point — same rules as any other damage', () => {
    const s = game();
    s.players.P2.locations.push({
      iid: 'bul#1',
      def: {
        id: 'bulwark_sanctum',
        name: 'Bulwark Sanctum',
        type: 'Location',
        subtype: 'Sanctum',
        cost: { generic: 0, pips: {} },
        produces: 'Light',
        keywords: ['Bulwark'],
      },
      produces: 'Light',
      exhausted: false,
    });
    expect(cast(s, ev('kindle_ev2', ['Kindle']), 'k#2')).toBe(true);
    expect(s.players.P2.vitality).toBe(LEADER_HP);
  });
});

// ---------------------------------------------------------------------------
describe('v24 Event keyword — Tailwind', () => {
  test('recovers an exhausted friendly unit; enemy and ready units are untouched', () => {
    const s = game();
    const mine = summonUnit(s, 'P1', VANILLA);
    const fresh = summonUnit(s, 'P1', VANILLA);
    const theirs = summonUnit(s, 'P2', VANILLA);
    mine.exhausted = true;
    theirs.exhausted = true;

    expect(cast(s, ev('tail_ev', ['Tailwind']), 't#1')).toBe(true);
    expect(mine.exhausted).toBe(false);
    expect(fresh.exhausted).toBe(false);
    expect(theirs.exhausted).toBe(true); // never crosses the table
    expect(s.log.some((l) => l.includes('Tailwind'))).toBe(true);
  });

  test('no exhausted unit is a quiet no-op, not a crash', () => {
    const s = game();
    summonUnit(s, 'P1', VANILLA);
    expect(cast(s, ev('tail_ev2', ['Tailwind']), 't#2')).toBe(true);
    expect(s.log.some((l) => l.includes('Tailwind'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('v24 Event keyword — Luminous', () => {
  test('restores 1 Vitality on resolve, capped at the starting value', () => {
    const s = game();
    s.players.P1.vitality = LEADER_HP - 3;
    expect(cast(s, ev('lum_ev', ['Luminous']), 'l#1')).toBe(true);
    expect(s.players.P1.vitality).toBe(LEADER_HP - 2);

    // At the cap the rider does nothing — and logs nothing.
    s.players.P1.vitality = LEADER_HP;
    const logLen = s.log.length;
    expect(cast(s, ev('lum_ev2', ['Luminous']), 'l#2')).toBe(true);
    expect(s.players.P1.vitality).toBe(LEADER_HP);
    expect(s.log.slice(logLen).some((l) => l.includes('Luminous'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('v24 riders obey the fizzle rule like the v7.3/v7.5 riders', () => {
  test('all three do nothing when the Event fizzles', () => {
    const s = game();
    const def = ev('v24_all_ev', ['Kindle', 'Tailwind', 'Luminous'], {
      action: 'damage',
      value: 2,
      target: 'enemyUnit',
    });
    POOL[def.id] = def;
    const target = summonUnit(s, 'P2', VANILLA);
    const mine = summonUnit(s, 'P1', VANILLA);
    mine.exhausted = true;
    s.players.P1.vitality = LEADER_HP - 3;

    // On the stack aimed at the target, then the target leaves before it
    // resolves — the effect fizzles and every rider must stay silent.
    s.stack.push({
      id: 'stub-v24',
      kind: 'card',
      controller: 'P1',
      sourceName: def.name,
      card: { iid: 'v24#1', def },
      targetIid: target.iid,
      resolveTimes: 1,
    });
    s.players.P2.field = s.players.P2.field.filter((u) => u.iid !== target.iid);
    settleStack(s);

    expect(s.players.P2.vitality).toBe(LEADER_HP); // no Kindle
    expect(mine.exhausted).toBe(true); // no Tailwind
    expect(s.players.P1.vitality).toBe(LEADER_HP - 3); // no Luminous
  });
});
