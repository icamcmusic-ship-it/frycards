-- 2026-10-08, audit B4: the win flag is client-asserted, so cap what a
-- scripted client can earn.
--
-- Ticket checks (server-minted, >= 45 s old, <= 6 h old, one open ticket) stay
-- as they were, but 200 paid claims a day was still ~20,000 credits for a
-- script that always sends won = true. Now, in any rolling 24 hours:
--   * the first 15 wins and the first 15 losses pay in full;
--   * every further win or loss pays 25% of the credits, XP and Battle Pass XP
--     (and reports `reduced: true`), and no longer advances the win / games
--     played achievement and mission counters — otherwise the wins_250 /
--     games_200 achievements would still be farmable by a script;
--   * a hard ceiling of 100 paid claims a day (status 'capped'; the ticket is
--     not burnt), down from 200.
-- A person who plays 30+ matches a day is unaffected below the first limit and
-- still earns a quarter-rate trickle above it. profiles.wins / losses still
-- count every claim (they are display stats, not payouts).
--
-- The client contract is unchanged: same result keys ('reward' is the amount
-- actually paid) plus an additive `reduced` flag, and the same { status } for
-- an unpayable ticket (added in 20260929000001, M-2).
--
-- match_tickets.won records the claimed outcome so tomorrow's count can tell a
-- win from a loss. Historic rows stay null and count as neither.

alter table public.match_tickets add column if not exists won boolean;

create or replace function public.record_match_result(p_won boolean, p_match_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_reward int := case when p_won then 100 else 40 end;
  v_xp int := case when p_won then 60 else 25 end;
  v_bp_xp int := case when p_won then 50 else 20 end;
  v_bp_xp_granted int := 0;
  v_profile profiles%rowtype;
  v_lvl jsonb;
  v_started timestamptz;
  v_ticket match_tickets%rowtype;
  v_min_seconds constant int := 45;
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

  -- Daily ceiling, checked BEFORE the claim so hitting it does not consume
  -- the ticket. Wins and losses are tapered separately (a script would pick
  -- whichever pays more).
  select count(*),
         count(*) filter (where won is not distinct from p_won)
    into v_paid_today, v_same_outcome_today
    from match_tickets
   where uid = v_uid and redeemed_at > now() - interval '24 hours';
  if v_paid_today >= v_daily_cap then
    return jsonb_build_object('status', 'capped');
  end if;
  v_reduced := v_same_outcome_today >= v_full_rate_per_outcome;

  update match_tickets
     set redeemed_at = now(), won = p_won
   where match_id = p_match_id
     and uid = v_uid
     and redeemed_at is null
     and started_at <= now() - make_interval(secs => v_min_seconds)
     and started_at > now() - make_interval(hours => v_max_hours)
  returning started_at into v_started;

  if v_started is null then
    select * into v_ticket from match_tickets where match_id = p_match_id and uid = v_uid;
    return jsonb_build_object('status',
      case
        when not found then 'invalid'
        when v_ticket.redeemed_at is not null then 'duplicate'
        when v_ticket.started_at > now() - make_interval(secs => v_min_seconds) then 'too_early'
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
        wins = wins + case when p_won then 1 else 0 end,
        losses = losses + case when p_won then 0 else 1 end,
        games_played = games_played + 1,
        last_match_at = now(),
        updated_at = now()
    where id = v_uid;
  v_lvl := grant_xp(v_uid, v_xp);
  if grant_bp_xp(v_uid, v_bp_xp) then v_bp_xp_granted := v_bp_xp; end if;
  if not v_reduced then
    perform track_stat(v_uid, 'games_played', 1, false);
    if p_won then perform track_stat(v_uid, 'wins', 1, false); end if;
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
    'reduced', v_reduced);
end;
$function$;

revoke all on function public.record_match_result(boolean, uuid) from public, anon;
grant execute on function public.record_match_result(boolean, uuid) to authenticated;
