/**
 * The one reward-submission path (AUDIT A20 / B2).
 *
 * A finished match's result is sent at once. When the server answers
 * `too_early` (the match beat its wall-clock floor) it says how long to wait
 * (`retryAfterMs`); the result is held and re-sent with the SAME ticket. The
 * pending ticket + result is kept in localStorage so a reload (or leaving
 * the table) still submits it: `resumePendingResult` runs at app start.
 *
 * Unrewarded modes (replays, pasted decks, the daily table, practice) never
 * reach this module.
 */
import {
  recordMatchPlacement,
  type MatchResult,
  type MatchResultStatus,
  type MatchStats,
} from '../lib/supabase';
import { withTimeout } from '../lib/utils';
import type { ModeId } from '../game/poker/constants';

const KEY = 'frycards:pending-result';
/** One reward round-trip gets this long before it counts as a failed attempt. */
const ATTEMPT_MS = 20_000;
/** Longest a `too_early` result is held (the Deep 6-seat floor is 20 min). */
export const MAX_HOLD_MS = 21 * 60 * 1000;
/** A stored result older than this is dropped (the ticket has expired). */
const STALE_MS = 6 * 60 * 60 * 1000;

export interface PendingResult {
  matchId: string | null;
  place: number;
  seats: number;
  mode: ModeId;
  hands?: number;
  stats?: MatchStats;
  /** When it was first stored (ms epoch). */
  at: number;
  /** When the server said it will pay (ms epoch), if it asked us to wait. */
  dueAt?: number;
}

export type SubmitOutcome =
  | { kind: 'paid'; data: MatchResult }
  | { kind: 'refused'; status: MatchResultStatus }
  | { kind: 'unknown' }
  | { kind: 'failed' };

export function loadPending(): PendingResult | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as PendingResult;
    if (!p || typeof p.place !== 'number' || Date.now() - p.at > STALE_MS) {
      localStorage.removeItem(KEY);
      return null;
    }
    return p;
  } catch {
    return null;
  }
}

export function savePending(p: PendingResult): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* storage off: the in-memory retry still runs */
  }
}

export function clearPending(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** "m:ss" until `until` (ms epoch). */
export function holdLabel(until: number, now = Date.now()): string {
  const sec = Math.max(0, Math.ceil((until - now) / 1000));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

let inFlight: Promise<SubmitOutcome> | null = null;
/** True while a submission is running in this page (the boot resume skips). */
export const submitting = () => inFlight !== null;

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

/**
 * Send `p`, waiting out one `too_early` hold (reported through `onHold`, null
 * when it ends), with a couple of quick retries for network errors. The
 * stored copy is cleared once the server gives a final answer.
 */
export function submitResult(
  p: PendingResult,
  onHold: (until: number | null) => void = () => {},
): Promise<SubmitOutcome> {
  savePending(p);
  const run = async (): Promise<SubmitOutcome> => {
    let holdUsed = false;
    if (p.dueAt && p.dueAt > Date.now()) {
      holdUsed = true;
      onHold(p.dueAt);
      await sleep(p.dueAt - Date.now());
      onHold(null);
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await sleep(1500);
      const r = await withTimeout(
        recordMatchPlacement(p.place, p.seats, p.mode, p.matchId ?? undefined, {
          stats: p.stats,
          hands: p.hands,
        }),
        ATTEMPT_MS,
        { data: null, error: 'timed out', status: null, retryable: false, retryAfterMs: null },
      );
      if (r.retryable && r.retryAfterMs !== null && r.retryAfterMs <= MAX_HOLD_MS && !holdUsed) {
        holdUsed = true;
        const dueAt = Date.now() + r.retryAfterMs + 1000;
        savePending({ ...p, dueAt });
        onHold(dueAt);
        await sleep(dueAt - Date.now());
        onHold(null);
        attempt = -1;
        continue;
      }
      if (r.status) {
        clearPending();
        return { kind: 'refused', status: r.status };
      }
      if (r.data) {
        clearPending();
        return { kind: 'paid', data: r.data };
      }
      if (!r.error) {
        clearPending();
        return attempt > 0 ? { kind: 'unknown' } : { kind: 'refused', status: 'invalid' };
      }
    }
    // Keep the stored copy: the next app start tries again.
    return { kind: 'failed' };
  };
  inFlight = run().finally(() => {
    inFlight = null;
  });
  return inFlight;
}
