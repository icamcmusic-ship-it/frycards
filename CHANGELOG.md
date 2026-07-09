# Changelog

Product-level changes to Frycards (Shifting Multiverse TCG). Rules-specific
changes are also tracked in the Change Log section of `docs/RULEBOOK.md`.

## Unreleased

### Added (Rulebook v4.1 — free Locations, longer games, decision tracking)

- **Rulebook v4.1** (`docs/RULEBOOK.md`): Locations no longer use a die — one
  free Location cast per turn as a bonus action (the free-land-drop move);
  Anchor −2 cap codified in rules text; Yahtzee/Four-of-a-Kind combo gates
  demoted to flavor-only (practical ceiling: Full House / Large Straight, with
  one true trophy card in the pool); Leader HP 28→64 to lengthen games ~4
  rounds (measured: 5.9 → 10.2 avg rounds).
- **Elements removed** from all v4 card data — purely cosmetic legacy fields,
  deleted from `CardDef`, the pool remap, and the deck builder (archetypes now
  theme on keywords + effect actions instead).
- **Board wipes added** (guidance D): half of Super-Rare+ Events are now
  Sap-all-enemies at threshold 6; control archetypes draft them (+19pt
  win-correlation when fired).
- **Smarter CPU**: free-Location drops with passive-fit scoring, AoE held for
  2+ targets, deck-aware combo-family rerolling, cross-turn Twin staging,
  start-of-game mulligan.
- **Decision→win tracking**: engine logs per-player plays (face/unit attacks,
  early aggression, wipes, Echo recasts, Twin completes, Location casts,
  leader ability, mulligan, went-first); harness reports did-vs-did-not win%
  deltas across all decisive games.
- **Balance:** Sea Witch leader Bind 4→6; Ward bodies lose their +2 HP stat
  bonus (every-End-Phase Ward refresh already soaks ~5 attacks/game).

### v4.1 playtest findings (8,832 games/run, 3 runs)

- Game length 10.2 avg rounds (target hit); first-player win rate 50.0%;
  Locations now contribute **+8.9–10.9 win%** isolated (up from +0.7%).
- Decision deltas: board wipe +19pt, early face attack +19pt, mulligan +18pt,
  Location cast +11pt, Twin completion **−22pt** (a trap), went-first ±0.
- Remaining outlier: straight-family shells (Sea Witch Bind-Control 93%)
  powered by Large-Straight-gated Sap-8-face events under the straight-chasing
  reroll — flagged for the next tuning pass (retarget or rate-limit them).

### Added (Rulebook v4.0 — errata pass + real-card remap)

- **Rulebook v4.0** (`docs/RULEBOOK.md`): applied the errata from the 1,280-game
  v3.0 playtest. Leader HP 20→28, deck size 40→30, Twin capped at one die per
  Placement Phase, Ward refreshes for both players every End Phase, Bind also
  stops retaliation, Frenzy only doubles retaliation on its 2nd swing, new
  **Pitch** die-waste sink (unplaced die → Mend 1), Echo fodder-discard ruling
  codified. All enforced in `src/game/v3/engine.ts`.
- **Real-card remap** (`src/game/v3/cardpool.ts`): all 193 backend cards are now
  remapped onto v4.0 mechanics, keeping their core identity (name, image, flavor,
  rarity, type, elements) and deleting the obsolete resource-era data (colored
  costs, attach bonuses, Overclock/Modularity/Siphon/Phalanx keywords). The
  dead `Item` type is folded into Charms. 6 real Leaders at 28 HP.
- **Deck builder** (`src/game/v3/decks.ts`): 12 archetype decks (2 per Leader)
  built from the pool as legal 30-card / max-3-copy lists, with combo-family
  coherence (never mixes straight- and matching-gated cards in one shell).
- **Advanced CPU** (`src/game/v3/ai.ts`): adds a start-of-game mulligan,
  deck-aware reroll (chases the shell's combo family and staged-Twin needs),
  and Twin staging across turns under the new one-die rule.
- **v4.0 harness** (`npm run sim:v4`): round-robin across all 24 decks (12
  archetypes + Location-stripped twins) with an **isolated Location win-rate
  contribution** measurement, first-player edge, game-length distribution,
  per-card OP/useless ranking, Pitch/waste split, and combo/keyword activity.

### Playtest findings (10,000+ v4.0 games)

- Locations contribute only ~+0.7–1.5 win% over filling their slot with cheap
  Units, and cast 0.3–0.7×/game — they still under-earn a full die even with
  the passive+Ability-Slot upgrade.
- Yahtzee/Four-of-a-Kind trophy gates (Submerged Starfall etc.) cast ~0.02×/game
  — effectively dead even with Echo. Recommend reserving those gates for a tiny
  trophy count and capping regular-play gates at Full House / Large Straight.
- Leader/archetype win rates still span ~19–80%; the spread is driven by deck
  *construction quality* (aggressive/tempo shells beat reactive shells in a fast
  ~6-round meta), not single-card power. Flagged for a deeper tuning pass.

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
