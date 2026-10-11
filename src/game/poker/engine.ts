/**
 * FryCards Poker engine — a pure (state, action) → state reducer.
 *
 * A match is a pot-limit Hold'em freezeout for 2–6 seats, played to one
 * winner or to the mode's hard clock. Every seat brings a deck: a Leader (a
 * persona with two nerve abilities), a Location (the table's weather, played
 * from a shared bag) and power cards (Units ★, Items ⚙, Events ϟ) that bend
 * what players see, receive, handle and lose.
 *
 * Purity: `applyAction` never mutates its input. It clones the state, applies
 * the action to the clone with the state's own seeded generator, and returns
 * the clone. The same seed + the same ordered action list always reproduces
 * the same match (`replay`). Each action carries `dt`, the match-clock time it
 * took, so the blind clock is part of the log too.
 *
 * Information: every hole card carries `knownTo` — the seats that know it
 * besides its holder — or `public`. view.ts redacts a match to one seat's
 * view; the table UI and the bots only ever read that view.
 */
import type { CardDef, KwRef, LocationRule } from './cards';
import { hasKw, modN } from './cards';
import { cardColors, type Color } from './colors';
import {
  CAPS,
  COST_LADDER_UNITS,
  EXCLUDABLE,
  ITEM_UNBONDED_STEP,
  MAX_EXCLUSIONS,
  MODES,
  NERVE,
  GAMBIT_OWED,
  LAST_STAND_BB,
  RESONANT_STEP,
  SECOND_COST_TIER,
  SOULBOUND_STEP,
  STACK_CAP_SHARE,
  TAX_MAX_SEATS,
  THRIVING_GROWTH,
  TILT_STEP,
  UNIT,
  bigBlindAt,
  roundBlind,
  type ModeConfig,
  type ModeId,
} from './constants';
import type { DeckDef } from './deck';
import {
  attainableCategories,
  cardLabel,
  CATEGORY_NAMES,
  evaluate,
  fullDeck,
  preflopStrength,
  type Card,
} from './evaluator';
import {
  CHIP_KEYWORDS,
  KEYWORD_SPECS,
  keywordLabel,
  type EffectKeyword,
  type Keyword,
} from './keywords';
import { buildCycle, ruleName, type ScheduledLocation } from './locations';
import { poolByType } from './cardpool';
import { rngOn, shuffle, type Rng } from './rng';

// ===========================================================================
// Types
// ===========================================================================

export interface PCard extends Card {
  id: number;
  /** Seats (other than the holder) that know this card. */
  knownTo: number[];
  /** Face-up for everyone. */
  public?: boolean;
  /** Fog: a board card dealt face-down until the turn. */
  facedown?: boolean;
  /** Hole-card debuff: the holder cannot look at it until this street ends. */
  blinded?: boolean;
}

export type Street = 'preflop' | 'flop' | 'turn' | 'river';
export const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];

export interface PowerInst {
  uid: string;
  def: CardDef;
}

/** Bot persona — data, derived from the Leader's two colours. */
export interface Persona {
  bluff: number;
  tightness: number;
  powerUse: number;
  /** Decision quality 0..1 (difficulty). */
  skill: number;
}

export interface Seat {
  idx: number;
  name: string;
  human: boolean;
  leader: CardDef;
  location: CardDef;
  persona: Persona;
  drawPile: PowerInst[];
  discard: PowerInst[];
  hand: PowerInst[];
  stack: number;
  nerve: number;
  busted: boolean;
  /** Order this seat busted in (1 = first out). */
  bustOrder?: number;
  /** Final place (1 = winner), set when the match ends. */
  place?: number;
}

export type ExtraCost =
  | { kind: 'shed'; uid: string }
  | { kind: 'debuff'; hole: number }
  | { kind: 'exclude'; category: number };

export interface CastRecord {
  id: number;
  seat: number;
  /** Power instance uid, or `leader:<i>` for a Leader ability. */
  uid: string;
  def: CardDef;
  effect: KwRef;
  mods: KwRef[];
  street: Street;
  target: number | null;
  targetCast: number | null;
  chipsPaid: number;
  extra: ExtraCost[];
  status: 'pending' | 'resolved' | 'snuffed' | 'fizzled' | 'fused';
  /** Secret Feint fizzle — only Call Out (or the caster) learns it. */
  feinted?: boolean;
  veiled?: boolean;
  response?: boolean;
  leader?: boolean;
  calledOut?: boolean;
  /** Bait: chips already refunded. */
  baitRefunded?: boolean;
}

export interface UnitToken {
  uid: string;
  def: CardDef;
  seat: number;
  castId: number;
  /** Thriving: current N (grows each street). */
  n?: number;
}

export type Pending =
  | { kind: 'response'; castId: number; seats: number[] }
  | { kind: 'raiseWindow'; seat: number; seats: number[] }
  | {
      kind: 'choice';
      seat: number;
      choice: 'windfall' | 'pineapple' | 'redraw' | 'exhume';
      /** Hole cards to discard down to, for windfall / pineapple. */
      keep?: number;
      queue: number[];
    };

export interface PotResult {
  amount: number;
  winners: number[];
  eligible: number[];
  board?: 1 | 2;
}

export interface HandResult {
  /** Showdown hands shown (seat → category name), only for shown seats. */
  shown: Record<number, string>;
  pots: PotResult[];
  /** Net chip change per seat this hand. */
  delta: number[];
  uncontested: boolean;
  winners: number[];
}

export interface Hand {
  no: number;
  button: number;
  sbSeat: number | null;
  bbSeat: number | null;
  bb: number;
  location: ScheduledLocation;
  rule: LocationRule;
  deck: PCard[];
  board: PCard[];
  /** Double Board / Rerun: the second board (shares the cards dealt before the split). */
  board2: PCard[] | null;
  burn: PCard[];
  muck: PCard[];
  holes: PCard[][];
  dealtIn: boolean[];
  folded: boolean[];
  committed: number[];
  streetBet: number[];
  /** Voluntary action taken this street (for Slow Events and blinds' option). */
  acted: boolean[];
  /** Seats that already acted and face only an incomplete (short all-in)
   * raise since: they may call or fold, not re-raise. */
  noReraise?: boolean[];
  currentBet: number;
  lastRaise: number;
  lastAggressor: number | null;
  /** Seat that made the last bet/raise on each street (bluff detection). */
  aggressorByStreet: (number | null)[];
  street: Street;
  toAct: number | null;
  /** Money in the pot that belongs to no seat's contribution (power costs,
   * drains, antes). May go negative when powers take chips back out; the
   * main pot absorbs it. */
  dead: number;
  stackAtStart: number[];
  casts: CastRecord[];
  units: UnitToken[];
  /** Overbet: this street's pot multiplier bonus per seat (0 = none). */
  overbet?: number[];
  /** Soulbound cards and Weapons used this hand: back to hand at its end. */
  returning?: { seat: number; uid: string; def: CardDef }[];
  itemGears: number[];
  itemCount: number[];
  eventBolts: number[];
  eventsThisStreet: number[];
  castCount: number[];
  hostileHit: boolean[];
  locked: boolean[];
  leaderUsed: boolean[];
  exclusions: number[][];
  toll: number[];
  insurance: number[];
  bulwark: number[];
  decoy: boolean[];
  powerPaid: number[];
  venom: { from: number; to: number; n: number }[];
  bounty: { from: number; to: number; n: number }[];
  entropic: number[];
  gambit: { seat: number; owed: number }[];
  fused: { castId: number; streetsLeft: number }[];
  /** Seats whose Bloom grows when the next street is dealt. */
  bloom: number[];
  rerun: boolean;
  /** Shortest-stack buff on position-favouring Locations (first cast one step cheaper). */
  buffSeat: number | null;
  buffUsed: boolean;
  freePeeks: number[];
  straddler: number | null;
  pending: Pending | null;
  /** Windows interrupted by a choice (a Redraw cast as a response), resumed
   * when the choice is made. */
  deferred: Pending[];
  /** Hand is over (result set); waiting for the next `start`. */
  done: boolean;
  result: HandResult | null;
}

export interface LogEntry {
  text: string;
  /** Visible only to this seat (private results). */
  to?: number;
  /** Not shown to these seats (a Veiled line: they read a fuller copy). */
  hideFrom?: number[];
  hand: number;
}

export interface Match {
  seed: number;
  mode: ModeId;
  rng: number;
  seats: Seat[];
  handNo: number;
  button: number;
  /** Match clock (ms). Blinds rise with it; the cap ends the match. */
  clockMs: number;
  level: number;
  phase: 'between' | 'hand' | 'over';
  hand: Hand | null;
  bag: ScheduledLocation[];
  prevLocation: string | null;
  jackpot: number;
  castSeq: number;
  bustCount: number;
  log: LogEntry[];
  /** One-line public summary per finished hand (the hand-history screen). */
  history: { no: number; location: string; summary: string; board: string }[];
  /** Seat indexes, 1st place first, once the match is over. */
  placements: number[] | null;
  /** Public betting tendencies per seat, counted over the match: every
   * voluntary fold / check / call / raise, and how many were bets or raises
   * (what any player at the table could tally; bots read it). */
  aggro?: { actions: number; raises: number }[];
  capped: boolean;
}

export type Action =
  | { type: 'start'; dt?: number }
  | { type: 'fold' | 'check' | 'call'; seat: number; dt?: number }
  | { type: 'raise'; seat: number; to: number; dt?: number }
  | {
      type: 'cast';
      seat: number;
      uid: string;
      target?: number | null;
      targetCast?: number | null;
      costs?: ExtraCost[];
      feint?: boolean;
      dt?: number;
    }
  | { type: 'leader'; seat: number; ability: number; target?: number | null; dt?: number }
  | { type: 'pass'; seat: number; dt?: number }
  | { type: 'choose'; seat: number; index: number; dt?: number }
  | { type: 'freePeek'; seat: number; target: number; dt?: number };

export interface SeatSetup {
  name: string;
  human: boolean;
  deck: DeckDef;
  persona?: Persona;
}

export interface MatchSetup {
  seed: number;
  mode: ModeId;
  seats: SeatSetup[];
}

export class IllegalAction extends Error {
  /** 'hiddenTarget': the seat was already hit this street by a Veiled cast
   * the actor could not see — an expected rejection, not a bug. */
  constructor(
    message: string,
    readonly code?: 'hiddenTarget',
  ) {
    super(message);
  }
}

// ===========================================================================
// Personas — derived from the Leader's two colours (nothing hand-coded per
// Leader): Ember and Shadow bluff more, Void plays tight, Light bluffs least.
// ===========================================================================
const COLOR_PERSONA: Record<Color, { bluff: number; tight: number; power: number }> = {
  Ember: { bluff: 0.08, tight: -0.06, power: 0.1 },
  Tide: { bluff: 0, tight: 0, power: 0.06 },
  Root: { bluff: -0.02, tight: 0.04, power: 0 },
  Gale: { bluff: 0.03, tight: -0.03, power: 0.06 },
  Light: { bluff: -0.07, tight: 0.02, power: 0 },
  Shadow: { bluff: 0.08, tight: 0, power: 0.05 },
  Void: { bluff: -0.02, tight: 0.09, power: 0 },
};

export function personaFor(leader: CardDef, skill = 0.6): Persona {
  const p = { bluff: 0.12, tightness: 0.5, powerUse: 0.5, skill };
  for (const c of cardColors(leader)) {
    p.bluff += COLOR_PERSONA[c].bluff;
    p.tightness += COLOR_PERSONA[c].tight;
    p.powerUse += COLOR_PERSONA[c].power;
  }
  return p;
}

// ===========================================================================
// Small helpers
// ===========================================================================
export function modeOf(m: Pick<Match, 'mode'>): ModeConfig {
  return MODES[m.mode];
}

function say(m: Match, text: string, to?: number): void {
  m.log.push(to === undefined ? { text, hand: m.handNo } : { text, to, hand: m.handNo });
  if (m.log.length > 400) m.log.splice(0, m.log.length - 400);
}

/** Log a line that names a cast's target. A Veiled cast keeps its target
 * hidden until the street ends: the rest of the table reads the line with
 * the target written as "a hidden seat"; the caster and the target read it
 * in full. `line` renders the text from the current seat names. */
function sayTargeted(m: Match, rec: CastRecord, line: () => string): void {
  if (!rec.veiled || rec.target === null) {
    say(m, line());
    return;
  }
  const full = line();
  const t = m.seats[rec.target];
  const name = t.name;
  t.name = 'a hidden seat';
  let hidden = line();
  t.name = name;
  hidden = hidden[0].toUpperCase() + hidden.slice(1);
  const privy = [...new Set([rec.seat, rec.target])];
  m.log.push({ text: hidden, hand: m.handNo, hideFrom: privy });
  for (const i of privy) say(m, full, i);
}

/** Display form of a chip amount: always a whole number. */
export function fmtChips(chips: number): string {
  return `${Math.round(chips)}`;
}

const R = (m: Match): Rng => rngOn(m);

export function seatName(m: Match, i: number): string {
  return m.seats[i]?.name ?? `Seat ${i + 1}`;
}

