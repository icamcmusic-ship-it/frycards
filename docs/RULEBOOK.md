# FryCards — Definitive Rulebook v4.8

Supersedes v4.7, v4.6, v4.4, v4.3, v4.2, v4.1, v3.0 and v2.0. The executable version of this document
is the dice-placement engine in `src/game/v3/engine.ts`; the playable card pool
is remapped from the real backend data in `src/game/v3/cardpool.ts`, decks are
built by `src/game/v3/decks.ts`, and `npm run sim:v4` runs the headless
playtest harness against it (`npm run sim:v3` runs the older fixed-decklist
harness; `npm run tsx scripts/pattern-hitrate.ts` measures Combo pattern hit
rate under directed rerolling).

**v4.8 balance-sim pass (22,560-game baseline + 22,560-game verification +
a 13-arm ablation battery; full writeup `docs/BALANCE_SIM_FINDINGS_v4.8.md`):**

- **RULE REMOVED — Momentum (§3.2).** The dedicated on/off A/B measured no
  systemic benefit: Leader spread slightly better without it, games a full
  round shorter, weakest deck +9pt. Every turn is exactly five dice again.
- **Leader spread 12.0pt → 8.2pt (new best).** Diver 43.4 → 50.1 (Resolve
  1 → 2), Abyss trimmed off the top (Ultimate mass-sap 4 → 3).
- **Deck-level ablation named the real Avenge Grind engine:** the same
  unit-heavy Guard/Toll/Avenge list wins 93.8% under a *different* Leader —
  the list is the deck, the Shinobi kit and the mend package are not. The
  cheap exact-cost defensive bodies that list leans on were trimmed again
  (exact-cost stat basis 2 → 1.5).
- **Echo fodder economics (§10):** the extra-discard cost is now waived for
  Rare and higher (was Rare/Super-Rare only) — high-rarity recasts were the
  clearest positive Echo line (+5.8pt) yet still taxed a real card.
- **Anchor** Units print +3 HP (was +2) — the round-4 ablation showed one
  more point lifted every ramp-floor deck at once while the top decks
  stayed flat. **Crescendo** base 2 → 3 (still the weakest keyword).
