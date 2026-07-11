/**
 * Client-side mirror of the economy constants in the Postgres functions
 * (`card_sell_price`, `shard_craft_cost`, `shard_disenchant_value`,
 * `rarity_copy_cap`, `quicksell_cards`) — keep in sync with the migrations.
 * Used only to render prices/limits before the player confirms; the server
 * always recomputes and is the source of truth.
 */
import { Rarity } from '../types';

export const QUICKSELL_PRICES: Record<Rarity, number> = {
  Common: 10,
  Uncommon: 25,
  Rare: 60,
  'Super-Rare': 150,
  'Ultra-Rare': 400,
  'Full-Art': 650,
  Mythic: 1000,
};

export const FOIL_QUICKSELL_MULTIPLIER = 2.5;

export function quicksellPrice(rarity: string | undefined, foil: boolean): number {
  const base = QUICKSELL_PRICES[(rarity as Rarity) || 'Common'] ?? QUICKSELL_PRICES.Common;
  return foil ? Math.ceil(base * FOIL_QUICKSELL_MULTIPLIER) : base;
}

/** Shards needed to craft a card (foil = 2x). Disenchant returns 1/4. */
export const SHARD_CRAFT_COSTS: Record<Rarity, number> = {
  Common: 40,
  Uncommon: 100,
  Rare: 400,
  'Super-Rare': 800,
  'Ultra-Rare': 1600,
  'Full-Art': 3200,
  Mythic: 6400,
};

export function shardCraftCost(rarity: string | undefined, foil: boolean): number {
  const base = SHARD_CRAFT_COSTS[(rarity as Rarity) || 'Common'] ?? SHARD_CRAFT_COSTS.Common;
  return foil ? base * 2 : base;
}

export function shardDisenchantValue(rarity: string | undefined, foil: boolean): number {
  return Math.ceil(shardCraftCost(rarity, foil) / 4);
}

/** Deck copy cap by rarity (economy doc §3): 3 / 2 / 1. */
export function rarityCopyCap(rarity: string | undefined): number {
  if (rarity === 'Full-Art' || rarity === 'Mythic') return 1;
  if (rarity === 'Super-Rare' || rarity === 'Ultra-Rare') return 2;
  return 3;
}
