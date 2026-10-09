-- 2026-10-08, audit B6: Shop Floor customers must not price off a pumped
-- market reference, and must not trade up.
--
-- shop_listing_cpu_reference() took the listing's blended reference_price
-- (which follows market sales, so a player can pump it) and allowed up to 2x
-- raw quicksell. A CPU customer now prices off RAW quicksell, the server's
-- own table, exactly as the 20261006000001 header describes for CPU bidders.
--
-- spawn_shop_customers() picked the trade card whose quicksell sat nearest the
-- listing's reference, so a Rare listing could be "traded" for a Super-Rare
-- (and a 10% foil roll turned a non-foil listing into a 2.5x foil). A trade
-- offer is now capped at the listing's own rarity tier, and the offer is only
-- ever foil when the listing is. Offers already waiting expire on their own
-- (six hours); nothing is rewritten.
--
-- Only shop_listing_cpu_reference and spawn_shop_customers change.
-- respond_shop_customer reads the stored offer, so it needs no edit.

create or replace function public.shop_listing_cpu_reference(p_l shop_listings)
returns int language plpgsql stable set search_path to 'public' as $function$
declare
  v_item jsonb;
  v_qs int := 0;
  v_unit int;
begin
  for v_item in select * from jsonb_array_elements(p_l.cards) loop
    v_unit := card_sell_price((select rarity from cards where id = v_item->>'card_id'));
    if coalesce((v_item->>'foil')::boolean, false) then v_unit := ceil(v_unit * 2.5)::int; end if;
    v_qs := v_qs + v_unit * coalesce((v_item->>'quantity')::int, 1);
  end loop;
  return greatest(1, v_qs);
end;
$function$;

create or replace function public.spawn_shop_customers(p_owner uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
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
  i int;
begin
  select * into v_shop from player_shops where owner = p_owner for update;
  if not found or v_shop.status <> 'active' then return; end if;

  update shop_customers set status = 'expired', resolved_at = now()
   where owner = p_owner and status = 'waiting'
     and (expires_at <= now()
          or not exists (select 1 from shop_listings s where s.id = listing_id and s.status = 'active'));

  if v_shop.last_customer_at is null then
    -- first visit: the first customer is already at the door
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

    v_ref := shop_listing_cpu_reference(v_l);
    if v_l.listing_type = 'individual' and random() < 0.35 then
      -- TRADE: a card whose quicksell sits nearest the listing's reference,
      -- never from a higher rarity tier than the listing itself.
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
        values (p_owner, v_l.id, 'trade', cpu_persona_name(),
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
    values (p_owner, v_l.id, 'buy', cpu_persona_name(),
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
end;
$function$;

revoke all on function public.spawn_shop_customers(uuid) from public, anon, authenticated;
revoke all on function public.shop_listing_cpu_reference(shop_listings) from public, anon, authenticated;
