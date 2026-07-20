/**
 * v4.13/v4.14: card colors (MTG-style) — a deckbuilding-legal strategic
 * identity layered on top of the existing keyword system, NOT a
 * replacement for it. Keywords stay the mechanical vocabulary; colors
 * group keywords into broader playstyle lanes and give each Leader a color
 * identity that deck legality (`DeckBuilderScreen.validateDeckList`)
 * enforces — see `docs/COLOR_IDENTITY.md` for the full design rationale,
 * card-color/Leader-identity audit, and (§6) the v4.14 expansion from 5 to
 * 7 colors documented below.
 *
 * v4.14: expanded 5→7. Renamed Umbral→Obsidian and Radiant→Prism (same
 * keywords, new names — Prism was renamed off "Radiant" specifically so it
 * wouldn't read as a near-synonym of the new Solar color). Split
 * Crescendo/Foothold/Contested/Snap off Prism into a new Solar color
 * (situational/opportunistic-timing, vs. Prism's direct dice-pattern
 * synergy). Added Slate — a true colorless catch-all for cards with no
 * color-mapped keyword (replaces the old guessed-color `COLOR_OF_ACTION`
 * fallback; a Slate card is legal in every Leader's deck by definition,
 * same as a colorless card in MTG — see `isColorLegal`).
 *
 * Assignment is derived, not hashed: a card's color(s) come straight from
 * whichever already-assigned keywords it carries (`cardpool.ts`'s
 * `primaryKw`/secondary-keyword picks), so this file adds zero new
 * hash-assignment surface and can never desync from a card's real keywords.
 */
import { CardDef } from './cards';

export type Color =
  | 'Crimson'
  | 'Azure'
  | 'Verdant'
  | 'Obsidian'
  | 'Prism'
  | 'Solar'
  | 'Slate';

export const COLORS: Color[] = [
  'Crimson',
  'Azure',
  'Verdant',
  'Obsidian',
  'Prism',
  'Solar',
  'Slate',
];

export const COLOR_IDENTITY: Record<Color, string> = {
  Crimson: 'Aggro / burst damage',
  Azure: 'Control / defense',
  Verdant: 'Ramp / growth',
  Obsidian: 'Attrition / value (formerly Umbral)',
  Prism: 'Dice-pattern synergy / tempo (formerly Radiant)',
  Solar: 'Situational / opportunistic timing',
  Slate: 'Colorless — no color-mapped keyword',
};

/** Every keyword this pool actually assigns, mapped to its color family.
 * Keywords not in this list (Resolve/Ultimate — Leader-only flags with no
 * deck-legality role) simply don't contribute a color. */
export const COLOR_OF_KEYWORD: Record<string, Color> = {
  Frenzy: 'Crimson',
  Swift: 'Crimson',
  Pierce: 'Crimson',
  Overrun: 'Crimson',
  Guard: 'Azure',
  Ward: 'Azure',
  Bulwark: 'Azure',
  Toll: 'Azure',
  Anchor: 'Verdant',
  Excavate: 'Verdant',
  Scrap: 'Verdant',
  Tribute: 'Verdant',
  Echo: 'Obsidian',
  Avenge: 'Obsidian',
  Steel: 'Obsidian',
  Aftershock: 'Obsidian',
  Twin: 'Prism',
  Rally: 'Prism',
  Crescendo: 'Solar',
  Foothold: 'Solar',
  Contested: 'Solar',
  Snap: 'Solar',
};

/**
 * A card's color identity: the color(s) of its keywords (a Unit with a
 * primary keyword in one color family and a secondary keyword in another
 * is genuinely multicolor, mirroring `mapUnit`'s existing primary+secondary
 * keyword assignment in `cardpool.ts`), deduped and stably ordered by
 * `COLORS`. A card with no color-mapped keyword (some keyword-less Charms/
 * Events) is colorless: `['Slate']`, not a guessed themed color.
 */
export function cardColors(def: CardDef): Color[] {
  const set = new Set<Color>();
  for (const kw of def.keywords || []) {
    const c = COLOR_OF_KEYWORD[kw];
    if (c) set.add(c);
  }
  if (set.size === 0) return ['Slate'];
  return COLORS.filter((c) => set.has(c));
}

/**
 * Leader color identities — derived from each Leader's existing archetype
 * roster in `scripts/simulate-v4.ts` (the keyword pair each archetype
 * leans on), picked as the 2 colors covering the most of that Leader's
 * archetype keyword-instances, with ties broken toward whichever pair no
 * other Leader already has. See `docs/COLOR_IDENTITY.md` §6 for the full
 * v4.14 re-derivation (every one of the 8 pairs below is now unique — the
 * v4.13 Avatar of the Abyss / Apex Nanite Shinobi identity collision is
 * fixed). Slate is colorless and never appears in a Leader identity.
 */
export const LEADER_COLORS: Record<string, Color[]> = {
  avatar_of_the_abyss: ['Verdant', 'Prism'],
  ethereal_sea_witch: ['Azure', 'Verdant'],
  mer_king: ['Azure', 'Obsidian'],
  legendary_diver: ['Crimson', 'Prism'],
  crimson_vector_commander: ['Crimson', 'Azure'],
  apex_nanite_shinobi: ['Verdant', 'Obsidian'],
  ruinwalker_overseer: ['Azure', 'Solar'],
  sovereign_of_the_dying_star: ['Obsidian', 'Crimson'],
};

/** True if every color `cardColors(def)` returns is within `identity` — the
 * deck-legality rule DeckBuilderScreen enforces. `Slate` (colorless) is
 * always legal regardless of identity, same as a colorless card in MTG. */
export function isColorLegal(def: CardDef, identity: Color[]): boolean {
  return cardColors(def).every((c) => c === 'Slate' || identity.includes(c));
}
