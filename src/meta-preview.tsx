// Dev-only offline harness for the META screens (served at /meta-preview.html
// by Vite dev), the counterpart to `board-preview.tsx`.
//
// The collection, deck editor and pack opening all read from `useMeta`, which
// needs a Supabase session — so until v7.5 none of them could be rendered, let
// alone measured, outside a live signed-in app. That is exactly why the v7.4
// mobile pass got the match board playable on a phone and left "the card views
// outside the board have not been measured at all" on the roadmap. This mounts
// them against a stubbed MetaState instead.
//
//   /meta-preview.html?screen=collection
//   /meta-preview.html?screen=decks
//   /meta-preview.html?screen=pack
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { MetaContext, MetaState } from './meta/MetaContext';
import { CollectionScreen } from './meta/CollectionScreen';
import { DeckBuilderScreen } from './meta/DeckBuilderScreen';
import { PackOpening } from './meta/PackOpening';
import { POOL_V4 } from './game/v3/cardpool';
import type { PackPull, Profile } from './lib/supabase';

const profile: Profile = {
  id: 'preview',
  username: 'Preview',
  role: 'player',
  credits: 12_500,
  vouchers: 6,
  xp: 4200,
  level: 12,
  wins: 31,
  losses: 19,
  games_played: 50,
  equipped_card_back: null,
  equipped_banner: null,
  equipped_avatar: null,
  last_free_pack_at: null,
  showcase_cards: [],
  hide_serialized_announcements: false,
  login_streak: 3,
  last_login_claim_at: null,
};

// Own a few copies of everything, so the collection grid renders at its real
// worst case rather than as an empty state.
const collection = POOL_V4.map((c, i) => ({
  card_id: c.id,
  quantity: 1 + (i % 3),
  foil_quantity: i % 7 === 0 ? 1 : 0,
}));

const leader = POOL_V4.find((c) => c.type === 'Leader')!;
const deckCards = POOL_V4.filter((c) => c.type !== 'Leader').slice(0, 60);
const decks = [
  {
    id: 'deck-preview',
    user_id: 'preview',
    name: 'Preview Deck',
    leader_id: leader.id,
    card_ids: deckCards.map((c) => c.id),
    is_valid: true,
    updated_at: new Date(0).toISOString(),
  },
];

const pulls: PackPull[] = POOL_V4.filter((c) => c.type !== 'Leader')
  .slice(0, 8)
  .map((c, i) => ({
    card_id: c.id,
    name: c.name,
    rarity: c.rarity ?? 'Common',
    card_type: c.type,
    image_url: c.image ?? null,
    foil: i === 3,
    slot: `slot-${i + 1}`,
    converted_to_credits: false,
    credit_value: 0,
  }));

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

const screen = new URLSearchParams(window.location.search).get('screen') ?? 'collection';

createRoot(document.getElementById('root')!).render(
  <MetaContext.Provider value={meta}>
    {screen === 'decks' ? (
      <DeckBuilderScreen onBack={() => undefined} />
    ) : screen === 'pack' ? (
      <PackOpening
        packName="Preview Pack"
        packImageUrl={null}
        pulls={pulls}
        onDone={() => undefined}
      />
    ) : (
      <CollectionScreen onBack={() => undefined} />
    )}
  </MetaContext.Provider>,
);
