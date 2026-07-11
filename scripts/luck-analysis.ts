/**
 * Luck-vs-skill analysis for the v4.2 rules engine.
 *
 * (a) Mirror matches (identical decks, identical AI): first-player edge and
 *     seat deviation from 50% quantify positional/turn-order luck.
 * (b) Strong AI vs weak (random-ish) AI: the further above 50% the strong AI
 *     lands, the more skill expression the ruleset supports.
 * (c) Dice-luck correlation: how often does the player with the higher
 *     average dice total win? Plus the win-rate spread across dice-advantage
 *     buckets.
 * (d) Draw-order luck: identical decks + identical dice-independent AI, so
 *     any deviation is shuffle + roll variance combined (baseline noise).
 *
 * Also supports head-to-head AI comparison: current ai.ts vs the frozen
 * scripts/ai-v42-baseline.ts snapshot (pass `--compare`).
 *
 * Usage: npx tsx scripts/luck-analysis.ts [gamesPerCondition] [--compare]
 */
import {
  newGame,
  mulberry32,
  Game,
  startTurn,
  reroll,
  castFromHand,
  castLocationFree,
  activateAbility,
  comboCheck,
  attack,
  endTurn,
  canAttack,
  legalTargets,
  effThreshold,
  effAbilityThreshold,
  matchesPattern,
  rollValues,
} from '../src/game/v3/engine';
import { playTurn, maybeMulligan } from '../src/game/v3/ai';
import { playTurn as playTurnBaseline } from './ai-v42-baseline';
import { ARCHETYPES, buildDeck } from '../src/game/v3/decks';

const N = parseInt(process.argv.find((a) => /^\d+$/.test(a)) || '1200', 10);
const COMPARE = process.argv.includes('--compare');
const MAX_TURNS = 160;

type TurnFn = (g: Game) => void;

/**
 * Weak AI: legal but naive. Never rerolls, casts hand cards in draw order
 * with the first free die that fits, never uses Echo/Twin/Scrap/abilities
 * beyond the leader, attacks in board order at the first legal target.
 */
function weakTurn(g: Game) {
  startTurn(g);
  if (g.winner) return;
  reroll(g, []); // never rerolls
  const p = g.players[g.active];
  // Location (free).
  const loc = p.hand.find((c) => c.def.type === 'Location');
  if (loc) castLocationFree(g, loc.iid);
  // Cast greedily in hand order.
  let progress = true;
  while (progress && !g.winner) {
    progress = false;
    for (const c of [...p.hand]) {
      if (c.def.type === 'Location') continue;
      const free = p.dice.map((d, i) => (d.placed ? -1 : i)).filter((i) => i >= 0);
      if (free.length === 0) break;
      if (c.def.comboGate) {
        if (!matchesPattern(rollValues(p), c.def.comboGate)) continue;
        if (castFromHand(g, free[0], c.iid)) progress = true;
        continue;
      }
      const idx = free.find((i) => p.dice[i].value >= effThreshold(g, p.id, c.def));
      if (idx !== undefined && castFromHand(g, idx, c.iid)) progress = true;
    }
    // Leader ability with any leftover die.
    if (!p.leader.abilityUsed && p.leader.def.ability) {
      const free = p.dice.map((d, i) => (d.placed ? -1 : i)).filter((i) => i >= 0);
      const idx = free.find((i) => p.dice[i].value >= effAbilityThreshold(g, p.leader));
      if (idx !== undefined && activateAbility(g, idx, p.leader.iid)) progress = true;
    }
  }
  if (g.winner) return;
  comboCheck(g);
  if (g.winner) return;
  let guard = 60;
  while (!g.winner && guard-- > 0) {
    const att = p.board.find((u) => canAttack(g, u));
    if (!att) break;
    const tgt = legalTargets(g, p.id)[0];
    if (!tgt || !attack(g, att.iid, tgt.iid)) {
      att.hasAttacked = true;
      att.attacksMade = 99;
    }
  }
  if (g.winner) return;
  endTurn(g);
}

interface Outcome {
  winner: string | null;
  firstPlayer: string;
  rounds: number;
  avgDice: Record<string, number>;
}

function playGame(deckIdxA: number, deckIdxB: number, seed: number, aiA: TurnFn, aiB: TurnFn): Outcome {
  const rng = mulberry32(seed);
  const g = newGame(buildDeck(ARCHETYPES[deckIdxA]), buildDeck(ARCHETYPES[deckIdxB]), rng);
  maybeMulligan(g, rng);
  const firstPlayer = g.active;
  const diceSum: Record<string, number> = { A: 0, B: 0 };
  const diceN: Record<string, number> = { A: 0, B: 0 };
  let rounds = 0;
  while (!g.winner && rounds < MAX_TURNS) {
    const pid = g.active;
    (pid === 'A' ? aiA : aiB)(g);
    // record post-reroll dice values of the turn just played
    const p = g.players[pid];
    // dice are cleared at endTurn; sample from stats instead: we re-track by
    // wrapping — simpler: sum during the loop via a monkey-patched sample below.
    rounds++;
    void p;
  }
  return { winner: g.winner, firstPlayer, rounds, avgDice: { A: diceN.A ? diceSum.A / diceN.A : 0, B: diceN.B ? diceSum.B / diceN.B : 0 } };
}