/** A seat named "You" (the guest human) reads in the second person. */
function isYou(m: Match, i: number): boolean {
  return m.seats[i]?.name === 'You';
}

/** The verb form that agrees with the seat's name: "Mer-King calls" but
 * "You call". */
export function verb(m: Match, i: number, third: string, second: string): string {
  return isYou(m, i) ? second : third;
}

/** "their" / "your" for the seat. */
function their(m: Match, i: number): string {
  return isYou(m, i) ? 'your' : 'their';
}

/** Seats still in the match. */
export function aliveSeats(m: Match): number[] {
  return m.seats.filter((s) => !s.busted).map((s) => s.idx);
}

/** Next seat clockwise (dir 1) or counter-clockwise (dir -1) matching pred. */
function nextSeat(
  m: Match,
  from: number,
  pred: (i: number) => boolean,
  dir = 1,
  inclusive = false,
): number | null {
  const n = m.seats.length;
  for (let k = inclusive ? 0 : 1; k <= n; k++) {
    const i = (((from + dir * k) % n) + n) % n;
    if (pred(i)) return i;
  }
  return null;
}

export function inHand(h: Hand, i: number): boolean {
  return h.dealtIn[i] && !h.folded[i];
}

/** Can still put chips in / act in betting. */
function canBet(m: Match, h: Hand, i: number): boolean {
  return inHand(h, i) && m.seats[i].stack > 0;
}

export function potTotal(h: Hand): number {
  return h.committed.reduce((a, b) => a + b, 0) + h.dead;
}

function liveCount(h: Hand): number {
  return h.dealtIn.filter((d, i) => d && !h.folded[i]).length;
}

function payIntoPot(m: Match, seat: number, chips: number): number {
  const s = m.seats[seat];
  const pay = Math.max(0, Math.min(chips, s.stack));
  s.stack -= pay;
  m.hand!.dead += pay;
  return pay;
}

/** Take chips out of the pot (Siphon, Blessed, refunds). Capped at the pot. */
function takeFromPot(m: Match, seat: number, chips: number): number {
  const h = m.hand!;
  const take = Math.max(0, Math.min(chips, potTotal(h)));
  h.dead -= take;
  m.seats[seat].stack += take;
  return take;
}

function transfer(m: Match, from: number, to: number, chips: number): number {
  const pay = Math.max(0, Math.min(chips, m.seats[from].stack));
  m.seats[from].stack -= pay;
  m.seats[to].stack += pay;
  return pay;
}

function adjustNerve(m: Match, seat: number, delta: number, why?: string): void {
  const h = m.hand;
  const mult = h?.rule.id === 'tiltZone' ? 2 : 1;
  const s = m.seats[seat];
  const before = s.nerve;
  s.nerve = Math.max(0, Math.min(NERVE.max, s.nerve + delta * mult));
  if (s.nerve !== before && why) {
    say(
      m,
      `${s.name} ${s.nerve > before ? verb(m, seat, 'gains', 'gain') : verb(m, seat, 'loses', 'lose')} ${Math.abs(s.nerve - before)} nerve (${why}).`,
    );
  }
  if (before > 0 && s.nerve === 0)
    say(m, `${s.name} ${verb(m, seat, 'is', 'are')} TILTED — Leader locked until nerve recovers.`);
}

export function tilted(s: Seat): boolean {
  return s.nerve <= 0;
}

function drawPowers(m: Match, seat: number, n: number): void {
  const s = m.seats[seat];
  const cap = modeOf(m).handCap;
  for (let k = 0; k < n && s.hand.length < cap; k++) {
    if (s.drawPile.length === 0) {
      if (s.discard.length === 0) return;
      s.drawPile = shuffle(s.discard.splice(0), R(m));
      say(
        m,
        `${s.name} ${verb(m, seat, 'reshuffles', 'reshuffle')} ${their(m, seat)} power discard.`,
      );
    }
    s.hand.push(s.drawPile.shift()!);
  }
}

function discardPower(m: Match, seat: number, inst: PowerInst): void {
  m.seats[seat].discard.push(inst);
}

function dealCard(h: Hand): PCard {
  if (h.deck.length === 0) {
    // Out of cards (Double Board + Rerun + redraws at a full table): the burn
    // pile goes back under. Order is fixed, so replays stay deterministic.
    h.deck.push(...h.burn.splice(0));
    if (h.deck.length === 0) h.deck.push(...h.muck.splice(0).filter((c) => !c.public));
  }
  const c = h.deck.shift();
  if (!c) throw new Error('deck exhausted');
  return c;
}

// ===========================================================================
// Setup
// ===========================================================================
export function createMatch(setup: MatchSetup): Match {
  if (setup.seats.length < 2 || setup.seats.length > 6) throw new Error('2–6 seats');
  const mode = MODES[setup.mode];
  const m: Match = {
    seed: setup.seed,
    mode: setup.mode,
    rng: setup.seed | 0,
    seats: [],
    handNo: 0,
    button: 0,
    clockMs: 0,
    level: 0,
    phase: 'between',
    hand: null,
    bag: [],
    prevLocation: null,
    jackpot: 0,
    castSeq: 0,
    bustCount: 0,
    log: [],
    history: [],
    placements: null,
    capped: false,
    aggro: setup.seats.map(() => ({ actions: 0, raises: 0 })),
  };
  const rng = R(m);
  setup.seats.forEach((ss, idx) => {
    const powers: PowerInst[] = ss.deck.powers.map((def, i) => ({ uid: `${idx}:${i}`, def }));
    m.seats.push({
      idx,
      name: ss.name,
      human: ss.human,
      leader: ss.deck.leader,
      location: ss.deck.location,
      persona: ss.persona ?? personaFor(ss.deck.leader),
      drawPile: shuffle(powers, rng),
      discard: [],
      hand: [],
      stack: mode.stackChips,
      nerve: NERVE.start,
      busted: false,
    });
  });
  for (const s of m.seats) drawPowers(m, s.idx, mode.handStart);
  m.button = rng.int(m.seats.length);
  say(m, `${mode.label} freezeout · ${m.seats.length} seats · ${mode.stackChips} chips each.`);
  return m;
}

// ===========================================================================
// Hand start
// ===========================================================================
function nextLocation(m: Match): ScheduledLocation {
  if (m.bag.length === 0) {
    const alive = aliveSeats(m);
    const house = poolByType('Location').filter(
      (d) => !alive.some((i) => m.seats[i].location.id === d.id),
    );
    m.bag = buildCycle(
      alive.map((i) => ({ card: m.seats[i].location, owner: i })),
      house,
      R(m),
      m.prevLocation,
    );
  }
  const loc = m.bag.shift()!;
  m.prevLocation = loc.card.id;
  return loc;
}

/** The next two Locations, for the forecast strip. */
export function forecast(m: Match): ScheduledLocation[] {
  return m.bag.slice(0, 2);
}

function startHand(m: Match): void {
  const mode = modeOf(m);
  if (m.handNo > 0) {
    // Button moves to the next live seat.
    m.button = nextSeat(m, m.button, (i) => !m.seats[i].busted) ?? m.button;
    for (const i of aliveSeats(m)) drawPowers(m, i, mode.handDraw);
  } else if (m.seats[m.button].busted) {
    m.button = nextSeat(m, m.button, (i) => !m.seats[i].busted)!;
  }
  m.handNo++;
  m.level = Math.floor(m.clockMs / mode.levelMs);
  const location = nextLocation(m);
  const rule = location.card.rule ?? { id: 'plain' as const };
  const n = m.seats.length;
  let bb = bigBlindAt(mode, m.level);
  if (rule.id === 'highStakes') bb = roundBlind(bb * (rule.param ?? 1.5));
  const deck: PCard[] = shuffle(
    fullDeck().map((c, i) => ({ ...c, id: i, knownTo: [] as number[] })),
    R(m),
  );
  const dealtIn = m.seats.map((s) => !s.busted);
  const z = () => new Array(n).fill(0);
  const f = () => new Array(n).fill(false);
  const h: Hand = {
    no: m.handNo,
    button: m.button,
    sbSeat: null,
    bbSeat: null,
    bb,
    location,
    rule,
    deck,
    board: [],
    board2: null,
    burn: [],
    muck: [],
    holes: m.seats.map(() => []),
    dealtIn,
    folded: f(),
    committed: z(),
    streetBet: z(),
    acted: f(),
    noReraise: f(),
    currentBet: 0,
    lastRaise: bb,
    lastAggressor: null,
    aggressorByStreet: [null, null, null, null],
    street: 'preflop',
    toAct: null,
    dead: m.jackpot,
    stackAtStart: m.seats.map((s) => s.stack),
    casts: [],
    units: [],
    returning: [],
    overbet: z(),
    itemGears: z(),
    itemCount: z(),
    eventBolts: z(),
    eventsThisStreet: z(),
    castCount: z(),
    hostileHit: f(),
    locked: f(),
    leaderUsed: f(),
    exclusions: m.seats.map(() => []),
    toll: z(),
    insurance: z(),
    bulwark: z(),
    decoy: f(),
    powerPaid: z(),
    venom: [],
    bounty: [],
    entropic: [],
    gambit: [],
    fused: [],
    bloom: [],
    rerun: false,
    buffSeat: null,
    buffUsed: false,
    freePeeks: [],
    straddler: null,
    pending: null,
    deferred: [],
    done: false,
    result: null,
  };
  m.jackpot = 0;
  m.hand = h;
  m.phase = 'hand';
  const owner = location.owner !== undefined ? ` (${seatName(m, location.owner)}'s Location)` : '';
  say(
    m,
    `— Hand ${m.handNo} · ${location.card.name}${owner}: ${ruleName(rule)} · blinds ${fmtChips(bb / 2)}/${fmtChips(bb)} —`,
  );

  const live = aliveSeats(m);
  const shortest = live.reduce((a, b) => (m.seats[b].stack < m.seats[a].stack ? b : a), live[0]);
  const heads = live.length === 2;

  // Hole cards (Pineapple: three).
  const holeCount = rule.id === 'pineapple' ? 3 : 2;
  for (let k = 0; k < holeCount; k++) {
    let i: number | null = m.button;
    for (let c = 0; c < live.length; c++) {
      i = nextSeat(m, i!, (x) => dealtIn[x]);
      if (i === null) break;
      h.holes[i].push(dealCard(h));
    }
  }
  if (rule.id === 'openHand') {
    for (const i of live) {
      const low = [...h.holes[i]].sort((a, b) => a.r - b.r)[0];
      low.public = true;
    }
  }

  // Blinds / antes.
  const post = (seat: number, amount: number) => {
    const s = m.seats[seat];
    const pay = Math.min(amount, s.stack);
    s.stack -= pay;
    h.committed[seat] += pay;
    h.streetBet[seat] += pay;
    return pay;
  };
  if (rule.id === 'bombPot') {
    const ante = Math.round((rule.param ?? 1) * UNIT);
    for (const i of live) payIntoPot(m, i, ante);
    say(m, `Bomb Pot: everyone antes ${fmtChips(ante)}.`);
  } else {
    const sb = heads ? m.button : nextSeat(m, m.button, (x) => dealtIn[x])!;
    const bbSeat = nextSeat(m, sb, (x) => dealtIn[x])!;
    h.sbSeat = sb;
    h.bbSeat = bbSeat;
    post(sb, Math.round(bb / 2));
    post(bbSeat, bb);
    h.currentBet = bb;
    if (rule.id === 'straddleNight' && !heads) {
      const utg = nextSeat(m, bbSeat, (x) => dealtIn[x])!;
      post(utg, bb * 2);
      h.currentBet = Math.max(h.currentBet, h.streetBet[utg]);
      h.straddler = utg;
      say(
        m,
        `${seatName(m, utg)} ${verb(m, utg, 'posts', 'post')} a live straddle of ${fmtChips(bb * 2)}.`,
      );
    }
  }
  if (rule.id === 'houseRake') payIntoPot(m, m.button, Math.round((rule.param ?? 1) * UNIT));
  if (rule.id === 'dealersChoice') h.freePeeks = [...new Set([m.button, shortest])];
  if (rule.id === 'straddleNight' || rule.id === 'reverseOrder') h.buffSeat = shortest;

  if (rule.id === 'bombPot') {
    goToStreet(m, 'flop');
  } else {
    h.toAct = firstToAct(m, 'preflop');
    if (h.toAct === null || !anyoneMustAct(m)) runOut(m);
  }
}

function firstToAct(m: Match, street: Street): number | null {
  const h = m.hand!;
  const reverse = h.rule.id === 'reverseOrder';
  const ok = (i: number) => canBet(m, h, i);
  if (street === 'preflop') {
    if (reverse) return nextSeat(m, h.sbSeat ?? h.button, ok, -1, true);
    const from = h.straddler ?? h.bbSeat ?? h.button;
    return nextSeat(m, from, ok);
  }
  if (reverse) return nextSeat(m, h.button, ok, -1, true);
  return nextSeat(m, h.button, ok);
}

