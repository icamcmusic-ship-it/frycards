# Simulation Report — v4.2 Rules Engine (2026-07-11)

Scripts: `scripts/card-coverage.ts`, `scripts/luck-analysis.ts` (new), `scripts/simulate-v4.ts` (existing).
Run with `npx tsx scripts/<name>.ts`.

## 1. Card coverage (193 cards)

`card-coverage.ts` directly exercises every card in `POOL_V4` through the engine's
public API (cast via numeric threshold or Combo gate, on-cast effects, Twin
staging + completion, Echo recast, Unit/Location/Leader Ability Slots, Combo
passives, Overflow riders, Tribute, Ultimates), then plays organic round-robin
and random-deck games to check real-game usage.

**Result: 0 broken cards.** All 193 cards cast, and all 318 attached mechanic
checks resolved without throwing or silently no-oping. No engine invariant
violations across ~4,200 sim games (card drift, dead units on board, hand
overflow, negative damage all clean).

Findings that are *not* card bugs but worth acting on:

- **Deck-builder diversity gap.** The 12 fixed archetype decks cover only 60 of
  193 cards; even adding 120 games on `randomArchetype()` decks only raises
  organic coverage to 78/187 non-Leader cards. `buildDeck()`'s scoring is
  deterministic per archetype, so random builds still converge on the same
  top-scored staples. 109 functioning cards essentially never see simulated
  play — balance conclusions about them are untested. (Fix idea: add rng-based
  tie-noise to `score()` in `decks.ts`, or a "draft" builder.)
- Every card that *is* in a deck was cast at least once in 792 organic games,
  and every combo-passive Unit's combo triggered organically at least once.

## 2. Luck vs skill (`luck-analysis.ts`, 1200 games/condition)

| Measurement | Result (95% CI) | Reading |
|---|---|---|
| (a) First-player win rate, mirror match (identical deck + AI) | **42.3% ±2.8** | Going **second** is a real ~8pt edge |
| (b) Strong AI vs naive-but-legal AI, same deck | **88.2% ±1.8** (85.6% before AI update) | Strong skill expression; decisions dominate |
| (c) Winner had higher avg dealt roll (mirror) | **52.1% ±2.8** | Raw dice totals barely predict the winner |
| (c) Seat-A win rate when A's avg die ≥ +0.2 higher | **60.1%** (n=318) vs 48.0% when ≤ −0.2 | Only *large sustained* dice edges matter (~12pt swing) |

Interpretation:

- **The game is skill-dominant.** A competent player beats a legal-but-naive
  one ~88/12. Dice-total luck contributes a measurable but modest ~±6pt swing,
  and only at the extremes of sustained hot/cold rolling — the reroll, Scrap,
  Pitch and threshold-choice layers successfully launder most single-roll
  variance.
- **The biggest "luck" problem is turn order, and it's inverted.** The
  second player wins ~57-58% of mirrors (first player skips their first draw
  AND cannot attack on turn 1, so the second player gets both the extra card
  and the first strike). The main `simulate-v4.ts` suite agrees (first-player
  win rate 46.4% across mixed pairings). This is the clearest balance lever
  in the data.
- Deck-out is a live pressure at 30 cards / ~9.6-round games (520 deckouts in
  3,312 games ≈ 16%), which adds draw-order variance late.

## 3. Suggested new keywords (skill expression)

Styled after the existing keyword vocabulary (Guard, Ward, Echo, Snap,
Bulwark, Toll, Avenge, Crescendo, Aftershock, Tribute, Excavate, Contested,
Resolve, Ultimate, Twin, Overflow):

1. **Pivot** (Unit) — *"Once per turn, you may return the die on this card's
   Ability Slot to your pool as a die of value 1."* Converts a committed die
   back into flexibility at a steep exchange rate: a real decision every turn,
   zero variance added.
2. **Wager X** (Charm/Event) — *"When you cast this, you may reroll the die
   you placed on it. If the new value still meets the threshold, gain the
   Overflow bonus twice; if not, this card does nothing."* A voluntary
   push-your-luck layer: luck only enters when a player chooses it, which
   reads as skill (bet sizing), not variance.
