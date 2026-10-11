-- Grading, part 2: slab trade-ins, slabs on the Marketplace, grade insurance,
-- slab missions/achievements. Builds on 20261012000006_grading_redesign.sql.
--
--  * TRADE-INS: five slabs graded below 7 → one free-grading token, redeemable
--    at any house at standard speed. Traded slabs are RETIRED, not deleted:
--    grade goes back to null (the original is kept in retired_grade) and
--    ready_at to 'infinity', so the live quicksell/crack refuse them ("still
--    being graded"), reveal never re-rolls them, the pop trigger counts them
--    out, slabs_mint/gem_mints never re-fire, and a trigger prunes showcase
--    pins. (Retiring instead of deleting keeps this migration DELETE-free.)
--  * MARKETPLACE: a slab can be listed (fixed or auction). It stays in
--    graded_cards with listing_id set — escrow: crack/quicksell (BEFORE DELETE
--    guard), crossover, trade-in and re-listing all refuse it. A sale moves
--    graded_cards.user_id to the buyer (the existing owner-change trigger
--    prunes showcase pins); a CPU win retires it to the collector. Listings
--    snapshot grade/company/pristine for a per card+grade+company value
--    reference, and the CPU bidder is picked at listing time with a favourite
--    house that lifts its ceiling ×1.2.
--  * INSURANCE: +10% of the fee at submission; a direct grade below 7 refunds
--    the base fee (in credits). The premium is never refunded.
--  * STATS: pristine_slabs, crossover_upgrades, slab_trade_ins,
--    slabs_sold_market (once per slab per seller), insured_saves,
--    registry_milestones, registry_complete — with achievements and two
--    rotating weekly missions.
--
-- Idempotent; no DROP or DELETE statements.

-- ---------------------------------------------------------------------------
-- Columns and tables
-- ---------------------------------------------------------------------------
alter table graded_cards add column if not exists listing_id uuid;
alter table graded_cards add column if not exists retired boolean not null default false;
alter table graded_cards add column if not exists retired_grade numeric;
alter table graded_cards add column if not exists insured boolean not null default false;
alter table graded_cards add column if not exists insurance_paid int not null default 0;
alter table graded_cards add column if not exists graded_by uuid;

alter table market_listings add column if not exists graded_id uuid;
alter table market_listings add column if not exists slab_grade numeric;
alter table market_listings add column if not exists slab_service text;
alter table market_listings add column if not exists slab_pristine boolean not null default false;

create table if not exists grading_tokens (
  user_id uuid primary key,
  tokens int not null default 0,
  earned int not null default 0,
  used int not null default 0
);
alter table grading_tokens enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'grading_tokens' and policyname = 'grading_tokens_select_own') then
    create policy grading_tokens_select_own on grading_tokens for select using ((select auth.uid()) = user_id);
  end if;
end $$;
grant select on grading_tokens to authenticated;

-- Who graded a slab: the registry counts only slabs you graded yourself, so a
-- slab bought on the market (or passed between accounts) can't fill it.
create or replace function graded_cards_set_graded_by() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.graded_by is null then new.graded_by := new.user_id; end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'graded_cards_graded_by'
                  and tgrelid = 'graded_cards'::regclass) then
    create trigger graded_cards_graded_by before insert on graded_cards
      for each row execute function graded_cards_set_graded_by();
  end if;
end $$;
update graded_cards set graded_by = user_id where graded_by is null;

-- Escrow: a slab on an active listing can't be sold back to the house or
-- cracked (the live quicksell/crack delete the row; this stops them).
create or replace function graded_cards_escrow_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.listing_id is not null
     and exists (select 1 from market_listings where id = old.listing_id and status = 'active') then
    raise exception 'That slab is listed on the Marketplace — cancel the listing first';
  end if;
  return old;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'graded_cards_escrow'
                  and tgrelid = 'graded_cards'::regclass) then
    create trigger graded_cards_escrow before delete on graded_cards
      for each row execute function graded_cards_escrow_guard();
  end if;
end $$;

