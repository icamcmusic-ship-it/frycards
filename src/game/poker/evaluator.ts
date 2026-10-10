/**
 * Hold'em hand evaluator for FryCards Poker.
 *
 * Scores the best five-card hand from any 5–8 cards. A card flagged `wild`
 * (Wild keyword) counts as whichever suit makes the best hand. Scores compare
 * as plain numbers: higher wins, equal splits.
 */
import type { Rng } from './rng';

export interface Card {
  /** 2..14 (14 = ace). */
  r: number;
  /** 0..3 — ♠ ♥ ♦ ♣. */
  s: number;
  wild?: boolean;
}

export const RANK_CHARS = '23456789TJQKA';
export const SUIT_CHARS = ['♠', '♥', '♦', '♣'];
export const SUIT_NAMES = ['spades', 'hearts', 'diamonds', 'clubs'];

export const CATEGORY_NAMES = [
  'High card',
  'Pair',
  'Two pair',
  'Three of a kind',
  'Straight',
  'Flush',
  'Full house',
  'Four of a kind',
  'Straight flush',
];

export function cardLabel(c: Card): string {
  return `${RANK_CHARS[c.r - 2]}${SUIT_CHARS[c.s]}`;
}

export function rankName(r: number): string {
  return [
    'Two',
    'Three',
    'Four',
    'Five',
    'Six',
    'Seven',
    'Eight',
    'Nine',
    'Ten',
    'Jack',
    'Queen',
    'King',
    'Ace',
  ][r - 2];
}

export interface HandValue {
  category: number;
  score: number;
}

const B = 15;
function pack(category: number, ranks: number[]): number {
  let v = category;
  for (let i = 0; i < 5; i++) v = v * B + (ranks[i] ?? 0);
  return v;
}

/** Highest straight top in a rank bitmask (bit r set for rank r), or 0. */
function straightTop(mask: number): number {
  for (let top = 14; top >= 6; top--) {
    let ok = true;
    for (let k = 0; k < 5; k++) {
      if (!(mask & (1 << (top - k)))) {
        ok = false;
        break;
      }
    }
    if (ok) return top;
  }
  // Wheel: A-2-3-4-5.
  if (mask & (1 << 14) && mask & 4 && mask & 8 && mask & 16 && mask & 32) return 5;
  return 0;
}

function evalFixed(cards: Card[]): HandValue {
  const counts = new Array(15).fill(0);
  const suitMasks = [0, 0, 0, 0];
  const suitCounts = [0, 0, 0, 0];
  let mask = 0;
  for (const c of cards) {
    counts[c.r]++;
    mask |= 1 << c.r;
    suitMasks[c.s] |= 1 << c.r;
    suitCounts[c.s]++;
  }
  // Straight flush / flush.
  let flushSuit = -1;
  for (let s = 0; s < 4; s++) if (suitCounts[s] >= 5) flushSuit = s;
  if (flushSuit >= 0) {
    const sf = straightTop(suitMasks[flushSuit]);
    if (sf) return { category: 8, score: pack(8, [sf]) };
  }
  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  const singles: number[] = [];
  for (let r = 14; r >= 2; r--) {
    if (counts[r] === 4) quads.push(r);
    else if (counts[r] === 3) trips.push(r);
    else if (counts[r] === 2) pairs.push(r);
    else if (counts[r] === 1) singles.push(r);
  }
  if (quads.length) {
    const kicker = Math.max(...[...trips, ...pairs, ...singles, ...quads.slice(1)], 0);
    return { category: 7, score: pack(7, [quads[0], kicker]) };
  }
  if (trips.length && (trips.length > 1 || pairs.length)) {
    const pairRank = Math.max(trips[1] ?? 0, pairs[0] ?? 0);
    return { category: 6, score: pack(6, [trips[0], pairRank]) };
  }
  if (flushSuit >= 0) {
    const ranks: number[] = [];
    for (let r = 14; r >= 2 && ranks.length < 5; r--)
      if (suitMasks[flushSuit] & (1 << r)) ranks.push(r);
    return { category: 5, score: pack(5, ranks) };
  }
  const st = straightTop(mask);
  if (st) return { category: 4, score: pack(4, [st]) };
  if (trips.length) {
    const kick = [...pairs, ...singles].sort((a, b) => b - a).slice(0, 2);
    return { category: 3, score: pack(3, [trips[0], ...kick]) };
  }
  if (pairs.length >= 2) {
    const kick = [...pairs.slice(2), ...singles].sort((a, b) => b - a)[0] ?? 0;
    return { category: 2, score: pack(2, [pairs[0], pairs[1], kick]) };
  }
  if (pairs.length === 1)
    return { category: 1, score: pack(1, [pairs[0], ...singles.slice(0, 3)]) };
  return { category: 0, score: pack(0, singles.slice(0, 5)) };
}

/** Best hand from 5+ cards. Wild cards try every suit. */
export function evaluate(cards: Card[]): HandValue {
  const wildIdx = cards.findIndex((c) => c.wild);
  if (wildIdx < 0) return evalFixed(cards);
  let best: HandValue = { category: -1, score: -1 };
  for (let s = 0; s < 4; s++) {
    const trial = cards.map((c, i) => (i === wildIdx ? { r: c.r, s, wild: false } : c));
    const v = evaluate(trial);
    if (v.score > best.score) best = v;
  }
  return best;
}

