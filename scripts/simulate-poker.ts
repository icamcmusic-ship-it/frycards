/**
 * FryCards Poker balance report (Design Spec v0.1, "Balance targets and
 * tuning"). Replaces the MTG-era `simulate-v5.ts` harness.
 *
 * Plays seeded bot-versus-bot freezeouts through the real engine (the same
 * `createMatch` / `applyInPlace` / `botAction` path the table and the fuzz
 * test use — see src/game/poker/sim.ts) and prints the spec's four balance
 * targets, then flags every card, Leader and Location outside its band.
 *
 *  1. SKILL GAP — one skilled bot (persona skill 0.9) against five naive bots
 *     (skill 0.2) at a 6-seat table. Target (the spec's wording: "a skilled
 *     bot beats a naive bot … in at least 60% of freezeouts"): averaged over
 *     the five naive seats, the skilled seat finishes above a given naive seat
 *     in ≥ 60% of freezeouts (50% would be no skill edge). Read as "wins the
 *     whole table", 60% is out of reach: a bot that sees every hole card wins
 *     only ~55% of Quick 6-seat tables, because the blind clock and the time
 *     cap leave about 15 hands. The outright win rate is still printed (no
 *     edge = 16.7%).
 *
 *  2. DECK SPREAD — one fixed deck per Leader (built by the CPU deck builder
 *     from a seeded generator), equal skill (0.6) and the same neutral bot
 *     persona on both seats (a Leader's colours normally set its bot's
 *     bluff rate and tightness; that measures the bot's style, not the deck),
 *     heads-up round robin in duplicate format (each deal played twice, seats
 *     swapped). The best and worst decks by round-robin win rate then play a
 *     dedicated duplicate series three times the suite size. Target: the best
 *     deck wins ≤ 55% of it.
 *
 *  3. REVIVAL RATE — over a 6-seat equal-skill suite, every RESOLVED revive
 *     cast (effect Redraw / Windfall / Wild / Bloom / Exhume, from a power or a Leader
 *     ability). Target ≈ 1 in 8 of them turn a losing hand into a winner.
 *     How it is measured (an approximation, by design): the caster's hole
 *     cards are snapshotted the moment the cast is made. At the end of the
 *     hand, a revive "turned" the hand when the caster won (a share of) the
 *     pot at a contested showdown AND the snapshot hand, evaluated on the
 *     final board, would have lost to the best hand still in against them.
 *     Not modelled: how the betting would have gone without the revive (a
 *     seat may have folded instead), the second board of Double Board /
 *     Rerun (board 1 only), and later card movement (Pass) on the snapshot.
 *     Uncontested wins never count as "turned" — the betting won those.
 *
 *  4. LOCATION FAIRNESS — over the same suite, the dealer (button) seat's
 *     hand-win rate under each Location rule and each Location card, against
 *     the dealer's win rate over all hands. Target: within 2 points.
 *
 * Band flags (printed after the targets):
 *  - Location: |dealer Δ| > 2 points. Rows are marked FLAG only when the
 *    deviation is also statistically real; a deviation inside the noise of
 *    a small sample prints as "noisy" instead. "Real" is |z| above the
 *    Bonferroni-corrected 5% critical value for the number of rows tested
 *    (≈ 3.0 for 18 Locations): at a flat |z| > 2, one of 18 fair Locations
 *    flags by chance in most runs. The same correction applies to the card
 *    and Leader bands.
 *  - Card: hand-win rate of the casting seat when that card resolved, against
 *    the hand-win rate of all resolved casts. Band ±8 points (|z| > 2,
 *    n ≥ 30 casts).
 *  - Leader: heads-up round-robin win rate, band 50 ± 7.5 points; plus the
 *    6-seat suite's win share for reference.
 *
 * Usage:
 *   npx tsx scripts/simulate-poker.ts [--matches N] [--mode quick|standard|deep]
 *                                     [--seed S] [--json out.json] [--strict]
 *   npm run sim:poker -- --matches 400
 *
 * `--matches` is the match count per suite (default 200; the round robin
 * spreads it over every Leader pairing, at least 2 per pairing). `--strict`
 * exits 1 when a target misses, so the report can gate a release.
 * `--invariants` exits 1 only on an engine fault (a bot action the engine
 * refused, a match that never ends, chips not conserved) — the CI gate, which
 * must not fail on a balance miss.
 */
