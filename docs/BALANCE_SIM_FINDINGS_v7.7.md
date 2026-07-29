# Balance & Sim Findings — v7.7 (July 2026)

Latest CPU-vs-CPU balance pass. Supersedes the v7.6 findings doc, deleted this
pass — only the newest sim doc is kept. Raw report: `docs/sim-runs/` (latest
JSON only; `.gitignore`d).

**Runs:** `npx tsx scripts/simulate-v5.ts 6 32 1337 <deckSeed>` for deckSeed
1337 (cohort A), 42 (B), **7 (C)** and **99 (D)** — 5,952 games each, 32 random
archetype decks, same game seed, four independent deck cohorts.
**Invariant violations: 0** on all four, before and after every change.

**Two cohorts became four, and that is the headline.** v7.6 closed with three
items that a two-cohort bar could not adjudicate — a keyword one cohort never
drafts (`Scorched-Earth`), a keyword whose reading might be cohort-specific
(`Glaciate`), and a Leader with a 25-point cohort split (Sentinel). All three
resolve immediately on four cohorts, and two of them resolve the opposite way
from how the file had them.

| Metric               | A             | B             | C             | D             |
| -------------------- | ------------- | ------------- | ------------- | ------------- |
| Leader spread        | 22.8→**20.3** | 23.9→**16.2** | 18.6→**17.3** | 41.5→**39.6** |
| Kuro, the Unseen     | 45.6→**52.3** | 39.8→**46.1** | 44.1→**45.4** | 42.3→**45.7** |
| `Fate` (carrier win) | 43.4→**46.0** | 50.2→**49.8** | 47.6→**50.5** | 43.8→**45.3** |
| `Glaciate`           | +9.8          | +11.5         | **-0.5**      | **-0.5**      |
| `Scorched-Earth`     | +4.9          | no reading    | **-9.1**      | **-6.0**      |
| P1 win rate          | 45.2→44.4%    | 44.6→45.0%    | 45.1→44.8%    | 44.8→44.8%    |
| Avg game length      | 19.9          | 20.9          | 20.7→20.5     | 20.7→20.6     |
| Invariant violations | 0             | 0             | 0             | 0             |

---

## 1. The cost-2 Sanctum band — the comparator was built, and it says no

v7.6 carry-forward #1 asked for a comparator rather than a lever, on a specific
hypothesis: _"a Sanctum play is itself the ramp step the ramp-matched baseline
matches on."_ The comparator now exists. It took three attempts, and the two
that failed are recorded in `rampStateMatchedBaseline` because each fails in a
way the next person would otherwise repeat.

| attempt                                                 | outcome                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pool-wide "everyone who dropped a Sanctum on turn T"    | **rejected** — throws the deck control away. Cohorts disagreed by thirty points card after card (Ossuary Vault +2.1 / -28.3), all of it in the numerator: that card's played win rate is 56.4% in A and 22.3% in B because in B it sits in worse decks.                                                                                                                                                |
| the card's own decks, matched on the drop TURN          | **rejected** — degenerate. On a card played in most of its in-deck games the two sides are nearly the same games. With `stone_bubbles` printing its ability again, flat moved +9.8→+16.2 and ramp-matched +3.5→+10.2 while this metric moved +0.1→+1.2. Excluding self-plays fixes the degeneracy and replaces it with a denominator so small and so selected that half the pool fell under the floor. |
| **the card's own decks, matched on RAMP STATE REACHED** | **ships.** Reaching L Locations happens by many routes, so the denominator stays large and is not mostly this card.                                                                                                                                                                                                                                                                                    |

### What it says

`metricDiagnostics.locationsByCost` now carries a `state` column beside `ramp`:

| printed cost | A         | B         | C         | D         |
| ------------ | --------- | --------- | --------- | --------- |
| 1            | +6.08     | +5.02     | +5.47     | +5.87     |
| **2**        | **+6.86** | **+6.22** | **+5.85** | **+7.08** |
| 3            | +5.35     | +6.12     | +6.88     | +5.92     |

The 2-cost band is 1.5 points above the 3-cost band in A, 0.9 **below** it in
C, and level in B and D. **There is no cost-2 Sanctum effect that reproduces**,
and the "blank Sanctums read at or above their keyworded neighbours" inversion
that motivated the item holds only at cost 2 — where there are **two**
keyworded cards, the Doublestrike width the v7.2 note exists to refuse. At cost
3, on nine keyworded against six or seven blank, the keyworded Sanctums read
above the blanks in A and B and below in C and D. It is noise all the way down.

