import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { fmtCredits, SHOP_UNLOCK_LEVEL, SHOP_SETUP_FEE, shopSlotCost, shopMinPoolSize } from './economy';
import { PlayerLink } from './PlayerProfileModal';
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

const RARITIES = ['Common', 'Uncommon', 'Rare', 'Super-Rare', 'Ultra-Rare', 'Mythic'];

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

function withinRatingWindow(createdAt: string): boolean {
  return Date.now() - new Date(createdAt).getTime() < RATING_WINDOW_MS;
}

function shopAge(createdAt: string): string {
  const days = Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000));
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
    for (const d of decks) for (const id of d.card_ids) m.set(id, (m.get(id) || 0) + 1);
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

  const selected = sellable.find((c) => c.card_id === cardId);
  const maxQty = selected ? (foil ? selected.foil_quantity : selected.quantity) : 0;
  const select = 'px-2 py-1.5 bg-[var(--c-paper)] ink-border-sm font-bold text-xs';

  const add = () => {
    if (!selected || qty < 1 || qty > maxQty) return;
    if (maxItems === 1) {
      onChange([{ card_id: cardId, foil, quantity: qty }]);
    } else {
      const idx = items.findIndex((i) => i.card_id === cardId && i.foil === foil);
      if (idx >= 0) {
        const next = [...items];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + qty };
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
          <PopButton color="steel" onClick={add}>
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
    return POOL_V4.filter((c) => c.type !== 'Leader' && c.name.toLowerCase().includes(q)).slice(0, 8);
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
              className={cn('text-[9px] font-black px-1.5 py-0.5 ink-border-sm', RARITY_CHIP[c.rarity || 'Common'])}
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

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    browseShops(sort, 40).then((s) => {
      if (!cancelled) {
        setShops(s);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [sort]);

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
          <PopButton key={t.key} color={sort === t.key ? 'black' : 'yellow'} onClick={() => setSort(t.key)}>
            <span className="flex items-center gap-1">
              {t.icon} {t.label}
            </span>
          </PopButton>
        ))}
      </div>
      {loading ? (
        <div className="text-center font-bold text-[var(--c-steel)] py-16 animate-pulse">LOADING SHOPS…</div>
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
                    {s.sales_count} sale{s.sales_count === 1 ? '' : 's'} · {shopAge(s.created_at)}
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
function ReportModal({ listingId, onClose, onDone }: { listingId: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState<'mismatch' | 'not_as_described' | 'other'>('not_as_described');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return (
    <div
      className="fixed inset-0 bg-[var(--c-ink)]/90 z-50 flex items-center justify-center p-4"
      onClick={onClose}
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
          className="w-full px-2 py-1.5 bg-[var(--c-paper)] ink-border-sm font-bold text-xs mb-2"
          value={reason}
          onChange={(e) => setReason(e.target.value as typeof reason)}
        >
          <option value="not_as_described">Not as described</option>
          <option value="mismatch">Contents don't match listing</option>
          <option value="other">Other</option>
        </select>
        <textarea
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
              const err = await reportListing(listingId, reason, note || undefined);
              setBusy(false);
              if (err) setError(err);
              else onDone();
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
  onBuy,
  onReport,
  busy,
  credits,
}: {
  key?: React.Key;
  listing: ShopListing;
  isOwn: boolean;
  onBuy: () => void;
  onReport: () => void;
  busy: boolean;
  credits: number;
}) {
  const [live, setLive] = useState<MysteryLiveStats | null>(null);
  useEffect(() => {
    if (listing.status !== 'active') return;
    let cancelled = false;
    fetchMysteryLiveStats(listing.id).then((s) => {
      if (!cancelled) setLive(s);
    });
    return () => {
      cancelled = true;
    };
  }, [listing.id, listing.status]);

  const soldOut = listing.status !== 'active';
  const remaining = live?.remaining_packs ?? listing.remaining_packs ?? 0;

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
              {listing.status.toUpperCase()}
            </span>
          )}
        </div>
        {!isOwn && !soldOut && (
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

  const reload = useCallback(async () => {
    const [s, ls, sellers] = await Promise.all([
      fetchShopPublic(owner),
      fetchShopListings(owner),
      fetchPublicProfiles([owner]),
    ]);
    setShop(s);
    setListings(ls.filter((l) => l.status === 'active' || l.status === 'sold_out'));
    setSeller(sellers[0] || null);
    setLoading(false);
  }, [owner]);

  useEffect(() => {
    reload();
  }, [reload]);

  const run = async (fn: () => Promise<string | null>, success?: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    const err = await fn();
    setBusy(false);
    if (err) setError(err);
    else {
      if (success) setNotice(success);
      refreshProfile();
      refreshCollection();
      reload();
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
          busy={busy}
          credits={profile?.credits || 0}
          onBuy={() => {
            run(async () => {
              const { error: e } = await buyMysteryPack(l.id);
              return e;
            }, 'Pack opened! Check your Collection.');
          }}
          onReport={() => setReportTarget(l.id)}
        />
      );
    }
    return (
      <div key={l.id} className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3 flex gap-3">
        <div className="shrink-0 flex flex-col gap-1">
          <CardFace def={defFor(l.cards[0]?.card_id || '')} size="compact" foil={l.cards[0]?.foil} />
          {l.cards.length > 1 && <span className="text-[9px] font-black text-center">+{l.cards.length - 1} more</span>}
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="heading-font text-xs">
            {l.listing_type === 'bundle' ? 'BUNDLE' : defFor(l.cards[0]?.card_id || '').name}
          </div>
          {l.listing_type === 'bundle' && (
            <div className="text-[9px] font-bold text-[var(--c-steel)] mt-1 flex flex-col gap-0.5">
              {l.cards.map((c, i) => (
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
                {l.status.toUpperCase()}
              </span>
            )}
          </div>
          {!isOwn && l.status === 'active' && (
            <div className="flex gap-2 mt-2">
              <PopButton
                color="red"
                disabled={busy || (profile?.credits || 0) < l.price}
                onClick={() => {
                  run(async () => {
                    const e = await buyShopListing(l.id);
                    return e;
                  }, 'Purchase complete!');
                }}
              >
                BUY ▸
              </PopButton>
              <button onClick={() => setReportTarget(l.id)} className="text-[var(--c-steel)] hover:text-[var(--c-red)]">
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
      {loading || !shop ? (
        <div className="text-center font-bold text-[var(--c-steel)] py-16 animate-pulse">LOADING SHOP…</div>
      ) : (
        <>
          <div className="bg-[var(--c-ink)] text-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-4 mb-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <div className="heading-font text-xl">{shop.name}</div>
                <div className="text-[10px] font-bold text-[var(--c-steel)] mt-1">
                  Sold by{' '}
                  {seller ? (
                    <PlayerLink id={owner} name={seller.username} role={seller.role} className="text-[var(--c-paper)]" />
                  ) : (
                    '…'
                  )}{' '}
                  · {shopAge(shop.created_at)} · {shop.sales_count} sale{shop.sales_count === 1 ? '' : 's'}
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
              <PopButton key={f} color={filter === f ? 'black' : 'yellow'} onClick={() => setFilter(f)}>
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

  const reload = useCallback(async () => {
    const s = await fetchMyShop(userId);
    setShop(s);
    if (s) {
      const [sl, li, tp] = await Promise.all([
        fetchShopSlots(userId),
        fetchShopListings(userId),
        fetchMysteryTemplates(userId),
      ]);
      setSlots(sl);
      setListings(li);
      setTemplates(tp);
    }
    const [pur, rat] = await Promise.all([fetchMyShopPurchases(userId), fetchMyBuyerRatings(userId)]);
    setPurchases(pur.filter((p) => p.buyer === userId));
    setMyRatings(rat);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    reload();
  }, [reload]);

  const run = async (fn: () => Promise<string | null>, success?: string) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    const err = await fn();
    setBusy(false);
    if (err) setError(err);
    else {
      if (success) setNotice(success);
      refreshProfile();
      refreshCollection();
      setAddMode('none');
      reload();
    }
  };

  if (loading || dataLoading) {
    return <div className="text-center font-bold text-[var(--c-steel)] py-16 animate-pulse">LOADING…</div>;
  }

  if (!shop) {
    if (!profile || profile.level < SHOP_UNLOCK_LEVEL) {
      return (
        <div className="text-center py-16">
          <Lock className="w-10 h-10 mx-auto mb-3 text-[var(--c-steel)]" />
          <div className="heading-font text-lg">PLAYER SHOPS UNLOCK AT LEVEL {SHOP_UNLOCK_LEVEL}</div>
          <div className="text-[11px] font-bold text-[var(--c-steel)] mt-2">
            You're level {profile?.level ?? 1}. Keep playing to unlock your own storefront.
          </div>
        </div>
      );
    }
    return <OpenShopPanel busy={busy} error={error} onOpen={(name, banner) => run(() => openShop(name, banner))} />;
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
            Your shop is closed. Slots and any remaining collateral are still in place — reopening is free.
          </div>
          <PopButton color="red" disabled={busy} onClick={() => run(() => reopenShop(), 'Shop reopened!')}>
            REOPEN SHOP
          </PopButton>
        </div>
      </div>
    );
  }

  const emptySlots = slots.filter((s) => s.status === 'empty');
  const nextSlotCost = shopSlotCost(shop.slots_purchased + 1);
  const myPurchaseIds = new Set(myRatings.map((r) => r.purchase_id));

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
            {shopAge(shop.created_at)} · {slots.filter((s) => s.status === 'occupied').length}/{slots.length} slots
            filled
          </div>
        </div>
        <PopButton
          color="steel"
          disabled={busy}
          onClick={() => {
            if (confirm('Close your shop? Half of remaining slot collateral is refunded; the rest is a sink.'))
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
            <span>{s.status.toUpperCase()}</span>
            {s.collateral > 0 && <Credits amount={s.collateral} />}
          </div>
        ))}
      </div>
      <PopButton
        color="yellow"
        disabled={busy || (profile?.credits || 0) < nextSlotCost}
        onClick={() => run(() => buyShopSlot().then((r) => r.error), 'Slot purchased!')}
      >
        <span className="inline-flex items-center gap-0.5">
          + BUY SLOT (<Credits amount={nextSlotCost} /> collateral)
        </span>
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
          color={addMode === 'mystery' ? 'black' : 'yellow'}
          disabled={emptySlots.length === 0}
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
          onCreateTemplate={(name, size, mode, config) =>
            run(() => createMysteryTemplate(name, size, mode, config).then((r) => r.error), 'Pack type created!')
          }
          onSubmitPool={(templateId, slotId, pool, price) =>
            run(() => submitMysteryPool(templateId, slotId, pool, price).then((r) => r.error), 'Pool submitted!')
          }
        />
      )}

      <div className="flex flex-col gap-2 mt-4">
        {listings.map((l) => (
          <div
            key={l.id}
            className="bg-[var(--c-paper)] ink-border-sm shadow-hard-black-xs p-2 flex items-center justify-between gap-2 flex-wrap"
          >
            <div className="text-[10px] font-bold inline-flex items-center flex-wrap gap-x-1">
              <span className="heading-font text-xs mr-1">{l.listing_type.toUpperCase()}</span>
              {l.listing_type === 'mystery'
                ? `${l.remaining_packs}/${l.total_packs} packs left`
                : l.cards.map((c) => defFor(c.card_id).name).join(', ')}
              {' · '}
              <Credits amount={l.price} /> · {l.status.toUpperCase()}
            </div>
            {l.status === 'active' && (l.listing_type === 'individual' || l.listing_type === 'bundle') && (
              <PopButton color="steel" disabled={busy} onClick={() => run(() => cancelShopListing(l.id))}>
                CANCEL
              </PopButton>
            )}
          </div>
        ))}
        {listings.length === 0 && (
          <div className="text-center font-bold text-[var(--c-steel)] py-6 text-xs">No listings yet.</div>
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
                {p.listing_type === 'mystery' ? 'Mystery pack' : p.cards.map((c) => defFor(c.card_id).name).join(', ')}
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
                        existing && existing.rating >= n ? 'text-[var(--c-yellow)]' : 'text-[var(--c-steel)]',
                      )}
                    >
                      <Star className={cn('w-4 h-4', existing && existing.rating >= n && 'fill-current')} />
                    </button>
                  ))}
                </div>
              ) : existing ? (
                <span className="text-[9px] font-bold text-[var(--c-steel)]">Rated {existing.rating}/5</span>
              ) : (
                <span className="text-[9px] font-bold text-[var(--c-steel)]">Rating window closed</span>
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
      {!myPurchaseIds && null}
    </div>
  );
}

function OpenShopPanel({
  busy,
  error,
  onOpen,
}: {
  busy: boolean;
  error: string;
  onOpen: (name: string, banner: string | null) => void;
}) {
  const [name, setName] = useState('');
  const [banner, setBanner] = useState('');
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
          One-time setup fee of <Credits amount={SHOP_SETUP_FEE} /> (non-refundable). You start with 4 free
          listing slots — more can be purchased later, each backed by its own collateral.
        </div>
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
        <PopButton color="red" disabled={busy || !name.trim()} onClick={() => onOpen(name.trim(), banner.trim() || null)}>
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
    Promise.all(items.map((i) => fetchCardBlendedReference(i.card_id, i.foil).then((v) => v * i.quantity))).then(
      (vals) => {
        if (!cancelled) setReference(vals.reduce((a, b) => a + b, 0));
      },
    );
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
          <Credits amount={Math.round(reference * 1.1)} />–<Credits amount={Math.round(reference * 1.25)} /> (soft
          cap, not enforced)
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
            min={0.01}
            step="0.01"
            value={price / 100}
            onChange={(e) => setPrice(Math.max(1, Math.round((Number(e.target.value) || 0) * 100)))}
            className="w-24 px-2 py-1 ink-border-sm"
          />
        </label>
        <PopButton color="red" disabled={!valid || busy} onClick={() => onSubmit(slotId, items, price)}>
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
  onCreateTemplate: (name: string, size: number, mode: MysteryMode, config: any) => void;
  onSubmitPool: (templateId: string, slotId: string, pool: ShopListingCardItem[], price: number) => void;
}) {
  const [showNewTemplate, setShowNewTemplate] = useState(templates.length === 0);
  const [tName, setTName] = useState('');
  const [tSize, setTSize] = useState(3);
  const [tMode, setTMode] = useState<MysteryMode>('simple');
  const [weights, setWeights] = useState<Record<string, number>>({ Common: 0.6, Uncommon: 0.3, Rare: 0.1 });
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

  const template = templates.find((t) => t.id === templateId);

  const checkPool = async () => {
    if (!templateId) return;
    setChecking(true);
    setCheckError('');
    const { data, error } = await previewMysteryPool(templateId, pool);
    setValidation(data);
    if (!data && error) setCheckError(error);
    setChecking(false);
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
            <PopButton color={tMode === 'simple' ? 'black' : 'yellow'} onClick={() => setTMode('simple')}>
              SIMPLE
            </PopButton>
            <PopButton color={tMode === 'advanced' ? 'black' : 'yellow'} onClick={() => setTMode('advanced')}>
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
                    onChange={(e) => setWeights({ ...weights, [r]: Number(e.target.value) || 0 })}
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
              Pool must be at least {shopMinPoolSize(template.pack_size)} cards, an exact multiple of{' '}
              {template.pack_size}.
            </div>
          )}
          <CardStackPicker collection={collection} decks={decks} items={pool} onChange={setPool} />
          <div className="flex flex-wrap gap-3 items-center mb-2">
            <label className="flex items-center gap-2 text-xs font-bold">
              Price per pack
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={price / 100}
                onChange={(e) => setPrice(Math.max(1, Math.round((Number(e.target.value) || 0) * 100)))}
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
                  <span className="text-[#22C55E]">✓ Valid pool</span> — {validation.num_packs} packs, EV{' '}
                  <Credits amount={validation.ev_per_pack || 0} />
                  /pack. Suggested price band: <Credits amount={validation.suggested_min || 0} />–
                  <Credits amount={validation.suggested_max || 0} />.
                </span>
              ) : (
                <div className="text-[var(--c-red)]">
                  {validation.errors.map((e, i) => (
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
              <PopButton color={tab === 'directory' ? 'black' : 'yellow'} onClick={() => setTab('directory')}>
                <span className="flex items-center gap-1">
                  <Store className="w-3.5 h-3.5" /> DIRECTORY
                </span>
              </PopButton>
              <PopButton color={tab === 'myshop' ? 'black' : 'yellow'} onClick={() => setTab('myshop')}>
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
