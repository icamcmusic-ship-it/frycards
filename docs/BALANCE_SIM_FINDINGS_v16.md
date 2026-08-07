# Balance & Sim Findings — v16 (August 2026)

The dedicated **Unbreakable / cost-cap pass** that v7.7 queued as its top
carry-forward and v7.8 explicitly deferred ("keeps its own dedicated pass").
Supersedes the v7.7 findings doc, deleted this pass — only the newest sim doc
is kept. The doc series jumps v7.7 → v16 to re-align with the app version.

**Runs:** `npx tsx scripts/simulate-v5.ts 6 32 1337 <deckSeed>` for deckSeed
1337 (cohort A), 42 (B), 7 (C), 99 (D) — 5,952 games each, four independent
deck cohorts, per the v7.7 standing rule. **Invariant violations: 0** on every
run of every trial. Every Leader number in this file was taken fresh under the
v8.0 Resolve cap and the v11 CPU combat model, which discharges the roadmap's
"Leader re-baseline before anything else" debt — no pre-v8 reading is compared
against anywhere below.

The pass ran as sequential measured trials, one lever at a time, each on all
four cohorts: baseline → surcharge-above-the-cap (§1) → the brink rule (§2) →
once per game (§3), plus independent items (§5-§9).

| Metric (A / B / C / D)      | baseline                    | shipped                     |
| --------------------------- | --------------------------- | --------------------------- |
| `Unbreakable` delta         | +15.0 / +14.4 / +16.4 / +13.5 | **+9.7 / +8.8 / +8.6 / +8.6** |
| `Unbreakable` carrier win   | 62.5 / 67.0 / 70.0 / 71.2   | **53.8 / 58.4 / 56.7 / 64.5** |
| Pier-Side Menace (state)    | +16.3 / +11.4 / +10.0 / +9.9 | **+6.7 / +6.6 / +5.1 / +7.5** |
| Wolf of Wall Street (state) | +9.8 / +10.0 / +10.4 / +10.5 | **+5.2 / +4.7 / +5.1 / +6.3** |
| Amethyst Starfish (state)   | +9.1 / +11.7 / +8.4 / +9.9  | **+7.0 / +7.4 / +4.8 / +7.6** |
| Sentinel shatter rate       | 8.3% / — / 15.9% / —        | **2.2% / 5.4% / 5.7% / 4.1%** |
| P1 win rate                 | 44.7 / 45.8 / 45.6 / 44.7   | 44.0 / 46.1 / 46.0 / 45.2   |
| Avg game length             | 19.6 / 20.8 / 20.2 / 20.3   | 20.1 / 21.5 / 21.6 / 20.9   |

---

## 1. The cost cap was real — and it was not the mechanism

v7.7 carry-forward #1 named the lever precisely: all three `Unbreakable`
carriers land ON the Unit cost cap of 7 while the keyword carries KEYWORD_COST
7 (a +4 surcharge), so the printed price collected only part of the surcharge
— "the lever is the cap, not the card."

The cap was raised. The base price still clamps at 7, but a positive keyword
surcharge is now charged in full on top of it, to a ceiling of 9
(`KW_SURCHARGE_CEILING` beside `naturalTotalFor` in cardpool.ts; ceiling
rather than unbounded because a cost the format cannot reach deletes a card
instead of balancing it — the "priced out rather than balanced" signature this
file keeps re-measuring). Twelve cards reprinted, every one audited by
before/after pool diff:

- **Nine Units price-only** (rules text byte-identical): the three Unbreakable
  carriers to 9, `familiar_in_the_dark` and `vlad_from_accounting` to 9,
  `phosphor_lich`, `blight_snarler`, `grit_and_halftones`,
  `urnbearer_of_blight` to 8. The unit effect-magnitude derivation was PINNED
  to the old 7-capped total — measured before pinning, the raised ceiling
  leaked into printed abilities and grew the exact cards being nerfed (the
  Menace's enters-damage went 1 → 2 and the Wolf's v7.6-deleted Dawn weaken
  reprinted itself).
- **`phosphor_lich`'s inert COST_ADJUST +1 retired**, not activated: the new
  rule would have silently revived a price point that was explicitly
  re-actioned through STAT_ADJUST, stacking three nerfs where one was earned.
- **Three Events/Items recovered their double-penalty point** — see §4.

