/**
 * v9 deep bug-hunt regressions.
 *
 * Four engine defects found by the v9 sweep, each pinned here against the
 * behaviour the fix establishes:
 *  1. Hardened guards were unkillable in clash — the attacker never assigned
 *     the extra point Hardened absorbs.
 *  2. A clash hit fully absorbed by Hardened still fired dealsClashDamage /
 *     Tidecaller.
 *  3. A fizzled Event still ran its Echoing / Fate / Exhume riders.
 *  4. Dusk-death triggers (Scorched-Earth board wipe) leaked past the turn
 *     boundary and resolved only after the opponent's Dawn recharged
 *     Unbreakable saves.
 */
import { describe, expect, test } from 'vitest';
import { CardDef } from './cards';
import {
  DeckDef,
  GameState,
  createGame,
  declareAttackers,
  declareGuards,
  endPhase,
  findUnit,
  mulberry32,
  resolveClash,
  settleStack,
  summonUnit,
} from './engine';

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
  cost: { generic: 0, pips: {} },
  resolve: 3,
  leaderAbilities: [],
};
const VANILLA = U('vanilla', 2, 2);
const POOL: Record<string, CardDef> = { [LEADER.id]: LEADER, [VANILLA.id]: VANILLA };

function game(): GameState {
  const dd = (): DeckDef => ({ leaderId: LEADER.id, cards: Array(30).fill(VANILLA.id) });
  return createGame(dd(), dd(), POOL, { rng: mulberry32(7), shuffle: false, handSize: 0 });
}

const sanctum = (id: string, keywords: string[]): CardDef => ({
  id,
  name: id,
  type: 'Location',
  subtype: 'Sanctum',
  cost: { generic: 0, pips: {} },
  produces: 'Ember',
  keywords,
});

function placeSanctum(s: GameState, pid: 'P1' | 'P2', def: CardDef, iid: string): void {
  s.players[pid].locations.push({ iid, def, produces: def.produces!, exhausted: false });
}

// ---------------------------------------------------------------------------
describe('Hardened in clash', () => {
  test('a big enough attacker kills a Hardened guard (assigns grit + 1)', () => {
    const s = game();
    // 5 Might clears a 3-grit Hardened guard: 3 to overcome grit + 1 the shave
    // eats = 4 assigned, well within 5.
    const atk = summonUnit(s, 'P1', U('atk', 5, 5));
    const guard = summonUnit(s, 'P2', U('hardguard', 0, 3, ['Hardened']));
    s.phase = 'Clash';
    declareAttackers(s, [atk.iid]);
    declareGuards(s, { [atk.iid]: [guard.iid] });
    resolveClash(s);
    expect(findUnit(s, guard.iid)).toBeUndefined();
  });

  test('an attacker that cannot pay the +1 leaves the Hardened guard alive', () => {
    const s = game();
    // 3 Might vs 3-grit Hardened: assigns 3, shaved to 2 marked — survives.
    const atk = summonUnit(s, 'P1', U('atk3', 3, 5));
    const guard = summonUnit(s, 'P2', U('hardguard2', 0, 3, ['Hardened']));
    s.phase = 'Clash';
    declareAttackers(s, [atk.iid]);
    declareGuards(s, { [atk.iid]: [guard.iid] });
    resolveClash(s);
    expect(findUnit(s, guard.iid)?.damage).toBe(2);
  });

  test('Tidecaller does not draw when its hit is fully absorbed by Hardened', () => {
    const s = game();
    // 1 Might Tidecaller into a Hardened guard: the single point is shaved to
    // zero, so no clash damage is dealt and no card is drawn.
    const caller = summonUnit(s, 'P1', U('tcaller', 1, 4, ['Tidecaller']));
    const guard = summonUnit(s, 'P2', U('hardwall', 0, 5, ['Hardened']));
    s.phase = 'Clash';
    const before = s.players.P1.hand.length;
    declareAttackers(s, [caller.iid]);
    declareGuards(s, { [caller.iid]: [guard.iid] });
    resolveClash(s);
    expect(s.players.P1.hand.length).toBe(before);
    expect(findUnit(s, guard.iid)?.damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
describe('fizzled Event suppresses its riders', () => {
  test('Echoing + Fate do nothing when the Event fizzles', () => {
    const s = game();
    const ev: CardDef = {
      id: 'echo_fate_ev',
      name: 'Echo Fate Event',
      type: 'Event',
      subtype: 'Quick',
      cost: { generic: 0, pips: {} },
      onInvoke: { action: 'damage', value: 2, target: 'enemyUnit' },
      keywords: ['Echoing', 'Fate'],
    };
    const target = summonUnit(s, 'P2', VANILLA);
    const card = { iid: 'ef#1', def: ev };
    s.players.P1.ashPile = [];
    s.phase = 'Main1';
    s.active = 'P1';

    const handBefore = s.players.P1.hand.length;
    const p2DeckBefore = s.players.P2.deck.length;
    const p2VoidBefore = s.players.P2.voidPile.length;

    // Put the Event on the stack aimed at the target, then remove the target
    // before it resolves so the effect fizzles.
    s.stack.push({
      id: 'stub-ef',
      kind: 'card',
      controller: 'P1',
      sourceName: ev.name,
      card,
      targetIid: target.iid,
      resolveTimes: 1,
    });
    s.players.P2.field = s.players.P2.field.filter((u) => u.iid !== target.iid);
    settleStack(s);

    // Fizzled: no Echoing draw and no Fate banish.
    expect(s.players.P1.hand.length).toBe(handBefore);
    expect(s.players.P2.deck.length).toBe(p2DeckBefore);
    expect(s.players.P2.voidPile.length).toBe(p2VoidBefore);
  });
});

// ---------------------------------------------------------------------------
describe('Dusk-death triggers resolve before the turn passes', () => {
  test('a Scorched-Earth kill at Dusk shatters through a spent Unbreakable save', () => {
    const s = game();
    s.active = 'P1';
    // Three Sanctums arm the Scorched-Earth sweep.
    for (let i = 0; i < 3; i++)
      placeSanctum(s, 'P1', sanctum(`scorch${i}`, ['Scorched-Earth']), `scorch#${i}`);

    // P1 fields an Unbreakable wall whose save is ALREADY spent this turn.
    const wall = summonUnit(s, 'P1', U('wall', 2, 4, ['Unbreakable']));
    wall.unbreakableSpent = true;

    // P2 fields a 1-grit martyr: "when this dies, shatter an enemy unit".
    summonUnit(
      s,
      'P2',
      U('martyr', 1, 1, [], {
        triggers: [{ when: 'dies', effect: { action: 'shatter', target: 'enemyUnit' } }],
      }),
    );

    s.phase = 'Main2';
    endPhase(s); // P1's Dusk: sweep kills the martyr, its shatter must resolve now

    // The wall's save was spent, so the Dusk-time shatter kills it. If the
    // trigger leaked to P2's Dawn, the save would have recharged and saved it.
    expect(findUnit(s, wall.iid)).toBeUndefined();
  });
});
