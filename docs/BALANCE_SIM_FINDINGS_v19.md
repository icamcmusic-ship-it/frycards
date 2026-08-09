# Balance & Sim Findings — v19 (August 2026)

The pass where the instrument became the finding.

v18 carry-forward #1 named a lever and set a condition. The condition was met
and the lever was spent — and it measured nothing, which is the **third**
consecutive lever on that Leader to measure nothing. Rather than reach for a
fourth, this pass differenced the two Leader tables the sim already prints, and
the difference explains all three failures at once: on its own random-deck arm
the Leader in question is **below average**, not first. What the pinned suite
has been ranking at the top for four passes is substantially its three pinned
decks, not its kit.

**Nothing shipped as a Leader card change this pass, on purpose.** Trial 1 was
run, refuted and reverted. Trial 2 — carry-forward #3's AI answer-gate — was run
and **shipped**: it removes a documented CPU blunder outright at zero measured
balance cost (§3). The instrument gained two things it was missing: a permanent
pinned-vs-random divergence report, so the confound is visible on every future
run before a lever is chosen rather than after it is spent, and a
`leaderShatterBlunder` counter that no longer shares its predicate with the gate
it is supposed to audit. Supersedes the v18 findings doc, deleted this pass —
only the newest sim doc is kept.

This pass also carried a non-gameplay bug hunt, an interactive stress round, a
QoL round and a CPU-visibility audit (engine/UI, outside this doc's scope — see
the CHANGELOG). Per the v7.7 §12 rule those changes landed BEFORE any trial and
were verified sim-neutral: the four-cohort run after them reproduced v18's
shipped table **byte-identically**, to the decimal, on every cohort.

**Runs:** `npx tsx scripts/simulate-v5.ts 6 32 1337 <deckSeed>` for deckSeed
1337 (A), 42 (B), 7 (C), 99 (D) — 5,952 games each, four independent deck
cohorts, per the standing rule. Sixteen runs (baseline, trial 1, the
post-revert re-verification, trial 2) = **95,232 games, `invariantCount` 0 on
every one**.

| Metric (A / B / C / D) | v18 shipped              | v19 baseline              |
| ---------------------- | ------------------------ | ------------------------- |
| Sentinel (pinned)      | 61.9 / 60.7 / 58.0 / 61.6 | 61.9 / 60.7 / 58.0 / 61.6 |
| Sovereign (pinned)     | 44.3 / 45.8 / 50.9 / 41.7 | 44.3 / 45.8 / 50.9 / 41.7 |
| Void Mother (pinned)   | 35.4 / 35.1 / 41.7 / 39.9 | 35.4 / 35.1 / 41.7 / 39.9 |
| P1 win rate            | 44.8 / 46.4 / 46.3 / 44.6 | 44.8 / 46.4 / 46.3 / 44.6 |
| Avg game length        | 20.3 / 21.6 / 21.8 / 21.1 | 20.3 / 21.6 / 21.8 / 21.1 |

---

## 1. Sentinel of the Nether Pit — three levers, nothing moved, and why

v18 carry-forward #1 set the condition: *"If the next clean baseline still has
Sentinel first in 3+ cohorts, the trial is `LEADER_MINUS_ABILITY_OVERRIDE`
bounding the Ember minus to `enemyUnit` (dropping the face reach), on the v7.5
Ethereal precedent."* The baseline did better than meet it — Sentinel finished
**first in all four** (61.9 / 60.7 / 58.0 / 61.6). The lever was spent and
measured alone.

**Measured (trial 1): 61.3 / 63.4 / 59.5 / 61.6** — a mean of **+0.9 points**,
still first in all four tables, with cohort B moving *up* 2.7. Taking the
finisher off the kit did not move the kit.

That completes a set:

| Lever                                   | Pass | Measured                    |
| --------------------------------------- | ---- | --------------------------- |
| Minus reprice `-2 → -3`                 | v17  | +2 to +6, stayed first      |
| Resolve `5 → 4`                         | v18  | −0.75 mean, cadence unmoved |
| Minus bounded to `enemyUnit` (no reach) | v19  | **+0.9 mean, stayed first** |

