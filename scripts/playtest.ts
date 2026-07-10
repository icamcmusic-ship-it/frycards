/**
 * Comprehensive real-engine playtest harness.
 * Round-robins all deckable leader pairings with the CPU driving both sides,
 * then reports leader win rates (±95% CI), per-keyword win-rate deltas,
 * per-card usage, new casting mechanics (xCost / sacrifice), game length,
 * deckouts and stalls.
 *
 * Usage: npm run playtest -- [gamesPerPairingPerSide] [--seed=N]
 *   default: 30 games per pairing per side, seed 12345.
 */
// --- Deterministic seeding: override Math.random with mulberry32 BEFORE the
// engine/AI are exercised (they call Math.random directly at call time).
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const cliArgs = process.argv.slice(2);
const seedArg = cliArgs.find((a) => a.startsWith('--seed='));
const SEED = seedArg ? parseInt(seedArg.split('=')[1], 10) : 12345;
globalThis.Math.random = mulberry32(SEED);

import { initialGameState, gameReducer } from '../src/game/engine';
import { getCPUAction } from '../src/game/ai';
import { getDeckableLeaders, parseKeyword } from '../src/game/cards';
import { KEYWORD_GLOSSARY } from '../src/game/keywords';
import { GameCard, GameState, PlayerState } from '../src/types';

const positional = cliArgs.filter((a) => !a.startsWith('--'));
const GAMES_PER_SIDE = parseInt(positional[0] || '30', 10);
const MAX_ACTIONS = 2000;

// ---------------------------------------------------------------------------
// Per-game outcome extraction
// ---------------------------------------------------------------------------

interface PlayerOutcome {
  leader: string;
  won: boolean;
  /** template ids of non-leader cards that were seen in play (fielded/cast). */
  playedTemplates: Set<string>;
  /** keywords (base name) fielded via at least one played card. */
  keywords: Set<string>;
  usedXCost: boolean;
  usedSacrifice: boolean;
}

interface GameOutcome {
  players: PlayerOutcome[];
  turns: number;
  stalled: boolean;
  deckout: boolean;
  errors: string[];
}

/** Every zone that proves a card left the deck/hand and hit the table. */
function playedCards(p: PlayerState): GameCard[] {
  const out: GameCard[] = [];
  const push = (c: GameCard) => {
    if (c.type === 'Leader') return;
    out.push(c);
    for (const item of c.attachedItems || []) push(item);
  };
  for (const zone of [p.board, p.graveyard, p.charms, p.locations]) {
    for (const c of zone) push(c);
  }
  return out;
}

function runGame(leaders: [string, string], stallLog: string[]): GameOutcome {
  const errors: string[] = [];
  let state: GameState = initialGameState(true, leaders[0], leaders[1]);
  state.players[state.player1Id].isCPU = true;
  state = gameReducer(state, { type: 'START_GAME' });

  let actions = 0;
  let stuckCount = 0;
  while (state.phase !== 'GAME_OVER' && actions < MAX_ACTIONS) {
    const act = getCPUAction(state);
    if (!act) {
      errors.push(`AI returned no action in phase ${state.phase} (turn ${state.turnNumber})`);
      break;
    }
    const before = JSON.stringify({
      p: state.phase,
      l: state.log.length,
      t: state.turnNumber,
      c: state.combat?.attackers.length ?? -1,
      b: state.combat?.blockers.length ?? -1,
    });
    state = gameReducer(state, act);
    const after = JSON.stringify({
      p: state.phase,
      l: state.log.length,
      t: state.turnNumber,
      c: state.combat?.attackers.length ?? -1,
      b: state.combat?.blockers.length ?? -1,
    });
    if (before === after) {
      stuckCount++;
      if (stuckCount > 5) {
        errors.push(
          `AI stuck repeating no-op ${act.type} in phase ${state.phase} (turn ${state.turnNumber})`,
        );
        break;
      }
    } else stuckCount = 0;
    actions++;
  }
  const stalled = state.phase !== 'GAME_OVER';
  if (actions >= MAX_ACTIONS) {
    stallLog.push(`${leaders[0]} vs ${leaders[1]} hit the ${MAX_ACTIONS}-action cap`);
  }

  let deckout = false;
  if (state.winner) {
    const loser = state.winner === 'p1' ? 'p2' : 'p1';
    const tail = state.log.slice(-6).join(' | ');
    if (state.players[loser].deck.length === 0 && /deckout/.test(tail)) deckout = true;
  }

  const players: PlayerOutcome[] = [];
  for (const pid of ['p1', 'p2'] as const) {
    const p = state.players[pid];
    if (!p) continue;
    const cards = playedCards(p);
    const keywords = new Set<string>();
    const playedTemplates = new Set<string>();
    let usedXCost = false;
    let usedSacrifice = false;
    for (const c of cards) {
      playedTemplates.add(c.id);
      if (c.xCost) usedXCost = true;
      if (c.sacrifice) usedSacrifice = true;
      for (const kw of c.keywords || []) {
        const { name } = parseKeyword(kw);
        if (KEYWORD_GLOSSARY[name]) keywords.add(name);
      }
    }
    // Leader-innate keywords (Command, Boost, Sustain, Codex, ...) are live
    // every game that Leader is in play — playedCards() deliberately skips
    // the Leader card itself (it isn't "cast"), so credit them separately or
    // every Leader-only keyword reads as permanently unfielded.
    for (const kw of p.leader.keywords || []) {
      const { name } = parseKeyword(kw);
      if (KEYWORD_GLOSSARY[name]) keywords.add(name);
    }
    players.push({
      leader: pid === 'p1' ? leaders[0] : leaders[1],
      won: !stalled && state.winner === pid,
      playedTemplates,
      keywords,
      usedXCost,
      usedSacrifice,
    });
  }
  return { players, turns: state.turnNumber, stalled, deckout, errors };
}

