# Roadmap

Prioritized direction for Frycards. Items move to `CHANGELOG.md` when shipped.

Rewritten in v7.7, revised in v13. The previous version had drifted into being
a copy of the balance doc's carry-forward list with the product work pushed to the margins —
nine of its thirteen items were individual card and keyword numbers that go
stale every pass. Balance now gets **one** entry here that points at the
findings doc, which is the thing that actually tracks it, and the rest of this
file is about the game.

Three horizons, and each item says what it is blocked on rather than only what
it is.

---

## Now — finish what is half-built

Everything here has a started implementation and a visible seam.

- **Players Showcase 2026 — the pipeline and the Creator's tools ship; the set
  itself is still empty and the poll is still a promise.** Players can submit
  (art link, title, type, flavor), the Creator can approve at any rarity, deny,
  or deny-and-ban, and approval mints the real `cards` row. v13 added the
  Creator's **mechanics override** (generated values are the starting point,
  not the verdict), renamed the set, put the **100-card viability bar** in front
  of the copy, made every card preview full size and 3D-inspectable, and printed
  the **art aspect ratios** submitters were previously left to guess. What is
  still deliberately *not* done is a decision each, not a defect:

  - **The `Players Showcase 2026 Booster` pack row exists but is
    `is_active = false`.** It is set-restricted, and `random_card_of_rarity`'s
    final fallback spills to the whole catalog only when the requested set is
    _completely_ empty — so it is safe to activate the moment the set has one
    non-Leader card, and unsafe before that. **Safe is not the same as worth
    doing:** `SHOWCASE_MIN_CARDS = 100` is the bar the screen now quotes, and
    below it a set-restricted booster hands out the same handful of cards over
    and over. Flip the row when the set clears 100, not when it clears 1.
  - **The Ultra-Rare community poll is announced, not built.** The screen now
    frames it as part of the same 100-card threshold rather than as a submitter
    count, and `get_showcase_stats` returns `submitted` / `printed` /
    `cards_needed` for that meter. There is still no ballot, no vote table and
    no tally — running the first one is manual, and building it properly wants a
    `showcase_polls` / `showcase_votes` pair plus one-vote-per-account
    enforcement.
  - **An approved card is live-only until the bundle is regenerated.**
    `npm run verify:pool` will report every Showcase card as
    `live-only — missing from generated-cards.ts` until `npm run fetch:cards`
    is run and the result committed. That is correct (the bundle is the offline
    fallback and a build artefact), but it means an approval batch is not
    finished until the bundle is refreshed — otherwise the offline fallback and
    every balance sim run on a catalog the live game no longer matches.
  - **`verify:pool` and `db:sync` need direct network access to Supabase**, so
    neither runs from a sandboxed CI/agent session. v13 found live drift by
    hashing the pool on both sides through the Supabase MCP instead (see the
    v13 CHANGELOG entry for the exact query). Worth turning into a script that
    can run without an egress allowlist — a drift guard that cannot run where
    the work happens is a drift guard that runs late.

- **The Item subtype split owes a balance pass** (new in v13). Renaming `Charm`
  to `Item` was seed-stable — `SEED_TYPE` keeps hashing Items as `Charm`, so
  cost, colour and keywords are byte-identical — but the *subtypes* are not a
  rename: the old Bound/Worn pair became Charm/Weapon/Tool, 11 of the 61 Items
  became Tools, and a Tool trades one point of bond for a permanent -1/-1 (-2/-2
  at Full-Art and up) on a target enemy unit as it lands. Charms also gained a
  second mode — cast on a player for Vitality equal to the whole bond — which is
  the first line in the game that turns a permanent into burst life, and the
  first Item playable on an empty board. Nothing here has been through the sim.
  The pass wants: Tool win-rate residual against the Weapons they were split
  from, how often the CPU takes the self-cast Charm line and whether it should,
  and whether `t + 1 - survives - isTool` is the right bond budget. Per the
  standing rule this is a **content** change, so it re-baselines the pool and
  balance trials resume after it, not during.

