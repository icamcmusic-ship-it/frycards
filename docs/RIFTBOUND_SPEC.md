# Riftbound Conversion Spec (v5.0)

> **Status: shipped.** This was the implementation contract for the v4.x
> dice-placement → essence-based conversion; the conversion is complete and
> live. For the current player-facing rules, see
> [`docs/RULEBOOK.md`](RULEBOOK.md) — that's the canonical rules reference,
> kept in sync with the engine. This doc is retained only for the
> module-level implementation details (file/table contracts) not covered by
> the rulebook. "Riftbound" was the internal codename during conversion; the
> shipped game is **Fry Cards** — see `CHANGELOG.md`.

FryCards is converted from the v4.x dice-placement rules to the **Riftbound**
rulebook (essence-based TCG). This document is the implementation contract all
modules follow. Dice, Cast Slots, rolls, combos, and patterns are GONE.

## Terminology (rulebook glossary)

| Term | Meaning |
|---|---|
| Invoke | Play a spell from hand |
| Exhaust / Recover | Tap / untap |
| Deal | Draw a card |
| Shed | Discard |
| Shatter | Destroy (to Ash-pile) |
| Banish | Exile (to The Void) |
| Erode | Mill |
| Essence | Mana (produced by exhausting Locations) |
| Might / Grit | Power / Toughness |
| Vitality | Life total (starts at 20) |
| Clash | Combat |
| Guard | Block |
| Dawn / Dusk | Upkeep / End step |

## Essence types (the 7 colors)

`Ember, Tide, Root, Gale, Light, Shadow, Void`

| Type | Theme |
|---|---|
| Ember | Aggression, direct damage, haste (Reckless) |
| Tide | Card draw, bounce, tempo |
| Root | Big stats, essence ramp, growth |
| Gale | Evasion (Aerial/Alert), small fast units |
| Light | Protection, lifegain (Siphon), buffs |
| Shadow | Removal, Forfeit synergy, ash-pile recursion |
| Void | Banish effects, denial, high-cost payoffs |

A card's **color identity = the colored pips in its Essence Cost** (not derived
from keywords anymore). A card with zero colored pips is colorless — legal in
any deck. Leaders keep 2-color identities (`LEADER_COLORS`); deck legality:
every colored pip on every card must be inside the Leader's identity.

## Card types & subtypes

- **Unit** — Might/Grit, attacks and guards, carries keywords.
- **Location** — *Sanctum* subtype only in the collectible pool: exhausts for 1
  essence of its type AND carries a static/triggered ability. *Wellspring*
  (basic, essence-only) Locations are supplied automatically by the engine —
  they take no deck slots (digital adaptation; see Engine).
- **Charm** — bonds to a Unit. Subtypes: *Bound* (dies with the unit) and
  *Worn* (survives its unit; may re-bond for its re-bond cost).
- **Event** — Subtypes: *Quick* (any priority window) and *Slow* (own main
  phase only).
- **Leader** — one per deck, starts in the Leader zone, has **Resolve**
  (loyalty). Abilities cost Resolve; at 0 Resolve it is shattered. May be
  re-invoked as per rulebook (always available once affordable) — digital
  adaptation: once shattered it stays gone for the game.

## Keywords (KEYWORDS in keywords.ts — the only legal set)

Unit: Aerial, Overrun, Quickstrike, Doublestrike, Venomous, Siphon, Alert,
Reckless, Swarmproof, Skywatch, Warded, Unbreakable, Ambush, Immobile,
Regenerate, Hardened.
v6.0 type keywords — Event: Surge, Resonant · Charm: Runic, Soulbound ·
Location: Bountiful, Sacred · Leader: Commander, Resolute
(see `KEYWORD_TYPES` in keywords.ts and docs/RULEBOOK.md for semantics).

Semantics (rulebook §1/§6):
- **Aerial**: can only be guarded by Aerial or Skywatch units.
- **Overrun**: excess clash damage past a shattered guard hits the defender.
- **Quickstrike**: deals clash damage first; if the guard dies, takes none back.
- **Doublestrike**: deals quickstrike damage AND normal damage.
- **Venomous**: any damage it deals to a unit is lethal.
- **Siphon**: damage it deals also gains its controller that much Vitality.
- **Alert**: doesn't exhaust when attacking.
- **Reckless**: no summoning sickness (can attack the turn it enters).
- **Swarmproof**: must be guarded by 2+ units or not at all.
- **Skywatch**: may guard Aerial attackers.
- **Warded**: can't be targeted by opponent's effects.
- **Unbreakable**: can't be shattered; lethal damage doesn't kill it
  (damage still marks; it survives).
