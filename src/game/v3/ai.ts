/**
 * Heuristic AI for v3.0 playtesting. Plays a full turn through the engine's
 * public actions: reroll, placement (all four destinations + Scrap), combo
 * check, sequential combat, end turn.
 */
import {
  Game, Inst, Player,
  reroll, castFromHand, activateAbility, activateViaRally, completeTwin, echoRecast,
  scrap, abandonTwin, comboCheck, attack, endTurn, startTurn,
  canAttack, legalTargets, effAtk, remainingHp, effThreshold, rollValues, matchesPattern,
  opponentOf, autoTarget,
} from './engine';
import { hasKw } from './cards';

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
function bestDieFor(p: Player, threshold: number, preferExact = true): number {
  const idxs = unplacedDice(p).sort((a, b) => p.dice[a].value - p.dice[b].value);
  for (const i of idxs) if (p.dice[i].value >= threshold) return i;
  return -1;
}

function chooseReroll(g: Game, p: Player): number[] {
  // Keep the most common value (combo chasing) and any die >= 4; reroll the rest.
  const values = rollValues(p);
  const counts: Record<number, number> = {};
  for (const v of values) counts[v] = (counts[v] || 0) + 1;
  const modeValue = Number(
    Object.entries(counts).sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]))[0][0],
  );
  const modeCount = counts[modeValue];
  const out: number[] = [];
  p.dice.forEach((d, i) => {
    const partOfPair = d.value === modeValue && modeCount >= 2;
    if (!partOfPair && d.value <= 3) out.push(i);
  });
  return out;
}

function playPlacement(g: Game, p: Player) {
  const opp = opponentOf(g, p.id);

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
      // Don't nuke an empty board.
      if (c.def.id === 'grand_slam' && opp.board.length < 2) continue;
      const dieIdx = unplacedDice(p).sort((a, b) => p.dice[a].value - p.dice[b].value)[0];
      if (dieIdx === undefined) break;
      if (castFromHand(g, dieIdx, c.iid, autoTarget(g, p.id, c.def.onCast!))) progress = true;
    }

    // 2. Cast best numeric-threshold card that fits a die.
    const castable = [...p.hand]
      .filter((c) => !c.def.comboGate)
      .sort((a, b) => castPriority(g, p, b) - castPriority(g, p, a));
    for (const c of castable) {
      if (g.winner) break;
      const thr = effThreshold(g, p.id, c.def);
      if (c.def.type === 'Location' && (p.locationCastThisTurn || p.location?.def.id === c.def.id))
        continue;
      // Don't waste removal on an empty board / spare heals at full hp.
      if (c.def.onCast?.action === 'sap' && c.def.onCast.target === 'enemyUnit' && opp.board.length === 0) continue;
      if (c.def.onCast?.action === 'destroy' && opp.board.length === 0) continue;
      if (c.def.onCast?.action === 'bind' && opp.board.length === 0) continue;
      if (c.def.onCast?.action === 'mend' && p.leader.damage === 0 && !p.board.some((u) => u.damage > 0)) continue;
      // Twin: only start if we can complete now (a second matching die) or the
      // die is high and hand has room to wait.
      if (hasKw(c.def, 'Twin')) {
        const idxs = unplacedDice(p).filter((i) => p.dice[i].value >= thr);
        const pairIdx = idxs.find((i) =>
          idxs.some((j) => j !== i && p.dice[j].value === p.dice[i].value),
        );
        if (pairIdx !== undefined) {
          const v = p.dice[pairIdx].value;
          const second = idxs.find((j) => j !== pairIdx && p.dice[j].value === v)!;
          if (castFromHand(g, pairIdx, c.iid)) {
            completeTwin(g, second, c.iid);
            progress = true;
          }
        } else if (idxs.length > 0 && p.staging.length === 0) {
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
      if (castFromHand(g, useIdx, c.iid, c.def.onCast ? autoTarget(g, p.id, c.def.onCast) : undefined)) {
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
        const fodder = [...p.hand].sort(
          (a, b) => (a.def.threshold ?? 3) - (b.def.threshold ?? 3),
        )[0];
        if (echoRecast(g, dieIdx, c.iid, fodder.iid)) { progress = true; break; }
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
        const dieIdx = bestDieFor(p, leaderAb.threshold);
        if (dieIdx >= 0 && activateAbility(g, dieIdx, p.leader.iid)) { progress = true; continue; }
      }
    }
    if (p.location?.def.ability && !p.location.abilityUsed && p.hand.length < 6) {
      const dieIdx = bestDieFor(p, p.location.def.ability.threshold);
      if (dieIdx >= 0 && activateAbility(g, dieIdx, p.location.iid)) { progress = true; continue; }
    }
    // Unit abilities: only on units that won't attack (bound/sick) or utility units.
    for (const u of p.board) {
      if (!u.def.ability || u.abilityUsed || u.hasAttacked) continue;
      const wouldAttack = canAttack(g, u) && effAtk(g, u) >= 3;
      if (wouldAttack) continue;
      const eff = u.def.ability.effect;
      if (eff.action === 'mend' && p.leader.damage === 0 && !p.board.some((x) => x.damage > 0)) continue;
      if (eff.action === 'buff' && p.board.length < 2) continue;
      const dieIdx = bestDieFor(p, u.def.ability.threshold);
      if (dieIdx >= 0 && activateAbility(g, dieIdx, u.iid)) { progress = true; break; }
    }
    if (progress) continue;

    // 5. Rally: free re-activation using a resting die.
    if (!p.rallyUsedThisTurn) {
      const rallyUnit = p.board.find(
        (u) => hasKw(u.def, 'Rally') && u.def.ability && !u.abilityUsed && !u.hasAttacked &&
          !(u.enteredThisTurn && !hasKw(u.def, 'Swift')) && !u.boundThisTurn,
      );
      if (rallyUnit) {
        const src = [...p.board, p.leader, p.location].find(
          (x): x is Inst =>
            !!x && x.iid !== rallyUnit.iid && x.abilityUsed &&
            (x.abilityDie ?? 0) >= rallyUnit.def.ability!.threshold,
        );
        if (src && activateViaRally(g, rallyUnit.iid, src.iid)) { progress = true; continue; }
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
    if (atk === 0) { att.hasAttacked = true; att.attacksMade = 99; continue; }

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
        const valueKill = kills.find(
          (t) => (t.def.threshold ?? 0) > (att.def.threshold ?? 0),
        );
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

  reroll(g, chooseReroll(g, p));
  playPlacement(g, p);
  if (g.winner) return;
  comboCheck(g);
  if (g.winner) return;
  playCombat(g, p);
  if (g.winner) return;
  endTurn(g, (hand) =>
    [...hand].sort((a, b) => (a.def.threshold ?? 3) - (b.def.threshold ?? 3))[0],
  );
}
