/**
 * The Collection's filter state as one plain object, so it can be remembered
 * between visits and saved as named presets. Pure; the screen owns the UI.
 */
import { RARITIES } from '../types';
import { COLORS } from '../game/v3/colors';
import { quicksellPrice } from './economy';

export const TYPES = ['All', 'Leader', 'Unit', 'Item', 'Event', 'Location'];
export const RARITY_FILTERS = ['All', ...RARITIES];
export const COLOR_FILTERS = ['All', ...COLORS, 'Colorless'];
export const SORTS = ['Name', 'Rarity', 'Type', 'Cost'] as const;
export type SortKey = (typeof SORTS)[number];

/** What the grid lists: your cards, the whole set, only spares, or the wishlist. */
export const VIEWS = ['owned', 'all', 'spares', 'wishlist'] as const;
export type CollectionView = (typeof VIEWS)[number];

export interface CollectionFilters {
  view: CollectionView;
  type: string;
  rarity: string;
  color: string;
  /** Free-form (the keyword list comes from the live pool); 'All' = any. */
  keyword: string;
  set: string;
  sort: SortKey;
}

export const DEFAULT_FILTERS: CollectionFilters = {
  view: 'owned',
  type: 'All',
  rarity: 'All',
  color: 'All',
  keyword: 'All',
  set: 'All',
  sort: 'Name',
};

const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;
const str = (v: unknown, fallback: string): string =>
  typeof v === 'string' && v.length > 0 && v.length <= 60 ? v : fallback;

/** Coerce stored JSON into a valid filter object; unknown values (a rarity
 * renamed since the save, a hand-edited key) fall back to their defaults. */
export function sanitizeFilters(v: unknown): CollectionFilters {
  const o = (v && typeof v === 'object' ? v : {}) as Record<string, unknown>;
  const d = DEFAULT_FILTERS;
  return {
    view: pick(o.view, VIEWS, d.view),
    type: pick(o.type, TYPES, d.type),
    rarity: pick(o.rarity, RARITY_FILTERS, d.rarity),
    color: pick(o.color, COLOR_FILTERS, d.color),
    keyword: str(o.keyword, d.keyword),
    set: str(o.set, d.set),
    sort: pick(o.sort, SORTS, d.sort),
  };
}

export const isFilters = (v: unknown): v is CollectionFilters =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** How many of the narrowing filters differ from the default (the view and
 * the sort are choices, not filters, and are not counted). */
export function activeFilterCount(f: CollectionFilters): number {
  return (['type', 'rarity', 'color', 'keyword', 'set'] as const).filter(
    (k) => f[k] !== DEFAULT_FILTERS[k],
  ).length;
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
