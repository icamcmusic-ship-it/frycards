/**
 * @vitest-environment jsdom
 *
 * The match record is what a bug report quotes and what a replay viewer will
 * replay from (findings 1.5 / 2.5), so its failure modes matter more than its
 * happy path: half-written storage, a hand-edited value, a storage-blocked
 * browser. None of those may take the game-over screen down with them.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import {
  MATCH_HISTORY_KEY,
  MATCH_HISTORY_LIMIT,
  loadMatchHistory,
  recordMatch,
} from './matchHistory';

const record = (seed: number) => ({
  seed,
  finishedAt: 1_700_000_000_000 + seed,
  won: seed % 2 === 0,
  place: seed % 2 === 0 ? 1 : 3,
  seats: 6,
  mode: 'standard' as const,
  hands: 40,
  humanLabel: 'Mer-King — Randomized Build',
  cpuLabel: 'Void Mother, Legendary Diver',
});

beforeEach(() => localStorage.clear());

describe('matchHistory', () => {
  test('round-trips a record, newest first', () => {
    recordMatch(record(1));
    recordMatch(record(2));
    const all = loadMatchHistory();
    expect(all.map((r) => r.seed)).toEqual([2, 1]);
    expect(all[0].humanLabel).toBe('Mer-King — Randomized Build');
  });

  test('keeps the window bounded', () => {
    for (let i = 0; i < MATCH_HISTORY_LIMIT + 10; i++) recordMatch(record(i));
    expect(loadMatchHistory()).toHaveLength(MATCH_HISTORY_LIMIT);
  });

  test('returns an empty list when nothing is stored', () => {
    expect(loadMatchHistory()).toEqual([]);
  });

  test('survives malformed JSON in storage', () => {
    localStorage.setItem(MATCH_HISTORY_KEY, '{not json');
    expect(loadMatchHistory()).toEqual([]);
  });

  test('survives a stored value of the wrong shape', () => {
    localStorage.setItem(MATCH_HISTORY_KEY, '"a string"');
    expect(loadMatchHistory()).toEqual([]);
  });

  test('drops individual entries that are missing a seed', () => {
    localStorage.setItem(
      MATCH_HISTORY_KEY,
      JSON.stringify([{ finishedAt: 1 }, record(7), null, 42]),
    );
    expect(loadMatchHistory().map((r) => r.seed)).toEqual([7]);
  });
});

describe('summarizeMatchHistory', () => {
  const rec = (over: Partial<ReturnType<typeof record>> & Record<string, unknown>) => ({
    ...record(1),
    ...over,
  });
  test('counts first places, average place, form and groups by deck', async () => {
    const { summarizeMatchHistory } = await import('./matchHistory');
    const s = summarizeMatchHistory([
      rec({ won: true, place: 1, humanDeck: 'FRY2:a' }),
      rec({ won: false, place: 4, humanDeck: 'FRY2:a' }),
      rec({ won: true, place: 1, humanDeck: 'FRY2:b', humanLabel: 'B' }),
      // A record from the retired two-player game: a loss counts as 2nd.
      { seed: 9, finishedAt: 1, won: false, turns: 12, humanLabel: 'Old', cpuLabel: 'CPU' },
    ]);
    expect(s.games).toBe(4);
    expect(s.wins).toBe(2);
    expect(s.winPct).toBe(50);
    expect(s.form).toEqual([1, 4, 1, 2]);
    expect(s.avgPlace).toBe(2);
    expect(s.byDeck[0]).toMatchObject({ key: 'FRY2:a', games: 2, wins: 1, avgPlace: 2.5 });
    expect(s.byDeck).toHaveLength(3);
  });
  test('an empty history is all zeros', async () => {
    const { summarizeMatchHistory } = await import('./matchHistory');
    expect(summarizeMatchHistory([])).toMatchObject({
      games: 0,
      wins: 0,
      winPct: 0,
      avgPlace: 0,
      form: [],
    });
  });
  test('the report carries the place, seed and deck code', async () => {
    const { formatMatchReport } = await import('./matchHistory');
    const text = formatMatchReport(rec({ seed: 42, place: 2, humanDeck: 'FRY2:a' }));
    expect(text).toContain('2nd of 6');
    expect(text).toContain('Seed: 42');
    expect(text).toContain('FRY2:a');
  });
});
