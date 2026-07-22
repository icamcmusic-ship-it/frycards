# Balance Sim Findings — v4.25

Full-scale run this pass (matching v4.22-v4.24's scale): **26,448 games**, 58
decks (25 archetypes + Location-stripped Twin variants + 8 pure-random
control decks), 8/pairing on the standard roster. **Zero invariant
violations** across all three full-scale runs this pass (baseline,
mid-pass verification, and the final re-verification after the Pierce
investigation below — see "Harness upgrade" and "Pierce" sections). Card
pool re-verified in sync with live Supabase (`dnngihsbqxccqvvedvjc.public.cards`):
pulled all 292 rows via the Supabase MCP connection, hashed every field
(`name`/`card_type`/`rarity`/`set_name`/`flavor_text`/`image_url`) with
`md5()` server-side, and diffed against `src/game/generated-cards.ts` —
292/292 match, zero drift, zero rows missing on either side. The app is
already using the full live card pool.

## Harness upgrade this pass

**Per-card attribution for the `lapseWastedCastableDie` lapse counter** —
this detector (a legally-payable die going unplaced while a castable card
sits in hand) has existed since v4.10 as a pool-wide total only. Added a
per-card breakdown (`lapseWastedCastableDieCount`, same `<prefix>:<cardId>`
decision-key convention v4.24 used for `handLimitDiscardCount`) and a new
report table ("Cards most often left un-cast despite a payable die going
unspent"), normalized by deck-inclusion count like the existing hand-limit
table. Distinct signal from hand-limit discards: this would fire at the
moment of the missed cast, not after End Phase eventually forces the card
out. Result this pass: the table is **empty** — `lapseWastedCastableDie`
itself reads exactly 0/26,448 games on both the baseline and both
verification runs, consistent with the underlying detector's existing
15-pass floor (see "CPU reasoning lapses" below). The instrumentation is
correct and ready for whenever that floor breaks; it simply has nothing to
report this pass.

## CPU reasoning lapses

**Detector floor confirmed again, 16th consecutive pass (v4.9→v4.25)** —
every "genuine mistake" detector reads exactly **zero** on all three
full-scale runs this pass: `lapseMissedLethal`, `lapseMissedLethalDamage`,
`lapseWastedCastableDie` (now with per-card attribution — see above),
`lapseIdleLeaderAbility_genuine`, `lapseUnitAbilityOrderFixed`,
`unitAbilityMultiCandidate(Tiered)`, `lapseMulliganKeptMarginal`,
`lapseEchoOverAbilitySequencing` are all 0/26,448 games on every run.
Non-zero counters remain the same known-benign shapes documented every pass
since v4.9 (`unusedDiceCount`, `lapseGreedyAssignmentFixed`,
`lapseIdleLeaderAbility_refusalNoTarget`, `lapseRerollDeadLowDie`,
`lapseUnusedDiceAtEndTurn`, `lapseCombatTradeTargetFixed`,
`guardClearLethalOpportunity`/`Converted`). **No new CPU-reasoning bugs
found this pass.**

## Keyword health

- **Steel** — held again (17th hold). Activation 0.28 (still the pool
  floor), delta +21.4pt — same "thin, noisy 2-card cohort" read as every
  pass since v4.21. No new signal to reopen the hold.
- **Swift** — activation 0.34, delta +12.7pt — still inside the
  established band. Left alone.
- **Avenge** — the v4.24 findings flagged this as a watch item: delta had
  moved from +3.6pt (pre-v4.24 baseline) to +5.6pt in that pass's
  post-patch verification run, and asked for confirmation on a genuinely
  independent baseline before treating it as real. This pass supplies
  that: **all three full-scale runs this pass** (fresh baseline, and both
  verification runs) read an identical **+5.6pt** delta (castWin%=65.4-65.9
  vs deckBaseline%=59.7-60.3, activation=0.89). The signal is real and
  stable, not noise — but both of Avenge's established levers are already
  at their ceiling (`SIM_TUNING.avengeCap`=1, down from 3 across v4.6/v4.21;
  cost weight already raised to 2/2.5 in v4.19.1, the second-highest in the
  pool after Steel). Cutting either further risks a Petrified-Ribs-Citadel-
  style floor no-op. Carried forward as a genuine design-tension case
  (needs a fresh per-card look at the 5-card pool, not another keyword-wide
  lever) rather than actioned blind this pass.
- **Pierce — investigated, one lever tried and reverted (see below).**
- **Aftershock** — per-card buffs from v4.22/v4.23 (`coral_collapse`) and
  v4.24 (`bioluminescent_tide`, `flash_freeze`) have all now resolved at
  the individual-card level — none of the three appear in this pass's
  top-10 `cardsToBuff` list. The keyword's deck baseline is still the
  pool's second-worst (20.9%, essentially flat vs. v4.24's post-patch
  20.5%) despite that. Read: the per-card lever has done what it can: the
  residual weakness now looks like an archetype-construction problem (how
  Aftershock decks are built) rather than a card-level one, so it is
  **not** re-escalated blind this pass — that would be action without a
  data signal behind it, which this file's own methodology avoids.

### Pierce — a lever tried, measured to be a no-op, and reverted mid-pass

Pierce's fired-win-delta has sat at essentially the same value since
v4.19/v4.20 (+10.3pt then, +10.0pt every run this pass) — six-plus passes
with real sample size (castN≈7,700) and no action ever taken. Given the
established v4.19.1 fix that took Avenge from a similarly-shaped +15.0pt
delta down to today's +5.6pt (raising the keyword's own cost weight, not
its combat magnitude), this pass tried the same lever on Pierce: weights
1/1.5/2 → 1.5/2/2.5 across its three tiers (`keywords.ts`).

