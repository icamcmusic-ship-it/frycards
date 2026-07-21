# Roadmap

Prioritized direction for Frycards. Items move to `CHANGELOG.md` when shipped.

## Near term

- **Guided tutorial match** — an interactive first game that introduces the turn
  structure and core keywords step by step (the static How-to-Play panel is a
  lot to absorb with 35+ keywords).
- **Confirm dialogs on irreversible actions** — attack submission, targeting.
- **Mobile/responsive polish** — touch targets and small-screen layout for the
  board and card views.
- **Accessibility pass** — keyboard navigation, screen-reader labels for card
  actions, contrast audit of the monochrome theme.

## Medium term

- **ELO-tracked CPU gauntlet** — a ranked-style ladder against the CPU as a
  stepping stone to real matchmaking.
- **Daily quests / login rewards** — deepen the gold/gems economy beyond match
  payouts (requires new Supabase tables + RPCs).
- **Set 4** — Set 3 (Dragonbone Wastes, 75 cards) has shipped to the live
  Supabase pool (292 cards total); the pipeline supports further iterative
  content drops.
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
