# Balance Sim Findings — v4.18

Continuation pass following v4.16/v4.17 (backfilled this session — see those
two docs). Scope: extend the sim harness's ability to surface CPU-lapse,
keyword, and cost-vs-ability issues; verify the full 292-card pool is synced
from Supabase; run fresh sims and action the findings; a targeted app-wide
bug/QoL hunt; and two UI asks (card colors by identity, flavor-text overflow)
that turned out to already be shipped in v4.16 and got a follow-up refinement
here. Two full 66,120-game round-robin verification runs, both **no
invariant violations**.

## Card pool check

Confirmed in sync: Supabase `cards` table (project `dnngihsbqxccqvvedvjc`) has
292 rows, last updated 2026-07-15; the bundled `src/game/generated-cards.ts`
fallback has exactly 292 matching entries. No action needed.

## CPU reasoning: last-resort Scrap for stuck dice

`lapseUnusedDiceAtEndTurn` remained the single largest CPU inefficiency by a
wide margin — 15.52/game with a -28.9pt win-rate delta when it happens, only
marginally down from the pre-existing baseline despite v4.17's fallback-cast
pass. Added a further fallback: if no card in hand can use a stuck die and a
Scrap card is available, Scrap it (now positive EV since v4.16 changed Scrap
to advantage-of-two — previously would have been a wash or worse).

**Measured effect: 15.52 → 15.47/game — a real but small improvement.** Most
stuck dice have no Scrap card available in hand to spend (Scrap's own deck
presence is ~56%, and it only fires 48-52% of the time it's drafted), so this
lapse is not primarily a Scrap-availability problem. The bulk of it is
structural: 5 fresh dice a turn against a hand that often doesn't have a
legal use for every value, which prior passes already correctly flagged as
needing a real assignment-problem solver (Placement's die-to-card assignment
is still greedy) rather than another heuristic patch. Shipping this fix
anyway since it's a genuine, risk-free improvement with no invariant
regressions — just not the full answer.

## Keyword nerf: Steel (third pass)

Steel remained the single most overtuned keyword after two prior power trims
(v4.7: 2/2/3→1/1/2 by tier; v4.16: 1/1/2→flat 1) — still measured **+17.3pt**
delta this pass, more than any other keyword by a wide margin (next-worst
~+12.8pt). Per-fire power was already at the floor short of deleting the
keyword outright, so this pass trims **print rate** instead: the procedural
hash bucket that grants Steel dropped from 1-in-9 to 1-in-12 of eligible
tier≥2 cards, leaving every card that still prints it at full power/identity.

**Measured: +17.3pt → +7.8pt delta** (Steel's own win% 81.0%→64.4% cast-win,
deckBaseline 63.8%→56.6%) — the biggest single-keyword improvement of any
Steel pass so far, and Steel is no longer the outsized #1 offender (still
above-average, but now roughly in line with Bulwark/Foothold/Frenzy's
+5-7pt band rather than 2× the next keyword).

## Reverted two overshot card patches

`the_wolf_of_wall_street` (nerfed -1 stats in v4.12) and `butterflyfish_school`
(buffed +1 stats in v4.12) both now sit at the *opposite* extreme residual
from what they were originally patched for (Wolf: -37.2pt, well below its
cost band; Butterflyfish: +33.3pt, well above). Reverted both stat patches
rather than re-patching in the new direction.

**Confirmed these were never the real driver**: both cards show effectively
identical extreme residuals with the patches removed as they did with the
patches in place (Butterflyfish 76.5%→75.6% win, Wolf 82.1%→8.0%... — note
Wolf's own in-isolation win% swung hugely between runs, a strong signal this
specific card's residual is dominated by which single archetype/deck
happens to draft it, not a stable property of the card). This is the
un-normalized cost-vs-value residual table's known limitation (see v4.15
§Part A item 6) showing up directly: neither card is safe to patch again
without an archetype-normalized look first. Left as an open item rather than
guessing a third time.

## Flavor-text overflow: follow-up refinement

v4.16 already fixed the primary cause (inline keyword reminder text now
drops to just the clickable name before ever truncating ability/flavor
text). This pass found a secondary gap: `flavorFontPx` was still sized
purely from the flavor string's own length, with no awareness of how much
of the shared text-box height the keyword/rules block above it had already
consumed via its own independent shrink calculation (`textBoxScale`). A card
with a short flavor line but a long rules block could still print flavor
text at full size into a box that had no room left. Folded `textBoxScale` in
as a floor multiplier (with a 5.5px hard minimum so it never becomes
illegible) so flavor text now shrinks in step with the block above it.

