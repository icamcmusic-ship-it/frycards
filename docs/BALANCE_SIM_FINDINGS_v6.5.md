# Balance & Sim Findings — v6.5 (July 2026)

Latest CPU-vs-CPU balance pass, run AFTER the v6.5 sim-harness/card changes
below. Supersedes the v6.4 findings doc (deleted). Raw report:
`docs/sim-runs/` (latest JSON; only the most recent run is kept in-repo,
`.gitignore`d).

**Run:** `npx tsx scripts/simulate-v5.ts 6 32 1337` — 5,952 games, 32 random
archetype decks, seed 1337 (matches v6.4's parameters for direct comparison).
A second `deckSeed=42` run (same game seed, different deck cohort) was used
as a cross-check for outlier confirmation. **Invariant violations: 0** on
both runs, including after the card changes below landed.

## Full card pool confirmed

Live Supabase `public.cards` (292 rows) diffed field-for-field (by id) against
the bundled `generated-cards.ts` fallback the sims run over: 292/292 match
exactly, zero mismatches, zero missing/extra ids. Sims below run over the
complete, current pool.

## What changed before this run (v6.5)

Sim harness data capture added first, per the standing practice:

- **mustSurvive-aware guard-trade split** (v6.4 carry-forward #5): a new
  engine telemetry hook (`onGuardAssign`, `engine.ts`) fires straight from
  `ai.ts`'s `chooseGuards` with whether its `mustSurvive` branch was active
  at the moment each guard was assigned — ground truth, not a re-derived
  approximation. `guardDiesForNothing` now splits into
  `guardDiesForNothingForced` (a correct chump-block to survive lethal — not
  a lapse) and `guardDiesForNothingDiscretionary` (a real defender-side
  blunder).
  **Result: this fully resolves the carry-forward question.**
  `guardDiesForNothing` reads 29.3% of all assigned guards, but **28.9
  percentage points of that (98.6% of the "die for nothing" bucket) are
  forced chump-blocks to survive lethal — correct play.** Only **0.3% of
  all guards (152 of 43,539)** are genuine discretionary blunders. Guard-
  trade quality is **not** a meaningful CPU-quality problem; the flat
  27-29% number tracked across three passes was almost entirely an
  artifact of not distinguishing forced-lethal survival from discretionary
  play. No further action needed here — closing this carry-forward item.

## Findings acted on this pass

**Leader-spread carry-forward resolved as decklist noise, not a kit
imbalance** (v6.4 carry-forward #2): reran the deckSeed-pinned
`leaderPairSuite` with a different `deckSeed=42` (same game `SEED`). The
primary run (deckSeed=1337, same as v6.4) reproduced v6.4's read almost
exactly — Legendary Diver 71.4% / Avatar of the Abyss 70.8% at the top,
**Mer-King 23.2%** at the bottom, a >45-point spread. The `deckSeed=42` run
told a completely different story: Legendary Diver dropped to a normal
47.0%, **Mer-King rose to a normal 51.2%**, and Avatar of the Abyss (78.5%)
/ Crimson Vector Commander (72.0%) took over the top of the table instead.
**Conclusion: the extreme Legendary Diver/Mer-King divergence flagged across
the last two passes was noise from one fixed pinned decklist per Leader, not
a real Leader-kit balance problem** — closing that carry-forward item.
Avatar of the Abyss and Crimson Vector Commander, however, read strong
across *both* pinned-suite runs (70-78%) and stay the top two in the
random-cohort table too (62-64%/60-63%) — same watch-list status as prior
passes, not newly actioned (Avatar has already had two dedicated nerfs;
another drive-by change isn't warranted without a dedicated pass).

**Card cost/stat adjustments** (`COST_ADJUST`/`STAT_ADJUST` in
`cardpool.ts`, from z-score outliers across the primary 5,952-game run,
cross-checked against the `deckSeed=42` run where both flagged the same
card):

Repeat offenders — still outside `|z|>=1.5` the same direction, second (or
further) point stacked:
- `+1` more: `magma_conduit_network` (now +2, got *worse* after its first
  bump: +16.6 → +19.1), `nanite_culture_lab` (now +2, resurfaced after
  reading healthy through v6.3/v6.4), `jawbone_span` (now +2, same pattern).
- `+1` more (third point): `glass_shrimp` (now +3 — residual essentially
  unchanged at +9.5 vs +9.6 after the last bump, cost now 6).
- `-1` more: `the_mirrored_trench` (now -2), `clockwork_nautilus` (now -2),
  `ruthless_succession` (now -2, much improved from its original -6.0 but
  still outside threshold) — `the_mirrored_trench` and `ruthless_succession`
  confirmed negative in **both** the primary and `deckSeed=42` runs.
- `-1` more (third point): `ashen_circle_rite` (now -3), `celestial_attunement`
  (now -3), `helix_swarm` (now -3).
- STAT_ADJUST `-1` more: `wingbone_horror` (now -3, still +8.5 residual at
  the cost-7 ceiling).

Left unchanged — contradictory signal between runs, not a confirmed repeat:
- `sovereign_spires_of_arrak_zul`: primary run read -8.1 (worse than v6.4's
  -4.0), but the `deckSeed=42` run read the **opposite sign** (+13.5).
  Noise at this sample size, not stacked. Carried forward as a watch item.

Left unchanged — floor-clamped, existing tooling can't fix it further:
- `towering_tsunami`: already at the cost-1 floor after two stacked cuts
  (`adjustFor` clamps to `[1,7]`), so a third cut is a no-op — and still
  reads -8.6 residual this pass. Events have no STAT_ADJUST-equivalent
  effect-magnitude budget the way Units do, so there is currently no lever
  in `cardpool.ts` left to pull for this card. Fixing it for real needs a
  small engine change (a per-Event effect-magnitude adjustment table), not
  a number in the existing tables — carried forward as a scoped follow-up,
  not actioned this pass.

New first-time flags (`|z|>=1.5`, primary run unless noted):
- `+1`: `black_coral_thicket`, `cracked_wastes`, `ribcage_titan`,
  `kunoichi_of_the_magma_rings` (confirmed in **both** runs: +9.4/+15.1),
  `phosphor_lich`.
- `-1`: `mermaid_statue`.

No keyword-weight changes this pass — every keyword's archetype-normalized
delta reads inside the established ±10 healthy band except Sacred, see
below.

## Headline results (post-fix run)

| Metric | Value | Read |
|---|---|---|
| P1 win rate | 60.2% | Flat vs v6.4 (60.8%) — still the top carry-forward item (6th consecutive pass at ~59-63%), unactioned this pass; needs a dedicated pass. |
| Avg game length | 20.4 turns | Flat vs v6.4 (20.6). |
| Vitality wins | 91.4% | Flat vs v6.4 (92.3%). |
| Clashes/game | 8.88, first clash ~turn 5.2 | Flat vs v6.4. |
| Comeback rate | 23.9% | Flat vs v6.4 (24.0%). |
| Pool coverage | 60.6% of 284 non-Leader cards decked/played (32-deck tournament) | Flat vs v6.4 (62.3%), within normal run-to-run noise at this deck count. |
| Guard-trade quality | 19.9% guard wins / 23.7% mutual trade / 29.3% die-for-nothing (28.9 forced, **0.3 discretionary**) / 27.2% survive-no-kill | **Resolved this pass** — see above. Not a CPU-quality problem. |

## Keyword health (archetype-normalized delta, carrier games, this run)

All 24 keywords read inside the ±10 healthy band this pass **except
Sacred**, still outside at **+13.1** (carrier games n=1,232) — this is now
the **second consecutive pass** flagging Sacred (v6.4: +11.3), matching the
established two-pass-confirmation bar for action. **Not actioned this
pass** — Sacred only has 7 pool carriers and its 1-2 cost band reads a much
higher +92.4% win rate (n=224) than its 3-4 band (+62.7%, n=1,008), so a
flat keyword-weight cut would over-correct the cheap carriers; this needs a
per-card look (same treatment Resonant got in v6.3) rather than a blanket
weight change. Flagged for next pass.

## Leader spread

Random-cohort win rates this run: Avatar of the Abyss 63.8 / Crimson Vector
Commander 61.1 / Mer-King 55.6 / Ruin-Walker Overseer 51.3 / Apex Nanite
Shinobi 44.1 / Legendary Diver 36.4 / Ethereal Sea Witch 34.8 / Sovereign of
the Dying Star 32.4.

The deckSeed-pinned `leaderPairSuite` — see "Findings acted on this pass"
above for the full deckSeed=1337-vs-42 comparison that resolved last pass's
carry-forward item. Both pinned-suite runs agree Avatar of the Abyss and
Crimson Vector Commander are the strongest kits; both random-cohort and
pinned views now agree on this too (a first — previous passes had these two
views disagreeing at one end of the table or the other).

## CPU decision quality

- Guard divergence 0% (flat), removal-target suboptimal 2.8% (flat vs
  v6.4's 3.2%).
- Attack divergence 21.5% (flat vs v6.4's 21.0%) — still believed to be
  mostly shadow-heuristic/real-CPU timing daylight, not a genuine CPU bug;
  carry-forward.
- `venomousSuicideBlunder` 220/5,952 games (3.7%) — flat vs v6.4 (3.7%).
- `tookGuardableLethal` 79/5,952 (1.3%) — flat vs v6.4 (1.5%), within
  expected run-to-run noise.
- `idleLeader` 80 occurrences, `wastedEssenceWithPlay` 1,762 — both in the
  same low range as prior passes.
- `keptColorDeadHand` / `colorCloggedGames`: 0/5,952 both — confirmed
  non-issues again.
- **Guard-trade quality: resolved this pass** (see above) — the flat
  27-29% "die for nothing" number tracked since v6.4 is 98.6% forced
  correct play, not a CPU lapse. Closing this as a decision-quality
  concern.

## Carry-forward items

1. **First-player advantage (~59-63%)** — flat across six consecutive
   passes despite the existing digital compensation (P2 draws an 8th
   opening card). Still needs its own dedicated pass rather than a
   drive-by change.
2. ~~Leader spread (pinned-suite vs random-cohort divergence)~~ —
   **resolved this pass**, was decklist noise from a single fixed pinned
   deck per Leader. Removed from carry-forward.
3. **Sacred** (+13.1, second consecutive pass) — per-card look needed next
   pass (its cheap carriers and its cost-3/4 carriers read very
   differently), not a blanket keyword-weight cut.
4. **`sovereign_spires_of_arrak_zul`** — contradictory sign between this
   pass's two runs; needs a bigger sample before any further action.
5. **`towering_tsunami`** — floor-clamped at cost 1 with no further lever in
   `cardpool.ts`; needs a small engine change (per-Event effect-magnitude
   adjustment table) to action further, not a table edit.
6. ~~Guard-trade quality~~ — **resolved this pass**, see above. Removed from
   carry-forward.
7. **Attack divergence (21.5%)** — unchanged for a fourth pass; still
   ambiguous whether this is real CPU headroom or permanent
   heuristic/timing daylight (Main I board changes between the shadow
   snapshot and the real Clash).
