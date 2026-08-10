# Balance & Sim Findings — v20 (August 2026)

The pass where the instrument was fixed and the table turned over.

v19 ended by refusing to pull a fourth lever on Sentinel of the Nether Pit and
pointing at the instrument instead: *"widen the pinned suite beyond three decks
per Leader so a kit reading can be separated from a deck reading, and
re-baseline before any further Leader lever anywhere in the pool. Until then,
treat a flagged pinned row as unmeasured."*

That is this pass, and the widened suite does not merely add error bars — it
**reverses the reading**. Sentinel, first in all four cohorts for four
consecutive passes and nerfed three times for it, measures **43.5 / 44.0 / 43.1
/ 48.6** and finishes near the bottom. Void Mother, last in all four and
scheduled for a rework twice, comes off the floor. The Leader the widened suite
puts first is **Mer-King**, which no pass has ever looked at, and it is the
only Leader whose two arms agree on a first-place finish.

**Nothing shipped as a card change this pass, on purpose** — v19 carry-forward
#1 blocks every Leader lever behind the re-baseline, and spending one against a
table with a single pass of history would repeat exactly the mistake this
project has now made four times. Supersedes the v19 findings doc, deleted this
pass — only the newest sim doc is kept.

**Runs:** `npx tsx scripts/simulate-v5.ts 6 32 1337 <deckSeed>` for deckSeed
1337 (A), 42 (B), 7 (C), 99 (D) — four independent deck cohorts, per the
standing rule. Five runs (four cohorts plus a post-UI re-verification of cohort
A), `invariantCount` **0** on every one.

| Metric (A / B / C / D) | v19 shipped               | v20                       |
| ---------------------- | ------------------------- | ------------------------- |
| P1 win rate            | 44.7 / 46.5 / 46.3 / 44.7 | 44.7 / 46.5 / 46.3 / 44.7 |
| Avg game length        | 20.3 / 21.6 / 21.8 / 21.1 | 20.3 / 21.6 / 21.8 / 21.1 |
| `invariantCount`       | 0                         | 0                         |

Those two rows are **identical to the decimal**, and that is the control: the
only sim change this pass is inside the pinned suite, which feeds no other
accumulator. Every number that moved below moved because the suite is measuring
something different, not because the game is.

---

## 1. What the pinned suite was actually holding constant

The suite's premise (v6.2, carry-forward #5) is that it isolates a Leader's kit
by fixing everything else. v16 added a second and third deck per Leader to
separate kit from deck-roll luck, and v19 found the arms still disagreeing by up
to 31 points and concluded the pinned row was "substantially its three pinned
decks".

Reading the two deck builders side by side says it was narrower than three
decks. `randomArchetype` — the builder behind the random-deck arm, and behind
every CPU opponent in a real match — varies four things per deck:

| Axis     | `randomArchetype`                    | `pinnedDeckForLeader` (pre-v20) |
| -------- | ------------------------------------ | ------------------------------- |
| keywords | a shuffled 2–3 of the Leader's pool  | **all** of them, always         |
| effects  | a shuffled 1–3 of eight actions      | **damage, shatter, draw, buff** |
| units    | 32–40                                | **34**                          |
| sanctums | 4–6                                  | **5**                           |
| jitter   | seeded                               | seeded                          |

Only the last row differed between the three pinned decks. They were one recipe
rolled three times, so the pinned arm was never measuring a Leader across
deck-space — it was measuring **one archetype**: maximum keyword spread, those
four effect leanings, that one curve. A Leader whose kit happens to suit that
archetype reads high in it whether or not the kit is strong, and one whose kit
wants a narrower theme reads low.

That is a far better explanation of v19's headline finding than sampling error.
A ±18-point divergence that holds its **sign across four independent cohorts**
on 336 games per Leader is not noise; a systematic difference in what the two
arms are built from is exactly the shape that produces it.

## 2. The lever: nine decks on nine recipes

`pinnedArchetypeRecipe` now samples the same four axes `randomArchetype`
samples, from a stream seeded on `(leader id, deck index)` — so the suite stays
pinned in the sense that matters (identical decks every run, independent of
`DECK_SEED`, all four cohorts running the same suite) while spanning deck-space
the way the arm it is supposed to be checkable against does.

- **Deck #0 is unchanged**, same recipe and same seed, so the historical row
  stays comparable.
- `LEADER_PAIR_DECKS` **3 → 9**, `LEADER_PAIR_SEAT_GAMES` **7 → 3**.
- Per Leader: 8 opponents × 9 decks × 3 games × 2 seats = **432 games**, up
  from 336, over three times as many distinct 60-card builds. Per ordered pair
  the cell holds 54 games, up from 42. The suite costs 3,024 → 3,888 games a
  run, about six seconds.
- The summary prints the **median** alongside the mean, because one runaway
  recipe can carry a nine-deck mean in a way it cannot carry a nine-deck median.

