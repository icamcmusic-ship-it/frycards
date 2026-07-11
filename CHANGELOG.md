# Changelog

Product-level changes to FryCards (formerly "Shifting Multiverse TCG").
Rules-specific changes are also tracked in the Change Log section of
`docs/RULEBOOK.md`. A condensed version of this history also powers the
in-app Changelog screen (`src/meta/ChangelogScreen.tsx`).

## Unreleased

### Changed (real card art)

- **All card art now served from Supabase Storage** (`Card Images` bucket,
  made public) instead of the old ImageKit CDN — matched to each card by
  filename. 187 of 193 cards had a matching upload; the 6 that never had art
  (`Abyssal Soul-Eater`, `Chrono-Phalanx`, `Lurking Coral-Prowler`,
  `Modularity Core`, `Quantum Overclocker`, `Starfall Wildcaster` — none were
  Leaders, none were owned by any player or used in any deck) were removed
  from the catalog. The bundled offline fallback catalog
  (`src/game/generated-cards.ts`) was regenerated to match exactly.

### Added (Economy 2.0 — rarity tiers, pity, shards, packs, disclosure)

Implements the economy design document end to end (marketplace/trading and
battle-pass progression deliberately deferred — the former is the doc's
"third rail" legal-risk subsystem and both need multiplayer infrastructure).

- **7-tier rarity ladder**: new **Full-Art** tier between Ultra-Rare and
  Mythic (8 existing top cards promoted deterministically, teal color code,
  mirrored in the bundled fallback catalog and the `cards` table).
- **Slot grammar** (`pack_types.slot_config`): slots now carry
  `slot_type, count, guaranteed_min_rarity, rarity_weights, foil_eligible,
  foil_chance_override, pity_key, pity_cap, dupe_protected` — the server
  rolls rarities from per-slot weight tables (`roll_weighted_rarity`) with
  the legacy string slots still supported.
- **New pack catalog** (8 types): Standard Booster, Deluxe Booster,
  Set Spotlight, Event Pack, Mythic Vault (hard 20-box Mythic pity),
  Collector Booster Box, Daily Free Pack (20h cooldown, `claim_daily_pack`
  RPC) and Season Pass Reward Pack (present, not purchasable). Old catalog
  rows deactivated via new `pack_types.is_active`.
- **Pity + duplicate protection** (`grant_pack_contents`): Full-Art-or-better
  guaranteed within 10 packs, Mythic within 60 (global counters on
  `profiles`), escalating foil soft-pity that resets on hit, per-slot hard
  pity caps (`player_pity` table), and dupe-protected slots that prefer
  cards below the collection cap.
- **Shards crafting** (4:1 craft:disenchant, doc §5): `craft_card` /
  `disenchant_card` RPCs, craft costs 40/100/400/800/1600/3200/6400
  (foil 2x); copies past the rarity copy cap + 1 auto-convert to shards on
  pack opening; deck-locked copies can't be disenchanted. Craft/melt UI in
  the Collection card inspector; shards balance in every meta header.
- **Rarity copy caps** (doc §3): 3 copies (Common–Rare), 2 (Super-Rare /
  Ultra-Rare), 1 (Full-Art/Mythic) — enforced in the deck builder client-side
  and in the `save_deck` RPC.
- **In-client odds disclosure**: every pack has a "VIEW PULL RATES & PITY"
  modal rendering exact per-slot percentages, foil chances and pity caps
  straight from `slot_config`; the Store header shows live personal pity
  status.

### Added (board UI, keyword explainers, sim study, smarter CPU)

- **Match board fills the screen**: larger board units (124px, uncropped 4:3
  art), bigger dice/log/leader panels, hand cards at md size, and the player
  row stretches so the hand sits at the bottom of the viewport.
- **Card art is never cropped**: the card face art window is a fixed 4:3
  frame with `object-contain` (letterboxed if off-ratio), matching the
  authored art.
- **Universal expanded view**: `CardInspectorModal` now renders a pure
  1.4x scale-up of the same lg card face (no re-typesetting), and GameV4's
  legacy raw inspect modal was replaced with it.
- **Clickable keyword explainers**: every keyword chip on every card face is
  a tap target opening a glossary popup (`src/meta/keywords.ts`,
  mirrored from HowToPlay).
- **Simulation study** (`docs/SIM_REPORT.md`, `scripts/card-coverage.ts`,
  `scripts/luck-analysis.ts`): all 193 cards verified functional (318/318
  mechanic checks, 0 broken); luck-vs-skill quantified — strong AI beats
  naive-legal 88/12 (skill-dominant), dice-total luck worth only ~±6pt, but
  the second player wins ~58% of mirrors (turn-order is the biggest balance
  lever); 6 new keyword proposals and 6 rule improvements included.
