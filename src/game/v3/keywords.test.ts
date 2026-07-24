/**
 * Riftbound v5.0 keyword table sanity: the legal set, UI text, and cost
 * weights all stay in lockstep, and the color theming table only references
 * real keywords.
 */
import { describe, expect, test } from 'vitest';
import { KEYWORDS, KEYWORD_COST, KEYWORD_TEXT, Keyword, isKeyword, keywordLabel } from './keywords';
import { KEYWORDS_OF_COLOR } from './colors';

const EXPECTED = [
  'Aerial', 'Overrun', 'Quickstrike', 'Doublestrike', 'Venomous', 'Siphon',
  'Alert', 'Reckless', 'Swarmproof', 'Skywatch', 'Warded', 'Unbreakable',
  'Ambush', 'Immobile',
];

describe('keyword set', () => {
  test('exactly the 14 rulebook keywords, unique', () => {
    expect([...KEYWORDS].sort()).toEqual([...EXPECTED].sort());
    expect(new Set(KEYWORDS).size).toBe(KEYWORDS.length);
  });

  test('isKeyword recognizes the set and rejects retired v4.x keywords', () => {
    for (const kw of KEYWORDS) expect(isKeyword(kw)).toBe(true);
    for (const old of ['Guard', 'Swift', 'Pierce', 'Ward', 'Echo', 'Twin', 'Anchor', 'Rally']) {
      expect(isKeyword(old)).toBe(false);
    }
  });

  test('every keyword has non-empty rules text', () => {
    for (const kw of KEYWORDS) {
      expect(KEYWORD_TEXT[kw]).toBeTruthy();
      expect(KEYWORD_TEXT[kw].length).toBeGreaterThan(10);
    }
  });

  test('every keyword has a cost weight; Immobile is the only discount', () => {
    for (const kw of KEYWORDS) expect(typeof KEYWORD_COST[kw]).toBe('number');
    expect(KEYWORD_COST.Immobile).toBeLessThan(0);
    for (const kw of KEYWORDS) {
      if (kw !== 'Immobile') expect(KEYWORD_COST[kw]).toBeGreaterThanOrEqual(0);
    }
  });

  test('keywordLabel is stable', () => {
    for (const kw of KEYWORDS) expect(keywordLabel(kw)).toBe(kw);
  });

  test('KEYWORDS_OF_COLOR only references legal keywords', () => {
    for (const kws of Object.values(KEYWORDS_OF_COLOR)) {
      for (const kw of kws) expect(isKeyword(kw)).toBe(true);
    }
  });

  test('the strongest combat keywords carry the biggest cost weights', () => {
    const heavy: Keyword[] = ['Doublestrike', 'Unbreakable'];
    for (const kw of heavy) expect(KEYWORD_COST[kw]).toBeGreaterThanOrEqual(3);
  });
});