/** Variant that samples each turn's post-reroll dice for the dice-luck study. */
function playGameDice(deckIdx: number, seed: number): Outcome {
  const rng = mulberry32(seed);
  const g = newGame(buildDeck(ARCHETYPES[deckIdx]), buildDeck(ARCHETYPES[deckIdx]), rng);
  maybeMulligan(g, rng);
  const firstPlayer = g.active;
  const diceSum: Record<string, number> = { A: 0, B: 0 };
  const diceN: Record<string, number> = { A: 0, B: 0 };
  let rounds = 0;
  while (!g.winner && rounds < MAX_TURNS) {
    const pid = g.active;
    // Sample the raw dealt roll (pure luck component — reroll choices are
    // skill and belong on the skill side of the ledger).
    playTurn(g, (values) => {
      diceSum[pid] += values.reduce((a, b) => a + b, 0);
      diceN[pid] += values.length;
    });
    rounds++;
  }
  return { winner: g.winner, firstPlayer, rounds, avgDice: { A: diceN.A ? diceSum.A / diceN.A : 0, B: diceN.B ? diceSum.B / diceN.B : 0 } };
}

// ---------------------------------------------------------------------------
// (a) Mirror matches: seat luck
// ---------------------------------------------------------------------------
function pct(w: number, n: number) {
  return n ? ((100 * w) / n).toFixed(1) + '%' : 'n/a';
}
function ci95(w: number, n: number) {
  const p = w / n;
  const half = 1.96 * Math.sqrt((p * (1 - p)) / n);
  return `±${(100 * half).toFixed(1)}`;
}

console.log(`=== Luck vs skill analysis (${N} games per condition) ===`);

{
  let firstWins = 0;
  let decisive = 0;
  const mirrors = [0, 4, 8]; // aggro, wall, frenzy-aggro archetype mirrors
  for (const m of mirrors) {
    for (let i = 0; i < Math.ceil(N / mirrors.length); i++) {
      const o = playGame(m, m, 100_000 + m * 50_000 + i, playTurn, playTurn);
      if (o.winner && o.winner !== 'draw') {
        decisive++;
        if (o.winner === o.firstPlayer) firstWins++;
      }
    }
  }
  console.log(`\n(a) Mirror matches (identical deck + identical AI, ${decisive} decisive):`);
  console.log(`    first-player win rate: ${pct(firstWins, decisive)} ${ci95(firstWins, decisive)} (50% = no seat luck)`);
}

// ---------------------------------------------------------------------------
// (b) Strong vs weak AI
// ---------------------------------------------------------------------------
{
  let strongWins = 0;
  let decisive = 0;
  for (let i = 0; i < N; i++) {
    const deck = i % ARCHETYPES.length;
    const strongIsA = i % 2 === 0;
    const o = playGame(deck, deck, 200_000 + i, strongIsA ? playTurn : weakTurn, strongIsA ? weakTurn : playTurn);
    if (o.winner && o.winner !== 'draw') {
      decisive++;
      if ((o.winner === 'A') === strongIsA) strongWins++;
    }
  }
  console.log(`\n(b) Strong AI vs weak AI (same deck both sides, ${decisive} decisive):`);
  console.log(`    strong-AI win rate: ${pct(strongWins, decisive)} ${ci95(strongWins, decisive)} (100% = pure skill, 50% = pure luck)`);
}

// ---------------------------------------------------------------------------
// (c) Dice-luck correlation (mirror, strong AI both sides)
// ---------------------------------------------------------------------------
{
  let higherDiceWins = 0;
  let decisive = 0;
  const buckets: Record<string, { w: number; n: number }> = {};
  for (let i = 0; i < N; i++) {
    const o = playGameDice(i % ARCHETYPES.length, 300_000 + i);
    if (!o.winner || o.winner === 'draw') continue;
    decisive++;
    const adv = o.avgDice[o.winner] - o.avgDice[o.winner === 'A' ? 'B' : 'A'];
    if (adv > 0) higherDiceWins++;
    const wAdv = o.avgDice.A - o.avgDice.B; // A's advantage
    const b = wAdv < -0.2 ? '<-0.2' : wAdv < -0.05 ? '-0.2..-0.05' : wAdv <= 0.05 ? '±0.05' : wAdv <= 0.2 ? '+0.05..0.2' : '>+0.2';
    const bb = (buckets[b] ||= { w: 0, n: 0 });
    bb.n++;
    if (o.winner === 'A') bb.w++;
  }
  console.log(`\n(c) Dice-luck (mirror matches, avg dealt-die value per game, ${decisive} decisive):`);
  console.log(`    winner had the higher average dealt roll: ${pct(higherDiceWins, decisive)} ${ci95(higherDiceWins, decisive)}`);
  console.log('    seat-A win rate by A\'s avg-die advantage:');
  for (const k of ['<-0.2', '-0.2..-0.05', '±0.05', '+0.05..0.2', '>+0.2']) {
    const b = buckets[k];
    if (b) console.log(`      ${k.padEnd(12)} ${pct(b.w, b.n)} (n=${b.n})`);
  }
}

// ---------------------------------------------------------------------------
// (d) Optional: current AI vs frozen baseline snapshot
// ---------------------------------------------------------------------------
if (COMPARE) {
  let newWins = 0;
  let decisive = 0;
  for (let i = 0; i < N; i++) {
    const deck = i % ARCHETYPES.length;
    const newIsA = i % 2 === 0;
    const o = playGame(deck, deck, 400_000 + i, newIsA ? playTurn : playTurnBaseline, newIsA ? playTurnBaseline : playTurn);
    if (o.winner && o.winner !== 'draw') {
      decisive++;
      if ((o.winner === 'A') === newIsA) newWins++;
    }
  }
  console.log(`\n(d) Current ai.ts vs frozen v4.2 baseline (same deck both sides, ${decisive} decisive):`);
  console.log(`    current-AI win rate: ${pct(newWins, decisive)} ${ci95(newWins, decisive)}`);
}
