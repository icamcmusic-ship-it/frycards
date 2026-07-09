/**
 * v4.0 playtest harness. Plays a round-robin across a wide variety of
 * archetype decks (built from the remapped real card pool), with an advanced
 * CPU (mulligan + deck-aware reroll + combo/lethal-aware placement & combat).
 *
 * Tracks: leader & archetype win rates, first-player edge, game length,
 * per-card usage/impact, keyword/mechanic activity, combo triggers, dice
 * pitch/waste (v4.0 Pitch), and an ISOLATED Location win-rate contribution
 * (each archetype is also run Location-stripped, and the delta is reported).
 *
 * Usage: npx tsx scripts/simulate-v4.ts [gamesPerPairing]
 */
import { newGame, mulberry32, Game, DeckDef, remainingHp } from '../src/game/v3/engine';
import { playTurn, maybeMulligan } from '../src/game/v3/ai';
import { ARCHETYPES, buildDeck } from '../src/game/v3/decks';
import { POOL_BY_ID, poolByType } from '../src/game/v3/cardpool';
import { CardDef } from '../src/game/v3/cards';

const PER_PAIR = parseInt(process.argv[2] || '20', 10);
const MAX_TURNS = 160;

// --- Build the deck roster, plus a Location-stripped twin of each deck. ---
interface Entry { key: string; label: string; leaderId: string; deck: DeckDef; hasLoc: boolean; }
const decks: Entry[] = [];
for (const arch of ARCHETYPES) {
  const d = buildDeck(arch);
  decks.push({ key: arch.label, label: arch.label, leaderId: arch.leaderId, deck: d, hasLoc: true });
  // Location-stripped variant: remove Locations, backfill with best-fit Units.
  const stripped: Record<string, number> = {};
  let removed = 0;
  for (const [id, n] of Object.entries(d.cards)) {
    if (POOL_BY_ID[id].type === 'Location') { removed += n; continue; }
    stripped[id] = n;
  }
  if (removed > 0) {
    const fillers = poolByType('Unit')
      .filter((u) => !stripped[u.id])
      .sort((a, b) => (a.threshold ?? 3) - (b.threshold ?? 3));
    let need = removed;
    for (const u of fillers) {
      if (need <= 0) break;
      const c = Math.min(3, need);
      stripped[u.id] = c; need -= c;
    }
    decks.push({
      key: arch.label + ' [noLoc]', label: arch.label + ' [noLoc]',
      leaderId: arch.leaderId, deck: { ...d, cards: stripped }, hasLoc: false,
    });
  }
}

// --- Aggregators ---
const leaderW: Record<string, number> = {}, leaderN: Record<string, number> = {};
const archW: Record<string, number> = {}, archN: Record<string, number> = {};
const locW = { loc: 0, locN: 0, noloc: 0, nolocN: 0 };
const cardCast: Record<string, number> = {};
const cardInWinDeck: Record<string, number> = {}, cardInDeck: Record<string, number> = {};
const comboTriggers: Record<string, number> = {};
let games = 0, draws = 0, timeouts = 0, deckouts = 0, firstWins = 0, totalRounds = 0;
let echoRecasts = 0, twinCompletions = 0, twinAbandons = 0, scraps = 0, rallies = 0,
  wardBlocks = 0, dicePitched = 0, diceWasted = 0, attacks = 0;
const roundBuckets: Record<string, number> = {};
const errors: string[] = [];
// Decision -> {present:[wins,games], absent:[wins,games]} across all decisive player-games.
const decisionAgg: Record<string, { pw: number; pn: number; aw: number; an: number }> = {};
function trackDecision(key: string, present: boolean, won: boolean) {
  const d = (decisionAgg[key] ||= { pw: 0, pn: 0, aw: 0, an: 0 });
  if (present) { d.pn++; if (won) d.pw++; } else { d.an++; if (won) d.aw++; }
}
const DECISION_KEYS = ['locationCast', 'faceAttack', 'unitAttack', 'earlyFaceAttack',
  'boardWipe', 'echoRecast', 'twinComplete', 'leaderAbility', 'wentFirst', 'mulliganed'];

function deckSize(d: DeckDef): number {
  return Object.values(d.cards).reduce((a, b) => a + b, 0);
}
function invariants(g: Game, sizeA: number, sizeB: number) {
  const sizes: Record<string, number> = { A: sizeA, B: sizeB };
  for (const p of Object.values(g.players)) {
    if (g.winner) break;
    for (const u of p.board) if (remainingHp(g, u) <= 0) errors.push(`dead unit on board: ${u.def.name}`);
    if (p.hand.length > 6 && g.active !== p.id) errors.push(`hand overflow ${p.hand.length}`);
    if (p.leader.damage < 0) errors.push('negative leader damage');
    const total = p.deck.length + p.hand.length + p.discard.length + p.banished.length +
      p.staging.length + p.board.length + (p.location ? 1 : 0);
    if (total !== sizes[p.id]) errors.push(`card drift ${total}!=${sizes[p.id]}`);
  }
}

