export type ElementColor = 'Light' | 'Dark' | 'Frost' | 'Flame' | 'Tech' | 'Nature' | 'Order' | 'Chaos' | 'Generic';
export type CardType = 'Leader' | 'Unit' | 'Location' | 'Item' | 'Charm' | 'Event';
export type Rarity = 'Common' | 'Uncommon' | 'Rare' | 'Super-Rare' | 'Legendary' | 'Mythic';

export interface CardCost {
  [element: string]: number;
}

/** Structured effect executed by Event cards (see glossary §3 Action Verbs). */
export interface EventEffect {
  action:
    | 'damage'
    | 'freeze'
    | 'scorch'
    | 'heal'
    | 'draw'
    | 'obliterate'
    | 'manifest'
    | 'buff'
    | 'meltdown'
    | 'purge';
  value?: number;
  /** who/what the effect needs: an enemy unit, the enemy leader, a friendly unit, or self. */
  target?: 'unit' | 'leader' | 'friendly' | 'self';
  text?: string;
}

/** Bonus stats an Item grants to the Unit it is attached to. */
export interface AttachBonus {
  attack: number;
  health: number;
}

export type LocationEffect = 'ATK_ALL' | 'HP_ALL' | 'SCORCH_ALL';

export interface CardTemplate {
  id: string;
  name: string;
  type: CardType;
  elements: ElementColor[];
  rarity?: Rarity;
  set?: string;
  cost?: CardCost;
  health?: number;
  attack?: number;
  keywords?: string[];
  text?: string;
  image?: string;
  effect?: EventEffect;
  attach?: AttachBonus;
  locEffect?: LocationEffect;
  /** duration for Charm cards (1-3). */
  duration?: number;
}

export interface GameCard extends CardTemplate {
  instanceId: string;
  ownerId: string;
  /** permanent damage on the unit's base health. */
  damageTaken: number;
  /** damage absorbed by bonus (Item) health, stripped first. */
  bonusDamage: number;
  exhausted: boolean;
  summoningSickness: boolean;
  // Status counters / permanent modifiers
  scorch: number;          // flame damage per start-of-turn tick
  frozen: number;          // >0 = cannot attack/block/activate
  glitched: boolean;       // Glitch: keywords disabled until Cleanup
  armor: number;           // current Armor value (from Armor [X])
  witherAtk: number;       // permanent attack reduction from Wither
  witherHp: number;        // permanent health reduction from Wither
  tempAtk: number;         // temporary buff (until end of turn)
  tempHp: number;
  attacksThisTurn: number; // for Overdrive
  /** true once this card has declared an attack this match (unlocks Lurk targeting §2.1). */
  hasAttacked?: boolean;
  // Items
  attachedItems: GameCard[];
  hostId?: string;         // if this card is an Item attached to a Unit
  isToken?: boolean;
  // Charm bookkeeping
  charmDuration?: number;
  charmActivated?: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  isCPU: boolean;
  leader: GameCard;
  deck: GameCard[];
  hand: GameCard[];
  graveyard: GameCard[];
  board: GameCard[];
  /** face-down location cards in this player's Location Zone. */
  locations: GameCard[];
  charms: GameCard[];
  resources: Record<string, number>;
  mulliganCount: number;
  mulliganKept: boolean;
  health: number;
  overclockPenalty: number; // subtracted from next roll (Overclock)
  /** true when this turn's entire resource roll went to a single color (Pure). */
  singleColorRoll: boolean;
}

export type Phase =
  | 'INIT'
  | 'MULLIGAN'
  | 'TURN_TRANSITION'
  | 'ROLL'
  | 'ALLOCATE'
  | 'ACTION'
  | 'COMBAT_DECLARE'
  | 'COMBAT_BLOCK'
  | 'GAME_OVER';

export interface CombatState {
  attackers: {
    instanceId: string; // unit or leader
    targetId: string;   // enemy leader or unit
  }[];
  blockers: {
    attackerId: string;
    blockerId: string;
  }[];
}

export interface GameState {
  players: Record<string, PlayerState>;
  player1Id: string;
  player2Id: string;
  activePlayerId: string;
  viewingPlayerId: string;
  firstPlayerId: string;
  turnNumber: number;
  phase: Phase;
  activeLocation: GameCard | null;
  /** the player currently treated as controller of the active Location. */
  activeLocationOwnerId: string | null;
  combat: CombatState | null;
  pendingRoll: number | null;
  winner: string | null;
  log: string[];
}
