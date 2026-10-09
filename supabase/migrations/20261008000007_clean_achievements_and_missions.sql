-- 2026-10-08, audit M11: one cleanup of the achievement and mission catalogues,
-- and the first migration to hold the WHOLE catalogue. Most rows were seeded
-- live (20260712, 20260715, and by hand since) and only ten missions and
-- nineteen achievements were ever in a repo migration; the full live set is
-- written out below, with this cleanup applied, so the repo matches live.
--
-- Non-destructive. No row is deleted and no `target` or `stat_key` changes, so
-- every player_achievements / player_missions row keeps its progress and its
-- claimed flag. The schema has no "hidden" flag, so a duplicate is RETIRED
-- instead: retitled "(Retired)", reward set to 0 and sunk to the bottom of the
-- list. The retired row is always the lower-paying twin; whoever already
-- claimed it keeps what they were paid, and its remaining holders can still
-- claim the kept twin.
--
--   duplicate payout (same stat, same target)     kept            retired (reward -> 0)
--   wins >= 100                                   wins_100        win_100
--   unique_cards >= 150                           collection_150  collector_150
--
--   reward inversions                             was                  now
--   d_win_1 (1 win) / d_win_2 (2 wins)            150cr / 100cr        100cr / 200cr
--   w_games_10 / w_play_15 (10 / 15 games)        800cr / 300cr+5v     500cr / 800cr+5v
--   packs_25 / packs_50 (per-pack payout)         1249 / 1500          1000 / 2000
--
--   titles made unique (achievements and missions share one namespace)
--   wins_250 Warlord -> Conqueror        logins_7 Regular -> Familiar Face
--   bingo_25 Card Shark -> Bingo Baron   collection_150 Archivist -> Grand Archivist
--   d_win_1 First Blood -> Daily Victory w_play_15 Grinder -> Weekly Grind
--   w_floor_5 Shopkeeper -> Floor Manager  w_market_1 Open for Business -> Market Day
--   w_sell_5 Liquidator -> Garage Sale
--
-- Descriptions for decks, bids and listings now say what 20261008000003
-- actually counts.
--
-- Idempotent: an upsert by id. reward_pack_id is not listed, so it is left as
-- it is.