function runGame(a: Entry, b: Entry, seed: number) {
  const rng = mulberry32(seed);
  const g = newGame(a.deck, b.deck, rng);
  const mull = maybeMulligan(g, rng);
  const sizeA = deckSize(a.deck), sizeB = deckSize(b.deck); // leader lives outside the counted zones
  const firstPlayer = g.active;
  let rounds = 0;
  while (!g.winner && rounds < MAX_TURNS) { playTurn(g); invariants(g, sizeA, sizeB); rounds++; }
  games++;
  totalRounds += rounds / 2;
  const bucket = rounds / 2 < 4 ? '<4' : rounds / 2 < 7 ? '4-6' : rounds / 2 < 11 ? '7-10' : '11+';
  roundBuckets[bucket] = (roundBuckets[bucket] || 0) + 1;

  if (!g.winner) { timeouts++; return; }
  // Decision -> win correlation, per player, decisive games only.
  if (g.winner !== 'draw') {
    for (const pid of ['A', 'B'] as const) {
      const won = g.winner === pid;
      const d = g.stats.decisions[pid] || {};
      for (const key of DECISION_KEYS) {
        let present: boolean;
        if (key === 'wentFirst') present = firstPlayer === pid;
        else if (key === 'mulliganed') present = !!mull[pid];
        else present = (d[key] || 0) > 0;
        trackDecision(key, present, won);
      }
    }
  }
  if (g.winner === 'draw') { draws++; }
  else {
    if (g.winner === firstPlayer) firstWins++;
    const winSide = g.winner as 'A' | 'B';
    const winEntry = winSide === 'A' ? a : b;
    const loseEntry = winSide === 'A' ? b : a;
    leaderW[winEntry.leaderId] = (leaderW[winEntry.leaderId] || 0) + 1;
    leaderN[winEntry.leaderId] = (leaderN[winEntry.leaderId] || 0) + 1;
    leaderN[loseEntry.leaderId] = (leaderN[loseEntry.leaderId] || 0) + 1;
    archW[winEntry.key] = (archW[winEntry.key] || 0) + 1;
  }
  archN[a.key] = (archN[a.key] || 0) + 1;
  archN[b.key] = (archN[b.key] || 0) + 1;
  if (g.log.some((l) => l.includes('decked out'))) deckouts++;

  // Location contribution: tally only games between a Location deck and its
  // Location-stripped counterpart NOT needed — instead measure each variant's
  // overall win rate across the full field (below via hasLoc partition).
  for (const [entry, side] of [[a, 'A'], [b, 'B']] as const) {
    const won = g.winner === side;
    if (entry.hasLoc) { locW.locN++; if (won) locW.loc++; }
    else { locW.nolocN++; if (won) locW.noloc++; }
  }

  const s = g.stats;
  echoRecasts += s.echoRecasts; twinCompletions += s.twinCompletions; twinAbandons += s.twinAbandons;
  scraps += s.scraps; rallies += s.rallies; wardBlocks += s.wardBlocks;
  dicePitched += s.dicePitched; diceWasted += s.diceWasted; attacks += s.attacks;
  for (const [id, n] of Object.entries(s.comboTriggers)) comboTriggers[id] = (comboTriggers[id] || 0) + n;
  for (const [id, n] of Object.entries(s.casts)) cardCast[id] = (cardCast[id] || 0) + n;
  for (const [entry, side] of [[a, 'A'], [b, 'B']] as const) {
    const won = g.winner === side;
    for (const id of Object.keys(entry.deck.cards)) {
      cardInDeck[id] = (cardInDeck[id] || 0) + 1;
      if (won) cardInWinDeck[id] = (cardInWinDeck[id] || 0) + 1;
    }
  }
}

let seed = 1000;
for (let i = 0; i < decks.length; i++) {
  for (let j = 0; j < decks.length; j++) {
    if (i === j) continue;
    for (let k = 0; k < PER_PAIR; k++) runGame(decks[i], decks[j], seed++);
  }
}

const pct = (w: number, n: number) => (n ? ((100 * w) / n).toFixed(1) : '—');
console.log(`\n=== v4.0 Playtest: ${games} games, ${decks.length} decks (${ARCHETYPES.length} archetypes +Location-stripped twins), ${PER_PAIR}/pairing ===`);
console.log(`avg length: ${(totalRounds / games).toFixed(1)} rounds   draws: ${draws}   deckouts: ${deckouts}   timeouts@${MAX_TURNS}t: ${timeouts}`);
console.log(`first-player win rate: ${pct(firstWins, games - draws - timeouts)}%`);
console.log('game-length distribution (rounds):', roundBuckets);

