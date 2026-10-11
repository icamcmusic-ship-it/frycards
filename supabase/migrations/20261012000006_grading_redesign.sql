-- Grading redesign (v2): three companies that each win somewhere.
--
-- The EV analysis of v25/v26 grading found AMG dominated everywhere, Keeper
-- best below a raw quicksell of ~216 and TCA above it. This migration gives
-- each company its own lane:
--
--   TCA    — premium ×1.6, fee 400. Strictest roll (every non-10 drops half a
--            point, a 10 holds only 70% of the time) but direct submissions can
--            come back PRISTINE 10 (half of TCA 10s, ×40 instead of ×12) with
--            visible subgrades.
--   AMG    — premium ×1.3, fee 150, minimum 3 cards per order. Per-colour SET
--            REGISTRY with one-time milestone bonuses, and a POP REPORT whose
--            low-pop grades sell for a little more.
--   Keeper — fee 70, generous bump (55% of rolls +0.5). Keeper slabs can be
--            CROSSED OVER once to TCA or AMG for the target's full fee; the
--            grade never goes down and a crossed TCA slab is never Pristine.
--
-- Cross-company: loyalty perks every 10 cards per company, a weekly half-price
-- special (one company + one colour), and a daily "collector" whose favourite
-- company pays +15% at quicksell (slabs never pass through the CPU auction or
-- the Shop Floor, so quicksell is where market reputation lives).
--
-- Idempotent: every statement is create-or-replace / if-not-exists / upsert.
-- Nothing here drops or deletes live data.

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------
alter table graded_cards add column if not exists pristine boolean not null default false;
alter table graded_cards add column if not exists subgrades jsonb;
alter table graded_cards add column if not exists crossed_from text;
alter table graded_cards add column if not exists crossover_pending boolean not null default false;
alter table graded_cards add column if not exists crossover_target text;
alter table graded_cards add column if not exists loyalty_bonus boolean not null default false;

-- ---------------------------------------------------------------------------
-- Tables: loyalty, registry claims, pop report
-- ---------------------------------------------------------------------------
create table if not exists grading_loyalty (
  user_id uuid not null,
  service text not null check (service in ('tca','amg','keeper')),
  submitted int not null default 0,
  perks_used int not null default 0,
  primary key (user_id, service)
);
alter table grading_loyalty enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'grading_loyalty' and policyname = 'grading_loyalty_select_own') then
    create policy grading_loyalty_select_own on grading_loyalty for select using ((select auth.uid()) = user_id);
  end if;
end $$;

-- One row per milestone ever reached. Never removed when the slab leaves, so
-- cracking/selling and re-grading can't pay a milestone twice.
create table if not exists grading_registry_claims (
  user_id uuid not null,
  colour text not null,
  milestone int not null,
  paid int not null,
  claimed_at timestamptz not null default now(),
  primary key (user_id, colour, milestone)
);
alter table grading_registry_claims enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'grading_registry_claims' and policyname = 'grading_registry_claims_select_own') then
    create policy grading_registry_claims_select_own on grading_registry_claims for select using ((select auth.uid()) = user_id);
  end if;
end $$;

-- Pop report: revealed, settled slabs per card / company / grade. Kept by a
-- trigger so reading it is a PK lookup, never an aggregate over graded_cards.
create table if not exists grading_pop (
  card_id text not null,
  service text not null,
  grade numeric not null,
  n int not null default 0,
  primary key (card_id, service, grade)
);
alter table grading_pop enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'grading_pop' and policyname = 'grading_pop_read') then
    create policy grading_pop_read on grading_pop for select using (true);
  end if;
end $$;
grant select on grading_pop to anon, authenticated;
grant select on grading_loyalty, grading_registry_claims to authenticated;

create or replace function grading_pop_track() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE','DELETE') and old.grade is not null and not old.crossover_pending then
    update grading_pop set n = greatest(0, n - 1)
     where card_id = old.card_id and service = old.service and grade = old.grade;
  end if;
  if tg_op in ('INSERT','UPDATE') and new.grade is not null and not new.crossover_pending then
    insert into grading_pop (card_id, service, grade, n) values (new.card_id, new.service, new.grade, 1)
      on conflict (card_id, service, grade) do update set n = grading_pop.n + 1;
  end if;
  return null;