## Card colors by identity: confirmed already shipped

Verified in code (not re-implemented): `CardFaceV4.tsx`'s card body
background renders from `colorBg(cardColors(def))` (color identity, keyed off
keywords) rather than rarity; `rarityBorder`/`rarityGlow`/the corner gem are
the only rarity-driven visual elements remaining. This matches the ask
exactly and was already live from v4.16 — no further action needed.

## Bug hunt (dedicated review pass across `src/meta/*.tsx` + `src/components/*.tsx`)

Fixed the four highest-impact findings:

1. **`PlayerShopsScreen.tsx`'s "OPEN SHOP" button** was the only purchase
   flow in the app with no affordability check — a player under the setup
   fee got a bare server rejection instead of a proactive "you need N more
   credits" message every other buy button shows. Fixed.
2. **Mystery-pack rarity-weight input** (same file) had no floor, unlike
   every other numeric input in the file — could submit a negative weight.
   Clamped to `Math.max(0, ...)`.
3. **Admin currency/card grants** (`ProfileScreen.tsx`) applied instantly
   with no confirmation, inconsistent with the adjacent role-change action a
   few lines down which does confirm. Both now confirm before applying.
4. **Game-over screen** (`GameV4.tsx`) showed nothing at all — not even a
   loading state — during the window between a match ending and
   `recordMatchResult()` resolving, indistinguishable from the guest case
   (which never gets a reward). Added a `rewardPending` flag threaded from
   `App.tsx` and a "Calculating rewards…" placeholder.

Eight more findings (moderate/low impact — stale-error-state crossover in
`NewsCenterScreen`, a duplicated bid-minimum formula in `MarketplaceScreen`,
missing live-stock polling, an unexplained bulk-open cap, and others) were
documented but not actioned this pass — see the review agent's full report,
worth a dedicated QoL pass. `CardFaceV4.tsx`'s render logic, `HowToPlay.tsx`'s
back half, and `deckcode.ts`/`packodds.ts` (spot-checked this pass, no bugs
found) round out the "not fully reviewed" list.

## Leader spread (observed, not actioned this pass)

Ethereal Sea Witch 63.6% vs. Sovereign of the Dying Star 38.3% — a 25.3pt
spread, consistent across both verification runs. Wider than several
historical passes' best-measured spreads, though not directly comparable
since the color-legality fix (v4.16) reshaped every archetype's legal card
pool since those numbers were taken. Not chased this pass — a full Leader
rebalance is out of scope for a pass already carrying three other workstreams;
flagged as the top priority for next pass.

## Verification

`npm run typecheck` / `npm run lint` (0 errors, 13 pre-existing warnings) /
`npm run test` (93 tests) clean throughout. Two full `npm run sim:v4 -- 20`
round-robin runs (66,120 games each — one immediately after the Scrap-fallback
+ card-patch-revert changes, one after the Steel print-rate trim), **no
invariant violations** in either.

## Carried into next pass — priority list

1. **Leader spread (25.3pt)** — needs a real look now that the color-legality
   fix has reshaped the pool; likely the same "Leader-kit-shaped fix, not a
   keyword-wide dial" lesson from the Mer-King Guard work applies to
   Sovereign of the Dying Star and Apex Nanite Shinobi's low ends.
2. **`lapseUnusedDiceAtEndTurn` still ~15.5/game** — the Scrap fallback
   helped marginally; a real fix needs the assignment-problem solver flagged
   since v4.15, not another heuristic layer.
3. **`the_wolf_of_wall_street`/`butterflyfish_school`'s residuals** — now
   confirmed not to be about the cards' own stats (reverting the v4.12 patch
   didn't move them). Needs an archetype-normalized look, same class of
   problem as the standing Echo/cost-vs-value normalization gap.
4. **Steel** — down from +17.3pt to +7.8pt after three passes; worth one
   more measurement next pass to confirm it holds, but no longer the
   standalone #1 offender.
5. New-keyword/keyword-removal candidates: the harness has no data signal
   for "what should exist" (only "what does exist and how it performs") —
   Swift's low 24% activation rate is the strongest removal *candidate* by
   the numbers, but its keyword-health delta (+12.8pt when it fires) argues
   the opposite — it's rare AND strong, not weak. This tension needs a
   design judgment call, not a bigger sim.
