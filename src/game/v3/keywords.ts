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
  // -- v7.3: a second keyword pair for every NON-Unit type. Units had 23
  // keywords and the other four types had two apiece, so an Event/Charm/
  // Location/Leader's keyword slot was a coin flip between the same two
  // options on every card in the pool. Each new keyword is themed to one
  // Essence Type (see KEYWORD_COLOR) so all seven colours gain printable
  // non-Unit text, the same way v6.9 did for Units. --
  'Echoing', // Event — Tide
  'Ritual', // Event — Root
  'Empowering', // Charm — Ember
  'Tethered', // Charm — Gale
  'Bulwark', // Location — Light
  'Blighted', // Location — Void
  'Warlord', // Leader — Shadow
  'Archivist', // Location — Tide
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
  Echoing: 'Event',
  Ritual: 'Event',
  Empowering: 'Charm',
  Tethered: 'Charm',
  Bulwark: 'Location',
  Blighted: 'Location',
  Warlord: 'Leader',
  Archivist: 'Location',
};

/**
 * v7.3: the Essence Type each NON-Unit keyword reads as. Units already had
 * this via NEW_KEYWORD_OF_COLOR in colors.ts; the other four types had no
 * colour identity in their keyword vocabulary at all, so a Void Location and
 * a Light Location drew from the same two-keyword pool. The non-Unit mappers
 * use this to prefer a keyword that matches the card's own colour.
 *
 * Keywords with no entry here are colourless and legal on any card of their
 * type (Surge, Resonant, Runic, Soulbound, Bountiful, Sacred, Commander,
 * Resolute) — the v6.0 set stays universal so nothing that prints today
 * stops being printable.
 */
export const KEYWORD_COLOR: Partial<Record<Keyword, string>> = {
  Echoing: 'Tide',
  Ritual: 'Root',
  Empowering: 'Ember',
  Tethered: 'Gale',
  Bulwark: 'Light',
  Blighted: 'Void',
  Warlord: 'Shadow',
  Archivist: 'Tide',
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
  Echoing: 'When this Event resolves, Deal a card.',
  Ritual: 'Costs 1 less if you control 3 or more Sanctums.',
  Empowering: 'At your Dawn, the bonded unit gets +1/+0 permanently.',
  Tethered: 'When this Charm bonds to a unit from your hand, recover that unit.',
  Bulwark: 'Damage dealt to you is reduced by 1.',
  Blighted: 'At your Dusk, the enemy erodes 1.',
  Warlord: 'While your Leader is on the field, your units get +0/+1.',
  Archivist: 'At your Dawn, Deal a card if you control 3 or more Sanctums.',
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
  // v7.2: the v6.9 carry-forward asked for a second point here. NOT actioned,
  // and the item is closed rather than carried: the signal does not survive
  // being looked at. Doublestrike has only TWO carriers in the whole pool, and
  // their absolute win rate is 49.9% (n=337) / 44.4% (n=1062) — BELOW even in
  // both cohorts. The +6.9 / +6.2 archetype-normalized delta that flagged it
  // for five passes is measuring how badly those two cards' Leader cohorts do,
  // not the keyword. Nerfing a keyword whose carriers are already losing would
  // be chasing a cohort artifact. Stays at 5.
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
  // Sacred stays at 1, and the v7.2 pass is the one that finally explains
  // why it has been flagged for six passes without a weight change ever being
  // the answer.
  //
  // The 1 -> 3 raise was tried and REVERTED on its own evidence. It did move
  // the printed cost of all seven carriers by a full point (verified card by
  // card), and it changed nothing that mattered: the archetype-normalized
  // delta went +24.4 / +17.3 -> +25.0 / +26.9 and carriers still won 71.7% /
  // 72.2% outright. What it did do was cut Sacred carrier games from 425/985
  // to 234/604 — and the surviving number was, in both cohorts, EXACTLY
  // `stone_bubbles`' own play count. The other six Sacred Locations had simply
  // been priced out of every deck.
  //
  // So the keyword never had a seven-card problem. It had a one-card problem,
  // which is what the v6.6 doc suspected and priced individually. Actioned
  // that way instead (see `stone_bubbles` in cardpool.ts's COST_ADJUST), and
  // the blanket weight left alone rather than shipping a nerf that provably
  // moves no win rate while deleting six cards from the draftable pool.
  //
  // Worth recording for the next weight change of ANY keyword: `keywordCostAdj`
  // is `Math.round(w / 2)`, so this table's effective resolution is TWO. A
  // 1 -> 2 or 3 -> 4 step is a byte-for-byte no-op on every single-keyword
  // carrier. That is the same trap the v6.9 doc hit on Resonant ("at weight 1
  // the surcharge still rounds up to a full point") without naming the rule.
  Sacred: 1,
  Commander: 2,
  Resolute: 1,
  // v7.3 initial weights, set by analogy to the closest already-tuned
  // keyword — these have never been through a sim pass, so they are first
  // candidates for the next balance run. Note keywordCostAdj is
  // Math.round(w / 2), so this table's effective resolution is TWO: a 1 -> 2
  // step is a no-op on a single-keyword carrier (see the Sacred note above).
  Echoing: 2, // a cantrip on an Event — Runic (1) on the Charm side, one step up
  Ritual: 0, // conditional discount, same shape and same price as Surge
  Empowering: 3, // compounding growth, priced with Thriving
  Tethered: 1, // one-shot tempo, priced with Ambush
  Bulwark: 3, // permanent damage reduction on the player, priced with Hardened
  Blighted: 1, // 1 erosion a turn, priced with Entropic
  Warlord: 2, // a stat aura on a Leader, priced with Commander
  Archivist: 3, // repeating, build-around card advantage, priced with Tidecaller
};

/** Short label for card-face chips. */
export function keywordLabel(kw: string): string {
  return kw;
}
