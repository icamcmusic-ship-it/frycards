-- 2026-10-06: CPU auction bidders and the Shop Floor (CPU customers).
--
-- Both are single-player sources of credits, so both are priced off the
-- server's own reference (card_sell_price, the quicksell table), never off a
-- price the player typed, and both are rate-limited per player per day.
--
-- CPU BIDDERS
--   Every auction gets a hidden ceiling the first time the CPU looks at it:
--   quicksell x quantity x a factor drawn from a skewed table:
--     25%  0.50 - 0.85   (lowball: the CPU drops out early)
--     55%  0.85 - 1.25   (the usual: up to +25% over quicksell)
--     15%  1.25 - 1.60   (a keen buyer)
--      5%  1.60 - 2.50   (a collector who has to have it)
--   EV is ~1.06x quicksell, minus the 5% market fee: about break-even with
--   quicksell, so listing at auction is a gamble, not a farm. The CPU only
--   acts between random 10-60 minute gaps (5 in the final 15 minutes), bids
--   the minimum raise plus a random 0-15% jump, never above its ceiling, and
--   will counter a human outbid while the ceiling allows. A CPU-won auction is
--   paid out like any sale (seller gets bid - 5%), the cards leave the game,
--   and the sale is recorded as status 'sold' with current_bid set, so it
--   feeds get_card_market_value / card_blended_reference like a human sale.
--   At most 8 CPU-won auctions per seller per rolling 24h.
--
-- SHOP FLOOR (CPU customers)
--   One customer walks into an open shop every ~90 minutes of real time
--   (at most 3 waiting, at most 8 arrivals per rolling 24h, each leaves after
--   6h). A customer targets one active individual/bundle listing and either
--     BUYS: offers reference x factor (15% 0.55-0.80, 60% 0.80-1.05,
--           20% 1.05-1.20, 5% 1.20-1.40), never above the asking price;
--     TRADES (35%, individual listings only): offers a random card worth
--           roughly the listing's reference, 10% foil.
--   "reference" is quicksell (blended into the market reference at listing
--   time) capped at 2x quicksell, so a pumped market price cannot be farmed.
--   The owner may accept, decline, or haggle ONCE on a buy offer: each
--   customer has a hidden walk-away price 5-25% over the offer (capped at the
--   asking price). A counter at or under it sells; over it, the customer
--   either leaves (60%) or names its final price.

-- CPU BIDDERS -----------------------------------------------------------------
alter table public.market_listings add column if not exists cpu_ceiling int;
alter table public.market_listings add column if not exists cpu_leading boolean not null default false;
alter table public.market_listings add column if not exists cpu_bidder_name text;
alter table public.market_listings add column if not exists cpu_next_at timestamptz;

-- A human bid (or Buy Now) always takes the lead from the CPU.
create or replace function public.market_listing_cpu_lead_guard()
returns trigger language plpgsql set search_path to 'public' as $$
begin
  if new.current_bidder is not null then new.cpu_leading := false; end if;
  return new;
end;
$$;
create or replace trigger market_listings_cpu_lead_guard before update on public.market_listings
  for each row execute function public.market_listing_cpu_lead_guard();

create or replace function public.cpu_ceiling_factor()
returns numeric language plpgsql volatile set search_path to 'public' as $$
declare r numeric := random();
begin
  if r < 0.25 then return 0.50 + random() * 0.35; end if;
  if r < 0.80 then return 0.85 + random() * 0.40; end if;
  if r < 0.95 then return 1.25 + random() * 0.35; end if;
  return 1.60 + random() * 0.90;
end;
$$;

create or replace function public.cpu_persona_name()
returns text language sql volatile set search_path to 'public' as $$
  select (array['Collector Vex','Old Man Brine','Pip the Flipper','Madame Gale','Sir Rootsworth',
                'Lumen Kid','Shade Dealer','Captain Tidewell','Ember Annie','Void Clerk',
                'The Appraiser','Nana Glim','Rookie Dax','Baron Sable'])[1 + floor(random() * 14)::int];
$$;

create or replace function public.run_cpu_bidders()
returns integer language plpgsql security definer set search_path to 'public' as $$
declare
  v_l market_listings%rowtype;
  v_rarity text;
  v_unit int;
  v_min int;
  v_bid int;
  v_acted int := 0;
