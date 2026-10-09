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
    raise exception 'You can reset your account once every 7 days - next reset available %',
      to_char(v_profile.last_account_reset_at + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  if exists (
    select 1 from market_listings where seller = v_uid and status = 'active' and bid_count > 0
  ) then
    raise exception 'You have an active auction with a bid on it - let it end before resetting';
  end if;

  if exists (
    select 1 from market_listings where current_bidder = v_uid and status = 'active'
  ) then
    raise exception 'You are the highest bidder on an active auction - let it end, or wait to be outbid, before resetting';
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