import { writeFileSync } from 'node:fs';
import { botAction, botRng } from '../src/game/poker/bot';
import { POOL_LEADERS } from '../src/game/poker/cardpool';
import { MODES, UNIT, type ModeId } from '../src/game/poker/constants';
import { buildDeck, type DeckDef } from '../src/game/poker/deck';
import {
  applyInPlace,
  chipsInPlay,
  createMatch,
  fallbackAction,
  IllegalAction,
  leaderPseudoDef,
  personaFor,
  waitingOn,
  type Action,
  type Hand,
  type Match,
  type MatchSetup,
} from '../src/game/poker/engine';
import { evaluate, type Card } from '../src/game/poker/evaluator';
import { LOCATION_TEMPLATES } from '../src/game/poker/locations';
import { rngOn } from '../src/game/poker/rng';
import { cpuTableSetup } from '../src/game/poker/sim';
import { viewFor } from '../src/game/poker/view';

// ---------------------------------------------------------------------------
// Targets and bands
// ---------------------------------------------------------------------------
const TARGET = {
  skillWin: 0.6,
  deckSpread: 0.55,
  revival: 1 / 8,
  /** Revival is "≈ 1 in 8": accept 1 in 12 … 1 in 5.5. */
  revivalBand: [1 / 12, 1 / 5.5] as const,
  dealerPts: 2,
};
const CARD_BAND_PTS = 8;
const CARD_MIN_CASTS = 30;
const LEADER_BAND_PTS = 7.5;
const LOCATION_RULE_MIN_HANDS = 100;
const LOCATION_CARD_MIN_HANDS = 40;
const SKILLED = 0.9;
const NAIVE = 0.2;
const EVEN = 0.6;
/** Deck spread compares decks, so both seats play the same style. */
const NEUTRAL_PERSONA = { bluff: 0.12, tightness: 0.5, powerUse: 0.55, skill: EVEN };
const REVIVE = new Set(['Redraw', 'Windfall', 'Wild', 'Bloom', 'Exhume']);

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return undefined;
  return process.argv[i + 1];
}
const MATCHES = Math.max(2, Number(arg('matches') ?? process.argv[2]?.match(/^\d+$/)?.[0] ?? 200));
const MODE = (arg('mode') ?? 'quick') as ModeId;
if (!MODES[MODE]) {
  console.error(`Unknown --mode ${MODE}; use one of ${Object.keys(MODES).join(', ')}.`);
  process.exit(2);
}
const SEED = Number(arg('seed') ?? 1337) | 0;
const JSON_OUT = arg('json');
const STRICT = process.argv.includes('--strict');
/** CI gate: exit 1 on an ENGINE fault only (a refused bot action, chips
 * created or destroyed, a match that never ends) — never on a balance miss. */
const INVARIANTS = process.argv.includes('--invariants');

// ---------------------------------------------------------------------------
// Driver: runBots with per-action and per-hand hooks
// ---------------------------------------------------------------------------
interface Hooks {
  beforeAction?(m: Match, a: Action): void;
  afterAction?(m: Match, a: Action): void;
  afterHand?(m: Match, h: Hand): void;
}

/** Engine canary: bot actions the engine refused (IllegalAction). The bot
 * only ever proposes actions it believes legal, so any count here is a bot or
 * engine bug — the seat folds/passes instead and the match carries on. */
