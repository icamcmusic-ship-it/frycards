/**
 * CPU difficulty (AUDIT-2026-10-06 §3.2). Easy must lose to Normal more often
 * than not, Hard must not lose to Normal more often than not, and Normal must
 * be byte-for-byte the AI it always was (no difficulty set = 'normal').
 */
import { describe, expect, test } from 'vitest';
import { createGame, GameState, mulberry32, PlayerId } from './engine';
import {
  CpuDifficulty,
  cpuDifficulty,
  maybeMulliganPlayer,
  playTurn,
  setCpuDifficulty,
} from './ai';
import { buildDeck, randomArchetype } from './decks';
import { POOL_BY_ID } from './cardpool';

const SEATS: PlayerId[] = ['P1', 'P2'];

function play(seed: number, levels?: Record<PlayerId, CpuDifficulty>): GameState {
  const rng = mulberry32(seed * 7919);
  const g = createGame(
    buildDeck(randomArchetype(rng)),
    buildDeck(randomArchetype(rng)),
    POOL_BY_ID,
    {
      rng: mulberry32(seed * 104729),
      firstPlayer: seed % 2 === 0 ? 'P1' : 'P2',
    },
  );
  if (levels) for (const pid of SEATS) setCpuDifficulty(g, levels[pid], pid);
  for (const pid of SEATS) maybeMulliganPlayer(g, pid, rng);
  for (let t = 0; t < 400 && !g.winner; t++) playTurn(g, g.active);
  return g;
}

/** Wins for `level` against Normal over `n` games, seats alternating. */
function winsVsNormal(level: CpuDifficulty, n: number): number {
  let wins = 0;
  for (let seed = 1; seed <= n; seed++) {
    const me: PlayerId = seed % 4 < 2 ? 'P1' : 'P2';
    const other: PlayerId = me === 'P1' ? 'P2' : 'P1';
    const g = play(seed, { [me]: level, [other]: 'normal' } as Record<PlayerId, CpuDifficulty>);
    if (g.winner === me) wins++;
  }
  return wins;
}

describe('CPU difficulty', () => {
  test('defaults to normal, per seat', () => {
    const g = play(3);
    expect(cpuDifficulty(g, 'P1')).toBe('normal');
    setCpuDifficulty(g, 'easy', 'P2');
    expect(cpuDifficulty(g, 'P1')).toBe('normal');
    expect(cpuDifficulty(g, 'P2')).toBe('easy');
  });

  test('an explicit normal plays exactly like no setting', () => {
    for (const seed of [5, 11, 17]) {
      const a = play(seed);
      const b = play(seed, { P1: 'normal', P2: 'normal' });
      expect(b.log).toEqual(a.log);
    }
  });

  test('easy loses to normal; hard holds its own', () => {
    const N = 80;
    const easy = winsVsNormal('easy', N);
    const hard = winsVsNormal('hard', N);
    console.log(`vs normal over ${N}: easy ${easy}, hard ${hard}`);
    // Measured at introduction: easy 15/80, hard 42/80.
    expect(easy).toBeLessThan(N * 0.35);
    expect(hard).toBeGreaterThan(N * 0.45);
  }, 120_000);
});
