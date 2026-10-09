/**
 * FryCards Poker card model (Design Spec v0.1).
 *
 * Kept from the MTG-style game: every card's id, name, type, rarity, set, art,
 * flavor text and colour. Replaced: every mechanic. Mechanics are generated
 * from a hash of the card id, type and rarity (cardpool.ts), so a rebalance
 * ships as a code change.
 *
 *  - Units carry STARS, Items GEARS, Events BOLTS, each 1–5 (the tier). The
 *    tier sets the chip cost and the keyword numbers.
 *  - A Location is a table rule (the table's weather), not a power.
 *  - A Leader is a persona plus two nerve abilities.
 */
import type { Color } from './colors';
import type { Keyword } from './keywords';

export type CardType = 'Leader' | 'Unit' | 'Location' | 'Item' | 'Event';

export type Rarity =
  'Common' | 'Uncommon' | 'Rare' | 'Super-Rare' | 'Ultra-Rare' | 'Full-Art' | 'Alt-Art' | 'Mythic';

/**
 * Item subtypes:
 *  - `Charm`  — lasts this hand, then discards.
 *  - `Weapon` — returns to your hand after use.
 *  - `Tool`   — also marks one opponent hole card (you learn it).
 * An Item bonds to your Unit; with no Unit out it bonds to a hole card at
 * one cost step more.
 */
export type ItemSubtype = 'Charm' | 'Weapon' | 'Tool';
/** Event subtypes: Quick = short windows during betting (and your turn);
 * Slow = your own turn, before you act on a street. */
export type EventSubtype = 'Quick' | 'Slow';
export type CardSubtype = ItemSubtype | EventSubtype;

/** A keyword with its number (chip keywords in units, others a count). */
export interface KwRef {
  kw: Keyword;
  n?: number;
}

export type PowerType = 'Unit' | 'Item' | 'Event';
export const POWER_TYPES: PowerType[] = ['Unit', 'Item', 'Event'];

export function isPower(def: Pick<CardDef, 'type'>): boolean {
  return def.type === 'Unit' || def.type === 'Item' || def.type === 'Event';
}

/** Tier mark per power type. */
export const TIER_MARK: Record<PowerType, { name: string; plural: string; glyph: string }> = {
  Unit: { name: 'star', plural: 'stars', glyph: '★' },
  Item: { name: 'gear', plural: 'gears', glyph: '⚙' },
  Event: { name: 'bolt', plural: 'bolts', glyph: 'ϟ' },
};

/** A Leader ability: one spends nerve (strong), one builds it (weaker,
 * riskier). One Leader ability per hand. */
export interface LeaderAbility {
  /** Nerve change: negative spends, positive builds. */
  nerve: number;
  effect: KwRef;
  mods?: KwRef[];
  /** Build abilities carry a risk: they cost chips into the pot. */
  chipCost?: number;
  text: string;
}

export type LocationRuleId =
  | 'plain'
  | 'highStakes'
  | 'openHand'
  | 'doubleBoard'
  | 'nightGame'
  | 'dealersChoice'
  | 'houseRake'
  | 'bombPot'
  | 'pineapple'
  | 'straddleNight'
  | 'reverseOrder'
  | 'openTable'
  | 'fog'
  | 'happyHour'
  | 'silentTable'
  | 'jackpotPit'
  | 'shortBoard'
  | 'tiltZone';

export interface LocationRule {
  id: LocationRuleId;
  /** Template parameter varied by the card hash (blind multiplier, ante…). */
  param?: number;
}

export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  subtype?: CardSubtype;
  rarity?: Rarity;
  set?: string;
  image?: string;
  flavor?: string;

  /** Colour identity, unchanged from the MTG-style game. [] = colourless. */
  colors: Color[];

  // -- Powers (Unit / Item / Event) --
  /** Stars / gears / bolts, 1–5. */
  tier?: number;
  /** The one effect keyword. */
  effect?: KwRef;
  /** Modifier keywords. */
  mods?: KwRef[];

  // -- Leader --
  abilities?: LeaderAbility[];

  // -- Location --
  rule?: LocationRule;

  /** Flat keyword names (effect + modifiers, Leader ability keywords) for
   * filters, chips and search. */
  keywords?: string[];
  /** Printed rules text, generated from the mechanics. */
  text?: string;
}

export function hasKw(def: Pick<CardDef, 'effect' | 'mods'>, kw: Keyword): boolean {
  return def.effect?.kw === kw || !!def.mods?.some((m) => m.kw === kw);
}

export function modN(def: Pick<CardDef, 'mods'>, kw: Keyword): number | undefined {
  return def.mods?.find((m) => m.kw === kw)?.n;
}

/** "3★", "2⚙", "4ϟ" — the tier as printed. */
export function tierLabel(def: Pick<CardDef, 'type' | 'tier'>): string {
  if (!def.tier || !isPower(def)) return '';
  return `${def.tier}${TIER_MARK[def.type as PowerType].glyph}`;
}
