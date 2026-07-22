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
  ShopBuyerRating,
  PublicProfile,
  DeckRow,
  PlayerCard,
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

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Super-Rare', 'Full-Art', 'Ultra-Rare', 'Mythic'];

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

// ---------------------------------------------------------------------------
// Reusable: multi-card picker for bundle contents / mystery pool submission
// ---------------------------------------------------------------------------
function CardStackPicker({
  collection,
  decks,
  items,
  onChange,
  maxItems,
}: {
  collection: PlayerCard[];
  decks: DeckRow[];
  items: ShopListingCardItem[];
  onChange: (items: ShopListingCardItem[]) => void;
  /** When set, adding a new card replaces the current selection instead of appending. */
  maxItems?: number;
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

  const sellable = useMemo(
    () =>
      collection
        .filter((c) => {
          const def = POOL_BY_ID[c.card_id];
          if (!def || def.type === 'Leader') return false;
          return c.quantity + c.foil_quantity - (locked.get(c.card_id) || 0) > 0;
        })
        .map((c) => ({ ...c, def: POOL_BY_ID[c.card_id]! }))
        .filter((c) => !search || c.def.name.toLowerCase().includes(search.toLowerCase())),
    [collection, locked, search],
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
  const totalSpare = foil ? spare.foil : spare.normal;
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
      <input
        className={cn(select, 'w-full mb-2 placeholder:text-[var(--c-steel)]/50')}
        placeholder="Search your collection…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="flex flex-wrap gap-1 max-h-32 overflow-y-auto ink-border-sm p-2 bg-[var(--c-paper)] mb-2">
        {sellable.map((c) => (
          <button
            key={c.card_id}
            onClick={() => {
              setCardId(c.card_id);
              setFoil(false);
              setQty(1);
            }}
            className={cn(
              'text-[9px] font-black px-1.5 py-0.5 ink-border-sm',
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
        <div className="flex flex-col gap-1 mb-2">
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
                  className="text-[var(--c-red)]"
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
                'text-[9px] font-black px-1.5 py-0.5 ink-border-sm',
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
              className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3 text-left flex items-center gap-3 hover:-translate-y-0.5 transition-transform"
            >
              <div className="w-12 h-12 shrink-0 bg-[var(--c-ink)] ink-border-sm flex items-center justify-center">
                <Store className="w-6 h-6 text-[var(--c-yellow)]" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="heading-font text-sm truncate">{s.name}</div>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <RatingBadge shop={s} />
                  <span className="text-[9px] font-bold text-[var(--c-steel)]">
                    {s.sales_count ?? 0} sale{(s.sales_count ?? 0) === 1 ? '' : 's'} ·{' '}
                    {shopAge(s.created_at)}
                  </span>
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
    >
      <div
        className="bg-[var(--c-paper)] ink-border-md shadow-hard-yellow p-4 w-80"
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
  busy,
  credits,
}: {
  key?: React.Key;
  listing: ShopListing;
  isOwn: boolean;
  shopActive: boolean;
  onBuy: () => void;
  onReport: () => void;
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

  return (
    <div
      className={cn(
        'bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3 flex gap-3',
        soldOut && 'opacity-50 grayscale',
      )}
    >
      <div className="w-20 h-28 shrink-0 bg-[var(--c-ink)] ink-border-sm flex flex-col items-center justify-center text-[var(--c-yellow)]">
        <Package className="w-8 h-8" />
        <span className="text-[9px] font-black mt-1">×{listing.pack_size}</span>
      </div>
      <div className="flex-1 min-w-0 flex flex-col">
        <div className="heading-font text-xs">MYSTERY PACK</div>
        <div className="text-[9px] font-bold text-[var(--c-steel)] mt-0.5 inline-flex items-center flex-wrap gap-x-1">
          {remaining} pack{remaining === 1 ? '' : 's'} left
          {live?.live_ev_per_pack != null && (
            <>
              {' '}
              · live EV <Credits amount={live.live_ev_per_pack} />
            </>
          )}
        </div>
        <div className="mt-auto pt-2 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 heading-font text-[11px] bg-[var(--c-yellow)] px-1.5 py-0.5 ink-border-sm">
            <Coins className="w-3 h-3" /> {fmtCredits(listing.price)}
          </span>
          {soldOut && (
            <span className="text-[9px] font-black px-1.5 py-0.5 bg-[var(--c-steel)] text-[var(--c-paper)] ink-border-sm">
              {(listing.status || 'SOLD OUT').toUpperCase()}
            </span>
          )}
        </div>
        {!isOwn && !soldOut && shopActive && (
          <div className="flex gap-2 mt-2">
            <PopButton color="red" disabled={busy || credits < listing.price} onClick={onBuy}>
              BUY PACK ▸
            </PopButton>
            <button onClick={onReport} className="text-[var(--c-steel)] hover:text-[var(--c-red)]">
              <Flag className="w-3.5 h-3.5" />
            </button>
          </div>
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

  const [loadError, setLoadError] = useState('');
  // `isCancelled` guards a fast owner-to-owner navigation (or unmount) from
  // letting a stale fetch for the PREVIOUS shop overwrite this one's fresh
  // state — same pattern as the other reload()s in this file.
  const reload = useCallback(
    async (isCancelled?: () => boolean) => {
      setLoadError('');
      try {
        const [s, ls, sellers] = await Promise.all([
          fetchShopPublic(owner),
          fetchShopListings(owner),
          fetchPublicProfiles([owner]),
        ]);
        if (isCancelled?.()) return;
        setShop(s);
        setListings(ls.filter((l) => l.status === 'active' || l.status === 'sold_out'));
        setSeller(sellers[0] || null);
      } catch {
        if (!isCancelled?.())
          setLoadError("Couldn't load this shop. Check your connection and try again.");
      } finally {
        if (!isCancelled?.()) setLoading(false);
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
                  names ? `Pack opened! You pulled: ${names}` : 'Pack opened! Check your Collection.',
                );
              }
              return e;
            });
          }}
          onReport={() => setReportTarget(l.id)}
        />
      );
    }
    const cards = l.cards ?? [];
    return (
      <div
        key={l.id}
        className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3 flex gap-3"
      >
        <div className="shrink-0 flex flex-col gap-1">
          <CardFace def={defFor(cards[0]?.card_id || '')} size="compact" foil={cards[0]?.foil} />
          {cards.length > 1 && (
            <span className="text-[9px] font-black text-center">+{cards.length - 1} more</span>
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="heading-font text-xs">
            {/* Individual listings must surface foil + quantity too — a
                "Card ×3 (foil)" listing previously showed just the bare card
                name, so buyers couldn't tell what they were actually buying
                without cross-checking the tiny card art. */}
            {l.listing_type === 'bundle'
              ? 'BUNDLE'
              : `${defFor(cards[0]?.card_id || '').name}${cards[0]?.foil ? ' ✦' : ''}${
                  (cards[0]?.quantity ?? 1) > 1 ? ` ×${cards[0].quantity}` : ''
                }`}
          </div>
          {l.listing_type === 'bundle' && (
            <div className="text-[9px] font-bold text-[var(--c-steel)] mt-1 flex flex-col gap-0.5">
              {cards.map((c, i) => (
                <span key={i}>
                  {defFor(c.card_id).name}
                  {c.foil ? ' ✦' : ''} ×{c.quantity}
                </span>
              ))}
            </div>
          )}
          <div className="mt-auto pt-2 flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1 heading-font text-[11px] bg-[var(--c-yellow)] px-1.5 py-0.5 ink-border-sm">
              <Coins className="w-3 h-3" /> {fmtCredits(l.price)}
            </span>
            {l.status !== 'active' && (
              <span className="text-[9px] font-black px-1.5 py-0.5 bg-[var(--c-steel)] text-[var(--c-paper)] ink-border-sm">
                {(l.status || 'UNAVAILABLE').toUpperCase()}
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
                className="text-[var(--c-steel)] hover:text-[var(--c-red)]"
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
          <div className="bg-[var(--c-ink)] text-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-4 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="heading-font text-xl">{shop.name}</div>
                <div className="text-[10px] font-bold text-[var(--c-steel)] mt-1">
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
                  · {shopAge(shop.created_at)} · {shop.sales_count ?? 0} sale
                  {(shop.sales_count ?? 0) === 1 ? '' : 's'}
                </div>
              </div>
              <RatingBadge shop={shop} />
            </div>
            {shop.status === 'dormant' && (
              <div className="mt-2">
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
  const reload = useCallback(
    async (isCancelled?: () => boolean) => {
      setLoadError('');
      try {
        const s = await fetchMyShop(userId);
        if (isCancelled?.()) return;
        setShop(s);
        if (s) {
          const [sl, li, tp] = await Promise.all([
            fetchShopSlots(userId),
            fetchShopListings(userId),
            fetchMysteryTemplates(userId),
          ]);
          if (isCancelled?.()) return;
          setSlots(sl);
          setListings(li);
          setTemplates(tp);
        }
        const [pur, rat] = await Promise.all([
          fetchMyShopPurchases(userId),
          fetchMyBuyerRatings(userId),
        ]);
        if (isCancelled?.()) return;
        setPurchases(pur.filter((p) => p.buyer === userId));
        setMyRatings(rat);
      } catch {
        if (!isCancelled?.())
          setLoadError("Couldn't load your shop. Check your connection and try again.");
      } finally {
        if (!isCancelled?.()) setLoading(false);
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
        onOpen={(name, banner) => run(() => openShop(name, banner))}
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
        <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-4">
          <div className="heading-font text-sm mb-2">{shop.name}</div>
          <div className="text-[11px] font-bold text-[var(--c-steel)] mb-3">
            Your shop is closed. Slots and any remaining collateral are still in place — reopening
            is free.
          </div>
          <PopButton
            color="red"
            disabled={busy}
            onClick={() => run(() => reopenShop(), 'Shop reopened!')}
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

      <div className="bg-[var(--c-ink)] text-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-4 mb-4 flex items-center justify-between flex-wrap gap-2">
        <div>
          <div className="heading-font text-xl">{shop.name}</div>
          <div className="text-[10px] font-bold text-[var(--c-steel)] mt-1">
            {shopAge(shop.created_at)} · {slots.filter((s) => s.status === 'occupied').length}/
            {slots.length} slots filled
          </div>
        </div>
        <PopButton
          color="steel"
          disabled={busy}
          onClick={() => {
            if (
              confirm(
                'Close your shop? Half of remaining slot collateral is refunded; the rest is a sink.',
              )
            )
              run(() => closeShop().then((r) => r.error), 'Shop closed.');
          }}
        >
          CLOSE SHOP
        </PopButton>
      </div>

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
        onClick={() => run(() => buyShopSlot().then((r) => r.error), 'Slot purchased!')}
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
              <Credits amount={l.price} /> · {(l.status || 'UNKNOWN').toUpperCase()}
            </div>
            {l.status === 'active' &&
              (l.listing_type === 'individual' || l.listing_type === 'bundle') && (
                <PopButton
                  color="steel"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm('Cancel this listing? Your cards will be returned.')) return;
                    run(() => cancelShopListing(l.id));
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
                      onClick={() => run(() => rateShopPurchase(p.id, n))}
                      className={cn(
                        'w-4 h-4',
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

function OpenShopPanel({
  busy,
  error,
  credits,
  onOpen,
}: {
  busy: boolean;
  error: string;
  credits: number;
  onOpen: (name: string, banner: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [banner, setBanner] = useState('');
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
        <label className="block text-xs font-bold mb-1">Shop name</label>
        <input
          className="w-full px-2 py-1.5 ink-border-sm text-xs font-bold mb-3"
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
        />
        <label className="block text-xs font-bold mb-1">Banner image URL (optional)</label>
        <input
          className="w-full px-2 py-1.5 ink-border-sm text-xs font-bold mb-3"
          value={banner}
          onChange={(e) => setBanner(e.target.value)}
        />
        <PopButton
          color="red"
          disabled={busy || !name.trim() || short > 0}
          onClick={() => onOpen(name.trim(), banner.trim() || null)}
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
      if (checkRequestId.current === requestId) setChecking(false);
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
          <PopButton
            color="red"
            disabled={
              busy ||
              !tName.trim() ||
              (tMode === 'advanced' && slotSpecs.some((s) => s.mode === 'exact' && !s.card_id))
            }
            onClick={() =>
              onCreateTemplate(
                tName.trim(),
                tSize,
                tMode,
                tMode === 'simple' ? { rarity_weights: weights } : { slots: slotSpecs },
                // Clear the form on success — otherwise a double-click (or
                // re-click before the reload lands) creates a duplicate
                // template with identical config.
                () => {
                  setTName('');
                  setTSize(3);
                  setWeights({ Common: 0.6, Uncommon: 0.3, Rare: 0.1 });
                  setSlotSpecs(Array.from({ length: 3 }, () => ({ mode: 'open' as const })));
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
          {template && (
            <div className="text-[9px] font-bold text-[var(--c-steel)] mb-2">
              Pool must be at least {shopMinPoolSize(template.pack_size)} cards, an exact multiple
              of {template.pack_size}.
            </div>
          )}
          <CardStackPicker
            collection={collection}
            decks={decks}
            items={pool}
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
