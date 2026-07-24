/**
 * Riftbound v5.0 card pool, built from the universal card catalog (live
 * Supabase `cards` table, or the bundled fallback in `generated-cards.ts`).
 *
 * Each card's CORE IDENTITY is untouched — name, image URL, flavor text,
 * rarity, set. Every card is assigned its Riftbound mechanics (Essence Cost,
 * Might/Grit, subtype, keywords, effects, Leader Resolve + abilities)
 * deterministically from a hash of its id plus its type and rarity, so the
 * whole set is playable under the rulebook and the assignment is identical
 * on every client. See docs/RIFTBOUND_SPEC.md.
 *
 * MUST NOT import engine.ts (spec contract).
 */
import type {
  CardDef,
  CharmSubtype,
  Effect,
  EssenceCost,
  EventSubtype,
  LeaderAbility,
  TriggeredAbility,
} from './cards';
import { totalCost } from './cards';
import type { CardTemplate } from '../../types';
import { GENERATED_CARDS } from '../generated-cards';
import { COLORS, KEYWORDS_OF_COLOR, LEADER_COLORS, Color } from './colors';
import { KEYWORD_COST, KEYWORD_TEXT, Keyword, isKeyword } from './keywords';

// ---------------------------------------------------------------------------
// Deterministic hashing — FNV-1a, same util style as the v4.x pool, so the
// assignment is stable per card id and identical on every client.
// ---------------------------------------------------------------------------
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
const pick = <T>(seed: string, salt: number, arr: T[]): T =>
  arr[(hash(seed) + salt) % arr.length];
/** Uniform integer in [0, n) from a salted hash of the card's seed. */
const roll = (seed: string, salt: string, n: number): number => hash(`${seed}:${salt}`) % n;

const RARITY_TIER: Record<string, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  'Super-Rare': 3,
  'Full-Art': 4,
  'Ultra-Rare': 5,
  Mythic: 6,
};

/** Per-card hash seed: id + type + rarity, per the spec. */
const seedOf = (c: CardTemplate): string => `${c.id}|${c.type}|${c.rarity ?? 'Common'}`;

/** Per-card total-cost adjustments from sim outliers (residuals confirmed
 * across at least two independent runs before a card is listed).
 * v5.1 pass: first five entries. v5.3 pass (BALANCE_SIM_FINDINGS_v5.3.md):
 * repeat overperformers +1, repeat underperformers -1. */
const COST_ADJUST: Record<string, number> = {
  heart_coral: +1, // v5.1: +21.7pt residual Sanctum
  needle_seamstress: +1, // v5.1: 78% played win at cost 3
  merfolk_ritual: +1, // v5.1: 74% played win Worn charm
  pufferfish_lantern: +1, // v5.1: 77% played win at cost 2
  clawblade_greatsword: +1, // v5.1: +15.4pt residual Worn charm
  slate_scaled_serpent: +1, // v5.3: +8.9/+12.5 residual, 3rd consecutive pass
  worm_brain_host: +1, // v5.3: +8.7/+7.2 both seeds
  smokeveil_striketeam: +1, // v5.3: +6.5/+11.2 both seeds (and v5.2)
  crowned_manatee: +1, // v5.3: +8.0/+6.3 both seeds (and v5.2)
  constellation_crabs: +1, // v5.3: +7.6 seed 777 + both v5.2 seeds
  nebula_clutch: +1, // v5.3: +9.7 seed 1337 + both v5.2 seeds
  shatterline: +1, // v5.3: +6.8/+7.8 both seeds
  submerged_starfall: -1, // v5.3: -9.5 + v5.2 seed-1337 -8.7
  nanite_purge_protocol: -1, // v5.3: negative both seeds + v5.2 seed 777
  coral_collapse: -1, // v5.3: -4.2 + v5.2 negative list
  tectonic_rift: -1, // v5.3: -4.4 + v5.2 negative list
  consuming_ash_cloud: -1, // v5.3: 13.8% absolute played win, -5.2 residual
  research_fleet: -1, // v5.3: 65%/74% dead-in-hand two passes running
};
const adjustFor = (id: string): number => COST_ADJUST[id] ?? 0;

/** v5.3: per-card STAT-budget adjustments, for overperformers already at the
 * cost cap of 7 where a COST_ADJUST would be clipped to nothing. */
const STAT_ADJUST: Record<string, number> = {
  nanite_division_marshal: -2, // +8.5/+13.7 residual both seeds at cost 7
};
const statAdjustFor = (id: string): number => STAT_ADJUST[id] ?? 0;

