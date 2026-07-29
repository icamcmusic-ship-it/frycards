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

- **The cost-2 Sanctum band** — the balance item v7.6 uncovered while closing
  the Sacred one, and the top of the list. `metricDiagnostics.locationsByCost`
  reads +5.38 / +4.60 for 2-cost Sanctums as a class and +6.65 / +5.30 for the
  ones with no keyword at all — the keyword-free Sanctums read at or ABOVE
  their keyworded neighbours in both cohorts. The next move is a comparator,
  not a lever: a Sanctum play is itself the ramp step the ramp-matched baseline
  matches on, so try a Location-only baseline before pricing anything (and note
  a cost point on a Location is still binary — three demonstrations in v7.5).
  See `docs/BALANCE_SIM_FINDINGS_v7.6.md` §1.
- **Sentinel of the Nether Pit (`crimson_vector_commander`) 38.8 / 63.7** — a
  25-point cohort split, a shatter rate an order of magnitude above every other
  Leader, and it owns cohort A's whole spread. Never actioned. Needs a pinned
  `leaderPairSuite` read that cohort composition cannot reach.
- **The two Unbreakable 7-drops** — `the_wolf_of_wall_street` (+8.6 / +6.4) and
  `the_pier_side_menace` (+10.5 / +10.5). v7.6 removed the Wolf's printed
  ability entirely (it ships) and refused the same lever on the Menace (it lost
  a third of its plays). Every lever aimed at the Wolf's TEXT is now spent, so
  what is left is the body — and v7.5's "STAT_ADJUST is inert on it" reading
  was taken while the ability was still printed, so under v7.6 §3 it has
  expired. Re-measure the stat lever on the cards as they now print.
- **Kuro, the Unseen 45.6 / 39.8** — still bottom in cohort B. Both named
  levers are now spent or refuted (v7.6 §3); the next one has to be found
  rather than looked up.
- **`Fate` -5.0 / -1.8** — nine carriers and the largest sample of any keyword
  in the pool after v7.6 widened its roll band, and it has never been priced.
  First candidate for a keyword weight change (it sits at 1, and note
  `keywordCostAdj` is `Math.round(w / 2)`, so the effective step is two).
- **`Glaciate` +9.8 / +11.5** — its every-other-Dawn lever measured -3.3 / -4.2
  in isolation and then did not survive the roll-band widening later in the
  same pass. Re-measure on the settled pool.
- **`Scorched-Earth` has no cohort-B reading**, before or after its v7.6 gate.
  A keyword one of the two deck cohorts never drafts cannot clear a two-cohort
  bar; it needs a third cohort or a pinned deck suite.
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
- **Leader keywords** — Leaders have three (Commander, Resolute, Warlord) where
  every other type now has six or seven, and v7.5 skipped them on purpose: the
  Leader keyword roll (`roll(seed, 'ldr-kw6', 6)`) has no free band, so any
  addition re-rolls all nine existing Leaders. Needs the roll restructured
  first, and a balance pass to follow it.
