# Balance Sim Findings — v4.20

Continuation pass following v4.19. Fresh baseline-only run (no changes made
during this pass — this is a read/report pass): live 292-card Supabase pool
(confirmed via `mtime` — `v4-2026-07-21T07-34-06-820Z.json` is the newest
file in `docs/sim-runs/`), 10 games/pairing, 58 decks (25 archetypes +
Location-stripped `[noLoc]` twins + 8 pure-random), **33,060 games**,
`sameTurn` Twin mode selected (highest twin-completion win-delta of the
three modes tested: +8.2pt vs +7.0/+7.3pt for `oneDiePerTurn`/`stagedPassive`).
**Zero invariant violations**, `result.errors: []`. avg game length 10.9
rounds; 0 draws, 0 deckouts, 0 timeouts@160t; first-player win rate 51.3%.
New telemetry this pass: `lapsePerGameByArch` (per-archetype lapse-rate
breakdown — did not exist in v4.19).

## 0. Status of the 6 items carried from v4.19

| # | item | v4.19 baseline→after | v4.20 baseline | verdict |
|---|---|---|---|---|
| 1 | Shinobi archetypes are the roster floor | Steel-Scrap Control 13.8% `[noLoc]`, Toll-Echo Control 8.9% `[noLoc]` | Steel-Scrap Control 13.8% `[noLoc]` (35.4% Location), Toll-Echo Control 8.9% `[noLoc]` (13.0% Location) | **unchanged** — identical numbers, no code touched these since v4.19 |
| 2 | Steel/Avenge cost-weight nudge measured near-zero | Steel +17.7→+18.0pt, Avenge +15.0→+15.0pt | Steel +18.0pt, Avenge +15.0pt | **unchanged**, confirms v4.19's read — the +1 weight step is still not moving per-fire delta |
| 3 | `familiar_in_the_dark` halved buff barely moved | +19.3→+19.6pt (archetype-normalized) | +19.6pt | **unchanged** — the halved buff has now been flat across two full passes |
| 4 | `the_wolf_of_wall_street` stable modest positive residual | +16.1→+13.1pt (archetype-normalized, n=481, archSpread=1) | +13.1pt | **unchanged, now 3 consecutive data points at ~13pt** with zero direct changes |
| 5 | `costVsAbilityMismatches` repeat offenders | z +2.0 to +3.3 (patch already applied) | same 10 cards, z +2.05 to +3.33, **identical set and near-identical z-scores to v4.19** | **unchanged** — confirms the existing patches have plateaued, not regressed |
| 6 | Swift low-activation/high-delta tension | 24-34% activation, +10-13pt delta | 34% activation, +13.2pt delta | **unchanged**, still a design judgment call |

No keyword, cost, card-stat, or Leader-kit changes were made between the
v4.19 verification run and this pass, so the flat readings above are
expected — they exist to confirm none of the carried items silently
resolved themselves and to give item 4 in particular a third clean data
point before sizing a patch.

## 1. CPU reasoning lapses per archetype (NEW: `lapsePerGameByArch`)

The raw `lapsePerGameByArch.topLapse` field is `unusedDiceCount` for every
archetype (it's the largest raw-volume counter pool-wide, per v4.19's
"designed Pitch sink" finding) and isn't useful for ranking. Re-aggregating
`result.lapseCountsByArch` with `unusedDiceCount` (raw volume, not
actionable) and `lapseGreedyAssignmentFixed` (telemetry-only, confirms the
solver is working by design — see v4.19 §1) excluded gives the real
actionable-lapse ranking:

| archetype | actionable lapses/game | dominant type | archetype win% |
|---|---|---|---|
| Shinobi Steel-Scrap Control | 6.49 | `lapseUnusedDiceAtEndTurn` (2.72/g) | 35.4% (13.8% `[noLoc]`) |
| Shinobi Tempo-Anchor `[noLoc]` | 5.61 | `lapseIdleLeaderAbility_diceSpentDown` (1.90/g) | 35.6% |
| Shinobi Steel-Scrap Control `[noLoc]` | 5.43 | `lapseUnusedDiceAtEndTurn` (2.40/g) | 13.8% |
| Shinobi Tempo-Anchor | 4.45 | `lapseIdleLeaderAbility_diceSpentDown` (2.16/g) | 64.2% |
| Shinobi Avenge Grind `[noLoc]` | 4.33 | `lapseUnusedDiceAtEndTurn` (1.60/g) | 22.4% |

(Two `Random Build` filler decks technically rank above these on raw
actionable-lapse count, dominated by `lapseIdleLeaderAbility_refusalNoTarget`
— that's an expected artifact of decks with no coherent kit and an
under-filled hand, not a real signal; excluded from the ranked table above.)

