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
  unbreakableUp,
  bulwarkReduction,
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
  hasPriority,
  locationYield,
  mulliganHand,
  invokeCard,
  passPriority,
  potentialEssence,
  settleStack,
  invokeLeader,
  legalAttackers,
  legalGuardsFor,
  opponentOf,
  playWellspring,
  rebondCharm,
  remainingGrit,
  resolveClash,
  tapLocationForEssence,
  telemetry,
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
  // How many hand cards this location row can satisfy the COLORED pips of,
  // optionally counting one more source of `extra`.
  const satisfiable = (extra?: EssenceType): number => {
    const pool: Partial<Record<EssenceType, number>> = { ...have };
    if (extra) pool[extra] = (pool[extra] ?? 0) + 1;
    return p.hand.filter((c) =>
      Object.entries(c.def.cost?.pips ?? {}).every(
        ([col, n]) => (pool[col as EssenceType] ?? 0) >= (n ?? 0),
      ),
    ).length;
  };
  const baseline = satisfiable();
  let best = choices[0];
  let bestScore = -Infinity;
  for (const t of choices) {
    // Raw pip demand still breaks ties, but UNLOCKING a card that is
    // currently uncastable on colour dominates it: the v6.6 sims measured
    // 21,126 turns (~17% of all turns) where the colour played unlocked
    // nothing while another legal choice would have freed a stuck hand card.
    // Demand alone can't see this — a hand of three Ember cards keeps
    // demanding Ember long after one Ember source already covers them all.
    const unlocked = satisfiable(t) - baseline;
    const s = unlocked * 10 + (demand[t] ?? 0) - (have[t] ?? 0) * 0.5;
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

/**
 * Resolve what `pid` just put on the stack. If that leaves the opponent
 * holding a real response window, hand it over — or, with nobody installed to
 * take it (sims, tests, the player's own turn), resolve through it rather
 * than waiting on a pass that can never arrive.
 */
function settleAfterPlay(state: GameState, pid: PlayerId): void {
  settleStack(state);
  if (!hasPriority(state, opponentOf(pid))) return;
  if (yieldPriority) yieldPriority(state, opponentOf(pid));
  else settleStack(state, { interactive: false });
}

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
    (eff.action === 'shatter' ||
      eff.action === 'banish' ||
      (eff.action === 'damage' && (eff.target === 'enemyUnit' || eff.target === 'anyTarget')))
  );
}

/** v6.9: effects that need an enemy unit on the board to do anything at all.
 * Not removal (they neither kill nor reliably kill), but invoking one into an
 * empty enemy board is a strictly wasted card — the curve must see that. */
function needsEnemyUnit(eff?: Effect): boolean {
  return !!eff && (eff.action === 'exhaust' || eff.action === 'weaken');
}

/**
 * Best friendly unit to hang a Charm on. Picking the biggest Might (the old
 * rule) puts every Charm on the unit the opponent most wants to remove and
 * most profitably blocks: the v6.6 sims measured 2,769 Charms bonded to a
 * unit that left the field the same turn, buying nothing. Durability is
 * weighted above raw Might, and a body already carrying Charms is
 * de-prioritised so a single removal spell can't two-for-one (or worse).
 */
function bestBondTarget(state: GameState, pid: PlayerId): UnitInst | undefined {
  const p = state.players[pid];
  const opp = state.players[opponentOf(pid)];
  // v7.2: durability alone was not enough. `charmOnDoomedUnit` sat at
  // ~2,200-2,350 a cohort for five passes — the largest CPU lapse counter on
  // the board and the only one never targeted — because "sturdiest body" and
  // "body that survives the turn" are different questions. The sturdiest body
  // is also the one `chooseAttackers` sends into the biggest clash, and the
  // one every removal spell in the opponent's deck is pointed at.
  //
  // So the score now asks whether the enemy board can actually kill it: a
  // unit whose remaining Grit is inside the reach of the biggest ready enemy
  // body is a bad place to spend a card, however big it is. Venomous makes
  // any hit lethal, so a Venomous defender puts every non-Unbreakable target
  // at risk regardless of Grit.
  const enemyReach = Math.max(
    0,
    ...opp.field.filter((u) => !u.exhausted).map((u) => effMight(state, u)),
  );
  const enemyVenom = opp.field.some((u) => !u.exhausted && unitHasKw(u, 'Venomous'));
  return [...p.field]
    .map((u) => {
      const grit = remainingGrit(state, u);
      const safe = unbreakableUp(u) || (grit > enemyReach && !(enemyVenom && grit > 0));
      return {
        u,
        score: grit * 2 + effMight(state, u) - u.charms.length * 3 + (safe ? 6 : 0),
      };
    })
    .sort((a, b) => b.score - a.score)[0]?.u;
}

