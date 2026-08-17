/**
 * Match-UI guard tests.
 *
 * `activateLeaderAbility` spends the ability's Resolve — and shatters the
 * Leader outright when that takes it to zero — whether or not the effect
 * actually finds anything to resolve against. The CPU has guarded itself
 * against pointing a targeted ability at a board it cannot legally hit since
 * v6.9 (`runLeaderAbility` in ai.ts); the human's ability pill did not, so
 * clicking a "-4: Shatter a target enemy unit" into an empty or entirely
 * Warded enemy board burned four Resolve for nothing and could kill the
 * player's own Leader doing it.
 *
 * These pin the pure predicate the pill's enabled state is derived from.
 */
import { describe, expect, test } from 'vitest';
import { FX_MS, FX_UNMOUNT_SLACK_MS, fxPaceFor, fxUnmountMs, leaderAbilityWhy } from './GameV4';
import { CPU_SPEEDS } from '../meta/matchPrefs';
import { CardDef } from '../game/v3/cards';
import { DeckDef, GameState, createGame, mulberry32, summonUnit } from '../game/v3/engine';

/** resolve 5, with a -4 unit-only shatter (the same shape as the live
 * `avatar_of_the_abyss` Leader) plus a -1 'anyTarget' burn, so the suite can
 * tell "no unit to hit" apart from "nothing to hit at all". */
const LEADER: CardDef = {
  id: 'test_leader',
  name: 'Test Leader',
  type: 'Leader',
  cost: { generic: 0, pips: {} },
  resolve: 5,
  leaderAbilities: [
    {
      resolveDelta: -4,
      effect: { action: 'shatter', target: 'enemyUnit' },
      text: '-4: Shatter a target enemy unit.',
    },
    {
      resolveDelta: -1,
      effect: { action: 'damage', value: 2, target: 'anyTarget' },
      text: '-1: Deal 2 damage to any target.',
    },
  ],
};
const VANILLA: CardDef = {
  id: 'vanilla',
  name: 'Vanilla',
  type: 'Unit',
  cost: { generic: 0, pips: {} },
  might: 2,
  grit: 2,
};
const WARDED: CardDef = { ...VANILLA, id: 'warded', name: 'Warded', keywords: ['Warded'] };

const POOL: Record<string, CardDef> = {
  [LEADER.id]: LEADER,
  [VANILLA.id]: VANILLA,
  [WARDED.id]: WARDED,
};

function game(): GameState {
  const dd = (): DeckDef => ({ leaderId: LEADER.id, cards: Array(30).fill(VANILLA.id) });
  const s = createGame(dd(), dd(), POOL, { rng: mulberry32(11), shuffle: false, handSize: 0 });
  s.active = 'P1';
  s.phase = 'Main1';
  s.players.P1.leader.invoked = true;
  s.players.P1.leader.abilityUsedThisTurn = false;
  return s;
}

const SHATTER = 0;
const ANY_TARGET = 1;

describe('leaderAbilityWhy', () => {
  test('a targeted ability with a live enemy unit is usable', () => {
    const s = game();
    summonUnit(s, 'P2', VANILLA);
    expect(leaderAbilityWhy(s, 'P1', SHATTER, true)).toBeUndefined();
  });

  test('blocks a targeted ability against an EMPTY enemy board', () => {
    const s = game();
    expect(s.players.P2.field).toHaveLength(0);
    expect(leaderAbilityWhy(s, 'P1', SHATTER, true)).toMatch(/no legal target/i);
  });

  test('blocks a targeted ability when every enemy unit is Warded', () => {
    const s = game();
    summonUnit(s, 'P2', WARDED);
    summonUnit(s, 'P2', WARDED);
    expect(leaderAbilityWhy(s, 'P1', SHATTER, true)).toMatch(/no legal target/i);
  });

  test('a Warded board still leaves a non-Warded unit targetable', () => {
    const s = game();
    summonUnit(s, 'P2', WARDED);
    summonUnit(s, 'P2', VANILLA);
    expect(leaderAbilityWhy(s, 'P1', SHATTER, true)).toBeUndefined();
  });

  test("'anyTarget' stays usable on an empty board — it can go face", () => {
    const s = game();
    expect(leaderAbilityWhy(s, 'P1', ANY_TARGET, true)).toBeUndefined();
  });

  test('the guard does not mask the pre-existing reasons', () => {
    const s = game();
    summonUnit(s, 'P2', VANILLA);

    const notMain = leaderAbilityWhy(s, 'P1', SHATTER, false);
    expect(notMain).toMatch(/main phases/i);

    s.players.P1.leader.abilityUsedThisTurn = true;
    expect(leaderAbilityWhy(s, 'P1', SHATTER, true)).toMatch(/already used/i);
    s.players.P1.leader.abilityUsedThisTurn = false;

    s.players.P1.leader.resolve = 3; // -4 is unaffordable
    expect(leaderAbilityWhy(s, 'P1', SHATTER, true)).toMatch(/Needs 4 Resolve/);

    s.players.P1.leader.resolve = 5;
    s.players.P1.leader.invoked = false;
    expect(leaderAbilityWhy(s, 'P1', SHATTER, true)).toMatch(/not on the field/i);
  });

  test('a nonexistent ability index is rejected', () => {
    const s = game();
    summonUnit(s, 'P2', VANILLA);
    expect(leaderAbilityWhy(s, 'P1', 99, true)).toMatch(/No such ability/i);
  });
});

/**
 * The paced-effect drift.
 *
 * v26 scaled every combat animation's CSS duration by `--gv4-pace` so the
 * narration speed would slow down the parts a player is trying to watch — and
 * left the three JS timers that UNMOUNT those elements at their v25 constants.
 * On CINEMATIC (pace 2.6) the phase banner, the damage floats and the hit
 * flash were therefore torn off screen at ~38% of the animation the setting
 * had just lengthened: the slowest rung showed the shortest version of every
 * effect it exists to let you watch.
 *
 * Both halves now come from `FX_MS`. These pin that they agree at EVERY rung,
 * including any rung added later.
 */
describe('paced combat effects', () => {
  test('the element outlives its animation at every narration speed', () => {
    for (const [idx] of CPU_SPEEDS.entries()) {
      const pace = fxPaceFor(idx);
      for (const base of Object.values(FX_MS)) {
        // The animation runs for `base * pace`; the element must still be
        // mounted when it ends.
        expect(fxUnmountMs(base, idx), `${CPU_SPEEDS[idx].label} @ ${base}ms`).toBeGreaterThan(
          base * pace,
        );
      }
    }
  });

  test('the pace floor is 1 — FAST shortens waits, never the feedback', () => {
    const fast = CPU_SPEEDS.findIndex((s) => s.label === 'FAST');
    expect(CPU_SPEEDS[fast].mult).toBeLessThan(1);
    expect(fxPaceFor(fast)).toBe(1);
    expect(fxUnmountMs(FX_MS.float, fast)).toBe(FX_MS.float + FX_UNMOUNT_SLACK_MS);
  });

  test('a slower rung really does hold every effect longer', () => {
    const cinematic = CPU_SPEEDS.findIndex((s) => s.label === 'CINEMATIC');
    const normal = CPU_SPEEDS.findIndex((s) => s.label === 'NORMAL');
    for (const base of Object.values(FX_MS)) {
      expect(fxUnmountMs(base, cinematic)).toBeGreaterThan(fxUnmountMs(base, normal));
    }
  });

  test('an out-of-range speed index falls back to the unscaled pace', () => {
    expect(fxPaceFor(-1)).toBe(1);
    expect(fxPaceFor(999)).toBe(1);
  });
});
