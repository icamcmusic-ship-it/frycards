# Backend changes: live status

## 2026-10-13 CPU buyer personas

Applied live: `20261013000100_cpu_buyer_personas.sql`, `20261013000101_shop_haggle_log_opening.sql`.
Pending (DELETE): `20261013000190_pending_cpu_buyer_personas.sql` — `prune_market_listing_cpu()` sweeps
`market_listing_cpu` rows of finished listings (the live `run_cpu_bidders` no longer deletes them).
Design and before/after cost: [CPU_BUYERS.md](CPU_BUYERS.md).

## 2026-10-12 (audit 2026-10-11 §5 collection, §3 S-2, §7 S6/S7/X4)

### Applied live (each is also a repo migration, idempotent, tested in `supabase/migrations-2026-10-12.test.ts`)

| Live migration name                          | Repo file                                   | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `collection_stats`                           | `20261012000000_collection_stats.sql`       | §5 collection emitters: `track_collection_stats(uid)` (absolute `unique_cards`, `own_leaders`, `own_mythic` / `own_ultra_rare` / `own_super_rare` / `own_full_art` (non-Leader), `own_locations`, `own_foil_unique`, `own_playsets`, `own_<colour>` (non-Leader)) run by two statement-level triggers on `player_cards` (insert, update), once per user per statement; skips keys with nothing to raise. `new_cards` once per card for life (`stat_once 'own:'`, seeded for every card held before the trigger existed). `track_graded_cards` INSERT adds `graded_foil`, `graded_leader`, `graded_distinct` (`stat_once 'gradedcard:'`, seeded). Rows: `d_new_card_1`, `w_new_cards_10` (rotating pool) and 21 collection achievements, targets computed from live non-Leader counts (Ember 43, Tide 54, Root 48, Gale 40, Void 55, Light 37, Shadow 50, Mythic 7, Full-Art 28, Ultra-Rare 5, Super-Rare 12, Locations 55; Leaders 2 / 6). Backfilled for every player. |
| `difficulty_reward_mult`                     | `20261012000001_difficulty_reward_mult.sql` | §3 S-2: `begin_match(p_mode, p_seats, p_difficulty)` records `easy` / `normal` / `hard` on `match_tickets.difficulty`; `record_match_placement` reads it from the ticket only and scales credits (x0.8 / x1 / x1.15, before the taper); XP flat; no difficulty = x1. Old 2-arg `begin_match` renamed `begin_match_legacy_v1` and revoked (no removal needed).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `realtime_topics`                            | `20261012000002_realtime_topics.sql`        | §7 S7: `trades` / `friendships` broadcast `changed` to each party's private `user:<uid>`; `market_listings` → public topic `market`, `player_shops` / `shop_listings` → `shops`, `news_posts` / `serialized_supply` → `news` (payload `{table}` only, one per insert/update statement).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `catalog_version`, `catalog_version_invoker` | `20261012000003_catalog_version.sql`        | §7 S6 option (b): `get_catalog_version()` (count + md5 of every template, SECURITY INVOKER, anon + authenticated).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

Smoke-tested live in rolled-back transactions: a Hard ticket claimed as "deep"
paid the ticket's Standard 6-seat 115; a ticket without difficulty paid 100; a
new card inserted for a player pays `new_cards` 1 and is seeded in `stat_once`;
a `market_listings` update wrote one `market` message.

X4 confirmed intended: `get_showcase_slabs` is anon-callable like the other
public profile RPCs granted to `anon` for guests in B1 (`get_player_profile_card`,
`get_public_profiles`); it returns only slabs the owner pinned. No change.

### Pending

