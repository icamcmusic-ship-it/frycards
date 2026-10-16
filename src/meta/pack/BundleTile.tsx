import React, { useState } from 'react';
import { Backpack, Package } from 'lucide-react';
import type { PackType, Profile } from '../../lib/supabase';
import { bundlePrice, type ShopBundle } from '../../lib/storeApi';
import { Credits, PopButton } from '../ui';
import { fmtCredits, fmtVouchers } from '../economy';
import { packCardCount } from '../packodds';
import { PackArt } from './PackArt';
import { packColor, packIconCandidates } from './packArt';

type Currency = 'credits' | 'vouchers';

/** One bundle on the shelf: N sealed packs into My Packs at a fixed price.
 * Shows the full value struck through, a SAVE X% ribbon and the cost per
 * card, all from the server's prices (purchase_bundle charges the same). */
export function BundleTile({
  bundle,
  pack,
  profile,
  busyId,
  dealPct,
  onBuy,
}: {
  key?: React.Key;
  bundle: ShopBundle;
  pack: PackType;
  profile: Profile | null;
  busyId: string | null;
  dealPct?: number;
  onBuy: (bundle: ShopBundle, pack: PackType, currency: Currency) => void;
}) {
  const canCredits = bundle.price_credits != null;
  const canVouchers = bundle.price_vouchers != null;
  const [cur, setCur] = useState<Currency>(canCredits ? 'credits' : 'vouchers');
  const currency: Currency = cur === 'vouchers' && canVouchers ? 'vouchers' : 'credits';
  const p = bundlePrice(bundle, pack, currency, dealPct);
  if (!p) return null;
  const cards = packCardCount(pack) * bundle.pack_qty;
  const wallet = profile ? (currency === 'credits' ? profile.credits : profile.vouchers) : 0;
  const short = profile ? Math.max(0, p.price - wallet) : 0;
  const busy = busyId === `bundle:${bundle.id}`;
  const money = (n: number) =>
    currency === 'credits' ? <Credits amount={n} /> : <span>{fmtVouchers(n)}</span>;

  return (
    <div className="bg-[var(--c-paper)] ink-border-md shadow-hard-black flex flex-col overflow-hidden relative">
      {p.savePct > 0 && <span className="st-ribbon st-ribbon-deal">SAVE {p.savePct}%</span>}
      <div className="flex justify-between items-center px-3 py-1.5 bg-[var(--c-ink)]">
        <span className="heading-font text-[11px] text-[var(--c-yellow)] truncate">
          {bundle.name}
        </span>
      </div>
      <div className="aspect-[77/58] overflow-hidden ink-border-sm m-2 relative bg-[#111]">
        <PackArt
          candidates={packIconCandidates(pack)}
          name={pack.name}
          color={packColor(pack)}
          fit="contain"
        />
        <span className="absolute bottom-1 left-1 bg-[#ffd23f] text-[#111] heading-font fs-xs px-1.5 ink-border-sm flex items-center gap-1">
          <Package className="w-3 h-3" /> ×{bundle.pack_qty} PACKS · {cards} CARDS
        </span>
      </div>
      <p className="text-[11px] font-bold text-[var(--c-steel)] px-3 flex-1">
        {bundle.pack_qty} sealed {pack.name}s, straight into MY PACKS.
      </p>
      <div className="px-3 mt-1 flex flex-wrap items-center gap-x-3 fs-xs font-bold text-[var(--c-steel)]">
        <span className="inline-flex items-center gap-1">
          VALUE <s data-testid="bundle-value">{money(p.value)}</s>
        </span>
        {currency === 'credits' && (
          <span>≈ {fmtCredits(Math.round(p.price / Math.max(1, cards)))} per card</span>
        )}
      </div>
      {canCredits && canVouchers && (
        <div className="px-3 pt-2">
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
        </div>
      )}
      <div className="p-3">
        <PopButton
          color="yellow"
          className="w-full"
          disabled={!profile || short > 0 || !!busyId}
          title={short > 0 ? `Not enough ${currency}` : undefined}
          onClick={() => onBuy(bundle, pack, currency)}
        >
          {busy ? (
            'BUYING…'
          ) : (
            <span className="inline-flex items-center justify-center gap-1 whitespace-nowrap">
              <Backpack className="w-3.5 h-3.5" /> BUY BUNDLE · {money(p.price)}
            </span>
          )}
        </PopButton>
        {short > 0 && (
          <div className="mt-1 text-center fs-xs font-black text-[var(--c-steel)]">
            {currency === 'credits' ? fmtCredits(short) : fmtVouchers(short)} SHORT
          </div>
        )}
      </div>
    </div>
  );
}
