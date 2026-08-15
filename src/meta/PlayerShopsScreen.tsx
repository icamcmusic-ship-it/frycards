import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Store,
  Star,
  Flag,
  Package,
  Lock,
  Plus,
  X,
  TrendingUp,
  Sparkles,
  Clock,
  Coins,
  Eye,
  Layers,
  Palette,
  Repeat,
  Wand2,
  ShieldCheck,
} from 'lucide-react';
import { useMeta } from './MetaContext';
import { MetaHeader, PopButton, Notice, Credits } from './ui';
import { cn } from '../lib/utils';
import { POOL_BY_ID, POOL_V4 } from '../game/v3/cardpool';
import { CardDef } from '../game/v3/cards';
import { CardFace } from '../components/CardFaceV4';
import { RARITY_CHIP } from './rarity';
import {
  fmtCredits,
  SHOP_UNLOCK_LEVEL,
  SHOP_SETUP_FEE,
  SHOP_BASE_SLOTS,
  SHOP_MAX_SLOTS,
  shopSlotCost,
  shopMinPoolSize,
} from './economy';
import { PlayerLink } from './PlayerProfileModal';
import { spareSplit } from './CollectionScreen';
import { SafeImage } from './SafeImage';
import { RARITY_ORDER, RARITY_HEX, rarityTier } from './rarity';
import {
  accentCss,
  accentWash,
  accentCardWash,
  shopMonogram,
  SHOP_ACCENT_LABEL,
} from './shopAccents';
import {
  PlayerShop,
  ShopSlot,
  ShopListing,
  ShopListingCardItem,
  ShopPurchase,
  ShopPublic,
  BrowseShopEntry,
  MysteryTemplate,
  MysteryMode,
  MysterySlotMode,
  MysterySlotSpec,
  MysteryPoolValidation,
  MysteryLiveStats,
  MysteryGuarantee,
  MysteryPoolPublic,
  ListableCard,
  ShopAccent,
  SHOP_ACCENTS,
  ShopBuyerRating,
  PublicProfile,
  DeckRow,
  PlayerCard,
  subscribeTable,
  fetchMysteryPoolPublic,
  fetchListableInventory,
  updateShop,
  fetchMyShop,
  fetchShopSlots,
  fetchShopListings,
  fetchMysteryTemplates,
  fetchShopPublic,
  browseShops,
  fetchMysteryLiveStats,
  fetchMyShopPurchases,
  fetchMyBuyerRatings,
  fetchCardBlendedReference,
  fetchPublicProfiles,
  openShop,
  reopenShop,
  closeShop,
  buyShopSlot,
  createShopListing,
  cancelShopListing,
  buyShopListing,
  createMysteryTemplate,
  previewMysteryPool,
  submitMysteryPool,
  buyMysteryPack,
  rateShopPurchase,
  reportListing,
} from '../lib/supabase';

// Mirror rarity.ts's ladder — a local copy drifted once already (missing
// 'Alt-Art'), which made Alt-Art weights/guarantees impossible to express in
// the mystery builder even though the server's validate_mystery_pool accepts them.
const RARITIES = RARITY_ORDER;

function defFor(cardId: string): CardDef {
  return (
    POOL_BY_ID[cardId] || {
      id: cardId,
      name: cardId,
      type: 'Unit' as CardDef['type'],
      rarity: 'Common' as CardDef['rarity'],
    }
  );
}

const RATING_WINDOW_MS = 3 * 86_400_000;

function withinRatingWindow(createdAt: string | null | undefined): boolean {
  if (!createdAt) return false;
  return Date.now() - new Date(createdAt).getTime() < RATING_WINDOW_MS;
}

function shopAge(createdAt: string | null | undefined): string {
  const ts = createdAt ? new Date(createdAt).getTime() : NaN;
  if (Number.isNaN(ts)) return 'opened recently';
  const days = Math.max(0, Math.floor((Date.now() - ts) / 86_400_000));
  if (days < 1) return 'opened today';
  if (days === 1) return '1 day old';
  if (days < 60) return `${days} days old`;
  return `${Math.floor(days / 30)} months old`;
}

function RatingBadge({ shop }: { shop: ShopPublic | BrowseShopEntry }) {
  if (!shop.rating_unlocked || shop.composite_score == null) {
    return (
      <span className="text-[9px] font-black px-1.5 py-0.5 bg-[var(--c-steel)] text-[var(--c-paper)] ink-border-sm">
        NEW SELLER
      </span>
    );
  }
  const score = shop.composite_score;
  return (
    <span className="flex items-center gap-1 text-[10px] font-black px-1.5 py-0.5 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm">
      <Star className="w-3 h-3 fill-current" /> {score.toFixed(1)} / 5
    </span>
  );
}

/** Small rarity pill used across the pool viewer and composition meters. */
function RarityPill({
  rarity,
  children,
  title,
}: {
  key?: React.Key;
  rarity: string;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <span
      title={title}
      className="text-[9px] font-black px-1.5 py-0.5 ink-border-sm whitespace-nowrap"
      style={{
        backgroundColor: RARITY_HEX[rarity] || RARITY_HEX.Common,
        // Match RARITY_CHIP's contrast choices: light backgrounds (Common,
        // Uncommon green, Full-Art teal, Ultra-Rare gold) take dark text.
        color: ['Common', 'Uncommon', 'Full-Art', 'Ultra-Rare'].includes(rarity)
          ? '#1A1A1A'
          : '#fff',
      }}
    >
      {children}
    </span>
  );
}

/** Human phrasing for one rarity guarantee. */
function guaranteeText(g: MysteryGuarantee): string {
  return `${g.count}× ${g.rarity} or better`;
}

