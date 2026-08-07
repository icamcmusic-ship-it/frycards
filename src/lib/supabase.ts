import { createClient, Session } from '@supabase/supabase-js';
import { CardTemplate } from '../types';
import { SHOWCASE_SET } from '../meta/submissions';

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
// Realtime
//
// The `supabase_realtime` publication carries the tables that change under a
// player's feet — storefront stock, purchases, auctions, trades, friend
// requests, news and the caller's own collection/inventory. Realtime evaluates
// the same RLS SELECT policies the REST reads do, so a subscriber only ever
// receives rows it is already allowed to read.
//
// Every subscription in the app goes through this helper so the channel name
// stays unique (two channels with the same name silently share one
// subscription) and the unsubscribe path is a single returned function.
// ---------------------------------------------------------------------------
export type RealtimeEvent = 'INSERT' | 'UPDATE' | 'DELETE' | '*';

let realtimeChannelSeq = 0;

/**
 * Subscribe to changes on one table, optionally narrowed by a PostgREST-style
 * filter (e.g. `owner=eq.<uuid>`).
 *
 * Returns an unsubscribe function; call it from an effect cleanup. Safe to call
 * more than once.
 */
export function subscribeTable(
  table: string,
  onChange: (payload: { eventType: string; new: any; old: any }) => void,
  opts: { filter?: string; event?: RealtimeEvent } = {},
): () => void {
  const channel = supabase
    .channel(`rt:${table}:${++realtimeChannelSeq}`)
    .on(
      'postgres_changes' as any,
      {
        event: opts.event ?? '*',
        schema: 'public',
        table,
        ...(opts.filter ? { filter: opts.filter } : {}),
      },
      (payload: any) => {
        onChange({ eventType: payload.eventType, new: payload.new, old: payload.old });
      },
    )
    .subscribe();

  let removed = false;
  return () => {
    if (removed) return;
    removed = true;
    supabase.removeChannel(channel);
  };
}

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
  /** Opt out of username recognition in the News Center's Serialized-pull
   * feed — the pull itself always still posts, just as "A collector". */
  hide_serialized_announcements: boolean;
  /** Banned from the Player Showcase card-submission queue (see the
   * disallowed-themes disclaimer on the submissions screen). Does not affect
   * anything else the account can do. */
  submissions_banned: boolean;
  submissions_ban_reason: string | null;
  /** Consecutive daily-login-reward days (resets after a missed UTC day). */
  login_streak: number;
  /** When the daily login reward was last claimed (one claim per UTC day). */
  last_login_claim_at: string | null;
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
  /** Restrict this slot to a card type — 'Leader' powers the Leader Pack. */
  card_type?: string;
}

export interface PackType {
  id: string;
  name: string;
  description: string | null;
  card_count: number;
  guaranteed_rarity: string | null;
  /** Square-ish shop-shelf icon. */
  image_url: string | null;
  /** Tall pack/box artwork the opening animation tears open. Null falls back
   * to `image_url`. */
  open_image_url: string | null;
  foil_chance: number;
  has_foil_slot: boolean;
  price_credits: number | null;
  price_vouchers: number | null;
  pack_tier: string;
  slot_config: PackSlot[];
  is_active: boolean;
  acquisition: string;
  time_limited: boolean;
  /** Legacy column — pity was removed entirely (no per-pack or global pity
   * remains). Always null; unused by the client. */
  pity_note: string | null;
  /** Set names this pack draws from. NULL = draws from the full card pool
   * (all sets). Non-null = restricted to exactly these `cards.set_name`
   * values. */
  allowed_sets: string[] | null;
  /** NULL = this row is a standalone store slot (true of every live pack
   * since the catalog consolidated into the single "Volume #1" set).
   * Non-null (e.g. `'set_booster'` / `'set_box'`) = one of several same-slot
   * set variants meant to render as a single swipeable store tile — see
   * `set_name` and StoreScreen's grouped pack tile, kept for future
   * multi-set drops. */
  pack_group: string | null;
  /** Which single set this row represents — only set when `pack_group` is set. */
  set_name: string | null;
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
   * card was actually granted, it was auto-converted to credits instead. */
  converted_to_credits: boolean;
  /** Credits gained from this specific pull; only nonzero when converted. */
  credit_value: number;
  /** True for the ~1%-per-pack Serialized pull (see grant_pack_contents) — a
   * numbered 1-of-N print, never foil, never quick-sellable. */
  serialized?: boolean;
  /** This copy's number, e.g. 7 of 150 — only set when `serialized` is true. */
  serial_number?: number;
  /** Total supply for this pull's rarity tier (75/100/50 for Full-Art/Ultra-Rare/Mythic — see the `serialized_supply` table, the source of truth). */
  serial_cap?: number;
}

export interface OpenPackResult {
  cards: PackPull[];
  credits: number;
  vouchers: number;
  credits_gained?: number;
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
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  // A transient query failure must not read the same as "no profile" — the
  // caller (MetaContext.refreshProfile, called after every purchase) would
  // otherwise show credits/vouchers/xp as wiped even though nothing changed
  // server-side. Thrown (not null): MetaContext's boot effect turns a
  // rejection into bootError+retry, and its refreshProfile keeps the profile
  // already on screen. Returning null here made one network blip mid-session
  // blank the wallet and disable every buy button until a full reload.
  if (error) {
    console.error('fetchProfile failed:', error.message);
    throw error;
  }
  return (data as Profile) || null;
}

export async function fetchShopItems(): Promise<ShopItem[]> {
  const { data, error } = await supabase
    .from('shop_items')
    .select('*')
    .order('item_type')
    .order('cost_credits');
  if (error) {
    console.error('fetchShopItems failed:', error.message);
    // Thrown (not []) — these two are only ever awaited from MetaContext's
    // boot effect, which already treats a rejection as bootError+retry.
    // Swallowing into [] made a real query failure indistinguishable from a
    // genuinely empty store and booted the player straight into it.
    throw error;
  }
  return (data as ShopItem[]) || [];
}

