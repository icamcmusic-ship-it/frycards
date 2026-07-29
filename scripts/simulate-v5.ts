/**
 * Fry Cards v5 balance & CPU-quality sim harness (essence engine).
 *
 * Runs seeded CPU-vs-CPU games across randomized coherent archetypes over
 * the FULL 292-card catalog (bundled fallback == live Supabase pool, parity
 * verified by scripts/fetch-cards.ts, and re-verified live for v6.2 — see
 * v6.2 balance pass) and reports:
 *
 *  - match outcomes: win rates by Leader, color, first/second player,
 *    win condition (vitality vs deck-out), game length distribution
 *  - card health: per-card played-vs-deck-baseline win-rate residuals,
 *    dead-in-hand rates, cost-band curves (win rate & residual by total cost)
 *  - v7.4 RAMP-MATCHED residuals (`topOverperformersRampMatched`): the same
 *    comparison with the card's in-deck denominator restricted to games that
 *    ran long enough for it to appear. **Price off these, not the flat list,
 *    for anything gated on essence** — see `lengthMatchedBaseline` and
 *    `docs/BALANCE_SIM_FINDINGS_v7.7.md` §1, which adds a THIRD residual
 *    (`rampStateMatchedBaseline`) matching on ramp ACCESS rather than game
 *    length — the one to read for anything essence-gated.
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
 * v5.2 additions (v6.1 balance-pass carry-forward items):
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
 * v6.2 additions (carry-forward items from the v6.1 balance pass):
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
 * v6.6 additions (v6.5 balance-pass carry-forward items):
 *  - GROUND-TRUTH attack-decision capture (`onAttackDecision`, carry-forward
 *    #7): the shadow attacker set is now computed from the live state at the
 *    exact moment ai.ts's chooseAttackers returns, not from a pre-Main1
 *    snapshot. The four-pass 21% "attack divergence" number could never
 *    distinguish a real CPU disagreement from Main-I board changes between
 *    the snapshot and the Clash; this removes the ambiguity. Both numbers are
 *    reported side by side (`attack` = ground truth, `attackSnapshot` = the
 *    legacy pre-Main1 measurement) so the gap between them IS the timing
 *    daylight, quantified.
 *  - Wilson 95% score intervals on every card residual, and a
 *    significance-gated outlier list (`costAbilityOutliersSignificant`): the
 *    v6.2-v6.5 z-score list weighted an n=95 card exactly like an n=2,400
 *    card, which is the most likely cause of cards flip-flopping sign between
 *    passes (sovereign_spires_of_arrak_zul, heart_of_the_thermal_grid,
 *    shatterline all overshot and had to be reverted). Only outliers whose CI
 *    excludes their own deck baseline are action candidates now.
 *  - Per-card keyword carrier detail (`keywordCarrierDetail`): for every
 *    keyword, each individual carrier's played win rate / residual / n, so a
 *    flagged keyword (Sacred, v6.5 carry-forward #3) can be actioned per-card
 *    instead of via a blanket weight cut.
 *  - Event effect-magnitude table (`eventEffectProfile`): per-Event action,
 *    printed magnitude, cost and residual — the missing data for the
 *    per-Event magnitude lever v6.5 carry-forward #5 (towering_tsunami)
 *    called for.
 *  - Printed-budget audit (`printedBudgetOutliers`): stat total vs cost
 *    linear fit per Unit, a cost-vs-ability signal derived from the PRINTED
 *    card rather than from win rate — catches formula-level cost/stat
 *    mismatches that a win-rate residual can't separate from deck context.
 *  - First-player-advantage diagnosis (`firstPlayerDiagnosis`, carry-forward
 *    #1): P1 edge split by game length, by who invoked their Leader first,
 *    and the per-turn mean vitality differential — locates WHERE in the game
 *    the edge accrues instead of restating that it exists.
 *  - Five new CPU reasoning-lapse counters: reservationWasted (the reaction
 *    hold that never cashed in — reactionPlays reads ~0 despite the whole
 *    reservation machinery), charmOnDoomedUnit, leaderShatterBlunder,
 *    wellspringMisplay, removalOnNonThreat.
 *
 * v6.5 additions:
 *  - mustSurvive-aware guard-trade split (v6.4 carry-forward #5): a new
 *    engine telemetry hook (`onGuardAssign`, engine.ts) fires straight from
 *    ai.ts's chooseGuards with whether its `mustSurvive` branch was active
 *    at the moment each guard was assigned, so guardDiesForNothing splits
 *    into guardDiesForNothingForced (a correct chump-block to survive
 *    lethal — not a lapse) and guardDiesForNothingDiscretionary (a real
 *    defender-side blunder) instead of conflating the two.
 *
 * v6.7 additions (v6.6 balance-pass carry-forward items):
 *  - Leader-kit diagnostics (`leaderKitDiagnostics`), carry-forward #1: for
 *    every Leader, the average turn of its FIRST invoke, its win rate split
 *    by game-length bucket (<=10 / 11-20 / 21-30 / >30, reusing the
 *    first-player-advantage bucketing), and its resolve-efficiency (win rate
 *    when its ability was used at least once that game vs when it was
 *    invoked but never used it) — targeted at explaining WHY Avatar of the
 *    Abyss and Crimson Vector Commander have topped the Leader spread every
 *    pass since v6.1, not just restating that they do.
 *  - Reaction-window content audit (`reactionWindowContent`), carry-forward
 *    #2: a static (pool-derived, not per-run) count of which cards are
 *    legal in the reaction window at all (Quick removal Events + Ambush
 *    units) and which of those additionally pass ai.ts's isReactionCandidate
 *    filter (cost<=3), broken down per-Leader by that Leader's own producible
 *    colors — quantifies exactly which archetypes are starved of reaction
 *    plays instead of restating the flat 26/292 -> 6 pool-wide numbers.
 *  - Printed-budget double-keyword-surcharge fix verification: the outlier
 *    list (`printedBudgetOutliers`) is unchanged in shape, but the underlying
 *    formula bug it was flagging (see cardpool.ts mapUnit) is fixed this
 *    pass, so the list should clear.
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
  findUnit,
  canPayCost,
  essenceTotal,
  unitHasKw,
  wellspringChoices,
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
  /**
   * v7.4 ramp-matched baseline (v7.2 carry-forward #1, which blocked all
   * further Location pricing on it).
   *
   * `residual` is `playedWin - inDeckWin`, and for anything gated on essence
   * that difference is a selection effect rather than a power reading. A
   * Location is ramp: it is only ever played in games where the essence for it
   * existed, and a pricier one only in games where MORE existed. So
   * "win rate conditional on having played it" rises with price by
   * construction — which is why three separate cost trials on Sacred never
   * moved its number, and why every two-cohort gated overperformer in v7.2
   * was a Location.
   *
   * The dominant channel turns out to be game LENGTH rather than Location
   * count: Wellsprings accumulate about one a turn, so almost everything
   * eventually becomes castable, but an expensive card still cannot appear in
   * a game that ended on turn 6 — and games that end on turn 6 are decided.
   * Its in-deck denominator therefore carries a pile of short losses no
   * cheap card's denominator has.
   *
   * `inDeckByLen` buckets the card's in-deck games by how long they ran, and
   * `playsByTurn` records the turns it was actually cast on. Weighting the
   * former by the latter gives a length-matched baseline: same deck control as
   * the flat residual, with the never-got-there games taken out of the
   * comparison instead of silently depressing it.
   */
  inDeckByLen: Record<number, { games: number; wins: number }>;
  playsByTurn: Record<number, number>;
  /**
   * v7.7 ramp-state-matched denominator, per card: this card's own in-deck
   * games filed by the highest Location count its controller ever reached.
   * Paired with `playsByLocs` below. See `rampStateMatchedBaseline`.
   */
  inDeckByMaxLocs: Record<number, { games: number; wins: number }>;
  /** Locations the controller had ON BOARD after the turn this card was first
   * played — the ramp state the play PUT THEM IN, which for a Sanctum already
   * includes the card itself. */
  playsByLocs: Record<number, number>;
}

/**
 * Diagnostic only: win rate of every player-game that reached N Locations.
 * Published so a future pass can see the ramp curve the correction assumes
 * exists, rather than taking it on trust.
 */
const rampReached: Record<number, { games: number; wins: number }> = {};
const rr = (n: number) => (rampReached[n] ??= { games: 0, wins: 0 });

/**
 * v7.7 Sanctum-drop curve: for each turn T, the player-games in which that
 * player made AT LEAST ONE Sanctum drop on turn T. Pool-wide and NOT
 * deck-controlled, so it is published as a diagnostic only — it is what shows
 * that a land drop is worth win rate on its own, which is the whole reason
 * `rampStateMatchedBaseline` exists. The per-card denominator that the
 * ramp-state residual actually uses is `inDeckByMaxLocs`.
 *
 * This is the population a Location should be read against, and the reason is
 * v7.6 carry-forward #1. The ramp-matched baseline
 * (`lengthMatchedBaseline`) matches a card's play-games against its own
 * in-deck games that ran at least as long — which corrects for "an expensive
 * card cannot appear in a game that ended on turn 6". It does NOT correct for
 * the fact that playing a Sanctum *is itself* a ramp step: the played cohort
 * has one more Location on board than the length-matched cohort by
 * construction, so every Sanctum in the pool collects the win-rate value of
 * "made a land drop this turn" on top of whatever its text is worth. That is
 * why the v7.6 table reads +5.38 / +4.60 for the 2-cost band and +6.65 / +5.30
 * for the Sanctums that print NO keyword at all — the blank ones read at or
 * above their keyworded neighbours, which is not a statement about cards.
 *
 * Matching on the drop removes it from both sides: of the players who made a
 * Sanctum drop on turn T, did the ones whose drop was THIS card do better?
 * Anything left is the card's own text and price. Same shape as the fix v7.5
 * §1 applied to Events — read a card against its own class rather than against
 * a mixture it is not comparable to.
 */
const locPlayByTurn: Record<number, { games: number; wins: number }> = {};
const lpt = (t: number) => (locPlayByTurn[t] ??= { games: 0, wins: 0 });
const cardStats: Record<string, CardStat> = {};
function cs(id: string): CardStat {
  return (cardStats[id] ??= {
    inDeckGames: 0,
    inDeckWins: 0,
    playedGames: 0,
    playedWins: 0,
    drawnGames: 0,
    drawnWins: 0,
    timesPlayed: 0,
    timesDrawn: 0,
    timesDeadInHand: 0,
    firstPlayTurnSum: 0,
    firstPlayGames: 0,
    inDeckByLen: {},
    playsByTurn: {},
    inDeckByMaxLocs: {},
    playsByLocs: {},
  });
}