A full-scale verification run (26,448 games) showed **zero measurable
effect** — `castWin%`/`deckBaseline%`/delta were bit-for-bit identical to
the baseline run before the change. Investigated rather than shipped
blind: `keywordCostTier()` clamps the computed cost tier to `[0, 5]`
(`cardpool.ts`), and Pierce's 8-card pool is disproportionately
Super-Rare+/Full-Art multi-keyword bodies (`Frenzy+Pierce+Overrun`,
`Guard+Pierce`, `Twin+Pierce+Rally`, all gated behind `LargeStraight`) whose
combined keyword weight already pins them at the tier-5 ceiling *before*
any Pierce-specific change. Avenge's pool skewed toward lower-rarity,
fewer-keyword cards with real tier headroom, which is why the identical
lever worked there and doesn't here. **Reverted** back to the original
1/1.5/2 weights (`keywords.ts`, `docs/KEYWORD_TIERS.md`) rather than ship a
no-op change with the surface-area cost of a fake fix, and a documentation
note was left in `keywords.ts` so a future pass doesn't repeat the same
attempt. Carried forward as a design-tension watch item: Pierce needs
either a lever that isn't clamped (trimming the overflow-damage magnitude
itself) or targeting the specific low-rarity outliers directly, not the
shared keyword cost weight.

## Game mechanics

`mechanicsToRemoveChangeOrAdd` shows the same expected shapes this file has
reported every pass since v4.16 — `dieRerolled`/`comboFired`/
`tributeTriggered`/`locationCast`/Twin all read "using your resources
correlates with winning," and `aftershockQueued`/`Resolved`'s large negative
delta is the same "fires while behind, by design" shape carried forward
since v4.22. No mechanic-level change warranted from this table this pass.

