/**
 * Weekly Set Completion Bingo (AUDIT-2026-10-06 §4 mini-game 3).
 *
 * The card, the per-cell checks and the payouts all live on the server
 * (`get_bingo` / `claim_bingo`, migration 20261007000003): this panel only
 * draws what it is told and asks to claim. Cells are judged live against the
 * player's collection, so opening packs, trading and grading fill the card.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { PopButton, Notice } from './ui';
import { cn } from '../lib/utils';
import { fmtCredits } from './economy';
import { useMeta } from './MetaContext';

interface BingoCell {
  kind: string;
  label: string;
}
interface BingoState {
  resets_at: string;
  cells: BingoCell[];
  done: boolean[];
  lines: number[];
  claimed: number[];
  blackout: boolean;
  blackout_claimed: boolean;
  line_reward: number;
  blackout_reward: number;
  blackout_vouchers: number;
  /** Whole days to the reset, worked out when the card was fetched. */
  resetDays: number;
}

/** Row, column and diagonal membership, matching the server's bingo_lines(). */
export const BINGO_LINES: number[][] = [
  ...[0, 1, 2, 3, 4].map((r) => [0, 1, 2, 3, 4].map((c) => r * 5 + c)),
  ...[0, 1, 2, 3, 4].map((c) => [0, 1, 2, 3, 4].map((r) => r * 5 + c)),
  [0, 6, 12, 18, 24],
  [4, 8, 12, 16, 20],
];
export function lineName(i: number): string {
  if (i < 5) return `Row ${i + 1}`;
  if (i < 10) return `Column ${i - 4}`;
  return i === 10 ? 'Diagonal ↘' : 'Diagonal ↙';
}

export function BingoPanel() {
  const { refreshProfile } = useMeta();
  const [state, setState] = useState<BingoState | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_bingo');
    if (error) setError(error.message);
    else {
      setError('');
      const d = data as BingoState;
      setState({
        ...d,
        resetDays: Math.max(
          0,
          Math.ceil((new Date(d.resets_at).getTime() - Date.now()) / 86_400_000),
        ),
      });
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const claim = async (line: number) => {
    setBusy(true);
    setError('');
    setNotice('');
    const { data, error } = await supabase.rpc('claim_bingo', { p_line: line });
    if (error) setError(error.message);
    else {
      const r = data as { credits: number; vouchers: number };
      setNotice(
        `${line === 12 ? 'BLACKOUT!' : `${lineName(line)} claimed`} +${fmtCredits(r.credits)} credits${r.vouchers ? `, +${r.vouchers} vouchers` : ''}.`,
      );
      await refreshProfile();
    }
    await load();
    setBusy(false);
  };

  if (!state)
    return error ? (
      <Notice text={error} />
    ) : (
      <div className="text-center font-bold text-[var(--c-steel)] py-16 animate-pulse">
        LOADING…
      </div>
    );

  const unclaimed = state.lines.filter((l) => !state.claimed.includes(l));
  const inClaimedLine = new Set(state.claimed.flatMap((l) => BINGO_LINES[l]));
  const doneCount = state.done.filter(Boolean).length;
  const resetDays = state.resetDays;

  return (
    <div>
      <p className="text-[11px] font-bold text-[var(--c-steel)] mb-3 max-w-2xl">
        A new card every Monday (UTC). Each square is a collection goal and fills itself the moment
        you own what it asks for — open packs, trade, grade. Every completed row, column or diagonal
        pays {fmtCredits(state.line_reward)} credits; fill the whole card for{' '}
        {fmtCredits(state.blackout_reward)} credits and {state.blackout_vouchers} vouchers.{' '}
        <span className="text-[var(--c-ink)]">
          {doneCount}/25 squares · resets in {resetDays}d.
        </span>
      </p>
      {error && <Notice text={error} />}
      {notice && <Notice text={notice} kind="success" />}

      <div
        className="grid grid-cols-5 gap-1 sm:gap-1.5 max-w-xl mb-4"
        role="grid"
        aria-label="Bingo card"
      >
        {state.cells.map((c, i) => {
          const done = state.done[i];
          return (
            <div
              key={i}
              role="gridcell"
              aria-label={`${c.label}${done ? ', done' : ''}`}
              className={cn(
                'aspect-square ink-border-sm p-1 flex items-center justify-center text-center leading-tight',
                'text-[8px] sm:text-[10px] font-black',
                c.kind === 'free'
                  ? 'bg-[var(--c-ink)] text-[var(--c-yellow)] heading-font'
                  : done
                    ? inClaimedLine.has(i)
                      ? 'bg-[var(--c-steel)] text-[var(--c-paper)]'
                      : 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
                    : 'bg-[var(--c-paper)] text-[var(--c-steel)]',
              )}
            >
              <span>
                {done && c.kind !== 'free' && <span aria-hidden>✓ </span>}
                {c.label}
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        {unclaimed.map((l) => (
          <PopButton key={l} color="red" disabled={busy} onClick={() => void claim(l)}>
            CLAIM {lineName(l).toUpperCase()} · {fmtCredits(state.line_reward)}
          </PopButton>
        ))}
        {state.blackout && !state.blackout_claimed && (
          <PopButton color="black" disabled={busy} onClick={() => void claim(12)}>
            CLAIM BLACKOUT · {fmtCredits(state.blackout_reward)} +{state.blackout_vouchers} VOUCHERS
          </PopButton>
        )}
        {unclaimed.length === 0 && !(state.blackout && !state.blackout_claimed) && (
          <span className="text-[11px] font-bold text-[var(--c-steel)]">
            {state.claimed.length > 0
              ? `${state.claimed.length} line${state.claimed.length === 1 ? '' : 's'} claimed this week.`
              : 'Complete a row, column or diagonal to claim.'}
          </span>
        )}
      </div>
    </div>
  );
}