// --- v6.0: board / clash / mulligan-outcome / comeback / essence-spend ------
const boardMetrics = { turnSamples: 0, unitsOnBoardSum: 0 };
const clashMetrics = { clashes: 0, attackersSum: 0, firstClashTurnSum: 0, gamesWithClash: 0 };
const mullOutcome = { mullGames: 0, mullWins: 0, keepGames: 0, keepWins: 0 };
const comeback = { measured: 0, comebackWins: 0 }; // winner behind on vitality at the turn-8 snapshot
let essenceSpentTotal = 0; // sum of printed totals of every invoked card

interface KwStat {
  carrierGames: number;
  carrierWins: number;
  activations: number;
}
const kwStats: Record<string, KwStat> = {};
for (const kw of KEYWORDS) kwStats[kw] = { carrierGames: 0, carrierWins: 0, activations: 0 };

const leaderStats: Record<
  string,
  { games: number; wins: number; invoked: number; shattered: number; abilityUses: number }
> = {};

// v6.7 (carry-forward #1): per-Leader kit diagnostics — turn of first
// invoke, win rate by game-length bucket, and resolve-efficiency (used its
// ability at least once this game vs invoked-but-never-used) — aimed
// specifically at explaining WHY Avatar of the Abyss / Crimson Vector
// Commander have topped every Leader spread since v6.1 rather than just
// re-measuring that they do.
const leaderKitStats: Record<
  string,
  {
    firstInvokeTurnSum: number;
    firstInvokeGames: number;
    byLength: Record<string, { games: number; wins: number }>;
    usedAbilityGames: number;
    usedAbilityWins: number;
    invokedNoAbilityGames: number;
    invokedNoAbilityWins: number;
  }
> = {};
function lks(id: string) {
  return (leaderKitStats[id] ??= {
    firstInvokeTurnSum: 0,
    firstInvokeGames: 0,
    byLength: {},
    usedAbilityGames: 0,
    usedAbilityWins: 0,
    invokedNoAbilityGames: 0,
    invokedNoAbilityWins: 0,
  });
}

// v6.4: per-Leader-ability usage/value — the existing abilityUsesPerGame is a
// single number per Leader summing BOTH abilities together, which hides a
// kit where one ability (e.g. the Resolve-builder) is chosen every game and
// the other (the Resolve-spender) is picked so rarely it's effectively dead
// weight. Keyed by the ability's own rules text (unique per Leader+ability,
// already carried on the leaderAbility event) so no engine change is needed.
const leaderAbilityStats: Record<
  string,
  Record<string, { uses: number; gamesWithUse: number; wins: number }>
> = {};
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
// v6.5: split guardDiesForNothing by whether ai.ts's chooseGuards had its
// `mustSurvive` branch active at the moment of assignment (fed live via the
// engine's onGuardAssign telemetry hook, not re-derived) — the v6.4 doc's
// carry-forward #5: a forced chump-block that dies for nothing to survive
// lethal is correct play, not a lapse, and was inflating the flat number.
const guardOutcomes = {
  guardWins: 0,
  mutualTrade: 0,
  guardDiesForNothing: 0,
  guardDiesForNothingForced: 0,
  guardDiesForNothingDiscretionary: 0,
  guardSurvivesNoKill: 0,
};
// v6.5: (attackerIid|guardIid) -> mustSurvive, fed by telemetry.onGuardAssign,
// reset each game.
let guardMustSurvive: Record<string, boolean> = {};
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
const tierStats: Record<
  string,
  { playedGames: number; playedWins: number; deckGames: number; deckWins: number }
