-- 2026-10-11 audit: the destructive half of 20261011000001–04.
--
-- NOT APPLIED LIVE YET. The Supabase MCP tool asks a person to confirm any
-- statement containing DROP or DELETE, so these wait for that approval (or the
-- Supabase CLI / SQL editor). Everything here is cleanup or a small
-- improvement; nothing in the earlier files depends on it.
-- See docs/BACKEND_PENDING.md, "2026-10-11".
--
-- Idempotent.

-- 1. Renamed-out legacy RPCs (20261011000002 moved them out of the API).
drop function if exists public.begin_match_legacy_v0();
drop function if exists public.record_match_placement_legacy_v0(uuid, integer, integer, text);
drop function if exists public.record_match_result(boolean, uuid);

-- 2. Broadcast on row removal too (S1). Inserts and updates are live.
do $$
declare t text;
begin
  foreach t in array array['player_cards', 'player_inventory'] loop
    if not exists (select 1 from pg_trigger where tgname = t || '_notify_del') then
      execute format('create trigger %I after delete on public.%I referencing old table as changed_rows '
                     'for each statement execute function public.notify_user_change(%L)',
                     t || '_notify_del', t, 'user_id');
    end if;
  end loop;
end $$;

-- 3. The sixth initplan policy (S10).
do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'player_wishlist'
               and policyname = 'own wishlist delete') then
    alter policy "own wishlist delete" on public.player_wishlist to authenticated
      using (user_id = (select auth.uid()));
  end if;
end $$;

-- 4. Redundant indexes (S10): both duplicate the leading column of a unique index.
drop index if exists public.player_cards_user_idx;
drop index if exists public.shop_slots_owner_idx;

-- 5. Backup tables from the art / mechanics resyncs (S10, ~490 kB). The live
--    catalog was re-verified against the repo on 2026-10-11 (md5 parity).
drop table if exists public.cards_art_backup_20261006;
drop table if exists public.pack_types_art_backup_20261006;
drop table if exists public.cards_mechanics_backup_20261009;
drop table if exists public.cards_mechanics_backup_20261010;

-- 6. Cron hygiene (S9): keep 7 days of job history; prune the per-day and
--    per-week keyword ledgers that track_match_stats writes.
do $$
begin
  if to_regclass('cron.job') is not null then
    if not exists (select 1 from cron.job where jobname = 'prune-cron-history') then
      perform cron.schedule('prune-cron-history', '23 3 * * *',
        $cmd$delete from cron.job_run_details where end_time < now() - interval '7 days'$cmd$);
    end if;
    if not exists (select 1 from cron.job where jobname = 'prune-stat-once-periods') then
      perform cron.schedule('prune-stat-once-periods', '29 3 * * *',
        $cmd$delete from public.stat_once
              where (key like 'kwday:%' and created_at < now() - interval '2 days')
                 or (key like 'kwwk:%' and created_at < now() - interval '9 days')$cmd$);
    end if;
  end if;
end $$;

-- 7. The bingo week guard: apply 20261008000006_claim_bingo_week_guard.sql
--    (it replaces claim_bingo(int) with claim_bingo(int, date)).

-- 8. Optional (X2 follow-up): once nothing reads them, remove the hidden CPU
--    bidder columns outright. Column SELECT is already revoked
--    (20261011000001), and run_cpu_bidders reads market_listing_cpu.
-- alter table public.market_listings drop column if exists cpu_ceiling,
--   drop column if exists cpu_next_at;
