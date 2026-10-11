import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { sellableSplit } from './sellable';
import { askConfirm } from './confirm';
import { useMeta } from './MetaContext';
import {
  MetaHeader,
  PopButton,
  Notice,
  ProgressBar,
  CardMarketValuePanel,
  Credits,
  UnavailableShowcaseTile,
  Tabs,
} from './ui';
import { FilterSelect } from './FilterSelect';
import { usePersistedState } from './usePersistedState';
import { useReducedMotion } from './useMotionMode';
import {
  COLOR_FILTERS,
  DEFAULT_FILTERS,
  MAX_PRESET_NAME,
  RARITY_FILTERS,
  RULE_FILTERS,
  SORTS,
  TIER_FILTERS,
  TYPES,
  activeFilterCount,
  cardMatchesFilters,
  compareCards,
  ruleFilterLabel,
  deletePreset,
  isFilters,
  isPresetList,
  quicksellConfirmText,
  sanitizeFilters,
  savePreset,
  spareValueByRarity,
  suggestPresetName,
  type CollectionFilters,
  type CollectionView,
  type FilterPreset,
  type SortKey,
} from './collectionFilters';
import { cn } from '../lib/utils';
import { useIsNarrow } from '../lib/useIsNarrow';
import { CARD_SIZES, CardFace } from '../components/CardFaceV4';
import { collectionCsv, downloadText } from './csv';
import {
  loadWishlist,
  pushWishlistToggle,
  saveWishlist,
  syncWishlist,
  toggleWishlisted,
} from './wishlist';
import { Card3DInspector } from '../components/Card3DInspector';
import { POOL, POOL_BY_ID } from '../game/poker/cardpool';
import { CardDef } from '../game/poker/cards';
import { RARITIES } from '../types';
import { quicksellCards, setShowcaseCards } from '../lib/supabase';
import { GradedCard, fetchGradedCards, gradedQuicksellPrice } from './grading';
import { GradedSlab } from './GradedSlab';
import { SlabDetailModal } from './SlabDetailModal';
import { AnimatePresence } from 'motion/react';
import type { ShowroomSubject } from './ShowroomScreen';
import { isPremiumRarity } from '../components/Card3DShowroom';
import { fmtCredits, quicksellPrice } from './economy';
import { cardColors } from '../game/poker/colors';

const MAX_SHOWCASE = 6;

/** Spare (unlocked) normal/foil split for one card, modeling decks as
 * consuming normal copies first and only spilling into foil once normal is
 * exhausted. Shared by bulk quicksell and the per-card inspector panel so
 * both agree on what's actually sellable — they used to diverge, letting the
 * inspector's normal/foil buttons enable off an undifferentiated total. */
export function spareSplit(o: { q: number; f: number } | undefined, locked: number) {
  if (!o) return { normal: 0, foil: 0 };
  const spareTotal = Math.max(0, o.q + o.f - locked);
  const spareFoil = Math.max(0, o.f - Math.max(0, locked - o.q));
  return { normal: spareTotal - spareFoil, foil: spareFoil };
}

/** Runs the actual sell loop for "QUICKSELL ALL <rarity>", outside the
 * component so its running-total accumulation across `await`s isn't subject
 * to the React Compiler's mutability analysis (which only instruments
 * components/hooks). `onProgress` is called after each successful sale with
 * the running card count so the caller can drive a live progress bar. */
async function runBulkQuicksell(
  targetRarity: string,
  owned: Map<string, { q: number; f: number }>,
  lockedByDecks: Map<string, number>,
  serializedByCard: Map<string, unknown[]>,
  onProgress: (cardsSoFar: number) => void,
): Promise<{ credits: number; cards: number; error: string | null }> {
  let totalCredits = 0;
  let totalCards = 0;
  for (const c of POOL) {
    if (c.type === 'Leader' || (c.rarity || 'Common') !== targetRarity) continue;
    const o = owned.get(c.id);
    if (!o) continue;
    const locked = lockedByDecks.get(c.id) || 0;
    const reserved = serializedByCard.get(c.id)?.length || 0;
    // Normal copies first, then whatever foil the deck locks still allow.
    const s = sellableSplit(o, locked, reserved);
    const spareNormal = s.normal;
    const spareFoil = s.total - s.normal;
    if (s.total <= 0) continue;
    for (const [foil, qty] of [
      [false, spareNormal],
      [true, spareFoil],
    ] as const) {
      if (qty <= 0) continue;
      const { data, error } = await quicksellCards(c.id, qty, foil);
      if (error) {
        return { credits: totalCredits, cards: totalCards, error };
      }
      if (data) {
        totalCredits += data.total;
        totalCards += data.sold;
        onProgress(totalCards);
      }
    }
  }
  return { credits: totalCredits, cards: totalCards, error: null };
}

/**
 * One grid tile. Memoized on primitives (the `entries` list is rebuilt on every
 * keystroke in the search box, so entry objects are never reference-equal), and
 * wrapped in `content-visibility: auto` so cards scrolled out of view skip
 * layout and paint. That implies paint containment, so the wrapper pads and
 * un-pads by 8px to keep the card's hard shadow and focus ring from clipping.
 */
const CollectionTile = React.memo(function CollectionTile({
  def,
  kind,
  count,
  serialNumber,
  serialCap,
  narrow,
  wished,
  isNew,
  onInspect,
}: {
  def: CardDef;
  kind: 'normal' | 'foil' | 'serialized';
  count?: number;
  serialNumber?: number;
  serialCap?: number;
  narrow: boolean;
  wished: boolean;
  /** Owned now but not at the last visit to the Collection. */
  isNew?: boolean;
  onInspect: (def: CardDef, foil: boolean, serial?: { number: number; cap: number }) => void;
}) {
  const size = narrow ? 'standard' : 'full';
  const { w, h } = CARD_SIZES[size];
  const serial = React.useMemo(
    () =>
      serialNumber !== undefined ? { number: serialNumber, cap: serialCap as number } : undefined,
    [serialNumber, serialCap],
  );
  const onClick = React.useCallback(
    () => onInspect(def, kind === 'foil', serial),
    [onInspect, def, kind, serial],
  );
  return (
    <div
      style={{
        contentVisibility: 'auto',
        containIntrinsicSize: `${w + 16}px ${h + 16}px`,
        padding: 8,
        margin: -8,
      }}
    >
      <CardFace
        def={def}
        size={size}
        count={kind !== 'serialized' ? count : undefined}
        foil={kind === 'foil'}
        serial={serial}
        dimmed={kind === 'normal' && count === 0}
        badge={isNew ? '● NEW' : wished ? '♥ WISH' : undefined}
        onClick={onClick}
      />
    </div>
  );
});

/** A titled section that folds away. The open/closed choice is remembered per
 * viewer. `peek` stays visible when folded (a progress bar, a one-line
 * summary), so a closed panel still says something. */