> = {};
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
  // v6.6: GROUND TRUTH — shadow set computed from the live state at the exact
  // moment ai.ts's chooseAttackers returns (telemetry.onAttackDecision).
  attackDivergence: 0,
  attackOpportunities: 0,
  // v6.6: the legacy pre-Main1-snapshot measurement, kept alongside so the
  // gap between the two IS the snapshot/timing daylight the last four passes
  // could only speculate about.
  attackSnapshotDivergence: 0,
  attackSnapshotOpportunities: 0,
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
  kwBandStats[kw] = {
    '1-2': { games: 0, wins: 0 },
    '3-4': { games: 0, wins: 0 },
    '5+': { games: 0, wins: 0 },
  };

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
  // v6.5: the mustSurvive-aware split of the above — only the discretionary
  // half (mustSurvive was false at assignment) is a genuine CPU lapse; the
  // forced half is a correct chump-block to survive lethal.
  guardDiesForNothingDiscretionary: 0,
  // --- v6.6 new reasoning-lapse categories -------------------------------
  /** A reaction card + the locations to pay for it were reserved through a
   * whole turn (skipping development) and the reaction window never cashed
   * it in — the reservation cost a turn of tempo for nothing. */
  reservationWasted: 0,
  /** Reservations made at all, the denominator for the above. */
  reservationsMade: 0,
  /** A Charm was bonded to a unit that left the field the same turn — the
   * Charm's essence bought nothing (Soulbound charms excluded: they come
   * back to hand, so this is not a loss for them). */
  charmOnDoomedUnit: 0,
  /** A minus Leader ability was activated that shattered the CPU's own
   * Leader while the board held no Might-6+ threat — the ai.ts guard for
   * this exists but only weights it, so it can still fire on marginal
   * value. */
  leaderShatterBlunder: 0,
  /** The Wellspring color chosen unlocked nothing in hand, while another
   * legal choice would have made a currently-uncastable hand card castable
   * this turn. */
  wellspringMisplay: 0,
  /** Removal spent on an enemy unit whose Might was 0-1 (no real threat)
   * while the CPU had no lethal on board — burning a removal card on a
   * non-threat. */
  removalOnNonThreat: 0,
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
  'Siphon',
  'Hardened',
  'Soulbound',
  'Venomous',
  'Regenerate',
  'Sacred',
  'Resolute',
  'Bountiful',
  'Surge',
  'Resonant',
  'Runic',
  'Quickstrike',
  'Overrun',
  'Ambush',
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
// v6.5: ground-truth mustSurvive flag per guard assignment, straight from
// ai.ts's chooseGuards — no re-derivation/approximation in the harness.
telemetry.onGuardAssign = (attackerIid, guardIid, mustSurvive) => {
  if (!telemetryEnabled) return;
  guardMustSurvive[`${attackerIid}|${guardIid}`] = mustSurvive;
};
// v6.6: ground-truth attack decision — the shadow heuristic is evaluated
// against the live state ai.ts itself decided from, at that exact moment.
telemetry.onAttackDecision = (state, pid, chosen) => {
  if (!telemetryEnabled) return;
  cpuDecisions.attackOpportunities++;
  const shadow = shadowAttackers(state, pid);
  const actual = new Set(chosen);
  const same = actual.size === shadow.size && [...actual].every((i) => shadow.has(i));
  if (!same) cpuDecisions.attackDivergence++;
};
// v6.6: reaction-window reservations, keyed per game so a card re-reserved
// across several turns counts once.
let gameReservations: Set<string> = new Set();
telemetry.onReservation = (_pid, cardIid) => {
  if (!telemetryEnabled) return;
  gameReservations.add(cardIid);
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

// --- v6.6: per-card keyword carrier detail ---------------------------------
// The v6.5 doc's Sacred carry-forward asked for a per-CARD look inside a
// flagged keyword rather than another blanket weight cut. kwStats only ever
// aggregated across a keyword's carriers, so there was no way to see which
// carriers actually drive the number. cardStats already holds everything
// needed per card — this just indexes the cards by keyword at report time.

// --- v6.6: first-player-advantage diagnosis --------------------------------
// Six passes have restated that P1 wins ~60% without locating WHERE the edge
// accrues. Three cuts that can each be acted on differently:
//  - by game length: an edge concentrated in short games is a raw tempo/
//    on-the-play problem; one that persists into long games is structural.
//  - by who invoked their Leader first: isolates the Leader-curve race from
//    the raw extra turn.
//  - the per-turn mean vitality differential (P1 - P2): shows the turn the
//    gap opens, and whether P2's extra opening card ever closes it.
const fpDiagnosis = {
  byLength: {} as Record<string, { games: number; p1Wins: number }>,
  leaderFirst: { p1First: 0, p1FirstP1Wins: 0, p2First: 0, p2FirstP1Wins: 0, tie: 0, tieP1Wins: 0 },
  vitDiffByTurn: {} as Record<number, { sum: number; n: number }>,
};
const lengthBucket = (t: number) =>
  t <= 10 ? '<=10' : t <= 20 ? '11-20' : t <= 30 ? '21-30' : '>30';

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

/** v6.6: how many hand cards a player's location row can satisfy the COLORED
 * pips of, optionally with one extra hypothetical location added. Generic
 * essence is deliberately ignored — this measures colour access (what the
 * Wellspring choice actually controls), not affordability. */
function colorSatisfiableCount(state: GameState, pid: PlayerId, extra?: string): number {
  const p = state.players[pid];
  const have: Record<string, number> = {};
  for (const l of p.locations) have[l.produces] = (have[l.produces] ?? 0) + 1;
  if (extra) have[extra] = (have[extra] ?? 0) + 1;
  return p.hand.filter((c) =>
    Object.entries(c.def.cost?.pips ?? {}).every(([col, n]) => (have[col] ?? 0) >= (n ?? 0)),
  ).length;
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
  const firstStriker = (x: UnitInst) => unitHasKw(x, 'Quickstrike') || unitHasKw(x, 'Doublestrike');
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
    const favorableTrade = kills && notBehind && totalCost(worst.def.cost) > totalCost(u.def.cost);
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
  guardMustSurvive = {};
  gameReservations = new Set();
  // v6.6: reserved cards that actually got cashed in during a reaction window.
  const reservationsCashed = new Set<string>();

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
  // v7.4: highest Location count each seat ever reached — how much ramp the
  // game actually offered them, and so which of their deck's cards were ever
  // castable. A running max rather than the final board, so a Location leaving
  // play cannot understate it.
  const maxLocs: Record<PlayerId, number> = { P1: 0, P2: 0 };
  // v7.7: the turns on which each seat made a SANCTUM DROP this game — the
  // population behind the published `sanctumDropCurve` diagnostic.
  const locTurns: Record<PlayerId, Set<number>> = { P1: new Set(), P2: new Set() };
  // v6.6: which seat invoked its Leader first this game ('tie' if the same
  // turn boundary saw both).
  let leaderFirst: PlayerId | 'tie' | null = null;
  // Turn-8 vitality snapshot for the comeback metric.
  let vitAt8: Record<PlayerId, number> | null = null;
  // v6.7: turn each seat's Leader was first invoked, keyed by seat (not
  // Leader id — resolved to a Leader id at end-of-game via decksByPid).
  const firstInvokeTurn: Record<PlayerId, number | null> = { P1: null, P2: null };
  while (!state.winner && turns < MAX_TURNS) {
    turns++;
    const pid = state.active;
    const p = state.players[pid];
    for (const seat of ['P1', 'P2'] as PlayerId[]) {
      maxLocs[seat] = Math.max(maxLocs[seat], state.players[seat].locations.length);
    }
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
      (u) =>
        !u.exhausted &&
        !u.def.keywords?.includes('Immobile') &&
        (!u.enteredThisTurn || u.def.keywords?.includes('Reckless')),
    );
    const preShadowAttackers = preHasReadyAttacker ? shadowAttackers(state, pid) : null;
    const preOppBiggestByIid = new Map<string, number>();
    for (const u of state.players[opponentOf(pid)].field) {
      if (!u.def.keywords?.includes('Warded')) preOppBiggestByIid.set(u.iid, effMight(state, u));
    }
    const preLocations = p.locations.length + (p.wellspringPlayedThisTurn ? 0 : 1);
    const preHandIds = new Set(p.hand.map((c) => c.iid));
    const preOppDeck = state.players[opponentOf(pid)].deck.length;

    // --- v6.6 pre-turn snapshots for the new lapse counters ---------------
    // Wellspring: what each legal colour choice would unlock, measured
    // BEFORE the turn's plays change the hand.
    const wellspringBaseline = colorSatisfiableCount(state, pid);
    const wellspringGain: Record<string, number> = {};
    if (!p.wellspringPlayedThisTurn) {
      for (const t of wellspringChoices(state, pid)) {
        wellspringGain[t] = colorSatisfiableCount(state, pid, t) - wellspringBaseline;
      }
    }
    const preLeaderShattered = p.leader.shattered;
    const preOppBigThreat = state.players[opponentOf(pid)].field.some(
      (u) => effMight(state, u) >= 6,
    );

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
            s.playsByTurn[turns] = (s.playsByTurn[turns] ?? 0) + 1;
            // v7.7: and the ramp state the play left its controller in. For a
            // Sanctum this count already includes the card just played, which
            // is the whole point — see rampStateMatchedBaseline.
            const nl = state.players[actor].locations.length;
            s.playsByLocs[nl] = (s.playsByLocs[nl] ?? 0) + 1;
          }
          essenceSpentTotal += totalCost(def.cost);
          played[actor].add(def.id);
          cs(def.id).timesPlayed++;
          tps(def.type).plays++;
          if (def.type === 'Location') {
            mech.sanctumPlays++;
            locTurns[actor].add(turns);
          }
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

    // --- v6.6 new reasoning-lapse detection ------------------------------
    // Reservation cash-in: the reserved card actually resolved in a reaction
    // window (any invoke carrying `by`).
    for (const ev of events) {
      if (ev.kind === 'invoke' && ev.by) reservationsCashed.add(ev.iid);
    }
    // Wellspring misplay: the colour played unlocked nothing while another
    // legal choice would have unlocked at least one hand card.
    const wsEv = events.find((e) => e.kind === 'wellspring') as { essence: string } | undefined;
    if (wsEv) {
      const chosenGain = wellspringGain[wsEv.essence] ?? 0;
      const bestGain = Math.max(0, ...Object.values(wellspringGain));
      if (chosenGain === 0 && bestGain > 0) lapses.wellspringMisplay++;
    }
    // Leader shatter blunder: the CPU spent its Leader out of the game this
    // turn with no Might-6+ threat on the board to justify it.
    if (!preLeaderShattered && p.leader.shattered && !preOppBigThreat) {
      lapses.leaderShatterBlunder++;
    }
    // Charm on a doomed unit: a Charm invoked this turn that is bonded to
    // nothing by end of turn (its unit left the field). Soulbound charms
    // return to hand, so they lose nothing and are excluded.
    for (const ev of events) {
      if (ev.kind !== 'invoke' || ev.by) continue;
      const def = POOL_BY_ID[ev.iid.split('#')[0]];
      if (def?.type !== 'Charm' || def.keywords?.includes('Soulbound')) continue;
      const stillBonded = p.field.some((u) => u.charms.some((ch) => ch.iid === ev.iid));
      if (!stillBonded) lapses.charmOnDoomedUnit++;
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
    const attackEv = events.find((e) => e.kind === 'attack') as { iids: string[] } | undefined;
    // v6.6: the LEGACY pre-Main1-snapshot measurement, retained only so the
    // gap against the ground-truth number (fed by telemetry.onAttackDecision
    // above) quantifies the snapshot/timing daylight directly.
    if (preShadowAttackers) {
      cpuDecisions.attackSnapshotOpportunities++;
      const actual = new Set(attackEv?.iids ?? []);
      const same =
        actual.size === preShadowAttackers.size &&
        [...actual].every((i) => preShadowAttackers.has(i));
      if (!same) cpuDecisions.attackSnapshotDivergence++;
    }

    const guardEv = events.find((e) => e.kind === 'guard') as
      { assignments: Record<string, string[]> } | undefined;
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
        const venomGuardIid = guardIids.find((g) =>
          POOL_BY_ID[g.split('#')[0]]?.keywords?.includes('Venomous'),
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
            // v6.5: mustSurvive true at assignment = forced chump to survive
            // lethal (correct play, not a lapse); false = a discretionary
            // block that gained nothing (a genuine lapse). Default to
            // "forced" on a missing flag (should not happen — every real
            // assignment goes through the telemetry hook) rather than
            // inflating the discretionary/lapse count on a gap.
            const forced = guardMustSurvive[`${attackerIid}|${guardIid}`] ?? true;
            if (forced) guardOutcomes.guardDiesForNothingForced++;
            else {
              guardOutcomes.guardDiesForNothingDiscretionary++;
              lapses.guardDiesForNothingDiscretionary++;
            }
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
        .filter(
          ([iid]) =>
            !isShatter || !POOL_BY_ID[iid.split('#')[0]]?.keywords?.includes('Unbreakable'),
        )
        .map(([, m]) => m);
      const legalMaxMight = legalMights.length ? Math.max(...legalMights) : 0;
      const chosenMight = preOppBiggestByIid.get(ev.targetIid) ?? -1;
      if (chosenMight >= 0 && chosenMight < legalMaxMight) cpuDecisions.targetSuboptimal++;
      // v6.6: removal burned on a non-threat — the whole enemy board topped
      // out at Might 1, so no removal-worthy target existed at all and the
      // card would have been better held. (Face-damage `anyTarget` effects
      // are excluded: sending those at the enemy player is a real line.)
      if (chosenMight >= 0 && legalMaxMight <= 1 && def.onInvoke?.target !== 'anyTarget') {
        lapses.removalOnNonThreat++;
      }
    }

    // Reaction-window opportunity = a clash happened this turn (the defender
    // always gets an open reaction window before damage resolves). Usage
    // rate is reported via mech.reactionPlays / opportunities.
    if (guardEv) cpuDecisions.reactionWindowOpportunities++;

    // --- v6.0 board / clash / comeback sampling -------------------------
    boardMetrics.turnSamples++;
    boardMetrics.unitsOnBoardSum += state.players.P1.field.length + state.players.P2.field.length;
    if (attackEv && attackEv.iids.length > 0) {
      clashMetrics.clashes++;
      clashMetrics.attackersSum += attackEv.iids.length;
      if (firstClashTurn === 0) firstClashTurn = turns;
    }
    if (turns === 8 && !vitAt8) {
      vitAt8 = { P1: state.players.P1.vitality, P2: state.players.P2.vitality };
    }
    // v6.6: per-turn mean vitality differential (P1 - P2) — locates the turn
    // the first-player gap actually opens.
    {
      const d = (fpDiagnosis.vitDiffByTurn[turns] ??= { sum: 0, n: 0 });
      d.sum += state.players.P1.vitality - state.players.P2.vitality;
      d.n++;
    }
    // v6.6: which seat got its Leader down first (recorded once).
    if (leaderFirst === null) {
      const p1In = state.players.P1.leader.invoked || state.players.P1.leader.shattered;
      const p2In = state.players.P2.leader.invoked || state.players.P2.leader.shattered;
      if (p1In && p2In) leaderFirst = 'tie';
      else if (p1In) leaderFirst = 'P1';
      else if (p2In) leaderFirst = 'P2';
    }
    // v6.7: per-seat first-invoke turn (independent of which seat was
    // "first" overall — every Leader kit gets its own average).
    for (const spid of ['P1', 'P2'] as PlayerId[]) {
      if (firstInvokeTurn[spid] === null) {
        const L = state.players[spid].leader;
        if (L.invoked || L.shattered) firstInvokeTurn[spid] = turns;
      }
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
        Object.values(
          (
            events.find((e) => e.kind === 'guard') as
              { assignments?: Record<string, string[]> } | undefined
          )?.assignments ?? {},
        ).flat(),
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
          { assignments: Record<string, string[]> } | undefined;
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
            if (
              !aerial ||
              g.def.keywords?.includes('Aerial') ||
              g.def.keywords?.includes('Skywatch')
            )
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

  // v6.6: reaction-window reservations that never cashed in. Each reserved
  // card counts once per game regardless of how many turns it was held.
  lapses.reservationsMade += gameReservations.size;
  for (const iid of gameReservations) {
    if (!reservationsCashed.has(iid)) lapses.reservationWasted++;
  }

  // v6.6: first-player-advantage diagnosis cuts.
  if (winner) {
    const lb = (fpDiagnosis.byLength[lengthBucket(turns)] ??= { games: 0, p1Wins: 0 });
    lb.games++;
    if (winner === 'P1') lb.p1Wins++;
    if (leaderFirst === 'P1') {
      fpDiagnosis.leaderFirst.p1First++;
      if (winner === 'P1') fpDiagnosis.leaderFirst.p1FirstP1Wins++;
    } else if (leaderFirst === 'P2') {
      fpDiagnosis.leaderFirst.p2First++;
      if (winner === 'P1') fpDiagnosis.leaderFirst.p2FirstP1Wins++;
    } else if (leaderFirst === 'tie') {
      fpDiagnosis.leaderFirst.tie++;
      if (winner === 'P1') fpDiagnosis.leaderFirst.tieP1Wins++;
    }
  }
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
    const lm = ((leaderMatchup[winDeck.leaderId] ??= {})[loseDeck.leaderId] ??= {
      games: 0,
      wins: 0,
    });
    lm.games++;
    lm.wins++;
    const lmRev = ((leaderMatchup[loseDeck.leaderId] ??= {})[winDeck.leaderId] ??= {
      games: 0,
      wins: 0,
    });
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

    // v7.4: ramp curve diagnostic, plus the castable-matched denominators.
    {
      const b = rr(maxLocs[pid]);
      b.games++;
      if (won) b.wins++;
    }
    // v7.7: the sanctum-drop curve — this seat made a Sanctum drop on each of
    // these turns, filed once per (game, turn).
    for (const t of locTurns[pid]) {
      const b = lpt(t);
      b.games++;
      if (won) b.wins++;
    }

    // Card stats.
    const inDeck = new Set(deck.cards);
    for (const id of inDeck) {
      const s = cs(id);
      s.inDeckGames++;
      if (won) s.inDeckWins++;
      // v7.4: the same game, also filed by how long it ran, so the report can
      // build a length-matched denominator per card.
      const bucket = (s.inDeckByLen[turns] ??= { games: 0, wins: 0 });
      bucket.games++;
      if (won) bucket.wins++;
      // v7.7: and filed by the ramp state this seat actually reached, so a
      // Location can be compared against the games that got that far.
      const lb = (s.inDeckByMaxLocs[maxLocs[pid]] ??= { games: 0, wins: 0 });
      lb.games++;
      if (won) lb.wins++;
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
      games: 0,
      wins: 0,
      invoked: 0,
      shattered: 0,
      abilityUses: 0,
    });
    ls.games++;
    if (won) ls.wins++;
    if (p.leader.invoked || p.leader.shattered) ls.invoked++;
    if (p.leader.shattered) {
      ls.shattered++;
      mech.leaderShatters++;
    }
    ls.abilityUses += perGame.leaderAbilityUses[pid];

    // v6.7: per-Leader-kit diagnostics (carry-forward #1).
    if (winner) {
      const lk = lks(deck.leaderId);
      if (firstInvokeTurn[pid] !== null) {
        lk.firstInvokeTurnSum += firstInvokeTurn[pid]!;
        lk.firstInvokeGames++;
      }
      const lb = (lk.byLength[lengthBucket(turns)] ??= { games: 0, wins: 0 });
      lb.games++;
      if (won) lb.wins++;
      if ((p.leader.invoked || p.leader.shattered) && perGame.leaderAbilityUses[pid] > 0) {
        lk.usedAbilityGames++;
        if (won) lk.usedAbilityWins++;
      } else if (p.leader.invoked || p.leader.shattered) {
        lk.invokedNoAbilityGames++;
        if (won) lk.invokedNoAbilityWins++;
      }
    }

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
console.log(
  `Fry Cards v5 sim: pool=${POOL_V4.length} cards, decks=${NUM_DECKS}, games/pairing=${GAMES_PER_PAIRING}, seed=${SEED}, deckSeed=${DECK_SEED}`,
);
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
const seatSwap = {
  pairs: 0,
  deckAWinsAsP1: 0,
  deckAWinsAsP2: 0,
  firstSeatWins: 0,
  decidedGames: 0,
};
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
    // v7.7: seeded from the LEADER ID ALONE. It used to be
    // `strHash(leaderId) ^ DECK_SEED`, which quietly defeated the whole point
    // of the suite: v6.2 built it (carry-forward #5) to give a Leader read
    // "that cohort composition cannot reach", and then re-rolled its 60-card
    // decks with the cohort seed, so the two cohorts were not running the same
    // pinned suite at all. That is why v7.6 could not close its Sentinel item
    // with this instrument — Sentinel of the Nether Pit read 57.3% on deckSeed
    // 1337 and 23.4% on deckSeed 42, a 34-point swing on a suite whose entire
    // premise is that decks are held fixed. With the deck fixed, the only
    // thing a second cohort varies is the game RNG (`pairRng` below still
    // takes DECK_SEED), so two runs are two independent samples of the SAME
    // matchup and the spread between them is honest sampling error.
    seed: strHash(leaderId),
  });
}
const LEADER_PAIR_SEAT_GAMES = 20; // per ordered pair, per seat orientation
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

