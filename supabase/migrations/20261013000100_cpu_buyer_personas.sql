-- CPU buyer personas: who walks into a player's shop (and who bids on
-- auctions), how they price, and how they haggle.
--
-- * cpu_buyer_personas: 20 archetypes (13 + one loyalist per colour) with a
--   budget band, a hard multiplier cap, hidden walk-away headroom, patience
--   (counters they will sit through), a concession curve, a temper, tastes
--   and a market bid style. Dialogue lives client-side; the server only
--   returns persona_id + mood + event.
-- * spawn_shop_customers: picks the listing as before, then a persona
--   weighted by how well it matches what is on the shelf (and regulars).
--   Offers rise with taste matches, reputation and regular status, but stay
--   bounded by min(asking price, 1.6 x market reference). Bundle offers (two
--   listings, 8% off) and trade-plus-cash offers.
-- * respond_shop_customer: up to 3 counters, deterministic (no random()),
--   with a mood meter; meet-in-the-middle, walk-away threats, insults,
--   'final' (take-it-or-leave-it) counters.
-- * shop_regulars: per (shop, persona) visit/good-deal memory.
-- * run_cpu_bidders: persona + bid style (sniper, early_bird, steady,
--   bluffer); ceilings unchanged. The stale-row cleanup DELETE moved to
--   20261013000190_pending_cpu_buyer_personas.sql.
-- Idempotent: safe to run twice.

create table if not exists public.cpu_buyer_personas (
  id text primary key,
  archetype text not null,
  names text[] not null,
  budget_lo numeric not null,
  budget_hi numeric not null,
  max_mult numeric not null,
  give numeric not null,
  patience int not null check (patience between 1 and 3),
  concession numeric not null,
  temper int not null,
  fav_essence text,
  fav_rarities text[] not null default '{}',
  fav_service text,
  loves_foil boolean not null default false,
  loves_slab boolean not null default false,
  loves_variant boolean not null default false,
  loves_pristine boolean not null default false,
  trade_rate numeric not null default 0.25,
  bid_style text not null check (bid_style in ('sniper', 'early_bird', 'steady', 'bluffer'))
);
alter table public.cpu_buyer_personas enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'cpu_buyer_personas' and policyname = 'cpu_buyer_personas_read') then
    create policy cpu_buyer_personas_read on public.cpu_buyer_personas for select using (true);
  end if;
end $$;
grant select on public.cpu_buyer_personas to anon, authenticated;

insert into public.cpu_buyer_personas
  (id, archetype, names, budget_lo, budget_hi, max_mult, give, patience, concession, temper,
   fav_essence, fav_rarities, fav_service, loves_foil, loves_slab, loves_variant, loves_pristine,
   trade_rate, bid_style)