// ---------------------------------------------------------------------------
// Aggregation
// ---------------------------------------------------------------------------

interface WinTally {
  wins: number;
  games: number;
}
const tally = (m: Record<string, WinTally>, key: string, won: boolean) => {
  const t = (m[key] ??= { wins: 0, games: 0 });
  t.games++;
  if (won) t.wins++;
};
const pct = (t: WinTally | undefined) => (t && t.games ? (t.wins / t.games) * 100 : NaN);
const ci95 = (t: WinTally) => {
  const p = t.wins / t.games;
  return 196 * Math.sqrt((p * (1 - p)) / t.games); // in percent
};

const leaders = getDeckableLeaders();
const pairs: [string, string][] = [];
for (let i = 0; i < leaders.length; i++)
  for (let j = i + 1; j < leaders.length; j++) pairs.push([leaders[i], leaders[j]]);

const leaderTally: Record<string, WinTally> = {};
const kwWith: Record<string, WinTally> = {};
const kwWithout: Record<string, WinTally> = {};
const cardPlays: Record<string, WinTally> = {};
const mechWith: Record<string, WinTally> = {};
const mechWithout: Record<string, WinTally> = {};
const stallLog: string[] = [];
let totalGames = 0;
let erroredGames = 0;
let stalledGames = 0;
let deckouts = 0;
let drawGames = 0;
let totalTurns = 0;

const start = Date.now();
for (const pair of pairs) {
  for (let g = 0; g < GAMES_PER_SIDE * 2; g++) {
    const [l1, l2] = g % 2 === 0 ? pair : [pair[1], pair[0]];
    totalGames++;
    let res: GameOutcome;
    try {
      res = runGame([l1, l2], stallLog);
    } catch (err) {
      erroredGames++;
      console.error(`GAME (${l1} vs ${l2}) THREW:`, err);
      continue;
    }
    if (res.errors.length) {
      erroredGames++;
      console.error(`GAME (${l1} vs ${l2}) FAILED: ${res.errors[0]}`);
      continue;
    }
    totalTurns += res.turns;
    if (res.stalled) stalledGames++;
    if (res.deckout) deckouts++;
    const anyWin = res.players.some((p) => p.won);
    if (!anyWin) drawGames++;
    for (const p of res.players) {
      // Stalled games count as losses for both — they still inform balance.
      tally(leaderTally, p.leader, p.won);
      for (const kw of Object.keys(KEYWORD_GLOSSARY)) {
        tally(p.keywords.has(kw) ? kwWith : kwWithout, kw, p.won);
      }
      for (const t of p.playedTemplates) tally(cardPlays, t, p.won);
      tally(p.usedXCost ? mechWith : mechWithout, 'xCost', p.won);
      tally(p.usedSacrifice ? mechWith : mechWithout, 'sacrifice', p.won);
    }
  }
}
const elapsed = ((Date.now() - start) / 1000).toFixed(1);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

