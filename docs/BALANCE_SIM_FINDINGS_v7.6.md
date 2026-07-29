# Balance & Sim Findings — v7.6 (July 2026)

Latest CPU-vs-CPU balance pass. Supersedes the v7.5 findings doc, deleted this
pass — only the newest sim doc is kept. Raw report: `docs/sim-runs/` (latest
JSON only; `.gitignore`d).

**Runs:** `npx tsx scripts/simulate-v5.ts 6 32 1337` (cohort A) and
`... 6 32 1337 42` (cohort B) — 5,952 games each, 32 random archetype decks,
same game seed, two independent deck cohorts. **Invariant violations: 0** on
both, before and after every change, across all seven trial pairs run.

Same bar as v6.6-v7.5: a change ships only if it reproduces with the same sign
in both cohorts, on a sample that did not collapse. This pass finally moved the
item that had been top of the carry-forward list for three passes — and it did
it by finding that the thing everyone had been measuring was not the thing
doing the work.

| Metric                    | A                | B               | Read                                     |
| ------------------------- | ---------------- | --------------- | ---------------------------------------- |
| `stone_bubbles`           | +9.2 → **+3.5**  | +7.3 → **+3.5** | In band. First movement in seven passes. |
| Sacred (keyword delta)    | 21.9 → **10.5**  | 19.2 → **14.3** | Follows the card, not the keyword.       |
| `Scorched-Earth`          | +22.3 → **+4.9** | no reading      | Carriers held (n=411 → 404).             |
| `the_wolf_of_wall_street` | +10.4 → **+8.6** | +8.2 → **+6.4** | Still out of band; carried.              |
| Leader spread             | 20.5 → **22.8**  | 26.3 → **23.9** | A widened, B narrowed — see §6.          |
| P1 win rate               | 45.9 → 45.2%     | 45.6 → 44.6%    | Flat.                                    |
| Avg game length           | 20.0 → 19.9      | 20.7 → 20.9     | Flat.                                    |
| Invariant violations      | 0                | 0               |                                          |

---

## 1. Sacred was never the variable — and `stone_bubbles` moved the same day

Six passes priced this keyword and the v7.5 doc closed by naming the effect as
the only lever left untried: _"the only 'free value every turn on a
near-permanent' text in the pool, and the Unit equivalent (Radiant) is fine
precisely because units die."_ That is a good design argument. It is also worth
about a point and a half of win rate, which this pass established by trying to
spend it.

### Three trials on the effect, ending in a null

| trial                                   | `stone_bubbles` (A / B) | Sacred delta (A / B) | n (A / B) |
| --------------------------------------- | ----------------------- | -------------------- | --------- |
| baseline                                | +9.2 / +7.3             | 21.9 / 19.2          | 772 / 484 |
| exhaust the Sanctum to pay for the heal | +7.2 / +8.0             | 19.2 / 19.4          | 772 / 482 |
| finite: 3 charges per Sanctum           | +8.9 / +7.1             | 21.1 / 18.6          | 772 / 484 |
| **NULL — the effect deleted outright**  | **+7.4 / +6.2**         | **18.6 / 15.8**      | 772 / 484 |

Read the last row. With Sacred's text removed — not repriced, not bounded,
_gone_ — the card is still +7.4 / +6.2 and its carriers still win 73.0% / 69.7%
on an 18.6 / 15.8 normalized delta. **The whole effect is worth ~1.5 points.**
No effect-side lever could ever have brought this card into band, and the two
that were tried are recorded and reverted:

- **Exhaust-to-pay** was inert (not down in both). An essence cost is not a
  cost in this meta — reservation waste is still the largest un-actioned lapse
  counter, so the CPU is floating the essence the charge was meant to take.
- **Finite charges** bought -0.3 / -0.2, which is noise, because Sacred only
  fires ~4 times a game across all copies and a 3-charge cap barely binds.
  Shipping it would have removed text in exchange for nothing measurable.

### What was actually doing the work

`stone_bubbles` prints **`At Dusk, a target enemy unit gets -1/-1`** beside the
Sacred it was being blamed for. Recurring, unconditional, unanswerable, on a
2-cost Sanctum — the same shape v7.5 found on `the_wolf_of_wall_street` and the
same shape `LEADER_MINUS_ABILITY_OVERRIDE` calls the strongest kit in the game.
v7.5 built `UNIT_EFFECT_ADJUST` for exactly this and wired it to Units only, so
no lever in the file could reach a Sanctum's printed trigger.

