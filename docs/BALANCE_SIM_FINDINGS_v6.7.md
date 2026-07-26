# Balance & Sim Findings — v6.7 (July 2026)

Latest CPU-vs-CPU balance pass. Supersedes the v6.6 findings doc.
Raw report: `docs/sim-runs/` (latest JSON only; `.gitignore`d).

**Runs:** `npx tsx scripts/simulate-v5.ts 6 32 1337` (cohort A) and
`... 6 32 1337 42` (cohort B) — 5,952 games each, 32 random archetype decks,
same game seed, two independent deck cohorts. **Invariant violations: 0** on
both, before and after this pass's changes.

Same bar as v6.6: a card/kit action only ships if its outlier's Wilson 95%
interval excludes its own in-deck baseline **and** it reproduces with the
same sign in both cohorts. That bar again admitted very few changes — one
card, one Leader kit.

## Full card pool confirmed

Live Supabase `public.cards` is still 292 rows. Pulled fresh via
`execute_sql` on project `dnngihsbqxccqvvedvjc` (`select id, card_type,
rarity from public.cards order by id`) and digested field-for-field over
`(id, type, rarity)` against the bundled `generated-cards.ts` fallback:
**identical digests, 292/292**. No drift since v6.6; `generated-cards.ts` did
not need regenerating and the sims run over the true, current live pool.

## Harness upgrades made first (v6.7)

Per standing practice, before any balance change:

1. **Leader-kit diagnostics (`leaderKitDiagnostics`)** — carry-forward #1.
   For every Leader: average turn of its first invoke, win rate split by
   game-length bucket, and resolve-efficiency (win rate in games its ability
   was used vs invoked-but-unused). Built specifically to explain *why*
   Avatar of the Abyss and Crimson Vector Commander have topped the Leader
   spread every pass since v6.1, not just re-confirm that they do.
2. **Reaction-window content audit (`reactionWindowContent`)** — carry-
   forward #2. A pool-derived (not per-run) count of cards legal in the
   reaction window (Quick removal Events + Ambush units) and of those,
   how many pass `ai.ts`'s `isReactionCandidate` filter (cost ≤ 3),
   broken down **per Leader by that Leader's own producible colors** — so
   the flat pool-wide 26→6 number from v6.5/v6.6 can be replaced with which
   specific archetypes are actually starved.
3. **Printed-budget double-surcharge investigation.** Instrumented the exact
   arithmetic `mapUnit` uses for the 8 (now 6 — see below) flagged Units and
   applied a defensive fix; see "Printed-budget audit" below for what it
   found and why the fix is currently a no-op on the flagged cards.

## The one card action

Two cards cleared both the Wilson-CI-excludes-baseline bar and reproduced
with the same sign in both cohorts:

| card | cohort A residual | cohort B residual | n (A / B) | action |
|---|---|---|---|---|
| `boneplate_sentinel` | +7.7 | +15.8 | 508 / 491 | **`+1` cost** |
| `mist_ghost_ship` | -11.1 | -12.6 | 160 / 88 | **no lever available** (see below) |

- **`boneplate_sentinel: +1`** — a Venomous cost-5 Unit, confirmed
  overperformer in both cohorts. Nerfed via `COST_ADJUST`. Post-change it
  drops out of both cohorts' `costAbilityOutliersSignificant` list entirely
  (below the `playedGames >= 20` cutoff isn't the reason — its residual
  shrank enough that neither the z-score nor the Wilson-CI bar flags it any
  more).
- **`mist_ghost_ship`** — a cost-1 Location, confirmed underperformer in
  both cohorts, but its printed cost is already at `mapLocation`'s floor
  (`Math.max(1, Math.min(4, ...))` — the same floor-clamp mechanism that
  made `towering_tsunami` un-fixable via `COST_ADJUST` before the v6.6 lever
  repair). Unlike `towering_tsunami`, this isn't a broken-lever symptom: a
  `-1` `COST_ADJUST` on a card already computing to 1 is genuinely a no-op,
  and `cardpool.ts` has no existing per-Location trigger-magnitude lever
  (the Event-equivalent problem was examined and closed as noise in v6.6;
  Locations were never given that lever at all because they don't derive
  power from cost — see the v6.6 "Locations are the exception" note). Left
  unactioned this pass rather than bolting on an untested new lever under
  the two-cohort gate; **carried forward** with the diagnosis attached so
  the next pass doesn't have to re-derive it.

After the re-run following this pass's changes, **zero cards reproduced
with the same sign across both cohorts** in the significance-gated outlier
list — the same "remaining spread is cohort noise" pattern v6.6 established.