- **Smarter CPU** (`src/game/v3/ai.ts`): threshold-aware rerolling, full
  pair-search combat scoring with Ward/Bulwark/Frenzy/Toll math, Ward pokes,
  stops feeding Guard walls, Toll-aware lethal. Beats the previous AI 56.7%
  head-to-head.

### Added (universal card template, quicksell, foil glow, deck consumption)

- **New universal card template** (`src/components/CardFaceV4.tsx`): rarity-tinted
  header, a dice-medallion cost badge, and rounded pill-style rarity/keyword/combo
  chips, inspired by a dice-medallion card mockup. It's the single `CardFace`
  component already shared by every screen (match, Collection, Deck Builder,
  Store/pack opening) — restyling it in one place updates the whole app. Added a
  new shared `CardInspectorModal` for expanded/zoomed card viewing, reused by
  both the Collection (tap a card) and Deck Builder ("details").
- **Quicksell**: new `quicksell_cards` RPC + `card_sell_price(rarity)` DB
  function let players sell spare card copies for a fixed gold price by
  rarity — Common 10g, Uncommon 25g, Rare 60g, Super-Rare 150g, Ultra-Rare
  400g, Mythic 1000g. Foil copies always sell for **2.5x** that price. Cards
  currently committed to a deck can't be sold out from under it. Wired into
  the Collection screen's new card inspector.
- **Foil glow**: `CardFace` now has a built-in `foil` prop that renders a real
  shimmering sheen + pulsing glow ring (`.foil-shimmer` / `.foil-glow` in
  `src/index.css`), replacing the ad-hoc gradient overlay that used to be
  hand-rolled only inside the Store's pack-reveal modal. Every pack pull still
  rolls its existing per-pack `foil_chance` on every card slot (already
  applied universally, not just "chase" slots), so foils can drop for any
  card in any pack.
- **Deck card consumption**: new server-authoritative `save_deck` RPC checks
  that a card copy isn't already reserved by one of the player's *other*
  decks before letting it be added to this one (max 3 copies/deck, can't
  exceed total owned across all decks combined). Deleting a deck needs no
  special "unconsume" step — availability is always computed live from
  whichever decks still exist, so a deleted deck's cards are immediately free
  again. The Deck Builder UI mirrors this live so it never lets you overcommit
  in the first place.
- **Pack price rebalance**: gold-priced packs (excluding the free-onboarding
  Starter Pack) are priced roughly 10% higher to offset the new quicksell
  gold faucet — e.g. Standard Pack 200g → 225g, Standard Box 5,000g → 5,500g.
  Gem prices are unchanged.

### Changed (full old-game purge + universal card catalog)

- **The legacy resource game ("Shifting Multiverse") is fully deleted** —
  engine, CPU, keywords, deck builder, card instantiation and their scripts
  (`src/game/engine.ts`, `ai.ts`, `cards.ts`, `keywords.ts`,
  `deckbuilder.ts`, `scripts/simulate.ts`, `fuzz.ts`, `engine-tests.ts`) and
  the legacy card face (`src/components/CardView.tsx`). The v4.2
  dice-placement game (`src/game/v3/*`) is now the only game in the repo.
- **Universal card catalog**: `src/types.ts` and the Supabase
  `cards.template` JSON now carry only universal identity — id, name, type,
  rarity, set, art, flavor. All obsolete mechanical data (colored costs,
  elements, attack/health, legacy keywords, event effects, item attach
  bonuses) is wiped from both the bundled data and the backend; old rules
  sentences are scrubbed out of flavor text. Mechanics are assigned
  deterministically by `src/game/v3/cardpool.ts` (now hash-seeded instead of
  element-seeded, and rebuilt in place from the live catalog at startup).
- **New rarity ladder**: Common, Uncommon, Rare, Super-Rare, **Ultra-Rare**
  (replaces Legendary), Mythic — renamed across the client, the `cards` /
  pack-odds backend functions and all existing rows; the obsolete `Item`
  card type is folded into Charm in the backend as well.
- **Collection & Store rebuilt on the v4.2 card face** — cast-slot
  thresholds, ATK/HP, v4.2 keywords and rules text instead of costs/elements;
  pack reveals show real v4.2 cards; `claim_starter_pack` rebuilt without
  color identity (deterministic per-Leader 30-card starter).

### Added (custom deck building + bug sweep)

- **Deck Builder rewired onto the v4.2 pool** (`src/meta/DeckBuilderScreen.tsx`):
  30 cards, max 3 copies (was a stale legacy 2), no color-identity
  restriction (elements were removed from the game in v4.1), Leader picker
  and card pool now pull from `POOL_V4`/`POOL_LEADERS`, cost filter replaced
  with a Cast Slot filter (1–6 / Combo-gated / Free). Deck codes
  (`deckcode.ts`) generalized to work with either card pool. Added
  `src/meta/DeckBuilderScreen.test.ts` covering the new v4.2 validation rules.