-- A retired slab leaves every profile showcase.
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'graded_cards_prune_showcase_retired'
                  and tgrelid = 'graded_cards'::regclass) then
    create trigger graded_cards_prune_showcase_retired after update of retired on graded_cards
      for each row when (new.retired and not old.retired) execute function prune_showcase_slab();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function grading_insurance_rate() returns numeric
language sql immutable set search_path = public as $$ select 0.10 $$;
create or replace function grading_insurance_floor() returns numeric
language sql immutable set search_path = public as $$ select 7.0 $$;
create or replace function grading_trade_in_count() returns int
language sql immutable set search_path = public as $$ select 5 $$;
create or replace function grading_trade_in_max_grade() returns numeric
language sql immutable set search_path = public as $$ select 7.0 $$;

-- Every CPU persona favours one house.
create or replace function grading_persona_favourite(p_name text) returns text
language sql immutable set search_path = public as $$
  select (array['tca','amg','keeper'])[(abs(hashtext(coalesce(p_name, ''))) % 3) + 1];
$$;

-- Model value of a slab (no pop / reputation): the reference a CPU bids from.
create or replace function grading_slab_reference(p_card_id text, p_foil boolean, p_grade numeric,
                                                  p_service text, p_pristine boolean)
returns int language sql stable set search_path = public as $$
  select ceil(card_sell_price((select rarity from cards where id = p_card_id))
    * case when p_foil then 2.5 else 1 end
    * case when p_pristine then grading_pristine_mult() else grading_grade_mult(p_grade) end
    * grading_service_premium(p_service))::int;
$$;

create or replace function get_slab_market_value(p_card_id text, p_grade numeric, p_service text,
                                                 p_foil boolean default false, p_pristine boolean default false)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'sales', count(*)::int,
    'avg_price', case when count(*) >= 3 then round(avg(current_bid))::int end,
    'reference', grading_slab_reference(p_card_id, p_foil, p_grade, p_service, p_pristine))
  from market_listings
  where graded_id is not null and card_id = p_card_id and foil = p_foil
    and slab_grade = p_grade and slab_service = p_service and slab_pristine = p_pristine
    and status = 'sold' and current_bid is not null;
$$;
grant execute on function get_slab_market_value(text, numeric, text, boolean, boolean) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Registry: only slabs you graded yourself, never retired; stats on milestones
-- ---------------------------------------------------------------------------
create or replace function grading_registry_status(p_uid uuid)
returns table (colour text, have int, total int)
language sql stable security definer set search_path = public as $$
  select c.colour,
    (select count(distinct g.card_id)::int from graded_cards g join cards k on k.id = g.card_id
      where g.user_id = p_uid and coalesce(g.graded_by, g.user_id) = p_uid
        and g.service = 'amg' and g.grade is not null and not g.retired
        and not g.crossover_pending and k.card_type <> 'Leader'
        and c.colour = any(k.essence_types)),
    (select count(*)::int from cards k where k.card_type <> 'Leader' and c.colour = any(k.essence_types))
  from unnest(grading_colours()) as c(colour);
$$;
revoke execute on function grading_registry_status(uuid) from public, anon, authenticated;