const illegal = new Map<string, number>();
let abortedMatches = 0;
/** Bot casts refused because a Veiled cast had already hit the target. */
let hiddenTargetRetries = 0;
/** Matches that hit the step guard without ending, and matches whose chip
 * total drifted from the starting stacks (powers move chips, never mint). */
let unfinishedMatches = 0;
let chipBreaks = 0;

function play(setup: MatchSetup, botSeed: number, hooks: Hooks = {}): Match {
  const m = createMatch(setup);
  const rng = botRng(botSeed);
  let lastHand = -1;
  for (let step = 0; step < 400000; step++) {
    const w = waitingOn(m);
    if (w.kind === 'over') break;
    let action: Action | null;
    let fallback: Action | null = null;
    if (w.kind === 'start') action = { type: 'start', dt: 2000 };
    else {
      const seat = w.kind === 'window' ? w.seats[0] : w.seat;
      fallback = fallbackAction(m, seat);
      action = botAction(viewFor(m, seat), seat, rng) ?? fallback;
      if (!action) break;
    }
    hooks.beforeAction?.(m, action);
    try {
      applyInPlace(m, action);
    } catch (e) {
      if (!(e instanceof IllegalAction) || !fallback || action === fallback) {
        abortedMatches++;
        illegal.set(
          `aborted: ${(e as Error).message}`,
          (illegal.get(`aborted: ${(e as Error).message}`) ?? 0) + 1,
        );
        break;
      }
      const seat = 'seat' in action ? action.seat : -1;
      if (e.code === 'hiddenTarget') {
        // Expected: a Veiled hit the bot's view does not show. Not a fault.
        hiddenTargetRetries++;
        action = botAction(viewFor(m, seat), seat, rng, { noPowers: true }) ?? fallback;
      } else {
        const key = `${action.type}: ${e.message}`;
        illegal.set(key, (illegal.get(key) ?? 0) + 1);
        action = fallback;
      }
      applyInPlace(m, action);
    }
    hooks.afterAction?.(m, action);
    const h = m.hand;
    if (h && h.done && h.result && h.no !== lastHand) {
      lastHand = h.no;
      hooks.afterHand?.(m, h);
    }
  }
  if (m.phase !== 'over') unfinishedMatches++;
  if (chipsInPlay(m) !== setup.seats.length * MODES[setup.mode].stackChips) chipBreaks++;
  return m;
}

const winnerOf = (m: Match): number => (m.placements ? m.placements[0] : -1);

// ---------------------------------------------------------------------------
// Stats helpers
// ---------------------------------------------------------------------------
const pct = (x: number, d = 1) => `${(x * 100).toFixed(d)}%`;
const pts = (x: number) => `${x >= 0 ? '+' : ''}${(x * 100).toFixed(1)}`;
/** z-score of an observed rate against a baseline rate. */
const zOf = (p: number, base: number, n: number) =>
  n > 0 ? (p - base) / Math.sqrt(Math.max(1e-9, (base * (1 - base)) / n)) : 0;
const pad = (s: string | number, n: number) => String(s).padEnd(n);
const lpad = (s: string | number, n: number) => String(s).padStart(n);

interface Tally {
  n: number;
  w: number;
}
const bump = <K>(map: Map<K, Tally>, k: K, won: boolean | number) => {
  const t = map.get(k) ?? { n: 0, w: 0 };
  t.n += 1;
  t.w += typeof won === 'number' ? won : won ? 1 : 0;
  map.set(k, t);
};

function header(title: string) {
  console.log(`\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}`);
}

const started = Date.now();
console.log(
  `FryCards Poker balance report — mode ${MODE}, ${MATCHES} matches per suite, seed ${SEED}, ` +
    `${POOL_LEADERS.length} Leaders.`,
);

