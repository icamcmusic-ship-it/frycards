# Balance & CPU Findings — v5.3

Third sim pass on the v5 essence engine. Live pool re-verified against
Supabase project `dnngihsbqxccqvvedvjc` `public.cards`: 292 rows, and the
md5 of the sorted `id|type|rarity` signature is **identical** between the
live table and the bundled `src/game/generated-cards.ts` fallback — the
full card pool is in use with zero drift. Baseline runs at full scale (24
random archetype decks, round-robin, 4 games/pairing = 2,208 games/run,
seeds 1337 and 777), plus a **matched-deck control run** (seed-1337 decks
under seed-777 game RNG) and three post-change verification pairs.

## Harness (new for v5.3)

- **Real keyword activation counts** via engine telemetry hooks
  (`engine.ts` `telemetry`): Siphon vitality gained, Venomous kills,
  Overrun spill, Quickstrike pre-kills, Ambush reaction invokes. The v5.2
  `activations` field existed but was never fed.
- **Real `wastedEssenceWithPlay` / `venomousSuicide` lapse counters** —
  both were declared-but-never-incremented in v5.1/v5.2. Wasted essence is
  now measured at the moment pools clear (phase boundaries); venomous
  suicide from declared guard assignments vs post-clash survivorship.
- **Accurate erode tracking** (opponent deck shrink per turn, net of
  reaction-window draws) — the old `totalErode` expression was a no-op.
- **Color-vs-color matchup matrix** (7×7 by Leader identity) — the
  cohort-controlled color signal v5.2 flagged as missing.
- **Keyword carrier win rates by carrier cost band** (1-2 / 3-4 / 5+).
- **Separate `deckSeed` CLI arg** — rerun the SAME deck cohort under a
  different game seed to split cohort noise from engine/AI changes.
- Mulligan rate, winner vitality margin, average loser deck remaining.

## Carry-forward items resolved

1. **`tookGuardableLethal` jump (v5.2 item 2) — cohort noise, confirmed.**
   Seed-1337 decks: 255 (seed-1337 games) vs 262 (seed-777 games, same
   decks). Seed-777 decks: 160. The rate follows the deck cohort, not the
   game seed — no guard-heuristic regression. Closed.
2. **Reaction window STILL dead at baseline — real root cause found.**
   Baseline: 150/237 reaction plays vs ~14,400 opportunities. The v5.2 fix
   reserved the *card* but not the *essence*: locations only recover at
   their owner's own Dawn, so a defender who tapped everything during its
   own turn has nothing when the window opens. Fix: the CPU now reserves
   the **locations** to pay for its held reaction card through its whole
   turn (capped at total cost 3 — reserving 5-7 locations for a big Ambush
   bomb skipped whole development turns, measured directly in the first
   verification pair). Post-fix: **3,038 / 3,624 reaction plays per suite
   (~20-25x baseline)**, `playsPerOpportunity` 0.01 → ~0.25.
3. **Swarmproof cheap-carrier heat (v5.2 item 6)** — gone post-v5.2 weight
   bump; cost-1-2 band carriers at 45.8-49.7%. The weight then flipped the
   keyword negative under the new reaction meta, so it went back 2→1.

## CPU reasoning lapses (this pass)

- **All-in lethal attacks ignored guards entirely** (`chooseAttackers`
  attacked with everything whenever total might ≥ opponent vitality). It
  now assumes each ready defender absorbs one attacker (biggest first,
  Overrun spill counted) and only all-ins when lethal survives worst-case
  guarding. Venomous suicides: 179/163 baseline → 135/58 post-change.
- **`venomousSuicide` (first real measurement)**: ~170/2,208 games at
  baseline; see above.
- **`wastedEssenceWithPlay` (first real measurement)**: ~500-850 per
  2,208-game suite (~0.3/game) — most "wasted" essence turns out to be
  deliberate reaction-window reservation, which the counter can't
  distinguish; not actioned.
- **`heldPlayableCardTurnPct` 64.5% / 70.2%** — unchanged band vs v5.2.
  Much of this is now *intentional* holding (reaction reservation); the
  metric needs a reservation-aware denominator before it's actionable.
- **Attack divergence ~32-37%** — unchanged; both heuristics are
  simplifications, no cross-check disagreement worth acting on found.
