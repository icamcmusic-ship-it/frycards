# Changelog

Product-level changes to FryCards (formerly "Shifting Multiverse TCG").
`docs/RULEBOOK.md` always reflects the CURRENT rules only (no changelog of
its own) — this file is the history of how it got there. A condensed
version of this history also powers the in-app Changelog screen
(`src/meta/ChangelogScreen.tsx`) — which, since v15, carries only the TWO most
recent entries. This file is the archive; that screen is not.

## Unreleased

### v32.0 — The fix that never moved the number

`engine.ts` carried this comment on the shipped first-mover compensation:

> The second player's bonus opening Wellspring enters EXHAUSTED: it ramps them
> into turn 2 rather than handing them a turn-1 tempo swing. A ready one
> measured far too strong (P1 41.9%, a 19-point overcorrection).

**The shipped code measures P1 at 41.9%.** The number the comment cites as the
failure state it corrected is the number it produces. Five independent seeds at
4 games/pairing, 24 decks, ~7,500 games each: 43.2 / 41.3 / 41.9 / 40.6 / 42.4,
mean 41.9%, one-signed across all five. The player on the draw wins 58.1% of
games — a 16-point swing, in a game whose whole compensation mechanism exists
to prevent exactly that.

Exhausting the bonus Wellspring was believed to have bought back a 19-point
overcorrection. Measured against its own alternatives, three seeds each:

| regime                            | P1 win % | error vs 50% |
| --------------------------------- | -------- | ------------ |
| no compensation (allowance 1)     | 67.2%    | +17.2        |
| allowance 2, bonus one **ready**  | 34.1%    | −15.9        |
| allowance 2, bonus one _exhausted_ | 42.1%   | −7.9         |

The true first-mover edge is +17.2 points. The bonus Wellspring is worth about
**25 points of swing**, and entering it exhausted buys back only ~8 of the ~33
the ready version was worth. The entry state was never the variable; the lever
was always too big, and exhausting it made it slightly less too big.

**What the variable is: permanence.** A "borrowed" variant — two Wellsprings on
P2's turn 1, none on turn 2, so the ramp arrives a turn early and then the
players are level forever — measures 66.6 / 67.0 / 67.9, statistically
identical to no compensation at all. The entire 25 points is the permanence,
not the timing. An extra Wellspring is a permanent +1 essence/turn, so it never
repays a tempo lead; it converts into a compounding ramp advantage that wins
the mid-game outright. Three things in the sim's own diagnosis agree and were
sitting there unread: the player on the draw invokes their Leader first in
**78%** of games (5,851 to 1,690) and wins when they do; P1's residual edge is
concentrated in SHORT games (30.2% at ≤10 turns, 37.5% at 11–20) while P2 is
ahead from turn 21 on (54.5%, 53.4%); and `vitalityDiffByTurn` shows the
even-turn swings compounding from −0.2 to −3.7 while the odd-turn ones stay
flat at +1 to +2.

That makes the lever binary — permanent is worth ~25 points, temporary is worth
0, nothing in between — so **v32 builds the in-between.** The bonus Wellspring
is permanent, and then it recedes: it **runs dry at the start of the second
player's turn 6** (`BONUS_WELLSPRING_DECAY_TURN`, handled at their Dawn). A
shallow spring that dries up, which is also a rule a player can be told; the
permanent invisible exhausted-on-entry state was not.

Sweeping the decay turn, three seeds × two independent deck draws, 24 runs:

| decay turn        | draw A | draw B | mean  | error |
| ----------------- | ------ | ------ | ----- | ----- |
| never (shipped)   | 42.1   | 43.1   | 42.6% | −7.4  |
| turn 5            | 51.5   | 52.3   | 51.9% | +1.9  |
| **turn 6**        | 48.5   | 49.4   | 48.97% | **−1.0** |
| turn 7            | 46.4   | 46.2   | 46.3% | −3.7  |

Turn 6 ships: a **7× reduction in error**, both draws agreeing, and the value
bracketed on both sides rather than being the first thing that worked.

Re-run on the five seeds the audit opened with, so the headline is directly
comparable: **49.0 / 48.4 / 48.1 / 47.8 / 49.5, mean 48.6%**, against 43.2 /
41.3 / 41.9 / 40.6 / 42.4, mean 41.9% before. The one-signed 16-point swing is
gone; what is left is a 2.8-point residual that no longer picks a side of 50
consistently.

**A note on what "two draws" means for this number, because the instrument for
it does not apply.** The standing rule since v28 is two independent recipe
draws for anything per-Leader, with `PINNED_RECIPE_SALT` as the instrument.
Run against `outcomes.p1WinPct` it produces **byte-identical results on every
seed** — not a weak signal, a no-op. The reason is structural: the pinned pair
suite runs through `seatSwapGame` and never touches `mech`, so `p1WinPct` is a
pure random-cohort statistic that the salt cannot reach. The axis that _is_
independent for it is `DECK_SEED` (argv[5]), which re-rolls the random arm's
decks, and that is what the two draws above are. Worth recording as a property
of the harness: **the salt is not a general-purpose second draw.**

#### The second bug: `wellspringAllowance` was never a precondition

Found while building the above, and independently real. `playWellspring` gated
on the cached boolean and consulted the allowance only afterwards, to decide
whether to close the gate:

```ts
if (state.winner || !inOwnMainClear(state, pid) || p.wellspringPlayedThisTurn) return false;
// ... pushes the Wellspring ...
p.wellspringPlayedThisTurn = p.wellspringsPlayedThisTurn >= wellspringAllowance(state, pid);
```

So the allowance could end a sequence of plays but never refuse one. Today that
is not exploitable — the allowance is only ever 1 or 2, and the boolean closes
correctly. **An allowance of 0 was unenforceable**: the first play of every
turn succeeded regardless, because the cached boolean starts false. This is how
it was found — a `return 0` in an experimental variant did nothing at all.

It matters for what comes next rather than for what ships: a Drought effect, a
land-lock keyword, a Location-denial Event, a mulligan penalty — anything that
wants an allowance of 0 would have silently no-opped **and passed its tests**,
because the rule function returns the right number while the gate ignores it.
That is the same failure the docs have now named three times in a different
costume ("a geometry check that reads a CSS declaration rather than a resulting
rectangle"): a rule function consulted for reporting rather than for
enforcement. The gate now reads the allowance:

```ts
if (p.wellspringsPlayedThisTurn >= wellspringAllowance(state, pid)) return false;
```

Verified behaviour-neutral before the balance change went in: the shipped
config with only this fix applied measures 43.2 / 41.3 / 41.9, byte-identical.

#### The largest number in the lapse report was mostly not a lapse

`lapses.guardDiesForNothing` read **12,778** on a 7,500-game run, an order of
magnitude above every other counter in the bag, while
`guardDiesForNothingDiscretionary` — the half that is actually a CPU error —
read 624. 95% of the headline is forced chump-blocking, i.e. correct play. A
lapse report whose biggest entry is mostly not a lapse invites exactly the
wrong conclusion, so the combined counter is gone from `lapses` and the forced
count sits beside the discretionary one instead. `guardTradeQuality` still
reports the combined figure, where the full four-way breakdown gives it
context. (`venomousSuicide` was checked the same way and is healthy: 1,638 of
which 1,567 deliberate, 95.7% — the CPU trades Venomous units correctly.)

#### Backend: a second door into the whole catalog, and eight functions off-convention

`supabase/migrations/20260828000000_grading_search_path_and_setless_draw.sql`,
shipped as a file and **not applied** — this pass does not touch production.

`random_card_of_rarity` is overloaded: `(p_rarity text, p_sets text[])` honours
the caller's set restriction and a legacy `(p_rarity text)` arm ignores sets
entirely. The README states the invariant this breaks — every `pack_types` row
pins its own `allowed_sets` precisely so a new set cannot silently re-weight
shipped packs — and the 1-arg arm cannot honour it, having nowhere to put the
restriction. Audited before dropping and it is unreachable today: the only
function in the database whose body mentions it is `grant_pack_contents`, which
calls the 2-arg form, and its ACL is `postgres`/`service_role` only where the
2-arg arm carries `authenticated`. Dead code that only becomes dangerous later,
which is the worst shape for this hazard. Dropped, with its body reproduced in
the migration so the drop is reversible from that file alone.

Eight `grading_*` helpers had no `search_path` set (`proconfig` null on all
eight, non-null on every other function in the database): `grading_base_fee`,
`grading_bulk_mult`, `grading_grade_mult`, `grading_roll`,
`grading_service_premium`, `grading_speed_mult`, `grading_turnaround`,
`grading_voucher_fee`. All SECURITY INVOKER, so the exposure is small, but
Supabase's own linter flags a mutable search_path and "every function but these
eight" is not a convention worth keeping a hole in.

#### Fonts: the render-blocking third-party request is gone

`index.css` opened with `@import url(https://fonts.googleapis.com/...)`, which
is the worst-case shape for a webfont: an `@import` inside a stylesheet
serialises the whole chain ahead of first paint — fetch the app CSS, parse it,
then DNS + TLS + fetch Google's CSS from a second origin, and only then
discover the `.woff2` URLs and fetch those from a third. Two extra round-trips
to two third parties before the first character can be painted, on every cold
load, and the cross-site cache that used to pay for it has been gone since
browsers partitioned the HTTP cache per top-level site in 2020.

Montserrat and Space Grotesk are now self-hosted in `src/assets/fonts` and
declared in `src/fonts.css`, content-hashed by Vite so they cache immutably.
Six files, not eighteen: both families ship as **variable** fonts, and Google's
per-weight URLs return byte-identical files (verified by checksum), so one face
per (family, style, subset) covers every weight the app uses. Only `latin` and
`latin-ext` are vendored — the cyrillic, cyrillic-ext and vietnamese faces are
dropped, and `unicode-range` means a browser rendering English never fetches
`latin-ext` either. `font-display: swap` is carried over unchanged.

#### Recorded, not acted on

Per the standing rules — do not spend a lever against a one-pass-old
instrument, and never interleave content with balance — four findings went to
`docs/ROADMAP.md` instead of into this diff: the 25 `set-state-in-effect`
warnings (which are **two** problems, not the one the audit described — about
ten are fetch-effects a shared hook would retire, the rest are derived-state
syncs each needing its own read); the Supabase client's 54 kB gzip on the guest
first-paint path; the 26% essence waste, which needs a per-colour breakdown
before it means anything; and a 22-point Leader spread on a single draw, which
per v28/v29's ρ = 0.417 is not evidence until `leader-rank-stability.ts` has
run across two salts — Avatar of the Abyss is the one to point it at.

### v31.0 — The pass where the gates were wired to something

The report this pass answers opens with the CI finding, and it is the right
place to start: **`scripts/simulate-v5.ts` contained no `process.exit` call
anywhere.** It collected engine invariant violations into an array, sliced to
50, wrote them to JSON, printed them — and always exited 0. CI ran it at 20
games/pairing across 24 decks: roughly 11,000 games, by far the most expensive
step in the pipeline, and structurally incapable of failing. Meanwhile the
three scripts that DO exit non-zero on a finding — `audit:screens`,
`drive:match`, `verify:pool` — were invoked by CI exactly never. Every
tap-target fix, reflow fix, focus-trap fix and WCAG pass from v28-v30 was
protected by a harness that only ran when somebody remembered.

The sim gates now, at 4 games/pairing rather than 20 (invariant regressions do
not need 11,000 games; balance passes are run by hand at higher counts), and
the browser harnesses have their own CI job with Chromium and a dev server.
Net pipeline time goes down.

**`deploy-pages.yml` did not depend on `ci.yml`.** Both triggered on push to
main with no `needs:` and no `workflow_run`, so a commit that failed typecheck,
lint, format or the entire test suite deployed to production in parallel with
CI going red. Deploy now runs on `workflow_run: CI completed`, requires
`conclusion == success`, and checks out the exact SHA CI passed on rather than
whatever is at the head of main by the time the job starts.

**Two permanently-green canaries were removed, one of them replaced.**
`cpuDecisionTaxonomy.guard.divergenceRate` read 0.0% across 18,813
opportunities, and would have forever: the shadow check asked "was a
kill-and-survive block available and unused?", which is the case `ai.ts`'s
`chooseGuards` scoring function ranks first, so the audit was a strict subset
of the policy it was auditing. It is now an exhaustive search over every legal
assignment of blockers to attackers, scored by its own value function, fed by a
new `onGuardDecision` telemetry hook that hands the harness the live board at
the moment the decision is made. A greedy per-attacker policy loses to a global
assignment, so the check can disagree — and does: 36.4% on a smoke run.
`lapses.missedLethal` (0 across 2,208 games) was deleted rather than rebuilt:
it tested the board AFTER the turn, where every attacker is exhausted and its
own readiness precondition is false, against a lethal condition the CPU already
takes unconditionally. A permanently-green light is worse than no light.

**The engine is now as pure as the PvP spike assumes.** Instance ids came from
a module-global counter, so two processes replaying identical actions from an
identical seed produced different iids — and every action in `PVP_DESIGN.md`'s
proposed reducer references iids. That was a silent desync waiting to happen
and it blocked deterministic replay outright; the counter is a field on
`GameState` now. `export const telemetry` was a shared singleton hook registry,
which would have cross-contaminated two concurrent matches in one Edge Function
instance the moment PvP landed; it moves onto `GameState` via
`GameOptions.telemetry`. Both were cheap now and expensive later. `createGame`
also records the seed it ran on, so a player who hits a bug in a real match has
something reproducible to attach — the seed is printed on the game-over screen
and written to a local match history.

**The economy was client-asserted.** The match ran client-side and the client
told the server it won; the idempotency receipt stopped the same match being
paid twice and did nothing against a loop rolling fresh UUIDs with
`p_won: true`, with the publishable key shipping in the bundle. Marketplace,
Player Shops, Grading, the Battle Pass, achievements and missions are all
denominated in that currency, so any economy tuning done before this was tuning
a number nobody had to earn. `begin_match()` now mints the match id server-side
and timestamps it; `record_match_result` claims the ticket atomically and
refuses one that is too young (<45s), stale (>6h), already spent, or not the
caller's, with per-hour minting and per-day payout ceilings on top. Throughput
is bounded by wall clock per account rather than by loop speed. The real close
is still server-authoritative matches — this is the half that does not need an
engine on the server, and it is the strongest argument for the PvP spike.
`deleteDeck`'s RLS policy was checked and is correct.

**The sim did not sample the format.** `randomArchetype` drafted only 54.5% of
the 288-card non-Leader pool across 2,208 games, and the unseen half included
cards flagged UNDER FLOOR — so every balance conclusion inherited a 45% blind
spot. Widening the score jitter and rolling per-card copy counts (rather than
always taking the maximum legal copies, which left a 60-card deck holding ~15
distinct cards) takes coverage to **79.2%**. This is the change every other
finding in section 3 was waiting on, which is why no card or Leader number was
touched this pass: the instrument was fixed first, and the re-baseline runs
against it.

**Keyword telemetry.** `Warded` reported `activations: 0` while showing a +4.8
normalized carrier delta, because target denial had no hook at all; it has one
now, fired when a ward actually pushes an effect off the unit it would have
hit. `Commander` reported `archetypeNormalizedDelta: 0` with an empty
`byCostBand: {}` across 2,019 carrier games — two separate bugs, not a real
zero: Leader keywords were bucketed only from the played-card list (they now
have a `leader` band), and a cohort keyed on the Leader makes a Leader
keyword's carrier win rate identical to its own baseline by construction (the
delta reports `null`, "not measurable", rather than 0). Keyword rows sitting on
fewer than five pool carriers are split out of the headline table entirely —
they measure one specific card's win rate with extra steps, and the docs
already apply that discipline to Leader numbers.

**Reduced motion was half-implemented.** The CSS half was meticulous — two
`prefers-reduced-motion` blocks covering foil sweeps, mythic frames, ultra
sparkles, alt-art holo and the serialized spin. The JS half did not exist:
motion is used at 10 sites in `GameV4.tsx` and 13 in `CardFaceV4.tsx`, and
Framer-style motion does not honour the OS setting without a `MotionConfig`. So
the decorative card bling stopped correctly while the match board — the screen
a player spends the most time on — animated at full tilt. One `<MotionConfig
reducedMotion="user">` at the App root closes it, and Settings gains an in-app
override on top, because asking a player to change an OS-level setting to calm
one game's board is not an answer.

**1.33 MB in one chunk.** No `React.lazy`, no `Suspense`, no dynamic import, no
`manualChunks` anywhere: all 17 screens, the 5,812-line board, the 3D showroom
and the 3,196-line Player Shops screen were downloaded and parsed before the
login screen could paint. Invisible to every existing harness, because they all
measure geometry rather than time. Route-level `lazy()` plus vendor chunks take
the entry from **1,331 kB to 241 kB** (gzip 385 -> 71).

**The first component tests in the repo.** 480 tests, all pure logic, zero DOM:
no jsdom, no testing-library, no `.test.tsx`, and roughly 20,000 lines of React
covered only by Playwright sweeps that check for overflow and console errors —
not behaviour. A shed-picker showing the wrong cards, a target selector picking
the wrong unit, a reward screen rendering a stale value: none of them catchable.
32 new tests across four suites (512 total), starting with `CardFace` (live
stats vs printed, keyboard activation, the `aria-disabled` contract for
non-interactive cards), the new motion wiring, the match history, and the deck
analysis helpers.

Also: `strictNullChecks` enabled on `src/game/**` and gated in CI
(`npm run typecheck:game`) — the engine was two real errors away from clean, and
the root config has no `strict` of any kind; `npm audit fix` (3 high-severity
transitive advisories to 0); the genuine lint findings cleared (an
`exhaustive-deps` miss in `GameV4`, an unused variable, an unused import, both
stale `eslint-disable` directives); ~90 lines of dead CSS from the dice
prototype deleted (`die-rolling`, `banner-pop`, `action-toast` — `foil-sweep`
and `serialized-spin` are NOT dead, they are keyframe names referenced from
`.foil-shimmer::after` and `.serialized-frame::before` in the same file); a
second `aria-live` region on the board reporting the player's own turn, phase,
both vitalities, essence and board counts, where v30's narration region only
covered the CPU's; and the Deck Builder gains a producible-colour check and a
seeded test hand.

**What this pass deliberately did not do**, each a decision rather than an
omission:

- **No card or Leader number was touched.** Section 3 of the report is one
  draw, the standing v28 rule is two, and — more decisively — the sampling fix
  above re-baselines the whole pool. Acting on 3.1 (first player at 43.3%
  overall, 40.6% in the clean seat-swap arm) or 3.2 (Mer-King first in both
  arms) before re-running against a widened instrument would be tuning against
  the old blind spot. 3.1 in particular wants its own isolated pass: it is a
  rules change, not a card change.
- **No mid-match resume.** Serialising a live `GameState` cannot restore
  mulberry32's internal position, so a "resume" would silently diverge from the
  match the player left. The honest route is the action log the reducer
  refactor introduces — seed plus ordered actions replays to any point, and the
  same log IS the replay viewer. The seed and the match record land now so that
  work has something to build on.
- **`BoardUnit` / `LocationTile` / `CardFace` are not memoised.** They take the
  mutated `GameState` (whose identity never changes) and fresh `onClick`
  closures per render, so a default comparator would render stale cards and a
  custom one needs a hand-written field hash per component — which is the work
  the reducer refactor does properly, and why the report's own 2.8 calls the
  `GameV4` extraction a prerequisite. The prop-stable SVG leaves are memoised;
  the rest waits for the extraction.
- **No audio, no i18n, no account management, no `GameV4` extraction.** Each is
  a pass of its own, not a line item in a robustness sweep.

### v30.0 — The pass where the keyboard was pressed for the first time

Five-part pass in the brief's order: a meta-screen bug hunt, a gameplay stress
round, a match QoL round, a flow/CPU-visibility audit, and the carry-forward
re-measurement. **0 invariant violations across 190,464 AI games** — the eight
standing cohorts four times over, on four independent draws of the pinned
deck-space — plus a 1,200-seed fuzz soak and a 600-seed chaos run; 480 tests
(8 new). The engine ships behaviourally unchanged: cohorts A/B/C reproduce
v26–v29 to the decimal, and draws 1–3 reproduce v29's whole Leader table entry
for entry.

**Every axis this project has ever measured is a POINTER axis.** Overflow is
what a finger cannot scroll to. The 24x24 minimum is what a thumb cannot hit.
Reflow at 320px and the 200% text pass are both about a phone. Eighteen passes
of geometry, and the question *can this be operated without a pointer at all*
had never once been asked — which matters more here than in most apps, because
this one draws a large share of its controls as `<div role="button">` (a card
face cannot be a `<button>`: it prints its own keyword and cost chips as
buttons, and nesting those is invalid HTML). A `div` is not focusable unless
somebody remembered `tabIndex` and does not fire unless somebody remembered
`onKeyDown`, and "somebody remembered" is exactly the class of claim a harness
exists to stop trusting. Both sweeps press the real Tab key now — the meta
screens in `audit:screens`, the live match board and its dialogs in
`drive:match` — against WCAG 2.1.1 (reachable), 2.4.7 (a visible focus ring)
and 2.1.2 (no trap).

**The first run found that every modal in the app leaks the keyboard.** Fifteen
dialogs across the match board, the card inspectors and the meta screens all
declare `role="dialog"` and `aria-modal="true"`, and most of them carry an
effect that focuses the dialog on open — with a comment, copied from one to the
next since v4.24, saying that this is *"so a keyboard user can't Tab through to
the (only visually) obscured page underneath"*. **It is not, in any browser.**
`aria-modal` is a statement to the accessibility tree and says nothing to
sequential focus navigation, and moving focus in once does not keep it there: a
dialog mounts at the END of the DOM, so Tab from its last control walks off the
document, through the browser's own chrome, and back in at the TOP of the page
— which is the thing the dialog is covering. The Tab walk landed on the match
board's **✕ CONCEDE from inside the mulligan dialog**, on the first run that
looked. `useFocusTrap` is the one shared hook that actually holds it, all
fifteen use it, and a test scans for the next dialog that ships without it.
**All 29 harness entries now measure 100%**: Tab reaches 2,081 of 2,081
enabled visible controls, every one of them draws a focus ring, no state has a
trap, and all 29 completed a full focus cycle inside the press cap — which is
reported separately, because "nothing unreachable" out of a walk that stopped
early is the silent cap this harness has caught itself taking three times.

**And then the fix had to be fixed twice, both times because two dialogs can be
open at once.** The concede confirm can be raised over the shed picker; either
can sit under the card inspector. Two active traps FIGHT — on every Tab the
outer one yanks focus into itself and the inner one yanks it back, so focus
lands in the same place on every press and the keyboard stops working
altogether, which the driver reported as "focus did not move across 4 Tab
presses on CONFIRM". A trap stack fixed that and was still wrong: it made the
most recently MOUNTED trap the owner, and mount order does not agree with
paint order (open the inspector first and the shed picker second and the
later-mounted trap is the one underneath). Ownership is decided by **document
order** now — these dialogs are siblings at one stacking level, so the last one
in the DOM is the one on top.

**Bug hunt: v29's newest harness entry was measuring the wrong screen from the
day it shipped.** A PRELUDE entry drives a screen into a deeper state by
clicking a button label, and it decided the click had LANDED by watching the
control COUNT change. `auth@signup` presses CREATE ACCOUNT, whose difference
from SIGN IN is a third *field* — and a field is an `<input>`, which the
control selector does not select. The count went 6 → 6, the harness concluded
the click had missed, and every check it then ran — overflow at three widths,
tap targets, text resize, the whole click sweep — ran on the SIGN IN screen
under the signup screen's name. That is the third time this file has recorded
an entry measuring the state it was supposed to be leaving. The landing test is
a screen SIGNATURE now (control count, field count, and the control labels), so
a prelude that swaps a button's label or adds a field moves it. `decks@editor`
was the same detector failing the other way: the sweep replays the prelude on
every one of its ~41 loads, one of them missed, and the run stopped after
**5 clicks of the 41 it owed** — reported by v28's under-measurement guard,
which is the only reason anybody knew. Three attempts with a growing wait now, in ONE
implementation instead of three: the text-resize pass and the keyboard walk had
their own copies that clicked once and waited 600ms, which is why
`grading@vault` measured the SUBMIT tab under the vault's name in one run and
the vault in the next. **The full sweep after both fixes is clean at every
depth**: no overflow at 375, 1280 or 320, none under a doubled browser font, no
undersized tap target, no thrown render, no console error, no blank body, no
unmeasured entry.

**Stress: two branches of the driver have been pressing the wrong control for
thirteen passes, and the census found both.** v29 built the control census to
turn "what has this harness never tried?" from a memory exercise into a number.
Its second run is where it pays for itself:

- **`⏱` narration speed: offered 948 times across eight matches, pressed 0.**
  The driver clicks by visible text and takes the FIRST control whose text
  contains the needle — and the narration bubble is itself a `role="button"`
  that CONTAINS the speed button, so its own text contains `⏱` too and it won
  every time. The speed ladder has been "exercised" since v20 by a click that
  has been landing on SKIP.
- **The Leader's ability pills: offered 560 times, pressed 0.** The driver
  reached for them with `[role="button"][aria-disabled="false"]`, on a comment
  claiming the pills were the only such element on the board. A `CardFace` with
  an `onClick` is one too, and comes first in the DOM. Since v17, the branch
  labelled `leader-ability` has been clicking a card face.

**The census was also still wrong about itself, in three more shapes**, all of
them the identity rule v29 wrote for card faces arriving through a different
door: a label that describes the board's CURRENT CONTENTS is not the control's
name. A clash line keys on its matchup (`#1 Galaxy Jellyfish ⚔4 → you`), so one
divider button arrived as twenty never-pressed rows; the narration bubble keys
on the beat inside it, so every sentence an opponent's turn produces was its
own control; and a Location tile keys on the card standing in it, so twelve
Sanctum names censused as twelve controls nobody had pressed. Three `data-*`
hooks later — the same convention `data-card-id`, `data-tip` and `data-primary`
already use — **269 distinct controls became 80, and the never-pressed list
went from 44 rows to 16.**

**The impatient player, driven for the first time.** Every action this harness
has ever taken has been a single, patient, well-spaced click, which is not how
anybody plays a game whose board pauses for a second of "thinking" after half
of them. Every sixth press is now issued TWICE with no wait between the two —
the two clicks land on either side of a React render with the engine's mutable
`GameState` shared between them, which is the classic double-submit and is a
different execution from two clicks a second apart — and every sixtieth step
fires three Escapes and two Spaces into whatever the last action started.
**The run it all has to survive:** eight driven matches — one in landscape, one
at 200% text, one resigned, three handicapped, half of them watching the
narration — eight rematches, **1,038 double presses of which 171 landed a
second click, 50 keyboard mashes, and 0 findings.** No crash, no hang, no
stale ring, no stalled narration, no clipped control, and every Tab walk
reaching 100% of the board's controls.

**Match QoL: the third thing a button press makes permanent.** Two of the
divider's labels warn about something a press throws away — `· N PLAYABLE`
since v26, `· WELLSPRING UNPLAYED` since v29 — and both are on the button that
ENDS the turn. The button that LEAVES THE CLASH carried nothing, and its
omission is the largest of the three: a player who has not yet worked out that
attacking is a separate declaration inside its own phase reads `SKIP TO MAIN
II ▸` as "next", presses it, and their ready units simply do not swing this
turn, with nothing on the board ever saying a thing was given up. It reads
`SKIP TO MAIN II ▸ · 3 CAN ATTACK` now, counted through the same
`legalAttackers` the attack UI itself uses.

**And the SPACE shortcut was being advertised 460 pixels away from the button
it presses.** v26 put a `␣ SPACE` chip on the divider with a comment saying it
was "where the thing it presses is". It was not: the divider is full width and
its primary is CENTRED, so on a desktop board the chip sat at the far left,
named none of the seven controls it could refer to, and — gated on nothing but
the game-over and mulligan states — went on advertising the key in the five
states where the handler deliberately stands down. It is a small `SPACE` badge
on the primary button itself now, drawn only where a keyboard exists
(`pointer: fine`) and only while the key is actually armed, off the key
handler's own predicate rather than a second copy of it. How to Play gained the
entry it never had: what SPACE presses, and what Escape cancels.

**CPU visibility: the opponent's turn, out loud.** Every pass since v18 has
closed a silence by asking what the board SHOWS — rings, spotlights, dwell
times, a recap strip — and none of that reaches a player who is not looking at
the screen. The turn recap has carried `role="status"` since v26, so the
SUMMARY of the opponent's turn was announced and not one of the moves in it,
while the bubble that replaces its own text on every beat announced nothing at
all: for a screen-reader user the opponent played its whole turn in silence.
The beat is a polite, atomic live region now — it queues behind whatever the
player is doing rather than interrupting, and reads as one sentence rather than
as the words that changed.

**Balance: no card changed, eleventh pass running — and v29's carry-forward
answered on schedule.** v29 recorded the first per-Leader statement ever to
clear the two-draws rule (Mer-King and Avatar of the Abyss take #1 and #2 in
every draw, in one order or the other) and scheduled a fourth draw to test it.
**It holds, and it is narrower than it sounds**: four independent draws, the
same two Leaders on top every time — but the gap from second place to third is
3.3, 3.8, **0.5** and 5.3 across those draws, so the pair is a stable SET
rather than a pair clear of the field. The MAGNITUDE claim still
has nothing behind it — the leader's margin over second is +10.7, −5.1, +6.5,
−1.3, changing sign twice and varying eightfold — so the rule stands and no
lever is authorized. The ρ triangle became a hexagon and is wider than three
draws suggested: **0.417 / 0.733 / 0.833 / 0.450 / 0.367 / 0.700**, with draw 2
the odd one out against every other draw and draws 1, 3 and 4 agreeing at
0.70–0.83. Worth saying plainly: v28's standing rule was quoted on ρ = 0.417,
which is the weakest of the six pairs rather than a typical one. Full numbers:
`docs/BALANCE_SIM_FINDINGS_v24.md` § v30 re-measurement.

### v29.0 — The pass where the harness asked what it had never pressed

Five-part pass in the brief's order: a meta-screen bug hunt, a gameplay stress
round, a match QoL round, a flow/CPU-visibility audit, and the carry-forward
re-measurement. **0 invariant violations across 142,848 AI games** — the eight
standing cohorts three times over, on three independent draws of the pinned
deck-space — plus a 1,200-seed fuzz soak and a 600-seed chaos run; 472 tests
(18 new). The engine ships behaviourally unchanged except for one new terminal
outcome (`concedeGame`): cohorts A/B/C reproduce v28 to the decimal, and draws
1 and 2 reproduce v28's own two draws entry for entry.

**Bug hunt: the second of the three things the mobile item has called
unmeasurable since v11 — and the prediction was wrong.** v28 measured tap
targets and left "text scaling and real-device behaviour". `audit:screens` now
runs a WCAG 1.4.4 pass (the browser's own font-size preference, doubled,
through Chromium's `Page.setFontSizes` — the same setting a player changes in
Settings → Appearance) and a WCAG 1.4.10 reflow load pass at 320px.

The expectation was a clean sheet and a number near zero. This game sizes its
type in `px`; px does not move under that setting in any browser, so the plan
was to print the number, declare the exception, and gate on reflow instead.
**The number came back 40%, and nine screens overflowed.** The app is not
px-locked, it is MIXED: Tailwind's named sizes (`text-sm`, `text-xl`) are rem
and grow, its arbitrary `text-[10px]` ones do not, and both sit in the same
rows — so at 200% a label doubles while the fixed thing beside it does not, and
the row leaves the phone. Ten states, all fixed: four search fields at a fixed
`w-44`/`w-56`/`w-40` (Collection, Marketplace, the Grading Lab, the Showroom —
`max-w-full` and `min-w-0`, because `max-w-full` on a field inside a
content-sized wrapper is 100% of a wrapper that already grew to fit it), four
rows of controls that could not wrap (the Achievements tabs, the Settings
privacy toggle, the Changelog's hand-rolled header, the Social request row's
ACCEPT/DECLINE pair), and the How to Play definition grid, whose `1fr` column
was `minmax(auto, 1fr)` and so refused to shrink below its own min-content. The
320px reflow pass came back clean everywhere on the first run.

**The offender detector learned v28's lesson the same day it was written.** The
first version named "the widest element past the right edge" and its first
report was the Showroom's HUD row — which lives in an `overflow-x: auto` strip,
sticks out by its own rectangle, and contributes nothing to the document's
scroll width. Clips compose: every candidate is intersected with its clipping
ancestors before it counts, exactly as the tap-target check has done since v28.

**And the first screen in the game had never been loaded by the sweep.** `App`
renders `AuthScreen` above the whole meta shell (`if (!session && !guest)`), so
it was never in `meta-preview.tsx`'s switch and seventeen passes of phone
measurement went past it. Two entries now (`auth`, `auth@signup` — CREATE
ACCOUNT is a different layout, not a different label), and the first run found
the show/hide password toggle at **16x16** against a 24x24 minimum: a bare 4x4
icon with no padding, on the first screen of the game.

**The under-measurement guard fired on a busy machine, which is when long
sweeps run.** v28's guard reported `pack@reveal` and `pack@summary` as not
measured; both measured perfectly under `ONLY=pack`, and the difference was a
balance sim on the other three cores. A settle window tuned on an idle machine
is a settle window that cries "unmeasured" whenever the machine is busy — it
gets three chances now, with a longer wait each time, and stops the moment the
count reaches the number it is being compared against.

**And a third door onto the same failure: a prelude that missed.** A PRELUDE
entry drives a screen into a deeper state by clicking a button label before the
sweep begins. `pack@reveal` measured **one control** at 375px in the full run
and six at 1280px on the very next load — the tear click missed, or the reveal's
850ms timer outran the wait, and the entry measured the unopened wrapper it was
supposed to be leaving while every check downstream (controls, tap targets,
text resize) ran on the wrong screen and the run printed a clean pass. The
prelude retries its click once and reports where the measurement would have
gone if the control set still has not moved. Two consecutive `ONLY=pack` runs
now measure 6 and 12.

**All 29 entries are clean at both depths**: no overflow at 375, 1280 or 320,
no undersized tap target, no thrown render, no console error, no blank body,
and no overflow under a doubled browser font.

**Stress round: the driver now measures what it has never pressed.** Every
previous stress pass grew this harness by ADDING an action somebody noticed it
had never taken — SKIP was clicked on every match until v19, RE-BOND until v22,
the VICTORY screen never rendered until v26. That is a measurement instrument
made of one person's attention. The run already reads the whole board every
step, so it already knows every control the match OFFERS; counting which of
them it ever PRESSES turns the question into a number that prints on every run.

