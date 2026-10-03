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
  /** The seed `createGame` ran on — the whole point of the record. */
  seed: number;
  /** Epoch ms the match finished. */
  finishedAt: number;
  won: boolean;
  /** Turn count at the end, for a rough sense of the game. */
  turns: number;
  humanLabel: string;
  cpuLabel: string;
  /** Who took the first turn (`firstPlayerForSeed(seed)` for current matches). */
  firstPlayer?: 'P1' | 'P2';
  /** Both decks as deck codes (`FRY1:...`), so the seed can be replayed against
   * them. Absent on records written before this field existed. */
  humanDeck?: string;
  cpuDeck?: string;
  /** Vitality both sides finished on, so a blowout reads as one. */
  humanVitality: number;
  cpuVitality: number;
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
  wins: number;
  /** Whole-percent win rate that never rounds up to 100 (see `winRatePct`). */
  winPct: number;
  /** Newest first, `W` / `L`, at most 10. */
  form: ('W' | 'L')[];
  /** Win rate when going first / second, where the record says which. */
  onPlay: { games: number; wins: number };
  onDraw: { games: number; wins: number };
  /** Per human deck: records grouped by deck code (or label when a record
   * predates deck codes), best-played first. */
  byDeck: { key: string; label: string; games: number; wins: number }[];
}

export function summarizeMatchHistory(records: MatchRecord[]): HistorySummary {
  const onPlay = { games: 0, wins: 0 };
  const onDraw = { games: 0, wins: 0 };
  const decks = new Map<string, { key: string; label: string; games: number; wins: number }>();
  let wins = 0;
  for (const r of records) {
    if (r.won) wins++;
    // The human is always P1's seat in the engine, so going first means P1.
    if (r.firstPlayer) {
      const side = r.firstPlayer === 'P1' ? onPlay : onDraw;
      side.games++;
      if (r.won) side.wins++;
    }
    const key = r.humanDeck ?? `label:${r.humanLabel}`;
    const d = decks.get(key) ?? { key, label: r.humanLabel, games: 0, wins: 0 };
    d.games++;
    if (r.won) d.wins++;
    decks.set(key, d);
  }
  return {
    games: records.length,
    wins,
    winPct: winRatePct(wins, records.length),
    form: records.slice(0, 10).map((r) => (r.won ? 'W' : 'L')),
    onPlay,
    onDraw,
    byDeck: [...decks.values()].sort((a, b) => b.games - a.games || b.wins - a.wins),
  };
}

/**
 * A plain-text report of one match, ready to paste into a bug report or a chat:
 * result, seed, who went first and both deck codes. With the seed and the deck
 * codes a developer can rebuild the same shuffles.
 */
export function formatMatchReport(r: MatchRecord): string {
  const lines = [
    `Fry Cards match — ${r.won ? 'WIN' : 'LOSS'} in ${r.turns} turns`,
    `Seed: ${r.seed}`,
    `Finished: ${new Date(r.finishedAt).toISOString()}`,
  ];
  if (r.firstPlayer) lines.push(`First player: ${r.firstPlayer === 'P1' ? 'you' : 'opponent'}`);
  lines.push(`Final vitality: you ${r.humanVitality}, opponent ${r.cpuVitality}`);
  lines.push(`Your deck: ${r.humanLabel}`);
  if (r.humanDeck) lines.push(r.humanDeck);
  lines.push(`Opponent deck: ${r.cpuLabel}`);
  if (r.cpuDeck) lines.push(r.cpuDeck);
  return lines.join('\n');
}