/**
 * v7.4 ramp-matched baseline (carry-forward #1 of the v7.2 pass, which blocked
 * all further Location pricing on it).
 *
 * The flat `residual` below compares a card's played win rate to its in-deck
 * win rate. For anything gated on essence that is a selection effect, not a
 * power reading: a Location is ramp, "played it" already means the essence
 * existed, and a pricier one means MORE existed — games the player was winning
 * anyway. Three separate cost trials on Sacred failed to move the number, and
 * every two-cohort gated overperformer in v7.2 was a Location.
 *
 * This standardizes the comparison instead: bucket the card's play-games by
 * the ramp state it was cast into, then weight the win rate of every
 * player-game that REACHED each of those states by how often the card was
 * actually played there. What comes back is "of players who got this far, how
 * much better did the ones holding this card do" — which no longer rewards a
 * card simply for costing more.
 */
/**
 * Length-matched in-deck baseline: for each turn this card was actually cast
 * on, the win rate of its own in-deck games that ran at least that long,
 * weighted by how often it was cast then. Answers "against the games where
 * this card could have shown up, did playing it help" rather than "against
 * every game it was shuffled into, most of which ended before its turn".
 *
 * Returns null below a sample floor rather than a number nobody should act on.
 */
function lengthMatchedBaseline(s: CardStat): { winPct: number; games: number } | null {
  const lens = Object.keys(s.inDeckByLen)
    .map(Number)
    .sort((a, b) => a - b);
  // Suffix sums: games (and wins) whose length was >= each turn index.
  const atLeast = new Map<number, { games: number; wins: number }>();
  let g = 0;
  let w = 0;
  for (let i = lens.length - 1; i >= 0; i--) {
    const b = s.inDeckByLen[lens[i]];
    g += b.games;
    w += b.wins;
    atLeast.set(lens[i], { games: g, wins: w });
  }
  /** Games of length >= t, walking up to the next recorded length. */
  const suffix = (t: number) => {
    let best: { games: number; wins: number } | undefined;
    for (const len of lens) {
      if (len >= t) {
        best = atLeast.get(len);
        break;
      }
    }
    return best;
  };
  let weight = 0;
  let acc = 0;
  let sampled = 0;
  for (const [k, n] of Object.entries(s.playsByTurn)) {
    const b = suffix(Number(k));
    if (!b || b.games === 0) continue;
    acc += n * ((100 * b.wins) / b.games);
    weight += n;
    sampled = Math.max(sampled, b.games);
  }
  if (weight === 0 || sampled < 20) return null;
  return { winPct: +(acc / weight).toFixed(1), games: sampled };
}

/**
 * v7.7 RAMP-STATE-MATCHED baseline — v7.6 carry-forward #1, and a COMPARATOR
 * rather than a lever, which is what that item asked for.
 *
 * The length-matched baseline above corrects for "an expensive card cannot
 * appear in a game that ended on turn 6". It does not correct for the thing
 * v7.6 §1 named: **playing a Sanctum is itself a ramp step**. A Location's
 * play-games have, by construction, one more Location on board than the games
 * it is being compared against, so every Sanctum in the pool collects the win
 * value of "made a land drop" on top of whatever its text is worth. That is
 * why the v7.6 table read +5.38 / +4.60 for the whole 2-cost band and
 * +6.65 / +5.30 for the Sanctums that print no keyword at all.
 *
 * This matches on the ramp state the play LEFT THE CONTROLLER IN: for each
 * Location count L the card was played into, the win rate of the card's own
 * in-deck games that reached at least L Locations, weighted by how often it
 * was played there. Same deck control as the flat residual, with the land drop
 * now on both sides of the subtraction.
 *
 * Two earlier attempts are recorded because each failed in an instructive way
 * and neither should be re-tried:
 *
 *  - **A pool-wide "everyone who dropped a Sanctum on turn T" denominator**
 *    threw the deck control away. The two cohorts then disagreed by thirty
 *    points on card after card (Ossuary Vault +2.1 / -28.3), and all of the
 *    movement was in the NUMERATOR — that card's played win rate is 56.4% in
 *    cohort A and 22.3% in B, because in B it sits in worse decks. Trading a
 *    ramp confound for a deck-quality confound is not a correction.
 *  - **The card's own decks, matched on the drop TURN**, is deck-controlled
 *    but degenerate: on a card played in most of its in-deck games the two
 *    sides are nearly the same games. Measured — with `stone_bubbles` printing
 *    its ability again, the flat residual moved +9.8 -> +16.2 and the
 *    ramp-matched +3.5 -> +10.2, while that metric moved +0.1 -> +1.2.
 *    Excluding the card's own play-games fixes the degeneracy and replaces it
 *    with a tiny, heavily selected denominator ("games where I never played
 *    it"), which put half the pool under the sample floor and disagreed across
 *    cohorts by twenty points.
 *
 * Matching on ramp state avoids both: reaching L Locations is something most
 * in-deck games do by many routes, so the denominator stays large and is not
 * mostly this card.
 *
 * v7.7b: computed for EVERY card type, not just Locations. The correction was
 * built for Sanctums, but the selection effect it removes is not specific to
 * them — a cost-7 Unit is also only ever played in games that got to seven
 * essence, and `lengthMatchedBaseline` matches on game LENGTH, which is a
 * proxy for that and not the thing itself. The difference between a card's
 * ramp-matched and ramp-state-matched residual is therefore the part of its
 * number that was ramp access rather than card power, whatever type it is.
 *
 * Returns null below the same 20-game floor the length-matched baseline uses.
 */
function rampStateMatchedBaseline(s: CardStat): { winPct: number; games: number } | null {
  const levels = Object.keys(s.inDeckByMaxLocs)
    .map(Number)
    .sort((a, b) => a - b);
  // Suffix sums: in-deck games (and wins) that reached AT LEAST each level.
  const atLeast = new Map<number, { games: number; wins: number }>();
  let g = 0;
  let w = 0;
  for (let i = levels.length - 1; i >= 0; i--) {
    const b = s.inDeckByMaxLocs[levels[i]];
    g += b.games;
    w += b.wins;
    atLeast.set(levels[i], { games: g, wins: w });
  }
  const suffix = (n: number) => {
    for (const lv of levels) if (lv >= n) return atLeast.get(lv);
    return undefined;
  };
  let weight = 0;
  let acc = 0;
  let sampled = 0;
  for (const [k, n] of Object.entries(s.playsByLocs)) {
    const b = suffix(Number(k));
    if (!b || b.games === 0) continue;
    acc += n * ((100 * b.wins) / b.games);
    weight += n;
    sampled = Math.max(sampled, b.games);
  }
  if (weight === 0 || sampled < 20) return null;
  return { winPct: +(acc / weight).toFixed(1), games: sampled };
}

