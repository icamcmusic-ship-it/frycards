-- Store: daily pack deal + limited-time colour packs.  Idempotent.
--
-- 1. pack_types gains `available_until` (a limited-time pack stops selling at
--    that instant; the Store shows "LEAVING IN 3D") and `allowed_colors`
--    (a colour pack draws ~75% of its cards from these colours).
-- 2. daily_pack_deals(): one purchasable pack per UTC day at 15% off, picked
--    deterministically from the date, so every player sees the same deal and
--    it rotates at UTC midnight.
-- 3. pack_effective_price(): the ONE place a pack's price is computed; every
--    buy RPC charges it, so the discount is enforced server-side.
-- 4. open_pack / buy_and_open_packs / buy_pack_to_inventory charge the
--    effective price and refuse a limited pack past its end.
-- 5. grant_pack_contents biases draws toward `allowed_colors`.
-- 6. Seven colour packs (Ember … Void), inserted INACTIVE so nothing goes live
--    before its art exists. Activate one with:
--      update pack_types set is_active = true,
--        available_until = now() + interval '7 days'
--      where name = 'Ember Pack';

alter table public.pack_types add column if not exists available_until timestamptz;
alter table public.pack_types add column if not exists allowed_colors text[];

create or replace function public.daily_pack_deals(p_day date default (now() at time zone 'utc')::date)
returns table (pack_id uuid, pct int, ends_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, 15,
    ((p_day + 1)::timestamp at time zone 'utc')
  from pack_types p
  where p.is_active and p.acquisition = 'purchase'
    and (p.price_credits is not null or coalesce(p.price_vouchers, 0) > 0)
    and (p.available_until is null or p.available_until > now())
  order by md5(p.id::text || p_day::text)
  limit 1
$$;

create or replace function public.pack_effective_price(p_pack pack_types, p_cur text)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_base int := case when p_cur = 'credits' then p_pack.price_credits else p_pack.price_vouchers end;
  v_pct int;
begin
  if v_base is null then return null; end if;
  select d.pct into v_pct from daily_pack_deals() d where d.pack_id = p_pack.id;
  if v_pct is null or v_base = 0 then return v_base; end if;
  return greatest(1, round(v_base * (100 - v_pct) / 100.0)::int);
end $$;

create or replace function public.open_pack(p_pack_id uuid, p_currency text default 'credits')
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_cur text := normalize_currency(p_currency);
  v_pack pack_types%rowtype;
  v_profile profiles%rowtype;
  v_price int;
  v_grant jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if v_cur is null then raise exception 'Unknown currency %', p_currency; end if;
  select * into v_pack from pack_types where id = p_pack_id;
  if not found then raise exception 'Unknown pack'; end if;
  if not v_pack.is_active then raise exception 'This pack is no longer available'; end if;
  if v_pack.available_until is not null and v_pack.available_until <= now() then
    raise exception 'This pack is no longer available'; end if;
  if v_pack.acquisition <> 'purchase' then raise exception 'This pack cannot be purchased directly'; end if;

  select * into v_profile from profiles where id = v_uid for update;
  if not found then raise exception 'No profile'; end if;

  v_price := pack_effective_price(v_pack, v_cur);
  if v_cur = 'credits' then
    if v_price is null then raise exception 'This pack cannot be bought with credits'; end if;
    if v_profile.credits < v_price then raise exception 'Not enough credits'; end if;
    update profiles set credits = credits - v_price, updated_at = now() where id = v_uid;
  else
    if v_price is null then raise exception 'This pack cannot be bought with vouchers'; end if;
    if v_profile.vouchers < v_price then raise exception 'Not enough vouchers'; end if;
    update profiles set vouchers = vouchers - v_price, updated_at = now() where id = v_uid;
  end if;

  v_grant := grant_pack_contents(v_uid, v_pack);
  perform track_pack_open(v_uid);
  select * into v_profile from profiles where id = v_uid;
  return v_grant || jsonb_build_object('credits', v_profile.credits, 'vouchers', v_profile.vouchers,
    'price_paid', v_price);
end;
$function$;

create or replace function public.buy_and_open_packs(p_pack_id uuid, p_count integer, p_currency text default 'credits')
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_cur text := normalize_currency(p_currency);
  v_pack pack_types%rowtype;
  v_profile profiles%rowtype;
  v_price int;
  v_total_price int;
  v_all jsonb := '[]'::jsonb;
  v_credits_gained int := 0;
  v_grant jsonb;
  v_i int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if v_cur is null then raise exception 'Unknown currency %', p_currency; end if;
  if p_count is null or p_count < 1 or p_count > 24 then raise exception 'Open between 1 and 24 packs at a time'; end if;
  select * into v_pack from pack_types where id = p_pack_id;
  if not found then raise exception 'Unknown pack'; end if;
  if not v_pack.is_active then raise exception 'This pack is no longer available'; end if;
  if v_pack.available_until is not null and v_pack.available_until <= now() then
    raise exception 'This pack is no longer available'; end if;
  if v_pack.acquisition <> 'purchase' then raise exception 'This pack cannot be purchased directly'; end if;

  select * into v_profile from profiles where id = v_uid for update;
  if not found then raise exception 'No profile'; end if;

  v_price := pack_effective_price(v_pack, v_cur);
  if v_cur = 'credits' then
    if v_price is null then raise exception 'This pack cannot be bought with credits'; end if;
    v_total_price := v_price * p_count;
    if v_profile.credits < v_total_price then raise exception 'Not enough credits'; end if;
    update profiles set credits = credits - v_total_price, updated_at = now() where id = v_uid;
  else
    if v_price is null then raise exception 'This pack cannot be bought with vouchers'; end if;
    v_total_price := v_price * p_count;
    if v_profile.vouchers < v_total_price then raise exception 'Not enough vouchers'; end if;
    update profiles set vouchers = vouchers - v_total_price, updated_at = now() where id = v_uid;
  end if;

  for v_i in 1..p_count loop
    v_grant := grant_pack_contents(v_uid, v_pack);
    v_all := v_all || (v_grant->'cards');
    v_credits_gained := v_credits_gained + coalesce((v_grant->>'credits_gained')::int, 0);
    perform track_pack_open(v_uid);
  end loop;

  select * into v_profile from profiles where id = v_uid;
  return jsonb_build_object('cards', v_all, 'credits_gained', v_credits_gained, 'packs_opened', p_count,
    'credits', v_profile.credits, 'vouchers', v_profile.vouchers, 'price_paid', v_total_price);
end;
$function$;

create or replace function public.buy_pack_to_inventory(p_pack_id uuid, p_currency text default 'credits', p_quantity integer default 1)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_cur text := normalize_currency(p_currency);
  v_pack pack_types%rowtype;
  v_profile profiles%rowtype;
  v_price int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if v_cur is null then raise exception 'Unknown currency %', p_currency; end if;
  if p_quantity is null or p_quantity < 1 or p_quantity > 50 then raise exception 'Invalid quantity'; end if;
  select * into v_pack from pack_types where id = p_pack_id;
  if not found then raise exception 'Unknown pack'; end if;
  if not v_pack.is_active then raise exception 'This pack is no longer available'; end if;
  if v_pack.available_until is not null and v_pack.available_until <= now() then
    raise exception 'This pack is no longer available'; end if;
  if v_pack.acquisition <> 'purchase' then raise exception 'This pack cannot be purchased directly'; end if;
  select * into v_profile from profiles where id = v_uid for update;
  if not found then raise exception 'No profile'; end if;

  v_price := pack_effective_price(v_pack, v_cur);
  if v_price is null then raise exception 'This pack cannot be bought with %', v_cur; end if;
  v_price := v_price * p_quantity;
  if v_cur = 'credits' then
    if v_profile.credits < v_price then raise exception 'Not enough credits'; end if;
    update profiles set credits = credits - v_price, updated_at = now() where id = v_uid;
  else
    if v_profile.vouchers < v_price then raise exception 'Not enough vouchers'; end if;
    update profiles set vouchers = vouchers - v_price, updated_at = now() where id = v_uid;
  end if;

  perform grant_inventory_pack(v_uid, p_pack_id, p_quantity);
  select * into v_profile from profiles where id = v_uid;
  return jsonb_build_object('ok', true, 'quantity', p_quantity,
    'credits', v_profile.credits, 'vouchers', v_profile.vouchers, 'price_paid', v_price);
end;
$function$;

-- Colour-biased draw: same rarity and set rules as random_card_of_rarity,
-- restricted to cards sharing a colour; null when none exist (the caller
-- then keeps its ordinary draw).
create or replace function public.random_card_of_rarity_in_colors(p_rarity text, p_sets text[], p_colors text[])
returns text language sql volatile set search_path = public as $$
  select id from cards
  where rarity = p_rarity and card_type <> 'Leader'
    and (p_sets is null or set_name = any(p_sets))
    and essence_types && p_colors
  order by random() limit 1
$$;

create or replace function public.grant_pack_contents(p_uid uuid, p_pack pack_types)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_profile profiles%rowtype;
  v_slot jsonb;
  v_slot_type text;
  v_count int;
  v_i int;
  v_rarity text;
  v_weights jsonb;
  v_min text;
  v_foil boolean;
  v_foil_chance numeric;
  v_card_id text;
  v_tinted text;
  v_card cards%rowtype;
  v_results jsonb := '[]'::jsonb;
  v_credits_gained int := 0;
  v_card_type text;
  v_serial_rarity text;
  v_serial_number int;
  v_serial_roll numeric;
  v_serial_acc numeric;
  v_serial_total numeric;
  v_row record;
begin
  select * into v_profile from profiles where id = p_uid for update;

  for v_slot in select * from jsonb_array_elements(p_pack.slot_config) loop
    v_slot_type := v_slot->>'type';
    if v_slot_type is null then v_slot_type := v_slot->>'slot_type'; end if;
    v_count := coalesce((v_slot->>'count')::int, 1);
    v_weights := v_slot->'rarity_weights';
    v_min := v_slot->>'guaranteed_min_rarity';
    v_card_type := v_slot->>'card_type';

    for v_i in 1..v_count loop
      if v_weights is not null then
        v_rarity := roll_weighted_rarity(v_weights, v_min);
      else
        v_rarity := roll_slot_rarity(regexp_replace(coalesce(v_slot_type, 'foundation'), '^foil_', ''));
      end if;

      v_foil := coalesce(v_slot_type, '') like 'foil\_%' escape '\' or v_slot_type in ('foil', 'prismatic');
      if not v_foil and coalesce((v_slot->>'foil_eligible')::boolean, true) then
        v_foil_chance := coalesce((v_slot->>'foil_chance_override')::numeric, p_pack.foil_chance, 0);
        if v_foil_chance >= 1.0 then v_foil := true;
        elsif random() < v_foil_chance then v_foil := true;
        end if;
      end if;

      if v_card_type = 'Leader' then
        v_card_id := random_leader_of_rarity(v_rarity, p_pack.allowed_sets);
        v_foil := false;
      else
        v_card_id := random_card_of_rarity(v_rarity, p_pack.allowed_sets);
        -- Colour pack: ~75% of draws come from the pack's colours.
        if p_pack.allowed_colors is not null and random() < 0.75 then
          v_tinted := random_card_of_rarity_in_colors(
            (select rarity from cards where id = v_card_id), p_pack.allowed_sets, p_pack.allowed_colors);
          if v_tinted is not null then v_card_id := v_tinted; end if;
        end if;
      end if;
      select * into v_card from cards where id = v_card_id;

      insert into player_cards (user_id, card_id, quantity, foil_quantity)
      values (p_uid, v_card_id, case when v_foil then 0 else 1 end, case when v_foil then 1 else 0 end)
      on conflict (user_id, card_id) do update
        set quantity = player_cards.quantity + excluded.quantity,
            foil_quantity = player_cards.foil_quantity + excluded.foil_quantity;

      v_results := v_results || jsonb_build_object(
        'card_id', v_card.id, 'name', v_card.name, 'rarity', v_card.rarity,
        'card_type', v_card.card_type, 'image_url', v_card.image_url,
        'foil', v_foil, 'slot', coalesce(v_slot_type, 'slot'),
        'converted_to_credits', false,
        'credit_value', 0
      );
    end loop;
  end loop;

  if random() < 0.01 then
    select sum(cap - issued) into v_serial_total from serialized_supply where issued < cap;
    if v_serial_total is not null and v_serial_total > 0 then
      v_serial_roll := random() * v_serial_total;
      v_serial_acc := 0;
      v_serial_rarity := null;
      for v_row in select rarity, (cap - issued) as remaining from serialized_supply
        where issued < cap order by rarity loop
        v_serial_acc := v_serial_acc + v_row.remaining;
        if v_serial_roll < v_serial_acc then
          v_serial_rarity := v_row.rarity;
          exit;
        end if;
      end loop;

      if v_serial_rarity is not null then
        select id into v_card_id from cards
          where rarity = v_serial_rarity and card_type <> 'Leader'
            and (p_pack.allowed_sets is null or set_name = any(p_pack.allowed_sets))
          order by random() limit 1;

        if v_card_id is not null then
          v_serial_number := null;
          update serialized_supply set issued = issued + 1
            where rarity = v_serial_rarity and issued < cap
            returning issued into v_serial_number;

          if v_serial_number is not null then
            select * into v_card from cards where id = v_card_id;
            insert into player_cards (user_id, card_id, quantity)
            values (p_uid, v_card_id, 1)
            on conflict (user_id, card_id) do update set quantity = player_cards.quantity + 1;

            insert into player_serialized_cards (user_id, card_id, rarity, serial_number)
            values (p_uid, v_card_id, v_serial_rarity, v_serial_number);

            perform track_stat(p_uid, 'serialized_pulls', 1, false);

            v_results := v_results || jsonb_build_object(
              'card_id', v_card.id, 'name', v_card.name, 'rarity', v_card.rarity,
              'card_type', v_card.card_type, 'image_url', v_card.image_url,
              'foil', false, 'slot', 'serialized', 'converted_to_credits', false, 'credit_value', 0,
              'serialized', true, 'serial_number', v_serial_number, 'serial_cap',
              (select cap from serialized_supply where rarity = v_serial_rarity)
            );
          end if;
        end if;
      end if;
    end if;
  end if;

  update profiles set
    credits = credits + v_credits_gained,
    updated_at = now()
  where id = p_uid;

  return jsonb_build_object('cards', v_results, 'credits_gained', v_credits_gained);
end;
$function$;

-- Seven colour packs, inactive until their art lands. Slots mirror the
-- Volume #1 Booster Pack.
insert into public.pack_types (name, description, card_count, guaranteed_rarity, image_url,
  foil_chance, has_foil_slot, price_credits, price_vouchers, pack_tier, slot_config, is_active,
  acquisition, time_limited, allowed_sets, pack_group, set_name, allowed_colors)
select c || ' Pack', null, 8, 'Rare', null, 0.0118, true, 649, 7, 'limited',
  '[{"count":4,"slot_type":"foundation","foil_eligible":true,"rarity_weights":{"Common":0.78,"Uncommon":0.22},"guaranteed_min_rarity":"Common"},
    {"count":2,"slot_type":"synergy","foil_eligible":true,"rarity_weights":{"Rare":0.28,"Uncommon":0.68,"Super-Rare":0.04},"guaranteed_min_rarity":"Uncommon"},
    {"count":1,"slot_type":"chase","foil_eligible":true,"rarity_weights":{"Rare":0.65,"Mythic":0.02,"Full-Art":0.05,"Super-Rare":0.17,"Ultra-Rare":0.11},"guaranteed_min_rarity":"Rare"},
    {"count":1,"slot_type":"foil","foil_eligible":true,"rarity_weights":{"Rare":0.22,"Common":0.3,"Mythic":0.01,"Full-Art":0.02,"Uncommon":0.32,"Super-Rare":0.09,"Ultra-Rare":0.04},"foil_chance_override":1,"guaranteed_min_rarity":"Common"}]'::jsonb,
  false, 'purchase', true, array['Volume #1'], 'color_' || lower(c), null, array[c]
from unnest(array['Ember','Tide','Root','Gale','Light','Shadow','Void']) c
where not exists (select 1 from public.pack_types p where p.name = c || ' Pack');

revoke all on function public.pack_effective_price(pack_types, text) from public, anon;
revoke all on function public.random_card_of_rarity_in_colors(text, text[], text[]) from public, anon, authenticated;
grant execute on function public.daily_pack_deals(date) to anon, authenticated;
