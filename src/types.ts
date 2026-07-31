/**
 * Universal card identity — the only data shared between the backend card
 * catalog and the game. All FryCards v4.2 dice-placement mechanics (Cast
 * Slots, ATK/HP, keywords, effects) live on `CardDef` in `src/game/v3/cards.ts`
 * and are assigned from this identity by `src/game/v3/cardpool.ts`.
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
 * Creator overrides for a card's DERIVED mechanics (v13).
 *
 * Mechanics are still generated deterministically from `id|type|rarity` — that
 * is what makes them identical on every client and a rebalance a code change.
 * An override is Fry deliberately replacing one or more of those generated
 * values on one card, and it has to live on the TEMPLATE rather than in the
 * `cards` mechanics columns, because the template is the only thing the game
 * client loads; the columns exist for the server's own queries.
 *
 * Type-only import: this module still ships no game logic.
 */
export type CardOverrides = Partial<
  Pick<
    import('./game/v3/cards').CardDef,
    | 'cost'
    | 'might'
    | 'grit'
    | 'keywords'
    | 'subtype'
    | 'text'
    | 'bond'
    | 'rebondCost'
    | 'nerf'
    | 'resolve'
    | 'produces'
    | 'locPassive'
  >
>;

/** The override fields the Creator's editor exposes, in the order it shows
 * them. Anything not listed here stays generated. */
export const OVERRIDABLE_FIELDS = [
  'cost',
  'might',
  'grit',
  'keywords',
  'subtype',
  'rebondCost',
  'nerf',
  'resolve',
  'text',
] as const;

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