const cardReport = Object.entries(cardStats)
  .filter(([, s]) => s.playedGames >= 20)
  .map(([id, s]) => {
    const def = POOL_BY_ID[id];
    const playedWinPct = pct(s.playedWins, s.playedGames);
    const matched = lengthMatchedBaseline(s);
    // v7.7: Locations get a third residual, measured against the players who
    // made a Sanctum drop on the same turn. Null on every other type — the
    // comparison is only defined for cards that ARE the ramp step.
    const peer = rampStateMatchedBaseline(s);
    return {
      matchedWin: matched?.winPct ?? null,
      matchedGames: matched?.games ?? 0,
      /** The number to price on for anything gated on essence. */
      rampResidual: matched === null ? null : +(playedWinPct - matched.winPct).toFixed(1),
      /** See rampStateMatchedBaseline — the residual with ramp ACCESS held
       * constant, as opposed to game length. Price essence-gated cards off it. */
      stateResidual: peer === null ? null : +(playedWinPct - peer.winPct).toFixed(1),
      stateWin: peer?.winPct ?? null,
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
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Pearson correlation, for the residual-vs-cost diagnostic below. */
function corr(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? +(num / Math.sqrt(dx * dy)).toFixed(3) : 0;
}

const byRampResidual = [...cardReport]
  .filter((c) => c.rampResidual !== null)
  .sort((a, b) => (b.rampResidual ?? 0) - (a.rampResidual ?? 0));

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

// v6.6: SIGNIFICANCE-GATED outlier list. The z-score above is computed over
// the residual distribution and is completely blind to sample size — an n=95
// card and an n=2,400 card with the same residual get the same z. That is
// almost certainly what produced the three overshoot reverts the v6.4/v6.5
// docs record (heart_of_the_thermal_grid, shatterline, and the
// sign-flipping sovereign_spires_of_arrak_zul): small-n noise was being
// actioned as signal. This list additionally requires the card's played
// win-rate Wilson 95% score interval to EXCLUDE its own in-deck baseline, so
// only differences the sample can actually support become buff/nerf
// candidates.
function wilson(wins: number, n: number): [number, number] {
  if (n === 0) return [0, 100];
  const z = 1.96;
  const p = wins / n;
  const d = 1 + (z * z) / n;
  const centre = p + (z * z) / (2 * n);
  const half = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
  return [(100 * (centre - half)) / d, (100 * (centre + half)) / d];
}
const cardWilson: Record<string, { lo: number; hi: number }> = {};
for (const c of cardReport) {
  const s = cardStats[c.id];
  const [lo, hi] = wilson(s.playedWins, s.playedGames);
  cardWilson[c.id] = { lo: +lo.toFixed(1), hi: +hi.toFixed(1) };
}
const costAbilityOutliersSignificant = costAbilityOutliers
  .map((c) => ({ ...c, ci95: cardWilson[c.id] }))
  .filter((c) => c.ci95 && (c.ci95.lo > c.deckWin || c.ci95.hi < c.deckWin));

// v6.6: PRINTED-budget audit — a cost-vs-ability signal read off the printed
// card rather than off win rate. cardpool.ts derives a Unit's stat budget
// from its cost minus the keyword surcharge, so stat total should track cost
// nearly linearly; a Unit far off that line is a formula-level cost/ability
// mismatch (usually a keyword-surcharge interaction), which a win-rate
// residual cannot separate from deck context. Fitted by least squares over
// every Unit in the pool, not just the ones this run sampled.
const printedBudgetOutliers = (() => {
  const units = POOL_V4.filter((c: CardDef) => c.type === 'Unit');
  const pts = units.map((c) => ({
    c,
    x: totalCost(c.cost),
    y: (c.might ?? 0) + (c.grit ?? 0),
  }));
  const n = pts.length || 1;
  const mx = pts.reduce((s, p) => s + p.x, 0) / n;
  const my = pts.reduce((s, p) => s + p.y, 0) / n;
  const cov = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0);
  const varx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0) || 1;
  const slope = cov / varx;
  const intercept = my - slope * mx;
  const resid = pts.map((p) => ({ ...p, r: p.y - (slope * p.x + intercept) }));
  const sd = Math.sqrt(resid.reduce((s, p) => s + p.r ** 2, 0) / Math.max(1, resid.length)) || 1;
  return {
    fit: { slope: +slope.toFixed(2), intercept: +intercept.toFixed(2), sd: +sd.toFixed(2) },
    outliers: resid
      .filter((p) => Math.abs(p.r) / sd >= 2)
      .sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
      .slice(0, 25)
      .map((p) => ({
        id: p.c.id,
        name: p.c.name,
        cost: p.x,
        statTotal: p.y,
        keywords: p.c.keywords ?? [],
        budgetResidual: +p.r.toFixed(1),
        z: +(p.r / sd).toFixed(2),
      })),
  };
})();

// v6.6: per-Event effect-magnitude profile — the data the v6.5 carry-forward
// #5 (towering_tsunami, floor-clamped at cost 1 with no lever left in
// cardpool.ts) asked for. Pairs each Event's printed action/magnitude with
// its measured residual so a per-Event magnitude table can be scoped from
// real numbers rather than guessed at.
const eventEffectProfile = cardReport
  .filter((c) => c.type === 'Event')
  .map((c) => {
    const def = POOL_BY_ID[c.id];
    return {
      id: c.id,
      name: c.name,
      subtype: c.subtype,
      cost: c.cost,
      action: def?.onInvoke?.action,
      magnitude: def?.onInvoke?.value ?? null,
      target: def?.onInvoke?.target,
      residual: c.residual,
      playedGames: c.playedGames,
      ci95: cardWilson[c.id],
    };
  })
  .sort((a, b) => a.residual - b.residual);

// v6.6: per-card detail inside each keyword. The v6.5 Sacred carry-forward
// explicitly asked for a per-card look instead of another blanket weight
// cut; kwStats only ever aggregated across carriers.
// NOTE: built from the FULL pool, not from `cardReport` — cardReport applies
// a playedGames >= 20 cutoff, and a keyword's carriers are often exactly the
// low-sample cards that cutoff drops, so filtering through it can show every
// listed carrier sitting at ~0 residual while the keyword's own aggregate is
// far outside the band. Every carrier is listed here with its n so a reader
// can weigh it.
const keywordCarrierDetail = Object.fromEntries(
  KEYWORDS.map((kw) => [
    kw,
    POOL_V4.filter((c: CardDef) => c.keywords?.includes(kw))
      .map((def: CardDef) => {
        const s = cardStats[def.id];
        const playedWin = pct(s?.playedWins ?? 0, s?.playedGames ?? 0);
        const deckWin = pct(s?.inDeckWins ?? 0, s?.inDeckGames ?? 0);
        const [lo, hi] = wilson(s?.playedWins ?? 0, s?.playedGames ?? 0);
        return {
          id: def.id,
          name: def.name,
          type: def.type,
          cost: totalCost(def.cost),
          playedWin,
          deckWin,
          residual: +(playedWin - deckWin).toFixed(1),
          playedGames: s?.playedGames ?? 0,
          ci95: { lo: +lo.toFixed(1), hi: +hi.toFixed(1) },
        };
      })
      .filter((c) => c.playedGames > 0)
      .sort((a, b) => b.residual - a.residual),
  ]).filter(([, rows]) => (rows as unknown[]).length > 0),
);

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
  // v6.6: ground truth — shadow evaluated on the live state ai.ts decided
  // from, via telemetry.onAttackDecision.
  attack: {
    divergenceRate: pct(cpuDecisions.attackDivergence, cpuDecisions.attackOpportunities),
    opportunities: cpuDecisions.attackOpportunities,
  },
  // v6.6: the legacy pre-Main1-snapshot number. The gap between this and
  // `attack` above is the snapshot/timing daylight, now measured rather than
  // assumed.
  attackSnapshot: {
    divergenceRate: pct(
      cpuDecisions.attackSnapshotDivergence,
      cpuDecisions.attackSnapshotOpportunities,
    ),
    opportunities: cpuDecisions.attackSnapshotOpportunities,
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
    playsPerOpportunity: +(
      mech.reactionPlays / Math.max(1, cpuDecisions.reactionWindowOpportunities)
    ).toFixed(2),
    opportunities: cpuDecisions.reactionWindowOpportunities,
  },
};