**All top 5 real archetypes are Shinobi.** Every one of Shinobi's six
archetype variants (`Location` + `[noLoc]`) lands in the actionable-lapse top
10 pool-wide. Two distinct lapse types dominate:

- **`lapseUnusedDiceAtEndTurn`** (Steel-Scrap Control, Avenge Grind, both
  `[noLoc]` and Location variants) — per `ai.ts`
  `strandedDieHadLegalUse`/`strandedCastableCard` (ai.ts:1570-1622), this
  fires when a stranded die could have paid for a payable non-gated card in
  hand or the unused Leader Ability. Steel/Avenge bodies are expensive
  (Steel avg 9.23 pips, Avenge avg 7.94 pips, the two highest-cost keyword
  cohorts in the table) — a Steel-Scrap/Avenge Grind hand plausibly holds
  several high-threshold cards simultaneously uncastable off a single
  turn's dice, so legal-but-unaffordable-together holds compound into this
  counter more than for cheaper archetypes.
- **`lapseIdleLeaderAbility_diceSpentDown`** (Tempo-Anchor, both variants) —
  per `ai.ts` `recordDiceSpentDownLapse` (ai.ts:1665-1682), this fires when a
  die that could have paid Shinobi's Ability threshold existed earlier in
  the turn but got spent on something else (a Unit/Charm cast) before the
  Ability could claim it. Apex Nanite Shinobi's Ability threshold reverted
  6→5 in v4.19 specifically to make the Ability easier to trigger — this
  data shows the CPU is *still* deprioritizing it in favor of board
  development in Tempo-Anchor, i.e. the threshold revert alone did not fix
  the sequencing problem it was meant to address.

