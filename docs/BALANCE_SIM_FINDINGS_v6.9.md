# Balance & Sim Findings — v6.9 (July 2026)

Latest CPU-vs-CPU balance pass. Supersedes the v6.6 and v6.7 findings docs,
both deleted this pass (only the newest sim doc is kept).
Raw report: `docs/sim-runs/` (latest JSON only; `.gitignore`d).

**Runs:** `npx tsx scripts/simulate-v5.ts 6 32 1337` (cohort A) and
`... 6 32 1337 42` (cohort B) — 5,952 games each, 32 random archetype decks,
same game seed, two independent deck cohorts. **Invariant violations: 0** on
both, before and after every change in this pass.

Same bar as v6.6/v6.7: a card or kit action only ships if its outlier's
Wilson 95% interval excludes its own in-deck baseline **and** it reproduces
with the same sign in both cohorts. Unlike the last two passes, that bar
admitted a lot this time — because this pass also found that the pool the
sims were measuring was not the pool players were playing.

---

## 1. The pool was NOT the live pool (carry-forward #0, and the reason to
   re-verify rather than re-assert)

Every findings doc since v6.2 has asserted parity between the live Supabase
catalog and the bundled `generated-cards.ts` that the sims run on. v6.7
recorded "identical digests, 292/292." **That was wrong.** Re-derived
field-for-field this pass against `public.cards`, ten cards disagreed:

| cards.rarity (server) | template.rarity (client) | bundled / sims | cards |
|---|---|---|---|
| Ultra-Rare | **Mythic** | Mythic | `absolute_eruption`, `apex_nanite_shinobi`, `avatar_of_the_abyss`, `crimson_vector_commander`, `spectral_leviathan`, `submerged_starfall` |
| **Mythic** | Full-Art | Mythic | `astral_shoal`, `chrysalis_of_the_departed`, `fayes_true_face`, `void_mother` |

The v6.8 rarity migration ("video cards to Mythic, Full-Art above
Ultra-Rare") was applied to the `template` jsonb for six cards and to the
`rarity` column for a different four, and finished neither. The two
consequences are different and both bad:

- **Four cards had different mechanics live than in every sim.** A card's
  cost, stats, keywords and abilities are hashed from `id|type|rarity`
  (`seedOf` in `cardpool.ts`), so `astral_shoal` and the three other video
  cards printed as Full-Art cards in the live client and as Mythic cards in
  every balance run. Nothing measured here applied to them.
- **Six cards were priced a full tier too cheap by the economy.** Every
  server RPC reads the `rarity` **column** — pack odds
  (`random_card_of_rarity`), quicksell (`card_sell_price`: 800 vs 3000),
  deck copy caps (`rarity_copy_cap`, via `save_deck`), daily bounties and
  serialized supply all treated three of the eight Leaders as Ultra-Rare
  while the client printed them Mythic.

**Actioned:** both columns synced to Mythic for all ten. Live template
digest and bundled digest now match exactly
(`4263b51a7e754cf485667d2da1e4e710`, 292/292), so this pass — for the first
time since v6.2 — genuinely ran over the live pool. No player inventory
migration was needed: `player_cards` stores no rarity of its own, so the
corrected tier flows through to owned copies, prices and caps automatically.
The `decks` table was empty, so no saved deck violated the tightened
Mythic 1-copy cap.

**Actioned:** `scripts/verify-pool.ts` (`npm run verify:pool`) now diffs all
three sources and exits non-zero on any drift, so this class of failure
cannot go unnoticed again. The old check could not have caught it — it
compared the bundled catalog against itself.

---

## 2. New content: one keyword per Essence Type, and two new effect actions

| Essence Type | Keyword | Text | Weight |
|---|---|---|---|
| Ember | **Wildfire** | When this unit dies, deal 2 damage to the enemy player. | 2 |
| Tide | **Tidecaller** | Whenever this unit deals clash damage, Deal a card. | 3 |
| Root | **Thriving** | At your Dawn, this unit gets +1/+1 permanently. | 3 |
| Gale | **Nimble** | Can only be guarded by units with less Might. | 3 |
| Light | **Radiant** | At your Dawn, restore 1 Vitality. | 1 |
| Shadow | **Withering** | Clash damage this deals to a unit permanently reduces its Grit by 1. | 2 |
| Void | **Entropic** | At your Dusk, the enemy erodes 1. | 1 |

Plus two new effect actions — **exhaust** (tap an enemy unit) and **weaken**
(-X/-X, permanent) — woven into each colour's ability vocabulary via
`newThemedEffect`.

**Churn control.** Appending to `KEYWORDS_OF_COLOR` would have re-rolled the
keyword of every card in the pool (`pick()` indexes modulo list length) and
invalidated all 86 per-card balance adjustments at a stroke. The new content
is instead gated behind its own salted rolls (`newkw`, `newkw2`, `newfx-*`),
substituting rather than adding. Measured result: **59 of 292 cards
re-print** (10 cost changes, 1 stat change, 25 keyword changes), and only
**4 of 86 tuned cards** were touched. 25 carriers across all seven keywords,
23 cards carrying a new action — every new keyword is printed somewhere,
verified by test.

**Debut health** (archetype-normalized delta, both cohorts):

| keyword | A | B |
|---|---|---|
| Wildfire | +4.4 (n=1012) | +1.1 (n=791) |
| Radiant | +6.5 (n=816) | +3.5 (n=239) |
| Nimble | — (n=0) | +3.2 (n=673) |
| Entropic | +6.0 (n=205) | -3.1 (n=247) |
| Thriving | -24.8 (n=271) | +12.9 (n=263) |

Nothing clears the two-cohort gate, which on a debut is the desired result —
the initial weights priced the new text roughly correctly. Thriving's
±24-point sign flip at n≈270 is the classic small-n cohort signature (same
pattern v6.6 diagnosed for Sacred and Resonant), **not** evidence of a
mispriced keyword. Watch, do not act.

`boneplate_sentinel`'s v6.7 `+1` is **retired**, not carried: that nerf was
earned specifically as "a Venomous cost-5 Unit," and the card now prints as
a Withering cost-5 Unit. Adjustments do not outlive the property they were
measured against.

---

## 3. Engine correctness: blocked-is-blocked (a live exploit)

Found by adversarial testing, not by the sims — which is why the new
`edgecases.test.ts` suite exists.

`resolveClash` derived "was this attacker ever guarded?" from
`clash.guards` **at resolution time**. But `stateBasedChecks` prunes dead
guards out of that map. So if an attacker's only blocker left the field
between the guard step and damage, the attacker read as *never guarded* and
hit the defending player's face for full Might.

The reaction window makes that trivially exploitable: **attack, let the
opponent block with their biggest body, then kill your own blocker with a
Quick removal spell and the attack lands unblocked anyway.** Confirmed in a
test (a 6/6 attacker blocked by a 1/8 wall dealt 6 to the face).

Fixed by snapshotting the blocked set at `declareGuards` time
(`ClashState.guardedOnce`). Blocked is blocked; only Overrun spills, and
only the excess past what its guards actually absorbed. Rulebook §6 now
states this explicitly.

Also hardened: `runDusk` clears a stale clash object, which would otherwise
freeze the next player's combat outright (`declareAttackers` refuses while
`clash` is set).