// ---------------------------------------------------------------------------
// Color assignment. Two-color cards must only use pairs some Leader actually
// has (LEADER_COLORS), otherwise they'd be undraftable dead weight — the
// exact bug the v4.16 pool audit found (28/284 cards illegal for every
// Leader). Enforced at assignment time by picking pairs from this list.
// ---------------------------------------------------------------------------
const LEGAL_PAIRS: [Color, Color][] = Object.values(LEADER_COLORS).map(
  (p) => [p[0], p[1]] as [Color, Color],
);

/** Colors for a non-Leader card: [] colorless (~8%), 2 on-pair colors
 * (~15%, more at high rarity), else 1 color. */
function pickColors(seed: string, rt: number): Color[] {
  const r = roll(seed, 'colors', 100);
  if (r < 8) return [];
  const twoChance = 15 + rt * 3; // rarer cards skew multicolor
  if (r < 8 + twoChance) {
    const pair = pick(seed, 7, LEGAL_PAIRS);
    return [...pair];
  }
  return [pick(seed, 3, COLORS)];
}

// ---------------------------------------------------------------------------
// Essence cost. Target total ≈ clamp(1 + rt/2 + spread(0..3), 1, 7), adjusted
// by keyword cost weights (+1 per 2 weight; Immobile's negative weight
// discounts). Pips: 1 per color; "deeply colored" high-rarity single-color
// cards (~20%) print 2 pips of their color. Generic = total - pips.
// ---------------------------------------------------------------------------
function baseTotal(seed: string, rt: number): number {
  const spread = roll(seed, 'spread', 4); // 0..3
  return Math.max(1, Math.min(7, Math.round(1 + rt / 2 + spread)));
}

function keywordCostAdj(keywords: string[]): number {
  let w = 0;
  for (const kw of keywords) if (isKeyword(kw)) w += KEYWORD_COST[kw];
  return Math.round(w / 2);
}

function buildCost(seed: string, colors: Color[], total: number, rt: number): EssenceCost {
  const pips: Partial<Record<Color, number>> = {};
  let pipSum = 0;
  if (colors.length === 1 && rt >= 3 && roll(seed, 'deep', 5) === 0) {
    pips[colors[0]] = 2; // deeply colored high-rarity card
    pipSum = 2;
  } else {
    for (const c of colors) {
      pips[c] = 1;
      pipSum += 1;
    }
  }
  const t = Math.max(total, pipSum);
  return { generic: t - pipSum, pips };
}

// ---------------------------------------------------------------------------
// Color-themed effects (spec themes: Ember damage, Tide draw, Root buff,
// Gale recover/draw, Light heal, Shadow small damage/erode, Void
// banish/erode). `v` is the scaled magnitude for the card's cost.
// ---------------------------------------------------------------------------
function themedEffect(seed: string, color: Color | undefined, v: number): Effect {
  const val = Math.max(1, v);
  switch (color) {
    case 'Ember':
      return { action: 'damage', value: val, target: 'anyTarget' };
    case 'Tide':
      return { action: 'draw', value: Math.max(1, Math.min(3, Math.ceil(val / 2))), target: 'none' };
    case 'Root':
      return { action: 'buff', value: Math.max(1, Math.ceil(val / 2)), target: 'friendlyUnit' };
    case 'Gale':
      return roll(seed, 'gale-fx', 2) === 0
        ? { action: 'recover', target: 'friendlyUnit' }
        : { action: 'draw', value: 1, target: 'none' };
    case 'Light':
      return { action: 'heal', value: val, target: 'friendlyAny' };
    case 'Shadow':
      return roll(seed, 'shadow-fx', 2) === 0
        ? { action: 'damage', value: Math.max(1, Math.min(3, Math.ceil(val / 2))), target: 'enemyUnit' }
        : { action: 'erode', value: Math.max(1, Math.min(3, Math.ceil(val / 2))), target: 'enemyPlayer' };
    case 'Void':
      return roll(seed, 'void-fx', 2) === 0
        ? { action: 'erode', value: Math.max(1, Math.min(4, val)), target: 'enemyPlayer' }
        : { action: 'damage', value: Math.max(1, Math.min(3, Math.ceil(val / 2))), target: 'enemyUnit' };
    default:
      // Colorless: neutral utility.
      return roll(seed, 'gray-fx', 2) === 0
        ? { action: 'draw', value: 1, target: 'none' }
        : { action: 'damage', value: Math.max(1, Math.min(2, Math.ceil(val / 2))), target: 'enemyUnit' };
  }
}

