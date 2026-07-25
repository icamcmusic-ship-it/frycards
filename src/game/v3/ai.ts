/**
 * Fry Cards v5.0 CPU opponent. Plays a full turn through the engine's public
 * actions at main-phase speed: play a Wellspring, develop by curve, use
 * removal on the biggest threat, invoke/use the Leader when useful, attack
 * when profitable, and (as defender) guard to survive lethal. Returns a
 * CpuTurnEvent log the UI replays as animations.
 */
import { CardDef, Effect, EssenceCost, LEADER_HP, hasKw, totalCost } from './cards';
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
  effMight,
  effectiveCost,
  endPhase,
  findUnit,
  locationYield,
  mulliganHand,
  invokeCard,
  invokeLeader,
  legalAttackers,
  legalGuardsFor,
  opponentOf,
  playWellspring,
  rebondCharm,
  remainingGrit,
  resolveClash,
  tapLocationForEssence,
  unitHasKw,
  wellspringChoices,
} from './engine';

/** Event log entries the UI animates while replaying the CPU's turn. */
export type CpuTurnEvent =
  | { kind: 'wellspring'; essence: EssenceType }
  | {
      kind: 'invoke';
      name: string;
      iid: string;
      targetIid?: string;
      targetName?: string;
      /** Set when the DEFENDER invoked this during the clash reaction window. */
      by?: PlayerId;
    }
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
 * plays or no Units. Rulebook §3: the new hand is one card SMALLER (engine
 * mulliganHand), so the CPU only mulls genuinely dead hands, and only once.
 * Returns true if mulliganed.
 */
