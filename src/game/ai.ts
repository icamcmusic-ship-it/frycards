import { GameState, GameCard, PlayerState } from '../types';
import {
  GameAction,
  canAfford,
  payCost,
  effAttack,
  totalRemaining,
  bonusHp,
  attackBurden,
  effArmor,
  maxItemCapacity,
  gameReducer,
  kwActive,
  lurkProtected,
} from './engine';
import { hasKeyword, keywordValue } from './cards';

/**
 * Hybrid CPU engine for Shifting Multiverse.
 *
 * Pipeline (per rulebook mechanics):
 *   [Greedy Resource Allocator] — knapsack-style search over die allocations
 *        that maximizes the playable weight of the hand (Pure/Fix aware).
 *   [Action Permutation Pruner] — candidate actions are generated once per
 *        decision point with pre-picked targets, collapsing sequences that
 *        reach identical board states.
 *   [Determinized Board Simulation] — each candidate is simulated through the
 *        real reducer (sampled multiple times for stochastic outcomes such as
 *        Feedback/Echo/Wildcast) and scored with a dynamic evaluation
 *        function; only actions that beat the do-nothing baseline are taken.
 *
 * The evaluation function is
 *   V = w1·LeaderLife + w2·BoardState + w3·HandSize + w4·FloatingMana
 * with weights that shift for the active Location (Location Adaptation
 * Layer) and for status emergencies (an activated Decay Charm on the AI).
 */
