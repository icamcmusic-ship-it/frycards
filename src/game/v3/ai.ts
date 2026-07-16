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
  willKillInCombat,
  effThreshold,
  effAbilityThreshold,
  rollValues,
  matchesPattern,
  opponentOf,
  autoTarget,
  defaultDiscardChoice,
} from './engine';
import { CardDef, hasKw } from './cards';

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

/** Mulligan a single player's hand (shuffle back, redraw 7 — v4.3, was 5 —
 * then bottom the worst card, London-style). */
function mulliganOne(p: Player, rng: () => number) {
  p.deck.push(...p.hand);
  p.hand = [];
  for (let i = p.deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]];
  }
  for (let i = 0; i < 7; i++) p.hand.push(p.deck.pop()!);
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

/**
 * Per-game CPU persona: a small set of dials rolled once per game (from the
 * game's own seeded rng, so sims stay reproducible) that skew the heuristics
 * below. Without this the CPU's line of play collapses to one archetype —
 * every game it trades the same way, casts in the same order, and feels
 * identical to play against. Personas keep every choice legal and sensible
 * (lethal is always taken, big threats are always answered) but vary the
 * flavor: how face-hungry combat is, how much cast order favors Units vs
 * removal, and how loose the tie-breaking jitter is.
 */
interface Persona {
  name: string;
  /** 0..1 — chance combat pushes face damage over an optional value trade. */
  aggression: number;
  /** Magnitude of the seeded tie-break jitter (± this / 2). */
  jitter: number;
  /** Cast-priority skew: >0 favors Units/tempo, <0 favors removal/answers. */
  curveBias: number;
}

const PERSONAS: Persona[] = [
  { name: 'aggro', aggression: 0.75, jitter: 2.5, curveBias: 4 },
  { name: 'tempo', aggression: 0.5, jitter: 3.5, curveBias: 2 },
  { name: 'balanced', aggression: 0.35, jitter: 3, curveBias: 0 },
  { name: 'control', aggression: 0.15, jitter: 2, curveBias: -4 },
];

// WeakMap keyed on the Game object (ai.ts owns no field on Game itself) —
// one persona per player per game, rolled lazily from g.rng on first use.
const gamePersonas = new WeakMap<Game, Record<string, Persona>>();

function personaFor(g: Game, pid: string): Persona {
  let m = gamePersonas.get(g);
  if (!m) {
    m = {};
    gamePersonas.set(g, m);
  }
  let p = m[pid];
  if (!p) {
    p = PERSONAS[Math.floor(g.rng() * PERSONAS.length)] ?? PERSONAS[0];
    m[pid] = p;
  }
  return p;
}

function unplacedDice(p: Player): number[] {
  return p.dice.map((d, i) => (d.placed ? -1 : i)).filter((i) => i >= 0);
}

/** value of a card for cast-priority: bigger threshold first, units before spells.
 * Includes a small seeded jitter so priority ties (and near-ties) don't always
 * resolve the same way — without it, the AI's line of play is 100%
 * reproducible from board state alone and gets predictable/exploitable. */
function castPriority(g: Game, p: Player, c: Inst): number {
  const persona = personaFor(g, p.id);
  let v = (c.def.threshold ?? 3) * 10;
  if (c.def.type === 'Unit') v += 5 + persona.curveBias;
  // Removal/disruption gets the mirror-image skew, so control personas answer
  // the board first while aggro personas develop theirs.
  const act = c.def.onCast?.action;
  if (act === 'destroy' || act === 'sap' || act === 'bind') v -= persona.curveBias;
  if (c.def.comboGate) v += 40; // free value when the gate is met
  return v + tieBreak(g);
}

/** Small seeded-random nudge (persona-sized, ±1 to ±1.75) used to break
 * near-ties in AI heuristics without overriding genuine priority differences. */
function tieBreak(g: Game): number {
  return (g.rng() - 0.5) * personaFor(g, g.active).jitter;
}

/** Pick the cheapest sufficient die index for an "at least" threshold, or -1. */
function bestDieFor(p: Player, threshold: number): number {
  const idxs = unplacedDice(p).sort((a, b) => p.dice[a].value - p.dice[b].value);
  for (const i of idxs) if (p.dice[i].value >= threshold) return i;
  return -1;
}

/**
 * v4.3: pick a legal die selection for any of this card's cast-cost formats
 * (comboGate is handled by callers directly since it also needs the
 * once-per-turn gate check). Returns null if unaffordable right now.
 */