Three levers, three different parts of the kit — its price, its budget, its
effect — and not one of them touched the number. At that point the honest
question stops being "which part of the card" and becomes "is the card what the
table is measuring".

**It is not.** The sim prints a second Leader table, the random-deck
diagnostic, and nobody had ever subtracted it from the first. Sentinel on the
baseline:

| Cohort | pinned | random | random n | gap        |
| ------ | ------ | ------ | -------- | ---------- |
| A      | 61.9   | 30.8   | 744      | **+31.1**  |
| B      | 60.7   | 53.0   | 372      | +7.7       |
| C      | 58.0   | 42.1   | 1488     | **+15.9**  |
| D      | 61.6   | 43.8   | 1860     | **+17.8**  |

Its random-deck mean is **42.5% — below the midpoint**, and in cohort A it is
the *worst Leader in the pool* at 30.8%. The gap is positive in all four
cohorts and is the largest in the table. The pinned suite gives each Leader
three hand-built decks; a three-deck sample cannot distinguish "strong kit"
from "three strong decks", and here the two arms disagree by up to 31 points in
one direction.

So the four passes of "Sentinel is first, nerf Sentinel" were reading a deck
list. **Reverted, not shipped**, and recorded in
`LEADER_MINUS_ABILITY_OVERRIDE` as a spent-and-refuted lever alongside v18's,
so nobody spends it again. No further lever belongs on this card until the
pinned suite can tell a kit from its decks — see carry-forward #1.

---

## 2. The same test, run on the whole pool

The divergence is not a Sentinel quirk, and it is not uniform. Baseline, all
four cohorts, mean gap (pinned minus random):

| Leader                      | pinned A/B/C/D  | random A/B/C/D  | mean gap  |
| --------------------------- | --------------- | --------------- | --------- |
| Sentinel of the Nether Pit  | 62/61/58/62     | 31/53/42/44     | **+18.1** |
| Legendary Diver             | 49/52/48/53     | 41/42/53/28     | +9.7      |
| Ethereal Sea Witch          | 52/53/54/54     | 53/50/55/53     | +0.6      |
| Kuro, the Unseen            | 53/48/46/47     | 52/48/47/48     | −0.3      |
| Mer-King                    | 54/55/58/54     | 64/53/54/53     | −1.2      |
| Sovereign of the Dying Star | 44/46/51/42     | 46/52/45/52     | −3.1      |
| Ruin-Walker Overseer        | 46/49/42/49     | 49/49/55/50     | −3.9      |
| Avatar of the Abyss         | 45/53/52/46     | 47/62/53/72     | −9.5      |
| Void Mother                 | 35/35/42/40     | 54/43/50/62     | **−14.1** |

Five of the nine agree between the two arms to within 4 points, which is the
reassuring half of this table: for most of the pool the pinned row IS a kit
reading, and the levers those passes spent were aimed correctly.

Two are not, and they are exactly the top and the bottom of the pinned table —
the two the project has spent the last three passes trying to move. **Sentinel
is +18.1 and Void Mother is −14.1, in opposite directions, both consistent in
sign across all four cohorts.**

The rest of the spread is a caution about the caution: Avatar reads −25.9 in
cohort D on n=372 and −0.6 in cohort C on n=744, and Legendary Diver flips from
+25.5 (D) to −4.7 (C). A large gap in ONE cohort on a small random-deck sample
is noise, not signal. Read the gap with its `n`, and only trust it when the
sign holds across cohorts — which for Sentinel (n up to 1860) and Void Mother
(n = 1116–1860 in all four) it does.

`scripts/simulate-v5.ts` now prints this table on every run, flagged at
`|gap| >= 10`, immediately under the two tables it differences.

---

## 3. Sentinel's self-shatter donations — the gate, re-examined and fixed

v18 carry-forward #3: *"Re-examine the v16 §6 answer-gate against the `-3`
price point specifically: a gate written for a `-2` spender may pass an ability
the kit can no longer afford to follow up on."* Cohort C's reading held at a
larger n — `shatteredWinPct` **23.4% at n=77** against Sentinel's 42.1%
random-deck average there: the games it shatters its own Leader in are lost
three times out of four.

