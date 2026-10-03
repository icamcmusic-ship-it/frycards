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
  turns: 20,
  humanLabel: 'Mer-King — Randomized Build',
  cpuLabel: 'Void Mother — Randomized Build',
  humanVitality: 12,
  cpuVitality: 0,
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
  test('counts wins, form, play/draw split and groups by deck', async () => {
    const { summarizeMatchHistory } = await import('./matchHistory');
    const s = summarizeMatchHistory([
      rec({ won: true, firstPlayer: 'P1', humanDeck: 'FRY1:a:x' }),
      rec({ won: false, firstPlayer: 'P2', humanDeck: 'FRY1:a:x' }),
      rec({ won: true, firstPlayer: 'P2', humanDeck: 'FRY1:b:y', humanLabel: 'B' }),
      rec({ won: true }),
    ]);
    expect(s.games).toBe(4);
    expect(s.wins).toBe(3);
    expect(s.winPct).toBe(75);
    expect(s.form).toEqual(['W', 'L', 'W', 'W']);
    expect(s.onPlay).toEqual({ games: 1, wins: 1 });
    expect(s.onDraw).toEqual({ games: 2, wins: 1 });
    expect(s.byDeck[0]).toMatchObject({ key: 'FRY1:a:x', games: 2, wins: 1 });
    expect(s.byDeck).toHaveLength(3);
  });
  test('an empty history is all zeros', async () => {
    const { summarizeMatchHistory } = await import('./matchHistory');
    expect(summarizeMatchHistory([])).toMatchObject({ games: 0, wins: 0, winPct: 0, form: [] });
  });
  test('the report carries the seed and both deck codes', async () => {
    const { formatMatchReport } = await import('./matchHistory');
    const text = formatMatchReport(
      rec({ seed: 42, humanDeck: 'FRY1:a:x', cpuDeck: 'FRY1:b:y', firstPlayer: 'P2' }),
    );
    expect(text).toContain('Seed: 42');
    expect(text).toContain('FRY1:a:x');
    expect(text).toContain('FRY1:b:y');
    expect(text).toContain('First player: opponent');
  });
});
