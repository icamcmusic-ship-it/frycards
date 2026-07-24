# FRY CARDS Rulebook v5.1

Fry Cards plays under an essence-based trading card game ruleset (v5,
formerly codenamed "Riftbound"). This document is the paper rulebook adapted for the digital
client; digital adaptations are marked **[digital]**.

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
| Unbreakable | Can't be shattered or dealt lethal damage |
| Ambush | Can be invoked at any time, even outside your main phase |
| Immobile | Can't attack |

### Zones

Field (permanents in play) · Ash-pile (discard) · Deck · Hand · The Void
(banished cards) · Leader zone.

## 2. Card Types

- **Unit** — has Might (power) and Grit (toughness); attacks and guards.
- **Location** — exhausts to produce Essence.
  - *Wellspring* — essence only. **[digital]** Basic Wellsprings take no
    deck slots: once per turn you may play one basic Wellspring of any
    Essence Type in your Leader's identity.
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
- **[digital]** Decks are 30 cards (adaptation of the paper 60-card rule),
  with per-rarity copy caps: Common/Uncommon/Rare up to 3, Super-Rare /
  Full-Art / Ultra-Rare up to 2, Mythic 1.
- **[digital]** Opening hand: 5 cards; the second player draws a 6th card
  to offset the first-mover advantage (adaptation of the paper 7-card
  hand + mulligan rule; the CPU takes one automatic mulligan on a hand
  with no cheap plays or no units).

## 4. Turn Structure

1. **Dawn Phase** — Recover all your exhausted permanents; "at Dawn"
   triggers; Deal one card (the first player skips this on turn 1).
2. **Main Phase I** — Invoke Units, Charms, Events, Sanctums, or your
   Leader; play one basic Wellspring (once per turn).
3. **Clash Phase** — Declare attackers (they exhaust unless Alert) →
   defender assigns guards → clash damage, simultaneous unless
   Quickstrike/Doublestrike changes the timing.
4. **Main Phase II** — as Main Phase I.
5. **Dusk Phase** — "at Dusk" triggers; Shed down to 7 cards; pass.

## 5. Essence & Invoking

- Exhaust a Location to produce one Essence of its type.
- A cost's colored pips must be paid with matching Essence; the generic
  part with any Essence. Unspent Essence empties at the end of each phase.
- Slow Events, Charms, Sanctums, and Leaders: own main phases only.
  Quick Events and Ambush cards: any priority window — **[digital]** in this
  client that means your main phases plus the guard-step reaction window of
  either player's Clash Phase.

## 6. Combat

- Only recovered, non-Immobile units without summoning sickness (unless
  Reckless) may attack. Attacking exhausts the unit unless it has Alert.
- Unguarded attackers deal their Might to the defender's Vitality.
- Swarmproof attackers must be guarded by 2+ units or not at all. Aerial
  attackers can only be guarded by Aerial or Skywatch units.
- Venomous damage is lethal regardless of amount; Overrun sends excess
  damage past shattered guards through to the defending player; Siphon
  converts damage dealt into Vitality.

## 7. Death, Removal & State-Based Checks

Before any player acts, the game automatically checks: 0-or-less Vitality
loses; Dealing from an empty deck loses; lethal damage (or 0 Grit)
shatters a unit (Unbreakable survives); illegally bonded Charms unbond.

## 8. Essence Identity (the seven colors)

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

## 9. Triggered ability wording

"**Whenever**" = repeatable trigger · "**When**" = one-time (enters/leaves
the field) · "**At**" = phase trigger ("At Dawn", "At Dusk").

## Quick reference

| Phase | What happens |
|---|---|
| Dawn | Recover, triggers, Deal one card |
| Main I | Invoke spells, play one Wellspring |
| Clash | Attack, guard, deal damage |
| Main II | Invoke spells |
| Dusk | Triggers, shed to 7, pass turn |