// ---------------------------------------------------------------------------
// Mystery pool disclosure — the full list of cards a seller committed to a
// mystery listing, what's left of each, and the odds that implies. Buyers used
// to see nothing but a price and a blended EV number.
// ---------------------------------------------------------------------------
function MysteryPoolModal({ listingId, onClose }: { listingId: string; onClose: () => void }) {
  const [pool, setPool] = useState<MysteryPoolPublic | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [showSpent, setShowSpent] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    fetchMysteryPoolPublic(listingId)
      .then(setPool)
      .catch(() => setError("Couldn't load this pack's pool. Check your connection and try again."))
      .finally(() => setLoading(false));
  }, [listingId]);

  useEffect(() => {
    load();
  }, [load]);

  // Someone else buying a pack changes what's left in this pool while it's
  // open on screen — follow the listing row rather than leaving stale odds up.
  useEffect(
    () => subscribeTable('shop_listings', load, { filter: `id=eq.${listingId}` }),
    [listingId, load],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const visibleCards = (pool?.cards ?? []).filter((c) => showSpent || c.remaining > 0);

  return (
    <div
      className="fixed inset-0 bg-[var(--c-ink)]/90 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Mystery pack pool"
    >
      <div
        className="bg-[var(--c-paper)] ink-border-md shadow-hard-yellow w-full max-w-3xl max-h-[86vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2 p-3 border-b-2 border-[var(--c-ink)]/15">
          <div className="min-w-0">
            <div className="heading-font text-sm truncate">
              {pool?.template_name || 'MYSTERY PACK'} — FULL POOL
            </div>
            <div className="text-[10px] font-bold text-[var(--c-steel)] mt-0.5">
              Every card this seller put into the pool. Odds below are computed from what is
              actually left.
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close pool viewer"
            className="shrink-0 w-10 h-10 -m-2 flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-3">
          {loading ? (
            <div className="text-center font-bold text-[var(--c-steel)] py-12 animate-pulse">
              LOADING POOL…
            </div>
          ) : error || !pool ? (
            <div className="text-center py-12">
              <p className="font-bold text-[var(--c-steel)] mb-3">{error || 'Pool unavailable.'}</p>
              <PopButton color="red" onClick={load}>
                RETRY
              </PopButton>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-2 mb-3 text-[10px] font-bold">
                <span className="bg-[var(--c-ink)] text-[var(--c-paper)] px-2 py-1 ink-border-sm">
                  {pool.pack_size} cards per pack
                </span>
                <span className="bg-[var(--c-ink)] text-[var(--c-paper)] px-2 py-1 ink-border-sm">
                  {pool.remaining_packs ?? 0}/{pool.total_packs ?? 0} packs left
                </span>
                <span className="bg-[var(--c-ink)] text-[var(--c-paper)] px-2 py-1 ink-border-sm">
                  {pool.cards_remaining} cards still in the pool
                </span>
                <span className="bg-[var(--c-yellow)] text-[var(--c-ink)] px-2 py-1 ink-border-sm inline-flex items-center gap-1">
                  <Coins className="w-3 h-3" /> {fmtCredits(pool.price)} per pack
                </span>
              </div>

              {pool.guarantees.length > 0 && (
                <div className="ink-border-sm p-2 mb-3 bg-[var(--c-yellow)]/15">
                  <div className="heading-font text-[10px] mb-1 flex items-center gap-1">
                    <ShieldCheck className="w-3.5 h-3.5" /> GUARANTEED IN EVERY PACK
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {pool.guarantees.map((g, i) => (
                      <RarityPill key={i} rarity={g.rarity}>
                        {guaranteeText(g)}
                      </RarityPill>
                    ))}
                  </div>
                </div>
              )}

              {pool.rarities.length > 0 && (
                <div className="mb-3">
                  <div className="heading-font text-[10px] mb-1">PULL ODDS BY RARITY</div>
                  <div className="flex flex-col gap-1">
                    {pool.rarities.map((r) => (
                      <div key={r.rarity} className="flex items-center gap-2">
                        <RarityPill rarity={r.rarity}>{r.rarity}</RarityPill>
                        <div className="flex-1 h-2.5 ink-border-sm bg-[var(--c-ink)]/10 overflow-hidden">
                          <div
                            className="h-full"
                            style={{
                              width: `${r.pull_chance_pct ?? 0}%`,
                              backgroundColor: RARITY_HEX[r.rarity] || RARITY_HEX.Common,
                            }}
                          />
                        </div>
                        <span className="text-[10px] font-bold w-28 text-right">
                          {r.pull_chance_pct != null ? `${r.pull_chance_pct}%` : '—'} ·{' '}
                          {r.remaining}/{r.submitted}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mb-1">
                <div className="heading-font text-[10px]">
                  POOL CONTENTS ({visibleCards.length} entries)
                </div>
                <label className="flex items-center gap-1 text-[10px] font-bold">
                  <input
                    type="checkbox"
                    checked={showSpent}
                    onChange={(e) => setShowSpent(e.target.checked)}
                  />
                  Show cards already pulled
                </label>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
                {visibleCards.map((c) => (
                  <div
                    key={`${c.card_id}-${c.foil}`}
                    className={cn(
                      'flex items-center gap-2 ink-border-sm px-2 py-1 bg-[var(--c-paper)]',
                      c.remaining === 0 && 'opacity-45',
                    )}
                    style={{ borderLeft: `5px solid ${RARITY_HEX[c.rarity] || RARITY_HEX.Common}` }}
                  >
                    <div className="w-8 h-11 shrink-0 overflow-hidden ink-border-sm">
                      <SafeImage
                        src={c.image_url}
                        alt=""
                        className="w-full h-full object-cover"
                        fallbackText="?"
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-black truncate">
                        {c.name}
                        {c.foil ? ' ✦' : ''}
                      </div>
                      <div className="text-[9px] font-bold text-[var(--c-steel)]">
                        {c.rarity} · {c.remaining}/{c.submitted} left
                      </div>
                    </div>
                  </div>
                ))}
                {visibleCards.length === 0 && (
                  <div className="col-span-full text-center text-[11px] font-bold text-[var(--c-steel)] py-6">
                    Every card in this pool has been pulled.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reusable: multi-card picker for bundle contents / mystery pool submission
// ---------------------------------------------------------------------------
/**
 * Bulk pool building. The one-card-at-a-time picker below is fine for a bundle
 * of three, but a mystery pool needs 30–200 cards and used to be built click by
 * click. These act on the server's own view of what is listable (deck locks and
 * serialized prints already netted out), so nothing staged here can be rejected
 * at submit time for over-committing.
 */
function QuickAddBar({
  items,
  onChange,
  packSize,
  guarantees,
}: {
  items: ShopListingCardItem[];
  onChange: (items: ShopListingCardItem[]) => void;
  /** Set for mystery pools — enables the "fill to N packs" action. */
  packSize?: number;
  guarantees?: MysteryGuarantee[];
}) {
  const [inv, setInv] = useState<ListableCard[] | null>(null);
  const [error, setError] = useState('');
  const [packs, setPacks] = useState(10);
  const [includeFoils, setIncludeFoils] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchListableInventory()
      .then((v) => {
        if (!cancelled) setInv(v);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load your listable cards.');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Copies of each (card, foil) already staged in `items`. */
  const staged = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items)
      m.set(`${i.card_id}:${i.foil}`, (m.get(`${i.card_id}:${i.foil}`) || 0) + i.quantity);
    return m;
  }, [items]);

  /** Every (card, foil) line with spare copies left to stage, cheapest first. */
  const available = useMemo(() => {
    const out: { card_id: string; foil: boolean; rarity: string; free: number; value: number }[] =
      [];
    for (const c of inv ?? []) {
      const n = c.spare_normal - (staged.get(`${c.card_id}:false`) || 0);
      if (n > 0)
        out.push({
          card_id: c.card_id,
          foil: false,
          rarity: c.rarity,
          free: n,
          value: c.value_normal,
        });
      if (includeFoils) {
        const f = c.spare_foil - (staged.get(`${c.card_id}:true`) || 0);
        if (f > 0)
          out.push({
            card_id: c.card_id,
            foil: true,
            rarity: c.rarity,
            free: f,
            value: c.value_foil,
          });
      }
    }
    return out.sort((a, b) => a.value - b.value);
  }, [inv, staged, includeFoils]);

  const byRarity = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of available) m.set(a.rarity, (m.get(a.rarity) || 0) + a.free);
    return m;
  }, [available]);

  const merge = (adds: { card_id: string; foil: boolean; quantity: number }[]) => {
    if (adds.length === 0) return;
    const next = [...items];
    for (const a of adds) {
      const idx = next.findIndex((i) => i.card_id === a.card_id && i.foil === a.foil);
      if (idx >= 0) next[idx] = { ...next[idx], quantity: next[idx].quantity + a.quantity };
      else next.push({ card_id: a.card_id, foil: a.foil, quantity: a.quantity });
    }
    onChange(next);
  };

  const addRarity = (rarity: string) =>
    merge(
      available
        .filter((a) => a.rarity === rarity)
        .map((a) => ({ card_id: a.card_id, foil: a.foil, quantity: a.free })),
    );

  const poolSize = items.reduce((s, i) => s + i.quantity, 0);

  /**
   * Fill toward `packs × packSize` cards. Guarantee requirements are satisfied
   * first — cheapest card that clears each floor, one per pack — and the rest
   * of the pool is topped up with the cheapest spares, which is the shape a
   * seller wants anyway (EV floor low, guarantees intact).
   */
  const autofill = () => {
    if (!packSize) return;
    const target = packs * packSize;
    const need = target - poolSize;
    if (need <= 0) return;

    const remaining = new Map<string, number>(
      available.map((a) => [`${a.card_id}:${a.foil}`, a.free] as const),
    );
    const take = (pred: (a: (typeof available)[number]) => boolean, count: number) => {
      const adds: { card_id: string; foil: boolean; quantity: number }[] = [];
      let left = count;
      for (const a of available) {
        if (left <= 0) break;
        if (!pred(a)) continue;
        const key = `${a.card_id}:${a.foil}`;
        const free = remaining.get(key) || 0;
        if (free <= 0) continue;
        const n = Math.min(free, left);
        remaining.set(key, free - n);
        adds.push({ card_id: a.card_id, foil: a.foil, quantity: n });
        left -= n;
      }
      return { adds, short: left };
    };

    const all: { card_id: string; foil: boolean; quantity: number }[] = [];
    let budget = need;
    // Strictest floor first, so a Mythic isn't spent satisfying a Rare slot.
    const sorted = [...(guarantees ?? [])].sort(
      (a, b) => rarityTier(b.rarity) - rarityTier(a.rarity),
    );
    for (const g of sorted) {
      const want = Math.min(budget, g.count * packs);
      const { adds, short } = take((a) => rarityTier(a.rarity) >= rarityTier(g.rarity), want);
      all.push(...adds);
      budget -= want - short;
    }
    if (budget > 0) {
      const { adds } = take(() => true, budget);
      all.push(...adds);
    }
    merge(all);
  };

  if (error) {
    return <div className="text-[10px] font-bold text-[var(--c-red)] mb-2">{error}</div>;
  }
  if (!inv) {
    return (
      <div className="text-[10px] font-bold text-[var(--c-steel)] mb-2 animate-pulse">
        Loading your listable cards…
      </div>
    );
  }

  return (
    <div className="ink-border-sm p-2 mb-2 bg-[var(--c-yellow)]/10">
      <div className="heading-font text-[10px] mb-1.5 flex items-center gap-1">
        <Wand2 className="w-3.5 h-3.5" /> QUICK ADD
      </div>
      <div className="flex flex-wrap gap-1.5 items-center mb-1.5">
        {RARITY_ORDER.filter((r) => (byRarity.get(r) || 0) > 0).map((r) => (
          <button
            key={r}
            onClick={() => addRarity(r)}
            className="text-[9px] font-black px-1.5 py-0.5 min-h-10 ink-border-sm btn-pop"
            style={{
              backgroundColor: RARITY_HEX[r],
              // Same contrast choices as RARITY_CHIP (see RarityPill).
              color: ['Common', 'Uncommon', 'Full-Art', 'Ultra-Rare'].includes(r)
                ? '#1A1A1A'
                : '#fff',
            }}
          >
            + ALL {r.toUpperCase()} ({byRarity.get(r)})
          </button>
        ))}
        {byRarity.size === 0 && (
          <span className="text-[10px] font-bold text-[var(--c-steel)]">
            No spare copies left to add.
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <label className="flex items-center gap-1 text-[10px] font-bold">
          <input
            type="checkbox"
            checked={includeFoils}
            onChange={(e) => setIncludeFoils(e.target.checked)}
          />
          Include foils ✦
        </label>
        {packSize != null && (
          <>
            <label className="flex items-center gap-1 text-[10px] font-bold">
              Fill to
              <input
                type="number"
                min={1}
                max={200}
                value={packs}
                onChange={(e) => setPacks(Math.max(1, Math.min(200, Number(e.target.value) || 1)))}
                className="w-14 px-1 py-0.5 ink-border-sm"
              />
              packs ({packs * packSize} cards)
            </label>
            <PopButton color="steel" onClick={autofill}>
              AUTOFILL
            </PopButton>
          </>
        )}
        {items.length > 0 && (
          <PopButton color="steel" onClick={() => onChange([])}>
            CLEAR ALL
          </PopButton>
        )}
      </div>
    </div>
  );
}

function CardStackPicker({
  collection,
  decks,
  items,
  onChange,
  maxItems,
  bulk,
  packSize,
  guarantees,
}: {
  collection: PlayerCard[];
  decks: DeckRow[];
  items: ShopListingCardItem[];
  onChange: (items: ShopListingCardItem[]) => void;
  /** When set, adding a new card replaces the current selection instead of appending. */
  maxItems?: number;
  /** Show the bulk QUICK ADD strip above the per-card picker. */
  bulk?: boolean;
  packSize?: number;
  guarantees?: MysteryGuarantee[];
}) {
  const [search, setSearch] = useState('');
  const [cardId, setCardId] = useState('');
  const [foil, setFoil] = useState(false);
  const [qty, setQty] = useState(1);

  const locked = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of decks) for (const id of d.card_ids ?? []) m.set(id, (m.get(id) || 0) + 1);
    return m;
  }, [decks]);

  // Serialized prints count inside `quantity` but can never be listed in a
  // player shop — reserve them like Collection/Marketplace do.
  const { serializedCards } = useMeta();
  const serializedReserved = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of serializedCards) m.set(s.card_id, (m.get(s.card_id) || 0) + 1);
    return m;
  }, [serializedCards]);

  const sellable = useMemo(
    () =>
      collection
        .filter((c) => {
          const def = POOL_BY_ID[c.card_id];
          if (!def || def.type === 'Leader') return false;
          // Same per-variant math as totalSpare below: deck locks consume
          // normal copies first (spilling into foil) and the serialized
          // reservation only holds back normal copies. A flat sum here
          // double-counted locks + serialized against the same physical
          // copies and hid cards whose foil was genuinely listable.
          const spare = spareSplit(
            { q: c.quantity, f: c.foil_quantity },
            locked.get(c.card_id) || 0,
          );
          return (
            Math.max(0, spare.normal - (serializedReserved.get(c.card_id) || 0)) + spare.foil > 0
          );
        })
        .map((c) => ({ ...c, def: POOL_BY_ID[c.card_id]! }))
        .filter((c) => !search || c.def.name.toLowerCase().includes(search.toLowerCase())),
    [collection, locked, serializedReserved, search],
  );

  // Look the selected card up in the full collection, not the search-filtered
  // `sellable` list — otherwise typing in the search box mid-flow (e.g. to
  // find the next card for a bundle/pool) silently deselected the current
  // card and collapsed the qty/ADD row. Same fix as Marketplace's SellForm.
  const selectedEntry = collection.find((c) => c.card_id === cardId);
  const selected =
    selectedEntry && POOL_BY_ID[cardId] && POOL_BY_ID[cardId].type !== 'Leader'
      ? selectedEntry
      : undefined;
  // Uses the same normal-copies-consumed-first, foil-as-spillover model as
  // CollectionScreen's spareSplit (also used by Marketplace's sell form) —
  // a locally-reinvented split here previously diverged from that model
  // whenever a deck-lock spilled from normal copies into foil, and could
  // let the player submit a quantity the server-side RPC would reject.
  const spare = selected
    ? spareSplit({ q: selected.quantity, f: selected.foil_quantity }, locked.get(cardId) || 0)
    : { normal: 0, foil: 0 };
  // Serialized prints are normal copies that can never be listed.
  const totalSpare = foil
    ? spare.foil
    : Math.max(0, spare.normal - (serializedReserved.get(cardId) || 0));
  // Copies of this exact card/foil combo already staged in `items` don't
  // stop being "spare" — but they're no longer available to add again, so
  // the input's max (and the "of X spare" label) must be reduced by however
  // much of this card/foil is already in the pool.
  const alreadyInPool = items
    .filter((i) => i.card_id === cardId && i.foil === foil)
    .reduce((sum, i) => sum + i.quantity, 0);
  const maxQty = Math.max(0, totalSpare - alreadyInPool);
  const select = 'px-2 py-1.5 bg-[var(--c-paper)] ink-border-sm font-bold text-xs';

  const add = () => {
    if (!selected || qty < 1 || qty > maxQty) return;
    if (maxItems === 1) {
      onChange([{ card_id: cardId, foil, quantity: qty }]);
    } else {
      const idx = items.findIndex((i) => i.card_id === cardId && i.foil === foil);
      if (idx >= 0) {
        const next = [...items];
        // Re-clamp to totalSpare (not maxQty, which is already net of what's
        // in the pool) — a second add for the same card/foil stacks onto
        // whatever's already there, and this is the safety net against
        // exceeding the player's actual spare copies.
        next[idx] = { ...next[idx], quantity: Math.min(totalSpare, next[idx].quantity + qty) };
        onChange(next);
      } else {
        onChange([...items, { card_id: cardId, foil, quantity: qty }]);
      }
    }
    setQty(1);
  };

  return (
    <div>
      {bulk && (
        <QuickAddBar
          items={items}
          onChange={onChange}
          packSize={packSize}
          guarantees={guarantees}
        />
      )}
      <input
        className={cn(select, 'w-full mb-2 placeholder:text-[var(--c-steel)]/50')}
        placeholder="Search your collection…"
        aria-label="Search your collection"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto ink-border-sm p-2 bg-[var(--c-paper)] mb-2">
        {sellable.map((c) => (
          <button
            key={c.card_id}
            onClick={() => {
              setCardId(c.card_id);
              // Same fix as Marketplace's SellForm: a card whose normal
              // copies are all locked/serialized but which has spare foils
              // passed the sellable filter, then dead-ended on "of 0 spare"
              // with a disabled + ADD unless the player found the Foil box.
              // Default the variant to the one that's actually sellable.
              const sp = spareSplit(
                { q: c.quantity, f: c.foil_quantity },
                locked.get(c.card_id) || 0,
              );
              const spareNormal = Math.max(0, sp.normal - (serializedReserved.get(c.card_id) || 0));
              setFoil(spareNormal <= 0 && sp.foil > 0);
              setQty(1);
            }}
            className={cn(
              // min-h keeps these dense chips tappable on a phone.
              'text-[9px] font-black px-1.5 py-0.5 min-h-10 ink-border-sm',
              RARITY_CHIP[c.def.rarity || 'Common'] || RARITY_CHIP.Common,
              cardId === c.card_id && 'outline outline-2 outline-[var(--c-red)]',
            )}
          >
            {c.def.name} ×{c.quantity}
            {c.foil_quantity > 0 ? ` ✦${c.foil_quantity}` : ''}
          </button>
        ))}
        {sellable.length === 0 && (
          <span className="text-[10px] font-bold text-[var(--c-steel)]">
            No spare cards available (deck-locked copies can't be listed).
          </span>
        )}
      </div>
      {selected && (
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          {selected.foil_quantity > 0 && (
            <label className="flex items-center gap-1 text-[10px] font-bold">
              <input
                type="checkbox"
                checked={foil}
                onChange={(e) => {
                  setFoil(e.target.checked);
                  setQty(1);
                }}
              />
              Foil ✦
            </label>
          )}
          <input
            type="number"
            min={1}
            max={maxQty}
            value={qty}
            aria-label="Quantity to add"
            onChange={(e) => setQty(Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)))}
            className="w-16 px-2 py-1 ink-border-sm text-xs"
          />
          <span className="text-[9px] text-[var(--c-steel)]">of {maxQty} spare</span>
          <PopButton color="steel" onClick={add} disabled={qty < 1 || qty > maxQty}>
            + ADD
          </PopButton>
        </div>
      )}
      {items.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap mb-1 text-[10px] font-black">
          <span className="bg-[var(--c-ink)] text-[var(--c-paper)] px-1.5 py-0.5 ink-border-sm">
            {items.reduce((s, i) => s + i.quantity, 0)} CARDS · {items.length} ENTRIES
          </span>
          {RARITY_ORDER.map((r) => {
            const n = items
              .filter((i) => (POOL_BY_ID[i.card_id]?.rarity || 'Common') === r)
              .reduce((s, i) => s + i.quantity, 0);
            return n > 0 ? (
              <RarityPill key={r} rarity={r}>
                {r} {n}
              </RarityPill>
            ) : null;
          })}
        </div>
      )}
      {items.length > 0 && (
        <div className="flex flex-col gap-1 mb-2 max-h-56 overflow-y-auto">
          {items.map((it, i) => {
            const def = POOL_BY_ID[it.card_id];
            return (
              <div
                key={`${it.card_id}-${it.foil}-${i}`}
                className="flex items-center justify-between text-[10px] font-bold bg-[var(--c-paper)] ink-border-sm px-2 py-1"
              >
                <span>
                  {def?.name || it.card_id}
                  {it.foil ? ' ✦' : ''} ×{it.quantity}
                </span>
                <button
                  onClick={() => onChange(items.filter((_, idx) => idx !== i))}
                  aria-label={`Remove ${def?.name || it.card_id} from selection`}
                  className="w-10 h-10 -my-2 -mr-2 flex items-center justify-center text-[var(--c-red)]"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Single-select card search — used to name an exact card in an advanced
 * mystery-pack slot. Searches the full catalog, not just owned copies,
 * since a template can be defined before the pool that fills it. */
function CardSearchPick({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const [search, setSearch] = useState('');
  const matches = useMemo(() => {
    if (!search) return [];
    const q = search.toLowerCase();
    return POOL_V4.filter((c) => c.type !== 'Leader' && c.name.toLowerCase().includes(q)).slice(
      0,
      8,
    );
  }, [search]);
  const current = value ? POOL_BY_ID[value] : null;
  return (
    <div className="flex-1 min-w-[160px]">
      <input
        className="w-full px-2 py-1 ink-border-sm text-xs font-bold"
        aria-label="Search for an exact card"
        placeholder={current ? current.name : 'Search a card…'}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      {matches.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {matches.map((c) => (
            <button
              key={c.id}
              onClick={() => {
                onChange(c.id);
                setSearch('');
              }}
              className={cn(
                'text-[9px] font-black px-1.5 py-0.5 min-h-10 ink-border-sm',
                RARITY_CHIP[c.rarity || 'Common'],
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Directory tab — Featured / Trending / New / Top Rated
// ---------------------------------------------------------------------------
function DirectoryTab({ onView }: { onView: (owner: string) => void }) {
  const [sort, setSort] = useState<'featured' | 'trending' | 'new' | 'top_rated'>('featured');
  const [shops, setShops] = useState<BrowseShopEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    browseShops(sort, 40)
      .then((s) => {
        if (!cancelled) setShops(s);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load shops. Check your connection and try again.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sort, attempt]);

  // Shops opening/closing and listings appearing or selling out both change
  // this directory. Coalesce the two streams into one refetch tick so a burst
  // of row events (a seller listing five cards in a row) triggers one reload.
  useEffect(() => {
    let timer: number | undefined;
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setAttempt((n) => n + 1), 600);
    };
    const offShops = subscribeTable('player_shops', bump);
    const offListings = subscribeTable('shop_listings', bump);
    return () => {
      window.clearTimeout(timer);
      offShops();
      offListings();
    };
  }, []);

  const tabs: { key: typeof sort; label: string; icon: React.ReactNode }[] = [
    { key: 'featured', label: 'FEATURED', icon: <Sparkles className="w-3.5 h-3.5" /> },
    { key: 'trending', label: 'TRENDING', icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { key: 'new', label: 'NEW', icon: <Clock className="w-3.5 h-3.5" /> },
    { key: 'top_rated', label: 'TOP RATED', icon: <Star className="w-3.5 h-3.5" /> },
  ];

  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-4">
        {tabs.map((t) => (
          <PopButton
            key={t.key}
            color={sort === t.key ? 'black' : 'yellow'}
            onClick={() => setSort(t.key)}
          >
            <span className="flex items-center gap-1">
              {t.icon} {t.label}
            </span>
          </PopButton>
        ))}
      </div>
      {loading ? (
        <div className="text-center font-bold text-[var(--c-steel)] py-16 animate-pulse">
          LOADING SHOPS…
        </div>
      ) : error ? (
        <div className="text-center py-16">
          <p className="font-bold text-[var(--c-steel)] mb-3">{error}</p>
          <PopButton color="red" onClick={() => setAttempt((n) => n + 1)}>
            RETRY
          </PopButton>
        </div>
      ) : shops.length === 0 ? (
        <div className="text-center font-bold text-[var(--c-steel)] py-16">
          No shops yet — be the first to open one under MY SHOP.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {shops.map((s) => (
            <button
              key={s.owner}
              onClick={() => onView(s.owner)}
              className="ink-border-md shadow-hard-black-sm text-left overflow-hidden hover:-translate-y-0.5 transition-transform"
              style={{ background: accentCardWash(s.accent) }}
            >
              <div
                className="h-16 relative flex items-end"
                style={{ background: accentWash(s.accent) }}
              >
                {s.banner_url && (
                  <div className="absolute inset-0 opacity-45">
                    <SafeImage src={s.banner_url} alt="" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="relative flex items-end gap-2 p-2 w-full">
                  <div
                    className="w-11 h-11 shrink-0 ink-border-sm flex items-center justify-center heading-font text-sm translate-y-3"
                    style={{ backgroundColor: accentCss(s.accent), color: 'var(--c-ink)' }}
                  >
                    {shopMonogram(s.name)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="heading-font text-sm text-[var(--c-paper)] truncate drop-shadow">
                      {s.name}
                    </div>
                    <div className="text-[9px] font-bold text-[var(--c-paper)]/75 truncate">
                      by {s.owner_username || '…'}
                    </div>
                  </div>
                  <RatingBadge shop={s} />
                </div>
              </div>
              <div className="p-3 pt-4">
                {s.tagline && (
                  <div className="text-[11px] font-bold italic text-[var(--c-ink)]/80 mb-1.5 line-clamp-2">
                    “{s.tagline}”
                  </div>
                )}
                <div className="flex items-center gap-1.5 flex-wrap text-[9px] font-black">
                  <span className="bg-[var(--c-ink)] text-[var(--c-paper)] px-1.5 py-0.5 ink-border-sm">
                    {s.active_listings ?? 0} LISTING{(s.active_listings ?? 0) === 1 ? '' : 'S'}
                  </span>
                  {(s.mystery_listings ?? 0) > 0 && (
                    <span className="bg-[var(--c-red)] text-[var(--c-paper)] px-1.5 py-0.5 ink-border-sm inline-flex items-center gap-1">
                      <Package className="w-3 h-3" /> {s.mystery_listings} MYSTERY
                    </span>
                  )}
                  {s.top_rarity_tier != null && s.top_rarity_tier > 0 && (
                    <RarityPill
                      rarity={
                        RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, s.top_rarity_tier - 1)]
                      }
                      title="Highest rarity currently in stock"
                    >
                      {RARITY_ORDER[Math.min(RARITY_ORDER.length - 1, s.top_rarity_tier - 1)]} IN
                      STOCK
                    </RarityPill>
                  )}
                  {s.cheapest_price != null && (
                    <span className="bg-[var(--c-yellow)] text-[var(--c-ink)] px-1.5 py-0.5 ink-border-sm inline-flex items-center gap-1">
                      FROM <Credits amount={s.cheapest_price} />
                    </span>
                  )}
                </div>
                <div className="text-[9px] font-bold text-[var(--c-steel)] mt-1.5">
                  {s.sales_count ?? 0} sale{(s.sales_count ?? 0) === 1 ? '' : 's'} ·{' '}
                  {shopAge(s.created_at)}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Report modal
// ---------------------------------------------------------------------------
function ReportModal({
  listingId,
  onClose,
  onDone,
}: {
  listingId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState<'mismatch' | 'not_as_described' | 'other'>(
    'not_as_described',
  );
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-[var(--c-ink)]/90 z-50 flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Report listing"
    >
      <div
        className="bg-[var(--c-paper)] ink-border-md shadow-hard-yellow p-4 w-80 max-w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="heading-font text-sm mb-2">REPORT LISTING</div>
        {error && (
          <div className="mb-2">
            <Notice text={error} />
          </div>
        )}
        <select
          aria-label="Report reason"
          className="w-full px-2 py-1.5 bg-[var(--c-paper)] ink-border-sm font-bold text-xs mb-2"
          value={reason}
          onChange={(e) => setReason(e.target.value as typeof reason)}
        >
          <option value="not_as_described">Not as described</option>
          <option value="mismatch">Contents don't match listing</option>
          <option value="other">Other</option>
        </select>
        <textarea
          aria-label="Additional details"
          className="w-full px-2 py-1.5 ink-border-sm text-xs font-bold mb-3"
          rows={3}
          placeholder="Optional details…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <div className="flex gap-2 justify-end">
          <PopButton color="steel" onClick={onClose}>
            CANCEL
          </PopButton>
          <PopButton
            color="red"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                const err = await reportListing(listingId, reason, note || undefined);
                if (err) setError(err);
                else onDone();
              } catch {
                setError('Something went wrong — check your connection and try again.');
              } finally {
                setBusy(false);
              }
            }}
          >
            SUBMIT REPORT
          </PopButton>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mystery pack card in the storefront grid
// ---------------------------------------------------------------------------
function MysteryListingCard({
  listing,
  isOwn,
  shopActive,
  onBuy,
  onReport,
  onViewPool,
  busy,
  credits,
}: {
  key?: React.Key;
  listing: ShopListing;
  isOwn: boolean;
  shopActive: boolean;
  onBuy: () => void;
  onReport: () => void;
  onViewPool: () => void;
  busy: boolean;
  credits: number;
}) {
  const [live, setLive] = useState<MysteryLiveStats | null>(null);
  useEffect(() => {
    if (listing.status !== 'active') {
      // Without this, a listing that just sold out keeps showing its last
      // fetched non-zero "N packs left" alongside the fresh SOLD OUT badge —
      // the ?? below would keep preferring the stale live figure forever.
      setLive(null);
      return;
    }
    let cancelled = false;
    const refetch = () => {
      fetchMysteryLiveStats(listing.id)
        .then((s) => {
          if (!cancelled) setLive(s);
        })
        .catch(() => {
          // Keep whatever stats we last had — the listing row's own
          // remaining_packs is still shown via the ?? fallback below.
        });
    };
    refetch();
    // Live stock changes under other buyers' feet — poll every 30s while the
    // listing is active so "N packs left" / live EV don't freeze at whatever
    // they were when this card mounted.
    const id = window.setInterval(refetch, 30_000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
    // remaining_packs in the deps: after a purchase the parent reloads the
    // listing row — refetch the live stats then too, or the "N packs left"
    // counter (fetched separately) stays frozen at its pre-purchase value.
  }, [listing.id, listing.status, listing.remaining_packs]);

  const remaining = live?.remaining_packs ?? listing.remaining_packs ?? 0;
  // Live stock (fetched separately) can hit zero moments before the listing
  // row itself transitions to 'sold_out' — gate on both so the BUY button
  // doesn't stay clickable for a pack that's actually empty.
  const soldOut = listing.status !== 'active' || remaining <= 0;

  const sold = (listing.total_packs ?? 0) - remaining;
  const soldPct =
    listing.total_packs && listing.total_packs > 0
      ? Math.round((sold / listing.total_packs) * 100)
      : 0;

  return (
    <div
      className={cn(
        'ink-border-md shadow-hard-black-sm flex flex-col overflow-hidden',
        soldOut && 'opacity-55 grayscale',
      )}
      style={{
        background:
          'linear-gradient(150deg, color-mix(in srgb, var(--c-red) 16%, var(--c-paper)) 0%, var(--c-paper) 55%)',
      }}
    >
      <div className="flex gap-3 p-3">
        <div className="w-20 h-28 shrink-0 bg-[var(--c-ink)] ink-border-sm flex flex-col items-center justify-center text-[var(--c-yellow)] relative overflow-hidden">
          <div className="absolute inset-0 opacity-20 bg-[repeating-linear-gradient(45deg,transparent,transparent_6px,var(--c-yellow)_6px,var(--c-yellow)_8px)]" />
          <Package className="w-8 h-8 relative" />
          <span className="text-[9px] font-black mt-1 relative">{listing.pack_size} CARDS</span>
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="heading-font text-sm">MYSTERY PACK</div>
          <div className="text-[9px] font-bold text-[var(--c-steel)] mt-0.5 inline-flex items-center flex-wrap gap-x-1">
            {remaining} of {listing.total_packs ?? remaining} left
            {live?.live_ev_per_pack != null && (
              <>
                {' '}
                · live EV <Credits amount={live.live_ev_per_pack} />
                /pack
              </>
            )}
          </div>
          {(listing.total_packs ?? 0) > 0 && (
            <div className="mt-1.5 h-2 ink-border-sm bg-[var(--c-ink)]/10 overflow-hidden">
              <div className="h-full bg-[var(--c-red)]" style={{ width: `${soldPct}%` }} />
            </div>
          )}
          <div className="mt-auto pt-2 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 heading-font text-sm bg-[var(--c-yellow)] px-2 py-0.5 ink-border-sm">
              <Coins className="w-3.5 h-3.5" /> {fmtCredits(listing.price)}
            </span>
            {soldOut && (
              <span className="text-[9px] font-black px-1.5 py-0.5 bg-[var(--c-steel)] text-[var(--c-paper)] ink-border-sm">
                {/* soldOut is derived from live stock (remaining <= 0), which
                    can go true a beat before the row reloads off 'active' —
                    so a still-'active' status here means "sold out, not yet
                    reloaded", never a live listing. Only a genuinely terminal
                    status (closed/cancelled) overrides the SOLD OUT label. */}
                {listing.status && listing.status !== 'active'
                  ? // 'sold_out' is a raw status value — print it as words,
                    // same treatment StoreScreen gives pack_tier.
                    listing.status.replace(/_/g, ' ').toUpperCase()
                  : 'SOLD OUT'}
              </span>
            )}
          </div>
        </div>
      </div>
      <div className="flex gap-2 items-center px-3 pb-3 flex-wrap">
        {/* Available on every mystery listing, sold out or not, and to the
            seller too — the pool is the listing's real description. */}
        <PopButton color="steel" onClick={onViewPool}>
          <span className="flex items-center gap-1">
            <Eye className="w-3.5 h-3.5" /> VIEW FULL POOL
          </span>
        </PopButton>
        {!isOwn && !soldOut && shopActive && (
          <>
            <PopButton color="red" disabled={busy || credits < listing.price} onClick={onBuy}>
              BUY PACK ▸
            </PopButton>
            <button
              onClick={onReport}
              aria-label="Report listing"
              title="Report listing"
              className="w-10 h-10 -m-2 flex items-center justify-center text-[var(--c-steel)] hover:text-[var(--c-red)]"
            >
              <Flag className="w-3.5 h-3.5" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Storefront view — a single seller's public shop
// ---------------------------------------------------------------------------
function StorefrontView({ owner, onBack }: { owner: string; onBack: () => void }) {
  const { session, profile, refreshProfile, refreshCollection } = useMeta();
  const userId = session?.user?.id;
  const [shop, setShop] = useState<ShopPublic | null>(null);
  const [seller, setSeller] = useState<PublicProfile | null>(null);
  const [listings, setListings] = useState<ShopListing[]>([]);
  const [filter, setFilter] = useState<'all' | 'individual' | 'bundle' | 'mystery'>('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [reportTarget, setReportTarget] = useState<string | null>(null);
  const [poolTarget, setPoolTarget] = useState<string | null>(null);

  const [loadError, setLoadError] = useState('');
  // `isCancelled` guards a fast owner-to-owner navigation (or unmount) from
  // letting a stale fetch for the PREVIOUS shop overwrite this one's fresh
  // state — same pattern as the other reload()s in this file.
  // Generation counter: the subscription below fires reload() bare while a
  // previous reload may still be awaiting — without this, the older reload's
  // commit can land after (and overwrite) the newer one's.
  const reloadGen = useRef(0);
  const reload = useCallback(
    async (isCancelled?: () => boolean) => {
      const gen = ++reloadGen.current;
      const stale = () => isCancelled?.() || gen !== reloadGen.current;
      setLoadError('');
      try {
        const [s, ls, sellers] = await Promise.all([
          fetchShopPublic(owner),
          fetchShopListings(owner),
          fetchPublicProfiles([owner]),
        ]);
        if (stale()) return;
        setShop(s);
        setListings(ls.filter((l) => l.status === 'active' || l.status === 'sold_out'));
        setSeller(sellers[0] || null);
      } catch {
        if (!stale()) setLoadError("Couldn't load this shop. Check your connection and try again.");
      } finally {
        if (!stale()) setLoading(false);
      }
    },
    [owner],
  );

  useEffect(() => {
    let cancelled = false;
    reload(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // Stock on a storefront moves while you are looking at it — another buyer
  // takes the last pack, the seller adds a listing, the shop closes. Follow
  // this owner's rows rather than making the page a snapshot.
  useEffect(() => {
    let timer: number | undefined;
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => reload(), 400);
    };
    const offListings = subscribeTable('shop_listings', bump, { filter: `owner=eq.${owner}` });
    const offShop = subscribeTable('player_shops', bump, { filter: `owner=eq.${owner}` });
    return () => {
      window.clearTimeout(timer);
      offListings();
      offShop();
    };
  }, [owner, reload]);

  const run = async (fn: () => Promise<string | null>, success?: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const err = await fn();
      if (err) setError(err);
      else {
        if (success) setNotice(success);
        refreshProfile();
        refreshCollection();
        // Awaited (not fire-and-forget) so `busy` — and every button gated
        // on it — stays disabled until the refetch actually lands; releasing
        // it immediately let a second action fire while this reload was
        // still in flight, and an out-of-order response could overwrite the
        // second action's fresher state.
        await reload();
      }
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const visible = listings.filter((l) => filter === 'all' || l.listing_type === filter);
  const isOwn = owner === userId;

  function renderListing(l: ShopListing): React.ReactElement {
    if (l.listing_type === 'mystery') {
      return (
        <MysteryListingCard
          key={l.id}
          listing={l}
          isOwn={isOwn}
          shopActive={shop?.status === 'active'}
          busy={busy}
          credits={profile?.credits || 0}
          onBuy={() => {
            if (!confirm(`Buy this mystery pack for ${fmtCredits(l.price)}? Contents are random.`))
              return;
            // The RPC returns the actual draw — surface it instead of the
            // old generic "check your Collection" (the pulled cards were
            // fetched and then thrown away, so buyers had to diff their
            // collection by hand to learn what they got).
            run(async () => {
              const { data, error: e } = await buyMysteryPack(l.id);
              if (!e) {
                const names = (data?.cards ?? [])
                  .map((c) => `${defFor(c.card_id).name}${c.foil ? ' ✦' : ''}`)
                  .join(', ');
                setNotice(
                  names
                    ? `Pack opened! You pulled: ${names}`
                    : 'Pack opened! Check your Collection.',
                );
              }
              return e;
            });
          }}
          onReport={() => setReportTarget(l.id)}
          onViewPool={() => setPoolTarget(l.id)}
        />
      );
    }
    const cards = l.cards ?? [];
    const headline = defFor(cards[0]?.card_id || '');
    // The listing's frame takes the highest rarity it contains, so a bundle
    // hiding an Ultra-Rare doesn't read like a stack of Commons.
    const topRarity = cards.reduce(
      (best, c) => {
        const r = defFor(c.card_id).rarity || 'Common';
        return rarityTier(r) > rarityTier(best) ? r : best;
      },
      cards.length ? defFor(cards[0].card_id).rarity || 'Common' : 'Common',
    );
    const totalCards = cards.reduce((s, c) => s + c.quantity, 0);
    const accent = RARITY_HEX[topRarity] || RARITY_HEX.Common;
    const discount =
      l.reference_price > 0 ? Math.round((1 - l.price / l.reference_price) * 100) : null;

    return (
      <div
        key={l.id}
        className={cn(
          'ink-border-md shadow-hard-black-sm p-3 flex gap-3',
          l.status !== 'active' && 'opacity-55 grayscale',
        )}
        style={{
          borderLeft: `6px solid ${accent}`,
          background: `linear-gradient(150deg, color-mix(in srgb, ${accent} 14%, var(--c-paper)) 0%, var(--c-paper) 55%)`,
        }}
      >
        <div className="shrink-0 flex flex-col gap-1 items-center">
          <CardFace def={headline} size="compact" foil={cards[0]?.foil} />
          {cards.length > 1 && (
            <span className="text-[9px] font-black text-center bg-[var(--c-ink)] text-[var(--c-paper)] px-1.5 py-0.5 ink-border-sm">
              +{cards.length - 1} MORE
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-start gap-1.5 flex-wrap">
            <div className="heading-font text-sm leading-tight">
              {/* Individual listings must surface foil + quantity too — a
                  "Card ×3 (foil)" listing previously showed just the bare card
                  name, so buyers couldn't tell what they were actually buying
                  without cross-checking the tiny card art. */}
              {l.listing_type === 'bundle'
                ? `BUNDLE · ${totalCards} CARDS`
                : `${headline.name}${cards[0]?.foil ? ' ✦' : ''}${
                    (cards[0]?.quantity ?? 1) > 1 ? ` ×${cards[0].quantity}` : ''
                  }`}
            </div>
            <RarityPill rarity={topRarity}>{topRarity}</RarityPill>
          </div>
          {l.listing_type === 'bundle' && (
            <div className="text-[9px] font-bold text-[var(--c-steel)] mt-1 flex flex-wrap gap-1">
              {cards.map((c, i) => (
                <span
                  key={i}
                  className="ink-border-sm px-1 py-0.5 bg-[var(--c-paper)]"
                  style={{
                    borderLeft: `3px solid ${
                      RARITY_HEX[defFor(c.card_id).rarity || 'Common'] || RARITY_HEX.Common
                    }`,
                  }}
                >
                  {defFor(c.card_id).name}
                  {c.foil ? ' ✦' : ''} ×{c.quantity}
                </span>
              ))}
            </div>
          )}
          <div className="mt-auto pt-2 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 heading-font text-sm bg-[var(--c-yellow)] px-2 py-0.5 ink-border-sm">
              <Coins className="w-3.5 h-3.5" /> {fmtCredits(l.price)}
            </span>
            {/* The blended reference is what the server itself priced the
                contents at — showing the gap turns a bare number into a deal
                a buyer can judge. */}
            {discount != null && discount >= 5 && (
              <span className="text-[9px] font-black px-1.5 py-0.5 bg-[#22C55E] text-[#052E12] ink-border-sm">
                {discount}% UNDER REFERENCE
              </span>
            )}
            {discount != null && discount <= -25 && (
              <span className="text-[9px] font-black px-1.5 py-0.5 bg-[var(--c-red)] text-[var(--c-paper)] ink-border-sm">
                {-discount}% OVER REFERENCE
              </span>
            )}
            {l.status !== 'active' && (
              <span className="text-[9px] font-black px-1.5 py-0.5 bg-[var(--c-steel)] text-[var(--c-paper)] ink-border-sm">
                {(l.status || 'UNAVAILABLE').replace(/_/g, ' ').toUpperCase()}
              </span>
            )}
          </div>
          {!isOwn && l.status === 'active' && shop?.status === 'active' && (
            <div className="flex gap-2 mt-2">
              <PopButton
                color="red"
                disabled={busy || (profile?.credits || 0) < l.price}
                onClick={() => {
                  if (!confirm(`Buy this listing for ${fmtCredits(l.price)} credits?`)) return;
                  run(async () => {
                    const e = await buyShopListing(l.id);
                    return e;
                  }, 'Purchase complete!');
                }}
              >
                BUY ▸
              </PopButton>
              <button
                onClick={() => setReportTarget(l.id)}
                aria-label="Report listing"
                title="Report listing"
                className="w-10 h-10 -m-2 flex items-center justify-center text-[var(--c-steel)] hover:text-[var(--c-red)]"
              >
                <Flag className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <PopButton color="steel" onClick={onBack} className="mb-3">
        &lt; BACK TO DIRECTORY
      </PopButton>
      {loading ? (
        <div className="text-center font-bold text-[var(--c-steel)] py-16 animate-pulse">
          LOADING SHOP…
        </div>
      ) : loadError || !shop ? (
        <div className="text-center py-16">
          <p className="font-bold text-[var(--c-steel)] mb-3">
            {loadError || "This shop couldn't be found."}
          </p>
          <PopButton color="red" onClick={() => reload()}>
            RETRY
          </PopButton>
        </div>
      ) : (
        <>
          <div
            className="text-[var(--c-paper)] ink-border-md shadow-hard-black-sm mb-4 overflow-hidden relative"
            style={{ background: accentWash(shop.accent) }}
          >
            {shop.banner_url && (
              <div className="absolute inset-0 opacity-40">
                <SafeImage src={shop.banner_url} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <div className="relative p-4 flex items-start gap-3 flex-wrap">
              <div
                className="w-16 h-16 shrink-0 ink-border-md shadow-hard-black-xs flex items-center justify-center heading-font text-xl"
                style={{ backgroundColor: accentCss(shop.accent), color: 'var(--c-ink)' }}
              >
                {shopMonogram(shop.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="heading-font text-xl sm:text-2xl leading-tight drop-shadow">
                  {shop.name}
                </div>
                {shop.tagline && (
                  <div className="text-[12px] font-bold italic text-[var(--c-paper)]/85 mt-0.5">
                    “{shop.tagline}”
                  </div>
                )}
                <div className="text-[10px] font-bold text-[var(--c-paper)]/75 mt-1">
                  Sold by{' '}
                  {seller ? (
                    <PlayerLink
                      id={owner}
                      name={seller.username}
                      role={seller.role}
                      className="text-[var(--c-paper)]"
                    />
                  ) : (
                    '…'
                  )}{' '}
                  · {shopAge(shop.created_at)}
                </div>
              </div>
              <RatingBadge shop={shop} />
            </div>
            <div className="relative px-4 pb-3 flex flex-wrap gap-1.5 text-[9px] font-black">
              <span className="bg-[var(--c-paper)] text-[var(--c-ink)] px-1.5 py-0.5 ink-border-sm">
                {shop.sales_count ?? 0} SALE{(shop.sales_count ?? 0) === 1 ? '' : 'S'}
              </span>
              {(shop.repeat_buyers ?? 0) > 0 && (
                <span className="bg-[var(--c-paper)] text-[var(--c-ink)] px-1.5 py-0.5 ink-border-sm inline-flex items-center gap-1">
                  <Repeat className="w-3 h-3" /> {shop.repeat_buyers} REPEAT BUYER
                  {shop.repeat_buyers === 1 ? '' : 'S'}
                </span>
              )}
              {(['individual', 'bundle', 'mystery'] as const).map((t) =>
                (shop.stock?.[t] ?? 0) > 0 ? (
                  <span
                    key={t}
                    className="bg-[var(--c-paper)] text-[var(--c-ink)] px-1.5 py-0.5 ink-border-sm"
                  >
                    {shop.stock![t]} {t.toUpperCase()}
                  </span>
                ) : null,
              )}
            </div>
            {shop.status === 'dormant' && (
              <div className="relative px-4 pb-3">
                <Notice text="This shop is currently closed." kind="error" />
              </div>
            )}
          </div>

          {error && (
            <div className="mb-3">
              <Notice text={error} />
            </div>
          )}
          {notice && (
            <div className="mb-3">
              <Notice text={notice} kind="success" />
            </div>
          )}

          <div className="flex gap-2 mb-4 flex-wrap">
            {(['all', 'individual', 'bundle', 'mystery'] as const).map((f) => (
              <PopButton
                key={f}
                color={filter === f ? 'black' : 'yellow'}
                onClick={() => setFilter(f)}
              >
                {f.toUpperCase()}
              </PopButton>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {visible.map(renderListing)}
            {visible.length === 0 && (
              <div className="col-span-full text-center font-bold text-[var(--c-steel)] py-10">
                No listings here yet.
              </div>
            )}
          </div>
        </>
      )}
      {reportTarget && (
        <ReportModal
          listingId={reportTarget}
          onClose={() => setReportTarget(null)}
          onDone={() => {
            setReportTarget(null);
            setNotice('Report submitted.');
          }}
        />
      )}
      {poolTarget && (
        <MysteryPoolModal listingId={poolTarget} onClose={() => setPoolTarget(null)} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// My Shop — setup, slots, listings, mystery builder, purchases/ratings
// ---------------------------------------------------------------------------
function MyShopTab() {
  const { session, profile, dataLoading, collection, decks, refreshProfile, refreshCollection } =
    useMeta();
  // A guest (no session) can still reach this tab's parent nav — fall back
  // to a neutral empty id rather than crashing on session!.user!.id; the
  // fetch* calls below just return empty results for it and the level-gate
  // panel (guarded on `dataLoading` too, so it doesn't flash for a still-
  // loading real profile) renders in its place.
  const userId = session?.user?.id ?? '';
  const [shop, setShop] = useState<PlayerShop | null>(null);
  const [slots, setSlots] = useState<ShopSlot[]>([]);
  const [listings, setListings] = useState<ShopListing[]>([]);
  const [templates, setTemplates] = useState<MysteryTemplate[]>([]);
  const [purchases, setPurchases] = useState<ShopPurchase[]>([]);
  const [myRatings, setMyRatings] = useState<ShopBuyerRating[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [addMode, setAddMode] = useState<'none' | 'individual' | 'bundle' | 'mystery'>('none');

  const [loadError, setLoadError] = useState('');
  // `isCancelled` guards a fast account switch (or unmount) from letting a
  // stale fetch for the PREVIOUS user overwrite this one's fresh shop state
  // — same pattern as the other reload()s in this file.
  // Generation counter: the sales/listings subscription below calls reload()
  // bare while the mount reload (or an earlier event's) may still be in
  // flight; this reload commits in two sequential await batches, so two
  // interleaved runs could otherwise mix old and new state (e.g. a cancelled
  // listing reappearing until the next event).
  const reloadGen = useRef(0);
  const reload = useCallback(
    async (isCancelled?: () => boolean) => {
      const gen = ++reloadGen.current;
      const stale = () => isCancelled?.() || gen !== reloadGen.current;
      setLoadError('');
      // Guests never reach this tab today (MainMenu gates it), but the old
      // comment's claim that an empty id "just returns empty results" was
      // wrong — `.eq('owner', '')` on a uuid column is a PostgREST type
      // error, which would land in the catch below as a misleading
      // "couldn't load" + RETRY loop. Skip the fetches outright instead.
      if (!userId) {
        setLoading(false);
        return;
      }
      try {
        const s = await fetchMyShop(userId);
        if (stale()) return;
        setShop(s);
        if (s) {
          const [sl, li, tp] = await Promise.all([
            fetchShopSlots(userId),
            fetchShopListings(userId),
            fetchMysteryTemplates(userId),
          ]);
          if (stale()) return;
          setSlots(sl);
          setListings(li);
          setTemplates(tp);
        }
        const [pur, rat] = await Promise.all([
          fetchMyShopPurchases(userId),
          fetchMyBuyerRatings(userId),
        ]);
        if (stale()) return;
        setPurchases(pur.filter((p) => p.buyer === userId));
        setMyRatings(rat);
      } catch {
        if (!stale()) setLoadError("Couldn't load your shop. Check your connection and try again.");
      } finally {
        if (!stale()) setLoading(false);
      }
    },
    [userId],
  );

  useEffect(() => {
    let cancelled = false;
    reload(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [reload]);

  // Somebody buying from this shop changes slots, listings and credits without
  // any action on the owner's part — the tab used to only find out on a manual
  // navigation. Watch this owner's sales and listings.
  useEffect(() => {
    if (!userId) return;
    let timer: number | undefined;
    const bump = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        refreshProfile();
        reload();
      }, 400);
    };
    const offSales = subscribeTable('shop_purchases', bump, { filter: `owner=eq.${userId}` });
    const offListings = subscribeTable('shop_listings', bump, { filter: `owner=eq.${userId}` });
    return () => {
      window.clearTimeout(timer);
      offSales();
      offListings();
    };
  }, [userId, reload, refreshProfile]);

  const run = async (
    fn: () => Promise<string | null>,
    success?: string,
    keepAddMode?: boolean,
    onSuccess?: () => void,
  ) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const err = await fn();
      if (err) setError(err);
      else {
        if (success) setNotice(success);
        refreshProfile();
        refreshCollection();
        if (!keepAddMode) setAddMode('none');
        onSuccess?.();
        // Awaited so `busy` stays true (and every gated button disabled)
        // until this reload actually lands — see the matching comment in
        // StorefrontView's run() for why a fire-and-forget reload here let
        // two quick actions race and show stale post-action state.
        await reload();
      }
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  if (loading || dataLoading) {
    return (
      <div className="text-center font-bold text-[var(--c-steel)] py-16 animate-pulse">
        LOADING…
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="text-center py-16">
        <p className="font-bold text-[var(--c-steel)] mb-3">{loadError}</p>
        <PopButton color="red" onClick={() => reload()}>
          RETRY
        </PopButton>
      </div>
    );
  }

  if (!shop) {
    if (!profile || profile.level < SHOP_UNLOCK_LEVEL) {
      return (
        <div className="text-center py-16">
          <Lock className="w-10 h-10 mx-auto mb-3 text-[var(--c-steel)]" />
          <div className="heading-font text-lg">
            PLAYER SHOPS UNLOCK AT LEVEL {SHOP_UNLOCK_LEVEL}
          </div>
          <div className="text-[11px] font-bold text-[var(--c-steel)] mt-2">
            You're level {profile?.level ?? 1}. Keep playing to unlock your own storefront.
          </div>
        </div>
      );
    }
    return (
      <OpenShopPanel
        busy={busy}
        error={error}
        credits={profile?.credits ?? 0}
        onOpen={(name, banner, tagline, accent) =>
          run(() => openShop(name, banner, tagline, accent))
        }
      />
    );
  }

  if (shop.status === 'dormant') {
    return (
      <div className="max-w-md">
        {error && (
          <div className="mb-3">
            <Notice text={error} />
          </div>
        )}
        {/* The close-shop refund message lands HERE — closing flips the shop
         * to dormant before the notice renders, so without this block the
         * "N credits refunded" the player was promised never appeared. */}
        {notice && (
          <div className="mb-3">
            <Notice text={notice} kind="success" />
          </div>
        )}
        <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-4">
          <div className="heading-font text-sm mb-2">{shop.name}</div>
          <div className="text-[11px] font-bold text-[var(--c-steel)] mb-3">
            Your shop is closed. Slots and any remaining collateral are still in place — reopening
            is free.
          </div>
          <PopButton
            color="red"
            disabled={busy}
            onClick={() => run(() => reopenShop(), 'Shop reopened!', true)}
          >
            REOPEN SHOP
          </PopButton>
        </div>
      </div>
    );
  }

  const emptySlots = slots.filter((s) => s.status === 'empty');
  const nextSlotCost = shopSlotCost(shop.slots_purchased + 1);
  const totalSlots = SHOP_BASE_SLOTS + shop.slots_purchased;
  const atMaxSlots = totalSlots >= SHOP_MAX_SLOTS;

  return (
    <div>
      {error && (
        <div className="mb-3">
          <Notice text={error} />
        </div>
      )}
      {notice && (
        <div className="mb-3">
          <Notice text={notice} kind="success" />
        </div>
      )}

      <div
        className="text-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-4 mb-4 flex items-center justify-between flex-wrap gap-2 relative overflow-hidden"
        style={{ background: accentWash(shop.accent) }}
      >
        {shop.banner_url && (
          <div className="absolute inset-0 opacity-35">
            <SafeImage src={shop.banner_url} alt="" className="w-full h-full object-cover" />
          </div>
        )}
        <div className="relative">
          <div className="heading-font text-lg sm:text-xl">{shop.name}</div>
          {shop.tagline && (
            <div className="text-[11px] font-bold italic text-[var(--c-paper)]/85">
              “{shop.tagline}”
            </div>
          )}
          <div className="text-[10px] font-bold text-[var(--c-paper)]/70 mt-1">
            {shopAge(shop.created_at)} · {slots.filter((s) => s.status === 'occupied').length}/
            {slots.length} slots filled
          </div>
        </div>
        <PopButton
          color="steel"
          className="relative"
          disabled={busy}
          onClick={() => {
            if (
              confirm(
                'Close your shop? Half of each slot’s remaining collateral is refunded and the rest is burned — closing again later returns nothing.',
              )
            )
              run(
                async () => {
                  const { data, error } = await closeShop();
                  if (error) return error;
                  // Say how much actually came back — after a warning about
                  // half the collateral burning, "Shop closed." alone left the
                  // player guessing at the refund.
                  setNotice(`Shop closed — ${fmtCredits(data?.refunded ?? 0)} credits refunded.`);
                  return null;
                },
                undefined,
                true,
              );
          }}
        >
          CLOSE SHOP
        </PopButton>
      </div>

      <ShopCustomizePanel
        shop={shop}
        busy={busy}
        onSave={(name, banner, tagline, accent) =>
          run(() => updateShop(name, banner, tagline, accent), 'Storefront updated!', true)
        }
      />

      <div className="heading-font text-xs mb-2">SLOTS</div>
      <div className="flex flex-wrap gap-2 mb-3">
        {slots.map((s) => (
          <div
            key={s.id}
            className={cn(
              'w-16 h-16 ink-border-sm flex flex-col items-center justify-center text-[9px] font-black',
              s.status === 'occupied' && 'bg-[var(--c-yellow)] text-[var(--c-ink)]',
              s.status === 'empty' && 'bg-[var(--c-paper)] text-[var(--c-steel)]',
              s.status === 'burned' && 'bg-[var(--c-red)] text-[var(--c-paper)] opacity-60',
            )}
          >
            <span>#{s.slot_index}</span>
            <span>{(s.status || 'EMPTY').toUpperCase()}</span>
            {s.collateral > 0 && <Credits amount={s.collateral} />}
          </div>
        ))}
      </div>
      <PopButton
        color="yellow"
        disabled={busy || atMaxSlots || (profile?.credits || 0) < nextSlotCost}
        title={atMaxSlots ? `Shops cap out at ${SHOP_MAX_SLOTS} slots` : undefined}
        onClick={() => run(() => buyShopSlot().then((r) => r.error), 'Slot purchased!', true)}
      >
        {atMaxSlots ? (
          `MAX SLOTS (${SHOP_MAX_SLOTS})`
        ) : (
          <span className="inline-flex items-center gap-0.5">
            + BUY SLOT (<Credits amount={nextSlotCost} /> collateral)
          </span>
        )}
      </PopButton>

      <div className="heading-font text-xs mt-6 mb-2">LISTINGS</div>
      <div className="flex gap-2 mb-3 flex-wrap">
        <PopButton
          color={addMode === 'individual' ? 'black' : 'yellow'}
          disabled={emptySlots.length === 0}
          onClick={() => setAddMode(addMode === 'individual' ? 'none' : 'individual')}
        >
          <span className="flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> INDIVIDUAL
          </span>
        </PopButton>
        <PopButton
          color={addMode === 'bundle' ? 'black' : 'yellow'}
          disabled={emptySlots.length === 0}
          onClick={() => setAddMode(addMode === 'bundle' ? 'none' : 'bundle')}
        >
          <span className="flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> BUNDLE
          </span>
        </PopButton>
        <PopButton
          // Unlike INDIVIDUAL/BUNDLE, this panel also lets you define a pack
          // type ("CREATE PACK TYPE") with no slot needed at all — only
          // actually submitting a pool for sale needs one, and that path is
          // already gated on its own (SUBMIT POOL & LIST requires slotId).
          color={addMode === 'mystery' ? 'black' : 'yellow'}
          onClick={() => setAddMode(addMode === 'mystery' ? 'none' : 'mystery')}
        >
          <span className="flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> MYSTERY PACK
          </span>
        </PopButton>
        {emptySlots.length === 0 && (
          <span className="text-[10px] font-bold text-[var(--c-steel)] self-center">
            No empty slots — buy one above first.
          </span>
        )}
      </div>

      {(addMode === 'individual' || addMode === 'bundle') && (
        <NewCardListingForm
          type={addMode}
          collection={collection}
          decks={decks}
          emptySlots={emptySlots}
          busy={busy}
          onSubmit={(slotId, items, price) =>
            run(() => createShopListing(slotId, addMode, items, price), 'Listing created!')
          }
        />
      )}
      {addMode === 'mystery' && (
        <MysteryBuilderPanel
          collection={collection}
          decks={decks}
          templates={templates}
          emptySlots={emptySlots}
          busy={busy}
          onCreateTemplate={(name, size, mode, config, onSuccess) =>
            run(
              () => createMysteryTemplate(name, size, mode, config).then((r) => r.error),
              'Pack type created! Now submit a pool for it below.',
              true,
              onSuccess,
            )
          }
          onSubmitPool={(templateId, slotId, pool, price) => {
            if (
              !confirm(
                'Submit this pool and list it for sale? The cards are escrowed immediately and this listing has no cancel button once live.',
              )
            )
              return;
            run(
              () => submitMysteryPool(templateId, slotId, pool, price).then((r) => r.error),
              'Pool submitted!',
            );
          }}
        />
      )}

      <div className="flex flex-col gap-2 mt-4">
        {listings.map((l) => (
          <div
            key={l.id}
            className="bg-[var(--c-paper)] ink-border-sm shadow-hard-black-xs p-2 flex items-center justify-between gap-2 flex-wrap"
          >
            <div className="text-[10px] font-bold inline-flex items-center flex-wrap gap-x-1">
              <span className="heading-font text-xs mr-1">
                {(l.listing_type || 'LISTING').toUpperCase()}
              </span>
              {l.listing_type === 'mystery'
                ? `${l.remaining_packs ?? 0}/${l.total_packs ?? 0} packs left`
                : (l.cards ?? [])
                    .map(
                      (c) =>
                        `${defFor(c.card_id).name}${c.foil ? ' ✦' : ''}${
                          c.quantity > 1 ? ` ×${c.quantity}` : ''
                        }`,
                    )
                    .join(', ')}
              {' · '}
              <Credits amount={l.price} /> ·{' '}
              {(l.status || 'UNKNOWN').replace(/_/g, ' ').toUpperCase()}
            </div>
            {l.status === 'active' &&
              (l.listing_type === 'individual' || l.listing_type === 'bundle') && (
                <PopButton
                  color="steel"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm('Cancel this listing? Your cards will be returned.')) return;
                    run(() => cancelShopListing(l.id), undefined, true);
                  }}
                >
                  CANCEL
                </PopButton>
              )}
          </div>
        ))}
        {listings.length === 0 && (
          <div className="text-center font-bold text-[var(--c-steel)] py-6 text-xs">
            No listings yet.
          </div>
        )}
      </div>

      <div className="heading-font text-xs mt-6 mb-2">MY PURCHASES</div>
      <div className="flex flex-col gap-2">
        {purchases.map((p) => {
          const withinWindow = withinRatingWindow(p.created_at);
          const existing = myRatings.find((r) => r.purchase_id === p.id);
          return (
            <div
              key={p.id}
              className="bg-[var(--c-paper)] ink-border-sm shadow-hard-black-xs p-2 flex items-center justify-between gap-2 flex-wrap"
            >
              <div className="text-[10px] font-bold inline-flex items-center flex-wrap gap-x-1">
                {p.listing_type === 'mystery'
                  ? 'Mystery pack'
                  : (p.cards ?? [])
                      .map(
                        (c) =>
                          `${defFor(c.card_id).name}${c.foil ? ' ✦' : ''}${
                            c.quantity > 1 ? ` ×${c.quantity}` : ''
                          }`,
                      )
                      .join(', ')}
                {' · '}
                <Credits amount={p.price} />
              </div>
              {withinWindow ? (
                <div className="flex items-center gap-1">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      disabled={busy}
                      onClick={() => run(() => rateShopPurchase(p.id, n), undefined, true)}
                      aria-label={`Rate ${n} star${n === 1 ? '' : 's'}`}
                      className={cn(
                        // 40px hit area around a 16px glyph; negative margin
                        // keeps the row's visual height unchanged.
                        'w-10 h-10 -my-2 flex items-center justify-center',
                        existing && existing.rating >= n
                          ? 'text-[var(--c-yellow)]'
                          : 'text-[var(--c-steel)]',
                      )}
                    >
                      <Star
                        className={cn(
                          'w-4 h-4',
                          existing && existing.rating >= n && 'fill-current',
                        )}
                      />
                    </button>
                  ))}
                </div>
              ) : existing ? (
                <span className="text-[9px] font-bold text-[var(--c-steel)]">
                  Rated {existing.rating}/5
                </span>
              ) : (
                <span className="text-[9px] font-bold text-[var(--c-steel)]">
                  Rating window closed
                </span>
              )}
            </div>
          );
        })}
        {purchases.length === 0 && (
          <div className="text-center font-bold text-[var(--c-steel)] py-6 text-xs">
            Nothing bought from a player shop yet.
          </div>
        )}
      </div>
    </div>
  );
}

function AccentPicker({
  value,
  onChange,
}: {
  value: ShopAccent;
  onChange: (a: ShopAccent) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 mb-3">
      {SHOP_ACCENTS.map((a) => (
        <button
          key={a}
          type="button"
          onClick={() => onChange(a)}
          title={SHOP_ACCENT_LABEL[a]}
          aria-label={`Accent: ${SHOP_ACCENT_LABEL[a]}`}
          aria-pressed={value === a}
          className={cn(
            'w-7 h-7 ink-border-sm btn-pop',
            value === a && 'outline outline-2 outline-offset-1 outline-[var(--c-ink)]',
          )}
          style={{ backgroundColor: accentCss(a) }}
        />
      ))}
    </div>
  );
}

/** Live preview of the storefront header the shopper will see. */
function ShopHeaderPreview({
  name,
  tagline,
  accent,
  banner,
}: {
  name: string;
  tagline: string;
  accent: ShopAccent;
  banner: string;
}) {
  const display = name.trim() || 'YOUR SHOP';
  return (
    <div
      className="ink-border-sm overflow-hidden relative mb-3 text-[var(--c-paper)]"
      style={{ background: accentWash(accent) }}
    >
      {banner && (
        <div className="absolute inset-0 opacity-40">
          <SafeImage src={banner} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="relative p-2.5 flex items-center gap-2">
        <div
          className="w-10 h-10 shrink-0 ink-border-sm flex items-center justify-center heading-font text-sm"
          style={{ backgroundColor: accentCss(accent), color: 'var(--c-ink)' }}
        >
          {shopMonogram(display)}
        </div>
        <div className="min-w-0">
          <div className="heading-font text-sm truncate">{display}</div>
          <div className="text-[10px] font-bold italic text-[var(--c-paper)]/80 truncate">
            {tagline.trim() ? `“${tagline}”` : 'Add a tagline to introduce your shop.'}
          </div>
        </div>
      </div>
    </div>
  );
}

function ShopCustomizePanel({
  shop,
  busy,
  onSave,
}: {
  shop: PlayerShop;
  busy: boolean;
  onSave: (name: string, banner: string | null, tagline: string | null, accent: ShopAccent) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(shop.name);
  const [tagline, setTagline] = useState(shop.tagline || '');
  const [banner, setBanner] = useState(shop.banner_url || '');
  const [accent, setAccent] = useState<ShopAccent>(shop.accent || 'yellow');

  return (
    <div className="mb-4">
      <PopButton color={open ? 'black' : 'yellow'} onClick={() => setOpen((v) => !v)}>
        <span className="flex items-center gap-1">
          <Palette className="w-3.5 h-3.5" /> {open ? 'HIDE' : 'CUSTOMIZE STOREFRONT'}
        </span>
      </PopButton>
      {open && (
        <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3 mt-2 max-w-xl">
          <ShopHeaderPreview name={name} tagline={tagline} accent={accent} banner={banner} />
          <label className="block text-xs font-bold mb-1">Shop name</label>
          <input
            className="w-full px-2 py-1.5 ink-border-sm text-xs font-bold mb-3"
            aria-label="Shop name"
            value={name}
            maxLength={40}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="block text-xs font-bold mb-1">
            Tagline{' '}
            <span className="text-[var(--c-steel)] font-normal">({120 - tagline.length} left)</span>
          </label>
          <input
            className="w-full px-2 py-1.5 ink-border-sm text-xs font-bold mb-3"
            placeholder="Cheap staples, fast restocks."
            aria-label="Tagline"
            value={tagline}
            maxLength={120}
            onChange={(e) => setTagline(e.target.value)}
          />
          <label className="block text-xs font-bold mb-1">Banner image URL (optional)</label>
          <input
            className="w-full px-2 py-1.5 ink-border-sm text-xs font-bold mb-3"
            aria-label="Banner image URL"
            value={banner}
            onChange={(e) => setBanner(e.target.value)}
          />
          <label className="block text-xs font-bold mb-1">Accent</label>
          <AccentPicker value={accent} onChange={setAccent} />
          <PopButton
            color="red"
            disabled={busy || !name.trim()}
            onClick={() =>
              onSave(name.trim(), banner.trim() || null, tagline.trim() || null, accent)
            }
          >
            SAVE STOREFRONT
          </PopButton>
        </div>
      )}
    </div>
  );
}

function OpenShopPanel({
  busy,
  error,
  credits,
  onOpen,
}: {
  busy: boolean;
  error: string;
  credits: number;
  onOpen: (name: string, banner: string | null, tagline: string | null, accent: ShopAccent) => void;
}) {
  const [name, setName] = useState('');
  const [banner, setBanner] = useState('');
  const [tagline, setTagline] = useState('');
  const [accent, setAccent] = useState<ShopAccent>('yellow');
  const short = Math.max(0, SHOP_SETUP_FEE - credits);
  return (
    <div className="max-w-md">
      {error && (
        <div className="mb-3">
          <Notice text={error} />
        </div>
      )}
      <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-4">
        <div className="heading-font text-sm mb-2">OPEN YOUR SHOP</div>
        <div className="text-[11px] font-bold text-[var(--c-steel)] mb-3 inline-flex items-center flex-wrap gap-x-1">
          One-time setup fee of <Credits amount={SHOP_SETUP_FEE} /> (non-refundable). You start with{' '}
          {SHOP_BASE_SLOTS} free listing slots — up to {SHOP_MAX_SLOTS} total can be purchased
          later, each backed by its own collateral.
        </div>
        {short > 0 && (
          <div className="text-[11px] font-bold text-[var(--c-red)] mb-3">
            You need <Credits amount={short} /> more to open a shop.
          </div>
        )}
        <ShopHeaderPreview name={name} tagline={tagline} accent={accent} banner={banner} />
        <label className="block text-xs font-bold mb-1">Shop name</label>
        <input
          className="w-full px-2 py-1.5 ink-border-sm text-xs font-bold mb-3"
          aria-label="Shop name"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="block text-xs font-bold mb-1">Tagline (optional)</label>
        <input
          className="w-full px-2 py-1.5 ink-border-sm text-xs font-bold mb-3"
          placeholder="Cheap staples, fast restocks."
          aria-label="Tagline"
          value={tagline}
          maxLength={120}
          onChange={(e) => setTagline(e.target.value)}
        />
        <label className="block text-xs font-bold mb-1">Banner image URL (optional)</label>
        <input
          className="w-full px-2 py-1.5 ink-border-sm text-xs font-bold mb-3"
          aria-label="Banner image URL"
          value={banner}
          onChange={(e) => setBanner(e.target.value)}
        />
        <label className="block text-xs font-bold mb-1">Accent</label>
        <AccentPicker value={accent} onChange={setAccent} />
        <PopButton
          color="red"
          disabled={busy || !name.trim() || short > 0}
          onClick={() => onOpen(name.trim(), banner.trim() || null, tagline.trim() || null, accent)}
        >
          OPEN SHOP ▸
        </PopButton>
      </div>
    </div>
  );
}

function NewCardListingForm({
  type,
  collection,
  decks,
  emptySlots,
  busy,
  onSubmit,
}: {
  type: 'individual' | 'bundle';
  collection: PlayerCard[];
  decks: DeckRow[];
  emptySlots: ShopSlot[];
  busy: boolean;
  onSubmit: (slotId: string, items: ShopListingCardItem[], price: number) => void;
}) {
  const [items, setItems] = useState<ShopListingCardItem[]>([]);
  const [slotId, setSlotId] = useState(emptySlots[0]?.id || '');
  const [price, setPrice] = useState(100);
  const [reference, setReference] = useState(0);

  // The slot list can change while this form is open (e.g. a mystery-pool
  // submission or another tab fills a slot and the realtime reload lands).
  // Without re-syncing, the <select> keeps a stale slotId that is no longer
  // among its options and LIST FOR SALE submits against an occupied slot.
  // Same fallback MysteryBuilderPanel applies to its template/slot selects.
  useEffect(() => {
    if (!slotId || !emptySlots.some((s) => s.id === slotId)) {
      setSlotId(emptySlots[0]?.id || '');
    }
  }, [emptySlots, slotId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      items.map((i) => fetchCardBlendedReference(i.card_id, i.foil).then((v) => v * i.quantity)),
    )
      .then((vals) => {
        if (!cancelled) setReference(vals.reduce((a, b) => a + b, 0));
      })
      .catch(() => {
        if (!cancelled) setReference(0);
      });
    return () => {
      cancelled = true;
    };
  }, [items]);

  const valid =
    slotId &&
    price >= 1 &&
    ((type === 'individual' && items.length === 1) || (type === 'bundle' && items.length >= 2));

  return (
    <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3 mb-4 max-w-xl">
      <div className="heading-font text-xs mb-2">
        {type === 'individual' ? 'NEW INDIVIDUAL LISTING' : 'NEW BUNDLE (2+ cards)'}
      </div>
      <CardStackPicker
        collection={collection}
        decks={decks}
        items={items}
        onChange={setItems}
        maxItems={type === 'individual' ? 1 : undefined}
      />
      {reference > 0 && (
        <div className="text-[9px] font-bold text-[var(--c-steel)] mb-2 inline-flex items-center flex-wrap gap-x-1">
          Blended reference: <Credits amount={reference} /> · typical band{' '}
          <Credits amount={Math.round(reference * 1.1)} />–
          <Credits amount={Math.round(reference * 1.25)} /> (soft cap, not enforced)
        </div>
      )}
      <div className="flex flex-wrap gap-3 items-center">
        <label className="flex items-center gap-2 text-xs font-bold">
          Slot
          <select
            className="px-2 py-1.5 ink-border-sm font-bold text-xs"
            value={slotId}
            onChange={(e) => setSlotId(e.target.value)}
          >
            {emptySlots.map((s) => (
              <option key={s.id} value={s.id}>
                #{s.slot_index}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs font-bold">
          Price
          <input
            type="number"
            min={1}
            value={price}
            onChange={(e) => setPrice(Math.max(1, Math.round(Number(e.target.value) || 0)))}
            className="w-24 px-2 py-1 ink-border-sm"
          />
        </label>
        <PopButton
          color="red"
          disabled={!valid || busy}
          onClick={() => onSubmit(slotId, items, price)}
        >
          LIST FOR SALE ▸
        </PopButton>
      </div>
    </div>
  );
}

/**
 * Live mirror of the server's pool requirements (validate_mystery_pool), shown
 * while the pool is being built instead of only as a wall of errors after
 * PREVIEW POOL. The server stays the authority — this exists so a seller can
 * see which requirement they are short on, and by how much, as they add cards.
 */
function PoolRequirements({
  template,
  pool,
}: {
  template: MysteryTemplate;
  pool: ShopListingCardItem[];
}) {
  const packSize = template.pack_size;
  const poolSize = pool.reduce((s, i) => s + i.quantity, 0);
  const numPacks = Math.max(1, Math.floor(poolSize / packSize));
  const minPool = shopMinPoolSize(packSize);

  /** Copies in the staged pool at or above a rarity floor. */
  const atOrAbove = (rarity: string) =>
    pool
      .filter((i) => rarityTier(POOL_BY_ID[i.card_id]?.rarity || 'Common') >= rarityTier(rarity))
      .reduce((s, i) => s + i.quantity, 0);
  const exactly = (rarity: string) =>
    pool
      .filter((i) => (POOL_BY_ID[i.card_id]?.rarity || 'Common') === rarity)
      .reduce((s, i) => s + i.quantity, 0);

  const rows: { label: string; have: number; need: number }[] = [];

  rows.push({ label: `At least ${minPool} cards in the pool`, have: poolSize, need: minPool });

  // Cumulative floors: guarantees plus, in advanced mode, `minimum` slots.
  const floors: MysteryGuarantee[] = [
    ...(template.config?.guarantees ?? []),
    ...(template.mode === 'advanced'
      ? (template.config?.slots ?? [])
          .filter((s) => s.mode === 'minimum' && s.rarity)
          .map((s) => ({ rarity: s.rarity!, count: 1 }))
      : []),
  ];
  const merged = new Map<string, number>();
  for (const f of floors) merged.set(f.rarity, (merged.get(f.rarity) || 0) + f.count);
  let running = 0;
  for (const rarity of [...merged.keys()].sort((a, b) => rarityTier(b) - rarityTier(a))) {
    running += merged.get(rarity)! * numPacks;
    rows.push({
      label: `${rarity} or better — ${merged.get(rarity)}/pack`,
      have: atOrAbove(rarity),
      need: running,
    });
  }

  if (template.mode === 'simple') {
    const weights = template.config?.rarity_weights ?? {};
    const total = Object.values(weights).reduce((s, w) => s + (w || 0), 0);
    if (total > 0) {
      for (const [rarity, w] of Object.entries(weights)) {
        if (!w || w <= 0) continue;
        rows.push({
          label: `${Math.round((w / total) * 100)}% ${rarity} odds must be backed`,
          have: exactly(rarity),
          need: Math.max(1, Math.floor((w / total) * poolSize * 0.8)),
        });
      }
    }
  } else {
    const exactCounts = new Map<string, number>();
    for (const s of template.config?.slots ?? []) {
      if (s.mode === 'exact' && s.card_id)
        exactCounts.set(s.card_id, (exactCounts.get(s.card_id) || 0) + 1);
    }
    for (const [cardId, n] of exactCounts) {
      rows.push({
        label: `${POOL_BY_ID[cardId]?.name || cardId} — ${n}/pack (exact slot)`,
        have: pool.filter((i) => i.card_id === cardId).reduce((s, i) => s + i.quantity, 0),
        need: n * numPacks,
      });
    }
  }

  const multipleOk = poolSize > 0 && poolSize % packSize === 0;

  return (
    <div className="ink-border-sm p-2 mb-2 bg-[var(--c-paper)]">
      <div className="heading-font text-[10px] mb-1 flex items-center gap-1">
        <Layers className="w-3.5 h-3.5" /> POOL REQUIREMENTS — {poolSize} cards ={' '}
        {poolSize === 0 ? 0 : numPacks} pack{numPacks === 1 ? '' : 's'}
      </div>
      <div className="flex flex-col gap-0.5">
        <div
          className={cn(
            'text-[10px] font-bold',
            multipleOk ? 'text-[#16A34A]' : 'text-[var(--c-red)]',
          )}
        >
          {multipleOk ? '✓' : '✕'} Pool size must be an exact multiple of {packSize}
          {!multipleOk && poolSize > 0 && (
            <>
              {' '}
              — add {packSize - (poolSize % packSize)} more, or remove {poolSize % packSize}
            </>
          )}
        </div>
        {rows.map((r, i) => {
          const ok = r.have >= r.need;
          return (
            <div
              key={i}
              className={cn(
                'text-[10px] font-bold flex items-center gap-1.5',
                ok ? 'text-[#16A34A]' : 'text-[var(--c-red)]',
              )}
            >
              <span>{ok ? '✓' : '✕'}</span>
              <span className="flex-1 min-w-0 truncate">{r.label}</span>
              <span className="shrink-0">
                {r.have}/{r.need}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MysteryBuilderPanel({
  collection,
  decks,
  templates,
  emptySlots,
  busy,
  onCreateTemplate,
  onSubmitPool,
}: {
  collection: PlayerCard[];
  decks: DeckRow[];
  templates: MysteryTemplate[];
  emptySlots: ShopSlot[];
  busy: boolean;
  onCreateTemplate: (
    name: string,
    size: number,
    mode: MysteryMode,
    config: any,
    onSuccess: () => void,
  ) => void;
  onSubmitPool: (
    templateId: string,
    slotId: string,
    pool: ShopListingCardItem[],
    price: number,
  ) => void;
}) {
  const [showNewTemplate, setShowNewTemplate] = useState(templates.length === 0);
  const [tName, setTName] = useState('');
  const [tSize, setTSize] = useState(3);
  const [tMode, setTMode] = useState<MysteryMode>('simple');
  const [weights, setWeights] = useState<Record<string, number>>({
    Common: 0.6,
    Uncommon: 0.3,
    Rare: 0.1,
  });
  const [slotSpecs, setSlotSpecs] = useState<MysterySlotSpec[]>([]);
  const [guarantees, setGuarantees] = useState<MysteryGuarantee[]>([]);

  const [templateId, setTemplateId] = useState(templates[0]?.id || '');
  const [slotId, setSlotId] = useState(emptySlots[0]?.id || '');
  const [pool, setPool] = useState<ShopListingCardItem[]>([]);
  const [price, setPrice] = useState(200);
  const [validation, setValidation] = useState<MysteryPoolValidation | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');

  useEffect(() => {
    setSlotSpecs((prev) => {
      const next = [...prev];
      while (next.length < tSize) next.push({ mode: 'open' });
      return next.slice(0, tSize);
    });
  }, [tSize]);

  const guaranteedTotal = guarantees.reduce((s, g) => s + g.count, 0);

  // Shrinking the pack size can strand guarantees that no longer fit — clamp
  // them rather than letting CREATE PACK TYPE fail server-side.
  useEffect(() => {
    setGuarantees((prev) => {
      let budget = tSize;
      const next: MysteryGuarantee[] = [];
      for (const g of prev) {
        const count = Math.min(g.count, budget);
        if (count < 1) break;
        next.push({ ...g, count });
        budget -= count;
      }
      return next.length === prev.length && next.every((g, i) => g.count === prev[i].count)
        ? prev
        : next;
    });
  }, [tSize]);

  // This panel stays mounted across template creation — if the current
  // selection is empty or no longer present in a freshly reloaded list
  // (e.g. right after CREATE PACK TYPE), fall back to a valid default
  // instead of leaving the dropdown pointed at nothing.
  useEffect(() => {
    if (!templateId || !templates.some((t) => t.id === templateId)) {
      setTemplateId(templates[0]?.id || '');
    }
  }, [templates, templateId]);

  useEffect(() => {
    if (!slotId || !emptySlots.some((s) => s.id === slotId)) {
      setSlotId(emptySlots[0]?.id || '');
    }
  }, [emptySlots, slotId]);

  const template = templates.find((t) => t.id === templateId);

  // Request-token guard: if the pool or template selection changes while a
  // PREVIEW POOL request is in flight, a stale response must not overwrite
  // validation state for content no longer on screen — that would let
  // SUBMIT POOL & LIST fire on a pool that was never actually validated.
  const checkRequestId = useRef(0);
  useEffect(() => {
    checkRequestId.current++;
  }, [pool, templateId]);

  const checkPool = async () => {
    if (!templateId) return;
    const requestId = ++checkRequestId.current;
    setChecking(true);
    setCheckError('');
    try {
      const { data, error } = await previewMysteryPool(templateId, pool);
      if (checkRequestId.current !== requestId) return;
      setValidation(data);
      if (!data && error) setCheckError(error);
    } catch {
      if (checkRequestId.current !== requestId) return;
      setCheckError('Could not check this pool — check your connection and try again.');
    } finally {
      // Cleared UNCONDITIONALLY: the token guard protects validation state,
      // but gating the busy flag on it meant an edit made mid-flight (which
      // bumps the token) left `checking` stuck true forever — PREVIEW POOL
      // wedged at "CHECKING…" until the panel was closed and reopened.
      setChecking(false);
    }
  };

  return (
    <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3 mb-4 max-w-2xl">
      <div className="flex items-center justify-between mb-2">
        <div className="heading-font text-xs">MYSTERY PACK TYPES</div>
        <PopButton color="steel" onClick={() => setShowNewTemplate((v) => !v)}>
          {showNewTemplate ? 'HIDE' : '+ NEW PACK TYPE'}
        </PopButton>
      </div>

      {showNewTemplate && (
        <div className="ink-border-sm p-2 mb-3">
          <div className="flex flex-wrap gap-2 mb-2">
            <input
              className="px-2 py-1.5 ink-border-sm text-xs font-bold flex-1 min-w-[140px]"
              placeholder="Pack type name"
              aria-label="Pack type name"
              value={tName}
              onChange={(e) => setTName(e.target.value)}
            />
            <label className="flex items-center gap-1 text-xs font-bold">
              Size
              <input
                type="number"
                min={1}
                max={20}
                value={tSize}
                onChange={(e) => setTSize(Math.max(1, Math.min(20, Number(e.target.value) || 1)))}
                className="w-14 px-2 py-1 ink-border-sm"
              />
            </label>
            <PopButton
              color={tMode === 'simple' ? 'black' : 'yellow'}
              onClick={() => setTMode('simple')}
            >
              SIMPLE
            </PopButton>
            <PopButton
              color={tMode === 'advanced' ? 'black' : 'yellow'}
              onClick={() => setTMode('advanced')}
            >
              ADVANCED
            </PopButton>
          </div>

          {tMode === 'simple' ? (
            <div className="flex flex-wrap gap-2 mb-2">
              {RARITIES.map((r) => (
                <label key={r} className="flex items-center gap-1 text-[10px] font-bold">
                  {r}
                  <input
                    type="number"
                    min={0}
                    step="0.05"
                    value={weights[r] ?? 0}
                    onChange={(e) =>
                      setWeights({ ...weights, [r]: Math.max(0, Number(e.target.value) || 0) })
                    }
                    className="w-14 px-1 py-0.5 ink-border-sm"
                  />
                </label>
              ))}
            </div>
          ) : (
            <div className="flex flex-col gap-2 mb-2">
              {slotSpecs.map((spec, i) => (
                <div key={i} className="flex items-center gap-2 flex-wrap ink-border-sm p-1.5">
                  <span className="text-[9px] font-black w-14">SLOT {i + 1}</span>
                  <select
                    aria-label={`Slot ${i + 1} mode`}
                    className="px-1 py-1 ink-border-sm text-[10px] font-bold"
                    value={spec.mode}
                    onChange={(e) => {
                      const next = [...slotSpecs];
                      next[i] = { mode: e.target.value as MysterySlotMode };
                      setSlotSpecs(next);
                    }}
                  >
                    <option value="open">Open</option>
                    <option value="minimum">Minimum rarity</option>
                    <option value="exact">Exact card</option>
                  </select>
                  {spec.mode === 'minimum' && (
                    <select
                      aria-label={`Slot ${i + 1} minimum rarity`}
                      className="px-1 py-1 ink-border-sm text-[10px] font-bold"
                      value={spec.rarity || 'Common'}
                      onChange={(e) => {
                        const next = [...slotSpecs];
                        next[i] = { ...spec, rarity: e.target.value };
                        setSlotSpecs(next);
                      }}
                    >
                      {RARITIES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  )}
                  {spec.mode === 'exact' && (
                    <CardSearchPick
                      value={spec.card_id || ''}
                      onChange={(id) => {
                        const next = [...slotSpecs];
                        next[i] = { ...spec, card_id: id };
                        setSlotSpecs(next);
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
          )}
          {/* Rarity guarantees — the seller's promise about what is in EVERY
              pack, enforced at pool-submission time and honoured first by the
              draw. Without these a pack could advertise odds its pool could
              never pay out. Simple mode only: advanced slots already fill the
              whole pack, so a guarantee would be granted on top and overflow
              pack_size (the server rejects it). Advanced mode uses `minimum`
              slots to express the same floor. */}
          {tMode === 'simple' && (
            <div className="ink-border-sm p-2 mb-2 bg-[var(--c-yellow)]/10">
              <div className="heading-font text-[10px] mb-1 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> GUARANTEED PER PACK
              </div>
              <div className="text-[9px] font-bold text-[var(--c-steel)] mb-1.5">
                Every pack will contain at least this many cards of each rarity (or better). Totals
                can't exceed the pack size ({guaranteedTotal}/{tSize} used).
              </div>
              <div className="flex flex-col gap-1 mb-1.5">
                {guarantees.map((g, i) => (
                  <div key={i} className="flex items-center gap-2 flex-wrap">
                    <select
                      aria-label={`Guarantee ${i + 1} rarity`}
                      className="px-1 py-1 ink-border-sm text-[10px] font-bold"
                      value={g.rarity}
                      onChange={(e) => {
                        const next = [...guarantees];
                        next[i] = { ...g, rarity: e.target.value };
                        setGuarantees(next);
                      }}
                    >
                      {RARITIES.map((r) => (
                        <option key={r} value={r}>
                          {r} or better
                        </option>
                      ))}
                    </select>
                    <input
                      type="number"
                      aria-label={`Guarantee ${i + 1} count`}
                      min={1}
                      max={tSize}
                      value={g.count}
                      onChange={(e) => {
                        const next = [...guarantees];
                        next[i] = {
                          ...g,
                          count: Math.max(1, Math.min(tSize, Number(e.target.value) || 1)),
                        };
                        setGuarantees(next);
                      }}
                      className="w-14 px-1 py-0.5 ink-border-sm text-[10px] font-bold"
                    />
                    <button
                      onClick={() => setGuarantees(guarantees.filter((_, idx) => idx !== i))}
                      aria-label="Remove guarantee"
                      className="w-10 h-10 -my-2 flex items-center justify-center text-[var(--c-red)]"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
              <PopButton
                color="steel"
                disabled={guaranteedTotal >= tSize}
                onClick={() => setGuarantees([...guarantees, { rarity: 'Rare', count: 1 }])}
              >
                + ADD GUARANTEE
              </PopButton>
            </div>
          )}
          <PopButton
            color="red"
            disabled={
              busy ||
              !tName.trim() ||
              guaranteedTotal > tSize ||
              (tMode === 'simple' && !RARITIES.some((r) => (weights[r] ?? 0) > 0)) ||
              (tMode === 'advanced' && slotSpecs.some((s) => s.mode === 'exact' && !s.card_id))
            }
            onClick={() =>
              onCreateTemplate(
                tName.trim(),
                tSize,
                tMode,
                {
                  ...(tMode === 'simple' ? { rarity_weights: weights } : { slots: slotSpecs }),
                  // Guarantees are simple-mode only — advanced slots already
                  // fill the pack, so a guarantee would overflow pack_size and
                  // the server rejects it.
                  ...(tMode === 'simple' && guarantees.length > 0 ? { guarantees } : {}),
                },
                // Clear the form on success — otherwise a double-click (or
                // re-click before the reload lands) creates a duplicate
                // template with identical config.
                () => {
                  setTName('');
                  setTSize(3);
                  setWeights({ Common: 0.6, Uncommon: 0.3, Rare: 0.1 });
                  setSlotSpecs(Array.from({ length: 3 }, () => ({ mode: 'open' as const })));
                  setGuarantees([]);
                },
              )
            }
          >
            CREATE PACK TYPE
          </PopButton>
        </div>
      )}

      {templates.length > 0 && (
        <>
          <div className="heading-font text-xs mb-2 mt-4">SUBMIT A POOL</div>
          <div className="flex flex-wrap gap-3 items-center mb-2">
            <label className="flex items-center gap-2 text-xs font-bold">
              Pack type
              <select
                className="px-2 py-1.5 ink-border-sm font-bold text-xs"
                value={templateId}
                onChange={(e) => {
                  setTemplateId(e.target.value);
                  setValidation(null);
                }}
              >
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.pack_size}/pack)
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-xs font-bold">
              Slot
              <select
                className="px-2 py-1.5 ink-border-sm font-bold text-xs"
                value={slotId}
                onChange={(e) => setSlotId(e.target.value)}
              >
                {emptySlots.map((s) => (
                  <option key={s.id} value={s.id}>
                    #{s.slot_index}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {template && <PoolRequirements template={template} pool={pool} />}
          <CardStackPicker
            collection={collection}
            decks={decks}
            items={pool}
            bulk
            packSize={template?.pack_size}
            guarantees={template?.config?.guarantees}
            onChange={(items) => {
              setPool(items);
              // The pool changed since the last PREVIEW POOL check — clear
              // the stale validation/price-band/EV so SUBMIT POOL & LIST
              // (gated on validation?.ok) can't stay enabled for a pool that
              // was never actually previewed.
              setValidation(null);
              setCheckError('');
            }}
          />
          <div className="flex flex-wrap gap-3 items-center mb-2">
            <label className="flex items-center gap-2 text-xs font-bold">
              Price per pack
              <input
                type="number"
                min={1}
                value={price}
                onChange={(e) => setPrice(Math.max(1, Math.round(Number(e.target.value) || 0)))}
                className="w-24 px-2 py-1 ink-border-sm"
              />
            </label>
            <PopButton color="steel" disabled={checking || pool.length === 0} onClick={checkPool}>
              {checking ? 'CHECKING…' : 'PREVIEW POOL'}
            </PopButton>
          </div>
          {checkError && (
            <div className="ink-border-sm p-2 mb-2 text-[10px] font-bold text-[var(--c-red)]">
              ✕ {checkError}
            </div>
          )}
          {validation && (
            <div className="ink-border-sm p-2 mb-2 text-[10px] font-bold">
              {validation.ok ? (
                <span className="inline-flex items-center flex-wrap gap-x-1">
                  <span className="text-[#22C55E]">✓ Valid pool</span> — {validation.num_packs}{' '}
                  packs, EV <Credits amount={validation.ev_per_pack || 0} />
                  /pack. Suggested price band: <Credits amount={validation.suggested_min || 0} />–
                  <Credits amount={validation.suggested_max || 0} />.
                </span>
              ) : (
                <div className="text-[var(--c-red)]">
                  {(validation.errors ?? ['Pool rejected by the server.']).map((e, i) => (
                    <div key={i}>✕ {e}</div>
                  ))}
                </div>
              )}
            </div>
          )}
          <PopButton
            color="red"
            disabled={busy || !validation?.ok || !slotId}
            onClick={() => onSubmitPool(templateId, slotId, pool, price)}
          >
            SUBMIT POOL & LIST ▸
          </PopButton>
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
export function PlayerShopsScreen({ onBack }: { onBack: () => void }) {
  const [tab, setTab] = useState<'directory' | 'myshop'>('directory');
  const [viewingOwner, setViewingOwner] = useState<string | null>(null);

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="PLAYER SHOPS" onBack={onBack} />
      <div className="p-5 max-w-6xl mx-auto">
        {viewingOwner ? (
          <StorefrontView owner={viewingOwner} onBack={() => setViewingOwner(null)} />
        ) : (
          <>
            <div className="flex gap-2 flex-wrap mb-4">
              <PopButton
                color={tab === 'directory' ? 'black' : 'yellow'}
                onClick={() => setTab('directory')}
              >
                <span className="flex items-center gap-1">
                  <Store className="w-3.5 h-3.5" /> DIRECTORY
                </span>
              </PopButton>
              <PopButton
                color={tab === 'myshop' ? 'black' : 'yellow'}
                onClick={() => setTab('myshop')}
              >
                MY SHOP
              </PopButton>
            </div>
            {tab === 'directory' ? <DirectoryTab onView={setViewingOwner} /> : <MyShopTab />}
          </>
        )}
      </div>
    </div>
  );
}
