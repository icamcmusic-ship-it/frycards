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
  SIM_TUNING,
} from './engine';
import { CardDef, Effect, hasKw } from './cards';

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
// v4.15: a hard-gate card in hand only counted as "cheap" via
// EASY_GATE_PATTERNS — but a hand with 2+ cards sharing the SAME mid/hard
// gate pattern is a coherent, focused-reroll combo hand realistically
// playable within a turn or two, even though no single card in it is
// individually cheap. Mirrors the count-not-boolean fix `chooseReroll`
// already applies to gate-family detection (see straightWantCount/
// matchWantCount below) — a hand's own composition, not a flat per-card
// rule, is what should decide whether a gate counts as "on-plan."
/** v4.16: split out of handIsKeepable() so the mulligan-quality lapse
 * detector below (recordMulliganLapse) can read the same cheapPlays/units
 * counts the keep decision was based on, instead of recomputing its own
 * (possibly divergent) copy of this logic. */
function handKeepStats(p: Player): { cheapPlays: number; units: number } {
  const gateCounts: Record<string, number> = {};
  for (const c of p.hand) {
    if (c.def.comboGate) gateCounts[c.def.comboGate] = (gateCounts[c.def.comboGate] || 0) + 1;
  }
  const cheapPlays = p.hand.filter((c) => {
    if ((c.def.threshold ?? 6) <= 3) return true;
    if (c.def.comboGate === undefined) return false;
    if (EASY_GATE_PATTERNS.has(c.def.comboGate)) return true;
    return (gateCounts[c.def.comboGate] || 0) >= 2;
  }).length;
  const units = p.hand.filter((c) => c.def.type === 'Unit').length;
  return { cheapPlays, units };
}

function handIsKeepable(p: Player): boolean {
  const { cheapPlays, units } = handKeepStats(p);
  // v4.17: the bare `cheapPlays>=2 && units>=1` floor kept hands that clear
  // it by the thinnest possible margin (exactly 2 cheap plays, exactly 1
  // Unit) — the mulligan-lapse detector below flagged these as materially
  // underperforming (-23.1pt delta) vs comfortable keeps. Require a small
  // margin above the bare minimum: either enough cheap plays to survive a
  // dead draw, or enough Units to keep board presence, while still keeping
  // the original floor as an absolute (never keep below it).
  if (cheapPlays < 2 || units < 1) return false;
  return cheapPlays >= 3 || units >= 2;
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
  // v4.15: was `threshold ?? 3` — the same bug `RARITY_THRESHOLD_PROXY`/
  // `costWeight()` fixed everywhere else in this file (see that helper's
  // comment below): a Combo-gate-costed card has no threshold at all, so
  // it silently compared as "3" here regardless of whether it was a cheap
  // AnyPair Common or a Mythic gated behind a Full House — this is the one
  // remaining raw-threshold comparison `costWeight()` was never applied to.
  const worst = [...p.hand].sort((a, b) => costWeight(b.def) - costWeight(a.def))[0];
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
  if (handIsKeepable(p)) {
    recordMulliganLapse(g, p);
    return false;
  }
  mulliganOne(p, rng);
  return true;
}

export function maybeMulligan(g: Game, rng: () => number): Record<string, boolean> {
  const mulliganed: Record<string, boolean> = {};
  for (const p of Object.values(g.players)) {
    if (handIsKeepable(p)) {
      recordMulliganLapse(g, p);
      continue;
    }
    mulliganed[p.id] = true;
    mulliganOne(p, rng);
  }
  return mulliganed;
}

/**
 * v4.16 harness upgrade: audits a gap in `recordCpuLapses`'s original scope —
 * every existing lapse detector fires DURING a turn (Placement/Combat); none
 * ever looked at the one-shot mulligan decision at game start, even though
 * the task's own docs call out "mulligan mistakes" as an uninstrumented
 * decision category. `handIsKeepable`'s bar is a flat cheapPlays>=2 && units>=1
 * threshold — a hand that clears it by the thinnest possible margin (exactly
 * 2 cheap plays, exactly 1 Unit) is a materially weaker keep than one with
 * real depth, but the binary keep/mulligan decision treats them identically.
 * This doesn't say the CPU was WRONG to keep (a real replacement heuristic
 * would need full deck knowledge this harness doesn't model) — it flags how
 * often the keep decision was a bare pass, so the win-correlation table can
 * show whether "marginal" keeps actually perform worse than comfortable ones.
 */
