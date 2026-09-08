# Full-stack audit — 8 September 2026

Companion to `UI_UX_AUDIT_2026-09-08.md`, which covers card readability and turn-flow
guidance. This document covers everything else: the showcase lock-out, backend
security and load, gameplay balance, shallow mechanics, and the cheap robustness
guardrails.

**Provenance.** §1–§2 and §5–§6 were verified against this repository and the live
Supabase project (`dnngihsbqxccqvvedvjc`) during this pass; each claim below names the
evidence. §3 reproduces the results of a 2,208-game balance run that was **not**
re-executed here — those numbers are carried forward from the reporting pass, and the
recommendations built on them are proposals, not applied changes. §4's engine counters
are from the same run.

---

## 1. Fixed in this change

### 1.1 The showcase lock-out (most severe functional bug found)

**Symptom.** A live profile frozen at `SHOWCASE FULL (6/6)` with no path out of the UI.

**Mechanism, end to end.** All six pinned ids were real cards, legitimately acquired —
this was never referential corruption. Four had since been graded, and `submit_grading`
moves the copy *out* of `player_cards` (`quantity → 0`) into `graded_cards` while nothing
prunes `profiles.showcase_cards`. `set_showcase_cards` then re-validated the **entire**
array on every write:

```sql
select count(*) into v_owned from player_cards
where user_id = v_uid and card_id = any(v_ids)
  and (quantity + foil_quantity) > 0;
if v_owned <> array_length(v_ids, 1) then
  raise exception 'You can only showcase cards you own';
```

`CollectionScreen.toggleShowcase` always sends the whole array — `[...showcase, cardId]`
to pin, `showcase.filter(...)` to unpin. Either way it still contains the four graded ids,
so the count never matched and **every** write threw, including the unpin that would have
fixed it. Systemic: it hits any player who grades, quicksells, trades or lists a showcased
card.

**The three fixes, all shipped together** (`supabase/migrations/20260908000000_…`, plus
`src/meta/{ProfileScreen,CollectionScreen,PlayerProfileModal,ui}.tsx`):

1. **Validate the delta, not the array.** Ownership is checked for ids being *added*;
   already-pinned ids are grandfathered and removals are always permitted. This alone
   makes the state self-healing — whatever a profile is stuck holding, it can always be
   unpinned.
2. **Prune on divestment.** A trigger on `player_cards` removes a card from
   `showcase_cards` on the `1 → 0` transition and on delete. `player_cards` is the choke
   point every divestment path writes through — grading, quicksell, trade, listing — so
   one trigger covers all of them without editing eight function bodies. It only ever
   removes; pinning stays the player's decision. A backfill converges existing profiles,
   preserving order and keeping every pin the player still holds.
3. **Render dangling entries.** `ProfileScreen.tsx:277`, `CollectionScreen.tsx:508` and
   `PlayerProfileModal.tsx:210` all did `if (!def) return null` — a slot that is still
   occupied server-side, still counts toward the cap, and shows the player nothing. They
   now render `UnavailableShowcaseTile`, which names the problem and the offending id; on
   the player's own showcase it *is* the unpin button.

**Leaders in the showcase.** `void_mother` is `type: "Leader"`. Leaders are in
`POOL_BY_ID`, so they render, but whether they *should* be showcaseable had never been
answered. Answered now: **yes**. No code change was needed — this records the decision so
it is not re-litigated as a bug.

**The pattern, generalised.** A full-state revalidate on a partial edit turns "one row went
stale" into "you can never edit again". `set_showcase_cards` was the instance that bit; the
same shape is worth auditing across the other RPCs, and §6.3 tracks that.

### 1.2 Dead splash progress indicator

`App.tsx` computed `pct` from a `progress` counter fed by the boot-time image preload.
That preload was removed when media went load-on-demand, and nothing has called
`setProgress` since — so `progress.total` was permanently `0`, the label was permanently
`FETCHING CARD DATABASE…`, and the bar sat frozen at 0% for the whole splash. A progress
indicator that never moves reads as a hung app.

The one remaining request (`fetchCardTemplates`) reports no byte progress, so there is no
percentage to show. The bar is indeterminate now, with a static filled state under reduced
motion. The dead state and its unused `POOL_V4` import are gone.

### 1.3 `react-hooks/set-state-in-effect` — the one on a hot path

