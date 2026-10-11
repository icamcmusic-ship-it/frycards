-- 2026-10-11 audit §7: load and cost.
--
--   S1  The per-user profile / collection / inventory feeds move from
--       postgres_changes (the polled wal2json slot: ~70 % of all DB time) to
--       Database Broadcast. One statement-level trigger per table sends ONE
--       'changed' message per affected user per statement to the private
--       topic `user:<uid>`; RLS on realtime.messages lets a user read only
--       their own topic. The tables nobody subscribes to with postgres_changes
--       any more leave the publication.
--   S3  quicksell_many(p_items jsonb): bulk quicksell in one transaction.
--   S4  Partial indexes for the pack-draw query.
--   S9  The 5-minute settle cron is skipped when nothing is active.
--   S10 FK indexes; auth.uid() initplan in six policies, scoped to authenticated.
--   B4  sell_bounty_card spends a foil when every normal copy is reserved.
--
-- Idempotent.

-------------------------------------------------------------------------------
-- S1. Broadcast
-------------------------------------------------------------------------------
create or replace function public.notify_user_change()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid;
  v_col text := coalesce(TG_ARGV[0], 'user_id');
begin
  for v_uid in execute format('select distinct %I from changed_rows where %I is not null', v_col, v_col) loop
    begin
      perform realtime.send(jsonb_build_object('table', TG_TABLE_NAME), 'changed',
                            'user:' || v_uid::text, true);
    exception when others then
      -- Never let a notification failure roll back the write itself.
      null;
    end;
  end loop;
  return null;
end;
$function$;
revoke all on function public.notify_user_change() from public, anon, authenticated;

do $$
declare
  t record;
begin
  for t in select * from (values
      ('profiles', 'id'), ('player_cards', 'user_id'), ('player_inventory', 'user_id')) v(tbl, col)
  loop
    if not exists (select 1 from pg_trigger where tgname = t.tbl || '_notify_ins') then
      execute format('create trigger %I after insert on public.%I referencing new table as changed_rows '
                     'for each statement execute function public.notify_user_change(%L)',
                     t.tbl || '_notify_ins', t.tbl, t.col);
    end if;
    if not exists (select 1 from pg_trigger where tgname = t.tbl || '_notify_upd') then
      execute format('create trigger %I after update on public.%I referencing new table as changed_rows '
                     'for each statement execute function public.notify_user_change(%L)',
                     t.tbl || '_notify_upd', t.tbl, t.col);
    end if;
  end loop;
  -- The row-removal triggers for player_cards / player_inventory are in
  -- 20261011000090_pending_destructive.sql (applied by hand).
end $$;

-- Private channel: a signed-in user may receive only `user:<own uid>`.
do $$
begin
  if to_regclass('realtime.messages') is not null
     and not exists (select 1 from pg_policies where schemaname = 'realtime' and tablename = 'messages'
                       and policyname = 'user topic read own') then
    create policy "user topic read own" on realtime.messages
      for select to authenticated
      using (realtime.topic() = 'user:' || (select auth.uid())::text and extension = 'broadcast');
  end if;
end $$;

-- Tables with a postgres_changes subscriber stay; profiles, player_cards,
-- player_inventory (now broadcast) and decks (no subscriber) leave.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime set table
      public.friendships, public.trades, public.market_listings, public.player_shops,
      public.shop_listings, public.shop_purchases, public.serialized_supply, public.news_posts;
  end if;
end $$;