values
  ('tightfist', 'Tight-Fisted Collector', array['Collector Vex','Penny Pinchwell','Miser Mott'],
     0.60, 0.85, 1.05, 0.10, 3, 0.35, 15, null, array['Rare','Super-Rare'], null, false, false, false, false, 0.30, 'sniper'),
  ('kid', 'Impulsive Kid', array['Rookie Dax','Little Fizz','Kip Sparkle'],
     0.85, 1.20, 1.30, 0.25, 1, 0.80, 10, null, array['Common','Uncommon','Full-Art'], null, true, false, false, false, 0.45, 'early_bird'),
  ('slabsnob', 'Slab Snob', array['The Appraiser','Lord Casewell','Grader Greer'],
     0.85, 1.10, 1.35, 0.15, 2, 0.50, 30, null, '{}', 'tca', false, true, false, true, 0.05, 'steady'),
  ('foilhunter', 'Foil Hunter', array['Glint Mags','Shimmer Sue','Holo Hank'],
     0.80, 1.10, 1.30, 0.18, 2, 0.55, 20, null, '{}', null, true, false, true, false, 0.25, 'early_bird'),
  ('completer', 'Set Completer', array['Checklist Chen','Binder Bea','Ollie Index'],
     0.80, 1.05, 1.25, 0.20, 3, 0.60, 15, null, array['Common','Uncommon','Rare'], null, false, false, false, false, 0.35, 'steady'),
  ('flipper', 'Flipper', array['Pip the Flipper','Resell Russ','Margin Mo'],
     0.55, 0.80, 0.95, 0.08, 3, 0.30, 25, null, '{}', null, false, true, false, false, 0.20, 'sniper'),
  ('veteran', 'Nostalgic Veteran', array['Old Man Brine','Nana Glim','Grandpa Gristle'],
     0.85, 1.10, 1.25, 0.20, 2, 0.60, 15, null, array['Mythic','Ultra-Rare'], 'keeper', false, false, false, false, 0.15, 'steady'),
  ('pristine', 'Pristine Chaser', array['Mint Marisol','Ten Tobias','Perfecta Prim'],
     0.95, 1.25, 1.45, 0.15, 2, 0.45, 35, null, '{}', 'amg', false, true, false, true, 0.00, 'sniper'),
  ('bargain', 'Bargain Bin Diver', array['Bin Diver Bo','Thrifty Thea','Scraps McGee'],
     0.50, 0.75, 0.90, 0.10, 3, 0.40, 10, null, array['Common','Uncommon'], null, false, false, false, false, 0.40, 'sniper'),
  ('whale', 'Whale', array['Baron Sable','Duchess Goldleaf','Mr. Moneybags'],
     1.05, 1.35, 1.50, 0.25, 1, 0.80, 20, null, array['Mythic','Full-Art','Ultra-Rare'], null, false, true, true, false, 0.05, 'early_bird'),
  ('gambler', 'Superstitious Gambler', array['Lucky Lou','Madame Seven','Dice Delia'],
     0.60, 1.40, 1.40, 0.20, 2, 0.50, 20, null, '{}', null, false, false, true, false, 0.30, 'bluffer'),
  ('rival', 'Rival Shopkeeper', array['Shade Dealer','Void Clerk','Cutthroat Cass'],
     0.65, 0.90, 1.00, 0.10, 3, 0.35, 25, null, '{}', null, false, true, false, false, 0.25, 'bluffer'),
  ('tourist', 'Tourist', array['Wanda Wander','Snapshot Sam','Backpack Bex'],
     0.75, 1.15, 1.25, 0.25, 1, 0.70, 10, null, '{}', null, true, false, false, false, 0.10, 'early_bird'),
  ('loyal_ember', 'Ember Loyalist', array['Ember Annie','Cinder Cole','Blaze Bianca'],
     0.80, 1.10, 1.30, 0.20, 2, 0.55, 20, 'Ember', '{}', null, false, false, false, false, 0.30, 'bluffer'),
  ('loyal_gale', 'Gale Loyalist', array['Madame Gale','Zephyr Zed','Breezy Bree'],
     0.80, 1.10, 1.30, 0.20, 2, 0.55, 20, 'Gale', '{}', null, false, false, false, false, 0.30, 'steady'),
  ('loyal_light', 'Light Loyalist', array['Lumen Kid','Halo Hal','Dawn Daria'],
     0.80, 1.10, 1.30, 0.20, 2, 0.55, 20, 'Light', '{}', null, false, false, false, false, 0.30, 'early_bird'),
  ('loyal_root', 'Root Loyalist', array['Sir Rootsworth','Moss Mabel','Bramble Ben'],
     0.80, 1.10, 1.30, 0.20, 2, 0.55, 20, 'Root', '{}', null, false, false, false, false, 0.30, 'steady'),
  ('loyal_shadow', 'Shadow Loyalist', array['Umbra Ula','Shady Silas','Nox Nora'],
     0.80, 1.10, 1.30, 0.20, 2, 0.55, 20, 'Shadow', '{}', null, false, false, false, false, 0.30, 'sniper'),
  ('loyal_tide', 'Tide Loyalist', array['Captain Tidewell','Coral Cora','Surf Sully'],
     0.80, 1.10, 1.30, 0.20, 2, 0.55, 20, 'Tide', '{}', null, false, false, false, false, 0.30, 'steady'),
  ('loyal_void', 'Void Loyalist', array['Null Nell','Abyss Abe','Hollow Hugo'],
     0.80, 1.10, 1.30, 0.20, 2, 0.55, 20, 'Void', '{}', null, false, false, false, false, 0.30, 'bluffer')
