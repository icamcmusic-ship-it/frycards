import { GameState, GameCard, PlayerState } from '../types';
import {
  GameAction,
  gameReducer,
  canAfford,
  payCost,
  effAttack,
  effArmor,
  totalRemaining,
  bonusHp,
  attackBurden,
  canBeTargetedByEnemy,
  kwActive,
} from './engine';
import { hasKeyword, keywordValue } from './cards';

/**
 * Hybrid CPU engine for the Shifting Multiverse TCG.
 *
 * A full tree search chokes on the Flexible Action Loop's branching factor and
 * a learned model breaks on every card-text change, so the CPU is a hybrid:
 *
 *   [Start of Turn]
 *     -> Greedy Resource Allocator  (knapsack over the d6 roll vs. the hand)
 *     -> Action loop: every legal play is SIMULATED one ply through the real
 *        reducer (the "puzzled world"), scored with a dynamic evaluation
 *        function, and pruned when the engine rejects it — this collapses
 *        illegal/no-op permutations for free.
 *     -> Unified combat solver (bundled assault wave + Leader survival caveat)
 *
 * The evaluation matrix:
 *   V = w1*LeaderLife + w2*BoardState + w3*HandSize + w4*FloatingMana
 * with weights that shift with the active Location (Location Adaptation
 * Layer), harmful Charms on the CPU (Status Emergency Modifier), and the
 * presence of reactive Events in hand (Persistent-Mana buffer).
 */
