-- PENDING (not applied live): contains DELETE. Safe any time after
-- 20261013000100_cpu_buyer_personas.sql.
--
-- 20261013000100 rewrote run_cpu_bidders (personas + bid styles) without the
-- trailing cleanup of market_listing_cpu rows for finished listings, so the
-- live body has no DELETE. Rows for ended listings are inert (the loop only
-- visits active auctions); this sweeps them. Schedule it next to the bidder
-- cron, or call it once by hand.
create or replace function public.prune_market_listing_cpu()
returns integer language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  delete from market_listing_cpu c
   using market_listings m
   where m.id = c.listing_id and m.status <> 'active';
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.prune_market_listing_cpu() from public, anon, authenticated;
select public.prune_market_listing_cpu();
