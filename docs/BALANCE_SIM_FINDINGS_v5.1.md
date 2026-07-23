# Balance & CPU Findings — v5.1 (first essence-engine pass)

First sim pass on the v5 essence engine, run with the new
`scripts/simulate-v5.ts` harness over the FULL 292-card catalog (bundled
fallback verified identical to the live Supabase pool). Suites: 24 random
coherent archetype decks, round-robin, 4 games/pairing (2,208 games/run),
seeded. Three tuning passes + one fresh-seed verification run. The v4.27
carry-forward list is obsolete — every item referenced dice-era mechanics
(Steel, Pierce, castability, Yahtzee gates) that no longer exist.

## Harness (new for v5)

Captures: outcomes (P1 win, win condition, game length histogram), per-card
played-vs-deck win residuals + dead-in-hand rates, keyword carrier health,
mechanic usage (leader invokes/abilities/shatters, rebonds, reaction plays,
sanctum/charm/event plays, sheds), CPU lapse counters (missed lethal,
guardable lethal taken, idle leader, color-clogged hands) and engine
invariant checks (runaway vitality, hand-limit, duplicate iids, negative
damage).

## Engine bugs found & fixed

1. **Siphon overheal unbounded** — vitality observed at 71. Capped at 20
   (same cap as healing); rulebook docs updated.
2. **First-player advantage 55.8%** — second player now draws a 6th opening
   card. (Residual ~56% persists across cohorts; carried forward.)

## CPU reasoning lapses found & fixed

- **Reaction window never used** (0 plays / 2,208 games): the CPU floated
  ALL location essence every main phase, so as defender it had nothing to
  spend. Now taps-to-pay per spell and invokes Quick removal / Ambush units
  in the reaction window (pointed at the biggest attacker).
- **Worn charms never re-bonded** (0 → 3,355 rebonds/suite).
- **Died to lethal holding ready guards**: now chump-guards and gang-guards
  (extra guards soak Overrun spill) when facing lethal; threat model now
  counts Doublestrike twice and Overrun spill-through.
- **Removal held forever** vs empty boards (anyTarget damage now goes face
  late); **suicide attacks** into ready Venomous guards avoided.
- Residual `tookGuardableLethal` ≈ 1% of games is metric approximation
  (assumes perfect hindsight reallocation), not a live lapse.

## Keywords

- **Structural fix (the big one)**: keyword cost weights fed the unit STAT
  budget (budget = 2×total incl. surcharge), so keywords were free stats.
  Quickstrike carriers sat at 79.6% win, Alert 78%, Overrun 69%, Reckless
  69%. Stat budget now excludes the surcharge.
- Weights retuned over three passes (pure surcharge):
  Overrun/Quickstrike 2→3, Alert 2→3 then →2, Venomous 3→2 (weak once
  stats stopped scaling), Reckless 2→1, Siphon 2→1 (weak post-cap),
  Swarmproof 1 (held), Skywatch 1→0, Warded 2→0, Ambush 1 (held, healthy
  once the CPU used it), Doublestrike 4→3, Unbreakable 4→6 (67-74% in both
  post-fix runs), Immobile -3→-2 (walls got better once the CPU guards).
- **No keyword removed**: Ambush (38.5% pre-fix) recovered to ~50-59% once
  the CPU actually used the reaction window — it was a CPU gap, not a
  keyword flaw. **No new keyword added**: the pool's problem was carrier
  distribution, not vocabulary (see colors).
- **Carrier-win metric is deck-cohort-confounded** (±10pt swings on a fresh
  seed). Next pass: archetype-normalized keyword deltas before further
  keyword levers.

## Colors / game mechanics

- Pre-fix: Ember 70.4% / Gale 69.7% vs Tide 33.6% / Root 36.8% — aggro
  colors owned every strong keyword and the free-stats bug amplified them.
  Post-fix runs put all seven colors in a ~36-59% band that reorders by
  seed (cohort noise dominates).
- **Aerial had ONE carrier in 292 cards**, starving the Aerial/Skywatch
  guard subsystem. Tide is now an Aerial color; Root gains Overrun.
- Win conditions healthy: ~70-86% vitality kills, rest deck-out; avg game
  ~19-23 turns; zero turn-limit draws; zero invariant violations post-fix.

## Cards (cost vs ability)

Actioned (+1 total cost; residual > +9pt with >55% played win):
Heart Coral (+21.7pt), Needle Seamstress (78% played), Merfolk Ritual
(74%), Pufferfish Lantern (77%), Clawblade Greatsword (+15.4pt).
NOT actioned despite raw residuals: Porcelain Lobster / Slate-Scaled
Serpent / Dr. Aries (high residual but sub-43% absolute win — deck-quality
artifact, the standing "artifact, not outlier" caution); Micro-Drone
Immolation / Sandstorm Effigy / Bound Leviathan (sub-15% played win with
sub-15% deck baseline — pure cohort noise).

## Carried forward for next pass

1. **First-player edge** — the +1 card didn't visibly move ~56%; consider a
   turn-1 clash skip or measure with paired-seed A/B (same decks, swapped
   seats) to cut cohort noise.
2. **Archetype-normalized keyword deltas** — current carrier-win metric is
   too cohort-confounded for further keyword levers.
3. **Re-read the five +1-cost cards** after a fresh run.
4. **Unbreakable** at weight 6 — first read on whether the premium price
   settles its 67-74% band.
5. **Slow events** skewed negative-residual pre-fix — re-check whether the
   keyword/stat rework resolved it before touching event values.
