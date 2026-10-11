/**
 * Store building blocks (STORE_AND_PACKS_PROPOSAL A1-A3, A10, B1, B2, B4, B6,
 * B7): the storefront hero, the one-action pack tile and the "what's inside"
 * preview. Lives with the lazily loaded Store chunk.
 */
import React, { useMemo, useState } from 'react';
import { Backpack, ChevronLeft, ChevronRight, Package, Percent } from 'lucide-react';
import type { PackType, PlayerCard, Profile } from '../../lib/supabase';
import { dealPrice, msToUtcMidnight, type StorePack } from '../../lib/storeApi';
import { POOL } from '../../game/poker/cardpool';
import { CardFace } from '../../components/CardFaceV4';
import { PopButton, Credits, Vouchers } from '../ui';
import { cn } from '../../lib/utils';
import { RARITY_CHIP, RARITY_HEX, rarityTier } from '../rarity';
import { fmtCredits, fmtVouchers } from '../economy';
import {
  expectedRarities,
  packBlurb,
  packCardCount,
  packChaseRarities,
  packGuarantee,
  packGuaranteeBadge,
} from '../packodds';
import { PackArt } from './PackArt';
import { heroArtUrl, packColor, packIconCandidates, packWrapperCandidates } from './packArt';

type Currency = 'credits' | 'vouchers';

/** "3D", "5H", "40M" until a timestamp; null when past. */
export function leavingIn(until: string | null | undefined, now: number): string | null {
  if (!until) return null;
  const ms = new Date(until).getTime() - now;
  if (!(ms > 0)) return null;
  const h = ms / 3_600_000;
  if (h >= 24) return `${Math.floor(h / 24)}D`;
  if (h >= 1) return `${Math.floor(h)}H`;
  return `${Math.max(1, Math.floor(ms / 60_000))}M`;
}

