# Balance & Sim Findings — v23 (August 2026)

The pass where the one-signed Leader turned out to be one deck, and the sign
table stopped being assembled by hand.

v22 left two Leader questions and a tooling gap. Mer-King's restated condition
wanted a seventh and eighth cohort; Ruin-Walker Overseer was the pool's only
one-signed pinned-vs-random divergence and carried an explicit "diagnose,
don't buff"; and the discriminating statistic (one-signed across every
sampling cohort) could not be computed by a single-run report. All three are
answered below. **No card change ships this pass** — the fourth pass running,
and again deliberate: this pass also ships engine, match-UI and meta-screen
work (see CHANGELOG v23), and the standing rule keeps content and balance
apart. The engine work is verified sim-neutral below.

**Runs:** `npx tsx scripts/simulate-v5.ts 6 32 1337 <deckSeed>` for deckSeed
1337 (A), 42 (B), 7 (C), 99 (D), 2024 (E), 555 (F) — the standing six — plus
**777 (G)** and **4242 (H)**, the two fresh cohorts v22 carry-forward #1
required. Eight runs, `invariantCount` **0** on every one.

| Metric (A/B/C/D/E/F)    | v22                                     | v23                                     |
| ----------------------- | --------------------------------------- | --------------------------------------- |
| P1 win rate             | 44.7 / 46.5 / 46.3 / 44.7 / 45.6 / 47.3 | 44.7 / 46.5 / 46.3 / 44.7 / 45.6 / 47.3 |
| Avg game length (turns) | 20.3 / 21.6 / 21.8 / 21.1 / 20.6 / 23.5 | 20.3 / 21.6 / 21.8 / 21.1 / 20.6 / 23.5 |
| `invariantCount`        | 0                                       | 0                                       |

Identical to the decimal — the control holds. New cohorts: **G** P1 44.5%,
21.3 turns; **H** P1 46.0%, 22.0 turns. Both inside the standing spread.

**Sim-neutrality of this pass's engine work.** The engine gained log lines
(trigger resolutions, Wildfire, Siphon), an event-ordering fix in the AI's
observe hook, and three implemented-but-unprinted Leader keywords (§4). Cohort
A re-run after all of it is **byte-identical** to the pre-change run apart
from the report timestamp, and `verify:pool` (offline, against a fresh
297-row `POOL_SNAPSHOT` export) reports full parity — template, rarity
column, bundle and derived mechanics all agree.

---

## 1. Mer-King — the condition is met, and the lever is authorized but NOT spent here

v22 restated the condition in terms the data can answer: *"if a seventh and
eighth cohort keep Mer-King first and its random arm above 50% in every
cohort that samples it, spend a single price or Resolve lever on its kit,
measured alone, in a pass with no content change in it."*

Pinned suite, eight cohorts (432 games per Leader per cohort):

| Leader                      | A    | B    | C    | D    | E    | F    | G    | H    | mean     |
| --------------------------- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | ---- | -------- |
| **Mer-King**                | 67.8 | 63.7 | 65.5 | 63.7 | 66.2 | 66.9 | 67.6 | 63.2 | **65.6** |
| Avatar of the Abyss         | 57.2 | 52.5 | 59.7 | 53.7 | 56.7 | 54.9 | 54.2 | 52.5 | 55.2     |
| Ethereal Sea Witch          | 53.7 | 54.6 | 50.2 | 52.3 | 53.7 | 52.5 | 53.5 | 51.9 | 52.8     |
| Kuro, the Unseen            | 48.1 | 46.3 | 48.8 | 50.0 | 51.2 | 52.5 | 50.0 | 51.4 | 49.8     |
| Sovereign of the Dying Star | 49.8 | 48.1 | 49.3 | 51.6 | 49.1 | 50.9 | 47.2 | 50.0 | 49.5     |
| Sentinel of the Nether Pit  | 43.5 | 44.0 | 43.1 | 48.6 | 48.4 | 50.2 | 45.4 | 44.2 | 45.9     |
| Void Mother                 | 47.5 | 43.8 | 42.4 | 43.8 | 44.7 | 47.9 | 44.0 | 48.1 | 45.3     |
| Legendary Diver             | 47.9 | 41.9 | 47.0 | 45.1 | 44.4 | 40.3 | 45.4 | 45.1 | 44.6     |
| Ruin-Walker Overseer        | 45.1 | 43.3 | 40.7 | 41.2 | 42.1 | 41.7 | 42.6 | 44.4 | 42.6     |

**First in all eight.** Its random arm reads 64.3 / 52.5 / 53.5 / — / 56.7 /
70.2 / **59.9 (G)** / **58.2 (H)** — above 50% in every cohort that samples
it (D never rolled it). Both halves of the condition hold, on 3,456 pinned
games.

**The lever is NOT spent in this pass**, by the condition's own final clause:
this pass carries engine and UI work, and the whole point of the restatement
was a clean measurement. The condition transfers as carry-forward #1: the
next pass that contains nothing but the lever spends it — one price or
Resolve step, measured alone against these eight cohorts, reverted if flat
(the v18 precedent).

