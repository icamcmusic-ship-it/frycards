/**
 * Fry Cards v5.x keyword abilities — the full legal set from the rulebook
 * glossary, with UI descriptions and cost weights for the card pool's
 * essence-cost calculation. The v4.x tier system is retired: every keyword
 * is binary (a card has it or it doesn't).
 *
 * v6.0: every card TYPE now has its own keyword vocabulary. The original
 * fourteen rulebook keywords stay Unit-only; each of the other four types
 * gained two type-specific keywords (see KEYWORD_TYPES below).
 */
import type { CardType } from './cards';

export const KEYWORDS = [
  // -- Unit keywords (rulebook §1) --
  'Aerial',
  'Overrun',
  'Quickstrike',
  'Doublestrike',
  'Venomous',
  'Siphon',
  'Alert',
  'Reckless',
  'Swarmproof',
  'Skywatch',
  'Warded',
  'Unbreakable',
  'Ambush',
  'Immobile',
  // -- v6.0 Unit keywords --
  'Regenerate',
  'Hardened',
  // -- v6.9 Unit keywords: one new-generation keyword per Essence Type, so
  // every color gained fresh printable text (see KEYWORDS_OF_COLOR). --
  'Wildfire', // Ember
  'Tidecaller', // Tide
  'Thriving', // Root
  'Nimble', // Gale
  'Radiant', // Light
  'Withering', // Shadow
  'Entropic', // Void
  // -- v6.0 Event keywords --
  'Surge',
  'Resonant',
  // -- v6.0 Charm keywords --
  'Runic',
  'Soulbound',
  // -- v6.0 Location keywords --
  'Bountiful',
  'Sacred',
  // -- v6.0 Leader keywords --
  'Commander',
  'Resolute',
] as const;

export type Keyword = (typeof KEYWORDS)[number];

export function isKeyword(s: string): s is Keyword {
  return (KEYWORDS as readonly string[]).includes(s);
}

/** Which card type each keyword can legally be printed on. */
export const KEYWORD_TYPES: Record<Keyword, CardType> = {
  Aerial: 'Unit',
  Overrun: 'Unit',
  Quickstrike: 'Unit',
  Doublestrike: 'Unit',
  Venomous: 'Unit',
  Siphon: 'Unit',
  Alert: 'Unit',
  Reckless: 'Unit',
  Swarmproof: 'Unit',
  Skywatch: 'Unit',
  Warded: 'Unit',
  Unbreakable: 'Unit',
  Ambush: 'Unit',
  Immobile: 'Unit',
  Regenerate: 'Unit',
  Hardened: 'Unit',
  Wildfire: 'Unit',
  Tidecaller: 'Unit',
  Thriving: 'Unit',
  Nimble: 'Unit',
  Radiant: 'Unit',
  Withering: 'Unit',
  Entropic: 'Unit',
  Surge: 'Event',
  Resonant: 'Event',
  Runic: 'Charm',
  Soulbound: 'Charm',
  Bountiful: 'Location',
  Sacred: 'Location',
  Commander: 'Leader',
  Resolute: 'Leader',
};

/** Keywords legal on a given card type. */
export function keywordsForType(t: CardType): Keyword[] {
  return KEYWORDS.filter((kw) => KEYWORD_TYPES[kw] === t);
}

/** Player-facing rules text per keyword (rulebook §1 "Keyword Abilities"). */
export const KEYWORD_TEXT: Record<Keyword, string> = {
  Aerial: 'Can only be guarded by other Aerial or Skywatch units.',
  Overrun: 'Excess clash damage carries through to the defending player.',
  Quickstrike: 'Deals damage before normal clash damage.',
  Doublestrike: 'Deals both quickstrike and normal clash damage.',
  Venomous: 'Any damage this deals to a unit is lethal.',
  Siphon: 'Damage dealt also gains you that much Vitality.',
  Alert: "Doesn't exhaust when attacking.",
  Reckless: 'Can act the turn it enters the field.',
  Swarmproof: 'Must be guarded by two or more units.',
  Skywatch: 'Can guard Aerial units.',
  Warded: "Can't be targeted by an opponent.",
  Unbreakable: "Can't be shattered or dealt lethal damage.",
  Ambush: 'Can be invoked at any time, even outside your main phase.',
  Immobile: "Can't attack.",
  Regenerate: 'At Dawn, heal all damage marked on this unit.',
  Hardened: 'Damage dealt to this unit is reduced by 1.',
  Wildfire: 'When this unit dies, deal 2 damage to the enemy player.',
  Tidecaller: 'Whenever this unit deals clash damage, Deal a card.',
  Thriving: 'At your Dawn, this unit gets +1/+1 permanently.',
  Nimble: 'Can only be guarded by units with less Might.',
  Radiant: 'At your Dawn, restore 1 Vitality.',
  Withering: "Clash damage this deals to a unit permanently reduces that unit's Grit by 1.",
  Entropic: 'At your Dusk, the enemy erodes 1.',
  Surge: 'Costs 1 less if you already invoked another card this turn.',
  Resonant: 'Its effect resolves twice.',
  Runic: 'When this Charm bonds to a unit from your hand, Deal a card.',
  Soulbound: 'When the bonded unit leaves the field, return this Charm to your hand.',
  Bountiful: 'Exhausts for 2 essence instead of 1.',
  Sacred: 'At your Dawn, restore 1 Vitality.',
  Commander: 'While your Leader is on the field, your units get +1 Might.',
  Resolute: 'At your Dawn, your invoked Leader recovers 1 Resolve (up to its starting value).',
};

