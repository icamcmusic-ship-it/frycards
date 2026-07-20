# Balance Sim Findings — v4.19

Continuation pass following v4.18. Context this pass: the full live Supabase
card pool (292 rows, confirmed in sync — see v4.18) with the **brand-new
keyword tier system** just shipped (`KEYWORD_TIERS` in `keywords.ts`, tier
assignment in `cardpool.ts`, documented in `docs/KEYWORD_TIERS.md`), the new
die-to-card **assignment solver** replacing the old greedy Placement loop,
and the **`lapseUnusedDiceAtEndTurn` structural finding** from v4.18 (5 fresh
dice/turn vs ~1 drawn card — Pitch is the designed sink for the remainder).
Fresh baseline: 10 games/pairing, ~33,060 games, **zero invariant
violations**, with new telemetry (`cardArchNormalized`, `cardEconomy`,
`keywordCostValue`, `mechanicEngagement`, `tempoCurve`, `lapsePerGame`).
Verification: a second fresh 10-games/pairing run (~33,060 games) after all
changes below, also **zero invariant violations**.

## 1. Lapses in CPU reasoning

Per-game counters (baseline → verify):

| counter | before | after |
|---|---|---|
| `lapseUnusedDiceAtEndTurn` | 16.582 | **0.956** |
| `unusedDiceCount` (raw volume) | 44.091 | 43.274 |
| `lapseIdleLeaderAbility_diceSpentDown` | 2.032 | 2.036 |
| `lapseIdleLeaderAbility_refusalNoTarget` | 0.734 | 0.886 |
| `lapseGreedyAssignmentFixed` | 3.255 | 3.304 |
| `lapseRerollDeadLowDie` | 0.753 | 0.756 |
| everything else (`lapseMissedLethal`, `lapseWastedCastableDie`, `lapseIdleLeaderAbility_genuine`, `lapseUnitAbilityOrderFixed`, `unitAbilityMultiCandidate*`, `lapseMulliganKeptMarginal`, `lapseEchoOverAbilitySequencing`) | 0 | 0 |

**Actioned**: re-pointed `lapseUnusedDiceAtEndTurn` per the harness
recommendation — it now fires only on turns where a stranded die had a real
LEGAL use available (a payable non-gated card in hand, mirroring
`recordPlacementLapses`'s existing deliberate-hold filters, or the unspent
non-pointless Leader Ability), not on any turn with any die left over.
Factored the shared "did this stranded die have a legal use" check into
`strandedCastableCard`/`strandedDieHadLegalUse` in `ai.ts`, reused by both
`recordPlacementLapses` and `recordUnusedResourceLapse` (no behavior change
to `recordPlacementLapses`, only de-duplication).

**Measured: 16.58 → 0.96/game.** This confirms the v4.18 structural read:
the old counter was ~94% "designed Pitch sink," not CPU-actionable lapse. The
raw volume companion (`unusedDiceCount`, 44.1 → 43.3) barely moved, as
expected — re-pointing changes what the binary *means*, not how many dice
actually go unplaced. The remaining 0.96/game is the real, now much smaller,
actionable slice; `unusedDiceCount` (or a die-value-weighted variant) is the
right metric to chase next, not the binary.

**Not actioned**: `lapseIdleLeaderAbility_diceSpentDown` (2.0/game — a
qualifying die existed earlier in the turn but got spent on something else
before the Ability could use it) and `lapseGreedyAssignmentFixed` (3.3/game
— telemetry-only, confirms the v4.19 solver is genuinely re-routing dice
vs. the old greedy pick, by design) are both diagnostic-only or represent
correct opportunity-cost trade-offs, not bugs — no engine change is implied
by either number alone without a scored comparison of the alternative.

## 2. Keywords

Full `keywordCostValue` read (activation ratio, cast-win delta, deck
baseline) — see raw JSON. Actioned via `KEYWORD_TIERS` cost weights
(uniform per-tier, not per-card):

