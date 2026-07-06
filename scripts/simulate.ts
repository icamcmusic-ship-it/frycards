/**
 * Headless CPU-vs-CPU simulation harness.
 * Runs full games through the real reducer + AI and asserts engine invariants.
 * Usage: npx tsx scripts/simulate.ts [games]
 */
import { initialGameState, gameReducer, totalRemaining, maxItemCapacity } from '../src/game/engine';
import { getCPUAction } from '../src/game/ai';
import { getDeckableLeaders } from '../src/game/cards';
import { GameState } from '../src/types';

const GAMES = parseInt(process.argv[2] || '60', 10);
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
      check(totalRemaining(u, state) > 0 || state.phase === 'GAME_OVER',
        `dead unit ${u.name} (${totalRemaining(u, state)} hp) left on board ` +
        `[hp=${u.health} dmg=${u.damageTaken} bonusDmg=${u.bonusDamage} tempHp=${u.tempHp} witherHp=${u.witherHp} kw=${u.keywords.join('/')} items=${u.attachedItems.length}]`,
        state, errors);
      check(u.attachedItems.length <= maxItemCapacity(u), `${u.name} exceeds item capacity`, state, errors);
    }
    check(p.health <= (p.leader.health || 30), `${p.name} health above printed max`, state, errors);
    // Hand limit is enforced at cleanup; give slack for mid-turn draws.
    check(p.hand.length <= 20, `${p.name} hand ballooned to ${p.hand.length}`, state, errors);
  }
}

function runGame(seedNames: [string, string], gameIdx: number): { winner: string | null; turns: number; errors: string[] } {
  const errors: string[] = [];
  let state = initialGameState(true, seedNames[0], seedNames[1]);
  // Make both players CPUs.
  state.players[state.player1Id].isCPU = true;
  state = gameReducer(state, { type: 'START_GAME' });

  let actions = 0;
  let lastLogLen = -1;
  let stuckCount = 0;
  while (state.phase !== 'GAME_OVER' && actions < MAX_ACTIONS) {
    const act = getCPUAction(state);
    if (!act) {
      errors.push(`AI returned no action in phase ${state.phase} (turn ${state.turnNumber})`);
      break;
    }
    const before = JSON.stringify({ p: state.phase, l: state.log.length, t: state.turnNumber, c: state.combat?.attackers.length ?? -1, b: state.combat?.blockers.length ?? -1 });
    state = gameReducer(state, act);
    const after = JSON.stringify({ p: state.phase, l: state.log.length, t: state.turnNumber, c: state.combat?.attackers.length ?? -1, b: state.combat?.blockers.length ?? -1 });
    if (before === after) {
      stuckCount++;
      if (stuckCount > 5) {
        errors.push(`AI stuck repeating no-op action ${act.type} in phase ${state.phase} (turn ${state.turnNumber})`);
        break;
      }
    } else stuckCount = 0;
    invariants(state, errors);
    if (errors.length > 8) break;
    actions++;
    lastLogLen = state.log.length;
  }
  if (actions >= MAX_ACTIONS) errors.push(`game ${gameIdx} did not terminate in ${MAX_ACTIONS} actions (turn ${state.turnNumber})`);
  return { winner: state.winner, turns: state.turnNumber, errors };
}

const leaders = getDeckableLeaders();
let failed = 0;
const wins: Record<string, number> = {};
const appearances: Record<string, number> = {};
let totalTurns = 0;
for (let g = 0; g < GAMES; g++) {
  const l1 = leaders[g % leaders.length];
  const l2 = leaders[(g + 1 + (g % (leaders.length - 1))) % leaders.length];
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
    }
  } catch (err) {
    failed++;
    console.error(`GAME ${g} (${l1} vs ${l2}) THREW:`, err);
  }
}
console.log(`\n${GAMES - failed}/${GAMES} games passed. Avg turns: ${(totalTurns / GAMES).toFixed(1)}`);
console.log('Wins by leader:', wins);
console.log('Win rate by leader:');
for (const l of leaders) {
  const n = appearances[l] || 0;
  const w = wins[l] || 0;
  console.log(`  ${l}: ${n ? ((w / n) * 100).toFixed(1) : '0.0'}% (${w}/${n})`);
}
process.exit(failed > 0 ? 1 : 0);
