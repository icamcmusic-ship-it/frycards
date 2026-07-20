# Balance Sim Findings — v4.15

Two-part pass: (A) work the remaining "next pass" backlog compiled across
`docs/COLOR_IDENTITY.md` and every `docs/BALANCE_SIM_FINDINGS_v4.*.md`
still genuinely open — action the concrete items, formally close the
stale/design-discussion ones rather than re-flag them every pass; (B)
improve CPU decision-making with a fresh, line-cited review of `ai.ts`
hunting for weaknesses NOT already covered by the existing lapse
detectors. Two full round-robin verification runs (Part A alone, then
Part A+B together), both **no invariant violations**.

## Part A — balance backlog

### Actioned (code changes, `scripts/simulate-v4.ts` `ARCHETYPES`)

1. **Shinobi Avenge Grind** — v4.14b's `Toll→Excavate` swap had dropped it
   73.2%→45.5%. Re-tuned again: `Excavate→Steel`. **Result: 45.5%→73.8%**,
   fully recovered, confirming Steel was the better in-identity substitute
   this whole time.
2. **Sovereign Crimson Assault** — was a first-draft archetype at 34.0%
   vs. its sibling's 87.7%. Retuned `Avenge→Echo` and softened the build
   (added `draw`, less all-in aggro). **Result: 34.0%→29.0%, got worse.**
   Honest miss — the retune didn't help. Pierce itself (this archetype's
   other keyword) is likely the real bottleneck, not the second keyword or
   the build shape; needs a different lever next pass (see §3).
3. **Exact-cost wall bodies** (Flickering Sea Pens, Cavernous Watcher) —
   checked against the latest sim JSON before touching anything: **already
   resolved by the color-identity work**, not a live problem. Flickering
   Sea Pens reads 48.3% win-in-deck (no longer an outlier); Cavernous
   Watcher doesn't appear in any current legal deck at all. No code change
   made — this item is closed.
4. **Mer-King's overall strength** — added `Mer King Toll-Echo Control`,
   deliberately avoiding Guard (its historically strongest keyword) to
   test whether Mer-King's dominance is Leader-kit-level or an
   archetype-selection artifact. **Result: 25.0% win rate — very weak.**
   This is a real, direct answer: Mer-King's strength is **not** a broad
   Leader-kit property, it's concentrated specifically in Guard/Bulwark.
   Mer-King's aggregate Leader win rate dropped 64.8%→53.9% just from
   adding this one honest data point to the average. The wall-list
   meta/Guard question (item 7 below) is the same underlying lever.

### Formally closed this pass — documented decision, no code change

5. **Crescendo hash-collision** (open since v4.6) — not reassigning via
   `pick()`. `cardpool.ts`'s own `pickHardGate()` comment explicitly warns
   that hash reassignment can silently move unrelated cards' mechanics,
   and no safe lever has been found in 9+ passes of looking. **Formally
   demoted**: Crescendo is a rare flavor keyword going forward, excluded
   from future keyword-health tables' actionable conclusions rather than
   re-flagged as an open mystery every pass.
6. **Echo win-delta / cost-vs-value archetype-normalization** — the
   archetype-normalized Echo table already exists and works; the plain
   cost-vs-value residual table has the same known limitation (not
   archetype-normalized) but won't get a duplicate normalization build
   unless a specific card's residual becomes independently actionable, the
   way items 1-2 above already were.
