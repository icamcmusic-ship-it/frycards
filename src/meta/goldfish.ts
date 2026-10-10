/**
 * Deck Builder "goldfish" checks for FryCards Poker: what the deck's power
 * hand looks like across the first hands of a match.
 *
 * A seat's powers (Units, Items, Events — the Location goes to the table's
 * rotation, not the hand) are shuffled into a draw pile at the start of a
 * match. The seat draws `handStart` cards, then `handDraw` more at the start
 * of every later hand, holding at most `handCap` (MODES in
 * game/poker/constants.ts).
 *
 * Everything here is pure and seeded. `drawTestHand` deals the exact opening
 * hand seat 1 gets in a real match on that seed (same shuffle, same rng), so
 * a suspicious opener can be quoted by its seed rather than described.
 */
import type { CardDef } from '../game/poker/cards';
import { isPower } from '../game/poker/cards';
import { MODES, SECOND_COST_TIER, type ModeId } from '../game/poker/constants';
import type { EffectKeyword } from '../game/poker/keywords';
import { rngOn, shuffle } from '../game/poker/rng';
import { THEMES } from './deckAdvice';

/** Seeded Fisher-Yates using the engine's own generator. Same seed, same
 * order — that is the entire point. */
export function seededShuffle<T>(arr: readonly T[], seed: number): T[] {
  return shuffle([...arr], rngOn({ rng: seed | 0 }));
}

/** The deck's powers, in list order — what a match shuffles into the draw
 * pile. Leaders, Locations and unknown ids drop out. */
export function powerCards(
  cardIds: readonly string[],
  poolById: Record<string, CardDef>,
): CardDef[] {
  return cardIds.map((id) => poolById[id]).filter((c): c is CardDef => !!c && isPower(c));
}

const themeKeywords = (id: string): EffectKeyword[] =>
  THEMES.find((t) => t.id === id)?.keywords ?? [];
const REVIVE = themeKeywords('revive');
const INFORMATION = themeKeywords('information');

/** Castable on chips alone: below the tier that also needs a second cost. */
export function castableOnChips(c: CardDef): boolean {
  return (c.tier ?? 1) < SECOND_COST_TIER;
}

const has = (kws: EffectKeyword[]) => (c: CardDef) =>
  !!c.effect && kws.includes(c.effect.kw as EffectKeyword) && castableOnChips(c);
export const isCastableRevive = has(REVIVE);
export const isCastableInformation = has(INFORMATION);

export interface TestHand {
  seed: number;
  mode: ModeId;
  cards: CardDef[];
  /** Mean tier of the hand. */
  averageTier: number;
  units: number;
  /** True when the hand holds no Unit — nothing to stay out and carry Items. */
  noUnits: boolean;
  /** Powers castable on chips alone (tier 1–3). */
  cheapPlays: number;
  revive: boolean;
  information: boolean;
}

export function drawTestHand(
  cardIds: readonly string[],
  poolById: Record<string, CardDef>,
  seed: number,
  mode: ModeId = 'standard',
): TestHand {
  // The deal createMatch makes for the first seat: its powers in list order,
  // shuffled by the match rng's first draws, dealt off the top.
  const cards = seededShuffle(powerCards(cardIds, poolById), seed).slice(0, MODES[mode].handStart);
  const tiers = cards.reduce((s, c) => s + (c.tier ?? 1), 0);
  const units = cards.filter((c) => c.type === 'Unit').length;
  return {
    seed,
    mode,
    cards,
    averageTier: cards.length ? +(tiers / cards.length).toFixed(2) : 0,
    units,
    noUnits: units === 0,
    cheapPlays: cards.filter(castableOnChips).length,
    revive: cards.some(isCastableRevive),
    information: cards.some(isCastableInformation),
  };
}

export interface HandOdds {
  /** 1 = the opening hand. */
  hand: number;
  /** Powers seen by this hand (opening hand plus each later draw). */
  seen: number;
  /** Share of trials that had seen a chips-only revive power by this hand. */
  revive: number;
  information: number;
  unit: number;
}

export interface OpeningStats {
  mode: ModeId;
  trials: number;
  /** Mean tier of the opening hand. */
  averageOpeningTier: number;
  /** Share of opening hands holding at least one Unit. */
  openingWithUnit: number;
  byHand: HandOdds[];
}

/**
 * Simulate the first `hands` power draws of a match for this deck, `trials`
 * times from `seed`. Goldfish assumption: every power is played as it comes,
 * so the hand cap never blocks a draw — "by hand N" means "seen by hand N".
 */
export function simulateOpenings(
  cardIds: readonly string[],
  poolById: Record<string, CardDef>,
  mode: ModeId = 'standard',
  opts: { trials?: number; hands?: number; seed?: number } = {},
): OpeningStats {
  const { trials = 500, hands = 5, seed = 1 } = opts;
  const m = MODES[mode];
  const deck = powerCards(cardIds, poolById);
  const byHand: HandOdds[] = Array.from({ length: hands }, (_, i) => ({
    hand: i + 1,
    seen: Math.min(deck.length, m.handStart + i * m.handDraw),
    revive: 0,
    information: 0,
    unit: 0,
  }));
  if (deck.length === 0) return { mode, trials, averageOpeningTier: 0, openingWithUnit: 0, byHand };
  const holder = { rng: seed | 0 };
  const rng = rngOn(holder);
  let tierSum = 0;
  let withUnit = 0;
  for (let t = 0; t < trials; t++) {
    const order = shuffle([...deck], rng);
    const opening = order.slice(0, m.handStart);
    tierSum += opening.reduce((s, c) => s + (c.tier ?? 1), 0) / Math.max(1, opening.length);
    if (opening.some((c) => c.type === 'Unit')) withUnit++;
    // First index at which each feature shows up in the draw order.
    const first = (pred: (c: CardDef) => boolean) => {
      const i = order.findIndex(pred);
      return i < 0 ? Infinity : i;
    };
    const fRevive = first(isCastableRevive);
    const fInfo = first(isCastableInformation);
    const fUnit = first((c) => c.type === 'Unit');
    for (const h of byHand) {
      if (fRevive < h.seen) h.revive++;
      if (fInfo < h.seen) h.information++;
      if (fUnit < h.seen) h.unit++;
    }
  }
  for (const h of byHand) {
    h.revive = +(h.revive / trials).toFixed(3);
    h.information = +(h.information / trials).toFixed(3);
    h.unit = +(h.unit / trials).toFixed(3);
  }
  return {
    mode,
    trials,
    averageOpeningTier: +(tierSum / trials).toFixed(2),
    openingWithUnit: +(withUnit / trials).toFixed(3),
    byHand,
  };
}
