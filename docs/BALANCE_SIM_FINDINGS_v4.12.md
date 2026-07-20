# Balance Sim Findings — v4.12

Pass structure: harness upgrade (five new instrumentation additions, §1) →
**first-ever full-292-card-pool run** (the bundled `generated-cards.ts`
fallback had drifted to 193/292 cards — see §2, this is the headline finding
of the pass) → three iterative per-card/keyword patches, each verified with
a full 53,040-game round-robin re-sim → open items for the next pass (§5).
No invariant violations in any of the four full-report runs this pass.

## 1. Harness upgrades

- **JSON result persistence** (`simulate-v4.ts`). Every prior pass's numbers
  lived only in console scrollback, manually transcribed into these
  markdown reports. The full `SuiteResult` (every counter this file quotes)
  now writes to `docs/sim-runs/v4-<timestamp>.json` after each run, so a
  pass can be re-analyzed programmatically. (First attempt used `__dirname`,
  which doesn't exist under tsx's ESM loader and silently no-op'd every
  write — fixed via `fileURLToPath(import.meta.url)`; confirmed working in
  the final verification run.)
- **Card-TYPE win rate** — Unit/Charm/Event/Location deck-presence → win%,
  the same convention as the existing keyword table, independent of any one
  keyword. See §3.
- **Comeback-rate tracking** — snapshots each player's Leader HP at round 8
  (4 full turns each) and correlates who was behind with who ultimately won.
  Answers "how snowbally is this game," a mechanics-health question that no
  existing metric captured. See §4.
- **Archetype head-to-head matchup matrix** — win% for every ordered
  archetype pair, not just each archetype's aggregate win% against the whole
  field. Catches hard counters / rock-paper-scissors problems that an
  aggregate number hides. See §4.
- **Roster coverage for the 2 new-pool Leaders** (Ruin-Walker Overseer,
  Sovereign of the Dying Star) — previously absent from `ARCHETYPES` and
  only sampled incidentally via the 8 pure-random control decks (n=1880,
  not a piloted-deck signal). See §2 and §5 item 1 for the caveat on these.

## 2. Headline finding: the sim harness (and the app's offline fallback) was running on two-thirds of the real card pool

`src/game/generated-cards.ts` — the bundled offline fallback for the
Supabase `cards` table, and what `scripts/simulate-v4.ts` actually imports
via `cardpool.ts`'s `POOL_BY_ID` — had **193 of the 292 cards** now live in
Supabase (`dnngihsbqxccqvvedvjc`, project `cards` table). Every balance pass
since this file was last regenerated was measuring a stale, roughly-two-
-thirds-scale pool: ~99 real cards (including 2 whole Leaders — Ruin-Walker
Overseer and Sovereign of the Dying Star) never appeared in a single
simulated game. Regenerated the file from the live table (all 292 templates,
same field-order/formatting convention). `npm run typecheck` clean.

This is a one-time data-freshness bug, not a design change, but its
downstream effect is large: bringing in ~99 untested cards (34% of the pool)
immediately surfaced the extreme cost-vs-value outliers in §3 — cards that
had simply never been simulated before, several of them wildly over- or
under-tuned by the deterministic hash-based cost/stat assignment purely by
chance of which hash bucket they landed in.

**Action for future passes:** treat `generated-cards.ts` staleness as a
standing risk — the game currently has no automated check that the bundled
fallback matches the live table. Worth a lightweight CI/pre-sim check (e.g.
a script asserting id-set parity) rather than relying on this being noticed
manually again.

## 3. Cards actioned this pass

Baseline run (full pool, before any patch) surfaced these as extreme
cost-vs-value RESIDUAL outliers (win% vs. the mean of every other card at
the *same* cast-difficulty band — the v4.11 harness's band-normalized
metric, immune to the "cheap cards always look OP" offset artifact of the
plain win%/difficulty ratio). Applied the existing named-card identity-patch
pattern (`MANUAL_STEEL`/`MANUAL_VALUE_BUFF`, now joined by a new
`MANUAL_STAT_TRIM` for Units), iterated twice with full-sim verification
between each round:

