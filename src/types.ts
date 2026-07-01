export type ElementColor = 'Light' | 'Dark' | 'Frost' | 'Flame' | 'Tech' | 'Nature' | 'Order' | 'Chaos' | 'Generic';
export type CardType = 'Leader' | 'Unit' | 'Location' | 'Item' | 'Charm' | 'Event';

export interface CardCost {
  [element: string]: number;
}

export interface CardTemplate {
  id: string;
  name: string;
  type: CardType;
  elements: ElementColor[];
  cost?: CardCost;
  health?: number;
  attack?: number;
  keywords?: string[];
  text?: string;
}

export interface GameCard extends CardTemplate {
  instanceId: string;
  ownerId: string;
  damageTaken: number;
  exhausted: boolean;
  summoningSickness: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  leader: GameCard;
  deck: GameCard[];
  hand: GameCard[];
  graveyard: GameCard[];
  board: GameCard[];
  locations: GameCard[];
  resources: Record<string, number>;
  mulliganKept: boolean;
  health: number;
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
    targetId: string; // leader or unit
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
  turnNumber: number;
  phase: Phase;
  activeLocation: GameCard | null;
  combat: CombatState | null;
  pendingRoll: number | null;
  winner: string | null;
  log: string[];
}