insert into public.achievements (id, name, description, category, stat_key, target, reward_credits, reward_vouchers, sort) values
  ('first_win', 'First Blood', 'Win your first match.', 'battle', 'wins', 1, 100, 0, 1),
  ('win_10', 'Battle Tested', 'Win 10 matches.', 'battle', 'wins', 10, 250, 0, 2),
  ('win_50', 'Warlord', 'Win 50 matches.', 'battle', 'wins', 50, 750, 10, 3),
  ('wins_100', 'Centurion', 'Win 100 matches', 'battle', 'wins', 100, 5000, 15, 4),
  ('games_25', 'Regular', 'Play 25 matches.', 'battle', 'games_played', 25, 300, 0, 5),
  ('games_100', 'Veteran', 'Play 100 matches.', 'battle', 'games_played', 100, 1000, 10, 6),
  ('packs_5', 'Fresh Cardboard', 'Open 5 packs.', 'collection', 'packs_opened', 5, 200, 0, 10),
  ('packs_25', 'Pack Addict', 'Open 25 packs.', 'collection', 'packs_opened', 25, 1000, 0, 11),
  ('packs_100', 'Rip Master', 'Open 100 packs.', 'collection', 'packs_opened', 100, 3499, 0, 12),
  ('collector_25', 'Curator', 'Own 25 different cards.', 'collection', 'unique_cards', 25, 250, 0, 13),
  ('collector_75', 'Archivist', 'Own 75 different cards.', 'collection', 'unique_cards', 75, 750, 0, 14),
  ('collection_150', 'Grand Archivist', 'Own 150 unique cards', 'collection', 'unique_cards', 150, 4000, 10, 15),
  ('collection_200', 'Completionist', 'Own 200 unique cards', 'collection', 'unique_cards', 200, 8000, 25, 16),
  ('level_5', 'Rising Star', 'Reach level 5.', 'progress', 'level', 5, 200, 0, 20),
  ('level_10', 'Seasoned Operative', 'Reach level 10.', 'progress', 'level', 10, 500, 10, 21),
  ('level_25', 'Fry Elite', 'Reach level 25.', 'progress', 'level', 25, 2500, 50, 22),
  ('friend_1', 'Not Alone', 'Add your first friend.', 'social', 'friends', 1, 100, 0, 30),
  ('packs_50', 'Rip City', 'Open 50 packs', 'collection', 'packs_opened', 50, 2000, 0, 30),
  ('friend_5', 'Squad Up', 'Have 5 friends.', 'social', 'friends', 5, 500, 0, 31),
  ('packs_250', 'Sealed Legend', 'Open 250 packs', 'collection', 'packs_opened', 250, 8000, 25, 32),
  ('trade_1', 'Fair Exchange', 'Complete your first trade.', 'social', 'trades', 1, 250, 0, 32),
  ('serialized_1', 'One of a Kind', 'Pull a Serialized card', 'collection', 'serialized_pulls', 1, 5000, 25, 33),
  ('market_sale_1', 'Open for Business', 'Sell a card on the marketplace.', 'market', 'market_sales', 1, 250, 0, 40),
  ('market_buy_1', 'Smart Shopper', 'Buy a card from the marketplace.', 'market', 'market_buys', 1, 100, 0, 41),
  ('cosmetics_3', 'Dressed to Impress', 'Buy 3 cosmetics from the store.', 'collection', 'cosmetics_bought', 3, 300, 0, 42),
  ('seller_10', 'Card Shark', 'Quicksell 10 cards.', 'market', 'cards_sold', 10, 200, 0, 43),
  ('logins_7', 'Familiar Face', 'Claim 7 daily login rewards', 'progress', 'logins', 7, 500, 0, 60),
  ('logins_30', 'Local Fixture', 'Claim 30 daily login rewards', 'progress', 'logins', 30, 2000, 5, 61),
  ('logins_100', 'Part of the Furniture', 'Claim 100 daily login rewards', 'progress', 'logins', 100, 6000, 20, 62),
  ('streak_7', 'Full Week', 'Reach a 7-day login streak', 'progress', 'login_streak', 7, 1000, 0, 63),
  ('streak_30', 'Iron Habit', 'Reach a 30-day login streak', 'progress', 'login_streak', 30, 5000, 15, 64),
  ('sold_100', 'Liquidator', 'Quicksell 100 cards', 'economy', 'cards_sold', 100, 1000, 0, 70),
  ('sold_500', 'Bulk Mover', 'Quicksell 500 cards', 'economy', 'cards_sold', 500, 4000, 10, 71),
  ('trades_25', 'Handshake Deals', 'Complete 25 trades', 'social', 'trades', 25, 2500, 5, 72),
  ('market_sales_25', 'Storefront Star', 'Sell 25 cards on the Marketplace', 'economy', 'market_sales', 25, 2500, 5, 73),
  ('market_buys_25', 'Bargain Hunter', 'Buy 25 cards on the Marketplace', 'economy', 'market_buys', 25, 2500, 5, 74),
  ('friends_10', 'Squad Assembled', 'Make 10 friends', 'social', 'friends', 10, 1500, 0, 75),
  ('wins_250', 'Conqueror', 'Win 250 matches', 'battle', 'wins', 250, 12000, 40, 81),
  ('games_200', 'Grinder', 'Play 200 matches', 'battle', 'games_played', 200, 6000, 15, 82),
  ('graded_1', 'Into the Case', 'Submit your first card for grading', 'collection', 'cards_graded', 1, 100, 0, 400),
  ('graded_25', 'Regular at the Lab', 'Submit 25 cards for grading', 'collection', 'cards_graded', 25, 750, 5, 401),
  ('graded_100', 'Grading Mogul', 'Submit 100 cards for grading', 'collection', 'cards_graded', 100, 2000, 15, 402),
  ('mint_1', 'Mint!', 'Get a slab graded 9 or better', 'collection', 'slabs_mint', 1, 250, 2, 403),
  ('mint_10', 'Mint Collector', 'Get 10 slabs graded 9 or better', 'collection', 'slabs_mint', 10, 1500, 10, 404),
  ('gem_1', 'Gem Mint', 'Get a perfect 10', 'collection', 'gem_mints', 1, 1000, 10, 405),
  ('gem_5', 'Jeweller', 'Get five perfect 10s', 'collection', 'gem_mints', 5, 3000, 25, 406),
  ('decks_1', 'Deckwright', 'Build your first legal deck', 'progress', 'decks_built', 1, 100, 0, 410),
  ('decks_10', 'Brewmaster', 'Build 10 legal decks (one counts per day)', 'progress', 'decks_built', 10, 600, 5, 411),
  ('bids_1', 'First Paddle', 'Place your first auction bid', 'market', 'bids_placed', 1, 100, 0, 420),
  ('bids_50', 'Auction House', 'Bid on 50 different auctions', 'market', 'bids_placed', 50, 1000, 5, 421),
  ('listings_25', 'Stallholder', 'Finish 25 Marketplace listings (sold or expired)', 'market', 'listings_created', 25, 600, 5, 422),
  ('cpu_auction_1', 'Sold to a Collector', 'A CPU collector wins one of your auctions', 'market', 'cpu_auction_sales', 1, 150, 0, 423),
  ('cpu_auction_25', 'Collector''s Dealer', 'CPU collectors win 25 of your auctions', 'market', 'cpu_auction_sales', 25, 1200, 10, 424),
  ('floor_1', 'Open Sign', 'Make your first Shop Floor sale', 'market', 'shop_cpu_sales', 1, 150, 0, 430),
  ('floor_50', 'Shopkeeper', 'Make 50 Shop Floor sales', 'market', 'shop_cpu_sales', 50, 2000, 15, 431),
  ('floor_trade_1', 'Swap Meet', 'Accept a trade from a Shop Floor customer', 'market', 'shop_cpu_trades', 1, 150, 0, 432),
  ('floor_trade_25', 'Binder Broker', 'Accept 25 Shop Floor trades', 'market', 'shop_cpu_trades', 25, 1200, 10, 433),
  ('shop_sales_10', 'Storefront', 'Sell 10 listings to other players from your shop', 'market', 'shop_sales', 10, 800, 5, 434),
  ('bingo_1', 'Bingo!', 'Claim your first bingo line', 'collection', 'bingo_lines', 1, 100, 0, 440),
  ('bingo_25', 'Bingo Baron', 'Claim 25 bingo lines', 'collection', 'bingo_lines', 25, 1000, 5, 441),
  ('blackout_1', 'Blackout', 'Fill an entire bingo card', 'collection', 'bingo_blackouts', 1, 1000, 10, 442),
  ('win_100', 'Legend of Fry (Retired)', 'Retired: Centurion pays for the same milestone.', 'battle', 'wins', 100, 0, 0, 900),
  ('collector_150', 'Completionist (Retired)', 'Retired: Grand Archivist pays for the same milestone.', 'collection', 'unique_cards', 150, 0, 0, 901)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  category = excluded.category,
  stat_key = excluded.stat_key,
  target = excluded.target,
  reward_credits = excluded.reward_credits,
  reward_vouchers = excluded.reward_vouchers,
  sort = excluded.sort;