**Actioned:** `UNIT_EFFECT_ADJUST` is now `PRINTED_EFFECT_ADJUST`, used by
`mapUnit` and `mapLocation` alike, with its clamp floor moved from 1 to 0 —
where 0 means the ability is not printed at all. That floor is the whole point:
on a cheap card the natural magnitude is already 1, so "trim the magnitude" has
nowhere to go and the only question left is whether the card should print the
ability. The pool re-prints byte-identically under the rename (verified by
digest), so no other card moved.

`stone_bubbles: -1` → **+9.2 / +7.3 → +3.5 / +3.5**, sample intact (772 → 736,
484 → 477). It is the first change of any kind to move this card, and it lands
below the Location type mean (+3.83 / +3.42) rather than deleting the card from
the format the way four cost trials did.

### The class it came from — new diagnostic

`metricDiagnostics.locationsByCost` was added to ask the question the null
trial raised: is a cheap Sanctum simply good, whatever is written on it? Final
verification run:

| printed cost | cards | ramp (A)  | blank Sanctums (A) | cards | ramp (B)  | blank (B)       |
| ------------ | ----- | --------- | ------------------ | ----- | --------- | --------------- |
| 1            | 5     | +4.64     | +4.64 (n=5)        | 6     | +3.45     | +3.45 (n=6)     |
| 2            | 6     | **+5.38** | **+6.65** (n=4)    | 5     | **+4.60** | **+5.30** (n=3) |
| 3            | 16    | +3.09     | +2.60 (n=7)        | 15    | +4.30     | +3.57 (n=6)     |

The 2-cost Sanctum band reads high in both cohorts, and the Sanctums with **no
keyword at all** read at or above their keyworded neighbours in both. That is
the null trial reproducing at class level, and it is the carry-forward this
item becomes: the residual belongs to the cost-2 Sanctum slot, not to any text
printed on it. Do not spend another lever on an individual cheap Sanctum before
that is understood — and note that a cost point on a Location is still binary
(three demonstrations in v7.5), so the class lever is not price either. The
likely candidate is the comparator: a Sanctum play is itself the ramp step the
"ramp-matched" baseline matches on, so Locations may need a Location-only
baseline the way Events needed their own row in v7.5 §1.

---

## 2. The Unbreakable carriers — one shipped, one refused the same lever

v7.5 moved both with `UNIT_EFFECT_ADJUST` -2 and asked for a re-check after one
pass with Unbreakable bounded to once per turn, on the theory that the residue
was a body nothing can answer on the turn it lands. **The re-check says the
bound did nothing for either card**: +10.4 / +8.2 and +10.7 / +10.6 at the start
of this pass.

So the same lever was pulled as far as it goes — magnitude 0, the ability
printed off the card. (-3 would have been a no-op: `themedEffect` floors its
own magnitude at 1, so -1/-1 is the smallest weaken printable and 0 is the next
step down. Worth knowing before anyone reads a -3 as a trial.)

| card                      | before (A / B) | after           | n (A / B)     | verdict   |
| ------------------------- | -------------- | --------------- | ------------- | --------- |
| `the_wolf_of_wall_street` | +10.4 / +8.2   | **+9.0 / +5.0** | 497 / 331     | **ships** |
| `the_pier_side_menace`    | +10.7 / +10.6  | +13.4 / +7.6    | **356** / 345 | reverted  |

The Pier-Side Menace failed on both halves of the bar at once: opposite signs,
and its cohort-A play count fell 520 → 356. That is the "priced out rather than
balanced" signature this project has met three times on cost levers, and it is
the first time it has appeared on an **effect** lever — a residual measured on
two thirds of the plays is not the same measurement. It stays at -2.

The Wolf ends the pass at **+8.6 / +6.4** as a vanilla 5/5 Unbreakable body,
and that is the interesting part: with its printed ability gone and the keyword
bounded, it is still out of band. Every lever aimed at its _text_ is now spent,
so what is left is the body — and the v7.5 conclusion that `STAT_ADJUST` is
inert on it (five and six points of trim, no movement) was measured while the
ability was still printed. That measurement has expired; see §3.

---

## 3. A rule about carried-forward measurements — Kuro

v7.5 repriced Kuro's minus (-2 → -1), held its Resolve point back under the
"one lever per Leader per pass" rule, and measured that point in isolation
first so this pass would not have to re-derive it: **Resolve 4 alone, +2.3 (A)
/ +3.6 (B)**. Kuro is still bottom in both cohorts, so the pass spent it.

