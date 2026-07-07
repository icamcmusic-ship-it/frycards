/**
 * Negative-path fuzzer: fires a mix of LEGAL (CPU-chosen) and ILLEGAL/random
 * actions at the reducer and asserts that server authority holds — no crash,
 * no state corruption, no resource theft, no zone duplication.
 * Usage: npx tsx scripts/fuzz.ts [games]
 */
import {
  initialGameState,
  gameReducer,
  totalRemaining,
  maxItemCapacity,
  GameAction,
} from '../src/game/engine';
import { getCPUAction } from '../src/game/ai';
import { getDeckableLeaders } from '../src/game/cards';
import { GameCard, GameState } from '../src/types';

const GAMES = parseInt(process.argv[2] || '40', 10);
const MAX_ACTIONS = 3000;

function rnd<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** Every card instance the game knows about, per player, across all zones. */
function allInstanceIds(state: GameState): string[] {
  const out: string[] = [];
  for (const p of Object.values(state.players)) {
    out.push(p.leader.instanceId);
    for (const z of [p.deck, p.hand, p.graveyard, p.board, p.locations, p.charms]) {
      for (const c of z) {
        out.push(c.instanceId);
        for (const it of c.attachedItems || []) out.push(it.instanceId);
      }
    }
  }
  return out;
}

/** Card conservation: non-token instances can never duplicate or vanish. */
function conservationKey(state: GameState): string {
  const ids = allInstanceIds(state);
  // Tokens may legally appear (Manifest/Hatchling) and vanish (death).
  const stable = ids.filter((id) => {
    const card = findCard(state, id);
    return card && !card.isToken;
  });
  return String(stable.length);
}

function findCard(state: GameState, id: string): GameCard | undefined {
  for (const p of Object.values(state.players)) {
    if (p.leader.instanceId === id) return p.leader;
    for (const z of [p.deck, p.hand, p.graveyard, p.board, p.locations, p.charms]) {
      for (const c of z) {
        if (c.instanceId === id) return c;
        for (const it of c.attachedItems || []) if (it.instanceId === id) return it;
      }
    }
  }
  return undefined;
}

/** Generate a hostile/garbage action. */
function randomIllegalAction(state: GameState): GameAction {
  const ids = allInstanceIds(state);
  const anyId = () => (Math.random() < 0.8 ? rnd(ids) : 'bogus-' + Math.random());
  const kinds: (() => GameAction)[] = [
    () => ({ type: 'PLAY_CARD', instanceId: anyId(), targetId: anyId() }),
    () => ({ type: 'PLAY_CARD', instanceId: anyId() }),
    () => ({ type: 'ACTIVATE_ABILITY', instanceId: anyId(), targetId: anyId() }),
    () => ({ type: 'LEADER_COMMAND', targetId: anyId() }),
    () => ({ type: 'TOGGLE_ATTACKER', instanceId: anyId(), targetId: anyId() }),
    () => ({ type: 'TOGGLE_BLOCKER', attackerId: anyId(), blockerId: anyId() }),
    () => ({ type: 'SUBMIT_ATTACKS' }),
    () => ({ type: 'SUBMIT_BLOCKS' }),
    () => ({ type: 'ENTER_COMBAT' }),
    () => ({ type: 'END_TURN' }),
    () => ({ type: 'ROLL_DICE' }),
    () => ({
      type: 'ALLOCATE_RESOURCES',
      allocations: { Flame: 99, Bogus: 5, Generic: -3, Frost: 2 },
    }),
    () => ({ type: 'KEEP_HAND', playerId: rnd(['p1', 'p2', 'p3']), bottomIds: [anyId(), anyId()] }),
    () => ({ type: 'MULLIGAN', playerId: rnd(['p1', 'p2', 'p3']) }),
    () => ({ type: 'START_GAME' }),
    () => ({ type: 'ACKNOWLEDGE_TRANSITION' }),
  ];
  return rnd(kinds)();
}

function invariants(state: GameState, errors: string[]) {
  for (const p of Object.values(state.players)) {
    for (const [el, v] of Object.entries(p.resources)) {
      if (v < 0) errors.push(`${p.name} negative ${el}: ${v}`);
      if (!Number.isFinite(v)) errors.push(`${p.name} non-finite ${el}: ${v}`);
    }
    if (p.health > (p.leader.health || 30)) errors.push(`${p.name} health above printed max`);
    if (p.locations.length > 3) errors.push(`${p.name} has ${p.locations.length} locations (>3)`);
    for (const u of p.board) {
      if (u.type !== 'Unit') errors.push(`non-Unit ${u.name} (${u.type}) on battlefield`);
      if (state.phase !== 'GAME_OVER' && totalRemaining(u, state) <= 0)
        errors.push(`dead unit ${u.name} on board`);
      if (u.attachedItems.length > maxItemCapacity(u)) errors.push(`${u.name} over item capacity`);
    }
    for (const c of p.hand) {
      if (c.damageTaken > 0 || c.exhausted) errors.push(`hand card ${c.name} carries state`);
    }
  }
  // Instance uniqueness: the same non-token instance must not exist twice.
  const ids = allInstanceIds(state);
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) errors.push(`duplicated card instance ${id}`);
    seen.add(id);
  }
}

let failed = 0;
const leaders = getDeckableLeaders();
for (let g = 0; g < GAMES; g++) {
  const errors: string[] = [];
  let state = initialGameState(true, rnd(leaders), rnd(leaders));
  state.players[state.player1Id].isCPU = true;
  state = gameReducer(state, { type: 'START_GAME' });
  let actions = 0;
  try {
    while (state.phase !== 'GAME_OVER' && actions < MAX_ACTIONS) {
      actions++;
      // 50%: hostile garbage. 50%: the legal CPU action (to make progress).
      const hostile = Math.random() < 0.5;
      const action = hostile ? randomIllegalAction(state) : getCPUAction(state);
      if (!action) break;
      const beforeKey = conservationKey(state);
      const beforeRes = JSON.stringify(Object.values(state.players).map((p) => p.resources));
      const next = gameReducer(state, action);
      invariants(next, errors);
      if (hostile) {
        // A rejected hostile action must not create or destroy card instances
        // out of thin air. (Legal actions move/mint cards; hostile ones that
        // the reducer ACCEPTED are indistinguishable from legal ones, so only
        // flag conservation breaks paired with an unchanged log = pure no-op.)
        if (next.log.length === state.log.length && conservationKey(next) !== beforeKey) {
          errors.push(`silent no-op changed card count: ${JSON.stringify(action)}`);
        }
        if (next.log.length === state.log.length && next.phase === state.phase) {
          const afterRes = JSON.stringify(Object.values(next.players).map((p) => p.resources));
          if (afterRes !== beforeRes)
            errors.push(`silent no-op changed resources: ${JSON.stringify(action)}`);
        }
      }
      state = next;
      if (errors.length > 5) break;
    }
  } catch (err) {
    errors.push(`THREW: ${err}`);
  }
  if (errors.length) {
    failed++;
    console.error(`FUZZ GAME ${g} FAILED after ${actions} actions:`);
    for (const e of errors.slice(0, 6)) console.error('  - ' + e);
  }
}
console.log(`\nFuzz: ${GAMES - failed}/${GAMES} games clean.`);
process.exit(failed > 0 ? 1 : 0);
