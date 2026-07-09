# [Working Title] — Definitive Rulebook v3.0

Supersedes v2.0 (and the legacy Shifting Multiverse V1.x rules, preserved in
`RULEBOOK_V1_LEGACY.md`). The executable version of this document is the new
dice-placement engine in `src/game/v3/engine.ts`; card data lives in
`src/game/v3/cards.ts`, and `npm run sim:v3` runs the headless playtest
harness against it.

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

---

## 2. Game Materials & Setup

### Deck construction
- Each player builds exactly **one 40-card deck** from Locations, Units, Charms, and Events, plus **exactly one Leader** kept separate (not part of the 40).
- **Maximum 3 copies** of any single named card.
- **Recommended physical components:** each player should have **at least 10 six-sided dice** of their own. You roll 5 at a time, but dice can rest in your Staging Zone (Twin) across turns, so 5 alone isn't enough to guarantee you can always roll a full turn. Each player's dice are entirely their own — there is no communal dice pool shared between opponents.

### Starting setup
1. Both players choose and reveal their Leader.
2. Shuffle decks. Each player draws a **starting hand of 5**.
3. Roll 1d6 each; highest goes first (reroll ties).
4. **Mulligan (once each):** the first player announces their decision, then the second player does. Both decisions are locked in before either player physically shuffles or redraws; then both execute simultaneously.
5. **First-turn balancing rule:** the first player skips the Draw Phase on their very first turn only.

### Zones
| Zone | Visibility | Notes |
|---|---|---|
| Deck | Private, face-down | Drawn from during Draw Phase |
| Hand | Private | Cap of 6 at End Phase |
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

### 3.3 Reroll Phase
Reroll any subset of your five dice **exactly once**.

### 3.4 Placement Phase
Place your five dice **one at a time**, in any order. Each die may go to exactly one of these four legal destinations:

1. An open **Cast Slot** on a card in your hand — casts it.
2. An open **Ability Slot** on a card you control in play — activates it (see §7 for exhaustion rules).
3. The open second Cast Slot of a card in your **Staging Zone** — completes a Twin card (see §7).
4. The Cast Slot of an Echo-eligible card in your **Discard** pile, alongside discarding one additional card from hand — recasts it (see §7 and §10).

Fully resolve one placement before placing the next. A die you haven't yet placed simply sits available — there's no separate "clear" action to take. Any die still unplaced when Placement Phase ends is automatically cleared (returned to your supply) with no further effect.

**Scrap** may be activated at any point during this phase, on any die you haven't placed yet (this includes dice that will simply go unplaced when the phase ends — as long as it's before that happens, it's still eligible). Once a die is placed on any of the four destinations above, it's locked and can't be rerolled by anything, including Scrap.

### 3.5 Combo Check
Check your final five die values against the Combo requirements of cards you control. Any qualifying `Combo:` card triggers its bonus now, once each, in an order you choose — **including a card you cast earlier this same Placement Phase.** A card's Combo bonus always resolves here, never earlier, even if it entered play mid-Placement — this avoids any chance of it double-triggering.

**Your Combo tier is fixed by your final rolled values, not by which physical dice are still on the table.** Casting cards and clearing dice throughout Placement Phase never erases what you rolled — track it mentally or with a note if needed.

**Timing note:** Combo-gated Events (§7) can be cast during Placement Phase itself, the moment your live roll qualifies — this step is specifically for passive bonuses on cards already in play or just cast.

### 3.6 Combat Phase
See §8. Only the active player's Units may attack. **Neither player may attack during their own first turn of the game.**

