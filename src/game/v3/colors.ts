/**
 * v4.13: card colors (MTG-style) — a deckbuilding-legal strategic identity
 * layered on top of the existing keyword system, NOT a replacement for it.
 * Keywords stay the mechanical vocabulary; colors group keywords into five
 * broader playstyle lanes and give each Leader a color identity that deck
 * legality (`DeckBuilderScreen.validateDeckList`) enforces — see
 * `docs/BALANCE_SIM_FINDINGS_v4.13.md` for the design rationale (Option A
 * of 3 candidate palettes) and `docs/COLOR_IDENTITY.md` for the full
 * card-color/Leader-identity audit this pass produced.
 *
 * Assignment is derived, not hashed: a card's color(s) come straight from
 * whichever already-assigned keywords it carries (`cardpool.ts`'s
 * `primaryKw`/secondary-keyword picks), so this file adds zero new
 * hash-assignment surface and can never desync from a card's real keywords.
 */
import { CardDef } from './cards';

export type Color = 'Crimson' | 'Azure' | 'Verdant' | 'Umbral' | 'Radiant';

export const COLORS: Color[] = ['Crimson', 'Azure', 'Verdant', 'Umbral', 'Radiant'];

export const COLOR_IDENTITY: Record<Color, string> = {
  Crimson: 'Aggro / burst damage',
  Azure: 'Control / defense',
  Verdant: 'Ramp / growth',
  Umbral: 'Attrition / value',
  Radiant: 'Synergy / combo-tempo',
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
  Echo: 'Umbral',
  Avenge: 'Umbral',
  Steel: 'Umbral',
  Aftershock: 'Umbral',
  Twin: 'Radiant',
  Rally: 'Radiant',
  Crescendo: 'Radiant',
  Foothold: 'Radiant',
  Contested: 'Radiant',
  Snap: 'Radiant',
};

/** Fallback for keyword-less Charms/Events/Locations (a slice of the pool
 * carries no strategically-flavored keyword at all — see the color-audit
 * script's tally in `docs/COLOR_IDENTITY.md`), keyed on the card's on-cast
 * effect action so every card still resolves to at least one color. */
const COLOR_OF_ACTION: Record<string, Color> = {
  sap: 'Umbral',
  destroy: 'Umbral',
  buff: 'Radiant',
  mend: 'Verdant',
  bind: 'Azure',
  draw: 'Radiant',
};

/**
 * A card's color identity: the color(s) of its keywords (a Unit with a
 * primary keyword in one color family and a secondary keyword in another
 * is genuinely multicolor, mirroring `mapUnit`'s existing primary+secondary
 * keyword assignment in `cardpool.ts`), deduped and stably ordered by
 * `COLORS`. Falls back to `COLOR_OF_ACTION` only when no keyword maps to a
 * color at all.
 */
export function cardColors(def: CardDef): Color[] {
  const set = new Set<Color>();
  for (const kw of def.keywords || []) {
    const c = COLOR_OF_KEYWORD[kw];
    if (c) set.add(c);
  }
  if (set.size === 0 && def.onCast) {
    const c = COLOR_OF_ACTION[def.onCast.action];
    if (c) set.add(c);
  }
  return COLORS.filter((c) => set.has(c));
}

/**
 * Leader color identities — derived from each Leader's existing archetype
 * roster in `scripts/simulate-v4.ts` (the keyword pair each archetype
 * leans on), picked as the 1-2 colors that cover the most of that Leader's
 * archetype keyword themes. See `docs/COLOR_IDENTITY.md` §2 for the full
 * per-Leader derivation and the archetypes that fell outside the chosen
 * identity (flagged there for a follow-up archetype re-tune, not silently
 * dropped).
 */
export const LEADER_COLORS: Record<string, Color[]> = {
  avatar_of_the_abyss: ['Umbral', 'Verdant'],
  ethereal_sea_witch: ['Azure', 'Verdant'],
  mer_king: ['Azure', 'Umbral'],
  legendary_diver: ['Crimson', 'Radiant'],
  crimson_vector_commander: ['Crimson', 'Azure'],
  apex_nanite_shinobi: ['Umbral', 'Verdant'],
  ruinwalker_overseer: ['Azure', 'Umbral'],
  sovereign_of_the_dying_star: ['Umbral', 'Crimson'],
};

/** True if every color `cardColors(def)` returns is within `identity` — the
 * deck-legality rule DeckBuilderScreen enforces. A colorless card (empty
 * `cardColors`, e.g. a Leader itself, which isn't color-checked separately
 * anyway) is trivially legal everywhere. */
export function isColorLegal(def: CardDef, identity: Color[]): boolean {
  return cardColors(def).every((c) => identity.includes(c));
}
