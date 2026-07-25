# Balance & Sim Findings — v6.6 (July 2026)

Latest CPU-vs-CPU balance pass. Supersedes the v6.5 findings doc (deleted).
Raw report: `docs/sim-runs/` (latest JSON only; `.gitignore`d).

**Runs:** `npx tsx scripts/simulate-v5.ts 6 32 1337` (cohort A) and
`... 6 32 1337 42` (cohort B) — 5,952 games each, 32 random archetype decks,
same game seed, two independent deck cohorts. **Invariant violations: 0** on
both, and on every intermediate run this pass.

Every card/keyword action this pass had to clear a two-part bar: the
outlier's Wilson 95% interval must exclude its own in-deck baseline, **and**
it must reproduce in both cohorts. That bar is new (see below) and it is
strict — it admitted exactly one card change.

## Full card pool confirmed

Live Supabase `public.cards` is 292 rows. Digested field-for-field over
`(id, type, rarity)` — precisely the fields `cardpool.ts`'s `seedOf` derives
every mechanic from — and diffed against the bundled `generated-cards.ts`
fallback the sims run over: **identical digests, 292/292**. The sims run over
the complete, current live pool.

## Harness upgrades made first (v6.6)

Per the standing practice, data capture was extended before any balance
change:

1. **Ground-truth attack decisions.** A new `onAttackDecision` engine
   telemetry hook fires from `ai.ts`'s `chooseAttackers` at the exact moment
   it returns, so the shadow heuristic is now evaluated against the same live
   state the CPU decided from, instead of a pre-Main-I snapshot.
2. **Wilson 95% score intervals** on every card residual, plus a
   significance-gated outlier list (`costAbilityOutliersSignificant`).
3. **Per-card keyword carrier detail**, built from the full pool rather than
   through the report's `n >= 20` cutoff (which was hiding exactly the
   low-sample carriers that drive a keyword's aggregate).
4. **Event effect-magnitude profile** and a **printed-budget audit**
   (stat-total vs cost least-squares fit per Unit) — a cost-vs-ability signal
   read off the printed card rather than off win rate.
5. **First-player-advantage diagnosis**: the P1 edge split by game length, by
   which seat invoked its Leader first, and the per-turn mean vitality
   differential.
6. **Five new CPU reasoning-lapse counters**: `reservationWasted`,
   `charmOnDoomedUnit`, `leaderShatterBlunder`, `wellspringMisplay`,
   `removalOnNonThreat`.

## The headline finding: the balance lever itself was broken

