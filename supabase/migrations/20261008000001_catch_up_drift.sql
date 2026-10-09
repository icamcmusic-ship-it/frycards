-- 2026-10-08, audit B1/B2: catch the live project up to the repo.
--
-- Diffed on 2026-10-08 (md5 of each function's source, live vs the last repo
-- definition). The live project had these files NEVER applied:
--   20260828  grading_* search_path, random_card_of_rarity(text) drop
--   20260829  set-aware draws, rarity_is_known / rarity_is_deliverable
--   20260830 / 20260929000000  reset_account (so Settings > Reset Account
--             always errored: the function did not exist), begin_match H-2
--   20260929000001  M-4 / M-8 (create_mystery_template, random_card_of_rarity)
--   20260929000002  prune_match_tickets
-- and live had hand-applied the 2026-10-06/07 files unchanged, so none of
-- those are touched here. Every function replaced below was compared first:
-- live equals the repo's PREVIOUS definition of each, so this only moves
-- forward. Nothing is dropped that holds data. record_match_result (the
-- 20260929000001 statuses version) is superseded by the next migration, which
-- also adds the daily reward taper, so it is not applied here.
--
-- Idempotent: every statement is create-or-replace / drop-if-exists / revoke.

-- ---------------------------------------------------------------------------
-- 1. Housekeeping from 20260828: the eight grading_* helpers get the house
--    search_path (SECURITY INVOKER, so low risk, but the linter flags it).
-- ---------------------------------------------------------------------------
alter function public.grading_base_fee(text) set search_path to 'public';
alter function public.grading_bulk_mult(text, integer) set search_path to 'public';
alter function public.grading_grade_mult(numeric) set search_path to 'public';
alter function public.grading_roll(text) set search_path to 'public';
alter function public.grading_service_premium(text) set search_path to 'public';
alter function public.grading_speed_mult(text, text) set search_path to 'public';
alter function public.grading_turnaround(text) set search_path to 'public';
alter function public.grading_voucher_fee(integer) set search_path to 'public';

-- ---------------------------------------------------------------------------
-- 2. Rarity validators (20260829). Predicates only; create_mystery_template is
--    SECURITY DEFINER, so the API roles never need to call them directly.
-- ---------------------------------------------------------------------------
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
  'True for one of the eight printed rarity names. Use this to REJECT an unknown rarity: rarity_tier() cannot, because it returns 1 (Common) rather than NULL for anything it does not recognise.';
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
  'True when at least one non-Leader card of this rarity actually exists. Ask this rather than testing membership of a hardcoded rarity list.';

