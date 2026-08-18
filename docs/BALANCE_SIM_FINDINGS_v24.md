# Balance & Sim Findings — v24 (August 2026)

The pass where a keyword died in the lab instead of in the pool.

v23 left the Mer-King lever authorized-but-unspent, a Leader keyword
generation implemented-but-unprinted, and the standing rule that content and
balance never interleave. This pass ships engine, match-UI and meta-screen
work (see CHANGELOG v24) plus a NEW Event keyword generation — so, by
carry-forward #1's own clause, **the Mer-King lever stays unspent again**, and
**no card change ships this pass** (fifth pass running). The engine work is
verified sim-neutral below.

**Runs:** `npx tsx scripts/simulate-v5.ts 6 32 1337 <deckSeed>` for deckSeed
1337 (A), 42 (B), 7 (C) of the standing six, plus a fresh stress cohort
(`31415 31415` — new game seed AND new deck seed, never sampled before).
`invariantCount` **0** on every run, including both experimental prints below.

| Metric (A/B/C)          | v23                | v24                |
| ----------------------- | ------------------ | ------------------ |
| P1 win rate             | 44.7 / 46.5 / 46.3 | 44.7 / 46.5 / 46.3 |
| Avg game length (turns) | 20.3 / 21.6 / 21.8 | 20.3 / 21.6 / 21.8 |
| `invariantCount`        | 0                  | 0                  |

Identical to the decimal — the control holds. The fresh stress cohort reads
P1 46.6%, 23.2 turns, 0 invariants — inside the standing spread on a seed
pair the suite had never seen, which is what it was run to check.

**Sim-neutrality of this pass's engine work.** The engine gained the three
v24 Event keyword riders (§1) and the match UI a large fix/QoL round
(CHANGELOG). Cohort A re-run after the engine changes is **byte-identical**
to the pre-change run apart from the report timestamp. The riders are
unreachable in the shipped pool — no card prints the keywords — and the
catalog dead-text guard plus `verify`-level parity tests pin that.

---

## 1. The v24 Event generation — Kindle, Tailwind, Luminous (unprinted)

The roadmap pattern one type over from v23: after v7.5 and v23, **Events were
the last type with colour holes** — printable text existed in Tide (Echoing),
Root (Ritual), Void (Fate) and Shadow (Exhume), and nothing in Ember, Gale or
Light. This pass implements the generation engine-side:

- **Kindle** (Ember, weight 1): when the Event resolves, deal 1 damage to the
  enemy player (through `damagePlayer`, so Bulwark reads it).