- `missedLethal` 0, `colorCloggedGames` 0, guard divergence 0 — clean.

## Keywords

Normalized deltas (baseline → final verification, seeds 1337/777):

- **Unbreakable**: +16.5/+9.1 at weight 7. Trials at 9 and 8 cratered
  carriers (-7.6/-22.9, -9.7/-25.1) — but the surcharge math rounds 8 to
  the same cost as 7, exposing that the crater came from the **new
  reaction meta + big-Ambush over-reservation**, not the weight. With the
  reservation capped and weight back at 7: **+9.6/+2.3**. Kept at 7; the
  old +16.5 read was substantially a dead-reaction-window artifact.
- **Siphon**: -8.8/-11.7 → weight 2→0 (reversing v5.2's bump, which read
  the negative delta backwards — carriers underperform their cohort, so
  the keyword was over-, not under-priced) → **-2.5/-4.8**. At 0 it can't
  go lower without becoming a discount; watch.
- **Venomous** 2→3 (+6.7/+16.0 → +4.7/+1.4) and **Aerial** 2→3
  (+7.3/+6.7 → +5.4/+3.8): both settled.
- **Quickstrike** 3→4 (mildly positive every pass since v5.1; now
  +0.3/+9.7 — 777 still hot but n is small).
- **Warded** 0→-1: consistently negative across three passes; targeting
  denial rarely converts to wins, so it now discounts like Immobile.
- **Swarmproof** 2→1 (see carry-forward item 3).
- **Doublestrike/Overrun**: sign flips between seeds every pass (2 and ~12
  carriers) — still no stable signal; untouched.
- **No keyword added or removed** — activation telemetry shows every
  keyword's mechanic actually firing (Siphon ~6k vitality/suite, Overrun
  ~2.7k spill, Quickstrike ~1.7k pre-kills, Ambush ~2.5k reaction
  invokes post-fix); the vocabulary is healthy, pricing was the issue.

## Colors / Leaders

The new 7×7 color matchup matrix shows no pairing outside ~35-65% at
current sample sizes, and rankings still reorder between seeds. Still
cohort-dominated; no color/Leader action. (The matrix now exists to catch
a genuinely lopsided pairing in future passes.)

## Cards (cost vs ability) — actioned

Cross-run-confirmed overperformers, +1 total cost (`COST_ADJUST`):
Slate-Scaled Serpent (+8.9/+12.5, third consecutive pass), Worm Brain
Host, Smokeveil Striketeam, Crowned Manatee, Constellation Crabs, Nebula
Clutch, Shatterline.

Cross-run-confirmed underperformers, -1 total cost: Submerged Starfall,
Nanite Purge Protocol, Coral Collapse, Tectonic Rift, Consuming Ash Cloud,
and Research Fleet (65%/74% dead-in-hand two passes running).

New `STAT_ADJUST` mechanism for overperformers already at the cost cap of
7 (where +1 cost clips to nothing): Nanite Division Marshal -2 stat budget
(+8.5/+13.7 residual both seeds). Dr. Aries and Spectral Leviathan were
left alone — their Unbreakable/Ambush dynamics changed substantially under
the new reaction meta and need a clean read next pass.

## Mechanics

No mechanic added, removed, or changed. Win-condition split moved with
the reaction meta (vitality kills 74%/59%, deck-outs 26%/41% — games run
~1.5 turns longer now that clashes get answered). **Watch item for next
pass**: if deck-out share keeps climbing past ~40%, consider a small deck
size bump or an erode cap. Zero invariant violations and zero turn-limit
draws across every run in this pass.

## Engine

No new engine bugs. New (sim-only) telemetry hook surface in `engine.ts`
(`telemetry.onEssenceCleared` / `onKeywordProc`) — no-ops in normal play.

## Carried forward for next pass

1. Re-read Unbreakable/Ambush cost-7 carriers (Dr. Aries, Spectral
   Leviathan) under the settled reaction meta.
2. Deck-out share creeping up (26%/41%) — watch, threshold ~40%.
3. `heldPlayableCardTurnPct` needs a reservation-aware denominator.
4. Quickstrike at weight 4 — confirm the seed-777 heat was noise.
5. Siphon at weight 0 — if still negative, the keyword needs a mechanical
   buff (e.g. uncapped gain), not more pricing.