export function getCPUAction(state: GameState): GameAction | null {
  if (state.phase === 'INIT' || state.phase === 'GAME_OVER') return null;

  const active = state.players[state.activePlayerId];
  const oppId = state.activePlayerId === state.player1Id ? state.player2Id : state.player1Id;
  const opp = state.players[oppId];

  if (state.phase === 'MULLIGAN') {
    const cpu = [active, opp].find((p) => p.isCPU && !p.mulliganKept);
    if (!cpu) return null;
    return cpuMulligan(cpu);
  }

  // Blocking: the actor is the defender (non-active player).
  if (state.phase === 'COMBAT_BLOCK') {
    if (!opp.isCPU) return null;
    return cpuBlock(state, opp);
  }

  if (!active.isCPU) return null;

  switch (state.phase) {
    case 'TURN_TRANSITION':
      return { type: 'ACKNOWLEDGE_TRANSITION' };
    case 'ROLL':
      return { type: 'ROLL_DICE' };
    case 'ALLOCATE':
      return { type: 'ALLOCATE_RESOURCES', allocations: allocateResources(state) };
    case 'ACTION':
      return chooseAction(state, active, opp);
    case 'COMBAT_DECLARE':
      return declareAttacks(state, active, opp);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Mulligan
// ---------------------------------------------------------------------------
function cpuMulligan(cpu: PlayerState): GameAction {
  const cheapPlays = cpu.hand.filter((c) => costTotal(c) <= 3 && c.type !== 'Location').length;
  if (cpu.mulliganCount === 0 && cheapPlays === 0) {
    return { type: 'MULLIGAN', playerId: cpu.id };
  }
  // Bottom the most expensive cards when a mulligan was taken.
  const bottomIds = [...cpu.hand]
    .sort((a, b) => costTotal(b) - costTotal(a))
    .slice(0, cpu.mulliganCount)
    .map((c) => c.instanceId);
  return { type: 'KEEP_HAND', playerId: cpu.id, bottomIds };
}

// ---------------------------------------------------------------------------
// Step A: Greedy Resource Allocator (knapsack over die allocations)
// ---------------------------------------------------------------------------
function allocateResources(state: GameState): Record<string, number> {
  const me = state.players[state.activePlayerId];
  const roll = state.pendingRoll || 0;
  const elements = me.leader.elements.filter((e) => e !== 'Generic');
  if (roll <= 0 || elements.length === 0) return {};

  let best: Record<string, number> = { [elements[0]]: roll };
  let bestScore = -Infinity;
  for (const alloc of compositions(roll, elements)) {
    const score = allocationScore(state, me, alloc);
    if (score > bestScore) {
      bestScore = score;
      best = alloc;
    }
  }
  return best;
}

/** Every way to split `total` points across the given elements. */
function compositions(total: number, elements: string[]): Record<string, number>[] {
  const out: Record<string, number>[] = [];
  const recur = (idx: number, left: number, acc: Record<string, number>) => {
    if (idx === elements.length - 1) {
      out.push({ ...acc, [elements[idx]]: left });
      return;
    }
    for (let v = 0; v <= left; v++) recur(idx + 1, left - v, { ...acc, [elements[idx]]: v });
  };
  recur(0, total, {});
  return out;
}

/** Playable-weight of the hand under this allocation (greedy knapsack fill). */
function allocationScore(state: GameState, me: PlayerState, alloc: Record<string, number>): number {
  const pool: Record<string, number> = { ...me.resources };
  for (const [el, v] of Object.entries(alloc)) pool[el] = (pool[el] || 0) + v;
  // Pure checks the resulting resource pool: exactly one non-Generic color lit.
  const litColors = Object.entries(pool).filter(([el, v]) => el !== 'Generic' && v > 0).length;
  const singleColor = litColors === 1;

  const ranked = [...me.hand].sort((a, b) => cardPlayValue(state, me, b) - cardPlayValue(state, me, a));
  let weight = 0;
  for (const card of ranked) {
    if (canAfford(card.cost, pool)) {
      payCost(card.cost, pool);
      weight += cardPlayValue(state, me, card);
      if (hasKeyword(card, 'Pure') && singleColor) weight += 2; // Pure bonus lights up
    }
  }
  // Small tiebreak: concentrating a color preserves future Pure plays.
  const colors = Object.values(alloc).filter((v) => v > 0).length;
  return weight * 10 - colors;
}

// ---------------------------------------------------------------------------
// Dynamic evaluation function
// ---------------------------------------------------------------------------
function evaluate(state: GameState, aiId: string): number {
  const me = state.players[aiId];
  const oppId = aiId === state.player1Id ? state.player2Id : state.player1Id;
  const opp = state.players[oppId];

  if (state.winner === aiId) return 100000;
  if (state.winner === oppId) return -100000;

  // Base weights.
  let wLife = 3.0;
  const wBoard = 1.0;
  const wHand = 1.4;
  const wMana = 0.4;

  // Status Emergency Modifier: an activated hostile Decay Charm on the AI
  // forces survival/cleanse behavior by inflating the life weight.
  const decayed = me.charms.some((c) => c.charmActivated && hasKeyword(c, 'Decay') && c.ownerId !== aiId);
  if (decayed) wLife *= 1.7;
  if (me.health <= 8) wLife *= 1.5; // critical health

  const boardVal = (p: PlayerState) => p.board.reduce((s, u) => s + unitValue(u, state), 0);
  const floating = Object.values(me.resources).reduce((a, b) => a + b, 0);

  // Charms are permanents too: a charm on your own profile that you cast is
  // an asset (Ward, Boost, Sync, Beacon, ...); a charm someone else stuck on
  // you (Decay) is a liability. Without this term the hand-size weight makes
  // every charm play look like a net loss and the CPU never casts one.
  const charmVal = (p: PlayerState) =>
    p.charms.reduce((s, c) => s + (c.ownerId === p.id ? costTotal(c) + 1 : -(costTotal(c) + 1)), 0);

  // Face-down Locations: the Shell Game hands control to the FLIPPER, so a
  // non-Symmetric Location in your zone mostly works for the opponent — only
  // Symmetric ones are clearly worth committing from hand.
  const locVal = (p: PlayerState) =>
    p.locations.reduce((s, l) => s + (hasKeyword(l, 'Symmetric') ? 1.8 : 0.4), 0);

  return (
    wLife * (me.health - opp.health) +
    wBoard * (boardVal(me) - boardVal(opp)) +
    wHand * (me.hand.length - opp.hand.length) +
    0.8 * (charmVal(me) - charmVal(opp)) +
    (locVal(me) - locVal(opp)) +
    wMana * Math.min(floating, 4) // a small persistent-mana buffer is good; hoarding is not
  );
}

/** Location-adaptive per-unit value. */
function unitValue(u: GameCard, state: GameState): number {
  const atk = effAttack(u, state);
  const hp = totalRemaining(u, state);
  if (hp <= 0) return 0;
  let v = atk * 1.1 + hp * 0.9;
  // Keyword premiums.
  if (kwActive(u, 'Guard')) v += 1.5;
  if (kwActive(u, 'Pierce')) v += 1;
  if (kwActive(u, 'Siphon')) v += 1;
  if (kwActive(u, 'Lurk')) v += 1;
  if (kwActive(u, 'Overdrive')) v += atk * 0.5;
  if (kwActive(u, 'Reap')) v += 1;
  if (kwActive(u, 'Feedback')) v += 1;
  if (kwActive(u, 'Ward')) v += 0.5;
  v += kwActive(u, 'Wither') ? keywordValue(u, 'Wither') * 0.8 : 0;
  v += kwActive(u, 'Sustain') ? keywordValue(u, 'Sustain') * 0.5 : 0;
  if (u.glitched) v *= 0.8; // temporarily keyword-dead
  v += effArmor(u) * 0.8;
  // Location Adaptation Layer: under a SCORCH_ALL Location, units about to
  // burn out are worth almost nothing.
  if (state.activeLocation?.locEffect === 'SCORCH_ALL' && hp <= 1) v *= 0.25;
  if (u.frozen > 0) v *= 0.6;
  if (u.scorch >= hp) v *= 0.3; // will die to its scorch counter
  return v;
}

function cardPlayValue(state: GameState, me: PlayerState, card: GameCard): number {
  const base = costTotal(card);
  switch (card.type) {
    case 'Unit':
      return base + ((card.attack || 0) + (card.health || 0)) * 0.3 + 1;
    case 'Item':
      return me.board.length > 0 ? base + 0.5 : 0;
    case 'Event':
      return base + eventUrgency(state, me, card);
    case 'Charm':
      return base + 0.5;
    case 'Location':
      return me.locations.length < 2 ? 1 : 0.25;
    default:
      return base;
  }
}

function eventUrgency(state: GameState, me: PlayerState, card: GameCard): number {
  const eff = card.effect;
  if (!eff) return 0;
  const decayed = me.charms.some((c) => c.charmActivated && hasKeyword(c, 'Decay') && c.ownerId !== me.id);
  if (eff.action === 'heal' && (me.leader.damageTaken > 4 || decayed)) return 2.5;
  if (eff.action === 'purge' && decayed) return 3;
  return 0.5;
}

// ---------------------------------------------------------------------------
// Damage math helpers (Armor + Brittle + Stripping Rule aware)
// ---------------------------------------------------------------------------
/** Raw damage a single hit needs to destroy `card` outright. */
function damageToKill(card: GameCard, state: GameState): number {
  const need = totalRemaining(card, state) + effArmor(card);
  return kwActive(card, 'Brittle') ? Math.ceil(need / 2) : need;
}

// ---------------------------------------------------------------------------
// Step 2: Action phase — candidate generation + determinized simulation
// ---------------------------------------------------------------------------
interface Candidate {
  action: GameAction;
  /** dedupe key for the Action Permutation Pruner */
  key: string;
}

function chooseAction(state: GameState, me: PlayerState, opp: PlayerState): GameAction {
  const aiId = me.id;
  const baseline = evaluate(state, aiId);

  // Floating Resource Value (Step B): reserve a buffer late in the turn if a
  // reactive Event is in hand and combat has already happened.
  const floating = Object.values(me.resources).reduce((a, b) => a + b, 0);
  const holdsEvent = me.hand.some((c) => c.type === 'Event' && costTotal(c) <= floating);

  // Lethal-first: if the defender cannot block and the open swing wins the
  // game, take it immediately instead of shopping for value plays.
  if (state.turnNumber > 1 && !state.combat) {
    const canBlock = opp.board.some((u) => !u.exhausted && u.frozen === 0);
    if (!canBlock) {
      const plan = planAttackWave(state, me, opp);
      const swing = plan.reduce((s, p) => {
        const u = p.instanceId === me.leader.instanceId ? me.leader : me.board.find((b) => b.instanceId === p.instanceId);
        if (!u || p.targetId !== opp.leader.instanceId) return s;
        const atk = effAttack(u, state);
        return s + (u.type === 'Leader' ? Math.max(1, Math.floor(atk / 2)) : atk);
      }, 0);
      if (swing >= opp.health) return { type: 'ENTER_COMBAT' };
    }
  }

  const candidates = generateCandidates(state, me, opp);
  let best: Candidate | null = null;
  let bestScore = baseline + 0.05;

  for (const cand of candidates) {
    const score = simulateAction(state, cand.action, aiId);
    if (score === null) continue; // illegal / no-op — pruned
    let adjusted = score;
    // Mana buffer: mildly penalize burning the last resources on a weak play
    // when a reactive Event could be held up instead.
    if (holdsEvent && cand.action.type === 'PLAY_CARD') {
      const played = me.hand.find((c) => c.instanceId === (cand.action as any).instanceId);
      if (played && played.type !== 'Unit' && costTotal(played) >= floating - 1) adjusted -= 0.6;
    }
    if (adjusted > bestScore) {
      bestScore = adjusted;
      best = cand;
    }
  }
  if (best) return best.action;

  // Combat macro-action: bundle all profitable attackers into one wave.
  // Only enter combat if the reducer will actually accept at least one of the
  // planned declarations — otherwise ENTER_COMBAT → cancel → ENTER_COMBAT
  // would loop forever (e.g. Burden or the Leader Survival Caveat disagreeing
  // with the plan).
  if (state.turnNumber > 1 && !state.combat) {
    const plan = planAttackWave(state, me, opp);
    if (plan.length > 0) {
      const probe = gameReducer(state, { type: 'ENTER_COMBAT' });
      const accepted = plan.some(
        (p) =>
          (gameReducer(probe, { type: 'TOGGLE_ATTACKER', instanceId: p.instanceId, targetId: p.targetId })
            .combat?.attackers.length ?? 0) > 0
      );
      if (accepted) return { type: 'ENTER_COMBAT' };
    }
  }

  // Leader Command: re-ready a strong attacker for a second strike.
  const commandAct = considerCommand(state, me, opp);
  if (commandAct) return commandAct;

  return { type: 'END_TURN' };
}

/** Simulate an action through the real reducer; average over samples. */
function simulateAction(state: GameState, action: GameAction, aiId: string): number | null {
  const isStochastic =
    action.type === 'PLAY_CARD' || action.type === 'ACTIVATE_ABILITY';
  const samples = isStochastic ? 3 : 1;
  let total = 0;
  let changed = false;
  for (let i = 0; i < samples; i++) {
    const next = gameReducer(state, action);
    if (next.log.length !== state.log.length || next.phase !== state.phase) changed = true;
    total += evaluate(next, aiId);
  }
  if (!changed) return null; // reducer rejected it — prune
  return total / samples;
}

function generateCandidates(state: GameState, me: PlayerState, opp: PlayerState): Candidate[] {
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const push = (action: GameAction, key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ action, key });
  };

  const castable = (c: GameCard) => canAfford(c.cost, me.resources);

  for (const card of me.hand) {
    if (!castable(card)) continue;
    if (card.type === 'Unit' || card.type === 'Charm' || card.type === 'Location') {
      push({ type: 'PLAY_CARD', instanceId: card.instanceId }, `${card.id}`);
    } else if (card.type === 'Item') {
      for (const host of itemHosts(state, me)) {
        push({ type: 'PLAY_CARD', instanceId: card.instanceId, targetId: host.instanceId }, `${card.id}>${host.id}`);
      }
    } else if (card.type === 'Event') {
      for (const tgt of eventTargets(state, card, me, opp)) {
        push(
          { type: 'PLAY_CARD', instanceId: card.instanceId, targetId: tgt || undefined },
          `${card.id}>${tgt || 'none'}`
        );
      }
    }
  }

  // Activated abilities on the Leader and board Units (once per turn).
  const abilitySources = [me.leader, ...me.board].filter(
    (c) =>
      c.effect &&
      !c.abilityUsedThisTurn &&
      !c.glitched &&
      c.frozen === 0 &&
      canAfford(c.cost, me.resources)
  );
  for (const src of abilitySources) {
    for (const tgt of eventTargets(state, src, me, opp)) {
      push(
        { type: 'ACTIVATE_ABILITY', instanceId: src.instanceId, targetId: tgt || undefined },
        `ab:${src.id}>${tgt || 'none'}`
      );
    }
  }

  // Graveborn casts from the graveyard.
  for (const card of me.graveyard) {
    if (card.type === 'Unit' && kwActive(card, 'Graveborn') && castable(card)) {
      push({ type: 'PLAY_CARD', instanceId: card.instanceId }, `gy:${card.id}`);
    }
  }
  return out;
}

