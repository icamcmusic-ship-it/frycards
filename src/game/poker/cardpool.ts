/**
 * FryCards Poker card pool, built from the universal card catalog (the live
 * Supabase `cards` table, or the bundled fallback in generated-cards.ts).
 *
 * Every card keeps its identity — name, art, rarity, set, flavor text and
 * colour. Its poker mechanics (tier, effect keyword, modifiers, Item/Event
 * subtype, Leader nerve abilities, Location rule) are generated
 * deterministically from a hash of `id|type|rarity`, so the pool is identical
 * on every client and a rebalance ships as a code change. A per-card override
 * (`template.overrides`, written by the Creator tools) is layered on top;
 * deleting an override restores the generated card exactly.
 *
 * MUST NOT import engine.ts.
 */
import type { CardOverrides, CardTemplate } from '../../types';
import { GENERATED_CARDS } from '../generated-cards';
import type { CardDef, CardSubtype, KwRef, LeaderAbility, PowerType } from './cards';
import { isPower } from './cards';
import { COLORS, LEADER_COLORS, type Color } from './colors';
import { FROZEN_COLORS } from './frozenColors';
import {
  CHIP_KEYWORDS,
  KEYWORD_SPECS,
  effectsForColors,
  isHomeKeyword,
  fmtUnits,
  keywordLabel,
  modifiersForColors,
  tierN,
  type EffectKeyword,
  type Keyword,
  type ModifierKeyword,
} from './keywords';
import { KEYWORD_WEIGHT } from './constants';
import { locationRuleFor, ruleName, ruleText } from './locations';
import { hash, roll } from './rng';

const RARITY_TIER: Record<string, number> = {
  Common: 0,
  Uncommon: 1,
  Rare: 2,
  'Super-Rare': 3,
  'Ultra-Rare': 4,
  'Full-Art': 5,
  'Alt-Art': 5,
  Mythic: 6,
};

/** Items hash as `Charm` (their type's name until v13), so the rename never
 * reprinted them. Kept for the poker derivation too: the seed is identity. */
const SEED_TYPE: Record<string, string> = { Item: 'Charm' };

export const seedOf = (c: Pick<CardTemplate, 'id' | 'type' | 'rarity'>): string =>
  `${c.id}|${SEED_TYPE[c.type] ?? c.type}|${c.rarity ?? 'Common'}`;

const pick = <T>(seed: string, salt: string, arr: readonly T[]): T =>
  arr[roll(seed, salt, arr.length)];

/** Home-colour keywords are this many times likelier than off-colour ones. */
const HOME_WEIGHT = 4;

/** Weighted pick by KEYWORD_WEIGHT (constants.ts), favouring home colours. */
function pickKw<T extends Keyword>(
  seed: string,
  salt: string,
  arr: readonly T[],
  colors: Color[] = [],
): T {
  const w = arr.map(
    (k) =>
      (KEYWORD_WEIGHT[k] ?? 1) *
      (colors.length && isHomeKeyword(k, colors) && KEYWORD_SPECS[k].color ? HOME_WEIGHT : 1),
  );
  const total = w.reduce((a, b) => a + b, 0);
  let r = ((hash(`${seed}:${salt}`) % 100000) / 100000) * total;
  for (let i = 0; i < arr.length; i++) {
    r -= w[i];
    if (r < 0) return arr[i];
  }
  return arr[arr.length - 1];
}

// ---------------------------------------------------------------------------
// Colour: frozen from the MTG-style game; new cards fall back to a hash.
// ---------------------------------------------------------------------------
const LEGAL_PAIRS: [Color, Color][] = [];
for (const p of Object.values(LEADER_COLORS)) {
  if (!LEGAL_PAIRS.some((q) => q.includes(p[0]) && q.includes(p[1])))
    LEGAL_PAIRS.push([p[0], p[1]]);
}