**Measured on four cohorts, the carry-forward's premise is refuted.** With the
full surcharge collecting (Wolf at 9 pays every point of it), the keyword
delta moved +15.0/+14.4/+16.4/+13.5 → +14.3/+15.0/+17.2/+15.4 — flat to
slightly UP — and both big carriers held ~+9-12 ramp-state residual. Play
counts fell 15-50%, the price was real, and the residual stood. Whatever was
worth +14 was not the uncollected surcharge.

---

## 2. The save was healing the wall — a power the printed text never promised

What v7.5's once-per-turn implementation actually did on a save was
`u.damage = 0`: full heal, every proc. The 0 existed only to stop the
state-based check re-firing on the same marked damage, but it over-delivered —
chip damage could never accumulate on a wall, so the save was worth its own
Grit in healing every single turn on top of the death prevention. The printed
text ("prevent the first effect that would… deal it lethal damage") promises
none of that.

The save now leaves the unit **at the brink** — marked damage set to effective
Grit − 1 — which stops the re-fire equally well, honours the text, and keeps
the wall wounded. Measured (with §1 in): keyword delta 14.3 → 14.0 in A and
17.2 → 13.6 in C, carrier win 68.4 → 63.3 in C. Real, directionally right,
and still far out of band. No card text changed.

---

## 3. Once per game — the item closes

Five levers had now been spent against this keyword across four passes — cost,
keyword bound, printed effect, stats (v7.4-v7.6), and this pass's full-price
surcharge plus the brink — and it still read +13-14 everywhere. A save that
returns every turn forces the opponent to overcommit every turn, and no price
in a 9-ceiling format covers an arbitrary number of forced overcommits. The
remaining lever was the one §6 of v7.7 pointed at: the keyword's own text.

**`Unbreakable` is now once per GAME.** Engine: the spent save never
recharges (the v7.5 every-Dawn reset is gone). Text, rulebook, and How to Play
all updated; the three carriers reprint with the new sentence and nothing else
changes on them.

| cohort | delta            | carrier win | carrier plays (Wolf) |
| ------ | ---------------- | ----------- | -------------------- |
| A      | +14.0 → **+9.8** | 59.3 → 53.6 | 393 → 404            |
| B      | +13.6 → **+8.8** | 64.0 → 58.2 | 180 → 185            |
| C      | +13.7 → **+8.6** | 63.2 → 56.6 | 1267 → 1292          |
| D      | +12.7 → **+8.7** | 69.7 → 64.5 | 951 → 965            |

**In band in all four cohorts for the first time in the keyword's history,
with play counts HELD** — no priced-out signature, the failure mode every
previous nerf on these cards hit. Save activations halved (2,456 → 1,099 in
A), which is what one-per-game arithmetic predicts. Wolf reads +4.7-6.3 and
Menace +5.1-7.5 ramp-state across the four cohorts; both watched, neither
actionable. The stat trims on the carriers stay as shipped — recorded at
STAT_ADJUST: if a future pass finds these cards NEGATIVE, unwind the trims
first, because they were earned as substitutes for a surcharge the price now
collects. And the weight: KEYWORD_COST 7 was priced against the per-turn
save. If the carriers drift negative, the weight is the suspect (noted at the
entry).

---

## 4. Events and Items stop paying the at-the-cap double penalty

The v7.8 KNOWN ISSUE, deferred to this pass because it reprints cards: Event
and Item effect magnitude is `naturalT - kwAdj`, and with `base + kwAdj`
clamped at 7 the subtraction docked the effect for a surcharge the printed
price never collected — the exact bug v6.7's `statBase` fix removed for Units,
never ported. With the surcharge riding outside the clamp (§1's
`naturalTotalFor`), subtracting it recovers the base exactly. Three cards
recover their docked point, verified by pool diff, prices unchanged:
`chrysalis_of_the_departed` (+2/+5 → +2/+6), `the_garden_variety_glock`
(+5/+2 → +6/+2), `ruthless_succession` (Deal 3 → Deal 4). Both KNOWN ISSUE
markers are gone from the mappers.

---

## 5. Amethyst Starfish — the effect was the card, and two steps land it

v7.7 carry-forward #4, the biggest un-actioned single-card outlier
(+9.1/+11.7/+8.4/+9.9 at n=490-1,532, reproducing since v7.5; the one cost
trial cut its plays 3x and was reverted). Its print: a 5/3 Reckless for 5 with
`At Dawn, deal 3 damage to any target` — free recurring any-target reach, the
shape the Wolf and Stone Bubbles findings keep converging on. For scale:
Sentinel's entire -2 Leader ability is 2 damage to any target, once.

