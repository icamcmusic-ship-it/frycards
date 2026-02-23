

export interface Profile {
  id: string;
  username: string;
  gold_balance: number;
  gem_balance: number;
  xp: number;
  level: number;
  packs_opened: number;
  pity_counter: number;
  daily_streak: number;
  last_daily_claim: string | null;
  // New fields from audit
  avatar_url?: string;
  banner_url?: string;
  card_back_url?: string;
  bio?: string;
  is_public?: boolean;
  total_trades?: number;
  total_quicksells?: number;
  energy?: number;
  max_energy?: number;
  energy_last_regen?: string;
}

export interface UserSettings {
  user_id: string;
  sfx_volume: number;
  music_volume: number;
  sfx_enabled: boolean;
  music_enabled: boolean;
  low_perf_mode: boolean;
  notifications_enabled: boolean;
  trade_notifications: boolean;
  auction_notifications: boolean;
  friend_notifications: boolean;
  show_online_status: boolean;
}

export interface Card {
  id: string;
  name: string;
  rarity: 'Common' | 'Uncommon' | 'Rare' | 'Super-Rare' | 'Mythic' | 'Divine';
  card_type: string; // Unit, Event, Location, Artifact, Leader
  image_url: string;
  is_video: boolean;
  flavor_text?: string;
  description?: string;
  
  // Dice Command 6.0 Mechanics
  dice_cost?: number; // Number of dice required or specific value
  bounty?: number; // Damage taken by owner when unit is destroyed (0 for tokens)
  strength?: number; // Replaces Attack
  durability?: number; // Replaces HP/Defense
  
  keywords?: string[]; // Guardian, Airborne, Scavenge, Swarm, etc.
  ability_text?: string;
  ability_type?: string; // Authority (Leader), Edict (Leader), Arrival, Deathrattle, Passive, Burst, Chain, Flux
  
  element?: 'fire' | 'ice' | 'void' | 'nature' | 'tech' | 'shadow' | 'holy' | 'neutral';
  sub_type?: string; 

  // Legacy mappings for backend compatibility
  hp?: number; 
  attack?: number;
  defense?: number;

  // RPC Computed Fields (Joined Data)
  is_new?: boolean;
  quantity?: number;
  set_name?: string;
  is_foil?: boolean; 
  foil_quantity?: number; 
  first_acquired?: string;
  
  // New fields
  is_locked?: boolean;
  is_wishlisted?: boolean;
}

export interface Deck {
  id: string;
  name: string;
  leader_id?: string; // New: 6.0 requires a distinct leader
  card_ids: string[]; // Main deck (25 cards)
  cards?: Card[];
  leader?: Card; // Hydrated leader
  created_at: string;
  user_id: string;
}

export type DieValue = 1 | 2 | 3 | 4 | 5 | 6;

export interface Die {
  id: string;
  value: DieValue;
  isLocked: boolean;
  isUsed: boolean;
  isReserve: boolean; // From previous turn
}

export interface PlayerState {
  hp: number; // Command (Starts at 20)
  maxHp: number;
  dice: Die[];
  rerolls: number; // Max 2
  reserveDie: DieValue | null; // Banked die
  hand: Card[];
  field: Card[]; // Units and Artifacts
  leader: Card | null;
  location: Card | null; // Max 1
  graveyard: Card[];
  deckCount: number;
}

export interface BattleState {
  phase: 'START' | 'DRAW' | 'ROLL' | 'FOCUS' | 'COMMAND' | 'ASSAULT' | 'END';
  player: PlayerState;
  opponent: PlayerState;
  turnCount: number;
  isPlayerTurn: boolean;
  log: string[];
  isFinished: boolean;
  winner?: 'player' | 'opponent';
}

export interface PackType {
  id: string;
  name: string;
  description: string;
  cost_gold: number | null;
  cost_gems: number | null;
  card_count: number;
  guaranteed_rarity: string | null;
  image_url: string;
  foil_chance?: number; 
  has_foil_slot?: boolean; 
}

export interface Mission {
  id: string;
  mission_type: string;
  description: string;
  progress: number;
  target: number;
  reward_gold: number;
  reward_gems: number;
  reward_xp: number;
  is_completed: boolean;
  completion_percentage: number;
}