/** Re-bond loose Worn Charms onto the sturdiest friendly unit when affordable. */
function rebondWornCharms(state: GameState, pid: PlayerId, observe?: CpuTurnObserver): void {
  const p = state.players[pid];
  if (p.wornCharms.length === 0 || p.field.length === 0) return;
  const target = bestBondTarget(state, pid);
  if (!target) return;
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
  const eff = def.onInvoke;
  // Does this card's effect have a legal target right now? A removal/exhaust/
  // sweep with nothing to point at resolves to the ash-pile for zero value.
  const isShatter = eff?.action === 'shatter';
  const hasRemovalTarget = opp.field.some(
    (u) => !unitHasKw(u, 'Warded') && !(isShatter && unbreakableUp(u)),
  );
  const hasExhaustTarget = opp.field.some(
    (u) => !unitHasKw(u, 'Warded') && !(eff?.action === 'exhaust' && u.exhausted),
  );
  const effectDead =
    (isRemoval(eff) && !hasRemovalTarget && eff?.target !== 'anyTarget') ||
    // v10: exhaust wants a READY enemy; re-exhausting a tapped unit does
    // nothing (mirrors the v6.9 Leader-ability guard, which the invoke path
    // had missed). weaken still works on an exhausted body, so it only checks
    // Warded via the shared needsEnemyUnit filter below.
    (needsEnemyUnit(eff) && !(eff?.action === 'exhaust' ? hasExhaustTarget : hasRemovalTarget)) ||
    (eff?.target === 'allEnemyUnits' && opp.field.length === 0);
  // A non-Unit card whose whole payoff is a dead effect is a strictly wasted
  // invoke — disqualify it regardless of cost. The old additive penalties
  // (-100/-60) were swamped by the cost*10 base, so a cost-5 dead spell scored
  // exactly -50 and slipped past the >= -50 play gate; a cost-1 sweep sailed
  // into an empty board. A Unit is never disqualified for a dead ENTERS rider —
  // its body still has value — so it falls through to normal body scoring.
  if (effectDead && def.type !== 'Unit') return -1000;
  // Effective cost (not printed) so Surge discounts are seen by the curve.
  let v = totalCost(effectiveCost(state, pid, def)) * 10; // biggest affordable first
  if (def.type === 'Unit') v += 5;
  if (isRemoval(eff)) {
    // Reached only when a target exists (or anyTarget can go face).
    if (hasRemovalTarget) v += 20;
    else if (eff?.target === 'anyTarget') v -= 5;
  }
  if (needsEnemyUnit(eff) && !effectDead) {
    // Worth a real premium against a developed board (exhausting or shrinking
    // the biggest body swings a whole clash).
    v += 12;
  }
  if (def.type === 'Event' && hasKw(def, 'Resonant')) v += 4; // double value
  if (def.type === 'Location' && hasKw(def, 'Bountiful')) v += 3; // ramp
  if (eff?.target === 'allEnemyUnits' && opp.field.length < 2 && !effectDead) v -= 60;
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
  // Loop rather than fire once: the second player's opening turn carries a
  // two-Wellspring allowance (engine `wellspringAllowance`).
  while (!p.wellspringPlayedThisTurn) {
    const t = chooseWellspring(state, pid);
    if (!t || !playWellspring(state, pid, t)) break;
    observe?.({ kind: 'wellspring', essence: t });
  }

  // Only hold essence back for the reaction window if the hand actually
  // contains something that window can use (a Quick removal Event or Ambush
  // unit) — otherwise floating everything upfront avoids the partial-tap
  // fragmentation bug where an early card's generic payment eats a colored
  // location a later, unsorted card needed, leaving it falsely unaffordable
  // even though total essence was sufficient.
  const reserveCandidates = p.hand.filter((c) => isReactionCandidate(c.def));
  // A reaction window only ever opens if the opponent actually clashes, which
  // needs a unit of theirs that can attack. Holding a card AND the locations
  // to pay for it across a whole turn against an empty enemy board just skips
  // a development turn: the v6.6 sims measured 26.5% of all reservations
  // expiring uncashed.
  const oppCanAttack = state.players[opponentOf(pid)].field.some(
    (u) => !unitHasKw(u, 'Immobile') && effMight(state, u) > 0,
  );
  const holdForReaction = reserveCandidates.length > 0 && oppCanAttack;
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
    else telemetry.onReservation?.(pid, rc.iid, totalCost(rc.def.cost));
  }

  if (!reservedIid) tapAllLocations(state, pid);

  // Invoke the Leader once affordable (its abilities are recurring value).
  if (
    !p.leader.invoked &&
    !p.leader.shattered &&
    canAffordPotential(state, pid, p.leader.def.cost)
  ) {
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
      const bondTargetIid = c.def.type === 'Charm' ? bestBondTarget(state, pid)?.iid : undefined;
      const targetName = targetIid ? findUnit(state, targetIid)?.def.name : undefined;
      if (invokeCard(state, pid, c.iid, { targetIid, bondTargetIid })) {
        settleAfterPlay(state, pid);
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
          settleAfterPlay(state, pid);
          observe?.({
            kind: 'invoke',
            name: reserved.def.name,
            iid: reserved.iid,
            targetIid,
            targetName,
          });
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
    // Value unit-targeted effects against what autoTarget can actually hit:
    // Warded units are untargetable, so against a Warded-only board the
    // ability resolves with no target and does nothing — the old
    // `opp.field.length > 0` check burned Resolve on guaranteed whiffs
    // (and could shatter our own Leader for zero value, see below).
    const targetable = opp.field.filter((u) => !unitHasKw(u, 'Warded'));
    // A shatter also whiffs on an Unbreakable unit whose once-per-turn save is
    // still up — autoTarget excludes those, so valuing removal against the full
    // targetable list burned Resolve on a guaranteed no-op against an
    // all-Unbreakable board (the invoke/instant shatter sites already guard it).
    const isShatter = eff.action === 'shatter';
    const removalTargets = isShatter ? targetable.filter((u) => !unbreakableUp(u)) : targetable;
    let v: number;
    if (isRemoval(eff)) v = removalTargets.length > 0 ? 8 : eff.target === 'anyTarget' ? 3 : 0;
    else if (eff.action === 'draw') v = p.hand.length <= 5 ? 5 : 1;
    else if (eff.action === 'buff') v = p.field.length > 0 ? 4 : 0;
    else if (eff.action === 'heal')
      v = p.vitality < LEADER_HP || p.field.some((u) => u.damage > 0) ? 4 : 0;
    // v6.9: exhaust is worth real value against a READY board (it denies an
    // attack or a guard) and literally nothing against a tapped-out one.
    else if (eff.action === 'exhaust')
      v = opp.field.some((u) => !u.exhausted && !unitHasKw(u, 'Warded')) ? 6 : 0;
    else if (eff.action === 'weaken') v = targetable.length > 0 ? 5 : 0;
    else v = 2;
    // Never shatter our own Leader for marginal value — only a genuinely
    // scary board (a Might-6+ unit we can actually TARGET) can justify
    // going to zero.
    if (L.resolve + ab.resolveDelta <= 0) {
      const bigThreat = removalTargets.some((u) => effMight(state, u) >= 6);
      v -= bigThreat && isRemoval(eff) ? 6 : 20;
    }
    // Building Resolve is free value — but only while there is headroom to
    // build into. `activateLeaderAbility` caps a builder at the printed value,
    // so at full Resolve the `+1` half of the ability does nothing and this
    // bonus was buying a wasted once-per-turn activation (it is enough on its
    // own to beat a genuine `v = 0` alternative).
    if (ab.resolveDelta > 0 && L.resolve < (L.def.resolve ?? 0)) v += 1;
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
 * otherwise attack with units that win or force bad trades.
 *
 * Exported for the same reason `chooseGuards` is: it is a damage MODEL, and the
 * only way to pin it against what the engine actually deals is to call it
 * directly on a built board (see bughunt-v11.test.ts). */
export function chooseAttackers(state: GameState, pid: PlayerId): string[] {
  const me = state.players[pid];
  const opp = state.players[opponentOf(pid)];
  const candidates = legalAttackers(state, pid);
  const defenders = opp.field.filter((u) => !u.exhausted);
  const firstStriker = (x: UnitInst) => unitHasKw(x, 'Quickstrike') || unitHasKw(x, 'Doublestrike');
  // Mirrors engine `legalGuardsFor` — Aerial needs an Aerial/Skywatch catcher,
  // and v6.9 Nimble can only be caught by a strictly smaller body.
  const canBlock = (a: UnitInst, g: UnitInst) => {
    if (unitHasKw(a, 'Aerial') && !unitHasKw(g, 'Aerial') && !unitHasKw(g, 'Skywatch'))
      return false;
    if (unitHasKw(a, 'Nimble') && effMight(state, g) >= effMight(state, a)) return false;
    return true;
  };
  // Damage one body marks onto another over a full clash. Doublestrike lands
  // in BOTH the first-strike and normal sub-steps, so its packet counts twice
  // (each shaved by Hardened independently) — matching the engine's
  // collectStep/participates loop. Without this the model saw a DS body deal
  // its Might once, so the CPU donated guards to Doublestrike attackers.
  const clashDamage = (src: UnitInst, target: UnitInst) => {
    const packet = packetDamage(target, effMight(state, src));
    return unitHasKw(src, 'Doublestrike') ? packet * 2 : packet;
  };
  const attackerKills = (a: UnitInst, g: UnitInst) => {
    const hit = clashDamage(a, g);
    let kills =
      hit >= remainingGrit(state, g) || (unitHasKw(a, 'Venomous') && hit > 0 && !unbreakableUp(g));
    // A first-striking guard that kills our attacker before it swings takes
    // nothing back — the mirror of chooseGuards' pre-kill check. Without it
    // the CPU declared "favorable trades" into Quickstrike guards that leave
    // the attacker dead and the guard untouched (a one-for-zero).
    if (kills && firstStriker(g) && !firstStriker(a) && !unbreakableUp(a)) {
      const back = clashDamage(g, a);
      const attackerDiesFirst =
        back >= remainingGrit(state, a) || (unitHasKw(g, 'Venomous') && back > 0);
      if (attackerDiesFirst) kills = false;
    }
    return kills;
  };
  const attackerSurvives = (a: UnitInst, g: UnitInst) => {
    if (unbreakableUp(a)) return true;
    const hit = clashDamage(g, a);
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
  // v11: what a face packet from `src` is actually WORTH in Vitality, the way
  // the engine pays it (`damagePlayer` — each packet is shaved by the
  // defender's Bulwark Sanctums, floored at 0), times how many face packets it
  // throws. Doublestrike lands in both the first-strike and the normal
  // sub-step, so an unguarded one hits the face TWICE — `chooseGuards`'
  // `unguardedDamage` has priced it that way since v10 and this side counted
  // it once, so the CPU could not see a lethal all-in it actually had. Bulwark
  // was missed on both sides: with a Bulwark Sanctum out, an "exactly lethal"
  // all-in isn't.
  const bulwark = bulwarkReduction(opp);
  const faceDamage = (src: UnitInst, raw: number) =>
    Math.max(0, raw - bulwark) * (unitHasKw(src, 'Doublestrike') ? 2 : 1);
  let throughDamage = 0;
  for (const u of sorted) {
    const m = effMight(state, u);
    const eligible = guardPool.filter((g) => canBlock(u, g));
    // Swarmproof needs 2+ eligible guards — with fewer it's unguardable.
    const swarm = unitHasKw(u, 'Swarmproof');
    const needed = swarm ? 2 : 1;
    const guardable = eligible.length >= needed;
    if (!guardable) {
      throughDamage += faceDamage(u, m);
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
        // Each guard absorbs what the engine assigns it before Overrun spills:
        // a Venomous attacker only ever marks 1 (its point is lethal, so it
        // spends no more), everyone else marks the guard's grit — and Hardened
        // costs one extra marked point on top of either (engine collectStep).
        // Crediting full grit against a Venomous attacker, or omitting the
        // Hardened surcharge, both under-counted spill and false-flagged
        // non-lethal all-ins as lethal.
        const venom = unitHasKw(u, 'Venomous');
        const absorbed = used.reduce((s, g) => {
          const hard = unitHasKw(g, 'Hardened') ? 1 : 0;
          return s + (venom ? 1 + hard : Math.max(1, remainingGrit(state, g)) + hard);
        }, 0);
        // Guard absorption is spent once, on the sub-step that assigns it — a
        // Doublestrike body's second strike meets a dead guard and spills in
        // full (engine `collectStepWithHistory`, whose `absorbed` map is
        // per-sub-step). So the spill is (Might - absorption) + Might, not
        // (Might - absorption) twice.
        const spill = Math.max(0, m - absorbed);
        throughDamage +=
          Math.max(0, spill - bulwark) +
          (unitHasKw(u, 'Doublestrike') ? Math.max(0, m - bulwark) : 0);
      }
    }
  }
  if (throughDamage >= opp.vitality) {
    const allIn = candidates.map((u) => u.iid);
    telemetry.onAttackDecision?.(state, pid, allIn);
    return allIn;
  }
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
    // v7.2: a unit that dies in a "favorable" trade takes its bonded Charms
    // with it, so the trade is only favorable if it beats the unit AND the
    // cards stapled to it. Soulbound Charms return to hand and cost nothing.
    // This is the other half of the charmOnDoomedUnit fix in bestBondTarget:
    // that one stops the CPU hanging a Charm on a body the enemy can kill,
    // this one stops it throwing a charmed body away itself.
    const charmTax = u.charms.filter((ch) => !hasKw(ch.def, 'Soulbound')).length;
    const favorableTrade =
      kills && notBehind && totalCost(worst.def.cost) > totalCost(u.def.cost) + charmTax;
    if ((kills && survives) || safeVsAll || favorableTrade) picked.push(u.iid);
  }
  telemetry.onAttackDecision?.(state, pid, picked);
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
  //
  // v11: every face packet is shaved by our own Bulwark Sanctums before it
  // lands (engine `damagePlayer`), so a model that ignores them reads a
  // survivable attack as lethal and chump-blocks a board that was never in
  // danger. Applied per PACKET, which is how the engine applies it.
  const bulwark = bulwarkReduction(me);
  const net = (raw: number) => Math.max(0, raw - bulwark);
  const unguardedDamage = () =>
    attackers.reduce((s, a) => {
      const hits = unitHasKw(a, 'Doublestrike') ? 2 : 1;
      const guards = assignments[a.iid] ?? [];
      if (guards.length === 0) return s + net(effMight(state, a)) * hits;
      if (!unitHasKw(a, 'Overrun')) return s;
      // A Venomous attacker marks only 1 per guard (+1 for Hardened) before it
      // spills, not the guard's full grit — so crediting full grit here made
      // the CPU think one wall stopped an Overrun+Venomous attacker it did not,
      // and skip the extra chump blocks that would have absorbed the spill.
      const venom = unitHasKw(a, 'Venomous');
      const guardGrit = guards.reduce((g, iid) => {
        const u = findUnit(state, iid);
        if (!u) return g;
        const hard = unitHasKw(u, 'Hardened') ? 1 : 0;
        return g + (venom ? 1 + hard : Math.max(1, remainingGrit(state, u)) + hard);
      }, 0);
      // One spill packet per sub-step, netted separately (Bulwark is per
      // packet). Only the FIRST strike pays the guards: the engine's
      // absorption map resets between sub-steps, so a Doublestrike body's
      // second strike meets a guard that its first one already killed and
      // spills its whole Might.
      const might = effMight(state, a);
      const spills = hits === 2 ? [Math.max(0, might - guardGrit), might] : [might - guardGrit];
      return s + spills.reduce((t, r) => t + net(Math.max(0, r)), 0);
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
        // Doublestrike lands twice (first-strike + normal sub-steps); count the
        // packet twice on whichever body carries it, matching the engine.
        const hitOnAttacker =
          packetDamage(attacker, effMight(state, g)) * (unitHasKw(g, 'Doublestrike') ? 2 : 1);
        const hitOnGuard =
          packetDamage(g, effMight(state, attacker)) *
          (unitHasKw(attacker, 'Doublestrike') ? 2 : 1);
        // Venomous attacker: any contact kills the guard unless Unbreakable.
        const guardDies =
          !unbreakableUp(g) &&
          (hitOnGuard >= remainingGrit(state, g) ||
            (unitHasKw(attacker, 'Venomous') && hitOnGuard > 0));
        let kills =
          hitOnAttacker >= remainingGrit(state, attacker) ||
          (unitHasKw(g, 'Venomous') && hitOnAttacker > 0);
        // A Quickstrike attacker pre-kills a slower guard: it never strikes.
        if (kills && aFirst && !gFirst && guardDies) kills = false;
        let survives = !guardDies;
        // A Quickstrike guard that pre-kills the attacker takes nothing back.
        if (!survives && gFirst && !aFirst && kills && !unbreakableUp(attacker)) survives = true;
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
        pair.forEach((iid) => {
          used.add(iid);
          telemetry.onGuardAssign?.(attacker.iid, iid, mustSurvive);
        });
      }
      continue;
    }
    const best = scored[0];
    if (mustSurvive || best.kills || best.survives) {
      assignments[attacker.iid] = [best.g.iid];
      used.add(best.g.iid);
      telemetry.onGuardAssign?.(attacker.iid, best.g.iid, mustSurvive);
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
        pair.forEach((iid) => {
          used.add(iid);
          telemetry.onGuardAssign?.(attacker.iid, iid, true);
        });
      } else {
        // Cheapest body soaks the hit.
        const chump = legal.sort(
          (a, b) =>
            effMight(state, a) +
            remainingGrit(state, a) -
            (effMight(state, b) + remainingGrit(state, b)),
        )[0];
        assignments[attacker.iid] = [chump.iid];
        used.add(chump.iid);
        telemetry.onGuardAssign?.(attacker.iid, chump.iid, true);
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
      telemetry.onGuardAssign?.(a.iid, extra.iid, true);
      added = true;
      break;
    }
    if (!added) break;
  }
  return assignments;
}