---

## 4. Leader kits: both ends of the spread, finally actioned

The spread had a persistent top **and** a persistent bottom, and only the
top had ever had a lever.

### Nerfs (both topped the spread in both cohorts)

**Avatar of the Abyss** — 65.5% / 76.1%, first in both cohorts for a third
consecutive pass. v6.7's carry-forward asked for evidence of a *specific*
over-tuned lever before a third nerf shipped. The kit diagnostics supply it:
its win rate **climbs** with game length in both cohorts (72.6% and 87.1%
past turn 30) and it activates an ability **10.2 / 9.0 times per game**, the
most of any Leader by a clear margin, on an unconditional Shatter. Resolve 6
against a `-3` bought two full removals per tank with the `+1` builder
refilling it. **Minus resolve cost -3 → -4.** Result: 59.6% / 71.6%.

**Crimson Vector Commander** — v6.7's carry-forward #2 coming due. That doc
applied the Commander strip, noted cohort B still read it on top, and named
the exact next lever to pull after one watch pass. This is that pass, and it
finished first in both cohorts (62.6% / 76.5%) with B having *climbed*. Kit
profile unchanged and unambiguous: 87.9-88.6% at ≤10 turns collapsing to
23-30% past turn 30 — a tempo spike fed by an Ember `-1: 2 damage to any
target` that Resolve 6 pays for six times over. **Minus resolve cost -1 →
-2.** Result: 56.3% / 70.3%.

### Buffs (both finished last in both cohorts — a first for this project)

Nothing existed to act on the bottom of the spread, so this pass adds
`LEADER_PLUS_ABILITY_OVERRIDE`, the buff-side counterpart to the two nerf
levers.

**Ethereal Sea Witch** — 35.2% / 25.2%, last in both cohorts, the widest
deficit any Leader has posted, and never actioned in nine passes. The
diagnostics rule out misplay: it invokes earliest of any Leader (turn
4.6/4.7) and activates an ability 8.6-8.9 times per game. It is using its
kit constantly and losing anyway. The cause is structural — its Tide/Light
identity rolled `-1: Deal a card` **and** `+1: Restore 2 Vitality`, the only
kit in the pool with no board interaction whatsoever, in a game where 94-96%
of wins come from reducing Vitality. **Plus ability → `+1: Exhaust a target
enemy unit`** (the dead half; 2 Vitality a turn is close to irrelevant at
these win rates). Tide's own tempo identity, and on a resolve-*building*
ability it is a soft answer rather than removal — the unit recovers at its
controller's next Dawn. Result: 39.4% / 32.1%.

