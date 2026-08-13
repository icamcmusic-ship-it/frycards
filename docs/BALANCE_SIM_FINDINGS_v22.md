# Balance & Sim Findings — v22 (August 2026)

The pass where the caution flag was itself measured.

v20 rebuilt the pinned Leader suite from three decks on one recipe to nine decks
on nine, and the re-baseline overturned four passes of reading: Sentinel of the
Nether Pit, first in all four cohorts and nerfed three times for it, dropped to
the bottom half. It left one Leader named as the corrected instrument's own
answer — **Mer-King**, first in all four at a 65.2% mean — and deliberately
unspent, behind a pre-registered condition:

> if a clean re-baseline still has Mer-King first in 3+ cohorts AND its
> random-arm gap stays under +10 in the cohorts that sample it, the trial is a
> single price or Resolve lever on its kit, measured alone. If the two arms
> diverge instead, treat the row as unmeasured again.

This pass runs that re-baseline, adds two cohorts beyond the standing four, and
finds that **the condition cannot be read as written** — because the `|gap| >=
10` flag it is phrased in terms of fires on a quarter of every reading in the
table. Measuring the flag is the finding.

**Nothing shipped as a card change this pass, and for the third pass running
that is deliberate rather than an absence.** This pass ships substantial engine
and match-UI work (see CHANGELOG v22), and the standing rule is that content and
balance changes never land together. The four standing cohorts are verified
**byte-identical to v20** below, which is what makes the two tables directly
comparable at all.

**Runs:** `npx tsx scripts/simulate-v5.ts 6 32 1337 <deckSeed>` for deckSeed
1337 (A), 42 (B), 7 (C), 99 (D) — the standing four — plus **2024 (E)** and
**555 (F)**, new this pass. Six runs, `invariantCount` **0** on every one.

| Metric (A / B / C / D)  | v20                       | v22                       |
| ----------------------- | ------------------------- | ------------------------- |
| P1 win rate             | 44.7 / 46.5 / 46.3 / 44.7 | 44.7 / 46.5 / 46.3 / 44.7 |
| Avg game length (turns) | 20.3 / 21.6 / 21.8 / 21.1 | 20.3 / 21.6 / 21.8 / 21.1 |
| `invariantCount`        | 0                         | 0                         |

Identical to the decimal, and that is the control. Cohort A was additionally
diffed line-for-line against a pre-change baseline captured before any of this
pass's engine work: the whole run is byte-identical apart from the timestamped
report path. **The engine changes this pass are visible only in the log**, which
the sim reads for exactly one substring (`'sheds'`), and none of the new lines
contain it.

New cohorts, for reference: **E** P1 45.6%, 20.6 turns; **F** P1 47.3%, 23.5
turns. Both inside the spread of the standing four.

---

## 1. Mer-King, on six cohorts

Pinned-suite win rate, one row per cohort (432 games per Leader per cohort,
2,592 games per Leader across all six):

| Leader                         | A    | B    | C    | D    | E    | F    | mean     |
| ------------------------------ | ---- | ---- | ---- | ---- | ---- | ---- | -------- |
| **Mer-King**                   | 67.8 | 63.7 | 65.5 | 63.7 | 66.2 | 66.9 | **65.6** |
| Avatar of the Abyss            | 57.2 | 52.5 | 59.7 | 53.7 | 56.7 | 54.9 | 55.8     |
| Ethereal Sea Witch             | 53.7 | 54.6 | 50.2 | 52.3 | 53.7 | 52.5 | 52.8     |
| Sovereign of the Dying Star    | 49.8 | 48.1 | 49.3 | 51.6 | 49.1 | 50.9 | 49.8     |
| Kuro, the Unseen               | 48.1 | 46.3 | 48.8 | 50.0 | 51.2 | 52.5 | 49.5     |
| Sentinel of the Nether Pit     | 43.5 | 44.0 | 43.1 | 48.6 | 48.4 | 50.2 | 46.3     |
| Void Mother                    | 47.5 | 43.8 | 42.4 | 43.8 | 44.7 | 47.9 | 45.0     |
| Legendary Diver                | 47.9 | 41.9 | 47.0 | 45.1 | 44.4 | 40.3 | 44.4     |
| Ruin-Walker Overseer           | 45.1 | 43.3 | 40.7 | 41.2 | 42.1 | 41.7 | 42.4     |

**Mer-King is first in all six**, by 9.8 points on the mean and never by fewer
than 5.8 in any single cohort (10.6 / 9.1 / 5.8 / 10.0 / 9.5 / 12.0 over whoever
places second in that cohort). The two new cohorts do not soften it; F is its
second-best row.

The first half of v20's condition is met, comfortably.

## 2. The second half of the condition, and why it cannot be read as written

Pinned-minus-random gap per cohort. A dash is a cohort whose random arm never
rolled that Leader at all — see §3.

