-- 2026-10-13: card variants (cosmetic overlays).
--
-- A variant is a cosmetic version of an existing card: same card, same game
-- mechanics, different look and value (like foil, and stacking with it).
-- Eight ship: `shattered` (any colour, 1 in 150 pack cards, x6) and seven
-- elemental overlays, each paired to one colour (1 in 40 pack cards of that
-- colour, x3): ember_sparks, tide_frost, root_overgrown, gale_lightning,
-- light_radiant, shadow_ink, void_rift.
--
-- Storage model ("shadow ledger"). A variant copy is STILL a copy in
-- player_cards (quantity or foil_quantity), so ownership, deck building,
-- copy limits ("count the base card"), unique-card stats and every existing
-- RPC keep working untouched. `player_card_variants` records how many of
-- those copies are which variant, keyed (user, card, foil, variant). A
-- deferred constraint trigger keeps the ledger honest: at commit a player
-- never has more variant copies of a (card, foil) than player_cards says
-- they own, so a plain sell / list / trade / grade / bounty that would eat
-- into variant copies is rejected instead of silently destroying them.
--
-- RPCs that move copies accept an optional `variant` key on their jsonb
-- items (trades, shop listings, quicksell_many, grading) or column
-- (market_listings.variant, graded_cards.variant) and move the ledger rows
-- alongside the base copies. Values use variant_mult(): quicksell, market
-- reference, CPU bidders, slab value and Shop Floor customers all multiply.
--
-- Idempotent (create or replace / if not exists / on conflict do nothing).

-------------------------------------------------------------------------------
-- 1. Catalogue helpers
-------------------------------------------------------------------------------
create or replace function public.card_variant_colour(p_variant text)
returns text language sql immutable set search_path = public as $$
  select case p_variant
    when 'ember_sparks'   then 'Ember'
    when 'tide_frost'     then 'Tide'
    when 'root_overgrown' then 'Root'
    when 'gale_lightning' then 'Gale'
    when 'light_radiant'  then 'Light'
    when 'shadow_ink'     then 'Shadow'
    when 'void_rift'      then 'Void'
  end;
$$;

create or replace function public.is_card_variant(p_variant text)
returns boolean language sql immutable set search_path = public as $$
  select p_variant = 'shattered' or card_variant_colour(p_variant) is not null;
$$;

create or replace function public.variant_mult(p_variant text)
returns numeric language sql immutable set search_path = public as $$
  select case when p_variant is null then 1
              when p_variant = 'shattered' then 6
              when card_variant_colour(p_variant) is not null then 3
              else 1 end::numeric;
$$;

-------------------------------------------------------------------------------
-- 2. Ledger table + columns on the places a copy can sit
-------------------------------------------------------------------------------
create table if not exists public.player_card_variants (
  user_id uuid not null,
  card_id text not null,
  foil boolean not null default false,
  variant text not null check (public.is_card_variant(variant)),
  quantity int not null default 0 check (quantity >= 0),
  first_at timestamptz not null default now(),
  primary key (user_id, card_id, foil, variant)
);
create index if not exists player_card_variants_card_idx on public.player_card_variants (card_id);
alter table public.player_card_variants enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'player_card_variants'
                   and policyname = 'own variants readable') then
    create policy "own variants readable" on public.player_card_variants
      for select using ((select auth.uid()) = user_id);
  end if;
end $$;
grant select on public.player_card_variants to authenticated;

alter table public.market_listings add column if not exists variant text
  check (variant is null or public.is_card_variant(variant));
alter table public.graded_cards add column if not exists variant text
  check (variant is null or public.is_card_variant(variant));

-------------------------------------------------------------------------------
-- 3. Ledger maintenance + invariant
-------------------------------------------------------------------------------
-- Adds (p_delta > 0) or removes (p_delta < 0) variant copies. A null variant
-- is a no-op so callers can pass item->>'variant' straight through.
create or replace function public.card_variant_adjust(
  p_uid uuid, p_card_id text, p_foil boolean, p_variant text, p_delta int)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_variant is null or p_variant = '' or coalesce(p_delta, 0) = 0 then return; end if;
  if not is_card_variant(p_variant) then raise exception 'Unknown variant %', p_variant; end if;
  if p_delta > 0 then
    insert into player_card_variants (user_id, card_id, foil, variant, quantity)
    values (p_uid, p_card_id, coalesce(p_foil, false), p_variant, p_delta)
    on conflict (user_id, card_id, foil, variant) do update
      set quantity = player_card_variants.quantity + excluded.quantity;
  else
    update player_card_variants set quantity = quantity + p_delta
     where user_id = p_uid and card_id = p_card_id and foil = coalesce(p_foil, false)
       and variant = p_variant and quantity >= -p_delta;
    if not found then raise exception 'Not enough variant copies of that card'; end if;
  end if;
end $$;
revoke all on function public.card_variant_adjust(uuid, text, boolean, text, int) from public, anon, authenticated;

create or replace function public.player_card_variants_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid;
  v_card text;
  v_q int;
  v_f int;
  v_vn int;
  v_vf int;
begin
  if tg_op = 'DELETE' then v_uid := old.user_id; v_card := old.card_id;
  else v_uid := new.user_id; v_card := new.card_id; end if;
  select coalesce(sum(quantity) filter (where not foil), 0), coalesce(sum(quantity) filter (where foil), 0)
    into v_vn, v_vf from player_card_variants where user_id = v_uid and card_id = v_card;
  if v_vn = 0 and v_vf = 0 then return null; end if;
  select coalesce(max(quantity), 0), coalesce(max(foil_quantity), 0) into v_q, v_f
    from player_cards where user_id = v_uid and card_id = v_card;
  if v_q < v_vn or v_f < v_vf then
    raise exception 'Those copies are variants (Shattered / elemental) - pick the variant to move them';
  end if;
  return null;
end $$;

-- created once (no DROP): idempotent via pg_trigger
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'player_cards_variant_guard') then
    create constraint trigger player_cards_variant_guard
      after insert or update or delete on public.player_cards
      deferrable initially deferred for each row execute function public.player_card_variants_guard();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'player_card_variants_guard') then
    create constraint trigger player_card_variants_guard
      after insert or update on public.player_card_variants
      deferrable initially deferred for each row execute function public.player_card_variants_guard();
  end if;