/** Does anyone still owe an action this street? */
function anyoneMustAct(m: Match): boolean {
  const h = m.hand!;
  const able = h.dealtIn.map((_, i) => i).filter((i) => canBet(m, h, i));
  if (liveCount(h) <= 1 || able.length === 0) return false;
  // One player able to act and everyone else all-in: they only need to act
  // if they still face a bet.
  if (able.length === 1) return h.streetBet[able[0]] < h.currentBet;
  return able.some((i) => !h.acted[i] || h.streetBet[i] < h.currentBet);
}

// ===========================================================================
// Betting
// ===========================================================================
export interface BetOptions {
  canCheck: boolean;
  canCall: boolean;
  callAmount: number;
  canRaise: boolean;
  minRaiseTo: number;
  maxRaiseTo: number;
}

export function betOptions(m: Match, seat: number): BetOptions | null {
  const h = m.hand;
  if (!h || h.done || h.pending || h.toAct !== seat) return null;
  const s = m.seats[seat];
  const owe = Math.max(0, h.currentBet - h.streetBet[seat]);
  const callAmount = Math.min(owe, s.stack);
  const allInTo = h.streetBet[seat] + s.stack;
  const potAfterCall = potTotal(h) + owe;
  // Overbet: this street the raise may be the pot × (1 + N).
  const over = 1 + (h.overbet?.[seat] ?? 0);
  const maxRaiseTo = Math.min(allInTo, h.currentBet + Math.round(potAfterCall * over));
  // Siphon / Blessed can shrink the pot below the last raise: the pot limit
  // wins, so the minimum never exceeds the maximum.
  const minRaiseTo = Math.min(maxRaiseTo, allInTo, h.currentBet + Math.max(h.lastRaise, h.bb));
  // Nobody else can respond to a raise: raising is pointless.
  const others = h.dealtIn.some((_, i) => i !== seat && canBet(m, h, i));
  return {
    canCheck: owe === 0,
    canCall: owe > 0,
    callAmount,
    canRaise: s.stack > owe && others && maxRaiseTo > h.currentBet && !h.noReraise?.[seat],
    minRaiseTo,
    maxRaiseTo,
  };
}

function act(m: Match, seat: number, kind: 'fold' | 'check' | 'call' | 'raise', to?: number): void {
  const h = m.hand!;
  const opts = betOptions(m, seat);
  if (!opts) throw new IllegalAction('Not your turn to bet');
  const s = m.seats[seat];
  const label = s.name;
  if (kind === 'fold') {
    h.folded[seat] = true;
    // Folded hole cards go to the muck (Exhume can fish them out).
    for (const c of h.holes[seat]) h.muck.push(c);
    noteStrongFold(m, seat);
    say(m, `${label} ${verb(m, seat, 'folds', 'fold')}.`);
  } else if (kind === 'check') {
    if (!opts.canCheck) throw new IllegalAction('Cannot check facing a bet');
    say(m, `${label} ${verb(m, seat, 'checks', 'check')}.`);
  } else if (kind === 'call') {
    if (!opts.canCall) throw new IllegalAction('Nothing to call');
    const pay = opts.callAmount;
    s.stack -= pay;
    h.committed[seat] += pay;
    h.streetBet[seat] += pay;
    say(
      m,
      `${label} ${verb(m, seat, 'calls', 'call')} ${fmtChips(pay)}${s.stack === 0 ? ' — ALL IN' : ''}.`,
    );
  } else {
    if (!opts.canRaise) throw new IllegalAction('Cannot raise');
    const target = Math.round(to ?? opts.minRaiseTo);
    if (target < opts.minRaiseTo || target > opts.maxRaiseTo)
      throw new IllegalAction(`Raise must be between ${opts.minRaiseTo} and ${opts.maxRaiseTo}`);
    const pay = target - h.streetBet[seat];
    s.stack -= pay;
    h.committed[seat] += pay;
    h.streetBet[seat] = target;
    const size = target - h.currentBet;
    const did =
      h.currentBet === 0 ? verb(m, seat, 'bets', 'bet') : verb(m, seat, 'raises to', 'raise to');
    // A full raise re-opens the betting for everyone. A short all-in raise
    // (less than the last full raise) does not: seats that already acted
    // must still call the extra chips or fold, but may not re-raise.
    const full = size >= h.lastRaise;
    if (full) h.lastRaise = size;
    h.currentBet = target;
    h.lastAggressor = seat;
    h.aggressorByStreet[STREETS.indexOf(h.street)] = seat;
    if (!h.noReraise) h.noReraise = h.acted.map(() => false);
    for (let i = 0; i < h.acted.length; i++) {
      if (i === seat) continue;
      if (full) {
        h.acted[i] = false;
        h.noReraise[i] = false;
      } else if (h.acted[i]) h.noReraise[i] = true;
    }
    say(m, `${label} ${did} ${fmtChips(target)}${s.stack === 0 ? ' — ALL IN' : ''}.`);
    // Bait: a raise after a Bait cast refunds its chips.
    for (const c of h.casts) {
      if (
        c.street === h.street &&
        !c.baitRefunded &&
        c.chipsPaid > 0 &&
        c.seat !== seat &&
        hasModRef(c, 'Bait')
      ) {
        c.baitRefunded = true;
        const got = takeFromPot(m, c.seat, c.chipsPaid);
        say(
          m,
          `Bait: ${seatName(m, c.seat)} ${verb(m, c.seat, 'takes', 'take')} back ${fmtChips(got)}.`,
        );
      }
    }
  }
  h.acted[seat] = true;
  const tally = (m.aggro ??= m.seats.map(() => ({ actions: 0, raises: 0 })))[seat];
  tally.actions++;
  if (kind === 'raise') tally.raises++;
  if (kind === 'raise') openRaiseWindow(m, seat);
  if (!h.pending) advance(m);
}

function hasModRef(c: CastRecord, kw: Keyword): boolean {
  return c.mods.some((x) => x.kw === kw);
}

/** Move the action on after a betting action or a closed window. */
function advance(m: Match): void {
  const h = m.hand!;
  if (h.done || h.pending) return;
  if (liveCount(h) <= 1) {
    finishHand(m);
    return;
  }
  if (!anyoneMustAct(m)) {
    endStreet(m);
    return;
  }
  const owes = (i: number) => canBet(m, h, i) && (!h.acted[i] || h.streetBet[i] < h.currentBet);
  // A cast or a closed window does not use up the turn: the actor keeps it
  // until they bet, check, call or fold.
  if (h.toAct !== null && owes(h.toAct)) return;
  const dir = h.rule.id === 'reverseOrder' ? -1 : 1;
  const from = h.toAct ?? h.button;
  h.toAct = nextSeat(m, from, owes, dir);
  if (h.toAct === null) endStreet(m);
}

function endStreet(m: Match): void {
  const h = m.hand!;
  // Street-scoped states end.
  for (let i = 0; i < h.holes.length; i++) for (const c of h.holes[i]) c.blinded = false;
  h.locked.fill(false);
  h.hostileHit.fill(false);
  h.eventsThisStreet.fill(0);
  for (const c of h.casts) c.veiled = false;
  const last: Street = h.rule.id === 'shortBoard' ? 'turn' : 'river';
  if (h.street === last) {
    finishHand(m);
    return;
  }
  const next = STREETS[STREETS.indexOf(h.street) + 1];
  goToStreet(m, next);
}

function burnAndDeal(h: Hand, count: number): PCard[] {
  h.burn.push(dealCard(h));
  const out: PCard[] = [];
  for (let k = 0; k < count; k++) out.push(dealCard(h));
  return out;
}

function goToStreet(m: Match, street: Street): void {
  const h = m.hand!;
  h.street = street;
  h.streetBet.fill(0);
  h.acted.fill(false);
  h.noReraise?.fill(false);
  h.overbet?.fill(0);
  h.currentBet = 0;
  h.lastRaise = h.bb;
  if (street === 'flop') {
    const flop = burnAndDeal(h, 3);
    if (h.rule.id === 'fog') flop[1 + R(m).int(2)].facedown = true;
    h.board.push(...flop);
  } else {
    const [c] = burnAndDeal(h, 1);
    h.board.push(c);
    if (street === 'turn') for (const b of h.board) b.facedown = false;
    if (h.rule.id === 'doubleBoard') {
      if (!h.board2) h.board2 = h.board.slice(0, 3);
      const [c2] = burnAndDeal(h, 1);
      h.board2.push(c2);
    }
  }
  const shown = h.board
    .filter((c) => !c.facedown)
    .map(cardLabel)
    .join(' ');
  say(
    m,
    `${street.toUpperCase()}: ${shown}${h.board2 ? ` · second board ${h.board2.map(cardLabel).join(' ')}` : ''}`,
  );

  // Start-of-street effects: Entropic, Thriving Units, Fused casts.
  for (const t of h.entropic) {
    if (inHand(h, t)) entropicDiscard(m, t);
  }
  for (const u of h.units) {
    if (!hasKw(u.def, 'Thriving') || !inHand(h, u.seat) || !u.def.effect) continue;
    const owner = h.casts.find((c) => c.id === u.castId);
    // A folded target is untouchable: the Unit stays out but does not re-fire.
    if (owner && owner.target !== null && !inHand(h, owner.target)) continue;
    const base = u.def.effect.n ?? 1;
    u.n =
      (u.n ?? base) +
      Math.max(CHIP_KEYWORDS.has(u.def.effect.kw) ? 0.5 : 1, base * THRIVING_GROWTH);
    const cast = h.casts.find((c) => c.id === u.castId);
    if (cast) {
      say(m, `${u.def.name} thrives.`);
      applyEffect(m, cast, { kw: u.def.effect.kw, n: u.n });
    }
  }
  for (const f of h.fused) {
    f.streetsLeft--;
    if (f.streetsLeft === 0) {
      const cast = h.casts.find((c) => c.id === f.castId)!;
      if (cast.target !== null && !inHand(h, cast.target)) {
        cast.status = 'fizzled';
        say(m, `${cast.def.name} fizzles — its target folded.`);
      } else if (inHand(h, cast.seat)) {
        say(m, `${cast.def.name}'s fuse burns down.`);
        landEffect(m, cast);
      } else cast.status = 'fizzled';
    }
  }
  h.fused = h.fused.filter((f) => f.streetsLeft > 0);
  for (const seat of h.bloom.splice(0)) {
    if (!inHand(h, seat)) continue;
    // A random hole card that can still rise (an Ace can't).
    const holes = h.holes[seat];
    const can = holes.map((_, i) => i).filter((i) => holes[i].r < 14);
    if (!can.length) continue;
    const c = holes[can[R(m).int(can.length)]];
    const before = cardLabel(c);
    c.r += 1;
    say(m, `${seatName(m, seat)}'s Bloom grows.`);
    say(m, `Bloom: ${before} → ${cardLabel(c)}.`, seat);
  }

  // Pineapple: everyone still in discards one after the flop.
  if (street === 'flop' && h.rule.id === 'pineapple') {
    const queue = h.dealtIn.map((_, i) => i).filter((i) => inHand(h, i) && h.holes[i].length > 2);
    if (queue.length) {
      h.pending = {
        kind: 'choice',
        seat: queue[0],
        choice: 'pineapple',
        keep: 2,
        queue: queue.slice(1),
      };
    }
  }

  h.toAct = firstToAct(m, street);
  if (!h.pending && (h.toAct === null || !anyoneMustAct(m))) runOut(m);
}

/** Everyone is all-in (or one player left to act with nothing to call): deal
 * the rest without betting. Rerun deals the remainder twice. */
function runOut(m: Match): void {
  const h = m.hand!;
  if (h.done) return;
  if (liveCount(h) <= 1) {
    finishHand(m);
    return;
  }
  const last: Street = h.rule.id === 'shortBoard' ? 'turn' : 'river';
  if (h.rerun && !h.board2 && h.street !== last) {
    h.board2 = h.board.map((c) => c);
    say(m, 'Rerun: the rest of the board is dealt twice.');
  }
  h.toAct = null;
  while (h.street !== last && !h.done) {
    const next = STREETS[STREETS.indexOf(h.street) + 1];
    const hadBoard2 = !!h.board2 && h.rule.id !== 'doubleBoard';
    goToStreet(m, next);
    if (hadBoard2 && h.board2 && h.board2.length < h.board.length) {
      while (h.board2.length < h.board.length) h.board2.push(dealCard(h));
    }
    if (h.pending) return; // a choice (Pineapple) interrupts; resumes after it
  }
  if (!h.done) finishHand(m);
}

// ===========================================================================
// Showdown and pots
// ===========================================================================
function bestHand(h: Hand, seat: number, board: PCard[]): { category: number; score: number } {
  return evaluate([...h.holes[seat], ...board]);
}

function excludedFor(h: Hand, seat: number, cat: number): boolean {
  return h.exclusions[seat].includes(cat);
}

interface Pot {
  amount: number;
  eligible: number[];
}

