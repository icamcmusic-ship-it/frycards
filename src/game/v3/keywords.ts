/**
 * Riftbound v5.0 keyword abilities — the full legal set from the rulebook
 * glossary, with UI descriptions and cost weights for the card pool's
 * essence-cost calculation. The v4.x tier system is retired: every keyword
 * is binary (a unit has it or it doesn't).
 */

export const KEYWORDS = [
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
] as const;

export type Keyword = (typeof KEYWORDS)[number];

export function isKeyword(s: string): s is Keyword {
  return (KEYWORDS as readonly string[]).includes(s);
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
};

/** Cost weight each keyword contributes to a card's essence cost in the
 * pool's deterministic assignment (roughly: +1 total cost per 2 weight).
 * Immobile is a drawback and discounts. */
// v5.1: weights are now a PURE cost surcharge (the stat budget no longer
// grows with them), tuned over two full sim passes to land carriers near 50%.
// v5.2: Unbreakable 6->7 (archetype-normalized delta was still +12.3, the
// largest in the pool, after the v5.1 bump) and Swarmproof 1->2 (cost-2/3
// Swarmproof carriers ran hot across both v5.2 seeds even post-surcharge-fix)
// pushed up; Siphon 1->2 (archetype-normalized delta -8.7, confirmed
// under-costed net of cohort — reversing part of the v5.1 cut).
export const KEYWORD_COST: Record<Keyword, number> = {
  Aerial: 2,
  Overrun: 3,
  Quickstrike: 3,
  Doublestrike: 3,
  Venomous: 2,
  Siphon: 2,
  Alert: 2,
  Reckless: 1,
  Swarmproof: 2,
  Skywatch: 0,
  Warded: 0,
  Unbreakable: 7,
  Ambush: 1,
  Immobile: -2,
};

/** Short label for card-face chips. */
export function keywordLabel(kw: string): string {
  return kw;
}
