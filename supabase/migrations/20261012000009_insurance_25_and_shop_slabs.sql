-- 1. Grade insurance premium 10% → 25% of the fee. At 10% insurance paid
--    out more than it cost at every house (TCA +54/card); at 25% it is
--    roughly fair at TCA and a small loss at AMG/Keeper. The base fee is still
--    refunded below 7, the premium never.
--
-- 2. Slabs in player shops. A slab is stocked as an 'individual' shop listing
--    whose single cards[] item carries graded_id/grade/service/pristine, and
--    shop_listings.graded_id points at the slab. Escrow reuses
--    graded_cards.listing_id (the slab can't be cracked, quicksold, crossed
--    over, traded in or listed twice). When a shop listing stops being active
--    a trigger releases the slab, so every exit path — cancel, close_shop, a
--    fraud strike — gives it back without each function knowing about slabs.
--    A player purchase moves graded_cards.user_id (the owner-change trigger
--    prunes showcase pins); a Shop Floor CPU customer retires it. CPU
--    customers price a slab from get_slab_market_value (market average, else
--    the model reference) and pay ×1.2 for their favourite house.
--    shop_sales is tracked only for CPU-customer sales (capped at 8 a day,
--    once per listing): a player-to-player sale between alts would farm it.
--
-- Idempotent; no DROP or DELETE statements.

create or replace function grading_insurance_rate() returns numeric
language sql immutable set search_path = public as $$ select 0.25 $$;

alter table shop_listings add column if not exists graded_id uuid;

-- Escrow guard: an active market OR shop listing blocks deleting the slab.
create or replace function graded_cards_escrow_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.listing_id is not null
     and (exists (select 1 from market_listings where id = old.listing_id and status = 'active')
          or exists (select 1 from shop_listings where id = old.listing_id and status = 'active')) then
    raise exception 'That slab is listed for sale — take it off sale first';
  end if;
  return old;
end $$;

-- Any shop listing that stops being active releases its slab (if the slab is
-- still held by that listing — a sale has already moved or retired it).
create or replace function shop_listing_release_slab() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.graded_id is not null and old.status = 'active' and new.status <> 'active' then
    update graded_cards set listing_id = null
     where id = new.graded_id and listing_id = new.id;
  end if;
  return null;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'shop_listings_release_slab'
                  and tgrelid = 'shop_listings'::regclass) then
    create trigger shop_listings_release_slab after update of status on shop_listings
      for each row execute function shop_listing_release_slab();
  end if;
end $$;

-- What a CPU customer thinks a slab is worth: market average, else reference.
create or replace function shop_slab_value(p_graded_id uuid) returns int
language plpgsql stable security definer set search_path = public as $$
declare
  v_g graded_cards%rowtype;
  v_mv jsonb;
begin
  select * into v_g from graded_cards where id = p_graded_id;
  if not found or v_g.grade is null then return 1; end if;
  v_mv := get_slab_market_value(v_g.card_id, v_g.grade, v_g.service, v_g.foil, v_g.pristine);
  return greatest(1, coalesce((v_mv->>'avg_price')::int, (v_mv->>'reference')::int, 1));
end $$;
revoke execute on function shop_slab_value(uuid) from public, anon, authenticated;

create or replace function create_shop_slab_listing(p_slot_id uuid, p_graded_id uuid, p_price integer)
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
          jsonb_build_array(jsonb_build_object(
            'card_id', v_g.card_id, 'foil', v_g.foil, 'quantity', 1, 'graded_id', v_g.id,
            'grade', v_g.grade, 'service', v_g.service, 'pristine', v_g.pristine)),
          p_price, v_ref, v_g.id)
  returning id into v_id;
  update graded_cards set listing_id = v_id where id = v_g.id;
  update shop_slots set status = 'occupied' where id = p_slot_id;
  return jsonb_build_object('ok', true, 'listing_id', v_id, 'reference_price', v_ref);
end $$;
revoke execute on function create_shop_slab_listing(uuid, uuid, integer) from public, anon;
grant execute on function create_shop_slab_listing(uuid, uuid, integer) to authenticated;

-- Slab items are never handed back as raw cards (the trigger above releases
-- the slab itself).
create or replace function return_shop_listing_cards(p_listing shop_listings)
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

create or replace function buy_shop_listing(p_listing_id uuid)
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

  -- shop-to-shop sales are tax-exempt: full price to the seller, no fee
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
    end loop;
  end if;

  update shop_listings set status = 'sold' where id = p_listing_id;
  update shop_slots set status = 'empty' where id = v_l.slot_id and status <> 'burned';

  insert into shop_purchases (owner, buyer, listing_id, listing_type, price, reference_price, cards)
  values (v_l.owner, v_uid, p_listing_id, v_l.listing_type, v_l.price, v_l.reference_price, v_l.cards);

  return jsonb_build_object('ok', true, 'paid', v_l.price);