`src/meta/ui.tsx:130` called `setValue(null)` synchronously in an effect body, so every
card the player opened cost an extra render pass before its market-value request had even
been sent. Replaced with keyed state: the fetched value is stored alongside the key it was
fetched for and is simply unreadable during render when the key does not match — same
behaviour, zero extra passes.

**Not fixed: the other 24.** The warning appears 25 times across 14 files (heaviest:
`PlayerShopsScreen.tsx` ×9, `SocialScreen.tsx` ×3, `CardSubmissionsScreen.tsx` ×2). They
are the same "reset state, then fetch" shape and each is individually mechanical, but
sweeping 14 screens with no visual or mobile testing available (§5) risks more than it
fixes. They belong in a dedicated pass gated on the harnesses, not bundled into a card
readability PR. Lint is unchanged at zero errors; warnings drop 28 → 26.

### 1.4 Security advisor findings

| Finding | Verified as | Action |
| --- | --- | --- |
| 5 `SECURITY DEFINER` functions callable by `anon` | **Real.** `crack_graded_slab`, `quicksell_graded_card`, `record_match_result`, `reveal_graded_cards`, `submit_grading` each carried a bare `=X/postgres` ACL — an EXECUTE grant to `PUBLIC`, which on Supabase includes the pre-sign-in `anon` role. | `revoke … from public, anon`, with the explicit `authenticated` grant retained. Each also calls `auth.uid()` and raises on null, so this was never exploitable — but a PostgREST endpoint that mutates the economy should not be reachable without a session. `record_match_result` is the payout path and the notable one. |
| 8 grading functions with mutable `search_path` | **Real.** `grading_base_fee`, `grading_bulk_mult`, `grading_grade_mult`, `grading_roll`, `grading_service_premium`, `grading_speed_mult`, `grading_turnaround`, `grading_voucher_fee` all had `proconfig = null`; the 2026-08-28 pass pinned the functions it touched and missed exactly these eight. | `alter function … set search_path to 'public'`, matching every other function in the schema. |
| `match_receipts` / `match_tickets`: RLS on, zero policies | **Not a bug.** These are the anti-cheat ledger behind server-minted match ids. They are written only from inside `begin_match` / `record_match_result` (both `SECURITY DEFINER`, which bypasses RLS), and no client path reads them — grep of `src/` returns nothing, so nothing is "silently broken". Deny-all is the intended posture. | Grants explicitly revoked from `anon`/`authenticated` so the intent lives in the schema, plus a test asserting no client reads them. The advisor finding will persist; that is correct. |
| 78 `SECURITY DEFINER` functions callable by any authenticated user | **Real, deliberately not actioned.** The list is almost entirely legitimate player RPCs (`buy_shop_item`, `open_pack`, `save_deck`, …); revoking `authenticated` broadly would take the game offline. The defensible subset is the seven admin/creator functions (`admin_grant_card`, `admin_grant_currency`, `admin_set_role`, `admin_resolve_shop_report`, `creator_bulk_add_cards`, `creator_review_submission`, `creator_set_submission_ban`) — but all seven are called **from the browser client** (`src/lib/supabase.ts:1241–2169`), so revoking `authenticated` breaks the admin panel for admins too. | Deferred. Doing it properly means moving those seven behind a service-role edge function, which is a real piece of work and not a defence-in-depth one-liner. Tracked in §6. |
| Leaked-password protection disabled | Real, Auth dashboard setting. | **Not actionable from code or migration** — it is a project Auth config toggle. Enable it under Authentication → Providers → Password. |

### 1.5 Storage buckets had no ceilings

Both `Card Images` and `Other files` were `file_size_limit = null`,
`allowed_mime_types = null`. That is how 11 MB PNGs reached the CDN and became the
cached-egress bill the 2026-09-07 migration cleaned up after. Both now carry an 8 MB limit
(above every asset the generator currently produces, well below the outliers) and a MIME
allowlist of the formats the app renders. This stops the regression at upload time rather
than at the invoice.

### 1.6 CI was red on catalog drift

`verify:pool` was failing on `cards.rules_text` for `skyborne_skeleton_dragon`,
`the_pier_side_menace` and `the_wolf_of_wall_street`: the bundled catalog carried the newer
Unbreakable reminder ("Banish and 0 Grit bypass this save") and the live `cards` column
still had the old wording. Synced live-to-bundled, which is what `npm run db:sync` does.
Display text only — no mechanics, and the mechanics hash does not read `rules_text`.

---

## 2. Backend load and structure

