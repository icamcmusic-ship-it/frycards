# FryCards v4.7 Balance-Sim Findings

Source data: the v4.6 baseline (22,560-game `npm run sim:v4 10`) re-run
**four times** across this pass — once per change batch, including two
reverted attempts kept and reported here rather than discarded, plus new
`--isolate` runs (`scripts/simulate-v4.ts`'s new mode: one deck vs. a
FIXED 47-deck opponent roster, not the shifting round-robin) used to
confirm findings independent of the round-robin's relative-metric
confound before spending a numeric lever on them.

This pass actioned every item in v4.6's "Still unresolved" §5 list. It
also visually overhauled the Ultra-Rare and Mythic card templates
(twinkling/embers made more profound per direct request — see CHANGELOG).

---

## 1. Item-by-item: what the v4.6 unresolved list asked for, and what happened

### 1a. Shinobi Avenge Grind (93.4% baseline) — REMAINS UNRESOLVED, now with strong evidence why

Confirmed via `--isolate` that this is NOT a round-robin artifact: **92.1%
aggregate against a fixed 47-deck opponent roster**, weakest single
matchup still 60%. Three independent, verified-safe levers were then
tried in sequence:

1. Shinobi's Ultimate retargeted from `allFriendlyUnits` (a board-wide
   buff that scales multiplicatively with a wide board — backwards
   design for a 19-Unit grind deck) to a single `friendlyUnit` (value
   2→3 to stay meaningful). **Isolate result: 92.1% → 92.0%. No effect.**
2. A stat tax on cards dual-tagged Avenge+Toll (the deck's own labeled
   keyword pair). **Round-robin result: 93.8%, i.e. no effect** — dual
   Avenge+Toll tagging is a ~1.3% co-occurrence in the procedural
   generator (independent hash rolls at ~9% and ~14% respectively), so
   almost no cards in the deck actually qualify for the tax.
3. Avenge cap tightened 3→2 (this pass) and 2 (last pass, from
   uncapped) — negligible movement each time.

**Conclusion:** the deck's power isn't concentrated in any single card,
keyword, or Leader-kit lever that's been tried — it's very likely a
property of the *decklist itself* (19 Units, heavy but not
exclusively-dual-tagged Avenge/Toll density, favorable curve) as
hand-built in `scripts/simulate-v4.ts`'s `ARCHETYPES` array. **Recommend
next pass:** treat this as a sim-roster construction question, not a
card-pool balance question — rebuild the archetype's decklist with a
lower Avenge/Toll keyword density and re-measure, or accept it as an
upper bound on "what a maximally-consistent 30-card build can do" rather
than a signal that any specific card/keyword needs a nerf.

### 1b. Durability stacks — PARTIALLY RESOLVED

Guard+Bulwark and Steel+Bulwark dual-tagged Units now carry a -1/-1 stat
tax per qualifying pair (`mapUnit()`, cardpool.ts) — cards stacking two
"free" defensive keywords (neither Guard nor Bulwark nor Steel nor Toll
nor Avenge get a compensating stat reduction elsewhere, unlike Frenzy/
Swift-on-cheap-bodies which do) were the mechanism.

**Mer King Guard-Bulwark Turtle: 83.9-84.4% (every prior measurement) →
78.1%.** The first archetype-level movement on this specific deck across
three balance passes. Steel-Scrap Control and Ward-Steel Wall did not
move in the same direction this run (86.3%, 85.2% — both *up* from
baseline) — most likely round-robin redistribution as Mer-King weakened
(neither deck uses the Guard+Bulwark or Steel+Bulwark pair on enough of
its own cards to be taxed directly; Steel-Scrap Control is `['Steel',
'Scrap']`, no Bulwark at all). **Recommend next pass:** an `--isolate`
run specifically on Steel-Scrap Control and Ward-Steel Wall before
spending another lever — the round-robin number alone isn't trustworthy
evidence either way for those two.

### 1c. Anchor-ramp archetypes — RESOLVED (design fix, not just numbers)

