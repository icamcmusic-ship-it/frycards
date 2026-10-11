-- PENDING (not applied live). Apply by hand in the SQL editor:
--   part 1 any time (it is gated only because it contains the removal keyword);
--   part 2 only AFTER SocialScreen, PlayerShopsScreen, NewsCenterScreen and
--   MarketplaceScreen have moved off postgres_changes onto the broadcast
--   topics from 20261012000002 (audit 2026-10-11 §7 S7).

-- 1. Row removals also broadcast on the public topics.
do $$
declare t record;
begin
  for t in select * from (values
      ('market_listings', 'market'), ('player_shops', 'shops'), ('shop_listings', 'shops'),
      ('news_posts', 'news'), ('serialized_supply', 'news')) v(tbl, topic)
  loop
    if to_regclass('public.' || t.tbl) is null then continue; end if;
    if not exists (select 1 from pg_trigger where tgname = t.tbl || '_notify_topic_del'
                     and tgrelid = ('public.' || t.tbl)::regclass) then
      execute format('create trigger %I after delete on public.%I '
                     'for each statement execute function public.notify_topic_change(%L)',
                     t.tbl || '_notify_topic_del', t.tbl, t.topic);
    end if;
  end loop;
end $$;

-- 2. Trim the publication: friendships, trades, market_listings, news_posts and
--    serialized_supply leave. player_shops, shop_listings and shop_purchases
--    stay for PlayerShopsScreen's owner-/id-filtered subscriptions.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime set table
      public.player_shops, public.shop_listings, public.shop_purchases;
  end if;
end $$;
