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

## Not live (needs `DROP` / `DELETE` approval)

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

2. **`save_deck`'s `is_valid` still grades the retired 60-card rule.** The client
   works out poker legality itself (`checkDeck` / `legalModes` in
   `src/game/poker/deck.ts`) and ignores `is_valid`. A follow-up migration could
   drop the 60-card check, or replace it with a poker check.
3. **`claim_deck_box` still builds and saves a 60-card list (12 Locations).** Right
   after the claim, the client rebuilds the saved deck as a legal Standard poker
   deck from the cards the box granted (`convertRetiredList` in
   `src/meta/deckEdits.ts`, called from `StoreScreen`). Moving that rebuild to the
   server needs the poker tiers, which are currently derived on the client.
4. **`cards` table mechanics columns.** These are written by
   `scripts/sync-cards-db.ts` through `mechanicsFromDef` (`src/meta/submissions.ts`):
   `might` = tier, `keywords` = poker keywords, and `essence_types` = colours
   (unchanged); `essence_cost`, `grit` and `resolve` are retired (null).
   **Resynced live 2026-10-09/10**: all 297 rows were rewritten (mechanics
   columns only — names, art, templates untouched) from the same derivation
   the client uses. Verified by an md5 fingerprint over every row's
   keywords / tier / subtype / rules text / colours matching the local
   derivation exactly; no card changed colour. The previous MTG-era values are
   kept in `public.cards_mechanics_backup_20261009` (RLS on, no player access)
   should a rollback ever be needed. `pick_deck_bucket` still reads
   `essence_cost` for its "cheap first" ordering; `deck_card_cost(null)` is 0,
   so every card now counts as cheap there (harmless: the client rebuilds the
   Deck Box deck).
5. **`submit_card` has no star-hint parameter.** The Creator sets a submitted
   card's tier at review.