| Card | Type | Action | Baseline resid. | After 1st patch | After 2nd patch |
|---|---|---|---|---|---|
| Vampire Squid | Unit | ATK/HP −4 (was −2) | +44.8pt | +42.7pt | +40.2pt |
| Half-Faded Shade | Unit | ATK/HP −4 (was −2) | +35.9pt | +33.9pt | +31.1pt |
| Where the Deep Meets the Sky | Unit | ATK/HP −4 (was −2) | +38.2pt | +34.7pt | +33.2pt |
| Blind Colossus | Unit | ATK/HP −2 (was −1) | +24.0pt | +26.8pt* | +24.9pt |
| Faye's True Face | Unit | ATK/HP −2 (was −1) | +23.2pt | +23.4pt* | (n/a this run) |
| The Wolf of Wall Street | Unit | ATK/HP −1 | +27.5pt | +23.3pt | +24.0pt |
| Mesozoic Exchange Student | Unit | ATK/HP −1 | +27.5pt | +23.3pt | +24.0pt |
| Vlad from Accounting | Unit | ATK/HP −1 | +21.2pt | (dropped off top-10) | — |
| Swaying Garden | Unit | ATK/HP −1 | +20.1pt | (dropped off top-10) | — |
| Void Mother | Unit | ATK/HP +2 (was +1) | −21.5pt | −20.5pt | −20.1pt |
| Familiar in the Dark | Unit | ATK/HP +2 (was +1) | −21.1pt | −20.9pt | −20.9pt |
| Butterflyfish School | Unit | ATK/HP +1 | −18.2pt | (dropped off top-10) | — |
| The Locksmith's Regret | Charm | onCast value +2 (was +1) | −27.8pt | −25.5pt | −24.9pt |
| The Abyssal Gate | Event | onCast value +2 (was +1) | −22.4pt | −21.8pt | −21.7pt |
| Wraithlight Lantern | Charm | onCast value +2 (was +1) | −21.0pt | (n/a, see below) | −21.2pt |
| Magma Conduit Network | Location | onCast value +1 | −18.7pt | −19.6pt | −19.6pt |
| Jawbone Span | Location | onCast value +1 | −18.7pt | −19.6pt | −19.6pt |
| Black Smoker | Location | onCast value +1 | −18.2pt | (n/a) | −15.4pt |
| Kinetix Blacksite Cavern | Location | onCast value +1 | −18.2pt | (dropped off top-10) | — |
| Glowing Glyph Tablet | Charm | onCast value −1 (nerf) | +21.1pt | (dropped off top-10) | — |

\* archetype-roster reshuffling between runs (n changed) makes small resid.
moves within noise for these two.