export async function fetchPackTypes(): Promise<PackType[]> {
  const { data, error } = await supabase.from('pack_types').select('*');
  if (error) {
    console.error('fetchPackTypes failed:', error.message);
    throw error;
  }
  const packs = (data as PackType[]) || [];
  // cheapest first, by whichever currency the pack sells for
  return packs.sort(
    (a, b) =>
      (a.price_credits ?? (a.price_vouchers ?? 0) * 100) -
      (b.price_credits ?? (b.price_vouchers ?? 0) * 100),
  );
}

export async function fetchCollection(userId: string): Promise<PlayerCard[]> {
  const { data, error } = await supabase
    .from('player_cards')
    .select('card_id, quantity, foil_quantity')
    .eq('user_id', userId);
  // Thrown (not []) — same contract as fetchShopItems below: a failed read
  // must not render as "you own nothing" (empty collection, every deck card
  // marked unowned, sell/trade forms offering copies the server will reject).
  if (error) {
    console.error('fetchCollection failed:', error.message);
    throw error;
  }
  return (data as PlayerCard[]) || [];
}

export async function fetchCosmetics(userId: string): Promise<PlayerCosmetic[]> {
  const { data, error } = await supabase
    .from('player_cosmetics')
    .select('shop_item_id, is_foil')
    .eq('user_id', userId);
  if (error) {
    console.error('fetchCosmetics failed:', error.message);
    throw error;
  }
  return (data as PlayerCosmetic[]) || [];
}

export async function fetchDecks(userId: string): Promise<DeckRow[]> {
  const { data, error } = await supabase
    .from('decks')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });
  if (error) {
    console.error('fetchDecks failed:', error.message);
    throw error;
  }
  return (data as DeckRow[]) || [];
}

