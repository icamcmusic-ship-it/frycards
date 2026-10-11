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
import { RARITY_ORDER as RARITY_LADDER, rarityTier } from './rarity';
import { FOIL_QUICKSELL_MULTIPLIER, quicksellPrice } from './economy';

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
  /** The slot's `guaranteed_min_rarity` floor, if any. The server passes it to
   * `roll_weighted_rarity`; `weights` are the configured ones, shown as-is,
   * so the floor is reported next to them rather than folded in. */
  minRarity: string | null;
}

/** Chance per pack of the server's extra Serialized pull
 * (`random() < 0.01` in `grant_pack_contents`): one card ON TOP of the
 * pack's `card_count`, weighted by remaining print supply. */
export const SERIALIZED_PULL_CHANCE = 0.01;

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
  // The server forces foil=false on a Leader-only slot, whatever the pack says.
  if (slot.card_type === 'Leader') foilChance = 0;
  else if (guaranteedFoil) foilChance = 1;
  else if (slot.foil_eligible === false) foilChance = 0;
  else foilChance = slot.foil_chance_override ?? (Number(pack.foil_chance) || 0);

  return {
    label: prettySlotName(rawType),
    // The server reads `count` for legacy rows too (`coalesce(count, 1)`).
    count: slot.count ?? 1,
    weights,
    foilChance,
    cardType: slot.card_type ?? null,
    minRarity: slot.guaranteed_min_rarity ?? null,
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
      prev.minRarity === odds.minRarity &&
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

/**
 * What one pack is worth if every card in it is quick-sold: the expected
 * quicksell value per slot, with foils paying the foil multiplier at the slot's
 * foil chance. The extra Serialized pull is left out (it cannot be quick-sold).
 * Shown next to the price so a player can see how much of a pack's cost the
 * cards give back — the number the odds modal never gave.
 */
export function expectedQuicksellValue(pack: PackType): number {
  let total = 0;
  for (const row of packOdds(pack)) {
    let perCard = 0;
    for (const [rarity, p] of Object.entries(row.weights)) {
      perCard += p * quicksellPrice(rarity, false);
    }
    // A foil pays FOIL_QUICKSELL_MULTIPLIER x, so the slot's average is the
    // base value lifted by (multiplier - 1) at the foil chance.
    total += row.count * perCard * (1 + row.foilChance * (FOIL_QUICKSELL_MULTIPLIER - 1));
  }
  return total;
}

// ---------------------------------------------------------------------------
// Store copy generated from the odds config (A4). The badge, blurb and the
// "what's inside" lines are all derived from `slot_config`, so they can never
// contradict the odds the server actually rolls (they once said "one
// guaranteed foil", "RARE+ GUARANTEED" and, in the DB column, Uncommon).
// ---------------------------------------------------------------------------

/** Lowest rarity a slot row can produce: its floor or its lowest weight. */
function rowFloor(row: SlotOdds): number {
  const live = Object.entries(row.weights).filter(([, p]) => p > 0);
  const lowest = live.length ? Math.min(...live.map(([r]) => rarityTier(r))) : 0;
  return Math.max(lowest, row.minRarity ? rarityTier(row.minRarity) : 0);
}

/** The best rarity at least one card is guaranteed to reach, or null when
 * every slot can be a Common. */
export function packGuarantee(pack: PackType): string | null {
  let best = 0;
  for (const row of packOdds(pack)) best = Math.max(best, rowFloor(row));
  return best > 0 ? RARITY_LADDER[best] : null;
}

/** Cards per pack as the slots actually roll them. */
export function packCardCount(pack: PackType): number {
  const n = packOdds(pack).reduce((s, r) => s + r.count, 0);
  return n || pack.card_count;
}

/** Rarities above Rare that any slot can hit, high to low. */
export function packChaseRarities(pack: PackType): string[] {
  const set = new Set<string>();
  for (const row of packOdds(pack))
    for (const [r, p] of Object.entries(row.weights))
      if (p > 0 && rarityTier(r) > rarityTier('Rare')) set.add(r);
  return [...set].sort((a, b) => rarityTier(b) - rarityTier(a));
}

const NUM_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const numWord = (n: number) => NUM_WORDS[n] ?? String(n);
const listOr = (xs: string[]) =>
  xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} or ${xs[xs.length - 1]}`;

/** One-line pack description, generated. */
export function packBlurb(pack: PackType & { allowed_colors?: string[] | null }): string {
  const n = packCardCount(pack);
  const parts: string[] = [`${n} cards`];
  const foils = packFoilChance(pack).guaranteed;
  if (foils > 0) parts.push(`${numWord(foils)} guaranteed foil${foils === 1 ? '' : 's'}`);
  const g = packGuarantee(pack);
  if (g) parts.push(`at least one ${g} or better`);
  let s = parts.join(', ') + '.';
  const chase = packChaseRarities(pack);
  if (chase.length) s += ` Can hit ${listOr(chase)}.`;
  if (pack.allowed_colors?.length) s += ` Weighted to ${listOr(pack.allowed_colors)}.`;
  return s;
}

/** Badge text, e.g. "RARE+ GUARANTEED", or null. */
export function packGuaranteeBadge(pack: PackType): string | null {
  const g = packGuarantee(pack);
  return g ? `${g.toUpperCase()}+ GUARANTEED` : null;
}

/** "What's inside" lines, one per slot row. */
export function packContentsLines(pack: PackType): string[] {
  return packOdds(pack).map((row) => {
    const live = sortedWeights(row.weights)
      .filter(([, p]) => p > 0)
      .map(([r]) => r);
    const floor = RARITY_LADDER[rowFloor(row)];
    const range =
      live.length <= 1
        ? floor
        : `${floor === live[0] ? live[0] : floor} to ${live[live.length - 1]}`;
    const foil = row.foilChance >= 1 ? ' foil' : '';
    const type = row.cardType ? ` ${row.cardType}` : '';
    return `${row.count}×${foil}${type} ${range}`;
  });
}