| trial                      | A        | B        |
| -------------------------- | -------- | -------- |
| baseline (Resolve 3, `-1`) | 43.3     | 40.1     |
| Resolve 4                  | **44.5** | **39.4** |

Opposite signs. **Reverted.** The two levers were never additive and could not
have been: +2.3 / +3.6 was measured against the **-2** minus, where a Resolve-3
tank bought one use and stranded a point, so the fourth point of Resolve was
buying a second activation. Against the -1 that shipped, a tank already buys
three and the fourth buys a fourth use of an ability that is no longer the
constraint.

**The rule, which generalizes past this Leader:** an isolated measurement of an
_unspent_ lever is a hypothesis for the next pass, not a result banked for it.
It expires the moment any other lever on the same card ships. That applies
directly to the Wolf's `STAT_ADJUST` reading in §2, and to any future "measured
it while we were there" note.

---

## 4. Scorched-Earth and Glaciate — the effect side, as v7.5 asked

Both came in over on their first measured run and both proved price-immune in
v7.5 (the 3 → 5 raise deleted carriers instead of pricing them). v7.5 named two
effect levers; this pass pulled one each.

| keyword          | change                         | before (A / B)     | isolated trial        | carriers held?  |
| ---------------- | ------------------------------ | ------------------ | --------------------- | --------------- |
| `Scorched-Earth` | sweep gated on **3+ Sanctums** | +22.3 / no reading | **+9.5** / no reading | yes (411 → 412) |
| `Glaciate`       | fires **every other Dawn**     | +11.5 / +12.0      | **+8.2 / +7.8**       | yes (283 / 965) |

Both held their carriers, which is the whole difference between an effect lever
and a cost point on a Location. Scorched-Earth's gate is the same 3-Sanctum
threshold Ritual and Archivist already use, so the pool has one ramp threshold
rather than a new one per keyword, and it turns an unconditional repeating
board wipe into the payoff half of a ramp deck. Glaciate's counter is
per-Sanctum, so two of them freeze one unit a turn between them rather than two
every other turn, and a fresh one fires on its first Dawn — a tempo card that
arrives asleep hands the opponent the turn it most needed to matter.

**Two caveats, recorded rather than smoothed over.** Scorched-Earth has no
cohort-B reading at all — B's decks contain it in zero games, before and after
— so its number is single-cohort by necessity, not by choice. And Glaciate's
improvement **did not survive to the end of the pass**: the final verification
reads +9.8 (A) / +11.5 (B), back to baseline in B. The difference between the
isolated trial and the final state is §5's roll-band widening, a content change
that moved the meta. That is a methodology finding as much as a balance one:
**do not interleave content changes with balance trials** — sequence them, so a
measured keyword result is not silently overwritten by a pool that changed
underneath it. Glaciate carries forward on that basis.

---

## 5. Blessed and Exhume are measurable now

v7.5 carry-forward #9: `Blessed` printed on **one** card and `Exhume` on two,
which is the Doublestrike width — at that sample a delta is a fact about two
cards' Leader cohorts, not about the keyword, and v7.5 correctly refused to act
on either. The v7.5 roll bands are widened (Charm 40..52 → 40..70, Event
42..62 → 42..76), upward only:

| keyword      | carriers  | A                  | B              |
| ------------ | --------- | ------------------ | -------------- |
| `Blessed`    | 1 → **5** | -0.8 (n=643)       | +0.8 (n=1,683) |
| `Exhume`     | 2 → **6** | -2.5 (n=497)       | -0.9 (n=670)   |
| `Fate`       | 7 → **9** | **-5.0** (n=3,451) | -1.8 (n=3,676) |
| `Freeze-Dry` | 4 → **8** | +8.3 (n=1,921)     | +4.2 (n=1,712) |

Blessed and Exhume both land in band on real samples, against the -9.6 / +0.8
cohort split that was all v7.5 could see. Both items close.

Verified card by card before shipping: **zero existing carriers changed
keyword** and 14 cards that had previously rolled nothing picked one up. That
is what makes widening upward safe — the trap `freshKeywordFor` documents is
re-rolling cards that already print.

`Fate` is the new watch item: nine carriers, the largest sample of any keyword
in the pool, and -5.0 in cohort A. It has never been priced.

---

## 6. What the spread did, and why it is not a regression to fix blind