/** Best Item hosts: prefer ready attackers with spare capacity. */
function itemHosts(state: GameState, me: PlayerState): GameCard[] {
  return [...me.board]
    .filter((u) => u.type === 'Unit' && u.attachedItems.length < maxItemCapacity(u))
    .sort((a, b) => {
      const score = (u: GameCard) =>
        effAttack(u, state) + totalRemaining(u, state) + (u.summoningSickness ? -2 : 0);
      return score(b) - score(a);
    })
    .slice(0, 2);
}

/**
 * Candidate targets for an Event ('' = no target needed).
 * The Stripping Rule filter lives here: Meltdown/Purge hunt for enemy Units
 * carrying bonus (Item) health, since erasing that tier erases assigned damage.
 */
function eventTargets(state: GameState, ev: GameCard, me: PlayerState, opp: PlayerState): string[] {
  const eff = ev.effect;
  if (!eff) return [''];
  const val = (eff.value || 0) + (hasKeyword(ev, 'Pure') && me.singleColorRoll ? 2 : 0);
  const enemyTargetable = opp.board.filter((u) => u.type === 'Unit' && !lurkProtected(u));
  const byThreat = [...enemyTargetable].sort((a, b) => unitValue(b, state) - unitValue(a, state));

  switch (eff.action) {
    case 'meltdown': {
      // Prefer the host whose bonus-health tier is largest.
      const hosts = enemyTargetable
        .filter((u) => (u.attachedItems || []).length > 0)
        .sort((a, b) => bonusHp(b) - bonusHp(a));
      return hosts.slice(0, 2).map((u) => u.instanceId);
    }
    case 'purge': {
      const modded = enemyTargetable
        .filter((u) => (u.attachedItems || []).length > 0 || u.tempAtk > 0 || bonusHp(u) > 0)
        .sort((a, b) => bonusHp(b) + itemCount(b) - (bonusHp(a) + itemCount(a)));
      // Purging our own Leader strips hostile Charms (Status Emergency).
      const selfCleanse = me.charms.some((c) => c.charmActivated && c.ownerId !== me.id)
        ? [me.leader.instanceId]
        : [];
      return [...modded.slice(0, 1).map((u) => u.instanceId), ...selfCleanse];
    }
    case 'damage': {
      if (eff.target === 'leader') return [''];
      // Prefer clean kills, then biggest threat.
      const kills = byThreat.filter((u) => damageToKill(u, state) <= val);
      const pool = kills.length > 0 ? kills : byThreat;
      return pool.slice(0, 2).map((u) => u.instanceId);
    }
    case 'freeze': {
      const t = [...enemyTargetable].sort((a, b) => effAttack(b, state) - effAttack(a, state))[0];
      return t && effAttack(t, state) > 0 ? [t.instanceId] : [];
    }
    case 'scorch': {
      return byThreat.slice(0, 1).map((u) => u.instanceId);
    }
    case 'obliterate': {
      // Obliterate only what's worth the card.
      return byThreat.filter((u) => unitValue(u, state) >= 4).slice(0, 1).map((u) => u.instanceId);
    }
    case 'buff': {
      if (eff.target === 'friendly') {
        const t = [...me.board]
          .filter((u) => u.type === 'Unit' && !u.summoningSickness && u.frozen === 0)
          .sort((a, b) => effAttack(b, state) - effAttack(a, state))[0];
        return t ? [t.instanceId] : [];
      }
      return [''];
    }
    case 'heal':
      return me.leader.damageTaken >= Math.max(2, val) ? [''] : [];
    case 'draw':
      // Deckout Law: drawing from an empty deck hurts.
      return me.deck.length > (eff.value || 1) ? [''] : [];
    case 'manifest':
      return [''];
    default:
      return eff.target === 'unit' ? byThreat.slice(0, 1).map((u) => u.instanceId) : [''];
  }
}

