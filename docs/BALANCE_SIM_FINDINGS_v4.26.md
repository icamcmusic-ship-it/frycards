# Balance Sim Findings — v4.26

> **Note on the series**: the per-pass `BALANCE_SIM_FINDINGS_v4.5 … v4.25`
> files were removed this pass at the owner's request ("remove all old sim
> docs except the most recent one"). This file is the sole surviving
> findings doc; the historical record of every prior pass lives on in
> `CHANGELOG.md` and the extensive in-code commentary in
> `src/game/v3/cardpool.ts` / `keywords.ts` / `engine.ts`.

Full-scale runs this pass (matching v4.22–v4.25's scale): **26,448 games**,
58 decks (25 archetypes + Location-stripped Twin variants + 8 pure-random
control decks), 8/pairing. Three runs: a fresh baseline, a first
verification run (which caught a deck-drafting side effect — see "Gate-ease
misfire" below — and was discarded as the record), and the final
verification run. **Zero invariant violations on all three**; `npx vitest
run` 107/107 green throughout. Card pool verified in sync with live
Supabase before the pass (292/292, field-for-field md5 match), and then
deliberately re-written server-side by this pass's Volume #1 set
consolidation (see CHANGELOG) — set names never feed the mechanic hash
(`cardpool.ts` hashes only card `id`), so the consolidation changed zero
card mechanics, confirmed by the byte-identical baseline.

## Harness upgrades this pass

1. **Per-card dead-in-hand-at-game-end table** — the third leg of the
   hand-clog triptych. `handLimitDiscardCount` (v4.24) only fires when a
   hand overflows `HAND_LIMIT`; `lapseWastedCastableDieCount` (v4.25) only
   fires when a payable die goes unspent. A card that simply never becomes
   castable and quietly rides to the end of the game was invisible to both.
   Measured directly from `p.hand` at game end (no engine change).
   **Immediately load-bearing**: it confirmed v4.25's suspicion that
   Shattered Horizon Protagonist / Skyborne Skeleton Dragon are a
   castability problem, not a power problem (both top-4 on the new table at
   1.36/1.34 stranded copies per deck-inclusion), which redirected their
   fix from a third stat bump to a gate ease — see "Cards actioned."
2. **Rarity power curve** — average archetype-normalized cast-win residual
   grouped by printed rarity (console table + `rarityPowerCurve` in the
   JSON dump). First direct data input for pack-odds decisions: **Full-Art
   reads +5.2 to +5.6pt across 26-27 cards (n≈46k) on every run this
   pass** — the chase rarity systematically overperforms its cost bands
   (only Mythic is higher, on a 2-card sample dominated by the Submerged
   Starfall trophy). This supports the 25% Full-Art drop-rate cut shipped
   this pass on the economy side, and flags Full-Art as the rarity band to
   watch on the balance side.

## CPU reasoning lapses

**Detector floor confirmed again, 17th consecutive pass (v4.9→v4.26)** —
every "genuine mistake" detector reads exactly **zero** on all runs:
`lapseMissedLethal(Damage)`, `lapseWastedCastableDie`,
`lapseIdleLeaderAbility_genuine`, `lapseUnitAbilityOrderFixed`,
`unitAbilityMultiCandidate(Tiered)`, `lapseMulliganKeptMarginal`,
`lapseEchoOverAbilitySequencing`. Non-zero counters are the same
known-benign shapes documented every pass since v4.9. **No new
CPU-reasoning bugs found.** (Separately, the interactive frontend's CPU
presentation was overhauled this pass — pacing + step-by-step action
narration — but that is presentational only: the AI's decisions are
byte-identical, enforced by an observer pattern that the headless harness
never passes.)

## A second dead-code class found and fixed: "Bind X"

Investigating why Pulsing Heartstone / Amber Sphere / Resonant Shuriken /
Thornfang Vine had absorbed escalating `MANUAL_VALUE_BUFF` steps (up to +4)
across four passes without their residuals ever closing turned up the
reason: **the engine's `bind` effect ignored `Effect.value` entirely**, so
every value buff on a bind-effect card has been dead code since v4.12 —
the same class of bug as v4.25's gate-cost threshold no-ops. Also true of
`destroy` (locust_veil's +3).

Fixed at the mechanic level: **"Bind X"** — a bind Effect carrying a
numeric value now also saps the bound Unit by that value (engine.ts; UI
label "Bind + Sap X"). Value-less binds (both Leader bind kits, Bubble
Harvest, Bone Splinter Quill) are byte-identical to before, so this
activates only where a value was deliberately printed. Stale accumulated
dead sizes were NOT carried over: entries on cards whose measured signal is
currently clean (The Locksmith's Regret, Kinetic Siphon Swarm, Locust
Veil) were removed outright, and the four bind Charms still flagged this
pass got fresh, deliberately-sized **Bind 2** values.

Post-patch read: the four bind Charms' archetype-normalized deltas sit at
−2.2…+0.3 (they were never personally weak once deck quality is divided
out — their deck-presence residuals are dominated by the one ~18%-win
archetype that drafts them all, which is why every value-side escalation
"failed" to move the table). Carried forward: the bind-Charm archetype
itself (not the cards) is the next thing to look at, alongside
Mer-Warrior / Stormcaller Adept, two new deck-presence nerf-table entries
whose normalized deltas are ≈0 — same archetype-artifact shape, so
deliberately **not** nerfed this pass.

## Keyword health

- **Steel — first real movement after 17 holds, from a card fix, not a
  keyword lever.** Baseline: activation 0.28 (pool floor), delta +21.4pt,
  deckBaseline 23.4% — the same stuck read since v4.21. The final
  verification run shows activation **0.61**, delta **+14.8pt**,
  deckBaseline **37.5%**. Root cause of the stuck read: the pool's only
  *drafted* Steel carriers were the two FullHouse-gated bodies (Shattered
  Horizon Protagonist, with Steel; Skyborne Skeleton Dragon in the same
  decks), so Steel's entire measured cohort was gated behind the pool's
  hardest match gate. Easing that gate (below) mostly dissolved the "thin,
  noisy 2-card cohort" problem the hold was predicated on. Watch next
  pass with the healthier sample.
- **Avenge — resolved via the per-card look v4.25 asked for.** The 5-card
  pool breakdown shows the stable +5.6pt keyword delta was almost entirely
  **Faye's True Face** (+10.9pt normalized vs +1.8–4.0 for the other
  four). Faye took a -3 stat trim (also #8 cardsToNerf in its own right);
  keyword delta read +4.8/+4.6pt in verification. No keyword-wide lever
  touched — correctly so, since four of five carriers are healthy.
- **Pierce — actioned via the non-clamped per-card lever v4.25
  recommended.** The 8-card pool breakdown found five outliers (Nanite
  Division Marshal +19.4, Worm Brain Host +15.9, Dr. Aries +15.5, Void
  Mother +13.6, Titan of the Trench +10.4) vs two healthy cards (Vlad
  +1.9, Baron von Swine +6.3). Void Mother was still wearing a **stale +2
  buff from v4.12** — reverted; Dr. Aries -2→-3, Worm Brain Host -1→-2,
  Nanite Division Marshal first-pass -1. Keyword delta +10.0→+9.9pt so
  far (single-step trims on n≈450–1,250 cards move slowly) — carried
  forward with the per-card lever now established as the working one.
- **Swift** (+11.4pt, activation 0.34) and **Aftershock** (deck baseline
  20.9%→27.0% in verification, helped by Coral Collapse +5) — inside
  their established bands; held.

## Game mechanics

- **"Bind X" added** (see above) — the pass's one real mechanic change,
  sized to activate only on the four flagged cards.
- The `mechanicsToRemoveChangeOrAdd` table shows the same expected shapes
  as every pass since v4.16 (resource-usage mechanics correlate with
  winning; `aftershockQueued/Resolved`'s negative delta is the documented
  "fires while behind, by design" shape). No other mechanic-level change
  warranted.

## Gate-ease misfire (caught by verification, root-caused, fixed)

The first attempt at the SHP/SSD castability fix used `SmallStraight` (the
nominal one-step ease, 5→4.5). The first verification run showed both
cards at **zero deck inclusions** — `decks.ts`'s combo-family coherence
rule (match-family archetypes score a straight gate −6 vs +5) flipped an
11-point scoring swing and ejected them from every deck that drafts them;
since they carry the pool's only drafted Steel, Steel's cohort collapsed
to zero as a side effect (and Faye's True Face, refilling the vacated
slots, jumped to 5,472 inclusions). Re-pointed the override to
**TwoPair** (match-family, 5→3.5) and re-ran the full suite: composition
restored, casts nearly tripled (646→1,802 / 672→1,856), dead-in-hand per
deck-inclusion 1.36→0.91, and both cards dropped off `cardsToBuff`.
Their normalized deltas now read +14.7/+9.1 — flagged as a **watch item**
(the v4.25 +1 stat buffs may now be surplus on top of the working
castability fix; revert candidates next pass if they show up on the nerf
side).

## Cards actioned this pass

Nerf escalations (`MANUAL_STAT_TRIM`): Wasteland Aberration -2→**-4**
(the "bigger step" v4.25's closing note demanded; +32.8→+29.4pt),
Blue-Ringed Octopus / Porcelain Lobster -1→**-2**, Butterflyfish School
-1→**-2** (still cautious given its overshoot history), Faye's True Face
-2→**-3** (+27.1→+24.6pt, also the Avenge fix). Pierce outliers: Dr.
Aries -2→**-3**, Worm Brain Host -1→**-2**, Nanite Division Marshal
first-pass **-1**, Void Mother stale +2 **reverted**.

Cost levers (`MANUAL_THRESHOLD_ADJ`): Cavernous Watcher **+2** (sum
12→14) — stat lever at the -4 ceiling since v4.25, same "cost is the
untried lever" shape as Kinetix Enforcer, and it worked: **dropped off
cardsToNerf entirely** (was #4 at +29.6pt). Kinetix Enforcer held at its
v4.25 setting (also off the list now).

Gate ease (`MANUAL_GATE_OVERRIDE`): Shattered Horizon Protagonist /
Skyborne Skeleton Dragon FullHouse→**TwoPair** (see above).

Value changes (`MANUAL_VALUE_BUFF`): fresh **Bind 2** on Pulsing
Heartstone / Amber Sphere / Resonant Shuriken / Thornfang Vine (replacing
dead +2…+4 entries); Chalice of Quicksilver +1→**+2**, Perpetual Dynamo
+1→**+2**, Coral Collapse +4→**+5**; Wolf of Wall Street +1→**+2**
(stat); Location nerfs Obsidian Bore Site -1→**-2**, Isle of the Ancients
first-pass **-1** (the follow-through v4.25 scheduled after its revert).
Dead entries removed: The Locksmith's Regret, Kinetic Siphon Swarm,
Locust Veil.

Design exception, deliberately left alone again: **Submerged Starfall**
(Yahtzee-gated Mythic trophy, +27.6pt) — per the standing `TROPHY_ID`
rationale.

## Carried forward for next pass

1. SHP/SSD watch item (normalized +14.7/+9.1 post-fix — consider
   reverting their v4.25 +1 stat buffs).
2. Blue-Ringed Octopus / Porcelain Lobster barely moved at -2 (+31.5pt) —
   next escalation step, or a cost-side lever (both are exact-cost Guard
   Commons, the shape `exactCostBudgetCap` exists for).
3. The ~18%-win bind-Charm archetype and the Mer-Warrior / Stormcaller
   Adept archetype-artifact entries — archetype-level look, not card
   patches.
4. Pierce per-card trims — re-read the five outliers with another pass of
   sample.
5. Steel — first fresh read off the healthier 0.61-activation cohort.