**The first census: 360 distinct controls, 306 of them never pressed.** Two
thirds of that was the census being wrong about itself, and fixing it was the
interesting part — a battlefield unit is a `[role=button]` wrapper whose
`CardFace` child carries `data-card-id`, so `closest()` found nothing and thirty
card names arrived as thirty distinct controls; `querySelectorAll` returns the
contents of a `display:none` panel, so the 3D inspector's two controls read as
available on 2,482 of 2,715 reads of a modal nobody had opened; and a label
that embeds its own state (`Narration speed: FAST. Click to change`) is a
different key on every rung. What survived is a real list, and the driver now
takes those actions: the turn recap's two controls, the hand-order button, the
first-match coach overlay's GOT IT and Skip tutorial, the glossary popover on a
keyword chip, the board's Tip badges, the ash-pile drawer's own CLOSE (opened
since v17, closed never), the 3D card inspector behind it, SPACE instead of the
pointer on a quarter of phase advances, the double-click play route, a
Wellspring colour that is not the best one, ✕ CONCEDE followed by CONFIRM, and
↻ REMATCH.

**The handicap that was supposed to guarantee a VICTORY screen converted
0-in-3.** v26 put the opponent on 3 Vitality so a random-clicking driver could
actually close a game out, and its own guard reports when a run's winnable
matches produce no win — which is what happened, so the VICTORY screen went
unmeasured in a run that otherwise looked clean. The driver gets the Vitality
cap on those matches too now: nothing about how either side plays changes, it
simply survives long enough to reach the finish line the handicap moved.

**Two of those had never been reachable at all, and both were app bugs.**
`board-preview.tsx` passed no `onRematch`, so the control never rendered in the
harness and the single largest unexercised path in the match screen — a remount
that tears down a live narration chain and three sets of timers while the
outgoing match's reward round-trip is still in flight — had never once run.
And conceding called `onResult(false)` and `onExit()` in the same tick: the
reward round-trip it had just started (three attempts, 1.5s apart) was left
writing into a component the next line unmounted, so the one message written
for exactly this case — "couldn't record this match's result" — could never be
shown for the ending most likely to be pressed on a bad connection, and the
player was returned to the menu with no confirmation that anything had
happened. **A resignation is an engine outcome now** (`concedeGame`), so it
reaches the same game-over screen every other ending reaches, with the same
reward block, the same error, REMATCH and BACK TO MENU.

**The run it all has to survive:** eight driven matches — one in landscape, one
at 200% text, one resigned, three handicapped, half of them watching the
narration and a quarter of those stepping through it — eight rematches, and
**0 findings**. No crash, no hang, no stale ring, no stalled narration, no
clipped control, no unfinished match.

**Which immediately printed "You concedes." on the defeat screen.** The v18
suite enumerates every `${pid} <verb>` line the engine writes so the humanizer
can be checked against it, with a comment reading "update BOTH when a new one
is added" — a hand-maintained list, and one engine line was enough. The v29
suite reads the list out of `engine.ts` at test time instead, and the same scan
found `recovers` missing since v22: the Dawn beat has been reading **"You
recovers 2 Vitality at Dawn."** aloud for seven passes.

**Match QoL: the third clash button, and the warning the phase button was
missing.** v28 made CONFIRM GUARDS and RESOLVE CLASH pure tested functions
because "an off-by-one here reads perfectly and is wrong on the exact swing
that ends the game", and left DECLARE ATTACK — the first of the three a player
presses — inline in the JSX where nothing could pin it. It is a function now,
and it gains the number it was missing: **how many of the opponent's units can
legally guard what you just selected**, counted through the engine's own
`canGuardAttacker` (exhaustion, Aerial/Skywatch, Nimble) so the board cannot
promise a swing the engine will refuse. When the answer is none it reads
**UNGUARDABLE**, which replaces the LETHAL IF UNGUARDED hedge rather than
stacking with it — the hedge is hedging on exactly that condition. The phase
button became a pure function too, and carries the other standing warning: a
Wellspring allowance does not carry over any more than essence does, and a turn
ended without spending it leaves the player a Location short for the rest of
the match. `END TURN ▸ · 2 PLAYABLE · WELLSPRING UNPLAYED`.

**CPU visibility: the decision to do nothing is still a decision.** Every pass
since v18 has closed a silence by asking which CPU DECISION has no beat, and
v28 asked which beat has no SUBJECT. Neither question reaches the two that were
left, because both are decisions NOT to act. A turn on which the opponent plays
nothing, attacks with nothing and triggers nothing writes no log lines at all:
the beat list is empty, the continuation runs on the same frame, the recap
returns null because nothing happened, and the player gets the handoff banner,
a second of "thinking", and their own turn back — which is indistinguishable
from the narration having broken, and it happens most in the opening turns when
a new player is least able to tell. It gets a beat now
(`<opponent> takes no action this turn.`) and the recap says `no cards played ·
did not attack` for the player who skipped. The other one: when the opponent
holds priority over a card you just cast and declines to answer it, the card
simply resolved and nothing ever admitted the window had opened. A banner
rather than a beat, deliberately — a beat costs a full dwell on a non-event —
and it says only what is public, that they passed, never whether they had
anything to pass with.

**Flow: the board was unplayable in landscape, and nothing said so.** The match
root is `h-screen flex flex-col overflow-hidden`. A clipping root does not
degrade when its content stops fitting — it deletes: a control that no longer
fits is not pushed off the edge with a scrollbar to reach it by, it is simply
gone, and a control that has been clipped away looks exactly like a control the
board chose not to draw. Every run this harness has ever done used a 900px-tall
window. At **844x390 — a phone in landscape, at the default font — twenty
controls were unreachable**: the player's own Leader, ⚜ INVOKE LEADER, the
ash-pile, and every single card in hand. The same failure appeared one control
at a time at 390x667 with the browser font doubled. The root scrolls now, and
only when it has to (`overflow-y-auto` shows nothing on a viewport that fits),
and the driver drives one landscape match and one 200%-text match every run,
with a check that measures each control's rectangle against every clipping
ancestor and reports the ones clipped to nothing that no scroll can reach.

**And the mixed-units bug turned up once more, in JavaScript.** The board's
`Tip` popover — the badge explainers on WARDED, EXHAUSTED, JUST INVOKED, the
coin-flip chip — is a `w-40` box positioned by hand, and the clamp that keeps
it on screen was the literal `160` with a comment saying the two matched.
`w-40` is 10rem: at a doubled browser font the popover is 320px wide and the
clamp was still holding 160px back from the right edge, so it ran 160px off the
side of a 390px phone. It derives the width from the root font size now and
hands the same number to the element, so the two cannot disagree again. The
card face's keyword popover, which sizes itself in real px and so never had
that problem, had the other half of it: its clamp's upper bound goes NEGATIVE
on a viewport narrower than the popover, putting the whole box off the LEFT
edge.

**The overflow check, and three wrong answers about it.** While measuring the
above, the match root turned out to make `scrollWidth > innerWidth` almost
structurally impossible — the check the driver has run on every step since v17
has been asserting something a clipping root can barely violate. It stays, and
it now captures the offending element in the SAME read that noticed the number
(asking one evaluate later is a different frame, and on a board whose offender
is a banner or a popover the answer has already gone). Then the answers came
back wrong twice: at 200% text the board measures 1–12px over with **no element
past the edge at all**, and the fallback that guessed "the widest thing whose
content does not fit" named first the hand strip — an `overflow-x: auto` row
doing exactly its job — and then the card inspector's inner column, which is
contained by a wrapper that scrolls both ways and reads 536-in-358 at the
default font too, so not a text-resize finding either. Clips compose, in the
fallback as much as anywhere else. **An overflow finding names the element or
it is not a finding**: the box is required now, the unattributable overshoot
prints as a note on stdout, and the failure this check exists to catch — a
control pushed off the side of the screen — is always a box past the edge.

**Balance: no card changed, tenth pass running — and the discriminating
statistic is retired.** v28's parting rule was "two draws, always, for anything
about a Leader" and it shipped with no instrument; the ρ it quoted was computed
by hand from two nine-row tables assembled by hand out of sixteen reports.
`scripts/leader-rank-stability.ts` is the instrument, and a third independent
draw is the test. **ρ = 0.417 / 0.733 / 0.450** across the three pairs; only
three of nine Leaders hold their rank to within one place across all three
draws. The one-signed pinned-minus-random gap — the statistic v22 named, v26
and v27 built the Ruin-Walker case on, and v28 showed was draw-dependent —
fires on Ruin-Walker in draw 1, on Avatar of the Abyss in draw 2, and on
**nobody** in draw 3. Three draws, three different answers: it is retired as a
standalone discriminator and kept as a filter. Ruin-Walker itself, closed in
v28, comes out **4th of nine at 53.2%** on a draw that had never seen the
argument. Full numbers: `docs/BALANCE_SIM_FINDINGS_v24.md` § v29
re-measurement.

### v28.0 — The pass where the smallest thing on the card stopped stealing taps

Five-part pass in the brief's order: a meta-screen bug hunt, a gameplay stress
round, a match QoL round, a flow/CPU-visibility audit, and the carry-forward
re-measurement. **0 invariant violations across 95,232 AI games** — the eight
standing cohorts twice over, the second time on an independently re-rolled
pinned deck-space — plus a 1,200-match fuzz soak and a 600-match chaos run;
454 tests (19 new). The engine ships behaviourally unchanged: cohorts A/B/C
reproduce v27 to the decimal, and an unsalted sim run is byte-identical to the
pre-v28 code path.

**Bug hunt: the roadmap named tap-target sizes in v11 and nobody measured them
until now.** The mobile item has said since then that the remaining phone work
is "the things a geometry check cannot see — tap-target sizes, text scaling,
real-device behaviour", and sixteen passes of overflow sweeps came back clean
while the first of the three was never run. It is a check in
`audit:screens` now, against WCAG 2.5.8 (AA)'s 24×24 CSS px minimum, and the
first run found **1,300+ undersized controls across nine screens** — 646 on
Collection alone, 429 in the Grading Lab, 202 in the Showroom.

Almost all of them were one shape, and it was not a cosmetic one. **A card
face's keyword chips, keyword mentions and cost pips are their own tap
targets, and on a small card they measure as little as 22×9 — sitting on top
of the card whose own tap IS the game action.** On a phone the small target
wins the ties, so aiming at a battlefield unit to declare it an attacker, or
at a card in the deck builder's pool to add it, opened a glossary popover
instead. Below `full` those chips are now painted rather than pressed: no tab
stop, no hit area, the whole tile is one clean target, and the full-size face
one tap away (the hand preview, the inspector, the hover card, the Showroom)
carries the interactive copies at a size that actually passes. The first-sight
keyword teaching popover still fires from an inert chip — that is the tier's
behaviour, not the pointer's.

**`full` is the cut-off because it is the only tier where the alternative
works.** A new `.tap-target` utility grows a control's hit area with a
transparent centred pseudo-element, so the target gets bigger and not one
pixel of what is drawn moves — and the first version of this fix used it on
every tier and looked like it had worked. It had not: `overflow: hidden` clips
hit-testing as well as painting, the card face's chip row and rules paragraph
both clip to hold a height budget, and a 24px expansion inside one of those is
a declaration rather than a target. **The harness was measuring the
declaration.** It intersects the expansion with every clipping ancestor now,
which is the check that found the real numbers — 22px where 24 had been
reported — and the `full` chip row gained the clearance to make its own
declaration true. Nine other controls got the utility or real padding: the pack
screen's JUST TEAR IT OPEN FOR ME (140×15, the smallest primary control in the
game), the Social feed's player-name links, the deck editor's per-card
`details` link, the Collection progress disclosure and the Showroom's search
field.

**Then the depth-two sweep found 150 more, in states only reachable behind a
click.** The Grading Lab's basket steppers (21×21) and its odds-table close
(30×22); the Creator queue's "open art source" link (78×14), clipped by
`truncate` so no pseudo-element could ever have reached past it; **seven bare
checkboxes at the browser default 13×13**, including the Showcase agreement
that gates the whole submit button — fixed once in the stylesheet rather than
seven times, so the next one is fixed before it ships; and the in-sentence
keyword mentions inside a card's rules paragraph (26×12).

That last one is the exception rather than a fix, and it is declared as one. A
keyword mention lives inside a `-webkit-line-clamp` box whose entire job is to
bound the paragraph, so it cannot be grown at all — which is precisely the
case **WCAG 2.5.8 writes its inline exception for**. The exception is marked on
the element rather than inferred from CSS (a `<button>` computes to
inline-block whether or not it is mid-sentence, and an exception the harness
infers is an exception nobody chose), and every run prints how many it exempted
and where, so the carve-out cannot quietly become a pile.

One finding survived to the end and was worth the chase: a chip at 35×23 — one
pixel short — on the card standing inside a graded slab, because **clips
compose**. A `full` card face clears the minimum on its own; inside the slab's
window, a second `overflow-hidden` box wrapped tight around it, it does not.

**All 27 harness entries now measure zero undersized controls at 375px, at
depth one and depth two.** Everything else the sweep checks — overflow, thrown
renders, console errors, blank bodies — was clean throughout.

**The deck editor had never been swept.** `decks` measures five controls —
back, forge, import, edit, delete — and everything a deck is actually built
with is behind EDIT: 392 controls of pool grid, filters, search, curve, deck
list and save bar, where a player spends the whole session. Same rule v22 wrote
for the pack reveal, applied to the screen it was written about: a screen the
player passes THROUGH is not the screen they stop on. `decks@editor` and
`decks@new` are PRELUDE entries now.

**And the harness's own "clicked 0 control(s)" line came back.** v14 found a
sweep that read zero controls on four screens, printed exactly that, and
exited 0; it fixed the sampling. This pass it printed again, for `inspect`,
whose six controls the load pass had counted forty seconds earlier. The
sampling is not the durable fix — the run already HAS the number. The load
pass's count is now carried into the sweep as a floor, and a sweep that clicks
fewer controls than the screen owes reports a problem where the measurement
would have gone.

**Match QoL: the clash divider's three buttons all print their arithmetic
now.** DECLARE ATTACK has since v26 (`— 3 · 11 MIGHT · LETHAL IF UNGUARDED`).
CONFIRM GUARDS printed the incoming damage only while NOTHING was guarded, and
dropped the number the instant a player assigned their first guard — which is
precisely when "and what still gets through?" becomes the question; it reads
`— TAKE 7 · LETHAL` at every stage of the assignment now, and
`— NOTHING GETS THROUGH` when the answer is none. RESOLVE CLASH, pressed from
BOTH seats at the moment the answer is already fixed, printed nothing at all;
it reads `— DEAL 7` from the attacking seat and `— TAKE 7` from the defending
one, LETHAL at the Vitality total rather than one point past it. All three
labels are pure exported functions with a test each, because an off-by-one
here reads perfectly and is wrong on the exact swing that ends the game. The
Dusk shed picker also follows the hand dock's DRAWN / PLAYABLE / COST order
(v27 left it on engine order, and this is the one screen where the
arrangement matters most), and its disabled confirm says what it still wants
(`— PICK 2 MORE`) instead of being a dead end at the end of an over-full turn.

**CPU visibility: the beat about a unit that died had nothing to point at.**
Every visibility pass since v18 has closed a silence by asking which CPU
DECISION has no beat, and by v27 they all had one. The next question is which
beat has no SUBJECT. A CPU turn is computed in full and narrated afterwards,
so by the time "Your Ashen Sentinel was shattered." reaches the screen the
board has already stopped drawing it: the ring machinery scans the two fields,
finds nothing, and the most consequential line of the opponent's turn is the
one line with no highlight at all. The card is still in a pile. `buildCpuBeats`
finds it there, and the board **holds the face up mid-board for the length of
the beat** under a ☠ UNIT LOST plate — desaturating, tipping and sinking as it
goes, rather than dropping in and settling the way a played card does, because
the card it is showing is not on the board any more. Paced by `--gv4-pace`
like everything else the narration owns, and given the same longer dwell a
spotlight beat gets. The pile scan is a fallback only: a structured event
always wins, a unit still on the board is ringed rather than held up, and only
the tail of a pile is scanned so a fortieth-turn ash pile cannot match a
coincidence.

**Balance: no card changed, ninth pass running — and a carry-forward CLOSED.**
The v27 item asked for Ruin-Walker Overseer's flagged lemon recipe to be
excluded and the gap re-measured. It was, and a second test was run beside it:
a new `PINNED_RECIPE_SALT` knob re-rolls the pinned suite's recipes #1..#8
without touching a card, a weight or the engine, giving a genuinely
independent draw of deck-space. Both tests agree — the gap loses its
one-signedness and settles at −6.0 either way — so the statistic four passes
were built on was carried by one deck, and **the item comes off the list.**

The re-roll found something larger on the way. Across the two draws the pinned
suite's Leader ranking correlates at **Spearman ρ = 0.417** — Legendary Diver
and Ruin-Walker each move four places, Ethereal Sea Witch five — at 47,616
games per draw, where every cohort reproduces to the decimal. **The Mer-King
lever is therefore revoked rather than carried**: its authorization rested
entirely on "first in every cohort, nine clear of second", and on the second
draw it is second, 5.1 behind a Leader the first draw ranked below it. Nothing
about Mer-King's cards changes; what changes is that no scheduled lever is
waiting to be spent on it. New standing rule: **two draws, always, for
anything about a Leader.** Full numbers:
`docs/BALANCE_SIM_FINDINGS_v24.md` § v28 re-measurement.

### v27.0 — The pass where a card became an object

Six-part pass in the brief's order: a meta-screen bug hunt, a gameplay stress
round, a match QoL round, a flow/CPU-visibility audit, the carry-forward
re-measurement, and one new feature — the 3D Showroom. **0 invariant
violations across 47,616 AI games** (the same eight cohorts) plus a 1,200-match
fuzz soak and a 600-match chaos run; 435 tests (20 new). The engine ships
behaviourally unchanged — cohorts A/B/C reproduce v26 to the decimal.

**NEW — the 3D Showroom (`src/meta/ShowroomScreen.tsx`,
`src/components/Card3DShowroom.tsx`).** Its own page off the main menu. The
existing `Card3DInspector` is a modal that tilts a flat face ±14° under the
pointer; this is a room with an object standing in it. The card is a
six-faced solid with real stock thickness, so the yaw is genuinely **360°** —
drag past the edge and it keeps turning through front, edge, back, edge,
front. Pitch clamps at ±80° (past that the card is edge-on, and rolling over
the pole inverts the drag). Zoom runs 0.35×–3.2× on the wheel, a two-finger
pinch, the +/− keys or the HUD. A flick hands its velocity to a decaying rAF
loop, so the turntable coasts; auto-spin has three speeds. Arrows tilt, F
flips, R resets, Escape leaves, and the readout prints yaw/tilt/zoom plus a
live FRONT / EDGE ON / BACK badge. All CSS 3D — no WebGL dependency — and the
face in the room is the same `<CardFace>` React tree the rest of the game
renders.

**Super-Rare and above each get their own environment**, which is the brief's
line: ION SWEEP (Super-Rare), GILDED HALL (Ultra-Rare), AURORA VAULT
(Full-Art), PRISM CHAMBER (Alt-Art), EMBER FORGE (Mythic) — each with its own
backdrop, ambient animation, key/accent light, and **card effects those
rarities alone receive**: a deterministically-placed ring of motes orbiting at
the card's own depth (so they pass in front of it and behind it as it turns),
a rim light that swings with the yaw, a per-room wash over the face, and a
floor pool in the room's colour. Common through Rare stand in a plain studio,
deliberately. `isPremiumRarity` reads the floor off `RARITY_ORDER`, and a test
pins that the room ladder and the rarity ladder cannot drift apart.

**Slabs stand in the room too**, as the thicker object they are (34px of
acrylic against the card's 9px of stock) — the first time the graded case has
been viewable from any angle other than dead-on. Reachable from the menu tile,
from VIEW IN 3D in the Collection's card inspector, and from any slab on the
Collection shelf or in the Grading Lab vault.

**Bug hunt: the new page's own harness entry paid for itself on the first
run.** The full 24-screen sweep came back **0 problems** — the last four
passes' fixes are holding. The two new entries (`showroom`, `showroom-slab`,
the second because the slab is a different geometry reached only through a
tab click) came back with **174**, all one bug: the card picker wrapped a
`<CardFace>` in a `<button>`, and CardFace prints its cost pips and keyword
links as real buttons. Exactly the v26 slab finding, caught this time by the
harness entry that shipped WITH the screen instead of two releases later. The
object in the room is now `inert` for the same reason — a drag surface must
not have a dozen tab stops rotating inside it.

**The slowest speed was showing the shortest animations.** v26 scaled every
combat animation's CSS duration by `--gv4-pace` so the narration dial would
slow down the parts a player is trying to watch. It did not move the three JS
timers that UNMOUNT those elements, which stayed at their v25 constants: on
CINEMATIC (pace 2.6) the phase banner, the damage floats and the hit flash
were torn off screen at ~38% of the animation the same setting had just
lengthened. The slowest rung in the game showed the shortest version of every
effect it exists to let you watch. Both halves now come from `FX_MS`, and
`fxUnmountMs`/`fxPaceFor` are exported and pinned by tests at every rung —
including rungs added later. The ⏱ tooltips (two of them) and the How to Play
page also still listed the pre-CINEMATIC three-speed ladder; the tooltips are
built from `CPU_SPEEDS` now and a drift test pins the prose.

**Match QoL.** The hand dock has always rendered in draw order — the order the
engine keeps, and no order at all to look at. A dock button cycles **DRAWN /
PLAYABLE / COST**, persisted by name in `matchPrefs` (PLAYABLE floats exactly
what `invokeWhy` says is castable right now). Presentation only: `me.hand` is
untouched, and the Dusk shed picker still lists engine order. The opponent's
turn also gets a **progress bar on the clash divider**, where the HOLD / STEP
/ SKIP buttons that act on it live — the count existed, but only inside the
narration bubble at the top of the board.

**Balance: no card changed, eighth pass running.** Cohorts A/B/C reproduce
v26 exactly (P1 44.7 / 46.5 / 46.3, avg turns 20.3 / 21.6 / 21.8);
`invariantViolations` empty in all eight. The Ruin-Walker carry-forward is
re-measured and **narrowed**: the cross-cohort aggregator flags a lemon deck
recipe for SEVEN of the nine Leaders, so "deck #1 is a lemon" cannot be the
explanation for a pinned-minus-random gap that is one-signed negative in all
eight cohorts when no other Leader's is. Recorded, not acted on — rule #6
holds, this pass ships a feature. Full numbers:
`docs/BALANCE_SIM_FINDINGS_v24.md` § v27 re-measurement.

### v26.0 — The pass where the opponent's turn got a receipt and the slab became an object

Six-part pass in the brief's order: a meta-screen bug hunt, a gameplay stress
round, a match QoL round, a flow/CPU-visibility audit, the carry-forward
re-measurement, and the Grading Lab overhaul. **0 invariant violations across
47,616 AI games** (eight cohorts, three of them on a game seed never used
before) plus a 1,200-match fuzz soak and a 600-match chaos run; 415 tests
(5 new). The engine ships behaviourally unchanged — cohorts A/B/C reproduce
v25 to the decimal, keyword rows included.

**The Grading Lab, rebuilt.** The slab was a coloured rectangle; it is a
moulded acrylic case now, with a bevelled shell, a three-zone label (service
wordmark, card name and rarity line, grade numeral and word), glass glare, a
cert number and barcode derived from the row, and a case treatment per grade
tier — gold at 10, silver at 9.5, flat grey at 6 and below, with a slow shine
on the top two grades that honours reduced-motion. Pending slabs frost their
window and read SEALED. The screen around it stopped hiding its own numbers:
a published odds table per service (all three roll the same table — TCA
resells higher, Keeper bumps 55% of rolls a half point), an average-return and
chance-of-9+ line on every service, the expected slab value on every card in
the picker, and expected-return-against-fee on the pay bar. Four numbered
steps, a picker that scrolls in its own bounds, a sticky pay bar, ADD ALL per
card, a portfolio total and three sort orders in the vault, progress bars in
limbo, and a CHECK FOR RESULTS button for a client clock that disagrees with
the server's. **Vouchers now pay grading fees** at 100 credits to the voucher —
the rate the pack shelf already uses.

**Match QoL — four things the board was making the player do by hand.** SPACE
(or Enter) presses whatever the clash divider is offering — DECLARE ATTACK,
RESOLVE CLASH, CONFIRM GUARDS, PASS, the phase button, SKIP — dispatched as a
real click, so a disabled primary refuses the key exactly as it refuses the
pointer, and inert under every modal. Double-clicking a hand card plays it.
DECLARE ATTACK says LETHAL IF UNGUARDED when the selection is at or over the
opponent's Vitality. The phase button counts the affordable, castable cards a
turn is about to throw away (`· N PLAYABLE`).

**CPU visibility — the turn recap, and animations that actually slow down.**
The speed dial used to move only the WAIT between beats: every animation kept
its literal duration, so the parts a player is trying to watch went past at
the speed they had just said was too fast. Every combat animation now scales
with the narration pace, and a new slowest rung — **CINEMATIC** — joins the
ladder (the preference is stored by name now, with old numeric values
migrated, so nobody's saved choice becomes a speed they didn't pick). And
because the narration takes its whole answer off screen when it ends — after a
SKIP there was never an answer at all — a dismissible **turn recap** now
greets the returning player: cards played, whether it attacked, Vitality lost
and where that leaves them, units lost, cards drawn, and ▴ FULL LOG.

**Bug hunt: the newest screen was the only one never measured.** The Grading
Lab shipped in v25 without a harness entry, so the newest layout in the game
had never been loaded at phone width. Adding it (with fixtures) found a real
bug on the first run: the slab was a `<button>` wrapping a CardFace, whose
keyword and cost chips are real buttons — invalid HTML that breaks keyboard
and screen-reader navigation. Also fixed: `fetchGradedCards` passed a numeric
`grade` through raw where the reveal path normalised it, one driver quirk away
from taking the Collection down.

**Instruments.** The fuzz and chaos volumes are env knobs (`FUZZ_SEEDS`,
`CHAOS_SEEDS`) instead of constants each stress pass edits and reverts; the
match driver can now hand itself a winnable board (`WIN_EVERY`), because
across every run it had ever done it had lost every match — the VICTORY screen
was the one match state the match-state harness had never rendered.

**Balance: no card changed, seventh pass running.** The Mer-King lever stays
unspent per its own condition. `Sacred` narrows from "the sign flips" to
"one-signed positive across eight cohorts, magnitude is deck roll"; the
Ruin-Walker pinned-kit gap re-opens as one-signed negative in all eight. Full
numbers: `docs/BALANCE_SIM_FINDINGS_v24.md` § v26 re-measurement.

### v25.0 — The pass where the cards got their slabs and the opponent learned to think out loud everywhere

Six-part pass in the brief's order: a meta-screen bug hunt, a gameplay
stress round, a match QoL round, a CPU-visibility audit, the v24
carry-forwards, and one new feature — the Grading Lab. **0 invariant
violations across 23,808 AI games** (three standing cohorts + a fresh-seed
stress cohort) plus raised-volume fuzz (1,000 seeded matches) and chaos
(500 random-legal-action matches) suites; every cohort's win rate and turn
count identical to v24's to the decimal, so the engine ships behaviourally
unchanged. 410 tests (8 new — the grading economy suite).

**NEW — the Grading Lab (card grading mini-game).** Players spend credits
to submit spare cards for professional grading. Three services, each with
its own fee, resale premium and slab case style: Timeless Card Authority
(400cr base, ×1.6 resale premium, black-and-gold case), Alpha Mint Grading
(180cr, ×1.25, silver-and-blue; 20%/35% bulk discounts at 5+/10+ cards per
submission), Keeper Standard (70cr, ×1.0, green; cheapest rush pricing and
a 55% chance to bump the roll a half-point — "grades a little higher").
Turnarounds: 16h standard / 8h rush (×1.75, Keeper ×1.4) / instant (×6,
Keeper ×5). Grades run the standard 5–10 scale with half-points 5.5–9.5;
the roll is weighted toward 8–9 with 10s rare, and is rolled **server-side
at reveal time** (never stored earlier, so RLS can expose the row without
spoilers). A slab quicksells at raw price × grade multiplier (1.1 at a 5
up to ×12 at a 10) × service premium; CRACK SLAB returns the raw copy.
Submissions respect the exact deck-lock and Serialized-reserve rules
quicksell uses. Server side is the `card_grading_v25` migration
(`graded_cards` + four SECURITY DEFINER RPCs); client mirrors live in
`src/meta/grading.ts` with a dedicated test suite. Slabs render on a
GRADED CARDS shelf in the Collection, encased in their service's style.

**Match QoL + CPU visibility (5 gaps left after three prior passes).**
Refusals now render as a red shaking `role="alert"` banner distinct from
confirmations (~15 sites); banner hold time scales with message length;
the clash bar prints each attacker's ⚔ Might on its guard line; the CPU
opens a visible 🤔 think-beat before clash reactions and stack answers
(both previously fired inside the player's own click); the match screen's
keyframes honor `prefers-reduced-motion`.

**Meta-screen audit (1 fix).** The full screen-by-screen pass found one
player-visible bug: `sold_out` rendered raw as "SOLD_OUT" in three Player
Shops badges. Everything else checked — double-spend guards, unmount
races, modal escapes, empty-vs-error states — was already defended by the
v22–v24 fixes, each verified rather than assumed.

**Balance: no card changed, sixth pass running.** The Mer-King lever stays
unspent per its own condition (this pass carries content and engine work).
Unbreakable's trigger not met (carriers 56.9–61.1% across four cohorts);
Sacred's cohort dependence re-confirmed (47.0–62.2% spread). Full numbers
appended to `docs/BALANCE_SIM_FINDINGS_v24.md` (§ v25 re-measurement).

### v24.0 — The pass where a softlock died, the damage numbers found their beats, and a keyword died in the lab instead of in the pool

Six-part pass in the brief's order: a meta-screen bug hunt, an engine stress
round, a match QoL round, a CPU-visibility audit, the v23 carry-forwards, and
a new-keyword round. Full numbers: `docs/BALANCE_SIM_FINDINGS_v24.md`
(supersedes the v23 doc). **0 invariant violations across nine 5,952-game
cohort runs** (three standing + one fresh-seed stress cohort + four
experimental + the final neutrality re-run); 402 tests (8 new — the v24
Event keyword suite); the shipped pool byte-identical, verified twice.

**Match UI — a hard softlock and two dead-end recoveries.** The full-file
audit found the worst bug of the pass: a response window re-entered after the
CPU answered an auto-passed window never raised the respond stage — priority
was the player's, with no PASS button, no castable card, no tappable
Location, and only CONCEDE alive. (Repro: the CPU's stack answer kills a
unit whose dies-trigger draws the player a castable Quick Event.) Fixed at
the one place every re-entry passes through. The two crash-recovery paths
had a matching hole: recovering from a live CPU clash either called
`beginHumanTurn` with the CPU still active (every control dead) or cranked
`endPhase` against the engine's mid-clash refusal (twelve no-ops, then the
same dead board). Recovery now drops the live clash first. And PASS now
clears a half-built target pick — the stale red PICK A TARGET bar could
otherwise spend the card later on a click that was never meant to cast it.

**CPU visibility — the damage numbers found their beats.** The CPU's whole
turn is computed first and narrated after, so every −N/+N float (both
Vitality plates included) fired during the "🤔 thinking…" bubble and was
gone seconds before the beat describing the hit. Floats from CPU actions now
queue and release on the narration beat that involves their unit or player,
with leftovers flushed at the end of the run. Beats aimed at a unit of the
player's that DIED mid-turn now get the long "aimed at me" dwell time too —
previously exactly those beats ran short, because the dead unit was no
longer on the field to match. SKIP pressed during the thinking delay now
skips the narration it fast-forwards into, instead of double-charging the
button.

**Match QoL.** CONCEDE is reachable from the mulligan overlay (it covered
the top bar, so a mis-queued match had to be played); the clash guard lines
stay visible inside a mid-clash response window (they vanished exactly while
the player was deciding whether to counter); the guard-step gating text
stopped claiming "invoke during your own main phases" mid-clash; the ON THE
PLAY / ON THE DRAW badge shows (and is tappable) on phones; badge tooltips
portal out of the scrolling lanes instead of clipping at the lane edge;
Shift+Enter reads a tappable Sanctum without spending its tap; the
guard-step divider reserves room for the LOG button so it can't eat CONFIRM
GUARDS taps.

**Meta screens — eleven fixes from the screen-by-screen audit.** The two
worst: an auction you bid on VANISHED from MY LISTINGS & BIDS the moment a
rival outbid you (the schema stores only the current bidder — the client now
remembers your bids, keeps the row, and tags it OUTBID), and a pending trade
older than the newest 50 trades fell out of the fetch window entirely —
unacceptable and uncancellable, for both parties, with no UI path back.
Also: the close-shop refund notice rendered into a branch that never showed
it; a busy shop owner's own sales could push MY PURCHASES (and the 3-day
rating window) out of the query limit; the shops card picker dead-ended on
"of 0 spare" when only foils were spare (Marketplace's picker had this fix;
shops' never got it); one network blip pinned a permanent "couldn't load"
banner over live data in Marketplace and Social; Collection sell buttons
re-enabled against stale counts (a fast double-click sold ghost copies);
pack HAUL VALUE counted serialized pulls it can never quicksell; the
settings toggle swallowed a fast undo; creator search with a target selected
fetched results and rendered nothing.

**NEW (under the hood): the v24 Event keyword generation, unprinted.**
Kindle (Ember: 1 damage to the enemy player on resolve), Tailwind (Gale:
recover a tired unit, else a spent Location), Luminous (Light: restore 1
Vitality on resolve) — implemented, tested, priced, in `UNPRINTED_KEYWORDS`,
on no card. The print experiment earned its keep twice: it caught that
merely REGISTERING a colour-mapped Event keyword re-rolled three live Events
(`freshKeywordFor` now excludes unprinted keywords, and the catalog guard
that caught it stays), and it caught **Tailwind's first design at ZERO
activations across ~780 carrier games** — correct code, dead text: Events
resolve right after Dawn recovered everything. The redesigned fallback
activates ~1.4×/carrier-game. Both experimental prints reverted; the pool
ships byte-identical.

**Balance: no card changed, fifth pass running.** The Mer-King lever stays
authorized and unspent (this pass carries engine/UI/content work, which its
condition forbids); Unbreakable checked and in band (+56.9% carriers, not
negative); Sacred carried. Control cohorts identical to v23 to the decimal.

### v23.0 — The pass where the one-signed Leader turned out to be one deck, the gates finally all told the truth, and the Leader keyword generation arrived unprinted

Six-part pass in the order the brief asked for: a non-gameplay bug hunt, an
interactive stress round, a match QoL round, a CPU-visibility audit, the v22
carry-forward balance items on eight cohorts, and a new-keyword round. Full
numbers: `docs/BALANCE_SIM_FINDINGS_v23.md` (supersedes the v22 doc). **0
invariant violations across ten 5,952-game cohort runs** (the standing six +
two fresh + two experimental); 394 tests (9 new — the Leader-keyword suite
and a two-way dead-text guard); the meta-screen sweep clean at both widths
and the match driver clean over six full matches on the fixed build.

**Gameplay — the last three controls whose click the engine would refuse.**
v22 closed this seam for the Wellspring dots and INVOKE on targeted Events;
this pass audited every remaining control against the engine function it
fronts and found three more, all the same shape — a UI gate reading
`inMyMain` where the engine reads `inOwnMainClear` (main phase AND an empty
stack):

- **⚜ INVOKE LEADER** stayed enabled with something on the stack — and its
  click auto-tapped Locations for a cost `canInvokeLeader` was always going
  to refuse, leaving them exhausted for nothing. The gate now names the
  stack item; the refusal path re-renders so a tapped board never lingers.
- **Leader ability pills** walked the player through a whole target pick
  before the engine's `inOwnMainClear` check bounced it as "Illegal target."
  `leaderAbilityWhy` gained the stack clause.
- **💠 RE-BOND had no gate at all** — a bare `inMyMain` check inside the
  click handler and no `disabled` on the button. It now has a `rebondWhy`
  like every other control, with the reason on the button.
- The same audit found four controls that ignored `narrating` and could act
  into the middle of the opponent's replay (Wellspring dots, INVOKE LEADER,
  ability pills, RE-BOND). All four now disable with "SKIP ▸▸ to catch up".

