/**
 * Heuristic AI for v3.0 playtesting. Plays a full turn through the engine's
 * public actions: reroll, placement (all four destinations + Scrap), combo
 * check, sequential combat, end turn.
 */
import {
  Game,
  Inst,
  Player,
  reroll,
  castFromHand,
  castLocationFree,
  activateAbility,
  activateUltimate,
  activateViaRally,
  completeTwin,
  echoRecast,
  scrap,
  abandonTwin,
  comboCheck,
  attack,
  endTurn,
  startTurn,
  canAttack,
  legalTargets,
  effAtk,
  remainingHp,
  effThreshold,
  effAbilityThreshold,
  rollValues,
  matchesPattern,
  opponentOf,
  autoTarget,
  defaultDiscardChoice,
} from './engine';
import { hasKw } from './cards';

/**
 * Simple one-shot mulligan the CPU runs at game start: redraw a hand that is
 * flooded with expensive cards (no cheap early plays) or has no Units, then
 * bottom one card (London-style). Called by the harness before turn 1.
 */
/** True if this hand is worth keeping by the CPU's opening-hand heuristic. */
function handIsKeepable(p: Player): boolean {
  const cheapPlays = p.hand.filter((c) => (c.def.threshold ?? 6) <= 3).length;
  const units = p.hand.filter((c) => c.def.type === 'Unit').length;
  return cheapPlays >= 2 && units >= 1;
}

/** Mulligan a single player's hand (shuffle back, redraw 5, bottom the worst card). */
function mulliganOne(p: Player, rng: () => number) {
  p.deck.push(...p.hand);
  p.hand = [];
  for (let i = p.deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]];
  }
  for (let i = 0; i < 5; i++) p.hand.push(p.deck.pop()!);
  const worst = [...p.hand].sort((a, b) => (b.def.threshold ?? 3) - (a.def.threshold ?? 3))[0];
  const idx = p.hand.indexOf(worst);
  if (idx >= 0) p.deck.unshift(p.hand.splice(idx, 1)[0]);
}

/**
 * Run the CPU's opening-hand mulligan heuristic for ONE player (used by the
 * interactive frontend to give the CPU opponent the same keep/mulligan
 * judgment the playtest harness always gave it — without touching the
 * human's own hand, which is a manual UI decision).
 */
export function maybeMulliganPlayer(g: Game, pid: string, rng: () => number): boolean {
  const p = g.players[pid];
  if (handIsKeepable(p)) return false;
  mulliganOne(p, rng);
  return true;
}

export function maybeMulligan(g: Game, rng: () => number): Record<string, boolean> {
  const mulliganed: Record<string, boolean> = {};
  for (const p of Object.values(g.players)) {
    if (handIsKeepable(p)) continue;
    mulliganed[p.id] = true;
    mulliganOne(p, rng);
  }
  return mulliganed;
}

function unplacedDice(p: Player): number[] {
  return p.dice.map((d, i) => (d.placed ? -1 : i)).filter((i) => i >= 0);
}

/** value of a card for cast-priority: bigger threshold first, units before spells. */
function castPriority(g: Game, p: Player, c: Inst): number {
  let v = (c.def.threshold ?? 3) * 10;
  if (c.def.type === 'Unit') v += 5;
  if (c.def.comboGate) v += 40; // free value when the gate is met
  return v;
}

/** Pick the cheapest sufficient die index for a threshold, or -1. */
function bestDieFor(p: Player, threshold: number): number {
  const idxs = unplacedDice(p).sort((a, b) => p.dice[a].value - p.dice[b].value);
  for (const i of idxs) if (p.dice[i].value >= threshold) return i;
  return -1;
}

/** v4.2 Snap: cast any Snap-marked Charm during the Reroll Phase, before the window closes. */
function playSnaps(g: Game, p: Player) {
  for (const c of [...p.hand]) {
    if (!c.def.snap || c.def.type !== 'Charm') continue;
    const thr = effThreshold(g, p.id, c.def);
    const dieIdx = bestDieFor(p, thr);
    if (dieIdx < 0) continue;
    // Same value-gating as ordinary casts: don't burn Snap on a pointless target.
    const opp = opponentOf(g, p.id);
    if (
      c.def.onCast?.action === 'sap' &&
      c.def.onCast.target === 'enemyUnit' &&
      opp.board.length === 0
    )
      continue;
    if (c.def.onCast?.action === 'bind' && opp.board.length === 0) continue;
    if (
      c.def.onCast?.action === 'mend' &&
      p.leader.damage === 0 &&
      !p.board.some((u) => u.damage > 0)
    )
      continue;
    castFromHand(g, dieIdx, c.iid, c.def.onCast ? autoTarget(g, p.id, c.def.onCast) : undefined);
  }
}

