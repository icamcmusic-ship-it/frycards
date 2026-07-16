/**
 * Catalog audit (v4.3): every card in the playable pool (the full generated
 * catalog mapped by cardpool.ts, plus the legacy CARDS_V3 fixtures) must
 * reference only keywords, effect actions, and effect targets the engine in
 * engine.ts actually implements — and must satisfy the structural invariants
 * each keyword's implementation assumes.
 */
import { test, expect } from 'vitest';
import { POOL_V4 } from './cardpool';
import { CARDS_V3, CardDef, Effect } from './cards';

// Simple keywords the engine reads via hasKw().
const SIMPLE_KEYWORDS = new Set([
  'Guard',
  'Swift',
  'Pierce',
  'Ward',
  'Frenzy',
  'Anchor',
  'Echo',
  'Scrap',
  'Rally',
  'Twin',
]);
// Marker keywords whose behavior lives in a structured CardDef field.
const FIELD_KEYWORDS: Record<string, (c: CardDef) => boolean> = {
  Bulwark: (c) => !!c.bulwark,
  Toll: (c) => !!c.toll,
  Avenge: (c) => !!c.avenge,
  Crescendo: (c) => !!c.crescendo,
  Aftershock: (c) => !!c.aftershock,
  Snap: (c) => !!c.snap,
  Tribute: (c) => !!c.tribute,
  Excavate: (c) => !!c.excavate,
  Contested: (c) => !!c.contested,
  Resolve: (c) => !!c.resolve,
  Ultimate: (c) => !!c.ultimate,
  Steel: (c) => !!c.steel,
};

const ACTIONS = new Set(['sap', 'mend', 'draw', 'bind', 'destroy', 'buff']);
// Targets applyEffect() + autoTarget() meaningfully handle per action.
const TARGETS_BY_ACTION: Record<string, Set<string>> = {
  sap: new Set(['anyTarget', 'enemyUnit', 'enemyLeader', 'allEnemyUnits', 'self']),
  destroy: new Set(['enemyUnit', 'allEnemyUnits', 'anyTarget']),
  mend: new Set(['friendlyAny', 'friendlyLeader', 'friendlyUnit', 'self']),
  draw: new Set(['none']),
  bind: new Set(['enemyUnit']),
  buff: new Set(['self', 'friendlyUnit', 'allFriendlyUnits']),
};
// Actions whose engine implementation reads eff.value (must be >= 1).
const VALUED_ACTIONS = new Set(['sap', 'mend', 'draw', 'buff']);

const PATTERNS = new Set([
  'AnyPair',
  'TwoPair',
  'ThreeKind',
  'SmallStraight',
  'FullHouse',
  'LargeStraight',
  'FourKind',
  'Yahtzee',
  'ThreeOdds',
  'ThreeEvens',
]);

function collectEffects(c: CardDef): [string, Effect][] {
  const out: [string, Effect][] = [];
  if (c.onCast) out.push(['onCast', c.onCast]);
  if (c.ability) out.push(['ability', c.ability.effect]);
  if (c.combo) out.push(['combo', c.combo.effect]);
  if (c.overflow) out.push(['overflow', c.overflow.effect]);
  if (c.twinBonus) out.push(['twinBonus', c.twinBonus]);
  if (c.stagedPassive) out.push(['stagedPassive', c.stagedPassive]);
  if (c.aftershock) out.push(['aftershock', c.aftershock]);
  if (c.tribute) out.push(['tribute', c.tribute]);
  if (c.ultimate) out.push(['ultimate', c.ultimate.effect]);
  return out;
}

const ALL_CARDS: CardDef[] = [...POOL_V4, ...CARDS_V3];

test('catalog sanity: pool is non-empty and has Leaders', () => {
  expect(POOL_V4.length).toBeGreaterThan(0);
  expect(POOL_V4.some((c) => c.type === 'Leader')).toBe(true);
});

test('every card keyword is one the engine implements', () => {
  for (const c of ALL_CARDS) {
    for (const kw of c.keywords || []) {
      expect(
        SIMPLE_KEYWORDS.has(kw) || kw in FIELD_KEYWORDS,
        `${c.id}: unknown keyword "${kw}"`,
      ).toBe(true);
    }
    // No duplicate keywords.
    expect(new Set(c.keywords || []).size, `${c.id}: duplicate keywords`).toBe(
      (c.keywords || []).length,
    );
  }
});

test('field-backed keywords are consistent in both directions', () => {
  for (const c of ALL_CARDS) {
    for (const [kw, has] of Object.entries(FIELD_KEYWORDS)) {
      if (c.keywords?.includes(kw)) {
        expect(has(c), `${c.id}: keyword ${kw} without its data field`).toBe(true);
      }
      // Reverse direction only for pool cards (CARDS_V3 predates the tags).
      if (POOL_V4.includes(c) && has(c)) {
        expect(c.keywords?.includes(kw), `${c.id}: field ${kw} without its keyword tag`).toBe(true);
      }
    }
  }
});