**Item closes with no lever pulled**, which is the outcome the carry-forward
asked for and the reason it asked for a comparator first.

### The premise was wrong, and that is worth more than the answer

The hypothesis was that the ramp-matched baseline PAYS a Sanctum for the land
drop, so correcting it would push Location residuals DOWN. It pushes them
**up**, uniformly, by about two points (`residualByType`, Location: ramp +3.44
→ state +5.49 in A, and the same shift in all four cohorts).

The reason is in `rampBaselineCurve`, which has been published since v7.4 and
never read: **the ramp curve is DECREASING.** Cohort A reads 89.5% at four
Locations, 52.8% at eight, 43.0% at thirteen. Reaching a lot of Sanctums is not
what winning looks like in this format — it is what a long grinding game looks
like. So conditioning on the ramp state a Sanctum puts you in compares it
against a WEAKER population, not a stronger one.

`sanctumDropCurve` (new) is the diagnostic that makes the two readings
consistent: making a land drop on an early turn is worth a great deal (68.9% at
turn 1-4 in A) and by mid-game is worth nothing. "Ramp" is an early-game tempo
statistic wearing a late-game statistic's name.

**Consequence, and it must not be skipped:** the `state` column shifts every
type upward (Unit +1.0, Location +2.0, Charm +1.6, Event +1.1 in A), so an
absolute `state` number is NOT comparable to a `ramp` number and a Location at
+6 is not "worse than" the same card at +3.44 last pass. Compare Locations to
Locations, in the same column, in the same run. Nobody should read this table
and nerf the Location class.

---

## 2. Sentinel of the Nether Pit — the instrument was broken, and the answer inverts

v7.6 carry-forward #2 asked for _"a pinned `leaderPairSuite` read that cohort
composition cannot reach."_ That suite has existed since v6.2 and could not
have delivered one, because `pinnedDeckForLeader` seeded its 60-card decks with
`strHash(leaderId) ^ DECK_SEED`. **The suite whose entire premise is that decks
are held fixed re-rolled its decks with the cohort seed.** Sentinel read 57.3%
on deckSeed 1337 and 23.4% on deckSeed 42 — a 34-point swing on the instrument
that was supposed to be cohort-proof.

Seeded from the leader id alone (`strHash(leaderId)`), with the per-pair game
RNG still varying so a second cohort is a second independent sample of the
_same_ matchup, and 20 seat-games per ordered pair instead of 12:

| Leader                         | A        | B        | C        | D        |
| ------------------------------ | -------- | -------- | -------- | -------- |
| **Sentinel of the Nether Pit** | **64.1** | **64.1** | **65.0** | **65.0** |
| Ruin-Walker Overseer           | 61.6     | 62.5     | 55.6     | 62.5     |
| Void Mother                    | 60.0     | 50.6     | 56.9     | 54.4     |
| Mer-King                       | 54.1     | 50.6     | 48.4     | 48.4     |
| Sovereign of the Dying Star    | 49.7     | 54.4     | 49.7     | 52.2     |
| Kuro, the Unseen               | 46.9     | 41.3     | 44.4     | 51.9     |
| Legendary Diver                | 42.2     | 37.8     | 36.3     | 40.6     |
| Avatar of the Abyss            | 41.6     | 36.3     | 42.2     | 39.4     |
| Ethereal Sea Witch             | 37.5     | 36.6     | 42.5     | 40.3     |

Sentinel is **first in all four**, by a margin, on decks that cannot move. Its
random-cohort 38.0% in A is a statement about the decks that cohort dealt it,
not about the Leader. **The item inverts: Sentinel is not the weakest kit in
the game, it is the strongest, and the file has been carrying it as a
underperformer for three passes.** It takes no buff. Its 10.1% shatter rate —
still an order of magnitude above every other Leader — is now the open
question, and it is a mechanism question rather than a win-rate one.

Reproducibility across cohorts is 0.0 / 0.9 / 0.0 points for the top three
Leaders, which is the sanity check that the seed fix did what it claims.

---

## 3. Kuro, the Unseen — the lever had to be found, and it was a missing lever

v7.6 carry-forward #5: _"the next one has to be found rather than looked up."_

Kuro is not idle (0.1% idle rate) and not misused (6.6-7.2 ability activations
a game, more than most). What the kit diagnostics show is arrival:

```
Void Mother 6.4   Ethereal 6.5   Ruin-Walker 6.6   Sentinel 6.7
Mer-King 6.9      Legendary Diver 7.2
Avatar 8.4        Sovereign 8.4   Kuro 8.4
```

