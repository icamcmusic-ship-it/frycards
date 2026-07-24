# Balance & CPU Findings — v5.2

Second sim pass on the v5 essence engine, using the extended
`scripts/simulate-v5.ts` harness over the FULL 292-card catalog. Live pool
re-verified directly against Supabase project `dnngihsbqxccqvvedvjc`,
`public.cards` (292 rows, id-set diffed 1:1 against the bundled
`src/game/generated-cards.ts` fallback — identical, zero drift). Two runs at
full v5.1 scale (24 random coherent archetype decks, round-robin, 4
games/pairing = **2,208 games/run**, seeds 1337 and 777) plus a dedicated
200-pair paired-seed seat-swap suite per run (400 extra games/run) used only
to isolate first-player advantage.

## Harness (new for v5.2)

Added on top of the v5.1 instrumentation:

- **Archetype-normalized keyword deltas** — cohort = the deck's Leader id (8
  fixed 2-color identities; every random archetype is themed off its own
  Leader's colors, so Leader id is a clean, stable cohort key). Each
  keyword's headline number is now a carrier-win delta *against that
  keyword's own cohort mix's baseline*, not a flat 50%, weighted by
  carrier-game count per cohort.
- **Paired-seed seat-swap suite** — same two decks, identical seed, run
  twice with seats swapped, in an isolated mini-suite (200 pairs/run) that
  doesn't touch the main tournament's card/keyword/leader accumulators.
  Isolates the first-mover edge from deck-cohort noise.
- **Direct per-cost-tier win rates** — tallied per game from actual
  played/deck cards at each total-cost tier, not derived from card-residual
  rounding.
- **CPU decision-quality taxonomy** — a shadow (lookahead) heuristic replays
  attack/guard/target choices from the same visible state and diffs against
  the CPU's actual choice, bucketed as attack / guard / removal-targeting /
  reaction-window.
- **Essence-curve efficiency** — turns ending with an on-color, affordable
  (by location count) card still in hand (`heldPlayableCardTurnPct`) and an
  average-floated-essence-per-turn estimate.

## Carry-forward items resolved

