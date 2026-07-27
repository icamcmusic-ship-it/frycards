/**
 * Fry Cards v5.0 Essence Types — the game's seven colors.
 *
 * Unlike the old v4.x system (colors derived from keywords), a card's color
 * identity is now printed directly on the card: it is the set of colored
 * pips in its Essence Cost (`CardDef.cost.pips`). A card whose cost has no
 * colored pips is colorless and legal in every deck. See
 * docs/RULEBOOK.md.
 */
import type { CardDef } from './cards';

export type Color = 'Ember' | 'Tide' | 'Root' | 'Gale' | 'Light' | 'Shadow' | 'Void';
/** Alias — the rulebook calls colors "Essence Types". */
export type EssenceType = Color;

export const COLORS: Color[] = ['Ember', 'Tide', 'Root', 'Gale', 'Light', 'Shadow', 'Void'];

export const COLOR_IDENTITY: Record<Color, string> = {
  Ember: 'Aggression, direct damage, haste',
  Tide: 'Card draw, bounce, tempo',
  Root: 'Big stats, essence ramp, growth',
  Gale: 'Evasion (Aerial/Alert), small fast units',
  Light: 'Protection, lifegain (Siphon), buffs',
  Shadow: 'Removal, Forfeit synergy, ash-pile recursion',
  Void: 'Banish effects, denial, high-cost payoffs',
};

/** Keywords thematically at home in each Essence Type — used by the card
 * pool to pick on-color keywords for a card's rolled cost, and by the deck
 * builder to score archetype fit. Not a legality rule. */
export const KEYWORDS_OF_COLOR: Record<Color, string[]> = {
  Ember: ['Reckless', 'Overrun', 'Quickstrike'],
  Tide: ['Ambush', 'Warded', 'Aerial'],
  Root: ['Swarmproof', 'Unbreakable', 'Overrun', 'Regenerate'],
  Gale: ['Aerial', 'Alert', 'Skywatch'],
  Light: ['Siphon', 'Skywatch', 'Warded', 'Regenerate'],
  Shadow: ['Venomous', 'Doublestrike'],
  Void: ['Immobile', 'Unbreakable', 'Ambush', 'Hardened'],
};

/**
 * v6.9 new-generation keyword per Essence Type. Held in its own table rather
 * than appended to KEYWORDS_OF_COLOR above on purpose: `pick()` indexes those
 * lists modulo their length, so growing them would re-roll the keyword of
 * EVERY card in the pool and invalidate the per-card balance tables. The card
 * pool instead rolls separately for whether a card takes its colour's new
 * keyword (see pickUnitKeywords), so only the cards that opt in re-print.
 */
export const NEW_KEYWORD_OF_COLOR: Record<Color, string> = {
  Ember: 'Wildfire',
  Tide: 'Tidecaller',
  Root: 'Thriving',
  Gale: 'Nimble',
  Light: 'Radiant',
  Shadow: 'Withering',
  Void: 'Entropic',
};

/**
 * A card's color identity: the Essence Types among its cost pips (plus a
 * Location's produced type), stably ordered by COLORS. Empty array =
 * colorless (legal everywhere).
 */
export function cardColors(def: CardDef): Color[] {
  const set = new Set<Color>();
  for (const [t, n] of Object.entries(def.cost?.pips ?? {})) {
    if (n && n > 0) set.add(t as Color);
  }
  if (def.produces) set.add(def.produces);
  return COLORS.filter((c) => set.has(c));
}

/** Leader color identities (2 Essence Types each, all pairs unique). */
export const LEADER_COLORS: Record<string, Color[]> = {
  avatar_of_the_abyss: ['Shadow', 'Void'],
  ethereal_sea_witch: ['Tide', 'Light'],
  mer_king: ['Tide', 'Root'],
  legendary_diver: ['Ember', 'Gale'],
  crimson_vector_commander: ['Ember', 'Light'],
  apex_nanite_shinobi: ['Gale', 'Shadow'],
  ruinwalker_overseer: ['Root', 'Void'],
  sovereign_of_the_dying_star: ['Ember', 'Void'],
  // v7.3: Void Mother was reassigned Unit -> Leader. Without an entry here
  // mapLeader falls back to two hash-picked colours, which can roll the same
  // colour twice (a mono-pip identity no other Leader has). Void first so its
  // minus ability is the Void `Banish` its art and name promise; Shadow
  // second for the plus half.
  void_mother: ['Void', 'Shadow'],
};

/** Deck legality: every colored pip on the card must be inside the Leader's
 * identity. Colorless cards are always legal. */
export function isColorLegal(def: CardDef, identity: Color[]): boolean {
  return cardColors(def).every((c) => identity.includes(c));
}