Egress work landed in #148/#149 and is not revisited here. Structural observations that
remain open:

- **128 RPCs against 37 tables** is a very high ratio. It works, but it is a large attack
  and maintenance surface, and every advisor finding above scales with it. Worth a
  consolidation pass before the count grows again.
- **The delta-validation pattern (§1.1) should be applied across the RPCs generally.** Any
  function that re-validates full state on a partial edit has the same lock-out failure
  mode. `save_deck` and `submit_mystery_pool` are the obvious next candidates to read.
- **Both storage buckets are public.** Now capped (§1.5), but still public with no
  per-object authorisation. Acceptable for card art; worth revisiting if anything
  player-private ever lands there.
- **Filenames containing `:`** (e.g. `Void Mother:She was told….mp4`) are legal in storage
  but fragile across CDNs, tooling and Windows filesystems. Normalise on next upload rather
  than rewriting live URLs now.

---

## 3. Gameplay balance — carried forward, not re-run

From a 2,208-game simulation: invariants clean, 2 turn-limit draws. **None of this section
is applied in this change.** Balance edits without a re-run of the sim that produced the
numbers would be guesswork, and the deck-recipe normalisation in §3.1 has to happen first.

**Healthy signals.** P1 win rate 48.8% (turn order is fair; the on-the-draw Wellspring
compensation works). Vitality wins 96.2% / deck-out 3.8% — the intended win condition
dominates. Cost tiers 1–7 sit in a tight 49–56% band; the generated cost curve is broadly
sound.

### 3.1 Leader spread is 23.2 points

| Leader | Win % | Spread | Worst matchup |
| --- | --- | --- | --- |
| Avatar of the Abyss | 63.2% | 27.1 | 29.6% vs Mer-King |
| Void Mother | 59.0% | 33.3 | 35.2% vs Kuro |
| Kuro, the Unseen | 56.9% | 35.4 | 33.3% vs Avatar |
| Mer-King | 54.9% | 39.5 | 29.6% vs Kuro |
| Ethereal Sea Witch | 50.0% | 31.3 | 27.8% vs Void Mother |
| Sovereign of the Dying Star | 44.4% | 43.8 | 29.6% vs Avatar |
| Legendary Diver | 43.5% | 43.8 | 31.5% vs Sentinel |
| Ruin-Walker Overseer | 42.8% | 25.0 | 24.1% vs Mer-King |
| Sentinel of the Nether Pit | 40.0% | 29.2 | 29.6% vs Void Mother |

63% vs 40% across a nine-Leader roster is a serious competitive problem. **But read the
within-Leader deck spread first**: Legendary Diver's nine pinned decks range 12.5% → 56.3%,
Sovereign's 25% → 68.8%. A large part of the headline number is deck-construction noise,
not kit power. **Normalise the deck recipes before touching any Leader kit** — otherwise
the first round of "fixes" will be chasing recipe variance.

### 3.2 35% of all Essence generated is wasted

`wastedEssencePerGame: 36.59` against `essenceSpentPerGame: 103.5`. Only 192 instances were
"wasted with a legal play available", so this is a **curve/fixing problem, not an AI
problem**: players produce Essence in colours or quantities they cannot spend. This is the
single clearest systemic balance signal in the run and should be the first thing addressed.

### 3.3 Keyword balance is badly spread

Strongest: Sacred +9.9, Blighted +7.8, Freeze-Dry +7.3, Swarmproof +5.8.
Weakest: Exhume −16.8, Glaciate −8.0, Surge −3.1, Fate −2.2.

Exhume at −16.8 is close to a dead keyword — all three carriers are among the worst cards in
the pool. Glaciate at −8.0 is similar: both Glaciate Sanctums (Isle of the Ancients, The
Descent) sit at −12.3 / −12.4 residual.

### 3.4 Statistically significant card outliers

Wilson CI excludes deck baseline. Overperformers: Whale Fall Ceremony +20.5, Resonant
Shuriken +20.0, Shattered Horizon Protagonist +17.5, Scallop Map +17.1, Sunken Meadow +16.4.
Underperformers: The Garden-Variety Glock −20.7, Ruthless Succession −17.0, Familiar in the
Dark −14.5, Isle of the Ancients −12.4.

**Price nerfs off the ramp-matched column, not the flat one.** Sunken Meadow's flat +16.4
falls to +14.5 once ramp is controlled for, and that gap will differ per card.

### 3.5 CPU decision lapses