function chooseReroll(g: Game, p: Player): number[] {
  const values = rollValues(p);
  const counts: Record<number, number> = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;

  // Figure out what this hand actually wants: straight-family or matching-family
  // combos, and the set of Cast thresholds we'd like at least one die to reach.
  const gates = [...p.hand, ...p.staging].flatMap((c) => {
    const g2: string[] = [];
    if (c.def.comboGate) g2.push(c.def.comboGate);
    if (c.def.combo) g2.push(c.def.combo.pattern);
    return g2;
  });
  const wantStraight = gates.some((x) => x === 'SmallStraight' || x === 'LargeStraight');
  const wantMatch = gates.some((x) =>
    ['AnyPair', 'TwoPair', 'ThreeKind', 'FourKind', 'FullHouse', 'Yahtzee'].includes(x),
  );
  const stagedNeeds = new Set(
    p.staging.map((s) => s.stagedDie).filter((v): v is number => v !== undefined),
  );

  const out: number[] = [];
  if (wantStraight && !wantMatch) {
    // Keep distinct values; reroll duplicates and isolated extremes.
    const seen = new Set<number>();
    p.dice.forEach((d, i) => {
      if (stagedNeeds.has(d.value)) return;
      if (seen.has(d.value)) {
        out.push(i);
        return;
      }
      seen.add(d.value);
    });
    return out;
  }
  // Default / matching: keep the mode cluster and any die >= 4 (thresholds),
  // plus dice matching a staged Twin need; reroll small singletons.
  const modeValue = Number(
    Object.entries(counts).sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]))[0][0],
  );
  const modeCount = counts[modeValue];
  p.dice.forEach((d, i) => {
    if (stagedNeeds.has(d.value)) return;
    const partOfPair = d.value === modeValue && modeCount >= 2;
    if (!partOfPair && d.value <= 3) out.push(i);
  });
  return out;
}

function locScore(
  c: { def: { locPassive?: string; rarity?: string; ability?: unknown } },
  goingWide: boolean,
): number {
  let s = 0;
  if (c.def.locPassive === (goingWide ? 'ATK_ALL' : 'HP_ALL')) s += 3;
  if (c.def.ability) s += 2;
  const tierOrder = ['Common', 'Uncommon', 'Rare', 'Super-Rare', 'Ultra-Rare', 'Mythic'];
  s += tierOrder.indexOf(c.def.rarity || 'Common') * 0.3;
  return s;
}

