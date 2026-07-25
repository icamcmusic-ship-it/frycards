/**
 * Fry Cards v5 balance & CPU-quality sim harness (essence engine).
 *
 * Runs seeded CPU-vs-CPU games across randomized coherent archetypes over
 * the FULL 292-card catalog (bundled fallback == live Supabase pool, parity
 * verified by scripts/fetch-cards.ts, and re-verified live for v6.2 — see
 * docs/BALANCE_SIM_FINDINGS_v6.2.md) and reports:
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
 * v5.2 additions (docs/BALANCE_SIM_FINDINGS_v6.1.md carry-forward items):
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
 * v6.1 additions:
 *  - Leader-vs-leader matchup matrix (8x8 win rates).
 *  - Per-card-type play stats (plays/game + played-game win rate by type).
 *  - Per-card playRatePerDeckGame (times played / games in deck).
 *  - Full-pool coverage: which of the non-Leader catalog cards were never
 *    drafted into a deck or never hit the table across the whole run.
 *  - Opening-hand curve quality: win rate by post-mulligan average cost.
 *  - Win-margin histogram (winner's remaining vitality buckets).
 *
 * v6.2 additions (carry-forward items from docs/BALANCE_SIM_FINDINGS_v6.1.md,
 * now superseded by docs/BALANCE_SIM_FINDINGS_v6.2.md):
 *  - Shadow attack heuristic rewritten to MIRROR ai.ts's actual chooseAttackers
 *    policy (all-in-when-lethal-survives-guarding, favorable trades, safe-vs-
 *    all, Swarmproof/Aerial awareness) instead of a strict kills-and-survives
 *    rule — the v6.1 40.1% "divergence" number was mostly the shadow model
 *    disagreeing with intentional v6.1 policy changes it was never updated
 *    for, not real CPU error.
 *  - venomousSuicide split into venomousSuicideDeliberate (a mutual trade, or
 *    part of a winning all-in) vs venomousSuicideBlunder (attacker died, the
 *    Venomous guard is unscathed — no value at all).
 *  - deckSeed-pinned per-Leader-pair suite (leaderPairSuite): one fixed,
 *    seeded deck per Leader, every ordered pair played both seats, isolating
 *    the Leader-kit signal from random-archetype cohort noise before any
 *    Leader-kit balance changes.
 *  - Cost-vs-ability outliers: z-score over the played/deck win-rate residual
 *    distribution (costAbilityOutliers), flagging |z| >= 1.5 cards regardless
 *    of how wide a given run's spread is.
 *
 * v6.3 additions:
 *  - Keyword dead-weight rate: of games where a keyword with real activation
 *    telemetry was carried onto the field/played, what % never actually
 *    fired (a discount candidate distinct from a low carrier win rate).
 *  - keptColorDeadHand lapse: ai.ts's handIsKeepable only checks a cheap
 *    (cost<=2) card AND a Unit exist in the opening hand, not whether either
 *    is castable under the deck's own producible colors — this flags hands
 *    kept by that rule that are still functionally dead on color.
 *  - Per-Leader idle-ability rate (leaderIdleAbility): splits the existing
 *    global idleLeader lapse by which Leader kit had a free resolve-builder
 *    available and unused, so a kit-specific CPU gap doesn't hide in the
 *    all-Leaders average.
 *  - Essence float by game stage (essenceFloatByStage): the active player's
 *    end-of-phase floated essence bucketed into early/mid/late turns, to
 *    tell whether float is an opening-curve artifact or a late-game leak.
 *
 * v6.4 additions:
 *  - Per-Leader-ability usage/value (leaderAbilityUsage): splits the existing
 *    flat abilityUsesPerGame by WHICH of a Leader's two abilities actually
 *    got picked and its win rate when used, keyed by the ability's own rules
 *    text — surfaces a kit where one ability is close to dead weight.
 *  - Guard-trade quality (guardTradeQuality / lapses.guardDiesForNothing): of
 *    every guard block actually assigned, whether it killed the attacker,
 *    traded with it, or died for nothing — a defender-side lapse signal
 *    distinct from the existing attacker-side venomousSuicide and the
 *    missed-profitable-block guardDivergence check.
 *
 * Usage: npx tsx scripts/simulate-v5.ts [gamesPerPairing] [numDecks] [seed] [deckSeed]
 * Output: JSON report to docs/sim-runs/ + console summary.
 */
import * as fs from 'fs';
import * as path from 'path';
import { totalCost, CardDef, LEADER_HP } from '../src/game/v3/cards';
import { COLORS } from '../src/game/v3/colors';
import { KEYWORDS } from '../src/game/v3/keywords';
import {
  GameState,
  PlayerId,
  UnitInst,
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
  unitHasKw,
  telemetry,
} from '../src/game/v3/engine';
import { LEADER_COLORS, KEYWORDS_OF_COLOR } from '../src/game/v3/colors';
import { POOL_BY_ID, POOL_V4, POOL_LEADERS } from '../src/game/v3/cardpool';
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

