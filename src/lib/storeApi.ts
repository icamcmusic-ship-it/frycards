/**
 * Store RPC wrappers added with migration 20261012000020 (daily deal +
 * limited-time colour packs). Kept out of `supabase.ts` so the Store chunk
 * owns them.
 */
import { supabase } from './supabase';
import type { PackPull, PackType } from './supabase';

/** pack_types columns added by 20261012000020. */
export type StorePack = PackType & {
  available_until?: string | null;
  allowed_colors?: string[] | null;
};

export interface DailyDeal {
  pack_id: string;
  pct: number;
  ends_at: string;
}

/** Today's pack deal (one per UTC day). Empty on any failure. */
export async function fetchDailyDeals(): Promise<DailyDeal[]> {
  try {
    const { data, error } = await supabase.rpc('daily_pack_deals');
    if (error || !Array.isArray(data)) return [];
    return data as DailyDeal[];
  } catch {
    return [];
  }
}

/** Mirror of the server's `pack_effective_price` (the server is the
 * authority; this only labels the button). */
export function dealPrice(base: number | null, pct: number | undefined): number | null {
  if (base == null) return null;
  if (!pct || base === 0) return base;
  return Math.max(1, Math.round((base * (100 - pct)) / 100));
}

/** Milliseconds until the next UTC midnight (deal rotation). */
export function msToUtcMidnight(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
}

// ---------------------------------------------------------------------------
// Bundles (20261015000400): N copies of one pack at a fixed price.
// ---------------------------------------------------------------------------

export interface ShopBundle {
  id: string;
  name: string;
  pack_type_id: string;
  pack_qty: number;
  price_credits: number | null;
  price_vouchers: number | null;
  sort_order: number;
}

/** Active bundles, shelf order. Empty on any failure. */
export async function fetchShopBundles(): Promise<ShopBundle[]> {
  try {
    const { data, error } = await supabase
      .from('shop_bundles')
      .select('id, name, pack_type_id, pack_qty, price_credits, price_vouchers, sort_order')
      .eq('is_active', true)
      .order('sort_order');
    if (error || !Array.isArray(data)) return [];
    return data as ShopBundle[];
  } catch {
    return [];
  }
}

export interface BundleResult {
  ok: boolean;
  bundle_id: string;
  quantity: number;
  opened: boolean;
  price_paid: number;
  replayed?: boolean;
  cards?: PackPull[];
  packs_opened?: number;
}

/** Buys a bundle. `requestId` makes a retry safe: the server replays the
 * first result for the same id instead of charging again. `open` opens the
 * packs in place (the ×10 BUY & OPEN), otherwise they land in My Packs. */
export async function purchaseBundle(
  bundleId: string,
  currency: 'credits' | 'vouchers',
  requestId: string,
  open = false,
): Promise<{ data: BundleResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('purchase_bundle', {
    p_bundle_id: bundleId,
    p_currency: currency,
    p_request_id: requestId,
    p_open: open,
  });
  return {
    data: (data as BundleResult) || null,
    error: error ? error.message.replace(/^[A-Z0-9]{2,10}:\s*/, '') : null,
  };
}

/** Price the server charges: the cheaper of the bundle price and today's
 * per-pack price times the quantity (mirror of purchase_bundle). */
export function bundlePrice(
  b: ShopBundle,
  pack: PackType,
  cur: 'credits' | 'vouchers',
  dealPct?: number,
): { price: number; value: number; savePct: number } | null {
  const bp = cur === 'credits' ? b.price_credits : b.price_vouchers;
  const base = cur === 'credits' ? pack.price_credits : pack.price_vouchers;
  if (bp == null) return null;
  const unit = dealPrice(base, dealPct);
  const value = (base ?? 0) * b.pack_qty;
  const price = unit == null ? bp : Math.min(bp, unit * b.pack_qty);
  const savePct = value > 0 ? Math.round((1 - price / value) * 100) : 0;
  return { price, value, savePct };
}
