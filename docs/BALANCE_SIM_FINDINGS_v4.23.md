# Balance Sim Findings — v4.23

Full-scale run this pass (matching v4.22's scale): **26,448 games**, 58 decks
(25 archetypes + Location-stripped Twin variants + 8 pure-random control
decks), 8/pairing on the standard roster. **Zero invariant violations**
(`result.errors: []`, `No invariant violations.`) on both the baseline run
and the post-patch verification run. Card pool re-verified in sync with live
Supabase (`dnngihsbqxccqvvedvjc.public.cards`): fetched all 292 rows directly
via the Supabase MCP connection (the sandbox has no direct network egress to
`supabase.co`, so `scripts/fetch-cards.ts` can't run standalone here) and
diffed every field of every card against `src/game/generated-cards.ts` —
292/292 match, zero drift.

## Harness upgrade this pass

**Per-archetype first-player win rate** (`archFirstN`/`archFirstW` in
`simulate-v4.ts`) — the existing `firstWins` counter was pool-wide only, so
it couldn't show whether play/draw sensitivity is even across archetypes (an
aggro deck plausibly cares about the coin flip differently than a control
deck, and that's invisible in one aggregate number). Result this pass: no
archetype shows a first-player delta outside roughly ±4pt of its own overall
win rate (worst: Mer King Avenge Swarm +3.8pt) — first-player advantage
reads as evenly distributed across the roster, not concentrated in any one
archetype/leader. No action needed; kept as a standing regression check for
future passes (a future archetype showing a double-digit first-player delta
would be a real signal worth investigating).

## CPU reasoning lapses

**Detector floor confirmed again, 14th consecutive pass (v4.9→v4.23)** —
every "genuine mistake" detector reads exactly **zero**: `lapseMissedLethal`,
`lapseMissedLethalDamage`, `lapseWastedCastableDie`,
`lapseIdleLeaderAbility_genuine`, `lapseUnitAbilityOrderFixed`,
`unitAbilityMultiCandidate(Tiered)`, `lapseMulliganKeptMarginal`,
`lapseEchoOverAbilitySequencing` are all 0/26,448 games. Non-zero counters
remain the same known-benign shapes documented every pass since v4.9:
`unusedDiceCount` (structural — 5 fresh dice/turn vs. ~1 drawn card, Pitch is
the designed sink), `lapseGreedyAssignmentFixed` (3.38/game — the die→slot
solver actively correcting a naive greedy pick, working as intended), and
`lapseIdleLeaderAbility_refusalNoTarget` (0.94/game — a no-repeat-target
Ability with genuinely no legal alternate target). **No new CPU-reasoning
bugs found this pass.** As with every pass since v4.9, this reads as the AI
being at a real quality ceiling for the existing detector set — no new
failure mode was observed to justify inventing a new detector class this
pass either.

## Keyword health

No keyword crossed into new nerf/buff territory this pass; all prior design
rulings held:

- **Steel** — held again, not cut a 5th time. Activation 0.27 (still the
  pool floor), fired-delta +22.5pt (still the largest per-fire swing of any
  keyword) — same "thin, noisy 2-card cohort" read as v4.22. No new signal
  to reopen the hold.
- **Swift** — activation 0.36, delta +13.3pt, still inside the "24-34%
  activation / +10-13pt delta" band v4.21 explicitly closed this under
  (right at the edge, same as v4.22). Left alone.
- **Avenge** — fired-delta +3.5pt, identical to v4.21/v4.22's post-cap-cut
  number. Confirmed stable a second time.
- **Aftershock** — deck-baseline win% still the pool's second-worst (19.3%),
  fired-win% still bad (22.5%), but activation is healthy (0.57) and the
  fired-delta is still *positive* (+3.2pt) — same "the cards are weak, not
  the keyword" read as v4.22. Still carried forward as a per-card issue
  (only 3 pool cards carry it), not actioned as a keyword-level lever this
  pass either (budget).

`mechanicsToRemoveChangeOrAdd` again surfaced nothing beyond Aftershock
(covered above) — `dieRerolled`/`comboFired`/`tributeTriggered`/
`locationCast`/Twin all show the expected "using your resources correlates
with winning" shape. **No mechanic removal/change/addition actioned this
pass** — nothing in the data supports one.

## Cards actioned this pass

Same "repeat offender held flat across a full-scale pass → take one more
step" escalation pattern this file has used since v4.17-v4.22, applied to
the six v4.22 nerfs and six v4.22 buffs that were still top-10
`cardsToNerf`/`cardsToBuff` this pass, plus two reversions and two new
first-pass entries:

**Nerf escalations** (`MANUAL_STAT_TRIM`, Units — one more stat-trim step):

| Card | Was | Now | Why |
|---|---|---|---|
| Astral Shoal | -3 | -4 | still #1 cardsToNerf, +35.5pt resid |
| Kinetix Enforcer | -2 | -3 | still #3 cardsToNerf, +32.6pt resid |
| Swaying Garden | -2 | -3 | still #8 cardsToNerf, +31.2pt resid |
| Clockwork Nautilus | -1 | -2 | still top-12, +31.2pt resid |
| Gulper Eel | -1 | -2 | still top-12, +31.2pt resid |
| Playful Otters | -1 | -2 | still top-12, +31.2pt resid |
| Cavernous Watcher | -1 | -2 | still top-12, +31.3pt resid |

**Nerf escalation** (`MANUAL_VALUE_BUFF`, Location, no Cast Slot cost to
raise): Petrified Ribs Citadel -1 → -2 (still #2 cardsToNerf, +33.2pt
resid — same lever/pattern as `mist_ghost_ship`/`ribvault_cathedral`).

**Reversions** (a prior patch overshot past neutral into the *opposite*
outlier bucket — same "revert rather than compound" pattern
`mesozoic_exchange_student`/`the_wolf_of_wall_street`'s v4.18 history
already used, rather than stacking a fresh nerf on top of a buff or vice
versa):

- `the_wolf_of_wall_street`'s v4.20 -1 nerf overshot — it's back on
  `cardsToBuff` this pass (resid=-32.2pt, n=912). Entry removed.
- `jawbone_span`'s v4.12 +1 buff overshot — it's now #10 `cardsToNerf`
  (resid=+29.3pt, n=912). Entry removed.

**First-pass entries** (no prior manual patch, all n=912+, all top-12
`cardsToNerf`/`cardsToBuff` this run):

- Buff (`MANUAL_STAT_TRIM`, Unit): Nebula Snail +1.
- Buffs (`MANUAL_VALUE_BUFF`, Locations, no Cast Slot cost to ease):
  Blackspire Obelisk +1, Ossuary Vault +1.

**Buff escalations** (`MANUAL_VALUE_BUFF`, Charm/Event — one more +1 step;
`kinetic_siphon_swarm`/`diver_s_lantern` dropped off the top-10
`cardsToBuff` list this run and were left at +1 rather than escalated
blind):

| Card | Was | Now | Why |
|---|---|---|---|
| Pulsing Heartstone | +1 | +2 | still #1 cardsToBuff, -41.8pt resid |
| Locust Veil | +1 | +2 | still #2 cardsToBuff, -37.6pt resid |
| Thornfang Vine | +1 | +2 | still #3 cardsToBuff, -37.0pt resid |
| Amber Sphere | +1 | +2 | still top-5, -34.1pt resid |
| Resonant Shuriken | +1 | +2 | still top-5, -34.1pt resid |
| Coral Collapse | +1 | +2 | still top-6, -32.8pt resid, n=3648 |

**Not actioned — carried forward:** Where the Deep Meets the Sky is still
+30.2pt resid this pass despite already carrying this file's single largest
stat trim (-4, at the pool's max cast-difficulty band, can't cost more).
Same call as v4.22: this reads as a genuine design-tension case (its
3-keyword Frenzy/Overrun/Avenge stack may need a keyword swap, not another
stat cut) needing a human design decision, not a 5th automatic escalation.

Verification: re-ran the full 26,448-game suite after applying every patch
above — zero invariant violations, same overall shape (individual patched
cards' win% didn't move outside this run's per-run noise band yet, which
matches this file's own established pattern: a single stat-trim step
typically takes 1-2 more full-scale passes to visibly close a residual —
see the astral_shoal/kinetix_enforcer escalation histories above for exactly
that shape playing out over 3+ passes each).

## Non-balance changes this pass

- **Bounty Shop card display**: `StoreScreen.tsx`'s `BountiesTab` was
  rendering bounty cards with a bespoke `SafeImage` + hand-rolled rarity
  chip instead of the shared `CardFace` template every other screen
  (Collection, Marketplace, Deck Builder, Pack Opening) uses — it was
  missing the real per-rarity card frame, background treatment, and border
  ring. Switched to `<CardFace def={...} size="compact" />`, resolving the
  card def from `POOL_BY_ID` (falling back to a synthesized minimal def if a
  bounty card is somehow outside the live pool, matching the existing
  `defFor` pattern in `MarketplaceScreen.tsx`).
- **Full-Art pack odds**: Full-Art was landing at roughly 1/6th of
  Super-Rare's chance in every chase/box-topper/synergy slot that carries it
  (e.g. the standard box chase slot: Full-Art 0.025 vs. Super-Rare 0.15).
  Task ask was for Full-Art to be only ~15% rarer than Super-Rare, not a
  whole tier further out — rebalanced every affected slot
  (`rebalance_full_art_odds_15pct_below_super_rare` migration) so
  Full-Art's weight is now `0.85 × that slot's Super-Rare weight` in every
  pack/box that carries it (Blue Coral/Crimson Circuit/Dragonbone Wastes
  Booster Pack & Box, Standard Box, Season Pass Reward Pack), with the
  probability mass taken from/returned to that same slot's Rare weight so
  each slot still sums to 1.
- **Docs**: `docs/ROADMAP.md` had three "Near/Medium term" items that
  already shipped — the guided first-match coach (`CoachOverlay.tsx`),
  confirm dialogs on destructive actions (v4.22 bug hunt), and daily
  quests/login rewards (Missions + the daily Bounty Shop + Daily Free Pack)
  — removed from the roadmap rather than left stale.

Full raw console transcript of the baseline (pre-patch) run:
`docs/sim-runs/` output is gitignored and regenerated via `npm run sim:v4`;
this file is the durable record.
