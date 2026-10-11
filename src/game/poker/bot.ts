/**
 * CPU seats for FryCards Poker (Design Spec v0.1, "Bots").
 *
 * A bot only ever receives its own seat's view (view.ts) — it never sees
 * hidden information. Its persona (bluff rate, tightness, power use) is data
 * derived from its Leader's colours; difficulty is decision quality (`skill`),
 * not extra information.
 *
 * Betting: Monte Carlo equity against the live opponents (with any cards a
 * power revealed fixed), compared to pot odds, nudged by tightness, with a
 * persona-driven bluff rate.
 * Casting: a power is cast when its estimated gain, in big blinds, beats its
 * cost plus BOT.castMargin. Targets are picked by threat (the chip leader, the
 * last aggressor). Bots never coordinate, and the one-hostile-power-per-seat
 * cap applies to them like anyone.
 */
import type { CardDef } from './cards';
import { BOT, MAX_EXCLUSIONS, MODES, UNIT } from './constants';
import {
  betOptions,
  canCast,
  canUseLeader,
  castCost,
  castTargets,
  choiceOptions,
  effectiveEffect,
  excludableCategories,
  inHand,
  legalTargets,
  leaderPseudoDef,
  needsOpponentTarget,
  potTotal,
  type Action,
  type ExtraCost,
  type Match,
} from './engine';
import { equity, evaluate, preflopStrength, type Card } from './evaluator';
import { KEYWORD_SPECS } from './keywords';
import { mulberry32, type Rng } from './rng';
import { isHidden } from './view';

export function botRng(seed: number): Rng {
  const next = mulberry32(seed);
  return { next, int: (n: number) => Math.floor(next() * n) };
}

interface Read {
  equity: number;
  opponents: number;
  potBB: number;
  stackBB: number;
  /** Seats still to act after this one on this street (position). */
  behind: number;
  /** Rough hands left before the match clock's cap (Infinity early on). */
  handsToCap: number;
  /** This seat's rank by stack among the live seats (0 = chip leader). */
  stackRank: number;
  alive: number;
  /** A flush or open-ended straight draw with cards still to come. */
  draw: boolean;
  /** Facing an all-in (calling would end the betting for this seat). */
  facingAllIn: boolean;
}

/**
 * How hyper-aggressive a seat has been this match, 0..1, from the public
 * tally of its bets and raises (`Match.aggro`). The raise share is shrunk
 * toward a typical 20% until there are enough actions to trust it; a seat
 * raising half its decisions (shove-or-fold, betting every checked street)
 * reads 1. Bots raise 0–30% of the time.
 */
export function maniac(v: Match, i: number | null): number {
  if (i === null) return 0;
  const a = v.aggro?.[i];
  if (!a) return 0;
  const share = (a.raises + 0.2 * 8) / (a.actions + 8);
  return Math.max(0, Math.min(1, (share - 0.28) / 0.17));
}

/** Seats that still act after `seat` on this street, in betting order. */
function seatsBehind(v: Match, seat: number): number {
  const h = v.hand!;
  const n = v.seats.length;
  const reverse = h.rule.id === 'reverseOrder';
  // The last seat to act post-flop is the button (Reverse Order: the seat
  // after it); pre-flop it is the big blind (or the straddler).
  const last =
    h.street === 'preflop'
      ? (h.straddler ?? h.bbSeat ?? h.button)
      : reverse
        ? (h.button + 1) % n
        : h.button;
  const dir = reverse ? -1 : 1;
  let count = 0;
  for (let k = 1; k < n; k++) {
    const i = (((seat + dir * k) % n) + n) % n;
    if (i !== seat && inHand(h, i) && v.seats[i].stack > 0) count++;
    if (i === last) break;
  }
  if (seat === last) return 0;
  return count;
}

/** Flush draw (four to a flush using a hole card) or open-ended straight
 * draw, with at least one card to come. */
function hasDraw(hole: Card[], board: Card[], boardSize: number): boolean {
  if (board.length < 3 || board.length >= boardSize || hole.length < 2) return false;
  const cards = [...hole, ...board];
  for (let s = 0; s < 4; s++) {
    if (cards.filter((c) => c.s === s).length === 4 && hole.some((c) => c.s === s)) return true;
  }
  const ranks = new Set(cards.map((c) => c.r));
  if (ranks.has(14)) ranks.add(1);
  for (let lo = 2; lo <= 10; lo++) {
    const run = [lo, lo + 1, lo + 2, lo + 3];
    if (run.every((r) => ranks.has(r)) && !ranks.has(lo - 1) && !ranks.has(lo + 4)) {
      if (hole.some((c) => run.includes(c.r))) return true;
    }
  }
  return false;
}