// ---------------------------------------------------------------------------
// 1. Skill gap
// ---------------------------------------------------------------------------
let skilledWins = 0;
/** Naive seats the skilled seat finished above, summed over matches. */
let skilledAbove = 0;
for (let i = 0; i < MATCHES; i++) {
  const seed = (SEED * 7919 + i * 104729) | 0;
  const setup = cpuTableSetup({ seed, mode: MODE, seats: 6, skill: NAIVE });
  setup.seats[0].persona = personaFor(setup.seats[0].deck.leader, SKILLED);
  const m = play(setup, seed ^ 0x2545f491);
  if (winnerOf(m) === 0) skilledWins++;
  const place = m.placements ? m.placements.indexOf(0) : -1;
  if (place >= 0) skilledAbove += 5 - place;
}
const skillWinRate = skilledWins / MATCHES;
const skillRate = skilledAbove / (5 * MATCHES);

// ---------------------------------------------------------------------------
// 2. Deck spread (heads-up round robin, one fixed deck per Leader)
// ---------------------------------------------------------------------------
const deckRng = rngOn({ rng: (SEED ^ 0x9e3779b9) | 0 });
const decks: DeckDef[] = POOL_LEADERS.map((l) => buildDeck(l, MODES[MODE], deckRng));
const pairs: [number, number][] = [];
for (let a = 0; a < decks.length; a++)
  for (let b = a + 1; b < decks.length; b++) pairs.push([a, b]);
const perPair = Math.max(2, Math.ceil(MATCHES / Math.max(1, pairs.length) / 2) * 2);

function headsUp(a: number, b: number, seed: number, swap: boolean): number {
  // Returns the winning deck index.
  const order = swap ? [b, a] : [a, b];
  const setup: MatchSetup = {
    seed,
    mode: MODE,
    seats: order.map((d) => ({
      name: decks[d].leader.name,
      human: false,
      deck: decks[d],
      persona: { ...NEUTRAL_PERSONA },
    })),
  };
  const w = winnerOf(play(setup, seed ^ 0x68e31da4));
  return w < 0 ? -1 : order[w];
}

/** Duplicate format: each seed is played twice with the seats swapped, so
 * both decks are dealt the same cards (at least until the hands diverge).
 * Card luck largely cancels; a plain series of 200 carries ±3.5 points of it,
 * as wide as the margin the deck-spread target measures. */
function duplicate(a: number, b: number, seed: number): number[] {
  return [headsUp(a, b, seed, false), headsUp(a, b, seed, true)];
}

const deckTally = new Map<number, Tally>();
let rrSeed = SEED * 31;
for (const [a, b] of pairs) {
  for (let k = 0; k < perPair / 2; k++) {
    for (const w of duplicate(a, b, (rrSeed++ * 2654435761) | 0 || 1)) {
      bump(deckTally, a, w === a);
      bump(deckTally, b, w === b);
    }
  }
}
const deckRows = decks
  .map((d, i) => ({ i, d, t: deckTally.get(i) ?? { n: 0, w: 0 } }))
  .map((r) => ({ ...r, rate: r.t.n ? r.t.w / r.t.n : 0 }))
  .sort((x, y) => y.rate - x.rate);
const best = deckRows[0];
const worst = deckRows[deckRows.length - 1];
let bestWins = 0;
let series = 0;
// Three times the suite size: at 200 a series carries about ±3.5 points of
// noise, too wide to call a 55% line (the same pairing read 55.5% at 200 and
// 52.3% at 1,200).
for (let k = 0; k < (3 * MATCHES) / 2; k++) {
  for (const w of duplicate(best.i, worst.i, ((SEED + 99991) * 31 + k * 7) | 0 || 1)) {
    if (w < 0) continue;
    series++;
    if (w === best.i) bestWins++;
  }
}
const spreadRate = series ? bestWins / series : 0;