end $$;

-------------------------------------------------------------------------------
-- 4. Value helpers
-------------------------------------------------------------------------------
-- Market average over PLAIN listings only, so variant sales never inflate
-- the base card; variant references are the base reference x variant_mult.
create or replace function public.get_card_market_value(p_card_id text, p_foil boolean default false)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sales', count(*)::int,
    'avg_price', case when count(*) >= 5
      then round(avg(current_bid::numeric / greatest(quantity, 1)))::int
      else null end
  )
  from market_listings
  where card_id = p_card_id and foil = p_foil and variant is null and status = 'sold'
    and current_bid is not null;
$$;

create or replace function public.get_slab_market_value(p_card_id text, p_grade numeric, p_service text,
  p_foil boolean default false, p_pristine boolean default false)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sales', count(*)::int,
    'avg_price', case when count(*) >= 3 then round(avg(current_bid))::int end,
    'reference', grading_slab_reference(p_card_id, p_foil, p_grade, p_service, p_pristine))
  from market_listings
  where graded_id is not null and card_id = p_card_id and foil = p_foil and variant is null
    and slab_grade = p_grade and slab_service = p_service and slab_pristine = p_pristine
    and status = 'sold' and current_bid is not null;
$$;

create or replace function public.grading_slab_price(p_id uuid, p_at timestamptz default now())
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  v_g graded_cards%rowtype;
  v_rarity text;
  v_price numeric;
  v_pop int;
begin
  select * into v_g from graded_cards where id = p_id;
  if not found or v_g.grade is null then return null; end if;
  select rarity into v_rarity from cards where id = v_g.card_id;
  v_price := card_sell_price(v_rarity);
  if v_g.foil then v_price := ceil(v_price * 2.5); end if;
  v_price := v_price * variant_mult(v_g.variant);
  select coalesce(n, 0) into v_pop from grading_pop
   where card_id = v_g.card_id and service = v_g.service and grade = v_g.grade;
  return ceil(v_price
    * case when v_g.pristine then grading_pristine_mult() else grading_grade_mult(v_g.grade) end
    * grading_service_premium(v_g.service)
    * grading_pop_mult(v_g.service, coalesce(v_pop, 0))
    * grading_reputation_mult(v_g.service, p_at));
end $$;

create or replace function public.shop_slab_value(p_graded_id uuid)
returns integer language plpgsql stable security definer set search_path = public as $$
declare
  v_g graded_cards%rowtype;
  v_mv jsonb;
begin
  select * into v_g from graded_cards where id = p_graded_id;
  if not found or v_g.grade is null then return 1; end if;
  if v_g.variant is not null then
    return greatest(1, ceil(grading_slab_reference(v_g.card_id, v_g.foil, v_g.grade, v_g.service, v_g.pristine)
                            * variant_mult(v_g.variant))::int);
  end if;
  v_mv := get_slab_market_value(v_g.card_id, v_g.grade, v_g.service, v_g.foil, v_g.pristine);
  return greatest(1, coalesce((v_mv->>'avg_price')::int, (v_mv->>'reference')::int, 1));
end $$;

create or replace function public.shop_listing_cpu_reference(p_l shop_listings)
returns integer language plpgsql stable set search_path = public as $$
declare
  v_item jsonb;
  v_qs int := 0;
  v_unit int;
begin
  for v_item in select * from jsonb_array_elements(p_l.cards) loop
    v_unit := card_sell_price((select rarity from cards where id = v_item->>'card_id'));
    if coalesce((v_item->>'foil')::boolean, false) then v_unit := ceil(v_unit * 2.5)::int; end if;
    v_unit := ceil(v_unit * variant_mult(nullif(v_item->>'variant', '')))::int;
    v_qs := v_qs + v_unit * coalesce((v_item->>'quantity')::int, 1);
  end loop;
  return greatest(1, v_qs);
end;
$$;

-------------------------------------------------------------------------------
-- 5. Pack grant: roll a variant per card pulled (independent of foil).
--    Body is the live 20261012000020 definition (store deals + colour packs)
--    with the variant roll added after the card is chosen.
-------------------------------------------------------------------------------
create or replace function public.roll_card_variant(p_card_id text)
returns text language plpgsql volatile set search_path = public as $$
declare
  v_ess text[];
  v_pick text;
begin
  if random() < 1.0 / 150 then return 'shattered'; end if;
  select coalesce(essence_types, '{}') into v_ess from cards where id = p_card_id;
  if coalesce(array_length(v_ess, 1), 0) = 0 or random() >= 1.0 / 40 then return null; end if;
  v_pick := v_ess[1 + floor(random() * array_length(v_ess, 1))::int];
  return case v_pick
    when 'Ember' then 'ember_sparks' when 'Tide' then 'tide_frost' when 'Root' then 'root_overgrown'
    when 'Gale' then 'gale_lightning' when 'Light' then 'light_radiant' when 'Shadow' then 'shadow_ink'
    when 'Void' then 'void_rift' end;
end $$;

