# Balance Sim Findings — v4.11

Pass structure: harness upgrade (five new instrumentation additions, below)
→ 33,840-game baseline (`npm run sim:v4 -- 15`, 48 decks, `sameTurn` Twin
mode selected by the A/B/C pre-pass) → a 21-arm × 16-subject ablation
battery (`sim:ablation 40`, the 11 carried-over subjects plus a new
5-subject Avenge Swarm deck-swap isolation and a new Avenge-buff arm) →
actions → full 33,840-game verification re-sim of the two ship candidates.
No invariant violations in either full-report run.

**This pass ships no balance change.** Both levers considered (an Anchor
roster-floor lift and a Crescendo base step) were built, measured, and
**rejected after full-sim verification** — the honest outcome for a roster
that has converged over v4.5–v4.10. The pass's value is diagnostic: it
**closes two long-open priority items** (Mer-King's Avenge Swarm, and the
zero-measuring Unit-Ability-order detector) by proving what they are rather
than papering over them, adds five harness upgrades, and keeps every null
and negative result honest.

## 1. Harness upgrades (what this pass could measure that v4.10 couldn't)

- **Avenge Swarm deck-swap isolation** (`simulate-ablation.ts`, five new
  SUBJECTS). v4.10 §4 item 1 asked specifically for "a deck-level swap test
  isolating Mer-King's kit from the Avenge Swarm cardlist, mirroring how
  Avenge Grind was isolated in earlier passes." Built exactly that: the same
  Avenge Swarm list under Shinobi (`AvengeSwarm-ShinobiLdr`) and Diver
  (`AvengeSwarm-DiverLdr`) to isolate the Leader kit, plus `-noGuard` and
  `-noMend` variants to isolate the deck's own keyword/effect package. See
  §2.3 — this is the tool that finally cracked the item.
- **`avengeCap 2->4` ablation arm** (`simulate-ablation.ts`). Every prior
  Avenge lever was a *nerf* direction (`avengeCap 2->0`); this is the buff
  direction, to test whether loosening Avenge's ramp cap lifts Avenge Swarm
  or (as it turned out) mostly re-inflates Shinobi Avenge Grind at the top.
- **Unit-Ability-order situation counters** (`ai.ts` `playPlacement`;
  `simulate-v4.ts`). v4.10 §4 item 4 flagged that `lapseUnitAbilityOrderFixed`
  measured *exactly zero* and asked whether that's genuinely true or a
  detector blind spot. Two companion counters now fire whenever the
  *situation* arises at all — `unitAbilityMultiCandidate` (2+ eligible Unit
  Abilities competing for one spare die) and `unitAbilityMultiCandidateTiered`
  (of those, at least two in different action-value tiers, so a wrong order
  is even *possible*) — regardless of whether the pick was already optimal.
  This distinguishes "detector broken" from "situation never arises." See
  §2.4.
- **Cost-vs-value RESIDUAL table** (`simulate-v4.ts`). v4.10's cost-vs-value
  *ratio* (win% ÷ difficulty) has an offset artifact: win% is centered on
  ~50%, not 0, so dividing by difficulty makes every hard-cost card read
  "weak" and every cheap card read "OP" purely from the divisor. The new
  view groups cards into half-point difficulty bands, takes each band's own
  mean win%, and reports each card's deviation from *its own cost band* — a
  card only surfaces if it out/under-performs *other cards at the same cost*.
  See §3.
- **Keyword-health table** (`simulate-v4.ts`). Win% alone can't tell a *weak*
  keyword from an *underplayed* one. Each keyword's win% is now paired with
  how many distinct pool cards carry it and the average casts/game of those
  cards, so keyword add/remove/nerf/buff calls have activation data behind
  them. This immediately surfaced a structural finding (§3): Crescendo — the
  bottom keyword every pass — exists on **exactly one pool card**.
- **`crescendoBase` SIM_TUNING dial** (`engine.ts`, `cardpool.ts`). v4.10 §4
  item 3 asked whether Crescendo's base value needs a step now that the
  redesigned trigger is reliable. The base was hardcoded; it's now an
  ablatable dial (default 4 = live) so the question is measurable instead of
  a guess. See §2.2.