// ---------------------------------------------------------------------------
// 3 + 4. Table suite: revival, Location fairness, card bands, 6-seat Leaders
// ---------------------------------------------------------------------------
interface Snapshot {
  seat: number;
  uid: string;
  pre: Card[];
  castCount: number;
}
let reviveResolved = 0;
let reviveTurned = 0;
let reviveContested = 0;
const reviveByKw = new Map<string, Tally>();
let dealerAll: Tally = { n: 0, w: 0 };
const dealerByRule = new Map<string, Tally>();
const dealerByCard = new Map<string, Tally>();
const castByCard = new Map<string, Tally>();
let castAll: Tally = { n: 0, w: 0 };
const leaderTable = new Map<string, Tally>();
let tableHands = 0;
const nameOf = new Map<string, string>();

for (let i = 0; i < MATCHES; i++) {
  const seed = ((SEED + 7) * 6364136223 + i * 1442695) | 0;
  const setup = cpuTableSetup({ seed, mode: MODE, seats: 6, skill: EVEN });
  let snaps: Snapshot[] = [];
  const tracked: { castId: number; seat: number; pre: Card[]; kw: string }[] = [];

  const m = play(setup, seed ^ 0x1b873593, {
    beforeAction(mm, a) {
      const h = mm.hand;
      if (!h || h.done) return;
      let snap: { seat: number; uid: string; kw?: string } | null = null;
      if (a.type === 'cast') {
        const kw = mm.seats[a.seat].hand.find((p) => p.uid === a.uid)?.def.effect?.kw;
        snap = { seat: a.seat, uid: a.uid, kw };
      } else if (a.type === 'leader') {
        const kw = leaderPseudoDef(mm.seats[a.seat].leader, a.ability).effect?.kw;
        snap = { seat: a.seat, uid: `leader:${a.ability}`, kw };
      }
      if (snap?.kw && REVIVE.has(snap.kw)) {
        snaps.push({
          seat: snap.seat,
          uid: snap.uid,
          pre: h.holes[snap.seat].map((c) => ({ r: c.r, s: c.s, wild: c.wild })),
          castCount: h.casts.length,
        });
      }
    },
    afterAction(mm) {
      const h = mm.hand;
      if (!h || snaps.length === 0) {
        snaps = [];
        return;
      }
      for (const s of snaps) {
        const rec = h.casts.slice(s.castCount).find((c) => c.seat === s.seat);
        if (rec && REVIVE.has(rec.effect.kw)) {
          tracked.push({ castId: rec.id, seat: s.seat, pre: s.pre, kw: rec.effect.kw });
        }
      }
      snaps = [];
    },
    afterHand(mm, h) {
      tableHands++;
      const r = h.result!;
      const won = (seat: number) => r.winners.includes(seat);
      // Location fairness: the dealer (button) seat, when dealt in.
      // A split counts as a share (Double Board and Rerun split most pots;
      // counting any share as a whole win made those rules look
      // dealer-favoured).
      if (h.dealtIn[h.button]) {
        const w = won(h.button) ? 1 / r.winners.length : 0;
        dealerAll = { n: dealerAll.n + 1, w: dealerAll.w + w };
        bump(dealerByRule, h.rule.id, w);
        bump(dealerByCard, h.location.card.id, w);
        nameOf.set(h.location.card.id, h.location.card.name);
      }
      // Card bands: did the caster win the hand when this card resolved?
      for (const c of h.casts) {
        if (c.status !== 'resolved' || c.leader) continue;
        const w = won(c.seat);
        castAll = { n: castAll.n + 1, w: castAll.w + (w ? 1 : 0) };
        bump(castByCard, c.def.id, w);
        nameOf.set(c.def.id, c.def.name);
      }
      // Revival.
      for (const t of tracked.filter((x) => h.casts.some((c) => c.id === x.castId))) {
        const rec = h.casts.find((c) => c.id === t.castId)!;
        if (rec.status !== 'resolved') continue;
        reviveResolved++;
        let turned = false;
        const opps = h.holes
          .map((_, s) => s)
          .filter((s) => s !== t.seat && h.dealtIn[s] && !h.folded[s]);
        const contested = !r.uncontested && opps.length > 0 && !h.folded[t.seat];
        if (contested && h.board.length >= 3) {
          reviveContested++;
          if (won(t.seat)) {
            const board = h.board.map((c) => ({ r: c.r, s: c.s, wild: c.wild }));
            const pre = evaluate([...t.pre, ...board]).score;
            const bestOpp = Math.max(...opps.map((s) => evaluate([...h.holes[s], ...board]).score));
            turned = pre < bestOpp;
          }
        }
        if (turned) reviveTurned++;
        bump(reviveByKw, t.kw, turned);
      }
      tracked.length = 0;
    },
  });
  const w = winnerOf(m);
  m.seats.forEach((s, idx) => bump(leaderTable, s.leader.id, idx === w));
  for (const s of m.seats) nameOf.set(s.leader.id, s.leader.name);
}