- **Tailwind** (Gale, weight 1): when the Event resolves, recover a random
  exhausted friendly unit — or an exhausted Location if no unit is tired
  (the fallback is §2's whole story).
- **Luminous** (Light, weight 1): when the Event resolves, restore 1
  Vitality.

Eight pinned tests (`keywords-v24-events.test.ts`), registry entries,
by-analogy weights, telemetry procs, fizzle-suppression like every other
on-resolve rider. **None is printed**: all three sit in `UNPRINTED_KEYWORDS`,
no roll band includes them, the catalog guard exempts exactly that list, and
How to Play's glossary skips them.

One plumbing fact this pass had to fix to make that true: **registering a
colour-mapped Event keyword silently reprinted the pool.** `freshKeywordFor`
built its roll list from "every keyword of the type with a colour", so the
moment Kindle/Tailwind/Luminous existed, three v7.3-band Events re-rolled
(Echoing dropped to zero carriers — the exact dead-text failure the guard
exists to catch, and it caught it). `freshKeywordFor` now excludes
`UNPRINTED_KEYWORDS` the same way it excludes `V75_KEYWORDS`. The trap
transfers: **deleting a keyword from `UNPRINTED_KEYWORDS` without giving it
its own band re-rolls every colour-fallback Event** — a future print builds a
band (the experiment below used 76-92, upward-only) first.

## 2. The print experiment — and the keyword that died in the lab

Cohorts A and B were re-run with a scratch band (Event `kwRoll` 76-92,
previously "print nothing") switched on temporarily. Upward-only: verified
zero existing carriers changed, seven Events that had rolled nothing picked
one up — Kindle ×1 (`locust_veil`), Tailwind ×3, Luminous ×3. Both runs: 0
invariants, headline outcomes at baseline (P1 44.4 / 46.3, turns 20.1 /
21.6).

**Round 1 — Tailwind as first specced ("recover a random exhausted friendly
unit") activated ZERO times in both cohorts.** Not a code bug — the pinned
tests pass, and the probe run confirmed the rider fires when a tired unit
exists. It is a timing fact about the game: Events overwhelmingly resolve in
Main I, immediately after Dawn recovered every unit, so the text was dead in
practice across ~780 carrier games. This is precisely what the experiment
protocol exists to catch, and it is the first time it has caught a keyword
whose implementation was correct and whose _design_ was unplayable.

**The redesign** (shipped in the registry, still unprinted): same text plus a
fallback — with no tired unit, recover an exhausted **Location**. Paying the
Event's own cost exhausts Locations, so the fallback is nearly always live
and reads as a ~1-essence rebate; the tired-unit arm keeps priority for the
combat case. Round 2, same band, same cohorts:

| Keyword (carriers) | carrierWin A | normΔ A | act. A  | carrierWin B   | normΔ B | act. B  |
| ------------------ | ------------ | ------- | ------- | -------------- | ------- | ------- |
| Kindle (1)         | 59.2 (n=502) | +9.5    | 722     | — (not decked) | —       | —       |
| Tailwind v1 (3)    | 49.9 (n=393) | −8.7    | **0**   | 52.4 (n=389)   | −0.4    | **0**   |
| Tailwind v2 (3)    | 52.2 (n=393) | −6.7    | **579** | 54.2 (n=389)   | +1.1    | **500** |
| Luminous (3)       | 54.8 (n=294) | +7.9    | 242     | 55.2 (n=867)   | +5.0    | 832     |

Reading, with the standing small-carrier caveat (these are 1-3 card samples,
confounded with their cards' cohorts — a direction, not a measurement):

- **Kindle** reads hot (+9.5) on ONE carrier — a fact about `locust_veil`'s
  cohort as much as the keyword. Cohort B never decks it at all, the same
  single-cohort blindness Scorched-Earth had in v7.6. Weight 1 is not
  obviously wrong; nothing to act on until it prints wider.
- **Tailwind v2** is alive (0 → ~1.4 activations per carrier game in both
  cohorts) and its carriers moved +2.3 / +1.8 with the normalized delta
  improving in both (−8.7 → −6.7, −0.4 → +1.1) — the redesign did what it
  was built to do. If it prints and the A-side negative persists, the
  Resonant/Fate precedent says weight 1 → 0 is the move, not a text buff.
- **Luminous** is consistently positive (+7.9 / +5.0) at weight 1 — the
  healthiest of the three, and the one to watch if it ever prints on more
  than three cards.

**Everything in this section's band was then reverted**; the shipped pool is
byte-identical (header). The redesigned Tailwind rider ships engine-side,
unprinted, so the next content pass starts from a keyword that actually
fires.

## 3. Meta-screen and match-UI audits (fixes, not balance)

Recorded here because carry-forward #7 requires the split stated: this
pass's screen-by-screen audit (11 meta fixes) and full-file match-UI audit
(3 correctness fixes + QoL round, including a hard response-window softlock)
are in CHANGELOG v24. None touches a card, a weight, or a roll.

## Carry-forward items

1. **Mer-King — lever authorized (v23 §1) and STILL unspent.** This pass
   carried engine, UI and content work, so the condition's final clause held
   again. Unchanged: the next pass containing nothing but the lever spends
   ONE price or Resolve step, measured alone against the eight standing
   cohorts, reverted if flat. Do not re-litigate the condition.
2. **Printing the v23 Leader keywords** — unchanged from v23 #4.
3. **Printing the v24 Event keywords** — the scratch band (76-92,
   upward-only) is the known shape; Kindle needs carriers in more than one
   cohort before its number means anything; Tailwind's weight is the thing
   to re-measure after a print (see §2). Do not delete from
   `UNPRINTED_KEYWORDS` without building the band (§1's trap).
4. **`Unbreakable` weight 7** — carried; checked this pass: carriers +56.9%
   at n=1210 (cohort A), not negative, trigger not met.
5. **`Sacred` cohort dependence** — carried unchanged (51.9% in A this pass).
6. **Do not interleave content and balance changes** — carried, and
   honoured: no lever spent, no print shipped, engine work byte-identical.

## Closed this pass

- ~~Events' colour holes (roadmap)~~ — the v24 generation exists, tested and
  priced; only the print remains, and it is sequenced deliberately.
- **Tailwind v1** — closed as a design, before ever printing: the lab run
  measured it at zero activations and the redesign shipped in its place.
  This is the cheapest a dead keyword has ever been caught in this project.

## v25 re-measurement (2026-08-15)

Engine/bug stress pass. **Runs:** the standing measurement,
`npx tsx scripts/simulate-v5.ts 6 32 1337 <deckSeed>` for deckSeeds 1337 (A),
42 (B), 7 (C), plus the v24 stress cohort re-run (`31415 31415`) — 5,952
games each, 23,808 total. On top of that, the fuzz soak was run at 1,000
seeds (5× normal) and the chaos-monkey suite at 500 seeds (~8× normal), both
temporarily raised and reverted after the run.

| Metric (A/B/C/stress)   | v24                       | v25                       |
| ----------------------- | ------------------------- | ------------------------- |
| P1 win rate             | 44.7 / 46.5 / 46.3 / 46.6 | 44.7 / 46.5 / 46.3 / 46.6 |
| Avg game length (turns) | 20.3 / 21.6 / 21.8 / 23.2 | 20.3 / 21.6 / 21.8 / 23.2 |
| `invariantCount`        | 0                         | 0                         |

Identical to the decimal on every cohort — the engine is unchanged in
behaviour and the control holds. The raised-iteration fuzz (1,000 full
AI-vs-AI matches, per-turn invariant sweep, hard termination requirement) and
chaos runs (500 random-legal-action matches, per-action sweep) found **zero
failures**: no crashes, no invariant violations, no stalled games, no
illegal action accepted, no wrong win detection. **No engine bug was found
this pass, so no fix and no new regression test ships** — the existing
suites (402 tests) pass unmodified.

Carry-forward status:

1. **Mer-King lever — STILL UNSPENT, carried.** This pass contains engine/bug
   stress work (the raised-iteration soak runs and this re-measurement), so
   per the condition's final clause — the lever is spent only in a pass
   containing nothing but the lever — it cannot be spent here. No card
   price/stat/weight was touched, no unprinted keyword was printed, and #6
   (never interleave content and balance) is honoured.
2. **v23 Leader keyword print** — carried, untouched (content work; out of
   scope for a bug pass).
3. **v24 Event keyword print** — carried, untouched (same reason;
   `UNPRINTED_KEYWORDS` unmodified, no band built).
4. **`Unbreakable` weight 7** — **carried, trigger not met.** Cohort A:
   carriers 56.9% at n=1210 (identical to v24); B 57.4% (n=1619), C 58.1%
   (n=2313), stress 61.1% (n=745). Not negative anywhere — the weight-7
   re-check condition remains untripped.
5. **`Sacred` cohort dependence** — **carried, dependence re-confirmed.**
   A 51.9% (n=634, normΔ +1.9), B 59.4% (n=1398, normΔ +10.0), C 62.2%
   (n=995, normΔ +10.3), stress 47.0% (n=1707, normΔ +0.2). A ~15-point
   spread across cohorts with the sign flipping in the stress cohort — the
   number is still a statement about cohorts, not the keyword. No action
   until a pass isolates it.
6. **Content/balance interleaving** — carried and honoured: nothing shipped
   this pass but verification.

Closed this pass: nothing — this was a stress/verification pass; every
carry-forward item survives unchanged, which is itself the finding: four
cohorts, 23,808 games, ~1,500 extra fuzz/chaos matches, and the engine did
not blink.

## v26 re-measurement (2026-08-15)

Bug/QoL pass. **Runs:** eight cohorts, 5,952 games each — **47,616 games** —
`npx tsx scripts/simulate-v5.ts 6 32 <gameSeed> <deckSeed>`:

| Cohort | gameSeed | deckSeed | Why                              |
| ------ | -------- | -------- | -------------------------------- |
| A      | 1337     | 1337     | standing                         |
| B      | 1337     | 42       | standing                         |
| C      | 1337     | 7        | standing                         |
| D      | 1337     | 4242     | new deck roll, standing game seed |
| E      | 1337     | 9001     | new deck roll, standing game seed |
| F      | 20260815 | 20260815 | fresh game seed                  |
| G      | 20260815 | 777      | fresh game seed                  |
| H      | 20260815 | 31415    | fresh game seed                  |

Plus the fuzz soak at **1,200 seeds** (6x the CI default) and the chaos monkey
at **600** (10x), both through the new `FUZZ_SEEDS` / `CHAOS_SEEDS` env knobs
rather than a hand edit reverted before the commit — so this volume is
re-runnable by anyone, which the last four passes' volumes are not.

**Neutrality control.** A, B and C reproduce v25 to the decimal — P1 44.7 /
46.5 / 46.3, avg turns 20.3 / 21.6 / 21.8, and every keyword row identical
(Sacred 51.9 n=634, 59.4 n=1398, 62.2 n=995; Unbreakable 56.9 n=1210, 57.4
n=1619, 58.1 n=2313). The pass's changes are UI-only and the numbers say so.
`invariantCount` 0 in all eight; 0 failures across 1,800 fuzz/chaos matches.

### Carry-forward status

1. **Mer-King lever — STILL UNSPENT, carried.** This pass ships content (the
   Grading Lab overhaul) and UI work, so the condition's final clause — spent
   only in a pass containing nothing but the lever — holds again. Its
   cross-cohort pinned-minus-random gap is **not** one-signed (+3.8 / +7.7 /
   — / +3.5 / +5.0 / **−8.9** / +11.2 / +12.0, mean +4.9), which is the
   discriminating statistic v22 named; the lever stays authorized, unspent,
   and unjustified by this evidence alone.
2. **v23 Leader keyword print** — carried, untouched.
3. **v24 Event keyword print** — carried, untouched; `UNPRINTED_KEYWORDS`
   unmodified, no band built.
4. **`Unbreakable` weight 7 — carried, trigger still not met, now on eight
   cohorts.** Carrier win 56.9 / 57.4 / 58.1 / 66.0 / 61.8 / 61.2 / 60.3 /
   62.3 (normΔ +9.4 / +7.4 / +8.0 / +15.0 / +9.6 / +8.9 / +5.8 / +9.6).
   Positive everywhere; the re-check fires on a NEGATIVE carrier delta and
   has now failed to fire across eight independent deck rolls.
5. **`Sacred` cohort dependence — NARROWED, and this is the pass's balance
   finding.** v25 left it as "the sign flips in the stress cohort, so the
   number is a statement about cohorts". Eight cohorts say something sharper:
   normΔ +1.9 / +10.0 / +10.3 / +8.7 / +0.1 / +5.3 / +2.8 / +5.6 — **one-signed
   positive in all eight** (and v25's stress reading, +0.2, is the same sign).
   The SIGN is stable; only the MAGNITUDE is cohort-dependent, and it ranges
   from "indistinguishable from zero" (+0.1, +1.9) to "large" (+10.3). So the
   honest restatement is: Sacred is mildly positive, and any pass reading a
   double-digit delta off one cohort is reading its deck roll, not the
   keyword. Still no action — a keyword whose worst reading is +0.1 is not a
   balance problem, and rule #6 forbids spending a lever in this pass anyway.
6. **Content/balance interleaving** — carried and honoured: no card price,
   stat, weight or keyword band changed.

### New this pass

- **Ruin-Walker Overseer's pinned kit is one-signed negative across every
  cohort that samples it** (−17.9 / −15.8 / −8.0 / −3.5 / −0.5 / −8.2 / −5.4
  / −14.7, mean **−9.3**) — the only Leader in the table that is. v22 opened
  this and closed it as a deck-luck artefact of one lemon recipe; the lemon is
  real (deck #1, 17.2% cross-cohort mean, flagged by the aggregator) but it
  does not explain a gap that is negative in all eight cohorts including the
  three on a fresh game seed. This is now the strongest single balance signal
  in the report, and it is a **deck-recipe** question before it is a card
  question: the next balance pass should re-roll Ruin-Walker's deck #1 recipe
  and re-measure before touching a single card. Recorded, not acted on —
  same rule #6.
- The aggregator (`scripts/aggregate-cohorts.ts`) was run over all eight
  reports at once, which is what makes the two one-signed claims above
  statements rather than impressions.

## v27 re-measurement (2026-08-17)

Feature/bug/QoL pass (the 3D Showroom). **Runs:** the same eight cohorts,
5,952 games each — **47,616 games** — `npx tsx scripts/simulate-v5.ts 6 32
<gameSeed> <deckSeed>`, with the same seed table as v26 (A 1337/1337, B
1337/42, C 1337/7, D 1337/4242, E 1337/9001, F 20260815/20260815, G
20260815/777, H 20260815/31415). Plus the fuzz soak at **1,200 seeds** and the
chaos monkey at **600**, through the `FUZZ_SEEDS` / `CHAOS_SEEDS` env knobs.

**Neutrality control.** A, B and C reproduce v26 to the decimal — P1 44.7 /
46.5 / 46.3, avg turns 20.3 / 21.6 / 21.8. `invariantViolations` empty in all
eight; 0 failures across 1,800 fuzz/chaos matches. The pass's changes are UI
and one new screen, and the numbers say so.

**Interactive harnesses.** `audit:screens` 0 problems over the full 24-screen
sweep (both widths, depth two). `drive:match` 0 findings over 10 matches
(phone and desktop, watched / studied / skipped narration, 2 VICTORY screens
reached). The two NEW harness entries (`showroom`, `showroom-slab`) returned
174 problems on their first run — see the changelog; one bug, fixed, re-run
clean.

### Carry-forward status

1. **Mer-King lever — STILL UNSPENT, carried.** This pass ships a feature, so
   the condition's final clause (spent only in a pass containing nothing but
   the lever) holds for the fifth time. Its pinned-minus-random gap is again
   not one-signed: +3.5 / +11.2 / +12.0 / +5.0 / −8.9 / +3.8 / +7.7 / — , mean
   +4.9 — identical to v26, as it must be on an unchanged engine.
2. **v23 Leader keyword print** — carried, untouched.
3. **v24 Event keyword print** — carried, untouched; `UNPRINTED_KEYWORDS`
   unmodified.
4. **`Unbreakable` weight 7 — carried, trigger still not met.** The re-check
   fires on a NEGATIVE carrier delta and has now failed to fire across eight
   deck rolls in two consecutive passes.
5. **`Sacred` cohort dependence — carried at v26's narrowed statement.** Sign
   stable, magnitude is the deck roll. No action; a keyword whose worst
   reading is +0.1 is not a balance problem.
6. **Content/balance interleaving** — carried and honoured: no card price,
   stat, weight or keyword band changed.

### Ruin-Walker: the carry-forward, narrowed

v26 opened this as "the strongest single balance signal in the report" and
recommended re-rolling Ruin-Walker Overseer's deck #1 recipe before touching a
card. The re-measurement says the recipe is **not** the story.

The pinned-minus-random gap is unchanged and still one-signed negative in all
eight cohorts (−3.5 / −5.4 / −14.7 / −0.5 / −8.2 / −17.9 / −15.8 / −8.0, mean
**−9.3**) — the only Leader in the table that is. What is new is the company
its lemon keeps. Run over all eight reports at once, the aggregator flags a
15-points-under-median deck recipe for **seven of the nine Leaders**:

| Leader                      | lemon deck | cross-cohort mean |
| --------------------------- | ---------- | ----------------- |
| Ethereal Sea Witch          | #8         | 12.8%             |
| Sentinel of the Nether Pit  | #2         | 15.6%             |
| Ruin-Walker Overseer        | #1         | 17.2%             |
| Kuro, the Unseen            | #2         | 30.5%             |
| Legendary Diver             | #6         | 31.3%             |
| Mer-King                    | #4         | 36.7%             |
| Avatar of the Abyss         | #3         | 42.0%             |

Ruin-Walker's lemon is real, and it is the THIRD worst of seven — the two
Leaders carrying a worse one (Ethereal Sea Witch at 12.8%, Sentinel at 15.6%)
both post a gap that flips sign across cohorts. A per-Leader lemon is
therefore a property of the recipe generator, not of Ruin-Walker, and it
cannot explain a statistic that only Ruin-Walker exhibits.

**Restated carry-forward.** Re-rolling deck #1 is no longer the first move; it
would change the mean and leave the sign question untouched. The next balance
pass should instead measure Ruin-Walker's gap with the flagged recipe
EXCLUDED from both arms — if the sign survives with the lemon removed, it is a
kit reading and the pinned kit is the thing to price. Recorded, not acted on:
rule #6, and this pass ships a feature.

### New this pass

- The per-Leader lemon table above is itself new information: seven of nine is
  a generator property that had never been read off the aggregator, because
  before v26 there was no cross-cohort run to read it from and in v26 only the
  one Leader under discussion was quoted.
- No card, price, stat, weight or keyword band changed.

## v28 re-measurement (2026-08-18)

Bug/QoL pass. **Runs:** the same eight cohorts, 5,952 games each —
**47,616 games** — `npx tsx scripts/simulate-v5.ts 6 32 <gameSeed> <deckSeed>`,
same seed table as v26/v27 (A 1337/1337, B 1337/42, C 1337/7, D 1337/4242,
E 1337/9001, F 20260815/20260815, G 20260815/777, H 20260815/31415). Then the
**same eight again** under `PINNED_RECIPE_SALT=v28` — a second, independent
draw of the pinned suite's deck-space, 95,232 games in total. Plus the fuzz
soak at 1,200 seeds and the chaos monkey at 600.

**Neutrality control.** A, B and C reproduce v27 to the decimal — P1 44.7 /
46.5 / 46.3, avg turns 20.3 / 21.6 / 21.8. `invariantViolations` empty in all
eight; 0 failures across 1,800 fuzz/chaos matches. An unsalted run is byte-
identical to the pre-v28 code path (checked directly, `meta.generatedAt` and
the new `meta.pinnedRecipeSalt` aside), so the knob below is a no-op when
unset and every historical number stays comparable.

### The instrument: `PINNED_RECIPE_SALT`, and what it found

The v27 carry-forward pre-registered a specific next move: measure
Ruin-Walker's gap **with the flagged lemon recipe excluded**. That test is run
below and it answers. But it is worth saying why a second test was run
alongside it: an exclusion tells you what one deck was doing, and the question
underneath four passes of Ruin-Walker argument is what the SUITE is doing.

`PINNED_RECIPE_SALT` re-rolls pinned recipes #1..#8 (deck #0 is the historical
anchor and never moves) without touching a card, a weight, a cost or a line of
engine. It is one draw of deck-space against another, with everything else
held fixed — the cleanest available test of whether a per-Leader reading is a
property of the kit or of the nine decks the kit was dealt.

**The answer is that the suite's Leader ranking does not survive a re-roll.**
Cross-cohort pinned means, both draws, and the rank each Leader takes:

| Leader                      | draw 1 (unsalted) | draw 2 (salted) | rank move |
| --------------------------- | ----------------- | --------------- | --------- |
| Mer-King                    | 65.8 (#1)         | 58.6 (#2)       | −1        |
| Avatar of the Abyss         | 55.1 (#2)         | 63.7 (#1)       | +1        |
| Ethereal Sea Witch          | 51.8 (#3)         | 42.8 (#8)       | **−5**    |
| Kuro, the Unseen            | 49.7 (#4)         | 48.9 (#4)       | 0         |
| Sovereign of the Dying Star | 48.5 (#5)         | 45.9 (#6)       | −1        |
| Void Mother                 | 45.4 (#6)         | 41.9 (#9)       | −3        |
| Legendary Diver             | 45.0 (#7)         | 54.8 (#3)       | **+4**    |
| Sentinel of the Nether Pit  | 44.5 (#8)         | 43.8 (#7)       | +1        |
| Ruin-Walker Overseer        | 43.1 (#9)         | 46.3 (#5)       | **+4**    |

**Spearman ρ = 0.417** between the two orderings, at 47,616 games per draw.
Sampling error is not what is moving these — each cohort's own numbers are
stable to the decimal across passes — the deck recipes are.

The one-signed gap test moves with it. In draw 1 exactly one Leader is
one-signed: Ruin-Walker, negative. In draw 2 exactly one Leader is one-signed:
**Avatar of the Abyss, positive (+9.1)** — and Ruin-Walker is not one-signed
at all. The statistic v22 named as discriminating, and that v26/v27 built the
whole Ruin-Walker case on, is conditional on the recipe draw.

### Ruin-Walker Overseer — CLOSED

Both tests agree, and they are independent of each other:

| measurement                            | per-cohort gap                                       | mean | one-signed? |
| -------------------------------------- | ---------------------------------------------------- | ---- | ----------- |
| all nine decks (v26, v27, v28 draw 1)   | −3.4 −5.4 −14.6 −0.5 −8.2 −17.9 −15.8 −8.0           | −9.2 | yes         |
| lemon deck #1 excluded (v27's own test) | −0.1 −1.8 −11.6 **+3.3** −5.6 −15.0 −12.0 −5.0       | −6.0 | **no**      |
| recipes #1..#8 re-rolled (draw 2)       | −1.8 −1.0 −11.9 **+1.4** −4.3 −15.1 −11.4 −4.3       | −6.0 | **no**      |

Removing the lemon and re-rolling every recipe land on the same residual
(−6.0) and both break the sign in the same cohort. So the one-signedness —
the entire basis of the item since v26 — was carried by deck #1. v27's
counter-argument ("seven of nine Leaders carry a lemon, so a lemon cannot
explain a statistic only Ruin-Walker exhibits") was the right question asked
the wrong way: what mattered was never that Ruin-Walker HAS a lemon, but that
a 17.2% recipe sitting under a kit already at the bottom of the table is
enough to push all eight cohorts the same way, where the same lemon under a
mid-table kit is not.

A residual of −6.0 that flips sign across cohorts is an ordinary reading. **No
card is touched, no lever is opened, and the item comes off the carry-forward
list.** Four passes of argument, closed by an instrument change rather than a
balance change — which is what the Sentinel rule has said to do since v20.

### Carry-forward status

1. **Mer-King lever — REVOKED, not carried.** The lever's whole authorization
   (v20's gate, met in v23 and re-quoted in v25/v26/v27) rests on "first in
   every cohort at ~65%, nine clear of second". On draw 2 Mer-King is second at
   58.6, its gap flips to −2.5, and it is 5.1 behind a Leader that draw 1 had
   ranked below it. The reading was never nine points of kit; a large part of
   it was the nine decks. Per the Sentinel precedent — **do not spend a lever
   against an instrument that has just moved** — the authorization is withdrawn
   and any future Mer-King case must be built on a statistic that survives a
   recipe re-roll. Nothing about Mer-King's cards changes; what changes is that
   there is no longer a scheduled lever waiting to be spent on it.
2. **v23 Leader keyword print** — carried, untouched.
3. **v24 Event keyword print** — carried, untouched; `UNPRINTED_KEYWORDS`
   unmodified.
4. **`Unbreakable` weight 7 — carried, trigger still not met** across sixteen
   deck rolls in three consecutive passes. The re-check fires on a NEGATIVE
   carrier delta; it has never fired.
5. **`Sacred` cohort dependence — carried at v26's narrowed statement.** Sign
   stable, magnitude is the deck roll. No action.
6. **Content/balance interleaving** — carried and honoured: no card price,
   stat, weight or keyword band changed.
7. **NEW — nothing per-Leader ships off one recipe draw.** ρ = 0.417 is the
   number to quote. A per-Leader claim is not a measurement until it holds
   across at least two independent draws of `PINNED_RECIPE_SALT`; the eight
   cohorts vary the game RNG and the random arm's decks, and it took until v28
   to notice that they had never varied the pinned arm's at all. The standing
   "four cohorts, six for one Leader" rule now has a second axis: **two draws,
   always, for anything about a Leader.**

### New this pass

- `PINNED_RECIPE_SALT` (`scripts/simulate-v5.ts`), and `meta.pinnedRecipeSalt`
  on every report so two draws can never be mistaken for two cohorts of one.
- The Ruin-Walker item is closed rather than carried — the first carry-forward
  item retired since v23.
- No card, price, stat, weight or keyword band changed.