PRINTED_EFFECT_ADJUST, two measured steps: -1 (Dawn 3 → 2) moved it about a
point (+8.7/+9.2/+6.1/+8.7); -2 (Dawn 3 → 1) ships at
**+7.0/+7.4/+4.8/+7.6 — in band in all four cohorts with play counts held**
(n=1560/512/538/1096 against baseline 1532/510/490/1078). The first lever
ever to move this card without deleting it from decks. Closes.

---

## 6. Sentinel's shatter rate — the mechanism was the CPU donating the Leader

v7.7 carry-forward #5 asked what is killing a Leader that is winning. Found,
and it is a CPU valuation bug, not a kit property:

1. Sentinel's kit walks a **parity trap**: Resolve 5 with a -2 spender goes
   5 → 3 → 1; the +1 builder lifts it to 2; from 2 the -2 lands exactly on 0,
   which shatters.
2. `runLeaderAbility`'s self-shatter guard discounted the penalty whenever a
   Might-6+ enemy was targetable and the ability was "removal" — but
   `isRemoval` counts ANY unit damage. So the CPU traded its entire Leader
   for a **2-damage ping into a big body that survived it**, over and over:
   7.8-15.9% of games, against ≤1.2% for every other Leader.
3. The new `shatteredWinPct` diagnostic settles the "winning because of the
   trade?" question pre-fix: shattered games won **40.3%** in A and **28%** in
   C against Sentinel's own 38.4%/46.6% averages. Donation, not sacrifice.

The fix: the discount now requires the ability to actually ANSWER the threat —
for damage, value ≥ the target's remaining Grit; shatter/banish still always
qualify. Shipped, Sentinel's shatter rate reads 2.2/5.4/5.7/4.1% and the
shatters that remain win 43.8-61.8% of their games — kill-trades, not
donations. Closes.

---

## 7. The pinned suite gets three decks per Leader — and un-inverts Legendary Diver

v7.7 carry-forward #6: Legendary Diver last in the pinned suite, 28.2% in
random-deck cohort D. This pass found the instrument problem first: one pinned
deck per Leader made the suite reproducible but left **kit and deck-roll luck
confounded** — "Sentinel is the strongest pinned kit" was really "Sentinel's
kit plus the one deck `strHash` dealt it."

The suite now builds **three** pinned decks per Leader (deck #0 keeps the
exact v7.7 seed; pairs play deck k vs deck k) and the summary prints the
per-deck split and spread. What it shows, shipped state, cohort A:

- **Legendary Diver: decks [39.3 / 46.4 / 70.5]**, spread 31.2 — the single
  v7.7 deck was its WORST roll. Aggregate 49.7-54.5% across the four cohorts:
  mid-field everywhere. The kit was never weak (its `-1: Deal 2 damage to any
  target` plus `+1: Deal a card` on Resolute is one of the better kits on
  paper, which is what made the old reading suspicious). **Closes** — the
  cohort-D 27-28% random-deck number is deck composition, which is what that
  table is now labelled.
- **Sentinel of the Nether Pit survives the tougher instrument**: first in
  all four cohorts (63.7-69.6%) and its WORST of three decks still wins
  55.4-58.9%. That is now a kit reading, and it goes on the carry-forward
  list as a real one.
- The bottom cluster is consistent across all four cohorts: Avatar of the
  Abyss (34.5-42.3), Sovereign of the Dying Star (35.7-41.7), Void Mother
  (36.3-44.0) — with small deck spreads, so these are kit readings too.

---

## 8. The watch items

