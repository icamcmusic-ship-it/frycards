# Balance Sim Findings — v4.8

Pass structure: harness upgrade → 22,560-game baseline (`npm run sim:v4 --
10`, 48 decks, stagedPassive Twin mode selected by the A/B/C pre-pass) → a
13-arm ablation battery (`sim:ablation 40`, now 11 subjects including three
new deck-level decompositions of Shinobi Avenge Grind) → actions → full
22,560-game verification re-sim. No invariant violations in any run.

## 1. Harness upgrades (what this pass could measure that prior ones couldn't)

- **CPU-lapse detectors** (`ai.ts recordPlacementLapses/recordCombatLapses`),
  recorded into the decision table: `lapseMissedLethal` (unspent face-lethal
  with no Guard up), `lapseWastedCastableDie` (an unplaced die that paid for
  a hold-exempt card in hand), `lapseIdleLeaderAbility` (Leader Ability idle
  while a qualifying die was pitched). Measured at the moment the action was
  still legal — a first version measured after combat and mis-flagged every
  Mend hold the instant retaliation damage appeared.
- **Cost-vs-value table**: every card's win-in-deck% and cast rate scored
  against the measured difficulty of its actual printed cost format.
- **Momentum on/off A/B** (same roster/seeds) and an `echoNoFodder` arm —
  the two dedicated measurements the v4.7 findings §4.3/§4.5 called for.
- **Deck-level ablation subjects**: Avenge Grind re-run under a different
  Leader, without its mend package, and without its Guard-wall core.
- New mechanic counters: fatigueDamage, overrunTriggers,
  pierceOverflowDamage, anchorCapBonuses.

## 2. Headline findings

### 2.1 Momentum measured useless — REMOVED
The on/off A/B (6,768 decisive games/arm): leader spread 12.3pt ON vs
**11.3pt OFF**, average game 12.5 rounds ON vs 11.2 OFF, and in the ablation
the weakest roster deck (Diver Rally Tempo) gained **+9.4pt** with it off.
Momentum's own trigger sat at 20.5% win (the desperation confound), and four
rounds of stacked riders (6th die, +1 ATK, Ability discount, bonus card)
never moved it. The rule added rules text, UI states and code paths while
measurably helping nobody — removed outright in v4.8. Verification: Rally
Tempo 25.1 → 39.6, average game length 12.4 → shorter, leader spread (see
2.3).

### 2.2 Avenge Grind's engine finally named — it's the LIST
Deck-level ablation (480 games/cell vs the fixed opponent roster):

| variant | win% |
|---|---|
| Shinobi Avenge Grind (baseline) | 88.1 |
| same list, Diver as Leader | **93.8** |
| same list, no mend package | 90.2 |
| same list, Guard-wall core diluted (14 units + Swift) | **69.0** |

The Shinobi kit is worth *negative* points to the deck (Diver pilots it
better); mend is irrelevant; diluting the unit-heavy Guard/Toll/Avenge wall
core is worth ~20pt. The deck is its cheap durable bodies — which is also
exactly what the new cost-vs-value table said pool-wide: the entire
"most under-priced" top ten was cheap exact/easy-cost defensive Units
(Flickering Sea Pens / Cavernous Watcher 75.1%, Vector Blade Captain 67.5%).
**Action**: exact-cost stat basis trimmed 2 → 1.5 (one point of budget off
every non-Twin exact-cost body; hash-stable). Verification: Avenge Grind
94.1 → 91.0, Guard-Bulwark Turtle 83.6 → 80.2. Direction right, magnitude
still insufficient — see §4.

### 2.3 Leader spread: 12.0pt → **8.2pt, best ever measured**
Actions: Diver Resolve 1 → 2 (43.4 → 50.1), Abyss Ultimate mass-sap 4 → 3
(56.2 → 53.9). Final table: Abyss 53.9 / Shinobi 50.6 / Diver 50.1 /
Crimson 49.0 / Mer-King 48.4 / Sea Witch 45.7.