/**
 * The CPU's answer to a priority window: something of the opponent's is on the
 * stack and the CPU holds instant-speed cards. Responds with Quick removal
 * when the stack item is worth answering, otherwise passes.
 *
 * Call this whenever an engine action leaves the CPU holding priority (the
 * engine auto-passes for a player with no possible response, so a window only
 * ever reaches here when the CPU genuinely has a choice).
 */
export function respondToStack(state: GameState, pid: PlayerId, observe?: CpuTurnObserver): number {
  let plays = 0;
  let guard = 16;
  while (hasPriority(state, pid) && !state.winner && guard-- > 0) {
    const top = state.stack[state.stack.length - 1];
    // Answer an incoming Unit by shooting it is impossible (it is not on the
    // field yet), so the CPU only spends removal here when there is already a
    // worthwhile board target — the same judgement `reactionPlays` uses.
    const answer = top && top.controller !== pid ? pickInstantAnswer(state, pid) : undefined;
    if (!answer) {
      passPriority(state, pid);
      continue;
    }
    // This response window is what the reserved locations were saved for —
    // pickInstantAnswer budgets against ALL untapped locations (reserved
    // included), so leaving the hold in place made tapAllLocations skip them
    // and the answer whiff. Released on the CPU's OWN turn too: the active
    // player's window (the human responding to a CPU spell) is still the
    // response the hold was for, and keeping it made the CPU silently pass
    // on an answer its affordability check said it could pay for.
    for (const l of state.players[pid].locations) reservedLocations.delete(l.iid);
    tapAllLocations(state, pid);
    const targetIid = answer.def.onInvoke ? autoTarget(state, pid, answer.def.onInvoke) : undefined;
    if (!invokeCard(state, pid, answer.iid, { targetIid })) {
      passPriority(state, pid);
      continue;
    }
    observe?.({
      kind: 'invoke',
      name: answer.def.name,
      iid: answer.iid,
      targetIid,
      targetName: targetIid ? findUnit(state, targetIid)?.def.name : undefined,
      by: pid,
    });
    plays++;
  }
  // If the CPU's answer left the player holding priority in turn, the window
  // stays open — the caller offers them the counter-response.
  settleStack(state);
  return plays;
}