- **Steel** (w 1.5/2/2.5 → 2.5/3/3.5) and **Avenge** (w 1/1.5 → 2/2.5) — the
  two worst offenders again this pass (+17.7pt, +15.0pt), despite Steel's
  three prior power/print-rate trims (v4.7/v4.16/v4.18). Per-fire magnitude
  is already at the floor, so this pass pushes the *cost* lever instead — a
  full costWeight step per tier reliably moves a multi-keyword body's
  recalculated cost tier up by one (the recalculation rounds Σw/2, so a +0.5
  nudge is often a no-op; +1 is not). **Also** dropped `nanite_division_marshal`'s
  manual Steel grant from tier III to II — it was the pool's *only* Steel
  tier-cap-premium card, so the premium's automatic cost-tier discount was
  stacking directly against this fix; its own archetype-normalized residual
  was the single worst in the pool (+21.0pt).
- **Toll** (w 1/1.5/2 → 0.5/1/1.5) — a uniform one-step cheapening. Toll
  measured only +2.8pt (well below Steel/Avenge/Swift/Pierce), and both
  Toll-identity archetypes (Crimson Toll-Bulwark Fortress, Mer King
  Toll-Echo Control) sit in the roster's bottom half — Toll's cost was
  already pricing it out of the decks it's meant to anchor.
- **Echo** tier II (w 1 → 0.5) — Echo measured a near-zero +0.4pt delta
  across the single highest cast volume of any keyword (163k casts, 91.6%
  activation) with the weakest deck baseline (42.2%) in the table. The
  fodder-free tier II was priced like a premium it wasn't delivering; now
  weighs the same as tier I.

**Measured** (baseline → verify): Steel +17.7pt → +18.0pt (essentially flat
— see below), Avenge +15.0pt → +15.0pt (flat), Toll +2.8pt → +1.3pt (halved),
Echo +0.4pt → +0.4pt (unchanged, as expected — it was a floor case, not an
outlier). **Steel and Avenge's deltas did not move as intended.** Only 18
cards in the live pool actually crossed a cost-tier boundary from these
weight changes (mostly Echo-tier cards moving -1, four Guard+Avenge cards
moving +1) — the Σw/2-with-rounding recalculation absorbed most of the +1
step without changing any card's printed cost, because most Steel/Avenge
cards don't sit near a rounding boundary. **Carried forward**: this needs
either a bigger single-pass weight jump (risking overshoot on the few cards
that DO move) or a direct per-tier magnitude cut on Steel/Avenge specifically
(the lever three prior Steel passes already used successfully) rather than
another cost-side nudge.

**Not actioned**: Bulwark/Foothold/Frenzy/Pierce/Swift/Overrun (the next
band down, +8-12pt) — left alone this pass to avoid stacking too many
simultaneous keyword-wide dials (v4.18 explicitly warns about overshoot from
exactly this). Swift's low 24-34% activation with a strong per-fire delta
(+10-13pt) is the same "rare but strong, not weak" tension v4.18 flagged —
still a design judgment call, not something the harness can resolve; no new
keyword added or removed this pass for the same reason (see item 3).

## 3. Game mechanics

`mechanicEngagement` flagged one real defect: **Aftershock had ZERO
printings in the live 292-card pool** (`aftershockQueued`/`aftershockResolved`
both `engagementRate: 0`, `firedWinPct: null`). Traced to `cardpool.ts`'s
Aftershock assignment gate (`tier >= 2 && hash(c.id) % 6 === 4 && ... value
>= 1 && wouldBeLegalSomewhere(...)`) — combined with the pool's actual Event
generation branches (board wipes, tier≥4 bombs, and combo-gated Events all
`return` earlier in `mapSpell` before this roll is ever reached), no card in
the 39-Event pool could reach this branch with a nonzero die. **Actioned**:
loosened the gate (`tier >= 2` → `tier >= 1`, `hash % 6 === 4` → `hash % 3 !==
0`) — a strict widening, so no other keyword's roll shifts. **Measured**: 3
Aftershock printings now exist (`bioluminescent_tide`, `coral_collapse`,
`flash_freeze`); post-fix engagement is 4.4-4.8% with a -35pt delta when it
fires — consistent with the other reactive/comeback mechanics in the table
(`boardWipe` -7.1pt, `echoRecast` -4.9pt): these are drafted into and used by
decks that are already behind, so a negative raw delta is expected, not a
sign the mechanic itself needs a further nerf.

