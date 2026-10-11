import { describe, expect, it } from 'vitest';
import { msUntilNextUtcMidnight } from './utcReset';

describe('msUntilNextUtcMidnight (B5)', () => {
  it('counts to the next UTC midnight', () => {
    expect(msUntilNextUtcMidnight(new Date('2026-10-11T23:59:00Z'))).toBe(60_000);
    expect(msUntilNextUtcMidnight(new Date('2026-12-31T12:00:00Z'))).toBe(12 * 3600_000);
  });
  it('is a full day exactly at midnight', () => {
    expect(msUntilNextUtcMidnight(new Date('2026-10-11T00:00:00Z'))).toBe(86_400_000);
  });
});