function bestSelectionFor(g: Game, p: Player, def: CardDef): number[] | null {
  const thr = effThreshold(g, p.id, def);
  if (def.castCostKind === 'exact') {
    const idx = unplacedDice(p).find((i) => p.dice[i].value === thr);
    return idx !== undefined ? [idx] : null;
  }
  if (def.castCostKind === 'sum') {
    // Smallest dice first — spends low-value dice that few other cards want,
    // preserving high dice for 'atLeast'/'exact' costs elsewhere in hand.
    // v4.3 Overflow: cardpool.ts only ever prints Overflow on 'sum'-cost
    // cards, but the bare-minimum sum this loop used to stop at almost
    // never clears the Overflow amount on top of the threshold — keep
    // adding the next-smallest die past the minimum until the Overflow
    // bonus is actually earned (or dice run out), same as bestDieFor's
    // sibling handling of 'atLeast'+Overflow cards elsewhere in this file.
    const idxs = unplacedDice(p).sort((a, b) => p.dice[a].value - p.dice[b].value);
    const target = def.overflow ? thr + def.overflow.amount : thr;
    const chosen: number[] = [];
    let sum = 0;
    for (const i of idxs) {
      if (sum >= target) break;
      chosen.push(i);
      sum += p.dice[i].value;
    }
    return sum >= thr ? chosen : null;
  }
  const idx = bestDieFor(p, thr);
  return idx >= 0 ? [idx] : null;
}

/** v4.2 Snap: cast any Snap-marked Charm during the Reroll Phase, before the window closes. */
function playSnaps(g: Game, p: Player) {
  for (const c of [...p.hand]) {
    if (!c.def.snap || c.def.type !== 'Charm') continue;
    const sel = bestSelectionFor(g, p, c.def);
    if (!sel) continue;
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
    castFromHand(g, sel, c.iid, c.def.onCast ? autoTarget(g, p.id, c.def.onCast) : undefined);
  }
}

