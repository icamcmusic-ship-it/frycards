# Shifting Multiverse TCG — Rules Bible (Comprehensive Rulebook V1.6)

This document is the **authoritative rules reference** for the digital
implementation. The engine (`src/game/engine.ts`) is the executable version of
this text; every rule below is enforced server-side by the reducer, and every
numbered law has regression coverage in `scripts/engine-tests.ts`. The in-game
"How to Play" panel (`src/components/HowToPlay.tsx`) is a condensed view of
this document.

---

## §1 Objective & Setup

### §1.1 Decks
- A deck is exactly **30 cards** plus a **Leader**.
- Max **2 copies** of any card.
- Every card's colored costs must be payable by the Leader's two elements
  (Generic costs are colorless and payable by anything).

### §1.2 Setup sequence
1. Leaders are revealed. Your Leader's printed health is your life total.
2. **2 Location cards** are pulled from each deck into that player's face-down
   Location Zone (max zone size 3 — additional Locations can be set from hand
   later).
3. Each player draws **5**.
4. **London Mulligan**: you may shuffle your hand back and redraw 5, any
   number of times. When you keep, you must put **1 card per mulligan taken**
   on the bottom of your deck.
   - *Server authority:* exactly X cards go to the bottom regardless of what
     the client submits. Invalid or duplicate card ids are ignored and the
     shortfall is topped up from the back of the hand. Mulligan actions are
     rejected outside the Mulligan phase, and a kept hand is locked.
5. A **coin toss** decides who goes first. The first player **skips their
   Turn-1 draw**, and **nobody may attack on Turn 1**.

### §1.3 Win & loss
- You win when the enemy Leader's health reaches 0.
- **Simultaneous KO Law:** if both Leaders hit 0 in the same instant, the
  **active player loses** (they initiated the destruction).
- **Deckout Law:** any failed draw (empty deck) deals **2 damage** to your
  Leader instead of drawing. This applies to the Draw Phase, `draw` effects,
  Rummage and Discord draws alike.

---

## §2 Turn structure

Each turn runs: **Start of Turn → Resource Roll → Allocate → Draw → Action →
Cleanup**. The exact ordering *within* each step is fixed and is the game's
"stack": effects resolve in the order listed here, never simultaneously.

### §2.1 Start of Turn (in order)
1. The active player's **unspent resources are cleared** (resources persist
   through the *opponent's* turn, clearing only at the start of your own).
2. **Location Shell Game:** one random face-down Location of the
   **opponent's** is flipped. It is active for the whole turn, with the
   **active player as its controller** (Symmetric Locations serve both
   players). It flips back face-down at end of turn.
3. **Hatchling** on the revealed Location seeds tokens for its controller
   (both players if Symmetric).
4. **Sustain** heals the active player's Units and Leader.
5. **Scorch** ticks: the active player's scorched Units and Leader take their
   Scorch damage. *Keyword uniformity:* this runs the standard damage
   pipeline (§5.4) for Units **and** the Leader — Armor, Brittle and Taint
   all apply.
6. A revealed **SCORCH_ALL** Location singes every Unit for 1.
7. Dormant **Charms** on the active player activate.
8. **Discord** sources each roll the dice of fate (resource / draw / 1 Leader
   damage).
9. Death sweep + win check (§5.5).

### §2.2 Resource Roll & Allocation
1. Roll a d6 (the *natural* roll).
2. **Photosynthesis:** an even natural roll grants +1 Nature per active source.
3. **Confluence** on the active Location grants its controller Generic
   resources.
4. **Flourish** grants Nature per active source.
5. **Boost** adds to the roll (Leader, controlled active Location, active
   Charms).
6. The **Overclock penalty** from last turn is subtracted (floor 0).
7. **Fix [Element]** auto-allocates 1 point per source.
8. The remainder is allocated freely among the **Leader's elements only**.
   The whole roll must be allocated at once; unallocated points are
   forfeited. *Server authority:* allocations to illegal elements or beyond
   the roll are ignored.
9. **Pure check:** after allocation, if exactly one non-Generic color is lit
   in your pool, your Pure cards are empowered this turn. (Carried-over
   colors from last turn count against this — Pure rewards a genuinely
   mono-colored pool, not just a mono-colored roll.)
10. **Decay** Charms on the active player damage all their Units (after the
    roll, before the draw).
11. **Draw 1** (skipped by the first player on Turn 1; Deckout Law applies).
12. The active player's cards **ready**: exhaustion, summoning sickness,
    per-turn ability uses, attack counts and Command marks all reset.

