# FryCards Poker Rulebook v1.0

> **The MTG-style rules were retired in October 2026.** FryCards no longer
> plays the essence/Vitality card battler (Rulebook v6.x: Wellsprings, Clash,
> Might/Grit, Resolve). Its rules live on in git history
> (`git log -- docs/RULEBOOK.md`). The card collection, rarities, names, art
> and flavor text carried over unchanged; every mechanic was replaced.

This is the current, complete rulebook for **FryCards Poker**. Where a number
appears it is the shipped value from `src/game/poker/constants.ts`; the
engine (`src/game/poker/engine.ts`) is the final word on any edge case.

---

## 1. The game in one paragraph

FryCards Poker is a **pot-limit Texas Hold'em freezeout** for 2 to 6 seats.
Everyone starts with the same stack; the last seat with chips wins, or, when
the mode's clock runs out, the biggest stack. On top of the poker, each seat
brings a **deck**: a **Leader** (a persona with a public nerve meter and two
abilities), a **Location** (a table rule that joins a shared rotation) and
**power cards** (Units ★, Items ⚙, Events ϟ) that bend what players see,
receive, handle and lose. Casting a power is public and costs chips into the
pot, so every cast is also a bet and a bluff. Poker skill still decides most
outcomes.

**Chips** exist only inside a match. They reset every game and can never be
bought, carried over, won across matches or traded. Rewards pay by finishing
place, never by chip count (§13).

---

## 2. Hold'em basics

### 2.1 Hand ranks (best first)

A hand is the best **five** cards a seat can make from its two hole cards plus
the five community cards (any five of the seven). Suits are never ranked.

| #   | Hand            | Example          | Notes                                          |
| --- | --------------- | ---------------- | ---------------------------------------------- |
| 1   | Straight flush  | 9♥ 8♥ 7♥ 6♥ 5♥   | A-K-Q-J-10 suited is the royal flush           |
| 2   | Four of a kind  | Q♠ Q♥ Q♦ Q♣ 4♠   |                                                |
| 3   | Full house      | 7♠ 7♦ 7♣ K♥ K♠   | Higher trips first, then the pair              |
| 4   | Flush           | A♦ J♦ 8♦ 6♦ 2♦   | Compare highest card down                      |
| 5   | Straight        | 10♣ 9♦ 8♠ 7♥ 6♣  | Ace plays high (A-K-Q-J-10) or low (5-4-3-2-A) |
| 6   | Three of a kind | 8♠ 8♥ 8♦ K♣ 3♠   | "Trips"                                        |
| 7   | Two pair        | J♠ J♦ 4♣ 4♥ A♠   | Higher pair, lower pair, then the fifth card   |
| 8   | Pair            | 10♥ 10♠ K♦ 6♣ 2♥ | Pair, then the three side cards ("kickers")    |
| 9   | High card       | A♣ Q♦ 9♠ 5♥ 3♣   | Highest card down                              |

Equal hands split the pot. An odd chip goes to the first winner clockwise from
the button.

### 2.2 The button and the blinds

- The **dealer button** moves to the next live seat every hand.
- The two seats after the button post forced bets: the **small blind** (half)
  and the **big blind** (one full blind). **Heads-up**, the button posts the
  small blind and acts first before the flop.
- Blinds rise on a **clock**, not a hand count (§3.2).

### 2.3 A hand, street by street

| Street   | Cards                           | Betting starts with              |
| -------- | ------------------------------- | -------------------------------- |
| Pre-flop | Two private **hole cards** each | The seat after the big blind     |
| Flop     | Three community cards face-up   | First live seat after the button |
| Turn     | A fourth community card         | First live seat after the button |
| River    | The fifth community card        | First live seat after the button |
| Showdown | Remaining hands are compared    | —                                |

A card is burned before each street. If everyone but one seat folds, that
seat wins the pot at once without showing.

### 2.4 Betting actions