begin
  for v_l in
    select * from market_listings
     where status = 'active' and listing_type = 'auction' and ends_at > now()
       and (cpu_next_at is null or cpu_next_at <= now()) and not cpu_leading
     order by ends_at limit 40
     for update skip locked
  loop
    if v_l.cpu_ceiling is null then
      select rarity into v_rarity from cards where id = v_l.card_id;
      v_unit := card_sell_price(v_rarity);
      if v_l.foil then v_unit := ceil(v_unit * 2.5)::int; end if;
      v_l.cpu_ceiling := greatest(1, round(v_unit * v_l.quantity * cpu_ceiling_factor())::int);
      update market_listings set cpu_ceiling = v_l.cpu_ceiling where id = v_l.id;
    end if;

    v_min := case when v_l.current_bid is null then v_l.price
                  else v_l.current_bid + greatest(1, ceil(v_l.current_bid * 0.05)::int) end;

    if v_min <= v_l.cpu_ceiling
       and (v_l.buyout is null or v_min < v_l.buyout)
       and (select count(*) from market_listings
             where seller = v_l.seller and status = 'sold' and cpu_bidder_name is not null
               and current_bidder is null and ends_at > now() - interval '24 hours') < 8
    then
      v_bid := least(v_l.cpu_ceiling, v_min + floor(v_min * random() * 0.15)::int);
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
       where id = v_l.id;
      v_acted := v_acted + 1;
    end if;

    update market_listings
       set cpu_next_at = now() + case
             when ends_at - now() < interval '15 minutes' then interval '5 minutes'
             else make_interval(mins => 10 + floor(random() * 50)::int) end
     where id = v_l.id;
  end loop;
  return v_acted;
end;
$$;

-- settle_expired_listings: run the CPU first, then pay out CPU-won auctions.
create or replace function public.settle_expired_listings()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
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
      perform finalize_sale(v_l, v_l.current_bidder, v_l.current_bid);
      update market_listings set status = 'sold' where id = v_l.id;
    elsif v_l.listing_type = 'auction' and v_l.cpu_leading and v_l.current_bid is not null then
      -- CPU won: seller paid less the 5% fee; the cards leave the game.
      update profiles
         set credits = credits + (v_l.current_bid - ceil(v_l.current_bid * 0.05))::int,
             updated_at = now()
       where id = v_l.seller;
      perform track_stat(v_l.seller, 'market_sales', 1, false);
      perform track_stat(v_l.seller, 'cpu_auction_sales', 1, false);
      update market_listings set status = 'sold' where id = v_l.id;
    else
      insert into player_cards (user_id, card_id, quantity, foil_quantity)
      values (v_l.seller, v_l.card_id,
              case when v_l.foil then 0 else v_l.quantity end,
              case when v_l.foil then v_l.quantity else 0 end)
      on conflict (user_id, card_id) do update
        set quantity = player_cards.quantity + excluded.quantity,
            foil_quantity = player_cards.foil_quantity + excluded.foil_quantity;
      update market_listings set status = 'expired' where id = v_l.id;
    end if;
    v_settled := v_settled + 1;
  end loop;
  return jsonb_build_object('ok', true, 'settled', v_settled, 'cpu_bids', v_cpu);
end;
$$;

revoke all on function public.run_cpu_bidders() from public, anon, authenticated;
revoke all on function public.cpu_ceiling_factor() from public, anon, authenticated;
revoke all on function public.cpu_persona_name() from public, anon, authenticated;

-- SHOP FLOOR ------------------------------------------------------------------
create table if not exists public.shop_customers (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references public.player_shops(owner) on delete cascade,
  listing_id uuid not null references public.shop_listings(id) on delete cascade,
  kind text not null check (kind in ('buy', 'trade')),
  persona text not null,
  mood text not null,
  offer_credits int,
  walkaway_credits int,
  offer_card_id text references public.cards(id),
  offer_foil boolean not null default false,
  haggled boolean not null default false,
  status text not null default 'waiting'
    check (status in ('waiting', 'accepted', 'declined', 'left', 'expired')),
  final_credits int,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '6 hours',
  resolved_at timestamptz
);
create index if not exists shop_customers_owner_idx on public.shop_customers (owner, status, created_at);
alter table public.shop_customers enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'shop_customers'
                  and policyname = 'owner reads own customers') then
    create policy "owner reads own customers" on public.shop_customers
      for select using (owner = auth.uid());
  end if;
