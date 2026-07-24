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
  InventoryEntry,
  fetchProfile,
  fetchShopItems,
  fetchPackTypes,
  fetchCollection,
  fetchCosmetics,
  fetchDecks,
  fetchInventory,
  fetchMySerializedCards,
  OwnedSerializedCard,
} from '../lib/supabase';
import { preloadImages } from '../lib/preload';
import { withTimeout } from '../lib/utils';

export interface MetaState {
  session: Session | null;
  /** true when playing without an account: no persistence, prebuilt decks only. */
  guest: boolean;
  loading: boolean;
  /** Set when the initial store/session bootstrap failed (e.g. offline) — the
   * splash screen shows this with a retry instead of hanging forever. */
  bootError: string | null;
  retryBoot: () => void;
  /** True while the signed-in player's profile/collection/decks/etc. are still
   * loading — check this before rendering "you have none of X" empty states. */
  dataLoading: boolean;
  profile: Profile | null;
  shopItems: ShopItem[];
  packTypes: PackType[];
  collection: PlayerCard[];
  cosmetics: PlayerCosmetic[];
  decks: DeckRow[];
  inventory: InventoryEntry[];
  /** This player's own numbered Serialized pulls — never foil, never
   * quick-sellable (see quicksell_cards' serialized-reserved check). */
  serializedCards: OwnedSerializedCard[];
  setGuest: (g: boolean) => void;
  refreshProfile: () => Promise<void>;
  refreshCollection: () => Promise<void>;
  refreshCosmetics: () => Promise<void>;
  refreshDecks: () => Promise<void>;
  refreshInventory: () => Promise<void>;
  /** Re-fetch the static store catalogs — useful after a Creator Tools admin
   * edit to a pack/shop item so the change shows up without a full reload. */
  refreshShopItems: () => Promise<void>;
  refreshPackTypes: () => Promise<void>;
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
  const [bootError, setBootError] = useState<string | null>(null);
  const [bootAttempt, setBootAttempt] = useState(0);
  /** True while the signed-in player's own data (profile/collection/decks/…)
   * is still loading — distinct from `loading`, which only covers session +
   * static store data. Lets a screen show "loading" instead of a misleading
   * empty state on first mount. */
  const [dataLoading, setDataLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [shopItems, setShopItems] = useState<ShopItem[]>([]);
  const [packTypes, setPackTypes] = useState<PackType[]>([]);
  const [collection, setCollection] = useState<PlayerCard[]>([]);
  const [cosmetics, setCosmetics] = useState<PlayerCosmetic[]>([]);
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [inventory, setInventory] = useState<InventoryEntry[]>([]);
  const [serializedCards, setSerializedCards] = useState<OwnedSerializedCard[]>([]);

  /** Bump to re-run both bootstrap effects below after a failed load. */
  const retryBoot = useCallback(() => {
    setBootError(null);
    setSessionLoading(true);
    setAssetsLoading(true);
    setBootAttempt((n) => n + 1);
  }, []);

  // Session bootstrap + subscription. Network failures here (offline, DNS,
  // Supabase outage) must not leave `loading` stuck true forever — that
  // would hang every player on the splash screen with no way out.
  useEffect(() => {
    let cancelled = false;
    // A request that stalls instead of erroring (dead connection, hung
    // proxy) never resolves the getSession() promise at all — without a
    // bound here, `loading` would stay stuck true forever and the player
    // would be stranded on the splash screen with no retry affordance.
    withTimeout(supabase.auth.getSession(), 20_000, { data: { session: null } } as Awaited<
      ReturnType<typeof supabase.auth.getSession>
    >)
      .then(({ data }) => {
        if (cancelled) return;
        setSession(data.session);
        setSessionLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setBootError("Couldn't reach the server. Check your connection and try again.");
        setSessionLoading(false);
      });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, s) => {
      setSession(s);
      // `guest` only ever gets reset inside signOut() below — a real session
      // arriving through this listener (a stale/duplicate auth event, an
      // OAuth redirect completing, multi-tab session sync) while `guest` was
      // still true from an earlier "play as guest" choice left every screen
      // that gates on `guest` (MainMenu's Collection/Deck Builder/Store/etc.)
      // locked into the guest-restricted UI for an authenticated player, with
      // no way out short of an explicit sign-out.
      if (s) setGuest(false);
    });
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [bootAttempt]);