export function maybeMulliganPlayer(state: GameState, pid: PlayerId, _rng: () => number): boolean {
  const p = state.players[pid];
  if (handIsKeepable(p.hand)) return false;
  return mulliganHand(state, pid);
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
  // The Leader still has to be paid for too — count its pips until invoked.
  if (!p.leader.invoked && !p.leader.shattered) {
    for (const [t, n] of Object.entries(p.leader.def.cost?.pips ?? {})) {
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

/** Location iids being held untapped for the opponent-turn reaction window.
 * Locations only recover at their owner's own Dawn, so essence for a
 * reaction play must come from locations deliberately left untapped through
 * the caster's whole turn — reserving just the card (v5.2) was not enough.
 * Fully cleared at the start of every playTurn (reservations only matter
 * within the reserving player's own turn), so nothing leaks across games. */
const reservedLocations = new Set<string>();

function tapAllLocations(state: GameState, pid: PlayerId): void {
  for (const l of [...state.players[pid].locations]) {
    if (!l.exhausted && !reservedLocations.has(l.iid)) tapLocationForEssence(state, pid, l.iid);
  }
}

/** Reserve untapped locations able to pay `cost` (pips first, then any for
 * generic), counting Bountiful Sanctums as 2 essence so they neither break
 * the reservation nor get over-reserved. Excess yield from a picked
 * location carries over as surplus toward the rest of the cost. Returns
 * true if fully covered; on failure reserves nothing. */
function reserveLocationsForCost(state: GameState, pid: PlayerId, cost?: EssenceCost): boolean {
  if (!cost) return true;
  const p = state.players[pid];
  const free = p.locations.filter((l) => !l.exhausted && !reservedLocations.has(l.iid));
  const picked = new Set<string>();
  const surplus: Partial<Record<EssenceType, number>> = {};
  for (const [t, needRaw] of Object.entries(cost.pips) as [EssenceType, number][]) {
    let need = needRaw ?? 0;
    while (need > 0) {
      // Smallest-yield matching location first, so a Bountiful isn't burned
      // covering a single pip a basic Wellspring could cover.
      const candidates = free
        .filter((l) => l.produces === t && !picked.has(l.iid))
        .sort((a, b) => locationYield(a) - locationYield(b));
      const loc = candidates.find((l) => locationYield(l) >= need) ?? candidates[0];
      if (!loc) return false;
      picked.add(loc.iid);
      const y = locationYield(loc);
      if (y > need) surplus[t] = (surplus[t] ?? 0) + (y - need);
      need = Math.max(0, need - y);
    }
  }
  let generic = cost.generic;
  // Spend pip surplus on the generic part first.
  for (const t of Object.keys(surplus) as EssenceType[]) {
    const use = Math.min(generic, surplus[t] ?? 0);
    generic -= use;
  }
  while (generic > 0) {
    // Largest-yield first: fewest locations tied up for the generic part.
    const loc = free
      .filter((l) => !picked.has(l.iid))
      .sort((a, b) => locationYield(b) - locationYield(a))[0];
    if (!loc) return false;
    picked.add(loc.iid);
    generic -= locationYield(loc);
  }
  for (const iid of picked) reservedLocations.add(iid);
  return true;
}

/** Could `cost` be paid from the current pool plus untapped locations
 * (Bountiful Sanctums count double)? */
function canAffordPotential(state: GameState, pid: PlayerId, cost?: EssenceCost): boolean {
  if (!cost) return true;
  const p = state.players[pid];
  const pool: Partial<Record<EssenceType, number>> = { ...p.essence };
  for (const l of p.locations) {
    if (!l.exhausted && !reservedLocations.has(l.iid))
      pool[l.produces] = (pool[l.produces] ?? 0) + locationYield(l);
  }
  return canPayCost(pool, cost);
}

/**
 * Tap just enough locations to pay `cost` (pips first, then generic),
 * leaving the rest untapped for the clash reaction window. Returns true if
 * the pool can then pay the cost.
 */
function tapForCost(state: GameState, pid: PlayerId, cost?: EssenceCost): boolean {
  const p = state.players[pid];
  if (canPayCost(p.essence, cost)) return true;
  if (!cost || !canAffordPotential(state, pid, cost)) return false;
  // Cover colored pips.
  for (const [t, need] of Object.entries(cost.pips) as [EssenceType, number][]) {
    while ((p.essence[t] ?? 0) < (need ?? 0)) {
      const loc = p.locations.find(
        (l) => !l.exhausted && !reservedLocations.has(l.iid) && l.produces === t,
      );
      if (!loc || !tapLocationForEssence(state, pid, loc.iid)) break;
    }
  }
  // Cover the rest with any untapped location.
  let safety = p.locations.length + 1;
  while (!canPayCost(p.essence, cost) && safety-- > 0) {
    const loc = p.locations.find((l) => !l.exhausted && !reservedLocations.has(l.iid));
    if (!loc || !tapLocationForEssence(state, pid, loc.iid)) break;
  }
  return canPayCost(p.essence, cost);
}

/** Damage `raw` actually marks on `target` (v6.0 Hardened shaves 1 per
 * packet — a fully-absorbed hit also applies no Venom). */
function packetDamage(target: UnitInst, raw: number): number {
  return unitHasKw(target, 'Hardened') ? Math.max(0, raw - 1) : raw;
}

function isRemoval(eff?: Effect): boolean {
  return (
    !!eff &&
    (eff.action === 'shatter' || eff.action === 'banish' ||
      (eff.action === 'damage' && (eff.target === 'enemyUnit' || eff.target === 'anyTarget')))
  );
}

/** Re-bond loose Worn Charms onto the biggest friendly unit when affordable. */
function rebondWornCharms(state: GameState, pid: PlayerId, observe?: CpuTurnObserver): void {
  const p = state.players[pid];
  if (p.wornCharms.length === 0 || p.field.length === 0) return;
  const target = [...p.field].sort((a, b) => effMight(state, b) - effMight(state, a))[0];
  for (const charm of [...p.wornCharms]) {
    const cost: EssenceCost = { generic: charm.def.rebondCost ?? 0, pips: {} };
    // Only tap once the re-bond is sure to go through — a failed attempt
    // after tapping would strand the essence.
    if (!canAffordPotential(state, pid, cost)) continue;
    if (!tapForCost(state, pid, cost)) continue;
    if (rebondCharm(state, pid, charm.iid, target.iid)) {
      observe?.({ kind: 'rebond', name: charm.def.name, targetIid: target.iid });
    }
  }
}

/** Value of invoking this card right now. */
function invokePriority(state: GameState, pid: PlayerId, def: CardDef): number {
  const opp = state.players[opponentOf(pid)];
  // Effective cost (not printed) so Surge discounts are seen by the curve.
  let v = totalCost(effectiveCost(state, pid, def)) * 10; // biggest affordable first
  if (def.type === 'Unit') v += 5;
  if (isRemoval(def.onInvoke)) {
    const isShatter = def.onInvoke?.action === 'shatter';
    const biggest = [...opp.field]
      .filter((u) => !unitHasKw(u, 'Warded') && !(isShatter && unitHasKw(u, 'Unbreakable')))
      .sort((a, b) => effMight(state, b) - effMight(state, a))[0];
    // Removal wants a live target; anyTarget damage can still go face.
    if (biggest) v += 20;
    else v += def.onInvoke?.target === 'anyTarget' ? -5 : -100;
  }
  if (def.type === 'Event' && hasKw(def, 'Resonant')) v += 4; // double value
  if (def.type === 'Location' && hasKw(def, 'Bountiful')) v += 3; // ramp
  if (def.onInvoke?.target === 'allEnemyUnits' && opp.field.length < 2) v -= 60;
  if (def.type === 'Charm' && state.players[pid].field.length === 0) v -= 200;
  return v;
}

/** Best target iid for a card's onInvoke effect (biggest enemy for removal). */
function chooseTarget(state: GameState, pid: PlayerId, def: CardDef): string | undefined {
  if (!def.onInvoke) return undefined;
  return autoTarget(state, pid, def.onInvoke);
}

/** A card that's actually useful to hold for the opponent's reaction window:
 * a Quick removal Event, or an Ambush unit (both legal outside the caster's
 * own main phase). Reserving these lets the reaction window ever fire. */
function isReactionCandidate(def: CardDef): boolean {
  // Cap at total cost 3: reserving both the card AND the locations to pay
  // for it (see reserveLocationsForCost) is only worth it when the hold is
  // cheap — reserving 5-7 locations for a big Ambush bomb skips whole
  // development turns (v5.3 verification runs showed exactly that: cost-7
  // Ambush carriers cratered while reserved).
  if (totalCost(def.cost) > 3) return false;
  return (
    (def.type === 'Event' && def.subtype === 'Quick' && isRemoval(def.onInvoke)) ||
    (def.type === 'Unit' && !!def.keywords?.includes('Ambush'))
  );
}

function mainPhasePlays(state: GameState, pid: PlayerId, observe?: CpuTurnObserver): void {
  const p = state.players[pid];
  // Play a Wellspring (once per turn) then float all essence.
  if (!p.wellspringPlayedThisTurn) {
    const t = chooseWellspring(state, pid);
    if (t && playWellspring(state, pid, t)) observe?.({ kind: 'wellspring', essence: t });
  }

  // Only hold essence back for the reaction window if the hand actually
  // contains something that window can use (a Quick removal Event or Ambush
  // unit) — otherwise floating everything upfront avoids the partial-tap
  // fragmentation bug where an early card's generic payment eats a colored
  // location a later, unsorted card needed, leaving it falsely unaffordable
  // even though total essence was sufficient.
  const reserveCandidates = p.hand.filter((c) => isReactionCandidate(c.def));
  const holdForReaction = reserveCandidates.length > 0;
  // Reserve just the single best reaction card from this turn's own main
  // phase — Quick Events/Ambush units are legal in the caster's own main
  // phase too, and would otherwise always get spent there first, leaving
  // nothing for the reaction window. The rest of the hand still plays
  // normally.
  let reservedIid = holdForReaction
    ? [...reserveCandidates].sort(
        (a, b) => invokePriority(state, pid, b.def) - invokePriority(state, pid, a.def),
      )[0].iid
    : undefined;

  // Also reserve the LOCATIONS to pay for it: locations only recover at our
  // own Dawn, so unless some stay untapped through this whole turn there is
  // no essence when the opponent-turn reaction window opens (the root cause
  // of the near-zero reaction plays measured through v5.2). If the cost
  // can't be covered, drop the reservation and play the card normally.
  for (const l of p.locations) reservedLocations.delete(l.iid); // re-plan each main
  if (reservedIid) {
    const rc = p.hand.find((c) => c.iid === reservedIid);
    if (!rc || !reserveLocationsForCost(state, pid, rc.def.cost)) reservedIid = undefined;
  }

  if (!reservedIid) tapAllLocations(state, pid);

  // Invoke the Leader once affordable (its abilities are recurring value).
  if (!p.leader.invoked && !p.leader.shattered && canAffordPotential(state, pid, p.leader.def.cost)) {
    tapForCost(state, pid, p.leader.def.cost);
    if (canInvokeLeader(state, pid) && invokeLeader(state, pid))
      observe?.({ kind: 'leaderInvoke', name: p.leader.def.name });
  }

  // Greedily invoke the best affordable cards.
  let progress = true;
  while (progress && !state.winner) {
    progress = false;
    const playable = p.hand
      .filter(
        (c) =>
          c.iid !== reservedIid &&
          invokePriority(state, pid, c.def) >= -50 &&
          canAffordPotential(state, pid, effectiveCost(state, pid, c.def)) &&
          !(c.def.type === 'Charm' && p.field.length === 0),
      )
      .sort((a, b) => invokePriority(state, pid, b.def) - invokePriority(state, pid, a.def));
    for (const c of playable) {
      if (!tapForCost(state, pid, effectiveCost(state, pid, c.def))) continue;
      if (!canInvoke(state, pid, c.iid)) continue;
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

  // If the reserved card is the ONLY card in hand (nothing else to develop
  // at all), play it now rather than wasting the entire turn on a reaction
  // window that may never open.
  if (reservedIid && !state.winner && p.hand.length === 1) {
    const reserved = p.hand.find((c) => c.iid === reservedIid);
    if (reserved) for (const l of p.locations) reservedLocations.delete(l.iid);
    if (reserved && canAffordPotential(state, pid, effectiveCost(state, pid, reserved.def))) {
      tapForCost(state, pid, effectiveCost(state, pid, reserved.def));
      if (canInvoke(state, pid, reserved.iid)) {
        const targetIid = chooseTarget(state, pid, reserved.def);
        const targetName = targetIid ? findUnit(state, targetIid)?.def.name : undefined;
        if (invokeCard(state, pid, reserved.iid, { targetIid })) {
          observe?.({ kind: 'invoke', name: reserved.def.name, iid: reserved.iid, targetIid, targetName });
        }
      }
    }
  }

  // Re-bond loose Worn Charms with leftover potential essence.
  rebondWornCharms(state, pid, observe);

  // Leader ability: once per turn, pick the most useful one.
  runLeaderAbility(state, pid, observe);
}

function runLeaderAbility(state: GameState, pid: PlayerId, observe?: CpuTurnObserver): void {
  const p = state.players[pid];
  const L = p.leader;
  if (!L.invoked || L.shattered || L.abilityUsedThisTurn) return;
  const abilities = L.def.leaderAbilities ?? [];
  const opp = state.players[opponentOf(pid)];
  let bestIdx = -1;
  let bestVal = 0;
  abilities.forEach((ab, i) => {
    if (ab.resolveDelta < 0 && L.resolve + ab.resolveDelta < 0) return;
    const eff = ab.effect;
    let v: number;
    if (isRemoval(eff)) v = opp.field.length > 0 ? 8 : eff.target === 'anyTarget' ? 3 : 0;
    else if (eff.action === 'draw') v = p.hand.length <= 5 ? 5 : 1;
    else if (eff.action === 'buff') v = p.field.length > 0 ? 4 : 0;
    else if (eff.action === 'heal') v = p.vitality < LEADER_HP || p.field.some((u) => u.damage > 0) ? 4 : 0;
    else v = 2;
    // Never shatter our own Leader for marginal value — only a genuinely
    // scary board (a Might-6+ unit to answer) can justify going to zero.
    if (L.resolve + ab.resolveDelta <= 0) {
      const bigThreat = opp.field.some((u) => effMight(state, u) >= 6);
      v -= bigThreat && isRemoval(eff) ? 6 : 20;
    }
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
  const me = state.players[pid];
  const opp = state.players[opponentOf(pid)];
  const candidates = legalAttackers(state, pid);
  const defenders = opp.field.filter((u) => !u.exhausted);
  const firstStriker = (x: UnitInst) =>
    unitHasKw(x, 'Quickstrike') || unitHasKw(x, 'Doublestrike');
  const canBlock = (a: UnitInst, g: UnitInst) =>
    !unitHasKw(a, 'Aerial') || unitHasKw(g, 'Aerial') || unitHasKw(g, 'Skywatch');
  const attackerKills = (a: UnitInst, g: UnitInst) => {
    const hit = packetDamage(g, effMight(state, a));
    return (
      hit >= remainingGrit(state, g) ||
      (unitHasKw(a, 'Venomous') && hit > 0 && !unitHasKw(g, 'Unbreakable'))
    );
  };
  const attackerSurvives = (a: UnitInst, g: UnitInst) => {
    if (unitHasKw(a, 'Unbreakable')) return true;
    const hit = packetDamage(a, effMight(state, g));
    const dies = hit >= remainingGrit(state, a) || (unitHasKw(g, 'Venomous') && hit > 0);
    if (!dies) return true;
    // Quickstrike pre-kill: a dead guard never strikes back.
    return firstStriker(a) && !firstStriker(g) && attackerKills(a, g);
  };
  // All-in only when lethal survives worst-case guarding: assume each ready
  // defender fully absorbs one attacker (biggest first; Overrun still
  // spills past the guard's remaining grit). The old check ("total might >=
  // vitality") ignored guards entirely and fed both the venomous-suicide
  // and took-guardable-lethal lapse counters with doomed all-ins.
  const sorted = [...candidates].sort((a, b) => effMight(state, b) - effMight(state, a));
  // Pool of not-yet-assigned defenders, consumed as guards get assigned below
  // (mirrors chooseGuards' unguardedDamage, which sums actual remaining grit
  // rather than guard count).
  const guardPool = [...defenders];
  let throughDamage = 0;
  for (const u of sorted) {
    const m = effMight(state, u);
    const eligible = guardPool.filter((g) => canBlock(u, g));
    // Swarmproof needs 2+ eligible guards — with fewer it's unguardable.
    const swarm = unitHasKw(u, 'Swarmproof');
    const needed = swarm ? 2 : 1;
    const guardable = eligible.length >= needed;
    if (!guardable) {
      throughDamage += m;
    } else {
      // Assume the toughest eligible defenders block (worst case for the
      // attacker), then spill past their actual remaining grit — using guard
      // *count* here previously grossly overestimated Overrun spill (e.g.
      // treating a single grit-6 guard as absorbing only 1 damage) and could
      // false-flag a non-lethal all-in as lethal.
      const used = eligible
        .sort((a, b) => remainingGrit(state, b) - remainingGrit(state, a))
        .slice(0, needed);
      for (const g of used) guardPool.splice(guardPool.indexOf(g), 1);
      if (unitHasKw(u, 'Overrun')) {
        const absorbed = used.reduce((s, g) => s + Math.max(1, remainingGrit(state, g)), 0);
        throughDamage += Math.max(0, m - absorbed);
      }
    }
  }
  if (throughDamage >= opp.vitality) return candidates.map((u) => u.iid);
  const picked: string[] = [];
  for (const u of candidates) {
    const m = effMight(state, u);
    if (m <= 0) continue;
    const possibleGuards = defenders.filter((g) => canBlock(u, g));
    // Swarmproof: fewer than 2 eligible guards means effectively unguardable.
    if (possibleGuards.length === 0 || (unitHasKw(u, 'Swarmproof') && possibleGuards.length < 2)) {
      picked.push(u.iid); // free face damage
      continue;
    }
    // Attack if a typical guard trade favors us: we kill the biggest realistic
    // blocker and survive it, or NO eligible guard can profitably block (the
    // attacker survives every realistic block even without killing), or the
    // trade is favorable (we kill a strictly more expensive unit even if we
    // die) while not behind on board.
    const worst = possibleGuards.sort((a, b) => effMight(state, b) - effMight(state, a))[0];
    const kills = attackerKills(u, worst);
    const survives = attackerSurvives(u, worst);
    const safeVsAll = possibleGuards.every((g) => attackerSurvives(u, g));
    const notBehind = me.field.length >= opp.field.length;
    const favorableTrade =
      kills && notBehind && totalCost(worst.def.cost) > totalCost(u.def.cost);
    if ((kills && survives) || safeVsAll || favorableTrade) picked.push(u.iid);
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
  // Damage the defender is on track to take: unguarded attackers hit face
  // (Doublestrike twice); guarded Overrun attackers spill past guard grit.
  const unguardedDamage = () =>
    attackers.reduce((s, a) => {
      const hits = unitHasKw(a, 'Doublestrike') ? 2 : 1;
      const guards = assignments[a.iid] ?? [];
      if (guards.length === 0) return s + effMight(state, a) * hits;
      if (!unitHasKw(a, 'Overrun')) return s;
      const guardGrit = guards.reduce((g, iid) => {
        const u = findUnit(state, iid);
        return g + (u ? Math.max(1, remainingGrit(state, u)) : 0);
      }, 0);
      return s + Math.max(0, effMight(state, a) * hits - guardGrit);
    }, 0);

  for (const attacker of attackers) {
    const legal = legalGuardsFor(state, attacker.iid).filter((g) => !used.has(g.iid));
    if (legal.length === 0) continue;
    const swarm = unitHasKw(attacker, 'Swarmproof');
    const mustSurvive = unguardedDamage() >= me.vitality;
    // Profitable single block: guard kills attacker or survives the hit.
    const aFirst = unitHasKw(attacker, 'Quickstrike') || unitHasKw(attacker, 'Doublestrike');
    const scored = legal
      .map((g) => {
        const gFirst = unitHasKw(g, 'Quickstrike') || unitHasKw(g, 'Doublestrike');
        const hitOnAttacker = packetDamage(attacker, effMight(state, g));
        const hitOnGuard = packetDamage(g, effMight(state, attacker));
        // Venomous attacker: any contact kills the guard unless Unbreakable.
        const guardDies =
          !unitHasKw(g, 'Unbreakable') &&
          (hitOnGuard >= remainingGrit(state, g) ||
            (unitHasKw(attacker, 'Venomous') && hitOnGuard > 0));
        let kills =
          hitOnAttacker >= remainingGrit(state, attacker) ||
          (unitHasKw(g, 'Venomous') && hitOnAttacker > 0);
        // A Quickstrike attacker pre-kills a slower guard: it never strikes.
        if (kills && aFirst && !gFirst && guardDies) kills = false;
        let survives = !guardDies;
        // A Quickstrike guard that pre-kills the attacker takes nothing back.
        if (!survives && gFirst && !aFirst && kills && !unitHasKw(attacker, 'Unbreakable'))
          survives = true;
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
  // Facing lethal after profitable blocks: chump-guard everything we can,
  // biggest attackers first, rather than dying with ready guards on the field.
  if (unguardedDamage() >= me.vitality) {
    for (const attacker of attackers) {
      if (unguardedDamage() < me.vitality) break;
      if (assignments[attacker.iid]?.length) continue;
      const legal = legalGuardsFor(state, attacker.iid).filter((g) => !used.has(g.iid));
      if (legal.length === 0) continue;
      const swarm = unitHasKw(attacker, 'Swarmproof');
      if (swarm) {
        if (legal.length < 2) continue;
        const pair = legal
          .sort((a, b) => effMight(state, a) - effMight(state, b))
          .slice(0, 2)
          .map((g) => g.iid);
        assignments[attacker.iid] = pair;
        pair.forEach((iid) => used.add(iid));
      } else {
        // Cheapest body soaks the hit.
        const chump = legal.sort(
          (a, b) =>
            effMight(state, a) + remainingGrit(state, a) - (effMight(state, b) + remainingGrit(state, b)),
        )[0];
        assignments[attacker.iid] = [chump.iid];
        used.add(chump.iid);
      }
    }
  }
  // Still facing lethal: stack extra guards onto Overrun attackers to soak
  // the spill (multiple guards per attacker are legal).
  let extraSafety = me.field.length + 1;
  while (unguardedDamage() >= me.vitality && extraSafety-- > 0) {
    const spillers = attackers.filter(
      (a) => (assignments[a.iid]?.length ?? 0) > 0 && unitHasKw(a, 'Overrun'),
    );
    let added = false;
    for (const a of spillers) {
      const legal = legalGuardsFor(state, a.iid).filter((g) => !used.has(g.iid));
      if (legal.length === 0) continue;
      const extra = legal.sort((x, y) => remainingGrit(state, y) - remainingGrit(state, x))[0];
      assignments[a.iid].push(extra.iid);
      used.add(extra.iid);
      added = true;
      break;
    }
    if (!added) break;
  }
  return assignments;
}

/**
 * Defender's reaction window (after guards, before damage): tap locations
 * and invoke Quick Events — removal pointed at the biggest attacker — and
 * cheap Ambush units for board presence. Exported for the sim harness and UI.
 */
export function reactionPlays(
  state: GameState,
  defender: PlayerId,
  observe?: CpuTurnObserver,
): number {
  if (state.clash?.step !== 'reaction') return 0;
  const p = state.players[defender];
  let plays = 0;
  // The reaction window is what the reserved locations were saved for — but
  // only the non-active player's hold ends here; the active player's own
  // reservations are for the OPPONENT's next clash.
  if (state.active !== defender) {
    for (const l of p.locations) reservedLocations.delete(l.iid);
  }
  tapAllLocations(state, defender);
  let progress = true;
  while (progress && !state.winner) {
    progress = false;
    const options = p.hand
      .filter((c) => canInvoke(state, defender, c.iid))
      .sort((a, b) => invokePriority(state, defender, b.def) - invokePriority(state, defender, a.def));
    for (const c of options) {
      const quickRemoval =
        c.def.type === 'Event' && c.def.subtype === 'Quick' && isRemoval(c.def.onInvoke);
      const ambushUnit = c.def.type === 'Unit' && hasKw(c.def, 'Ambush');
      if (!quickRemoval && !ambushUnit) continue;
      // Point removal at the biggest live attacker (fall back to autoTarget).
      let targetIid: string | undefined;
      if (quickRemoval && state.clash && state.active !== defender) {
        const isShatter = c.def.onInvoke?.action === 'shatter';
        const attackers = state.clash.attackers
          .map((iid) => findUnit(state, iid))
          .filter(
            (u): u is UnitInst =>
              !!u && !unitHasKw(u, 'Warded') && !(isShatter && unitHasKw(u, 'Unbreakable')),
          )
          .sort((a, b) => effMight(state, b) - effMight(state, a));
        targetIid = attackers[0]?.iid;
      }
      targetIid ??= c.def.onInvoke ? autoTarget(state, defender, c.def.onInvoke) : undefined;
      if (invokeCard(state, defender, c.iid, { targetIid })) {
        observe?.({
          kind: 'invoke',
          name: c.def.name,
          iid: c.iid,
          targetIid,
          targetName: targetIid ? findUnit(state, targetIid)?.def.name : undefined,
          by: defender,
        });
        plays++;
        progress = true;
        break;
      }
    }
  }
  return plays;
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
  // Stale reservations (previous turns, previous games — iids never repeat)
  // must not constrain this turn's tapping.
  reservedLocations.clear();

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
      // CPU-vs-CPU (sims): the defending CPU uses its reaction window unless
      // the UI is driving the defender (it passes chooseGuardsFor).
      if (!opts.chooseGuardsFor) reactionPlays(state, defender, observe);
      // Rulebook: the window is open to either player — the active CPU gets
      // a pass too (Quick Events / Ambush units after guards are known).
      reactionPlays(state, pid, observe);
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
