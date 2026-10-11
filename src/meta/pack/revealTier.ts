/**
 * Pure helpers for the pack-opening presentation: how loud each reveal is,
 * how hard the sealed pack shakes, and what colour leaks through the seam.
 */
import type { PackPull } from '../../lib/supabase';
import { RARITY_HEX, rarityTier } from '../rarity';

/** fast: C/U quick flip · rare: glow · burst: SR/UR dim + burst ·
 * mythic: full-screen takeover. Serialized is an add-on stamp, not a tier. */
export type RevealTier = 'fast' | 'rare' | 'burst' | 'mythic';

export function revealTier(
  pull: Pick<PackPull, 'rarity' | 'converted_to_credits'> & Partial<Pick<PackPull, 'variant'>>,
): RevealTier {
  if (pull.converted_to_credits) return 'fast';
  const t = rarityTier(pull.rarity);
  if (t >= rarityTier('Mythic')) return 'mythic';
  // A variant (Shattered / elemental) always gets at least the SR moment.
  if (t >= rarityTier('Super-Rare') || pull.variant) return 'burst';
  if (t >= rarityTier('Rare')) return 'rare';
  return 'fast';
}

/** Best kept pull's tier on the ladder (0 = Common). */
export function bestTier(pulls: PackPull[]): number {
  let best = 0;
  for (const p of pulls) if (!p.converted_to_credits) best = Math.max(best, rarityTier(p.rarity));
  return best;
}

/**
 * Pre-tear shake strength, 0..3, from the already-drawn contents. Deliberately
 * coarse so it hints rather than spoils: everything up to Rare shakes the same
 * (a booster always holds a Rare), SR and UR/Full-Art share a level, and only
 * the top tiers (Alt-Art, Mythic, or any serialized print) get the hardest.
 */
export function shakeLevel(pulls: PackPull[]): 0 | 1 | 2 | 3 {
  if (pulls.length === 0) return 0;
  const t = bestTier(pulls);
  if (pulls.some((p) => p.serialized) || t >= rarityTier('Alt-Art')) return 3;
  if (t >= rarityTier('Ultra-Rare')) return 2;
  if (t >= rarityTier('Super-Rare')) return 1;
  return 0;
}

/** The colour that leaks through the seam: only for an honest Rare+ best
 * pull; null keeps the seam plain. */
export function leakColor(pulls: PackPull[]): string | null {
  const t = bestTier(pulls);
  if (t < rarityTier('Rare')) return null;
  const rarity = pulls
    .filter((p) => !p.converted_to_credits)
    .reduce((a, b) => (rarityTier(b.rarity) > rarityTier(a.rarity) ? b : a)).rarity;
  return RARITY_HEX[rarity] || null;
}

/** Tear completes on release once past this fraction; below it snaps shut. */
export const TEAR_COMMIT = 0.6;

/** Where a released tear goes. */
export function tearRelease(progress: number): 'complete' | 'snap' {
  return progress >= TEAR_COMMIT ? 'complete' : 'snap';
}

/**
 * NEW vs DUPE per card id, from the haul and an owned-count snapshot. Same
 * rule the summary's NEW tile always used: new when the player owns no more
 * copies than this haul gave, which holds whether the snapshot was taken
 * before or after the collection refresh. A dupe reports the copies held.
 */
export function newOrDupe(
  pulls: PackPull[],
  owned: Map<string, number>,
): Map<string, { isNew: boolean; copies: number }> {
  const got = new Map<string, number>();
  for (const p of pulls)
    if (!p.converted_to_credits) got.set(p.card_id, (got.get(p.card_id) ?? 0) + 1);
  const out = new Map<string, { isNew: boolean; copies: number }>();
  for (const [id, k] of got) {
    const have = owned.get(id) ?? 0;
    out.set(id, { isNew: have <= k, copies: Math.max(have, k) });
  }
  return out;
}
