/**
 * Fry Cards v5 balance & CPU-quality sim harness (essence engine).
 *
 * Runs seeded CPU-vs-CPU games across randomized coherent archetypes over
 * the FULL 292-card catalog (bundled fallback == live Supabase pool, parity
 * verified by scripts/fetch-cards.ts, and re-verified live for v5.2 — see
 * docs/BALANCE_SIM_FINDINGS_v5.3.md) and reports:
 *
 *  - match outcomes: win rates by Leader, color, first/second player,
 *    win condition (vitality vs deck-out), game length distribution
 *  - card health: per-card played-vs-deck-baseline win-rate residuals,
 *    dead-in-hand rates, cost-band curves (win rate & residual by total cost)
 *  - keyword health: carrier win-rate deltas + activation counts
 *    (Overrun spill, Venomous kills, Siphon vitality, Quickstrike pre-kills,
 *    Ambush reaction invokes, Warded target denials, ...)
 *  - mechanic usage: leader invokes/abilities/shatters, rebonds, sheds,
 *    erode totals, Sanctum plays, reaction-window plays, wasted essence
 *  - CPU lapse counters: missed lethal, guardable-lethal taken, venomous
 *    suicide attacks, wasted essence with playable cards, idle leaders,
 *    color-clogged hands
 *  - invariant violations (engine correctness canaries)
 *
 * v5.2 additions (docs/BALANCE_SIM_FINDINGS_v5.3.md carry-forward items):
 *  - archetype-normalized keyword deltas: carrier win rate residual computed
 *    against each game's own Leader-archetype baseline (8 Leaders = 8
 *    cohorts), not the flat 50% global baseline, to strip cohort noise.
 *  - paired-seed seat-swap suite: same deck pairing + identical seed, seats
 *    swapped, run as its own isolated mini-suite (not mixed into card/keyword
 *    stats) to measure the first-mover edge net of cohort composition.
 *  - per-cost-tier win rates + residual vs that tier's deck-baseline average.
 *  - CPU decision-quality taxonomy: shadow (lookahead) re-decisions for
 *    attack / guard / removal-target choices, diffed against the CPU's
 *    actual choice and bucketed by decision type — generalizes the v5.1
 *    lapse counters into a fuller reasoning-lapse taxonomy.
 *  - essence-curve efficiency: turns ending with a castable, affordable hand
 *    card that was not played (held-playable-card turns).
 *
 * v5.3 additions:
 *  - REAL keyword activation counts via engine telemetry hooks (Siphon gain,
 *    Venomous kills, Overrun spill, Quickstrike pre-kills, Ambush reaction
 *    invokes) — the v5.2 `activations` field existed but was never fed.
 *  - REAL wastedEssenceWithPlay / venomousSuicide lapse counters (both were
 *    dead counters in v5.1/v5.2 — declared, never incremented).
 *  - Accurate erode tracking (opponent deck shrink during the acting
 *    player's turn) — the old totalErode expression was a no-op.
 *  - Color-vs-color matchup matrix (7x7 by Leader identity) — the missing
 *    cohort-controlled color signal flagged in v5.2 item 5.
 *  - Keyword carrier win rates split by carrier cost band (1-2 / 3-4 / 5+),
 *    for the "Swarmproof cheap carriers run hot" question (v5.2 item 6).
 *  - Separate deckSeed CLI arg: rerun the SAME deck cohort under a different
 *    game seed to split cohort noise from engine/AI changes (v5.2 item 2).
 *  - Mulligan rate, winner vitality margin, average deck remaining at end.
 *
 * v6.0 additions (rulebook alignment + 10 new type keywords):
 *  - 60-card decks / 7-card hands / rulebook mulligan flow through decks.ts
 *    and ai.ts automatically; keyword tables cover the ten new type keywords
 *    (Regenerate, Hardened, Surge, Resonant, Runic, Soulbound, Bountiful,
 *    Sacred, Commander, Resolute) via the same telemetry hooks.
 *  - Tempo signature: per-card average FIRST-play turn (cardReport
 *    avgFirstPlayTurn) — separates early-curve workhorses from late bombs
 *    with identical win rates.
 *  - Board metrics: average units on the battlefield per turn sample.
 *  - Clash metrics: clashes per game, average attackers per clash, average
 *    turn of each game's first clash.
 *  - Mulligan outcome split: win rate of hands that mulliganed vs kept
 *    (the rulebook mulligan now costs a card, so this is a real tradeoff).
 *  - Comeback rate: how often the eventual winner was BEHIND on vitality at
 *    the turn-8 snapshot (measures whether games are decided early).
 *  - Essence spend: total printed cost invoked per game (economy throughput,
 *    complements wastedEssencePerGame).
 *
 * Usage: npx tsx scripts/simulate-v5.ts [gamesPerPairing] [numDecks] [seed] [deckSeed]
 * Output: JSON report to docs/sim-runs/ + console summary.
 */
import * as fs from 'fs';
import * as path from 'path';
import { totalCost, CardDef, LEADER_HP, MAX_HAND } from '../src/game/v3/cards';
import { COLORS } from '../src/game/v3/colors';
import { KEYWORDS } from '../src/game/v3/keywords';
import {
  GameState,
  PlayerId,
  createGame,
  mulberry32,
  opponentOf,
  effMight,
  legalAttackers,
  remainingGrit,
  canInvoke,
  findUnit,
  canPayCost,
  essenceTotal,
  telemetry,
} from '../src/game/v3/engine';
import { LEADER_COLORS } from '../src/game/v3/colors';
import { POOL_BY_ID, POOL_V4 } from '../src/game/v3/cardpool';
import { buildDeck, randomArchetype } from '../src/game/v3/decks';
import { playTurn, maybeMulliganPlayer } from '../src/game/v3/ai';
import type { DeckDef } from '../src/game/v3/engine';

const GAMES_PER_PAIRING = Number(process.argv[2] ?? 4);
const NUM_DECKS = Number(process.argv[3] ?? 24);
const SEED = Number(process.argv[4] ?? 1337);
/** Deck-draft seed, defaulting to SEED. Pass a different game seed with the
 * SAME deckSeed to hold the deck cohort fixed across runs (v5.2 item 2). */
const DECK_SEED = Number(process.argv[5] ?? SEED);
const MAX_TURNS = 60;

// ---------------------------------------------------------------------------
// Stat accumulators
// ---------------------------------------------------------------------------
interface CardStat {
  inDeckGames: number;
  inDeckWins: number;
  playedGames: number;
  playedWins: number;
  drawnGames: number;
  drawnWins: number;
  timesPlayed: number;
  timesDrawn: number;
  timesDeadInHand: number; // drawn but never played, game ended with it in hand
  // v6.0 tempo signature: sum/count of the turn this card was FIRST played
  // in a game (avg = firstPlayTurnSum / firstPlayGames).
  firstPlayTurnSum: number;
  firstPlayGames: number;
}
const cardStats: Record<string, CardStat> = {};
function cs(id: string): CardStat {
  return (cardStats[id] ??= {
    inDeckGames: 0, inDeckWins: 0, playedGames: 0, playedWins: 0,
    drawnGames: 0, drawnWins: 0, timesPlayed: 0, timesDrawn: 0, timesDeadInHand: 0,
    firstPlayTurnSum: 0, firstPlayGames: 0,
  });
}

