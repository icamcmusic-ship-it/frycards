import { describe, expect, it } from 'vitest';
import { DIFFICULTY_REWARD_MULT, minPaidHands, ordinal, placementReward } from './rewards';

describe('placement rewards', () => {
  it('pays 100/66/45/28/19/15 at six seats in Standard (F-5)', () => {
    expect([1, 2, 3, 4, 5, 6].map((p) => placementReward(p, 6, 'standard').credits)).toEqual([
      100, 66, 45, 28, 19, 15,
    ]);
  });
  it('heads-up pays less than a full table, and modes scale it', () => {
    expect(placementReward(1, 2, 'standard').credits).toBe(55);
    expect(placementReward(2, 2, 'standard').credits).toBe(8);
    expect(placementReward(1, 2, 'quick').credits).toBe(28);
    expect(placementReward(1, 6, 'deep').credits).toBe(150);
    expect(placementReward(1, 6, 'standard').xp).toBe(60);
    expect(placementReward(1, 6, 'standard').bpXp).toBe(50);
  });
  it('last place never out-earns playing on: it pays 15% of a win', () => {
    for (let seats = 2; seats <= 6; seats++) {
      const win = placementReward(1, seats, 'standard').credits;
      const last = placementReward(seats, seats, 'standard').credits;
      expect(last / win).toBeLessThanOrEqual(0.16);
    }
  });
  it('a non-win before the minimum hand count pays nothing; a win always pays', () => {
    expect(minPaidHands(2)).toBe(8);
    expect(minPaidHands(6)).toBe(18);
    expect(placementReward(2, 6, 'standard', 17).credits).toBe(0);
    expect(placementReward(2, 6, 'standard', 18).credits).toBe(66);
    expect(placementReward(1, 2, 'standard', 1).credits).toBe(55);
  });
  it('difficulty scales credits only (S-2): Easy x0.8, Normal x1, Hard x1.15', () => {
    expect(placementReward(1, 6, 'standard', undefined, 'easy').credits).toBe(80);
    expect(placementReward(1, 6, 'standard', undefined, 'normal').credits).toBe(100);
    expect(placementReward(1, 6, 'standard', undefined, 'hard').credits).toBe(115);
    expect(placementReward(1, 2, 'standard', undefined, 'hard').credits).toBe(63);
    expect(placementReward(1, 6, 'standard', undefined, 'easy').xp).toBe(60);
    expect(placementReward(1, 6, 'standard', undefined, 'hard').bpXp).toBe(50);
    expect(placementReward(2, 6, 'standard', 17, 'hard').credits).toBe(0);
    expect(Object.keys(DIFFICULTY_REWARD_MULT)).toEqual(['easy', 'normal', 'hard']);
  });
  it('ordinals', () => {
    expect([1, 2, 3, 4, 11, 22].map(ordinal)).toEqual(['1st', '2nd', '3rd', '4th', '11th', '22nd']);
  });
});
