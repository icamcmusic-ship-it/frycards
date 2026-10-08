/**
 * Battle Pass claiming, as pure functions so the sequencing can be tested
 * without a Supabase client or a mounted screen.
 */

interface TierLike {
  tier: number;
}

export interface TierGroups<T extends TierLike> {
  /** Unlocked and not yet claimed, lowest tier first. */
  ready: T[];
  /** Still locked, lowest tier first. */
  upcoming: T[];
  /** Already claimed, lowest tier first. */
  claimed: T[];
}

/**
 * Splits the track into what the player can act on now, what is still ahead
 * and what is done. The screen lists them in that order, so unclaimed rewards
 * are no longer buried under a screenful of claimed ones.
 */
export function groupTiers<T extends TierLike>(
  tiers: T[],
  xp: number,
  xpPerTier: number,
  claimed: ReadonlySet<number>,
): TierGroups<T> {
  const out: TierGroups<T> = { ready: [], upcoming: [], claimed: [] };
  for (const t of [...tiers].sort((a, b) => a.tier - b.tier)) {
    if (claimed.has(t.tier)) out.claimed.push(t);
    else if (xp >= t.tier * xpPerTier) out.ready.push(t);
    else out.upcoming.push(t);
  }
  return out;
}

export interface ClaimAllResult {
  /** Tiers the server accepted, in order. */
  claimed: number[];
  /** The first failure, if any — claiming stops there. */
  failed: { tier: number; error: string } | null;
  total: number;
}

/**
 * Claims `tiers` one after another through `claim` (which resolves to an
 * error message, or null on success — the shape of `claimBpTier`). Stops at
 * the first failure instead of pushing on: a failed claim usually means the
 * session or connection is gone, and carrying on would just stack errors.
 * A thrown rejection counts as a failure too.
 */
export async function claimAllTiers(
  tiers: number[],
  claim: (tier: number) => Promise<string | null>,
  onClaimed?: (tier: number, doneCount: number, total: number) => void,
): Promise<ClaimAllResult> {
  const claimed: number[] = [];
  for (const tier of tiers) {
    let error: string | null;
    try {
      error = await claim(tier);
    } catch {
      error = 'Something went wrong — check your connection and try again.';
    }
    if (error) return { claimed, failed: { tier, error }, total: tiers.length };
    claimed.push(tier);
    onClaimed?.(tier, claimed.length, tiers.length);
  }
  return { claimed, failed: null, total: tiers.length };
}

/** The line shown under CLAIM ALL once it has finished or stopped. */
export function claimAllMessage(r: ClaimAllResult): string {
  const n = r.claimed.length;
  if (!r.failed) return `Claimed ${n} tier${n === 1 ? '' : 's'}.`;
  return `Claimed ${n} of ${r.total} before stopping at tier ${r.failed.tier}: ${r.failed.error}`;
}
