# Balance & Sim Findings — v6.3 (July 2026)

Latest CPU-vs-CPU balance pass, run AFTER the v6.3 sim-harness/card/Leader
changes below. Supersedes the v6.2 findings doc (deleted). Raw report:
`docs/sim-runs/` (latest JSON; only the most recent run is kept in-repo).

**Run:** `npx tsx scripts/simulate-v5.ts 8 48 1337` — 18,048 games, 48 random
archetype decks, seed 1337 (same seed as v6.2, so deltas below are directly
attributable to this pass's changes, not cohort noise). **Invariant
violations: 0.** A dedicated `npx tsx scripts/simulate-v5.ts 1 300 1337`
coverage check and the harness's built-in `leaderPairSuite` were also run.

## Full card pool confirmed

Live Supabase `public.cards` (292 rows) diffed field-for-field against the
bundled `generated-cards.ts` fallback the sims run over: 292/292 match
exactly, zero mismatches. Sims below run over the complete, current pool.

## What changed before this run (v6.3)

Sim harness data captures added first (per the standing "improve the harness
before trusting its output" practice):
- **Keyword dead-weight rate** (`keywordDeadWeight`): of games where a
  keyword with real activation telemetry was carried, what % never actually
  fired. Caught its own bug immediately: Ambush's activation counter is
  incremented directly by the harness (not routed through the shared
  `telemetry.onKeywordProc` hook like every other keyword), so the new
  per-game tracker saw 100% "never activated" for Ambush every time — fixed
  by feeding that counter too. The real rate is 90.9% (n=17,917): Ambush
  carriers mostly still get invoked as ordinary main-phase plays, not via
  their reaction-window timing, which is expected (not a bug).
- **`keptColorDeadHand` lapse**: `ai.ts`'s mulligan rule (`handIsKeepable`)
  only checks that a cheap card AND a Unit exist in hand, not whether either
  is castable under the deck's own producible colors. Checked across
  18,048 games: **0 occurrences** — deck construction already keeps this
  from happening in practice, so this is a confirmed non-issue, not a gap.
- **Per-Leader idle-ability rate** (`leaderIdleAbility`): splits the
  existing global `idleLeader` lapse by Leader kit. First implementation had
  the same tautology bug as the metric it was meant to refine: gating
  "opportunity" on the post-turn resolve value being unchanged is
  indistinguishable from gating on "no ability was used" (every Leader
  ability has a nonzero `resolveDelta`), so every opportunity the old check
  could see was *already* an idle one — a per-Leader breakdown of that would
  always read 100%. Fixed by snapshotting the opportunity **pre-turn**
  (invoked, not shattered, has a +Resolve ability — independent of what
  happens later) and keeping the idle check itself post-turn. Real result:
  0-0.3% idle rate across all 8 Leaders (10k-55k opportunities each) — the
  CPU essentially always uses a free Resolve builder when it can. Healthy,
  not a lapse worth chasing.
- **Essence float by game stage** (`essenceFloatByStage`): early/mid/late
  breakdown of the active player's floated essence. Early 0.08, mid 0.71,
  late 4.25 — float is concentrated in the late game, consistent with
  running out of castable hand cards rather than a curve-efficiency bug
  (the existing `wastedEssenceWithPlay` lapse, which only fires when a
  playable card WAS available, stayed flat).

## Findings acted on this pass

- **Resonant per-card fix** (carry-forward from v6.2, which cut the shared
  keyword cost 3→2 and flagged the -17.1 archetype-normalized delta as
  possibly a single-card problem rather than a keyword-wide one): the new
  by-cost-band keyword report splits Resonant's three carriers cleanly for
  the first time — `dissolving_persona` (cost 4, the 3-4 band) actually
  reads **+56.6%** win rate, while the two cost-5 carriers
  (`bioluminescent_tide`, `flash_freeze`, the 5+ band) read **12.3%** — the
  *opposite* of the v6.2 doc's guess that `dissolving_persona`'s
  single-target Banish was the drag. Fixed at the card level:
  `bioluminescent_tide` and `flash_freeze` both -1 cost. Keyword-wide
  archetype-normalized delta improved -17.1 → -13.4 (still outside the
  healthy band — see carry-forward).
- **Avatar of the Abyss — second lever** (carry-forward #3 from v6.2, which
  stripped its Commander keyword): still the clear top seed both in the
  random-cohort tournament (67.8%, unchanged, as expected since nothing
  about it changed before this run) and, more tellingly, in the
  deckSeed-pinned `leaderPairSuite` (77.4% average across all seven other
  pinned Leaders — a Leader-kit-isolated signal, immune to cohort luck).
  Per the v6.2 doc's own next-step ("trim its -2 Shatter's cost
  efficiency"), its minus ability's Resolve cost is bumped -2 → -3 via a new
  `LEADER_MINUS_RESOLVE_OVERRIDE` lever (the Leader-kit equivalent of
  `COST_ADJUST`/`STAT_ADJUST`, alongside the existing `LEADER_KEYWORD_STRIP`
  from v6.2). Re-verified same-pass: random-cohort win rate 67.8% → 63.2%,
  pinned-suite average 77.4% → 70.3% — real movement, still on top (see
  carry-forward).
- **Card cost/stat adjustments** (`COST_ADJUST`/`STAT_ADJUST` in
  `cardpool.ts`, from z-score outliers across this pass's 18,048-game run):
  eight repeat overperformers/underperformers from v6.2 that hadn't fully
  settled got a second stacked point; ten newly-flagged cards costed up,
  eight costed down; `familiar_in_the_dark` (already at the cost-7 ceiling)
  got a third stat trim. Full list below.

### Card cost/stat changes this pass

Second stack (still outside |z|>=1.5 the same direction after their first
v6.2 point):
- `+1` more (now `+2` total): `sand_portal`, `glass_kelp_forest`,
  `resonant_shuriken`, `chalice_of_quicksilver`.
- `-1` more (now `-2` total): `porcelain_lobster`, `ashen_circle_rite`,
  `sonic_shatter`, `celestial_attunement`.
- `familiar_in_the_dark` STAT_ADJUST: `-2` → `-3` (still +10.3 residual at
  the cost ceiling — a third stat-budget trim since a further `COST_ADJUST`
  would clip to nothing).

New first-time flags (|z|>=1.5, 18,048-game run):
- `+1`: `glass_shrimp`, `abyssal_pathway`, `amber_sphere`, `neon_moray`,
  `haunted_submarine`, `shinobi_operations_base`, `kraken_s_monolith`,
  `scallop_map`, `urnbearer_of_blight`, `ashhound_pack`.
- `-1`: `towering_tsunami`, `blood_moon_descent`, `cavernous_watcher`,
  `obsidian_scalpel`, `secret_lair`, `silver_chimera`, `helix_swarm`,
  `bubble_harvest`.
- `-1` (Resonant per-card fix, see above): `bioluminescent_tide`,
  `flash_freeze`.

## Headline results

| Metric | Value | Read |
|---|---|---|
| P1 win rate | 60.9% | Unchanged — this pass touched no turn-order/hand-size mechanics. Still the top carry-forward item (4th consecutive pass at ~59-63%), see below. |
| Avg game length | 20.1 turns | Flat vs v6.2 (20.0). |
| Vitality wins | 93.2% | Flat vs v6.2 (93.7%). |
| Clashes/game | 8.5-ish, first clash ~turn 5.3 | Unchanged shape. |
| Comeback rate | ~25% | Flat vs v6.2. |
| Pool coverage | 70.4% of 284 non-Leader cards decked (48-deck tournament); 88% at the dedicated 300-deck coverage check | Flat vs v6.2 (71.1%/89.1%) — expected noise, not a regression; full pool confirmed live (see above). |

## Keyword health (archetype-normalized delta, carrier games, this run)

Healthy band (±10, same goalpost as v6.2): Sacred +9.1, Warded +5.8, Aerial
+5.8, Siphon +5.3, Reckless +6.0, Alert +4.6, Runic +4.1, Venomous +4.0,
Unbreakable +3.5, Bountiful/Overrun/Skywatch/Ambush/Immobile/Commander/
Resolute/Quickstrike/Regenerate/Surge all under ±2, Soulbound -3.8,
Swarmproof -1.0. **Doublestrike +11.1** is a hair outside the band (was
+8.1 in v6.2) — first time it's cleared the goalpost, single-run, not
acted on this pass (see carry-forward).

**Resonant** improved with this pass's per-card fix but is still the one
keyword outside the healthy band: -13.4 at n=1,208 (was -17.1). See
carry-forward.

## Leader spread

Avatar of the Abyss 63.2 / Crimson Vector Commander 65.1 / Mer-King 57.2 /
Ruin-Walker Overseer 46.8 / Apex Nanite Shinobi 43.9 / Sovereign of the
Dying Star 38.3 / Ethereal Sea Witch 39.5 / Legendary Diver 37.6.

Crimson Vector Commander now edges out Avatar of the Abyss in the
random-cohort table (65.1% vs 63.2%) — but the deckSeed-pinned
`leaderPairSuite`, which isolates the Leader kit from cohort luck, tells a
different story: Crimson Vector Commander averages only 57.1% there (mid-
pack, not an outlier), while Avatar of the Abyss still averages 70.3%. This
is exactly why the pinned suite exists — Crimson Vector Commander's
random-cohort number looks like deck-composition luck in this particular
48-deck draw, not a kit problem, so it is **not** actioned this pass.

## CPU decision quality

- Guard divergence 0%, removal-target suboptimal 3.0% (flat vs v6.2's 2.8%).
- Attack divergence 21.5% (flat vs v6.2's 21.8%) — still believed to be
  mostly shadow-heuristic/real-CPU timing daylight (Main I plays changing
  the board before Clash), not a genuine CPU bug; see carry-forward.
- `venomousSuicideBlunder` 685/18,048 games (3.8%) — flat vs v6.2 (2.9%,
  within noise of a different-composition deck cohort from this pass's cost
  changes).
- `tookGuardableLethal` 646/18,048 (3.6%) — flat vs v6.2 (3.0%).
- Per-Leader idle-ability rate (new this pass, see above): 0-0.3% across
  all 8 Leaders — a clean bill of health, not a lapse.
- `keptColorDeadHand` (new this pass): 0/18,048 — checked, ruled out.

## Carry-forward items

1. **First-player advantage (~59-63%)** — flat across four consecutive
   passes despite the existing digital compensation (P2 draws an 8th
   opening card, per `docs/RULEBOOK.md` §3). Still not acted on beyond that
   existing fix; still needs its own dedicated pass with careful invariant
   checking rather than a drive-by change bundled into a balance pass.
2. **Resonant** — per-card fix (this pass) improved -17.1 → -13.4 but
   didn't fully close it. Next lever: re-examine `bioluminescent_tide` and
   `flash_freeze` specifically after this pass's -1 lands (both are now
   cost 4, same band as `dissolving_persona`) rather than touching the
   shared keyword weight again.
3. **Avatar of the Abyss** — the -3 Resolve ability nerf (this pass) moved
   its pinned-suite average from 77.4% → 70.3%, real progress but still the
   clear top seed. If it's still on top next pass, it has no further
   keyword or cost/stat budget to trim (Leaders don't carry stats) — the
   next lever would be a Resolve-pool change (e.g. capping its printed
   Resolve down a tier) rather than a third ability-cost bump.
4. **Attack divergence (21.5%)** — unchanged since the v6.2 shadow-model
   rewrite; still ambiguous whether this is real CPU headroom or permanent
   heuristic/timing daylight (Main I board changes between the shadow
   snapshot and the real Clash). Worth a harness change (snapshot
   immediately pre-Clash instead of pre-Main1) before trying to fix it as a
   CPU issue.
5. **Doublestrike (+11.1)** — first time outside the ±10 band, single-run;
   watch next pass before any cost action.
