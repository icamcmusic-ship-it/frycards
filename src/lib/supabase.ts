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

export interface Profile {
  id: string;
  username: string;
  gold: number;
  gems: number;
  wins: number;
  losses: number;
  games_played: number;
  equipped_card_back: string | null;
  equipped_banner: string | null;
  equipped_avatar: string | null;
  starter_claimed: boolean;
}

export interface ShopItem {
  id: string;
  name: string;
  description: string | null;
  item_type: 'card_back' | 'profile_banner' | 'profile_avatar' | 'starter_deck';
  image_url: string | null;
  cost_gold: number | null;
  cost_gems: number | null;
  rarity: string;
  has_foil_variant: boolean;
  foil_cost_multiplier: number;
  is_season_pass_exclusive: boolean;
  aspect_ratio: string;
  author: string | null;
}

export interface PackSlot {
  type: string;
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
  price_gold: number | null;
  price_gems: number | null;
  pack_tier: string;
  slot_config: PackSlot[];
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
}

export interface OpenPackResult {
  cards: PackPull[];
  gold: number;
  gems: number;
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
  const { data } = await supabase.from('shop_items').select('*').order('item_type').order('cost_gold');
  return (data as ShopItem[]) || [];
}

export async function fetchPackTypes(): Promise<PackType[]> {
  const { data } = await supabase.from('pack_types').select('*');
  const packs = (data as PackType[]) || [];
  // cheapest first, by whichever currency the pack sells for
  return packs.sort(
    (a, b) => (a.price_gold ?? (a.price_gems ?? 0) * 10) - (b.price_gold ?? (b.price_gems ?? 0) * 10)
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

export async function openPack(packId: string, currency: 'gold' | 'gems'): Promise<{ data: OpenPackResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('open_pack', { p_pack_id: packId, p_currency: currency });
  return { data: (data as OpenPackResult) || null, error: rpcError(error) };
}

/**
 * One-time Starter Pack: grants the chosen Leader plus the exact 30 cards of
 * that Leader's prebuilt deck, and saves it as a ready-to-play deck.
 */
export async function claimStarterPack(leaderId: string): Promise<{ data: OpenPackResult | null; error: string | null }> {
  const { data, error } = await supabase.rpc('claim_starter_pack', { p_leader_id: leaderId });
  return { data: (data as OpenPackResult) || null, error: rpcError(error) };
}

export async function buyShopItem(itemId: string, currency: 'gold' | 'gems', foil = false): Promise<string | null> {
  const { error } = await supabase.rpc('buy_shop_item', { p_item_id: itemId, p_currency: currency, p_foil: foil });
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

export async function recordMatchResult(won: boolean): Promise<{ reward: number; gold: number } | null> {
  const { data, error } = await supabase.rpc('record_match_result', { p_won: won });
  if (error) return null;
  return data as { reward: number; gold: number };
}

export async function saveDeck(deck: {
  id?: string;
  user_id: string;
  name: string;
  leader_id: string;
  card_ids: string[];
  is_valid: boolean;
}): Promise<{ data: DeckRow | null; error: string | null }> {
  const payload = { ...deck, updated_at: new Date().toISOString() };
  const { data, error } = deck.id
    ? await supabase.from('decks').update(payload).eq('id', deck.id).select().single()
    : await supabase.from('decks').insert(payload).select().single();
  return { data: (data as DeckRow) || null, error: error ? error.message : null };
}

export async function deleteDeck(deckId: string): Promise<string | null> {
  const { error } = await supabase.from('decks').delete().eq('id', deckId);
  return error ? error.message : null;
}