function buildPots(h: Hand): Pot[] {
  const n = h.committed.length;
  const live = (i: number) => h.dealtIn[i] && !h.folded[i];
  const levels = [...new Set(h.committed.filter((c, i) => live(i) && c > 0))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const L of levels) {
    let amount = 0;
    for (let i = 0; i < n; i++) amount += Math.max(0, Math.min(h.committed[i], L) - prev);
    pots.push({
      amount,
      eligible: [...Array(n).keys()].filter((i) => live(i) && h.committed[i] >= L),
    });
    prev = L;
  }
  // Folded seats' chips above the top live level join the last pot.
  let extra = 0;
  for (let i = 0; i < n; i++) extra += Math.max(0, h.committed[i] - prev);
  if (pots.length === 0) pots.push({ amount: 0, eligible: [...Array(n).keys()].filter(live) });
  pots[pots.length - 1].amount += extra;
  // Dead money (power costs, drains, antes, jackpot) joins the main pot —
  // the one every live seat can win. A live seat with nothing committed
  // (a Bomb Pot ante all-in, drained to 0 before posting) would be shut out
  // of pots[0], so the dead money gets its own bottom layer instead.
  const liveSeats = [...Array(n).keys()].filter(live);
  if (
    h.dead > 0 &&
    liveSeats.some((i) => h.committed[i] === 0) &&
    pots[0].eligible.length < liveSeats.length
  )
    pots.unshift({ amount: 0, eligible: liveSeats });
  pots[0].amount += h.dead;
  // Powers can take chips out (dead < 0): absorb any deficit pot by pot.
  for (let k = 0; k < pots.length - 1; k++) {
    if (pots[k].amount < 0) {
      pots[k + 1].amount += pots[k].amount;
      pots[k].amount = 0;
    }
  }
  return pots.map((p) => ({ ...p, amount: Math.max(0, p.amount) }));
}

function winnersOf(h: Hand, eligible: number[], board: PCard[]): number[] {
  const scored = eligible.map((i) => ({ i, ...bestHand(h, i, board) }));
  const allowed = scored.filter((s) => !excludedFor(h, s.i, s.category));
  // If every contender is excluded, all exclusions are ignored.
  const pool = allowed.length > 0 ? allowed : scored;
  const top = Math.max(...pool.map((s) => s.score));
  return pool.filter((s) => s.score === top).map((s) => s.i);
}

function split(m: Match, amount: number, winners: number[], gains: number[]): void {
  if (winners.length === 0 || amount <= 0) return;
  const h = m.hand!;
  // Odd chips go to the first winner clockwise from the button.
  const ordered = [...winners].sort(
    (a, b) =>
      ((a - h.button + m.seats.length) % m.seats.length) -
      ((b - h.button + m.seats.length) % m.seats.length),
  );
  const share = Math.floor(amount / winners.length);
  let rem = amount - share * winners.length;
  for (const w of ordered) {
    const got = share + (rem > 0 ? 1 : 0);
    if (rem > 0) rem--;
    m.seats[w].stack += got;
    gains[w] += got;
  }
}

function finishHand(m: Match): void {
  const h = m.hand!;
  if (h.done) return;
  h.toAct = null;
  h.pending = null;
  const n = m.seats.length;
  const live = h.dealtIn.map((_, i) => i).filter((i) => inHand(h, i));
  const uncontested = live.length === 1;
  const gains = new Array(n).fill(0);
  const shown: Record<number, string> = {};
  const potResults: PotResult[] = [];

  // House Rake: the dealer collects from the pot before it is awarded.
  if (h.rule.id === 'houseRake' && h.dealtIn[h.button]) {
    const rake = Math.min(Math.round((h.rule.param ?? 1) * UNIT), Math.max(0, potTotal(h)));
    h.dead -= rake;
    m.seats[h.button].stack += rake;
    gains[h.button] += rake;
    say(
      m,
      `House Rake: ${seatName(m, h.button)} ${verb(m, h.button, 'collects', 'collect')} ${fmtChips(rake)}.`,
    );
  }

  let winnersAll: number[] = [];
  if (uncontested) {
    const w = live[0];
    const pot = potTotal(h);
    // Bulwark: the folded seats can claw back before the winner takes it.
    applyRefunds(m, [w], gains, false);
    const amount = potTotal(h);
    m.seats[w].stack += amount;
    gains[w] += amount;
    h.dead -= amount; // pot emptied
    potResults.push({ amount: pot, winners: [w], eligible: [w] });
    winnersAll = [w];
    say(m, `${seatName(m, w)} ${verb(m, w, 'wins', 'win')} ${fmtChips(amount)} uncontested.`);
    // Nerve: a successful bluff.
    if (!madeHand(h, w)) adjustNerve(m, w, NERVE.bluffWin, 'bluff got through');
  } else {
    // Determine pot winners before refunds so Bulwark/Insurance know who lost.
    const boards: { b: PCard[]; tag?: 1 | 2 }[] = h.board2
      ? [
          { b: h.board, tag: 1 },
          { b: h.board2, tag: 2 },
        ]
      : [{ b: h.board }];
    const prelim = buildPots(h);
    const winnerSet = new Set<number>();
    for (const p of prelim)
      for (const bd of boards) for (const w of winnersOf(h, p.eligible, bd.b)) winnerSet.add(w);
    applyRefunds(m, [...winnerSet], gains, true);
    const pots = buildPots(h);
    for (const p of pots) {
      if (p.amount <= 0) continue;
      if (boards.length === 2) {
        const half = Math.floor(p.amount / 2);
        const parts = [half, p.amount - half];
        boards.forEach((bd, k) => {
          const ws = winnersOf(h, p.eligible, bd.b);
          split(m, parts[k], ws, gains);
          potResults.push({ amount: parts[k], winners: ws, eligible: p.eligible, board: bd.tag });
          winnersAll.push(...ws);
        });
      } else {
        const ws = winnersOf(h, p.eligible, h.board);
        split(m, p.amount, ws, gains);
        potResults.push({ amount: p.amount, winners: ws, eligible: p.eligible });
        winnersAll.push(...ws);
      }
    }
    h.dead = 0;
    h.committed.fill(0);
    winnersAll = [...new Set(winnersAll)];
    // Showdown: winners show; losers muck unless Open Table, or they were
    // the last aggressor (they must show to claim — and get caught).
    const lastAgg = [...h.aggressorByStreet].reverse().find((x) => x !== null) ?? null;
    for (const i of live) {
      const mustShow = winnersAll.includes(i) || h.rule.id === 'openTable' || i === lastAgg;
      const desc = describeSeatHand(h, i, h.board);
      if (mustShow) {
        shown[i] = desc;
        for (const c of h.holes[i]) c.public = true;
      }
    }
    for (const r of potResults) {
      const names = r.winners.map(
        (w) => `${seatName(m, w)} (${describeSeatHand(h, w, r.board === 2 ? h.board2! : h.board)})`,
      );
      say(
        m,
        `${names.join(' & ')} ${r.winners.length === 1 ? verb(m, r.winners[0], 'wins', 'win') : 'win'} ${fmtChips(r.amount)}${r.board ? ` on board ${r.board}` : ''}.`,
      );
    }
    for (const w of winnersAll) adjustNerve(m, w, NERVE.winShowdown, 'won at showdown');
    if (lastAgg !== null && !winnersAll.includes(lastAgg) && !madeHand(h, lastAgg))
      adjustNerve(m, lastAgg, NERVE.caughtBluff, 'caught bluffing');
  }

  // Post-pot effects.
  for (const v of h.venom) {
    if (winnersAll.includes(v.to) && v.to !== v.from && !m.seats[v.from].busted) {
      const paid = transfer(m, v.to, v.from, Math.round(v.n * UNIT));
      gains[v.to] -= paid;
      gains[v.from] += paid;
      if (paid)
        say(
          m,
          `Venomous: ${seatName(m, v.to)} ${verb(m, v.to, 'pays', 'pay')} ${seatName(m, v.from)} ${fmtChips(paid)}.`,
        );
    }
  }
  for (const g of h.gambit) {
    if (!winnersAll.includes(g.seat) && winnersAll.length) {
      const paid = transfer(m, g.seat, winnersAll[0], Math.round(g.owed * GAMBIT_OWED));
      gains[g.seat] -= paid;
      gains[winnersAll[0]] += paid;
      if (paid)
        say(
          m,
          `Gambit lost: ${seatName(m, g.seat)} ${verb(m, g.seat, 'pays', 'pay')} ${seatName(m, winnersAll[0])} ${fmtChips(paid)}.`,
        );
    }
  }
  for (const b of h.bounty) {
    if (
      m.seats[b.to].stack === 0 &&
      winnersAll.length &&
      b.from !== winnersAll[0] &&
      m.seats[b.from].stack > 0
    ) {
      const paid = transfer(m, winnersAll[0], b.from, Math.round(b.n * UNIT));
      if (paid)
        say(
          m,
          `Bounty: ${seatName(m, b.from)} ${verb(m, b.from, 'collects', 'collect')} ${fmtChips(paid)}.`,
        );
    }
  }

  // Boat Bonus: a showdown win with a full house or better collects N from
  // every other seat still in the hand.
  if (!uncontested) {
    for (const c of h.casts) {
      const mod = c.mods.find((x) => x.kw === 'Boat Bonus');
      if (!mod || c.status !== 'resolved' || c.feinted || !winnersAll.includes(c.seat)) continue;
      const boards = h.board2 ? [h.board, h.board2] : [h.board];
      const cat = Math.max(...boards.map((b) => bestHand(h, c.seat, b).category));
      if (cat < 6) continue;
      for (const i of live) {
        if (i === c.seat) continue;
        const paid = transfer(m, i, c.seat, Math.round((mod.n ?? 1) * UNIT));
        gains[i] -= paid;
        gains[c.seat] += paid;
        if (paid)
          say(
            m,
            `Boat Bonus: ${seatName(m, i)} ${verb(m, i, 'pays', 'pay')} ${seatName(m, c.seat)} ${fmtChips(paid)}.`,
          );
      }
    }
  }

  // End of hand: Units, Charms and Tools discard; Soulbound cards and
  // Weapons go back to hand (once a hand — not straight after each use).
  for (const r of h.returning ?? []) m.seats[r.seat].hand.push({ uid: r.uid, def: r.def });
  h.returning = [];
  for (const u of h.units) {
    const inst = { uid: u.uid, def: u.def };
    if (hasKw(u.def, 'Soulbound')) m.seats[u.seat].hand.push(inst);
    else discardPower(m, u.seat, inst);
  }
  h.units = [];

  const delta = m.seats.map((s, i) => s.stack - h.stackAtStart[i]);
  h.result = { shown, pots: potResults, delta, uncontested, winners: winnersAll };
  h.done = true;
  m.history.push({
    no: h.no,
    location: h.location.card.name,
    board: h.board.map(cardLabel).join(' '),
    summary:
      winnersAll.map((w) => `${seatName(m, w)} +${fmtChips(Math.max(0, delta[w]))}`).join(', ') ||
      'no winner',
  });

  // Busts: seats at zero are out. Same-hand busts rank by starting stack.
  const busted = m.seats
    .filter((s) => !s.busted && s.stack <= 0 && h.dealtIn[s.idx])
    .sort((a, b) => h.stackAtStart[a.idx] - h.stackAtStart[b.idx]);
  for (const s of busted) {
    s.busted = true;
    s.bustOrder = ++m.bustCount;
    say(m, `${s.name} ${verb(m, s.idx, 'is', 'are')} out.`);
  }
  m.phase = 'between';
  const alive = aliveSeats(m);
  if (alive.length <= 1 || m.clockMs >= modeOf(m).capMs) endMatch(m, alive.length > 1);
}

function applyRefunds(m: Match, winners: number[], gains: number[], showdown: boolean): void {
  const h = m.hand!;
  for (let i = 0; i < m.seats.length; i++) {
    if (!h.dealtIn[i] || winners.includes(i)) continue;
    let claim = 0;
    if (h.bulwark[i] > 0) claim += Math.round(h.bulwark[i] * UNIT);
    if (showdown && h.insurance[i] > 0 && m.seats[i].stack === 0)
      claim += Math.round(h.insurance[i] * UNIT);
    claim = Math.min(claim, h.committed[i] + h.powerPaid[i]);
    if (claim <= 0) continue;
    const got = takeFromPot(m, i, claim);
    gains[i] += got;
    if (got)
      say(
        m,
        `${seatName(m, i)} ${verb(m, i, 'recovers', 'recover')} ${fmtChips(got)} (${h.bulwark[i] ? 'Bulwark' : 'Insurance'}).`,
      );
  }
}

/** Does this seat's hand beat the board alone (a real holding, not air)? */
function madeHand(h: Hand, seat: number): boolean {
  const board = h.board.filter((c) => !c.facedown);
  if (board.length < 3) return preflopStrength(h.holes[seat]) >= 0.5;
  const mine = evaluate([...h.holes[seat], ...board]);
  const boardOnly = board.length >= 5 ? evaluate(board) : { category: -1, score: -1 };
  return mine.category >= 1 && mine.score > boardOnly.score;
}

function describeSeatHand(h: Hand, seat: number, board: PCard[]): string {
  const cards = [...h.holes[seat], ...board];
  if (cards.length < 5) return 'Hole cards';
  return CATEGORY_NAMES[evaluate(cards).category];
}

function noteStrongFold(m: Match, seat: number): void {
  const h = m.hand!;
  const strong =
    h.street === 'preflop'
      ? preflopStrength(h.holes[seat]) >= NERVE.strongFoldEquity
      : evaluate([...h.holes[seat], ...h.board]).category >= 2;
  if (strong) adjustNerve(m, seat, NERVE.strongFold, 'folded a strong hand');
}

