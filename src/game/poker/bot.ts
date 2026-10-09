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
import { BOT, UNIT } from './constants';
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
}

function visibleBoard(v: Match): Card[] {
  return v.hand!.board.filter((c) => !isHidden(c));
}

function boardSize(v: Match): number {
  return v.hand!.rule.id === 'shortBoard' ? 4 : 5;
}

/** Equity from this seat's view only. */
export function estimateEquity(
  v: Match,
  seat: number,
  rng: Rng,
  trials = BOT.equityTrials,
): number {
  const h = v.hand!;
  const hole = h.holes[seat].filter((c) => !isHidden(c));
  const board = visibleBoard(v);
  const opps: Card[][] = [];
  for (let i = 0; i < h.holes.length; i++) {
    if (i === seat || !inHand(h, i)) continue;
    opps.push(h.holes[i].filter((c) => !isHidden(c)).slice(0, 2));
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

function read(v: Match, seat: number, rng: Rng): Read {
  const h = v.hand!;
  const opponents = h.dealtIn.filter((d, i) => d && i !== seat && !h.folded[i]).length;
  const p = v.seats[seat].persona;
  let eq = estimateEquity(v, seat, rng);
  // Low skill misjudges its hand.
  eq = Math.max(0, Math.min(1, eq + (rng.next() - 0.5) * (1 - p.skill) * 0.3));
  return {
    equity: eq,
    opponents,
    potBB: potTotal(h) / h.bb,
    stackBB: v.seats[seat].stack / h.bb,
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
      return 0.25 * r.potBB + 0.4;
    case 'Kindle':
      return nBB * (0.4 + r.equity);
    case 'Tax':
      return nBB * r.opponents * r.equity;
    case 'Siphon':
      return Math.min(nBB, r.potBB);
    case 'Blessed':
      return Math.min(nBB, h.powerPaid[seat] / h.bb);
    case 'Bulwark':
    case 'Insurance':
      return nBB * (r.equity < 0.6 ? 0.5 : 0.1);
    case 'Redraw':
    case 'Windfall':
    case 'Wild':
    case 'Exhume':
      return pre ? losing * 2 : losing * r.potBB * 0.6;
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
      return r.stackBB < 10 ? 0.8 : 0.1;
    case 'Burn':
    case 'Cut':
      return !pre && r.equity < 0.4 ? 0.3 * r.potBB : 0;
    case 'Pass':
      return !pre && r.equity < 0.3 ? 0.4 * r.potBB : 0;
    case 'Call Out':
      return castTargets(v, seat, def).some((c) => c.mods.some((x) => x.kw === 'Feint')) ? 1.2 : 0;
    case 'Snuff':
      return 0;
    default:
      return 0.2;
  }
}

function chooseExtraCosts(v: Match, seat: number, uid: string, count: number): ExtraCost[] | null {
  const h = v.hand!;
  const out: ExtraCost[] = [];
  const hand = v.seats[seat].hand
    .filter((p) => p.uid !== uid)
    .sort((a, b) => (a.def.tier ?? 0) - (b.def.tier ?? 0));
  const excl = excludableCategories(v, seat);
  // Bluffers love exclusions (they bite only at showdown); flushes are the
  // cheapest category to give up for an unsuited hand.
  const prefer = [5, 4, 3, 2, 1].filter((c) => excl.includes(c));
  let shedIdx = 0;
  let debuff = 0;
  while (out.length < count) {
    if (prefer.length) out.push({ kind: 'exclude', category: prefer.shift()! });
    else if (shedIdx < hand.length) out.push({ kind: 'shed', uid: hand[shedIdx++].uid });
    else if (debuff < h.holes[seat].length && !h.holes[seat][debuff].blinded)
      out.push({ kind: 'debuff', hole: debuff++ });
    else return null;
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
    // Spend nerve when the ability is worth it; build nerve when running low.
    const want =
      ab.nerve < 0 ? value > 0.8 && s.nerve >= -ab.nerve + 1 : s.nerve <= 4 && rng.next() < 0.5;
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
    case 'wild': {
      // The card whose suit is rarest among our cards benefits most.
      const suits = [...hole, ...board].map((c) => c.s);
      const count = (s: number) => suits.filter((x) => x === s).length;
      return opts.reduce((a, b) => (count(hole[b].s) < count(hole[a].s) ? b : a), opts[0]);
    }
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
  // Hand reading: a big bet from someone else means a stronger range than a
  // random hand, so raw equity is discounted by how hard we are pushed.
  const pressure = o.callAmount / Math.max(1, pot);
  const eq = Math.pow(r.equity, 1 + 1.6 * pressure * (0.5 + p.skill));
  // Fair share of the pot at this table size, nudged by tightness.
  const fair = 1 / (r.opponents + 1);
  const strong = fair + 0.2 + (p.tightness - 0.5) * 0.2 + (o.callAmount > 0 ? 0.15 : 0);
  const raiseTo = (frac: number) => {
    const size = h.currentBet + (pot + o.callAmount) * frac;
    const rounded = Math.round(size / 10) * 10;
    return Math.max(o.minRaiseTo, Math.min(o.maxRaiseTo, rounded));
  };
  // Short stack: shove-or-fold territory.
  if (r.stackBB < 10 && o.canRaise && eq > fair + 0.12 + (p.tightness - 0.5) * 0.15) {
    return { type: 'raise', seat, to: o.maxRaiseTo };
  }
  if (o.canRaise && eq > strong) {
    const frac = eq > strong + 0.15 ? 0.6 + rng.next() * 0.4 : 0.35 + rng.next() * 0.3;
    return { type: 'raise', seat, to: raiseTo(frac) };
  }
  // Bluff: a persona-rate stab when checked to with a weak hand.
  if (o.canRaise && o.canCheck && eq < fair && rng.next() < p.bluff) {
    return { type: 'raise', seat, to: raiseTo(0.4 + rng.next() * 0.3) };
  }
  if (o.canCheck) return { type: 'check', seat };
  const margin = (p.tightness - 0.5) * 0.12 - (1 - p.skill) * 0.08;
  if (eq >= potOdds + margin) return { type: 'call', seat };
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
export function botAction(view: Match, seat: number, rng: Rng): Action | null {
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
    action = tryCast(view, seat, r, rng, true) ?? { type: 'pass', seat };
  } else if (h.toAct === seat) {
    const r = read(view, seat, rng);
    const persona = view.seats[seat].persona;
    if (h.freePeeks.includes(seat)) {
      const opts = h.dealtIn.map((_, i) => i).filter((i) => i !== seat && inHand(h, i));
      if (opts.length) action = { type: 'freePeek', seat, target: threatTarget(view, seat, opts) };
    }
    if (!action && rng.next() < 0.2 + persona.powerUse * 0.3)
      action = tryCast(view, seat, r, rng, false);
    if (!action && rng.next() < 0.5) action = tryLeader(view, seat, r, rng);
    if (!action) action = betDecision(view, seat, r, rng);
  }
  if (!action) return null;
  return { ...action, dt: pace(action, view, seat, rng) };
}
