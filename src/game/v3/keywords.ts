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
  // -- v6.0 Item keywords --
  'Runic',
  'Soulbound',
  // -- v6.0 Location keywords --
  'Bountiful',
  'Sacred',
  // -- v6.0 Leader keywords --
  'Commander',
  'Resolute',
  // -- v7.3: a second keyword pair for every NON-Unit type. Units had 23
  // keywords and the other four types had two apiece, so an Event/Item/
  // Location/Leader's keyword slot was a coin flip between the same two
  // options on every card in the pool. Each new keyword is themed to one
  // Essence Type (see KEYWORD_COLOR) so all seven colours gain printable
  // non-Unit text, the same way v6.9 did for Units. --
  'Echoing', // Event — Tide
  'Ritual', // Event — Root
  'Empowering', // Item — Ember
  'Tethered', // Item — Gale
  'Bulwark', // Location — Light
  'Blighted', // Location — Void
  'Warlord', // Leader — Shadow
  'Archivist', // Location — Tide
  // -- v7.5: the six keywords that had names in the roadmap and nothing else.
  // They were listed as "implement when cards using them are printed", which
  // is a deadlock — nothing prints a keyword the engine does not have. Each
  // is placed where the vocabulary was actually thin rather than where the
  // name first suggests: Events, Items and Locations all had colours with no
  // printable text, and all three have a free roll band (see V75_KEYWORDS).
  'Fate', // Event — Void
  'Exhume', // Event — Shadow
  'Freeze-Dry', // Item — Tide
  'Blessed', // Item — Light
  'Scorched-Earth', // Location — Ember
  'Glaciate', // Location — Gale
] as const;

/**
 * v7.5: the newest keyword generation, held apart from the v7.3 set on
 * purpose.
 *
 * `freshKeywordFor` picks with `pick(seed, 27, list)`, which indexes MODULO
 * the list's length — so adding a keyword to a type's coloured vocabulary
 * re-rolls the keyword of every card of that type whose own colour has no
 * match and falls back to the full list. That is the trap the v7.3 colour-pair
 * note and the v7.4 Unbreakable salvage both record. The card pool therefore
 * draws these from their own roll band, on their own list, so every existing
 * carrier re-prints byte-identically and only cards that previously rolled NO
 * keyword can pick one up.
 */
