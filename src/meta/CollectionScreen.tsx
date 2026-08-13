import React, { useMemo, useState } from 'react';
import { useMeta } from './MetaContext';
import { MetaHeader, PopButton, Notice, ProgressBar, CardMarketValuePanel, Credits } from './ui';
import { cn } from '../lib/utils';
import { useIsNarrow } from '../lib/useIsNarrow';
import { CardFace } from '../components/CardFaceV4';
import { Card3DInspector } from '../components/Card3DInspector';
import { POOL_V4, POOL_BY_ID } from '../game/v3/cardpool';
import { CardDef, totalCost } from '../game/v3/cards';
import { RARITIES } from '../types';
import { quicksellCards, setShowcaseCards } from '../lib/supabase';
import { fmtCredits, quicksellPrice } from './economy';
import { cardColors, Color, COLORS, LEADER_COLORS } from '../game/v3/colors';

const TYPES = ['All', 'Leader', 'Unit', 'Item', 'Event', 'Location'];
const RARITY_FILTERS = ['All', ...RARITIES];
const COLOR_FILTERS = ['All', ...COLORS, 'Colorless'];
const SORTS = ['Name', 'Rarity', 'Type', 'Cost'] as const;
type SortKey = (typeof SORTS)[number];
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
  for (const c of POOL_V4) {
    if (c.type === 'Leader' || (c.rarity || 'Common') !== targetRarity) continue;
    const o = owned.get(c.id);
    if (!o) continue;
    const locked = lockedByDecks.get(c.id) || 0;
    const { normal: spareNormalRaw, foil: spareFoil } = spareSplit(o, locked);
    const reserved = serializedByCard.get(c.id)?.length || 0;
    const spareNormal = Math.max(0, spareNormalRaw - reserved);
    if (spareNormal + spareFoil <= 0) continue;
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

export function CollectionScreen({ onBack }: { onBack: () => void }) {
  // v7.5: the browse grid printed `full` (240x336) cards. On a 375px phone
  // that is ONE card per row and, at 297 cards plus foil/serialized entries,
  // a 119,000px-tall page — the collection was effectively unbrowsable on a
  // phone. `standard` fits two per row inside the same padding.
  const narrow = useIsNarrow();
  const {
    profile,
    collection,
    refreshCollection,
    refreshProfile,
    decks,
    dataLoading,
    serializedCards,
  } = useMeta();
  const [type, setType] = useState('All');
  const [rarity, setRarity] = useState('All');
  const [color, setColor] = useState('All');
  // Set filter. Derived from the live pool rather than a constant so the
  // Player Showcase set (and any later volume) shows up the moment its first
  // card is printed — the browser was single-set until v12 and had no way to
  // tell community cards from Volume #1 ones.
  const [setName, setSetName] = useState('All');
  const [ownedOnly, setOwnedOnly] = useState(true);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('Name');
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
  const [selling, setSelling] = useState(false);
  const [showcaseBusy, setShowcaseBusy] = useState(false);
  const [showcaseError, setShowcaseError] = useState('');

  const setFilters = useMemo(() => {
    const names = new Set<string>();
    for (const c of POOL_V4) if (c.set) names.add(c.set);
    return ['All', ...[...names].sort()];
  }, []);

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

  // Spare (unlocked) copy count per rarity, across the whole collection —
  // Leaders excluded (they're never bulk-fodder). Backs the "QUICKSELL ALL
  // <rarity>" bulk actions below.
  const spareByRarity = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of POOL_V4) {
      if (c.type === 'Leader') continue;
      const o = owned.get(c.id);
      if (!o) continue;
      const reserved = serializedByCard.get(c.id)?.length || 0;
      // Same arithmetic as runBulkQuicksell above (spareSplit, then reserves
      // out of the normal split only) — a flat q+f−locked−reserved diverges
      // when a deck lock spills into foil copies on a card with serialized
      // reserves, and the progress bar's total disagrees with what the loop
      // actually sells ("SELLING 3/2").
      const { normal, foil } = spareSplit(o, lockedByDecks.get(c.id) || 0);
      const spare = Math.max(0, normal - reserved) + foil;
      if (spare <= 0) continue;
      const r = c.rarity || 'Common';
      m.set(r, (m.get(r) || 0) + spare);
    }
    return m;
  }, [owned, lockedByDecks, serializedByCard]);
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
    setBulkProgress({ done: 0, total: spareByRarity.get(targetRarity) || 0 });
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
      setBulkBusy(null);
      setBulkProgress(null);
      refreshCollection();
      refreshProfile();
    }
  };

  const filtered = POOL_V4.filter((c) => {
    const o = owned.get(c.id);
    const total = (o?.q || 0) + (o?.f || 0);
    if (ownedOnly && total === 0) return false;
    if (type !== 'All' && c.type !== type) return false;
    if (rarity !== 'All' && (c.rarity || 'Common') !== rarity) return false;
    if (setName !== 'All' && (c.set || '') !== setName) return false;
    if (color !== 'All') {
      // Leaders carry no essence pips of their own (cardColors would always
      // read them as colorless) — their real identity lives in LEADER_COLORS,
      // same lookup DeckBuilderScreen uses. Falling back to cardColors keeps
      // any Leader missing from that map from vanishing under every filter.
      const cc = c.type === 'Leader' ? LEADER_COLORS[c.id] || cardColors(c) : cardColors(c);
      if (color === 'Colorless' ? cc.length > 0 : !cc.includes(color as Color)) return false;
    }
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    if (sort === 'Rarity') {
      const d = RARITIES.indexOf(b.rarity || 'Common') - RARITIES.indexOf(a.rarity || 'Common');
      if (d !== 0) return d;
    } else if (sort === 'Type') {
      const d = a.type.localeCompare(b.type);
      if (d !== 0) return d;
    } else if (sort === 'Cost') {
      const d = totalCost(a.cost) - totalCost(b.cost);
      if (d !== 0) return d;
    }
    return a.name.localeCompare(b.name);
  });

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

  // Per-rarity completion for the progress panel.
  const rarityProgress = useMemo(() => {
    const totals = new Map<string, { total: number; owned: number }>();
    for (const c of POOL_V4) {
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
  const [showProgress, setShowProgress] = useState(true);

  const select = 'px-2 py-1.5 bg-[var(--c-paper)] ink-border-sm font-bold text-xs';

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
  const { normal: spareNormal, foil: spareFoil } = spareSplit(inspectOwned, inspectLocked);
  const normalSellable = Math.max(0, spareNormal - inspectSerializedReserved);
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
      refreshCollection();
      refreshProfile();
    } catch {
      // quicksellCards rejecting outright (network error) instead of
      // returning {error} previously left the button silently stop
      // spinning with no message at all.
      setSellError('Something went wrong — check your connection and try again.');
    } finally {
      setSelling(false);
    }
  };

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="COLLECTION" onBack={onBack} />
      <div className="p-5 max-w-6xl mx-auto">
        {/* Collection progress */}
        <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3 mb-5">
          <button
            className="w-full flex items-center justify-between gap-2"
            aria-expanded={showProgress}
            onClick={() => setShowProgress((s) => !s)}
          >
            <span className="heading-font text-sm">COLLECTION PROGRESS</span>
            <span className="text-[10px] font-black">
              {uniqueOwned}/{POOL_V4.length} (
              {POOL_V4.length > 0 ? Math.round((uniqueOwned / POOL_V4.length) * 100) : 0}%){' '}
              {showProgress ? '▴' : '▾'}
            </span>
          </button>
          <ProgressBar
            value={uniqueOwned}
            max={POOL_V4.length}
            className="mt-2"
            ariaLabel="Collection progress"
          />
          {showProgress && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 mt-3">
              {rarityProgress.map((e) => (
                <div key={e.rarity}>
                  <div className="flex justify-between text-[9px] font-black mb-0.5">
                    <span>{e.rarity.toUpperCase()}</span>
                    <span className="font-mono">
                      {e.owned}/{e.total}
                    </span>
                  </div>
                  <ProgressBar
                    value={e.owned}
                    max={e.total}
                    className="h-1.5"
                    ariaLabel={`${e.rarity} cards collected`}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Showcase strip */}
        <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3 mb-5">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="heading-font text-sm">
              MY SHOWCASE ({showcase.length}/{MAX_SHOWCASE})
            </span>
            <span className="text-[9px] font-bold text-[var(--c-steel)]">
              Tap ★ on an owned card below to pin/unpin it
            </span>
          </div>
          {showcaseError && (
            <div className="mb-2">
              <Notice text={showcaseError} />
            </div>
          )}
          {showcase.length === 0 ? (
            <p className="text-[11px] font-bold text-[var(--c-steel)] py-2">
              No showcase cards yet — pin your favorites so friends can see them on your profile.
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {showcase.map((id) => {
                const def = POOL_BY_ID[id];
                if (!def) return null;
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
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <input
            className={cn(select, 'w-44 placeholder:text-[var(--c-steel)]/50')}
            placeholder="Search cards…"
            aria-label="Search cards"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className={select}
            aria-label="Filter by card type"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            {TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
          <select
            className={select}
            aria-label="Filter by rarity"
            value={rarity}
            onChange={(e) => setRarity(e.target.value)}
          >
            {RARITY_FILTERS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>
          {setFilters.length > 2 && (
            <select
              className={select}
              aria-label="Filter by set"
              value={setName}
              onChange={(e) => setSetName(e.target.value)}
            >
              {setFilters.map((s) => (
                <option key={s} value={s}>
                  {s === 'All' ? 'All sets' : s}
                </option>
              ))}
            </select>
          )}
          <select
            className={select}
            aria-label="Filter by color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          >
            {COLOR_FILTERS.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            className={select}
            aria-label="Sort cards"
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
          >
            {SORTS.map((s) => (
              <option key={s} value={s}>
                Sort: {s}
              </option>
            ))}
          </select>
          <PopButton
            color={ownedOnly ? 'black' : 'yellow'}
            ariaPressed={ownedOnly}
            onClick={() => setOwnedOnly(!ownedOnly)}
          >
            {ownedOnly ? 'OWNED ONLY' : 'FULL SET'}
          </PopButton>
          <div className="ml-auto text-[11px] font-bold text-[var(--c-steel)]">
            {uniqueOwned}/{POOL_V4.length} UNIQUE · {totalOwned} TOTAL CARDS
          </div>
        </div>
        <p className="text-[10px] font-bold text-[var(--c-steel)] mb-3">
          Tap any card to inspect it — quicksell spare copies for credits.
        </p>

        {/* Bulk quicksell — clear out common/uncommon clutter in one click
            instead of opening each card individually. */}
        {(spareByRarity.get('Common') || 0) + (spareByRarity.get('Uncommon') || 0) > 0 && (
          <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3 mb-4 flex flex-wrap items-center gap-2">
            <span className="heading-font text-xs mr-1">BULK QUICKSELL</span>
            {bulkError && <Notice text={bulkError} />}
            {bulkNotice && <Notice text={bulkNotice} kind="success" />}
            {(['Common', 'Uncommon'] as const).map(
              (r) =>
                (spareByRarity.get(r) || 0) > 0 && (
                  <PopButton
                    key={r}
                    color="yellow"
                    disabled={!!bulkBusy}
                    onClick={() => {
                      const n = spareByRarity.get(r) || 0;
                      if (confirm(`Quicksell all ${n} spare ${r} cards?`)) bulkQuicksell(r);
                    }}
                  >
                    {bulkBusy === r
                      ? bulkProgress
                        ? `SELLING ${bulkProgress.done}/${bulkProgress.total}…`
                        : 'SELLING…'
                      : `QUICKSELL ALL ${r.toUpperCase()} (${spareByRarity.get(r)})`}
                  </PopButton>
                ),
            )}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {entries.map((e) => (
            <CardFace
              key={`${e.def.id}-${e.kind}-${e.serial?.number ?? ''}`}
              def={e.def}
              size={narrow ? 'standard' : 'full'}
              count={e.kind !== 'serialized' ? e.count : undefined}
              foil={e.kind === 'foil'}
              serial={e.serial}
              dimmed={e.kind === 'normal' && e.count === 0}
              onClick={() => {
                setInspect({ def: e.def, foil: e.kind === 'foil', serial: e.serial });
                setSellError('');
              }}
            />
          ))}
          {dataLoading && (
            <div className="w-full text-center font-bold text-[var(--c-steel)] py-14 animate-pulse">
              Loading your collection…
            </div>
          )}
          {!dataLoading && filtered.length === 0 && (
            <div className="w-full flex flex-col items-center gap-3 text-center font-bold text-[var(--c-steel)] py-14">
              <div>No cards match these filters. Crack some packs in the Store!</div>
              <PopButton
                color="yellow"
                onClick={() => {
                  setType('All');
                  setRarity('All');
                  // Color was missing from this reset — a color-filtered
                  // empty grid stayed empty after "clearing" filters. Set had
                  // the same hole the moment a second set existed.
                  setColor('All');
                  setSetName('All');
                  setSearch('');
                  setOwnedOnly(true);
                }}
              >
                CLEAR FILTERS
              </PopButton>
            </div>
          )}
        </div>
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
              <CardMarketValuePanel cardId={inspect.def.id} foil={inspect.foil} />
              <div className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs p-3 w-[240px] flex flex-col gap-2">
                {inspectTotal > 0 && (
                  <>
                    {showcaseError && <Notice text={showcaseError} />}
                    <PopButton
                      color={inspectShowcased ? 'red' : 'yellow'}
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
                      <div className="text-[9px] font-bold text-[var(--c-steel)] text-center">
                        Leaders can be sold like any other card — one copy stays reserved while a
                        saved deck still uses it.
                      </div>
                    )}
                    {inspectLocked > 0 && (
                      <div className="text-[9px] font-bold text-[var(--c-red)] text-center">
                        {inspect.def.type === 'Leader'
                          ? `In use by ${inspectLocked} saved deck${inspectLocked === 1 ? '' : 's'} — ${inspectLocked} cop${inspectLocked === 1 ? 'y' : 'ies'} reserved`
                          : `${inspectLocked} cop${inspectLocked === 1 ? 'y' : 'ies'} locked in your decks`}
                      </div>
                    )}
                    {inspectSerializedReserved > 0 && (
                      <div className="text-[9px] font-bold text-[var(--c-red)] text-center">
                        {inspectSerializedReserved} Serialized cop
                        {inspectSerializedReserved === 1 ? 'y' : 'ies'} — never quick-sellable
                      </div>
                    )}
                    {sellError && <Notice text={sellError} />}
                    <div className="flex items-center justify-between text-[10px] font-bold">
                      <span>Normal ×{inspectNormalQty}</span>
                      <Credits amount={quicksellPrice(inspect.def.rarity, false)} />
                    </div>
                    <PopButton
                      color="yellow"
                      className="w-full"
                      disabled={selling || normalSellable <= 0}
                      ariaLabel={`Quicksell 1 normal copy of ${inspect.def.name}`}
                      onClick={() => handleSell(false, 1)}
                    >
                      QUICKSELL 1
                    </PopButton>
                    {inspectNormalQty > 1 && (
                      <PopButton
                        color="black"
                        className="w-full"
                        disabled={selling || normalSellable <= 0}
                        ariaLabel={`Quicksell all normal spare copies of ${inspect.def.name}`}
                        onClick={() => {
                          const n = normalSellable;
                          if (confirm(`Quicksell all ${n} spare copies of ${inspect.def.name}?`))
                            handleSell(false, n);
                        }}
                      >
                        QUICKSELL ALL NORMAL
                      </PopButton>
                    )}
                    {(inspectOwned?.f || 0) > 0 && (
                      <>
                        <div className="flex items-center justify-between text-[10px] font-bold mt-1">
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
                            color="black"
                            className="w-full"
                            disabled={selling || foilSellable <= 0}
                            ariaLabel={`Quicksell all foil spare copies of ${inspect.def.name}`}
                            onClick={() => {
                              const n = Math.min(inspectOwned?.f || 0, foilSellable);
                              if (
                                confirm(
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
