import { describe, expect, it } from 'vitest';
import { ordinal, placementReward } from './rewards';

describe('placement rewards', () => {
  it('pays 100/76/61/49/43/40 at six seats in Standard', () => {
    expect([1, 2, 3, 4, 5, 6].map((p) => placementReward(p, 6, 'standard').credits)).toEqual([
      100, 76, 61, 49, 43, 40,
    ]);
  });
  it('heads-up is win/loss, and modes scale it', () => {
    expect(placementReward(1, 2, 'standard').credits).toBe(100);
    expect(placementReward(2, 2, 'standard').credits).toBe(40);
    expect(placementReward(1, 2, 'quick').credits).toBe(50);
    expect(placementReward(1, 2, 'deep').credits).toBe(150);
    expect(placementReward(1, 2, 'standard').xp).toBe(60);
    expect(placementReward(1, 2, 'standard').bpXp).toBe(50);
  });
  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '22nd']);
  });
});
