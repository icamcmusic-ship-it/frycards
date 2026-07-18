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
  tollReduction,
  matchesPattern,
  opponentOf,
  autoTarget,
  defaultDiscardChoice,
  rarityTier,
} from './engine';
import { CardDef, hasKw } from './cards';

/**
 * Simple one-shot mulligan the CPU runs at game start: redraw a hand that is
 * flooded with expensive cards (no cheap early plays) or has no Units, then
 * bottom one card (London-style). Called by the harness before turn 1.
 */
// v4.5: a Combo-gate-costed card has no numeric threshold at all (undefined
// falls back to 6, i.e. "expensive"), but an easy-gate card (AnyPair/
// ThreeOdds/ThreeEvens — ~90%+ hit rate even before a reroll, per §6) is
// realistically just as reliable as a threshold-1 numeric card. Without
// this the mulligan heuristic could send back a perfectly fine hand full of
// easy-gate cards for looking "expensive," or keep a hand of hard-gated
// cards that genuinely are unplayable most games.
const EASY_GATE_PATTERNS = new Set(['AnyPair', 'ThreeOdds', 'ThreeEvens']);

/** True if this hand is worth keeping by the CPU's opening-hand heuristic. */
function handIsKeepable(p: Player): boolean {
  const cheapPlays = p.hand.filter(
    (c) =>
      (c.def.threshold ?? 6) <= 3 ||
      (c.def.comboGate !== undefined && EASY_GATE_PATTERNS.has(c.def.comboGate)),
  ).length;
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

/** v4.5: a card's numeric Cast Slot threshold is `undefined` for any
 * Combo-gate-costed card (cleared in applyCostFormat) — every heuristic
 * that used `def.threshold ?? 0/3` as a stand-in for "how much is this
 * card worth" was silently treating gate-costed cards (a meaningful slice
 * of the tier-3+ pool since v4.3) as the cheapest, least valuable cards in
 * hand/on board. This proxies the same 1-6 scale off rarity tier instead,
 * so gate-costed cards compare sensibly against numeric-costed ones. */
const RARITY_THRESHOLD_PROXY: Record<'low' | 'mid' | 'high', number> = {
  low: 2,
  mid: 4,
  high: 6,
};
function costWeight(def: CardDef): number {
  return def.threshold ?? RARITY_THRESHOLD_PROXY[rarityTier(def.rarity)];
}

/** value of a card for cast-priority: bigger threshold first, units before spells.
 * Includes a small seeded jitter so priority ties (and near-ties) don't always
 * resolve the same way — without it, the AI's line of play is 100%
 * reproducible from board state alone and gets predictable/exploitable. */
function castPriority(g: Game, p: Player, c: Inst): number {
  const persona = personaFor(g, p.id);
  // v4.5 correction: castPriority intentionally keeps the flat `?? 3`
  // fallback here, NOT costWeight() — a first pass switched this to
  // costWeight() too, but a verification sim showed it was a real
  // regression (Sea Witch Bind-Straight Combo 69.1%->51.4%, Diver
  // Straight-Combo 32.7%->14.4%): every comboGate card already gets a flat
  // +40 bonus below regardless of rarity, so this base value was already
  // "compensated" as originally diagnosed — switching it to a rarity proxy
  // on top of that flat bonus instead *demoted* common/uncommon gate cards
  // (the bread-and-butter of straight/combo-gated archetypes) relative to
  // higher-rarity ones, delaying exactly the cheap combo pieces those decks
  // depend on. costWeight() stays reserved for the combat valueKill fix and
  // Echo recast ordering below, where the original flat fallback was a
  // genuine bug (not compensated by anything else).
  let v = (c.def.threshold ?? 3) * 10;
  if (c.def.type === 'Unit') v += 5 + persona.curveBias;
  // Removal/disruption gets the mirror-image skew, so control personas answer
  // the board first while aggro personas develop theirs.
  const act = c.def.onCast?.action;
  if (act === 'destroy' || act === 'sap' || act === 'bind') v -= persona.curveBias;
  if (c.def.comboGate) v += 40; // free value when the gate is met
  // v4.5: a recurring Combo passive (checked every Combo Check while the
  // card survives, not just once at cast) had no priority weight at all —
  // the sim's own Combo-trigger totals span two orders of magnitude on
  // cards of comparable cost (29,482 triggers vs. 263), but the AI never
  // preferred casting the proven engine piece over a same-cost vanilla
  // body. Units/Locations keep the passive every turn they survive; a
  // Charm/Event's `.combo` is only a one-shot rider at cast time, so it
  // gets a smaller bump.
  if (c.def.combo) v += c.def.type === 'Unit' || c.def.type === 'Location' ? 8 : 3;
  // v4.4: board-state-aware defensive priority — when this player controls
  // fewer Units than their opponent, a Steel/Bulwark/Toll/Guard/Ward Unit
  // gets a priority bump. Previously priority was purely persona- and
  // curve-driven with no read on what the board actually needs, so a
  // reactive-shell deck (the wider v4.4 archetype roster leans harder into
  // these keywords as primary themes, not just a persona flavor) would dump
  // cards in raw threshold order instead of stabilizing when it's actually
  // behind.
  if (c.def.type === 'Unit' && p.board.length < opponentOf(g, p.id).board.length) {
    const isDefensive = !!(c.def.steel || c.def.bulwark || c.def.toll) || hasKw(c.def, 'Guard') || hasKw(c.def, 'Ward');
    if (isDefensive) v += 6;
  }
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
  // v4.5.1: was two booleans (`wantStraight && !wantMatch`) — a hand with
  // ANY match-family gate card at all (even a single off-theme Unit drafted
  // for an unrelated keyword) silently overrode a straight-heavy hand's
  // reroll strategy entirely, since the matching branch was the unconditional
  // fallback for "wantStraight AND wantMatch" too. decks.ts's score() only
  // *biases* toward an archetype's comboFamily (a -6/+5 weight), it doesn't
  // exclude the other family outright, so a straight-family deck's hand
  // regularly contains a stray match-gated card — and every one of those
  // hands rerolled toward matching instead of the straight the deck was
  // actually built around. Count instead of boolean-AND, so the reroll
  // strategy follows whichever family the CURRENT hand actually leans on.
  const straightWantCount = gates.filter((x) => x === 'SmallStraight' || x === 'LargeStraight')
    .length;
  const matchWantCount = gates.filter((x) =>
    ['AnyPair', 'TwoPair', 'ThreeKind', 'FourKind', 'FullHouse', 'Yahtzee'].includes(x),
  ).length;
  const stagedNeeds = new Set(
    p.staging.map((s) => s.stagedDie).filter((v): v is number => v !== undefined),
  );
  // v4.6: exact-cost cards in hand need one die showing EXACTLY their
  // (effective) threshold — but this heuristic was rerolling every small
  // singleton (<= 3) away, actively destroying the payability of exact-1/2/3
  // cards it was holding. The sim's cast-rate data showed exactly that:
  // exact-cost removal spells sat at 0.29-0.44 casts/game (the "useless"
  // list) while comparable at-least-cost cards cast 3-5x as often. Protect
  // ONE die per exact-cost value needed (not every copy — spare duplicates
  // are still better rerolled toward the hand's combo plan).
  const exactNeeds = new Set(
    p.hand
      .filter((c) => c.def.castCostKind === 'exact' && c.def.threshold !== undefined)
      .map((c) => effThreshold(g, p.id, c.def)),
  );
  const exactKept = new Set<number>();
  const keepForExact = (v: number): boolean => {
    if (!exactNeeds.has(v) || exactKept.has(v)) return false;
    exactKept.add(v);
    return true;
  };

  const out: number[] = [];
  if (straightWantCount > 0 && straightWantCount >= matchWantCount) {
    // Keep distinct values; reroll duplicates and isolated extremes.
    const seen = new Set<number>();
    p.dice.forEach((d, i) => {
      if (d.placed) return; // Snap casts may have placed dice pre-reroll
      if (stagedNeeds.has(d.value)) return;
      if (seen.has(d.value)) {
        if (keepForExact(d.value)) return; // a duplicate can still pay an exact cost
        out.push(i);
        return;
      }
      seen.add(d.value);
    });
    return out;
  }
  // Default / matching: keep the mode cluster and any die >= 4 (thresholds),
  // plus dice matching a staged Twin need or paying an exact-cost card in
  // hand; reroll small singletons.
  const modeValue = Number(
    Object.entries(counts).sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]))[0][0],
  );
  const modeCount = counts[modeValue];
  p.dice.forEach((d, i) => {
    if (d.placed) return; // Snap casts may have placed dice pre-reroll
    if (stagedNeeds.has(d.value)) return;
    const partOfPair = d.value === modeValue && modeCount >= 2;
    if (!partOfPair && d.value <= 3) {
      if (keepForExact(d.value)) return;
      out.push(i);
    }
  });
  return out;
}