## 2. Headline findings

### 2.1 The Anchor roster-floor lift — clean in ablation, rejected by the full sim

The ablation battery (fixed mid-tier opponent roster) measured
`anchorHpBonus 0→1` as a textbook floor-lift:

| arm | Sea Witch Anchor-Scrap | Abyss Excavate Ramp | Shinobi Tempo-Anchor | Shinobi Avenge Grind | Shinobi Steel-Scrap |
|---|---|---|---|---|---|
| baseline | 21.0% | 50.0% | 19.2% | 79.0% | 79.8% |
| **anchorHp+1** | **30.8%** | **56.3%** | 23.3% | 79.8% | 80.0% |

The three bottom ramp decks rose, the top decks stayed flat — exactly what a
spread-compressing lever should look like. **But the full 33,840-game
round-robin verification exposed collateral the fixed-opponent ablation
structurally could not see:**

| metric | baseline | anchorHpBonus=1 | Δ |
|---|---|---|---|
| Abyss Excavate Ramp | 47.6% | 56.6% | **+9.0** |
| Sea Witch Anchor-Scrap Ramp | 24.5% | 35.7% | **+11.2** |
| Mer King Guard-Bulwark Turtle | 74.5% | 69.6% | **−4.9** |
| Mer-King (Leader, aggregate) | 43.7% | 41.5% | **−2.2** |
| **Leader win-rate spread** | **14.1pt** | **16.8pt** | **+2.7 (worse)** |

The full round-robin redistributes: buffing every Anchor Unit makes the ramp
decks beat *more of the field*, and those wins come out of the decks with no
ramp archetype of their own. Mer-King is the only Leader with **zero** ramp
decks, so its walls simply get ground down by the now-stronger ramp — and
Mer-King was already the roster floor. **Widening the Leader spread by
sinking the already-lowest Leader is the exact opposite of the goal.** Not
shipped. (`SIM_TUNING.anchorHpBonus` kept at 0.) A clean, cautionary
ablation-vs-full-sim divergence: the fixed-opponent ablation is a scalpel
for "what powers this deck," not a substitute for full-roster verification of
a *global* stat change.

### 2.2 Crescendo — new baseline holds; a base step measures null

v4.10 redesigned Crescendo's trigger (per-die-placed scaling → flat "rolled
any 6 this turn") and recovered it 36.4% → 41.3%. This pass confirms that
new baseline **holds exactly: 41.3% again** on a fresh 33,840-game run — the
redesign is stable, not a one-run fluke.

v4.10 §4 item 3 then asked whether the *base value* needs a step now the
trigger fires reliably. Tested via the new `crescendoBase` dial, 4 → 5:

| | baseline (base 4) | base 5 |
|---|---|---|
| Crescendo keyword win% | 41.3% | 41.3% (null) |

**Null.** The keyword-health table (§1) explains why: Crescendo exists on
**exactly one card in the entire pool**, so the aggregate keyword number is
almost totally insensitive to a +1 on that one card's payoff — the same null
the four pre-redesign base bumps (1→2→3→4) hit, but for a *representation*
reason rather than the old *reliability* reason. Not shipped; base kept at 4.
The real Crescendo question is no longer its size or its trigger — it's that
a keyword on a single card is barely a keyword at all (see §4).

### 2.3 Mer-King's Avenge Swarm — DIAGNOSED, and it is not a card-balance bug

This item has been open since Avenge Swarm's post-Guard-nerf regression in
v4.9. v4.10's per-card look found its weakness "diffuse, not concentrated"
and a +1 buff to its three weakest cards moved it +0.2pt (noise). The
diagnosis this pass — via the deck-swap isolation v4.10 explicitly asked
for — is decisive. The **same Avenge Swarm cardlist** under different Leaders
(ablation, fixed opponent roster, n=480 per cell):