function visibleBoard(v: Match): Card[] {
  return v.hand!.board.filter((c) => !isHidden(c));
}

function boardSize(v: Match): number {
  return v.hand!.rule.id === 'shortBoard' ? 4 : 5;
}

/** Equity from this seat's view only. */
/** Opponents a bot expects to actually contest the pot. After the flop that
 * is everyone still in. Before it, most seats yet to act will fold, so it is
 * the seats that already have chips in (blinds, limpers, raisers) — at least
 * one. Pricing a call against five random hands that will mostly fold made
 * every bot fold everything outside the blinds. */
export function contestants(v: Match, seat: number): number[] {
  const h = v.hand!;
  const live = h.dealtIn.map((_, i) => i).filter((i) => i !== seat && inHand(h, i));
  if (h.street !== 'preflop') return live;
  const inPot = live.filter((i) => h.streetBet[i] > 0 || h.committed[i] > 0);
  return inPot.length > 0 ? inPot : live.slice(0, 1);
}

export function estimateEquity(
  v: Match,
  seat: number,
  rng: Rng,
  trials = BOT.equityTrials,
  /** Only the seats expected to contest the pot (bots); default: all live. */
  against?: number[],
  /** Hand reading: per-seat range floors (see `rangeFloors`). */
  floors?: Map<number, number>,
): number {
  const h = v.hand!;
  const hole = h.holes[seat].filter((c) => !isHidden(c));
  const board = visibleBoard(v);
  const opps: Card[][] = [];
  const oppFloors: number[] = [];
  for (let i = 0; i < h.holes.length; i++) {
    if (i === seat || !inHand(h, i)) continue;
    if (against && !against.includes(i)) continue;
    opps.push(h.holes[i].filter((c) => !isHidden(c)).slice(0, 2));
    oppFloors.push(floors?.get(i) ?? 0);
  }
  if (hole.length < 2) {
    // A blinded hole card: estimate from what we can see.
    return board.length === 0 ? preflopStrength(hole.concat(hole)) * 0.8 : 0.35;
  }
  const best2 = hole.length > 2 ? bestTwo(hole, board) : hole;
  return equity({
    hole: best2,
    board,
    boardSize: boardSize(v),
    opponents: opps,
    dead: hole.length > 2 ? hole.filter((c) => !best2.includes(c)) : [],
    trials: board.length === 0 ? Math.round(trials * 0.6) : trials,
    rng,
    floors: oppFloors,
    bluffMix: BOT.bluffMix,
  });
}

function bestTwo(hole: Card[], board: Card[]): Card[] {
  let best: Card[] = hole.slice(0, 2);
  let bestScore = -1;
  for (let a = 0; a < hole.length; a++)
    for (let b = a + 1; b < hole.length; b++) {
      const pair = [hole[a], hole[b]];
      const score =
        board.length >= 3 ? evaluate([...pair, ...board]).score : preflopStrength(pair) * 1e7;
      if (score > bestScore) {
        bestScore = score;
        best = pair;
      }
    }
  return best;
}

/**
 * Hand reading: for each opponent, the weakest holding (handStrength on the
 * visible board) their betting this hand is consistent with — a raise
 * before the flop, a big bet now, or calls along the way each narrow it.
 * Only public betting is used. How much a bot reads scales with skill: a
 * naive bot prices every bet against any two cards and pays it off.
 */
