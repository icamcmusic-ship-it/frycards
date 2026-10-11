import { describe, expect, test } from 'vitest';
import { summarizeMatchHistory, type MatchRecord } from './matchHistory';

const rec = (place: number, leader: string, mode: 'quick' | 'deep' = 'quick'): MatchRecord => ({
  seed: place,
  finishedAt: 0,
  won: place === 1,
  place,
  seats: 6,
  mode,
  humanLabel: 'd',
  cpuLabel: '',
  leader,
  opponents: ['Mer-King', 'Mer-King', 'Kuro'],
});

describe('Q17 streaks and splits', () => {
  test('top-2 streak now and best; per Leader, mode and opponent', () => {
    // newest first
    const s = summarizeMatchHistory([
      rec(2, 'A'),
      rec(1, 'A'),
      rec(4, 'B', 'deep'),
      rec(1, 'B'),
      rec(2, 'B'),
      rec(1, 'A'),
      rec(6, 'A'),
    ]);
    expect(s.streak).toEqual({ current: 2, best: 3 });
    expect(s.byLeader.find((l) => l.leader === 'A')).toMatchObject({ games: 4, wins: 2 });
    expect(s.byMode.find((m) => m.mode === 'deep')).toMatchObject({ games: 1, avgPlace: 4 });
    // Each record counts an opponent Leader once.
    expect(s.byOpponent.find((o) => o.leader === 'Mer-King')?.games).toBe(7);
  });
});
