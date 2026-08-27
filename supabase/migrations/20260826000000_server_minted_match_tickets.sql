-- Report finding 1.3: record_match_result was entirely client-asserted. The
-- match ran client-side and the client told the server it won. The receipt
-- table stopped the SAME match being paid twice, but nothing stopped a loop
-- generating fresh UUIDs with p_won := true, and the publishable key ships in
-- the bundle. Every downstream system (Marketplace, Shops, Grading, Battle
-- Pass, achievements, missions) is denominated in that currency.
--
-- A full fix is server-authoritative matches (the PvP spike). This is the
-- structural half that does not need an engine on the server: the match id is
-- now MINTED BY THE SERVER at the start of a match and can only be redeemed
-- once, by the account it was issued to, after a plausible amount of wall
-- clock has passed. Reward throughput is therefore bounded by real time per
-- account rather than by loop speed.

create table if not exists public.match_tickets (
  match_id uuid primary key default gen_random_uuid(),
  uid uuid not null references auth.users (id) on delete cascade,
  started_at timestamptz not null default now(),
  redeemed_at timestamptz
);

alter table public.match_tickets enable row level security;
-- Deliberately no policies: this table is reachable only through the
-- SECURITY DEFINER functions below, like every other write in the app.

create index if not exists match_tickets_uid_started_idx
  on public.match_tickets (uid, started_at desc);

-- Mint a ticket for a match that is starting now.
create or replace function public.begin_match()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_recent int;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  -- Ceiling on tickets minted per hour. A human cannot start 60 matches in an
  -- hour; a script trying to farm ceilings out here rather than at payout.
  select count(*) into v_recent
    from match_tickets
   where uid = v_uid and started_at > now() - interval '1 hour';
  if v_recent >= 60 then
    raise exception 'Too many matches started recently';
  end if;

  insert into match_tickets (uid) values (v_uid) returning match_id into v_id;
  return jsonb_build_object('match_id', v_id, 'started_at', now());
end;
$function$;

revoke all on function public.begin_match() from public;
grant execute on function public.begin_match() to authenticated;

-- Redeem a ticket. Replaces the client-asserted match id.
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
  -- A real match averages ~20 turns and takes minutes. Anything claiming to
  -- have finished faster than this did not happen.
  v_min_seconds constant int := 45;
  -- Tickets expire, so one cannot be minted now and banked for a burst later.
  v_max_hours constant int := 6;
  v_paid_today int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_match_id is null then
    raise exception 'Missing match ticket: call begin_match() when the match starts';
  end if;

  -- Claim the ticket. The WHERE clause is the whole check: it must exist, be
  -- ours, be unredeemed, be old enough and not stale. A losing race (two
  -- concurrent redemptions of one ticket) updates zero rows.
  update match_tickets
     set redeemed_at = now()
   where match_id = p_match_id
     and uid = v_uid
     and redeemed_at is null
     and started_at <= now() - make_interval(secs => v_min_seconds)
     and started_at > now() - make_interval(hours => v_max_hours)
  returning started_at into v_started;

  if v_started is null then
    -- Either already redeemed (a retry after a lost reply — the old receipt
    -- behavior, which returned null) or not a valid claim. Both return null:
    -- the client cannot tell them apart and does not need to.
    return null;
  end if;

  -- Daily payout ceiling, independent of the per-hour minting ceiling.
  select count(*) into v_paid_today
    from match_tickets
   where uid = v_uid and redeemed_at > now() - interval '24 hours';
  if v_paid_today > 200 then
    return null;
  end if;

  -- Kept for the receipt trail; no longer the anti-replay mechanism.
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
  perform track_stat(v_uid, 'games_played', 1, false);
  if p_won then perform track_stat(v_uid, 'wins', 1, false); end if;
  perform track_stat(v_uid, 'level', (v_lvl->>'level')::int, true);
  select * into v_profile from profiles where id = v_uid;
  return jsonb_build_object('reward', v_reward, 'credits', v_profile.credits,
    'wins', v_profile.wins, 'losses', v_profile.losses,
    'xp_gained', v_xp, 'xp', v_profile.xp, 'level', v_profile.level,
    'leveled_up', coalesce((v_lvl->>'leveled_up')::boolean, false),
    'level_credits_bonus', coalesce((v_lvl->>'credits_bonus')::int, 0),
    'level_vouchers_bonus', coalesce((v_lvl->>'vouchers_bonus')::int, 0),
    'bp_xp_gained', v_bp_xp_granted);
end;
$function$;

-- Finding 1.3, second half: `deleteDeck` is the app's only direct table
-- mutation and relies on RLS rather than a SECURITY DEFINER RPC. The policy
-- was confirmed correct and is restated here so it is visible in the repo:
--
--   "own decks deletable" FOR DELETE USING ((SELECT auth.uid()) = user_id)
--   "own decks readable"  FOR SELECT USING ((SELECT auth.uid()) = user_id)
--
-- A caller can only delete rows they own. No change needed.