Reading the gate is enough to see it. `runLeaderAbility` discounts a
Leader-killing activation only when it "answers a big threat":

```ts
const answersBigThreat =
  isRemoval(eff) &&
  removalTargets.some(
    (u) => effMight(state, u) >= 6 &&
           (eff.action !== 'damage' || (eff.value ?? 0) >= remainingGrit(state, u)),
  );
v -= answersBigThreat ? 6 : 20;
```

For a **damage** ability that condition is self-defeating. A 2-point ping can
only satisfy `value >= remainingGrit` against a Might-6+ body already down to
2 Grit or less — a unit one clash from dying anyway. So the only damage
abilities the gate ever passed were the ones buying the least: the entire
Leader, its Commander aura and its remaining tank, traded for finishing off
something already nearly dead. The price point was never the issue; the v16
gate answered "can this kill it" when the question was "is this worth a
Leader".

**The lever:** unconditional removal (`shatter` / `banish`) keeps the discount —
it answers a healthy threat, which is a trade worth making at zero Resolve.
Damage no longer earns it, at any value the pool prints.

**Measured (trial 2), all four cohorts:**

| Diagnostic                        | baseline (A/B/C/D)        | shipped (A/B/C/D)         |
| --------------------------------- | ------------------------- | ------------------------- |
| Sentinel self-shatter rate        | 2.7 / 5.6 / 5.2 / 3.3     | **0.0 / 0.0 / 0.0 / 0.0** |
| `leaderShatters` (whole run)      | 46 / 58 / 122 / 80        | 13 / 36 / 29 / 6          |
| Sentinel (pinned)                 | 61.9 / 60.7 / 58.0 / 61.6 | 61.3 / 61.0 / 58.0 / 61.3 |
| Sentinel (random deck)            | 30.8 / 53.0 / 42.1 / 43.8 | 30.9 / 52.7 / 42.1 / 43.7 |
| P1 win rate                       | 44.8 / 46.4 / 46.3 / 44.6 | 44.7 / 46.5 / 46.3 / 44.7 |
| Avg game length                   | 20.3 / 21.6 / 21.8 / 21.1 | 20.3 / 21.6 / 21.8 / 21.1 |

The donation is gone outright — a self-shatter rate of zero in every cohort —
and the remaining `leaderShatters` are the shatter/banish trades that still
earn the discount. Everything else is flat: the pinned table moves by at most
0.6, the random-deck arm by at most 0.3, P1 and game length not at all,
`invariantCount` 0 on all four. **Shipped.**

**The metric was blind to this by construction, and now is not.** The sim's
`leaderShatterBlunder` lapse counter read **0** through every pass in which
this was happening, because it used `!preOppBigThreat` — the *same predicate*
the ai.ts gate uses to justify the activation. Every donation the gate let
through was, by definition, one where a Might-6+ threat existed, so the counter
could never disagree with the gate. It now also counts the outcome: the Leader
is gone and the enemy board is no smaller than before the turn. Validated by
running the new counter against the OLD gate on cohort A — it reads **5** where
the old counter read 0, and 0 against the shipped gate.

**What this is not.** It did not raise Sentinel's win rate, and the write-up
should not pretend otherwise. The gate fires when a Might-6+ body is on the
board, which correlates with already being behind, so the donation was as much
a symptom as a cause — and in cohort D those games were actually *won* 59.7% of
the time against a 43.8% average, the opposite of cohort C's 23.4%. What the
change buys is a CPU that no longer trades its whole Leader, aura included, to
finish off something already dying, at zero measured cost. That is a blunder
fix, not a balance gain; reading it as one would be reading noise.

---

## 4. What the pass changed outside the trials (verified sim-neutral)

The bug hunt, the stress round, the QoL round and the visibility audit all ran
BEFORE the baseline, so nothing here is a reading against a moved pool. The
four-cohort run after them reproduced v18's shipped pinned suite byte-for-byte
in all four cohorts, with `invariantCount` 0.