## 3. The re-baseline, and what it overturns

Pinned-suite win rate, A / B / C / D:

| Leader                      | v19 (3 decks, 1 recipe) | v20 (9 decks, 9 recipes)  | mean  |
| --------------------------- | ----------------------- | ------------------------- | ----- |
| **Mer-King**                | 54 / 55 / 58 / 54       | 67.8 / 63.7 / 65.5 / 63.7 | 65.2  |
| Avatar of the Abyss         | 45 / 53 / 52 / 46       | 57.2 / 52.5 / 59.7 / 53.7 | 55.8  |
| Ethereal Sea Witch          | 52 / 53 / 54 / 54       | 53.7 / 54.6 / 50.2 / 52.3 | 52.7  |
| Sovereign of the Dying Star | 44.3 / 45.8 / 50.9 / 41.7 | 49.8 / 48.1 / 49.3 / 51.6 | 49.7  |
| Kuro, the Unseen            | 53 / 48 / 46 / 47       | 48.1 / 46.3 / 48.8 / 50.0 | 48.3  |
| Legendary Diver             | 49 / 52 / 48 / 53       | 47.9 / 41.9 / 47.0 / 45.1 | 45.5  |
| **Sentinel of the Nether Pit** | **61.9 / 60.7 / 58.0 / 61.6** | **43.5 / 44.0 / 43.1 / 48.6** | **44.8** |
| **Void Mother**             | **35.4 / 35.1 / 41.7 / 39.9** | **47.5 / 43.8 / 42.4 / 43.8** | **44.4** |
| Ruin-Walker Overseer        | 46 / 49 / 42 / 49       | 45.1 / 43.3 / 40.7 / 41.2 | 42.6  |

Three things to take from it.

**The two Leaders v19 flagged are the two that moved.** Sentinel falls 17
points and Void Mother rises 8, in exactly the directions their divergence gaps
predicted. v19's diagnosis was right; this pass says the mechanism was the
recipe, not the deck count. Four passes of "Sentinel is first, nerf Sentinel"
were reading a single archetype.

**The divergence collapses with it.** Sentinel's pinned-minus-random gap goes
from **+31.1 / +7.7 / +15.9 / +17.8** (mean +18.1, positive in all four) to
**+12.6 / −8.7 / +1.0 / +4.9** (mean **+2.5**, and no longer one-signed). Void
Mother's goes from a one-signed −14.1 mean to −6.6 / +1.0 / −7.2 / −18.4. Both
were largely artefacts of the recipe the two arms did not share. The remaining
one-cohort flags (Avatar D at −18.6 on n=372, Legendary Diver D at +17.3 on
n=744) are the small-`n` noise v19 carry-forward #3 warned to read with its `n`.