// --- v6.0: board / clash / mulligan-outcome / comeback / essence-spend ------
const boardMetrics = { turnSamples: 0, unitsOnBoardSum: 0 };
const clashMetrics = { clashes: 0, attackersSum: 0, firstClashTurnSum: 0, gamesWithClash: 0 };
const mullOutcome = { mullGames: 0, mullWins: 0, keepGames: 0, keepWins: 0 };
const comeback = { measured: 0, comebackWins: 0 }; // winner behind on vitality at the turn-8 snapshot
let essenceSpentTotal = 0; // sum of printed totals of every invoked card

interface KwStat { carrierGames: number; carrierWins: number; activations: number }
const kwStats: Record<string, KwStat> = {};
for (const kw of KEYWORDS) kwStats[kw] = { carrierGames: 0, carrierWins: 0, activations: 0 };

const leaderStats: Record<string, { games: number; wins: number; invoked: number; shattered: number; abilityUses: number }> = {};
const colorStats: Record<string, { games: number; wins: number }> = {};
for (const c of COLORS) colorStats[c] = { games: 0, wins: 0 };

// --- v5.2: archetype-normalized keyword deltas -----------------------------
// Cohort key = Leader id (8 distinct Leaders, each a fixed 2-color identity —
// the natural "archetype" unit since randomArchetype() always themes off the
// Leader's own colors). kwArchetypeStats lets us compute each keyword's
// carrier win rate residual against ITS OWN cohort mix rather than a flat
// 50% baseline.
const archetypeStats: Record<string, { games: number; wins: number }> = {};
const kwArchetypeStats: Record<string, Record<string, { games: number; wins: number }>> = {};
for (const kw of KEYWORDS) kwArchetypeStats[kw] = {};

// --- v5.2: per-cost-tier win rates ------------------------------------------
const tierStats: Record<string, { playedGames: number; playedWins: number; deckGames: number; deckWins: number }> = {};
function ts(tier: number) {
  const k = String(tier);
  return (tierStats[k] ??= { playedGames: 0, playedWins: 0, deckGames: 0, deckWins: 0 });
}

// --- v5.2: CPU decision-quality taxonomy ------------------------------------
// Each entry: a decision point where a simple shadow (lookahead) heuristic,
// computed from the SAME visible state, would have chosen differently than
// the CPU's actual choice. Not all divergences are "wrong" (both heuristics
// are simplifications of the real optimum) — they're a signal for a human
// pass over the game log, same caveat as v5.1's tookGuardableLethal metric.
const cpuDecisions = {
  attackDivergence: 0, // shadow attacker set != actual attacker set
  attackOpportunities: 0,
  guardDivergence: 0, // shadow guard assignment leaves different residual damage
  guardOpportunities: 0,
  targetSuboptimal: 0, // removal aimed at a live enemy when a bigger one was legal
  targetOpportunities: 0,
  reactionWindowOpportunities: 0, // clashes where the defender had an open reaction window

};

// --- v5.2: essence-curve efficiency -----------------------------------------
const curveStats = {
  heldPlayableCardTurns: 0, // turn ended with an on-color, affordable-by-locations card still in hand
  totalTurns: 0,
  essenceFloatedEstimate: 0, // sum of (locations - cards played this turn) as a rough float proxy
};

// --- v5.3: color-vs-color matchup matrix (by Leader identity) --------------
const colorMatchup: Record<string, Record<string, { games: number; wins: number }>> = {};
for (const a of COLORS) {
  colorMatchup[a] = {};
  for (const b of COLORS) colorMatchup[a][b] = { games: 0, wins: 0 };
}

// --- v5.3: keyword carrier stats by carrier cost band ----------------------
type CostBand = '1-2' | '3-4' | '5+';
const bandOf = (t: number): CostBand => (t <= 2 ? '1-2' : t <= 4 ? '3-4' : '5+');
const kwBandStats: Record<string, Record<CostBand, { games: number; wins: number }>> = {};
for (const kw of KEYWORDS)
  kwBandStats[kw] = { '1-2': { games: 0, wins: 0 }, '3-4': { games: 0, wins: 0 }, '5+': { games: 0, wins: 0 } };

const mech = {
  games: 0,
  mulligans: 0,
  winnerVitalitySum: 0,
  loserDeckRemainingSum: 0,
  turnsTotal: 0,
  p1Wins: 0,
  vitalityWins: 0,
  deckOutWins: 0,
  turnLimitDraws: 0,
  totalSheds: 0,
  totalErode: 0,
  leaderInvokes: 0,
  leaderShatters: 0,
  leaderAbilityUses: 0,
  rebonds: 0,
  reactionPlays: 0,
  sanctumPlays: 0,
  charmPlays: 0,
  quickEventPlays: 0,
  slowEventPlays: 0,
  wastedEssenceTotal: 0,
  gameLengths: [] as number[],
};

const lapses = {
  missedLethal: 0, // had unguardable lethal available, didn't take it, game continued
  tookGuardableLethal: 0, // defender died to clash while holding unused ready guards
  venomousSuicide: 0, // attacked a board with a ready Venomous guard and lost the unit
  wastedEssenceWithPlay: 0, // phase ended with essence that could pay for a card in hand
  idleLeader: 0, // leader invoked but ability unused on a turn it had a legal use
  colorCloggedGames: 0, // game ended with >=3 hand cards never castable vs deck colors
};

// --- v5.3: engine telemetry hooks ------------------------------------------
// Real keyword activation counts + real wasted-essence measurement, fed by
// the engine at the moment things actually happen. Disabled during the
// seat-swap suite so it can't pollute the main tournament counters.
let telemetryEnabled = false;
telemetry.onKeywordProc = (kw, amount) => {
  if (!telemetryEnabled) return;
  if (kwStats[kw]) kwStats[kw].activations += amount;
};
telemetry.onEssenceCleared = (state) => {
  if (!telemetryEnabled) return;
  for (const pid of ['P1', 'P2'] as PlayerId[]) {
    const p = state.players[pid];
    const tot = essenceTotal(p.essence);
    if (tot <= 0) continue;
    mech.wastedEssenceTotal += tot;
    // Lapse only when the ACTIVE player ends a main phase with essence that
    // could pay for a castable hand card right now.
    if (
      pid === state.active &&
      (state.phase === 'Main1' || state.phase === 'Main2') &&
      p.hand.some(
        (c) =>
          c.def.type !== 'Leader' &&
          canPayCost(p.essence, c.def.cost) &&
          !(c.def.type === 'Charm' && p.field.length === 0),
      )
    ) {
      lapses.wastedEssenceWithPlay++;
    }
  }
};

