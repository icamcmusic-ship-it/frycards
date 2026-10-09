/**
 * Weekly Set Completion Bingo (AUDIT-2026-10-06 §4 mini-game 3).
 *
 * The card, the per-cell checks and the payouts all live on the server
 * (`get_bingo` / `claim_bingo`, migration 20261007000003): this panel only
 * draws what it is told and asks to claim. Cells are judged live against the
 * player's collection, so opening packs, trading and grading fill the card.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
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
  /** Monday (UTC) the card belongs to. Absent only on a server older than the
   * migration, in which case the stale-card check is skipped. */
  week_start?: string;
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
}

/** True when the card now on the server is a different week's card than the
 * one on screen (the Monday UTC reset happened while the panel was open). */
export function cardRolledOver(shown: string | undefined, fresh: string | undefined): boolean {
  return !!shown && !!fresh && shown !== fresh;
}

/** "3d 4h" / "5h 12m" / "9m" until `resetsAt`; "0m" once it has passed. */
export function fmtUntilReset(resetsAt: string, now: number): string {
  const mins = Math.max(0, Math.ceil((new Date(resetsAt).getTime() - now) / 60_000));
  if (Number.isNaN(mins)) return '—';
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${mins % 60}m` : `${mins}m`;
}

/** Warn about unclaimed lines when the card resets within this window. */
export const RESET_WARN_MS = 24 * 3_600_000;

/** Longest delay setTimeout accepts; a longer one fires immediately. */
const MAX_TIMEOUT_MS = 2_147_483_647;

/**
 * Lines that are exactly ONE square short of complete, with the missing
 * square — the "so close" hint. Lines already complete are not listed.
 */
export function nearMissLines(done: boolean[]): { line: number; cell: number }[] {
  const out: { line: number; cell: number }[] = [];
  BINGO_LINES.forEach((cells, line) => {
    const missing = cells.filter((c) => !done[c]);
    if (missing.length === 1) out.push({ line, cell: missing[0] });
  });
  return out;
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
  // Ticks each 30s so the reset countdown and the "claim before reset" warning
  // stay current without another fetch.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  /** Reads the card; null (with `error` set) when there is nothing usable. */
  const fetchCard = useCallback(async (): Promise<BingoState | null> => {
    const { data, error } = await supabase.rpc('get_bingo');
    if (error) {
      setError(error.message);
      return null;
    }
    // No card back (offline preview, or an older server): say so instead
    // of crashing on d.resets_at.
    if (!data) {
      setError('Bingo is not available right now — try again shortly.');
      return null;
    }
    setError('');
    return data as BingoState;
  }, []);

  const load = useCallback(async () => {
    const card = await fetchCard();
    if (card) setState(card);
    return card;
  }, [fetchCard]);
  useEffect(() => {
    void load();
  }, [load]);

  // Reload by itself when the Monday reset passes: a panel left open over the
  // reset would otherwise keep showing (and claiming against) the old card.
  // Re-armed for each card, re-armed again if the (clamped) delay woke early,
  // and cleared on unmount. `lostRef` remembers how many lines were still
  // unclaimed so the message can say what the reset cost.
  const lostRef = useRef(0);
  const pendingNow = state
    ? state.lines.filter((l) => !state.claimed.includes(l)).length +
      (state.blackout && !state.blackout_claimed ? 1 : 0)
    : 0;
  useEffect(() => {
    lostRef.current = pendingNow;
  }, [pendingNow]);
  const resetsAt = state?.resets_at;
  useEffect(() => {
    if (!resetsAt) return;
    const at = new Date(resetsAt).getTime();
    if (Number.isNaN(at)) return;
    let timer: number | undefined;
    const arm = () => {
      timer = window.setTimeout(
        () => {
          if (Date.now() < at) return arm();
          const lost = lostRef.current;
          setNotice(
            `A new weekly bingo card has started.${lost > 0 ? ` ${lost} unclaimed line${lost === 1 ? '' : 's'} on last week’s card could no longer be claimed.` : ''}`,
          );
          void load();
        },
        Math.min(MAX_TIMEOUT_MS, Math.max(0, at - Date.now()) + 1_500),
      );
    };
    arm();
    return () => window.clearTimeout(timer);
  }, [resetsAt, load]);

  const claim = async (line: number) => {
    if (!state) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      // Claims are keyed by line number only, so a claim sent after the weekly
      // reset would land on the NEW card. Re-read the card first and refuse to
      // claim if the week has changed under the player.
      const fresh = await fetchCard();
      if (!fresh) return;
      if (cardRolledOver(state.week_start, fresh.week_start)) {
        setState(fresh);
        setNotice(
          'The weekly reset happened while this page was open — you are looking at the new card now. Lines left unclaimed on last week’s card could not be claimed.',
        );
        return;
      }
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
    } catch {
      setError('Something went wrong — check your connection and try again.');
    } finally {
      setBusy(false);
    }
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
  const blackoutOpen = state.blackout && !state.blackout_claimed;
  const inClaimedLine = new Set(state.claimed.flatMap((l) => BINGO_LINES[l]));
  const doneCount = state.done.filter(Boolean).length;
  const untilReset = fmtUntilReset(state.resets_at, now);
  const msToReset = new Date(state.resets_at).getTime() - now;
  const pendingClaims = unclaimed.length + (blackoutOpen ? 1 : 0);
  const nearMiss = nearMissLines(state.done).filter((n) => !state.lines.includes(n.line));
  const nearCells = new Set(nearMiss.map((n) => n.cell));

  return (
    <div>
      <p className="fs-xs font-bold text-[var(--c-steel)] mb-3 max-w-2xl">
        A new card every Monday (UTC). Each square is a collection goal and fills itself the moment
        you own what it asks for — open packs, trade, grade. Every completed row, column or diagonal
        pays {fmtCredits(state.line_reward)} credits; fill the whole card for{' '}
        {fmtCredits(state.blackout_reward)} credits and {state.blackout_vouchers} vouchers.{' '}
        <span className="text-[var(--c-ink)]">
          {doneCount}/25 squares · resets in {untilReset}.
        </span>
      </p>
      {pendingClaims > 0 && msToReset > 0 && msToReset <= RESET_WARN_MS && (
        <div className="mb-3">
          <Notice
            text={`${pendingClaims} unclaimed reward${pendingClaims === 1 ? '' : 's'} — claim ${pendingClaims === 1 ? 'it' : 'them'} within ${untilReset}; the card resets then and unclaimed lines are lost.`}
          />
        </div>
      )}
      {error && <Notice text={error} />}
      {notice && <Notice text={notice} kind="success" />}

      <div
        className="grid grid-cols-5 gap-1 sm:gap-1.5 max-w-xl mb-4"
        role="grid"
        aria-label="Bingo card"
      >
        {state.cells.map((c, i) => {
          const done = state.done[i];
          const near = !done && nearCells.has(i);
          return (
            <div
              key={i}
              role="gridcell"
              aria-label={`${c.label}${done ? ', done' : ''}${near ? ', one square from a line' : ''}`}
              className={cn(
                'aspect-square ink-border-sm p-1 flex items-center justify-center text-center leading-tight break-words',
                'fs-xs font-black',
                c.kind === 'free'
                  ? 'bg-[var(--c-ink)] text-[var(--c-yellow)] heading-font'
                  : done
                    ? inClaimedLine.has(i)
                      ? 'bg-[var(--c-steel)] text-[var(--c-paper)]'
                      : 'bg-[var(--c-yellow)] text-[var(--c-ink)]'
                    : 'bg-[var(--c-paper)] text-[var(--c-steel)]',
                near && 'text-[var(--c-ink)] bg-[var(--c-yellow)]/20',
              )}
              style={near ? { borderStyle: 'dashed' } : undefined}
            >
              <span>
                {done && c.kind !== 'free' && <span aria-hidden>✓ </span>}
                {c.label}
              </span>
            </div>
          );
        })}
      </div>

      {nearMiss.length > 0 && (
        <ul className="mb-4 fs-xs font-bold text-[var(--c-ink)] max-w-xl list-disc pl-5">
          {nearMiss.slice(0, 3).map((n) => (
            <li key={n.line}>
              <span className="heading-font">{lineName(n.line)}</span> is one square away —{' '}
              {state.cells[n.cell].label}.
            </li>
          ))}
          {nearMiss.length > 3 && (
            <li className="text-[var(--c-steel)]">
              …and {nearMiss.length - 3} more line{nearMiss.length - 3 === 1 ? '' : 's'} one square
              short (dashed squares).
            </li>
          )}
        </ul>
      )}

      <div className="flex flex-wrap gap-2 items-center">
        {unclaimed.map((l) => (
          <PopButton key={l} color="yellow" disabled={busy} onClick={() => void claim(l)}>
            CLAIM {lineName(l).toUpperCase()} · {fmtCredits(state.line_reward)}
          </PopButton>
        ))}
        {blackoutOpen && (
          <PopButton color="black" disabled={busy} onClick={() => void claim(12)}>
            CLAIM BLACKOUT · {fmtCredits(state.blackout_reward)} +{state.blackout_vouchers} VOUCHERS
          </PopButton>
        )}
        {unclaimed.length === 0 && !blackoutOpen && (
          <span className="fs-xs font-bold text-[var(--c-steel)]">
            {state.claimed.length > 0
              ? `${state.claimed.length} line${state.claimed.length === 1 ? '' : 's'} claimed this week.`
              : 'Complete a row, column or diagonal to claim.'}
          </span>
        )}
      </div>
    </div>
  );
}
