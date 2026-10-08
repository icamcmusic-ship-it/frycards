import { describe, expect, test } from 'vitest';
import { isMatchObjective, MATCH_MISSION_IDS, untilReset } from './AchievementsScreen';
import { isCpuLocked } from './cpuAccess';

describe('untilReset', () => {
  test('weekly countdown rolls over the month end (audit M2)', () => {
    // Saturday 2026-10-31 12:00 UTC -> Monday 2026-11-02 00:00 UTC.
    expect(untilReset('weekly', new Date('2026-10-31T12:00:00Z'))).toBe('1d 12h');
    // Monday 2026-11-30 12:00 UTC -> next Monday 2026-12-07 00:00 UTC.
    expect(untilReset('weekly', new Date('2026-11-30T12:00:00Z'))).toBe('6d 12h');
  });

  test('weekly countdown crosses a year end', () => {
    // Thursday 2026-12-31 18:00 UTC -> Monday 2027-01-04 00:00 UTC.
    expect(untilReset('weekly', new Date('2026-12-31T18:00:00Z'))).toBe('3d 6h');
  });

  test('daily countdown is time to the next UTC midnight, including month end', () => {
    expect(untilReset('daily', new Date('2026-10-31T22:30:00Z'))).toBe('1h 30m');
    expect(untilReset('daily', new Date('2026-10-08T00:00:00Z'))).toBe('1d 0h');
  });

  test('a Sunday resets the next day, a Monday a full week out', () => {
    expect(untilReset('weekly', new Date('2026-10-11T12:00:00Z'))).toBe('12h 0m');
    expect(untilReset('weekly', new Date('2026-10-12T12:00:00Z'))).toBe('6d 12h');
  });
});

describe('match-dependent objectives (audit M1)', () => {
  test('flags the six match missions by id', () => {
    for (const id of ['d_play_3', 'd_win_1', 'd_win_2', 'w_games_10', 'w_play_15', 'w_win_8'])
      expect(MATCH_MISSION_IDS.has(id)).toBe(true);
  });

  test('flags objectives by stat key or battle category', () => {
    expect(isMatchObjective({ id: 'x', stat_key: 'games_played' })).toBe(true);
    expect(isMatchObjective({ id: 'x', stat_key: 'wins' })).toBe(true);
    expect(isMatchObjective({ id: 'x', stat_key: 'streak', category: 'battle' })).toBe(true);
    expect(isMatchObjective({ id: 'd_win_1', stat_key: 'other' })).toBe(true);
  });

  test('leaves collection / market objectives alone', () => {
    expect(
      isMatchObjective({ id: 'packs_25', stat_key: 'packs_opened', category: 'collection' }),
    ).toBe(false);
    expect(isMatchObjective({ id: 'd_open_1', stat_key: 'packs_opened' })).toBe(false);
  });

  test('CPU play is locked for non-creator accounts only', () => {
    expect(isCpuLocked({ role: 'player' }, false)).toBe(true);
    expect(isCpuLocked({ role: 'creator' }, false)).toBe(false);
    expect(isCpuLocked(null, true)).toBe(false);
  });
});
