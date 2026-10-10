/**
 * Placement rewards (Design Spec v0.1, "Rewards").
 *
 * Reward = round((loss + (win − loss) × place factor) × mode multiplier), so a
 * Standard win still pays 100 credits and a last place 40, and the
 * marketplace, shops, grading and battle pass stay calibrated to the same
 * currency. XP and battle-pass XP scale the same way. No reward is ever tied
 * to chip counts — placement only. The server applies the same table (see the
 * `record_match_placement` migration); this copy drives the game-over preview.
 */
import { MODES, PLACE_FACTORS, REWARD_BASE, type ModeId } from './constants';

export function placeFactor(place: number, seats: number): number {
  const row = PLACE_FACTORS[Math.max(2, Math.min(6, seats))];
  return row[Math.max(0, Math.min(row.length - 1, place - 1))];
}

export interface PlacementReward {
  credits: number;
  xp: number;
  bpXp: number;
}

export function placementReward(place: number, seats: number, mode: ModeId): PlacementReward {
  const f = placeFactor(place, seats);
  const mult = MODES[mode].rewardMult;
  const calc = ([lo, span]: number[]) => Math.round((lo + span * f) * mult);
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
