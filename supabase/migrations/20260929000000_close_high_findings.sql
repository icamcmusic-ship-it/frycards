-- Audit 2026-09-29, section 1, High findings H-1, H-2 and H-3.
--
-- NOT YET APPLIED. The live project was unreachable while this was written, so
-- the live function bodies could not be diffed against the repo. Read the
-- queries at the bottom, run them against production first, and apply on a
-- branch (`create_branch`) before merging.

-- ---------------------------------------------------------------------------
-- H-1. Internal helpers that take a uid must not be client-callable.
--
-- `create or replace function` keeps whatever ACL a function already had, and
-- none of the migrations in this repo revokes EXECUTE on these helpers. If
-- `authenticated` holds it, any signed-in user can call e.g.
-- grant_pack_contents(<own uid>, <hand-built pack_types json>) or
-- grant_xp(<own uid>, ...). Every legitimate caller is another SECURITY
-- DEFINER function, which runs as the function owner and keeps EXECUTE, so
-- revoking from the API roles changes nothing for players. Matched by name so
-- every overload is covered.
-- ---------------------------------------------------------------------------
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in (
         'grant_pack_contents', 'grant_xp', 'grant_bp_xp',
         'track_stat', 'grant_inventory_pack'
       )
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- H-2. begin_match: one open ticket per account, serialized.
--
-- The old count-then-insert was racy (concurrent calls each saw < 60) and let a
-- script mint 60 independent tickets at t=0, wait 46 seconds and redeem them
-- all, so "reward throughput is bounded by wall clock" was false. Now a new
-- ticket retires any unredeemed one the account still holds, and the check is
-- serialized per account, so redemptions are at least min-age apart.
--
-- What this does not do: `p_won` is still asserted by the client. Until
-- matches are server-authoritative, a win payout can be forged at up to one
-- per 45 s and 200 per day per account. Deciding whether to pay wins and
-- losses the same is a design call, left to the caller.
-- ---------------------------------------------------------------------------
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

  perform pg_advisory_xact_lock(hashtextextended('begin_match:' || v_uid::text, 0));

  select count(*) into v_recent
    from match_tickets
   where uid = v_uid and started_at > now() - interval '1 hour';
  if v_recent >= 60 then
    raise exception 'Too many matches started recently';
  end if;

  -- One open ticket per account: starting a match retires the previous
  -- unredeemed one (an abandoned match, or a re-mint after a token refresh).
  delete from match_tickets where uid = v_uid and redeemed_at is null;

  insert into match_tickets (uid) values (v_uid) returning match_id into v_id;
  return jsonb_build_object('match_id', v_id, 'started_at', now());
end;
$function$;

revoke all on function public.begin_match() from public;
grant execute on function public.begin_match() to authenticated;

-- ---------------------------------------------------------------------------
-- H-3. reset_account must not re-open rewards that were already paid.
--
-- The previous version deleted player_achievements (so claimed achievements
-- could be earned and paid again from the untouched player_stats counters),
-- reset xp and level to 1 (re-opening level-up bonuses), granted a fresh Deck
-- Box on every reset, and deleted cosmetics and packs that Battle Pass claims
-- had paid out while keeping claimed_tiers, so those rewards were lost for
-- good. Now:
--   - player_achievements, xp, level, player_cosmetics and player_inventory
--     are kept;
--   - the Deck Box is granted only on an account's first reset.
-- Everything else is unchanged from 20260830000000.
-- ---------------------------------------------------------------------------
create or replace function public.reset_account()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_profile profiles%rowtype;
  v_listing market_listings%rowtype;
  v_trade trades%rowtype;
  v_deck_box_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select * into v_profile from profiles where id = v_uid for update;
  if not found then raise exception 'Profile not found'; end if;

  if v_profile.role <> 'creator' and v_profile.last_account_reset_at is not null
     and v_profile.last_account_reset_at > now() - interval '7 days' then
    raise exception 'You can reset your account once every 7 days — next reset available %',
      to_char(v_profile.last_account_reset_at + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  if exists (
    select 1 from market_listings where seller = v_uid and status = 'active' and bid_count > 0
  ) then
    raise exception 'You have an active auction with a bid on it — let it end before resetting';
  end if;

  for v_listing in
    select * from market_listings where seller = v_uid and status = 'active' for update
  loop
    perform cancel_listing(v_listing.id);
  end loop;

  if exists (select 1 from player_shops where owner = v_uid and status <> 'dormant') then
    perform close_shop();
  end if;

  for v_trade in select * from trades where proposer = v_uid and status = 'pending' for update loop
    perform cancel_trade(v_trade.id);
  end loop;
  for v_trade in select * from trades where recipient = v_uid and status = 'pending' for update loop
    perform respond_trade(v_trade.id, false);
  end loop;

  -- The collection and decks. player_achievements, player_cosmetics and
  -- player_inventory are deliberately kept (see the header).
  delete from player_cards where user_id = v_uid;
  delete from player_serialized_cards where user_id = v_uid;
  delete from decks where user_id = v_uid;
  delete from graded_cards where user_id = v_uid;
  delete from friendships where requester = v_uid or addressee = v_uid;
  delete from mystery_pack_templates where owner = v_uid;
  delete from trades where proposer = v_uid and status in ('cancelled', 'declined');
  delete from market_listings where seller = v_uid and status = 'cancelled';

  update profiles set
    credits = 1500,
    vouchers = 25,
    wins = 0,
    losses = 0,
    games_played = 0,
    showcase_cards = '{}',
    equipped_card_back = null,
    equipped_banner = null,
    equipped_avatar = null,
    last_match_at = null,
    last_account_reset_at = now(),
    updated_at = now()
  where id = v_uid;

  -- Same Deck Box a new account gets, once: a first reset lands the player
  -- where signing up would, and later resets do not mint another.
  if v_profile.last_account_reset_at is null then
    select id into v_deck_box_id from pack_types
      where acquisition = 'deck_box_grant' and is_active limit 1;
    if v_deck_box_id is not null then
      perform grant_inventory_pack(v_uid, v_deck_box_id, 1);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'reset_at', now());
end;
$function$;

revoke all on function public.reset_account() from public;
grant execute on function public.reset_account() to authenticated;

-- ---------------------------------------------------------------------------
-- Run against production BEFORE applying (read-only):
--
--   -- H-1: which helpers can the API roles execute today?
--   select p.oid::regprocedure, has_function_privilege('authenticated', p.oid, 'execute') as authed,
--          has_function_privilege('anon', p.oid, 'execute') as anon
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('grant_pack_contents','grant_xp','grant_bp_xp','track_stat','grant_inventory_pack');
--
--   -- H-2/H-3: diff the live bodies against this file before replacing them.
--   select pg_get_functiondef('public.begin_match()'::regprocedure);
--   select pg_get_functiondef('public.reset_account()'::regprocedure);
-- ---------------------------------------------------------------------------
