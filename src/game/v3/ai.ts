/**
 * Riftbound v5.0 CPU opponent. Plays a full turn through the engine's public
 * actions at main-phase speed: play a Wellspring, develop by curve, use
 * removal on the biggest threat, invoke/use the Leader when useful, attack
 * when profitable, and (as defender) guard to survive lethal. Returns a
 * CpuTurnEvent log the UI replays as animations.
 */
import { CardDef, Effect, LEADER_HP, hasKw, totalCost } from './cards';
import { EssenceType } from './colors';
import {
  GameState,
  GuardAssignments,
  PlayerId,
  UnitInst,
  activateLeaderAbility,
  autoTarget,
  canInvoke,
  canInvokeLeader,
  canPayCost,
  declareAttackers,
  declareGuards,
  effGrit,
  effMight,
  endPhase,
  findUnit,
  invokeCard,
  invokeLeader,
  legalAttackers,
  legalGuardsFor,
  opponentOf,
  playWellspring,
  remainingGrit,
  resolveClash,
  tapLocationForEssence,
  unitHasKw,
  wellspringChoices,
} from './engine';

/** Event log entries the UI animates while replaying the CPU's turn. */
export type CpuTurnEvent =
  | { kind: 'wellspring'; essence: EssenceType }
  | { kind: 'invoke'; name: string; iid: string; targetIid?: string; targetName?: string }
  | { kind: 'leaderInvoke'; name: string }
  | { kind: 'leaderAbility'; name: string; text?: string; targetIid?: string }
  | { kind: 'rebond'; name: string; targetIid: string }
  | { kind: 'attack'; iids: string[]; names: string[] }
  | { kind: 'guard'; assignments: GuardAssignments }
  | { kind: 'clash' }
  | { kind: 'phase'; phase: GameState['phase'] };

export type CpuTurnObserver = (ev: CpuTurnEvent) => void;

// ---------------------------------------------------------------------------
// Mulligan
// ---------------------------------------------------------------------------
function handIsKeepable(hand: { def: CardDef }[]): boolean {
  const cheap = hand.filter((c) => totalCost(c.def.cost) <= 2).length;
  const units = hand.filter((c) => c.def.type === 'Unit').length;
  return cheap >= 1 && units >= 1;
}

/**
 * One-shot opening mulligan for a single player: redraw a hand with no cheap
 * plays or no Units (shuffle back, redraw same size). Returns true if
 * mulliganed.
 */