function endMatch(m: Match, byClock: boolean): void {
  m.phase = 'over';
  m.capped = byClock;
  // Stack ties at the clock break on the stack at the start of the final
  // hand, then on a seeded draw (never on seat index, which would always
  // favour seat 0, the human).
  const startStack = (i: number) => m.hand?.stackAtStart[i] ?? 0;
  const rng = R(m);
  const draw = m.seats.map(() => rng.next());
  const alive = m.seats
    .filter((s) => !s.busted)
    .sort(
      (a, b) =>
        b.stack - a.stack || startStack(b.idx) - startStack(a.idx) || draw[a.idx] - draw[b.idx],
    );
  const out = m.seats
    .filter((s) => s.busted)
    .sort((a, b) => (b.bustOrder ?? 0) - (a.bustOrder ?? 0));
  m.placements = [...alive, ...out].map((s) => s.idx);
  m.placements.forEach((idx, k) => (m.seats[idx].place = k + 1));
  say(
    m,
    byClock
      ? `Time! Stacks are ranked: ${seatName(m, m.placements[0])} ${verb(m, m.placements[0], 'takes', 'take')} first.`
      : `${seatName(m, m.placements[0])} ${verb(m, m.placements[0], 'wins', 'win')} the freezeout!`,
  );
}

// ===========================================================================
// Powers: costs
// ===========================================================================
export interface CastCost {
  step: number;
  chips: number;
  /** Non-chip costs the caster must also choose (shed / debuff / exclude). */
  extra: number;
  /** Gambit: chips owed double on a loss instead of paid now. */
  gambitOwed: number;
}

function unitsOut(h: Hand, seat: number): UnitToken[] {
  return h.units.filter((u) => u.seat === seat);
}

export function castCost(m: Match, seat: number, def: CardDef): CastCost {
  const h = m.hand!;
  const s = m.seats[seat];
  const tier = def.tier ?? 1;
  let step = tier;
  if (def.type === 'Item' && unitsOut(h, seat).length === 0) step += ITEM_UNBONDED_STEP;
  if (hasKw(def, 'Surge') && h.castCount[seat] > 0) step -= 1;
  if (hasKw(def, 'Soulbound')) step += SOULBOUND_STEP;
  if (hasKw(def, 'Resonant')) step += RESONANT_STEP;
  if (h.rule.id === 'happyHour') step -= 1;
  if (tilted(s)) step += TILT_STEP;
  if (h.buffSeat === seat && !h.buffUsed) step -= 1;
  step = Math.max(0, Math.min(COST_LADDER_UNITS.length - 1, step));
  let chips = Math.round(COST_LADDER_UNITS[step] * UNIT);
  let extra = tier >= SECOND_COST_TIER ? 1 : 0;
  let gambitOwed = 0;
  // Last Stand: no chips while the seat is down to 10 big blinds or less.
  if (hasKw(def, 'Last Stand') && s.stack <= LAST_STAND_BB * h.bb) chips = 0;
  if (hasKw(def, 'Gambit')) {
    gambitOwed = chips;
    chips = 0;
  }
  const cap = Math.floor(s.stack * STACK_CAP_SHARE);
  if (chips > cap) {
    chips = cap;
    extra += 1;
  }
  return { step, chips, extra, gambitOwed };
}

/** Categories this seat may exclude right now (attainable, not yet named). */
export function excludableCategories(m: Match, seat: number): number[] {
  const h = m.hand!;
  if (h.exclusions[seat].length >= MAX_EXCLUSIONS) return [];
  // Attainability as the seat itself can judge it: a Fog card still face-down
  // and a hole card it has blinded are unknown to it (and are r = 0 in its
  // view), so the engine and every seat's view agree on the options.
  const known = (c: PCard) => c.r !== 0 && !c.facedown && !c.blinded;
  const board = h.board.filter(known);
  const last = h.rule.id === 'shortBoard' ? 4 : 5;
  const can = attainableCategories(h.holes[seat].filter(known), board, last - board.length);
  return EXCLUDABLE.filter((c) => can.has(c) && !h.exclusions[seat].includes(c));
}

function validateExtra(
  m: Match,
  seat: number,
  uid: string | null,
  extra: ExtraCost[],
  need: number,
): void {
  const h = m.hand!;
  if (extra.length !== need) throw new IllegalAction(`This cast needs ${need} non-chip cost(s)`);
  const shed = new Set<string>();
  const debuffed = new Set<number>();
  const excluded = new Set<number>();
  const can = need > 0 ? excludableCategories(m, seat) : [];
  for (const e of extra) {
    if (e.kind === 'shed') {
      if (e.uid === uid || shed.has(e.uid) || !m.seats[seat].hand.some((p) => p.uid === e.uid))
        throw new IllegalAction('Shed another power card from your hand');
      shed.add(e.uid);
    } else if (e.kind === 'debuff') {
      const c = h.holes[seat][e.hole];
      if (!c || c.blinded || debuffed.has(e.hole))
        throw new IllegalAction('Pick a hole card to blind');
      debuffed.add(e.hole);
    } else {
      if (!can.includes(e.category) || excluded.has(e.category))
        throw new IllegalAction('That hand category cannot be excluded');
      excluded.add(e.category);
    }
  }
  if (h.exclusions[seat].length + excluded.size > MAX_EXCLUSIONS)
    throw new IllegalAction('At most two exclusions per hand');
}

function payExtra(m: Match, seat: number, extra: ExtraCost[]): void {
  const h = m.hand!;
  const s = m.seats[seat];
  for (const e of extra) {
    if (e.kind === 'shed') {
      const k = s.hand.findIndex((p) => p.uid === e.uid);
      const [inst] = s.hand.splice(k, 1);
      discardPower(m, seat, inst);
      say(m, `${s.name} ${verb(m, seat, 'sheds', 'shed')} ${inst.def.name}.`);
    } else if (e.kind === 'debuff') {
      h.holes[seat][e.hole].blinded = true;
      say(
        m,
        `${s.name} ${verb(m, seat, 'blinds', 'blind')} one of ${their(m, seat)} hole cards for the street.`,
      );
    } else {
      h.exclusions[seat].push(e.category);
      say(
        m,
        `${s.name} ${verb(m, seat, 'excludes', 'exclude')} ${CATEGORY_NAMES[e.category]} — ${isYou(m, seat) ? 'you' : 'they'} cannot win a showdown with it.`,
      );
    }
  }
}

/** How many non-chip cost options a seat has available (shed + debuff + exclude). */
export function extraOptions(m: Match, seat: number, uid: string | null): number {
  const h = m.hand!;
  const sheds = m.seats[seat].hand.filter((p) => p.uid !== uid).length;
  const debuffs = h.holes[seat].filter((c) => !c.blinded).length;
  const excl = Math.min(
    excludableCategories(m, seat).length,
    Math.max(0, MAX_EXCLUSIONS - h.exclusions[seat].length),
  );
  return sheds + debuffs + excl;
}

// ===========================================================================
// Powers: legality
// ===========================================================================
export function isQuick(def: CardDef): boolean {
  return (def.type === 'Event' && def.subtype === 'Quick') || hasKw(def, 'Ambush');
}

function responseAllowed(h: Hand, def: CardDef): boolean {
  if (h.rule.id === 'silentTable') return false;
  if (h.rule.id === 'nightGame' && def.type === 'Event' && def.subtype === 'Quick') {
    return hasKw(def, 'Ambush');
  }
  return isQuick(def);
}

export function lastCastForMimic(h: Hand): CastRecord | null {
  for (let k = h.casts.length - 1; k >= 0; k--) {
    const c = h.casts[k];
    if (c.effect.kw !== 'Mimic' && c.effect.kw !== 'Snuff' && c.effect.kw !== 'Call Out') return c;
  }
  return null;
}

/** The effect this card will actually produce (Mimic borrows the last cast's). */
export function effectiveEffect(h: Hand, def: CardDef): KwRef | null {
  if (!def.effect) return null;
  if (def.effect.kw === 'Mimic') {
    const last = lastCastForMimic(h);
    return last ? { ...last.effect } : null;
  }
  return def.effect;
}

export function needsOpponentTarget(h: Hand, def: CardDef): boolean {
  const eff = effectiveEffect(h, def);
  if (def.type === 'Item' && def.subtype === 'Tool') return true;
  if (!eff) return false;
  if (hasKw(def, 'Roulette')) return false;
  return KEYWORD_SPECS[eff.kw].target === 'opponent';
}

const READ_EFFECTS = new Set<Keyword>(['Peek', 'Mark', 'Reveal', 'Tell']);

function wardedAgainstRead(h: Hand, seat: number): boolean {
  return h.units.some((u) => u.seat === seat && hasKw(u.def, 'Warded'));
}

/** Was `target` hit this street by a Veiled hostile cast that `viewer` did
 * not make (so the viewer's own view does not show the hit)? */
export function veiledHit(h: Hand, target: number, viewer: number): boolean {
  return h.casts.some(
    (c) =>
      c.veiled &&
      c.target === target &&
      c.seat !== viewer &&
      target !== viewer &&
      KEYWORD_SPECS[c.effect.kw].hostile,
  );
}

/** Seats this caster may target with a hostile/opponent effect. */
export function legalTargets(m: Match, seat: number, def: CardDef): number[] {
  const h = m.hand!;
  const eff = effectiveEffect(h, def);
  return h.dealtIn
    .map((_, i) => i)
    .filter((i) => i !== seat && inHand(h, i))
    .filter((i) => {
      const hostile = eff ? KEYWORD_SPECS[eff.kw].hostile : false;
      if (hostile && h.hostileHit[i]) return false;
      if (eff && READ_EFFECTS.has(eff.kw) && wardedAgainstRead(h, i)) return false;
      return true;
    });
}

/** Casts a Call Out / Snuff may point at. */
export function castTargets(m: Match, seat: number, def: CardDef): CastRecord[] {
  const h = m.hand!;
  if (def.effect?.kw === 'Snuff') {
    const p = h.pending;
    if (p?.kind !== 'response') return [];
    const c = h.casts.find((x) => x.id === p.castId);
    return c && !hasModRef(c, 'Warded') && c.seat !== seat ? [c] : [];
  }
  if (def.effect?.kw === 'Call Out') {
    return h.casts.filter(
      (c) =>
        c.seat !== seat &&
        c.status === 'resolved' &&
        !c.calledOut &&
        !hasModRef(c, 'Warded') &&
        !c.leader,
    );
  }
  return [];
}

/** A "No legal target" the actor's own view could not have predicted. */
function hiddenCode(m: Match, seat: number, check: CastCheck): 'hiddenTarget' | undefined {
  const h = m.hand!;
  if (check.why !== 'No legal target') return undefined;
  return h.dealtIn.some((_, i) => veiledHit(h, i, seat)) ? 'hiddenTarget' : undefined;
}

export interface CastCheck {
  ok: boolean;
  why?: string;
  cost?: CastCost;
}

/** Can `seat` cast power `uid` right now? (Targets and costs are checked
 * again when the cast is made.) */
export function canCast(m: Match, seat: number, uid: string): CastCheck {
  const h = m.hand;
  if (!h || h.done || m.phase !== 'hand') return { ok: false, why: 'No hand in progress' };
  const s = m.seats[seat];
  const inst = s.hand.find((p) => p.uid === uid);
  if (!inst) return { ok: false, why: 'Not in your hand' };
  const def = inst.def;
  if (!inHand(h, seat)) return { ok: false, why: 'Folded players cannot cast' };
  if (h.locked[seat]) return { ok: false, why: 'Locked this street' };
  const p = h.pending;
  if (p?.kind === 'choice') return { ok: false, why: 'Waiting on a choice' };
  if (p) {
    if (!p.seats.includes(seat)) return { ok: false, why: 'Not your window' };
    if (!responseAllowed(h, def))
      return { ok: false, why: 'Only Quick Events and Ambush cards respond' };
    if (def.effect?.kw === 'Snuff' && p.kind !== 'response')
      return { ok: false, why: 'Snuff answers a cast' };
  } else {
    if (h.toAct !== seat) return { ok: false, why: 'Not your turn' };
    if (def.effect?.kw === 'Snuff') return { ok: false, why: 'Snuff can only answer a cast' };
    if (h.rule.id === 'nightGame' && def.type === 'Event' && def.subtype === 'Quick')
      return { ok: false, why: 'Night Game: no Quick Events' };
    if (h.rule.id === 'silentTable' && def.type === 'Event' && def.subtype === 'Quick')
      return { ok: false, why: 'Silent Table: no Quick Events' };
    if (def.type === 'Event' && def.subtype === 'Slow' && h.acted[seat])
      return { ok: false, why: 'Slow Events go before you act on a street' };
  }
  // Caps per hand.
  if (def.type === 'Unit') {
    const out = unitsOut(h, seat);
    const stars = out.reduce((a, u) => a + (u.def.tier ?? 0), 0);
    if (out.length >= CAPS.unitCount) return { ok: false, why: 'Two Units already out' };
    if (stars + (def.tier ?? 0) > CAPS.unitStars)
      return { ok: false, why: 'Units cap at 5 stars a hand' };
  } else if (def.type === 'Item') {
    if (h.itemCount[seat] >= CAPS.itemCount)
      return { ok: false, why: 'Two Items already this hand' };
    if (h.itemGears[seat] + (def.tier ?? 0) > CAPS.itemGears)
      return { ok: false, why: 'Items cap at 5 gears a hand' };
  } else if (def.type === 'Event') {
    if (h.eventsThisStreet[seat] >= CAPS.eventsPerStreet)
      return { ok: false, why: 'Two Events already this street' };
    if (h.eventBolts[seat] + (def.tier ?? 0) > CAPS.eventBolts)
      return { ok: false, why: 'Events cap at 5 bolts a hand' };
  }
  const eff = effectiveEffect(h, def);
  if (!eff) return { ok: false, why: 'Nothing to copy yet' };
  if (eff.kw === 'Straddle') {
    if (
      h.street !== 'preflop' ||
      h.currentBet !== h.bb ||
      h.lastAggressor !== null ||
      h.acted[seat] ||
      h.straddler !== null
    )
      return { ok: false, why: 'Straddle: pre-flop, before any raise or action' };
  }
  if ((eff.kw === 'Redraw' || eff.kw === 'Windfall') && h.deck.length < 8)
    return { ok: false, why: 'Deck too thin' };
  if (eff.kw === 'Exhume' && h.muck.length === 0)
    return { ok: false, why: 'Nothing in the muck yet' };
  if (needsOpponentTarget(h, def) && legalTargets(m, seat, def).length === 0)
    return { ok: false, why: 'No legal target' };
  if ((eff.kw === 'Call Out' || eff.kw === 'Snuff') && castTargets(m, seat, def).length === 0)
    return { ok: false, why: 'No cast to answer' };
  const cost = castCost(m, seat, def);
  if (cost.extra > 0 && extraOptions(m, seat, uid) < cost.extra)
    return { ok: false, why: 'Cannot pay the second cost' };
  return { ok: true, cost };
}

