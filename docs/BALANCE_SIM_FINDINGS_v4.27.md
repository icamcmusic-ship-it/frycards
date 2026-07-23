# Balance Sim Findings — v4.27

> **Note on the series**: per the standing owner request ("remove all old sim
> docs except the most recent one"), this file supersedes and replaces
> `BALANCE_SIM_FINDINGS_v4.26.md`, which was deleted this pass. This is the
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

Two new capture dimensions (`scripts/simulate-v4.ts`), both derived from data
already collected so they add signal without changing any game outcome:

1. **Clock speed** (`archWinRoundsSum`, printed table + `clockSpeed` JSON
   key) — per-archetype average closing round conditioned on *winning*. The
   pre-existing `archTotalRounds` averages over wins AND losses, so a fast
   aggro deck and a grindy control deck could read the same number (one wins
   fast/loses slow, the other the reverse — indistinguishable). Conditioning
   on the win exposes the aggro↔control speed axis directly. This pass the
   spread ran **7.0 rounds** (Diver Straight-Combo, the fastest closer) to
   **16.9** (Sea Witch Bind-Straight Combo), a clean monotonic ladder with no
   anomaly to action — it is a descriptive lens, load-bearing next pass if a
   balance change unexpectedly shifts an archetype's clock.
2. **Polarized matchups** (printed table + implicitly in `matchupW/matchupN`)
   — auto-flags every head-to-head cell where one side wins ≥68% (min n=12),
   deduped per unordered pair and ranked. A hard-counter/RPS problem is now a
   first-class finding instead of something a human must eyeball out of the
   20×20 matrix. **211 polarized cells** flagged this pass — expected for a
   roster of *fixed hand-tuned* sim decks under deterministic seeds (these
   are balance-comparison archetypes, not player decks, so strong RPS among
   them is the intended stress test, not a live-meta problem). Sea Witch
   Ward-Steel Wall and the Abyss builds recur as dominant rows, consistent
   with Steel topping the keyword-nerf read (below).

## CPU reasoning lapses

**Detector floor confirmed again, 18th consecutive pass (v4.9→v4.27)** —
every genuine-mistake detector reads exactly **zero** on the full run:
`lapseMissedLethal(Damage)`, `lapseWastedCastableDie`,
`lapseIdleLeaderAbility_genuine`, `lapseUnitAbilityOrderFixed`,
`unitAbilityMultiCandidate(Tiered)`, `lapseMulliganKeptMarginal`,
`lapseEchoOverAbilitySequencing`. The non-zero counters (`unusedDiceCount`
47.6/game, `lapseGreedyAssignmentFixed`, `lapseIdleLeaderAbility_diceSpentDown`,
`lapseRerollDeadLowDie`) are the same documented benign shapes — stranded-die
*volume* where nothing is castable, not a decision error. **No new
CPU-reasoning bug found.**

## A third dead-code class found and fixed: `MANUAL_VALUE_BUFF` on Events

Chasing why `the_abyssal_gate` had absorbed a +2 value buff (v4.12) across
five passes without its residual ever closing turned up the reason:
**`MANUAL_VALUE_BUFF` was applied only at the very END of `mapSpell`**, but
three Event branches — the `tier===3` board wipe, the `tier>=4` "comeback"
bombs, and the `tier>=2` combo-gated line — all `return base` early, before
that block ran. So a value buff on *any* of those Events was silently a
no-op. `the_abyssal_gate` is a `tier===3` board wipe, so its +2 had been dead
since the day it was written. Same class as v4.26's "Bind X" and v4.25's
gate-cost no-ops.

Fixed by extracting `applyManualValueBuff()` and calling it at every
`mapSpell` exit (both Charm and Event paths). Per the v4.26 precedent for
freshly-un-deadened buffs (don't carry the stale accumulated size),
`the_abyssal_gate` was reset to a deliberate fresh **+1** rather than its
carried +2/+3.

## Cards actioned this pass

The primary lens is the **archetype-normalized residual** (cast-win% minus
the weighted average of the archetype baselines the card was cast in), which
divides out deck quality — the raw cost-band table is used only as a
cross-check.

**Nerf escalations** (`MANUAL_STAT_TRIM`, repeat offenders still topping the
normalized table): `cervine_channeler` -2→**-3** (+23.0pt, spread 4 — the #1
normalized outlier), `worm_brain_host` -2→**-3** (+16.6pt, spread 3),
`nanite_division_marshal` -1→**-2** (+19.1pt; also the per-carrier lever for
Steel, this pass's #1 keyword-nerf read at +14.8pt),
`dr_aries_chief_biogeneticist` -3→**-4** (ceiling; +14.5pt).

**First-pass trims** (fresh top-of-table normalized outliers, spread ≥4 —
genuine multi-archetype overperformers, not deck artifacts):
`familiar_in_the_dark` **-1** (+18.8pt, spread 4; previously carried a buff
removed in v4.20), `magma_phase_infiltrator` **-1** (+12.6pt, spread 7 — the
widest-spread genuine outlier), `hollow_suit` **-1** (+12.0pt, spread 5),
`void_mother` **-1** (+11.6pt, spread 5; stale +2 reverted in v4.26, has
climbed back from neutral).

**Reverts of overshot buffs**: `the_wolf_of_wall_street` +2→**+1** (now
+15.7pt normalized — the fifth swing in its documented buff/revert history,
so stepped back one at a time rather than to neutral, which has previously
sent it to the opposite extreme), `shattered_horizon_protagonist` +1→**0**
and `skyborne_skeleton_dragon` +1→**0** (the v4.26 carried-forward watch
item: the FullHouse→TwoPair gate ease was the real fix; the +1 stat buffs
stacked on top are now surplus, SHP reading +14.7pt).

**Buffs**: `the_abyssal_gate` fresh **+1** (see dead-code fix; -4.9pt
normalized, spread 10), `ruthless_succession` **+1** (-5.9pt normalized,
spread 12 — the single widest-spread underperformer in the pool, a genuine
card-power gap; its onCast is a sap, so the value lever applies cleanly now
that the dead-code fix makes it live).

**Deliberately NOT actioned** despite topping the raw cost-band table:
Blue-Ringed Octopus / Porcelain Lobster / Wasteland Aberration. None appears
on the archetype-normalized table — their high raw residual is deck quality,
not card power (the recurring "artifact, not outlier" caution; both octopus/
lobster are already at -2, Wasteland at the -4 ceiling). Submerged Starfall
(+27.6pt) is the standing Yahtzee-gated Mythic trophy exception.

## Keyword health

- **Steel** — top of the keyword-nerf read at **+14.8pt** (castWin 52.3 vs
  deckBaseline 37.5, activation 0.61). Actioned this pass via its primary
  drafted carrier `nanite_division_marshal` (-1→-2) rather than a
  keyword-wide cost lever, the per-carrier approach the v4.26 Steel note
  established once its cohort became healthy. Watch next pass.
- **Swift** (+11.4pt, activation 0.34) and **Pierce** (+9.9pt) — inside their
  established bands; Pierce actioned indirectly this pass (worm_brain_host,
  nanite_division_marshal, dr_aries, void_mother are all Pierce carriers on
  the nerf list). Held at the keyword level.
- **Avenge / Bulwark / Overrun / Contested** — +4.5…+6.0pt, established
  bands, held. **Echo** is the sole buff-side keyword (-0.8pt) but sits at
  0.96 activation and is structurally load-bearing; held.

## Game mechanics

- The one mechanic-level change this pass is the `MANUAL_VALUE_BUFF`
  dead-code fix (above), which restores an intended-but-inert lever rather
  than adding a new mechanic. The `mechanicsToRemoveChangeOrAdd` table shows
  the same expected shapes as every pass since v4.16 (resource-usage
  mechanics correlate with winning; `aftershockQueued/Resolved`'s negative
  delta is the documented "fires while behind, by design" shape). No other
  mechanic-level change warranted.

## Verification run

A second full-suite run (6/pairing, ~19,800 games) on the patched pool
confirmed **zero invariant violations** and directionally-correct movement on
every actioned card: Cervine Channeler +23.0→**+18.3**, Nanite Division
Marshal +19.1→**+15.1**, Worm Brain Host +16.6→**+15.8**, The Wolf of Wall
Street +15.7→**+12.9**, Shattered Horizon Protagonist +14.7→**+13.8**, Hollow
Suit +12.0→**+9.9** (all normalized). The Abyssal Gate and Ruthless Succession
dropped onto the dead-in-hand table (win% 48.3 / 50.3) — i.e. their remaining
weakness is now castability, not power, exactly as the fresh single-step buffs
intended. The single-step first trims (Familiar in the Dark, Magma-Phase
Infiltrator) barely moved, as expected for one step — carried forward.

## Carried forward for next pass

1. **The Abyssal Gate / Ruthless Succession** — first fresh read now that
   their value buffs are actually live (Abyssal Gate's was dead for five
   passes). Escalate if still negative.
2. **Steel** — first read off the `nanite_division_marshal` -2 trim; if the
   +14.8pt keyword delta holds, the next carrier trim or a keyword-wide lever.
3. **SHP/SSD** — confirm the +1 reverts landed them near neutral (they were
   surplus on top of the working castability fix).
4. **Familiar in the Dark / Magma-Phase Infiltrator / Hollow Suit / Void
   Mother** — re-read the four first-pass trims; escalate the ones that hold.
5. **The Wolf of Wall Street** — sixth data point on the pool's most
   overshoot-prone card; watch whether +1 settles it or it swings again.
