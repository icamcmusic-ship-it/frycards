/**
 * Universal card identity — the only data shared between the backend card
 * catalog and the game. All FryCards v4.2 dice-placement mechanics (Cast
 * Slots, ATK/HP, keywords, effects) live on `CardDef` in `src/game/v3/cards.ts`
 * and are assigned from this identity by `src/game/v3/cardpool.ts`.
 */
export type CardType = 'Leader' | 'Unit' | 'Location' | 'Charm' | 'Event';

export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Super-Rare' | 'Ultra-Rare' | 'Mythic';

export const RARITIES: Rarity[] = [
  'Common',
  'Uncommon',
  'Rare',
  'Super-Rare',
  'Ultra-Rare',
  'Mythic',
];

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
}
