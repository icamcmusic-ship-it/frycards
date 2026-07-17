# FryCards v4.6 Balance-Sim Findings

Source data: a fresh 22,560-game baseline (`npm run sim:v4 10`, 48 decks —
the same 20 hand-built archetypes + Location-stripped twins + 8 pure-random
controls as v4.5) run against the merged v4.5.1 `main`, then **three full
verification re-runs**, one after each change batch. `npm run analyze:costs`
and `npm run pattern-hitrate` (2-reroll numbers) supplied the cost/hit-rate
data. This doc is the synthesis; every change below shipped in the same
branch as this doc.

Methodology note carried over from v4.5: round-robin win rate is a
*relative* metric — points gained anywhere must come from somewhere else —
and per-card/per-keyword win% is deck-membership-confounded. Both caveats
turned out to matter again this pass (see §2 and §5).

---

## 1. The headline find: two documented Leader mechanics were never wired up

`mapLeader()` (cardpool.ts) never assigned `abilityGrantsTempo` (Legendary
Diver's v4.4.2 tempo-grant buff) or `abilityNoRepeatTarget` (Apex Nanite
Shinobi's v4.4 targeting nerf) to any Leader. Both features were fully
implemented in the engine, covered by engine tests (which construct their
own CardDefs, masking the gap), and documented in the rulebook as shipped —
but no card in the live pool ever carried the flags.

Found by accident, the right way: a verification sim after buffing the
tempo grant (+1/+1 → +2/+2) came back **byte-identical** (same md5) to the
run before it. A deterministic-seed sim can only do that if the changed
code never executes. A probe raising the grant to +9/+9 confirmed it:
still byte-identical. The flag hunt took two minutes after that.

This retroactively explains two v4.5 findings-doc mysteries:
- *"Diver got two direct buff rounds to its Leader kit and still sits below
  its original baseline"* — the marquee half of round one (the tempo grant)
  never activated. Only the threshold changes were ever live.
- *"The abilityNoRepeatTarget targeting restriction barely moved the needle
  (Avenge Grind 95.1% → 94.5%)"* — it was never on. The observed 0.6pt was
  pure noise, and the conclusion drawn from it ("with 2-3 Units in play the
  restriction just alternates targets") was reasoning about a mechanic that
  wasn't running.

**Lesson recorded:** engine tests that hand-build CardDefs verify the
engine, not the pool. Any def-level flag needs a catalog-side assertion
(catalog.test.ts) that at least one live card actually carries it.

## 2. What shipped, and what the verification runs measured

Numbers are original-baseline → final (verify-4, all changes in).

**Leader spread 21.2pt → 17.6pt (best measured to date).** Top five now sit
within 2.0pt (Crimson 52.0 / Shinobi 53.1 / Mer-King 53.2 / Abyss 54.0);
Sea Witch 43.8 → 45.8; Diver 34.2 → 36.4.

| Change | Result (verified) |
|---|---|
| Leader flags wired up (§1) + tempo grant +1/+1 → +2/+2 | Diver 34.2 → 36.4, Aggro-Swift 59.5 → 63.3, Straight-Combo 24.0 → 31.3 |
| Exact-cost Units budget off measured difficulty (see §3) | "Most OP" list no longer exact-dominated; Cavernous Watcher-class free stat-sticks trimmed |
| Straight-gate payoff/stat compensation (+1 SmallStraight / +2 LargeStraight) | Diver Straight-Combo +7.3pt combined with the above; Sea Witch/Shinobi straight decks ~flat (see §5) |
| AVENGE_CAP 3 → 2 | Avenge keyword 56.5 → 55.6; Mer King Avenge Swarm 72.4 → 62.3 |
| Momentum also draws a card | trigger win rate 17.8 → 19.2 (delta still ~-66pt, see §4) |
| Location on-cast base 1 → 2 | isolated Location contribution **-1.9% → -0.2%** — first ~neutral result after four straight negative-measuring buff attempts |
| Overrun punch 1 → floor(ATK/2), prevalence doubled | Overrun keyword 47→49; durability decks unmoved (see §5) |
| Steel+Bulwark combined per-hit cap 4 | durability decks unmoved (see §5) |
| AI: chooseReroll protects exact-cost dice | exact-cost spell cast rates roughly doubled (e.g. Hammerhead Silhouette 0.29 → 0.51 casts/g) |
| Ultimate instrumentation (behind/ahead split) | see §4 — the confound is proven |

**Negative results kept honest (both reverted after verification):**
- Re-pricing *all* cost formats off measured difficulty crashed the
  match-combo archetypes (Crimson Match-Combo 58.6% → 29.7%) without
  helping straight decks (straight-gated Units are ~1% of the pool — the
  wrong lever entirely). Narrowed to exact-only.
- Keying the Swift→Guard "cheap body" conversion off cost difficulty
  instead of legacy threshold silently converted Swift on every
  exact/easy-gate card at every tier — a pool-wide keyword reassignment
  (Swift keyword 51.3% → 33.3%, Diver → 27.4%). Reverted. Same fragility
  class as v4.5.1's `pickHardGate` lesson: **any change to a hash-driven
  assignment input reassigns the pool, not the card you're aiming at.**

## 3. Cost vs. ability

`pattern-hitrate` (2-reroll, directed): AnyPair 99.9 / ThreeKind 74.4 /
TwoPair 74.1 / SmallStraight 44.1 / FullHouse 34.7 / FourKind 28.9 /
LargeStraight 17.7 / Yahtzee 4.6.

Two structural mispricings found and fixed:
1. **'exact' is near-flat easy** (~90% with 5 dice + 2 directed rerolls,
   any face) yet stats were budgeted off the pre-format threshold — an
   exact-6 Rare was a 9/3. The baseline's entire "most likely OP" list was
   exact-cost or easy-gate cards. Exact-cost Units now budget at the
   measured difficulty (D=2).
2. **Straight gates pay ~half the hit rate of their match-family tier
   sibling for identical payoffs.** Straight-gated cards now print +1/+1
   (Small) or +2/+2 (Large) compensation; spells +1/+2 effect value.

## 4. Ultimate(N) and Momentum: the comeback-metric confound, resolved

New instrumentation splits Ultimate usage by board state at activation:
- `ultimateUsedAhead`: **68.6% win rate (+30.3pt)**
- `ultimateUsedBehind`: 26.8% (-38.9pt)

The two-version-old finding "Ultimate usage correlates with losing" was the
desperation confound: losing players use Ultimates *because* they're
losing. Ultimates used from parity-or-better are among the strongest
positive signals in the whole decision table. **No further Ultimate buffs
should be made on the aggregate metric** — and the same logic almost
certainly applies to Momentum's -66pt (it *only* triggers when behind on
two axes; the metric structurally cannot credit it). The right future
measurement for Momentum is an A/B arm (momentum on/off, same roster),
not the decision delta.

## 5. Still unresolved — the priority list for the next pass

1. **Shinobi Avenge Grind (93.4%)** has now survived: an Avenge cap of 3,
   a cap of 2, three rounds of Shinobi Leader-kit cuts, and (finally live)
   the no-repeat-target restriction. Every lever aimed at its label has
   failed, which strongly suggests the label is wrong — the deck is 19
   units of Avenge+**Toll**+mend on a 64-HP Leader. Next candidates worth
   isolating one at a time: the Toll cap (3), mend density, or a dedicated
   sim pitting this one deck against a fixed roster while ablating one
   component per arm.
2. **Durability stacks** (Steel-Scrap 84.0, Guard-Bulwark 83.9, Ward-Steel
   82.7) resisted Overrun prevalence ×2, Overrun punch floor(ATK/2), and
   the Steel+Bulwark per-hit cap. Note they *rose* relative to baseline as
   the exact-cost clamp trimmed cheap aggressive stat-sticks — the meta
   rebalanced toward defense. These decks' engine is plausibly deck-level
   (walls + Toll + sustain), not any single keyword — same ablation
   approach as (1) recommended.
3. **Anchor-ramp archetypes** remain the roster floor (Sea Witch
   Anchor-Scrap 14.6%, Shinobi Tempo-Anchor 22.2%, Abyss Excavate Ramp
   24.6%). Anchor's discount also does nothing for gate-costed payoffs
   (no numeric threshold to discount) — the ramp plan may simply have too
   few things worth ramping into. Design question, not a numbers question.
4. **Diver Rally Tempo (25.0%)** did not recover with the rest of Diver.
   Rally itself measures mid (49.7%); this deck needs its own look.
5. **Keyword win% for Excavate/Foothold/Contested/Crescendo (38-41%)** is
   dominated by deck-membership (they live almost exclusively in the weak
   Location-heavy ramp decks). With Locations now measuring ~neutral in
   isolation, treat these keyword numbers as archetype echoes, not
   independent keyword signals.

## 6. Card-level notes

The exact-cost clamp resolved most of the old "most likely OP" list
mechanically (they were all exact-cost stat-sticks). Post-change outliers
(Vector Blade Captain 77+%, still) are Avenge-deck membership echoes — n
is dominated by the two Avenge archetypes — and should be re-read after
item §5.1 is resolved rather than nerfed by name now. The "useless" list
is now dominated by hard-gate trophies (intentional: Submerged Starfall)
and the same weak-archetype echoes.