- **Mobile/responsive — the measurement half is done; the audit half is not.**
  v7.4 did the match board, v7.5 the card views around it, and **v11 finally
  closed the "still unmeasured" list**: `meta-preview.html` now mounts every
  meta screen (`store`, `market`, `shops`, `battlepass`, `achievements`, `news`,
  `settings`, `menu`, `howtoplay`, `changelog` on top of the six it already
  had), with stubbed `pack_types` / `shop_items` rows so the Store shelf and its
  odds modal lay out at full size instead of as an empty state.

  What that measurement found: **nothing**. All sixteen screens render at 375px
  with `documentElement.scrollWidth === innerWidth` and zero interactive
  elements outside the viewport, and the same holds after clicking each screen's
  visible controls one at a time (~100 controls, each on a fresh load, checked
  for overflow and for a thrown render). The match board also plays a full
  narrated game end-to-end at 1280px with no console error. So the remaining
  mobile work is **not** layout overflow — it is the things a geometry check
  cannot see: tap-target sizes, text scaling, and real-device scroll/keyboard
  behaviour. Re-run the harness before assuming a phone regression exists.

  **v12 made "re-run the harness" possible.** The v11 measurement was ad hoc and
  was never committed, so the instruction above pointed at nothing. It is now
  `scripts/audit-meta-screens.ts` / `npm run audit:screens` (dev server up
  first, same contract as `audit:cardface`): every screen in `meta-preview.tsx`
  at 375px and 1280px, then each screen's visible controls clicked one at a
  time on a fresh load, checking for overflow, a thrown render and a real
  console error. It exits non-zero on any finding, so it can gate a release.

  **v13 closed the last hole in it:** the harness always mounted a `player`
  profile, so the Creator-only panels — the submission review queue, its
  mechanics-override editor and the BULK ADD importer — had never been measured
  at any width. A `SCREENS` entry may now carry extra query string, and
  `submissions&role=creator` is in the list.

  **v14 found that the entry above was measuring less than it claimed.** The
  click sweep sampled the control count at a fixed 700ms and used it as its
  stop condition, so a screen that mounts its panels after a fetch settles was
  read as having *no* controls and skipped at index 0 — which prints as
  `clicked 0 control(s)` and reads like "checked, nothing to click". Four
  screens were never clicked at all, `submissions&role=creator` — the very one
  v13 added — among them, while the run still exited 0. Both passes now share a
  `settledControlCount` helper that waits for two equal consecutive samples.
  Quote the per-screen click counts from an actual run rather than a total:
  a total cannot show which screens contributed zero to it.

  **The v9-named hand-card preview overflow is fixed (v10):** the pinned preview
  clamps its card scale to the viewport and stacks the control column below the
  card under 520px, the way `Card3DInspector` clamps — so `✕ CLOSE` and INVOKE
  stay on-screen on a phone.
- **Accessibility pass.** Keyboard navigation, screen-reader labels for card
  actions, contrast audit of the monochrome theme. Partially underway — see the
  "Bug hunt / accessibility" entries in `CHANGELOG.md`. The viewport meta in
  `index.html` already refuses to break pinch-zoom; the rest of WCAG has not
  been walked.
- **One balance pass per release, against the findings doc.** The whole live
  list is `docs/BALANCE_SIM_FINDINGS_v17.md` carry-forward. The v17 pass
  spent both scheduled v16 levers: Sentinel's minus went -2 → -3 (down 2-6
  points, no longer first everywhere; Resolve 5 → 4 is the named next lever
  if it still tops 3+ cohorts on a fresh baseline) and Avatar's -4 walked
  back to -3 (out of the cellar to mid-field on all four cohorts — closed).
  The bottom cluster is now Sovereign of the Dying Star and Void Mother;
  Sovereign has never had a dedicated look and is next in line after one
  watch pass. Standing rules that should not be relearned: **four deck
  cohorts, not two** (two cohorts cannot see a keyword with fewer than ~6
  carriers), and **never interleave content changes with balance trials in
  one pass**.

  **The Leader re-baseline debt is paid.** v8.0 (Resolve cap) and v11 (CPU
  combat model) had made every earlier Leader and keyword reading stale;
  every number in the v16 findings doc was taken fresh under both, on the
  three-deck suite. Pre-v16 Leader tables are historical only — do not
  compare against them without saying so.

- **A live-vs-code drift guard that actually gates.** v13 found the database's
  `cards.essence_cost` one generic higher than the shipped `cardpool.ts` on 16
  cards — `apex_nanite_shinobi`, `astral_shoal`, `cruel_effervescence` and 13
  others — because a balance pass moved `COST_ADJUST` in code and nothing ever
  re-ran `db:sync`. Everything else (rarity, type, keywords, stats, subtype,
  rules text) matched exactly, which is what makes it the dangerous shape of
  drift: invisible in the game, wrong in `pick_deck_bucket`'s cheap-first
  ordering and in every server-side price. Fixed in place, but the guard that
  should have caught it (`verify:pool`) is a manual command nobody is obliged
  to run. Either CI runs it with a Supabase key, or `db:sync` becomes part of
  the release checklist and the checklist becomes a file.

- **Make CI's own gate un-skippable.** This is now a three-time finding, not a
  bug: v7.9 found CI red on `main` for ten runs, fixed `format:check`, and the
  very merge that shipped that fix put `format:check` red again on five files.
  Nothing in the loop runs Prettier before a merge, so hand-patching the
  formatting is a treadmill. The fix is tooling — a pre-commit hook, a
  `format`-on-save contract, or a CI step that pushes the reformat instead of
  failing on it. Cheap, and it retires a recurring class of red build.