end $$;

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'graded_cards_pop'
                  and tgrelid = 'graded_cards'::regclass) then
    create trigger graded_cards_pop after insert or delete or update of grade, service, crossover_pending, card_id
      on graded_cards for each row execute function grading_pop_track();
  end if;
end $$;

-- Backfill (upsert to the true count — safe to re-run).
insert into grading_pop (card_id, service, grade, n)
select card_id, service, grade, count(*)::int from graded_cards
 where grade is not null and not crossover_pending
 group by 1, 2, 3
on conflict (card_id, service, grade) do update set n = excluded.n;

-- ---------------------------------------------------------------------------
-- Pure helpers (mirrored in src/meta/grading.ts)
-- ---------------------------------------------------------------------------
create or replace function grading_base_fee(p_service text) returns integer
language sql immutable set search_path = public as $$
  select case p_service when 'tca' then 400 when 'amg' then 150 when 'keeper' then 70 end;
$$;

create or replace function grading_service_premium(p_service text) returns numeric
language sql immutable set search_path = public as $$
  select case p_service when 'tca' then 1.6 when 'amg' then 1.3 when 'keeper' then 1.0 end;
$$;

create or replace function grading_min_cards(p_service text) returns integer
language sql immutable set search_path = public as $$
  select case p_service when 'amg' then 3 else 1 end;
$$;

-- Pristine 10: ×40 against Gem Mint's ×12.
create or replace function grading_pristine_mult() returns numeric
language sql immutable set search_path = public as $$ select 40.0 $$;

create or replace function grading_colours() returns text[]
language sql immutable set search_path = public as $$
  select array['Ember','Tide','Root','Gale','Light','Shadow','Void'];
$$;

-- ISO-week hash → (service, colour) at half price.
create or replace function grading_week_special(p_at timestamptz default now())
returns table (service text, colour text, week_key int)
language sql stable set search_path = public as $$
  with k as (
    select (extract(isoyear from (p_at at time zone 'UTC'))::int * 100
          + extract(week from (p_at at time zone 'UTC'))::int) as wk
  ), h as (select wk, (wk * 7919) % 10007 as h from k)
  select (array['tca','amg','keeper'])[(h % 3) + 1],
         (grading_colours())[((h / 3) % 7) + 1],
         wk
    from h;
$$;

-- The day's collector (who buys quicksold slabs) favours one company: +15%.
create or replace function grading_collector_favourite(p_at timestamptz default now())
returns text language sql stable set search_path = public as $$
  select (array['tca','amg','keeper'])[
    (((p_at at time zone 'UTC')::date - date '2026-01-01') % 3 + 3) % 3 + 1];
$$;

create or replace function grading_reputation_mult(p_service text, p_at timestamptz default now())
returns numeric language sql stable set search_path = public as $$
  select case when grading_collector_favourite(p_at) = p_service then 1.15 else 1.0 end;
$$;

