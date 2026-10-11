-- s5-missions.sql — audit pass §5 (missions / achievements), 2026-10-10.
-- NOT APPLIED. Live project dnngihsbqxccqvvedvjc was only read. Report: s5-missions.md.
--
-- Live schemas (information_schema, 2026-10-10):
--   missions(id text PK, name text NN, description text NN, stat_key text NN,
--            target int NN CHECK (target > 0), reward_credits int NN def 0,
--            reward_vouchers int NN def 0, reward_bp_xp int NN def 0,
--            cadence text NN CHECK (cadence in ('daily','weekly')))
--   achievements(id text PK, name text NN, description text NN, category text NN def 'general',
--            stat_key text NN, target int NN CHECK (target > 0), reward_credits int NN def 0,
--            reward_vouchers int NN def 0, reward_pack_id uuid NULL FK pack_types(id), sort int NN def 0)
--   player_missions(user_id, mission_id) PK, progress int def 0, claimed bool def false, period_start date NN
--   player_achievements(user_id, achievement_id) PK, progress int def 0, claimed bool def false
--   stat_once(user_id, key) PK, created_at
-- Engine: public.track_stat(uid, key, amount, absolute) fans a stat out to every row with that
-- stat_key. A row whose key nobody emits sits at 0 forever, so section 2 must ship WITH its emitters.
--
-- Apply order: §0 -> §1 (+ backfill) -> §1b after the emitter fixes in report §a.1/§a.4 ->
-- §2 in the same migration as the new emitters (report §c.2).
-- Every insert is `on conflict (id) do nothing`, so a re-run never clobbers a tuned row.

begin;

-------------------------------------------------------------------------------
-- §0 — data fixes for the CURRENT catalogue (no progress touched)
-------------------------------------------------------------------------------

-- d_floor_1 says "sale or trade" but counts shop_cpu_sales only (trades are shop_cpu_trades).
update public.missions
   set description = 'Make a sale to a Shop Floor customer today'
 where id = 'd_floor_1';

-- OPTIONAL: fold the unlabelled 'economy' category into 'market' (AchievementsScreen.tsx:45 has
-- no 'economy' label, so 4 rows render under a second "ECONOMY" header).
-- update public.achievements set category = 'market' where category = 'economy';

-- OPTIONAL: poker titles for the war-flavoured battle rows (mechanics unchanged: 1st places).
-- update public.achievements set name = 'First Freezeout' where id = 'first_win';
-- update public.achievements set name = 'Ten Tables'      where id = 'win_10';
-- update public.achievements set name = 'Table Boss'      where id = 'win_50';
-- update public.achievements set name = 'Shark'           where id = 'wins_250';

-- OPTIONAL: drop the retired twin win_100 (1 holder at 1/100, unclaimed; wins_100 covers it).
-- delete from public.achievements where id = 'win_100';

-- OPTIONAL (recommended, report §a.6): missions pay more BP XP than the whole pass
-- (weekly 2,840 + daily 385/day vs 25 tiers x 100 = 2,500).
-- update public.missions set reward_bp_xp = greatest(10, reward_bp_xp / 2)       where cadence = 'weekly';
-- update public.missions set reward_bp_xp = greatest(10, (reward_bp_xp * 2) / 3) where cadence = 'daily';

-------------------------------------------------------------------------------
-- §1 — new rows on EXISTING, non-farmable stat keys (emitters verified live)
-------------------------------------------------------------------------------

insert into public.missions
  (id, name, description, stat_key, target, reward_credits, reward_vouchers, reward_bp_xp, cadence)
values
  -- daily
  ('d_bingo_1',       'Dab a Line',   'Claim a bingo line today',                          'bingo_lines',       1,  75, 0, 20, 'daily'),
  ('d_floor_trade_1', 'Swap Shop',    'Accept a trade from a Shop Floor customer today',   'shop_cpu_trades',   1,  60, 0, 20, 'daily'),
  ('d_cpuauc_1',      'Gavel Down',   'Have a CPU collector win one of your auctions today','cpu_auction_sales', 1,  60, 0, 20, 'daily'),
  ('d_floor_3',       'Busy Counter', 'Make 3 sales to Shop Floor customers today',        'shop_cpu_sales',    3, 100, 0, 25, 'daily'),
  -- weekly
  ('w_floor_trade_3', 'Barter Week',  'Accept 3 Shop Floor trades this week',              'shop_cpu_trades',   3, 300, 0,  80, 'weekly'),
  ('w_login_5',       'Five Visits',  'Claim your daily login reward on 5 days this week', 'logins',            5, 250, 0,  80, 'weekly'),
  ('w_blackout_1',    'Lights Out',   'Fill your whole bingo card this week',              'bingo_blackouts',   1, 300, 0, 100, 'weekly')
