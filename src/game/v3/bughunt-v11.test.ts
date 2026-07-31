/**
 * v11 deep bug-hunt regressions — clash math the engine and the CPU disagreed
 * about.
 *
 * Neither of these crashes and neither shows up in the soak fuzz: both sides
 * were internally consistent, they just answered "how much Vitality does this
 * attack take off" differently. The engine's number is the rules; a CPU
 * budgeting against a different one either misses lethal it actually has or
 * chump-blocks a board that was never in danger.
 *
 *  1. Guard absorption was accumulated across BOTH clash sub-steps, so a
 *     Doublestrike + Overrun attacker whose guard died to its first strike
 *     spilled `Might - Might` = 0 in the normal step — its whole second strike
 *     vanished. `chooseGuards` had priced that strike since v10.
 *  2. `chooseAttackers`' all-in lethal check counted a Doublestrike attacker's
 *     face damage ONCE where the engine deals it twice, and neither CPU model
 *     subtracted the defender's Bulwark Sanctums, which `damagePlayer` shaves
 *     off every packet.
 */
import { describe, expect, test } from 'vitest';
import { CardDef } from './cards';
import {
  DeckDef,
  GameState,
  createGame,
  declareAttackers,
  declareGuards,
  mulberry32,
  resolveClash,
  summonUnit,
} from './engine';
import { chooseAttackers, chooseGuards } from './ai';

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
  cost: { generic: 0, pips: {} },
  resolve: 3,
  leaderAbilities: [],
};
const VANILLA = U('vanilla', 2, 2);
const POOL: Record<string, CardDef> = { [LEADER.id]: LEADER, [VANILLA.id]: VANILLA };

const BULWARK_SANCTUM: CardDef = {
  id: 'bulwark_sanctum',
  name: 'Bulwark Sanctum',
  type: 'Location',
  subtype: 'Sanctum',
  cost: { generic: 0, pips: {} },
  produces: 'Ember',
  keywords: ['Bulwark'],
};

function game(): GameState {
  const dd = (): DeckDef => ({ leaderId: LEADER.id, cards: Array(30).fill(VANILLA.id) });
  const g = createGame(dd(), dd(), POOL, { rng: mulberry32(11), shuffle: false, handSize: 0 });
  g.phase = 'Clash';
  return g;
}

describe('v11 — guard absorption is per sub-step, not per clash', () => {
  test('a Doublestrike + Overrun attacker still spills its second strike', () => {
    const g = game();
    const atk = summonUnit(g, 'P1', U('ds_over', 5, 5, ['Doublestrike', 'Overrun']));
    const wall = summonUnit(g, 'P2', U('wall', 1, 5));
    const before = g.players.P2.vitality;

    expect(declareAttackers(g, [atk.iid])).toBe(true);
    expect(declareGuards(g, { [atk.iid]: [wall.iid] })).toBe(true);
    expect(resolveClash(g)).toBe(true);

    // First strike: all 5 assigned to the 5-Grit wall, which dies. Normal
    // step: nothing left to absorb, so Overrun spills the full 5 to the face.
    expect(g.players.P2.field).toHaveLength(0);
    expect(before - g.players.P2.vitality).toBe(5);
  });

  test('a single-strike Overrun attacker is unchanged by the fix', () => {
    const g = game();
    const atk = summonUnit(g, 'P1', U('over', 5, 5, ['Overrun']));
    const wall = summonUnit(g, 'P2', U('wall', 1, 3));
    const before = g.players.P2.vitality;

    declareAttackers(g, [atk.iid]);
    declareGuards(g, { [atk.iid]: [wall.iid] });
    resolveClash(g);

    // 3 to the wall, 2 spills — one strike, one absorption.
    expect(before - g.players.P2.vitality).toBe(2);
  });

  test("the defender's guard model matches what the clash actually deals", () => {
    const g = game();
    const atk = summonUnit(g, 'P1', U('ds_over', 5, 5, ['Doublestrike', 'Overrun']));
    summonUnit(g, 'P2', U('wall', 1, 5));
    declareAttackers(g, [atk.iid]);
    // chooseGuards decides against its own damage model; taking its assignment
    // and resolving it is the only way to compare the two numbers directly.
    const assignments = chooseGuards(g, 'P2');
    declareGuards(g, assignments);
    const before = g.players.P2.vitality;
    resolveClash(g);
    const dealt = before - g.players.P2.vitality;
    // Guarded: 5 absorbed by the wall on the first strike, 5 through on the
    // second. Unguarded would be 10. Either way the CPU must not be surprised.
    expect([5, 10]).toContain(dealt);
  });
});