export function fallbackColors(c: Pick<CardTemplate, 'id' | 'type' | 'rarity'>): Color[] {
  const seed = seedOf(c);
  if (c.type === 'Leader') {
    const a = roll(seed, 'leader-c1', 7);
    return [COLORS[a], COLORS[(a + 1 + roll(seed, 'leader-c2', 6)) % 7]];
  }
  const rt = RARITY_TIER[c.rarity ?? 'Common'] ?? 0;
  const r = roll(seed, 'colors', 100);
  if (r < 8) return [];
  if (r < 8 + 15 + rt * 3) return [...pick(seed, 'pair', LEGAL_PAIRS)];
  return [pick(seed, 'single', COLORS)];
}

function colorsOf(c: CardTemplate): Color[] {
  if (c.type === 'Leader' && LEADER_COLORS[c.id]) return [...LEADER_COLORS[c.id]];
  return [...(FROZEN_COLORS[c.id] ?? fallbackColors(c))];
}

// ---------------------------------------------------------------------------
// Tier: the 35/28/20/12/5 pyramid, gently biased by rarity. Tiers are not
// rarity — a Mythic is more often 3+ than a Common, but not always.
// ---------------------------------------------------------------------------
const TIER_PYRAMID = [35, 28, 20, 12, 5];
const RARITY_BIAS = 0.1;

export function rollTier(seed: string, rarity?: string): number {
  const rt = RARITY_TIER[rarity ?? 'Common'] ?? 0;
  const w = TIER_PYRAMID.map((base, i) => Math.max(1, base * (1 + RARITY_BIAS * rt * (i - 1))));
  const total = w.reduce((a, b) => a + b, 0);
  let r = ((hash(`${seed}:tier`) % 10000) / 10000) * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r < 0) return i + 1;
  }
  return 5;
}

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
/** Lowest tier an effect may print at. Personal fixes are cheap; anything
 * that changes the community cards is expensive (spec, "Revive powers"). */
const MIN_TIER: Partial<Record<EffectKeyword, number>> = {
  Redraw: 2,
  Windfall: 3,
  Wild: 3,
  Exhume: 2,
  Cut: 3,
  Burn: 3,
  Pass: 2,
  Rerun: 2,
  Mimic: 2,
  Snuff: 3,
  Lock: 2,
  Entropic: 3,
  Bounty: 2,
};

const NOT_ON: Partial<Record<PowerType, EffectKeyword[]>> = {
  Unit: ['Snuff'],
  Item: ['Snuff', 'Straddle'],
};

function effectPool(type: PowerType, colors: Color[], tier: number): EffectKeyword[] {
  const banned = NOT_ON[type] ?? [];
  const pool = effectsForColors(colors).filter(
    (k) => !banned.includes(k) && (MIN_TIER[k] ?? 1) <= tier,
  );
  return pool.length > 0 ? pool : ['Redraw'];
}

function numberFor(kw: Keyword, tier: number): number | undefined {
  return KEYWORD_SPECS[kw].numbered ? tierN(kw, tier) : undefined;
}

function modAllowed(
  m: ModifierKeyword,
  eff: EffectKeyword,
  type: PowerType,
  tier: number,
  subtype?: CardSubtype,
): boolean {
  const s = KEYWORD_SPECS[eff];
  switch (m) {
    case 'Roulette':
    case 'Veil':
      return s.target === 'opponent';
    case 'Resonant':
      return s.stackable && tier >= 2;
    case 'Thriving':
      return type === 'Unit' && s.stackable;
    case 'Fuse':
      return s.fusable;
    case 'Ambush':
      return type !== 'Event';
    case 'Soulbound':
      return subtype !== 'Weapon';
    case 'Feint':
      return false; // tagged separately (about 1 card in 12)
    default:
      return true;
  }
}