revoke all on function public.rarity_is_known(text) from public, anon, authenticated;
revoke all on function public.rarity_is_deliverable(text) from public, anon, authenticated;
grant execute on function public.rarity_is_known(text) to service_role;
grant execute on function public.rarity_is_deliverable(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Set-aware draws (20260828 / 20260829 / 20260929000001 M-4).
--
-- Live still has random_card_of_rarity(text) AND (text, text[] default null):
-- a one-argument call is ambiguous (42725) and the two-argument arm falls back
-- to the WHOLE catalogue and starts an unknown rarity at Mythic. Both are
-- replaced by a single two-argument function with no default that raises
-- instead of drawing outside the pinned sets. Checked before applying: every
-- active pack_types row pins a set that has cards, and the only live caller
-- is grant_pack_contents, which already passes allowed_sets.
-- These are internal helpers: only grant_pack_contents (SECURITY DEFINER)
-- calls them, so the API roles lose EXECUTE.
-- ---------------------------------------------------------------------------
drop function if exists public.random_card_of_rarity(text);
drop function if exists public.random_card_of_rarity(text, text[]);
drop function if exists public.random_leader_of_rarity(text);
drop function if exists public.random_leader_of_rarity(text, text[]);

create or replace function public.random_card_of_rarity(p_rarity text, p_sets text[])
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_id text;
  ladder text[] := array['Mythic','Alt-Art','Full-Art','Ultra-Rare','Super-Rare','Rare','Uncommon','Common'];
  i int; start_idx int := array_length(ladder, 1);  -- unknown rarity: fall back to the lowest tier, never Mythic
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

revoke all on function public.random_card_of_rarity(text, text[]) from public, anon, authenticated;
revoke all on function public.random_leader_of_rarity(text, text[]) from public, anon, authenticated;
grant execute on function public.random_card_of_rarity(text, text[]) to service_role;
grant execute on function public.random_leader_of_rarity(text, text[]) to service_role;

-- grant_pack_contents: the Leader branch honours the pack's allowed_sets.
-- Otherwise identical to the live body (compared line by line).
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

revoke all on function public.grant_pack_contents(uuid, pack_types) from public, anon, authenticated;

-- create_mystery_template: null modes and string weights are rejected, and a
-- guarantee / minimum / positive weight must name a rarity that has cards.
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
  if p_mode is null or p_mode not in ('simple', 'advanced') then raise exception 'Unknown mode'; end if;
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
    -- A weight given as a string ("NaN", "Infinity") casts to numeric and slips
    -- past the sign checks below, so insist on real JSON numbers first.
    if exists (
      select 1 from jsonb_each(p_config->'rarity_weights') where jsonb_typeof(value) <> 'number'
    ) then
      raise exception 'rarity_weights must be numbers';
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
    if exists (select 1 from jsonb_array_elements(v_slots) s where coalesce(s->>'mode', '') not in ('exact', 'minimum', 'open')) then
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

revoke all on function public.create_mystery_template(text, integer, text, jsonb) from public, anon;
grant execute on function public.create_mystery_template(text, integer, text, jsonb) to authenticated;

-- H-1 (re-asserted, idempotent): uid-taking helpers are never client-callable.
-- Live already satisfies this; the loop keeps any future overload covered.
do $$
declare
  fn record;
begin
  for fn in
    select p.oid::regprocedure as sig
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname in ('grant_pack_contents', 'grant_xp', 'grant_bp_xp', 'track_stat', 'grant_inventory_pack')
  loop
    execute format('revoke all on function %s from public, anon, authenticated', fn.sig);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. begin_match (H-2): one open ticket per account, serialised per account.
--    Starting a match retires the account's previous unredeemed ticket.
-- ---------------------------------------------------------------------------
create or replace function public.begin_match()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_recent int;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  perform pg_advisory_xact_lock(hashtextextended('begin_match:' || v_uid::text, 0));

  select count(*) into v_recent
    from match_tickets
   where uid = v_uid and started_at > now() - interval '1 hour';
  if v_recent >= 60 then
    raise exception 'Too many matches started recently';
  end if;

  -- One open ticket per account: starting a match retires the previous
  -- unredeemed one (an abandoned match, or a re-mint after a token refresh).
  delete from match_tickets where uid = v_uid and redeemed_at is null;

  insert into match_tickets (uid) values (v_uid) returning match_id into v_id;
  return jsonb_build_object('match_id', v_id, 'started_at', now());
end;
$function$;

revoke all on function public.begin_match() from public, anon;
grant execute on function public.begin_match() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. reset_account (20260830 + H-3 from 20260929000000), with B2.
--
-- B2: the 20260929 version zeroed the wallet (credits = 1500) without looking
-- at auctions the player was HIGH BIDDER on. place_bid escrows the bid out of
-- the bidder's wallet and refunds it when someone outbids, so: bid 49k, reset,
-- get outbid, and the 49k lands on top of the fresh 1.5k, every 7 days. The
-- reset now refuses while the caller holds the high bid on any active
-- listing. Other escrows are unwound by the calls below: listings (cancel),
-- the shop and its slot collateral (close_shop), pending trades (cancel /
-- decline). Purchases (packs, mystery packs, shop listings) are instantaneous
-- and hold nothing back.
--
-- The profile row is locked first, and place_bid / the CPU refund both need
-- that lock to pay a bidder back, so the check below cannot race a refund.
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column if not exists last_account_reset_at timestamptz;

create or replace function public.reset_account()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_profile profiles%rowtype;
  v_listing market_listings%rowtype;
  v_trade trades%rowtype;
  v_deck_box_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select * into v_profile from profiles where id = v_uid for update;
  if not found then raise exception 'Profile not found'; end if;

  if v_profile.role <> 'creator' and v_profile.last_account_reset_at is not null
     and v_profile.last_account_reset_at > now() - interval '7 days' then
    raise exception 'You can reset your account once every 7 days — next reset available %',
      to_char(v_profile.last_account_reset_at + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  if exists (
    select 1 from market_listings where seller = v_uid and status = 'active' and bid_count > 0
  ) then
    raise exception 'You have an active auction with a bid on it — let it end before resetting';
  end if;

  -- B2: the credits behind a standing high bid are in escrow.
  if exists (
    select 1 from market_listings where current_bidder = v_uid and status = 'active'
  ) then
    raise exception 'You are the highest bidder on an active auction — let it end, or wait to be outbid, before resetting';
  end if;

  for v_listing in
    select * from market_listings where seller = v_uid and status = 'active' for update
  loop
    perform cancel_listing(v_listing.id);
  end loop;

  if exists (select 1 from player_shops where owner = v_uid and status <> 'dormant') then
    perform close_shop();
  end if;

  for v_trade in select * from trades where proposer = v_uid and status = 'pending' for update loop
    perform cancel_trade(v_trade.id);
  end loop;
  for v_trade in select * from trades where recipient = v_uid and status = 'pending' for update loop
    perform respond_trade(v_trade.id, false);
  end loop;

  -- The collection and decks. player_achievements, player_cosmetics and
  -- player_inventory are deliberately kept (see 20260929000000, H-3).
  delete from player_cards where user_id = v_uid;
  delete from player_serialized_cards where user_id = v_uid;
  delete from decks where user_id = v_uid;
  delete from graded_cards where user_id = v_uid;
  delete from friendships where requester = v_uid or addressee = v_uid;
  delete from mystery_pack_templates where owner = v_uid;
  delete from trades where proposer = v_uid and status in ('cancelled', 'declined');
  delete from market_listings where seller = v_uid and status = 'cancelled';

  update profiles set
    credits = 1500,
    vouchers = 25,
    wins = 0,
    losses = 0,
    games_played = 0,
    showcase_cards = '{}',
    showcase_slabs = '{}',
    equipped_card_back = null,
    equipped_banner = null,
    equipped_avatar = null,
    last_match_at = null,
    last_account_reset_at = now(),
    updated_at = now()
  where id = v_uid;

  -- Same Deck Box a new account gets, once: a first reset lands the player
  -- where signing up would, and later resets do not mint another.
  if v_profile.last_account_reset_at is null then
    select id into v_deck_box_id from pack_types
      where acquisition = 'deck_box_grant' and is_active limit 1;
    if v_deck_box_id is not null then
      perform grant_inventory_pack(v_uid, v_deck_box_id, 1);
    end if;
  end if;

  return jsonb_build_object('ok', true, 'reset_at', now());
end;
$function$;

revoke all on function public.reset_account() from public, anon;
grant execute on function public.reset_account() to authenticated;

-- ---------------------------------------------------------------------------
-- 6. prune_match_tickets (20260929000002) + its daily schedule.
--    match_tickets only ever grew; readers look back 24 hours at most.
-- ---------------------------------------------------------------------------
create or replace function public.prune_match_tickets()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_deleted integer;
begin
  delete from match_tickets where started_at < now() - interval '7 days';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$function$;

revoke all on function public.prune_match_tickets() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'prune-match-tickets';
    perform cron.schedule('prune-match-tickets', '17 4 * * *', 'select public.prune_match_tickets()');
  end if;
end
$$;
