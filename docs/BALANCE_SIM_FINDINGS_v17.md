# Balance & Sim Findings — v17 (August 2026)

The v16 carry-forward pass: the Sentinel lever came due, Avatar's watch pass
completed, and both scheduled moves shipped. This pass ALSO carried a large
interactive-seam bug hunt (engine/UI, outside this doc's scope — see the
CHANGELOG); per the v7.7 §12 rule those changes were verified sim-neutral
before any trial was measured (the baseline below reproduces v16's shipped
numbers exactly, including the new engine log lines). Supersedes the v16
findings doc, deleted this pass — only the newest sim doc is kept.

**Runs:** `npx tsx scripts/simulate-v5.ts 6 32 1337 <deckSeed>` for deckSeed
1337 (A), 42 (B), 7 (C), 99 (D) — 5,952 games each, four independent deck
cohorts, per the standing rule. **Invariant violations: 0** on every run of
every trial (baseline, trial 1, trial 2 — 71,424 games total).

Sequential measured trials, one lever at a time, each on all four cohorts:
baseline → Sentinel minus -2 → -3 (§1) → Avatar minus -4 → -3 (§2).

| Metric (A / B / C / D) | baseline                    | shipped                     |
| ---------------------- | --------------------------- | --------------------------- |
| Sentinel (pinned)      | 64.9 / 69.6 / 63.7 / 65.5   | **61.0 / 61.9 / 58.0 / 62.2** |
| Avatar (pinned)        | 35.7 / 38.1 / 42.3 / 34.5   | **44.9 / 53.3 / 52.4 / 47.3** |
| P1 win rate            | 44.0 / 46.1 / 46.0 / 45.2   | 44.8 / 46.4 / 46.3 / 45.0   |
| Avg game length        | 20.1 / 21.5 / 21.6 / 20.9   | 20.2 / 21.6 / 21.9 / 21.1   |

---

## 1. Sentinel of the Nether Pit — the minus goes to -3

v16 carry-forward #2 set the condition and this baseline met it: on the
three-deck pinned suite (the clean instrument), Sentinel finished FIRST in
all four cohorts for the second consecutive pass — 64.9/69.6/63.7/65.5, its
WORST deck still ≥54.8% — and the item named the lever: "the minus to -3, or
Resolve 5 → 4." The minus was pulled first (`crimson_vector_commander` in
`LEADER_MINUS_RESOLVE_OVERRIDE`, -2 → -3, price-only; the ability text
regenerates from the delta).

Measured (trial 1): **62.8 / 64.0 / 59.2 / 63.4** — down 2.1/5.6/4.5/2.1
points, and in cohort C it hands first place to Mer-King (59.5) for the
first time on this instrument. Trial 2 (Avatar moving underneath it) reads
it 61.0/61.9/58.0/62.2 — stable. The kit still tops three of four tables,
but the trajectory is right, the deck floor came down (worst deck 50-54.5%
vs 54.8-58.9% at baseline), and the shape is no longer "first everywhere
with every deck."

The -3 walks the same parity ledge the v16 §6 fix guards: Resolve 5 → 2,
builder to 3, and a -3 from 3 lands exactly on 0, which shatters. Watched:
shatter rate reads 2.3/6.2/5.3/3.4% (v16 shipped: 2.2/5.4/5.7/4.1 — flat),
but `shatteredWinPct` in cohort C is 26.6% against Sentinel's 43.8% average
there — some of those C shatters are donations again. Carried as a watch
item, not actioned: n is small (games-with-shatter per cohort is dozens) and
the other three cohorts read 41.2-61.9%.

**One lever per Leader per pass** (the v7.6 rule): Resolve 5 → 4 stays
unspent. If Sentinel still tops 3+ cohorts on the next pass's clean
baseline, that is the named next lever — measured fresh, not carried, per
the Kuro v7.6 precedent (an isolated measurement of an unspent lever expires
when the first lever ships).

---

## 2. Avatar of the Abyss — the -4 walks back to -3, and it lands mid-field

