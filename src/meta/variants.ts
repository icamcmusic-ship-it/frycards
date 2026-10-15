/**
 * Card variants: cosmetic versions of an existing card (same card, same game
 * mechanics, different look and value), rolled per pack card independently
 * of foil. Mirrors supabase/migrations/20261013000010_card_variants.sql —
 * `variant_mult`, `card_variant_colour` and `roll_card_variant` there.
 *
 * Kept tiny and dependency-free: it is imported by eager code (collection
 * filters, market rows) while the overlay renderer itself
 * (src/components/variants/VariantLayer.tsx) is lazy-loaded.
 *
 * Names (v2, animated): ids are the stored values and never change, so the
 * display names can: shattered = Smash Cut, ember_sparks = Grease Fire,
 * tide_frost = Flash Freeze, root_overgrown = Overgrowth, gale_lightning =
 * Crosswind, light_radiant = Headliner, shadow_ink = Ink Spill, void_rift =
 * Null Tear.
 *
 * ART DROP-IN: each overlay is drawn procedurally (seeded per card id). To
 * replace one with painted art, upload a transparent 750x1050 WebP to
 * `https://frycards-art.pages.dev/Overlays/<variant>.webp` (e.g.
 * `Overlays/ember_sparks.webp`). The renderer probes that URL once per
 * session; when it loads, the image is laid over the card instead of the
 * procedural ink (Smash Cut keeps its shard split and lays the image on top).
 * Nothing else needs to change.
 */

export const CARD_VARIANTS = [
  'shattered',
  'ember_sparks',
  'tide_frost',
  'root_overgrown',
  'gale_lightning',
  'light_radiant',
  'shadow_ink',
  'void_rift',
] as const;

export type CardVariant = (typeof CARD_VARIANTS)[number];

export type ElementalVariant = Exclude<CardVariant, 'shattered'>;

export interface VariantMeta {
  id: CardVariant;
  name: string;
  /** The one colour an elemental can roll on; null = any colour. */
  colour: string | null;
  mult: number;
  /** Chance per pack card (elementals: per card of the paired colour). */
  odds: number;
  /** Short badge text. */
  short: string;
  /** Pop accent for badges. */
  hex: string;
  blurb: string;
}

export const SHATTERED_ODDS = 1 / 150;
export const ELEMENTAL_ODDS = 1 / 40;
export const SHATTERED_MULT = 6;
export const ELEMENTAL_MULT = 3;

export const VARIANT_META: Record<CardVariant, VariantMeta> = {
  shattered: {
    id: 'shattered',
    name: 'Smash Cut',
    colour: null,
    mult: SHATTERED_MULT,
    odds: SHATTERED_ODDS,
    short: 'SMASH',
    hex: '#E5E7EB',
    blurb:
      'Cracked clean through. The shards drift apart as you tilt it, and light runs along the breaks.',
  },
  ember_sparks: {
    id: 'ember_sparks',
    name: 'Grease Fire',
    colour: 'Ember',
    mult: ELEMENTAL_MULT,
    odds: ELEMENTAL_ODDS,
    short: 'FLAME',
    hex: '#FF6A2B',
    blurb: 'The fryer caught. Flames lick up the frame and embers float off the edges.',
  },
  tide_frost: {
    id: 'tide_frost',
    name: 'Flash Freeze',
    colour: 'Tide',
    mult: ELEMENTAL_MULT,
    odds: ELEMENTAL_ODDS,
    short: 'RIME',
    hex: '#38D6FF',
    blurb: 'Rime creeps in from the corners. Catch the light and a glint runs across the ice.',
  },
  root_overgrown: {
    id: 'root_overgrown',
    name: 'Overgrowth',
    colour: 'Root',
    mult: ELEMENTAL_MULT,
    odds: ELEMENTAL_ODDS,
    short: 'VINE',
    hex: '#7CFF4F',
    blurb: 'Vines have claimed the frame. The leaves sway, and spores drift up past the art.',
  },
  gale_lightning: {
    id: 'gale_lightning',
    name: 'Crosswind',
    colour: 'Gale',
    mult: ELEMENTAL_MULT,
    odds: ELEMENTAL_ODDS,
    short: 'GUST',
    hex: '#2DF5D0',
    blurb: 'A gale tears across the card. Gust lines streak past, and scraps tumble with them.',
  },
  light_radiant: {
    id: 'light_radiant',
    name: 'Headliner',
    colour: 'Light',
    mult: ELEMENTAL_MULT,
    odds: ELEMENTAL_ODDS,
    short: 'HALO',
    hex: '#E6FF2E',
    blurb: 'Top billing. Stage rays sweep behind the art, and a halo crowns the card.',
  },
  shadow_ink: {
    id: 'shadow_ink',
    name: 'Ink Spill',
    colour: 'Shadow',
    mult: ELEMENTAL_MULT,
    odds: ELEMENTAL_ODDS,
    short: 'INK',
    hex: '#B98CFF',
    blurb: 'Ink seeps in from the edges and drips from the top. Smoke curls off it.',
  },
  void_rift: {
    id: 'void_rift',
    name: 'Null Tear',
    colour: 'Void',
    mult: ELEMENTAL_MULT,
    odds: ELEMENTAL_ODDS,
    short: 'TEAR',
    hex: '#D9DCE3',
    blurb: 'Reality ripped open over the art. Tilt it to look into the void behind it.',
  },
};