function itemCount(u: GameCard): number {
  return (u.attachedItems || []).length;
}

// ---------------------------------------------------------------------------
// Step D: Unified Combat & Layering Solver
// ---------------------------------------------------------------------------
interface AttackPlan {
  instanceId: string;
  targetId: string;
}

/** Decide the macro attack wave for this turn. */
function planAttackWave(state: GameState, me: PlayerState, opp: PlayerState): AttackPlan[] {
  const plan: AttackPlan[] = [];
  const readyBlockers = opp.board.filter((u) => !u.exhausted && u.frozen === 0);
  const guards = readyBlockers.filter((u) => kwActive(u, 'Guard'));

  let burdenBudget = Object.values(me.resources).reduce((a, b) => a + b, 0);
  const eligible = me.board.filter((u) => {
    const maxAttacks = kwActive(u, 'Overdrive') ? 2 : 1;
    return (
      !u.summoningSickness &&
      u.frozen === 0 &&
      u.attacksThisTurn < maxAttacks &&
      effAttack(u, state) > 0
    );
  });

  // Unblocked leader damage if everything swings.
  const totalSwing = eligible.reduce((s, u) => s + effAttack(u, state), 0);
  const lethalPush = totalSwing >= opp.health && guards.length === 0;

  // Guard Clearing Solver: while ANY ready Guard stands, every attack not
  // explicitly aimed at a Guard gets redirected onto whichever Guard the
  // engine finds first (§5.2 Interlock) — so with 2+ simultaneous Guards,
  // always aiming at "the" Guard would dog-pile every attacker onto one and
  // let the rest survive forever, permanently locking out Leader damage.
  // Track outstanding lethal need per Guard and finish off the
  // closest-to-dead one first so multiple Guards can die in the same wave.
  const guardNeed = new Map(guards.map((g) => [g.instanceId, damageToKill(g, state)]));
  const pickGuardTarget = (): GameCard | undefined => {
    const alive = guards.filter((g) => (guardNeed.get(g.instanceId) ?? 0) > 0);
    if (alive.length === 0) return guards[0];
    return alive.sort((a, b) => (guardNeed.get(a.instanceId) ?? 0) - (guardNeed.get(b.instanceId) ?? 0))[0];
  };

  for (const u of [...eligible].sort((a, b) => effAttack(b, state) - effAttack(a, state))) {
    const burden = attackBurden(u);
    if (burden > burdenBudget) continue;
    const atk = effAttack(u, state);
    const uHp = totalRemaining(u, state);
    // Interlock awareness: if a Guard stands, we hit one; evaluate that trade.
    const interceptor = guards.length > 0 ? pickGuardTarget() : undefined;
    if (interceptor) {
      const need = guardNeed.get(interceptor.instanceId) ?? damageToKill(interceptor, state);
      const dieToCounter = effAttack(interceptor, state) >= uHp && !kwActive(u, 'Lurk');
      const killsGuard = atk >= need;
      if (dieToCounter && !killsGuard && unitValue(u, state) > unitValue(interceptor, state) * 0.8) continue;
    } else if (!lethalPush && readyBlockers.length > 0) {
      // A blocker that eats us and survives makes this attack a pure loss —
      // unless our value is low (acceptable trade bait) or we have Pierce.
      const eaten = readyBlockers.some(
        (b) => effAttack(b, state) >= uHp && damageToKill(b, state) > atk
      );
      if (eaten && !kwActive(u, 'Pierce') && unitValue(u, state) >= 4) continue;
    }
    // Trade solver: prefer a profitable strike on an enemy Unit over a leader
    // hit when the trade clearly wins value (kill without dying, or kill a
    // bigger threat). Lurk-protected units cannot be chosen.
    let targetId = opp.leader.instanceId;
    if (interceptor) {
      targetId = interceptor.instanceId;
      guardNeed.set(interceptor.instanceId, (guardNeed.get(interceptor.instanceId) ?? 0) - atk);
    } else if (!lethalPush) {
      const trades = opp.board
        .filter((e) => e.type === 'Unit' && !lurkProtected(e) && atk >= damageToKill(e, state))
        .map((e) => ({ e, counter: effAttack(e, state) }))
        .filter(
          ({ e, counter }) =>
            counter < uHp || unitValue(e, state) > unitValue(u, state) * 1.2
        )
        .sort((x, y) => unitValue(y.e, state) - unitValue(x.e, state));
      const bestTrade = trades[0];
      if (bestTrade && unitValue(bestTrade.e, state) >= 3.5) {
        targetId = bestTrade.e.instanceId;
      }
    }
    plan.push({ instanceId: u.instanceId, targetId });
    burdenBudget -= burden;
  }

  // Leader Survival Caveat: a Leader strike takes full counter-damage.
  const leader = me.leader;
  if (!leader.exhausted && leader.frozen === 0 && effAttack(leader, state) > 0 && guards.length === 0) {
    const counter = effAttack(opp.leader, state);
    const remaining = (leader.health || 0) - leader.damageTaken;
    const halfDmg = Math.max(1, Math.floor(effAttack(leader, state) / 2));
    const oppThreat = opp.board.reduce((s, u) => s + effAttack(u, state), 0) + effAttack(opp.leader, state);
    const survivable = counter < remaining && remaining - counter > Math.min(oppThreat, 8);
    const finishing = totalSwing + halfDmg >= opp.health;
    if ((finishing && counter < remaining) || (survivable && halfDmg >= 2)) {
      plan.push({ instanceId: leader.instanceId, targetId: opp.leader.instanceId });
    }
  }
  return plan;
}