const reviveRate = reviveResolved ? reviveTurned / reviveResolved : 0;
const dealerBase = dealerAll.n ? dealerAll.w / dealerAll.n : 0;

interface BandRow {
  id: string;
  name: string;
  n: number;
  rate: number;
  delta: number;
  z: number;
  status: 'FLAG' | 'noisy' | 'ok' | 'thin';
}
/** Two-sided normal tail P(|Z| > z) (Abramowitz–Stegun 7.1.26 erfc). */
function tail2(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    t *
    (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  return poly * Math.exp(-x * x);
}
/** |z| a row must clear to flag: 5% family-wise over `rows` tests. */
function zCritical(rows: number): number {
  const alpha = 0.05 / Math.max(1, rows);
  let lo = 0;
  let hi = 8;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (tail2(mid) > alpha) lo = mid;
    else hi = mid;
  }
  return hi;
}

function bandRows(
  map: Map<string, Tally>,
  base: number,
  bandPts: number,
  minN: number,
  name: (id: string) => string,
): BandRow[] {
  const zCrit = zCritical([...map.values()].filter((t) => t.n >= minN).length);
  return [...map.entries()]
    .map(([id, t]) => {
      const rate = t.n ? t.w / t.n : 0;
      const delta = rate - base;
      const z = zOf(rate, base, t.n);
      const out = Math.abs(delta) * 100 > bandPts;
      const status: BandRow['status'] =
        t.n < minN ? 'thin' : out && Math.abs(z) > zCrit ? 'FLAG' : out ? 'noisy' : 'ok';
      return { id, name: name(id), n: t.n, rate, delta, z, status };
    })
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
}

const ruleRows = bandRows(
  dealerByRule,
  dealerBase,
  TARGET.dealerPts,
  LOCATION_RULE_MIN_HANDS,
  (id) => LOCATION_TEMPLATES[id as keyof typeof LOCATION_TEMPLATES]?.name ?? id,
);
const locCardRows = bandRows(
  dealerByCard,
  dealerBase,
  TARGET.dealerPts,
  LOCATION_CARD_MIN_HANDS,
  (id) => nameOf.get(id) ?? id,
);
const castBase = castAll.n ? castAll.w / castAll.n : 0;
const cardRows = bandRows(
  castByCard,
  castBase,
  CARD_BAND_PTS,
  CARD_MIN_CASTS,
  (id) => nameOf.get(id) ?? id,
);
const leaderRows: BandRow[] = deckRows
  .map((r) => {
    const delta = r.rate - 0.5;
    const z = zOf(r.rate, 0.5, r.t.n);
    const out = Math.abs(delta) * 100 > LEADER_BAND_PTS;
    return {
      id: r.d.leader.id,
      name: r.d.leader.name,
      n: r.t.n,
      rate: r.rate,
      delta,
      z,
      status: (out && Math.abs(z) > zCritical(deckRows.length)
        ? 'FLAG'
        : out
          ? 'noisy'
          : 'ok') as BandRow['status'],
    };
  })
  .sort((a, b) => b.rate - a.rate);