**CPU visibility — the two remaining silences.**

- **The play that pauses the game for your response was the one play with no
  spotlight.** The AI emits an `invoke` event for every card it plays — but
  it emitted it AFTER `settleAfterPlay`, which exits by THROWING when the
  play leaves the human holding priority. So exactly the plays the player is
  asked to answer arrived as a bare log line with no card face and no rings,
  followed by a PASS window over a card they were never shown. The event now
  fires before the throw.
- **Triggers, Wildfire and Siphon wrote nothing to the log.** A resolving
  trigger's SUCCESS path had no line (only its fizzle did), so an "At Dusk"
  Sanctum could damage a unit or erode the deck and the board simply changed
  between beats. Wildfire's parting shot took 2 Vitality with only "X was
  shattered." on the record; Siphon raised the opponent's Vitality
  "from nowhere" mid-clash. All three now log — and therefore narrate, ring
  and float like every other CPU action. Verified sim-neutral: cohort A
  re-run is byte-identical.
- **Your own Dawn no longer narrates as the opponent's.** It runs inside the
  endPhase that ends the CPU's turn, so its lines ride the CPU's narrated
  slice — and played in the red "opponent is acting" bubble. Those beats are
  now tagged and render in the player's yellow under a **☀ YOUR DAWN** label.
- **A CPU crash mid-turn no longer strands the board.** The recovery paths
  parked the UI in the player's stage while `g.active` was still CPU — every
  control dead except the phase button, which then drove the OPPONENT's
  phases. Recovery now cranks the engine forward to the player's own turn.

**Match QoL.**

- **The three top-of-board messages stopped fighting.** The narration
  bubble, the PICK A TARGET bar and the yellow `say()` banner all lived at
  the same spot with the same z-index, so DOM order decided which painted —
  "Bond set — now pick a target for its effect." rendered UNDERNEATH the
  very bar it explains. They now stack in one column, which also caps the
  target bar's width on a phone (its ✕ cancel could previously be pushed
  off the right edge of a 390px screen, with no Escape on touch).
- **❚❚ HELD shows on the bubble itself** — a held narration parking on a new
  segment's first beat read as a stuck board unless you were looking at the
  divider buttons.
- **The ash-pile is a bottom sheet on phones** instead of an overlay that
  covered the whole board including the hand dock.
- The Wellspring "already played" message knows about the two-Wellspring
  opening-turn allowance instead of always saying "One Wellspring per turn."

**Non-gameplay bug hunt.** The depth-two screen sweep (both widths, ~250
control clicks): **0 problems**. Code review found five real ones, all fixed:

- **FIX: the Bounties SELL gate checked deck locks and Serialized reserves
  against the same copies** — own 2 copies of a bountied card with one in a
  deck and one Serialized and SELL rendered enabled, then bounced off the
  server. The two reservations now ADD, as every other sell surface counts
  them.
- **FIX: the Marketplace bid modal froze its listing at open.** The realtime
  reload refreshed the rows behind it, but the modal kept quoting the old
  current bid — a rival bid left PLACE BID enabled against a number
  `place_bid` was always going to refuse, and a buyout/expiry left it live
  against a dead listing. The modal now re-derives the live row every
  render, raises the pre-filled amount with a rival bid, and says plainly
  when the listing has ended.
- **FIX: ✦ VIEW FOIL changed the picture and nothing else** — the Collection
  inspector's market-value panel kept describing the variant you clicked,
  not the one on screen. The toggle now reports back.
- **FIX: HAUL VALUE ignored QUICKSELL** — the pack summary's "what you kept"
  tile kept quoting the pre-sale number after the same screen stamped 30
  cards SOLD. It now excludes them.
- **FIX: a `pack_types` row with `price_vouchers = 0` rendered a free
  "0 VOUCHERS" buy button** — the cosmetics grid and ProfileScreen document
  0 as "not voucher-purchasable"; the two pack paths now agree. (Latent — no
  live row carries 0 today.)
- One suspected bug was disproven against the live server: Player Shops'
  `top_rarity_tier` badge is correct — the server's `rarity_tier()` is
  1-indexed and the client's `- 1` is the right conversion.

**Keywords — the Leader generation, implemented and deliberately unprinted.**
Leaders carry three keywords where every other type has six or seven (the
standing roadmap item). This pass ships the engine half: **Onslaught**
(Ember — your units get +1 Might while attacking), **Beacon** (Light — your
invoked Leader restores 1 Vitality at Dawn), **Dread** (Void — enemy units
get −1 Might while your Leader is fielded), with eight pinned tests, registry
entries and by-analogy weights. **No card prints them**: `UNPRINTED_KEYWORDS`
names the three, the catalog's dead-text guard exempts exactly that list (and
fails the moment one prints while still listed), How to Play skips them, and
`verify:pool` confirms the pool byte-identical. A measured two-cohort preview
of the print — all three playable, none degenerate — is recorded in the
findings doc §5 and was reverted.

**Balance (nothing shipped — deliberate, fourth pass running).** Eight
cohorts, all standing six byte-identical to v22. **Mer-King's restated
condition is MET** — first in all eight, random arm above 50% everywhere it
is sampled — and the lever is authorized for the next pass that contains
nothing else, per the condition's own wording. **Ruin-Walker Overseer is
closed as instrument, not card**: its one-signed divergence traces to pinned
deck #1, a persistent 15.6% lemon (12.5–18.8 across all eight cohorts) whose
recipe drafts the Root/Void pool's understatted keyword carriers; without it
the kit reads 46.0%, mid-field. Six of nine Leaders carry at least one such
lemon deck — `scripts/aggregate-cohorts.ts` now computes the cross-run sign
table and flags them, closing the "assembled by hand" item. The two-pass-old
Sovereign of the Dying Star `cards` row is verified synced, with full
pool parity against a fresh snapshot.

### v22.0 — The pass where the opponent's Dawn and Dusk stopped happening in silence, and the caution flag four passes were read through got measured

Five-part pass in the order the brief asked for: a non-gameplay bug hunt, an
interactive stress round, a match QoL round, a CPU-visibility/flow audit, and
the v20 carry-forward balance items. Full numbers:
`docs/BALANCE_SIM_FINDINGS_v22.md` (supersedes the v20 doc). **0 invariant
violations across six 5,952-game cohort runs** — the standing four plus two new
ones; 384 tests (14 new, in two new suites); matches driven end-to-end through the
real match UI; 20 meta screens swept two clicks deep at two widths, two of them
reachable for the first time.

**Match screen — the last silence was not a decision.** v18 closed the CPU's
clash reaction window, v19 its guard step, v20 its priority window over the
stack. Each found its target by asking which of the opponent's DECISIONS had no
beat, and by v20 every decision had one. What was left is the two phases the
RULES run on the opponent's behalf:

- **The opponent's Dawn is now narrated, and Dawn is not a no-op.** It untaps,
  heals (Sacred / Radiant / Regenerate), grows bodies (Thriving / Empowering),
  draws (Archivist), rebuilds Leader Resolve (Resolute) — and reaches across the
  table to FREEZE one of the player's units (Glaciate). None of it wrote a
  single line to the engine log, so no narrator could have shown it:
  `runCpuTurn`'s own comment asserted the opponent's Dawn "writes nothing to the
  log", which was true and was the bug. A unit greying out between the player's
  turn and the opponent's first move, with no line, no ring and no beat, was the
  last thing the opponent did invisibly.
- **Dusk too.** Entropic and Blighted erode cards off the player's deck — a real
  clock on a real loss condition — and Scorched-Earth sweeps their whole board.
  Units died at the opponent's Dusk with only the shatter lines to explain them,
  and those name the unit, not the cause. Dusk runs inside `playTurn`, so these
  lines needed only to exist to be narrated.
- **`GameState.dawnLog`** carries the current Dawn's lines. Dawn runs inside the
  `endPhase` that ends the PREVIOUS player's turn, so the match screen is
  already past them by the time it takes its own `logStart` — and the opening
  turn's Dawn runs inside `createGame`, before the mulligans, so "everything
  from index N" is not the same set of lines. `runCpuTurn` narrates the slice
  only when it is still the tail of the log, which is what keeps a CPU-first
  match from replaying a Dawn the player already sat through the mulligan screen
  for. The Battle Log's "since your last turn" divider moves back to cover it.
- **Glaciate names the unit it froze**, rather than counting one. `applyEffect`
  picks its own target through `autoTarget` and reports nothing, so the engine
  diffs the enemy field around the call. Everything else aggregates per keyword,
  so a six-unit Thriving board is one line, not six beats on the same fact.
- **A line that names a card now rings that card even with no event behind it.**
  The ring machinery is driven by the AI's structured event stream, which covers
  what the AI DECIDES. It does not cover what the rules do — a shatter, a fizzle,
  a Dawn freeze — and those were sentences with no ring. An event, when there is
  one, still wins over the name scan.
- **A beat aimed at something of the player's holds ~40% longer.** Most of an
  opponent's turn is it improving its own board; the two or three beats where a
  unit of theirs is frozen, weakened or hit are the ones they have to locate
  before the ring leaves, and they were getting the same 1150ms as "Kuro plays a
  Tide Wellspring".

**Match QoL.**

- **The Wellspring dots say which one to press.** Seven 16px circles whose only
  distinguishing text was a `title` reading "Play a Void Wellspring (free)" —
  identical for all seven, invisible on touch, and silent about the one fact
  that decides which to press. Each now reports how many hand cards it would
  UNLOCK. That is the measure the CPU's own `chooseWellspring` uses and it is
  not "is short of this pip": a card short of two colours is unlocked by neither
  alone, and counting it under both is how a recommendation names a dot that
  changes nothing. Costs go through `canPayCost`, so the generic half counts too.
  The best dot is ringed, the recommendation is spelled out in the hint bar
  (where a phone can read it), and the dots get a 44px hit area.
- **↻ REMATCH on the game-over screen.** BACK TO MENU was the only way off it, so
  a second match meant menu → PLAY → re-pick the deck: three screens to repeat
  what the player had just chosen. Disabled while the reward round-trip is in
  flight, since remounting would unmount the state its retry loop writes into.
- **How to Play** now documents what Dawn and Dusk actually do, and its
  "opponent's turn" section covers all five moments it acts rather than three.

**Non-gameplay bug hunt.**

- **FIX: the XP readout could print a negative numerator** — `-2400/1200 XP TO
LEVEL 13`, next to a progress bar sitting correctly at zero. `ProgressBar` has
  clamped a negative `value` since the pass that found the server's level/xp
  pair can run ahead of this client-side mirror; the two TEXT labels beside
  those bars never got the same treatment. Both now go through one
  `levelProgress` helper, so the clamp cannot be applied to one and forgotten on
  the other. Visible at all because the preview harness's stub profile was
  itself 2,400 XP short of its own level — fixed, so the harness measures a
  state a real account can be in.
- 20 meta screens, two widths, every visible control clicked one at a time and
  then every control those clicks reveal: **0 problems**.

**Gameplay — two controls that were offered and then refused.** Both found by
the stress driver, and both the same shape: a live, enabled control whose click
produces a banner and no move. The driver reports that as a HANG because it is
one — it presses, nothing changes, it presses again — and a player experiences it
as a board that has stopped responding.

- **A targeted Event with no legal target kept an enabled INVOKE.** `tryInvoke`
  has always refused it ("no legal target for its effect — invoking now would
  waste the card", which is the right call: the cost and the card would be spent
  on an effect resolving into nothing), but `invokeWhy` — the function that
  exists to answer "why can't this be invoked", and the one the button reads its
  `disabled` from — never knew about the case. The preview kept quoting a cost
  for a card that could not be played. Seed 312 spent an entire match pressing
  it. Units and Items are deliberately still playable there: they keep their
  body and bond value and only lose the rider.
- **The Wellspring dots had no `why` gate at all.** They were the last control on
  the board rendered on a bare "is it my main phase" check, and the engine's gate
  is strictly narrower: `playWellspring` requires `inOwnMainClear`, which is
  `inOwnMain` AND AN EMPTY STACK. So with anything waiting to resolve, seven
  coloured dots stayed live and a click was answered with "One Wellspring per
  turn, in your own main phase" — a sentence wrong about both halves of why it
  failed. They now disable and name the real reason. `inMyMain` itself was
  deliberately NOT changed to match: `invokeWhy` reads it and already handles a
  non-empty stack with a better message of its own.

Both gates are pinned by `interactive-v22.test.ts` against the engine predicate
they have to mirror, so the two cannot drift apart again and be rediscovered by
a hang.

- **FIX: "You must Deal from an empty deck and loses."** — the defeat screen's
  own sentence, and the only engine line with two verbs in one clause.
  `humanizeLog`'s table rewrites the verb that follows the subject and nothing
  after it, and the v18 suite that exists to catch exactly this listed the line
  but only asserted the absence of `P1` and of a third-person FIRST verb, so it
  passed straight through for four passes. Found by reading a driven match's
  game-over line — which was only reachable at all because the same match
  narrated the Blighted erode that caused the deck-out.

**Harness.**

- **A hang report now names the ladder branch the driver kept taking.** It used
  to name the buttons on screen and nothing about what the driver was DOING with
  them, which makes the commonest failure — a branch that fires, changes nothing
  and restarts the ladder — invisible from the report. Diagnosing the first of
  the two bugs above cost several full re-runs; the answer was one line of
  state. Relatedly, the two driver actions that reported success on an element's
  mere existence (play a Wellspring, press INVOKE) now confirm the board
  answered — a card that left the hand, a Location that arrived, a target pick
  that opened. **A driver may only report an action it can see the board
  answer.**

- **The match driver had been clicking the FIRST Wellspring dot every turn** —
  the same colour for a whole match — since the harness was written.
  Instrumenting one run found the human casting ONE card in nine turns behind an
  all-Void hand while its board built Root, every other card reporting "Needs
  Void essence your Locations can't produce yet". That is why every driven match
  has ended between turn 6 and turn 10 against a headless average of 21, and why
  v20's "the driver was passing its turns" fix did not move the number: the hand
  was not the problem, the mana base was. It now reads the same unlock count a
  player does, off the aria-label rather than a private hook.
- **The driver re-bonds Items and presses ✕ CLEAR.** Re-bond is the only route
  into a target pick that does not start from the hand, and it runs 6,538 times
  a run in the headless sim; ✕ CLEAR shipped in v20 and nothing had pressed it
  since.
- **The screen audit measured pack opening at ONE control** — the tear button —
  so the card-by-card reveal and the summary, the two screens a player sees after
  every pack they open, had never been measured at any width. `PRELUDE` entries
  drive a screen into a deeper state before the sweep begins; `pack@reveal` and
  `pack@summary` are the first two.

**Balance — no card changed, third pass running, and the diagnostic is the
finding.** Full numbers in `docs/BALANCE_SIM_FINDINGS_v22.md`.

- v20 left Mer-King named as the corrected instrument's answer and unspent
  behind a pre-registered condition: first in 3+ cohorts AND a random-arm gap
  under +10 in the cohorts that sample it. Six cohorts (the standing four plus
  two new) put it **first in all six**, mean 65.6%, 9.8 points clear.
- **The gate cannot be read as written, because the flag it is phrased in terms
  of fires on a quarter of every reading in the table.** 51 gap observations:
  median |gap| 5.0, max 18.6, `>= 10` on 12 of them, six of nine Leaders
  tripping it at least once. It is at the ~76th percentile of its own
  distribution and selects nothing. Retired as a gate.
- The signature those diagnoses actually keyed on is a **one-signed** gap.
  Mer-King is not one-signed (+3.5 / +11.2 / +12.0 / +9.5 / **−3.3**) and its
  random arm reads above 50% in every cohort that samples it — the two arms
  agree, which is the opposite of the Sentinel shape. **Exactly one Leader in
  the pool is one-signed: Ruin-Walker Overseer** (−8.2 mean, negative in all
  five sampling cohorts, last in the pinned table in five of six). That is the
  Sentinel finding inverted — the suite appears to be UNDER-rating it — and per
  the Sentinel lesson the first move is to understand the instrument, not to
  move the card.
- **v20 carry-forward #5 closed:** the divergence report printed no row at all
  for a Leader the random arm never dealt, which reads as "no flag" rather than
  "not measured" — and cohort D's missing row was Mer-King, the Leader the whole
  table was pointing at. It now prints an explicit `UNSAMPLED` line by name.
  Two of the six cohorts have one (D omits Mer-King; F omits Sentinel and
  Ruin-Walker Overseer). Same failure shape as v14's "clicked 0
  controls" and v20's six empty screens: silence that renders as a clean result.
- The four standing cohorts reproduce v20 **to the decimal** (P1 44.7 / 46.5 /
  46.3 / 44.7, avg turns 20.3 / 21.6 / 21.8 / 21.1, `invariantCount` 0), and
  cohort A was diffed line-for-line against a pre-change baseline: byte-identical
  apart from the timestamped report path. The engine's new log lines are visible
  to the sim only through the one substring it greps for (`'sheds'`), which none
  of them contain.

### v20.0 — The pass where the fixed instrument turned the table over: the CPU's answers stopped being invisible, and the Leader nerfed three times turned out to be near the bottom

Five-part pass in the order the brief asked for: a non-gameplay bug hunt, an
interactive stress round, a match QoL round, a CPU-visibility/flow audit, and
the v19 carry-forward balance items. Full numbers:
`docs/BALANCE_SIM_FINDINGS_v20.md` (supersedes the v19 doc, deleted this pass).
**0 invariant violations across five 5,952-game cohort runs**; 370 tests (6
new, in one new suite); six matches driven end-to-end through the real match UI
with a new mode that drives ❚❚ HOLD and ▸ STEP; 18 meta screens swept two clicks
deep at two widths, six of them populated for the first time.

**Match screen — the CPU's stack answers played out in silence.** v18 closed
the clash reaction window and v19 closed the guard step. The priority window
over the stack was the last one, and the most confusing:

- **The CPU's responses now narrate.** Play a card and the CPU can counter it,
  shatter the unit it was aimed at, or answer with a Quick Event of its own —
  all of which arrived as a single banner over a board that had already
  changed, with no beat, no ring, no card spotlight, and the stack display gone
  by the time anyone looked. `respondToStack` has taken an observer since the
  AI was written and the UI passed nothing; it now feeds the same beat chain as
  every other CPU action, from both call sites (invoking into a window, and the
  loop after the human passes).
- **An attack beat now says what it is aimed at.** v19 rings the CPU's own
  Vitality plate when it declines to guard, because that is what the unblocked
  Might is pointed at. The mirror case — the CPU declaring an attack, the
  louder half — rang the attackers and nothing else. It now rings the player's
  plate too.
- **The CPU's blocking decision gets a beat of its own** ("🤔 …is choosing its
  guards…") before the guard lines land, so the answer reads as a reply to the
  player's attack rather than as part of their own click.
- **FIX: SKIP ▸▸ left ❚❚ HOLD switched on.** A CPU turn is narrated as several
  runs back to back, and a run that starts while paused parks on its own first
  beat — so holding once and then pressing SKIP fast-forwarded the current run
  and froze on the next, once per remaining segment of the turn.
- **FIX: invoking while a target pick was open silently discarded it.** Same
  red bar, different rings, nothing said the first card had been put back. The
  hand now refuses with "finish the current pick first (✕ or Esc to cancel it)"
  — which is also what made the stress driver's hang unrecoverable (below).
- **✕ CLEAR on both selections.** Escape has cleared an attack selection since
  v17 and a guard assignment since v18; neither had a visible control, which
  matters most immediately after ✦ SUGGEST fills every guard line at once.
- **FIX: the hint bar was clipped to one line.** At 9px on a 375px phone that
  is ~60 characters, and the guard hint puts the number it exists to deliver —
  "Unguarded hits incoming: 12 Vitality (you have 9)" — at the end of ~150. Two
  lines on a phone, one above `sm`.

**Harnesses — six screens had been audited with nothing on them.**

- `meta-preview` stubs the seven fields that live in `MetaState`; everything
  else a screen shows it fetches for ITSELF on mount, and the harness is
  offline. So Battle Pass (1 control), Marketplace (4), Friends (5), Missions
  (4), News (3) and Player Shops (8) had been measured as empty states for
  eight passes while the audit printed a clean pass — one of those "controls"
  is the BACK button. A new `src/preview-fixtures.ts` answers PostgREST reads
  offline; the same six screens now measure 28 / 51 / 11 / 7 / 2 / 13.
- **That immediately found a crash.** The mystery-pack pool viewer
  (VIEW FULL POOL) white-screened on `Cannot read properties of undefined` the
  first time a test ever opened it — on three different storefronts. It was an
  incomplete fixture rather than a product defect, and it is exactly what a
  panel nothing had ever reached looks like from the outside.
- `audit:screens` gained `ONLY=<screens>`. A full sweep is ~50 minutes, and
  re-checking one fixed screen used to cost all of it — so in practice a
  mid-pass fix was not re-measured.
- `drive:match` gained a **study** mode. v19 replaced "always SKIP" with "half
  the matches watch" on the reasoning that SKIP turns the CPU's turn off — and
  then shipped ❚❚ HOLD and ▸ STEP onto the same divider, which the driver never
  touched. Study mode drives them and checks what they promise: a held beat
  must not move, and a step must advance by exactly one.
- **FIX: the driver's own bond-pick branch had never fired.** It matched
  `'BOND — pick'` case-sensitively against `innerText`, which the match screen
  uppercases — the same defect v19 fixed for the beat counter and missed here.
  With the branch dead, a bond pick left open was a state the driver could not
  leave, and it hung a match outright once the driver started playing enough
  cards to reach one.
- **The driver only ever played the first third of a match.** Six of six runs
  ended in DEFEAT between turn 6 and turn 8 against a headless average of 21,
  because a miss on one randomly-chosen hand card ended the turn having
  developed nothing. It now walks the hand instead of passing, attacks all-in
  less often, blocks more, and stops throwing Locations away on unspent taps.
- **FIX: `verify:pool` has not run since v17** — no egress to the Supabase host
  — and v18/v19 both argued from the code path instead. It now takes a
  `POOL_SNAPSHOT` JSON export and runs its identical checks offline.

**Catalog — one real drift, two passes old.** Running those checks found
`cards.essence_cost` for Sovereign of the Dying Star still at the pre-v18 price
(generic 3, total 5) against the pool's derived total of 4 — v18's shipped
reprice, never synced, in the column every server-side reader prices from. One
row in 297; the template digest, rarity columns and every other derived column
are in exact parity. The client derives its own mechanics and was never wrong,
so no player's board was affected. **The live row was left for a human to
apply** — the exact statement is in the findings doc.

**Balance — the instrument was widened and the table turned over.**

- **The pinned Leader suite was three decks on ONE recipe.** v16 added decks #1
  and #2 and v19 concluded the pinned row was "substantially its three pinned
  decks"; reading the two builders side by side shows it was narrower than
  that. `randomArchetype` varies four things per deck — a 2–3 keyword subset, a
  1–3 effect subset, 32–40 units, 4–6 sanctums — and the pinned builder varied
  none of them. All three decks were the same archetype with different jitter.
- **Nine decks on nine recipes**, sampling the same axes, still seeded on the
  Leader id alone so the suite stays pinned across cohorts. Per Leader 432
  games, up from 336, over three times as many distinct builds.
- **Sentinel of the Nether Pit: 61.9 / 60.7 / 58.0 / 61.6 → 43.5 / 44.0 / 43.1
  / 48.6.** First in all four cohorts for four passes, nerfed three times for
  it, and it lands near the bottom. Its divergence gap collapses from a
  one-signed +18.1 mean to +2.5. **Void Mother** comes off the floor
  (35/35/42/40 → 47.5/43.8/42.4/43.8) and its cancelled rework stays cancelled.
- **The new top is Mer-King**, first in all four cohorts at a 65.2% mean, and
  the only Leader whose random-deck arm agrees on the finish. It is deliberately
  **not** touched this pass: the suite it tops has one pass of history, and
  spending a lever against a one-pass-old instrument is the mistake this project
  just spent four passes making in the other direction.
- P1 win rate and average game length reproduce v19's shipped table **to the
  decimal** on all four cohorts, and cohort A was re-run after the UI round and
  diffed byte-for-byte — the whole change is inside the suite.

### v19.0 — The pass where the instrument was the bug: the CPU's blocks stopped being invisible, the Battle Log stopped opening on the wrong end, and four passes of nerfs turned out to be reading a deck list

Five-part pass in the order the brief asked for: a non-gameplay bug hunt, an
interactive stress round, a match QoL round, a CPU-visibility/flow audit, and
the v18 carry-forward balance items as sequential measured trials on the
standing four 5,952-game cohorts. Full numbers:
`docs/BALANCE_SIM_FINDINGS_v19.md` (supersedes the v18 doc, deleted this pass).
**0 invariant violations across 95,232 games**; 364 tests (5 new, in one new
suite); 8 full matches driven end-to-end through the real match UI, half of
them _watching_ the CPU's narration rather than skipping it, with zero
findings.

**Match screen — the CPU's blocking decision is no longer invisible.** v18
closed "the CPU's clash tricks played out in silence" for the reaction window.
The step immediately before it was still silent, and more visibly so:

- **The CPU's guards now narrate.** `declareGuards` writes nothing to the
  engine log — it is pure state — so when you declared an attack, the guard
  lines simply _existed_ on the next frame. No beat, no ring, no animation, and
  the entire report was a banner counting them ("Kuro assigns 2 guard line(s)")
  that named neither a blocker nor the attacker it stopped. There is now one
  beat per guard line, naming the attacker and every blocker on it, with the
  blockers ringed yellow and the attacker they intercept ringed red — then a
  closing beat for whatever is still coming through, ringing the CPU's own
  Vitality plate and totalling the unguarded Might. Pinned by a new test suite.
- **❚❚ HOLD and ▸ STEP.** SKIP was the only control over the opponent's turn
  and it points one way: a player who wanted to _look_ at what just happened —
  read the card in the spotlight, follow the rings to what it hit — had no way
  to stop the beat leaving, only a speed dial that made the next one slower
  too. HOLD freezes the current beat indefinitely; STEP then walks the turn one
  action at a time. Both sit on the clash divider next to ⏱ and SKIP ▸▸, and
  the choice persists across turns.
- **FIX: the Battle Log opened on its oldest line.** It renders oldest-first in
  a ~5-line box holding the last 160 lines, and never scrolled — so opening it
  to find out what the CPU just did showed you ancient history and left you to
  scroll. It now pins to the newest line on open and on every line that arrives
  while it is open.
- **The Battle Log marks where the opponent's turn began** with a "SINCE YOUR
  LAST TURN" divider, so the thing you skipped is one glance rather than a
  counting exercise.
- **HARDENING: the CPU's clash reactions now recover instead of white-screening.**
  They run from the narration timer as of this pass (the guard beats call them
  on the way out), so an engine exception escaping them would land outside
  React entirely. They now recover to the player's turn the same way
  `resolveCpuTurn` already did.
- How to Play gained a "the opponent's turn" entry covering the whole
  vocabulary (rings, spotlight, ⏱ / HOLD / STEP / SKIP, the log divider); the
  in-match coach and Settings mention HOLD and STEP where they already
  mentioned speed.

**Harnesses — three of them were reporting clean by not looking.**

- `audit:screens` was **depth ONE**: one click from a fresh load, then the
  context was thrown away, so nothing that only exists _behind_ a click had
  ever been measured — no modal, no second-level panel. It now descends into
  any first click that reveals controls, a fresh load per (parent, child) pair
  so nothing compounds. That is 70 second-level clicks across six screens that
  used to be invisible.
- **FIX: its settle helper could stop the sweep after ten clicks on a
  1,000-tile grid** and still print a clean pass — two consecutive samples
  landing inside the same render chunk look exactly like a settled screen. It
  now takes the largest count across the window (a control does not
  un-render), and re-queries before believing a short read.
- **FIX: a failed body read was reported as a white screen.** `.catch(() => '')`
  made "the read failed" and "the render crashed" the same finding — a Vite HMR
  reload landing between the click and the read reported two perfectly healthy
  screens as blank. It re-reads before believing it, and says plainly when it
  was the read that failed.
- The offline preview stubbed **empty** inventory, cosmetics and serialized
  prints, so every panel gated on them was measured as an empty state and
  nothing else — the Store's unopened-pack shelf, the cosmetic grids, the
  numbered-print plates. It owns some of each now.
- `drive:match` **always clicked SKIP ▸▸**, on every match — the one control
  that turns the CPU's whole turn off. The entire narration path the previous
  two passes built was therefore never once exercised by the harness that
  exists to exercise the match UI. Half the matches now watch it instead, and
  check that it advances, that it terminates, and that it takes its rings down
  with it (a new stale-ring invariant, plus a narration-stall finding).

**Balance — one lever refuted, one blunder fixed, and the instrument corrected.**

- **Sentinel of the Nether Pit: the third lever in three passes measured
  nothing, and the diagnostic says why.** v18 named the trial and the baseline
  met its condition (first in all _four_ cohorts), so bounding its Ember minus
  to `enemyUnit` was spent and measured: **+0.9 mean, still first everywhere.**
  Reverted. Differencing the sim's two Leader tables — which nobody had done —
  explains all three failures at once: on its own random-deck arm Sentinel
  reads 30.8 / 53.0 / 42.1 / 43.8, a mean **below** the midpoint and _dead last
  in the pool_ in cohort A, against a pinned reading of 62/61/58/62. What has
  been ranked first for four passes is substantially its three pinned decks.
- **The sim now prints that difference on every run**, flagged at `|gap| >= 10`.
  Five of nine Leaders agree between the two arms to within 4 points; the two
  that do not are exactly the top and the bottom of the pinned table — Sentinel
  at +18.1 and Void Mother at −14.1, consistent in sign across all four
  cohorts. The dedicated Void Mother kit look v18 scheduled is **cancelled** on
  that evidence rather than performed.
- **FIX (shipped): the CPU traded its whole Leader to finish off an
  almost-dead unit.** The v16 answer-gate let a self-shattering activation
  through when it "answers a big threat", but for a _damage_ ability that
  condition can only be met against a Might-6+ body already down to 2 Grit —
  one clash from dying anyway. Unconditional removal keeps the discount; a ping
  no longer earns it. Sentinel's self-shatter rate goes **2.7 / 5.6 / 5.2 / 3.3
  → 0.0 / 0.0 / 0.0 / 0.0** with the balance table flat (pinned moves ≤0.6, P1
  and game length not at all).
- **FIX: the lapse counter that was supposed to catch that used the gate's own
  predicate**, so it read 0 through every pass in which it was happening. It
  now also counts the outcome — Leader gone, enemy board no smaller. Validated
  against the old gate, where it reads 5 in cohort A and the old counter read 0.

**FIX (meta):** the deck editor's per-rarity copy-cap comment still named only
Mythic in the 1-copy tier; v7.0 added Alt-Art, which both How to Play §11 and
the rulebook print correctly.

### v18.0 — The watch-the-CPU pass: the opponent's clash tricks played out in silence, a stress driver that plays the real UI, and one scheduled lever that turned out to do nothing

Five-part pass, in the order the brief asked for: a non-gameplay bug hunt, a
gameplay stress test built as a new harness, a QoL round on the match screen, a
CPU-visibility/flow audit, and the two v17 carry-forward balance items run as
sequential measured trials on the standing four 5,952-game cohorts. Full
balance numbers: `docs/BALANCE_SIM_FINDINGS_v19.md` (which superseded this
pass’s own doc; supersedes the v17 doc,
deleted this pass). **0 invariant violations across 95,232 games**; 359 tests
(15 new, in two new suites); 10 full matches driven end-to-end through the real
match UI by the new harness, at phone and desktop width, with zero findings.

**A new harness: `npm run drive:match`.** The balance sim plays tens of
thousands of games straight through the engine and never touches a single
button, so every defect living in the React seam between a click and an engine
call is invisible to it — v17 found five of those by reading. This plays them
instead: Playwright drives `board-preview.html` through whole matches, taking
every action the board offers (mulligan, wellsprings, Leader invokes and
abilities, targeting picks, attacks, guards, both reaction windows, response
windows, the shed picker, the ash drawer, the battle log) and reporting
crashes, console errors, dead ends, and horizontal overflow. It reports a HANG
when the board stops moving with no action offered, which is the interactive
equivalent of the sim's invariant canary. `board-preview.html` now takes
`?seed=` (deck roll AND match RNG, so a run reproduces) and `?speed=`.

**Match screen — the CPU's clash tricks are no longer invisible.** The v17 pass
made the CPU's TURN legible. The audit's brief this pass was the rest of the
sentence, and it found the hole:

- **The CPU's clash reactions played out in total silence.** Its Quick Events
  and Ambush units inside the human's own clash — and inside its own, the
  window v17 had just created — produced engine log lines but no narration and
  no rings: cards resolved, units died, and the board simply changed between
  two of the player's clicks, with one after-the-fact summary banner naming
  what had happened. Those beats now narrate exactly like a CPU turn, with the
  same rings and pacing, because narration is driven by a narration flag
  instead of by "is it the CPU's turn".
- **The card the opponent plays is now held up mid-board while its beat is on
  screen** ("MER-KING PLAYS ⟨card⟩"), with an entrance animation. A name in a
  log line is easy to skim past; the face is not. Card-play and attack beats
  hold ~45% longer than a plain line for the same reason.