function locScore(
  c: {
    def: {
      locPassive?: string;
      rarity?: string;
      ability?: unknown;
      foothold?: boolean;
      excavate?: unknown;
      tribute?: unknown;
      contested?: boolean;
    };
  },
  goingWide: boolean,
  oppHasLocation: boolean,
): number {
  let s = 0;
  if (c.def.locPassive === (goingWide ? 'ATK_ALL' : 'HP_ALL')) s += 3;
  if (c.def.ability) s += 2;
  // v4.5: locScore previously only ever looked at locPassive/ability/rarity
  // — blind to 3 of the 4 dedicated Location keywords, so the AI picked
  // among Locations in hand with no read on Foothold/Excavate/Tribute/
  // Contested at all. Foothold is the highest-value immediate tempo (cheapens
  // the very next Unit cast this turn); Excavate rewards committing to one
  // Location over time rather than replacing it every time something newer
  // shows up; Contested is only worth racing for while the opponent has no
  // Location of their own.
  if (c.def.foothold) s += 4;
  if (c.def.excavate) s += 2;
  if (c.def.tribute) s += 1;
  if (c.def.contested) s += oppHasLocation ? 1 : 3;
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
      const oppHasLocation = !!opp.location;
      const best = locs.sort(
        (a, b) =>
          locScore(b, goingWide, oppHasLocation) - locScore(a, goingWide, oppHasLocation),
      )[0];
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
    // it; see cardpool.ts). Mid-rarity cards waive the fodder discard
    // entirely (v4.4, see engine.ts echoRecast), so they only need a spare
    // die/target, not spare hand fodder; low/high rarity still need one card
    // to sacrifice.
    if (p.hand.length >= 1) {
      // v4.5: was iterated in raw discard-pile order (insertion order), not
      // by value — when dice/fodder are tight, a low-value low-rarity Echo
      // card could consume the turn's one realistic recast before a
      // higher-value mid/high-rarity card sitting deeper in the pile was
      // ever considered. Mid-rarity cards are cheapest to recast (no fodder
      // cost since v4.4), so they go first when otherwise tied; within a
      // rarity tier, prefer the pricier (more impactful) card.
      const rarityOrder: Record<'low' | 'mid' | 'high', number> = { mid: 2, high: 1, low: 0 };
      const echoes = p.discard
        .filter((c) => hasKw(c.def, 'Echo') && !c.echoSpent)
        .sort(
          (a, b) =>
            rarityOrder[rarityTier(b.def.rarity)] - rarityOrder[rarityTier(a.def.rarity)] ||
            costWeight(b.def) - costWeight(a.def),
        );
      for (const c of echoes) {
        const waiveFodder = rarityTier(c.def.rarity) === 'mid';
        if (!waiveFodder && p.hand.length < 2) continue;
        // v4.7: recasting a LOW-rarity Echo card costs a die AND a real card
        // from hand — the decision table has measured it as a consistent
        // net-negative (-9.4pt this pass) while mid/high-rarity Echo is
        // positive. Only pay a card for a low-rarity recast when hand is
        // flush enough that the fodder is nearly free.
        if (!waiveFodder && rarityTier(c.def.rarity) === 'low' && p.hand.length < 5) continue;
        const sel = bestSelectionFor(g, p, c.def);
        if (!sel) continue;
        const fodder = waiveFodder ? undefined : defaultDiscardChoice(p.hand);
        const target = c.def.onCast ? autoTarget(g, p.id, c.def.onCast) : undefined;
        if (echoRecast(g, sel, c.iid, fodder?.iid, target)) {
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
    if (p.location?.def.ability && !p.location.abilityUsed) {
      // Skip pointless activations — same per-effect check as the Leader
      // block above, not a blanket hand-size gate (Locations can roll sap/
      // mend/buff abilities too, which are never pointless just because the
      // hand happens to be full).
      const eff = p.location.def.ability.effect;
      const pointless =
        (eff.action === 'mend' && p.leader.damage === 0 && !p.board.some((u) => u.damage > 0)) ||
        ((eff.action === 'bind' || (eff.action === 'sap' && eff.target === 'enemyUnit')) &&
          opp.board.length === 0) ||
        (eff.action === 'draw' && p.hand.length >= 8);
      if (!pointless) {
        const dieIdx = bestDieFor(p, effAbilityThreshold(g, p.location));
        if (dieIdx >= 0 && activateAbility(g, dieIdx, p.location.iid)) {
          progress = true;
          continue;
        }
      }
    }
    // Unit abilities: only on units that won't attack (bound/sick) or utility units.
    for (const u of p.board) {
      if (!u.def.ability || u.abilityUsed || u.hasAttacked) continue;
      const eff = u.def.ability.effect;
      // v4.5.1: was a blanket "any 3+ ATK unit always attacks instead,
      // regardless of what its ability does" — a 3 ATK Unit whose Ability
      // is unconditional removal (`destroy`) got skipped in favor of a
      // few points of combat damage, even when a real enemy target was
      // sitting right there. Ability Slot use and attacking are mutually
      // exclusive (§7), so this was leaving high-value removal on the
      // table every time its body happened to clear the arbitrary 3-ATK
      // bar. `destroy` against a live target is the one case worth
      // overriding the "attack instead" default for — every other action
      // (sap/mend/draw/buff) is close enough in value to raw combat damage
      // that the existing threshold is a reasonable default.
      const removalWorthIt = eff.action === 'destroy' && opp.board.length > 0;
      const wouldAttack = canAttack(g, u) && effAtk(g, u) >= 3 && !removalWorthIt;
      if (wouldAttack) continue;
      if (eff.action === 'mend' && p.leader.damage === 0 && !p.board.some((x) => x.damage > 0))
        continue;
      if (eff.action === 'draw' && p.hand.length >= 8) continue;
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
        (ult.effect.target === 'allEnemyUnits' && opp.board.length < 2) ||
        // v4.7: don't burn a once-per-game board-wide buff on an empty/thin
        // board either — the ahead/behind instrumentation showed Ultimates
        // spent from a losing position (often an empty board) are the
        // single worst decision in the table (-39pt).
        (ult.effect.action === 'buff' &&
          ult.effect.target === 'allFriendlyUnits' &&
          p.board.length < 2);
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
    // Score once per attacker (a seeded jitter INSIDE a sort comparator makes
    // the comparator inconsistent) — jittered so near-tied attacker choices
    // vary game to game while staying reproducible under a fixed seed.
    const att = attackers
      .map((u) => ({ u, s: effAtk(g, u) + tieBreak(g) }))
      .sort((a, b) => b.s - a.s)[0].u;
    // v4.4: attacker-aware — excludes the enemy Leader on a Frenzy second
    // swing (see engine.ts legalTargets), so the AI never attempts an
    // illegal face attack with a bonus swing and wastes it.
    const targets = legalTargets(g, p.id, att.iid);
    const guardsUp = targets.every((t) => t.def.type !== 'Leader');
    const atk = effAtk(g, att);
    if (atk === 0) {
      att.hasAttacked = true;
      att.attacksMade = 99;
      continue;
    }

    let target: Inst | undefined;
    if (guardsUp) {
      // Must hit a guard (or this is a Frenzy 2nd swing with the Leader
      // excluded and no Guards up either): pick the one we kill, else the
      // biggest threat among whatever's actually legal right now.
      target =
        targets.find((t) => willKillInCombat(g, t, atk)) ??
        targets.map((t) => ({ t, s: effAtk(g, t) + tieBreak(g) })).sort((a, b) => b.s - a.s)[0]?.t;
    } else {
      // v4.7: Toll reduces EVERY incoming hit to the Leader by up to its cap
      // (engine.ts tollReduction) — the old raw-ATK sum mistook a heavily
      // Tolled Leader for lethal range and dumped whole boards into face
      // attacks that each lost up to 3 damage, instead of trading.
      const toll = tollReduction(g, opp.id);
      const totalAtk = attackers.reduce((s, u) => s + Math.max(0, effAtk(g, u) - toll), 0);
      const lethal = totalAtk >= remainingHp(g, opp.leader);
      if (lethal) {
        target = opp.leader;
      } else {
        // Favorable trade: kill an enemy unit without dying, or kill something bigger.
        const kills = opp.board.filter((t) => willKillInCombat(g, t, atk));
        const safeKill = kills.find((t) => effAtk(g, t) < remainingHp(g, att));
        // v4.5: was `t.def.threshold ?? 0`, which reads as 0 for any
        // Combo-gate-costed target — a Mythic bomb gated behind Full House
        // registered as cheaper than a threshold-1 Common in this
        // comparison, so the AI would never recognize it as the better
        // kill in an optional trade. costWeight() proxies gate-costed cards
        // off rarity instead so this comparison means the same thing
        // regardless of which of the three cast-cost formats a card uses.
        const valueKill = kills.find((t) => costWeight(t.def) > costWeight(att.def));
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
    if (!target || !attack(g, att.iid, target.iid)) {
      att.hasAttacked = true; // avoid infinite loop on illegal/no picks
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