function mapPower(c: CardTemplate, o: CardOverrides = {}): CardDef {
  const seed = seedOf(c);
  const type = c.type as PowerType;
  const colors = colorsOf(c);
  const rt = RARITY_TIER[c.rarity ?? 'Common'] ?? 0;
  const tier = Math.max(1, Math.min(5, Math.round(o.tier ?? rollTier(seed, c.rarity))));

  let subtype: CardSubtype | undefined;
  if (type === 'Item') {
    const r = roll(seed, 'item-sub', 4);
    subtype = r < 2 ? 'Charm' : r === 2 ? 'Weapon' : 'Tool';
  } else if (type === 'Event') {
    subtype = roll(seed, 'event-sub', 5) < 2 ? 'Quick' : 'Slow';
  }

  const effKw =
    (o.effect?.kw as EffectKeyword | undefined) ??
    pickKw(seed, 'effect', effectPool(type, colors, tier), colors);
  if (effKw === 'Snuff' && type === 'Event') subtype = 'Quick';
  if (o.subtype) subtype = o.subtype;
  const effect: KwRef = { kw: effKw, n: o.effect?.n ?? numberFor(effKw, tier) };

  let mods: KwRef[];
  if (o.mods) {
    mods = o.mods.map((m) => ({ kw: m.kw, n: m.n ?? numberFor(m.kw, tier) }));
  } else {
    mods = [];
    // Commons get simple, reliable effects; Mythics get odd, high-variance ones.
    const r = roll(seed, 'mod-count', 100);
    const count = r < 55 - rt * 4 ? 0 : r < 92 - rt * 2 ? 1 : 2;
    const pool = modifiersForColors(colors).filter((m) =>
      modAllowed(m, effKw, type, tier, subtype),
    );
    const chaos: ModifierKeyword[] = ['Roulette', 'Gambit', 'Resonant', 'Bait'];
    for (let i = 0; i < count && pool.length > 0; i++) {
      const highVariance = rt >= 5 && roll(seed, `mod-chaos-${i}`, 2) === 0;
      const src = highVariance ? pool.filter((m) => chaos.includes(m)) : pool;
      const m = pickKw(seed, `mod-${i}`, src.length > 0 ? src : pool, colors);
      if (!mods.some((x) => x.kw === m)) mods.push({ kw: m, n: numberFor(m, tier) });
    }
    // Feint lives only on tagged cards, about 1 in 12, so most casts still
    // carry information.
    if (roll(seed, 'feint', 12) === 0) mods.push({ kw: 'Feint' });
  }

  const def: CardDef = {
    id: c.id,
    name: c.name,
    type,
    subtype,
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
    colors,
    tier,
    effect,
    mods,
  };
  def.keywords = [effect.kw, ...mods.map((m) => m.kw)];
  def.text = o.text ?? powerText(def);
  return def;
}

/** Card text: the keyword plus its parameter, and the type's own line. */
export function powerText(def: CardDef): string {
  const bits: string[] = [];
  if (def.effect) bits.push(`${keywordLabel(def.effect.kw, def.effect.n)}.`);
  for (const m of def.mods ?? []) bits.push(`${keywordLabel(m.kw, m.n)}.`);
  if (def.type === 'Unit') bits.push('Stays out as a token until showdown.');
  if (def.type === 'Item') {
    bits.push('Bonds to your Unit (no Unit: a hole card, one step more).');
    if (def.subtype === 'Weapon') bits.push('Returns to your hand after use.');
    if (def.subtype === 'Tool') bits.push('Also marks one opponent hole card.');
  }
  return bits.join(' ');
}

// ---------------------------------------------------------------------------
// Leaders: a persona plus two nerve abilities. The minus ability spends nerve
// and is strong; the plus ability builds nerve, is weaker and costs chips.
// ---------------------------------------------------------------------------
function leaderEffects(color: Color, tier: number): EffectKeyword[] {
  return effectsForColors([color]).filter(
    (k) =>
      KEYWORD_SPECS[k].target !== 'cast' &&
      KEYWORD_SPECS[k].color === color &&
      (MIN_TIER[k] ?? 1) <= tier,
  );
}

function ability(
  seed: string,
  salt: string,
  color: Color,
  tier: number,
  nerve: number,
  chipCost?: number,
): LeaderAbility {
  const pool = leaderEffects(color, tier);
  const kw = pool.length > 0 ? pickKw(seed, salt, pool) : 'Redraw';
  const effect: KwRef = { kw, n: numberFor(kw, tier) };
  const sign = nerve > 0 ? `+${nerve}` : `${nerve}`;
  const cost = chipCost ? `, pay ${fmtUnits(chipCost)}` : '';
  return {
    nerve,
    effect,
    chipCost,
    text: `${sign} nerve${cost}: ${keywordLabel(kw, effect.n)}.`,
  };
}

