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
  still deliberately _not_ done is a decision each, not a defect:

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
  cost, colour and keywords are byte-identical — but the _subtypes_ are not a
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

  **v28 finally ran the first of the three things this item has called
  unmeasurable since v11.** "Tap-target sizes, text scaling, and real-device
  scroll/keyboard behaviour" has been the standing description of what is left,
  and the first of them is a geometry check after all — it just is not the
  geometry the sweep was doing. `audit:screens` measures every visible control
  against WCAG 2.5.8 (AA)'s 24x24 CSS px minimum now, counting a `.tap-target`
  pseudo-element's expansion where one is present, and the first run returned
  **1,300+ undersized controls across nine screens**. Almost all of them were
  one shape and it was a real bug rather than a cosmetic one: a card face's
  keyword chips and cost pips are their own tap targets, they measure as little
  as 22x9 on a small card, and they sit ON TOP of the card whose own tap is the
  game action — so on a phone, aiming at a battlefield unit opened a glossary
  popover instead of selecting an attacker. Fixed at the tier level (chips are
  painted, not pressed, below `full`) plus nine individually undersized
  controls — and then the DEPTH-TWO sweep found 150 more in states behind a
  click (the Grading Lab's basket steppers, the Creator queue's art link, seven
  browser-default checkboxes, the in-sentence keyword mentions). All 27 entries
  now measure zero at both depths.

  **One class is exempted rather than fixed, and it is declared.** An
  in-sentence keyword mention sits inside a `-webkit-line-clamp` box whose job
  is to bound the paragraph, so it cannot be grown at all — WCAG 2.5.8's inline
  exception, marked on the element rather than inferred from `display`, with
  the exempted COUNT printed on every run so the carve-out stays visible.

  **The lesson the fix taught is worth more than the fix.** The first version
  grew every chip's hit area with a `.tap-target` pseudo-element and the check
  went green — because the check was reading the DECLARED expansion.
  `overflow: hidden` clips hit-testing as well as painting, the card face clips
  its chip row and its rules paragraph to hold a height budget, and inside one
  of those a declared 24x24 is 22x14 in the hand. The check intersects the
  expansion with every clipping ancestor now. **A geometry check that reads a
  CSS declaration rather than a resulting rectangle will certify the utility
  that was supposed to fix the finding** — which is the same failure this file
  has recorded three times in other clothes.

  **v29 measured the second of the three, and the prediction was wrong in the
  useful direction.** `audit:screens` now runs a WCAG 1.4.4 pass — the browser's
  own font-size preference, doubled, through Chromium's `Page.setFontSizes` —
  plus a WCAG 1.4.10 reflow load pass at 320px. The expectation going in was a
  clean sheet and a near-zero number: this game sizes its type in `px`, and px
  does not move under that setting in any browser. The number came back **40%**,
  because the app is MIXED — Tailwind's named sizes (`text-sm`, `text-xl`) are
  rem and grow, its arbitrary `text-[10px]` ones do not, and both sit in the
  same rows. So at 200% a row's label doubles while the thing beside it does
  not, and **ten states across nine screens pushed off the side of a phone**:
  four fixed-rem search boxes, four rows of controls that could not wrap, the
  How to Play definition grid, and the Showroom's search field. All fixed; the
  overflow half is gated on every run, the percentage is printed rather than
  gated (there is no right value for it — a design may legitimately fix some
  type in px — and what matters is that the number MOVES).

  The reflow pass at 320px came back clean everywhere, first time.

  **The match board got the same treatment from the other harness, and it found
  the worse bug.** `drive:match` now drives one match at 200% text and one in
  phone LANDSCAPE (844x390), and measures a thing the meta sweep cannot: the
  board's root CLIPS rather than scrolls, so a control that no longer fits is
  not pushed off the edge, it is deleted in place. In landscape, at the default
  font, **twenty controls were unreachable** — the player's own Leader,
  INVOKE LEADER, the ash-pile and every card in hand. Fixed by letting the root
  scroll when and only when it has to (`overflow-y-auto`), which changes
  nothing on a viewport that already fits.

  **What is still genuinely unmeasured is real-device behaviour — one of
  three.** Scroll momentum, the software keyboard, and what a real thumb does to
  a 24px target are not things a headless Chromium can answer.

  What the geometry sweep found: **nothing**. All sixteen screens render at 375px
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
  read as having _no_ controls and skipped at index 0 — which prints as
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