### §2.3 Action Phase
In any order, repeatedly:
- **Deploy Units** (paying costs; Efficient discounts apply, Rally/Inspire
  buff on arrival, Sync pays out).
- **Set Locations** face-down (Location Zone cap: 3).
- **Attach Items** to friendly Units with free capacity (base 2; Modularity
  raises it). If capacity ever shrinks below the number of attached Items,
  the **oldest** excess Items are destroyed.
- **Play Charms** — protective/utility Charms attach to you; hostile (Decay)
  Charms attach to the opponent. Charms sit dormant until the affected
  player's next turn begins.
- **Cast Events** (targeting laws §4 apply), then the Event goes to the
  graveyard.
- **Activate abilities** — once per card per turn; paying the card's printed
  cost; Freeze and Glitch lock abilities.
- **Leader Command [X]:** pay X to instantly ready a friendly Unit (clears
  exhaustion, summoning sickness and one attack mark).
  **Command Cap:** each Unit may be Commanded **only once per turn**. (This
  cap is what prevents Command + Surge from looping infinitely.)
- **Declare combat** (§5) — any number of separate assault waves per turn,
  limited by your Units' attack counts.
- **Graveborn** Units may be deployed from the graveyard for their cost; they
  re-enter play as a clean copy (no damage, statuses, Items or combat
  history) with summoning sickness unless they have Blitz.

