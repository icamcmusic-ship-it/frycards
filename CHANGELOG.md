# Changelog

Product-level changes to FryCards (formerly "Shifting Multiverse TCG").
Rules-specific changes are also tracked in the Change Log section of
`docs/RULEBOOK.md`. A condensed version of this history also powers the
in-app Changelog screen (`src/meta/ChangelogScreen.tsx`).

## Unreleased

### Fixed (full-stack audit)

- **Shop crash**: hardened every meta screen against missing/null backend
  data — the `total_cards.toLocaleString()` crash class (Social leaderboard,
  Store, Marketplace, Player Shops, Battle Pass, Achievements, Profile,
  Pack Opening, News Center) is guarded everywhere with sensible fallbacks.
- **Credits display unit**: credits are whole units server-side; the client
  was rendering them divided by 100 ("26.99" for a 2699-credit pack).
  Amounts now match server messages exactly.
- **Backend (Supabase) fixes** applied as migrations: multi-pack opens now
  report duplicate-conversion credits (`credits_gained` was summed from a
  removed `shards_gained` key); the pity Super-Rare slot honors the copy-cap
  auto-convert; signup role assignment (creator/25-founder) is serialized
  against races; trade acceptance locks both wallets so balances can't go
  negative; and client EXECUTE was revoked on internal SECURITY DEFINER
  helpers (`transfer_cards`, `grant_xp`, etc.) that any logged-in user could
  previously call directly.
- **Engine rulings & fixes**: cards can no longer be cast during Combat or
  in the dead window between turns; Bind's retaliation-stop window, Resolve
  vs Ultimate thresholds, and Bulwark-before-Frenzy retaliation order are
  now ruled, documented, and covered by 14 new regression tests (61 total).

### Changed (gameplay)

- **CPU personas**: the AI now rolls a per-game persona (aggro / tempo /
  balanced / control) that shapes cast priority, trade-vs-face decisions,
  and tie-breaking — games no longer play out identically. Lethal is always
  taken; free kills and big-threat answers are never skipped.
- **Leader rebalance** (11k-game simulations per round): Avatar of the
  Abyss toned down; Ethereal Sea Witch and Crimson Vector Commander brought
  up; Mer-King and Apex Nanite Shinobi trimmed. Leader win-rate spread
  flattened from 34–65% to 44–56%.

### Added (player shops)

- **Player Shops** (`PlayerShopsScreen`, unlocks at level 50): a one-time
  non-refundable setup fee opens a shop with a base slot allotment; extra
  slots are purchased and each acts as that slot's at-risk collateral, plus a
  small lazily-accrued per-slot daily maintenance fee (individual/bundle
  slots only — mystery packs are exempt).
  - **Individual & bundle listings**: fixed-price single cards or 2+ card
    bundles with full contents visible pre-purchase, priced against a
    blended-reference soft-cap band shown to the seller.
  - **Mystery packs**: Simple (overall rarity ratio) or Advanced (per-slot
    Exact / Minimum-guarantee / Open) templates. Pools are validated against
    the template with a pass/fail preview before submission (min 10 packs'
    worth or 30 cards, whichever is stricter, in an exact multiple of pack
    size) and rejected entirely on any shortfall. Draws are without
    replacement from the real submitted pool; the storefront shows live
    remaining-pack count and live remaining-pool EV separately from the
    price, which freezes at listing time. Sold-out mystery listings stay
    visible, grayed out, as sales/reputation history.
  - **Collateral**: a confirmed fraud strike forfeits that slot's collateral
    and burns the slot (must be re-bought). Closing a shop refunds half of
    remaining collateral and marks the shop dormant (not deleted) — slots and
    any remaining collateral stay in place, and reopening is free.
  - **Discovery & rating**: a marketplace hub (Featured / Trending / New /
    Top Rated, self-purchases never counted). Sellers earn a 5-star weighted
    composite rating — explicit buyer rating (35%, editable for 3 days post-
    purchase), value-vs-market (25%), repeat-buyer rate (20%), log-scaled
    sales volume (10%), with confirmed fraud applied as a multiplier — that
    persists to the account (not the shop) and unlocks publicly after 10
    unique buyers, recomputed every ~2 days.
  - **Moderation**: report/flag any listing. Since listings only ever escrow
    real, server-verified inventory, "contents don't match" reports
    auto-resolve with no human needed; subjective reports escalate to
    Creator review only once a report-count threshold is met.
  - Shop-to-shop sales are tax-exempt, fully liquid immediately (no
    relisting cooldown), and excluded from the blended quicksell/auction
    reference price shop listings are themselves priced against.
- **Card market value popup**: the expanded card viewer (Collection, Deck
  Builder — not shown during an actual match) now surfaces a card's
  blended player-market value once it has at least 5 completed marketplace
  sales.
- **Credits display**: dropped the "$" from every credits amount in the
  app — the credits coin glyph is now the only currency symbol used.

### Fixed (card rendering, pack opening, economy)

- **Foil animation glitches**: fixed three real bugs — the 3D card inspector
  was layering its own pointer-driven holographic sheen directly on top of
  the card's own animated CSS shimmer (two competing rainbow overlays on the
  same pixels); a Mythic foil card ran two different `box-shadow` pulse
  animations on the same element at once (they can't blend, only stutter
  between each other); and toggling "VIEW FOIL" hard-restarted the shimmer
  sweep from frame 0 instead of crossfading. All three are now single,
  non-conflicting, crossfading effects.
