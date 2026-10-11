-- 2026-10-11 audit: match tickets and placement rewards, server side.
--
--   A21  begin_match(p_mode, p_seats) records the mode and seat count at the
--        start (RULEBOOK §13). record_match_placement pays and floors on the
--        TICKET's values; the client's are used only for a ticket minted by an
--        old client that sent none.
--   A20/B2  `too_early` is retryable: the reply carries `retry_after` (seconds
--        until the ticket is old enough), and the ticket stays redeemable.
--   §5.1 CPU play is Creator-only on the client (src/meta/cpuAccess.ts);
--        begin_match and record_match_placement now apply the same rule.
--   F-5  rewards rebalanced: (15 + 85f, 10 + 50f, 8 + 42f) × mode × seat
--        multiplier {2: .55, 3: .7, 4: .8, 5: .9, 6: 1}. A non-winning finish
--        before max(3 × seats, 8) hands pays nothing (status `too_short`);
--        p_hands is clamped to elapsed seconds / 15. Mirror: src/game/poker/rewards.ts.
--   §5   p_stats jsonb: per-match poker stats, clamped server-side, tracked only
--        on a full-rate (untapered) payout. Shape: MatchStats in src/lib/supabase.ts.
--   §5.14 the `level` stat moves into grant_xp, so levels from packs count too.
--
-- The previous signatures are renamed out of the API (not removed), so this
-- file runs on live without a destructive statement; the follow-up file
-- 20261011000090_pending_destructive.sql removes the renamed leftovers.
--
-- Idempotent.

alter table public.match_tickets add column if not exists voided_at timestamptz;

-- Mode + seats floor, one place for both RPCs.
create or replace function public.match_floor_seconds(p_mode text, p_seats int)
returns int language sql immutable set search_path to 'public' as $function$
  select greatest(45, round(
    (case p_mode when 'quick' then 360 when 'standard' then 720 else 1200 end) * p_seats / 6.0
  )::int);
$function$;
revoke all on function public.match_floor_seconds(text, int) from public, anon, authenticated;

-- Stats that only a match can move. Used by the mission rotation (a player who
-- cannot start matches is never dealt one) and mirrored by MATCH_STAT_KEYS in
-- src/meta/AchievementsScreen.tsx.
create or replace function public.is_match_stat(p_key text)
returns boolean language sql immutable set search_path to 'public' as $function$
  select p_key = any (array[
    'games_played','wins','hands_won','showdown_wins','strong_showdowns','win_pair',
    'made_straight','made_flush','made_full_house','made_quads','made_straight_flush',
    'bluff_wins','big_pots','big_pots_50','seats_busted','triple_bust','short_stack_win',
    'powers_cast','leader_uses','keywords_distinct','keywords_today','keywords_week',
    'leaders_won_with','deep_wins','full_table_wins','podium_finishes','long_games']);
$function$;
revoke all on function public.is_match_stat(text) from public, anon, authenticated;

-- One rule with src/meta/cpuAccess.ts (guests never reach the server).
create or replace function public.can_play_cpu(p_uid uuid)
returns boolean language sql stable security definer set search_path to 'public' as $function$
  select coalesce((select role = 'creator' from profiles where id = p_uid), false);
$function$;
revoke all on function public.can_play_cpu(uuid) from public, anon, authenticated;

-- grant_xp emits `level` (absolute, so idempotent) for every XP source.
create or replace function public.grant_xp(p_uid uuid, p_amount integer)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_profile profiles%rowtype; v_new_level int; v_credits int := 0; v_vouchers int := 0; l int;
begin
  select * into v_profile from profiles where id = p_uid for update;
  if not found then return '{}'::jsonb; end if;
  v_new_level := greatest(v_profile.level, level_for_xp(v_profile.xp + p_amount));
  if v_new_level > v_profile.level then
    for l in (v_profile.level + 1)..v_new_level loop
      v_credits := v_credits + level_reward_credits();
      if l % 5 = 0 then v_vouchers := v_vouchers + 10; end if;
    end loop;
  end if;
  update profiles set xp = xp + p_amount, level = v_new_level,
    credits = credits + v_credits, vouchers = vouchers + v_vouchers, updated_at = now()
   where id = p_uid;
  perform track_stat(p_uid, 'level', v_new_level, true);
  return jsonb_build_object('xp', v_profile.xp + p_amount, 'level', v_new_level,
    'leveled_up', v_new_level > v_profile.level, 'credits_bonus', v_credits, 'vouchers_bonus', v_vouchers);
