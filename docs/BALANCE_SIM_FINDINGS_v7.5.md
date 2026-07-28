# Balance & Sim Findings — v7.5 (July 2026)

Latest CPU-vs-CPU balance pass. Supersedes the v7.2 findings doc (with its
v7.4 addendum), deleted this pass — only the newest sim doc is kept. Raw
report: `docs/sim-runs/` (latest JSON only; `.gitignore`d).

**Runs:** `npx tsx scripts/simulate-v5.ts 6 32 1337` (cohort A) and
`... 6 32 1337 42` (cohort B) — 5,952 games each, 32 random archetype decks,
same game seed, two independent deck cohorts. **Invariant violations: 0** on
both, before and after every change in this pass, across all eleven trial
pairs run.

Same bar as v6.6-v7.4: a change ships only if it reproduces with the same sign
in both cohorts. This pass is unusual in that its three headline results are
all **negative findings about levers** — two of the three carried-forward items
turned out to have been blocked on a lever that does not work, and finding that
out is what unblocked them.

| Metric | A | B | Read |
|---|---|---|---|
| Leader spread | **25.3** | **23.0** | Was 39.3 / 38.0 at the start of this pass. |
| Void Mother | 71.7 → **55.6** | 72.0 → **56.3** | No longer first in either cohort. |
| Kuro, the Unseen | 32.4 → **37.4** | 34.0 → **38.6** | +5.0 / +4.6, no overshoot. |
| P1 win rate | 45.4% | 46.4% | Flat (was 45.5 / 47.2). |
| Avg game length | 19.8 | 21.0 | Flat. |
| Invariant violations | 0 | 0 | |

(Headline row measured after the Leader and card actions; §5's keyword content
landed after it and is reported there.)

---

## 1. The rest of the Location residual gap — it was the comparator, not a confound

v7.4 shipped the ramp-matched residual and closed with ~+1.7 of
Location/non-Location gap it could not explain, asking whether Locations are
genuinely that much stronger or whether a second confound exists that
length-matching cannot see.

**Neither. The leftover is an artifact of the contrast, not of the metric.**
"non-Location" is a mixture, and about a fifth of it is Events. Split the same
numbers by card type and the correction has in fact landed:

| type | cards | A flat | A ramp | B flat | B ramp |
|---|---|---|---|---|---|
| Unit | 84 | +3.00 | **+3.20** | 81 → +2.89 | **+3.08** |
| Location | 29 | +3.29 | **+3.28** | 32 → +3.48 | **+3.27** |
| Charm | 28 | +2.01 | +2.30 | 25 → +2.43 | +2.66 |
| Event | 27 | -0.89 | **-0.53** | 32 → -0.53 | **-0.71** |

**Location minus Unit: +0.28 → +0.07 (A) and +0.59 → +0.20 (B).** Against the
other permanent that is actually comparable, ramp-matching removes about two
thirds of the type gap and lands the remainder inside noise, in both cohorts.
The metric is no longer type-biased.

What remains is a **permanent-minus-Event** split of +3.57 / +3.75, and it is a
property of the cards rather than of the measurement: a one-shot stops paying
the moment it resolves, a permanent keeps paying. The right response is to read
an Event against the Event row, not to "correct" it away. `seabed_mandala` is
priced that way below.

**Actioned:**

- `metricDiagnostics.residualByType` and `metricDiagnostics.locationMinusUnit`
  are the numbers to read, and the console summary now prints the type table.
  `locationResidualGap` is kept but labelled as the composition artifact it is;
  `locationShareOfTop15` stays as v7.4's cautionary example.
- **The v7.2 blanket "no Location takes another cost point" is LIFTED.**
  Locations price off `topOverperformersRampMatched` like any other permanent.
- Non-finding kept refuted: residual-vs-cost correlation is 0.105 / 0.126,
  near zero under both metrics. "Expensive cards read high" was never the
  mechanism.

### The first cards through the lifted block, and what they measured