insert into public.missions (id, name, description, stat_key, target, reward_credits, reward_vouchers, reward_bp_xp, cadence) values
  ('d_bid_1', 'Paddle Up', 'Place a bid on an auction today', 'bids_placed', 1, 50, 0, 25, 'daily'),
  ('d_floor_1', 'Customer Service', 'Make a sale or trade on your Shop Floor', 'shop_cpu_sales', 1, 75, 0, 30, 'daily'),
  ('d_grade_1', 'Send It Off', 'Submit a card for grading today', 'cards_graded', 1, 60, 0, 30, 'daily'),
  ('d_list_1', 'Open the Stall', 'Have a Marketplace listing sell or expire today', 'listings_created', 1, 50, 0, 25, 'daily'),
  ('d_login', 'Show Up', 'Claim your daily login reward', 'logins', 1, 50, 0, 25, 'daily'),
  ('d_open_2', 'Crack a Couple', 'Open 2 packs today', 'packs_opened', 2, 150, 0, 50, 'daily'),
  ('d_pack_1', 'Rip One', 'Open a pack today.', 'packs_opened', 1, 50, 0, 30, 'daily'),
  ('d_play_3', 'Warm Up', 'Play 3 matches today.', 'games_played', 3, 75, 0, 40, 'daily'),
  ('d_sell_5', 'Clear the Clutter', 'Quicksell 5 cards today', 'cards_sold', 5, 100, 0, 30, 'daily'),
  ('d_win_1', 'Daily Victory', 'Win a match today', 'wins', 1, 100, 0, 40, 'daily'),
  ('d_win_2', 'Daily Double', 'Win 2 matches today.', 'wins', 2, 200, 0, 60, 'daily'),
  ('w_bids_10', 'Auction Regular', 'Bid on 10 different auctions this week', 'bids_placed', 10, 300, 0, 150, 'weekly'),
  ('w_bingo_2', 'Two in a Row', 'Claim 2 bingo lines this week', 'bingo_lines', 2, 200, 0, 150, 'weekly'),
  ('w_cpuauc_3', 'Sold to the Collector', 'Have a CPU collector win 3 of your auctions', 'cpu_auction_sales', 3, 300, 0, 150, 'weekly'),
  ('w_deck_1', 'Brewer', 'Build a new legal deck this week', 'decks_built', 1, 250, 0, 100, 'weekly'),
  ('w_floor_5', 'Floor Manager', 'Close 5 Shop Floor sales this week', 'shop_cpu_sales', 5, 500, 0, 200, 'weekly'),
  ('w_games_10', 'Table Regular', 'Play 10 matches this week', 'games_played', 10, 500, 0, 180, 'weekly'),
  ('w_grade_5', 'Grading Run', 'Submit 5 cards for grading this week', 'cards_graded', 5, 400, 0, 150, 'weekly'),
  ('w_market_1', 'Market Day', 'Sell a card on the Marketplace', 'market_sales', 1, 400, 2, 150, 'weekly'),
  ('w_mint_1', 'Mint Condition', 'Pull a 9 or better from the graders', 'slabs_mint', 1, 500, 2, 150, 'weekly'),
  ('w_open_10', 'Case Break', 'Open 10 packs this week', 'packs_opened', 10, 800, 0, 250, 'weekly'),
  ('w_packs_5', 'Bulk Ripper', 'Open 5 packs this week.', 'packs_opened', 5, 250, 0, 150, 'weekly'),
  ('w_play_15', 'Weekly Grind', 'Play 15 matches this week.', 'games_played', 15, 800, 5, 260, 'weekly'),
  ('w_sell_25', 'Estate Sale', 'Quicksell 25 cards this week', 'cards_sold', 25, 500, 0, 150, 'weekly'),
  ('w_sell_5', 'Garage Sale', 'Quicksell 5 cards this week.', 'cards_sold', 5, 150, 0, 100, 'weekly'),
  ('w_streak_7', 'Perfect Attendance', 'Reach a 7-day login streak', 'login_streak', 7, 600, 3, 200, 'weekly'),
  ('w_trade_1', 'Deal of the Week', 'Complete a trade this week', 'trades', 1, 400, 2, 150, 'weekly'),
  ('w_win_8', 'Weekly Champion', 'Win 8 matches this week.', 'wins', 8, 400, 5, 200, 'weekly')
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  stat_key = excluded.stat_key,
  target = excluded.target,
  reward_credits = excluded.reward_credits,
  reward_vouchers = excluded.reward_vouchers,
  reward_bp_xp = excluded.reward_bp_xp,
  cadence = excluded.cadence;
