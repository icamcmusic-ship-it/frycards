# Balance & Sim Findings — v7.2 (July 2026)

Latest CPU-vs-CPU balance pass. Supersedes the v6.9 findings doc, deleted
this pass (only the newest sim doc is kept). Raw report: `docs/sim-runs/`
(latest JSON only; `.gitignore`d).

**Runs:** `npx tsx scripts/simulate-v5.ts 6 32 1337` (cohort A) and
`... 6 32 1337 42` (cohort B) — 5,952 games each, 32 random archetype decks,
same game seed, two independent deck cohorts. **Invariant violations: 0** on
both, before and after every change in this pass, across all seven trial
pairs run.

Same bar as v6.6-v6.9: a change ships only if its outlier's Wilson 95%
interval excludes its own in-deck baseline **and** it reproduces with the
same sign in both cohorts. This pass leaned on the second half of that bar
harder than any before it, and the two most interesting results are both
things the bar refused to let ship.

---

## 1. Live-vs-sim pool drift, again — and it was the six cards in the brief

The v6.9 doc's headline was that `cards.rarity`, `cards.template` and the
bundled `generated-cards.ts` had silently disagreed for ten cards, and that
`npm run verify:pool` now guards it "permanently". **The guard was added and
then not run.** Re-derived this pass:

| card | live (both DB columns) | bundled / sims |
|---|---|---|
| `absolute_eruption` | Mythic | **Ultra-Rare** |
| `apex_nanite_shinobi` | Mythic | **Ultra-Rare** |
| `avatar_of_the_abyss` | Mythic | **Ultra-Rare** |
| `crimson_vector_commander` | Mythic | **Ultra-Rare** |
| `spectral_leviathan` | Mythic | **Ultra-Rare** |
| `submerged_starfall` | Mythic | **Ultra-Rare** |

v6.9 fixed the database and never regenerated the bundle, so every number in
that doc was measured on a pool where three of the eight Leaders had a
different Resolve and a different kit than the live game shipped. The two
Leader nerfs it recorded as its main result — Avatar and Crimson Vector —
were tuned against Leaders the live client did not have.

**Actioned:** all six moved to **Full-Art**, in the `rarity` column, the
`template` jsonb and the bundled catalog together. All three sources now
digest identically (`5ddd58b02bd1d4e951d6e2acd7ae3120`, 292/292).

This is not a bookkeeping note. `seedOf` is `id|type|rarity`, so a rarity
change **reprints the card**, and `mapLeader`'s Resolve is
`3 + floor(rarityTier / 2)` — the three Leaders drop from Resolve 6 to 5.
That single line is the largest balance change in this pass and it was not
chosen for balance reasons:

| Leader | before | after (rarity move alone) |
|---|---|---|
| Avatar of the Abyss | 65.5 / 76.1 | 54.9 / 64.9 |
| Crimson Vector Commander | 58.7 / 68.4 | 52.4 / 60.2 |

Both v6.9 nerfs, re-earned for free. **The lesson to carry: a rarity edit is
a balance edit.** `npm run verify:pool` catches the drift, but only if it is
actually run — it is now called out in the README next to the rarity ladder.

---

## 2. The Leader spread had a structural cause, and it was one line

`mapLeader` takes the minus ability from `identity[0]` and the plus from
`identity[1]`. Neither is rolled. They are the literal array order in
`LEADER_COLORS`, hand-written in `colors.ts`. Which of a Leader's two colours
supplies its **answer to the enemy board** is decided by which one happens to
be typed first:

| Leader | pair | minus ability it gets |
|---|---|---|
| `avatar_of_the_abyss` | Shadow, Void | `-2: Shatter` (the best in the game) |
| `apex_nanite_shinobi` | **Gale**, Shadow | `-1: Recover a friendly unit` |
| `ethereal_sea_witch` | **Tide**, Light | `-1: Deal a card` |
| `ruinwalker_overseer` | **Root**, Void | `-2: A friendly unit gets +2/+2` |

Avatar is the Leader that has topped the spread for four consecutive passes.
Apex, Ethereal and Ruin-Walker are the three that finished below baseline in
both cohorts. Apex's minus is the clearest case: the CPU declines to use it
almost entirely (179 uses across 2,604 games in cohort A) and loses 79% of
the games where it does, while its Shadow half — Shatter — is unreachable
because it is written second.

**Actioned:** new `LEADER_MINUS_ABILITY_OVERRIDE` lever, the effect-side
counterpart to v6.3's resolve-cost override and v6.9's plus-ability override.
Each of the three gets an ability drawn from its **own other colour** — what
a colour-aware roll would already have produced. The balanced Leaders are
untouched.

Three of the five trials this took are the useful record:

