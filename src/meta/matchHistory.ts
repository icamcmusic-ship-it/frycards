/**
 * A local record of finished matches, keyed by the seed that produced them.
 *
 * Finding 2.5 asked for match persistence, replay, and attachable bug reports,
 * and named the stored RNG seed (finding 1.5) as the thing that unlocks the
 * last two. This is that half: every finished match writes seed + decks +
 * outcome, so a player can quote an exact match in a bug report and a future
 * replay viewer has something to replay FROM.
 *
 * What this deliberately is NOT: mid-match resume. Serialising a live
 * `GameState` means serialising a function (`rng`), an interactive callback
 * (`chooseShed`) and every card instance's identity — and restoring it means
 * restoring the RNG's internal position, which mulberry32 does not expose. The
 * honest route to resume is the action log the server-authoritative reducer
 * introduces (PVP_DESIGN): seed + ordered actions replays to any point, and
 * the same log is the replay viewer. That is a reducer-refactor change, not a
 * localStorage one, and pretending otherwise would ship a resume that silently
 * diverges from the match the player left.
 */
import { winRatePct } from '../lib/utils';

export const MATCH_HISTORY_KEY = 'frycards:match-history';
/** Rolling window. Enough to find "the one from earlier", small enough to
 * never be the reason localStorage fills up. */
export const MATCH_HISTORY_LIMIT = 50;

export interface MatchRecord {
  /** The seed the match ran on — with the action log it replays exactly. */
  seed: number;
  /** Epoch ms the match finished. */
  finishedAt: number;
  /** Finished first. */
  won: boolean;
  /** Finishing place (1 = winner) and table size. Absent on records from the
   * retired MTG-style game, which were always two-player win/loss. */
  place?: number;
  seats?: number;
  mode?: 'quick' | 'standard' | 'deep';
  /** Hands played. */
  hands?: number;
  /** The match ended on the hard clock (stacks ranked) rather than a bust-out. */
  capped?: boolean;
  humanLabel: string;
  /** The other seats' names, joined. */
  cpuLabel: string;
  /** The human's deck as a deck code, when it was a saved deck. */
  humanDeck?: string;
  /** The human's final stack in chips (older entries were saved in chip units). */
  finalStack?: number;
  // -- Retired-game fields, still read from old records --
  turns?: number;
  firstPlayer?: 'P1' | 'P2';
  cpuDeck?: string;
  humanVitality?: number;
  cpuVitality?: number;
}

/** A record's finishing place; old two-player records are 1st or 2nd. */
export function placeOf(r: MatchRecord): number {
  return r.place ?? (r.won ? 1 : 2);
}

export function loadMatchHistory(): MatchRecord[] {
  if (typeof window === 'undefined') return [];
  let raw: string | null;
  try {
    raw = window.localStorage.getItem(MATCH_HISTORY_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Hand-edited or half-written storage must not crash the game-over screen.
    return parsed.filter(
      (r): r is MatchRecord =>
        !!r && typeof r.seed === 'number' && typeof r.finishedAt === 'number',
    );
  } catch {
    return [];
  }
}

export function recordMatch(record: MatchRecord): void {
  if (typeof window === 'undefined') return;
  const next = [record, ...loadMatchHistory()].slice(0, MATCH_HISTORY_LIMIT);
  try {
    window.localStorage.setItem(MATCH_HISTORY_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked or full — the match still finished normally */
  }
}

// ---------------------------------------------------------------------------
// Reading the history back
// ---------------------------------------------------------------------------

export interface HistorySummary {
  games: number;
  /** First-place finishes. */
  wins: number;
  /** Whole-percent win rate that never rounds up to 100 (see `winRatePct`). */
  winPct: number;
  /** Average finishing place (0 when there are no games). */
  avgPlace: number;
  /** Newest first, finishing places, at most 10. */
  form: number[];
  /** Per human deck: records grouped by deck code (or label), most-played first. */
  byDeck: { key: string; label: string; games: number; wins: number; avgPlace: number }[];
}

export function summarizeMatchHistory(records: MatchRecord[]): HistorySummary {
  const decks = new Map<
    string,
    { key: string; label: string; games: number; wins: number; places: number }
  >();
  let wins = 0;
  let places = 0;
  for (const r of records) {
    const place = placeOf(r);
    places += place;
    if (place === 1) wins++;
    const key = r.humanDeck ?? `label:${r.humanLabel}`;
    const d = decks.get(key) ?? { key, label: r.humanLabel, games: 0, wins: 0, places: 0 };
    d.games++;
    d.places += place;
    if (place === 1) d.wins++;
    decks.set(key, d);
  }
  const avg = (sum: number, n: number) => (n ? Math.round((sum / n) * 10) / 10 : 0);
  return {
    games: records.length,
    wins,
    winPct: winRatePct(wins, records.length),
    avgPlace: avg(places, records.length),
    form: records.slice(0, 10).map(placeOf),
    byDeck: [...decks.values()]
      .map((d) => ({
        key: d.key,
        label: d.label,
        games: d.games,
        wins: d.wins,
        avgPlace: avg(d.places, d.games),
      }))
      .sort((a, b) => b.games - a.games || a.avgPlace - b.avgPlace),
  };
}

const MODE_LABEL = { quick: 'Quick', standard: 'Standard', deep: 'Deep' } as const;

/**
 * A plain-text report of one match, ready to paste into a bug report or a chat:
 * place, seed, mode and the deck code. With the seed a developer can rebuild
 * the same shuffles, seats and bots.
 */
export function formatMatchReport(r: MatchRecord): string {
  const place = placeOf(r);
  const seats = r.seats ?? 2;
  const lines = [
    r.place !== undefined
      ? `Fry Cards Poker — ${ordinalOf(place)} of ${seats}${r.mode ? ` · ${MODE_LABEL[r.mode]}` : ''}${r.hands ? ` · ${r.hands} hands` : ''}${r.capped ? ' · ended on the clock' : ''}`
      : `Fry Cards match (retired game) — ${r.won ? 'WIN' : 'LOSS'}${r.turns ? ` in ${r.turns} turns` : ''}`,
    `Seed: ${r.seed}`,
    `Finished: ${new Date(r.finishedAt).toISOString()}`,
  ];
  if (r.finalStack !== undefined) lines.push(`Final stack: ${r.finalStack} chips`);
  lines.push(`Your deck: ${r.humanLabel}`);
  if (r.humanDeck) lines.push(r.humanDeck);
  lines.push(`Table: ${r.cpuLabel}`);
  if (r.cpuDeck) lines.push(r.cpuDeck);
  return lines.join('\n');
}

export function ordinalOf(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}