export function rangeFloors(v: Match, seat: number): Map<number, number> {
  const h = v.hand!;
  const p = v.seats[seat].persona;
  const reading = BOT.readDepth * Math.max(0, Math.min(1, (p.skill - 0.3) / 0.6));
  const out = new Map<number, number>();
  if (reading <= 0) return out;
  const pot = potTotal(h);
  for (let i = 0; i < h.holes.length; i++) {
    if (i === seat || !inHand(h, i)) continue;
    const put = h.committed[i];
    const blind = i === h.bbSeat ? h.bb : i === h.sbSeat ? h.bb / 2 : 0;
    let f = 0;
    if (h.street === 'preflop') {
      if (h.aggressorByStreet[0] === i) f = 0.3 + 0.3 * Math.min(1, h.currentBet / (4 * h.bb));
      else if (put > blind && h.currentBet > h.bb) f = 0.3;
      else if (put > blind) f = 0.1;
    } else {
      // Raised before the flop, or put money in on an earlier street.
      if (h.aggressorByStreet.some((a) => a === i)) f = 0.25;
      else if (h.committed[i] - h.streetBet[i] > blind) f = 0.15;
      // Betting this street: the bigger the bet against the pot, the
      // stronger. A lone bet into a checked street (a stab) is read weaker
      // than a raise: anyone can fire at a check.
      if (h.lastAggressor === i && h.streetBet[i] > 0) {
        const size = h.streetBet[i] / Math.max(1, pot - h.streetBet[i]);
        const raised = h.dealtIn.some(
          (_, j) =>
            j !== i && inHand(h, j) && h.streetBet[j] > 0 && h.streetBet[j] < h.streetBet[i],
        );
        f = Math.max(f, (raised ? 0.3 : 0.2) + (raised ? 0.3 : 0.2) * Math.min(1, size));
      }
    }
    // A maniac's bets say less about its hand.
    if (f > 0) out.set(i, f * reading * (1 - 0.6 * maniac(v, i)));
  }
  return out;
}

function read(v: Match, seat: number, rng: Rng): Read {
  const h = v.hand!;
  const against = contestants(v, seat);
  const opponents = against.length;
  const p = v.seats[seat].persona;
  let eq = estimateEquity(v, seat, rng, BOT.equityTrials, against, rangeFloors(v, seat));
  // Low skill misjudges its hand.
  eq = Math.max(0, Math.min(1, eq + (rng.next() - 0.5) * (1 - p.skill) * 0.45));
  const mode = MODES[v.mode];
  const perHand = v.handNo > 1 ? v.clockMs / (v.handNo - 1) : 40_000;
  const handsToCap = v.handNo > 1 ? (mode.capMs - v.clockMs) / Math.max(1, perHand) : Infinity;
  const live = v.seats.filter((s) => !s.busted);
  const stackRank = live.filter((s) => s.stack > v.seats[seat].stack).length;
  const hole = h.holes[seat].filter((c) => !isHidden(c));
  const owe = h.currentBet - h.streetBet[seat];
  const facingAllIn =
    owe > 0 &&
    h.lastAggressor !== null &&
    h.lastAggressor !== seat &&
    v.seats[h.lastAggressor].stack === 0;
  return {
    equity: eq,
    opponents,
    potBB: potTotal(h) / h.bb,
    stackBB: v.seats[seat].stack / h.bb,
    behind: seatsBehind(v, seat),
    handsToCap,
    stackRank,
    alive: live.length,
    draw: hasDraw(hole, visibleBoard(v), boardSize(v)),
    facingAllIn,
  };
}

// ---------------------------------------------------------------------------
// Powers
// ---------------------------------------------------------------------------
function threatTarget(v: Match, seat: number, options: number[]): number {
  const h = v.hand!;
  return [...options].sort((a, b) => {
    const agg = (x: number) => (h.lastAggressor === x ? 1 : 0);
    return agg(b) - agg(a) || v.seats[b].stack - v.seats[a].stack;
  })[0];
}