end $$;

create or replace function respond_shop_customer(p_id uuid, p_action text, p_counter integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_c shop_customers%rowtype;
  v_l shop_listings%rowtype;
  v_price int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from player_shops where owner = v_uid and status = 'active') then
    raise exception 'Your shop is closed';
  end if;
  select * into v_c from shop_customers where id = p_id and owner = v_uid for update;
  if not found then raise exception 'Customer not found'; end if;
  if v_c.status <> 'waiting' then raise exception 'That customer has already left'; end if;
  if v_c.expires_at <= now() then
    update shop_customers set status = 'expired', resolved_at = now() where id = p_id;
    raise exception 'That customer got tired of waiting and left';
  end if;
  select * into v_l from shop_listings where id = v_c.listing_id and owner = v_uid for update;
  if not found or v_l.status <> 'active' then
    update shop_customers set status = 'left', resolved_at = now() where id = p_id;
    raise exception 'That item is no longer on your shelf';
  end if;

  if p_action = 'decline' then
    update shop_customers set status = 'declined', resolved_at = now() where id = p_id;
    return jsonb_build_object('ok', true, 'result', 'declined');
  end if;

  if p_action = 'counter' then
    if v_c.kind <> 'buy' then raise exception 'Trade offers cannot be haggled'; end if;
    if v_c.haggled then raise exception 'This customer will not haggle again'; end if;
    if p_counter is null or p_counter <= v_c.offer_credits then
      raise exception 'A counter-offer has to be more than their % credit offer', v_c.offer_credits;
    end if;
    if p_counter <= v_c.walkaway_credits then
      v_price := p_counter;
    elsif random() < 0.6 then
      update shop_customers set status = 'left', haggled = true, resolved_at = now() where id = p_id;
      return jsonb_build_object('ok', true, 'result', 'left');
    else
      update shop_customers set haggled = true, offer_credits = walkaway_credits where id = p_id;
      return jsonb_build_object('ok', true, 'result', 'final_offer', 'offer', v_c.walkaway_credits);
    end if;
  elsif p_action = 'accept' then
    v_price := v_c.offer_credits;
  else
    raise exception 'Unknown action';
  end if;

  perform settle_shop_maintenance(v_uid);
  -- A CPU customer takes a slab off the board for good.
  if v_l.graded_id is not null then
    perform grading_retire_slab(v_l.graded_id);
    if stat_once_claim(v_uid, 'shopslab:' || v_l.graded_id::text) then
      perform track_stat(v_uid, 'shop_slab_sales', 1, false);
    end if;
  end if;
  update shop_listings set status = 'sold' where id = v_l.id;
  update shop_slots set status = 'empty' where id = v_l.slot_id and status <> 'burned';

  if v_c.kind = 'buy' then
    update profiles set credits = credits + v_price, updated_at = now() where id = v_uid;
    perform track_stat(v_uid, 'shop_cpu_sales', 1, false);
  else
    insert into player_cards (user_id, card_id, quantity, foil_quantity)
    values (v_uid, v_c.offer_card_id, case when v_c.offer_foil then 0 else 1 end,
            case when v_c.offer_foil then 1 else 0 end)
    on conflict (user_id, card_id) do update
      set quantity = player_cards.quantity + excluded.quantity,
          foil_quantity = player_cards.foil_quantity + excluded.foil_quantity;
    perform track_stat(v_uid, 'shop_cpu_trades', 1, false);
  end if;
  if stat_once_claim(v_uid, 'shopsale:' || v_l.id::text) then
    perform track_stat(v_uid, 'shop_sales', 1, false);
  end if;

  update shop_customers set status = 'accepted', final_credits = v_price, resolved_at = now()
   where id = p_id;
  return jsonb_build_object('ok', true, 'result', 'sold', 'credits', v_price,
                            'card_id', v_c.offer_card_id, 'foil', v_c.offer_foil);
end $$;