### 3.7 End Phase
1. Discard down to 6 cards in hand if needed (your choice which). This is an ordinary discard and can trigger Echo eligibility on a qualifying card — but see §10 for why you can't actually pay to recast it until a future turn.
2. All exhaustion clears (both the "attacked" flag and every Ability Slot's used-flag). Any dice still resting on Ability Slots return to your supply. Ward refreshes.
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

Because this is subset-based rather than tier-based, some rolls legitimately satisfy several different requirements at once — a Yahtzee, for instance, contains a genuine Pair, Three of a Kind, and Four of a Kind within it (any 2, 3, or 4 of the five identical dice), so it can trigger all of those cards' Combo bonuses simultaneously along with its own. It does **not** satisfy Two Pair, since that specifically requires two pairs of *different* values, and five identical dice only offer one value. This is intentional — a great roll paying off multiple cards at once is the reward for hitting one.

Combo checks only ever read **your own** roll and can only trigger cards **you** control, unless a specific card's text says otherwise.

---

## 7. Casting & Activating

Every non-Leader card prints a **Cast Slot** (threshold 1–6). A die of that value or higher, placed there, brings the card into play or resolves it immediately.

Cards in play may print one or more **Ability Slots** — repeatable thresholds. **Exhaustion is tracked per Ability Slot**, not per card: a card with two different Ability Slots can have both activated in the same turn, each once. However, **activating any Ability Slot and attacking are mutually exclusive on the same Unit in the same turn** — a Unit that has used an Ability Slot this turn cannot also attack this turn, and vice versa.

- **Default is one Cast Slot per card**, unless it has Twin.
- A Location entering play replaces whatever Location you currently control, sending the old one to Discard. **You may not cast a Location sharing a name with the one you control, and you may cast at most one Location total per turn** — this second restriction closes a loophole where alternating between two differently-named Locations could otherwise reset an Ability Slot repeatedly in one turn.

### Combo-gated Events
Some Events have no numeric threshold — their entire cost is "Combo: [Pattern]." Casting one still requires placing one of your five dice onto it during Placement Phase (any value — only your live roll qualifying matters).

### Twin cards and the Staging Zone
A Twin X card has two Cast Slots. The moment the first is filled, move it face-up into your Staging Zone. **The second die placed must show the exact same face value as the first** — not merely independently meet the printed threshold. The card isn't in play while staged (can't be attacked or targeted) and can sit there across turns. The moment the second slot is filled, it fully enters play, both resting dice immediately return to your supply, and its bonus triggers. Every card with Twin must print its own bonus effect text (e.g. "Twin 1: Draw a card") — Twin has no generic effect on its own.

**Voluntary abandonment:** at the start of any of your turns, before Draw Phase, you may abandon a partially-filled Twin card: return it to your hand and clear its resting die.

### Anchor
Anchor counts only cards you control **already in play**, never cards in hand. Only reduces Cast Slot thresholds, never Ability Slots. *Design constraint:* Anchor provides no benefit on a card already printed at threshold 1, since that's the minimum possible.

---

## 8. Combat Rules

Combat uses a **targeted-attack model**. Attacks are **declared and resolved one at a time**, in an order the attacker chooses — not declared as a batch. This matters directly for Guard: if an earlier attack this Combat Phase destroys the last Guard Unit, later attacks in the same phase are immediately free to target elsewhere.

1. The active player picks one of their eligible Units (not exhausted — see §7) to attack, and declares its target: the defending Leader, or a defending Unit.
2. **Guard:** while the defending player controls at least one Guard Unit, the target must be a Guard Unit. Once none remain (all destroyed), later attacks this Combat Phase may target freely.
3. **Damage resolution** for this single attack:
   - Against the Leader: attacker's ATK is subtracted from Leader HP. **Leaders have no ATK and never deal or take retaliation damage** — attacking a Leader directly is entirely one-directional.
   - Against a Unit: attacker's ATK is subtracted from the target's HP, and simultaneously the target's ATK is subtracted from the attacker's HP. **ATK and HP are never treated as below 0** — a Unit with reduced ATK below 0 simply deals 0 damage, it never heals its target.
   - **Pierce:** Guard only restricts which target you may legally declare — once an attack against a Guard Unit is legal and declared, Pierce's overflow damage is a consequence of that already-legal hit, not a new target, and proceeds to the Leader normally regardless of Guard. The overflow amount is exactly the leftover damage (attacker's ATK minus what was needed to destroy the target) — never the attacker's full ATK. All of this (damage to target, retaliation to attacker, Pierce overflow) is calculated simultaneously off both units' stats the instant before the attack resolves — if the attacker is also destroyed by retaliation in this same exchange, its Pierce overflow still goes through.
   - **Ward:** only prevents damage from instances where this Unit is the one being attacked or targeted. It does not prevent retaliation damage a Unit takes as a result of an attack it declared — attacking is never "free" just because the attacker has Ward. Applied before any multiplier (see below).
4. Repeat for the next attacking Unit. **Frenzy** Units may go through this sequence twice in the same Combat Phase, but only if they survive their first attack; retaliation damage taken while attacking is doubled (see Damage Resolution Order).
5. Damage is **persistent** and does not reset at end of turn. Any Unit reaching 0 HP is destroyed immediately and moves to Discard, checked continuously.

**Design note on big stat-stick Units:** intentional, not a bug — Pierce, Sap, and direct-removal Events are the answer to a wall.

### Damage Resolution Order
Prevention effects (Ward) apply before multiplication effects (Frenzy). If Ward fully prevents an instance of damage, there's nothing left for Frenzy to double.

### HP maximums
A Unit's or **Leader's** maximum HP is always its printed/starting value, unless a card effect explicitly and permanently raises it. Mend can never heal past the current maximum.

---

## 9. Winning & Losing

