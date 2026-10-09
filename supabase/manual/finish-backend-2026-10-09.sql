-- supabase/manual/finish-backend-2026-10-09.sql
--
-- The backend changes that could not be applied through the Supabase MCP tool,
-- because it asks for confirmation on any statement containing DROP or DELETE
-- and the confirmation never arrives. Paste this whole file into the Supabase
-- SQL editor for project dnngihsbqxccqvvedvjc and run it once. It is idempotent
-- and every statement was reviewed against the live definitions on 2026-10-09
-- (see docs/BACKEND_PENDING.md). It does NOT include the claim_bingo week guard
-- (20261008000006): the bingo panel already checks the week on the client.
--
-- Contents, in order:
--   1. begin_match()   one open match ticket per account            (audit H-2)
--   2. reset_account() Settings > Reset Account; refuses while you hold the
--                      high bid on an active auction                (audit B2)
--   3. CPU bidders' hidden ceiling moves to a private table, and
--      settle_expired_listings() becomes cron-only                  (audit B5/B7)
--   4. drops the superseded one-argument draw helpers

begin;

-- ---------------------------------------------------------------------------
-- 4. begin_match (H-2): one open ticket per account, serialised per account.
--    Starting a match retires the account's previous unredeemed ticket.
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

revoke all on function public.begin_match() from public, anon;
grant execute on function public.begin_match() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. reset_account (20260830 + H-3 from 20260929000000), with B2.
--
-- B2: the 20260929 version zeroed the wallet (credits = 1500) without looking
-- at auctions the player was HIGH BIDDER on. place_bid escrows the bid out of
-- the bidder's wallet and refunds it when someone outbids, so: bid 49k, reset,
-- get outbid, and the 49k lands on top of the fresh 1.5k, every 7 days. The
-- reset now refuses while the caller holds the high bid on any active
-- listing. Other escrows are unwound by the calls below: listings (cancel),
-- the shop and its slot collateral (close_shop), pending trades (cancel /
-- decline). Purchases (packs, mystery packs, shop listings) are instantaneous
-- and hold nothing back.
--
-- The profile row is locked first, and place_bid / the CPU refund both need
-- that lock to pay a bidder back, so the check below cannot race a refund.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists last_account_reset_at timestamptz;

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

  -- B2: the credits behind a standing high bid are in escrow.
  if exists (
    select 1 from market_listings where current_bidder = v_uid and status = 'active'
  ) then
    raise exception 'You are the highest bidder on an active auction — let it end, or wait to be outbid, before resetting';
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
  -- player_inventory are deliberately kept (see 20260929000000, H-3).
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
    showcase_slabs = '{}',
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

revoke all on function public.reset_account() from public, anon;
grant execute on function public.reset_account() to authenticated;


-- ---------------------------------------------------------------------------
-- 3. (20261008000004)
-- ---------------------------------------------------------------------------
-- 2026-10-08, audit B5 and B7.
--
-- B5. market_listings.cpu_ceiling is the CPU collector's hidden maximum bid,
-- and the table is readable by every signed-in player (select('*') and the
-- realtime feed both carry it), so anyone could bid exactly to it. The CPU's
-- private bookkeeping (ceiling and next-action time) moves to a side table
-- that no API role can read. The two market_listings columns are emptied but
-- not dropped (a later migration can drop them once nothing reads them);
-- cpu_leading and cpu_bidder_name stay, the client shows those.
--
-- B7. settle_expired_listings() is the 5-minute pg_cron job (it runs as
-- postgres), but any signed-in player could also call it, and the client did
-- on every Marketplace load. EXECUTE is revoked from the API roles; the cron
-- job is unaffected. place_bid and buy_listing already reject a listing past
-- ends_at, so a listing that has expired but not yet been swept (up to five
-- minutes) cannot be traded.

create table if not exists public.market_listing_cpu (
  listing_id uuid primary key references public.market_listings(id) on delete cascade,
  cpu_ceiling int,
  cpu_next_at timestamptz
);
alter table public.market_listing_cpu enable row level security;
revoke all on table public.market_listing_cpu from public, anon, authenticated;

-- Carry over what the CPU already decided for open auctions.
insert into public.market_listing_cpu (listing_id, cpu_ceiling, cpu_next_at)
select id, cpu_ceiling, cpu_next_at from public.market_listings
 where status = 'active' and (cpu_ceiling is not null or cpu_next_at is not null)