function playPlacement(g: Game, p: Player) {
  const opp = opponentOf(g, p.id);

  // v4.1: Locations cast free once per turn — always take it. Prefer the
  // Location whose passive fits our board (ATK_ALL if we're going wide, HP_ALL
  // if we're defensive), then the higher rarity / one with an Ability Slot.
  if (!p.locationCastThisTurn) {
    const locs = p.hand.filter((c) => c.def.type === 'Location' && p.location?.def.id !== c.def.id);
    if (locs.length > 0) {
      const goingWide = p.board.length >= 2;
      const best = locs.sort((a, b) => locScore(b, goingWide) - locScore(a, goingWide))[0];
      castLocationFree(g, best.iid);
    }
  }

  // Scrap low dice first if we hold Scrap cards and have low dice.
  for (const c of [...p.hand]) {
    if (!hasKw(c.def, 'Scrap')) continue;
    const idxs = unplacedDice(p).filter((i) => p.dice[i].value <= 2);
    // Only burn a Scrap card if hand is healthy or the card is weak.
    if (idxs.length > 0 && (p.hand.length >= 4 || (c.def.threshold ?? 6) <= 1)) {
      scrap(g, c.iid, idxs[0]);
    }
  }

  // Complete staged Twin cards when a matching die exists.
  for (const s of [...p.staging]) {
    const idx = unplacedDice(p).find((i) => p.dice[i].value === s.stagedDie);
    if (idx !== undefined) completeTwin(g, idx, s.iid);
  }

  let progress = true;
  while (progress && !g.winner) {
    progress = false;
    const free = unplacedDice(p);
    if (free.length === 0) break;

    // 1. Combo-gated events whose gate is met.
    for (const c of [...p.hand]) {
      if (!c.def.comboGate) continue;
      if (!matchesPattern(rollValues(p), c.def.comboGate)) continue;
      // Don't nuke a thin board with an AoE payoff — hold for value.
      if (c.def.onCast?.target === 'allEnemyUnits' && opp.board.length < 2) continue;
      const dieIdx = unplacedDice(p).sort((a, b) => p.dice[a].value - p.dice[b].value)[0];
      if (dieIdx === undefined) break;
      if (castFromHand(g, dieIdx, c.iid, autoTarget(g, p.id, c.def.onCast!))) progress = true;
    }

    // 2. Cast best numeric-threshold card that fits a die (Locations excluded —
    //    they cast free above and never use a die in v4.1).
    const castable = [...p.hand]
      .filter((c) => !c.def.comboGate && c.def.type !== 'Location')
      .sort((a, b) => castPriority(g, p, b) - castPriority(g, p, a));
    for (const c of castable) {
      if (g.winner) break;
      const thr = effThreshold(g, p.id, c.def);
      // Hold AoE removal for 2+ targets; don't waste single-target removal on
      // an empty board or spare heals at full hp.
      if (c.def.onCast?.target === 'allEnemyUnits' && opp.board.length < 2) continue;
      if (
        c.def.onCast?.action === 'sap' &&
        c.def.onCast.target === 'enemyUnit' &&
        opp.board.length === 0
      )
        continue;
      if (
        c.def.onCast?.action === 'destroy' &&
        c.def.onCast.target !== 'allEnemyUnits' &&
        opp.board.length === 0
      )
        continue;
      if (c.def.onCast?.action === 'bind' && opp.board.length === 0) continue;
      if (
        c.def.onCast?.action === 'mend' &&
        p.leader.damage === 0 &&
        !p.board.some((u) => u.damage > 0)
      )
        continue;
      // Twin (v4.0): only one die per Placement Phase, so we commit the first
      // slot now and complete on a later turn. Stage a low-ish common value
      // (2-4) so the matching second die is reachable, and only if we aren't
      // already juggling a staged copy.
      if (hasKw(c.def, 'Twin')) {
        if (p.staging.some((s) => s.def.id === c.def.id)) continue;
        const idxs = unplacedDice(p)
          .filter((i) => p.dice[i].value >= thr)
          .sort((a, b) => p.dice[a].value - p.dice[b].value);
        if (idxs.length > 0 && p.hand.length >= 3) {
          if (castFromHand(g, idxs[0], c.iid)) progress = true;
        }
        continue;
      }
      const dieIdx = bestDieFor(p, thr);
      if (dieIdx < 0) continue;
      // Prefer hitting Overflow when cheaply available.
      let useIdx = dieIdx;
      if (c.def.overflow) {
        const oIdx = unplacedDice(p)
          .filter((i) => p.dice[i].value - thr >= c.def.overflow!.amount)
          .sort((a, b) => p.dice[a].value - p.dice[b].value)[0];
        if (oIdx !== undefined) useIdx = oIdx;
      }
      if (
        castFromHand(g, useIdx, c.iid, c.def.onCast ? autoTarget(g, p.id, c.def.onCast) : undefined)
      ) {
        progress = true;
        break; // re-evaluate priorities with new state
      }
    }
    if (progress) continue;

    // 3. Echo recasts (only for units, only with spare hand fodder).
    if (p.hand.length >= 2) {
      const echoes = p.discard.filter(
        (c) => hasKw(c.def, 'Echo') && !c.echoSpent && c.def.type === 'Unit',
      );
      for (const c of echoes) {
        const dieIdx = bestDieFor(p, effThreshold(g, p.id, c.def));
        if (dieIdx < 0) continue;
        const fodder = defaultDiscardChoice(p.hand);
        if (echoRecast(g, dieIdx, c.iid, fodder.iid)) {
          progress = true;
          break;
        }
      }
    }
    if (progress) continue;

    // 4. Leader / Location / Unit abilities with leftover dice.
    const leaderAb = p.leader.def.ability;
    if (leaderAb && !p.leader.abilityUsed) {
      // Skip pointless activations.
      const eff = leaderAb.effect;
      const pointless =
        (eff.action === 'mend' && p.leader.damage === 0 && !p.board.some((u) => u.damage > 0)) ||
        ((eff.action === 'bind' || (eff.action === 'sap' && eff.target === 'enemyUnit')) &&
          opp.board.length === 0) ||
        (eff.action === 'draw' && p.hand.length >= 6);
      if (!pointless) {
        const dieIdx = bestDieFor(p, effAbilityThreshold(g, p.leader));
        if (dieIdx >= 0 && activateAbility(g, dieIdx, p.leader.iid)) {
          progress = true;
          continue;
        }
      }
    }
    if (p.location?.def.ability && !p.location.abilityUsed && p.hand.length < 6) {
      const dieIdx = bestDieFor(p, effAbilityThreshold(g, p.location));
      if (dieIdx >= 0 && activateAbility(g, dieIdx, p.location.iid)) {
        progress = true;
        continue;
      }
    }
    // Unit abilities: only on units that won't attack (bound/sick) or utility units.
    for (const u of p.board) {
      if (!u.def.ability || u.abilityUsed || u.hasAttacked) continue;
      const wouldAttack = canAttack(g, u) && effAtk(g, u) >= 3;
      if (wouldAttack) continue;
      const eff = u.def.ability.effect;
      if (eff.action === 'mend' && p.leader.damage === 0 && !p.board.some((x) => x.damage > 0))
        continue;
      if (eff.action === 'buff' && p.board.length < 2) continue;
      const dieIdx = bestDieFor(p, effAbilityThreshold(g, u));
      if (dieIdx >= 0 && activateAbility(g, dieIdx, u.iid)) {
        progress = true;
        break;
      }
    }
    if (progress) continue;

    // v4.2 Ultimate(N): fire the Leader's second Ability Slot once unlocked,
    // once per game, whenever we have a die for it and a sensible target.
    const ult = p.leader.def.ultimate;
    if (ult && !p.leader.ultimateUsed && p.turnsTaken >= ult.unlockTurn) {
      const pointless =
        (ult.effect.action === 'mend' &&
          p.leader.damage === 0 &&
          !p.board.some((u) => u.damage > 0)) ||
        ((ult.effect.action === 'bind' ||
          (ult.effect.action === 'sap' && ult.effect.target === 'enemyUnit')) &&
          opp.board.length === 0);
      if (!pointless) {
        const dieIdx = bestDieFor(p, ult.threshold);
        if (dieIdx >= 0 && activateUltimate(g, dieIdx)) {
          progress = true;
          continue;
        }
      }
    }
    if (progress) continue;

    // 5. Rally: free re-activation using a resting die.
    if (!p.rallyUsedThisTurn) {
      const rallyUnit = p.board.find(
        (u) =>
          hasKw(u.def, 'Rally') &&
          u.def.ability &&
          !u.abilityUsed &&
          !u.hasAttacked &&
          !(u.enteredThisTurn && !hasKw(u.def, 'Swift')) &&
          !u.boundThisTurn,
      );
      if (rallyUnit) {
        const src = [...p.board, p.leader, p.location].find(
          (x): x is Inst =>
            !!x &&
            x.iid !== rallyUnit.iid &&
            x.abilityUsed &&
            (x.abilityDie ?? 0) >= effAbilityThreshold(g, rallyUnit),
        );
        if (src && activateViaRally(g, rallyUnit.iid, src.iid)) {
          progress = true;
          continue;
        }
      }
    }
  }
}

