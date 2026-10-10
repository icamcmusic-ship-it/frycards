/**
 * Universal card identity — the only data shared between the backend card
 * catalog and the game. All FryCards Poker mechanics (tier, keywords, Leader
 * nerve abilities, Location rules) live on `CardDef` in
 * `src/game/poker/cards.ts` and are assigned from this identity by
 * `src/game/poker/cardpool.ts`.
 */
export type CardType = 'Leader' | 'Unit' | 'Location' | 'Item' | 'Event';

export type Rarity =
  'Common' | 'Uncommon' | 'Rare' | 'Super-Rare' | 'Ultra-Rare' | 'Full-Art' | 'Alt-Art' | 'Mythic';

/** Ladder order, low to high — kept in sync with `RARITY_ORDER` in meta/rarity.ts. */
export const RARITIES: Rarity[] = [
  'Common',
  'Uncommon',
  'Rare',
  'Super-Rare',
  'Ultra-Rare',
  'Full-Art',
  'Alt-Art',
  'Mythic',
];

/**
 * Creator overrides for a card's DERIVED poker mechanics.
 *
 * Mechanics are generated deterministically from `id|type|rarity` — that is
 * what makes them identical on every client and a rebalance a code change.
 * An override replaces one or more generated values on one card. It lives on
 * the TEMPLATE because the template is the only thing the game client loads.
 * Deleting an override restores the generated card exactly. A creator
 * submission sets identity plus an optional star hint (`tier`); everything
 * else stays generated unless Fry overrides it here.
 *
 * Type-only import: this module still ships no game logic.
 */
export type CardOverrides = Partial<{
  tier: number;
  effect: import('./game/poker/cards').KwRef;
  mods: import('./game/poker/cards').KwRef[];
  subtype: import('./game/poker/cards').CardSubtype;
  text: string;
}>;

/** The override fields the Creator's editor exposes, in the order it shows
 * them. Anything not listed here stays generated. */
export const OVERRIDABLE_FIELDS = ['tier', 'effect', 'mods', 'subtype', 'text'] as const;

export interface CardTemplate {
  id: string;
  name: string;
  type: CardType;
  rarity?: Rarity;
  /** Set name, e.g. "Blue Coral". */
  set?: string;
  /** Card art URL. */
  image?: string;
  /** Pure flavor text — carries no rules meaning. */
  flavor?: string;
  /** Creator overrides layered over the generated mechanics — see above. */
  overrides?: CardOverrides;
}