| subject | win% | vs. Mer-King baseline |
|---|---|---|
| **Mer King Avenge Swarm** (baseline) | **36.3%** | — |
| AvengeSwarm-ShinobiLdr (same list, Shinobi) | 46.9% | **+10.6** |
| AvengeSwarm-DiverLdr (same list, Diver) | 59.8% | **+23.5** |
| AvengeSwarm-noGuard (Mer-King, Guard→Swift) | 36.3% | +0.0 |
| AvengeSwarm-noMend (Mer-King, mend package stripped) | 49.2% | **+12.9** |

The reading is unambiguous:

- **It is the Mer-King kit, not the Avenge cards.** The identical list wins
  46.9% under Shinobi and **59.8% under Diver**. The Avenge cards are fine —
  they win nearly 60% under the right Leader.
- **The Guard secondary tag is irrelevant** (`-noGuard` = 36.3%, identical).
- **Within Mer-King, the deck's own mend package is the drag** (`-noMend`
  +12.9pt). Mer-King's whole kit is sustain — a mend Ability, a mend
  Ultimate, and the archetype drafts mend spells on top. Sustain is
  *anti-synergistic with a sacrifice-swarm plan* that wants to trade Units
  into the board to trigger Avenge; the deck is fighting its own Leader.

**Why no card or keyword lever is warranted, and none ships:** buffing the
Avenge cards to lift the 36% Mer-King build would push the Diver build (60%)
and Shinobi Avenge Grind (already 86.4% on the full roster) further out of
line — the exact failure mode v4.6–v4.9 documented for shared-keyword levers.
`avengeCap 2→4` confirmed it directly: Mer King Avenge Swarm 36.3% → 38.1%
(+1.8, noise), Shinobi Avenge Grind 79.0% → 79.2% (flat) — a global Avenge
buff can't fix one Avenge deck without touching the other. **Avenge Swarm's
36% is a Leader-kit-fit problem, not a balance bug**, and the honest
resolution is to stop reading its win rate as a card-balance signal. Item
closed.

### 2.4 The Unit-Ability-order detector — measures zero because the situation genuinely never arises

v4.10 §4 item 4 asked whether `lapseUnitAbilityOrderFixed`'s exact-zero
reading is real or a blind spot. The two new situation-frequency counters
answer it definitively — **all three measured exactly zero** across 33,840
games:

| counter | total | per game |
|---|---|---|
| `unitAbilityMultiCandidate` (2+ eligible abilities, one die) | 0 | 0.000 |
| `unitAbilityMultiCandidateTiered` (…in different value tiers) | 0 | 0.000 |
| `lapseUnitAbilityOrderFixed` (…and the order was wrong) | 0 | 0.000 |

The detector is **not blind** — the situation simply never occurs. By the
time `playPlacement`'s ability step runs (after all casts, inside the
`while(progress)` loop that activates one ability per iteration and
re-collects), having 2+ Units that each carry an Ability, are each eligible
to act (not attacking, not sick, not bound), and have a spare die *at the
same moment* requires a confluence that this roster never produces in 33,840
games. Ability-carrying Units are a minority (tier≥2, ~1-in-4), and the loop
spends dice down between iterations. `lapseUnitAbilityOrderFixed = 0` is
therefore genuinely correct, not a measurement gap. Item closed.

### 2.5 The wall-list meta — still open, guardHpBonus still correctly not shipped

Re-measured the still-open v4.10 item 2 (`guardHpBonus 2→1`), now with the
Avenge Swarm subject in the battery:

| arm | Guard-Bulwark Turtle | Mer King Avenge Swarm | Excavate Ramp | Tempo-Anchor |
|---|---|---|---|---|
| baseline (2) | 69.8% | 36.3% | 50.0% | 19.2% |
| guardHpBonus 2→1 | **59.8%** | **28.8%** | 55.8% | 22.9% |

Same shape as v4.10, and now with **direct evidence it hurts Avenge Swarm**:
the Guard cut craters Guard-Bulwark Turtle (−10pt) *and* drops Avenge Swarm a
further −7.5pt (Mer-King uses Guard bodies in both archetypes). v4.10 blocked
this pending "an independent Mer-King fix so the two changes don't have to be
diagnosed together." §2.3 delivered a *diagnosis* but not a *fix* — Avenge
Swarm's problem is structural kit-fit, with no card/engine lever that
improves it. So the precondition to ship the Guard cut is still unmet, and
the cut would now demonstrably re-sink both weak Mer-King archetypes. **Still
not shipped.** Carried forward.

