-- 2026-10-11 audit §5: missions and achievements.
--
--   1. Data fixes (d_floor_1 copy, `economy` folded into `market`, poker titles).
--   2. Battle-pass XP trim (§a.6): weekly halved, daily cut by a third.
--   3. Rotation (§a.7): each UTC day deals the always-on dailies plus 4 more,
--      each week the always-on weeklies plus 5 more, picked by md5(id || period)
--      so every player sees the same set and adding rows never adds income.
--      A player who cannot start CPU matches (src/meta/cpuAccess.ts) is dealt
--      no match mission from the rotating pool.
--   4. §1: 7 missions + 18 achievements on existing keys, with the backfill.
--   5. §1b rows on wins / games_played (safe now that record_match_result is
--      out of the API and matches are Creator-gated, 20261011000002).
--   6. §2 rows on the poker match keys emitted by 20261011000002.
--
-- Rows on the market / shop keys (§1b) and on the collection keys (§2
-- own_* / new_cards / graded_*) wait for their emitter fixes.
--
-- Idempotent: inserts are `on conflict do nothing`, updates are keyed on the
-- old values.

-------------------------------------------------------------------------------
-- 1. Data fixes
-------------------------------------------------------------------------------
update public.missions set description = 'Make a sale to a Shop Floor customer today'
 where id = 'd_floor_1' and description <> 'Make a sale to a Shop Floor customer today';
update public.achievements set category = 'market' where category = 'economy';
-- §a.3: the retired twins stay in the table (claim records) but are hidden.
alter table public.achievements add column if not exists hidden boolean not null default false;
update public.achievements set hidden = true where id in ('win_100', 'collector_150') and not hidden;
update public.achievements set name = 'First Freezeout' where id = 'first_win' and name = 'First Blood';
update public.achievements set name = 'Ten Tables'      where id = 'win_10'    and name = 'Battle Tested';
update public.achievements set name = 'Table Boss'      where id = 'win_50'    and name = 'Warlord';
update public.achievements set name = 'Shark'           where id = 'wins_250'  and name = 'Conqueror';

-------------------------------------------------------------------------------
-- 2. BP XP trim, keyed on the values before this migration
-------------------------------------------------------------------------------
update public.missions m set reward_bp_xp = v.new_xp
  from (values
    ('d_bid_1', 25, 16), ('d_floor_1', 30, 20), ('d_grade_1', 30, 20), ('d_list_1', 25, 16),
    ('d_login', 25, 16), ('d_open_2', 50, 33), ('d_pack_1', 30, 20), ('d_play_3', 40, 26),
    ('d_sell_5', 30, 20), ('d_win_1', 40, 26), ('d_win_2', 60, 40),
    ('w_bids_10', 150, 75), ('w_bingo_2', 150, 75), ('w_cpuauc_3', 150, 75), ('w_deck_1', 100, 50),
    ('w_floor_5', 200, 100), ('w_games_10', 180, 90), ('w_grade_5', 150, 75), ('w_market_1', 150, 75),
    ('w_mint_1', 150, 75), ('w_open_10', 250, 125), ('w_packs_5', 150, 75), ('w_play_15', 260, 130),
    ('w_sell_25', 150, 75), ('w_sell_5', 100, 50), ('w_streak_7', 200, 100), ('w_trade_1', 150, 75),
    ('w_win_8', 200, 100)
  ) as v(id, old_xp, new_xp)
 where m.id = v.id and m.reward_bp_xp = v.old_xp;

-------------------------------------------------------------------------------
-- 3. Rotation
-------------------------------------------------------------------------------
alter table public.missions add column if not exists pool text not null default 'rotating';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'missions_pool_check') then
    alter table public.missions add constraint missions_pool_check check (pool in ('core', 'rotating'));
  end if;
end $$;
update public.missions set pool = 'core'
 where id in ('d_login', 'd_pack_1', 'd_win_1', 'w_open_10', 'w_win_8') and pool <> 'core';

