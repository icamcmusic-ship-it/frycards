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

const args = process.argv.slice(2);
const ADVERSARIAL = args.includes('--adversarial');
const GAMES = parseInt(args.find((a) => /^\d+$/.test(a)) || '40', 10);
const MAX_ACTIONS = 3000;
// Adversarial mode: ~30% deliberately-hostile actions (including NaN/Infinity
// payloads and cross-zone/cross-player ids) mixed into a mostly-legal driver,
// asserting every rejected action is a pure no-op on state integrity.
const HOSTILE_RATE = ADVERSARIAL ? 0.3 : 0.5;

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
  if (ADVERSARIAL) {
    const weird = () => rnd([NaN, Infinity, -Infinity, -5, 1e15, 0.5, -0.5, 2 ** 31]);
    // The ALLOCATE window is one action per turn: when we are in it, strike
    // it directly half the time or hostile allocations almost never land.
    if (state.phase === 'ALLOCATE' && Math.random() < 0.5) {
      const els = state.players[state.activePlayerId].leader.elements.filter(
        (e) => e !== 'Generic',
      );
      const allocations: Record<string, number> = {};
      for (let i = 0; i < 3; i++) allocations[rnd(els.length ? els : ['Flame'])] = weird();
      return { type: 'ALLOCATE_RESOURCES', allocations };
    }
    kinds.push(
      // Hostile xAmount on any card (xCost or not — must be ignored on non-xCost).
      () => ({ type: 'PLAY_CARD', instanceId: anyId(), targetId: anyId(), xAmount: weird() }),
      () => ({ type: 'PLAY_CARD', instanceId: anyId(), xAmount: weird() }),
      // NaN/Infinity/negative allocations on the ACTIVE Leader's real
      // elements — the only ones that pass the reducer's legality filter.
      (): GameAction => {
        const leaderEls = state.players[state.activePlayerId].leader.elements.filter(
          (e) => e !== 'Generic',
        );
        const els = leaderEls.length ? leaderEls : ['Flame'];
        const allocations: Record<string, number> = {};
        for (let i = 0; i < 3; i++) allocations[rnd(els)] = weird();
        return { type: 'ALLOCATE_RESOURCES', allocations };
      },
      // Self-targeted attacks / attacking with the opponent's cards.
      () => ({ type: 'TOGGLE_ATTACKER', instanceId: anyId(), targetId: anyId() }),
      () => ({ type: 'LEADER_COMMAND', targetId: anyId() }),
      () => ({ type: 'ACTIVATE_ABILITY', instanceId: anyId() }),
      () => ({ type: 'KEEP_HAND', playerId: rnd(['p1', 'p2']), bottomIds: [anyId(), anyId(), anyId()] }),
    );
  }
  return rnd(kinds)();
}

/**
 * Integrity snapshot for no-op detection: resources, health, counts per zone.
 * A hostile action the reducer REJECTED (log & phase unchanged) must leave
 * this snapshot identical.
 */
function integrityKey(state: GameState): string {
  const parts: unknown[] = [];
  for (const p of Object.values(state.players)) {
    parts.push(p.resources, p.health, p.deck.length, p.hand.length, p.graveyard.length,
      p.board.length, p.locations.length, p.charms.length, p.overclockPenalty,
      p.deployDiscount || 0);
    for (const c of [...p.board, p.leader]) {
      parts.push(c.instanceId, c.damageTaken, c.bonusDamage, c.frozen, c.scorch,
        c.exhausted, c.effect?.value ?? null, c.attachedItems.length);
    }
    for (const c of [...p.hand, ...p.deck]) parts.push(c.effect?.value ?? null);
  }
  return JSON.stringify(parts);
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
    // Status counters must never go negative or non-finite anywhere.
    for (const c of [p.leader, ...p.board, ...p.hand, ...p.deck, ...p.graveyard]) {
      for (const [k, v] of Object.entries({
        damageTaken: c.damageTaken, bonusDamage: c.bonusDamage, frozen: c.frozen,
        scorch: c.scorch, armor: c.armor, witherAtk: c.witherAtk, witherHp: c.witherHp,
        blessed: c.blessedCharges || 0,
      })) {
        if (v < 0 || !Number.isFinite(v)) errors.push(`${p.name}'s ${c.name} ${k}=${v}`);
      }
      // Effect values on cards at rest (hand/deck) must match no cast-time
      // mutation leakage: they must at least stay finite.
      if (c.effect && c.effect.value !== undefined && !Number.isFinite(c.effect.value))
        errors.push(`${c.name} non-finite effect value ${c.effect.value}`);
    }
    if (p.overclockPenalty < 0 || !Number.isFinite(p.overclockPenalty))
      errors.push(`${p.name} bad overclockPenalty ${p.overclockPenalty}`);
    if ((p.deployDiscount || 0) < 0) errors.push(`${p.name} negative deployDiscount`);
    if (!Number.isFinite(p.health)) errors.push(`${p.name} non-finite health`);
    // Hand limit is enforced at Cleanup: at the moment a turn hands over
    // (TURN_TRANSITION) the just-cleaned-up player must hold <= 7 cards.
    if (state.phase === 'TURN_TRANSITION' && p.hand.length > 7)
      errors.push(`${p.name} has ${p.hand.length} cards after cleanup (>7)`);
  }
  if (state.pendingRoll !== null && !Number.isFinite(state.pendingRoll))
    errors.push(`non-finite pendingRoll ${state.pendingRoll}`);
  // winner <=> GAME_OVER coherence.
  if (state.winner && state.phase !== 'GAME_OVER') errors.push('winner set but phase not GAME_OVER');
  if (state.phase === 'GAME_OVER' && !state.winner) errors.push('GAME_OVER without a winner');
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
      // Hostile garbage vs the legal CPU action (to make progress).
      const hostile = Math.random() < HOSTILE_RATE;
      const action = hostile ? randomIllegalAction(state) : getCPUAction(state);
      if (!action) break;
      const beforeKey = conservationKey(state);
      const beforeRes = JSON.stringify(Object.values(state.players).map((p) => p.resources));
      const beforeIntegrity = hostile && ADVERSARIAL ? integrityKey(state) : '';
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
        // Adversarial mode: a rejected action (log & phase unchanged) must be
        // a pure no-op across the whole integrity snapshot, not just resources.
        if (
          ADVERSARIAL &&
          next.log.length === state.log.length &&
          next.phase === state.phase &&
          integrityKey(next) !== beforeIntegrity
        ) {
          errors.push(`rejected action corrupted state: ${JSON.stringify(action)}`);
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
console.log(`\nFuzz${ADVERSARIAL ? ' (adversarial)' : ''}: ${GAMES - failed}/${GAMES} games clean.`);
process.exit(failed > 0 ? 1 : 0);
