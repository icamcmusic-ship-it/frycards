# Roadmap

Prioritized direction for Frycards. Items move to `CHANGELOG.md` when shipped.

## Near term

- **Mobile/responsive polish, third pass** — v7.4 made the match board
  playable on a phone and v7.5 did the card views outside it (collection, deck
  editor, pack opening, mulligan) plus the hand scroll strip; see
  `CHANGELOG.md`. Not yet measured on a phone: the store, marketplace, player
  shops, social and profile screens, and the 3D card inspector. `npm run dev`
  plus `meta-preview.html` / `board-preview.html` is the harness — extend the
  former as screens are covered.
- **Accessibility pass** — keyboard navigation, screen-reader labels for card
  actions, contrast audit of the monochrome theme (partially underway — see
  the "Bug hunt / accessibility" entries in `CHANGELOG.md`).

## Medium term

- **Sacred / `stone_bubbles`** — the last balance item with a clean diagnosis
  and no lever pulled. Four cost trials across three passes, under both the
  flat and the ramp-matched metric, and the number has never once moved down in
  both cohorts; v7.5 §1 removed the last reason to blame the measurement. The
  next lever is the Sacred **effect**, not its price. See
  `docs/BALANCE_SIM_FINDINGS_v7.5.md`.
- **The two Unbreakable 7-drops** — `the_wolf_of_wall_street` (+8.2 / +10.6)
  and `the_pier_side_menace` (+9.1 / +9.7). v7.5 moved both for the first time
  with the new `UNIT_EFFECT_ADJUST` lever after cost, stats and the keyword's
  own text all measured inert on them; both are still out of band. The residue
  is a body that cannot be answered on the turn it lands, so re-check after one
  pass with Unbreakable bounded to once per turn.
- **Kuro, the Unseen 37.4 / 38.6** — bottom in both cohorts with one lever
  pulled (its minus repriced -2 -> -1). The Resolve lever is measured at
  +2.3 / +3.6 and unspent; the "one lever per Leader per pass" rule holds it
  for the next pass.
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
