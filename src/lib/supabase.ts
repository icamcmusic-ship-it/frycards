import { createClient, Session } from '@supabase/supabase-js';
import { CardTemplate } from '../types';

// Public (publishable) credentials for the backend. Safe to ship in the
// client; everything sensitive is protected by RLS + SECURITY DEFINER RPCs.
// Override with VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY.
const SUPABASE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL || 'https://dnngihsbqxccqvvedvjc.supabase.co';
const SUPABASE_KEY =
  (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_oA36yEu7RVuGR2V65ZzYZA_jhOn52bN';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
export type { Session };

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------
export interface CardRow {
  id: string;
  name: string;
  card_type: string;
  rarity: string | null;
  image_url: string | null;
  template: CardTemplate | null;
}

/** Player role/badge. 'creator' = first account (full frontend+backend access);
 * 'founder' = one of the first 25 signups after the Creator (+3,000-credit bonus). */
export type PlayerRole = 'creator' | 'founder' | 'player';

export interface Profile {
  id: string;
  username: string;
  role: PlayerRole;
  credits: number;
  vouchers: number;
  shards: number;
  xp: number;
  level: number;
  wins: number;
  losses: number;
  games_played: number;
  equipped_card_back: string | null;
  equipped_banner: string | null;
  equipped_avatar: string | null;
  last_free_pack_at: string | null;
  showcase_cards: string[];
  /** Consecutive packs opened with no foil pull — the server escalates foil
   * odds by 25% of this per pack (grant_pack_contents), reset to 0 on a hit. */
  foil_pity: number;
  /** Packs opened since the last Full-Art+ pull; a Full-Art+ is guaranteed
   * within 10 (grant_pack_contents' global pity). */
  packs_since_fullart: number;
  /** Same guarantee, but a Mythic within 60 packs. */
  packs_since_mythic: number;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string | null;
  item_type: 'card_back' | 'profile_banner' | 'profile_avatar';
  image_url: string | null;
  cost_credits: number | null;
  cost_vouchers: number | null;
  rarity: string;
  has_foil_variant: boolean;
  foil_cost_multiplier: number;
  is_season_pass_exclusive: boolean;
  aspect_ratio: string;
  author: string | null;
  is_limited: boolean;
}

/** slot_config entries come in two shapes: legacy `{type}` slots whose odds
 * live in the `roll_slot_rarity` SQL function, and the newer explicit shape
 * with `rarity_weights`. The odds viewer understands both. */
export interface PackSlot {
  type?: string;
  slot_type?: string;
  count?: number;
  rarity_weights?: Record<string, number>;
  guaranteed_min_rarity?: string;
  foil_chance_override?: number;
  foil_eligible?: boolean;
  dupe_protected?: boolean;
  pity_key?: string;
  pity_cap?: number;
}

export interface PackType {
  id: string;
  name: string;
  description: string | null;
  card_count: number;
  guaranteed_rarity: string | null;
  image_url: string | null;
  foil_chance: number;
  has_foil_slot: boolean;
  price_credits: number | null;
  price_vouchers: number | null;
  pack_tier: string;
  slot_config: PackSlot[];
  is_active: boolean;
  acquisition: string;
  time_limited: boolean;
  /** Backend-authored pity/guarantee blurb shown in the odds modal, e.g.
   * "Hard pity: a Mythic from the pity slot at least once every 20 Vaults." */
  pity_note: string | null;
}

export interface PlayerCard {
  card_id: string;
  quantity: number;
  foil_quantity: number;
}

export interface PlayerCosmetic {
  shop_item_id: string;
  is_foil: boolean;
}

export interface DeckRow {
  id: string;
  user_id: string;
  name: string;
  leader_id: string;
  card_ids: string[];
  is_valid: boolean;
  updated_at: string;
}

export interface PackPull {
  card_id: string;
  name: string;
  rarity: string;
  card_type: string;
  image_url: string | null;
  foil: boolean;
  slot: string;
  /** True when this pull was past the player's per-rarity copy cap — no
   * card was actually granted, it was auto-converted to `shards` instead. */
  converted_to_shards: boolean;
  /** Shards gained from this specific pull; only nonzero when converted. */
  shards: number;
}

export interface OpenPackResult {
  cards: PackPull[];
  credits: number;
  vouchers: number;
  shards?: number;
  shards_gained?: number;
}

// ---------------------------------------------------------------------------
// Card pool
// ---------------------------------------------------------------------------

/**
 * Load the live card pool from the Supabase `cards` table. Returns null on
 * any failure so callers can fall back to the bundled card set.
 */
export async function fetchCardTemplates(): Promise<CardTemplate[] | null> {
  try {
    const { data, error } = await supabase.from('cards').select('template').order('id');
    if (error || !data) return null;
    const templates = (data as { template: CardTemplate | null }[])
      .map((r) => r.template)
      .filter((t): t is CardTemplate => !!t && !!t.id);
    return templates.length > 0 ? templates : null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Meta-game reads
// ---------------------------------------------------------------------------
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return (data as Profile) || null;
}

export async function fetchShopItems(): Promise<ShopItem[]> {
  const { data } = await supabase
    .from('shop_items')
    .select('*')
    .order('item_type')
    .order('cost_credits');
  return (data as ShopItem[]) || [];
}

export async function fetchPackTypes(): Promise<PackType[]> {
  const { data } = await supabase.from('pack_types').select('*');
  const packs = (data as PackType[]) || [];
  // cheapest first, by whichever currency the pack sells for
  return packs.sort(
    (a, b) =>
      (a.price_credits ?? (a.price_vouchers ?? 0) * 100) - (b.price_credits ?? (b.price_vouchers ?? 0) * 100),
  );
}

export async function fetchCollection(userId: string): Promise<PlayerCard[]> {
  const { data } = await supabase
    .from('player_cards')
    .select('card_id, quantity, foil_quantity')
    .eq('user_id', userId);
  return (data as PlayerCard[]) || [];
}

export async function fetchCosmetics(userId: string): Promise<PlayerCosmetic[]> {
  const { data } = await supabase
    .from('player_cosmetics')
    .select('shop_item_id, is_foil')
    .eq('user_id', userId);
  return (data as PlayerCosmetic[]) || [];
}

export async function fetchDecks(userId: string): Promise<DeckRow[]> {
  const { data } = await supabase
    .from('decks')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  return (data as DeckRow[]) || [];
}

// ---------------------------------------------------------------------------
// Meta-game writes (RPCs)
// ---------------------------------------------------------------------------
function rpcError(error: { message: string } | null): string | null {
  if (!error) return null;
  // strip the postgres error prefix for user display
  return error.message.replace(/^.*?: /, '');
}

export async function openPack(
  packId: string,
  currency: 'credits' | 'vouchers',
): Promise<{ data: OpenPackResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('open_pack', {
    p_pack_id: packId,
    p_currency: currency,
  });
  return { data: (data as OpenPackResult) || null, error: rpcError(error) };
}

export async function buyShopItem(
  itemId: string,
  currency: 'credits' | 'vouchers',
  foil = false,
): Promise<string | null> {
  const { error } = await supabase.rpc('buy_shop_item', {
    p_item_id: itemId,
    p_currency: currency,
    p_foil: foil,
  });
  return rpcError(error);
}

export async function equipCosmetic(itemId: string): Promise<string | null> {
  const { error } = await supabase.rpc('equip_cosmetic', { p_item_id: itemId });
  return rpcError(error);
}

export async function setUsername(name: string): Promise<string | null> {
  const { error } = await supabase.rpc('set_username', { p_name: name });
  return rpcError(error);
}

/** Pin up to 6 owned cards to show off on the profile (own or when viewed by others). */
export async function setShowcaseCards(cardIds: string[]): Promise<string | null> {
  const { error } = await supabase.rpc('set_showcase_cards', { p_card_ids: cardIds });
  return rpcError(error);
}

export async function recordMatchResult(won: boolean): Promise<MatchResult | null> {
  const { data, error } = await supabase.rpc('record_match_result', { p_won: won });
  if (error) return null;
  return data as MatchResult;
}

/**
 * Server-authoritative deck save: the `save_deck` RPC re-checks that every
 * copy of every card is actually available (owned minus whatever the
 * player's *other* decks already reserve) before committing, so the same
 * physical copy can never be locked into two decks at once. Deleting a deck
 * (below) needs no matching "unconsume" step — availability is always
 * computed live from whichever decks still exist.
 */
export async function saveDeck(deck: {
  id?: string;
  name: string;
  leader_id: string;
  card_ids: string[];
}): Promise<{ data: DeckRow | null; error: string | null }> {
  const { data, error } = await supabase.rpc('save_deck', {
    p_deck_id: deck.id ?? null,
    p_name: deck.name,
    p_leader_id: deck.leader_id,
    p_card_ids: deck.card_ids,
  });
  return { data: (data as DeckRow) || null, error: rpcError(error) };
}

export async function deleteDeck(deckId: string): Promise<string | null> {
  const { error } = await supabase.from('decks').delete().eq('id', deckId);
  return error ? error.message : null;
}

export interface QuicksellResult {
  ok: boolean;
  credits: number;
  card_id: string;
  sold: number;
  foil: boolean;
  unit_price: number;
  total: number;
}

export interface CraftResult {
  ok: boolean;
  shards: number;
  cost: number;
}

export interface DisenchantResult {
  ok: boolean;
  shards: number;
  gained: number;
}

/** Spend shards to craft a specific card (see shard_craft_cost for pricing). */
export async function craftCard(
  cardId: string,
  foil = false,
): Promise<{ data: CraftResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('craft_card', { p_card_id: cardId, p_foil: foil });
  return { data: (data as CraftResult) || null, error: rpcError(error) };
}

/** Break down spare copies of a card into shards (see shard_disenchant_value for pricing). */
export async function disenchantCard(
  cardId: string,
  quantity: number,
  foil = false,
): Promise<{ data: DisenchantResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('disenchant_card', {
    p_card_id: cardId,
    p_quantity: quantity,
    p_foil: foil,
  });
  return { data: (data as DisenchantResult) || null, error: rpcError(error) };
}

// ---------------------------------------------------------------------------
// Levels, battle pass, achievements, missions, inventory
// ---------------------------------------------------------------------------
export interface MatchResult {
  reward: number;
  credits: number;
  wins: number;
  losses: number;
  xp_gained: number;
  xp: number;
  level: number;
  leveled_up: boolean;
  level_credits_bonus: number;
  level_vouchers_bonus: number;
  bp_xp_gained: number;
}

export interface Season {
  id: string;
  number: number;
  name: string;
  is_active: boolean;
  is_free: boolean;
  starts_at: string;
  ends_at: string | null;
}

export interface BattlePassTier {
  id: string;
  season_id: string;
  tier: number;
  reward_type: 'credits' | 'vouchers' | 'shards' | 'pack' | 'cosmetic';
  amount: number;
  pack_type_id: string | null;
  shop_item_id: string | null;
  label: string;
}

export interface PlayerBattlePass {
  season_id: string;
  xp: number;
  claimed_tiers: number[];
}

/** XP required to unlock a battle pass tier — keep in sync with claim_bp_tier. */
export const BP_XP_PER_TIER = 100;

export async function fetchActiveSeason(): Promise<{
  season: Season | null;
  tiers: BattlePassTier[];
}> {
  const { data: season } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();
  if (!season) return { season: null, tiers: [] };
  const { data: tiers } = await supabase
    .from('battle_pass_tiers')
    .select('*')
    .eq('season_id', (season as Season).id)
    .order('tier');
  return { season: season as Season, tiers: (tiers as BattlePassTier[]) || [] };
}

export async function fetchBattlePassProgress(
  userId: string,
  seasonId: string,
): Promise<PlayerBattlePass> {
  const { data } = await supabase
    .from('player_battle_pass')
    .select('season_id, xp, claimed_tiers')
    .eq('user_id', userId)
    .eq('season_id', seasonId)
    .maybeSingle();
  return (data as PlayerBattlePass) || { season_id: seasonId, xp: 0, claimed_tiers: [] };
}

export async function claimBpTier(seasonId: string, tier: number): Promise<string | null> {
  const { error } = await supabase.rpc('claim_bp_tier', { p_season_id: seasonId, p_tier: tier });
  return rpcError(error);
}

export interface Achievement {
  id: string;
  name: string;
  description: string;
  category: string;
  stat_key: string;
  target: number;
  reward_credits: number;
  reward_vouchers: number;
  reward_pack_id: string | null;
  sort: number;
}

export interface PlayerAchievement {
  achievement_id: string;
  progress: number;
  claimed: boolean;
}

export async function fetchAchievements(
  userId: string,
): Promise<{ all: Achievement[]; mine: PlayerAchievement[] }> {
  const [{ data: all }, { data: mine }] = await Promise.all([
    supabase.from('achievements').select('*').order('sort'),
    supabase
      .from('player_achievements')
      .select('achievement_id, progress, claimed')
      .eq('user_id', userId),
  ]);
  return { all: (all as Achievement[]) || [], mine: (mine as PlayerAchievement[]) || [] };
}

export async function claimAchievement(id: string): Promise<string | null> {
  const { error } = await supabase.rpc('claim_achievement', { p_id: id });
  return rpcError(error);
}

export interface Mission {
  id: string;
  name: string;
  description: string;
  stat_key: string;
  target: number;
  cadence: 'daily' | 'weekly';
  reward_credits: number;
  reward_vouchers: number;
  reward_bp_xp: number;
  progress: number;
  claimed: boolean;
}

export async function fetchMissions(): Promise<Mission[]> {
  const { data, error } = await supabase.rpc('get_missions');
  if (error || !data) return [];
  return data as Mission[];
}

export async function claimMission(id: string): Promise<string | null> {
  const { error } = await supabase.rpc('claim_mission', { p_id: id });
  return rpcError(error);
}

export interface InventoryEntry {
  pack_type_id: string;
  quantity: number;
}

export async function fetchInventory(userId: string): Promise<InventoryEntry[]> {
  const { data } = await supabase
    .from('player_inventory')
    .select('pack_type_id, quantity')
    .eq('user_id', userId)
    .gt('quantity', 0);
  return (data as InventoryEntry[]) || [];
}

export async function buyPackToInventory(
  packId: string,
  currency: 'credits' | 'vouchers',
  quantity = 1,
): Promise<string | null> {
  const { error } = await supabase.rpc('buy_pack_to_inventory', {
    p_pack_id: packId,
    p_currency: currency,
    p_quantity: quantity,
  });
  return rpcError(error);
}

export async function openInventoryPack(
  packId: string,
): Promise<{ data: OpenPackResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('open_inventory_pack', { p_pack_id: packId });
  return { data: (data as OpenPackResult) || null, error: rpcError(error) };
}

export async function claimDailyPack(): Promise<{
  data: OpenPackResult | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('claim_daily_pack');
  return { data: (data as OpenPackResult) || null, error: rpcError(error) };
}

// ---------------------------------------------------------------------------
// Friends & trading
// ---------------------------------------------------------------------------
export interface PublicProfile {
  id: string;
  username: string;
  role: PlayerRole;
  level: number;
  wins: number;
  losses: number;
  equipped_avatar: string | null;
  equipped_banner: string | null;
}

export interface Friendship {
  id: string;
  requester: string;
  addressee: string;
  status: 'pending' | 'accepted';
  created_at: string;
}

export async function fetchFriendships(): Promise<Friendship[]> {
  const { data } = await supabase.from('friendships').select('*').order('created_at');
  return (data as Friendship[]) || [];
}

export async function fetchPublicProfiles(ids: string[]): Promise<PublicProfile[]> {
  if (ids.length === 0) return [];
  const { data } = await supabase.rpc('get_public_profiles', { p_ids: ids });
  return (data as PublicProfile[]) || [];
}

/** Full read-only profile card for the "view another player's profile" modal. */
export interface PlayerProfileCard {
  id: string;
  username: string;
  role: PlayerRole;
  level: number;
  wins: number;
  losses: number;
  games_played: number;
  equipped_avatar: string | null;
  equipped_banner: string | null;
  equipped_card_back: string | null;
  showcase_cards: string[];
  created_at: string;
}

export async function fetchPlayerProfileCard(id: string): Promise<PlayerProfileCard | null> {
  const { data, error } = await supabase.rpc('get_player_profile_card', { p_id: id });
  if (error || !data || data.length === 0) return null;
  return (data as PlayerProfileCard[])[0];
}

export interface CardsLeaderboardEntry {
  id: string;
  username: string;
  role: PlayerRole;
  level: number;
  total_cards: number;
  equipped_avatar: string | null;
  equipped_banner: string | null;
}

/** Top players by total owned cards (quantity + foil_quantity, summed across every card). */
export async function fetchCardsLeaderboard(limit = 50): Promise<CardsLeaderboardEntry[]> {
  const { data } = await supabase.rpc('get_cards_leaderboard', { p_limit: limit });
  return (data as CardsLeaderboardEntry[]) || [];
}

export async function searchPlayers(query: string): Promise<PublicProfile[]> {
  const { data, error } = await supabase.rpc('search_players', { p_query: query });
  if (error || !data) return [];
  return data as PublicProfile[];
}

export async function sendFriendRequest(username: string): Promise<string | null> {
  const { error } = await supabase.rpc('send_friend_request', { p_username: username });
  return rpcError(error);
}

export async function respondFriendRequest(id: string, accept: boolean): Promise<string | null> {
  const { error } = await supabase.rpc('respond_friend_request', { p_id: id, p_accept: accept });
  return rpcError(error);
}

export async function removeFriend(id: string): Promise<string | null> {
  const { error } = await supabase.rpc('remove_friend', { p_id: id });
  return rpcError(error);
}

export interface TradeCardItem {
  card_id: string;
  quantity: number;
  foil: boolean;
}

export interface Trade {
  id: string;
  proposer: string;
  recipient: string;
  proposer_cards: TradeCardItem[];
  recipient_cards: TradeCardItem[];
  proposer_credits: number;
  recipient_credits: number;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
}

export async function fetchTrades(): Promise<Trade[]> {
  const { data } = await supabase
    .from('trades')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  return (data as Trade[]) || [];
}

export async function fetchFriendCollection(friendId: string): Promise<PlayerCard[]> {
  const { data, error } = await supabase.rpc('get_friend_collection', { p_friend: friendId });
  if (error || !data) return [];
  return (data as { card_id: string; quantity: number; foil_quantity: number }[]).map((r) => ({
    card_id: r.card_id,
    quantity: r.quantity,
    foil_quantity: r.foil_quantity,
  }));
}

export async function createTrade(
  recipient: string,
  offerCards: TradeCardItem[],
  requestCards: TradeCardItem[],
  offerCredits: number,
  requestCredits: number,
): Promise<string | null> {
  const { error } = await supabase.rpc('create_trade', {
    p_recipient: recipient,
    p_offer_cards: offerCards,
    p_request_cards: requestCards,
    p_offer_credits: offerCredits,
    p_request_credits: requestCredits,
  });
  return rpcError(error);
}

export async function respondTrade(tradeId: string, accept: boolean): Promise<string | null> {
  const { error } = await supabase.rpc('respond_trade', { p_trade_id: tradeId, p_accept: accept });
  return rpcError(error);
}

export async function cancelTrade(tradeId: string): Promise<string | null> {
  const { error } = await supabase.rpc('cancel_trade', { p_trade_id: tradeId });
  return rpcError(error);
}

// ---------------------------------------------------------------------------
// Marketplace & auctions
// ---------------------------------------------------------------------------
export interface MarketListing {
  id: string;
  seller: string;
  card_id: string;
  foil: boolean;
  quantity: number;
  listing_type: 'fixed' | 'auction';
  price: number;
  buyout: number | null;
  current_bid: number | null;
  current_bidder: string | null;
  bid_count: number;
  status: 'active' | 'sold' | 'cancelled' | 'expired';
  created_at: string;
  ends_at: string;
}

/** Marketplace fee taken from the seller's proceeds — mirror of finalize_sale. */
export const MARKET_FEE = 0.05;

export async function fetchMarketListings(): Promise<MarketListing[]> {
  // settle anything past its end time first so browsers see fresh state
  await supabase.rpc('settle_expired_listings');
  const { data } = await supabase
    .from('market_listings')
    .select('*')
    .eq('status', 'active')
    .order('ends_at')
    .limit(200);
  return (data as MarketListing[]) || [];
}

export async function fetchMyMarketActivity(userId: string): Promise<MarketListing[]> {
  const { data } = await supabase
    .from('market_listings')
    .select('*')
    .or(`seller.eq.${userId},current_bidder.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(50);
  return (data as MarketListing[]) || [];
}

export async function createListing(opts: {
  cardId: string;
  foil: boolean;
  quantity: number;
  type: 'fixed' | 'auction';
  price: number;
  buyout?: number | null;
  hours?: number;
}): Promise<string | null> {
  const { error } = await supabase.rpc('create_listing', {
    p_card_id: opts.cardId,
    p_foil: opts.foil,
    p_quantity: opts.quantity,
    p_type: opts.type,
    p_price: opts.price,
    p_buyout: opts.buyout ?? null,
    p_hours: opts.hours ?? 24,
  });
  return rpcError(error);
}

export async function cancelListing(listingId: string): Promise<string | null> {
  const { error } = await supabase.rpc('cancel_listing', { p_listing_id: listingId });
  return rpcError(error);
}

export async function buyListing(listingId: string): Promise<string | null> {
  const { error } = await supabase.rpc('buy_listing', { p_listing_id: listingId });
  return rpcError(error);
}

export async function placeBid(listingId: string, amount: number): Promise<string | null> {
  const { error } = await supabase.rpc('place_bid', { p_listing_id: listingId, p_amount: amount });
  return rpcError(error);
}

/** Sell owned copies of a card for a fixed rarity-based credits price (foils pay 2.5x). */
export async function quicksellCards(
  cardId: string,
  quantity: number,
  foil: boolean,
): Promise<{ data: QuicksellResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('quicksell_cards', {
    p_card_id: cardId,
    p_quantity: quantity,
    p_foil: foil,
  });
  return { data: (data as QuicksellResult) || null, error: rpcError(error) };
}

// ---------------------------------------------------------------------------
// Creator (admin) tools — every RPC is guarded server-side by assert_creator().
// ---------------------------------------------------------------------------
export async function adminGrantCurrency(
  userId: string,
  credits = 0,
  vouchers = 0,
  shards = 0,
): Promise<string | null> {
  const { error } = await supabase.rpc('admin_grant_currency', {
    p_user: userId,
    p_credits: credits,
    p_vouchers: vouchers,
    p_shards: shards,
  });
  return rpcError(error);
}

export async function adminSetRole(userId: string, role: PlayerRole): Promise<string | null> {
  const { error } = await supabase.rpc('admin_set_role', { p_user: userId, p_role: role });
  return rpcError(error);
}

export async function adminGrantCard(
  userId: string,
  cardId: string,
  quantity = 1,
  foil = false,
): Promise<string | null> {
  const { error } = await supabase.rpc('admin_grant_card', {
    p_user: userId,
    p_card_id: cardId,
    p_quantity: quantity,
    p_foil: foil,
  });
  return rpcError(error);
}
