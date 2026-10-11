/**
 * Store RPC wrappers added with migration 20261012000020 (daily deal +
 * limited-time colour packs). Kept out of `supabase.ts` so the Store chunk
 * owns them.
 */
import { supabase } from './supabase';
import type { PackType } from './supabase';

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