-------------------------------------------------------------------------------
-- S3. quicksell_many
-------------------------------------------------------------------------------
create or replace function public.quicksell_many(p_items jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_card_id text;
  v_qty int;
  v_foil boolean;
  v_card cards%rowtype;
  v_pc player_cards%rowtype;
  v_locked int;
  v_serialized int;
  v_new_qty int;
  v_new_foil int;
  v_price int;
  v_sold int := 0;
  v_total int := 0;
  v_per jsonb := '[]'::jsonb;
  v_credits int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nothing to sell';
  end if;
  if jsonb_array_length(p_items) > 200 then raise exception 'Too many lots in one sale (200 max)'; end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_card_id := v_item ->> 'card_id';
    v_qty := case when jsonb_typeof(v_item -> 'qty') = 'number' then (v_item ->> 'qty')::int end;
    v_foil := coalesce((v_item ->> 'foil')::boolean, false);
    if v_card_id is null or v_qty is null or v_qty < 1 then raise exception 'Invalid quantity'; end if;

    select * into v_card from cards where id = v_card_id;
    if not found then raise exception 'Unknown card'; end if;
    select * into v_pc from player_cards where user_id = v_uid and card_id = v_card_id for update;
    if not found then raise exception 'You do not own that card'; end if;
    if v_foil and v_pc.foil_quantity < v_qty then raise exception 'Not enough foil copies of %', v_card.name; end if;
    if not v_foil and v_pc.quantity < v_qty then raise exception 'Not enough copies of %', v_card.name; end if;

    if v_card.card_type = 'Leader' then
      select count(*) into v_locked from decks where user_id = v_uid and leader_id = v_card_id;
    else
      select count(*) into v_locked from decks, unnest(card_ids) as cid
       where decks.user_id = v_uid and cid = v_card_id;
    end if;
    v_new_qty := v_pc.quantity - case when v_foil then 0 else v_qty end;
    v_new_foil := v_pc.foil_quantity - case when v_foil then v_qty else 0 end;
    if v_new_qty + v_new_foil < v_locked then
      raise exception '% is in use by one of your decks — remove it before selling', v_card.name;
    end if;
    if not v_foil then
      select count(*) into v_serialized from player_serialized_cards
       where user_id = v_uid and card_id = v_card_id;
      if v_new_qty < v_serialized then
        raise exception 'You own a Serialized copy of % — it cannot be quick sold', v_card.name;
      end if;
    end if;

    v_price := card_sell_price(v_card.rarity);
    if v_foil then v_price := ceil(v_price * 2.5); end if;
    update player_cards set quantity = v_new_qty, foil_quantity = v_new_foil
     where user_id = v_uid and card_id = v_card_id;
    v_sold := v_sold + v_qty;
    v_total := v_total + v_price * v_qty;
    v_per := v_per || jsonb_build_object('card_id', v_card_id, 'foil', v_foil, 'sold', v_qty,
                                         'unit_price', v_price, 'total', v_price * v_qty);
  end loop;

  update profiles set credits = credits + v_total, updated_at = now() where id = v_uid
  returning credits into v_credits;
  perform track_stat(v_uid, 'cards_sold', v_sold, false);
  return jsonb_build_object('ok', true, 'credits', v_credits, 'sold', v_sold, 'total', v_total,
                            'per_item', v_per);
end;
$function$;
revoke all on function public.quicksell_many(jsonb) from public, anon;
grant execute on function public.quicksell_many(jsonb) to authenticated;

-------------------------------------------------------------------------------
-- B4. sell_bounty_card: a normal copy when one is spare, else a foil.
-------------------------------------------------------------------------------
create or replace function public.sell_bounty_card(p_card_id text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_date date := (now() at time zone 'utc')::date;
  v_ids text[];
  v_card cards%rowtype;
  v_pc player_cards%rowtype;
  v_sold_today int;
  v_price int;
  v_profile profiles%rowtype;
  v_locked int;
  v_serialized_reserved int;
  v_new_qty int;
  v_new_foil int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  v_ids := ensure_daily_bounties(v_date);
  if not (p_card_id = any(v_ids)) then raise exception 'That card is not in today''s bounty list'; end if;

  if exists (
    select 1 from player_bounty_activity
    where user_id = v_uid and bounty_date = v_date and card_id = p_card_id and action = 'bought'
  ) then
    raise exception 'You bought this card from the bounty shop today — it cannot be sold back';
  end if;
  if exists (
    select 1 from player_bounty_activity
    where user_id = v_uid and bounty_date = v_date and card_id = p_card_id and action = 'sold'
  ) then
    raise exception 'You already sold this bounty today (limit one per card)';
  end if;
  select count(*) into v_sold_today from player_bounty_activity
    where user_id = v_uid and bounty_date = v_date and action = 'sold';
  if v_sold_today >= 3 then raise exception 'Bounty shop limit reached — 3 sales per day'; end if;

  select * into v_pc from player_cards where user_id = v_uid and card_id = p_card_id for update;
  if not found or (v_pc.quantity + v_pc.foil_quantity) < 1 then
    raise exception 'You do not own that card';
  end if;

  select * into v_card from cards where id = p_card_id;

  if v_card.card_type = 'Leader' then
    select count(*) into v_locked
      from decks where decks.user_id = v_uid and decks.leader_id = p_card_id;
  else
    select count(*) into v_locked
      from decks, unnest(card_ids) as cid
      where decks.user_id = v_uid and cid = p_card_id;
  end if;
  select count(*) into v_serialized_reserved
    from player_serialized_cards where user_id = v_uid and card_id = p_card_id;

  -- Same two independent checks as quicksell_cards: total copies cover the
  -- deck locks, and normal copies cover the Serialized prints.
  if (v_pc.quantity + v_pc.foil_quantity - 1) < v_locked then
    raise exception 'That card is in use by one of your decks — remove it before selling';
  end if;
  if v_pc.quantity > 0 and v_pc.quantity - 1 >= v_serialized_reserved then
    v_new_qty := v_pc.quantity - 1;
    v_new_foil := v_pc.foil_quantity;
  elsif v_pc.foil_quantity > 0 then
    v_new_qty := v_pc.quantity;
    v_new_foil := v_pc.foil_quantity - 1;
  else
    raise exception 'You own a Serialized copy of that card — it cannot be sold to the bounty shop';
  end if;

  v_price := card_sell_price(v_card.rarity) * 5;

  update player_cards set quantity = v_new_qty, foil_quantity = v_new_foil
    where user_id = v_uid and card_id = p_card_id;

  insert into player_bounty_activity (user_id, bounty_date, card_id, action)
    values (v_uid, v_date, p_card_id, 'sold');

  update profiles set credits = credits + v_price, updated_at = now()
    where id = v_uid returning * into v_profile;
  perform track_stat(v_uid, 'cards_sold', 1, false);

  return jsonb_build_object('ok', true, 'credits', v_profile.credits, 'card_id', p_card_id, 'sold_for', v_price);
end;
$function$;
revoke all on function public.sell_bounty_card(text) from public, anon;
grant execute on function public.sell_bounty_card(text) to authenticated;

-------------------------------------------------------------------------------
-- S4. Pack-draw indexes (cards is ~300 rows; a plain build is instant)
-------------------------------------------------------------------------------
create index if not exists cards_draw_idx on public.cards (rarity, set_name) include (id)
  where card_type <> 'Leader';
create index if not exists cards_leader_draw_idx on public.cards (rarity, set_name) include (id)
  where card_type = 'Leader';

-------------------------------------------------------------------------------
-- S9. Skip the settle job when no listing is active
-------------------------------------------------------------------------------
do $$
declare v_job bigint;
begin
  if to_regclass('cron.job') is not null then
    select jobid into v_job from cron.job where jobname = 'settle-market-and-cpu-bidders';
    if v_job is not null then
      perform cron.alter_job(v_job, command :=
        'select public.settle_expired_listings() where exists (select 1 from public.market_listings where status = ''active'')');
    end if;
  end if;
end $$;

-------------------------------------------------------------------------------
-- S10. Unindexed foreign keys; initplan-friendly policies for authenticated only
-------------------------------------------------------------------------------
create index if not exists graded_cards_card_id_idx on public.graded_cards (card_id);
create index if not exists player_wishlist_card_id_idx on public.player_wishlist (card_id);
create index if not exists shop_customers_listing_id_idx on public.shop_customers (listing_id);
create index if not exists shop_customers_offer_card_id_idx on public.shop_customers (offer_card_id);

do $$
declare p record;
begin
  for p in select * from (values
      ('player_wishlist', 'own wishlist read',          'using',      'user_id = (select auth.uid())'),
      ('player_wishlist', 'own wishlist insert',        'with check', 'user_id = (select auth.uid())'),
      ('bingo_cards',     'own bingo read',             'using',      'user_id = (select auth.uid())'),
      ('graded_cards',    'graded_cards_select_own',    'using',      '(select auth.uid()) = user_id'),
      ('shop_customers',  'owner reads own customers',  'using',      'owner = (select auth.uid())')
    ) v(tbl, pol, kind, expr)
  loop
    if exists (select 1 from pg_policies where schemaname = 'public' and tablename = p.tbl and policyname = p.pol) then
      execute format('alter policy %I on public.%I to authenticated %s (%s)', p.pol, p.tbl, p.kind, p.expr);
    end if;
  end loop;
end $$;
-- The wishlist row-removal policy gets the same rewrite in
-- 20261011000090_pending_destructive.sql.