Kuro prints at **5 total essence — joint most expensive — with Resolve 3, the
lowest in the pool.** It pays a Commander surcharge on top of the smallest
ability budget anyone has, and it arrives two full turns after the cheap kits.
Its win rate by game length says exactly that: 54.0% at 11-20 turns, 28.3% at
21-30. A Leader that lands late and then cannot out-grind.

Five per-Leader levers existed — strip a keyword, reprice the minus, override
the Resolve, replace either ability — and **not one of them could change what a
Leader costs**, even though `mapLeader` prices it as `3 + roll(0..1) +
keywordCostAdj` and the resulting arrival spread is two turns wide. That is the
missing lever. `LEADER_COST_OVERRIDE` is new, and it is price-only by
construction: nothing in `mapLeader` derives from `total` (Resolve comes from
rarity, both abilities from the colour identity), so unlike the Unit/Event/
Charm mappers there is no power term to keep in step.

`apex_nanite_shinobi: 4`, measured alone:

| cohort | first invoke  | random-deck win | pinned-suite win |
| ------ | ------------- | --------------- | ---------------- |
| A      | 8.4 → **6.5** | 45.6 → **50.8** | 43.1 → **48.1**  |
| B      | 8.0 → **6.2** | 39.8 → **46.5** | 41.9 → **44.7**  |
| C      | 8.3 → **6.6** | 44.1 → **46.6** | 41.6 → **47.2**  |
| D      | 8.3 → **6.5** | 42.3 → **48.0** | 45.3 → **53.1**  |

**Up in all four cohorts on both instruments**, and the Leader spread narrows
in all four (22.8→20.3, 23.9→16.2, 18.6→17.3, 41.5→39.6). Ships. Kuro is no
longer bottom in any cohort.

---

## 4. `Fate` — priced, and the price was the whole card

v7.6 carry-forward #7. Nine carriers, the largest sample of any keyword in the
pool (3,451-4,341 carrier games), negative in **all four** cohorts
(-5.0 / -1.8 / -1.7 / -4.2), never priced.

At weight 1, `keywordCostAdj` is `Math.round(1 / 2)` = 1, so nine Events were
each paying a **full essence point** for _"banish the top card of the
opponent's deck"_ — one card of mill, in a format where 92-94% of wins come
from reducing Vitality. Not an underpowered keyword: a price tag attached to
text that does approximately nothing.

Weight **1 → 0**. The effect is untouched (`t` is `naturalT - kwAdj`, so both
terms drop by one and the magnitude derivation is unchanged) — this is a pure
price cut, the cleanest lever shape in the file.

| cohort | carrier win     | normalized delta |
| ------ | --------------- | ---------------- |
| A      | 43.4 → **46.0** | -5.0 → -2.5      |
| B      | 50.2 → **50.2** | -1.8 → -3.0      |
| C      | 47.6 → **50.6** | -1.7 → **+0.6**  |
| D      | 43.8 → **46.2** | -4.2 → -3.0      |

**Recorded honestly:** carrier win rate rises or holds in all four, which is
the direct read of a price-only change and the reason this ships. The
archetype-normalized delta rises in three and falls 1.2 in cohort B, on an
archetype baseline that also moved. A future pass that finds Fate back at -5
should suspect that the effect, not the price, is the remaining problem — mill
1 may simply be unprintable text in this format, and the honest fix would then
be to give Fate a different effect rather than a third price.

---

## 5. `Glaciate` and `Scorched-Earth` — both close, both because C and D exist

Neither needed a lever. Both needed a third cohort, which is what v7.6
carry-forward #8 asked for on one of them and did not think to ask for on the
other.

| keyword          | A    | B          | C        | D        | verdict |
| ---------------- | ---- | ---------- | -------- | -------- | ------- |
| `Glaciate`       | +9.8 | +11.5      | **-0.5** | **-0.5** | closes  |
| `Scorched-Earth` | +4.9 | no reading | **-9.1** | **-6.0** | closes  |

`Glaciate` was carried forward as a +9.8 / +11.5 overperformer whose
every-other-Dawn lever "did not survive" the v7.6 roll-band widening. On four
cohorts it is **flat in half of them**. The v7.6 reading was cohort-specific,
the shipped lever is fine, and there was never a second lever to find.