  // Static store data (public, no auth needed) — preload every pack/cosmetic
  // image up front so the Store never shows art popping in mid-browse.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      withTimeout(fetchShopItems(), 20_000, [] as ShopItem[]),
      withTimeout(fetchPackTypes(), 20_000, [] as PackType[]),
    ])
      .then(([items, packs]) => {
        if (cancelled) return;
        setShopItems(items);
        setPackTypes(packs);
        return preloadImages([...items.map((i) => i.image_url), ...packs.map((p) => p.image_url)]);
      })
      .then(() => {
        if (!cancelled) setAssetsLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setBootError("Couldn't reach the server. Check your connection and try again.");
        setAssetsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bootAttempt]);

  const userId = session?.user?.id;

  const refreshProfile = useCallback(async () => {
    if (!userId) return;
    setProfile(await fetchProfile(userId));
  }, [userId]);
  const refreshCollection = useCallback(async () => {
    if (!userId) return;
    const [coll, serial] = await Promise.all([
      fetchCollection(userId),
      fetchMySerializedCards(userId),
    ]);
    setCollection(coll);
    setSerializedCards(serial);
  }, [userId]);
  const refreshCosmetics = useCallback(async () => {
    if (!userId) return;
    setCosmetics(await fetchCosmetics(userId));
  }, [userId]);
  const refreshDecks = useCallback(async () => {
    if (!userId) return;
    setDecks(await fetchDecks(userId));
  }, [userId]);
  const refreshInventory = useCallback(async () => {
    if (!userId) return;
    setInventory(await fetchInventory(userId));
  }, [userId]);
  const refreshShopItems = useCallback(async () => {
    setShopItems(await fetchShopItems());
  }, []);
  const refreshPackTypes = useCallback(async () => {
    setPackTypes(await fetchPackTypes());
  }, []);

  // Load per-user data when a session appears. Guarded against a fast
  // sign-out/sign-in-as-different-user (or duplicate auth events) firing this
  // effect twice in a row — without `cancelled`, an earlier userId's fetch
  // resolving after a later one started would stomp the newer user's fresh
  // profile/collection/decks with stale (or another account's) data. Fetches
  // directly here (not via the refreshX callbacks below) so every setState
  // this effect makes can be gated on `cancelled` — the shared refreshX
  // callbacks are called from many other places (e.g. "refresh after a
  // purchase") where that guard doesn't apply and shouldn't be added.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!userId) {
        await Promise.resolve();
        if (cancelled) return;
        setProfile(null);
        setCollection([]);
        setCosmetics([]);
        setDecks([]);
        setInventory([]);
        setSerializedCards([]);
        setDataLoading(false);
        return;
      }
      setDataLoading(true);
      try {
        const [prof, coll, serial, cosm, dks, inv] = await Promise.all([
          fetchProfile(userId),
          fetchCollection(userId),
          fetchMySerializedCards(userId),
          fetchCosmetics(userId),
          fetchDecks(userId),
          fetchInventory(userId),
        ]);
        if (cancelled) return;
        setProfile(prof);
        setCollection(coll);
        setSerializedCards(serial);
        setCosmetics(cosm);
        setDecks(dks);
        setInventory(inv);
      } catch {
        // A thrown rejection here (offline/timeout) previously skipped
        // setDataLoading(false) entirely, leaving every screen that gates on
        // it (DeckBuilderScreen, CollectionScreen, …) stuck on its loading
        // state forever with no error and no way out. Reuses the same
        // bootError + retryBoot recovery path as the session/store bootstrap
        // effects above.
        if (cancelled) return;
        setBootError("Couldn't reach the server. Check your connection and try again.");
      } finally {
        if (!cancelled) setDataLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId, bootAttempt]);

  const signOut = useCallback(async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // Server sign-out failed (e.g. network error) — clear the local session
      // anyway so the user isn't stuck signed in.
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // Ignore — local cleanup below still runs.
      }
    }
    setGuest(false);
  }, []);

  return (
    <MetaContext.Provider
      value={{
        session,
        guest,
        loading: sessionLoading || assetsLoading,
        bootError,
        retryBoot,
        dataLoading,
        profile,
        shopItems,
        packTypes,
        collection,
        cosmetics,
        decks,
        inventory,
        serializedCards,
        setGuest,
        refreshProfile,
        refreshCollection,
        refreshCosmetics,
        refreshDecks,
        refreshInventory,
        refreshShopItems,
        refreshPackTypes,
        signOut,
      }}
    >
      {children}
    </MetaContext.Provider>
  );
}