/** Cost weight each keyword contributes to a card's essence cost in the
 * pool's deterministic assignment (roughly: +1 total cost per 2 weight).
 * Immobile is a drawback and discounts. */
// v5.1: weights are now a PURE cost surcharge (the stat budget no longer
// grows with them), tuned over two full sim passes to land carriers near 50%.
// v5.3 balance pass (two seeds + matched-deck run,
// then post-change verification pairs): Unbreakable stays 7 — the 9 (and
// effectively-identical 8) trials cratered its carriers, and the original
// +16.5 read turned out to be mostly the OLD dead-reaction-window meta:
// with reaction plays live and the big-Ambush reservation capped, carriers
// settle near even at 7; Venomous 2->3
// and Aerial 2->3 (consistently positive normalized deltas across three
// passes); Quickstrike 3->4 (mildly positive every pass since v5.1);
// Siphon 2->0 — REVERSING v5.2's bump, which read the negative normalized
// delta backwards (carriers UNDERperform their cohort: overpriced, not
// underpriced), and still negative at 1 in the verification pair;
// Swarmproof 2->1 (flipped negative both verification seeds under the new
// reaction-heavy CPU meta); Warded 0->-1 (consistently negative across
// three passes — targeting denial rarely converts to wins, so it now
// discounts like Immobile).
// v6.0: initial weights for the ten new type keywords (unit weights feed
// mapUnit's surcharge; the non-unit weights feed each type mapper's own
// cost adjustment).
// v6.1: the non-Unit mappers now price keywords from THIS table (the
// hardcoded per-mapper surcharges are gone), with values informed by the
// 2208-game sim: Resonant up (carriers +20.7 win-rate delta), Bountiful
// down (-24), Sacred kept cheap (-14.6), Runic/Soulbound/Resolute at 1.
// v6.2 balance pass (18,048-game run — the first pass
// with a real sample for the two keywords v6.1 flagged as too small-n to
// touch): Resonant's tiny 84-game v6.1 read (+7.1) FLIPS hard at n=1088
// (-14.5 archetype-normalized delta) — the double-resolution is not worth
// its +3 surcharge once the sample is big enough to trust; cut to +2.
// Doublestrike's 147-game v6.1 read (+12.8) holds up at n=1384 (+9.2) — bump
// 3->4. Reckless (+7.5, n=5726) and Regenerate (-7.9, n=2287) both cleared
// the ±7 action threshold for the first time this pass. Surge repeats a
// negative read for a second consecutive pass (v6.1 -5.9 at n=1036, v6.2
// -4.8 at n=7764) — a repeat-offender cut to 0, matching Siphon/Skywatch.
export const KEYWORD_COST: Record<Keyword, number> = {
  Aerial: 3,
  Overrun: 3,
  Quickstrike: 4,
  // v6.9: THIRD consecutive pass reading positive in both cohorts
  // (+6.5/+12.4 in v6.7, +7.6/+7.9 here at n=353/1075). v6.7 said one more
  // confirming pass before actioning — this is it. 4 -> 5.
  Doublestrike: 5,
  Venomous: 3,
  Siphon: 0,
  Alert: 2,
  Reckless: 2,
  Swarmproof: 1,
  Skywatch: 0,
  Warded: -1,
  Unbreakable: 7,
  Ambush: 1,
  Immobile: -2,
  Regenerate: 2,
  Hardened: 3,
  // v6.9 initial weights for the seven new per-color keywords, set by
  // analogy to the closest already-tuned keyword and re-derived from the
  // first sim pass that carries them (see docs/BALANCE_SIM_FINDINGS).
  // Tidecaller/Thriving/Nimble sit at the Aerial/Venomous tier (repeating,
  // compounding or evasive); Wildfire/Withering at the Regenerate tier
  // (one-shot or slow); Radiant/Entropic at the Sacred tier (1 point a turn).
  Wildfire: 2,
  Tidecaller: 3,
  Thriving: 3,
  Nimble: 3,
  Radiant: 1,
  Withering: 2,
  Entropic: 1,
  Surge: 0,
  // v6.9: a three-pass repeat offender. Negative in both cohorts before this
  // pass's cut (-12.2 / -14.9) and STILL negative in both after 2 -> 1
  // (-11.9 / -20.3) — at weight 1 the surcharge still rounds up to a full
  // point of cost. Taken to 0 on the established repeat-offender precedent
  // (Surge in v6.2, Siphon/Skywatch before it): double-resolution has never
  // once paid for a surcharge, so it now carries none.
  Resonant: 0,
  Runic: 1,
  Soulbound: 1,
  Bountiful: 1,
  Sacred: 1,
  Commander: 2,
  Resolute: 1,
};

/** Short label for card-face chips. */
export function keywordLabel(kw: string): string {
  return kw;
}