- **Chrono-Phalanx redesigned** (four passes at the pool's bottom): +2/+2
  over budget plus Overrun — a hard-gate trophy body that now actually
  punches through the durability boards when it lands.
- **Per-rarity deck copy caps are now actually enforced** in the deck
  builder and deck-code import (Mythic 1, Super-Rare/Full-Art/Ultra-Rare 2)
  — the UI had always advertised them and only ever checked the flat 3.
- **New harness instrumentation:** CPU-lapse detectors (missed lethal,
  wasted castable dice, idle Leader Ability), a cost-vs-value table pricing
  every card's win rate against its real cast-format difficulty, fatigue/
  Overrun/Pierce-overflow/Anchor-bonus counters, and deck-level ablation
  subjects.

**v4.7 balance-sim pass (45,120-game baseline + a new single-dial ablation
harness + full verification re-sim; writeup `docs/BALANCE_SIM_FINDINGS_v4.7.md`):**

- **RULE CHANGE — Fatigue replaces the instant deck-out loss (§9).** The
  new ablation harness (`scripts/simulate-ablation.ts`) proved no labeled
  keyword powers the durability decks that topped three straight sims —
  a `tollCap 3→1` arm measured *identically to baseline*, and deleting
  Avenge moved its 92% flagship under 3pt. The real engine was §9: 24% of
  all games ended in the instant deck-out loss, which punished card-draw
  and crowned unit-hoarding attrition. An empty mandatory draw now deals
  escalating Fatigue damage (1, 2, 3, ...) instead. Verified: deck-outs
  10,999 → 0; Leader spread 18.6pt → **12.0pt, best measured to date**.
- **Twin (§7/§10):** Twin bodies were budgeted off the legacy threshold but
  printed at threshold−1 with full stats plus a rider and staged passive —
  and a same-turn matching pair is nearly AnyPair-easy (99.9%). They now
  budget off the real printed threshold. Twin drops off the #1 keyword spot
  (58.1 → 54.7).
- **Steel X (§10):** printed values trimmed 2/2/3 by tier → 1/1/2 — the one
  keyword dial the ablation showed actually moves the Steel-labeled decks
  (Ward-Steel Wall 81.3% → 75.6% with Fatigue).
- **Anchor (§10):** Anchor Units print +2 HP — their cheap bodies were 4/2
  glass that died before any ramp existed. Biggest floor recovery ever
  measured (Abyss Excavate Ramp 24.7% → 40.6%).
- **CPU AI:** face-lethal math now subtracts the defender's Toll; board-wide
  buff Ultimates are held until 2+ Units are in play; low-rarity Echo
  recasts only happen with 5+ cards in hand (that decision's win delta went
  −9.4pt → −0.4pt).
- **Negative results kept honest (all reverted):** Toll cap changes, Mend
  halving, Anchor's cap bonus drawing a card, and Guard +3 → +2 HP all
  measured as no-ops.

**v4.6 balance-sim pass (fresh 22,560-game baseline + three verification
re-runs; full writeup `docs/BALANCE_SIM_FINDINGS_v4.6.md`):**

- **BUG FIX (long-standing): the v4.4 Leader-Ability flags were never wired
  up.** `mapLeader()` never assigned `abilityGrantsTempo` (Legendary Diver's
  documented tempo-grant buff) or `abilityNoRepeatTarget` (Apex Nanite
  Shinobi's documented targeting nerf) to any Leader — both features existed
  only in the engine and this rulebook, never in the live pool. This is the
  root cause of two v4.5 mysteries: Diver "buffed twice, still net down"
  (the buff never activated) and Shinobi's nerf that "barely moved the
  needle" (it was never on). Both flags now actually ship; with them live,
  Diver finally moved above its true baseline (34.2% → 36.4%, Aggro-Swift
  59.5% → 63.3%).
- **Cost vs. ability, exact-cost formats (§7):** an exact-face cost is
  near-flat in difficulty regardless of the printed value (~90% hit with two
  directed rerolls), but Unit stat budgets were still priced off the
  pre-format threshold — the sim's "most likely OP" list was dominated by
  exact-cost Units (a 9/3 for "exactly 6"). Exact-cost Units now budget off
  the measured difficulty. (A first attempt re-priced *every* cost format
  off measured difficulty; verification showed it crashed the match-combo
  archetypes without helping anything else, and it was narrowed to
  exact-only. Surgical beats sweeping.)
- **Straight-gate compensation (§6/§7):** straight-family gates are
  measurably harder than the match-family gates they share a tier with
  (Small Straight 44% vs. Three of a Kind 74%; Large Straight 18% vs. Full
  House 35%), so straight-gated cards now print a compensating bump (+1
  effect value / +1/+1 stats for Small Straight; +2 for Large Straight).
- **Avenge** cap tightened 3 → 2 (§10) — the cap-at-3 measurably didn't bite
  (Mer King Avenge Swarm 72.4% → 62.3% after this change).
- **Overrun** now punches **half the attacker's ATK** (rounded down, min 1)
  through a fully-prevented hit, up from a flat 1 (§10) — mirrors Pierce's
  established floor(ATK/2) magnitude.
- **Steel + Bulwark combined prevention capped at 4 per hit** (§8/§10) —
  the same "ramp, not a collapse" ceiling Toll/Anchor/Avenge already use,
  aimed at the dual-keyword bodies anchoring the durability-stack decks.
- **Momentum** additionally **draws a card** on trigger (§3.2) — three
  passes of dice/stat/threshold levers never touched the *options* axis a
  behind player actually lacks.
- **Locations**: on-cast buff base value 1 → 2 (still +1 more at Rare+).
  Isolated Location contribution measured **-0.2%** after this change —
  effectively neutral for the first time since Locations were introduced
  (they'd measured net-negative through four straight buff attempts).
- **Ultimate(N) exonerated (instrumented):** usage is now split by board
  state at activation. Used while *ahead*: **+30pt** win correlation. Used
  while *behind*: -39pt. The long-standing "Ultimates correlate with losing"
  finding was the deck-membership/desperation confound all along — losing
  players reach for their Ultimate *because* they're losing. No further
  Ultimate buffs are warranted on that metric alone.
- **CPU AI lapse fixed:** `chooseReroll()` was actively rerolling away dice
  that paid exact-cost cards in hand (any small singleton ≤ 3 got rerolled),
  which is why exact-cost removal sat at 0.29-0.44 casts/game. The AI now
  protects one die per exact-cost value it holds.
- **Still unresolved, documented rather than chased blind:** Shinobi Avenge
  Grind (93.4%) shrugged off the Avenge cap, two Leader-kit nerfs *and* the
  newly-live targeting restriction; the durability-stack archetypes
  (Ward-Steel/Guard-Bulwark/Steel-Scrap, 82-84%) resisted both Overrun
  levers and the new prevention cap; Anchor-ramp archetypes remain the
  weakest decks in the roster; Momentum's raw decision delta is unchanged
  (~-66pt — though the instrumented Ultimate result above suggests this
  metric is structurally incapable of crediting a comeback mechanic, since
  it conditions on already losing).

**v4.5 balance-sim pass (22,560-game v4.4.2 baseline, `npm run sim:v4 10`,
findings acted on and re-verified):** the initial pass measured a still-wide
18pt Leader spread (Mer-King 57.8%/Shinobi 57.3% vs. Diver 39.6%/Abyss
42.7%), a severe archetype spread (Shinobi Avenge Grind 90.9% down to Abyss
Excavate Ramp 12.8%), a hard keyword-tier split (Avenge/Twin/Pierce/Guard
all >53% vs. Excavate/Foothold/Crescendo/Contested all <33%), a failing
Momentum (17.3% win rate when triggered), Ultimate(N) usage still
correlating with losing (-10.8pt), and Locations still net-negative in
isolation (-3.7%). A follow-up pass acted on every one of those findings —
**Anchor**'s ramp payoff (+1/+1 → +2/+2), **Avenge** capped at 3 stacks/card
(§10), **Momentum** now also discounts the Leader's own Ability Slot by 1,
**Contested** now doubles a Location's on-cast effect too (not just its
ambient passive), **Excavate**/**Crescendo** values raised, Location on-cast
value now scales with rarity, and Mer-King/Shinobi trimmed while Diver/Abyss
were buffed (see cardpool.ts's `LEADER_ABILITIES`/`LEADER_ULTIMATE`) — plus
6 CPU AI heuristic fixes in `src/game/v3/ai.ts` (gate-costed cards no longer
read as worthless in combat-trade/cast-priority math, Location choice now
weighs Foothold/Excavate/Tribute/Contested, the mulligan heuristic treats
easy-gate hands as keepable, Echo recasts go in value order, and buff
auto-targeting spreads to the weakest Unit instead of always reinforcing the
biggest). **Re-verified**: Excavate/Contested/Crescendo/Foothold keyword win
rates all rose 6-7.5pt, Locations' isolated contribution more than halved
(-3.7% → -1.2%), Mer-King's win rate came down as intended (57.8% → 52.9%).
**Still unresolved, flagged rather than chased further blind**: Avenge's
cap barely dented its dominant archetype (Shinobi Avenge Grind still 92.3%
— needs a tighter cap or a Leader-level cut next); Momentum's decision
correlation barely moved (still ~-66pt); Ultimate(N) usage correlation got
*worse* (-15.2pt, more evidence the deck-membership confound flagged
alongside it is real); and the Straight-family Combo-gated archetypes
(Diver Straight-Combo, Sea Witch Bind-Straight Combo) dropped sharply for a
reason not yet confirmed (a tested hypothesis — the AI's cast-priority
change — was reverted and re-measured with no effect, ruling it out; the
likely explanation is relative redistribution from the other buffs landing
elsewhere in the same round-robin win-rate metric, but this needs its own
isolate-and-measure pass before further tuning). Full writeup:
`docs/BALANCE_SIM_FINDINGS_v4.5.md`.

**v4.5.1 (root-cause follow-up):** the flagged Straight-family regression
was traced with a dedicated isolate-and-measure sim (a `git worktree`
checkout of the pre-AI/keyword/Leader-change commit, re-run independently)
to the FourKind gate-pool fix above, not anything downstream of it —
shrinking `HARD_GATES` from 3 entries to 2 silently reassigned which cards
are FullHouse- vs. LargeStraight-gated **pool-wide**, via `pick()`'s
`hash(id) % arr.length` indexing, not just the ~5 cards that would've been
FourKind-gated. Fixed with `pickHardGate()`: pick against the original,
unchanged 3-entry array, then remap only an actual FourKind result via a
second, independent hash — every card that previously resolved to
FullHouse/LargeStraight is now byte-for-byte unaffected. Two more CPU AI
heuristic lapses found in the same re-audit: `chooseReroll()`'s pattern
strategy was `wantStraight && !wantMatch` (a single stray match-gated card
in a straight-heavy hand silently overrode the deck's actual plan — now
counts each family and follows the majority), and the Unit-ability loop
always chose attacking over an ability once a Unit's ATK hit 3 regardless
of what the ability did (now unconditional removal against a live target
overrides that default). Re-verified: Diver Straight-Combo 14.6%→24.0%,
Rally Tempo 17.9%→26.3% — real recovery, not full; see
`docs/BALANCE_SIM_FINDINGS_v4.5.md` §0.1 for the residual-gap analysis and
a new finding that the overall Leader spread widened this round (18.2pt →
21.2pt), with Diver and Ethereal Sea Witch now the clearest outliers.

**v4.4.1/v4.4.2 errata (documentation catch-up — these shipped in the engine
across two follow-up balance passes after v4.4 but were never written back to
this rulebook):** a durability-stack meta (Ward/Steel/Bulwark decks all fully
zeroing hits) got a direct counter, new keyword **Overrun** (a Unit whose
combat damage would be fully prevented/absorbed by Ward, Steel, or Bulwark
still punches through **1 damage**, never off a 0-ATK attacker and never on
retaliation); a new Location keyword **Foothold** discounts the first Unit
cast each turn by 1 (stacks with Anchor) on a slice of Locations; every
Location now resolves **+1/+1 to a friendly Unit** the instant it enters play
(`onCast`, previously ignored for this card type entirely — an earlier
attempt at Mend 1 to the Leader on cast made Locations' isolated contribution
*worse*, -2.1→-5.3 win%, confirming a Location competes against a Unit's
immediate board impact, not Leader HP); Frenzy's second-swing Leader-target
restriction (below) now only applies while its controller is even or ahead
on board Units, and Frenzy Units get an unconditional **+2 ATK** (was a 50%
chance of +1); Apex Nanite Shinobi's Leader Ability can no longer buff the
same permanent on two consecutive activations (`abilityNoRepeatTarget`) and
had its own value/threshold trimmed further after the targeting restriction
alone barely moved its archetypes' win rates; Legendary Diver's Ability
(`abilityGrantsTempo`) now also grants a permanent +1/+1 alongside its
sickness-skip, at a lowered threshold. See §8 and §10 for the keyword text,
and the class comments on `abilityNoRepeatTarget`/`abilityGrantsTempo` in
`src/game/v3/cards.ts` for the two Leader-specific mechanics. Changes are
marked *(v4.4.1)*/*(v4.4.2)* inline.

**v4.4 errata (applied from a 33,120-game v4.3 balance-sim pass):** Pierce,
Frenzy and Guard were the sim's clearest overperformers (every deck built
around Pierce or Frenzy cleared 50%+ win rate); Anchor, Ward and mid-rarity
Echo recasts were the clearest underperformers. This pass rebalances rather
than power-creeps: **Pierce** overflow is now capped at **half the
attacker's effective ATK** (rounded down, minimum 1) — a flat "ATK minus 1"
cap turns out to be a no-op, since the naive leftover against any 1-HP
blocker is already exactly ATK minus 1; **Frenzy**'s second swing can no longer target the
enemy Leader directly unless it's the only target left; the **Anchor** ramp
cap rises 2→3 and a card gains a one-time permanent +1/+1 the first time its
own discount hits that cap; **Ward** now spikes 1 damage back at the attacker
in combat when it prevents a hit; **Echo**'s extra-discard cost is waived
entirely for Rare/Super-Rare ("mid" tier) cards, where it was measurably
correlated with losing rather than low/high tier's positive correlation;
Location passives double from +1 to +2; a new keyword, **Steel X** (per-turn
damage absorption from any source), gives slower decks a defensive answer
distinct from Bulwark/Toll; and a new systemic rule, **Momentum**, grants a
losing player a bonus 6th die. See §7, §8 and §10 for details, and §3.2 for
Momentum. Changes are marked *(v4.4)* inline.

**v4.3 errata:** the Reroll Phase now allows **two rerolls** (was one); every
Unit/Charm/Event prints one of five Cast Slot cost formats (at-least, exact,
sum, or a dice-pattern gate — see §7); the **starting hand is 7** (was 5) and
the End Phase **hand cap is 8** (was 6), so a kept opening hand never forces a
turn-1 discard; and a comeback pass made high-tier Events meaningfully more
likely to be board wipes or heavy AoE sap, strengthened every Leader Ultimate
(wipe / mass-sap options on the reactive leaders), and widened Resolve
assignment across the Leader roster. Changes are marked *(v4.3)* inline.

**v4.2 errata (applied from an ~8,832-game v4.1 decision-correlation pass):**
Combo-gated cards are capped at **one cast per turn**, closing the general
chaining failure mode (not just one card); the specific Large-Straight
face-burn Event is retargeted off pure face damage and reduced in power;
**Twin's Staging Zone now grants a small passive while parked** (the winning
fix of an isolated A/B/C test — see §7); **Bind now also stops retaliation**
damage the bound Unit would have dealt; twelve new keywords ship across every
card type (**Resolve**, **Ultimate(N)** for Leaders; **Bulwark**, **Toll**,
**Avenge** for Units; **Crescendo**, **Aftershock** for Events; **Snap** for
Charms; **Tribute**, **Excavate**, **Contested** for Locations). See the
Changelog and §10 for details. Changes are marked *(v4.2)* inline.