function declareAttacks(state: GameState, me: PlayerState, opp: PlayerState): GameAction {
  const combat = state.combat!;
  const plan = planAttackWave(state, me, opp);
  for (const p of plan) {
    if (!combat.attackers.some((a) => a.instanceId === p.instanceId)) {
      const action: GameAction = { type: 'TOGGLE_ATTACKER', instanceId: p.instanceId, targetId: p.targetId };
      // Verify the reducer actually accepts this declaration; otherwise the AI
      // would re-dispatch the same rejected toggle forever (e.g. Burden or the
      // Leader Survival Caveat disagreeing with the plan).
      const probe = gameReducer(state, action);
      if ((probe.combat?.attackers.length ?? 0) > combat.attackers.length) return action;
    }
  }
  return { type: 'SUBMIT_ATTACKS' };
}

/** Command [X]: pay to re-ready a strong Unit for another swing. */
function considerCommand(state: GameState, me: PlayerState, opp: PlayerState): GameAction | null {
  const x = keywordValue(me.leader, 'Command');
  if (x <= 0 || me.leader.glitched || me.leader.frozen > 0) return null;
  if (state.turnNumber <= 1) return null;
  if (!canAfford({ Generic: x }, me.resources)) return null;
  // Only worth it for a unit that already attacked and hits harder than the cost.
  const target = [...me.board]
    .filter((u) => u.attacksThisTurn > 0 && u.frozen === 0 && effAttack(u, state) > x)
    .sort((a, b) => effAttack(b, state) - effAttack(a, state))[0];
  if (!target) return null;
  // Make sure the re-readied unit will actually attack again profitably.
  const readyGuard = opp.board.some((u) => kwActive(u, 'Guard') && !u.exhausted && u.frozen === 0);
  if (readyGuard && effAttack(target, state) < 3) return null;
  return { type: 'LEADER_COMMAND', targetId: target.instanceId };
}