on conflict (listing_id) do nothing;

create or replace function public.run_cpu_bidders()
returns integer language plpgsql security definer set search_path to 'public' as $function$
declare
  v_l market_listings%rowtype;
  v_ceiling int;
  v_ends timestamptz;
  v_rarity text;
  v_unit int;
  v_min int;
  v_bid int;
  v_acted int := 0;
begin
  for v_l in
    select m.* from market_listings m
      left join market_listing_cpu c on c.listing_id = m.id
     where m.status = 'active' and m.listing_type = 'auction' and m.ends_at > now()
       and (c.cpu_next_at is null or c.cpu_next_at <= now()) and not m.cpu_leading
     order by m.ends_at limit 40
     for update of m skip locked
  loop
    select cpu_ceiling into v_ceiling from market_listing_cpu where listing_id = v_l.id;
    if v_ceiling is null then
      select rarity into v_rarity from cards where id = v_l.card_id;
      v_unit := card_sell_price(v_rarity);
      if v_l.foil then v_unit := ceil(v_unit * 2.5)::int; end if;
      -- The CPU ignores auctions that open above quicksell value: a high
      -- starting bid would otherwise let the seller filter out every
      -- lowball collector and keep only the generous ones.
      if v_l.price > v_unit * v_l.quantity then
        v_ceiling := 0;
      else
        v_ceiling := greatest(1, round(v_unit * v_l.quantity * cpu_ceiling_factor(
          v_l.seller::text || '|' || v_l.card_id || '|' || v_l.foil::text || '|' ||
          (now() at time zone 'utc')::date::text))::int);
      end if;
      insert into market_listing_cpu (listing_id, cpu_ceiling) values (v_l.id, v_ceiling)
        on conflict (listing_id) do update set cpu_ceiling = excluded.cpu_ceiling;
    end if;

    v_min := case when v_l.current_bid is null then v_l.price
                  else v_l.current_bid + greatest(1, ceil(v_l.current_bid * 0.05)::int) end;

    if v_min <= v_ceiling
       and (v_l.buyout is null or v_min < v_l.buyout)
       and (select count(*) from market_listings
             where seller = v_l.seller and status = 'sold' and cpu_bidder_name is not null
               and current_bidder is null and ends_at > now() - interval '24 hours') < 8
    then
      v_bid := least(v_ceiling, v_min + floor(v_min * random() * 0.15)::int);
      if v_l.buyout is not null then v_bid := least(v_bid, v_l.buyout - 1); end if;
      v_bid := greatest(v_bid, v_min);
      -- refund whichever human the CPU just outbid
      if v_l.current_bidder is not null then
        update profiles set credits = credits + v_l.current_bid, updated_at = now()
         where id = v_l.current_bidder;
      end if;
      update market_listings
         set current_bid = v_bid, current_bidder = null, cpu_leading = true,
             cpu_bidder_name = coalesce(cpu_bidder_name, cpu_persona_name()),
             bid_count = bid_count + 1,
             ends_at = greatest(ends_at, now() + interval '5 minutes')
       where id = v_l.id
       returning ends_at into v_ends;
      v_acted := v_acted + 1;
    else
      v_ends := v_l.ends_at;
    end if;

    insert into market_listing_cpu (listing_id, cpu_next_at)
    values (v_l.id, now() + case
             when v_ends - now() < interval '15 minutes' then interval '5 minutes'
             else make_interval(mins => 10 + floor(random() * 50)::int) end)
    on conflict (listing_id) do update set cpu_next_at = excluded.cpu_next_at;
  end loop;

  -- Settled and cancelled auctions no longer need their bookkeeping.
  delete from market_listing_cpu c
   using market_listings m
   where m.id = c.listing_id and m.status <> 'active';
  return v_acted;
end;
$function$;
revoke all on function public.run_cpu_bidders() from public, anon, authenticated;

-- The hidden values now live only in the side table.
update public.market_listings set cpu_ceiling = null, cpu_next_at = null
 where cpu_ceiling is not null or cpu_next_at is not null;

-- B7: cron-only.
revoke execute on function public.settle_expired_listings() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The one-argument draw helpers are superseded (grant_pack_contents calls
--    the two-argument versions). Nothing references them.
-- ---------------------------------------------------------------------------
drop function if exists public.random_card_of_rarity(text);
drop function if exists public.random_leader_of_rarity(text);

commit;