export function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h}h ${String(m).padStart(2, '0')}m`;
}

/** Cards a pack can drop: its sets, and its colours when it's a colour pack. */
export function packPool(pack: StorePack) {
  const sets = pack.allowed_sets?.length ? new Set(pack.allowed_sets) : null;
  const colors = pack.allowed_colors?.length ? new Set(pack.allowed_colors) : null;
  return POOL.filter(
    (c) =>
      c.type !== 'Leader' &&
      (!sets || (c.set && sets.has(c.set))) &&
      (!colors || c.colors.some((k) => colors.has(k))),
  );
}

// ---------------------------------------------------------------------------
// Hero (A1 + B1)
// ---------------------------------------------------------------------------
export function StoreHero({
  pack,
  dealPct,
  now,
  onOpen,
  onInside,
}: {
  pack: StorePack;
  dealPct?: number;
  now: number;
  onOpen: () => void;
  onInside: () => void;
}) {
  const leaving = leavingIn(pack.available_until, now);
  const campaign = leaving ? pack.name : dealPct ? 'daily_deal' : pack.name;
  const [heroOk, setHeroOk] = useState(true);
  const price = dealPrice(pack.price_credits, dealPct);
  return (
    <section
      className="st-hero ink-border-md shadow-hard-black mb-5"
      aria-label="Featured"
      style={{ ['--pk' as string]: packColor(pack) }}
    >
      <div className="st-hero-fallback" aria-hidden />
      {heroOk && (
        <picture>
          <source media="(max-width: 640px)" srcSet={heroArtUrl(campaign, true)} />
          <img
            src={heroArtUrl(campaign)}
            alt=""
            onError={() => setHeroOk(false)}
            className="absolute inset-0 w-full h-full object-cover"
          />
        </picture>
      )}
      <div className="relative flex items-center gap-3 sm:gap-6 p-3 sm:p-5">
        <div className="w-24 sm:w-36 shrink-0 aspect-[77/96] ink-border-md overflow-hidden rotate-[-4deg] bg-[#111]">
          <PackArt
            candidates={packWrapperCandidates(pack)}
            name={pack.name}
            color={packColor(pack)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <div className="heading-font fs-xs text-[#ffd23f] tracking-widest">
            {leaving
              ? `LIMITED · LEAVING IN ${leaving}`
              : dealPct
                ? `TODAY'S DEAL · ${dealPct}% OFF`
                : 'FEATURED'}
          </div>
          <div className="heading-font text-lg sm:text-3xl leading-tight text-white">
            {pack.name.toUpperCase()}
          </div>
          <p className="fs-xs sm:text-sm font-bold text-white/80 mt-1 line-clamp-2">
            {packBlurb(pack)}
          </p>
          <div className="fs-xs font-mono font-bold text-white/70 mt-1">
            {dealPct ? `Deal refreshes in ${fmtCountdown(msToUtcMidnight(now))}` : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            <PopButton color="yellow" onClick={onOpen}>
              {price != null ? (
                <span className="inline-flex items-center gap-1 whitespace-nowrap">
                  BUY & OPEN ▸
                  {dealPct && pack.price_credits != null && (
                    <s className="opacity-60">{fmtCredits(pack.price_credits)}</s>
                  )}
                  <Credits amount={price} />
                </span>
              ) : (
                'BUY & OPEN ▸'
              )}
            </PopButton>
            <button
              type="button"
              onClick={onInside}
              className="fs-xs font-black text-white underline underline-offset-2 min-h-10 px-1"
            >
              WHAT&apos;S INSIDE?
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Pack tile (A3): one BUY & OPEN, currency toggle, ×1/×5/×10 stepper.
// ---------------------------------------------------------------------------
export function PackTile({
  variants,
  profile,
  busyId,
  dealPct,
  now,
  onBuy,
  onBuyBulk,
  onSaveForLater,
  onViewOdds,
  bulkCap,
}: {
  key?: React.Key;
  variants: StorePack[];
  profile: Profile | null;
  busyId: string | null;
  dealPct?: (packId: string) => number | undefined;
  now: number;
  onBuy: (pack: PackType, currency: Currency) => void;
  onBuyBulk: (pack: PackType, count: number, currency: Currency) => void;
  onSaveForLater: (pack: PackType, currency: Currency) => void;
  onViewOdds: (pack: PackType) => void;
  bulkCap: (pack: PackType) => number;
}) {
  const [idx, setIdx] = useState(0);
  const grouped = variants.length > 1;
  const pack = variants[Math.min(idx, variants.length - 1)];
  const pct = dealPct?.(pack.id);
  const canCredits = pack.price_credits != null;
  const canVouchers = pack.price_vouchers != null && pack.price_vouchers > 0;
  const [cur, setCur] = useState<Currency>(canCredits ? 'credits' : 'vouchers');
  const currency: Currency =
    cur === 'vouchers' && canVouchers ? 'vouchers' : canCredits ? 'credits' : 'vouchers';
  const [qty, setQty] = useState(1);
  const unit =
    dealPrice(currency === 'credits' ? pack.price_credits : pack.price_vouchers, pct) ?? 0;
  const baseUnit = (currency === 'credits' ? pack.price_credits : pack.price_vouchers) ?? 0;
  const total = unit * qty;
  const wallet = profile ? (currency === 'credits' ? profile.credits : profile.vouchers) : 0;
  const short = profile ? Math.max(0, total - wallet) : 0;
  const busyKey = qty === 1 ? pack.id : `bulk:${pack.id}:${qty}`;
  const busy = busyId === busyKey;
  const leaving = leavingIn(pack.available_until, now);
  const badge = packGuaranteeBadge(pack);
  const badgeRarity = packGuarantee(pack) ?? 'Common';
  const cards = packCardCount(pack);
  const perCard = cards > 0 && currency === 'credits' ? Math.round(unit / cards) : null;
  const saveBusy = busyId === `inv:${pack.id}:${currency}`;
  const money = (n: number) =>
    currency === 'credits' ? <Credits amount={n} /> : <Vouchers amount={n} />;
  // ×5/×10 clamped to what one reveal can hold (a 49-card box stops at ×5).
  const qtyOptions = [1, 5, 10].filter((n) => n === 1 || n <= bulkCap(pack));

  return (
    <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black flex flex-col overflow-hidden relative">
      {leaving ? (
        <span className="st-ribbon">LEAVING IN {leaving}</span>
      ) : pct ? (
        <span className="st-ribbon st-ribbon-deal">-{pct}% TODAY</span>
      ) : null}
      <div className="flex justify-between items-center px-3 py-1.5 bg-[var(--c-ink)]">
        <span className="heading-font text-[11px] text-[var(--c-yellow)] truncate">
          {pack.name}
        </span>
        {!leaving && !pct && (
          <span className="fs-xs font-mono font-bold text-[var(--c-paper)] uppercase shrink-0">
            {(pack.pack_tier || 'standard').replace(/_/g, ' ')}
          </span>
        )}
      </div>
      <div className="aspect-[77/58] overflow-hidden ink-border-sm m-2 relative bg-[#111]">
        <PackArt
          candidates={packIconCandidates(pack)}
          name={pack.name}
          color={packColor(pack)}
          fit="contain"
        />
        <span className="absolute bottom-1 left-1 bg-[#ffd23f] text-[#111] heading-font fs-xs px-1.5 ink-border-sm flex items-center gap-1">
          <Package className="w-3 h-3" /> {cards} CARDS
        </span>
        {badge && (
          <span
            className={cn(
              'absolute bottom-1 right-1 heading-font fs-xs px-1.5 ink-border-sm',
              RARITY_CHIP[badgeRarity] || RARITY_CHIP.Common,
            )}
          >
            {badge}
          </span>
        )}
        {grouped && (
          <div className="absolute inset-x-0 top-1 flex items-center justify-between px-1">
            <button
              onClick={() => setIdx((i) => (i - 1 + variants.length) % variants.length)}
              className="w-10 h-10 flex items-center justify-center bg-[var(--c-ink)]/80 text-[var(--c-paper)] ink-border-sm"
              aria-label="Previous set"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setIdx((i) => (i + 1) % variants.length)}
              className="w-10 h-10 flex items-center justify-center bg-[var(--c-ink)]/80 text-[var(--c-paper)] ink-border-sm"
              aria-label="Next set"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>
      {/* A4: generated from slot_config, never hand-written. */}
      <p className="text-[11px] font-bold text-[var(--c-steel)] px-3 flex-1">{packBlurb(pack)}</p>
      <div className="px-3 mt-1 flex flex-wrap items-center gap-x-3 fs-xs font-bold text-[var(--c-steel)]">
        {perCard != null && <span>≈ {fmtCredits(perCard)} per card</span>}
        <button
          onClick={() => onViewOdds(pack)}
          className="py-2 flex items-center gap-1 fs-xs font-black text-[var(--c-steel)] underline decoration-2 underline-offset-2 hover:text-[var(--c-ink)]"
        >
          <Percent className="w-3 h-3" /> WHAT&apos;S INSIDE · ODDS
        </button>
      </div>

      <div className="px-3 pt-1 flex flex-wrap items-center justify-between gap-2">
        {canCredits && canVouchers ? (
          <div className="st-seg" role="group" aria-label="Pay with">
            <button
              type="button"
              aria-pressed={currency === 'credits'}
              onClick={() => setCur('credits')}
            >
              CREDITS
            </button>
            <button
              type="button"
              aria-pressed={currency === 'vouchers'}
              onClick={() => setCur('vouchers')}
            >
              VOUCHERS
            </button>
          </div>
        ) : (
          <span />
        )}
        {qtyOptions.length > 1 && (
          <div className="st-seg" role="group" aria-label="Quantity">
            {qtyOptions.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={qty === n}
                aria-label={`${n} pack${n === 1 ? '' : 's'}`}
                onClick={() => setQty(n)}
              >
                ×{n}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-3 pb-1.5">
        <PopButton
          color="yellow"
          className="w-full"
          disabled={!profile || short > 0 || !!busyId}
          title={short > 0 ? `Not enough ${currency}` : undefined}
          onClick={() => (qty === 1 ? onBuy(pack, currency) : onBuyBulk(pack, qty, currency))}
        >
          {busy ? (
            'OPENING…'
          ) : total === 0 ? (
            'OPEN · FREE'
          ) : (
            <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap">
              {qty === 1 ? 'BUY & OPEN' : `BUY & OPEN ${qty}`} ·
              {pct ? <s className="opacity-60">{baseUnit * qty}</s> : null}
              {money(total)}
            </span>
          )}
        </PopButton>
        {short > 0 && (
          <div className="mt-1 flex items-center justify-center gap-0.5 fs-xs font-black text-[var(--c-steel)]">
            {currency === 'credits' ? <Credits amount={short} /> : fmtVouchers(short)} SHORT
          </div>
        )}
      </div>
      {/* Secondary: keep it sealed in My Packs. */}
      <button
        type="button"
        disabled={!profile || !!busyId || wallet < unit}
        onClick={() => onSaveForLater(pack, currency)}
        className="mx-3 mb-3 min-h-10 flex items-center justify-center gap-1 fs-xs font-black text-[var(--c-steel)] underline decoration-2 underline-offset-2 hover:text-[var(--c-ink)] disabled:opacity-40 disabled:no-underline"
      >
        <Backpack className="w-3 h-3" />
        {saveBusy ? 'BUYING…' : <>OR SAVE 1 FOR LATER · {money(unit)}</>}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// What's inside (A10 + B6 + B7)
// ---------------------------------------------------------------------------
export function WhatsInside({
  pack,
  collection,
  wishlist,
}: {
  pack: StorePack;
  collection: PlayerCard[];
  wishlist: Set<string>;
}) {
  const pool = useMemo(() => packPool(pack), [pack]);
  const chase = useMemo(() => {
    const tiers = new Set(packChaseRarities(pack));
    return pool
      .filter((c) => c.rarity && tiers.has(c.rarity))
      .sort((a, b) => rarityTier(b.rarity) - rarityTier(a.rarity) || a.id.localeCompare(b.id))
      .slice(0, 6);
  }, [pool, pack]);
  const owned = useMemo(
    () => new Set(collection.filter((c) => c.quantity + c.foil_quantity > 0).map((c) => c.card_id)),
    [collection],
  );
  const have = pool.filter((c) => owned.has(c.id)).length;
  const wished = pool.filter((c) => wishlist.has(c.id)).length;
  const expected = expectedRarities(pack);
  const total = expected.reduce((s, [, n]) => s + n, 0) || 1;

  return (
    <div className="mb-4">
      {chase.length > 0 && (
        <div
          className="relative h-[130px] mb-3 flex justify-center overflow-hidden"
          aria-label="Chase cards"
        >
          {chase.map((c, i) => {
            const mid = (chase.length - 1) / 2;
            const off = i - mid;
            return (
              <div
                key={c.id}
                className="absolute top-2"
                style={{
                  transform: `translateX(${off * 40}px) rotate(${off * 7}deg) scale(0.62)`,
                  transformOrigin: 'top center',
                  zIndex: 10 - Math.abs(Math.round(off)),
                }}
              >
                <CardFace def={c} size="compact" />
              </div>
            );
          })}
        </div>
      )}
      <div className="heading-font text-[11px] mb-1">EXPECTED MIX PER PACK</div>
      <div className="st-odds-bar mb-1" role="img" aria-label="Expected rarity mix">
        {expected.map(([r, n]) => (
          <span
            key={r}
            title={`${r}: ~${n.toFixed(2)}`}
            style={{
              width: `${(n / total) * 100}%`,
              background: RARITY_HEX[r] || RARITY_HEX.Common,
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0.5 fs-xs font-bold text-[var(--c-steel)] mb-2">
        {expected.map(([r, n]) => (
          <span key={r} className="inline-flex items-center gap-1">
            <span
              className="inline-block w-2 h-2 ink-border-sm"
              style={{ background: RARITY_HEX[r] || RARITY_HEX.Common }}
            />
            {r} {n >= 0.1 ? n.toFixed(1) : `${(n * 100).toFixed(1)}%`}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="ink-border-sm p-2 bg-[var(--c-paper)]">
          <div className="heading-font text-[11px]">YOU OWN</div>
          <div className="heading-font text-lg leading-tight">
            {have}/{pool.length}
          </div>
          <div className="h-1.5 bg-[var(--c-ink)]/10 mt-1">
            <div
              className="h-full bg-[var(--c-steel)]"
              style={{ width: `${pool.length ? (have / pool.length) * 100 : 0}%` }}
            />
          </div>
        </div>
        <div className="ink-border-sm p-2 bg-[var(--c-paper)]">
          <div className="heading-font text-[11px]">WISHLIST</div>
          <div className="heading-font text-lg leading-tight">♥ {wished}</div>
          <div className="fs-xs font-bold text-[var(--c-steel)]">
            {wished === 1 ? 'wishlisted card can drop' : 'wishlisted cards can drop'}
          </div>
        </div>
      </div>
    </div>
  );
}