**Read for item 1 (Shinobi as roster floor):** this is the first pass with
per-archetype lapse data, and it lines up cleanly with the win-rate floor —
Shinobi's CPU-piloted decks are both the worst performers in the pool *and*
the worst at actually using their own resources, concentrated in the two
lowest-performing variants (Steel-Scrap Control, Avenge Grind `[noLoc]`).
This doesn't prove the CPU is the root cause of Shinobi's floor position
(kit-level Steel/Avenge cost pressure from v4.19's keyword-wide changes is
still the leading suspect per item 1's carry-forward), but it does mean any
Leader-kit fix aimed at Shinobi should be re-measured against
`lapsePerGameByArch` specifically, not just win rate, since a kit change
that also happens to reduce dice-affordability conflicts could move both
numbers together.

## 2. Keywords

`keywordCostValue`/`balanceSummary.keywordsToNerf` — top of the table
unchanged from v4.19's "after": Steel (+18.0pt, 60% activation), Avenge
(+15.0pt, 71% activation), Swift (+13.2pt, 34% activation), Pierce
(+10.3pt, 71% activation), Overrun (+8.0pt, 60% activation), Bulwark
(+7.6pt, 76% activation). `balanceSummary.keywordsToBuff` (lowest
activation-adjusted value): Excavate (-0.1pt), Echo (+0.4pt), Aftershock
(+0.5pt), Guard (+1.0pt), Toll (+1.3pt).

No keyword weight changes are proposed this pass beyond what item 2 already
carries forward (Steel/Avenge need a bigger single-step jump or a direct
per-tier magnitude cut, not another cost-side nudge — this pass's flat
Steel/Avenge numbers reconfirm that reading a second time). Toll (+1.3pt,
73% activation) is close to fully resolved and should be left alone.

## 3. Game mechanics

`mechanicEngagement`/`mechanicsToRemoveChangeOrAdd` — `dieRerolled` remains
the largest engagement-correlated delta pool-wide (+40.1pt, did n=66,030),
consistent with prior passes; not a defect, a reroll is drafted into and
executed by decks that are already ahead. `comboFired` (+19.9pt),
`locationCast` (+13.7pt), `tributeTriggered` (+13.5pt), `twinComplete`
(+8.0pt) unchanged in shape from v4.19. `aftershockQueued`/`aftershockResolved`
(-35.9pt/-35.2pt, engagementRate 4.4-4.8%) remain healthy post-v4.19's gate
fix — same reactive/comeback-mechanic profile as `boardWipe` (-7.5pt) and
`echoRecast` (-5.8pt), i.e. expected negative deltas from being drafted
into losing decks, not a mechanic that needs another change. No mechanic
change proposed this pass — the v4.19 Aftershock fix is holding and nothing
new regressed.

## 4. Card cost vs ability

`costVsAbilityMismatches` is **identical in composition** to v4.19 (same 10
cards) with near-identical z-scores (this pass: +2.05 to +3.33; v4.19: +2.0
to +3.3): Deceptive Angler (+3.33), Abyssal Dragonfish (+3.07), Ember
Whisperer (+3.07), Driftwood Harp (+2.69), Ribbone Longbow (+2.69), Mist
Ghost Ship (+2.65), Ribvault Cathedral (+2.65), Overseer Optic (+2.56),
Boneplate Sentinel (+2.05), Iron-Scaled Snail (+2.05). Since no changes were
made to any of these cards between v4.19's verification run and this pass's
baseline, this flat reading is exactly the confirmation v4.19 asked for:
**the existing per-card patches (`MANUAL_THRESHOLD_ADJ`/`MANUAL_GATE_OVERRIDE`/
`MANUAL_VALUE_BUFF`) are stable and not regressing, but they are also not
converging toward z<2.0 on their own** — a real second-adjustment pass on
this list is now justified rather than premature.

## 5. Cards to buff/nerf (archetype-normalized)

`cardArchNormalized` (n≥400, archSpread≥2) — the five outliers v4.19
patched are all **flat to within noise** vs. v4.19's "after" column, as
expected with no stat changes made since:

| card | v4.19 after | v4.20 baseline | delta |
|---|---|---|---|
| `nanite_division_marshal` | +18.5pt | +18.46pt | flat |
| `cervine_channeler` | +20.4pt | +20.41pt | flat |
| `familiar_in_the_dark` | +19.6pt | +19.59pt | flat |
| `dr_aries_chief_biogeneticist` | +16.5pt | +16.45pt | flat |
| `worm_brain_host` | +17.3pt | +17.25pt | flat |

`butterflyfish_school` remains a non-issue under the archetype-normalized
lens (-0.94pt, n=2963, archSpread=3) — confirmed a second time, its
un-normalized `cardsToNerf` residual is still purely an archetype-draft
artifact, not a card-level problem. **`the_wolf_of_wall_street`** holds at
+13.13pt (n=481, archSpread=1) — third consecutive data point at
essentially the same value (+16.1 → +13.1 → +13.1), the strongest and most
stable normalized signal in the pool for an unpatched card.

Raw (un-normalized) `cardsToBuff`/`cardsToNerf` — largest residuals, cross-
referenced against `cardArchNormalized` where available:
- **Buff candidates**: Pulsing Heartstone (-43.0pt), Coral Collapse
  (-39.8pt), Locust Veil (-37.3pt), Thornfang Vine (-35.9pt), Skyborne
  Skeleton Dragon / Shattered Horizon Protagonist (tied, -35.5pt, n=2280
  each — likely archetype-locked twins, worth an archetype-normalized
  check before patching either).
- **Nerf candidates**: Cavernous Watcher (+38.5pt, n=2280), Petrified Ribs
  Citadel (+33.0pt), Grit and Halftones (+32.4pt), Kinetix Enforcer
  (+32.1pt, n=2280), Where the Deep Meets the Sky (+31.8pt, n=2280).
  None of these five appear in `cardArchNormalized`'s n≥400/archSpread≥2
  table, meaning they don't have enough deck-archetype spread to
  distinguish "card is strong" from "the one archetype that drafts it is
  strong" — same caution v4.18/v4.19 raised for Butterflyfish School.
  **Do not patch these five off the raw residual alone** without an
  archetype-normalized read first.

## Verification

This was a read-only report pass — no code changes were made, so no
typecheck/lint/test/re-run verification cycle applies. The source run
(`docs/sim-runs/v4-2026-07-21T07-34-06-820Z.json`, `/tmp/sim-run-1.log`) is
itself the verification baseline the next pass's changes will be measured
against: **zero invariant violations, `result.errors: []`**.

## Carried into next pass — prioritized action list

1. **`the_wolf_of_wall_street` — nerf now, don't defer a 4th time.** Three
   consecutive passes at a stable +13-16pt archetype-normalized residual
   (n=481, archSpread=1) with zero direct changes is enough data to size a
   patch confidently. Recommend `MANUAL_STAT_TRIM` of -1/-1 (matching the
   magnitude used successfully on `worm_brain_host` last pass, whose
   residual is comparable at +17.3pt) via the `MANUAL_STAT_TRIM` table in
   `cardpool.ts`. Re-measure against the same archSpread=1 caveat — this
   card only has one drafting archetype, so a full nerf pass, not a half
   step, is appropriate.

2. **`familiar_in_the_dark` — remove the manual buff entirely, not another
   halving.** Two passes running at +19.6pt archetype-normalized with the
   buff at +1 (halved from +2 in v4.19) confirms v4.19's carried note: the
   stat line itself is overperforming independent of the manual buff.
   Recommend deleting its `MANUAL_VALUE_BUFF` entry in `cardpool.ts`
   entirely (bringing it to +0 manual buff) rather than trying a third
   fractional step.

3. **Shinobi Leader-kit fix, now informed by lapse data.** Item 1 is still
   unresolved and Shinobi remains the roster floor (13.8-35.4% across its
   archetypes). This pass's new `lapsePerGameByArch` data adds a concrete
   angle: all six Shinobi archetype variants top the actionable-lapse
   ranking, with Steel-Scrap Control/Avenge Grind dominated by
   `lapseUnusedDiceAtEndTurn` (stranded dice with a legal use — likely
   several Steel/Avenge cards competing for the same turn's dice) and
   Tempo-Anchor dominated by `lapseIdleLeaderAbility_diceSpentDown`
   (Ability-qualifying dice getting spent on board development first,
   despite v4.19's threshold 6→5 revert). Recommend a kit-level change that
   reduces this competition directly — e.g. lowering Apex Nanite Shinobi's
   Ability threshold priority in the AI's own placement ordering, or
   reducing the average pip cost of Shinobi's signature Steel/Avenge cards
   via `MANUAL_STAT_TRIM`/cost table — rather than another pure win-rate-
   targeted threshold tweak. Re-measure both win rate AND
   `lapsePerGameByArch` for the Shinobi archetypes specifically.

4. **`costVsAbilityMismatches` repeat-10 — apply a second, sized patch.**
   Same 10 cards (Deceptive Angler, Abyssal Dragonfish, Ember Whisperer,
   Driftwood Harp, Ribbone Longbow, Mist Ghost Ship, Ribvault Cathedral,
   Overseer Optic, Boneplate Sentinel, Iron-Scaled Snail) have now held
   flat z-scores across two passes with their first patch applied and no
   further regression — v4.19's "confirm before compounding" condition is
   now met. Recommend a second `MANUAL_THRESHOLD_ADJ` step of +0.5 cast-cost
   equivalent (half of a full tier, since the first patch already moved
   these partway and a full second step risks overshoot) on the four
   highest-z entries specifically (Deceptive Angler +3.33, Abyssal
   Dragonfish +3.07, Ember Whisperer +3.07, Driftwood Harp/Ribbone Longbow
   +2.69) and leave the bottom three (Overseer Optic, Boneplate Sentinel,
   Iron-Scaled Snail, z ≈ +2.05-2.56) unpatched this round to avoid
   stacking too many simultaneous changes.

5. **Steel/Avenge cost-weight lever — switch off cost-side nudges, go back
   to direct per-tier magnitude cuts.** Two passes of Σw/2-with-rounding
   cost nudges (v4.19) have now measured flat at +18.0pt/+15.0pt across
   both the pre- and post-change baselines. Recommend reverting to a direct
   per-tier magnitude cut on Steel and Avenge specifically (e.g. -1 stat
   point on the top KEYWORD_TIERS band for each, mirroring the three prior
   successful Steel trims referenced in v4.16/v4.18/v4.19) instead of a
   fourth cost-side attempt. This also has a secondary benefit for item 3
   above, since Steel/Avenge are Shinobi's own signature keywords.

6. **Swift's activation/delta tension — make the design call.** Now three
   passes flat (v4.18 → v4.19 → v4.20) at 24-34% activation / +10-13pt
   delta with no proposed fix from the harness. Recommend either (a)
   accepting Swift as an intentionally high-variance/high-reward keyword
   and closing this item, or (b) a small activation-side fix (lower Swift's
   trigger condition rather than its magnitude) — this is a product
   decision, not something further simulation passes will resolve on their
   own; recommend explicitly closing or owning it rather than carrying it
   to a 4th pass unchanged.

7. **Raw `cardsToBuff`/`cardsToNerf` outliers without archetype-normalized
   coverage** (Pulsing Heartstone, Coral Collapse, Locust Veil, Thornfang
   Vine, Skyborne Skeleton Dragon, Shattered Horizon Protagonist,
   Cavernous Watcher, Petrified Ribs Citadel, Grit and Halftones, Kinetix
   Enforcer, Where the Deep Meets the Sky) — none clear the n≥400/
   archSpread≥2 bar for `cardArchNormalized`. Before any `MANUAL_STAT_TRIM`
   patch, next pass should widen archetype coverage for these cards (are
   they single-archetype locks?) to rule out the Butterflyfish School
   failure mode a third time.
