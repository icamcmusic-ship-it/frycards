/**
 * Client-side mirror of the server's pack odds so the store can show a
 * transparent per-slot breakdown before purchase.
 *
 * Two slot shapes exist in `pack_types.slot_config`:
 *  - explicit: { slot_type, count, rarity_weights, ... } — odds read directly.
 *    Every pack_types row currently live uses this shape.
 *  - legacy:   { type: 'wildcard' } — odds live in the `roll_slot_rarity`
 *    Postgres function (still called by `grant_pack_contents` as a fallback
 *    whenever a slot has no `rarity_weights`); LEGACY_SLOT_WEIGHTS below must
 *    stay in sync with it. No shipped pack uses this shape today, but the
 *    fallback path is real — don't delete it without also retiring the
 *    server-side `roll_slot_rarity` function.
 */
import { PackSlot, PackType } from '../lib/supabase';
import { rarityTier } from './rarity';

export const LEGACY_SLOT_WEIGHTS: Record<string, Record<string, number>> = {
  foundation: { Common: 1 },
  synergy: { Uncommon: 1 },
  variance: {
    Common: 0.4,
    Uncommon: 0.35,
    Rare: 0.185,
    'Super-Rare': 0.04,
    'Ultra-Rare': 0.015,
    Mythic: 0.01,
  },
  wildcard: {
    Common: 0.5,
    Uncommon: 0.3,
    Rare: 0.13,
    'Super-Rare': 0.035,
    'Ultra-Rare': 0.02,
    Mythic: 0.015,
  },
  chase: { Rare: 0.876, 'Super-Rare': 0.124 },
  chase_sr_plus: { 'Super-Rare': 0.72, 'Ultra-Rare': 0.16, Mythic: 0.12 },
  elite_chase: { 'Super-Rare': 0.6, 'Ultra-Rare': 0.2, Mythic: 0.2 },
  sr_or_higher: { 'Super-Rare': 0.7, 'Ultra-Rare': 0.18, Mythic: 0.12 },
  mythic_or_divine: { Mythic: 0.75, 'Ultra-Rare': 0.25 },
  prismatic: { Rare: 0.6, 'Super-Rare': 0.22, 'Ultra-Rare': 0.1, Mythic: 0.08 },
};

export interface SlotOdds {
  label: string;
  count: number;
  /** rarity -> probability (sums to ~1) */
  weights: Record<string, number>;
  foilChance: number; // 0..1, 1 = guaranteed foil
  /** 'Leader' for the Leader Pack's Leader-only slot. */
  cardType: string | null;
}

/** Sorted low-to-high on the shared ladder in rarity.ts. This file used to
 * keep its own copy of the order; PackOpening.tsx kept a third, and that one
 * had silently drifted (no 'Alt-Art'). One ladder, imported. */
export function sortedWeights(weights: Record<string, number>): [string, number][] {
  return Object.entries(weights).sort((a, b) => rarityTier(a[0]) - rarityTier(b[0]));
}

function prettySlotName(raw: string): string {
  return raw
    .replace(/^foil_/, '')
    .replace(/_/g, ' ')
    .toUpperCase();
}

export function slotOdds(pack: PackType, slot: PackSlot): SlotOdds {
  const rawType = slot.type ?? slot.slot_type ?? 'foundation';
  const isLegacy = slot.type != null;
  // Mirrors grant_pack_contents' own foil test: a `foil_*` prefixed slot, the
  // v7.2 `foil` slot (the booster's guaranteed-foil card) or `prismatic`.
  const guaranteedFoil =
    rawType.startsWith('foil_') || rawType === 'foil' || rawType === 'prismatic';

  let weights: Record<string, number>;
  if (slot.rarity_weights) {
    weights = slot.rarity_weights;
  } else {
    weights = LEGACY_SLOT_WEIGHTS[rawType.replace(/^foil_/, '')] ?? { Common: 1 };
  }

  let foilChance: number;
  if (guaranteedFoil) foilChance = 1;
  else if (slot.foil_eligible === false) foilChance = 0;
  else foilChance = slot.foil_chance_override ?? (Number(pack.foil_chance) || 0);

  return {
    label: prettySlotName(rawType),
    count: isLegacy ? 1 : (slot.count ?? 1),
    weights,
    foilChance,
    cardType: slot.card_type ?? null,
  };
}

/**
 * Chance of at least one foil ANYWHERE in the pack.
 *
 * The `foil_chance` column is a PER-SLOT probability, which is why a pack
 * advertising "4%" used to produce a foil in ~21% of opens (six independent
 * rolls). v7.2 states the number players actually care about — per pack —
 * and the server-side per-slot rate is set so this lands on ~8%. Slots that
 * are guaranteed foil are excluded: they are called out separately rather
 * than collapsing the whole figure to 100%.
 */
export function packFoilChance(pack: PackType): { bonus: number; guaranteed: number } {
  let missAll = 1;
  let guaranteed = 0;
  for (const row of packOdds(pack)) {
    if (row.foilChance >= 1) guaranteed += row.count;
    else missAll *= Math.pow(1 - row.foilChance, row.count);
  }
  return { bonus: 1 - missAll, guaranteed };
}

/** Collapse identical adjacent legacy slots so the modal reads "×4 FOUNDATION"
 * instead of four separate rows. */
export function packOdds(pack: PackType): SlotOdds[] {
  const rows: SlotOdds[] = [];
  for (const slot of pack.slot_config || []) {
    const odds = slotOdds(pack, slot);
    const prev = rows[rows.length - 1];
    if (
      prev &&
      prev.label === odds.label &&
      prev.foilChance === odds.foilChance &&
      // A type-locked slot (e.g. "always a Leader") must not merge into a
      // typeless neighbour with the same label/weights — the collapsed row
      // would misstate how many slots the lock applies to.
      prev.cardType === odds.cardType &&
      JSON.stringify(prev.weights) === JSON.stringify(odds.weights)
    ) {
      prev.count += odds.count;
    } else {
      rows.push(odds);
    }
  }
  return rows;
}

/** Expected number of cards of each rarity across the whole pack. */
export function expectedRarities(pack: PackType): [string, number][] {
  const totals: Record<string, number> = {};
  for (const row of packOdds(pack)) {
    for (const [rarity, p] of Object.entries(row.weights)) {
      totals[rarity] = (totals[rarity] || 0) + p * row.count;
    }
  }
  return sortedWeights(totals);
}