- **Fold** — give up the hand and any chips already in.
- **Check** — pass the action when there is no bet to you.
- **Call** — match the current bet.
- **Bet / Raise** — put in more; everyone else must match, re-raise or fold.
- **All-in** — put in your whole stack. You can never be forced out for
  lack of chips.

Keyboard: **F** fold, **C** check/call, **R** raise (with a slider).

### 2.5 Pot-limit

- **Maximum raise:** call first, then raise by the size of the whole pot.
  `max raise-to = current bet + (pot + your call)`.
- **Minimum raise:** the size of the last bet or raise on this street, and at
  least one big blind.
- A street ends when every seat still able to bet has acted and matched the
  current bet. If everyone left is all-in (or only one seat can still act and
  owes nothing), the rest of the board is dealt with no more betting.

### 2.6 Side pots and showdown

- Chips that an all-in seat could not match form a **side pot** it cannot
  win. Each pot is awarded separately to the best eligible hand.
- Money in the pot that belongs to no seat's bet — power costs, drains,
  antes, a jackpot — joins the **main pot**.
- **Who shows:** every pot winner, and the last seat that bet or raised (it
  must show to claim — and may be caught bluffing). Everyone else mucks a
  losing hand unless the Location is **Open Table**.

---

## 3. Match format

### 3.1 Modes

| Mode     | Stack (units) | Blinds rise      | Clock cap | Deck: Leader + Location + powers | Max copies | Tier-5 cards | Power hand: start / draw per hand / cap | Reward × | Min. length |
| -------- | ------------- | ---------------- | --------- | -------------------------------- | ---------- | ------------ | --------------------------------------- | -------- | ----------- |
| Quick    | 30            | ×1.5 every 2 min | 12 min    | 1 + 1 + 16                       | 2          | 1            | 3 / 1 / 5                               | ×0.5     | 6 min       |
| Standard | 50            | ×1.5 every 3 min | 25 min    | 1 + 1 + 24                       | 2          | 2            | 4 / 1 / 6                               | ×1       | 12 min      |
| Deep     | 80            | ×1.5 every 4 min | 40 min    | 1 + 1 + 36                       | 3          | 3            | 5 / 2 / 7                               | ×1.5     | 20 min      |

One **chip unit** is the opening big blind. Every seat starts at the same
stack; chips in play never change (powers move chips, never create them).

### 3.2 The clock

- Every action advances the match clock by the time it took (human think time
  is charged up to 30 s per action). The blind **level** is
  `floor(clock / level length)`, and the big blind is 1 unit × 1.5^level,
  rounded to half-unit steps from 2 units up. Standard: 1 · 1½ · 2½ · 3½ · 5 ·
  7½ · 11½ · 17 · 25½ …
- **At the cap** the hand in progress finishes, then every live seat is ranked
  by stack.
- **Busting:** a seat at 0 chips after a hand is out. Seats that bust in the
  same hand are ranked by their stack at the start of that hand. A busted
  player can watch at 4× speed or skip.
- **Bots** take 5–7 s for raises, casts and big calls and 1–2 s for checks
  and folds, at random and independent of hand strength, so timing is never a
  tell. The human has a soft 30 s turn timer with a 60 s time bank.

---

## 4. Decks

- A deck is **1 Leader + 1 Location + N power cards** (N by mode, §3.1), with
  the mode's copy limit and tier-5 limit.
- **Colours.** Every card keeps the colour it had in the old game. The
  Leader's two colours decide which colours the deck may hold; colourless
  cards fit any deck.
- **Power hand.** Your powers form a private hand (others see only how many
  you hold). You draw the mode's starting hand at match start and the draw
  count at the start of every later hand, up to the cap. When your power deck
  is empty, your discard is reshuffled into it.
- **Old decks** from the 60-card game, and their share links, are invalid in
  every mode. The collection itself is untouched.