test('every effect uses an implemented action, a legal target for it, and a sane value', () => {
  for (const c of ALL_CARDS) {
    for (const [where, e] of collectEffects(c)) {
      expect(ACTIONS.has(e.action), `${c.id} ${where}: unknown action ${e.action}`).toBe(true);
      expect(
        TARGETS_BY_ACTION[e.action].has(e.target),
        `${c.id} ${where}: action ${e.action} with unhandled target ${e.target}`,
      ).toBe(true);
      if (VALUED_ACTIONS.has(e.action)) {
        expect(
          e.value ?? 0,
          `${c.id} ${where}: ${e.action} needs value >= 1`,
        ).toBeGreaterThanOrEqual(1);
      }
    }
    if (c.combo) expect(PATTERNS.has(c.combo.pattern), `${c.id}: bad combo pattern`).toBe(true);
    if (c.comboGate) expect(PATTERNS.has(c.comboGate), `${c.id}: bad comboGate`).toBe(true);
  }
});

test('cast-cost invariants: every non-Leader/Location card is castable, exact/gate rules hold', () => {
  for (const c of ALL_CARDS) {
    if (c.type === 'Leader') {
      expect(c.threshold, `${c.id}: Leader must not print a Cast Slot`).toBeUndefined();
      expect(c.hp ?? 0, `${c.id}: Leader needs HP`).toBeGreaterThan(0);
      expect(c.ability, `${c.id}: Leader needs an Ability Slot`).toBeTruthy();
      continue;
    }
    if (c.type === 'Location') {
      // v4.1: Locations are die-free — no Cast Slot of any format. (Legacy
      // CARDS_V3 Locations still print a threshold the engine ignores, so
      // this invariant is asserted for the live pool only.)
      if (POOL_V4.includes(c)) {
        expect(c.threshold, `${c.id}: Location must not print a threshold`).toBeUndefined();
      }
      expect(c.comboGate, `${c.id}: Location must not be Combo-gated`).toBeUndefined();
      continue;
    }
    // Exactly one cost: a numeric threshold XOR a pattern gate.
    expect(
      (c.threshold !== undefined) !== (c.comboGate !== undefined),
      `${c.id}: needs exactly one of threshold / comboGate`,
    ).toBe(true);
    if (c.castCostKind === 'exact') {
      // A d6 must be able to show the exact number, and Overflow can never
      // fire on an exact cost (die - threshold is always 0).
      expect(c.threshold! >= 1 && c.threshold! <= 6, `${c.id}: unpayable exact cost`).toBe(true);
      expect(c.overflow, `${c.id}: Overflow on an exact cost can never trigger`).toBeUndefined();
    }
    if (c.comboGate) {
      expect(
        c.overflow,
        `${c.id}: Overflow on a gated cost has no threshold to exceed`,
      ).toBeUndefined();
    }
  }
});

test('per-keyword structural invariants (Twin bonus, ability thresholds, type gating)', () => {
  for (const c of ALL_CARDS) {
    if (c.keywords?.includes('Twin')) {
      expect(c.type, `${c.id}: Twin is a Unit mechanic`).toBe('Unit');
      expect(c.twinBonus, `${c.id}: §7 — every Twin card must print its own bonus`).toBeTruthy();
      expect(c.threshold, `${c.id}: Twin needs a numeric threshold`).toBeDefined();
      expect(c.castCostKind ?? 'atLeast', `${c.id}: Twin never uses sum/exact`).toBe('atLeast');
    }
    if (c.ability) {
      expect(
        c.ability.threshold >= 1 && c.ability.threshold <= 6,
        `${c.id}: unpayable Ability Slot threshold`,
      ).toBe(true);
    }
    if (c.ultimate) {
      expect(c.type, `${c.id}: Ultimate is Leader-only`).toBe('Leader');
      expect(c.ultimate.threshold >= 1 && c.ultimate.threshold <= 6).toBe(true);
      expect(c.ultimate.unlockTurn).toBeGreaterThanOrEqual(1);
    }
    if (c.resolve) expect(c.type, `${c.id}: Resolve is Leader-only`).toBe('Leader');
    if (c.bulwark || c.toll || c.avenge) {
      expect(c.type, `${c.id}: Bulwark/Toll/Avenge are Unit-only`).toBe('Unit');
    }
    if (c.tribute || c.excavate || c.contested) {
      expect(c.type, `${c.id}: Tribute/Excavate/Contested are Location-only`).toBe('Location');
    }
    if (c.snap) expect(c.type, `${c.id}: Snap is Charm-only`).toBe('Charm');
    if (c.crescendo) {
      expect(c.type, `${c.id}: Crescendo is Event-only`).toBe('Event');
      // Crescendo adds +X to "this Event's numeric effect" — meaningless
      // (and misleading on the card face) without a valued onCast.
      expect(
        c.onCast?.value ?? 0,
        `${c.id}: Crescendo on a valueless effect`,
      ).toBeGreaterThanOrEqual(1);
    }
    if (c.aftershock) {
      expect(c.type, `${c.id}: Aftershock is Event-only`).toBe('Event');
      // §10: Aftershock is a "lower-value repeat" — a valueless action
      // (bind/destroy) would repeat at FULL strength for free.
      expect(
        VALUED_ACTIONS.has(c.aftershock.action),
        `${c.id}: Aftershock must repeat a valued effect, got ${c.aftershock.action}`,
      ).toBe(true);
    }
    if (c.excavate) {
      expect(c.ability, `${c.id}: Excavate needs an Ability Slot to discount`).toBeTruthy();
    }
    if (c.type === 'Unit') {
      expect(c.atk ?? -1, `${c.id}: Unit needs ATK >= 0`).toBeGreaterThanOrEqual(0);
      expect(c.hp ?? 0, `${c.id}: Unit needs HP >= 1`).toBeGreaterThanOrEqual(1);
    }
  }
});