/** A short description: "Pair of Kings", "Flush", "Two pair". */
export function describeHand(cards: Card[]): string {
  if (cards.length < 5) {
    if (cards.length === 2 && cards[0].r === cards[1].r) return `Pocket ${rankName(cards[0].r)}s`;
    return cards.length ? `${rankName(Math.max(...cards.map((c) => c.r)))} high` : '';
  }
  const v = evaluate(cards);
  const top = Math.floor(v.score / B ** 4) % B;
  switch (v.category) {
    case 1:
      return `Pair of ${rankName(top)}s`;
    case 3:
      return `Three ${rankName(top)}s`;
    case 7:
      return `Four ${rankName(top)}s`;
    case 0:
      return `${rankName(top)} high`;
    default:
      return CATEGORY_NAMES[v.category];
  }
}

/** Partial-hand category (fewer than five cards, e.g. pre-flop). */
export function partialCategory(cards: Card[]): number {
  if (cards.length >= 5) return evaluate(cards).category;
  const counts = new Map<number, number>();
  for (const c of cards) counts.set(c.r, (counts.get(c.r) ?? 0) + 1);
  const v = [...counts.values()].sort((a, b) => b - a);
  if (v[0] >= 4) return 7;
  if (v[0] === 3) return 3;
  if (v[0] === 2 && v[1] === 2) return 2;
  if (v[0] === 2) return 1;
  return 0;
}

// ---------------------------------------------------------------------------
// Deck helpers
// ---------------------------------------------------------------------------
export function fullDeck(): Card[] {
  const out: Card[] = [];
  for (let s = 0; s < 4; s++) for (let r = 2; r <= 14; r++) out.push({ r, s });
  return out;
}

const keyOf = (c: Card) => c.r * 4 + c.s;

export function remainingDeck(exclude: Card[]): Card[] {
  const used = new Set(exclude.map(keyOf));
  return fullDeck().filter((c) => !used.has(keyOf(c)));
}

/**
 * Categories this hand can still finish as, given the cards still to come.
 * `toCome` is how many board cards are left. Exhaustive up to two cards; with
 * three or more to come every excludable category is still reachable.
 */
export function attainableCategories(hole: Card[], board: Card[], toCome: number): Set<number> {
  const out = new Set<number>();
  if (toCome >= 3) {
    for (let c = 0; c <= 8; c++) out.add(c);
    return out;
  }
  const mine = [...hole, ...board];
  if (toCome === 0) {
    out.add(evaluate(mine).category);
    return out;
  }
  const rest = remainingDeck(mine);
  if (toCome === 1) {
    for (const a of rest) out.add(evaluate([...mine, a]).category);
    return out;
  }
  for (let i = 0; i < rest.length; i++)
    for (let j = i + 1; j < rest.length; j++)
      out.add(evaluate([...mine, rest[i], rest[j]]).category);
  return out;
}

/**
 * Monte Carlo equity: the chance `hole` wins (ties split) against `opponents`
 * random hands, with `known` opponent cards fixed where a power revealed
 * them. `dead` cards are out of play (mucked, burned, known elsewhere).
 */
export function equity(opts: {
  hole: Card[];
  board: Card[];
  boardSize: number;
  opponents: Card[][];
  dead?: Card[];
  trials: number;
  rng: Rng;
}): number {
  const { hole, board, boardSize, opponents, trials, rng } = opts;
  if (opponents.length === 0) return 1;
  const fixed = [...hole, ...board, ...opponents.flat(), ...(opts.dead ?? [])];
  const pool = remainingDeck(fixed);
  let won = 0;
  for (let t = 0; t < trials; t++) {
    // Partial shuffle: draw what we need from the front.
    const need =
      boardSize - board.length + opponents.reduce((a, o) => a + Math.max(0, 2 - o.length), 0);
    for (let i = 0; i < need && i < pool.length; i++) {
      const j = i + rng.int(pool.length - i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    let k = 0;
    const fullBoard = [...board];
    while (fullBoard.length < boardSize) fullBoard.push(pool[k++]);
    const mine = evaluate([...hole, ...fullBoard]).score;
    const best = mine;
    let ties = 1;
    let beaten = false;
    for (const o of opponents) {
      const oh = [...o];
      while (oh.length < 2) oh.push(pool[k++]);
      const s = evaluate([...oh, ...fullBoard]).score;
      if (s > best) {
        beaten = true;
        break;
      }
      if (s === best) ties++;
    }
    if (!beaten) won += 1 / ties;
  }
  return won / trials;
}

/** Rough pre-flop strength (0..1, about the equity against one random hand)
 * for a two-card hand — a fast heuristic for nerve, bots and the helper. */
export function preflopStrength(hole: Card[]): number {
  if (hole.length < 2) return 0.3;
  const [a, b] = [...hole].sort((x, y) => y.r - x.r);
  if (a.r === b.r) return Math.min(0.86, 0.5 + (a.r - 2) * 0.03);
  let s = 0.3 + (a.r - 2) * 0.018 + (b.r - 2) * 0.012;
  if (a.s === b.s) s += 0.03;
  const gap = a.r - b.r;
  if (gap === 1) s += 0.02;
  else if (gap >= 4) s -= 0.02;
  return Math.max(0, Math.min(1, s));
}
