import { describe, it, expect } from 'vitest';
import {
  GRADING_SERVICES,
  GRADE_MULTIPLIERS,
  gradingUnitFee,
  gradingBulkMult,
  gradingSpeedMult,
  gradeMultiplier,
  gradedQuicksellPrice,
  fmtGrade,
  GRADE_WORDS,
} from './grading';
import { quicksellPrice } from './economy';

describe('grading economy mirrors', () => {
  it('defines exactly the three services with distinct slab styles', () => {
    expect(GRADING_SERVICES.map((s) => s.id)).toEqual(['tca', 'amg', 'keeper']);
    const stamps = new Set(GRADING_SERVICES.map((s) => s.slab.stamp));
    expect(stamps.size).toBe(3);
    // TCA is the premier (most expensive, highest premium); Keeper the cheapest.
    const [tca, amg, keeper] = GRADING_SERVICES;
    expect(tca.baseFee).toBeGreaterThan(amg.baseFee);
    expect(amg.baseFee).toBeGreaterThan(keeper.baseFee);
    expect(tca.premium).toBeGreaterThan(amg.premium);
    expect(amg.premium).toBeGreaterThan(keeper.premium);
  });

  it('only AMG has a bulk break (5+ → 20% off, 10+ → 35% off)', () => {
    expect(gradingBulkMult('amg', 4)).toBe(1);
    expect(gradingBulkMult('amg', 5)).toBe(0.8);
    expect(gradingBulkMult('amg', 10)).toBe(0.65);
    expect(gradingBulkMult('tca', 50)).toBe(1);
    expect(gradingBulkMult('keeper', 50)).toBe(1);
  });

  it('instant costs a lot; keeper rushes cheapest', () => {
    for (const s of GRADING_SERVICES) {
      expect(gradingSpeedMult(s.id, 'instant')).toBeGreaterThan(gradingSpeedMult(s.id, 'rush'));
      expect(gradingSpeedMult(s.id, 'rush')).toBeGreaterThan(gradingSpeedMult(s.id, 'standard'));
    }
    expect(gradingSpeedMult('keeper', 'rush')).toBeLessThan(gradingSpeedMult('tca', 'rush'));
  });

  it('unit fee mirrors the SQL formula (ceil of base × speed × bulk)', () => {
    expect(gradingUnitFee('tca', 'standard', 1)).toBe(400);
    expect(gradingUnitFee('tca', 'rush', 1)).toBe(Math.ceil(400 * 1.75));
    expect(gradingUnitFee('amg', 'standard', 10)).toBe(Math.ceil(180 * 0.65));
    expect(gradingUnitFee('keeper', 'instant', 1)).toBe(70 * 5);
  });

  it('grade multipliers cover the 5–10 half-point scale and rise monotonically', () => {
    expect(GRADE_MULTIPLIERS[0][0]).toBe(5);
    expect(GRADE_MULTIPLIERS[GRADE_MULTIPLIERS.length - 1][0]).toBe(10);
    for (let i = 1; i < GRADE_MULTIPLIERS.length; i++) {
      expect(GRADE_MULTIPLIERS[i][0] - GRADE_MULTIPLIERS[i - 1][0]).toBeCloseTo(0.5);
      expect(GRADE_MULTIPLIERS[i][1]).toBeGreaterThan(GRADE_MULTIPLIERS[i - 1][1]);
    }
    // Every rollable grade has a display word.
    for (const [g] of GRADE_MULTIPLIERS) expect(GRADE_WORDS[String(g)]).toBeTruthy();
  });

  it('a good grade significantly beats the raw quicksell price', () => {
    const raw = quicksellPrice('Rare', false);
    expect(gradedQuicksellPrice('Rare', false, 10, 'tca')).toBeGreaterThan(raw * 10);
    expect(gradedQuicksellPrice('Rare', false, 9, 'keeper')).toBeGreaterThan(raw * 4 - 1);
    // A low grade is close to break-even, not a windfall.
    expect(gradedQuicksellPrice('Rare', false, 5, 'keeper')).toBeLessThan(raw * 1.2);
    // Same grade: TCA slab sells above the Keeper slab.
    expect(gradedQuicksellPrice('Rare', false, 9, 'tca')).toBeGreaterThan(
      gradedQuicksellPrice('Rare', false, 9, 'keeper'),
    );
  });

  it('grade multiplier falls back to 1 for unknown grades', () => {
    expect(gradeMultiplier(4.5)).toBe(1);
  });

  it('formats grades without a trailing .0', () => {
    expect(fmtGrade(10)).toBe('10');
    expect(fmtGrade(9.5)).toBe('9.5');
  });
});