// v5.2: essence-curve efficiency.
const curveReport = {
  heldPlayableCardTurnPct: pct(curveStats.heldPlayableCardTurns, curveStats.totalTurns),
  totalTurns: curveStats.totalTurns,
  avgEssenceFloatedPerTurn: +(
    curveStats.essenceFloatedEstimate / Math.max(1, curveStats.totalTurns)
  ).toFixed(2),
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
  'heart_coral',
  'needle_seamstress',
  'merfolk_ritual',
  'pufferfish_lantern',
  'clawblade_greatsword',
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

/**
 * v7.6: every card the findings doc carries forward, reported in FULL on every
 * run — flat residual, ramp-matched residual and sample size — regardless of
 * whether it happens to land in a top-15 list this run.
 *
 * The v7.5 pass had to read its carried-forward cards out of
 * `topOverperformers*`, which are 15-item slices: a card that moves off the
 * list reads as "gone" when it may only have moved from 1st to 16th, and a
 * card that is genuinely fine still has to be hunted for. Worse, the two lists
 * are sorted by DIFFERENT metrics, so which of the two numbers a carried card
 * showed depended on which list it fell out of first. This block is the
 * un-truncated read, and it is the one to compare across trials.
 *
 * `underFloor` means the card did not clear cardReport's 20-played-game gate:
 * that is a REAL result, not a missing one — it is the signature of the cost
 * trials that priced a card out of the format rather than balancing it (v7.5
 * §1 and §5), and it must never be read as "the residual came down".
 */
const CARRY_FORWARD_IDS = [
  'stone_bubbles', // Sacred, carry-forward #1
  'the_wolf_of_wall_street', // Unbreakable, #2
  'the_pier_side_menace', // Unbreakable, #2
  'sparkling_meadow', // best-sampled Scorched-Earth carrier, #8
  'phosphor_lich', // v7.5 STAT_ADJUST, watch for overshoot
  'blight_snarler', // v7.5 STAT_ADJUST, watch for overshoot
  'cold_fire_volcano', // v7.5 COST_ADJUST, watch for overshoot
  'seabed_mandala', // v7.5 COST_ADJUST -1, the only buff of that pass
  'glowing_glyph_tablet', // v7.5 reverted cost trial
  'amethyst_starfish', // v7.5 reverted cost trial
];
const carryForward = CARRY_FORWARD_IDS.map((id) => {
  const def = POOL_BY_ID[id];
  const full = cardReport.find((c) => c.id === id);
  if (full) return { ...full, underFloor: false };
  const s = cs(id);
  return {
    id,
    name: def?.name,
    type: def?.type,
    cost: totalCost(def?.cost),
    keywords: def?.keywords ?? [],
    underFloor: true,
    playedGames: s.playedGames,
    inDeckGames: s.inDeckGames,
    residual: null,
    rampResidual: null,
    stateResidual: null,
  };
});

// v6.1: full-pool coverage — how much of the 292-card catalog the random
// deck cohort actually exercised (never-decked / decked-but-never-played).
const poolCoverage = (() => {
  const nonLeader = POOL_V4.filter((c: CardDef) => c.type !== 'Leader');
  const neverDecked = nonLeader
    .filter((c: CardDef) => !(cardStats[c.id]?.inDeckGames ?? 0))
    .map((c: CardDef) => c.id);
  const neverPlayed = nonLeader
    .filter(
      (c: CardDef) =>
        (cardStats[c.id]?.inDeckGames ?? 0) > 0 && !(cardStats[c.id]?.timesPlayed ?? 0),
    )
    .map((c: CardDef) => c.id);
  return {
    poolNonLeader: nonLeader.length,
    deckedPct: pct(nonLeader.length - neverDecked.length, nonLeader.length),
    playedPct: pct(nonLeader.length - neverDecked.length - neverPlayed.length, nonLeader.length),
    neverDecked,
    deckedButNeverPlayed: neverPlayed,
  };
})();

// v6.7 (carry-forward #2): reaction-window content audit. Static over the
// pool (not per-run) — quantifies exactly which Leaders' own producible
// colors are starved of reaction-legal cards, instead of only restating the
// pool-wide 26/292 -> 6 numbers every pass since v6.5.
function isRemovalLikeOnInvoke(def: CardDef): boolean {
  const eff = def.onInvoke;
  return (
    !!eff &&
    (eff.action === 'shatter' ||
      eff.action === 'banish' ||
      (eff.action === 'damage' && (eff.target === 'enemyUnit' || eff.target === 'anyTarget')))
  );
}
const reactionWindowContent = (() => {
  const legalInWindow = POOL_V4.filter(
    (c: CardDef) =>
      (c.type === 'Event' && c.subtype === 'Quick' && isRemovalLikeOnInvoke(c)) ||
      (c.type === 'Unit' && !!c.keywords?.includes('Ambush')),
  );
  // Mirrors ai.ts's isReactionCandidate: legal in window AND total cost <= 3.
  const aiCandidates = legalInWindow.filter((c: CardDef) => totalCost(c.cost) <= 3);
  const byLeader = Object.fromEntries(
    POOL_LEADERS.map((l: CardDef) => {
      const cols = new Set(LEADER_COLORS[l.id] ?? []);
      const inColor = (c: CardDef) => {
        const pips = Object.keys(c.cost?.pips ?? {});
        return pips.length === 0 || pips.every((p) => cols.has(p as never));
      };
      return [
        l.name ?? l.id,
        {
          legalInWindow: legalInWindow.filter(inColor).length,
          aiCandidates: aiCandidates.filter(inColor).length,
        },
      ];
    }),
  );
  return {
    poolSize: POOL_V4.length,
    legalInWindow: legalInWindow.length,
    aiCandidates: aiCandidates.length,
    byLeader,
  };
})();

const overallWin = 50;
const report = {
  meta: {
    version: 'v6.7',
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
    avgWinnerVitality: +(
      mech.winnerVitalitySum / Math.max(1, mech.games - mech.turnLimitDraws)
    ).toFixed(1),
    avgLoserDeckRemaining: +(
      mech.loserDeckRemainingSum / Math.max(1, mech.games - mech.turnLimitDraws)
    ).toFixed(1),
    essenceSpentPerGame: +(essenceSpentTotal / Math.max(1, mech.games)).toFixed(1),
  },
  // v6.0: board/clash texture, mulligan outcomes, comeback rate.
  boardMetrics: {
    avgUnitsOnBoard: +(
      boardMetrics.unitsOnBoardSum / Math.max(1, boardMetrics.turnSamples)
    ).toFixed(2),
    turnSamples: boardMetrics.turnSamples,
  },
  clashMetrics: {
    clashesPerGame: +(clashMetrics.clashes / Math.max(1, mech.games)).toFixed(2),
    avgAttackersPerClash: +(clashMetrics.attackersSum / Math.max(1, clashMetrics.clashes)).toFixed(
      2,
    ),
    avgFirstClashTurn: +(
      clashMetrics.firstClashTurnSum / Math.max(1, clashMetrics.gamesWithClash)
    ).toFixed(1),
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
          {
            winPct: pct(colorMatchup[a][b].wins, colorMatchup[a][b].games),
            games: colorMatchup[a][b].games,
          },
        ]),
      ),
    ]),
  ),
  lapses,
  invariantViolations: invariants.slice(0, 50),
  /**
   * v7.8: DEMOTED from "leaders". This is the random-cohort per-Leader win
   * table, and per the v7.7 findings (§2) it is NOT the number Leader balance
   * is judged on: it moves with cohort/deck composition (the pinned suite it
   * was checked against had itself been seeded with the cohort seed since
   * v6.2, hiding that). The pinned `leaderPairSuiteSummary` is the primary
   * Leader instrument; this table remains as a deck-composition diagnostic —
   * how a Leader fares given the decks THIS cohort happened to roll.
   */
  randomDeckLeaderDiagnostic: Object.fromEntries(
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
    Object.entries(colorStats).map(([c, s]) => [
      c,
      { winPct: pct(s.wins, s.games), games: s.games },
    ]),
  ),
  keywords: kwReport,
  costBands: Object.fromEntries(
    Object.entries(costBands).map(([b, s]) => [
      b,
      { cards: s.n, playedWinPct: pct(s.wins, s.games) },
    ]),
  ),
  topOverperformers: byResidual.slice(0, 15),
  topUnderperformers: byResidual.slice(-15).reverse(),
  // v7.4: the same lists ranked on the ramp-matched residual. Price off THESE
  // for anything gated on essence — see matchedBaseline. A card that is near
  // the top of the flat list and mid-table here was never overpowered; it was
  // expensive, and the flat metric was reading its own cost back at us.
  /**
   * v7.4: the direct test of whether the correction worked, and the number a
   * future pass should re-check before trusting either list.
   *
   * v7.5 — READ `residualByType`, NOT `locationResidualGap`. The v7.4 pass
   * closed with ~+1.7 of Location/non-Location gap left over and asked
   * whether Locations are genuinely that much stronger or there is a second
   * confound. Neither: the leftover is an artifact of the CONTRAST, not of
   * the metric. "non-Location" is a mixture, and about a fifth of it is
   * Events, which sit far below every other type because a one-shot stops
   * paying the moment it resolves. Split by type and the correction has in
   * fact landed — Locations and Units are on top of each other in both
   * cohorts:
   *
   *            cohort A            cohort B
   *   type     flat   ramp        flat   ramp
   *   Unit     +3.00  +3.20       +2.89  +3.08
   *   Location +3.29  +3.28       +3.48  +3.27
   *   Charm    +2.01  +2.30       +2.43  +2.66
   *   Event    -0.89  -0.53       -0.53  -0.71
   *
   *   Location minus Unit: +0.28 -> +0.07 (A), +0.59 -> +0.20 (B)
   *
   * So ramp-matching removes two thirds of the only type gap that was ever a
   * confound, and lands it inside noise in both cohorts. The permanent-minus-
   * Event split that remains (+3.57 / +3.75) is a property of the cards, not
   * of the measurement, and the right response is to read an Event against
   * the Event row rather than to "correct" it away.
   *
   * Consequence for pricing: the v7.2 blanket "no Location takes another cost
   * point" is LIFTED. Locations are priced off `topOverperformersRampMatched`
   * like every other permanent.
   *
   * `costCorrelation` stays because v7.2's wrong model — "expensive cards
   * read high" — is worth keeping refuted; it is near zero under both metrics
   * in both cohorts. `locationShareOfTop15` stays as the cautionary example
   * of a diagnostic that moves by whole cards and says nothing.
   */
  metricDiagnostics: {
    poolLocationShare: +(
      POOL_V4.filter((c) => c.type === 'Location').length / Math.max(1, POOL_V4.length)
    ).toFixed(3),
    /**
     * The stable version of the same question, and the one to read. A top-15
     * membership count moves by whole cards, so on 5,952 games it swings
     * either way between cohorts and says nothing — measured, and it did
     * exactly that (47%->27% on seed 1337, 40%->47% on seed 1337/42). The
     * mean-residual gap uses every scored card instead, so it is not hostage
     * to which handful of cards happen to top a list.
     */
    /**
     * v7.5: the number to read. Per card TYPE, so the Location question is
     * asked against Units (the other permanent that is actually comparable)
     * instead of against a mixture that is a fifth Events.
     */
    residualByType: Object.fromEntries(
      ['Unit', 'Location', 'Charm', 'Event'].map((t) => {
        const all = cardReport.filter((c) => c.type === t);
        const matched = byRampResidual.filter((c) => c.type === t);
        return [
          t,
          {
            cards: all.length,
            flat: +mean(all.map((c) => c.residual)).toFixed(2),
            rampMatched: +mean(matched.map((c) => c.rampResidual ?? 0)).toFixed(2),
            // v7.7: ramp ACCESS held constant rather than game length.
            rampState: +mean(
              all.filter((c) => c.stateResidual !== null).map((c) => c.stateResidual ?? 0),
            ).toFixed(2),
          },
        ];
      }),
    ),
    /** Location minus Unit — the type gap the ramp-matched metric had to close. */
    locationMinusUnit: {
      flat: +(
        mean(cardReport.filter((c) => c.type === 'Location').map((c) => c.residual)) -
        mean(cardReport.filter((c) => c.type === 'Unit').map((c) => c.residual))
      ).toFixed(2),
      rampMatched: +(
        mean(byRampResidual.filter((c) => c.type === 'Location').map((c) => c.rampResidual ?? 0)) -
        mean(byRampResidual.filter((c) => c.type === 'Unit').map((c) => c.rampResidual ?? 0))
      ).toFixed(2),
    },
    /**
     * Kept, but it is NOT the number to act on — "non-Location" is a mixture
     * that is about a fifth Events, and Events sit ~3.6 points below every
     * other type as a class. This contrast therefore reports that composition
     * as if it were Location inflation, which is what left v7.4 with an
     * unexplained ~+1.7. See `residualByType`.
     */
    locationResidualGap: {
      flat: +(
        mean(cardReport.filter((c) => c.type === 'Location').map((c) => c.residual)) -
        mean(cardReport.filter((c) => c.type !== 'Location').map((c) => c.residual))
      ).toFixed(2),
      rampMatched: +(
        mean(byRampResidual.filter((c) => c.type === 'Location').map((c) => c.rampResidual ?? 0)) -
        mean(byRampResidual.filter((c) => c.type !== 'Location').map((c) => c.rampResidual ?? 0))
      ).toFixed(2),
      locations: cardReport.filter((c) => c.type === 'Location').length,
    },
    /**
     * v7.6: Locations broken out by PRINTED COST, and Sanctums that carry a
     * keyword split from Sanctums that do not.
     *
     * Added because of this pass's Sacred null trial. Sacred's effect was
     * deleted outright — not repriced, not bounded, removed — and
     * `stone_bubbles` moved only -1.8 / -1.1, with its carriers still winning
     * 73.0% / 69.7% on a +18.6 / +15.8 normalized delta while printing NO
     * text at all. Six passes had been spent on that keyword's price and this
     * pass spent two more on its effect, and neither side of the card is where
     * its residual comes from.
     *
     * What is left to test is the class: a cheap Sanctum may simply read high
     * whatever is written on it. `residualByType` cannot see that, because it
     * averages every Location together — a 1-cost ramp Sanctum and a 6-cost
     * build-around land in the same number. This table asks the question the
     * null trial raised directly, and the keyword split is its control: if
     * blank Sanctums at the same cost read the same as Sacred ones, the
     * keyword was never the variable.
     */
    locationsByCost: Object.fromEntries(
      [1, 2, 3, 4, 5, 6]
        .map((cost) => {
          const at = byRampResidual.filter((c) => c.type === 'Location' && c.cost === cost);
          const withKw = at.filter((c) => (c.keywords ?? []).length > 0);
          const blank = at.filter((c) => (c.keywords ?? []).length === 0);
          const state = (xs: typeof at) => {
            const ok = xs.filter((c) => c.stateResidual !== null);
            return ok.length ? +mean(ok.map((c) => c.stateResidual ?? 0)).toFixed(2) : null;
          };
          return [
            String(cost),
            {
              cards: at.length,
              rampMatched: +mean(at.map((c) => c.rampResidual ?? 0)).toFixed(2),
              flat: +mean(at.map((c) => c.residual)).toFixed(2),
              // v7.7: the ramp-state-matched read of the same three rows.
              // This is the column to act on — see rampStateMatchedBaseline.
              state: state(at),
              keywordedCards: withKw.length,
              keyworded: +mean(withKw.map((c) => c.rampResidual ?? 0)).toFixed(2),
              keywordedState: state(withKw),
              blankCards: blank.length,
              blank: +mean(blank.map((c) => c.rampResidual ?? 0)).toFixed(2),
              blankState: state(blank),
            },
          ] as const;
        })
        .filter(([, v]) => v.cards > 0),
    ),
    locationShareOfTop15: {
      flat: +(byResidual.slice(0, 15).filter((c) => c.type === 'Location').length / 15).toFixed(3),
      rampMatched: +(
        byRampResidual.slice(0, 15).filter((c) => c.type === 'Location').length / 15
      ).toFixed(3),
    },
    costCorrelation: {
      flat: corr(
        cardReport.map((c) => c.cost),
        cardReport.map((c) => c.residual),
      ),
      rampMatched: corr(
        byRampResidual.map((c) => c.cost),
        byRampResidual.map((c) => c.rampResidual ?? 0),
      ),
    },
    n: byRampResidual.length,
  },
  /**
   * v7.7: of the players who dropped a Sanctum on turn T, how many won.
   * Published as the direct evidence for the correction below it: if making a
   * land drop is worth win rate on its own, a metric that does not hold it
   * constant is paying every Sanctum in the pool for it. `rampBaselineCurve`
   * is the same courtesy for the length-matched baseline.
   */
  sanctumDropCurve: Object.fromEntries(
    Object.entries(locPlayByTurn)
      .filter(([, v]) => v.games >= 50)
      .sort((a, b) => Number(a[0]) - Number(b[0]))
      .map(([k, v]) => [k, { games: v.games, winPct: pct(v.wins, v.games) }]),
  ),
  /**
   * v7.7: EVERY Location that cleared the play floor, ranked on the
   * ramp-state-matched residual — not a top-15 slice, because there are only
   * ~29 of them and the whole point of this baseline is to compare Sanctums to
   * each other. Ramp-matched and flat are carried alongside so the size of the
   * correction is visible per card rather than only in the class means.
   */
  locationsStateRanked: cardReport
    .filter((c) => c.type === 'Location' && c.stateResidual !== null)
    .sort((a, b) => (b.stateResidual ?? 0) - (a.stateResidual ?? 0))
    .map((c) => ({
      id: c.id,
      name: c.name,
      cost: c.cost,
      keywords: c.keywords,
      state: c.stateResidual,
      ramp: c.rampResidual,
      flat: c.residual,
      playedWin: c.playedWin,
      stateWin: c.stateWin,
      n: c.playedGames,
    })),
  topOverperformersRampMatched: byRampResidual.slice(0, 15),
  topUnderperformersRampMatched: byRampResidual.slice(-15).reverse(),
  rampBaselineCurve: Object.fromEntries(
    Object.entries(rampReached)
      .filter(([, v]) => v.games >= 50)
      .map(([k, v]) => [k, { games: v.games, winPct: pct(v.wins, v.games) }]),
  ),
  deadestInHand: [...cardReport].sort((a, b) => b.deadInHandRate - a.deadInHandRate).slice(0, 15),
  baselineWin: overallWin,
  archetypes: Object.fromEntries(
    Object.entries(archetypeStats).map(([id, s]) => [
      id,
      { name: POOL_BY_ID[id]?.name, winPct: pct(s.wins, s.games), games: s.games },
    ]),
  ),
  costTiers: tierReport,
  cpuDecisionTaxonomy: cpuDecisionReport,
  essenceCurve: curveReport,
  seatSwap: seatSwapReport,
  watchlist: watchlistReport,
  carryForward,
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
      {
        playsPerGame: +(s.plays / Math.max(1, mech.games)).toFixed(2),
        playedGameWinPct: pct(s.playedWins, s.playedGames),
      },
    ]),
  ),
  openingCurve: Object.fromEntries(
    Object.entries(openingCurve).map(([b, s]) => [
      b,
      { winPct: pct(s.wins, s.games), games: s.games },
    ]),
  ),
  winMarginHistogram: winMargin,
  poolCoverage,
  // v6.2 additions.
  costAbilityOutliers,
  /**
   * v7.7: the pinned suite collapsed to one row per Leader — its average
   * across all eight pinned opponents, and its best and worst matchup.
   *
   * The matrix has been published since v6.2 and read out of maybe twice,
   * because 72 cells is not something a pass compares across trials. This is
   * the number the Sentinel item (v7.6 carry-forward #2) actually needed: a
   * Leader read on FIXED decks, so a 25-point cohort split in the random-deck
   * table can be checked against a measurement that deck composition cannot
   * move.
   */
  leaderPairSuiteSummary: Object.entries(leaderPairSuite)
    .map(([a, row]) => {
      const cells = Object.entries(row);
      const games = cells.reduce((s, [, v]) => s + v.games, 0);
      const wins = cells.reduce((s, [, v]) => s + v.wins, 0);
      const ranked = cells
        .map(([b, v]) => ({ vs: POOL_BY_ID[b]?.name ?? b, winPct: pct(v.wins, v.games) }))
        .sort((x, y) => y.winPct - x.winPct);
      return {
        id: a,
        name: POOL_BY_ID[a]?.name ?? a,
        winPct: pct(wins, games),
        games,
        best: ranked[0],
        worst: ranked[ranked.length - 1],
      };
    })
    .sort((x, y) => y.winPct - x.winPct),
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
      .map(([kw, s]) => [
        kw,
        {
          neverActivatedPct: pct(s.neverActivatedGames, s.carrierGames),
          carrierGames: s.carrierGames,
        },
      ]),
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
  // v6.6 additions.
  costAbilityOutliersSignificant,
  printedBudgetOutliers,
  eventEffectProfile,
  keywordCarrierDetail,
  reservationEfficiency: {
    reservationsMade: lapses.reservationsMade,
    wasted: lapses.reservationWasted,
    wastedPct: pct(lapses.reservationWasted, lapses.reservationsMade),
    reactionPlays: mech.reactionPlays,
  },
  firstPlayerDiagnosis: {
    byGameLength: Object.fromEntries(
      Object.entries(fpDiagnosis.byLength).map(([b, s]) => [
        b,
        { p1WinPct: pct(s.p1Wins, s.games), games: s.games },
      ]),
    ),
    byLeaderFirst: {
      p1InvokedFirst: {
        p1WinPct: pct(fpDiagnosis.leaderFirst.p1FirstP1Wins, fpDiagnosis.leaderFirst.p1First),
        games: fpDiagnosis.leaderFirst.p1First,
      },
      p2InvokedFirst: {
        p1WinPct: pct(fpDiagnosis.leaderFirst.p2FirstP1Wins, fpDiagnosis.leaderFirst.p2First),
        games: fpDiagnosis.leaderFirst.p2First,
      },
      sameTurn: {
        p1WinPct: pct(fpDiagnosis.leaderFirst.tieP1Wins, fpDiagnosis.leaderFirst.tie),
        games: fpDiagnosis.leaderFirst.tie,
      },
    },
    // Mean (P1 vitality - P2 vitality) at the end of each turn number, for
    // the first 20 turns — shows the turn the gap opens.
    vitalityDiffByTurn: Object.fromEntries(
      Object.entries(fpDiagnosis.vitDiffByTurn)
        .filter(([t]) => Number(t) <= 20)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([t, s]) => [t, +(s.sum / Math.max(1, s.n)).toFixed(2)]),
    ),
  },
  guardTradeQuality: (() => {
    // v6.5: totalGuards sums only the four mutually-exclusive top-level
    // outcomes — guardDiesForNothingForced/Discretionary are a breakdown OF
    // guardDiesForNothing, not additional guards, so they're excluded here
    // to avoid double-counting.
    const total =
      guardOutcomes.guardWins +
      guardOutcomes.mutualTrade +
      guardOutcomes.guardDiesForNothing +
      guardOutcomes.guardSurvivesNoKill;
    return {
      guardWinsPct: pct(guardOutcomes.guardWins, total),
      mutualTradePct: pct(guardOutcomes.mutualTrade, total),
      guardDiesForNothingPct: pct(guardOutcomes.guardDiesForNothing, total),
      // v6.5: mustSurvive-aware split of guardDiesForNothing (% of ALL
      // guards, same denominator, so the two sub-percentages sum to
      // guardDiesForNothingPct above).
      guardDiesForNothingForcedPct: pct(guardOutcomes.guardDiesForNothingForced, total),
      guardDiesForNothingDiscretionaryPct: pct(
        guardOutcomes.guardDiesForNothingDiscretionary,
        total,
      ),
      guardSurvivesNoKillPct: pct(guardOutcomes.guardSurvivesNoKill, total),
      totalGuards: total,
    };
  })(),
  // v6.7 additions.
  leaderKitDiagnostics: Object.fromEntries(
    Object.entries(leaderKitStats).map(([id, s]) => [
      POOL_BY_ID[id]?.name ?? id,
      {
        avgFirstInvokeTurn:
          s.firstInvokeGames > 0 ? +(s.firstInvokeTurnSum / s.firstInvokeGames).toFixed(1) : null,
        winRateByLength: Object.fromEntries(
          Object.entries(s.byLength).map(([b, x]) => [
            b,
            { winPct: pct(x.wins, x.games), games: x.games },
          ]),
        ),
        usedAbilityWinPct: pct(s.usedAbilityWins, s.usedAbilityGames),
        usedAbilityGames: s.usedAbilityGames,
        invokedNoAbilityWinPct: pct(s.invokedNoAbilityWins, s.invokedNoAbilityGames),
        invokedNoAbilityGames: s.invokedNoAbilityGames,
      },
    ]),
  ),
  reactionWindowContent,
};

