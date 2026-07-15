import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { Coins, Ticket, TrendingUp } from 'lucide-react';
import { useMeta } from './MetaContext';
import { fmtCredits, fmtVouchers } from './economy';
import { fetchCardMarketValue } from '../lib/supabase';

/** Comic-pop button used across all meta screens. */
export function PopButton({
  children,
  onClick,
  disabled,
  color = 'yellow',
  className,
  title,
}: {
  key?: React.Key;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  color?: 'yellow' | 'black' | 'red' | 'steel';
  className?: string;
  title?: string;
}) {
  const palette = {
    yellow: 'bg-[var(--c-yellow)] text-[var(--c-ink)]',
    black: 'bg-[var(--c-ink)] text-[var(--c-yellow)]',
    red: 'bg-[var(--c-red)] text-[var(--c-paper)]',
    steel: 'bg-[var(--c-steel)] text-[var(--c-paper)]',
  }[color];
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'btn-pop heading-font text-xs px-4 py-2 ink-border-sm shadow-hard-black-xs transition-colors',
        palette,
        disabled && 'opacity-40 cursor-not-allowed',
        className,
      )}
    >
      {children}
    </button>
  );
}

/** Credits — the base currency. Stored as a plain integer credit count, shown
 * as a bare number next to the Coins glyph — no "$" is used anywhere in this app. */
export function CreditChip({ amount }: { amount: number }) {
  return (
    <span className="flex items-center gap-1 bg-[var(--c-yellow)] text-[var(--c-ink)] px-2 py-0.5 ink-border-sm heading-font text-xs">
      <Coins className="w-3.5 h-3.5" /> {fmtCredits(amount)}
    </span>
  );
}

/** Inline "coin glyph + amount" — the standalone equivalent of CreditChip's
 * number for use inline in running text/buttons instead of a "$" prefix. */
export function Credits({ amount, className }: { amount: number | null | undefined; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      <Coins className="w-3 h-3 shrink-0" /> {fmtCredits(amount)}
    </span>
  );
}

/** Vouchers — the premium currency (plain integer). */
export function VoucherChip({ amount }: { amount: number }) {
  return (
    <span className="flex items-center gap-1 bg-[var(--c-steel)] text-[var(--c-paper)] px-2 py-0.5 ink-border-sm heading-font text-xs">
      <Ticket className="w-3.5 h-3.5" /> {fmtVouchers(amount)}
    </span>
  );
}

/**
 * Player-market value popup for the expanded card viewer (outside actual
 * gameplay only — never render this in GameV4). Hidden until a card has at
 * least 5 completed player-market sales, per the blended quicksell + auction
 * average computed server-side by get_card_market_value.
 */
export function CardMarketValuePanel({ cardId, foil }: { cardId: string; foil?: boolean }) {
  const [value, setValue] = useState<{ sales: number; avg_price: number | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setValue(null);
    fetchCardMarketValue(cardId, !!foil).then((v) => {
      if (!cancelled) setValue(v);
    });
    return () => {
      cancelled = true;
    };
  }, [cardId, foil]);

  if (!value) return null;
  return (
    <div className="bg-[var(--c-paper)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs p-3 w-[240px]">
      <div className="heading-font text-xs mb-1 flex items-center gap-1">
        <TrendingUp className="w-3.5 h-3.5" /> MARKET VALUE
      </div>
      {value.avg_price != null ? (
        <div className="text-[13px] font-bold flex items-center gap-1">
          <Coins className="w-3.5 h-3.5" /> {fmtCredits(value.avg_price)}
          <span className="text-[9px] font-bold text-[var(--c-steel)] ml-1">
            avg · {value.sales} sale{value.sales === 1 ? '' : 's'}
          </span>
        </div>
      ) : (
        <div className="text-[10px] font-bold text-[var(--c-steel)]">
          Not enough player-market sales yet ({value.sales}/5)
        </div>
      )}
    </div>
  );
}

/** Top bar with title, wallet and navigation back to the menu. */
export function MetaHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const { profile } = useMeta();
  return (
    <div className="sticky top-0 z-30 flex items-center justify-between gap-3 bg-[var(--c-ink)] px-4 py-2.5 border-b-4 border-[var(--c-ink)]">
      <div className="flex items-center gap-3">
        <PopButton onClick={onBack} color="yellow">
          &lt; MENU
        </PopButton>
        <h1 className="heading-font text-xl text-[var(--c-yellow)]">{title}</h1>
      </div>
      {profile && (
        <div className="flex items-center gap-2">
          <CreditChip amount={profile.credits} />
          <VoucherChip amount={profile.vouchers} />
        </div>
      )}
    </div>
  );
}

/** Generic progress bar used by battle pass, achievements, missions, level. */
export function ProgressBar({
  value,
  max,
  className,
  barClassName,
}: {
  value: number;
  max: number;
  className?: string;
  barClassName?: string;
}) {
  const pct = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className={cn('h-2.5 ink-border-sm bg-[var(--c-ink)]/10 overflow-hidden', className)}>
      <div
        className={cn('h-full bg-[var(--c-yellow)] transition-all', barClassName)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/** Cumulative XP required to reach a level — mirror of xp_for_level in SQL. */
export function xpForLevel(level: number): number {
  return 50 * (level - 1) * level;
}

/** Level badge + XP-to-next-level bar, driven by the profile row. */
export function LevelBadge({
  level,
  xp,
  compact = false,
}: {
  level: number;
  xp: number;
  compact?: boolean;
}) {
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return (
    <div className="flex items-center gap-2">
      <span className="bg-[var(--c-red)] text-[var(--c-paper)] heading-font text-xs px-2 py-0.5 ink-border-sm">
        LV {level}
      </span>
      {!compact && (
        <div className="flex flex-col gap-0.5 w-28">
          <ProgressBar value={xp - cur} max={next - cur} className="h-1.5" />
          <span className="text-[8px] font-bold text-[var(--c-steel)] leading-none">
            {xp - cur}/{next - cur} XP TO LV {level + 1}
          </span>
        </div>
      )}
    </div>
  );
}

/** Small toast-style error/success line. */
export function Notice({ text, kind = 'error' }: { text: string; kind?: 'error' | 'success' }) {
  if (!text) return null;
  return (
    <div
      className={cn(
        'text-xs font-bold px-3 py-1.5 ink-border-sm inline-block',
        kind === 'error'
          ? 'bg-[var(--c-red)] text-[var(--c-paper)]'
          : 'bg-[var(--c-yellow)] text-[var(--c-ink)]',
      )}
    >
      {text}
    </div>
  );
}