end $$;

alter table public.player_shops add column if not exists last_customer_at timestamptz;

create or replace function public.shop_listing_cpu_reference(p_l shop_listings)
returns int language plpgsql stable set search_path to 'public' as $$
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
  return greatest(1, least(coalesce(p_l.reference_price, v_qs), v_qs * 2));
end;
$$;

create or replace function public.spawn_shop_customers(p_owner uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
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
      -- TRADE: a card whose quicksell sits nearest the listing's reference
      v_card := null;
      v_target_price := round(v_ref * (0.7 + random() * 0.6))::int;
      select rarity into v_rarity from (
        select distinct rarity from cards where card_type <> 'Leader' and rarity is not null
      ) r order by abs(card_sell_price(rarity) - v_target_price), random() limit 1;
      select id into v_card from cards
       where rarity = v_rarity and card_type <> 'Leader'
         and id <> (v_l.cards->0->>'card_id')
       order by random() limit 1;
      if v_card is not null then
        insert into shop_customers (owner, listing_id, kind, persona, mood, offer_card_id, offer_foil)
        values (p_owner, v_l.id, 'trade', cpu_persona_name(),
                (array['curious','eager','shrewd','chatty'])[1 + floor(random() * 4)::int],
                v_card, random() < 0.10);
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
$$;

create or replace function public.get_shop_customers()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform spawn_shop_customers(v_uid);
  return jsonb_build_object(
    'customers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'persona', c.persona, 'mood', c.mood,
        'offer_credits', c.offer_credits, 'offer_card_id', c.offer_card_id,
        'offer_foil', c.offer_foil, 'haggled', c.haggled,
        'expires_at', c.expires_at, 'listing_id', c.listing_id,
        'listing_price', s.price, 'listing_cards', s.cards, 'listing_type', s.listing_type
      ) order by c.created_at)
      from shop_customers c join shop_listings s on s.id = c.listing_id
      where c.owner = v_uid and c.status = 'waiting'), '[]'::jsonb),
    'served_24h', (select count(*) from shop_customers
                    where owner = v_uid and created_at > now() - interval '24 hours'),
    'next_at', (select last_customer_at + interval '90 minutes' from player_shops where owner = v_uid),
    'recent', coalesce((
      select jsonb_agg(x order by x->>'resolved_at' desc) from (
        select jsonb_build_object('persona', persona, 'kind', kind, 'status', status,
                 'final_credits', final_credits, 'offer_card_id', offer_card_id,
                 'resolved_at', resolved_at) x
          from shop_customers where owner = v_uid and status <> 'waiting'
         order by resolved_at desc nulls last limit 8) t), '[]'::jsonb)
  );
end;
$$;

-- p_action: 'accept' | 'decline' | 'counter' (with p_counter credits).
create or replace function public.respond_shop_customer(p_id uuid, p_action text, p_counter int default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_c shop_customers%rowtype;
  v_l shop_listings%rowtype;
  v_price int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
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
    if p_counter is null or p_counter < 1 then raise exception 'Invalid counter-offer'; end if;
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

  update shop_customers set status = 'accepted', final_credits = v_price, resolved_at = now()
   where id = p_id;
  return jsonb_build_object('ok', true, 'result', 'sold', 'credits', v_price,
                            'card_id', v_c.offer_card_id, 'foil', v_c.offer_foil);
end;
$$;

revoke all on function public.spawn_shop_customers(uuid) from public, anon, authenticated;
revoke all on function public.shop_listing_cpu_reference(shop_listings) from public, anon, authenticated;
revoke all on function public.get_shop_customers() from public, anon;
revoke all on function public.respond_shop_customer(uuid, text, int) from public, anon;
grant execute on function public.get_shop_customers() to authenticated;
grant execute on function public.respond_shop_customer(uuid, text, int) to authenticated;
