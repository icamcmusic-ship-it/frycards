# Balance & Sim Findings — v6.4 (July 2026)

Latest CPU-vs-CPU balance pass, run AFTER the v6.4 sim-harness/card changes
below. Supersedes the v6.3 findings doc (deleted). Raw report:
`docs/sim-runs/` (latest JSON; only the most recent run is kept in-repo,
`.gitignore`d).

**Run:** `npx tsx scripts/simulate-v5.ts 6 32 1337` — 5,952 games, 32 random
archetype decks, seed 1337. **Invariant violations: 0.** The harness's
built-in paired-seed seat-swap suite and deckSeed-pinned `leaderPairSuite`
were also run as part of the same pass.

## Full card pool confirmed

Live Supabase `public.cards` (292 rows) diffed field-for-field (by id) against
the bundled `generated-cards.ts` fallback the sims run over: 292/292 match
exactly, zero mismatches, zero missing/extra ids. Sims below run over the
complete, current pool.

## What changed before this run (v6.4)

Sim harness data captures added first, per the standing practice:
- **Per-Leader-ability usage/value** (`leaderAbilityUsage`): the existing
  `abilityUsesPerGame` was a single number per Leader that summed BOTH
  abilities together, hiding a kit where one ability is picked almost every
  game and the other is close to dead weight. Now split by the ability's own
  rules text. First read: **Legendary Diver's "+1: Deal a card" fires in only
  164/1,488 games** vs. its "-1: Deal 2 damage" firing in 1,373 — not a CPU
  bug (once-per-turn ability choice; `runLeaderAbility` in `ai.ts` correctly
  scores live removal (8) above card draw (5) when both are legal), but a
  genuine kit-usage signal worth watching if Legendary Diver's card-draw
  ability text or cost ever changes.
- **Guard-trade quality** (`guardTradeQuality` / `lapses.guardDiesForNothing`):
  of every guard block the CPU actually assigned, whether it killed the
  attacker, traded with it, or died for nothing. First read: 20.7% guard
  wins, 23.6% mutual trade, **27.6% die for nothing**, 28.1% survive without
  killing (a legitimate chump/stall, not a loss). The 27.6% figure is
  plausible but **not yet separable from correct forced chump-blocks** (the
  `mustSurvive` branch in `ai.ts`'s `chooseGuards` deliberately assigns a
  guard that dies for nothing when that's the only way to survive lethal —
  which is correct play, not a lapse). Not actioned this pass; the harness
  needs a `mustSurvive`-aware split (was this guard forced, or discretionary?)
  before this number can be trusted as a CPU-quality signal. Carried forward.

## Findings acted on this pass

