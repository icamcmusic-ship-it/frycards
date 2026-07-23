/**
 * Riftbound v5.0 catalog audit: every card in the deterministically-assigned
 * pool (cardpool.ts over the full generated catalog) must satisfy the
 * structural invariants of the Riftbound data model — legal essence costs,
 * sane unit stats, only real keywords, color identities draftable under at
 * least one Leader, complete Leaders, and typed subtypes — and the whole
 * assignment must be deterministic.
 */
import { test, expect } from 'vitest';
import { POOL_V4, POOL_BY_ID, POOL_LEADERS, poolByType, applyCardPool } from './cardpool';
import { totalCost } from './cards';
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

test('the 8 canonical leader ids are in the pool as Leaders', () => {
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

test('units have sane stats and only real keywords', () => {
  for (const c of POOL_V4) {
    if (c.type !== 'Unit') continue;
    expect(c.might ?? -1, `${c.id}: Unit needs might >= 0`).toBeGreaterThanOrEqual(0);
    expect(c.grit ?? 0, `${c.id}: Unit needs grit >= 1`).toBeGreaterThanOrEqual(1);
  }
  for (const c of POOL_V4) {
    for (const kw of c.keywords ?? []) {
      expect(
        (KEYWORDS as readonly string[]).includes(kw),
        `${c.id}: unknown keyword "${kw}"`,
      ).toBe(true);
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

test('subtypes: Locations are Sanctums with produces; Charms/Events typed', () => {
  for (const c of POOL_V4) {
    if (c.type === 'Location') {
      expect(c.subtype, `${c.id}: Location subtype`).toBe('Sanctum');
      expect(c.produces, `${c.id}: Sanctum must produce an essence type`).toBeTruthy();
      expect(
        !!c.locPassive !== !!(c.triggers && c.triggers.length > 0),
        `${c.id}: Sanctum needs exactly one of locPassive / trigger`,
      ).toBe(true);
    }
    if (c.type === 'Charm') {
      expect(['Bound', 'Worn']).toContain(c.subtype);
      expect(c.bond, `${c.id}: Charm needs bond stats`).toBeTruthy();
      if (c.subtype === 'Worn') {
        expect(c.rebondCost ?? 0, `${c.id}: Worn needs rebondCost`).toBeGreaterThanOrEqual(1);
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