- **Card mechanics** are generated from a hash of each card's id, type and
  rarity, so a rebalance ships as a code change. Rarity gently biases the tier
  roll and otherwise affects novelty, not power.

---

## 5. Power cards

Every power has a **tier** from 1 to 5, printed as ★ stars (Units), ⚙ gears
(Items) or ϟ bolts (Events). The tier sets the chip cost (§6.1) and the
number **N** in its keywords (§6.6). A power is one **effect keyword** plus
optional **modifier keywords** (§9).

| Type  | Mark | Lasts                                                                                                        | Cap per hand (per seat)                     |
| ----- | ---- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Unit  | ★    | Resolves, then stays on the table as a visible **token** until the hand ends; then to your discard           | 2 Units, 5 stars between them               |
| Item  | ⚙    | Resolves once. **Charm:** then to discard. **Weapon:** returns to your hand. **Tool:** also Marks the target | 2 Items, 5 gears between them               |
| Event | ϟ    | Resolves once, then to your discard. **Quick** or **Slow** (§6.2)                                            | 5 bolts a hand, at most 2 Events per street |

- Legal Unit pairs: 5, 4+1, 3+2, 2+2 and lower. Two 3-star Units are illegal.
- An **Item** bonds to one of your Units. With no Unit of yours out, it bonds
  to a hole card instead and costs **one step more**.
- A **Tool** always needs an opponent target, and also **Marks** one of that
  seat's hole cards for you.
- **Soulbound** cards (and Weapons) return to your hand after use instead of
  the discard; a Soulbound Unit returns at the end of the hand.

---

## 6. Casting

### 6.1 Chip costs (the cost ladder)

Costs are fixed chip units for the whole match, so powers get relatively
cheaper as the blinds climb. A card's base **step** is its tier; modifiers move
the step along the ladder.

| Step         | 0   | 1   | 2   | 3   | 4   | 5   | 6   |
| ------------ | --- | --- | --- | --- | --- | --- | --- |
| Cost (units) | ¼   | ½   | 1   | 2   | 3½  | 6   | 8   |
| Printed tier | —   | 1   | 2   | 3   | 4   | 5   | —   |

Step adjustments (they stack, clamped to steps 0–6):

| Adjustment                                                              | Step |
| ----------------------------------------------------------------------- | ---- |
| Item with no Unit of yours out                                          | +1   |
| **Surge**, and you have already cast this hand                          | −1   |
| **Happy Hour** Location                                                 | −1   |
| You are **tilted** (0 nerve)                                            | +1   |
| Shortest-stack buff on Straddle Night / Reverse Order (first cast only) | −1   |

**Gambit** cards cost no chips now; instead, if the caster does not win the
pot, it pays **double** the chip cost to the winner at the end of the hand.

Chips paid go **into the pot** (on Jackpot Pit, into the jackpot), never out
of the game.

### 6.2 When you may cast

- **Your turn:** any power except Snuff, before you bet, check, call or fold.
  Casting does **not** use up your turn.
- **Slow Events:** only on your turn **before you have acted on that street**.
- **Quick Events** and any card with **Ambush:** on your turn **and** in
  response windows (§6.4).
- **Snuff:** only as a response.
- **Folded seats cannot cast.** A **Locked** seat cannot cast this street.
- **All-in seats** can cast using non-chip costs (§6.3).
- Some keywords have their own timing: **Straddle** only pre-flop before any
  raise and before you act; **Redraw/Windfall** need at least 8 cards left in
  the deck; **Exhume** needs something in the muck; **Mimic** needs a power to
  copy.

### 6.3 Second costs

Tier 4 and 5 powers need **one non-chip cost** on top of chips, chosen by the
caster:

- **Shed** — discard another power card from your hand.
- **Blind a hole card** — you cannot look at that hole card until the street
  ends.
- **Hand exclusion** — §7.