| Leader | trial | result (A / B) |
|---|---|---|
| Apex | `-1: -2/-2` | 61.6 / 55.6 — **overshot**, last place to FIRST in A |
| Apex | `-1: -1/-1` | 39.0 / 34.0 — **undershot**, cohorts split |
| Apex | `-2: -2/-2` **(shipped)** | 55.9 / 50.9 |
| Ruin-Walker | `-2: Banish` | 68.2 / 59.3 — **overshot**, first by nine in A |
| Ruin-Walker | `-3: Banish` **(shipped)** | 61.8 / 50.1 |
| Ethereal | `-1: 2 dmg to enemy unit` **(shipped)** | 53.6 / 45.5 |

Apex's two failures make the same point from both sides: the effect **size**
was never the problem, the **frequency** was. `-1: -2/-2` at Resolve 5 is
five permanent shrinks a tank, which is removal on anything the deck plays;
shrinking the effect to `-1/-1` made it too small to answer anything. Pricing
the original effect at `-2` landed it. Ruin-Walker repeats it: unconditional
removal a full tank buys **twice** is the strongest kit shape in the game
however it is worded, which is also why Avatar's Shatter has now been repriced
twice.

### Leader spread, v6.9 → this pass

| Leader | A before | A after | B before | B after |
|---|---|---|---|---|
| Ruin-Walker Overseer | 46.4 | **61.8** | 42.9 | **50.1** |
| Avatar of the Abyss | 54.9 | 48.7 | 64.9 | 60.3 |
| Crimson Vector Commander | 52.4 | 46.6 | 60.2 | 57.6 |
| Apex Nanite Shinobi | 30.6 | **55.9** | 38.2 | **50.9** |
| Ethereal Sea Witch | 40.4 | **53.6** | 34.6 | **45.5** |
| Legendary Diver | 54.7 | 48.5 | 59.5 | 50.3 |
| Mer-King | 53.0 | 46.2 | 56.7 | 46.6 |
| Sovereign of the Dying Star | 47.8 | 43.9 | 51.2 | 46.0 |

**Spread: 24.3 → 17.9 (A) and 30.3 → 14.8 (B)** — against v6.9's 31.6 and
39.8, the tightest this project has recorded, and the first pass where the
two cohorts agree on the spread's *size*.

### The counter-example that keeps this honest

**Mer-King has exactly the same fully non-interactive kit** (`-1: Deal a
card` + `+1: Restore 2 Vitality` — byte-identical to Ethereal Sea Witch's
pre-v6.9 kit) and sits at 46.2 / 46.6, dead centre. So "no answer to the
board" is **necessary but not sufficient** to sink a Leader; the deficit
appears when it is combined with a colour pair whose card pool also cannot
answer. Mer-King is deliberately left alone, and
`edgecases-v72.test.ts` asserts it is the *only* remaining no-answer kit so a
future pass cannot quietly "fix" it on a theory the data does not support.

---

## 3. Cost is not a lever for Locations — the measurement is confounded

Sacred has been flagged for six consecutive passes (+24.4 n=425 / +17.3 n=985
this pass, carriers winning 74.8% / 66.4% outright — the widest and
best-sampled keyword signal on the board). Three separate cost trials were
run at it. **None of them ever moved the number down in both cohorts:**

| trial | Sacred delta (A / B) |
|---|---|
| baseline (Sacred weight 1) | +24.4 / +17.3 |
| Sacred weight 1 → 3 (+1 cost on all 7 carriers, verified card by card) | +25.0 / +26.9 |
| Sacred 1, `stone_bubbles` +1 | still gated at +12.3, carriers 70.1% |
| Sacred 1, `stone_bubbles` +2 | +30.9 (A) / +7.9 (B) |

The weight raise also revealed what the keyword's signal actually is: it cut
Sacred carrier games from 425/985 to 234/604, and the surviving count was, in
*both* cohorts, exactly `stone_bubbles`' own play count. The other six Sacred
Locations had simply been priced out of every deck — a nerf that deleted six
cards from the draftable pool and moved no win rate.

The wrong-way drift is the signature of a **selection effect in the metric**,
not an underpriced card. A Location is ramp. It is only ever played in games
where the essence to play it existed, and a *more expensive* Location is only
played in games where *more* ramp existed — which are games the player was
already winning. "Win rate conditional on having played it" therefore rises
with price by construction, and the archetype-normalized delta inherits it.