create or replace function grading_registry_sync(p_uid uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_s record;
  v_m int;
  v_paid jsonb := '[]'::jsonb;
  v_total int := 0;
  v_bonus int;
begin
  for v_s in select * from grading_registry_status(p_uid) loop
    if v_s.total = 0 then continue; end if;
    foreach v_m in array array[25, 50, 75, 100] loop
      if v_s.have * 100 >= v_s.total * v_m then
        v_bonus := grading_registry_bonus(v_m);
        insert into grading_registry_claims (user_id, colour, milestone, paid)
          values (p_uid, v_s.colour, v_m, v_bonus) on conflict do nothing;
        if found then
          v_total := v_total + v_bonus;
          v_paid := v_paid || jsonb_build_object('colour', v_s.colour, 'milestone', v_m, 'bonus', v_bonus);
          perform track_stat(p_uid, 'registry_milestones', 1, false);
          if v_m = 100 then perform track_stat(p_uid, 'registry_complete', 1, false); end if;
        end if;
      end if;
    end loop;
  end loop;
  if v_total > 0 then
    update profiles set credits = credits + v_total, updated_at = now() where id = p_uid;
  end if;
  return v_paid;
end $$;
revoke execute on function grading_registry_sync(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Overview: tokens added
-- ---------------------------------------------------------------------------
create or replace function get_grading_overview()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ws record;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_ws from grading_week_special();
  return jsonb_build_object(
    'loyalty', coalesce((select jsonb_object_agg(s, jsonb_build_object(
        'submitted', coalesce(l.submitted, 0),
        'perks_available', greatest(0, coalesce(l.submitted, 0) / 10 - coalesce(l.perks_used, 0))))
      from unnest(array['tca','amg','keeper']) s
      left join grading_loyalty l on l.user_id = v_uid and l.service = s), '{}'::jsonb),
    'registry', coalesce((select jsonb_agg(jsonb_build_object(
        'colour', r.colour, 'have', r.have, 'total', r.total,
        'claimed', coalesce((select jsonb_agg(c.milestone order by c.milestone) from grading_registry_claims c
                              where c.user_id = v_uid and c.colour = r.colour), '[]'::jsonb)))
      from grading_registry_status(v_uid) r), '[]'::jsonb),
    'week_special', jsonb_build_object('service', v_ws.service, 'colour', v_ws.colour, 'week_key', v_ws.week_key),
    'collector_favourite', grading_collector_favourite(),
    'tokens', coalesce((select tokens from grading_tokens where user_id = v_uid), 0)
  );
end $$;
revoke execute on function get_grading_overview() from public, anon;
grant execute on function get_grading_overview() to authenticated;

-- ---------------------------------------------------------------------------
-- submit_grading_v2: insurance + trade-in token. The 4-argument
-- submit_grading stays callable and forwards here uninsured.
-- ---------------------------------------------------------------------------
create or replace function submit_grading_v2(p_items jsonb, p_service text, p_speed text,
                                             p_currency text default 'credits',
                                             p_insure boolean default false,
                                             p_use_token boolean default false)
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
           coalesce((it->>'foil')::boolean, false) as foil
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

    v_special := v_ws.service = p_service and v_ws.colour = any(coalesce(v_card.essence_types, '{}'));
    v_row_fee := case when v_special then ceil(v_unit / 2.0)::int else v_unit end;

    for i in 1..v_item.qty loop
      v_fee := v_row_fee;
      if v_perk_left then
        v_perk_left := false;
        if p_service <> 'tca' then v_fee := 0; end if;
        insert into graded_cards (user_id, card_id, foil, service, speed, fee_paid, ready_at,
                                  loyalty_bonus, insured, insurance_paid)
          values (v_uid, v_item.card_id, v_item.foil, p_service, p_speed, v_fee, v_ready,
                  p_service = 'tca', v_insure and v_fee > 0,
                  case when v_insure then ceil(v_fee * grading_insurance_rate())::int else 0 end);
      else
        if v_token_left then v_token_left := false; v_fee := 0; end if;
        insert into graded_cards (user_id, card_id, foil, service, speed, fee_paid, ready_at,
                                  insured, insurance_paid)
          values (v_uid, v_item.card_id, v_item.foil, p_service, p_speed, v_fee, v_ready,
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
revoke execute on function submit_grading_v2(jsonb, text, text, text, boolean, boolean) from public, anon;
grant execute on function submit_grading_v2(jsonb, text, text, text, boolean, boolean) to authenticated;

create or replace function submit_grading(p_items jsonb, p_service text, p_speed text, p_currency text default 'credits')
returns jsonb language sql security definer set search_path = public as $$
  select submit_grading_v2(p_items, p_service, p_speed, p_currency, false, false);
$$;

-- ---------------------------------------------------------------------------
-- Reveal: insurance refund + stats
-- ---------------------------------------------------------------------------
create or replace function reveal_graded_cards()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_g graded_cards%rowtype;
  v_grade numeric;
  v_new numeric;
  v_pristine boolean;
  v_refund int;
  v_refunded int := 0;
  v_rows jsonb := '[]'::jsonb;
  v_registry jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  for v_g in
    select * from graded_cards
     where user_id = v_uid and ready_at <= now() and not retired
       and (grade is null or crossover_pending)
     order by submitted_at
     for update
  loop
    if v_g.crossover_pending then
      v_new := grading_roll(v_g.crossover_target);
      v_grade := greatest(v_g.grade, v_new);
      update graded_cards set
          grade = v_grade, service = v_g.crossover_target, crossover_target = null,
          crossover_pending = false, revealed_at = now(), pristine = false,
          subgrades = case when v_g.crossover_target = 'tca' then grading_subgrades(v_grade, false) else null end
        where id = v_g.id;
      if v_grade > v_g.grade then perform track_stat(v_uid, 'crossover_upgrades', 1, false); end if;
      v_rows := v_rows || jsonb_build_object('id', v_g.id, 'card_id', v_g.card_id, 'foil', v_g.foil,
        'service', v_g.crossover_target, 'grade', v_grade, 'pristine', false,
        'crossover', true, 'previous_grade', v_g.grade);
    else
      v_grade := grading_roll(v_g.service);
      if v_g.loyalty_bonus then v_grade := least(10.0, v_grade + 0.5); end if;
      v_pristine := v_g.service = 'tca' and v_g.crossed_from is null and v_grade = 10.0
                    and random() < 0.5;
      v_refund := case when v_g.insured and v_grade < grading_insurance_floor() then v_g.fee_paid else 0 end;
      update graded_cards set
          grade = v_grade, revealed_at = now(), pristine = v_pristine,
          subgrades = case when v_g.service = 'tca' then grading_subgrades(v_grade, v_pristine) else null end
        where id = v_g.id;
      if v_pristine then perform track_stat(v_uid, 'pristine_slabs', 1, false); end if;
      if v_refund > 0 then
        v_refunded := v_refunded + v_refund;
        perform track_stat(v_uid, 'insured_saves', 1, false);
      end if;
      v_rows := v_rows || jsonb_build_object('id', v_g.id, 'card_id', v_g.card_id, 'foil', v_g.foil,
        'service', v_g.service, 'grade', v_grade, 'pristine', v_pristine, 'crossover', false,
        'refund', v_refund);
    end if;
  end loop;
  if v_refunded > 0 then
    update profiles set credits = credits + v_refunded, updated_at = now() where id = v_uid;
  end if;
  v_registry := grading_registry_sync(v_uid);
  return jsonb_build_object('ok', true, 'revealed', v_rows, 'registry', v_registry, 'refunded', v_refunded);
end $$;

-- ---------------------------------------------------------------------------
-- Crossover: escrow + retired checks
-- ---------------------------------------------------------------------------
create or replace function crossover_slab(p_id uuid, p_target text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_g graded_cards%rowtype;
  v_fee int;
  v_profile profiles%rowtype;
  v_ready timestamptz := now() + grading_turnaround('standard');
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_target not in ('tca','amg') then raise exception 'Crossover goes to TCA or AMG'; end if;
  select * into v_g from graded_cards where id = p_id and user_id = v_uid for update;
  if not found or v_g.retired then raise exception 'Slab not found'; end if;
  if v_g.listing_id is not null then raise exception 'That slab is listed on the Marketplace'; end if;
  if v_g.grade is null or v_g.crossover_pending then raise exception 'That card is still being graded'; end if;
  if v_g.service <> 'keeper' then raise exception 'Only Keeper slabs can be crossed over'; end if;
  if v_g.crossed_from is not null then raise exception 'That slab has already been crossed over'; end if;
  v_fee := grading_base_fee(p_target);
  select * into v_profile from profiles where id = v_uid for update;
  if v_profile.credits < v_fee then raise exception 'Not enough credits (fee is %)', v_fee; end if;
  update profiles set credits = credits - v_fee, updated_at = now()
    where id = v_uid returning * into v_profile;
  update graded_cards set
      crossed_from = v_g.service, crossover_target = p_target, speed = 'standard',
      fee_paid = v_fee, ready_at = v_ready, crossover_pending = true, insured = false
    where id = p_id;
  return jsonb_build_object('ok', true, 'credits', v_profile.credits, 'fee', v_fee, 'ready_at', v_ready);
end $$;

-- ---------------------------------------------------------------------------
-- Trade-ins
-- ---------------------------------------------------------------------------
create or replace function grading_retire_slab(p_id uuid) returns void
language sql security definer set search_path = public as $$
  update graded_cards
     set retired = true, retired_grade = grade, grade = null, listing_id = null,
         ready_at = 'infinity'::timestamptz
   where id = p_id;
$$;
revoke execute on function grading_retire_slab(uuid) from public, anon, authenticated;

create or replace function trade_in_slabs(p_ids uuid[])
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ok int;
  v_id uuid;
  v_tokens int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_ids is null or cardinality(p_ids) <> grading_trade_in_count()
     or (select count(distinct x) from unnest(p_ids) x) <> grading_trade_in_count() then
    raise exception 'A trade-in takes exactly % different slabs', grading_trade_in_count();
  end if;
  select count(*) into v_ok from graded_cards
   where id = any(p_ids) and user_id = v_uid and not retired and listing_id is null
     and not crossover_pending and grade is not null and grade < grading_trade_in_max_grade();
  if v_ok <> grading_trade_in_count() then
    raise exception 'Trade-ins take your own revealed, unlisted slabs graded below %',
      grading_trade_in_max_grade();
  end if;
  perform 1 from graded_cards where id = any(p_ids) for update;
  foreach v_id in array p_ids loop perform grading_retire_slab(v_id); end loop;
  insert into grading_tokens (user_id, tokens, earned) values (v_uid, 1, 1)
    on conflict (user_id) do update set tokens = grading_tokens.tokens + 1, earned = grading_tokens.earned + 1
    returning tokens into v_tokens;
  perform track_stat(v_uid, 'slab_trade_ins', 1, false);
  return jsonb_build_object('ok', true, 'tokens', v_tokens);
end $$;
revoke execute on function trade_in_slabs(uuid[]) from public, anon;
grant execute on function trade_in_slabs(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Marketplace slabs
-- ---------------------------------------------------------------------------
create or replace function create_slab_listing(p_graded_id uuid, p_type text, p_price integer,
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

  insert into market_listings (seller, card_id, foil, quantity, listing_type, price, buyout, ends_at,
                               graded_id, slab_grade, slab_service, slab_pristine, cpu_bidder_name)
  values (v_uid, v_g.card_id, v_g.foil, 1, p_type, p_price,
          case when p_type = 'auction' then p_buyout end,
          now() + make_interval(hours => v_hours),
          v_g.id, v_g.grade, v_g.service, v_g.pristine, v_persona)
  returning * into v_listing;

  update graded_cards set listing_id = v_listing.id where id = v_g.id;

  -- The CPU bidder bids from the slab's model value, ×1.2 when the slab comes
  -- from its favourite house; never on a slab listed above that value.
  if p_type = 'auction' then
    v_ref := grading_slab_reference(v_g.card_id, v_g.foil, v_g.grade, v_g.service, v_g.pristine);
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
revoke execute on function create_slab_listing(uuid, text, integer, integer, integer) from public, anon;
grant execute on function create_slab_listing(uuid, text, integer, integer, integer) to authenticated;

create or replace function finalize_slab_sale(p_listing market_listings, p_buyer uuid, p_amount integer)
returns void language plpgsql security definer set search_path = public as $$
begin
  update graded_cards set user_id = p_buyer, listing_id = null where id = p_listing.graded_id;
  update profiles set credits = credits + (p_amount - ceil(p_amount * 0.05))::int, updated_at = now()
    where id = p_listing.seller;
  perform track_stat(p_listing.seller, 'market_sales', 1, false);
  perform track_stat(p_buyer, 'market_buys', 1, false);
  if stat_once_claim(p_listing.seller, 'slabsold:' || p_listing.graded_id::text) then
    perform track_stat(p_listing.seller, 'slabs_sold_market', 1, false);
  end if;
end $$;
revoke execute on function finalize_slab_sale(market_listings, uuid, integer) from public, anon, authenticated;

create or replace function buy_listing(p_listing_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_l market_listings%rowtype;
  v_price int;
  v_profile profiles%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_l from market_listings where id = p_listing_id and status = 'active' for update;
  if not found then raise exception 'Listing not found'; end if;
  if v_l.seller = v_uid then raise exception 'You cannot buy your own listing'; end if;
  if now() >= v_l.ends_at then raise exception 'Listing has expired'; end if;
  if v_l.listing_type = 'fixed' then v_price := v_l.price;
  else
    v_price := v_l.buyout;
    if v_price is null then raise exception 'This auction has no buyout price'; end if;
  end if;
  select * into v_profile from profiles where id = v_uid for update;
  if v_profile.credits < v_price then raise exception 'Not enough credits'; end if;
  update profiles set credits = credits - v_price, updated_at = now() where id = v_uid;
  if v_l.current_bidder is not null then
    update profiles set credits = credits + v_l.current_bid, updated_at = now()
      where id = v_l.current_bidder;
  end if;
  if v_l.graded_id is not null then
    perform finalize_slab_sale(v_l, v_uid, v_price);
  else
    perform finalize_sale(v_l, v_uid, v_price);
  end if;
  update market_listings set status = 'sold', current_bid = v_price, current_bidder = v_uid
    where id = p_listing_id;
  select * into v_profile from profiles where id = v_uid;
  return jsonb_build_object('ok', true, 'paid', v_price, 'credits', v_profile.credits);
end $$;

create or replace function cancel_listing(p_listing_id uuid)
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
  end if;
  update market_listings set status = 'cancelled' where id = p_listing_id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function settle_expired_listings()
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
        -- The CPU collector takes the slab off the market for good.
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
      end if;
      update market_listings set status = 'expired' where id = v_l.id;
    end if;
    v_settled := v_settled + 1;
  end loop;
  return jsonb_build_object('ok', true, 'settled', v_settled, 'cpu_bids', v_cpu);
end $$;

-- ---------------------------------------------------------------------------
-- Achievements and missions
-- ---------------------------------------------------------------------------
insert into achievements (id, name, description, category, stat_key, target, reward_credits, reward_vouchers, sort) values
  ('pristine_1', 'Black Label', 'Pull a PRISTINE 10 from TCA', 'collection', 'pristine_slabs', 1, 3000, 20, 410),
  ('crossover_up_1', 'Second Opinion', 'Cross a Keeper slab over to a higher grade', 'collection', 'crossover_upgrades', 1, 500, 3, 411),
  ('crossover_up_10', 'Appeals Court', 'Win 10 crossover upgrades', 'collection', 'crossover_upgrades', 10, 2500, 15, 412),
  ('trade_in_1', 'Scrap Value', 'Trade five low slabs in for a free grading', 'collection', 'slab_trade_ins', 1, 300, 2, 413),
  ('trade_in_10', 'Recycler', 'Make 10 slab trade-ins', 'collection', 'slab_trade_ins', 10, 1500, 10, 414),
  ('slab_market_1', 'Slab Flipper', 'Sell a slab on the Marketplace', 'collection', 'slabs_sold_market', 1, 500, 3, 415),
  ('slab_market_10', 'Slab Dealer', 'Sell 10 different slabs on the Marketplace', 'collection', 'slabs_sold_market', 10, 3000, 20, 416),
  ('insured_1', 'Covered', 'Get a fee refunded by grade insurance', 'collection', 'insured_saves', 1, 200, 1, 417),
  ('registry_first', 'On the Register', 'Reach your first AMG Set Registry milestone', 'collection', 'registry_milestones', 1, 500, 3, 418),
  ('registry_complete_1', 'Registry Master', 'Complete a colour''s AMG Set Registry', 'collection', 'registry_complete', 1, 5000, 30, 419),
  ('registry_complete_7', 'Grand Registry', 'Complete all seven colour registries', 'collection', 'registry_complete', 7, 25000, 100, 420)
on conflict (id) do nothing;

insert into missions (id, name, description, stat_key, target, reward_credits, reward_vouchers, reward_bp_xp, cadence, pool) values
  ('w_slab_market_1', 'Slab Sale', 'Sell a slab on the Marketplace this week', 'slabs_sold_market', 1, 400, 2, 0, 'weekly', 'rotating'),
  ('w_trade_in_1', 'Trade-In Day', 'Trade five low slabs in for a free grading this week', 'slab_trade_ins', 1, 300, 1, 0, 'weekly', 'rotating')
on conflict (id) do nothing;
