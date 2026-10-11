-- Applied live as its own step: respond_shop_customer logs the opening offer
-- (also folded into 20261013000100, so this re-run is a no-op).
create or replace function public.respond_shop_customer(p_id uuid, p_action text, p_counter integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_c shop_customers%rowtype;
  v_l shop_listings%rowtype;
  v_l2 shop_listings%rowtype;
  v_p cpu_buyer_personas%rowtype;
  v_price int;
  v_ask int;
  v_walk int;
  v_ratio numeric;
  v_mood int;
  v_rounds int;
  v_offer int;
  v_event text;
  v_log jsonb;
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
  v_ask := v_l.price;
  if v_c.bundle_listing_id is not null then
    select * into v_l2 from shop_listings where id = v_c.bundle_listing_id and owner = v_uid for update;
    if not found or v_l2.status <> 'active' then
      update shop_customers set status = 'left', resolved_at = now() where id = p_id;
      raise exception 'Part of that bundle is no longer on your shelf';
    end if;
    v_ask := v_ask + v_l2.price;
  end if;
  select * into v_p from cpu_buyer_personas where id = v_c.persona_id;
  if not found then
    v_p.patience := 1; v_p.concession := 0.5; v_p.temper := 20;
  end if;
  -- Log the opening offer once, so the client can replay the whole exchange.
  v_log := case when jsonb_array_length(v_c.event_log) = 0 and v_c.kind = 'buy'
                then jsonb_build_array(jsonb_build_object('e', 'offer', 'v', v_c.offer_credits))
                else v_c.event_log end;

  if p_action = 'decline' then
    update shop_customers set status = 'declined', resolved_at = now(), last_event = 'declined',
           event_log = v_log || jsonb_build_array(jsonb_build_object('e', 'declined'))
     where id = p_id;
    return jsonb_build_object('ok', true, 'result', 'declined', 'event', 'declined');
  end if;

  if p_action in ('counter', 'final') then
    if v_c.kind <> 'buy' then raise exception 'Trade offers cannot be haggled'; end if;
    if v_c.haggled then raise exception 'This customer will not haggle again'; end if;
    if p_counter is null or p_counter <= v_c.offer_credits then
      raise exception 'A counter-offer has to be more than their % credit offer', v_c.offer_credits;
    end if;
    if p_counter > v_ask then raise exception 'A counter cannot be above your asking price'; end if;
    -- A good mood stretches the walk-away a little, never past the caps.
    v_walk := v_c.walkaway_credits;
    if v_c.mood_score > 50 then
      v_walk := least(v_ask, greatest(v_walk, round(v_walk * (1 + (v_c.mood_score - 50) / 500.0))::int));
    end if;
    v_log := v_log || jsonb_build_array(jsonb_build_object('e', p_action, 'v', p_counter));
    v_rounds := v_c.rounds + 1;
    v_mood := v_c.mood_score;
    v_offer := v_c.offer_credits;

    if p_counter <= v_walk then
      v_price := p_counter;
      v_event := 'accept_counter';
    else
      v_ratio := p_counter::numeric / greatest(v_walk, 1);
      if p_action = 'final' then
        v_event := 'walkout';
      elsif v_ratio > 1.4 then
        v_mood := v_mood - v_p.temper;
        v_event := case when v_mood <= 15 or v_rounds >= v_p.patience then 'walkout' else 'insulted' end;
      elsif v_ratio > 1.15 then
        v_mood := v_mood - 12;
        v_offer := least(v_walk, greatest(v_offer + 1, round(v_offer + (v_walk - v_offer) * 0.25)::int));
        v_event := case when v_rounds >= v_p.patience then 'final_offer' else 'threat' end;
      else
        v_mood := v_mood - 3;
        v_offer := least(v_walk, greatest(v_offer + 1,
                     round(v_offer + (least(p_counter, v_walk) - v_offer) * v_p.concession)::int));
        v_event := case when v_rounds >= v_p.patience then 'final_offer' else 'meet_middle' end;
      end if;
      if v_event not in ('walkout') and v_mood <= 10 then v_event := 'walkout'; end if;
      if v_event = 'final_offer' then v_offer := v_walk; end if;

      if v_event = 'walkout' then
        update shop_customers set status = 'left', haggled = true, resolved_at = now(),
               rounds = v_rounds, mood_score = greatest(0, v_mood), last_event = 'walkout',
               event_log = v_log || jsonb_build_array(jsonb_build_object('e', 'walkout'))
         where id = p_id;
        update shop_regulars set good_deals = greatest(0, good_deals - 1)
         where owner = v_uid and persona_id = v_c.persona_id;
        return jsonb_build_object('ok', true, 'result', 'left', 'event', 'walkout',
                                  'mood_score', greatest(0, v_mood));
      end if;
      update shop_customers
         set rounds = v_rounds, mood_score = v_mood, offer_credits = v_offer, last_event = v_event,
             haggled = (v_event = 'final_offer'),
             event_log = v_log || jsonb_build_array(jsonb_build_object('e', v_event, 'v', v_offer))
       where id = p_id;
      return jsonb_build_object('ok', true,
        'result', case when v_event = 'final_offer' then 'final_offer' else 'countered' end,
        'event', v_event, 'offer', v_offer, 'mood_score', v_mood,
        'rounds', v_rounds, 'patience', v_p.patience);
    end if;
  elsif p_action = 'accept' then
    v_price := v_c.offer_credits;
    v_event := 'thanks';
  else
    raise exception 'Unknown action';
  end if;

  perform settle_shop_maintenance(v_uid);
  perform shop_cpu_sell_listing(v_uid, v_l);
  if v_c.bundle_listing_id is not null then perform shop_cpu_sell_listing(v_uid, v_l2); end if;

  if v_c.kind = 'buy' then
    v_price := least(v_price, v_ask);
    update profiles set credits = credits + v_price, updated_at = now() where id = v_uid;
    perform track_stat(v_uid, 'shop_cpu_sales', 1, false);
  else
    v_price := coalesce(v_c.trade_cash, 0);
    insert into player_cards (user_id, card_id, quantity, foil_quantity)
    values (v_uid, v_c.offer_card_id, case when v_c.offer_foil then 0 else 1 end,
            case when v_c.offer_foil then 1 else 0 end)
    on conflict (user_id, card_id) do update
      set quantity = player_cards.quantity + excluded.quantity,
          foil_quantity = player_cards.foil_quantity + excluded.foil_quantity;
    if v_price > 0 then
      update profiles set credits = credits + v_price, updated_at = now() where id = v_uid;
    end if;
    perform track_stat(v_uid, 'shop_cpu_trades', 1, false);
  end if;

  update shop_regulars set good_deals = good_deals + 1
   where owner = v_uid and persona_id = v_c.persona_id;
  update shop_customers set status = 'accepted', final_credits = v_price, resolved_at = now(),
         last_event = 'thanks',
         event_log = v_log || jsonb_build_array(jsonb_build_object('e', 'thanks', 'v', v_price))
   where id = p_id;
  return jsonb_build_object('ok', true, 'result', 'sold', 'event', 'thanks', 'credits', v_price,
                            'card_id', v_c.offer_card_id, 'foil', v_c.offer_foil);
end $$;