function effectText(e: Effect): string {
  const v = e.value ?? 0;
  switch (e.action) {
    case 'damage':
      if (e.target === 'anyTarget') return `deal ${v} damage to any target`;
      if (e.target === 'allEnemyUnits') return `deal ${v} damage to each enemy unit`;
      if (e.target === 'enemyPlayer') return `deal ${v} damage to the enemy player`;
      return `deal ${v} damage to a target enemy unit`;
    case 'heal':
      if (e.target === 'friendlyPlayer') return `restore ${v} Vitality`;
      return `heal ${v} from a friendly unit or yourself`;
    case 'draw':
      return v === 1 ? 'Deal a card' : `Deal ${v} cards`;
    case 'buff':
      if (e.target === 'allFriendlyUnits') return `your units get +${v}/+${v}`;
      if (e.target === 'self') return `this unit gets +${v}/+${v}`;
      return `a friendly unit gets +${v}/+${v}`;
    case 'shatter':
      if (e.target === 'allEnemyUnits') return 'shatter each enemy unit';
      return 'shatter a target enemy unit';
    case 'banish':
      return 'banish a target enemy unit';
    case 'erode':
      return `erode ${v} (the enemy mills ${v})`;
    case 'recover':
      return 'recover a friendly unit';
    default:
      return '';
  }
}

const TRIGGER_TEXT: Record<TriggeredAbility['when'], string> = {
  enters: 'When this unit enters the field',
  dies: 'When this unit dies',
  dealsClashDamage: 'Whenever this unit deals clash damage',
  atDawn: 'At Dawn',
  atDusk: 'At Dusk',
};

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Unit mapping
// ---------------------------------------------------------------------------
/** Keywords legal on any card regardless of color (colorless picks). */
const NEUTRAL_KEYWORDS: Keyword[] = ['Alert', 'Skywatch', 'Warded', 'Ambush', 'Overrun'];
/** Premium keywords restricted to rt >= 4. */
const PREMIUM = new Set<string>(['Doublestrike', 'Unbreakable']);

function pickUnitKeywords(seed: string, colors: Color[], rt: number): string[] {
  // 0-2 keywords, more at higher rarity.
  const r = roll(seed, 'kwcount', 10);
  let count: number;
  if (rt >= 4) count = r < 2 ? 0 : r < 6 ? 1 : 2;
  else if (rt >= 2) count = r < 3 ? 0 : r < 8 ? 1 : 2;
  else count = r < 5 ? 0 : r < 9 ? 1 : 2;
  if (count === 0) return [];

  const legal = (kw: string) => !PREMIUM.has(kw) || rt >= 4;
  const primaryList = (colors[0] ? KEYWORDS_OF_COLOR[colors[0]] : NEUTRAL_KEYWORDS).filter(legal);
  const out: string[] = [];
  if (primaryList.length) out.push(pick(seed, 9, primaryList) as string);
  if (count >= 2) {
    const secondList = (
      colors[1] ? KEYWORDS_OF_COLOR[colors[1]] : primaryList
    ).filter((kw) => legal(kw) && !out.includes(kw));
    if (secondList.length) out.push(pick(seed, 13, secondList) as string);
  }
  return out;
}