on conflict (id) do nothing;

insert into public.achievements
  (id, name, description, category, stat_key, target, reward_credits, reward_vouchers, reward_pack_id, sort)
values
  -- collection (one-time collection missions)
  ('collection_250', 'Master Archivist',   'Own 250 different cards',                                'collection', 'unique_cards',     250, 10000, 30, null, 17),
  -- 288 = every non-Leader card in Volume #1. Leaders above Rare have no source (report §a.9),
  -- so 297 is unreachable. Reward pack: the active pass-tier reward pack.
  ('collection_288', 'Volume #1 Complete', 'Own 288 different Volume #1 cards — the full pullable set','collection', 'unique_cards',   288, 15000, 50,
      (select id from public.pack_types where acquisition = 'pass_tier_reward' and is_active order by name limit 1), 18),
  ('serialized_3',   'Numbered Trio',      'Pull 3 Serialized cards',                                'collection', 'serialized_pulls',   3,  8000, 40, null, 34),
  ('mint_25',        'Mint Vault',         'Get 25 slabs graded 9 or better',                        'collection', 'slabs_mint',        25,  3000, 20, null, 407),
  ('gem_10',         'Crown Jeweller',     'Get ten perfect 10s',                                    'collection', 'gem_mints',         10,  5000, 40, null, 408),
  ('graded_250',     'Lab Partner',        'Submit 250 cards for grading',                           'collection', 'cards_graded',     250,  4000, 25, null, 409),
  ('bingo_100',      'Bingo Hall of Fame', 'Claim 100 bingo lines',                                  'collection', 'bingo_lines',      100,  3000, 20, null, 443),
  ('blackout_5',     'Five Blackouts',     'Fill 5 entire bingo cards',                              'collection', 'bingo_blackouts',    5,  3000, 20, null, 444),
  ('cosmetics_10',   'Fashion Plate',      'Buy 10 cosmetics from the store',                        'collection', 'cosmetics_bought',  10,  1000,  5, null, 45),
  -- progression
  ('level_15',       'Regular at the Table','Reach level 15',                                        'progress',   'level',             15,  1200, 15, null, 23),
  ('level_40',       'High Roller',        'Reach level 40',                                         'progress',   'level',             40,  5000, 50, null, 24),
  ('logins_365',     'Year at the Table',  'Claim 365 daily login rewards',                          'progress',   'logins',           365, 15000, 50, null, 65),
  ('streak_100',     'Unbroken',           'Reach a 100-day login streak',                           'progress',   'login_streak',     100, 10000, 40, null, 66),
  ('decks_30',       'Deck Architect',     'Make 30 decks legal (one counts per day)',               'progress',   'decks_built',       30,  1500, 10, null, 412),
  -- market (CPU-driven keys only, player-to-player keys are held in §1b)
  ('floor_200',      'Department Store',   'Make 200 Shop Floor sales',                              'market',     'shop_cpu_sales',   200,  5000, 30, null, 435),
  ('floor_trade_100','Swap King',          'Accept 100 Shop Floor trades',                           'market',     'shop_cpu_trades',  100,  4000, 25, null, 436),
  ('cpu_auction_100','Auctioneer',         'CPU collectors win 100 of your auctions',                'market',     'cpu_auction_sales',100,  4000, 25, null, 425),
  ('sold_2000',      'Clearance King',     'Quicksell 2,000 cards',                                  'market',     'cards_sold',      2000,  5000, 15, null, 76)
on conflict (id) do nothing;

