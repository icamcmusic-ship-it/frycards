# Balance & Sim Findings — v6.2 (July 2026)

Latest CPU-vs-CPU balance pass, run AFTER the v6.2 sim-harness/CPU/keyword/
card changes. Supersedes the v6.1 findings doc (deleted). Raw report:
`docs/sim-runs/` (latest JSON; only the most recent run is kept in-repo).

**Run:** `npx tsx scripts/simulate-v5.ts 8 48 1337` — 18,048 games, 48 random
archetype decks, seed 1337. **Invariant violations: 0.** A dedicated
`npx tsx scripts/simulate-v5.ts 1 300 1337` coverage check and the harness's
built-in `leaderPairSuite` (deckSeed-pinned, 12 games/seat/ordered Leader
pair, 2,688 games) were also run — see below.

## What changed before this run (v6.2)

Sim harness (v6.2 data captures — see the module docstring in
`scripts/simulate-v5.ts` for the full list):
- **Shadow attack heuristic rewritten** to mirror ai.ts's actual
  `chooseAttackers` policy (all-in-when-lethal-survives-guarding, favorable
  trades, safe-vs-all, Swarmproof/Aerial awareness) instead of a strict
  kills-and-survives rule. The v6.1 40.1% "divergence" number was mostly the
  shadow model disagreeing with intentional v6.1 policy changes it was never
  updated for — not real CPU error. It now reads 21.8%, a number that means
  something again.
- **`venomousSuicide` split** into `venomousSuicideDeliberate` (a mutual kill
  trade, or part of a winning all-in) and `venomousSuicideBlunder` (the
  attacker died and the Venomous guard is unscathed — no value at all): 4,855
  deliberate vs 523 genuine blunders this run (90.3% of "suicides" turned out
  to be intentional trades under the current policy).
- **DeckSeed-pinned per-Leader-pair suite** (`leaderPairSuite`): one fixed,
  seeded deck per Leader, every ordered pair played both seats, isolating
  the Leader-kit signal from random-archetype cohort noise — used below to
  confirm Avatar of the Abyss's kit (not just its cohort's decks) was the
  problem before touching it.
- **Cost/ability z-score outliers** (`costAbilityOutliers`): normalizes the
  played/deck win-rate residual to a z-score so outliers are flagged
  independent of how wide a given run's spread happens to be.
- **Bigger suite**: 18,048 games (was 2,208) specifically to get real sample
  sizes for Resonant (84→1,190) and Doublestrike (147→1,379), the two
  keywords v6.1 flagged as too small-n to act on.

Sim harness bug fixes (two false-positive lapse counters, found while
building the above):
- `tookGuardableLethal` was counting a defender's OWN units that had already
  guarded (and survived) THIS clash as "spare, unused guards" — `declareGuards`
  never exhausts a guarding unit, so `!exhausted` alone doesn't mean "never
  assigned." Fixed by excluding anyone appearing in the clash's actual guard
  assignments. This dropped the counter from a nonsensical 16.9% of games to
  a believable 3.0%.
- The hand-size invariant (`hand.length > MAX_HAND` at `phase === 'Dawn'`)
  was a false-positive generator: Dusk unconditionally sheds to `MAX_HAND`
  (covered directly by `engine.test.ts`), but a player's own Dawn draw (and
  any atDawn draw triggers) can legally push a hand past `MAX_HAND` before
  Main I ever runs, and `state.phase` only reads `'Dawn'` externally in the
  rare case a game ends mid-`runDawn`. Removed the check entirely — it never
  reliably distinguished a bug from a legal 8+-card Dawn snapshot.
- `removalTargeting.suboptimalRate` was flagging every "shatter around an
  Unbreakable wall" as a mis-target, because its legal-target comparison
  didn't exclude Unbreakable units the way `autoTarget` correctly does for
  Shatter. Fixed; rate moved from 4.2% (v6.1) to a real 2.8%.

Keyword pricing (`KEYWORD_COST`, from the 18k-game run):
**Resonant 3→2** (v6.1's 84-game +7.1 read flips hard at n=1,190: -17.1
archetype-normalized delta — the double-resolution isn't worth +3 even after
the cut, see carry-forward below), **Doublestrike 3→4** (v6.1's 147-game
+12.8 holds up at n=1,379: +8.1), **Reckless 1→2** (+6.4, n=6,082, first
pass with a real sample), **Regenerate 3→2** (was -7.9 pre-cut, now -1.3 —
back in the healthy band), **Surge 1→0** (repeat-offender: -5.9 in v6.1 at
n=1,036, -2.4 to -4.8 across this pass's runs — a second consecutive
negative read, cut like Siphon/Skywatch).