- `20261012000091_after_client_realtime.sql` (SQL editor): (1) row-removal
  triggers on the public topics (gated keyword); (2) after the screens below
  switch, trim the publication to `player_shops`, `shop_listings`,
  `shop_purchases` (still used by PlayerShopsScreen's filtered subscriptions).
- Auth settings (not SQL): leaked-password protection (advisor WARN) and the
  Auth connection strategy (absolute 10 → percentage), Dashboard →
  Authentication.
- S6 option (a) (static `catalog.<hash>.json` on the Pages host) needs a deploy
  step; option (b) is live.

### Client follow-ups (files owned by other screens)

- **Difficulty (App.tsx / PlayScreen.tsx):** pass the chosen bot difficulty as
  the third argument: `beginMatch(setupMode, setupSeats, loadCpuDifficulty())`
  (`'easy' | 'normal' | 'hard'`, `src/meta/matchPrefs.ts`). Without it the
  ticket pays like Normal. The game-over preview should pass the same value as
  the 5th argument of `placementReward(place, seats, mode, hands, difficulty)`.
  The server's `record_match_placement` result also returns `difficulty`.
- **S6 (App.tsx catalog load):** `versionedFetch(CATALOG_CACHE_KEY + ':v', await fetchCatalogVersion(), fetchCardTemplates, CATALOG_TTL_MS)` (`src/lib/cache.ts`,
  `src/lib/supabase.ts`) instead of the 6 h TTL read.
- **S7:** SocialScreen: replace `subscribeTable('friendships' | 'trades')` with
  `onUserTableChange(['friendships', 'trades'], bump)` (rides MetaContext's
  user channel). MarketplaceScreen: `subscribeTopic('market', …)`.
  PlayerShopsScreen browse (`:974-975`): `subscribeTopic('shops', …)`; the
  owner/id-filtered subscriptions can stay. NewsCenterScreen:
  `subscribeTopic('news', …)`. Debounce the refetch. Then apply part 2 of
  `20261012000091`.

---

## 2026-10-11 (audit 2026-10-11 §1 A20/A21/B1/B2/B4, §5, §7)

### Applied live (each is also a repo migration, idempotent)

| Live migration name               | Repo file                                            | What                                                                                                                                                                                                                                                                  |
| --------------------------------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api_grants`                      | `20261011000001_api_grants.sql`                      | X1 `rate_shop_purchase` granted; B1 five public read RPCs granted to `anon`; X2 column SELECT on `market_listings` excludes `cpu_ceiling` / `cpu_next_at`; X3/X5 33 helpers revoked from the API; backup tables closed to API roles                                   |
| `match_tickets_v2`                | `20261011000002_match_tickets_v2.sql`                | A21 ticket records mode/seats; A20/B2 `too_early` retryable (`retry_after`); CPU gate (Creator-only); F-5 rewards; `p_stats` / `p_hands`; `level` emitted from `grant_xp`; X6 `record_match_result` revoked. Old signatures renamed to `*_legacy_v0` (no DROP needed) |
| `missions_rotation_and_catalogue` | `20261011000003_missions_rotation_and_catalogue.sql` | Rotation, BP XP trim, §1 rows + backfill, wins/games 500, poker-key rows, retired twins hidden, level rows re-seeded                                                                                                                                                  |
| `realtime_broadcast_and_cost`     | `20261011000004_realtime_broadcast_and_cost.sql`     | S1 broadcast triggers (insert/update) + `realtime.messages` policy + publication trimmed to 8 tables; S3 `quicksell_many`; B4 `sell_bounty_card`; S4 draw indexes; S9 settle cron skipped when idle; S10 FK indexes + 5 initplan policies                             |

Card data: the live `cards` mechanics columns (keywords, tier, subtype, rules
text, colours) were resynced for 142 rows after the 2026-10-11 card changes
(Leader abilities, REPRINTS, Soulbound/Weapon text). `verify:pool` cannot reach
the host from the sandbox, so parity was checked with the same fields in SQL:
an md5 over every row's id/type/rarity + mechanics columns matches the local
derivation (`274fc208fe5db6547b6ae4be9fe1455c`), and no row's columns disagree
with its template.

Smoke-tested live in rolled-back transactions: `begin_match('standard', 6)`
then an early claim (`too_early`, `retry_after` 720), the same ticket after
13 min claimed as "deep / 2 seats" pays the ticket's Standard 6-seat 100; a
non-Creator gets "CPU matches are not open yet"; `get_missions` deals 7 dailies
and 7 weeklies with no rotating match missions for a non-Creator; a profile
update writes one broadcast on `user:<uid>`.

### Was pending (DROP / DELETE): applied by hand 2026-10-12

`supabase/migrations/20261011000090_pending_destructive.sql` (run it in the SQL
editor or approve the MCP prompts):

1. Remove the renamed legacy RPCs (`begin_match_legacy_v0`,
   `record_match_placement_legacy_v0`) and `record_match_result`.
2. Broadcast on row removal from `player_cards` / `player_inventory` (inserts
   and updates are live; removals are rare: account reset).
3. The sixth initplan policy (`own wishlist delete`).
4. Redundant indexes `player_cards_user_idx`, `shop_slots_owner_idx`.
5. The four backup tables (about 490 kB).
6. Cron jobs that prune `cron.job_run_details` (7 days) and the per-day /
   per-week keyword ledger rows in `stat_once`.
7. `20261008000006_claim_bingo_week_guard.sql` (replaces `claim_bingo(int)`).

**Status 2026-10-12: all of the above is live.** `20261011000090` and
`20261008000006` were run by hand in the SQL editor and verified
(`claim_bingo(int, date)` is the only overload).

### Not doable in SQL

- **Leaked-password protection** (advisor WARN) and the Auth connection
  strategy (absolute 10 → percentage) are Auth settings: Dashboard →
  Authentication → Policies / Settings.
- S11 (fewer schema reloads) is a process change: apply migrations as whole
  files.

### Client follow-ups for other screens

- B6: `refreshPackTypes()` / `refreshShopItems()` exist in `MetaContext`; the
  Store should call them on mount and after a purchase error.
- B5 (Bounties): the Store's bounty tab needs the same UTC-reset reload the
  Achievements screen now has.
- S6 and S7: server side done 2026-10-12 (see the top section); the screen
  and App.tsx call sites are still to change.
- The engine still has to fill `MatchStats` and `hands` (see
  `recordMatchPlacement` in `src/lib/supabase.ts`).

---

# Backend changes: live status (2026-10-09)

The audit's backend fixes (docs/AUDIT-2026-10-08.md, §1.1 B1–B7 and §1.3 M11) are
written as migrations `20261008000001`–`07`. Everything in them is idempotent, so
a fresh database gets the full set. The **live** project (`dnngihsbqxccqvvedvjc`)
was brought up in pieces; this file records which pieces are in.

## Why some pieces are not live

The Supabase MCP tool asks for a confirmation before running any statement that
contains `DROP` or `DELETE`. With nobody there to approve it, those calls time out
after 60 s and roll back, so nothing partial is left behind. A function body that
contains `DELETE FROM …` counts. Everything below that is "not applied" fails for
this reason only; none of it failed on its own logic.

## Applied live

| Audit item                                                                               | Live migration (name)                  |
| ---------------------------------------------------------------------------------------- | -------------------------------------- |
| Season 1 extended to 2026-11-10                                                          | (direct update, file `20261008000000`) |
| B1 `prune_match_tickets` + daily schedule                                                | `catch_up_drift_1_prune_match_tickets` |
| B1 grading `search_path`, `rarity_is_known` / `rarity_is_deliverable`                    | `catch_up_drift_2a_…`                  |
| B1 set-aware Leader draw; `grant_pack_contents` honours `allowed_sets` for Leaders       | `catch_up_drift_2b_…`, `2c_…`          |
| B1 `random_card_of_rarity` no longer draws outside the pinned sets (raises instead)      | `catch_up_drift_2d_…`                  |
| B1 `create_mystery_template` validation                                                  | `catch_up_drift_2f_…`                  |
| B4 daily match-reward taper (full for 15 wins and 15 losses per 24 h, then 25%; cap 100) | `match_reward_taper`                   |
| B3 stat farming (`stat_once`, listing / deck / bid counting)                             | `stat_tracking_anti_farm`              |
| B6 Shop Floor prices off raw quicksell; trade offers capped at the listing's rarity      | `shop_customer_reference`              |
| M11 achievements / missions: unique titles, retired duplicates, reward inversions        | `clean_achievements_and_missions`      |

Smoke-tested live (in a rolled-back transaction): Booster opens 8 cards, Box 49;
a pack pinned to an empty set now raises instead of paying out another set.

## Not live (needs `DROP` / `DELETE` approval) — status 2026-10-11

Items 1–3 below turned out to be live in effect (audit 2026-10-11 §3); item 4
(`claim_bingo` week guard) went live by hand on 2026-10-12. Kept for history.

1. **`reset_account()`**, plus `begin_match()` (H-2, one open ticket per account).
   The function does not exist live, so **Settings → Reset Account errors today**.
   The new version also refuses while the caller holds the high bid on an active
   auction (B2 escrow exploit). Both are in `20261008000001_catch_up_drift.sql`
   (sections 4 and 5). `profiles.last_account_reset_at` already exists live.
2. **B5 / B7 server side** (`20261008000004`): move the CPU bidders' hidden
   `cpu_ceiling` / `cpu_next_at` into a private side table, and revoke
   `settle_expired_listings()` from players. Until then the columns still exist
   and are still readable by direct table queries. The client already stops
   selecting them and no longer calls the settle RPC (the 5-minute cron does it).
3. **Old overloads** `random_card_of_rarity(text)` and `random_leader_of_rarity(text)`
   are still present (revoked from players). Dropping them is in
   `20261008000001`; harmless to leave.
4. **`claim_bingo` week guard** (`20261008000006`, needs `DROP FUNCTION`). Not
   required: the bingo panel re-checks the card's week client-side before claiming.
   Do not call `claim_bingo` with `p_week_start` from the client until it is applied.

To finish: approve the confirmation prompts for the four items above (or apply
the files with the Supabase CLI / SQL editor, which has no such gate). Apply
`20261008000001` sections 4–5 before `04`.

## Note on the migration files

`20261008000001` as committed is the intended end state (including the drops). On
live it was applied as the smaller pieces in the table, because the drop-bearing
calls could not be confirmed. Re-running the whole file on live is safe.

## 2026-10-09: FryCards Poker

The MTG-style game was retired in favour of FryCards Poker (pot-limit Hold'em
freezeout, 2–6 seats; see `docs/RULEBOOK.md`). The client ships ahead of the
backend; these are the server-side gaps it works around today.

1. **Placement rewards — applied live 2026-10-09** (live migration
   `poker_placement_rewards`). `supabase/migrations/20261009000000_poker_placement_rewards.sql`
   is additive:
   - RPC `record_match_placement(p_match_id, p_place, p_seats, p_mode)` pays by
     finishing place instead of a win flag;
   - `match_tickets` gains `place`, `seats` and `mode` columns;
   - helper `poker_place_factor(p_place, p_seats)` holds the place-factor table.

   Minimum match length is the mode floor (quick 6 / standard 12 / deep 20 min)
   × seats / 6, never under 45 s. Verified live after applying: a six-seat
   Standard table pays 100 / 76 / 61 / 49 / 43 / 40, `anon` cannot call the RPC,
   `authenticated` can, and the old `record_match_result(boolean, uuid)` is still
   in place for clients that predate the swap. The client
   (`recordMatchPlacement` in `src/lib/supabase.ts`) still falls back to
   `record_match_result` (`won` = 1st place) if the RPC is ever missing.

2. **Deck functions on poker rules — applied live 2026-10-10** (live migration
   `poker_deck_rules`, file `20261010000000_poker_deck_rules.sql`, tested in
   `supabase/migrations-2026-10-10.test.ts` against the real card pool):
   - `poker_deck_modes(leader, card_ids)` is the server mirror of
     `checkDeck` / `legalModes`; it agrees with the client on built decks and
     on every kind of broken one.
   - `save_deck` grades `is_valid` with it (legal in some mode) instead of the
     60-card rule, and caps copies at 3 (the Deep limit) instead of the
     per-rarity cap that refused two copies of a Mythic.
   - `claim_deck_box` keeps the 60-card grant and its rarity mix, with 2
     Locations instead of 12 and at most 2 copies of a card, and saves a legal
     Standard deck built from the grant (`poker_box_deck`: the CPU builder's
     curve and revive share). The client no longer rebuilds it. Ruin-Walker
     Overseer (no on-colour Super-Rare) could not be claimed before; the
     Super-Rare slots now fall back to Rares.
   - `pick_deck_bucket`'s "cheap first" reads the tier (`might` ≤ 2), not the
     retired essence cost.
   - `apply_card_upsert` (Creator imports, approved submissions) accepted only
     MTG-era mechanics (essence cost required; grit required on Units), so it
     refused every card `mechanicsFromDef` produces. It now requires a tier
     (1–5, in `might`) on powers and rules text on every card.
     Verified live: each Deck Box Leader's grant builds a 25-card deck that
     `poker_deck_modes` grades legal in Standard.
3. **Retired helpers — applied live 2026-10-10** (`20261011000000_retire_old_rule_helpers.sql`):
   `apply_card_upsert` always stores the retired `essence_cost` / `grit` /
   `resolve` as null, and the unused MTG-era helpers `deck_card_cost(jsonb)`
   and `rarity_copy_cap(text)` are dropped (the drop was confirmed by hand).
   No server function applies the 60-card rules any more.
4. **Bloom revive share — applied live 2026-10-10** (`20261010000001_bloom_revive.sql`):
   `poker_box_deck` counts Bloom as a revive, like the client builder.
5. **`cards` table mechanics columns.** These are written by
   `scripts/sync-cards-db.ts` through `mechanicsFromDef` (`src/meta/submissions.ts`):
   `might` = tier, `keywords` = poker keywords, and `essence_types` = colours
   (unchanged); `essence_cost`, `grit` and `resolve` are retired (null).
   **Resynced live 2026-10-09/10**: all 297 rows were rewritten (mechanics
   columns only — names, art, templates untouched) from the same derivation
   the client uses. Verified by an md5 fingerprint over every row's
   keywords / tier / subtype / rules text / colours matching the local
   derivation exactly; no card changed colour. The previous MTG-era values are
   kept in `public.cards_mechanics_backup_20261009` (RLS on, no player access)
   should a rollback ever be needed.
   **Resynced again 2026-10-10** for Bloom, Erode and the Leader / number
   changes (v35.2): 69 rows changed, mechanics columns only. All 297 rows
   verified against the local derivation by one combined md5
   (`95a93fa5d07925aa11616d7b59d24b73`). The values from before this resync
   are in `public.cards_mechanics_backup_20261010` (RLS on). `pick_deck_bucket` now orders "cheap
   first" by tier (see 2.).
6. **`submit_card` has no star-hint parameter.** The Creator sets a submitted
   card's tier at review.

### `cards` mechanics resync — applied live 2026-10-11 (pool reprint, audit C-1/C-2/F-7)

The generated pool was reprinted (keyword weights, `MIN_TIER.Snuff` 2,
`RARITY_BIAS` 0.04, two Snuff reprints). 72 of 297 rows changed and were
rewritten with plain `UPDATE … FROM (VALUES …)` statements on `keywords`,
`might`, `card_subtype` and `rules_text` only (no colour changed; names, art,
templates untouched; no DROP/DELETE, no backup table this time). Live had no
Creator `overrides`. Verified by the same md5 fingerprint over every row's
id | keywords | tier | subtype | rules text | colours: before
`5a65f5759d533d37f8d1a03be9ef0943` (matched the pre-reprint derivation),
after `81cd6c6644c4079059073abe7e480932`, equal to the local derivation.
Rollback = rerun the old derivation (git `3ef8a06`) through
`scripts/sync-cards-db.ts`.