**25% stack cap:** no single cast may cost more than 25% of your current
stack. The chip cost is cut to that cap, and the cast needs **one more**
non-chip cost. This is how a short or all-in stack can still cast.

### 6.4 A cast, step by step

1. **Announce.** The full card face, the caster and the target are shown to
   everyone (a **Veil** hides the target until the street ends).
2. **Pay** the chips and any second costs. The card leaves your hand.
3. **Response window.** Every other seat still in the hand that holds a
   castable Quick Event or Ambush card (and is not Locked) may cast **one**
   response or pass. Seats with nothing castable are skipped automatically.
   Responses resolve **immediately**; there are no responses to responses and
   no stack. **Quickstrike** skips the window entirely.
4. **Resolve** the original cast, unless it was Snuffed.

A **raise** also opens a response window for the other seats.

- **Fizzle:** if the target folds before the cast resolves, it fizzles. **No
  refund.**
- **Hostile powers** (Kindle, Bounty, Peek, Reveal, Mark, Needle, Venomous,
  Lock, Entropic, Erode) target a seat. **Each seat can be the target of at most one
  hostile power per street**, and each hostile hit that lands costs the target
  1 nerve.

### 6.5 Leader abilities

- Every Leader has two abilities: one **spends** nerve (strong, a tier-4
  effect from its first colour; 3 nerve if it rebuilds your hand — Windfall,
  Wild, Bloom, Redraw, Exhume or Pass — otherwise 2) and one **builds** +1 nerve (weaker, a tier-2
  effect from its second colour, and it pays ½ or 1 chip unit into the pot).
- A Leader ability is never one of the situational effects — Straddle, Rerun,
  Burn, Cut, Toll, Bounty or Lock. Those barely move chips or cards on their
  own, or only pay when someone else acts, so they stay on power cards.
- **One Leader ability per hand**, on your own turn, outside any window. Not
  while Locked, and never while **tilted**.
- A Leader ability is public like a cast and opens a response window (it can
  be Snuffed), but it is not a card: it ignores the type caps and cannot be
  Called Out.

### 6.6 Tier numbers (N)

N for numbered keywords, by tier. Chip amounts are in chip units.

| Keyword   | ★1  | ★2  | ★3  | ★4  | ★5  |
| --------- | --- | --- | --- | --- | --- |
| Kindle    | ½   | 1   | 2   | 3   | 5   |
| Tax       | ½   | 1   | 1½  | 3   | 4   |
| Bounty    | 2   | 3   | 5   | 8   | 12  |
| Foresee   | 1   | 2   | 3   | 4   | 5   |
| Bulwark   | 1   | 2   | 3   | 4   | 6   |
| Fuse      | 1   | 1   | 1   | 2   | 2   |
| Peek      | 1   | 1   | 1   | 2   | 2   |
| Toll      | ½   | 1   | 1½  | 2   | 3   |
| Insurance | 2   | 3   | 5   | 8   | 12  |
| Siphon    | ½   | 1   | 2   | 3   | 5   |
| Blessed   | ½   | 1   | 2   | 3   | 5   |
| Needle    | 1   | 1   | 2   | 2   | 3   |
| Venomous  | 1   | 1½  | 2½  | 4   | 6   |
| Erode     | ½   | ½   | 1   | 1½  | 2   |
| Burn      | 1   | 1   | 1   | 2   | 2   |

Fuse and Needle count streets and nerve; Foresee, Peek and Burn count cards.

---

## 7. Hand exclusions

A hand exclusion is a second cost where you promise **not to win a pot with a
named hand category**.

- **Eligible:** pair, two pair, three of a kind, straight, flush.
- **Attainable only:** you may name a category only if you can still end the
  hand with it, given your hole cards and the board.
- **Effect:** at showdown, if your best hand is in an excluded category you
  cannot win that pot; it goes to the best eligible hand. If everyone else
  folds, the exclusion does nothing.
