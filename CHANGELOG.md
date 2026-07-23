# Changelog

Product-level changes to FryCards (formerly "Shifting Multiverse TCG").
Rules-specific changes are also tracked in the Change Log section of
`docs/RULEBOOK.md`. A condensed version of this history also powers the
in-app Changelog screen (`src/meta/ChangelogScreen.tsx`).

## Unreleased

### v5.0 RIFTBOUND — full game conversion

The entire game moved from the v4.x dice-placement rules to the **Riftbound**
rulebook: an essence-based TCG. See `docs/RULEBOOK.md` (v5.0) and
`docs/RIFTBOUND_SPEC.md`.

- **Seven new colors (Essence Types)**: Ember, Tide, Root, Gale, Light,
  Shadow, Void — printed on cards as colored cost pips (color identity is no
  longer derived from keywords). Leaders keep two-color identities.
- **New core loop**: Locations exhaust for Essence; spells are Invoked by
  paying Essence Costs (colored pips + generic). Turn = Dawn → Main I →
  Clash → Main II → Dusk. Vitality starts at 20.
- **Combat**: attacker/guard clash system with the rulebook keyword set —
  Aerial, Overrun, Quickstrike, Doublestrike, Venomous, Siphon, Alert,
  Reckless, Swarmproof, Skywatch, Warded, Unbreakable, Ambush, Immobile.
  Keyword tiers (I–V) are retired.
- **Card types reworked**: Units have Might/Grit; Locations split into
  Wellsprings (basic, auto-supplied — no deck slots) and Sanctums; Charms
  split into Bound/Worn (re-bond); Events split into Quick/Slow; Leaders
  start in the Leader zone with Resolve-costed abilities.
- **Card pool** regenerated: every catalog card deterministically assigned
  Riftbound mechanics (essence cost, colors, stats, keywords, effects).
- **Card templates** redesigned for essence costs, Might/Grit gems, subtype
  lines, and Resolve — same card dimensions, same regular-art and Full-Art
  image treatments.
- **Database**: `cards` table gained `essence_cost`, `essence_types`,
  `might`, `grit`, `card_subtype`, `resolve`, `rules_text`, backfilled from
  the pool.
- **Removed**: all dice mechanics (rolls, Cast Slots, combos, patterns,
  pitch/staging) and the dice-era sim scripts/docs.

### v4.27 harness upgrades (clock-speed + polarized matchups), dead-code value-buff fix, balance pass, Echo/Bind UI fixes, bug hunt

- **Sim harness — two new capture dimensions** (`scripts/simulate-v4.ts`):
  - **Clock speed**: per-archetype average closing round conditioned on
    *winning* (`archWinRoundsSum`, `clockSpeed` in the JSON dump). The
    existing `archTotalRounds` averages over wins *and* losses, so an aggro
    deck that closes fast and a control deck that grinds could read the same
    number; conditioning on the win exposes the aggro↔control speed axis
    directly (this pass: 7.0 rounds for Diver Straight-Combo up to 16.9 for
    Sea Witch Bind-Straight Combo).
  - **Polarized matchups**: auto-flags any head-to-head cell where one side
    wins ≥68% (min n=12), deduped per unordered pair and ranked — a
    hard-counter/RPS problem now surfaces as a finding instead of something a
    human has to eyeball out of a 20×20 grid.
- **Dead-code find + fix (`cardpool.ts` `MANUAL_VALUE_BUFF`)**: the value
  buff was only applied at the very end of `mapSpell`, but three Event
  branches (`tier===3` board wipe, `tier>=4` bombs, `tier>=2` combo-gated)
  all `return base` early — so a value buff on any of those Events was
  silently a no-op. `the_abyssal_gate`'s +2 (v4.12) had been dead since the
  day it was written, explaining five passes of "buff it more" that never
  moved its residual. Extracted `applyManualValueBuff()` and call it at every
  `mapSpell` exit. Same class as v4.26's "Bind X" and v4.25's gate-cost
  no-ops. `the_abyssal_gate` reset to a fresh +1 (per the v4.26 precedent for
  freshly-un-deadened buffs — don't carry the stale accumulated size).
- **Balance pass** (archetype-normalized residual lens; full 26,448-game run,
  zero invariant violations, 107/107 vitest green):
  - Nerfs: `cervine_channeler` -2→-3 (+23.0pt normalized, spread 4),
    `worm_brain_host` -2→-3, `nanite_division_marshal` -1→-2 (also the
    per-carrier lever for Steel, this pass's #1 keyword-nerf read),
    `dr_aries_chief_biogeneticist` -3→-4 (ceiling). First-pass trims:
    `familiar_in_the_dark` -1 (+18.8pt, spread 4), `magma_phase_infiltrator`
    -1 (+12.6pt, spread 7), `hollow_suit` -1 (+12.0pt, spread 5),
    `void_mother` -1 (+11.6pt, spread 5).
  - Reverts of overshot buffs: `the_wolf_of_wall_street` +2→+1 (now +15.7pt
    normalized — fifth swing in its documented history, stepped back one),
    `shattered_horizon_protagonist` +1→0 and `skyborne_skeleton_dragon` +1→0
    (the v4.26 carried-forward watch item — the FullHouse→TwoPair gate ease
    was the real fix; the stat buffs stacked on top are now surplus, SHP at
    +14.7pt).
  - Buffs: `the_abyssal_gate` fresh +1 (see dead-code fix; -4.9pt, spread
    10), `ruthless_succession` +1 (-5.9pt normalized, spread 12 — the single
    widest-spread underperformer in the pool).
  - Deliberately NOT re-nerfed: Blue-Ringed Octopus / Porcelain Lobster /
    Wasteland Aberration remain top of the raw cost-band table but do not
    appear on the archetype-normalized table (their high residual is deck
    quality, not card power — the recurring "artifact, not outlier" caution).
- **CPU reasoning**: every genuine-mistake lapse detector reads exactly zero
  again (`lapseMissedLethal`, `lapseWastedCastableDie`,
  `lapseIdleLeaderAbility_genuine`, `lapseUnitAbilityOrderFixed`,
  `lapseMulliganKeptMarginal`, `lapseEchoOverAbilitySequencing`) — 18th
  consecutive pass. No new CPU-reasoning bug.
- **Card pool**: re-verified in field-for-field sync with live Supabase
  (292/292, md5 identical) before the pass.

#### Bug hunt & QoL (this pass)

- **Echo high-rarity recast desync** (`GameV4.tsx`): the engine waives Echo's
  extra-discard "fodder" cost for both mid- AND high-rarity cards
  (`keywordTier(def,'Echo') >= 2`), but the UI only free-resolved the mid
  case. A high-rarity Echo recast was routed through the fodder-pick step the
  engine then ignored (a phantom discard), or blocked outright with "your
  hand is empty" on a play the engine would have recast for free. The UI now
  mirrors the engine's exact waiver condition.
- **Bind X rules text** (`CardFaceV4.tsx` `describeEffect`): a bind carrying a
  value also saps the bound Unit (since v4.26), but the card text showed only
  "Bind {target}" and hid the damage — a Bind 2 read identically to a
  value-less bind. Now renders "Bind + Sap X" on card faces, ability pills,
  and CPU narration.
- **Trade builder over-offer** (`SocialScreen.tsx`): deck-locked copies were
  capped against the *combined* spare total for each variant independently,
  so a card with locked copies could offer more normal AND foil than existed
  (a trade `createTrade` then rejected server-side). Now uses the shared
  `spareSplit()` (normal-first, foil-spillover), same as Collection/Market.
- **Auction bid-against-yourself** (`MarketplaceScreen.tsx`): the BID button
  stayed active while you were already the top bidder (re-holding a larger
  amount of your own credits for no gain). Disabled and relabelled "TOP
  BID ✓" when `highBidder`.
- **Pack bulk-open** (`PackOpening.tsx`): the best pull was rendered twice in
  a >12-card haul summary (spotlight + compact grid). Its group is now
  excluded from the grid. Also (`StoreScreen.tsx`) the ×5 and ×10 open
  buttons shared one busy key, so both showed "OPENING…" at once — the count
  is now part of the key.
- **First-match tutorial** (`CoachOverlay.tsx`): the combat step told brand-
  new players (on turn 1, when attacks are illegal) to attack. Reworded with
  the first-turn exception.
- **Accessibility**: `PopButton` gained an `ariaLabel` prop; the icon-only
  deck-delete button, the opponent's read-only Leader ability pills (no
  longer announced as disabled buttons), and leftover combat dice (no longer
  claiming to be selectable) all got correct labels.

### v4.26 Volume #1 consolidation, shop rework, CPU turn replay, "Bind X", balance pass, full-app bug hunt

- **Volume #1**: all 292 live cards consolidated into a single set,
  "Volume #1" (Supabase `cards.set_name` + `template.set`; the old Blue
  Coral / Crimson Circuit / Dragonbone Wastes / Full Arts Collection 1
  split is gone). Set names never feed the deterministic mechanic hash, so
  zero card mechanics changed — confirmed by a byte-identical sim baseline.
  Client mirrors updated (`generated-cards.ts`, `ALL_SET_NAMES`, card-face
  set styling, store copy).
- **Store rework**: the shelf now carries exactly one **Volume #1 Booster
  Pack**, one **Volume #1 Booster Box**, plus the Daily Free Pack. The
  three per-set packs/boxes and the Standard Box were deleted; the Starter
  Pack was retired from sale (still openable from MY PACKS). **Full-Art
  pull odds cut 25%** in every slot that can roll them (booster chase, box
  chase + topper, Season Pass pack), with the removed probability folded
  into Rare — backed by the new rarity power curve table, which measured
  Full-Art as the most systematically overperforming rarity band
  (+5.2-5.6pt normalized residual, n≈46k).
- **Pack opening**: boxes/bulk opens no longer auto-skip to the summary
  (was a `pulls.length > 12` shortcut) — every opening now goes through
  the click-through card-by-card reveal, ending on the box topper; REVEAL
  ALL remains the deliberate skip.
- **Card readability overhaul** (`CardFaceV4`): measurement-driven layout
  so text can never overflow the frame — keyword chips shed into a "+N"
  overflow chip, flavor text is explicitly lowest-priority and steps aside
  line-by-line, names hard-clamp; full-art cards gained a frosted
  scrim/blur panel behind text regions plus solid-backed stat chips; board
  minis rebuilt as art-forward tokens (full-bleed art, name/cost strip,
  compact keyword chips + live stat chips) instead of shrunken full cards.
- **CPU turn replay** (`GameV4` + an observational hook in `ai.ts`): the
  CPU now plays at a watchable pace (~0.85-1.6s per action, constants in
  one `CPU_PACE` block) and every action — roll, reroll, Snap, Scrap,
  Location, cast, Echo, Ability, Ultimate, Rally, each attack, end turn —
  replays step by step with a narrated banner, pulsing actor/target
  rings, the opponent's own dice tray, floating damage numbers, and new
  green heal floats (humans get the same damage/heal float grammar).
  NEXT ▸ advances a beat; SKIP ▸▸ fast-forwards the turn. AI decisions
  are byte-identical (observer fires post-action; the sim harness never
  passes one).
- **Sim harness**: two new capture types — a per-card
  **dead-in-hand-at-game-end** table (third leg of the hand-clog triptych;
  immediately redirected two planned stat buffs into a castability fix)
  and a **rarity power curve** (avg archetype-normalized residual by
  printed rarity; the data behind the Full-Art odds cut).
- **New mechanic — "Bind X"** (engine): a bind Effect carrying a numeric
  value now also saps the bound Unit by that value ("Bind + Sap X" on the
  card face). Root cause: the engine ignored `value` on bind entirely, so
  every value buff ever applied to a bind-effect Charm (up to +4 across
  four passes of escalations) was dead code — the same dead-code class as
  v4.25's gate-cost threshold no-ops. Value-less binds (Leader kits etc.)
  are unchanged; the four flagged bind Charms got fresh deliberate Bind 2
  values and the stale dead entries elsewhere were removed.
- **Balance** (full-scale runs, 26,448 games each, zero invariant
  violations; full writeup `docs/BALANCE_SIM_FINDINGS_v4.26.md`):
  CPU-lapse detector floor holds for a 17th straight pass. **Avenge
  resolved via the per-card look v4.25 asked for** — its stable +5.6pt
  delta was almost entirely Faye's True Face (trimmed -3; keyword now
  +4.6pt). **Pierce actioned via per-card outlier trims** (Void Mother's
  stale v4.12 buff reverted; Dr. Aries, Worm Brain Host, Nanite Division
  Marshal trimmed). **Steel moved for the first time in 17 holds**
  (activation 0.28 → 0.61, delta +21.4 → +14.8pt) as a side effect of
  fixing its only drafted carriers' castability: Shattered Horizon
  Protagonist / Skyborne Skeleton Dragon eased FullHouse → TwoPair after
  the new dead-in-hand table showed they were stranded, not weak (a first
  attempt at SmallStraight ejected both from every deck via the
  combo-family drafting rule — caught by verification, root-caused, and
  documented). Cavernous Watcher finally closed via a cost lever (sum
  12 → 14, off the nerf list) after its stat trim hit the -4 ceiling.
  Repeat-offender escalations: Wasteland Aberration -4, Blue-Ringed
  Octopus / Porcelain Lobster -2, Butterflyfish School -2, Obsidian Bore
  Site -2; Isle of the Ancients first-pass -1; buffs: Chalice of
  Quicksilver +2, Perpetual Dynamo +2, Coral Collapse +5, Wolf of Wall
  Street +2. Two new deck-presence nerf entries (Mer-Warrior, Stormcaller
  Adept) deliberately NOT actioned — their archetype-normalized deltas
  are ≈0, an archetype artifact, not a card problem.
