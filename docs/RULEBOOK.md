# FRY CARDS Rulebook v6.0

Fry Cards plays under an essence-based trading card game ruleset (v6,
formerly codenamed "Riftbound"). This document is the paper rulebook adapted
for the digital client; digital adaptations are marked **[digital]**.

## 1. Glossary of Terms

### Core actions

| Term | Meaning |
|---|---|
| Invoke | Play a spell from hand |
| Exhaust | Turn a card sideways to use its ability or pay a cost |
| Recover | Return a card to an upright, ready state |
| Deal | Take a card from your deck (draw) |
| Shed | Put a card from hand into the ash-pile (discard) |
| Forfeit | Put your own permanent into the ash-pile as a cost |
| Shatter | Send a permanent to the ash-pile (destroy) |
| Banish | Remove a card from the game (to The Void) |
| Erode | Put cards from deck to ash-pile without drawing (mill) |
| Bond | Link a Charm to a unit (attach) |

### Keyword abilities

Unit keywords (rulebook §1):

| Keyword | Meaning |
|---|---|
| Aerial | Can only be guarded by other Aerial or Skywatch units |
| Overrun | Excess clash damage carries through to the defending player |
| Quickstrike | Deals damage before normal clash damage |
| Doublestrike | Deals both quickstrike and normal damage |
| Venomous | Any damage dealt is lethal |
| Siphon | Damage dealt also gains you that much Vitality (never above 20) |
| Alert | Doesn't exhaust when attacking |
| Reckless | Can act the turn it enters the field |
| Swarmproof | Must be guarded by two or more units |
| Skywatch | Can guard Aerial units |
| Warded | Can't be targeted by an opponent |
| Unbreakable | Once per turn, prevent the first effect that would shatter this or deal it lethal damage |
| Ambush | Can be invoked at any time, even outside your main phase |
| Immobile | Can't attack |
| Regenerate | At Dawn, heal all damage marked on this unit |
| Hardened | Damage dealt to this unit is reduced by 1 |

**v6.9:** one new Unit keyword per Essence Type:

| Keyword (Essence Type) | Meaning |
|---|---|
| Wildfire (Ember) | When this unit dies, deal 2 damage to the enemy player |
| Tidecaller (Tide) | Whenever this unit deals clash damage, Deal a card |
| Thriving (Root) | At your Dawn, this unit gets +1/+1 permanently |
| Nimble (Gale) | Can only be guarded by units with strictly less Might |
| Radiant (Light) | At your Dawn, restore 1 Vitality |
| Withering (Shadow) | Clash damage this deals to a unit permanently reduces that unit's Grit by 1 |
| Entropic (Void) | At your Dusk, the enemy erodes 1 |

Wildfire and Withering fire on banish as well as shatter, and a Charm that
grants either still grants it at the moment its bearer leaves the field.
Withering's Grit loss is permanent: unlike marked damage, healing does not
restore it, and a unit withered to 0 Grit is shattered by the state checks.

**v6.0:** every other card type has its own keyword pair:

| Keyword (type) | Meaning |
|---|---|
| Surge (Event) | Costs 1 less if you already invoked another card this turn |
| Resonant (Event) | Its effect resolves twice |
| Runic (Charm) | When it bonds to a unit from your hand, Deal a card |
| Soulbound (Charm) | When the bonded unit leaves the field, return this Charm to your hand |
| Bountiful (Location) | Exhausts for 2 essence instead of 1 |
| Sacred (Location) | At your Dawn, restore 1 Vitality |
| Commander (Leader) | While your Leader is on the field, your units get +1 Might |
| Resolute (Leader) | At your Dawn, your invoked Leader recovers 1 Resolve (up to its printed value) |
| Echoing (Event) | When this Event resolves, Deal a card |
| Ritual (Event) | Costs 1 less if you control 3 or more Sanctums |
| Empowering (Charm) | At your Dawn, the bonded unit gets +1/+0 permanently |
| Tethered (Charm) | When this Charm bonds to a unit from your hand, recover that unit |
| Bulwark (Location) | Damage dealt to you is reduced by 1 |
| Blighted (Location) | At your Dusk, the enemy erodes 1 |
| Archivist (Location) | At your Dawn, Deal a card if you control 3 or more Sanctums |
| Warlord (Leader) | While your Leader is on the field, your units get +0/+1 |

**v7.5:** six more, filling the colours each type still had nothing printable
in — Events had no Shadow or Void text, Charms none in Tide or Light,
Locations none in Ember or Gale:

| Keyword (type — Essence Type) | Meaning |
|---|---|
| Fate (Event — Void) | When this Event resolves, banish the top card of the opponent's deck |
| Exhume (Event — Shadow) | When this Event resolves, return a Unit from your ash-pile to your hand |
| Freeze-Dry (Charm — Tide) | When this Charm bonds to a unit from your hand, exhaust a target enemy unit |
| Blessed (Charm — Light) | When this Charm bonds to a unit from your hand, restore 3 Vitality |
| Scorched-Earth (Location — Ember) | At your Dusk, if you control 3 or more Sanctums, deal 1 damage to each enemy unit |
| Glaciate (Location — Gale) | At every other Dawn, exhaust a target enemy unit |