const invariants: string[] = [];
function checkInvariants(state: GameState, game: number, turn: number): void {
  for (const pid of ['P1', 'P2'] as PlayerId[]) {
    const p = state.players[pid];
    if (p.hand.length > MAX_HAND && state.phase === 'Dawn')
      invariants.push(`g${game}t${turn}: ${pid} hand ${p.hand.length} > ${MAX_HAND} after Dusk`);
    if (p.vitality > LEADER_HP + 20)
      invariants.push(`g${game}t${turn}: ${pid} vitality ${p.vitality} runaway`);
    for (const u of p.field) {
      if (u.damage < 0) invariants.push(`g${game}t${turn}: negative damage on ${u.def.name}`);
      if (u.owner !== pid) invariants.push(`g${game}t${turn}: unit owner mismatch ${u.def.name}`);
    }
    const iids = new Set<string>();
    for (const zone of [p.hand, p.deck, p.ashPile, p.voidPile]) {
      for (const c of zone) {
        if (iids.has(c.iid)) invariants.push(`g${game}t${turn}: duplicate iid ${c.iid}`);
        iids.add(c.iid);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Per-game instrumentation
// ---------------------------------------------------------------------------
function deckColorSupply(deck: DeckDef): Set<string> {
  // Colors a deck can actually produce: leader identity (wellsprings) plus
  // any Sanctum produces.
  const out = new Set<string>();
  const leader = POOL_BY_ID[deck.leaderId];
  for (const c of Object.keys(leader?.cost?.pips ?? {})) out.add(c);
  for (const id of deck.cards) {
    const d = POOL_BY_ID[id];
    if (d?.produces) out.add(d.produces);
  }
  return out;
}

function unguardableLethal(state: GameState, pid: PlayerId): boolean {
  // Damage the defender cannot guard at all (no ready guards / aerial holes)
  // from ready attackers, vs their vitality.
  const opp = state.players[opponentOf(pid)];
  const ready = opp.field.filter((u) => !u.exhausted);
  let dmg = 0;
  for (const u of legalAttackers(state, pid)) {
    const guardable = ready.some((g) => {
      if (u.def.keywords?.includes('Aerial'))
        return g.def.keywords?.includes('Aerial') || g.def.keywords?.includes('Skywatch');
      return true;
    });
    if (!guardable) dmg += effMight(state, u);
  }
  return dmg >= opp.vitality;
}

/** Archetype cohort key: the acting Leader's id (8 fixed 2-color identities —
 * randomArchetype() always themes decks off the Leader's own colors, so
 * Leader id is a clean, stable cohort proxy for "deck archetype"). */
function archetypeOf(deck: DeckDef): string {
  return deck.leaderId;
}

/** Shadow (lookahead) heuristic: which ready attackers would deal EITHER
 * unguardable free damage OR a favorable/kill trade, independent of ai.ts's
 * actual chooseAttackers implementation. Used only to flag divergence — not
 * a claim that this heuristic is more correct. */
function shadowAttackers(state: GameState, pid: PlayerId): Set<string> {
  const opp = state.players[opponentOf(pid)];
  const ready = opp.field.filter((u) => !u.exhausted);
  const out = new Set<string>();
  // Replicates legalAttackers()'s field-state criteria without its phase
  // gate (this snapshot is taken pre-Main1, before state.phase === 'Clash').
  const candidates = state.players[pid].field.filter(
    (u) =>
      !u.exhausted &&
      !u.def.keywords?.includes('Immobile') &&
      (!u.enteredThisTurn || u.def.keywords?.includes('Reckless')),
  );
  for (const u of candidates) {
    const m = effMight(state, u);
    if (m <= 0) continue;
    const possibleGuards = ready.filter((g) => {
      if (u.def.keywords?.includes('Aerial'))
        return g.def.keywords?.includes('Aerial') || g.def.keywords?.includes('Skywatch');
      return true;
    });
    if (possibleGuards.length === 0) {
      out.add(u.iid);
      continue;
    }
    const worst = possibleGuards.sort((a, b) => effMight(state, b) - effMight(state, a))[0];
    const kills = m >= remainingGrit(state, worst) || u.def.keywords?.includes('Venomous');
    const survives = effMight(state, worst) < remainingGrit(state, u) || u.def.keywords?.includes('Unbreakable');
    if (kills && survives) out.add(u.iid);
  }
  return out;
}

/** Lightweight winner-only replay for the seat-swap suite (v5.2): plays a
 * full game with the same engine + CPU as runGame() but skips all telemetry
 * so it can be run twice per pair (once each seat) without touching the
 * main tournament's card/keyword/leader accumulators. */
function seatSwapGame(deckA: DeckDef, deckB: DeckDef, seed: number): PlayerId | null {
  telemetryEnabled = false;
  const rng = mulberry32(seed);
  const state = createGame(deckA, deckB, POOL_BY_ID, { rng });
  maybeMulliganPlayer(state, 'P1', rng);
  maybeMulliganPlayer(state, 'P2', rng);
  let turns = 0;
  while (!state.winner && turns < MAX_TURNS) {
    turns++;
    playTurn(state, state.active);
  }
  return state.winner;
}

function runGame(deckA: DeckDef, deckB: DeckDef, seed: number, game: number): void {
  const rng = mulberry32(seed);
  telemetryEnabled = false; // createGame runs Dawn; enable after setup
  const state = createGame(deckA, deckB, POOL_BY_ID, { rng });
  const mulled: Record<PlayerId, boolean> = { P1: false, P2: false };
  if (maybeMulliganPlayer(state, 'P1', rng)) {
    mech.mulligans++;
    mulled.P1 = true;
  }
  if (maybeMulliganPlayer(state, 'P2', rng)) {
    mech.mulligans++;
    mulled.P2 = true;
  }
  telemetryEnabled = true;

  const played: Record<PlayerId, Set<string>> = { P1: new Set(), P2: new Set() };
  const drawn: Record<PlayerId, Set<string>> = { P1: new Set(), P2: new Set() };
  const perGame = {
    erodeStart: { P1: state.players.P1.deck.length, P2: state.players.P2.deck.length },
    leaderAbilityUses: { P1: 0, P2: 0 },
  };
  for (const pid of ['P1', 'P2'] as PlayerId[])
    for (const c of state.players[pid].hand) drawn[pid].add(c.def.id);

  let turns = 0;
  let logCursor = 0;
  let firstClashTurn = 0;
  // Turn-8 vitality snapshot for the comeback metric.
  let vitAt8: Record<PlayerId, number> | null = null;
  while (!state.winner && turns < MAX_TURNS) {
    turns++;
    const pid = state.active;
    const p = state.players[pid];
    const preHand = new Set(p.hand.map((c) => c.iid));
    const preVit = state.players[opponentOf(pid)].vitality;
    const preLeaderResolve = p.leader.resolve;
    const hadLethal = state.phase === 'Main1' ? false : false;

    // Lethal check on a snapshot BEFORE the AI acts (Clash comes after Main1,
    // so approximate with pre-turn board: ready units that could attack).
    const couldLethal =
      p.field.some((u) => !u.exhausted && !u.enteredThisTurn) && unguardableLethal(state, pid);
    void hadLethal;

    // --- v5.2 shadow-decision snapshots (pre-turn state; Main1 rarely
    // shrinks the acting player's own ready-attacker set before Clash, so
    // this is a reasonable proxy for the state legalAttackers() saw). ---
    const preHasReadyAttacker = p.field.some(
      (u) => !u.exhausted && !u.def.keywords?.includes('Immobile') && (!u.enteredThisTurn || u.def.keywords?.includes('Reckless')),
    );
    const preShadowAttackers = preHasReadyAttacker ? shadowAttackers(state, pid) : null;
    const preOppBiggestByIid = new Map<string, number>();
    for (const u of state.players[opponentOf(pid)].field) {
      if (!u.def.keywords?.includes('Warded')) preOppBiggestByIid.set(u.iid, effMight(state, u));
    }
    const preOppMaxMight = preOppBiggestByIid.size
      ? Math.max(...preOppBiggestByIid.values())
      : 0;
    const preLocations = p.locations.length + (p.wellspringPlayedThisTurn ? 0 : 1);
    const preHandIds = new Set(p.hand.map((c) => c.iid));
    const preOppDeck = state.players[opponentOf(pid)].deck.length;

    const events = playTurn(state, pid);
    curveStats.totalTurns++;

    // --- event-based mechanics telemetry ---
    let usedAbility = false;
    for (const ev of events) {
      if (ev.kind === 'invoke') {
        const def = POOL_BY_ID[ev.iid.split('#')[0]];
        const actor = ev.by ?? pid;
        if (ev.by) mech.reactionPlays++;
        if (def) {
          // v6.0 tempo signature: first time this game this player played it.
          if (!played[actor].has(def.id)) {
            const s = cs(def.id);
            s.firstPlayTurnSum += turns;
            s.firstPlayGames++;
          }
          essenceSpentTotal += totalCost(def.cost);
          played[actor].add(def.id);
          cs(def.id).timesPlayed++;
          if (def.type === 'Location') mech.sanctumPlays++;
          if (def.type === 'Charm') mech.charmPlays++;
          if (def.type === 'Event' && def.subtype === 'Quick') mech.quickEventPlays++;
          if (def.type === 'Event' && def.subtype === 'Slow') mech.slowEventPlays++;
        }
      }
      if (ev.kind === 'leaderInvoke') mech.leaderInvokes++;
      if (ev.kind === 'leaderAbility') {
        mech.leaderAbilityUses++;
        usedAbility = true;
        perGame.leaderAbilityUses[pid]++;
      }
      if (ev.kind === 'rebond') mech.rebonds++;
      // v5.3: Ambush activation = a UNIT invoked during the reaction window.
      if (ev.kind === 'invoke' && ev.by) {
        const def = POOL_BY_ID[ev.iid.split('#')[0]];
        if (def?.keywords?.includes('Ambush')) kwStats['Ambush'].activations++;
      }
    }

    // v5.3: erode = the opponent's deck shrink during the acting player's
    // turn, net of any draws their own reaction-window Ambush units made
    // (the opponent never Deals otherwise on this turn).
    let oppReactionDraws = 0;
    for (const ev of events) {
      if (ev.kind === 'invoke' && ev.by) {
        const def = POOL_BY_ID[ev.iid.split('#')[0]];
        if (def?.onInvoke?.action === 'draw') oppReactionDraws += def.onInvoke.value ?? 0;
      }
    }
    mech.totalErode += Math.max(
      0,
      preOppDeck - state.players[opponentOf(pid)].deck.length - oppReactionDraws,
    );

    // --- lapse: missed lethal (had it pre-turn, opponent still alive) ---
    if (couldLethal && !state.winner) lapses.missedLethal++;

    // --- v5.2 CPU decision-quality taxonomy -----------------------------
    const attackEv = events.find((e) => e.kind === 'attack') as
      | { iids: string[] }
      | undefined;
    if (preShadowAttackers) {
      cpuDecisions.attackOpportunities++;
      const actual = new Set(attackEv?.iids ?? []);
      const same =
        actual.size === preShadowAttackers.size &&
        [...actual].every((i) => preShadowAttackers.has(i));
      if (!same) cpuDecisions.attackDivergence++;
    }

    const guardEv = events.find((e) => e.kind === 'guard') as
      | { assignments: Record<string, string[]> }
      | undefined;
    if (guardEv) {
      const defender = opponentOf(pid);
      const defField = state.players[defender].field;
      cpuDecisions.guardOpportunities++;
      // Shadow guard: for each attacker, if a ready blocker exists that both
      // kills the attacker AND survives, was it used? (Ignores the "must
      // chump for lethal" branch — that's covered by tookGuardableLethal.)
      const usedByActual = new Set(Object.values(guardEv.assignments).flat());
      let missedProfitable = false;
      for (const [attackerIid, guards] of Object.entries(guardEv.assignments)) {
        if (guards.length > 0) continue;
        const attacker = findUnit(state, attackerIid);
        if (!attacker) continue;
        const readyBlockers = defField.filter((g) => !g.exhausted && !usedByActual.has(g.iid));
        const profitable = readyBlockers.find(
          (g) =>
            effMight(state, g) >= remainingGrit(state, attacker) &&
            effMight(state, attacker) < remainingGrit(state, g),
        );
        if (profitable) missedProfitable = true;
      }
      if (missedProfitable) cpuDecisions.guardDivergence++;
    }

    // v5.3: venomous suicide — a non-Unbreakable attacker walked into a
    // declared Venomous guard and died in the exchange. (Guards are declared
    // AFTER attacks, so this only flags attacks into a board that already
    // showed a ready Venomous unit — i.e. the attacker had the information.)
    if (guardEv) {
      for (const [attackerIid, guardIids] of Object.entries(guardEv.assignments)) {
        if (guardIids.length === 0) continue;
        const aDef = POOL_BY_ID[attackerIid.split('#')[0]];
        if (!aDef || aDef.keywords?.includes('Unbreakable')) continue;
        const venomGuard = guardIids.some((g) =>
          POOL_BY_ID[g.split('#')[0]]?.keywords?.includes('Venomous'),
        );
        if (venomGuard && !findUnit(state, attackerIid)) lapses.venomousSuicide++;
      }
    }

    for (const ev of events) {
      if (ev.kind !== 'invoke') continue;
      const def = POOL_BY_ID[ev.iid.split('#')[0]];
      if (!def) continue;
      const isRemovalLike =
        def.onInvoke &&
        (def.onInvoke.action === 'shatter' ||
          def.onInvoke.action === 'banish' ||
          (def.onInvoke.action === 'damage' &&
            (def.onInvoke.target === 'enemyUnit' || def.onInvoke.target === 'anyTarget')));
      if (!isRemovalLike || !ev.targetIid) continue;
      cpuDecisions.targetOpportunities++;
      const chosenMight = preOppBiggestByIid.get(ev.targetIid) ?? -1;
      if (chosenMight >= 0 && chosenMight < preOppMaxMight) cpuDecisions.targetSuboptimal++;
    }

    // Reaction-window opportunity = a clash happened this turn (the defender
    // always gets an open reaction window before damage resolves). Usage
    // rate is reported via mech.reactionPlays / opportunities.
    if (guardEv) cpuDecisions.reactionWindowOpportunities++;

    // --- v6.0 board / clash / comeback sampling -------------------------
    boardMetrics.turnSamples++;
    boardMetrics.unitsOnBoardSum +=
      state.players.P1.field.length + state.players.P2.field.length;
    if (attackEv && attackEv.iids.length > 0) {
      clashMetrics.clashes++;
      clashMetrics.attackersSum += attackEv.iids.length;
      if (firstClashTurn === 0) firstClashTurn = turns;
    }
    if (turns === 8 && !vitAt8) {
      vitAt8 = { P1: state.players.P1.vitality, P2: state.players.P2.vitality };
    }

    // --- v5.2 essence-curve efficiency ---
    const cardsPlayedThisTurn = new Set(
      events.filter((e) => e.kind === 'invoke' && !e.by).map((e) => (e as { iid: string }).iid),
    );
    const heldPlayable = [...p.hand].some((c) => {
      if (preHandIds.has(c.iid) && !cardsPlayedThisTurn.has(c.iid)) {
        return totalCost(c.def.cost) <= preLocations;
      }
      return false;
    });
    if (heldPlayable) curveStats.heldPlayableCardTurns++;
    curveStats.essenceFloatedEstimate += Math.max(0, preLocations - cardsPlayedThisTurn.size);

    // --- lapse: idle leader (invoked, unused ability, resolve unchanged) ---
    if (
      !usedAbility &&
      p.leader.invoked &&
      !p.leader.shattered &&
      p.leader.resolve === preLeaderResolve &&
      (p.leader.def.leaderAbilities ?? []).some((a) => a.resolveDelta > 0)
    ) {
      lapses.idleLeader++; // a free +resolve builder was always legal
    }

    // --- log-based telemetry (engine log is append-only) ---
    for (; logCursor < state.log.length; logCursor++) {
      const line = state.log[logCursor];
      if (line.includes('sheds')) mech.totalSheds++;
    }

    // --- wasted essence: essence cleared while a hand card was affordable ---
    // (endPhase clears pools; detect via canInvoke against a replayed pool is
    // impractical post-hoc, so approximate: after the turn, if any hand card's
    // total cost <= locations count and it was castable-on-color, count waste
    // when the AI ended the turn without playing it two turns running.)
    void preHand;
    void preVit;

    checkInvariants(state, game, turns);

    // Defender lapse: died to CLASH damage holding 2+ ready (non-exhausted)
    // guards. Burn/leader-ability deaths are excluded via the clash event.
    if (state.winner && state.winner === pid && events.some((e) => e.kind === 'clash')) {
      const loser = state.players[opponentOf(pid)];
      // Units the loser invoked during the reaction window entered after
      // guards were declared — they could not have guarded.
      const lateArrivals = new Set(
        events.filter((e) => e.kind === 'invoke' && e.by).map((e) => (e as { iid: string }).iid),
      );
      const ready = loser.field.filter((u) => !u.exhausted && !lateArrivals.has(u.iid));
      // Only a lapse if an UNGUARDED attacker existed that a ready unit could
      // legally have guarded (Aerial rule respected).
      const clash = state.clash;
      if (loser.vitality <= 0 && ready.length > 0 && clash) {
        // Would assigning the loser's leftover ready guards (as chumps) have
        // kept them alive? Compare actual face damage vs best-case damage.
        const threat = (aIid: string): { face: number; a?: (typeof loser.field)[number] } => {
          const a = state.players[pid].field.find((u) => u.iid === aIid);
          if (!a) return { face: 0 };
          const hits = a.def.keywords?.includes('Doublestrike') ? 2 : 1;
          return { face: effMight(state, a) * hits, a };
        };
        let actual = 0;
        let bestCase = 0;
        const pool = [...ready];
        // Use the DECLARED guard assignments (the post-clash clash.guards map
        // drops guards that died absorbing the hit).
        const guardEv = [...events].reverse().find((e) => e.kind === 'guard') as
          | { assignments: Record<string, string[]> }
          | undefined;
        const declaredGuards = guardEv?.assignments ?? clash.guards;
        for (const aIid of clash.attackers) {
          const { face, a } = threat(aIid);
          if (!a) continue;
          const guarded = (declaredGuards[aIid]?.length ?? 0) > 0;
          const overrun = a.def.keywords?.includes('Overrun');
          if (guarded) {
            // Already guarded: same in both worlds (spill approximated 0).
            continue;
          }
          actual += face;
          const aerial = a.def.keywords?.includes('Aerial');
          const swarm = a.def.keywords?.includes('Swarmproof');
          const need = swarm ? 2 : 1;
          const eligibleIdx: number[] = [];
          pool.forEach((g, idx) => {
            if (!aerial || g.def.keywords?.includes('Aerial') || g.def.keywords?.includes('Skywatch'))
              eligibleIdx.push(idx);
          });
          if (eligibleIdx.length >= need) {
            let absorbed = 0;
            for (let k = 0; k < need; k++) {
              const g = pool[eligibleIdx[k] - k]; // adjust after splice
              absorbed += Math.max(1, remainingGrit(state, g));
              pool.splice(eligibleIdx[k] - k, 1);
            }
            bestCase += overrun ? Math.max(0, face - absorbed) : 0;
          } else {
            bestCase += face;
          }
        }
        const preClashVit = loser.vitality + actual;
        if (preClashVit > 0 && preClashVit - bestCase > 0) lapses.tookGuardableLethal++;
      }
    }
  }

  if (!state.winner) {
    mech.turnLimitDraws++;
  }
  mech.games++;
  mech.turnsTotal += turns;
  mech.gameLengths.push(turns);
  const winner = state.winner;
  if (winner === 'P1') mech.p1Wins++;
  if (winner) {
    const loser = state.players[opponentOf(winner)];
    if (loser.vitality <= 0) mech.vitalityWins++;
    else mech.deckOutWins++;
  }
  if (winner) {
    mech.winnerVitalitySum += state.players[winner].vitality;
    mech.loserDeckRemainingSum += state.players[opponentOf(winner)].deck.length;
    // v6.0 mulligan-outcome split + comeback rate.
    for (const pid of ['P1', 'P2'] as PlayerId[]) {
      const won = winner === pid;
      if (mulled[pid]) {
        mullOutcome.mullGames++;
        if (won) mullOutcome.mullWins++;
      } else {
        mullOutcome.keepGames++;
        if (won) mullOutcome.keepWins++;
      }
    }
    if (vitAt8) {
      comeback.measured++;
      if (vitAt8[winner] < vitAt8[opponentOf(winner)]) comeback.comebackWins++;
    }
  }
  if (firstClashTurn > 0) {
    clashMetrics.gamesWithClash++;
    clashMetrics.firstClashTurnSum += firstClashTurn;
  }
  void perGame.erodeStart; // v5.3: erode now tracked per-turn (see loop)

  // --- per-player postgame accounting ---
  const decks: Record<PlayerId, DeckDef> = { P1: deckA, P2: deckB };
  for (const pid of ['P1', 'P2'] as PlayerId[]) {
    const p = state.players[pid];
    const won = winner === pid;
    const deck = decks[pid];
    const supply = deckColorSupply(deck);

    // Hand cards drawn but never played (counted once per card id per game).
    const deadIds = new Set<string>();
    for (const c of p.hand) {
      drawn[pid].add(c.def.id);
      if (!played[pid].has(c.def.id)) deadIds.add(c.def.id);
    }
    for (const id of deadIds) cs(id).timesDeadInHand++;
    // Color-clogged: hand cards whose pips the deck can never produce.
    const clogged = p.hand.filter((c) =>
      Object.keys(c.def.cost?.pips ?? {}).some((col) => !supply.has(col)),
    );
    if (clogged.length >= 3) lapses.colorCloggedGames++;

    // Card stats.
    const inDeck = new Set(deck.cards);
    for (const id of inDeck) {
      const s = cs(id);
      s.inDeckGames++;
      if (won) s.inDeckWins++;
    }
    for (const id of played[pid]) {
      const s = cs(id);
      s.playedGames++;
      if (won) s.playedWins++;
    }
    for (const id of drawn[pid]) {
      const s = cs(id);
      s.drawnGames++;
      s.timesDrawn++;
      if (won) s.drawnWins++;
    }

    // Keyword carrier stats (played carriers only). v6.0: an invoked Leader
    // counts as a played carrier of its own Leader keywords
    // (Commander/Resolute), which never appear in invoke events.
    const kwSeen = new Set<string>();
    for (const id of played[pid]) {
      for (const kw of POOL_BY_ID[id]?.keywords ?? []) kwSeen.add(kw);
    }
    if (p.leader.invoked || p.leader.shattered) {
      for (const kw of p.leader.def.keywords ?? []) kwSeen.add(kw);
    }
    for (const kw of kwSeen) {
      kwStats[kw].carrierGames++;
      if (won) kwStats[kw].carrierWins++;
    }

    // v5.3: keyword carrier stats by carrier cost band (counted once per
    // (keyword, band) per game, mirroring the carrier-game convention).
    const kwBandSeen = new Set<string>();
    for (const id of played[pid]) {
      const d = POOL_BY_ID[id];
      for (const kw of d?.keywords ?? []) kwBandSeen.add(`${kw}|${bandOf(totalCost(d?.cost))}`);
    }
    for (const key of kwBandSeen) {
      const [kw, band] = key.split('|') as [string, CostBand];
      const s = kwBandStats[kw]?.[band];
      if (s) {
        s.games++;
        if (won) s.wins++;
      }
    }

    // v5.3: color-vs-color matchup matrix (Leader identity colors).
    const myCols = LEADER_COLORS[deck.leaderId] ?? [];
    const oppCols = LEADER_COLORS[decks[opponentOf(pid)].leaderId] ?? [];
    for (const a of myCols) {
      for (const b of oppCols) {
        colorMatchup[a][b].games++;
        if (won) colorMatchup[a][b].wins++;
      }
    }

    // v5.2: archetype cohort + archetype-scoped keyword carrier stats.
    const arch = archetypeOf(deck);
    const as = (archetypeStats[arch] ??= { games: 0, wins: 0 });
    as.games++;
    if (won) as.wins++;
    for (const kw of kwSeen) {
      const ka = (kwArchetypeStats[kw][arch] ??= { games: 0, wins: 0 });
      ka.games++;
      if (won) ka.wins++;
    }

    // v5.2: per-cost-tier win rates (played + deck baseline).
    for (const id of inDeck) {
      const t = ts(totalCost(POOL_BY_ID[id]?.cost));
      t.deckGames++;
      if (won) t.deckWins++;
    }
    for (const id of played[pid]) {
      const t = ts(totalCost(POOL_BY_ID[id]?.cost));
      t.playedGames++;
      if (won) t.playedWins++;
    }

    // Leader stats.
    const ls = (leaderStats[deck.leaderId] ??= {
      games: 0, wins: 0, invoked: 0, shattered: 0, abilityUses: 0,
    });
    ls.games++;
    if (won) ls.wins++;
    if (p.leader.invoked || p.leader.shattered) ls.invoked++;
    if (p.leader.shattered) {
      ls.shattered++;
      mech.leaderShatters++;
    }
    ls.abilityUses += perGame.leaderAbilityUses[pid];

    // Color stats (leader identity).
    for (const col of Object.keys(POOL_BY_ID[deck.leaderId]?.cost?.pips ?? {})) {
      colorStats[col].games++;
      if (won) colorStats[col].wins++;
    }
  }
}

// ---------------------------------------------------------------------------
// Run the tournament
// ---------------------------------------------------------------------------
console.log(`Fry Cards v5 sim: pool=${POOL_V4.length} cards, decks=${NUM_DECKS}, games/pairing=${GAMES_PER_PAIRING}, seed=${SEED}, deckSeed=${DECK_SEED}`);
const rootRng = mulberry32(DECK_SEED);
const decks: DeckDef[] = [];
for (let i = 0; i < NUM_DECKS; i++) decks.push(buildDeck(randomArchetype(rootRng)));

let game = 0;
for (let i = 0; i < decks.length; i++) {
  for (let j = 0; j < decks.length; j++) {
    if (i === j) continue;
    for (let g = 0; g < GAMES_PER_PAIRING; g++) {
      runGame(decks[i], decks[j], SEED * 7919 + game * 104729 + 13, game);
      game++;
    }
  }
}

// ---------------------------------------------------------------------------
// v5.2: paired-seed seat-swap suite — isolate the first-mover edge from
// cohort noise. For each of a fixed sample of deck pairings, play the SAME
// two decks under the SAME seed twice, once each way round, so the only
// thing that changes between the pair is which deck is P1. Kept in its own
// counters (not folded into card/keyword/leader stats) so it can't skew
// those cohorts.
// ---------------------------------------------------------------------------
const seatSwap = { pairs: 0, deckAWinsAsP1: 0, deckAWinsAsP2: 0 };
{
  const swapRng = mulberry32(SEED ^ 0x5eed5eed);
  const SEAT_SWAP_PAIRS = Math.min(200, decks.length * (decks.length - 1));
  for (let n = 0; n < SEAT_SWAP_PAIRS; n++) {
    const i = Math.floor(swapRng() * decks.length);
    let j = Math.floor(swapRng() * decks.length);
    if (j === i) j = (j + 1) % decks.length;
    const pairSeed = Math.floor(swapRng() * 1e9) + 1;
    // Run A-as-P1 / B-as-P2 and B-as-P1 / A-as-P2 with the identical seed.
    // We don't reuse runGame() (it would pollute the main tournament stats);
    // instead replay the same lightweight winner-only simulation.
    const winnerAisP1 = seatSwapGame(decks[i], decks[j], pairSeed);
    const winnerBisP1 = seatSwapGame(decks[j], decks[i], pairSeed);
    seatSwap.pairs++;
    if (winnerAisP1 === 'P1') seatSwap.deckAWinsAsP1++;
    if (winnerBisP1 === 'P2') seatSwap.deckAWinsAsP2++;
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
const pct = (a: number, b: number) => (b > 0 ? +((100 * a) / b).toFixed(1) : 0);

const cardReport = Object.entries(cardStats)
  .filter(([, s]) => s.playedGames >= 20)
  .map(([id, s]) => {
    const def = POOL_BY_ID[id];
    return {
      id,
      name: def?.name,
      type: def?.type,
      subtype: def?.subtype,
      cost: totalCost(def?.cost),
      keywords: def?.keywords ?? [],
      playedWin: pct(s.playedWins, s.playedGames),
      deckWin: pct(s.inDeckWins, s.inDeckGames),
      residual: +(pct(s.playedWins, s.playedGames) - pct(s.inDeckWins, s.inDeckGames)).toFixed(1),
      playedGames: s.playedGames,
      deadInHandRate: pct(s.timesDeadInHand, s.timesDrawn),
      avgFirstPlayTurn:
        s.firstPlayGames > 0 ? +(s.firstPlayTurnSum / s.firstPlayGames).toFixed(1) : null,
    };
  });

const byResidual = [...cardReport].sort((a, b) => b.residual - a.residual);

const costBands: Record<string, { games: number; wins: number; n: number }> = {};
for (const c of cardReport) {
  const band = String(c.cost);
  const cb = (costBands[band] ??= { games: 0, wins: 0, n: 0 });
  cb.n++;
  cb.games += c.playedGames;
  cb.wins += Math.round((c.playedWin / 100) * c.playedGames);
}

// v5.2: archetype-normalized keyword delta. For each keyword, weight each
// cohort's (carrierWin - cohortBaselineWin) by that cohort's carrier-game
// count, so a keyword's headline number reflects performance NET of which
// Leaders happened to carry it, not raw win%.
function archNormalizedDelta(kw: string): { delta: number; games: number } {
  let weighted = 0;
  let games = 0;
  for (const [arch, s] of Object.entries(kwArchetypeStats[kw])) {
    if (s.games === 0) continue;
    const baseline = archetypeStats[arch];
    if (!baseline || baseline.games === 0) continue;
    const cohortWin = (100 * s.wins) / s.games;
    const cohortBaseline = (100 * baseline.wins) / baseline.games;
    weighted += s.games * (cohortWin - cohortBaseline);
    games += s.games;
  }
  return { delta: games > 0 ? +(weighted / games).toFixed(1) : 0, games };
}

const kwReport = Object.entries(kwStats)
  .filter(([, s]) => s.carrierGames > 0)
  .map(([kw, s]) => {
    const norm = archNormalizedDelta(kw);
    const bands = Object.fromEntries(
      (Object.entries(kwBandStats[kw]) as [CostBand, { games: number; wins: number }][])
        .filter(([, b]) => b.games > 0)
        .map(([band, b]) => [band, { winPct: pct(b.wins, b.games), games: b.games }]),
    );
    return {
      keyword: kw,
      carrierWin: pct(s.carrierWins, s.carrierGames),
      carrierGames: s.carrierGames,
      activations: s.activations,
      poolCarriers: POOL_V4.filter((c: CardDef) => c.keywords?.includes(kw)).length,
      archetypeNormalizedDelta: norm.delta,
      byCostBand: bands,
    };
  })
  .sort((a, b) => b.carrierWin - a.carrierWin);

// v5.2: per-cost-tier win rates + residual vs that tier's deck baseline.
const tierReport = Object.entries(tierStats)
  .map(([tier, s]) => ({
    tier: Number(tier),
    playedWinPct: pct(s.playedWins, s.playedGames),
    deckWinPct: pct(s.deckWins, s.deckGames),
    residual: +(pct(s.playedWins, s.playedGames) - pct(s.deckWins, s.deckGames)).toFixed(1),
    playedGames: s.playedGames,
  }))
  .sort((a, b) => a.tier - b.tier);

// v5.2: CPU decision-quality taxonomy summary.
const cpuDecisionReport = {
  attack: {
    divergenceRate: pct(cpuDecisions.attackDivergence, cpuDecisions.attackOpportunities),
    opportunities: cpuDecisions.attackOpportunities,
  },
  guard: {
    divergenceRate: pct(cpuDecisions.guardDivergence, cpuDecisions.guardOpportunities),
    opportunities: cpuDecisions.guardOpportunities,
  },
  removalTargeting: {
    suboptimalRate: pct(cpuDecisions.targetSuboptimal, cpuDecisions.targetOpportunities),
    opportunities: cpuDecisions.targetOpportunities,
  },
  reactionWindow: {
    playsPerOpportunity: +(mech.reactionPlays / Math.max(1, cpuDecisions.reactionWindowOpportunities)).toFixed(2),
    opportunities: cpuDecisions.reactionWindowOpportunities,
  },
};

// v5.2: essence-curve efficiency.
const curveReport = {
  heldPlayableCardTurnPct: pct(curveStats.heldPlayableCardTurns, curveStats.totalTurns),
  totalTurns: curveStats.totalTurns,
  avgEssenceFloatedPerTurn: +(curveStats.essenceFloatedEstimate / Math.max(1, curveStats.totalTurns)).toFixed(2),
};

// v5.2: paired-seed seat-swap first-player-advantage measurement.
const seatSwapReport = {
  pairs: seatSwap.pairs,
  firstSeatWinPct: pct(seatSwap.deckAWinsAsP1 + seatSwap.deckAWinsAsP2, seatSwap.pairs * 2),
};

// v5.2 carry-forward: re-read the five v5.1 +1-cost-adjusted cards regardless
// of the >=20-played-games cutoff so they always show up in the report.
const WATCHLIST_IDS = [
  'heart_coral', 'needle_seamstress', 'merfolk_ritual', 'pufferfish_lantern', 'clawblade_greatsword',
];
const watchlistReport = WATCHLIST_IDS.map((id) => {
  const s = cs(id);
  const def = POOL_BY_ID[id];
  return {
    id,
    name: def?.name,
    cost: totalCost(def?.cost),
    playedWin: pct(s.playedWins, s.playedGames),
    deckWin: pct(s.inDeckWins, s.inDeckGames),
    residual: +(pct(s.playedWins, s.playedGames) - pct(s.inDeckWins, s.inDeckGames)).toFixed(1),
    playedGames: s.playedGames,
  };
});

const overallWin = 50;
const report = {
  meta: {
    version: 'v6.0',
    seed: SEED,
    deckSeed: DECK_SEED,
    decks: NUM_DECKS,
    gamesPerPairing: GAMES_PER_PAIRING,
    games: mech.games,
    poolSize: POOL_V4.length,
    generatedAt: new Date().toISOString(),
  },
  outcomes: {
    p1WinPct: pct(mech.p1Wins, mech.games),
    avgTurns: +(mech.turnsTotal / mech.games).toFixed(1),
    vitalityWinPct: pct(mech.vitalityWins, mech.games),
    deckOutWinPct: pct(mech.deckOutWins, mech.games),
    turnLimitDraws: mech.turnLimitDraws,
    turnHistogram: mech.gameLengths.reduce<Record<string, number>>((h, t) => {
      const b = t <= 10 ? '<=10' : t <= 20 ? '11-20' : t <= 30 ? '21-30' : '>30';
      h[b] = (h[b] ?? 0) + 1;
      return h;
    }, {}),
  },
  mechanics: {
    leaderInvokes: mech.leaderInvokes,
    leaderAbilityUses: mech.leaderAbilityUses,
    leaderShatters: mech.leaderShatters,
    rebonds: mech.rebonds,
    sanctumPlays: mech.sanctumPlays,
    charmPlays: mech.charmPlays,
    quickEventPlays: mech.quickEventPlays,
    slowEventPlays: mech.slowEventPlays,
    reactionPlays: mech.reactionPlays,
    shedsPerGame: +(mech.totalSheds / mech.games).toFixed(2),
    erodePerGame: +(mech.totalErode / mech.games).toFixed(2),
    wastedEssencePerGame: +(mech.wastedEssenceTotal / mech.games).toFixed(2),
    mulliganRatePct: pct(mech.mulligans, mech.games * 2),
    avgWinnerVitality: +(mech.winnerVitalitySum / Math.max(1, mech.games - mech.turnLimitDraws)).toFixed(1),
    avgLoserDeckRemaining: +(mech.loserDeckRemainingSum / Math.max(1, mech.games - mech.turnLimitDraws)).toFixed(1),
    essenceSpentPerGame: +(essenceSpentTotal / Math.max(1, mech.games)).toFixed(1),
  },
  // v6.0: board/clash texture, mulligan outcomes, comeback rate.
  boardMetrics: {
    avgUnitsOnBoard: +(boardMetrics.unitsOnBoardSum / Math.max(1, boardMetrics.turnSamples)).toFixed(2),
    turnSamples: boardMetrics.turnSamples,
  },
  clashMetrics: {
    clashesPerGame: +(clashMetrics.clashes / Math.max(1, mech.games)).toFixed(2),
    avgAttackersPerClash: +(clashMetrics.attackersSum / Math.max(1, clashMetrics.clashes)).toFixed(2),
    avgFirstClashTurn: +(clashMetrics.firstClashTurnSum / Math.max(1, clashMetrics.gamesWithClash)).toFixed(1),
    gamesWithClashPct: pct(clashMetrics.gamesWithClash, mech.games),
  },
  mulliganOutcome: {
    mullWinPct: pct(mullOutcome.mullWins, mullOutcome.mullGames),
    mullGames: mullOutcome.mullGames,
    keepWinPct: pct(mullOutcome.keepWins, mullOutcome.keepGames),
    keepGames: mullOutcome.keepGames,
  },
  comeback: {
    comebackWinPct: pct(comeback.comebackWins, comeback.measured),
    measuredGames: comeback.measured,
  },
  colorMatchups: Object.fromEntries(
    COLORS.map((a) => [
      a,
      Object.fromEntries(
        COLORS.filter((b) => colorMatchup[a][b].games > 0).map((b) => [
          b,
          { winPct: pct(colorMatchup[a][b].wins, colorMatchup[a][b].games), games: colorMatchup[a][b].games },
        ]),
      ),
    ]),
  ),
  lapses,
  invariantViolations: invariants.slice(0, 50),
  leaders: Object.fromEntries(
    Object.entries(leaderStats).map(([id, s]) => [
      id,
      {
        name: POOL_BY_ID[id]?.name,
        winPct: pct(s.wins, s.games),
        games: s.games,
        invokeRate: pct(s.invoked, s.games),
        shatterRate: pct(s.shattered, s.games),
        abilityUsesPerGame: +(s.abilityUses / Math.max(1, s.games)).toFixed(2),
      },
    ]),
  ),
  colors: Object.fromEntries(
    Object.entries(colorStats).map(([c, s]) => [c, { winPct: pct(s.wins, s.games), games: s.games }]),
  ),
  keywords: kwReport,
  costBands: Object.fromEntries(
    Object.entries(costBands).map(([b, s]) => [b, { cards: s.n, playedWinPct: pct(s.wins, s.games) }]),
  ),
  topOverperformers: byResidual.slice(0, 15),
  topUnderperformers: byResidual.slice(-15).reverse(),
  deadestInHand: [...cardReport].sort((a, b) => b.deadInHandRate - a.deadInHandRate).slice(0, 15),
  baselineWin: overallWin,
  archetypes: Object.fromEntries(
    Object.entries(archetypeStats).map(([id, s]) => [id, { name: POOL_BY_ID[id]?.name, winPct: pct(s.wins, s.games), games: s.games }]),
  ),
  costTiers: tierReport,
  cpuDecisionTaxonomy: cpuDecisionReport,
  essenceCurve: curveReport,
  seatSwap: seatSwapReport,
  watchlist: watchlistReport,
};

const outDir = path.join(process.cwd(), 'docs', 'sim-runs');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `v5-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log(JSON.stringify({ outcomes: report.outcomes, mechanics: report.mechanics, lapses: report.lapses, invariantCount: invariants.length }, null, 2));
console.log('\nLeaders:', JSON.stringify(report.leaders, null, 2));
console.log('\nColors:', JSON.stringify(report.colors, null, 2));
console.log('\nKeywords:', JSON.stringify(report.keywords, null, 2));
console.log('\nCost bands:', JSON.stringify(report.costBands, null, 2));
console.log('\nCost tiers (v5.2):', JSON.stringify(report.costTiers, null, 2));
console.log('\nCPU decision taxonomy (v5.2):', JSON.stringify(report.cpuDecisionTaxonomy, null, 2));
console.log('\nEssence curve (v5.2):', JSON.stringify(report.essenceCurve, null, 2));
console.log('\nSeat-swap first-player edge (v5.2):', JSON.stringify(report.seatSwap, null, 2));
console.log('\nBoard metrics (v6.0):', JSON.stringify(report.boardMetrics, null, 2));
console.log('\nClash metrics (v6.0):', JSON.stringify(report.clashMetrics, null, 2));
console.log('\nMulligan outcome (v6.0):', JSON.stringify(report.mulliganOutcome, null, 2));
console.log('\nComeback rate (v6.0):', JSON.stringify(report.comeback, null, 2));
console.log('\nColor matchups (v5.3):', JSON.stringify(report.colorMatchups, null, 2));
console.log('\nTop overperformers:');
for (const c of report.topOverperformers) console.log(`  ${c.name} (${c.type}${c.subtype ? '/' + c.subtype : ''}, cost ${c.cost}) played ${c.playedWin}% deck ${c.deckWin}% residual +${c.residual} [${c.keywords.join(',')}]`);
console.log('\nTop underperformers:');
for (const c of report.topUnderperformers) console.log(`  ${c.name} (${c.type}${c.subtype ? '/' + c.subtype : ''}, cost ${c.cost}) played ${c.playedWin}% deck ${c.deckWin}% residual ${c.residual} [${c.keywords.join(',')}]`);
console.log('\nDeadest in hand:');
for (const c of report.deadestInHand) console.log(`  ${c.name} cost ${c.cost} deadRate ${c.deadInHandRate}%`);
console.log(`\nReport written: ${outPath}`);