on conflict (id) do update set
  archetype = excluded.archetype, names = excluded.names, budget_lo = excluded.budget_lo,
  budget_hi = excluded.budget_hi, max_mult = excluded.max_mult, give = excluded.give,
  patience = excluded.patience, concession = excluded.concession, temper = excluded.temper,
  fav_essence = excluded.fav_essence, fav_rarities = excluded.fav_rarities,
  fav_service = excluded.fav_service, loves_foil = excluded.loves_foil,
  loves_slab = excluded.loves_slab, loves_variant = excluded.loves_variant,
  loves_pristine = excluded.loves_pristine, trade_rate = excluded.trade_rate,
  bid_style = excluded.bid_style;

alter table public.shop_customers add column if not exists persona_id text;
alter table public.shop_customers add column if not exists mood_score int not null default 50;
alter table public.shop_customers add column if not exists rounds int not null default 0;
alter table public.shop_customers add column if not exists last_event text not null default 'arrive';
alter table public.shop_customers add column if not exists seed int not null default 0;
alter table public.shop_customers add column if not exists bundle_listing_id uuid;
alter table public.shop_customers add column if not exists trade_cash int not null default 0;
alter table public.shop_customers add column if not exists regular boolean not null default false;
alter table public.shop_customers add column if not exists event_log jsonb not null default '[]'::jsonb;

create table if not exists public.shop_regulars (
  owner uuid not null,
  persona_id text not null,
  visits int not null default 0,
  good_deals int not null default 0,
  last_visit timestamptz,
  primary key (owner, persona_id)
);
alter table public.shop_regulars enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'shop_regulars' and policyname = 'shop_regulars_own') then
    create policy shop_regulars_own on public.shop_regulars for select using (owner = auth.uid());
  end if;
end $$;
grant select on public.shop_regulars to authenticated;

alter table public.market_listing_cpu add column if not exists persona_id text;
alter table public.market_listing_cpu add column if not exists bid_style text;

-- Hard ceiling multiplier on any CPU shop offer: min(asking, ref x this).
create or replace function public.shop_offer_cap_mult()
returns numeric language sql immutable set search_path = public as $$ select 1.6::numeric $$;

-- Deterministic [0,1) from a text seed.
create or replace function public.seeded_unit(p_seed text)
returns numeric language sql immutable set search_path = public as $$
  select ((get_byte(decode(md5(p_seed), 'hex'), 0) * 256
           + get_byte(decode(md5(p_seed), 'hex'), 1))::numeric) / 65536;
$$;

-- Shop reputation bonus in [0, 0.08]: unlocked rating plus fair deals in 7 days.
create or replace function public.shop_reputation_bonus(p_owner uuid)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v_score numeric := 0; v_deals int := 0;
begin
  begin
    select case when rating_unlocked then coalesce(composite_score, 0) else 0 end
      into v_score from player_shop_ratings where owner = p_owner;
  exception when undefined_table then v_score := 0;
  end;
  select count(*) into v_deals from shop_customers
   where owner = p_owner and status = 'accepted' and resolved_at > now() - interval '7 days';
  return least(0.08, greatest(0, coalesce(v_score, 0)) / 5.0 * 0.05 + least(v_deals, 10) * 0.003);
end $$;