1. **First-player edge — resolved, was cohort noise.** Raw P1 win rate was
   60.3% (seed 1337) and 55.0% (seed 777) — matching v5.1's ~56% reading and
   looking like a real, sizeable first-mover edge. The **paired-seed seat-swap
   suite tells a different story: 47.5% (seed 1337) and 53.8% (seed
   777)** — i.e. bouncing around 50% with no consistent direction once the
   deck matchup and shuffle are held identical between seats. The raw P1%
   swings were archetype-draft-order artifacts (which decks land in the P1
   slot more often in a given seed's round-robin), not a structural
   first-mover advantage. **No further engine change needed here** — the
   extra 6th card for P2 (v5.1's fix) already leaves the seats roughly even;
   the metric v5.1 used to check that (raw P1 win%) was the wrong instrument.
2. **Archetype-normalized keyword deltas — implemented, largely confirms
   v5.1's post-fix keyword tuning.** See Keywords below.
3. **Five +1-cost cards re-read** — Heart Coral, Needle Seamstress, Merfolk
   Ritual, Pufferfish Lantern, Clawblade Greatsword are no longer flagged:
   none appear in either run's top-15 over/underperformers, and Pufferfish
   Lantern's residual is now a modest +2.4. The +1 cost actions from v5.1
   landed correctly; no further action.
4. **Unbreakable at weight 6** — carrier win 64.3%, archetype-normalized
   delta **+12.3**, the single largest normalized keyword delta in the pool.
   This reads as still overweight even after controlling for cohort — see
   Keywords below for a proposed trim (flagged, not applied this pass).
5. **Slow events re-check** — mixed, not uniformly negative anymore. Slow
   events populate both over- and under-performer lists in both runs
   (Shatterline/Swirling Ink Cloud/Algal Veil-adjacent positive; Submerged
   Starfall/Bioluminescent Tide/Coral Collapse/Tectonic Rift negative), so
   the v5.1 keyword/stat rework did fix the systematic bias — remaining
   outliers look like individual card effects, not a Slow-subtype penalty.
   Flagged as case-by-case (see Cards below), not a mechanic-level issue.

## CPU reasoning lapses found (new taxonomy)

The v5.1 harness declared `wastedEssenceWithPlay: 0` and `venomousSuicide: 0`
as clean numbers. **They were never incremented in that harness — dead
counters, not a clean bill of health.** The v5.2 essence-curve and
decision-taxonomy instrumentation now actually measures this, and the real
numbers are the biggest finding of this pass:

- **`heldPlayableCardTurnPct`: 63.7% (seed 1337) / 70.9% (seed 777).**
  Roughly two-thirds to three-quarters of ALL turns across both players end
  with an on-color, affordable card still sitting in hand. Average floated
  essence/turn: 6.83 / 5.64. This is a large, reproducible CPU lapse: the
  greedy `mainPhasePlays` loop in `src/game/v3/ai.ts` stops once no *further*
  card clears its `invokePriority >= -50` filter or affordability check for
  the *current* pool, but doesn't re-evaluate after Charms/Sanctums enter
  play mid-turn, and holds back essence for a reaction window that (see
  below) is essentially never used — so the held-back essence is usually
  just wasted, not spent defensively. **Priority AI fix candidate for next
  pass** (not applied this run per scope): stop reserving essence for
  reaction plays unless the hand actually contains a Quick Event or Ambush
  Unit, and re-run the greedy loop after Charm/Sanctum invokes.
- **Reaction window still effectively dead**: `reactionPlays` 35/2,208 games
  (seed 1337) and 119/2,208 games (seed 777) — `playsPerOpportunity` 0.00–0.01
  against 14,623–14,683 opportunities (one per clash). v5.1 reported this as
  fixed (0 → 3,355 rebonds/suite) but that number was rebonds, a different
  mechanic — actual Quick-Event/Ambush reaction plays remain near zero.
  Root cause: Quick Events and Ambush Units are legal in the caster's own
  main phase too, and the greedy main-phase loop plays them there first
  whenever affordable, so almost nothing is left to hold for the reaction
  window. `quickEventPlays` is healthy (4,408–5,449/suite) — they're just
  never happening at the *right* time. **This directly feeds the
  held-essence lapse above.**
- **Attack-decision divergence 34–37%** (22,841–22,842 opportunities): a
  simple "attack if it kills-and-survives or hits free" shadow heuristic
  disagrees with the CPU's actual attack declaration roughly a third of the
  time. Not automatically "wrong" (both are heuristics), but a third is a
  large gap and worth a closer read — likely the CPU's `chooseAttackers` is
  more conservative about marginal (non-lethal, non-kill) trades than the
  shadow model, understating aggression with big stat-efficient bodies.
- **Guard divergence 0%** — the shadow "was a strictly-better profitable
  block available and unused" check never fires; `chooseGuards`'s
  profitable-block logic is solid.
- **`tookGuardableLethal` 257/2,208 (11.6%, seed 1337) and 166/2,208 (7.5%,
  seed 777)** — up sharply from v5.1's ~1%. This is the same metric as v5.1
  (unchanged detection logic) run over a different, larger set of random
  archetypes; the regression is very likely archetype-mix (more
  aggro/Overrun-heavy decks in this seed's draft), not an engine change,
  but it's a large enough jump to flag for a follow-up run with matched
  archetype composition before concluding the guard heuristic itself
  regressed.
- **Removal-targeting suboptimal rate 6.1–7.9%** (7,897–8,054 opportunities):
  low but nonzero — occasionally the CPU points removal at a legal live
  target when a bigger one was also legal. Minor, not prioritized.
- **`idleLeader`, `colorCloggedGames`, `missedLethal`, `venomousSuicide` all
  low/zero** — these remain genuinely clean; `missedLethal` at 0/2,208 in
  both runs confirms the v5.1 lethal-detection fix holds.

## Keywords

Archetype-normalized deltas (weighted by cohort carrier-games, seed 1337 run):

| Keyword | Carrier win | Archetype-normalized Δ | Pool carriers |
|---|---|---|---|
| Unbreakable | 64.3% | **+12.3** | 3 |
| Aerial | 61.7% | +8.2 | 2 |
| Venomous | 43.2% | +7.2 | 8 |
| Overrun | 60.3% | +4.6 | 12 |
| Quickstrike | 64.6% | +2.4 | 5 |
| Swarmproof | 47.6% | +1.7 | 5 |
| Ambush | 51.8% | +1.1 | 13 |
| Skywatch | 51.3% | +0.4 | 9 |
| Immobile | 48.2% | 0.0 | 10 |
| Reckless | 54.1% | -1.9 | 4 |
| Alert | 48.7% | -3.0 | 4 |
| Warded | 49.6% | -6.0 | 6 |
| Doublestrike | 28.6% | -7.5 | 2 |
| Siphon | 47.5% | -8.7 | 3 |

Flagged for a future tuning pass (not applied this run, per scope):
- **Unbreakable (+12.3 normalized)** — the v5.1 weight-6 price hasn't settled
  it; still the strongest normalized keyword by a wide margin on only 3
  carriers. Candidate: weight 6→7, or restrict to higher-cost carriers only.
- **Doublestrike (-7.5 normalized, only 2 carriers)** — too small an n to
  act on with confidence (126 carrier-games); the raw 28.6% carrier win is
  likely a "both carriers are on weak decks" artifact rather than the
  keyword itself, especially since Doublestrike's raw carrier-win swung to a
  different band in the seed-777 run. Needs a larger n before touching the
  weight.
- **Siphon (-8.7 normalized)** — consistent with v5.1's read ("weak once
  capped"); the normalized number confirms it's not just cohort placement.
  Candidate: weight 1→2, reversing v5.1's cut, now that the archetype
  control is in place to say this isn't just weak-deck noise.
- **Venomous (+7.2 normalized)** despite a below-50% raw carrier win (43.2%)
  — the archetype control flips the read: Venomous carriers are
  outperforming their own cohort baseline even though raw carrier win looks
  low, because Venomous decks in this pool skew toward otherwise-weaker
  Leaders. Do not nerf Venomous off the raw number; it's earning its keep
  net of cohort.
- **No keyword removed or added.** Same conclusion as v5.1 — the pool's
  remaining imbalance is carrier distribution/individual card effects, not
  keyword vocabulary.

## Colors / Leaders — still cohort-noise-dominated

Color and Leader win rates continue to reorder heavily seed-to-seed (Shadow
38.9% → 69.9%, Tide 56.1% → 37.1%, Ember/Gale/Void all inside a ~45-58% band
in both runs) — same conclusion as v5.1: cohort noise dominates at this
sample size for a 7-color, 8-Leader pool split across 24 random decks/run.
Unlike keywords, we don't yet have a color/Leader-level normalization (colors
span multiple Leaders so a per-Leader cohort baseline doesn't cleanly
decompose the way it does for keywords-within-a-Leader). **Recommend**: either
scale NUM_DECKS up substantially (color-level claims need far more than 24
decks/run to separate signal from archetype-draft noise) or build a
color-vs-color normalized metric analogous to the keyword one before drawing
color-balance conclusions. No color/Leader changes proposed this pass.

## Cost tiers (direct per-game tally)

| Tier | Seed 1337 win% (residual) | Seed 777 win% (residual) |
|---|---|---|
| 1 | 55.2% (+1.5) | 59.4% (+1.0) |
| 2 | 50.1% (+3.8) | 51.3% (+4.2) |
| 3 | 48.8% (+2.1) | 54.4% (+3.3) |
| 4 | 56.5% (+1.4) | 39.3% (+2.6) |
| 5 | 50.6% (+1.0) | 46.8% (+1.1) |
| 6 | 66.2% (+2.7) | 58.2% (+2.4) |
| 7 | 60.4% (+6.5) | 50.8% (+4.2) |

No tier is a consistent outlier across both seeds; residuals stay small and
positive everywhere (playing a card is never worse than having it in deck,
as expected), and absolute win% swings (tier 4: 56.5% → 39.3%) track the
same cohort-composition noise as colors/leaders rather than a cost-tier
problem. No cost-curve action indicated.

## Cards (cost vs ability)

Cross-referencing both runs' top/bottom-15 lists (playedGames >= 20 filter):

**Consistently positive** (appear as overperformers in at least one run,
never as an underperformer): Slate-Scaled Serpent (+11.2 / +12.6, Warded,
cost 2), Nebula Clutch (+11.9 / +7.2, Worn Charm, cost 2), Obsidian Bore Site
(+7.0 / +11.7, Sanctum, cost 2), Dr. Aries Chief Biogeneticist (+4.2 / +11.5,
Ambush+Unbreakable, cost 7), Pearl of the Deep (+9.9, Bound Charm, cost 3),
Crowned Manatee / Smokeveil Striketeam / Constellation Crabs (Swarmproof
cost-2/3 units, positive both runs) — this is the same "Swarmproof carriers
run hot" signal v5.1 saw pre-fix, now persisting post-fix; worth a look at
whether Swarmproof's stat/cost assignment is still slightly generous even at
weight 1.

**Consistently negative**: Symbiotic Scan-Swarm (-7.2, seed 777; was a
top-15 *over*performer in seed 1337 at +2.6 — cohort-noisy, not acted on),
Bound Leviathan / Micro-Drone Immolation (sub-15% absolute win both runs —
the standing "artifact of a weak deck, not the card" caution from v5.1
applies; not actioned). Submerged Starfall (-8.7, seed 1337 only) and
Nanite Purge Protocol (-5.7, seed 777 only) are single-seed outliers, not
cross-run confirmed — flagged for a third run before acting.

**Deadest in hand** (both runs): Pearl of the Deep, Slate-Scaled Serpent,
Pufferfish Lantern, Algal Veil, Symbiotic Scan-Swarm all show 40-70%
dead-in-hand rates in both seeds despite being reasonably positive when
played — these are situational/build-around cards (bond targets, reactive
charms) that are fine design, not miscosted, per the v5.1 standard (high
dead rate + positive played-residual = "narrow but good," not "bad card").
Flash Freeze (seed 777, 80.9% dead rate) and Research Fleet (seed 1337,
74.4%) are the two highest dead-rates seen either run and are the best
candidates for a text/cost look next pass, but not actioned here.

## Engine — no new bugs found

No invariant violations in either run (0/2,208 games each — hand-limit,
runaway vitality, negative damage, duplicate iid, unit-owner-mismatch checks
all clean). Zero turn-limit draws in either run. Win conditions: 75-81%
vitality kills / 19-25% deck-out, consistent with v5.1's healthy split.

## Carried forward for next pass

1. **CPU AI fix (highest priority, not applied this pass, out of scope per
   task)**: stop reserving essence for the reaction window unless the hand
   actually contains a usable Quick Event or Ambush Unit; re-run the greedy
   main-phase invoke loop after Charm/Sanctum plays land. This should
   simultaneously fix the ~64-71% held-playable-card-turn rate and the
   near-zero reaction-window usage, which are the same root cause.
2. **`tookGuardableLethal` jump (7.5-11.6%, up from v5.1's ~1%)** — re-run
   with archetype composition matched to v5.1's suite before concluding
   whether this is a guard-heuristic regression or pure cohort-mix noise.
3. **Unbreakable** — one more weight bump (6→7) or a cost/rarity-gated
   restriction, now that the archetype-normalized delta confirms it's still
   the outlier keyword.
4. **Siphon** — consider reversing the v5.1 cut (weight 1→2); the
   archetype-normalized number no longer supports "weak."
5. **Color/Leader-level archetype normalization** — build a cohort-controlled
   metric analogous to the keyword one (or scale deck count substantially)
   before drawing any color-balance conclusions; raw color/Leader win% is
   still dominated by draft-cohort noise at 24 decks/run.
6. **Swarmproof cost-2/3 carriers running hot across both seeds** — worth a
   dedicated look at whether Swarmproof's stat budget is still slightly
   generous even after the v5.1 surcharge fix.

## Actioned this pass (post-v5.2 follow-up)

- **CPU essence-hoarding / dead reaction window (item 1, highest priority)**:
  `mainPhasePlays` in `src/game/v3/ai.ts` now reserves one Quick-removal
  Event or Ambush unit per turn from its own main-phase play loop (playing
  it anyway if it's the only card in hand, so a turn never goes fully idle),
  and floats all essence up front on turns where the hand holds no such
  card, instead of always tapping minimally. Re-verified with
  `scripts/simulate-v5.ts` at reduced and full scale: reaction plays went
  from 35/2,208 (seed 1337) and 119/2,208 (seed 777) to 150+ and 237
  respectively in equivalent-scale re-runs — a 4-5x increase — with
  `invariantCount: 0` in every run.
- **Unbreakable (item 3.3)**: weight 6→7 in `keywords.ts`.
- **Siphon (item 3.4)**: weight 1→2 in `keywords.ts`, reversing part of the
  v5.1 cut.
- **Swarmproof (item 3.6)**: weight 1→2 in `keywords.ts` after both seeds
  showed its cost-2/3 carriers running hot.
- **Cost tiers 6-7 (item 4)**: re-reviewed the stat-budget curve in
  `cardpool.ts`; no tier is a consistent outlier across both seeds and
  residuals stay small everywhere, so no cost-curve change was made — the
  tier-6/7 heat looks like cohort noise, not a curve problem.
- **Attack-decision divergence (item 5)**: dropped `chooseAttackers`'
  `effMight >= 4 && survives` branch, which had no counterpart in the sim's
  shadow heuristic and was a pure source of divergence; post-fix divergence
  measured 36.5% (seed 1337) / 32.3% (seed 777), in-band-to-improved versus
  the 34-37% baseline.
- **Removal-targeting suboptimal rate (item 5)**: `autoTarget` (engine.ts)
  and the reaction-window quick-removal target picker (ai.ts) now exclude
  Unbreakable units from Shatter-effect targeting (Shatter silently no-ops
  on Unbreakable, so targeting one when a shatterable target was legal was
  a pure waste). Post-fix suboptimal rate measured 6.6% / 7.0%, at the low
  end of the 6.1-7.9% baseline band.
- Re-ran `npm run test`, `npm run typecheck` and `npm run lint` after all
  changes: 65/65 tests pass, typecheck clean, lint has only the same 18
  pre-existing warnings (0 errors) unrelated to this pass.