3. **Forecast** (Charm) — *"While you hold this card, you may look at the
   result of your Reroll Phase before choosing which dice to reroll... instead,
   set one unplaced die to the value of this card's threshold, then discard
   this."* Direct dice mitigation from hand; rewards hand management over
   hot rolls. (Rules-text style of Snap: a phase-window exception.)
4. **Formation** (Unit) — *"While you control another Unit with Formation,
   dice placed on either one count as 1 higher."* Board-construction skill:
   sequencing and protecting a pair turns bad dice into good ones.
5. **Gambit** (Leader) — *"Once per game, before your Reroll Phase, name a
   die value. This turn, dice of that value count as 6 on Cast Slots."*
   A once-per-game read of your own hand + roll distribution; high skill
   ceiling, bounded impact.
6. **Salvage X** (Unit/Charm) — *"When this card is discarded from hand
   (hand-size or Echo fodder), Sap X the enemy Leader / draw a card."* Turns
   the currently pure-loss discard-to-6 and Echo-fodder choices into a
   deckbuilding and sequencing decision.

## 4. Rule / mechanic improvements (grounded in the sim data)

1. **Fix the turn-order edge (measured 42.3% first-player mirror win rate).**
   Give the first player a compensating token: e.g. *first player's first turn:
   one free reroll of any subset in addition to the normal reroll*, or let the
   first player draw on turn 1 but keep the no-attack rule. Re-run mirror sims
   until 50% ±2.
2. **Mulligan is engine-supported but not rule-complete.** `mulliganRedraw()`
   exists and the AI uses a keep heuristic (cheap plays ≥2, ≥1 Unit), and
   mulliganed hands still win less. Formalize a London-style mulligan (redraw
   5, bottom 1) in the rulebook — it's the cheapest draw-order-variance
   reduction available and already half-implemented.
3. **Cold-roll floor.** The 60.1%-vs-48.0% extreme-dice-bucket spread comes
   from *sustained* bad rolls. Add a catch-up valve: *"If you place no dice on
   Cast Slots during your Placement Phase, draw a card at End Phase."* Bounded,
   only triggers on genuinely dead turns.
4. **Deck-out pressure (16% of games).** Either raise deck size to 34-36, or
   make Echo-banished cards shuffle back when the deck empties once. Deck-out
   losses in the sims mostly punish the *reactive* player, compounding the
   aggro tilt visible in `earlyFaceAttack`'s positive win-delta.
5. **Second reroll as a resource, not a rule.** Rather than a global second
   reroll (which would raise combo hit-rates across the board — see
   `pattern-hitrate.ts`), print more Scrap-density at Common and add a
   once-per-game Leader reroll ("Focus"). Keeps average variance identical
   but gives skilled players more mitigation *choices*.
6. **Widen sim deck diversity before the next balance pass.** (From §1:
   add noise to `decks.ts#score()` so all 193 cards actually get playtested;
   109 currently have zero organic reps.)

## 5. CPU (ai.ts) improvements made in this pass

Changes in `src/game/v3/ai.ts` (+ a Ward-awareness fix in `engine.ts#autoTarget`):

- **Threshold-aware reroll**: dice are now kept when they're actually spendable
  on a held card (greedy smallest-sufficient-die assignment against the hand),
  plus 5-6s for Leader abilities/Ultimates; previously any non-pair die ≤3 was
  rerolled even if it exactly cast a threshold-3 card.
- **Pair-search combat**: instead of "biggest attacker picks first", every
  attacker→target pair is scored with real damage math — Ward absorption,
  Bulwark reduction on both sides, Frenzy's doubled second-swing retaliation,
  and Toll-reduced face/lethal math. Includes deliberate cheap "Ward pokes",
  refuses to feed a Guard wall at a loss, and computes lethal through Toll
  with remaining Frenzy swings.
- **Ward-aware targeting** (`autoTarget`): removal no longer counts a
  fresh-Ward unit as "killable" and deprioritizes warded bodies.

Measured effect (1200 games/condition, 95% CI ±~2.8):

| Metric | Before | After |
|---|---|---|
| Strong AI vs weak AI | 85.6% | **88.2%** |
| New AI vs frozen v4.2 baseline (head-to-head, `--compare`) | — | **56.7% ±2.8** |

`npm run test` (14 tests) and `npm run typecheck` pass; `simulate-v4.ts`
reports no invariant violations with the new AI.