v16 carry-forward #3, watch pass completed by this baseline: Avatar read
last or next-to-last in all four cohorts (35.7/38.1/42.3/34.5 pinned) with
small deck spreads — a kit reading, not a deck roll. The -2 → -3 → -4
ladder was measured entirely on the pre-v8, pre-three-deck instruments, so
the walk-back the item scheduled shipped: `avatar_of_the_abyss` -4 → -3,
price-only, measured alone (trial 2).

**Measured: 35.1 → 44.9 (A), 39.6 → 53.3 (B), 42.9 → 52.4 (C), 35.1 → 47.3
(D)** — nine to fourteen points, out of the cellar and into mid-field, and
NOT to the top of any table (3rd/4th/7th of nine). Random-deck diagnostics
agree: shatter rate 0.8-2.0%, ability uses 8.0-10.5/game — the kit grinds
again without the v6.1-era dominance returning (the Commander strip and the
9-cost print both still stand). **Closes.** The bottom cluster is now
Sovereign of the Dying Star (35.1-39.6) and Void Mother (35.1-41.7) — see
carry-forward #2.

---

## 3. The watch items

- **`Unbreakable` (v16 #1) — holds in band.** +9.4/+8.0/+8.2/+9.0 (v16
  shipped: +9.7/+8.8/+8.6/+8.6), carriers positive, plays held. The trigger
  in the item (act only if carriers drift NEGATIVE; unwind the stat trims
  first, then the weight) did not fire. Carried unchanged.
- **`Sacred` (v16 #4) — carried.** +2.2/+9.7/+10.8/+9.3 — still the most
  cohort-dependent keyword in the file (A reads it flat, B-D band-edge), and
  still nothing actionable by weight (three failed attempts on record) or by
  carrier. Stays the standing example of cohort dependence.

---

## 4. What the pass changed outside the trials (verified sim-neutral)

The interactive bug hunt ran BEFORE the baseline so nothing here is a
reading against a moved pool:

- Engine log lines added (leader ability uses, invoke targets, per-packet
  clash damage) — display-only; the harness's only log grep (`sheds`) is
  untouched, and the baseline reproduced v16's numbers exactly.
- `reactionPlays` gained a pause option and `runDusk` a shed-chooser hook —
  both inert unless a UI installs them; sims and tests leave them unset.
- Tool nerf honors an explicit invoke target; the AI never passes one for
  Tools, so its play is unchanged.
- The `interactive-v17` test suite (9 tests) pins all of the above.

## Carry-forward items

1. **Sentinel of the Nether Pit: one more clean-baseline look.** The -3
   shipped and moved it 2-6 points; it still tops three of four cohorts
   (61.0-62.2). If the NEXT pass's baseline still has it first in 3+, spend
   Resolve 5 → 4 (the other half of the v16 lever), measured fresh. Also
   watch cohort C's `shatteredWinPct` 26.6% — if the C shatters stay
   donation-shaped at larger n, the v16 §6 answer-gate needs a second look
   at the -3 price point.
2. **The bottom cluster is now two:** Sovereign of the Dying Star
   (35.1-39.6) and Void Mother (35.1-41.7), both with small deck spreads —
   kit readings. Both have spent levers on record (Void Mother: minus -4 AND
   Resolve 5; Sovereign: none since its identity print). Sovereign is the
   virgin case: it has never had a dedicated look, and its 11.9-23.8% worst
   matchups repeat against Ruin-Walker. One watch pass to confirm on the
   post-Avatar field, then Sovereign gets the dedicated pass.
3. **`Unbreakable` weight 7** — carried unchanged from v16 #1 (trigger:
   carriers drifting negative; unwind order: stat trims, then weight).
4. **`Sacred` cohort dependence** — carried unchanged.
5. **Four cohorts is the standing run** — carried unchanged.
6. **Do not interleave content and balance changes** — carried. This pass's
   engine/UI fixes were landed and verified sim-neutral BEFORE the baseline;
   the two levers were then measured sequentially against it.

## Closed this pass

- ~~Sentinel first in all four cohorts (v16 #2)~~ — condition confirmed,
  the named lever (-2 → -3) shipped and measured; no longer first
  everywhere, remainder carried as #1 with the second lever named.
- ~~Avatar of the Abyss over-nerf walk-back (v16 #3)~~ — closed: -4 → -3
  lands it mid-field on all four cohorts without topping any.