-- How many of a persona's tastes a listing hits.
create or replace function public.shop_persona_hits(p cpu_buyer_personas, l shop_listings)
returns int language plpgsql stable security definer set search_path = public as $$
declare
  v_item jsonb := l.cards->0;
  v_card cards%rowtype;
  v_foil boolean := coalesce((v_item->>'foil')::boolean, false);
  v_variant text := nullif(v_item->>'variant', '');
  v_service text := v_item->>'service';
  v_pristine boolean := coalesce((v_item->>'pristine')::boolean, false);
  v_hits int := 0;
begin
  select * into v_card from cards where id = v_item->>'card_id';
  if l.graded_id is not null then
    select coalesce(g.service, v_service), coalesce(g.pristine, false), g.foil, coalesce(g.variant, v_variant)
      into v_service, v_pristine, v_foil, v_variant
      from graded_cards g where g.id = l.graded_id;
  end if;
  if p.fav_essence is not null and p.fav_essence = any(coalesce(v_card.essence_types, '{}')) then v_hits := v_hits + 2; end if;
  if v_card.rarity = any(p.fav_rarities) then v_hits := v_hits + 1; end if;
  if p.loves_foil and coalesce(v_foil, false) then v_hits := v_hits + 1; end if;
  if p.loves_slab and l.graded_id is not null then v_hits := v_hits + 1; end if;
  if p.loves_variant and v_variant is not null then v_hits := v_hits + 1; end if;
  if p.loves_pristine and v_pristine then v_hits := v_hits + 1; end if;
  if p.fav_service is not null and l.graded_id is not null and p.fav_service = v_service then v_hits := v_hits + 1; end if;
  return v_hits;
end $$;