/** Estimated gain of a power for this seat right now, in big blinds. */
function powerValue(v: Match, seat: number, def: CardDef, r: Read): number {
  const h = v.hand!;
  const eff = effectiveEffect(h, def);
  if (!eff) return 0;
  const n = eff.n ?? 1;
  const nBB = (n * UNIT) / h.bb;
  const pre = h.street === 'preflop';
  const losing = Math.max(0, 0.5 - r.equity);
  switch (eff.kw) {
    case 'Peek':
    case 'Mark':
    case 'Reveal':
      // Information is worth more in a bigger pot, but not without limit: a
      // flat share of the pot made a cheap read fire every hand late on.
      return 0.15 * Math.min(r.potBB, 12) + 0.3;
    case 'Kindle':
      // The drained chips go into a pot this seat wins only `equity` of the
      // time (the old `0.4 + equity` paid chips into pots it then lost);
      // plus a little for the nerve hit.
      return nBB * r.equity + 0.2;
    case 'Erode':
      return nBB;
    case 'Tax':
      return nBB * Math.min(3, r.opponents) * r.equity;
    case 'Siphon':
      // Taking N out of a pot you would win `equity` of the time.
      return Math.min(nBB, r.potBB) * (1 - r.equity);
    case 'Blessed':
      return Math.min(nBB, h.powerPaid[seat] / h.bb) * (1 - r.equity * 0.5);
    case 'Bulwark':
      return nBB * (r.equity < 0.6 ? 0.5 : 0.1);
    case 'Insurance':
      // Pays only when this seat loses a showdown all-in: worthless unless
      // the stack is already (or about to be) in the pot.
      return r.stackBB <= r.potBB || r.facingAllIn ? nBB * (1 - r.equity) * 0.8 : 0;
    case 'Redraw':
    case 'Windfall':
    case 'Exhume':
      return pre ? losing * 2 : losing * r.potBB * 0.6;
    case 'Wild':
    case 'Bloom': {
      // Unlike a redraw these change a card in place, so they only help
      // when the change itself makes a better hand (Wild: a flush or a
      // flush draw; Bloom: a higher category). Otherwise nerve is wasted.
      // Bloom grows on the next street: nothing to grow into on the river.
      if (eff.kw === 'Bloom' && h.street === 'river') return 0;
      const gain = inPlaceGain(v, seat, eff.kw);
      if (gain <= 0) return 0;
      return pre ? 0.3 : (losing + 0.15 * gain) * r.potBB * 0.6;
    }
    case 'Foresee':
      return pre ? 0.2 : 0.5;
    case 'Venomous':
    case 'Bounty':
      return nBB * 0.3;
    case 'Needle':
      return 0.4;
    case 'Lock':
    case 'Entropic':
    case 'Decoy':
      return 0.6;
    case 'Toll':
      return nBB * 0.3;
    case 'Straddle':
      return r.equity > 0.55 ? 1 : 0;
    case 'Rerun':
      // Chip-neutral, but a second board halves the chance of busting when
      // behind with the stack at risk — worth it in a freezeout.
      return r.equity < 0.5 && (r.stackBB < 10 || r.potBB >= r.stackBB * 0.5) ? 1 : 0.1;
    case 'Burn':
    case 'Cut':
      return !pre && r.equity < 0.4 ? 0.3 * r.potBB : 0;
    case 'Pass':
      return !pre && r.equity < 0.3 ? 0.4 * r.potBB : 0;
    case 'Call Out':
      return castTargets(v, seat, def).some((c) => c.mods.some((x) => x.kw === 'Feint')) ? 1.2 : 0;
    case 'Snuff':
      return 0;
    case 'Overbet':
      // Worth it only with a strong hand and chips behind to bet past the pot.
      return !pre && r.equity > 0.7 && r.stackBB > r.potBB
        ? n * Math.min(r.potBB, r.stackBB - r.potBB) * (r.equity - 0.5)
        : 0;
    case 'Tell':
      return 0.1 * Math.min(r.potBB, 12) + 0.1;
    default:
      return 0.2;
  }
}

/** How much a Wild or a Bloom would lift this seat's hand: the expected gain
 * in hand category or flush progress over the random card it lands on, 0
 * when it does nothing. */
function inPlaceGain(v: Match, seat: number, kw: 'Wild' | 'Bloom'): number {
  const h = v.hand!;
  const hole = h.holes[seat].filter((c) => !isHidden(c));
  const board = visibleBoard(v);
  if (hole.length === 0 || board.length < 3) return 0;
  const cat = (cards: Card[]) => evaluate(cards).category;
  const now = cat([...hole, ...board]);
  if (kw === 'Bloom') {
    // The card is random: the average gain over the cards that can rise.
    const can = hole.filter((c) => c.r < 14);
    if (!can.length) return 0;
    let sum = 0;
    for (const pick of can) {
      const up = hole.map((c) => (c === pick ? { ...c, r: c.r + 1 } : c));
      sum += Math.max(0, cat([...up, ...board]) - now);
    }
    return sum / can.length;
  }
  // Wild lands on a random hole card: average, over the cards it could
  // land on, the category gain (a flush made) or, with cards still to come,
  // a four-flush that wasn't there.
  const can = hole.filter((c) => !c.wild);
  if (!can.length) return 0;
  const flushDraw = (cards: Card[]) => {
    const wilds = cards.filter((c) => c.wild).length;
    return (
      Math.max(...[0, 1, 2, 3].map((s) => cards.filter((c) => !c.wild && c.s === s).length)) + wilds
    );
  };
  let sum = 0;
  for (const pick of can) {
    const up = hole.map((c) => (c === pick ? { ...c, wild: true } : c));
    const made = Math.max(0, cat([...up, ...board]) - now);
    const draw =
      board.length < 5 &&
      now < 5 &&
      flushDraw([...up, ...board]) >= 4 &&
      flushDraw([...hole, ...board]) < 4
        ? 1
        : 0;
    sum += Math.max(made, draw);
  }
  return sum / can.length;
}

