-- Backend audit, v33. Three findings in the pack-granting path, all of them
-- latent today and all of them armed by the next set launch — which is the
-- one this project has been building toward.
--
-- Like the v32 migration, this ships as a FILE and is not applied here.

-- ---------------------------------------------------------------------------
-- 1. The 1-arg call is AMBIGUOUS, not merely set-unaware.
--
-- v32 dropped `random_card_of_rarity(text)` as dead, set-unaware code. It is
-- worse than dead: because the 2-arg arm declares
-- `p_sets text[] DEFAULT NULL::text[]`, BOTH overloads are candidates for a
-- one-argument call and Postgres refuses to choose:
--
--   ERROR: 42725: function random_card_of_rarity(unknown) is not unique
--
-- So the 1-arg arm was never reachable — and the next person to write the
-- obvious `random_card_of_rarity(v_rarity)` inside a pack grant gets a runtime
-- 42725 *inside a SECURITY DEFINER transaction*, i.e. a pack open that fails
-- after the currency has been debited.
--
-- Dropping the 1-arg arm (v32) removes the ambiguity but not the trap that
-- created it: with a DEFAULT still on the second parameter, a 1-arg call keeps
-- silently resolving to the 2-arg arm with `p_sets := NULL`, which means "draw
-- from the whole table" — the exact set-unaware behaviour v32 set out to make
-- unreachable, through the front door instead of the back.
--
-- So the DEFAULT goes. A 1-arg call now fails to resolve at all, at CREATE
-- FUNCTION time for anything calling it from a function body, rather than
-- succeeding with the wrong semantics at run time. Set restriction becomes a
-- decision the caller has to make out loud.
--
-- (`drop function ... (text)` is idempotent with the v32 migration; kept here
-- so this file is self-contained if applied on its own.)
drop function if exists public.random_card_of_rarity(text);
drop function if exists public.random_card_of_rarity(text, text[]);

create function public.random_card_of_rarity(p_rarity text, p_sets text[])
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_id text;
  ladder text[] := array['Mythic','Alt-Art','Full-Art','Ultra-Rare','Super-Rare','Rare','Uncommon','Common'];
  i int; start_idx int := 1;
begin
  for i in 1..array_length(ladder, 1) loop
    if ladder[i] = p_rarity then start_idx := i; end if;
  end loop;
  for i in start_idx..array_length(ladder, 1) loop
    select id into v_id from cards
      where rarity = ladder[i] and card_type <> 'Leader'
        and (p_sets is null or set_name = any(p_sets))
      order by random() limit 1;
    if v_id is not null then return v_id; end if;
  end loop;

  -- Set-restricted fallback: never spill outside the requested sets.
  select id into v_id from cards
    where card_type <> 'Leader' and (p_sets is null or set_name = any(p_sets))
    order by random() limit 1;
  if v_id is not null then return v_id; end if;

  -- 2. THE SPILL. The previous version's last resort was
  --    `select id from cards order by random()` with no set predicate — so a
  --    pack pinned to a set containing no cards silently paid out cards from
  --    a DIFFERENT set, and the README's "every pack_types row pins its own
  --    allowed_sets" invariant failed exactly where it was load-bearing.
  --
  --    This is not hypothetical. `Players Showcase 2026 Booster` is a real
  --    pack_types row, priced at 699 credits, pinned to allowed_sets
  --    ['Players Showcase 2026'] — and that set contains ZERO of the 297 live
  --    cards. It is `is_active = false` today, which is the only reason this
  --    is a latent finding rather than a live one: the pass that flips that
  --    flag is the pass that ships the Showcase set, and if the flag moves
  --    first the pack sells Volume #1 cards under a Showcase name.
  --
  --    Raising is the correct failure mode here precisely BECAUSE the caller
  --    is SECURITY DEFINER: the exception rolls the whole transaction back,
  --    so the player's currency is not debited for a pack that could not be
  --    filled. A refused purchase is recoverable; a mis-delivered one is a
  --    support ticket in a player-to-player economy.
  raise exception
    'No cards available for rarity % within sets % — refusing to draw outside the pinned sets',
    p_rarity, p_sets;
end;
$function$;

