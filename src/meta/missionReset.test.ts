import { describe, expect, test } from 'vitest';
import { untilReset } from './AchievementsScreen';

describe('untilReset', () => {
  test('daily counts to the next UTC midnight', () => {
    expect(untilReset('daily', new Date('2026-10-07T22:30:00Z'))).toBe('1h 30m');
  });
  test('weekly counts to the next Monday, a full week from a Monday', () => {
    // 2026-10-07 is a Wednesday → Monday 2026-10-12 00:00 UTC.
    expect(untilReset('weekly', new Date('2026-10-07T00:00:00Z'))).toBe('5d 0h');
    expect(untilReset('weekly', new Date('2026-10-12T00:00:00Z'))).toBe('7d 0h');
    expect(untilReset('weekly', new Date('2026-10-11T23:59:00Z'))).toBe('1m');
  });
});
