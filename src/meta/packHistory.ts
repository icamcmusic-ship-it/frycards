/**
 * Pack history (AUDIT-2026-10-06 §6 quick win 13): the last packs this
 * browser opened, kept in localStorage. Built from the pulls the open RPCs
 * already return, so it costs no request.
 */
import type { PackPull } from '../lib/supabase';
import { quicksellPrice } from './economy';
import { rarityTier } from './rarity';

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

/** The pull fields a recap needs — a subset of PackPull, so both live pulls
 * and stored history entries fit. */
type RecapPull = Pick<PackPull, 'rarity' | 'foil'> &
  Partial<Pick<PackPull, 'card_id' | 'name' | 'serialized' | 'converted_to_credits'>>;

/**
 * How "good" a pull is, for picking a best pull: rarity first, then kept
 * copies over credit conversions, then foil, with Serialized above everything.
 */
export function pullScore(p: RecapPull): number {
  return (
    rarityTier(p.rarity) * 100 +
    (p.converted_to_credits ? 0 : 10) +
    (p.foil ? 1 : 0) +
    (p.serialized ? 1000 : 0)
  );
}

export interface SessionRecap {
  packs: number;
  cards: number;
  /** Best single pull across the session; null when nothing was opened. */
  best: RecapPull | null;
  /** Quicksell value of everything kept. Over-cap pulls were already paid out
   * as credits and Serialized prints can never be quicksold, so neither
   * counts — the same rule the pack summary's HAUL VALUE uses. */
  keptValue: number;
}

/** Roll several opened packs (one "Open next" session) into one recap. */
export function summarizeSession(packs: RecapPull[][]): SessionRecap {
  let best: RecapPull | null = null;
  let cards = 0;
  let keptValue = 0;
  for (const pulls of packs) {
    for (const p of pulls) {
      cards += 1;
      if (!p.converted_to_credits && !p.serialized) keptValue += quicksellPrice(p.rarity, p.foil);
      if (!best || pullScore(p) > pullScore(best)) best = p;
    }
  }
  return { packs: packs.length, cards, best, keptValue };
}
