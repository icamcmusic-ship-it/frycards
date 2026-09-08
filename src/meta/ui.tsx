import React, { useEffect, useState } from 'react';
import { cn } from '../lib/utils';
import { AlertTriangle, Coins, Ticket, TrendingUp } from 'lucide-react';
import { useMeta } from './MetaContext';
import { fmtCredits, fmtVouchers } from './economy';
import { fetchCardMarketValue } from '../lib/supabase';
import { CARD_SIZES } from '../components/CardFaceV4';

/** Comic-pop button used across all meta screens. */
export function PopButton({
  children,
  onClick,
  disabled,
  color = 'yellow',
  className,
  title,
  ariaLabel,
  ariaPressed,
}: {
  key?: React.Key;
  children: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  color?: 'yellow' | 'black' | 'red' | 'steel';
  className?: string;
  title?: string;
  /** Accessible name for icon-only buttons whose `children` is just a glyph
   * (e.g. the Deck Builder delete button) — without it screen readers
   * announce a bare "button". */
  ariaLabel?: string;
  /** For PopButtons acting as on/off toggles (OWNED ONLY, HIDDEN/VISIBLE) —
   * conveys the pressed state to screen readers. */
  ariaPressed?: boolean;
}) {
  const palette = {
    yellow: 'bg-[var(--c-yellow)] text-[var(--c-ink)]',
    black: 'bg-[var(--c-ink)] text-[var(--c-yellow)]',
    red: 'bg-[var(--c-red)] text-[var(--c-paper)]',
    steel: 'bg-[var(--c-steel)] text-[var(--c-paper)]',
  }[color];
  return (
    <button
      // Never submit an enclosing <form> — PopButtons are always plain
      // actions (e.g. AuthScreen's SIGN IN / CREATE ACCOUNT mode toggles sit
      // inside the auth form; without this they defaulted to type="submit"
      // and fired the browser's required-field validation on a mere toggle).
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={ariaLabel}
      aria-pressed={ariaPressed}
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
      <Coins className="w-3.5 h-3.5" aria-hidden /> {fmtCredits(amount)}
      <span className="sr-only">credits</span>
    </span>
  );
}

/** Inline "coin glyph + amount" — the standalone equivalent of CreditChip's
 * number for use inline in running text/buttons instead of a "$" prefix. */
export function Credits({
  amount,
  className,
}: {
  amount: number | null | undefined;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      <Coins className="w-3 h-3 shrink-0" aria-hidden /> {fmtCredits(amount)}
      <span className="sr-only">credits</span>
    </span>
  );
}

/** Inline "ticket glyph + amount" — the voucher counterpart of `Credits`, for
 * running text and buttons that quote a voucher price. */
export function Vouchers({
  amount,
  className,
}: {
  amount: number | null | undefined;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      <Ticket className="w-3 h-3 shrink-0" aria-hidden /> {fmtVouchers(amount)}
      <span className="sr-only">vouchers</span>
    </span>
  );
}