**v4.1 errata (applied from a ~10,000-game v4.0 playtest):** Locations no
longer use a die — one free Location cast per turn as a bonus action; the
Anchor −2 cap is codified in rules text; Yahtzee/Four-of-a-Kind combo gates
are demoted to flavor-only rarity (practical gate ceiling: Full House / Large
Straight); Leader HP 28→64 to lengthen games ~4 rounds toward the 8–10 round
target; card elements removed entirely (the game never referenced them).
Changes are marked *(v4.1)* inline.

**v4.0 errata (applied from a 1,280-game v3.0 playtest):** Leader HP 20→28;
deck size 40→30; Twin capped at one die per Placement Phase; Ward now refreshes
for both players every End Phase; Bind also stops retaliation; Frenzy only
doubles retaliation on its second swing; new **Pitch** die-waste sink; and the
Echo fodder-discard ruling is codified. Changes are marked *(v4.0)* inline.

This pass closed every remaining gap: two genuinely broken placement rules (Staging Zone and Discard were never actually listed as legal die targets, making Twin and Echo unplayable as written), several damage-math edge cases, and a handful of open design questions (Ward vs. self-retaliation, Pierce vs. Guard, Leader combat stats) that needed an explicit answer rather than an implicit one.

## Changelog from v2.0 (grouped)