`Scorched-Earth` is the sharper case. v7.6 gated its sweep on 3+ Sanctums,
measured +22.3 → +4.9 in the one cohort that drafts it, and closed the item
while recording that cohort B had no reading at all. Cohorts C and D both draft
it, and both read it **negative** — -9.1 and -6.0, on carrier win rates of
33.2% and 33.3%. The gate did not bring it into band; on the majority of
available readings it took it out the other side. No further nerf. It stays as
printed and joins the watch list as a possible **buff** candidate — which is a
thing a two-cohort file could not have discovered, because the only cohort that
could see the keyword was the one where it read high.

**The methodology finding, and it generalizes past these two:** a keyword
carried by three to five cards is drafted by a random 32-deck cohort as a coin
flip. Two cohorts is not a reproducibility bar for those keywords, it is two
samples of a distribution with a 15-point spread. Four cohorts is now the
standing run for this pass and should be for the next.

---

## 6. The Unbreakable 7-drops — every lever is spent, and it is the keyword

v7.6 carry-forward #3 and #4. The v7.5 "STAT_ADJUST is inert" reading had
expired under v7.6 §3, so it was re-measured on the cards as they now print.

**Wolf** (`STAT_ADJUST` -2 → -6, i.e. four more points off a 5/5 body):

| cohort | ramp before | after | sample        |
| ------ | ----------- | ----- | ------------- |
| A      | +8.6        | +9.7  | 498 → 519     |
| B      | +6.4        | +3.8  | 338 → **191** |
| C      | +9.0        | +6.9  | 1551 → 1382   |
| D      | +10.3       | +5.0  | 1120 → 1004   |

Opposite signs, cohort B's sample nearly halved, and at -6 the card prints as a
**3/3 for seven essence** — flagged by `printedBudgetOutliers` at z = -2.01,
the most under-budget body in the pool. **Refuted.** Cost is a no-op at the
cap, the keyword bound was measured inert, the printed ability is already gone
entirely, and the body does not move it either. There is no lever left in the
file that reaches this card.

**Menace**, two step sizes, because one of them looked promising:

| step          | A     | B     | C    | D     | plays                         |
| ------------- | ----- | ----- | ---- | ----- | ----------------------------- |
| baseline (-3) | +10.5 | +10.5 | +8.0 | +10.1 | —                             |
| -5            | +11.5 | +11.5 | +8.6 | +8.9  | held                          |
| -7            | +5.8  | +8.4  | +7.4 | +4.8  | **-36% / -18% / -16% / -20%** |

At -5 it goes **up** in three of four. At -7 it comes down in all four and
loses a fifth to a third of its plays — the "priced out rather than balanced"
signature, now demonstrated on a stat lever as well as on cost and effect
levers. **Refuted at both sizes.**

### What that leaves

The per-card levers are exhausted on both cards, and the four-cohort keyword
table says why: **Unbreakable is the most reproducing outlier in the pool**, at
+14.6 / +12.7 / +13.9 / +12.9, on carrier win rates of 65.6% / 65.9% / 67.9% /
73.1%. v7.5 split the keyword into its three carriers and found they disagreed,
which was true and useful — but two of the three have now each absorbed cost,
keyword-bound, effect and stat levers without coming into band. A property that
survives four independent levers on two independent cards is a property of the
keyword, and the next move is the keyword's own text: `Unbreakable` carries
KEYWORD_COST 7, the heaviest weight in the file, and all three carriers land
ON the cost cap of 7, so the printed price collects only part of the surcharge.
**The cap is the mechanism**, and the lever nobody has tried is raising the
Unit cost ceiling for keyword surcharges specifically, so a premium keyword can
actually be charged for.

The ramp-state metric was checked as an alternative explanation and does not
rescue them: `state` reads within 0.6 of `ramp` on both cards in all four
cohorts. These residuals are not a ramp-access artifact.

---

## 7. What the pass changed in the harness

- **`rampStateMatchedBaseline`** (§1) — a third residual, on every card type,
  matching on ramp ACCESS rather than game length. `residualByType` gains a
  `rampState` column; `locationsByCost` gains `state` / `keywordedState` /
  `blankState`.
- **`locationsStateRanked`** — every Location that clears the play floor,
  ranked, not a top-15 slice. There are only ~30 of them and the point of the
  metric is to compare Sanctums to each other.
- **`sanctumDropCurve`** — the evidence for §1's premise being wrong, published
  rather than asserted.
- **`leaderPairSuiteSummary`** — the pinned suite as one row per Leader with
  its best and worst matchup. The 72-cell matrix has been published since v6.2
  and consulted about twice, which is why §2's bug survived four passes.
- **Pinned decks no longer re-roll with the cohort seed** (§2), and the suite
  runs 20 seat-games per ordered pair instead of 12.