create or replace function public.spawn_shop_customers(p_owner uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_shop player_shops%rowtype;
  v_due int; v_waiting int; v_today int;
  v_l shop_listings%rowtype;
  v_l2 shop_listings%rowtype;
  v_p cpu_buyer_personas%rowtype;
  v_reg shop_regulars%rowtype;
  v_regular boolean;
  v_hits int;
  v_rep numeric;
  v_ref int; v_price int;
  v_factor numeric; v_offer int; v_walk int; v_cap int;
  v_target_price int; v_rarity text; v_card text; v_cap_tier int; v_listing_foil boolean;
  v_offer_foil boolean; v_card_value int; v_cash int;
  v_name text; v_mood int; v_bundle uuid;
  v_seed text;
  i int;
begin
  -- Cheap early exit (one PK lookup, no lock) while nobody is due.
  if exists (select 1 from player_shops where owner = p_owner
              and (status <> 'active' or last_customer_at > now() - interval '90 minutes')) then
    update shop_customers set status = 'expired', resolved_at = now()
     where owner = p_owner and status = 'waiting' and expires_at <= now();
    return;
  end if;
  select * into v_shop from player_shops where owner = p_owner for update;
  if not found or v_shop.status <> 'active' then return; end if;

  update shop_customers set status = 'expired', resolved_at = now()
   where owner = p_owner and status = 'waiting'
     and (expires_at <= now()
          or not exists (select 1 from shop_listings s where s.id = listing_id and s.status = 'active')
          or (bundle_listing_id is not null
              and not exists (select 1 from shop_listings s where s.id = bundle_listing_id and s.status = 'active')));

  if v_shop.last_customer_at is null then v_due := 1;
  else v_due := floor(extract(epoch from now() - v_shop.last_customer_at) / 5400)::int;
  end if;
  if v_due < 1 then return; end if;

  select count(*) into v_waiting from shop_customers where owner = p_owner and status = 'waiting';
  select count(*) into v_today from shop_customers
   where owner = p_owner and created_at > now() - interval '24 hours';
  v_due := least(v_due, 3 - v_waiting, 8 - v_today);
  v_rep := shop_reputation_bonus(p_owner);

  for i in 1..greatest(v_due, 0) loop
    -- Seeded by shop + 90-minute bucket + slot: the same arrivals however
    -- often (or concurrently) the owner refreshes; nothing to reroll.
    v_seed := p_owner::text || ':' || floor(extract(epoch from now()) / 5400)::bigint || ':' || (v_today + i);
    select * into v_l from shop_listings s
     where s.owner = p_owner and s.status = 'active' and s.listing_type in ('individual', 'bundle')
       and not exists (select 1 from shop_customers c where c.status = 'waiting'
                         and (c.listing_id = s.id or c.bundle_listing_id = s.id))
     order by md5(v_seed || s.id::text) limit 1;
    exit when not found;
    v_seed := v_seed || ':' || v_l.id::text;

    -- Weighted persona pick (exponential race): taste matches and regulars count.
    select p.* into v_p from cpu_buyer_personas p
      left join shop_regulars r on r.owner = p_owner and r.persona_id = p.id
     order by -ln(greatest(seeded_unit(v_seed || p.id), 1e-6)::float8)
              / (1 + 2 * shop_persona_hits(p, v_l)
                 + case when coalesce(r.good_deals, 0) > 0 then 2 else 0 end)
     limit 1;
    v_hits := shop_persona_hits(v_p, v_l);

    insert into shop_regulars (owner, persona_id, visits, last_visit)
    values (p_owner, v_p.id, 1, now())
    on conflict (owner, persona_id) do update
      set visits = shop_regulars.visits + 1, last_visit = now()
    returning * into v_reg;
    v_regular := v_reg.visits > 1 and v_reg.good_deals > 0;
    v_name := v_p.names[1 + floor(seeded_unit(v_seed || ':r1') * array_length(v_p.names, 1))::int];
    v_mood := least(90, 45 + 8 * least(v_hits, 3) + case when v_regular then 15 else 0 end
                         + round(v_rep * 100)::int);

    if v_l.graded_id is not null then
      v_ref := round(shop_slab_value(v_l.graded_id)
        * case when coalesce(v_p.fav_service, grading_persona_favourite(v_name)) = (v_l.cards->0->>'service')
               then 1.2 else 1.0 end)::int;
    else
      v_ref := shop_listing_cpu_reference(v_l);
    end if;
    v_price := v_l.price;
    v_bundle := null;

    -- Trade (optionally with cash on top).
    if v_l.listing_type = 'individual' and v_l.graded_id is null and seeded_unit(v_seed || ':r2') < v_p.trade_rate then
      v_card := null;
      v_cap_tier := rarity_tier((select rarity from cards where id = v_l.cards->0->>'card_id'));
      v_listing_foil := coalesce((v_l.cards->0->>'foil')::boolean, false);
      v_target_price := round(v_ref * (0.7 + seeded_unit(v_seed || ':r3') * 0.6))::int;
      select rarity into v_rarity from (
        select distinct rarity from cards where card_type <> 'Leader' and rarity is not null
          and rarity_tier(rarity) <= v_cap_tier
          and set_name in (select unnest(allowed_sets) from pack_types
                            where is_active and acquisition = 'purchase')
      ) r order by abs(card_sell_price(rarity) - v_target_price), md5(v_seed || rarity) limit 1;
      select id into v_card from cards
       where rarity = v_rarity and card_type <> 'Leader'
         and set_name in (select unnest(allowed_sets) from pack_types
                           where is_active and acquisition = 'purchase')
         and id <> (v_l.cards->0->>'card_id')
         and (v_p.fav_essence is null or seeded_unit(v_seed || id) < 0.5 or v_p.fav_essence = any(essence_types))
       order by md5(v_seed || id) limit 1;
      if v_card is not null then
        v_offer_foil := v_listing_foil and seeded_unit(v_seed || ':r4') < 0.10;
        v_card_value := card_sell_price(v_rarity) * case when v_offer_foil then 3 else 1 end;
        -- Cash top-up only when their card is worth less; half the gap, bounded.
        v_cash := case when v_card_value < v_ref
                       then least(round((v_ref - v_card_value) * 0.5)::int,
                                  round(v_ref * 0.3)::int, v_l.price)
                       else 0 end;
        insert into shop_customers (owner, listing_id, kind, persona, persona_id, mood, mood_score,
                                    offer_card_id, offer_foil, trade_cash, seed, regular, last_event)
        values (p_owner, v_l.id, 'trade', v_name, v_p.id,
                (array['curious','eager','shrewd','chatty'])[1 + floor(seeded_unit(v_seed || ':r5') * 4)::int], v_mood,
                v_card, v_offer_foil, greatest(0, v_cash), floor(seeded_unit(v_seed || ':r6') * 2147483647)::int,
                v_regular, case when v_regular then 'return' else 'arrive' end);
        continue;
      end if;
    end if;

    -- Bundle: two plain individual listings together, 8% off the pair.
    if v_l.listing_type = 'individual' and v_l.graded_id is null and seeded_unit(v_seed || ':r7') < 0.2 then
      select * into v_l2 from shop_listings s
       where s.owner = p_owner and s.status = 'active' and s.listing_type = 'individual'
         and s.graded_id is null and s.id <> v_l.id
         and not exists (select 1 from shop_customers c where c.status = 'waiting'
                           and (c.listing_id = s.id or c.bundle_listing_id = s.id))
       order by md5(v_seed || s.id::text) limit 1;
      if found then
        v_bundle := v_l2.id;
        v_ref := round((v_ref + shop_listing_cpu_reference(v_l2)) * 0.92)::int;
        v_price := v_l.price + v_l2.price;
      end if;
    end if;

    v_factor := (v_p.budget_lo + seeded_unit(v_seed || ':r8') * (v_p.budget_hi - v_p.budget_lo))
              * (1 + 0.05 * least(v_hits, 4)) * (1 + v_rep)
              * case when v_regular then 1.03 else 1 end;
    v_cap := least(v_price, ceil(v_ref * least(shop_offer_cap_mult(),
                     v_p.max_mult * (1 + 0.05 * least(v_hits, 4)) * (1 + v_rep)
                     * case when v_regular then 1.03 else 1 end))::int);
    v_offer := least(v_cap, greatest(1, round(v_ref * v_factor)::int));
    v_walk := greatest(v_offer, least(v_cap, round(v_offer * (1 + v_p.give * (0.6 + 0.4 * seeded_unit(v_seed || ':r9'))))::int));
    insert into shop_customers (owner, listing_id, kind, persona, persona_id, mood, mood_score,
                                offer_credits, walkaway_credits, seed, bundle_listing_id, regular, last_event)
    values (p_owner, v_l.id, 'buy', v_name, v_p.id,
            case when v_factor < 0.8 then 'stingy' when v_factor > 1.05 then 'smitten' else 'browsing' end,
            v_mood, v_offer, v_walk, floor(seeded_unit(v_seed || ':r10') * 2147483647)::int, v_bundle, v_regular,
            case when v_bundle is not null then 'bundle' when v_regular then 'return' else 'arrive' end);
  end loop;

  update player_shops
     set last_customer_at = case
       when last_customer_at is null then now()
       else last_customer_at + make_interval(secs => 5400 * greatest(1,
              floor(extract(epoch from now() - last_customer_at) / 5400)::int)) end
   where owner = p_owner;
end $$;

create or replace function public.get_shop_customers()
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform spawn_shop_customers(v_uid);
  return jsonb_build_object(
    'customers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'kind', c.kind, 'persona', c.persona, 'persona_id', c.persona_id,
        'mood', c.mood, 'mood_score', c.mood_score, 'rounds', c.rounds,
        'patience', coalesce(p.patience, 1), 'last_event', c.last_event, 'seed', c.seed,
        'event_log', c.event_log, 'regular', c.regular, 'visits', coalesce(r.visits, 1),
        'offer_credits', c.offer_credits, 'offer_card_id', c.offer_card_id,
        'offer_foil', c.offer_foil, 'trade_cash', c.trade_cash, 'haggled', c.haggled,
        'expires_at', c.expires_at, 'listing_id', c.listing_id,
        'listing_price', s.price, 'listing_cards', s.cards, 'listing_type', s.listing_type,
        'bundle_listing_id', c.bundle_listing_id, 'bundle_price', s2.price, 'bundle_cards', s2.cards
      ) order by c.created_at)
      from shop_customers c join shop_listings s on s.id = c.listing_id
      left join shop_listings s2 on s2.id = c.bundle_listing_id
      left join cpu_buyer_personas p on p.id = c.persona_id
      left join shop_regulars r on r.owner = c.owner and r.persona_id = c.persona_id
      where c.owner = v_uid and c.status = 'waiting'), '[]'::jsonb),
    'served_24h', (select count(*) from shop_customers
                    where owner = v_uid and created_at > now() - interval '24 hours'),
    'next_at', (select last_customer_at + interval '90 minutes' from player_shops where owner = v_uid),
    'regulars', (select count(*) from shop_regulars where owner = v_uid and visits > 1 and good_deals > 0),
    'recent', coalesce((
      select jsonb_agg(x order by x->>'resolved_at' desc) from (
        select jsonb_build_object('persona', persona, 'persona_id', persona_id, 'kind', kind,
                 'status', status, 'final_credits', final_credits, 'offer_card_id', offer_card_id,
                 'seed', seed, 'resolved_at', resolved_at) x
          from shop_customers where owner = v_uid and status <> 'waiting'
         order by resolved_at desc nulls last limit 8) t), '[]'::jsonb)
  );
