# Roadmap

Prioritized direction for Frycards. Items move to `CHANGELOG.md` when shipped.

## Near term

- **Mobile/responsive polish** — touch targets and small-screen layout for the
  board and card views.
- **Accessibility pass** — keyboard navigation, screen-reader labels for card
  actions, contrast audit of the monochrome theme (partially underway — see
  the "Bug hunt / accessibility" entries in `CHANGELOG.md`).

## Medium term

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
  Exhume) — implement when cards using them are printed.