- **Play screen** now lists the player's own saved, legal decks (via
  `deckDefFromCustom`) alongside the 12 prebuilt archetypes. The CPU now
  plays a freshly randomized deck every match (see below) rather than a
  prebuilt archetype, so both sides can field an unpredictable build.
- Extracted the card-face renderer into `src/components/CardFaceV4.tsx` so
  the match UI and the deck builder share one card presentation instead of
  drifting into two different "what does this card do" reads.

### Fixed (bug sweep: engine correctness + UI)

- **Echo/Twin recast state leak**: recasting a card via Echo (or completing
  it via Twin) reuses the same instance object, but it was never reset —
  permanent stat buffs, "has attacked," "ability used," and a pending Bind
  from the card's previous stint in play all silently carried over into its
  new life. `enterPlay` now gives every (re)entering Unit a clean state;
  Locations similarly lose an unearned Excavate discount on re-entry.
  Covered by a new regression test in `src/game/v3/engine.test.ts`.
- **`completeTwin` had no Placement Phase guard** — unlike every other
  die-placement action, it could be called during the Reroll window. Now
  consistently gated like `activateAbility`/`echoRecast`/`scrap`.
- **Unit `onCast` effects with an explicit target were silently ignored** —
  `castFromHand`'s `targetIid` parameter never reached `enterPlay`, so a
  caller-chosen target for a Unit's own on-enter effect was dropped in favor
  of auto-targeting. Not reachable by the current card pool (no Unit prints
  `onCast` yet) but a real API gap, now fixed.
- **Frontend: casting a card with a fixed enemy-Leader target (e.g. a
  Combo-gated burn Event) could win the game without showing the game-over
  screen** — `tryCast`'s direct-cast path never checked `g.winner` after
  resolving, unlike every other action handler. The UI would silently sit in
  Placement with the win already decided internally. Fixed, and verified live
  in a browser via Playwright.
- **Frontend: free Location casts were reachable during the Reroll window**
  (inconsistent with the CPU, which only ever casts them during Placement) —
  `castLocationFree` now shares the same Placement Phase gate as the other
  three die destinations, and the UI reflects it instead of silently no-op'ing.
- **Frontend: Echo's target-die check happened too late** — clicking ECHO
  with an insufficient die let the player pick a hand card to discard as
  fodder before being told the recast was illegal. Now checked up front.
- **The CPU never mulliganed its opening hand in the interactive frontend**,
  unlike every simulated playtest game (which uses the harness's
  `maybeMulligan` for both sides) — added `maybeMulliganPlayer` so the CPU
  opponent gets the same keep/mulligan judgment in real matches that all the
  balance data assumes it has.

### Added (Settings, Changelog & CPU/Deck-builder improvements)

- **Renamed the game to FryCards** across all user-facing screens, the
  README, the rulebook and page metadata.
- **Settings screen** with 7 selectable color themes, saved to
  `localStorage` (no backend) and applied instantly via CSS variables.
- **Changelog screen**, accessible from the main menu, rendering this file's
  history in-app.
- **CPU opponents now play a freshly randomized deck** every match (random
  Leader, random keyword/effect leanings, random combo family) instead of
  picking from the twelve fixed archetype decks.
- **Deck Builder**: added a "QUICKBUILD" button that auto-fills a legal
  30-card deck from your owned collection, and a live deck stats panel (cast
  slot curve, type breakdown, keyword density) shown while editing.
- **Pack opening** redesigned into a cinematic one-at-a-time spotlight
  reveal with rarity-based glow/particle flourishes, plus a pull summary
  screen, alongside the original grid/reveal-all flow for quick opens.
- **How to Play accuracy pass**: fixed two spots where the in-app rules text
  didn't match engine behavior — Rally's once-per-turn cap is shared across
  your whole board (not per Rally card), and Pitching an unplaced die does
  nothing if your Leader is already at full HP.

### Added (v4.2 frontend — the dice-placement game is now playable in the app)

- **New match UI** (`src/components/GameV4.tsx`): full interactive
  implementation of Rulebook v4.2 — five-dice tray with reroll selection,
  Snap-Charm window during the Reroll Phase, all four die destinations
  (hand Cast Slots with threshold/combo-gate legality hints, Ability Slots on
  Units/Leader/Location with Resolve/Excavate-adjusted thresholds, Twin
  staging + completion + abandon, Echo recasting from a discard drawer with
  fodder selection), free Location casts, Scrap rerolls, Ultimate(N) button,
  one-combo-gate-per-turn enforcement surfaced in the UI, targeted casting
  with highlight-and-click target picking, sequential combat with Guard-aware
  legal-target highlighting, Pitch shown on the End Turn button, mulligan
  overlay, card inspector, and a live log. CPU opponent plays through the
  same AI as the headless playtest harness.