## Next — the things players will notice

Ordered by how much they change what it feels like to own and play the game.

- **Persistent match history and replays.** Store per-match logs; let players
  review past games. The engine already emits a structured event stream (the
  sim harness consumes it), so this is storage and a viewer, not new game code.
  It is also the prerequisite for anything competitive: a ladder without
  replays is unauditable.
- **ELO-tracked CPU gauntlet.** A ranked-style ladder against the CPU, as the
  stepping stone to real matchmaking. Blocked on nothing; wants match history
  first so a rating has evidence behind it.
- **Volume #2.** The content pipeline supports further drops on top of the live
  297-card pool. The v7.7 rule bites here: a new set is a **content** change, so
  it lands in its own pass, the pool re-baselines, and only then do balance
  trials resume. The v7.6 Glaciate result was erased exactly this way.

  Two pieces of this got built early by the v12 submission work and are worth
  reusing rather than rediscovering: **(1)** the Creator's `BULK ADD` panel
  takes a JSON array or a `name | type | rarity | image url | flavor` paste,
  derives each card's mechanics with the same `cardpool.ts` code the client
  runs, and writes all sixteen `cards` columns in one call — which is the whole
  of "import a set" minus the art; **(2)** every `pack_types` row now pins its
  own `allowed_sets`, so a new set no longer silently re-weights the packs that
  already shipped. Before v12 every pack row had `allowed_sets = null`, which
  `grant_pack_contents` reads as "draw from the entire table" — Volume #2 would
  have appeared inside Volume #1 boosters on the day its first card landed.
- **Custom fonts as first-class assets.** Currently two Google Fonts pulled at
  runtime by an `@import` at the top of `src/index.css` — a third-party
  request on first paint and a hard dependency on a CDN. Two things worth
  doing, in order: **(1)** self-host the two existing faces as `.woff2` under
  `src/assets/fonts/` with `@font-face`, which Vite fingerprints and bundles —
  removes the CDN round-trip and makes the app work offline; **(2)** let a
  theme name a font the way `src/meta/themes.ts` already names a palette, so a
  set or a cosmetic can ship its own display face. (2) is the one that wants a
  Supabase Storage bucket, since the point is swapping faces without a
  redeploy; it needs a public bucket with CORS and a `crossorigin` attribute,
  and a licence check that the face permits webfont embedding.
- **Deck archetype guidance in the builder.** The sim knows a great deal about
  what makes a deck work (`archetypes`, `essenceCurve`, `costTiers`,
  `colorMatchups`) and the deck editor tells the player none of it. The
  cheapest large win in the meta game.

- **Three economy/product calls left open by the bug hunts.** All are decisions
  rather than defects, which is why none has been patched unilaterally:
  - **Packs never apply the per-rarity copy cap, and roughly a screen's worth of
    UI is waiting for them to** (found v12). `PackPull` documents
    `converted_to_credits` / `credit_value` as "past the player's per-rarity
    copy cap — no card was granted, it was auto-converted to credits instead",
    and `PackOpening.tsx` branches on it in fifteen places (dimmed tile, the
    "+N CREDITS" plate, the summary's converted count, the sell-value maths).
    `grant_pack_contents` does none of it: `rarity_copy_cap` is called from
    exactly one function in the whole database (`save_deck`), the pack grant
    always inserts the card, always reports `converted_to_credits: false`, and
    `credits_gained` is hard-wired to 0. So a player can own five Mythics they
    can only ever play one of, and every one of those UI branches is dead code.
    Wiring it up is a real payout change (duplicates above the cap stop being
    cards and start being credits), which is why it is a call and not a patch.
    The cheap alternative is to delete the plumbing and the type fields.
  - **The bounty shop's round trip is a guaranteed profit.** `buy_bounty_card`
    charges 3x a card's base sell price and `sell_bounty_card` pays 5x, and the
    buy/sell block is _same-day only_ (`player_bounty_activity` is keyed on
    `bounty_date`). So buying a bounty card today and selling it on any later
    day the same card recurs in the list is a risk-free +2x, bounded only by
    the three-sales-per-day cap — up to roughly 18,000 credits a day on a
    Mythic. `ensure_daily_bounties` picks deterministically per date from each
    rarity band, so recurrence is certain given enough days. Options: make the
    "bought" record permanent per card rather than per day, price the buy above
    the sell, or accept it as an intended slow faucet. Wants a decision, not a
    guess.
  - ~~Guest quick match is still unreachable~~ (found v7.9) — **resolved in
    v17 by enabling it**: guests pass the PLAY gate and get the random-deck
    QUICK MATCH branch that was written for them (the Auth screen's PLAY AS
    GUEST button has advertised exactly this since it shipped). Non-creator
    ACCOUNTS keep the COMING SOON tile while CPU battles are finished.
  - **The sell-reservation model is not the same across surfaces** (found v9).
    `sell_bounty_card` (the authoritative server) and the bounty tile's client
    gate treat a deck lock and a Serialized-print reserve as _independent_
    checks: one physical copy can satisfy both, so a player holding two copies —
    one Serialized, one deck-locked — can sell down to one. The other four sell
    surfaces (Collection, Marketplace, Player Shops, Social) treat them as
    _additive_ (that player sees zero sellable). Both are defensible; the game
    should pick one. If additive is correct, the RPCs (`sell_bounty_card`,
    `quicksell_cards`, `assert_cards_available`) are what enforce it and so are
    where the change belongs. A clean fix also wants `get_daily_bounties` to
    return the quantity/foil split so the bounty tile can mirror the server
    exactly instead of guessing from a combined `owned`.

## Later — needs a foundation first

- **`Alt-Art` is a fully-plumbed rarity with no cards behind it** (found v11).
  It sits between Full-Art and Mythic in `RARITY_ORDER`, `rarity_tier`,
  `rarity_copy_cap` (1), `card_sell_price` (1800) and `QUICKSELL_PRICES`; it has
  a card template (`isAltArt` → the "Prism Ink" holo wash), a chip colour, a
  glow and a border. `select rarity, count(*) from cards` returns **zero**
  Alt-Art rows, and no live `pack_types.slot_config` weights it, so no player
  can ever obtain one. Nothing is broken today — every code path degrades
  cleanly — but the tier is either a Volume #2 deliverable (print the alternate
  arts, add the pack weight) or dead plumbing to strip. It belongs here rather
  than in "Now" because printing Alt-Art is a content change and takes the
  content-change rule with it. Note `random_card_of_rarity`'s ladder falls
  DOWNWARD, so an Alt-Art roll would silently pay out a Full-Art until the rows
  exist.