- **`Fate` (v7.7 #8) — closes.** Shipped at weight 0 last pass with the
  instruction "if it returns to -5, the effect is the problem." It reads
  -3.0/-2.1/-1.1/-1.6 — settled, in band, on the largest carrier samples in
  the file (n=3,515-4,629).
- **`Scorched-Earth` (v7.7 #9) — closes, and the buff is refused.** The
  watch pass says the two-cohort negative was cohort composition: this pass
  reads +8.4 (A) / no reading (B) / **-25.6** (C) / +2.7 (D), and its dominant
  carrier Sparkling Meadow sits at +2 to +5 ramp-state in every cohort that
  drafts it. A keyword whose delta swings 34 points between cohorts on three
  carriers is exactly the v7.7 §5 coin-flip; the carrier-level read is the
  honest one and it is in band. No lever.
- **`Sacred` (v7.7 #7) — carried.** +3.2/+9.7/+11.4/+8.9 — band-edge in three
  cohorts, low in one, still the most cohort-dependent keyword in the file,
  and v7.6's null trial already proved the effect text is worth ~1.5 points.
  Nothing here is actionable by keyword weight (three failed attempts on
  record) or by carrier (Stone Bubbles reads +2-5 state since its v7.6 fix).
  Stays on watch as the standing example of cohort dependence.

---

## 9. Reservation waste — retired by arithmetic

v7.7 #10 said "action it or retire it" after five passes carried. Retired,
with the reasoning at `reservationEfficiency` in the harness: ~0.6
reservations per game, ~0.17 wasted, each holding ≤3 essence for one turn ≈
0.5 essence-turns per game — under 1% of the ~90 essence a game spends,
noise inside the ~41 it already floats. Every gating idea on the table
(tighter `oppCanAttack`, threat thresholds) risks the ~2,700 reaction plays
per run that v5.2-v6.6 fought to create. The counter stays published as a
health gauge; it is no longer an open item.

---

## 10. What the pass changed in the harness

- **Three pinned decks per Leader** in `leaderPairSuite` (§7), deck #0 on the
  v7.7 seed; `leaderPairSuiteSummary` gains `byDeck` and `deckSpread`, and the
  console PRIMARY section prints them.
- **`shatteredWinPct` / `shatteredGames`** in `randomDeckLeaderDiagnostic`
  (§6) — win rate of the games a Leader was shattered in.
- **CPU: self-shatter discount requires an actual answer** (§6,
  `runLeaderAbility`).
- **Catalog test ceiling 8 → 9** to match the surcharge ceiling.

## Carry-forward items

1. **`Unbreakable` weight 7 is now the steepest price-per-text in the file**
   (§3). It was priced against the per-turn save; carriers currently read in
   band at +8.6-9.7 delta with plays held, but if they drift NEGATIVE, cut
   the weight before touching any card — and unwind the Menace/Wolf stat
   trims before either (they were substitutes for a surcharge the price now
   collects; recorded at STAT_ADJUST).
2. **Sentinel of the Nether Pit, first in all four cohorts on the three-deck
   suite (§7), worst deck ≥55%.** The instrument is now clean enough to act
   on. Its kit is a Resolve-5 `-2: Deal 2 damage to any target` — the
   repeatable-cheap-reach shape this file has repriced on three other
   Leaders. The obvious lever if it holds one more pass: the minus to -3, or
   Resolve 5 → 4.
3. **The pinned bottom cluster** — Avatar (twice-repriced to -4), Sovereign,
   Void Mother — reads last consistently with small deck spreads (§7).
   Avatar's may be an over-nerf; its minus went -2 → -3 → -4 across three
   passes measured on the pre-v8, pre-three-deck instruments. One watch pass,
   then consider walking the -4 back to -3.
4. **`Sacred` cohort dependence** (§8) — carried unchanged.
5. **Four cohorts is the standing run** — carried unchanged from v7.7 #11.
6. **Do not interleave content and balance changes** — carried from v7.7 #12.
   This pass WAS the sanctioned content pass; every trial was measured on all
   four cohorts against the immediately preceding state, and the sequence is
   recorded in §1-§3 so nothing above is a reading against a moved pool.

## Closed this pass

- ~~`Unbreakable` +14.6/+12.7/+13.9/+12.9 (v7.7 #1, top priority)~~ — closed
  IN BAND at +9.7/+8.8/+8.6/+8.6, but not by the lever the item named: the
  cap was raised and collected (§1) and the residual stood. What closed it
  was the unprinted per-proc heal (§2) and the once-per-game text (§3).
- ~~`the_pier_side_menace` / `the_wolf_of_wall_street` (v7.7 #2, #3)~~ —
  both in band, plays held, trims kept (§3).
- ~~`amethyst_starfish` (v7.7 #4)~~ — closed at effect -2, in band on four
  cohorts, plays held (§5).
- ~~Sentinel's 10.1% shatter rate (v7.7 #5)~~ — mechanism found and fixed;
  it was the CPU donating the Leader for a ping (§6).
- ~~Legendary Diver 28.2% in cohort D (v7.7 #6)~~ — un-inverted by the
  three-deck suite; the kit is mid-field, the old reading was one bad deck
  roll (§7).
- ~~`Fate` may need an effect (v7.7 #8)~~ — settled at -1.1 to -3.0 (§8).
- ~~`Scorched-Earth` buff candidate (v7.7 #9)~~ — refused on carrier-level
  evidence (§8).
- ~~Reservation waste (v7.7 #10)~~ — retired by arithmetic (§9).
- ~~Events/Items at-the-cap double penalty (v7.8 KNOWN ISSUE)~~ — fixed,
  three cards recover their docked point (§4).