### 2.4 Echo fodder economics (the §4.3 look)
Decision table: high-rarity Echo +5.8pt (best Echo line), mid +2.3, low
+0.6 (the v4.7 AI gate fixed low's old −9.4). The echoNoFodder arm lifted
the Echo-themed floor decks (Shinobi Tempo-Anchor 11.5 → 19.0) at modest
cost elsewhere. **Action**: fodder waived for Rare and higher (was mid
only); low rarity still pays. Verification: Echo keyword 47.7 → 48.3 —
small, and Tempo-Anchor did not recover in the full roster (18.4). Echo
decks' problem is deeper than the fodder tax; carried to §4.

### 2.5 CPU reasoning lapses
- `lapseMissedLethal`: **0** across 22,560 games — the AI never leaves
  lethal on the table. Good.
- `lapseWastedCastableDie`: 0.099/game baseline → **0** after the detector
  was moved to the correct (pre-combat) measurement point; the residue was
  entirely the detector's own timing confound.
- `lapseIdleLeaderAbility`: 0.735 → 0.461/game after the timing fix. The
  remainder is dominated by legal refusals (Shinobi's no-repeat-target rule
  with ≤1 Unit in play) plus dice spent down below the Ability threshold by
  higher-priority casts — a real but small inefficiency (−9.7pt presence
  correlation carries deck-quality confounds). Documented for the next
  pass rather than chased with a heuristic that could easily overcorrect.

### 2.6 Fatigue exposure (first pass with the counter)
188k total fatigue damage across the baseline; being fatigued at all
correlates −10.3pt — the intended gentle attrition cost, nothing like the
old 24%-of-games instant-loss cliff. No action needed.

## 3. Other actions this pass

- **Anchor print HP +2 → +3** (round-4 ablation: one more point lifted
  every ramp-floor deck at once — Anchor-Scrap 13.8 → 20.4 → 29.2 at
  +1/+2 over print — while the top decks stayed flat). Verification:
  Excavate Ramp 39.6 → 42.6, Anchor-Scrap 18.3 → 22.1. Modest.
- **Crescendo base 2 → 3** (still the weakest keyword: 37.1 → 39.2).
- **Chrono-Phalanx redesigned** (four passes at the pool bottom, flagged
  "redesign, not stat bump" in v4.7): +2/+2 over budget + Overrun.
  26.4% → 34.2%. Better; still watch-listed.
- **Per-rarity deck copy caps enforced** (UI + deck-code import): Mythic 1,
  SR/FA/UR 2. Rules text always promised this; nothing enforced it. The
  sim's archetype builder intentionally keeps the flat 3 for run-over-run
  comparability.

## 4. Still open — priority list for the next pass

1. **The wall-list meta.** Avenge Grind 91.0 / Steel-Scrap 82.0 /
   Guard-Bulwark 80.2 all remain. §2.2 proves the lever must target the
   cheap-durable-body *list shape*, not keywords or Leader kits. Candidates:
   a second exact-cost budget step, pricing Guard's +3 HP print bonus into
   the budget instead of on top of it, or a per-deck "durable body" density
   cost. Sweeping stat cuts are the known failure mode (v4.6) — ablate
   first.
2. **Echo-theme decks** (Tempo-Anchor 18.4, Echo-Straight 22.6, Sap-Echo
   36.6): the fodder waiver wasn't the answer. Next candidate: Echo cards'
   own bodies/effects are weak for cost, or the AI's recast sequencing —
   instrument casts-from-discard win-delta per card.
3. **lapseIdleLeaderAbility 0.461/game** — split the counter by refusal
   reason (no-repeat-target vs dice-spent-down) before acting.
4. **Location keywords** (Foothold 41.4, Contested 40.9, Excavate 43.1)
   still trail every Unit keyword even with Locations themselves at
   parity. Consider folding their value into stronger on-cast effects.
5. **Crescendo 39.2** after two buffs — the x-per-six design may be
   unsalvageable at any x; consider redesign ("+X if you placed any 6"
   deterministic rider).

## 5. Negative results kept honest

Momentum riders (all four, v4.4-v4.7) — superseded by removal; tollCap and
mend dials again dead flat in round-4 arms; echoNoFodder helped Steel-Scrap
(+4.6) as much as the decks it was aimed at, which is why the adopted change
excludes nothing above Rare rather than waiving everywhere.
