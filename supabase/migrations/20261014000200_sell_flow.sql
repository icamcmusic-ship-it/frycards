-- Sell flow v2 (Marketplace SELL tab):
--   * create_listings_many  — list up to 10 lots in ONE round trip. Each lot
--     reuses the single-listing RPC that owns its checks and escrow
--     (create_listing / create_variant_listing / create_slab_listing), inside
--     its own sub-transaction: one bad lot is reported and rolled back, the
--     rest still list. The 10-active-listings cap is enforced per lot by the
--     inner RPCs, exactly as before.
--   * update_listing_price  — re-price an active FIXED listing in place. An
--     auction's starting bid is what bidders and the CPU ceiling were seeded
--     against, so auctions are still cancel-and-relist.
--   * get_sell_price_guide  — batched pricing help for up to 40 lots: market
--     reference, last five sold unit prices, lowest live buy-now unit price.

create or replace function public.create_listings_many(p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_item jsonb;
  v_res jsonb;
  v_out jsonb := '[]'::jsonb;
  v_i int := 0;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Nothing to list';
  end if;
  if jsonb_array_length(p_items) > 10 then raise exception 'At most 10 listings at once'; end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    begin
      if nullif(v_item->>'graded_id', '') is not null then
        v_res := create_slab_listing((v_item->>'graded_id')::uuid, v_item->>'type',
          (v_item->>'price')::int, nullif(v_item->>'buyout', '')::int,
          coalesce(nullif(v_item->>'hours', '')::int, 24));
      elsif nullif(v_item->>'variant', '') is not null then
        v_res := create_variant_listing(v_item->>'card_id', coalesce((v_item->>'foil')::boolean, false),
          v_item->>'variant', (v_item->>'quantity')::int, v_item->>'type',
          (v_item->>'price')::int, nullif(v_item->>'buyout', '')::int,
          coalesce(nullif(v_item->>'hours', '')::int, 24));
      else
        v_res := create_listing(v_item->>'card_id', coalesce((v_item->>'foil')::boolean, false),
          (v_item->>'quantity')::int, v_item->>'type',
          (v_item->>'price')::int, nullif(v_item->>'buyout', '')::int,
          coalesce(nullif(v_item->>'hours', '')::int, 24));
      end if;
      v_out := v_out || jsonb_build_array(jsonb_build_object(
        'index', v_i, 'ok', true, 'listing_id', v_res->>'listing_id', 'ends_at', v_res->>'ends_at'));
    exception when others then
      v_out := v_out || jsonb_build_array(jsonb_build_object('index', v_i, 'ok', false, 'error', sqlerrm));
    end;
    v_i := v_i + 1;
  end loop;
  return jsonb_build_object('results', v_out);
end $$;
revoke execute on function public.create_listings_many(jsonb) from public, anon;
grant execute on function public.create_listings_many(jsonb) to authenticated;

create or replace function public.update_listing_price(p_listing_id uuid, p_price integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_l market_listings%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_price is null or p_price < 1 or p_price > 1000000 then raise exception 'Invalid price'; end if;
  select * into v_l from market_listings
   where id = p_listing_id and seller = v_uid and status = 'active' for update;
  if not found then raise exception 'Listing not found'; end if;
  if v_l.listing_type <> 'fixed' then
    raise exception 'Only fixed-price listings can be re-priced — cancel and relist an auction';
  end if;
  if v_l.ends_at <= now() then raise exception 'That listing has ended'; end if;
  update market_listings set price = p_price where id = p_listing_id;
  return jsonb_build_object('ok', true, 'listing_id', p_listing_id, 'price', p_price);
end $$;
revoke execute on function public.update_listing_price(uuid, integer) from public, anon;
grant execute on function public.update_listing_price(uuid, integer) to authenticated;

-- p_items: [{card_id, foil, variant?} | {card_id, foil, grade, service, pristine}]
create or replace function public.get_sell_price_guide(p_items jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_item jsonb;
  v_out jsonb := '[]'::jsonb;
  v_card text;
  v_foil boolean;
  v_variant text;
  v_grade numeric;
  v_service text;
  v_pristine boolean;
  v_market int;
  v_recent jsonb;
  v_lowest int;
  v_active int;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then return '[]'::jsonb; end if;
  if jsonb_array_length(p_items) > 40 then raise exception 'At most 40 lots per price guide'; end if;
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_card := v_item->>'card_id';
    v_foil := coalesce((v_item->>'foil')::boolean, false);
    v_variant := nullif(v_item->>'variant', '');
    v_grade := nullif(v_item->>'grade', '')::numeric;
    v_service := nullif(v_item->>'service', '');
    v_pristine := coalesce((v_item->>'pristine')::boolean, false);

    if v_grade is not null then
      v_market := greatest(1, ceil(coalesce(
        (get_slab_market_value(v_card, v_grade, v_service, v_foil, v_pristine)->>'avg_price')::numeric,
        grading_slab_reference(v_card, v_foil, v_grade, v_service, v_pristine)::numeric)
        * case when v_variant is null then 1 else variant_mult(v_variant) end)::int);
    else
      v_market := greatest(1, ceil(card_blended_reference(v_card, v_foil)
        * case when v_variant is null then 1 else variant_mult(v_variant) end)::int);
    end if;

    select coalesce(jsonb_agg(jsonb_build_object('price', u, 'at', at) order by at desc), '[]'::jsonb)
      into v_recent
      from (
        select round(current_bid::numeric / greatest(quantity, 1))::int as u, ends_at as at
          from market_listings
         where card_id = v_card and foil = v_foil and status = 'sold' and current_bid is not null
           and variant is not distinct from v_variant
           and (case when v_grade is null then graded_id is null
                     else graded_id is not null and slab_grade = v_grade and slab_service = v_service
                          and slab_pristine = v_pristine end)
         order by ends_at desc
         limit 5
      ) s;

    select min(ceil(coalesce(case when listing_type = 'fixed' then price else buyout end)::numeric
                    / greatest(quantity, 1))::int),
           count(*)::int
      into v_lowest, v_active
      from market_listings
     where card_id = v_card and foil = v_foil and status = 'active' and ends_at > now()
       and variant is not distinct from v_variant
       and (case when v_grade is null then graded_id is null
                 else graded_id is not null and slab_grade = v_grade and slab_service = v_service
                      and slab_pristine = v_pristine end);

    v_out := v_out || jsonb_build_array(jsonb_build_object(
      'market', v_market, 'recent', v_recent, 'lowest_active', v_lowest, 'active_count', v_active));
  end loop;
  return v_out;
end $$;
revoke execute on function public.get_sell_price_guide(jsonb) from public, anon;
grant execute on function public.get_sell_price_guide(jsonb) to authenticated;
