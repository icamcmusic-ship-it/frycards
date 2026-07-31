/**
 * Fry Cards v5.0 catalog audit: every card in the deterministically-assigned
 * pool (cardpool.ts over the full generated catalog) must satisfy the
 * structural invariants of the Fry Cards data model — legal essence costs,
 * sane unit stats, only real keywords, color identities draftable under at
 * least one Leader, complete Leaders, and typed subtypes — and the whole
 * assignment must be deterministic.
 */
import { test, expect } from 'vitest';
import {
  POOL_V4,
  POOL_BY_ID,
  POOL_LEADERS,
  PRINTED_EFFECT_ADJUST,
  poolByType,
  applyCardPool,
} from './cardpool';
import { itemSurvives, totalCost } from './cards';
import { GENERATED_CARDS } from '../generated-cards';
import { KEYWORDS } from './keywords';
import { LEADER_COLORS, cardColors, isColorLegal } from './colors';

test('catalog sanity: pool is non-empty and has Leaders', () => {
  expect(POOL_V4.length).toBeGreaterThan(0);
  expect(POOL_LEADERS.length).toBeGreaterThan(0);
  expect(POOL_LEADERS.every((c) => c.type === 'Leader')).toBe(true);
  expect(poolByType('Unit').length).toBeGreaterThan(0);
  expect(Object.keys(POOL_BY_ID).length).toBe(POOL_V4.length);
});

test('every canonical leader id is in the pool as a Leader', () => {
  for (const id of Object.keys(LEADER_COLORS)) {
    const def = POOL_BY_ID[id];
    expect(def, `missing leader ${id}`).toBeTruthy();
    expect(def.type, `${id} must be a Leader`).toBe('Leader');
  }
});

test('every card has a legal essence cost (total 0-8, non-negative parts)', () => {
  for (const c of POOL_V4) {
    expect(c.cost, `${c.id}: missing cost`).toBeTruthy();
    const t = totalCost(c.cost);
    expect(t, `${c.id}: total cost ${t} out of range`).toBeGreaterThanOrEqual(0);
    expect(t, `${c.id}: total cost ${t} out of range`).toBeLessThanOrEqual(8);
    expect(c.cost!.generic, `${c.id}: negative generic`).toBeGreaterThanOrEqual(0);
    for (const [type, n] of Object.entries(c.cost!.pips)) {
      expect(n ?? 0, `${c.id}: bad pip count for ${type}`).toBeGreaterThanOrEqual(1);
    }
  }
});

/**
 * The other half of "only real keywords": every real keyword must reach at
 * least one card. A keyword the engine implements and the rulebook prints but
 * that no card can carry is dead text the player is told about and can never
 * meet — and it is invisible to every other test in this file, all of which
 * check cards rather than coverage.
 *
 * This has bitten twice. v7.3 shipped Warlord to zero carriers (a Leader-only
 * keyword over a 9-Leader pool), and v7.4 found Unbreakable had NEVER printed:
 * premium-gated to 21 eligible Units, at index 1 of two four-entry colour
 * lists, needing one of those two colours as the primary. Both were found by
 * hand, months apart. This test is what makes the third one fail loudly.
 */
test('every keyword the rulebook prints reaches at least one card', () => {
  const carriers = new Map<string, number>();
  for (const kw of KEYWORDS) carriers.set(kw, 0);
  for (const c of POOL_V4) {
    for (const kw of c.keywords ?? []) carriers.set(kw, (carriers.get(kw) ?? 0) + 1);
  }
  const dead = [...carriers].filter(([, n]) => n === 0).map(([kw]) => kw);
  expect(dead, `keywords with no carrier in the pool: ${dead.join(', ')}`).toEqual([]);
});

test('units have sane stats and only real keywords', () => {
  for (const c of POOL_V4) {
    if (c.type !== 'Unit') continue;
    expect(c.might ?? -1, `${c.id}: Unit needs might >= 0`).toBeGreaterThanOrEqual(0);
    expect(c.grit ?? 0, `${c.id}: Unit needs grit >= 1`).toBeGreaterThanOrEqual(1);
  }
  for (const c of POOL_V4) {
    for (const kw of c.keywords ?? []) {
      expect((KEYWORDS as readonly string[]).includes(kw), `${c.id}: unknown keyword "${kw}"`).toBe(
        true,
      );
    }
    expect(new Set(c.keywords ?? []).size, `${c.id}: duplicate keywords`).toBe(
      (c.keywords ?? []).length,
    );
  }
});