- **Limit:** at most **two** per hand, each a different category.
- **Public:** announced to the table.
- If **every** contender for a pot is excluded, all exclusions are ignored for
  that pot. An exclusion only matters in pots you are eligible for.

---

## 8. Information, bluffing and nerve

### 8.1 What each seat sees

- Your own hole cards (unless you blinded one), the board and every public
  play. Everything else is granted by a power.
- Every hole card tracks which seats know it. The table renders from your
  seat's view; **bots receive exactly the same redacted view** — difficulty
  is decision quality, never extra information.
- A cast is public; its **result is private**. Everyone sees that you peeked
  at seat 4; only you see what you saw. Peek, Mark, Foresee, Redraw, Windfall,
  Exhume and Pass results are private. **Reveal** turns a card face-up for
  the whole table.
- Other seats' power hands are hidden (only the count shows).
- Each match logs its seed; the same seed and action list replays it exactly.

### 8.2 Bluff levers

| Lever             | Keywords                            | What the opponent cannot tell                             |
| ----------------- | ----------------------------------- | --------------------------------------------------------- |
| Secret aim        | Veil                                | Where the card points until the street ends               |
| Secret fizzle     | Feint                               | Whether the effect actually happened                      |
| Induced reaction  | Bait, Gambit                        | Whether you cast to provoke a raise                       |
| Borrowed identity | Mimic                               | Whether you copied a power you could not otherwise afford |
| Cost as a signal  | Chips into the pot, hand exclusions | What a large or odd payment means                         |

- **Feint** appears on about 1 card in 12. Its caster may secretly choose to
  let it fizzle; to everyone else it looks resolved.
- **Call Out** (Light) tests a seat's last resolved cast. If it was a Feint,
  the caught seat loses 2 nerve and the Call Out's chips are refunded. If it
  was real, the Call Out's chips stay in the pot. Leader abilities and Warded
  casts cannot be Called Out.

### 8.3 Nerve

Nerve is a **public** meter from 0 to 10; every seat starts at 5.

| Event                                                             | Nerve      |
| ----------------------------------------------------------------- | ---------- |
| Win a showdown                                                    | +1         |
| A bluff gets through (win uncontested without a made hand)        | +1         |
| Fold a strong hand (strong pre-flop, or two pair+ after the flop) | +1         |
| Caught bluffing (last aggressor loses the showdown with air)      | −2         |
| A hostile power lands on you                                      | −1         |
| A Call Out catches your Feint                                     | −2         |
| Needle N                                                          | −N         |
| Leader abilities                                                  | as printed |

**Tilt:** at 0 nerve your Leader is locked and every power costs one step more
until your nerve recovers. Elimination is chips-only; nerve never knocks you
out. **Tilt Zone** doubles every nerve change.

### 8.4 Bots

The nine Leaders also drive the CPU seats, drawn by a seeded draw. A bot's
persona (bluff rate, tightness, how often it casts) comes from its Leader's two
colours: Ember and Shadow bluff more, Void plays tight, Light bluffs least. A
bot casts when the expected gain, in big blinds, clears the cost plus a margin;
it picks targets by threat and personality and respects the hostile cap.

---

## 9. Keywords by colour

"N" is set by the card's tier (§6.6). **Gated** keywords appear only on cards
of their colour: information about other seats (Peek, Reveal, Mark, Call Out)
is Light's, denial (Burn, Lock, Snuff, Entropic) is Void's. Redraw and Surge
are the **common set**, open to every colour. Every other keyword has a home
colour the card generator prefers. ✔ marks a name carried over from the old
game with a new poker meaning. _Modifiers_ change how or when the effect lands.

### Common set (every colour)

| Keyword | Type     | Meaning                                                         |
| ------- | -------- | --------------------------------------------------------------- |
| Redraw  | effect   | Replace one of your hole cards (your choice) with the next card |
| Surge ✔ | modifier | Costs one step less if you have already cast this hand          |