end $$;

-- Sell one shelf listing to a CPU (shared by single and bundle sales).
create or replace function public.shop_cpu_sell_listing(p_owner uuid, p_l shop_listings)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_l.graded_id is not null then
    perform grading_retire_slab(p_l.graded_id);
    if stat_once_claim(p_owner, 'shopslab:' || p_l.graded_id::text) then
      perform track_stat(p_owner, 'shop_slab_sales', 1, false);
    end if;
  end if;
  update shop_listings set status = 'sold' where id = p_l.id;
  update shop_slots set status = 'empty' where id = p_l.slot_id and status <> 'burned';
  if stat_once_claim(p_owner, 'shopsale:' || p_l.id::text) then
    perform track_stat(p_owner, 'shop_sales', 1, false);
  end if;
end $$;
revoke all on function public.shop_cpu_sell_listing(uuid, shop_listings) from public, anon, authenticated;

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

-- Deterministic persona for an auction listing.
create or replace function public.cpu_bidder_persona(p_listing uuid)
returns cpu_buyer_personas language sql stable set search_path = public as $$
  select * from cpu_buyer_personas order by md5(id || p_listing::text) limit 1;
$$;

create or replace function public.run_cpu_bidders()
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_l market_listings%rowtype;
  v_ceiling int;
  v_style text;
  v_pid text;
  v_p cpu_buyer_personas%rowtype;
  v_ends timestamptz;
  v_rarity text;
  v_unit int;
  v_min int;
  v_bid int;
  v_jump numeric;
  v_acted int := 0;
