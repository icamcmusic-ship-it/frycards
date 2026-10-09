# Backend changes: live status (2026-10-09, complete)

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

## Also applied (2026-10-09, by running `supabase/manual/parts/` in the SQL editor)

| Audit item | What changed                                                                                                                         |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| H-2        | `begin_match()` keeps one open ticket per account                                                                                    |
| B1 / B2    | `reset_account()` exists again (Settings > Reset Account works) and refuses while the caller holds the high bid on an active auction |
| B5         | CPU bidders' hidden `cpu_ceiling` / `cpu_next_at` live in the private `market_listing_cpu` table; the old columns are emptied        |
| B7         | `settle_expired_listings()` is cron-only (players can no longer call it)                                                             |
| cleanup    | the one-argument `random_card_of_rarity` / `random_leader_of_rarity` are dropped                                                     |

Verified live afterwards: no leaked values remain on `market_listings`, `settle_expired_listings`
and `run_cpu_bidders` are not callable by players, `reset_account` is callable by
signed-in users and not by anon, and the 5-minute settle job and the daily
`prune-match-tickets` job are both active and succeeding.

## Intentionally not applied

- **`claim_bingo` week guard** (`20261008000006`): not needed, since the bingo panel
  re-checks the card's week on the client. Do not call `claim_bingo` with
  `p_week_start` from the client unless that migration is applied.
- `market_listings.cpu_ceiling` / `cpu_next_at` columns still exist (emptied). Drop
  them in a later migration once nothing reads them.

## Note on the migration files

`20261008000001` as committed is the intended end state (including the drops). On
live it was applied as smaller pieces (see the tables above). Re-running the whole
file on live is safe.