- Everything in the match round is `GameV4.tsx`, `CoachOverlay.tsx`,
  `HowToPlay.tsx` and `SettingsScreen.tsx` — none of which the headless sim
  loads. The new `buildGuardBeats` is a UI-only display helper: it reads
  `state.clash.guards` and returns strings, and no engine or AI path calls it.
- `scripts/audit-meta-screens.ts` gained a depth-two sweep, a max-based settle
  and an honest blank check; `scripts/drive-match.ts` gained a watch-the-
  narration mode and a stale-ring invariant. Neither is loaded by the sim.
- `src/meta-preview.tsx` (dev-only harness stub) now owns inventory, cosmetics
  and serialized prints so the panels gated on them are measured at all.
- The only non-UI edits are in `src/game/v3/cardpool.ts` (a comment recording
  the refuted trial-1 lever, no live table entry) and the §3 gate in
  `src/game/v3/ai.ts`, which is measured in §3 rather than assumed.
- `scripts/simulate-v5.ts`'s two additions — the divergence report and the
  widened `leaderShatterBlunder` predicate — are report-only. Neither is read
  by a decision path, and cohort A's pinned table after them is byte-identical
  to the same run before them.

## Carry-forward items

1. **Sentinel of the Nether Pit — stop pulling levers on the card.** Three are
   spent and measured (v17 minus price, v18 Resolve, v19 minus reach) and all
   three read flat. Its random-deck arm says the kit is below average. The
   next work is on the INSTRUMENT, not the Leader: widen the pinned suite
   beyond three decks per Leader so a kit reading can be separated from a deck
   reading, and re-baseline before any further Leader lever anywhere in the
   pool. Until then, treat a flagged pinned row as unmeasured.
2. **Void Mother — do NOT give it the dedicated kit look v18 scheduled.** The
   watch pass ran (35.4 / 35.1 / 41.7 / 39.9, unchanged) and confirms the
   pinned reading, but its random-deck arm reads 54.1 / 42.7 / 49.5 / 62.2 —
   a mean of 52.1%, *above* the midpoint, on samples of 1,116–1,860 in every
   cohort. A dedicated kit lever would be the fourth mis-aimed one this
   project has spent. Blocked behind #1.
3. **The divergence report is new and unproven as a decision rule.** It has one
   pass of data. The `|gap| >= 10` threshold is a first guess, and the
   cohort-level noise on small random-deck `n` (Avatar D at n=372, Legendary
   Diver D at n=744) is real. Treat it as a flag that asks a question, never
   as a number that answers one.
4. **`Unbreakable` weight 7** — carried unchanged from v16 #1 / v17 #3 / v18 #4
   (trigger: carriers drifting negative; unwind order: stat trims, then
   weight).
5. **`Sacred` cohort dependence** — carried unchanged.
6. **Four cohorts is the standing run** — carried unchanged.
7. **Do not interleave content and balance changes** — carried, and honoured:
   this pass's engine/UI/meta work landed and was verified byte-identical
   before the baseline, and the two levers were measured sequentially against
   it.
8. **Live `cards` rows were NOT resynced this pass** — and did not need to be.
   No shipped change touches a `cards` column: trial 1 was reverted, and the
   §3 change is in `ai.ts`. (`npm run verify:pool` still could not run — the
   Supabase host is outside this sandbox's network allowlist — so this remains
   an argument from the code path. Re-run it on the next pass that has
   network. Carried from v18 #8.)

## Closed this pass

- ~~Sentinel of the Nether Pit: the effect lever (v18 #1)~~ — condition met in
  all four cohorts, lever spent and measured, **refuted** (+0.9 mean, still
  first everywhere) and reverted. Superseded by carry-forward #1, which points
  at the instrument instead of the card.
- ~~Void Mother's watch pass (v18 #2)~~ — run. It confirms the pinned reading
  and contradicts the conclusion drawn from it; the scheduled dedicated look is
  cancelled rather than performed. See carry-forward #2.
- ~~Sentinel's cohort-C shatter donations (v18 #3)~~ — diagnosed to a specific
  clause in the v16 §6 gate, measured, and resolved in §3.