| card | before (A / B) | action | after |
|---|---|---|---|
| `cold_fire_volcano` (Loc, 1) | +8.9 / +7.5 | **+1 cost** | +6.1 / +4.5, n held |
| `stone_bubbles` (Loc, 2) | +8.0 / +9.0 | +1 cost, **REVERTED** | +8.9 (A) / under floor (B) |
| `glowing_glyph_tablet` (Charm, 3) | +7.4 / +6.2 | +1 cost, **REVERTED** | under floor in both |
| `amethyst_starfish` (Unit, 5) | +7.8 / +6.3 | +1 cost, **REVERTED** | +7.6 / +7.5, n down 3x |

Three of four cost trials failed the same way, and they make one point worth
recording: **at this pool's curve a single cost point is close to binary rather
than a smooth nerf.** It either does not move the residual at all or it prices
the card out of the format — and a residual measured on a third of the games is
not the same measurement. This is the v7.2 §3 Sacred weight-raise failure
("a nerf that deleted six cards from the draftable pool and moved no win rate")
reproducing card by card under the corrected metric.

So the block lifting is real, and `stone_bubbles` is still not price-responsive
under the corrected metric either — which retires the last reason to think its
number was a measurement problem. Its lever is the Sacred **effect**, exactly as
v7.2 carry-forward #2 said, and that item stays open.

---

## 2. Unbreakable — three levers measured, and the keyword was not the problem

The v7.4 roadmap carried Unbreakable forward because the keyword-level delta
disagreed across cohorts (+4.5 n=183 / +10.6 n=139), and it named
`STAT_ADJUST` as "the only live lever" since all three carriers sit on the cost
cap of 7.

**Per card the signal reproduces cleanly, and the three carriers do not agree
with each other:**

| card | A | B |
|---|---|---|
| `the_wolf_of_wall_street` | +11.4 (n=504) | +16.1 (n=343) |
| `the_pier_side_menace` | +11.9 (n=516) | +11.1 (n=881) |
| `skyborne_skeleton_dragon` | **+3.5** (n=557) | **+2.3** (n=766) |

The keyword's own number was reading their average. Unbreakable is not
uniformly underpriced; two of its three bodies are. That is the v7.2
Doublestrike finding from the other direction, and it means the third carrier
must not be stacked with the other two.

**Then all three levers were measured to exhaustion on the two outliers, and
all three are inert:**

| lever | trial | wolf (A / B) | pier-side (A / B) |
|---|---|---|---|
| `COST_ADJUST` | — | provably a no-op at the cost cap (recorded since v5.3) | |
| `STAT_ADJUST` | -2 → -3 / -3 → -4 | +11.2 / +11.9 | +12.4 / +10.6 |
| `STAT_ADJUST` | -2 → **-5** / -3 → **-6** | +12.2 / +15.6 | +11.7 / +11.4 |
| the keyword itself | bounded to once per turn | +10.4 / +12.0 | +13.0 / +10.3 |

Five and six points of stat trim, plus rewriting the keyword, and neither card
moved. **What moved them was the ability printed beside the keyword:**

| card | printed ability | trimmed to | result |
|---|---|---|---|
| `the_wolf_of_wall_street` | `At Dawn, a target enemy unit gets -2/-2` | `-1/-1` | +11.4 / +16.1 → **+8.2 / +10.6** |
| `the_pier_side_menace` | `enters: deal 2 damage to a target enemy unit` | `1 damage` | +11.9 / +11.1 → **+9.1 / +9.7** |

The Wolf is the clearest: unconditional recurring removal the opponent has no
way to switch off, which is the shape the `LEADER_MINUS_ABILITY_OVERRIDE`
header calls "the strongest kit shape in the game" — printed on a Unit rather
than a Leader, so nothing in the balance table had a lever that could reach it.