const outDir = path.join(process.cwd(), 'docs', 'sim-runs');
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, `v5-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

console.log(
  JSON.stringify(
    {
      outcomes: report.outcomes,
      mechanics: report.mechanics,
      lapses: report.lapses,
      invariantCount: invariants.length,
    },
    null,
    2,
  ),
);
// v7.8: the pinned suite is the PRIMARY Leader section (v7.7 §2 — the random
// table moves with cohort deck composition, and the pinned decks had been
// seeded with the cohort seed since v6.2), so it prints first, here.
console.log('\nLeaders — PRIMARY (pinned-deck suite, one row per Leader; v7.7):');
for (const l of report.leaderPairSuiteSummary)
  console.log(
    `  ${String(l.name).padEnd(28)} ${String(l.winPct).padStart(5)}%  n=${l.games}   ` +
      `best ${l.best.winPct}% vs ${l.best.vs}   worst ${l.worst.winPct}% vs ${l.worst.vs}`,
  );
console.log(
  '\nRandom-deck Leader table — deck-composition DIAGNOSTIC, not a balance read (v7.8):',
  JSON.stringify(report.randomDeckLeaderDiagnostic, null, 2),
);
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
console.log(
  `\nPool coverage (v6.1): ${report.poolCoverage.deckedPct}% decked, ${report.poolCoverage.playedPct}% played of ${report.poolCoverage.poolNonLeader} non-Leader cards; never decked: ${report.poolCoverage.neverDecked.length}, decked-never-played: ${report.poolCoverage.deckedButNeverPlayed.length}`,
);
console.log('\nCost/ability outliers (v6.2, |z|>=1.5):');
for (const c of report.costAbilityOutliers)
  console.log(
    `  ${c.name} (${c.type}, cost ${c.cost}) residual ${c.residual} z=${c.zScore} n=${c.playedGames}`,
  );
// v7.8: the one-row-per-Leader summary of this suite now prints as the
// primary Leaders section above; only the raw matrix is kept here.
console.log(
  '\nLeader-pair pinned suite raw matrix (v6.2):',
  JSON.stringify(report.leaderPairSuite, null, 2),
);
console.log('\nKeyword dead-weight (v6.3):', JSON.stringify(report.keywordDeadWeight, null, 2));
console.log(
  '\nEssence float by game stage (v6.3):',
  JSON.stringify(report.essenceFloatByStage, null, 2),
);
console.log(
  '\nLeader idle-ability rate (v6.3):',
  JSON.stringify(report.leaderIdleAbility, null, 2),
);
console.log('\nKept color-dead hands (v6.3):', lapses.keptColorDeadHand);
console.log('\nLeader ability usage (v6.4):', JSON.stringify(report.leaderAbilityUsage, null, 2));
console.log('\nGuard-trade quality (v6.4):', JSON.stringify(report.guardTradeQuality, null, 2));
console.log(
  '\nReservation efficiency (v6.6):',
  JSON.stringify(report.reservationEfficiency, null, 2),
);
console.log(
  '\nFirst-player diagnosis (v6.6):',
  JSON.stringify(report.firstPlayerDiagnosis, null, 2),
);
console.log(
  '\nPrinted-budget fit (v6.6):',
  JSON.stringify(report.printedBudgetOutliers.fit, null, 2),
);
for (const p of report.printedBudgetOutliers.outliers)
  console.log(
    `  ${p.name} cost ${p.cost} stats ${p.statTotal} budgetResidual ${p.budgetResidual} z=${p.z} [${p.keywords.join(',')}]`,
  );
console.log(
  '\nCost/ability outliers, SIGNIFICANCE-GATED (v6.6, |z|>=1.5 AND Wilson CI excludes deck baseline):',
);
for (const c of report.costAbilityOutliersSignificant)
  console.log(
    `  ${c.name} (${c.type}, cost ${c.cost}) residual ${c.residual} z=${c.zScore} n=${c.playedGames} played ${c.playedWin}% CI[${c.ci95.lo},${c.ci95.hi}] vs deck ${c.deckWin}%`,
  );
console.log('\nWorst Events by residual (v6.6 effect-magnitude profile):');
for (const e of report.eventEffectProfile.slice(0, 12))
  console.log(
    `  ${e.name} (${e.subtype}, cost ${e.cost}) ${e.action}${e.magnitude !== null ? ' ' + e.magnitude : ''} -> ${e.target} residual ${e.residual} n=${e.playedGames}`,
  );
console.log('\nTop overperformers:');
for (const c of report.topOverperformers)
  console.log(
    `  ${c.name} (${c.type}${c.subtype ? '/' + c.subtype : ''}, cost ${c.cost}) played ${c.playedWin}% deck ${c.deckWin}% residual +${c.residual} [${c.keywords.join(',')}]`,
  );
console.log('\nTop underperformers:');
for (const c of report.topUnderperformers)
  console.log(
    `  ${c.name} (${c.type}${c.subtype ? '/' + c.subtype : ''}, cost ${c.cost}) played ${c.playedWin}% deck ${c.deckWin}% residual ${c.residual} [${c.keywords.join(',')}]`,
  );
console.log('\nTop overperformers (RAMP-MATCHED — price off this list):');
for (const c of report.topOverperformersRampMatched)
  console.log(
    `  ${c.name} (${c.type}${c.subtype ? '/' + c.subtype : ''}, cost ${c.cost}) played ${c.playedWin}% matchedBase ${c.matchedWin}% residual ${(c.rampResidual ?? 0) >= 0 ? '+' : ''}${c.rampResidual} (flat ${c.residual >= 0 ? '+' : ''}${c.residual}) n=${c.playedGames}`,
  );
{
  const md = report.metricDiagnostics;
  const sg = (n: number) => (n >= 0 ? '+' : '') + n;
  console.log('\nMetric check — mean residual by card TYPE (v7.5; this is the one to read):');
  for (const [t, v] of Object.entries(md.residualByType))
    console.log(
      `  ${t.padEnd(9)} ${String(v.cards).padStart(3)} cards   flat ${sg(v.flat).padStart(6)}` +
        `   ramp-matched ${sg(v.rampMatched).padStart(6)}   ramp-STATE ${sg(v.rampState).padStart(6)}`,
    );
  console.log('\n  Locations by printed cost (v7.6 — is a cheap Sanctum just good?):');
  const sgn = (n: number | null) => (n === null ? '   n/a' : sg(n).padStart(6));
  for (const [cost, v] of Object.entries(md.locationsByCost))
    console.log(
      `    cost ${cost}  ${String(v.cards).padStart(2)} cards  ramp ${sg(v.rampMatched).padStart(6)}  ` +
        `STATE ${sgn(v.state)}  ` +
        `(with keyword ${sg(v.keyworded).padStart(6)}/${sgn(v.keywordedState)} n=${v.keywordedCards}, ` +
        `blank ${sg(v.blank).padStart(6)}/${sgn(v.blankState)} n=${v.blankCards})`,
    );
  console.log(
    "    STATE = v7.7 ramp-state-matched baseline: measured against this card's own in-deck\n" +
      '    games that reached the same Location count, so the land drop the Sanctum IS sits on\n' +
      '    both sides of the subtraction. Price Sanctums off it, not off ramp.',
  );
  console.log('\n  Every Location, ranked on the ramp-state residual (v7.7):');
  for (const c of report.locationsStateRanked)
    console.log(
      `    ${String(c.name).padEnd(30)} cost ${c.cost}  state ${sgn(c.state).padStart(6)}  ` +
        `ramp ${sgn(c.ramp)}  flat ${sgn(c.flat)}  n=${c.n}  [${c.keywords.join(',')}]`,
    );
  console.log(
    `  Location MINUS Unit: flat ${sg(md.locationMinusUnit.flat)} -> ramp-matched ` +
      `${sg(md.locationMinusUnit.rampMatched)} — the type gap the correction had to close; ` +
      `near 0 means Locations price like any other permanent.`,
  );
  console.log(
    `  (Legacy Location-minus-NON-Location, kept but NOT the number to act on: ` +
      `flat ${sg(md.locationResidualGap.flat)} -> ramp-matched ${sg(md.locationResidualGap.rampMatched)}. ` +
      `"non-Location" is a fifth Events, and Events sit ~3.6 below every other type as a class, ` +
      `so this contrast reports composition as if it were Location inflation.) ` +
      `Top-15 share ${(md.locationShareOfTop15.flat * 100).toFixed(0)}% -> ` +
      `${(md.locationShareOfTop15.rampMatched * 100).toFixed(0)}% vs a ` +
      `${(md.poolLocationShare * 100).toFixed(0)}% pool share — a 15-item count that swings between cohorts; ignore it.`,
  );
}
console.log('\nCarried-forward cards (v7.6 — the un-truncated read; compare these across trials):');
for (const c of report.carryForward)
  console.log(
    c.underFloor
      ? `  ${c.name} (${c.type}, cost ${c.cost}) UNDER FLOOR — played in only ${c.playedGames} games ` +
          `(decked in ${'inDeckGames' in c ? c.inDeckGames : '?'}). Not a lower residual; a smaller format.`
      : `  ${c.name} (${c.type}, cost ${c.cost}) state ${(c.stateResidual ?? 0) >= 0 ? '+' : ''}${c.stateResidual} ` +
          `ramp ${(c.rampResidual ?? 0) >= 0 ? '+' : ''}${c.rampResidual} ` +
          `(flat ${(c.residual ?? 0) >= 0 ? '+' : ''}${c.residual}) n=${c.playedGames} [${(c.keywords ?? []).join(',')}]`,
  );
console.log('\nRamp baseline curve (win rate of all card-plays made at N Locations):');
for (const [n, v] of Object.entries(report.rampBaselineCurve))
  console.log(`  ${n} Locations: ${v.winPct}% over ${v.games} plays`);
console.log('\nDeadest in hand:');
for (const c of report.deadestInHand)
  console.log(`  ${c.name} cost ${c.cost} deadRate ${c.deadInHandRate}%`);
console.log(
  '\nLeader-kit diagnostics (v6.7):',
  JSON.stringify(report.leaderKitDiagnostics, null, 2),
);
console.log(
  '\nReaction-window content audit (v6.7):',
  JSON.stringify(report.reactionWindowContent, null, 2),
);
console.log(`\nReport written: ${outPath}`);