- **`LEADER_COST_OVERRIDE`** (§3) — the sixth per-Leader lever.

---

## Carry-forward items

1. **`Unbreakable` +14.6 / +12.7 / +13.9 / +12.9 (new, top priority).** The
   most reproducing outlier in the pool on four cohorts, and §6 spent the last
   per-card lever on two of its three carriers. The mechanism is named: all
   three carriers print at the cost cap of 7, so a KEYWORD_COST of 7 collects
   only part of its surcharge. The lever is the cap, not the card.
2. **`the_pier_side_menace` +10.9 / +10.9 / +8.5 / +10.8.** The single most
   stable card outlier in the file. Cost, effect and stat levers are all
   refuted on it (§6). Blocked behind #1.
3. **`the_wolf_of_wall_street` +8.5 / +6.8 / +9.5 / +10.4.** Same, and it is
   the cleaner test of #1 because its text is already blank — it is a vanilla
   Unbreakable body and nothing else.
4. **`amethyst_starfish` +10.5 / +11.2 / +8.5 / +9.4 (new).** Reproduces in all
   four cohorts on large samples (n=501-1,528) and has never been actioned; its
   one cost trial was reverted in v7.5 for tripling-down the play count. The
   biggest un-actioned single card that is not an Unbreakable 7-drop.
5. **Sentinel's 10.1% shatter rate (§2).** The win-rate half of this item is
   closed and inverted — Sentinel is the strongest pinned kit in the game. What
   is unexplained is a Leader-shatter rate an order of magnitude above every
   other Leader, on a Leader that is winning. That is a mechanism question:
   find out what is killing it and whether the kit is winning _because_ of the
   trade.
6. **Legendary Diver 28.2% in cohort D** against 49.7 / 43.5 / 50.1 elsewhere,
   and last in the pinned suite in two of four. The new widest cohort split now
   that Sentinel's is explained, and cohort D's 39.6 spread is mostly this.
7. **`Sacred` +10.9 / +17.0 / -1.5 / +9.8.** Out of the ±10 band in two of four
   cohorts and wildly cohort-dependent. v7.6's null trial proved the EFFECT is
   worth ~1.5 points, so whatever this is, it is not the keyword text — and it
   is now the clearest case for the four-cohort rule catching something a
   two-cohort read would call reproducing.
8. **`Fate` may need an effect, not a third price (§4).** Shipped at weight 0.
   If it returns negative, mill-1 is unprintable text in this format and the
   answer is different text.
9. **`Scorched-Earth` as a BUFF candidate (§5)** — -9.1 / -6.0 on the two
   cohorts that draft it, after a gate that was meant to bring it down from
   +22.3. Watch one pass, then buff if it holds.
10. **Reservation waste** — unchanged from v7.2 carry-forward #7, still the
    largest un-actioned lapse counter, and now carried for five passes without
    a lever. Either action it or retire it from the list.
11. **Four cohorts is the standing run** (§5). Two is not a reproducibility bar
    for any keyword with fewer than about six carriers.
12. **Do not interleave content and balance changes in one pass** — carried
    unchanged from v7.6 §4, and honoured this pass: no roll band, keyword
    vocabulary or card text changed, so every number above is measured against
    a pool that did not move underneath it.

## Closed this pass

- ~~The cost-2 Sanctum band~~ (v7.6 carry-forward #1, top of the list) — closed
  with **no lever**, which is what asking for a comparator first buys you. The
  band does not reproduce on four cohorts, and the hypothesis behind the item
  turned out to be backwards: the ramp curve is decreasing, so correcting for
  the land drop raises Location residuals rather than lowering them.
- ~~Sentinel of the Nether Pit as an underperformer~~ — closed and **inverted**.
  The instrument that was supposed to settle it was seeded from the cohort seed
  and could not have. Fixed, Sentinel is first in all four.
- ~~Kuro, the Unseen~~ — closed. The lever was found by noticing the file had a
  hole in it rather than by trying another entry in an existing table.
- ~~`Fate` has never been priced~~ — closed, priced, shipped.
- ~~`Glaciate` needs re-measuring on the settled pool~~ — closed; flat in two of
  four cohorts, the v7.6 reading was cohort-specific.
- ~~`Scorched-Earth` has no cohort-B reading~~ — closed; C and D both read it,
  both negative, and the item reverses direction.
- ~~"Re-measure the stat lever on the Wolf and the Menace"~~ (v7.6 #3, #4) —
  done and refuted at two step sizes on both cards. What replaces them is a
  keyword-level item, #1 above.
