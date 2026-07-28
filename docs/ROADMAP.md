# Roadmap

Prioritized direction for Frycards. Items move to `CHANGELOG.md` when shipped.

## Near term

- **Mobile, third pass.** The board (v7.4) and the three card-heavy meta
  screens (v7.4, via the new `meta-preview.html` harness) are measured and
  clean at 375px. Still open: the remaining meta screens (Store, Marketplace,
  Social, Profile, Settings, Battle Pass) have never been measured — the
  harness makes that cheap now — and the board's hand fan at seven-plus cards
  is tight enough on a 375px screen that names are hard to read even though
  every card is tappable. A horizontal scroll strip may beat the fan below the
  `sm` breakpoint.
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
- **Kuro, the Unseen — 35.2% / 35.8%, still last in both cohorts.** v7.4 gave
  it Resolve 4 (a new `LEADER_RESOLVE_OVERRIDE`) so a tank buys two shrinks
  rather than one; that moved it only +2.8 / +1.8, so Resolve is close to
  exhausted as a lever and the effect size was already bracketed from both
  sides in v7.2 (-1 overshot to 61.6%, -2 undershot). What the v7.4 kit
  diagnostics newly rule out: it is not idling (0% idle, both abilities fired
  thousands of times, both at ~35%), so the kit is being used and losing
  anyway. The next lever is its cost or its Gale/Shadow colour pair, not its
  abilities. Void Mother, the other extreme, was fixed this pass (71.7% →
  60.1%).
- **The v7.4 keywords, one settling pass.** All six now print and are wired to
  real engine hooks (see `CHANGELOG.md` and `docs/RULEBOOK.md`). Two want a
  second look once the pool has settled:
  - **Blessed** reads +21.9 (76.3%, n=194) in one cohort and +6.0 (51.4%,
    n=755) in the other. The cohorts disagree and the high reading is the
    small sample, so no action — but a damage shield that blanks a whole
    removal spell is the kind of effect that deserves confirming.
  - **Fate** is -2.0 / -3.4 after its redesign, below even in both cohorts but
    inside the band Surge, Aerial and Resonant already occupy. Watch, do not
    price.
  - **Exhume** cleared the sample floor in only one cohort (+13.0, n=253).
    Needs a run where both cohorts draft it before it means anything.
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