begin
  if not exists (select 1 from market_listings m
                   left join market_listing_cpu c on c.listing_id = m.id
                  where m.status = 'active' and m.listing_type = 'auction' and not m.cpu_leading
                    and m.ends_at > now() and (c.cpu_next_at is null or c.cpu_next_at <= now())) then
    return 0;
  end if;
  for v_l in
    select m.* from market_listings m
      left join market_listing_cpu c on c.listing_id = m.id
     where m.status = 'active' and m.listing_type = 'auction' and m.ends_at > now()
       and (c.cpu_next_at is null or c.cpu_next_at <= now()) and not m.cpu_leading
     order by m.ends_at limit 40
     for update of m skip locked
  loop
    select cpu_ceiling, bid_style, persona_id into v_ceiling, v_style, v_pid
      from market_listing_cpu where listing_id = v_l.id;
    if v_ceiling is null then
      select rarity into v_rarity from cards where id = v_l.card_id;
      v_unit := card_sell_price(v_rarity);
      if v_l.foil then v_unit := ceil(v_unit * 2.5)::int; end if;
      v_unit := ceil(v_unit * variant_mult(v_l.variant))::int;
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
    if v_pid is null then
      v_p := cpu_bidder_persona(v_l.id);
      v_pid := v_p.id; v_style := v_p.bid_style;
      update market_listing_cpu set persona_id = v_pid, bid_style = v_style where listing_id = v_l.id;
    else
      select * into v_p from cpu_buyer_personas where id = v_pid;
    end if;

    v_min := case when v_l.current_bid is null then v_l.price
                  else v_l.current_bid + greatest(1, ceil(v_l.current_bid * 0.05)::int) end;

    if v_min <= v_ceiling
       and (v_l.buyout is null or v_min < v_l.buyout)
       and (v_style is distinct from 'sniper' or v_l.ends_at - now() < interval '20 minutes')
       and (select count(*) from market_listings
             where seller = v_l.seller and status = 'sold' and cpu_bidder_name is not null
               and current_bidder is null and ends_at > now() - interval '24 hours') < 8
    then
      v_jump := case v_style
        when 'early_bird' then 0.10 + random() * 0.10
        when 'steady' then random() * 0.05
        when 'bluffer' then 0.10 + random() * 0.20
        when 'sniper' then 0.05 + random() * 0.05
        else random() * 0.15 end;
      v_bid := least(v_ceiling, v_min + floor(v_min * v_jump)::int);
      if v_l.buyout is not null then v_bid := least(v_bid, v_l.buyout - 1); end if;
      v_bid := greatest(v_bid, v_min);
      if v_l.current_bidder is not null then
        update profiles set credits = credits + v_l.current_bid, updated_at = now()
         where id = v_l.current_bidder;
      end if;
      update market_listings
         set current_bid = v_bid, current_bidder = null, cpu_leading = true,
             cpu_bidder_name = coalesce(cpu_bidder_name,
               v_p.names[1 + (abs(hashtext(v_l.id::text)) % array_length(v_p.names, 1))],
               cpu_persona_name()),
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
             when v_ends - now() < interval '20 minutes' then interval '5 minutes'
             when v_style = 'sniper' then least(v_ends - now() - interval '19 minutes', interval '60 minutes')
             else make_interval(mins => 10 + floor(random() * 50)::int) end)
    on conflict (listing_id) do update set cpu_next_at = excluded.cpu_next_at;
  end loop;
  -- Stale-row cleanup for finished listings: see the pending file.
  return v_acted;
