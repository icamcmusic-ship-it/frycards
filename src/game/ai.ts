import { GameState, GameCard } from '../types';
import { GameAction, canAfford, effAttack, totalRemaining, attackBurden } from './engine';
import { hasKeyword } from './cards';

/**
 * A basic CPU. Returns the single next action the CPU should take, or null if
 * it is the human player's turn to act. The caller dispatches the action and
 * calls again, letting the CPU play out its turn step by step.
 */
export function getCPUAction(state: GameState): GameAction | null {
  if (state.phase === 'INIT' || state.phase === 'GAME_OVER') return null;

  const active = state.players[state.activePlayerId];
  const oppId = state.activePlayerId === state.player1Id ? state.player2Id : state.player1Id;
  const opp = state.players[oppId];

  // Mulligan: the CPU always keeps its opening hand.
  if (state.phase === 'MULLIGAN') {
    if (active.isCPU && !active.mulliganKept) return { type: 'KEEP_HAND', playerId: active.id };
    if (opp.isCPU && !opp.mulliganKept) return { type: 'KEEP_HAND', playerId: opp.id };
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

function cpuAllocate(state: GameState): Record<string, number> {
  const active = state.players[state.activePlayerId];
  const els = active.leader.elements.filter((e) => e !== 'Generic');
  let roll = state.pendingRoll || 0;
  const alloc: Record<string, number> = {};
  if (roll <= 0 || els.length === 0) return alloc;
  // Put 1 in each supported element so either colour is playable, dump the rest in the first.
  for (const e of els) {
    if (roll <= 0) break;
    alloc[e] = (alloc[e] || 0) + 1;
    roll -= 1;
  }
  if (roll > 0) alloc[els[0]] = (alloc[els[0]] || 0) + roll;
  return alloc;
}

function cpuAction(state: GameState, active: any, opp: any): GameAction {
  // 1. Deploy the most expensive affordable Unit.
  const units = active.hand
    .filter((c: GameCard) => c.type === 'Unit' && canAfford(c.cost, active.resources))
    .sort((a: GameCard, b: GameCard) => costTotal(b) - costTotal(a));
  if (units.length > 0) return { type: 'PLAY_CARD', instanceId: units[0].instanceId };

  // 2. Attach an Item to a friendly Unit.
  const items = active.hand.filter((c: GameCard) => c.type === 'Item' && canAfford(c.cost, active.resources));
  if (items.length > 0 && active.board.length > 0) {
    const host = active.board[0];
    return { type: 'PLAY_CARD', instanceId: items[0].instanceId, targetId: host.instanceId };
  }

  // 3. Cast an Event with a sensible target.
  const events = active.hand.filter((c: GameCard) => c.type === 'Event' && canAfford(c.cost, active.resources));
  for (const ev of events) {
    const tgt = eventTarget(state, ev, active, opp);
    if (tgt !== undefined) return { type: 'PLAY_CARD', instanceId: ev.instanceId, targetId: tgt };
  }

  // 4. Play a Charm (attaches to a player profile, no explicit target).
  const charms = active.hand.filter((c: GameCard) => c.type === 'Charm' && canAfford(c.cost, active.resources));
  if (charms.length > 0) return { type: 'PLAY_CARD', instanceId: charms[0].instanceId };

  // 5. Deploy a Location face-down.
  const locs = active.hand.filter((c: GameCard) => c.type === 'Location' && canAfford(c.cost, active.resources));
  if (locs.length > 0) return { type: 'PLAY_CARD', instanceId: locs[0].instanceId };

  // 6. Attack if any unit can (and its Burden surcharge is payable).
  if (state.turnNumber > 1) {
    const canAttack = active.board.some(
      (u: GameCard) => !u.summoningSickness && u.frozen === 0 && effAttack(u, state) > 0 &&
        (!u.exhausted || (hasKeyword(u, 'Overdrive') && u.attacksThisTurn < 2)) &&
        canAfford({ Generic: attackBurden(u) }, active.resources)
    );
    if (canAttack) return { type: 'ENTER_COMBAT' };
  }

  // 7. Nothing left to do.
  return { type: 'END_TURN' };
}

/** Returns a target instanceId (or '' for none-needed), or undefined if uncastable. */
function eventTarget(state: GameState, ev: GameCard, active: any, opp: any): string | undefined {
  const eff = ev.effect;
  if (!eff) return '';
  if (eff.action === 'meltdown') {
    // needs an enemy unit with an attached Item
    const target = opp.board.find((u: GameCard) => (u.attachedItems || []).length > 0);
    return target ? target.instanceId : undefined;
  }
  if (eff.action === 'purge') {
    // worthwhile only against a modified enemy unit
    const target = opp.board.find(
      (u: GameCard) => (u.attachedItems || []).length > 0 || u.tempAtk > 0 || u.tempHp > 0
    );
    return target ? target.instanceId : undefined;
  }
  if (eff.target === 'unit') {
    // needs an enemy unit
    const target = [...opp.board].sort((a, b) => effAttack(b, state) - effAttack(a, state))[0];
    return target ? target.instanceId : undefined;
  }
  if (eff.target === 'friendly') {
    const target = active.board[0];
    return target ? target.instanceId : undefined;
  }
  return ''; // leader / self / draw / manifest — no explicit target
}

function cpuDeclare(state: GameState, active: any, opp: any): GameAction {
  const combat = state.combat!;
  // Total Burden already committed by declared attackers.
  const declaredBurden = combat.attackers.reduce((s, a) => {
    const du = active.board.find((b: GameCard) => b.instanceId === a.instanceId);
    return s + (du ? attackBurden(du) : 0);
  }, 0);
  // Add every eligible unit that isn't attacking yet.
  for (const u of active.board) {
    const eligible =
      !u.summoningSickness && u.frozen === 0 && effAttack(u, state) > 0 &&
      (!u.exhausted || (hasKeyword(u, 'Overdrive') && u.attacksThisTurn < 2)) &&
      canAfford({ Generic: declaredBurden + attackBurden(u) }, active.resources);
    const already = combat.attackers.some((a) => a.instanceId === u.instanceId);
    if (eligible && !already) {
      return { type: 'TOGGLE_ATTACKER', instanceId: u.instanceId, targetId: opp.leader.instanceId };
    }
  }
  return { type: 'SUBMIT_ATTACKS' };
}

function cpuBlock(state: GameState, defender: any): GameAction {
  const combat = state.combat!;
  const attackerActive = state.players[state.activePlayerId];
  const entity = (id: string): GameCard | undefined =>
    [...attackerActive.board, attackerActive.leader, ...defender.board].find((c) => c.instanceId === id);

  const usedBlockers = new Set(combat.blockers.map((b) => b.blockerId));
  const blockedAttackers = new Set(combat.blockers.map((b) => b.attackerId));
  const available = defender.board.filter(
    (u: GameCard) => !u.exhausted && u.frozen === 0 && !usedBlockers.has(u.instanceId)
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

  // Find the strongest unblocked attacker to answer.
  const unblocked = combat.attackers
    .filter((a) => !blockedAttackers.has(a.instanceId))
    .map((a) => ({ a, card: entity(a.instanceId)! }))
    .filter((x) => x.card)
    .sort((x, y) => effAttack(y.card, state) - effAttack(x.card, state));

  for (const { a, card } of unblocked) {
    const atkVal = effAttack(card, state);
    // Prefer a blocker that kills the attacker, then one that survives.
    let choice = available.find((b: GameCard) => effAttack(b, state) >= totalRemaining(card, state));
    if (!choice) choice = available.find((b: GameCard) => totalRemaining(b, state) > atkVal);
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
