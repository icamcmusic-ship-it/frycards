/**
 * The seven colours of FryCards. A card's colour is unchanged from the
 * retired MTG-style game (frozen in frozenColors.ts). In poker a colour does
 * two jobs: the Leader's two colours decide which cards a deck may hold
 * (colourless cards fit anywhere), and some keywords are gated by colour.
 */
import type { CardDef } from './cards';

export type Color = 'Ember' | 'Tide' | 'Root' | 'Gale' | 'Light' | 'Shadow' | 'Void';

export const COLORS: Color[] = ['Ember', 'Tide', 'Root', 'Gale', 'Light', 'Shadow', 'Void'];

/** What each colour does at the poker table (Design Spec, "Keywords by color"). */
export const COLOR_IDENTITY: Record<Color, string> = {
  Ember: 'Pressure and chaos: straddles, drains, taxes, gambles',
  Tide: 'Receiving and flow: extra hole cards, redraws, foresight, wild suits',
  Root: 'Growth and endurance: loss caps, delayed effects, run-it-twice',
  Gale: 'Timing and movement: out-of-turn casts, deck cuts, passing cards',
  Light: 'Truth and protection: peeking, reveals, call-outs, insurance',
  Shadow: 'Deception and recursion: feints, veils, decoys, poison',
  Void: 'Denial and removal: burns, locks, snuffs, entropy',
};

/** Leader colour identities (2 each). A Leader missing here falls back to two
 * hash-picked colours (see cardpool.ts). */
export const LEADER_COLORS: Record<string, Color[]> = {
  avatar_of_the_abyss: ['Shadow', 'Void'],
  ethereal_sea_witch: ['Tide', 'Light'],
  mer_king: ['Tide', 'Root'],
  legendary_diver: ['Ember', 'Gale'],
  crimson_vector_commander: ['Ember', 'Light'],
  apex_nanite_shinobi: ['Gale', 'Shadow'],
  ruinwalker_overseer: ['Root', 'Void'],
  sovereign_of_the_dying_star: ['Ember', 'Void'],
  void_mother: ['Void', 'Shadow'],
};

/** A card's colour identity, stably ordered by COLORS. Empty = colourless. */
export function cardColors(def: Pick<CardDef, 'colors'>): Color[] {
  return COLORS.filter((c) => def.colors?.includes(c));
}

/** Deck legality: every colour on the card must be one of the Leader's. */
export function isColorLegal(def: Pick<CardDef, 'colors'>, identity: Color[]): boolean {
  return cardColors(def).every((c) => identity.includes(c));
}