- **Play screen** now offers the twelve v4.2 archetype decks (real card art
  via the remapped pool); the CPU picks a random different archetype. Match
  gold payouts still record through Supabase.
- **How to Play** rewritten as a condensed v4.2 rulebook (turn structure,
  casting, combat damage order, every keyword incl. the twelve new ones, and
  the measured combo-pattern hit rates).
- **Engine**: added `mulliganRedraw()` so the UI's mulligan goes through the
  engine like every other action.
- Removed the legacy resource-game match screen (`src/components/Board.tsx`
  and the old in-App modals); the meta screens (store, collection, deck
  builder, profile) are unchanged.
- Verified end-to-end in a real browser (Playwright + bundled Chromium):
  guest login → archetype select → mulligan → multiple full turns with casts,
  targeting and combat → game over screen, with zero console/page errors.

### Added (Rulebook v4.2 — combo-gate cap, Twin A/B/C test, 12 new keywords)

- **Rulebook v4.2** (`docs/RULEBOOK.md`): Combo-gated cards capped at **one
  cast per turn** (cast or Echo-recast), closing the general chaining failure
  mode; the specific Large-Straight face-burn Event retargeted off pure face
  damage and reduced in power; Bind's retaliation-stop clause (already shipped
  in engine, now correctly documented). Directed-reroll pattern hit rates
  measured directly (`scripts/pattern-hitrate.ts`) instead of guessed — the
  "straight needs a harder tier than matching" hypothesis did **not** hold up
  (Three of a Kind hits ~54% under directed reroll vs. Small Straight's ~33%;
  Full House ~18% vs. Large Straight's ~10%, the hardest pattern in its tier).
- **Twin A/B/C test** (errata B): ran the same deck roster three times, one
  Twin rule change per run — revert the one-die cap ('sameTurn') vs. keep the
  cap but add a passive while parked ('stagedPassive'). **stagedPassive won**
  and ships as the default (`TwinMode` is still an engine-level option for
  further isolated testing). Holding archetype constant across all three runs
  showed the original -22pt "completing a Twin" correlation was mostly a
  **deck-membership confound** (the two Twin-drafting archetypes have the two
  weakest Leaders in the pool) — the fix is a genuine but modest net positive,
  not a fix for what was actually a leader-power problem.
- **Echo win-delta broken out by rarity** of the card being recast: still
  mildly negative across all three tiers (low/mid/high), not concentrated in
  commons — so it reads as the die+card cost being uniformly a touch overpriced
  rather than an AI-misuse artifact, flagged for a future cost trim rather than
  a keyword rework this pass.
- **Twelve new v4.2 keywords**, deterministically assigned across the real
  193-card pool: **Resolve X** and **Ultimate(N)** (Leader — comeback +
  inevitability tools); **Bulwark X**, **Toll X**, **Avenge** (Unit — scaling
  defense answers, Ward→Bulwark→Frenzy damage-order specified); **Crescendo X**
  and **Aftershock** (Event — the preferred "big roll payoff" pattern going
  forward, and a delayed-effect hook resolving before Draw Phase); **Snap**
  (Charm — castable during Reroll Phase); **Tribute**, **Excavate X**,
  **Contested** (Location — Pitch synergy, ramp, and an arms-race passive).
- **Smarter CPU**: Snap-casting pass before the reroll window closes,
  Ultimate(N) usage once unlocked, ability-threshold checks now respect
  Resolve/Excavate reductions everywhere (including Rally's source-die check).
- Fixed a real bug caught by the harness: the pool generator could assign both
  Scrap and Snap to the same card, and Snap's "cast it during Reroll" pass ran
  first every time, silently eating the card's Scrap identity (`scraps: 0`
  in one run flagged it). Snap and Scrap are now mutually exclusive by
  construction.

### v4.2 playtest findings (~10,000 games)

- Combo-gate cap verified directly (unit-style engine test): a second
  qualifying Combo-gated cast in the same turn is now structurally impossible.
- Bulwark and Toll are both firing (76,922 / 24,278 damage prevented across
  the run) — neither mechanic is dead on arrival.
- `ultimateUsed` and `leaderAbility` show large negative win-correlations
  (-9 to -12pt) that read as a **base-rate confound, not a real effect**: both
  fire in the large majority of games simply because most games run long
  enough to reach their unlock turn, so the small "did-not" bucket is mostly
  games that ended unusually fast (i.e., a decisive early blowout) — not
  evidence that using the ability caused the loss.
- No invariant violations across the full run (card-count conservation, no
  dead units on board, hand cap, no negative damage).

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