// ===========================================================================
// Powers: casting
// ===========================================================================
function cast(m: Match, a: Extract<Action, { type: 'cast' }>): void {
  const h = m.hand!;
  const check = canCast(m, a.seat, a.uid);
  if (!check.ok) throw new IllegalAction(check.why ?? 'Cannot cast', hiddenCode(m, a.seat, check));
  const s = m.seats[a.seat];
  const k = s.hand.findIndex((p) => p.uid === a.uid);
  const inst = s.hand[k];
  const def = inst.def;
  const cost = check.cost!;
  const eff = effectiveEffect(h, def)!;
  // Targets.
  let target: number | null = null;
  if (needsOpponentTarget(h, def)) {
    if (a.target == null || !legalTargets(m, a.seat, def).includes(a.target)) {
      if (a.target != null && veiledHit(h, a.target, a.seat))
        throw new IllegalAction('No legal target', 'hiddenTarget');
      throw new IllegalAction('Pick a legal target');
    }
    target = a.target;
  }
  let targetCast: number | null = null;
  if (eff.kw === 'Call Out' || eff.kw === 'Snuff') {
    const opts = castTargets(m, a.seat, def);
    const pickId = a.targetCast ?? opts[opts.length - 1]?.id;
    if (!opts.some((c) => c.id === pickId)) throw new IllegalAction('Pick a cast to answer');
    targetCast = pickId!;
  }
  validateExtra(m, a.seat, a.uid, a.costs ?? [], cost.extra);
  if (a.feint && !hasKw(def, 'Feint'))
    throw new IllegalAction('Only Feint cards can fizzle on purpose');

  // Pay: the card leaves the hand, chips go into the pot (Jackpot Pit: the jackpot).
  s.hand.splice(k, 1);
  payExtra(m, a.seat, a.costs ?? []);
  let paid = 0;
  if (cost.chips > 0) {
    paid = Math.min(cost.chips, s.stack);
    s.stack -= paid;
    if (h.rule.id === 'jackpotPit') m.jackpot += paid;
    else h.dead += paid;
    h.powerPaid[a.seat] += paid;
  }
  if (h.buffSeat === a.seat) h.buffUsed = true;
  if (cost.gambitOwed) h.gambit.push({ seat: a.seat, owed: cost.gambitOwed });
  h.castCount[a.seat]++;
  if (def.type === 'Item') {
    h.itemCount[a.seat]++;
    h.itemGears[a.seat] += def.tier ?? 0;
  } else if (def.type === 'Event') {
    h.eventsThisStreet[a.seat]++;
    h.eventBolts[a.seat] += def.tier ?? 0;
  }
  const isResponse = !!h.pending;
  const rec: CastRecord = {
    id: ++m.castSeq,
    seat: a.seat,
    uid: a.uid,
    def,
    effect: { ...eff },
    mods: [...(def.mods ?? [])],
    street: h.street,
    target,
    targetCast,
    chipsPaid: paid,
    extra: a.costs ?? [],
    status: 'pending',
    feinted: !!a.feint,
    veiled: hasKw(def, 'Veil') && target !== null,
    response: isResponse,
  };
  h.casts.push(rec);
  if (def.type === 'Unit') h.units.push({ uid: inst.uid, def, seat: a.seat, castId: rec.id });
  const at = rec.veiled
    ? ' at a hidden target'
    : target !== null
      ? ` at ${seatName(m, target)}`
      : '';
  const price = paid ? ` for ${fmtChips(paid)}` : cost.gambitOwed ? ' on a Gambit' : '';
  say(
    m,
    `${s.name} ${verb(m, a.seat, 'casts', 'cast')} ${def.name} (${def.effect ? keywordLabel(def.effect.kw, def.effect.n) : ''})${at}${price}.`,
  );
  if (target !== null && h.toll[target] > 0 && KEYWORD_SPECS[eff.kw].hostile) {
    const tollPaid = transfer(m, a.seat, target, Math.round(h.toll[target] * UNIT));
    if (tollPaid)
      sayTargeted(
        m,
        rec,
        () =>
          `Toll: ${s.name} ${verb(m, a.seat, 'pays', 'pay')} ${seatName(m, target)} ${fmtChips(tollPaid)}.`,
      );
  }
  if (target !== null && KEYWORD_SPECS[eff.kw].hostile) h.hostileHit[target] = true;

  // Card destination now that it is cast: Units stay out as tokens (to the
  // discard at hand end); Weapons and Soulbound cards return to hand on
  // resolution; everything else discards on resolution.
  if (isResponse) {
    // No responses to responses: it resolves at once. The responder leaves
    // the window first — a response that opens a choice (Redraw, Exhume)
    // defers the window, and it must come back without them in it.
    const p = h.pending;
    if (p && p.kind !== 'choice') p.seats = p.seats.filter((x) => x !== a.seat);
    const closeAfter = !!p && p.kind !== 'choice' && p.seats.length === 0;
    resolveCast(m, rec);
    if (closeAfter && h.pending === p) closeWindow(m);
    return;
  }
  openResponseWindow(m, rec);
}

function leaderAbility(m: Match, a: Extract<Action, { type: 'leader' }>): void {
  const h = m.hand!;
  const check = canUseLeader(m, a.seat, a.ability);
  if (!check.ok)
    throw new IllegalAction(check.why ?? 'Cannot use Leader', hiddenCode(m, a.seat, check));
  const s = m.seats[a.seat];
  const ab = s.leader.abilities![a.ability];
  let target: number | null = null;
  if (KEYWORD_SPECS[ab.effect.kw].target === 'opponent') {
    const pseudo = leaderPseudoDef(s.leader, a.ability);
    if (a.target == null || !legalTargets(m, a.seat, pseudo).includes(a.target)) {
      if (a.target != null && veiledHit(h, a.target, a.seat))
        throw new IllegalAction('No legal target', 'hiddenTarget');
      throw new IllegalAction('Pick a legal target');
    }
    target = a.target;
  }
  h.leaderUsed[a.seat] = true;
  if (ab.nerve < 0) adjustNerve(m, a.seat, ab.nerve);
  else adjustNerve(m, a.seat, ab.nerve, 'Leader ability');
  let paid = 0;
  if (ab.chipCost) {
    paid = payIntoPot(m, a.seat, Math.round(ab.chipCost * UNIT));
    h.powerPaid[a.seat] += paid;
  }
  const rec: CastRecord = {
    id: ++m.castSeq,
    seat: a.seat,
    uid: `leader:${a.ability}`,
    def: s.leader,
    effect: { ...ab.effect },
    mods: ab.mods ?? [],
    street: h.street,
    target,
    targetCast: null,
    chipsPaid: paid,
    extra: [],
    status: 'pending',
    leader: true,
  };
  h.casts.push(rec);
  if (target !== null && KEYWORD_SPECS[ab.effect.kw].hostile) h.hostileHit[target] = true;
  say(
    m,
    `${s.name} ${verb(m, a.seat, 'uses', 'use')} ${their(m, a.seat)} Leader: ${ab.text}${target !== null ? ` → ${seatName(m, target)}` : ''}`,
  );
  openResponseWindow(m, rec);
}

/** A stand-in CardDef for a Leader ability (targeting rules read the effect). */
export function leaderPseudoDef(leader: CardDef, i: number): CardDef {
  const ab = leader.abilities![i];
  return { ...leader, type: 'Event', effect: ab.effect, mods: ab.mods ?? [], tier: 3 };
}

export function canUseLeader(m: Match, seat: number, i: number): CastCheck {
  const h = m.hand;
  if (!h || h.done) return { ok: false, why: 'No hand in progress' };
  const s = m.seats[seat];
  const ab = s.leader.abilities?.[i];
  if (!ab) return { ok: false, why: 'No such ability' };
  if (!inHand(h, seat)) return { ok: false, why: 'Folded' };
  if (h.pending || h.toAct !== seat) return { ok: false, why: 'On your turn' };
  if (h.leaderUsed[seat]) return { ok: false, why: 'One Leader ability per hand' };
  if (tilted(s)) return { ok: false, why: 'Tilted: Leader locked until nerve recovers' };
  if (h.locked[seat]) return { ok: false, why: 'Locked this street' };
  // Tilt Zone doubles every nerve change, the ability's cost included.
  const nerveCost = -ab.nerve * (h.rule.id === 'tiltZone' ? 2 : 1);
  if (ab.nerve < 0 && s.nerve < nerveCost) return { ok: false, why: `Needs ${nerveCost} nerve` };
  if (ab.chipCost && s.stack < ab.chipCost * UNIT) return { ok: false, why: 'Not enough chips' };
  const pseudo = leaderPseudoDef(s.leader, i);
  const kw = ab.effect.kw;
  if (
    kw === 'Straddle' &&
    (h.street !== 'preflop' ||
      h.currentBet !== h.bb ||
      h.lastAggressor !== null ||
      h.straddler !== null)
  )
    return { ok: false, why: 'Straddle: pre-flop, before any raise' };
  if (kw === 'Exhume' && h.muck.length === 0) return { ok: false, why: 'Nothing in the muck yet' };
  if ((kw === 'Windfall' || kw === 'Redraw') && h.deck.length < 8)
    return { ok: false, why: 'Deck too thin' };
  if (KEYWORD_SPECS[kw].target === 'opponent' && legalTargets(m, seat, pseudo).length === 0)
    return { ok: false, why: 'No legal target' };
  return { ok: true };
}

function eligibleResponders(m: Match, exclude: number): number[] {
  const h = m.hand!;
  return h.dealtIn
    .map((_, i) => i)
    .filter(
      (i) =>
        i !== exclude &&
        inHand(h, i) &&
        !h.locked[i] &&
        m.seats[i].hand.some((p) => responseAllowed(h, p.def) && canCastInWindow(m, i, p.uid)),
    );
}

/** Rough "could this be cast in a window" check without opening the window. */
function canCastInWindow(m: Match, seat: number, uid: string): boolean {
  const h = m.hand!;
  const saved = h.pending;
  if (!saved || saved.kind === 'choice') return false;
  h.pending = { ...saved, seats: [seat] };
  const ok = canCast(m, seat, uid).ok;
  h.pending = saved;
  return ok;
}

function openResponseWindow(m: Match, rec: CastRecord): void {
  const h = m.hand!;
  if (hasModRef(rec, 'Quickstrike')) {
    resolveCast(m, rec);
    return;
  }
  h.pending = { kind: 'response', castId: rec.id, seats: [] };
  const seats = eligibleResponders(m, rec.seat);
  if (seats.length === 0) {
    h.pending = null;
    resolveCast(m, rec);
    return;
  }
  h.pending.seats = seats;
}

function openRaiseWindow(m: Match, raiser: number): void {
  const h = m.hand!;
  h.pending = { kind: 'raiseWindow', seat: raiser, seats: [] };
  const seats = eligibleResponders(m, raiser);
  if (seats.length === 0) {
    h.pending = null;
    return;
  }
  h.pending.seats = seats;
}

function closeWindow(m: Match): void {
  const h = m.hand!;
  const p = h.pending;
  h.pending = null;
  if (p?.kind === 'response') {
    const rec = h.casts.find((c) => c.id === p.castId)!;
    resolveCast(m, rec);
  } else {
    advance(m);
  }
}