-- Farm-safe stats: only pack pulls count, and "kinds" are claimed once each.
create or replace function public.track_variant_pull(p_uid uuid, p_variant text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_variant is null then return; end if;
  perform track_stat(p_uid, 'variants_pulled', 1, false);
  if p_variant = 'shattered' then
    perform track_stat(p_uid, 'shattered_pulls', 1, false);
  elsif stat_once_claim(p_uid, 'variantkind:' || p_variant) then
    perform track_stat(p_uid, 'elemental_kinds', 1, false);
  end if;
end $$;
revoke all on function public.track_variant_pull(uuid, text) from public, anon, authenticated;

create or replace function public.grant_pack_contents(p_uid uuid, p_pack pack_types)
returns jsonb language plpgsql security definer set search_path = public as $$
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
  v_variant text;
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

      -- variant roll: independent of foil, never on Leaders
      v_variant := null;
      if v_card_id is not null and coalesce(v_card.card_type, '') <> 'Leader' then
        v_variant := roll_card_variant(v_card_id);
        if v_variant is not null then
          perform card_variant_adjust(p_uid, v_card_id, v_foil, v_variant, 1);
          perform track_variant_pull(p_uid, v_variant);
        end if;
      end if;

      v_results := v_results || jsonb_build_object(
        'card_id', v_card.id, 'name', v_card.name, 'rarity', v_card.rarity,
        'card_type', v_card.card_type, 'image_url', v_card.image_url,
        'foil', v_foil, 'slot', coalesce(v_slot_type, 'slot'),
        'converted_to_credits', false,
        'credit_value', 0,
        'variant', v_variant
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
$$;

-------------------------------------------------------------------------------
-- 6. Moving copies: trades / shops share these two
-------------------------------------------------------------------------------
create or replace function public.assert_cards_available(p_uid uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_it record;
  v_pc player_cards%rowtype;
  v_locked int;
  v_serialized int;
  v_card cards%rowtype;
  v_have int;
  v_var_n int;
  v_var_f int;
begin
  for v_it in
    select
      value->>'card_id' as card_id,
      coalesce((value->>'foil')::boolean, false) as foil,
      nullif(value->>'variant', '') as variant,
      sum(coalesce((value->>'quantity')::int, 1)) as qty
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    group by value->>'card_id', coalesce((value->>'foil')::boolean, false), nullif(value->>'variant', '')
    order by value->>'card_id'
  loop
    if v_it.qty < 1 then raise exception 'Invalid quantity'; end if;
    select * into v_card from cards where id = v_it.card_id;
    if not found then raise exception 'Unknown card %', v_it.card_id; end if;
    select * into v_pc from player_cards where user_id = p_uid and card_id = v_it.card_id for update;
    if not found then raise exception 'Card % is not owned', v_card.name; end if;

    select count(*) into v_serialized
      from player_serialized_cards where user_id = p_uid and card_id = v_it.card_id;

    select coalesce(sum(quantity) filter (where not foil), 0), coalesce(sum(quantity) filter (where foil), 0)
      into v_var_n, v_var_f from player_card_variants where user_id = p_uid and card_id = v_it.card_id;

    if v_it.variant is not null then
      if not is_card_variant(v_it.variant) then raise exception 'Unknown variant'; end if;
      select coalesce(max(quantity), 0) into v_have from player_card_variants
       where user_id = p_uid and card_id = v_it.card_id and foil = v_it.foil and variant = v_it.variant;
      if v_have < v_it.qty then raise exception 'Not enough variant copies of %', v_card.name; end if;
    else
      if v_it.foil and v_pc.foil_quantity - v_var_f < v_it.qty then
        raise exception 'Not enough foil copies of %', v_card.name;
      end if;
      -- serialized prints are non-foil copies; they never back a foil listing
      if not v_it.foil and (v_pc.quantity - v_serialized - v_var_n) < v_it.qty then
        raise exception 'Not enough listable copies of % (serialized prints and variants are kept back)', v_card.name;
      end if;
    end if;

    select count(*) into v_locked
      from decks, unnest(card_ids) as cid
      where decks.user_id = p_uid and cid = v_it.card_id;
    if (v_pc.quantity + v_pc.foil_quantity - v_serialized - v_it.qty) < v_locked then
      raise exception '% is in use by a deck — remove it first', v_card.name;
    end if;
  end loop;
end;
$$;

create or replace function public.transfer_cards(p_from uuid, p_to uuid, p_items jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_it jsonb;
  v_card_id text;
  v_qty int;
  v_foil boolean;
  v_variant text;
begin
  for v_it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) order by (value->>'card_id') loop
    v_card_id := v_it->>'card_id';
    v_qty := coalesce((v_it->>'quantity')::int, 1);
    v_foil := coalesce((v_it->>'foil')::boolean, false);
    v_variant := nullif(v_it->>'variant', '');
    perform 1 from player_cards where user_id = p_from and card_id = v_card_id for update;
    update player_cards
      set quantity = quantity - case when v_foil then 0 else v_qty end,
          foil_quantity = foil_quantity - case when v_foil then v_qty else 0 end
      where user_id = p_from and card_id = v_card_id;
    insert into player_cards (user_id, card_id, quantity, foil_quantity)
    values (p_to, v_card_id, case when v_foil then 0 else v_qty end, case when v_foil then v_qty else 0 end)
    on conflict (user_id, card_id) do update
      set quantity = player_cards.quantity + excluded.quantity,
          foil_quantity = player_cards.foil_quantity + excluded.foil_quantity;
    perform card_variant_adjust(p_from, v_card_id, v_foil, v_variant, -v_qty);
    perform card_variant_adjust(p_to, v_card_id, v_foil, v_variant, v_qty);
  end loop;
end;
$$;

-------------------------------------------------------------------------------
-- 7. Quicksell: per-item variant multiplier
-------------------------------------------------------------------------------
create or replace function public.quicksell_many(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_card_id text;
  v_qty int;
  v_foil boolean;
  v_variant text;
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
    v_variant := nullif(v_item ->> 'variant', '');
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
    v_price := ceil(v_price * variant_mult(v_variant))::int;
    update player_cards set quantity = v_new_qty, foil_quantity = v_new_foil
     where user_id = v_uid and card_id = v_card_id;
    perform card_variant_adjust(v_uid, v_card_id, v_foil, v_variant, -v_qty);
    v_sold := v_sold + v_qty;
    v_total := v_total + v_price * v_qty;
    v_per := v_per || jsonb_build_object('card_id', v_card_id, 'foil', v_foil, 'variant', v_variant,
                                         'sold', v_qty, 'unit_price', v_price, 'total', v_price * v_qty);
  end loop;

  update profiles set credits = credits + v_total, updated_at = now() where id = v_uid
  returning credits into v_credits;
  perform track_stat(v_uid, 'cards_sold', v_sold, false);
  return jsonb_build_object('ok', true, 'credits', v_credits, 'sold', v_sold, 'total', v_total,
                            'per_item', v_per);
end;
$$;

-------------------------------------------------------------------------------
-- 8. Market: variant listings
-------------------------------------------------------------------------------
-- create_listing keeps its signature (plain copies); variant copies list
-- through this wrapper, which reuses its checks and escrow and then tags the
-- listing and moves the ledger rows into escrow.
create or replace function public.create_variant_listing(p_card_id text, p_foil boolean, p_variant text,
  p_quantity integer, p_type text, p_price integer, p_buyout integer default null, p_hours integer default 24)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_res jsonb;
  v_have int;
  v_unit int;
  v_ceiling int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_variant is null or not is_card_variant(p_variant) then raise exception 'Unknown variant'; end if;
  select coalesce(max(quantity), 0) into v_have from player_card_variants
   where user_id = v_uid and card_id = p_card_id and foil = coalesce(p_foil, false) and variant = p_variant;
  if v_have < coalesce(p_quantity, 0) then raise exception 'Not enough variant copies of that card'; end if;
  -- the base checks count every copy; the variant copies are what's leaving
  perform card_variant_adjust(v_uid, p_card_id, p_foil, p_variant, -p_quantity);
  v_res := create_listing(p_card_id, p_foil, p_quantity, p_type, p_price, p_buyout, p_hours);
  update market_listings set variant = p_variant where id = (v_res->>'listing_id')::uuid;
  if p_type = 'auction' then
    -- CPU bidders value the variant: pre-seed the ceiling run_cpu_bidders reads
    v_unit := card_sell_price((select rarity from cards where id = p_card_id));
    if p_foil then v_unit := ceil(v_unit * 2.5)::int; end if;
    v_unit := ceil(v_unit * variant_mult(p_variant))::int;
    v_ceiling := case when p_price > v_unit * p_quantity then 0 else
      greatest(1, round(v_unit * p_quantity * cpu_ceiling_factor(
        v_uid::text || '|' || p_card_id || '|' || coalesce(p_foil, false)::text || '|' ||
        (now() at time zone 'utc')::date::text))::int) end;
    insert into market_listing_cpu (listing_id, cpu_ceiling) values ((v_res->>'listing_id')::uuid, v_ceiling)
      on conflict (listing_id) do update set cpu_ceiling = excluded.cpu_ceiling;
  end if;
  return v_res || jsonb_build_object('variant', p_variant);
end $$;
grant execute on function public.create_variant_listing(text, boolean, text, integer, text, integer, integer, integer)
  to authenticated;

create or replace function public.finalize_sale(p_listing market_listings, p_buyer uuid, p_amount integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into player_cards (user_id, card_id, quantity, foil_quantity)
  values (p_buyer, p_listing.card_id,
          case when p_listing.foil then 0 else p_listing.quantity end,
          case when p_listing.foil then p_listing.quantity else 0 end)
  on conflict (user_id, card_id) do update
    set quantity = player_cards.quantity + excluded.quantity,
        foil_quantity = player_cards.foil_quantity + excluded.foil_quantity;
  perform card_variant_adjust(p_buyer, p_listing.card_id, p_listing.foil, p_listing.variant, p_listing.quantity);
  update profiles set credits = credits + (p_amount - ceil(p_amount * 0.05))::int, updated_at = now()
    where id = p_listing.seller;
  perform track_stat(p_listing.seller, 'market_sales', 1, false);
  perform track_stat(p_buyer, 'market_buys', 1, false);
  perform track_stat(p_buyer, 'unique_cards',
    (select count(*)::int from player_cards where user_id = p_buyer and (quantity + foil_quantity) > 0), true);
end;
$$;

create or replace function public.cancel_listing(p_listing_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_l market_listings%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_l from market_listings
    where id = p_listing_id and seller = v_uid and status = 'active' for update;
  if not found then raise exception 'Listing not found'; end if;
  if v_l.bid_count > 0 then raise exception 'Cannot cancel an auction that already has bids'; end if;
  if v_l.graded_id is not null then
    update graded_cards set listing_id = null where id = v_l.graded_id;
  else
    insert into player_cards (user_id, card_id, quantity, foil_quantity)
    values (v_uid, v_l.card_id, case when v_l.foil then 0 else v_l.quantity end,
            case when v_l.foil then v_l.quantity else 0 end)
    on conflict (user_id, card_id) do update
      set quantity = player_cards.quantity + excluded.quantity,
          foil_quantity = player_cards.foil_quantity + excluded.foil_quantity;
    perform card_variant_adjust(v_uid, v_l.card_id, v_l.foil, v_l.variant, v_l.quantity);
  end if;
  update market_listings set status = 'cancelled' where id = p_listing_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function public.settle_expired_listings()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_l market_listings%rowtype;
  v_settled int := 0;
  v_cpu int;
begin
  v_cpu := run_cpu_bidders();
  for v_l in
    select * from market_listings where status = 'active' and ends_at <= now()
    order by ends_at limit 50
    for update skip locked
  loop
    if v_l.listing_type = 'auction' and v_l.current_bidder is not null then
      if v_l.graded_id is not null then
        perform finalize_slab_sale(v_l, v_l.current_bidder, v_l.current_bid);
      else
        perform finalize_sale(v_l, v_l.current_bidder, v_l.current_bid);
      end if;
      update market_listings set status = 'sold' where id = v_l.id;
    elsif v_l.listing_type = 'auction' and v_l.cpu_leading and v_l.current_bid is not null
          and (select count(*) from market_listings m
                where m.seller = v_l.seller and m.status = 'sold' and m.cpu_bidder_name is not null
                  and m.current_bidder is null and m.ends_at > now() - interval '24 hours') < 8 then
      update profiles
         set credits = credits + (v_l.current_bid - ceil(v_l.current_bid * 0.05))::int,
             updated_at = now()
       where id = v_l.seller;
      perform track_stat(v_l.seller, 'market_sales', 1, false);
      perform track_stat(v_l.seller, 'cpu_auction_sales', 1, false);
      if v_l.graded_id is not null then
        perform grading_retire_slab(v_l.graded_id);
        if stat_once_claim(v_l.seller, 'slabsold:' || v_l.graded_id::text) then
          perform track_stat(v_l.seller, 'slabs_sold_market', 1, false);
        end if;
      end if;
      update market_listings set status = 'sold' where id = v_l.id;
    else
      if v_l.graded_id is not null then
        update graded_cards set listing_id = null where id = v_l.graded_id;
      else
        insert into player_cards (user_id, card_id, quantity, foil_quantity)
        values (v_l.seller, v_l.card_id,
                case when v_l.foil then 0 else v_l.quantity end,
                case when v_l.foil then v_l.quantity else 0 end)
        on conflict (user_id, card_id) do update
          set quantity = player_cards.quantity + excluded.quantity,
              foil_quantity = player_cards.foil_quantity + excluded.foil_quantity;
        perform card_variant_adjust(v_l.seller, v_l.card_id, v_l.foil, v_l.variant, v_l.quantity);
      end if;
      update market_listings set status = 'expired' where id = v_l.id;
    end if;
    v_settled := v_settled + 1;
  end loop;
  return jsonb_build_object('ok', true, 'settled', v_settled, 'cpu_bids', v_cpu);
end $$;

-------------------------------------------------------------------------------
-- 9. Grading: slabs remember the variant
-------------------------------------------------------------------------------
create or replace function public.submit_grading_v2(p_items jsonb, p_service text, p_speed text,
  p_currency text default 'credits', p_insure boolean default false, p_use_token boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_item record;
  v_card cards%rowtype;
  v_pc player_cards%rowtype;
  v_locked int;
  v_serialized_reserved int;
  v_new_qty int;
  v_new_foil int;
  v_count int := 0;
  v_unit int;
  v_row_fee int;
  v_fee int;
  v_prem int;
  v_total int := 0;
  v_insurance int := 0;
  v_charge int := 0;
  v_profile profiles%rowtype;
  v_ready timestamptz;
  v_ws record;
  v_special boolean;
  v_loyal grading_loyalty%rowtype;
  v_perk boolean := false;
  v_perk_left boolean;
  v_token boolean := false;
  v_token_left boolean;
  v_insure boolean := coalesce(p_insure, false);
  i int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_service not in ('tca','amg','keeper') then raise exception 'Unknown grading service'; end if;
  if p_speed not in ('standard','rush','instant') then raise exception 'Unknown turnaround'; end if;
  if coalesce(p_currency, 'credits') not in ('credits','vouchers') then
    raise exception 'Unknown payment method';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nothing to submit';
  end if;
  if jsonb_array_length(p_items) > 50 then raise exception 'Too many cards in one submission (max 50 lines)'; end if;

  select coalesce(sum((it->>'qty')::int), 0) into v_count
    from jsonb_array_elements(p_items) it;
  if v_count < 1 or v_count > 100 then raise exception 'Invalid submission size'; end if;
  if v_count < grading_min_cards(p_service) then
    raise exception 'AMG takes orders of at least % cards', grading_min_cards(p_service);
  end if;

  if coalesce(p_use_token, false) then
    if p_speed <> 'standard' then raise exception 'A trade-in token covers standard speed only'; end if;
    insert into grading_tokens (user_id) values (v_uid) on conflict do nothing;
    update grading_tokens set tokens = tokens - 1, used = used + 1
     where user_id = v_uid and tokens > 0;
    if not found then raise exception 'You have no trade-in token'; end if;
    v_token := true;
  end if;
  v_token_left := v_token;

  v_unit := ceil(grading_base_fee(p_service) * grading_speed_mult(p_service, p_speed)
                 * grading_bulk_mult(p_service, v_count));
  v_ready := now() + grading_turnaround(p_speed);
  select * into v_ws from grading_week_special();

  insert into grading_loyalty (user_id, service) values (v_uid, p_service) on conflict do nothing;
  select * into v_loyal from grading_loyalty where user_id = v_uid and service = p_service for update;
  if v_loyal.submitted / 10 > v_loyal.perks_used then v_perk := true; end if;
  v_perk_left := v_perk;

  for v_item in
    select (it->>'card_id') as card_id, (it->>'qty')::int as qty,
           coalesce((it->>'foil')::boolean, false) as foil,
           nullif(it->>'variant', '') as variant
      from jsonb_array_elements(p_items) it
  loop
    if v_item.qty is null or v_item.qty < 1 then raise exception 'Invalid quantity'; end if;
    select * into v_card from cards where id = v_item.card_id;
    if not found then raise exception 'Unknown card'; end if;
    select * into v_pc from player_cards
      where user_id = v_uid and card_id = v_item.card_id for update;
    if not found then raise exception 'You do not own %', v_card.name; end if;
    if v_item.foil then
      if v_pc.foil_quantity < v_item.qty then raise exception 'Not enough foil copies of %', v_card.name; end if;
    else
      if v_pc.quantity < v_item.qty then raise exception 'Not enough copies of %', v_card.name; end if;
    end if;
    if v_card.card_type = 'Leader' then
      select count(*) into v_locked from decks
        where decks.user_id = v_uid and decks.leader_id = v_item.card_id;
    else
      select count(*) into v_locked from decks, unnest(card_ids) as cid
        where decks.user_id = v_uid and cid = v_item.card_id;
    end if;
    v_new_qty := v_pc.quantity - case when v_item.foil then 0 else v_item.qty end;
    v_new_foil := v_pc.foil_quantity - case when v_item.foil then v_item.qty else 0 end;
    if (v_new_qty + v_new_foil) < v_locked then
      raise exception '% is in use by one of your decks — remove it before grading', v_card.name;
    end if;
    if not v_item.foil then
      select count(*) into v_serialized_reserved
        from player_serialized_cards where user_id = v_uid and card_id = v_item.card_id;
      if v_new_qty < v_serialized_reserved then
        raise exception 'You own a Serialized copy of % — it cannot be graded', v_card.name;
      end if;
    end if;
    update player_cards set quantity = v_new_qty, foil_quantity = v_new_foil
      where user_id = v_uid and card_id = v_item.card_id;
    perform card_variant_adjust(v_uid, v_item.card_id, v_item.foil, v_item.variant, -v_item.qty);

    v_special := v_ws.service = p_service and v_ws.colour = any(coalesce(v_card.essence_types, '{}'));
    v_row_fee := case when v_special then ceil(v_unit / 2.0)::int else v_unit end;

    for i in 1..v_item.qty loop
      v_fee := v_row_fee;
      if v_perk_left then
        v_perk_left := false;
        if p_service <> 'tca' then v_fee := 0; end if;
        insert into graded_cards (user_id, card_id, foil, variant, service, speed, fee_paid, ready_at,
                                  loyalty_bonus, insured, insurance_paid)
          values (v_uid, v_item.card_id, v_item.foil, v_item.variant, p_service, p_speed, v_fee, v_ready,
                  p_service = 'tca', v_insure and v_fee > 0,
                  case when v_insure then ceil(v_fee * grading_insurance_rate())::int else 0 end);
      else
        if v_token_left then v_token_left := false; v_fee := 0; end if;
        insert into graded_cards (user_id, card_id, foil, variant, service, speed, fee_paid, ready_at,
                                  insured, insurance_paid)
          values (v_uid, v_item.card_id, v_item.foil, v_item.variant, p_service, p_speed, v_fee, v_ready,
                  v_insure and v_fee > 0,
                  case when v_insure then ceil(v_fee * grading_insurance_rate())::int else 0 end);
      end if;
      v_prem := case when v_insure then ceil(v_fee * grading_insurance_rate())::int else 0 end;
      v_total := v_total + v_fee;
      v_insurance := v_insurance + v_prem;
    end loop;
  end loop;

  update grading_loyalty
     set submitted = submitted + v_count,
         perks_used = perks_used + case when v_perk then 1 else 0 end
   where user_id = v_uid and service = p_service;

  v_charge := case when coalesce(p_currency, 'credits') = 'vouchers'
                   then grading_voucher_fee(v_total + v_insurance) else v_total + v_insurance end;
  if v_total + v_insurance = 0 then v_charge := 0; end if;

  select * into v_profile from profiles where id = v_uid for update;
  if coalesce(p_currency, 'credits') = 'vouchers' then
    if v_profile.vouchers < v_charge then raise exception 'Not enough vouchers (fee is %)', v_charge; end if;
    update profiles set vouchers = vouchers - v_charge, updated_at = now()
      where id = v_uid returning * into v_profile;
  else
    if v_profile.credits < v_charge then raise exception 'Not enough credits (fee is %)', v_charge; end if;
    update profiles set credits = credits - v_charge, updated_at = now()
      where id = v_uid returning * into v_profile;
  end if;

  return jsonb_build_object(
    'ok', true, 'credits', v_profile.credits, 'vouchers', v_profile.vouchers,
    'currency', coalesce(p_currency, 'credits'), 'count', v_count, 'unit_fee', v_unit,
    'total_fee', v_total, 'insurance', v_insurance, 'charged', v_charge, 'ready_at', v_ready,
    'perk_used', v_perk, 'token_used', v_token,
    'week_special', jsonb_build_object('service', v_ws.service, 'colour', v_ws.colour)
  );
end $$;

-- Cracking a slab returns its copy; this wrapper puts the variant back too.
-- (crack_graded_slab removes the graded row, so redefining it is left to the
-- pending file; the client calls this wrapper.)
create or replace function public.crack_variant_slab(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_g graded_cards%rowtype;
  v_res jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_g from graded_cards where id = p_id and user_id = v_uid for update;
  if not found then raise exception 'Slab not found'; end if;
  v_res := crack_graded_slab(p_id);
  perform card_variant_adjust(v_uid, v_g.card_id, v_g.foil, v_g.variant, 1);
  return v_res || jsonb_build_object('variant', v_g.variant);
end $$;
grant execute on function public.crack_variant_slab(uuid) to authenticated;

create or replace function public.create_slab_listing(p_graded_id uuid, p_type text, p_price integer,
  p_buyout integer default null, p_hours integer default 24)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_g graded_cards%rowtype;
  v_listing market_listings%rowtype;
  v_hours int;
  v_ref int;
  v_persona text;
  v_ceiling int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_type not in ('fixed', 'auction') then raise exception 'Unknown listing type'; end if;
  if p_price is null or p_price < 1 or p_price > 1000000 then raise exception 'Invalid price'; end if;
  if p_buyout is not null and p_buyout <= p_price then
    raise exception 'Buyout must be higher than the starting bid';
  end if;
  select * into v_g from graded_cards where id = p_graded_id and user_id = v_uid for update;
  if not found or v_g.retired then raise exception 'Slab not found'; end if;
  if v_g.grade is null or v_g.crossover_pending then raise exception 'That card is still being graded'; end if;
  if v_g.listing_id is not null then raise exception 'That slab is already listed'; end if;
  if (select count(*) from market_listings where seller = v_uid and status = 'active') >= 10 then
    raise exception 'Too many active listings (max 10)';
  end if;
  v_hours := case when p_type = 'auction' then least(greatest(coalesce(p_hours, 24), 1), 168) else 24 * 14 end;
  v_persona := cpu_persona_name();

  insert into market_listings (seller, card_id, foil, variant, quantity, listing_type, price, buyout, ends_at,
                               graded_id, slab_grade, slab_service, slab_pristine, cpu_bidder_name)
  values (v_uid, v_g.card_id, v_g.foil, v_g.variant, 1, p_type, p_price,
          case when p_type = 'auction' then p_buyout end,
          now() + make_interval(hours => v_hours),
          v_g.id, v_g.grade, v_g.service, v_g.pristine, v_persona)
  returning * into v_listing;

  update graded_cards set listing_id = v_listing.id where id = v_g.id;

  if p_type = 'auction' then
    v_ref := ceil(grading_slab_reference(v_g.card_id, v_g.foil, v_g.grade, v_g.service, v_g.pristine)
                  * variant_mult(v_g.variant))::int;
    v_ceiling := case when p_price > v_ref then 0 else
      greatest(1, round(v_ref * cpu_ceiling_factor(v_uid::text || '|' || v_g.id::text || '|' ||
                 (now() at time zone 'utc')::date::text)
        * case when grading_persona_favourite(v_persona) = v_g.service then 1.2 else 1.0 end)::int) end;
    insert into market_listing_cpu (listing_id, cpu_ceiling) values (v_listing.id, v_ceiling)
      on conflict (listing_id) do update set cpu_ceiling = excluded.cpu_ceiling;
  end if;
  return jsonb_build_object('ok', true, 'listing_id', v_listing.id, 'ends_at', v_listing.ends_at,
    'cpu_favourite', grading_persona_favourite(v_persona));
end $$;

-------------------------------------------------------------------------------
-- 10. Player shops: items carry `variant`
-------------------------------------------------------------------------------
create or replace function public.create_shop_listing(p_slot_id uuid, p_type text, p_cards jsonb, p_price integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_slot shop_slots%rowtype;
  v_item jsonb;
  v_count int := 0;
  v_reference int := 0;
  v_card_id text;
  v_qty int;
  v_foil boolean;
  v_variant text;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_type not in ('individual', 'bundle') then raise exception 'Unknown listing type'; end if;
  if p_price is null or p_price < 1 then raise exception 'Invalid price'; end if;
  if not exists (select 1 from player_shops where owner = v_uid and status = 'active') then
    raise exception 'You need an open shop first';
  end if;
  perform settle_shop_maintenance(v_uid);

  select * into v_slot from shop_slots where id = p_slot_id and owner = v_uid for update;
  if not found then raise exception 'Slot not found'; end if;
  if v_slot.status <> 'empty' then raise exception 'That slot is not free'; end if;

  select count(*) into v_count from jsonb_array_elements(p_cards);
  if p_type = 'individual' and v_count <> 1 then raise exception 'An individual listing needs exactly one card'; end if;
  if p_type = 'bundle' and v_count < 2 then raise exception 'A bundle needs at least two cards'; end if;

  for v_item in select * from jsonb_array_elements(p_cards) loop
    v_card_id := v_item->>'card_id';
    v_qty := coalesce((v_item->>'quantity')::int, 1);
    v_foil := coalesce((v_item->>'foil')::boolean, false);
    v_variant := nullif(v_item->>'variant', '');
    if v_qty < 1 then raise exception 'Invalid quantity'; end if;
    if v_variant is not null and not is_card_variant(v_variant) then raise exception 'Unknown variant'; end if;
    v_reference := v_reference + ceil(card_blended_reference(v_card_id, v_foil) * variant_mult(v_variant))::int * v_qty;
  end loop;

  perform assert_cards_available(v_uid, p_cards);
  for v_item in select * from jsonb_array_elements(p_cards) loop
    update player_cards
      set quantity = quantity - case when (v_item->>'foil')::boolean then 0 else (v_item->>'quantity')::int end,
          foil_quantity = foil_quantity - case when (v_item->>'foil')::boolean then (v_item->>'quantity')::int else 0 end
      where user_id = v_uid and card_id = v_item->>'card_id';
    perform card_variant_adjust(v_uid, v_item->>'card_id', coalesce((v_item->>'foil')::boolean, false),
      nullif(v_item->>'variant', ''), -coalesce((v_item->>'quantity')::int, 1));
  end loop;

  insert into shop_listings (owner, slot_id, listing_type, cards, price, reference_price)
  values (v_uid, p_slot_id, p_type, p_cards, p_price, v_reference);
  update shop_slots set status = 'occupied' where id = p_slot_id;

  return jsonb_build_object('ok', true, 'reference_price', v_reference);
end;
$$;

create or replace function public.return_shop_listing_cards(p_listing shop_listings)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_item jsonb;
  v_pool record;
begin
  if p_listing.graded_id is not null then return; end if;
  if p_listing.listing_type in ('individual', 'bundle') then
    for v_item in select * from jsonb_array_elements(p_listing.cards) loop
      insert into player_cards (user_id, card_id, quantity, foil_quantity)
      values (
        p_listing.owner, v_item->>'card_id',
        case when (v_item->>'foil')::boolean then 0 else (v_item->>'quantity')::int end,
        case when (v_item->>'foil')::boolean then (v_item->>'quantity')::int else 0 end
      )
      on conflict (user_id, card_id) do update
        set quantity = player_cards.quantity + excluded.quantity,
            foil_quantity = player_cards.foil_quantity + excluded.foil_quantity;
      perform card_variant_adjust(p_listing.owner, v_item->>'card_id', coalesce((v_item->>'foil')::boolean, false),
        nullif(v_item->>'variant', ''), coalesce((v_item->>'quantity')::int, 1));
    end loop;
  elsif p_listing.listing_type = 'mystery' then
    for v_pool in
      select card_id, foil, sum(remaining) as qty from shop_mystery_pool
        where listing_id = p_listing.id and remaining > 0
        group by card_id, foil
    loop
      insert into player_cards (user_id, card_id, quantity, foil_quantity)
      values (p_listing.owner, v_pool.card_id,
              case when v_pool.foil then 0 else v_pool.qty end,
              case when v_pool.foil then v_pool.qty else 0 end)
      on conflict (user_id, card_id) do update
        set quantity = player_cards.quantity + excluded.quantity,
            foil_quantity = player_cards.foil_quantity + excluded.foil_quantity;
    end loop;
    update shop_mystery_pool set remaining = 0 where listing_id = p_listing.id;
  end if;
end $$;

create or replace function public.buy_shop_listing(p_listing_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_l shop_listings%rowtype;
  v_buyer profiles%rowtype;
  v_item jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_l from shop_listings where id = p_listing_id and status = 'active' for update;
  if not found then raise exception 'Listing not found'; end if;
  if v_l.listing_type not in ('individual', 'bundle') then raise exception 'Not a card listing'; end if;
  if v_l.owner = v_uid then raise exception 'You cannot buy your own listing'; end if;

  perform settle_shop_maintenance(v_l.owner);

  select * into v_buyer from profiles where id = v_uid for update;
  if v_buyer.credits < v_l.price then raise exception 'Not enough credits'; end if;

  update profiles set credits = credits - v_l.price, updated_at = now() where id = v_uid;
  update profiles set credits = credits + v_l.price, updated_at = now() where id = v_l.owner;

  if v_l.graded_id is not null then
    update graded_cards set user_id = v_uid, listing_id = null
     where id = v_l.graded_id and listing_id = v_l.id;
    if not found then raise exception 'That slab is no longer available'; end if;
  else
    for v_item in select * from jsonb_array_elements(v_l.cards) loop
      insert into player_cards (user_id, card_id, quantity, foil_quantity)
      values (
        v_uid, v_item->>'card_id',
        case when (v_item->>'foil')::boolean then 0 else (v_item->>'quantity')::int end,
        case when (v_item->>'foil')::boolean then (v_item->>'quantity')::int else 0 end
      )
      on conflict (user_id, card_id) do update
        set quantity = player_cards.quantity + excluded.quantity,
            foil_quantity = player_cards.foil_quantity + excluded.foil_quantity;
      perform card_variant_adjust(v_uid, v_item->>'card_id', coalesce((v_item->>'foil')::boolean, false),
        nullif(v_item->>'variant', ''), coalesce((v_item->>'quantity')::int, 1));
    end loop;
  end if;

  update shop_listings set status = 'sold' where id = p_listing_id;
  update shop_slots set status = 'empty' where id = v_l.slot_id and status <> 'burned';

  insert into shop_purchases (owner, buyer, listing_id, listing_type, price, reference_price, cards)
  values (v_l.owner, v_uid, p_listing_id, v_l.listing_type, v_l.price, v_l.reference_price, v_l.cards);

  return jsonb_build_object('ok', true, 'paid', v_l.price);
end $$;

create or replace function public.create_shop_slab_listing(p_slot_id uuid, p_graded_id uuid, p_price integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_slot shop_slots%rowtype;
  v_g graded_cards%rowtype;
  v_ref int;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_price is null or p_price < 1 then raise exception 'Invalid price'; end if;
  if not exists (select 1 from player_shops where owner = v_uid and status = 'active') then
    raise exception 'You need an open shop first';
  end if;
  perform settle_shop_maintenance(v_uid);
  select * into v_slot from shop_slots where id = p_slot_id and owner = v_uid for update;
  if not found then raise exception 'Slot not found'; end if;
  if v_slot.status <> 'empty' then raise exception 'That slot is not free'; end if;
  select * into v_g from graded_cards where id = p_graded_id and user_id = v_uid for update;
  if not found or v_g.retired then raise exception 'Slab not found'; end if;
  if v_g.grade is null or v_g.crossover_pending then raise exception 'That card is still being graded'; end if;
  if v_g.listing_id is not null then raise exception 'That slab is already listed'; end if;

  v_ref := shop_slab_value(v_g.id);
  insert into shop_listings (owner, slot_id, listing_type, cards, price, reference_price, graded_id)
  values (v_uid, p_slot_id, 'individual',
          jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
            'card_id', v_g.card_id, 'foil', v_g.foil, 'quantity', 1, 'graded_id', v_g.id,
            'grade', v_g.grade, 'service', v_g.service, 'pristine', v_g.pristine,
            'variant', v_g.variant))),
          p_price, v_ref, v_g.id)
  returning id into v_id;
  update graded_cards set listing_id = v_id where id = v_g.id;
  update shop_slots set status = 'occupied' where id = p_slot_id;
  return jsonb_build_object('ok', true, 'listing_id', v_id, 'reference_price', v_ref);
end $$;

-------------------------------------------------------------------------------
-- 11. Listable inventory: plain spares exclude variants; variants listed apart
-------------------------------------------------------------------------------
create or replace function public.get_listable_inventory()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select coalesce(jsonb_agg(row_to_json(t) order by t.tier desc, t.name), '[]'::jsonb) into v_result from (
    select card_id, name, rarity, tier, card_type, image_url,
           greatest(0, listable_normal - lock_n)                        as spare_normal,
           greatest(0, foil_n - greatest(0, lock_n - listable_normal))  as spare_foil,
           value_normal, value_foil, variants
    from (
      select pc.card_id, c.name, c.rarity, rarity_tier(c.rarity) as tier, c.card_type, c.image_url,
             greatest(0, pc.quantity - ser.n - var.n_plain) as listable_normal,
             greatest(0, pc.foil_quantity - var.n_foil) as foil_n,
             lock.n as lock_n,
             card_blended_reference(pc.card_id, false) as value_normal,
             card_blended_reference(pc.card_id, true)  as value_foil,
             var.list as variants
      from player_cards pc
      join cards c on c.id = pc.card_id
      cross join lateral (
        select count(*)::int as n from player_serialized_cards s
         where s.user_id = v_uid and s.card_id = pc.card_id
      ) ser
      cross join lateral (
        select count(*)::int as n from decks d, unnest(d.card_ids) cid
         where d.user_id = v_uid and cid = pc.card_id
      ) lock
      cross join lateral (
        select coalesce(sum(v.quantity) filter (where not v.foil), 0)::int as n_plain,
               coalesce(sum(v.quantity) filter (where v.foil), 0)::int as n_foil,
               coalesce(jsonb_agg(jsonb_build_object('variant', v.variant, 'foil', v.foil, 'quantity', v.quantity,
                 'value', ceil(card_blended_reference(pc.card_id, v.foil) * variant_mult(v.variant))::int))
                 filter (where v.quantity > 0), '[]'::jsonb) as list
          from player_card_variants v where v.user_id = v_uid and v.card_id = pc.card_id
      ) var
      where pc.user_id = v_uid and coalesce(c.card_type, '') <> 'Leader'
    ) base
  ) t
  where (t.spare_normal > 0 or t.spare_foil > 0 or jsonb_array_length(t.variants) > 0);
  return v_result;
end;
$$;

-------------------------------------------------------------------------------
-- 12. Achievements (farm-safe: pack pulls only, kinds claimed once)
-------------------------------------------------------------------------------
insert into public.achievements
  (id, name, description, category, stat_key, target, reward_credits, reward_vouchers, reward_pack_id, sort)
values
  ('variant_first',      'Something Different', 'Pull your first card variant from a pack',      'collection', 'variants_pulled',  1,  500,  2, null, 623),
  ('variant_elements_7', 'Elemental Binder',    'Pull one of each of the 7 elemental variants',  'collection', 'elemental_kinds',  7, 5000, 25, null, 624),
  ('variant_shattered',  'Glass Half Full',     'Pull a Shattered card from a pack',              'collection', 'shattered_pulls',  1, 1500,  8, null, 625)
on conflict (id) do nothing;