test('every non-Leader card is color-legal for at least one Leader', () => {
  const identities = Object.values(LEADER_COLORS);
  for (const c of POOL_V4) {
    if (c.type === 'Leader') continue;
    expect(
      identities.some((identity) => isColorLegal(c, identity)),
      `${c.id}: colors [${cardColors(c).join(', ')}] fit no Leader identity`,
    ).toBe(true);
    expect(cardColors(c).length, `${c.id}: more than 2 colors`).toBeLessThanOrEqual(2);
  }
});

test('leaders have resolve and exactly 2 abilities with text', () => {
  for (const c of POOL_V4) {
    if (c.type !== 'Leader') continue;
    expect(c.resolve ?? 0, `${c.id}: Leader needs Resolve`).toBeGreaterThanOrEqual(3);
    expect(c.resolve!, `${c.id}: Resolve too high`).toBeLessThanOrEqual(6);
    expect(c.leaderAbilities?.length, `${c.id}: Leader needs 2 abilities`).toBe(2);
    const [a, b] = c.leaderAbilities!;
    expect(a.resolveDelta, `${c.id}: first ability must spend Resolve`).toBeLessThan(0);
    expect(b.resolveDelta, `${c.id}: second ability must build Resolve`).toBeGreaterThan(0);
    for (const ab of c.leaderAbilities!) {
      expect(ab.text, `${c.id}: ability missing text`).toBeTruthy();
    }
  }
});

test('subtypes: Locations are Sanctums with produces; Items/Events typed', () => {
  for (const c of POOL_V4) {
    if (c.type === 'Location') {
      expect(c.subtype, `${c.id}: Location subtype`).toBe('Sanctum');
      expect(c.produces, `${c.id}: Sanctum must produce an essence type`).toBeTruthy();
      // v6.0: Bountiful Sanctums ARE their ability (double essence — no
      // passive/trigger); every other Sanctum has exactly one of the two.
      if (c.keywords?.includes('Bountiful')) {
        expect(
          !c.locPassive && !(c.triggers && c.triggers.length > 0),
          `${c.id}: Bountiful Sanctum must have no other ability`,
        ).toBe(true);
      } else if (PRINTED_EFFECT_ADJUST[c.id] !== undefined && !c.locPassive && !c.triggers) {
        // v7.6: a balance lever may zero a Sanctum's printed ability outright
        // (PRINTED_EFFECT_ADJUST — the only move it has on a card whose
        // magnitude is already the minimum of 1). That is legal, but the
        // invariant this test exists for is "no Sanctum prints blank", not
        // "every Sanctum has a trigger" — so a zeroed one has to be carrying
        // keyword text instead.
        expect(
          (c.keywords ?? []).length > 0,
          `${c.id}: a Sanctum with its printed ability zeroed must still carry a keyword`,
        ).toBe(true);
        expect(c.text, `${c.id}: Sanctum needs rules text`).toBeTruthy();
      } else {
        expect(
          !!c.locPassive !== !!(c.triggers && c.triggers.length > 0),
          `${c.id}: Sanctum needs exactly one of locPassive / trigger`,
        ).toBe(true);
      }
    }
    if (c.type === 'Item') {
      expect(['Charm', 'Weapon', 'Tool']).toContain(c.subtype);
      expect(c.bond, `${c.id}: Item needs bond stats`).toBeTruthy();
      if (itemSurvives(c.subtype)) {
        expect(c.rebondCost ?? 0, `${c.id}: ${c.subtype} needs rebondCost`).toBeGreaterThanOrEqual(
          1,
        );
      } else {
        expect(c.rebondCost, `${c.id}: a Charm never re-bonds`).toBeUndefined();
      }
      if (c.subtype === 'Tool') {
        expect(c.nerf ?? 0, `${c.id}: a Tool needs a nerf value`).toBeGreaterThanOrEqual(1);
      }
    }
    if (c.type === 'Event') {
      expect(['Quick', 'Slow']).toContain(c.subtype);
      expect(c.onInvoke, `${c.id}: Event needs an onInvoke effect`).toBeTruthy();
    }
  }
});

