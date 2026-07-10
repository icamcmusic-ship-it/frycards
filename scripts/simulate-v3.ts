/**
 * ⚠️  PROTOTYPE-ONLY HARNESS — this does NOT test the shipped game.
 * It runs the experimental src/game/v3/ engine with its own card definitions.
 * Balance conclusions drawn here do not apply to src/game/engine.ts play.
 * For the real game use `npm run sim` or `npm run playtest`.
 *
 * Headless playtest harness for the v3.0 dice-placement engine.
 * Runs a round-robin of all leader pairings and reports win rates, game
 * length, card usage/impact, keyword activity and rule-level anomalies.
 * Usage: npx tsx scripts/simulate-v3.ts [gamesPerPairing]
 */
import { newGame, mulberry32, Game, remainingHp, rollValues } from '../src/game/v3/engine';
import { playTurn } from '../src/game/v3/ai';
import { CARDS_V3, CARD_DB, LEADER_HP } from '../src/game/v3/cards';

const PER_PAIR = parseInt(process.argv[2] || '50', 10);
const MAX_TURNS = 120;
const LEADERS = CARDS_V3.filter((c) => c.type === 'Leader').map((c) => c.id);

interface CardAgg {
  casts: number;
  gamesCast: number;
  winsWhenCast: number;
  inDeckGames: number;
  inDeckWins: number;
}

const cardAgg: Record<string, CardAgg> = {};
const leaderWins: Record<string, number> = {};
const leaderGames: Record<string, number> = {};
const pairWins: Record<string, number> = {};
const comboTriggers: Record<string, number> = {};
let totalTurns = 0;
let totalGames = 0;
let draws = 0;
let deckouts = 0;
let timeouts = 0;
let echoRecasts = 0,
  twinCompletions = 0,
  twinAbandons = 0,
  scraps = 0,
  rallies = 0,
  wardBlocks = 0,
  diceWasted = 0,
  attacks = 0;
const errors: string[] = [];

function invariants(g: Game) {
  for (const p of Object.values(g.players)) {
    if (g.winner) break;
    for (const u of p.board) {
      if (remainingHp(g, u) <= 0) errors.push(`dead unit on board: ${u.def.name}`);
    }
    if (p.hand.length > 6 && g.active !== p.id) errors.push(`hand overflow: ${p.hand.length}`);
    if (p.dice.length > 0 && g.active !== p.id) errors.push('inactive player holds dice');
    if (p.leader.damage < 0) errors.push('negative leader damage');
    const total =
      p.deck.length +
      p.hand.length +
      p.discard.length +
      p.banished.length +
      p.staging.length +
      p.board.length +
      (p.location ? 1 : 0);
    if (total !== 40) errors.push(`card count drift: ${total} (${p.id})`);
  }
}

