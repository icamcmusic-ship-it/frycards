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
  dupeProtected: boolean;
  /** 'Leader' for the Leader Pack's Leader-only slot. */
  cardType: string | null;
}

const RARITY_ORDER = [
  'Common',
  'Uncommon',
  'Rare',
  'Super-Rare',
  'Ultra-Rare',
  'Full-Art',
  'Alt-Art',
  'Mythic',
];

export function sortedWeights(weights: Record<string, number>): [string, number][] {
  return Object.entries(weights).sort(
    (a, b) => RARITY_ORDER.indexOf(a[0]) - RARITY_ORDER.indexOf(b[0]),
  );
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
  const guaranteedFoil = rawType.startsWith('foil_') || rawType === 'prismatic';

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
    dupeProtected: slot.dupe_protected ?? false,
    cardType: slot.card_type ?? null,
  };
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
