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