- **The match driver's control census is a report; the next pass should make it
  a gate** (new in v29). Every stress round before this one grew `drive:match`
  by adding an action somebody had noticed it never took — SKIP until v19,
  RE-BOND until v22, the VICTORY screen until v26 — which is a coverage
  instrument made of one person's attention. The driver reads the whole board
  on every step, so it already knows every control the match OFFERS; it now
  counts which ones it ever PRESSES and prints the difference. The first run:
  **360 distinct controls, 306 never pressed** — two thirds of that being the
  census wrong about itself (card wrappers, `display:none` panels, labels that
  embed their own state), and the rest real. v29 taught the driver the ones it
  could reach and left ~60 rows, so the count is deliberately NOT part of the
  exit code: a coverage row is a gap in the harness, not a defect in the game,
  and folding the two into one number says "the match is broken" when what is
  true is "the driver is not finished". **Close the list by pressing the
  controls, never by widening `CENSUS_EXEMPT`,** and make it gating when it is
  short enough to hold.

  **v30 worked the list and it is still not a gate.** Two thirds of the
  remainder was the census wrong about ITSELF again, in three shapes that are
  all the identity rule v29 wrote for card faces arriving through a different
  door — *a label that describes the board's current contents is not the
  control's name*. A clash line keys on its matchup, the narration bubble keys
  on the beat inside it, and a Location tile keys on the card standing in it,
  so one divider button, one bubble and one tile arrived as forty-odd distinct
  rows nobody had pressed. Three `data-*` hooks (the same convention as
  `data-card-id`, `data-tip`, `data-primary`) and the census went from **269
  distinct controls to 80**, and the never-pressed list from 44 rows to 16.

  The rest was real, and two of them were the census earning its keep: the `⏱`
  speed control (948 offers, 0 presses — the driver clicks by visible text and
  the narration bubble CONTAINS the speed button, so every click since v20 has
  landed on SKIP) and the Leader's ability pills (560 offers, 0 presses — the
  branch selected `[role="button"][aria-disabled="false"]`, which a `CardFace`
  with an `onClick` also matches, and matches first). Both had been believed
  exercised for thirteen passes.

  **Still not a gate, and the reason is worth writing down rather than
  exempting away.** Some of the remaining rows are controls the driver
  deliberately does not press because pressing them is bad play — a manual
  Location tap wastes the Location for the rest of the turn, which v20 cut to
  2% for exactly that reason. v30 presses those in MAIN II, where the waste
  costs nothing (the Location recovers at Dawn either way), and that is the
  shape the remaining rows should be closed in: find the state where the action
  is free, rather than raise the probability of taking a bad line.

- **Accessibility pass.** Keyboard navigation, screen-reader labels for card
  actions, contrast audit of the monochrome theme. Partially underway — see the
  "Bug hunt / accessibility" entries in `CHANGELOG.md`. The viewport meta in
  `index.html` already refuses to break pinch-zoom.

  **v30 walked the keyboard half, and it was the first non-pointer axis this
  project has ever measured.** Everything before it — overflow, the 24x24
  minimum, reflow at 320px, text at 200% — is about a finger or a thumb. Both
  sweeps press the real Tab key now: `audit:screens` walks every meta screen
  and `drive:match` walks the live match board and its dialogs, against WCAG
  2.1.1 (Tab reaches every enabled visible control), 2.4.7 (it draws a ring
  when it gets there) and 2.1.2 (focus is never stuck). Neither reports "clean"
  out of a walk that stopped early: a walk that did not complete a full focus
  cycle inside its press cap is reported as UNMEASURED, which is this file's
  own standing lesson applied to a new instrument on the day it was written.

  **The first run found that all fifteen modals leaked the keyboard**, on a
  comment copied between them since v4.24 claiming they did not — Tab out of
  the mulligan dialog landed on the match board's ✕ CONCEDE. `useFocusTrap` is
  the one hook that holds it and a test scans for the next dialog that ships
  without it. Two dialogs can be open at once, so trap ownership is decided by
  DOCUMENT ORDER (the last dialog in the DOM is the one painted on top);
  deciding it by mount order was wrong and produced a board where Tab did
  nothing at all.

  What is left of this item is the part a Tab key cannot answer: **contrast**
  (WCAG 1.4.3/1.4.11 — and the monochrome theme is the whole point of the
  design, so that measurement probably wants a declared exception list rather
  than a fix list), **screen-reader semantics beyond labels** (v30 gave the
  opponent's narration beat a live region — the turn SUMMARY had one since v26
  and the moves inside it did not — but nothing here has ever been run through
  an actual screen reader), and **real-device behaviour**, which has been the
  standing third of three since v11.