function playCombat(g: Game, p: Player) {
  const opp = opponentOf(g, p.id);
  let guard = 60; // safety valve
  while (!g.winner && guard-- > 0) {
    const attackers = p.board.filter((u) => canAttack(g, u));
    if (attackers.length === 0) break;
    // Lethal check: if total available ATK >= leader hp and no guards, go face.
    const targets = legalTargets(g, p.id);
    const guardsUp = targets.every((t) => t.def.type !== 'Leader');
    const att = attackers.sort((a, b) => effAtk(g, b) - effAtk(g, a))[0];
    const atk = effAtk(g, att);
    if (atk === 0) {
      att.hasAttacked = true;
      att.attacksMade = 99;
      continue;
    }

    let target: Inst | undefined;
    if (guardsUp) {
      // Must hit a guard: pick the one we kill, else the biggest threat.
      target =
        targets.find((t) => remainingHp(g, t) <= atk) ??
        [...targets].sort((a, b) => effAtk(g, b) - effAtk(g, a))[0];
    } else {
      const totalAtk = attackers.reduce((s, u) => s + effAtk(g, u), 0);
      const lethal = totalAtk >= remainingHp(g, opp.leader);
      if (lethal) {
        target = opp.leader;
      } else {
        // Favorable trade: kill an enemy unit without dying, or kill something bigger.
        const kills = opp.board.filter((t) => remainingHp(g, t) <= atk);
        const safeKill = kills.find((t) => effAtk(g, t) < remainingHp(g, att));
        const valueKill = kills.find((t) => (t.def.threshold ?? 0) > (att.def.threshold ?? 0));
        // Threat check: clear big attackers even with a trade.
        const bigThreat = kills.find((t) => effAtk(g, t) >= 5);
        target = safeKill ?? bigThreat ?? valueKill ?? opp.leader;
      }
    }
    if (!attack(g, att.iid, target.iid)) {
      att.hasAttacked = true; // avoid infinite loop on illegal picks
      att.attacksMade = 99;
    }
  }
}

/** Play one full turn for the active player. */
export function playTurn(g: Game) {
  const p = g.players[g.active];

  // Pre-draw: abandon stale Twin cards (staged 2+ turns without completing).
  for (const s of [...p.staging]) {
    if (s.stagedTurns >= 2) abandonTwin(g, s.iid);
  }

  startTurn(g);
  if (g.winner) return;

  playSnaps(g, p); // v4.2: Snap Charms may be cast before the Reroll window closes.
  reroll(g, chooseReroll(g, p));
  playPlacement(g, p);
  if (g.winner) return;
  comboCheck(g);
  if (g.winner) return;
  playCombat(g, p);
  if (g.winner) return;
  endTurn(g, defaultDiscardChoice);
}