function mapUnit(c: CardTemplate): CardDef {
  const seed = seedOf(c);
  const rt = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  const colors = pickColors(seed, rt);
  const keywords = pickUnitKeywords(seed, colors, rt);
  const base = baseTotal(seed, rt);
  const kwAdj = keywordCostAdj(keywords);
  const total = Math.max(1, Math.min(7, base + kwAdj + adjustFor(c.id)));
  const cost = buildCost(seed, colors, total, rt);
  const t = totalCost(cost);

  // Stats: might+grit ≈ 2*(total MINUS the keyword surcharge) + spread.
  // The keyword surcharge must not feed the stat budget — otherwise keywords
  // are free stats (the exact skew the v5.0 sims found: Quickstrike carriers
  // at 80% win). Ember/Gale lean might, Root/Light lean grit.
  const statBase = Math.max(1, t - Math.max(0, kwAdj));
  const budget = Math.max(2, 2 * statBase + (roll(seed, 'stat-spread', 4) - 1) + statAdjustFor(c.id));
  const primary = colors[0];
  const mightShare =
    primary === 'Ember' || primary === 'Gale'
      ? 0.62
      : primary === 'Root' || primary === 'Light'
        ? 0.38
        : 0.5;
  let might = Math.round(budget * mightShare);
  if (keywords.includes('Immobile')) might = Math.min(might, Math.max(0, Math.floor(budget * 0.3)));
  might = Math.max(0, might);
  const grit = Math.max(1, budget - might);

  const def: CardDef = {
    id: c.id,
    name: c.name,
    type: 'Unit',
    cost,
    might,
    grit,
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
  };
  if (keywords.length) def.keywords = keywords;

  const lines: string[] = [];
  for (const kw of keywords) {
    if (isKeyword(kw)) lines.push(`${kw} — ${KEYWORD_TEXT[kw]}`);
  }

  // ~25% of units carry an on-enter effect or a triggered ability, themed by
  // primary color, scaled to cost.
  if (roll(seed, 'unit-fx', 4) === 0) {
    const v = Math.max(1, Math.min(4, Math.ceil(t / 2)));
    const fx = themedEffect(seed, primary, v);
    const when = pick(seed, 17, ['enters', 'enters', 'dies', 'atDawn', 'atDusk'] as const);
    if (when === 'enters') {
      def.onInvoke = fx;
      lines.push(`When this unit enters the field, ${effectText(fx)}.`);
    } else {
      def.triggers = [{ when, effect: fx }];
      lines.push(`${TRIGGER_TEXT[when]}, ${effectText(fx)}.`);
    }
  }
  def.text = lines.join(' ');
  return def;
}

// ---------------------------------------------------------------------------
// Event mapping
// ---------------------------------------------------------------------------
function eventEffect(seed: string, color: Color | undefined, t: number, slow: boolean): Effect {
  // Slow events get roughly +1 value for the same cost.
  const v = Math.max(1, Math.min(7, Math.ceil(t * 0.9) + (slow ? 1 : 0)));
  switch (color) {
    case 'Void':
      if (t >= 3) return { action: 'banish', target: 'enemyUnit' };
      return { action: 'erode', value: Math.min(4, v), target: 'enemyPlayer' };
    case 'Shadow':
      if (t >= 3) return { action: 'shatter', target: 'enemyUnit' };
      return { action: 'damage', value: Math.min(3, v), target: 'enemyUnit' };
    case 'Ember':
      return { action: 'damage', value: Math.min(6, v), target: 'anyTarget' };
    case 'Tide':
      return { action: 'draw', value: Math.max(1, Math.min(4, Math.ceil(v / 2))), target: 'none' };
    case 'Light':
      return roll(seed, 'light-ev', 2) === 0
        ? { action: 'heal', value: Math.min(6, v + 1), target: 'friendlyAny' }
        : { action: 'buff', value: Math.max(1, Math.ceil(v / 2)), target: 'friendlyUnit' };
    case 'Root':
      return { action: 'buff', value: Math.max(1, Math.min(3, Math.ceil(v / 3))), target: 'allFriendlyUnits' };
    case 'Gale':
      return roll(seed, 'gale-ev', 2) === 0
        ? { action: 'recover', target: 'friendlyUnit' }
        : { action: 'draw', value: Math.max(1, Math.min(3, Math.ceil(v / 2))), target: 'none' };
    default:
      return themedEffect(seed, undefined, v);
  }
}

function mapEvent(c: CardTemplate): CardDef {
  const seed = seedOf(c);
  const rt = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  const colors = pickColors(seed, rt);
  const total = Math.max(1, Math.min(7, baseTotal(seed, rt) + adjustFor(c.id)));
  const cost = buildCost(seed, colors, total, rt);
  const t = totalCost(cost);
  const subtype: EventSubtype = roll(seed, 'ev-sub', 100) < 45 ? 'Quick' : 'Slow';
  const fx = eventEffect(seed, colors[0], t, subtype === 'Slow');
  return {
    id: c.id,
    name: c.name,
    type: 'Event',
    subtype,
    cost,
    onInvoke: fx,
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
    text: `${subtype} — ${cap(effectText(fx))}.`,
  };
}