**Hand-limit forced discard (v4.24's carried-forward watch item) —
actioned via a per-card fix, not the global constant.** v4.24 introduced
the per-card hand-limit-discard table but had no budget to act on it.
This pass's baseline showed **Silver Chimera** newly topping the list at a
0.490 per-deck-inclusion forced-discard rate (higher than any card v4.24
recorded) — a `ThreeKind`-gated 6/4 Frenzy body that was apparently too
hard to actually draw dice for. Rather than raise the global `HAND_LIMIT`
constant (which would blunt the mechanic for every card in the pool to fix
one card), eased Silver Chimera's combo gate one step
(`ThreeKind` 3.5 → `AnyPair` 1.5, `MANUAL_GATE_OVERRIDE`). Confirmed
working in the final verification run: Silver Chimera's forced-discard
rate dropped from 0.490 to **0.258**, and it dropped off the top of the
list entirely (now behind Familiar in the Dark, Void Mother, Violet Haze
Kunoichi, Titan of the Trench, Brass Whale, The Abyssal Gate — the same
core repeat-offender cohort v4.24 already named, none newly regressed).

## Cost-vs-ability: a real dead-code bug found and fixed

Investigating why **Abyssal Dragonfish** has sat at the pool's single
highest `costVsAbilityMismatches` z-score (+3.07 in v4.21, still +3.18 in
v4.25) despite an apparent "fix" in v4.21 (`MANUAL_THRESHOLD_ADJ:
abyssal_dragonfish: 1`) turned up the reason: that card (and
**Ember Whisperer**, given the identical `+1` entry alongside it) both
resolve to a **gate cost** (`comboGate: 'AnyPair'`), not a numeric one.
`applyManualCostAdj()` only applies `MANUAL_THRESHOLD_ADJ` when
`def.threshold !== undefined` — for a gate-cost card that's always
`undefined`, so both entries have been **dead code since the day they were
written** (the v4.21 comment even flagged this exact risk: "No-op if
either procedurally lands on a gate cost instead of numeric" — and both
did). Ember Whisperer's measured win-rate residual was already separately
resolved via a v4.24 `MANUAL_STAT_TRIM` (dropped off `cardsToNerf`), so its
dead entry was just removed. Abyssal Dragonfish never got a working fix at
all until now: removed the dead threshold entry and added a **real** one
via `MANUAL_GATE_OVERRIDE` (`AnyPair` 1.5 → `ThreeOdds` 2, one difficulty
step). Also documented (without code changes, since the underlying
behavior is actually correct) why Driftwood Harp/Ribbone Longbow's own
repeat exact-cost threshold bumps have similarly never moved their z-score:
`costDifficulty()` prices every `exact`-kind cost at a flat difficulty of 2
regardless of the target face, which is *correct* — each die face 1-6 is
equally likely per roll, so "needs exactly a 6" isn't harder to hit than
"needs exactly a 2." Their measured win-rate residual is clean (off
`cardsToNerf` since v4.22), so this is a documentation note for future
passes, not a further escalation.

## Cards actioned this pass

Same escalation pattern this file has used since v4.17: repeat offenders
that held flat get one more step; first-pass entries get a modest opening
move; cards that dropped off the top-10 lists are left flat.

**Nerf escalations** (`MANUAL_STAT_TRIM`, Units):

| Card | Was | Now | Why |
|---|---|---|---|
| Cavernous Watcher | -3 | -4 | still #3-4 cardsToNerf, +32.0pt resid baseline |
| Wasteland Aberration | -1 | -2 | flat since **v4.17** (8 passes, never revisited) — still top-3 cardsToNerf every run, +33.1pt resid |

**New lever** (`MANUAL_THRESHOLD_ADJ`, Unit): Kinetix Enforcer +2 (sum-cost
threshold 8→10). Already at `MANUAL_STAT_TRIM`'s -4 ceiling since v4.24 (a
50%+ cut off its original 4/6 statline) and still topping `cardsToNerf` a
pass later — same "stat lever exhausted" shape as Astral Shoal/Where the
Deep Meets the Sky in v4.24, but this card carries only one keyword
(Frenzy), so a keyword-removal swap would be a bigger identity change than
those multi-keyword trophies got. Cost was the untried lever instead.
Result: resid closed from +33.1pt to **+26.0pt** — the largest single-pass
movement of any nerf this pass — though still in the top-10.