- **Declared attackers lean across the clash line** for the length of the
  attack beat, so an incoming attack reads as movement rather than as a ring
  that appeared.
- The board is inert while a narration run is playing (Locations, hand cards
  and the divider's action buttons), so the player cannot fire a Quick Event
  into the middle of a replay of moves they have not been shown yet. SKIP ▸▸
  and the speed control are live throughout.
- **FIX: a response window could hang the match.** `openResponseWindow`'s
  auto-pass path (nothing castable, so pass for the player) bails when the
  player does not hold priority — and one of its four callers did not check
  first, which would have left whatever was paused paused forever with no
  button anywhere that resumed it. The check now belongs to the window.
- **FIX: "you casts Fry's Charm on themselves".** The log humanizer's verb
  table was missing `casts`, so the v13 self-cast Charm line fell through to
  the bare seat-id rule and printed third person against a second-person
  subject. The table (and the reflexive) are now pinned by a test that
  enumerates every `${pid} <verb>` line the engine emits.
- **FIX: stale pulsing rings.** The previous turn's last beat kept its
  actor/target rings on the board right through the next turn's think delay.

**Match screen — QoL.**

- **✦ SUGGEST on the guard step.** Assigning guards by hand is the fiddliest
  thing the board asks for, and the engine already ships the defender-side
  solver the CPU blocks with. That solver now fills the player's guard lines
  as an editable starting point.
- **ALL ×N on the attack step**, and DECLARE ATTACK reads **"⚔ DECLARE ATTACK
  — 3 · 11 MIGHT"** instead of a bare count: whether an attack is lethal was
  arithmetic the player was doing off the cards.
- **Narration speed is in SETTINGS.** It shipped in v17 as a control that only
  existed ON the narration bubble, which only exists mid-CPU-turn — so finding
  it required sitting through a turn at the wrong speed. Guests get it too;
  it is a local preference, not a profile field.
- Tapping an already-pinned hand card closes its preview (it was a one-way
  door for touch), and the Main II hint stops promising "NEXT ends your turn"
  when the button actually reads END TURN (shed N).
- **FIX: `Number('')` is 0.** The narration-speed preference's parser rejected
  a `null` key (the v17 bug) but not an empty string, which is also 0 and also
  a valid index — a cleared key silently selected SLOW. Parsing now lives in
  one tested module shared by the match screen and Settings.

**Meta screens.** `npm run audit:screens` is clean across 18 screens at both
widths. One real bug: **a failed News Center post deletion reported nothing.**
The Creator's delete button wrote its error into the composer's error slot,
which only renders while the composer is OPEN — so deleting from the list and
failing looked exactly like a dead button. Delete now has its own error line
next to the DEV BLOG heading, plus a busy state and a double-click guard.
(Same shape as v17's Deck Box finding.)

**Balance (two carry-forward items, one lever at a time, four cohorts each):**

- **Sentinel of the Nether Pit: the scheduled lever was spent, measured, and
  REFUTED.** v17 named Resolve 5 → 4 if the fresh baseline still had it first
  in 3+ cohorts. It did, so the lever was spent — and it moved the kit −0.75
  points on average, with one cohort going up, while `abilityUsesPerGame`
  did not fall at all (7.95→8.19, 7.24→7.63, 8.53→8.59, 7.65→7.61). The
  Resolve ceiling is not the binding constraint: the kit spends at 3 and
  rebuilds with its +1, so it never banks near the ceiling. **Reverted rather
  than printed**, and recorded in the override table so nobody spends it
  twice. The next lever is named and it is the effect, not the price: bounding
  the Ember minus to `enemyUnit` (dropping the face reach), on the v7.5
  Ethereal precedent.
- **Sovereign of the Dying Star's invoke cost goes 5 → 4 — the first dedicated
  look it has ever had.** Last or next-to-last in all four cohorts (38.1 /
  35.7 / 39.6 / 35.1) with the tightest deck spreads in the suite. Its kit is
  fine — the same `Deal 2 damage to any target` reach Sentinel tops three
  cohorts with, at a third of the price, plus Commander — but it pays a
  Commander cost surcharge on top of an Uncommon's rarity-floor Resolve 3, so
  it carries the joint-highest invoke cost in the pool and arrives on turn
  8.3. Kuro's v7.7 case, feature for feature, and the same price-only lever
  answers it: **44.3 / 45.8 / 50.9 / 41.7**, arrival 8.3-8.5 → 6.7-7.0,
  activations 6.3-8.4 → 7.3-9.0, and it tops no table. Closes. Void Mother is
  now the bottom of the table on its own.
- Sentinel's cohort-C self-shatter donations are promoted from a watch item to
  a named carry-forward: 23.4% win rate in shattered games at n=77 against a
  42.1% average, which is no longer a small-sample caveat.

### v17.0 — The interactive-seam pass: the windows the sims never opened, watching the CPU actually play, and both scheduled Leader levers

Five-part pass: a four-agent bug audit of every non-gameplay screen, an
engine/AI audit aimed at the interactive pause/resume seams the headless
sims never exercise, a CPU-visibility/QoL rework of the match screen, and
the two Leader levers the v16 carry-forward scheduled — run as sequential
measured trials on the standing four 5,952-game cohorts. Full balance
numbers: `docs/BALANCE_SIM_FINDINGS_v17.md` (supersedes the v16 doc, deleted
this pass). **0 invariant violations across 71,424 games**; 344 tests (9 new
`interactive-v17` seam tests); a Playwright drive of a full offline match
end-to-end.

**Engine & rules — the interactive seams.** All found by auditing paths the
CPU-vs-CPU sims can never reach, all pinned by the new test suite:

- **A response window could freeze the human's own card on the stack.**
  Closing a window (PASS or a resolved answer) can leave the CPU holding
  priority; nothing drove its window from there, so the player's card sat
  unresolved — no PASS button, every sorcery-speed action refused — until a
  phase change silently discarded it. The UI now drives the CPU through its
  window, exactly as invoking already did.
- **Two missing rulebook-§6 reaction windows.** The CPU's clash reactions
  were force-resolved straight through the human's response window when the
  human attacked, and the attacking CPU never got its own reaction window at
  all when the human defended — the one place interactive play measurably
  diverged from what every balance sim assumes. `reactionPlays` now honors
  the same pause contract as `playTurn`, in both clash directions.
- **"At Dusk" draws were auto-shed with no choice.** The shed used to run
  from the end of the hand AFTER Dusk triggers drew, so a card drawn at Dusk
  was always the card discarded — and a pre-picked shed was silently
  invalidated. Dusk now asks (engine `chooseShed` hook + `finishDuskShed`):
  the picker opens on the post-trigger hand when it must, and the END TURN
  pre-pick stays cancellable and is honored when it still fits.
- **A Tool "weakens a TARGET enemy unit" — the player now picks it.** The
  bond flow chains to the enemy pick and the engine honors it; autoTarget
  remains the CPU's (unchanged) fallback.
- **The match no longer double-pays on a lost reply.** `record_match_result`
  takes a per-match idempotency UUID (server `match_receipts` dedupe; the
  5-second throttle now returns null instead of raising), so the client's
  reward retry can never record the same match twice.

**Match screen — you can SEE what the CPU is doing.** The audit's brief:
"make sure the user can know what the CPU is doing at all times."

- The CPU's narration beats now light up the board: the acting card pulses
  yellow and its target pulses red while each line shows — wired from the
  AI's structured event stream (the rings' CSS had shipped in v11 but was
  never connected). The Leader thumbnail and both Vitality plates join in
  when they're the actor/target.
- The engine log finally records leader ability uses (with target), invoke
  targets, and per-packet clash damage — so the battle log and narration
  say what actually happened instead of leaving Resolve and damage to move
  "from nowhere".
- Narration speed control — SLOW / NORMAL / FAST, persisted — on the
  narration bubble and the clash divider, with the think-delay scaled to
  match. Narration, battle log and the game-over line are humanized ("You
  invoke…", the opponent by name — not "P1"/"P2").
- Response windows the player can't act in (no castable Quick/Ambush even
  tapping everything) auto-pass with a banner instead of demanding a dead
  PASS click. The guard step shows a live "unguarded hits incoming: N
  Vitality (you have M)" readout, and the confirm button reads "NO GUARDS —
  TAKE N" when that's what it means. Units pop onto the field with an
  enter animation instead of teleporting.

**Balance (the two scheduled levers, one at a time, four cohorts each):**

- **Sentinel of the Nether Pit's minus goes -2 → -3** — the v16 condition
  (first in all four cohorts on the three-deck suite, second consecutive
  pass) came due. Down 2-6 points to 61.0/61.9/58.0/62.2, no longer first
  everywhere; Resolve 5 → 4 is the named next lever if it holds again.
- **Avatar of the Abyss's minus walks back -4 → -3** — the scheduled
  over-nerf correction after its watch pass. From last (35-42%) to
  mid-field (44.9-53.3) on all four cohorts without topping any. Closes;
  the bottom cluster is now Sovereign and Void Mother, with Sovereign next
  in line for a first-ever dedicated look.

**Meta screens — 17 confirmed bugs fixed** (four-agent audit; highlights):
guest quick match enabled (the PLAY AS GUEST button finally leads to the
match it promises; non-creator accounts keep COMING SOON), the daily-login
streak no longer shows a stale count across two midnights, Deck Box claim
failures now show inside the picker dialog instead of under it, the
showcase progress meter stops double-counting approved cards, a mid-flight
pool edit no longer wedges PREVIEW POOL at "CHECKING…", serialized prints
stop stacking premium overlays in the inspector (and its fit-clamp works on
landscape phones), collection counts exclude serialized copies everywhere
the grid already did, network blips stop rendering as confident zeros
("0/100 cards", sold-out mystery listings), BULK ADD no longer opens with a
rejection banner, and the override editor rejects the fractional stats it
always claimed to. Plus the QoL round: marketplace RETRY, close-shop refund
figure, per-rarity bulk-sell busy states, a Deck Builder `beforeunload`
guard, News Center post deletion for the Creator, equip busy chips,
keyboard-reachable disabled menu tiles, and honest deck-curve advice when a
deck is top-heavy AND thin in the midgame at once.

### v16.0 — The Unbreakable pass: the cap was raised and it wasn't the mechanism, the save was a secret heal, and once-per-game finally prints a priceable keyword

The dedicated balance pass v7.7 queued as its top carry-forward and v7.8
deferred. Full findings: `docs/BALANCE_SIM_FINDINGS_v16.md` (supersedes the
v7.7 doc, deleted this pass). Ran as sequential measured trials — baseline,
then one lever at a time, each on four 5,952-game deck cohorts (seeds
1337/42/7/99), zero invariant violations on every run. Every item on the
v7.7 carry-forward list was actioned, closed, or explicitly retired; the
details live in the findings doc, the headlines here.

- **The Unit cost cap now charges for premium keywords — and that alone was
  not the fix.** The base price still clamps at 7, but a positive keyword
  surcharge is charged in full on top, to a ceiling of 9. Twelve cards
  reprinted (audited by before/after pool diff): nine Units price-only —
  the three `Unbreakable` carriers, `familiar_in_the_dark` and
  `vlad_from_accounting` to 9; `phosphor_lich`, `blight_snarler`,
  `grit_and_halftones`, `urnbearer_of_blight` to 8 — and three Events/Items
  recovered the point the old clamp double-docked from their effects
  (`chrysalis_of_the_departed` +2/+5→+2/+6, `the_garden_variety_glock`
  +5/+2→+6/+2, `ruthless_succession` Deal 3→4), closing the v7.8 KNOWN
  ISSUE. Measured with the full surcharge collecting, the Unbreakable delta
  did not move — the v7.7 "the cap is the mechanism" hypothesis is refuted
  on four cohorts, and recorded as such.
- **Unbreakable's save no longer heals the wall.** The v7.5 implementation
  reset marked damage to 0 on every save — a full heal per proc that the
  printed text never promised and that five levers across four passes could
  not price. A saved unit now survives **at the brink** (damage = Grit − 1):
  the killing blow is still defeated, the wound stays.
- **Unbreakable is once per GAME** (was: once per turn). With the price
  collecting, the heal gone, and the text bounded, the keyword reads
  **+9.7/+8.8/+8.6/+8.6 — in band on all four cohorts for the first time in
  its history — with carrier play counts held** (no priced-out signature).
  Rulebook, How to Play, and all three carrier prints updated.
- **Amethyst Starfish closes at Dawn-ping 1** (was 3). The biggest
  un-actioned card outlier (+9.1/+11.7/+8.4/+9.9, cost-refuted) turned out
  to be the recurring `At Dawn, deal 3 damage to any target` beside the
  Reckless — the Wolf/Stone-Bubbles shape again. Two measured steps land it
  at +7.0/+7.4/+4.8/+7.6 with plays held.
- **Sentinel's shatter rate was the CPU donating its Leader.** Resolve 5
  with a -2 spender walks 5→3→1, the +1 builder lifts to 2, and the CPU's
  self-shatter discount fired on any Might-6+ target even when the ability
  was a 2-damage ping that couldn't kill it — 7.8-15.9% of games, and the
  new `shatteredWinPct` diagnostic shows those games won BELOW Sentinel's
  own average (28% vs 46.6% in cohort C). The discount now requires the
  ability to actually answer the threat; shatter rates read 2.2-5.7% and
  the remaining shatters are genuine kill-trades.
- **The pinned Leader suite runs three decks per Leader** (deck #0 keeps the
  v7.7 seed), reporting a per-deck split — and it un-inverts v7.7's
  Legendary Diver verdict: its "last in the suite" was one bad deck roll
  (decks read 39.3/46.4/70.5); the kit is mid-field in all four cohorts.
  Sentinel survives the tougher instrument (first in all four, worst deck
  ≥55%) and goes on the carry-forward list as a real kit outlier.
- **Watch items settled**: `Fate` in band at weight 0 (-1.1 to -3.0, item
  closed); `Scorched-Earth`'s buff candidacy refused (the keyword delta
  swings 34 points between cohorts on three carriers; its dominant carrier
  reads +2-5 everywhere it is drafted); `Sacred` carried, still the most
  cohort-dependent keyword in the file. **Reservation waste retired by
  arithmetic** after five carried passes: ~0.5 essence-turns per game of
  exposure against ~90 spent — noise, and every gating idea risks the
  reaction plays earlier passes fought to create.
- Checked green before and after every trial: typecheck, lint, format, 335
  tests, and the four-cohort sim suite. Live `cards` rows for the 13
  reprinted cards resynced to the database.

### v15.0 — Bug hunt: editing an Item's bond deleted the keyword it grants, and How to Play named a feature-less feature list, a one-set catalog and a rulebook that does not exist

The eleventh bug-hunt sweep. Baseline was green before any change — 332 tests,
`tsc --noEmit`, `eslint` (27 pre-existing warnings, 0 errors), a 144-game
CPU-vs-CPU sim with an empty `invariantViolations`, and `npm run audit:screens`
clean across 18 screens at both widths with 153 control clicks. Nothing in the
green run pointed at any of the four findings below, which is the usual shape:
three of them are text that no assertion reads, and the fourth is a field with
no test and no editor box.

#### The Creator's mechanics override editor silently stripped `bond.grants`

`bond` is one object holding three things: `might`, `grit`, and `grants` — the
keyword the Item hands to whatever unit it bonds to. **28 of the pool's 61 Items
print one** (Aerial, Nimble, Skywatch, …), it is what `effKeywords` in
`engine.ts` reads to give the bonded unit that keyword, and the v14 editor has
boxes for the first two fields only.

`overridesFrom` correctly writes `bond` back as a whole object — it has to,
since it is one field — but it rebuilt that object from the two stat boxes
alone. So `grants` was overwritten with nothing. Nudging an Item's `BOND +MIGHT`
by one deleted its granted keyword from the printed card AND from the
`cards.keywords`-adjacent `mechanics` payload the server stores, while the panel
reported the edit as `OVERRIDDEN: bond` — a stats-only change, which is what it
looked like and not what it was.

This is the same shape as the v14 `pruneOverrides` finding and it is worth
naming: the failure mode of an editor that writes back a COMPOSITE field is
losing the parts of the composite it has no box for. `bond` was the only such
field when it joined `OVERRIDABLE_FIELDS` in v14, and it went in without one.
`grants` is now carried through from the generated card (the only place it
exists — the editor still has no box for it, deliberately: choosing which
keyword an Item grants is a design decision, not a numbers correction). Two
tests cover it end to end through `deriveCardMechanics`: the keyword survives a
bond edit, and clearing both boxes still clears the bond outright.

#### How to Play was wrong in three places, all of them load-bearing

- **§12 calls itself "Using Fry Cards — Every Feature" and did not list CARD
  SUBMISSIONS.** That is the v12 headline feature, a main-menu tile
  (`MainMenu.tsx`), the only screen a player can design a card from, and the
  thing the whole PLAYERS SHOWCASE 2026 set is fed by. A section that promises
  every feature and omits one is worse than a section that promises a summary.
  Added, with the one-full-art/one-video-Mythic per-account limits.
- **§10 claimed "Every card in the game is part of the 'Volume #1' set".** True
  of `cards` today (297 rows, all Volume #1) and false about the game: v12
  pinned every pack to its own `allowed_sets` precisely so a second set could
  exist, `pack_types` already holds an inactive `Players Showcase 2026 Booster`
  waiting on `SHOWCASE_MIN_CARDS`, the Collection has a SET filter, and the
  submissions screen prints a progress bar toward it. Reworded to describe the
  rule (one set per pack) rather than a card count that is about to change.
- **The footer credited "FRY CARDS RULEBOOK V9.0".** There has never been a v9:
  `docs/RULEBOOK.md` prints `v6.0`, the file's own header comment says v6.0, and
  `PlayScreen`'s deck-select strip says "Fry Cards rules v6.0". The one page
  that tells a player which rules they are reading named a document that does
  not exist.

#### The in-app changelog is now a two-entry board

`ChangelogScreen`'s `ENTRIES` carried 33 releases back to "V1.9 and earlier" —
a 610-line file, most of it describing a game (dice placement, Cast Slots,
Shards, Momentum) that no longer exists. It is trimmed to the two most recent
updates and documented as a "what changed since you last played" board rather
than an archive. This file remains the complete history, and
`NewsCenterScreen`'s headline still derives from `ENTRIES[0]`, so the pointer
cannot drift.

#### Checked and clean

- `verify:pool` could not run (the sandbox's egress allowlist blocks
  `*.supabase.co` for direct clients), so the catalog was checked through the
  Supabase API instead: 297 cards, one set, and `serialized_supply` at
  Full-Art 75 / Ultra-Rare 100 / Mythic 50 — which is what How to Play §9 already
  said, so that line needed no change.
- All 73 `SECURITY DEFINER` functions the security advisor flags as
  `authenticated`-executable were checked for a role guard. Every Creator-only
  one (`admin_*`, `creator_*`, `create_news_post`, `delete_news_post`,
  `get_card_submissions`) opens with `perform assert_creator()`. No finding.
- The three inactive `pack_types` rows (including the Showcase booster, which
  would draw from a set with zero cards) are correctly filtered out of the shelf
  by `StoreScreen`'s `is_active && acquisition === 'purchase'` gate.

### v14.0 — Bug hunt: the override editor could not clear a keyword, offered stats to cards that have none, and the screen audit was quietly skipping three screens

The tenth bug-hunt sweep. Baseline was green — 329 tests, `tsc --noEmit`,
`eslint` (27 pre-existing warnings, 0 errors), a 144-game CPU-vs-CPU sim with
no invariant violation, and a clean `npm run audit:screens`. Four of the five
findings below were things a green run does not catch, and one of them was in
the green run itself.

#### The Creator's mechanics override (v13) had two holes

- **Emptying the KEYWORDS box did nothing.** `overridesFrom` correctly diffed
  the cleared box into `keywords: []`, and then `pruneOverrides` threw it away
  — it treated every empty array as "not overridden". So a card whose generated
  keywords Fry deliberately removed printed with them intact, the panel
  reported "No overrides — this prints as generated", and the `cards.keywords`
  column agreed with the wrong card. `pruneOverrides` now prunes `undefined`
  only. Nothing else regresses on that: `overridesFrom` never emits a field
  equal to the generated one in the first place, so an override that reaches
  `pruneOverrides` is always a real edit. The old test asserted the bug
  (`pruneOverrides({ keywords: [] })` → `undefined`); it now asserts the fix,
  end to end through `deriveCardMechanics`.
- **MIGHT and GRIT were offered on all five card types, and only Units have
  them.** Verified against the pool: 0 of 61 Items, 41 Events, 55 Locations and
  9 Leaders carry `might`/`grit`. Typing a number into those boxes on anything
  but a Unit wrote an override the card face never reads, while
  `mechanicsFor` dutifully wrote it into the `cards.might`/`grit` columns the
  server queries — so the database and the printed card disagreed, silently, in
  the one tool built to make them agree. The boxes are now Unit-only.
- **An Item's stats had no editor at all.** All 61 Items keep their stats in
  `bond`, which the editor never exposed, so the one card type whose bond
  budget the roadmap has flagged for a balance pass was the one type whose
  stats Fry could not touch. Added `BOND +MIGHT` / `BOND +GRIT` (Item-only),
  written back as the whole `bond` object since it is one field; clearing both
  clears the bond the way the rules-text box clears text. `bond` joins
  `OVERRIDABLE_FIELDS`.

#### The screen audit was under-testing and reporting a pass

- **`npm run audit:screens` never clicked a control on `howtoplay`,
  `changelog`, `submissions` or `submissions&role=creator`** — including the
  Creator panels the v13 entry added the harness entry for, and whose "152
  control clicks, zero findings" line is what the roadmap cites. The click
  sweep sampled the control count at a fixed 700ms and used it as its stop
  condition; on screens that mount their panels after a fetch settles it read
  0 and stopped at index 0, which prints as `clicked 0 control(s)` and reads
  exactly like "checked, nothing to click". The load pass sampled the same
  count a few hundred milliseconds later and saw 6–13, which is why the two
  numbers in the output disagreed and nobody noticed. Both passes now share a
  `settledControlCount` helper that waits for two equal consecutive samples.

#### Drift and documentation

- **`ALL_SET_NAMES` still said `'Player Showcase'`.** v13 renamed the set to
  `Players Showcase 2026` in `SHOWCASE_SET` and in `submit_card` but missed
  this third copy, so the Store's "Includes: …" line on any pack with a null
  `allowed_sets` advertised a set with no rows in `cards`. Fixed, with a test
  pinning `ALL_SET_NAMES` to `SHOWCASE_SET` so the two cannot drift again.
- **The Item subtype split is 11 Tools, not 15.** Both the v13 changelog entry
  and the roadmap's balance-pass scope said 15; the pool and the live `cards`
  table both say 37 Charms / 13 Weapons / 11 Tools. Corrected in both.

#### Verified clean (no change needed)

- **Live catalog vs. the bundled fallback: identical.** SHA-256 over
  `id|name|type|rarity|set|image|flavor|overrides` for all 297 rows matches
  `generated-cards.ts` exactly, and a second hash over all ten derived
  mechanics fields (cost, pips, essence types, might, grit, keywords, resolve,
  subtype, rules text) matches what `mechanicsFor` derives client-side for
  every card. This is the check `verify:pool` cannot run from a sandboxed
  session; run through the Supabase MCP instead, the way v13 did.
- **Every `admin_*` / `creator_*` RPC calls `assert_creator()`.** All 73 of the
  Supabase linter's `authenticated_security_definer_function_executable`
  warnings were read; each function either gates on `assert_creator()` or is
  legitimately per-caller (`auth.uid()`-scoped). The one non-RPC advisor is
  `auth_leaked_password_protection`, a project setting, still off.
- **Client/server constant mirrors agree**: `QUICKSELL_PRICES` vs
  `card_sell_price`, `maxCopiesForRarity` vs `rarity_copy_cap`, and all six
  `SHOP_*` constants vs `shop_setup_fee` / `shop_base_slots` / `shop_max_slots`
  / `shop_slot_cost` / `shop_maintenance_fee_per_slot` / `shop_min_pool_size`.
- **Engine Vitality is clamped at every gain site** (Siphon, Radiant, Sacred,
  Blessed, heal, self-cast Charm) — checked because the v13 self-cast Charm was
  the newest of them.

### v13.0 — Charms become Items, Fry gets the last word on mechanics, and the database quietly disagreed with the game about 16 cards

Three strands. A **card-type rename with real mechanics behind it** (`Charm` →
`Item`, with Charm/Weapon/Tool as subtypes); the **Players Showcase 2026**
pass — Creator mechanics overrides, a 100-card viability bar, 3D card previews
and the art specs submitters were left guessing at; and the ninth bug-hunt
sweep, whose headline finding was in the live database rather than in the code.

#### Charms are now Items (rules change)

- **The `Charm` card type is renamed `Item`,** and `Charm` becomes one of its
  three subtypes. Everything that used to be a Charm is now an Item; nothing
  changed hands, changed colour, changed cost or changed keywords.
- **The mechanics hash was deliberately NOT re-seeded.** Mechanics come from a
  hash of `id|type|rarity`, so taking the new spelling into the seed would have
  reprinted all 61 Items with different costs, colours and keywords — a set-wide
  rebalance disguised as a rename. `SEED_TYPE` in `cardpool.ts` maps `Item`
  back to `Charm` for hashing purposes, forever, and says so in a comment that
  asks the next person not to "clean it up".
- **Three subtypes, and they are not cosmetic:**
  - **Charm** — the old `Bound`. Goes to the Ash-pile with its unit. New: a
    Charm may be **cast on a player** instead of a unit, resolving as Vitality
    equal to its whole bond (Might + Grit, never above your starting Vitality)
    and going straight to the Ash-pile. That makes a Charm the only Item
    playable with no friendly unit on the field, and gives every Charm in the
    pool a floor it did not have — a dead card in an empty-board hand is now a
    small heal.
  - **Weapon** — the old `Worn`. Survives its unit, sits unbonded on the field,
    re-bonds to another unit for its re-bond cost.
  - **Tool** — new. A Weapon that also **weakens a target enemy unit** as it
    bonds (a permanent -1/-1, -2/-2 at Full-Art and up). It carries one less
    point of bond than a Weapon of the same cost, which is what pays for it.
    11 of the pool's 61 Items are Tools (37 Charms, 13 Weapons, 11 Tools —
    the v13 entry first said 15, corrected in v14 against both the pool and
    the live `cards` table).
  - The three-way subtype roll reuses the old two-way roll's salt and its 60/40
    cut point, so a Charm is _exactly_ the old Bound band and Weapon+Tool are
    _exactly_ the old Worn band. Only the 78..100 slice of the old Worn band is
    new behaviour.
- **The CPU plays both new lines.** It prices a self-cast Charm as the heal it
  is (worth it when the Vitality is actually missing, worth nothing when it is
  not) instead of treating an empty board as making the card unplayable, and it
  aims Tools like the Weapons they are.
- **The database moved with the code** — `card_type`, `card_subtype`,
  `rules_text` and `template.type` for all 61 rows, plus the Deck Box's fill
  bucket, `apply_card_upsert`'s type whitelist and `submit_card`'s. Verified by
  hashing all ten mechanics fields of all 297 cards on both sides: identical.

#### Players Showcase 2026

- **The set is renamed `Players Showcase 2026`,** in the client
  (`SHOWCASE_SET`), in `submit_card`, in `get_showcase_stats`, and on the pack
  row (`Players Showcase 2026 Booster`). Nothing had been submitted or printed
  under the old name, but the migration moves rows anyway so the rename can
  never split the set in two.
- **Mechanics are generated, and Fry can overwrite them.** The review queue now
  carries a mechanics panel pre-filled with the generated cost, Might/Grit,
  keywords, subtype, re-bond/nerf/Resolve and rules text. Editing any field
  diffs it against the generated card and stores only what actually changed as
  a `CardOverrides` object on `cards.template`; the live preview updates to the
  overridden card, and the approve button says `(OVERRIDDEN)` and names the
  fields. Nothing edited back to its generated value is stored, so "opened the
  panel and changed nothing" writes no override, and deleting an override
  restores the generated card exactly.
  - Overrides live on the **template** because the template is the only thing
    the game client loads — writing them to the `cards` mechanics columns would
    have produced a card the server priced one way and the game printed another.
    The derived columns are written from the _overridden_ card for the same
    reason.
  - A keyword the engine does not implement is **rejected**, not printed: an
    invented keyword renders a chip with no rules text and does nothing at all
    in a match. Same for an unparseable cost — the approve button stays
    disabled rather than silently printing the generated one.
  - `creator_bulk_add_cards` gets this for free: it hands each row straight to
    `apply_card_upsert`, which now reads `overrides`.
- **The bar for the set is 100 cards, not 10 submitters.** The old copy quoted
  `POLL_THRESHOLD = 10` _submitters_, which measures interest rather than
  content — ten players submitting one card each is a shelf, not a set. The
  screen now shows a progress meter against `SHOWCASE_MIN_CARDS = 100`
  (pending + approved + printed), and `get_showcase_stats` returns `submitted`
  and `cards_needed` so the bar the screen draws is the bar the backend was
  configured with. The Showcase booster and the Ultra-Rare community poll are
  both framed against it.
- **Every card on the screen is a real, full-size, inspectable card.** The live
  submit preview and the review card print at `full` instead of `standard`, the
  bulk-add grid at `standard` instead of `compact`, and MY SUBMISSIONS stopped
  being a text list — each entry is now the card it would print as, at the same
  size the Collection shows. All of them **open in the 3D inspector on click**,
  the same tilt/glare/flip view the Collection uses.
- **The art specs are printed instead of guessed.** A Fry Card is 2.5in x 3.5in
  (5:7) and the framed template insets a 4:3 art window, so: standard frame
  **4:3 landscape** (~1600x1200); full art **5:7 portrait** (~1500x2100);
  video Mythic the same **5:7 portrait**, short, silent and loop-clean. The
  submit form shows the spec for the treatment selected, and the rules panel
  prints the whole table with the reason for each.

#### Bug hunt v13

- **The live database's `essence_cost` disagreed with the shipped game on 16
  cards.** `apex_nanite_shinobi`, `ashen_circle_rite`, `astral_shoal`,
  `blind_colossus`, `bubble_harvest`, `cruel_effervescence`, `flesh_to_bone`,
  `goldstream_conjurer`, `kinetic_overflow`, `obsidian_swordfish`,
  `shattered_horizon_protagonist`, `slate_scaled_serpent`, `submerged_starfall`,
  `swirling_ink_cloud`, `the_chimney_snacker` and `whale_fall_ceremony` were
  each stored one generic essence more expensive than `cardpool.ts` derives —
  a `COST_ADJUST` balance pass that shipped in code and never ran `db:sync`.
  Every other mechanics field on every one of the 297 cards matched exactly,
  which is what made it invisible: the _game_ was right, and only the server's
  own reads (`pick_deck_bucket`'s cheap-first ordering for Deck Box builds, and
  anything pricing off `essence_cost`) were wrong. Corrected in place, and the
  whole-pool hash now matches the bundle field for field.
- **Seven RPCs were executable by `anon`.** `submit_card`,
  `withdraw_card_submission`, `get_card_submissions`, `get_showcase_stats`,
  `creator_review_submission`, `creator_bulk_add_cards` and
  `creator_set_submission_ban` still carried Postgres' default
  `EXECUTE TO PUBLIC`, which `anon` inherits — every other RPC in the schema had
  had it dropped years of migrations ago. Each of them starts by requiring
  `auth.uid()` (or `assert_creator()`), so an anonymous call could only ever
  raise, but being reachable at all is the finding. Note that revoking from
  `anon` by name does nothing here: the grant is on `PUBLIC`.
- **`deck_card_cost` had a role-mutable `search_path`** — the one function in
  the schema that did. It touches only `pg_catalog` jsonb functions, so it is
  pinned to the empty path.
- **Both foreign keys on `card_submissions` were uncovered by an index**
  (`reviewed_by`, `approved_card_id`), so the review-queue join and any delete
  on either parent had to seq-scan. Indexed.
- **The layout harness had never seen the Creator's panels.** `meta-preview`
  always mounted a `player` profile, so the review queue, the new override
  editor and BULK ADD were invisible to `audit:screens` at every width. A
  `SCREENS` entry may now carry extra query string and
  `submissions&role=creator` is in the list. Eighteen screens, 152 control
  clicks at 375px and 1280px: zero findings.
- Not fixed, and outside anything reachable from here: Supabase Auth's
  **leaked-password protection** (HaveIBeenPwned) is still off. It is a project
  auth setting rather than a schema object, so it wants a dashboard toggle.

### v12.0 — Player Showcase: players design the cards, and the set that holds them stops leaking into the ones that shipped

Two things at once: a **player card-submission pipeline** with a Creator review
queue and a bulk importer behind it, and the eighth bug-hunt sweep — which this
time was driven by the feature, because building a second set is what finally
exercised every code path that had quietly assumed there was only one.

#### Player Showcase (new)

Reachable from the main menu (`CARD SUBMISSIONS`).

- **Players submit as many cards as they like.** Each submission is an art link
  (a Midjourney URL or any https image), a card title, a card type — Unit,
  Charm, Event or Location — and flavor text. No rules text: mechanics are
  assigned by the game, not written by hand, so there is nothing to write.
- **One full art per account, per set. One video Mythic per account, per set.**
  Enforced twice, on purpose. `submit_card` counts a pending _or_ approved
  request as holding the slot, so the form can grey the option out before the
  player fills it in; and `creator_review_submission` re-checks it against what
  actually got **printed**, which is the check that matters — the Creator picks
  the rarity, so a cap on what was _asked for_ would not be a cap at all.
  Withdrawing a pending submission frees the slot.
- **Fry picks the rarity and every other attribute, and can deny anything.**
  The review queue prints a live card preview at the rarity being considered —
  a real one, run through the same `cardpool.ts` assignment every client uses,
  not a mock-up — and approving mints the actual `cards` row: id, name, type,
  rarity, set, art, flavor, plus all eight derived mechanics columns.
- **Video Mythics need video.** A `video Mythic` submission must point at an
  `.mp4`, `.webm` or `.mov`; every other treatment must not. `CardFaceV4`
  decides between `<img>` and `<video>` on the file extension, so the mismatched
  case is not a policy question — it is a blank card face.
- **A disallowed-theme submission is a ban, not a denial.** The rules panel
  lists what qualifies in plain language, submitting requires ticking that you
  have read it, and `DENY + BAN` sets `profiles.submissions_banned`, records the
  reason, and denies the rest of that account's queue in the same transaction so
  nothing slips through behind the offending card. The ban is scoped to
  submissions — everything else about the account is untouched — and is
  liftable from the same panel.
