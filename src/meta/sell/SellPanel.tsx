import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Clock, Coins, Gavel, RotateCcw, Search, TriangleAlert, X } from 'lucide-react';
import { cn } from '../../lib/utils';
import { fetchListableInventory, type MarketListing, type PlayerCard } from '../../lib/supabase';
import { POOL_BY_ID } from '../../game/poker/cardpool';
import { COLORS } from '../../game/poker/colors';
import { CardFace, CardInfoMode } from '../../components/CardFaceV4';
import { RARITY_CHIP, RARITY_ORDER } from '../rarity';
import { fmtCredits } from '../economy';
import { asVariant, type OwnedVariant, VARIANT_META } from '../variants';
import { fetchGradedCards, GRADING_SERVICE_BY_ID, type GradedCard } from '../grading';
import { FilterSelect } from '../FilterSelect';
import { askConfirm } from '../confirm';
import { Credits, Notice, PopButton, Tabs } from '../ui';
import { usePersistedState } from '../usePersistedState';
import { useReducedMotion } from '../useMotionMode';
import {
  AUCTION_HOURS,
  buildSellItems,
  bulkLots,
  cardKey,
  FIXED_DAYS,
  filterSellItems,
  guideQuery,
  hoursLeft,
  LISTING_MAX_PRICE,
  LISTING_MAX_QTY,
  lotFor,
  marketFee,
  MAX_ACTIVE_LISTINGS,
  MAX_BATCH,
  priceWarnings,
  suggestPrices,
  validateDraft,
  youReceive,
  type BatchLot,
  type PriceGuide,
  type SellFilter,
  type SellItem,
  type SellKind,
  type SellSort,
} from './sellLogic';
import { createListingsMany, fetchPriceGuides, updateListingPrice } from './sellApi';
import type { BatchResult } from './sellApi';

const PAGE = 24;
const SORTS: SellSort[] = ['value', 'recent', 'dupes', 'name'];
const isSort = (v: unknown): v is SellSort => SORTS.includes(v as SellSort);
const input =
  'px-2 py-1.5 min-h-[36px] bg-[var(--c-paper)] ink-border-sm font-bold text-sm text-[var(--c-ink)]';
const label = 'fs-xs font-black uppercase tracking-wide text-[var(--c-steel)]';