revoke all on function public.random_card_of_rarity(text, text[]) from public;
grant execute on function public.random_card_of_rarity(text, text[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Leader draws bypassed `allowed_sets` entirely — same hazard, one type over.
--
-- `random_leader_of_rarity(p_rarity text)` had no set parameter at all, and
-- its own fallback (`select id from cards where card_type = 'Leader'`) drew
-- from the whole catalog. `grant_pack_contents` calls it for every
-- `card_type = 'Leader'` slot, so every Leader ever pulled from a set-pinned
-- pack ignored the pin. The README names three functions that honour
-- allowed_sets; this is the fourth that should have.
--
-- Replaced rather than overloaded, and deliberately WITHOUT a default on
-- p_sets — adding `text[] DEFAULT NULL` beside the existing 1-arg version
-- would have recreated finding 1 verbatim, one function over.
drop function if exists public.random_leader_of_rarity(text);

create function public.random_leader_of_rarity(p_rarity text, p_sets text[])
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare v_id text;
begin
  select id into v_id from cards
    where card_type = 'Leader' and rarity = p_rarity
      and (p_sets is null or set_name = any(p_sets))
    order by random() limit 1;
  if v_id is not null then return v_id; end if;

  -- Any Leader from the pinned sets, at any rarity — the original's rarity
  -- fallback, now set-restricted.
  select id into v_id from cards
    where card_type = 'Leader' and (p_sets is null or set_name = any(p_sets))
    order by random() limit 1;
  if v_id is not null then return v_id; end if;

  raise exception
    'No Leader available for rarity % within sets % — refusing to draw outside the pinned sets',
    p_rarity, p_sets;
end;
$function$;

revoke all on function public.random_leader_of_rarity(text, text[]) from public;
grant execute on function public.random_leader_of_rarity(text, text[]) to authenticated, service_role;

-- `grant_pack_contents` is the only caller of either function. Its Leader
-- branch now passes the pack's own allowed_sets, exactly as its card branch
-- already did. Nothing else in the body changes.
create or replace function public.grant_pack_contents(p_uid uuid, p_pack pack_types)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
        -- v33: was `random_leader_of_rarity(v_rarity)`, which ignored the
        -- pack's pinned sets. Now symmetric with the card draw below.
        v_card_id := random_leader_of_rarity(v_rarity, p_pack.allowed_sets);
        v_foil := false;
      else
        v_card_id := random_card_of_rarity(v_rarity, p_pack.allowed_sets);
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

-- ---------------------------------------------------------------------------
-- 4. A shop owner can advertise a guaranteed Alt-Art. There are no Alt-Arts.
--
-- `create_mystery_template` is a PLAYER feature (shop owners build mystery
-- packs to sell), and it validates rarities against three hardcoded literal
-- lists that all include 'Alt-Art'. Live catalogue:
--
--   Common 120 · Uncommon 76 · Rare 46 · Full-Art 29 · Super-Rare 12
--   · Mythic 8 · Ultra-Rare 6 · Alt-Art 0
--
-- So a shop owner can build and sell a pack promising a guaranteed Alt-Art
-- that cannot contain one, and the rarity ladder falls DOWNWARD on an empty
-- tier, so it silently pays a Full-Art instead. The roadmap files Alt-Art
-- under "Later" as harmless dead plumbing; it is reachable from a
-- player-facing surface, and in an economy that has `shop_reports` and
-- `shop_fraud_strikes` tables, mis-advertised pack contents is precisely the
-- failure those tables exist for — except the game generates the
-- misrepresentation itself, so no shop owner did anything wrong.
--
-- The fix is not a shorter literal list. A literal list is what made this a
-- bug that outlived the catalogue it described; the validator should ask the
-- catalogue. `rarity_is_deliverable` does, so Alt-Art becomes legal by itself
-- on the day an Alt-Art card is printed, with no migration and nobody
-- remembering.
-- 4a. And while replacing those literal lists: `rarity_tier` cannot reject
-- anything. Its body ends `... when 'Mythic' then 8 else 1 end`, so an unknown
-- rarity returns tier 1 (Common) rather than NULL — which means the
-- `rarity_tier(gg->>'rarity') is null` guard in the guarantee validator has
-- never once fired. The hardcoded literal list beside it was doing all of the
-- validation, silently, and the two other validators had no rarity_tier guard
-- at all. Dropping the literal lists in favour of that guard would therefore
-- have removed rarity validation outright.
--
-- So the canonical list becomes a function instead of appearing three times as
-- a literal, `rarity_tier` is left alone (its `else 1` is load-bearing for
-- callers that rank arbitrary rarities and must not get a NULL), and the
-- validators below ask the two questions they actually mean: is this a rarity
-- at all, and can it be delivered.
create or replace function public.rarity_is_known(p_rarity text)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select p_rarity in (
    'Common','Uncommon','Rare','Super-Rare','Ultra-Rare','Full-Art','Alt-Art','Mythic'
  );
$function$;

comment on function public.rarity_is_known(text) is
  'True for one of the eight printed rarity names. Use this to REJECT an '
  'unknown rarity: rarity_tier() cannot, because it returns 1 (Common) rather '
  'than NULL for anything it does not recognise.';

revoke all on function public.rarity_is_known(text) from public;
grant execute on function public.rarity_is_known(text) to authenticated, service_role;

create or replace function public.rarity_is_deliverable(p_rarity text)
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select exists (
    select 1 from cards where rarity = p_rarity and card_type <> 'Leader'
  );
$function$;

comment on function public.rarity_is_deliverable(text) is
  'True when at least one non-Leader card of this rarity actually exists. Ask '
  'this rather than testing membership of a hardcoded rarity list: a rarity '
  'with no printings cannot be promised to a player, and the ladder silently '
  'pays a lower tier instead.';

revoke all on function public.rarity_is_deliverable(text) from public;
grant execute on function public.rarity_is_deliverable(text) to authenticated, service_role;

create or replace function public.create_mystery_template(p_name text, p_pack_size integer, p_mode text, p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_slots jsonb;
  v_guarantees jsonb;
  v_guaranteed_total int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from player_shops where owner = v_uid) then raise exception 'You need a shop first'; end if;
  if p_pack_size is null or p_pack_size < 1 or p_pack_size > 20 then raise exception 'Pack size must be 1-20'; end if;
  if p_mode not in ('simple', 'advanced') then raise exception 'Unknown mode'; end if;
  if p_name is null or char_length(trim(p_name)) < 1 or char_length(p_name) > 40 then raise exception 'Invalid name'; end if;

  v_guarantees := p_config->'guarantees';
  if v_guarantees is not null and v_guarantees <> 'null'::jsonb then
    if jsonb_typeof(v_guarantees) <> 'array' then raise exception 'guarantees must be an array'; end if;
    -- Advanced mode's slots already fill the whole pack; a separate guarantee
    -- would be granted on top and overflow pack_size. Use minimum slots there.
    if p_mode = 'advanced' and jsonb_array_length(v_guarantees) > 0 then
      raise exception 'Guarantees are a simple-mode feature — in advanced mode use minimum slots instead';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_guarantees) gg
      where not rarity_is_known(gg->>'rarity')
         or coalesce((gg->>'count')::int, 0) < 1
    ) then
      raise exception 'Each guarantee needs a known rarity and a count of 1 or more';
    end if;
    -- v33: a guarantee is a PROMISE, so the rarity has to be one the pack can
    -- actually deliver.
    if exists (
      select 1 from jsonb_array_elements(v_guarantees) gg
      where not rarity_is_deliverable(gg->>'rarity')
    ) then
      raise exception 'No cards of that rarity exist yet, so it cannot be guaranteed';
    end if;
    select coalesce(sum((gg->>'count')::int), 0) into v_guaranteed_total
      from jsonb_array_elements(v_guarantees) gg;
    if v_guaranteed_total > p_pack_size then
      raise exception 'Guarantees total % cards but the pack only holds %', v_guaranteed_total, p_pack_size;
    end if;
  end if;

  if p_mode = 'simple' then
    if p_config->'rarity_weights' is null or jsonb_typeof(p_config->'rarity_weights') <> 'object' then
      raise exception 'Simple mode needs a rarity_weights object';
    end if;
    if not exists (
      select 1 from jsonb_each_text(p_config->'rarity_weights') where value::numeric > 0
    ) then
      raise exception 'At least one rarity needs a weight above zero';
    end if;
    if exists (
      select 1 from jsonb_each_text(p_config->'rarity_weights')
      where not rarity_is_known(key) or value::numeric < 0
    ) then
      raise exception 'rarity_weights must map known rarities to non-negative numbers';
    end if;
    -- v33: a weight of ZERO on an unprintable rarity is harmless — it is never
    -- rolled — so only a positive weight has to be deliverable.
    if exists (
      select 1 from jsonb_each_text(p_config->'rarity_weights')
      where value::numeric > 0 and not rarity_is_deliverable(key)
    ) then
      raise exception 'No cards of that rarity exist yet, so it cannot be given a weight';
    end if;
  else
    v_slots := p_config->'slots';
    if v_slots is null or jsonb_typeof(v_slots) <> 'array' then raise exception 'Advanced mode needs a slots array'; end if;
    if jsonb_array_length(v_slots) <> p_pack_size then raise exception 'slots array must have exactly pack_size entries'; end if;
    if exists (select 1 from jsonb_array_elements(v_slots) s where s->>'mode' not in ('exact', 'minimum', 'open')) then
      raise exception 'Each slot must be tagged exact, minimum or open';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_slots) s
      where s->>'mode' = 'minimum' and not rarity_is_known(coalesce(s->>'rarity',''))
    ) then
      raise exception 'A minimum slot needs a known rarity';
    end if;
    -- v33: "minimum Alt-Art" reads as a floor and delivers a Full-Art, because
    -- the ladder falls downward on an empty tier. Same promise, same fix.
    if exists (
      select 1 from jsonb_array_elements(v_slots) s
      where s->>'mode' = 'minimum' and not rarity_is_deliverable(s->>'rarity')
    ) then
      raise exception 'No cards of that rarity exist yet, so it cannot be a minimum';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_slots) s
      where s->>'mode' = 'exact' and not exists (select 1 from cards where id = s->>'card_id')
    ) then
      raise exception 'An exact slot references an unknown card';
    end if;
  end if;

  insert into mystery_pack_templates (owner, name, pack_size, mode, config)
  values (v_uid, trim(p_name), p_pack_size, p_mode, p_config)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'template_id', v_id);
end;
$function$;

revoke all on function public.create_mystery_template(text, integer, text, jsonb) from public;
grant execute on function public.create_mystery_template(text, integer, text, jsonb) to authenticated;
