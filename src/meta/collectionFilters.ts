/**
 * The Collection's filter state as one plain object, so it can be remembered
 * between visits and saved as named presets. Pure; the screen owns the UI.
 */
import { RARITIES } from '../types';
import { COLORS, cardColors, type Color } from '../game/poker/colors';
import { KEYWORDS } from '../game/poker/keywords';
import { LOCATION_TEMPLATES } from '../game/poker/locations';
import type { CardDef, LocationRuleId } from '../game/poker/cards';
import { quicksellPrice } from './economy';

export const TYPES = ['All', 'Leader', 'Unit', 'Item', 'Event', 'Location'];
export const RARITY_FILTERS = ['All', ...RARITIES];
export const COLOR_FILTERS = ['All', ...COLORS, 'Colorless'];
/** Stars / gears / bolts. Only powers (Unit, Item, Event) carry a tier. */
export const TIER_FILTERS = ['All', '1', '2', '3', '4', '5'];
/** Poker keywords. Retired MTG keywords (Aerial, Overrun…) are not here, so a
 * remembered filter on one falls back to 'All' instead of emptying the grid. */
export const KEYWORD_FILTERS: string[] = ['All', ...KEYWORDS];
/** Location table rules (template ids); only Locations carry one. */
export const RULE_FILTERS: string[] = [
  'All',
  ...(Object.keys(LOCATION_TEMPLATES) as LocationRuleId[]),
];
export const SORTS = ['Name', 'Rarity', 'Type', 'Tier'] as const;
export type SortKey = (typeof SORTS)[number];

/** What the grid lists: your cards, the whole set, only spares, or the wishlist. */
export const VIEWS = ['owned', 'all', 'spares', 'wishlist'] as const;
export type CollectionView = (typeof VIEWS)[number];

export interface CollectionFilters {
  view: CollectionView;
  type: string;
  rarity: string;
  color: string;
  /** A poker keyword (effect or modifier); 'All' = any. */
  keyword: string;
  /** Tier 1–5 as a string; 'All' = any. */
  tier: string;
  /** Location rule id (e.g. 'highStakes'); 'All' = any. */
  rule: string;
  set: string;
  sort: SortKey;
}

export const DEFAULT_FILTERS: CollectionFilters = {
  view: 'owned',
  type: 'All',
  rarity: 'All',
  color: 'All',
  keyword: 'All',
  tier: 'All',
  rule: 'All',
  set: 'All',
  sort: 'Name',
};

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const str = (v: unknown, fallback: string): string =>
  typeof v === 'string' && v.length > 0 && v.length <= 60 ? v : fallback;

/** Sorts that existed in the MTG-style game, mapped to their poker stand-in. */
const LEGACY_SORT: Record<string, SortKey> = { Cost: 'Tier' };

/**
 * Coerce stored JSON into a valid filter object; unknown values (a rarity
 * renamed since the save, a hand-edited key) fall back to their defaults.
 *
 * Presets saved under the MTG-style game load safely: retired keys (cost,
 * might, grit, essence…) are dropped because only known keys are read, a
 * retired keyword falls back to 'All', and the old 'Cost' sort becomes 'Tier'.
 */
export function sanitizeFilters(v: unknown): CollectionFilters {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_FILTERS;
  const sort = typeof o.sort === 'string' && LEGACY_SORT[o.sort] ? LEGACY_SORT[o.sort] : o.sort;
  return {
    view: pick(o.view, VIEWS, d.view),
    type: pick(o.type, TYPES, d.type),
    rarity: pick(o.rarity, RARITY_FILTERS, d.rarity),
    color: pick(o.color, COLOR_FILTERS, d.color),
    keyword: pick(o.keyword, KEYWORD_FILTERS, d.keyword),
    tier: pick(typeof o.tier === 'number' ? String(o.tier) : o.tier, TIER_FILTERS, d.tier),
    rule: pick(o.rule, RULE_FILTERS, d.rule),
    set: str(o.set, d.set),
    sort: pick(sort, SORTS, d.sort),
  };
}

export const isFilters = (v: unknown): v is CollectionFilters =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** The narrowing filters (the view and the sort are choices, not filters). */
const NARROWING = ['type', 'rarity', 'color', 'keyword', 'tier', 'rule', 'set'] as const;

/** How many of the narrowing filters differ from the default (the view and
 * the sort are choices, not filters, and are not counted). */
export function activeFilterCount(f: CollectionFilters): number {
  return NARROWING.filter((k) => f[k] !== DEFAULT_FILTERS[k]).length;
}

/** Does a card pass the card-attribute filters (type, rarity, colour,
 * keyword, tier, Location rule, set)? The view, search and ownership checks
 * live in the screen. A tier filter only ever matches powers; a rule filter
 * only ever matches Locations. */
export function cardMatchesFilters(
  c: CardDef,
  f: Pick<CollectionFilters, 'type' | 'rarity' | 'color' | 'keyword' | 'tier' | 'rule' | 'set'>,
): boolean {
  if (f.type !== 'All' && c.type !== f.type) return false;
  if (f.rarity !== 'All' && (c.rarity || 'Common') !== f.rarity) return false;
  if (f.set !== 'All' && (c.set || '') !== f.set) return false;
  if (f.color !== 'All') {
    // A Leader's two colours are on the CardDef like every other card's.
    const cc = cardColors(c);
    if (f.color === 'Colorless' ? cc.length > 0 : !cc.includes(f.color as Color)) return false;
  }
  if (f.keyword !== 'All' && !c.keywords?.includes(f.keyword)) return false;
  if (f.tier !== 'All' && String(c.tier ?? '') !== f.tier) return false;
  if (f.rule !== 'All' && c.rule?.id !== f.rule) return false;
  return true;
}