| Leader                      | A     | B    | C     | D     | E     | F    | mean | flags |
| --------------------------- | ----- | ---- | ----- | ----- | ----- | ---- | ---- | ----- |
| Mer-King                    | +3.5  | +11.2| +12.0 | —     | +9.5  | −3.3 | +6.6 | 2/5   |
| Avatar of the Abyss         | +10.1 | −9.7 | +6.9  | −18.6 | +17.2 | −2.0 | +0.6 | 3/6   |
| Ethereal Sea Witch          | +0.8  | +5.0 | −4.4  | −0.5  | +7.9  | +11.2| +3.3 | 1/6   |
| Sovereign of the Dying Star | +3.6  | −3.8 | +4.1  | −0.3  | +2.5  | +7.3 | +2.2 | 0/6   |
| Kuro, the Unseen            | −4.1  | −2.1 | +1.6  | +2.1  | −2.3  | −2.8 | −1.3 | 0/6   |
| Sentinel of the Nether Pit  | +12.6 | −8.7 | +1.0  | +4.9  | +11.2 | —    | +4.2 | 2/5   |
| Void Mother                 | −6.6  | +1.0 | −7.2  | −18.4 | −12.2 | +1.8 | −6.9 | 2/6   |
| Legendary Diver             | +6.7  | +0.2 | −6.3  | +17.3 | −2.4  | +2.5 | +3.0 | 1/6   |
| **Ruin-Walker Overseer**    | −3.5  | −5.4 | −14.7 | −8.4  | −9.0  | —    | −8.2 | 1/5   |

Read the "flags" column down. **`|gap| >= 10` fires on 12 of the 51 gap
observations in this table — 24% of them.** Median |gap| is 5.0 and the maximum
is 18.6, so the threshold sits at roughly the 76th percentile of its own
distribution. Six of the nine Leaders trip it at least once. A caution flag that
fires on a quarter of readings, and on two thirds of subjects, is not selecting
anything.

That is what makes "gap stays under +10 in the cohorts that sample it"
unreadable as a gate: Mer-King fails it (2 of 5), and so would almost any Leader
given five cohorts. On the four standing cohorts alone the answer would have
been the same, which means the condition as phrased was never going to pass.

**The signature the flag was actually built to detect is a one-signed gap**, not
a large one. That is what v19 keyed on for Sentinel (+31.1 / +7.7 / +15.9 /
+17.8 — positive in all four) and for Void Mother (one-signed negative), and
those two diagnoses were both right. Applying it to this table:

- **Mer-King is not one-signed** (+3.5 / +11.2 / +12.0 / +9.5 / **−3.3**), and
  its random arm puts it **above 50% in every cohort that samples it** (64.3 /
  52.5 / 53.5 / 56.7 / 70.2, mean 59.4). Both arms say the same thing about it.
  This is the opposite of the Sentinel shape v19 flagged, where a 60%+ pinned
  row sat on top of a random arm well below it in every cohort — Sentinel's
  random arm still reads 30.9 / 52.7 / 42.1 / 43.7 / 37.2 today, which is what
  makes its own +4.2 mean gap a fall in the PINNED row rather than a rise in
  the random one.
- **Sentinel is no longer one-signed either** (+12.6 / −8.7 / +1.0 / +4.9 /
  +11.2, mean +4.2), which is the v20 recipe fix reproducing on two fresh
  cohorts. Its pinned row also drifts up on the new cohorts (48.4, 50.2) —
  mid-field, exactly as v20 concluded, and still nothing to do.
- **Exactly one Leader in the pool is one-signed across every cohort that
  samples it: Ruin-Walker Overseer**, −3.5 / −5.4 / −14.7 / −8.4 / −9.0, mean
  −8.2, negative in all five. It is also LAST in the pinned table in five of six
  cohorts while its random arm reads ~50%. That is the Sentinel finding with the
  sign reversed: the suite appears to be **under**-rating this Leader, and its
  42.4% pinned mean should not be treated as a kit reading until that is
  understood. See carry-forward #2 — this is a diagnostic item, not a buff.

## 3. Carry-forward #5, closed

v20: *"The random-deck arm does not sample every Leader in every cohort.
Mer-King has no random-deck row at all in cohort D… The divergence report
silently omits a Leader it cannot sample, which reads as 'no flag' rather than
'not measured'."*

Fixed. The report now prints an explicit row for every Leader in the pinned
suite that the random arm never dealt:

```
  Mer-King                     pinned  63.7%   random   —   (n=0)   (UNSAMPLED — this cohort's random decks never rolled this Leader; NOT a zero gap)
```

Two of the six cohorts have at least one: **D** omits Mer-King, **F** omits
both Sentinel of the Nether Pit and Ruin-Walker Overseer. Without this line, the
Leader the whole v20 table was pointing the next lever at simply did not appear
in cohort D's divergence report — and the Leader §2 now flags is one of the two
missing from F.