function mapLeader(c: CardTemplate, o: CardOverrides = {}): CardDef {
  const seed = seedOf(c);
  const colors = colorsOf(c);
  const spendNerve = -(2 + roll(seed, 'spend', 2)); // -2 or -3
  const minus = ability(seed, 'leader-minus', colors[0], 4, spendNerve);
  const plus = ability(
    seed,
    'leader-plus',
    colors[1] ?? colors[0],
    2,
    1,
    roll(seed, 'risk', 2) ? 0.5 : 1,
  );
  const abilities = [minus, plus];
  return {
    id: c.id,
    name: c.name,
    type: 'Leader',
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
    colors,
    abilities,
    keywords: abilities.map((a) => a.effect.kw),
    text: o.text ?? abilities.map((a) => a.text).join(' '),
  };
}

function mapLocation(c: CardTemplate, o: CardOverrides = {}): CardDef {
  const rule = locationRuleFor(seedOf(c));
  return {
    id: c.id,
    name: c.name,
    type: 'Location',
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
    colors: colorsOf(c),
    rule,
    keywords: [],
    text: o.text ?? `${ruleName(rule)}: ${ruleText(rule)}`,
  };
}

function mapCard(c: CardTemplate): CardDef {
  const o = c.overrides ?? {};
  switch (c.type) {
    case 'Leader':
      return mapLeader(c, o);
    case 'Location':
      return mapLocation(c, o);
    default:
      return mapPower(c, o);
  }
}

/** Derive one card's poker mechanics from its identity, without touching the
 * live pool (the Creator tools and the cards-table sync use this). */
export function deriveCardMechanics(t: CardTemplate): CardDef {
  return mapCard(t);
}

export const POOL: CardDef[] = [];
export const POOL_BY_ID: Record<string, CardDef> = {};
export const POOL_LEADERS: CardDef[] = [];

let lastTemplates: CardTemplate[] = GENERATED_CARDS;
let byTypeIndex: Map<string, CardDef[]> | null = null;

/** (Re)build the pool from a catalog. Refuses a catalog with no Leaders (a
 * broken fetch shouldn't brick the game). */
export function applyCardPool(templates: CardTemplate[]): boolean {
  const defs = templates.map(mapCard);
  if (!defs.some((d) => d.type === 'Leader')) return false;
  lastTemplates = templates;
  POOL.length = 0;
  POOL.push(...defs);
  for (const k of Object.keys(POOL_BY_ID)) delete POOL_BY_ID[k];
  for (const d of defs) POOL_BY_ID[d.id] = d;
  POOL_LEADERS.length = 0;
  POOL_LEADERS.push(...defs.filter((d) => d.type === 'Leader'));
  byTypeIndex = null;
  return true;
}

export function rebuildPool(): boolean {
  return applyCardPool(lastTemplates);
}

applyCardPool(GENERATED_CARDS);

/** Cards of one type (read-only; rebuilt lazily after each applyCardPool). */
export function poolByType(t: string): CardDef[] {
  if (!byTypeIndex) {
    byTypeIndex = new Map();
    for (const c of POOL) {
      const list = byTypeIndex.get(c.type);
      if (list) list.push(c);
      else byTypeIndex.set(c.type, [c]);
    }
  }
  return byTypeIndex.get(t) ?? [];
}

export function poolPowers(): CardDef[] {
  return POOL.filter(isPower);
}

export function poolHasKeyword(kw: string): CardDef[] {
  return POOL.filter((c) => c.keywords?.includes(kw));
}

/** Text for a numbered keyword on a card, for tooltips. */
export function kwRefText(ref: KwRef): string {
  const spec = KEYWORD_SPECS[ref.kw];
  const n =
    ref.n === undefined
      ? 'N'
      : CHIP_KEYWORDS.has(ref.kw)
        ? `${fmtUnits(ref.n)} chip unit(s)`
        : `${ref.n}`;
  return spec.text(n);
}