console.log('\n--- Leader win rates (aggregated over that leader\'s archetypes) ---');
for (const l of Object.keys(leaderN).sort((a, b) => (leaderW[b] || 0) / leaderN[b] - (leaderW[a] || 0) / leaderN[a])) {
  console.log(`${POOL_BY_ID[l].name.padEnd(26)} ${pct(leaderW[l] || 0, leaderN[l])}%  (n=${leaderN[l]})`);
}

console.log('\n--- Archetype win rates (Location decks only) ---');
for (const a of ARCHETYPES) {
  console.log(`${a.label.padEnd(28)} ${pct(archW[a.label] || 0, archN[a.label] || 0)}%  (n=${archN[a.label] || 0})`);
}

console.log('\n--- ISOLATED Location contribution ---');
console.log(`Location decks:        ${pct(locW.loc, locW.locN)}%  (n=${locW.locN})`);
console.log(`Location-stripped:     ${pct(locW.noloc, locW.nolocN)}%  (n=${locW.nolocN})`);
console.log(`=> Locations are worth ${((100 * locW.loc / locW.locN) - (100 * locW.noloc / locW.nolocN)).toFixed(1)} win% vs. filling their slots with cheap Units`);

console.log('\n--- Mechanic activity (totals) ---');
console.log({ echoRecasts, twinCompletions, twinAbandons, scraps, rallies, wardBlocks, attacks });
console.log(`Pitch (v4.0): dice pitched for Mend 1 = ${dicePitched}; truly wasted (leader full) = ${diceWasted}`);
console.log(`avg dice pitched+wasted per player-turn: ${((dicePitched + diceWasted) / (totalRounds * 2)).toFixed(2)}`);

console.log('\n--- Decision -> win correlation (win% when the player DID vs DID NOT do it) ---');
const decRows = DECISION_KEYS.map((k) => {
  const d = decisionAgg[k] || { pw: 0, pn: 0, aw: 0, an: 0 };
  const withP = d.pn ? (100 * d.pw) / d.pn : NaN;
  const without = d.an ? (100 * d.aw) / d.an : NaN;
  return { k, withP, without, delta: withP - without, pn: d.pn, an: d.an };
}).sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
for (const r of decRows) {
  const sign = r.delta >= 0 ? '+' : '';
  console.log(
    `${r.k.padEnd(16)} did=${isNaN(r.withP) ? ' n/a' : r.withP.toFixed(1).padStart(5)}%  did-not=${isNaN(r.without) ? ' n/a' : r.without.toFixed(1).padStart(5)}%  delta=${sign}${r.delta.toFixed(1)}pt  (did n=${r.pn})`,
  );
}

console.log('\n--- Combo passive triggers ---');
console.log(Object.fromEntries(Object.entries(comboTriggers).sort((a, b) => b[1] - a[1]).slice(0, 15)
  .map(([id, n]) => [POOL_BY_ID[id]?.name || id, n])));

// OP / useless detection: cards with enough sample, ranked by win-correlation.
const rows = Object.keys(cardInDeck)
  .filter((id) => POOL_BY_ID[id].type !== 'Leader' && cardInDeck[id] >= 40)
  .map((id) => ({
    name: POOL_BY_ID[id].name, type: POOL_BY_ID[id].type,
    winPct: (100 * (cardInWinDeck[id] || 0)) / cardInDeck[id],
    castsPerGame: (cardCast[id] || 0) / cardInDeck[id],
    n: cardInDeck[id],
  }));
console.log('\n--- Most likely OP (highest win% in deck, min n=40) ---');
for (const r of [...rows].sort((a, b) => b.winPct - a.winPct).slice(0, 12))
  console.log(`${r.name.padEnd(26)} ${r.type.padEnd(9)} win%=${r.winPct.toFixed(1).padStart(5)} casts/g=${r.castsPerGame.toFixed(2)} (n=${r.n})`);
console.log('\n--- Most "useless" (lowest cast rate / lowest win%) ---');
for (const r of [...rows].sort((a, b) => a.castsPerGame - b.castsPerGame || a.winPct - b.winPct).slice(0, 12))
  console.log(`${r.name.padEnd(26)} ${r.type.padEnd(9)} casts/g=${r.castsPerGame.toFixed(2)} win%=${r.winPct.toFixed(1)} (n=${r.n})`);

console.log(errors.length ? `\n!!! ${[...new Set(errors)].length} invariant violation types:\n  ${[...new Set(errors)].slice(0, 10).join('\n  ')}` : '\nNo invariant violations.');