/** Does this seat already hold a full house or better? */
function boatMade(v: Match, seat: number): boolean {
  const hole = v.hand!.holes[seat].filter((c) => !isHidden(c));
  const board = visibleBoard(v);
  return hole.length + board.length >= 5 && evaluate([...hole, ...board]).category >= 6;
}

/** A hole card already blinded. The seat's own view shows it as a hidden
 * placeholder without the `blinded` flag, so check both. */
const isBlinded = (c: Card & { blinded?: boolean }) => !!c.blinded || isHidden(c);

function chooseExtraCosts(v: Match, seat: number, uid: string, count: number): ExtraCost[] | null {
  const h = v.hand!;
  const out: ExtraCost[] = [];
  const hand = v.seats[seat].hand
    .filter((p) => p.uid !== uid)
    .sort((a, b) => (a.def.tier ?? 0) - (b.def.tier ?? 0));
  const excl = excludableCategories(v, seat);
  // Bluffers love exclusions (they bite only at showdown); flushes are the
  // cheapest category to give up for an unsuited hand.
  const room = Math.max(0, MAX_EXCLUSIONS - h.exclusions[seat].length);
  // Never give up the category this seat already holds (or anything above
  // it); among the rest, the least likely to come in goes first.
  const hole = h.holes[seat].filter((c) => !isHidden(c));
  const board = visibleBoard(v);
  const made = hole.length + board.length >= 5 ? evaluate([...hole, ...board]).category : -1;
  // Categories below the made hand are free to give up; above it, the
  // rarest go first; the made category itself never.
  const free = [1, 2, 3, 4, 5].filter((c) => excl.includes(c) && made >= 0 && c < made);
  const risky = [5, 4, 3, 2, 1].filter((c) => excl.includes(c) && (made < 0 || c > made));
  const prefer = [...free, ...risky].slice(0, room);
  let shedIdx = 0;
  let debuff = 0;
  while (out.length < count) {
    if (prefer.length) out.push({ kind: 'exclude', category: prefer.shift()! });
    else if (shedIdx < hand.length) out.push({ kind: 'shed', uid: hand[shedIdx++].uid });
    else {
      while (debuff < h.holes[seat].length && isBlinded(h.holes[seat][debuff])) debuff++;
      if (debuff >= h.holes[seat].length) return null;
      out.push({ kind: 'debuff', hole: debuff++ });
    }
  }
  return out;
}

function tryCast(v: Match, seat: number, r: Read, rng: Rng, inWindow: boolean): Action | null {
  const h = v.hand!;
  const s = v.seats[seat];
  const p = s.persona;
  let best: { action: Action; score: number } | null = null;
  for (const inst of s.hand) {
    const check = canCast(v, seat, inst.uid);
    if (!check.ok) continue;
    const def = inst.def;
    const eff = effectiveEffect(h, def);
    if (!eff) continue;
    const cost = castCost(v, seat, def);
    let value = powerValue(v, seat, def, r);
    if (inWindow && eff.kw === 'Snuff') {
      const target = castTargets(v, seat, def)[0];
      if (!target) continue;
      const hostileToMe = target.target === seat && KEYWORD_SPECS[target.effect.kw].hostile;
      value = hostileToMe ? 1.5 : (target.chipsPaid / h.bb) * 0.8;
    }
    // Boat Bonus: paid when this seat wins holding a full house or better.
    const boat = def.mods?.find((x) => x.kw === 'Boat Bonus');
    if (boat && boatMade(v, seat))
      value += (((boat.n ?? 1) * UNIT) / h.bb) * Math.min(3, r.opponents) * r.equity;
    // Bluff-casting: a persona-rate cast regardless of value.
    if (!inWindow && rng.next() < p.bluff * 0.25) value += 0.8;
    const costBB = (cost.chips + cost.gambitOwed * (1 - r.equity)) / h.bb + cost.extra * 0.6;
    const score = value * (0.6 + p.powerUse) - costBB - BOT.castMargin;
    if (score <= 0) continue;
    let target: number | null = null;
    if (needsOpponentTarget(h, def)) {
      const opts = legalTargets(v, seat, def);
      if (!opts.length) continue;
      target = threatTarget(v, seat, opts);
    }
    const targetCast = castTargets(v, seat, def).slice(-1)[0]?.id ?? null;
    const costs = cost.extra > 0 ? chooseExtraCosts(v, seat, inst.uid, cost.extra) : [];
    if (costs === null) continue;
    const feint =
      def.mods?.some((m) => m.kw === 'Feint') && value < 0.5 && rng.next() < p.bluff * 2;
    const action: Action = { type: 'cast', seat, uid: inst.uid, target, targetCast, costs, feint };
    if (!best || score > best.score) best = { action, score };
  }
  return best?.action ?? null;
}