**Ruin-Walker Overseer** — 42.8% / 32.0%, below baseline in both, also never
actioned, same structural failure in a different shape: its Root/Void roll
produced `-2: A friendly unit gets +2/+2` **and** `+1: A friendly unit gets
+1/+1` — two abilities that are the *same effect at two sizes*, so there is
nothing to choose between them and no answer to anything. **Plus ability →
`+1: A target enemy unit gets -1/-1`**, taking the Void half of its
identity. Result: 53.3% / 36.6%.

### Leader spread, before → after

| Leader | A before | A after | B before | B after |
|---|---|---|---|---|
| Avatar of the Abyss | 65.5 | **59.6** | 76.1 | **71.9** |
| Crimson Vector Commander | 58.7 | **56.3** | 68.4 | **70.3** |
| Ruin-Walker Overseer | 42.8 | **53.3** | 32.0 | **36.6** |
| Legendary Diver | 46.8 | 48.9 | 58.3 | 59.5 |
| Mer-King | 48.4 | 48.8 | 57.3 | 52.3 |
| Sovereign of the Dying Star | 41.8 | 39.3 | 50.9 | 47.3 |
| Ethereal Sea Witch | 35.2 | **39.4** | 25.2 | **32.1** |
| Apex Nanite Shinobi | 28.5 | 28.0 | 44.0 | 44.3 |

Cohort A's spread narrows from 37.0 points to 31.6; cohort B's from 50.9 to
39.8. Every intended direction held in both cohorts, and no buff overshot
into the top half.

---

## 5. Keyword health

**Doublestrike 4 → 5.** Positive in both cohorts for a *third* consecutive
pass (+6.5/+12.4 in v6.7, +7.6/+7.9 pre-change here). v6.7 said one more
confirming pass before actioning; this was it. Post-change it still reads
+8.0/+7.2 — the single point did not settle it. **Carried forward** for a
second point rather than stacking two in one pass.

**Resonant 2 → 0.** A three-pass repeat offender: negative in both cohorts
before the cut (-12.2 / -14.9) and *still* negative in both after 2 → 1
(-11.9 / -20.3), because at weight 1 the surcharge still rounds up to a full
point of cost. Taken to 0 on the established repeat-offender precedent
(Surge in v6.2, Siphon/Skywatch before it). Post-change: **-4.3 / +1.1** —
resolved, and out of the flagged list.

Sacred (+17.7 A, no carriers in B), Regenerate (-11.8/+6.4) and Swarmproof
(-6.9/+4.5) all continue the single-cohort / sign-flipping pattern
previously diagnosed as archetype-composition noise. No action.

---

## 6. Card actions

| card | A | B | action |
|---|---|---|---|
| `galleon_shipwreck` | +14.4 | +12.8 | **+1 cost** (new) |
| `resonant_shuriken` | +16.5 | +17.3 | **+1 → +2 cost** |
| `abyssal_pathway` | +13.1 | +11.0 | **+2 → +3 cost** |
| `spectral_leviathan` | +9.7 | +10.2 | **-2 stat budget** (at the cost cap) |
| `kunoichi_of_the_magma_rings` | +9.7 | +10.5 | **-2 stat budget** (at the cost cap) |

`galleon_shipwreck` is the standout printing error: a **cost-1** Sanctum
that ramps *and* sweeps every enemy unit for 1 every Dusk.

`kunoichi_of_the_magma_rings` re-confirmed the cost-cap failure mode the
v6.6 doc described. It prints at total cost 7 (base 6 + Reckless surcharge
1), so `mapUnit`'s 1..7 clamp swallows any raise: a `+2` trial re-ran
**byte-identical** to `+1` (+9.7 / +10.5, same residuals). Its `COST_ADJUST`
entry is kept only as a signpost with that verification recorded; the actual
nerf went through `STAT_ADJUST`, the only live lever at the ceiling.

After the changes, `galleon_shipwreck` (+13.4/+10.3) and `resonant_shuriken`
(+12.9/+11.3) still reproduce. Both already took a point this pass, so they
**carry forward** rather than stacking a second — the v6.6 doc's central
lesson about chasing a residual with stacked points.

---

## 7. CPU reasoning lapses

The v6.6/v6.7 fixes all hold: `missedLethal` 0, `wellspringMisplay` 0,
`leaderShatterBlunder` 0, `colorCloggedGames` 0, `keptColorDeadHand` 0 in
both cohorts.