const okGames = totalGames - erroredGames;
console.log(`\n=== PLAYTEST REPORT ===`);
console.log(
  `seed=${SEED}  ${okGames}/${totalGames} games completed in ${elapsed}s ` +
    `(${pairs.length} pairings x ${GAMES_PER_SIDE * 2} games)`,
);
console.log(
  `avg turns: ${(totalTurns / Math.max(1, okGames)).toFixed(1)}  ` +
    `deckouts: ${deckouts}  stalls(turn-cap): ${stalledGames}  draws: ${drawGames}  errors: ${erroredGames}`,
);
if (stallLog.length) {
  console.log('Stalled pairings:');
  for (const s of stallLog) console.log('  - ' + s);
}

console.log(`\n--- Leader win rates (95% CI) ---`);
const byWr = [...leaders].sort((a, b) => pct(leaderTally[b]) - pct(leaderTally[a]));
for (const l of byWr) {
  const t = leaderTally[l] ?? { wins: 0, games: 0 };
  const ci = t.games ? ci95(t).toFixed(1) : '—';
  console.log(
    `  ${l.padEnd(28)} ${pct(t).toFixed(1).padStart(5)}% ±${ci}%  (${t.wins}/${t.games})`,
  );
}

console.log(`\n--- Keyword win-rate deltas (fielded vs not, sorted by |delta|) ---`);
interface KwRow {
  kw: string;
  withP: number;
  withoutP: number;
  delta: number;
  nWith: number;
}
const kwRows: KwRow[] = [];
for (const kw of Object.keys(KEYWORD_GLOSSARY)) {
  const w = kwWith[kw];
  const wo = kwWithout[kw];
  if (!w || !wo || w.games === 0 || wo.games === 0) continue;
  const withP = pct(w);
  const withoutP = pct(wo);
  kwRows.push({ kw, withP, withoutP, delta: withP - withoutP, nWith: w.games });
}
kwRows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
console.log(`  ${'keyword'.padEnd(16)}${'with%'.padStart(8)}${'w/o%'.padStart(8)}${'delta'.padStart(8)}${'n(with)'.padStart(9)}`);
for (const r of kwRows) {
  console.log(
    `  ${r.kw.padEnd(16)}${r.withP.toFixed(1).padStart(7)}%${r.withoutP.toFixed(1).padStart(7)}%` +
      `${(r.delta >= 0 ? '+' : '') + r.delta.toFixed(1)}%`.padStart(8) +
      `${r.nWith}`.padStart(9),
  );
}
const neverFielded = Object.keys(KEYWORD_GLOSSARY).filter((kw) => !kwWith[kw]?.games);
if (neverFielded.length)
  console.log(`  never fielded in any game: ${neverFielded.join(', ')}`);

console.log(`\n--- New casting mechanics ---`);
for (const mech of ['xCost', 'sacrifice']) {
  const w = mechWith[mech];
  const wo = mechWithout[mech];
  if (!w?.games) {
    console.log(`  ${mech}: never used`);
    continue;
  }
  const d = pct(w) - pct(wo ?? { wins: 0, games: 0 });
  console.log(
    `  ${mech.padEnd(10)} used in ${w.games} player-games  win% ${pct(w).toFixed(1)} vs ${pct(wo).toFixed(1)} without  (delta ${(d >= 0 ? '+' : '') + d.toFixed(1)}%)`,
  );
}

console.log(`\n--- Card usage (times played across all player-games, win% when played) ---`);
const cardRows = Object.entries(cardPlays).sort((a, b) => b[1].games - a[1].games);
const fmtCard = ([id, t]: [string, WinTally]) =>
  `  ${id.padEnd(34)} plays=${String(t.games).padStart(4)}  win%=${pct(t).toFixed(1)}`;
console.log(`  Top 15 by usage:`);
for (const row of cardRows.slice(0, 15)) console.log(fmtCard(row));
console.log(`  Bottom 15 by usage:`);
for (const row of cardRows.slice(-15)) console.log(fmtCard(row));

process.exit(erroredGames > 0 ? 1 : 0);
