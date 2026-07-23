# Balance Sim Findings — v4.28

> **Note on the series**: per the standing owner request ("remove all old sim
> docs except the most recent one"), this file supersedes and replaces
> `BALANCE_SIM_FINDINGS_v4.27.md`, which was deleted this pass. This is the
> sole surviving findings doc; the full historical record lives on in
> `CHANGELOG.md` and the extensive in-code commentary in
> `src/game/v3/cardpool.ts` / `keywords.ts` / `engine.ts`.

Baseline this pass: **26,448 games**, 58 decks (25 archetypes +
Location-stripped Twin variants + 8 pure-random control decks), 8/pairing,
Twin mode `stagedPassive` (selected by the A/B/C test as every pass since
v4.15). **Zero invariant violations**; `npx vitest run` 107/107 green
throughout. Card pool re-verified in field-for-field sync with live Supabase
before the pass (292/292, md5 identical on `id|name|type|rarity|set|image|
flavor`), and the mechanic hash keys only on card `id`, so the sim pool and
the live client pool are the same deterministic assignment.

## Harness upgrades this pass

Two new capture dimensions (`scripts/simulate-v4.ts`), both purely additive
telemetry that cannot change any decision or RNG draw:

1. **CPU lapse density by game phase** — every existing lapse counter
   (`ai.ts`'s `lapse()`) now also buckets into early/mid/late thirds by round
   (new `phaseOf()` helper, `GameStats.lapsesByPhase` in `engine.ts`),
   instead of only ever reporting a flat per-game rate. Every prior pass's
   detectors read flat; this splits them by WHEN in the game they fire, so a
   mistake class that's rare overall but concentrated in the late, full-board
   game (where a bad decision costs more) wouldn't just wash out in the
   average. Result this pass: the benign "measurement only" counters split
   cleanly by direction — stranded-die volume (`unusedDiceCount`,
   `lapseUnusedDiceAtEndTurn`, `lapseIdleLeaderAbility_refusalNoTarget`,
   `lapseRerollDeadLowDie`) climbs steadily from early to late (expected —
   boards and hands fill up, more dice go unspent), while the two
   "old-vs-new logic disagreed" measurement-only counters
   (`lapseGreedyAssignmentFixed`, `lapseIdleLeaderAbility_diceSpentDown`)
   concentrate EARLY instead and taper off. Purely descriptive — confirms the
   existing floor isn't hiding a phase-specific blind spot, not a new bug.
2. **Keyword tier-ladder monotonicity** — groups the existing
   archetype-normalized per-card residual by each card's assigned
   `keywordTiers` (`cardpool.ts`) to check whether a keyword's higher tiers
   actually outperform its lower tiers, per the tier system's own design
   contract (`docs/KEYWORD_TIERS.md`). Derived entirely from already-computed
   data, no new engine/ai instrumentation needed. Flagged one apparent
   inversion — **Guard Tier II reads weaker than Tier I and III** (T1=+7.8pt
   n=3967/3 cards, T2=+3.0pt n=63580/31 cards, T3=+10.0pt n=12951/7 cards) —
   but Tier I's read comes from only 3 cards against Tier II's 31, too thin a
   sample to distinguish a genuine tier-pricing problem from which specific 3
   cards happen to carry Tier I. Left as a watch item, not actioned; a
   cost-weight change on a 3-card sample risks being noise-chasing.

## CPU reasoning lapses

**Detector floor confirmed again, 19th consecutive pass (v4.9→v4.28)** —
every genuine-mistake detector reads exactly **zero** on the full run:
`lapseMissedLethal(Damage)`, `lapseWastedCastableDie`,
`lapseIdleLeaderAbility_genuine`, `lapseUnitAbilityOrderFixed`,
`unitAbilityMultiCandidate(Tiered)`, `lapseMulliganKeptMarginal`,
`lapseEchoOverAbilitySequencing`. The non-zero counters (`unusedDiceCount`
47.9/game, `lapseGreedyAssignmentFixed`, `lapseIdleLeaderAbility_diceSpentDown`,
`lapseRerollDeadLowDie`) are the same documented benign shapes — stranded-die
*volume* where nothing is castable, not a decision error — now additionally
confirmed by the new phase-density lens above. **No new CPU-reasoning bug
found.**

## Cards actioned this pass

Primary lens: archetype-normalized residual (cast-win% minus the weighted
average of the archetype baselines the card was cast in), cross-checked
against the raw cost-band table.

**Nerf escalations** (repeat offenders still topping the normalized table):
`cervine_channeler` -3→**-4** (ceiling; +21.1pt, spread 4 — still #1),
`nanite_division_marshal` -2→**-3** (+18.3pt; also the per-carrier lever for
Steel, again this pass's #1 keyword-nerf read at +13.8pt), `worm_brain_host`
-3→**-4** (ceiling; +15.1pt), `familiar_in_the_dark` -1→**-2** (+17.3pt,
barely moved off its v4.27 first-pass trim as expected for a single step),
`magma_phase_infiltrator` -1→**-2** (+11.4pt), `fayes_true_face` -3→**-4**
(ceiling; +10.9pt).

**Fresh first-pass trim**: `titan_of_the_trench` **-1** (+10.7pt normalized,
spread 6 — the widest-spread genuine outlier this pass, also independently
flagged on the card-economy table as one of the cheapest casts that
overdelivers: ~1.5 pips/cast for a double-digit normalized delta).

**Overshoot reverts** (flipped to the opposite extreme — same "revert the
most recently-added lever, don't compound" pattern this file has used on
every prior overshoot case): `the_wolf_of_wall_street` +1→**removed** (sixth
swing in its documented buff/revert history — still overshooting even at the
smallest step, +14.9pt normalized), `kinetix_enforcer`'s `MANUAL_THRESHOLD_ADJ`
+2 cost bump **removed** (its stacked -4 stat trim + this cost bump flipped
it hard to an underperformer, confirmed on three independent signals at
once: archetype-normalized delta -4.3pt, printed-power cost-vs-ability
z-score -1.85 — the pool's #2 lowest, and the card-economy table's "expensive
casts that don't pay off" list at avgPips=12.35; the stat trim is left in
place pending a fresh read next pass with the cost lever removed).

**Buffs**: `ruthless_succession` +1→**+2** (still -4.0pt normalized after the
v4.27 dead-code fix made its value buff live for the first time — down from
-5.9pt pre-fix, moving the right direction but still the pool's widest-spread
underperformer at 12 archetypes), `blind_allegiance` **+1** (fresh, -5.3pt
normalized spread 2, also flagged on the card-economy table as an expensive
cast that doesn't pay off), `violet_haze_kunoichi` **+1** (fresh, -4.1pt
normalized, spread 3).

**Held flat / carried forward** (no further lever identified without more
signal): `dr_aries_chief_biogeneticist` (already at the -4 ceiling, holding
flat at +14.8pt — same design-tension treatment as
`where_the_deep_meets_the_sky`'s own ceiling case), `hollow_suit` /
`void_mother` (their v4.27 single-step trims are working — hollow_suit
+12.0→+9.9pt, void_mother dropped off the top-12 table entirely),
`the_abyssal_gate` (the v4.27 dead-code fix + fresh buff resolved it off the
worst-normalized table this pass), `shattered_horizon_protagonist` (holding
+13.6pt post-v4.27-revert; the castability fix worked but the residual
itself hasn't closed and no clean per-card lever stood out this pass — an
honest open item, not swept under a reflexive re-nerf).

## Keyword health

No keyword-wide cost lever was actioned this pass — the two keywords that
would otherwise top the list (Steel +13.8pt, Swift +9.7pt) are both handled
via their per-carrier cards instead (Steel via `nanite_division_marshal`
above; Swift's carriers are a thin 5-card pool already inside its
established band, held). Pierce (+9.6pt) similarly continues to resolve via
its per-card outliers on the nerf list above (worm_brain_host,
nanite_division_marshal, familiar_in_the_dark are all Pierce carriers).
Echo remains the sole buff-side keyword read (-0.8pt) at 0.96 activation —
structurally load-bearing, held.

## Game mechanics

No mechanic-level change warranted this pass. `mechanicsToRemoveChangeOrAdd`
shows the same expected shapes as every pass since v4.16 (resource-usage
mechanics — die rerolled, combo fired, Location cast, Twin completion —
correlate positively with winning; `aftershockQueued/Resolved`'s negative
delta remains the documented "fires while behind, by design" shape). The
keyword-tier-monotonicity harness upgrade (above) is a new *measurement*
lens, not a mechanic change, and its one flagged inversion (Guard T2) wasn't
actioned given the thin 3-card Tier I sample.

## Verification run

A second run (6/pairing, ~19,800 games) on the patched pool confirmed **zero
invariant violations** and 107/107 vitest green. Every actioned card moved in
the intended direction or resolved off the extreme tables entirely:
Cervine Channeler +21.1→**+18.0**, Nanite Division Marshal +18.3→**+14.8**,
Fayes True Face dropped off the worst-12 table (was +10.9), The Wolf of Wall
Street +14.9→**+12.4** (right direction, though not yet neutral — carried
forward), and — most notably — **Kinetix Enforcer, Ruthless Succession, and
Violet Haze Kunoichi all disappeared from both top-12 normalized tables
entirely**, confirming all three reverts/buffs landed cleanly. The Abyssal
Gate reappeared at a much-improved -3.7pt (was -4.9 to -6.0pt across the last
two passes) with a wider archetype spread (10) on the smaller verification
sample — within expected noise for a 19,800-game run, carried forward as a
light watch item rather than an escalation.

## Carried forward for next pass

1. **The Wolf of Wall Street** — seventh data point on the pool's most
   overshoot-prone card; the buff is fully reverted now, watch whether true
   neutral finally settles it.
2. **Kinetix Enforcer** — cost-bump reverted this pass; the older -4 stat
   trim is still in place. Re-read next pass: if it's still underperforming,
   the stat trim itself needs easing; if it's now neutral, leave as-is.
3. **Shattered Horizon Protagonist** — holding +13.6pt with no clean lever
   identified this pass; needs a fresh look rather than another reflexive
   stat cut.
4. **Guard keyword tier monotonicity** — the T2-reads-weaker-than-T1
   inversion flagged by the new harness lens needs a bigger Tier I sample
   before it's actionable; watch as the pool's Guard-T1 card count grows.
5. **Titan of the Trench / Blind Allegiance / Violet Haze Kunoichi** —
   fresh single-step actions this pass; re-read whether they hold, escalate
   if they don't move.
