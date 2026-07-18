# Balance Sim Findings — v4.7

Method: baseline full sim (45,120 games, same 48-deck roster as v4.6), then a
new **ablation harness** (`scripts/simulate-ablation.ts`) that pits the
problem archetypes against a fixed six-deck mid-tier roster and turns exactly
ONE engine dial per arm (`SIM_TUNING` in engine.ts), then a full verification
re-sim with all adopted changes. Baseline reproduced v4.6's final numbers
exactly.

## 1. The headline: the "durability keyword" theory was wrong — the deck-out
## rule was the engine

v4.5 and v4.6 spent six levers (Avenge caps, Toll cap, Overrun buffs ×2,
Steel+Bulwark per-hit cap, Overrun prevalence) on the durability-stack decks
and none moved them. The v4.7 ablation finally isolated why: **no labeled
keyword powers these decks.**

| Ablation arm | Avenge Grind | Steel-Scrap | Guard-Bulwark | Ward-Steel |
|---|---|---|---|---|
| baseline | 87.7 | 82.1 | 84.4 | 75.8 |
| tollCap 3→1 | 87.5 | **82.1** | **84.4** | **75.8** |
| avengeCap 2→0 | 85.0 | 83.8 | 79.0 | 77.5 |
| steelMult ×0.5 | 89.4 | **72.7** | 87.5 | **70.2** |
| mendMult ×0.5 | 87.3 | 81.9 | 80.4 | 74.8 |

Toll — the keyword *named in two of the four archetype labels* — measured
**identically to baseline to the decimal**. Removing Avenge entirely moved
its flagship deck 2.7pt. Only Steel genuinely mattered, and only for the two
Steel decks.

The shared trait that does explain them: all four are unit-heavy (16-19
Units), draw-light lists — and **24% of all baseline games ended in the
instant deck-out loss**. Under §9's old rule, every card-draw effect
accelerated your own loss clock and unit-hoarding attrition won the long
game by default.

**Change (v4.7): deck-out loss → Fatigue** (escalating 1, 2, 3... Leader
damage per missed mandatory draw). Verification: **deck-outs 10,999 → 0**,
and the game now always ends on Leader HP.

## 2. What shipped (all verified by the full re-sim)

| Change | Result (baseline → verify) |
|---|---|
| Fatigue replaces instant deck-out | deckouts 24% → 0%; Ward-Steel Wall 81.3 → 75.6; Abyss Sap-Echo Control 51.8 → 39.3 (it was the biggest deck-out farmer) |
| Twin bodies re-budgeted off their real printed threshold (they cast at legacy−1 with full stats + rider + staged passive; a same-turn pair is ~AnyPair-easy) | Twin keyword 58.1 → 54.7 (off the #1 spot); Mer King Twin Heal 52.1 → 41.9 (watch for over-nerf next pass); Abyss Twin Value 74.2 → 70.3 |
| Steel X prints 2/2/3 by tier → 1/1/2 (ablation-verified as the only keyword dial that bit) | Steel keyword 48.8 → 47.4; Ward-Steel 81.3 → 75.6 (with fatigue) |
| Anchor Units +2 HP (the cheap Anchor bodies were 4/2 glass that died before any ramp existed) | biggest floor recovery ever measured: Abyss Excavate Ramp 24.7 → 40.6; Anchor keyword 46.3 → 49.0 |
| AI: face-lethal check now subtracts the defender's Toll | tollReduced 60k → 77k (Toll walls actually engage; AI stops dumping boards into blunted face attacks) |
| AI: never burns a board-wide-buff Ultimate on <2 Units | ultimateUsedBehind delta −38.5 → −29.4pt |
| AI: low-rarity Echo recast only when hand ≥5 (fodder near-free) | echoRecast_low delta **−9.4 → −0.4pt** |
| **Leader spread 18.6pt → 12.0pt (best measured to date)** | Diver 36.3 → 43.0; Mer-King 54.9 → 47.0; top: Abyss 55.0 |

Ablation-proven no-ops, documented so the next pass doesn't repeat them:
Toll cap changes (zero effect on anything), Mend halving (≤2pt everywhere),
Anchor's cap bonus drawing a card (≤1pt), and Guard's +3 HP print bonus
trimmed to +2 (a ±2pt wash on the Guard decks that also *boosted* the Steel
decks by weakening their prey — reverted).

## 3. Ablation round 3 detail (floor decks)

With Twin/Steel/AI changes in, per-arm vs the fixed mid roster:

| arm | Anchor-Scrap | Tempo-Anchor | Excavate | Rally Tempo |
|---|---|---|---|---|
| baseline | 10.8 | 16.7 | 20.6 | 13.3 |
| anchorHp +1 | 15.0 | 18.3 | 26.7 | 18.1 |
| fatigue + anchorHp +2 | 14.2 | 10.0 | **39.2** | 23.3 |

Anchor HP was the one lever that helped every ramp deck at once, adopted
at +2.

## 4. Still open — priority list for the next pass

1. **Shinobi Avenge Grind (92.8%)** has now survived *everything*, including
   the ablation battery: removing Avenge outright is worth 4pt. Its real
   list is Guard-primary walls (Coral-Prowler/Colossus/Phantom) + Narwhal
   Staff mend + Crown of the Reef removal on the Shinobi kit. Guard's flat
   +3 HP print bonus was tested this pass (see the reverted no-op above) and
   is NOT the lever; the remaining candidates are Shinobi's Leader kit
   itself and a deck-level ablation of the wall/mend/removal package.
2. **Steel-Scrap Control (84.7) / Guard-Bulwark Turtle (83.9)** — same
   Guard-wall core. Note Ward-Steel responded to fatigue (−5.7) but these
   didn't; they win on board, not on attrition.
3. **Shinobi Tempo-Anchor (18.5)** did NOT recover with the other Anchor
   decks — its Echo/Swift half is the difference; Abyss Sap-Echo Control
   also fell 12pt this pass. Echo keyword is 47.8 and mid-rarity Echo only
   +2.9. Echo's fodder economics deserve a dedicated look.
4. **Diver Rally Tempo (24.4)** still floor-bound; Rally keyword itself is
   dead-neutral (49.9). Deck-level ablation (swap the buff/draw package) is
   the right tool, not a Rally buff.
5. **Momentum's −72.9pt decision delta** is still the desperation confound
   (it only triggers when behind on two axes) — the planned A/B arm
   (momentum on/off, same roster) remains the right measurement.

## 5. Card-level notes

The old "most OP" list turned over almost completely once Twin was
re-budgeted (Lurking Coral-Prowler — a 9/8 for printed threshold 4 — left
the list). Current top (Flickering Sea Pens / Cavernous Watcher 73.8%) are
Avenge/durability-deck membership echoes; re-read after §4.1-2. Chrono-
Phalanx (26.4% / 0.37 casts) is the one card that has sat at the bottom for
three passes regardless of meta — candidate for a redesign, not a stat bump.