- **The Ultra-Rare community poll is announced, not built.** If enough players
  submit, Fry picks a shortlist of favourites and puts them to a vote, and the
  winners print at Ultra-Rare. The screen says so and shows the live submitter
  count from `get_showcase_stats`; the ballot itself is roadmap work, and the
  roadmap says so rather than the UI implying a feature that does not exist.
- **Bulk add (Creator).** Paste a JSON array or one card per line as
  `name | type | rarity | image url | flavor` (optional 6th column set, 7th id).
  Tabs and pipes beat commas — flavor text is full of commas and a comma split
  shears it in half. Types and rarities normalise across casing and
  hyphen/space/underscore; ids default to a slug of the name; a header row is
  skipped; `#` comments and blank lines are ignored. Every row is validated
  client-side first, then **written one at a time server-side**, so one bad row
  in two hundred reports itself by row number and the other 199 still land. 34
  unit tests cover the parser and the payload builder; the server path was
  exercised live against the real project (batch of ten with seven deliberate
  failures: bad id case, unknown type, unknown rarity, `http://` art, missing
  set, an id that collides with a shipped card, and a duplicate inside the
  batch — three inserted, seven reported, nothing rolled back).

#### The bug hunt: one set was load-bearing in four places

None of these were reachable before there was a second set. All four were live
the moment one existed.

- **Every pack drew from the entire card table.** All seven `pack_types` rows
  shipped with `allowed_sets = null`, which `grant_pack_contents` reads as "the
  whole catalog" — so the first approved Player Showcase card would have started
  appearing in Volume #1 boosters, box toppers and the Daily Free Pack, silently
  re-weighting the published odds of every pack in the store. Each row is now
  pinned to the set it is named after. Verified with 400 set-restricted draws
  across all seven rarities: zero leaks in either direction.
- **The Deck Box built out of every set too.** `pick_deck_bucket` had no set
  filter at all, so a starter Deck Box would have handed new accounts
  community cards. It takes a `p_sets` argument now, and `claim_deck_box` passes
  the Deck Box pack row's own `allowed_sets` rather than a hard-coded name.
- **The Collection browser had no way to tell the two sets apart.** It filters
  by type, rarity, colour and text, and printed the set only inside the card
  inspector. There is a set filter now, and it appears only once more than one
  set actually exists. It is also included in CLEAR FILTERS, which is the same
  hole the colour filter had in v10.
- **`ALL_SET_NAMES` was a one-element constant** feeding the Store's
  "Includes: …" line for packs with a null `allowed_sets`. With every pack now
  pinned that fallback should be unreachable, and the constant says so.

Three more, found while writing the feature rather than by reading:

- **`jsonb_typeof(NULL)` is `NULL`, not `'null'`.** The first version of
  `apply_card_upsert`'s "mechanics are required" guard was
  `jsonb_typeof(v_mech->'essence_types') <> 'array'`, which is `NULL` — and an
  `IF` reads `NULL` as false — for the exact payload it existed to catch: one
  that omits the key. A card written with no `essence_types` is legal in every
  Leader's colour identity, because `pick_deck_bucket` and `save_deck` both
  grade legality with `coalesce(essence_types,'{}') <@ identity` and the empty
  set is a subset of everything. Caught by the test that was supposed to prove
  the guard worked; the comparison is coalesced now.
- **…and the fix immediately over-corrected.** Requiring `rules_text` on every
  card would have refused to print a vanilla Unit — 29 of the 131 live Units
  print with no rules text, and `scripts/audit-blank.ts` states the rule
  outright ("Units are allowed to be vanilla; every other type is not"). Caught
  by deriving 25,600 cards across every type/rarity pair and checking the
  invariant: blank text appears for Units and nothing else. The requirement is
  now per-type.
- **Packs never apply the per-rarity copy cap** — `rarity_copy_cap` is called
  from exactly one function in the entire database (`save_deck`), yet
  `PackPull.converted_to_credits` / `credit_value` document a
  convert-to-credits path and `PackOpening.tsx` branches on it in fifteen
  places. `grant_pack_contents` always grants the card and hard-wires
  `credits_gained` to 0, so all of that UI is unreachable and a player can hold
  five copies of a Mythic they may only ever play one of. **Not patched**:
  wiring it up changes what packs pay out, so it is filed with the other open
  economy calls in `docs/ROADMAP.md` rather than decided here.

#### The harness the last pass told you to re-run did not exist

v11's roadmap entry ends "re-run the harness before assuming a phone regression
exists". There was no harness to re-run — the v11 measurement was ad hoc and was
never committed, so the instruction pointed at nothing and the next pass would
have had to rebuild it from the prose. It is a script now:
`scripts/audit-meta-screens.ts`, wired up as `npm run audit:screens`, same
dev-server contract as `audit:cardface`. Every screen `meta-preview.tsx` mounts,
at 375px and 1280px, then each screen's visible controls clicked one at a time
on a fresh page load, checking for horizontal overflow, a render that threw and
a console error that is not merely the offline preview's dropped socket. Exits
non-zero on any finding.

This pass's run: **seventeen screens** (the sixteen from v11 plus the new
submissions screen), both widths, **144 individual control clicks**, and
**zero findings** — no overflow, no thrown render, no blank page.

#### Notes

- `submissions_banned` / `submissions_ban_reason` are new on `profiles`.
- New table `public.card_submissions` (RLS: a player reads their own rows, the
  Creator reads all; every write goes through an RPC — verified by attempting
  direct INSERT/UPDATE/DELETE as the `authenticated` role).
- New RPCs: `submit_card`, `withdraw_card_submission`, `get_showcase_stats`,
  `get_card_submissions`, `creator_review_submission`,
  `creator_set_submission_ban`, `creator_bulk_add_cards`, and the internal
  `apply_card_upsert` (EXECUTE revoked from `anon`, `authenticated` and
  `public`; it is only ever called by the two Creator RPCs above).
- `deriveCardMechanics(template)` is now exported from `cardpool.ts` — the
  single-card counterpart to `applyCardPool`, and the reason a server-minted
  card arrives with its mechanics columns already filled instead of waiting on
  the next `npm run db:sync`.
- **An approval is not finished until `npm run fetch:cards` is re-run and the
  bundle committed.** Until then `npm run verify:pool` correctly reports every
  new card as `live-only — missing from generated-cards.ts`, and the offline
  fallback plus every balance sim are running on a catalog the live game no
  longer matches.

### v11.0 — Deep bug hunt: three numbers the engine and the CPU disagreed about, and a layout audit that found nothing

Seventh bug-hunt sweep. Run differently from the last six, because the six
before it had already taken the easy ground: instead of reading for defects, this
pass tried to _measure_ them, and only read where a measurement pointed.

What was measured, and what it said:

- **The match board, played end to end in a real browser.** `board-preview.html`
  driven by Playwright through complete narrated matches — mulligan, wellsprings,
  invokes, the shed picker, guard assignment, clash resolution, game over — at
  1280×900. Zero console errors, zero unhandled rejections, no stuck states.
- **Every meta screen, at phone width, twice.** See the harness note below.
  Sixteen screens, `documentElement.scrollWidth === innerWidth` on all of them,
  zero interactive elements outside the viewport — and the same after clicking
  each screen's ~100 visible controls one at a time on a fresh load.
- **The whole server surface.** All 110 `public` functions read against their
  client callers: every `.rpc()` name and argument set in `src/lib/supabase.ts`
  resolves to a live signature, every `admin_*` entry point gates on
  `assert_creator()`, and the client's mirrored constants (`QUICKSELL_PRICES`,
  the `SHOP_*` economy numbers, `BP_XP_PER_TIER`, `minBidFor`, the daily-pack
  cooldown) all still equal the SQL they mirror. The 66 `authenticated`-callable
  `SECURITY DEFINER` advisories are the app's design, not findings.
- **Card conservation across 120 full AI matches.** Every card instance
  accounted for in exactly one zone at the end of every turn — no leaks through
  the stack, the ash-pile, the void, worn Charms or the Location row.

The actual finds were all in one place: **three numbers where the engine and the
CPU's combat model gave different answers for the same board.** That class does
not crash, does not violate an invariant, and does not show up in the soak fuzz,
because each side is internally consistent — it only shows up if you compute
both and compare them, which is what `bughunt-v11.test.ts` now does.

- **Overrun's guard absorption was charged across BOTH clash sub-steps.**
  `resolveClash` kept one `absorbed` map for the whole clash, and the only
  attacker that can assign damage in one sub-step and spill in the next is a
  Doublestrike one. So a Doublestrike + Overrun attacker whose guard died to its
  first strike computed its normal-step spill as `Might - Might` = 0: the entire
  second strike vanished. A 5/5 Doublestrike/Overrun into a 5-Grit wall dealt
  **0** to the defender's Vitality where the CPU's own guard model had budgeted
  for 5. The map is now per sub-step — blocked is still blocked, but a strike
  already paid for does not pay for the next one. Behaviour is byte-identical
  for every non-Doublestrike attacker (they only ever participate in one
  sub-step, so the map was always empty when read).
- **`chooseAttackers` counted a Doublestrike attacker's face damage once.**
  The engine sends an unguarded Doublestrike unit into the defender's Vitality
  in _both_ sub-steps; the all-in lethal check added its Might a single time.
  `chooseGuards` has priced the hit at ×2 since v10, so the two halves of the
  CPU disagreed: it would decline a swing its own defensive model knew was
  lethal. Two live carriers in the pool (`familiar_in_the_dark`,
  `phosphor_lich`).
- **Neither CPU model subtracted the defender's Bulwark Sanctums.**
  `damagePlayer` shaves 1 per Bulwark Sanctum off every face packet, floored at 0. Attacking, that made an "exactly lethal" all-in read as won when it was
  not, and dragged the rest of the board into a losing attack behind it.
  Defending, it made a survivable attack read as lethal and forced a chump block
  to prevent damage the Sanctum was already preventing. Three carriers in the
  pool. Applied per packet on both sides now, which is how the engine applies it.

Also in this pass:

- **The offline layout harness covers the whole app.** `meta-preview.html` now
  mounts `store`, `market`, `shops`, `battlepass`, `achievements`, `news`,
  `settings`, `menu`, `howtoplay` and `changelog` alongside the six screens it
  already had, with stubbed `pack_types` / `shop_items` rows so the Store shelf
  and its odds modal render at full size rather than as an empty state. This is
  the roadmap's own "extend the harness as screens are covered" item, and it
  retires the "still unmeasured on a phone" list outright — the answer turned
  out to be that there was nothing there.
- **Manual corrections.** The README said the game has 8 Leaders; it has 9
  (Void Mother was missing), and two of the eight it did list were named by
  their card _id_ rather than their printed name — `crimson_vector_commander`
  prints as **Sentinel of the Nether Pit** and `apex_nanite_shinobi` prints as
  **Kuro, the Unseen**. The id/name split is now called out, since
  `LEADER_COLORS` keys off the id. The "292-card pool" figure was stale in four
  places (roadmap, fuzz suite, sim harness ×3); the live catalog and the bundled
  fallback both hold **297**.
- **`chooseAttackers` is exported.** For the same reason `chooseGuards` already
  was: it is a damage model, and the only way to pin it against what the engine
  deals is to call it on a built board.

Carried forward, not fixed: `Alt-Art` is a fully-plumbed rarity — ladder
position, copy cap, sell price, its own card template — with **zero** rows in
`public.cards` and no pack weighting it, so no player can obtain one. Nothing
misbehaves today, but the tier is either a Volume #2 deliverable or dead
plumbing, and printing cards is a content change. See the roadmap.

### v10.0 — Deep bug hunt: a cosmetic entitlement, a mis-modelled clash, and legality that stopped at card count

Sixth bug-hunt sweep, run the same way — six audits in parallel over the engine,
the CPU, the match UI, the meta/economy screens, the deck/market/social
surfaces, and the Supabase RPC layer. The engine came back clean this time: the
whole v9.0 clash-math batch (Hardened lethality, net-damage triggers, fizzled
riders, the Dusk drain) verified as correctly applied with no regressions, and
the only rules-doc drift was one word (Exhume returns a _random_ Unit; the
rulebook table had lost the word the engine and card text both print). The finds
were spread across the CPU's combat model, the match view's clash decorations,
two server RPCs, and one server entitlement bug.

- **A paid, season-pass-exclusive cosmetic could be equipped without owning it.**
  The server's `equip_cosmetic` computed "free" as `cost_credits = 0 OR
cost_vouchers = 0` — but a `cost_vouchers` of 0 means "not voucher-purchasable"
  everywhere else in the app, not "free". The live banner _Into the Pines_
  (799 credits, `is_season_pass_exclusive`, `cost_vouchers = 0`) was equippable
  by any authenticated player straight through the RPC. Free now means
  `cost_credits = 0` **and** not season-pass-exclusive, matching the client's
  `usable()`. The identical logic had been fixed client-side in an earlier hunt;
  the server kept the loose predicate. (Supabase migration.)
- **The CPU mis-modelled six kinds of clash and lost material to it.**
  Doublestrike dealt its packet once in every unit-vs-unit calculation though
  the engine strikes in both sub-steps, so the CPU donated guards to
  Doublestrike attackers and mis-scored Doublestrike blocks; `attackerKills`
  ignored a Quickstrike guard's pre-kill, so the CPU walked units into
  Quickstrike walls for a one-for-zero it scored as a favourable trade; the
  Overrun-spill and all-in-lethal math credited a guard its full grit against a
  Venomous attacker (which marks only 1) and omitted Hardened's +1 absorption,
  so it skipped chump blocks that would have lived and false-flagged non-lethal
  all-ins as lethal; and `invokePriority`'s "no legal target" penalties were
  swamped by its `cost*10` base, so a cost-5 dead spell cast into an empty board,
  a sweep fired at nothing, and a cheap creature with a fizzled enters-rider was
  withheld. Each was verified with a direct repro; the 2208-game sim keeps zero
  invariant violations and a stable win rate.
- **Deck legality stopped at card count.** `save_deck` graded `is_valid` on
  "60–100 cards" alone, so a color-illegal deck — built by swapping the Leader
  after the fact, or importing a deck code the editor flags — saved as valid,
  showed the green LEGAL badge, and was offered in the match deck picker. It now
  also requires every card's color identity to sit inside the Leader's, matching
  the editor's own rule. Separately, `save_deck` reserved Leader copies with a
  bare `owned > 0` check that never subtracted other decks' claims, so two decks
  could "exclusively reserve" the same single Leader and leave quicksell seeing
  `locked > owned` forever; it now uses the same per-copy reservation as the
  card list. (Supabase migrations; no existing deck was mis-graded.)
- **Match-view clash decorations lingered a full step past the clash.** The
  defender's Vitality plate flashed "hit" for an attacker whose guard was killed
  in the reaction window (blocked-is-blocked means no face damage; the flash read
  the live guards map instead of the declare-time `guardedOnce` snapshot the
  engine uses), and after the human's own clash resolved the "RESOLVE CLASH"
  hint, the clash bar, and the attacker/guard rings all stayed on screen until
  the next phase because `g.clash` lingers at `step: 'done'`. Both now clear at
  resolution, matching the CPU-side path.
- **The first-match coach dropped its guard lesson exactly when guards were
  due.** Step 4 ("Opponent's Turn", whose body teaches guarding) mapped the
  guard sub-step to a coach key with no script entry, hitting the
  hide-unknown-stage fallback — so the callout vanished the instant the player
  had to assign guards. The sub-step now shares the "cpu" key so the lesson
  persists through it.
- **Two marketplace sell-form drifts and stale player-facing docs.** The sell
  form invited a quantity above the 20-per-listing cap and a price above
  1,000,000 that `create_listing` rejects outright, and showed a Duration picker
  on fixed-price sales that the server ignores (fixed listings always run 14
  days), so a seller who chose "6 hours" watched the card sit escrowed for two
  weeks. The form now clamps to the caps and shows the picker only for auctions.
  The manual's pack section still promised a copy-cap autosell removed in v7.8,
  its footer read V7.7, and the in-app changelog was a release behind (the News
  "Latest Update" banner reads from it) — all resynced.

Left open, on the roadmap, as decisions or foundation work rather than defects:
the attacker's own-clash reaction window is served non-interactively in the UI
(the human is denied a response it is entitled to, and the CPU's post-guard
reaction window is unreachable from a real match) — both live in the priority
hand-off that the server-authoritative PvP work will rewrite; the bounty
sell-tile still can't mirror the server's Serialized reservation exactly until
`get_daily_bounties` returns the quantity/foil split (part of the sell-model
decision already logged); and a latent Tidecaller/Doublestrike double-fire that
no legal deck can currently field.

### v9.0 — Deep bug hunt: clash math, dead events, and a leaking Dusk

Fifth bug-hunt sweep, run wide: five parallel audits over the engine, the CPU,
the match UI, the meta/economy screens, and the Supabase RPC layer. The
backend came back clean where it counts — RLS exposes only `SELECT` policies, so
every economy mutation is forced through the `SECURITY DEFINER` RPCs, and the
card-removal paths (`create_listing`, `create_shop_listing`, `submit_mystery_pool`,
`sell_bounty_card`) all reserve deck locks and Serialized prints the same way
`quicksell_cards` does. The finds were in the engine, and they change who wins
clashes.

- **Hardened guards were unkillable in clash by any single attacker.** The
  attacker only ever assigned `remainingGrit` to each guard, and `damageUnit`
  then shaves 1 off the packet for Hardened — so a 3-grit Hardened guard took 2
  marked and lived, no matter the attacker's Might, and a Venomous attacker's
  single point was absorbed to zero (no venom mark either). The printed keyword
  is "damage dealt to this unit is reduced by 1", i.e. a bigger body still gets
  through; the engine had turned it into "cannot be killed in combat." The
  assignment now adds the point Hardened absorbs (`remainingGrit + 1`, or 2 for
  Venom), which also reconciles the engine with the CPU's own kill model
  (`ai.ts` `packetDamage` already assumed the guard dies to `Might − 1`), so the
  AI stops attacking into walls it thought it could break and declining blocks
  it thought would die. Found independently by two of the five audits.
- **A clash hit fully absorbed by Hardened still "dealt clash damage."**
  `resolveClash` recorded the source from the _pre_-mitigation packet, so a
  1-Might Tidecaller into a Hardened guard drew a card despite marking nothing.
  `damageUnit`/`damagePlayer` now return the net damage that landed, and the
  `dealsClashDamage`/Tidecaller triggers fire only when a point actually
  connects.
- **Fizzled Events still ran their riders.** An Event whose target was killed in
  response logged "fizzles" and skipped its `onInvoke` — but the Echoing draw,
  the Fate banish, and the Exhume return all fired unconditionally, so a
  countered Event still drew a card, banished the top of the enemy deck, or
  raised a Unit from the ash-pile. Rulebook §6: a fizzled Event "does nothing and
  still goes to the Ash-pile." The riders are now gated on the Event actually
  resolving.
- **Dusk-death triggers leaked past the turn boundary.** `runDusk` drains the
  stack _before_ the Entropic/Blighted/Scorched-Earth sweeps, then hands the turn
  over without draining again — so a dies-trigger from a Scorched-Earth board
  wipe resolved only during the _opponent's_ Dawn, after it had recharged every
  Unbreakable save and ticked Regenerate/Thriving. A martyr's death-shatter that
  should have killed a wall whose save was already spent instead hit a
  freshly-recharged shield and whiffed. A drain now runs after the Dusk sweeps,
  per §6 ("anything put on the stack inside a step resolves before the step
  continues").
- **The CPU Leader burned Resolve on guaranteed-whiff shatters.**
  `runLeaderAbility` valued a shatter against the Warded-only target list, but
  `autoTarget` also excludes Unbreakable units whose save is up — so against an
  all-Unbreakable board the CPU activated a shatter that resolved with no target,
  paying 2+ Resolve for nothing. The two other AI shatter sites already had the
  guard; the Leader path was the one that was missed.
- **The Daily Login panel bricked across UTC midnight after a claim.** The
  minute ticker rolls `today` over so a menu left open past midnight becomes
  claimable again — but the local `claimed` state was never scoped to its day, so
  after claiming, the panel stayed stuck on the "CLAIMED" summary and the new
  day's reward (and the streak) could not be claimed until the panel remounted.
  The claim result now lapses when the day rolls over.
- **First-time keyword teaching could be silently consumed.** The keyword
  auto-introduce popover marked a keyword "seen" the moment it was _scheduled_,
  but the open is deferred by a stagger; a chip that unmounted during the delay
  (card invoked, board unit shattered, hand redrawn) cancelled the popover yet
  left it marked seen forever. The "seen" mark is now deferred until the popover
  actually opens, with an in-flight guard preserving the concurrent-duplicate
  dedup.
- **Two smaller UI-state fixes in the match view.** A framed card's art window
  used `w-full` where its siblings use margin-aware stretch, so its right edge
  and border were clipped 6px past the card; dropped the `w-full`. And a
  half-built target pick made in a response window survived into the CPU's turn —
  the red "PICK A TARGET" bar and target rings stayed up through the CPU's whole
  turn — because `pending` was never cleared when priority passed; it is now
  dropped at both CPU hand-off points.

Left open, on the roadmap, as decisions rather than defects: the mobile
hand-card preview overflows a phone viewport (part of the responsive pass), the
`record_match_result` reward is client-trusted (inherent to the client-side
engine — the PvP/server-authority item), the Unbreakable save wipes _marked_
damage rather than only the prevented packet (a correct fix needs packet-level
prevention, a combat refactor), and the bounty-sell reservation gate uses the
authoritative server's independent-check reading while four other sell surfaces
use a stricter additive one.

### v8.0 — Bug hunt: the resource with no ceiling

Fourth bug-hunt sweep. The headline finding is a rules bug the engine has
carried since Leaders got their two-ability kits: **Leader Resolve had no upper
bound**, so the resource that doubles as a Leader's hit points ratcheted up
every turn of every game. The two server-side items v7.9 found and left open
("the remedy is a server migration") are also closed here.

- **CI was red on `main` again, the same way, one merge later.** v7.9's own
  headline was that CI had been failing on `main` for ten runs; PR #118 — the
  commit that shipped that finding — merged five files that
  `npm run format:check` rejects (`GameV4.tsx`, `gallery-main.tsx`, `ai.ts`,
  `MarketplaceScreen.tsx`, `PlayerShopsScreen.tsx`), so run 742bfee went red
  on the step v7.9 had just fixed. Reformatted; every CI step passes again.
  The diffs are entirely cosmetic (line wrapping and one redundant paren
  group), which is the point: nothing in the loop runs Prettier before a merge,
  so this recurs until something does. Recorded on the roadmap as tooling
  rather than patched a third time by hand.
- **Leader Resolve had no ceiling.** `activateLeaderAbility` applied its
  ability's `resolveDelta` with a bare `+=`. Every Leader in the pool prints a
  `+1` builder as its second ability (`catalog.test.ts` _enforces_ it: "second
  ability must build Resolve"), and `runLeaderAbility` scores building Resolve
  as "free value", so the CPU fires that builder most turns it has nothing
  better to do — and Resolve climbed past the printed value without limit. A
  printed-4 Leader sitting at 8 needs twice the removal to shatter _and_ banks
  twice as many `-2` activations as its pool is supposed to allow.

  Every other path already respected the printed value as a maximum:
  `Resolute` has read "up to its printed value" since v6.0, `invokeLeader`
  sets `resolve` _to_ the printed number, and `ResolveDots` models it as
  `max`. The builder path was the only one that did not, which is why it
  survived — nothing in the game ever displayed the excess as wrong. Found by
  a soak invariant (`resolve <= def.resolve`) rather than by reading: it
  reproduces at seed 1 turn 15 and in every one of the 40 catalog matches the
  new regression test walks. Capped at `max(printed, current)` so a builder can
  only raise Resolve or leave it alone, never truncate a Leader already above
  its printed value. The CPU no longer scores a builder as value at full
  Resolve either — that bonus alone was enough to beat a genuine zero, buying
  a wasted once-per-turn activation.

  **This wants a balance re-baseline.** It makes every Leader in the format
  measurably easier to shatter and every `-N` ability measurably scarcer, and
  the v7.7 standing rule says a rules change gets its own pass before balance
  trials resume.

- **The Resolve meter told sighted and screen-reader users two different
  maxima.** `ResolveDots` set `title` to `Resolve {n} of {max}` but dropped the
  " of {max}" half entirely whenever `resolve > max`, while `aria-label` read
  `Resolve {n} of {total}` — `total` being the _dot count_, which widens to
  `resolve` in exactly that case. So the one state where the numbers mattered
  was the state where the tooltip lost the maximum and the screen reader
  reported a different one. One label for both now.
- **Deck locks meant two different things on the server (v7.9 carry-forward,
  now fixed).** `save_deck` and `get_listable_inventory` SUM a card's copies
  across every deck; `quicksell_cards` and `assert_cards_available` took
  `max(per_deck)`. `save_deck` is the gate that _creates_ decks and it only
  ever lets a deck take copies no other deck has claimed — so SUM is the
  invariant the stored data actually satisfies, and the permissive reading was
  winning at the point of sale. With 4 copies split 2/2 across two
  legally-saved decks, quicksell saw a lock of 2, sold 2, and left both decks
  reserving copies the player no longer owned and neither one re-saveable.
  Migration aligns both outliers to SUM, matching `save_deck` and all five
  client mirrors. A read-only census found **one real card belonging to one
  real user** already in the divergent state, with no collection yet
  oversubscribed — the fix landed before anything was corrupted, so no repair
  migration is needed.
- **The daily bounty shop ignored deck locks and Serialized prints (v7.9
  carry-forward, now fixed).** `sell_bounty_card` checked only that the player
  owned a copy, so it would sell a card straight out of a saved deck and would
  decrement the non-foil count backing a Serialized print — both of which
  `quicksell_cards` explicitly refuses. Same two guards added, with the same
  error vocabulary, and the ownership decision now evaluated against the
  _post_-sale counts so the checks see the truth. The StoreScreen bounty tile
  had no lock awareness at all (`get_daily_bounties` reports `owned` as the raw
  `quantity + foil_quantity`), so it would have offered SELL and collected a
  raw server error; it now disables the button and says which rule blocked it,
  on the same SUM reading as every other sell surface.

Verified and **not** bugs, recorded so the next sweep does not re-derive them:

- All four `admin_*` RPCs gate on `assert_creator()`. Every dangerous internal
  helper — `transfer_cards`, `grant_xp`, `grant_bp_xp`, `grant_inventory_pack`,
  `grant_pack_contents`, `finalize_sale`, `track_stat`,
  `assert_cards_available`, `recompute_shop_rating`, `settle_shop_maintenance`,
  `ensure_daily_bounties` — already has `EXECUTE` revoked from `authenticated`,
  so Supabase's 66 `authenticated_security_definer_function_executable`
  advisories are all on genuinely player-facing RPCs. The one unguarded
  helper players _can_ call, `settle_expired_listings`, only touches listings
  with `ends_at <= now()`, which is a lazy cron and not an exploit.
- Every client mirror of a server constant agrees with its source:
  `QUICKSELL_PRICES` vs `card_sell_price`, `maxCopiesForRarity` vs
  `rarity_copy_cap`, `xpForLevel` vs `xp_for_level` (and it is the exact
  inverse of `level_for_xp`), and all five `shop_*` constants.
- Card instances are conserved: no zone leaks or duplicates across 120 full
  AI-vs-AI catalog matches, checking every instance in deck, hand, ash, void,
  field, bonded charms, worn charms and Sanctums after every turn.
- `decodeDeckCode` refuses every malformed, over-cap and aggregate-over-cap
  input constructible against it, including Leader ids smuggled into the body.
- Alt-Art's absence from the collection progress breakdown is a `total > 0`
  filter over a live pool that currently prints zero Alt-Art cards, not a
  missing row.

### v7.9 — Bug hunt: the checks that were not running

Third bug-hunt sweep. The headline finding is that CI has been failing on
`main` for at least ten consecutive runs, so the previous two sweeps'
"everything is green" was measured locally and never verified by the pipeline
that was supposed to be gating it.

- **CI was red on `main` and had been for ten runs.** Two independent
  breakages, both in required steps, both invisible because nothing was
  reading the result. (1) `npm run typecheck` failed with
  `TS2307: Cannot find module 'playwright'` —
  `scripts/audit-cardface.ts` has imported `playwright` since v7.4 but the
  package was never added to `package.json`, so `npm ci` never installs it.
  Added as a devDependency, with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` in the
  CI job: the audit is a manual tool run against a local dev server and CI
  only typechecks it, so there is no reason to pull ~500MB of browser binaries
  on every install. (2) `npm run format:check` failed on nine files.
  Reformatted. Every CI step (typecheck, lint, format:check, test, sim, build)
  now passes.
- **A Leader ability with no legal target burned Resolve for nothing.**
  `activateLeaderAbility` spends the ability's Resolve — and shatters the
  Leader outright when that takes it to zero — whether or not the effect
  finds anything to resolve against. The CPU has guarded itself against this
  since v6.9 (`runLeaderAbility`, "burned Resolve on guaranteed whiffs"); the
  human's ability pill was still enabled, so clicking
  `avatar_of_the_abyss`'s "-4: Shatter a target enemy unit" into an empty or
  entirely-Warded enemy board cost four Resolve and did nothing — and at
  Resolve 4 it killed the player's own Leader to do it. `leaderAbilityWhy` is
  now a pure, exported, unit-tested predicate that disables the pill in that
  case. Abilities that can legally hit a PLAYER (`anyTarget` damage,
  `friendlyAny` heal) are deliberately unaffected — those still have a legal
  target on an empty board.
- **Deck locks mean two different things on the server.** `save_deck` and
  `get_listable_inventory` SUM a card's copies across every deck (a deck
  exclusively reserves its copies); `quicksell_cards` and
  `assert_cards_available` take `max(per_deck)` (decks share physical copies).
  The two disagree, and the permissive one wins at the point of sale: with 4
  copies of a card split 2/2 across two legally-saved decks, quicksell sees a
  lock of 2 and will sell 2, leaving both decks reserving copies the player no
  longer owns and unable to be re-saved. `CollectionScreen`'s client-side
  mirror stays on the stricter SUM (it was already SUM despite a comment
  claiming it mirrored `quicksell_cards`; the comment is corrected) — awaiting
  the server-side alignment.
- **The daily bounty shop ignores deck locks and Serialized prints.**
  `sell_bounty_card` checks only that the player owns a copy, so it will sell
  a card straight out of a saved deck and will decrement the non-foil count
  backing a Serialized print — both of which `quicksell_cards` explicitly
  refuses ("in use by one of your decks", "You own a Serialized copy"). The
  StoreScreen bounty tile mirrors the RPC and offers no warning either. Not
  yet fixed: the remedy is a server migration.
- **Guest quick match is unreachable.** `PlayScreen` has a guest branch
  ("QUICK MATCH", "the only way to play as a guest") and `MainMenu` gates
  every other tile on `guest`, but `App`'s `case 'play'` requires
  `profile?.role === 'creator'` and a guest has no profile — so the PLAY tile
  is disabled for guests and that whole branch, plus its comments, is dead.
  Left as-is: enabling guest quick match vs. deleting the branch is a product
  call, not a bug fix.

### v7.8 — The screens nobody had measured

Product pass: mobile third pass, accessibility, the deck guide, and a
twelve-finding bug hunt. No balance trials were run — the v7.7 top
carry-forward (`Unbreakable` and the Unit cost cap) is a content-scale rules
change and keeps its own dedicated pass, per the v7.7 standing rule against
interleaving content changes with balance trials.

- **Mobile, third pass.** v7.4 did the match board and v7.5 the card views;
  this pass covers what was still unmeasured on a phone: the Store,
  Marketplace, Player Shops, Social and Profile screens, the player-profile
  modal, and the 3D card inspector. Tap targets to 40px, modals capped to the
  viewport, wrapping rows instead of horizontal scroll, long usernames
  truncate instead of pushing buttons off-screen, and the 3D inspector drops
  its card-height budget below `sm` so the metadata column stays above the
  fold. `meta-preview.html` gained `?screen=profile`, `?screen=inspect` and
  `?screen=social` harness routes.
