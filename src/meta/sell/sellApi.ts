/**
 * Sell-desk RPCs (20261014000200_sell_flow.sql). Kept beside the desk rather
 * than in lib/supabase.ts so they ship in the lazy Marketplace chunk.
 */
import { supabase } from '../../lib/supabase';
import type { BatchLot, PriceGuide } from './sellLogic';

const clean = (m: string) => m.replace(/^[A-Z0-9]{2,10}:\s*/, '');

export interface BatchResult {
  index: number;
  ok: boolean;
  listing_id?: string;
  ends_at?: string;
  error?: string;
}

/** One round trip for 1–10 lots; each lot succeeds or fails on its own. */
export async function createListingsMany(
  lots: BatchLot[],
): Promise<{ results: BatchResult[]; error: string | null }> {
  const { data, error } = await supabase.rpc('create_listings_many', { p_items: lots });
  if (error) return { results: [], error: clean(error.message) };
  const results = ((data as { results?: BatchResult[] } | null)?.results ?? []).map((r) => ({
    ...r,
    error: r.error ? clean(r.error) : undefined,
  }));
  return { results, error: null };
}

export async function updateListingPrice(id: string, price: number): Promise<string | null> {
  const { error } = await supabase.rpc('update_listing_price', {
    p_listing_id: id,
    p_price: price,
  });
  return error ? clean(error.message) : null;
}

/** Per-session memo: re-selecting a lot within 5 minutes costs no round trip. */
const memo = new Map<string, { at: number; guide: PriceGuide }>();
const TTL = 5 * 60_000;

/** Batched price guide for up to 40 lots; cached entries are not re-asked. */
export async function fetchPriceGuides(
  queries: { key: string; query: Record<string, unknown> }[],
): Promise<Map<string, PriceGuide>> {
  const out = new Map<string, PriceGuide>();
  const now = Date.now();
  const need = queries.filter((x) => {
    const hit = memo.get(x.key);
    if (hit && now - hit.at < TTL) {
      out.set(x.key, hit.guide);
      return false;
    }
    return true;
  });
  for (let i = 0; i < need.length; i += 40) {
    const chunk = need.slice(i, i + 40);
    const { data, error } = await supabase.rpc('get_sell_price_guide', {
      p_items: chunk.map((x) => x.query),
    });
    if (error) throw new Error(clean(error.message));
    const rows = (Array.isArray(data) ? data : []) as PriceGuide[];
    chunk.forEach((x, j) => {
      const g = rows[j];
      if (!g) return;
      memo.set(x.key, { at: now, guide: g });
      out.set(x.key, g);
    });
  }
  return out;
}

export function forgetPriceGuides(): void {
  memo.clear();
}