**First-pass nerfs** (no prior manual patch, new top-10 `cardsToNerf`
entries):

- Blue-Ringed Octopus / Porcelain Lobster (`MANUAL_STAT_TRIM`, Units): -1
  each. Tied for the pass's single highest resid (+34.1pt), both Common
  Guard bodies.
- Butterflyfish School (`MANUAL_STAT_TRIM`, Unit): -1, sized cautiously —
  this card has a documented overshoot history (+1 buff in v4.12, reverted
  in v4.18 after flipping to the opposite extreme). Resid barely moved
  (+29.0 → +29.3pt) in the verification run; left at -1 rather than
  escalated, consistent with the caution that prompted the small size.
- Levitating Coven (`MANUAL_STAT_TRIM`, Unit): -1. **Closed completely** —
  dropped off the top-10 `cardsToNerf` list in the verification run.
- Obsidian Bore Site (`MANUAL_VALUE_BUFF`, Location): -1 (onCast buff value
  3→2). Only Location-side lever available (no Cast Slot cost to raise).

**Nerf revert** (`MANUAL_VALUE_BUFF`, Location): Isle of the Ancients'
long-standing +1 (v4.12-era) has flipped — it was #9 `cardsToNerf` this
pass's baseline (resid=+27.6pt) instead of the underperformer it was
patched for. Reverted to neutral (entry removed) rather than compounding a
fresh nerf on the same lever, same "revert, don't compound" pattern as
`jawbone_span`/`the_wolf_of_wall_street` elsewhere in this file. The
revert alone wasn't quite enough (resid only moved to +27.0pt in
verification, still top-10) — carried forward as a first-pass-nerf
candidate for next pass now that it's back to a clean baseline.

**Buff escalations** (`MANUAL_VALUE_BUFF`, Charm/Event — one more step):

| Card | Was | Now | Why |
|---|---|---|---|
| Pulsing Heartstone | +3 | +4 | still #1 cardsToBuff, -32.7pt resid baseline |
| Amber Sphere | +3 | +4 | still top-3 cardsToBuff, -31.3pt resid baseline |
| Resonant Shuriken | +3 | +4 | still top-3 cardsToBuff, -31.3pt resid baseline |
| Coral Collapse | +3 | +4 | still top-5 cardsToBuff, -30.9pt resid baseline, n=3648 |
| Kinetic Siphon Swarm | +2 | +3 | still top-10 cardsToBuff, -28.4pt resid baseline |

Kinetic Siphon Swarm **closed completely** — dropped off the top-10
`cardsToBuff` list in the verification run. Thornfang Vine and Locust Veil
stayed off the list (held flat, not re-escalated).

**Buff escalation** (`MANUAL_STAT_TRIM`, Unit): Phantom Squadron +2 → +3.
Still top-10 `cardsToBuff` (-28.4pt resid baseline).

**First-pass buffs** (no prior manual patch, new top-10 `cardsToBuff`
entries):

- Chalice of Quicksilver (`MANUAL_VALUE_BUFF`, Charm): +1. Tied for the
  pass's #3 resid (-31.3pt) alongside Amber Sphere/Resonant Shuriken —
  same Common Echo/bind Charm shape, previously untouched.
- Perpetual Dynamo (`MANUAL_VALUE_BUFF`, Charm): +1.
- Shattered Horizon Protagonist / Skyborne Skeleton Dragon
  (`MANUAL_STAT_TRIM`, Units): +1 each. Both multi-keyword
  (Echo/Guard/Steel and Echo/Guard) `FullHouse`-gated Units whose big
  printed stats/keyword stack apparently isn't converting to wins — sized
  modest since the underlying issue may be castability (a hard combo gate)
  rather than raw power. Both moved meaningfully in verification (resid
  -29.1 → -28.2pt each) though still in the top-10.