- **The attacker's own-clash reaction window is served non-interactively in the
  UI** (found v10). The rulebook opens a reaction window to _either_ player after
  guards are set, and the engine and the sim CPU both use it — but in a real
  match the match view only serves the window one direction. When the human
  attacks and the CPU answers with a reaction, priority comes back to the human
  and `reactionPlays` is called outside `playTurn`, so `yieldPriority` is
  undefined and the stack force-drains without ever opening the human's respond
  bar (`GameV4.tsx` `declareMyAttack`); and the CPU's own post-guard reaction
  window (`ai.ts` `playTurnBody` → `reactionPlays`) is unreachable because the
  UI's `resolveCpuClash` calls `resolveClash` directly and never runs it. Both
  are latent today — the instant-speed pool is removal/Ambush only, so ordering
  rarely changes an outcome — but the moment a counter- or fizzle-relevant
  instant is printed, the human denial is game-losing. The honest fix is to route
  both clash-reaction windows through the same priority hand-off the rest of the
  response system uses, which is the same plumbing the server-authoritative PvP
  work has to build; parking it here rather than bolting a second ad-hoc window
  onto the client reducer.

- **Multiplayer (PvP).** Requires a server-authoritative engine; design spike
  is in `docs/PVP_DESIGN.md`. Real blocker is that `engine.ts` is a
  client-side pure reducer with no notion of hidden information across a wire.
  Match history and replays are the honest first step toward it.
- **Leader keywords.** Leaders have three (Commander, Resolute, Warlord) where
  every other type now has six or seven. `roll(seed, 'ldr-kw6', 6)` has no free
  band, so any addition re-rolls all nine existing Leaders and invalidates every
  per-Leader adjustment in `cardpool.ts` at a stroke — the same trap the v7.3
  colour-pair note and the v7.5 `V75_KEYWORDS` split both record. Needs the roll
  restructured onto its own band first, then a balance pass.
- ~~Raise the Unit cost ceiling for keyword surcharges~~ — **shipped in v16**
  (surcharge charges in full above the base cap, ceiling 9), together with the
  v9 "Unbreakable's save heals marked damage" item: the save now leaves the
  unit at the brink (Grit − 1) instead of fully healed, which honoured the
  rulebook without the packet-level combat refactor this file predicted. The
  keyword itself is once per game and, for the first time, reads in band. See
  `docs/BALANCE_SIM_FINDINGS_v17.md` (v16's doc superseded and deleted).
- ~~Make the pinned Leader suite the primary Leader instrument~~ — done in
  v7.8 (random table demoted to a deck-composition diagnostic) and finished in
  v16: the suite runs three pinned decks per Leader and reports the per-deck
  spread, so a kit reading and a deck-luck reading are no longer the same
  number.