You lose immediately if either is true:
- Your Leader's HP reaches 0.
- You are required to draw during your Draw Phase and your deck is empty.

**Simultaneous loss:** if a single effect would reduce both Leaders to 0 HP at the same time, or force both players to draw from empty decks at the same time, the game ends in a draw.

**Other "draw a card" effects (e.g. Surge)** never cause a loss — the empty-deck loss condition applies only to the mandatory Draw Phase; any other draw effect simply does nothing if your deck is empty.

---

## 10. Keyword Glossary

### Dice-interaction keywords

**Overflow X** — If the die placed on this card's slot exceeds its **effective threshold** (after reductions like Anchor, not necessarily the printed number) by X or more, trigger the listed bonus immediately.

**Combo: [Pattern]** — Triggers if your final five-die roll contains the exact named pattern as a genuine subset. See §6.

**Twin X** — Two Cast Slots requiring identical face values; see §7 for Staging Zone rules, matching rules, and the voluntary-abandon option.

**Rally** — Once per turn, when you would place a die on this card's Ability Slot, you may instead activate it using a die already resting on another exhausted friendly Ability Slot — this costs you nothing from your rolling pool; the source card remains exhausted regardless of the die moving away.

**Scrap** — Discard this card from hand to reroll one **unplaced** die of your choice, at any point during Placement Phase.

**Anchor** — This card's effective Cast Slot threshold is reduced by 1 (min. 1) for each other card you control in play with Anchor. See §7 for the printed-vs-effective interaction with Overflow.

### Combat keywords

**Guard** — See §8. While you control any Guard Unit, your opponent's attacks must target your Guard Units, resolved one at a time, until all are destroyed.

**Swift** — This Unit may attack **or** use an Ability Slot the turn it's cast (subject to the same mutual-exclusivity as any other turn — see §7). Without Swift, it can do neither until your next turn.

**Pierce** — See §8 for full interaction with Guard and simultaneous-death timing.

**Ward** — Prevents the first instance of damage or Removal against this card each turn, from being the one attacked or targeted — not from retaliation this Unit takes on its own attack. Applied before multipliers (§8).

**Frenzy** — May attack a second time in the same Combat Phase if it survives its first attack. Retaliation damage taken while attacking is doubled.

### Utility keywords

**Surge** — Draw a card. See §9 for the empty-deck interaction.

**Mend X** — Heal X HP to your Leader or a target friendly Unit, never past its maximum.

**Sap X** — Deal X damage directly to a target Unit or Leader.

**Bind** — Target Unit cannot attack or use an Ability Slot during its controller's **next** turn. (By design, this means self-targeting Bind does nothing on your current turn — it's built as a disruption tool against an opponent's upcoming turn, not a same-turn restriction, and self-targeting it is simply not useful rather than exploitable.)

**Echo** — After this card is discarded, for any reason (dying in combat, resolving as a Charm/Event, being replaced, or discarded for hand size — all of these count identically), it becomes eligible to be recast later from Discard: place a die meeting its normal Cast Slot threshold **and** discard one additional card from hand. *If the card is a Combo-gated Event with no numeric threshold*, its Echo cost instead mirrors the original casting requirement (your live roll must satisfy the named pattern; place any one die) plus the same additional-card discard. Recasting can only happen during a Placement Phase — if a card is discarded during your End Phase (e.g. for hand size), the earliest you can pay to recast it is a future turn's Placement Phase, never the same turn. This can be done once per physical card. The next time an Echoed card **would be discarded again**, it goes to the Banished Zone instead — this specifically replaces a discard event, not other zone changes; if a spent-Echo card is instead bounced to hand, it just goes to hand normally, and only banishes on its *next* discard after that.

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

**Leader** — your one persistent, non-deck card; 20 starting/max HP, one Ability Slot, no ATK, can never change zones.

**Location** — persistent field card; max one in play, max one cast per turn.

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
| Leader starting/max HP | 20, no ATK, cannot change zones |
| Deck size | 40 (Leader separate) |
| Max copies per card | 3 |
| Starting hand | 5 (one mulligan allowed, first player decides first, both execute together) |
| Hand size cap | 6 |
| Dice per turn | 5d6 from your own supply (10+ recommended total), one reroll of any subset |
| Locations in play | 1 max, 1 cast per turn max, no same-name replacement |
| Units in play | unlimited |
| First player | high 1d6 roll; skips first Draw Phase; can't attack their first turn |
| Combat | sequential targeted-attack, no blocking step; Guard walls until fully destroyed |

**Turn order:** Draw → Roll → Reroll → Placement (4 legal die destinations, Scrap on unplaced dice) → Combo Check → Combat (sequential) → End (discard to 6, clear exhaustion, pass turn).