Shinobi Avenge Grind remains the roster's top deck at 86.4% (full run,
unchanged from v4.10).

## 3. Other results (no action)

- **Cost-vs-value residual table** (§1): the new offset-corrected view
  cleanly re-confirms the standing wall-body finding — Flickering Sea Pens
  and Cavernous Watcher sit **+30.3pt above the mean win% of other cards at
  their d=2.0 cost band** (n=5,640 each, spanning many archetypes), the
  exact-cost cheap-durable bodies flagged every pass since v4.6. No *new*
  actionable buy candidate emerges: the "over-priced" side of the residual
  table is dominated by single-archetype artifacts (n=1,410 rows where a
  card appears in exactly one deck, so its win-in-deck ≈ that one deck's win
  rate — the same degeneracy v4.10 §1 noted for per-archetype win-in-deck).
  A standing diagnostic, sharper than v4.8's ratio, but nothing clears the
  bar this pass. The one clean lever that targets those wall bodies
  (`exactCostBudgetCap 1.5→1.0`) still doesn't help on the full roster
  (Avenge Grind went *up*, 79.0% → 81.3%), same as v4.9.
- **Keyword-health table** (§1): beyond Crescendo (1 card), the low-
  representation keywords all show the expected noise — Pierce (2 cards,
  54.5%), Swift (2, 57.2%), Rally (3), Toll (3), Avenge (3). Their win rates
  ride on a handful of cards and shouldn't be read as broad keyword signals.
  The genuinely well-populated keywords cluster tightly around 48–52% (Guard
  50.3%, Ward 50.3%, Frenzy 52.3%, Anchor 51.2%, Echo 48.2%), i.e. balanced.
  No keyword-level action, but a real structural note for §4.
- **Per-archetype-normalized Echo win-delta** (v4.10 §4 item 5): still no
  card clears the bar. The largest meaningful-n residual is Volcanic Nanite
  Core −3.3pt (n=733); everything with a bigger delta is tiny-n (Victorian
  Helmet −6.6pt n=19, Swirling Ink Cloud −4.2pt n=113 — unchanged from
  v4.10). The tool continues to work as intended: Kinetic Siphon Swarm's
  alarming 20.4% *raw* Echo-recast win rate (n=1,531) normalizes to just
  −0.8pt once its archetype baseline is divided out — it's recast almost
  exclusively by a 21%-win deck, so the low number is deck quality, not the
  card. Nothing to act on.
- **CPU reasoning lapses**: `lapseMissedLethal`, `lapseWastedCastableDie`,
  `lapseIdleLeaderAbility_genuine`, `lapseCombatTradeTargetFixed`'s win-delta
  (−0.0pt), and the new Unit-Ability situation counters all consistent with
  v4.10. `lapseIdleLeaderAbility_diceSpentDown` stays high (2.33/game) with a
  *positive* win-delta (+6.4pt) — reconfirming it's not a lapse at all but
  correct prioritization (dice went to board development, which wins).
- **Fatigue, first-player edge, game length**: 52.0% first-player edge, 10.7
  avg rounds, 0 deckouts/timeouts — consistent with v4.8–v4.10.
- **Full feature-and-bug hunt**: reviewed the entire engine (`engine.ts`),
  the CPU AI (`ai.ts`), and the highest-risk UI paths in `GameV4.tsx`
  (die-capture on armed abilities/ultimates/echo, target-pending resolution,
  stage/turn gating, the die tray). Found **no correctness bug** — the code
  is mature (v4.5–v4.10 swept it repeatedly) and the reviewed UI already
  carries the accessibility affordances (aria-label/aria-pressed/title,
  captured paying die) prior passes added. Reported honestly rather than
  manufacturing a change. Browser automation for a live click-through was
  **not available** in this environment (`playwright install chromium` is a
  no-op through the sandbox proxy; no system browser), so the UI was verified
  by code review only — the *engine* game-flow, by contrast, is exercised by
  33,840 games per run with full per-turn invariant checking (zero
  violations). One regression test added (`engine.test.ts`) locking the new
  `crescendoBase` dial's default-equals-live invariant and its
  rebuild-applies-change behavior; 92 tests pass.