function CollapsiblePanel({
  id,
  title,
  summary,
  peek,
  children,
}: {
  id: string;
  title: string;
  summary?: React.ReactNode;
  peek?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = usePersistedState(`collection.panel.${id}`, false);
  const bodyId = `collection-panel-${id}`;
  return (
    <section className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm px-3 mb-3">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 min-h-[44px] sm:min-h-[36px] text-left"
      >
        <span className="heading-font text-sm">{title}</span>
        <span className="fs-xs font-black text-right">
          {summary} {open ? '▴' : '▾'}
        </span>
      </button>
      {peek && <div className="pb-2.5 -mt-1">{peek}</div>}
      {open && (
        <div id={bodyId} className="pb-3">
          {children}
        </div>
      )}
    </section>
  );
}

export function CollectionScreen({
  onBack,
  onGrading,
  onShowroom,
}: {
  onBack: () => void;
  /** Navigate to the Grading Lab — the graded shelf's slabs deep-link there. */
  onGrading?: () => void;
  /** Stand this card (or slab) up in the 3D Showroom. The inspector is a
   * modal that tilts; the Showroom is a page that turns. */
  onShowroom?: (subject: ShowroomSubject) => void;
}) {
  // v7.5: the browse grid printed `full` (240x336) cards. On a 375px phone
  // that is ONE card per row and, at 297 cards plus foil/serialized entries,
  // a 119,000px-tall page — the collection was effectively unbrowsable on a
  // phone. `standard` fits two per row inside the same padding.
  const narrow = useIsNarrow();
  const reducedMotion = useReducedMotion();
  const {
    profile,
    collection,
    refreshCollection,
    refreshProfile,
    decks,
    dataLoading,
    serializedCards,
  } = useMeta();

  // The sticky search/filter bar sits just under the (sticky) header, whose
  // height changes when its chips wrap on a phone — measure it rather than
  // hard-coding a number.
  const rootRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const root = rootRef.current;
    const header = root?.firstElementChild as HTMLElement | null | undefined;
    if (!root || !header || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() =>
      root.style.setProperty('--hdr', `${header.offsetHeight}px`),
    );
    ro.observe(header);
    return () => ro.disconnect();
  }, []);

  // Filters, sort and view are remembered between visits (per viewer) and can
  // be saved as named presets. The search text is not: it is a one-off lookup.
  const [storedFilters, setStoredFilters] = usePersistedState(
    'collection.filters',
    DEFAULT_FILTERS,
    isFilters,
  );
  const filters = useMemo(() => sanitizeFilters(storedFilters), [storedFilters]);
  const { view, type, rarity, color, tier, rule, sort } = filters;
  const setFilter = <K extends keyof CollectionFilters>(k: K, v: CollectionFilters[K]) =>
    setStoredFilters({ ...filters, [k]: v });
  const [presets, setPresets] = usePersistedState<FilterPreset[]>(
    'collection.presets',
    [],
    isPresetList,
  );
  const [presetName, setPresetName] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pinHint, setPinHint] = useState(false);
  const gridRef = useRef<HTMLDivElement>(null);

  // The wishlist cache is per account (and per guest); the server list is
  // pulled in on top of it. Keyed by uid so switching accounts on one browser
  // can never show, or upload, the previous account's entries.
  const wishUserId = profile?.id;
  const [wishState, setWishState] = useState(() => ({
    uid: wishUserId,
    ids: loadWishlist(wishUserId),
  }));
  const wishlist = useMemo(
    () => (wishState.uid === wishUserId ? wishState.ids : loadWishlist(wishUserId)),
    [wishState, wishUserId],
  );
  useEffect(() => {
    if (!wishUserId) return;
    let cancelled = false;
    void syncWishlist(wishUserId).then((synced) => {
      if (!cancelled) setWishState({ uid: wishUserId, ids: synced });
    });
    return () => {
      cancelled = true;
    };
  }, [wishUserId]);
  const toggleWish = useCallback(
    (cardId: string) => {
      const next = toggleWishlisted(wishlist, cardId);
      saveWishlist(next, wishUserId);
      if (wishUserId) void pushWishlistToggle(wishUserId, cardId, next.has(cardId));
      setWishState({ uid: wishUserId, ids: next });
    },
    [wishlist, wishUserId],
  );
  // Graded slabs live in their own table (graded_cards) — encased copies are
  // out of player_cards entirely, so the shelf fetches them directly.
  const [gradedCards, setGradedCards] = useState<GradedCard[]>([]);
  useEffect(() => {
    if (!profile) return;
    let cancelled = false;
    fetchGradedCards(profile.id)
      .then((rows) => {
        if (!cancelled) setGradedCards(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [profile?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  // The slab whose detail sheet is open (graded_cards.id).
  const [slabOpen, setSlabOpen] = useState<string | null>(null);
  const [slabSort, setSlabSort] = usePersistedState<
    'pinned' | 'grade' | 'value' | 'service' | 'newest'
  >('collection.slabSort', 'pinned', (v): v is 'pinned' =>
    ['pinned', 'grade', 'value', 'service', 'newest'].includes(v as string),
  );
  const reloadGraded = useCallback(async () => {
    if (!profile) return;
    try {
      setGradedCards(await fetchGradedCards(profile.id));
    } catch {
      /* keep what is shown */
    }
  }, [profile]);
  // Which standalone tile in the grid is open in the inspector — normal,
  // foil, and each serialized print are now separate tiles (see `entries`
  // below), so this tracks which variant was actually clicked in addition
  // to the card itself. The sell/showcase panel below still operates on the
  // card id as a whole (selling doesn't care which tile you opened it from).
  const [inspect, setInspect] = useState<{
    def: CardDef;
    foil?: boolean;
    serial?: { number: number; cap: number };
  } | null>(null);
  const [sellError, setSellError] = useState('');
  // Stable, so the memoized grid tiles are not re-rendered by unrelated state.
  const openInspector = useCallback(
    (def: CardDef, foil: boolean, serial?: { number: number; cap: number }) => {
      setInspect({ def, foil, serial });
      setSellError('');
      setPinHint(false);
    },
    [],
  );
  const [selling, setSelling] = useState(false);
  const [showcaseBusy, setShowcaseBusy] = useState(false);
  const [showcaseError, setShowcaseError] = useState('');

  // Every poker keyword some card in the pool carries, for the keyword filter.
  const keywordOptions = useMemo(() => {
    const kws = new Set<string>();
    for (const c of POOL) for (const k of c.keywords ?? []) kws.add(k);
    return ['All', ...[...kws].sort()];
  }, []);
  // Location rules some Location in the pool prints, for the rule filter.
  const ruleOptions = useMemo(() => {
    const ids = new Set<string>();
    for (const c of POOL) if (c.rule) ids.add(c.rule.id);
    return RULE_FILTERS.filter((r) => r === 'All' || ids.has(r));
  }, []);

  // Set filter. Derived from the live pool rather than a constant so the
  // Player Showcase set (and any later volume) shows up the moment its first
  // card is printed — the browser was single-set until v12 and had no way to
  // tell community cards from Volume #1 ones.
  const setFilters = useMemo(() => {
    const names = new Set<string>();
    for (const c of POOL) if (c.set) names.add(c.set);
    return ['All', ...[...names].sort()];
  }, []);
  // A remembered keyword/set that the pool no longer has must not silently
  // empty the grid with no control showing why.
  const keyword = keywordOptions.includes(filters.keyword) ? filters.keyword : 'All';
  const ruleSel = ruleOptions.includes(rule) ? rule : 'All';
  const setName = setFilters.includes(filters.set) ? filters.set : 'All';

  const showcase = profile?.showcase_cards || [];

  const toggleShowcase = async (cardId: string) => {
    if (showcaseBusy) return;
    const inShowcase = showcase.includes(cardId);
    if (!inShowcase && showcase.length >= MAX_SHOWCASE) {
      setShowcaseError(`You can only showcase up to ${MAX_SHOWCASE} cards.`);
      return;
    }
    const next = inShowcase ? showcase.filter((id) => id !== cardId) : [...showcase, cardId];
    setShowcaseBusy(true);
    setShowcaseError('');
    try {
      const err = await setShowcaseCards(next);
      if (err) setShowcaseError(err);
      // `showcase` above is derived from `profile.showcase_cards`, and the
      // next toggle recomputes `next` from that same stale array — release
      // the busy guard only once the refetched profile actually reflects
      // this write, or a second quick click can overwrite this one's change.
      else await refreshProfile();
    } catch {
      // setShowcaseCards/refreshProfile rejecting outright (network error,
      // Supabase client throwing instead of returning {error}) used to leave
      // the click looking like it did nothing at all — no error, no updated
      // showcase, just a silently reset busy flag. Every other RPC-backed
      // action in this app (handleEquip, handleRename, bulkQuicksell, …)
      // surfaces this case with a visible Notice; this one didn't.
      setShowcaseError('Something went wrong — check your connection and try again.');
    } finally {
      setShowcaseBusy(false);
    }
  };

  const owned = useMemo(() => {
    const m = new Map<string, { q: number; f: number }>();
    for (const pc of collection) m.set(pc.card_id, { q: pc.quantity, f: pc.foil_quantity });
    return m;
  }, [collection]);

  const serializedByCard = useMemo(() => {
    const m = new Map<string, typeof serializedCards>();
    for (const s of serializedCards) {
      const list = m.get(s.card_id);
      if (list) list.push(s);
      else m.set(s.card_id, [s]);
    }
    return m;
  }, [serializedCards]);

  // Copies locked into any of the player's decks can't be quicksold until
  // they're removed from every deck.
  //
  // This SUMS across decks, matching every server sell/list path:
  // `save_deck`, `get_listable_inventory`, `quicksell_cards`, and
  // `assert_cards_available` all reserve one copy per deck naming the card and
  // sum them (the v8.0 migration aligned quicksell/assert onto this reading).
  // A card split across two saved decks is therefore locked out of quicksell
  // and listing until it is removed from every deck holding it.
  const lockedByDecks = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of decks) for (const id of d.card_ids) m.set(id, (m.get(id) || 0) + 1);
    return m;
  }, [decks]);
  // Leaders aren't consumed per-copy like deck card_ids, but if the player
  // owns 2+ copies of the same Leader, two different saved decks can each
  // reference it — each such deck reserves its own copy. A plain Set here
  // would dedupe those decks down to "1 copy reserved" and let the player
  // quicksell a copy that a second deck still needs.
  const leadersInUse = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of decks) m.set(d.leader_id, (m.get(d.leader_id) || 0) + 1);
    return m;
  }, [decks]);

  // Spare (unlocked) copies across the whole collection — Leaders excluded
  // (they're never bulk-fodder) — per card (the SPARES view) and per rarity
  // with what they would sell for (the "QUICKSELL ALL <rarity>" bulk actions).
  // Same arithmetic as runBulkQuicksell above (sellableSplit: deck locks and
  // Serialized prints are two independent server checks, normal copies sell
  // first), so the progress bar's total matches what the loop actually sells.
  const { spareByCard, spareValues } = useMemo(() => {
    const byCard = new Map<string, number>();
    const rows: { rarity: string; normal: number; foil: number }[] = [];
    for (const c of POOL) {
      if (c.type === 'Leader') continue;
      const o = owned.get(c.id);
      if (!o) continue;
      const reserved = serializedByCard.get(c.id)?.length || 0;
      const s = sellableSplit(o, lockedByDecks.get(c.id) || 0, reserved);
      if (s.total <= 0) continue;
      byCard.set(c.id, s.total);
      rows.push({ rarity: c.rarity || 'Common', normal: s.normal, foil: s.total - s.normal });
    }
    return { spareByCard: byCard, spareValues: spareValueByRarity(rows) };
  }, [owned, lockedByDecks, serializedByCard]);
  const spareCount = (r: string) => spareValues.get(r)?.cards ?? 0;
  // Which rarity's bulk sell is running (null = idle) — keyed so the OTHER
  // rarity's button doesn't also read "SELLING…" while one runs.
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);
  // Live "SELLING i/N…" progress while the bulk loop runs — a long loop
  // previously sat on a static "SELLING…" with no sign it was advancing.
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number } | null>(null);
  const [bulkNotice, setBulkNotice] = useState('');
  const [bulkError, setBulkError] = useState('');

  const bulkQuicksell = async (targetRarity: string) => {
    if (bulkBusy) return;
    setBulkBusy(targetRarity);
    setBulkError('');
    setBulkNotice('');
    setBulkProgress({ done: 0, total: spareCount(targetRarity) });
    try {
      const { credits, cards, error } = await runBulkQuicksell(
        targetRarity,
        owned,
        lockedByDecks,
        serializedByCard,
        (cardsSoFar) => setBulkProgress((p) => (p ? { ...p, done: cardsSoFar } : p)),
      );
      if (error) {
        // Cards from earlier iterations may already have sold (and the
        // credits already paid out) before this one failed — say so
        // instead of reporting a bare error that implies nothing happened.
        setBulkError(
          cards > 0
            ? `Sold ${cards} card${cards === 1 ? '' : 's'} for ${fmtCredits(credits)} before an error occurred: ${error}`
            : error,
        );
        return;
      }
      setBulkNotice(
        cards === 0
          ? `No spare ${targetRarity} cards to sell.`
          : `Quicksold ${cards} ${targetRarity} card${cards === 1 ? '' : 's'} for ${fmtCredits(credits)}.`,
      );
    } catch {
      setBulkError('Something went wrong — check your connection and try again.');
    } finally {
      // Refresh BEFORE releasing the bulk-busy flag — re-enabling the bulk
      // buttons against stale spare counts let an immediate re-click run the
      // whole sell loop into a mid-loop server error.
      try {
        await Promise.all([refreshCollection(), refreshProfile()]);
      } catch {
        // The sale itself already succeeded/reported; a failed refresh just
        // means the realtime subscription will catch the counts up.
      }
      setBulkBusy(null);
      setBulkProgress(null);
    }
  };

  const filtered = POOL.filter((c) => {
    const o = owned.get(c.id);
    const total = (o?.q || 0) + (o?.f || 0);
    if (view === 'wishlist' && !wishlist.has(c.id)) return false;
    if (view === 'owned' && total === 0) return false;
    if (view === 'spares' && !spareByCard.has(c.id)) return false;
    if (!cardMatchesFilters(c, { type, rarity, color, keyword, tier, rule: ruleSel, set: setName }))
      return false;
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort(compareCards(sort));

  // Foil and Serialized copies are their own standalone tiles in the grid —
  // not a count badge folded into the normal tile — so each is inspectable/
  // showcaseable on its own. A card's `quantity` (`o.q`) includes any
  // serialized copies of it (see quicksell_cards' serialized-reserved
  // check), so those are subtracted out of the normal tile's count here.
  const entries = useMemo(() => {
    const out: {
      def: CardDef;
      kind: 'normal' | 'foil' | 'serialized';
      count?: number;
      serial?: { number: number; cap: number };
    }[] = [];
    for (const c of filtered) {
      const o = owned.get(c.id);
      const serials = serializedByCard.get(c.id) || [];
      const normalQty = Math.max(0, (o?.q || 0) - serials.length);
      const foilQty = o?.f || 0;
      if (normalQty > 0) out.push({ def: c, kind: 'normal', count: normalQty });
      if (foilQty > 0) out.push({ def: c, kind: 'foil', count: foilQty });
      for (const s of serials) {
        out.push({ def: c, kind: 'serialized', serial: { number: s.serial_number, cap: s.cap } });
      }
      if (normalQty === 0 && foilQty === 0 && serials.length === 0) {
        out.push({ def: c, kind: 'normal', count: 0 });
      }
    }
    return out;
  }, [filtered, owned, serializedByCard]);

  const totalOwned = collection.reduce((s, c) => s + c.quantity + c.foil_quantity, 0);
  const uniqueOwned = collection.filter((c) => c.quantity + c.foil_quantity > 0).length;
  const pctOwned = POOL.length > 0 ? Math.round((uniqueOwned / POOL.length) * 100) : 0;

  // Per-rarity completion for the progress panel.
  const rarityProgress = useMemo(() => {
    const totals = new Map<string, { total: number; owned: number }>();
    for (const c of POOL) {
      const r = c.rarity || 'Common';
      const e = totals.get(r) || { total: 0, owned: 0 };
      e.total += 1;
      const o = owned.get(c.id);
      if ((o?.q || 0) + (o?.f || 0) > 0) e.owned += 1;
      totals.set(r, e);
    }
    return RARITIES.map((r) => ({
      rarity: r,
      ...(totals.get(r) || { total: 0, owned: 0 }),
    })).filter((e) => e.total > 0);
  }, [owned]);
  // Per-set and per-colour completion, same rule as rarityProgress (any copy
  // counts). Multi-colour cards count toward each of their colours.
  const [progressBy, setProgressBy] = usePersistedState<'rarity' | 'set' | 'colour'>(
    'collection.progressBy',
    'rarity',
    (v): v is 'rarity' => ['rarity', 'set', 'colour'].includes(v as string),
  );
  const groupProgress = useMemo(() => {
    const totals = new Map<string, { total: number; owned: number }>();
    const bump = (k: string, has: boolean) => {
      const e = totals.get(k) || { total: 0, owned: 0 };
      e.total += 1;
      if (has) e.owned += 1;
      totals.set(k, e);
    };
    for (const c of POOL) {
      const o = owned.get(c.id);
      const has = (o?.q || 0) + (o?.f || 0) > 0;
      if (progressBy === 'set') bump(c.set ?? 'FryCards', has);
      else if (progressBy === 'colour') {
        const cols = c.type === 'Leader' ? [] : cardColors(c);
        for (const col of cols.length ? cols : ['Colourless']) bump(String(col), has);
      }
    }
    return [...totals.entries()]
      .map(([label, e]) => ({ label, ...e }))
      .sort((a, b) => b.total - a.total);
  }, [owned, progressBy]);

  // "New since your last visit": the owned-id set is snapshotted to
  // localStorage, and anything owned now but missing from the snapshot is
  // NEW for this visit. The snapshot is refreshed after the comparison, so
  // the dots clear on the next visit, not while you are looking at them.
  // Read once, at mount — before the effect below overwrites it.
  const [seenAtMount] = useState(readSeenSnapshot);
  const newIds = useMemo(() => {
    if (!seenAtMount) return new Set<string>();
    return new Set(
      collection
        .filter((c) => c.quantity + c.foil_quantity > 0 && !seenAtMount.has(c.card_id))
        .map((c) => c.card_id),
    );
  }, [collection, seenAtMount]);
  useEffect(() => {
    if (dataLoading || collection.length === 0) return;
    writeSeenSnapshot(
      collection.filter((c) => c.quantity + c.foil_quantity > 0).map((c) => c.card_id),
    );
  }, [collection, dataLoading]);

  const activeFilters = activeFilterCount({ ...filters, keyword, rule: ruleSel, set: setName });
  const filtersDirty = activeFilters > 0 || view !== 'owned' || search !== '';
  const clearFilters = () => {
    // Color was missing from this reset once — a color-filtered empty grid
    // stayed empty after "clearing" filters. Set had the same hole the moment
    // a second set existed. Everything but the sort goes back to default.
    setStoredFilters({ ...DEFAULT_FILTERS, sort });
    setSearch('');
  };
  const savePresetNow = () => {
    if (presetName === null) return;
    setPresets(savePreset(presets, presetName, filters));
    setPresetName(null);
  };
  // Showcase empty state: take the player to their cards, unfiltered, with a
  // hint about the one thing to do there.
  const startPinning = () => {
    clearFilters();
    setPinHint(true);
    setFiltersOpen(false);
    requestAnimationFrame(() =>
      gridRef.current?.scrollIntoView({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'start',
      }),
    );
  };

  const inspectOwned = inspect ? owned.get(inspect.def.id) : undefined;
  const inspectLocked = inspect
    ? inspect.def.type === 'Leader'
      ? leadersInUse.get(inspect.def.id) || 0
      : lockedByDecks.get(inspect.def.id) || 0
    : 0;
  const inspectTotal = (inspectOwned?.q || 0) + (inspectOwned?.f || 0);
  const inspectShowcased = inspect ? showcase.includes(inspect.def.id) : false;
  // Serialized prints are never foil and can never be quick sold
  // (see quicksell_cards' serialized-reserved check) — reserve that many
  // normal copies from the sell UI so it never offers a sale the
  // server will reject.
  const inspectSerializedReserved = inspect
    ? serializedCards.filter((s) => s.card_id === inspect.def.id).length
    : 0;
  // Same normal-first/foil-spillover model bulkQuicksell uses — this used to
  // be a single undifferentiated "spare" figure shared by both the normal
  // and foil buttons, which could show a normal copy as sellable when every
  // normal copy was actually deck-locked (and only foil was spare), or vice
  // versa.
  // Two independent server checks (deck locks vs Serialized), see sellable.ts.
  const inspectSellable = sellableSplit(inspectOwned, inspectLocked, inspectSerializedReserved);
  const normalSellable = inspectSellable.normal;
  const spareFoil = inspectSellable.foil;
  // `q` (player_cards.quantity) INCLUDES serialized copies — the grid
  // subtracts them for the normal tile's count, and the inspector must agree
  // or "Normal ×3" appears beside sell buttons that can only move 1.
  const inspectNormalQty = Math.max(0, (inspectOwned?.q || 0) - inspectSerializedReserved);
  const foilSellable = spareFoil;

  const handleSell = async (foil: boolean, quantity: number) => {
    if (!inspect || selling || quantity < 1) return;
    setSelling(true);
    setSellError('');
    try {
      const { error } = await quicksellCards(inspect.def.id, quantity, foil);
      if (error) {
        setSellError(error);
        return;
      }
      // Awaited before `finally` releases `selling` — re-enabling the sell
      // buttons against the stale counts let a fast second click sell copies
      // that no longer exist (server rejects it, but with a scary error).
      await Promise.all([refreshCollection(), refreshProfile()]);
    } catch {
      // quicksellCards rejecting outright (network error) instead of
      // returning {error} previously left the button silently stop
      // spinning with no message at all.
      setSellError('Something went wrong — check your connection and try again.');
    } finally {
      setSelling(false);
    }
  };

  const viewTabs: { id: CollectionView; label: string }[] = [
    { id: 'owned', label: 'OWNED' },
    { id: 'all', label: 'FULL SET' },
    { id: 'spares', label: `SPARES (${spareByCard.size})` },
    { id: 'wishlist', label: `♥ WISHLIST (${wishlist.size})` },
  ];

  const bulkRarities = (['Common', 'Uncommon'] as const).filter((r) => spareCount(r) > 0);
  const spareCredits = bulkRarities.reduce((n, r) => n + (spareValues.get(r)?.credits ?? 0), 0);
  const [extrasOpen, setExtrasOpen] = usePersistedState('collection.extras', false);

  return (
    <div ref={rootRef} className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="COLLECTION" onBack={onBack} />
      <div className="p-3 sm:p-5 max-w-[1500px] mx-auto lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] lg:gap-5 lg:items-start">
        {/* Search + filters. A sticky bar under the header on phones (the
            fields open under it); a sticky sidebar from `lg` up. */}
        <aside
          aria-label="Search and filters"
          className="sticky top-[var(--hdr,56px)] z-20 -mx-3 px-3 sm:-mx-5 sm:px-5 py-2 mb-3 bg-[var(--c-paper)] border-b-2 border-[var(--c-ink)]/20 lg:mx-0 lg:px-0 lg:py-0 lg:mb-0 lg:border-b-0 lg:top-[calc(var(--hdr,56px)+1rem)] lg:max-h-[calc(100dvh-var(--hdr,56px)-2rem)] lg:overflow-y-auto"
        >
          <div className="flex items-center gap-2">
            <input
              className="px-2 py-1.5 min-h-[40px] lg:min-h-[36px] flex-1 min-w-0 bg-[var(--c-paper)] ink-border-sm font-bold text-xs placeholder:text-[var(--c-steel)]/60"
              placeholder="Search cards…"
              aria-label="Search cards"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button
              type="button"
              aria-expanded={filtersOpen}
              aria-controls="collection-filters"
              onClick={() => setFiltersOpen((o) => !o)}
              className="lg:hidden btn-pop heading-font fs-sm ink-border-sm shadow-hard-black-xs px-3 min-h-[40px] shrink-0 bg-[var(--c-steel)] text-[var(--c-paper)]"
            >
              FILTERS{activeFilters > 0 ? ` (${activeFilters})` : ''} {filtersOpen ? '▴' : '▾'}
            </button>
          </div>
          <div
            id="collection-filters"
            className={cn(
              'flex-col gap-3 pt-3 max-h-[60dvh] overflow-y-auto lg:max-h-none lg:overflow-visible lg:flex',
              filtersOpen ? 'flex' : 'hidden',
            )}
          >
            <div className="grid grid-cols-2 gap-2">
              <FilterSelect
                label="Type"
                value={type}
                onChange={(v) => setFilter('type', v)}
                options={TYPES.map((t) => ({ value: t, label: t }))}
              />
              <FilterSelect
                label="Rarity"
                value={rarity}
                onChange={(v) => setFilter('rarity', v)}
                options={RARITY_FILTERS.map((r) => ({ value: r, label: r }))}
              />
              <FilterSelect
                label="Colour"
                value={color}
                onChange={(v) => setFilter('color', v)}
                options={COLOR_FILTERS.map((c) => ({ value: c, label: c }))}
              />
              <FilterSelect
                label="Keyword"
                value={keyword}
                onChange={(v) => setFilter('keyword', v)}
                options={keywordOptions.map((k) => ({
                  value: k,
                  label: k === 'All' ? 'Any' : k,
                }))}
              />
              {setFilters.length > 2 && (
                <FilterSelect
                  label="Set"
                  value={setName}
                  onChange={(v) => setFilter('set', v)}
                  options={setFilters.map((s) => ({
                    value: s,
                    label: s === 'All' ? 'All sets' : s,
                  }))}
                />
              )}
              <FilterSelect
                label="Tier"
                value={tier}
                onChange={(v) => setFilter('tier', v)}
                options={TIER_FILTERS.map((t) => ({
                  value: t,
                  label: t === 'All' ? 'Any' : `${t} (★ ⚙ ϟ)`,
                }))}
              />
              <FilterSelect
                label="Location rule"
                value={ruleSel}
                onChange={(v) => setFilter('rule', v)}
                options={ruleOptions.map((r) => ({ value: r, label: ruleFilterLabel(r) }))}
              />
              <FilterSelect
                label="Sort by"
                value={sort}
                onChange={(v) => setFilter('sort', v as SortKey)}
                options={SORTS.map((s) => ({ value: s, label: s }))}
              />
            </div>

            <div className="flex flex-col gap-1.5" aria-label="Saved filters">
              <div className="fs-xs font-black uppercase tracking-wide text-[var(--c-steel)]">
                Saved filters
              </div>
              <div className="flex flex-wrap gap-1.5">
                {presets.map((p) => (
                  <span
                    key={p.name}
                    className="inline-flex items-stretch ink-border-sm bg-[var(--c-paper)]"
                  >
                    <button
                      type="button"
                      onClick={() => setStoredFilters(sanitizeFilters(p.filters))}
                      className="px-2 min-h-[32px] fs-xs font-bold hover:bg-[var(--c-yellow)]"
                    >
                      {p.name}
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete saved filter ${p.name}`}
                      onClick={() => setPresets(deletePreset(presets, p.name))}
                      className="px-2 min-h-[32px] min-w-[32px] fs-sm font-black border-l-2 border-[var(--c-ink)]/20 hover:bg-[var(--c-red)] hover:text-[var(--c-paper)]"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {presets.length === 0 && presetName === null && (
                  <span className="fs-xs font-bold text-[var(--c-steel)]">
                    None yet — set some filters, then save them here.
                  </span>
                )}
              </div>
              {presetName === null ? (
                <PopButton
                  color="steel"
                  disabled={activeFilters === 0 && view === 'owned'}
                  onClick={() => setPresetName(suggestPresetName(filters, presets))}
                >
                  + SAVE CURRENT FILTERS
                </PopButton>
              ) : (
                <div className="flex gap-1.5">
                  <input
                    autoFocus
                    value={presetName}
                    maxLength={MAX_PRESET_NAME}
                    aria-label="Name for this saved filter"
                    onChange={(e) => setPresetName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') savePresetNow();
                      if (e.key === 'Escape') setPresetName(null);
                    }}
                    className="px-2 py-1.5 min-h-[36px] min-w-0 flex-1 bg-[var(--c-paper)] ink-border-sm font-bold text-xs"
                  />
                  <PopButton color="yellow" onClick={savePresetNow}>
                    SAVE
                  </PopButton>
                  <PopButton color="steel" onClick={() => setPresetName(null)} ariaLabel="Cancel">
                    ×
                  </PopButton>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {filtersDirty && (
                <PopButton color="steel" onClick={clearFilters}>
                  CLEAR FILTERS
                </PopButton>
              )}
              <PopButton
                color="steel"
                onClick={() => {
                  const rows = POOL.flatMap((c) => {
                    const o = owned.get(c.id);
                    if (!o || o.q + o.f === 0) return [];
                    const serialized = serializedByCard.get(c.id)?.length || 0;
                    return [
                      {
                        id: c.id,
                        name: c.name,
                        type: c.type,
                        rarity: c.rarity || 'Common',
                        set: c.set || '',
                        quantity: Math.max(0, o.q - serialized),
                        foil: o.f,
                        serialized,
                      },
                    ];
                  });
                  downloadText('frycards-collection.csv', collectionCsv(rows));
                }}
                title="Download your collection as a spreadsheet (CSV)"
              >
                EXPORT CSV
              </PopButton>
            </div>
          </div>
        </aside>

        <main className="min-w-0">
          {/* U35: on a phone the four panels below pushed the first card to
              y≈580. They fold behind one compact stat row there; from sm up
              they show as before. */}
          <button
            type="button"
            aria-expanded={extrasOpen}
            aria-controls="collection-extras"
            onClick={() => setExtrasOpen(!extrasOpen)}
            className="sm:hidden w-full mb-3 flex items-center justify-between gap-2 min-h-[44px] px-3 bg-[var(--c-paper)] ink-border-md shadow-hard-black-xs fs-xs font-black text-left"
          >
            <span className="truncate">
              {uniqueOwned}/{POOL.length} · {gradedCards.length} graded
              {spareCredits > 0 && <> · ≈{fmtCredits(spareCredits)}cr spares</>}
            </span>
            <span aria-hidden>{extrasOpen ? '▴' : '▸'}</span>
          </button>
          <div id="collection-extras" className={extrasOpen ? undefined : 'hidden sm:block'}>
            {/* Collection progress */}
            <CollapsiblePanel
              id="progress"
              title="COLLECTION PROGRESS"
              summary={
                <>
                  {uniqueOwned}/{POOL.length} ({pctOwned}%)
                </>
              }
              peek={
                <ProgressBar
                  value={uniqueOwned}
                  max={POOL.length}
                  ariaLabel="Collection progress"
                />
              }
            >
              <Tabs
                ariaLabel="Completion by"
                value={progressBy}
                onChange={setProgressBy}
                tabs={[
                  { id: 'rarity', label: 'BY RARITY' },
                  { id: 'set', label: 'BY SET' },
                  { id: 'colour', label: 'BY COLOUR' },
                ]}
              />
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 mt-3">
                {(progressBy === 'rarity'
                  ? rarityProgress.map((e) => ({ label: e.rarity, owned: e.owned, total: e.total }))
                  : groupProgress
                ).map((e) => (
                  <div key={e.label}>
                    <div className="flex justify-between fs-xs font-black mb-0.5">
                      <span className="truncate pr-1">{e.label.toUpperCase()}</span>
                      <span className="font-mono">
                        {e.owned}/{e.total}
                      </span>
                    </div>
                    <ProgressBar
                      value={e.owned}
                      max={e.total}
                      className="h-1.5"
                      ariaLabel={`${e.label} cards collected`}
                    />
                  </div>
                ))}
              </div>
            </CollapsiblePanel>

            {/* Showcase strip */}
            <CollapsiblePanel
              id="showcase"
              title="MY SHOWCASE"
              summary={
                <>
                  {showcase.length}/{MAX_SHOWCASE}
                </>
              }
            >
              {showcaseError && (
                <div className="mb-2">
                  <Notice text={showcaseError} />
                </div>
              )}
              {showcase.length === 0 ? (
                <div className="flex flex-col items-start gap-2 py-1">
                  <p className="fs-sm font-bold text-[var(--c-steel)]">
                    No showcase cards yet — pin your favorites so friends can see them on your
                    profile.
                  </p>
                  <PopButton color="yellow" onClick={startPinning}>
                    PIN CARDS →
                  </PopButton>
                </div>
              ) : (
                <>
                  <p className="fs-xs font-bold text-[var(--c-steel)] mb-2">
                    Tap a pinned card to unpin it. To pin more, open an owned card and choose ☆ ADD
                    TO SHOWCASE.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {showcase.map((id) => {
                      const def = POOL_BY_ID[id];
                      // This is the player's own showcase, so the placeholder is
                      // the recovery path: tapping it unpins the dead slot.
                      if (!def)
                        return (
                          <UnavailableShowcaseTile
                            key={id}
                            cardId={id}
                            size="compact"
                            onUnpin={() => toggleShowcase(id)}
                          />
                        );
                      return (
                        <CardFace
                          key={id}
                          def={def}
                          size="compact"
                          onClick={() => toggleShowcase(id)}
                          badge="★ UNPIN"
                        />
                      );
                    })}
                  </div>
                </>
              )}
            </CollapsiblePanel>

            {/* Graded shelf — encased slabs, each in its service's case style.
              Slabs are display/sale pieces (not deck-legal); selling and
              case-cracking live in the Grading Lab, so the shelf deep-links. */}
            <AnimatePresence>
              {slabOpen &&
                (() => {
                  const g = gradedCards.find((x) => x.id === slabOpen);
                  if (!g) return null;
                  return (
                    <SlabDetailModal
                      key={g.id}
                      g={g}
                      pinned={profile?.showcase_slabs ?? []}
                      onClose={() => setSlabOpen(null)}
                      onChanged={async (gone) => {
                        await Promise.all([
                          refreshProfile(),
                          gone ? refreshCollection() : Promise.resolve(),
                          reloadGraded(),
                        ]);
                      }}
                      onShowroom={
                        onShowroom && g.grade != null
                          ? () => onShowroom({ kind: 'slab', gradedId: g.id })
                          : undefined
                      }
                      onGrading={onGrading}
                    />
                  );
                })()}
            </AnimatePresence>
            {(gradedCards.length > 0 || (onGrading && !dataLoading)) && (
              <CollapsiblePanel
                id="graded"
                title="GRADED CARDS"
                summary={
                  <>
                    {gradedCards.length}
                    {(profile?.showcase_slabs?.length ?? 0) > 0 &&
                      ` · ${profile!.showcase_slabs!.length}/3 on your profile`}
                  </>
                }
              >
                {gradedCards.length === 0 ? (
                  <div className="flex flex-col items-start gap-2 py-1">
                    <p className="fs-sm font-bold text-[var(--c-steel)]">
                      Nothing graded yet. The Grading Lab seals a spare copy in a slab you can
                      display and sell.
                    </p>
                    <PopButton color="yellow" onClick={onGrading}>
                      OPEN THE GRADING LAB →
                    </PopButton>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between gap-2 mb-2 flex-wrap">
                      <label className="flex items-center gap-2 fs-xs font-black uppercase text-[var(--c-steel)]">
                        Sort
                        <select
                          className="ink-border-sm fs-xs font-bold px-1 py-0.5 min-h-[28px] bg-[var(--c-paper)] text-[var(--c-ink)] normal-case"
                          value={slabSort}
                          onChange={(e) => setSlabSort(e.target.value as typeof slabSort)}
                        >
                          <option value="pinned">Pinned first</option>
                          <option value="grade">Grade</option>
                          <option value="value">Value</option>
                          <option value="service">Service</option>
                          <option value="newest">Newest</option>
                        </select>
                      </label>
                      <span className="fs-xs font-bold text-[var(--c-steel)]">
                        Tap a slab for details, showcasing, selling or cracking
                      </span>
                    </div>
                    {/* The slab's own keyframes travel with it — a top-grade case
                      shines on this shelf as well as in the Lab. */}
                    <div className="flex flex-wrap gap-2">
                      {sortSlabs(gradedCards, slabSort, profile?.showcase_slabs ?? []).map((g) => (
                        <div key={g.id} className="flex flex-col gap-1 w-fit">
                          <div className="relative">
                            <GradedSlab g={g} onClick={() => setSlabOpen(g.id)} />
                            {profile?.showcase_slabs?.includes(g.id) && (
                              <span className="absolute -top-2 -right-2 heading-font fs-xs bg-[var(--c-yellow)] px-1.5 py-0.5 ink-border-sm z-20">
                                ★ PINNED
                              </span>
                            )}
                          </div>
                          {/* Only a GRADED slab can be stood up in the room: a pending
                            one has a frosted window and no grade to print, so the
                            3D view would be a blurred card in an empty case. */}
                          {onShowroom && g.grade != null && (
                            <button
                              onClick={() => onShowroom({ kind: 'slab', gradedId: g.id })}
                              aria-label={`View ${POOL_BY_ID[g.card_id]?.name ?? 'this slab'} in the 3D Showroom`}
                              className="btn-pop heading-font fs-xs bg-[var(--c-ink)] text-[var(--c-yellow)] px-2 py-1 min-h-[28px] ink-border-sm shadow-hard-black-xs"
                            >
                              ⬛ VIEW IN 3D
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </CollapsiblePanel>
            )}

            {/* Bulk quicksell — clear out common/uncommon clutter in one click
              instead of opening each card individually. Folded away like the
              other panels (it is a destructive tool, not something to scroll
              past every visit); the confirm and the panel both say what the
              spares are worth. Results stay outside the fold. */}
            {(bulkError || bulkNotice) && (
              <div className="mb-3">
                {bulkError && <Notice text={bulkError} />}
                {bulkNotice && <Notice text={bulkNotice} kind="success" />}
              </div>
            )}
            {bulkRarities.length > 0 && (
              <CollapsiblePanel
                id="bulk"
                title="BULK QUICKSELL"
                summary={<>≈{fmtCredits(spareCredits)} credits</>}
              >
                <div className="flex flex-wrap items-center gap-2">
                  {bulkRarities.map((r) => (
                    <PopButton
                      key={r}
                      color="red"
                      disabled={!!bulkBusy}
                      onClick={async () => {
                        const v = spareValues.get(r);
                        if (v && (await askConfirm(quicksellConfirmText(r, v)))) bulkQuicksell(r);
                      }}
                    >
                      {bulkBusy === r
                        ? bulkProgress
                          ? `SELLING ${bulkProgress.done}/${bulkProgress.total}…`
                          : 'SELLING…'
                        : `QUICKSELL ALL ${r.toUpperCase()} (${spareCount(r)}) · ≈${fmtCredits(spareValues.get(r)?.credits)}`}
                    </PopButton>
                  ))}
                </div>
                <p className="fs-xs font-bold text-[var(--c-steel)] mt-2">
                  Spare copies are worth about:{' '}
                  {RARITIES.filter((r) => spareCount(r) > 0)
                    .map((r) => `${r} ${fmtCredits(spareValues.get(r)?.credits)}`)
                    .join(' · ')}{' '}
                  credits. Cards in a saved deck, serialized prints and graded slabs are never sold.
                </p>
              </CollapsiblePanel>
            )}
          </div>

          <Tabs
            ariaLabel="Collection view"
            value={view}
            onChange={(v) => setFilter('view', v)}
            tabs={viewTabs}
            className="mb-2"
          />
          <div
            ref={gridRef}
            className="scroll-mt-[calc(var(--hdr,56px)+4.5rem)] flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 fs-xs font-bold text-[var(--c-steel)]"
          >
            <span aria-live="polite">
              {entries.length} SHOWN · {uniqueOwned}/{POOL.length} UNIQUE · {totalOwned} TOTAL CARDS
            </span>
            {filtersDirty && (
              <button type="button" onClick={clearFilters} className="underline min-h-[24px]">
                clear filters
              </button>
            )}
            <span>
              Tap a card to inspect it; its spare copies sell for credits there (the SPARES view
              lists them all).
            </span>
          </div>
          {pinHint && (
            <div
              role="status"
              className="mb-3 flex items-center justify-between gap-2 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm px-3 py-2 fs-sm font-bold"
            >
              <span>Pick a card you own, then tap ☆ ADD TO SHOWCASE.</span>
              <button
                type="button"
                aria-label="Dismiss"
                onClick={() => setPinHint(false)}
                className="min-h-[32px] min-w-[32px] heading-font"
              >
                ×
              </button>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            {entries.map((e) => (
              <CollectionTile
                key={`${e.def.id}-${e.kind}-${e.serial?.number ?? ''}`}
                def={e.def}
                kind={e.kind}
                count={e.count}
                serialNumber={e.serial?.number}
                serialCap={e.serial?.cap}
                narrow={narrow}
                wished={wishlist.has(e.def.id)}
                isNew={e.kind !== 'serialized' && newIds.has(e.def.id)}
                onInspect={openInspector}
              />
            ))}
            {dataLoading && (
              <div className="w-full text-center font-bold text-[var(--c-steel)] py-14 animate-pulse">
                Loading your collection…
              </div>
            )}
            {!dataLoading && filtered.length === 0 && (
              <div className="w-full flex flex-col items-center gap-3 text-center font-bold text-[var(--c-steel)] py-14">
                {totalOwned === 0 ? (
                  <div>Your collection is empty. Crack some packs in the Store!</div>
                ) : view === 'wishlist' && wishlist.size === 0 ? (
                  <div>
                    Nothing on your wishlist yet. Open any card and tap ♡ ADD TO WISHLIST — you'll
                    get a badge when one turns up in a pack.
                  </div>
                ) : view === 'spares' && filtersDirty === false ? (
                  <div>
                    No spare copies — everything you own is in a deck or a serialized print.
                  </div>
                ) : (
                  <div>No cards match these filters.</div>
                )}
                {filtersDirty && (
                  <PopButton color="yellow" onClick={clearFilters}>
                    CLEAR FILTERS
                  </PopButton>
                )}
                {view === 'owned' && totalOwned > 0 && (
                  <PopButton color="steel" onClick={() => setFilter('view', 'all')}>
                    BROWSE THE FULL SET
                  </PopButton>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      {inspect && (
        <Card3DInspector
          def={inspect.def}
          foil={inspect.foil}
          canToggleFoil={!inspect.serial && (inspectOwned?.f || 0) > 0}
          // ✦ VIEW FOIL swaps the card on display — swap `inspect.foil` with
          // it so the market-value panel below describes the variant actually
          // on screen, not the tile that was clicked.
          onFoilToggle={(showFoil) => setInspect((i) => (i ? { ...i, foil: showFoil } : i))}
          serial={inspect.serial}
          meta={[
            { label: 'Rarity', value: inspect.def.rarity || 'Common' },
            { label: 'Set', value: inspect.def.set || '—' },
            { label: 'Type', value: inspect.def.type },
            ...(inspect.serial
              ? [
                  {
                    label: 'Serial',
                    value: `#${inspect.serial.number}/${Number.isNaN(inspect.serial.cap) ? '?' : inspect.serial.cap}`,
                  },
                ]
              : []),
            {
              label: 'Owned',
              value: `×${inspectNormalQty}${inspectSerializedReserved > 0 ? ` (+${inspectSerializedReserved} serialized)` : ''}`,
            },
            { label: 'Foil owned', value: `✦ ${inspectOwned?.f || 0}` },
            ...(inspectLocked > 0 ? [{ label: 'Locked in decks', value: `${inspectLocked}` }] : []),
          ]}
          onClose={() => setInspect(null)}
          actions={
            <div className="flex flex-col gap-3">
              {/* The inspector tilts; the Showroom turns. A card whose rarity
                  earns its own 3D room says so on the button, because that is
                  the reason to take the trip. */}
              {onShowroom && (
                <PopButton
                  color="steel"
                  className="w-full"
                  ariaLabel={`View ${inspect.def.name} in the 3D Showroom`}
                  onClick={() =>
                    onShowroom({ kind: 'card', cardId: inspect.def.id, foil: inspect.foil })
                  }
                >
                  ⬛ VIEW IN 3D
                  {isPremiumRarity(inspect.def.rarity) ? ' ✦' : ''}
                </PopButton>
              )}
              <div className="max-md:[&>*]:w-full!">
                <CardMarketValuePanel cardId={inspect.def.id} foil={inspect.foil} />
              </div>
              <div className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs p-3 w-full md:w-[240px] flex flex-col gap-2">
                <PopButton
                  color={wishlist.has(inspect.def.id) ? 'steel' : 'yellow'}
                  className="w-full"
                  ariaPressed={wishlist.has(inspect.def.id)}
                  onClick={() => toggleWish(inspect.def.id)}
                >
                  {wishlist.has(inspect.def.id) ? '♥ ON YOUR WISHLIST' : '♡ ADD TO WISHLIST'}
                </PopButton>
                {inspectTotal > 0 && (
                  <>
                    {showcaseError && <Notice text={showcaseError} />}
                    <PopButton
                      color={inspectShowcased ? 'steel' : 'yellow'}
                      className="w-full"
                      disabled={
                        showcaseBusy || (!inspectShowcased && showcase.length >= MAX_SHOWCASE)
                      }
                      ariaLabel={
                        inspectShowcased
                          ? `Remove from showcase: ${inspect.def.name}`
                          : showcase.length >= MAX_SHOWCASE
                            ? undefined
                            : `Add to showcase: ${inspect.def.name}`
                      }
                      onClick={() => toggleShowcase(inspect.def.id)}
                    >
                      {inspectShowcased
                        ? '★ REMOVE FROM SHOWCASE'
                        : showcase.length >= MAX_SHOWCASE
                          ? `SHOWCASE FULL (${MAX_SHOWCASE}/${MAX_SHOWCASE})`
                          : '☆ ADD TO SHOWCASE'}
                    </PopButton>
                  </>
                )}

                {inspectTotal > 0 && (
                  <>
                    <div className="heading-font text-xs text-center mt-1">QUICKSELL</div>
                    {inspect.def.type === 'Leader' && (
                      <div className="fs-xs font-bold text-[var(--c-steel)] text-center">
                        Leaders can be sold like any other card — one copy stays reserved while a
                        saved deck still uses it.
                      </div>
                    )}
                    {inspectLocked > 0 && (
                      <div className="fs-xs font-bold text-[var(--c-red)] text-center">
                        {inspect.def.type === 'Leader'
                          ? `In use by ${inspectLocked} saved deck${inspectLocked === 1 ? '' : 's'} — ${inspectLocked} cop${inspectLocked === 1 ? 'y' : 'ies'} reserved`
                          : `${inspectLocked} cop${inspectLocked === 1 ? 'y' : 'ies'} locked in your decks`}
                      </div>
                    )}
                    {inspectSerializedReserved > 0 && (
                      <div className="fs-xs font-bold text-[var(--c-red)] text-center">
                        {inspectSerializedReserved} Serialized cop
                        {inspectSerializedReserved === 1 ? 'y' : 'ies'} — never quick-sellable
                      </div>
                    )}
                    {sellError && <Notice text={sellError} />}
                    <div className="flex items-center justify-between fs-xs font-bold">
                      <span>Normal ×{inspectNormalQty}</span>
                      <Credits amount={quicksellPrice(inspect.def.rarity, false)} />
                    </div>
                    <PopButton
                      color="red"
                      className="w-full"
                      disabled={selling || normalSellable <= 0}
                      ariaLabel={`Quicksell 1 normal copy of ${inspect.def.name}`}
                      onClick={() => handleSell(false, 1)}
                    >
                      QUICKSELL 1
                    </PopButton>
                    {inspectNormalQty > 1 && (
                      <PopButton
                        color="red"
                        className="w-full"
                        disabled={selling || normalSellable <= 0}
                        ariaLabel={`Quicksell all normal spare copies of ${inspect.def.name}`}
                        onClick={async () => {
                          const n = normalSellable;
                          if (
                            await askConfirm(
                              `Quicksell all ${n} spare copies of ${inspect.def.name}?`,
                            )
                          )
                            handleSell(false, n);
                        }}
                      >
                        QUICKSELL ALL NORMAL
                      </PopButton>
                    )}
                    {(inspectOwned?.f || 0) > 0 && (
                      <>
                        <div className="flex items-center justify-between fs-xs font-bold mt-1">
                          <span>Foil ✦ ×{inspectOwned?.f || 0}</span>
                          <Credits amount={quicksellPrice(inspect.def.rarity, true)} />
                        </div>
                        <PopButton
                          color="red"
                          className="w-full"
                          disabled={selling || foilSellable <= 0}
                          ariaLabel={`Quicksell 1 foil copy of ${inspect.def.name}`}
                          onClick={() => handleSell(true, 1)}
                        >
                          QUICKSELL 1
                        </PopButton>
                        {(inspectOwned?.f || 0) > 1 && (
                          <PopButton
                            color="red"
                            className="w-full"
                            disabled={selling || foilSellable <= 0}
                            ariaLabel={`Quicksell all foil spare copies of ${inspect.def.name}`}
                            onClick={async () => {
                              const n = Math.min(inspectOwned?.f || 0, foilSellable);
                              if (
                                await askConfirm(
                                  `Quicksell all ${n} spare foil copies of ${inspect.def.name}?`,
                                )
                              )
                                handleSell(true, n);
                            }}
                          >
                            QUICKSELL ALL FOIL
                          </PopButton>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          }
        />
      )}
    </div>
  );
}

/** Graded-shelf ordering. Pending slabs (no grade yet) always sort last. */
function sortSlabs(
  rows: GradedCard[],
  by: 'pinned' | 'grade' | 'value' | 'service' | 'newest',
  pinned: string[],
): GradedCard[] {
  const value = (g: GradedCard) =>
    g.grade == null
      ? -1
      : gradedQuicksellPrice(POOL_BY_ID[g.card_id]?.rarity, g.foil, g.grade, g.service);
  const out = [...rows];
  out.sort((a, b) => {
    if ((a.grade == null) !== (b.grade == null)) return a.grade == null ? 1 : -1;
    switch (by) {
      case 'pinned': {
        const pa = pinned.indexOf(a.id);
        const pb = pinned.indexOf(b.id);
        if (pa !== pb) return (pa < 0 ? 99 : pa) - (pb < 0 ? 99 : pb);
        return (b.grade ?? 0) - (a.grade ?? 0);
      }
      case 'grade':
        return (b.grade ?? 0) - (a.grade ?? 0) || value(b) - value(a);
      case 'value':
        return value(b) - value(a);
      case 'service':
        return a.service.localeCompare(b.service) || (b.grade ?? 0) - (a.grade ?? 0);
      default:
        return (b.revealed_at ?? b.submitted_at).localeCompare(a.revealed_at ?? a.submitted_at);
    }
  });
  return out;
}

const SEEN_KEY = 'frycards:collection-seen';
function readSeenSnapshot(): Set<string> | null {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    return raw ? new Set(JSON.parse(raw) as string[]) : null;
  } catch {
    return null;
  }
}
function writeSeenSnapshot(ids: string[]): void {
  try {
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(ids));
  } catch {
    /* private mode — no NEW dots, nothing else lost */
  }
}
