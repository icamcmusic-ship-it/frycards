/**
 * Currency display. Credits are the base currency, stored server-side as a
 * plain integer number of credits (NOT cents — see e.g. shop_setup_fee()=5000,
 * shop_maintenance_fee_per_slot()=15, and server errors like "Bid must be at
 * least % credits", which all speak in whole credits). No "$" prefix — the
 * credits Coins icon (see CreditChip) is the only currency symbol in the UI.
 * Vouchers are the secondary/premium currency (plain integer).
 */
export function fmtCredits(credits: number | null | undefined): string {
  const n = Math.max(0, Math.round(credits ?? 0));
  return n.toLocaleString('en-US');
}

export function fmtVouchers(n: number | null | undefined): string {
  return `${(n ?? 0).toLocaleString('en-US')}`;
}

/**
 * Client-side mirror of the quicksell pricing in the `card_sell_price` /
 * `quicksell_cards` Postgres functions — keep these numbers in sync with
 * that migration. Used only to render prices before the player confirms;
 * the server always recomputes and is the source of truth.
 */
import { Rarity } from '../types';

export const QUICKSELL_PRICES: Record<Rarity, number> = {
  Common: 10,
  Uncommon: 25,
  Rare: 100,
  'Super-Rare': 300,
  'Full-Art': 500,
  'Ultra-Rare': 800,
  Mythic: 3000,
};

export const FOIL_QUICKSELL_MULTIPLIER = 2.5;

export function quicksellPrice(rarity: string | undefined, foil: boolean): number {
  const base = QUICKSELL_PRICES[(rarity as Rarity) || 'Common'] ?? QUICKSELL_PRICES.Common;
  return foil ? Math.ceil(base * FOIL_QUICKSELL_MULTIPLIER) : base;
}

/**
 * Client-side mirrors of the Player Shops constants — kept in sync with the
 * shop_* SQL functions (shop_setup_fee, shop_base_slots, shop_slot_cost,
 * shop_maintenance_fee_per_slot, shop_min_pool_size). Used only to render
 * costs before the player confirms; the server always recomputes.
 */
export const SHOP_UNLOCK_LEVEL = 50;
export const SHOP_SETUP_FEE = 5000;
export const SHOP_BASE_SLOTS = 4;
export const SHOP_MAX_SLOTS = 30;
export const SHOP_MAINTENANCE_FEE_PER_SLOT = 15;

/** Collateral cost of the n'th purchased slot (1-indexed, beyond the base allotment). */
export function shopSlotCost(n: number): number {
  return 1500 + (Math.max(1, n) - 1) * 750;
}

export function shopMinPoolSize(packSize: number): number {
  return Math.max(packSize * 10, 30);
}
