import { cachedFetch } from '../lib/cache';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { createStaleGuard, StaleGuard } from './staleGuard';

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

/** How long cached shop items and pack types are reused before a re-fetch. */
const STORE_TTL_MS = 30 * 60 * 1000;

/** Runs a per-user refresh and applies it only if it is still the newest
 * response for its slice AND the active account has not changed meanwhile. A
 * failed fetch keeps whatever is already on screen. */
async function refreshIfFresh<T>(
  guard: StaleGuard,
  userId: string,
  activeUserId: { current: string | undefined },
  fetcher: (uid: string) => Promise<T>,
  apply: (value: T) => void,
): Promise<void> {
  const ticket = guard.begin();
  try {
    const value = await fetcher(userId);
    if (activeUserId.current === userId && guard.accept(ticket)) apply(value);
  } catch {
    /* keep what is already on screen */
  }
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

/**
 * Exported for the dev-only meta preview harness (`src/meta-preview.tsx`),
 * which mounts the collection / deck editor / pack opening against a stubbed
 * MetaState so their layouts can be measured without a Supabase session. App
 * code should use `useMeta`/`MetaProvider`, never this directly.
 */
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
    // Both are near-static store data; a copy under STORE_TTL_MS old is reused
    // instead of re-fetched on every load. Retrying a failed boot forces it.
    const force = bootAttempt > 0;
    Promise.all([
      withDeadline(cachedFetch('shopItems', STORE_TTL_MS, fetchShopItems, { force }), 20_000),
      withDeadline(cachedFetch('packTypes', STORE_TTL_MS, fetchPackTypes, { force }), 20_000),
    ])
      .then(([items, packs]) => {
        if (cancelled) return;
        setShopItems(items);
        setPackTypes(packs);
        // Store images already load lazily when their cards become visible.
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

  // Every slice has its own stale guard (see staleGuard.ts) and every refresh
  // also checks that the account it was issued for is still the current one.
  // Without both, a slow response from an earlier request could land after a
  // newer one (briefly showing an old balance), and after an account switch the
  // PREVIOUS user's in-flight data could overwrite the new user's state.
  const [guards] = useState(() => ({
    profile: createStaleGuard(),
    collection: createStaleGuard(),
    cosmetics: createStaleGuard(),
    decks: createStaleGuard(),
    inventory: createStaleGuard(),
    shopItems: createStaleGuard(),
    packTypes: createStaleGuard(),
  }));
  const userIdRef = useRef(userId);
  /** Called whenever the active account changes: abandon everything in flight. */
  const dropInFlight = useCallback(
    (nextUserId: string | undefined) => {
      userIdRef.current = nextUserId;
      guards.profile.invalidate();
      guards.collection.invalidate();
      guards.cosmetics.invalidate();
      guards.decks.invalidate();
      guards.inventory.invalidate();
    },
    [guards],
  );

  // The refreshX callbacks are fired from dozens of "refresh after a
  // purchase/claim/trade" call sites and from the realtime subscription below.
  // The underlying fetchers throw on a query failure (so the boot effect can
  // distinguish "failed" from "genuinely empty") — but a mid-session refresh
  // failing must keep whatever is already on screen, not blank the wallet or
  // wipe the collection, and must not surface as an unhandled rejection at a
  // call site that never expected one. So each catches and keeps prior state.
  const refreshProfile = useCallback(
    () =>
      userId
        ? refreshIfFresh(guards.profile, userId, userIdRef, fetchProfile, setProfile)
        : Promise.resolve(),
    [userId, guards],
  );
  const refreshCollection = useCallback(
    () =>
      userId
        ? refreshIfFresh(
            guards.collection,
            userId,
            userIdRef,
            (uid) => Promise.all([fetchCollection(uid), fetchMySerializedCards(uid)]),
            ([coll, serial]) => {
              setCollection(coll);
              setSerializedCards(serial);
            },
          )
        : Promise.resolve(),
    [userId, guards],
  );
  const refreshCosmetics = useCallback(
    () =>
      userId
        ? refreshIfFresh(guards.cosmetics, userId, userIdRef, fetchCosmetics, setCosmetics)
        : Promise.resolve(),
    [userId, guards],
  );
  const refreshDecks = useCallback(
    () =>
      userId
        ? refreshIfFresh(guards.decks, userId, userIdRef, fetchDecks, setDecks)
        : Promise.resolve(),
    [userId, guards],
  );
  const refreshInventory = useCallback(
    () =>
      userId
        ? refreshIfFresh(guards.inventory, userId, userIdRef, fetchInventory, setInventory)
        : Promise.resolve(),
    [userId, guards],
  );
  const refreshShopItems = useCallback(async () => {
    const ticket = guards.shopItems.begin();
    try {
      const items = await cachedFetch('shopItems', STORE_TTL_MS, fetchShopItems, { force: true });
      if (guards.shopItems.accept(ticket)) setShopItems(items);
    } catch {
      /* keep prior state */
    }
  }, [guards]);
  const refreshPackTypes = useCallback(async () => {
    const ticket = guards.packTypes.begin();
    try {
      const packs = await cachedFetch('packTypes', STORE_TTL_MS, fetchPackTypes, { force: true });
      if (guards.packTypes.accept(ticket)) setPackTypes(packs);
    } catch {
      /* keep prior state */
    }
  }, [guards]);

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
    dropInFlight(userId);
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
      // Tickets are taken before the requests start, so a refresh that begins
      // (and lands) while this load is still in flight wins over it.
      const tickets = {
        profile: guards.profile.begin(),
        collection: guards.collection.begin(),
        cosmetics: guards.cosmetics.begin(),
        decks: guards.decks.begin(),
        inventory: guards.inventory.begin(),
      };
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
        if (guards.profile.accept(tickets.profile)) setProfile(prof);
        if (guards.collection.accept(tickets.collection)) {
          setCollection(coll);
          setSerializedCards(serial);
        }
        if (guards.cosmetics.accept(tickets.cosmetics)) setCosmetics(cosm);
        if (guards.decks.accept(tickets.decks)) setDecks(dks);
        if (guards.inventory.accept(tickets.inventory)) setInventory(inv);
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
  }, [userId, bootAttempt, guards, dropInFlight]);

  // Currency, collection and unopened packs all move server-side without a
  // local action: a shop sale credits the seller, a trade lands cards, an
  // admin grant arrives. Every screen used to depend on somebody remembering
  // to call refreshProfile()/refreshCollection() after the fact. Subscribe to
  // the caller's own rows instead — RLS already scopes these to `userId`, and
  // the filter keeps the socket quiet.
  useEffect(() => {
    if (!userId) return;
    // Each subscription gets its own debounce timer — sharing one would let a
    // player_inventory event cancel a pending player_cards refresh (and vice
    // versa) when both tables change in the same transaction, leaving one of
    // them stale.
    const timers: Record<string, number | undefined> = {};
    const debounced = (ref: string, fn: () => void): (() => void) => {
      return () => {
        window.clearTimeout(timers[ref]);
        timers[ref] = window.setTimeout(fn, 350);
      };
    };
    const offProfile = subscribeTable('profiles', debounced('profile', refreshProfile), {
      filter: `id=eq.${userId}`,
    });
    const offCards = subscribeTable('player_cards', debounced('cards', refreshCollection), {
      filter: `user_id=eq.${userId}`,
    });
    const offInv = subscribeTable('player_inventory', debounced('inventory', refreshInventory), {
      filter: `user_id=eq.${userId}`,
    });
    return () => {
      for (const t of Object.values(timers)) window.clearTimeout(t);
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
    dropInFlight(undefined);
    setSession(null);
    setProfile(null);
    setGuest(false);
  }, [dropInFlight]);

  const value = useMemo(
    () => ({
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
    }),
    [
      session,
      guest,
      sessionLoading,
      assetsLoading,
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
      refreshProfile,
      refreshCollection,
      refreshCosmetics,
      refreshDecks,
      refreshInventory,
      refreshShopItems,
      refreshPackTypes,
      signOut,
    ],
  );

  return <MetaContext.Provider value={value}>{children}</MetaContext.Provider>;
}