export const ELEMENTAL_VARIANTS = CARD_VARIANTS.filter(
  (v): v is ElementalVariant => v !== 'shattered',
);

export function isCardVariant(v: unknown): v is CardVariant {
  return typeof v === 'string' && (CARD_VARIANTS as readonly string[]).includes(v);
}

/** Normalises a server value (null / '' / unknown) to a variant or null. */
export function asVariant(v: unknown): CardVariant | null {
  return isCardVariant(v) ? v : null;
}

export function variantName(v: CardVariant | null | undefined): string | null {
  return v ? VARIANT_META[v].name : null;
}

/** Value multiplier; stacks with foil's x2.5 (foil + variant = both). */
export function variantMult(v: CardVariant | null | undefined): number {
  return v ? VARIANT_META[v].mult : 1;
}

/** The elemental paired to a colour (Ember -> ember_sparks, ...). */
export function elementalForColour(colour: string): ElementalVariant | null {
  return ELEMENTAL_VARIANTS.find((v) => VARIANT_META[v].colour === colour) ?? null;
}

/** Variants a card of these colours can roll. */
export function variantsForColours(colours: readonly string[]): CardVariant[] {
  const out: CardVariant[] = ['shattered'];
  for (const c of colours) {
    const e = elementalForColour(c);
    if (e && !out.includes(e)) out.push(e);
  }
  return out;
}

/**
 * Chance a single pack card of these colours comes out as any variant,
 * matching roll_card_variant: Shattered first, then (if not) an elemental.
 */
export function variantChanceForColours(colours: readonly string[]): number {
  const anyElemental = colours.some((c) => elementalForColour(c));
  return SHATTERED_ODDS + (1 - SHATTERED_ODDS) * (anyElemental ? ELEMENTAL_ODDS : 0);
}

/** Painted-art drop-in location (see header). */
export const VARIANT_ART_BASE = 'https://frycards-art.pages.dev/Overlays';
export function variantArtUrl(v: CardVariant): string {
  return `${VARIANT_ART_BASE}/${v}.webp`;
}

/** A player's variant copies of one card, as stored in player_card_variants. */
export interface OwnedVariant {
  card_id: string;
  foil: boolean;
  variant: CardVariant;
  quantity: number;
}

/** Collection key: card + foil + variant are separate entries. */
export function variantKey(cardId: string, foil: boolean, variant: CardVariant | null): string {
  return `${cardId}|${foil ? 'f' : 'n'}|${variant ?? ''}`;
}