// v6.4: per-Leader-ability usage/value — the existing abilityUsesPerGame is a
// single number per Leader summing BOTH abilities together, which hides a
// kit where one ability (e.g. the Resolve-builder) is chosen every game and
// the other (the Resolve-spender) is picked so rarely it's effectively dead
// weight. Keyed by the ability's own rules text (unique per Leader+ability,
// already carried on the leaderAbility event) so no engine change is needed.
const leaderAbilityStats: Record<string, Record<string, { uses: number; gamesWithUse: number; wins: number }>> = {};
function las(leaderId: string, text: string) {
  const m = (leaderAbilityStats[leaderId] ??= {});
  return (m[text] ??= { uses: 0, gamesWithUse: 0, wins: 0 });
}

// v6.4: guard-trade quality — of every guard block actually assigned, did it
// kill the attacker, trade with it, or just die for nothing? A new lapse
// category distinct from the existing guardDivergence (missed profitable
// block) and venomousSuicide (attacker-side blunder): this is the
// DEFENDER assigning a guard that accomplishes nothing (dies, attacker
// lives) when a lethal-necessity check wasn't in play — a clean signal for
// a bad chump-block heuristic.
const guardOutcomes = { guardWins: 0, mutualTrade: 0, guardDiesForNothing: 0, guardSurvivesNoKill: 0 };
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

// --- v6.1: leader-vs-leader matchup matrix ---------------------------------
const leaderMatchup: Record<string, Record<string, { games: number; wins: number }>> = {};

// --- v6.1: per-card-type play stats -----------------------------------------
const typeStats: Record<string, { plays: number; playedGames: number; playedWins: number }> = {};
function tps(t: string) {
  return (typeStats[t] ??= { plays: 0, playedGames: 0, playedWins: 0 });
}

// --- v6.1: opening-hand curve quality ---------------------------------------
// Win rate bucketed by the average printed cost of the (post-mulligan)
// opening hand — measures how punishing a top-heavy opener is.
const openingCurve: Record<string, { games: number; wins: number }> = {};
const openingBucket = (avg: number) => (avg < 2.5 ? '<2.5' : avg < 3.5 ? '2.5-3.5' : '>=3.5');

// --- v6.1: win-margin histogram (winner's remaining vitality) ---------------
const winMargin: Record<string, number> = {};
const marginBucket = (v: number) => (v <= 5 ? '1-5' : v <= 10 ? '6-10' : v <= 15 ? '11-15' : '16+');

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
  // v6.2 (carry-forward #3): split venomousSuicide into a MUTUAL trade (the
  // attacker also killed the Venomous guard — a deliberate trade, even if a
  // costly one) or the attack was part of a successful all-in lethal swing
  // (deliberate regardless of the individual trade) vs a genuine blunder
  // (the attacker died and the guard walked away with nothing to show for it).
  venomousSuicideDeliberate: 0,
  venomousSuicideBlunder: 0,
  wastedEssenceWithPlay: 0, // phase ended with essence that could pay for a card in hand
  idleLeader: 0, // leader invoked but ability unused on a turn it had a legal use
  colorCloggedGames: 0, // game ended with >=3 hand cards never castable vs deck colors
  // v6.3: opening hand kept (per handIsKeepable's cheap+unit rule) even though
  // its only qualifying cheap/unit card(s) are off-color for the deck's own
  // producible colors — handIsKeepable (ai.ts) checks cost/type but not color,
  // so a "keepable" hand can still be functionally dead this game.
  keptColorDeadHand: 0,
  // v6.4: a defender-assigned guard died without killing (or even scratching
  // meaningfully — see guardOutcomes for the full breakdown) its attacker.
  guardDiesForNothing: 0,
};

// v6.3: per-leader idle-leader breakdown (global lapses.idleLeader stays the
// headline number; this splits it by which Leader kit had the free-builder
// available and unused, since some Leaders lean on their ability far more
// than others).
const leaderIdleStats: Record<string, { opportunities: number; idle: number }> = {};
function lis(id: string) {
  return (leaderIdleStats[id] ??= { opportunities: 0, idle: 0 });
}

// v6.3: keyword "dead weight" rate — carrier games where a keyword with real
// telemetry (Siphon/Hardened/Soulbound/Venomous/Regenerate/Sacred/Resolute/
// Bountiful/Surge/Resonant/Runic/Quickstrike/Overrun/Ambush) never actually
// fired despite being on the battlefield/played that game. Passive always-on
// keywords with no discrete "activation" (Aerial, Warded, Unbreakable, Alert,
// Swarmproof, Skywatch, Immobile, Commander) are excluded — they have no
// telemetry hook and "never activated" wouldn't mean anything for them.
const TELEMETRY_KEYWORDS = new Set([
  'Siphon', 'Hardened', 'Soulbound', 'Venomous', 'Regenerate', 'Sacred',
  'Resolute', 'Bountiful', 'Surge', 'Resonant', 'Runic', 'Quickstrike',
  'Overrun', 'Ambush',
]);
const kwDeadWeight: Record<string, { carrierGames: number; neverActivatedGames: number }> = {};
for (const kw of TELEMETRY_KEYWORDS) kwDeadWeight[kw] = { carrierGames: 0, neverActivatedGames: 0 };
let gameKwActivations: Record<string, number> = {};