// ---------------------------------------------------------------------------
// Charm mapping
// ---------------------------------------------------------------------------
function mapCharm(c: CardTemplate): CardDef {
  const seed = seedOf(c);
  const rt = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  const colors = pickColors(seed, rt);
  const total = Math.max(1, Math.min(7, baseTotal(seed, rt) + adjustFor(c.id)));
  const cost = buildCost(seed, colors, total, rt);
  const t = totalCost(cost);
  const subtype: CharmSubtype = roll(seed, 'ch-sub', 100) < 60 ? 'Bound' : 'Worn';

  // Bond stats scale with cost.
  const statBudget = Math.max(1, t + 1 - (subtype === 'Worn' ? 1 : 0));
  const mShare = roll(seed, 'ch-split', 3); // 0 mighty, 1 even, 2 gritty
  const might =
    mShare === 0 ? Math.ceil(statBudget * 0.7) : mShare === 2 ? Math.floor(statBudget * 0.3) : Math.round(statBudget / 2);
  const grit = Math.max(0, statBudget - might);
  const bond: NonNullable<CardDef['bond']> = {};
  if (might > 0) bond.might = might;
  if (grit > 0) bond.grit = grit;

  // Some charms (~40%) grant an on-color keyword to the bonded unit.
  let grantText = '';
  if (roll(seed, 'ch-kw', 5) < 2) {
    const list = (colors[0] ? KEYWORDS_OF_COLOR[colors[0]] : NEUTRAL_KEYWORDS).filter(
      (kw) => (!PREMIUM.has(kw) || rt >= 4) && kw !== 'Immobile',
    );
    if (list.length) {
      const kw = pick(seed, 21, list) as string;
      bond.grants = [kw];
      grantText = ` and ${kw}`;
    }
  }

  const def: CardDef = {
    id: c.id,
    name: c.name,
    type: 'Charm',
    subtype,
    cost,
    bond,
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
  };
  const statText = `+${bond.might ?? 0}/+${bond.grit ?? 0}`;
  if (subtype === 'Worn') {
    def.rebondCost = Math.max(1, Math.ceil(t / 2));
    def.text = `Worn — bonded unit gets ${statText}${grantText}. Re-bond ${def.rebondCost}.`;
  } else {
    def.text = `Bound — bonded unit gets ${statText}${grantText}.`;
  }
  return def;
}

// ---------------------------------------------------------------------------
// Location mapping — every collectible Location is a Sanctum: exhausts for 1
// essence of its type AND carries a static passive or a small trigger.
// ---------------------------------------------------------------------------
function mapLocation(c: CardTemplate): CardDef {
  const seed = seedOf(c);
  const rt = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  // Sanctums are always mono-colored: their produced type IS their identity.
  const produces = pick(seed, 3, COLORS);
  const total = Math.max(
    1,
    Math.min(4, 1 + Math.floor(rt / 2) + roll(seed, 'loc-spread', 2) + adjustFor(c.id)),
  );
  const cost: EssenceCost = { generic: total - 1, pips: { [produces]: 1 } };

  const def: CardDef = {
    id: c.id,
    name: c.name,
    type: 'Location',
    subtype: 'Sanctum',
    cost,
    produces,
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
  };
  const base = `Sanctum — exhaust: add one ${produces} essence.`;
  if (roll(seed, 'loc-kind', 2) === 0) {
    def.locPassive = roll(seed, 'loc-passive', 2) === 0 ? 'MIGHT_ALL' : 'GRIT_ALL';
    def.text = `${base} Your units get +1 ${def.locPassive === 'MIGHT_ALL' ? 'Might' : 'Grit'}.`;
  } else {
    const fx = themedEffect(seed, produces, 1);
    const when = pick(seed, 23, ['atDawn', 'atDusk'] as const);
    def.triggers = [{ when, effect: fx }];
    def.text = `${base} ${TRIGGER_TEXT[when]}, ${effectText(fx)}.`;
  }
  return def;
}

// ---------------------------------------------------------------------------
// Leader mapping — identities from LEADER_COLORS; cost 3-4 total with one pip
// of each identity color, Resolve 3-6 by rarity, and two abilities (a minus
// spender themed to the first color, and a small plus builder).
// ---------------------------------------------------------------------------
function leaderMinusAbility(seed: string, color: Color): LeaderAbility {
  switch (color) {
    case 'Ember':
      return {
        resolveDelta: -1,
        effect: { action: 'damage', value: 2, target: 'anyTarget' },
        text: '-1: Deal 2 damage to any target.',
      };
    case 'Tide':
      return {
        resolveDelta: -1,
        effect: { action: 'draw', value: 1, target: 'none' },
        text: '-1: Deal a card.',
      };
    case 'Root':
      return {
        resolveDelta: -2,
        effect: { action: 'buff', value: 2, target: 'friendlyUnit' },
        text: '-2: A friendly unit gets +2/+2.',
      };
    case 'Gale':
      return {
        resolveDelta: -1,
        effect: { action: 'recover', target: 'friendlyUnit' },
        text: '-1: Recover a friendly unit.',
      };
    case 'Light':
      return {
        resolveDelta: -1,
        effect: { action: 'heal', value: 3, target: 'friendlyAny' },
        text: '-1: Heal 3 from a friendly unit or yourself.',
      };
    case 'Shadow':
      return {
        resolveDelta: -2,
        effect: { action: 'shatter', target: 'enemyUnit' },
        text: '-2: Shatter a target enemy unit.',
      };
    case 'Void':
      return {
        resolveDelta: -2,
        effect: { action: 'banish', target: 'enemyUnit' },
        text: '-2: Banish a target enemy unit.',
      };
  }
}