## 2. Ruin-Walker Overseer — diagnosed. It was one deck.

v22: *"the suite appears to be under-rating this Leader… `pinnedArchetypeRecipe`
samples keywords/effects/units/sanctums from a seeded stream — does
Ruin-Walker's kit want something those four axes cannot express? Do not buff
it. Diagnose first."*

The axes can express its kit fine. The problem is a single roll of them.
Per-deck cross-cohort means (eight cohorts, 48 games per deck per cohort):

```
deck        #0    #1    #2    #3    #4    #5    #6    #7    #8
mean      44.3  15.6  37.5  51.8  59.6  40.6  51.6  46.6  36.2
```

**Pinned deck #1 reads 15.6% across eight cohorts and never once climbs above
18.8** (12.5–18.8, n=384). Its recipe — keywords `Ambush + Hardened`, effects
`recover + erode`, 35 units, 6 sanctums — drafts the Root/Void pool's
understatted utility bodies: twelve units costing 4–6 with 2/1 and 3/2
stat-lines whose budgets went to keyword surcharges, plus effect themes that
never touch the board. Meanwhile decks #3, #4 and #6 sit at 51–60%: the kit
is playable when the recipe rolls a real deck.

Exclude deck #1 and the other eight average **46.0%** — mid-field, beside
Sentinel and Void Mother, and consistent with its ~51% random arm. One
permanent lemon in nine fixed decks drags the mean ~3 points in the same
direction in every cohort, which is exactly what a one-signed divergence
looks like (−3.5 / −5.4 / −14.7 / −8.4 / −9.0 / — / −15.1 / −0.5, mean −8.1,
still the pool's only one-signed row).

**And it is not special.** Aggregating every Leader's per-deck splits: six of
nine carry at least one deck 15+ points under their own deck median —
Ethereal's #8 at **15.4%**, Sentinel's #2 at **16.4%**, Ruin-Walker's #1 at
**15.6%**, with Mer-King (#4, 40.1%), Avatar (#3, 40.9%) and Kuro (#2, 32.0%)
carrying milder ones. A 9-deck pinned mean is hostage to its lemon count.

Consequences, none of which is a card change:

- **Ruin-Walker's 42.6% pinned mean is not a kit reading.** Its deck-median
  mean is 44.3 — above Legendary Diver's — and its non-lemon mean is 46.0.
  The item closes as **instrument, not card**. No buff.
- **Read the median row of the suite, not the mean**, whenever a Leader's
  `deckSpread` is wide. The report has printed `median` since v16; the mean
  column is the one this doc's tables have always quoted, and for
  lemon-carrying Leaders it is the wrong column.
- The per-deck cross-cohort aggregation that found this is now a script — §3.

## 3. Carry-forward #3, closed: the sign table is mechanized

v22 retired `|gap| >= 10` as a gate and named the real statistic — one-signed
across every sampling cohort — which a single-run report cannot compute:
*"either the sim gains a cross-run mode or the sign table gets assembled by
hand each pass."*

**`scripts/aggregate-cohorts.ts`** is the cross-run mode. Fed the pass's
report JSONs (`npx tsx scripts/aggregate-cohorts.ts docs/sim-runs/v5-*.json`,
in cohort order) it prints: the pinned table with cross-cohort means and
median-of-medians, the pinned-minus-random gap table with an explicit
`ONE-SIGNED` flag computed over sampling cohorts only (unsampled cohorts stay
`—`, never zero), and the per-deck cross-cohort means with a `LEMON` flag for
any deck 15+ points under its Leader's deck median. §2's findings are its
first output. It is a reading instrument, not a gate — it always exits 0.

## 4. Three Leader keywords, implemented and deliberately unprinted

The roadmap's standing content item: Leaders carry three keywords where every
other type has six or seven, and v7.8 built the `LEADER_NEXT_KEYWORDS` /
`'ldr-kw-next'` plumbing so a future generation could print without
re-rolling any existing Leader. This pass implements that generation
engine-side — **Onslaught** (Ember: your units get +1 Might while attacking,
Leader fielded), **Beacon** (Light: your invoked Leader restores 1 Vitality
at Dawn), **Dread** (Void: enemy units get −1 Might while your Leader is
fielded) — with eight pinned tests (`keywords-v23-leaders.test.ts`), registry
entries, by-analogy weights (1 / 1 / 3), and telemetry procs.

**None is printed.** `LEADER_NEXT_KEYWORDS` stays empty, `UNPRINTED_KEYWORDS`
in keywords.ts names the three, the catalog's dead-text guard exempts exactly
that list (and fails the moment one prints while still listed), and How to
Play's glossary skips them. Pool parity is verified above. Two reasons, both
from the record: the v7.5 lesson (a roll-band print is a content change that
moves the meta — sequence it, don't interleave it with a measuring pass), and
a plumbing fact the next pass needs to know: **the 'ldr-kw-next' path only
reaches Leaders the frozen path left keyword-less, and today that is exactly
one card** — Sentinel of the Nether Pit (Ember/Light, which would take
Onslaught on-colour). Printing Beacon or Dread on anyone needs a per-Leader
grant, which is a design decision, not a plumbing one.

An experimental cohort with the print switched on temporarily (Sentinel +
Onslaught, and scratch grants of Beacon/Dread) is recorded in §5 — run,
measured, and reverted; nothing of it ships.

## 5. The print experiment (reverted — recorded for the next content pass)

Cohorts A and B were re-run once with the print switched on temporarily:
`LEADER_NEXT_KEYWORDS` filled (which gave Sentinel of the Nether Pit
**Onslaught**, on-colour, +1 invoke cost via the surcharge), plus scratch
grants of **Beacon** to Ethereal Sea Witch (cost unchanged — the +1 weight
rounds away next to Resolute's) and **Dread** to Void Mother (+2 cost).
Both runs: 0 invariants, headline outcomes inside the standing spread
(P1 45.2 / 46.7, turns 20.5 / 21.8). Pinned rows, baseline → experiment:

| Leader (keyword gained)        | A base → exp | B base → exp |
| ------------------------------ | ------------ | ------------ |
| Sentinel + Onslaught (+1 cost) | 43.5 → 45.4  | 44.0 → 49.1  |
| Ethereal + Beacon (±0 cost)    | 53.7 → 58.3  | 54.6 → 56.5  |
| Void Mother + Dread (+2 cost)  | 47.5 → 48.8  | 43.8 → 43.5  |
| Mer-King (control, unchanged)  | 67.8 → 65.7  | 63.7 → 64.4  |

Reading, with the usual single-carrier caveat (a Leader-carried keyword's
number is confounded with its Leader's whole cohort, and two cohorts is a
direction, not a measurement): **all three keywords are playable and none is
degenerate.** Onslaught lifts Sentinel in both cohorts even after paying a
point of cost; Beacon reads +2 to +5 on Ethereal at no cost, which makes its
weight-1 (rounds-to-nothing beside Resolute) the number to watch if it ever
prints on a Resolute Leader; Dread is roughly cost-neutral at +2 — the aura
pays its own surcharge and no more. Mer-King stays first in both runs, so no
print here rescues or worsens the §1 story. **Everything in this section was
then reverted**; the shipped pool is byte-identical (header). The next
content pass can start from these numbers instead of from zero.

## Carry-forward items

1. **Mer-King — condition MET on eight cohorts (§1); the lever is authorized
   and unspent.** The next pass that contains no content, engine or UI work
   spends ONE price or Resolve lever on its kit, measured alone. A lever that
   measures flat gets reverted, not shipped. Do not re-litigate the
   condition; it is answered.
2. **Ruin-Walker Overseer — closed as instrument, not card (§2).** Do not
   buff it on the pinned mean. If a future pass wants a better instrument:
   either report the deck-median as the headline (already printed), or
   consider re-rolling pinned recipe #1's seed for ALL Leaders at once (a
   re-baseline, so it wants its own pass) — never for one Leader alone.
3. **Persistent-lemon decks are a property of the suite, not of Ruin-Walker**
   (six of nine Leaders, §2). Any future per-Leader conclusion drawn from the
   pinned MEAN should check `aggregate-cohorts.ts`'s LEMON flags first.
4. **Printing the v23 Leader keywords** (§4) is the next content pass's
   decision: filling `LEADER_NEXT_KEYWORDS` reaches only Sentinel of the
   Nether Pit; Beacon/Dread need a per-Leader grant mechanism. Whatever
   prints re-baselines the pool — do not interleave with a balance lever, and
   re-run `fetch:cards`/`db:sync` so the three catalogs stay in step.
5. **`Unbreakable` weight 7** — carried unchanged from v16 #1 through v22 #6
   (trigger: carriers drifting negative; unwind order: stat trims, then
   weight).
6. **`Sacred` cohort dependence** — carried unchanged.
7. **Do not interleave content and balance changes** — carried, and honoured:
   engine/UI work verified byte-identical (header), no lever spent, no print.

## Closed this pass

- ~~Mer-King's unusable gate (v22 #1)~~ — restated condition measured on
  eight cohorts and MET; the spend itself is carried, the measurement is
  done.
- ~~Ruin-Walker one-signed divergence (v22 #2)~~ — diagnosed: pinned deck #1
  is a persistent 15.6% lemon; kit is mid-field without it. Instrument, not
  card.
- ~~Sign table assembled by hand (v22 #3)~~ — `scripts/aggregate-cohorts.ts`.
- ~~Sovereign of the Dying Star's unsynced `cards` row (v22 #4, two passes
  old)~~ — the live row now reads
  `{"generic":2,"pips":{"Ember":1,"Void":1}}` and `verify:pool` passes with
  full parity against a fresh 297-row snapshot. Closed.
- ~~Six cohorts when the question is about one Leader (v22 #5)~~ — this pass
  ran eight; the practice is folded into #1's protocol.
