// Dev-only offline harness for the META screens (served at /meta-preview.html
// by Vite dev), the counterpart to board-preview.tsx. Those screens all read
// from MetaContext, which needs a live Supabase session — so their layout had
// never been measured at any width. This mounts them against a mock state so
// it can be, without an account.
//
// Pick a screen with ?screen=collection|decks|packs (default: collection).
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { MetaContext, type MetaState } from './meta/MetaContext';
import { CollectionScreen } from './meta/CollectionScreen';
import { DeckBuilderScreen } from './meta/DeckBuilderScreen';
import { PackOpening } from './meta/PackOpening';
import { POOL_V4 } from './game/v3/cardpool';
import type { PlayerCard, DeckRow, Profile } from './lib/supabase';

const profile: Profile = {
  id: 'preview',
  username: 'Preview',
  role: 'player' as Profile['role'],
  credits: 12_345,
  vouchers: 42,
  xp: 3200,
  level: 12,
  wins: 40,
  losses: 31,
  games_played: 71,
  equipped_card_back: null,
  equipped_banner: null,
  equipped_avatar: null,
  last_free_pack_at: null,
  showcase_cards: [],
  hide_serialized_announcements: false,
  login_streak: 3,
  last_login_claim_at: null,
};

// A broad slice of the real pool, so the grids get the same card mix a real
// collection would give them.
const collection: PlayerCard[] = POOL_V4.slice(0, 120).map((c, i) => ({
  card_id: c.id,
  quantity: (i % 4) + 1,
  foil_quantity: i % 7 === 0 ? 1 : 0,
}));

const decks: DeckRow[] = [
  {
    id: 'd1',
    user_id: 'preview',
    name: 'A Deck With A Fairly Long Name',
    leader_id: POOL_V4.find((c) => c.type === 'Leader')?.id ?? 'avatar_of_the_abyss',
    card_ids: POOL_V4.filter((c) => c.type !== 'Leader')
      .slice(0, 60)
      .map((c) => c.id),
    is_valid: true,
    updated_at: new Date(0).toISOString(),
  },
];

const noop = async () => undefined;
const meta: MetaState = {
  session: { user: { id: 'preview' } } as MetaState['session'],
  guest: false,
  loading: false,
  bootError: null,
  retryBoot: () => undefined,
  dataLoading: false,
  profile,
  shopItems: [],
  packTypes: [],
  collection,
  cosmetics: [],
  decks,
  inventory: [],
  serializedCards: [],
  setGuest: () => undefined,
  refreshProfile: noop,
  refreshCollection: noop,
  refreshCosmetics: noop,
  refreshDecks: noop,
  refreshInventory: noop,
  refreshShopItems: noop,
  refreshPackTypes: noop,
  signOut: noop,
};

const which = new URLSearchParams(location.search).get('screen') ?? 'collection';
const back = () => undefined;

const screen =
  which === 'decks' ? (
    <DeckBuilderScreen onBack={back} />
  ) : which === 'packs' ? (
    <PackOpening
      packName="Preview Pack"
      packImageUrl=""
      pulls={POOL_V4.slice(0, 8).map((c, i) => ({
        card_id: c.id,
        name: c.name,
        rarity: c.rarity ?? 'Common',
        card_type: c.type,
        image_url: null,
        foil: i === 0,
        slot: `slot${i}`,
        converted_to_credits: false,
        credit_value: 0,
      }))}
      onDone={back}
    />
  ) : (
    <CollectionScreen onBack={back} />
  );

createRoot(document.getElementById('root')!).render(
  <MetaContext.Provider value={meta}>{screen}</MetaContext.Provider>,
);