function toInt(text: string): number {
  const n = Number(text.replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

function itemTitle(it: SellItem): string {
  return (
    it.def.name +
    (it.foil ? ' ✦' : '') +
    (it.variant ? ` ◆ ${VARIANT_META[it.variant].name}` : '') +
    (it.slab ? ` · ${GRADING_SERVICE_BY_ID[it.slab.service].name} ${it.slab.grade}` : '')
  );
}

/** Rarity / foil / variant / slab chips, shared by the tiles and the preview. */
function Chips({ it }: { it: SellItem }) {
  return (
    <span className="flex flex-wrap gap-1">
      <span
        className={cn(
          'fs-xs font-black px-1',
          RARITY_CHIP[it.def.rarity || 'Common'] || RARITY_CHIP.Common,
        )}
      >
        {(it.def.rarity || 'Common').toUpperCase()}
      </span>
      {it.foil && (
        <span className="fs-xs font-black px-1 bg-[var(--c-ink)] text-[var(--c-yellow)]">
          FOIL ✦
        </span>
      )}
      {it.variant && (
        <span className="fs-xs font-black px-1 bg-[var(--c-ink)] text-[var(--c-yellow)]">
          ◆ {VARIANT_META[it.variant].name.toUpperCase()}
        </span>
      )}
      {it.slab && (
        <span className="fs-xs font-black px-1 ink-border-sm bg-[var(--c-paper)]">
          SLAB {it.slab.pristine ? 'PRISTINE ' : ''}
          {it.slab.grade} · {it.slab.service.toUpperCase()}
        </span>
      )}
    </span>
  );
}

export interface SellPanelProps {
  userId?: string;
  collection: PlayerCard[];
  decks: { card_ids: string[] }[];
  serializedCards: { card_id: string }[];
  cardVariants: OwnedVariant[];
  /** The player's own listings (any status) — the active ones fill the panel. */
  myListings: MarketListing[];
  /** Refetch listings + collection + credits after a change. */
  onChanged: () => Promise<void>;
  onViewListing: (id: string) => void;
  cancelListing: (id: string) => Promise<string | null>;
}

type Step = 'edit' | 'confirm' | 'done';

/** Audit 1.3: the sell picker shows every face's text, as the table does. */
export function SellPanel(props: SellPanelProps) {
  return (
    <CardInfoMode.Provider value="open">
      <SellPanelInner {...props} />
    </CardInfoMode.Provider>
  );
}

function SellPanelInner(props: SellPanelProps) {
  const { userId, collection, decks, serializedCards, cardVariants, myListings } = props;
  const reduced = useReducedMotion();

  // ---- inventory --------------------------------------------------------
  const [slabs, setSlabs] = useState<GradedCard[]>([]);
  const [values, setValues] = useState<Map<string, number>>(new Map());
  const loadExtras = useCallback(async () => {
    if (!userId) return;
    // Both best-effort: the picker works from the collection alone, slabs and
    // blended values just enrich it.
    const [g, inv] = await Promise.allSettled([fetchGradedCards(userId), fetchListableInventory()]);
    if (g.status === 'fulfilled') setSlabs(g.value);
    if (inv.status === 'fulfilled') {
      const m = new Map<string, number>();
      for (const c of inv.value) {
        m.set(cardKey(c.card_id, false, null), c.value_normal);
        m.set(cardKey(c.card_id, true, null), c.value_foil);
        for (const v of c.variants ?? []) m.set(cardKey(c.card_id, v.foil, v.variant), v.value);
      }
      setValues(m);
    }
  }, [userId]);
  useEffect(() => {
    void loadExtras();
  }, [loadExtras]);

  const items = useMemo(
    () =>
      buildSellItems({
        collection,
        decks,
        serialized: serializedCards,
        variants: cardVariants,
        slabs,
        defs: POOL_BY_ID,
        values,
      }),
    [collection, decks, serializedCards, cardVariants, slabs, values],
  );
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);
  const active = myListings.filter(
    (l) => l.seller === userId && l.status === 'active' && Date.parse(l.ends_at) > now,
  );
  const slotsFree = Math.max(0, MAX_ACTIVE_LISTINGS - active.length);

  // ---- filters ------------------------------------------------------------
  const [filter, setFilter] = useState<SellFilter>({
    search: '',
    kind: 'all',
    rarity: 'All',
    color: 'All',
    type: 'All',
    set: 'All',
    showBlocked: false,
  });
  const [sort, setSort] = usePersistedState<SellSort>('market.sell.sort', 'value', isSort);
  const [shown, setShown] = useState(PAGE);
  const patch = (p: Partial<SellFilter>) => {
    setFilter((f) => ({ ...f, ...p }));
    setShown(PAGE);
  };
  const visible = useMemo(() => filterSellItems(items, filter, sort), [items, filter, sort]);
  const blockedCount = useMemo(() => items.filter((i) => i.blockedWhy).length, [items]);
  const sets = useMemo(
    () => [...new Set(items.map((i) => i.def.set).filter((s): s is string => !!s))].sort(),
    [items],
  );

  // ---- selection ----------------------------------------------------------
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [selKey, setSelKey] = useState<string | null>(null);
  const [bulkKeys, setBulkKeys] = useState<string[]>([]);
  const sel = selKey ? byKey.get(selKey) : undefined;
  const bulkItems = bulkKeys.map((k) => byKey.get(k)).filter((x): x is SellItem => !!x);
  const bulkCap = Math.min(MAX_BATCH, slotsFree);

  // ---- price guide (one batched call for whatever is selected) -----------
  const [guides, setGuides] = useState<Map<string, PriceGuide>>(new Map());
  const [guideErr, setGuideErr] = useState('');
  const [guideBusy, setGuideBusy] = useState(false);
  const [guideTick, setGuideTick] = useState(0);
  const wanted = mode === 'single' ? (sel ? [sel] : []) : bulkItems;
  // The query set as a string, so the effect re-runs only when it changes.
  const wantedJson = JSON.stringify(
    wanted
      .filter((w) => w.kind === 'card' || w.slab)
      .map((w) => ({ key: w.key, query: guideQuery(w) })),
  );
  useEffect(() => {
    const need = JSON.parse(wantedJson) as { key: string; query: Record<string, unknown> }[];
    if (need.length === 0) return;
    let live = true;
    // Debounced so ticking several bulk tiles in a row is still one call.
    const t = window.setTimeout(async () => {
      setGuideBusy(true);
      setGuideErr('');
      try {
        const got = await fetchPriceGuides(need);
        if (live) setGuides((prev) => new Map([...prev, ...got]));
      } catch (e) {
        if (live) setGuideErr(e instanceof Error ? e.message : 'Price guide unavailable');
      } finally {
        if (live) setGuideBusy(false);
      }
    }, 250);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [wantedJson, guideTick]);
  const loadGuides = () => setGuideTick((n) => n + 1);

  // ---- single-lot draft -------------------------------------------------------
  const [type, setType] = useState<'fixed' | 'auction'>('fixed');
  const [qtyText, setQtyText] = useState('1');
  const [unitText, setUnitText] = useState('');
  const [buyoutText, setBuyoutText] = useState('');
  const [hours, setHours] = useState<number>(24);
  const [step, setStep] = useState<Step>('edit');
  const [submitting, setSubmitting] = useState(false);
  const submitLock = useRef(false);
  const [submitErr, setSubmitErr] = useState('');
  const [done, setDone] = useState<{
    ids: string[];
    results: BatchResult[];
    lots: BatchLot[];
  } | null>(null);
  const deskRef = useRef<HTMLDivElement>(null);

  const guide = sel ? guides.get(sel.key) : undefined;
  const sugg = sel ? suggestPrices(sel.quicksell, guide) : null;
  const maxQty = sel ? Math.min(LISTING_MAX_QTY, sel.spare) : 0;
  const qty = sel?.kind === 'slab' ? 1 : toInt(qtyText);
  const unit = toInt(unitText);
  const price = Number.isFinite(unit) && Number.isFinite(qty) ? unit * qty : NaN;
  const buyoutUnit = buyoutText.trim() === '' ? null : toInt(buyoutText);
  const buyout = buyoutUnit == null ? null : buyoutUnit * (Number.isFinite(qty) ? qty : 1);
  const draft = { type, quantity: qty, price, buyout: type === 'auction' ? buyout : null, hours };
  const invalid = sel ? validateDraft(draft, sel.spare) : 'Pick something to sell';
  const warnings =
    sel && Number.isFinite(price)
      ? priceWarnings(price, qty, sel.quicksell, guide?.market ?? null, type)
      : [];

  const pick = (it: SellItem) => {
    if (mode === 'bulk') {
      setBulkKeys((ks) =>
        ks.includes(it.key)
          ? ks.filter((k) => k !== it.key)
          : ks.length >= bulkCap
            ? ks
            : [...ks, it.key],
      );
      return;
    }
    setSelKey(it.key);
    setStep('edit');
    setDone(null);
    setSubmitErr('');
    setQtyText('1');
    setBuyoutText('');
    const s = suggestPrices(it.quicksell, guides.get(it.key));
    setUnitText(String(s.market));
    // Phones: the desk is below the grid — bring it into view.
    if (window.matchMedia?.('(max-width: 1023px)').matches)
      window.setTimeout(
        () => deskRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' }),
        50,
      );
  };
  // When the guide lands for a freshly picked lot, move the default price
  // from the quicksell-based guess to the real market number.
  const seededFor = useRef<string | null>(null);
  useEffect(() => {
    if (!sel || !guide || seededFor.current === sel.key) return;
    seededFor.current = sel.key;
    if (step === 'edit') setUnitText(String(suggestPrices(sel.quicksell, guide).market));
  }, [sel, guide, step]);

  const submit = async (lots: BatchLot[]) => {
    if (submitLock.current || lots.length === 0) return;
    submitLock.current = true;
    setSubmitting(true);
    setSubmitErr('');
    try {
      const { results, error } = await createListingsMany(lots);
      if (error) {
        setSubmitErr(error);
        return;
      }
      const ids = results.filter((r) => r.ok && r.listing_id).map((r) => r.listing_id!);
      const failed = results.filter((r) => !r.ok);
      if (ids.length === 0 && failed.length > 0) {
        setSubmitErr(failed.map((f) => f.error).join(' · ') || 'Listing failed');
        return;
      }
      setDone({ ids, results, lots });
      setStep('done');
      await Promise.all([props.onChanged(), loadExtras()]);
    } catch {
      setSubmitErr('Something went wrong — check your connection and try again.');
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const undo = async () => {
    if (!done || submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setSubmitErr('');
    try {
      const errs: string[] = [];
      for (const id of done.ids) {
        const e = await props.cancelListing(id);
        if (e) errs.push(e);
      }
      if (errs.length) setSubmitErr(errs.join(' · '));
      else {
        setDone(null);
        setStep('edit');
      }
      await Promise.all([props.onChanged(), loadExtras()]);
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const listAnother = () => {
    setDone(null);
    setStep('edit');
    setSelKey(null);
    setBulkKeys([]);
    setSubmitErr('');
  };

  // ---- bulk draft ---------------------------------------------------------
  const [pct, setPct] = useState(100);
  const [allCopies, setAllCopies] = useState(false);
  const bulkPlan = bulkLots(bulkItems, guides, pct, allCopies);
  const bulkTotal = bulkPlan.reduce((a, p) => a + p.lot.price, 0);
  const bulkBelowFloor = bulkPlan.filter((p) => p.lot.price / p.lot.quantity < p.item.quicksell);

  // ---- render ---------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:items-start">
        {/* PICKER */}
        <section aria-labelledby="sell-pick" className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <h2 id="sell-pick" className="heading-font text-sm mr-auto">
              1 · PICK WHAT TO SELL
            </h2>
            <span
              className={cn(
                'fs-xs font-black px-2 py-1 ink-border-sm',
                slotsFree === 0 ? 'bg-[var(--c-red)] text-[var(--c-paper)]' : 'bg-[var(--c-paper)]',
              )}
              title={`Up to ${MAX_ACTIVE_LISTINGS} active listings at a time`}
            >
              {slotsFree}/{MAX_ACTIVE_LISTINGS} SLOTS FREE
            </span>
            <Tabs<'single' | 'bulk'>
              ariaLabel="Listing mode"
              value={mode}
              onChange={(m) => {
                setMode(m);
                setStep('edit');
                setDone(null);
                setSubmitErr('');
              }}
              tabs={[
                { id: 'single', label: 'ONE CARD' },
                { id: 'bulk', label: 'BULK' },
              ]}
            />
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
            <label className="col-span-2 flex flex-col gap-0.5 min-w-0">
              <span className={label}>Search</span>
              <span className="relative">
                <Search
                  className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-[var(--c-steel)]"
                  aria-hidden
                />
                <input
                  className={cn(input, 'w-full pl-7 placeholder:text-[var(--c-steel)]/60')}
                  placeholder="Card name…"
                  value={filter.search}
                  onChange={(e) => patch({ search: e.target.value })}
                />
              </span>
            </label>
            <FilterSelect
              label="Show"
              value={filter.kind}
              onChange={(v) => patch({ kind: v as SellKind })}
              options={[
                { value: 'all', label: 'Everything' },
                { value: 'cards', label: 'Cards' },
                { value: 'foil', label: 'Foils ✦' },
                { value: 'variants', label: 'Variants ◆' },
                { value: 'slabs', label: 'Slabs' },
              ]}
            />
            <FilterSelect
              label="Sort"
              value={sort}
              onChange={(v) => setSort(v as SellSort)}
              options={[
                { value: 'value', label: 'Most valuable' },
                { value: 'recent', label: 'Recent' },
                { value: 'dupes', label: 'Duplicates first' },
                { value: 'name', label: 'Name A–Z' },
              ]}
            />
            <FilterSelect
              label="Rarity"
              value={filter.rarity}
              onChange={(v) => patch({ rarity: v })}
              options={['All', ...RARITY_ORDER].map((r) => ({ value: r, label: r }))}
            />
            <FilterSelect
              label="Colour"
              value={filter.color}
              onChange={(v) => patch({ color: v })}
              options={['All', ...COLORS, 'Colourless'].map((c) => ({ value: c, label: c }))}
            />
            <FilterSelect
              label="Type"
              value={filter.type}
              onChange={(v) => patch({ type: v })}
              options={['All', 'Unit', 'Location', 'Item', 'Event'].map((t) => ({
                value: t,
                label: t,
              }))}
            />
            <FilterSelect
              label="Set"
              value={filter.set}
              onChange={(v) => patch({ set: v })}
              options={['All', ...sets].map((s) => ({ value: s, label: s }))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-3 fs-xs font-bold text-[var(--c-steel)]">
            <span aria-live="polite">
              {visible.length} item{visible.length === 1 ? '' : 's'}
            </span>
            {blockedCount > 0 && (
              <label className="inline-flex items-center gap-1.5 min-h-[24px] cursor-pointer">
                <input
                  type="checkbox"
                  className="w-4 h-4"
                  checked={filter.showBlocked}
                  onChange={(e) => patch({ showBlocked: e.target.checked })}
                />
                Show {blockedCount} that can't be listed
              </label>
            )}
            {mode === 'bulk' && (
              <span className="text-[var(--c-ink)]">
                Tap to select · {bulkItems.length}/{bulkCap} picked
              </span>
            )}
          </div>

          {visible.length === 0 ? (
            <div className="ink-border-sm bg-[var(--c-paper)] p-6 text-center fs-xs font-bold text-[var(--c-steel)]">
              {items.length === 0
                ? 'Nothing to sell yet — open packs to build a collection.'
                : "Nothing matches. Clear the filters, or tick “show items that can't be listed” to see what's held back."}
            </div>
          ) : (
            <>
              <ul
                className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3 lg:max-h-[calc(100vh-16rem)] lg:overflow-y-auto lg:p-1 lg:-m-1"
                aria-label="Sellable items"
              >
                {visible.slice(0, shown).map((it) => {
                  const on = mode === 'single' ? selKey === it.key : bulkKeys.includes(it.key);
                  const full = mode === 'bulk' && !on && bulkItems.length >= bulkCap;
                  const disabled = !!it.blockedWhy || full;
                  return (
                    <li key={it.key} className="min-w-0">
                      <button
                        type="button"
                        aria-pressed={on}
                        disabled={disabled}
                        title={
                          it.blockedWhy ??
                          (full ? `At most ${bulkCap} at once (free slots)` : undefined)
                        }
                        onClick={() => pick(it)}
                        className={cn(
                          'relative w-full h-full flex flex-col items-center gap-1.5 p-2 text-left ink-border-md',
                          'motion-safe:transition-transform',
                          on
                            ? 'bg-[var(--c-yellow)] shadow-hard-black-sm'
                            : 'bg-[var(--c-paper)] shadow-hard-black-xs hover:-translate-y-0.5',
                          disabled && 'opacity-55 cursor-not-allowed hover:translate-y-0',
                        )}
                      >
                        {mode === 'bulk' && !it.blockedWhy && (
                          <span
                            aria-hidden
                            className={cn(
                              'absolute top-1.5 left-1.5 z-10 w-6 h-6 ink-border-sm flex items-center justify-center',
                              on
                                ? 'bg-[var(--c-ink)] text-[var(--c-yellow)]'
                                : 'bg-[var(--c-paper)]',
                            )}
                          >
                            {on && <Check className="w-4 h-4" />}
                          </span>
                        )}
                        <span className="pointer-events-none">
                          <CardFace
                            def={it.def}
                            size="compact"
                            foil={it.foil}
                            variant={it.variant}
                          />
                        </span>
                        <span className="w-full min-w-0">
                          <span className="heading-font fs-xs block truncate">{it.def.name}</span>
                          <Chips it={it} />
                          {it.blockedWhy ? (
                            <span className="mt-1 flex items-start gap-1 fs-xs font-bold text-[var(--c-red)]">
                              <X className="w-3 h-3 shrink-0 mt-px" aria-hidden />
                              {it.blockedWhy}
                            </span>
                          ) : (
                            <span className="mt-1 flex items-center justify-between gap-1 fs-xs font-bold">
                              <span className="text-[var(--c-steel)]">
                                {it.kind === 'slab'
                                  ? 'Graded slab'
                                  : `${it.spare} spare${it.reserved ? ` · ${it.reserved} held` : ''}`}
                              </span>
                              <Credits amount={it.value} className="font-black" />
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              {visible.length > shown && (
                <div className="mt-3 text-center">
                  <PopButton color="steel" onClick={() => setShown((n) => n + PAGE)}>
                    SHOW MORE ({visible.length - shown})
                  </PopButton>
                </div>
              )}
            </>
          )}
        </section>

        {/* DESK */}
        <aside
          ref={deskRef}
          aria-labelledby="sell-desk"
          className={cn(
            'lg:sticky lg:top-4 scroll-mt-20 min-w-0',
            // Phones: once something is picked the desk leads, above the grid.
            (sel || bulkItems.length > 0 || step === 'done') && 'order-first lg:order-none',
          )}
        >
          <div className="ink-border-md bg-[var(--c-paper)] shadow-hard-black-sm">
            <h2
              id="sell-desk"
              className="heading-font text-sm px-3 py-2 bg-[var(--c-ink)] text-[var(--c-yellow)]"
            >
              {step === 'done'
                ? 'LISTED ✓'
                : step === 'confirm'
                  ? '3 · CONFIRM'
                  : mode === 'bulk'
                    ? '2 · PRICE THE BATCH'
                    : '2 · PRICE IT'}
            </h2>
            <div className="p-3 flex flex-col gap-3">
              {step === 'done' && done ? (
                <DoneState
                  done={done}
                  byKeyTitle={(lot) =>
                    itemTitle(
                      byKey.get(
                        lot.graded_id
                          ? `slab:${lot.graded_id}`
                          : cardKey(lot.card_id, lot.foil, lot.variant),
                      ) ??
                        ({
                          def: POOL_BY_ID[lot.card_id] ?? {
                            id: lot.card_id,
                            name: lot.card_id,
                            type: 'Unit',
                            colors: [],
                          },
                          foil: lot.foil,
                          variant: lot.variant,
                        } as SellItem),
                    )
                  }
                  busy={submitting}
                  error={submitErr}
                  onView={() => done.ids[0] && props.onViewListing(done.ids[0])}
                  onAnother={listAnother}
                  onUndo={undo}
                />
              ) : mode === 'bulk' ? (
                <BulkDesk
                  plan={bulkPlan}
                  guides={guides}
                  guideBusy={guideBusy}
                  guideErr={guideErr}
                  onRetryGuide={loadGuides}
                  pct={pct}
                  setPct={setPct}
                  allCopies={allCopies}
                  setAllCopies={setAllCopies}
                  total={bulkTotal}
                  belowFloor={bulkBelowFloor.length}
                  step={step}
                  setStep={setStep}
                  busy={submitting}
                  error={submitErr}
                  slotsFree={slotsFree}
                  onRemove={(k) => setBulkKeys((ks) => ks.filter((x) => x !== k))}
                  onSubmit={() => submit(bulkPlan.map((p) => p.lot))}
                />
              ) : !sel ? (
                <p className="fs-xs font-bold text-[var(--c-steel)] py-8 text-center">
                  Pick a card or slab on the left to see its market value and price it.
                </p>
              ) : (
                <>
                  <BuyerPreview
                    it={sel}
                    type={type}
                    qty={Number.isFinite(qty) ? qty : 1}
                    price={Number.isFinite(price) ? price : 0}
                    buyout={type === 'auction' ? buyout : null}
                    hours={hours}
                  />
                  <GuideBox
                    it={sel}
                    guide={guide}
                    busy={guideBusy}
                    error={guideErr}
                    onRetry={loadGuides}
                  />
                  {step === 'edit' ? (
                    <>
                      <Tabs<'fixed' | 'auction'>
                        ariaLabel="Sale type"
                        value={type}
                        onChange={setType}
                        tabs={[
                          { id: 'fixed', label: 'FIXED PRICE' },
                          { id: 'auction', label: 'AUCTION' },
                        ]}
                      />
                      {sel.kind === 'card' && maxQty > 1 && (
                        <div className="flex flex-col gap-0.5">
                          <span className={label} id="sell-qty">
                            Quantity · {maxQty} available
                          </span>
                          <div
                            className="flex items-center gap-1"
                            role="group"
                            aria-labelledby="sell-qty"
                          >
                            <button
                              type="button"
                              className={cn(input, 'w-9 heading-font')}
                              aria-label="One fewer"
                              disabled={qty <= 1}
                              onClick={() => setQtyText(String(Math.max(1, (qty || 1) - 1)))}
                            >
                              −
                            </button>
                            <input
                              className={cn(input, 'w-16 text-center')}
                              inputMode="numeric"
                              aria-label="Quantity"
                              value={qtyText}
                              onChange={(e) => setQtyText(e.target.value)}
                              onBlur={() =>
                                setQtyText(
                                  String(Math.min(maxQty, Math.max(1, toInt(qtyText) || 1))),
                                )
                              }
                            />
                            <button
                              type="button"
                              className={cn(input, 'w-9 heading-font')}
                              aria-label="One more"
                              disabled={qty >= maxQty}
                              onClick={() => setQtyText(String(Math.min(maxQty, (qty || 0) + 1)))}
                            >
                              +
                            </button>
                            <button
                              type="button"
                              className={cn(input, 'fs-xs')}
                              onClick={() => setQtyText(String(maxQty))}
                            >
                              ALL {maxQty}
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="flex flex-col gap-1">
                        <label className="flex flex-col gap-0.5">
                          <span className={label}>
                            {type === 'fixed' ? 'Price' : 'Starting bid'}
                            {qty > 1 ? ' (each)' : ''}
                          </span>
                          <span className="relative">
                            <Coins
                              className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2"
                              aria-hidden
                            />
                            <input
                              className={cn(input, 'w-full pl-7')}
                              inputMode="numeric"
                              value={unitText}
                              onChange={(e) => setUnitText(e.target.value)}
                              aria-invalid={!!invalid && unitText !== ''}
                            />
                          </span>
                        </label>
                        {sugg && (
                          <div className="grid grid-cols-3 gap-1" aria-label="Suggested prices">
                            {(
                              [
                                ['QUICK SALE', sugg.quick],
                                ['MARKET', sugg.market],
                                ['PREMIUM', sugg.premium],
                              ] as const
                            ).map(([name, v]) => (
                              <button
                                key={name}
                                type="button"
                                onClick={() => setUnitText(String(v))}
                                aria-pressed={unit === v}
                                className={cn(
                                  'ink-border-sm px-1 py-1 min-h-[40px] flex flex-col items-center leading-tight',
                                  unit === v
                                    ? 'bg-[var(--c-ink)] text-[var(--c-yellow)]'
                                    : 'bg-[var(--c-paper)] hover:bg-[var(--c-yellow)]/40',
                                )}
                              >
                                <span className="fs-xs font-black">{name}</span>
                                <span className="text-xs font-bold">{fmtCredits(v)}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      {type === 'auction' && (
                        <>
                          <label className="flex flex-col gap-0.5">
                            <span className={label}>
                              Buyout — optional{qty > 1 ? ' (each)' : ''}
                            </span>
                            <input
                              className={cn(input, 'w-full')}
                              inputMode="numeric"
                              placeholder="No buyout"
                              value={buyoutText}
                              onChange={(e) => setBuyoutText(e.target.value)}
                            />
                          </label>
                          <div className="flex flex-col gap-0.5">
                            <span className={label} id="sell-dur">
                              Duration
                            </span>
                            <div
                              className="flex flex-wrap gap-1"
                              role="radiogroup"
                              aria-labelledby="sell-dur"
                            >
                              {AUCTION_HOURS.map((h) => (
                                <button
                                  key={h}
                                  type="button"
                                  role="radio"
                                  aria-checked={hours === h}
                                  onClick={() => setHours(h)}
                                  className={cn(
                                    'ink-border-sm px-2 min-h-[32px] text-xs font-black',
                                    hours === h
                                      ? 'bg-[var(--c-ink)] text-[var(--c-yellow)]'
                                      : 'bg-[var(--c-paper)]',
                                  )}
                                >
                                  {h < 48 ? `${h}H` : `${h / 24}D`}
                                </button>
                              ))}
                            </div>
                          </div>
                        </>
                      )}
                      {type === 'fixed' && (
                        <p className="fs-xs font-bold text-[var(--c-steel)]">
                          Fixed listings run {FIXED_DAYS} days. You can change the price while it's
                          up.
                        </p>
                      )}
                      <Payout price={price} type={type} qty={qty} buyout={buyout} />
                      {warnings.map((w) => (
                        <p
                          key={w.text}
                          className={cn(
                            'fs-xs font-bold flex items-start gap-1 px-2 py-1 ink-border-sm',
                            w.level === 'warn'
                              ? 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
                              : 'bg-[var(--c-paper)] text-[var(--c-steel)]',
                          )}
                        >
                          <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden />
                          {w.text}
                        </p>
                      ))}
                      {invalid && unitText !== '' && (
                        <p role="alert" className="fs-xs font-black text-[var(--c-red)]">
                          {invalid}
                        </p>
                      )}
                      {slotsFree === 0 && (
                        <Notice text="All 10 listing slots are in use — cancel or sell one first." />
                      )}
                      <PopButton
                        color="yellow"
                        disabled={!!invalid || slotsFree === 0}
                        onClick={() => setStep('confirm')}
                        className="w-full justify-center"
                      >
                        REVIEW LISTING ▸
                      </PopButton>
                    </>
                  ) : (
                    <ConfirmState
                      lines={[
                        ['Item', itemTitle(sel)],
                        ['Type', type === 'fixed' ? 'Fixed price' : 'Auction'],
                        ['Quantity', String(qty)],
                        [type === 'fixed' ? 'Price' : 'Starting bid', fmtCredits(price)],
                        ...(type === 'auction' && buyout != null
                          ? ([['Buyout', fmtCredits(buyout)]] as [string, string][])
                          : []),
                        [
                          'Runs',
                          type === 'fixed'
                            ? `${FIXED_DAYS} days`
                            : hours < 48
                              ? `${hours} hours`
                              : `${hours / 24} days`,
                        ],
                        ['Fee on sale (5%)', `−${fmtCredits(marketFee(price))}`],
                        ['You receive', fmtCredits(youReceive(price))],
                      ]}
                      busy={submitting}
                      error={submitErr}
                      onBack={() => setStep('edit')}
                      onConfirm={() => submit([lotFor(sel, draft)])}
                      cta={type === 'fixed' ? 'LIST IT' : 'START AUCTION'}
                    />
                  )}
                </>
              )}
            </div>
          </div>
        </aside>
      </div>

      <ActiveListings
        listings={active}
        now={now}
        onChanged={props.onChanged}
        cancelListing={props.cancelListing}
        onView={props.onViewListing}
        onRelist={(l) => {
          const key = l.graded_id
            ? `slab:${l.graded_id}`
            : cardKey(l.card_id, l.foil, asVariant(l.variant));
          setMode('single');
          setSelKey(key);
          setStep('edit');
          setDone(null);
          setType(l.listing_type);
          setQtyText(String(l.quantity));
          setUnitText(String(Math.round(l.price / Math.max(1, l.quantity))));
          setBuyoutText(
            l.buyout != null ? String(Math.round(l.buyout / Math.max(1, l.quantity))) : '',
          );
          seededFor.current = key;
          deskRef.current?.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------

function BuyerPreview({
  it,
  type,
  qty,
  price,
  buyout,
  hours,
}: {
  it: SellItem;
  type: 'fixed' | 'auction';
  qty: number;
  price: number;
  buyout: number | null;
  hours: number;
}) {
  return (
    <figure className="m-0">
      <figcaption className={cn(label, 'mb-1')}>How buyers will see it</figcaption>
      <div className="ink-border-md bg-[var(--c-paper)] p-3 flex gap-3">
        <div className="shrink-0">
          <CardFace def={it.def} size="compact" foil={it.foil} variant={it.variant} />
        </div>
        <div className="min-w-0 flex-1 flex flex-col gap-1">
          <span className="heading-font text-xs truncate">
            {it.def.name}
            {qty > 1 && <span className="ml-1">×{qty}</span>}
          </span>
          <Chips it={it} />
          <span className="fs-xs font-bold text-[var(--c-steel)]">
            {type === 'auction' ? 'AUCTION' : 'FIXED PRICE'} · Seller: You
          </span>
          <span className="fs-xs font-bold inline-flex items-center gap-1">
            <Clock className="w-3 h-3" aria-hidden />
            {type === 'fixed'
              ? `${FIXED_DAYS}d left`
              : hours < 48
                ? `${hours}h left`
                : `${hours / 24}d left`}
          </span>
          <span className="mt-auto flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 heading-font text-[11px] bg-[var(--c-yellow)] px-1.5 py-0.5 ink-border-sm">
              {type === 'auction' ? (
                <>
                  <Gavel className="w-3 h-3" aria-hidden /> Start {fmtCredits(price)}
                </>
              ) : (
                <>
                  <Coins className="w-3 h-3" aria-hidden /> {fmtCredits(price)}
                </>
              )}
            </span>
            {buyout != null && (
              <span className="fs-xs font-bold text-[var(--c-steel)] inline-flex items-center gap-0.5">
                Buyout <Credits amount={buyout} />
              </span>
            )}
          </span>
        </div>
      </div>
    </figure>
  );
}

function GuideBox({
  it,
  guide,
  busy,
  error,
  onRetry,
}: {
  it: SellItem;
  guide: PriceGuide | undefined;
  busy: boolean;
  error: string;
  onRetry: () => void;
}) {
  const stat = (name: string, v: React.ReactNode, hint?: string) => (
    <div className="ink-border-sm px-2 py-1 bg-[var(--c-paper)] min-w-0" title={hint}>
      <div className="fs-xs font-black text-[var(--c-steel)] truncate">{name}</div>
      <div className="text-sm font-black">{v}</div>
    </div>
  );
  return (
    <section aria-label="Price guide" className="flex flex-col gap-1.5">
      <div className="grid grid-cols-3 gap-1.5">
        {stat(
          'MARKET',
          guide ? <Credits amount={guide.market} /> : busy ? '…' : <Credits amount={it.value} />,
          'Blended market reference, per copy',
        )}
        {stat(
          'LOWEST LIVE',
          guide ? (
            guide.lowest_active != null ? (
              <Credits amount={guide.lowest_active} />
            ) : (
              <span className="text-[var(--c-steel)]">none</span>
            )
          ) : (
            '…'
          ),
          it.slab
            ? 'Cheapest buy-now for the same card, grade and house'
            : 'Cheapest buy-now for the same card, foil and variant',
        )}
        {stat(
          'QUICKSELL',
          <Credits amount={it.quicksell} />,
          'What quickselling pays — your floor',
        )}
      </div>
      {guide && (
        <div className="fs-xs font-bold text-[var(--c-steel)] flex flex-wrap items-center gap-1">
          <span>Recent sales:</span>
          {guide.recent.length === 0 ? (
            <span>none yet</span>
          ) : (
            guide.recent.map((r, i) => (
              <span
                key={i}
                className="px-1 ink-border-sm bg-[var(--c-paper)] text-[var(--c-ink)]"
                title={new Date(r.at).toLocaleDateString()}
              >
                {fmtCredits(r.price)}
              </span>
            ))
          )}
          {guide.active_count > 0 && <span>· {guide.active_count} live</span>}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2">
          <Notice text={`Price guide: ${error}`} />
          <PopButton color="steel" onClick={onRetry}>
            RETRY
          </PopButton>
        </div>
      )}
    </section>
  );
}

function Payout({
  price,
  type,
  qty,
  buyout,
}: {
  price: number;
  type: 'fixed' | 'auction';
  qty: number;
  buyout: number | null;
}) {
  const ok = Number.isFinite(price) && price > 0;
  return (
    <div
      className="ink-border-sm bg-[var(--c-yellow)]/25 px-2 py-1.5 fs-xs font-bold"
      aria-live="polite"
    >
      <div className="flex justify-between gap-2">
        <span>
          {type === 'auction' ? 'At the starting bid' : 'Sale price'}
          {qty > 1 && ok ? ` (${qty} × ${fmtCredits(Math.round(price / qty))})` : ''}
        </span>
        <span>{ok ? fmtCredits(price) : '—'}</span>
      </div>
      <div className="flex justify-between gap-2 text-[var(--c-steel)]">
        <span>Market fee (5%)</span>
        <span>{ok ? `−${fmtCredits(marketFee(price))}` : '—'}</span>
      </div>
      <div className="flex justify-between gap-2 heading-font text-xs mt-0.5">
        <span>YOU RECEIVE</span>
        <span>{ok ? <Credits amount={youReceive(price)} /> : '—'}</span>
      </div>
      {type === 'auction' && buyout != null && buyout > 0 && (
        <div className="flex justify-between gap-2 text-[var(--c-steel)]">
          <span>If bought out</span>
          <span>{fmtCredits(youReceive(buyout))}</span>
        </div>
      )}
    </div>
  );
}

function ConfirmState({
  lines,
  busy,
  error,
  onBack,
  onConfirm,
  cta,
}: {
  lines: [string, string][];
  busy: boolean;
  error: string;
  onBack: () => void;
  onConfirm: () => void;
  cta: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <dl className="ink-border-sm divide-y-2 divide-[var(--c-ink)]/10 fs-xs font-bold">
        {lines.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 px-2 py-1">
            <dt className="text-[var(--c-steel)]">{k}</dt>
            <dd className="text-right">{v}</dd>
          </div>
        ))}
      </dl>
      <p className="fs-xs font-bold text-[var(--c-steel)]">
        Listed cards leave your collection until they sell, you cancel, or the listing expires.
      </p>
      {error && <ErrorRetry error={error} busy={busy} onRetry={onConfirm} />}
      <div className="flex gap-2">
        <PopButton color="steel" onClick={onBack} disabled={busy}>
          ◂ BACK
        </PopButton>
        <PopButton
          color="yellow"
          onClick={onConfirm}
          disabled={busy}
          className="flex-1 justify-center"
        >
          {busy ? 'LISTING…' : `${cta} ▸`}
        </PopButton>
      </div>
    </div>
  );
}

function ErrorRetry({
  error,
  busy,
  onRetry,
}: {
  error: string;
  busy: boolean;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Notice text={error} />
      <PopButton color="steel" onClick={onRetry} disabled={busy}>
        <span className="inline-flex items-center gap-1">
          <RotateCcw className="w-3 h-3" aria-hidden /> RETRY
        </span>
      </PopButton>
    </div>
  );
}

function DoneState({
  done,
  byKeyTitle,
  busy,
  error,
  onView,
  onAnother,
  onUndo,
}: {
  done: { ids: string[]; results: BatchResult[]; lots: BatchLot[] };
  byKeyTitle: (lot: BatchLot) => string;
  busy: boolean;
  error: string;
  onView: () => void;
  onAnother: () => void;
  onUndo: () => void;
}) {
  const failed = done.results.filter((r) => !r.ok);
  return (
    <div className="flex flex-col gap-2" role="status">
      <p className="heading-font text-sm flex items-center gap-1">
        <Check className="w-4 h-4" aria-hidden />
        {done.ids.length === 1 ? 'Your listing is live!' : `${done.ids.length} listings are live!`}
      </p>
      <ul className="fs-xs font-bold flex flex-col gap-1">
        {done.results.map((r) => {
          const lot = done.lots[r.index];
          if (!lot) return null;
          return (
            <li
              key={r.index}
              className={cn(
                'flex justify-between gap-2 px-2 py-1 ink-border-sm',
                r.ok ? 'bg-[var(--c-paper)]' : 'bg-[var(--c-red)] text-[var(--c-paper)]',
              )}
            >
              <span className="truncate">
                {r.ok ? '✓' : '✕'} {byKeyTitle(lot)}
                {lot.quantity > 1 ? ` ×${lot.quantity}` : ''}
              </span>
              <span className="shrink-0">{r.ok ? fmtCredits(lot.price) : r.error}</span>
            </li>
          );
        })}
      </ul>
      {failed.length > 0 && (
        <p className="fs-xs font-bold text-[var(--c-red)]">
          {failed.length} couldn't be listed — the rest went up. Fix and list them again.
        </p>
      )}
      {error && <Notice text={error} />}
      <div className="flex flex-wrap gap-2">
        <PopButton color="yellow" onClick={onView} disabled={busy || done.ids.length === 0}>
          VIEW LISTING{done.ids.length > 1 ? 'S' : ''} ▸
        </PopButton>
        <PopButton color="black" onClick={onAnother} disabled={busy}>
          LIST ANOTHER
        </PopButton>
        <PopButton color="steel" onClick={onUndo} disabled={busy || done.ids.length === 0}>
          {busy ? 'UNDOING…' : 'UNDO'}
        </PopButton>
      </div>
    </div>
  );
}

function BulkDesk(p: {
  plan: { item: SellItem; lot: BatchLot }[];
  guides: Map<string, PriceGuide>;
  guideBusy: boolean;
  guideErr: string;
  onRetryGuide: () => void;
  pct: number;
  setPct: (n: number) => void;
  allCopies: boolean;
  setAllCopies: (b: boolean) => void;
  total: number;
  belowFloor: number;
  step: Step;
  setStep: (s: Step) => void;
  busy: boolean;
  error: string;
  slotsFree: number;
  onRemove: (key: string) => void;
  onSubmit: () => void;
}) {
  if (p.plan.length === 0)
    return (
      <p className="fs-xs font-bold text-[var(--c-steel)] py-8 text-center">
        Tap up to {Math.min(MAX_BATCH, p.slotsFree)} items on the left. They list together as
        fixed-price listings, priced from each one's market value.
        {p.slotsFree === 0 && ' All your listing slots are in use.'}
      </p>
    );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <span className={label} id="bulk-pct">
          Price at % of market
        </span>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-labelledby="bulk-pct">
          {[80, 90, 100, 110, 125].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={p.pct === n}
              disabled={p.step !== 'edit'}
              onClick={() => p.setPct(n)}
              className={cn(
                'ink-border-sm px-2 min-h-[32px] text-xs font-black',
                p.pct === n ? 'bg-[var(--c-ink)] text-[var(--c-yellow)]' : 'bg-[var(--c-paper)]',
              )}
            >
              {n}%
            </button>
          ))}
          <label className="inline-flex items-center gap-1 text-xs font-bold">
            <input
              className={cn(input, 'w-16')}
              inputMode="numeric"
              aria-label="Custom percent of market"
              value={p.pct}
              disabled={p.step !== 'edit'}
              onChange={(e) => p.setPct(Math.min(1000, Math.max(1, toInt(e.target.value) || 1)))}
            />
            %
          </label>
        </div>
        <label className="inline-flex items-center gap-1.5 fs-xs font-bold min-h-[24px] cursor-pointer">
          <input
            type="checkbox"
            className="w-4 h-4"
            checked={p.allCopies}
            disabled={p.step !== 'edit'}
            onChange={(e) => p.setAllCopies(e.target.checked)}
          />
          List every spare copy (up to {LISTING_MAX_QTY} per listing) — otherwise one each
        </label>
      </div>
      <ul className="flex flex-col gap-1 max-h-72 overflow-y-auto">
        {p.plan.map(({ item, lot }) => {
          const g = p.guides.get(item.key);
          const under = lot.price / lot.quantity < item.quicksell;
          return (
            <li
              key={item.key}
              className="flex items-center gap-2 ink-border-sm px-2 py-1 bg-[var(--c-paper)]"
            >
              <span className="min-w-0 flex-1">
                <span className="text-xs font-black block truncate">
                  {itemTitle(item)}
                  {lot.quantity > 1 ? ` ×${lot.quantity}` : ''}
                </span>
                <span className="fs-xs font-bold text-[var(--c-steel)]">
                  Market{' '}
                  {g ? fmtCredits(g.market) : p.guideBusy ? '…' : `~${fmtCredits(item.value)}`}
                  {under && <span className="text-[var(--c-red)]"> · under quicksell</span>}
                </span>
              </span>
              <span className="text-xs font-black shrink-0">{fmtCredits(lot.price)}</span>
              {p.step === 'edit' && (
                <button
                  type="button"
                  className="w-7 h-7 ink-border-sm flex items-center justify-center shrink-0"
                  aria-label={`Remove ${item.def.name}`}
                  onClick={() => p.onRemove(item.key)}
                >
                  <X className="w-3.5 h-3.5" aria-hidden />
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {p.guideErr && (
        <div className="flex items-center gap-2">
          <Notice text={`Price guide: ${p.guideErr}`} />
          <PopButton color="steel" onClick={p.onRetryGuide}>
            RETRY
          </PopButton>
        </div>
      )}
      <div className="ink-border-sm bg-[var(--c-yellow)]/25 px-2 py-1.5 fs-xs font-bold">
        <div className="flex justify-between">
          <span>{p.plan.length} fixed-price listings</span>
          <span>{fmtCredits(p.total)}</span>
        </div>
        <div className="flex justify-between text-[var(--c-steel)]">
          <span>Market fee (5% each)</span>
          <span>−{fmtCredits(p.plan.reduce((a, x) => a + marketFee(x.lot.price), 0))}</span>
        </div>
        <div className="flex justify-between heading-font text-xs mt-0.5">
          <span>YOU RECEIVE IF ALL SELL</span>
          <Credits amount={p.plan.reduce((a, x) => a + youReceive(x.lot.price), 0)} />
        </div>
      </div>
      {p.belowFloor > 0 && (
        <p className="fs-xs font-bold flex items-start gap-1 px-2 py-1 ink-border-sm bg-[var(--c-yellow)]">
          <TriangleAlert className="w-3.5 h-3.5 shrink-0 mt-px" aria-hidden />
          {p.belowFloor} priced under the quicksell floor — quickselling would pay more.
        </p>
      )}
      {p.error && <ErrorRetry error={p.error} busy={p.busy} onRetry={p.onSubmit} />}
      {p.step === 'edit' ? (
        <PopButton
          color="yellow"
          onClick={() => p.setStep('confirm')}
          className="w-full justify-center"
        >
          REVIEW {p.plan.length} LISTING{p.plan.length === 1 ? '' : 'S'} ▸
        </PopButton>
      ) : (
        <div className="flex gap-2">
          <PopButton color="steel" onClick={() => p.setStep('edit')} disabled={p.busy}>
            ◂ BACK
          </PopButton>
          <PopButton
            color="yellow"
            onClick={p.onSubmit}
            disabled={p.busy}
            className="flex-1 justify-center"
          >
            {p.busy ? 'LISTING…' : `LIST ALL ${p.plan.length} ▸`}
          </PopButton>
        </div>
      )}
    </div>
  );
}

function ActiveListings({
  listings,
  now,
  onChanged,
  cancelListing,
  onView,
  onRelist,
}: {
  listings: MarketListing[];
  now: number;
  onChanged: () => Promise<void>;
  cancelListing: (id: string) => Promise<string | null>;
  onView: (id: string) => void;
  onRelist: (l: MarketListing) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [err, setErr] = useState<{ id: string; text: string } | null>(null);
  const act = async (id: string, fn: () => Promise<string | null>) => {
    if (busyId) return false;
    setBusyId(id);
    setErr(null);
    try {
      const e = await fn();
      if (e) {
        setErr({ id, text: e });
        return false;
      }
      await onChanged();
      return true;
    } catch {
      setErr({ id, text: 'Connection problem — try again.' });
      return false;
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-labelledby="sell-active">
      <h2 id="sell-active" className="heading-font text-sm mb-2">
        YOUR ACTIVE LISTINGS · {listings.length}/{MAX_ACTIVE_LISTINGS}
      </h2>
      {listings.length === 0 ? (
        <p className="fs-xs font-bold text-[var(--c-steel)]">Nothing on the market yet.</p>
      ) : (
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {listings.map((l) => {
            const def = POOL_BY_ID[l.card_id];
            const auction = l.listing_type === 'auction';
            const busy = busyId === l.id;
            return (
              <li
                key={l.id}
                className="ink-border-md bg-[var(--c-paper)] shadow-hard-black-xs p-2 flex flex-col gap-1.5"
              >
                <div className="flex items-start gap-2">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left min-h-[24px]"
                    onClick={() => onView(l.id)}
                  >
                    <span className="heading-font fs-xs block truncate underline decoration-dotted">
                      {def?.name ?? l.card_id}
                      {l.foil ? ' ✦' : ''}
                      {asVariant(l.variant)
                        ? ` ◆ ${VARIANT_META[asVariant(l.variant)!].short}`
                        : ''}
                      {l.quantity > 1 ? ` ×${l.quantity}` : ''}
                      {l.graded_id && l.slab_grade != null
                        ? ` · SLAB ${Number(l.slab_grade)} ${(l.slab_service ?? '').toUpperCase()}`
                        : ''}
                    </span>
                    <span className="fs-xs font-bold text-[var(--c-steel)] inline-flex items-center gap-1">
                      {auction ? 'AUCTION' : 'FIXED'} · <Clock className="w-3 h-3" aria-hidden />
                      {hoursLeft(l.ends_at, now)}
                    </span>
                  </button>
                  <span className="text-right shrink-0">
                    <span className="heading-font text-xs inline-flex items-center gap-1 bg-[var(--c-yellow)] px-1.5 py-0.5 ink-border-sm">
                      {auction ? (
                        <Gavel className="w-3 h-3" aria-hidden />
                      ) : (
                        <Coins className="w-3 h-3" aria-hidden />
                      )}
                      {fmtCredits(auction ? (l.current_bid ?? l.price) : l.price)}
                    </span>
                    {auction && (
                      <span className="fs-xs font-bold text-[var(--c-steel)] block mt-0.5">
                        {l.bid_count > 0
                          ? `${l.bid_count} bid${l.bid_count === 1 ? '' : 's'}`
                          : `start · no bids`}
                      </span>
                    )}
                  </span>
                </div>
                {editing === l.id ? (
                  <div className="flex flex-wrap items-center gap-1">
                    <input
                      className={cn(input, 'w-28')}
                      inputMode="numeric"
                      aria-label="New price"
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                    />
                    <PopButton
                      color="yellow"
                      disabled={
                        busy ||
                        !(toInt(text) >= 1 && toInt(text) <= LISTING_MAX_PRICE) ||
                        toInt(text) === l.price
                      }
                      onClick={async () => {
                        if (await act(l.id, () => updateListingPrice(l.id, toInt(text))))
                          setEditing(null);
                      }}
                    >
                      {busy ? 'SAVING…' : 'SAVE'}
                    </PopButton>
                    <PopButton color="steel" disabled={busy} onClick={() => setEditing(null)}>
                      CANCEL
                    </PopButton>
                    {toInt(text) >= 1 && (
                      <span className="fs-xs font-bold text-[var(--c-steel)]">
                        you receive {fmtCredits(youReceive(toInt(text)))}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-1">
                    {!auction && (
                      <PopButton
                        color="black"
                        disabled={!!busyId}
                        onClick={() => {
                          setEditing(l.id);
                          setText(String(l.price));
                        }}
                      >
                        EDIT PRICE
                      </PopButton>
                    )}
                    {auction && l.bid_count === 0 && (
                      <PopButton
                        color="black"
                        disabled={!!busyId}
                        title="Auctions can't be re-priced — this cancels it and loads it back into the desk"
                        onClick={async () => {
                          if (!(await askConfirm('Cancel this auction and set it up again?')))
                            return;
                          if (await act(l.id, () => cancelListing(l.id))) onRelist(l);
                        }}
                      >
                        CANCEL & RELIST
                      </PopButton>
                    )}
                    <PopButton
                      color="steel"
                      disabled={!!busyId || l.bid_count > 0}
                      title={l.bid_count > 0 ? 'Auctions with bids cannot be cancelled' : undefined}
                      onClick={async () => {
                        if (
                          !(await askConfirm('Cancel this listing? Your cards will be returned.'))
                        )
                          return;
                        await act(l.id, () => cancelListing(l.id));
                      }}
                    >
                      {busy ? 'WORKING…' : 'CANCEL'}
                    </PopButton>
                  </div>
                )}
                {err?.id === l.id && <Notice text={err.text} />}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