**The new top of the table is a Leader nobody has looked at, and both arms
agree on it.** Mer-King is first in all four cohorts at a 65.2% mean — nine
points clear of second and about fifteen clear of the median — and its random
arm reads 64.3 / 52.5 / 53.5 (absent in D, which drew no Mer-King decks) for
gaps of +3.5 / +11.2 / +12.0. Positive but small, and crucially the two arms
agree on the *finish*, which they never did for Sentinel. That is the first
properly-aimed Leader target this project has had in four passes, and it is
deliberately **not** spent this pass (see carry-forward #1).

## 4. What the pass changed outside the suite (verified sim-neutral)

The bug hunt, the stress round, the QoL round and the visibility audit all
landed BEFORE the cohorts ran, per the v7.7 §12 rule, and cohort A was re-run
afterwards and diffed: **byte-identical, whole report**.

- Everything in the match round is `GameV4.tsx` (narration for the CPU's stack
  responses, the attack beat's target ring, SKIP releasing HOLD, the pending-pick
  guard, the ✕ CLEAR buttons, the hint bar) — none of which the headless sim
  loads.
- `scripts/simulate-v5.ts` is the only sim-side change and it is confined to
  `pinnedArchetypeRecipe` / `LEADER_PAIR_DECKS` / the summary's median. No
  accumulator outside `leaderPairSuite` reads any of it, which is what the
  identical P1 and game-length rows above demonstrate rather than assert.
- `scripts/drive-match.ts`, `scripts/audit-meta-screens.ts`,
  `scripts/verify-pool.ts` and the new `src/preview-fixtures.ts` are harness
  files the sim does not load.

## 5. Catalog parity — the guard that has not run since v17, and what it found

v18 and v19 both carried the same item: `npm run verify:pool` cannot reach the
Supabase host from this sandbox. v19 argued from the code path instead — *"no
shipped change touches a `cards` column"* — and that argument was wrong about
the pass before it.

Running the three checks by hand against the live catalog found **one drift in
297 cards**:

```
sovereign_of_the_dying_star:
  cards.essence_cost = {"pips":{"Ember":1,"Void":1},"generic":3}   (total 5)
  the pool derives    {"generic":2,"pips":{"Ember":1,"Void":1}}    (total 4)
```

That is v18's shipped reprice — `LEADER_COST_OVERRIDE: sovereign_of_the_dying_star: 4`
— which is exactly a `cards` column change, sitting unsynced for two passes in
the column every server-side reader prices from. Everything else is in parity:
the template/rarity/card_type checks are clean, the live template digest matches
the bundled catalog **exactly** (`7a478f4a…` both sides), and the other derived
columns (keywords, might, grit, resolve, subtype, rules_text) match on all 297.

The client derives its own mechanics from the template and has been correct
throughout, so this never reached a player's board — but it is precisely the
failure mode the v7.6 §3 check exists for, and it went two passes unseen.

**The durable fix shipped here is `POOL_SNAPSHOT`**: `verify-pool.ts` now runs
its identical checks against a JSON export instead of a live fetch, so the guard
works wherever the pass is running. Verified both ways — clean against a
correct snapshot, and reporting exactly the line above against one carrying the
live value. **The live row itself was NOT written** (see carry-forward #4).

## Carry-forward items

1. **Mer-King is the first properly-aimed Leader target in four passes — and it
   is not spent yet.** 65.2% pinned mean, first in all four cohorts, nine points
   clear of second, with a random arm that agrees on the finish (+3.5 / +11.2 /
   +12.0, D unsampled). Deliberately untouched: the suite it tops has ONE pass
   of history, and pulling a lever against a one-pass-old instrument is the
   mistake this project just spent four passes making in the other direction.
   **Condition for next pass:** if a clean re-baseline still has Mer-King first
   in 3+ cohorts AND its random-arm gap stays under +10 in the cohorts that
   sample it, the trial is a single price or Resolve lever on its kit, measured
   alone. If the two arms diverge instead, treat the row as unmeasured again.
2. **Sentinel of the Nether Pit — closed, and the three spent levers stay
   spent.** Its pinned row was a recipe artefact; at 44.8% mean it is now
   mid-to-low and needs nothing. The v17 minus reprice, the v18 Resolve trial
   and the v19 minus-reach bound remain recorded as refuted in
   `LEADER_MINUS_ABILITY_OVERRIDE` — nobody should re-derive them, and nobody
   should "restore" them on the strength of the new table either.
3. **Void Mother — the cancelled rework stays cancelled.** 44.4% mean on the
   widened suite, mid-field rather than last, with a random arm that no longer
   disagrees one-signed. v19 cancelled the dedicated kit look on the divergence
   evidence; the re-baseline confirms that call.
4. **The live `cards` row for Sovereign of the Dying Star is still unsynced.**
   §5 has the exact drift. It is a one-column correction —
   `update cards set essence_cost = '{"generic":2,"pips":{"Ember":1,"Void":1}}'::jsonb
   where id = 'sovereign_of_the_dying_star';`, or equivalently `npm run db:sync`
   from a machine with egress — and it was deliberately left for a human to
   apply rather than written from inside a pass. Re-run `verify:pool`
   (POOL_SNAPSHOT works offline now) afterwards and this item closes.
5. **The random-deck arm does not sample every Leader in every cohort.**
   Mer-King has no random-deck row at all in cohort D, and Sentinel's cohort-B
   row rests on n=372. The divergence report silently omits a Leader it cannot
   sample, which reads as "no flag" rather than "not measured". Worth a
   `(unsampled)` line before the report is leaned on any harder.
6. **The `|gap| >= 10` threshold is still a first guess** — carried unchanged
   from v19 #3, and now with the caveat that the gaps it was calibrated against
   were mostly recipe artefacts. Two passes of data, one of them on a different
   instrument.
7. **`Unbreakable` weight 7** — carried unchanged from v16 #1 / v17 #3 / v18 #4 /
   v19 #4 (trigger: carriers drifting negative; unwind order: stat trims, then
   weight).
8. **`Sacred` cohort dependence** — carried unchanged.
9. **Four cohorts is the standing run** — carried unchanged.
10. **Do not interleave content and balance changes** — carried, and honoured:
    this pass's UI and harness work landed and was verified byte-identical
    before the cohorts, and no card lever was spent at all.

## Closed this pass

- ~~Widen the pinned suite and re-baseline (v19 #1)~~ — done: 3 decks on 1
  recipe → 9 decks on 9 recipes, four cohorts re-measured, and the result
  overturns the four-pass reading it was built to check. Superseded by
  carry-forward #1, which names the first target the corrected instrument
  produces.
- ~~Void Mother's cancelled rework (v19 #2)~~ — confirmed cancelled by the
  re-baseline rather than merely deferred. See carry-forward #3.
- ~~`verify:pool` cannot run in this sandbox (v18 #8 / v19 #8)~~ — the checks
  were run, they found a real two-pass-old drift, and `POOL_SNAPSHOT` makes the
  guard runnable without egress from now on. The one row it found is
  carry-forward #4.
