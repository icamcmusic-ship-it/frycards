-- 2026-10-07: stat tracking for the systems missions/achievements could not
-- see (grading, slabs, decks, auction bids, listings), plus missions and
-- achievements built on them and on the Shop Floor / CPU-bidder stats
-- (AUDIT-2026-10-06 §5, §6 quick wins 1-2).
--
-- Tracking is done with AFTER triggers rather than by editing each RPC: the
-- RPCs (submit_grading, reveal_graded_cards, save_deck, place_bid,
-- create_listing) are large, live-only, and would each need a full
-- re-definition to add one line. A trigger sees every path that writes the
-- row, including ones added later.

create or replace function public.track_graded_cards()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    perform track_stat(new.user_id, 'cards_graded', 1, false);
  elsif tg_op = 'UPDATE' and old.grade is null and new.grade is not null then
    if new.grade >= 9 then perform track_stat(new.user_id, 'slabs_mint', 1, false); end if;
    if new.grade >= 10 then perform track_stat(new.user_id, 'gem_mints', 1, false); end if;
  end if;
  return null;
end;
$$;
create or replace trigger graded_cards_track after insert or update of grade on public.graded_cards
  for each row execute function public.track_graded_cards();

create or replace function public.track_decks()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform track_stat(new.user_id, 'decks_built', 1, false);
  return null;
end;
$$;
create or replace trigger decks_track after insert on public.decks
  for each row execute function public.track_decks();

create or replace function public.track_market_listings()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if tg_op = 'INSERT' then
    perform track_stat(new.seller, 'listings_created', 1, false);
  elsif new.current_bidder is not null
        and new.bid_count > old.bid_count
        and new.current_bidder is distinct from old.current_bidder then
    -- a human bid (a CPU bid leaves current_bidder null)
    perform track_stat(new.current_bidder, 'bids_placed', 1, false);
  end if;
  return null;
end;
$$;
create or replace trigger market_listings_track after insert or update of bid_count on public.market_listings
  for each row execute function public.track_market_listings();

create or replace function public.track_shop_purchases()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  perform track_stat(new.owner, 'shop_sales', 1, false);
  return null;
end;
$$;
create or replace trigger shop_purchases_track after insert on public.shop_purchases
  for each row execute function public.track_shop_purchases();

revoke execute on function public.track_graded_cards() from public, anon, authenticated;
revoke execute on function public.track_decks() from public, anon, authenticated;
revoke execute on function public.track_market_listings() from public, anon, authenticated;
revoke execute on function public.track_shop_purchases() from public, anon, authenticated;

-- Missions ------------------------------------------------------------------
-- Rewards sit in the same band as the existing rows (daily 50-150cr,
-- weekly 250-800cr). Nothing here can be completed by a loop that mints
-- credits: each stat costs credits or cards to advance.
insert into missions (id, name, description, stat_key, target, reward_credits, reward_vouchers, reward_bp_xp, cadence) values
  ('d_grade_1',   'Send It Off',        'Submit a card for grading today',           'cards_graded',      1,  60, 0, 30,  'daily'),
  ('d_bid_1',     'Paddle Up',          'Place a bid on an auction today',           'bids_placed',       1,  50, 0, 25,  'daily'),
  ('d_list_1',    'Open the Stall',     'List a card on the Marketplace today',      'listings_created',  1,  50, 0, 25,  'daily'),
  ('d_floor_1',   'Customer Service',   'Make a sale or trade on your Shop Floor',   'shop_cpu_sales',    1,  75, 0, 30,  'daily'),
  ('w_grade_5',   'Grading Run',        'Submit 5 cards for grading this week',      'cards_graded',      5, 400, 0, 150, 'weekly'),
  ('w_mint_1',    'Mint Condition',     'Pull a 9 or better from the graders',       'slabs_mint',        1, 500, 2, 150, 'weekly'),
  ('w_floor_5',   'Shopkeeper',         'Close 5 Shop Floor sales this week',        'shop_cpu_sales',    5, 500, 0, 200, 'weekly'),
  ('w_bids_10',   'Auction Regular',    'Place 10 bids this week',                   'bids_placed',      10, 300, 0, 150, 'weekly'),
  ('w_deck_1',    'Brewer',             'Build a new deck this week',                'decks_built',       1, 250, 0, 100, 'weekly'),
  ('w_cpuauc_3',  'Sold to the Collector', 'Have a CPU collector win 3 of your auctions', 'cpu_auction_sales', 3, 300, 0, 150, 'weekly')
on conflict (id) do nothing;

-- Achievements --------------------------------------------------------------
insert into achievements (id, name, description, category, stat_key, target, reward_credits, reward_vouchers, sort) values
  ('graded_1',      'Into the Case',      'Submit your first card for grading',  'collection', 'cards_graded',       1,  100,  0, 400),
  ('graded_25',     'Regular at the Lab', 'Submit 25 cards for grading',         'collection', 'cards_graded',      25,  750,  5, 401),
  ('graded_100',    'Grading Mogul',      'Submit 100 cards for grading',        'collection', 'cards_graded',     100, 2000, 15, 402),
  ('mint_1',        'Mint!',              'Get a slab graded 9 or better',       'collection', 'slabs_mint',         1,  250,  2, 403),
  ('mint_10',       'Mint Collector',     'Get 10 slabs graded 9 or better',     'collection', 'slabs_mint',        10, 1500, 10, 404),
  ('gem_1',         'Gem Mint',           'Get a perfect 10',                    'collection', 'gem_mints',          1, 1000, 10, 405),
  ('gem_5',         'Jeweller',           'Get five perfect 10s',                'collection', 'gem_mints',          5, 3000, 25, 406),
  ('decks_1',       'Deckwright',         'Build your first deck',               'progress', 'decks_built',        1,  100,  0, 410),
  ('decks_10',      'Brewmaster',         'Build 10 decks',                      'progress', 'decks_built',       10,  600,  5, 411),
  ('bids_1',        'First Paddle',       'Place your first auction bid',        'market', 'bids_placed',        1,  100,  0, 420),
  ('bids_50',       'Auction House',      'Place 50 auction bids',               'market', 'bids_placed',       50, 1000,  5, 421),
  ('listings_25',   'Stallholder',        'Create 25 Marketplace listings',      'market', 'listings_created',  25,  600,  5, 422),
  ('cpu_auction_1', 'Sold to a Collector','A CPU collector wins one of your auctions', 'market', 'cpu_auction_sales', 1, 150, 0, 423),
  ('cpu_auction_25','Collector''s Dealer','CPU collectors win 25 of your auctions', 'market', 'cpu_auction_sales', 25, 1200, 10, 424),
  ('floor_1',       'Open Sign',          'Make your first Shop Floor sale',     'market', 'shop_cpu_sales',     1,  150,  0, 430),
  ('floor_50',      'Shopkeeper',         'Make 50 Shop Floor sales',            'market', 'shop_cpu_sales',    50, 2000, 15, 431),
  ('floor_trade_1', 'Swap Meet',          'Accept a trade from a Shop Floor customer', 'market', 'shop_cpu_trades', 1, 150,  0, 432),
  ('floor_trade_25','Binder Broker',      'Accept 25 Shop Floor trades',         'market', 'shop_cpu_trades',   25, 1200, 10, 433),
  ('shop_sales_10', 'Storefront',         'Sell 10 listings to other players from your shop', 'market', 'shop_sales', 10, 800, 5, 434)
on conflict (id) do nothing;