-- Backfill (report §a.8): track_stat inserts a missing row with progress = the event amount (1),
-- so without this a veteran's new tier would restart from 1. Seed each NEW achievement from
-- (a) the best progress any sibling row on the same stat_key already holds, and
-- (b) the source table where one exists. Only ever raises progress; never touches claimed.
with new_ids(id) as (values
  ('collection_250'),('collection_288'),('serialized_3'),('mint_25'),('gem_10'),('graded_250'),
  ('bingo_100'),('blackout_5'),('cosmetics_10'),('level_15'),('level_40'),('logins_365'),
  ('streak_100'),('decks_30'),('floor_200'),('floor_trade_100'),('cpu_auction_100'),('sold_2000')),
src(user_id, stat_key, v) as (
  select pa.user_id, a.stat_key, max(pa.progress)
    from public.player_achievements pa
    join public.achievements a on a.id = pa.achievement_id
   where a.id not in (select id from new_ids)
   group by 1, 2
  union all
  select user_id, 'unique_cards', count(*)::int from public.player_cards
   where quantity + foil_quantity > 0 group by user_id
  union all
  select id, 'level', level from public.profiles
  union all
  select id, 'login_streak', login_streak from public.profiles
  union all
  select user_id, 'cards_graded', count(*)::int from public.graded_cards group by user_id
  union all
  select user_id, 'slabs_mint', count(*)::int from public.graded_cards where grade >= 9 group by user_id
  union all
  select user_id, 'gem_mints', count(*)::int from public.graded_cards where grade >= 10 group by user_id
  union all
  select user_id, 'bingo_lines', sum(coalesce(cardinality(claimed), 0))::int from public.bingo_cards group by user_id
  union all
  select user_id, 'bingo_blackouts', count(*) filter (where blackout_claimed)::int from public.bingo_cards group by user_id
),
best as (select user_id, stat_key, max(v) v from src group by 1, 2)
insert into public.player_achievements as pa (user_id, achievement_id, progress, claimed)
select b.user_id, a.id, least(a.target, b.v), false
  from new_ids n
  join public.achievements a on a.id = n.id
  join best b on b.stat_key = a.stat_key
  join public.profiles p on p.id = b.user_id
 where b.v > 0
on conflict (user_id, achievement_id) do update
  set progress = greatest(pa.progress, excluded.progress);

-------------------------------------------------------------------------------
-- §1b — EXISTING keys that are farmable today. Apply only after the emitter fixes:
--   wins / games_played: revoke record_match_result from authenticated + server-side CPU lock (§a.1)
--   market_sales / market_buys / shop_sales: count only at >= 25 cr and not between friends (§a.4)
-------------------------------------------------------------------------------
/*
insert into public.missions
  (id, name, description, stat_key, target, reward_credits, reward_vouchers, reward_bp_xp, cadence)
values
  ('d_list_sold_1',  'Sold!',              'Sell a card on the Marketplace today (25 cr or more)',  'market_sales', 1,  75, 0, 20, 'daily'),
  ('d_mkt_buy_1',    'Window Shopping',    'Buy a card on the Marketplace today (25 cr or more)',   'market_buys',  1,  40, 0, 15, 'daily'),
  ('w_buys_3',       'Collector''s Rounds','Buy 3 cards on the Marketplace this week (25 cr or more)','market_buys', 3, 200, 0, 60, 'weekly'),
  ('w_shop_sales_3', 'Repeat Customers',   'Sell 3 items from your shop to other players',           'shop_sales',   3, 300, 0, 80, 'weekly')
on conflict (id) do nothing;

insert into public.achievements
  (id, name, description, category, stat_key, target, reward_credits, reward_vouchers, reward_pack_id, sort)
values
  ('wins_500',         'Table Legend', 'Win 500 matches',                   'battle', 'wins',         500, 15000, 50, null, 83),
  ('games_500',        'Lifer',        'Play 500 matches',                  'battle', 'games_played', 500, 10000, 30, null, 84),
  ('market_sales_100', 'Market Mogul', 'Sell 100 cards on the Marketplace', 'market', 'market_sales', 100,  6000, 20, null, 75)
on conflict (id) do nothing;
-- then re-run the §1 backfill with these ids, adding profiles.wins / profiles.games_played to src.
*/