7. **Wall-list meta / Guard cut** (open since v4.6) — still blocked on a
   Leader-kit-shaped fix, not a keyword-wide dial. Item 4's Mer-King
   isolation data is direct evidence FOR this diagnosis (Guard/Bulwark
   specifically, not Mer-King's kit broadly, drives its strength) — next
   pass should use this as the starting point for a Leader-kit-level
   Mer-King change, not another keyword-wide Guard nerf (which v4.9-v4.11
   already showed re-sinks Mer-King's weaker archetypes without fixing the
   strong one).
8. **Comeback rate (26-27%)** — a design-intent question, not a numbers
   problem: is FryCards supposed to be this snowball-favoring? No
   engineering lever is scoped until that's answered by product/design,
   not resolved this pass.
9. Crimson's card-count shortfall and the 28 tri-color orphan cards stay
   closed (already formally accepted in v4.14b) — restated, not
   re-litigated.

## Part B — CPU decision-making improvements

Four fixes, all in `src/game/v3/ai.ts`, out of a fresh review's ranked
top 5 (the #2 item — rewriting Placement's die-to-card assignment as a
bipartite-matching problem instead of greedy priority-then-first-fit — is
a structural rewrite, out of scope this pass, noted as a future item).

1. **Guard-clears-lethal blindness in Placement.** New
   `guardWallBlocksLethal(g, p)` helper (mirrors `playCombat`'s existing
   lethal check): true when the opponent has a Guard up AND this player's
   already-attacking board ATK would be lethal once any Guard is cleared.
   `castPriority` now adds +50 to any `destroy` card while this holds —
   destroy is the only action guaranteed to clear a Guard this turn (`sap`
   can fail to kill, `bind` only takes effect next turn).
2. **Combat: Guard-overkill avoidance.** `legalTargets()` blocks ALL
   attackers uniformly while any Guard lives (engine-side, not
   per-attacker) — so the old "always send the single highest-ATK
   attacker" logic could badly overkill a low-HP Guard with a big
   attacker instead of saving that ATK for face once the wall falls. Now,
   while a Guard is up, the AI sends the SMALLEST attacker that still
   kills one, preserving bigger attackers for the face swing once Guards
   clear.
3. **Reroll: pure-numeric hands got their own branch.** A hand with zero
   comboGate/combo cards used to fall into the "matching" (pair-keeping)
   branch by omission, not by design (`straightWantCount > 0` is false,
   so it never took the straight branch either). Added an explicit
   `straightWantCount === 0 && matchWantCount === 0` branch: keep whatever
   pays an exact-cost need plus dice >= 4 (useful against `atLeast`/`sum`
   thresholds), reroll the rest — dice *shape* doesn't matter for a hand
   with no gate cards, only individual *values* do.
4. **Mulligan: gate-family coherence + a `costWeight()` consistency fix.**
   `handIsKeepable` now counts a mid/hard-gate card as "cheap" when the
   hand holds 2+ cards sharing that SAME gate pattern (a coherent,
   focused-reroll combo hand is realistically playable soon, even with no
   individually-cheap card in it) — mirrors the count-not-boolean fix
   `chooseReroll` already applies to gate-family detection. Also fixed
   `mulliganOne`'s bottom-card sort, which was still comparing raw
   `threshold ?? 3` instead of `costWeight()` (the fix every other
   card-value comparison in this file already got) — a Combo-gated card
   compared as a flat "3" regardless of whether it was a cheap Common or a
   Mythic gated behind a Full House.

### New instrumentation

`guardClearLethalOpportunity` / `guardClearLethalConverted`
(`simulate-v4.ts`) — decision-correlation companions to fix 1+2 (not a
"would the old code have done differently" detector like
`lapseCombatTradeTargetFixed`). Measured this pass:

```
guardClearLethalOpportunity total=8609  per game=0.130
guardClearLethalConverted   total=6339  per game=0.096
guardClearLethalOpportunity did= 97.2%  did-not= 47.1%  delta=+50.1pt
guardClearLethalConverted   did=100.0%  did-not= 47.5%  delta=+52.5pt
```

The opportunity isn't rare (~1 in 8 games) and converts to a win 73.6% of
the time it arises (6339/8609) — a real, meaningfully-sized fix, not a
paper win. All previously-fixed lapse detectors stayed at their expected
baseline: `lapseMissedLethal`/`lapseWastedCastableDie`/
`lapseIdleLeaderAbility_genuine`/`lapseUnitAbilityOrderFixed` all still
read exactly zero (no regression from the combat/placement changes);
`lapseCombatTradeTargetFixed` stayed low (0.052/game, consistent with its
prior baseline) despite the new Guard-overkill-avoidance logic changing
which attacker gets picked. `mulliganed`'s win-correlation moved only
-1.1pt (essentially neutral) — the mulligan heuristic change didn't
introduce a surprising swing either direction.

## Verification

Two full `npm run sim:v4 -- 20` round-robin runs (Part A alone: 42,600
games; Part A+B together: 42,600 games), **no invariant violations** in
either. `npm run typecheck` / `npm run lint` / `npm run test` (93 tests)
clean throughout, checked after each logical group of changes rather than
one batched diff.

## Still open — priority list for the next pass

1. **Sovereign Crimson Assault remains weak (29.0%)** after one failed
   retune attempt — the bottleneck is likely Pierce itself (a
   historically weak keyword) rather than its pairing or build shape;
   needs a genuinely different lever (a third keyword swap, or accepting
   Sovereign as a 1.5-archetype Leader for now).
2. **Wall-list meta / Mer-King's Guard concentration** — now has direct
   isolation evidence (item 4 above) that the strength lives specifically
   in Guard/Bulwark, not the Leader's kit broadly. The next pass should
   design a Leader-kit-shaped compensation (as v4.11 originally called
   for) now that there's real data pointing at exactly which lever NOT to
   pull (a keyword-wide Guard nerf, already shown to re-sink weaker
   Mer-King archetypes without touching the strong one).
3. **Placement's die-to-card assignment is still greedy, not globally
   optimal** (noted but out of scope this pass) — a card that's the ONLY
   thing that can use a given die value can still lose that die to a
   higher-`castPriority`-but-more-flexible card under dice-scarce turns. A
   real fix needs a small assignment-problem solver (≤5 dice, cheap even
   brute-force), not a scoring tweak — a structural change deserving its
   own dedicated pass.
4. **Comeback rate and Crescendo** remain open design questions, unchanged
   from prior passes (see Part A items 5, 8) — need product input, not
   more engineering, before either gets a lever.