Fate and Erode are deliberately different sizes of the same idea: Erode puts
the card in the ash-pile, where Exhume and the rest of Shadow can still reach
it, and Fate puts it in The Void, where nothing can. Exhume returns Units
only — it cannot return itself or any other Event.

Scorched-Earth and Glaciate stack, but each is bounded. Scorched-Earth's sweep
needs three Sanctums — the same threshold Ritual and Archivist use — and two
copies then sweep for 2. Glaciate rests every second Dawn, and each Sanctum
keeps its own counter, so two of them freeze one unit per turn between them
rather than two units every other turn. A Glaciate Sanctum fires on the first
Dawn after it arrives.

### Zones

Field (permanents in play) · Ash-pile (discard) · Deck · Hand · The Void
(banished cards) · Leader zone.

## 2. Card Types

- **Unit** — has Might (power) and Grit (toughness); attacks and guards.
- **Location** — exhausts to produce Essence.
  - *Wellspring* — essence only. **[digital]** Basic Wellsprings take no
    deck slots: once per turn you may play one basic Wellspring of any
    Essence Type in your Leader's identity (the rulebook's "unlimited basic
    Wellspring copies" exception, digital form).
  - *Sanctum* — produces essence AND carries an ability; invoked from hand.
- **Charm** — bonds to a unit.
  - *Bound* — stays; goes to the Ash-pile if its unit leaves the field.
  - *Worn* — survives its unit and may re-bond to another unit later by
    paying its re-bond cost.
- **Event** — resolves once, then Ash-pile.
  - *Quick* — invokable any time you have a priority window.
  - *Slow* — own main phases only.
- **Leader** — one per deck, starts in the Leader zone, always available to
  invoke once you can afford it. Has **Resolve** instead of Might/Grit; its
  abilities cost (or build) Resolve; at 0 Resolve it is shattered.

## 3. Objective & Setup

- Reduce your opponent's **Vitality from 20 to 0**, or force them to Deal
  from an empty deck. Vitality can never rise above 20.
- Decks are **at least 60 cards** with **no more than 4 copies of any
  card** (rulebook §3). **[digital]** the editor caps decks at 100 cards,
  and premium rarities carry stricter economy caps: Super-Rare / Ultra-Rare /
  Full-Art up to 2, Alt-Art / Mythic 1.
- Opening hand: **7 cards** for both players. **[digital]** the second player
  instead offsets the first-mover advantage on their opening turn, when they
  may play **two** basic Wellsprings — the second one enters **exhausted**,
  so it ramps them into turn 2 rather than handing them a turn-1 swing.
  (Sims located the first-mover edge as a *tempo* lead that decays in long
  games, so the previous 8th-card compensation was on the wrong axis and
  measured worth under a point.)
- **Mulligan** (rulebook §3): before the first turn you may shuffle your
  hand back into your deck and draw **one card fewer** — repeatable
  (7 → 6 → 5 → …). **[digital]** the CPU mulls once on a hand with no
  cheap plays or no units.

## 4. Turn Structure

1. **Dawn Phase** — Recover all your exhausted permanents; Regenerate units
   heal; Sacred Locations, Archivist Sanctums and Resolute Leaders tick;
   Empowering Charms grow their bonded unit; "at Dawn" triggers;
   Deal one card (the first player skips this on turn 1).
2. **Main Phase I** — Invoke Units, Charms, Events, Sanctums, or your
   Leader; play one basic Wellspring (once per turn — the second player gets
   two on their opening turn, see §3).
3. **Clash Phase** — Declare attackers (they exhaust unless Alert) →
   defender assigns guards → a priority round both players may act in (§6) →
   clash damage, simultaneous unless Quickstrike/Doublestrike changes the
   timing.
4. **Main Phase II** — as Main Phase I.
5. **Dusk Phase** — "at Dusk" triggers; Shed down to 7 cards; pass.

## 5. Essence & Invoking

- Exhaust a Location to produce one Essence of its type (two for
  Bountiful Sanctums).
- A cost's colored pips must be paid with matching Essence; the generic
  part with any Essence. Unspent Essence empties at the end of each phase.
- Surge Events cost 1 less once you have invoked another card this turn.
- Ritual Events cost 1 less while you control three or more Sanctums. "Sanctum"
  means a Location CARD — basic Wellsprings are not Sanctums and never count
  toward Ritual or Archivist.
- A card carrying both Surge and Ritual still discounts only once.
- Slow Events, Charms, Sanctums, and Leaders: own main phases only, and only
  with the stack empty (see §6).
- Quick Events and Ambush cards: any priority window — your main phases, the
  guard-step reaction window of either player's Clash Phase, and any window
  you hold while something waits on the stack.