Card costs/stats (`COST_ADJUST`/`STAT_ADJUST` in `cardpool.ts`, from
outlier + z-score reports across this pass's runs — repeat offenders get a
second stacked point, same as the v5.3 precedent):
- Second `+1` stack (now `+2` total, still positive after the first `+1`):
  `slate_scaled_serpent`.
- Second `-1` stack (now `-2` total, still negative after the first `-1`):
  `coral_collapse`, `tectonic_rift`.
- New `+1`: `sand_portal`, `glass_kelp_forest`, `ribvault_cathedral`,
  `fissure_gas_bunker`, `gearbone_sentinel`, `jawbone_span`,
  `resonant_shuriken`, `volcanic_nanite_core`, `chalice_of_quicksilver`,
  `kinetic_siphon_swarm`.
- New `-1`: `sonic_shatter`, `porcelain_lobster`, `glowing_manta`,
  `celestial_attunement`, `marble_reef_shark`, `sunken_archive`,
  `ashen_circle_rite`, `heart_of_the_thermal_grid`, `ruthless_succession`.
- New `STAT_ADJUST -2`: `familiar_in_the_dark` (already at the cost-7
  ceiling; a `COST_ADJUST` would clip to nothing).

Leader kit (first-ever per-Leader manual override — see carry-forward #5 in
the v6.1 doc): **Avatar of the Abyss loses its Commander keyword.** Flagged
as an outlier across two consecutive passes (v6.1: 67.0%, "watch"; this
pass's initial run: 70.3%) stacking max Resolve (Mythic, 6), an unconditional
-2 Shatter, and Commander's global +1 Might in one kit. The new
deckSeed-pinned `leaderPairSuite` confirmed this was the Leader kit itself,
not cohort luck — its pinned deck beat every other pinned Leader deck
(58.3%-100% win rate). Stripping Commander (the v4.24 precedent: pull a
keyword from a repeat offender once there's no cost/stat budget left to
trim — Leaders have none) brought it to 67.8%, back to its pre-v6.1-flag
level.

## Headline results

| Metric | Value | Read |
|---|---|---|
| P1 win rate | 60.9% | Essentially unchanged from v6.1 (60.1%) — none of this pass's changes touch first-mover math. Confirmed real (not cohort noise) by the paired seat-swap suite: 59.4% over 399 decided games. **Still the top carry-forward item** (3rd consecutive pass at ~59-61%). |
| Avg game length | 20.0 turns | Flat vs v6.1 (20.1). |
| Vitality wins | 93.7% | Flat vs v6.1 (96.1%); deck-out stayed low (5.7%). |
| Clashes/game | 8.48, first clash turn 5.3 | Combat-every-game holds (99.9%). |
| Comeback rate | 25.0% | Flat vs v6.1 (26.4%). |
| Mulligan | 3.2% rate; mull hands win 48.9% vs keep 50.0% | Close to a coin flip this run (v6.1: mull 55.5% vs keep 49.9%) — within noise at this sample (1,144 mulliganed hands); not a regression signal on its own. |
| Opening curve | (see raw JSON `openingCurve`) | Unchanged shape from v6.1; top-heavy openers still punished. |
| Wasted essence/game | 41.1 | Flat vs v6.1 (44.2). |
| Pool coverage | 71.1% of 284 non-Leader cards decked (48-deck tournament); 89.1% at a dedicated 300-deck coverage check | **Not a regression** — v6.1's "88%" figure was from its own 300-deck check, and a "24-deck tournament touches ~58%" per the v6.1 doc; this pass's 48-deck tournament sits between those two as expected, and the dedicated 300-deck check (89.1%) is flat-to-slightly-up vs v6.1. Supabase↔bundled catalog parity re-verified 292/292 ids, field-for-field. |

## Keyword health (archetype-normalized delta, carrier games, this run)

Healthy band (within ±10, matching v6.1's ±13 goalpost tightened this pass
now that samples are bigger): Sacred +10.0 (n=3,246), Doublestrike +8.1
(n=1,379, post-repricing), Warded +6.8, Aerial +6.4, Reckless +6.4
(post-repricing, n=6,082), Alert +5.2, Venomous +3.7, Bountiful +3.3, Runic
+3.2, Siphon +2.9, Unbreakable +2.7, Hardened +2.2, Soulbound -2.1,
Swarmproof -1.9, Surge -2.4 (post-repricing, was -5.9), Regenerate -1.3
(post-repricing, was -7.9), everything else under ±2.

**Resonant is the one keyword still outside the healthy band after this
pass's cut**: -17.1 at n=1,190 (cost cut 3→2 mid-pass; re-verification run
still read -17.8 before the final card-cost batch, -17.1 after). Two of its
three carriers (`bioluminescent_tide`, `flash_freeze`) look individually
strong on inspection (double damage/double draw for the cost), while
`dissolving_persona` (Resonant Banish) likely drags the average down — a
single-target removal effect's second resolution is dead value on boards
with only one enemy unit, which autoTarget's Resonant re-aim (v6.0) doesn't
fully compensate for since a banished board has nothing left to re-aim at.
**Top carry-forward**: next pass, either cut Resonant to +1 or move to a
per-card fix (recost `dissolving_persona` down, or restrict Resonant framing
to non-single-target effects going forward) rather than another blanket cut.