**Actioned:** new `UNIT_EFFECT_ADJUST` in `cardpool.ts`, a per-card adjustment
to the magnitude of a Unit's printed ability. It is the third lever, built
because the other two were measured inert, and it is the first thing that has
ever moved either card.

Both carriers are still around +9-10 and are carried forward. The residue is
the 6/6 body that cannot be answered on the turn it lands, and that is the
keyword — see below.

### Unbreakable is now once per turn, and that ships as a rules fix, not as the nerf

> **Unbreakable** — Once per turn, prevent the first effect that would shatter
> this or deal it lethal damage.

Measured as **neutral** on all three carriers, and that measurement is why it
ships rather than why it does not: an unconditional "can never be removed by
any means at any price" is a design hole — it is the only text in the game with
no answer — and the harness has now proved that these cards' win rates do not
rest on it. Bounding it costs nothing measurable and gives removal a line of
play. The damage the save absorbs is **prevented** rather than left marked, or
the state-based check would re-fire on the same marked damage a tick later and
kill the unit through a shield it had just paid for. The charge recharges at
every Dawn for both players, so a unit gets one save per turn of the game
rather than one per turn cycle.

Note `KEYWORD_COST['Unbreakable']` is left at 7. The surcharge is not collected
on any of the three carriers anyway — they all print at the cap — so lowering
it would be a no-op dressed up as a correction.

---

## 3. The two Leaders at the extremes

Both cases are the same shape the roadmap named: a full Resolve tank buying
unconditional removal more than once. Both took exactly one lever this pass, on
the "don't stack two changes on one Leader in one pass" rule that held Avatar
and Sovereign back in earlier passes.

### Void Mother 71.7 / 72.0 → 55.6 / 56.3

Resolve 6 with a `-2: Banish` — three unconditional removals a tank, against
Ruin-Walker's identical Void Banish repriced to -3 for exactly this reason and
Avatar's Shatter repriced twice. Never actioned before this pass. Both levers
the roadmap offered were measured in isolation:

| trial | A | B |
|---|---|---|
| baseline (Resolve 6, `-2`) | 71.7 | 72.0 |
| `-3` | 62.5 | 63.7 |
| `-4` | 59.5 | 59.7 |
| Resolve 5 alone (`-2` kept) | 67.7 | 70.5 |
| **Resolve 5 + `-4` (shipped)** | **56.8** | **58.2** |

The price is the live lever and the Resolve point is nearly inert on its own
(-4.0 / -1.5) — which is why both ship together rather than as two bites at one
lever. The Resolve point is a correction of a **rarity side effect**, not a
second nerf: `mapLeader` derives Resolve from rarity (`3 + floor(rt/2)`), so
Void Mother has the largest ability budget in the game because of which rarity
slot its card sits in. v7.2 §1 recorded the same coupling from the other
direction and concluded a rarity edit is a balance edit; the new
`LEADER_RESOLVE_OVERRIDE` moves Resolve alone, without re-seeding the print.

Diminishing returns are clear from -3 to -4 (9.2 points, then 3.0): at -4 a
full tank buys one, so further price rises buy nothing.

### Kuro, the Unseen 32.4 / 34.0 → 37.4 / 38.6

Resolve 3 against a `-2` minus: a full tank buys one use and strands a point.
Its v7.2 override shipped at -2 after a -1 version overshot to 61.6% — **but
that trial ran at Resolve 5**, where -1 bought five shrinks a tank. Kuro is
Uncommon and now prints at Resolve 3, where -1 buys three. The bracket the
carry-forward relied on does not apply to the card as it now prints.

| trial | A | B |
|---|---|---|
| baseline (Resolve 3, `-2`) | 32.4 | 34.0 |
| Resolve 4 alone (`-2` kept) | 34.7 | 37.6 |
| **`-1` (shipped, Resolve unchanged)** | **40.3** | **40.4** |