const locationWorst = ruleRows.filter((r) => r.status !== 'thin');
const locationMaxDev = locationWorst.reduce((a, r) => Math.max(a, Math.abs(r.delta)), 0);

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const verdict = (ok: boolean) => (ok ? 'PASS' : 'MISS');
const results = {
  skill: {
    rate: skillRate,
    winRate: skillWinRate,
    target: TARGET.skillWin,
    ok: skillRate >= TARGET.skillWin,
  },
  deckSpread: {
    best: best.d.leader.name,
    worst: worst.d.leader.name,
    rate: spreadRate,
    target: TARGET.deckSpread,
    ok: spreadRate <= TARGET.deckSpread,
  },
  revival: {
    rate: reviveRate,
    resolved: reviveResolved,
    contested: reviveContested,
    turned: reviveTurned,
    target: TARGET.revival,
    ok: reviveRate >= TARGET.revivalBand[0] && reviveRate <= TARGET.revivalBand[1],
  },
  location: {
    baseline: dealerBase,
    maxDeviation: locationMaxDev,
    target: TARGET.dealerPts / 100,
    ok: !ruleRows.some((r) => r.status === 'FLAG'),
  },
};

header('BALANCE TARGETS');
console.log(
  `1. Skill gap        ${verdict(results.skill.ok)}  skilled (${SKILLED}) vs 5 naive (${NAIVE}), 6 seats: ` +
    `finishes above a naive seat in ${pct(skillRate)} over ${MATCHES} freezeouts ` +
    `(target ≥ ${pct(TARGET.skillWin, 0)}; no edge = 50%); wins the table ${pct(skillWinRate)} (no edge = 16.7%)`,
);
console.log(
  `2. Deck spread      ${verdict(results.deckSpread.ok)}  best "${best.d.name}" vs worst "${worst.d.name}" ` +
    `heads-up: ${pct(spreadRate)} of ${series} (target ≤ ${pct(TARGET.deckSpread, 0)})`,
);
console.log(
  `3. Revival rate     ${verdict(results.revival.ok)}  ${reviveTurned} of ${reviveResolved} resolved revive ` +
    `casts turned a loser into a winner = ${pct(reviveRate)} ≈ 1 in ${reviveTurned ? (reviveResolved / reviveTurned).toFixed(1) : '∞'} ` +
    `(target ≈ 1 in 8; band 1 in 12 … 1 in 5.5; ${reviveContested} reached a contested showdown)`,
);
console.log(
  `4. Location fairness ${verdict(results.location.ok)}  dealer baseline ${pct(dealerBase)} over ` +
    `${dealerAll.n} hands; largest rule deviation ${pts(locationMaxDev)} pts (target within ±${TARGET.dealerPts})`,
);

header('REVIVAL BY KEYWORD (resolved casts / turned)');
for (const [kw, t] of [...reviveByKw.entries()].sort()) {
  console.log(
    `  ${pad(kw, 10)} ${lpad(t.n, 6)} cast  ${lpad(t.w, 5)} turned  ${pct(t.n ? t.w / t.n : 0)}`,
  );
}

const printRows = (rows: BandRow[], label: string, limit = 25) => {
  console.log(
    `  ${pad(label, 34)} ${lpad('n', 6)} ${lpad('rate', 7)} ${lpad('Δ pts', 7)} ${lpad('z', 6)}  status`,
  );
  for (const r of rows.slice(0, limit)) {
    console.log(
      `  ${pad(r.name.slice(0, 34), 34)} ${lpad(r.n, 6)} ${lpad(pct(r.rate), 7)} ${lpad(pts(r.delta), 7)} ` +
        `${lpad(r.z.toFixed(1), 6)}  ${r.status}`,
    );
  }
};