function passWindow(m: Match, seat: number): void {
  const h = m.hand!;
  const p = h.pending;
  if (!p || p.kind === 'choice' || !p.seats.includes(seat))
    throw new IllegalAction('Nothing to pass');
  p.seats = p.seats.filter((x) => x !== seat);
  if (p.seats.length === 0) closeWindow(m);
}

function resolveCast(m: Match, rec: CastRecord): void {
  const h = m.hand!;
  if (rec.status === 'snuffed') {
    afterResolve(m, rec);
    return;
  }
  // A cast whose target folded before it resolved fizzles; no refund.
  if (rec.target !== null && !inHand(h, rec.target)) {
    rec.status = 'fizzled';
    say(m, `${rec.def.name} fizzles — its target folded.`);
    afterResolve(m, rec);
    return;
  }
  const fuse = modN(rec, 'Fuse');
  if (fuse && !rec.feinted) {
    rec.status = 'fused';
    h.fused.push({ castId: rec.id, streetsLeft: fuse });
    say(m, `${rec.def.name} is fused — it lands in ${fuse} street(s).`);
    afterResolve(m, rec);
    return;
  }
  rec.status = 'resolved';
  if (rec.feinted) {
    // Looks resolved to everyone; only the caster knows it did nothing.
    say(m, `${rec.def.name} resolves.`);
    say(m, `(Feint: your ${rec.def.name} secretly fizzled.)`, rec.seat);
  } else {
    landEffect(m, rec);
  }
  afterResolve(m, rec);
}

function landEffect(m: Match, rec: CastRecord): void {
  const h = m.hand!;
  // Roulette: a random seat still in the hand — maybe the caster.
  if (hasModRef(rec, 'Roulette') && KEYWORD_SPECS[rec.effect.kw].target === 'opponent') {
    // The one-hostile-power-per-seat-per-street cap still applies: a seat
    // already hit this street is skipped (the caster can always be hit).
    const hostile = KEYWORD_SPECS[rec.effect.kw].hostile;
    const live = h.dealtIn
      .map((_, i) => i)
      .filter((i) => inHand(h, i) && (!hostile || !h.hostileHit[i] || i === rec.seat));
    rec.target = live[R(m).int(live.length)];
    say(m, `Roulette lands on ${seatName(m, rec.target)}!`);
    if (hostile && rec.target !== rec.seat) {
      h.hostileHit[rec.target] = true;
      if (h.toll[rec.target] > 0) {
        const tollPaid = transfer(m, rec.seat, rec.target, Math.round(h.toll[rec.target] * UNIT));
        if (tollPaid)
          say(
            m,
            `Toll: ${seatName(m, rec.seat)} ${verb(m, rec.seat, 'pays', 'pay')} ${seatName(m, rec.target)} ${fmtChips(tollPaid)}.`,
          );
      }
    }
  }
  const times = hasModRef(rec, 'Resonant') ? 2 : 1;
  for (let t = 0; t < times; t++) applyEffect(m, rec, rec.effect);
  if (rec.target !== null && rec.target !== rec.seat && KEYWORD_SPECS[rec.effect.kw].hostile)
    adjustNerve(m, rec.target, NERVE.hostileHit);
  // Tool: also marks one opponent hole card.
  if (rec.def.type === 'Item' && rec.def.subtype === 'Tool' && !rec.leader && rec.target !== null) {
    applyEffect(m, rec, { kw: 'Mark' });
  }
}

function afterResolve(m: Match, rec: CastRecord): void {
  const h = m.hand!;
  if (!rec.leader && rec.def.type !== 'Unit') {
    const inst = { uid: rec.uid, def: rec.def };
    const back = rec.def.subtype === 'Weapon' || hasModRef(rec, 'Soulbound');
    if (back && rec.status !== 'snuffed') (h.returning ??= []).push({ seat: rec.seat, ...inst });
    else discardPower(m, rec.seat, inst);
  }
  // Snuffed Units leave the table.
  if (rec.status === 'snuffed' && rec.def.type === 'Unit') {
    const k = h.units.findIndex((u) => u.castId === rec.id);
    if (k >= 0) {
      discardPower(m, rec.seat, { uid: h.units[k].uid, def: h.units[k].def });
      h.units.splice(k, 1);
    }
  }
  if (!h.pending) advance(m);
}

function revealToSeat(m: Match, card: PCard, seat: number): void {
  if (!card.knownTo.includes(seat)) card.knownTo.push(seat);
}

/** Pick hole cards of `target` that `seat` doesn't know yet. Decoy: the
 * first read aimed at the target only ever sees their lowest card. */
function readCards(m: Match, seat: number, target: number, count: number): PCard[] {
  const h = m.hand!;
  const holes = h.holes[target];
  if (h.decoy[target]) {
    h.decoy[target] = false;
    const low = [...holes].sort((a, b) => a.r - b.r)[0];
    say(m, `${seatName(m, target)}'s Decoy turns the read aside.`);
    return low ? [low] : [];
  }
  const unknown = holes.filter((c) => !c.public && !c.knownTo.includes(seat));
  shuffle(unknown, R(m));
  return unknown.slice(0, count);
}

function entropicDiscard(m: Match, seat: number): void {
  const s = m.seats[seat];
  if (s.hand.length === 0) return;
  const k = R(m).int(s.hand.length);
  const [inst] = s.hand.splice(k, 1);
  discardPower(m, seat, inst);
  say(m, `Entropy: ${s.name} ${verb(m, seat, 'loses', 'lose')} ${inst.def.name}.`);
}

function applyEffect(m: Match, rec: CastRecord, eff: KwRef): void {
  const h = m.hand!;
  const seat = rec.seat;
  const s = m.seats[seat];
  const t = rec.target;
  const n = eff.n ?? 1;
  const chips = Math.round(n * UNIT);
  const kw = eff.kw as EffectKeyword;
  switch (kw) {
    case 'Straddle': {
      const to = h.bb * 2;
      const pay = Math.min(to - h.streetBet[seat], s.stack);
      if (pay > 0) {
        s.stack -= pay;
        h.committed[seat] += pay;
        h.streetBet[seat] += pay;
        h.currentBet = Math.max(h.currentBet, h.streetBet[seat]);
        h.lastRaise = h.bb;
        h.straddler = seat;
        // Everyone else must act again; the straddler keeps the option.
        for (let i = 0; i < h.acted.length; i++) if (i !== seat) h.acted[i] = false;
        h.acted[seat] = false;
        say(
          m,
          `${s.name} ${verb(m, seat, 'straddles', 'straddle')} to ${fmtChips(h.streetBet[seat])} — they act last pre-flop.`,
        );
        // The straddler's turn passes; the action moves on and comes back.
        if (h.toAct === seat) {
          h.acted[seat] = true;
          h.toAct = nextSeat(m, seat, (i) => canBet(m, h, i) && !h.acted[i]);
          h.acted[seat] = false;
        }
      }
      return;
    }
    case 'Kindle': {
      if (t === null) return;
      const paid = payIntoPot(m, t, chips);
      sayTargeted(
        m,
        rec,
        () => `Kindle drains ${fmtChips(paid)} from ${seatName(m, t)} into the pot.`,
      );
      return;
    }
    case 'Erode': {
      if (t === null) return;
      const took = transfer(m, t, seat, chips);
      sayTargeted(
        m,
        rec,
        () =>
          `Erode: ${s.name} ${verb(m, seat, 'takes', 'take')} ${fmtChips(took)} from ${seatName(m, t)}.`,
      );
      return;
    }
    case 'Tax': {
      // At most three opponents: the three with the most chips in the pot
      // (ties: the bigger stack). Multiway it was the strongest effect.
      const payers = h.dealtIn
        .map((_, i) => i)
        .filter((i) => i !== seat && inHand(h, i))
        .sort((a, b) => h.committed[b] - h.committed[a] || m.seats[b].stack - m.seats[a].stack)
        .slice(0, TAX_MAX_SEATS);
      for (const i of payers) payIntoPot(m, i, chips);
      say(
        m,
        `Tax: ${payers.length > 1 ? `${payers.length} opponents ante` : `${seatName(m, payers[0] ?? seat)} ${verb(m, payers[0] ?? seat, 'antes', 'ante')}`} ${fmtChips(chips)}.`,
      );
      return;
    }
    case 'Bounty':
      if (t !== null) {
        h.bounty.push({ from: seat, to: t, n });
        sayTargeted(
          m,
          rec,
          () => `${s.name} ${verb(m, seat, 'puts', 'put')} a bounty on ${seatName(m, t)}.`,
        );
      }
      return;
    case 'Windfall': {
      const c = dealCard(h);
      h.holes[seat].push(c);
      say(m, `${s.name} ${verb(m, seat, 'takes', 'take')} a third hole card.`);
      say(m, `Windfall: you received ${cardLabel(c)}. Keep your best two.`, seat);
      queueChoice(m, {
        kind: 'choice',
        seat,
        choice: 'windfall',
        keep: h.holes[seat].length - 1,
        queue: [],
      });
      return;
    }
    case 'Redraw':
      queueChoice(m, { kind: 'choice', seat, choice: 'redraw', queue: [] });
      return;
    case 'Foresee': {
      const top = h.deck.slice(0, Math.min(n, h.deck.length));
      for (const c of top) revealToSeat(m, c, seat);
      say(m, `${s.name} ${verb(m, seat, 'looks', 'look')} at the top of the deck.`);
      say(m, `Foresee: the next card(s) are ${top.map(cardLabel).join(', ')}.`, seat);
      return;
    }
    case 'Mimic':
      // Mimic's record already holds the copied effect; nothing else to do.
      return;
    case 'Wild': {
      // A random hole card not already wild — a chance at a flush, not a
      // sure one (a hand-picked Wild turned a loser almost twice as often
      // as any other revive).
      const holes = h.holes[seat];
      const can = holes.map((_, i) => i).filter((i) => !holes[i].wild);
      if (!can.length) return;
      holes[can[R(m).int(can.length)]].wild = true;
      say(m, `${s.name} ${verb(m, seat, 'makes', 'make')} a hole card wild.`);
      return;
    }
    case 'Bloom':
      // Root grows over time: a random hole card rises when the next street
      // is dealt, so a river Bloom has nothing left to grow into.
      if (h.street === 'river') {
        say(m, `${s.name}'s Bloom has no street left to grow into.`);
        return;
      }
      h.bloom.push(seat);
      say(
        m,
        `${s.name} ${verb(m, seat, 'plants', 'plant')} a Bloom — a hole card grows on the next street.`,
      );
      return;
    case 'Bulwark':
      h.bulwark[seat] += n;
      say(m, `${s.name} ${verb(m, seat, 'raises', 'raise')} a Bulwark of ${fmtChips(chips)}.`);
      return;
    case 'Rerun':
      h.rerun = true;
      say(m, 'Rerun is armed: an all-in before the river runs the board twice.');
      return;
    case 'Cut': {
      const c = h.deck.shift();
      if (c) h.deck.push(c);
      say(m, `${s.name} ${verb(m, seat, 'cuts', 'cut')} the deck.`);
      return;
    }
    case 'Pass': {
      const live = h.dealtIn.map((_, i) => i).filter((i) => inHand(h, i));
      if (live.length < 2) return;
      const outgoing = live.map((i) => {
        const k = R(m).int(h.holes[i].length);
        return h.holes[i].splice(k, 1)[0];
      });
      live.forEach((i, k) => {
        const to = live[(k + 1) % live.length];
        const card = outgoing[k];
        card.blinded = false;
        card.wild = false;
        // The passer still knows the card they just held.
        if (!card.knownTo.includes(i)) card.knownTo.push(i);
        h.holes[to].push(card);
        say(m, `Pass: you received ${cardLabel(card)} from ${seatName(m, i)}.`, to);
      });
      say(m, 'Pass! Every seat still in passes a hole card to the left.');
      return;
    }
    case 'Peek': {
      if (t === null) return;
      const seen = readCards(m, seat, t, n);
      for (const c of seen) revealToSeat(m, c, seat);
      say(
        m,
        `${s.name} ${verb(m, seat, 'peeks', 'peek')} at ${rec.veiled ? 'a hidden seat' : seatName(m, t)}.`,
      );
      if (seen.length)
        say(
          m,
          `Peek: ${seatName(m, t)} ${verb(m, t, 'holds', 'hold')} ${seen.map(cardLabel).join(', ')}.`,
          seat,
        );
      return;
    }
    case 'Mark': {
      if (t === null) return;
      const seen = readCards(m, seat, t, 1);
      for (const c of seen) revealToSeat(m, c, seat);
      if (seen.length)
        say(m, `Mark: you'll track ${seatName(m, t)}'s ${cardLabel(seen[0])} this hand.`, seat);
      return;
    }
    case 'Reveal': {
      if (t === null) return;
      const hidden = h.holes[t].filter((c) => !c.public);
      if (!hidden.length) return;
      const c = hidden[R(m).int(hidden.length)];
      c.public = true;
      say(m, `Reveal: ${seatName(m, t)} ${verb(m, t, 'shows', 'show')} ${cardLabel(c)}.`);
      return;
    }
    case 'Call Out': {
      const target = h.casts.find((c) => c.id === rec.targetCast);
      if (!target) return;
      target.calledOut = true;
      if (target.feinted) {
        say(
          m,
          `Call Out! ${seatName(m, target.seat)}'s ${target.def.name} was a Feint — it fizzled.`,
        );
        adjustNerve(m, target.seat, NERVE.calledOutFizzle, 'caught feinting');
        const back = takeFromPot(m, seat, rec.chipsPaid);
        if (back) say(m, `${s.name}'s Call Out is refunded (${fmtChips(back)}).`);
      } else {
        say(m, `Call Out: ${seatName(m, target.seat)}'s ${target.def.name} was real.`);
      }
      return;
    }
    case 'Toll':
      h.toll[seat] += n;
      say(
        m,
        `${s.name} ${verb(m, seat, 'sets', 'set')} a Toll of ${fmtChips(chips)} on hostile powers.`,
      );
      return;
    case 'Insurance':
      h.insurance[seat] += n;
      say(m, `${s.name} ${verb(m, seat, 'buys', 'buy')} Insurance.`);
      return;
    case 'Siphon': {
      const got = takeFromPot(m, seat, chips);
      say(m, `${s.name} ${verb(m, seat, 'siphons', 'siphon')} ${fmtChips(got)} from the pot.`);
      return;
    }
    case 'Blessed': {
      // Only what other powers cost: never its own price.
      const got = takeFromPot(
        m,
        seat,
        Math.min(chips, Math.max(0, h.powerPaid[seat] - rec.chipsPaid)),
      );
      h.powerPaid[seat] -= got;
      say(m, `${s.name} ${verb(m, seat, 'is', 'are')} Blessed: ${fmtChips(got)} back.`);
      return;
    }
    case 'Decoy':
      h.decoy[seat] = true;
      say(m, `${s.name} ${verb(m, seat, 'sets', 'set')} a Decoy.`);
      return;
    case 'Needle':
      if (t !== null) {
        const before = m.seats[t].nerve;
        adjustNerve(m, t, -n);
        const lost = before - m.seats[t].nerve;
        if (lost)
          sayTargeted(
            m,
            rec,
            () => `${seatName(m, t)} ${verb(m, t, 'loses', 'lose')} ${lost} nerve (Needle).`,
          );
      }
      return;
    case 'Exhume':
      if (h.muck.length) queueChoice(m, { kind: 'choice', seat, choice: 'exhume', queue: [] });
      return;
    case 'Venomous':
      if (t !== null) {
        h.venom.push({ from: seat, to: t, n });
        sayTargeted(
          m,
          rec,
          () =>
            `${seatName(m, t)} ${verb(m, t, 'is', 'are')} poisoned: if they win a pot, they pay ${s.name} ${fmtChips(chips)}.`,
        );
      }
      return;
    case 'Burn': {
      const burned = h.deck.splice(0, Math.min(n, Math.max(0, h.deck.length - 8)));
      h.burn.push(...burned);
      say(
        m,
        `${s.name} ${verb(m, seat, 'burns', 'burn')} ${burned.length} card(s) off the top of the deck.`,
      );
      return;
    }
    case 'Lock':
      if (t !== null) {
        h.locked[t] = true;
        sayTargeted(
          m,
          rec,
          () => `${seatName(m, t)} ${verb(m, t, 'is', 'are')} Locked — no casting this street.`,
        );
      }
      return;
    case 'Snuff': {
      const target = h.casts.find((c) => c.id === rec.targetCast);
      if (target && target.status === 'pending') {
        target.status = 'snuffed';
        say(m, `${s.name} SNUFFS ${target.def.name}!`);
      }
      return;
    }
    case 'Entropic':
      if (t !== null) {
        if (!h.entropic.includes(t)) h.entropic.push(t);
        entropicDiscard(m, t);
      }
      return;
    case 'Overbet': {
      if (!h.overbet) h.overbet = m.seats.map(() => 0);
      h.overbet[seat] = Math.max(h.overbet[seat], n);
      say(m, `${s.name} may overbet this street — up to ${1 + h.overbet[seat]}× the pot.`);
      return;
    }
    case 'Tell': {
      if (t === null) return;
      const known = (c: PCard) => !c.facedown;
      const cards = [...h.holes[t], ...h.board.filter(known)];
      const cat =
        cards.length >= 5
          ? evaluate(cards).category
          : h.holes[t].length >= 2 && h.holes[t][0].r === h.holes[t][1].r
            ? 1
            : 0;
      sayTargeted(
        m,
        rec,
        () => `${s.name} ${verb(m, seat, 'reads', 'read')} ${seatName(m, t)}'s tell.`,
      );
      say(
        m,
        `Tell: ${seatName(m, t)} ${verb(m, t, 'holds', 'hold')} ${CATEGORY_NAMES[cat]}.`,
        seat,
      );
      return;
    }
  }
}