-- How many rotating missions each period deals.
create or replace function public.mission_rotation_size(p_cadence text)
returns int language sql immutable set search_path to 'public' as $function$
  select case when p_cadence = 'daily' then 4 else 5 end;
$function$;

-- The missions dealt to p_uid this period (same set for every player, minus
-- match missions for a player who cannot start matches).
create or replace function public.active_mission_ids(p_uid uuid)
returns setof text language sql stable security definer set search_path to 'public' as $function$
  with me as (select can_play_cpu(p_uid) as cpu)
  select m.id from missions m, me
   where m.pool = 'core'
  union all
  select r.id from (
    select m.id, m.cadence,
           row_number() over (partition by m.cadence
                              order by md5(m.id || mission_period_start(m.cadence)::text)) rn
      from missions m, me
     where m.pool = 'rotating' and (me.cpu or not is_match_stat(m.stat_key))
  ) r
   where r.rn <= mission_rotation_size(r.cadence);
$function$;
revoke all on function public.mission_rotation_size(text) from public, anon, authenticated;
revoke all on function public.active_mission_ids(uuid) from public, anon, authenticated;

create or replace function public.get_missions()
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', m.id, 'name', m.name, 'description', m.description,
      'stat_key', m.stat_key, 'target', m.target, 'cadence', m.cadence, 'pool', m.pool,
      'reward_credits', m.reward_credits, 'reward_vouchers', m.reward_vouchers, 'reward_bp_xp', m.reward_bp_xp,
      'progress', case when pm.period_start = mission_period_start(m.cadence)
                       then pm.progress else 0 end,
      'claimed', case when pm.period_start = mission_period_start(m.cadence)
                      then pm.claimed else false end
    ) order by m.cadence, m.pool, m.id)
    from missions m
    left join player_missions pm on pm.mission_id = m.id and pm.user_id = v_uid
    where m.id in (select active_mission_ids(v_uid))
  ), '[]'::jsonb);
end;
$function$;
revoke all on function public.get_missions() from public, anon;
grant execute on function public.get_missions() to authenticated;

-- Progress only moves on missions dealt this period.
create or replace function public.track_stat(p_uid uuid, p_key text, p_amount integer, p_absolute boolean default false)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_m missions%rowtype;
  v_period date;
begin
  insert into player_achievements as pa (user_id, achievement_id, progress)
  select p_uid, a.id, least(a.target, greatest(0, p_amount))
  from achievements a where a.stat_key = p_key
  on conflict (user_id, achievement_id) do update
    set progress = least(
      (select target from achievements where id = pa.achievement_id),
      case when p_absolute then greatest(pa.progress, p_amount)
           else pa.progress + p_amount end);

  for v_m in
    select * from missions
     where stat_key = p_key and id in (select active_mission_ids(p_uid))
  loop
    v_period := mission_period_start(v_m.cadence);
    insert into player_missions as pm (user_id, mission_id, progress, claimed, period_start)
    values (p_uid, v_m.id, least(v_m.target, greatest(0, p_amount)), false, v_period)
    on conflict (user_id, mission_id) do update
      set progress = case
            when pm.period_start <> v_period then least(v_m.target, greatest(0, p_amount))
            when p_absolute then least(v_m.target, greatest(pm.progress, p_amount))
            else least(v_m.target, pm.progress + p_amount) end,
          claimed = case when pm.period_start <> v_period then false else pm.claimed end,
          period_start = v_period;
  end loop;
end;
$function$;
revoke all on function public.track_stat(uuid, text, integer, boolean) from public, anon, authenticated;