- **Accessibility pass.** Global `:focus-visible` ring (there was none),
  `role="alert"`/`role="status"` on notices, labelled progress bars,
  `sr-only` units on credit/voucher chips, aria-labels on icon-only buttons
  and placeholder-only inputs across the store/market/shops/social/profile
  screens, card-naming action labels in the collection ("Quicksell 1 normal
  copy of …"), pack-opening flip target labelled with an `aria-live` rarity
  readout, and focus management on the trade composer. Contrast audit of all
  eleven themes: four AA failures fixed by minimal nudges (classic red,
  dusty red, purple red, lilac steel); watermelon and neutral reds left as
  deliberate art-direction misses, marked in `themes.ts` with ready-made
  passing values.
- **Deck Guide in the builder.** The sim's knowledge finally reaches the
  player: a panel in the deck editor shows the cost curve against the sim's
  40/40/20 target bands, colour spread with a two-colour workable ceiling,
  closest archetype match, and concrete suggestions ("13 Sanctums is above
  the 4–6 band") — every threshold sourced from `decks.ts`/`colors.ts`
  constants, none invented. Pure logic in `deckAdvice.ts`, with tests.
- **CPU battles gated behind COMING SOON.** The PLAY tile is Creator-only
  while the mode is finished; everyone else sees the tile with a COMING
  SOON! tag, and a route guard covers any other path into the play screen.
- **Copy-cap autosell removed.** Pack pulls past the per-rarity copy cap
  were auto-converted to credits; every pull is now kept
  (`grant_pack_contents` migration; return shape unchanged). The per-deck
  copy rule in `save_deck` and the builder is untouched — that one is the
  rulebook.
- **Leader keyword roll gets its own band.** `roll(seed, 'ldr-kw6', 6)` had
  no free room, so any Leader keyword addition would have re-rolled all nine
  Leaders — the v7.3/v7.5 trap, third appearance. Future Leader keywords now
  draw from a separate frozen-list band (`ldr-kw-next`), mirroring the
  `V75_KEYWORDS` split; the generated pool verified byte-identical before
  and after. Adding Leader keywords is now unblocked, pending its own
  balance pass.
- **Pinned Leader suite promoted to the primary Leader instrument.** Per
  v7.7 §2 (the suite had been seeded with the cohort seed since v6.2, now
  fixed and stable to within a point): the sim report now leads with the
  pinned suite's one-row-per-Leader summary, and the random-deck Leader
  table is relabelled a deck-composition diagnostic
  (`randomDeckLeaderDiagnostic`), no longer the number Leader balance is
  judged on.
- **Bug hunt** (one read-only sweep, twelve findings, all fixed):
  - The CPU never took its first turn when it won the coin flip —
    `afterMulligan` dropped straight into the player's controls, leaving the
    human to manually advance the CPU's phases (~half of matches).
  - The CPU could reserve essence for a response and then be unable to pay
    for it: `respondToStack` refused to tap reserved Locations while its
    affordability check counted them.
  - Exhume's engine pick now matches its printed text — a _random_ ash-pile
    Unit via the seeded engine RNG, not deterministically the oldest.
  - Battle Pass / Achievements / News Center rendered network failures as
    "nothing here yet" — their fetchers swallowed errors so the RETRY path
    was unreachable; they now throw like the rest of the readers.
  - The CPU's deck was rebuilt from scratch on every render of the match
    wrapper; Escape couldn't dismiss an empty shed picker; the BEST PULL
    spotlight kept rendering a quicksold card as kept; three post-claim
    profile refreshes could raise unhandled rejections.
  - Stale copy: How to Play §10 still described 5-card boosters, 36-card
    boxes and dupe protection (all changed in v7.2), §1 omitted the Alt-Art
    copy cap, the footer said V6.9, and the in-app changelog's newest entry
    (which feeds the News Center's LATEST UPDATE banner) was still v7.6.
- **Bug hunt, second sweep** (four parallel read-only sweeps over the engine,
  the meta screens, the board UI and the pure-logic modules; every fix
  verified against the standing rule that the generated pool stays
  byte-identical — confirmed before and after):
  - A response window opened from the CPU-clash reaction window resumed into
    the human's own stage: invoke a Quick Event while the CPU's attack is
    pausing at 'reaction', let the CPU counter, and closing the window set
    the stage to 'play' mid-CPU-clash — the human's RESOLVE CLASH then never
    ran the CPU's Main II/Dusk. The window now resumes to the stage it
    opened from.
  - The mulligan window spanned both players' first turns: `turn === 1` let
    the second player redraw a full 8-card hand for free after watching the
    first player's whole turn, and a Wellspring play (which never set
    `invokedCardThisTurn`) left it open mid-turn. Rulebook §3: before the
    first turn only — now enforced (regression tests added).
  - Tidecaller (and any deals-clash-damage trigger) never fired when the
    unit died dealing its damage — the mutual trade, the most common clash
    outcome. The trigger loop now keeps the dealer instance instead of
    re-finding it on the field.
  - The CPU could shatter its own Leader on a guaranteed whiff: removal and
    weaken abilities were valued against `opp.field.length` while autoTarget
    excludes Warded units, so a Warded-only board burned Resolve (or the
    Leader itself) for zero value. Valued against targetable units now, and
    the CPU's reserved-essence hold is also released on its OWN turn's
    response window — it silently passed on answers its affordability check
    said it could pay for.
  - One transient query failure mid-session read as catastrophic state: a
    failed `fetchProfile` nulled the signed-in profile (wallet blanked,
    every buy button disabled, ProfileScreen stuck on LOADING), and the
    per-user readers returned `[]` on error so a failed load rendered as
    "you own nothing" and the boot effect's bootError/RETRY path was
    unreachable. The readers now throw like `fetchShopItems`; the refreshX
    callbacks keep on-screen state on failure.
  - The trade composer rendered a failed partner-collection load as the
    genuine "No tradable cards" empty state — now a distinct error with
    RETRY. Marketplace's realtime debounce timer leaked across unmount; both
    PlayerShops reloads had no stale-guard, so interleaved reloads could
    commit mixed old/new state; the daily-login panel never re-evaluated
    "today" across UTC midnight (Store's 60s tick, applied); the bulk
    quicksell progress denominator could disagree with what the loop sells.
  - Board UI on touch: a slow scroll across the field lane popped the card
    preview (long-press now cancels on touch-move), Escape couldn't clear a
    guard assignment in progress (symmetric with attacker selection now),
    and a ready Sanctum's ability was unreadable without spending its tap —
    long-press or right-click now inspects.
  - How to Play taught three stale rules: Unbreakable as "always survives"
    (it's once per turn), the reaction window as defender-only (either
    player, rulebook §5), and nothing at all about the stack/priority
    (§6) — all corrected, plus a "Responding (the stack)" entry.
  - The deck guide's spell floor mirrored the auto-builder's vestigial
    `max(8, …)` — its real floor is 14, so 9–13-spell decks got no thin-
    spells suggestion. Pack-odds row merging ignored `card_type`, so a
    type-locked slot could collapse into a typeless neighbour. Deck-code
    import silently accepted malformed entries (`id**3` as 1 copy).
  - RULEBOOK.md overstated Glaciate's stagger: two copies played the same
    turn (or an even number apart) fire in lockstep by design — the doc now
    says so. The Location COST_ADJUST is applied outside the 1–4 base clamp
    (byte-identical today; previously the next point stacked onto a base-4
    Sanctum would have silently vanished, the kunoichi failure one type
    over). Recorded, not fixed (content-scale, belongs to the
    Unbreakable/cost-cap pass): Events and Charms still carry the
    at-the-cap double penalty that v6.7 fixed for Units — marked KNOWN
    ISSUE at both sites. Stale in-code records corrected: the STAT_ADJUST
    v7.5 arrows that never landed, the colors.ts mono-pip fallback claim
    (the hash picks are always adjacent, never equal), rarity tier/animation
    doc-strings, and two probability comments.

### v7.7 — Two cohorts were not enough

Full pass: `docs/BALANCE_SIM_FINDINGS_v7.7.md` (supersedes the v7.6 doc,
deleted this pass). **Four** 5,952-game deck cohorts instead of two, zero
invariant violations on all four before and after every change.

- **Four cohorts, and three carried-forward answers change.** A keyword carried
  by three to five cards is drafted by a random 32-deck cohort as a coin flip,
  so two cohorts is not a reproducibility bar for it — it is two samples of a
  distribution fifteen points wide. `Glaciate` was carried as a +9.8/+11.5
  overperformer and reads **-0.5 / -0.5** on the two new cohorts. Scorched-Earth
  was carried as having no second reading at all and reads **-9.1 / -6.0** —
  its v7.6 gate did not bring it into band, it took it out the other side, and
  the item reverses from nerf-candidate to buff-candidate. Both close.
- **The cost-2 Sanctum band closes with no lever pulled.** v7.6 asked for a
  comparator before pricing anything, and that turned out to be the right
  instinct twice over: the band does not reproduce on four cohorts, and the
  premise behind the item was backwards. The new `rampStateMatchedBaseline`
  matches a card against its own decks' games that reached the same Location
  count, and it raises Location residuals by about two points rather than
  lowering them — because `rampBaselineCurve` is **decreasing** (89.5% at four
  Locations, 43.0% at thirteen). Reaching a lot of Sanctums is what a long
  grinding game looks like, not what winning looks like. Two earlier versions
  of the comparator are recorded in the code as rejected, with the measurements
  that rejected them.
- **The pinned Leader suite had been seeded from the cohort seed since v6.2.**
  Its entire premise is that decks are held fixed so a Leader can be read
  independently of deck luck, and `pinnedDeckForLeader` was seeding its 60-card
  decks with `strHash(leaderId) ^ DECK_SEED`. Sentinel of the Nether Pit read
  57.3% on one cohort and 23.4% on another — on the instrument that was
  supposed to be cohort-proof. Fixed, plus 20 seat-games per pair instead of 12
  and a one-row-per-Leader summary, because a 72-cell matrix is why nobody
  caught this for four passes.
- **Sentinel of the Nether Pit inverts.** On fixed decks it is **first in all
  four cohorts** (64.1 / 64.1 / 65.0 / 65.0), by a clear margin. Its 38.0%
  random-cohort reading was a statement about the decks that cohort dealt it.
  The file had been carrying the strongest kit in the game as an underperformer
  for three passes. It takes no buff; what stays open is its 10.1% Leader
  shatter rate, which is a mechanism question.
- **Kuro, the Unseen: the lever was a missing lever.** Five per-Leader levers
  existed and none of them could change what a Leader **costs**, though
  `mapLeader` prices it as `3 + roll(0..1) + keywordCostAdj` and the resulting
  arrival spread is two full turns. Kuro printed at 5 total — joint most
  expensive — with Resolve 3, the lowest in the pool, arriving turn 8.4 with the
  smallest ability budget anyone has. New **`LEADER_COST_OVERRIDE`**, Kuro at 4:
  first invoke 8.4 → 6.5, and up in **all four cohorts on both instruments**
  (random-deck 45.6→50.8 / 39.8→46.5 / 44.1→46.6 / 42.3→48.0). Leader spread
  narrows in all four.
- **`Fate` priced, weight 1 → 0.** Nine carriers, the largest sample of any
  keyword in the pool, negative in all four cohorts, never priced — and at
  weight 1 `Math.round(w / 2)` charged a **full essence point** for "banish the
  top card of the opponent's deck" in a format where 92-94% of wins come from
  Vitality. Carrier win rate rises or holds in all four cohorts. The effect is
  untouched; this is a pure price cut.
- **The two Unbreakable 7-drops: refuted, and it is the keyword.** The Wolf's
  expired stat reading was re-measured on the card as it now prints — at four
  more points of trim it prints a **3/3 for seven** (the most under-budget body
  in the pool) and still reads +9.7 in cohort A. The Menace was tried at two
  step sizes: the smaller goes **up** in three of four, the larger comes down
  but costs it a fifth to a third of its plays. Every per-card lever is now
  spent on both. What the four-cohort table shows instead is that
  **`Unbreakable` is the most reproducing outlier in the pool** (+14.6 / +12.7 /
  +13.9 / +12.9) and that all three carriers print at the cost cap of 7, so the
  heaviest keyword weight in the file is only partly collected. The cap is the
  next lever, and it is a rules change rather than a number.
- **Roadmap rewritten.** It had become a copy of the balance carry-forward list
  with the product work in the margins. Balance now gets one entry pointing at
  the findings doc; the rest is the game.

### v7.6 — The keyword was innocent

Full pass, superseded by the v7.7 doc above. Two 5,952-game cohorts, zero invariant violations across
all seven trial pairs.

- **Sacred is not what made `stone_bubbles` strong, and the proof is a null
  trial.** Six passes priced the keyword and this pass measured its effect to
  exhaustion: making the Sanctum exhaust itself to pay for the heal (inert),
  capping it at three charges (-0.3/-0.2, noise), and finally deleting the
  effect outright — with the text _gone_, the card still read +7.4/+6.2 and its
  carriers still won 73.0%/69.7%. The whole effect is worth about 1.5 points of
  residual. Both effect trials reverted, both measurements kept.
- **What was actually doing the work was the ability printed beside it**:
  `At Dusk, a target enemy unit gets -1/-1`, recurring and unanswerable, on a
  2-cost Sanctum. `UNIT_EFFECT_ADJUST` is now **`PRINTED_EFFECT_ADJUST`** and
  reaches Locations as well as Units, with its floor moved from 1 to 0 (0 =
  the ability is not printed at all, the only move the lever has on a card
  whose magnitude is already the minimum). `stone_bubbles` **+9.2/+7.3 →
  +3.5/+3.5**, sample intact — the first change of any kind to move it in seven
  passes, and the v7.2 carry-forward it closes had been top of the list for
  three.
- **New diagnostic, `metricDiagnostics.locationsByCost`.** It asks whether a
  cheap Sanctum simply reads high whatever is written on it, and the answer is
  yes: 2-cost Sanctums read +5.38/+4.60 as a class, and the ones with **no
  keyword at all** read +6.65/+5.30 — at or above their keyworded neighbours in
  both cohorts. That class is the new top carry-forward, and the next move on it
  is a comparator rather than a lever.
- **The Wolf of Wall Street loses its printed ability entirely** (+10.4/+8.2 →
  +9.0/+5.0, sample held). The same trial on The Pier-Side Menace was
  **reverted**: opposite signs across cohorts _and_ a third of its cohort-A
  plays gone — the "priced out rather than balanced" signature, appearing on an
  effect lever for the first time.
- **Scorched-Earth's sweep is gated on 3+ Sanctums** (+22.3 → +4.9 in the only
  cohort that drafts it) and **Glaciate now fires every other Dawn**
  (+11.5/+12.0 → +8.2/+7.8 in isolation). Both held their carriers, which is
  the difference between an effect lever and a cost point on a Location — three
  separate v7.5 price trials had deleted carriers instead of pricing them.
- **Blessed and Exhume are measurable at last.** Their v7.5 roll bands were
  widened upward (Charm 40..52 → 40..70, Event 42..62 → 42..76): Blessed 1 → 5
  carriers and Exhume 2 → 6, both now in band on real samples, with zero
  existing carriers re-rolled and 14 cards that printed no keyword picking one
  up.
- **Kuro's Resolve point was spent and reverted** (+1.2 A, -0.7 B), and it
  produced the more useful half of the result: v7.5 had measured that lever in
  isolation at +2.3/+3.6 _while Kuro's minus was still -2_. An isolated
  measurement of an unspent lever is a hypothesis for the next pass, not a
  result banked for it — it expires the moment another lever on the same card
  ships.
- **The live card catalog was two balance passes stale.** `public.cards` still
  printed Void Mother at Resolve 6 with a `-2: Banish` and the Wolf as a
  keywordless 6/6 — the `template` column was in parity the whole time, which
  is why the existing drift guard was quiet, so every _server-side_ reader of
  the mechanics columns was wrong. `scripts/verify-pool.ts` now checks the
  derived columns (keywords, essence cost, stats, Resolve, subtype, rules text)
  against the pool the client derives, and the catalog has been re-synced.
- **Harness**: `report.carryForward` prints every carried-forward card in full
  on every run — flat residual, ramp-matched residual and sample size —
  including an explicit `UNDER FLOOR` marker, so a card that was priced out of
  the format can never again be read as a card whose residual came down.

### v7.5 — Three levers that do not work, and the two that do

Full pass: `docs/BALANCE_SIM_FINDINGS_v7.5.md` (supersedes the v7.2 doc and its
v7.4 addendum, deleted this pass). Two 5,952-game cohorts, zero invariant
violations across all eleven trial pairs.

- **The rest of the Location residual gap was the comparator, not a confound.**
  v7.4 closed with ~+1.7 of Location/non-Location gap it could not explain.
  Split by card TYPE and it is gone: ramp-matched, Locations and Units sit on
  top of each other (+3.28 vs +3.20 in cohort A, +3.27 vs +3.08 in B), and
  Location-minus-Unit falls +0.28 -> +0.07 and +0.59 -> +0.20. "non-Location"
  is a mixture that is about a fifth Events, and Events sit ~3.6 below every
  other type as a class because a one-shot stops paying the moment it resolves.
  The harness now reports `residualByType` and `locationMinusUnit` as the
  numbers to read, and prints the type table in the console summary.
- **So the blanket "no Location takes another cost point" is lifted.** One
  Location has been priced through it (`cold_fire_volcano`, +8.9/+7.5 -> +6.1/
  +4.5 with its play counts held).
- **But three of four cost trials failed the same way, and that is its own
  finding.** `stone_bubbles` rose in cohort A and fell under the reporting
  floor in B; `glowing_glyph_tablet` fell under the floor in both;
  `amethyst_starfish` did not move while its play count dropped threefold. All
  three reverted, all three measurements kept. At this pool's curve a single
  cost point is close to **binary** rather than a smooth nerf — it either does
  not move the residual or it prices the card out of the format — which is the
  v7.2 Sacred weight-raise failure reproducing card by card under the corrected
  metric.
- **Unbreakable was never a keyword problem.** Per card the residual reproduces
  cleanly and the three carriers disagree with each other: the Wolf of Wall
  Street +11.4/+16.1 and The Pier-Side Menace +11.9/+11.1, but Skyborne
  Skeleton Dragon +3.5/+2.3. The keyword-level number the v7.4 roadmap carried
  forward was reading their average — the v7.2 Doublestrike mistake from the
  other direction.
- **All three levers were then measured to exhaustion on the two outliers, and
  all three are inert.** `COST_ADJUST` is a provable no-op at the cost cap;
  five and six extra points of `STAT_ADJUST` moved nothing (the Wolf went
  _up_); and bounding the keyword itself was neutral. What moved them was the
  ability printed BESIDE the keyword — the Wolf's `At Dawn, a target enemy unit
gets -2/-2` is unconditional recurring removal with no off switch, the shape
  the Leader table calls "the strongest kit shape in the game", printed on a
  Unit where no lever could reach it.
- **New `UNIT_EFFECT_ADJUST` lever** — a per-card trim to the magnitude of a
  Unit's printed ability, built because the other two levers were measured
  wrong about this case. First thing that has ever moved either card: the Wolf
  +11.4/+16.1 -> +8.2/+10.6, Pier-Side +11.9/+11.1 -> +9.1/+9.7. Both still out
  of band and carried forward.
- **Unbreakable is now once per turn**, and it ships as a rules fix rather than
  as the nerf — it measured neutral, and that is the point: an unconditional
  "can never be removed by any means at any price" was the only text in the
  game with no answer, and the harness proved these cards' win rates do not
  rest on it. The absorbed damage is _prevented_ rather than left marked (or
  the state-based check re-fires on it a tick later and kills the unit through
  a shield it just paid for), and the save recharges at every Dawn for both
  players, so a unit gets one per turn of the game rather than one per turn
  cycle.
- **Card actions**, off the ramp-matched list, two cohorts, same sign:
  `phosphor_lich` +10.6/+7.2 -> **+4.7/+4.9** (one point of stat budget; its
  v6.9 `COST_ADJUST` +1 is inert at the cap and is now commented as such rather
  than silently dropped), `blight_snarler` +8.6/+6.1 -> +6.4/+6.4,
  `cold_fire_volcano` as above, and `seabed_mandala` -4.5/-6.1 -> -3.1/+2.2 —
  priced against the Event row of the type table rather than the pool mean.

### v7.5 — Six keywords that existed only as names

- **Fate, Freeze-Dry, Blessed, Scorched-Earth, Glaciate and Exhume are
  implemented and printed.** They had sat on the roadmap for several versions
  under "implement when cards using them are printed", which is a deadlock — no
  card can be printed with a keyword the engine does not have, so the condition
  could never be met.
- **Each was placed where the vocabulary was actually thin, not where its name
  first suggests.** Events had no printable text in Shadow or Void, Charms none
  in Tide or Light, Locations none in Ember or Gale:
  - **Fate** (Event — Void): banishes the top card of the opponent's deck. The
    deliberate contrast with Erode: Erode puts the card in the ash-pile, where
    Shadow can still reach it; Fate puts it in The Void, where nothing can.
  - **Exhume** (Event — Shadow): returns a Unit from your ash-pile to your
    hand. Shadow's colour identity has promised "ash-pile recursion" since v5.0
    and nothing implemented it.
  - **Freeze-Dry** (Charm — Tide): exhausts an enemy unit when it bonds —
    Tethered's mirror image, pointed across the table.
  - **Blessed** (Charm — Light): restores 3 Vitality when it bonds.
  - **Scorched-Earth** (Location — Ember): deals 1 to each enemy unit at your
    Dusk.
  - **Glaciate** (Location — Gale): exhausts an enemy unit at your Dawn.
- **Leaders were deliberately skipped**, despite having the smallest vocabulary.
  Their keyword roll has no free band, so any addition re-rolls the existing
  nine — a balance change disguised as a content one, over a 9-card type, in
  the same pass that repriced two Leaders.
- **Nothing that already prints changed.** Each of the three types gets its own
  new roll band, on its own keyword list, so every existing carrier re-prints
  byte-identically and only cards that previously rolled NO keyword can pick
  one up — the salvage rule v7.3 and v7.4 established. `freshKeywordFor`
  explicitly excludes the new generation for the same reason: it indexes modulo
  its list, so growing that list would re-roll every card of the type whose
  colour has no match.
- **A strict colour match prints nothing, measured.** With the colour fallback
  removed, Fate, Exhume and Scorched-Earth all landed zero carriers — the exact
  dead-text failure the catalog test exists to catch, and the third time this
  project has walked into it. Off-colour cards now split the pair by their own
  Essence Type rather than by a roll, because a hash over a two-entry list is
  not reliably even and measured it was not: rolling it gave Glaciate eight
  Locations and Scorched-Earth one.
- **Two were over on their first measured run, and the price lever could not
  fix either.** Glaciate (+11.5 / +12.0) and Scorched-Earth (+22.3, level with
  Sacred in the cohort that measured it) were both raised, and both raises were
  reverted: they deleted the carriers rather than pricing them. That is the
  third independent demonstration in this pass that a cost point on a Location
  is close to binary. Both carry forward for an effect-side lever.
- Nine new engine tests, and the rulebook has the six.

### v7.5 — The card views outside the board

The v7.4 pass made the match board playable on a phone and left the roadmap
saying the collection, deck editor and pack opening "have not been measured at
all". They now have been — and the reason they never were is the first thing
fixed.

- **Nothing outside the board could be rendered offline.** All three screens
  read from `useMeta`, which needs a Supabase session, so there was no way to
  put them in front of a browser without signing in. New dev-only
  `meta-preview.html` (`?screen=collection|decks|pack`) mounts them against a
  stubbed MetaState, the same trick `board-preview.html` uses for the match
  board.
- **The deck editor was the worst of the three.** Its header laid out as two
  rows of controls that could not wrap, so SAVE DECK and CHANGE LEADER sat off
  the right edge of a 375px screen and the page itself measured 443px wide. Its
  two panes were side by side at every width, which squeezed the card pool to
  about 90px — narrower than one card. The header wraps, the panes stack below
  `sm` with the deck list capped and scrolling under the pool, and the legality
  warnings (four wrapped sentences, ~300px, which was most of the editor's
  vertical budget) are capped and scroll too. Desktop is unchanged.
- **The collection was a 119,000px page.** The browse grid printed `full`
  240x336 cards, which is ONE per row on a phone; 297 cards plus foil and
  serialized entries made it effectively unbrowsable. It prints `standard`
  below `sm` — two per row, and a third of the scroll.
- **The mulligan screen clipped its own top.** The dialog is taller than a
  667px phone and was centred in a scroll container, so the title and first row
  of cards were above the scrollable area with no way to reach them. It aligns
  to the top below `sm`, prints `compact` cards, and its sticky footer is now
  full-bleed and above the grid instead of a bar the width of its buttons with
  cards showing through and over it.
- **The hand fan is a scroll strip below `sm`.** v7.4 made the fan fit a 375px
  screen by tightening the overlap until it did, which works and leaves every
  card tappable — but at seven-plus cards the overlap floor leaves about 20px
  of each card showing and the names are unreadable. A fan's premise is that
  you can see the cards it splays, and at phone width there is not enough room
  for that premise, so the layout changes rather than being squeezed further.
  It costs no vertical space: the dock height is unchanged and the cards sit
  un-rotated, so the 92px on show is the card's own top rather than 84px of a
  rotated card behind its neighbour. Above `sm` the fan is untouched.
- Pack opening was measured at all three of its stages and needed no changes.
- New `src/lib/useIsNarrow.ts` — the card faces pick their tier through a
  `size` PROP, so there is no class that turns a 240px card into a 140px one
  and those choices have to be made in JS. One place now decides where the
  line is.
- The deck editor is `100dvh` rather than `100vh`, so its bottom row is not
  under mobile Safari's URL bar.

### v7.5 — The two Leaders at the extremes

- **Void Mother 71.7%/72.0% -> 55.6%/56.3%**, and no longer first in either
  cohort. Resolve 6 with a `-2: Banish` bought three unconditional removals a
  tank, against Ruin-Walker's identical Void Banish already repriced to -3 for
  exactly that and Avatar's Shatter repriced twice. Never actioned before this
  pass. Both roadmap levers were measured in isolation first: the price is the
  live one (`-3` -> 62.5/63.7, `-4` -> 59.5/59.7) and Resolve 5 on its own is
  nearly inert (67.7/70.5, -4.0/-1.5). They ship together for that reason —
  the Resolve point is not a second nerf but a correction of a **rarity side
  effect**, since `mapLeader` derives Resolve from rarity and Void Mother has
  the largest ability budget in the game because of which rarity slot its card
  sits in.
- **New `LEADER_RESOLVE_OVERRIDE`** — the third per-Leader lever. v7.2 recorded
  that a rarity edit is a balance edit (it re-seeds the print via `seedOf`), so
  rarity is the wrong tool for a Resolve problem; this moves Resolve alone.
- **Kuro, the Unseen 32.4%/34.0% -> 40.3%/40.4%** on its own trial, finishing
  the pass at 37.4/38.6 once the rest of the pool moved. Its minus is repriced
  `-2` -> `-1`. The v7.2 record said a `-1` version had overshot to 61.6% and
  bracketed the effect — **but that trial ran at Resolve 5**, where -1 bought
  five shrinks a tank. Kuro is Uncommon and prints at Resolve 3, where it buys
  three, so the bracket never applied to the card as it now prints. Same result
  as Void Mother from the other end: price is the strong lever (+7.9/+6.4),
  Resolve the weak one (+2.3/+3.6, measured and left unspent for the next
  pass).
- **Leader spread 39.3/38.0 -> 25.3/23.0.** P1 win rate and game length flat.

### v7.4 — The board is playable on a phone

- **The player's hand was entirely off-screen on a 375x667 phone.** Measured in
  a real browser against `board-preview.html`: the hand sat at y=733 in a
  667px viewport on a page with no scroll, so it was not merely awkward — no
  card could be seen or played, and the match was unwinnable. Two causes, both
  fixed:
  - Each Leader lane wrapped onto three rows on a narrow screen (the vitality
    plate, the essence readout and INVOKE LEADER each fell onto their own
    line), costing about 90px a lane. The lanes now scroll sideways instead of
    stacking, which keeps every control reachable at one row tall.
  - The field lanes held a `min-h-[122px]` floor that the phone layout could
    not afford; it drops to 84px below the `sm` breakpoint and is unchanged
    above it.
- **The hand fan overflowed the viewport by 59px on each side.** It was laid
  out in absolute pixels with a fixed -46px overlap, so seven compact cards
  measured a hard 494px whatever the screen. The overlap is now computed from
  the live viewport width and tightens until the fan fits, with a floor that
  always leaves a usable sliver of every card showing. Above ~1000px the
  computation lands back on the original -46, so the desktop board is
  byte-identical.
- **Pinch-zoom was disabled.** `maximum-scale=1.0` in the viewport meta fails
  WCAG 1.4.4 and, on a board this dense, removes the only way to read the
  smallest text on a phone. Removed.
- **Touch targets.** A new `tap-44` utility expands a control's hit area to the
  44px minimum on coarse pointers only, without changing how it looks or
  costing vertical space the phone layout has none of. Applied to CONCEDE, LOG,
  both ash-pile buttons, the Locations help chip and INVOKE LEADER: buttons
  under 44px drop from 33 to 13, and what remains are the informational chips
  on a card face (keyword pills, cost badges) where a larger hit area would
  overlap its neighbours.
- **The contextual hint bar was clipped to half its height** on any screen tall
  enough to squeeze it — it was missing `shrink-0` in the flex column.
- `board-preview.html` and `gallery.html` had no viewport meta at all, so the
  dev harness laid out at Chromium's 980px fallback and disagreed with the real
  app about what a phone even is. Both now carry the same tag as `index.html`.

### v7.4 — Mer-King gets an answer

- **Which colour supplies a Leader's answer was decided by typing order.**
  `mapLeader` took the minus ability from `identity[0]` — literal array order
  in `LEADER_COLORS`, hand-written and never rolled — so whether a Leader's one
  answer touched the enemy board came down to which of its two colours happened
  to be written first. `minusColorFor` now prefers whichever half yields an
  ability that reaches the opponent.
- **The roadmap said this would re-roll all eight Leaders. It re-rolls none** —
  verified by diffing the whole pool before and after: zero cards change. The
  only two the rule would flip (Kuro, Ruin-Walker) already carry hand overrides
  that outrank it, and those overrides are _not_ redundant — both encode a
  price the raw colour table overshoots at (Kuro measured 61.6%/55.6% and
  Ruin-Walker 68.2% before being repriced). What the rule buys is that the next
  Leader printed does not need a fourth hand patch to get an answer.
- **It also cannot fix the one Leader still inert, which is the real finding.**
  Mer-King (Tide/Root) has no interactive half to draw from: Tide gives `Deal a
card`, Root gives `+2/+2 on a friendly unit`. Its whole kit pointed inward —
  `-1: Deal a card` and `+1: Restore 2 Vitality` — and it finished **35.1%
  (n=1488) / 33.4% (n=1860)**, bottom or second-bottom in both cohorts on the
  two largest Leader samples in the run.
- **It takes a shape no other Leader has: `-3: All enemy units get -1/-1`.**
  Every small interactive effect was already spoken for, and three sit on PLUS
  halves where they _gain_ Resolve, so the same effect on a minus would have
  printed a strictly dominated ability. A board-wide shrink is colour-honest
  for Tide and Root and reuses an already-implemented `applyEffect` path.
  Priced at -3 against the two overshoots this table records: at Resolve 4 a
  full tank buys exactly one, and the +1 half needs three turns to fund the
  next.
- **Result: 35.1% → 52.2% and 33.4% → 47.1%** — up ~15 points to baseline in
  both cohorts, mid-table in both, with none of the jump-to-first overshoot
  that killed the first Kuro and Ruin-Walker trials. Zero invariant violations
  on both runs.
- Two Leaders are now the extremes in both cohorts — Void Mother at 71.7%/72.0%
  and Kuro at 32.4%/34.0% — and both are per-Leader Resolve/price problems the
  colour rule cannot reach. Diagnosed but deliberately not actioned in the same
  pass as another Leader change; see `ROADMAP.md`.

### v7.4 — The Location metric (balance harness)

- **The balance harness could not price a Location, and had blocked itself on
  saying so.** v7.2's top-priority carry-forward: every two-cohort gated
  overperformer that pass was a Location, three separate cost trials on Sacred
  never moved its number, and several Locations already carried +2/+3 stacks
  chasing a signal that would not settle. `scripts/simulate-v5.ts` now computes
  a **ramp-matched residual** beside the flat one and reports it as
  `topOverperformersRampMatched` — the list to price off for anything gated on
  essence.
- **The confound is game length, not cost.** Residual-vs-cost correlation is
  near zero under _both_ metrics in both cohorts (0.056/0.095 flat,
  0.082/0.023 matched), so "expensive cards read high" was the wrong model —
  recorded in the findings doc so nobody re-derives it. What is real: a card
  that lands on turn 12 cannot appear in a game that ended on turn 6, and
  games that end on turn 6 are decided. Its in-deck denominator carries short
  losses an early card's does not. Matching on Location count instead barely
  bites, because Wellsprings accumulate about one a turn and nearly everything
  eventually becomes castable.
- The fix keeps the deck control the flat residual depends on — the
  denominator is still the card's own in-deck games — and restricts it to
  games that ran at least as long as the card was actually cast on, weighted
  by its own play-turn distribution.
- **Per card the two lists disagree by up to 8 points**, which is larger than
  any lever this project applies: Sunken Archive +11.3 → +3.2, Melted Hollow
  +13.1 → +6.6, Stone Bubbles +11.2 → +6.8, while Units move the other way
  (Phosphor Lich +3.1 → +8.0). Locations deflating and Units inflating is the
  signature of a Location-specific correction rather than a rescaling.
- **In aggregate it is a partial fix, and the entry says so.** Mean Location
  residual minus mean non-Location residual goes +1.96 → +1.61 (cohort A) and
  +1.89 → +1.78 (cohort B) — same sign in both, so it is real, but that is
  6-18% of the gap removed, not the whole of it. The blanket "no Location
  takes another cost point" lifts card by card rather than wholesale, and the
  remainder is back on the roadmap.
- **A diagnostic that does not work, kept as the cautionary example.**
  "Location share of the top-15" was tried first and is useless — 47% → 27% in
  one cohort, 40% → 47% in the other, because it is a membership count over
  fifteen items that moves by whole cards. `metricDiagnostics` reports the
  mean-residual gap as the number to read and keeps the share beside it
  labelled as noise.

### v7.4 — Unbreakable finally prints

- **Unbreakable printed on ZERO cards.** A rulebook keyword with a fully
  implemented engine branch that nothing in the 297-card pool could carry: it
  is premium-gated to `rt >= 4` (21 eligible Units), sits at index 1 of two
  FOUR-entry colour lists, and needs Root or Void as the card's PRIMARY
  colour. That intersection is empty on the real catalog. Doublestrike clears
  the same gate only because Shadow's list has two entries, giving it a 1-in-2
  instead of a 1-in-4. The keyword was so unreachable that `fuzz.test.ts`
  carried a comment noting the soak had never once built a deck containing a
  carrier, and its state-based-check exemption had never executed.
- Salvaged the way v7.3 salvaged Warlord's zero carriers: a band that fires
  only where NO keyword was rolled at all, so every existing carrier re-prints
  byte-identically and no colour list changes length (growing one re-rolls the
  keyword of every card sharing it). The rarity floor drops to Rare, because
  21 cards is thin enough that "printable" and "unprintable" are the same
  thing. **Three cards** now carry it: Skyborne Skeleton Dragon, The Pier-Side
  Menace and The Wolf of Wall Street — and nothing else in the pool changed.
- **They keep their printed abilities.** v7.3's "every Unit at Rare or above
  prints an ability" rule keys off the card having no keyword, so handing
  these three Unbreakable would have silently taken away the trigger or
  on-enter effect they had. That check now keys off what the card _rolled_
  rather than what it ended up with.
- **Unbreakable reported zero activations however many kills it walked away
  from** — it was the one keyword with no telemetry hook, so the balance
  harness was blind to the most expensive entry in `KEYWORD_COST`. It now
  reports from both branches (lethal damage survived, shatter prevented):
  ~7,000 procs per 528-game run.
- **Priced on arrival, not shipped and walked back.** All three land ON the
  cost cap of 7, so the printed price collects only part of Unbreakable's +3.5
  surcharge and the body keeps the stats of its pre-keyword base — the
  "keywords are free stats" skew, resurfacing at the ceiling where
  `COST_ADJUST` is provably a no-op. First print measured as the pool's #1
  keyword outlier in both cohorts (+7.6 n=218 / +8.5 n=122, carrier win 69.3%
  / 73.8%), so all three took a `STAT_ADJUST` trim. That pulled the aggregate
  back to baseline (P1 40.5% at 19.9 average turns, against 40.7% / 20.6
  before the keyword existed) and halved the seed-1337 delta to +4.5. The
  seed-24601 cohort still reads +10.6 at n=139; the two cohorts now disagree
  in direction, which at that sample size is the cohort artifact the
  Doublestrike note in `KEYWORD_COST` warns about chasing. Left for a real
  balance pass — see `ROADMAP.md`.
- **A catalog test now fails loudly on the next one.** "Only real keywords"
  was checked; "every real keyword reaches a card" was not, and that blind
  spot has now cost two keywords (Warlord in v7.3, Unbreakable here), both
  found by hand months apart.
- **`fuzz.test.ts` checks the stack too**: an undecided game must return
  control with the stack empty and no priority window open, every stack item
  must have a valid controller and the right payload for its kind, and cards
  waiting on the stack are counted in the one-instance-one-zone check.
  `passPriority` and `settleStack` join the hostile-input suite.

### v7.4 — A real stack and APNAP priority

- **Nothing resolved where it was played.** Invoking a card ran its effect
  inside `invokeCard`, and a triggered ability ran inside the loop that found
  it — so the only "response window" the game had was the guard step, and
  even there the two players' plays just happened in whatever order the caller
  made them. That is a hard ceiling on card design: an Event that answers
  another Event is unprintable if there is no moment at which both exist.
  Cards invoked from hand and triggered abilities now go on a **stack** and
  wait, resolving **last in, first out**, so a response resolves before the
  thing it answers.
- **Priority is a real APNAP round.** `GameState` carries `priority`; the
  active player speaks first, both players passing in succession resolves the
  top item, and the guard-step reaction window is now one of these rounds
  rather than a bare `step === 'reaction'` flag. See `docs/RULEBOOK.md` §6.
- **The loop passes for you when you have no answer.** A player holding no
  Quick Event or Ambush unit they could pay for is auto-passed, so a board
  with no instant-speed cards resolves inside the same call and behaves
  exactly as it did before. 528 CPU-vs-CPU games on the same seed measured
  P1 40.3% → 40.7% at an identical 20.6 average turns, with no invariant
  violations — the stack is behaviour-preserving where nobody can interact.
- **The loop also never stops for the player who just acted.** You answer
  your opponent's cards and triggers, not your own. Retaining priority over
  your own spell is the one piece of real priority left out: it would force
  every caller — the UI, the CPU, the sim harness — to drive a priority round
  after every single action, and it buys only self-chaining.
- **Targets are re-checked on resolution.** Previously impossible; now that a
  target can die in response, an Event whose target is gone **fizzles** into
  the ash-pile, a Unit still enters and loses only its rider, and a Charm
  whose host died lands in the Worn row or the ash-pile instead of vanishing.
- **Sorcery speed now also requires an empty stack.** Slow Events, Units,
  Charms and Sanctums were gated on "your own main phase" alone, which would
  have let a player develop their board in the middle of an unresolved spell.
- **Combat damage, Dawn and Dusk get no response window** — anything they put
  on the stack resolves before the step continues, including the death
  triggers between the Quickstrike and normal damage sub-steps.
- **The CPU uses its windows.** `respondToStack` answers a player's
  invocation with Quick removal when there is a live target worth spending on,
  and passes otherwise.
- **And so does the player.** The board opens a real response window whenever
  priority lands on the human: a new `respond` stage with the stack listed
  top-first, instant-speed cards live in hand, and a PASS button. It opens in
  both directions — during the CPU's turn (`playTurn` pauses through the new
  `onOpponentPriority` hook and resumes by re-entering, the same shape as the
  existing guard-step pause) and on the player's own turn when the CPU answers
  something and hands priority back. Bounded at 40 windows per CPU turn so a
  resume that stops making progress ends the turn instead of spinning.
- **Locations tap while you hold priority.** They were tappable only in your
  own main phase or the clash reaction window, which would have made every new
  response window unusable — you cannot pay for an answer you cannot produce
  essence for.

### v7.3 — Card art restored, catalog edits, five new cards

#### Card art

- **Full-Art/Mythic video art was never actually preloaded.** The boot-time
  `preloadImages()` gate fed every card's art URL to `new Image()` — for the
  `.mp4` art that Full-Art and Mythic cards print, the browser fails to
  decode a video through an `<img>` tag and fires `onerror` immediately, so
  it was counted as "loaded" without a real network request ever going out.
  Those cards' art still stalled and popped in the first time they rendered
  in game, exactly what the preload gate exists to prevent. `loadOne` now
  detects video URLs and preloads them through a `<video preload="auto">`
  element instead, resolving once `canplaythrough` fires.

- **Every card's art was blank in game.** The `Card Images` storage bucket had
  been reorganised — `SET 1` → `Volume 1`, `Set 2` → `Volume 1 pt2`,
  `Set 3` → `VOlume 1 pt3`, `Full Arts Collection 1` → `Volume 1 full arts` —
  but every `image` URL in the catalog still pointed at the old folder names,
  so all 292 arts 404'd and `CardArt` fell back to its "NO IMAGE" plate. The
  file names themselves never changed, so the fix is a folder remap, applied
  to both the live `public.cards` catalog and the bundled fallback in
  `generated-cards.ts`. All 297 URLs are now verified against
  `storage.objects` — zero unresolved.
- **`npm run db:sync`** (`scripts/sync-cards-db.ts`) replaces the old
  backfill for catalog changes. `db:backfill` only rewrote the mechanics
  columns of rows that already existed, so it could not add a card, rename
  one, or move it between types — which is why the two catalogs were able to
  drift apart in the first place.

#### Keywords — a second pair for every non-Unit type

- **Units had 23 keywords; Event, Charm, Location and Leader had two apiece.**
  So a non-Unit card's keyword slot was a coin flip between the same two
  options on every card in the pool, and none of those four types had any
  colour identity in its vocabulary at all — a Void Location and a Light
  Location drew from the same two keywords. Eight new keywords, one per
  Essence Type, each wired to a real engine hook:
  - **Echoing** (Event, Tide) — when this Event resolves, Deal a card.
  - **Ritual** (Event, Root) — costs 1 less if you control 3+ Sanctums.
  - **Empowering** (Charm, Ember) — at your Dawn, the bonded unit gets +1/+0
    permanently.
  - **Tethered** (Charm, Gale) — bonding from hand recovers that unit.
  - **Bulwark** (Location, Light) — damage dealt to you is reduced by 1.
  - **Blighted** (Location, Void) — at your Dusk, the enemy erodes 1.
  - **Archivist** (Location, Tide) — at your Dawn, Deal a card if you control
    3+ Sanctums.
  - **Warlord** (Leader, Shadow) — Commander's defensive twin: your units get
    +0/+1 while your Leader is fielded.
- **Archivist is a Location keyword, not the Leader keyword it started as.**
  There are only 9 Leaders in the whole pool, so a Leader-only keyword is
  thinly printed by construction — the first draft put both Archivist and
  Warlord on Leaders and shipped Warlord to **zero** carriers. Locations have
  ~50 cards, so moving it there is what makes it printable at all; Leader
  keeps the smallest vocabulary on purpose.
- **The new keywords get their own roll band rather than substituting.**
  v6.9's Unit generation was a swap (a keyword-carrying card traded its legacy
  keyword for its colour's new one), and reusing that rule here left Echoing,
  Ritual and Bulwark on zero cards — the substitution only fires on the ~26%
  of cards that already carry a keyword, times a 30% roll, times a 1-in-7
  colour match. Each non-Unit mapper now has a band ABOVE its legacy ones, so
  the 0..26 bands are untouched (every existing Surge/Resonant/Runic/
  Soulbound/Bountiful/Sacred carrier re-prints byte-identically) and only
  cards that previously rolled NO keyword pick one up. **25 existing cards**
  gained new abilities this way, resynced to `public.cards`.
- **"Sanctum" means a Location card.** Ritual and Archivist first shipped
  reading `locations.length`, which counts basic Wellsprings — and since
  Wellsprings only accumulate, that left both switched on permanently from
  about turn 3. Both now count real Sanctums via `sanctumCount`.
- **Bulwark cannot invert into healing.** The reduction clamps at 0 before
  anything reads the number, so a 1-point hit into two Bulwarks is absorbed
  rather than gaining Vitality — and Siphon gains only what actually landed.
- **Fuzz soak: the hand-cap invariant exempts the game-ending turn.**
  `playTurn` skips `endPhase` once a winner is set, so a lethal turn never
  reaches Dusk and never sheds to MAX_HAND. The assertion was checking a phase
  that provably had not run; it only stayed green because no deck the soak
  built had ever drawn a card in the clash reaction window of a lethal turn,
  which Echoing now makes reachable.

#### New-operative Deck Box (replaces the starter pack/deck system)

- **`claim_starter_box` built a deck of 60 Commons and never checked colour
  identity.** It ordered the whole catalog by rarity ASCENDING and took the
  first 60, so the "ready to play" deck it auto-saved was both a pile of
  Commons and routinely illegal in the deck editor. `claim_starter_deck` was a
  second parallel path handing out three fixed prebuilt lists. Both are gone.
- **One `claim_deck_box(p_leader_id)`**, which builds a colour-legal 60-card
  deck around the chosen Leader with a fixed mix: exactly **2 Super-Rares and
  8 Rares**, the rest Uncommons/Commons, plus a 12-Sanctum mana base and a
  cheap-first curve on the filler. Per-rarity copy caps match the client's
  `maxCopiesForRarity`, and selection is hashed on the player id so two
  operatives picking the same Leader do not open identical decks.
- **Super-Rare/Rare picks allow any non-Leader type on purpose.** Ruin-Walker
  Overseer's only colour-legal Super-Rare IS a Location, so restricting those
  buckets to non-Locations makes that Leader unbuildable. Locations landing in
  those buckets count toward the 12-Sanctum target rather than stacking on it.
  Verified across all six eligible Leaders: 60 cards, 2 SR, 8 Rare, 50 basics,
  zero colour-illegal, zero over-cap.
- Every existing profile is granted the box once (idempotent backfill);
  `handle_new_user` grants it to new signups. The old pack types are
  deactivated and their inventory rows removed. The client drops
  `StarterDeckPicker` and the two-way choice modal — the box opens straight
  into the Leader picker.

#### Catalog

- **19 cards revised**: renames and new flavor for Apex Nanite Shinobi
  (→ Kuro, the Unseen), Crimson Vector Commander (→ Sentinel of the Nether
  Pit), Chrono-Tide (→ Sunken Ruin), Nanite Division Marshal (→ Vanguard
  Shock Troopers), Volcanic Nanite Core (→ Orbital Annihilation), Admiral
  Iron-Claw (→ Abyssal Melter), Hollow Suit (→ Constellation Devourer),
  Sandstorm Effigy (→ Stormcloud Wyrm), Tattooed Sovereign (→ Crystalline
  Arbiter), Blind Colossus (→ Glyph-Carved Kraken), Heart of the Thermal Grid
  (→ Vector Highway) and Neon Phantom Assassin (→ Cipher Agent), plus rarity
  moves on Spectral Leviathan, Submerged Starfall, Sovereign of the Dying
  Star, Ethereal Sea Witch and Seabed Mandala. Six cards changed TYPE (Blind
  Allegiance and Volcanic Nanite Core → Event, Chrono-Tide → Location,
  Sandstorm Effigy → Unit, Void Mother → Leader); each re-derives a full,
  type-appropriate kit from `cardpool.ts` automatically.
- **Five new cards** in `VOlume 1 pt3`: Blossom-Veiled Refuge (Location,
  Super-Rare), Cruel Effervescence (Event, Mythic), Blight-Snarler (Unit,
  Mythic), Curse of the Ruby Tide (Event, Mythic) and Stag of the Cosmic Pyre
  (Unit, Mythic). Catalog is 292 → 297 cards.
- **Void Mother is the ninth Leader**, identity Void/Shadow (`colors.ts`), so
  its minus half is the Void `Banish` its art promises rather than a
  hash-picked pair that could roll the same colour twice.

#### Rules text

- **A Unit at Rare or above always prints an ability now.** Vanilla bodies are
  a legitimate part of the curve, but only at Common/Uncommon: 37 cards rolled
  zero keywords AND lost `mapUnit`'s 1-in-4 effect roll, printing a bare stat
  line with no rules text at all — including Rare, Super-Rare and Full-Art
  pulls. Rare+ Units now force the effect roll they would otherwise have lost,
  at the same magnitude (it already scales off natural cost). 37 → 29 vanilla
  Units, all of them Common or Uncommon. Every non-Unit type already carried a
  mechanic by construction; `npm run audit:blank` pins this.
- **`LEGAL_PAIRS` is deduplicated by unordered pair.** `pick` indexes with
  `% arr.length`, so this list's LENGTH is an input to every two-colour card's
  colour, cost, stat, keyword and effect roll — and its length was just the
  number of Leaders. Adding the ninth Leader therefore re-rolled 50+ unrelated
  cards and would have invalidated every per-card `COST_ADJUST`/`STAT_ADJUST`
  entry in the file. Draft legality is unordered (Void/Shadow is the same
  playable pair as Avatar of the Abyss's Shadow/Void), so a Leader re-using an
  existing pair now adds nothing and the pool re-prints identically.
- **Fuzz soak invariant exempts Unbreakable.** `stateBasedChecks` deliberately
  keeps an Unbreakable unit on the field with lethal damage still marked, so
  its remaining Grit legitimately sits at or below zero; the soak's
  "nothing dead may be left standing" assertion had no such exemption and
  only escaped notice because no deck it built had ever fielded a carrier.

### v7.2 — Pack rework, Leader-kit lever, balance pass

#### Packs & economy

- **Booster: 6 → 8 cards, one slot a guaranteed foil.** New slot shape is
  4 foundation / 2 synergy / 1 chase / 1 foil. Price unchanged at 499 credits
  (5 vouchers).
- **Foil chance is now stated per PACK, not per slot.** `pack_types.foil_chance`
  was always a per-slot probability, so the advertised "4%" really meant
  ~1 - 0.96^6 ≈ 21% of a foil somewhere in the pack. The per-slot rate is
  retuned to 0.0118 so the seven non-guaranteed slots land on
  1 - 0.9882^7 ≈ 8.0%, and the store's odds modal now shows
  "N guaranteed foils + X% chance of an extra" via `packFoilChance()`.
  Verified against the live `roll_weighted_rarity` by Monte Carlo: 1.08
  foils/pack, 7.50 foils/box.
- **Box: 36 → 49 cards**, restructured as six full boosters (6 × 8) plus the
  topper, so box and pack stay in a readable relationship. **Box topper floor
  Rare → Super-Rare** and always foil (62% SR / 32% UR / 4.5% FA / 1.5%
  Mythic). Price 2,699 → 3,199 credits, 27 → 32 vouchers, sized to the
  ~+466-credit quicksell EV the topper change adds.
- **Full-Art and Mythic made more common** in every chase and topper slot.
  Per booster: Mythic 0.10% → 0.50%, Full-Art 0.60% → 1.93%.
- **Dupe protection removed from pack opening.** `grant_pack_contents` no
  longer branches on the `dupe_protected` slot flag; every non-Leader slot is
  a straight `random_card_of_rarity` pull. Both `pick_card_dupe_protected`
  overloads dropped, the flag cleared from every `pack_types` row, and the
  `dupeProtected` field removed from `SlotOdds`. The copy-cap auto-convert is
  a separate mechanic and is retained — it is now labelled "over copy cap"
  rather than "duplicate protected", which is what it always was.
- **Alt-Art dropped from every weight table.** `public.cards` has zero Alt-Art
  rows and `random_card_of_rarity` walks _down_ its ladder on an empty tier, so
  every advertised Alt-Art roll silently paid out a Full-Art. The weight is
  folded into Full-Art — the odds screens now describe what can actually be
  pulled.

#### Cards & balance

See `docs/BALANCE_SIM_FINDINGS_v7.2.md` for the full pass (two 5,952-game
cohorts, 0 invariant violations, seven trial pairs).

- **Six cards to Full-Art**: `absolute_eruption`, `apex_nanite_shinobi`,
  `avatar_of_the_abyss`, `crimson_vector_commander`, `spectral_leviathan`,
  `submerged_starfall`. These were also the six the v6.9 pass left drifting
  between the live DB and the bundled catalog, so this closes that too — all
  three sources now digest to `5ddd58b02bd1d4e951d6e2acd7ae3120`, 292/292.
  Because `seedOf` is `id|type|rarity` the six are reprinted, and the three
  Leaders drop Resolve 6 → 5.
- **New `LEADER_MINUS_ABILITY_OVERRIDE` lever.** `mapLeader` derives the minus
  ability from `identity[0]` and the plus from `identity[1]`, and neither is
  rolled — they are the array order in `LEADER_COLORS`. The three Leaders
  below baseline in both cohorts were exactly the three whose first colour
  yields a non-interactive minus. Each now takes an ability from its own other
  colour: Apex Nanite Shinobi `-2: -2/-2`, Ethereal Sea Witch `-1: Deal 2
damage to a target enemy unit`, Ruin-Walker Overseer `-3: Banish`.
  **Leader spread 24.3 → 17.9 (A) and 30.3 → 14.8 (B)**, against v6.9's 31.6
  and 39.8.
- **Cost adjustments**: `submerged_statue` +1, `dr_aries_chief_biogeneticist`
  +1 (both gated in both cohorts), `ashen_circle_rite` -1 → -2.
- **Doublestrike carry-forward closed without action** — the four-pass signal
  is two carriers' Leader cohorts, not the keyword; their absolute win rate
  was below even in both cohorts.
- **Sacred left at weight 1** after three cost trials, and the reason is now
  documented at the call site: cost is not a lever for Locations, because
  "win rate conditional on having played it" rises with price by construction
  (a pricier Location is only played in games with more ramp). Every
  two-cohort gated overperformer this pass is a Location. Next lever is a
  ramp-matched baseline in the sim harness.

#### CPU

- **`charmOnDoomedUnit` down 14-20%** — the largest lapse counter for five
  passes, targeted for the first time. `bestBondTarget` now checks whether the
  enemy's ready board can reach the intended target instead of only scoring
  durability, and `chooseAttackers`' `favorableTrade` branch counts the
  non-Soulbound Charms that would die with the attacker.

#### UI / UX

- **Pack summary rebuilt.** One layout for every haul size — the old screen
  branched at 12 cards into two near-duplicate render paths that had drifted
  apart (different sold/converted badges, different best-pull markup). Adds a
  headline stat strip (cards, foils, top pull, haul value, over-cap credits),
  always spotlights the best pull, and the quicksell button now shows the
  payout before it is pressed.
- **Bulk opens are sized in cards, not packs.** The flat 24-pack cap meant one
  "OPEN ALL" could hand the reveal 1,176 pulls; `bulkCapFor()` budgets ~250
  cards per reveal, and the ×5/×10 buy buttons hide multiples that exceed it.
- Store odds modal shows per-pack foil odds and says "PER BOX" for boxes.

#### Fixes

- `PackOpening.tsx` kept its own copy of the rarity ladder and it had drifted:
  no `'Alt-Art'`, so `indexOf` returned -1 and every Alt-Art pull was clamped
  to rank 0 — sorted, spotlighted and glowed as a Common. Both duplicate
  ladders (here and in `packodds.ts`) now use `rarityTier` from `rarity.ts`.
- `slotOdds`' guaranteed-foil test only matched a `foil_` _prefix_, so a slot
  named exactly `foil` advertised the base chance instead of 100%.
- `docs/RULEBOOK.md` copy-cap line was missing Alt-Art.

#### Tests

- `src/game/v3/edgecases-v72.test.ts` (22 tests) — adversarial coverage for
  `weaken` (including shrink-to-0 and negative-stat overshoot), `exhaust`,
  Nimble, Thriving, Radiant, Withering, Tidecaller and the new Leader kits.
  Writing it surfaced that three tests built on empty decks were passing
  vacuously — `runDawn` Deals a card, so the game ends the moment such a test
  advances two turns and every later assertion silently no-ops.
- `src/meta/packodds.test.ts` (9 tests) — pins the guaranteed-foil slot type,
  the per-pack foil figure, weight tables summing to 1, ladder ordering
  including Alt-Art, and that no client weight table offers a rarity the
  catalog cannot supply.

### v7.1 — Alt-Art rarity

Shipped ahead of this entry and recorded in `src/meta/ChangelogScreen.tsx`
but never written up here. Adds the **Alt-Art** rarity between Full-Art and
Mythic (`RARITY_ORDER`, `RARITY_HEX/CHIP/TEXT/BORDER/GLOW/BG`, the "Prism Ink"
full-bleed template in `CardFaceV4`, 1,800-credit quicksell, 1-copy deck cap),
carves an Alt-Art share out of chase and box-topper slots, and fixes the
server's rarity-exhaustion fallback ladder (still pre-v6.8 order) plus the
Starter Box Leader-rarity check (no Full-Art entry at all). No Alt-Art cards
have been printed yet — v7.2 removes the dead pack weights until one is.

### v7.0 — Board redesign, player-shop audit, Supabase hardening

#### Match board — the "Tactile Lane" layout

The side-panel-plus-row board is replaced by a full-width lane stack:
phase stepper, opponent lane, opponent Locations, opponent field, clash
divider, player field, player Locations, player lane, hand dock.

- The **phase stepper** (Dawn → Main I → Clash → Main II → Dusk) is always on
  screen instead of squeezed into the top bar.
- Each player gets a **status lane**: Leader thumbnail (still the shared
  CardFace template at its `micro` tier), Resolve as countable dots rather
  than a bare number, and a Vitality heart plate. The player's lane also
  carries their floating Essence pool and their Leader ability buttons inline.
  A red/yellow wash marks whose lane is whose.
- **Locations get their own lane** on each side — every Wellspring and Sanctum
  is a visible board object rather than a footnote in a status bar. The
  Wellspring picker and worn Charms ride along on the player's lane.
- The **clash divider** carries the single primary action for the current step
  (declare attack / resolve clash / confirm guards / advance phase / skip the
  CPU). Those buttons no longer also live in the top bar, so there is exactly
  one place to look for "what do I do now".
- The **battle log** moved into a collapsible drawer toggled from the divider,
  returning the vertical space the old midline strip took from both fields.
- Card rendering is unchanged throughout: board units, hand cards, Leaders,
  the ash-pile drawer and every overlay still render through `CardFaceV4`.
- Adds `board-preview.html` (dev-only, same pattern as `gallery.html`) that
  mounts the board against locally generated decks so the layout can be
  exercised without a session.

#### Engine — soak and hostile-input fuzzing

New `src/game/v3/fuzz.test.ts`, complementing the hand-built cases in
`edgecases.test.ts`:

- 200 complete seeded AI-vs-AI matches over randomized real-catalog decks,
  with hard invariants (no instance in two zones at once, no dead unit left
  standing, no negative damage, no runaway vitality or essence, guard maps
  only ever referencing real attackers, every game terminating) re-checked
  after every single turn.
- Malformed, prototype-shaped and out-of-turn arguments thrown at every
  public engine action, asserting both that the call is refused and that the
  state fingerprint is unchanged.

That second suite found one real hole: **`activateLeaderAbility` accepted a
stringified index.** Array indexing coerces, so passing `'0'` reached a real
ability and spent Resolve on it, unlike every other public action which
validates its identifiers. It now requires a non-negative integer.

#### Pack opening — the tear goes through the art

The tear-off strip used to be a grey foil bar bolted _above_ the pack, with
the artwork starting underneath it. It is now a clipped copy of the top of
the artwork itself, overlaid on the pack, and the rip cuts the art along a
serrated line: the strip flies off carrying its slice of the render and the
pack body keeps the torn paper edge where it came away.

- Packs carry two images now. `pack_types.open_image_url` (new column) holds
  the tall vertical pack/box render the tear animation uses; `image_url`
  stays the shop-shelf icon. Both are wired to the `Shop Packs/Boxes` assets
  in storage — box render + box icon for the Booster Box, pack render + pack
  icon for the Booster Pack, Daily Free Pack and Season Pass Reward Pack.
  Rows without an `open_image_url` fall back to `image_url` as before.
- The `Other files` storage bucket (which holds only that shop-pack art) is
  public now, like `Card Images`, so the store and the opening animation both
  render without a session.
- The opening frame sizes itself to the artwork's own aspect ratio instead of
  cropping everything into a fixed 77:96 box, and is height-driven so a tall
  box render can't run off the bottom of the viewport. Shop tiles switched to
  `object-contain` so a portrait product render isn't centre-cropped.

#### Engine — chaos-monkey fuzzing

New `src/game/v3/chaos.test.ts`, a third fuzzing angle alongside the AI soak
and hostile-input suites: both seats are driven by **random legal actions**
rather than sensible ones — random Wellspring colours, random taps, random
invokes with random (often nonsensical) targets and bond targets, random
attacker sets, random guard assignments, reaction-window plays by either
side — with the hard invariants re-checked after every single action.

That reaches board states the CPU never builds on purpose. 500 such games
(60 in the committed suite, for runtime) turned up no invariant violation and
no non-terminating match, and a 3,000-match AI soak on top of the standing
200 was likewise clean.

#### Economy — three real holes found in the market RPCs

- **`buy_listing` swallowed the buyer's own standing bid.** A player who was
  the high bidder on an auction and then hit Buy Now had their escrowed bid
  refunded to _"the current bidder, if it isn't you"_ — i.e. never. They paid
  the buyout on top of a bid that was gone for good. The refund now fires for
  every outstanding bid, including their own.
- **Bids could sail past the buyout.** Nothing capped a bid at the buyout
  price, so once a bid exceeded it, anyone could still Buy Now for _less_ than
  the standing bid: the high bidder got refunded and the seller was paid the
  smaller number. `place_bid` now refuses a bid at or above the buyout, and
  the bid modal says so and disables the button.
- **Deck locks were summed across decks.** `quicksell_cards` and
  `assert_cards_available` counted every occurrence of a card across _all_ of
  a player's decks, but decks share the same physical copies — three copies
  run in two decks read as six locked, making them permanently unsellable,
  unlistable and untradeable. The lock is now the largest single deck's
  requirement. No live collection had tripped it yet.

Noted, not changed: `record_match_result` is guarded only by a 5-second
throttle, so a scripted client can farm ~100 credits and 60 XP every 5
seconds. Tightening that is an economy decision, not a bug fix.

#### Player shops

Backend (all enforced server-side in SECURITY DEFINER RPCs):

- **Closing a shop refunded its collateral in full, eventually.** `close_shop`
  paid back half the _current_ collateral and left the remainder on the row,
  so close → reopen → close → … converged on a 100% refund while every slot
  stayed purchased. The un-refunded half is now burned, which is what the
  rule always claimed.
- **Serialized prints could be escrowed into listings and pools.** Only the
  client reserved them; `assert_cards_available` now does too, so a
  hand-rolled RPC call can no longer list a serialized copy.
- **Mystery packs could advertise odds their pool could never pay out.** A
  "simple" pack could promise 10% Rare over a pool of thirty Commons.
  Templates now support explicit **rarity guarantees** ("N cards of rarity X
  or better in every pack"), checked cumulatively so overlapping floors can't
  be satisfied twice by the same card, and simple-mode weights must be backed
  by a proportional share of the pool.
- **Mystery listings could become permanently unbuyable.** The draw picked a
  uniformly random pool row for every non-exact slot, so an open slot could
  eat the copy an exact slot needed and the remaining packs raised "Pool
  exhausted" forever with the seller's cards stuck in escrow. The draw is now
  reserve-aware: exact slots, then rarity floors (strictest first, each
  taking the lowest qualifying card), then open slots. A sold-out mystery
  listing also frees its slot, which it never did.
- Shop maintenance now charges every occupied slot; mystery listings had been
  renting space for free.

Front end:

- **Buyers can see the whole pool.** A mystery listing now opens its full
  submitted contents, what is left of each entry, per-rarity pull odds and the
  pack's guarantees — previously a price and a single blended EV number were
  all a buyer had to go on.
- **Setting up a shop is far less clicking.** Bulk "add every spare Uncommon"
  actions and a "fill to N packs" autofill build pools from the server's own
  view of what is listable (deck locks and serialized prints already netted
  out), and a live requirements checklist shows exactly which rule a pool is
  short on, and by how much, while it is being built.
- **Storefronts are somebody's shop.** Taglines, an accent colour and a banner
  with a live preview; the directory and storefront headers are built from
  them, and both now show real stock (listing counts, cheapest price, highest
  rarity in stock, repeat buyers).
- **Listings look like what they are.** Card listings take a rarity-tinted
  frame from the best card they contain and call out how the price compares
  to the server's reference value; mystery listings show a sell-through bar
  and their pack size.

#### Supabase

- **Every SECURITY DEFINER RPC was callable by the `anon` role**, including
  `admin_grant_currency`. `anon` and `PUBLIC` are revoked across the board and
  `authenticated` is granted explicitly, with matching default privileges for
  anything added later. Internal helpers (escrow returns, maintenance
  settlement, rating recompute, pool validation) are no longer part of the
  REST surface at all — they run as the owner from inside other functions.
- Indexed the one unindexed foreign key in the schema
  (`player_bounty_activity.card_id`).
- **Realtime was publishing two immutable catalogs and nothing that moves.**
  The publication now carries shops, listings, purchases, market listings,
  trades, friendships, news, serialized supply, and the caller's own
  collection and inventory — all RLS-scoped, so a row only ever reaches a
  client already allowed to read it. Currency, collection, storefronts, the
  marketplace, friend requests, trade offers and the news feed now update in
  place instead of waiting for a navigation.

Still outstanding: **leaked-password protection is off** in Auth settings.
That is a project auth setting rather than schema, so it has to be switched on
from the Supabase dashboard (Authentication → Policies → Password strength).

### v6.9 — A keyword per Essence Type, the blocked-is-blocked fix, catalog resync

Full balance analysis in `docs/BALANCE_SIM_FINDINGS_v6.9.md` (which
supersedes and replaces the v6.6 and v6.7 findings docs).

#### Catalog integrity (found first, because it invalidated everything else)

- **The v6.8 rarity migration was half-applied, and nothing was checking.**
  `public.cards.template` was updated for six cards and `public.cards.rarity`
  for a different four, leaving the client, the server economy and the
  bundled sim catalog disagreeing about ten cards. Because mechanics are
  hashed from `id|type|rarity`, four cards (`astral_shoal`,
  `chrysalis_of_the_departed`, `fayes_true_face`, `void_mother`) were dealt
  **entirely different costs, stats and keywords in live matches than in
  every balance sim**, and six more — including three of the eight Leaders —
  were priced, dropped and copy-capped a full tier too cheap by every server
  RPC. All ten resynced to Mythic in both places; live and bundled digests
  now match exactly (292/292). No inventory migration was needed
  (`player_cards` caches no rarity), and the `decks` table was empty so no
  saved deck violated the tightened Mythic 1-copy cap.
- **`scripts/verify-pool.ts` / `npm run verify:pool`** — new drift guard that
  diffs template vs rarity column vs bundled catalog and exits non-zero.
  The previous "parity check" compared the bundled catalog against itself and
  could never have caught this.
- `scripts/backfill-cards-db.ts` output applied for the 69 rows whose printed
  mechanics changed, so the denormalized `essence_cost` / `might` / `grit` /
  `keywords` / `rules_text` columns match the new printings.

#### Engine

- **Blocked is blocked.** `resolveClash` derived "was this attacker guarded?"
  at resolution time, from a map `stateBasedChecks` had already pruned dead
  guards out of — so an attacker whose only blocker left the field mid-clash
  read as _never guarded_ and hit the defending player for full Might. That
  was directly exploitable: attack, let the opponent block with their biggest
  body, then kill your own blocker with a Quick Event in the reaction window
  and the attack landed unblocked. Now snapshotted at `declareGuards` time
  (`ClashState.guardedOnce`); only Overrun spills, and only the excess past
  what its guards actually absorbed. Rulebook §6 states it explicitly.
- `runDusk` clears a stale clash object, which would otherwise freeze the
  next player's combat outright (`declareAttackers` refuses while `clash` is
  set).
- New `src/game/v3/edgecases.test.ts` (48 adversarial tests) covering hostile
  guard assignments, phase desync, cost evasion, targeting, turn-boundary
  triggers and win conditions.

#### New content — one keyword per Essence Type

- **Wildfire** (Ember), **Tidecaller** (Tide), **Thriving** (Root),
  **Nimble** (Gale), **Radiant** (Light), **Withering** (Shadow),
  **Entropic** (Void), plus two new effect actions — **exhaust** (tap an
  enemy unit) and **weaken** (-X/-X, permanent) — woven into each colour's
  ability vocabulary.
- Gated behind dedicated salted rolls (`newkw`, `newkw2`, `newfx-*`) that
  _substitute_ rather than append, so only 59 of 292 cards re-print and just
  4 of 86 tuned cards were touched — appending to `KEYWORDS_OF_COLOR` would
  have re-rolled the entire pool and invalidated every per-card adjustment.
- `boneplate_sentinel`'s v6.7 `+1` retired: it was earned as "a Venomous
  cost-5 Unit" and the card no longer has Venomous.

#### Balance (two cohorts, 5,952 games each, 0 invariant violations)

- **Leader nerfs**: `avatar_of_the_abyss` minus resolve -3 → -4 (first in
  both cohorts a third pass running, at 10.2/9.0 ability activations per game
  with a win rate that _climbs_ with game length); `crimson_vector_commander`
  -1 → -2 (v6.7's named next lever, coming due after its watch pass).
- **Leader buffs** via the new `LEADER_PLUS_ABILITY_OVERRIDE` — the first
  lever this project has had for the _bottom_ of the spread.
  `ethereal_sea_witch` and `ruinwalker_overseer` both finished last in both
  cohorts with kits that could not interact with the board at all (one only
  drew and gained life; the other's two abilities were the same buff at two
  sizes). Their plus abilities become `+1: Exhaust a target enemy unit` and
  `+1: A target enemy unit gets -1/-1`. Cohort A's Leader spread narrows from
  37.0 points to 31.6; cohort B's from 50.9 to 39.8.
- **Keywords**: Doublestrike 4 → 5 (third confirming pass); Resonant 2 → 0
  (three-pass repeat offender, now resolved at -4.3/+1.1).
- **Cards**: `galleon_shipwreck` +1 (a cost-1 Sanctum that ramped _and_ swept
  every enemy unit each Dusk), `resonant_shuriken` +1 → +2, `abyssal_pathway`
  +2 → +3; `spectral_leviathan` and `kunoichi_of_the_magma_rings` stat-trimmed
  — both print at the cost cap, where `COST_ADJUST` is provably inert (a `+2`
  trial on the latter re-ran byte-identical to `+1`).
- **CPU**: `wastedEssenceWithPlay` fell 3x (2,689/3,353 → 902/998), not from
  a heuristic fix but from giving the new actions a priority opinion
  (`needsEnemyUnit`, and `exhaust`/`weaken` valuations in `runLeaderAbility`)
  — effects the curve had no opinion about scored the default and sat in hand
  behind essence that then expired.

#### UI

- The rulebook's keyword list is grouped by card type instead of one flat
  31-entry alphabetical run.
- An illegal guard assignment names the specific rule that blocked it
  (exhausted / Aerial / Nimble) instead of listing every rule it might be.

### v6.8 — New card template set, video cards to Mythic, Full-Art above Ultra-Rare

- **New card template** (`src/components/CardFaceV4.tsx`), implementing the
  "Card Template Options" design sheet. One print language at every rarity:
  a solid ink masthead (name + the existing essence-cost pips), a boxed 4:3
  art window, a **rarity rule** under the art whose thickness is the ladder
  position (1px Common … 7px Mythic), a type line stamped with the short
  rarity marker (C/U/R/SR/UR/FA/MY) instead of the spelled-out chip, a dashed
  flavor divider, and the Might/Grit (Resolve) plate anchored to the card's
  bottom-right corner at every tier. Rarity-specific layers: Super-Rare+ ghost
  the rarity color over the art with a diagonal gold sweep; Ultra-Rare+ add a
  struck gold corner ribbon; Full-Art and Mythic go full-bleed (Mythic over a
  scanline bed, with rising embers and a glowing gold inner frame); foil
  prints are a **static** prismatic stamp (masthead band, border ring, body
  wash, plain black title) with no motion at all.
- **Text fitting**: rules text now measures itself and sheds clamped lines
  until it fits its box (`FittedRules`, same technique as `FittedFlavor`), so
  a long ability can no longer be cut off mid-line; flavor is pinned to the
  bottom of the text box under a dashed rule.
- **Every video card is now Mythic.** The Mythic template _is_ the looping
  video print, so Astral Shoal, Chrysalis of the Departed, Faye's True Face
  and Void Mother moved Full-Art -> Mythic (Supabase `cards` + the bundled
  `src/game/generated-cards.ts` fallback). Mythic 6 -> 10 cards,
  Full-Art 30 -> 26.
- **Full-Art moved above Ultra-Rare** on the whole ladder: `RARITY_ORDER`,
  `packodds`/`PackOpening`/marketplace/shop orderings, the deterministic
  stat-budget tier in `cardpool.ts`, the `Rarity` unions, quicksell price
  (500 -> 1000, above Ultra-Rare's 800 — client `economy.ts` and the
  `card_sell_price` SQL function), the `rarity_tier` SQL function, serialized
  supply (`serialized_supply.cap` for Full-Art 150 -> 75, below Ultra-Rare's
  100), and every `pack_types.slot_config` weight (Full-Art's and
  Ultra-Rare's weights swap in each slot, leaving each slot's total
  probability mass unchanged; the one slot that offered Full-Art without
  Ultra-Rare now offers Ultra-Rare there instead). Deck copy caps are
  unchanged (Super-Rare/Ultra-Rare/Full-Art 2, Mythic 1).
- **Dev gallery** (`/gallery.html`) rebuilt to mirror the design sheet's
  coverage: every card type at every rarity, both full-bleed rarities,
  serialized prints and a foil-print row, at all four card sizes.

### v6.6 — Randomised turn order, tempo-based first-mover compensation, cost-lever fix

- **Turn order is now a per-match coin flip.** The human seat is hardcoded to
  `P1` and turn order was hardcoded to start there, so the player was
  permanently on the play in **every** match. `createGame` takes a
  `firstPlayer`, `GameState` records it, and the turn-1 Deal skip, the
  turn-counter rollover and the Wellspring allowance all key off it instead
  of the literal `'P1'`. The match header shows ON THE PLAY / ON THE DRAW.
- **First-mover compensation swapped from cards to tempo.** Six consecutive
  balance passes measured P1 at ~59-63% despite the second player's 8th
  opening card. The v6.6 harness located the edge: concentrated in short
  games (76.5% at <=10 turns, 64.6% at 11-20) and gone by turn 21+ (51.8%) —
  a tempo lead, not a card-advantage one, and the 8th card measured worth
  under a point. Both players now open on 7 cards; whoever is on the draw
  plays **two** basic Wellsprings on their opening turn, the second entering
  exhausted. **P1 win rate 60.2% -> 47.2%; seat-swap 48.1%.**
- **`COST_ADJUST` is now a price-only lever.** Units derived their stat
  budget from cost, Events their effect magnitude, Charms their bond stats —
  so a cost adjustment moved a card's power in lockstep with its price and
  was close to balance-neutral in both directions. This is why the table had
  accumulated two- and three-point stacks that never moved a residual, and
  why three cards overshot into the opposite sign. It had printed
  `helix_swarm` (three "buffs") as a cost-1 **1/1** and `clockwork_nautilus`
  (two) as a cost-5 **1/1** with two keywords, while `glass_shrimp` gained
  stats from each of its three "nerfs". Stats and magnitudes now derive from
  the card's natural pre-adjustment cost. The table was reset to single
  points and re-derived; Locations kept their stacks (`mapLocation` never
  derived power from cost, so the lever was already clean there).
- **Card changes**: `sunken_archive`'s v6.2 cut reverted (it had overshot to
  a +17.6 residual and was the single driver of the four-pass Sacred keyword
  flag; now reads -0.2). `skull_cathedral` +1, the one outlier that cleared
  both the significance gate and two-cohort confirmation.
- **CPU fixes**: Wellspring choice now weights unlocking a colour-stuck hand
  card above raw pip demand (21,126 misplaced Wellsprings per run -> **0**);
  Charms bond to the sturdiest body rather than the biggest Might and skip
  bodies already carrying Charms (-14% Charms lost on a unit that died the
  same turn); reaction-window holds only happen when the opponent actually
  has a unit that can attack.
- **UI/QoL**: the boot splash explains itself and offers a manual retry
  instead of up to 20 silent seconds on a slow connection; the in-match
  Wellspring control shows the remaining allowance instead of always
  claiming "one per turn"; two stale eslint-disable directives removed.
- **Shed-picker modal fix**: the full-screen shed overlay is opened by the
  top-bar phase button, which sat _above_ the overlay and stayed live — so
  the modal never blocked its own opener and clicking it just re-entered the
  shed flow. The phase button is now hidden while the picker is up.
- **Two invisible in-match affordances surfaced**: the attacker's own
  reaction window (opened by the engine, used by the CPU, but the hint bar
  only ever said "RESOLVE CLASH"), and the reason CONFIRM GUARDS is
  disabled — it is `disabled`, so clicking cannot surface the reason and the
  only explanation was a `title` tooltip that shows nothing on touch. Both
  now appear in the hint bar.
- **Accessibility (WCAG 2.5.3 Label in Name)**: the shed picker's SUGGEST and
  BACK buttons carried aria-labels that _replaced_ their visible text
  ("Auto-select cards to shed", "Cancel shedding"), so their accessible names
  contained none of the words a player can see and voice control could not
  target them. An audit across every `aria-label` in `src/` found exactly
  these two; both now include the visible label.
- **Verified end-to-end in a browser**: guest boot, every reachable menu
  screen, and a full CPU match played to a result (coin flip, mulligan,
  Main I → Clash → Main II, shed, human guard assignment, clash resolution,
  game over) with zero console/page errors.
- **Sim harness (v6.6)**: ground-truth attack-decision capture via a new
  `onAttackDecision` telemetry hook (resolves the four-pass "21% attack
  divergence" carry-forward — real divergence is **0.1%**, the rest was
  snapshot/timing daylight); Wilson 95% intervals on every card residual
  plus a significance-gated outlier list (the old z-score list was blind to
  sample size, the likely cause of the overshoots); per-card keyword carrier
  detail built from the full pool; Event effect-magnitude profile;
  printed-budget stat-vs-cost audit; first-player-advantage diagnosis; and
  five new CPU reasoning-lapse counters. Full pool parity re-verified
  292/292 against live Supabase. Findings in
  `docs/BALANCE_SIM_FINDINGS_v6.6.md`.

### v6.4 — Prebuilt starter decks, location card pip cleanup, balance pass

- **New: prebuilt starter decks.** New accounts opening the Starter Box now
  choose between picking their own Leader (a randomized legal deck, as
  before) or one of three ready-to-play prebuilt decks — Aggro (Legendary
  Diver), Midrange (Mer-King), Control (Ruin-Walker Overseer). Prebuilt
  decks are Common/Uncommon-heavy with a small handful of Rares, no
  Super-Rare-or-above cards, and are granted entirely non-foil. Implemented
  server-side as a new `claim_starter_deck` RPC alongside the existing
  `claim_starter_box`, consuming the same one-time Starter Box grant.
- **Location card fix**: removed the produced-essence pip that sat in the
  type line next to the rarity chip — redundant with the "Exhaust: add one
  [type] essence" line already printed in the card's rules text.
- **Card cost/stat adjustments** (5,952-game sim pass): eleven newly-flagged
  cards adjusted for the first time, five repeat offenders from last update
  got a second stacked point, and two cards from last update's adjustments
  (Heart of the Thermal Grid, Shatterline) overshot into the opposite
  direction and were reverted back to their original cost. Full list in
  that pass's findings doc (since removed — only the latest sim doc is kept).
- **Sim harness**: added per-Leader-ability usage/value tracking (splits the
  existing per-Leader ability-use count by which of a Leader's two abilities
  actually gets picked) and guard-trade quality tracking (of every guard
  block the CPU assigns, whether it kills the attacker, trades with it, or
  dies for nothing). Full pool parity re-verified 292/292 against live
  Supabase.
- **Match-hang fix**: hitting SKIP during the CPU's brief "thinking" pause
  (before its turn had even started resolving) did nothing — the skip
  handler only knew how to fast-forward the beat-by-beat animation timer,
  which wasn't running yet at that point, so the match could sit stuck on
  the CPU's turn indefinitely. SKIP now also fast-forwards that initial
  delay straight into resolving the turn.
- **CPU lethal-check fix**: the CPU's "is my all-in swing actually lethal"
  math assumed an Overrun attacker's spill damage past a guard was always
  `Might - 1` (or `- 2` for a Swarmproof pair), regardless of how tough that
  guard actually was — so it wildly overestimated spill against a
  high-Grit blocker (treating a 6-Grit wall as absorbing just 1 damage) and
  could talk itself into an all-in attack that wasn't really lethal once
  guards were assigned. It now uses the guard's actual remaining Grit. The
  sim harness's shadow model was updated to match, so next balance pass's
  attack-decision numbers reflect this fix rather than the old bug.
- **Guest/offline boot fix**: a failure fetching the Store's public catalog
  data (shop items/pack types — used only to pre-warm the Store screen) used
  to trip the same fatal "Couldn't reach the server" boot screen as an
  actual auth failure, before `AuthScreen` (and its PLAY AS GUEST button)
  was ever reached — so a real network hiccup on that one non-essential
  endpoint could strand a player, including one who only wanted to play a
  local guest match, on a dead-end retry loop. That fetch failing now just
  leaves the Store's catalogs empty (it already has its own "nothing on the
  shelf" empty state) instead of blocking the whole app from booting.
- **Accessibility/markup fix**: the Dusk "choose what to shed" picker
  rendered a card's own Essence Cost info button inside the card's own
  "Shed this card" button — nested interactive buttons are invalid HTML and
  confused screen readers about which control a click/Enter actually
  activated. The outer shed control is no longer a nested `<button>`.
- **Reliability fix**: the Collection screen's "QUICKSELL ALL [rarity]" bulk
  sell action had a code pattern our lint tooling couldn't verify as safe
  (a running total mutated across several `await`s inside the component);
  moved the sell loop into a standalone helper function with the same
  behavior so it's both verifiably correct and passes CI again.
- **Docs cleanup**: removed the superseded v6.3 findings doc (only the
  latest sim findings doc is kept in-repo); fixed stale README references
  (a leftover "30-card decks" line from before the 60-card rulebook-alignment
  update, the already-retired prebuilt-archetype-decks mention, a dead link
  to a deleted findings doc); fixed a broken CI step that referenced an
  `npm run sim:v4` script which didn't actually exist in `package.json`.

### v6.3 — Resonant per-card fix, Avatar of the Abyss second nerf, bug hunt

- **Avatar of the Abyss gets a second nerf**: last update's Commander strip
  brought it down but a dedicated head-to-head test against every other
  Leader still had it clearly on top. Its -2 Shatter Ability now costs -3
  Resolve instead. Random-match win rate down from 67.8% to 63.2%; the
  isolated head-to-head average down from 77.4% to 70.3% — real progress,
  still the one to watch.
- **Resonant fixed at the card level instead of another blanket price cut**:
  last update's guess about which of Resonant's three cards was dragging the
  keyword down turned out to be backwards once tested with a bigger sample —
  Dissolving Persona is actually fine; Bioluminescent Tide and Flash Freeze
  (both cost 5) were the actual underperformers. Both now cost 1 less.
- **Card cost/stat adjustments**: eight repeat over/underperformers from
  last update that hadn't fully settled got a second nudge, ten newly-
  flagged cards cost more, eight cost less, and Familiar in the Dark
  (already at the cost ceiling) had its stats trimmed again. Full list in
  that pass's findings doc (since removed) .
- **Bug-hunt pass**: the Battle Pass's claim button used a check that
  treated tier 0 as "nothing in progress" (0 is falsy), so a fast double-tap
  on the very first tier could fire two claims at once before the button
  disabled — same class of bug as an earlier "0 treated as no value" fix
  elsewhere in this game, now closed here too. The Collection screen's color
  filter used to skip Leader cards entirely, so a Leader whose real color
  didn't match the filter you picked still showed up; Leaders are now
  filtered by their actual color identity like every other card. Several
  Supabase data-fetch failures (Store items/packs, your shop and its
  listings, Social's friends/trades/leaderboard/search) were being silently
  swallowed into an empty screen instead of triggering the RETRY screens
  that were already built for exactly this — a real network hiccup now
  looks like a network hiccup, not "you have nothing here." Keyboard focus
  now moves into the Concede, mulligan, and game-over dialogs when they open
  (and back to what you were doing when they close) instead of leaving
  keyboard nav free to tab through the live board underneath; How To Play's
  collapsible sections now tell screen readers whether they're open or
  closed. Accessible labels added to the Starter Box dialog.
- **Sim harness**: fixed an Ambush activation-tracking bug in the harness's
  own new dead-weight counter (Ambush was reading a false 100% "never
  activates" every run — a harness bug, not a CPU one) and a tautology in
  the new per-Leader idle-ability breakdown that would have always read
  100% regardless of actual CPU behavior; real numbers now show a healthy
  0-0.3% idle rate across every Leader. Full pool parity re-verified
  292/292 against live Supabase. Full details:
  that pass's findings doc (since removed) latest sim-run JSON is kept).

### v6.2 — Leader nerf, keyword re-tune, CPU false-alarm fixes

- **Avatar of the Abyss loses its Commander keyword**: two consecutive
  balance passes flagged it as the top Leader outlier (67.0% then 70.3% win
  rate) — it was stacking max Resolve, an unconditional -2 Shatter, and
  Commander's global +1 Might aura in one kit. A dedicated per-Leader-pair
  test suite confirmed the Leader kit itself (not just lucky decks) was the
  problem, so Commander comes off — the same "strip a keyword from a repeat
  offender" fix used on regular cards before.
- **Keyword re-tune** (bigger sim samples this pass, including for two
  keywords the last pass didn't have enough data on): Resonant Events cost 1
  less (3→2 — the previous sample was too small and had it backwards),
  Doublestrike 1 more (3→4), Reckless 1 more (1→2), Regenerate 1 less
  (3→2), Surge to free (1→0, a second straight pass underperforming).
- **Card cost/stat adjustments**: two repeat overperformers from last pass
  that hadn't fully settled got a second bump (Slate-Scaled Serpent,
  further +1; Coral Collapse and Tectonic Rift, further -1); fourteen newly
  flagged cards were adjusted for the first time (ten costed up, four costed
  down; see that pass's findings doc (since removed) for the full list), and
  Familiar in the Dark (already at the cost ceiling) had its stats trimmed
  instead.
- **CPU false-alarm fixes in our own balance tooling**: three of the CPU
  "reasoning lapse" counters our balance sims track turned out to be
  measuring the wrong thing rather than real CPU mistakes — a "died while
  holding spare guards" counter was counting guards that had ALREADY blocked
  this turn as spare (16.9% of games → a real 3.0%), a "bad removal target"
  counter was flagging every correct "shatter around an Unbreakable wall" as
  a mistake (4.2% → 2.8%), and a "should have attacked differently" counter
  was comparing the CPU against an outdated attack model instead of its
  actual (intentionally more aggressive) policy (40.1% → 21.8%). No CPU
  behavior changed — only the numbers we use to judge it got more honest.
- **Sim harness**: `venomousSuicide` now splits into deliberate trades vs
  genuine blunders (most turned out deliberate), and a new deckSeed-pinned
  per-Leader-pair test suite isolates Leader-kit balance from random-deck
  luck for future passes. Full details: that pass's findings doc (since removed)
  (v6.1 findings doc removed; only the latest sim-run JSON is kept).
- **Bug-hunt / QoL pass**: the Deck Builder's CHANGE LEADER button could
  leave a color filter from the OLD Leader's identity in place — under a
  single-color new Leader the filter selector itself may not even render,
  silently zeroing the visible card pool with no way to see or clear the
  stuck filter; it now resets on Leader change. The Starter Box Leader
  picker could fire two claims from one fast double-click (or two different
  tiles) before the parent's busy-state re-render landed — tiles now latch
  disabled the instant one is picked, and un-latch again if the claim fails
  so a retry isn't stuck forever. A card-text rendering bug meant an effect
  explicitly printed as "0" (Deal a card, Erode) rendered as "1" instead,
  because the text builder treated `value: 0` the same as "no value
  printed" (falsy-checked instead of `undefined`-checked). A card's
  auto-introduced keyword popover could pop back open on its own after a
  player manually closed it, if its staggered auto-open timer hadn't fired
  yet when they closed it. Player Shops' REOPEN SHOP / CLOSE SHOP / buy-slot
  actions were silently resetting the in-progress "add listing" panel on the
  same screen, inconsistent with every other action button here. Accessible
  labels added to the in-match Wellspring buttons (icon-only, tooltip-only
  before), the Starter Box close button, and the player-profile close
  button.

### v6.1 — Clash & Coverage: rulebook combat fixes, sharper CPU, full-pool decks

- **Overrun spill fixed (engine)**: a guarded attacker whose guards all died
  in the Quickstrike sub-step was pushing its FULL Might to the defender's
  face; now only Overrun attackers spill, and only the excess past what the
  guards absorbed (rulebook §6).
- **Reaction window for both players (rulebook §5)**: `reactionOpenFor` now
  opens the guard-step window to the active player too — Quick Events and
  Ambush units can answer in your OWN Clash, in the match UI and for the CPU.
- **Rules tightening**: mulligan legality is gated to the start of the game;
  opening-hand draws and mulligan redraws route through the empty-deck loss
  check; `'dies'` triggers fire on banish as well as ash.
- **Keyword pricing unified**: all non-Unit keyword surcharges now come from
  `KEYWORD_COST` (previously hardcoded per-mapper and contradicting the
  table). Balance changes: Resonant +1 (2→3), Bountiful −1 (2→1),
  Resolute +1 (0→1). Sim-verified: Resonant settled +20.7→+7.1 delta,
  Bountiful −24→+8.2.
- **CPU intelligence pass**: Venomous/Quickstrike-aware blocking,
  Swarmproof-aware attacking, free attacks and favorable trades, no Leader
  self-shatter for minor value, Resonant/Bountiful play priority, Surge
  discounts in planning, Leader pips in Wellspring choice, per-game
  reservation state (was leaking across games), no essence waste on failed
  rebonds.
- **Full-pool deck generation**: seeded jitter in the deck scorer lifts
  random-deck pool coverage from ~54% to ~88% of the non-Leader catalog
  (Supabase ↔ bundled catalog parity re-verified, 292/292 ids).
- **Crash safety**: app-level ErrorBoundary; CPU-turn exceptions recover to
  the human's turn instead of white-screening the match.
- **Bug fixes / QoL**: News Center headline derived from the newest
  changelog entry (was hardcoded two releases stale); Bounty Shop and Social
  screens get error + RETRY states instead of hanging/false-empty; auction
  countdown ticks every 10s and ended auctions disable BID/BUY; the sell
  list reacts to serialized pulls (missing useMemo dep); deck-code import
  validates deck size and rejects Leaders in the body; signOut clears local
  session state immediately; bulk quicksell shows live progress; Dusk shed
  picker gained the promised SUGGEST button and Escape support; mulligan UI
  warns on small hands and stops at 1 card; leader invoke reports
  already-invoked/shattered honestly; Deck Builder gained CHANGE LEADER and
  a dirty-check on the leader-step BACK; changelog entries show dates;
  guest Play screen says QUICK MATCH; consistent FRY CARDS wordmark.
- **Sim harness v6.1**: leader-vs-leader matchup matrix, per-card-type play
  stats, per-card play rate, full-pool coverage report, opening-hand curve
  quality, win-margin histogram; fixed the seat-swap first-player metric
  (old one measured deck A's overall win rate, i.e. nothing). Findings:
  that pass's findings doc (since removed) latest sim-run JSON is kept).
- **Docs cleanup**: retired `docs/RIFTBOUND_SPEC.md` and scrubbed the
  internal codename from code comments; `scripts/backfill-riftbound-db.ts`
  renamed to `backfill-cards-db.ts`.

### v6.0 — Full rulebook alignment, ten type keywords, MTG-format card faces

- **Rulebook deck rules (the big one)**: decks are now **at least 60 cards**
  (editor ceiling 100) with a **4-copy maximum** per card, replacing the
  30-card / 3-copy digital adaptation. Premium rarities keep the stricter
  economy caps (SR/FA/UR ≤2, Mythic 1). Enforced client-side
  (`decks.ts`/`DeckBuilderScreen`/deck codes) AND server-side
  (`rarity_copy_cap`, `save_deck` — `is_valid` is now `60..100`); existing
  decks were re-graded and `claim_starter_box` now builds a legal 60-card
  starter deck (3 copies per card).
- **Rulebook hands & mulligan**: opening hands are 7 cards (P2 still draws
  an 8th as the measured first-mover offset). The mulligan is the rulebook's:
  shuffle back, draw **one fewer**, repeatable — engine `mulliganHand()`,
  a repeat-capable match-UI overlay, and the CPU/sim path all use it.
- **Ten new keywords — two per card type** (engine-implemented, cost-weighted,
  deterministically assigned across ~58 pool cards, backfilled to the DB):
  - Unit **Regenerate** (heals all marked damage at Dawn) and **Hardened**
    (every damage packet reduced by 1; a fully-absorbed hit applies no venom
    and feeds no Siphon).
  - Event **Surge** (costs 1 less after another invoke this turn — engine
    `effectiveCost()`, honored by the match UI and the CPU) and **Resonant**
    (the effect resolves twice).
  - Charm **Runic** (bonding from hand Deals a card) and **Soulbound**
    (returns to its owner's hand when the bonded unit leaves the field).
  - Location **Bountiful** (exhausts for 2 essence — `locationYield()`,
    counted by the CPU's affordability planning) and **Sacred** (restores 1
    Vitality at its controller's Dawn).
  - Leader **Commander** (+1 Might aura while fielded) and **Resolute**
    (regains 1 Resolve at Dawn, up to the printed value).
    All ten feed the sim's keyword telemetry; new engine tests cover each
    (`keywords-v6.test.ts`).
- **MTG-format card template rework** (`CardFaceV4`): name+cost top line,
  art (ratios untouched: regular 4:3 box, Full-Art full-bleed), a type line
  whose right slot carries the rarity marker at full size (stats there at
  the smaller tiers, rarity on the art), a text box ordered keywords →
  rules → flavor with bigger per-tier budgets, and a bottom-right stat
  plate (Might/Grit; Resolve for Leaders). The redundant color-dot footer
  band is gone. Fixed a long-standing bug where the essence-cost row could
  collapse into a one-pip-per-line vertical stack inside its popover button.
- **Essence icons redrawn**: all seven glyphs are now bold filled
  silhouettes (the old stroke-based gale/tide/void/shadow icons rendered
  ~0.4px strokes at pip size — effectively blank), and `EssenceIcon` quotes
  its CSS `mask-image` url so Vite's inlined data-URIs can't silently kill
  the mask (which hid the icon entirely) on production builds.
- **Sim harness v6.0 data capture**: per-card average first-play turn
  (tempo signature), board density (avg units on board per turn), clash
  texture (clashes/game, attackers/clash, first-clash turn), mulligan
  outcome split (mull vs keep win rates), turn-8 comeback rate, and essence
  spent per game; invoked Leaders now count as carriers of their own
  Commander/Resolute keywords.
- **Docs**: `RULEBOOK.md` rewritten for v6.0, spec updated, stale 30-card
  references cleaned across App/menu/How-To-Play, and the keyword glossary
  now labels each keyword's card type.
- **Bug-hunt pass** (adversarial review of the engine + every meta screen):
  - Engine: Sanctum `atDawn`/`atDusk` triggered abilities never fired
    (`runTriggers` only scanned units — dead printed text since v5.0);
    Resonant's second resolution re-aims via autoTarget when the explicit
    target died to the first; invoking the Leader now sets
    `invokedCardThisTurn` so it enables Surge.
  - CPU: `reserveLocationsForCost` is Bountiful-aware (no more failed or
    doubled reservations around 2-yield Sanctums); attack/guard trade math
    accounts for Hardened's -1 per packet (incl. Venomous needing ≥1 real
    damage); the human mulligan button allows the legal mulligan-to-0.
  - Meta screens: Serialized prints are reserved out of the Marketplace
    sell form, trade composer, and Player Shop listing picker (server
    always rejected them; the UI offered them anyway); a grouped pack-haul
    summary dropped the _whole group_ containing the best pull instead of
    just the spotlighted copy; Profile's cosmetic locker treated
    `cost_vouchers = 0` as "free" and showed unowned paid cosmetics as
    equippable.

### v5.3 — Reaction window for real, balance settle, essence icons everywhere

- **CPU fix (the big one)**: the clash reaction window finally works. v5.2
  taught the CPU to hold a Quick Event / Ambush unit back — but locations
  only recover at their owner's own Dawn, so a CPU that tapped everything
  during its turn still had no essence when the window opened. The CPU now
  reserves the _locations_ to pay for its held reaction card through its
  whole turn (capped at cost 3 so it never skips a development turn holding
  a bomb). Sim-verified: reaction plays went from 150/237 per 2,208-game
  suite to **3,038/3,624 (~20-25x)**, zero invariant violations.
- **CPU fix**: all-in lethal attacks no longer ignore guards — the CPU now
  assumes each ready defender soaks one attacker (Overrun spill counted)
  and only goes all-in when lethal survives worst-case guarding. Suicides
  into ready Venomous guards dropped 179/163 → 135/58 per suite.
- **Match UI fix**: the CPU now actually gets its reaction window when YOU
  attack (it was only wired up for sim games — a whole defensive subsystem
  was dead against human players), with its plays narrated in the clash bar.
- **Match UI fix**: a targeted Event with no legal target (empty or
  all-Warded enemy board) can no longer be invoked into a fizzle that wastes
  the card and essence — the client blocks it with an explanation. Units and
  Charms still play for their body/bond value and just lose the rider.
- **Balance** (from the v5.3 sim pass, that pass's findings doc (since removed) ):
  keyword weights — Venomous 2→3, Aerial 2→3, Quickstrike 3→4, Siphon 2→0
  (reversing v5.2's backwards read), Swarmproof 2→1, Warded 0→-1 (now a
  small discount), Unbreakable kept at 7 after trials at 8-9 showed its old
  overperformance was mostly the dead-reaction-window meta. Thirteen
  cross-run-confirmed card cost adjustments (7 up, 6 down) plus a new
  stat-budget trim mechanism for cost-capped outliers (Nanite Division
  Marshal -2).
- **Essence icons everywhere**: the 7 essence-type SVG glyphs now render in
  the card color-identity dots (header, footer band, and Full-Art floating
  dots), the Starter-Box Leader picker (which previously showed no color
  identity at all), and the Deck Builder's Leader-select list.
- **QoL**: opponent's ash-pile and Void are now inspectable (tap the ash
  counter in its info row); your own ash drawer also lists banished cards;
  the "not enough essence" tooltip now names the exact pip color your
  Locations can't produce yet.
- **Sim harness (v5.3)**: real keyword activation counts via new engine
  telemetry hooks, real wasted-essence and venomous-suicide lapse counters
  (both were dead counters in v5.1/v5.2), accurate erode tracking, a 7×7
  color-vs-color matchup matrix, keyword-by-cost-band stats, a separate
  deck seed for matched-cohort reruns, mulligan/vitality-margin/deck-remaining
  telemetry.
- **Docs**: retired `docs/BALANCE_SIM_FINDINGS_v5.2.md` (superseded by
  v5.3) and pruned all but the latest raw sim-run dump.

### v5.2 — CPU reaction-window fix, keyword re-tune, README catch-up

- **CPU fix**: the main-phase play loop always spent Quick Events and Ambush
  units the instant they were affordable during the CPU's own turn, so the
  clash reaction window almost never had anything left to use it with (sims
  showed near-zero reaction plays despite the v5.1 essence-tapping fix).
  The CPU now holds back one such card per turn for the opponent's clash
  reaction window instead, and floats all essence up front on turns where
  nothing in hand is reaction-capable (removing a partial-tapping edge case
  that could leave an affordable card falsely un-castable). Sim-verified:
  reaction plays roughly 4-5x more common across both test seeds, with no
  new invariant violations.
- **Removal targeting fix**: default auto-targeting (used by the CPU and by
  triggered abilities) no longer points a Shatter effect at an Unbreakable
  unit, which can't be shattered and would silently waste the effect; it now
  picks the biggest legal target that can actually be shattered.
  Reaction-window Quick removal targeting gets the same fix.
- **Attack-declaration tightening**: the CPU's attack heuristic now attacks
  only when a trade against the worst likely guard is genuinely favorable
  (kills and survives) or the hit is unguardable, dropping an extra
  "attack anyway if survives" case that was adding attacks a lookahead
  cross-check disagreed with.
- **Keyword cost re-tune** (`src/game/v3/keywords.ts`, from the v5.2 sim
  pass in `docs/BALANCE_SIM_FINDINGS_v5.2.md`): Unbreakable's cost weight
  raised again (6→7) — it stayed the single strongest keyword by a wide
  margin even after the v5.1 bump; Swarmproof raised (1→2) after its cost-2/3
  carriers ran hot across both sim seeds; Siphon raised (1→2), partially
  reversing the v5.1 cut now that cohort-normalized data shows it was
  under-costed rather than genuinely weak.
- **README**: rewrote "The Game" and the surrounding sections, which still
  described the retired v4.2 dice/Cast-Slot ruleset, to match the shipped
  essence-based v5 engine (Essence types, Might/Grit, Resolve, keywords,
  Dawn/Main/Clash/Dusk turn structure, all 8 Leaders).
- **Docs cleanup**: retired `docs/BALANCE_SIM_FINDINGS_v5.1.md` (superseded
  by v5.2) and stale raw sim-run dumps under `docs/sim-runs/`;
  `docs/RIFTBOUND_SPEC.md` now points readers to `docs/RULEBOOK.md` as the
  canonical rules reference and is kept only for its implementation-contract
  detail.

### v5.1 — Fry Cards rename, balance overhaul, smarter CPU

- **Name**: the game is now simply **Fry Cards** — the "Riftbound" codename is
  retired from all player-facing screens (rules docs keep it as a historical
  note).
- **Rules fixes**:
  - Siphon vitality gain is capped at 20, matching healing (it could
    previously run a player's Vitality up past 70).
  - The second player now draws a 6th opening card to offset the
    first-mover advantage (sims measured ~56% first-player win rate).
- **CPU overhaul** (all found via the new v5 sim harness):
  - Taps Locations to pay per spell instead of floating everything — so it
    now has essence available to use Quick Events and Ambush units in the
    clash reaction window, which it previously never did.
  - Re-bonds loose Worn Charms (previously never; 2,600+ re-bonds per
    2,208-game suite after the fix).
  - Chump-guards and gang-guards when facing lethal instead of dying with
    ready units, and models Doublestrike/Overrun damage correctly when
    deciding guards.
  - Avoids suicidal attacks into ready Venomous guards; plays anyTarget
    damage to the face instead of holding it forever when the enemy board
    is empty.
- **Balance pass** (three full sim passes, 292-card pool):
  - Fixed a structural pool bug: keyword cost surcharges were feeding the
    stat budget, making combat keywords effectively free stats
    (Quickstrike carriers sat at 80% win rate). Keywords are now a pure
    cost surcharge.
  - Keyword weights retuned: Overrun/Quickstrike/Alert up; Doublestrike,
    Venomous, Reckless, Siphon, Swarmproof, Warded, Skywatch down;
    Unbreakable priced as the premium it is; Immobile discount reduced
    (walls got better once the CPU learned to guard).
  - Tide is now an Aerial color and Root an Overrun color, fixing a pool
    where only ONE card in 292 had Aerial and aggro colors owned every
    good keyword (Ember/Gale were winning ~70% of games).
  - Five outlier cards cost +1: Heart Coral, Needle Seamstress, Merfolk
    Ritual, Pufferfish Lantern, Clawblade Greatsword.
  - Database mechanic columns re-backfilled from the new pool (292 cards).
- **Match UI / card template**:
  - Dusk shed picker — ending the turn over the hand limit opens a modal to
    choose which cards to discard (was: silent discard from the hand's end).
  - Charms with a targeted on-invoke effect chain to a target pick after
    the bond pick (was: silent auto-target).
  - Playable Quick/Ambush hand cards highlight during the clash reaction
    window.
  - Card text box no longer repeats keyword/bond/re-bond/Sanctum reminder
    text the chips already carry; long ability text auto-shrinks before the
    line clamp bites; rules-line budgets raised per size (standard 3→5,
    full 5→8). Fixes ability text getting cut off.
- **New sim harness** (`scripts/simulate-v5.ts`): full-pool CPU-vs-CPU
  tournaments with card residuals, keyword health, mechanic usage, CPU
  lapse counters and engine invariant checks. Replaces the retired v4
  dice-era harness.

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
    _winning_ (`archWinRoundsSum`, `clockSpeed` in the JSON dump). The
    existing `archTotalRounds` averages over wins _and_ losses, so an aggro
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
  capped against the _combined_ spare total for each variant independently,
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
  _next_ click too, so tapping a different keyword chip while one popover
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
  deck-swap isolation the v4.10 doc asked for shows the _identical_ Avenge
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
  other cards _at the same cost band_ — it cleanly re-confirms the exact-cost
  wall bodies (Flickering Sea Pens / Cavernous Watcher at +30pt over their
  band). A **keyword-health table** pairing each keyword's win% with pool
  prevalence and measured cast activity — which immediately surfaced that
  Crescendo, the bottom keyword every pass, exists on a _single_ card. And an
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
  was slightly _better_ without it, games ran a full round shorter, and the
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
  _identically to baseline to the decimal_, and removing Avenge outright
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
- **Pack inventory** (Store ▸ MY PACKS): packs can now be bought _without_
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
  that a card copy isn't already reserved by one of the player's _other_
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
  _construction quality_ (aggressive/tempo shells beat reactive shells in a fast
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