- **Placement Phase legal targets**: was missing two of its four actual destinations. Now explicitly lists all four: hand (Cast Slot), in-play (Ability Slot), Staging Zone (Twin's second slot), Discard (Echo recast).
- **Removed the manual "Clear" action** — it was redundant with simply not placing a die, and created a false ambiguity with Scrap. Unplaced dice now have one clear rule: they clear automatically at phase end, and remain Scrap-eligible the whole time before that.
- **Exhaustion model rebuilt**: now tracked per Ability Slot (so multi-slot cards work as intended) plus a separate "has attacked" flag, with attacking and any Ability Slot use on the same Unit now explicitly mutually exclusive per turn.
- **Rally reworded**: it never cost an extra die in intent, only in unclear phrasing — now stated plainly as a free reactivation of an already-spent die, once per turn.
- **Ward** now explicitly only protects against being attacked/targeted — it no longer strips itself on a Unit's own outgoing attack.
- **Removal** redefined objectively — dropped the unverifiable "against the controller's wishes" language.
- **Guard** combat is now explicitly sequential (declare-and-resolve one attack at a time), fixing a bottleneck where a single Guard Unit could freeze an entire attack step.
- **Pierce**: clarified it doesn't bypass Guard's targeting (the Guard hit itself is what was legal; overflow is a consequence, not a new target) and that it uses leftover damage math, calculated simultaneously even if the attacker also dies.
- **Twin**: matching now explicitly means identical face value, not independently-meeting-threshold; dice clear immediately on full completion; every Twin card must print its own bonus text.
- **Locations**: capped at one cast per turn (closes an alternating two-name cycling loophole the same-name ban alone didn't stop).
- **Leader**: has no ATK and cannot deal or take retaliation damage; its HP max is 20 by the same rule Units use; it can never be bounced or banished by any effect, only damaged/healed.
- **Anchor / Overflow interaction**: Overflow now explicitly checks the effective (post-Anchor) threshold, not the printed one.
- **Dice supply terminology**: renamed from "shared supply" to "your supply" throughout — it was never communal, and the old wording implied otherwise.
- **Several timing clarifications**: Combo tier is conceptual (doesn't depend on dice staying physically on the table), Combo bonuses always resolve at the Combo Check step even for cards cast earlier that same Placement Phase, Echo recasting can't happen the same turn a card was discarded for hand size (Placement Phase has already passed by then), simultaneous deck-outs are now a draw, Scrap and all die-placement actions are explicitly active-player-only.

---

## 1. Overview

Two players duel using a deck of Locations, Units, Charms, and Events, each led by a Leader. On your turn you roll five six-sided dice and spend them — one die per action — to cast cards, activate abilities, and chase bonus combos. Reduce your opponent's Leader to 0 HP to win.

**Format:** 2 players. **Mean game length target:** ~15 minutes.

**Card rarities** (collection/economy only — rarity carries no rules weight):
Common, Uncommon, Rare, Super-Rare, Ultra-Rare, Mythic.

---

## 2. Game Materials & Setup

### Deck construction
- Each player builds exactly **one 30-card deck** *(v4.0: was 40)* from Locations, Units, Charms, and Events, plus **exactly one Leader** kept separate (not part of the 30). A tighter 30-card deck at the same 3-copy cap raises synergy density, making include/cut decisions sharper.
- **Maximum 3 copies** of any single named card.
- **Recommended physical components:** each player should have **at least 10 six-sided dice** of their own. You roll 5 at a time, but dice can rest in your Staging Zone (Twin) across turns, so 5 alone isn't enough to guarantee you can always roll a full turn. Each player's dice are entirely their own — there is no communal dice pool shared between opponents.

### Starting setup
1. Both players choose and reveal their Leader.
2. Shuffle decks. Each player draws a **starting hand of 7** *(v4.3: was 5)*.
3. Roll 1d6 each; highest goes first (reroll ties).
4. **Mulligan (once each):** the first player announces their decision, then the second player does. Both decisions are locked in before either player physically shuffles or redraws; then both execute simultaneously.
5. **First-turn balancing rule:** the first player skips the Draw Phase on their very first turn only.

### Zones
| Zone | Visibility | Notes |
|---|---|---|
| Deck | Private, face-down | Drawn from during Draw Phase |
| Hand | Private | Cap of 8 at End Phase *(v4.3: was 6)* |
| Discard | Public, face-up | Source zone for Echo recasting |
| Staging Zone | Public, face-up | Holds Twin cards with one slot filled, waiting on the second |
| Banished Zone | Public | Permanently removed from the game — nothing can retrieve a card from here |
| Leader zone | Public | Holds your Leader. Always in play — see §8 for why it can never be bounced or banished |
| Location zone | Public | Holds at most **1** Location at a time |
| Unit zone(s) | Public | No limit on number of Units in play |

There is no "stack" or response zone. Effects resolve immediately, one fully resolved before the next begins. **All die-placement actions — including Scrap — can only be performed by the active player, during their own Placement Phase.** A card sitting in your hand cannot do anything on your opponent's turn.

---

## 3. Turn Structure

Seven phases, in order, then the turn passes.

### 3.1 Draw Phase
Draw 1 card. (Skipped by the first player on their first turn only.)

### 3.2 Roll Phase
Roll five d6 from your own supply.

**Momentum *(v4.4, REMOVED v4.8)*:** from v4.4 to v4.7 a player behind on
both HP (at/below half) and board rolled a sixth die, later stacking +1 ATK,
a Leader-Ability discount and a bonus card. The v4.8 harness finally gave the
rule the dedicated on/off A/B the findings docs kept asking for, and the
answer was clear: with Momentum OFF the Leader win-rate spread was slightly
*better* (11.3pt vs 12.3pt), games ran a full round shorter, and the weakest
roster deck gained +9pt. Four rounds of stacked riders never made the trigger
correlate with winning. The rule is removed; every turn is exactly five dice.

### 3.3 Reroll Phase
Reroll any subset of your five dice, up to **two times** *(v4.3 — raised from one reroll; the §6 hit-rate table below still reflects the old one-reroll baseline and understates actual hit rates under the current rule)*.

### 3.4 Placement Phase
Place your five dice **one at a time**, in any order. Each die may go to exactly one of these four legal destinations:

1. An open **Cast Slot** on a card in your hand — casts it.
2. An open **Ability Slot** on a card you control in play — activates it (see §7 for exhaustion rules).
3. The open second Cast Slot of a card in your **Staging Zone** — completes a Twin card (see §7).
4. The Cast Slot of an Echo-eligible card in your **Discard** pile, alongside discarding one additional card from hand — recasts it (see §7 and §10).

Fully resolve one placement before placing the next. A die you haven't yet placed simply sits available — there's no separate "clear" action to take. Any die still unplaced when Placement Phase ends is automatically cleared (returned to your supply) with no further effect.

**Bonus action, no die *(v4.1)*:** alongside the five die placements above, you may also cast **one Location** from hand for free — see §7. It doesn't consume a die and doesn't compete with anything else you do this turn.

**One Combo-gated card per turn *(v4.2)*:** whether cast from hand or Echo-recast from Discard, you may resolve at most **one** Combo-gated card per turn, regardless of how many qualify against your current roll (see §6).

**Scrap** may be activated at any point during this phase, on any die you haven't placed yet (this includes dice that will simply go unplaced when the phase ends — as long as it's before that happens, it's still eligible). Once a die is placed on any of the four destinations above, it's locked and can't be rerolled by anything, including Scrap.

**Pitch *(v4.0)*:** any die that would otherwise clear unplaced at the end of this phase may instead be pitched for **Mend 1** to your Leader. This requires no card, works on any die value, and is always available — it's the baseline floor for a die that would otherwise do nothing. It's deliberately small (not a draw, not damage) so it never competes with a real play; it just removes the pure-waste feeling of a dead 1 or 2.

### 3.5 Combo Check
Check your final five die values against the Combo requirements of cards you control. Any qualifying `Combo:` card triggers its bonus now, once each, in an order you choose — **including a card you cast earlier this same Placement Phase.** A card's Combo bonus always resolves here, never earlier, even if it entered play mid-Placement — this avoids any chance of it double-triggering.

**Your Combo tier is fixed by your final rolled values, not by which physical dice are still on the table.** Casting cards and clearing dice throughout Placement Phase never erases what you rolled — track it mentally or with a note if needed.

**Timing note:** Combo-gated Events (§7) can be cast during Placement Phase itself, the moment your live roll qualifies — this step is specifically for passive bonuses on cards already in play or just cast.

### 3.6 Combat Phase
See §8. Only the active player's Units may attack. **Neither player may attack during their own first turn of the game.**

### 3.7 End Phase
1. Discard down to **8** cards in hand *(v4.3: was 6)* if needed (your choice which). This is an ordinary discard and can trigger Echo eligibility on a qualifying card — but see §10 for why you can't actually pay to recast it until a future turn.
2. All exhaustion clears (both the "attacked" flag and every Ability Slot's used-flag). Any dice still resting on Ability Slots return to your supply.
3. **Ward refresh *(v4.0)*:** all Ward effects, on *both* players' cards, refresh at the end of *every* End Phase — yours and your opponent's. Ward is never off for a full round; it's a per-turn-taken resource, not a per-player-turn resource. (Under the old reading Ward would only ever be "on" every other turn for whichever player wasn't currently active, which broke defenders.)
3. Pass the turn.

---

## 4. Dice Lifecycle Summary

- You always roll a fresh five dice from your own supply at the start of every one of your turns.
- Dice on a **partially-filled Twin card** rest in your Staging Zone across turns — they are separate physical dice, not part of any future roll, and don't return to your supply until the card completes (see §7) or is voluntarily abandoned.
- Dice on **Ability Slots** rest there only until the end of the current Placement Phase (so Rally can interact with them), then return to your supply at End Phase.
- Dice on ordinary (non-Twin) **Cast Slots** return to your supply immediately once the card is cast.
- **If a card leaves play while a die is resting on one of its slots** (e.g. a Location replaced mid-turn, or a Unit destroyed with a die still sitting on an Ability Slot it used that turn), that die is immediately returned to your supply the moment the card leaves — it doesn't wait for End Phase.

---

## 5. Targeting & Removal

Unless a card explicitly says otherwise:
- Any effect that says "target" may only target a **Unit, Leader, or Location currently in play**. It cannot target cards in hand, Discard, Staging, or Banished. A card is always free to explicitly override this and reference a different zone (e.g. "target a card in your Discard pile") — the default above only applies when a card doesn't specify.
- **Removal** means any effect that would move a Unit out of play (destroy, bounce to hand, banish) or reduce its HP/stats outside of ordinary combat damage. This is purely mechanical — it applies regardless of who controls the Unit or whether they'd want it to happen; there's no intent-checking.
- **Leaders are a special case:** they can be targeted by damage and healing effects, but no effect can ever change a Leader's zone (bounce it to hand, banish it, etc.) — a Leader is always in play for the whole game. Any effect that would try simply does nothing to a Leader.

---

## 6. Combo Patterns

Each Combo-referencing card names one **exact pattern**. It's satisfied if your five dice **genuinely contain that pattern as a subset** — check it physically: can you point to the specific dice among your five that form the required pattern?

| Pattern | Rough feel |
|---|---|
| Any Pair | usually available |
| Two Pair | reliable mid-game payoff |
| Three of a Kind | solid payoff |
| Small Straight (4 sequential) | solid payoff |
| Full House | big swing |
| Large Straight (5 sequential) | big swing |
| Four of a Kind | bomb |
| Yahtzee (5 of a Kind) | game-ending bomb |
| Three Odds (3+ odd-value dice) | usually available — an easy gate, alongside Any Pair |
| Three Evens (3+ even-value dice) | usually available — an easy gate, alongside Any Pair |

Because this is subset-based rather than tier-based, some rolls legitimately satisfy several different requirements at once — a Yahtzee, for instance, contains a genuine Pair, Three of a Kind, and Four of a Kind within it (any 2, 3, or 4 of the five identical dice), so it can trigger all of those cards' Combo bonuses simultaneously along with its own. It does **not** satisfy Two Pair, since that specifically requires two pairs of *different* values, and five identical dice only offer one value. This is intentional — a great roll paying off multiple cards at once is the reward for hitting one.

Combo checks only ever read **your own** roll and can only trigger cards **you** control, unless a specific card's text says otherwise.

**One Combo-gated card per turn *(v4.2)*:** you may cast at most **one Combo-gated card per turn**, regardless of how many qualify. This is a systemic cap, not a fix targeted at one card — it closes off any future card that gates on an achievable pattern from chaining with a second one on the same lucky roll. (It also covers Echo-recasting a Combo-gated card from Discard — see §10.)

### Measured hit rate under directed rerolling *(v4.2 design data, re-measured v4.5)*

The table above ranks patterns by rough feel, not a measured number — and the naive single-roll probability is the wrong metric anyway, because a player rerolling doesn't roll blind: they reroll *toward* their target pattern. `scripts/pattern-hitrate.ts` measures actual hit rate under a directed-reroll strategy (200,000 trials per pattern, keep-and-reroll-toward-the-goal). *(v4.5)* Re-measured under the **current two-reroll rule** (§3.3, in effect since v4.3) — the original table below only ever modeled one reroll and understated every number; both are shown for reference, but **Directed (2 rerolls) is the number that reflects live play**:

| Pattern | Naive (no reroll) | Directed (1 reroll) | Directed (2 rerolls, current rule) |
|---|---:|---:|---:|
| Any Pair | 90.7% | 99.2% | 99.9% |
| Two Pair | 26.9% | 55.9% | 74.0% |
| Three of a Kind | 21.2% | 54.0% | 74.2% |
| Small Straight | 15.5% | 32.5% | 44.0% |
| Full House | 3.8% | 18.2% | 34.6% |
| Four of a Kind | 2.1% | 13.2% | 29.0% |
| Large Straight | 3.1% | 10.6% | 17.4% |
| Yahtzee | 0.1% | 1.3% | 4.6% |

**This data does not support "straight-family patterns need a harder tier than matching-family at the same nominal difficulty."** That was the hypothesis behind the v4.1→v4.2 review's recalibration flag, and measuring it directly shows the opposite in most comparisons: Three of a Kind (74.2%) is nearly **double** Small Straight's hit rate (44.0%) under directed two-reroll play, and Full House (34.6%) is actually *easier* to hit than Large Straight (17.4%) despite sharing the same "big swing" price tag — Large Straight is the single hardest pattern in the "bomb" cluster, harder even than Four of a Kind (29.0%). If anything, straight-family patterns are *harder* to hit than their nominal matching-family counterpart, not easier. Card design should price off this table, not off intuition about "keeping a run vs. keeping duplicates." *(v4.5 note: the two-reroll numbers land meaningfully higher across the board — e.g. Full House 18.2%→34.6% — so gate-tier pricing done off the old one-reroll column was working from understated hit rates; the FourKind general-pool fix elsewhere in this pass was flagged independently of this re-measurement, but the two findings point the same direction.)*

The v4.2 fix to the specific offending Large-Straight-gated Event (see Changelog) wasn't because the gate was too easy — it measures as the hardest pattern in its tier — it's because a repeatable, high-value, face-only burn effect compounds badly over a ~10-round game even at a "only" ~10%-per-turn hit rate, especially with multiple copies in hand (any copy is castable the instant the roll qualifies). The fix (retarget off pure face damage, lower the value, and the new one-Combo-gated-card-per-turn cap) addresses that compounding directly.

---

## 7. Casting & Activating

Every non-Leader card prints a **Cast Slot** (threshold 1–6). By default this is an **"at least"** cost: a die of that value or higher, placed there, brings the card into play or resolves it immediately. *(v4.3)* Some cards instead print one of two other Cast Slot formats:
- **Exact** — the placed die must show **exactly** the printed number, no higher and no lower.
- **Sum** — combine the value of **any number** of your still-unplaced dice until they total the printed number or more; all of them are spent on this one card.

Anchor and Overflow (below) both key off a card's **effective** threshold regardless of which cost format it uses; Overflow specifically only ever appears on 'at least'-cost cards.

Cards in play may print one or more **Ability Slots** — repeatable thresholds. **Exhaustion is tracked per Ability Slot**, not per card: a card with two different Ability Slots can have both activated in the same turn, each once. However, **activating any Ability Slot and attacking are mutually exclusive on the same Unit in the same turn** — a Unit that has used an Ability Slot this turn cannot also attack this turn, and vice versa.

- **Default is one Cast Slot per card**, unless it has Twin.
- **Locations *(v4.1)*: no die, no Cast Slot.** Once per turn, you may cast one Location from hand **for free, as a bonus action** alongside your normal five die placements. This doesn't consume a die and doesn't compete with anything else you do this turn. Location cards no longer print a threshold number at all — just their passive and (optionally) an Ability Slot, which still costs a die to activate as normal. *(Rationale: a Location competing for a die had to beat a Unit's entire value with a passive alone — an opportunity-cost fight it structurally loses, as v4.0's +0.7–1.5% isolated contribution showed. This is the free-land-drop move: it takes Locations out of the die economy instead of trying to make them competitive inside it.)* *(v4.4)* The flat passive value doubles from **+1 to +2 ATK/max HP** for all your Units — the balance sim measured Locations at −1.4 win% versus spending that Cast Slot on a cheap Unit instead, meaning +1 wasn't pulling its weight over an ~11-round average game. *(v4.4.2)* Every Location also resolves a small effect the instant it enters play, the same `onCast` field Units/Charms/Events already use (previously ignored for this card type): **+1/+1 to a friendly Unit.** An earlier attempt at Mend 1 to the Leader here made Locations' isolated contribution *worse* (−2.1% → −5.3%), confirming a Location competes against a Unit's immediate board impact, not Leader HP.
- A Location entering play replaces whatever Location you currently control, sending the old one to Discard. **You may not cast a Location sharing a name with the one you control, and you may cast at most one Location total per turn** — this second restriction closes a loophole where alternating between two differently-named Locations could otherwise reset an Ability Slot repeatedly in one turn.

### Combo-gated Events
Some Events have no numeric threshold — their entire cost is "Combo: [Pattern]." Casting one still requires placing one of your five dice onto it during Placement Phase (any value — only your live roll qualifying matters).

**Gate calibration *(v4.1 design guidance)*:** with one reroll, Yahtzee is a ~1–2% roll and Four of a Kind not much better — cards gated behind them are dead in hand essentially every game (measured at 0.02×/game in v4.0), and Echo can't rescue them because bricking-in-hand was never the problem. So: **Full House and Large Straight are the practical ceiling** for any Combo-gated card meant to see regular play. Yahtzee/Four-of-a-Kind gates are flavor-only rarity — a tiny handful of true trophy cards (1–3 in the whole pool) is fine as a memorable once-in-fifty-games moment, but don't budget deck slots around them. If a design wants a Yahtzee payoff to *matter*, don't gate it behind Yahtzee: print a high numeric threshold and put the Yahtzee reward on a **Combo bonus** (a rider, not a requirement) so the card is never dead.

**v4.5 fix:** `pickCostFormat()`'s general `HARD_GATES` picker (`src/game/v3/cardpool.ts`) was assigning FourKind as a co-equal third option alongside Full House and Large Straight at every tier-3+ roll — contradicting the guidance immediately above. That put 5 FourKind-gated cards in the live pool (2.7% of it), more than the "1–3 in the whole pool" this section calls for. Yahtzee was already excluded from the general picker per v4.1; FourKind now gets the same treatment and is reserved for hand-picked trophy/bonus placements only (see the tier≥4 "comeback pass" Combo-bonus riders in `mapSpell`, which still use it as a bonus, not a gate).

### Twin cards and the Staging Zone
A Twin X card has two Cast Slots. The moment the first is filled, move it face-up into your Staging Zone. **The second die placed must show the exact same face value as the first** — not merely independently meet the printed threshold. The card isn't in play while staged (can't be attacked or targeted) and can sit there across turns. The moment the second slot is filled, it fully enters play, both resting dice immediately return to your supply, and its bonus triggers. Every card with Twin must print its own bonus effect text (e.g. "Twin 1: Draw a card") — Twin has no generic effect on its own.

**One die per Placement Phase *(v4.0)*:** a Twin card may receive **at most one die per Placement Phase**. Its two slots must be filled on two different turns (not necessarily consecutive). This is what makes the Staging Zone and voluntary-abandon rule actually matter — without it, Twin collapses into "cost: two matching dice this turn, with extra steps," which is exactly what 283-completions-vs-12-abandons in v3.0 playtesting showed happening.

**Staged passive *(v4.2)*: while parked, a Twin card isn't doing nothing.** Every card with Twin may print a **staged passive** — a small effect that triggers once at the start of each of your turns for as long as the card sits in your Staging Zone (starting the turn *after* it was first staged, since it's staged mid-Placement-Phase). This is the result of a controlled A/B/C test: the one-die-per-turn cap (above) measured a large negative win-correlation on completing a Twin card. Two isolated fixes were tested against the same deck roster — (1) revert the cap entirely, letting Twin complete in the same Placement Phase, or (2) keep the cap but give staged cards a passive. **Fix 2 won** (best Combo-completion win-delta of the three, and the only one that measurably helped the weakest Twin-drafting archetype). Fix 1 (reverting the cap) is still available as an engine option (`TwinMode: 'sameTurn'`) for further testing, but ships disabled.

*Postscript on the original -22pt reading:* holding archetype composition constant across all three test modes revealed that the raw "win% when completing a Twin" correlation barely moved between modes (roughly 43–46% and 19–23% for the two Twin-drafting archetypes, regardless of which Twin rule was active). That means the original number was measuring **which decks happen to run Twin cards**, not what Twin itself costs — the same "deck membership vs. card power" confound flagged for the OP-card rankings in the v4.0/v4.1 passes. The staged-passive fix is a genuine, if modest, net positive; it was never the primary reason those archetypes were weak.

**Voluntary abandonment:** at the start of any of your turns, before Draw Phase, you may abandon a partially-filled Twin card: return it to your hand and clear its resting die.

### Anchor
Anchor counts only cards you control **already in play**, never cards in hand. Only reduces Cast Slot thresholds, never Ability Slots. *(v4.1)* The total reduction is **capped at 2**, regardless of how many Anchor cards are in play — v4.0's uncapped text was exactly the "collapses to 1 with barely any investment" problem playtesting found. *Design constraint:* Anchor provides no benefit on a card already printed at threshold 1, since that's the minimum possible.

*(v4.4)* The cap is now **3**, and reaching it grants a payoff: the first
time an Anchor Unit's own discount would hit the cap (that is, it has 3 or
more *other* Anchor cards already in play the moment it enters), it
permanently gains **+1/+1**, once per card life. This is checked only for the
card that's actually entering play, not retroactively applied to Anchor cards
already on board — casting your 4th Anchor card rewards that card, not a
silent buff to the three already there. The balance sim measured pure Anchor
decks as consistently underperforming (a flat, diminishing-returns curve with
no swing potential in an aggression-favoring meta) — the deeper ramp plus a
real payoff moment are the fix.