/** Vouchers — the premium currency (plain integer). */
export function VoucherChip({ amount }: { amount: number }) {
  return (
    <span className="flex items-center gap-1 bg-[var(--c-steel)] text-[var(--c-paper)] px-2 py-0.5 ink-border-sm heading-font text-xs">
      <Ticket className="w-3.5 h-3.5" aria-hidden /> {fmtVouchers(amount)}
      <span className="sr-only">vouchers</span>
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
  // The fetched value is stored WITH the key it was fetched for, rather than
  // being cleared by a `setValue(null)` in the effect body. That reset ran
  // synchronously on every card the player opened, so each market-value
  // lookup cost an extra render pass before the request had even been sent
  // (react-hooks/set-state-in-effect). Keying the state instead makes the
  // stale value unreadable during render at zero render cost.
  const key = `${cardId}|${foil ? 'foil' : 'normal'}`;
  const [state, setState] = useState<{
    key: string;
    value: { sales: number; avg_price: number | null } | null;
  }>({ key, value: null });

  useEffect(() => {
    let cancelled = false;
    fetchCardMarketValue(cardId, !!foil).then(
      (v) => {
        if (!cancelled) setState({ key: `${cardId}|${foil ? 'foil' : 'normal'}`, value: v });
      },
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [cardId, foil]);

  // A value fetched for a different card is treated as not-yet-loaded.
  const value = state.key === key ? state.value : null;
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
    <div className="sticky top-0 z-30 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 bg-[var(--c-ink)] px-4 py-2.5 border-b-4 border-[var(--c-ink)]">
      <div className="flex items-center gap-3 min-w-0">
        <PopButton onClick={onBack} color="yellow">
          &lt; MENU
        </PopButton>
        <h1 className="heading-font text-xl text-[var(--c-yellow)] truncate">{title}</h1>
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
  ariaLabel,
}: {
  value: number;
  max: number;
  className?: string;
  barClassName?: string;
  /** Accessible name for the bar (e.g. "Battle pass progress"). */
  ariaLabel?: string;
}) {
  // Clamped at BOTH ends: a negative value (reachable when the server's
  // level/xp pair runs ahead of the client's xpForLevel mirror) produced an
  // invalid negative CSS width and an aria-valuenow below aria-valuemin.
  const pct = max > 0 ? Math.min(100, Math.max(0, Math.round((value / max) * 100))) : 0;
  return (
    <div
      className={cn('h-2.5 ink-border-sm bg-[var(--c-ink)]/10 overflow-hidden', className)}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.min(Math.max(0, value), max)}
    >
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

/**
 * XP earned INTO the current level, and the size of that level's band.
 *
 * `ProgressBar` has clamped a negative `value` since the pass that noticed the
 * server's level/xp pair can run ahead of this client-side mirror (a level-up
 * lands in `profiles` before the xp write this session sees, and the two are
 * read independently). The two TEXT labels beside those bars were never given
 * the same treatment, so the exact state the bar was hardened against printed
 * as `-2400/1200 XP TO LEVEL 13` — a negative numerator next to a bar sitting
 * correctly at zero. Both readouts go through here now, so the clamp cannot be
 * applied to one and forgotten on the other.
 */
export function levelProgress(level: number, xp: number): { into: number; band: number } {
  const cur = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const band = Math.max(1, next - cur);
  return { into: Math.min(band, Math.max(0, xp - cur)), band };
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
  const { into, band } = levelProgress(level, xp);
  return (
    <div className="flex items-center gap-2">
      <span className="bg-[var(--c-red)] text-[var(--c-paper)] heading-font text-xs px-2 py-0.5 ink-border-sm">
        LV {level}
      </span>
      {!compact && (
        <div className="flex flex-col gap-0.5 w-28">
          <ProgressBar
            value={into}
            max={band}
            className="h-1.5"
            ariaLabel={`XP toward level ${level + 1}`}
          />
          <span className="text-[8px] font-bold text-[var(--c-steel)] leading-none">
            {into}/{band} XP TO LV {level + 1}
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
      // Errors interrupt (assertive); success confirmations wait their turn.
      role={kind === 'error' ? 'alert' : 'status'}
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

/**
 * Placeholder for a showcase slot whose card id no longer resolves to
 * anything in the live pool.
 *
 * ProfileScreen, CollectionScreen and PlayerProfileModal all used to render
 * `if (!def) return null` here. That is the worst possible handling of the
 * case: the slot is still occupied server-side and still counts toward the
 * 6-card cap, but the player sees an unexplained gap with no way to act on
 * it — the same "silent nothing" shape as the showcase lock-out this shipped
 * alongside (see the 2026-09-08 migration). A visible tile that names the
 * problem and, where the viewer owns the profile, offers the unpin, is the
 * difference between a recoverable state and a dead slot.
 */
export function UnavailableShowcaseTile({
  cardId,
  size = 'standard',
  onUnpin,
}: {
  key?: React.Key;
  cardId: string;
  size?: 'compact' | 'standard';
  /** Own-profile views pass this to render the tile as an unpin button. */
  onUnpin?: () => void;
}) {
  const { w, h } = CARD_SIZES[size];
  const body = (
    <>
      <AlertTriangle
        className={size === 'compact' ? 'w-5 h-5' : 'w-7 h-7'}
        aria-hidden
        strokeWidth={2.5}
      />
      <span
        className={cn(
          'heading-font leading-tight',
          size === 'compact' ? 'text-[9px]' : 'text-[11px]',
        )}
      >
        CARD UNAVAILABLE
      </span>
      <span
        className={cn(
          'font-bold text-[var(--c-steel)] break-all leading-tight',
          size === 'compact' ? 'text-[7px]' : 'text-[8px]',
        )}
      >
        {cardId}
      </span>
      {onUnpin && (
        <span
          className={cn(
            'heading-font bg-[var(--c-red)] text-[var(--c-paper)] px-1.5 py-0.5 ink-border-sm',
            size === 'compact' ? 'text-[8px]' : 'text-[9px]',
          )}
        >
          ★ UNPIN
        </span>
      )}
    </>
  );
  const shell = cn(
    'flex flex-col items-center justify-center gap-1 text-center px-1.5',
    'bg-[var(--c-paper)] ink-border-md shadow-hard-black-sm text-[var(--c-ink)]',
  );
  if (onUnpin) {
    return (
      <button
        type="button"
        onClick={onUnpin}
        style={{ width: w, height: h }}
        className={cn(shell, 'btn-pop')}
        aria-label={`Unpin unavailable showcase card ${cardId}`}
      >
        {body}
      </button>
    );
  }
  return (
    <div style={{ width: w, height: h }} className={shell} role="img" aria-label="Card unavailable">
      {body}
    </div>
  );
}