-------------------------------------------------------------------------------
-- §2 — rows on NEW stat keys. DO NOT APPLY until the emitters in report §c.2 ship in the
-- SAME migration. Also add every match key to MATCH_STAT_KEYS (AchievementsScreen.tsx:37).
-------------------------------------------------------------------------------
/*
insert into public.missions
  (id, name, description, stat_key, target, reward_credits, reward_vouchers, reward_bp_xp, cadence)
values
  -- daily (match keys)
  ('d_pots_5',       'Rake It In',         'Win 5 pots today',                                      'hands_won',         5,  75, 0, 25, 'daily'),
  ('d_showdown_2',   'Show Me',            'Win 2 pots at showdown today',                          'showdown_wins',     2,  75, 0, 25, 'daily'),
  ('d_strong_1',     'Two''s Company',     'Win a showdown with two pair or better',                'strong_showdowns',  1,  75, 0, 25, 'daily'),
  ('d_cast_5',       'Powered Up',         'Resolve 5 power cards today',                           'powers_cast',       5,  60, 0, 20, 'daily'),
  ('d_leader_2',     'Lead From the Front','Use your Leader''s ability twice today',                'leader_uses',       2,  60, 0, 20, 'daily'),
  ('d_bluff_1',      'Nothing But Air',    'Take down a pot uncontested without a made hand',       'bluff_wins',        1,  75, 0, 25, 'daily'),
  ('d_bust_1',       'Send One Home',      'Knock a seat out of a match',                           'seats_busted',      1,  75, 0, 25, 'daily'),
  ('d_podium_1',     'In the Money',       'Finish top 3 at a table of 4 or more seats',            'podium_finishes',   1, 100, 0, 30, 'daily'),
  ('d_long_1',       'Full Session',       'Finish a Standard or Deep match',                       'long_games',        1, 100, 0, 30, 'daily'),
  ('d_keywords_3',   'Mixed Bag',          'Resolve powers with 3 different keywords today',        'keywords_today',    3,  75, 0, 25, 'daily'),
  ('d_deep_hand_1',  'Deep Stack',         'Win a pot of 20 big blinds or more',                    'big_pots',          1,  75, 0, 25, 'daily'),
  -- daily (collection key)
  ('d_new_card_1',   'Something New',      'Add a card you have never owned to your collection',    'new_cards',         1,  50, 0, 15, 'daily'),
  -- weekly
  ('w_deep_win_1',   'Deep Run',           'Win a Deep match at a table of 4 or more',              'deep_wins',         1, 600, 2, 150, 'weekly'),
  ('w_full_win_1',   'Last One Standing',  'Win a match at a full 6-seat table',                    'full_table_wins',   1, 500, 2, 150, 'weekly'),
  ('w_strong_6',     'Paint the Board',    'Win 6 showdowns with two pair or better',               'strong_showdowns',  6, 400, 0, 120, 'weekly'),
  ('w_bust_10',      'Table Cleaner',      'Knock out 10 seats this week',                          'seats_busted',     10, 400, 0, 120, 'weekly'),
  ('w_cast_30',      'Power Hour',         'Resolve 30 power cards this week',                      'powers_cast',      30, 400, 0, 120, 'weekly'),
  ('w_podium_5',     'Money Finisher',     'Finish top 3 at a table of 4+ five times',              'podium_finishes',   5, 500, 0, 150, 'weekly'),
  ('w_new_cards_10', 'Fresh Pages',        'Add 10 never-owned cards to your collection',           'new_cards',        10, 400, 0, 120, 'weekly'),
  ('w_keywords_12',  'Full Toolkit',       'Resolve powers with 12 different keywords this week',   'keywords_week',    12, 400, 0, 120, 'weekly')
on conflict (id) do nothing;

-- Collection: per-colour targets = live NON-Leader card count of that Essence (multi-colour cards
-- count for both). Measured 2026-10-10: Ember 43, Tide 54, Root 48, Gale 40, Void 55, Light 37, Shadow 50.
insert into public.achievements
  (id, name, description, category, stat_key, target, reward_credits, reward_vouchers, reward_pack_id, sort)
select v.id, v.name, v.description, 'collection', v.stat_key,
       (select count(*)::int from public.cards c where c.card_type <> 'Leader' and v.ess = any(c.essence_types)),
       2000, 10, null, v.sort
from (values
  ('own_ember_all',  'Ember Complete',  'Own every non-Leader Ember card',  'own_ember',  'Ember',  600),
  ('own_tide_all',   'Tide Complete',   'Own every non-Leader Tide card',   'own_tide',   'Tide',   601),
  ('own_root_all',   'Root Complete',   'Own every non-Leader Root card',   'own_root',   'Root',   602),
  ('own_gale_all',   'Gale Complete',   'Own every non-Leader Gale card',   'own_gale',   'Gale',   603),
  ('own_void_all',   'Void Complete',   'Own every non-Leader Void card',   'own_void',   'Void',   604),
  ('own_light_all',  'Light Complete',  'Own every non-Leader Light card',  'own_light',  'Light',  605),
  ('own_shadow_all', 'Shadow Complete', 'Own every non-Leader Shadow card', 'own_shadow', 'Shadow', 606)
) as v(id, name, description, stat_key, ess, sort)
on conflict (id) do nothing;

insert into public.achievements
  (id, name, description, category, stat_key, target, reward_credits, reward_vouchers, reward_pack_id, sort)
values
  -- collection: rarity / type / foil / Leaders / graded (non-Leader targets, report §a.9)
  ('own_leaders_2',      'Second Opinion',    'Own 2 different Leaders',                              'collection','own_leaders',       2, 1000,  5, null, 610),
  ('own_leaders_6',      'Council of Leaders','Own every Leader a Deck Box can give (6)',             'collection','own_leaders',       6, 3000, 20, null, 611),
  ('own_mythic_7',       'Mythic Shelf',      'Own all 7 Mythic power cards',                         'collection','own_mythic',        7, 5000, 30, null, 612),
  ('own_fullart_28',     'Gallery Wall',      'Own all 28 Full-Art power cards',                      'collection','own_full_art',     28, 4000, 25, null, 613),
  ('own_ultra_5',        'Ultra Set',         'Own all 5 Ultra-Rare power cards',                     'collection','own_ultra_rare',    5, 3000, 20, null, 614),
  ('own_super_12',       'Super Set',         'Own all 12 Super-Rare cards',                          'collection','own_super_rare',   12, 2000, 10, null, 615),
  ('own_locations',      'Cartographer',      'Own all 55 Locations',                                 'collection','own_locations',    55, 2000, 10, null, 616),
  ('foil_25',            'Shiny Binder',      'Own foils of 25 different cards',                      'collection','own_foil_unique',  25, 1000,  5, null, 617),
  ('foil_100',           'Prism Collector',   'Own foils of 100 different cards',                     'collection','own_foil_unique', 100, 5000, 20, null, 618),
  ('playsets_25',        'Full Copies',       'Own 3 or more copies of 25 different cards',           'collection','own_playsets',     25, 1500,  5, null, 619),
  ('graded_foil_1',      'Shiny Slab',        'Grade a foil card',                                    'collection','graded_foil',       1,  500,  2, null, 620),
  ('graded_distinct_25', 'Slab Library',      'Have 25 different cards graded',                       'collection','graded_distinct',  25, 2000, 10, null, 621),
  ('graded_leader_1',    'Framed Leader',     'Grade a Leader',                                       'collection','graded_leader',     1,  500,  2, null, 622),
  -- poker skill (category battle => greyed while CPU play is locked)
  ('pots_100',       'Pot Taker',          'Win 100 pots',                                          'battle','hands_won',          100,  500,  0, null, 100),
  ('pots_1000',      'Chip Leader',        'Win 1,000 pots',                                        'battle','hands_won',         1000, 3000, 15, null, 101),
  ('pots_5000',      'The House',          'Win 5,000 pots',                                        'battle','hands_won',         5000, 8000, 40, null, 102),
  ('pair_win_1',     'Pair Does It',       'Win a showdown with just a pair',                       'battle','win_pair',             1,  150,  0, null, 110),
  ('pair_win_25',    'Small Ball',         'Win 25 showdowns with just a pair',                     'battle','win_pair',            25, 1000,  5, null, 111),
  ('straight_1',     'On the Straight',    'Win a pot with a straight',                             'battle','made_straight',        1,  200,  0, null, 112),
  ('flush_1',        'Flush!',             'Win a pot with a flush',                                'battle','made_flush',           1,  250,  0, null, 113),
  ('flush_25',       'Suited Up',          'Win 25 pots with a flush',                              'battle','made_flush',          25, 1500, 10, null, 114),
  ('boat_1',         'Full Boat',          'Win a pot with a full house',                           'battle','made_full_house',      1,  300,  0, null, 115),
  ('quads_1',        'Four of a Kind',     'Win a pot with four of a kind',                         'battle','made_quads',           1, 1000,  5, null, 116),
  ('sflush_1',       'Straight Flush',     'Win a pot with a straight flush',                       'battle','made_straight_flush',  1, 3000, 20, null, 117),
  ('bluff_1',        'Pure Bluff',         'Win a pot uncontested without a made hand',             'battle','bluff_wins',           1,  150,  0, null, 120),
  ('bluff_50',       'Poker Face',         'Win 50 pots on a bluff',                                'battle','bluff_wins',          50, 2000, 10, null, 121),
  ('big_pot_1',      'Monster Pot',        'Win a single pot of 50 big blinds or more',             'battle','big_pots_50',          1,  750,  5, null, 122),
  ('bust_1',         'Bounty Hunter',      'Knock out a seat',                                      'battle','seats_busted',         1,  100,  0, null, 130),
  ('bust_100',       'Headhunter',         'Knock out 100 seats',                                   'battle','seats_busted',       100, 2000, 10, null, 131),
  ('bust_500',       'Reaper of the Felt', 'Knock out 500 seats',                                   'battle','seats_busted',       500, 6000, 30, null, 132),
  ('triple_bust_1',  'Triple Knockout',    'Bust 3 seats in a single hand',                         'battle','triple_bust',          1, 2000, 10, null, 133),
  ('short_win_1',    'One Big Blind',      'Win a match after starting a hand with 1 big blind or less','battle','short_stack_win',  1, 2500, 15, null, 134),
  ('deep_win_1',     'Deep Water',         'Win a Deep match at a table of 4 or more',              'battle','deep_wins',            1,  500,  0, null, 140),
  ('deep_win_10',    'Abyss Diver',        'Win 10 Deep matches at tables of 4 or more',            'battle','deep_wins',           10, 2500, 15, null, 141),
  ('deep_win_50',    'Leviathan',          'Win 50 Deep matches at tables of 4 or more',            'battle','deep_wins',           50, 8000, 40, null, 142),
  ('full_win_1',     'Last Seat Standing', 'Win a match at a full 6-seat table',                    'battle','full_table_wins',      1,  400,  0, null, 143),
  ('full_win_25',    'Six-Max Shark',      'Win 25 matches at full 6-seat tables',                  'battle','full_table_wins',     25, 4000, 20, null, 144),
  ('podium_50',      'Always in the Money','Finish top 3 at a 4+ table 50 times',                   'battle','podium_finishes',     50, 2500, 10, null, 145),
  ('leaders_won_1',  'Leader''s Win',      'Win a match with a Leader you own',                     'battle','leaders_won_with',     1,  300,  0, null, 150),
  ('leaders_won_3',  'Versatile',          'Win a match with 3 different Leaders',                  'battle','leaders_won_with',     3, 1000,  5, null, 151),
  -- leaders_won_6 / leaders_won_9 wait for a Leader source (report §a.9)
  ('keywords_10',    'Wordsmith',          'Resolve powers with 10 different keywords',             'battle','keywords_distinct',   10,  750,  0, null, 160),
  ('keywords_20',    'Lexicon',            'Resolve powers with 20 different keywords',             'battle','keywords_distinct',   20, 2000, 10, null, 161),
  ('keywords_35',    'Rulebook Lawyer',    'Resolve powers with 35 different keywords',             'battle','keywords_distinct',   35, 5000, 25, null, 162),
  ('casts_100',      'Power Player',       'Resolve 100 power cards',                               'battle','powers_cast',        100,  750,  0, null, 170),
  ('casts_1000',     'Overclocked',        'Resolve 1,000 power cards',                             'battle','powers_cast',       1000, 4000, 20, null, 171),
  ('leader_uses_100','Command Presence',   'Use Leader abilities 100 times',                        'battle','leader_uses',        100, 1000,  5, null, 172)
on conflict (id) do nothing;
*/

commit;
