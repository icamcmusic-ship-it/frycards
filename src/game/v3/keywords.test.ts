/**
 * Riftbound v6.0 keyword table sanity: the legal set, UI text, cost weights,
 * and per-type vocabulary all stay in lockstep, and the color theming table
 * only references real keywords.
 */
import { describe, expect, test } from 'vitest';
import {
  KEYWORDS,
  KEYWORD_COST,
  KEYWORD_TEXT,
  KEYWORD_TYPES,
  Keyword,
  isKeyword,
  keywordLabel,
  keywordsForType,
} from './keywords';
import { KEYWORDS_OF_COLOR } from './colors';

const EXPECTED = [
  // 14 rulebook Unit keywords
  'Aerial', 'Overrun', 'Quickstrike', 'Doublestrike', 'Venomous', 'Siphon',
  'Alert', 'Reckless', 'Swarmproof', 'Skywatch', 'Warded', 'Unbreakable',
  'Ambush', 'Immobile',
  // v6.0 type keywords: 2 per card type
  'Regenerate', 'Hardened', // Unit
  'Surge', 'Resonant', // Event
  'Runic', 'Soulbound', // Charm
  'Bountiful', 'Sacred', // Location
  'Commander', 'Resolute', // Leader
];

describe('keyword set', () => {
  test('the 14 rulebook keywords + 10 v6.0 type keywords, unique', () => {
    expect([...KEYWORDS].sort()).toEqual([...EXPECTED].sort());
    expect(new Set(KEYWORDS).size).toBe(KEYWORDS.length);
  });

  test('every keyword maps to a card type; non-Unit types have exactly 2', () => {
    for (const kw of KEYWORDS) expect(KEYWORD_TYPES[kw]).toBeTruthy();
    expect(keywordsForType('Unit').length).toBe(16);
    for (const t of ['Event', 'Charm', 'Location', 'Leader'] as const) {
      expect(keywordsForType(t).length, `${t} keywords`).toBe(2);
    }
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

  test('every keyword has a cost weight; only drawback-ish keywords discount', () => {
    for (const kw of KEYWORDS) expect(typeof KEYWORD_COST[kw]).toBe('number');
    // Immobile is a real drawback; Warded discounts since v5.3 (three sim
    // passes showed targeting denial consistently under-converting to wins).
    const discounts: Keyword[] = ['Immobile', 'Warded'];
    for (const kw of discounts) expect(KEYWORD_COST[kw]).toBeLessThan(0);
    for (const kw of KEYWORDS) {
      if (!discounts.includes(kw)) expect(KEYWORD_COST[kw]).toBeGreaterThanOrEqual(0);
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