/** The best instant-speed card the CPU could hold up right now, if any is
 * worth spending. Only removal with a live target qualifies. */
function pickInstantAnswer(state: GameState, pid: PlayerId) {
  const enemyField = state.players[opponentOf(pid)].field;
  return (
    state.players[pid].hand
      .filter((c) => c.def.type === 'Event' && c.def.subtype === 'Quick')
      .filter((c) => isRemoval(c.def.onInvoke))
      // Require a target this card can actually hit. A shatter has no legal
      // target on an Unbreakable-with-save unit (autoTarget excludes it), so
      // without this the CPU would cast the Event for a no-op, burning the card
      // and essence without even stripping the save.
      .filter((c) => {
        const isShatter = c.def.onInvoke?.action === 'shatter';
        return enemyField.some((u) => !unitHasKw(u, 'Warded') && !(isShatter && unbreakableUp(u)));
      })
      // Affordability is measured against Locations the CPU could still tap —
      // it holds them untapped until it decides to answer.
      .filter((c) =>
        canPayCost(potentialEssence(state.players[pid]), effectiveCost(state, pid, c.def)),
      )
      .sort((a, b) => invokePriority(state, pid, b.def) - invokePriority(state, pid, a.def))[0]
  );
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
      .sort(
        (a, b) => invokePriority(state, defender, b.def) - invokePriority(state, defender, a.def),
      );
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
              !!u && !unitHasKw(u, 'Warded') && !(isShatter && unbreakableUp(u)),
          )
          .sort((a, b) => effMight(state, b) - effMight(state, a));
        targetIid = attackers[0]?.iid;
      }
      targetIid ??= c.def.onInvoke ? autoTarget(state, defender, c.def.onInvoke) : undefined;
      if (invokeCard(state, defender, c.iid, { targetIid })) {
        settleAfterPlay(state, defender);
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
/**
 * Called when the CPU's play has left the OPPONENT holding priority over it.
 * The UI installs this to pause the turn and hand the response window to the
 * player — it does that by throwing, and resumes by calling `playTurn` again
 * once the window closes. A handler that returns normally must have closed
 * the window itself.
 */
export type YieldPriority = (state: GameState, to: PlayerId) => void;

export interface PlayTurnOptions {
  /** Override guard selection for the defending player during the CPU's
   * clash (the UI passes the human's choices; defaults to chooseGuards). */
  chooseGuardsFor?: (state: GameState, defender: PlayerId) => GuardAssignments;
  /** Hand response windows to the opponent instead of resolving through them.
   * Omitted by sims and tests, where nobody is there to answer. */
  onOpponentPriority?: YieldPriority;
}

/** Installed for the duration of a `playTurn` call — the CPU's play sites are
 * several functions deep and every one of them can open a response window. */
let yieldPriority: YieldPriority | undefined;

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
  yieldPriority = opts.onOpponentPriority;
  try {
    playTurnBody(state, pid, opts, observe);
  } finally {
    // A handler that pauses the turn does it by throwing; the UI resumes by
    // calling playTurn again, which reinstalls its own hook.
    yieldPriority = undefined;
  }
  return events;
}

function playTurnBody(
  state: GameState,
  pid: PlayerId,
  opts: PlayTurnOptions,
  observe: CpuTurnObserver,
): void {
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
}
