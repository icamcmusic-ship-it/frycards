# Roadmap

Prioritized direction for Frycards. Items move to `CHANGELOG.md` when shipped.

## Near term

- **Mobile/responsive polish** — touch targets and small-screen layout for the
  board and card views.
- **Accessibility pass** — keyboard navigation, screen-reader labels for card
  actions, contrast audit of the monochrome theme (partially underway — see
  the "Bug hunt / accessibility" entries in `CHANGELOG.md`).

## Medium term

- **The rest of the Location residual gap** — v7.4 added the ramp-matched
  baseline the v7.2 pass asked for (`topOverperformersRampMatched`), and it
  moves individual cards by up to 8 points, but it removes only 6-18% of the
  aggregate Location/non-Location gap and both cohorts still show ~+1.7 left.
  Either Locations really are that much stronger or there is a second confound
  length-matching cannot see. Price off the ramp-matched list meanwhile, and
  lift the old blanket block card by card. See the v7.4 addendum in
  `docs/BALANCE_SIM_FINDINGS_v7.2.md`.
- **Unbreakable's residual** — v7.4 printed the keyword for the first time and
  trimmed all three carriers' stat budgets on arrival. Post-trim the cohorts
  disagree: +4.5 (n=183) on seed 1337, +10.6 (n=139) on seed 24601. At that
  sample size that is the cohort artifact the `KEYWORD_COST` Doublestrike note
  warns against chasing, so it needs a proper pass rather than another
  stacked point. Note all three sit at the cost cap, so `COST_ADJUST` is a
  no-op and `STAT_ADJUST` is the only live lever. See `CHANGELOG.md` v7.4.
- **Two Leaders at the extremes** — the colour-aware minus rule landed in v7.4
  and Mer-King, the last inert kit, is fixed (see `CHANGELOG.md`). What is left
  is per-Leader pricing, which that rule cannot reach, and both cases are the
  same well-documented shape: a full Resolve tank buying unconditional removal
  more than once.
  - **Void Mother 71.7% / 72.0%**, first in both cohorts by ~12 points. Resolve
    **6** with a `-2: Banish` — three unconditional removals per tank. The
    `LEADER_MINUS_ABILITY_OVERRIDE` header already names this exact shape as
    "the strongest kit shape in the game" and repriced Ruin-Walker's identical
    Void Banish from -2 to -3 for it; Void Mother kept the -2 AND has double
    the Resolve. Lever: price the minus, or drop the Resolve.
  - **Kuro, the Unseen 32.4% / 34.0%**, last in both. Resolve **3** against a
    `-2` minus, so a full tank buys one use and strands a point. Its v7.2
    override shipped at -2 after a -1 version overshot to 61.6%; at Resolve 3
    that reprice appears to have overcorrected. Lever: Resolve, or the minus
    price — not the effect, which two trials already bracketed.
- **ELO-tracked CPU gauntlet** — a ranked-style ladder against the CPU as a
  stepping stone to real matchmaking.
- **Volume #2** — the content pipeline supports further drops on top of the
  live 292-card pool. (The old per-set split — Blue Coral / Crimson Circuit /
  Dragonbone Wastes / Full Arts Collection 1 — was consolidated into the
  single "Volume #1" set; see `CHANGELOG.md`.)
- **Persistent match history / replays** — store per-match logs and let players
  review past games.

## Long term

- **Multiplayer (PvP)** — requires a server-authoritative engine; see
  `docs/PVP_DESIGN.md` for the design spike.
- **Unprinted keywords** (Fate, Freeze-Dry, Blessed, Scorched-Earth, Glaciate,
  Exhume) — implement when cards using them are printed. (v6.9 printed a
  different new generation instead: one keyword per Essence Type — Wildfire,
  Tidecaller, Thriving, Nimble, Radiant, Withering, Entropic — plus the
  `exhaust` and `weaken` effect actions. See `docs/RULEBOOK.md`.)
