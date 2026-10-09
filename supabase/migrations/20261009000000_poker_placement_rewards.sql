-- 2026-10-09: FryCards Poker replaces the MTG-style game. Rewards are paid by
-- FINISHING PLACE at a 2–6 seat table instead of a win flag (Design Spec v0.1,
-- "Rewards"):
--
--   reward = round((40 + 60 × place factor) × mode multiplier)
--   XP     = round((25 + 35 × place factor) × mode multiplier)
--   BP XP  = round((20 + 30 × place factor) × mode multiplier)
--
--   seats  place factors, 1st to last
--     2    1.00, 0
--     3    1.00, 0.40, 0
--     4    1.00, 0.55, 0.15, 0
--     5    1.00, 0.60, 0.30, 0.10, 0
--     6    1.00, 0.60, 0.35, 0.15, 0.05, 0
--   mode multipliers: quick ×0.5, standard ×1, deep ×1.5
--
-- So a Standard win still pays 100 credits and last place 40, keeping the
-- marketplace, shops, grading and battle pass on the same currency. No reward
-- is ever tied to chips.
--
-- The ticket records the mode and seat count. Minimum match length is the
-- spec's recommended floor (half the mode's target: quick 6 min, standard 12,
-- deep 20) scaled by table size (seats / 6, never under 45 s), because a
-- heads-up freezeout is legitimately much shorter than a six-seat one — the
-- simulator's heads-up quick matches average about 5.5 minutes.
--
-- Placement is client-reported, exactly as the win flag was. The server-minted
-- ticket, its expiry, the daily taper (15 full-rate 1st places and 15 full-rate
-- other places per 24 h, then 25%) and the 100-claim ceiling from
-- 20261008000002 still bound the farming risk.
--
-- ADDITIVE: record_match_result(boolean, uuid) is left in place, so a client
-- that predates the swap keeps working, and the new client falls back to it
-- while this migration is not yet applied.

alter table public.match_tickets add column if not exists place int;
alter table public.match_tickets add column if not exists seats int;
alter table public.match_tickets add column if not exists mode text;

create or replace function public.poker_place_factor(p_place int, p_seats int)
returns numeric
language sql
immutable
set search_path to 'public'
as $function$
  select (case p_seats
    when 2 then array[1.00, 0]
    when 3 then array[1.00, 0.40, 0]
    when 4 then array[1.00, 0.55, 0.15, 0]
    when 5 then array[1.00, 0.60, 0.30, 0.10, 0]
    else        array[1.00, 0.60, 0.35, 0.15, 0.05, 0]
  end)[p_place]::numeric;
$function$;

create or replace function public.record_match_placement(
  p_match_id uuid,
  p_place int,
  p_seats int,
  p_mode text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_factor numeric;
  v_mult numeric;
  v_floor_seconds int;
  v_won boolean;
  v_reward int;
  v_xp int;
  v_bp_xp int;
  v_bp_xp_granted int := 0;
  v_profile profiles%rowtype;
  v_lvl jsonb;
  v_started timestamptz;
  v_ticket match_tickets%rowtype;
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
  if p_seats is null or p_seats < 2 or p_seats > 6 then raise exception 'Seats must be 2 to 6'; end if;
  if p_place is null or p_place < 1 or p_place > p_seats then raise exception 'Place must be 1 to seats'; end if;
  v_mult := case p_mode when 'quick' then 0.5 when 'standard' then 1 when 'deep' then 1.5 end;
  if v_mult is null then raise exception 'Unknown mode %', p_mode; end if;

  v_factor := poker_place_factor(p_place, p_seats);
  v_won := p_place = 1;
  v_reward := round((40 + 60 * v_factor) * v_mult)::int;
  v_xp := round((25 + 35 * v_factor) * v_mult)::int;
  v_bp_xp := round((20 + 30 * v_factor) * v_mult)::int;
  v_floor_seconds := greatest(45, round(
    (case p_mode when 'quick' then 360 when 'standard' then 720 else 1200 end) * p_seats / 6.0
  )::int);

  -- Daily ceiling, checked BEFORE the claim so hitting it does not consume the
  -- ticket. Firsts and other places are tapered separately.
  select count(*),
         count(*) filter (where won is not distinct from v_won)
    into v_paid_today, v_same_outcome_today
    from match_tickets
   where uid = v_uid and redeemed_at > now() - interval '24 hours';
  if v_paid_today >= v_daily_cap then
    return jsonb_build_object('status', 'capped');
  end if;
  v_reduced := v_same_outcome_today >= v_full_rate_per_outcome;

  update match_tickets
     set redeemed_at = now(), won = v_won, place = p_place, seats = p_seats, mode = p_mode
   where match_id = p_match_id
     and uid = v_uid
     and redeemed_at is null
     and started_at <= now() - make_interval(secs => v_floor_seconds)
     and started_at > now() - make_interval(hours => v_max_hours)
  returning started_at into v_started;

  if v_started is null then
    select * into v_ticket from match_tickets where match_id = p_match_id and uid = v_uid;
    return jsonb_build_object('status',
      case
        when not found then 'invalid'
        when v_ticket.redeemed_at is not null then 'duplicate'
        when v_ticket.started_at > now() - make_interval(secs => v_floor_seconds) then 'too_early'
        else 'expired'
      end);
  end if;

  if v_reduced then
    v_reward := greatest(1, round(v_reward * v_taper)::int);
    v_xp := greatest(1, round(v_xp * v_taper)::int);
    v_bp_xp := greatest(1, round(v_bp_xp * v_taper)::int);
  end if;

  insert into match_receipts (match_id, uid) values (p_match_id, v_uid)
    on conflict (match_id) do nothing;

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
  end if;
  perform track_stat(v_uid, 'level', (v_lvl->>'level')::int, true);
  select * into v_profile from profiles where id = v_uid;
  return jsonb_build_object('reward', v_reward, 'credits', v_profile.credits,
    'wins', v_profile.wins, 'losses', v_profile.losses,
    'xp_gained', v_xp, 'xp', v_profile.xp, 'level', v_profile.level,
    'leveled_up', coalesce((v_lvl->>'leveled_up')::boolean, false),
    'level_credits_bonus', coalesce((v_lvl->>'credits_bonus')::int, 0),
    'level_vouchers_bonus', coalesce((v_lvl->>'vouchers_bonus')::int, 0),
    'bp_xp_gained', v_bp_xp_granted,
    'place', p_place, 'seats', p_seats, 'mode', p_mode,
    'reduced', v_reduced);
end;
$function$;

revoke all on function public.record_match_placement(uuid, int, int, text) from public, anon;
grant execute on function public.record_match_placement(uuid, int, int, text) to authenticated;
revoke all on function public.poker_place_factor(int, int) from public, anon;