`echoRecast` (-4.9pt) and `boardWipe` (-7.1pt) were reviewed and left alone
for the same reason. `fatigued` (-2.2pt) and `ultimateUsed` (-8.8pt) are both
inherently correlated with "already losing" states (fatigue only exists
after deck-out risk; a losing player is more likely to have banked turns to
reach their Ultimate's unlock turn) — not actioned.

## 4. Card cost vs ability

`cardEconomy`'s `costVsAbilityMismatches` table repeats several items from
v4.17/v4.18 (Deceptive Angler, Abyssal Dragonfish, Ember Whisperer, Driftwood
Harp/Ribbone Longbow, Mist Ghost Ship/Ribvault Cathedral, Overseer Optic,
Boneplate Sentinel, Iron-Scaled Snail) — all already carry a
`MANUAL_THRESHOLD_ADJ`/`MANUAL_GATE_OVERRIDE`/`MANUAL_VALUE_BUFF` patch from
a prior pass; z-scores in the +2.0 to +3.3 range after a patch already
applied says the patch direction is right but under-sized, not that a new
lever is needed. Left unchanged this pass rather than stacking a third
adjustment on cards already carrying one, per the "avoid overshoot" brief —
flagged below for the next pass with real before/after z-score deltas to
confirm the existing patches are actually working before compounding them.

## 5. Card buffs/nerfs (archetype-normalized)

`cardArchNormalized` (n≥400, archSpread≥2 — the missing lens v4.18 asked
for) top outliers, actioned via `MANUAL_STAT_TRIM`:

| card | before | after |
|---|---|---|
| `nanite_division_marshal` | +21.0pt | +18.5pt (Steel III→II landed most of this) |
| `cervine_channeler` | +20.9pt | +20.4pt (-2/-2 stat trim) |
| `familiar_in_the_dark` | +19.3pt | +19.6pt (halved a v4.12 overshoot, -2→+1) |
| `dr_aries_chief_biogeneticist` | +19.0pt | +16.5pt (-2/-2 stat trim) |
| `worm_brain_host` | +19.0pt | +17.3pt (-1/-1 stat trim) |

Mixed results — `cervine_channeler`/`worm_brain_host` moved in the intended
direction but modestly; `familiar_in_the_dark` (a deliberate *reduction* of
its existing v4.12 +2 buff to +1, since the archetype-normalized view showed
it had drifted to a top-3 pool-wide overperformer at +2) barely moved and
may need the buff removed entirely next pass rather than halved.

**The standing Wolf of Wall Street / Butterflyfish School item**: this pass
confirms v4.18's read was correct — with NO further stat changes to either
card, `the_wolf_of_wall_street`'s archetype-normalized delta moved
+16.1→+13.1pt and `butterflyfish_school`'s stayed flat at -0.9pt, purely
from other changes made elsewhere this pass (keyword weights, Leader kits).
**Butterflyfish School is not an outlier at all under this lens** — its
un-normalized residual (+30.9pt in `cardsToNerf`, the same number that
triggered two rounds of stat patches in v4.12/v4.18) evaporates almost
entirely once compared against its own archetype siblings instead of the
whole pool (archSpread=3, n=2898, normalized delta -0.9pt). This is exactly
the "un-normalized residual dominated by which archetype drafts it" failure
mode v4.18 predicted. Wolf of Wall Street's normalized delta (+13-16pt) is
real but much smaller than its un-normalized read ever suggested, and now
has a stable, repeatable measurement across two passes with zero changes to
the card itself — a genuine (if modest) card-level issue, not an archetype
artifact. **Left unpatched a third time**: a card that measures the same
modest positive normalized residual twice in a row without any direct
change is a legitimate future target, but two data points isn't enough to
size a patch confidently on a card with this exact "guessed twice already,
both wrong direction" history.

## 6. Leader spread

Baseline this pass: Ethereal Sea Witch 61.3% vs. Apex Nanite Shinobi 31.4% —
29.9pt (a fresh number under the keyword-tier system's reshaped pool, not
directly comparable to v4.18's pre-tier 25.3pt). Two Leader-kit-shaped fixes
(not keyword-wide dials, per the brief):

- **Ethereal Sea Witch**: Ultimate threshold 5 → 6. Sea Witch has topped
  the roster for three straight passes (61-64%) on the strongest Ultimate in
  the game (a full board wipe) at an ordinary gate. Gates it behind a
  natural 6 without touching the every-turn Bind kit.
- **Apex Nanite Shinobi**: Ability threshold 6 → 5, reverting the v4.5
  frequency nerf. The condition that justified three straight Shinobi cuts
  (its two archetypes measuring 84-95% win rate) has inverted under the
  keyword tier system — Steel/Avenge bodies (Shinobi's own durability shell)
  now pay real cost weight, and Shinobi is the roster floor by 13+ points
  this pass (31.4%; both its archetypes sit at 34-40% pool-wide, 13-15%
  `[noLoc]`). Value (1) and `abilityNoRepeatTarget` stay on — only frequency
  reverts.

**Measured**: spread 29.9pt → 27.9pt. Sea Witch 61.3%→60.0% (moved in the
intended direction, modestly). Shinobi 31.4%→32.2% — barely moved, and its
archetypes are still the roster's worst by a wide margin (Steel-Scrap
Control 13.8% `[noLoc]`, Mer King Toll-Echo Control 8.9% `[noLoc]` is
actually the true floor). **Not resolved this pass** — a single threshold
revert wasn't enough to lift a Leader whose problem compounds across two
different keyword nerfs (Steel this pass, Avenge this pass) landing on its
own signature archetypes simultaneously. Carried forward as the top
priority again, this time with a note that Shinobi specifically needs a
kit-level look independent of any further keyword-wide Steel/Avenge work,
since those two dials keep landing on it hardest of any Leader by
construction (Steel-Scrap Control and Avenge Grind are both built around the
exact keywords being trimmed pool-wide).

## Verification

`npm run typecheck` (0 errors) / `npm run lint` (0 errors, 13 pre-existing
warnings) / `npm run test` (107 tests, all passing) clean throughout. Fresh
`npm run sim:v4 -- 10` round-robin run (~33,060 games) after all changes
above, **zero invariant violations**, `result.errors: []` both before and
after.

## Carried into next pass — priority list

1. **Apex Nanite Shinobi / Shinobi Steel-Scrap Control &
   Mer King Toll-Echo Control** — now the roster's two true floors
   (8.9-13.8% `[noLoc]`), both landed on by this pass's Steel/Avenge/Toll
   keyword-wide cost nudges on top of their own kits. Needs a Leader-kit
   fix independent of any further pool-wide Steel/Avenge/Toll work.
2. **Steel/Avenge cost-weight changes measured near-zero effect**
   (+17.7→+18.0pt, +15.0→+15.0pt) — the Σw/2-with-rounding cost
   recalculation absorbed the +1 step for all but 18 cards pool-wide. Next
   pass should either accept a bigger single-step weight jump (with a
   real overshoot check) or go back to direct per-tier magnitude cuts,
   which is the lever that has actually worked for Steel three times before.
3. **`familiar_in_the_dark`** — the halved buff (+2→+1) barely moved its
   archetype-normalized residual (+19.3→+19.6pt); may need the manual buff
   removed entirely rather than reduced.
4. **`the_wolf_of_wall_street`** — now has two consecutive passes' worth of
   a stable, modest positive archetype-normalized residual (+16.1pt this
   pass's baseline, +13.1pt after unrelated changes) with zero direct
   changes to the card. A legitimate small-nerf candidate next pass, sized
   off two real data points instead of one.
5. **`costVsAbilityMismatches` repeat offenders** (Deceptive Angler, Abyssal
   Dragonfish, Ember Whisperer, Driftwood Harp/Ribbone Longbow, Mist Ghost
   Ship/Ribvault Cathedral, Overseer Optic, Boneplate Sentinel,
   Iron-Scaled Snail) — all already carry a prior-pass patch and still
   measure z ≥ +2.0. Confirm the existing patches' before/after effect size
   before compounding a second adjustment.
6. **Swift's low-activation/high-delta tension** — unchanged from v4.18,
   still a design judgment call the harness can't resolve on its own.