- **One balance pass per release, against the findings doc.** The whole live
  list is `docs/BALANCE_SIM_FINDINGS_v23.md` carry-forward. **v19 froze the
  per-Leader levers pending a widened instrument; v20 widened it; v22 measured
  the caution flag those readings were being filtered through and retired it as
  a gate; v23 met Mer-King's restated condition on eight cohorts (the lever is
  authorized for the next no-content pass, and ONLY there) and closed the
  Ruin-Walker divergence as a persistent lemon deck in the instrument, not a
  weak kit. Those results are the most important thing on this page.**

  **v28 closed the Ruin-Walker item and revoked the Mer-King lever, and the
  reason for both is the same one number.** The pinned suite gives every Leader
  nine decks on nine recipes (v20's fix). It had never been asked whether the
  NINE matter. `PINNED_RECIPE_SALT` re-rolls recipes #1..#8 without touching a
  card, a weight or the engine, and across two independent draws — 47,616 games
  each, every cohort reproducing to the decimal — the suite's Leader ranking
  correlates at **Spearman rho = 0.417**. Legendary Diver and Ruin-Walker each
  move four places; Ethereal Sea Witch moves five. So: Ruin-Walker's one-signed
  negative gap loses its sign under both the re-roll and v27's own pre-
  registered lemon-exclusion test, settling at -6.0 either way — **item closed,
  no card touched**. And Mer-King's lever, authorized since v23 on "first in
  every cohort, nine clear of second", is second on the other draw, 5.1 behind
  a Leader the first draw ranked below it — **authorization withdrawn**. The
  standing rule that falls out is short: **two draws, always, for anything
  about a Leader.** Everything below this paragraph predates that rule and
  every per-Leader number in it was read off a single draw.

  **v29 gave that rule an instrument and then a third draw, and retired the
  statistic underneath all of it.** The rule shipped with nothing to apply it
  with: the rho above was computed by hand from two nine-row tables assembled
  by hand out of sixteen reports, which is the exact situation
  `aggregate-cohorts.ts` exists to end for the sign table, one axis over.
  `scripts/leader-rank-stability.ts` takes N draws, labels each by its recipe
  salt, refuses a group whose reports disagree about it, and prints the
  cross-cohort mean, the rank, every pairwise rho, and each Leader's **rank
  RANGE** — which is the number the rule actually needs. On three draws
  (142,848 games) the triangle is **rho = 0.417 / 0.733 / 0.450**, and exactly
  three of nine Leaders hold their rank to within one place across all three:
  Mer-King, Avatar of the Abyss, Sovereign of the Dying Star. Everything else
  on that table is a reading of the decks.

  The one-signed gap test goes with it. Draw 1 flags Ruin-Walker (negative),
  draw 2 flags Avatar (positive), draw 3 flags **nobody**. A statistic that
  names a different Leader every time it is asked is not identifying a Leader:
  it is **retired as a standalone discriminator and kept as a filter**, and a
  case now needs the same Leader one-signed the same way in two independent
  draws. Nothing meets that bar today. Ruin-Walker, closed in v28, comes out
  4th of nine at 53.2% on the draw that had never seen the argument.

  **v26 re-opened the Ruin-Walker item, on eight cohorts.** Its
  pinned-minus-random gap is negative in EVERY cohort that samples it (−17.9 /
  −15.8 / −8.0 / −3.5 / −0.5 / −8.2 / −5.4 / −14.7, mean −9.3), including
  three on a game seed never used before — and one-signedness across every
  sampling cohort is the exact statistic v22 named as discriminating. The
  lemon recipe is still real (deck #1, 17.2% cross-cohort mean), but a lemon
  in one of nine recipes does not make a gap one-signed in eight of eight.
  This is a DECK-RECIPE question before it is a card question: re-roll
  Ruin-Walker's deck #1 recipe and re-measure before anyone touches a card.
  Full numbers: `docs/BALANCE_SIM_FINDINGS_v24.md` § v26 re-measurement.
  v26 also narrowed the `Sacred` item — one-signed positive across all eight
  cohorts, so the SIGN is stable and only the magnitude (+0.1 … +10.3) is
  cohort composition; a pass quoting a double-digit Sacred delta off a single
  cohort is quoting its deck roll.

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

  Standing rules that should not be relearned: **two recipe draws for anything
  per-Leader** (v28 — cohorts vary the game RNG and the random arm's decks, and
  for eight passes nobody noticed they never varied the pinned arm's; v29 gave
  the rule an instrument, `scripts/leader-rank-stability.ts`, and a third draw
  that retired the one-signed gap test as a discriminator);
  **four deck cohorts, not two**
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

- **The Showroom wants a reason to be open.** v27 built the room
  (`ShowroomScreen` / `Card3DShowroom`): full 360° yaw on a solid with real
  stock thickness, ±80° tilt, 0.35–3.2× zoom, momentum, auto-spin, and a
  distinct environment plus card effects for every rarity at Super-Rare and
  above. What it does NOT have yet is a reason to stay open, and each of these
  is a decision rather than a defect:
  - **No shareable pose.** The camera is not in the URL, so "look at this one
    from here" cannot be sent to anybody. `Pose` is already a plain
    `{yaw, pitch, zoom}` and `ShowroomSubject` a two-case union — this is a
    query-string encode/decode and a COPY LINK button, and it is the cheapest
    of the three.
  - **No capture.** A turntable nobody can record is a turntable nobody posts.
    The obvious version is a still (canvas or `getDisplayMedia`); the version
    people would actually use is a short looping GIF/WebM of one revolution,
    which wants an encoder in the bundle and is therefore a real decision.
  - **The showcase is not a shelf.** `profile.showcase_cards` already holds up
    to six cards, and the Showroom already renders one object at a time in a
    room. Standing all six in the same room — a display case a visiting player
    walks into from the Profile screen — is the feature the two halves are one
    step away from, and it is what would make the room a destination rather
    than a detour.

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
  - **Grading is a flat fee on a proportional payout, so it prints credits at
    the top of the rarity ladder** (found v26, by building the screen that
    shows the number). A slab quicksells at raw price × grade multiplier ×
    service premium, and the average grade multiplier is ×3.83 — so a TCA slab
    averages **×6.14 the raw card** for a flat 400-credit fee. On a Common
    (raw 10) that is a 339-credit loss and the mini-game is a hobby; on a
    Mythic (raw 3,000) it is an average +18,000 against the same 400, and
    quicksell is strictly dominated for every spare Mythic a player will ever
    own. Nothing is broken — this is exactly what v25 priced — but the v26 Lab
    now prints "EXPECTED BACK … (+17,000 vs fee)" on the pay bar, so the
    arbitrage stops being something a player has to work out and starts being
    something the screen recommends. The shape of the fix is the one real
    grading houses use: **a declared-value fee** (base + a percentage of the
    card's raw quicksell price), which leaves Commons cheap, makes Mythics
    expensive, and keeps the gamble intact at every tier. That is a payout
    change to a shipped economy, so it is a call and not a patch — recorded
    here rather than made quietly in a UI pass.
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
- **v24 Event keywords.** The same pattern one type over: v24 implemented
  Kindle (Ember), Tailwind (Gale), Luminous (Light) — the last colour holes
  any type carried — engine-tested (`keywords-v24-events.test.ts`) and listed
  in `UNPRINTED_KEYWORDS`. Printing them has a known shape too: the Event
  keyword roll's 76-100 band currently prints nothing, so a 76-92 band (used
  by the reverted v24 experiment, see `docs/BALANCE_SIM_FINDINGS_v24.md`)
  prints them upward-only without re-rolling any carrier. `freshKeywordFor`
  excludes `UNPRINTED_KEYWORDS` — deleting a keyword from that list without
  giving it its own band re-rolls every colour-fallback Event.
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