function queueChoice(m: Match, p: Extract<Pending, { kind: 'choice' }>): void {
  const h = m.hand!;
  if (h.pending?.kind === 'choice') {
    h.pending.queue.push(p.seat);
    return;
  }
  if (h.pending) h.deferred.push(h.pending);
  h.pending = p;
}

/** Options for the pending choice: hole-card indexes the seat may pick. */
export function choiceOptions(m: Match): number[] {
  const h = m.hand;
  const p = h?.pending;
  if (!h || p?.kind !== 'choice') return [];
  return h.holes[p.seat].map((_, i) => i);
}

function choose(m: Match, seat: number, index: number): void {
  const h = m.hand!;
  const p = h.pending;
  if (p?.kind !== 'choice' || p.seat !== seat) throw new IllegalAction('No choice pending');
  const holes = h.holes[seat];
  if (index < 0 || index >= holes.length) throw new IllegalAction('Pick one of your hole cards');
  const s = m.seats[seat];
  switch (p.choice) {
    case 'windfall':
    case 'pineapple': {
      const [c] = holes.splice(index, 1);
      h.muck.push(c);
      say(m, `${s.name} ${verb(m, seat, 'discards', 'discard')} a hole card.`);
      if (holes.length > (p.keep ?? 2)) return; // still more to drop
      break;
    }
    case 'redraw': {
      const [old] = holes.splice(index, 1, dealCard(h));
      h.muck.push(old);
      say(m, `${s.name} ${verb(m, seat, 'redraws', 'redraw')} a hole card.`);
      say(m, `Redraw: ${cardLabel(old)} → ${cardLabel(holes[index])}.`, seat);
      break;
    }
    case 'exhume': {
      const k = R(m).int(h.muck.length);
      const [found] = h.muck.splice(k, 1, holes[index]);
      found.knownTo = found.knownTo.filter((x) => x !== seat);
      found.public = false;
      holes[index] = found;
      say(m, `${s.name} ${verb(m, seat, 'exhumes', 'exhume')} a card from the muck.`);
      say(m, `Exhume: you dug up ${cardLabel(found)}.`, seat);
      break;
    }
  }
  // Next queued chooser (Pineapple runs the table; other choices queue up).
  const nextSeatIdx = p.queue.find((q) => inHand(h, q));
  if (nextSeatIdx !== undefined) {
    const rest = p.queue.slice(p.queue.indexOf(nextSeatIdx) + 1);
    const choice = p.choice === 'pineapple' ? 'pineapple' : p.choice;
    h.pending = { kind: 'choice', seat: nextSeatIdx, choice, keep: 2, queue: rest };
    return;
  }
  h.pending = h.deferred.pop() ?? null;
  if (h.pending) {
    // Back to the window the choice interrupted — unless everyone in it has
    // already answered, in which case it closes now.
    const back = h.pending;
    if (back.kind !== 'choice' && back.seats.length === 0) closeWindow(m);
    return;
  }
  if (h.toAct === null || !anyoneMustAct(m)) {
    if (!h.done) runOut(m);
  } else advance(m);
}

function freePeek(m: Match, seat: number, target: number): void {
  const h = m.hand!;
  if (!h.freePeeks.includes(seat)) throw new IllegalAction("No Dealer's Choice peek available");
  if (h.toAct !== seat || h.pending) throw new IllegalAction('On your turn');
  if (target === seat || !inHand(h, target))
    throw new IllegalAction('Pick a seat still in the hand');
  h.freePeeks = h.freePeeks.filter((x) => x !== seat);
  const seen = readCards(m, seat, target, 1);
  for (const c of seen) revealToSeat(m, c, seat);
  say(
    m,
    `${seatName(m, seat)} ${verb(m, seat, 'takes', 'take')} the Dealer's Choice peek at ${seatName(m, target)}.`,
  );
  if (seen.length) say(m, `You see ${cardLabel(seen[0])}.`, seat);
}

// ===========================================================================
// The reducer
// ===========================================================================
export function cloneMatch(m: Match): Match {
  return structuredClone(m);
}

/** Apply one action to a copy of the state. Throws IllegalAction for an
 * illegal action (the input state is untouched either way). */
export function applyAction(state: Match, action: Action): Match {
  const m = cloneMatch(state);
  applyInPlace(m, action);
  return m;
}

/** The mutable core (simulations use it directly on their own copy). */
export function applyInPlace(m: Match, action: Action): void {
  if (m.phase === 'over') throw new IllegalAction('The match is over');
  if (action.dt) m.clockMs += Math.max(0, action.dt);
  switch (action.type) {
    case 'start':
      if (m.phase !== 'between') throw new IllegalAction('A hand is in progress');
      if (m.clockMs >= modeOf(m).capMs && m.handNo > 0) {
        endMatch(m, true);
        return;
      }
      startHand(m);
      return;
    case 'fold':
    case 'check':
    case 'call':
      requireHand(m);
      act(m, action.seat, action.type);
      return;
    case 'raise':
      requireHand(m);
      act(m, action.seat, 'raise', action.to);
      return;
    case 'cast':
      requireHand(m);
      cast(m, action);
      return;
    case 'leader':
      requireHand(m);
      leaderAbility(m, action);
      return;
    case 'pass':
      requireHand(m);
      passWindow(m, action.seat);
      return;
    case 'choose':
      requireHand(m);
      choose(m, action.seat, action.index);
      return;
    case 'freePeek':
      requireHand(m);
      freePeek(m, action.seat, action.target);
      return;
  }
}

function requireHand(m: Match): void {
  if (m.phase !== 'hand' || !m.hand || m.hand.done) throw new IllegalAction('No hand in progress');
}

/** Whose input the match is waiting on, and for what. */
export type Waiting =
  | { kind: 'start' }
  | { kind: 'bet'; seat: number }
  | { kind: 'window'; seats: number[]; castId: number | null }
  | { kind: 'choice'; seat: number }
  | { kind: 'over' };

export function waitingOn(m: Match): Waiting {
  if (m.phase === 'over') return { kind: 'over' };
  const h = m.hand;
  if (m.phase === 'between' || !h || h.done) return { kind: 'start' };
  const p = h.pending;
  if (p?.kind === 'choice') return { kind: 'choice', seat: p.seat };
  if (p) return { kind: 'window', seats: p.seats, castId: p.kind === 'response' ? p.castId : null };
  if (h.toAct !== null) return { kind: 'bet', seat: h.toAct };
  return { kind: 'start' };
}

/**
 * A safe, always-legal action for `seat` (default: whoever the match waits
 * on): pass a window, keep the first card of a choice, check when free or
 * else fold. A driver applies it when a bot's proposed action is refused, so
 * a refused action can never stall the table. Null when the match is not
 * waiting on that seat.
 */
export function fallbackAction(m: Match, seat?: number): Action | null {
  const w = waitingOn(m);
  switch (w.kind) {
    case 'over':
      return null;
    case 'start':
      return seat === undefined ? { type: 'start' } : null;
    case 'window': {
      const s = seat ?? w.seats[0];
      return s !== undefined && w.seats.includes(s) ? { type: 'pass', seat: s } : null;
    }
    case 'choice':
      return seat === undefined || seat === w.seat
        ? { type: 'choose', seat: w.seat, index: 0 }
        : null;
    case 'bet': {
      if (seat !== undefined && seat !== w.seat) return null;
      return betOptions(m, w.seat)?.canCheck
        ? { type: 'check', seat: w.seat }
        : { type: 'fold', seat: w.seat };
    }
  }
}

/** Re-run a match from its seed and action log. */
export function replay(setup: MatchSetup, actions: Action[]): Match {
  const m = createMatch(setup);
  for (const a of actions) applyInPlace(m, a);
  return m;
}

/** Place-ranked seat order (1st first) — final once the match is over, a
 * live standing otherwise. */
export function standings(m: Match): number[] {
  if (m.placements) return m.placements;
  const alive = m.seats.filter((s) => !s.busted).sort((a, b) => b.stack - a.stack);
  const out = m.seats
    .filter((s) => s.busted)
    .sort((a, b) => (b.bustOrder ?? 0) - (a.bustOrder ?? 0));
  return [...alive, ...out].map((s) => s.idx);
}

/** Chips in play never change (powers move chips, never create them). */
export function chipsInPlay(m: Match): number {
  const h = m.hand;
  const table = h && !h.done ? potTotal(h) : 0;
  return m.seats.reduce((a, s) => a + s.stack, 0) + table + m.jackpot;
}