`effAbilityThreshold()` now applies Anchor's discount to a card's own
Ability Slot too, not just its Cast Slot — closing the exact gap v4.6
flagged ("Anchor's discount does nothing for gate-costed payoffs, no
numeric Cast Slot to discount at all"). Sea Witch Anchor-Scrap Ramp
14.6% → 15.6-17.9% across this pass's runs, Abyss Excavate Ramp 24.6% →
25.7-30.9%. Modest but consistently positive; the ramp decks are still
the roster floor, but no longer regressing.

### 1d. Diver Rally Tempo (25.0% baseline) — NOT RESOLVED

Rally-keyword cards now get their own Ability Slot threshold cheapened
by 1 (min 1) at generation — "reuse a die already resting on another
Ability Slot" is dead weight if the card can't clear its own first
activation either. Measured 24.9-26.4% across this pass's runs —
essentially unchanged. Rally itself remains mid-pack (49.6-49.7%
keyword win rate). **This archetype needs its own dedicated look next
pass** (comboFamily: 'match' + Rally + Swift may simply be a weak
combination in `decks.ts`'s scoring, independent of any single card).

### 1e. Excavate/Foothold/Contested/Crescendo keyword win% — METHODOLOGY, no card change needed

As predicted, these numbers track archetype (deck-membership) rather
than independent keyword signal, confirmed stable in the 37-41% band
across every run this pass regardless of what else changed elsewhere.
No action taken — re-read as "the weak Location-ramp decks exist," not
as four independently underpowered keywords.

---

## 2. A negative result worth recording in detail: the stat-tax scoping

**First attempt** (reverted): tax ANY card with 2+ of
{Guard, Ward, Bulwark, Toll, Avenge, Steel}. Round-robin verification:
Shinobi Avenge Grind 93.4%→85.4% (real movement, the biggest single
result of this whole pass) but **Mer King Twin Heal 48.6%→36.4%** and
**Mer King Avenge Swarm 62.3%→44.5%** — both unrelated to the durability/
grind problem, collateral damage from taxing ordinary commons that
happened to roll two sustain keywords for flavor, not power. Leader
spread **widened** 17.6pt→20.6pt, i.e. net negative overall despite
fixing the two targeted archetypes.

**Final version** (shipped): narrowed to exactly three flagged pairs
(Steel+Bulwark, Avenge+Toll, Guard+Bulwark). Mer King recovered fully
(50-54% Leader win rate across re-checks, Twin Heal/Avenge Swarm both
back in healthy ranges) at the cost of barely touching Shinobi Avenge
Grind (see §1a) and only partially moving the durability decks (see
§1b). **Lesson, consistent with the v4.5.1 postmortem's own warning about
hash-based assignment fragility: broad levers that touch "a keyword" are
almost never actually scoped to the archetype you're trying to fix — they
touch every card with that keyword, most of which were never the
problem.** Prefer levers scoped to the *specific combination* flagged by
name, verified via `--isolate` before widening.

## 3. Leader spread: best measured to date

| Leader | v4.6 final | v4.7 final |
|---|---:|---:|
| Avatar of the Abyss | 54.0% | 55.1% |
| Apex Nanite Shinobi | 53.1% | 53.3% |
| Mer-King | 53.2% | 50.0% |
| Crimson Vector Commander | 52.0% | 50.8% |
| Ethereal Sea Witch | 45.8% | 46.8% |
| Legendary Diver | 36.4% | 38.5% |

**16.6pt spread**, down from 17.6pt (v4.6) and 21.2pt (v4.5.1) — the
tightest measured across three consecutive passes, despite Mer-King
absorbing the real cost of the Guard-Bulwark Turtle fix. Diver continues
a slow, real climb (34.2% → 36.4% → 38.5% across the last two passes)
without a single additional Diver-specific lever touched this pass beyond
the Rally threshold cut in §1d — general roster health seems to be
lifting it as much as anything targeted at it directly.

## 4. Infra: `--isolate` sim mode

New CLI flag on `scripts/simulate-v4.ts`: `--isolate="<archetype label>"`
runs that one deck against every other roster deck as a FIXED opponent
set (default 40 games/opponent) instead of the round-robin, reporting a
per-opponent breakdown sorted weakest-first. Every findings doc since
v4.5 has asked for exactly this before spending another lever on a
stuck archetype — it's why §1a could be stated with confidence ("NOT a
round-robin artifact") instead of another "needs its own isolate-and-
measure pass" deferral. Use it first on any single-archetype question
before touching card-pool numbers.
