/**
 * Fry Cards v6.0 keyword table sanity: the legal set, UI text, cost weights,
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
  KEYWORD_COLOR,
} from './keywords';
import { poolHasKeyword } from './cardpool';
import { KEYWORDS_OF_COLOR } from './colors';

const EXPECTED = [
  // 14 rulebook Unit keywords
  'Aerial',
  'Overrun',
  'Quickstrike',
  'Doublestrike',
  'Venomous',
  'Siphon',
  'Alert',
  'Reckless',
  'Swarmproof',
  'Skywatch',
  'Warded',
  'Unbreakable',
  'Ambush',
  'Immobile',
  // v6.0 type keywords: 2 per card type
  'Regenerate',
  'Hardened', // Unit
  'Surge',
  'Resonant', // Event
  'Runic',
  'Soulbound', // Charm
  'Bountiful',
  'Sacred', // Location
  'Commander',
  'Resolute', // Leader
  // v6.9 new-generation Unit keywords: one per Essence Type
  'Wildfire',
  'Tidecaller',
  'Thriving',
  'Nimble',
  'Radiant',
  'Withering',
  'Entropic',
  // v7.3 non-Unit keywords, each themed to one Essence Type
  'Echoing',
  'Ritual', // Event
  'Empowering',
  'Tethered', // Charm
  'Bulwark',
  'Blighted',
  'Archivist', // Location
  'Warlord', // Leader
  // v7.4: the six names the roadmap carried unimplemented since v4.x, each
  // designed against a gap the live pool actually had (see keywords.ts).
  'Exhume', // Unit — ash-pile recursion, of which the pool had none
  'Scorched-Earth', // Unit — a death trigger that hits the enemy BOARD
  'Blessed', // Charm — the only damage shield on a unit
  'Freeze-Dry', // Location — the only interaction with an ash-pile
  'Glaciate', // Event — tempo denial that outlasts the next Dawn
  'Fate', // Event — the only card selection in the pool
];

describe('keyword set', () => {
  test('the 14 rulebook + 10 v6.0 + 7 v6.9 + 8 v7.3 + 6 v7.4 keywords, unique', () => {
    expect([...KEYWORDS].sort()).toEqual([...EXPECTED].sort());
    expect(new Set(KEYWORDS).size).toBe(KEYWORDS.length);
  });

  test('every keyword maps to a card type; every non-Unit type gained options', () => {
    for (const kw of KEYWORDS) expect(KEYWORD_TYPES[kw]).toBeTruthy();
    expect(keywordsForType('Unit').length).toBe(25);
    // v7.3: was a flat 2 apiece. Leader keeps the smallest vocabulary on
    // purpose — there are only 9 Leaders in the pool, so a Leader-only
    // keyword is thinly printed by construction (which is why Archivist was
    // moved to Location, where ~50 cards can carry it).
    const counts: Record<string, number> = {
      Event: 6,
      Charm: 5,
      Location: 6,
      Leader: 3,
    };
    for (const [t, n] of Object.entries(counts)) {
      expect(keywordsForType(t as 'Event').length, `${t} keywords`).toBe(n);
    }
  });

  test('v7.3: every new non-Unit keyword is colour-themed and actually printed', () => {
    const NEW = [
      'Echoing',
      'Ritual',
      'Empowering',
      'Tethered',
      'Bulwark',
      'Blighted',
      'Archivist',
      'Warlord',
    ] as const;
    // Each carries an Essence Type, and between them they cover all seven —
    // the point of the pass was that the non-Unit types had no colour
    // identity in their keyword vocabulary at all.
    const colours = new Set(NEW.map((kw) => KEYWORD_COLOR[kw]));
    expect(colours.size).toBe(7);
    for (const kw of NEW) expect(KEYWORD_COLOR[kw], `${kw} colour`).toBeTruthy();
    // Dead text is the failure mode this pass had to design around: a strict
    // colour match left Echoing, Ritual and Bulwark on ZERO cards. Every new
    // keyword must appear on at least one card in the real pool.
    for (const kw of NEW) {
      expect(poolHasKeyword(kw).length, `${kw} has no carriers`).toBeGreaterThan(0);
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
