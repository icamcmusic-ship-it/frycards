# Balance Sim Findings — v4.16

This pass (commits `1692110`, `c81c0ee`, `8979ee9`) shipped without ever
getting a findings doc — this backfills that gap, split from v4.17's (see
`docs/BALANCE_SIM_FINDINGS_v4.17.md`) so each doc matches what the code's own
inline comments actually label as v4.16 vs. v4.17. All numbers below are
carried over verbatim from the original commit messages; the raw JSON for the
baseline run lives in `docs/sim-runs/` (all timestamped 2026-07-20).

## Harness upgrades

- **Cost/ability efficiency, keyword balance, mechanic-impact, and expanded
  CPU-lapse instrumentation** added to `scripts/simulate-v4.ts` and
  `src/game/v3/ai.ts`: new mulligan-marginal, Echo-vs-Ability-sequencing,
  reroll, and unused-resource lapse detectors, plus a bucketed
  "balance summary" section at the end of the sim report so outliers surface
  without manually re-reading every table.
- A 66,120-game baseline run (`41124d0`) with the upgraded harness is what
  surfaced the color-legality dead-card bug and every balance/AI finding
  below.

## Root-cause bug: systemic color-legality lockout

`cardpool.ts`'s random secondary-keyword layering (Pierce, Overrun, Rally,
Bulwark, Toll, Avenge, Steel, Crescendo/Aftershock/Snap, Foothold +
Tribute/Excavate/Contested) could stack 3+ distinct colors onto a card with
no check that the result still fit within some real Leader's 2-color
identity — silently making the card illegal for every Leader (undraftable,
permanently dead pool weight). **28/284 non-Leader cards (9.9%) were
affected**, including all 6 Toll-keyword cards — Toll had never fired once
across the 66,120-game baseline.

Fixed at the root with `wouldBeLegalSomewhere()`, gating every keyword-layering
site on it (skip the layer rather than force an illegal combination). Dead-card
count: 28/284 → **0/284**.

## Keyword balance (measured win-rate delta when a keyword fires vs. deck baseline)

- **Steel**: dropped the tier-4 bonus point — was the single largest
  overtuned keyword delta measured (+22pt), even after a prior halving pass.
- **Scrap**: reroll changed from a flat reroll to advantage (max of two d6)
  — the flat version measured net *negative* EV to use (-5.9pt), the
  opposite of what a rebalance lever should do.
- **Crescendo**: trigger loosened to 5-or-6 (was 6-only) — targets its
  chronically low activation rate (the actual bottleneck across 4 prior
  passes) rather than raising its payoff again.

## Leader kits

- **Mer-King**: ability mend value 2 → 1, targeting the Guard-Bulwark Turtle
  archetype specifically (95.9% win rate outlier) without a global
  Guard/Bulwark nerf that would re-sink Mer-King's weaker archetypes (the
  mistake v4.9-v4.11 already showed doesn't work).
- **Sovereign of the Dying Star**: had no entry in `LEADER_ABILITIES`/
  `LEADER_RESOLVE`/`LEADER_ULTIMATE` at all — silently falling back to the
  generic default kit while every other Leader has a hand-tuned one. Added a
  real kit: Ability sap 4 enemy Leader @ threshold 4, Resolve 2, Ultimate
  sap 10 enemy Leader (turn 4).

## UI: card colors by identity, flavor-text overflow

- Card body backgrounds now render from **color identity**
  (`colorBg`/`colorHexPrimary` in `src/meta/colors.ts`) instead of rarity;
  rarity keeps the border/glow/corner-gem/frame treatment so it's still
  legible at a glance, it just no longer drives the body tint.
- Full-tier cards now drop their inline keyword reminder text down to just
  the clickable keyword name (the popover still opens on click) *before*
  ever truncating the card's actual ability or flavor text — long keyword
  explainer text competing with flavor text for the same fixed card height
  was the direct cause of flavor text running off/overlapping on some
  prints.

## Bug fix: missing win/death cleanup after non-combat lethal effects

Leader/Unit/Location Ability activation, Rally-triggered abilities,
Ultimates, Twin bonuses, and Combo triggers could all apply a lethal effect
(destroying a Unit or the enemy Leader) without ever calling
`cleanupDeaths()` — so a win or death from any of those paths could go
unregistered until an unrelated later action happened to trigger cleanup.
Added the missing `cleanupDeaths()` call at each of the five sites in
`engine.ts` (`activateAbility`, `activateViaRally`, `activateUltimate`,
`completeTwin`'s twinBonus branch, `comboCheck`'s per-holder loop).

## Verification

`npm run typecheck` / `npm run lint` (0 errors) / `npm run test` (93 tests)
clean at the time.

## Carried into v4.17

1. Wall-list meta / Mer-King's Guard concentration — this pass's mend nerf
   targets the specific 95.9% outlier archetype; needs re-measurement now
   that the color-legality fix has also changed the pool underneath it.
2. Re-verify the color-legality fix (28→0 dead cards) and the keyword/Leader
   retunes above with a fresh full round-robin now that they've landed
   together, since no post-landing verification run was recorded for this
   combined state.
