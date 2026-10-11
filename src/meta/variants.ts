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
 * ART DROP-IN: each overlay is drawn procedurally (seeded per card id). To
 * replace one with painted art, upload a transparent 750x1050 WebP to
 * `https://frycards-art.pages.dev/Overlays/<variant>.webp` (e.g.
 * `Overlays/ember_sparks.webp`). The renderer probes that URL once per
 * session; when it loads, the image is laid over the card instead of the
 * procedural SVG (Shattered keeps its shard split and lays the image on top).
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
    name: 'Shattered',
    colour: null,
    mult: SHATTERED_MULT,
    odds: SHATTERED_ODDS,
    short: 'SHAT',
    hex: '#E5E7EB',
    blurb: 'Split into shards that shift as you move it.',
  },
  ember_sparks: {
    id: 'ember_sparks',
    name: 'Ember Sparks',
    colour: 'Ember',
    mult: ELEMENTAL_MULT,
    odds: ELEMENTAL_ODDS,
    short: 'SPARK',
    hex: '#F97316',
    blurb: 'Sparks and a glowing heat edge.',
  },
  tide_frost: {
    id: 'tide_frost',
    name: 'Tide Frost',
    colour: 'Tide',
    mult: ELEMENTAL_MULT,
    odds: ELEMENTAL_ODDS,
    short: 'FROST',
    hex: '#38BDF8',
    blurb: 'Frost creeping in from the edges, ice-crystal corners.',
  },
  root_overgrown: {
    id: 'root_overgrown',
    name: 'Root Overgrown',
    colour: 'Root',
    mult: ELEMENTAL_MULT,
    odds: ELEMENTAL_ODDS,
    short: 'VINE',
    hex: '#22C55E',
    blurb: 'Vines and leaves wrapping the border.',
  },
  gale_lightning: {
    id: 'gale_lightning',
    name: 'Gale Lightning',
    colour: 'Gale',
    mult: ELEMENTAL_MULT,
    odds: ELEMENTAL_ODDS,
    short: 'BOLT',
    hex: '#FACC15',
    blurb: 'Forking bolts with a flash where they strike.',
  },
  light_radiant: {
    id: 'light_radiant',
    name: 'Light Radiant',
    colour: 'Light',
    mult: ELEMENTAL_MULT,
    odds: ELEMENTAL_ODDS,
    short: 'HALO',
    hex: '#FDE68A',
    blurb: 'Sunburst rays from behind the art and a halo edge.',
  },
  shadow_ink: {
    id: 'shadow_ink',
    name: 'Shadow Ink',
    colour: 'Shadow',
    mult: ELEMENTAL_MULT,
    odds: ELEMENTAL_ODDS,
    short: 'INK',
    hex: '#A855F7',
    blurb: 'Ink bleeding in from the edges, smoky tendrils.',
  },
  void_rift: {
    id: 'void_rift',
    name: 'Void Rift',
    colour: 'Void',
    mult: ELEMENTAL_MULT,
    odds: ELEMENTAL_ODDS,
    short: 'RIFT',
    hex: '#EC4899',
    blurb: 'A torn hole with stars showing through.',
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