create or replace function spawn_shop_customers(p_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_shop player_shops%rowtype;
  v_due int;
  v_waiting int;
  v_today int;
  v_l shop_listings%rowtype;
  v_ref int;
  v_r numeric;
  v_factor numeric;
  v_offer int;
  v_target_price int;
  v_rarity text;
  v_card text;
  v_cap_tier int;
  v_listing_foil boolean;
  v_persona text;
  i int;
begin
  select * into v_shop from player_shops where owner = p_owner for update;
  if not found or v_shop.status <> 'active' then return; end if;

  update shop_customers set status = 'expired', resolved_at = now()
   where owner = p_owner and status = 'waiting'
     and (expires_at <= now()
          or not exists (select 1 from shop_listings s where s.id = listing_id and s.status = 'active'));

  if v_shop.last_customer_at is null then
    v_due := 1;
  else
    v_due := floor(extract(epoch from now() - v_shop.last_customer_at) / 5400)::int;
  end if;
  if v_due < 1 then return; end if;

  select count(*) into v_waiting from shop_customers where owner = p_owner and status = 'waiting';
  select count(*) into v_today from shop_customers
   where owner = p_owner and created_at > now() - interval '24 hours';
  v_due := least(v_due, 3 - v_waiting, 8 - v_today);

  for i in 1..greatest(v_due, 0) loop
    select * into v_l from shop_listings s
     where s.owner = p_owner and s.status = 'active' and s.listing_type in ('individual', 'bundle')
       and not exists (select 1 from shop_customers c where c.listing_id = s.id and c.status = 'waiting')
     order by random() limit 1;
    exit when not found;

    v_persona := cpu_persona_name();
    if v_l.graded_id is not null then
      -- Slabs: valued like the market does, ×1.2 for the persona's favourite house.
      v_ref := round(shop_slab_value(v_l.graded_id)
        * case when grading_persona_favourite(v_persona) = (v_l.cards->0->>'service') then 1.2 else 1.0 end)::int;
    else
      v_ref := shop_listing_cpu_reference(v_l);
    end if;

    if v_l.listing_type = 'individual' and v_l.graded_id is null and random() < 0.35 then
      v_card := null;
      v_cap_tier := rarity_tier((select rarity from cards where id = v_l.cards->0->>'card_id'));
      v_listing_foil := coalesce((v_l.cards->0->>'foil')::boolean, false);
      v_target_price := round(v_ref * (0.7 + random() * 0.6))::int;
      select rarity into v_rarity from (
        select distinct rarity from cards where card_type <> 'Leader' and rarity is not null
          and rarity_tier(rarity) <= v_cap_tier
          and set_name in (select unnest(allowed_sets) from pack_types
                            where is_active and acquisition = 'purchase')
      ) r order by abs(card_sell_price(rarity) - v_target_price), random() limit 1;
      select id into v_card from cards
       where rarity = v_rarity and card_type <> 'Leader'
         and set_name in (select unnest(allowed_sets) from pack_types
                           where is_active and acquisition = 'purchase')
         and id <> (v_l.cards->0->>'card_id')
       order by random() limit 1;
      if v_card is not null then
        insert into shop_customers (owner, listing_id, kind, persona, mood, offer_card_id, offer_foil)
        values (p_owner, v_l.id, 'trade', v_persona,
                (array['curious','eager','shrewd','chatty'])[1 + floor(random() * 4)::int],
                v_card, v_listing_foil and random() < 0.10);
        continue;
      end if;
    end if;

    v_r := random();
    v_factor := case
      when v_r < 0.15 then 0.55 + random() * 0.25
      when v_r < 0.75 then 0.80 + random() * 0.25
      when v_r < 0.95 then 1.05 + random() * 0.15
      else 1.20 + random() * 0.20 end;
    v_offer := least(v_l.price, greatest(1, round(v_ref * v_factor)::int));
    insert into shop_customers (owner, listing_id, kind, persona, mood, offer_credits, walkaway_credits)
    values (p_owner, v_l.id, 'buy', v_persona,
            case when v_factor < 0.8 then 'stingy' when v_factor > 1.05 then 'smitten' else 'browsing' end,
            v_offer,
            least(v_l.price, greatest(v_offer, round(v_offer * (1.05 + random() * 0.20))::int)));
  end loop;

  update player_shops
     set last_customer_at = case
       when last_customer_at is null then now()
       else last_customer_at + make_interval(secs => 5400 * greatest(1,
              floor(extract(epoch from now() - last_customer_at) / 5400)::int)) end
   where owner = p_owner;
end $$;

insert into achievements (id, name, description, category, stat_key, target, reward_credits, reward_vouchers, sort) values
  ('shop_slab_1', 'Slab Shopkeeper', 'Sell a slab to a Shop Floor customer', 'collection', 'shop_slab_sales', 1, 500, 3, 421),
  ('shop_sales_25', 'Open for Business', 'Make 25 Shop Floor sales', 'collection', 'shop_sales', 25, 2000, 10, 422)
on conflict (id) do nothing;
insert into missions (id, name, description, stat_key, target, reward_credits, reward_vouchers, reward_bp_xp, cadence, pool) values
  ('w_shop_sale_2', 'Shopkeeper''s Week', 'Make 2 sales to Shop Floor customers this week', 'shop_sales', 2, 300, 1, 0, 'weekly', 'rotating')
on conflict (id) do nothing;