function recordMulliganLapse(g: Game, p: Player) {
  const { cheapPlays, units } = handKeepStats(p);
  if (cheapPlays === 2 && units === 1) lapse(g, p.id, 'lapseMulliganKeptMarginal');
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

/** v4.15: true if the opponent has a Guard wall up AND this player's board
 * already has enough attacking ATK that clearing ANY Guard would make
 * lethal reachable this turn — Placement previously had no signal at all
 * for "this removal card would open a lethal line," so a Guard-killing
 * `destroy` sat in hand scored no differently than casting it for its own
 * sake (see castPriority's `guardWallBlocksLethal` bonus below). Mirrors
 * the lethal check `playCombat` already runs (its `lethal` const). */
function guardWallBlocksLethal(g: Game, p: Player): boolean {
  const opp = opponentOf(g, p.id);
  if (!opp.board.some((u) => hasKw(u.def, 'Guard'))) return false;
  const toll = tollReduction(g, opp.id);
  const totalAtk = p.board
    .filter((u) => canAttack(g, u))
    .reduce((s, u) => s + Math.max(0, effAtk(g, u) - toll), 0);
  return totalAtk >= remainingHp(g, opp.leader);
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
  // v4.15: a `destroy` that removes an enemy Unit outright is the only
  // action guaranteed to actually clear a Guard THIS turn (unlike `sap`,
  // which can fail to kill, or `bind`, which only takes effect next turn —
  // and `destroy`'s only legal targets are enemyUnit/allEnemyUnits/
  // anyTarget per catalog.test.ts's TARGETS_BY_ACTION, so no friendly-
  // target guard is needed here) — when casting it would open a lethal
  // attack this turn, it should outrank a generic comboGate card's flat
  // +40 (this is a guaranteed win, not just "free value").
  if (c.def.onCast?.action === 'destroy' && guardWallBlocksLethal(g, p)) {
    v += 50;
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
  // v4.15: a hand with ZERO comboGate/combo cards at all (pure numeric-cost
  // hand) used to fall through to the "Default / matching" branch below by
  // omission, not by design — `straightWantCount > 0` is false, so it never
  // took the straight branch, and the matching branch's mode-cluster/pair
  // logic then ran as if this were a deliberate match-family strategy. Dice
  // *values* only matter here for hitting numeric thresholds, not shape —
  // give this its own explicit branch: keep whatever pays an exact-cost
  // need plus high dice (>=4, useful against `atLeast`/`sum` thresholds),
  // reroll the rest.
  if (straightWantCount === 0 && matchWantCount === 0) {
    p.dice.forEach((d, i) => {
      if (d.placed) return;
      if (stagedNeeds.has(d.value)) return;
      if (keepForExact(d.value)) return;
      if (d.value >= 4) return;
      out.push(i);
    });
    return out;
  }
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
        const waiveFodder =
          SIM_TUNING.echoWaiveAllFodder || rarityTier(c.def.rarity) !== 'low';
        if (!waiveFodder && p.hand.length < 2) continue;
        // v4.7: recasting a LOW-rarity Echo card costs a die AND a real card
        // from hand — the decision table has measured it as a consistent
        // net-negative (-9.4pt this pass) while mid/high-rarity Echo is
        // positive. Only pay a card for a low-rarity recast when hand is
        // flush enough that the fodder is nearly free.
        if (!waiveFodder && rarityTier(c.def.rarity) === 'low' && p.hand.length < 5) continue;
        const sel = bestSelectionFor(g, p, c.def);
        if (!sel) continue;
        // v4.16 harness upgrade: keyword-ability sequencing gap in the task's
        // "sub-optimal keyword-ability sequencing" ask — Echo recasts (step 3)
        // always run before Unit Ability activation (step 4) with no
        // awareness of what's waiting there. Flag whenever this recast is
        // about to spend the LAST unplaced die that could have paid for a
        // higher-value (destroy/bind) Unit Ability sitting on the board —
        // diagnostic only, never changes the pick.
        if (wouldStarveHighValueAbility(g, p, opp, sel)) {
          lapse(g, p.id, 'lapseEchoOverAbilitySequencing');
        }
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
    // v4.10: collect every eligible unit's ability first and activate the
    // highest-value one, instead of the first eligible in raw board order
    // (cast order) — a spare "draw" ability body could burn the turn's one
    // spare die before a "destroy" ability body with a live kill on offer
    // ever got considered. See unitAbilityValue() below and
    // recordPlacementLapses' companion measurement of how often this
    // mattered.
    const abilityCandidates: { u: Inst; dieIdx: number; value: number }[] = [];
    for (const u of p.board) {
      if (!u.def.ability || u.abilityUsed || u.hasAttacked) continue;
      // v4.10: activateAbility() itself also refuses a bound-this-turn Unit
      // or one that entered this turn without Swift — the OLD for-loop-with-
      // break silently tolerated skipping these (a failed activateAbility()
      // call just fell through to the next board-order candidate), but this
      // rewrite only tries its single best-value candidate, so it must
      // pre-filter exactly what activateAbility would reject or it could
      // pick a candidate that's guaranteed to fail and waste the die slot.
      if (u.boundThisTurn || (u.enteredThisTurn && !hasKw(u.def, 'Swift'))) continue;
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
      if (dieIdx < 0) continue;
      abilityCandidates.push({ u, dieIdx, value: unitAbilityValue(eff, opp.board.length) });
    }
    if (abilityCandidates.length > 0) {
      // v4.11 (v4.10 findings §4 item 4): lapseUnitAbilityOrderFixed measured
      // EXACTLY zero across 33,840 games in v4.10 — a working detector with
      // nothing to detect. The open question was whether that's genuinely
      // true for this roster or whether the detector can't see real cases.
      // This companion counter fires whenever the SITUATION even arises (2+
      // eligible Unit Abilities competing for the spare die this step),
      // regardless of whether the board-order pick was already optimal — so
      // "situation never arises" (both counters ~zero) is now distinguishable
      // from "situation arises but order was already right" (this nonzero,
      // the lapse zero). The lapse's own value function has coarse integer
      // tiers (destroy 5 > bind 4 > sap 3 > buff/mend 2 > draw 1), so genuine
      // board-order mistakes only exist when two candidates land in DIFFERENT
      // tiers; measuring the raw frequency tells us which regime we're in.
      if (abilityCandidates.length >= 2) {
        lapse(g, p.id, 'unitAbilityMultiCandidate');
        const distinctValues = new Set(abilityCandidates.map((c) => c.value));
        if (distinctValues.size >= 2) lapse(g, p.id, 'unitAbilityMultiCandidateTiered');
      }
      const best = [...abilityCandidates].sort((a, b) => b.value - a.value)[0];
      if (abilityCandidates[0].u.iid !== best.u.iid) {
        lapse(g, p.id, 'lapseUnitAbilityOrderFixed');
      }
      if (activateAbility(g, best.dieIdx, best.u.iid)) {
        progress = true;
        continue;
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
    if (progress) continue;

    // 6. Fallback: every step above only takes a "worth it" play (holds AoE
    // for a real board, skips pointless mend/draw/sap, etc). Dice are fully
    // re-rolled next turn (see engine.ts startTurn) — nothing carries over —
    // so a die left unplaced here is pure waste, not a deliberate bank for
    // next turn's Twin/Combo timing (that's handled explicitly above via
    // staging/comboGate checks). Measured as the single largest AI
    // inefficiency in the balance sim (17.7 wasted dice/game, -32pt delta
    // when it happens): spend any still-affordable legal cast, favoring the
    // cheapest/least-valuable card so we don't burn a real threat just to
    // avoid banking a die that was going away regardless.
    {
      const fallbackCastable = p.hand
        .filter((c) => !c.def.comboGate && c.def.type !== 'Location' && !hasKw(c.def, 'Twin'))
        .sort((a, b) => costWeight(a.def) - costWeight(b.def));
      let fallbackDone = false;
      for (const c of fallbackCastable) {
        if (g.winner) break;
        const thr = effThreshold(g, p.id, c.def);
        let sel: number[] | null;
        if (c.def.overflow && (c.def.castCostKind ?? 'atLeast') === 'atLeast') {
          const dieIdx = bestDieFor(p, thr);
          sel = dieIdx >= 0 ? [dieIdx] : null;
        } else {
          sel = bestSelectionFor(g, p, c.def);
        }
        if (!sel) continue;
        if (
          castFromHand(
            g,
            sel,
            c.iid,
            c.def.onCast ? autoTarget(g, p.id, c.def.onCast) : undefined,
          )
        ) {
          progress = true;
          fallbackDone = true;
          break;
        }
      }
      if (fallbackDone) continue;
    }
  }
}

/** v4.10: relative value of activating a Unit's Ability, used to pick the
 * best of several eligible units when only one spare die is on offer this
 * turn (see playPlacement's ability-candidate collection above). Mirrors the
 * same rough action-value ordering castPriority already uses for cast
 * priority (removal > disruption > sustain > card advantage) rather than
 * inventing a new scale. `oppBoardSize` breaks the sap tie in favor of
 * effects that actually have a live target this turn. */
function unitAbilityValue(eff: Effect, oppBoardSize: number): number {
  switch (eff.action) {
    case 'destroy':
      return 5;
    case 'bind':
      return 4;
    case 'sap':
      return 3 + (oppBoardSize > 0 ? 0.5 : 0) + (eff.value || 0) * 0.1;
    case 'buff':
    case 'mend':
      return 2;
    case 'draw':
      return 1;
    default:
      return 0;
  }
}

function playCombat(g: Game, p: Player) {
  const opp = opponentOf(g, p.id);
  let guard = 60; // safety valve
  while (!g.winner && guard-- > 0) {
    const attackers = p.board.filter((u) => canAttack(g, u));
    if (attackers.length === 0) break;
    // v4.15: legalTargets() blocks ALL attackers uniformly while any Guard
    // lives (engine.ts:1796-1797, not per-attacker) — so as long as a Guard
    // is up, every attacker here is Guard-only. The old code always sent
    // the single highest-ATK attacker at it regardless, which can badly
    // overkill a low-HP Guard (e.g. a 10 ATK attacker spent on a 3 HP
    // Guard) and waste that ATK instead of saving it for face once the
    // wall comes down. When a Guard is up, prefer the SMALLEST attacker
    // that still kills one — same total board damage, no wasted ATK.
    const guardUpNow = opp.board.some((u) => hasKw(u.def, 'Guard'));
    let att: Inst;
    if (guardUpNow) {
      const guards = opp.board.filter((u) => hasKw(u.def, 'Guard'));
      const sufficient = attackers
        .filter((u) => guards.some((gd) => willKillInCombat(g, gd, effAtk(g, u))))
        .map((u) => ({ u, s: effAtk(g, u) + tieBreak(g) }))
        .sort((a, b) => a.s - b.s);
      att =
        sufficient[0]?.u ??
        attackers.map((u) => ({ u, s: effAtk(g, u) + tieBreak(g) })).sort((a, b) => b.s - a.s)[0]
          .u;
    } else {
      // Score once per attacker (a seeded jitter INSIDE a sort comparator
      // makes the comparator inconsistent) — jittered so near-tied attacker
      // choices vary game to game while staying reproducible under a fixed
      // seed.
      att = attackers
        .map((u) => ({ u, s: effAtk(g, u) + tieBreak(g) }))
        .sort((a, b) => b.s - a.s)[0].u;
    }
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
        // Persona flavor (seeded): aggro personas sometimes push face damage
        // instead of taking an optional trade; control personas will even
        // trade down to clear a real attacker (3+ ATK) when nothing free is
        // on offer. Lethal and bigThreat below are never skipped. (Two rng()
        // calls, same order as before this v4.10 change — anything that
        // touches call count/order here reshuffles every downstream roll for
        // the rest of the seeded game, so this must stay exactly 2 calls.)
        const persona = personaFor(g, p.id);
        const wantsFace = g.rng() < persona.aggression;
        const clearRoll = g.rng() > persona.aggression;
        // v4.10: every one of these was `kills.find(...)` against `kills` in
        // raw `opp.board` order (insertion/cast order) — when 2+ enemy Units
        // BOTH qualified (both die to this attack, both are 5+ ATK, etc.),
        // the AI took whichever was cast first, not the most valuable one.
        // A dedicated CPU-lapse detector (see recordCombatLapses below)
        // measured how often this changed the actual pick. Resolve against
        // value-sorted views instead so a real choice always finds the best
        // candidate among the qualifying set.
        const byValueDesc = [...kills].sort((a, b) => costWeight(b.def) - costWeight(a.def));
        const byAtkDesc = [...kills].sort((a, b) => effAtk(g, b) - effAtk(g, a));
        const safeKill = byValueDesc.find((t) => effAtk(g, t) < remainingHp(g, att));
        // v4.5: was `t.def.threshold ?? 0`, which reads as 0 for any
        // Combo-gate-costed target — a Mythic bomb gated behind Full House
        // registered as cheaper than a threshold-1 Common in this
        // comparison, so the AI would never recognize it as the better
        // kill in an optional trade. costWeight() proxies gate-costed cards
        // off rarity instead so this comparison means the same thing
        // regardless of which of the three cast-cost formats a card uses.
        const valueKill = byValueDesc.find((t) => costWeight(t.def) > costWeight(att.def));
        // Threat check: clear big attackers even with a trade — every persona
        // answers a 5+ ATK unit before doing anything cute.
        const bigThreat = byAtkDesc.find((t) => effAtk(g, t) >= 5);
        const clearKill = clearRoll ? byValueDesc.find((t) => effAtk(g, t) >= 3) : undefined;
        // Free kills (no death-back) are always taken; only the optional
        // trade-with-losses is subject to the face-vs-trade roll.
        target =
          bigThreat ?? safeKill ?? (wantsFace ? undefined : (valueKill ?? clearKill)) ?? opp.leader;

        // Measurement only (never changes the pick above): what the OLD
        // first-match-in-board-order logic would have chosen, for the same
        // rolls. A mismatch is a real lapse this fix closed.
        if (kills.length >= 2) {
          const oldSafeKill = kills.find((t) => effAtk(g, t) < remainingHp(g, att));
          const oldValueKill = kills.find((t) => costWeight(t.def) > costWeight(att.def));
          const oldBigThreat = kills.find((t) => effAtk(g, t) >= 5);
          const oldClearKill = clearRoll ? kills.find((t) => effAtk(g, t) >= 3) : undefined;
          const oldTarget =
            oldBigThreat ??
            oldSafeKill ??
            (wantsFace ? undefined : (oldValueKill ?? oldClearKill)) ??
            opp.leader;
          if (oldTarget !== target) lapse(g, p.id, 'lapseCombatTradeTargetFixed');
        }
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
  recordRerollLapse(g, p);
  // v4.15: snapshot BEFORE Placement whether a Guard-clear-into-lethal line
  // existed this turn (see castPriority's `guardWallBlocksLethal` bonus) —
  // a decision-correlation companion to the fix, not a "would the old code
  // have done differently" detector like lapseCombatTradeTargetFixed. Logs
  // `guardClearLethalOpportunity` whenever the condition held, and
  // `guardClearLethalConverted` if this player's turn actually ended in a
  // win — gives the harness a real activation-rate read on how often this
  // matters and whether the boosted priority is actually closing it out.
  const guardLethalOpportunity = guardWallBlocksLethal(g, p);
  if (guardLethalOpportunity) lapse(g, p.id, 'guardClearLethalOpportunity');

  playPlacement(g, p);
  if (g.winner) return;
  recordPlacementLapses(g, p);
  recordDiceSpentDownLapse(g, p);
  comboCheck(g);
  if (g.winner) return;
  playCombat(g, p);
  if (guardLethalOpportunity && g.winner === p.id) {
    lapse(g, p.id, 'guardClearLethalConverted');
  }
  if (g.winner) return;
  recordCombatLapses(g, p);
  recordUnusedResourceLapse(g, p);
  endTurn(g, defaultDiscardChoice);
}

/**
 * v4.8 instrumentation: detect CPU reasoning lapses — recorded into
 * g.stats.decisions so the harness gets a win-correlation on them for free.
 * Placement lapses are measured at the END of the Placement Phase (before
 * Combo Check), because that's the last moment the flagged actions were
 * still legal — a first version measured after combat and mis-flagged every
 * Mend hold as a lapse the moment retaliation damage appeared, damage that
 * did not exist while the ability window was open. These flag turns where
 * the heuristics demonstrably left value on the table:
 *  - lapseWastedCastableDie: an unplaced die that could legally pay for a
 *    non-gated card in hand the AI had no documented reason to hold.
 *  - lapseIdleLeaderAbility: the Leader's every-turn Ability went unused
 *    while a qualifying die was about to be pitched.
 * These are diagnostics, not gameplay — they must never mutate state.
 *
 * v4.10: v4.9's findings (§2.3) measured all of the above at ZERO across a
 * full pass and concluded the detector set had hit a floor — "any further
 * AI-quality work needs a new class of detector... not just 'did it act'."
 * Two new detectors below are exactly that new class — SUB-OPTIMAL TARGET/
 * ORDER CHOICE within an action the AI was already going to take, not
 * whether it acted at all:
 *  - lapseCombatTradeTargetFixed (in playCombat): a combat trade with 2+
 *    legal kill targets used to resolve via `kills.find(...)` in raw board
 *    order (whichever enemy Unit was cast first), not the most valuable
 *    qualifying one. Now fixed to always resolve against a value-sorted
 *    view; this counter fires whenever that fix actually changed the pick
 *    for the SAME dice/persona rolls, i.e. it's a direct measurement of how
 *    often the old code was wrong, not just how often the situation arose.
 *  - lapseUnitAbilityOrderFixed (in playPlacement): with 2+ eligible Unit
 *    Abilities competing for one spare die, the AI used to activate
 *    whichever Unit came first in board order, not the highest-value action
 *    (see unitAbilityValue). Now fixed to always pick the best; this counter
 *    fires whenever that changed which Unit got the die.
 */
function lapse(g: Game, pid: string, key: string) {
  const d = (g.stats.decisions[pid] ||= {});
  d[key] = (d[key] || 0) + 1;
}

/** v4.16: true if consuming `sel` (the dice indices about to pay for an Echo
 * recast) would leave no unplaced die able to pay for a HIGHER-value Unit
 * Ability (destroy with a live target, or bind) that's still eligible to
 * activate this turn — see playPlacement step 3's call site. Mirrors the
 * eligibility filters playPlacement's own ability-candidate collection (step
 * 4) applies, without duplicating its scoring/selection logic. */
function wouldStarveHighValueAbility(
  g: Game,
  p: Player,
  opp: Player,
  sel: number[],
): boolean {
  const selSet = new Set(sel);
  const remaining = p.dice
    .map((d, i) => ({ d, i }))
    .filter(({ d, i }) => !d.placed && !selSet.has(i));
  const maxRemaining = remaining.length > 0 ? Math.max(...remaining.map((r) => r.d.value)) : -1;
  for (const u of p.board) {
    if (!u.def.ability || u.abilityUsed || u.hasAttacked) continue;
    if (u.boundThisTurn || (u.enteredThisTurn && !hasKw(u.def, 'Swift'))) continue;
    const eff = u.def.ability.effect;
    const highValue =
      (eff.action === 'destroy' && opp.board.length > 0) || eff.action === 'bind';
    if (!highValue) continue;
    const thr = effAbilityThreshold(g, u);
    // Would this same die selection have paid for the ability, and will
    // nothing else be left unplaced that could pay for it instead?
    const selCouldPay = sel.some((i) => p.dice[i].value >= thr);
    if (selCouldPay && maxRemaining < thr) return true;
  }
  return false;
}

/**
 * v4.16 harness upgrade: "bad reroll choices beyond what's covered" — none of
 * the existing lapse detectors look at the Reroll Phase at all. This flags
 * games where, once rerolls are fully exhausted (or voluntarily ended), a
 * "dead" low die (<=2, matching no exact-cost need, no staged Twin need, and
 * not part of the hand's combo-gate family) is still sitting unplaced —
 * i.e., the reroll allowance ran out before the hand's actual dice needs
 * were met. Diagnostic only; rerollsAllowed is a hard rule-level cap so this
 * doesn't imply the CPU chose wrong, only how often the constraint bites.
 */
function recordRerollLapse(g: Game, p: Player) {
  const gates = [...p.hand, ...p.staging].flatMap((c) => {
    const out: string[] = [];
    if (c.def.comboGate) out.push(c.def.comboGate);
    if (c.def.combo) out.push(c.def.combo.pattern);
    return out;
  });
  if (gates.length > 0) return; // combo-family hands have their own dice logic
  const stagedNeeds = new Set(
    p.staging.map((s) => s.stagedDie).filter((v): v is number => v !== undefined),
  );
  const exactNeeds = new Set(
    p.hand
      .filter((c) => c.def.castCostKind === 'exact' && c.def.threshold !== undefined)
      .map((c) => effThreshold(g, p.id, c.def)),
  );
  const deadLowDie = p.dice.some(
    (d) => !d.placed && d.value <= 2 && !stagedNeeds.has(d.value) && !exactNeeds.has(d.value),
  );
  if (deadLowDie) lapse(g, p.id, 'lapseRerollDeadLowDie');
}

/**
 * v4.16 harness upgrade: "wasted resources/mana-like resource left unused" —
 * a raw per-turn flag for "at least one die was never placed at all by the
 * time the turn ended," independent of `lapseWastedCastableDie` (which only
 * fires when a SPECIFIC card in hand could legally have used it). This is
 * the broader resource-utilization signal the task calls out separately.
 */
function recordUnusedResourceLapse(g: Game, p: Player) {
  if (p.dice.some((d) => !d.placed)) lapse(g, p.id, 'lapseUnusedDiceAtEndTurn');
}

function recordPlacementLapses(g: Game, p: Player) {
  const opp = opponentOf(g, p.id);
  const unplaced = p.dice.filter((d) => !d.placed).map((d) => d.value);
  if (unplaced.length > 0) {
    const maxDie = Math.max(...unplaced);
    const castable = p.hand.some((c) => {
      if (c.def.type === 'Location' || c.def.comboGate || c.def.threshold === undefined)
        return false;
      const thr = effThreshold(g, p.id, c.def);
      const payable =
        c.def.castCostKind === 'exact'
          ? unplaced.includes(thr)
          : c.def.castCostKind === 'sum'
            ? unplaced.reduce((a, b) => a + b, 0) >= thr
            : maxDie >= thr;
      if (!payable) return false;
      // Mirror playPlacement's deliberate holds — those aren't lapses.
      const eff = c.def.onCast;
      if (eff?.target === 'allEnemyUnits' && opp.board.length < 2) return false;
      if (
        (eff?.action === 'sap' || eff?.action === 'destroy' || eff?.action === 'bind') &&
        eff?.target !== 'enemyLeader' &&
        eff?.target !== 'anyTarget' &&
        opp.board.length === 0
      )
        return false;
      if (
        eff?.action === 'mend' &&
        p.leader.damage === 0 &&
        !p.board.some((u) => u.damage > 0)
      )
        return false;
      if (hasKw(c.def, 'Twin')) return false; // deliberate staging economy
      return true;
    });
    if (castable) lapse(g, p.id, 'lapseWastedCastableDie');
    const ab = p.leader.def.ability;
    if (ab && !p.leader.abilityUsed) {
      const eff = ab.effect;
      const pointless =
        (eff.action === 'mend' && p.leader.damage === 0 && !p.board.some((u) => u.damage > 0)) ||
        ((eff.action === 'bind' || (eff.action === 'sap' && eff.target === 'enemyUnit')) &&
          opp.board.length === 0) ||
        (eff.action === 'draw' && p.hand.length >= 8);
      if (!pointless && maxDie >= effAbilityThreshold(g, p.leader)) {
        // v4.9: split the single lapseIdleLeaderAbility counter by WHY the
        // die never got spent — v4.8 findings §4 item 3 asked for this
        // before acting further. 'refusalNoTarget' is a legal refusal (an
        // abilityNoRepeatTarget Ability with no legal alternate target this
        // turn — see engine.ts activateAbility) and isn't a heuristic bug;
        // 'genuine' is everything else left over, the real actionable slice.
        const isRefusal =
          !!p.leader.def.abilityNoRepeatTarget &&
          !autoTarget(g, p.id, eff, p.leader.lastAbilityTargetIid);
        lapse(g, p.id, isRefusal ? 'lapseIdleLeaderAbility_refusalNoTarget' : 'lapseIdleLeaderAbility_genuine');
      }
    }
  }
}

/**
 * v4.9: a die that could have paid for the Leader Ability existed SOMEWHERE
 * in this turn's roll (placed or not) but is no longer available unplaced by
 * the time Placement ends, and the Ability still went unused — i.e. a
 * higher-priority cast consumed it. Measured separately from
 * recordPlacementLapses (which only sees currently-unplaced dice) because it
 * needs the ability's threshold checked against every die rolled this turn,
 * not just the survivors — see v4.8 findings §4 item 3's "dice spent down"
 * half of the open question.
 */
function recordDiceSpentDownLapse(g: Game, p: Player) {
  const ab = p.leader.def.ability;
  if (!ab || p.leader.abilityUsed) return;
  const opp = opponentOf(g, p.id);
  const eff = ab.effect;
  const pointless =
    (eff.action === 'mend' && p.leader.damage === 0 && !p.board.some((u) => u.damage > 0)) ||
    ((eff.action === 'bind' || (eff.action === 'sap' && eff.target === 'enemyUnit')) &&
      opp.board.length === 0) ||
    (eff.action === 'draw' && p.hand.length >= 8);
  if (pointless) return;
  const thr = effAbilityThreshold(g, p.leader);
  const hadQualifyingDie = p.dice.some((d) => d.value >= thr);
  const stillHasUnplacedQualifying = p.dice.some((d) => !d.placed && d.value >= thr);
  if (hadQualifyingDie && !stillHasUnplacedQualifying) {
    lapse(g, p.id, 'lapseIdleLeaderAbility_diceSpentDown');
  }
}

/** lapseMissedLethal: unspent attackers whose combined (Toll-adjusted) ATK
 * was face-lethal with no Guard wall up, yet the game didn't end — measured
 * after the AI's combat step, when attacking was still legal. */
function recordCombatLapses(g: Game, p: Player) {
  const opp = opponentOf(g, p.id);
  const guardsUp = opp.board.some((u) => hasKw(u.def, 'Guard'));
  if (!guardsUp && p.turnsTaken > 1) {
    const toll = tollReduction(g, opp.id);
    const avail = p.board
      .filter((u) => canAttack(g, u))
      .reduce((s, u) => s + Math.max(0, effAtk(g, u) - toll), 0);
    if (avail >= remainingHp(g, opp.leader)) lapse(g, p.id, 'lapseMissedLethal');
  }
}