### §2.4 Cleanup (end of turn, in order)
1. **Charms** affecting the current player tick down 1; expired Charms leave
   (Detonate fires against the charm caster's enemies) and go to their
   **owner's** graveyard.
2. **Overdrive** self-damage (2, bypassing Armor) for Units that attacked
   twice.
3. **Overcharge** upkeep is auto-paid per Item if affordable; unpaid
   Overcharge Items burn out (are destroyed).
4. **Scorch counters** on the current player's cards tick down 1.
5. **Freeze** on the current player's cards ticks down 1.
6. **Glitch** on the current player's cards wears off. (A Unit Glitched
   during the enemy's combat therefore stays disabled through its
   controller's whole next turn.)
7. Temporary buffs (`+X/+X until Cleanup`), **Taint**, and unused
   **Efficient** discounts expire.
8. **Hand limit:** discard down to 7 (most recently drawn first).
9. The active Location flips back face-down.
10. Death sweep + win check.

---

## §3 Card types

| Type | Zone | Notes |
|---|---|---|
| Leader | Command Zone | Life total; can attack and be attacked; may hold keywords and an activated ability. |
| Unit | Battlefield | Fights. Summoning sickness unless Blitz. |
| Item | Attached to a friendly Unit | Grants stats/keywords. Capacity Law §2.3. |
| Event | One-shot → graveyard | Resolves its effect (§4). |
| Charm | A player's profile | Dormant until the affected player's next turn; lasts 1–3 of their Cleanups. |
| Location | Location Zone (face-down) | Flipped by the **opponent's** Shell Game (§2.1). |

Tokens (Manifest, Hatchling) are real Units on the battlefield, but they
**vanish** when they leave it — they never enter the graveyard, and Items
attached to a dying token are still saved to the graveyard.

---

## §4 Targeting & priority laws

Resolved in this exact order when a card or ability is aimed at something:

1. **Legality** — `friendly`-target effects may only be aimed at your own
   Units; Items only at friendly Units with free capacity; attacks only at
   enemy targets. Illegal casts are **rejected outright with no cost paid**.
2. **Lurk** — an enemy Unit with Lurk that has never attacked cannot be
   targeted (suppressed while it has Guard).
3. **Guard** — while the defender has a **ready, unfrozen** Guard Unit,
   targeted enemy Events/abilities and all attacks must aim at a Guard Unit
   (Leader-aimed effects included). Wildcast is untargeted and ignores Guard.
4. **Ward [X] / Beacon** — targeting an enemy card costs X extra Generic
   (printed Ward plus the defender's Beacon aura). If you cannot pay the
   combined cost, the cast is rejected before anything is spent.
5. **Feedback** — after costs are paid, the targeted enemy rolls a d6; on
   4–6 the effect is negated and **exactly** what was spent is refunded (the
   same colored pools the cost was drained from, Ward and Glacier surcharges
   included). A negated Event returns to hand; a negated Graveborn cast
   returns to the graveyard; a negated ability is not marked as used.
6. **Resolution** — the effect resolves (§4.1).

Untargeted effects (Wildcast, `leader`-target damage with no explicit target,
hostile Charms) still "target" for the purposes of Guard, Ward and Feedback
where a specific enemy card is implicitly chosen — the enemy Leader for
`leader`-target Events and Decay Charms.

### §4.1 Event verbs
- **damage X** — standard pipeline (§5.4).
- **freeze** — target cannot attack, block or use abilities until the end of
  its controller's next full turn.
- **scorch X** — adds X Scorch counters.
- **heal X** — removes X damage from your Leader (never above printed max).
- **draw X** — Deckout Law applies per failed draw.
- **obliterate** — destroys a Unit outright: bypasses Armor, death triggers
  and the damage pipeline.
- **meltdown** — destroys the target Unit's **oldest attached Item**, then
  deals the Item's total printed cost to the host as Flame damage.
- **purge** — strips a target of all Items, statuses, counters and temporary
  buffs. Purging a **Leader** additionally removes **all Charms** from that
  player (hostile and beneficial alike).
- **manifest X** — creates an X/X token.
- **buff X** — +X/+X until Cleanup.
- **Pure** Events add +2 to their value when your pool is mono-colored (§2.2.9).
- **Echo** Events duplicate on a d6 of 5–6 with a random legal target.
- **Wildcast X** Events pick X unique random battlefield targets themselves
  (Leaders included; enemy Lurk still protects).

---

## §5 Combat

### §5.1 Declaration
- Attacks are declared as one **assault wave**: each attacker names the enemy
  Leader or an enemy Unit. Multiple waves per turn are legal.
- Eligible attackers: no summoning sickness, not Frozen, attack > 0 is not
  required but pointless, and attack count below the cap (1; **2 with
  Overdrive**).
- **Burden [X]** Items surcharge each attack declaration; the whole wave's
  surcharge must be affordable, and it is paid on submission.
- **Lurk** targets cannot be named. Naming a Guard is mandatory while one is
  ready (§4.3).
- **Leader Survival Caveat:** the game refuses a Leader attack declaration
  whose expected counter-damage (from the declared target, or the Guard that
  would intercept) would kill your own Leader.
- Submitting a wave **exhausts** the attackers, marks their attack count, and
  permanently lifts Lurk on them.

### §5.2 Blocking
- The defender assigns **ready, unfrozen** Units as blockers. Blocking does
  **not** exhaust.
- Each blocker blocks exactly one attacker; several blockers may gang up on
  one attacker.
- Attacking **Leaders can be blocked**; they take every blocker's full
  counter-damage.
- If the defender controls no possible blocker, the wave resolves
  immediately.

### §5.3 Resolution (per attacker, in declared order)
**Blocked:** the attacker's damage is assigned across its blockers in
declared order — each blocker is assigned just enough to chew through its
Armor + remaining health before the next gets any. Every blocker deals its
full counter-damage (plus **Vengeance [X]** — Vengeance triggers only on a
declared block, never on a passive Guard redirect). If the attacker dies
mid-wave, later blockers in *its* assignment stop, and later attackers in
the wave still resolve. **Pierce** sends unassigned overflow to the
defending Leader if the attacker survived.

**Unblocked:**
- A target already destroyed earlier in the wave → the attack **fizzles**
  (no damage either way; attacker stays exhausted).
- **Guard Interlock:** a surviving ready Guard intercepts any attack aimed
  elsewhere.
- Unit vs Unit / Leader vs Unit: full damage both ways.
- Unit vs Leader: full damage, **no counter-damage** (Leaders don't counter
  Units).
- **Leader vs Leader:** attacker deals **half damage rounded down (min 1)**
  and takes the defending Leader's **full** counter-damage.

On-combat-damage triggers, in order: **Wither → Glitch → Taint → Inferno →
Surge**, then **Siphon** (heal half the damage dealt to enemies, rounded up)
and **Reap** (on kill, heal the victim's printed attack).

### §5.4 The damage pipeline (single source → single card)
Applied in this exact order — this is the answer to every "which applies
first?" question:

1. **Brittle** doubles the incoming damage.
2. **Taint [X]** adds +X (after doubling: a Brittle+Tainted card takes
   `2·D + X`).
3. **Armor:** if the result is ≤ total Armor (printed + Item-granted), the
   hit is fully absorbed and Armor is untouched. If it is greater, **all**
   Armor shatters permanently (Armor Break — printed and Item Armor alike)
   and the remainder continues.
4. **Stripping Rule:** remaining damage fills bonus (Item) health first,
   then base health. Destroying or detaching an Item erases the damage that
   was stored on it.

Obliterate skips this pipeline entirely.

### §5.5 Death sweep (state-based)
- A Unit is dead when its remaining base health ≤ 0 **or** its effective max
  health ≤ 0 (Wither).
- The sweep runs **after every action** and repeats to a fixpoint: dynamic
  max-health effects (Phalanx, Solitary, Codex, Overcharge) mean one death
  can cascade into another in the same instant.
- Dying Units drop their Items into the graveyard (no Item triggers), lose
  all transient statuses (Glitch/Freeze/Scorch/Taint), then go to the
  graveyard. Tokens vanish instead.
- After every sweep, Item capacities are re-checked (§2.3).

---

## §6 Resource laws

- Resources are element-tagged; **Generic costs** can be paid by any
  element. The engine pays Generic costs from your **largest pool first**,
  preserving scarce colors.
- Unspent resources **persist through the opponent's turn** and clear at the
  start of your own next turn.
- **Overclock [X]:** +X Generic now, −X on your next roll.
- **No infinite engines:** resource generators are either once-per-trigger
  (Sync, Surge) or once-per-turn (Confluence, Flourish, Photosynthesis), and
  the Command Cap (§2.3) bounds attack-loop triggers. Any combination of
  printed cards generates a bounded amount of resources per turn.

---

## §7 Zone & state hygiene

- **Match isolation:** every match constructs a fresh game state; no buffs,
  counters or zone contents survive between matches.
- Cards keep no hidden state across zones: graveyard → battlefield
  (Graveborn) and hand → battlefield transitions always produce a clean
  instance (damage, statuses, Item attachments and combat history reset).
- The active Location and its controller reset at every Cleanup.

---

## §8 Keyword glossary

The single source of truth for keyword text is
`src/game/keywords.ts` (`KEYWORD_GLOSSARY`) — the in-game popups, the How to
Play panel and this document all read from the same definitions. A keyword
with no number (`Modularity`, `Solitary`) counts as value **1**. A Glitched
card's keywords are all inactive until they wear off.

### Timing quick-reference

| Trigger moment | Keywords that fire |
|---|---|
| Start of your turn | Hatchling, Sustain, Scorch tick, SCORCH_ALL, Charm activation, Discord |
| Resource Roll | Photosynthesis, Confluence, Flourish, Boost, Overclock penalty, Fix |
| After allocation | Pure check, Decay |
| On deploy | Rally, Inspire, Sync, Efficient (consumption), Blitz |
| On cast | Wildcast, Echo, Rummage, Efficient (banking), Overclock, Glacier (tax), Ward/Beacon (tax), Feedback (negation) |
| On attack declaration | Burden, Lurk (lift), Command Cap bookkeeping |
| On combat damage | Wither, Glitch, Taint, Inferno, Surge, Siphon, Reap (on kill), Vengeance (on block) |
| Your Cleanup | Charm ticks, Detonate, Overdrive damage, Overcharge upkeep, Scorch/Freeze/Glitch/Taint decay, temp buffs expire, hand limit |
| Continuous | Guard, Ward, Armor, Phalanx, Solitary, Overcharge stats, Valor, Codex, Beacon, Glacier, Modularity, Symmetric |

---

## Change log

**V1.6 (this revision)**
- **Command Cap** (new): a Unit may be readied by Leader Command only once
  per turn. Closes the infinite Command + Surge resource/attack loop.
- **London Mulligan enforcement** hardened: bottoming exactly X cards is
  server-enforced; malformed client submissions can no longer dodge the
  penalty.
- **Feedback refunds are now exact**: the refund restores the same colored
  pools the cost (and Ward/Glacier surcharges) were actually drained from,
  instead of converting them into Generic.
- **Leader Scorch uniformity**: Scorch on a Leader now runs the standard
  damage pipeline (Armor/Brittle/Taint apply), identical to Units.
- Documented the damage pipeline order (Brittle → Taint → Armor → Stripping)
  and the on-combat-damage trigger order as normative rules.
- **Leader rebalance** (validated over 1200-game CPU-vs-CPU samples, all
  leaders land between ~44% and ~55% win rate): Avatar of the Abyss 25→23 HP,
  Ethereal Sea Witch 38→33 HP, Crimson Vector Commander 30→36 HP. The live
  Supabase pool was re-synced to the bundled stats.
- **CPU improvements:** the AI now holds its best defensive Unit home as a
  blocker when the opponent's board threatens lethal, values soaking Leader
  hits when the blocker survives (Pierce-aware), and respects the Command Cap.