describe('v11 — the CPU prices face damage the way damagePlayer pays it', () => {
  test('an unguardable Doublestrike attacker counts for twice its Might in the all-in check', () => {
    const g = game();
    // 11 Vitality. The Aerial 6/6 Doublestrike is unguardable (the defender's
    // only body is neither Aerial nor Skywatch) and the engine sends it into
    // the face twice — 12, which is lethal, so the whole board should swing,
    // including the 2/2 that would otherwise be held back from a losing trade.
    // Counting the Doublestrike hit once reads 6, declines the all-in, and
    // leaves the 2/2 at home.
    g.players.P2.vitality = 11;
    const flier = summonUnit(g, 'P1', U('ds_flier', 6, 6, ['Doublestrike', 'Aerial']));
    const small = summonUnit(g, 'P1', U('small', 2, 2));
    summonUnit(g, 'P2', U('ground_wall', 4, 4));

    const chosen = chooseAttackers(g, 'P1');
    expect(chosen).toContain(flier.iid);
    expect(chosen).toContain(small.iid);

    declareAttackers(g, [flier.iid]);
    declareGuards(g, {});
    resolveClash(g);
    expect(g.winner).toBe('P1');
  });

  test("a defender's Bulwark Sanctum is subtracted before the all-in reads lethal", () => {
    const g = game();
    g.players.P2.vitality = 4;
    g.players.P2.locations.push({
      iid: 'bulwark#1',
      def: BULWARK_SANCTUM,
      produces: 'Ember',
      exhausted: false,
    });
    // The Aerial 4/4 is unguardable and 4 raw Might into 4 Vitality reads as
    // exactly lethal — but Bulwark shaves 1 off the packet, so only 3 lands.
    // A Bulwark-blind model calls the all-in and throws the 2/2 into a 5/5 for
    // nothing.
    const flier = summonUnit(g, 'P1', U('flier', 4, 4, ['Aerial']));
    const small = summonUnit(g, 'P1', U('small', 2, 2));
    summonUnit(g, 'P2', U('ground_wall', 5, 5));

    const chosen = chooseAttackers(g, 'P1');
    expect(chosen).toContain(flier.iid);
    expect(chosen).not.toContain(small.iid);

    declareAttackers(g, [flier.iid]);
    declareGuards(g, {});
    resolveClash(g);
    expect(g.players.P2.vitality).toBe(1);
    expect(g.winner).toBeNull();
  });

  test('the defender does not chump-block an attack its own Bulwark already answers', () => {
    const g = game();
    g.players.P2.vitality = 2;
    g.players.P2.locations.push({
      iid: 'bulwark#2',
      def: BULWARK_SANCTUM,
      produces: 'Ember',
      exhausted: false,
    });
    // A 2/2 into 2 Vitality reads as exactly lethal without Bulwark, which is
    // what used to force the 1/1 in front of it — a body thrown away to
    // prevent 1 damage the Sanctum was already preventing.
    const atk = summonUnit(g, 'P1', U('atk', 2, 2));
    const chump = summonUnit(g, 'P2', U('chump', 1, 1));

    declareAttackers(g, [atk.iid]);
    const assignments = chooseGuards(g, 'P2');
    expect(assignments[atk.iid] ?? []).toEqual([]);

    declareGuards(g, assignments);
    resolveClash(g);
    expect(g.players.P2.field.map((u) => u.iid)).toContain(chump.iid);
    expect(g.players.P2.vitality).toBe(1);
    expect(g.winner).toBeNull();
  });
});
