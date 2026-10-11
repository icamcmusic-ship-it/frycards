-- 2026-10-11 audit §7 X1–X5 and §1 B1: who may call what.
-- Idempotent (grants and revokes only).

-- X1: the client rates shop purchases (src/lib/supabase.ts rateShopPurchase),
-- but `authenticated` could not execute the RPC.
do $$
begin
  if to_regprocedure('public.rate_shop_purchase(uuid, integer)') is not null then
    grant execute on function public.rate_shop_purchase(uuid, integer) to authenticated;
  end if;
end $$;

-- B1: read-only public RPCs that guest screens call (Social leaderboard, News
-- feed, Card Submissions stats, and the profile cards the leaderboard opens).
-- Each already serves any signed-in account and reads only public fields.
grant execute on function public.get_cards_leaderboard(integer) to anon;
grant execute on function public.get_serialized_feed(integer) to anon;
grant execute on function public.get_showcase_stats(text) to anon;
grant execute on function public.get_player_profile_card(uuid) to anon;
grant execute on function public.get_public_profiles(uuid[]) to anon;

-- X2: the CPU bidders' hidden ceiling and timer stay unreadable. They now live
-- in market_listing_cpu; the old columns remain on market_listings, so column
-- SELECT is limited to everything else (cpu_leading / cpu_bidder_name are
-- shown in the Marketplace and stay readable).
revoke select on public.market_listings from anon, authenticated;
grant select (id, seller, card_id, foil, quantity, listing_type, price, buyout, current_bid,
  current_bidder, bid_count, status, created_at, ends_at, cpu_leading, cpu_bidder_name)
  on public.market_listings to anon, authenticated;
-- Direct writes were already blocked by RLS (no write policies); remove the grants too.
revoke insert, update, truncate, references, trigger on public.market_listings from anon, authenticated;

-- X3 / X5: helpers and trigger functions the client never calls (the client's
-- RPC list is the set of supabase.rpc() names in src/). Server functions that
-- use them are SECURITY DEFINER, and the cron jobs run as the owner.
do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in (
         'prune_showcase_on_divest', 'assert_creator', 'bingo_lines', 'bingo_week_start',
         'card_sell_price', 'grading_base_fee', 'grading_bulk_mult', 'grading_grade_mult',
         'grading_roll', 'grading_service_premium', 'grading_speed_mult', 'grading_turnaround',
         'grading_voucher_fee', 'level_for_xp', 'level_reward_credits',
         'market_listing_cpu_lead_guard', 'mission_period_start', 'normalize_currency',
         'pick_deck_bucket', 'rarity_tier', 'roll_weighted_rarity', 'shop_base_slots',
         'shop_maintenance_fee_per_slot', 'shop_max_slots', 'shop_min_pool_size',
         'shop_report_threshold', 'shop_setup_fee', 'shop_slot_cost', 'shop_unlock_level',
         'xp_for_level', 'poker_deck_modes', 'poker_place_factor', 'shop_listing_cpu_reference')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f);
  end loop;
end $$;

-- S10: the backup tables are kept for now but closed to the API roles.
do $$
declare t text;
begin
  foreach t in array array['cards_art_backup_20261006', 'pack_types_art_backup_20261006',
                           'cards_mechanics_backup_20261009', 'cards_mechanics_backup_20261010'] loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke all on public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;