## 4. Still open — priority list for the next pass

1. **The wall-list meta is still not closed** (§2.5) — `guardHpBonus 2→1` is
   measured and ready but demonstrably re-sinks both weak Mer-King archetypes
   (Guard-Bulwark Turtle −10pt, Avenge Swarm −7.5pt), and §2.3 showed Avenge
   Swarm has no independent card/engine fix. The precondition to ship the
   Guard cut (an independent Mer-King floor fix) is *structurally hard*: any
   ramp/floor buff redistributes against Mer-King (the only Leader with no
   ramp deck), and any Guard/sustain buff over-rewards Guard-Bulwark Turtle.
   The next real lever is probably **Leader-kit-shaped, not keyword-shaped** —
   a Mer-King change that helps a sacrifice-swarm plan without rewarding a
   sustain-turtle plan (e.g. an Avenge- or death-triggered kit element rather
   than more mend). Needs its own design pass, not another dial.
2. **Crescendo is a one-card keyword** (§2.2/§3, new this pass). Its bottom-
   of-table win rate is now understood to be a *representation* problem, not
   a power problem — the redesigned trigger works and a base step is null
   because it lands on a single card. The open question is a **pool-assignment
   one**: give Crescendo more Event representation (it currently rolls onto
   one card via `hash % 5 === 3` colliding with other keyword rolls), or
   accept it as a deliberately-rare flavor keyword and stop treating its
   keyword-table row as a balance signal. Either way, hash-assignment changes
   are fragile (see `pickHardGate`'s warning) and warrant a dedicated,
   carefully-verified pass.
3. **Mer-King's Twin Heal** (39.1%, unchanged) — the v4.10 per-card buff to
   its three weakest cards did recover it +2.0pt then; it's held. Its sibling
   Avenge Swarm is now diagnosed (§2.3) as a kit-fit problem; Twin Heal is
   worth the same deck-swap isolation next pass to confirm whether it, too,
   is Mer-King-kit-bound rather than card-weak.
4. **The exact-cost wall bodies** (§3) — Flickering Sea Pens / Cavernous
   Watcher at +30pt over their cost band remain the clearest single
   over-performers, but the only clean lever (`exactCostBudgetCap`) doesn't
   help on the full roster. A *targeted* per-card stat trim on those two
   specific bodies (the MANUAL_STEEL/MANUAL_VALUE_BUFF pattern, in reverse)
   is a candidate worth measuring next pass.
5. **Per-archetype-normalized Echo win-delta** (§3) — unchanged from v4.10:
   the tool is correct, but the residuals large enough to act on are all
   tiny-n. Needs a larger targeted sample on the handful of flagged cards, or
   retirement as a standing diagnostic.

## 5. Negative results kept honest

`anchorHpBonus 0→1`: a clean floor-lift in isolation (Anchor-Scrap +9.8pt,
Excavate +6.3pt in the ablation) that the **full round-robin rejected** — it
widens the Leader spread 14.1pt → 16.8pt by sinking Mer-King further, the
opposite of the goal. Built, measured, **not shipped**. `crescendoBase 4→5`:
**null** on the keyword aggregate (41.3% → 41.3%) because Crescendo is a
one-card keyword — not shipped (dial kept at 4 for future ablation).
`avengeCap 2→4`: moved Mer King Avenge Swarm +1.8pt (noise) and Shinobi
Avenge Grind +0.2pt (flat) — a global Avenge buff can't fix one Avenge deck
without the other, confirming the §2.3 diagnosis; not shipped. `guardHpBonus
2→1`: right shape, deliberately **not shipped** — now with direct evidence it
re-sinks both weak Mer-King archetypes and no independent fix exists to
offset it. The v4.10 Avenge Swarm manual card buffs (kept from last pass)
remain null (+0.2pt); left in place (harmless, and the sibling Twin Heal
entries in the same map *do* pull their weight) rather than churned out.
