# Balance & Sim Findings — v6.1 (July 2026)

Latest CPU-vs-CPU balance pass, run AFTER the v6.1 engine/CPU/deck changes.
Supersedes the v5.3 findings doc (deleted). Raw report:
`docs/sim-runs/` (latest JSON; only the most recent run is kept in-repo).

**Run:** `npx tsx scripts/simulate-v5.ts 4 24` — 2,208 games, 24 random
archetype decks, seed 1337. **Invariant violations: 0.**

## What changed before this run (v6.1)

Engine (rulebook compliance):
- **Overrun spill fixed** — a guarded attacker whose guards died in the
  Quickstrike sub-step no longer deals FULL Might to the face; only Overrun
  spills, and only the excess past guard absorption.
- **Reaction window for both players** (rulebook §5) — the active player can
  now invoke Quick Events / Ambush units during their own Clash; the CPU
  attacker gets a reaction pass after the defender's.
- Mulligan gated to game start; setup draws route through the empty-deck
  loss check; `'dies'` triggers fire on banish too; `tapLocationForEssence`
  uses `locationYield()`.

Card costs:
- All non-Unit keyword surcharges now come from `KEYWORD_COST` (the mappers'
  hardcoded values are gone). Balance-informed values: **Resonant 2→3**
  (was +20.7 normalized delta in the pre-fix run), **Bountiful 2→1**
  (was −24), Sacred 1, Surge 1, Runic 1, Soulbound 1, Commander 2,
  **Resolute 0→1**.

CPU:
- Venomous- and Quickstrike-aware guarding; Swarmproof-aware attacking;
  free attacks and favorable trades (no longer strictly `kills && survives`);
  Leader self-shatter for minor value stopped; Resonant/Bountiful play
  priority; Surge discounts visible to the planner (`effectiveCost`);
  Leader pips counted in Wellspring color demand; per-turn reservation
  state no longer leaks across games; failed rebonds no longer waste essence.

Deck generation (full-pool usage):
- Seeded jitter in the deck scorer. Coverage across 300 random decks:
  **54% → 88%** of the non-Leader pool. (A 24-deck tournament touches
  ~58%; the per-Leader color-identity filter is the remaining ceiling —
  every one of the 284 non-Leader cards is legal for at least one Leader,
  and Supabase ↔ bundled catalog parity is verified at 292/292 ids.)

Sim harness (v6.1 data captures):
- Leader-vs-leader matchup matrix, per-card-type play stats, per-card
  `playRatePerDeckGame`, full-pool coverage report, opening-hand curve
  quality, win-margin histogram — and a FIX to the seat-swap metric, whose
  old `firstSeatWinPct` was actually deck A's overall win rate (~50% by
  construction) and measured nothing.

## Headline results

| Metric | Value | Read |
|---|---|---|
| P1 win rate | 60.1% | Real first-mover edge — confirmed by the fixed seat-swap suite (61.2% over 397 paired-seed games). The 8th-card draw for P2 is not enough at 60-card scale. **Top carry-forward item.** |
| Avg game length | 20.1 turns | Down from 22.5 pre-fix; Overrun fix + freer attacking speeds games up. |
| Vitality wins | 96.1% | Deck-out nearly vanished (was 13.5%) — more aggression means games end on damage. |
| Clashes/game | 8.6, first clash turn 5.2 | 100% of games now see combat. |
| Comeback rate | 26.4% | Up from 19.8% — the both-player reaction window helps the defender-behind. |
| Mulligan | 2.5% rate; mull hands win 55.5% vs keep 49.9% | The rulebook mulligan is a healthy, slightly winning play when taken. |
| Opening curve | avg cost <2.5 wins 53.7%, ≥3.5 wins 47.1% | Top-heavy openers punished, as designed. |
| Wasted essence/game | 44.2 (was 78.1) | CPU planning improvements cut float nearly in half. |

## Keyword health (archetype-normalized delta, carrier games)

Post-repricing: **Resonant** settled from +20.7 to +7.1 (84 games — small n,
watch), **Bountiful** from −24 to +8.2 (404 games), Sacred from −14.6 to
+3.3. Nothing now sits past ±13. Watchlist for next pass: Doublestrike
(+12.8, 147 games), Surge (−5.9 at 1,036 games — the discount may be paying
for sequencing the CPU doesn't fully exploit), Resolute (40.8% carrier win
after its +1 — verify the surcharge didn't overshoot).

## Leader spread

avatar_of_the_abyss 67.0 / mer_king 58.3 / crimson_vector_commander 57.2 /
ruinwalker_overseer 45.4 / legendary_diver 43.7 / ethereal_sea_witch 38.0 /
apex_nanite_shinobi 34.2 / sovereign_of_the_dying_star 33.3.
Spread is wide but cohort-noisy at 24 random decks; the new
`leaderMatchups` matrix in the report is the tool for the next targeted
pass. Avatar of the Abyss over-performs across both runs — watch.

## CPU decision quality

- Guard divergence 0%, removal-target suboptimal 4.2%, missed lethal 0.
- Attack divergence 40.1% vs the shadow heuristic — expected: the CPU now
  intentionally attacks in spots (free attacks, trades) the conservative
  shadow heuristic declines; the shadow model needs updating to match the
  new policy before this number is meaningful again.
- `venomousSuicide` 693 counts attacks into boards SHOWING a ready Venomous
  unit — most are now deliberate trades/frees under the new policy; the
  counter conflates them. Refine next pass.

## Carry-forward items

1. **First-player advantage (~60/40)** — consider essence or draw-based
   compensation beyond P2's 8th card; measure with the (fixed) seat-swap suite.
2. Update the shadow attack heuristic to the new attack policy.
3. Split `venomousSuicide` into deliberate-trade vs genuine blunder.
4. Resonant (n=84) and Doublestrike (n=147) need bigger samples before
   further tuning.
5. Leader spread: run a deckSeed-pinned suite per Leader pair using
   `leaderMatchups` before touching Leader kits.
