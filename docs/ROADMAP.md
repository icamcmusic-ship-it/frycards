# Roadmap

Prioritized direction for Frycards. Items move to `CHANGELOG.md` when shipped.

## Near term

- **Mobile/responsive polish** — touch targets and small-screen layout for the
  board and card views.
- **Accessibility pass** — keyboard navigation, screen-reader labels for card
  actions, contrast audit of the monochrome theme (partially underway — see
  the "Bug hunt / accessibility" entries in `CHANGELOG.md`).

## Medium term

- **Ramp-matched baseline for Location residuals** — the balance harness
  scores a card's win rate conditional on having played it, which is
  structurally biased upward for Locations (a pricier Location is only played
  in games with more ramp). Every two-cohort outlier in the v7.2 pass is a
  Location, and several already carry +2/+3 cost stacks chasing it. Blocks any
  further Location pricing. See `docs/BALANCE_SIM_FINDINGS_v7.2.md` §3.
- **Colour-aware Leader minus abilities** — `mapLeader` takes the minus from
  `identity[0]` and the plus from `identity[1]`, so which colour supplies a
  Leader's answer is decided by array order in `LEADER_COLORS`. v7.2 patched
  the three worst cases by hand via `LEADER_MINUS_ABILITY_OVERRIDE`; the
  systemic fix is to let the kit draw from whichever half is interactive,
  which re-rolls all eight Leaders and needs its own pass.
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
- **True stack/priority (APNAP) system** — currently simplified to
  deterministic resolution order; a real priority system would unlock
  instant-speed, interaction-heavy card designs.
- **Unprinted keywords** (Fate, Freeze-Dry, Blessed, Scorched-Earth, Glaciate,
  Exhume) — implement when cards using them are printed. (v6.9 printed a
  different new generation instead: one keyword per Essence Type — Wildfire,
  Tidecaller, Thriving, Nimble, Radiant, Withering, Entropic — plus the
  `exhaust` and `weaken` effect actions. See `docs/RULEBOOK.md`.)