export const V75_KEYWORDS: readonly string[] = [
  'Fate',
  'Exhume',
  'Freeze-Dry',
  'Blessed',
  'Scorched-Earth',
  'Glaciate',
];

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
  Runic: 'Item',
  Soulbound: 'Item',
  Bountiful: 'Location',
  Sacred: 'Location',
  Commander: 'Leader',
  Resolute: 'Leader',
  Echoing: 'Event',
  Ritual: 'Event',
  Empowering: 'Item',
  Tethered: 'Item',
  Bulwark: 'Location',
  Blighted: 'Location',
  Warlord: 'Leader',
  Archivist: 'Location',
  Fate: 'Event',
  Exhume: 'Event',
  'Freeze-Dry': 'Item',
  Blessed: 'Item',
  'Scorched-Earth': 'Location',
  Glaciate: 'Location',
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
  // v7.5. Placed to fill colour holes: Events had nothing in Shadow or Void,
  // Items nothing in Tide or Light, Locations nothing in Ember or Gale.
  Fate: 'Void',
  Exhume: 'Shadow',
  'Freeze-Dry': 'Tide',
  Blessed: 'Light',
  'Scorched-Earth': 'Ember',
  Glaciate: 'Gale',
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
  Unbreakable:
    'Once per turn, prevent the first effect that would shatter this or deal it lethal damage.',
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
  Runic: 'When this Item bonds to a unit from your hand, Deal a card.',
  Soulbound: 'When the bonded unit leaves the field, return this Item to your hand.',
  Bountiful: 'Exhausts for 2 essence instead of 1.',
  Sacred: 'At your Dawn, restore 1 Vitality.',
  Commander: 'While your Leader is on the field, your units get +1 Might.',
  Resolute: 'At your Dawn, your invoked Leader recovers 1 Resolve (up to its starting value).',
  Echoing: 'When this Event resolves, Deal a card.',
  Ritual: 'Costs 1 less if you control 3 or more Sanctums.',
  Empowering: 'At your Dawn, the bonded unit gets +1/+0 permanently.',
  Tethered: 'When this Item bonds to a unit from your hand, recover that unit.',
  Bulwark: 'Damage dealt to you is reduced by 1.',
  Blighted: 'At your Dusk, the enemy erodes 1.',
  Warlord: 'While your Leader is on the field, your units get +0/+1.',
  Archivist: 'At your Dawn, Deal a card if you control 3 or more Sanctums.',
  Fate: "When this Event resolves, banish the top card of the opponent's deck.",
  Exhume: 'When this Event resolves, return a random Unit from your ash-pile to your hand.',
  'Freeze-Dry': 'When this Item bonds to a unit from your hand, exhaust a target enemy unit.',
  Blessed: 'When this Item bonds to a unit from your hand, restore 3 Vitality.',
  'Scorched-Earth':
    'At your Dusk, if you control 3 or more Sanctums, deal 1 damage to each enemy unit.',
  Glaciate: 'At every other Dawn, exhaust a target enemy unit.',
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
  Echoing: 2, // a cantrip on an Event — Runic (1) on the Item side, one step up
  Ritual: 0, // conditional discount, same shape and same price as Surge
  Empowering: 3, // compounding growth, priced with Thriving
  Tethered: 1, // one-shot tempo, priced with Ambush
  Bulwark: 3, // permanent damage reduction on the player, priced with Hardened
  Blighted: 1, // 1 erosion a turn, priced with Entropic
  Warlord: 2, // a stat aura on a Leader, priced with Commander
  Archivist: 3, // repeating, build-around card advantage, priced with Tidecaller
  // v7.5 initial weights, set by analogy the same way v7.3's were — none of
  // these has been through a sim pass, so they are the first candidates for
  // the next balance run. Remember keywordCostAdj is Math.round(w / 2), so
  // this table's effective resolution is TWO: a 1 -> 2 step is a no-op on a
  // single-keyword carrier (see the Sacred note above).
  // v7.7: 1 -> 0. Fate was the largest sample of any keyword in the pool
  // (3,451-4,341 carrier games) and read NEGATIVE in all four cohorts
  // (-5.0 / -1.8 / -1.7 / -4.2) without ever having been priced. At weight 1
  // `keywordCostAdj` rounds 0.5 up to a full essence point, so nine Events
  // were each paying a whole point of cost for "banish the top card of the
  // opponent's deck" in a format where 92-94% of wins come from Vitality —
  // a price tag on text that does approximately nothing. At 0 they pay
  // nothing for it, and the effect is unchanged (`t` is `naturalT - kwAdj`,
  // so both terms drop by one and the magnitude derivation is untouched).
  // Carrier win rate rose or held in all four cohorts: 43.4 -> 46.0,
  // 50.2 -> 50.2, 47.6 -> 50.6, 43.8 -> 46.2. The archetype-normalized delta
  // rose in three of the four (-5.0 -> -2.5, -1.7 -> +0.6, -4.2 -> -3.0) and
  // fell 1.2 in cohort B on a moving archetype baseline; the carrier win rate
  // is the more direct read of a price-only change and it is monotone.
  Fate: 0,
  Exhume: 3, // recursion is card advantage that picks its own card; Tidecaller tier
  'Freeze-Dry': 1, // one-shot tempo on the enemy board, priced with Tethered
  Blessed: 1, // one-shot Vitality, priced with Runic
  // The two repeating Location effects were both set at 3 by analogy and both
  // came back over on their first measured run:
  //
  //   Glaciate        +11.5 (n=283) / +12.0 (n=965)  — reproduces in both
  //   Scorched-Earth  +22.3 (n=411) / no reading      — level with Sacred
  //
  // Both were raised 3 -> 5 (a move of TWO, because keywordCostAdj is
  // Math.round(w / 2) and a 3 -> 4 step is a byte-for-byte no-op) and both
  // raises were REVERTED on the re-run. They did not price the carriers; they
  // deleted them. Glaciate's delta did fall (+11.5 -> +5.0 in cohort A) but
  // its two cohort-B carriers dropped out of the report entirely, and
  // Scorched-Earth's best-sampled carrier (`sparkling_meadow`, n=411, ramp
  // residual +7.3) fell under the floor in both.
  //
  // That is the third independent demonstration in this pass of the same
  // thing — see the v7.6 findings §1, where three of four
  // per-card Location cost trials failed the identical way, and the v7.2
  // Sacred weight raise before them. A cost point on a Location is close to
  // binary: it either moves no win rate or it removes the card from the
  // format, and a residual measured on a third of the games is not the same
  // measurement.
  //
  // Left at their by-analogy weights with the readings recorded. Both carry
  // forward for an EFFECT-side lever (gate the sweep on Sanctum count, or
  // move it to every other Dusk) rather than a fourth attempt at price.
  //
  // v7.6 pulled both of those effect levers, in engine.ts's Dawn/Dusk
  // handlers, and the weights stay where they are because the effect is now
  // doing the work the price could not:
  //
  //   Scorched-Earth  gated on 3+ Sanctums   +22.3 -> +9.5 -> +5.3 (A)
  //   Glaciate        every other Dawn       +11.5 / +12.0 -> +8.2 / +7.8
  //
  // Both held their carriers this time (`sparkling_meadow` n=411 -> 412 where
  // the price raise had put it under the floor), which is the whole difference
  // between an effect lever and a cost point on a Location.
  //
  // Two caveats are recorded rather than smoothed over. Scorched-Earth still
  // has NO cohort-B reading — B decks it in zero games, before and after — so
  // its number is single-cohort in the only cohort that can see it. And
  // Glaciate's improvement did not survive to the end of the pass: the final
  // verification, run after the v7.5 keyword roll bands were widened, reads
  // +9.8 (A) / +12.0 (B), i.e. back to baseline in B. Widening a roll band is
  // a content change that moves the meta, and it was interleaved with balance
  // trials in this pass; the lesson is to sequence them, and Glaciate carries
  // forward on that basis.
  'Scorched-Earth': 3, // a repeating board sweep, gated on 3+ Sanctums
  Glaciate: 3, // tempo denial every other Dawn, priced with Scorched-Earth
};

/** Short label for card-face chips. */
export function keywordLabel(kw: string): string {
  return kw;
}
