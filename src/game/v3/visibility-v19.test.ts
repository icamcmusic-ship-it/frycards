/**
 * v19 CPU-visibility suite — the guard step.
 *
 * v18 closed "the CPU's clash tricks played out in silence" for the reaction
 * window. The step immediately BEFORE it was still silent, and more visibly so:
 * `declareGuards` writes nothing to the engine log, so when the human declared
 * an attack the CPU's blocking assignment simply existed on the next frame.
 * There was no beat, no ring, no animation, and the only report was a `say()`
 * line counting the lines ("Kuro assigns 2 guard line(s)") that named neither
 * a blocker nor the attacker it stopped.
 *
 * `buildGuardBeats` synthesizes that missing narration. What is pinned here:
 *
 *  1. One beat per guard line, naming the attacker and every blocker on it,
 *     with the blockers as `actors` (the yellow ring, the CPU acting) and the
 *     attacker as `targets` (the red ring, what it is aimed at).
 *  2. A closing beat for whatever is still unguarded, carrying the CPU's own
 *     seat as its target so the Vitality plate — the thing the unblocked Might
 *     is pointed at — is what pulses.
 *  3. The unguarded beat totals EFFECTIVE Might (buffs, items, auras), not the
 *     printed number: "how much is getting through" is the only question that
 *     beat exists to answer, and the printed value is the wrong answer to it.
 *  4. Beats are read off `state.clash.guards` — what the engine accepted — not
 *     off the assignment the AI proposed. `declareMyAttack` falls back to an
 *     empty assignment when the engine rejects the heuristic's answer, and a
 *     narration built from the proposal would describe blocks that never
 *     happened.
 *  5. A clash with no attackers, and a state with no clash at all, produce no
 *     beats — `narrateBeats` treats an empty list as "nothing to show" and
 *     runs its continuation synchronously, so a spurious beat here would park
 *     a bubble on screen over a board that is waiting for the player.
 */
import { describe, expect, test } from 'vitest';
import { buildGuardBeats } from '../../components/GameV4';
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
  summonUnit,
} from './engine';

const CPU_LABEL = 'Mer-King — Randomized Build';

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
};

const POOL: Record<string, CardDef> = { [LEADER.id]: LEADER };

function game(): GameState {
  const filler = Array.from({ length: 40 }, (_, i) => `pad${i}`);
  for (const id of filler) POOL[id] = U(id, 1, 1);
  const dd = (): DeckDef => ({ leaderId: LEADER.id, cards: filler });
  return createGame(dd(), dd(), POOL, { rng: mulberry32(3), shuffle: false, handSize: 0 });
}

/**
 * P1 attacks with `attackers`; P2 blocks per `guards`. Units enter with
 * summoning sickness, so both fields are aged a turn before the clash.
 */
function clashSetup(
  attackers: CardDef[],
  blockers: CardDef[],
): { state: GameState; attackerIids: string[]; blockerIids: string[] } {
  const state = game();
  const attackerIids = attackers.map((def) => summonUnit(state, 'P1', def)!.iid);
  const blockerIids = blockers.map((def) => summonUnit(state, 'P2', def)!.iid);
  // Clear summoning sickness on both sides without playing a whole turn.
  for (const u of [...state.players.P1.field, ...state.players.P2.field]) u.enteredThisTurn = false;
  endPhase(state); // Main1 -> Clash
  expect(state.phase).toBe('Clash');
  return { state, attackerIids, blockerIids };
}

describe('buildGuardBeats', () => {
  test('one beat per guard line, naming the attacker and its blockers', () => {
    const { state, attackerIids, blockerIids } = clashSetup(
      [U('Sea Drake', 4, 4), U('Reef Hound', 2, 2)],
      [U('Coral Wall', 0, 5), U('Tide Sentry', 1, 3)],
    );
    expect(declareAttackers(state, attackerIids)).toBe(true);
    expect(
      declareGuards(state, {
        [attackerIids[0]]: [blockerIids[0], blockerIids[1]],
        [attackerIids[1]]: [],
      }),
    ).toBe(true);

    const beats = buildGuardBeats(state, CPU_LABEL);
    // One guard line + one "still coming through" beat.
    expect(beats).toHaveLength(2);
    expect(beats[0].text).toBe(`${CPU_LABEL} guards Sea Drake with Coral Wall + Tide Sentry.`);
    // Blockers act (yellow); the attacker they intercept is the target (red).
    expect(beats[0].actors).toEqual([blockerIids[0], blockerIids[1]]);
    expect(beats[0].targets).toEqual([attackerIids[0]]);
    expect(beats[0].attacking).toBeUndefined();
  });

  test('the unguarded beat rings the CPU seat and totals effective Might', () => {
    const { state, attackerIids } = clashSetup([U('Sea Drake', 4, 4)], [U('Coral Wall', 0, 5)]);
    expect(declareAttackers(state, attackerIids)).toBe(true);
    // The blocker exists but is not assigned: everything gets through.
    expect(declareGuards(state, {})).toBe(true);

    // A buff applied after the card was printed: the beat must report what is
    // actually arriving, so it reads effective Might off the engine.
    const attacker = findUnit(state, attackerIids[0])!;
    attacker.permMight = 3;

    const beats = buildGuardBeats(state, CPU_LABEL);
    expect(beats).toHaveLength(1);
    expect(beats[0].text).toBe(
      `${CPU_LABEL} declines to guard — 7 Might is coming straight through.`,
    );
    expect(beats[0].actors).toEqual([]);
    // 'P2' — the CPU's own Vitality plate, not a unit.
    expect(beats[0].targets).toEqual(['P2']);
  });

  test('a fully guarded attack produces no unguarded beat', () => {
    const { state, attackerIids, blockerIids } = clashSetup(
      [U('Sea Drake', 4, 4)],
      [U('Coral Wall', 0, 5)],
    );
    expect(declareAttackers(state, attackerIids)).toBe(true);
    expect(declareGuards(state, { [attackerIids[0]]: [blockerIids[0]] })).toBe(true);

    const beats = buildGuardBeats(state, CPU_LABEL);
    expect(beats).toHaveLength(1);
    expect(beats[0].targets).toEqual([attackerIids[0]]);
  });

  test('beats describe the guards the engine accepted, not the ones proposed', () => {
    const { state, attackerIids, blockerIids } = clashSetup(
      [U('Sea Drake', 4, 4)],
      [U('Coral Wall', 0, 5)],
    );
    expect(declareAttackers(state, attackerIids)).toBe(true);
    // An assignment naming a unit that is not on the field is rejected whole,
    // which is the case `declareMyAttack` answers with `declareGuards(g, {})`.
    expect(declareGuards(state, { [attackerIids[0]]: ['nonexistent-iid'] })).toBe(false);
    expect(declareGuards(state, {})).toBe(true);

    const beats = buildGuardBeats(state, CPU_LABEL);
    expect(beats).toHaveLength(1);
    expect(beats[0].text).toContain('declines to guard');
    // Never claims the rejected blocker did anything.
    expect(beats[0].actors).not.toContain(blockerIids[0]);
  });

  test('no clash, or a clash with no attackers, narrates nothing', () => {
    const fresh = game();
    expect(buildGuardBeats(fresh, CPU_LABEL)).toEqual([]);

    const { state } = clashSetup([U('Sea Drake', 4, 4)], []);
    // declareAttackers with an empty list never opens a clash.
    expect(declareAttackers(state, [])).toBe(false);
    expect(buildGuardBeats(state, CPU_LABEL)).toEqual([]);
  });
});
