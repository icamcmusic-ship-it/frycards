# FryCards v4.5 Balance-Sim Findings

Source data: `npm run sim:v4 10` (22,560-game main pass + 33,840-game Twin
A/B/C test, 48 decks — 20 hand-built archetypes across all 6 Leaders, their
Location-stripped variants, and 8 pure-random control decks), plus
`npm run analyze:costs` and `npm run pattern-hitrate`, run against the
current `main` HEAD (which already includes unreleased v4.4.1/v4.4.2 engine
changes that were never written back to `docs/RULEBOOK.md` — now fixed, see
below). Raw sim output: see chat/task history; this doc is the synthesis.

Two concrete fixes shipped from this pass (see CHANGELOG.md "Unreleased" and
`docs/RULEBOOK.md`'s new v4.5/v4.4.1/v4.4.2 errata blocks):
1. **Docs sync**: v4.4.1/v4.4.2 engine changes (Overrun, Foothold, Momentum's
   +1 ATK, Frenzy's behind-carve-out, Locations' on-cast +1/+1, Shinobi/Diver
   Ability retuning) are now documented in the rulebook.
2. **FourKind gate-pool bug**: removed from the general `HARD_GATES` picker
   in `cardpool.ts` — it was landing 5 cards on a "flavor-only, 1-3 total"
   gate the rulebook's own §7 guidance explicitly reserves for trophy cards.

Everything else below is a **finding**, not yet an implemented fix — several
of the v4.4.1 rebalance attempts already "barely moved the needle" on a
first try (per `git log`), so further numeric changes should go through
another sim-verify cycle rather than being applied blind.

---

## 1. CPU/AI reasoning lapses (`src/game/v3/ai.ts`)

1. **Combat "value trade" heuristic silently zeroes out gate-costed cards.**
   `playCombat()`'s `valueKill` picker (ai.ts:616):
   `kills.find((t) => (t.def.threshold ?? 0) > (att.def.threshold ?? 0))`.
   Since v4.3, any Combo-gate-costed card (`comboGate` set) has
   `def.threshold === undefined` (cleared in `applyCostFormat`), which falls
   back to `0` here. A Mythic bomb Unit gated behind Full House registers as
   a "threshold 0" card in this comparison — the AI will never recognize it
   as the bigger/better kill in an optional trade, systematically
   undervaluing every gate-costed Unit (a meaningful fraction of the tier-3+
   pool) in combat decisions. Same `?? 0` pattern appears in `castPriority`
   (ai.ts:145) but is compensated there by the flat `comboGate` bonus
   (ai.ts:151); the combat picker has no equivalent compensation.

2. **Location choice ignores 2 of 4 Location keywords.** `locScore()`
   (ai.ts:294-312) only scores `locPassive` (ATK_ALL/HP_ALL) and ability
   presence/rarity. It has no awareness of **Foothold** (discounts the first
   Unit cast this turn — arguably the single highest-value Location trait
   for a curve-out turn), **Excavate** (ramps down over time — worth more
   the longer it stays, which the AI never weighs against replacing it), or
   **Tribute**/**Contested**. The AI picks blind among these when multiple
   Locations are in hand, which may be part of why Excavate (32.3% keyword
   win rate) and Foothold (30.8%) underperform — the AI isn't necessarily
   playing them when they'd help most, or holding them long enough to pay
   off (Excavate specifically wants to *stay* in play).

3. **Mulligan heuristic is too coarse.** `handIsKeepable()` (ai.ts:46-50)
   only checks "≥2 cards with threshold ≤3" and "≥1 Unit". It has no
   awareness of Combo-gate costs (a hand of gate-only cards with no
   realistic pattern this turn passes the "cheap plays" bar despite being
   functionally uncastable), Locations, or removal. The sim's own data
   shows mulliganing correlated with a **5.7pt lower win rate** — some of
   that is reverse causation (bad hands mulligan and still often lose), but
   a heuristic this coarse is unlikely to be squeezing full value from the
   redraw.

4. **No priority weighting for recurring Combo-passive value.** `castPriority()`
   never checks `c.def.combo` (a passive that re-triggers every Combo Check
   while the card survives). The sim's Combo-trigger totals span two orders
   of magnitude on cards of comparable rarity/cost (Kunoichi of the Magma
   Rings: 29,482 triggers vs. Absolute Eruption: 263) — the AI has no signal
   to prefer casting a proven high-value combo engine over a same-cost
   vanilla body when both are in hand.

5. **Buff targeting reinforces the strongest unit, not the best target.**
   `autoTarget()`'s `friendlyUnit` case (engine.ts:1047-1050) sorts by
   current ATK descending and always picks the top. This is "rich get
   richer" — it snowballs whichever Unit is already biggest instead of
   buffing a Unit that's about to trade unfavorably, or a low-stat Unit that
   actually needs the boost to matter. Used by every Unit/Location Ability
   with `target: 'friendlyUnit'`.

6. **Echo recast order isn't value-ordered.** The recast loop in
   `playPlacement()` (ai.ts:447-461) iterates `p.discard` in whatever order
   cards landed there, not by rarity/value. When only one die is realistically
   available, a low-value low-rarity Echo card can consume it before a
   higher-value mid/high-rarity one sitting deeper in the pile is even
   considered. (Partial mitigation: the loop can recast more than one Echo
   card per turn if dice remain, so this mostly matters when dice are tight.)

None of these are correctness bugs (the AI never takes an illegal action),
they're heuristic gaps — the AI plays a legal, "sensible" game per its own
design comment, but leaves real value on the table in ways that could be
skewing the archetype/keyword win-rate data below (a human or smarter AI
piloting Excavate/Foothold-heavy decks might well outperform what the sim
measured).

---

## 2. Keyword findings

**Removals:** none — every implemented keyword sees play and has an
identifiable role. FourKind's *general-pool gate* use is removed (see
above); it remains valid as a hand-picked Combo-bonus rider.

**Needs nerfing** (win rate persistently high, "safe" attrition stacking):
- **Avenge** (57.2% keyword win rate) — the single best keyword in the game,
  and it's the backbone of Shinobi Avenge Grind's 90.9% archetype win rate
  even after a v4.4.1 nerf attempt that only moved it 95.1%→94.5%. It's an
  uncapped state-based +1/+1 trigger with no cap analogous to Anchor(3)/
  Toll(3)/Combo-self-buff(3) — worth capping the same way.
- **Guard/Bulwark/Toll/Steel stacking** — individually reasonable (53.4%,
  51.0%, 50.3%, 49.9%), but decks that combine 2-3 of them (Mer King
  Guard-Bulwark Turtle 78.7%, Crimson Toll-Bulwark Fortress 80.0%, Shinobi
  Steel-Scrap Control 83.9%) are dominant. The interaction, not any single
  keyword, is the problem.

**Needs buffing** (a full tier below everything else):
- **Excavate** (32.3%), **Foothold** (30.8%), **Crescendo** (28.6%),
  **Contested** (28.4%) — all four sit 15-25pt below the next-worst keyword
  (Scrap, 46.2%). This isn't noise; it's a structural gap. Contested in
  particular is a symmetric "arms race" mechanic that seems to just not
  matter enough to fight over (see the AI's blindness to it above, which
  may compound the measured weakness rather than being its sole cause).
- **Anchor** (48.1%) — the weakest of the "core nine" v4.0 keywords, and
  the anchor of the two worst archetypes in the whole roster (Abyss
  Excavate Ramp 12.8%, Sea Witch Anchor-Scrap Ramp 22.7%, Shinobi
  Tempo-Anchor 24.3%). Even after the v4.4 cap-to-3 + one-time +1/+1 payoff
  change, ramp-oriented Anchor decks are close to unplayable.

**New keywords:** none obviously missing. The Roadmap's unprinted keywords
(Fate, Freeze-Dry, Blessed, Scorched-Earth, Glaciate, Exhume) remain
unimplemented; this pass surfaced no urgent need for them — the existing 23
keywords already have enough spread that shoring up the bottom tier should
come before adding more surface area.

---

## 3. Game mechanics findings

- **Momentum is not doing its job.** Decision-correlation: did=17.3% win
  rate vs. did-not=83.8% (-66.5pt delta) — the largest swing of any tracked
  decision. Some of that gap is inherent (Momentum only triggers when
  you're already behind on two axes), but 17.3% is barely above the
  worst-performing single archetype's win rate. The v4.4.2 "+1 ATK" add-on
  barely moved it (16.5%→17.3% per the git history). This is the game's
  primary systemic comeback mechanic and it is failing at its stated job.
  Consider a stronger lever tied to the same trigger condition (e.g. a
  Leader Ability threshold discount, matching Resolve's existing pattern,
  rather than more raw dice/stats).
- **Ultimate(N) usage still correlates with losing** (-10.8pt), the same
  problem it was introduced in v4.2 to solve, and the same one that
  Momentum was introduced in v4.4 to solve for the broader "reactive-leader
  inevitability" gap. Two comeback mechanics in a row have shipped and
  measured as net negative for the player using them. Worth checking
  whether it's a genuine game-design problem (Ultimates just aren't strong
  enough) vs. a measurement artifact (a losing AI reaches for its Ultimate
  more often *because* it's losing, regardless of the Ultimate's quality) —
  the same "deck membership vs. card power" confound the v4.0/v4.1 Twin
  analysis flagged. Given two independent mechanics show the same pattern,
  it's worth instrumenting board-state-at-activation-time to separate
  "already lost, used it anyway" from "using it caused the loss."
- **Locations remain a net negative in isolation** (-3.7 win% vs.
  Location-stripped decks) despite three consecutive buff attempts across
  v4.1 (free cast), v4.4 (+1→+2 passive), and v4.4.2 (on-cast +1/+1). Each
  fix addressed a specific diagnosis (opportunity cost, then "Leader HP
  wasn't the right target") and each still measured negative afterward.
  Worth considering whether Locations are structurally hard to value
  against a Unit under this ruleset's die economy — i.e. the diagnosis
  itself, not just the fix size, may need revisiting.
- **pattern-hitrate.ts (and the §6 hit-rate table it produced) only model
  ONE reroll**, but the ruleset has allowed **two** rerolls since v4.3 — the
  rulebook already flags this ("understates actual hit rates under the
  current rule") but the script hasn't been updated to match. Any future
  Combo-gate cost-format guidance (including the FourKind fix above) is
  currently working from stale hit-rate numbers; re-measuring under 2
  rerolls should be done before the next gate-tier calibration pass.

---

## 4. Cost vs. ability (`npm run analyze:costs`)

- Cost-format distribution across the live 193-card pool: exact 24.6%, free
  (Location) 20.3%, sum 18.2%, gate:ThreeOdds 8.0%, gate:ThreeEvens 7.0%,
  atLeast (legacy/Twin) 5.9%, gate:AnyPair 5.3%, gate:FourKind 2.7% *(now
  fixed — was violating design guidance, see above)*, gate:LargeStraight
  2.1%, gate:TwoPair 2.1%, gate:ThreeKind 1.6%, gate:FullHouse 1.1%,
  gate:Yahtzee 0.5% (exactly the 1 trophy card, as intended),
  gate:SmallStraight 0.5%.
- No other cost-format outliers found — sum targets scale sensibly with
  rarity (avg 7.7, min 4, max 18) and exact-value histogram is reasonably
  spread (peaks at 2, as expected for a cheap/common-leaning "exact" cost).

## 5. Card-level buff/nerf candidates

**Likely overperforming** (min n=40, highest win% in deck):
Vector Blade Captain (79.7%), Phantom Dumbo (79.3%), Narwhal Staff (64.4%),
Amethyst Starfish (63.9%), Crowned Manatee (63.6%), Lurking Coral-Prowler
(63.6%), Flickering Sea Pens (62.5%), Cavernous Watcher (62.5%), The
Abyssal Gate (61.4%), Blind Colossus (60.9%), Starfall Wildcaster (60.3%),
Obsidian Golem (59.7%).

**Likely underperforming / dead in hand:**
Submerged Starfall (0.05 casts/game — this is the intentional Yahtzee
trophy card, expected), Hammerhead Silhouette (0.31 casts/g, 34.1% win),
Chrono-Phalanx (0.32 casts/g, 29.8% win), Bound Leviathan (0.37 casts/g),
Micro-Drone Immolation (0.45 casts/g, 28.6% win), Barrier Projection Field
(0.45 casts/g, 37.0% win), Emerald Turtle (0.46 casts/g, 41.3% win).

**Methodology caveat:** several of the lowest-n cards in the "useless" list
(Copper Nautilus, Tangled Seahorses, Brass Whale — all reading exactly
19.4% win rate at n=940) are single-deck artifacts: n=940 means the card
only appears in one deck in the 48-deck roster (one of the pure-random
control decks), so its "win%" is really that deck's overall win rate, not
independent per-card signal. Treat any n=940 card stat as low-confidence;
the real buff/nerf list above is restricted to cards with meaningfully
higher sample sizes.

---

## 6. Leader / archetype summary

| Leader | Win% | n |
|---|---:|---:|
| Mer-King | 57.8% | 7,520 |
| Apex Nanite Shinobi | 57.3% | 8,460 |
| Crimson Vector Commander | 51.4% | 6,580 |
| Ethereal Sea Witch | 50.8% | 6,580 |
| Avatar of the Abyss | 42.7% | 10,340 |
| Legendary Diver | 39.6% | 5,640 |

18.2pt spread — worse than the "44-56%" spread the v4.4-era leader rebalance
claimed to achieve, meaning some regression happened between that pass and
now (or that pass's numbers were themselves archetype-roster-dependent and
the widened 20-archetype v4.4 roster surfaces a real gap the old 12-archetype
roster didn't). **Legendary Diver and Avatar of the Abyss are the clearest
buff candidates; Mer-King and Apex Nanite Shinobi the clearest nerf
candidates**, consistent with the archetype-level Avenge/Guard-Bulwark
findings above (both strong leaders' best archetypes lean on the
now-flagged-for-nerf keyword combinations).
