/**
 * Fry Cards v5.0 card pool, built from the universal card catalog (live
 * Supabase `cards` table, or the bundled fallback in `generated-cards.ts`).
 *
 * Each card's CORE IDENTITY is untouched — name, image URL, flavor text,
 * rarity, set. Every card is assigned its v5 mechanics (Essence Cost,
 * Might/Grit, subtype, keywords, effects, Leader Resolve + abilities)
 * deterministically from a hash of its id plus its type and rarity, so the
 * whole set is playable under the rulebook and the assignment is identical
 * on every client.
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
 * v5.1 pass: first five entries. v5.3 pass (BALANCE_SIM_FINDINGS_v6.1.md):
 * repeat overperformers +1, repeat underperformers -1. */
const COST_ADJUST: Record<string, number> = {
  heart_coral: +1, // v5.1: +21.7pt residual Sanctum
  needle_seamstress: +1, // v5.1: 78% played win at cost 3
  merfolk_ritual: +1, // v5.1: 74% played win Worn charm
  pufferfish_lantern: +1, // v5.1: 77% played win at cost 2
  clawblade_greatsword: +1, // v5.1: +15.4pt residual Worn charm
  slate_scaled_serpent: +2, // v5.3: +8.9/+12.5, then v6.1 +6.8/+7.8 STILL
  // positive after the first +1 (4th consecutive positive pass) — v6.2:
  // +9.9 residual at n=1952 on an 18k-game run. Second +1 stacked.
  worm_brain_host: +1, // v5.3: +8.7/+7.2 both seeds
  smokeveil_striketeam: +1, // v5.3: +6.5/+11.2 both seeds (and v5.2)
  crowned_manatee: +1, // v5.3: +8.0/+6.3 both seeds (and v5.2)
  constellation_crabs: +1, // v5.3: +7.6 seed 777 + both v5.2 seeds
  nebula_clutch: +1, // v5.3: +9.7 seed 1337 + both v5.2 seeds
  shatterline: +1, // v5.3: +6.8/+7.8 both seeds
  submerged_starfall: -1, // v5.3: -9.5 + v5.2 seed-1337 -8.7
  nanite_purge_protocol: -1, // v5.3: negative both seeds + v5.2 seed 777
  coral_collapse: -2, // v5.3/v5.2: -4.2. v6.2: STILL -4.0 residual at n=1892
  // after the first -1 — repeat underperformer, second -1 stacked.
  tectonic_rift: -2, // v5.3/v5.2: -4.4. v6.2: STILL -3.3 residual at n=2195
  // after the first -1 (also carries Surge, whose own weight dropped this
  // pass) — repeat underperformer, second -1 stacked.
  consuming_ash_cloud: -1, // v5.3: 13.8% absolute played win, -5.2 residual
  research_fleet: -1, // v5.3: 65%/74% dead-in-hand two passes running
  // v6.2 pass (18,048-game run, docs/BALANCE_SIM_FINDINGS_v6.2.md):
  ribvault_cathedral: +1, // +15.8 residual, n=161
  fissure_gas_bunker: +1, // +15.2 residual, n=517 (Sacred Sanctum)
  gearbone_sentinel: +1, // +15.0 residual, n=136
  jawbone_span: +1, // +13.9 residual, n=206 (Bountiful Sanctum)
  volcanic_nanite_core: +1, // +12.8 residual, n=219
  glowing_manta: -1, // -4.4 residual, n=509
  marble_reef_shark: -1, // -3.9 residual, n=120
  sunken_archive: -1, // -3.8 residual, n=890
  // v6.2 second verification pass (after the above landed): re-ran the full
  // 18k-game suite and caught these newly-surfaced |z|>=2 outliers too.
  heart_of_the_thermal_grid: -1, // -7.4 residual, z=-2.71, n=409
  ruthless_succession: -1, // -6.0 residual, z=-2.35, n=379
  kinetic_siphon_swarm: +1, // +11.3 residual, z=2.01, n=329
  // v6.3 pass (18,048-game run, harness v6.3): repeat offenders from v6.2
  // still outside |z|>=1.5 the same direction — second point stacked.
  sand_portal: +2, // v6.2 +1 (was +21.4). v6.3: still +14.0, z=2.86, n=347.
  glass_kelp_forest: +2, // v6.2 +1 (was +21.1). v6.3: still +12.3, z=2.41, n=478.
  resonant_shuriken: +2, // v6.2 +1 (was +13.9). v6.3: still +15.5, z=3.27, n=794.
  chalice_of_quicksilver: +2, // v6.2 +1 (was +15.2, z=3.0, n=198). v6.3:
  // still +12.0 residual at z=2.33, n=223 — repeat overperformer, second
  // +1 stacked.
  porcelain_lobster: -2, // v6.2 -1 (was -5.8). v6.3: still -3.7, z=-1.87, n=943.
  ashen_circle_rite: -2, // v6.2 -1 (was -3.7). v6.3: still -3.1, z=-1.71, n=3583.
  sonic_shatter: -2, // v6.2 -1 (was -7.2). v6.3: still -2.4, z=-1.53, n=2416.
  celestial_attunement: -2, // v6.2 -1 (was -4.2). v6.3: still -2.4, z=-1.53, n=682.
  // v6.3 new first-time flags (|z|>=1.5, 18,048-game run):
  glass_shrimp: +1, // +11.5 residual, n=827
  abyssal_pathway: +1, // +10.6 residual, n=490
  amber_sphere: +1, // +10.5 residual, n=189
  neon_moray: +1, // +10.3 residual, n=911
  haunted_submarine: +1, // +10.2 residual, n=777
  shinobi_operations_base: +1, // +10.0 residual, n=367
  kraken_s_monolith: +1, // +10.0 residual, n=321
  scallop_map: +1, // +9.5 residual, n=862
  urnbearer_of_blight: +1, // +9.5 residual, n=410
  ashhound_pack: +1, // +9.2 residual, n=165
  towering_tsunami: -1, // -5.3 residual, n=974
  blood_moon_descent: -1, // -4.5 residual, n=1072
  cavernous_watcher: -1, // -4.5 residual, n=349
  obsidian_scalpel: -1, // -3.0 residual, n=884
  secret_lair: -1, // -3.0 residual, n=705
  silver_chimera: -1, // -2.9 residual, n=1332
  helix_swarm: -1, // -2.7 residual, n=481
  bubble_harvest: -1, // -2.6 residual, n=1251
  // v6.3 Resonant per-card fix (carry-forward from v6.2's Resonant keyword
  // cut): the new v6.3 by-cost-band keyword report splits Resonant's three
  // carriers cleanly — dissolving_persona (cost 4, the 3-4 band) actually
  // reads +56.6% win rate, while the two cost-5 carriers (bioluminescent_tide,
  // flash_freeze, the 5+ band) read 12.3% — the opposite of the v6.2 doc's
  // guess that dissolving_persona's single-target Banish was the drag. Fix
  // at the card level per the carry-forward rather than cutting the shared
  // Resonant weight again (which would only further overpay
  // dissolving_persona while doing nothing for the two actually-underpriced
  // cost-5 cards).
  bioluminescent_tide: -1,
  flash_freeze: -1,
};
const adjustFor = (id: string): number => COST_ADJUST[id] ?? 0;