## 6. The Stack & Priority

Nothing takes effect the instant it is played. An invoked card or a triggered
ability goes on **the stack** and waits there while both players get a chance
to respond.

- **Order of priority is APNAP** — Active Player, then Non-Active Player. The
  player whose turn it is always speaks first in a round.
- **Both players passing in succession** resolves the top item of the stack —
  **last in, first out**, so a response resolves *before* the thing it
  answers. With an empty stack, passing simply closes the window.
- **Only instant-speed cards can be played into an open stack**: Quick Events
  and Ambush units. Everything else waits for your own main phase with the
  stack empty.
- **Targets are re-checked on resolution.** If the target is gone or has
  become illegal (a unit that died in response, or one that gained Warded),
  the item **fizzles**: an Event does nothing and still goes to the Ash-pile,
  a Unit still enters the field and loses only its rider, and a Charm whose
  host is gone goes to the Worn row (Worn) or the Ash-pile (Bound).
- **Steps with no response window**: combat damage, Dawn and Dusk. Anything
  put on the stack inside them resolves before the step continues.

**[digital]** Two simplifications in this client. First, you answer your
opponent's cards and triggers, not your own — there is no chaining a second
card in response to your own. Second, a player holding nothing they could
legally respond with is passed for automatically, so a board with no
instant-speed cards plays exactly as it did before the stack existed.

You may exhaust Locations for Essence in any window where you hold priority,
not only in your own main phase — an answer you cannot pay for is no answer.

## 7. Combat

- Only recovered, non-Immobile units without summoning sickness (unless
  Reckless) may attack. Attacking exhausts the unit unless it has Alert.
- Unguarded attackers deal their Might to the defender's Vitality.
- Swarmproof attackers must be guarded by 2+ units or not at all. Aerial
  attackers can only be guarded by Aerial or Skywatch units. Nimble
  attackers can only be guarded by a unit with strictly less Might.
- **Blocked is blocked.** Once an attacker has been assigned at least one
  guard, it deals no damage to the defending player even if every one of its
  guards leaves the field before damage resolves — whether they died to
  first-strike damage or were removed during the reaction window, by either
  player. Only Overrun spills, and only the excess past whatever its guards
  actually absorbed.
- Venomous damage is lethal regardless of amount; Overrun sends excess
  damage past shattered guards through to the defending player; Siphon
  converts damage dealt into Vitality; Hardened shaves 1 off every damage
  packet (a fully-absorbed hit applies no Venom and feeds no Siphon).

## 8. Death, Removal & State-Based Checks

Before any player acts, the game automatically checks: 0-or-less Vitality
loses; Dealing from an empty deck loses; lethal damage (or 0 Grit)
shatters a unit (an Unbreakable unit with its once-per-turn save still
unspent survives instead, and the damage is prevented); illegally bonded
Charms unbond.
When a unit leaves the field, its Bound Charms go to the Ash-pile, Worn
Charms stay on the field unbonded, and Soulbound Charms return to their
owner's hand.

**Effect vocabulary.** Card and Leader abilities are written from a fixed
set of actions: *deal damage*, *heal*, *Deal* (draw), *buff* (+X/+X),
*shatter*, *banish*, *erode* (mill), *recover* (ready a friendly unit), and
as of v6.9 *exhaust* and *weaken*.

- **Exhaust** taps a target enemy unit. It cannot attack on its controller's
  turn or guard on yours until it recovers at their next Dawn. Exhausting an
  already-exhausted unit does nothing.
- **Weaken** gives a target enemy unit -X/-X permanently. Derived Might and
  Grit never fall below 0, and a unit weakened to 0 Grit is shattered by the
  state-based checks above. Like Withering, this is not damage: healing does
  not undo it.

## 9. Essence Identity (the seven colors)

| Essence Type | Theme |
|---|---|
| Ember | Aggression, direct damage, haste |
| Tide | Card draw, bounce, tempo |
| Root | Big stats, essence ramp, growth |
| Gale | Evasion (Aerial/Alert), small fast units |
| Light | Protection, lifegain (Siphon), buffs |
| Shadow | Removal, Forfeit synergy, ash-pile recursion |
| Void | Banish effects, denial, high-cost payoffs |

A card's color identity is the colored pips in its Essence Cost. Deck
legality: every colored pip must fall within your Leader's two-color
identity; colorless cards fit any deck.

## 10. Triggered ability wording

"**Whenever**" = repeatable trigger · "**When**" = one-time (enters/leaves
the field) · "**At**" = phase trigger ("At Dawn", "At Dusk").

## Quick reference

| Phase | What happens |
|---|---|
| Dawn | Recover, Regenerate/Sacred/Resolute/Archivist/Empowering, triggers, Deal one card |
| Main I | Invoke spells, play one Wellspring |
| Clash | Attack, guard, priority round, deal damage |
| Main II | Invoke spells |
| Dusk | Triggers, shed to 7, pass turn |
