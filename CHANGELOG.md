# Changelog

Product-level changes to Frycards (Shifting Multiverse TCG). Rules-specific
changes are also tracked in the Change Log section of `docs/RULEBOOK.md`.

## Unreleased

### Added (Rulebook v3.0 — dice-placement overhaul)

- **New rules canon:** `docs/RULEBOOK.md` is now the v3.0 dice-placement
  rulebook (5d6, one reroll, four placement destinations, Combo patterns,
  sequential targeted combat). The old Shifting Multiverse V1.9 rules moved to
  `docs/RULEBOOK_V1_LEGACY.md` and still power the current UI.
- **New engine** (`src/game/v3/engine.ts`): full v3.0 turn structure —
  Draw/Roll/Reroll/Placement/Combo Check/Combat/End — with Twin staging, Echo
  recasting (incl. banish-on-second-discard), Scrap, Rally, Anchor thresholds,
  Overflow off effective thresholds, Guard walls, Pierce leftover overflow,
  Ward-before-Frenzy ordering, Leader with no ATK/retaliation, deck-out and
  simultaneous-loss rules.
- **New card set** (`src/game/v3/cards.ts`): 4 Leaders + 38 cards covering
  every v3.0 keyword, with 40-card decklists per Leader (max 3 copies).
- **Playtest harness** (`npm run sim:v3`): seeded CPU-vs-CPU round-robin with
  invariant checks, leader win rates, per-card usage/impact and mechanic
  activity. Balance pass validated over 800 games (three leaders at
  52.5–53.3%; Shadow Duelist 41.3% flagged for follow-up).
- **Follow-up needed:** the React UI (`src/components`, `src/App.tsx`) still
  renders the legacy resource game and needs a redesign for dice placement.

### Changed (Rulebook V1.9)

- **Leader rebalance** (validated over 900 simulated games; all six leaders
  now 45.0–54.7% win rate, first-player 51.8%): Avatar of the Abyss 20→24 HP,
  Crimson Vector Commander 38→35 HP. Live Supabase pool re-synced.
- **Rules clarification:** Guard cannot bodyblock hostile Charms — a Charm
  attaches to a player, so it interacts with the enemy Leader's Ward and
  Feedback only (§4). The text now matches what the engine always enforced.
- **CPU:** can activate the revealed active Location's ability, mulligans
  Location-flooded hands, and aims Freeze at a ready enemy Guard first
  (silencing the interceptor unlocks the rest of the board).
- **Fixed:** TypeScript build error in the pack-reveal screen
  (`pullToGameCard` missing `attacksThisTurn`).

### Added (V1.9)

- Negative-path fuzzer (`npm run fuzz`, in CI): games survive a 50% mix of
  hostile/garbage actions with server authority asserted — no crash, no
  resource theft, no zone/capacity overruns, no duplicated card instances.

### Changed (Rulebook V1.8)

- **Shell Game rework:** you now flip one of your OWN face-down Locations at
  the start of your turn (previously the opponent's — decking Locations
  mostly helped the enemy).
- **Location passives are controller-only:** `ATK_ALL`/`HP_ALL` buff only the
  controller's Units and `SCORCH_ALL` singes only enemy Units; Symmetric
  Locations affect both players.
- **Armor rework:** Armor X now reduces every hit by X with a 1-damage floor
  and never breaks (was: full absorb of hits ≤ X, total shatter otherwise —
  small units had zero counter-play against armored walls).
- **Fixed:** face-down Location abilities can no longer be activated (hidden
  information / latent exploit).
- **Balance pass:** ~40 cards re-costed/re-statted and four leader engines
  re-seated; all six leaders land between 46.0% and 53.3% win rate over
  1,200 simulated games. See `docs/RULEBOOK.md` V1.8 change log for the
  full list. Live Supabase card pool re-synced.
- **CPU:** values own Locations correctly under the new Shell Game, considers
  lethal face-damage with unit-target Events, and splits attack waves across
  multiple Guards using per-hit Armor projection.

### Added

- CI pipeline (GitHub Actions): typecheck, lint, format check, engine regression
  suite, Vitest, and production build on every push/PR.
- ESLint (typescript-eslint + react-hooks) and Prettier configuration.
- Engine regression suite surfaced as per-case Vitest tests (`npm test`),
  alongside the standalone runner (`npm run test:engine`).
- Leader-vs-Leader matchup matrix in the balance simulator (`npm run sim`).
- Deck import/export codes in the deck builder.
- Match log export (copy full game log).
- Game speed setting (normal/fast CPU pacing).
- Search and filters (element, type, cost) in Collection and Deck Builder.
- `docs/ROADMAP.md` and `docs/PVP_DESIGN.md`.

### Removed

- Vestigial scaffold dependencies: `express`, `dotenv`, `@google/genai`.

## V1.7 and earlier

Rules engine and balance work tracked in `docs/RULEBOOK.md` (V1.6, V1.7):
leader damage-pipeline uniformity, Command+Surge loop and mulligan exploit
fixes, exact Feedback refunds, fair Wildcast shuffling, CPU improvements,
and leader rebalancing validated by large-sample simulation.