end; $function$;
revoke all on function public.grant_xp(uuid, integer) from public, anon, authenticated;

-- Move the zero-argument begin_match out of the API before creating the new one.
do $$
begin
  if to_regprocedure('public.begin_match()') is not null then
    if to_regprocedure('public.begin_match_legacy_v0()') is null then
      alter function public.begin_match() rename to begin_match_legacy_v0;
      revoke all on function public.begin_match_legacy_v0() from public, anon, authenticated;
    end if;
  end if;
  if to_regprocedure('public.record_match_placement(uuid, integer, integer, text)') is not null then
    if to_regprocedure('public.record_match_placement_legacy_v0(uuid, integer, integer, text)') is null then
      alter function public.record_match_placement(uuid, integer, integer, text)
        rename to record_match_placement_legacy_v0;
      revoke all on function public.record_match_placement_legacy_v0(uuid, integer, integer, text)
        from public, anon, authenticated;
    end if;
  end if;
end $$;

create or replace function public.begin_match(p_mode text default null, p_seats int default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_recent int;
  v_id uuid;
  v_now timestamptz := now();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not can_play_cpu(v_uid) then raise exception 'CPU matches are not open yet'; end if;
  if p_mode is not null and p_mode not in ('quick', 'standard', 'deep') then
    raise exception 'Unknown mode %', p_mode;
  end if;
  if p_seats is not null and (p_seats < 2 or p_seats > 6) then raise exception 'Seats must be 2 to 6'; end if;

  perform pg_advisory_xact_lock(hashtextextended('begin_match:' || v_uid::text, 0));

  select count(*) into v_recent
    from match_tickets
   where uid = v_uid and started_at > v_now - interval '1 hour';
  if v_recent >= 60 then
    raise exception 'Too many matches started recently';
  end if;

  -- One open ticket per account: earlier unredeemed ones are voided (kept for
  -- the hourly count; the daily prune job clears them).
  update match_tickets set voided_at = v_now
   where uid = v_uid and redeemed_at is null and voided_at is null;

  insert into match_tickets (uid, mode, seats) values (v_uid, p_mode, p_seats)
  returning match_id into v_id;
  return jsonb_build_object('match_id', v_id, 'started_at', v_now, 'mode', p_mode, 'seats', p_seats,
    'floor_seconds', case when p_mode is not null and p_seats is not null
                          then match_floor_seconds(p_mode, p_seats) end);
end;
$function$;
revoke all on function public.begin_match(text, int) from public, anon;
grant execute on function public.begin_match(text, int) to authenticated;

-- A non-negative int from p_stats, clamped to p_cap.
create or replace function public.match_stat_int(p_stats jsonb, p_key text, p_cap int)
returns int language sql immutable set search_path to 'public' as $function$
  select least(greatest(p_cap, 0), greatest(0, case
    when jsonb_typeof(p_stats -> p_key) = 'number' then floor((p_stats ->> p_key)::numeric)::int
    else 0 end));
$function$;
revoke all on function public.match_stat_int(jsonb, text, int) from public, anon, authenticated;

-- Track the per-match stats (§5 c.2). Only called on a full-rate payout.
create or replace function public.track_match_stats(
  p_uid uuid, p_stats jsonb, p_mode text, p_seats int, p_place int, p_hands int)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_won boolean := p_place = 1;
  v_hand_cap int := case p_mode when 'quick' then 40 when 'standard' then 80 else 120 end;
  v_n int;
  v_key text;
  v_kw text;
  v_leader text;
  v_day date := mission_period_start('daily');
  v_week date := mission_period_start('weekly');
  v_kw_allowed constant text[] := array[
    'Straddle','Kindle','Tax','Bounty','Roulette','Gambit','Windfall','Redraw','Foresee','Mimic',
    'Wild','Resonant','Bloom','Thriving','Bulwark','Fuse','Rerun','Soulbound','Ambush','Quickstrike',
    'Surge','Cut','Pass','Peek','Reveal','Mark','Call Out','Toll','Insurance','Siphon','Blessed',
    'Feint','Veil','Decoy','Needle','Bait','Exhume','Venomous','Burn','Erode','Lock','Snuff',
    'Entropic','Warded','Overbet','Tell','Boat Bonus','Last Stand'];
begin
  -- Server-only keys: derived from the ticket, never from p_stats.
  if v_won and p_mode = 'deep' and p_seats >= 4 then perform track_stat(p_uid, 'deep_wins', 1, false); end if;
  if v_won and p_seats = 6 then perform track_stat(p_uid, 'full_table_wins', 1, false); end if;
  if p_seats >= 4 and p_place <= 3 then perform track_stat(p_uid, 'podium_finishes', 1, false); end if;
  if p_mode in ('standard', 'deep') then perform track_stat(p_uid, 'long_games', 1, false); end if;

  if p_stats is null or jsonb_typeof(p_stats) <> 'object' then return; end if;
  if p_hands is not null then v_hand_cap := least(v_hand_cap, greatest(p_hands, 0)); end if;

  -- Per-hand counters: at most one per hand, and the mode's hand cap.
  foreach v_key in array array['hands_won','showdown_wins','strong_showdowns','win_pair',
                               'bluff_wins','powers_cast','leader_uses'] loop
    v_n := match_stat_int(p_stats, v_key, case when v_key = 'powers_cast' then v_hand_cap * 2 else v_hand_cap end);
    if v_n > 0 then perform track_stat(p_uid, v_key, v_n, false); end if;
  end loop;
  foreach v_key in array array['made_straight','made_flush','made_full_house'] loop
    v_n := match_stat_int(p_stats, v_key, 6);
    if v_n > 0 then perform track_stat(p_uid, v_key, v_n, false); end if;
  end loop;
  foreach v_key in array array['made_quads','made_straight_flush'] loop
    v_n := match_stat_int(p_stats, v_key, 1);
    if v_n > 0 then perform track_stat(p_uid, v_key, v_n, false); end if;
  end loop;
  foreach v_key in array array['big_pots','big_pots_50'] loop
    v_n := match_stat_int(p_stats, v_key, 5);
    if v_n > 0 then perform track_stat(p_uid, v_key, v_n, false); end if;
  end loop;
  v_n := match_stat_int(p_stats, 'seats_busted', p_seats - 1);
  if v_n > 0 then perform track_stat(p_uid, 'seats_busted', v_n, false); end if;
  if p_seats >= 4 and match_stat_int(p_stats, 'triple_bust', 1) > 0 then
    perform track_stat(p_uid, 'triple_bust', 1, false);
  end if;
  if v_won and (p_stats -> 'short_stack') = 'true'::jsonb then
    perform track_stat(p_uid, 'short_stack_win', 1, false);
  end if;

  -- Keywords resolved: distinct, allow-listed, at most 48.
  if jsonb_typeof(p_stats -> 'kw') = 'array' then
    for v_kw in
      select distinct k from jsonb_array_elements_text(p_stats -> 'kw') k
       where k = any (v_kw_allowed) limit 48
    loop
      if stat_once_claim(p_uid, 'kw:' || v_kw) then
        perform track_stat(p_uid, 'keywords_distinct', 1, false);
      end if;
      if stat_once_claim(p_uid, 'kwday:' || v_day || ':' || v_kw) then
        perform track_stat(p_uid, 'keywords_today', 1, false);
      end if;
      if stat_once_claim(p_uid, 'kwwk:' || v_week || ':' || v_kw) then
        perform track_stat(p_uid, 'keywords_week', 1, false);
      end if;
    end loop;
  end if;

  -- Distinct Leaders won with: must be a Leader the player owns.
  v_leader := case when jsonb_typeof(p_stats -> 'leader') = 'string' then p_stats ->> 'leader' end;
  if v_won and v_leader is not null and exists (
       select 1 from player_cards pc join cards c on c.id = pc.card_id
        where pc.user_id = p_uid and pc.card_id = v_leader and c.card_type = 'Leader'
          and pc.quantity + pc.foil_quantity > 0)
     and stat_once_claim(p_uid, 'leaderwin:' || v_leader) then
    perform track_stat(p_uid, 'leaders_won_with', 1, false);
  end if;
end;
$function$;
revoke all on function public.track_match_stats(uuid, jsonb, text, int, int, int) from public, anon, authenticated;

create or replace function public.record_match_placement(
  p_match_id uuid,
  p_place int,
  p_seats int,
  p_mode text,
  p_stats jsonb default null,
  p_hands int default null
)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_ticket match_tickets%rowtype;
  v_mode text;
  v_seats int;
  v_factor numeric;
  v_mult numeric;
  v_floor_seconds int;
  v_elapsed numeric;
  v_hands int;
  v_won boolean;
  v_reward int;
  v_xp int;
  v_bp_xp int;
  v_bp_xp_granted int := 0;
  v_profile profiles%rowtype;
  v_lvl jsonb;
  v_max_hours constant int := 6;
  v_daily_cap constant int := 100;
  v_full_rate_per_outcome constant int := 15;
  v_taper constant numeric := 0.25;
  v_paid_today int;
  v_same_outcome_today int;
  v_reduced boolean;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_match_id is null then
    raise exception 'Missing match ticket: call begin_match() when the match starts';
  end if;
  if not can_play_cpu(v_uid) then raise exception 'CPU matches are not open yet'; end if;

  select * into v_ticket from match_tickets where match_id = p_match_id and uid = v_uid for update;
  if not found or v_ticket.voided_at is not null then
    return jsonb_build_object('status', 'invalid', 'retryable', false);
  end if;
  if v_ticket.redeemed_at is not null then
    return jsonb_build_object('status', 'duplicate', 'retryable', false);
  end if;

  -- The ticket's mode and seats win (A21); a legacy ticket has none.
  v_mode := coalesce(v_ticket.mode, p_mode);
  v_seats := coalesce(v_ticket.seats, p_seats);
  if v_seats is null or v_seats < 2 or v_seats > 6 then raise exception 'Seats must be 2 to 6'; end if;
  if p_place is null or p_place < 1 or p_place > v_seats then raise exception 'Place must be 1 to seats'; end if;
  v_mult := case v_mode when 'quick' then 0.5 when 'standard' then 1 when 'deep' then 1.5 end;
  if v_mult is null then raise exception 'Unknown mode %', v_mode; end if;
  v_mult := v_mult * case v_seats when 2 then 0.55 when 3 then 0.7 when 4 then 0.8 when 5 then 0.9 else 1 end;

  v_floor_seconds := match_floor_seconds(v_mode, v_seats);
  v_elapsed := extract(epoch from now() - v_ticket.started_at);
  if v_elapsed < v_floor_seconds then
    -- Retryable: the ticket is untouched and pays once it is old enough.
    return jsonb_build_object('status', 'too_early', 'retryable', true,
      'retry_after', ceil(v_floor_seconds - v_elapsed)::int);
  end if;
  if v_elapsed > v_max_hours * 3600 then
    return jsonb_build_object('status', 'expired', 'retryable', false);
  end if;

  select count(*), count(*) filter (where won is not distinct from (p_place = 1))
    into v_paid_today, v_same_outcome_today
    from match_tickets
   where uid = v_uid and redeemed_at > now() - interval '24 hours';
  if v_paid_today >= v_daily_cap then
    return jsonb_build_object('status', 'capped', 'retryable', false);
  end if;
  v_reduced := v_same_outcome_today >= v_full_rate_per_outcome;

  v_won := p_place = 1;
  v_hands := case when p_hands is null then null
                  else least(greatest(p_hands, 0), floor(v_elapsed / 15)::int) end;

  update match_tickets
     set redeemed_at = now(), won = v_won, place = p_place, seats = v_seats, mode = v_mode
   where match_id = p_match_id;
  insert into match_receipts (match_id, uid) values (p_match_id, v_uid)
    on conflict (match_id) do nothing;

  -- F-5: a non-win before the minimum hand count pays nothing.
  if not v_won and v_hands is not null and v_hands < greatest(3 * v_seats, 8) then
    update profiles
       set losses = losses + 1, games_played = games_played + 1, last_match_at = now(), updated_at = now()
     where id = v_uid;
    return jsonb_build_object('status', 'too_short', 'retryable', false,
      'min_hands', greatest(3 * v_seats, 8));
  end if;

  v_factor := poker_place_factor(p_place, v_seats);
  v_reward := round(round((15 + 85 * v_factor), 2) * v_mult)::int;
  v_xp := round(round((10 + 50 * v_factor), 2) * v_mult)::int;
  v_bp_xp := round(round((8 + 42 * v_factor), 2) * v_mult)::int;

  if v_reduced then
    v_reward := greatest(1, round(v_reward * v_taper)::int);
    v_xp := greatest(1, round(v_xp * v_taper)::int);
    v_bp_xp := greatest(1, round(v_bp_xp * v_taper)::int);
  end if;

  update profiles
    set credits = credits + v_reward,
        wins = wins + case when v_won then 1 else 0 end,
        losses = losses + case when v_won then 0 else 1 end,
        games_played = games_played + 1,
        last_match_at = now(),
        updated_at = now()
    where id = v_uid;
  v_lvl := grant_xp(v_uid, v_xp);
  if grant_bp_xp(v_uid, v_bp_xp) then v_bp_xp_granted := v_bp_xp; end if;
  if not v_reduced then
    perform track_stat(v_uid, 'games_played', 1, false);
    if v_won then perform track_stat(v_uid, 'wins', 1, false); end if;
    perform track_match_stats(v_uid, p_stats, v_mode, v_seats, p_place, v_hands);
  end if;
  select * into v_profile from profiles where id = v_uid;
  return jsonb_build_object('reward', v_reward, 'credits', v_profile.credits,
    'vouchers', v_profile.vouchers,
    'wins', v_profile.wins, 'losses', v_profile.losses,
    'xp_gained', v_xp, 'xp', v_profile.xp, 'level', v_profile.level,
    'leveled_up', coalesce((v_lvl->>'leveled_up')::boolean, false),
    'level_credits_bonus', coalesce((v_lvl->>'credits_bonus')::int, 0),
    'level_vouchers_bonus', coalesce((v_lvl->>'vouchers_bonus')::int, 0),
    'bp_xp_gained', v_bp_xp_granted,
    'place', p_place, 'seats', v_seats, 'mode', v_mode,
    'reduced', v_reduced);
end;
$function$;
revoke all on function public.record_match_placement(uuid, int, int, text, jsonb, int) from public, anon;
grant execute on function public.record_match_placement(uuid, int, int, text, jsonb, int) to authenticated;

-- X6 / §5.1: the legacy win-flag RPC (45 s floor, no mode or seats) is out of the API.
do $$
begin
  if to_regprocedure('public.record_match_result(boolean, uuid)') is not null then
    revoke all on function public.record_match_result(boolean, uuid) from public, anon, authenticated;
  end if;
end $$;