## Leader spread

Avatar of the Abyss 67.8 / Crimson Vector Commander 61.8 / Mer-King 55.8 /
Ruin-Walker Overseer 45.8 / Apex Nanite Shinobi 41.2 / Sovereign of the
Dying Star 39.0 / Ethereal Sea Witch 38.9 / Legendary Diver 36.3.
Avatar of the Abyss dropped from 70.3% (this pass's pre-nerf run) to 67.8%
after stripping Commander — back to its v6.1 level rather than climbing
further, but still the top seed; if it's still the top outlier next pass,
the next lever is trimming its -2 Shatter's cost efficiency (e.g. -3) rather
than another keyword strip. The deckSeed-pinned `leaderPairSuite` (full 8x8
matrix in the raw JSON) is now the standing tool for any further Leader-kit
work, per the v6.1 carry-forward.

## CPU decision quality

- Guard divergence 0%, removal-target suboptimal 2.8% (down from a
  false-positive-inflated 4.2% in v6.1 — see harness fixes above).
- Attack divergence 21.8% against the rewritten shadow heuristic (down from
  40.1% against the stale one) — this is believed to be mostly genuine
  remaining daylight between the heuristic and the CPU's turn-order-dependent
  reality (Might buffs/Commander auras applied mid-turn, multi-attacker
  sequencing) rather than a bug; worth another pass if it doesn't come down
  further on its own next time.
- `tookGuardableLethal` down to 3.0% of games (536/18,048) from a
  false-positive-inflated 16.9% (3,048/18,048) before the harness fix — the
  remaining rate looks like genuine Swarmproof/Aerial guard-shortage edge
  cases (not enough eligible guards to block a specific threat), not a
  chooseGuards() bug; the profitable-block-then-chump-fallback structure in
  `ai.ts`'s `chooseGuards` was re-read this pass and looks sound.
- `venomousSuicide` 5,378 total, now split 4,855 deliberate / 523 blunder —
  90.3% of "suicides" are intentional trades under the free-attack/
  favorable-trade policy from v6.1; the remaining 523 (2.9% of games) are the
  real blunder rate to watch.

## Carry-forward items

1. **First-player advantage (~59-61%)** — flat across three consecutive
   passes (v6.1: 60.1%/61.2%; this pass: 60.9%/59.4%). Sized precisely again
   via the seat-swap suite; still not acted on. A rules-level compensation
   (e.g. an essence or draw tweak for P2 beyond the 8th card) needs its own
   dedicated pass with careful invariant checking, not a drive-by change
   bundled into a balance pass.
2. **Resonant** — cut 3→2 this pass, still reads -17ish at n≈1,190. Likely a
   per-card problem (`dissolving_persona`'s single-target Banish wasting its
   second resolution) rather than a pure keyword-price problem; investigate
   at the card level next pass before cutting the shared weight further.
3. **Avatar of the Abyss** — Commander strip brought it from 70.3% back to
   67.8% (its pre-v6.1-flag level). If it's still the top Leader outlier next
   pass, the next lever is its -2 Shatter's resolve cost, not another
   keyword strip.
4. **Attack divergence (21.8%)** — down 18pts from fixing the stale shadow
   model, but not yet at guard-divergence's 0%. Worth a closer look at
   whether it's genuine CPU improvement headroom or heuristic-model daylight.
5. **`venomousSuicideBlunder` (2.9% of games)** — now isolated from the
   deliberate-trade majority; a good target for the next CPU-quality pass.