const TYPE_ORDER = ['Leader', 'Location', 'Unit', 'Item', 'Event'];

/** Grid order for a sort key; ties fall back to the name. Rarity sorts
 * highest first; Tier sorts lowest first, with tierless cards (Leaders,
 * Locations) after every power. */
export function compareCards(sort: SortKey): (a: CardDef, b: CardDef) => number {
  return (a, b) => {
    let d = 0;
    if (sort === 'Rarity') {
      d = RARITIES.indexOf(b.rarity || 'Common') - RARITIES.indexOf(a.rarity || 'Common');
    } else if (sort === 'Type') {
      d = TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type);
    } else if (sort === 'Tier') {
      d = (a.tier ?? 99) - (b.tier ?? 99);
    }
    return d !== 0 ? d : a.name.localeCompare(b.name);
  };
}

/** Display label for a Location-rule filter value. */
export function ruleFilterLabel(rule: string): string {
  return rule === 'All' ? 'Any' : (LOCATION_TEMPLATES[rule as LocationRuleId]?.name ?? rule);
}

// ---- saved presets ---------------------------------------------------------

export interface FilterPreset {
  name: string;
  filters: CollectionFilters;
}
export const MAX_PRESETS = 8;
export const MAX_PRESET_NAME = 24;

export const isPresetList = (v: unknown): v is FilterPreset[] =>
  Array.isArray(v) &&
  v.every(
    (p) =>
      p &&
      typeof p === 'object' &&
      typeof (p as FilterPreset).name === 'string' &&
      isFilters((p as FilterPreset).filters),
  );

/** A default name for the current filters, e.g. "Rare · Ember". */
export function suggestPresetName(f: CollectionFilters, existing: FilterPreset[]): string {
  const parts = [
    f.view === 'owned'
      ? ''
      : f.view === 'all'
        ? 'Full set'
        : f.view === 'spares'
          ? 'Spares'
          : 'Wishlist',
    f.type === 'All' ? '' : f.type,
    f.rarity === 'All' ? '' : f.rarity,
    f.color === 'All' ? '' : f.color,
    f.keyword === 'All' ? '' : f.keyword,
    f.tier === 'All' ? '' : `Tier ${f.tier}`,
    f.rule === 'All' ? '' : ruleFilterLabel(f.rule),
    f.set === 'All' ? '' : f.set,
  ].filter(Boolean);
  const base = (parts.join(' · ') || 'My filter').slice(0, MAX_PRESET_NAME);
  if (!existing.some((p) => p.name === base)) return base;
  for (let i = 2; ; i++) {
    const n = `${base.slice(0, MAX_PRESET_NAME - 3)} ${i}`;
    if (!existing.some((p) => p.name === n)) return n;
  }
}

/** The list with `filters` saved under `name`. A name that already exists is
 * overwritten in place; beyond MAX_PRESETS the oldest is dropped. */
export function savePreset(
  list: FilterPreset[],
  name: string,
  filters: CollectionFilters,
): FilterPreset[] {
  const clean = name.trim().slice(0, MAX_PRESET_NAME);
  if (!clean) return list;
  const entry = { name: clean, filters: sanitizeFilters(filters) };
  const i = list.findIndex((p) => p.name === clean);
  if (i >= 0) return list.map((p, j) => (j === i ? entry : p));
  const next = [...list, entry];
  return next.length > MAX_PRESETS ? next.slice(next.length - MAX_PRESETS) : next;
}

export function deletePreset(list: FilterPreset[], name: string): FilterPreset[] {
  return list.filter((p) => p.name !== name);
}

// ---- quicksell preview -----------------------------------------------------

export interface SpareValue {
  /** Spare copies (normal + foil). */
  cards: number;
  normal: number;
  foil: number;
  /** What the client expects them to fetch (the server recomputes). */
  credits: number;
}

/** Fold per-card spare splits into one total per rarity, with credits. */
export function spareValueByRarity(
  spares: Iterable<{ rarity: string; normal: number; foil: number }>,
): Map<string, SpareValue> {
  const out = new Map<string, SpareValue>();
  for (const s of spares) {
    const n = Math.max(0, s.normal);
    const f = Math.max(0, s.foil);
    if (n + f <= 0) continue;
    const e = out.get(s.rarity) ?? { cards: 0, normal: 0, foil: 0, credits: 0 };
    e.normal += n;
    e.foil += f;
    e.cards += n + f;
    e.credits += n * quicksellPrice(s.rarity, false) + f * quicksellPrice(s.rarity, true);
    out.set(s.rarity, e);
  }
  return out;
}

/** The bulk-quicksell confirmation: how many, and what they are worth. The
 * totals are the client's estimate (economy.ts mirrors the server's table);
 * the server recomputes on sale. */
export function quicksellConfirmText(rarity: string, v: SpareValue): string {
  const parts = [
    v.normal > 0 ? `${v.normal} normal × ${fmt(quicksellPrice(rarity, false))}` : '',
    v.foil > 0 ? `${v.foil} foil × ${fmt(quicksellPrice(rarity, true))}` : '',
  ].filter(Boolean);
  return (
    `Quicksell all ${v.cards} spare ${rarity} card${v.cards === 1 ? '' : 's'}?\n` +
    `${parts.join(' + ')}\n` +
    `Total ≈ ${fmt(v.credits)} credits. This cannot be undone.`
  );
}

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