### Ember — pressure and chaos

| Keyword  | Type     | Meaning                                                                                                        |
| -------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| Straddle | effect   | Pre-flop, before any raise or your own action: raise your blind to double the big blind; you act last pre-flop |
| Kindle ✔ | effect   | **Hostile.** Drain N from a target's stack into the pot                                                        |
| Tax      | effect   | Every opponent still in the hand antes N more                                                                  |
| Bounty   | effect   | **Hostile.** Mark a target; if it busts this hand, you collect N from the winner                               |
| Roulette | modifier | The effect hits a random seat still in the hand — possibly you                                                 |
| Gambit   | modifier | Cast for no chips; if you don't win the pot, pay double the chip cost to the winner                            |

### Tide — receiving and flow

| Keyword    | Type     | Meaning                                                                         |
| ---------- | -------- | ------------------------------------------------------------------------------- |
| Windfall   | effect   | Receive a third hole card, then discard down to your best two                   |
| Foresee    | effect   | Privately look at the top N cards of the deck                                   |
| Mimic      | effect   | Copy the effect of the last power cast this hand (not Mimic, Snuff or Call Out) |
| Wild       | effect   | A random one of your hole cards counts as any suit this hand                    |
| Resonant ✔ | modifier | The effect resolves twice                                                       |

### Root — growth and endurance

| Keyword     | Type     | Meaning                                                                                                                   |
| ----------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| Bulwark ✔   | effect   | If you don't win this hand (folding included), take back up to N of your own chips from the pot                           |
| Bloom       | effect   | **Gated.** When the next street is dealt, a random one of your hole cards (not an Ace) grows one rank higher; no effect on the river |
| Rerun       | effect   | If the hand goes all-in before the river, the rest of the board is dealt twice and each pot splits between the two boards |
| Thriving ✔  | modifier | On a Unit: the effect fires again at the start of every later street, N growing each time                                 |
| Fuse        | modifier | The effect lands N streets later — everyone sees it coming; it fizzles if you have folded                                 |
| Soulbound ✔ | modifier | Returns to your hand after use                                                                                            |

### Gale — timing and movement

| Keyword       | Type     | Meaning                                                                    |
| ------------- | -------- | -------------------------------------------------------------------------- |
| Cut           | effect   | Move the top card of the deck to the bottom                                |
| Pass          | effect   | Every seat still in passes a random hole card to the next seat on its left |
| Ambush ✔      | modifier | Castable in response windows during other seats' betting                   |
| Quickstrike ✔ | modifier | Resolves at once, with no response window                                  |

### Light — truth and protection

| Keyword   | Type   | Meaning                                                                                           |
| --------- | ------ | ------------------------------------------------------------------------------------------------- |
| Peek      | effect | **Gated, hostile.** Privately see N of a target's hole cards                                      |
| Reveal    | effect | **Gated, hostile.** One of a target's hole cards is turned face-up for everyone                   |
| Mark      | effect | **Gated, hostile.** Learn one of a target's hole cards for the rest of the hand, wherever it goes |
| Call Out  | effect | **Gated.** Test a seat's last resolved cast: a Feint costs its caster 2 nerve and refunds you     |
| Toll      | effect | This hand, whenever a hostile power targets you, its caster pays you N                            |
| Insurance | effect | If you lose a showdown while all-in this hand, recover up to N from the pot                       |
| Siphon ✔  | effect | Take N from the pot                                                                               |
| Blessed ✔ | effect | Take back up to N of the chips you paid for powers this hand                                      |

### Shadow — deception and recursion

