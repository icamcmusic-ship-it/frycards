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
  - **`db:sync` still needs direct network access to Supabase**, so it does not
    run from a sandboxed CI/agent session. `verify:pool` no longer has that
    excuse: **v20 gave it `POOL_SNAPSHOT`**, which runs its identical checks
    against a JSON export of `public.cards` (the header carries the SELECT).
    Use it — a drift guard that cannot run where the work happens is a drift
    guard that runs late, and this one had not run since v17. When it was
    finally run in v20 it found `cards.essence_cost` for
    `sovereign_of_the_dying_star` still at the pre-v18 price, TWO passes after
    the reprice shipped, while v18 and v19 both carried "no shipped change
    touches a `cards` column" as the reason not to worry. One drift in 297
    cards, invisible in the game and wrong in every server-side price.
    **Closed in v23**: the live row is corrected and `verify:pool` passes with
    full parity against a fresh 297-row snapshot — see
    `docs/BALANCE_SIM_FINDINGS_v23.md` "Closed this pass".

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

  **v20: that stub covered the context, not the screens.** `MetaState` holds
  seven things; everything else a screen shows it fetches for ITSELF on mount,
  and offline those calls fail. So Battle Pass (1 control), Marketplace (4),
  Friends (5), Missions (4), News (3) and Player Shops (8) were measured as
  empty states for eight passes while the audit printed a clean pass — one of
  those "controls" is the BACK button. `src/preview-fixtures.ts` answers those
  reads offline and the same six now measure 28 / 51 / 11 / 7 / 2 / 13. Two
  standing rules fall out of it: **a screen whose control count is in single
  digits is a screen that is probably not being measured**, and a new fixture
  must carry the FULL row shape — the first run crashed the mystery-pool viewer
  on `pool.rarities` being undefined, which is a fixture defect that looks
  exactly like a product one.

  **v22 found the same hole one flow deeper.** The sweep measures a screen's
  visible controls, and `pack` has exactly one before the pack is torn — so the
  card-by-card reveal and the summary, the two screens a player sees after
  EVERY pack they open (where the foil treatments, the rarity plates and the
  sell-value maths all live), had never been measured at any width. The
  depth-two sweep cannot reach them either: it clicks one control and measures
  what OPENED, and a tear button advances rather than opens. `PRELUDE` entries
  in `audit-meta-screens.ts` drive a screen into a deeper state by button LABEL
  before the sweep begins; `pack@reveal` and `pack@summary` are the first two,
  and both measure clean at 375 and 1280. The general rule that falls out:
  **a screen the player passes THROUGH is not the screen they stop on**, and
  the control count only ever describes the former.

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
  list is `docs/BALANCE_SIM_FINDINGS_v23.md` carry-forward. **v19 froze the
  per-Leader levers pending a widened instrument; v20 widened it; v22 measured
  the caution flag those readings were being filtered through and retired it as
  a gate; v23 met Mer-King's restated condition on eight cohorts (the lever is
  authorized for the next no-content pass, and ONLY there) and closed the
  Ruin-Walker divergence as a persistent lemon deck in the instrument, not a
  weak kit. Those results are the most important thing on this page.**

  The pinned Leader suite gave each Leader three decks — and all three were the
  SAME RECIPE with different jitter seeds. `randomArchetype` varies four things
  per deck (a 2–3 keyword subset, a 1–3 effect subset, 32–40 units, 4–6
  sanctums); the pinned builder varied none of them. So the pinned arm was
  measuring one archetype, not a kit across deck-space. v20 rebuilt it as
  **nine decks on nine recipes** sampling those same axes, still seeded on the
  Leader id alone.

  **Sentinel of the Nether Pit went 61.9 / 60.7 / 58.0 / 61.6 → 43.5 / 44.0 /
  43.1 / 48.6** — first in all four cohorts for four passes, nerfed three times
  for it, and near the bottom once the suite samples real decks. Its
  pinned-vs-random gap collapses from a one-signed +18.1 mean to +2.5. Void
  Mother comes off the floor and its cancelled rework stays cancelled. **Do not
  re-derive the three spent Sentinel levers, and do not "restore" them on the
  strength of the new table either.**

  The corrected instrument's own answer is **Mer-King** — first in all four
  cohorts at a 65.2% mean, nine clear of second, and the only Leader whose
  random arm agrees on the finish. v20 left it unspent behind a pre-registered
  condition, and **v22 ran that condition and found it unreadable.**

  v20's gate was "first in 3+ cohorts AND a random-arm gap under +10 in the
  cohorts that sample it". Mer-King is now first in **six of six** (mean 65.6%,
  9.8 clear) — but the `|gap| >= 10` half cannot decide anything, because
  across 51 gap observations that flag **fires on 24% of them**: median |gap|
  5.0, max 18.6, six of nine Leaders tripping it at least once. It sits at the
  ~76th percentile of its own distribution. **Retired as a gate; it stays in the
  report as a per-cohort eyebrow-raise and no decision rule should be phrased in
  terms of it again.**

  What the v19/v20 diagnoses actually keyed on is a **one-signed** gap across
  cohorts, and on that test Mer-King is clean (+3.5 / +11.2 / +12.0 / +9.5 /
  −3.3, and its random arm reads above 50% in every cohort that samples it — the
  two arms agree). **Exactly one Leader in the pool is one-signed: Ruin-Walker
  Overseer** (−8.2 mean, negative in all five sampling cohorts, last in the
  pinned table in five of six). That is the Sentinel finding inverted — the
  suite appears to be UNDER-rating it — and per the Sentinel lesson the next
  move is to understand the instrument, **not to buff the card.**

  Standing rules that should not be relearned: **four deck cohorts, not two**
  (two cohorts cannot see a keyword with fewer than ~6 carriers) — but **six
  when the question is about one specific Leader**, since v22's sign flip lived
  in the sixth cohort alone and the cohorts cost thirty seconds each; **never
  interleave content changes with balance trials in one pass**; **do not spend a
  lever against a one-pass-old instrument** — that is the mistake the last four
  passes made in the other direction; and **a harness that cannot measure
  something must say so where it would have printed the measurement**. That last
  one is now a three-time finding, not a coincidence: v14's "clicked 0 controls",
  v20's six meta screens audited empty, and v22's divergence report printing no
  row at all for a Leader the random arm never dealt — which in cohort D was
  Mer-King, the Leader the whole table was pointing at.

  **A lever that measures flat gets reverted, not shipped.** v18 is the
  precedent: the named next lever was spent because the doc said to, produced
  no movement in the win rate OR the mechanism it was supposed to act on, and
  was reverted with the measurement recorded in the override table. Spending a
  scheduled lever is an experiment, not a commitment to print its result.

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

