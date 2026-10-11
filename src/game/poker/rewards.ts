/**
 * Placement rewards (Design Spec v0.1, "Rewards"; rebalanced by audit F-5).
 *
 * Reward = round((last + span × place factor) × mode multiplier × seat
 * multiplier). A six-seat Standard win pays 100 credits, last place 15. XP
 * and battle-pass XP scale the same way. A non-winning finish (a concede
 * looks the same as a bust) pays nothing before `minPaidHands(seats)` hands.
 * No reward is ever tied to chip counts — placement only. The server applies
 * the same table (`record_match_placement`, migration 20261011000002); this
 * copy drives the game-over preview.
 */
import { MODES, PLACE_FACTORS, REWARD_BASE, SEAT_REWARD_MULT, type ModeId } from './constants';

export function placeFactor(place: number, seats: number): number {
  const row = PLACE_FACTORS[Math.max(2, Math.min(6, seats))];
  return row[Math.max(0, Math.min(row.length - 1, place - 1))];
}

/** Hands a non-winning finish must last before it pays (server-enforced). */
export function minPaidHands(seats: number): number {
  return Math.max(3 * seats, 8);
}

export interface PlacementReward {
  credits: number;
  xp: number;
  bpXp: number;
}

export function placementReward(
  place: number,
  seats: number,
  mode: ModeId,
  /** Hands played; omit for a preview that ignores the concede rule. */
  hands?: number,
): PlacementReward {
  if (place > 1 && hands !== undefined && hands < minPaidHands(seats)) {
    return { credits: 0, xp: 0, bpXp: 0 };
  }
  const f = placeFactor(place, seats);
  const mult = MODES[mode].rewardMult * SEAT_REWARD_MULT[Math.max(2, Math.min(6, seats))];
  // Integer maths in hundredths keeps JS rounding identical to Postgres numeric.
  const calc = ([lo, span]: number[]) =>
    Math.round((Math.round((lo + span * f) * 100) * Math.round(mult * 1000)) / 100_000);
  return {
    credits: calc(REWARD_BASE.credits),
    xp: calc(REWARD_BASE.xp),
    bpXp: calc(REWARD_BASE.bpXp),
  };
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