`guardDiesForNothingForced: 3081` is largely unavoidable. The genuine AI quality gaps are
`venomousSuicideDeliberate: 495`, `itemOnDoomedUnit: 849`, `idleLeader: 1065` and
`tookGuardableLethal: 96` — the last especially, since taking lethal that could have been
guarded is a straightforwardly losing blunder and the cheapest of the four to fix.

---

## 4. Shallow and incomplete mechanics

**The reaction window is near-dead content — the strongest finding in this section.** The
priority/stack system is one of the engine's most complex subsystems and the subject of two
High-severity fixes in the 2026-09-06 audit, yet of a 297-card pool only **13 (4.4%) can
legally be played in a reaction window, and the AI ever considers 4 (1.3%)**. Two Leaders —
Ethereal Sea Witch and Ruin-Walker Overseer — have **zero** AI candidates, meaning they
never interact during clash at all. A sophisticated interaction system with almost nothing
to put in it. Printing 20–30 more Quick/Ambush cards would activate a large amount of
already-written engine and is by far the highest ratio of design payoff to engineering cost
in this document.

**Leader Shatter is statistically nonexistent**: 6 shatters across 2,208 games (0.3%), with
a 0% shatter rate for eight of nine Leaders in the random-deck table. Whatever design
tension Shatter was meant to create does not exist in play.

**Leaders are ability-treadmills**: 32,989 ability uses vs 4,415 invokes (≈7.5×), with
`invokedNoAbilityGames: 0` across every Leader. The Resolve-spend / Resolve-build pair
collapses into a repeated loop rather than a decision.

**Known-incomplete, from the project's own docs**: the Ultra-Rare community poll/ballot is
unbuilt, and the Players Showcase 2026 Booster ships inactive pending the 100-card bar —
`card_submissions` currently has 0 rows, so the set is empty.

**Unused at scale**: `friendships`, `trades`, `market_listings`, `shop_purchases`,
`shop_reports`, `news_posts`, `player_serialized_cards` and `shop_mystery_pool` all have 0
rows. The marketplace, trading and shop-fraud systems are substantial code with no live
exercise — effectively untested against real usage, and the place a lock-out like §1.1 would
next surface.

---

## 5. QOL / UI / UX

**No visual or mobile testing has ever been performed.** The 2026-09-06 audit flagged this
(Chromium would not install) and it still stands — it is the most important open item in
this section, and it gates §1.3's remaining 24 warnings. Note that CI's `harnesses` job
*does* install Chromium and run `audit:screens` / `drive:match`, so the automated
accessibility harnesses have coverage; what is missing is human visual acceptance.

Fixed here: the showcase "card unavailable" state (§1.1) and the splash bar (§1.2).

Still open:
- The prior audit's four recommendations, all endorsed — particularly showing each pending
  card's locked target in the stack panel, and separate target selection for Tool /
  Freeze-Dry riders.
- **Generate the rulebook keyword tables from `KW_REMINDER`.** The standalone rulebook has
  already drifted once, and §1.6 is the same class of drift one layer down.

---

## 6. Robustness backlog

1. **`verify:pool` in CI — already done.** `.github/workflows/ci.yml` runs it in the
   `checks` job, and it is exactly what caught §1.6. No change needed; recording it so the
   recommendation is not re-filed.
2. **Bucket upload limits — done** (§1.5).
3. **Delta-validation sweep across the RPCs** (§2). Open.
4. **Move the seven admin/creator RPCs behind a service-role edge function** so
   `authenticated` can lose EXECUTE on them (§1.4). Open.
5. **Enable leaked-password protection** in the Auth dashboard (§1.4). Open, one toggle.
6. **Normalise `:` in storage filenames** on next upload (§2). Open.
7. **A trend-diff script over `sim-runs/`.** The reports are timestamped JSON; a small
   differ would turn balance passes into a tracked series rather than one-off reads. Open,
   and a prerequisite for doing §3 credibly.

---

## Verification

- Migration: `supabase/migrations/20260908000000_showcase_delta_validation_and_hardening.sql`.
- New suite `src/meta/showcase.test.tsx`: 17 tests, covering the delta check, the prune
  trigger and backfill, all three render sites, the splash bar, the revokes, the eight
  `search_path` pins, the ledger staying closed, the bucket ceilings, and the effect fix.
- Full suite, typecheck, `typecheck:game`, format check and production build: see the PR.
- ESLint: zero errors, 26 warnings (down from 28).
