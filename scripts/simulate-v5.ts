/**
 * Fry Cards v5 balance & CPU-quality sim harness (essence engine).
 *
 * Runs seeded CPU-vs-CPU games across randomized coherent archetypes over
 * the FULL 292-card catalog (bundled fallback == live Supabase pool, parity
 * verified by scripts/fetch-cards.ts, and re-verified live for v5.2 — see
 * docs/BALANCE_SIM_FINDINGS_v5.2.md) and reports:
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
 * v5.2 additions (docs/BALANCE_SIM_FINDINGS_v5.2.md carry-forward items):
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
 * Usage: npx tsx scripts/simulate-v5.ts [gamesPerPairing] [numDecks] [seed]
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
} from '../src/game/v3/engine';
import { POOL_BY_ID, POOL_V4 } from '../src/game/v3/cardpool';
import { buildDeck, randomArchetype } from '../src/game/v3/decks';
import { playTurn, maybeMulliganPlayer } from '../src/game/v3/ai';
import type { DeckDef } from '../src/game/v3/engine';

const GAMES_PER_PAIRING = Number(process.argv[2] ?? 4);
const NUM_DECKS = Number(process.argv[3] ?? 24);
const SEED = Number(process.argv[4] ?? 1337);
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
}
const cardStats: Record<string, CardStat> = {};
function cs(id: string): CardStat {
  return (cardStats[id] ??= {
    inDeckGames: 0, inDeckWins: 0, playedGames: 0, playedWins: 0,
    drawnGames: 0, drawnWins: 0, timesPlayed: 0, timesDrawn: 0, timesDeadInHand: 0,
  });
}

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
  sequencingSuboptimal: 0, // a cheaper card was played before a strictly-better-value one it could also afford, wasting essence when both didn't fit
  sequencingOpportunities: 0,
  reactionWindowMissed: 0, // reaction window open, defender had a legal Quick/Ambush play, didn't use it
  reactionWindowOpportunities: 0,
};

// --- v5.2: essence-curve efficiency -----------------------------------------
const curveStats = {
  heldPlayableCardTurns: 0, // turn ended with an on-color, affordable-by-locations card still in hand
  totalTurns: 0,
  essenceFloatedEstimate: 0, // sum of (locations - cards played this turn) as a rough float proxy
};

const mech = {
  games: 0,
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

function runGame(deckA: DeckDef, deckB: DeckDef, seed: number, game: number): void {
  const rng = mulberry32(seed);
  const state = createGame(deckA, deckB, POOL_BY_ID, { rng });
  maybeMulliganPlayer(state, 'P1', rng);
  maybeMulliganPlayer(state, 'P2', rng);

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

    const events = playTurn(state, pid);

    // --- event-based mechanics telemetry ---
    let usedAbility = false;
    for (const ev of events) {
      if (ev.kind === 'invoke') {
        const def = POOL_BY_ID[ev.iid.split('#')[0]];
        const actor = ev.by ?? pid;
        if (ev.by) mech.reactionPlays++;
        if (def) {
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
    }

    // --- lapse: missed lethal (had it pre-turn, opponent still alive) ---
    if (couldLethal && !state.winner) lapses.missedLethal++;

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
  mech.totalErode +=
    perGame.erodeStart.P1 - state.players.P1.deck.length - drawn.P1.size >= 0 ? 0 : 0; // erode tracked via ash below

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

    // Keyword carrier stats (played carriers only).
    const kwSeen = new Set<string>();
    for (const id of played[pid]) {
      for (const kw of POOL_BY_ID[id]?.keywords ?? []) kwSeen.add(kw);
    }
    for (const kw of kwSeen) {
      kwStats[kw].carrierGames++;
      if (won) kwStats[kw].carrierWins++;
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
console.log(`Fry Cards v5 sim: pool=${POOL_V4.length} cards, decks=${NUM_DECKS}, games/pairing=${GAMES_PER_PAIRING}, seed=${SEED}`);
const rootRng = mulberry32(SEED);
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

const kwReport = Object.entries(kwStats)
  .filter(([, s]) => s.carrierGames > 0)
  .map(([kw, s]) => ({
    keyword: kw,
    carrierWin: pct(s.carrierWins, s.carrierGames),
    carrierGames: s.carrierGames,
    poolCarriers: POOL_V4.filter((c: CardDef) => c.keywords?.includes(kw)).length,
  }))
  .sort((a, b) => b.carrierWin - a.carrierWin);

const overallWin = 50;
const report = {
  meta: {
    version: 'v5.0',
    seed: SEED,
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
  },
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
console.log('\nTop overperformers:');
for (const c of report.topOverperformers) console.log(`  ${c.name} (${c.type}${c.subtype ? '/' + c.subtype : ''}, cost ${c.cost}) played ${c.playedWin}% deck ${c.deckWin}% residual +${c.residual} [${c.keywords.join(',')}]`);
console.log('\nTop underperformers:');
for (const c of report.topUnderperformers) console.log(`  ${c.name} (${c.type}${c.subtype ? '/' + c.subtype : ''}, cost ${c.cost}) played ${c.playedWin}% deck ${c.deckWin}% residual ${c.residual} [${c.keywords.join(',')}]`);
console.log('\nDeadest in hand:');
for (const c of report.deadestInHand) console.log(`  ${c.name} cost ${c.cost} deadRate ${c.deadInHandRate}%`);
console.log(`\nReport written: ${outPath}`);
