import { expect, test } from 'vitest';
import { BINGO_LINES, cardRolledOver, fmtUntilReset, lineName, nearMissLines } from './BingoPanel';

test('client line table matches the server bingo_lines()', () => {
  // Same literal as supabase/migrations/20261007000003_collection_bingo.sql.
  expect(BINGO_LINES).toEqual([
    [0, 1, 2, 3, 4],
    [5, 6, 7, 8, 9],
    [10, 11, 12, 13, 14],
    [15, 16, 17, 18, 19],
    [20, 21, 22, 23, 24],
    [0, 5, 10, 15, 20],
    [1, 6, 11, 16, 21],
    [2, 7, 12, 17, 22],
    [3, 8, 13, 18, 23],
    [4, 9, 14, 19, 24],
    [0, 6, 12, 18, 24],
    [4, 8, 12, 16, 20],
  ]);
  expect(lineName(0)).toBe('Row 1');
  expect(lineName(9)).toBe('Column 5');
  expect(lineName(11)).toBe('Diagonal ↙');
});

test('cardRolledOver compares the week on screen with the freshly fetched one (audit M9)', () => {
  expect(cardRolledOver('2026-10-05', '2026-10-12')).toBe(true);
  expect(cardRolledOver('2026-10-05', '2026-10-05')).toBe(false);
  // A server that does not send week_start must never block a claim.
  expect(cardRolledOver(undefined, '2026-10-12')).toBe(false);
  expect(cardRolledOver('2026-10-05', undefined)).toBe(false);
});

test('fmtUntilReset formats the countdown and clamps at zero', () => {
  const now = Date.UTC(2026, 9, 11, 12, 0);
  expect(fmtUntilReset('2026-10-12T00:00:00Z', now)).toBe('12h 0m');
  expect(fmtUntilReset('2026-10-14T06:00:00Z', now)).toBe('2d 18h');
  expect(fmtUntilReset('2026-10-11T12:09:00Z', now)).toBe('9m');
  expect(fmtUntilReset('2026-10-01T00:00:00Z', now)).toBe('0m');
});

test('nearMissLines finds lines exactly one square short', () => {
  // Row 1 has 4/5 done (cell 4 missing); nothing else is close.
  const done = Array(25).fill(false);
  [0, 1, 2, 3].forEach((i) => (done[i] = true));
  expect(nearMissLines(done)).toEqual([{ line: 0, cell: 4 }]);
  // A completed line is not a near miss.
  done[4] = true;
  expect(nearMissLines(done)).toEqual([]);
  // Cell 12 (free, centre) done plus a diagonal of four.
  const d2 = Array(25).fill(false);
  [0, 6, 12, 18].forEach((i) => (d2[i] = true));
  expect(nearMissLines(d2)).toEqual([{ line: 10, cell: 24 }]);
});
