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
 *
 * Audit S-2: bot difficulty scales the credit reward only (XP stays flat so
 * levelling is not gated by skill). The server reads the difficulty from the
 * match ticket (`begin_match(p_mode, p_seats, p_difficulty)`, migration
 * 20261012000001); a ticket without one pays like Normal.
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

export type RewardDifficulty = 'easy' | 'normal' | 'hard';

/** Credit multiplier per bot difficulty, in hundredths (server: 0.8 / 1 / 1.15). */
export const DIFFICULTY_REWARD_MULT: Record<RewardDifficulty, number> = {
  easy: 80,
  normal: 100,
  hard: 115,
};

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
  /** Bot difficulty recorded on the ticket; omitted pays like Normal. */
  difficulty: RewardDifficulty = 'normal',
): PlacementReward {
  if (place > 1 && hands !== undefined && hands < minPaidHands(seats)) {
    return { credits: 0, xp: 0, bpXp: 0 };
  }
  const f = placeFactor(place, seats);
  const mult = MODES[mode].rewardMult * SEAT_REWARD_MULT[Math.max(2, Math.min(6, seats))];
  // Integer maths in hundredths keeps JS rounding identical to Postgres numeric.
  const calc = ([lo, span]: number[]) =>
    Math.round((Math.round((lo + span * f) * 100) * Math.round(mult * 1000)) / 100_000);
  const d = DIFFICULTY_REWARD_MULT[difficulty] ?? 100;
  return {
    // Postgres: round(credits * 0.8 | 1 | 1.15); exact in integer hundredths.
    credits: Math.round((calc(REWARD_BASE.credits) * d) / 100),
    xp: calc(REWARD_BASE.xp),
    bpXp: calc(REWARD_BASE.bpXp),
  };
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