function leaderPlusAbility(seed: string, color: Color): LeaderAbility {
  switch (color) {
    case 'Tide':
    case 'Gale':
      return {
        resolveDelta: 1,
        effect: { action: 'draw', value: 1, target: 'none' },
        text: '+1: Deal a card.',
      };
    case 'Light':
    case 'Root':
      return {
        resolveDelta: 1,
        effect: { action: 'heal', value: 2, target: 'friendlyPlayer' },
        text: '+1: Restore 2 Vitality.',
      };
    default:
      return {
        resolveDelta: 1,
        effect: { action: 'buff', value: 1, target: 'friendlyUnit' },
        text: '+1: A friendly unit gets +1/+1.',
      };
  }
}

function mapLeader(c: CardTemplate): CardDef {
  const seed = seedOf(c);
  const rt = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  const identity = LEADER_COLORS[c.id] ?? [pick(seed, 3, COLORS), pick(seed, 11, COLORS)];
  const pips: Partial<Record<Color, number>> = {};
  for (const col of identity) pips[col] = (pips[col] ?? 0) + 1;
  const pipSum = Object.values(pips).reduce((a, b) => a + (b ?? 0), 0);
  const total = 3 + roll(seed, 'ldr-cost', 2); // 3-4
  const cost: EssenceCost = { generic: Math.max(0, total - pipSum), pips };
  const resolve = Math.max(3, Math.min(6, 3 + Math.floor(rt / 2)));
  const minus = leaderMinusAbility(seed, identity[0]);
  const plus = leaderPlusAbility(seed, identity[1] ?? identity[0]);
  return {
    id: c.id,
    name: c.name,
    type: 'Leader',
    cost,
    resolve,
    leaderAbilities: [minus, plus],
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
    text: `Leader — Resolve ${resolve}. ${minus.text} ${plus.text}`,
  };
}

// ---------------------------------------------------------------------------
// Build the pool
// ---------------------------------------------------------------------------
function mapCard(c: CardTemplate): CardDef {
  switch (c.type) {
    case 'Leader':
      return mapLeader(c);
    case 'Unit':
      return mapUnit(c);
    case 'Location':
      return mapLocation(c);
    case 'Charm':
      return mapCharm(c);
    case 'Event':
      return mapEvent(c);
    default:
      return mapUnit(c);
  }
}

export const POOL_V4: CardDef[] = [];
export const POOL_BY_ID: Record<string, CardDef> = {};
export const POOL_LEADERS: CardDef[] = [];

/**
 * (Re)build the pool from a universal card catalog. Called once at startup
 * with the live Supabase catalog; falls back to the bundled data below.
 * Refuses a pool with no Leaders (a broken fetch shouldn't brick the game).
 */
let lastTemplates: CardTemplate[] = GENERATED_CARDS;
export function applyCardPool(templates: CardTemplate[]): boolean {
  const defs = templates.map(mapCard);
  if (!defs.some((d) => d.type === 'Leader')) return false;
  lastTemplates = templates;
  POOL_V4.length = 0;
  POOL_V4.push(...defs);
  for (const k of Object.keys(POOL_BY_ID)) delete POOL_BY_ID[k];
  for (const d of defs) POOL_BY_ID[d.id] = d;
  POOL_LEADERS.length = 0;
  POOL_LEADERS.push(...defs.filter((d) => d.type === 'Leader'));
  return true;
}

/** Re-derive the pool from the last-loaded template set. */
export function rebuildPool(): boolean {
  return applyCardPool(lastTemplates);
}

// Bundled fallback pool, active until/unless the live catalog loads.
applyCardPool(GENERATED_CARDS);

export function poolByType(t: string): CardDef[] {
  return POOL_V4.filter((c) => c.type === t);
}
export function poolHasKeyword(kw: string): CardDef[] {
  return POOL_V4.filter((c) => c.keywords?.includes(kw));
}