- ~~**The attacker's own-clash reaction window is served non-interactively in
  the UI**~~ — **resolved**, and noticed still-open here in v20's flow audit.
  Both directions now route through `runCpuClashReactions` in `GameV4.tsx`,
  which installs the same `onOpponentPriority` pause contract `playTurn` uses:
  a CPU reaction the human can answer THROWS, the response window opens, and
  its close re-enters `reactionPlays` where it left off. `resolveCpuClash` runs
  it too, so the attacking CPU gets the post-guard window the sim always gave
  it. Left below as written for the history — the diagnosis is still the
  clearest description of what the seam was.

  The original entry (found v10). The rulebook opens a reaction window to _either_ player after
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
- **Leader keywords.** Leaders have three printed keywords (Commander,
  Resolute, Warlord) where every other type now has six or seven. The v7.8
  restructure froze the 'ldr-kw6' path and gave future generations their own
  band (`LEADER_NEXT_KEYWORDS` / 'ldr-kw-next'), and **v23 implemented the
  generation**: Onslaught (Ember), Beacon (Light), Dread (Void), engine-tested
  (`keywords-v23-leaders.test.ts`) and listed in `UNPRINTED_KEYWORDS` — in the
  registry, absent from the pool and the player-facing glossary. What remains
  is the PRINT, and it is a content decision with a known shape: the
  'ldr-kw-next' band only reaches keyword-less Leaders, which today is exactly
  Sentinel of the Nether Pit (→ Onslaught, on-colour); Beacon/Dread need a
  per-Leader grant. A measured two-cohort preview of that print — all three
  playable, none degenerate — is in `docs/BALANCE_SIM_FINDINGS_v23.md` §5.
  Do not interleave the print with a balance lever.
- ~~Raise the Unit cost ceiling for keyword surcharges~~ — **shipped in v16**
  (surcharge charges in full above the base cap, ceiling 9), together with the
  v9 "Unbreakable's save heals marked damage" item: the save now leaves the
  unit at the brink (Grit − 1) instead of fully healed, which honoured the
  rulebook without the packet-level combat refactor this file predicted. The
  keyword itself is once per game and, for the first time, reads in band. See
  `docs/BALANCE_SIM_FINDINGS_v23.md` (each pass's doc supersedes and deletes the last).
- ~~Make the pinned Leader suite the primary Leader instrument~~ — done in
  v7.8 (random table demoted to a deck-composition diagnostic), extended in
  v16 and finally made honest in **v20**, where the three "pinned decks" turned
  out to be one recipe rolled three times and became nine decks on nine
  recipes. It reports the per-deck spread and median, so a kit reading and a
  deck-luck reading are no longer the same
  number.