function tryLeader(v: Match, seat: number, r: Read, rng: Rng): Action | null {
  const s = v.seats[seat];
  const abilities = s.leader.abilities ?? [];
  for (let i = 0; i < abilities.length; i++) {
    if (!canUseLeader(v, seat, i).ok) continue;
    const ab = abilities[i];
    const pseudo = leaderPseudoDef(s.leader, i);
    const value = powerValue(v, seat, pseudo, r);
    // Spend nerve when the ability is clearly worth it and enough is left
    // to stay off tilt (a big pot can justify going lower). Build nerve only
    // when the ability is worth its chips, or nerve is nearly gone.
    const chipBB = ((ab.chipCost ?? 0) * UNIT) / v.hand!.bb;
    const want =
      ab.nerve < 0
        ? value >= 1.2 && (s.nerve >= -ab.nerve + 2 || (r.potBB >= 6 && s.nerve >= -ab.nerve + 1))
        : s.nerve <= 4 && (value >= chipBB || s.nerve <= 1) && rng.next() < 0.6;
    if (!want) continue;
    let target: number | null = null;
    if (KEYWORD_SPECS[ab.effect.kw].target === 'opponent') {
      const opts = legalTargets(v, seat, pseudo);
      if (!opts.length) continue;
      target = threatTarget(v, seat, opts);
    }
    return { type: 'leader', seat, ability: i, target };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Choices
// ---------------------------------------------------------------------------
function chooseCard(v: Match, seat: number): number {
  const h = v.hand!;
  const p = h.pending;
  const hole = h.holes[seat];
  const board = visibleBoard(v);
  const opts = choiceOptions(v);
  if (p?.kind !== 'choice' || opts.length === 0) return 0;
  const scoreWithout = (k: number) => {
    const rest = hole.filter((_, i) => i !== k && !isHidden(hole[i]));
    if (board.length >= 3 && rest.length + board.length >= 5)
      return evaluate([...rest, ...board]).score;
    return preflopStrength(rest.slice(0, 2)) * 1e7;
  };
  switch (p.choice) {
    case 'windfall':
    case 'pineapple':
      // Discard the card whose loss hurts least.
      return opts.reduce((a, b) => (scoreWithout(b) > scoreWithout(a) ? b : a), opts[0]);
    case 'redraw':
    case 'exhume':
      // Replace the card contributing least.
      return opts.reduce((a, b) => (scoreWithout(b) > scoreWithout(a) ? b : a), opts[0]);
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Betting
// ---------------------------------------------------------------------------
function betDecision(v: Match, seat: number, r: Read, rng: Rng): Action {
  const h = v.hand!;
  const o = betOptions(v, seat)!;
  const p = v.seats[seat].persona;
  const pot = potTotal(h);
  const potOdds = o.callAmount / Math.max(1, pot + o.callAmount);
  // Fair share of the pot against the seats contesting it, nudged by tightness.
  const fair = 1 / (r.opponents + 1);
  let tight = (p.tightness - 0.5) * 0.2;
  // A blind is not a bet: only a voluntary bet or raise reads as strength.
  const facingRaise = o.callAmount > 0 && h.lastAggressor !== null;
  // Hand reading: a big bet from someone else means a stronger range than a
  // random hand. A reading bot already prices that through the opponent's
  // range floor (`rangeFloors`), so the extra pressure discount shrinks as
  // reading grows — stacking both made skilled bots fold to any bet.
  // Against a seat that raises far more than a sane player (a shove-or-fold
  // or bet-every-check strategy), a reading bot drops most of the discount:
  // its bets are not strength. Against everyone else, a bet is a bet.
  const reading = Math.max(0, Math.min(1, (p.skill - 0.3) / 0.6));
  const wild = facingRaise ? maniac(v, h.lastAggressor) * reading : 0;
  const pressure = facingRaise ? Math.min(1.5, o.callAmount / Math.max(1, pot)) : 0;
  const pressureK = 1.4 * (0.3 + 0.7 * p.skill) * (1 - wild) + 0.25 * wild;
  const eq = Math.pow(r.equity, 1 + pressureK * pressure);
  // Skill is decision quality: a naive bot plays loose and passive (calls
  // light, rarely raises for value, bluffs at random); a skilled one raises
  // its good hands for value, picks its bluffs and uses position.
  const naive = 1 - p.skill;
  // Position: acting last is worth a few points of equity; every seat still
  // to act behind is a threat.
  const posAdj = p.skill * (r.behind === 0 ? -0.04 : 0.02 * Math.min(3, r.behind));
  // The clock: near the cap stacks are ranked as they stand. A chip leader
  // folds its way in; a short stack has to gamble now.
  const nearCap = r.handsToCap <= 2.5 && r.alive > 2;
  const leader = nearCap && r.stackRank < Math.min(3, Math.ceil(r.alive / 2));
  const desperate = nearCap && r.stackRank >= Math.ceil(r.alive / 2);
  if (leader) tight += 0.2 * p.skill;
  const strong =
    fair +
    (h.street === 'preflop' ? 0.12 : 0.17) -
    // A skilled bot bets thinner for value: loose callers pay it off.
    p.skill * 0.06 +
    tight +
    posAdj +
    (facingRaise ? 0.15 : 0) +
    naive * 0.12 -
    (h.street !== 'preflop' && r.opponents === 1 ? p.skill * 0.05 : 0);
  const raiseTo = (frac: number) => {
    const size = h.currentBet + (pot + o.callAmount) * frac;
    const rounded = Math.round(size / 2) * 2;
    return Math.max(o.minRaiseTo, Math.min(o.maxRaiseTo, rounded));
  };
  // One sizing distribution for value and bluffs alike (sizes carry no
  // tell); skilled bots polarise: the nuts and the bluffs go big.
  const size = (polar: boolean) =>
    polar && p.skill >= 0.7 ? 0.75 + rng.next() * 0.25 : 0.45 + rng.next() * 0.55;
  // Short stack: shove-or-fold territory. Desperate near the cap: wider.
  const shoveAt = fair + (desperate ? -0.05 : 0.12) + (p.tightness - 0.5) * 0.15;
  if ((r.stackBB < 10 || (desperate && p.skill >= 0.5)) && o.canRaise && eq > shoveAt) {
    return { type: 'raise', seat, to: o.maxRaiseTo };
  }
  if (o.canRaise && eq > strong) {
    // Overbet live this street: the nuts can bet past the pot.
    const over = (h.overbet?.[seat] ?? 0) > 0 && eq > strong + 0.15 ? 1 + h.overbet![seat] : 1;
    return { type: 'raise', seat, to: raiseTo(size(eq > strong + 0.15) * over) };
  }
  // Semi-bluff: a flush or open-ended draw raises (or bets) at a skill- and
  // persona-scaled rate — a raise from a skilled bot is not always value.
  if (
    o.canRaise &&
    r.draw &&
    !leader &&
    rng.next() < (o.canCheck ? 0.15 : 0.08) + p.bluff * p.skill * 0.6
  ) {
    return { type: 'raise', seat, to: raiseTo(size(true)) };
  }
  // Pre-flop 3-bet bluff from late position with a hand that has blockers
  // and playability.
  if (
    o.canRaise &&
    h.street === 'preflop' &&
    facingRaise &&
    r.behind <= 1 &&
    p.skill >= 0.6 &&
    !leader &&
    eq > fair - 0.12 &&
    rng.next() < 0.04 + 0.06 * p.skill
  ) {
    return { type: 'raise', seat, to: raiseTo(size(true)) };
  }
  // Bluff: a persona-rate stab when checked to with a weak hand. A skilled
  // bot only bluffs few opponents after the flop, more often in position.
  const goodSpot = p.skill < 0.5 || (h.street !== 'preflop' && r.opponents <= 2);
  if (
    o.canRaise &&
    o.canCheck &&
    eq < fair &&
    goodSpot &&
    !leader &&
    rng.next() < p.bluff * (1 - 0.3 * p.skill) * (r.behind === 0 ? 1.5 : 1)
  ) {
    return { type: 'raise', seat, to: raiseTo(size(true)) };
  }
  if (o.canCheck) return { type: 'check', seat };
  // Pre-flop, unraised: complete the blind with a playable hand.
  if (h.street === 'preflop' && !facingRaise) {
    return eq > fair - 0.08 + tight + posAdj ? { type: 'call', seat } : { type: 'fold', seat };
  }
  // Calling. Placement, not chips: with three or fewer seats left, a call
  // that risks half the stack needs a little more than the price.
  const risk = o.callAmount / Math.max(1, v.seats[seat].stack + h.committed[seat]);
  const icm = r.alive <= 3 && risk >= 0.5 ? 0.04 * (r.alive - 1) * p.skill : 0;
  const margin = (p.tightness - 0.5) * 0.12 - naive * 0.14 + icm + (leader ? 0.08 : 0);
  if (eq >= potOdds + margin) return { type: 'call', seat };
  // A drawing hand with the price close enough calls.
  if (r.draw && eq >= potOdds - 0.06 && !r.facingAllIn) return { type: 'call', seat };
  // Minimum defence: a skilled bot does not let a lone bet take every pot.
  // Facing a single bettor post-flop, it defends a hand that beats the
  // bettor's bluffs often enough (raw equity, before the pressure discount).
  if (
    h.street !== 'preflop' &&
    r.opponents === 1 &&
    p.skill >= 0.6 &&
    wild > 0.3 &&
    !leader &&
    r.equity >= Math.min(0.5, potOdds + 0.05) &&
    rng.next() < p.skill * (1 - potOdds)
  )
    return { type: 'call', seat };
  return { type: 'fold', seat };
}

function pace(action: Action, v: Match, seat: number, rng: Rng): number {
  const h = v.hand;
  const [lo, hi] =
    action.type === 'raise' ||
    action.type === 'cast' ||
    action.type === 'leader' ||
    (action.type === 'call' &&
      h &&
      (betOptions(v, seat)?.callAmount ?? 0) > v.seats[seat].stack * 0.2)
      ? BOT.slowActionMs
      : BOT.fastActionMs;
  return Math.round(lo + rng.next() * (hi - lo));
}

/**
 * The bot's next action for `seat`, given ONLY its own view. Returns null when
 * the match isn't waiting on this seat. The action's `dt` is its nominal
 * pacing (independent of hand strength, so it is never a tell).
 */
export function botAction(
  view: Match,
  seat: number,
  rng: Rng,
  /** noPowers: bet only (a retry after a cast the engine refused). */
  opts: { noPowers?: boolean } = {},
): Action | null {
  const h = view.hand;
  if (!h || h.done || view.phase !== 'hand') return null;
  const p = h.pending;
  let action: Action | null = null;
  if (p?.kind === 'choice') {
    if (p.seat !== seat) return null;
    action = { type: 'choose', seat, index: chooseCard(view, seat) };
  } else if (p) {
    if (!p.seats.includes(seat)) return null;
    const r = read(view, seat, rng);
    action = (opts.noPowers ? null : tryCast(view, seat, r, rng, true)) ?? { type: 'pass', seat };
  } else if (h.toAct === seat) {
    const r = read(view, seat, rng);
    const persona = view.seats[seat].persona;
    if (h.freePeeks.includes(seat)) {
      const opts = h.dealtIn.map((_, i) => i).filter((i) => i !== seat && inHand(h, i));
      if (opts.length) action = { type: 'freePeek', seat, target: threatTarget(view, seat, opts) };
    }
    if (!action && !opts.noPowers && rng.next() < 0.2 + persona.powerUse * 0.3)
      action = tryCast(view, seat, r, rng, false);
    if (!action && !opts.noPowers && rng.next() < 0.5) action = tryLeader(view, seat, r, rng);
    if (!action) action = betDecision(view, seat, r, rng);
  }
  if (!action) return null;
  return { ...action, dt: pace(action, view, seat, rng) };
}