// ---------------------------------------------------------------------------
// Blocking (defender side) — trade solver with Stripping-Rule awareness
// ---------------------------------------------------------------------------
function cpuBlock(state: GameState, defender: PlayerState): GameAction {
  const combat = state.combat!;
  const attackerSide = state.players[state.activePlayerId];
  const entity = (id: string): GameCard | undefined =>
    [attackerSide.leader, ...attackerSide.board, ...defender.board].find((c) => c.instanceId === id);

  const usedBlockers = new Set(combat.blockers.map((b) => b.blockerId));
  const blockedAttackers = new Set(combat.blockers.map((b) => b.attackerId));
  const available = defender.board.filter(
    (u) => !u.exhausted && u.frozen === 0 && u.type === 'Unit' && !usedBlockers.has(u.instanceId)
  );

  // Incoming unblocked damage headed at the Leader.
  let incoming = 0;
  for (const a of combat.attackers) {
    if (blockedAttackers.has(a.instanceId)) continue;
    const at = entity(a.instanceId);
    if (!at) continue;
    if (a.targetId === defender.leader.instanceId) {
      const raw = effAttack(at, state);
      incoming += at.type === 'Leader' ? Math.max(1, Math.floor(raw / 2)) : raw;
    }
  }
  const lethal = incoming >= defender.health;

  const unblocked = combat.attackers
    .filter((a) => !blockedAttackers.has(a.instanceId))
    .map((a) => ({ a, card: entity(a.instanceId)! }))
    .filter((x) => !!x.card)
    .sort((x, y) => effAttack(y.card, state) - effAttack(x.card, state));

  for (const { a, card } of unblocked) {
    const atkVal = effAttack(card, state);
    const isLeaderAttacker = card.type === 'Leader';
    const attackerLife = isLeaderAttacker ? (card.health || 0) - card.damageTaken : 0;
    const scoreBlock = (b: GameCard): number => {
      // Blocking an enemy Leader: it takes the blocker's full counter-damage
      // and its strike is soaked — often free value, lethal if it finishes it.
      if (isLeaderAttacker) {
        const kills = effAttack(b, state) >= attackerLife;
        const survives = damageToKill(b, state) > atkVal;
        let s = effAttack(b, state) * 0.5; // chip the enemy Leader
        if (kills) s += 100; // blocking wins the game
        if (survives) s += unitValue(b, state) * 0.5;
        else s -= unitValue(b, state) * 0.7;
        return s;
      }
      const kills = effAttack(b, state) >= damageToKill(card, state);
      const survives = damageToKill(b, state) > atkVal;
      let s = 0;
      if (kills) s += unitValue(card, state) + 2;
      if (survives) s += unitValue(b, state) * 0.5;
      if (!kills && !survives) s -= unitValue(b, state); // pure chump
      if (kwActive(card, 'Pierce') && !kills) s -= 1; // overflow still lands
      return s;
    };
    const ranked = [...available].sort((x, y) => scoreBlock(y) - scoreBlock(x));
    const top = ranked[0];
    if (top && (scoreBlock(top) > 0 || lethal)) {
      return { type: 'TOGGLE_BLOCKER', attackerId: a.instanceId, blockerId: top.instanceId };
    }
  }

  // Gang-blocking: pile a spare blocker onto an already-blocked attacker when
  // the current blocks won't kill it and the extra counter-damage will.
  if (available.length > 0) {
    for (const a of combat.attackers) {
      const card = entity(a.instanceId);
      if (!card || card.type === 'Leader') continue;
      const existing = combat.blockers.filter((b) => b.attackerId === a.instanceId);
      if (existing.length === 0) continue;
      const counterSoFar = existing.reduce((s, b) => {
        const bl = entity(b.blockerId);
        return s + (bl ? effAttack(bl, state) : 0);
      }, 0);
      const need = damageToKill(card, state);
      if (counterSoFar >= need) continue; // already dies
      const helper = available.find(
        (b) => counterSoFar + effAttack(b, state) >= need &&
          (unitValue(card, state) > unitValue(b, state) || damageToKill(b, state) > effAttack(card, state))
      );
      if (helper) {
        return { type: 'TOGGLE_BLOCKER', attackerId: a.instanceId, blockerId: helper.instanceId };
      }
    }
  }

  return { type: 'SUBMIT_BLOCKS' };
}

function costTotal(c: GameCard): number {
  if (!c.cost) return 0;
  return Object.values(c.cost).reduce((a, b) => a + b, 0);
}
