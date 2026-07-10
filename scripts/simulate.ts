/**
 * Headless CPU-vs-CPU simulation harness.
 * Runs full games through the real reducer + AI and asserts engine invariants.
 * Usage: npx tsx scripts/simulate.ts [games] [--seed=N]
 */
// --- Deterministic seeding: override Math.random with mulberry32 BEFORE the
// engine/AI modules are ever exercised (they call Math.random directly).
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

import { initialGameState, gameReducer, totalRemaining, maxItemCapacity } from '../src/game/engine';
import { getCPUAction } from '../src/game/ai';
import { getDeckableLeaders } from '../src/game/cards';
import { GameState } from '../src/types';

const positional = cliArgs.filter((a) => !a.startsWith('--'));
const GAMES = parseInt(positional[0] || '60', 10);
const MAX_ACTIONS = 2000;

function check(cond: boolean, msg: string, state: GameState, errors: string[]) {
  if (!cond) errors.push(`[turn ${state.turnNumber} ${state.phase}] ${msg}`);
}

function invariants(state: GameState, errors: string[]) {
  for (const p of Object.values(state.players)) {
    for (const [el, v] of Object.entries(p.resources)) {
      check(v >= 0, `${p.name} has negative ${el} resources (${v})`, state, errors);
    }
    for (const u of p.board) {
      check(
        totalRemaining(u, state) > 0 || state.phase === 'GAME_OVER',
        `dead unit ${u.name} (${totalRemaining(u, state)} hp) left on board ` +
          `[hp=${u.health} dmg=${u.damageTaken} bonusDmg=${u.bonusDamage} tempHp=${u.tempHp} witherHp=${u.witherHp} kw=${u.keywords.join('/')} items=${u.attachedItems.length}]`,
        state,
        errors,
      );
      check(
        u.attachedItems.length <= maxItemCapacity(u),
        `${u.name} exceeds item capacity`,
        state,
        errors,
      );
    }
    check(p.health <= (p.leader.health || 30), `${p.name} health above printed max`, state, errors);
    // Hand limit is enforced at cleanup; give slack for mid-turn draws.
    check(p.hand.length <= 20, `${p.name} hand ballooned to ${p.hand.length}`, state, errors);
  }
}

function runGame(
  seedNames: [string, string],
  gameIdx: number,
): {
  winner: string | null;
  turns: number;
  errors: string[];
  firstPlayerWon: boolean | null;
  winCondition: string;
} {
  const errors: string[] = [];
  let state = initialGameState(true, seedNames[0], seedNames[1]);
  // Make both players CPUs.
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
          `AI stuck repeating no-op action ${act.type} in phase ${state.phase} (turn ${state.turnNumber})`,
        );
        break;
      }
    } else stuckCount = 0;
    invariants(state, errors);
    if (errors.length > 8) break;
    actions++;
  }
  if (actions >= MAX_ACTIONS)
    errors.push(
      `game ${gameIdx} did not terminate in ${MAX_ACTIONS} actions (turn ${state.turnNumber})`,
    );
  // Win-condition diversity: classify how the loser's last health was taken.
  let winCondition = 'combat';
  if (state.winner) {
    const loser = state.winner === 'p1' ? 'p2' : 'p1';
    const tail = state.log.slice(-6).join(' | ');
    if (state.players[loser].deck.length === 0 && /deckout/.test(tail)) winCondition = 'deckout';
    else if (/Scorch damage/.test(tail) && new RegExp(state.players[loser].name).test(tail))
      winCondition = 'scorch';
    else if (/Discord/.test(tail)) winCondition = 'discord';
  }
  return {
    winner: state.winner,
    turns: state.turnNumber,
    errors,
    firstPlayerWon: state.winner ? state.winner === state.firstPlayerId : null,
    winCondition,
  };
}

const leaders = getDeckableLeaders();
let failed = 0;
const wins: Record<string, number> = {};
const appearances: Record<string, number> = {};
const winConditions: Record<string, number> = {};
let firstWins = 0;
let decidedGames = 0;
let totalTurns = 0;
// wins/games per unordered leader pair, keyed "A|B" with A/B in leaders order.
const pairGames: Record<string, number> = {};
const pairWins: Record<string, number> = {};
// Round-robin over all non-mirror pairs so the matchup matrix fills evenly;
// alternate seat order between passes to wash out first-player advantage.
const pairs: [string, string][] = [];
for (let i = 0; i < leaders.length; i++)
  for (let j = i + 1; j < leaders.length; j++) pairs.push([leaders[i], leaders[j]]);
for (let g = 0; g < GAMES; g++) {
  const pair = pairs[g % pairs.length];
  const swap = Math.floor(g / pairs.length) % 2 === 1;
  const [l1, l2] = swap ? [pair[1], pair[0]] : pair;
  try {
    const res = runGame([l1, l2], g);
    totalTurns += res.turns;
    if (res.errors.length) {
      failed++;
      console.error(`GAME ${g} (${l1} vs ${l2}) FAILED:`);
      for (const e of res.errors.slice(0, 8)) console.error('  - ' + e);
    } else {
      appearances[l1] = (appearances[l1] || 0) + 1;
      appearances[l2] = (appearances[l2] || 0) + 1;
      const key = res.winner === 'p1' ? l1 : l2;
      wins[key] = (wins[key] || 0) + 1;
      const pairKey = pair.join('|');
      pairGames[pairKey] = (pairGames[pairKey] || 0) + 1;
      if (key === pair[0]) pairWins[pairKey] = (pairWins[pairKey] || 0) + 1;
      winConditions[res.winCondition] = (winConditions[res.winCondition] || 0) + 1;
      if (res.firstPlayerWon !== null) {
        decidedGames++;
        if (res.firstPlayerWon) firstWins++;
      }
    }
  } catch (err) {
    failed++;
    console.error(`GAME ${g} (${l1} vs ${l2}) THREW:`, err);
  }
}
console.log(
  `\n[seed=${SEED}] ${GAMES - failed}/${GAMES} games passed. Avg turns: ${(totalTurns / GAMES).toFixed(1)}`,
);
console.log('Wins by leader:', wins);
console.log('Win rate by leader:');
for (const l of leaders) {
  const n = appearances[l] || 0;
  const w = wins[l] || 0;
  console.log(`  ${l}: ${n ? ((w / n) * 100).toFixed(1) : '0.0'}% (${w}/${n})`);
}
if (decidedGames > 0) {
  console.log(
    `First-player win rate: ${((firstWins / decidedGames) * 100).toFixed(1)}% (${firstWins}/${decidedGames})`,
  );
}
console.log('Win conditions:', winConditions);

// Matchup matrix: each cell is the row leader's win rate against the column leader.
const short = (l: string) => l.split(/[\s,]/)[0].slice(0, 8);
const colW = 9;
console.log('\nMatchup matrix (row win% vs column):');
console.log(' '.repeat(colW) + leaders.map((l) => short(l).padStart(colW)).join(''));
for (const row of leaders) {
  let line = short(row).padEnd(colW);
  for (const col of leaders) {
    if (row === col) {
      line += '—'.padStart(colW);
      continue;
    }
    const i = leaders.indexOf(row) < leaders.indexOf(col);
    const key = i ? `${row}|${col}` : `${col}|${row}`;
    const n = pairGames[key] || 0;
    const w = i ? pairWins[key] || 0 : n - (pairWins[key] || 0);
    line += (n ? `${((w / n) * 100).toFixed(0)}% n=${n}` : '·').padStart(colW);
  }
  console.log(line);
}
process.exit(failed > 0 ? 1 : 0);
