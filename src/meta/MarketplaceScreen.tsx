import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Store, Gavel, Tag, Coins, Clock } from 'lucide-react';
import { useMeta } from './MetaContext';
import {
  fetchMarketListings,
  fetchMyMarketActivity,
  fetchPublicProfiles,
  createListing,
  cancelListing,
  buyListing,
  placeBid,
  MarketListing,
  PublicProfile,
  MARKET_FEE,
} from '../lib/supabase';
import { MetaHeader, PopButton, Notice, Credits } from './ui';
import { cn } from '../lib/utils';
import { POOL_BY_ID } from '../game/v3/cardpool';
import { CardDef } from '../game/v3/cards';
import { CardFace } from '../components/CardFaceV4';
import { RARITY_CHIP } from './rarity';
import { quicksellPrice, fmtCredits } from './economy';
import { PlayerLink } from './PlayerProfileModal';

type Tab = 'browse' | 'mine' | 'sell';

function timeLeft(endsAt: string | null | undefined): string {
  if (!endsAt) return 'ended';
  const ms = new Date(endsAt).getTime() - Date.now();
  if (Number.isNaN(ms)) return 'ended';
  if (ms <= 0) return 'ended';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 48) return `${Math.floor(h / 24)}d left`;
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

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

export function MarketplaceScreen({ onBack }: { onBack: () => void }) {
  const { session, profile, collection, decks, refreshProfile, refreshCollection } = useMeta();
  const userId = session?.user?.id;
  const [tab, setTab] = useState<Tab>('browse');
  const [listings, setListings] = useState<MarketListing[]>([]);
  const [myActivity, setMyActivity] = useState<MarketListing[]>([]);
  const [sellers, setSellers] = useState<Map<string, PublicProfile>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [bidFor, setBidFor] = useState<MarketListing | null>(null);
  const [bidAmount, setBidAmount] = useState(0);
  const [rarityFilter, setRarityFilter] = useState('All');
  const [search, setSearch] = useState('');

  // Generation counter guards against an older in-flight reload() resolving
  // after a newer one (e.g. two quick actions in a row) and clobbering
  // fresher listings/activity with stale data.
  const reloadGen = useRef(0);
  const reload = useCallback(async () => {
    const gen = ++reloadGen.current;
    try {
      const [ls, mine] = await Promise.all([
        fetchMarketListings(),
        userId ? fetchMyMarketActivity(userId) : Promise.resolve([]),
      ]);
      if (gen !== reloadGen.current) return;
      setListings(ls);
      setMyActivity(mine);
      const ids = [...new Set([...ls, ...mine].map((l) => l.seller))];
      const profiles = await fetchPublicProfiles(ids);
      if (gen !== reloadGen.current) return;
      setSellers(new Map(profiles.map((p) => [p.id, p])));
    } catch {
      if (gen === reloadGen.current)
        setError('Could not load the marketplace. Check your connection and try again.');
    } finally {
      if (gen === reloadGen.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    (async () => {
      await reload();
    })();
  }, [reload]);

  useEffect(() => {
    if (!bidFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBidFor(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [bidFor]);

  // Ticks once a minute so auction countdowns ("Xh Ym left") and "ended"
  // states advance on their own instead of freezing at whatever "now" was
  // when the screen mounted, mirroring StoreScreen's daily-pack countdown.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const run = async (fn: () => Promise<string | null>, success?: string): Promise<boolean> => {
    if (busy) return false;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const err = await fn();
      if (err) {
        setError(err);
        return false;
      }
      if (success) setNotice(success);
      refreshProfile();
      refreshCollection();
      reload();
      return true;
    } catch {
      setError('Something went wrong — check your connection and try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const browse = listings.filter((l) => {
    const def = defFor(l.card_id);
    if (rarityFilter !== 'All' && (def.rarity || 'Common') !== rarityFilter) return false;
    if (search && !def.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const select = 'px-2 py-1.5 bg-[var(--c-paper)] ink-border-sm font-bold text-xs';

  const listingCard = (l: MarketListing, mine: boolean) => {
    const def = defFor(l.card_id);
    const isAuction = l.listing_type === 'auction';
    const sellerName = l.seller === userId ? 'You' : sellers.get(l.seller)?.username || '…';
    const highBidder = l.current_bidder === userId;
    return (
      <div
        key={l.id}
        className="bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm p-3 flex gap-3"
      >
        <div className="shrink-0">
          <CardFace def={def} size="compact" foil={l.foil} />
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="heading-font text-xs truncate">{def.name}</span>
            <span
              className={cn(
                'text-[8px] font-black px-1',
                RARITY_CHIP[def.rarity || 'Common'] || RARITY_CHIP.Common,
              )}
            >
              {(def.rarity || 'Common').toUpperCase()}
            </span>
            {l.foil && (
              <span className="text-[8px] font-black px-1 bg-[var(--c-ink)] text-[var(--c-yellow)]">
                FOIL ✦
              </span>
            )}
            {l.quantity > 1 && <span className="text-[9px] font-black">×{l.quantity}</span>}
          </div>
          <div className="text-[9px] font-bold text-[var(--c-steel)] mt-0.5">
            {isAuction ? 'AUCTION' : 'FIXED PRICE'} · Seller:{' '}
            {l.seller === userId ? (
              sellerName
            ) : (
              <PlayerLink
                id={l.seller}
                name={sellerName}
                role={sellers.get(l.seller)?.role}
                className="font-bold"
              />
            )}
          </div>
          <div className="flex items-center gap-2 mt-1 text-[10px] font-bold">
            <Clock className="w-3 h-3" /> {timeLeft(l.ends_at)}
          </div>
          <div className="mt-auto pt-2 flex flex-wrap items-center gap-2">
            {isAuction ? (
              <>
                <span className="flex items-center gap-1 heading-font text-[11px] bg-[var(--c-yellow)] px-1.5 py-0.5 ink-border-sm">
                  <Gavel className="w-3 h-3" />
                  {l.current_bid != null
                    ? fmtCredits(l.current_bid)
                    : `Start ${fmtCredits(l.price)}`}
                </span>
                <span className="text-[9px] font-bold text-[var(--c-steel)]">
                  {l.bid_count ?? 0} bid{(l.bid_count ?? 0) === 1 ? '' : 's'}
                  {highBidder ? ' · YOU LEAD' : ''}
                </span>
              </>
            ) : (
              <span className="flex items-center gap-1 heading-font text-[11px] bg-[var(--c-yellow)] px-1.5 py-0.5 ink-border-sm">
                <Coins className="w-3 h-3" /> {fmtCredits(l.price)}
              </span>
            )}
            {isAuction && l.buyout != null && (
              <span className="text-[9px] font-bold text-[var(--c-steel)] inline-flex items-center gap-0.5">
                Buyout <Credits amount={l.buyout} />
              </span>
            )}
          </div>
          <div className="flex gap-2 mt-2">
            {mine && l.status === 'active' ? (
              <PopButton
                color="steel"
                disabled={busy || l.bid_count > 0}
                onClick={() => {
                  if (!confirm('Cancel this listing? Your cards will be returned.')) return;
                  run(() => cancelListing(l.id), 'Listing cancelled — cards returned.');
                }}
                title={l.bid_count > 0 ? 'Auctions with bids cannot be cancelled' : undefined}
              >
                CANCEL LISTING
              </PopButton>
            ) : !mine ? (
              <>
                {isAuction && (
                  <PopButton
                    color="red"
                    disabled={busy || !profile}
                    onClick={() => {
                      const min =
                        l.current_bid != null
                          ? l.current_bid + Math.max(1, Math.ceil(l.current_bid * 0.05))
                          : l.price;
                      setBidAmount(min);
                      setBidFor(l);
                    }}
                  >
                    BID ▸
                  </PopButton>
                )}
                {(l.listing_type === 'fixed' || l.buyout != null) && (
                  <PopButton
                    color="yellow"
                    disabled={
                      busy || !profile || profile.credits < (isAuction ? (l.buyout ?? 0) : l.price)
                    }
                    onClick={() => {
                      const price = isAuction ? (l.buyout ?? 0) : l.price;
                      if (!confirm(`Buy this listing for ${fmtCredits(price)}?`)) return;
                      run(() => buyListing(l.id), 'Purchase complete!');
                    }}
                  >
                    BUY <Credits amount={isAuction ? l.buyout! : l.price} />
                  </PopButton>
                )}
              </>
            ) : (
              <span
                className={cn(
                  'text-[9px] font-black px-1.5 py-1 ink-border-sm self-start',
                  l.status === 'sold'
                    ? 'bg-[#22C55E] text-[#052E12]'
                    : 'bg-[var(--c-steel)] text-[var(--c-paper)]',
                )}
              >
                {(l.status || 'UNKNOWN').toUpperCase()}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  const minBid = bidFor
    ? bidFor.current_bid != null
      ? bidFor.current_bid + Math.max(1, Math.ceil(bidFor.current_bid * 0.05))
      : bidFor.price
    : 0;

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="CARD MARKETPLACE" onBack={onBack} />
      <div className="p-5 max-w-6xl mx-auto">
        <div className="flex gap-2 flex-wrap mb-4">
          <PopButton color={tab === 'browse' ? 'black' : 'yellow'} onClick={() => setTab('browse')}>
            <span className="flex items-center gap-1">
              <Store className="w-3.5 h-3.5" /> BROWSE
            </span>
          </PopButton>
          <PopButton color={tab === 'mine' ? 'black' : 'yellow'} onClick={() => setTab('mine')}>
            MY LISTINGS & BIDS
          </PopButton>
          <PopButton color={tab === 'sell' ? 'black' : 'yellow'} onClick={() => setTab('sell')}>
            <span className="flex items-center gap-1">
              <Tag className="w-3.5 h-3.5" /> SELL A CARD
            </span>
          </PopButton>
        </div>

        {error && (
          <div className="mb-4">
            <Notice text={error} />
          </div>
        )}
        {notice && (
          <div className="mb-4">
            <Notice text={notice} kind="success" />
          </div>
        )}
        <p className="text-[10px] font-bold text-[var(--c-steel)] mb-4">
          Player-to-player market. Sellers pay a {Math.round(MARKET_FEE * 100)}% credits fee on
          completed sales. Bids in the final 5 minutes extend an auction.
        </p>

        {loading ? (
          <div className="text-center font-bold text-[var(--c-steel)] py-16 animate-pulse">
            LOADING MARKET…
          </div>
        ) : tab === 'browse' ? (
          <>
            <div className="flex flex-wrap gap-2 mb-4">
              <input
                className={cn(select, 'w-44 placeholder:text-[var(--c-steel)]/50')}
                placeholder="Search listings…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <select
                className={select}
                value={rarityFilter}
                onChange={(e) => setRarityFilter(e.target.value)}
              >
                {[
                  'All',
                  'Common',
                  'Uncommon',
                  'Rare',
                  'Super-Rare',
                  'Full-Art',
                  'Ultra-Rare',
                  'Mythic',
                ].map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {browse.map((l) => listingCard(l, l.seller === userId))}
              {browse.length === 0 && (
                <div className="col-span-full text-center font-bold text-[var(--c-steel)] py-10">
                  No active listings match. Be the first — list a card under SELL A CARD.
                </div>
              )}
            </div>
          </>
        ) : tab === 'mine' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myActivity.map((l) => listingCard(l, l.seller === userId))}
            {myActivity.length === 0 && (
              <div className="col-span-full text-center font-bold text-[var(--c-steel)] py-10">
                You have no listings or bids yet.
              </div>
            )}
          </div>
        ) : (
          <SellForm
            collection={collection}
            decksLocked={decks}
            busy={busy}
            onSubmit={(opts) =>
              run(
                () => createListing(opts),
                opts.type === 'auction' ? 'Auction created!' : 'Listing created!',
              ).then((ok) => ok && setTab('mine'))
            }
          />
        )}
      </div>

      {/* Bid modal */}
      {bidFor && (
        <div
          className="fixed inset-0 bg-[var(--c-ink)]/90 z-50 flex items-center justify-center p-4"
          onClick={() => setBidFor(null)}
        >
          <div
            className="bg-[var(--c-paper)] ink-border-md shadow-hard-yellow p-4 w-80"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="heading-font text-sm mb-2">
              BID ON {defFor(bidFor.card_id).name.toUpperCase()}
            </div>
            <div className="text-[10px] font-bold text-[var(--c-steel)] mb-2">
              {bidFor.current_bid != null
                ? `Current bid ${fmtCredits(bidFor.current_bid)} — minimum raise 5%.`
                : `Starting bid ${fmtCredits(bidFor.price)}.`}{' '}
              Credits are held while you're the top bidder and refunded if outbid.
            </div>
            <div className="flex items-center gap-2 mb-3">
              <Coins className="w-4 h-4" />
              <input
                type="number"
                value={bidAmount}
                min={0}
                onChange={(e) => setBidAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                className="flex-1 px-2 py-1 ink-border-sm font-bold text-sm"
              />
              <span className="text-[10px] font-bold text-[var(--c-steel)] shrink-0 inline-flex items-center gap-0.5">
                = <Credits amount={bidAmount} />
              </span>
            </div>
            <div className="flex gap-2 justify-end">
              <PopButton color="steel" onClick={() => setBidFor(null)}>
                CANCEL
              </PopButton>
              <PopButton
                color="red"
                disabled={busy || !profile || profile.credits < bidAmount || bidAmount < minBid}
                title={bidAmount < minBid ? `Minimum bid is ${fmtCredits(minBid)}` : undefined}
                onClick={() => {
                  const l = bidFor;
                  setBidFor(null);
                  run(() => placeBid(l.id, bidAmount), 'Bid placed!');
                }}
              >
                PLACE BID ▸
              </PopButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sell form: pick an owned card, choose fixed price or auction.
// ---------------------------------------------------------------------------
function SellForm({
  collection,
  decksLocked,
  busy,
  onSubmit,
}: {
  collection: { card_id: string; quantity: number; foil_quantity: number }[];
  decksLocked: { card_ids: string[] }[];
  busy: boolean;
  onSubmit: (opts: {
    cardId: string;
    foil: boolean;
    quantity: number;
    type: 'fixed' | 'auction';
    price: number;
    buyout: number | null;
    hours: number;
  }) => void;
}) {
  const [cardId, setCardId] = useState('');
  const [foil, setFoil] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [type, setType] = useState<'fixed' | 'auction'>('fixed');
  const [price, setPrice] = useState(100);
  const [buyout, setBuyout] = useState<number | ''>('');
  const [hours, setHours] = useState(24);
  const [search, setSearch] = useState('');

  const locked = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of decksLocked) for (const id of d.card_ids ?? []) m.set(id, (m.get(id) || 0) + 1);
    return m;
  }, [decksLocked]);

  const sellable = useMemo(
    () =>
      collection
        .filter((c) => {
          const def = POOL_BY_ID[c.card_id];
          if (!def || def.type === 'Leader') return false;
          const spare = c.quantity + c.foil_quantity - (locked.get(c.card_id) || 0);
          return spare > 0;
        })
        .map((c) => ({ ...c, def: POOL_BY_ID[c.card_id]! }))
        .filter((c) => !search || c.def.name.toLowerCase().includes(search.toLowerCase())),
    [collection, locked, search],
  );

  // Look the selected card up in the full collection, not the search-filtered
  // `sellable` list — otherwise typing in the search box mid-flow silently
  // deselected the card and collapsed the price/quantity form.
  const selectedEntry = collection.find((c) => c.card_id === cardId);
  const selected =
    selectedEntry && POOL_BY_ID[cardId]
      ? { ...selectedEntry, def: POOL_BY_ID[cardId]! }
      : undefined;
  const maxQty = selected
    ? Math.max(
        0,
        (foil ? selected.foil_quantity : selected.quantity) -
          Math.max(
            0,
            (locked.get(cardId) || 0) - (foil ? selected.quantity : selected.foil_quantity),
          ),
      )
    : 0;
  const suggested = selected ? quicksellPrice(selected.def.rarity, foil) : 0;

  // Buyout only applies to auctions — a stale buyout value left over from
  // auction mode must neither block a fixed-price listing's validation nor
  // get sent along with it.
  const effectiveBuyout = type === 'auction' && buyout !== '' ? buyout : null;
  const valid =
    selected &&
    quantity >= 1 &&
    quantity <= maxQty &&
    price >= 1 &&
    (effectiveBuyout === null || effectiveBuyout > price);

  const select = 'px-2 py-1.5 bg-[var(--c-paper)] ink-border-sm font-bold text-xs';

  return (
    <div className="max-w-2xl">
      <div className="heading-font text-xs mb-1">1 · PICK A CARD</div>
      <input
        className={cn(select, 'w-56 mb-2 placeholder:text-[var(--c-steel)]/50')}
        placeholder="Search your collection…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="flex flex-wrap gap-1 max-h-56 overflow-y-auto ink-border-sm p-2 bg-[var(--c-paper)] mb-4">
        {sellable.map((c) => (
          <button
            key={c.card_id}
            onClick={() => {
              setCardId(c.card_id);
              setFoil(false);
              setQuantity(1);
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
            No spare cards to sell (deck-locked copies can't be listed).
          </span>
        )}
      </div>

      {selected && (
        <>
          <div className="flex gap-4 mb-4 items-start flex-wrap">
            <CardFace def={selected.def} size="compact" foil={foil} />
            <div className="flex flex-col gap-2">
              {selected.foil_quantity > 0 && (
                <label className="flex items-center gap-2 text-xs font-bold">
                  <input
                    type="checkbox"
                    checked={foil}
                    onChange={(e) => {
                      setFoil(e.target.checked);
                      setQuantity(1);
                    }}
                  />
                  List foil copies ✦
                </label>
              )}
              <label className="flex items-center gap-2 text-xs font-bold">
                Quantity
                <input
                  type="number"
                  min={1}
                  max={maxQty}
                  value={quantity}
                  onChange={(e) =>
                    setQuantity(Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)))
                  }
                  className="w-16 px-2 py-1 ink-border-sm"
                />
                <span className="text-[9px] text-[var(--c-steel)]">of {maxQty} spare</span>
              </label>
              <div className="text-[9px] font-bold text-[var(--c-steel)] inline-flex items-center gap-0.5">
                Quicksell value: <Credits amount={suggested} /> each — price above that to profit.
              </div>
            </div>
          </div>

          <div className="heading-font text-xs mb-1">2 · CHOOSE HOW TO SELL</div>
          <div className="flex gap-2 mb-3">
            <PopButton
              color={type === 'fixed' ? 'black' : 'yellow'}
              onClick={() => setType('fixed')}
            >
              FIXED PRICE
            </PopButton>
            <PopButton
              color={type === 'auction' ? 'black' : 'yellow'}
              onClick={() => setType('auction')}
            >
              AUCTION
            </PopButton>
          </div>

          <div className="flex flex-wrap gap-4 mb-4">
            <label className="flex items-center gap-2 text-xs font-bold">
              {type === 'fixed' ? 'Price' : 'Starting bid'}
              <input
                type="number"
                min={1}
                value={price}
                onChange={(e) => setPrice(Math.max(1, Math.round(Number(e.target.value) || 0)))}
                className="w-24 px-2 py-1 ink-border-sm"
              />
              <span className="text-[9px] text-[var(--c-steel)] inline-flex items-center gap-0.5">
                = <Credits amount={price} />
              </span>
            </label>
            {type === 'auction' && (
              <label className="flex items-center gap-2 text-xs font-bold">
                Buyout (optional)
                <input
                  type="number"
                  min={0}
                  value={buyout === '' ? '' : buyout}
                  onChange={(e) =>
                    setBuyout(
                      e.target.value === ''
                        ? ''
                        : Math.max(0, Math.round(Number(e.target.value) || 0)),
                    )
                  }
                  className="w-24 px-2 py-1 ink-border-sm"
                />
                {buyout !== '' && (
                  <span className="text-[9px] text-[var(--c-steel)] inline-flex items-center gap-0.5">
                    = <Credits amount={buyout} />
                  </span>
                )}
              </label>
            )}
            <label className="flex items-center gap-2 text-xs font-bold">
              Duration
              <select
                className={select}
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
              >
                <option value={6}>6 hours</option>
                <option value={12}>12 hours</option>
                <option value={24}>24 hours</option>
                <option value={48}>2 days</option>
                <option value={168}>7 days</option>
              </select>
            </label>
          </div>

          <PopButton
            color="red"
            disabled={!valid || busy}
            onClick={() =>
              onSubmit({
                cardId,
                foil,
                quantity,
                type,
                price,
                buyout: effectiveBuyout,
                hours,
              })
            }
          >
            {busy ? 'LISTING…' : type === 'fixed' ? 'LIST FOR SALE ▸' : 'START AUCTION ▸'}
          </PopButton>
          <div className="text-[9px] font-bold text-[var(--c-steel)] mt-2">
            Listed cards leave your collection until sold, cancelled, or expired.
          </div>
        </>
      )}
    </div>
  );
}