The corroboration is in the final outlier lists: **every single gated
overperformer that reproduces in both cohorts is a Location** — Stone Bubbles,
Kinetix Blacksite Cavern, Haunted Submarine, Heart Coral, Obsidian Bore Site,
Galleon Shipwreck, Magma Conduit Network, Heart of the Thermal Grid, Black
Smoker, Tethered Orbs — and most of them *already* carry +1 or +2 from
previous passes. This is how `abyssal_pathway` reached +3, and why
`sand_portal`, `glass_kelp_forest`, `jawbone_span`, `magma_conduit_network`
and `nanite_culture_lab` all reached +2 without ever settling.

**Actioned:** Sacred reverted to weight 1, `stone_bubbles` left at its natural
cost, and both decisions recorded in-code at the sites a future pass will read.
**The next lever is a harness fix, not another point of cost** — see
carry-forward #1.

Also recorded, because it has silently wasted several past passes:
`keywordCostAdj` is `Math.round(w / 2)`, so `KEYWORD_COST`'s effective
resolution is **two**. A 1 → 2 or 3 → 4 step is a byte-for-byte no-op for every
single-keyword carrier. v6.9 hit this on Resonant ("at weight 1 the surcharge
still rounds up to a full point") without naming the general rule.

---

## 4. Doublestrike: a carry-forward closed by looking at it

v6.9 carried Doublestrike forward for a second point after four consecutive
positive passes. **Not actioned, and the item is closed.** Doublestrike has
only **two carriers in the entire pool**, and their absolute win rate was
49.9% (n=337) and 44.4% (n=1062) — *below even in both cohorts*. The
archetype-normalized +6.9 / +6.2 that flagged it for four passes is measuring
how badly those two cards' Leader cohorts do, not the keyword. Nerfing a
keyword whose carriers are already losing chases a cohort artifact. (Both
carriers now sit at 61.1% / 58.8% after this pass's Leader and AI changes,
with no change to Doublestrike at all — which is the point.)

---

## 5. Card actions

Two cards cleared both gates and both settled on one point:

| card | A | B | action | after |
|---|---|---|---|---|
| `submerged_statue` | +9.6 (n=208) | +8.9 (n=314) | **+1 cost** (new) | out of both lists |
| `dr_aries_chief_biogeneticist` | +9.8 (n=162) | +10.9 (n=900) | **+1 cost** (new) | out of both lists |
| `ashen_circle_rite` | -3.8 (n=1153) | -3.6 (n=1826) | **-1 → -2 cost** | out of both lists |

`ashen_circle_rite` is the only underperformer to clear the gate in either
cohort, and at n≈1,150/1,825 it is the best-measured card in either list.

**Dropped from the carry-forward list:** `galleon_shipwreck` and
`resonant_shuriken` (v6.9 carry-forward #2) no longer reproduce as
*two-cohort* signals — each now clears the gate in one cohort only, which is
exactly the bar's purpose. Both are Locations/Charms sitting in the confound
described in §3 and should not take a second point until that is resolved.

---

## 6. CPU reasoning lapses

`missedLethal` 0, `wellspringMisplay` 0, `leaderShatterBlunder` 0,
`colorCloggedGames` 0, `keptColorDeadHand` 0 in both cohorts — all hold.

**`charmOnDoomedUnit` actioned for the first time.** It has been the largest
lapse counter on the board for five passes (~2,200-2,350 a cohort) and had
never been targeted. Two fixes, both in `ai.ts`:

- **`bestBondTarget` is now survivability-aware.** It scored durability, but
  "sturdiest body" and "body that survives the turn" are different questions —
  the sturdiest body is also the one `chooseAttackers` sends into the biggest
  clash and the one every removal spell is pointed at. It now checks whether
  the enemy's ready board can actually reach the target (Venomous puts every
  non-Unbreakable body at risk regardless of Grit).
- **`chooseAttackers`' `favorableTrade` branch now counts the Charms.** A unit
  that dies in a "favorable" trade takes its bonded Charms with it, so the
  trade has to beat the unit *and the cards stapled to it*. Soulbound Charms
  return to hand and are exempt.

| counter | A | B |
|---|---|---|
| `charmOnDoomedUnit` | 2,216 → **1,902** (-14%) | 2,348 → **1,872** (-20%) |
| `venomousSuicide` | 1,878 → 1,905 | 1,156 → **995** (-14%) |
| `guardDiesForNothing` | 9,661 → 9,537 | 9,794 → 9,541 |
| `removalOnNonThreat` | 110 → 95 | 102 → 121 |

Unchanged and still unactioned: `guardDiesForNothingDiscretionary` stays at
~200 out of ~9,500, i.e. **98% of guard deaths are forced** and guard-trade
quality remains resolved. Reservation waste 32.6% / 30.6%, up from ~28% and
now the largest un-actioned lapse.

---

## 7. Headline results (post-change)

| Metric | A | B | Read |
|---|---|---|---|
| P1 win rate | 44.8% | 45.6% | Down ~1pt vs v6.9 (47.0 / 45.9). |
| Seat-swap first-seat | 43.0% | 49.6% | B fixed (v6.9: 45.9); **A regressed** — see carry-forward #3. |
| Avg game length | 20.2 | 20.8 | Up ~1 turn vs v6.9 (19.4 / 18.8). |
| Vitality wins | 95.1% | 95.1% | Flat vs v6.9 (94.1 / 96.0). |
| Clashes/game | 8.60 | 8.71 | Flat vs v6.9 (8.59 / 8.42). |
| Comeback rate | 32.0% | 31.0% | Up vs v6.9 (29.2 / 26.7). |
| Pool coverage | 59.2% | 60.2% | Flat vs v6.9 (58.1 / 59.9). |
| Leader spread | **17.9** | **14.8** | Was 31.6 / 39.8. |
| Invariant violations | 0 | 0 | |

---

## Carry-forward items

1. **The Location metric (top priority).** Every two-cohort gated
   overperformer in this pass is a Location, cost provably does not move them,
   and past passes have stacked +2 and +3 on several chasing it. The fix is in
   `scripts/simulate-v5.ts`, not `cardpool.ts`: compute a Location's residual
   against a **ramp-matched** baseline (cards played on the same turn number,
   or at the same locations-in-play count) rather than the flat in-deck
   baseline. Until that lands, **no Location should take another cost point.**
2. **Sacred** — +26.3 / +17.4 and unresolved. Blocked on #1; if the
   ramp-matched baseline still shows it, the next lever is the effect, not the
   price (it is the only "free value every turn on a near-permanent" text in
   the pool; the Unit equivalent, Radiant, reads +3.2 / +2.7 and is fine
   precisely because units die).
3. **First-seat edge in cohort A: 43.0%.** B is even at 49.6%, A moved the
   wrong way from 48.8%. Single-cohort, so no action, but the seat-swap suite
   is the one place cohort composition is *supposed* to be controlled out, so
   a one-cohort reading there is more suspicious than elsewhere. Re-check with
   a larger `LEADER_PAIR_SEAT_GAMES`.
4. **Ruin-Walker Overseer 61.8 (A) / 50.1 (B)** and **Avatar of the Abyss
   48.7 (A) / 60.3 (B)** — each tops one cohort and sits mid-table in the
   other. Neither reproduces, so neither is actioned. Both took a lever this
   pass (Ruin-Walker directly, Avatar via the Resolve drop); re-check next
   pass before touching either.
5. **Sovereign of the Dying Star 43.9 / 46.0** — now the bottom in both
   cohorts, having been mid-table before. It is the fourth Leader whose
   `identity[0]` (Ember) at least gives it reach, so it is *not* the §2
   failure mode. Genuinely new; watch one pass before reaching for a lever, on
   the same "don't stack a fourth Leader change in one pass" rule that held
   Avatar back.
6. **`Entropic` -0.5 (A) / -9.7 (B)** and **`Thriving` +15.6 (A) / +2.5 (B)** —
   both still sign-flipping at n≈200-300, the small-n cohort signature v6.6
   diagnosed. Thriving has now flipped sign in three consecutive passes. Watch,
   do not act.
7. **Reservation waste 32.6% / 30.6%** — up from ~28% and now the largest
   un-actioned lapse counter. The reaction-window content shortage named in
   v6.9's carry-forward #7 is unchanged and is probably the cause.

## Closed this pass

- ~~Doublestrike~~ — four-pass carry-forward closed *without* action; the
  signal was two cards' cohorts, not the keyword (§4).
- ~~Live-vs-sim pool drift~~ — six cards resynced, all three sources digest
  identically. The v6.9 guard existed and was not run; the README now says so.
- ~~Leader spread has no lever for a bad minus ability~~ —
  `LEADER_MINUS_ABILITY_OVERRIDE` added and validated on all three Leaders
  that finished below baseline in both cohorts.
- ~~Apex Nanite Shinobi~~ (v6.9 carry-forward #4, "needs a pinned-deck run to
  separate kit strength from cohort composition") — resolved without one: both
  cohorts agreed it was last once the rarity fix gave cohort B a real sample.
- ~~Ethereal Sea Witch / Ruin-Walker Overseer~~ (v6.9 carry-forward #5) — the
  settling pass happened, both were still below baseline, both took their
  second lever.
- ~~`charmOnDoomedUnit`~~ — largest lapse counter for five passes, targeted
  and down 14-20%.
- ~~`galleon_shipwreck` / `resonant_shuriken`~~ (v6.9 carry-forward #2) — no
  longer two-cohort signals; folded into carry-forward #1.
