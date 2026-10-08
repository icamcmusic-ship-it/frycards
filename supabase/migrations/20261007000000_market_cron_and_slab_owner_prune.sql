-- 2026-10-07 audit follow-ups (AUDIT-2026-10-06 §1.2.5, §1.4.6).

-- §1.2.5: CPU bidders and expired-listing settlement used to run only when a
-- client opened the Marketplace. Run them every 5 minutes instead.
create extension if not exists pg_cron;
select cron.schedule('settle-market-and-cpu-bidders', '*/5 * * * *',
  $$select public.settle_expired_listings()$$);

-- §1.4.6: a slab that changes owner leaves the old owner's showcase too, not
-- only one that is deleted.
create or replace trigger graded_cards_prune_showcase_owner after update of user_id on public.graded_cards
  for each row when (old.user_id is distinct from new.user_id)
  execute function public.prune_showcase_slab();
