import React, { useCallback, useEffect, useRef, useState } from 'react';
import { asVariant, VARIANT_META } from './variants';
import { useRouteTab, useRouter } from './useHashRouter';
import { FilterSelect } from './FilterSelect';
import { askConfirm } from './confirm';
import { Store, Gavel, Tag, Coins, Clock } from 'lucide-react';
import { useMeta } from './MetaContext';
import {
  fetchMarketListings,
  MARKET_LIST_LIMIT,
  fetchMyMarketActivity,
  fetchPublicProfiles,
  cancelListing,
  buyListing,
  placeBid,
  rememberBidListing,
  MarketListing,
  PublicProfile,
  MARKET_FEE,
  subscribeTopic,
} from '../lib/supabase';
import { MetaHeader, PopButton, Notice, Credits, Tabs } from './ui';
import { usePersistedState } from './usePersistedState';
import { cn } from '../lib/utils';
import { POOL_BY_ID } from '../game/poker/cardpool';
import { CardDef } from '../game/poker/cards';
import { CardFace } from '../components/CardFaceV4';
import { RARITY_CHIP, RARITY_ORDER } from './rarity';
import { fmtCredits } from './economy';
import { PlayerLink } from './PlayerProfileModal';
import { useFocusTrap, useEscapeClose } from '../components/useFocusTrap';
import { SellPanel } from './sell/SellPanel';
import { BID_STYLE_LABEL, initials, resolvePersona } from './buyers/personas';

/** CPU auction bidder: persona badge + name, with archetype and bid style on hover. */
function CpuBidderTag({ name }: { name: string }) {
  const p = resolvePersona(null, name);
  return (
    <span
      className="inline-flex items-center gap-0.5 align-middle"
      title={p ? `${p.archetype} · ${BID_STYLE_LABEL[p.bidStyle]}` : 'CPU bidder'}
    >
      <span aria-hidden>{p?.badge ?? initials(name)}</span>
      {name} (CPU{p ? ` · ${BID_STYLE_LABEL[p.bidStyle].toLowerCase()}` : ''}) leads
    </span>
  );
}

const TABS = ['browse', 'mine', 'sell'] as const;
type Tab = (typeof TABS)[number];

export type MarketSort = 'ending' | 'price-asc' | 'price-desc';
const isSort = (v: unknown): v is MarketSort =>
  v === 'ending' || v === 'price-asc' || v === 'price-desc';

/**
 * Compact "time left" label. Minutes/hours under two days, then days, weeks
 * and months; a listing more than a year out (or with a sentinel far-future
 * expiry) reads "No expiry" instead of something like "26382d left" (audit
 * M5). Anything past its end reads exactly "ended" — callers compare to it.
 */
export function timeLeft(endsAt: string | null | undefined, now = Date.now()): string {
  if (!endsAt) return 'ended';
  const ms = new Date(endsAt).getTime() - now;
  if (Number.isNaN(ms)) return 'ended';
  if (ms <= 0) return 'ended';
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (h >= 48) {
    const d = Math.floor(h / 24);
    if (d >= 365) return 'No expiry';
    if (d >= 60) return `${Math.floor(d / 30)}mo left`;
    if (d >= 14) return `${Math.floor(d / 7)}w left`;
    return `${d}d left`;
  }
  if (h > 0) return `${h}h ${m}m left`;
  return `${m}m left`;
}

/** The price a buyer compares on: the standing bid of an auction (or its
 * starting price while nobody has bid), the asking price of a fixed listing. */
export function listingPrice(l: Pick<MarketListing, 'listing_type' | 'current_bid' | 'price'>) {
  return l.listing_type === 'auction' ? (l.current_bid ?? l.price) : l.price;
}

/** Sorted copy: ending soonest first, or by price (ties: ending soonest). */
export function sortListings<
  T extends Pick<MarketListing, 'listing_type' | 'current_bid' | 'price' | 'ends_at'>,
>(list: T[], sort: MarketSort): T[] {
  const end = (l: T) => new Date(l.ends_at).getTime() || 0;
  const cmp: Record<MarketSort, (x: T, y: T) => number> = {
    ending: (x, y) => end(x) - end(y),
    'price-asc': (x, y) => listingPrice(x) - listingPrice(y) || end(x) - end(y),
    'price-desc': (x, y) => listingPrice(y) - listingPrice(x) || end(x) - end(y),
  };
  return [...list].sort(cmp[sort]);
}

