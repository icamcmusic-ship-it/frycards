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
  subscribeTable,
  OwnedSerializedCard,
} from '../lib/supabase';
import { preloadImages } from '../lib/preload';

/** Unlike `withTimeout` (which resolves to a fallback value so callers can
 * treat "timed out" and "succeeded with this value" identically), a timeout
 * here must NOT look like a normal result: resolving getSession() to
 * `{session: null}` after a stall is indistinguishable from a real logout,
 * and resolving the store catalogs to `[]` is indistinguishable from a
 * genuinely empty Store — both used to silently strand the player instead
 * of surfacing the bootError + retry path that already exists for exactly
 * this. This rejects instead, so the caller's own .catch() handles a stall
 * the same way it already handles a network failure. */
function withDeadline<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timed out')), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

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

/** Exported for the dev-only meta-preview harness (src/meta-preview.tsx),
 * which mounts the collection/deck/pack screens against a mock state so their
 * layout can be measured at phone widths without a Supabase session. Nothing
 * in the app should consume this directly — use `useMeta`. */
export const MetaContext = createContext<MetaState | null>(null);

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
    withDeadline(supabase.auth.getSession(), 20_000)
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
  // image up front so the Store never shows art popping in mid-browse. A
  // failure here must NOT block boot: this is Store-only display data (the
  // Store screen already has its own empty/RETRY handling for an empty
  // `packTypes`/`shopItems`), not something AuthScreen or guest play needs.
  // It used to set the same blocking `bootError` as the session check above,
  // so a network hiccup reaching just this non-essential endpoint (while
  // auth itself was fine, or even entirely offline where guest play should
  // still work) permanently stranded every player — including guests — on
  // the boot-error screen before AuthScreen's PLAY AS GUEST button was ever
  // reachable.
  useEffect(() => {
    let cancelled = false;
    Promise.all([withDeadline(fetchShopItems(), 20_000), withDeadline(fetchPackTypes(), 20_000)])
      .then(([items, packs]) => {
        if (cancelled) return;
        setShopItems(items);
        setPackTypes(packs);
        return preloadImages([...items.map((i) => i.image_url), ...packs.map((p) => p.image_url)]);
      })
      .catch(() => {
        // Leave shopItems/packTypes at their default `[]` — the Store screen
        // already renders a "nothing on the shelf" empty state for that.
      })
      .finally(() => {
        if (!cancelled) setAssetsLoading(false);
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

  // Currency, collection and unopened packs all move server-side without a
  // local action: a shop sale credits the seller, a trade lands cards, an
  // admin grant arrives. Every screen used to depend on somebody remembering
  // to call refreshProfile()/refreshCollection() after the fact. Subscribe to
  // the caller's own rows instead — RLS already scopes these to `userId`, and
  // the filter keeps the socket quiet.
  useEffect(() => {
    if (!userId) return;
    let profileTimer: number | undefined;
    let collectionTimer: number | undefined;
    const debounced = (ref: 'profile' | 'collection', fn: () => void): (() => void) => {
      return () => {
        if (ref === 'profile') {
          window.clearTimeout(profileTimer);
          profileTimer = window.setTimeout(fn, 350);
        } else {
          window.clearTimeout(collectionTimer);
          collectionTimer = window.setTimeout(fn, 350);
        }
      };
    };
    const offProfile = subscribeTable('profiles', debounced('profile', refreshProfile), {
      filter: `id=eq.${userId}`,
    });
    const offCards = subscribeTable('player_cards', debounced('collection', refreshCollection), {
      filter: `user_id=eq.${userId}`,
    });
    const offInv = subscribeTable('player_inventory', debounced('collection', refreshInventory), {
      filter: `user_id=eq.${userId}`,
    });
    return () => {
      window.clearTimeout(profileTimer);
      window.clearTimeout(collectionTimer);
      offProfile();
      offCards();
      offInv();
    };
  }, [userId, refreshProfile, refreshCollection, refreshInventory]);

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
    // Clear local state immediately rather than waiting on onAuthStateChange —
    // if that callback never fires (e.g. the server sign-out failed), the UI
    // would otherwise stay "signed in" against a dead session.
    setSession(null);
    setProfile(null);
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