- **Bug hunt** (two independent sweeps across every screen plus
  `src/lib/supabase.ts`): Player Shops' bundle/mystery builder no longer
  deselects your card when you search mid-setup; individual listings, own
  listings and purchase history now show foil status and copy counts;
  mystery-pack buys list the exact cards pulled; an ended-but-unsettled
  Marketplace auction no longer shows the seller a CANCEL button that
  could only fail; the Store's daily-pack countdown says "READY TOMORROW"
  when the time is next-day; the News Center's LATEST UPDATE banner
  points at the actual newest entry; player-profile dialogs are announced
  to screen readers. Second sweep: **Quick Match restored** — guests and
  deckless accounts had no way to start a match at all (the documented
  random-deck path had regressed out of `MatchSetup`; restored with a
  memoized roll so game-end re-renders can't re-roll the deck mid-match);
  the daily-login panel no longer advertises rewards in the retired Shards
  currency (days 3/6 corrected to their real credit prizes, verified
  against the live `claim_daily_login` SQL) and no longer highlights the
  wrong day after a lapsed streak (the projection now mirrors the server's
  yesterday-UTC rule); a failed Discord sign-in could lock the whole auth
  form forever (only auth call with no try/catch); backing out of a
  just-imported deck code silently discarded it (id-less drafts now always
  count as dirty); How To Play rewritten for the live product lineup (the
  retired Standard Box / Leader Pack sections replaced with Volume #1
  Booster Box and Starter Box, a phantom Collection "set" filter corrected
  to "color"); mission reset times stated honestly as UTC; stale "BLUE
  CORAL SET" banners on menu/auth now read VOLUME #1; hardcoded "Season 1"
  Battle Pass tile copy future-proofed; `aria-label`s added to Collection/
  Deck Builder search, filter and name inputs.
- **Docs**: retired the per-pass `BALANCE_SIM_FINDINGS_v4.5-v4.25` series
  (the new v4.26 file is the sole survivor and says so); dangling
  references in `RULEBOOK.md` / `COLOR_IDENTITY.md` rewritten; `ROADMAP.md`
  updated for the Volume #1 consolidation (next drop is "Volume #2").

Full writeup: `docs/BALANCE_SIM_FINDINGS_v4.26.md`.

### v4.25 sim-harness upgrade, balance pass (dead-code fix + lever revert), full-app bug hunt

- **Sim harness**: added per-card attribution for the `lapseWastedCastableDie`
  CPU-lapse counter (a legally-payable die going unplaced while a castable
  card sits in hand) — same `<prefix>:<cardId>` convention v4.24 used for
  hand-limit discards, plus a new report table. The table is empty this
  pass: the underlying detector still reads 0/26,448 games, consistent with
  the 16-pass CPU-lapse floor (see below) — the instrumentation is correct
  and ready for whenever that floor breaks.
- **Balance** (full-scale runs, 26,448 games each, zero invariant
  violations across all three runs this pass — see
  `docs/BALANCE_SIM_FINDINGS_v4.25.md`): CPU-lapse detector floor holds for
  a 16th straight pass. Confirmed Avenge's post-v4.24 delta (+5.6pt) is
  real and stable across a genuinely independent baseline, but both its
  levers are already at their established ceiling — carried forward as a
  design-tension case. **Found and fixed a real dead-code bug**: Abyssal
  Dragonfish and Ember Whisperer's v4.21 cost-threshold nudges had silently
  no-op'd since the day they were written (both cards resolve to a gate
  cost, not the numeric one the fix assumed) — explains why Abyssal
  Dragonfish sat at the pool's single highest cost-vs-ability z-score for
  five straight passes with an apparent "fix" already applied. Replaced
  with a real `MANUAL_GATE_OVERRIDE` step. **Tried and reverted a keyword
  lever**: raised Pierce's cost weight to mirror the v4.19.1 fix that
  worked for Avenge; a full verification run showed zero measurable effect,
  traced to Pierce's pool being pinned at the cost-tier ceiling already —
  reverted rather than ship a no-op, with a documentation note so a future
  pass doesn't repeat the attempt. Actioned v4.24's carried-forward
  hand-limit-discard watch item via a per-card fix (eased Silver Chimera's
  combo gate, cutting its forced-discard rate from the pool's worst-ever
  0.490 to 0.258) rather than touching the global hand-limit constant.
  Escalated 2 repeat-offender nerfs (Cavernous Watcher, and Wasteland
  Aberration — flat since v4.17, 8 passes never revisited), gave Kinetix
  Enforcer a new cost-based lever after its stat-trim ceiling stopped
  working (closed +33.1pt → +26.0pt, the pass's biggest single-card move),
  added first-pass nerfs (Blue-Ringed Octopus, Porcelain Lobster,
  Butterflyfish School, Levitating Coven, Obsidian Bore Site) and reverted
  Isle of the Ancients' stale buff that had flipped into nerf territory;
  escalated 5 repeat-offender buffs (Pulsing Heartstone, Amber Sphere,
  Resonant Shuriken, Coral Collapse, Kinetic Siphon Swarm, Phantom
  Squadron) and added first-pass buffs (Chalice of Quicksilver, Perpetual
  Dynamo, Shattered Horizon Protagonist, Skyborne Skeleton Dragon).
  Documented Submerged Starfall (the pool's Mythic Yahtzee trophy) as a
  deliberate design exception rather than a nerf candidate. Card pool
  re-verified in sync with Supabase (292/292, hashed field-for-field).
- **Bug hunt** (4 independent sweeps across every screen in
  `src/components/` and `src/meta/`, plus `src/lib/supabase.ts`): a
  deck-code import validator that permanently checked against the
  pre-boot placeholder card catalog instead of the live one (a
  module-level `Map` snapshotted before the async catalog fetch resolved);
  a `Set`-based Leader-lock check in Collection that silently dropped a
  second saved deck's reservation when a player owned 2+ copies of the
  same Leader; ended Marketplace auctions/listings still showing live,
  clickable BID/BUY buttons between refetches; four fire-and-forget
  post-action reloads across Achievements/Store/Marketplace that opened a
  double-claim/double-buy race window; ten more `supabase.ts` read
  functions that silently swallowed fetch errors with no logging at all
  (Missions, Player Profile Card, Player Search, Friend Collection, Card
  Market Value/Blended Reference, Shop Public/Browse, Mystery Live Stats,
  Serialized Feed) — continuing the ~15-function fix from a prior pass.
  QoL/accessibility: focus management and Escape-to-close on the Card
  Inspector, Leader Picker, and Pack Opening modals; outside-click/Escape
  dismissal on in-game status-badge popovers that could otherwise linger
  indefinitely on a touch device; missing `aria-label`s on the Player
  Shops report form; post-action success toasts on three Social actions
  (remove friend, cancel friend request, cancel trade offer) that
  previously gave no feedback at all.
- **Docs**: reviewed the full `docs/` tree — nothing stale enough to
  remove or update (the Pierce weight change was reverted mid-pass, so no
  net doc edit was needed there either); `docs/sim-runs/` raw JSON is
  gitignored and was never tracked, so there was nothing to prune.

Full writeup: `docs/BALANCE_SIM_FINDINGS_v4.25.md`.

### v4.24 sim-harness upgrade, balance pass (incl. keyword removals), full-app bug hunt

- **Sim harness**: added End Phase hand-limit (`HAND_LIMIT`=8) forced-discard
  tracking — a mechanic that had zero instrumentation of any kind since it
  shipped in v4.3. New win-correlation decision key
  (`handLimitDiscardOccurred`, -9.2 to -9.6pt delta both runs) and a
  per-card table of which specific cards get forced out of hand unplayed
  most often (Violet Haze Kunoichi, Void Mother, Familiar in the Dark, The
  Abyssal Gate topped it). Surfaced too late in the pass to size a fix
  against; carried forward as a concrete "game mechanics" watch item.
- **Balance** (full-scale run, 26,448 games, zero invariant violations —
  see `docs/BALANCE_SIM_FINDINGS_v4.24.md`): CPU-lapse detector floor holds
  for a 15th straight pass; Steel/Swift keyword rulings held again.
  **New this pass — keyword ability removals**: two repeat-offender trophy
  Units (Astral Shoal, Where the Deep Meets the Sky) had already hit the
  established -4 stat-trim ceiling while still topping `cardsToNerf` a full
  pass later; stripped one stacked keyword from each instead of a 5th blind
  stat cut (Astral Shoal loses Echo, Where the Deep Meets the Sky loses
  Avenge — cost left unchanged, so "pay the old price, get less" is the
  nerf). Both dropped completely off the top-10 `cardsToNerf` list in the
  post-patch verification run. Also escalated 5 repeat-offender nerfs
  (Kinetix Enforcer, Cavernous Watcher, Clockwork Nautilus, Gulper Eel,
  Playful Otters) and 7 repeat-offender buffs (Pulsing Heartstone, Locust
  Veil, Thornfang Vine, Amber Sphere, Resonant Shuriken, Coral Collapse,
  Kinetic Siphon Swarm) whose prior patch held flat; added first-pass
  nerfs (Ember Whisperer, Jawbone Span) and first-pass buffs (The Wolf of
  Wall Street) for cards that were flagged but never actioned; finally
  actioned Aftershock's long-carried-forward "cards are weak, not the
  keyword" finding with first-pass buffs to its two untouched cards
  (Bioluminescent Tide, Flash Freeze). A Petrified Ribs Citadel escalation
  attempt surfaced a real bug — the value lever was already at its floor,
  so a further cut would have silently no-op'd (or, worse, printed an
  illegal sub-1 value, caught by `catalog.test.ts`); reverted and added a
  floor clamp to the underlying mechanism so this can't happen for any
  card. Card pool re-verified in sync with Supabase (292/292, hashed
  field-for-field).
- **Bug hunt** (a systematic sweep across every screen in `src/components/`
  and `src/meta/`, 7 independent passes): a per-user data bootstrap with no
  error handling that could leave the entire app stuck on a loading screen
  forever after a network hiccup right after sign-in, with no retry; a Deck
  Builder leader-lock check that only ever scanned `card_ids` (Leaders
  never appear there) so it could never actually catch a single-copy
  Leader claimed by two decks at once; a first-match tutorial that only
  marked itself complete from its own final button, but the CPU-turn stage
  advances on its own timers with no player input required, so missing
  that one click made the whole 5-step tutorial silently replay from step
  1 on every future match; every keyword/cost-info popover in the game
  dismissing itself via a full-viewport invisible backdrop that ate the
  *next* click too, so tapping a different keyword chip while one popover
  was open just closed it instead of opening the one you meant to; a
  bounty card's SELL button staying clickable after you'd bought it back
  (the "OWNED — CAN'T SELL BACK" text right next to it was correct, the
  button wasn't); ended marketplace auctions you'd bid on still showing
  live, clickable BID/BUY buttons; a stale-response race in Player Shops'
  pool preview that could let a seller submit a pool that was never
  actually validated; ~15 `supabase.ts` read functions that silently
  swallowed fetch errors, making a real failure indistinguishable from
  "genuinely empty" (Collection, Inventory, My Shop, Leaderboard, and
  more); a shared error-message helper whose regex could eat legitimate
  text out of any server error that happened to contain its own colon;
  several missing confirm dialogs (decline friend request) and `role=
  "dialog"` labels (Trade Composer, four in-game overlays); a card-art
  broken-image state that could latch permanently onto the wrong card in
  a reused component slot; and 15+ more (full list in the codebase — see
  the individual file diffs). Accessibility: focus-on-open/restore-on-close
  for the card inspector and profile modal, Escape-to-close on keyword
  popovers, a touch-drag gesture on the card inspector that no longer
  fights the dialog's native scroll, and a default empty `alt` instead of
  a missing one on every image using the shared `SafeImage` component.
- **Docs**: reviewed the full `docs/` tree — nothing stale enough to
  remove; the durable balance-findings history and design docs are all
  current and self-documenting about their own supersession where
  relevant.

Full writeup: `docs/BALANCE_SIM_FINDINGS_v4.24.md`.

### v4.23 sim-harness upgrade, balance pass, bounty/full-art fixes, bug hunt

- **Sim harness**: added per-archetype first-player win-rate tracking
  (`archFirstN`/`archFirstW` in `simulate-v4.ts`) — no archetype shows
  unusual play/draw sensitivity this pass (all within ~4pt of their own
  baseline win rate).
- **Balance** (full-scale run, 26,448 games, zero invariant violations —
  see `docs/BALANCE_SIM_FINDINGS_v4.23.md`): CPU-lapse detector floor holds
  for a 14th straight pass (every genuine-mistake detector still reads
  zero); no keyword or mechanic changes warranted this pass (Steel, Swift,
  Avenge, and Aftershock rulings from prior passes all held). Escalated 7
  repeat-offender nerfs (Astral Shoal, Kinetix Enforcer, Swaying Garden,
  Clockwork Nautilus, Gulper Eel, Playful Otters, Cavernous Watcher,
  Petrified Ribs Citadel) and 6 repeat-offender buffs (Pulsing Heartstone,
  Locust Veil, Thornfang Vine, Amber Sphere, Resonant Shuriken, Coral
  Collapse) whose prior patch held flat across another pass; reverted 2
  patches that overshot into the opposite outlier bucket (The Wolf of Wall
  Street, Jawbone Span); added first-pass buffs for 3 new outliers (Nebula
  Snail, Blackspire Obelisk, Ossuary Vault). Card pool re-verified in sync
  with Supabase (292/292, byte-for-byte).
- **Bounty Shop card display**: now renders cards with the real shared
  `CardFace` template (matching Collection/Marketplace/Deck Builder/Pack
  Opening) instead of a bespoke image-plus-chip mockup that was missing
  the actual per-rarity card frame.
- **Full-Art pack odds**: Full-Art was landing at roughly 1/6th of
  Super-Rare's chance in every slot that carries it; rebalanced so
  Full-Art is now only ~15% rarer than Super-Rare everywhere (Blue
  Coral/Crimson Circuit/Dragonbone Wastes Booster Packs & Boxes, Standard
  Box, Season Pass Reward Pack), with the odds shift taken from/returned
  to that slot's Rare weight.
- **Bug hunt**: a player-profile modal that could get stuck on "Loading
  profile…" forever on a network error, with no retry; a missing
  broken-image fallback on profile avatars; a leaked `setTimeout` in the
  Discord sign-in fallback; the News Center's post-toggle button staying
  clickable mid-publish (silently discarding the form); keyword/cost-info
  popovers that could open partly off-screen at the bottom of the
  viewport, and one that didn't dismiss on touch-scroll; a silent no-op
  when Scrap failed (every sibling action shows an "Illegal ..." banner
  except this one); bulk quicksell paths in Collection that didn't
  exclude serialized-reserved copies the way the per-card sell flow
  already did; the deck builder's Leader-ownership check never accounting
  for a Leader already locked into another deck, so a Leader in use
  elsewhere could show as fully legal to reuse; nine Store screen handlers
  (pack open/buy/claim, bounty sell/buy) that had `try/finally` but no
  `catch`, so a thrown network error left no error message on screen;
  a missing `.catch` on the Player Shops listing-price lookup; a
  disabled-state gap on Player Shops' card-quantity stepper; the in-app
  How To Play rulebook still describing the "Pity" mechanic v4.22 removed
  entirely, plus a stale version footer.
- **QOL**: creating a Mystery Pack template in Player Shops no longer
  collapses the panel immediately, hiding the "submit a pool" step that
  only becomes available afterward.
- **Docs**: `docs/ROADMAP.md` had three items that already shipped (the
  guided first-match coach, confirm dialogs on destructive actions, daily
  quests/login rewards) — removed rather than left stale.

Full writeup: `docs/BALANCE_SIM_FINDINGS_v4.23.md`.

### v4.22 sim-harness upgrade, balance pass, shop overhaul, card-face fixes

- **Sim harness**: added set-level win-rate tracking (deck contains a card
  from a given set → win%) and a static keyword-count-per-card distribution
  report (sizes the card-face overflow fix below against real numbers — only
  12/292 cards carry 3+ simultaneous keywords).
- **Balance** (full-scale run, 26,448 games, zero invariant violations — see
  `docs/BALANCE_SIM_FINDINGS_v4.22.md`): Steel held at its current print rate
  rather than cut a 4th time (activation is now the pool's lowest at 0.27
  with the single biggest per-fire win swing, +22.6pt — reads as a thin,
  noisy cohort rather than an OP keyword); Avenge's v4.21 cap cut confirmed
  stable; escalated six repeat-offender cards whose existing manual
  stat/value trim held flat across 2+ more passes (Astral Shoal, Kinetix
  Enforcer, Boneplate Sentinel, Swaying Garden, Mist Ghost Ship, Ribvault
  Cathedral); first-pass nerfs for Clockwork Nautilus, Gulper Eel, Playful
  Otters, Cavernous Watcher, Petrified Ribs Citadel, Heart of the Thermal
  Grid; first-pass buffs for Phantom Squadron, Glowing Manta, Pulsing
  Heartstone, Thornfang Vine, Locust Veil, Amber Sphere, Resonant Shuriken,
  Coral Collapse, Kinetic Siphon Swarm, Diver's Lantern. CPU-lapse detector
  floor confirmed again (every "genuine mistake" detector at 0/26,448 games).
  Card pool re-verified byte-for-byte in sync with Supabase.
- **Shop overhaul**: pity removed entirely (`profiles.packs_since_super_rare`
  dropped, `grant_pack_contents`'s pity slot deleted, UI banner removed —
  no pity system remains anywhere); the pack shelf pruned to exactly Daily
  Free Pack / Starter Pack / Standard Box (every other purchasable pack/box
  deleted, with achievement/battle-pass rewards that referenced a deleted
  pack redirected to an equivalent credits amount); added one swipeable
  per-set booster-pack store slot and one per-set booster-box slot (Blue
  Coral / Crimson Circuit / Dragonbone Wastes, each also able to pull a
  Full Arts Collection 1 card, same odds as the old Standard Booster
  Pack/Box); every pack/box now lists which sets it draws from; added a
  daily rotating 5-card Bounty Shop (2 Uncommon/1 Rare/1 Super-Rare/1
  Full-Art-or-better) — sell a matching owned card for 5x quicksell price
  (max 1 sale per card, 3 sales/day), buy a bounty card for 3x price
  (bounty purchases can't be sold back).
- **Card-face fixes**: the "add to showcase" button (a thrown network error
  used to silently reset to idle with no feedback); keyword/flavor-text
  overflow on heavily-keyworded cards (capped display + graceful clipping);
  the color pip (dropped an MTG-style letter that didn't match the card's
  actual color for a plain color swatch); the Ultra-Rare border ring (now
  hugs the card's true outer edge instead of sitting inset); the Full-Art
  bottom color band (removed so full-art images run edge-to-edge).
- **Bug hunt / accessibility**: keyboard activation (Enter/Space) + ARIA
  labels added to the enemy-Location and staging-card inspect targets in
  the game board and the pack-tear progress bar; two dead RETRY buttons in
  Player Shops (passed the wrong function signature to `onClick`, so
  clicking them threw and never actually retried); missing `catch`/`await`
  on several network calls (Social screen's search and friend/trade reload,
  Creator Tools' search) that could leave a spinner stuck with silent
  failure; confirmation dialogs added to three destructive actions that
  had none while their sibling actions in the same screens did (cancel
  friend request, cancel trade offer, buy an individual/bundle shop
  listing); a missing `role="dialog"` on the Marketplace bid modal; an
  unguarded `matchMedia` call that could throw; and an index-as-key React
  anti-pattern in the trade-card list.
- **Docs**: `docs/ROADMAP.md`'s Set 4 item reworded (was awkwardly phrasing
  an already-shipped Set 3 as upcoming); `docs/PVP_DESIGN.md`'s stale
  architecture description corrected to match the real `useState`-based
  engine (no `gameReducer`/`useReducer` ever existed).

Full writeup: `docs/BALANCE_SIM_FINDINGS_v4.22.md`.

### v4.21 rulebook catch-up + balance pass

- **Docs**: `docs/RULEBOOK.md` had drifted six versions behind the shipped
  engine — §10's Keyword Glossary was rewritten wholesale to match the live
  Tier I-V ladder every keyword has carried since v4.19 (source of truth
  `docs/KEYWORD_TIERS.md`), and a pointer to `docs/COLOR_IDENTITY.md`'s
  7-color system (shipped v4.13/v4.14) was added; the rulebook is now
  versioned v4.21 to match.
- **Balance** (see `docs/BALANCE_SIM_FINDINGS_v4.21.md`, run on
  CPU-constrained sandbox hardware — directional, not tuning-grade):
  Steel's print rate cut again (1-in-12 → 1-in-15, still the roster's worst
  cost-vs-winrate offender with its per-tier magnitude already floored);
  Avenge's lifetime stacking cap cut 2 → 1 (`SIM_TUNING.avengeCap`) after
  remaining the strongest keyword for two straight passes; a second
  `MANUAL_THRESHOLD_ADJ` step for repeat cost-vs-ability outliers
  `abyssal_dragonfish` and `ember_whisperer`; Swift's activation/delta
  tension closed as an intentionally high-variance keyword, not a bug.
- **Bug fix**: a dead, unused `AVENGE_CAP` export in `engine.ts` (the real
  enforced cap was always `SIM_TUNING.avengeCap`) was deleted rather than
  fixed, so it can't silently drift from live behavior again; two tests
  that hardcoded the old cap value now reference `SIM_TUNING.avengeCap`.
- **Bug hunt**: keyboard-accessibility double-fire on nested card chips, a
  leaked long-press timer, unstable React keys on the Battle Log, and two
  quicksell flows that could get stuck `busy` forever on a network error.
- Verified the full 292-card pool still matches Supabase (no drift).

Full writeup: `docs/BALANCE_SIM_FINDINGS_v4.21.md`.

### v4.20 sim-harness upgrade + balance + bug-hunt pass

- **Sim harness**: `scripts/fetch-cards.ts` automates pulling the live
  Supabase card pool into `scripts/live-cards.json` (replaces the old
  manual SQL-editor copy/paste step); `simulate-v4.ts` now tracks
  per-archetype CPU reasoning-lapse rates (`lapsePerGameByArch`), not just a
  pool-wide average; `scripts/diff-sim-runs.ts` diffs the two most recent
  sim runs and flags cards/keywords/archetypes that moved beyond a
  threshold.
- **Balance** (see `docs/BALANCE_SIM_FINDINGS_v4.20.md`): `the_wolf_of_wall_street`
  nerfed -1/-1 (three stable passes at a positive residual); the manual
  buff on `familiar_in_the_dark` removed entirely (halving it last pass
  didn't move its residual); a second cost/gate step applied to
  `driftwood_harp`, `ribbone_longbow`, and `deceptive_angler` (repeat
  cost-vs-ability outliers, unchanged across two passes).
- **CPU/engine bug fix**: Fatigue damage bypassed Toll reduction entirely —
  every other Leader-damage source (combat, Pierce overflow, Sap) already
  routed through it, only Fatigue didn't.
- **CPU/AI bug fix**: the placement solver's `'sum'`+Overflow die-selection
  branch could burn every unplaced die chasing an unreachable Overflow
  target instead of stopping once the base cost was affordable, starving
  every other action that turn.
- **Bug fixes**: pack-opening summary screen could crash on a zero-card
  pull response; Discord sign-in could leave the button permanently stuck
  disabled if the OAuth redirect was silently blocked; a couple of
  Supabase read failures (profile fetch, marketplace listing settlement)
  were silently swallowed instead of logged.
- **Docs**: stopped committing raw per-run sim JSON dumps (regeneratable,
  were bloating the repo); reconciled `COLOR_IDENTITY.md`'s stale top
  section against the current 7-color system; updated the roadmap now that
  Set 3 (Dragonbone Wastes) has shipped to the live 292-card pool.

### v4.18 balance + bug-hunt pass

- **Keyword nerf**: Steel's print rate cut (1-in-9 → 1-in-12 eligible cards)
  after two prior power trims left it still the most overtuned keyword
  (+17.3pt delta) — measured down to +7.8pt, no longer the outsized #1
  offender.
- **CPU fix**: Placement now Scraps a genuinely stuck die as a last resort
  (positive EV since v4.16's advantage-reroll change) instead of leaving it
  unplaced — a small, real improvement on the app's single largest CPU
  inefficiency (15.52 → 15.47 wasted dice/game); the bulk of that lapse is
  structural and needs a real assignment-problem solver, not another
  heuristic layer.
- **Balance**: reverted two v4.12 card patches (`the_wolf_of_wall_street`,
  `butterflyfish_school`) that had overshot into the opposite extreme —
  confirmed via a fresh sim that neither card's residual was actually about
  its own stats, so a third patch was skipped pending an archetype-
  normalized look.
- **UI**: flavor text now shrinks in step with however compressed the
  keyword/rules block above it got (previously sized off its own length
  only) — a follow-up refinement on v4.16's flavor-overflow fix. Also
  confirmed card colors already render by identity, not rarity (shipped in
  v4.16) — no further action needed there.
- **Bug hunt**: shop-open button now checks affordability before enabling;
  mystery-pack rarity weights can no longer go negative; admin currency/card
  grants now confirm before applying; game-over screen shows "Calculating
  rewards…" instead of a blank gap while a match result is still being
  recorded.
- Verified the full 292-card pool is in sync with Supabase (no drift).

Full writeup: `docs/BALANCE_SIM_FINDINGS_v4.18.md`.

### v4.17 balance pass — AI die-utilization + cost-vs-ability tuning

- **CPU fixes**: mulligan-keep bar tightened (marginal keeps measured
  -23.1pt vs. comfortable ones); Placement now spends any still-affordable
  card after Rally instead of ending the turn with playable dice unused
  (was 17.7 wasted dice/game, -32.0pt when it happened).
- **Card cost/stat tuning**: buffed 9 underperforming cards, nerfed 9
  overperforming cards, and adjusted the cost format on 6 cost-band
  outliers — all from cost-vs-ability z-scores in the 66,120-game baseline.
  Full list in `docs/BALANCE_SIM_FINDINGS_v4.17.md`.

Full writeup: `docs/BALANCE_SIM_FINDINGS_v4.17.md`.

### v4.16 balance pass — color-legality bug fix + harness expansion

- **Root-cause fix: 28/284 cards (9.9% of the pool) were undraftable by any
  Leader.** Secondary-keyword layering in `cardpool.ts` could stack 3+
  colors onto a card with no check that the result still fit a real
  Leader's 2-color identity — every Toll-keyword card was affected, so Toll
  had never fired once across a 66,120-game baseline. Fixed at the source
  with `wouldBeLegalSomewhere()`; dead-card count now 0/284.
- **Keyword balance**: Steel's overtuned tier-4 bonus point removed (was
  +22pt, the largest single keyword delta measured); Scrap's reroll changed
  from flat (measured -5.9pt EV, net negative to use) to advantage-of-two;
  Crescendo's trigger loosened to 5-or-6 (was 6-only), targeting its
  chronically low activation rate.
- **Leader kits**: Mer-King's mend Ability trimmed 2→1 (targets its 95.9%
  win-rate Guard-Bulwark Turtle outlier without a global nerf); Sovereign of
  the Dying Star, which had silently been running the generic default kit,
  got a real hand-tuned Ability/Resolve/Ultimate kit.
- **Bug fix**: Leader/Unit/Location Ability activation, Rally, Ultimates,
  Twin bonuses, and Combo triggers could all deal lethal damage without
  calling `cleanupDeaths()`, so a win could go unregistered until an
  unrelated later action happened to trigger cleanup. Fixed at all 5 sites
  in `engine.ts`.
- **UI**: card body color now renders from color identity instead of
  rarity (rarity keeps border/glow only); full-size cards drop a keyword's
  inline reminder text down to just its clickable name before ever
  truncating the card's actual ability or flavor text, fixing flavor text
  running off/overlapping the card on some prints.
- **Harness**: new cost/ability-efficiency, keyword-balance, and
  mechanic-impact instrumentation in `scripts/simulate-v4.ts`, plus a
  bucketed balance-summary section at the end of the report.

Full writeup: `docs/BALANCE_SIM_FINDINGS_v4.16.md`.

### v4.15 balance + CPU AI pass

- **Balance backlog cleared** (details in `docs/BALANCE_SIM_FINDINGS_v4.15.md`):
  Shinobi Avenge Grind's weak `Excavate` swap fixed (45.5%→73.8%, fully
  recovered); a new Mer-King archetype that deliberately avoids Guard
  confirms Mer-King's dominance is concentrated in Guard/Bulwark
  specifically, not a broad Leader-kit strength (25.0% win rate on its
  own); exact-cost wall bodies (Flickering Sea Pens/Cavernous Watcher)
  confirmed already resolved by the color-identity work, no fix needed.
  Sovereign Crimson Assault's retune (Avenge→Echo) did NOT help
  (34.0%→29.0%) — an honest miss, flagged for a different lever next
  pass. Formally closed 5 long-open items as accepted-design decisions
  (Crescendo, cost-vs-value normalization, wall-list meta, comeback rate,
  Crimson's card count) rather than re-flagging them every pass.
- **CPU decision-making improvements** (`src/game/v3/ai.ts`): (1)
  Placement now recognizes when a `destroy` card would clear a Guard and
  open a lethal attack this turn, and prioritizes it accordingly; (2)
  Combat avoids overkilling a Guard with its biggest attacker, sending the
  smallest sufficient attacker instead and preserving bigger attackers
  for face damage once the wall falls; (3) reroll strategy now has an
  explicit branch for hands with zero combo-gate cards, instead of
  silently falling into pair-keeping logic that doesn't apply; (4)
  mulligan now recognizes a coherent multi-card gate-family hand as
  keepable even with no individually-cheap card, and a stray
  raw-threshold comparison in the mulligan bottom-card logic was fixed to
  use the same `costWeight()` helper every other card-value comparison in
  the file already uses.
- **New instrumentation**: `guardClearLethalOpportunity`/
  `guardClearLethalConverted` decision-correlation counters. Measured:
  the opportunity arises in ~1 of 8 games and converts to a win 73.6% of
  the time — confirms the Guard-clear fix is real and meaningfully sized,
  not a paper win. Full re-verification (85,200 games across two runs):
  no invariant violations, all previously-fixed lapse detectors stayed at
  their expected zero/low baseline.

### v4.14b balance pass — color-aware archetype re-tune

- **Retuned 7 archetypes across 4 Leaders** whose `keywords:` included at
  least one color outside their Leader's identity (Abyss Sap-Echo Control,
  Abyss Pierce Aggro, Sea Witch Ward-Steel Wall, Mer King Twin Heal,
  Shinobi Tempo-Anchor, Shinobi Avenge Grind, Sovereign Steel Control) —
  swapped each off-identity keyword for the nearest in-identity one;
  labels kept stable. Added **Ruin-Walker Solar Tempo** and **Sovereign
  Crimson Assault**, genuine second archetypes for the two Leaders that
  previously had only one — both had a color in their identity (Solar,
  Crimson respectively) that no archetype had ever actually drafted for.
  Roster is now 24 archetypes (was 22).
- **Resolves 3 of `docs/COLOR_IDENTITY.md`'s open items**: Sovereign of the
  Dying Star's win rate (a 3-pass-running source of noise, 64.7%→27.8%→
  38.1%) stabilizes to a trustworthy 48.5% with a real 2-archetype roster;
  Solar's color win rate firms up from a 1-archetype 20.7% (n=2040) to a
  2-archetype 44.8% (n=6600); Ruin-Walker Overseer similarly stabilizes to
  46.9%. Full 55,000-game re-verification: no invariant violations.
- **2 new items surfaced and documented rather than chased further**:
  Shinobi Avenge Grind dropped sharply (73.2%→45.5%) from its keyword
  swap — legal now, but weaker than before; Sovereign's two archetypes are
  lopsided (87.7% vs. 34.0%), the new one being a first draft with no
  tuning history. See `docs/COLOR_IDENTITY.md` §7.
- **Also formally closes 2 items as accepted-design, no code change**:
  Crimson's smaller card count (34 vs. 46-99 for other colors) and the 28
  tri-color "orphan" cards legal under no Leader identity — both are
  intentional tradeoffs, not bugs, same as MTG's own color pie having
  uneven card counts and genuinely off-color prints.

### v4.14 feature pass — expand card colors from 5 to 7

- **Card colors expanded 5→7.** Renamed `Umbral`→**Obsidian** and
  `Radiant`→**Prism** (same keywords, new names — chosen so Prism wouldn't
  read as a synonym of the new Solar). Split Crescendo/Foothold/Contested/
  Snap off Prism into a new **Solar** color (situational/opportunistic
  timing); Prism keeps Twin/Rally. Added **Slate**, a true colorless color
  for cards with no color-mapped keyword, replacing the old guessed-color
  fallback — a Slate card is legal in every Leader's deck by definition.
  Re-derived all 8 Leader identities from their archetype keyword usage;
  **fixes a real bug**: Avatar of the Abyss and Apex Nanite Shinobi
  previously had an identical identity (both Umbral/Verdant) with zero
  differentiation — now unique for all 8 Leaders. See
  `docs/COLOR_IDENTITY.md` §6.
- **Sim harness**: `scripts/color-audit.ts` updated for the 7-color scheme
  plus a duplicate-identity-pair check. Full 53,040-game verification run:
  no invariant violations, but another round of large Leader win-rate
  swings (most notably Ruin-Walker Overseer 70.4%→40.0% from a pure
  rename+recolor with zero archetype redesign) — hard evidence the
  22-archetype roster still needs its color-aware re-tune (open item
  carried from v4.13, not addressed this pass either).
- No changes needed to DeckBuilder/Collection filters, the card-frame color
  pip, or deck construction — all already iterate the `COLORS` list
  generically.

### v4.13 feature pass — card colors

- **New rule: card colors.** Every card now carries 1+ of 5 colors (Crimson
  aggro, Azure control, Verdant ramp, Umbral attrition, Radiant
  synergy/combo — derived from existing keywords, see
  `docs/COLOR_IDENTITY.md`), and every Leader has a fixed 2-color identity.
  Deck legality (`validateDeckList`) now rejects any card outside a deck's
  Leader's identity — a genuine deckbuilding constraint, not a cosmetic
  tag. DeckBuilder's card pool is pre-filtered to legal cards, with a color
  filter and an identity-pip indicator; Collection gets a matching color
  filter. Card frames show a color pip. **Note: not retroactively enforced
  on decks saved before this pass** — see findings §5 item 5.
- **Sim harness**: `buildDeck`/`buildPureRandomDeck` (`decks.ts`) now draw
  only from a Leader's color-legal pool, so simulated decks stay legal
  under the new rule; added color win-rate and Leader-identity reporting to
  `simulate-v4.ts`. A full 53,040-game verification run shows no invariant
  violations, but large Leader/archetype win-rate swings (documented in
  `docs/COLOR_IDENTITY.md` §4) — the existing 22-archetype roster was
  tuned pre-color and needs its own color-aware re-tune pass next, not
  chased further this pass.
- **New**: `scripts/color-audit.ts` — one-off pool-wide color-distribution
  and Leader-identity-legality check.

### v4.12 balance/feature/bug pass

- **Data integrity (headline finding)**: the bundled offline card-pool
  fallback (`src/game/generated-cards.ts`), which the sim harness imports
  directly and the live app falls back to, had drifted to **193 of the 292
  cards** now in the Supabase `cards` table — every balance pass since it
  was last regenerated (including all of v4.5-v4.11) ran on roughly
  two-thirds of the real pool, missing ~99 cards and 2 whole Leaders
  (Ruin-Walker Overseer, Sovereign of the Dying Star). Regenerated from the
  live table; full details and the fallout in
  `docs/BALANCE_SIM_FINDINGS_v4.12.md` §2.
- **Balance (details in `docs/BALANCE_SIM_FINDINGS_v4.12.md`)**: the newly-
  complete pool surfaced a batch of never-before-simmed cards as extreme
  cost-vs-value residual outliers. Patched the worst of them (Vampire Squid,
  Half-Faded Shade, Where the Deep Meets the Sky and 6 more Units trimmed;
  Void Mother, Familiar in the Dark and 6 more Charms/Events/Locations
  buffed), iterated twice with full-sim verification between rounds. Gave
  Swift a +1 ATK on-cast bonus (matching the existing Frenzy/Anchor
  compensation pattern) — it's measured as the pool's weakest keyword for
  2+ passes and is Legendary Diver's identity keyword. Diver's Leader win
  rate (22-24%) did not meaningfully move from this alone; flagged for a
  Leader-kit-level isolation pass next (see findings §5 item 2).
- **Sim harness**: four upgrades. **JSON result persistence**
  (`docs/sim-runs/*.json`) so a full pass's raw counters survive past
  console scrollback. **Card-type (Unit/Charm/Event/Location) win-rate
  table**, independent of any one keyword. **Comeback-rate tracking** —
  Leader HP checkpoint at round 8 correlated with final win — surfaced a
  strongly snowball-favoring game (26-27% win rate when behind vs. 73-74%
  when ahead), flagged as an open design question. **Archetype head-to-head
  matchup matrix** (all pairs, not just aggregate win% vs. the whole field)
  — catches hard-counter/RPS problems aggregate win% hides.
- **Roster coverage**: added archetypes for the 2 new-pool Leaders
  (Ruin-Walker Overseer, Sovereign of the Dying Star) so they're piloted by
  a real decklist instead of only sampled incidentally via random-deck
  control games.

### v4.11 balance/feature/bug pass

- **Balance (details in `docs/BALANCE_SIM_FINDINGS_v4.11.md`)**: a
  **diagnosis pass that ships no balance change** — both levers considered
  were built, measured, and rejected after full-sim verification, the honest
  outcome for a roster that has converged over v4.5–v4.10. Two long-open
  priority items are **closed by proving what they are**: (1) Mer-King's
  chronically weak Avenge Swarm (36–43%) is **not a card-balance bug** — the
  deck-swap isolation the v4.10 doc asked for shows the *identical* Avenge
  list winning 46.9% under Shinobi and **59.8% under Diver**, and stripping
  the deck's own mend package (while keeping Mer-King) gains +12.9pt; it's a
  Leader-kit-fit problem (Mer-King's sustain kit fights a sacrifice-swarm
  plan), and buffing the Avenge cards would only push Shinobi Avenge Grind
  (already 86%) further out of line. (2) The Unit-Ability-order CPU-lapse
  detector that measured exactly zero in v4.10 is confirmed **genuinely
  zero** — new situation-frequency counters show the situation (2+ eligible
  Unit Abilities competing for one die) never once arises in 33,840 games, so
  the detector isn't blind, the case simply doesn't exist. Crescendo's v4.10
  redesign baseline **held** (41.3% again on a fresh run); a base-value step
  measured null because Crescendo lives on exactly one pool card (a
  representation problem, not a power one — flagged for next pass). The
  wall-list meta stays open: the ready `guardHpBonus` cut now has **direct
  evidence it re-sinks both weak Mer-King archetypes** (−10pt / −7.5pt), so
  it's still correctly not shipped.
- **Sim harness**: five upgrades. A **deck-level Avenge Swarm isolation**
  (five new ablation subjects: the same list under Shinobi/Diver, plus
  Guard- and mend-stripped Mer-King variants) — the tool that cracked
  priority item 1. **Unit-Ability-order situation counters**
  (`unitAbilityMultiCandidate` / `…Tiered`) that distinguish "detector broken"
  from "situation never arises" — closing priority item 4. A **cost-vs-value
  RESIDUAL table** that fixes the offset artifact in v4.10's win%÷difficulty
  ratio (win% is centered on ~50%, not 0) by comparing each card only against
  other cards *at the same cost band* — it cleanly re-confirms the exact-cost
  wall bodies (Flickering Sea Pens / Cavernous Watcher at +30pt over their
  band). A **keyword-health table** pairing each keyword's win% with pool
  prevalence and measured cast activity — which immediately surfaced that
  Crescendo, the bottom keyword every pass, exists on a *single* card. And an
  **`avengeCap` buff-direction ablation arm** plus a `crescendoBase` tuning
  dial so both open questions are ablatable instead of hardcoded.
- **Feature-and-bug hunt / QoL**: a full review of the engine (`engine.ts`),
  CPU AI (`ai.ts`), and the highest-risk `GameV4.tsx` UI paths (die-capture
  on armed abilities/ultimates/echo, target-pending resolution, stage/turn
  gating, the die tray) found **no correctness bug** — the code is mature and
  the reviewed UI already carries the accessibility affordances prior passes
  added — reported honestly rather than manufacturing a change. The engine
  game-flow is exercised by 33,840 games per run with full per-turn invariant
  checking (zero violations across both full runs). Browser automation for a
  live click-through was **not available** in this environment (the sandbox
  proxy makes `playwright install chromium` a no-op and there is no system
  browser), so the UI was verified by code review only — stated plainly, not
  claimed as a click-through. Added one regression test locking the new
  `crescendoBase` dial's "default equals live behavior" invariant and its
  rebuild-applies-change behavior (92 tests pass).

### v4.10 balance/feature/bug pass

- **Balance (details in `docs/BALANCE_SIM_FINDINGS_v4.10.md`)**: Locations'
  isolated win-rate contribution has been slightly negative every pass
  since v4.4 — a dedicated ablation battery (never run before this pass)
  found the one lever that actually moves it: the flat on-cast board-impact
  buff every Location resolves the instant it enters play, 2 → 3. Isolated
  contribution flipped from -1.3 win% to **+1.5 win%**, and every
  Location-only keyword (Excavate, Foothold, Contested) rose 4-5pt as a
  side effect. Crescendo redesigned after a 4th straight flat-or-declining
  pass (36.4%, down from 39.5%): the bonus no longer scales with how many
  dice show a 6 (rolling 2+ sixes in one turn is rare, so the old
  multiplier almost never applied) — it's now a flat bonus the moment ANY
  die shows a 6 rolled this turn (not just spent on a cast). 36.4% → 41.3%.
  Mer-King's Twin Heal archetype (37.1%) got a first-ever per-card look
  (three of its own weakest cards identified and given a small buff) and
  recovered to 39.1%; its sibling Avenge Swarm barely moved (43.2% →
  43.4%) — the per-card signal there is diffuse, no single fix found,
  flagged for next pass. The wall-list meta (Shinobi Avenge Grind, ~86%)
  remains open — a further Guard-HP lever is measured and ready but
  deliberately not shipped this pass, since stacking it now would re-widen
  Mer-King's Leader spread before that archetype has an independent fix.
- **Sim harness**: a new class of CPU-lapse detector — sub-optimal
  target/action choice within a play the AI was already making, not just
  whether it acted at all (the existing "did it act" detectors have
  measured zero for four straight passes). Found and fixed a real, if rare,
  gap: combat trades with multiple legal kill targets used to take
  whichever enemy Unit was cast first instead of the most valuable one
  (0.035/game). A companion detector for Unit-Ability activation order
  measured zero — a working detector with nothing to catch in this
  roster, which is itself useful information. Also added: a per-archetype
  "cast this card and win" table (the old per-archetype win-in-deck number
  turned out to be meaningless for a fixed decklist — literally every card
  reads as identical to the deck's own win rate), a per-archetype-
  normalized Echo win-delta table, and the cost-vs-value table the v4.8
  changelog claimed had shipped but actually hadn't (the import was there;
  the code wasn't).
- **Bug fixes / QoL (full feature-and-bug-hunt pass)**: a currency-scaling
  bug (typing "50" submitting 5,000) had crept back into five separate
  credit inputs (Creator Tools currency grant, trade offers, marketplace
  sell/buyout/bid, player-shop listing prices) — fixed everywhere it
  reappeared. "Busy flag stuck forever" hardening (a failed claim, purchase,
  save, or report used to leave buttons permanently disabled with no
  recovery short of a reload) added across the Store's pack/item handlers,
  Marketplace, Social, News Center, and Player Shops. Retry buttons and
  friendlier error states added to previously-silent load failures on News
  Center's feed and all three Player Shops tabs (directory/storefront/my
  shop). Other real bugs fixed: the Collection screen's per-card foil/normal
  Quicksell buttons could offer to sell more copies than were actually free
  (unified with the same math the bulk-quicksell path already used); the
  deck builder's Leader-ownership check missed a Leader quicksold to exactly
  zero; a raw Postgres error string could leak to the player on a failed
  deck deletion; a pack-opening haul-quicksell could mark cards "SOLD" that
  the server only partially sold; Store purchase buttons only disabled the
  one being clicked instead of every button while any purchase was in
  flight. In the live match screen, a Unit/Leader Ability or Ultimate cast
  with a target picker could resolve against whichever die happened to be
  selected by the time the target was clicked instead of the one actually
  committed when the ability was armed (Cast already avoided this;
  Ability/Ultimate/plain-Echo now capture their die the same way).
  Small QoL/accessibility additions: confirm-before-destructive dialogs
  (haul quicksell, declining a trade, cancelling a marketplace or shop
  listing, submitting a mystery pool, buying a mystery pack, replacing a
  deck via QUICKBUILD); Escape-to-close on the Leader picker; keyboard focus
  on in-match status tooltips; missing alt text filled in across profile
  banners/avatars, pack/cosmetic art, and news-feed thumbnails; a live
  auction-countdown tick on the Marketplace.

### v4.9 balance/feature/bug pass

- **Balance (details in `docs/BALANCE_SIM_FINDINGS_v4.9.md`)**: Guard's
  print HP bonus trimmed 3 → 2 — a dedicated ablation battery targeting the
  "wall-list meta" (flagged as unsolved in v4.7 and v4.8) finally found a
  lever that compresses the dominant wall decks (Avenge Grind 91.0% →
  85.4%, Guard-Bulwark Turtle 80.2% → 74.7%) AND lifts the roster-floor
  ramp decks (Tempo-Anchor 18.4% → 21.6%, Excavate Ramp 42.6% → 47.2%) at
  the same time. Reported honestly: this hit Mer-King (Guard-primary in
  all 3 of its archetypes) disproportionately — Leader spread widened from
  v4.8's 8.2pt best-ever to ~15pt — and three Leader-kit compensations
  were tried with only a small once-per-game Ultimate bump kept; a real
  fix needs a card-level look at Mer-King's two weak archetypes next pass.
  Crescendo base 3 → 4 (third straight flat pass, redesign candidate still
  open).
- **Sim harness**: the idle-Leader-Ability CPU-lapse detector now splits
  into three specific reasons instead of one bucket — the genuine-lapse
  count measured **zero** across 33,840 games, meaning the CPU's
  placement/combat heuristics have no reasoning gap left that this
  detector set can see. New per-card Echo recast win-delta table (found to
  be confounded by deck quality — not actioned, flagged for a
  per-archetype-normalized version next pass) and a deck-level
  "durable-body density" metric (the tool that actually surfaced the Guard
  lever above).
- **Bug fixes / QoL (full feature-and-bug-hunt pass)**: fixed several
  stale-closure race conditions in Supabase-backed screens (an old fetch
  resolving after a newer one started could stomp fresh profile/collection
  state on a fast account switch), several "busy flag stuck forever"
  bugs where a failed mutation left buttons permanently disabled with no
  recovery short of a reload, three uncleared-timer memory leaks, a
  Collection-screen foil quicksell button that could offer to sell more
  foil copies than were actually free, a raw SQL error string leaking to
  the player on a failed deck deletion, and a couple of missing keyboard/
  accessibility affordances (Escape-to-close on the card inspector modal,
  alt text on card art, a retry button on a failed profile-modal load).
  Small QoL additions: a confirm-before-sign-out for real accounts, a
  password show/hide toggle on the auth screen, and better empty/loading/
  error states on the News Center and Collection screens.

### v4.8 balance/feature/bug pass

- **Rule removed — Momentum**: the dedicated on/off A/B the findings docs
  kept asking for finally ran (6,768 decisive games per arm): leader spread
  was slightly *better* without it, games ran a full round shorter, and the
  weakest roster deck gained +9pt. Four rounds of stacked riders never made
  the trigger correlate with winning. Every turn is exactly five dice again.
- **Balance (details in `docs/BALANCE_SIM_FINDINGS_v4.8.md`)**: Leader
  win-rate spread 12.0pt → **8.2pt (new best)** — Diver Resolve 1→2
  (43.4→50.1), Abyss Ultimate mass-sap 4→3; exact-cost Unit stat basis
  trimmed again (the entire "most under-priced" list was cheap exact-cost
  defensive bodies, and a new deck-level ablation proved Avenge Grind's 94%
  engine is that list, not its Leader); Echo's extra-discard now waived for
  Rare and higher; Anchor Units +3 HP print (was +2); Crescendo base 2→3;
  Chrono-Phalanx redesigned (+2/+2 and Overrun) after four passes at the
  pool's bottom.
- **Sim harness**: CPU-lapse detectors (missed lethal / wasted castable die
  / idle Leader Ability — missed lethal measured **zero** in 22,560 games),
  a cost-vs-value table pricing every card against its real cast-format
  difficulty, Momentum/Echo A/B arms, deck-level ablation subjects, and
  fatigue/Overrun/Pierce/Anchor counters.
- **Bug fixes**: per-rarity deck copy caps (Mythic 1, Super-Rare/Full-Art/
  Ultra-Rare 2) are now actually enforced in the deck builder AND deck-code
  import — both previously accepted 3 of anything while the rules screens
  promised tighter caps; stale rules text cleaned up (hand-limit comment,
  Echo waiver wording, Momentum references).
- **New premium card templates**: Ultra-Rare "Aurora Vault" (chromatic
  teal/violet lattice, counter-rotating light-traces, hover-gated aurora
  sweep) and Mythic "Void Eclipse" (rotating nebula border, eclipse-corona
  sigil, drifting parallax starfield, amethyst stat gems) replace the v4.7
  gold/magma looks. Same performance rules: expensive layers hover/inspector
  gated, reduced-motion respected.
- **QoL**: Fatigue damage now gets a center-screen banner (it was a Battle
  Log whisper); the Battle Log can expand to a tall scrollback; the forced
  end-of-turn discard picker gained a SUGGEST button that auto-selects the
  engine's recommended cuts.

### v4.7 balance/feature/bug pass

- **Rule change — Fatigue replaces the instant deck-out loss**: a new
  ablation harness (`scripts/simulate-ablation.ts`, one engine dial per arm
  via `SIM_TUNING`) proved that NO labeled keyword powers the durability
  decks that topped three straight sims — a `tollCap 3→1` arm measured
  *identically to baseline to the decimal*, and removing Avenge outright
  moved its 92% flagship deck under 3pt. The real engine was §9's
  instant deck-out loss: **24% of all games** ended on it, silently
  punishing every card-draw effect and crowning unit-hoarding attrition
  lists. Drawing from an empty deck now deals escalating Fatigue damage
  (1, 2, 3...) instead. Verified: deck-outs 10,999 → 0 across 45,120 games,
  Leader win-rate spread 18.6pt → **12.0pt (best measured to date)**,
  Legendary Diver finally off the floor (36.3% → 43.0%).
- **Balance (details in `docs/BALANCE_SIM_FINDINGS_v4.7.md`)**: Twin bodies
  re-budgeted off their real printed threshold (they cast at legacy−1 with
  full stats plus a rider — Lurking Coral-Prowler was a 9/8 for threshold
  4; Twin drops off the #1 keyword spot); Steel X prints trimmed 2/2/3 →
  1/1/2 by tier (the one keyword dial the ablation showed actually bites);
  Anchor Units +2 HP (their 4/2 glass bodies died before any ramp existed —
  biggest floor recovery ever measured, Abyss Excavate Ramp 24.7% → 40.6%).
  Negative results kept honest: Toll cap, Mend halving, Anchor cap-bonus
  draw, and a Guard +3→+2 HP trim all measured as no-ops and were reverted.
- **CPU AI**: the face-lethal calculation now subtracts the defender's Toll
  (it was dumping whole boards into blunted face attacks); board-wide-buff
  Ultimates are never burned with fewer than 2 Units in play
  (`ultimateUsedBehind` decision delta −38.5 → −29.4pt); low-rarity Echo
  recasts only happen when hand fodder is nearly free (that decision's
  delta went **−9.4pt → −0.4pt**).
- **Bug-hunt fixes (game UI)**: the Shinobi no-repeat-target rule is now
  respected by the target picker (it offered last turn's target, which the
  engine always rejected); Echo with an empty hand no longer soft-locks the
  discard-fodder picker; non-mid-rarity Echo of a Twin card says "staged"
  with the die face; Snap sum-casts prune stale reroll marks; the staged-
  Twin SET button explains it only works during Placement; failed Ultimates
  give feedback; How-to-Play caught up on Overrun half-ATK, the
  Steel+Bulwark cap, the Avenge cap, Frenzy's second-swing Leader rule,
  Rally's die-threshold rule, and the new Fatigue rule; Bind now shows a
  pending ⛓ badge the turn it lands; the turn-1 hint no longer asks you to
  attack when attacks are illegal.
- **Bug-hunt fixes (meta/economy)**: mode-toggle buttons no longer submit
  the auth form (missing `type="button"` on every PopButton); a stale
  auction buyout no longer corrupts/blocks fixed-price listings; the sell
  form no longer switches tabs when listing creation fails; searching while
  selling no longer deselects the card; mystery-pack pools re-require
  validation after edits; "packs left" counters refresh after purchases;
  cosmetic equips are serialized against a race; a React key collision in
  the news feed fixed.
- **QoL**: bid modal enforces the 5% minimum raise client-side with the
  minimum shown; Escape closes the profile/pack-odds/report modals; store
  tab switches clear stale notices; new deck-code tests.
- **New premium card templates**: Ultra-Rare "Gilded Reliquary" (engraved
  cut-corner SVG filigree frame with an animated light-trace and hover
  prismatic sheen) and Mythic "Molten Sovereign" (drifting magma-vein
  border, faceted gold corner fangs, pulsing flame-crown sigil, embossed
  stat gems, and a pointer-tracking ember glow in the 3D inspector). Pure
  CSS/inline-SVG, reduced-motion aware, grid-performance gated.

### v4.6 balance/feature/bug pass

- **Long-standing balance bug — the v4.4 Leader-Ability flags were never
  wired up**: `mapLeader()` never assigned `abilityGrantsTempo` (Legendary
  Diver's documented tempo-grant buff) or `abilityNoRepeatTarget` (Apex
  Nanite Shinobi's documented targeting nerf) to any Leader; both features
  lived only in the engine and docs, inert in every real match and sim for
  two full balance passes. Found via a byte-identical verification sim
  (deterministic seeds can't produce identical output across a real code
  change); now assigned, plus a new catalog test asserting the live pool
  actually carries every Leader def flag. With the tempo grant finally live
  (and strengthened to +2/+2), Diver rose above its true baseline for the
  first time (34.2% → 36.4%).
- **Balance (verified by three full 22,560-game re-sims; details in
  `docs/BALANCE_SIM_FINDINGS_v4.6.md`)**: Leader win-rate spread narrowed
  21.2pt → 17.6pt (top five Leaders within 2pt). Exact-cost Units now
  budget stats off the measured ~flat difficulty of an exact-face cost
  (the baseline's "most OP" list was wall-to-wall exact-cost stat-sticks);
  straight-family gate cards get +1/+1 (Small Straight) / +2/+2 (Large
  Straight) compensation for hit rates half their match-family tier
  siblings; Avenge capped at 2 stacks (Mer King Avenge Swarm 72.4% →
  62.3%); Overrun punches floor(ATK/2) instead of a flat 1; a Unit's
  combined Steel+Bulwark prevention caps at 4 per hit; Momentum also draws
  a card; Location on-cast buff base 2 — Locations measured **neutral in
  isolation for the first time** (-1.9% → -0.2%). Two attempted changes
  were reverted after verification sims showed regressions (full-pool
  difficulty re-pricing; a cost-difficulty-keyed Swift conversion) — both
  documented as negative results.
- **Ultimate(N) exonerated**: new instrumentation splits Ultimate usage by
  board state at activation — used while ahead it's a +30pt win signal,
  used while behind -39pt. The old "Ultimates correlate with losing"
  finding was the desperation confound, not weak Ultimates.
- **CPU AI**: the reroll heuristic no longer rerolls away dice that pay
  exact-cost cards in hand (exact-cost removal was sitting at 0.29-0.44
  casts/game because the AI kept destroying its own payment dice).
- **Bug-hunt fixes (game UI)**: the discard-drawer Echo button now
  enforces exact-cost correctly instead of walking the player through
  target/fodder pickers before failing; a reroll charge is no longer
  silently wasted when a Snap cast places a die that was marked for
  reroll; Momentum's 6th die now animates on roll; the sum-Echo bar
  clears when a target picker opens; mid-rarity Echo of a Twin card says
  "staged", not "in play"; the threshold-discount popover no longer
  mis-credits Foothold discounts to Anchor; How-to-Play was a full engine
  version stale (wrong combo-gate/order rule, missing Steel/Overrun/
  Foothold/Momentum, wrong Pierce cap, wrong Rally/Echo text, Anchor cap)
  and now matches the v4.6 engine, with the Anchor glossary +2/+2 fix.
- **Bug-hunt fixes (meta/economy)**: every credit input (marketplace bids,
  sell/buyout prices, shop listings, mystery-pack pricing, trade credits,
  creator grants) was still converting ×100 from a stale "cents"
  convention — typing 500 submitted a 50,000-credit bid; all are plain
  integer credits now. Theme loading no longer white-screens browsers with
  blocked storage; deck validation now rejects a Leader you own zero
  copies of; shop bundles can't claim more copies than owned; a failed
  sign-out no longer strands the session.
- **New card templates**: Ultra-Rare "Gilded Relic" (animated gold-leaf
  name banner, engraved corner brackets, twinkling gold-dust layer) and
  Mythic "Living Inferno" (rising ember layer over the animated red/gold
  banner and pulsing frame).
- **QoL**: combo-gate cost popovers now show the measured hit chance
  ("a focused player hits this ~44% of turns"); decorative card
  animations respect `prefers-reduced-motion`; the opponent's banished
  count is visible in-match.

### Fixed (v4.5 balance-sim pass)

- **`docs/RULEBOOK.md` was out of sync with the shipped engine**: the v4.4.1
  and v4.4.2 balance passes (Overrun keyword, Foothold keyword, Momentum's
  +1 ATK addition, Frenzy's behind-on-board Leader-targeting carve-out,
  Locations' on-cast +1/+1, Shinobi/Diver Leader Ability retuning) landed in
  code and tests but were never written back to the rulebook. Documented all
  of it (new errata block, keyword glossary entries for Overrun/Foothold,
  inline notes on Frenzy/Momentum/Locations).
- **FourKind Combo-gate pool bug**: `pickCostFormat()`'s general `HARD_GATES`
  picker was assigning FourKind as a co-equal option alongside Full House
  and Large Straight, contradicting the rulebook's own guidance that
  Yahtzee/FourKind should be flavor-only rarity (1-3 trophy cards total) —
  5 FourKind-gated cards existed in the live pool as a result. FourKind is
  now excluded from the general picker, same treatment Yahtzee already had.
- **22,560-game v4.4.2 balance-sim pass** (`npm run sim:v4 10`) flagged, then
  **acted on in a follow-up pass** (see `docs/BALANCE_SIM_FINDINGS_v4.5.md`
  §0 for the full before/after): 6 CPU AI heuristic fixes (gate-costed cards
  no longer read as "free" in combat trades/cast priority via a rarity
  proxy; Location choice now weighs Foothold/Excavate/Tribute/Contested;
  mulligan treats easy-gate hands as keepable; Echo recasts are
  value-ordered; buff auto-targeting spreads to the weakest Unit instead of
  always reinforcing the biggest); Avenge capped at 3 stacks/card (was the
  only uncapped repeating stat mechanic in the game); Excavate/Crescendo
  buffed, Contested's on-cast doubling added, Location on-cast scaled by
  rarity, Anchor's ramp payoff doubled, Momentum given a Leader-Ability
  discount; Mer-King and Apex Nanite Shinobi (the two strongest leaders)
  nerfed, Legendary Diver and Avatar of the Abyss (the two weakest) buffed;
  `pattern-hitrate.ts` and the §6 hit-rate table updated to model the
  actual 2-reroll rule (was 1-reroll only). **Verified results**: Excavate/
  Contested/Crescendo/Foothold keyword win rates all up 6-7.5pt, Locations'
  isolated contribution more than halved (-3.7% → -1.2%), Mer-King nerf
  landed (57.8% → 52.9%). **Flagged, not yet resolved**: Avenge's cap
  barely moved its dominant archetype (Shinobi Avenge Grind still 92.3%);
  Momentum's decision correlation barely moved (still -65.9pt); Ultimate(N)
  usage correlation got worse (-15.2pt, more evidence for a deck-membership
  confound rather than the mechanic itself); and the two Straight-family
  Combo-gated archetypes (Diver Straight-Combo, Sea Witch Bind-Straight
  Combo) dropped sharply for reasons not yet confirmed (likely relative
  redistribution from the other buffs landing elsewhere in the same
  round-robin metric, but unconfirmed — needs its own isolate-and-measure
  pass before further tuning).
- **v4.5.1 root-cause pass**: investigated the Straight-family archetype
  regression flagged above with a dedicated isolate-and-measure sim (a
  `git worktree` checkout of the commit right after the FourKind fix, run
  independently) — the crash was **already fully present there**, before
  any AI/keyword/Leader change, ruling those out and pointing at the
  FourKind fix itself. Root cause: `pick()` indexes a picker array with
  `hash(id) % arr.length`, so shrinking `HARD_GATES` from 3 entries to 2
  (the FourKind fix) silently reassigned which cards are FullHouse-gated
  vs. LargeStraight-gated **pool-wide**, not just the ones that would've
  been FourKind. Fixed properly: `pick()` against the original, unchanged
  3-entry array, then remap only an actual FourKind result to
  FullHouse/LargeStraight via an independent hash (`pickHardGate()`) — every
  card that previously resolved to FullHouse/LargeStraight is unaffected.
  Two more CPU AI lapses found in the same re-audit and fixed: `chooseReroll()`'s
  reroll strategy was `wantStraight && !wantMatch`, so a single stray
  match-gated card in a straight-heavy hand silently overrode the deck's
  actual reroll plan (now counts each family and follows the majority); and
  the Unit-ability loop always chose attacking over an ability once ATK hit
  3, even when the ability was unconditional removal against a live target
  (now `destroy` with a target overrides the attack default). Re-verified:
  Diver Straight-Combo 14.6%→24.0%, Diver Rally Tempo 17.9%→26.3% (real
  recovery, not full — see `docs/BALANCE_SIM_FINDINGS_v4.5.md` §0.1 for the
  residual-gap discussion and a new finding that the overall Leader spread
  actually widened this round, 18.2pt→21.2pt, with Diver and Sea Witch now
  the clearest outliers).

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