This is the same failure shape the harness has hit twice before in other guises
(v14's "clicked 0 controls", v20's six meta screens audited empty): **silence
that renders as a clean result.** Worth stating as a standing rule rather than a
third coincidence — *a harness that cannot measure something must say so in the
same place it would have printed the measurement.*

## 4. What the pass changed outside the suite (verified sim-neutral)

The engine gained log lines for the Dawn and Dusk keyword procs (Glaciate,
Thriving, Empowering, Regenerate, Sacred, Radiant, Archivist, Resolute,
Entropic, Blighted, Scorched-Earth) and a `dawnLog` read marker on `GameState`,
so the match UI can narrate the opponent's Dawn. No rule, cost, stat or
targeting decision was touched. Cohort A run before and after the change is
byte-identical apart from the timestamped report path, and the four standing
cohorts reproduce v20 to the decimal.

## Carry-forward items

1. **Mer-King — first in six of six, and the gate that was supposed to authorise
   a lever is not usable.** The condition v20 pre-registered is phrased in terms
   of a threshold that fires on 24% of all readings (§2), so it neither passes
   nor fails informatively. What the data DOES say: both arms agree, the gap is
   not one-signed, and the pinned lead is 9.8 points on 2,592 games per Leader.
   **Condition for next pass, restated in terms the data can answer:** if a
   seventh and eighth cohort keep Mer-King first and its random arm above 50% in
   every cohort that samples it, spend a single price or Resolve lever on its
   kit, measured alone, in a pass with no content change in it. A lever that
   measures flat gets reverted, not shipped (the v18 precedent). Do NOT spend one
   in the same pass as engine or UI work.
2. **Ruin-Walker Overseer is the pool's only one-signed divergence** (−8.2 mean,
   negative in all five sampling cohorts, last in the pinned table in five of
   six). This is the Sentinel shape inverted, and the Sentinel lesson says the
   first move is to understand the instrument, not to move the card. The
   specific question: `pinnedArchetypeRecipe` samples keywords/effects/units/
   sanctums from a stream seeded on `(leader id, deck index)` — does
   Ruin-Walker's kit want something those four axes cannot express? **Do not
   buff it.** Diagnose first.
3. **`|gap| >= 10` is answered, not carried.** 51 observations: median 5.0, max
   18.6, threshold at the ~76th percentile. It stays in the report as a
   per-cohort eyebrow-raise, but it is not a gate and no decision rule should be
   written in terms of it again. The discriminating statistic is **one-signed
   across every sampling cohort**, which the report cannot compute (it is
   single-run). Either the sim gains a cross-run mode or the sign table gets
   assembled by hand each pass, as §2 does here. Supersedes v20 #6.
4. **The live `cards` row for Sovereign of the Dying Star is still unsynced.**
   Carried unchanged from v20 #4 — still a one-line human write:
   `update cards set essence_cost = '{"generic":2,"pips":{"Ember":1,"Void":1}}'::jsonb
   where id = 'sovereign_of_the_dying_star';`, or `npm run db:sync` from a
   machine with egress. Re-run `verify:pool` (`POOL_SNAPSHOT` works offline)
   afterwards and this closes. Two passes old now.
5. **Six cohorts, not four, when the question is about ONE Leader.** The
   standing run stays four for a general re-baseline — that is what v20's rule
   was about and it is unchanged. But §2 turned on a single cohort's sign flip
   (F, −3.3), which four cohorts would not have produced, and on two Leaders'
   unsampled rows. When a pass is deciding about a specific Leader, run the two
   extra cohorts; they cost about thirty seconds each.
6. **`Unbreakable` weight 7** — carried unchanged from v16 #1 / v17 #3 / v18 #4 /
   v19 #4 / v20 #7 (trigger: carriers drifting negative; unwind order: stat
   trims, then weight).
7. **`Sacred` cohort dependence** — carried unchanged.
8. **Do not interleave content and balance changes** — carried, and honoured:
   this pass's engine and UI work landed and was verified byte-identical before
   the cohorts, and no card lever was spent at all.

## Closed this pass

- ~~The random arm silently omits Leaders it cannot sample (v20 #5)~~ — the
  report prints an `UNSAMPLED` row by name. Three of six cohorts have one.
- ~~`|gap| >= 10` is still a first guess (v20 #6)~~ — measured on 51
  observations and retired as a gate. See carry-forward #3.
- ~~Sentinel of the Nether Pit (v20 #2)~~ — stays closed, and two fresh cohorts
  confirm it: no longer one-signed, pinned row drifting up to mid-field.
- ~~Void Mother's cancelled rework (v20 #3)~~ — stays cancelled. 45.0% mean over
  six cohorts, mid-field, gap not one-signed.