**`wastedEssenceWithPlay` fell 2,689 / 3,353 → 902 / 998 — a 3x
improvement**, and it was not the target of a heuristic fix. It fell out of
teaching the curve about the new actions: `needsEnemyUnit` in
`invokePriority` and the `exhaust`/`weaken` valuations in
`runLeaderAbility`. The cause was structural rather than heuristic — cards
whose effects the priority function had no opinion about scored the default
and sat in hand behind essence that then expired. Worth remembering the next
time a new action lands: **every new effect action needs a priority
opinion, or it becomes a dead-essence lapse.**

Also improved, unprompted: `guardDiesForNothing` 10,280/10,754 →
8,902/8,406, and `charmOnDoomedUnit` 2,353/2,527 → 1,908/2,069.

Remaining, none clearing the action bar:

- `venomousSuicideBlunder`: 169 / 94, against 1,524 / 882 *deliberate*
  venomous attacks — a ~10% blunder rate on a play that is usually correct.
- `tookGuardableLethal`: 188 / 144, tighter than v6.7's 103/349 split.
- `guardDiesForNothingDiscretionary`: 129 / 102 out of ~8,500 — guard-trade
  quality stays resolved.
- `removalOnNonThreat`: 149 (A) / 73 (B) — up in A, flat in B, no signal.
- `charmOnDoomedUnit` remains the largest counter at ~2,000. Improved 19%
  this pass without being targeted; flat for four passes before that.
- Reservation waste: 29.2% / 27.3%, essentially flat since v6.6's 32.4%.

---

## 8. Headline results (post-change)

| Metric | A | B | Read |
|---|---|---|---|
| P1 win rate | 47.0% | 45.9% | Flat vs v6.7 (47.4 / 45.3) — first-player fix holds. |
| Seat-swap first-seat | 44.1% | 45.9% | Slightly under even; watch. |
| Avg game length | 19.4 | 18.8 | Down ~2 turns vs v6.7 (21.4 / 19.9). |
| Vitality wins | 94.1% | 96.0% | Up vs v6.7 (88.9 / 94.4). |
| Clashes/game | 8.59 | 8.42 | Flat vs v6.7 (8.74). |
| Comeback rate | 29.2% | 26.7% | Flat-to-up vs v6.7 (26.3 / 23.7). |
| Pool coverage | 58.1% | 59.9% | Flat vs v6.7 (62.3 / 63.0). |
| Invariant violations | 0 | 0 | |

---

## Carry-forward items

1. **Doublestrike** — actioned 4 → 5 this pass and *still* +8.0 / +7.2 in
   both cohorts. Second point next pass. Four consecutive confirming passes
   makes this the most robust keyword signal on the board.
2. **`galleon_shipwreck` / `resonant_shuriken`** — took one point each,
   both still reproduce (+13.4/+10.3, +12.9/+11.3). One more point each.
3. **Avatar of the Abyss / Crimson Vector Commander** — still the top two in
   both cohorts after this pass's nerfs. Both moved the right way; neither
   should take a second lever in the same pass. Re-check next pass.
4. **Apex Nanite Shinobi** — 28.0% (A) vs 44.3% (B), the widest cohort
   disagreement of any Leader, at only n=372 in A. Needs a pinned-deck run
   to separate kit strength from cohort composition before any action.
5. **Ethereal Sea Witch / Ruin-Walker Overseer** — both improved in both
   cohorts but both remain below baseline in cohort B (32.1 / 36.6). The new
   plus-ability lever works; give it a pass to settle before a second point.
6. **Thriving** — ±24-point cohort sign flip at n≈270. Pure small-n noise on
   current evidence, but it is the largest single-cohort swing in the table.
   Re-read next pass with more carriers.
7. **Reaction-window content** — unchanged and still unactioned. Ethereal
   Sea Witch and Ruin-Walker Overseer have **zero** AI-candidate reaction
   cards in their own colours; four more Leaders have exactly one. A
   content/design question (print more Quick removal and Ambush support in
   the starved colours, or widen `isReactionCandidate`'s cost-≤3 filter),
   not a heuristic tweak.
8. **`mist_ghost_ship`** — no longer reproducing this pass; dropped from the
   carry-forward list.

## Closed this pass

- ~~Live-vs-sim pool drift~~ — ten cards resynced, all three sources now
  agree, and `npm run verify:pool` guards it permanently.
- ~~Blocked-is-blocked~~ — real exploit, fixed and covered by tests.
- ~~Resonant~~ — three-pass repeat offender, taken to 0, now resolved in
  both cohorts.
- ~~Leader spread has no buff lever~~ — `LEADER_PLUS_ABILITY_OVERRIDE`
  added and validated on the two worst Leaders.
- ~~Crimson Vector Commander carry-forward #2~~ — watch pass done, named
  lever pulled, moved in both cohorts.
- ~~`boneplate_sentinel`~~ — adjustment retired; the printing it was
  measured against no longer exists.