Leader spread went 20.5 → 22.8 (A) and 26.3 → 23.9 (B). Cohort B narrowed.
Cohort A widened, and all of it is the bottom two Leaders:

| Leader                                                  | A before | A after  |
| ------------------------------------------------------- | -------- | -------- |
| Ruin-Walker Overseer                                    | 63.0     | 61.6     |
| Void Mother                                             | 56.6     | 57.1     |
| Kuro, the Unseen (`apex_nanite_shinobi`)                | 43.3     | 45.6     |
| Sentinel of the Nether Pit (`crimson_vector_commander`) | 42.5     | **38.8** |

Sentinel is Ember, and Scorched-Earth is Ember's Location keyword: gating the
sweep took the payoff out of the decks that were carrying it. That is the
correction landing where it was aimed, on the Leader that was already the
known-unstable outlier (42.5 A / 66.4 B, the 24-point cohort split of v7.5
carry-forward #4, and a shatter rate an order of magnitude above every other
Leader). Kuro rose 2.3 points without taking a lever at all.

The spread is a max-minus-min statistic over nine Leaders, so one unstable
Leader owns it. Sentinel is now the most urgent Leader item in the file.

---

## Carry-forward items

1. **The cost-2 Sanctum band (new, top priority).** `locationsByCost` reads
   +5.38 / +4.60 for the class and +6.65 / +5.30 for the Sanctums with no
   keyword at all — reproducing in both cohorts on small n. §1's null trial is
   the same finding at card level. The next move is a **comparator**, not a
   lever: a Sanctum play is itself the ramp step the ramp-matched baseline
   matches on, so try a Location-only baseline before pricing anything.
2. **Sentinel of the Nether Pit 38.8 (A) / 63.7 (B).** Was already a 24-point
   cohort split with a 10-16% shatter rate; §6 widened the A side. It owns
   cohort A's spread and has never taken a lever. Pin it for a
   `leaderPairSuite` read that cohort composition cannot reach.
3. **`the_wolf_of_wall_street` +8.6 / +6.4.** Every lever aimed at its text is
   spent — cost (no-op at the cap), the keyword (bounded, inert), the printed
   ability (now removed entirely). What is left is the body, and the v7.5
   "STAT_ADJUST is inert on it" reading was taken while the ability was still
   printed, so under §3's rule it has expired. Re-measure the stat lever on the
   card as it now prints.
4. **`the_pier_side_menace` +10.5 / +10.5.** Unmoved this pass and its effect
   lever is refused (§2 — it loses a third of its plays). Same body question as
   the Wolf, and it is the cleaner test of it: identical keyword, identical
   cost, 6/6 instead of 5/5.
5. **Kuro, the Unseen 45.6 / 39.8.** Still bottom in B. Both named levers are
   now spent or refuted; the next one has to be found rather than looked up.
6. **`Glaciate` +9.8 / +11.5.** Its effect lever measured -3.3 / -4.2 in
   isolation and did not survive §5's content change. Re-measure it on the
   settled pool before deciding whether the every-other-Dawn rule works.
7. **`Fate` -5.0 / -1.8** (§5) — nine carriers, the biggest sample in the pool,
   never priced. Weight 1. First candidate for a keyword weight change.
8. **`Scorched-Earth` has no cohort-B reading**, before or after. A keyword
   that one of two deck cohorts never drafts cannot clear a two-cohort bar; it
   needs either a third cohort or a pinned deck suite.
9. **Reservation waste** — unchanged from v7.2 carry-forward #7, still the
   largest un-actioned lapse counter, and §1 now has a second reason to care:
   it is why an essence cost measured inert as a balance lever.
10. **Do not interleave content and balance changes in one pass** (§4). The
    roll-band widening erased a measured Glaciate result. Sequence them:
    content first, re-baseline, then trials.

## Closed this pass

- ~~Sacred / `stone_bubbles`~~ (v7.2 carry-forward #2, top of the list for
  three passes) — closed, and closed differently than expected. The keyword was
  exonerated by a null trial and the card was actioned through its own printed
  ability. What replaces it is a class-level item, #1 above.
- ~~`Blessed` has one carrier and `Exhume` two~~ — closed. Both measurable,
  both in band.
- ~~"Gate the sweep on Sanctum count, or move it to every other Dusk"~~ — both
  levers pulled and both held their carriers; Scorched-Earth closes, Glaciate
  carries forward for re-measurement only.
- ~~Kuro's Resolve lever~~ — spent and refuted, and it produced §3's rule about
  banked measurements, which is the more useful half.