export function maybeMulliganPlayer(state: GameState, pid: PlayerId, rng: () => number): boolean {
  const p = state.players[pid];
  if (handIsKeepable(p.hand)) return false;
  const n = p.hand.length;
  p.deck.push(...p.hand);
  p.hand = [];
  for (let i = p.deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]];
  }
  for (let i = 0; i < n; i++) {
    const c = p.deck.pop();
    if (c) p.hand.push(c);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Heuristics
// ---------------------------------------------------------------------------
/** Which Wellspring type to play: most-demanded pip color still legal. */
function chooseWellspring(state: GameState, pid: PlayerId): EssenceType | null {
  const p = state.players[pid];
  const choices = wellspringChoices(state, pid);
  if (choices.length === 0) return null;
  const demand: Partial<Record<EssenceType, number>> = {};
  for (const c of p.hand) {
    for (const [t, n] of Object.entries(c.def.cost?.pips ?? {})) {
      demand[t as EssenceType] = (demand[t as EssenceType] ?? 0) + (n ?? 0);
    }
  }
  const have: Partial<Record<EssenceType, number>> = {};
  for (const l of p.locations) have[l.produces] = (have[l.produces] ?? 0) + 1;
  let best = choices[0];
  let bestScore = -Infinity;
  for (const t of choices) {
    const s = (demand[t] ?? 0) - (have[t] ?? 0) * 0.5;
    if (s > bestScore) {
      bestScore = s;
      best = t;
    }
  }
  return best;
}

function tapAllLocations(state: GameState, pid: PlayerId): void {
  for (const l of [...state.players[pid].locations]) {
    if (!l.exhausted) tapLocationForEssence(state, pid, l.iid);
  }
}

function isRemoval(eff?: Effect): boolean {
  return (
    !!eff &&
    (eff.action === 'shatter' || eff.action === 'banish' ||
      (eff.action === 'damage' && (eff.target === 'enemyUnit' || eff.target === 'anyTarget')))
  );
}

/** Value of invoking this card right now. */
function invokePriority(state: GameState, pid: PlayerId, def: CardDef): number {
  const opp = state.players[opponentOf(pid)];
  let v = totalCost(def.cost) * 10; // develop by curve: biggest affordable first
  if (def.type === 'Unit') v += 5;
  if (isRemoval(def.onInvoke)) {
    const biggest = opp.field.filter((u) => !unitHasKw(u, 'Warded'))[0];
    v += biggest ? 20 : -100; // removal only with a live target
  }
  if (def.onInvoke?.target === 'allEnemyUnits' && opp.field.length < 2) v -= 60;
  if (def.type === 'Charm' && state.players[pid].field.length === 0) v -= 200;
  return v;
}

/** Best target iid for a card's onInvoke effect (biggest enemy for removal). */
function chooseTarget(state: GameState, pid: PlayerId, def: CardDef): string | undefined {
  if (!def.onInvoke) return undefined;
  return autoTarget(state, pid, def.onInvoke);
}

function mainPhasePlays(state: GameState, pid: PlayerId, observe?: CpuTurnObserver): void {
  const p = state.players[pid];
  // Play a Wellspring (once per turn) then float all essence.
  if (!p.wellspringPlayedThisTurn) {
    const t = chooseWellspring(state, pid);
    if (t && playWellspring(state, pid, t)) observe?.({ kind: 'wellspring', essence: t });
  }
  tapAllLocations(state, pid);

  // Invoke the Leader once affordable (its abilities are recurring value).
  if (!p.leader.invoked && !p.leader.shattered && canInvokeLeader(state, pid)) {
    if (invokeLeader(state, pid)) observe?.({ kind: 'leaderInvoke', name: p.leader.def.name });
  }

  // Greedily invoke the best affordable cards.
  let progress = true;
  while (progress && !state.winner) {
    progress = false;
    const playable = p.hand
      .filter((c) => canInvoke(state, pid, c.iid))
      .sort((a, b) => invokePriority(state, pid, b.def) - invokePriority(state, pid, a.def));
    for (const c of playable) {
      if (invokePriority(state, pid, c.def) < -50) continue;
      const targetIid = chooseTarget(state, pid, c.def);
      const bondTargetIid =
        c.def.type === 'Charm'
          ? [...p.field].sort((x, y) => effMight(state, y) - effMight(state, x))[0]?.iid
          : undefined;
      const targetName = targetIid ? findUnit(state, targetIid)?.def.name : undefined;
      if (invokeCard(state, pid, c.iid, { targetIid, bondTargetIid })) {
        observe?.({ kind: 'invoke', name: c.def.name, iid: c.iid, targetIid, targetName });
        progress = true;
        break;
      }
    }
  }

  // Leader ability: once per turn, pick the most useful one.
  useLeaderAbility(state, pid, observe);
}

function useLeaderAbility(state: GameState, pid: PlayerId, observe?: CpuTurnObserver): void {
  const p = state.players[pid];
  const L = p.leader;
  if (!L.invoked || L.shattered || L.abilityUsedThisTurn) return;
  const abilities = L.def.leaderAbilities ?? [];
  const opp = state.players[opponentOf(pid)];
  let bestIdx = -1;
  let bestVal = 0;
  abilities.forEach((ab, i) => {
    if (ab.resolveDelta < 0 && L.resolve + ab.resolveDelta < 0) return;
    let v = 0;
    const eff = ab.effect;
    if (isRemoval(eff)) v = opp.field.length > 0 ? 8 : eff.target === 'anyTarget' ? 3 : 0;
    else if (eff.action === 'draw') v = p.hand.length <= 5 ? 5 : 1;
    else if (eff.action === 'buff') v = p.field.length > 0 ? 4 : 0;
    else if (eff.action === 'heal') v = p.vitality < LEADER_HP || p.field.some((u) => u.damage > 0) ? 4 : 0;
    else v = 2;
    // Don't shatter our own Leader for marginal value.
    if (L.resolve + ab.resolveDelta <= 0) v -= 6;
    if (ab.resolveDelta > 0) v += 1; // building resolve is free value
    if (v > bestVal) {
      bestVal = v;
      bestIdx = i;
    }
  });
  if (bestIdx >= 0 && bestVal > 0) {
    const ab = abilities[bestIdx];
    const targetIid = autoTarget(state, pid, ab.effect);
    if (activateLeaderAbility(state, pid, bestIdx, targetIid)) {
      observe?.({ kind: 'leaderAbility', name: L.def.name, text: ab.text, targetIid });
    }
  }
}

/** Pick profitable attackers: always attack when unguardable damage helps;
 * otherwise attack with units that win or force bad trades. */
function chooseAttackers(state: GameState, pid: PlayerId): string[] {
  const opp = state.players[opponentOf(pid)];
  const candidates = legalAttackers(state, pid);
  const defenders = opp.field.filter((u) => !u.exhausted);
  const totalMight = candidates.reduce((s, u) => s + effMight(state, u), 0);
  // Lethal on the table (even through some guards): all-in.
  if (totalMight >= opp.vitality) return candidates.map((u) => u.iid);
  const picked: string[] = [];
  for (const u of candidates) {
    const m = effMight(state, u);
    if (m <= 0) continue;
    const possibleGuards = defenders.filter((g) => {
      if (unitHasKw(u, 'Aerial') && !unitHasKw(g, 'Aerial') && !unitHasKw(g, 'Skywatch'))
        return false;
      return true;
    });
    if (possibleGuards.length === 0) {
      picked.push(u.iid); // free face damage
      continue;
    }
    // Attack if a typical guard trade favors us (we kill and survive, or
    // Quickstrike/Venomous makes the trade cheap).
    const worst = possibleGuards.sort((a, b) => effMight(state, b) - effMight(state, a))[0];
    const kills =
      effMight(state, u) >= remainingGrit(state, worst) || unitHasKw(u, 'Venomous');
    const survives =
      effMight(state, worst) < remainingGrit(state, u) ||
      unitHasKw(u, 'Quickstrike') ||
      unitHasKw(u, 'Unbreakable');
    if (kills && survives) picked.push(u.iid);
    else if (effMight(state, u) >= 4 && survives) picked.push(u.iid);
  }
  return picked;
}

/**
 * Guard assignment heuristic for the defending player: guard to survive
 * lethal first, then take profitable blocks. Exported so the UI can use it
 * for the CPU when the human attacks.
 */
export function chooseGuards(state: GameState, defender: PlayerId): GuardAssignments {
  const clash = state.clash;
  if (!clash) return {};
  const me = state.players[defender];
  const assignments: GuardAssignments = {};
  const used = new Set<string>();
  const attackers = clash.attackers
    .map((iid) => findUnit(state, iid))
    .filter((a): a is UnitInst => !!a)
    .sort((a, b) => effMight(state, b) - effMight(state, a));
  const unguardedDamage = () =>
    attackers
      .filter((a) => !(assignments[a.iid]?.length))
      .reduce((s, a) => s + effMight(state, a), 0);

  for (const attacker of attackers) {
    const legal = legalGuardsFor(state, attacker.iid).filter((g) => !used.has(g.iid));
    if (legal.length === 0) continue;
    const swarm = unitHasKw(attacker, 'Swarmproof');
    const mustSurvive = unguardedDamage() >= me.vitality;
    // Profitable single block: guard kills attacker or survives the hit.
    const scored = legal
      .map((g) => {
        const kills = effMight(state, g) >= remainingGrit(state, attacker) || unitHasKw(g, 'Venomous');
        const survives =
          effMight(state, attacker) < remainingGrit(state, g) || unitHasKw(g, 'Unbreakable');
        let v = 0;
        if (kills) v += 3;
        if (survives) v += 2;
        v -= effMight(state, g) * 0.1; // keep big bodies free if possible
        return { g, v, kills, survives };
      })
      .sort((a, b) => b.v - a.v);
    if (swarm) {
      if (legal.length >= 2 && (mustSurvive || scored[0].kills)) {
        const pair = scored.slice(0, 2).map((s) => s.g.iid);
        assignments[attacker.iid] = pair;
        pair.forEach((iid) => used.add(iid));
      }
      continue;
    }
    const best = scored[0];
    if (mustSurvive || best.kills || best.survives) {
      assignments[attacker.iid] = [best.g.iid];
      used.add(best.g.iid);
    }
  }
  return assignments;
}

// ---------------------------------------------------------------------------
// Full turn
// ---------------------------------------------------------------------------
export interface PlayTurnOptions {
  /** Override guard selection for the defending player during the CPU's
   * clash (the UI passes the human's choices; defaults to chooseGuards). */
  chooseGuardsFor?: (state: GameState, defender: PlayerId) => GuardAssignments;
}

/**
 * Play the CPU's whole turn (must be called with `state.active === pid` in
 * Main1). Returns the event log for the UI to replay. The AI acts at
 * main-phase speed only.
 */
export function playTurn(
  state: GameState,
  pid: PlayerId,
  opts: PlayTurnOptions = {},
): CpuTurnEvent[] {
  const events: CpuTurnEvent[] = [];
  const observe: CpuTurnObserver = (ev) => events.push(ev);
  if (state.winner || state.active !== pid) return events;

  // Main I
  if (state.phase === 'Main1') {
    mainPhasePlays(state, pid, observe);
    if (!state.winner && endPhase(state)) observe({ kind: 'phase', phase: state.phase });
  }

  // Clash
  if (!state.winner && state.phase === 'Clash') {
    const attackers = chooseAttackers(state, pid);
    if (attackers.length > 0 && declareAttackers(state, attackers)) {
      observe({
        kind: 'attack',
        iids: attackers,
        names: attackers.map((iid) => findUnit(state, iid)?.def.name ?? iid),
      });
      const defender = opponentOf(pid);
      const guards = (opts.chooseGuardsFor ?? chooseGuards)(state, defender);
      if (declareGuards(state, guards)) observe({ kind: 'guard', assignments: guards });
      if (resolveClash(state)) observe({ kind: 'clash' });
    }
    if (!state.winner && endPhase(state)) observe({ kind: 'phase', phase: state.phase });
  }

  // Main II — spend anything left (fresh essence from untapped locations).
  if (!state.winner && state.phase === 'Main2') {
    mainPhasePlays(state, pid, observe);
    if (!state.winner && endPhase(state)) observe({ kind: 'phase', phase: state.phase });
  }
  return events;
}