create or replace function public.claim_mission(p_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_m missions%rowtype;
  v_pm player_missions%rowtype;
  v_period date;
  v_profile profiles%rowtype;
  v_bp_xp_granted int := 0;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_m from missions where id = p_id;
  if not found then raise exception 'Unknown mission'; end if;
  if p_id not in (select active_mission_ids(v_uid)) then
    raise exception 'That mission is not in this period''s rotation';
  end if;
  v_period := mission_period_start(v_m.cadence);
  select * into v_pm from player_missions
    where user_id = v_uid and mission_id = p_id for update;
  if not found or v_pm.period_start <> v_period or v_pm.progress < v_m.target then
    raise exception 'Mission not completed yet';
  end if;
  if v_pm.claimed then raise exception 'Reward already claimed'; end if;
  update profiles set credits = credits + v_m.reward_credits, vouchers = vouchers + v_m.reward_vouchers,
    updated_at = now() where id = v_uid;
  if v_m.reward_bp_xp > 0 and grant_bp_xp(v_uid, v_m.reward_bp_xp) then
    v_bp_xp_granted := v_m.reward_bp_xp;
  end if;
  update player_missions set claimed = true where user_id = v_uid and mission_id = p_id;
  select * into v_profile from profiles where id = v_uid;
  return jsonb_build_object('ok', true, 'credits', v_profile.credits, 'vouchers', v_profile.vouchers,
    'bp_xp', v_bp_xp_granted);
end;
$function$;
revoke all on function public.claim_mission(text) from public, anon;
grant execute on function public.claim_mission(text) to authenticated;

-------------------------------------------------------------------------------
-- 4–6. New rows
-------------------------------------------------------------------------------
insert into public.missions
  (id, name, description, stat_key, target, reward_credits, reward_vouchers, reward_bp_xp, cadence)
values
  -- §1 daily
  ('d_bingo_1',       'Dab a Line',   'Claim a bingo line today',                           'bingo_lines',       1,  75, 0, 20, 'daily'),
  ('d_floor_trade_1', 'Swap Shop',    'Accept a trade from a Shop Floor customer today',    'shop_cpu_trades',   1,  60, 0, 20, 'daily'),
  ('d_cpuauc_1',      'Gavel Down',   'Have a CPU collector win one of your auctions today','cpu_auction_sales', 1,  60, 0, 20, 'daily'),
  ('d_floor_3',       'Busy Counter', 'Make 3 sales to Shop Floor customers today',         'shop_cpu_sales',    3, 100, 0, 25, 'daily'),
  -- §1 weekly
  ('w_floor_trade_3', 'Barter Week',  'Accept 3 Shop Floor trades this week',               'shop_cpu_trades',   3, 300, 0,  80, 'weekly'),
  ('w_login_5',       'Five Visits',  'Claim your daily login reward on 5 days this week',  'logins',            5, 250, 0,  80, 'weekly'),
  ('w_blackout_1',    'Lights Out',   'Fill your whole bingo card this week',               'bingo_blackouts',   1, 300, 0, 100, 'weekly'),
  -- §2 daily (match keys)
  ('d_pots_5',       'Rake It In',         'Win 5 pots today',                                'hands_won',         5,  75, 0, 25, 'daily'),
  ('d_showdown_2',   'Show Me',            'Win 2 pots at showdown today',                    'showdown_wins',     2,  75, 0, 25, 'daily'),
  ('d_strong_1',     'Two''s Company',     'Win a showdown with two pair or better',          'strong_showdowns',  1,  75, 0, 25, 'daily'),
  ('d_cast_5',       'Powered Up',         'Resolve 5 power cards today',                     'powers_cast',       5,  60, 0, 20, 'daily'),
  ('d_leader_2',     'Lead From the Front','Use your Leader''s ability twice today',          'leader_uses',       2,  60, 0, 20, 'daily'),
  ('d_bluff_1',      'Nothing But Air',    'Take down a pot uncontested without a made hand', 'bluff_wins',        1,  75, 0, 25, 'daily'),
  ('d_bust_1',       'Send One Home',      'Knock a seat out of a match',                     'seats_busted',      1,  75, 0, 25, 'daily'),
  ('d_podium_1',     'In the Money',       'Finish top 3 at a table of 4 or more seats',      'podium_finishes',   1, 100, 0, 30, 'daily'),
  ('d_long_1',       'Full Session',       'Finish a Standard or Deep match',                 'long_games',        1, 100, 0, 30, 'daily'),
  ('d_keywords_3',   'Mixed Bag',          'Resolve powers with 3 different keywords today',  'keywords_today',    3,  75, 0, 25, 'daily'),
  ('d_deep_hand_1',  'Deep Stack',         'Win a pot of 20 big blinds or more',              'big_pots',          1,  75, 0, 25, 'daily'),
  -- §2 weekly (match keys)
  ('w_deep_win_1',   'Deep Run',           'Win a Deep match at a table of 4 or more',        'deep_wins',         1, 600, 2, 150, 'weekly'),
  ('w_full_win_1',   'Last One Standing',  'Win a match at a full 6-seat table',              'full_table_wins',   1, 500, 2, 150, 'weekly'),
  ('w_strong_6',     'Paint the Board',    'Win 6 showdowns with two pair or better',         'strong_showdowns',  6, 400, 0, 120, 'weekly'),
  ('w_bust_10',      'Table Cleaner',      'Knock out 10 seats this week',                    'seats_busted',     10, 400, 0, 120, 'weekly'),
  ('w_cast_30',      'Power Hour',         'Resolve 30 power cards this week',                'powers_cast',      30, 400, 0, 120, 'weekly'),
  ('w_podium_5',     'Money Finisher',     'Finish top 3 at a table of 4+ five times',        'podium_finishes',   5, 500, 0, 150, 'weekly'),
  ('w_keywords_12',  'Full Toolkit',       'Resolve powers with 12 different keywords this week','keywords_week', 12, 400, 0, 120, 'weekly')
on conflict (id) do nothing;

insert into public.achievements
  (id, name, description, category, stat_key, target, reward_credits, reward_vouchers, reward_pack_id, sort)
values
  -- §1 collection
  ('collection_250', 'Master Archivist',   'Own 250 different cards',                                 'collection', 'unique_cards',     250, 10000, 30, null, 17),
  ('collection_288', 'Volume #1 Complete', 'Own 288 different Volume #1 cards — the full pullable set','collection', 'unique_cards',     288, 15000, 50,
      (select id from public.pack_types where acquisition = 'pass_tier_reward' and is_active order by name limit 1), 18),
  ('serialized_3',   'Numbered Trio',      'Pull 3 Serialized cards',                                 'collection', 'serialized_pulls',   3,  8000, 40, null, 34),
  ('mint_25',        'Mint Vault',         'Get 25 slabs graded 9 or better',                         'collection', 'slabs_mint',        25,  3000, 20, null, 407),
  ('gem_10',         'Crown Jeweller',     'Get ten perfect 10s',                                     'collection', 'gem_mints',         10,  5000, 40, null, 408),
  ('graded_250',     'Lab Partner',        'Submit 250 cards for grading',                            'collection', 'cards_graded',     250,  4000, 25, null, 409),
  ('bingo_100',      'Bingo Hall of Fame', 'Claim 100 bingo lines',                                   'collection', 'bingo_lines',      100,  3000, 20, null, 443),
  ('blackout_5',     'Five Blackouts',     'Fill 5 entire bingo cards',                               'collection', 'bingo_blackouts',    5,  3000, 20, null, 444),
  ('cosmetics_10',   'Fashion Plate',      'Buy 10 cosmetics from the store',                         'collection', 'cosmetics_bought',  10,  1000,  5, null, 45),
  -- §1 progression
  ('level_15',       'Regular at the Table','Reach level 15',                                         'progress',   'level',             15,  1200, 15, null, 23),
  ('level_40',       'High Roller',        'Reach level 40',                                          'progress',   'level',             40,  5000, 50, null, 24),
  ('logins_365',     'Year at the Table',  'Claim 365 daily login rewards',                           'progress',   'logins',           365, 15000, 50, null, 65),
  ('streak_100',     'Unbroken',           'Reach a 100-day login streak',                            'progress',   'login_streak',     100, 10000, 40, null, 66),
  ('decks_30',       'Deck Architect',     'Make 30 decks legal (one counts per day)',                'progress',   'decks_built',       30,  1500, 10, null, 412),
  -- §1 market (CPU-driven keys)
  ('floor_200',      'Department Store',   'Make 200 Shop Floor sales',                               'market',     'shop_cpu_sales',   200,  5000, 30, null, 435),
  ('floor_trade_100','Swap King',          'Accept 100 Shop Floor trades',                            'market',     'shop_cpu_trades',  100,  4000, 25, null, 436),
  ('cpu_auction_100','Auctioneer',         'CPU collectors win 100 of your auctions',                 'market',     'cpu_auction_sales',100,  4000, 25, null, 425),
  ('sold_2000',      'Clearance King',     'Quicksell 2,000 cards',                                   'market',     'cards_sold',      2000,  5000, 15, null, 76),
  -- §1b match totals
  ('wins_500',       'Table Legend',       'Win 500 matches',                                         'battle',     'wins',             500, 15000, 50, null, 83),
  ('games_500',      'Lifer',              'Play 500 matches',                                        'battle',     'games_played',     500, 10000, 30, null, 84),
  -- §2 poker skill
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
  ('keywords_10',    'Wordsmith',          'Resolve powers with 10 different keywords',             'battle','keywords_distinct',   10,  750,  0, null, 160),
  ('keywords_20',    'Lexicon',            'Resolve powers with 20 different keywords',             'battle','keywords_distinct',   20, 2000, 10, null, 161),
  ('keywords_35',    'Rulebook Lawyer',    'Resolve powers with 35 different keywords',             'battle','keywords_distinct',   35, 5000, 25, null, 162),
  ('casts_100',      'Power Player',       'Resolve 100 power cards',                               'battle','powers_cast',        100,  750,  0, null, 170),
  ('casts_1000',     'Overclocked',        'Resolve 1,000 power cards',                             'battle','powers_cast',       1000, 4000, 20, null, 171),
  ('leader_uses_100','Command Presence',   'Use Leader abilities 100 times',                        'battle','leader_uses',        100, 1000,  5, null, 172)
on conflict (id) do nothing;

-- Backfill (§a.8): new tiers start from the best sibling progress or the
-- source table, so veterans are not reset. Only ever raises progress.
with new_ids(id) as (values
  ('collection_250'),('collection_288'),('serialized_3'),('mint_25'),('gem_10'),('graded_250'),
  ('bingo_100'),('blackout_5'),('cosmetics_10'),('level_15'),('level_40'),('logins_365'),
  ('streak_100'),('decks_30'),('floor_200'),('floor_trade_100'),('cpu_auction_100'),('sold_2000'),
  ('wins_500'),('games_500')),
src(user_id, stat_key, v) as (
  select pa.user_id, a.stat_key, max(pa.progress)
    from public.player_achievements pa
    join public.achievements a on a.id = pa.achievement_id
   where a.id not in (select id from new_ids)
   group by 1, 2
  union all
  select user_id, 'unique_cards', count(*)::int from public.player_cards
   where quantity + foil_quantity > 0 group by user_id
  union all select id, 'level', level from public.profiles
  union all select id, 'login_streak', login_streak from public.profiles
  union all select id, 'wins', wins from public.profiles
  union all select id, 'games_played', games_played from public.profiles
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

-- §a.14: the `level` rows lagged for anyone who levelled from packs; level is
-- absolute, so re-seed every level row from profiles.
insert into public.player_achievements as pa (user_id, achievement_id, progress, claimed)
select p.id, a.id, least(a.target, p.level), false
  from public.profiles p cross join public.achievements a
 where a.stat_key = 'level' and p.level > 0
on conflict (user_id, achievement_id) do update
  set progress = greatest(pa.progress, excluded.progress);
