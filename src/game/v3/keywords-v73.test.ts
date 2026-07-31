/**
 * v7.3 content tests: the eight new NON-Unit keywords.
 *
 * Units carried 23 keywords while Event/Item/Location/Leader had two apiece,
 * so a non-Unit card's keyword slot was a coin flip between the same two
 * options pool-wide, and none of the four types had any colour identity in
 * its vocabulary. This suite pins the behaviour of each new keyword against
 * the engine hook it actually resolves through, not just its registry entry.
 */
import { describe, expect, test } from 'vitest';
import { CardDef, LEADER_HP } from './cards';
import {
  DeckDef,
  GameState,
  applyEffect,
  createGame,
  effGrit,
  effectiveCost,
  endPhase,
  invokeCard,
  mulberry32,
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
const WARLORD_LEADER: CardDef = { ...LEADER, id: 'warlord_leader', keywords: ['Warlord'] };
const VANILLA: CardDef = {
  id: 'vanilla',
  name: 'Vanilla',
  type: 'Unit',
  cost: { generic: 0, pips: {} },
  might: 2,
  grit: 2,
};

const sanctum = (id: string, keywords: string[] = []): CardDef => ({
  id,
  name: id,
  type: 'Location',
  subtype: 'Sanctum',
  cost: { generic: 0, pips: {} },
  produces: 'Ember',
  keywords,
});

const POOL: Record<string, CardDef> = {
  [LEADER.id]: LEADER,
  [WARLORD_LEADER.id]: WARLORD_LEADER,
  [VANILLA.id]: VANILLA,
};

function game(leaderId = LEADER.id): GameState {
  const dd = (): DeckDef => ({ leaderId, cards: Array(30).fill(VANILLA.id) });
  return createGame(dd(), dd(), POOL, { rng: mulberry32(7), shuffle: false, handSize: 0 });
}

/** Put a Location straight onto a player's board, bypassing cost/timing. */
function placeSanctum(s: GameState, pid: 'P1' | 'P2', def: CardDef, iid: string): void {
  s.players[pid].locations.push({ iid, def, produces: def.produces!, exhausted: false });
}

/** Basic Wellsprings live in the same array with NO def — they are not Sanctums. */
function placeWellspring(s: GameState, pid: 'P1' | 'P2', iid: string): void {
  s.players[pid].locations.push({ iid, produces: 'Ember', exhausted: false } as never);
}

/** Run the active player's turn round to their next Dawn. */
function toNextDawn(s: GameState): void {
  s.phase = 'Main2';
  endPhase(s); // Dusk -> hands over to the opponent
  s.phase = 'Main2';
  endPhase(s); // opponent's Dusk -> back to us, through our Dawn
}

// ---------------------------------------------------------------------------
describe('v7.3 Leader keyword — Warlord', () => {
  test('grants +1 Grit to your units while the Leader is fielded', () => {
    const s = game(WARLORD_LEADER.id);
    const u = summonUnit(s, 'P1', VANILLA);
    expect(effGrit(s, u)).toBe(2);

    s.players.P1.leader.invoked = true;
    expect(effGrit(s, u)).toBe(3);

    // ...and only while it is actually on the field.
    s.players.P1.leader.shattered = true;
    expect(effGrit(s, u)).toBe(2);
  });

  test('does not leak across seats', () => {
    const s = game(WARLORD_LEADER.id);
    s.players.P1.leader.invoked = true;
    const enemy = summonUnit(s, 'P2', VANILLA);
    expect(effGrit(s, enemy)).toBe(2);
  });
});

describe('v7.3 Location keywords', () => {
  test('Bulwark reduces each hit to its controller, stacks, and never heals', () => {
    const s = game();
    const hit = (n: number) =>
      applyEffect(s, 'P2', { action: 'damage', value: n, target: 'enemyPlayer' });

    // Baseline: no Bulwark, full damage.
    s.players.P1.vitality = LEADER_HP;
    hit(3);
    expect(s.players.P1.vitality).toBe(LEADER_HP - 3);

    // One Bulwark shaves a point off.
    placeSanctum(s, 'P1', sanctum('bul', ['Bulwark']), 'bul#1');
    s.players.P1.vitality = LEADER_HP;
    hit(3);
    expect(s.players.P1.vitality).toBe(LEADER_HP - 2);

    // Two stack.
    placeSanctum(s, 'P1', sanctum('bul2', ['Bulwark']), 'bul#2');
    s.players.P1.vitality = LEADER_HP;
    hit(3);
    expect(s.players.P1.vitality).toBe(LEADER_HP - 1);

    // A hit smaller than the reduction is fully absorbed — never inverted
    // into healing, which is what a bare `vitality -= amount - n` would do.
    s.players.P1.vitality = LEADER_HP - 5;
    hit(1);
    expect(s.players.P1.vitality).toBe(LEADER_HP - 5);
  });

  test('Archivist draws only once you control 3+ real Sanctums', () => {
    const s = game();
    placeSanctum(s, 'P1', sanctum('arch', ['Archivist']), 'arch#1');
    // Wellsprings are NOT Sanctums — three of them must not switch it on.
    placeWellspring(s, 'P1', 'ws#1');
    placeWellspring(s, 'P1', 'ws#2');
    placeWellspring(s, 'P1', 'ws#3');

    const handBefore = s.players.P1.hand.length;
    toNextDawn(s);
    // One Dawn draw only — Archivist stayed off.
    expect(s.players.P1.hand.length).toBe(handBefore + 1);

    // Add two more real Sanctums and it switches on.
    placeSanctum(s, 'P1', sanctum('s2'), 's2#1');
    placeSanctum(s, 'P1', sanctum('s3'), 's3#1');
    const handMid = s.players.P1.hand.length;
    toNextDawn(s);
    expect(s.players.P1.hand.length).toBe(handMid + 2); // Dawn draw + Archivist
  });
});

describe('v7.3 Event keywords', () => {
  test('Ritual discounts only at 3+ real Sanctums, and Wellsprings do not count', () => {
    const s = game();
    const ev: CardDef = {
      id: 'ritual_ev',
      name: 'Ritual Event',
      type: 'Event',
      subtype: 'Quick',
      cost: { generic: 3, pips: {} },
      keywords: ['Ritual'],
      onInvoke: { action: 'draw', value: 1, target: 'none' },
    };

    expect(effectiveCost(s, 'P1', ev)!.generic).toBe(3);

    placeWellspring(s, 'P1', 'ws#1');
    placeWellspring(s, 'P1', 'ws#2');
    placeWellspring(s, 'P1', 'ws#3');
    // Three Wellsprings are not three Sanctums — this is the bug the keyword
    // shipped with on first draft, which left Ritual permanently on.
    expect(effectiveCost(s, 'P1', ev)!.generic).toBe(3);

    placeSanctum(s, 'P1', sanctum('s1'), 's1#1');
    placeSanctum(s, 'P1', sanctum('s2'), 's2#1');
    placeSanctum(s, 'P1', sanctum('s3'), 's3#1');
    expect(effectiveCost(s, 'P1', ev)!.generic).toBe(2);
  });

  test('Echoing replaces the Event that carries it', () => {
    const s = game();
    const ev: CardDef = {
      id: 'echo_ev',
      name: 'Echo Event',
      type: 'Event',
      subtype: 'Quick',
      cost: { generic: 0, pips: {} },
      keywords: ['Echoing'],
      onInvoke: { action: 'heal', value: 1, target: 'friendlyPlayer' },
    };
    POOL[ev.id] = ev;
    s.players.P1.hand.push({ iid: 'echo#1', def: ev });
    s.phase = 'Main1';
    s.active = 'P1';

    const before = s.players.P1.hand.length;
    expect(invokeCard(s, 'P1', 'echo#1', {})).toBe(true);
    // -1 for the Event leaving hand, +1 from Echoing.
    expect(s.players.P1.hand.length).toBe(before);
  });
});

describe('v7.3 Item keywords', () => {
  test('Tethered recovers the unit it bonds to', () => {
    const s = game();
    const u = summonUnit(s, 'P1', VANILLA);
    u.exhausted = true;
    const item: CardDef = {
      id: 'tether',
      name: 'Tether',
      type: 'Item',
      subtype: 'Charm',
      cost: { generic: 0, pips: {} },
      keywords: ['Tethered'],
      bond: { might: 1 },
    };
    POOL[item.id] = item;
    s.players.P1.hand.push({ iid: 'teth#1', def: item });
    s.phase = 'Main1';
    s.active = 'P1';

    expect(invokeCard(s, 'P1', 'teth#1', { bondTargetIid: u.iid })).toBe(true);
    expect(u.exhausted).toBe(false);
  });

  test('Empowering grows its bonded unit every Dawn, permanently', () => {
    const s = game();
    const u = summonUnit(s, 'P1', VANILLA);
    const item: CardDef = {
      id: 'empower',
      name: 'Empower',
      type: 'Item',
      subtype: 'Charm',
      cost: { generic: 0, pips: {} },
      keywords: ['Empowering'],
      bond: {},
    };
    u.items.push({ iid: 'emp#1', def: item });

    expect(u.permMight).toBe(0);
    toNextDawn(s);
    expect(u.permMight).toBe(1);
    toNextDawn(s);
    expect(u.permMight).toBe(2);
  });
});