-- Low-pop bump (AMG slabs only — the pop report is AMG's product).
create or replace function grading_pop_mult(p_service text, p_pop int)
returns numeric language sql immutable set search_path = public as $$
  select case when p_service <> 'amg' then 1.0
              when p_pop <= 3 then 1.10
              when p_pop <= 10 then 1.05
              else 1.0 end;
$$;

-- Registry milestones (percent of a colour's non-Leader cards) and bonuses.
create or replace function grading_registry_bonus(p_milestone int)
returns int language sql immutable set search_path = public as $$
  select case p_milestone when 25 then 400 when 50 then 1000 when 75 then 2000 when 100 then 5000 else 0 end;
$$;

-- The strict TCA roll: a non-10 drops half a point (floor 5), a 10 holds only
-- 70% of the time. Keeper's bump is unchanged. Average shift for TCA ≈ −0.48.
create or replace function grading_roll(p_service text) returns numeric
language plpgsql set search_path = public as $$
declare
  v_r numeric := random() * 94;
  v_g numeric;
begin
  v_g := case
    when v_r < 2  then 5.0  when v_r < 5  then 5.5  when v_r < 9  then 6.0
    when v_r < 14 then 6.5  when v_r < 22 then 7.0  when v_r < 32 then 7.5
    when v_r < 46 then 8.0  when v_r < 62 then 8.5  when v_r < 78 then 9.0
    when v_r < 90 then 9.5  else 10.0 end;
  if p_service = 'keeper' and random() < 0.55 then
    v_g := least(10.0, v_g + 0.5);
  elsif p_service = 'tca' then
    if v_g = 10.0 then
      if random() >= 0.7 then v_g := 9.5; end if;
    else
      v_g := greatest(5.0, v_g - 0.5);
    end if;
  end if;
  return v_g;
end $$;

-- Four subgrades; the limiting one equals the overall grade, the rest sit up
-- to a point above it. Pristine = four 10s.
create or replace function grading_subgrades(p_grade numeric, p_pristine boolean)
returns jsonb language plpgsql set search_path = public as $$
declare
  v_keys text[] := array['centering','corners','edges','surface'];
  v_low int := 1 + floor(random() * 4)::int;
  v_out jsonb := '{}'::jsonb;
  i int;
begin
  for i in 1..4 loop
    v_out := v_out || jsonb_build_object(v_keys[i],
      case when p_pristine then 10.0
           when i = v_low then p_grade
           else least(10.0, p_grade + 0.5 * floor(random() * 3)) end);
  end loop;
  return v_out;
end $$;

-- Quicksell price of a slab, every modifier included.
create or replace function grading_slab_price(p_id uuid, p_at timestamptz default now())
returns int language plpgsql stable security definer set search_path = public as $$
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
  select coalesce(n, 0) into v_pop from grading_pop
   where card_id = v_g.card_id and service = v_g.service and grade = v_g.grade;
  return ceil(v_price
    * case when v_g.pristine then grading_pristine_mult() else grading_grade_mult(v_g.grade) end
    * grading_service_premium(v_g.service)
    * grading_pop_mult(v_g.service, coalesce(v_pop, 0))
    * grading_reputation_mult(v_g.service, p_at));
end $$;

-- ---------------------------------------------------------------------------
-- Registry
-- ---------------------------------------------------------------------------
create or replace function grading_registry_status(p_uid uuid)
returns table (colour text, have int, total int)
language sql stable security definer set search_path = public as $$
  select c.colour,
    (select count(distinct g.card_id)::int from graded_cards g join cards k on k.id = g.card_id
      where g.user_id = p_uid and g.service = 'amg' and g.grade is not null
        and not g.crossover_pending and k.card_type <> 'Leader'
        and c.colour = any(k.essence_types)),
    (select count(*)::int from cards k where k.card_type <> 'Leader' and c.colour = any(k.essence_types))
  from unnest(grading_colours()) as c(colour);
$$;

-- Pays every newly reached milestone once, for life. Returns what was paid.
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
revoke execute on function grading_registry_status(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
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
    'collector_favourite', grading_collector_favourite()
  );
end $$;

create or replace function submit_grading(p_items jsonb, p_service text, p_speed text, p_currency text default 'credits')
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
  v_total int := 0;
  v_charge int := 0;
  v_profile profiles%rowtype;
  v_ready timestamptz;
  v_ws record;
  v_special boolean;
  v_loyal grading_loyalty%rowtype;
  v_perk boolean := false;
  v_perk_left boolean;
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

  v_unit := ceil(grading_base_fee(p_service) * grading_speed_mult(p_service, p_speed)
                 * grading_bulk_mult(p_service, v_count));
  v_ready := now() + grading_turnaround(p_speed);
  select * into v_ws from grading_week_special();

  -- Loyalty: a perk earned by every 10 cards already submitted to this company.
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
    if not found then raise exception 'You do not own %', v_card.name;
    end if;

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
      if v_perk_left then
        -- TCA's perk is a guaranteed +0.5 on one card; AMG's and Keeper's is
        -- that card graded free.
        v_perk_left := false;
        insert into graded_cards (user_id, card_id, foil, service, speed, fee_paid, ready_at, loyalty_bonus)
          values (v_uid, v_item.card_id, v_item.foil, p_service, p_speed,
                  case when p_service = 'tca' then v_row_fee else 0 end, v_ready, p_service = 'tca');
        v_total := v_total + case when p_service = 'tca' then v_row_fee else 0 end;
      else
        insert into graded_cards (user_id, card_id, foil, service, speed, fee_paid, ready_at)
          values (v_uid, v_item.card_id, v_item.foil, p_service, p_speed, v_row_fee, v_ready);
        v_total := v_total + v_row_fee;
      end if;
    end loop;
  end loop;

  update grading_loyalty
     set submitted = submitted + v_count,
         perks_used = perks_used + case when v_perk then 1 else 0 end
   where user_id = v_uid and service = p_service;

  v_charge := case when coalesce(p_currency, 'credits') = 'vouchers'
                   then grading_voucher_fee(v_total) else v_total end;
  if v_total = 0 then v_charge := 0; end if;

  select * into v_profile from profiles where id = v_uid for update;
  if coalesce(p_currency, 'credits') = 'vouchers' then
    if v_profile.vouchers < v_charge then
      raise exception 'Not enough vouchers (fee is %)', v_charge;
    end if;
    update profiles set vouchers = vouchers - v_charge, updated_at = now()
      where id = v_uid returning * into v_profile;
  else
    if v_profile.credits < v_charge then
      raise exception 'Not enough credits (fee is %)', v_charge;
    end if;
    update profiles set credits = credits - v_charge, updated_at = now()
      where id = v_uid returning * into v_profile;
  end if;

  return jsonb_build_object(
    'ok', true,
    'credits', v_profile.credits,
    'vouchers', v_profile.vouchers,
    'currency', coalesce(p_currency, 'credits'),
    'count', v_count,
    'unit_fee', v_unit,
    'total_fee', v_total,
    'charged', v_charge,
    'ready_at', v_ready,
    'perk_used', v_perk,
    'week_special', jsonb_build_object('service', v_ws.service, 'colour', v_ws.colour)
  );
end $$;

create or replace function reveal_graded_cards()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_g graded_cards%rowtype;
  v_grade numeric;
  v_new numeric;
  v_pristine boolean;
  v_rows jsonb := '[]'::jsonb;
  v_registry jsonb;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  for v_g in
    select * from graded_cards
     where user_id = v_uid and ready_at <= now()
       and (grade is null or crossover_pending)
     order by submitted_at
     for update
  loop
    if v_g.crossover_pending then
      -- Crossover: re-graded by the target, never lower, never Pristine.
      -- grade stays non-null throughout, so slabs_mint / gem_mints never re-fire.
      v_new := grading_roll(v_g.crossover_target);
      v_grade := greatest(v_g.grade, v_new);
      update graded_cards set
          grade = v_grade, service = v_g.crossover_target, crossover_target = null,
          crossover_pending = false, revealed_at = now(), pristine = false,
          subgrades = case when v_g.crossover_target = 'tca' then grading_subgrades(v_grade, false) else null end
        where id = v_g.id;
      v_rows := v_rows || jsonb_build_object('id', v_g.id, 'card_id', v_g.card_id, 'foil', v_g.foil,
        'service', v_g.crossover_target, 'grade', v_grade, 'pristine', false,
        'crossover', true, 'previous_grade', v_g.grade);
    else
      v_grade := grading_roll(v_g.service);
      if v_g.loyalty_bonus then v_grade := least(10.0, v_grade + 0.5); end if;
      v_pristine := v_g.service = 'tca' and v_g.crossed_from is null and v_grade = 10.0
                    and random() < 0.5;
      update graded_cards set
          grade = v_grade, revealed_at = now(), pristine = v_pristine,
          subgrades = case when v_g.service = 'tca' then grading_subgrades(v_grade, v_pristine) else null end
        where id = v_g.id;
      v_rows := v_rows || jsonb_build_object('id', v_g.id, 'card_id', v_g.card_id, 'foil', v_g.foil,
        'service', v_g.service, 'grade', v_grade, 'pristine', v_pristine, 'crossover', false);
    end if;
  end loop;

  v_registry := grading_registry_sync(v_uid);
  return jsonb_build_object('ok', true, 'revealed', v_rows, 'registry', v_registry);
end $$;

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
  if not found then raise exception 'Slab not found'; end if;
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
      fee_paid = v_fee, ready_at = v_ready, crossover_pending = true
    where id = p_id;

  return jsonb_build_object('ok', true, 'credits', v_profile.credits, 'fee', v_fee, 'ready_at', v_ready);
end $$;

-- quicksell_graded_card / crack_graded_slab (pristine price, pop + reputation
-- modifiers, crossover-pending guard) live in 20261012000093_pending_grading_rpcs.sql
-- because their bodies contain DELETE. Until it is applied the live versions
-- are still safe: a slab mid-crossover keeps service = 'keeper' (the target
-- waits in crossover_target), so selling or cracking it early only forfeits
-- the crossover fee.

revoke execute on function crossover_slab(uuid, text) from public, anon;
grant execute on function crossover_slab(uuid, text) to authenticated;
revoke execute on function get_grading_overview() from public, anon;
grant execute on function get_grading_overview() to authenticated;