**Honest caveat, carried to §5:** even after doubling/quadrupling the stat
deltas, the worst outliers (Vampire Squid, Half-Faded Shade, Where the Deep
Meets the Sky, Locksmith's Regret, Abyssal Gate) moved only 2-5pt per
doubling — far less than proportional. This residual metric is **not**
archetype-normalized (unlike the existing per-card Echo win-delta table),
so a chunk of each card's measured "power" is very likely deck-composition
confound (these cards happen to sit in whichever archetype already drafts
the strongest keywords) rather than the card's own stat line. Flagged as a
next-pass harness gap in §5 rather than chased further with blind stat
cuts this pass — matches the project's established "surgical, verified,
don't oversweep" convention.

**Swift keyword buff** (`cardpool.ts` `mapUnit`): +1 ATK on cast, the same
compensation shape already proven for Frenzy (+2 ATK) and Anchor (+3 HP).
Swift has measured as the pool's single weakest keyword for at least two
consecutive full-pool passes (34.7-36.8% deck win%, 8-10pt behind the next
weakest) and is Legendary Diver's identity keyword — see §5 item 1, the
Leader has been stuck at 22-24% win rate across every archetype it fields,
by a wide margin the worst Leader in the roster.

## 4. New harness data this pass

**Card-type win rate** (deck contains ≥1 card of this type): Location
56.1-56.4%, Event 49.4-50.1%, Unit 50.0% (exactly, by construction — every
deck has Units), Charm 47.1-47.7%. Locations remain the strongest type by a
wide margin (consistent with the isolated-Location-contribution metric,
+14.1 to +14.6 win% — unchanged from prior passes); Charms are the weakest,
worth a look next pass alongside the keyword table (Bind/Snap-heavy Charm
decks — Sea Witch Bind-Straight Combo 25.5-28.7% — are among the roster's
worst performers).

**Comeback rate:** a player BEHIND on Leader HP at the round-8 checkpoint
(4 full turns each) went on to win only **26-27%** of the time; a player
AHEAD won **73-74%**. This is a strongly snowball-favoring game — falling
behind by the midgame is close to a death sentence. Not actioned this pass
(no obvious single lever; likely needs a dedicated comeback-mechanic design
discussion, not a stat tweak) but flagged as the most consequential *game
mechanics* finding of the pass — see §5 item 3.

**Archetype matchup matrix:** the round-robin win% grid (52×52, all
non-diagonal cells n≥6) shows several near-100%/near-0% hard-counter pairs
that don't show up in aggregate archetype win% — e.g. Mer King Guard-Bulwark
Turtle beats Diver Straight-Combo, Shinobi Echo-Straight, and Sea Witch
Anchor-Scrap Ramp all at 98-100%, while itself losing to almost nothing;
Shinobi Echo-Straight loses essentially every matchup it plays (3-45%
against everything), which aggregate win% (14.2%) already flagged, but the
matrix additionally shows it isn't just "weak," it has *no* good matchups at
all, not even against other weak decks — a full raw-JSON dump of the matrix
is in this run's `docs/sim-runs/*.json` for a deeper follow-up cut.

## 5. Still open — priority list for the next pass

1. **Ruin-Walker Overseer (75.5-77.6%) and Sovereign of the Dying Star
   (64.7%)** are now the two highest-win-rate Leaders in the roster, ahead
   of long-standing top performer Mer-King. **Caveat this pass didn't have
   budget to resolve:** both new archetypes (added this pass, since these
   Leaders were entirely unsimmed before §2's fix) were built with
   Guard/Bulwark and Steel/Toll keyword themes — themselves the #1 and #3
   strongest keywords in the pool. This reads as likely an archetype-
   -construction artifact (I picked the strongest available keyword themes
   for a "neutral baseline" build) rather than confirmed evidence the
   Leaders' own kits are overpowered. Both Leaders print a plain
   threshold-5 Sap(2) ability with no other kit rider, so there's no
   obvious Leader-level lever to pull either way. Next pass should build a
   second, deliberately-average-keyword archetype for each (e.g. Ward/Rally
   or Scrap/Frenzy) before drawing any conclusion about the Leaders
   themselves.
2. **Legendary Diver remains the roster's worst Leader (22-24%)**, unchanged
   in direction by this pass's Swift +1 ATK buff (23.7% baseline → 23.5%
   final run — within noise, and the archetype win rates barely moved:
   Diver Straight-Combo 16.7→15.9%, Aggro-Swift 27.8→29.1%). A +1 ATK
   keyword-wide stat bump was evidently too small to matter at Diver's
   depth of deficit. Given the matchup matrix (§4) shows Diver's archetypes
   losing to nearly the entire field, not just a few hard counters, this
   looks like the same class of problem the v4.11 pass diagnosed for
   Mer-King's Avenge Swarm: a Leader-kit-level issue, not a card- or even
   keyword-level one. Needs the same deck-swap Leader-isolation treatment
   (`simulate-ablation.ts`) v4.11 used there — pilot Diver's exact
   archetypes under a different Leader and vice versa — before spending any
   more keyword-wide balance budget on Swift.
3. **Comeback rate (26-27%) is very low** — confirm whether this is by
   design (a game about racing to lethal, comebacks meant to be rare) or a
   genuine mechanics gap worth a dedicated design pass (a catch-up
   mechanic, a "behind on HP" passive trigger, etc.). No lever identified
   or attempted this pass; needs product/design input on intent before an
   engineering fix is even scoped.
4. **Cost-vs-value residual isn't archetype-normalized** (§3 caveat) — the
   existing per-card Echo win-delta table already solved this exact problem
   for recast cards (normalize against the archetype baseline it was played
   in); the plain cost-vs-value residual table needs the same treatment
   before further per-card stat patches are chased on cards whose measured
   "power" may really be their archetype's.
5. Carried over from v4.11, still unresolved: **Crescendo is a one-card
   keyword** (rolls onto exactly one pool card via hash collision) and the
   **`guardHpBonus` wall-list-meta cut** remains blocked pending a
   Leader-kit-shaped Mer-King fix (not a keyword-wide change) — see
   v4.11 §4 items 1-2 for the full prior analysis, still applicable.