/** Minimum next bid for an auction: starting price if no bids yet, otherwise
 * current bid + a 5% raise (at least 1 credit). Single source of truth —
 * this formula was previously duplicated inline at the BID button and the
 * bid modal, which could silently drift apart. Mirrors place_bid's check. */
export function minBidFor(l: Pick<MarketListing, 'current_bid' | 'price'>): number {
  return l.current_bid != null
    ? l.current_bid + Math.max(1, Math.ceil(l.current_bid * 0.05))
    : l.price;
}

function defFor(cardId: string): CardDef {
  return (
    POOL_BY_ID[cardId] || {
      id: cardId,
      colors: [],
      name: cardId,
      type: 'Unit' as CardDef['type'],
      rarity: 'Common' as CardDef['rarity'],
    }
  );
}

const LOAD_ERROR = 'Could not load the marketplace. Check your connection and try again.';

export function MarketplaceScreen({ onBack }: { onBack: () => void }) {
  const router = useRouter();
  const {
    session,
    profile,
    collection,
    decks,
    serializedCards,
    refreshProfile,
    refreshCollection,
    cardVariants,
  } = useMeta();
  const userId = session?.user?.id;
  const [tab, setTab] = useRouteTab<Tab>('market', TABS, 'browse', 'market.tab');
  const [sort, setSort] = usePersistedState<MarketSort>('market.sort', 'ending', isSort);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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
  const [showFilter, setShowFilter] = useState<'all' | 'auctions' | 'fixed' | 'cpu' | 'soon'>(
    'all',
  );
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
      // A successful (often background/realtime) reload clears a previous
      // LOAD failure — one network blip used to pin the banner over fully
      // live data until a manual action. Action errors are left alone.
      setError((e) => (e === LOAD_ERROR ? '' : e));
      const ids = [...new Set([...ls, ...mine].map((l) => l.seller))];
      const profiles = await fetchPublicProfiles(ids);
      if (gen !== reloadGen.current) return;
      setSellers(new Map(profiles.map((p) => [p.id, p])));
    } catch {
      if (gen === reloadGen.current) setError(LOAD_ERROR);
    } finally {
      if (gen === reloadGen.current) setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    (async () => {
      await reload();
    })();
  }, [reload]);

  // Bids, buyouts and expiries land from other players. The 10s tick below
  // only re-renders countdowns off local state — without this the listing rows
  // themselves (current bid, sold, cancelled) stayed frozen until a manual
  // action forced a reload.
  useEffect(() => {
    let timer: number | undefined;
    // S7: one broadcast per statement on the public `market` topic.
    const off = subscribeTopic('market', () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void reload();
      }, 400);
    });
    return () => {
      window.clearTimeout(timer);
      off();
    };
  }, [reload]);

  useEscapeClose(() => setBidFor(null), !!bidFor);

  // Ticks every 10s so auction countdowns ("Xh Ym left") and "ended"
  // states advance on their own instead of freezing at whatever "now" was
  // when the screen mounted — a full minute between ticks left up to 60s
  // where an already-ended auction still showed live BID/BUY buttons.
  // The tick carries the clock itself, so render code (the "ending in 15
  // min" filter) reads time from state instead of calling Date.now().
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 10_000);
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
      // Awaited (not fire-and-forget) so `busy` — and every button gated on
      // it — stays disabled until the refetch actually lands; releasing it
      // immediately let a second action fire against stale listings/bid
      // state (e.g. buying a listing a beat after it had already sold).
      await reload();
      return true;
    } catch {
      setError('Something went wrong — check your connection and try again.');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const browse = sortListings<MarketListing>(listings, sort).filter((l) => {
    const def = defFor(l.card_id);
    if (rarityFilter !== 'All' && (def.rarity || 'Common') !== rarityFilter) return false;
    if (search && !def.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (showFilter === 'auctions' && l.listing_type !== 'auction') return false;
    if (showFilter === 'fixed' && l.listing_type !== 'fixed') return false;
    if (showFilter === 'cpu' && !l.cpu_leading) return false;
    if (
      showFilter === 'soon' &&
      (l.listing_type !== 'auction' || new Date(l.ends_at).getTime() - nowMs > 15 * 60_000)
    )
      return false;
    return true;
  });

  const select = 'px-2 py-1.5 bg-[var(--c-paper)] ink-border-sm font-bold text-xs';

  const listingCard = (
    l: MarketListing,
    mine: boolean,
    size: 'compact' | 'standard' = 'compact',
  ) => {
    const def = defFor(l.card_id);
    const isAuction = l.listing_type === 'auction';
    const sellerName = l.seller === userId ? 'You' : sellers.get(l.seller)?.username || '…';
    const highBidder = l.current_bidder === userId;
    // `status` only flips off 'active' when the listing is re-fetched (which
    // calls settle_expired_listings server-side first) — between fetches, a
    // listing whose countdown has already ticked to "ended" would otherwise
    // still show live, clickable BID/BUY buttons until the next reload.
    const timedOut = timeLeft(l.ends_at) === 'ended';
    // In the activity fetch, not the seller, not leading, and somebody holds
    // the high bid: this is a remembered auction the player has been outbid
    // on (see rememberBidListing) — tag it so the moment is visible instead
    // of the row silently vanishing.
    const outbid =
      isAuction &&
      !highBidder &&
      (l.current_bidder != null || !!l.cpu_leading) &&
      l.seller !== userId &&
      l.status === 'active' &&
      !timedOut &&
      myActivity.some((a) => a.id === l.id);
    // Your own listings and the auctions you hold a bid on stand out from
    // everyone else's: yellow wash + a tag, so they are findable in a long list.
    const hasMyBid = !mine && myActivity.some((a) => a.id === l.id);
    return (
      <div
        key={l.id}
        className={cn(
          'ink-border-md shadow-hard-black-sm flex flex-col',
          mine || hasMyBid ? 'bg-[var(--c-yellow)]/25' : 'bg-[var(--c-paper)]',
        )}
      >
        {/* U46: one status bar along the top — yellow yours, green leading,
            red outbid — instead of a row of same-yellow tags. */}
        {(mine || hasMyBid || outbid) && (
          <div
            data-testid="listing-status"
            className={cn(
              'heading-font fs-xs px-3 py-0.5 border-b-2 border-[var(--c-ink)]',
              outbid
                ? 'bg-[var(--c-red)] text-white'
                : hasMyBid && highBidder
                  ? 'bg-[#22C55E] text-[var(--c-ink)]'
                  : 'bg-[var(--c-yellow)] text-[var(--c-ink)]',
            )}
          >
            {outbid
              ? l.cpu_leading
                ? `OUTBID BY ${(l.cpu_bidder_name ?? 'A CPU').toUpperCase()}`
                : 'OUTBID'
              : mine
                ? 'YOUR LISTING'
                : highBidder
                  ? 'YOUR BID · LEADING'
                  : 'YOUR BID'}
          </div>
        )}
        <div className="p-3 flex gap-3 flex-1">
          <div className="shrink-0">
            <CardFace def={def} size={size} foil={l.foil} variant={asVariant(l.variant)} />
          </div>
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="heading-font text-xs truncate">{def.name}</span>
              <span
                className={cn(
                  'fs-xs font-black px-1',
                  RARITY_CHIP[def.rarity || 'Common'] || RARITY_CHIP.Common,
                )}
              >
                {(def.rarity || 'Common').toUpperCase()}
              </span>
              {l.foil && (
                <span className="fs-xs font-black px-1 bg-[var(--c-ink)] text-[var(--c-yellow)]">
                  FOIL ✦
                </span>
              )}
              {asVariant(l.variant) && (
                <span
                  className="fs-xs font-black px-1 bg-[var(--c-ink)] text-[var(--c-yellow)]"
                  title={VARIANT_META[asVariant(l.variant)!].blurb}
                >
                  ◆ {VARIANT_META[asVariant(l.variant)!].name.toUpperCase()}
                </span>
              )}
              {l.quantity > 1 && <span className="fs-xs font-black">×{l.quantity}</span>}
              {l.graded_id && l.slab_grade != null && (
                <span
                  className="fs-xs font-black px-1 ink-border-sm bg-[var(--c-paper)]"
                  title="A graded slab — the buyer receives the slab itself"
                >
                  SLAB {l.slab_pristine ? 'PRISTINE ' : ''}
                  {Number(l.slab_grade)} · {(l.slab_service ?? '').toUpperCase()}
                </span>
              )}
            </div>
            <div className="fs-xs font-bold text-[var(--c-steel)] mt-0.5">
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
            <div className="flex items-center gap-2 mt-1 fs-xs font-bold">
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
                  <span className="fs-xs font-bold text-[var(--c-steel)]">
                    {l.bid_count ?? 0} bid{(l.bid_count ?? 0) === 1 ? '' : 's'}
                    {highBidder ? ' · YOU LEAD' : ''}
                    {l.cpu_leading && l.cpu_bidder_name ? ' · ' : ''}
                    {l.cpu_leading && l.cpu_bidder_name && (
                      <CpuBidderTag name={l.cpu_bidder_name} />
                    )}
                  </span>
                </>
              ) : (
                <span className="flex items-center gap-1 heading-font text-[11px] bg-[var(--c-yellow)] px-1.5 py-0.5 ink-border-sm">
                  <Coins className="w-3 h-3" /> {fmtCredits(l.price)}
                </span>
              )}
              {isAuction && l.buyout != null && (
                <span className="fs-xs font-bold text-[var(--c-steel)] inline-flex items-center gap-0.5">
                  Buyout <Credits amount={l.buyout} />
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {/* Timed-out-but-unsettled listings show the SETTLING badge for
                the owner too — the CANCEL button previously stayed live here
                and could only error once server-side settlement ran. */}
              {l.status === 'active' && timedOut ? (
                <span className="fs-xs font-black px-1.5 py-1 ink-border-sm self-start bg-[var(--c-steel)] text-[var(--c-paper)]">
                  ENDED — SETTLING…
                </span>
              ) : mine && l.status === 'active' ? (
                <PopButton
                  color="steel"
                  disabled={busy || l.bid_count > 0}
                  onClick={async () => {
                    if (!(await askConfirm('Cancel this listing? Your cards will be returned.')))
                      return;
                    run(() => cancelListing(l.id), 'Listing cancelled — cards returned.');
                  }}
                  title={l.bid_count > 0 ? 'Auctions with bids cannot be cancelled' : undefined}
                >
                  CANCEL LISTING
                </PopButton>
              ) : !mine && l.status === 'active' ? (
                <>
                  {isAuction && (
                    <PopButton
                      color="black"
                      // Already the top bidder: bidding again would only refund
                      // your own hold and re-hold a larger amount against
                      // yourself for no competitive gain. Disable and say so.
                      disabled={busy || !profile || highBidder || timedOut}
                      title={highBidder ? "You're already the top bidder" : undefined}
                      onClick={() => {
                        setBidAmount(minBidFor(l));
                        setBidFor(l);
                      }}
                    >
                      {highBidder ? 'TOP BID ✓' : 'BID ▸'}
                    </PopButton>
                  )}
                  {(l.listing_type === 'fixed' || l.buyout != null) && (
                    <PopButton
                      color="yellow"
                      disabled={
                        busy ||
                        !profile ||
                        timedOut ||
                        profile.credits < (isAuction ? (l.buyout ?? 0) : l.price)
                      }
                      onClick={async () => {
                        const price = isAuction ? (l.buyout ?? 0) : l.price;
                        if (!(await askConfirm(`Buy this listing for ${fmtCredits(price)}?`)))
                          return;
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
                    'fs-xs font-black px-1.5 py-1 ink-border-sm self-start',
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
      </div>
    );
  };

  // Narrow screens: a grid of full listing cards. Wide screens (lg+): a
  // compact, selectable list on the left and the chosen listing in full on the
  // right, so a long list no longer needs a scroll per decision.
  const listPane = (list: MarketListing[], empty: React.ReactNode) => {
    if (list.length === 0)
      return <div className="text-center font-bold text-[var(--c-steel)] py-10">{empty}</div>;
    const active = list.find((l) => l.id === selectedId) ?? list[0];
    return (
      <div className="lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-5 lg:items-start">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:hidden">
          {list.map((l) => listingCard(l, l.seller === userId))}
        </div>
        <div
          className="hidden lg:flex flex-col gap-2 lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto lg:pr-1"
          role="listbox"
          aria-label="Listings"
        >
          {list.map((l) => listingRow(l, l.id === active.id))}
        </div>
        <aside aria-label="Listing details" className="hidden lg:block lg:sticky lg:top-4">
          {listingCard(active, active.seller === userId, 'standard')}
        </aside>
      </div>
    );
  };

  const listingRow = (l: MarketListing, selected: boolean) => {
    const def = defFor(l.card_id);
    const isAuction = l.listing_type === 'auction';
    const mine = l.seller === userId;
    const highBidder = l.current_bidder === userId;
    const hasMyBid = !mine && myActivity.some((a) => a.id === l.id);
    const left = timeLeft(l.ends_at, nowMs);
    return (
      <button
        key={l.id}
        type="button"
        role="option"
        aria-selected={selected}
        onClick={() => setSelectedId(l.id)}
        className={cn(
          'flex items-center gap-3 text-left ink-border-md px-3 py-2',
          selected
            ? 'bg-[var(--c-yellow)] shadow-hard-black-sm'
            : mine || hasMyBid
              ? 'bg-[var(--c-yellow)]/25 shadow-hard-black-xs hover:bg-[var(--c-yellow)]/50'
              : 'bg-[var(--c-paper)] shadow-hard-black-xs hover:bg-[var(--c-yellow)]/30',
        )}
      >
        <span className="min-w-0 flex-1">
          <span className="heading-font fs-sm block truncate">
            {def.name}
            {l.foil ? ' ✦' : ''}
            {asVariant(l.variant) ? ` ◆ ${VARIANT_META[asVariant(l.variant)!].short}` : ''}
            {l.quantity > 1 ? ` ×${l.quantity}` : ''}
          </span>
          <span className="fs-xs font-bold text-[var(--c-steel)] block truncate">
            {(def.rarity || 'Common').toUpperCase()} · {isAuction ? 'AUCTION' : 'FIXED'} · {left}
            {mine
              ? ' · YOUR LISTING'
              : hasMyBid
                ? highBidder
                  ? ' · YOU LEAD'
                  : ' · YOUR BID'
                : ''}
          </span>
        </span>
        <span className="heading-font fs-sm shrink-0 inline-flex items-center gap-1">
          {isAuction ? <Gavel className="w-3 h-3" /> : <Coins className="w-3 h-3" />}
          {fmtCredits(listingPrice(l))}
        </span>
      </button>
    );
  };

  // The realtime reload replaces `listings` with fresh rows, but the modal
  // held the snapshot object passed to `setBidFor` — so a rival bid placed
  // while the modal was open left it quoting the OLD current bid, with PLACE
  // BID enabled against a number `place_bid` was always going to refuse (and
  // a bought-out or expired auction kept a live PLACE BID against a dead
  // listing). Re-derive the live row by id on every render; the snapshot is
  // only the fallback for the frame where a sold row has already left the
  // browse list.
  const bidForLive = bidFor ? (listings.find((x) => x.id === bidFor.id) ?? bidFor) : null;
  // v30 — the bid modal announces itself as `aria-modal` and did nothing to
  // hold the keyboard; Tab walked out of it onto the listing grid behind.
  const bidDialogRef = useFocusTrap<HTMLDivElement>(!!(bidFor && bidForLive));

  const bidForEnded =
    !!bidFor &&
    (!listings.some((x) => x.id === bidFor.id) ||
      bidForLive!.status !== 'active' ||
      timeLeft(bidForLive!.ends_at) === 'ended');
  const minBid = bidForLive ? minBidFor(bidForLive) : 0;
  // A rival bid while the modal is open raises the minimum — lift the
  // pre-filled amount with it rather than leaving a number the button below
  // has just disabled itself against.
  // Idempotent clamp, during render; the case it exists for is the live
  // current bid moving under the modal.
  if (bidFor && !bidForEnded && bidAmount < minBid) setBidAmount(minBid);
  // A bid at or above the buyout is refused server-side: it would let a later
  // buyer take the card for LESS than the standing bid. Buy Now is the move.
  const maxBid = bidForLive?.buyout != null ? bidForLive.buyout - 1 : null;
  const bidOverBuyout = maxBid != null && bidAmount > maxBid;
  const buyoutBlocksBidding = maxBid != null && minBid > maxBid;

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <MetaHeader title="CARD MARKETPLACE" onBack={onBack} />
      <div className="p-5 max-w-6xl mx-auto">
        {/* U44: the two buying surfaces explain each other. */}
        <p className="fs-xs font-bold text-[var(--c-steel)] mb-3">
          Auctions and fixed-price listings from every player.{' '}
          {router ? (
            <button
              type="button"
              className="underline font-black text-[var(--c-ink)]"
              onClick={() => router.navigate('shops')}
            >
              PLAYER SHOPS ▸
            </button>
          ) : (
            'Player Shops'
          )}{' '}
          are storefronts players stock and price themselves.
        </p>
        <Tabs<Tab>
          ariaLabel="Marketplace"
          className="mb-4"
          value={tab}
          onChange={setTab}
          tabs={[
            {
              id: 'browse',
              label: (
                <span className="flex items-center gap-1">
                  <Store className="w-3.5 h-3.5" /> BROWSE
                </span>
              ),
            },
            { id: 'mine', label: 'MY LISTINGS & BIDS' },
            {
              id: 'sell',
              label: (
                <span className="flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5" /> SELL A CARD
                </span>
              ),
            },
          ]}
        />

        {error && (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Notice text={error} />
            {/* A failed INITIAL load used to render this notice above a
                misleading "No active listings match" empty state with no way
                to retry — every sibling screen has an explicit retry path. */}
            <PopButton
              color="yellow"
              onClick={() => {
                setError('');
                setLoading(true);
                void reload();
              }}
            >
              RETRY
            </PopButton>
          </div>
        )}
        {notice && (
          <div className="mb-4">
            <Notice text={notice} kind="success" />
          </div>
        )}
        <p className="fs-xs font-bold text-[var(--c-steel)] mb-4">
          Player-to-player market. Sellers pay a {Math.round(MARKET_FEE * 100)}% credits fee on
          completed sales. Bids in the final 5 minutes extend an auction.
        </p>

        {loading ? (
          <div className="text-center font-bold text-[var(--c-steel)] py-16 animate-pulse">
            LOADING MARKET…
          </div>
        ) : tab === 'browse' ? (
          <>
            <div className="flex flex-wrap items-end gap-2 mb-4">
              <input
                className={cn(
                  select,
                  'w-44 max-w-full min-h-[36px] placeholder:text-[var(--c-steel)]/50',
                )}
                placeholder="Search listings…"
                aria-label="Search listings"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              {/* U45: labelled filters, as in the deck builder. */}
              <FilterSelect
                label="Rarity"
                value={rarityFilter}
                onChange={setRarityFilter}
                options={['All', ...RARITY_ORDER].map((r) => ({ value: r, label: r }))}
              />
              <FilterSelect
                label="Show"
                value={showFilter}
                onChange={(v) => setShowFilter(v as typeof showFilter)}
                options={[
                  { value: 'all', label: 'All listings' },
                  { value: 'auctions', label: 'Auctions' },
                  { value: 'fixed', label: 'Fixed price' },
                  { value: 'cpu', label: 'CPU collector leading' },
                  { value: 'soon', label: 'Ending in 15 min' },
                ]}
              />
              <FilterSelect
                label="Sort"
                value={sort}
                onChange={(v) => setSort(v as MarketSort)}
                options={[
                  { value: 'ending', label: 'Ending soonest' },
                  { value: 'price-asc', label: 'Price: low to high' },
                  { value: 'price-desc', label: 'Price: high to low' },
                ]}
              />
            </div>
            {listings.length >= MARKET_LIST_LIMIT && (
              <p className="text-[11px] font-bold text-[var(--c-steel)] mb-3">
                Showing the {MARKET_LIST_LIMIT} listings ending soonest — search and filters only
                cover these.
              </p>
            )}
            {listPane(
              browse,
              <>
                <p className="mb-3">
                  No active listings match. Clear the filters, or be the first — list a card.
                </p>
                <PopButton color="yellow" onClick={() => setTab('sell')}>
                  SELL A CARD ▸
                </PopButton>
              </>,
            )}
          </>
        ) : tab === 'mine' ? (
          listPane(
            myActivity,
            <>
              <p className="mb-3">You have no listings or bids yet.</p>
              <PopButton color="yellow" onClick={() => setTab('browse')}>
                BROWSE LISTINGS ▸
              </PopButton>
            </>,
          )
        ) : (
          <SellPanel
            userId={userId}
            collection={collection}
            decks={decks}
            serializedCards={serializedCards}
            cardVariants={cardVariants ?? []}
            myListings={myActivity}
            cancelListing={cancelListing}
            onChanged={async () => {
              refreshProfile();
              refreshCollection();
              await reload();
            }}
            onViewListing={(id) => {
              setSelectedId(id);
              setTab('mine');
            }}
          />
        )}
      </div>

      {/* Bid modal */}
      {bidFor && bidForLive && (
        <div
          ref={bidDialogRef}
          tabIndex={-1}
          className="fixed inset-0 bg-[var(--c-ink)]/90 z-50 flex items-center justify-center p-4 outline-none"
          onClick={() => setBidFor(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-[var(--c-paper)] ink-border-md shadow-hard-yellow p-4 w-80 max-w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="heading-font text-sm mb-2">
              BID ON {defFor(bidForLive.card_id).name.toUpperCase()}
            </div>
            <div className="fs-xs font-bold text-[var(--c-steel)] mb-2">
              {bidForEnded ? (
                'This listing has ended — it was bought out, cancelled or expired while this dialog was open.'
              ) : (
                <>
                  {bidForLive.current_bid != null
                    ? `Current bid ${fmtCredits(bidForLive.current_bid)} — minimum raise 5%.`
                    : `Starting bid ${fmtCredits(bidForLive.price)}.`}{' '}
                  Credits are held while you're the top bidder and refunded if outbid.
                  {maxBid != null &&
                    (buyoutBlocksBidding
                      ? ` Bidding is closed — the next raise would meet the ${fmtCredits(bidForLive.buyout!)} buyout, so use BUY instead.`
                      : ` Bids must stay under the ${fmtCredits(bidForLive.buyout!)} buyout.`)}
                </>
              )}
            </div>
            <div className="flex items-center gap-2 mb-3">
              <Coins className="w-4 h-4" />
              <input
                type="number"
                value={bidAmount}
                min={0}
                aria-label="Bid amount"
                onChange={(e) => setBidAmount(Math.max(0, Math.round(Number(e.target.value) || 0)))}
                className="flex-1 min-w-0 px-2 py-1 ink-border-sm font-bold text-sm"
              />
              <span className="fs-xs font-bold text-[var(--c-steel)] shrink-0 inline-flex items-center gap-0.5">
                = <Credits amount={bidAmount} />
              </span>
            </div>
            <div className="flex gap-2 justify-end">
              <PopButton color="steel" onClick={() => setBidFor(null)}>
                CANCEL
              </PopButton>
              <PopButton
                color="yellow"
                disabled={
                  busy ||
                  !profile ||
                  bidForEnded ||
                  profile.credits < bidAmount ||
                  bidAmount < minBid ||
                  bidOverBuyout ||
                  buyoutBlocksBidding
                }
                title={
                  bidForEnded
                    ? 'This listing has ended'
                    : bidAmount < minBid
                      ? `Minimum bid is ${fmtCredits(minBid)}`
                      : bidOverBuyout || buyoutBlocksBidding
                        ? `Bids must stay under the ${fmtCredits(bidForLive.buyout!)} buyout — use BUY`
                        : undefined
                }
                onClick={() => {
                  const l = bidForLive;
                  setBidFor(null);
                  void run(() => placeBid(l.id, bidAmount), 'Bid placed!').then((ok) => {
                    // Remembered so the auction stays in MY LISTINGS & BIDS
                    // (with an OUTBID tag) after a rival takes the high bid —
                    // the schema only stores the CURRENT bidder.
                    if (ok && userId) rememberBidListing(userId, l.id);
                  });
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