header(
  `LOCATION RULES — dealer win rate vs ${pct(dealerBase)} baseline (band ±${TARGET.dealerPts} pts)`,
);
printRows(ruleRows, 'rule', 40);
header(`LEADERS — heads-up round robin (${perPair} per pairing, band 50 ± ${LEADER_BAND_PTS} pts)`);
printRows(leaderRows, 'Leader (fixed deck)', 40);
console.log('\n  6-seat table suite (win share; 16.7% = even):');
for (const [id, t] of [...leaderTable.entries()].sort(
  (a, b) => b[1].w / b[1].n - a[1].w / a[1].n,
)) {
  console.log(
    `  ${pad((nameOf.get(id) ?? id).slice(0, 34), 34)} ${lpad(t.n, 6)} ${lpad(pct(t.w / t.n), 7)}`,
  );
}

const flagged = {
  cards: cardRows.filter((r) => r.status === 'FLAG'),
  leaders: leaderRows.filter((r) => r.status === 'FLAG'),
  locationRules: ruleRows.filter((r) => r.status === 'FLAG'),
  locationCards: locCardRows.filter((r) => r.status === 'FLAG'),
};
header(
  `OUT OF BAND — cards (±${CARD_BAND_PTS} pts vs ${pct(castBase)} caster baseline, n ≥ ${CARD_MIN_CASTS}), ` +
    `Leaders, Locations`,
);
if (flagged.cards.length) printRows(flagged.cards, 'card', 60);
else console.log('  cards: none');
if (flagged.leaders.length) printRows(flagged.leaders, 'Leader', 20);
else console.log('  Leaders: none');
if (flagged.locationRules.length) printRows(flagged.locationRules, 'Location rule', 20);
else console.log('  Location rules: none');
if (flagged.locationCards.length) printRows(flagged.locationCards, 'Location card', 60);
else console.log(`  Location cards: none (n ≥ ${LOCATION_CARD_MIN_HANDS} hands each)`);
const noisy = cardRows.filter((r) => r.status === 'noisy').length;
if (noisy)
  console.log(
    `  (${noisy} more cards sit outside the band inside sampling noise — raise --matches.)`,
  );

header('ENGINE CANARY — bot actions the engine refused');
if (illegal.size === 0) console.log('  none');
for (const [k, n] of [...illegal.entries()].sort((a, b) => b[1] - a[1]))
  console.log(`  ${lpad(n, 6)}× ${k}`);
if (abortedMatches) console.log(`  ${abortedMatches} match(es) aborted (no legal fallback).`);
if (hiddenTargetRetries)
  console.log(
    `  ${hiddenTargetRetries} cast(s) refused by a Veiled hit the bot could not see (expected).`,
  );

console.log(
  `\n${tableHands} table-suite hands, ${castAll.n} resolved casts. ` +
    `Done in ${((Date.now() - started) / 1000).toFixed(1)}s.`,
);

if (JSON_OUT) {
  writeFileSync(
    JSON_OUT,
    JSON.stringify(
      {
        meta: { mode: MODE, matches: MATCHES, seed: SEED },
        results,
        illegalBotActions: Object.fromEntries(illegal),
        abortedMatches,
        locationRules: ruleRows,
        locationCards: locCardRows,
        leaders: leaderRows,
        cards: cardRows,
        flagged,
      },
      null,
      2,
    ),
  );
  console.log(`Wrote ${JSON_OUT}`);
}

const allOk = Object.values(results).every((r) => r.ok);
if (unfinishedMatches) console.log(`  ${unfinishedMatches} match(es) never finished.`);
if (chipBreaks) console.log(`  ${chipBreaks} match(es) did not conserve chips.`);
const engineOk = illegal.size === 0 && !abortedMatches && !unfinishedMatches && !chipBreaks;
if (INVARIANTS && !engineOk) {
  console.error('ENGINE INVARIANT FAILURE — see the canary section above.');
  process.exit(1);
}
if (STRICT && !allOk) process.exit(1);
