# Balance Sim Findings — v4.10

Pass structure: harness upgrade (four new instrumentation additions, below)
→ 33,840-game baseline (`npm run sim:v4 -- 15`, 48 decks, `sameTurn` Twin
mode selected by the A/B/C pre-pass) → a 21-arm ablation battery
(`sim:ablation 40`, the 11 carried-over subjects plus 10 new arms) →
actions → full 33,840-game verification re-sim. No invariant violations in
either full-report run.

## 1. Harness upgrades (what this pass could measure that v4.9 couldn't)

v4.9 §2.3 concluded the CPU-lapse detector set had hit a real floor
(`lapseMissedLethal`, `lapseWastedCastableDie`, and the fully-decomposed
`lapseIdleLeaderAbility_genuine` all measured zero for a third straight
pass) and asked for "a new class of detector... sub-optimal target/order
choice within an action, not just did it act." §4 also carried forward four
other open items. This pass's harness work targets both:

- **`lapseCombatTradeTargetFixed`** (`ai.ts` `playCombat`). Combat trades
  with 2+ legal kill targets resolved `bigThreat`/`safeKill`/`valueKill`/
  `clearKill` via `kills.find(...)` against `opp.board` in raw insertion
  (cast) order — when two-plus enemy Units both qualified, the AI took
  whichever was cast first, not the most valuable one. Fixed to resolve
  against value-sorted views (`byValueDesc`/`byAtkDesc`) instead. The
  detector recomputes what the OLD first-match logic would have picked
  for the *same* dice/persona rolls (no extra RNG calls — call count/order
  is preserved exactly) and counts a lapse whenever the fix actually
  changed the pick. Measured **0.035/game** (1,176-1,188 total across both
  full runs) — real but rare; decision-correlation delta is ~0.0pt, as
  expected for a correctness fix on an infrequent, usually-low-stakes
  choice rather than a power lever.