/** v5.3: per-card STAT-budget adjustments, for overperformers already at the
 * cost cap of 7 where a COST_ADJUST would be clipped to nothing. */
const STAT_ADJUST: Record<string, number> = {
  nanite_division_marshal: -2, // +8.5/+13.7 residual both seeds at cost 7
  familiar_in_the_dark: -3, // v6.2: +13.2 residual at cost 7 (COST_ADJUST
  // clips to nothing at the ceiling) — trim the stat budget instead. v6.3:
  // STILL +10.3 residual (z=1.87, n=544) after the first -2 — repeat
  // overperformer, third point stacked.
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
  // v6.0 Event keywords: ~12% Surge (conditional discount), ~8% Resonant
  // (double resolution, rare+ only). Surcharges come from KEYWORD_COST via
  // keywordCostAdj — the effect is scaled from the PRE-surcharge total so it
  // doesn't double a full-cost effect for free.
  const kwRoll = roll(seed, 'ev-kw', 100);
  const keywords: string[] =
    kwRoll < 14 ? ['Surge'] : kwRoll < 26 && rt >= 1 ? ['Resonant'] : [];
  const kwAdj = keywordCostAdj(keywords);
  const total = Math.max(1, Math.min(7, baseTotal(seed, rt) + adjustFor(c.id) + kwAdj));
  const cost = buildCost(seed, colors, total, rt);
  const t = Math.max(1, totalCost(cost) - kwAdj);
  const subtype: EventSubtype = roll(seed, 'ev-sub', 100) < 45 ? 'Quick' : 'Slow';
  const fx = eventEffect(seed, colors[0], t, subtype === 'Slow');
  const def: CardDef = {
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
  if (keywords.length) def.keywords = keywords;
  return def;
}

// ---------------------------------------------------------------------------
// Charm mapping
// ---------------------------------------------------------------------------
function mapCharm(c: CardTemplate): CardDef {
  const seed = seedOf(c);
  const rt = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  const colors = pickColors(seed, rt);
  const subtype: CharmSubtype = roll(seed, 'ch-sub', 100) < 60 ? 'Bound' : 'Worn';
  // v6.0 Charm keywords: ~12% Runic (bond cantrip); ~12% of BOUND charms
  // Soulbound (returns to hand when its unit dies). Surcharges come from
  // KEYWORD_COST via keywordCostAdj.
  const kwRoll = roll(seed, 'ch-kw2', 100);
  const charmKws: string[] =
    kwRoll < 12 ? ['Runic'] : kwRoll < 24 && subtype === 'Bound' ? ['Soulbound'] : [];
  const kwAdj = keywordCostAdj(charmKws);
  const total = Math.max(1, Math.min(7, baseTotal(seed, rt) + adjustFor(c.id) + kwAdj));
  const cost = buildCost(seed, colors, total, rt);
  // Bond stats scale from the pre-surcharge total (keywords are never free stats).
  const t = Math.max(1, totalCost(cost) - kwAdj);

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
  if (charmKws.length) def.keywords = charmKws;
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
  // v6.0 Location keywords: ~12% Bountiful (taps for 2 essence — replaces
  // any other ability), ~14% Sacred (Dawn lifegain). Surcharges come from
  // KEYWORD_COST via keywordCostAdj.
  const kwRoll = roll(seed, 'loc-kw2', 100);
  const locKws: string[] = kwRoll < 12 ? ['Bountiful'] : kwRoll < 26 ? ['Sacred'] : [];
  const kwAdj = keywordCostAdj(locKws);
  // Base total keeps the pre-v6 1..4 clamp so keyword-free Sanctums price
  // identically; the keyword surcharge stacks on top (ceiling 6).
  const total = Math.min(
    6,
    Math.max(1, Math.min(4, 1 + Math.floor(rt / 2) + roll(seed, 'loc-spread', 2) + adjustFor(c.id))) +
      kwAdj,
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
  if (locKws.length) def.keywords = locKws;
  const base = locKws.includes('Bountiful')
    ? `Sanctum — exhaust: add TWO ${produces} essence.`
    : `Sanctum — exhaust: add one ${produces} essence.`;
  if (locKws.includes('Bountiful')) {
    // Bountiful is the whole card: double essence, no second ability.
    def.text = base;
  } else if (roll(seed, 'loc-kind', 2) === 0) {
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
// Leader mapping — identities from LEADER_COLORS; cost 3-4 total (+1 for
// Commander/Resolute, so 3-5) with one pip of each identity color, Resolve 3-6 by
// rarity, and two abilities (a minus spender themed to the first color, and
// a small plus builder).
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

/** v6.2: Leader kit overrides for repeat-offender outliers. mapLeader's
 * output is otherwise fully procedural (hash-derived), with no per-Leader
 * manual lever — this is the Leader-kit equivalent of COST_ADJUST/
 * STAT_ADJUST for regular cards. Avatar of the Abyss stacked max Resolve
 * (Mythic rarity, 6), an unconditional -2 Shatter (better than most other
 * colors' minus abilities), AND the Commander keyword's global +1 Might aura
 * — flagged as an outlier in the v6.1 findings doc (67.0% win rate, "watch")
 * and CONFIRMED as a Leader-kit-level problem (not cohort luck) by the v6.2
 * deckSeed-pinned leaderPairSuite: it beat every other pinned Leader deck
 * (58.3%-100%) and led the random-cohort matchup table at 70.3%. Per the
 * v4.24 precedent (strip a keyword from a repeat-offender once stat/cost
 * trims have nowhere left to go — a Leader has no stat/cost budget to trim),
 * its Commander keyword is stripped here.
 */
const LEADER_KEYWORD_STRIP: Record<string, string[]> = {
  avatar_of_the_abyss: ['Commander'], // v6.2: 67.0% -> 70.3% win rate, repeat offender
};

/** v6.3: Leader-kit minus-ability resolve-cost override — the next lever
 * flagged in the v6.2 carry-forward once a Leader has no keyword left to
 * strip. Avatar of the Abyss's Commander strip (above) brought its
 * random-cohort win rate back to 67.8% (its pre-v6.1-flag level, unchanged),
 * but the v6.3 deckSeed-pinned leaderPairSuite still has it clearly on top
 * (77.4% average across all six pinned opposing Leaders) — its -2 Shatter is
 * simply cheaper than every other color's minus ability of equal power
 * (Void's -2 Banish is the only other removal at that price, and Ember/Tide/
 * Gale/Light minus abilities all cost only -1 for a smaller effect). Bump its
 * Resolve cost -2 -> -3, matching the "trim ability cost efficiency" lever
 * named in the v6.2 doc rather than a further keyword strip. */
const LEADER_MINUS_RESOLVE_OVERRIDE: Record<string, number> = {
  avatar_of_the_abyss: -3,
};

function mapLeader(c: CardTemplate): CardDef {
  const seed = seedOf(c);
  const rt = RARITY_TIER[c.rarity || 'Common'] ?? 0;
  const identity = LEADER_COLORS[c.id] ?? [pick(seed, 3, COLORS), pick(seed, 11, COLORS)];
  const pips: Partial<Record<Color, number>> = {};
  for (const col of identity) pips[col] = (pips[col] ?? 0) + 1;
  const pipSum = Object.values(pips).reduce((a, b) => a + (b ?? 0), 0);
  // v6.0 Leader keywords: each Leader rolls Commander (+1 Might aura while
  // fielded), Resolute (Resolve regen at Dawn), or neither. Surcharges come
  // from KEYWORD_COST via keywordCostAdj.
  const kwRoll = roll(seed, 'ldr-kw6', 6);
  const stripped = new Set(LEADER_KEYWORD_STRIP[c.id] ?? []);
  const leaderKws: string[] = (
    kwRoll < 2 ? ['Commander'] : kwRoll < 4 ? ['Resolute'] : []
  ).filter((kw) => !stripped.has(kw));
  const total = 3 + roll(seed, 'ldr-cost', 2) + keywordCostAdj(leaderKws); // 3-5
  const cost: EssenceCost = { generic: Math.max(0, total - pipSum), pips };
  const resolve = Math.max(3, Math.min(6, 3 + Math.floor(rt / 2)));
  const minus = leaderMinusAbility(seed, identity[0]);
  const minusOverride = LEADER_MINUS_RESOLVE_OVERRIDE[c.id];
  if (minusOverride !== undefined) {
    minus.text = minus.text.replace(`${minus.resolveDelta}:`, `${minusOverride}:`);
    minus.resolveDelta = minusOverride;
  }
  const plus = leaderPlusAbility(seed, identity[1] ?? identity[0]);
  const def: CardDef = {
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
  if (leaderKws.length) def.keywords = leaderKws;
  return def;
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