// v6.3: wasted essence bucketed by game phase (early/mid/late turns) — is
// float concentrated in the opening curve (still learning the hand) or does
// it persist into the late game (a real CPU curve-efficiency gap)?
const essenceFloatByStage = {
  early: { total: 0, turns: 0 }, // turns 1-6
  mid: { total: 0, turns: 0 }, // turns 7-14
  late: { total: 0, turns: 0 }, // turns 15+
};
function stageOf(turn: number): keyof typeof essenceFloatByStage {
  return turn <= 6 ? 'early' : turn <= 14 ? 'mid' : 'late';
}

// --- v5.3: engine telemetry hooks ------------------------------------------
// Real keyword activation counts + real wasted-essence measurement, fed by
// the engine at the moment things actually happen. Disabled during the
// seat-swap suite so it can't pollute the main tournament counters.
let telemetryEnabled = false;
telemetry.onKeywordProc = (kw, amount) => {
  if (!telemetryEnabled) return;
  if (kwStats[kw]) kwStats[kw].activations += amount;
  if (TELEMETRY_KEYWORDS.has(kw)) gameKwActivations[kw] = (gameKwActivations[kw] ?? 0) + amount;
};
telemetry.onEssenceCleared = (state) => {
  if (!telemetryEnabled) return;
  const stage = essenceFloatByStage[stageOf(state.turn)];
  stage.turns++;
  stage.total += essenceTotal(state.players[state.active].essence);
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
    // v6.2: the old `hand.length > MAX_HAND && phase === 'Dawn'` check is
    // NOT a reliable invariant and has been removed. Dusk unconditionally
    // sheds to <=MAX_HAND (engine.ts runDusk's `while` loop — covered
    // directly by engine.test.ts's "dusk sheds down to MAX_HAND"), but
    // state.phase only reads 'Dawn' externally in the rare case a game ends
    // mid-runDawn, and by then this player's own Dawn draw AND any atDawn
    // trigger effects (a Tide Sanctum can draw several) have already legally
    // stacked the hand past MAX_HAND — there is no fixed ceiling to check
    // against without re-deriving how many draw triggers fired. Both
    // thresholds tried this pass (`> MAX_HAND`, then `> MAX_HAND + 1`) fired
    // on entirely legal hands and were removed as false positives.
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

/** Damage `raw` actually marks on `target` (Hardened shaves 1 per packet). */
function shadowPacketDamage(target: UnitInst, raw: number): number {
  return target.def.keywords?.includes('Hardened') ? Math.max(0, raw - 1) : raw;
}

/**
 * v6.2: shadow (lookahead) heuristic re-derived to MIRROR ai.ts's actual
 * chooseAttackers policy (free damage, all-in-when-lethal-survives-guarding,
 * favorable trades, safe-vs-all, Swarmproof/Aerial awareness) instead of the
 * old strict kills-and-survives-only rule. The v6.1 pass shipped an attack
 * policy with more nuance than the shadow model (free attacks, favorable
 * trades, all-in math with guard absorption) and never updated the shadow
 * heuristic to match, so its 40.1% "divergence" rate was mostly the shadow
 * model being stricter than the real (intentional) policy — noise, not
 * signal. This version replicates the real policy's branches so a residual
 * divergence again means something. Used only to flag divergence — not a
 * claim this is more "correct" than ai.ts, just that it now measures the
 * same thing ai.ts intends to do. */
function shadowAttackers(state: GameState, pid: PlayerId): Set<string> {
  const me = state.players[pid];
  const opp = state.players[opponentOf(pid)];
  const defenders = opp.field.filter((u) => !u.exhausted);
  // Replicates legalAttackers()'s field-state criteria without its phase
  // gate (this snapshot is taken pre-Main1, before state.phase === 'Clash').
  const candidates = state.players[pid].field.filter(
    (u) =>
      !u.exhausted &&
      !u.def.keywords?.includes('Immobile') &&
      (!u.enteredThisTurn || u.def.keywords?.includes('Reckless')),
  );
  const firstStriker = (x: UnitInst) =>
    unitHasKw(x, 'Quickstrike') || unitHasKw(x, 'Doublestrike');
  const canBlock = (a: UnitInst, g: UnitInst) =>
    !unitHasKw(a, 'Aerial') || unitHasKw(g, 'Aerial') || unitHasKw(g, 'Skywatch');
  const attackerKills = (a: UnitInst, g: UnitInst) => {
    const hit = shadowPacketDamage(g, effMight(state, a));
    return (
      hit >= remainingGrit(state, g) ||
      (unitHasKw(a, 'Venomous') && hit > 0 && !unitHasKw(g, 'Unbreakable'))
    );
  };
  const attackerSurvives = (a: UnitInst, g: UnitInst) => {
    if (unitHasKw(a, 'Unbreakable')) return true;
    const hit = shadowPacketDamage(a, effMight(state, g));
    const dies = hit >= remainingGrit(state, a) || (unitHasKw(g, 'Venomous') && hit > 0);
    if (!dies) return true;
    return firstStriker(a) && !firstStriker(g) && attackerKills(a, g);
  };
  // All-in check: does total damage clear vitality assuming each ready
  // defender fully absorbs one attacker (biggest first; Overrun still spills
  // past the guard's remaining grit)?
  const sorted = [...candidates].sort((a, b) => effMight(state, b) - effMight(state, a));
  // v6.4: pool of not-yet-assigned defenders, consumed as guards get
  // assigned below (mirrors ai.ts's chooseAttackers fix — guard *count* was
  // grossly overestimating Overrun spill by ignoring the guard's actual
  // remaining grit; kept in lockstep with ai.ts since this function's whole
  // purpose is mirroring its real policy).
  const guardPool = [...defenders];
  let throughDamage = 0;
  for (const u of sorted) {
    const m = effMight(state, u);
    const eligible = guardPool.filter((g) => canBlock(u, g));
    const needed = unitHasKw(u, 'Swarmproof') ? 2 : 1;
    const guardable = eligible.length >= needed;
    if (!guardable) {
      throughDamage += m;
    } else {
      const used = eligible
        .sort((a, b) => remainingGrit(state, b) - remainingGrit(state, a))
        .slice(0, needed);
      for (const g of used) guardPool.splice(guardPool.indexOf(g), 1);
      if (unitHasKw(u, 'Overrun')) {
        const absorbed = used.reduce((s, g) => s + Math.max(1, remainingGrit(state, g)), 0);
        throughDamage += Math.max(0, m - absorbed);
      }
    }
  }
  if (throughDamage >= opp.vitality) return new Set(candidates.map((u) => u.iid));
  const out = new Set<string>();
  for (const u of candidates) {
    const m = effMight(state, u);
    if (m <= 0) continue;
    const possibleGuards = defenders.filter((g) => canBlock(u, g));
    if (possibleGuards.length === 0 || (unitHasKw(u, 'Swarmproof') && possibleGuards.length < 2)) {
      out.add(u.iid);
      continue;
    }
    const worst = possibleGuards.sort((a, b) => effMight(state, b) - effMight(state, a))[0];
    const kills = attackerKills(u, worst);
    const survives = attackerSurvives(u, worst);
    const safeVsAll = possibleGuards.every((g) => attackerSurvives(u, g));
    const notBehind = me.field.length >= opp.field.length;
    const favorableTrade =
      kills && notBehind && totalCost(worst.def.cost) > totalCost(u.def.cost);
    if ((kills && survives) || safeVsAll || favorableTrade) out.add(u.iid);
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
  gameKwActivations = {};

  // v6.3: keptColorDeadHand — handIsKeepable (ai.ts) only checks a cheap
  // (cost<=2) card AND a Unit exist in the hand, not whether either is
  // actually castable under this deck's own producible colors. A hand kept
  // by that rule can still be functionally dead if its only qualifying
  // cheap card and/or Unit is off-color.
  const decksByPid: Record<PlayerId, DeckDef> = { P1: deckA, P2: deckB };
  for (const pid of ['P1', 'P2'] as PlayerId[]) {
    if (mulled[pid]) continue;
    const supply = deckColorSupply(decksByPid[pid]);
    const castable = (c: { def: CardDef }) =>
      Object.keys(c.def.cost?.pips ?? {}).every((col) => supply.has(col));
    const hand = state.players[pid].hand;
    const hasCastableCheap = hand.some((c) => totalCost(c.def.cost) <= 2 && castable(c));
    const hasCastableUnit = hand.some((c) => c.def.type === 'Unit' && castable(c));
    if (!hasCastableCheap || !hasCastableUnit) lapses.keptColorDeadHand++;
  }

  telemetryEnabled = true;

  // v6.1: opening-hand curve quality (post-mulligan hand).
  const openingAvgCost: Record<PlayerId, number> = { P1: 0, P2: 0 };
  for (const pid of ['P1', 'P2'] as PlayerId[]) {
    const hand = state.players[pid].hand;
    if (hand.length > 0)
      openingAvgCost[pid] = hand.reduce((s, c) => s + totalCost(c.def.cost), 0) / hand.length;
  }

  const played: Record<PlayerId, Set<string>> = { P1: new Set(), P2: new Set() };
  const drawn: Record<PlayerId, Set<string>> = { P1: new Set(), P2: new Set() };
  // v6.4: leader-ability texts each player actually used this game.
  const abilityTextsUsed: Record<PlayerId, Set<string>> = { P1: new Set(), P2: new Set() };
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
    // v6.3: whether a free +resolve builder was LEGALLY available this turn,
    // snapshot pre-turn (activateLeaderAbility has no cost/cap beyond
    // "once per turn, invoked, not shattered" for a resolveDelta>0 ability —
    // so this is always true given those three static conditions, independent
    // of what the player/CPU actually does this turn). Computing it this way
    // (rather than inferring "opportunity" from the post-turn resolve delta,
    // as the original idleLeader lapse's condition effectively did) avoids a
    // tautology: resolve-unchanged-after-the-turn ALREADY implies no ability
    // (plus or minus) was used at all — every turn matching that post-hoc
    // check is definitionally "idle", so a per-leader breakdown gated the
    // same way could only ever read 100%.
    const hadPlusAbilityOpportunity =
      p.leader.invoked &&
      !p.leader.shattered &&
      (p.leader.def.leaderAbilities ?? []).some((a) => a.resolveDelta > 0);
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
          tps(def.type).plays++;
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
        const text = ev.text ?? ev.name;
        las(decksByPid[pid].leaderId, text).uses++;
        abilityTextsUsed[pid].add(text);
      }
      if (ev.kind === 'rebond') mech.rebonds++;
      // v5.3: Ambush activation = a UNIT invoked during the reaction window.
      if (ev.kind === 'invoke' && ev.by) {
        const def = POOL_BY_ID[ev.iid.split('#')[0]];
        if (def?.keywords?.includes('Ambush')) {
          kwStats['Ambush'].activations++;
          // v6.3: this is a direct harness-side increment (not routed through
          // telemetry.onKeywordProc like every other keyword), so it needs
          // its own gameKwActivations bump or keywordDeadWeight sees a false
          // 100% never-activated rate for Ambush every run.
          gameKwActivations['Ambush'] = (gameKwActivations['Ambush'] ?? 0) + 1;
        }
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
      // v6.2: whether this turn's attack ended in a win (all-in lethal that
      // connected) makes ANY suicide along the way deliberate — the CPU
      // correctly traded a unit for the win.
      const wonThisTurn = !!state.winner && state.winner === pid;
      for (const [attackerIid, guardIids] of Object.entries(guardEv.assignments)) {
        if (guardIids.length === 0) continue;
        const aDef = POOL_BY_ID[attackerIid.split('#')[0]];
        if (!aDef || aDef.keywords?.includes('Unbreakable')) continue;
        const venomGuardIid = guardIids.find(
          (g) => POOL_BY_ID[g.split('#')[0]]?.keywords?.includes('Venomous'),
        );
        if (!venomGuardIid || findUnit(state, attackerIid)) continue;
        lapses.venomousSuicide++;
        // Deliberate trade = the attacker also killed the Venomous guard (a
        // mutual kill, even if costly) OR the swing was part of a winning
        // all-in. Genuine blunder = the attacker died and the guard is still
        // standing — nothing was gained for the loss.
        const guardDied = !findUnit(state, venomGuardIid);
        if (wonThisTurn || guardDied) lapses.venomousSuicideDeliberate++;
        else lapses.venomousSuicideBlunder++;
      }
    }

    // v6.4: guard-trade quality — for every guard actually assigned, did it
    // kill the attacker, trade with it, or die for nothing? Independent of
    // the venomous-suicide check above (which is attacker-side and Venomous-
    // specific), this is a defender-side signal on the guard's own value.
    if (guardEv) {
      for (const [attackerIid, guardIids] of Object.entries(guardEv.assignments)) {
        const attackerAlive = !!findUnit(state, attackerIid);
        for (const guardIid of guardIids) {
          const guardAlive = !!findUnit(state, guardIid);
          if (!attackerAlive && guardAlive) guardOutcomes.guardWins++;
          else if (!attackerAlive && !guardAlive) guardOutcomes.mutualTrade++;
          else if (attackerAlive && !guardAlive) {
            guardOutcomes.guardDiesForNothing++;
            lapses.guardDiesForNothing++;
          } else guardOutcomes.guardSurvivesNoKill++;
        }
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
      // v6.2 fix: Shatter can never legally target an Unbreakable unit (the
      // engine no-ops it, and autoTarget/ai.ts's chooseTarget both correctly
      // exclude Unbreakable from consideration for shatter effects). The old
      // check compared against preOppMaxMight, which includes Unbreakable
      // units regardless of the effect — so a correct shatter-around-the-
      // Unbreakable-wall pick was flagged as "suboptimal" every time. Exclude
      // Unbreakable from the legal-target pool for shatter specifically.
      const isShatter = def.onInvoke?.action === 'shatter';
      const legalMights = [...preOppBiggestByIid.entries()]
        .filter(([iid]) => !isShatter || !POOL_BY_ID[iid.split('#')[0]]?.keywords?.includes('Unbreakable'))
        .map(([, m]) => m);
      const legalMaxMight = legalMights.length ? Math.max(...legalMights) : 0;
      const chosenMight = preOppBiggestByIid.get(ev.targetIid) ?? -1;
      if (chosenMight >= 0 && chosenMight < legalMaxMight) cpuDecisions.targetSuboptimal++;
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
    if (hadPlusAbilityOpportunity) {
      const li = lis(decksByPid[pid].leaderId);
      li.opportunities++;
      if (!usedAbility) {
        lapses.idleLeader++; // a free +resolve builder was always legal
        li.idle++;
      }
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
      // v6.2 fix: declareGuards() never exhausts a guarding unit (only
      // attacking does, sans Alert), so a unit that already guarded THIS
      // clash and survived is still `!exhausted` — it was NOT a spare,
      // unused guard. The old `ready` filter counted every already-used
      // guard as "available and unused," which inflated tookGuardableLethal
      // with false positives (the CPU's actual chooseGuards output already
      // used those units; there was nothing extra left to assign). Exclude
      // anyone who appears in ANY attacker's declared guard list.
      const alreadyGuarded = new Set(
        Object.values((events.find((e) => e.kind === 'guard') as { assignments?: Record<string, string[]> } | undefined)?.assignments ?? {}).flat(),
      );
      const ready = loser.field.filter(
        (u) => !u.exhausted && !lateArrivals.has(u.iid) && !alreadyGuarded.has(u.iid),
      );
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
    // v6.1: win-margin histogram + leader-vs-leader matchup matrix.
    const wv = state.players[winner].vitality;
    if (wv > 0) winMargin[marginBucket(wv)] = (winMargin[marginBucket(wv)] ?? 0) + 1;
    const winDeck = winner === 'P1' ? deckA : deckB;
    const loseDeck = winner === 'P1' ? deckB : deckA;
    const lm = ((leaderMatchup[winDeck.leaderId] ??= {})[loseDeck.leaderId] ??= { games: 0, wins: 0 });
    lm.games++;
    lm.wins++;
    const lmRev = ((leaderMatchup[loseDeck.leaderId] ??= {})[winDeck.leaderId] ??= { games: 0, wins: 0 });
    lmRev.games++;
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

    // v6.4: per-Leader-ability usage outcome.
    for (const text of abilityTextsUsed[pid]) {
      const s = las(deck.leaderId, text);
      s.gamesWithUse++;
      if (won) s.wins++;
    }

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

    // v6.1: opening-hand curve outcome + per-type played-game outcomes.
    if (winner) {
      const oc = (openingCurve[openingBucket(openingAvgCost[pid])] ??= { games: 0, wins: 0 });
      oc.games++;
      if (won) oc.wins++;
    }
    const typesPlayed = new Set<string>();
    for (const id of played[pid]) {
      const t = POOL_BY_ID[id]?.type;
      if (t) typesPlayed.add(t);
    }
    for (const t of typesPlayed) {
      const s = tps(t);
      s.playedGames++;
      if (won) s.playedWins++;
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

    // v6.3: dead-weight rate — this player carried the keyword but it never
    // fired all game (gameKwActivations is shared across both players; a real
    // activation by either side still means the keyword did SOMETHING this
    // game, matching how carrierGames itself is already counted per-player
    // independent of who triggered it).
    for (const kw of kwSeen) {
      if (!TELEMETRY_KEYWORDS.has(kw)) continue;
      kwDeadWeight[kw].carrierGames++;
      if (!gameKwActivations[kw]) kwDeadWeight[kw].neverActivatedGames++;
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
const seatSwap = { pairs: 0, deckAWinsAsP1: 0, deckAWinsAsP2: 0, firstSeatWins: 0, decidedGames: 0 };
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
    // v6.1 fix: the actual first-seat edge — how often the P1 SEAT wins,
    // across both orderings. (The old firstSeatWinPct summed deck A's wins
    // in both seats, i.e. deck A's overall win rate, which is ~50% by
    // construction and measured nothing.)
    for (const w of [winnerAisP1, winnerBisP1]) {
      if (w) {
        seatSwap.decidedGames++;
        if (w === 'P1') seatSwap.firstSeatWins++;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// v6.2 (carry-forward #5): deckSeed-pinned per-Leader-pair suite. The
// existing leaderMatchup matrix mixes in every random deck's own archetype
// noise (curve, effect leanings) on top of the Leader kit signal — a real
// confound before touching Leader-specific balance. This suite instead
// builds exactly ONE deterministic, seeded deck per Leader (same deck every
// run for a given DECK_SEED) and plays every ordered pair of Leaders under
// both seats, so the only things that vary between cells are the Leader kit
// and the game's random seed. Kept in its own report section, isolated from
// the main tournament and leaderMatchup accumulators.
// ---------------------------------------------------------------------------
function strHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function pinnedDeckForLeader(leaderId: string): DeckDef {
  const identity = LEADER_COLORS[leaderId] ?? [];
  const themePool = identity.flatMap((c) => KEYWORDS_OF_COLOR[c]);
  const keywords = [...new Set(themePool)];
  const effects = ['damage', 'shatter', 'draw', 'buff'];
  return buildDeck({
    label: `${POOL_BY_ID[leaderId]?.name ?? leaderId} — Pinned`,
    leaderId,
    keywords,
    effects,
    units: 34,
    spells: 21,
    sanctums: 5,
    seed: (strHash(leaderId) ^ DECK_SEED) >>> 0,
  });
}
const LEADER_PAIR_SEAT_GAMES = 12; // per ordered pair, per seat orientation
const leaderPairSuite: Record<string, Record<string, { games: number; wins: number }>> = {};
{
  const leaderIds = POOL_LEADERS.map((l) => l.id);
  const pinnedDecks: Record<string, DeckDef> = {};
  for (const lid of leaderIds) pinnedDecks[lid] = pinnedDeckForLeader(lid);
  const pairRng = mulberry32((DECK_SEED ^ 0x1ead9f) >>> 0);
  for (const a of leaderIds) {
    for (const b of leaderIds) {
      if (a === b) continue;
      const cell = ((leaderPairSuite[a] ??= {})[b] ??= { games: 0, wins: 0 });
      for (let g = 0; g < LEADER_PAIR_SEAT_GAMES; g++) {
        const seed1 = Math.floor(pairRng() * 1e9) + 1;
        const w1 = seatSwapGame(pinnedDecks[a], pinnedDecks[b], seed1);
        cell.games++;
        if (w1 === 'P1') cell.wins++;
        const seed2 = Math.floor(pairRng() * 1e9) + 1;
        const w2 = seatSwapGame(pinnedDecks[b], pinnedDecks[a], seed2);
        cell.games++;
        if (w2 === 'P2') cell.wins++;
      }
    }
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
      // v6.1: how often the card actually hits the table when decked.
      playRatePerDeckGame: s.inDeckGames > 0 ? +(s.timesPlayed / s.inDeckGames).toFixed(2) : 0,
      deadInHandRate: pct(s.timesDeadInHand, s.timesDrawn),
      avgFirstPlayTurn:
        s.firstPlayGames > 0 ? +(s.firstPlayTurnSum / s.firstPlayGames).toFixed(1) : null,
    };
  });

const byResidual = [...cardReport].sort((a, b) => b.residual - a.residual);

// v6.2: cost-vs-ability outliers as a z-score over the residual distribution
// (residual = played-win-rate minus in-deck-baseline win-rate, the practical
// proxy for "is this card's ability/stat budget over- or under-paying its
// printed cost" since cardpool.ts derives stats FROM cost deterministically
// — a formula-level cost/stat mismatch shows up here as a play-rate/win-rate
// anomaly, not as a printed-cost discrepancy). Normalizing to z lets outliers
// be flagged independent of how wide this run's residual spread happens to
// be, complementing the raw topOverperformers/topUnderperformers lists.
const residualMean =
  cardReport.reduce((s, c) => s + c.residual, 0) / Math.max(1, cardReport.length);
const residualVariance =
  cardReport.reduce((s, c) => s + (c.residual - residualMean) ** 2, 0) /
  Math.max(1, cardReport.length);
const residualStd = Math.sqrt(residualVariance) || 1;
const cardReportWithZ = cardReport.map((c) => ({
  ...c,
  zScore: +((c.residual - residualMean) / residualStd).toFixed(2),
}));
const costAbilityOutliers = [...cardReportWithZ]
  .filter((c) => Math.abs(c.zScore) >= 1.5)
  .sort((a, b) => Math.abs(b.zScore) - Math.abs(a.zScore));

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
  firstSeatWinPct: pct(seatSwap.firstSeatWins, seatSwap.decidedGames),
  decidedGames: seatSwap.decidedGames,
  deckAWinPct: pct(seatSwap.deckAWinsAsP1 + seatSwap.deckAWinsAsP2, seatSwap.pairs * 2),
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

// v6.1: full-pool coverage — how much of the 292-card catalog the random
// deck cohort actually exercised (never-decked / decked-but-never-played).
const poolCoverage = (() => {
  const nonLeader = POOL_V4.filter((c: CardDef) => c.type !== 'Leader');
  const neverDecked = nonLeader.filter((c: CardDef) => !(cardStats[c.id]?.inDeckGames ?? 0)).map((c: CardDef) => c.id);
  const neverPlayed = nonLeader.filter(
    (c: CardDef) => (cardStats[c.id]?.inDeckGames ?? 0) > 0 && !(cardStats[c.id]?.timesPlayed ?? 0),
  ).map((c: CardDef) => c.id);
  return {
    poolNonLeader: nonLeader.length,
    deckedPct: pct(nonLeader.length - neverDecked.length, nonLeader.length),
    playedPct: pct(
      nonLeader.length - neverDecked.length - neverPlayed.length,
      nonLeader.length,
    ),
    neverDecked,
    deckedButNeverPlayed: neverPlayed,
  };
})();

const overallWin = 50;
const report = {
  meta: {
    version: 'v6.4',
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
  // v6.1 additions.
  leaderMatchups: Object.fromEntries(
    Object.entries(leaderMatchup).map(([a, row]) => [
      POOL_BY_ID[a]?.name ?? a,
      Object.fromEntries(
        Object.entries(row).map(([b, s]) => [
          POOL_BY_ID[b]?.name ?? b,
          { winPct: pct(s.wins, s.games), games: s.games },
        ]),
      ),
    ]),
  ),
  cardTypes: Object.fromEntries(
    Object.entries(typeStats).map(([t, s]) => [
      t,
      { playsPerGame: +(s.plays / Math.max(1, mech.games)).toFixed(2), playedGameWinPct: pct(s.playedWins, s.playedGames) },
    ]),
  ),
  openingCurve: Object.fromEntries(
    Object.entries(openingCurve).map(([b, s]) => [b, { winPct: pct(s.wins, s.games), games: s.games }]),
  ),
  winMarginHistogram: winMargin,
  poolCoverage,
  // v6.2 additions.
  costAbilityOutliers,
  leaderPairSuite: Object.fromEntries(
    Object.entries(leaderPairSuite).map(([a, row]) => [
      POOL_BY_ID[a]?.name ?? a,
      Object.fromEntries(
        Object.entries(row).map(([b, s]) => [
          POOL_BY_ID[b]?.name ?? b,
          { winPct: pct(s.wins, s.games), games: s.games },
        ]),
      ),
    ]),
  ),
  // v6.3 additions.
  keywordDeadWeight: Object.fromEntries(
    Object.entries(kwDeadWeight)
      .filter(([, s]) => s.carrierGames > 0)
      .map(([kw, s]) => [kw, { neverActivatedPct: pct(s.neverActivatedGames, s.carrierGames), carrierGames: s.carrierGames }]),
  ),
  essenceFloatByStage: Object.fromEntries(
    Object.entries(essenceFloatByStage).map(([stage, s]) => [
      stage,
      { avgFloat: +(s.total / Math.max(1, s.turns)).toFixed(2), turns: s.turns },
    ]),
  ),
  leaderIdleAbility: Object.fromEntries(
    Object.entries(leaderIdleStats).map(([id, s]) => [
      POOL_BY_ID[id]?.name ?? id,
      { idlePct: pct(s.idle, s.opportunities), opportunities: s.opportunities },
    ]),
  ),
  // v6.4 additions.
  leaderAbilityUsage: Object.fromEntries(
    Object.entries(leaderAbilityStats).map(([id, abilities]) => [
      POOL_BY_ID[id]?.name ?? id,
      Object.fromEntries(
        Object.entries(abilities).map(([text, s]) => [
          text,
          { uses: s.uses, winPct: pct(s.wins, s.gamesWithUse), gamesWithUse: s.gamesWithUse },
        ]),
      ),
    ]),
  ),
  guardTradeQuality: {
    guardWinsPct: pct(guardOutcomes.guardWins, Object.values(guardOutcomes).reduce((a, b) => a + b, 0)),
    mutualTradePct: pct(guardOutcomes.mutualTrade, Object.values(guardOutcomes).reduce((a, b) => a + b, 0)),
    guardDiesForNothingPct: pct(guardOutcomes.guardDiesForNothing, Object.values(guardOutcomes).reduce((a, b) => a + b, 0)),
    guardSurvivesNoKillPct: pct(guardOutcomes.guardSurvivesNoKill, Object.values(guardOutcomes).reduce((a, b) => a + b, 0)),
    totalGuards: Object.values(guardOutcomes).reduce((a, b) => a + b, 0),
  },
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
console.log('\nLeader matchups (v6.1):', JSON.stringify(report.leaderMatchups, null, 2));
console.log('\nCard types (v6.1):', JSON.stringify(report.cardTypes, null, 2));
console.log('\nOpening-hand curve (v6.1):', JSON.stringify(report.openingCurve, null, 2));
console.log('\nWin-margin histogram (v6.1):', JSON.stringify(report.winMarginHistogram, null, 2));
console.log(`\nPool coverage (v6.1): ${report.poolCoverage.deckedPct}% decked, ${report.poolCoverage.playedPct}% played of ${report.poolCoverage.poolNonLeader} non-Leader cards; never decked: ${report.poolCoverage.neverDecked.length}, decked-never-played: ${report.poolCoverage.deckedButNeverPlayed.length}`);
console.log('\nCost/ability outliers (v6.2, |z|>=1.5):');
for (const c of report.costAbilityOutliers) console.log(`  ${c.name} (${c.type}, cost ${c.cost}) residual ${c.residual} z=${c.zScore} n=${c.playedGames}`);
console.log('\nLeader-pair pinned suite (v6.2):', JSON.stringify(report.leaderPairSuite, null, 2));
console.log('\nKeyword dead-weight (v6.3):', JSON.stringify(report.keywordDeadWeight, null, 2));
console.log('\nEssence float by game stage (v6.3):', JSON.stringify(report.essenceFloatByStage, null, 2));
console.log('\nLeader idle-ability rate (v6.3):', JSON.stringify(report.leaderIdleAbility, null, 2));
console.log('\nKept color-dead hands (v6.3):', lapses.keptColorDeadHand);
console.log('\nLeader ability usage (v6.4):', JSON.stringify(report.leaderAbilityUsage, null, 2));
console.log('\nGuard-trade quality (v6.4):', JSON.stringify(report.guardTradeQuality, null, 2));
console.log('\nTop overperformers:');
for (const c of report.topOverperformers) console.log(`  ${c.name} (${c.type}${c.subtype ? '/' + c.subtype : ''}, cost ${c.cost}) played ${c.playedWin}% deck ${c.deckWin}% residual +${c.residual} [${c.keywords.join(',')}]`);
console.log('\nTop underperformers:');
for (const c of report.topUnderperformers) console.log(`  ${c.name} (${c.type}${c.subtype ? '/' + c.subtype : ''}, cost ${c.cost}) played ${c.playedWin}% deck ${c.deckWin}% residual ${c.residual} [${c.keywords.join(',')}]`);
console.log('\nDeadest in hand:');
for (const c of report.deadestInHand) console.log(`  ${c.name} cost ${c.cost} deadRate ${c.deadInHandRate}%`);
console.log(`\nReport written: ${outPath}`);