| Keyword    | Type     | Meaning                                                                            |
| ---------- | -------- | ---------------------------------------------------------------------------------- |
| Decoy      | effect   | The first Peek or Mark aimed at you this hand only ever sees your lowest hole card |
| Needle     | effect   | **Hostile.** Drain N nerve from a target                                           |
| Exhume ✔   | effect   | Swap one of your hole cards for a random folded or mucked card                     |
| Venomous ✔ | effect   | **Hostile.** If the target wins a pot this hand, it pays you N                     |
| Feint      | modifier | Cast face-up with a secret choice to let it fizzle; only a Call Out can tell       |
| Veil       | modifier | The target stays hidden until the street ends                                      |
| Bait       | modifier | If another seat raises after this cast on the same street, its chips are refunded  |

### Void — denial and removal

| Keyword    | Type     | Meaning                                                                                                                   |
| ---------- | -------- | ------------------------------------------------------------------------------------------------------------------------- |
| Burn ✔     | effect   | **Gated.** Discard the next N cards of the deck (never below 8 left)                                                      |
| Lock       | effect   | **Gated, hostile.** The target cannot cast (or use its Leader) for the rest of this street                                |
| Snuff      | effect   | **Gated.** Response only: cancel the cast being made (not your own, not a Warded one); a snuffed card goes to the discard |
| Entropic ✔ | effect   | **Gated, hostile.** The target discards a random power card now and at the start of every later street                    |
| Erode      | effect   | **Gated, hostile.** Take N from a target's stack                                                                          |
| Warded ✔   | modifier | Can't be Snuffed or Called Out; a Warded Unit also stops Peek, Mark and Reveal targeting you                              |

**Retired** with the old game: Aerial, Overrun, Swarmproof, Skywatch,
Doublestrike, Alert, Immobile, Hardened, Regenerate, Bountiful, Sacred,
Archivist and the rest of the combat, stack, essence and Dawn/Dusk terms.

---

## 10. Locations

### 10.1 The schedule

- Each deck holds exactly one Location. Every live seat's Location goes into
  a **shared bag**, together with one **Plain Table**. Each hand plays the next
  one from the bag, in a shuffled order that ignores who is dealing — a
  Location is the table's weather, not a seat's perk.
- The bag refills (reshuffled) when empty, so your Location comes up about
  once per orbit. **No Location repeats on consecutive hands**, across cycles
  too.
- A **forecast** shows the next two Locations.
- At **2 or 3 seats**, house Locations from the catalog join the bag so the
  table sees at least five different ones.
- The owner's name and the card art are credited when their Location comes
  up; the owner gets no gameplay bonus. The active Location's art is the table
  felt.

### 10.2 The rules

Each Location card rolls one of these templates (the card hash picks the
template and any parameter). Position-favouring rules give the **shortest
stack** a small buff.

| Rule            | Effect                                                                                                       | Tag               |
| --------------- | ------------------------------------------------------------------------------------------------------------ | ----------------- |
| Plain Table     | No rule change. Pure poker. (One per cycle; not on any card.)                                                | Pure poker        |
| High Stakes     | Blinds ×1.5 (or ×2) this hand                                                                                | Neutral           |
| Open Hand       | Each player's lowest hole card is dealt face-up                                                              | Neutral           |
| Double Board    | Turn and river are dealt twice (the flop is shared); each pot splits between the two boards                  | Neutral           |
| Night Game      | No Quick Events this hand (Ambush cards still respond)                                                       | Neutral           |
| Dealer's Choice | The dealer gets one free Peek (one card) on any of its turns; the shortest stack gets one too                | Favors the dealer |
| House Rake      | The dealer antes 1 and collects 1 from the pot at the end of the hand                                        | Favors the dealer |
| Bomb Pot        | Everyone antes 1 (or 2); no blinds and no pre-flop betting — straight to the flop                            | Chaos             |
| Pineapple       | Three hole cards each; discard one after the flop                                                            | Structural        |
| Straddle Night  | Under the gun posts a live double blind (not heads-up); the shortest stack's first power is one step cheaper | Position          |
| Reverse Order   | Betting goes counter-clockwise; the shortest stack's first power is one step cheaper                         | Position          |
| Open Table      | Every hand that reaches showdown is shown; nothing is mucked                                                 | Information       |
| Fog             | One flop card stays face-down until the turn                                                                 | Information       |
| Happy Hour      | All power costs are one step cheaper                                                                         | Powers-heavy      |
| Silent Table    | No Quick Events and no Ambush — no response windows this hand                                                | Powers-light      |
| Jackpot Pit     | Chips paid for powers go into a jackpot added to the next hand's pot                                         | Economy           |
| Short Board     | No river: the hand ends after the turn                                                                       | Shrinks revival   |
| Tilt Zone       | Nerve gains and losses are doubled                                                                           | Leader-focused    |