- **`lapseUnitAbilityOrderFixed`** (`ai.ts` `playPlacement`). With 2+
  eligible Unit Abilities competing for one spare die, the AI activated
  whichever Unit came first in board order, not the highest-value action
  (new `unitAbilityValue()`: destroy > bind > sap > buff/mend > draw,
  mirroring `castPriority`'s existing action-value ordering). Fixed to
  always pick the best. Measured **exactly zero** across 33,840 games in
  both runs — a real, working detector that simply never found the
  situation arising in this roster (by the time Placement reaches step 4,
  dice are usually already spent, or only one eligible Unit Ability exists
  at a time). Reported honestly, not padded.
- **Per-archetype "cast this card ≥1x this game → win%"** (v4.9 findings §4
  item 1, Mer-King's two weak archetypes). A fixed-decklist archetype's
  win-**in-deck** is identical for every single card — every copy is in
  every game of that archetype, so the existing pool-wide `cardInDeck`/
  `cardInWinDeck` metric degenerates to "the deck's own win rate,
  restated once per card" the moment you scope it to one archetype (this
  was tried first and confirmed useless before the real fix). What
  actually varies game to game is whether the card got **drawn and cast**.
  New per-player `cardCast:${id}` decision tracking (`engine.ts`
  `enterPlay`/`castFromHand`, mirroring the existing `echoCard:${id}`
  pattern) feeds a genuine per-card win-correlation table, scoped (for
  bookkeeping cost) to a two-archetype watchlist.
- **Per-archetype-normalized Echo win-delta** (v4.9 findings §2.4/§4 item
  3). The raw per-card Echo table couldn't separate "this card is weak"
  from "this card mostly gets recast by an already-losing deck." New
  `echoCardArchInGame`/`echoCardArchInWinGame` tracking lets each card's
  actual recast win% be compared against a weighted average of the
  *archetype* baselines it was recast in, isolating the card's own
  contribution. See §4 below — still not clean enough to act on this pass
  either, but for a different, now-understood reason.
- **Cost-vs-value table, actually implemented.** v4.8's CHANGELOG entry
  claimed this shipped ("a cost-vs-value table pricing every card against
  its real cast-format difficulty") — it never did. `costDifficulty` was
  imported into `simulate-v4.ts` and never called; the promised section
  didn't exist. Implemented for real via a new `cardpool.ts` export,
  `cardDifficulty(def)`, which resolves a **built** `CardDef`'s difficulty
  directly (the existing `costDifficulty` only accepts a raw `CostPick`,
  which a finished card no longer carries) — see §5.
- **Three new Location-only `SIM_TUNING` dials** (`locOnCastBuffBase`,
  `excavateRate`, `footholdDiscount`), wired into `cardpool.ts`'s
  `mapLocation()` and `engine.ts`'s `effThreshold()`. Locations' small
  persistent negative isolated contribution has been measured every pass
  since v4.4 (v4.9 findings §4 item 5) but never had its own dedicated
  ablation arm — general keyword/wall-list levers only ever touched it in
  passing. See §2.1.

## 2. Headline findings

### 2.1 Locations — first positive isolated contribution ever measured

A dedicated 4-arm ablation battery isolated each Location-only lever
independently against the 11 subject decks (which include the roster's two
ramp/ambient-value decks, Abyss Excavate Ramp and Sea Witch Anchor-Scrap
Ramp):

| arm | Avenge Grind | Guard-Bulwark | Ward-Steel Wall | Excavate Ramp | Tempo-Anchor |
|---|---|---|---|---|---|
| baseline | 79.0% | 69.4% | 67.5% | 49.0% | 19.8% |
| excavateRate 2→3 | 79.0% | 69.4% | 67.5% | 49.0% | 19.8% |
| footholdDiscount 1→2 | 79.0% | 69.4% | 67.5% | 49.0% | 19.8% |
| **locOnCastBuff 2→3** | 79.0% | 69.8% | **70.6%** | 50.0% | 19.2% |
| locBundle (all 3) | 79.0% | 69.8% | 70.6% | 50.0% | 19.2% |

`excavateRate` and `footholdDiscount` are **exact no-ops** on their own
primary subject decks — genuinely dead levers, not just weak ones (this
matches `exactCostCap`'s v4.9 "dead lever" precedent: identical numbers to
the decimal across every subject, arm after arm). `locOnCastBuffBase`
(the flat +2/+3 board-impact buff every Location resolves the instant it
enters play) is the only one of the three with any measured effect at all,
and its effect was positive-only across every subject measured — no
subject moved down. Shipped 2 → 3.

Verification (33,840-game full roster): **isolated Location contribution
flipped from -1.3 win% to +1.5 win%** — the first time since v4.4 this
number has been positive. Every Location-only keyword rose as a side
effect of buffing the card type they live on: Excavate 40.0% → 43.8%,
Foothold 39.0% → 43.7%, Contested 37.3% → 42.6% — despite `excavateRate`
and `footholdDiscount` staying at their default values. The general
on-cast buff was the lever the whole card type needed, not the
keyword-specific riders layered on top of a slice of it.

### 2.2 Crescendo — redesigned after a 4th flat/declining pass

39.5%/39.2% (v4.9) → **36.4%** this pass' baseline — not flat this time,
actively worse, despite the base value having been bumped every single
pass since v4.4 (1→2→3→4). That crossed the v4.8/v4.9-flagged threshold
for a real redesign instead of another size bump.

Diagnosis: the bonus scaled with the **count** of dice showing 6 *placed*
(spent on a cast) this turn. Landing even one 6 in a 5-die roll (with up to
2 directed rerolls) isn't especially rare, but landing **two** — the only
case where the per-die multiplier ever did anything beyond what a flat
bonus would already give — is. Every prior "buff" therefore mostly just
inflated a multiplier that almost never multiplied. The `placed` (not
`rolled`) restriction compounded it: a 6 that got rerolled away, or simply
had nothing worth spending it on before this card's own cast, didn't count
even though the player visibly rolled a hot die that turn.

Redesigned per the v4.8/v4.9-flagged fix ("+X if you placed any 6, a
deterministic floor instead of scaling with count"): `withCrescendo()`
(`engine.ts`) now gives a flat `+X` the moment **any** die shows a 6
**rolled** this turn (`rollValues(p)`, not the placed-only subset),
dropping the per-die multiplier entirely.

Verification: **36.4% → 41.3%** (+4.9pt). Still the weakest keyword in the
game — not solved outright — but a real, measured recovery from a
redesign rather than another incremental value bump, and the first pass
where the number moved by more than noise. Base value left unchanged this
pass (the mechanic change was the lever being tested); a further value
tweak is a candidate for next pass once this redesign's own baseline is
established over more than one verification run.

### 2.3 Mer-King's two weak archetypes — first per-card look, partial result

v4.9 tried three Leader-kit-level compensations for Mer-King's post-Guard-
nerf regression (Ability value, Ultimate value, Resolve) and flagged that
"the real fix isn't a Leader-kit lever... it's that Avenge Swarm and Twin
Heal have their own weaknesses independent of Guard's print stats" — but
had no tool to look at those weaknesses directly (see §1 on why win-in-deck
is useless for this).

The new per-archetype cast-then-win% table surfaced six consistently
bottom-of-list cards, all Common rarity, mostly Charms/Events:

- **Twin Heal** (deck baseline 37.1%): Kinetic Piercer (37.3%), Isle of the
  Ancients (37.8%), Hive Power Cell (37.9%) were the clear bottom three,
  4-5pt under the deck's own strongest cards (Lurking Coral-Prowler 44.8%).
- **Avenge Swarm** (deck baseline 43.2%): Consuming Ash Cloud (40.1%),
  Towering Tsunami (41.0%), Narwhal Staff (42.8%).

Gave each a small +1 on-cast value bump (same named-card identity-patch
pattern as the existing `MANUAL_STEEL` entries in `cardpool.ts`).

Verification: **Twin Heal 37.1% → 39.1%** (+2.0pt, a real if modest
recovery). **Avenge Swarm 43.2% → 43.4%** (+0.2pt, noise-level — barely
moved). Leader spread overall: 15.0pt → 14.1pt.

Honest read: the per-card signal in both archetypes is **diffuse, not
concentrated** — every card in each list sits within about 7-10pt of every
other card in the same list, with no single outlier that reads as "this
one card is the problem." Twin Heal's bottom-heavy Charm suite responded
to a direct nudge; Avenge Swarm's did not, meaning its weakness is
something this pass's lever couldn't reach (possibly the Avenge mechanic's
own interaction with Mer-King's kit, not any one printed card). Not
claiming this is solved — carried to §5 for next pass.

### 2.4 The wall-list meta — still not closed, and still correctly not shipped

Re-measured the still-open v4.9 item: a further `guardHpBonus` cut (current
live value 2, tested at 1) in the ablation battery:

| arm | Avenge Grind | Guard-Bulwark Turtle | Excavate Ramp | Tempo-Anchor |
|---|---|---|---|---|
| baseline (2) | 79.0% | 69.4% | 49.0% | 19.8% |
| guardHpBonus 2→1 | 75.4% | **60.6%** | 54.8% | 23.3% |

Same shape of effect as the v4.9 lever that shipped: compresses the top
(Avenge Grind -3.6pt, Guard-Bulwark Turtle -8.8pt) and lifts the floor
(Excavate Ramp +5.8pt, Tempo-Anchor +3.5pt). **Not shipped this pass.**
Mer-King is the primary Guard user in Guard-Bulwark Turtle specifically,
and that archetype absorbing another -8.8pt on top of an already-14.1pt
Leader spread is exactly the compounding risk v4.9 flagged when it wrote
"once Mer-King's kit-level fallout has an independent fix, so the two
changes don't have to be diagnosed together." §2.3's fix is real but
partial (Twin Heal recovered, Avenge Swarm didn't) — not independent
enough yet to safely stack a second Guard cut on top without re-widening
the spread this pass just narrowed. Carried forward again; see §5.

Shinobi Avenge Grind remains the roster's outright top deck at 86.4%
(verification run) — up slightly from 85.5%/85.4% (baseline this pass /
v4.9), within noise.

### 2.5 CPU reasoning — the detector floor holds, and a new detector class exists now

`lapseMissedLethal` and `lapseWastedCastableDie` measured zero again (a
4th straight pass for both); `lapseIdleLeaderAbility_genuine` stayed at
zero. The two new §1 detectors targeting sub-optimal target/order choice
(not just "did it act") are now live in the harness for future passes:
`lapseCombatTradeTargetFixed` found a real, if rare, gap (0.035/game,
now fixed); `lapseUnitAbilityOrderFixed` measured zero, meaning either the
situation genuinely doesn't arise in this roster or a further detector
refinement is needed to see it — flagged for next pass to watch, not
re-diagnose blind.

## 3. Other results (no action)

- **Per-archetype-normalized Echo win-delta** (§1): computed for real this
  pass, but most of the remaining spread collapses once archetype baseline
  is divided out (e.g. Galaxy Jellyfish/Handed Squid's huge +26-28pt raw
  deltas are >90% explained by which archetype recasts them, not the cards
  themselves) — the handful of cards with real residual deltas after
  normalization (Victorian Helmet -6.6pt, n=19; Swirling Ink Cloud -4.2pt,
  n=113) have samples too small to act on confidently. Not a wasted
  build — this is the clean tool v4.9 asked for — just nothing in this
  pass's data clears the bar to act on yet.
- **Cost-vs-value table** (§1): now real. Confirms the existing "most
  likely OP"/"most useless" lists rather than surfacing new surprises —
  Silver Chimera, Ash-Shaper Mystic, Flickering Sea Pens/Cavernous Watcher
  top the ratio table (all exact/easy-cost defensive-leaning bodies,
  consistent with the wall-list meta in §2.4); Brass Whale, Spectral
  Leviathan, Seabed Mandala anchor the bottom (all steep gate/sum costs
  with underwhelming payoffs). No new lever identified this pass; kept as
  a standing diagnostic for future passes.
- **Fatigue exposure, first-player edge, game length**: consistent with
  v4.8/v4.9 (gentle attrition, ~52% first-player edge, ~10.7-round average
  game). No new instrumentation targeted these this pass.

## 4. Still open — priority list for the next pass

1. **Mer-King's Avenge Swarm specifically** (43.4%, barely moved this
   pass) — the per-card lever worked for Twin Heal but not here; the
   diffuse per-card signal (§2.3) suggests the weakness isn't in any one
   printed card. Needs a different diagnostic angle (e.g. an
   Avenge-mechanic-specific ablation, or a deck-level swap test isolating
   Mer-King's kit from the Avenge Swarm list the way v4.7/v4.8 isolated
   Avenge Grind).
2. **The wall-list meta still isn't closed** (§2.4) — `guardHpBonus` 2→1
   is measured and ready, blocked only on Mer-King's Avenge Swarm fix
   landing independently first (item 1), so the two changes don't have to
   be diagnosed together again.
3. **Crescendo's new baseline** (§2.2) — the redesign worked (+4.9pt) but
   it's one verification run; confirm the number holds before deciding
   whether the base value itself also needs a step now that the trigger
   condition is reliable.
4. **`lapseUnitAbilityOrderFixed` measured zero** (§2.5) — a working
   detector with nothing to detect in this roster. Worth a dedicated look
   next pass at whether that's genuinely true or whether the detector
   needs to fire earlier/differently to see cases the current placement
   already resolved away.
5. **Per-archetype-normalized Echo win-delta** (§3) — the tool is built and
   correct; needs either a larger sample (more games per pairing) or a
   pass specifically targeting the handful of cards with a real residual
   delta once normalized.

## 5. Negative results kept honest

`excavateRate` 2→3 and `footholdDiscount` 1→2: exact no-ops on their
primary subject decks, individually and in the bundle arm — not shipped.
`guardHpBonus` 2→1: measured, right shape of effect, deliberately **not
shipped** pending an independent Mer-King fix (§2.4) — this is a
"ready but blocked" result, not a dead one. Avenge Swarm's manual card
buff: shipped (consistent with Twin Heal's fix pattern) but measured
essentially zero net effect (+0.2pt) — reported as a partial success, not
oversold as a fix.
