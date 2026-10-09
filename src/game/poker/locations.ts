/**
 * Locations: the table's weather (Design Spec v0.1, "Locations").
 *
 * Each deck holds exactly one Location. The table plays the seats' Locations
 * from a shared bag in a shuffled order that ignores who is dealing, so a
 * Location is never one seat's perk. The 55 Location cards map onto these
 * parameterised templates; the card hash picks the template and varies its
 * parameter. Every rule is data the hand evaluator, the betting engine and the
 * bots read — at most one structural change per Location.
 */
import type { CardDef, LocationRule, LocationRuleId } from './cards';
import { fmtUnits } from './keywords';
import { roll, Rng, shuffle } from './rng';

export type LocationTag =
  | 'Neutral'
  | 'Favors the dealer'
  | 'Chaos'
  | 'Structural'
  | 'Position'
  | 'Information'
  | 'Powers-heavy'
  | 'Powers-light'
  | 'Economy'
  | 'Shrinks revival'
  | 'Leader-focused'
  | 'Pure poker';

export interface LocationTemplate {
  id: LocationRuleId;
  name: string;
  tag: LocationTag;
  /** Parameter values the card hash picks from (undefined = no parameter). */
  params?: number[];
  text: (param?: number) => string;
}

export const LOCATION_TEMPLATES: Record<LocationRuleId, LocationTemplate> = {
  plain: {
    id: 'plain',
    name: 'Plain Table',
    tag: 'Pure poker',
    text: () => 'No rule change. Pure poker.',
  },
  highStakes: {
    id: 'highStakes',
    name: 'High Stakes',
    tag: 'Neutral',
    params: [1.5, 2],
    text: (p = 1.5) => `Blinds ×${p} this hand.`,
  },
  openHand: {
    id: 'openHand',
    name: 'Open Hand',
    tag: 'Neutral',
    text: () => "Each player's lowest hole card is dealt face-up.",
  },
  doubleBoard: {
    id: 'doubleBoard',
    name: 'Double Board',
    tag: 'Neutral',
    text: () => 'The turn and river are dealt twice; each pot splits between the two boards.',
  },
  nightGame: {
    id: 'nightGame',
    name: 'Night Game',
    tag: 'Neutral',
    text: () => 'No Quick Events this hand.',
  },
  dealersChoice: {
    id: 'dealersChoice',
    name: "Dealer's Choice",
    tag: 'Favors the dealer',
    text: () =>
      'The dealer gets one free Peek (one card) on any street. The shortest stack gets one too.',
  },
  houseRake: {
    id: 'houseRake',
    name: 'House Rake',
    tag: 'Favors the dealer',
    params: [1],
    text: (p = 1) =>
      `The dealer antes ${fmtUnits(p)} and collects ${fmtUnits(p)} from the pot at the end of the hand.`,
  },
  bombPot: {
    id: 'bombPot',
    name: 'Bomb Pot',
    tag: 'Chaos',
    params: [1, 2],
    text: (p = 1) => `Everyone antes ${fmtUnits(p)}; no blinds and no pre-flop betting.`,
  },
  pineapple: {
    id: 'pineapple',
    name: 'Pineapple',
    tag: 'Structural',
    text: () => 'Three hole cards each; discard one after the flop.',
  },
  straddleNight: {
    id: 'straddleNight',
    name: 'Straddle Night',
    tag: 'Position',
    text: () =>
      'The player under the gun posts a live double blind. The shortest stack casts its first power one step cheaper.',
  },
  reverseOrder: {
    id: 'reverseOrder',
    name: 'Reverse Order',
    tag: 'Position',
    text: () =>
      'Betting acts in reverse seat order. The shortest stack casts its first power one step cheaper.',
  },
  openTable: {
    id: 'openTable',
    name: 'Open Table',
    tag: 'Information',
    text: () => 'Every hand that reaches showdown is shown; nothing is mucked.',
  },
  fog: {
    id: 'fog',
    name: 'Fog',
    tag: 'Information',
    text: () => 'One flop card stays face-down until the turn.',
  },
  happyHour: {
    id: 'happyHour',
    name: 'Happy Hour',
    tag: 'Powers-heavy',
    text: () => 'All power costs are one step cheaper.',
  },
  silentTable: {
    id: 'silentTable',
    name: 'Silent Table',
    tag: 'Powers-light',
    text: () => 'No Quick Events and no Ambush this hand.',
  },
  jackpotPit: {
    id: 'jackpotPit',
    name: 'Jackpot Pit',
    tag: 'Economy',
    text: () => "Chips paid for powers go into a jackpot added to the next hand's pot.",
  },
  shortBoard: {
    id: 'shortBoard',
    name: 'Short Board',
    tag: 'Shrinks revival',
    text: () => 'No river: the hand ends after the turn.',
  },
  tiltZone: {
    id: 'tiltZone',
    name: 'Tilt Zone',
    tag: 'Leader-focused',
    text: () => 'Nerve gains and losses are doubled.',
  },
};