export function getCPUAction(state: GameState): GameAction | null {
  if (state.phase === 'INIT' || state.phase === 'GAME_OVER') return null;

  const active = state.players[state.activePlayerId];
  const oppId = state.activePlayerId === state.player1Id ? state.player2Id : state.player1Id;
  const opp = state.players[oppId];

  // Mulligan: keep any hand with at least one Unit costing <= 3; otherwise
  // mulligan once, then keep.
  if (state.phase === 'MULLIGAN') {
    for (const p of [active, opp]) {
      if (p.isCPU && !p.mulliganKept) {
        const curveOk = p.hand.some((c) => c.type === 'Unit' && costTotal(c) <= 3);
        if (!curveOk && p.mulliganCount === 0) return { type: 'MULLIGAN', playerId: p.id };
        return { type: 'KEEP_HAND', playerId: p.id };
      }
    }
    return null;
  }

  // Blocking: the actor is the defender.
  if (state.phase === 'COMBAT_BLOCK') {
    if (!opp.isCPU) return null; // human defends
    return cpuBlock(state, opp);
  }

  if (!active.isCPU) return null;

  switch (state.phase) {
    case 'TURN_TRANSITION':
      return { type: 'ACKNOWLEDGE_TRANSITION' };
    case 'ROLL':
      return { type: 'ROLL_DICE' };
    case 'ALLOCATE':
      return { type: 'ALLOCATE_RESOURCES', allocations: cpuAllocate(state) };
    case 'ACTION':
      return cpuAction(state, active, opp);
    case 'COMBAT_DECLARE':
      return cpuDeclare(state, active, opp);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Dynamic evaluation function
// ---------------------------------------------------------------------------
function unitValue(u: GameCard, state: GameState, atkWeight: number, hpWeight: number): number {
  let v = effAttack(u, state) * atkWeight + totalRemaining(u, state) * hpWeight + effArmor(u) * 0.5;
  if (kwActive(u, 'Guard')) v += 1.5;
  if (kwActive(u, 'Pierce')) v += 1.0;
  if (kwActive(u, 'Siphon') || kwActive(u, 'Reap')) v += 1.0;
  if (u.frozen > 0) v *= 0.6;
  if (u.scorch > 0) v -= u.scorch;
  return v;
}

export function evaluateState(state: GameState, pid: string): number {
  const me = state.players[pid];
  const oppId = pid === state.player1Id ? state.player2Id : state.player1Id;
  const opp = state.players[oppId];
  if (state.winner === pid) return 100000;
  if (state.winner === oppId) return -100000;

  // Base weights.
  let w1 = 1.0;   // Leader life differential
  const w2 = 1.2; // board state
  const w3 = 0.5; // hand size
  let w4 = 0.3;   // floating mana

  // Status Emergency Modifier: an active harmful Charm (Decay/Detonate) on
  // the CPU multiplies the value of Leader life and cleansing.
  if (me.charms.some((c) => hasKeyword(c, 'Decay') || keywordValue(c, 'Detonate') > 0)) w1 *= 2.0;
  if (me.health <= 10) w1 *= 1.5; // critical-health survival mode

  // Location Adaptation Layer: recalculate valuation vectors per flip.
  const loc = state.activeLocation;
  let atkWeight = 1.0;
  let hpWeight = 1.0;
  if (loc?.locEffect === 'ATK_ALL') atkWeight = 1.25;        // aggression pays more
  if (loc?.locEffect === 'HP_ALL') hpWeight = 1.15;
  if (loc?.locEffect === 'SCORCH_ALL') hpWeight = 1.3;       // durable bodies survive the singe

  const myBoard = me.board.reduce((s, u) => s + unitValue(u, state, atkWeight, hpWeight), 0);
  const oppBoard = opp.board.reduce((s, u) => s + unitValue(u, state, atkWeight, hpWeight), 0);

  // Persistent-Mana buffer: floating resources are only worth keeping while a
  // reactive Event in hand could still use them next turn.
  const floating = Object.values(me.resources).reduce((a, b) => a + b, 0);
  const cheapestEvent = me.hand
    .filter((c) => c.type === 'Event')
    .reduce((m, c) => Math.min(m, costTotal(c)), Infinity);
  const floatVal = cheapestEvent === Infinity ? floating * 0.3 : Math.min(floating, cheapestEvent + 1);
  if (cheapestEvent !== Infinity) w4 = 0.6;

  return (
    w1 * (me.health - opp.health) +
    w2 * (myBoard - oppBoard) +
    w3 * (me.hand.length - opp.hand.length) +
    w4 * floatVal
  );
}

// ---------------------------------------------------------------------------
// Step A: Greedy Resource Allocation Engine (knapsack over the roll)
// ---------------------------------------------------------------------------
function playableWeight(hand: GameCard[], resources: Record<string, number>): number {
  // Greedy knapsack: play the most expensive affordable cards first and sum
  // the total cost weight that this pool can actually convert into plays.
  const pool = { ...resources };
  const sorted = [...hand].sort((a, b) => costTotal(b) - costTotal(a));
  let weight = 0;
  for (const c of sorted) {
    if (canAfford(c.cost, pool)) {
      payCost(c.cost, pool);
      weight += costTotal(c) + 1;
    }
  }
  return weight;
}

function cpuAllocate(state: GameState): Record<string, number> {
  const active = state.players[state.activePlayerId];
  const els = active.leader.elements.filter((e) => e !== 'Generic');
  const roll = state.pendingRoll || 0;
  if (roll <= 0 || els.length === 0) return {};
  if (els.length === 1) return { [els[0]]: roll };

  // Enumerate every split of the roll across the Leader's two elements and
  // keep the one that maximizes the hand's playable weight; a Pure card in
  // hand nudges the solver toward single-color allocations.
  const hasPure = active.hand.some((c) => hasKeyword(c, 'Pure'));
  let best: Record<string, number> = { [els[0]]: roll };
  let bestScore = -Infinity;
  for (let a = 0; a <= roll; a++) {
    const alloc: Record<string, number> = {};
    if (a > 0) alloc[els[0]] = a;
    if (roll - a > 0) alloc[els[1]] = roll - a;
    const pool = { ...active.resources };
    for (const [el, amt] of Object.entries(alloc)) pool[el] = (pool[el] || 0) + amt;
    let score = playableWeight(active.hand, pool);
    const colorsUsed = Object.entries(pool).filter(([, v]) => v > 0).length;
    if (hasPure && colorsUsed === 1) score += 2; // Pure bonus potential
    if (score > bestScore) {
      bestScore = score;
      best = alloc;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Action Phase: one-ply simulation search over candidate plays
// ---------------------------------------------------------------------------
interface Candidate {
  action: GameAction;
  score: number;
}

/** True when dispatching `action` actually changed the game (engine accepted it). */
function actionLanded(before: GameState, after: GameState, pid: string): boolean {
  const b = before.players[pid];
  const a = after.players[pid];
  const res = (p: PlayerState) => JSON.stringify(p.resources);
  return (
    a.hand.length !== b.hand.length ||
    a.board.length !== b.board.length ||
    a.graveyard.length !== b.graveyard.length ||
    res(a) !== res(b) ||
    after.players[pid === after.player1Id ? after.player2Id : after.player1Id].board.length !==
      before.players[pid === before.player1Id ? before.player2Id : before.player1Id].board.length
  );
}

function candidateTargets(state: GameState, card: GameCard, active: PlayerState, opp: PlayerState): (string | undefined)[] {
  if (card.type === 'Item') {
    // Stripping-Rule awareness in reverse: buff the biggest body we control.
    const hosts = [...active.board]
      .filter((u) => u.type === 'Unit')
      .sort((a, b) => effAttack(b, state) - effAttack(a, state));
    return hosts.slice(0, 2).map((h) => h.instanceId);
  }
  if (card.type === 'Event' && card.effect) {
    const eff = card.effect;
    if (eff.target === 'friendly') {
      const hosts = [...active.board].sort((a, b) => effAttack(b, state) - effAttack(a, state));
      return hosts.length ? [hosts[0].instanceId] : [];
    }
    if (eff.target === 'unit') {
      // Guard Interlock: a ready Guard soaks all targeted Events, so only
      // offer it. Otherwise offer the top threats (Lurk-filtered).
      const guards = opp.board.filter((u) => kwActive(u, 'Guard') && !u.exhausted && u.frozen === 0);
      const pool = guards.length > 0 ? guards : opp.board.filter((u) => canBeTargetedByEnemy(u));
      // Stripping Rule Filter: for Meltdown/Purge prefer Item-buffed units —
      // erasing the bonus tier wipes its allocated damage cleanly.
      if (eff.action === 'meltdown' || eff.action === 'purge') {
        const modded = pool.filter((u) => (u.attachedItems || []).length > 0 || bonusHp(u) > 0);
        return modded.length ? [modded.sort((a, b) => bonusHp(b) - bonusHp(a))[0].instanceId] : [];
      }
      const ranked = [...pool].sort((a, b) => effAttack(b, state) - effAttack(a, state));
      return ranked.slice(0, 2).map((u) => u.instanceId);
    }
  }
  return [undefined]; // leader / self / no explicit target
}

function cpuAction(state: GameState, active: PlayerState, opp: PlayerState): GameAction {
  const baseline = evaluateState(state, active.id);
  const candidates: Candidate[] = [];

  for (const card of active.hand) {
    if (!canAfford(card.cost, active.resources)) continue;
    for (const targetId of candidateTargets(state, card, active, opp)) {
      const action: GameAction = { type: 'PLAY_CARD', instanceId: card.instanceId, targetId };
      const sim = gameReducer(state, action);
      if (!actionLanded(state, sim, active.id)) continue; // pruned: engine rejected / no-op
      candidates.push({ action, score: evaluateState(sim, active.id) - baseline });
      if (card.type !== 'Event' && card.type !== 'Item') break; // one deployment shape is enough
    }
  }

  // Leader Command: ready the strongest spent Unit for another swing when the
  // extra attack is worth more than the resource cost.
  const cmd = keywordValue(active.leader, 'Command');
  if (cmd > 0 && !active.leader.glitched && canAfford({ Generic: cmd }, active.resources) && state.turnNumber > 1) {
    const spent = active.board
      .filter((u) => u.exhausted && u.attacksThisTurn > 0 && u.frozen === 0 && !hasKeyword(u, 'Overdrive'))
      .sort((a, b) => effAttack(b, state) - effAttack(a, state))[0];
    if (spent && effAttack(spent, state) > cmd) {
      candidates.push({
        action: { type: 'LEADER_COMMAND', targetId: spent.instanceId },
        score: effAttack(spent, state) - cmd,
      });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  if (candidates.length > 0 && candidates[0].score > 0.01) return candidates[0].action;

  // Combat: bundle the assault wave once cards stop improving the position.
  if (state.turnNumber > 1 && state.phase === 'ACTION') {
    const canAttack = active.board.some(
      (u) =>
        !u.summoningSickness && u.frozen === 0 && effAttack(u, state) > 0 &&
        (!u.exhausted || (hasKeyword(u, 'Overdrive') && u.attacksThisTurn < 2)) &&
        canAfford({ Generic: attackBurden(u) }, active.resources)
    );
    const leaderCanAttack = leaderAttackIsSafe(state, active, opp);
    if (canAttack || leaderCanAttack) return { type: 'ENTER_COMBAT' };
  }

  return { type: 'END_TURN' };
}

// ---------------------------------------------------------------------------
// Step D: Unified Combat & Layering Solver
// ---------------------------------------------------------------------------
/**
 * Leader Survival Caveat: a Leader-to-Leader strike deals half damage but eats
 * full counter-damage — only go in when the counter plus the opponent's board
 * cannot put our Leader in critical danger next turn.
 */
function leaderAttackIsSafe(state: GameState, active: PlayerState, opp: PlayerState): boolean {
  const leader = active.leader;
  if (leader.exhausted || leader.frozen > 0 || effAttack(leader, state) <= 0) return false;
  const counter = effAttack(opp.leader, state);
  const boardThreat = opp.board.reduce(
    (s, u) => s + (u.frozen === 0 ? effAttack(u, state) : 0),
    0
  );
  const remaining = (leader.health || 0) - leader.damageTaken;
  return remaining - counter - boardThreat > 5;
}

function cpuDeclare(state: GameState, active: PlayerState, opp: PlayerState): GameAction {
  const combat = state.combat!;
  const declaredBurden = combat.attackers.reduce((s, a) => {
    const du = active.board.find((b) => b.instanceId === a.instanceId);
    return s + (du ? attackBurden(du) : 0);
  }, 0);

  // Add every eligible unit that isn't attacking yet (biggest first).
  const ready = [...active.board]
    .filter(
      (u) =>
        !u.summoningSickness && u.frozen === 0 && effAttack(u, state) > 0 &&
        (!u.exhausted || (hasKeyword(u, 'Overdrive') && u.attacksThisTurn < 2)) &&
        canAfford({ Generic: declaredBurden + attackBurden(u) }, active.resources) &&
        !combat.attackers.some((a) => a.instanceId === u.instanceId)
    )
    .sort((a, b) => effAttack(b, state) - effAttack(a, state));
  if (ready.length > 0) {
    return { type: 'TOGGLE_ATTACKER', instanceId: ready[0].instanceId, targetId: opp.leader.instanceId };
  }

  // Join with the Leader when the survival caveat clears.
  const leaderIn = combat.attackers.some((a) => a.instanceId === active.leader.instanceId);
  if (!leaderIn && leaderAttackIsSafe(state, active, opp)) {
    return { type: 'TOGGLE_ATTACKER', instanceId: active.leader.instanceId, targetId: opp.leader.instanceId };
  }

  return { type: 'SUBMIT_ATTACKS' };
}

function cpuBlock(state: GameState, defender: PlayerState): GameAction {
  const combat = state.combat!;
  const attackerActive = state.players[state.activePlayerId];
  const entity = (id: string): GameCard | undefined =>
    [...attackerActive.board, attackerActive.leader, ...defender.board].find((c) => c.instanceId === id);

  const usedBlockers = new Set(combat.blockers.map((b) => b.blockerId));
  const blockedAttackers = new Set(combat.blockers.map((b) => b.attackerId));
  const available = defender.board.filter(
    (u) => !u.exhausted && u.frozen === 0 && !usedBlockers.has(u.instanceId)
  );

  // Total unblocked incoming to the leader.
  let incoming = 0;
  for (const a of combat.attackers) {
    if (blockedAttackers.has(a.instanceId)) continue;
    if (a.targetId === defender.leader.instanceId) {
      const at = entity(a.instanceId);
      if (at) incoming += effAttack(at, state);
    }
  }
  const lethal = incoming >= defender.health;

  // Answer the strongest unblocked attacker first.
  const unblocked = combat.attackers
    .filter((a) => !blockedAttackers.has(a.instanceId))
    .map((a) => ({ a, card: entity(a.instanceId)! }))
    .filter((x) => x.card)
    .sort((x, y) => effAttack(y.card, state) - effAttack(x.card, state));

  for (const { a, card } of unblocked) {
    const atkVal = effAttack(card, state);
    // Stripping-aware trade math: a blocker "kills" only if its attack punches
    // through the attacker's Armor layer plus remaining (bonus-first) health.
    const killsIt = (b: GameCard) => effAttack(b, state) > effArmor(card) + totalRemaining(card, state) - 1;
    let choice = available.find(killsIt);
    if (!choice) choice = available.find((b) => totalRemaining(b, state) + effArmor(b) > atkVal);
    if (!choice && lethal) choice = available[0]; // chump to survive
    if (choice) {
      return { type: 'TOGGLE_BLOCKER', attackerId: a.instanceId, blockerId: choice.instanceId };
    }
  }

  return { type: 'SUBMIT_BLOCKS' };
}

function costTotal(c: GameCard): number {
  if (!c.cost) return 0;
  return Object.values(c.cost).reduce((a, b) => a + b, 0);
}