---

## 8. Combat Rules

Combat uses a **targeted-attack model**. Attacks are **declared and resolved one at a time**, in an order the attacker chooses — not declared as a batch. This matters directly for Guard: if an earlier attack this Combat Phase destroys the last Guard Unit, later attacks in the same phase are immediately free to target elsewhere.

1. The active player picks one of their eligible Units (not exhausted — see §7) to attack, and declares its target: the defending Leader, or a defending Unit.
2. **Guard:** while the defending player controls at least one Guard Unit, the target must be a Guard Unit. Once none remain (all destroyed), later attacks this Combat Phase may target freely.
3. **Damage resolution** for this single attack:
   - Against the Leader: attacker's ATK is subtracted from Leader HP. **Leaders have no ATK and never deal or take retaliation damage** — attacking a Leader directly is entirely one-directional.
   - Against a Unit: attacker's ATK is subtracted from the target's HP, and simultaneously the target's ATK is subtracted from the attacker's HP. **ATK and HP are never treated as below 0** — a Unit with reduced ATK below 0 simply deals 0 damage, it never heals its target.
   - **Pierce:** Guard only restricts which target you may legally declare — once an attack against a Guard Unit is legal and declared, Pierce's overflow damage is a consequence of that already-legal hit, not a new target, and proceeds to the Leader normally regardless of Guard. The overflow amount is the leftover damage (attacker's ATK minus what was needed to destroy the target), **capped at half the attacker's effective ATK** *(v4.4, rounded down, minimum 1)* — never the attacker's full ATK. All of this (damage to target, retaliation to attacker, Pierce overflow) is calculated simultaneously off both units' stats the instant before the attack resolves — if the attacker is also destroyed by retaliation in this same exchange, its Pierce overflow still goes through. *(The cap was added after the balance sim showed Pierce decks consistently overperforming — see the changelog. A flat "ATK minus 1" cap was considered and rejected: the naive leftover against any 1-HP blocker is already exactly ATK minus 1, so that cap would never actually change anything.)*
   - **Ward:** only prevents damage from instances where this Unit is the one being attacked or targeted. It does not prevent retaliation damage a Unit takes as a result of an attack it declared — attacking is never "free" just because the attacker has Ward. Applied before any multiplier (see below). *(v4.4)* When Ward prevents a combat hit, it also **spikes 1 damage back at the attacker** — a reactive punish so Ward decks can answer the aggression that's beating them instead of just delaying it by one turn.
   - **Steel *(v4.4)*:** a per-turn absorption pool, checked Ward → Steel → Bulwark → Frenzy. Unlike Ward (one full prevention) or Bulwark (flat, attacks only), Steel can blunt several smaller hits across a turn — from attacks, Sap, or Pierce overflow alike — before running dry, refreshing every End Phase.