function chooseReroll(g: Game, p: Player): number[] {
  // Count only unplaced dice — Snap casts can place dice before the reroll
  // window, and a placed die's value must not anchor the "keep" cluster
  // (we can't keep-or-reroll it anyway).
  const counts: Record<number, number> = {};
  for (const d of p.dice) if (!d.placed) counts[d.value] = (counts[d.value] || 0) + 1;
  if (Object.keys(counts).length === 0) return [];

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
      if (d.placed) return; // Snap casts may have placed dice pre-reroll
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
    if (d.placed) return; // Snap casts may have placed dice pre-reroll
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
  const tierOrder = [
    'Common',
    'Uncommon',
    'Rare',
    'Super-Rare',
    'Full-Art',
    'Ultra-Rare',
    'Mythic',
  ];
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

    // 1. Combo-gated cards whose gate is met (v4.3: any card type, not just
    //    Events — Units/Charms may print a comboGate cost with no onCast at
    //    all, so this no longer assumes onCast exists).
    for (const c of [...p.hand]) {
      if (!c.def.comboGate) continue;
      if (p.comboGateCastThisTurn) break;
      if (!matchesPattern(rollValues(p), c.def.comboGate)) continue;
      // Don't nuke a thin board with an AoE payoff — hold for value.
      if (c.def.onCast?.target === 'allEnemyUnits' && opp.board.length < 2) continue;
      const dieIdx = unplacedDice(p).sort((a, b) => p.dice[a].value - p.dice[b].value)[0];
      if (dieIdx === undefined) break;
      const target = c.def.onCast ? autoTarget(g, p.id, c.def.onCast) : undefined;
      if (castFromHand(g, dieIdx, c.iid, target)) progress = true;
    }

    // 2. Cast best numeric-threshold card that fits a die (Locations excluded —
    //    they cast free above and never use a die in v4.1).
    // Score each card's priority once, then sort the scores — a sort
    // comparator that re-rolls castPriority's seeded jitter on every
    // comparison (Array.prototype.sort calls it more than once per element)
    // isn't a consistent total order, so the same card could rank
    // differently against different opponents in the same pass.
    const castable = p.hand
      .filter((c) => !c.def.comboGate && c.def.type !== 'Location')
      .map((c) => ({ c, s: castPriority(g, p, c) }))
      .sort((a, b) => b.s - a.s)
      .map(({ c }) => c);
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
      // v4.3: Overflow only ever prints on 'atLeast'-cost cards (see
      // cardpool.ts) — prefer a die that clears the Overflow amount when one's
      // cheaply available. Every other numeric cost format (exact/sum) goes
      // through the general bestSelectionFor picker below.
      let sel: number[] | null;
      if (c.def.overflow && (c.def.castCostKind ?? 'atLeast') === 'atLeast') {
        const dieIdx = bestDieFor(p, thr);
        if (dieIdx < 0) continue;
        const oIdx = unplacedDice(p)
          .filter((i) => p.dice[i].value - thr >= c.def.overflow!.amount)
          .sort((a, b) => p.dice[a].value - p.dice[b].value)[0];
        sel = [oIdx !== undefined ? oIdx : dieIdx];
      } else {
        sel = bestSelectionFor(g, p, c.def);
      }
      if (!sel) continue;
      if (
        castFromHand(g, sel, c.iid, c.def.onCast ? autoTarget(g, p.id, c.def.onCast) : undefined)
      ) {
        progress = true;
        break; // re-evaluate priorities with new state
      }
    }
    if (progress) continue;

    // 3. Echo recasts — any Echo card type (Units, Charms, Events all print
    // it; see cardpool.ts), only with spare hand fodder.
    if (p.hand.length >= 2) {
      const echoes = p.discard.filter((c) => hasKw(c.def, 'Echo') && !c.echoSpent);
      for (const c of echoes) {
        const sel = bestSelectionFor(g, p, c.def);
        if (!sel) continue;
        const fodder = defaultDiscardChoice(p.hand);
        const target = c.def.onCast ? autoTarget(g, p.id, c.def.onCast) : undefined;
        if (echoRecast(g, sel, c.iid, fodder.iid, target)) {
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
        (eff.action === 'draw' && p.hand.length >= 8);
      if (!pointless) {
        const dieIdx = bestDieFor(p, effAbilityThreshold(g, p.leader));
        if (dieIdx >= 0 && activateAbility(g, dieIdx, p.leader.iid)) {
          progress = true;
          continue;
        }
      }
    }
    if (p.location?.def.ability && !p.location.abilityUsed && p.hand.length < 8) {
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
      // Only skip a board-wide buff on a near-empty board — a self/single-
      // target buff is still worth using even with just one Unit in play.
      if (eff.action === 'buff' && eff.target === 'allFriendlyUnits' && p.board.length < 2)
        continue;
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
          opp.board.length === 0) ||
        // v4.3 comeback-pass Ultimates: don't waste a once-per-game board
        // wipe / mass sap on a thin board (same gating as AoE Event casts).
        (ult.effect.target === 'allEnemyUnits' && opp.board.length < 2);
      if (!pointless) {
        const dieIdx = bestDieFor(p, ult.threshold);
        if (dieIdx >= 0 && activateUltimate(g, dieIdx)) {
          progress = true;
          continue;
        }
      }
    }
    if (progress) continue;

    // 5. Rally: free re-activation using a resting die. Not player-capped —
    // each Rally card is its own "once per turn" (enforced by abilityUsed).
    {
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
    // Score once per attacker (a seeded jitter INSIDE a sort comparator makes
    // the comparator inconsistent) — jittered so near-tied attacker choices
    // vary game to game while staying reproducible under a fixed seed.
    const att = attackers
      .map((u) => ({ u, s: effAtk(g, u) + tieBreak(g) }))
      .sort((a, b) => b.s - a.s)[0].u;
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
        targets.find((t) => willKillInCombat(g, t, atk)) ??
        targets.map((t) => ({ t, s: effAtk(g, t) + tieBreak(g) })).sort((a, b) => b.s - a.s)[0].t;
    } else {
      const totalAtk = attackers.reduce((s, u) => s + effAtk(g, u), 0);
      const lethal = totalAtk >= remainingHp(g, opp.leader);
      if (lethal) {
        target = opp.leader;
      } else {
        // Favorable trade: kill an enemy unit without dying, or kill something bigger.
        const kills = opp.board.filter((t) => willKillInCombat(g, t, atk));
        const safeKill = kills.find((t) => effAtk(g, t) < remainingHp(g, att));
        const valueKill = kills.find((t) => (t.def.threshold ?? 0) > (att.def.threshold ?? 0));
        // Threat check: clear big attackers even with a trade — every persona
        // answers a 5+ ATK unit before doing anything cute.
        const bigThreat = kills.find((t) => effAtk(g, t) >= 5);
        // Persona flavor (seeded): aggro personas sometimes push face damage
        // instead of taking an optional trade; control personas will even
        // trade down to clear a real attacker (3+ ATK) when nothing free is
        // on offer. Lethal and bigThreat above are never skipped.
        const persona = personaFor(g, p.id);
        const wantsFace = g.rng() < persona.aggression;
        const clearKill =
          g.rng() > persona.aggression ? kills.find((t) => effAtk(g, t) >= 3) : undefined;
        // Free kills (no death-back) are always taken; only the optional
        // trade-with-losses is subject to the face-vs-trade roll.
        target =
          bigThreat ?? safeKill ?? (wantsFace ? undefined : (valueKill ?? clearKill)) ?? opp.leader;
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
  // v4.3: up to rerollsAllowed rerolls — keep re-evaluating and rerolling
  // toward the hand's wants until nothing's left worth touching or the
  // allowance runs out.
  while (g.stage === 'PRE_REROLL') {
    const picks = chooseReroll(g, p);
    reroll(g, picks);
    if (picks.length === 0) break;
  }
  playPlacement(g, p);
  if (g.winner) return;
  comboCheck(g);
  if (g.winner) return;
  playCombat(g, p);
  if (g.winner) return;
  endTurn(g, defaultDiscardChoice);
}
