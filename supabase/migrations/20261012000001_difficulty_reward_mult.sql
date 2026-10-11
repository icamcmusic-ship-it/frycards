-- 2026-10-12 audit 2026-10-11 §3 S-2: difficulty reward multiplier.
--
-- begin_match takes p_difficulty ('easy' | 'normal' | 'hard', optional) and
-- records it on the ticket. record_match_placement reads it from the ticket
-- (never from the claim) and scales the CREDIT reward only: Easy x0.8,
-- Normal x1, Hard x1.15, applied before the daily taper. XP and battle-pass XP
-- stay flat. A ticket with no difficulty (older clients) pays x1.
-- Mirrored in src/game/poker/rewards.ts (DIFFICULTY_REWARD_MULT).
--
-- Idempotent. The two-argument begin_match is renamed out of the API (no
-- destructive statement) so calls by name stay unambiguous.

alter table public.match_tickets add column if not exists difficulty text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'match_tickets_difficulty_check') then
    alter table public.match_tickets add constraint match_tickets_difficulty_check
      check (difficulty is null or difficulty in ('easy', 'normal', 'hard'));
  end if;
  if to_regprocedure('public.begin_match(text, integer)') is not null then
    if to_regprocedure('public.begin_match_legacy_v1(text, integer)') is null then
      alter function public.begin_match(text, integer) rename to begin_match_legacy_v1;
    end if;
  end if;
  if to_regprocedure('public.begin_match_legacy_v1(text, integer)') is not null then
    revoke all on function public.begin_match_legacy_v1(text, integer) from public, anon, authenticated;
  end if;
end $$;

create or replace function public.begin_match(p_mode text default null, p_seats int default null,
                                              p_difficulty text default null)
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
  if p_difficulty is not null and p_difficulty not in ('easy', 'normal', 'hard') then
    raise exception 'Unknown difficulty %', p_difficulty;
  end if;

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

  insert into match_tickets (uid, mode, seats, difficulty) values (v_uid, p_mode, p_seats, p_difficulty)
  returning match_id into v_id;
  return jsonb_build_object('match_id', v_id, 'started_at', v_now, 'mode', p_mode, 'seats', p_seats,
    'difficulty', p_difficulty,
    'floor_seconds', case when p_mode is not null and p_seats is not null
                          then match_floor_seconds(p_mode, p_seats) end);
end;
$function$;
revoke all on function public.begin_match(text, int, text) from public, anon;
grant execute on function public.begin_match(text, int, text) to authenticated;

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
  v_diff_mult numeric;
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
  -- S-2: difficulty scales credits only (XP stays flat). Read from the ticket,
  -- never from the claim; a ticket without one (older clients) pays x1.
  v_diff_mult := case v_ticket.difficulty when 'easy' then 0.8 when 'hard' then 1.15 else 1 end;
  v_reward := round(v_reward * v_diff_mult)::int;
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
    'difficulty', coalesce(v_ticket.difficulty, 'normal'),
    'reduced', v_reduced);
end;
$function$;
revoke all on function public.record_match_placement(uuid, int, int, text, jsonb, int) from public, anon;
grant execute on function public.record_match_placement(uuid, int, int, text, jsonb, int) to authenticated;