- **Ambush**: (Units) may be invoked in any priority window, incl. the
  opponent's clash — digital adaptation: invokable during the guard step.
- **Immobile**: can't attack.

## Engine (src/game/v3/engine.ts — rewritten in place)

- Two players; human vs AI. Starting Vitality **20**. Deck **at least 60**
  cards (rulebook §3; editor ceiling 100). Copy caps: C/U/R ≤4 (the
  rulebook max), SR/FA/UR ≤2, Mythic 1. Opening hand **7** (+1 for the
  second player); rulebook mulligan — repeatable, one card fewer each time.
- Win: opponent at 0 Vitality, or opponent must Deal from an empty deck.
- **Wellsprings**: once per turn during a main phase, a player may play one
  basic Wellspring (auto-supplied, any type in their Leader's identity, not
  from deck/hand). Sanctum Locations are invoked from hand for their Essence
  Cost and ALSO exhaust for essence.
- **Essence**: exhaust Locations to produce 1 essence of their type. Essence
  pool empties at end of each phase. Colored pips must be paid with matching
  essence; generic with anything.
- **Turn**: Dawn (recover all, "at Dawn" triggers, Deal 1 — first player
  skips the Deal on turn 1) → Main I → Clash → Main II → Dusk ("at Dusk"
  triggers, Shed to 7, pass).
- **Clash**: declare attackers (exhaust unless Alert; not exhausted, not
  Immobile, no summoning sickness unless Reckless) → defender assigns guards
  (respect Aerial/Skywatch/Swarmproof) → human gets a reaction window (Quick
  Events / Ambush units) → simultaneous damage with
  Quickstrike/Doublestrike sub-steps; unguarded attackers hit the defending
  player's Vitality; Overrun spillover.
- **State-based checks**: lethal damage / 0 grit → shatter (unless
  Unbreakable); vitality ≤0 or empty-deck Deal → loss; illegal bonds detach.
- **Queue**: digital simplification — no full player-vs-player stack; Quick
  Events resolve immediately; the defender's reaction window in Clash is the
  interactive moment.

## Effects (cards.ts `Effect`)

Actions: `damage | heal | draw | buff | shatter | banish | erode | recover | bond`
(with `value` and `target` as before; `sap→damage`, `mend→heal`,
`destroy→shatter`; `bind` is removed).

## Cost model

```ts
interface EssenceCost { generic: number; pips: Partial<Record<EssenceType, number>> }
totalCost = generic + sum(pips)   // "total essence value"
```

Cost curve targets by rarity tier rt (0..6): total 1–7, roughly rt-correlated
with hash spread; units follow might+grit ≈ 2*(total − keyword surcharge)
± spread — the keyword surcharge is a PURE cost adder and must never feed
the stat budget (v5.1 fix; see keywords.ts `KEYWORD_COST`).

## Card pool (cardpool.ts)

Same philosophy as before: universal identity from the catalog (Supabase
`cards` table / generated-cards.ts fallback), mechanics assigned
**deterministically** from a hash of id+type+rarity. Assigns: essence cost
(colored pips chosen from 1–2 types via hash, themed by keyword fit), subtype,
might/grit, keywords (themed by color per the table above), effects, Leader
resolve + abilities. Exports keep their names: `POOL_V4`, `POOL_BY_ID`,
`POOL_LEADERS`, `poolByType`, `applyCardPool`. cardpool must NOT import
engine.ts.

## Database (Supabase `public.cards`)

New columns: `essence_type text`, `essence_cost jsonb`, `might int`,
`grit int`, `card_subtype text`, backfilled from the deterministic pool.
`template` jsonb stays the universal-identity source of truth for clients.

## Card template (CardFaceV4.tsx)

Keep the exact card dimensions and both art treatments (regular framed art +
Full-Art). Replace the dice/Cast-Slot cost UI with an **essence cost row**
(colored pips + generic numeral) top-left; Might/Grit gems replace ATK/HP;
type line shows `Type — Subtype`; keyword chips from the new keyword set;
Leaders show Resolve.