test('every card has human-readable rules text (except vanilla units)', () => {
  for (const c of POOL_V4) {
    if (c.type === 'Unit') continue; // vanilla units may have empty text
    expect(c.text, `${c.id}: missing text`).toBeTruthy();
  }
  // Units with mechanics must describe them.
  for (const c of POOL_V4) {
    if (c.type !== 'Unit') continue;
    if (c.keywords?.length || c.onInvoke || c.triggers?.length) {
      expect(c.text, `${c.id}: unit with mechanics needs text`).toBeTruthy();
    }
  }
});

test('effect values are modest (1-7)', () => {
  const effects = (c: (typeof POOL_V4)[number]) => {
    const out = [];
    if (c.onInvoke) out.push(c.onInvoke);
    for (const t of c.triggers ?? []) out.push(t.effect);
    for (const a of c.leaderAbilities ?? []) out.push(a.effect);
    return out;
  };
  for (const c of POOL_V4) {
    for (const e of effects(c)) {
      if (e.value !== undefined) {
        expect(e.value, `${c.id}: effect value ${e.value}`).toBeGreaterThanOrEqual(1);
        expect(e.value, `${c.id}: effect value ${e.value}`).toBeLessThanOrEqual(7);
      }
    }
  }
});

test('no dice/combo/threshold concepts remain on any card', () => {
  for (const c of POOL_V4) {
    const anyCard = c as unknown as Record<string, unknown>;
    for (const legacy of ['threshold', 'comboGate', 'castCostKind', 'combo', 'atk', 'hp']) {
      expect(anyCard[legacy], `${c.id}: legacy field ${legacy} present`).toBeUndefined();
    }
  }
});

test('assignment is deterministic: rebuilding yields a deep-equal pool', () => {
  const first = JSON.parse(JSON.stringify(POOL_V4));
  applyCardPool(GENERATED_CARDS);
  const second = JSON.parse(JSON.stringify(POOL_V4));
  expect(second).toEqual(first);
});

// v6.2: Leader-kit manual override (the Leader-kit equivalent of
// COST_ADJUST/STAT_ADJUST for regular cards — see cardpool.ts's
// LEADER_KEYWORD_STRIP). Avatar of the Abyss was a confirmed repeat-offender
// outlier (v6.2 balance pass) stacking max Resolve, an
// unconditional -2 Shatter, and Commander's global +1 Might in one kit;
// Commander was stripped from its kit specifically.
test('v6.2: Avatar of the Abyss lost its Commander keyword (repeat-offender Leader nerf)', () => {
  const abyss = POOL_BY_ID['avatar_of_the_abyss'];
  expect(abyss).toBeTruthy();
  expect(abyss.type).toBe('Leader');
  expect(abyss.keywords ?? []).not.toContain('Commander');
});

// v7.3: a Unit at Rare or above always prints an ability. A vanilla body is a
// legitimate part of the curve, but only at Common/Uncommon — before this,
// 37 cards rolled zero keywords AND lost mapUnit's 1-in-4 effect roll and
// printed a bare stat line with no rules text at all, Full-Art pulls included.
test('v7.3: no Rare-or-better card prints an empty rules box', () => {
  const vanillaOk = new Set(['Common', 'Uncommon']);
  const blank = POOL_V4.filter((c) => !vanillaOk.has(c.rarity || 'Common') && !c.text?.trim()).map(
    (c) => `${c.id} (${c.type}/${c.rarity})`,
  );
  expect(blank).toEqual([]);
});

// Every non-Unit type carries a mechanic by construction at EVERY rarity —
// Events an onInvoke, Items a bond, Locations a Sanctum tap, Leaders their
// two abilities. Only Units may be vanilla.
test('v7.3: every non-Unit card carries a mechanic at any rarity', () => {
  const empty = POOL_V4.filter((c) => {
    if (c.type === 'Unit') return false;
    const hasMech =
      !!c.onInvoke ||
      !!c.triggers?.length ||
      !!c.leaderAbilities?.length ||
      !!c.locPassive ||
      !!c.produces ||
      !!c.bond?.might ||
      !!c.bond?.grit ||
      !!c.bond?.grants;
    return !hasMech || !c.text?.trim();
  }).map((c) => `${c.id} (${c.type})`);
  expect(empty).toEqual([]);
});
