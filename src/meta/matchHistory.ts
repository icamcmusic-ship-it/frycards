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
