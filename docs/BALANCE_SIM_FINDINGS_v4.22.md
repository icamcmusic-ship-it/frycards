# Balance Sim Findings — v4.22

Full-scale run this pass (unlike v4.21's CPU-constrained 8/pairing sample):
**26,448 games**, 58 decks (25 archetypes + Location-stripped Twin variants +
8 pure-random control decks), 8/pairing on the standard roster, real hardware
throughput this session. **Zero invariant violations**
(`result.errors: []`, `No invariant violations.`). Card pool re-verified in
sync with live Supabase (`dnngihsbqxccqvvedvjc.public.cards`): a full
row-content MD5 hash (not just IDs) of `src/game/generated-cards.ts` matches
the live table exactly, 292/292 — no drift, no re-fetch needed.

## Harness upgrades this pass

1. **Set-level win rate** (`R.setInDeck`/`setInWinDeck` in `simulate-v4.ts`)
   — deck contains ≥1 card from a given set → win%, same "once per deck"
   convention as `keywordInDeck`/`typeInDeck`. Needed now that the pool spans
   4 sets (Blue Coral, Crimson Circuit, Dragonbone Wastes, Full Arts
   Collection 1) and the shop overhaul this pass (see below) adds per-set
   packs — a direct read on whether any one set's cards are over/under
   powered as a group, which no prior table could isolate.
2. **Keyword-count-per-card distribution** — a static pool-shape report (not
   win-rate), added directly to size the "keywords overflow the card face"
   UI bug (see Non-balance changes below) against real numbers instead of a
   guess: only 12/292 cards carry 3+ simultaneous keywords, max 4.

Full raw JSON: `docs/sim-runs/v4-2026-07-21T09-05-34-971Z.json`; console
transcript: `docs/sim-runs/v4.22-console.log`.

## Set win rate (new this pass)

```
Dragonbone Wastes        win%=51.6  (n=46512)
Crimson Circuit          win%=51.2  (n=36480)
Blue Coral               win%=50.0  (n=52896)
Full Arts Collection 1   win%=48.4  (n=39216)
```

All four sets land within ~3pt of 50% — no set-level power imbalance. Good
sanity check before shipping per-set booster packs/boxes this pass (see
below): none of the three real sets are a stealth-strong or -weak pull
relative to the others.

## CPU reasoning lapses

**Detector floor confirmed again** — every "genuine mistake" detector reads
exactly **zero** this pass: `lapseMissedLethal`, `lapseWastedCastableDie`,
`lapseIdleLeaderAbility_genuine`, `lapseUnitAbilityOrderFixed`,
`unitAbilityMultiCandidate(Tiered)`, `lapseMulliganKeptMarginal`,
`lapseEchoOverAbilitySequencing` are all 0/26,448 games. This matches every
pass back to v4.9's original "detector floor" finding — the remaining
non-zero counters are either structural (`unusedDiceCount` — 5 fresh dice/
turn vs ~1 drawn card, Pitch is the designed sink), working-as-intended
solver activity (`lapseGreedyAssignmentFixed`, 3.36/game — the die→slot
solver actively correcting what a naive greedy pick would have done wrong),
or legal refusals (`lapseIdleLeaderAbility_refusalNoTarget`, 0.93/game — a
no-repeat-target Ability with genuinely no legal alternate target).
**No new CPU-reasoning bugs found this pass.** Confirms the AI has been at a
real quality ceiling for the existing detector set across 13+ consecutive
passes (v4.9→v4.22); further gains here need a new detector class, not more
tuning of the existing ones — no new class was obviously missing this pass,
so none was added (inventing one without a concrete failure mode to target
would just be noise).

## Keyword health

- **Steel — held, not cut a 4th time.** Deck-baseline win% is still the
  pool floor (21.8%), but activation is now down to **0.27** (lowest of any
  keyword, after three successive print-rate cuts: 1-in-9 → 1-in-12 →
  1-in-15) and its fired-win-delta is **+22.6pt** — by far the single
  biggest per-fire swing of any keyword. Only 2 pool cards carry it. Reading
  this as "Steel itself is fine-to-strong when it fires; the deck-baseline
  number is dragged down by a thin, noisy cohort" rather than "Steel is
  OP" — a 4th print-rate cut would push activation even lower without
  addressing the actual signal (the two Steel-carrying cards' non-Steel
  stats/synergy, or the archetypes that draft them). **Design call: hold.**
  Re-open only if a future pass's activation climbs back up while the
  deck-baseline stays on the floor — that would mean the earlier "it's a
  thin cohort" read was wrong.
- **Avenge — confirmed stable.** v4.21's cap cut (2→1) held: fired-delta
  is +3.5pt this pass, same as v4.21's post-cut number. No further action.
- **Swift — still within its historical band, per v4.21's explicit design
  ruling.** Activation 0.36, delta +13.3pt — at the edge of but still inside
  the "24-34% activation / +10-13pt delta" band v4.21 closed this under.
  Leaving alone again; the ruling was to only reopen on a real drift outside
  the band, and this reads as noise around the edge, not a drift.
- **Aftershock — deck-baseline win% is the second-worst in the pool (19.0%)
  and fired-win% is still bad (22.0%)**, but activation is a healthy 0.56
  and the fired-delta is *positive* (+3.1pt) — this isn't "the keyword drags
  decks down when it fires," it's "decks/cards carrying Aftershock are just
  weak overall, with or without it firing." Only 3 pool cards carry
  Aftershock. **Carried forward**: needs a per-card look at those 3
  specific cards (not a keyword-level lever) next pass — out of scope for
  this pass's budget.

## Mechanics

`mechanicsToRemoveChangeOrAdd` (largest |delta| from the mechanic-engagement
table) surfaced nothing alarming beyond Aftershock (covered above) —
`dieRerolled`/`comboFired`/`tributeTriggered`/`locationCast` all show the
expected "using your resources correlates with winning" shape, not a design
problem. No mechanic removal/addition actioned this pass.

## Cards actioned this pass

**Escalations** (existing `MANUAL_STAT_TRIM`/`MANUAL_VALUE_BUFF` entries that
held flat across 2+ more full-scale passes without the residual closing —
same "barely moved, take a bigger step" pattern used throughout this file's
history):

| Card | Was | Now | Why |
|---|---|---|---|
| Astral Shoal | -2 | -3 | still #2 cardsToNerf, +35.2pt resid, n=1824 |
| Kinetix Enforcer | -1 | -2 | still #3 cardsToNerf, +35.0pt resid, n=1824 |
| Boneplate Sentinel | -1 | -2 | still top-10 costVsAbilityMismatches (z=+2.19) |
| Swaying Garden | -1 | -2 | still #4 cardsToNerf, +34.7pt resid, n=912 |
| Mist Ghost Ship | -1 | -2 | still top-10 costVsAbilityMismatches (z=+2.65) |
| Ribvault Cathedral | -1 | -2 | still top-10 costVsAbilityMismatches (z=+2.65) |

**First-pass entries** (no prior manual patch, all n=912+, all top-12 on
`cardsToNerf`/`cardsToBuff` this run):

- Nerfs (`MANUAL_STAT_TRIM`, Units): Clockwork Nautilus, Gulper Eel, Playful
  Otters, Cavernous Watcher — all -1.
- Nerfs (`MANUAL_VALUE_BUFF`, Locations, no Cast Slot cost to raise):
  Petrified Ribs Citadel (-1, this run's #1 worst residual at +36.7pt),
  Heart of the Thermal Grid (-1).
- Buffs (`MANUAL_STAT_TRIM`, Units): Phantom Squadron, Glowing Manta — both
  +1. **Note**: both also show up as "under-costed" on the separate
  printed-power `costVsAbilityMismatches` table — that table measures
  DESIGNED power-per-cost from raw stats, this buff follows the MEASURED
  win-rate residual instead (the two disagree exactly because these cards'
  kit doesn't cash in its paper efficiency; buffing them lets the paper
  efficiency actually show up rather than doubling down on the wrong
  metric by raising their cost).
- Buffs (`MANUAL_VALUE_BUFF`, Charm/Event): Pulsing Heartstone (this run's
  worst residual overall, -44.0pt), Thornfang Vine, Locust Veil (already had
  a `MANUAL_GATE_OVERRIDE` easing its combo gate — still #3 worst residual,
  so it also gets a value buff this pass), Amber Sphere, Resonant Shuriken,
  Coral Collapse (n=3648, the largest-sample entry on the whole buff list —
  high confidence), Kinetic Siphon Swarm, Diver's Lantern — all +1.

**Not actioned — carried forward:**

- **Where the Deep Meets the Sky** — still +32.7pt resid (this run's #9
  worst) despite already carrying this file's single largest stat trim
  (-4) from a prior pass, applied against the pool's max cast-difficulty
  band (6.0, can't cost more). Three stat-trim escalations haven't closed
  the gap. Reads as a genuine design-tension case, not a sizing problem —
  the card's 3-keyword stack (Frenzy/Overrun/Avenge) may need one of those
  keywords swapped rather than another stat cut. Needs a design decision,
  not another blind trim.
- **Driftwood Harp / Ribbone Longbow** — still top-10 `costVsAbilityMismatches`
  (z=+2.69 each) despite two prior threshold escalations (+1 v4.17, +2
  v4.20). Both are exact-cost Charms already near the format's practical
  ceiling. Not escalated a 3rd time this pass — the persistent z-score
  despite real cost hikes suggests the payoff VALUE is the actual outlier,
  not the cost; next pass should try a value nerf instead of another
  threshold bump.
- **Mer King Toll-Echo Control (14.4% this run, this pass's single worst
  archetype win rate) / Mer King Twin Heal (23.6%)** — both chronically
  weak across many passes (Twin Heal since v4.9/v4.10; Toll-Echo Control
  since v4.15) despite several targeted per-card patches along the way
  (`cardpool.ts`'s own comments document three prior Leader-kit compensation
  attempts, all reverted). Not touched again this pass — repeatedly
  patching individual cards in these two archetypes hasn't moved the
  floor; the code's own history suggests the next lever needs to be a
  genuine Leader-kit-level design change, which is out of this pass's
  scope/budget. Flagging for a dedicated pass rather than another
  guess-and-check card nudge.
- **Apex Nanite Shinobi's 31.4% leader win rate** reads worse in the
  aggregate than its actual archetype spread (36.8%-60.0% across its 4
  archetypes, comparable to other Leaders' spread) — the aggregate is very
  likely dragged down by the `[noLoc]` Location-stripped test variants and/or
  random-deck games sharing the same `leaderId`, both intentionally
  low-quality control constructs, not representative piloted decks. Steel
  and Avenge (Shinobi's two signature keywords) were already addressed
  above. Not treated as a fresh Shinobi-specific regression this pass.

## Non-balance changes this pass

Alongside this balance pass, three other workstreams shipped on this
branch (see individual commits / other section headers in this doc's
sibling PR for detail):

- **Full shop/store overhaul**: pity system removed entirely
  (`profiles.packs_since_super_rare` column dropped, `grant_pack_contents`'s
  pity block deleted, UI pity banner removed); `pack_types` pruned to
  exactly Daily Free Pack / Starter Pack / Standard Box (plus the
  non-purchasable Starter Box onboarding grant and Season Pass reward
  pack) — every other pack/box row deleted, with achievement/battle-pass
  rewards that referenced a deleted pack redirected to an equivalent
  credits amount; added one swipeable-per-set booster-pack store slot and
  one swipeable-per-set booster-box slot (Blue Coral / Crimson Circuit /
  Dragonbone Wastes, each also able to pull from Full Arts Collection 1,
  same odds as the old Standard Booster Pack/Box); added a daily rotating
  5-card Bounty Shop (2 Uncommon/1 Rare/1 Super-Rare/1 Full-Art-or-better,
  sell for 5x quicksell price capped at 1/card and 3/day, buy for 3x price,
  bounty-bought cards barred from selling back); pack listings now show
  every set they draw from.
- **Card-face rendering fixes**: showcase-add button, keyword/flavor-text
  overflow on heavily-keyworded cards (display cap + graceful clipping —
  see the Keyword count per card data point above), the color pip
  (dropped the unrelated MTG-style letter for a plain color swatch), the
  Ultra-Rare border ring (now actually hugs the card's outer edge instead
  of sitting inset), and the Full-Art bottom color band (removed so
  full-art images run edge-to-edge).
- **App-wide bug hunt / QoL pass** across the meta screens and game board,
  independent of balance.

Docs cleanup: `docs/ROADMAP.md`'s Set 4 item reworded (was awkwardly
phrasing an already-shipped Set 3 as upcoming), `CHANGELOG.md` backfilled
with the missing v4.21 entry, `docs/PVP_DESIGN.md`'s stale architecture
description corrected to match the real `useState`-based engine (no
`gameReducer`/`useReducer` exists). No `BALANCE_SIM_FINDINGS_*.md` files
deleted — per-version findings are an intentional changelog-style history
referenced from `CHANGELOG.md`, all still carry unique data.

## Carried into next pass

1. Aftershock's 3 pool cards — per-card investigation, not a keyword lever.
2. Where the Deep Meets the Sky — design decision on its 3-keyword stack,
   not another stat trim.
3. Driftwood Harp / Ribbone Longbow — try a value nerf instead of a 3rd
   cost escalation.
4. Mer-King's two floor archetypes (Toll-Echo Control 14.4%, Twin Heal
   23.6%) — needs a Leader-kit-level look, not another per-card nudge.
5. Re-verify this pass's new/escalated entries on the next full-scale run.