// ---------------------------------------------------------------------------
// Meta-game writes (RPCs)
// ---------------------------------------------------------------------------
function rpcError(error: { message: string } | null): string | null {
  if (!error) return null;
  // strip a leading postgres error-code prefix (e.g. "P0001: ") for user
  // display — anchored to a short all-caps/digit code so a colon inside the
  // actual message text (e.g. "Not enough credits: need 500, have 200") is
  // never eaten.
  return error.message.replace(/^[A-Z0-9]{2,10}:\s*/, '');
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

export async function recordMatchResult(
  won: boolean,
  /** Client-generated idempotency key (one UUID per match). The server keeps
   * a receipt per id, so retrying after a lost reply can never double-pay
   * the same match — the retry returns null data instead. */
  matchId?: string,
): Promise<{ data: MatchResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('record_match_result', {
    p_won: won,
    p_match_id: matchId ?? null,
  });
  return { data: (data as MatchResult) || null, error: rpcError(error) };
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
  return rpcError(error);
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
  reward_type: 'credits' | 'vouchers' | 'pack' | 'cosmetic';
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
  const { data: season, error: seasonError } = await supabase
    .from('seasons')
    .select('*')
    .eq('is_active', true)
    .maybeSingle();
  if (seasonError) {
    console.error('fetchActiveSeason (season) failed:', seasonError.message);
    // Thrown (not a null season) — swallowing made an outage render as the
    // misleading "No season is live" empty state instead of the RETRY path.
    throw seasonError;
  }
  if (!season) return { season: null, tiers: [] };
  const { data: tiers, error: tiersError } = await supabase
    .from('battle_pass_tiers')
    .select('*')
    .eq('season_id', (season as Season).id)
    .order('tier');
  if (tiersError) {
    console.error('fetchActiveSeason (tiers) failed:', tiersError.message);
    throw tiersError;
  }
  return { season: season as Season, tiers: (tiers as BattlePassTier[]) || [] };
}

export async function fetchBattlePassProgress(
  userId: string,
  seasonId: string,
): Promise<PlayerBattlePass> {
  const { data, error } = await supabase
    .from('player_battle_pass')
    .select('season_id, xp, claimed_tiers')
    .eq('user_id', userId)
    .eq('season_id', seasonId)
    .maybeSingle();
  if (error) {
    console.error('fetchBattlePassProgress failed:', error.message);
    // Thrown (not a zeroed default) — a fake xp:0 row on a network failure
    // rendered as wiped progress instead of the screen's RETRY path.
    throw error;
  }
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
  const [{ data: all, error: allError }, { data: mine, error: mineError }] = await Promise.all([
    supabase.from('achievements').select('*').order('sort'),
    supabase
      .from('player_achievements')
      .select('achievement_id, progress, claimed')
      .eq('user_id', userId),
  ]);
  if (allError) {
    console.error('fetchAchievements (all) failed:', allError.message);
    // Thrown (not []) — swallowing made an outage render as the misleading
    // "No achievements" empty state instead of the screen's RETRY path.
    throw allError;
  }
  if (mineError) {
    console.error('fetchAchievements (mine) failed:', mineError.message);
    throw mineError;
  }
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
  if (error) {
    console.error('fetchMissions failed:', error.message);
    throw error;
  }
  return (data as Mission[]) || [];
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
  const { data, error } = await supabase
    .from('player_inventory')
    .select('pack_type_id, quantity')
    .eq('user_id', userId)
    .gt('quantity', 0);
  if (error) {
    console.error('fetchInventory failed:', error.message);
    throw error;
  }
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

/** Buy-and-open up to 24 copies of one pack in a single call. */
export async function buyAndOpenPacks(
  packId: string,
  count: number,
  currency: 'credits' | 'vouchers',
): Promise<{ data: (OpenPackResult & { packs_opened: number }) | null; error: string | null }> {
  const { data, error } = await supabase.rpc('buy_and_open_packs', {
    p_pack_id: packId,
    p_count: count,
    p_currency: currency,
  });
  return {
    data: (data as OpenPackResult & { packs_opened: number }) || null,
    error: rpcError(error),
  };
}

/** Open up to 24 copies of one pack from inventory in a single call. */
export async function openInventoryPacks(
  packId: string,
  count: number,
): Promise<{ data: (OpenPackResult & { packs_opened: number }) | null; error: string | null }> {
  const { data, error } = await supabase.rpc('open_inventory_packs', {
    p_pack_id: packId,
    p_count: count,
  });
  return {
    data: (data as OpenPackResult & { packs_opened: number }) || null,
    error: rpcError(error),
  };
}

// ---------------------------------------------------------------------------
// Daily login reward (streak-based; separate from the Daily Free Pack)
// ---------------------------------------------------------------------------
export interface DailyLoginResult {
  streak: number;
  /** 1..7 position in the repeating reward cycle (day 7 is the jackpot). */
  cycle_day: number;
  credits_awarded: number;
  vouchers_awarded: number;
  /** Name of the free pack granted to inventory (cycle day 5 only). */
  pack_awarded: string | null;
  credits: number;
  vouchers: number;
}

export async function claimDailyLogin(): Promise<{
  data: DailyLoginResult | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('claim_daily_login');
  return { data: (data as DailyLoginResult) || null, error: rpcError(error) };
}

/**
 * Opens the one-time Deck Box every operative receives: grants the chosen
 * Leader plus a ready-to-play, colour-legal 60-card deck built around them —
 * exactly 2 Super-Rares and 8 Rares, the rest Uncommons/Commons — and saves
 * it to the player's decks. See `claim_deck_box` (SECURITY DEFINER) for the
 * server-side logic, including the per-rarity copy caps and the colour
 * identity filter.
 *
 * Replaces the v7.2 `claimStarterBox`/`claimStarterDeck` pair: the former
 * built its deck ordered by rarity ASCENDING (so, in practice, 60 Commons)
 * and never filtered on colour identity, so the deck it auto-saved as
 * "ready to play" was routinely illegal in the deck editor.
 */
export async function claimDeckBox(leaderId: string): Promise<{
  data: (OpenPackResult & { leader_id: string; deck_saved: boolean }) | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('claim_deck_box', { p_leader_id: leaderId });
  return {
    data: (data as OpenPackResult & { leader_id: string; deck_saved: boolean }) || null,
    error: rpcError(error),
  };
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
  const { data, error } = await supabase.from('friendships').select('*').order('created_at');
  if (error) {
    // Throw instead of returning [] — callers (SocialScreen.reload) catch
    // this to show an error+retry state; silently returning an empty array
    // made a broken query indistinguishable from genuinely having no friends.
    console.error('fetchFriendships failed:', error.message);
    throw error;
  }
  return (data as Friendship[]) || [];
}

export async function fetchPublicProfiles(ids: string[]): Promise<PublicProfile[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.rpc('get_public_profiles', { p_ids: ids });
  if (error) {
    console.error('fetchPublicProfiles failed:', error.message);
    throw error;
  }
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
  if (error) console.error('fetchPlayerProfileCard failed:', error.message);
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
  const { data, error } = await supabase.rpc('get_cards_leaderboard', { p_limit: limit });
  if (error) {
    // Throw instead of returning [] — SocialScreen's leaderboard tab catches
    // this to show an error+retry state; silently returning an empty array
    // made a broken query indistinguishable from a genuinely empty board.
    console.error('fetchCardsLeaderboard failed:', error.message);
    throw error;
  }
  return (data as CardsLeaderboardEntry[]) || [];
}

export async function searchPlayers(query: string): Promise<PublicProfile[]> {
  const { data, error } = await supabase.rpc('search_players', { p_query: query });
  if (error) {
    console.error('searchPlayers failed:', error.message);
    throw error;
  }
  return (data as PublicProfile[]) || [];
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
  const { data, error } = await supabase
    .from('trades')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error('fetchTrades failed:', error.message);
    throw error;
  }
  return (data as Trade[]) || [];
}

export async function fetchFriendCollection(friendId: string): Promise<PlayerCard[]> {
  const { data, error } = await supabase.rpc('get_friend_collection', { p_friend: friendId });
  // Throw on failure like the sibling fetchers — returning [] made a network
  // blip indistinguishable from a friend who owns zero cards, so the trade
  // builder showed an empty pane with no error or retry.
  if (error) {
    console.error('fetchFriendCollection failed:', error.message);
    throw error;
  }
  if (!data) return [];
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
  const { error: settleError } = await supabase.rpc('settle_expired_listings');
  // If settlement fails, listings below may still include already-expired
  // ones — log it rather than silently letting a player bid/buy on a dead
  // listing with no signal anything went wrong.
  if (settleError) console.error('settle_expired_listings failed:', settleError.message);
  const { data, error } = await supabase
    .from('market_listings')
    .select('*')
    .eq('status', 'active')
    .order('ends_at')
    .limit(200);
  if (error) {
    console.error('fetchMarketListings failed:', error.message);
    // Throw instead of returning [] — callers (MarketplaceScreen.reload)
    // catch this to show an error+retry state; silently returning an empty
    // array made a broken query indistinguishable from a genuinely empty
    // market.
    throw error;
  }
  return (data as MarketListing[]) || [];
}

export async function fetchMyMarketActivity(userId: string): Promise<MarketListing[]> {
  const { data, error } = await supabase
    .from('market_listings')
    .select('*')
    .or(`seller.eq.${userId},current_bidder.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error('fetchMyMarketActivity failed:', error.message);
    throw error;
  }
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

// ---------------------------------------------------------------------------
// Daily Bounties — 5 server-picked cards that rotate once per UTC day, same
// for every player. Separate from quicksell/shop: capped sells/buys per day.
// ---------------------------------------------------------------------------
export interface BountyCard {
  card_id: string;
  name: string;
  rarity: string;
  card_type: string;
  image_url: string | null;
  /** 5x quicksell value, precomputed server-side. */
  sell_price: number;
  /** 3x quicksell value, precomputed server-side. */
  buy_price: number;
  /** This player already sold this card back today (max 1 sell per card). */
  already_sold: boolean;
  /** This player already bought this card from the bounty shop today (blocks selling it back). */
  already_bought: boolean;
  /** How many copies of this card the player currently owns. */
  owned: number;
}

/** Today's 5 bounty cards (2 Uncommon, 1 Rare, 1 Super-Rare, 1 Full-Art-or-better). */
export async function getDailyBounties(): Promise<{
  data: BountyCard[] | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('get_daily_bounties');
  return { data: (data as BountyCard[]) || null, error: rpcError(error) };
}

export interface SellBountyResult {
  ok: boolean;
  credits: number;
  card_id: string;
  sold_for: number;
}

/** Sell one owned copy of a today's bounty card at 5x quicksell — max 1/card, 3/day total. */
export async function sellBountyCard(cardId: string): Promise<{
  data: SellBountyResult | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('sell_bounty_card', { p_card_id: cardId });
  return { data: (data as SellBountyResult) || null, error: rpcError(error) };
}

export interface BuyBountyResult {
  ok: boolean;
  credits: number;
  card_id: string;
  bought_for: number;
}

/** Buy one copy of a today's bounty card at 3x quicksell. */
export async function buyBountyCard(cardId: string): Promise<{
  data: BuyBountyResult | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('buy_bounty_card', { p_card_id: cardId });
  return { data: (data as BuyBountyResult) || null, error: rpcError(error) };
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
): Promise<string | null> {
  const { error } = await supabase.rpc('admin_grant_currency', {
    p_user: userId,
    p_credits: credits,
    p_vouchers: vouchers,
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

// ---------------------------------------------------------------------------
// Player Shops — player-run storefronts (individual/bundle/mystery-pack
// listings), unlocked at level 50. See open_shop / create_shop_listing /
// submit_mystery_pool etc (SECURITY DEFINER RPCs) for the server logic.
// ---------------------------------------------------------------------------
export const SHOP_UNLOCK_LEVEL = 50;

export interface CardMarketValue {
  sales: number;
  avg_price: number | null;
}

/** Blended (quicksell + player-market-average) reference price shown as the
 * "market value" popup on the expanded card viewer — null avg_price until
 * the card has at least 5 completed player-market sales. */
export async function fetchCardMarketValue(cardId: string, foil = false): Promise<CardMarketValue> {
  const { data, error } = await supabase.rpc('get_card_market_value', {
    p_card_id: cardId,
    p_foil: foil,
  });
  if (error) console.error('fetchCardMarketValue failed:', error.message);
  if (error || !data) return { sales: 0, avg_price: null };
  return data as CardMarketValue;
}

/** Blended reference price used for shop soft-cap bands (quicksell + market avg). */
export async function fetchCardBlendedReference(cardId: string, foil = false): Promise<number> {
  const { data, error } = await supabase.rpc('card_blended_reference', {
    p_card_id: cardId,
    p_foil: foil,
  });
  if (error) console.error('fetchCardBlendedReference failed:', error.message);
  if (error || data == null) return 0;
  return data as number;
}

/** Storefront accent — drives the header wash, chips and buttons on a public
 * shop so two shops never look like the same page. */
export type ShopAccent =
  | 'yellow'
  | 'red'
  | 'steel'
  | 'ink'
  | 'ember'
  | 'tide'
  | 'root'
  | 'gale'
  | 'light'
  | 'shadow'
  | 'void';

export const SHOP_ACCENTS: ShopAccent[] = [
  'yellow',
  'red',
  'steel',
  'ink',
  'ember',
  'tide',
  'root',
  'gale',
  'light',
  'shadow',
  'void',
];

export interface PlayerShop {
  owner: string;
  name: string;
  banner_url: string | null;
  tagline: string | null;
  accent: ShopAccent;
  status: 'active' | 'dormant';
  slots_purchased: number;
  last_maintenance_at: string;
  created_at: string;
  closed_at: string | null;
}

export interface ShopSlot {
  id: string;
  owner: string;
  slot_index: number;
  collateral: number;
  status: 'empty' | 'occupied' | 'burned';
  created_at: string;
}

export type MysteryMode = 'simple' | 'advanced';
export type MysterySlotMode = 'exact' | 'minimum' | 'open';

export interface MysterySlotSpec {
  mode: MysterySlotMode;
  card_id?: string;
  foil?: boolean;
  rarity?: string;
}

/** "Every pack contains at least `count` cards of `rarity` or better." Checked
 * cumulatively at pool-submission time and honoured first by the draw. */
export interface MysteryGuarantee {
  rarity: string;
  count: number;
}

export interface MysteryTemplateConfig {
  rarity_weights?: Record<string, number>;
  slots?: MysterySlotSpec[];
  guarantees?: MysteryGuarantee[];
}

export interface MysteryTemplate {
  id: string;
  owner: string;
  name: string;
  pack_size: number;
  mode: MysteryMode;
  config: MysteryTemplateConfig;
  historical_floor_ev: number | null;
  created_at: string;
}

export interface ShopListingCardItem {
  card_id: string;
  foil: boolean;
  quantity: number;
}

export type ShopListingType = 'individual' | 'bundle' | 'mystery';
export type ShopListingStatus = 'active' | 'sold' | 'sold_out' | 'cancelled';

export interface ShopListing {
  id: string;
  owner: string;
  slot_id: string;
  listing_type: ShopListingType;
  status: ShopListingStatus;
  cards: ShopListingCardItem[];
  price: number;
  reference_price: number;
  template_id: string | null;
  pack_size: number | null;
  total_packs: number | null;
  remaining_packs: number | null;
  ev_frozen: number | null;
  created_at: string;
}

export interface ShopPurchase {
  id: string;
  owner: string;
  buyer: string;
  listing_id: string;
  listing_type: ShopListingType;
  price: number;
  reference_price: number;
  cards: ShopListingCardItem[];
  created_at: string;
}

export interface ShopPublic {
  owner: string;
  name: string;
  banner_url: string | null;
  tagline: string | null;
  accent: ShopAccent;
  status: 'active' | 'dormant';
  created_at: string;
  sales_count: number;
  repeat_buyers: number;
  /** Active listing counts keyed by listing type. */
  stock: Partial<Record<ShopListingType, number>>;
  unique_buyers: number;
  rating_unlocked: boolean;
  composite_score: number | null;
}

export interface BrowseShopEntry {
  owner: string;
  name: string;
  banner_url: string | null;
  tagline: string | null;
  accent: ShopAccent;
  owner_username: string | null;
  status: 'active' | 'dormant';
  created_at: string;
  sales_count: number;
  active_listings: number;
  mystery_listings: number;
  cheapest_price: number | null;
  top_rarity_tier: number | null;
  trending_score: number;
  composite_score: number;
  rating_unlocked: boolean;
}

export interface MysteryPoolValidation {
  ok: boolean;
  errors: string[];
  pool_size: number;
  num_packs?: number;
  ev_per_pack?: number;
  suggested_min?: number;
  suggested_max?: number;
  /** Cards in the submitted pool, counted per rarity. */
  rarity_breakdown?: Record<string, number>;
}

/** One (card, foil) line of a mystery listing's publicly disclosed pool. */
export interface MysteryPoolEntry {
  card_id: string;
  foil: boolean;
  rarity: string;
  tier: number;
  name: string;
  image_url: string | null;
  card_type: string | null;
  submitted: number;
  remaining: number;
  reference_value: number;
}

export interface MysteryPoolRarityRow {
  rarity: string;
  tier: number;
  submitted: number;
  remaining: number;
  pull_chance_pct: number | null;
}

/** Everything a buyer can see about a mystery listing before paying for it:
 * the whole submitted pool, what's left of it, and the odds that implies. */
export interface MysteryPoolPublic {
  listing_id: string;
  template_name: string | null;
  mode: MysteryMode | null;
  pack_size: number | null;
  price: number;
  total_packs: number | null;
  remaining_packs: number | null;
  status: ShopListingStatus;
  guarantees: MysteryGuarantee[];
  rarity_weights: Record<string, number>;
  slots: MysterySlotSpec[];
  ev_frozen: number | null;
  cards_remaining: number;
  cards: MysteryPoolEntry[];
  rarities: MysteryPoolRarityRow[];
}

/** A card the caller may actually list: spare copies only, already netted of
 * deck locks and serialized prints by the server. */
export interface ListableCard {
  card_id: string;
  name: string;
  rarity: string;
  tier: number;
  card_type: string | null;
  image_url: string | null;
  spare_normal: number;
  spare_foil: number;
  value_normal: number;
  value_foil: number;
}

export interface MysteryLiveStats {
  remaining_packs: number;
  live_ev_per_pack: number | null;
}

export interface ShopReport {
  id: string;
  listing_id: string;
  reporter: string;
  reason: 'mismatch' | 'not_as_described' | 'other';
  note: string | null;
  status: 'open' | 'auto_resolved' | 'escalated' | 'resolved' | 'dismissed';
  created_at: string;
}

// -- reads --------------------------------------------------------------
export async function fetchMyShop(ownerId: string): Promise<PlayerShop | null> {
  const { data, error } = await supabase
    .from('player_shops')
    .select('*')
    .eq('owner', ownerId)
    .maybeSingle();
  if (error) {
    // Throw instead of returning null — MyShopTab's reload() catches this to
    // show an error+retry state; silently returning null made a broken query
    // indistinguishable from "you haven't opened a shop yet" and could send
    // a player back through OPEN SHOP (and its setup fee) on a mere network hiccup.
    console.error('fetchMyShop failed:', error.message);
    throw error;
  }
  return (data as PlayerShop) || null;
}

export async function fetchShopSlots(ownerId: string): Promise<ShopSlot[]> {
  const { data, error } = await supabase
    .from('shop_slots')
    .select('*')
    .eq('owner', ownerId)
    .order('slot_index');
  if (error) {
    console.error('fetchShopSlots failed:', error.message);
    throw error;
  }
  return (data as ShopSlot[]) || [];
}

export async function fetchShopListings(ownerId: string): Promise<ShopListing[]> {
  const { data, error } = await supabase
    .from('shop_listings')
    .select('*')
    .eq('owner', ownerId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('fetchShopListings failed:', error.message);
    throw error;
  }
  return (data as ShopListing[]) || [];
}

export async function fetchMysteryTemplates(ownerId: string): Promise<MysteryTemplate[]> {
  const { data, error } = await supabase
    .from('mystery_pack_templates')
    .select('*')
    .eq('owner', ownerId)
    .order('created_at', { ascending: false });
  if (error) {
    console.error('fetchMysteryTemplates failed:', error.message);
    throw error;
  }
  return (data as MysteryTemplate[]) || [];
}

export async function fetchShopPublic(ownerId: string): Promise<ShopPublic | null> {
  const { data, error } = await supabase.rpc('get_shop_public', { p_owner: ownerId });
  if (error) {
    // Throw instead of swallowing — StorefrontView's reload() catches this to
    // show an error+retry state; only a genuinely missing shop (no error, no
    // data) should fall through to "This shop couldn't be found."
    console.error('fetchShopPublic failed:', error.message);
    throw error;
  }
  return (data as ShopPublic) || null;
}

export async function browseShops(
  sort: 'featured' | 'trending' | 'new' | 'top_rated' = 'featured',
  limit = 30,
): Promise<BrowseShopEntry[]> {
  const { data, error } = await supabase.rpc('browse_shops', { p_sort: sort, p_limit: limit });
  if (error) {
    console.error('browseShops failed:', error.message);
    throw error;
  }
  return (data as BrowseShopEntry[]) || [];
}

export async function fetchMysteryLiveStats(listingId: string): Promise<MysteryLiveStats> {
  const { data, error } = await supabase.rpc('get_mystery_live_stats', { p_listing_id: listingId });
  if (error) {
    // Thrown — the caller's .catch keeps the last-known stats. The old
    // `remaining_packs: 0` error sentinel overwrote good state and made an
    // in-stock mystery listing render sold-out after one failed 30s poll.
    console.error('fetchMysteryLiveStats failed:', error.message);
    throw error;
  }
  if (!data) throw new Error('get_mystery_live_stats returned no data');
  return data as MysteryLiveStats;
}

/** Purchases where the caller is either the buyer or the selling shop's owner. */
export async function fetchMyShopPurchases(userId: string): Promise<ShopPurchase[]> {
  const { data, error } = await supabase
    .from('shop_purchases')
    .select('*')
    .or(`buyer.eq.${userId},owner.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) {
    console.error('fetchMyShopPurchases failed:', error.message);
    throw error;
  }
  return (data as ShopPurchase[]) || [];
}

export async function fetchMysteryPoolPublic(listingId: string): Promise<MysteryPoolPublic | null> {
  const { data, error } = await supabase.rpc('get_mystery_pool_public', {
    p_listing_id: listingId,
  });
  if (error) {
    console.error('fetchMysteryPoolPublic failed:', error.message);
    throw error;
  }
  return (data as MysteryPoolPublic) || null;
}

/** The caller's listable (spare) collection, computed server-side with the
 * same deck-lock + serialized reservations the escrow check enforces — so a
 * bulk "add every spare Uncommon" can never stage more than will be accepted. */
export async function fetchListableInventory(): Promise<ListableCard[]> {
  const { data, error } = await supabase.rpc('get_listable_inventory');
  if (error) {
    console.error('fetchListableInventory failed:', error.message);
    throw error;
  }
  return (data as ListableCard[]) || [];
}

// -- shop lifecycle -------------------------------------------------------
export async function openShop(
  name: string,
  bannerUrl?: string | null,
  tagline?: string | null,
  accent?: ShopAccent | null,
): Promise<string | null> {
  const { error } = await supabase.rpc('open_shop', {
    p_name: name,
    p_banner_url: bannerUrl ?? null,
    p_tagline: tagline ?? null,
    p_accent: accent ?? null,
  });
  return rpcError(error);
}

export async function updateShop(
  name: string,
  bannerUrl?: string | null,
  tagline?: string | null,
  accent?: ShopAccent | null,
): Promise<string | null> {
  const { error } = await supabase.rpc('update_shop', {
    p_name: name,
    p_banner_url: bannerUrl ?? null,
    p_tagline: tagline ?? null,
    p_accent: accent ?? null,
  });
  return rpcError(error);
}

export async function reopenShop(): Promise<string | null> {
  const { error } = await supabase.rpc('reopen_shop');
  return rpcError(error);
}

export async function closeShop(): Promise<{
  data: { refunded: number } | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('close_shop');
  return { data: (data as { refunded: number }) || null, error: rpcError(error) };
}

export async function buyShopSlot(): Promise<{
  data: { cost: number; slot_index: number } | null;
  error: string | null;
}> {
  const { data, error } = await supabase.rpc('buy_shop_slot');
  return { data: (data as { cost: number; slot_index: number }) || null, error: rpcError(error) };
}

// -- individual / bundle listings -----------------------------------------
export async function createShopListing(
  slotId: string,
  type: 'individual' | 'bundle',
  cards: ShopListingCardItem[],
  price: number,
): Promise<string | null> {
  const { error } = await supabase.rpc('create_shop_listing', {
    p_slot_id: slotId,
    p_type: type,
    p_cards: cards,
    p_price: price,
  });
  return rpcError(error);
}

export async function cancelShopListing(listingId: string): Promise<string | null> {
  const { error } = await supabase.rpc('cancel_shop_listing', { p_listing_id: listingId });
  return rpcError(error);
}

export async function buyShopListing(listingId: string): Promise<string | null> {
  const { error } = await supabase.rpc('buy_shop_listing', { p_listing_id: listingId });
  return rpcError(error);
}

// -- mystery packs ----------------------------------------------------------
export async function createMysteryTemplate(
  name: string,
  packSize: number,
  mode: MysteryMode,
  config: MysteryTemplateConfig,
): Promise<{ data: { template_id: string } | null; error: string | null }> {
  const { data, error } = await supabase.rpc('create_mystery_template', {
    p_name: name,
    p_pack_size: packSize,
    p_mode: mode,
    p_config: config,
  });
  return { data: (data as { template_id: string }) || null, error: rpcError(error) };
}

export async function previewMysteryPool(
  templateId: string,
  pool: ShopListingCardItem[],
): Promise<{ data: MysteryPoolValidation | null; error: string | null }> {
  const { data, error } = await supabase.rpc('preview_mystery_pool', {
    p_template_id: templateId,
    p_pool: pool,
  });
  return { data: (data as MysteryPoolValidation) || null, error: rpcError(error) };
}

export async function submitMysteryPool(
  templateId: string,
  slotId: string,
  pool: ShopListingCardItem[],
  price: number,
): Promise<{ data: { listing_id: string; ev_per_pack: number } | null; error: string | null }> {
  const { data, error } = await supabase.rpc('submit_mystery_pool', {
    p_template_id: templateId,
    p_slot_id: slotId,
    p_pool: pool,
    p_price: price,
  });
  return {
    data: (data as { listing_id: string; ev_per_pack: number }) || null,
    error: rpcError(error),
  };
}

export interface MysteryDrawResult {
  cards: { card_id: string; foil: boolean; rarity: string }[];
  remaining_packs: number;
}

export async function buyMysteryPack(
  listingId: string,
): Promise<{ data: MysteryDrawResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('buy_mystery_pack', { p_listing_id: listingId });
  return { data: (data as MysteryDrawResult) || null, error: rpcError(error) };
}

export interface ShopBuyerRating {
  purchase_id: string;
  buyer: string;
  owner: string;
  rating: number;
  created_at: string;
  updated_at: string;
}

/** Ratings the caller has already left, keyed for quick per-purchase lookup. */
export async function fetchMyBuyerRatings(userId: string): Promise<ShopBuyerRating[]> {
  const { data, error } = await supabase.from('shop_buyer_ratings').select('*').eq('buyer', userId);
  if (error) {
    console.error('fetchMyBuyerRatings failed:', error.message);
    throw error;
  }
  return (data as ShopBuyerRating[]) || [];
}

// -- rating & moderation ------------------------------------------------
export async function rateShopPurchase(purchaseId: string, rating: number): Promise<string | null> {
  const { error } = await supabase.rpc('rate_shop_purchase', {
    p_purchase_id: purchaseId,
    p_rating: rating,
  });
  return rpcError(error);
}

export async function reportListing(
  listingId: string,
  reason: 'mismatch' | 'not_as_described' | 'other',
  note?: string,
): Promise<string | null> {
  const { error } = await supabase.rpc('report_listing', {
    p_listing_id: listingId,
    p_reason: reason,
    p_note: note ?? null,
  });
  return rpcError(error);
}

// ---------------------------------------------------------------------------
// News Center — changelog link (see ChangelogScreen), Creator-authored blog
// posts, and a live feed of Serialized-card pulls across the whole server.
// ---------------------------------------------------------------------------
export interface NewsPost {
  id: string;
  title: string;
  body: string;
  author: string;
  published_at: string;
  created_at: string;
}

export async function fetchNewsPosts(limit = 30): Promise<NewsPost[]> {
  const { data, error } = await supabase
    .from('news_posts')
    .select('*')
    .order('published_at', { ascending: false })
    .limit(limit);
  if (error) {
    console.error('fetchNewsPosts failed:', error.message);
    // Thrown (not []) — swallowing made an outage render as an empty feed
    // instead of NewsCenter's RETRY path.
    throw error;
  }
  return (data as NewsPost[]) || [];
}

export async function createNewsPost(title: string, body: string): Promise<string | null> {
  const { error } = await supabase.rpc('create_news_post', { p_title: title, p_body: body });
  return rpcError(error);
}

export async function deleteNewsPost(id: string): Promise<string | null> {
  const { error } = await supabase.rpc('delete_news_post', { p_id: id });
  return rpcError(error);
}

export interface SerializedFeedEntry {
  card_id: string;
  card_name: string;
  image_url: string | null;
  rarity: string;
  serial_number: number;
  cap: number;
  acquired_at: string;
  username: string;
}

export async function fetchSerializedFeed(limit = 30): Promise<SerializedFeedEntry[]> {
  const { data, error } = await supabase.rpc('get_serialized_feed', { p_limit: limit });
  if (error) {
    console.error('fetchSerializedFeed failed:', error.message);
    throw error;
  }
  return (data as SerializedFeedEntry[]) || [];
}

/** This player's own Serialized pulls — used to badge owned copies in
 * Collection/Deck Builder and to block quicksell in the UI before the RPC
 * would reject it server-side. */
export interface OwnedSerializedCard {
  card_id: string;
  rarity: string;
  serial_number: number;
  /** Total print run for this rarity (`serialized_supply.cap`) — no FK
   * relationship exists for PostgREST to embed this automatically, so it's
   * joined client-side against a second small query. Lets each owned
   * serialized print render its own "#N of cap" plate (see CollectionScreen)
   * instead of just a bare serial number. */
  cap: number;
  acquired_at: string;
}

export async function fetchMySerializedCards(userId: string): Promise<OwnedSerializedCard[]> {
  const [{ data, error }, { data: supply, error: supplyError }] = await Promise.all([
    supabase
      .from('player_serialized_cards')
      .select('card_id, rarity, serial_number, acquired_at')
      .eq('user_id', userId),
    supabase.from('serialized_supply').select('rarity, cap'),
  ]);
  // The cards query failing throws (same contract as fetchCollection); the
  // supply query alone failing degrades to the NaN/"?" cap below instead.
  if (error) {
    console.error('fetchMySerializedCards (cards) failed:', error.message);
    throw error;
  }
  if (supplyError) console.error('fetchMySerializedCards (supply) failed:', supplyError.message);
  const capByRarity = new Map((supply || []).map((s) => [s.rarity, s.cap as number]));
  // NaN (rendered as "?" — see CollectionScreen/NewsCenterScreen) when the
  // supply query itself failed: defaulting to 0 here used to make an owned
  // Serialized card's print run look sold-out ("#N of 0") instead of just
  // unknown, which is a scary and misleading thing to show over a card the
  // player actually owns.
  return ((data as Omit<OwnedSerializedCard, 'cap'>[]) || []).map((r) => ({
    ...r,
    cap: capByRarity.get(r.rarity) ?? (supplyError ? NaN : 0),
  }));
}

export async function setHideSerializedAnnouncements(hide: boolean): Promise<string | null> {
  const { error } = await supabase.rpc('set_hide_serialized_announcements', { p_hide: hide });
  return rpcError(error);
}

// ---------------------------------------------------------------------------
// Player card submissions — the "Players Showcase 2026" set.
//
// Players submit art + title + type + flavor; the Creator assigns rarity and
// every other attribute, or denies (optionally with a submissions ban). An
// approval mints the real `cards` row, which is why the approve call carries
// the client-derived mechanics: they are hashed from `id|type|rarity` in
// cardpool.ts and the server has no way to compute them.
// ---------------------------------------------------------------------------
export type SubmissionTreatment = 'standard' | 'full_art' | 'video_mythic';
export type SubmissionStatus = 'pending' | 'approved' | 'denied' | 'withdrawn';

export interface CardSubmission {
  id: string;
  submitter: string;
  set_name: string;
  card_name: string;
  card_type: string;
  flavor_text: string;
  image_url: string;
  requested_treatment: SubmissionTreatment;
  status: SubmissionStatus;
  review_note: string | null;
  approved_card_id: string | null;
  approved_rarity: string | null;
  created_at: string;
  reviewed_at: string | null;
}

/** A submission as the Creator's review queue sees it — same row plus who
 * sent it, which RLS alone can't join (profiles are self-readable only). */
export interface CardSubmissionForReview extends CardSubmission {
  submitter_username: string | null;
  submitter_banned: boolean;
}

/** Headline counts behind the "is this set big enough to stand on its own?"
 * line on the submissions screen. */
export interface ShowcaseStats {
  set_name: string;
  pending: number;
  approved: number;
  /** Pending + approved — every card still in the running for the set. */
  submitted: number;
  submitters: number;
  /** The server's own copy of SHOWCASE_MIN_CARDS, so the bar the screen shows
   * is the bar the backend was configured with. */
  cards_needed: number;
  /** Rows actually printed into `cards` for this set. */
  printed: number;
}

/** The caller's own submissions (RLS-scoped), newest first. */
export async function fetchMySubmissions(userId: string): Promise<CardSubmission[]> {
  const { data, error } = await supabase
    .from('card_submissions')
    .select('*')
    .eq('submitter', userId)
    .order('created_at', { ascending: false });
  if (error) {
    // Thrown (not []) — the same contract as every other fetcher here: an
    // outage must not render as "you have submitted nothing".
    console.error('fetchMySubmissions failed:', error.message);
    throw error;
  }
  return (data as CardSubmission[]) || [];
}

export async function fetchShowcaseStats(): Promise<ShowcaseStats | null> {
  const { data, error } = await supabase.rpc('get_showcase_stats', {
    p_set: SHOWCASE_SET,
  });
  if (error) {
    // Thrown — the same contract as every other fetcher here. Returning null
    // made an outage render as a confidently-wrong "0 / 100 cards" progress
    // meter with no error and no retry.
    console.error('fetchShowcaseStats failed:', error.message);
    throw error;
  }
  return (data as ShowcaseStats) || null;
}

export async function submitCard(input: {
  name: string;
  type: string;
  flavor: string;
  imageUrl: string;
  treatment: SubmissionTreatment;
}): Promise<{ data: CardSubmission | null; error: string | null }> {
  const { data, error } = await supabase.rpc('submit_card', {
    p_name: input.name,
    p_type: input.type,
    p_flavor: input.flavor,
    p_image_url: input.imageUrl,
    p_treatment: input.treatment,
  });
  return { data: (data as CardSubmission) || null, error: rpcError(error) };
}

export async function withdrawSubmission(id: string): Promise<string | null> {
  const { error } = await supabase.rpc('withdraw_card_submission', { p_id: id });
  return rpcError(error);
}

/** Creator-only review queue. `status` null returns every submission. */
export async function fetchSubmissionsForReview(
  status: SubmissionStatus | null = null,
  limit = 200,
): Promise<CardSubmissionForReview[]> {
  const { data, error } = await supabase.rpc('get_card_submissions', {
    p_status: status,
    p_limit: limit,
  });
  if (error) {
    console.error('fetchSubmissionsForReview failed:', error.message);
    throw error;
  }
  return (data as CardSubmissionForReview[]) || [];
}

/** Mechanics derived client-side by `mechanicsFor` (see meta/submissions.ts). */
export interface CardMechanicsPayload {
  keywords: string | null;
  essence_cost: unknown | null;
  essence_types: string[];
  might: number | null;
  grit: number | null;
  card_subtype: string | null;
  resolve: number | null;
  rules_text: string | null;
}

export async function reviewSubmission(input: {
  id: string;
  action: 'approve' | 'deny' | 'deny_ban';
  note?: string | null;
  cardId?: string | null;
  rarity?: string | null;
  name?: string | null;
  type?: string | null;
  flavor?: string | null;
  imageUrl?: string | null;
  mechanics?: CardMechanicsPayload | null;
  /** Creator overrides layered over the derived mechanics, or null for none.
   * Sent inside `p_mechanics`' sibling `p_card` payload by way of
   * `creator_review_submission` -> `apply_card_upsert`. */
  overrides?: Record<string, unknown> | null;
}): Promise<{ data: CardSubmission | null; error: string | null }> {
  const { data, error } = await supabase.rpc('creator_review_submission', {
    p_id: input.id,
    p_action: input.action,
    p_note: input.note ?? null,
    p_card_id: input.cardId ?? null,
    p_rarity: input.rarity ?? null,
    p_name: input.name ?? null,
    p_type: input.type ?? null,
    p_flavor: input.flavor ?? null,
    p_image_url: input.imageUrl ?? null,
    p_mechanics: input.mechanics ?? null,
    p_overrides: input.overrides ?? null,
  });
  return { data: (data as CardSubmission) || null, error: rpcError(error) };
}

export async function setSubmissionBan(
  userId: string,
  banned: boolean,
  reason?: string | null,
): Promise<string | null> {
  const { error } = await supabase.rpc('creator_set_submission_ban', {
    p_user: userId,
    p_banned: banned,
    p_reason: reason ?? null,
  });
  return rpcError(error);
}

export interface BulkAddResult {
  inserted: number;
  updated: number;
  failed: number;
  errors: { row: number; id: string; message: string }[];
}

/**
 * Creator-only bulk import. Rows are validated and written one at a time
 * server-side, so a bad row reports itself instead of rolling back the batch —
 * `failed`/`errors` describe exactly which ones didn't land.
 */
export async function bulkAddCards(
  cards: unknown[],
  overwrite = false,
): Promise<{ data: BulkAddResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('creator_bulk_add_cards', {
    p_cards: cards,
    p_overwrite: overwrite,
  });
  return { data: (data as BulkAddResult) || null, error: rpcError(error) };
}

export async function adminResolveShopReport(
  reportId: string,
  action: 'strike' | 'dismiss',
): Promise<string | null> {
  const { error } = await supabase.rpc('admin_resolve_shop_report', {
    p_report_id: reportId,
    p_action: action,
  });
  return rpcError(error);
}