Same result as Void Mother from the other end: the price is the strong lever
(+7.9 / +6.4) and Resolve is the weak one (+2.3 / +3.6). Shipped at -1 with no
overshoot — it does not reach the top half in either cohort, which is what the
two earlier failed trials were about. It finished the pass at 37.4 / 38.6 once
the rest of the pool moved, still the bottom, and is carried forward with the
Resolve-4 measurement above so the next pass can pull that lever without
re-deriving it.

---

## 4. Card actions

Priced off `topOverperformersRampMatched`, two cohorts, same sign.

| card | before (A / B) | action | after |
|---|---|---|---|
| `the_wolf_of_wall_street` | +11.4 / +16.1 | `UNIT_EFFECT_ADJUST` -2 | +8.2 / +10.6 |
| `the_pier_side_menace` | +11.9 / +11.1 | `UNIT_EFFECT_ADJUST` -2 | +9.1 / +9.7 |
| `phosphor_lich` | +10.6 / +7.2 | `STAT_ADJUST` -2 | **+4.7 / +4.9** |
| `blight_snarler` | +8.6 / +6.1 | `STAT_ADJUST` -2 | +6.4 / +6.4 |
| `cold_fire_volcano` | +8.9 / +7.5 | `COST_ADJUST` +1 | +6.1 / +4.5 |
| `seabed_mandala` | -4.5 / -6.1 | `COST_ADJUST` -1 | -3.1 / +2.2 |

`phosphor_lich` is the clean case: it carries a `COST_ADJUST` +1 from v6.9 that
is **inert** (it prints at the cap of 7, so that entry has never changed
anything), and one point of stat budget more than halved it. Its
`COST_ADJUST` entry is left in place with a comment saying so rather than
silently deleted.

`seabed_mandala` is priced against the **Event** row of §1's type table rather
than the pool mean: Events sit at -0.53 / -0.71 as a class, so an Event has to
be several points below *that* to be a real underperformer.

Reverted, with the measurements kept: `stone_bubbles`, `glowing_glyph_tablet`,
`amethyst_starfish` — see §1.

---

## 5. The six unprinted keywords, and a third demonstration of the same thing

Fate, Freeze-Dry, Blessed, Scorched-Earth, Glaciate and Exhume had sat on the
roadmap for several versions under "implement when cards using them are
printed", which is a deadlock: no card can be printed with a keyword the
engine does not have. All six now have an engine hook, a colour, a price and
carriers — placed where each type's colour vocabulary was empty (Events had
nothing in Shadow or Void, Charms nothing in Tide or Light, Locations nothing
in Ember or Gale), not where the name first suggests. Leaders were deliberately
skipped: their keyword roll has no free band, so any addition re-rolls the
existing nine, which is a balance change disguised as a content one.

First measured run, weights set by analogy the way v7.3's were:

| keyword | A | B | carriers |
|---|---|---|---|
| `Scorched-Earth` | **+22.3** (n=411) | no reading | 3 |
| `Freeze-Dry` | +15.9 (n=649) | +2.4 (n=1,307) | 4 |
| `Glaciate` | **+11.5** (n=283) | **+12.0** (n=965) | 5 |
| `Fate` | -2.7 (n=1,599) | -0.6 (n=1,351) | 7 |
| `Exhume` | -9.6 (n=225) | +0.8 (n=505) | 2 |
| `Blessed` | under the floor | under the floor | 1 |

Glaciate reproduces in both cohorts and Scorched-Earth was level with Sacred in
the only cohort that measured it, so both were raised 3 → 5 (a move of two —
`keywordCostAdj` is `Math.round(w / 2)`, so a 3 → 4 step is a no-op).

**Both raises were reverted on the re-run, for the same reason as §1's cost
trials.** They did not price the carriers; they deleted them. Glaciate's delta
did fall (+11.5 → +5.0 in cohort A) but its two cohort-B carriers dropped out
of the report entirely, and Scorched-Earth's best-sampled carrier
(`sparkling_meadow`, n=411, ramp residual +7.3) fell under the floor in both.