export interface Quest {
  id: string;
  title: string;
  description: string;
  status: 'in_progress' | 'completed' | 'claimed';
  difficulty: 'easy' | 'medium' | 'hard' | 'legendary';
  current_value: number;
  target_value: number;
  reward_gold: number;
  reward_gems: number;
  reward_xp: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  is_unlocked: boolean;
  unlocked_at: string | null;
  reward_gold: number;
  reward_gems: number;
}

export interface DashboardData {
  profile: Profile;
  stats: {
    total_cards: number;
    unique_cards: number;
    total_possible: number;
    completion_percentage: number;
    rarity_breakdown: any[];
    set_completion: any[];
  };
  missions: Mission[];
  can_claim_daily: boolean;
}

export interface PackResult {
  success: boolean;
  cards: Card[];
  new_card_count: number;
  xp_gained: number;
  pity_triggered: boolean;
  next_pity_in: number;
}

export interface AffordabilityCheck {
  can_afford: boolean;
  gold_needed: number;
  gems_needed: number;
}

export interface MarketListing {
  id: string;
  seller_id: string;
  seller_username: string;
  card_id: string;
  card: Card;
  listing_type: 'fixed' | 'auction' | 'fixed_price';
  price: number;
  current_bid?: number;
  min_bid_increment?: number;
  buy_now_price?: number;
  currency: 'gold' | 'gems';
  expires_at: string;
  created_at: string;
  status: 'active' | 'sold' | 'expired' | 'cancelled';
  high_bidder_id?: string;
  is_watched?: boolean; // Front-end computed
}

export interface DailyRewardResult {
  success: boolean;
  gold_earned: number;
  gems_earned: number;
  streak: number;
}

export interface LeaderboardEntry {
  rank: number;
  user_id: string;
  username: string;
  avatar_url?: string; 
  banner_url?: string; 
  unique_cards?: number;
  total_cards?: number;
  completion_percentage?: number;
  level?: number;
  xp?: number;
  packs_opened?: number;
}

export interface Friend {
  id: string; 
  friend_id: string;
  username: string;
  avatar_url?: string;
  status: 'accepted' | 'pending';
  is_online?: boolean; 
}

export interface PendingRequest {
  id: string;
  from_user_id: string;
  from_username: string;
  from_avatar_url?: string;
  created_at: string;
}

export interface TradeOffer {
  id: string;
  sender_id: string;
  sender_username: string;
  receiver_id: string;
  receiver_username: string;
  sender_cards: Card[]; 
  sender_gold: number;
  receiver_cards: Card[];
  receiver_gold: number;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired';
  created_at: string;
  expires_at: string;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  type: 'banner' | 'avatar' | 'card_back' | 'avatar_frame' | 'title' | 'profile_banner' | 'misc';
  image_url: string;
  cost_gold: number | null;
  cost_gems: number | null;
  is_owned: boolean;
  is_equipped: boolean;
  rarity: 'Common' | 'Rare' | 'Legendary';
  user_item_id?: string; // The specific instance ID needed for equipping
}

export interface CardBack {
  id: string;
  name: string;
  description: string;
  image_url: string;
  price: number;
  is_active: boolean;
  created_at: string;
}

export interface PublicProfile {
  id: string;
  username: string;
  avatar_url?: string;
  banner_url?: string;
  bio?: string;
  level: number;
  created_at: string;
  total_trades: number;
  stats: {
    total_cards: number;
    unique_cards: number;
  };
  social: {
    followers: number;
    following: number;
    is_following: boolean;
    is_friend: boolean;
    friendship_status?: string;
    friends: number;
  };
  featured_cards?: Card[];
}

export interface ChatMessage {
  id: string;
  user_id: string;
  username: string;
  avatar_url?: string;
  message: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'trade_accepted' | 'trade_declined' | 'outbid' | 'auction_won' | 'friend_request' | 'system';
  title: string;
  body: string;
  is_read: boolean;
  action_url: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export interface BidRecord {
  id: string;
  bidder_id: string;
  username: string;
  avatar_url: string | null;
  bid_gold: number;
  bid_gems: number;
  bid_time: string;
  is_winning: boolean;
}

export interface UserSeasonPass {
  id: string;
  user_id: string;
  season: number;
  is_premium: boolean;
  xp_earned: number;
  claimed_tiers: number[];
  purchased_at: string | null;
}
