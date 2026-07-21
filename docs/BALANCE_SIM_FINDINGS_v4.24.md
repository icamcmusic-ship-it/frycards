# Balance Sim Findings — v4.24

Full-scale run this pass (matching v4.22/v4.23's scale): **26,448 games**, 58
decks (25 archetypes + Location-stripped Twin variants + 8 pure-random
control decks), 8/pairing on the standard roster. **Zero invariant
violations** (`errors: []`, `No invariant violations.`) on both the baseline
run and the post-patch verification run. Card pool re-verified in sync with
live Supabase (`dnngihsbqxccqvvedvjc.public.cards`): pulled all 292 rows via
the Supabase MCP connection (`id, name, card_type, rarity, set_name,
flavor_text, image_url`, hashed server-side with `md5()` to avoid a
124K-character single-line transfer) and diffed every field of every card
against `src/game/generated-cards.ts` — 292/292 match, zero drift, zero rows
missing on either side.

## Harness upgrade this pass

**Hand-limit forced-discard tracking** — `finishEndPhase`'s End Phase
discard-to-`HAND_LIMIT` (8) mechanic had **zero instrumentation** of any
kind before this pass, despite existing since v4.3. Added: a total counter
(`g.stats.handLimitDiscards`), a per-game decision flag
(`handLimitDiscardOccurred`, wired into the existing win-correlation table),
and a per-card breakdown (`handLimitDiscardCount`, a new report section —
"Cards most often forced out by the hand-limit discard") normalized by
deck-inclusion count. Result this pass: hitting the hand cap correlates with
a **-9.2pt to -9.6pt** win-rate delta (did=42.3-42.9% vs did-not=51.4-51.5%,
consistent across both the baseline and verification runs) — a real,
previously-invisible signal, and the per-card table cleanly identifies which
specific cards clog hands most (Violet Haze Kunoichi, Void Mother, Familiar
in the Dark, The Abyssal Gate — all high-threshold/hard-to-cast cards that
sit in hand waiting for a die that doesn't come). **Not actioned this pass**
(surfaced too late in the pass to size a fix against; carried forward as a
concrete, data-backed "game mechanics" watch item for the next pass — same
"surfaced, no budget this pass" pattern Aftershock sat in for several passes
before v4.24 finally actioned it, see below).

## CPU reasoning lapses

**Detector floor confirmed again, 15th consecutive pass (v4.9→v4.24)** —
every "genuine mistake" detector reads exactly **zero** on both the baseline
and verification runs: `lapseMissedLethal`, `lapseMissedLethalDamage`,
`lapseWastedCastableDie`, `lapseIdleLeaderAbility_genuine`,
`lapseUnitAbilityOrderFixed`, `unitAbilityMultiCandidate(Tiered)`,
`lapseMulliganKeptMarginal`, `lapseEchoOverAbilitySequencing` are all
0/26,448 games, both runs. Non-zero counters remain the same known-benign
shapes documented every pass since v4.9 (`unusedDiceCount`,
`lapseGreedyAssignmentFixed`, `lapseIdleLeaderAbility_refusalNoTarget`).
**No new CPU-reasoning bugs found this pass** — same quality-ceiling read as
every pass since v4.9.

## Keyword health

- **Steel** — held again (16th hold). Activation 0.28 (still the pool
  floor), fired-delta +21.5pt post-patch (verification run) — same "thin,
  noisy 2-card cohort" read as every pass since v4.21. No new signal to
  reopen the hold.
- **Swift** — activation 0.34, delta +12.6pt post-patch — still inside the
  "24-34%/+10-13pt" band v4.21 closed this under. Left alone.
- **Avenge** — fired-delta moved from +3.6pt (baseline) to +5.6pt
  (post-patch verification), and the keyword's pool shrank from 6 to 5 cards
  — this is a **direct, expected side effect** of this pass's
  `MANUAL_KEYWORD_REMOVE` action stripping Avenge off
  `where_the_deep_meets_the_sky` (see Cards actioned below), not a fresh
  independent signal. Flagged as a **watch item for next pass**: if the
  delta is still elevated on a completely independent baseline run (not a
  same-pass before/after comparison), it may warrant a real look; too early
  to call this pass.
- **Aftershock** — actioned this pass (see below) after sitting
  "carried forward, not actioned (budget)" since v4.22. Deck-baseline win%
  improved slightly (19.8% baseline → 20.5% post-patch in the same pass,
  consistent with the two new first-pass card buffs below already pulling
  some weight even before a dedicated follow-up run) but is still the
  pool's second-worst. Activation stayed healthy (0.56-0.57) and the
  fired-delta stayed positive (+2.4 to +3.1pt) throughout — confirms the
  standing "the cards are weak, not the keyword" read.

`mechanicsToRemoveChangeOrAdd` again surfaced nothing beyond Aftershock and
the new hand-limit-discard signal (both covered above) —
`dieRerolled`/`comboFired`/`tributeTriggered`/`locationCast`/Twin all show
the expected "using your resources correlates with winning" shape.

## Cards actioned this pass

Same escalation pattern this file has used since v4.17: repeat offenders
that held flat across last pass's patch get one more step; first-pass
entries get a modest opening move; cards that dropped off the top-10 lists
are left flat rather than escalated blind.

**Keyword ability removals** (`MANUAL_KEYWORD_REMOVE`, new mechanism this
pass) — two repeat-offender trophy Units that already hit
`MANUAL_STAT_TRIM`'s established -4 ceiling in v4.23 (the same cap
`vampire_squid`/`half_faded_shade` are already at) while **still** topping
`cardsToNerf` a full pass later — exactly the "design-tension case, may
need a keyword swap, not another stat cut" call v4.22/v4.23 flagged and
deferred. A stat trim can't cut any further, so the residual came off the
stacked keyword count instead (cost is deliberately left unchanged — still
priced for the removed keyword's cost weight — so "pay the old price, get
less" is the nerf, the same shape a stat trim already has):

| Card | Removed | Kept | Why |
|---|---|---|---|
| Astral Shoal | Echo | Guard, Bulwark | still #1 cardsToNerf at the -4 stat ceiling, +35.7pt resid — Echo (recur from discard) is what turned "survives" into "doesn't even need to" |
| Where the Deep Meets the Sky | Avenge | Frenzy, Overrun | still #5 cardsToNerf at the -4 stat ceiling + max cast-difficulty band, +29.6pt resid — Avenge (payout on death) is what made trading it away still a win |

**Result: both cards dropped completely off the top-10 `cardsToNerf` list**
in the post-patch verification run (single pass, not the usual 1-2-pass
lag) — the strongest single-pass close this file has recorded for a repeat
offender.

**Nerf escalations** (`MANUAL_STAT_TRIM`, Units — one more stat-trim step):

| Card | Was | Now | Why |
|---|---|---|---|
| Kinetix Enforcer | -3 | -4 | still #2 cardsToNerf, +32.1pt resid |
| Cavernous Watcher | -2 | -3 | still #3 cardsToNerf, +31.0pt resid |
| Clockwork Nautilus | -2 | -3 | still top-8, +28.9pt resid |
| Gulper Eel | -2 | -3 | still top-9, +28.9pt resid |
| Playful Otters | -2 | -3 | still top-10, +28.9pt resid |

Kinetix Enforcer and Cavernous Watcher both **held their new trim flat and
stayed in the top-10** on the post-patch verification run — expected (this
file's own established pattern: a single stat-trim step typically takes
1-2 more full-scale passes to visibly close), carried forward for the next
pass's escalation rather than double-stepped in the same sitting.

**Nerf escalation** (`MANUAL_VALUE_BUFF`, Location): Petrified Ribs Citadel
attempted -2 → -3, but this surfaced a real bug — the -3 value clamps to
the *identical* floored onCast value as -2 (verified directly: this card's
onCast buff was already at its floor of 1), making a "-3" entry a
cosmetic no-op with zero actual effect. Reverted to -2 and added a
`Math.max(1, …)` floor clamp to both `MANUAL_VALUE_BUFF` call sites
(`mapSpell`/`mapLocation`) so this class of silent no-op — or worse, an
*illegal* sub-1 printed value — can't happen again for any card (this
would otherwise have shipped a value of 0, which `catalog.test.ts` actually
caught: `petrified_ribs_citadel onCast: buff needs value >= 1`). Carried
forward as a design-tension case (same shape as the keyword removals
above — the value lever is exhausted, needs a different lever next pass).

**First-pass nerfs** (no prior manual patch, both new top-10
`cardsToNerf` entries this run):

- Ember Whisperer (`MANUAL_STAT_TRIM`, Unit): -1. Also independently
  flagged "under-costed" on the printed-power `costVsAbilityMismatches`
  table (z=+3.22, tied for the pool's single highest z-score) — a rare case
  where the measured win-rate residual and the printed-stats screen agree.
  Dropped off the top-10 `cardsToNerf` list entirely in the verification
  run.
- Jawbone Span (`MANUAL_VALUE_BUFF`, Location): -1. Its v4.12 +1 buff was
  reverted in v4.23 after overshooting into `cardsToNerf`; reverting to
  neutral wasn't enough on its own — it was still #6 `cardsToNerf`
  (resid=+29.3pt, unchanged from the v4.23 read) at 0 adjustment, so it
  gets a real first-pass nerf this time instead of sitting un-actioned a
  second time. Dropped off the top-10 list in the verification run.

**Buff escalations** (`MANUAL_VALUE_BUFF`, Charm/Event — one more +1 step):

| Card | Was | Now | Why |
|---|---|---|---|
| Pulsing Heartstone | +2 | +3 | still #1 cardsToBuff, -41.0pt resid |
| Locust Veil | +2 | +3 | still #2 cardsToBuff, -36.0pt resid |
| Thornfang Vine | +2 | +3 | still #3 cardsToBuff, -35.7pt resid |
| Amber Sphere | +2 | +3 | still top-5, -32.5pt resid |
| Resonant Shuriken | +2 | +3 | still top-5, -32.5pt resid |
| Coral Collapse | +2 | +3 | still top-6, -32.3pt resid, n=3648 |
| Kinetic Siphon Swarm | +1 | +2 | back in top-10 (was off it in v4.23), -30.9pt resid |

Thornfang Vine, Locust Veil and Nebula Snail all dropped completely off the
top-10 `cardsToBuff` list in the verification run.

**Buff escalations** (`MANUAL_STAT_TRIM`, Units — one more +1 step):

| Card | Was | Now | Why |
|---|---|---|---|
| Nebula Snail | +1 | +2 | still top-10 cardsToBuff, -30.9pt resid (baseline) |
| Phantom Squadron | +1 | +2 | still top-10 cardsToBuff, -30.9pt resid (baseline) |

**First-pass buff** (`MANUAL_STAT_TRIM`, Unit): The Wolf of Wall Street +1.
Its v4.20 -1 nerf overshot and was reverted in v4.23 (entry removed); it
was still underperforming post-revert (resid=-31.6pt, n=912) rather than
settling back to neutral, so it gets a small first buff step this pass
instead of sitting un-actioned a second time — sized cautiously given this
card's history of overshooting in both directions across its last three
patches (v4.12 buff → v4.18 revert → v4.20 nerf → v4.23 revert). Dropped
off the top-10 list in the verification run.

**Aftershock per-card action** (`MANUAL_VALUE_BUFF`, Events, first-pass):
`bioluminescent_tide` +1, `flash_freeze` +1 (the keyword's other two pool
cards — the third, `coral_collapse`, is already covered by its own
escalation above). This is the lever v4.22/v4.23 both explicitly named
("the cards are weak, not the keyword") but never had budget to action;
actioned this pass.

Verification: re-ran the full 26,448-game suite after applying every patch
above — zero invariant violations, `npx vitest run` 107/107 passing
(including `catalog.test.ts`'s value-floor check, which caught the
Petrified Ribs Citadel no-op bug above before it shipped). Every actioned
card in the top-10 `cardsToNerf`/`cardsToBuff` lists moved measurably;
five of them (both keyword removals, Ember Whisperer, Jawbone Span, The
Wolf of Wall Street) closed completely off their respective top-10 list in
a single pass — a notably faster close than this file's usual 1-2-pass lag,
plausibly because stacking multiple independent levers (keyword removal +
the existing stat ceiling, or a first-nerf on a card with zero prior
adjustment) moves the residual harder than one more incremental step on an
already-adjusted lever.

## Non-balance changes this pass

A parallel full feature/bug hunt (7 independent sweeps across every
screen/component in `src/components/` and `src/meta/`) found and fixed
(full detail in `CHANGELOG.md`'s v4.24 entry):

- **A permanently-stuck app**: `MetaContext.tsx`'s per-user data bootstrap
  had no error handling at all — a network hiccup right after login left
  the whole app on "Loading…" forever, no retry possible.
- **Dead leader-ownership validation**: `DeckBuilderScreen.tsx`'s
  leader-lock check only ever scanned `card_ids`, and Leaders can never
  appear there — the check that's supposed to stop double-committing a
  single-copy Leader across two decks could never actually fire.
- **A tutorial that could never complete**: `CoachOverlay`'s first-match
  walkthrough only marked itself done from its own final button, but the
  CPU-turn stage advances on its own timers with no player input required —
  miss that one click and the entire 5-step tutorial silently replayed from
  step 1 on every future match, indefinitely.
- **Keyword/cost popovers eating clicks meant for something else**: a
  full-viewport invisible backdrop meant to close the popover on outside
  click sat at a very high z-index over everything, so the first click on a
  *different* keyword chip just closed the current popover instead of
  opening the one the player actually clicked.
- 20+ additional bugs (silent error-swallowing across ~15 `supabase.ts`
  read functions, several missing confirm dialogs, a stale-response race
  in Player Shops' pool preview, ended auctions still showing live bid/buy
  buttons, and more) plus a QOL/accessibility pass (focus management and
  `role="dialog"` on every remaining un-labeled modal/overlay, Escape-to-
  close on keyword popovers, several missing `SafeImage` fallbacks).

## Docs

Reviewed the full `docs/` tree for staleness. `docs/ROADMAP.md`,
`docs/RULEBOOK.md`, `docs/KEYWORD_TIERS.md`, `docs/COLOR_IDENTITY.md` and
`docs/PVP_DESIGN.md` are all current and already self-documenting about
their own supersession history where relevant — nothing removed. The
per-pass `BALANCE_SIM_FINDINGS_v4.*.md` series (v4.5 → this file) remains
the durable historical record, referenced from both `README.md` and
`CHANGELOG.md` — not pruned.

Full raw console transcripts of both the baseline and post-patch
verification runs: `docs/sim-runs/` output is gitignored and regenerated
via `npm run sim:v4`; this file is the durable record.