/** Templates a Location card can roll (Plain Table is the house's own). */
export const CARD_TEMPLATES: LocationRuleId[] = (
  Object.keys(LOCATION_TEMPLATES) as LocationRuleId[]
).filter((id) => id !== 'plain');

export function locationRuleFor(seed: string): LocationRule {
  const id = CARD_TEMPLATES[roll(seed, 'loc-template', CARD_TEMPLATES.length)];
  const t = LOCATION_TEMPLATES[id];
  const param = t.params ? t.params[roll(seed, 'loc-param', t.params.length)] : undefined;
  return param === undefined ? { id } : { id, param };
}

export function ruleText(rule: LocationRule): string {
  return LOCATION_TEMPLATES[rule.id].text(rule.param);
}

export function ruleName(rule: LocationRule): string {
  return LOCATION_TEMPLATES[rule.id].name;
}

/** The Plain Table hand mixed into every cycle. */
export const PLAIN_TABLE: CardDef = {
  id: '__plain_table',
  name: 'Plain Table',
  type: 'Location',
  colors: [],
  rule: { id: 'plain' },
  text: LOCATION_TEMPLATES.plain.text(),
  keywords: [],
};

// ---------------------------------------------------------------------------
// Schedule
// ---------------------------------------------------------------------------

export interface ScheduledLocation {
  card: CardDef;
  /** Seat that brought it (undefined for Plain Table / house Locations). The
   * owner is credited when it comes up but gets no gameplay bonus. */
  owner?: number;
}

/**
 * Build one cycle of the Location bag: every seat's Location, one Plain Table
 * and — at 2 or 3 seats — enough house Locations that the table sees at least
 * five distinct ones. Shuffled; never repeats the previous Location first.
 */
export function buildCycle(
  seatLocations: { card: CardDef; owner: number }[],
  house: CardDef[],
  rng: Rng,
  previousRuleKey: string | null,
): ScheduledLocation[] {
  const bag: ScheduledLocation[] = seatLocations.map((s) => ({ card: s.card, owner: s.owner }));
  bag.push({ card: PLAIN_TABLE });
  if (seatLocations.length <= 3) {
    const seen = new Set(bag.map((b) => b.card.id));
    const pool = shuffle(
      house.filter((h) => !seen.has(h.id)),
      rng,
    );
    while (new Set(bag.map((b) => b.card.id)).size < 5 && pool.length > 0) {
      bag.push({ card: pool.shift()! });
    }
  }
  shuffle(bag, rng);
  // No Location repeats on consecutive hands — inside the cycle, or across
  // the boundary with the previous cycle.
  const key = (s: ScheduledLocation) => s.card.id;
  if (previousRuleKey && bag.length > 1 && key(bag[0]) === previousRuleKey) {
    const j = bag.findIndex((b) => key(b) !== previousRuleKey);
    if (j > 0) [bag[0], bag[j]] = [bag[j], bag[0]];
  }
  for (let i = 1; i < bag.length; i++) {
    if (key(bag[i]) === key(bag[i - 1])) {
      const j = bag.findIndex((b, k) => k > i && key(b) !== key(bag[i - 1]));
      if (j > 0) [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag;
}