**Card cost/stat adjustments** (`COST_ADJUST`/`STAT_ADJUST` in `cardpool.ts`,
from z-score outliers across this pass's 5,952-game run):

Repeat offenders — still outside `|z|>=1.5` the same direction after their
v6.3 point, second point stacked:
- `+1` more (now `+2` total): `abyssal_pathway`, `glass_shrimp`.
- `-1` more (now `-2` total): `secret_lair`, `helix_swarm`, `towering_tsunami`
  (this one got *worse*, -5.3 → -8.8, after its first cost cut — flagged for
  a closer look next pass if a third point doesn't turn it around; the fix
  may be a `STAT_ADJUST` buff rather than a further cost cut).
- `familiar_in_the_dark` STAT_ADJUST: `-3` → `-4` (still +10.6 residual at
  the cost-7 ceiling — a fourth stat-budget trim).

Overshoot reverts — the v6.3 adjustment flipped the card's residual to the
**opposite sign** this pass, reverted to 0 rather than stacked further:
- `heart_of_the_thermal_grid` (v6.3 `-1` for a -7.4 residual → now +13.1,
  z=2.46 — overshot into overperforming).
- `shatterline` (v6.3 `+1` for a +6.8/+7.8 residual → now -3.5, z=-1.65 —
  overshot into underperforming).

New first-time flags (`|z|>=1.5`, 5,952-game run):
- `+1`: `magma_conduit_network`, `kinetix_blacksite_cavern`,
  `deceptive_angler`, `skydark_locust_host`, `shattered_horizon_protagonist`,
  `violet_haze_kunoichi`, `caldera_harvest_works`, `submerged_temple`,
  `thornfang_vine`, `kinetic_anchor_monolith`, `dissolving_persona` (the
  Resonant carrier the v6.3 doc explicitly left untouched at +56.6% played
  win — now a genuine standalone cost outlier on its own numbers, unrelated
  to the Resonant keyword weight).
- `-1`: `zen_decay`, `sovereign_spires_of_arrak_zul`, `floating_jellyfish`,
  `the_mirrored_trench`, `clockwork_nautilus`.
- `wingbone_horror` STAT_ADJUST `-2` (already at the cost-7 ceiling, a
  `COST_ADJUST` would clip to nothing — trimmed the stat budget instead, same
  pattern as `nanite_division_marshal`/`familiar_in_the_dark`).

No keyword-weight changes this pass — every keyword's archetype-normalized
delta reads inside (or right at the edge of) the established ±10 healthy
band; see below.

## Headline results

| Metric | Value | Read |
|---|---|---|
| P1 win rate | 60.8% | Flat vs v6.3 (60.9%) — still the top carry-forward item (5th consecutive pass at ~59-63%), unactioned this pass. |
| Avg game length | 20.6 turns | Flat vs v6.3 (20.1). |
| Vitality wins | 92.3% | Flat vs v6.3 (93.2%). |
| Clashes/game | 8.97, first clash ~turn 5.2 | Flat vs v6.3. |
| Comeback rate | 24.0% | Flat vs v6.3 (~25%). |
| Pool coverage | 62.3% of 284 non-Leader cards decked/played (32-deck tournament) | Lower than v6.3's 70.4%, expected — this pass used fewer decks (32 vs 48); not a regression, see prior passes' dedicated 300-deck coverage check for the trustworthy pool-wide number. |
| Guard-trade quality (new) | 20.7% guard wins / 23.6% mutual trade / 27.6% die-for-nothing / 28.1% survive-no-kill | Baseline established this pass; not yet separable from correct forced chump-blocks, see above. |

## Keyword health (archetype-normalized delta, carrier games, this run)

All 24 keywords read inside the ±10 healthy band this pass **except Sacred**,
which is just outside at **+11.3** (carrier games n=1,659) — single-run,
matches the pattern of prior single-pass flags (e.g. v6.3's Doublestrike
+11.1) that weren't actioned until a second pass confirmed them. Not actioned
this pass; watch next pass.

Notably, **Resonant is now healthy** at -5.5 (n=636) — a big improvement from
v6.3's -13.4, confirming the v6.3 per-card fix (`bioluminescent_tide` and
`flash_freeze` both -1 cost, leaving `dissolving_persona` untouched) worked
as intended.

## Leader spread

Random-cohort win rates this run: Crimson Vector Commander 63.6 / Avatar of
the Abyss 63.3 / Mer-King 52.5 / Ruin-Walker Overseer 44.5 / Legendary Diver
40.7 / Apex Nanite Shinobi 39.8 / Ethereal Sea Witch 36.9 / Sovereign of the
Dying Star 32.3.

The deckSeed-pinned `leaderPairSuite` (isolates the Leader kit from cohort
composition) tells a **very different story this run**: Legendary Diver 73.8
/ Avatar of the Abyss 70.3 / Crimson Vector Commander 57.1 / Ethereal Sea
Witch 51.8 / Apex Nanite Shinobi 47.0 / Ruin-Walker Overseer 36.3 / Sovereign
of the Dying Star 27.4 / **Mer-King 23.8**. Legendary Diver and Mer-King
essentially swap ends of the table between the two views — a much bigger
pinned-vs-random divergence than any prior pass recorded (previously the two
views agreed on Avatar of the Abyss being the top seed).

**Not actioned this pass.** A single pinned-suite run isn't enough to
distinguish "Legendary Diver's kit is genuinely strong / Mer-King's is
genuinely weak" from "this run's one fixed pinned decklist per Leader
(`pinnedDeckForLeader`, seeded off `DECK_SEED`) happened to draft an
unusually good/bad list for these two." Rerunning with a different
`deckSeed` (same `SEED`) before touching either Leader's kit is the
carry-forward next step — see below.