4. Repeat for the next attacking Unit. **Frenzy** Units may go through this sequence twice in the same Combat Phase, but only if they survive their first attack. *(v4.0)* Its **first attack is entirely normal**; **only its second (bonus) attack** doubles the retaliation damage it takes (see Damage Resolution Order). *(v4.4)* That second attack also **can't target the enemy Leader directly**, unless no other legal target remains — Frenzy stays a board-control tool instead of also functioning as a second face-attack roll, which the balance sim flagged as the single strongest win predictor in the game. This keeps the "risk on the bonus action" identity without a Frenzy unit dying to doubled retaliation before it ever gets to use its keyword. *(v4.4.1)* The Leader-targeting restriction only applies while its controller is **even or ahead** on board Units — a player who's actually behind keeps Frenzy's face-damage upside as a comeback tool (the unconditional version measured as an overcorrection, dropping Frenzy's keyword-wide win rate well below average). *(v4.4.2)* Frenzy Units also get an unconditional **+2 ATK** (was a coin-flip +1) to compensate for the overflow/targeting nerfs directly, since the "behind on board" carve-out alone barely moved the keyword's measured win rate.
5. Damage is **persistent** and does not reset at end of turn. Any Unit reaching 0 HP is destroyed immediately and moves to Discard, checked continuously.

**Design note on big stat-stick Units:** intentional, not a bug — Pierce, Sap, and direct-removal Events are the answer to a wall.

### Damage Resolution Order
Full-prevention (Ward) applies before absorption (Steel *(v4.4)*), before flat reduction (Bulwark), before multiplication (Frenzy): **Ward → Steel → Bulwark → Frenzy**. If Ward fully prevents an instance of damage, there's nothing left for Steel, Bulwark, or Frenzy to touch.