- **Hard 2.5:3.5 card ratio**: every card face is now a fixed-height
  rectangle at its exact printed aspect ratio — long name/flavor text still
  shrinks to fit first, but the card itself no longer grows taller to
  avoid clipping (any residual overflow now clips at the card edge instead
  of distorting the ratio).
- **Pack-opening summary snap**: the "BEST PULL" card's scale-up and its
  entrance animation were fighting over the same `transform` on one
  element — the entrance animation (no `forwards` fill) reverted to the
  static scale the instant it finished, producing a visible jump. Split
  across two nested elements so they compose instead of colliding.
- **Pack opening**: clicking a revealed card now advances to the next one
  (previously only the separate NEXT button did); added a "QUICKSELL
  COMMONS & UNCOMMONS" action right on the haul summary screen.
- **Quicksell**: added a "QUICKSELL ALL FOIL" bulk button to the Collection
  inspector (previously only normal copies had a bulk-sell option), plus a
  new "BULK QUICKSELL" toolbar on the Collection screen to clear out every
  spare Common/Uncommon in one click without opening each card.

### Changed (decks, pity, leaders, card catalog)

- **Removed prebuilt archetype decks**: the 12 fixed "PREBUILT ARCHETYPES"
  the Play screen offered are gone. Playing without a saved custom deck (or
  as a guest) now rolls a single fresh, legal, randomly-built deck instead —
  the same generator the CPU opponent has always used.
- **Pity reworked**: removed the escalating foil-streak pity and the
  separate Full-Art/Mythic 10/60-pack guarantees. The only pity left is one
  rule — a Super-Rare or better is guaranteed at least once every 10 packs,
  account-wide. The Store's drop-odds panel shows your current progress
  toward it.
- **Starter Box Leader choice capped at Rare**: four Leaders were rebalanced
  down to Rare (from Super-Rare/Ultra-Rare/Mythic) based on their current
  power — the two with no Ultimate at all, plus the two next-weakest — and
  the Starter Box Leader picker now only offers Rare-or-below Leaders,
  enforced server-side as well as in the picker UI.
- **Full-Art retired from the active card list** (for now): the 8 cards
  previously tagged Full-Art were reassigned to Mythic, Ultra-Rare or
  Super-Rare by power. Also fixed a bug where Full-Art cards were silently
  getting Common-tier stats/thresholds due to a gap in the rarity-to-power
  mapping — fixed for whenever Full-Art returns to the catalog.

### Added (progression, battle pass, marketplace, social)

- **Level system**: every match grants XP (+60 win / +25 loss). Levels follow a
  quadratic curve (`level_for_xp` in SQL, mirrored by `xpForLevel` in
  `src/meta/ui.tsx`); each level pays 100 gold and every 5th level 10 gems.
  Level + XP bar shown on the main menu and Profile.
- **Battle Pass — Season 1 “Blue Coral”** (`BattlePassScreen`): a free 25-tier
  pass. Match play (+50 win / +20 loss) and mission rewards grant season XP;
  100 XP per tier. Rewards include gold, gems, shards and free packs, with the
  **The Voyager** card back at tier 20 and the **Nebula Soul** banner at
  tier 25 — both removed from the shop and made pass exclusives.
- **Missions & Achievements** (`AchievementsScreen`): daily/weekly missions
  (auto-resetting, with gold/gem/pass-XP rewards) and 22 permanent achievements
  across battle, collection, progression, social and market categories, some
  paying out free packs. Progress is tracked server-side by a generic
  `track_stat` hook wired into match results, pack openings, purchases,
  quicksells, friendships, trades and market sales — with a one-time backfill
  for existing accounts.
- **Pack inventory** (Store ▸ MY PACKS): packs can now be bought *without*
  opening (“BUY & SAVE FOR LATER”) and stored; battle pass and achievement
  reward packs land here too. Open them any time with the usual reveal.
- **Card marketplace & auctions** (`MarketplaceScreen`): player-to-player
  fixed-price listings and timed auctions (with optional buyout, 5% minimum
  bid raises, anti-snipe end-time extension, and gold escrow for bids).
  Listed cards are escrowed out of the collection; sellers pay a 5% fee.
  Expired listings settle lazily whenever anyone opens the marketplace.
- **Friends & trading** (`SocialScreen`): username search, friend requests
  (auto-accept when both sides ask), and friend-to-friend trades of cards
  and/or gold with server-side revalidation of both sides at accept time.
- **Transparent pack odds**: every pack in the store has a “VIEW DROP ODDS”
  breakdown showing the exact per-slot rarity weights, foil chances, dupe
  protection, pity rules and expected cards per rarity, mirrored from the
  server's roll tables (`src/meta/packodds.ts`).
- **Collection progress**: the Collection screen now shows overall and
  per-rarity completion bars.

### Fixed

- **Some packs couldn't be bought**: the store rendered every `pack_types`
  row — including inactive and reward-only packs — so their buy buttons always
  failed with "This pack is no longer available". The store now only shelves
  active, purchasable packs; the duplicate legacy “Collector Booster Box” row
  was deleted and Starter Pack, Premium Elite Box and Ultra Pack were
  re-activated.
- **Daily Free Pack was unclaimable**: the `claim_daily_pack` RPC existed but
  had no UI. The store now shows a claim card with its 20-hour cooldown.
- **Battle-pass-exclusive cosmetics with a 0-gem price** (e.g. “Into the
  Pines”) were equippable by everyone from the Profile screen without being
  owned, and `buy_shop_item` would sell pass exclusives that had leftover
  prices. Both paths now respect `is_season_pass_exclusive`.

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