---

## 11. End of a hand

In order: House Rake; Bulwark / Insurance refunds for non-winners; pots
awarded (both boards on Double Board / Rerun); hands shown (§2.6); nerve
(§8.3); Venomous, Gambit and Bounty payments; Units leave the table
(Soulbound ones return to hand, the rest to the discard); busted seats are
out. If one seat is left, or the clock is past the cap, the match ends.

---

## 12. The seven colours

| Colour | At the poker table                                                   |
| ------ | -------------------------------------------------------------------- |
| Ember  | Pressure and chaos: straddles, drains, taxes, gambles                |
| Tide   | Receiving and flow: extra hole cards, redraws, foresight, wild suits |
| Root   | Growth and endurance: loss caps, delayed effects, run-it-twice       |
| Gale   | Timing and movement: out-of-turn casts, deck cuts, passing cards     |
| Light  | Truth and protection: peeking, reveals, call-outs, insurance         |
| Shadow | Deception and recursion: feints, veils, decoys, poison               |
| Void   | Denial and removal: burns, locks, snuffs, entropy                    |

---

## 13. Rewards

Rewards pay by **finishing place only** — never by chips — so the
marketplace, shops, grading and battle pass stay calibrated to the old
100-for-a-win / 40-for-a-loss payout.

`reward = round((40 + 60 × place factor) × mode multiplier)` for credits;
XP uses 25 + 35 × factor and battle-pass XP 20 + 30 × factor.

| Seats | Place factors, 1st to last      | Standard credits        |
| ----- | ------------------------------- | ----------------------- |
| 2     | 1.00, 0                         | 100, 40                 |
| 3     | 1.00, 0.40, 0                   | 100, 64, 40             |
| 4     | 1.00, 0.55, 0.15, 0             | 100, 73, 49, 40         |
| 5     | 1.00, 0.60, 0.30, 0.10, 0       | 100, 76, 58, 46, 40     |
| 6     | 1.00, 0.60, 0.35, 0.15, 0.05, 0 | 100, 76, 61, 49, 43, 40 |

Mode multipliers: **Quick ×0.5, Standard ×1, Deep ×1.5** (6 seats: Quick
50 … 20, Deep 150 … 60). The match ticket records mode and seat count at the
start; the server sets a minimum match length (Quick 6, Standard 12, Deep 20
minutes) and the reward ceiling, and records the place via
`record_match_placement`.

---

## Quick reference

| Step                | What happens                                                                                   |
| ------------------- | ---------------------------------------------------------------------------------------------- |
| Hand start          | Button moves, powers drawn, next Location from the bag, blinds/antes posted, 2 hole cards each |
| Pre-flop            | Bet from the seat after the big blind; cast on your turn                                       |
| Flop / Turn / River | Burn, deal 3 / 1 / 1; start-of-street effects (Entropic, Thriving, Fuse); bet                  |
| Any cast or raise   | Response window for Quick Events and Ambush, then resolve                                      |
| Showdown            | Best five of seven; exclusions apply; side pots awarded separately                             |
| Hand end            | Refunds, payments, Units discard, busts                                                        |
| Match end           | One seat left, or clock cap → rank by stack → placement rewards                                |