### HP maximums
A Unit's or **Leader's** maximum HP is always its printed/starting value, unless a card effect explicitly and permanently raises it. Mend can never heal past the current maximum. *(v4.1: Leader starting/max HP is **64** — raised from v4.0's 28 after ~6-round games proved still short of the 8–10 round target; 64 lands the simulated average at ~9–10 rounds and gives reactive decks the turns they need to stabilize.)*

---

## 9. Winning & Losing

You lose immediately if your Leader's HP reaches 0.

**Fatigue** *(v4.7 — replaces the instant deck-out loss)*: if you are required
to draw during your Draw Phase and your deck is empty, you instead take
escalating Fatigue damage to your Leader — 1 the first time, then 2, then 3,
and so on, increasing by 1 for each missed mandatory draw. (Pre-v4.7 rules
made an empty mandatory draw an instant loss; simulation showed a quarter of
all games were ending on that cliff, which quietly punished every card-draw
effect and rewarded unit-hoarding attrition decks. Fatigue keeps the empty
deck a real, mounting pressure while letting the game end honestly — on
Leader HP.)

**Simultaneous loss:** if a single effect would reduce both Leaders to 0 HP at
the same time, the game ends in a draw.

**Other "draw a card" effects (e.g. Surge)** never cause Fatigue — Fatigue
applies only to the mandatory Draw Phase; any other draw effect simply does
nothing if your deck is empty.

---

## 10. Keyword Glossary

### Dice-interaction keywords

**Overflow X** — If the die placed on this card's slot exceeds its **effective threshold** (after reductions like Anchor, not necessarily the printed number) by X or more, trigger the listed bonus immediately.

**Combo: [Pattern]** — Triggers if your final five-die roll contains the exact named pattern as a genuine subset. See §6.

**Twin X** — Two Cast Slots requiring identical face values; see §7 for Staging Zone rules, matching rules, and the voluntary-abandon option.

**Rally** — Once per turn, when you would place a die on this card's Ability Slot, you may instead activate it using a die already resting on another exhausted friendly Ability Slot — this costs you nothing from your rolling pool; the source card remains exhausted regardless of the die moving away.

**Scrap** — Discard this card from hand to reroll one **unplaced** die of your choice, at any point during Placement Phase.

**Anchor** — This card's effective Cast Slot threshold is reduced by 1 for each other card you control in play with Anchor, **to a maximum total reduction of 3** *(v4.4, was 2 in v4.1)*, minimum threshold 1. *(v4.4)* The first time a card's own discount hits that cap, it permanently gains +1/+1, once per card life. See §7 for the printed-vs-effective interaction with Overflow and full detail on the cap bonus.

**Crescendo X** *(v4.2, Event)* — +X to this Event's numeric effect for each die showing a **6** that you placed this turn (including the die that cast this Event). The preferred pattern for a "big roll payoff" card going forward: it scales with a hot roll but is **never a dead card** on a bad one, sidestepping the trophy-gate failure mode (a Yahtzee-gated card measured at 0.02 casts/game in v4.0 — see §6) structurally instead of needing rarity guidance to manage it.

**Snap** *(v4.2, Charm)* — May be cast during your **Reroll Phase**, before the reroll window closes, instead of waiting for Placement Phase. Still spends a die from your five exactly as an ordinary cast — only the timing changes. Doesn't reopen the no-stack/no-response rule: it's still only ever available on your own turn, before your own reroll decision.

### Combat keywords

**Guard** — See §8. While you control any Guard Unit, your opponent's attacks must target your Guard Units, resolved one at a time, until all are destroyed.

**Swift** — This Unit may attack **or** use an Ability Slot the turn it's cast (subject to the same mutual-exclusivity as any other turn — see §7). Without Swift, it can do neither until your next turn.

**Pierce** — See §8 for full interaction with Guard and simultaneous-death timing. *(v4.4)* Overflow is capped at half the attacker's effective ATK (rounded down, minimum 1).

**Ward** — Prevents the first instance of damage or Removal against this card each turn, from being the one attacked or targeted — not from retaliation this Unit takes on its own attack. Applied before Steel/Bulwark/multipliers (§8). *(v4.0)* Refreshes at the end of the **next End Phase to occur, whether it's yours or your opponent's** — see §3.7. *(v4.4)* When it prevents a combat hit, it also spikes 1 damage back at the attacker.

**Frenzy** — May attack a second time in the same Combat Phase if it survives its first attack. *(v4.0)* Its first attack is normal; **only its second attack** takes doubled retaliation. *(v4.4)* That second attack also can't target the enemy Leader directly, unless no other legal target remains.

**Bulwark X** *(v4.2, Unit)* — Flat reduction to damage this Unit takes **from attacks** (not from Sap or other non-attack sources — see Toll below for that). Checked in this order on every attack instance: **Ward** (full prevention) → **Steel** *(v4.4)* (per-turn absorption) → **Bulwark** (flat reduction) → **Frenzy** (multiplier), consistent with the existing Ward-before-Frenzy rule (§8). Applies both when this Unit is the one being attacked, and to retaliation damage it takes while attacking.

**Steel X** *(v4.4, Unit; printed values reduced in v4.7)* — The first X damage this Unit would take **each turn, from any source** (attacks, Sap, Pierce overflow), is prevented instead of reduced. A per-turn absorption pool, refreshing every End Phase like Ward — but unlike Ward's single full prevention, Steel can blunt several smaller hits across the same turn before running dry. Checked Ward → Steel → Bulwark → Frenzy. Distinct from Bulwark (flat, attacks only, no per-turn cap) and Toll (Leader-only): Steel protects the *Unit itself*, from *anything*, up to a *pool*. *(v4.6)* On any single combat hit, the **combined** prevention from a Unit's own Steel and Bulwark together is capped at **4** — the same "ramp, not a collapse" ceiling Toll/Anchor/Avenge use, aimed at dual Steel+Bulwark bodies.

**Toll X** *(v4.2, Unit)* — While this Unit is in play, **all incoming damage to your Leader, from any source** (attacks, Sap, Pierce overflow — anything), is reduced by X. Broader than Bulwark on purpose: Bulwark answers attacks specifically, Toll is the answer to the direct/Sap damage a Guard wall alone can't stop. **The total reduction from every Toll source you control is capped at 3**, the same "ramp, not a collapse" ceiling Anchor uses (§7) — stacking a fourth point of Toll is possible but does nothing beyond the cap.

**Avenge** *(v4.2, Unit)* — Whenever another friendly Unit dies, this Unit permanently gains +1/+1. This is a **state-based trigger**, not a targeted response — it resolves automatically and immediately, the same way a Unit at 0 HP is destroyed automatically (§8), with no priority window. It can trigger on your opponent's turn (e.g. if their attack kills one of your other Units) exactly the same as on your own. *(v4.5)* Capped at **3** total +1/+1 over a card's lifetime; *(v4.6)* tightened to **2** — the cap-at-3 measurably never bit (Avenge was still the strongest keyword and its archetypes were unmoved), the same "ramp, not a collapse" ceiling every other repeating stat mechanic already has.

**Overrun** *(v4.4.1, Unit)* — If this Unit's combat damage to its target would be fully prevented or absorbed by Ward, Steel, or Bulwark, it deals **half its effective ATK (rounded down, minimum 1) anyway** *(v4.6, was a flat 1 — the flat version measured as no answer at all to the durability-stack decks it was printed against; half-ATK mirrors Pierce's established overflow magnitude)*. Never fires off a 0-ATK attacker, and never applies to retaliation damage. A direct, targeted counter to the durability-stack meta (Ward/Steel/Bulwark all fully zeroing a hit) without touching the numbers that make those keywords good answers to Pierce/Frenzy.

### Utility keywords

**Surge** — Draw a card. See §9 for the empty-deck interaction.

**Mend X** — Heal X HP to your Leader or a target friendly Unit, never past its maximum.

**Sap X** — Deal X damage directly to a target Unit or Leader.

**Bind** — Target Unit cannot attack, use an Ability Slot, **or deal retaliation damage** *(v4.0)*, during its controller's **next** turn. The retaliation clause turns Bind from "skip a turn" (measured at a weak 41.3% in v3.0) into a genuine tempo tool: it converts a threatening blocker or attacker into a completely safe target for one turn — a real answer to a Guard wall, not a minor speed bump. (By design, self-targeting Bind does nothing on your current turn — it's disruption aimed at an opponent's upcoming turn, so self-targeting is simply useless rather than exploitable.)

