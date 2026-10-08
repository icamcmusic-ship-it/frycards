/**
 * Pack history (AUDIT-2026-10-06 §6 quick win 13): the last packs this
 * browser opened, kept in localStorage. Built from the pulls the open RPCs
 * already return, so it costs no request.
 */
import type { PackPull } from '../lib/supabase';

export const PACK_HISTORY_KEY = 'frycards:pack-history';
export const PACK_HISTORY_MAX = 50;

export interface PackHistoryEntry {
  at: string;
  packName: string;
  pulls: Pick<PackPull, 'card_id' | 'name' | 'rarity' | 'foil' | 'serialized'>[];
}

export function loadPackHistory(): PackHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = JSON.parse(window.localStorage.getItem(PACK_HISTORY_KEY) ?? '[]');
    return Array.isArray(raw) ? (raw as PackHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

/** Newest first, capped at PACK_HISTORY_MAX packs. */
export function recordPack(packName: string, pulls: PackPull[], now = new Date()): void {
  if (typeof window === 'undefined' || pulls.length === 0) return;
  const entry: PackHistoryEntry = {
    at: now.toISOString(),
    packName,
    pulls: pulls.map(({ card_id, name, rarity, foil, serialized }) => ({
      card_id,
      name,
      rarity,
      foil,
      serialized,
    })),
  };
  try {
    window.localStorage.setItem(
      PACK_HISTORY_KEY,
      JSON.stringify([entry, ...loadPackHistory()].slice(0, PACK_HISTORY_MAX)),
    );
  } catch {
    /* storage full or blocked — history just isn't kept */
  }
}
