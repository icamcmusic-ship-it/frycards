import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  supabase,
  Session,
  Profile,
  ShopItem,
  PackType,
  PlayerCard,
  PlayerCosmetic,
  DeckRow,
  fetchProfile,
  fetchShopItems,
  fetchPackTypes,
  fetchCollection,
  fetchCosmetics,
  fetchDecks,
} from '../lib/supabase';
import { preloadImages } from '../lib/preload';

export interface MetaState {
  session: Session | null;
  /** true when playing without an account: no persistence, prebuilt decks only. */
  guest: boolean;
  loading: boolean;
  profile: Profile | null;
  shopItems: ShopItem[];
  packTypes: PackType[];
  collection: PlayerCard[];
  cosmetics: PlayerCosmetic[];
  decks: DeckRow[];
  setGuest: (g: boolean) => void;
  refreshProfile: () => Promise<void>;
  refreshCollection: () => Promise<void>;
  refreshCosmetics: () => Promise<void>;
  refreshDecks: () => Promise<void>;
  signOut: () => Promise<void>;
}

const MetaContext = createContext<MetaState | null>(null);

export function useMeta(): MetaState {
  const ctx = useContext(MetaContext);
  if (!ctx) throw new Error('useMeta must be used inside MetaProvider');
  return ctx;
}

export function MetaProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [guest, setGuest] = useState(false);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [assetsLoading, setAssetsLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [packTypes, setPackTypes] = useState<PackType[]>([]);
  const [collection, setCollection] = useState<PlayerCard[]>([]);
  const [cosmetics, setCosmetics] = useState<PlayerCosmetic[]>([]);
  const [decks, setDecks] = useState<DeckRow[]>([]);

  // Session bootstrap + subscription.
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Static store data (public, no auth needed) — preload every pack/cosmetic
  // image up front so the Store never shows art popping in mid-browse.
  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchShopItems(), fetchPackTypes()])
      .then(([items, packs]) => {
        if (cancelled) return;
        setShopItems(items);
        setPackTypes(packs);
        return preloadImages([...items.map((i) => i.image_url), ...packs.map((p) => p.image_url)]);
      })
      .then(() => {
        if (!cancelled) setAssetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const userId = session?.user?.id;

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    setProfile(await fetchProfile(userId));
  }, [userId]);
  const refreshCollection = useCallback(async () => {
    if (!userId) return;
    setCollection(await fetchCollection(userId));
  }, [userId]);
  const refreshCosmetics = useCallback(async () => {
    if (!userId) return;
    setCosmetics(await fetchCosmetics(userId));
  }, [userId]);
  const refreshDecks = useCallback(async () => {
    if (!userId) return;
    setDecks(await fetchDecks(userId));
  }, [userId]);

  // Load per-user data when a session appears.
  useEffect(() => {
    if (!userId) {
      setProfile(null);
      setCollection([]);
      setCosmetics([]);
      setDecks([]);
      return;
    }
    refreshProfile();
    refreshCollection();
    refreshCosmetics();
    refreshDecks();
  }, [userId, refreshProfile, refreshCollection, refreshCosmetics, refreshDecks]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setGuest(false);
  }, []);

  return (
    <MetaContext.Provider
      value={{
        session,
        guest,
        loading: sessionLoading || assetsLoading,
        profile,
        shopItems,
        packTypes,
        collection,
        cosmetics,
        decks,
        setGuest,
        refreshProfile,
        refreshCollection,
        refreshCosmetics,
        refreshDecks,
        signOut,
      }}
    >
      {children}
    </MetaContext.Provider>
  );
}