**Echo** — After this card is discarded, for any reason (dying in combat, resolving as a Charm/Event, being replaced, or discarded for hand size — all of these count identically), it becomes eligible to be recast later from Discard: place a die meeting its normal Cast Slot threshold **and** discard one additional card from hand. *If the card is a Combo-gated Event with no numeric threshold*, its Echo cost instead mirrors the original casting requirement (your live roll must satisfy the named pattern; place any one die) plus the same additional-card discard — and is subject to the same **one Combo-gated card per turn** cap as an ordinary cast (§6). *(v4.0: the additional card discarded to pay Echo's cost is an ordinary discard in every respect — if that card also has Echo or a pending Banish-on-redischarge state, it triggers/applies normally.)* *(v4.4)* **The extra-discard cost is waived entirely for Rare/Super-Rare ("mid" tier) cards** — place the die (and satisfy any pattern/target requirement) with no hand cost at all. The balance sim measured recasting a mid-rarity card via Echo as correlated with *losing* (a losing player reaching for a comeback that wasn't one), while low- and high-rarity Echo recasts both correlated with winning; this fixes the cost curve for the one tier where it was miscalibrated rather than touching the mechanic everywhere. Recasting can only happen during a Placement Phase — if a card is discarded during your End Phase (e.g. for hand size), the earliest you can pay to recast it is a future turn's Placement Phase, never the same turn. This can be done once per physical card. The next time an Echoed card **would be discarded again**, it goes to the Banished Zone instead — this specifically replaces a discard event, not other zone changes; if a spent-Echo card is instead bounced to hand, it just goes to hand normally, and only banishes on its *next* discard after that.

**Aftershock** *(v4.2, Event)* — After this Event resolves, it leaves behind a delayed, lower-value repeat of its own effect. That delayed effect resolves at the **very start of your next turn, before Draw Phase** — the same timing hook Twin's voluntary-abandon already uses (§7). Turns a big Event into something that feels like a genuine two-turn commitment (and is telegraphed for the opponent to see coming), rather than a single burst.

### Leader keywords

**Resolve X** *(v4.2)* — While your Leader is at or below half its maximum HP, its Ability Slot threshold is reduced by X (reusing the same threshold-reduction language Anchor already established). A comeback mechanic: it directly counters the measured **+19–22pt early-face-attack win-correlation** without touching combat math at all — the worse a Resolve Leader is losing, the cheaper its own answer gets.

**Ultimate(N)** *(v4.2)* — Your Leader gains a **second Ability Slot**, entirely independent of its normal one (its own die, its own threshold, its own exhaustion), but it can only be activated **once per game**, and only starting on your **Nth own turn**. Directly answers the "reactive leaders lack inevitability" gap: a late-game payoff that doesn't require redesigning the Leader's whole early-game plan.

### Location keywords

**Tribute** *(v4.2)* — Triggers at your End Phase if you Pitched 2 or more dice this turn (§3.4). Direct synergy with Pitch: a Location built around your dice going unused instead of a Location built around spending them.

**Excavate X** *(v4.2)* — This Location's Ability Slot threshold drops by X for every one of your turns it has remained continuously in play (minimum 1). A ramp identity: holding a Location long-term instead of replacing it becomes a deliberate payoff, not just inertia.

**Contested** *(v4.2)* — This Location's passive is **doubled** while your opponent controls no Location of their own. Creates a genuine arms-race decision around whether to commit to your own Location or race to deny theirs.

**Foothold** *(v4.4.1)* — The first Unit you cast each turn while this Location is in play costs **1 less** (stacks with Anchor). Gives ramp identities (Excavate/Anchor especially) a real floor on the turns they're otherwise doing nothing.

---

## 11. Terms Glossary

**Active player** — the player whose turn it currently is; the only player who may place dice.

**Cast Slot** — threshold on a card in hand (or Staging/Discard, for Twin/Echo); paying it brings the card into play or resolves it.

**Ability Slot** — repeatable threshold on a card already in play; exhaustion tracked per slot (§7).

**Exhausted** — a specific Ability Slot that's already been used this turn, or a Unit that has already attacked this turn (these two exhaustion types are linked — see §7). Clears at End Phase.

**Threshold** — the die value (1–6) a slot requires. "Printed" is the number on the card; "effective" is after reductions like Anchor.

**Removal** — see §5.

**Combo tier** — the highest exact pattern your current five dice satisfy; conceptual, not tied to physical dice remaining on the table.

**Slot** — generic term covering Cast Slots and Ability Slots.

**Leader** — your one persistent, non-deck card; **64** starting/max HP *(v4.1)*, one Ability Slot, no ATK, can never change zones.

**Pitch *(v4.0)*** — the baseline use for an otherwise-unplaced die: Mend 1 to your Leader, no card required. See §3.4.

**Location** — persistent field card; max one in play, max one cast per turn. *(v4.1)* The **one card type that never uses a Cast Slot**: it casts free once per turn as a bonus action (§7). Its Ability Slot, if any, still costs a die.

**Unit** — persistent board card with ATK/HP that can attack and be attacked.

**Charm** — one-shot card, resolves immediately, then Discard.

**Event** — one-shot card, higher-impact than a Charm; may be Combo-gated.

**Zone** — see §2, including Staging and Banished.

**Attack / Target** — see §8 and §5.

---

## 12. Components & Bookkeeping

- A counter or tracker per damaged Unit/Leader, noting current HP against its printed maximum.
- A token or the card's orientation to show each exhausted Ability Slot and the separate "has attacked" state.
- A distinct token to show Ward availability.
- At least 10 dice per player (not just 5), since some can rest in your Staging Zone across turns while you still need a full 5 to roll each turn.

---

## 13. Quick Reference Card

| Setting | Value |
|---|---|
| Players | 2 |
| Leader starting/max HP | **64** *(v4.1; was 28 in v4.0, 20 in v3.0)*, no ATK, cannot change zones |
| Deck size | **30** *(v4.0, was 40)* (Leader separate) |
| Max copies per card | 3 |
| Starting hand | **7** *(v4.3, was 5)* (one mulligan allowed, first player decides first, both execute together) |
| Hand size cap | **8** *(v4.3, was 6)* |
| Dice per turn | 5d6 from your own supply (10+ recommended total), up to two rerolls of any subset *(v4.3, was one)* |
| Locations in play | 1 max, 1 cast per turn max, no same-name replacement; *(v4.1)* cast **free** — no die, no Cast Slot |
| Anchor | *(v4.1)* −1 per other Anchor card in play, **max total −2**, min threshold 1 |
| Combo gates | *(v4.1)* practical ceiling Full House / Large Straight; Yahtzee/4-Kind = trophy-only |
| Elements | *(v4.1)* removed from all cards — purely cosmetic legacy data, deleted |
| Units in play | unlimited |
| First player | high 1d6 roll; skips first Draw Phase; can't attack their first turn |
| Combat | sequential targeted-attack, no blocking step; Guard walls until fully destroyed |
| Twin | max 1 die per card per Placement Phase (two slots ⇒ two turns); *(v4.2)* staged cards may print a passive that ticks each of your turns while parked |
| Ward refresh | *(v4.0)* both players, end of every End Phase |
| Bind | *(v4.0)* stops attack, Ability Slot, **and** retaliation next turn |
| Frenzy downside | *(v4.0)* only the 2nd attack takes doubled retaliation |
| Pitch | *(v4.0)* any unplaced die → Mend 1 to your Leader, no card needed |
| Combo-gated casts | *(v4.2)* max **1 per turn**, cast or Echo-recast, regardless of how many qualify |
| New v4.2 keywords | Leader: Resolve X, Ultimate(N) · Unit: Bulwark X, Toll X, Avenge · Event: Crescendo X, Aftershock · Charm: Snap · Location: Tribute, Excavate X, Contested |

**Turn order:** Draw (+ any pending Aftershock) → Roll → Reroll (Snap Charms may cast here) → Placement (4 legal die destinations + free Location cast, Scrap + Pitch on unplaced dice, max 1 Combo-gated card) → Combo Check → Combat (sequential) → End (discard to 8, clear exhaustion, refresh Ward both sides, check Tribute, pass turn).
