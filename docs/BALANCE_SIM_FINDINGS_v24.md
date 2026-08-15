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