end;
$$;

revoke all on function public.shop_reputation_bonus(uuid) from public, anon, authenticated;
revoke all on function public.shop_persona_hits(cpu_buyer_personas, shop_listings) from public, anon, authenticated;
revoke all on function public.cpu_bidder_persona(uuid) from public, anon, authenticated;

-- Indexes for the new lookups.
create index if not exists shop_customers_bundle_listing_idx
  on public.shop_customers (bundle_listing_id) where bundle_listing_id is not null;
create index if not exists shop_customers_waiting_idx
  on public.shop_customers (owner) where status = 'waiting';
create index if not exists market_listing_cpu_next_idx on public.market_listing_cpu (cpu_next_at);
create index if not exists market_listings_auction_open_idx
  on public.market_listings (ends_at) where status = 'active' and listing_type = 'auction' and not cpu_leading;

-- Cron gate: only run when a listing has ended or an auction is open to CPU bids.
do $$ begin
  if to_regclass('cron.job') is not null then
    perform cron.alter_job(jobid, command =>
      'select public.settle_expired_listings() where exists (select 1 from public.market_listings '
      || 'where status = ''active'' and (ends_at <= now() or (listing_type = ''auction'' and not cpu_leading)))')
      from cron.job where jobname = 'settle-market-and-cpu-bidders';
  end if;
end $$;
