-- Audit 2026-09-29, section 7: keep the database small.
--
-- NOT YET APPLIED (the live project was unreachable when this was written).
--
-- match_tickets gets one row per match started and nothing ever deletes them.
-- The only readers look at the last hour (begin_match's mint ceiling) and the
-- last 24 hours (record_match_result's daily payout cap), and a ticket is
-- unredeemable after 6 hours, so anything older than a week is dead weight
-- that grows with every match played. Pruning at 7 days leaves a wide margin
-- over every window the code reads.
create or replace function public.prune_match_tickets()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_deleted integer;
begin
  delete from match_tickets where started_at < now() - interval '7 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

-- Internal maintenance only: not callable through the API.
revoke all on function public.prune_match_tickets() from public, anon, authenticated;

-- Run it daily when pg_cron is available (Supabase: Database > Extensions). If
-- it is not enabled this block does nothing; call the function by hand or
-- enable the extension and re-run just the schedule below.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'prune-match-tickets';
    perform cron.schedule('prune-match-tickets', '17 4 * * *', 'select public.prune_match_tickets()');
  end if;
end
$$;
