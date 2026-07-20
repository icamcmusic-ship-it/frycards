# Balance Sim Findings — v4.17

This pass (commit `c8decf8`) shipped without ever getting a findings doc —
backfilled alongside v4.16's (see `docs/BALANCE_SIM_FINDINGS_v4.16.md`) so
each doc matches what the code's own inline comments (`ai.ts`/`cardpool.ts`)
actually label v4.16 vs. v4.17. Numbers below are carried over verbatim from
the original commit message.

## AI die-utilization and mulligan (`ai.ts`)

- `handIsKeepable()`: tightened the mulligan-keep bar from a flat
  `cheapPlays>=2 && units>=1` to also require `cheapPlays>=3 || units>=2` —
  hands kept at the bare former minimum measured a **-23.1pt** win-rate
  delta vs. comfortable keeps.
- `playPlacement()`: added a fallback pass (Item A) that spends any
  still-legal, still-affordable cast (cheapest first) after Rally instead of
  ending the turn with playable dice left unplaced — **17.7 wasted
  dice/game** on average, **-32.0pt** delta when it happened. Dice fully
  reset each turn in `engine.ts`, so nothing is lost by spending them.

## Cost-vs-ability card tuning (Item A/B — z-scores + cost-band residual outliers, 66,120-game sim)

- **Cost nudges (Item A)**: Deceptive Angler and Blind Colossus's combo gates
  tightened; Driftwood Harp and Ribbone Longbow's thresholds raised; Mist
  Ghost Ship and Ribvault Cathedral's onCast value trimmed.
- **Buffs (Item B)**: Jagged Dragonfang Blade, Jarred Sunspark, Shimmering
  Statue, Diamond Anchor (value); Bubble Harvest, Bone Splinter Quill
  (threshold eased); Smokeveil Striketeam (stat); Shark Gathering, Locust
  Veil (combo gate eased).
- **Nerfs (Item B)**: Wasteland Aberration, Kinetix Enforcer, Boneplate
  Sentinel, Amethyst Starfish, Astral Shoal (stats); Abyssal Pathway, Sunken
  Meadow, Obsidian Altar, Sovereign Spires of Arrak Zul (onCast value).
- **Skipped deliberately**: Ash-Shaper Mystic, Rune-Etched Tablet, Nanite
  Culture Lab, The Descent, Wraithlight Lantern, Half-Faded Shade — either
  small-sample artifacts of v4.16's color-legality fix landing in the same
  window, or already carrying a manual override from that pass.

## Verification

`npm run typecheck` / `npm run lint` (0 errors) / `npm run test` (93 tests)
clean at the time. No dedicated post-landing full round-robin was recorded
for v4.16+v4.17's combined state — carried forward as v4.18's first
verification task (see `docs/BALANCE_SIM_FINDINGS_v4.18.md`).

## Carried into v4.18

1. `lapseUnusedDiceAtEndTurn` (Item A's target) was still the single largest
   CPU-lapse rate in the first post-landing full round-robin (15.52/game,
   -28.9pt delta) — the fallback pass helps but doesn't fully close the gap;
   needs a follow-up lever, not just re-measurement.
2. Two Item A/B-patched cards (`the_wolf_of_wall_street`, a nerf;
   `butterflyfish_school`, a buff) flipped to the *opposite* residual extreme
   in the v4.18 baseline — classic overshoot, not noise (both show a
   >30pt residual in the wrong direction) — worth a direct look before
   patching either again.