`COST_ADJUST` fed the *same* cost figure that Units derive their stat budget
from (`statBase`), that Events derive their effect magnitude from
(`eventEffect`'s `v`), and that Charms derive their bond stats from. So an
adjustment moved a card's **power in lockstep with its price**:

| intent | what actually shipped |
|---|---|
| `-1` cost to buff an underperformer | cheaper **and weaker** — not a buff |
| `+1` cost to nerf an overperformer | pricier **and stronger** — not a nerf |

This explains the pattern the last four findings docs kept recording without
diagnosing: adjustments that "didn't take" and got stacked to two and three
points chasing a residual that could not move, and three that overshot into
the opposite sign and had to be reverted (`heart_of_the_thermal_grid`,
`shatterline`, `sovereign_spires_of_arrak_zul`). At the extremes the printed
results were plainly broken:

- `helix_swarm` — three stacked *buffs* → printed as a cost-1 **1/1**.
- `clockwork_nautilus` — two stacked *buffs* → cost-5 **1/1** carrying
  Overrun **and** Quickstrike.
- `glass_shrimp` — three stacked *nerfs* → gained stats each time; residual
  never moved (+9.6 → +9.5 across two of them).
- `towering_tsunami` — floor-clamped at cost 1, and the clamp had also
  shrunk its Root buff to +1/+1. The v6.5 doc concluded this needed a new
  per-Event magnitude table; it did not — it needed this fix.

**Fix:** stat budgets and effect magnitudes now derive from the card's
`naturalTotalFor` cost (pre-adjustment). `COST_ADJUST` changes price only,
which makes it monotonic: a cut is always a buff, a raise is always a nerf.

The whole table was then reset to single points and re-derived, because the
stacks existed only to compensate for the broken lever and would now
over-apply. **Locations were exempted from the reset and kept their earned
stacks** — `mapLocation` never derived any power from cost (fixed passive,
fixed trigger magnitude, fixed Bountiful yield), so the lever was already
clean there.

Post-fix pool audit: 292/292 cards structurally valid, and the Unit
stat-total curve is now monotonic in cost (cost 1 → 4.0 avg, cost 4 → 7.0,
cost 7 → 9.2).

## Why so few card changes this pass

The old z-score outlier list was computed over the residual distribution and
was **completely blind to sample size** — an n=95 card and an n=2,400 card
with the same residual scored the same z. That is the most likely cause of
the repeated overshoots. With the Wilson gate applied, 12 of 16 raw
z-outliers survived in cohort A; when the two cohorts were then intersected,
**zero cards reproduced with the same sign**. The remaining spread is cohort
noise, not card imbalance.

Two cards that had been carry-forwards for several passes resolve cleanly
under the new gate:

- **`towering_tsunami`** — reads **-11.4 in cohort A but +2.2 in cohort B**.
  Contradictory sign: noise. Carry-forward #5 closes with no per-Event
  magnitude table needed.
- **`sunken_archive`** — its v6.2 `-1` had overshot into a **+17.6** residual
  and was the single card driving the Sacred keyword flag. Reverted to 0; it
  now reads **-0.2**.

### The one card action

- **`skull_cathedral: +1`** — the sole remaining Sacred driver, confirmed
  positive in both cohorts (+6.6 / +12.6).

## Keyword health

Sacred had been outside the ±10 band for four consecutive passes. The new
per-card carrier breakdown finally explains it: after the `sunken_archive`
revert, **every sampled Sacred carrier reads ~0 residual** (`sunken_archive`
-0.2, `kinetic_anchor_monolith` -0.3) while the keyword's archetype-normalized
aggregate still reads +12.8 in cohort A — and Sacred is not flagged at all in
cohort B. The aggregate is measuring *"decks that happen to run Sacred
Sanctums win more"*, not card power. Previous passes' instinct to cut the
shared Sacred weight would have been wrong.

Cohort B flags Doublestrike (+11.9) and Soulbound (+10.1); neither appears in
cohort A and all carriers read modestly. First flag, single cohort — watch,
not action.

## CPU reasoning lapses

**Attack divergence resolved (v6.5 carry-forward #7).** Ground-truth
divergence is **0.1%** (n=122,337) against the legacy pre-Main-I snapshot's
**22.8%**. The four-pass "~21% attack divergence" was, in full, snapshot and
timing daylight — the CPU's attack policy matches its intended policy almost
exactly. Closed.

**Two real lapses found and fixed:**

- **`wellspringMisplay`: 21,126 per run → 0.** `chooseWellspring` scored
  purely on raw pip demand, which cannot see that a colour is already
  covered — a hand of three Ember cards keeps demanding Ember long after one
  Ember source covers them all. ~17% of all turns played a Wellspring colour
  that unlocked nothing while another legal choice would have freed a stuck
  card. Unlocking is now weighted above raw demand.
- **`charmOnDoomedUnit`: 2,769 → 2,386** (-14%). Charms were always bonded to
  the biggest-Might unit — precisely the body the opponent most wants to
  remove and most profitably blocks. Bonding now weights durability above
  Might and de-prioritises bodies already carrying Charms, so one removal
  spell can't two-for-one.

**Clean:** `missedLethal` 0, `leaderShatterBlunder` 0, `keptColorDeadHand` 0,
`colorCloggedGames` 0, guard divergence 0%, `removalOnNonThreat` 241,
`tookGuardableLethal` 101/5,952 (1.7%), `venomousSuicideBlunder` 241 (4.0%),
removal-targeting suboptimal 3.8%.

**Guard-trade quality** stays resolved: 28.0% "dies for nothing", of which
27.7 points are forced chump-blocks to survive lethal and only **0.3% is
discretionary** (117 of 41,818).

**Reaction window (new, unactioned).** Reservations fire 4,834 times per run
but **32.4% expire uncashed**, and only 0.07 reaction plays happen per
opportunity. Gating reservations on the opponent having a unit that can
attack helped the absolute count but not the rate. The deeper cause is
content, not CPU logic: only **26 of 292 cards** (17 Quick Events + 9 Ambush
units) are legal in the reaction window at all, and `isReactionCandidate`'s
cost<=3 + removal-only filter narrows that to **6**. Widening the window's
card support is a design question, not a heuristic tweak — carried forward.

## First-player advantage — located and fixed (v6.5 carry-forward #1)

Six consecutive passes reported P1 at ~59-63% without locating the edge. The
new diagnosis cut it three ways and the answer was unambiguous: the edge was
concentrated in **short** games (76.5% at ≤10 turns, 64.6% at 11-20) and
washed out entirely by turn 21+ (51.8%). That is a **tempo** lead, not a
card-advantage one — so the existing compensation (the second player's 8th
opening card) was paying on the wrong axis. Measured directly, that 8th card
was worth **under one percentage point**.

Compensation swapped: both players now open on 7 cards, and the player on the
draw plays **two** basic Wellsprings on their opening turn, the second
entering **exhausted** (a ready one measured a 19-point overcorrection).

| | before | after |
|---|---|---|
| P1 win rate | 60.2% | **47.2%** (cohort B 45.7%) |
| Seat-swap first-seat win rate | ~60% | **48.1%** (cohort B 47.7%) |

A residual ~2-3 point tilt toward the second player remains; the available
levers are coarse and tuning further would risk overfitting this cohort.

Separately, the sims exposed a plain bug the harness could never see: the
human seat is hardcoded to `P1`, so a player was **permanently on the play in
every match** — and after this change the compensation would only ever have
gone to the CPU. Turn order is now a per-match coin flip
(`createGame({firstPlayer})`), with the turn-1 Deal skip, the turn-counter
rollover and the Wellspring allowance all keyed off it.

## Headline results (cohort A / cohort B)

| Metric | A | B | Read |
|---|---|---|---|
| P1 win rate | 47.2% | 45.7% | Was 60.2% — see above. |
| Seat-swap first-seat | 48.1% | 47.7% | Cohort-controlled; near even. |
| Avg game length | 20.6 | 19.5 | Flat vs v6.5 (20.4). |
| Vitality wins | 90.9% | 95.1% | Flat. |
| Clashes/game | 8.75 | 8.44 | Flat; first clash ~turn 5.0. |
| Comeback rate | 25.8% | 24.2% | Flat vs v6.5 (23.9%). |
| Pool coverage | 62.0% | 63.0% | Flat vs v6.5 (60.6%). |
| Invariant violations | 0 | 0 | |

## Leader spread

Cohort A: Avatar of the Abyss 66.0 / Crimson Vector Commander 64.2 /
Mer-King 50.5 / Apex Nanite Shinobi 47.6 / Legendary Diver 44.7 /
Ruin-Walker Overseer 39.4 / Sovereign of the Dying Star 33.3 / Ethereal Sea
Witch 32.9.

Cohort B disagrees sharply on the middle of the table (Mer-King 63.8,
Ruin-Walker Overseer 23.0, Legendary Diver 56.9) — the same cohort sensitivity
the v6.5 pass established for pinned-deck Leader reads. The two cohorts do
agree that **Avatar of the Abyss (66.0 / 60.5) and Crimson Vector Commander
(64.2 / 74.3) are the strongest kits**, as every pass since v6.1 has. Avatar
has already taken two dedicated nerfs (Commander stripped, minus ability
-2 → -3); a third drive-by change isn't warranted, and Crimson Vector
Commander has never had a dedicated look. Both belong to a Leader-kit pass of
their own.

## Carry-forward items

1. **Leader kits: Avatar of the Abyss and Crimson Vector Commander** —
   strongest in both cohorts, as in every pass since v6.1. Needs a dedicated
   Leader-kit pass, not another drive-by nerf.
2. **Reaction-window content** — only 26 of 292 cards are legal in the
   window and the CPU's filter narrows that to 6, so 32.4% of reservations
   expire uncashed. A design question (print more Quick/Ambush support, or
   widen the filter), not a heuristic tweak.
3. **Residual second-player tilt (~2-3 points)** — the remaining
   compensation levers are coarse; revisit only if it widens.
4. **Doublestrike / Soulbound** — first-time single-cohort flags. Watch for a
   second confirmation before acting.
5. **Printed-budget outliers** — the new stat-vs-cost fit flags 8 Units at
   |z|>=2, all of them carrying two expensive keywords (e.g. Iron-Scaled
   Snail, Topographic Behemoth). The keyword surcharge is deducted from the
   stat budget twice over on double-keyword cards. None reproduced as a
   win-rate outlier, so this is a printing-aesthetics issue rather than a
   balance one for now.

## Closed this pass

- ~~First-player advantage~~ — located and fixed (60.2% → 47.2%).
- ~~Attack divergence~~ — 0.1% ground truth; the ~21% was measurement
  artifact.
- ~~Sacred~~ — one overshot card, reverted; the residual aggregate is a
  cohort artifact, not card power.
- ~~`towering_tsunami`~~ — contradictory sign across cohorts; noise. The
  per-Event magnitude table it seemed to need was a symptom of the broken
  lever.
- ~~`sovereign_spires_of_arrak_zul`~~ — same; no longer significant.