That is the **third independent demonstration in this pass** — after §1's three
failed per-card Location cost trials and v7.2's Sacred weight raise before them
— that a cost point on a Location is close to binary rather than a smooth nerf.
Both keywords are left at their by-analogy weights with the readings recorded,
and both carry forward for an effect-side lever.

Freeze-Dry and Exhume both split their cohorts and are the small-n signature,
not actions. Blessed has a single carrier, which is the Doublestrike shape and
is noted rather than acted on.

Post-change headline: spread 20.5 / 26.3, P1 45.9% / 45.6%, 20.0 / 20.7 turns,
**0 invariant violations** in both cohorts.

---

## Carry-forward items

1. **`stone_bubbles` / Sacred (top priority).** Now the only carry-forward with
   a clean diagnosis and no lever pulled: four cost trials across three passes,
   under both the flat and the corrected metric, and the number has never once
   moved down in both cohorts. §1 removes the last reason to blame the
   measurement. The next lever is the Sacred **effect** — it is the only "free
   value every turn on a near-permanent" text in the pool, and the Unit
   equivalent (Radiant) is fine precisely because units die.
2. **`the_wolf_of_wall_street` +8.2 / +10.6 and `the_pier_side_menace`
   +9.1 / +9.7.** Both moved for the first time this pass and both are still
   out of band. The residue is a body that cannot be answered on the turn it
   lands; re-check after one pass with Unbreakable bounded, since that change
   shipped as neutral-on-arrival and its real effect is on how the rest of the
   pool answers these two.
3. **Kuro, the Unseen 37.4 / 38.6** — bottom in both, one lever pulled. The
   Resolve lever is measured at +2.3 / +3.6 and unspent.
4. **Sentinel of the Nether Pit 42.5 (A) / 66.4 (B)** — a 24-point cohort
   split, and it has the smallest sample of any Leader in both runs. Note its
   shatter rate is 13-17%, an order of magnitude above every other Leader, and
   the split is the whole of cohort B's 26.3 spread. Single-cohort in each
   direction, so no action; watch, and consider pinning it for a
   `leaderPairSuite` read that cohort composition cannot reach.
5. **Ruin-Walker Overseer 62.7 / 58.5** — now first in A and second in B, and
   the only Leader above baseline in both. It took its lever in v7.2 and its
   `+1: weaken` in v6.9; due for a look next pass.
6. **`Entropic` / `Thriving`** — unchanged from v7.2 carry-forward #6, still
   sign-flipping at n≈200-300. Watch, do not act.
7. **Reservation waste** — unchanged from v7.2 carry-forward #7 and still the
   largest un-actioned lapse counter.
8. **`Scorched-Earth` and `Glaciate`** — both over on first print, both
   price-lever-immune (§5). The effect side is untouched: gate the sweep on
   Sanctum count, or move either to every other Dusk.
9. **`Blessed` has one carrier and `Exhume` two.** Neither is measurable at
   that width — the Doublestrike shape. Widen their roll bands before drawing
   any conclusion from their deltas.
10. **The v7.5 keyword weights are all by-analogy** except where §5 says
    otherwise, and none of the six has been through a settled pass. Same status
    the v7.3 set had after its first print.

## Closed this pass

- ~~The Location metric~~ (v7.2 carry-forward #1, v7.4 partial) — closed. The
  leftover gap was the comparator; ramp-matched Locations price like Units in
  both cohorts, the blanket block is lifted, and one Location has been priced
  through it.
- ~~Unbreakable's residual~~ — closed as a *keyword* item. It was never a
  keyword-level problem; per-card it is two of three carriers, and the driver
  is the ability printed beside the keyword. Both carriers actioned and
  carried forward as cards.
- ~~Void Mother~~ — actioned, first pass it has ever taken a lever.
- ~~"`STAT_ADJUST` is the only live lever at the cost cap"~~ — refuted by
  measurement, and `UNIT_EFFECT_ADJUST` now exists for the case it was wrong
  about.