function runGame(la: string, lb: string, seed: number) {
  const g = newGame(la, lb, mulberry32(seed));
  let turns = 0;
  while (!g.winner && turns < MAX_TURNS) {
    playTurn(g);
    invariants(g);
    turns++;
  }
  totalGames++;
  totalTurns += turns;
  if (!g.winner) {
    timeouts++;
    return;
  }
  if (g.winner === 'draw') {
    draws++;
    return;
  }
  if (g.log.some((l) => l.includes('decked out'))) deckouts++;

  const winnerLeader = g.players[g.winner].leader.def.id;
  const loserLeader = g.players[g.winner === 'A' ? 'B' : 'A'].leader.def.id;
  leaderWins[winnerLeader] = (leaderWins[winnerLeader] || 0) + 1;
  leaderGames[winnerLeader] = (leaderGames[winnerLeader] || 0) + 1;
  leaderGames[loserLeader] = (leaderGames[loserLeader] || 0) + 1;
  pairWins[`${la}>${lb}`] =
    (pairWins[`${la}>${lb}`] || 0) +
    (winnerLeader === la && g.players.A.leader.def.id === la ? 0 : 0);

  const s = g.stats;
  echoRecasts += s.echoRecasts;
  twinCompletions += s.twinCompletions;
  twinAbandons += s.twinAbandons;
  scraps += s.scraps;
  rallies += s.rallies;
  wardBlocks += s.wardBlocks;
  diceWasted += s.diceWasted;
  attacks += s.attacks;
  for (const [id, n] of Object.entries(s.comboTriggers)) {
    comboTriggers[id] = (comboTriggers[id] || 0) + n;
  }

  // Per-card aggregation: casts per player, correlated with that player's result.
  for (const pid of ['A', 'B'] as const) {
    const p = g.players[pid];
    const won = g.winner === pid;
    const deckIds = new Set<string>();
    for (const zone of [p.deck, p.hand, p.discard, p.banished, p.staging, p.board]) {
      for (const c of zone) deckIds.add(c.def.id);
    }
    if (p.location) deckIds.add(p.location.def.id);
    for (const id of deckIds) {
      const a = (cardAgg[id] ||= {
        casts: 0,
        gamesCast: 0,
        winsWhenCast: 0,
        inDeckGames: 0,
        inDeckWins: 0,
      });
      a.inDeckGames++;
      if (won) a.inDeckWins++;
    }
  }
  // Cast counts are game-global (both players); attribute to whoever's deck holds the card id.
  for (const pid of ['A', 'B'] as const) {
    const p = g.players[pid];
    const won = g.winner === pid;
    const counted = new Set<string>();
    // walk stats.casts is global; recompute per-player casts from zones is imprecise.
    void p;
    void won;
    void counted;
  }
  for (const [id, n] of Object.entries(s.casts)) {
    const a = (cardAgg[id] ||= {
      casts: 0,
      gamesCast: 0,
      winsWhenCast: 0,
      inDeckGames: 0,
      inDeckWins: 0,
    });
    a.casts += n;
    a.gamesCast++;
  }
}

let seed = 42;
for (const la of LEADERS) {
  for (const lb of LEADERS) {
    for (let i = 0; i < PER_PAIR; i++) runGame(la, lb, seed++);
  }
}

console.log(`\n=== v3.0 Playtest: ${totalGames} games (${PER_PAIR}/pairing) ===`);
console.log(
  `avg game length: ${(totalTurns / totalGames / 2).toFixed(1)} rounds (${(totalTurns / totalGames).toFixed(1)} turns)`,
);
console.log(
  `draws: ${draws}  deckout losses: ${deckouts}  timeouts(no winner @${MAX_TURNS}t): ${timeouts}`,
);

console.log('\n--- Leader win rates ---');
for (const l of LEADERS) {
  const w = leaderWins[l] || 0;
  const n = leaderGames[l] || 1;
  console.log(`${CARD_DB[l].name.padEnd(22)} ${w}/${n} = ${((100 * w) / n).toFixed(1)}%`);
}

console.log('\n--- Keyword / mechanic activity (totals across all games) ---');
console.log({ echoRecasts, twinCompletions, twinAbandons, scraps, rallies, wardBlocks, attacks });
console.log(`avg dice wasted per player-turn: ${(diceWasted / totalTurns).toFixed(2)}`);

console.log('\n--- Combo passive triggers ---');
console.log(comboTriggers);

console.log('\n--- Card usage (casts per game-in-deck, win% when in winning deck) ---');
const rows = Object.entries(cardAgg)
  .filter(([id]) => CARD_DB[id].type !== 'Leader')
  .map(([id, a]) => ({
    id,
    name: CARD_DB[id].name,
    castsPerGame: a.casts / Math.max(1, a.inDeckGames),
    deckWinPct: (100 * a.inDeckWins) / Math.max(1, a.inDeckGames),
    casts: a.casts,
    inDeck: a.inDeckGames,
  }))
  .sort((x, y) => y.castsPerGame - x.castsPerGame);
for (const r of rows) {
  console.log(
    `${r.name.padEnd(18)} casts/game=${r.castsPerGame.toFixed(2).padStart(5)}  deckWin%=${r.deckWinPct.toFixed(1).padStart(5)}  (n=${r.inDeck})`,
  );
}

if (errors.length) {
  console.log(`\n!!! ${errors.length} invariant violations (first 10):`);
  for (const e of [...new Set(errors)].slice(0, 10)) console.log('  ' + e);
} else {
  console.log('\nNo invariant violations.');
}