## Printed-budget audit — investigated, not a live bug

The v6.6 doc flagged 8 double-keyword Units (now 6, cohort composition
shifted the marginal ones off `n>=20`) as printed stat-total outliers and
hypothesized the keyword surcharge was "deducted from stat budget twice
over." Actually tracing the arithmetic for all 6 (`iron_scaled_snail`,
`clockwork_nautilus`, `topographic_behemoth`, `blue_ringed_octopus`,
`glass_shrimp`, `tattooed_sovereign`) found **none of them currently hit the
1..7 cost clamp** — `base + kwAdj` lands at or under 7 for every one, so the
old `statBase = naturalT - max(0, kwAdj)` and a direct `statBase = base` are
numerically identical for all of them. The formula was not, in practice,
double-charging these six.

There IS a real latent bug in the old formula: if `base + kwAdj` ever
**exceeds** 7, `naturalTotalFor` clamps the printed cost to 7 (the card
can't actually collect the full surcharge in its price) while the old
`statBase` line still subtracted the *un-clamped* `kwAdj`, docking stats for
a surcharge the price never charged. Fixed defensively
(`statBase = Math.max(1, base)`, mathematically equal to the old expression
off the clamp, strictly better on it) so a future keyword-cost re-tuning
(e.g. `KEYWORD_COST` moving up) can't silently reintroduce this. **Verified
no-op this pass**: `printedBudgetOutliers.fit` and its outlier list are
byte-identical before and after (`slope 1.09, intercept 2.71, sd 2.02`, same
6 cards, same residuals).

The actual mechanism behind the 6 flagged cards is intentional design, not a
bug: `keywordCostAdj` prices a keyword point at 1 essence, but the stat
budget formula (`budget = 2 * statBase`) returns stats at a 2-points-per-cost
rate everywhere in the pool — so removing `kwAdj` fully from `statBase`
removes exactly `2 * kwAdj` stat points, matching the same 2x rate the rest
of the card's cost buys stats at. A double-expensive-keyword combination
(e.g. Quickstrike + Overrun, weight 4+3=7, `kwAdj=4` on a cost-7 card) is
therefore printed as "almost the entire cost pays for the keyword text, the
body is what's left" — proportional, not double-counted. None of these 6
reproduced as a win-rate outlier in either cohort this pass (same as v6.6).
Still a printing-aesthetics question, not a balance one — **carried
forward**, now with the arithmetic actually verified instead of restated.

## Leader kits: Avatar of the Abyss and Crimson Vector Commander (carry-forward #1, closed for Crimson)

Six passes running, both have topped the Leader spread. The new
`leaderKitDiagnostics` split shows they are two **different** engines, not
one:

| | avg first invoke turn | win% at ≤10 turns | win% at 21-30 | win% at >30 |
|---|---|---|---|---|
| Avatar of the Abyss (A) | 6.0 | 52.4 | 70.3 | 73.6 |
| Avatar of the Abyss (B) | 7.6 | 0 (n=4) | 69.5 | 78.9 |
| Crimson Vector Commander (A, pre-nerf) | 6.6 | 82.1 | 40.6 | 20.2 |
| Crimson Vector Commander (B, pre-nerf) | 6.9 | 92.4 | 48.4 | 21.7 |

Avatar's win rate **climbs** with game length — an attrition kit built
around a repeatable `-3: Shatter` (its highest-of-any-Leader ~9-10
abilities/game, Resolve 6 lets it recur). Crimson's is the **mirror image**
— it wins short games and collapses in long ones, a tempo/aggro kit where a
permanently-buffed board plus a cheap `-1: 2 damage anyTarget` reach ability
(only 4 total cost to invoke, Resolve 6) snowballs early and has nothing
left once the game goes long.

Crimson also carries the **same `Commander` keyword** (+1 Might to every
friendly unit while the Leader is fielded) that was the first lever pulled
on Avatar back in v6.2. Since Crimson has never had a dedicated look across
six passes and the exact mechanism implicated (Commander's board-wide aura
compounding with a cheap-but-recurring ability) has a proven fix on the
sibling Leader, the same lever was applied rather than reaching for an
untested one on the first pass: **`crimson_vector_commander` loses
`Commander`** (`LEADER_KEYWORD_STRIP` in `cardpool.ts`).

Result, same two cohorts, re-run after the change:

| Leader | before A | after A | before B | after B |
|---|---|---|---|---|
| Crimson Vector Commander | 61.5% | **51.0%** | 70.9% | **66.3%** |
| Avatar of the Abyss (untouched, for reference) | 67.9% | 69.0% | 63.6% | 63.3% |

Cohort A lands Crimson almost exactly at baseline; cohort B still reads it
as the strongest Leader in that cohort's mix (66.3%) but down 4.6 points and
clearly moving the right direction. **Avatar of the Abyss carries forward
unchanged** — the diagnostics show its strength is a slow-burn attrition
profile (not a short-game spike like Crimson's pre-nerf read), it has
already taken two dedicated nerfs (v6.2 Commander strip, v6.3 minus-ability
resolve cost -2→-3), and a third drive-by change without new evidence of a
specific mechanism would risk the same overshoot pattern the Wilson gate
exists to prevent. Re-flagged as carry-forward with its own diagnosis
(attrition via ability-use volume) rather than lumped with Crimson's now
differently-diagnosed problem.

## Reaction-window content (carry-forward #2, refined, still unactioned)

Pool-wide: 16 cards legal in the reaction window (Quick removal Events +
Ambush units; narrower than the v6.5/v6.6 "26" because that count included
non-removal Quick Events, which `ai.ts`'s own reaction-window logic never
actually plays), 6 of which pass `ai.ts`'s own `isReactionCandidate`
cost-≤3 filter. Per-Leader (own producible colors only):

| Leader | legal in window | AI candidates |
|---|---|---|
| Avatar of the Abyss | 11 | 3 |
| Sovereign of the Dying Star | 10 | 2 |
| Ruin-Walker Overseer | 8 | **0** |
| Apex Nanite Shinobi | 5 | 3 |
| Mer-King | 4 | 1 |
| Crimson Vector Commander | 3 | 1 |
| Ethereal Sea Witch | 3 | **0** |
| Legendary Diver | 3 | 1 |

Two Leaders (Ethereal Sea Witch, Ruin-Walker Overseer) have **zero** playable
reaction-window content in their own colors at all — those archetypes can
never generate a reaction play regardless of any CPU heuristic change.
Avatar of the Abyss, notably, has by far the deepest reaction-window support
(11/3) — plausibly one contributor to its long-game strength (attrition
tools available on the opponent's turn too), though not conclusively
isolated from its ability-recursion this pass. Reservation waste stayed
essentially flat (33.8% / 28.7%, vs v6.6's 32.4%). Still a content/design
question — printing more Quick removal / Ambush units for the two starved
Leaders' colors, or widening `isReactionCandidate`'s filter, not a heuristic
tweak. **Carried forward**, now with the specific starved archetypes named.

## CPU reasoning lapses

No new lapse counter fired significantly this pass; the v6.6 fixes hold:

- `wellspringMisplay`: 0 in both cohorts (fix holds).
- `leaderShatterBlunder`: 0 in both cohorts (fix holds).
- `missedLethal`: 0, `keptColorDeadHand`: 0, `colorCloggedGames`: 0 in both.
- `charmOnDoomedUnit`: 2,405 (A) / 2,578 (B) — essentially flat vs v6.6's
  post-fix 2,386; no further regression or improvement to act on.
- `guardDiesForNothingDiscretionary`: 113/11,259 (1.0%, A), 66/10,491 (0.6%,
  B) — guard-trade quality stays resolved, consistent with v6.6.
- `removalOnNonThreat`: 167 (A) / 161 (B) — flat-to-improved vs v6.6's 241.
- Ground-truth attack divergence: 0.1% (A) / 0% (B), vs the legacy
  pre-Main1-snapshot 22.2% / 22.8% — the same timing-daylight gap v6.6
  closed, unchanged.
- `tookGuardableLethal`: 103/5,952 (1.7%, A) vs 349/5,952 (5.9%, B) — a
  real cohort-composition split (likely correlated with how many
  short-game-aggro decks a cohort happened to draft), not evidence of a new
  lapse; no counter-measure applied given the two-cohort disagreement.

No new heuristic fix was made this pass — the data didn't surface a fresh
lapse pattern the way `wellspringMisplay`/`charmOnDoomedUnit` did in v6.6.
The Leader-kit strength this pass resolved to a printed-power issue
(Commander's aura), actioned at the card-data level per the task brief's own
branching instruction.

## Keyword health

Sacred (+13.9 A, unflagged B) and Resonant (-10.8 A, +7.4 B) both continue
the same sign-flipping, single-cohort pattern v6.6 diagnosed as archetype
composition noise rather than card power — no new action. Doublestrike
reads positive in both cohorts again (+6.5 A / +12.4 B) for a second pass;
still single-keyword-carrier-driven and modest, watching rather than
acting.

## Headline results (cohort A / cohort B, post-change)

| Metric | A | B | Read |
|---|---|---|---|
| P1 win rate | 47.4% | 45.3% | Flat vs v6.6 (47.2% / 45.7%) — first-player fix holds. |
| Seat-swap first-seat | 49.9% | 47.9% | Flat vs v6.6 (48.1% / 47.7%). |
| Avg game length | 21.4 | 19.9 | Flat vs v6.6 (20.6 / 19.5). |
| Vitality wins | 88.9% | 94.4% | Flat. |
| Clashes/game | 8.74 | — | Flat vs v6.6 (8.75). |
| Comeback rate | 26.3% | 23.7% | Flat vs v6.6 (25.8% / 24.2%). |
| Pool coverage | 62.3% | 63.0% | Flat vs v6.6 (62.0% / 63.0%). |
| Invariant violations | 0 | 0 | |

## Leader spread (post-change)

Cohort A: Avatar of the Abyss 69.0 / Mer-King 52.5 / Crimson Vector
Commander 51.0 / Apex Nanite Shinobi 48.7 / Ruin-Walker Overseer 44.1 /
Legendary Diver 43.1 / Sovereign of the Dying Star 37.0 / Ethereal Sea Witch
35.2.

Cohort B: Crimson Vector Commander 66.3 / Mer-King 63.5 / Avatar of the
Abyss 63.3 / Legendary Diver 57.9 / Sovereign of the Dying Star 39.0 / Apex
Nanite Shinobi 42.2 / Ethereal Sea Witch 42.3 / Ruin-Walker Overseer 29.3.

Avatar of the Abyss is now the clear #1 in cohort A and tied for the top
tier in cohort B; Crimson Vector Commander dropped out of the clear-#1 slot
in cohort A entirely (down to #3, near the field) though cohort B's
different deck mix still reads it on top by a shrinking margin. Directionally
correct for a first pass on this Leader.

## Carry-forward items

1. **Avatar of the Abyss** — still tops or ties the Leader spread in both
   cohorts. Diagnosed this pass as an attrition kit (win rate climbs with
   game length, highest ability-use rate of any Leader) rather than
   Crimson's short-game-spike profile — a different mechanism, so Crimson's
   fix doesn't automatically transfer. Already has two dedicated nerfs
   (v6.2, v6.3); needs new evidence of a specific over-tuned lever (e.g. is
   `-3: Shatter` simply undercosted relative to other colors' minus
   abilities, the same efficiency argument used in v6.3) before a third
   change ships.
2. **Crimson Vector Commander** — Commander-keyword strip applied this pass,
   real improvement in both cohorts (61.5%→51.0% A, 70.9%→66.3% B), but
   cohort B still reads it as the top Leader. Watch one more pass before a
   second lever (e.g. the same minus-ability resolve-cost bump used on
   Avatar in v6.3) — avoid stacking two kit changes in one pass per the
   two-cohort-gate discipline.
3. **Reaction-window content** — Ethereal Sea Witch and Ruin-Walker Overseer
   have zero AI-candidate reaction cards in their own colors; Crimson Vector
   Commander and Legendary Diver have exactly one. A design/content question
   (print more Quick removal / Ambush support for the starved colors, or
   widen `isReactionCandidate`), not a heuristic tweak.
4. **`mist_ghost_ship`** — reproducing underperformer (-11.1 / -12.6) with
   no available lever (cost floor-clamped, no per-Location magnitude table
   exists). New this pass; needs either a Location-specific adjustment lever
   or accepting it as a deliberately weak card.
5. **Printed-budget "outliers"** — reclassified from suspected formula bug
   to verified-intentional design (2x stat-per-cost rate applied uniformly,
   including to the keyword-surcharge portion of cost). The defensive fix
   for the clamp edge case that COULD cause a real double-count ships this
   pass but is confirmed inert on the current pool. No further action
   needed unless `KEYWORD_COST` weights change enough to trigger the clamp.
6. **Doublestrike** — positive in both cohorts for a second consecutive
   pass (+6.5 A / +12.4 B). Still modest and low-carrier-count; one more
   confirming pass before actioning.

## Closed this pass

- ~~`boneplate_sentinel`~~ — confirmed overperformer both cohorts, `+1`
  cost, cleared the significance-gated outlier list post-change.
- ~~Printed-budget double-surcharge~~ — investigated in full; not a live
  bug on the current pool (no flagged card hits the clamp), defensive fix
  shipped anyway, verified as a no-op on today's pool.
- ~~Crimson Vector Commander "never had a dedicated look"~~ — Commander
  strip applied, real movement in both cohorts. Not fully closed (cohort B
  still on top) — see carry-forward #2.
