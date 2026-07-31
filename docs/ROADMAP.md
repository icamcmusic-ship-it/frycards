# Roadmap

Prioritized direction for Frycards. Items move to `CHANGELOG.md` when shipped.

Rewritten in v7.7. The previous version had drifted into being a copy of the
balance doc's carry-forward list with the product work pushed to the margins —
nine of its thirteen items were individual card and keyword numbers that go
stale every pass. Balance now gets **one** entry here that points at the
findings doc, which is the thing that actually tracks it, and the rest of this
file is about the game.

Three horizons, and each item says what it is blocked on rather than only what
it is.

---

## Now — finish what is half-built

Everything here has a started implementation and a visible seam.

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
  list is `docs/BALANCE_SIM_FINDINGS_v7.7.md` carry-forward. Top of it is
  `Unbreakable` and the cost cap, which is the first keyword-mechanism item the
  project has had rather than a per-card one. Standing rules that came out of
  v7.7 and should not be relearned: **four deck cohorts, not two** (two cohorts
  cannot see a keyword with fewer than ~6 carriers), and **never interleave
  content changes with balance trials in one pass**.

  **The next pass owes a Leader re-baseline before anything else.** v8.0 capped
  Leader Resolve at its printed value — it had been unbounded, and the CPU
  builds Resolve most turns it has nothing better to do, so _every_ Leader
  reading taken before v8.0 was taken against Leaders that were harder to
  shatter and firing their `-N` abilities more often than the cards print. That
  includes v7.7's pinned-suite numbers and its Kuro cost cut. Treat the
  pre-v8.0 Leader table as stale rather than as a baseline to compare against.

  **v11 moved the CPU's combat model, so it owes a re-baseline too.** Three
  numbers the CPU decides from were wrong against what the engine actually
  deals: an unguardable Doublestrike attacker's face damage was counted once
  where the engine deals it twice, neither the attack model nor the guard model
  subtracted the defender's Bulwark Sanctums, and the engine itself carried
  Overrun's guard absorption across both clash sub-steps. The first two make the
  CPU attack and block differently on any board with a Doublestrike or Bulwark
  card in it (two and three carriers respectively), so every keyword reading
  taken before v11 was taken against a CPU that misjudged those boards. Do not
  compare a v11+ carrier delta against a pre-v11 one without saying so.

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

- **Two economy/product calls left open by the bug hunts.** Both are decisions
  rather than defects, which is why neither has been patched unilaterally:
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
  - **Guest quick match is still unreachable** (found v7.9). `PlayScreen` has a
    guest branch and `MainMenu` gates every other tile on `guest`, but `App`'s
    `case 'play'` requires `profile?.role === 'creator'` and a guest has no
    profile — so the whole branch plus its comments is dead code. Enabling it
    vs. deleting it is a product call.
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

- **Unbreakable's save heals marked damage instead of only preventing the
  packet** (found v9). `stateBasedChecks` catches a lethal Unbreakable unit and
  sets `u.damage = 0`, so a wall carrying pre-existing marked damage that then
  survives a lethal hit walks away fully healed. Rulebook §8 prevents the
  _incoming packet_, not the marked damage already on the body. A correct fix
  can't be done at the state-based check, which no longer knows the packet size —
  it means moving Unbreakable's prevention into `damageUnit` (packet-level),
  which changes combat's simultaneous-damage sequencing and so is a combat
  refactor, not a one-liner. Belongs with the clash-math work, behind a balance
  pass, since it makes the most expensive keyword in the pool strictly weaker.

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
- **Raise the Unit cost ceiling for keyword surcharges.** The v7.7 top
  carry-forward, listed here as well because it is a **rules** change and not a
  number: three Unbreakable bodies all print at the cost cap of 7, so the pool's
  heaviest keyword weight is only partly collected, and no per-card lever can
  reach them. Fixing it means the cap stops being a silent balance ceiling —
  which touches the printed cost of every expensive keyworded Unit, so it is a
  content-scale change that needs its own pass.
- **Make the pinned Leader suite the primary Leader instrument.** v7.7 found
  its decks had been re-rolling with the cohort seed since v6.2, which is why
  four passes of random-cohort Leader readings disagreed with each other. Now
  that it is fixed and stable to within a point across cohorts, the random-deck
  Leader table should probably be demoted to a deck-composition diagnostic
  rather than the number Leader balance is judged on.
