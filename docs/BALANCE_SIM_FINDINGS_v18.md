# Balance & Sim Findings — v18 (August 2026)

The v17 carry-forward pass. Two items came due and both were actioned: the
Sentinel lever the v17 doc scheduled was spent, **measured, and refuted** —
reverted rather than printed — and Sovereign of the Dying Star, the one Leader
that had never had a dedicated look, got it. Supersedes the v17 findings doc,
deleted this pass — only the newest sim doc is kept.

This pass also carried an interactive/CPU-visibility round and a meta-screen
bug hunt (engine/UI, outside this doc's scope — see the CHANGELOG). Per the
v7.7 §12 rule those changes landed BEFORE any trial and were verified
sim-neutral: the four-cohort run after them reproduced the pre-change output
**byte-identical** on the pinned Leader suite, and the baseline below is also
v17's shipped table to the decimal.

**Runs:** `npx tsx scripts/simulate-v5.ts 6 32 1337 <deckSeed>` for deckSeed
1337 (A), 42 (B), 7 (C), 99 (D) — 5,952 games each, four independent deck
cohorts, per the standing rule. Sixteen runs (baseline, the sim-neutrality
re-run, trial 1, trial 2) = **95,232 games, `invariantCount` 0 on every one**.

Sequential measured trials, one lever at a time, each on all four cohorts:
baseline → Sentinel Resolve 5 → 4 (§1, reverted) → Sovereign cost 5 → 4 (§2).

| Metric (A / B / C / D)  | baseline                  | shipped                       |
| ----------------------- | ------------------------- | ----------------------------- |
| Sovereign (pinned)      | 38.1 / 35.7 / 39.6 / 35.1 | **44.3 / 45.8 / 50.9 / 41.7** |
| Sentinel (pinned)       | 61.0 / 61.9 / 58.0 / 62.2 | 61.9 / 60.7 / 58.0 / 61.6     |
| Void Mother (pinned)    | 36.3 / 35.1 / 41.7 / 38.4 | 35.4 / 35.1 / 41.7 / 39.9     |
| P1 win rate             | 44.8 / 46.4 / 46.3 / 45.0 | 44.8 / 46.4 / 46.3 / 44.6     |
| Avg game length         | 20.2 / 21.6 / 21.9 / 21.1 | 20.3 / 21.6 / 21.8 / 21.1     |

---

## 1. Sentinel of the Nether Pit — the scheduled lever was spent, and it did nothing

v17 carry-forward #1 set the condition: *"If the NEXT pass's baseline still has
it first in 3+ [cohorts], spend Resolve 5 → 4 (the other half of the v16
lever), measured fresh."* The baseline met it — Sentinel finished FIRST in A, B
and D (61.0 / 61.9 / 62.2) and second only to Mer-King in C (58.0). The lever
was spent and measured alone.

**Measured (trial 1): 59.5 / 61.9 / 58.9 / 59.8** — a mean of **-0.75 points**,
with cohort B unmoved to the decimal and cohort C going **up** by 0.9. Sentinel
finished first in the same three tables. On this instrument a 1-point move is
~3.4 games out of 336; three of the four readings are inside that.

The diagnostic says why, and it is not a sample-size story:

| `abilityUsesPerGame` | A    | B    | C    | D    |
| -------------------- | ---- | ---- | ---- | ---- |
| baseline (Resolve 5) | 7.95 | 7.24 | 8.53 | 7.65 |
| trial 1 (Resolve 4)  | 8.19 | 7.63 | 8.59 | 7.61 |

The kit fired **as often or slightly more often** with a smaller tank. That is
the whole finding: **the Resolve ceiling is not the binding constraint on this
kit.** Sentinel spends at 3 (its v17 `-3` minus) and rebuilds with a `+1`, so
it never banks near the ceiling — the fifth point of Resolve was never being
used, and removing it removes nothing. The v16 pairing of "raise the price AND
lower the tank" assumed the two levers compose; against a kit that spends below
the ceiling, only the price does anything.

**Reverted, not shipped.** A price change that moves neither the win rate nor
the ability cadence is a strictly worse card for no measured gain, and keeping
it would tax the kit twice if a later pass finds the real mechanism. Recorded
in `LEADER_RESOLVE_OVERRIDE` as a spent-and-refuted lever so nobody spends it
again — the same treatment v16 gave the refuted "the cap is the mechanism"
hypothesis, and the same rule v7.6 wrote for Kuro.

**The next lever, named:** not the price and not the tank — the **effect**.
Sentinel's minus is Ember's `Deal 2 damage to any target`, and the `any target`
half is what no other mid-tier kit has: reach that closes games from the
opponent's board being empty. `LEADER_MINUS_ABILITY_OVERRIDE` already exists
and v7.5 used exactly this bound on Ethereal Sea Witch ("dropping the
face-reach half: unit-only, so it answers a board without ever closing a game
out of nowhere"). That is the v19 trial if the next clean baseline still has
Sentinel first in 3+ cohorts — measured fresh, per the Kuro v7.6 rule.

Note also the control this pass supplies for free: **Sovereign has the same
Ember minus at a THIRD of the price** (`-1`, not `-3`) and the same Commander
aura, and read 35-39% at baseline. Whatever makes Sentinel an outlier, the
Ember ping's *price* is not it either — which is more evidence for the reach
being the operative half, and against any further pricing lever.

---

## 2. Sovereign of the Dying Star — the arrival turn was the whole problem

v17 carry-forward #2 scheduled one watch pass on the post-Avatar field and then
a dedicated look. The watch pass is this baseline and it confirmed the reading:
**38.1 / 35.7 / 39.6 / 35.1**, last or next-to-last in all four cohorts, with
deck spreads of 3.6 / 11.6 / 3.6 / 6.3 — the tightest in the suite. That is a
kit reading, not a deck roll.

The kit is not the problem, and this is the surprise. Sovereign (Ember/Void,
Uncommon) prints:

```
Leader — Resolve 3.  -1: Deal 2 damage to any target.  +1: A friendly unit gets +1/+1.
Cost 3 generic + Ember + Void = 5.  Keyword: Commander.
```

Its minus is the *same reach Sentinel tops three cohorts with*, at a third of
the price, and it carries Commander's global +1 Might on top. It is not idle
(99.5% invoke rate) and it is not misplayed. What it does not get is **turns**:

- **Joint-highest invoke cost in the pool (5).** It pays Commander's +1 cost
  surcharge on top of a 4-cost roll.
- **Lowest printed Resolve in the pool (3).** `mapLeader` derives Resolve from
  rarity, and Uncommon is the floor.
- **Arrives turn 8.3 / 8.4 / 8.5 / 8.3** — the latest of any Leader except
  Avatar, which has Resolve 6 and an unconditional Shatter to justify it.
- **6.32 ability activations a game in cohort A, the lowest of any Leader.**

This is Kuro's case from v7.7, feature for feature ("the joint-LATEST-arriving
Leader… one of the most expensive at 5 total… the LOWEST printed Resolve in the
pool at 3 — it pays a Commander surcharge on top of the smallest ability budget
anyone has"), and the same lever answers it. `LEADER_COST_OVERRIDE`:
`sovereign_of_the_dying_star: 4`. Price-only by construction — nothing in
`mapLeader` derives from `total`.

**Measured (trial 2): 38.1 → 44.3 (A), 35.7 → 45.8 (B), 39.6 → 50.9 (C),
35.1 → 41.7 (D)** — six to eleven points, out of the cellar on all four, and
**it tops no table** (8th / 8th / 5th / 9th-of-nine becomes 8th / 8th / 5th /
8th). The mechanism reads exactly as designed:

| Diagnostic          | baseline (A/B/C/D)        | shipped (A/B/C/D)         |
| ------------------- | ------------------------- | ------------------------- |
| avg first invoke    | 8.3 / 8.4 / 8.5 / 8.3     | 6.7 / 6.9 / 7.0 / 6.7     |
| ability uses / game | 6.32 / 8.41 / 7.18 / 7.40 | 7.30 / 9.03 / 7.90 / 8.18 |
| random-deck win %   | 37.7 / 46.4 / 38.8 / 45.6 | 46.2 / 51.9 / 45.2 / 51.9 |

A turn and a half of arrival, bought back with one essence. Nothing else moved:
P1 win rate and average game length are flat, and Sentinel — measured again
underneath this change — reads 61.9 / 60.7 / 58.0 / 61.6, its baseline within
noise. **Closes.**

The bottom of the table is now **Void Mother alone** (35.4 / 35.1 / 41.7 /
39.9) — see carry-forward #2.

---

## 3. The watch items

- **`Unbreakable` (v16 #1, v17 #3) — holds in band.** +9.2 / +7.4 / +7.9 /
  +7.7 (v17 shipped: +9.4 / +8.0 / +8.2 / +9.0). Carriers positive, drifting
  gently toward the middle of the band, plays held. The item's trigger (act
  only if carriers drift NEGATIVE) has not fired in three passes. Carried
  unchanged.
- **`Sacred` (v16 #4, v17 #3) — carried.** +1.9 / +10.0 / +10.3 / +7.6. Still
  the most cohort-dependent keyword in the file (A reads it flat, B and C at
  the band edge), still nothing actionable by weight (three failed attempts on
  record) or by carrier. Stays the standing example of cohort dependence.
- **Sentinel's cohort-C shatters (v17 #1) — the donation shape survived a
  larger n and is now actionable.** C's `shatteredWinPct` reads **23.4% at
  n=77** against Sentinel's 42.1% random-deck average there — the v17 reading
  (26.6%) was carried as "small n"; at n=77 it is not. The other three cohorts
  read 35.0 / 47.6 / 59.7 (n=20 / 21 / 62). So it is a cohort-C effect, and it
  is the v16 §6 answer-gate at the `-3` price point: the CPU's self-shatter
  discount clears its "the ability must actually answer the threat" gate, walks
  Resolve 5 → 2 → (builder) 3 → -3 → 0, and hands over the Leader. Promoted
  from watch to a named carry-forward (#3).

---

## 4. What the pass changed outside the trials (verified sim-neutral)

The interactive/visibility round and the meta bug hunt ran BEFORE the baseline,
so nothing here is a reading against a moved pool. The four-cohort run after
them reproduced the pre-change pinned suite byte-identically in all four
cohorts, with `invariantCount` 0.

- `CpuTurnEvent`'s `invoke` variant gained an optional `defId` — a display
  field the UI spotlights the card face by. No AI decision reads it.
- Everything else is `GameV4.tsx` (narration, rings, animations, guard
  suggestion, attack totals), `SettingsScreen`, `matchPrefs.ts` and the new
  `scripts/drive-match.ts` harness — none of which the headless sim loads.
- `scripts/drive-match.ts` is the interactive counterpart to this harness: a
  real browser plays whole matches through the match UI. Ten matches at two
  widths, 0 findings on the shipped code. It is not a balance instrument and
  its results are not comparable to anything in this doc.

## Carry-forward items

1. **Sentinel of the Nether Pit — the effect, not the price.** Two pricing
   levers are now spent and measured on this kit (the v17 `-3`, which moved it
   2-6 points, and this pass's Resolve 4, which moved it nothing). If the next
   clean baseline still has it first in 3+ cohorts, the trial is
   `LEADER_MINUS_ABILITY_OVERRIDE` bounding the Ember minus to `enemyUnit`
   (dropping the face reach), on the v7.5 Ethereal precedent — measured fresh,
   not carried.
2. **Void Mother is the bottom of the table on its own** (35.4 / 35.1 / 41.7 /
   39.9, deck spreads 9.8 / 9.8 / 4.4 / 17.0). Both of its levers are spent on
   record (minus -4 AND Resolve 5), so this needs a lever it has not had:
   its `-4: Banish a target enemy unit` at Resolve 5 buys exactly one removal a
   tank and its `+1: A friendly unit gets +1/+1` funds it over four turns —
   the shape v7.7 priced Kuro out of. Its invoke turn (6.3) is already the
   earliest in the pool, so the cost lever is NOT the answer here. One watch
   pass on the post-Sovereign field, then a dedicated look.
3. **Sentinel's cohort-C shatter donations** (promoted from §3). At n=77 the
   games Sentinel shatters its own Leader in are won 23.4% of the time against
   a 42.1% average. Re-examine the v16 §6 answer-gate against the `-3` price
   point specifically: a gate written for a `-2` spender may pass an ability
   the kit can no longer afford to follow up on.
4. **`Unbreakable` weight 7** — carried unchanged from v16 #1 / v17 #3
   (trigger: carriers drifting negative; unwind order: stat trims, then
   weight).
5. **`Sacred` cohort dependence** — carried unchanged.
6. **Four cohorts is the standing run** — carried unchanged.
7. **Do not interleave content and balance changes** — carried, and honoured:
   this pass's engine/UI/meta work landed and was verified sim-neutral before
   the baseline, and the two levers were then measured sequentially against it.
8. **Live `cards` rows were NOT resynced this pass** — and did not need to be.
   The only shipped lever is a `LEADER_COST_OVERRIDE` entry, which
   `mapLeader` applies client-side to a catalog row it does not read a cost
   from; no `cards` column changes. (`npm run verify:pool` could not run in
   the session that produced this doc — the Supabase host was outside the
   sandbox's network allowlist — so this is an argument from the code path,
   not a live check. Re-run it on the next pass that has network.)

## Closed this pass

- ~~Sentinel of the Nether Pit: one more clean-baseline look (v17 #1)~~ —
  condition confirmed, the named lever (Resolve 5 → 4) spent and measured on
  four cohorts, **refuted** (-0.75 mean, ability cadence unmoved) and reverted.
  The remainder is carried as #1 with a different lever named.
- ~~Sovereign of the Dying Star's dedicated pass (v17 #2)~~ — closed: the watch
  pass confirmed a kit reading, the cost lever bought back 1.5 turns of arrival
  and 6-11 points, and it tops no table.
- ~~Sentinel's cohort-C `shatteredWinPct` "small n" caveat (v17 #1)~~ — no
  longer small; promoted to carry-forward #3 with a named target.