## CPU decision quality

- Guard divergence 0% (flat), removal-target suboptimal 3.2% (flat vs
  v6.3's 3.0%).
- Attack divergence 21.0% (flat vs v6.3's 21.5%) — still believed to be
  mostly shadow-heuristic/real-CPU timing daylight, not a genuine CPU bug;
  carry-forward.
- `venomousSuicideBlunder` 221/5,952 games (3.7%) — flat vs v6.3 (3.8%).
- `tookGuardableLethal` 90/5,952 (1.5%) — improved vs v6.3 (3.6%), within
  expected run-to-run noise at this sample size.
- `idleLeader` 75 occurrences, `wastedEssenceWithPlay` 1,906 — both in the
  same low range as prior passes; no per-Leader idle-ability outlier this
  run (all read near 0%, consistent with v6.3).
- `keptColorDeadHand` / `colorCloggedGames`: 0/5,952 both — confirmed
  non-issues again.
- Guard-trade quality / leader-ability usage: new this pass, see above.

## Carry-forward items

1. **First-player advantage (~59-63%)** — flat across five consecutive
   passes despite the existing digital compensation (P2 draws an 8th opening
   card). Still needs its own dedicated pass rather than a drive-by change.
2. **Leader spread (pinned-suite vs random-cohort divergence)** — this
   pass's pinned suite disagrees sharply with the random-cohort table on
   both ends (Legendary Diver, Mer-King). Next step: rerun
   `simulate-v5.ts` with a different `deckSeed` (same `SEED`) to check
   whether the pinned read holds up before touching either Leader's kit —
   do not action off a single pinned-suite run.
3. **Sacred** (+11.3, single-run) — watch next pass before any keyword
   weight action.
4. **`towering_tsunami`** — a second cost cut this pass made its residual
   *worse* (-5.3 → -8.8). If a third pass still reads negative, try a
   `STAT_ADJUST` buff instead of a third `COST_ADJUST` cut.
5. **Guard-trade quality** (new) — 27.6% of assigned guards "die for
   nothing," but the harness can't yet tell a forced lethal-survival chump
   (correct play) from a genuine bad trade (a real lapse). Next step: tag
   each guard assignment with whether `chooseGuards`'s `mustSurvive` branch
   was active when it was made, then re-read the die-for-nothing rate split
   by that flag.
6. **Attack divergence (21.0%)** — unchanged for a third pass; still
   ambiguous whether this is real CPU headroom or permanent
   heuristic/timing daylight (Main I board changes between the shadow
   snapshot and the real Clash).

## Post-pass fix (landed after this sim run, not yet re-verified)

A CPU correctness bug was found and fixed in `ai.ts`'s `chooseAttackers`
(and mirrored in this harness's `shadowAttackers`) after this run's data was
captured: the all-in lethal estimator computed Overrun spill damage as
`Might - guardCount` (1 or 2) instead of `Might - guard's actual remaining
Grit`, so it drastically overestimated spill against tough blockers (a
single Grit-6 guard was treated as absorbing only 1 damage) and could
misjudge a non-lethal Overrun all-in as lethal. Fixed to use real remaining
Grit. **Every attack-related number in this doc (attack divergence,
guard-trade quality, venomousSuicide, tookGuardableLethal) was measured
against the OLD, buggy estimator** — re-run before trusting deltas against
them next pass.

Two related precision gaps were found and reported but deliberately left
unfixed this pass (both in `ai.ts`):
7. `reserveLocationsForCost` reserves against a reaction-hold card's printed
   cost rather than its Surge-discounted `effectiveCost`, over-reserving by
   one location's worth of essence for a Surge card. Conservative (doesn't
   break anything), but a tuning-flavored change — left for a dedicated pass.
8. `chooseAttackers`'s guard-availability check approximates opponent
   blocking capacity with simple pool consumption rather than true bipartite
   matching against `canBlock` (Aerial/Skywatch eligibility) — in mixed
   Aerial/non-Aerial board states with only one Aerial-capable defender, it
   can undercount how contested that defender actually is. A real fix needs
   a small matching algorithm, not a one-line change.