**Design exception, deliberately left alone**: Submerged Starfall (the
pool's single Mythic trophy — `Yahtzee`-gated, sap 20 to the enemy Leader)
topped `cardsToNerf` at #6 (resid=+29.5pt baseline). Its cost is already
hand-tuned and explicitly exempted from the normal cost-format pipeline in
`cardpool.ts` (`TROPHY_ID`), and a near-guaranteed win once the (roughly
1-in-1,296) Yahtzee actually lands is the entire point of the card's
design — nerfing its value would contradict the intentional "reward for the
rarity" shape, not fix a bug. Left untouched; its resid drifted slightly on
its own (+29.5 → +28.1pt) purely from other cards' cost-band means shifting
around it, not from any direct change.

Verification: re-ran the full 26,448-game suite **twice** this pass — once
with the Pierce cost-weight change applied (used to measure that it was a
no-op, see above), and a final run with Pierce reverted and every other
patch above applied. Zero invariant violations on the baseline and both
verification runs; `npx vitest run` 107/107 passing throughout, including
after every edit. Kinetix Enforcer (+33.1→+26.0pt) and Levitating Coven
(closed off the list entirely) showed the strongest single-pass movement;
Wasteland Aberration (+33.1→+32.8pt, essentially flat) is the weakest —
its first-ever escalation after 8 passes flat clearly wasn't enough, and
it's now the pass's #1 `cardsToNerf` entry, flagged for a bigger step next
pass rather than another matching +1.

## Non-balance changes this pass

A parallel full feature/bug hunt (4 independent sweeps across every
screen/component in `src/components/` and `src/meta/`, plus
`src/lib/supabase.ts`) found and fixed (full detail in `CHANGELOG.md`'s
v4.25 entry): a dead deck-code-import validator that was permanently
checking against the pre-boot placeholder card catalog instead of the live
one; a `Set`-based Leader-lock check in the Collection screen that
silently dropped a second deck's reservation when a player owned 2+
copies of the same Leader; ended Marketplace auctions/listings still
showing live, clickable BID/BUY buttons between refetches; four
fire-and-forget post-action reloads across Achievements/Store/Marketplace
that opened a double-claim/double-buy race window; ten more
`src/lib/supabase.ts` read functions that silently swallowed fetch errors
with no logging at all (Missions, Player Profile Card, Player Search,
Friend Collection, Card Market Value/Blended Reference, Shop
Public/Browse, Mystery Live Stats, Serialized Feed); plus a QoL/
accessibility pass (focus management and Escape-to-close on the Card
Inspector, Leader Picker, and Pack Opening modals; outside-click/Escape
dismissal on in-game status-badge popovers that could previously linger
indefinitely on a touch device; missing `aria-label`s on the Player Shops
report form and both newly-focus-managed dialogs; post-action success
toasts on three Social actions that previously gave no feedback at all).

## Docs

Reviewed the full `docs/` tree for staleness. `docs/ROADMAP.md`,
`docs/RULEBOOK.md`, `docs/KEYWORD_TIERS.md`, `docs/COLOR_IDENTITY.md` and
`docs/PVP_DESIGN.md` are all current and already self-documenting about
their own supersession history where relevant — nothing removed or
updated (the Pierce weight change was reverted mid-pass, so
`KEYWORD_TIERS.md`'s weight table needed no net edit). The per-pass
`BALANCE_SIM_FINDINGS_v4.*.md` series (v4.5 → this file) remains the
durable historical record, referenced from both `README.md` and
`CHANGELOG.md` — not pruned. `docs/sim-runs/` (raw per-run JSON) is
gitignored and was never tracked — nothing to prune there either.

Full raw console transcripts of all three full-scale runs this pass:
`docs/sim-runs/` output is gitignored and regenerated via `npm run
sim:v4`; this file is the durable record.
