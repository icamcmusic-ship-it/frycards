-- FryCards Poker: the deck functions stop applying the retired MTG-style rules.
--
-- * poker_deck_modes(leader, card_ids): the modes a list is legal in — the
--   server mirror of checkDeck / legalModes (src/game/poker/deck.ts). A deck
--   is 1 Location + N powers (Quick 16 / Standard 24 / Deep 36), at most 2 / 2
--   / 3 copies of a card, at most 1 / 2 / 3 tier-5 powers, every card inside
--   the Leader's colours, no Leader in the list. A power's tier is
--   `cards.might` (written by scripts/sync-cards-db.ts); colours are
--   `cards.essence_types`.
-- * save_deck grades is_valid with it (was: 60-100 cards). The hard copy cap
--   is the largest mode limit, 3, instead of the per-rarity cap (1 for a
--   Mythic) that refused legal poker decks.
-- * claim_deck_box keeps the box's 60-card grant and its value (2 Super-Rare
--   or Rare, 8 Rare, the rest Common/Uncommon), but poker-shaped: 2 Locations
--   instead of 12, and at most 2 copies of a card. It saves a legal Standard
--   deck built from the granted cards (curve and revive share as the CPU
--   builder, buildDeck) instead of the 60-card list the client had to rebuild.
--   A Leader with no on-colour Super-Rare (Ruin-Walker Overseer) used to fail
--   the claim; the Super-Rare slots now fall back to Rares.
-- * pick_deck_bucket's "cheap first" reads the tier (might <= 2) instead of
--   the retired essence cost, and caps a card at 2 copies.
-- * apply_card_upsert accepts poker mechanics (no essence cost, no grit): a
--   power needs its tier in mechanics.might. It required both, so every
--   Creator import and approved submission failed after the poker swap.
--
-- Idempotent: CREATE OR REPLACE throughout, plus a re-grade of saved decks.

create or replace function public.poker_deck_modes(p_leader_id text, p_card_ids text[])
returns text[]
language plpgsql
stable
set search_path to 'public'
as $$
declare
  v_ids text[] := coalesce(p_card_ids, '{}');
  v_identity text[];
  v_known int;
  v_leaders int;
  v_locs int;
  v_powers int;
  v_tier5 int;
  v_off boolean;
  v_maxn int;
  v_mode record;
  v_out text[] := '{}';
begin
  select coalesce(essence_types, '{}') into v_identity
    from cards where id = p_leader_id and card_type = 'Leader';
  if not found then return v_out; end if;

  select count(c.id),
         count(*) filter (where c.card_type = 'Leader'),
         count(*) filter (where c.card_type = 'Location'),
         count(*) filter (where c.card_type in ('Unit', 'Item', 'Event')),
         count(*) filter (where c.card_type in ('Unit', 'Item', 'Event') and c.might = 5),
         coalesce(bool_or(c.id is not null
                          and not (coalesce(c.essence_types, '{}') <@ v_identity)), false)
    into v_known, v_leaders, v_locs, v_powers, v_tier5, v_off
    from unnest(v_ids) as u(id) left join cards c on c.id = u.id;

  if v_known < coalesce(array_length(v_ids, 1), 0) or v_leaders > 0 or v_locs <> 1 or v_off then
    return v_out;
  end if;

  select coalesce(max(n), 0) into v_maxn
    from (select count(*) as n from unnest(v_ids) as id group by id) t;

  for v_mode in
    select * from (values ('quick', 16, 2, 1), ('standard', 24, 2, 2), ('deep', 36, 3, 3))
      as m(id, powers, max_copies, max_tier5)
  loop
    if v_powers = v_mode.powers and v_maxn <= v_mode.max_copies and v_tier5 <= v_mode.max_tier5 then
      v_out := v_out || v_mode.id::text;
    end if;
  end loop;
  return v_out;
end $$;

revoke all on function public.poker_deck_modes(text, text[]) from public, anon;
grant execute on function public.poker_deck_modes(text, text[]) to authenticated;

create or replace function public.save_deck(p_deck_id uuid, p_name text, p_leader_id text, p_card_ids text[])
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_leader cards%rowtype;
  v_deck decks%rowtype;
  v_row record;
  v_have int; v_locked int;
  v_name text; v_is_valid boolean;
  v_leader_have int; v_leader_locked int;
  v_ids text[] := coalesce(p_card_ids, '{}');
  -- The largest copy limit of any mode (Deep). A draft may hold a list that
  -- is legal in no mode yet; it still may not exceed this.
  c_max_copies constant int := 3;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_uid::text, 0));
  if p_deck_id is not null then
    select * into v_deck from decks where id = p_deck_id and user_id = v_uid;
    if not found then raise exception 'Deck not found'; end if;
  end if;
  select * into v_leader from cards where id = p_leader_id and card_type = 'Leader';
  if not found then raise exception 'Unknown Leader'; end if;
  -- Leaders are reserved one-copy-per-deck just like cards: a single owned
  -- copy cannot back two decks.
  select coalesce(quantity, 0) + coalesce(foil_quantity, 0) into v_leader_have
    from player_cards where user_id = v_uid and card_id = p_leader_id;
  select count(*) into v_leader_locked
    from decks
    where decks.user_id = v_uid and decks.leader_id = p_leader_id
      and (p_deck_id is null or decks.id != p_deck_id);
  if coalesce(v_leader_have, 0) - v_leader_locked < 1 then
    raise exception 'You do not own a free copy of the Leader % (it may be locked in another deck)', v_leader.name;
  end if;
  if array_length(v_ids, 1) is not null and array_length(v_ids, 1) > 100 then
    raise exception 'Deck cannot exceed 100 cards';
  end if;
  for v_row in
    select u.id, count(*)::int as n, c.name
    from unnest(v_ids) as u(id) join cards c on c.id = u.id
    group by u.id, c.name
  loop
    if v_row.n > c_max_copies then
      raise exception 'Too many copies of % (at most % in any mode)', v_row.name, c_max_copies;
    end if;
    select coalesce(quantity, 0) + coalesce(foil_quantity, 0) into v_have
      from player_cards where user_id = v_uid and card_id = v_row.id;
    v_have := coalesce(v_have, 0);
    select count(*) into v_locked
    from decks, unnest(card_ids) as cid
    where decks.user_id = v_uid and cid = v_row.id and (p_deck_id is null or decks.id != p_deck_id);
    if v_row.n > (v_have - v_locked) then
      raise exception 'Not enough copies available of % (some may be locked in another deck)', v_row.name;
    end if;
  end loop;
  v_name := coalesce(nullif(trim(p_name), ''), 'New Deck');
  -- Legal in at least one poker mode. A list that is not saves as a draft.
  v_is_valid := coalesce(array_length(poker_deck_modes(p_leader_id, v_ids), 1), 0) > 0;
  if p_deck_id is not null then
    update decks set name = v_name, leader_id = p_leader_id, card_ids = v_ids,
        is_valid = v_is_valid, updated_at = now()
      where id = p_deck_id returning * into v_deck;
  else
    insert into decks (user_id, name, leader_id, card_ids, is_valid)
      values (v_uid, v_name, p_leader_id, v_ids, v_is_valid)
      returning * into v_deck;
  end if;
  return to_jsonb(v_deck);
end;
$function$;

create or replace function public.pick_deck_bucket(
  p_seed text, p_identity text[], p_rarities text[], p_types text[], p_target integer,
  p_cheap_first boolean default false, p_sets text[] default null::text[])
returns text[]
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_out text[] := '{}';
  v_rec record;
  v_take int;
begin
  if p_target is null or p_target <= 0 then return v_out; end if;
  for v_rec in
    select c.id,
      -- A deck plays at most 2 copies (3 in Deep); a third copy in a grant
      -- would only be quicksell fodder.
      case when c.rarity in ('Mythic', 'Alt-Art') then 1 else 2 end as cap
    from cards c
    where c.card_type <> 'Leader'
      and c.rarity = any(p_rarities)
      and coalesce(c.essence_types, '{}') <@ p_identity
      and (p_types is null or c.card_type = any(p_types))
      and (p_sets is null or c.set_name = any(p_sets))
    order by
      case when p_cheap_first and coalesce(c.might, 1) <= 2 then 0 else 1 end,
      md5(p_seed || c.id)
  loop
    exit when coalesce(array_length(v_out, 1), 0) >= p_target;
    v_take := least(v_rec.cap, p_target - coalesce(array_length(v_out, 1), 0));
    while v_take > 0 loop
      v_out := v_out || v_rec.id;
      v_take := v_take - 1;
    end loop;
  end loop;
  return v_out;
end $function$;

-- A legal Standard deck (1 Location + 24 powers) from a granted list: the
-- server mirror of buildDeck's curve (<= 30% tier 3, <= 12.5% tier 4, <= 2
-- tier 5), revive share (15%: Redraw / Windfall / Wild / Exhume) and one
-- situational card (Rerun / Snuff / Call Out), using each card at most as
-- many times as it was granted. The box's chase cards (Super-Rare, Rare) go
-- in first. Returns null when the grant cannot make a legal deck.
create or replace function public.poker_box_deck(p_seed text, p_granted text[])
returns text[]
language plpgsql
stable
set search_path to 'public'
as $$
declare
  c_powers constant int := 24;
  c_copies constant int := 2;
  c_tier5 constant int := 2;
  c_tier4 constant int := 3;
  c_tier3 constant int := 7;
  c_revives constant int := 4;
  v_revive constant text[] := array['Redraw', 'Windfall', 'Wild', 'Exhume'];
  v_odd constant text[] := array['Rerun', 'Snuff', 'Call Out'];
  v_location text;
  v_out text[] := '{}';
  v_rec record;
  v_pass int;
  v_n int;
  v_t3 int := 0; v_t4 int := 0; v_t5 int := 0; v_rv int := 0; v_sit int := 0;
begin
  select c.id into v_location
    from unnest(p_granted) as u(id) join cards c on c.id = u.id
    where c.card_type = 'Location'
    order by array_position(array['Mythic','Alt-Art','Ultra-Rare','Full-Art','Super-Rare','Rare','Uncommon','Common'], c.rarity),
             md5(p_seed || c.id)
    limit 1;
  if v_location is null then return null; end if;

  -- Pass 0 seeds the revives, cheapest first; passes 1-2 respect the curve;
  -- pass 3 fills whatever is left (tier-5 and copy limits always hold).
  for v_pass in 0..3 loop
    for v_rec in
      select c.id, coalesce(c.might, 1) as tier, g.n as granted,
             coalesce(string_to_array(c.keywords, ', '), '{}') && v_revive as revive,
             coalesce(string_to_array(c.keywords, ', '), '{}') && v_odd as odd
        from (select id, count(*)::int as n from unnest(p_granted) as id group by id) g
        join cards c on c.id = g.id
        where c.card_type in ('Unit', 'Item', 'Event')
        order by
          case when v_pass = 0 then coalesce(c.might, 1) else 0 end,
          array_position(array['Mythic','Alt-Art','Ultra-Rare','Full-Art','Super-Rare','Rare','Uncommon','Common'], c.rarity),
          md5(p_seed || c.id)
    loop
      exit when coalesce(array_length(v_out, 1), 0) >= c_powers;
      if v_pass = 0 and (not v_rec.revive or v_rv >= c_revives) then continue; end if;
      select count(*) into v_n from unnest(v_out) as x where x = v_rec.id;
      -- One copy per card on the first passes, the second copy later.
      if v_n >= least(case when v_pass <= 1 then 1 else c_copies end, v_rec.granted) then continue; end if;
      if v_rec.tier = 5 and v_t5 >= c_tier5 then continue; end if;
      if v_pass < 3 then
        if v_rec.tier = 4 and v_t4 >= c_tier4 then continue; end if;
        if v_rec.tier = 3 and v_t3 >= c_tier3 then continue; end if;
        if v_rec.revive and v_rv >= c_revives then continue; end if;
        if v_rec.odd and v_sit >= 1 then continue; end if;
      end if;
      v_out := v_out || v_rec.id;
      if v_rec.tier = 3 then v_t3 := v_t3 + 1; end if;
      if v_rec.tier = 4 then v_t4 := v_t4 + 1; end if;
      if v_rec.tier = 5 then v_t5 := v_t5 + 1; end if;
      if v_rec.revive then v_rv := v_rv + 1; end if;
      if v_rec.odd then v_sit := v_sit + 1; end if;
    end loop;
  end loop;
  if coalesce(array_length(v_out, 1), 0) < c_powers then return null; end if;
  return v_location || v_out;
end $$;

revoke all on function public.poker_box_deck(text, text[]) from public, anon, authenticated;

create or replace function public.claim_deck_box(p_leader_id text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_pack pack_types%rowtype;
  v_inv player_inventory%rowtype;
  v_leader cards%rowtype;
  v_identity text[];
  v_seed text;
  v_sr text[];
  v_rare text[];
  v_locs text[];
  v_fill text[];
  v_grant text[];
  v_deck text[];
  v_loc_have int;
  v_card cards%rowtype;
  v_results jsonb := '[]'::jsonb;
  v_profile profiles%rowtype;
  v_ladder text[] := array['Common','Uncommon','Rare','Super-Rare','Ultra-Rare','Full-Art','Alt-Art','Mythic'];
  c_grant_size constant int := 60;
  c_sr constant int := 2;
  c_rare constant int := 8;
  c_locs constant int := 2;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select * into v_pack from pack_types where acquisition = 'deck_box_grant' and is_active limit 1;
  if not found then raise exception 'No Deck Box configured'; end if;

  select * into v_inv from player_inventory
    where user_id = v_uid and pack_type_id = v_pack.id for update;
  if not found or v_inv.quantity < 1 then raise exception 'You have no Deck Box to open'; end if;

  select * into v_leader from cards where id = p_leader_id and card_type = 'Leader';
  if not found then raise exception 'Unknown Leader'; end if;
  if coalesce(array_position(v_ladder, v_leader.rarity), 1) > array_position(v_ladder, 'Rare') then
    raise exception 'That Leader is above Deck Box rarity — pick Rare or lower';
  end if;

  v_identity := coalesce(v_leader.essence_types, '{}');
  if array_length(v_identity, 1) is null then
    raise exception 'Leader % has no colour identity', v_leader.name;
  end if;
  v_seed := v_uid::text || '|' || p_leader_id;

  -- The Super-Rare slots fall back to Rares for a colour pair with too few
  -- Super-Rares (Root/Void has none).
  v_sr := pick_deck_bucket(v_seed || '|sr', v_identity, array['Super-Rare'], null, c_sr, false, v_pack.allowed_sets);
  v_rare := pick_deck_bucket(v_seed || '|rare', v_identity, array['Rare'], null,
                             c_rare + c_sr - coalesce(array_length(v_sr, 1), 0), false, v_pack.allowed_sets);
  if coalesce(array_length(v_sr, 1), 0) + coalesce(array_length(v_rare, 1), 0) < c_sr + c_rare then
    raise exception 'Not enough % cards to build a Deck Box', v_leader.name;
  end if;

  select count(*) into v_loc_have from cards
    where id = any(v_sr || v_rare) and card_type = 'Location';
  v_locs := pick_deck_bucket(v_seed || '|loc', v_identity, array['Common','Uncommon'],
                             array['Location'], greatest(0, c_locs - v_loc_have), false, v_pack.allowed_sets);

  v_fill := pick_deck_bucket(v_seed || '|fill', v_identity, array['Common','Uncommon'],
                             array['Unit','Item','Event'],
                             c_grant_size - coalesce(array_length(v_sr || v_rare || v_locs, 1), 0),
                             true, v_pack.allowed_sets);

  v_grant := v_sr || v_rare || v_locs || v_fill;
  if coalesce(array_length(v_grant, 1), 0) < c_grant_size then
    raise exception 'Card pool too small to build a % Deck Box', v_leader.name;
  end if;
  v_deck := poker_box_deck(v_seed, v_grant);
  if v_deck is null then
    raise exception 'Card pool too small to build a % Deck Box', v_leader.name;
  end if;

  update player_inventory set quantity = quantity - 1
    where user_id = v_uid and pack_type_id = v_pack.id;

  insert into player_cards (user_id, card_id, quantity)
  values (v_uid, v_leader.id, 1)
  on conflict (user_id, card_id) do update set quantity = player_cards.quantity + 1;
  v_results := v_results || jsonb_build_object(
    'card_id', v_leader.id, 'name', v_leader.name, 'rarity', v_leader.rarity,
    'card_type', v_leader.card_type, 'image_url', v_leader.image_url, 'foil', false,
    'slot', 'leader', 'converted_to_credits', false, 'credit_value', 0);

  insert into player_cards (user_id, card_id, quantity)
  select v_uid, d.id, d.n from (select id, count(*) as n from unnest(v_grant) as id group by id) d
  on conflict (user_id, card_id) do update set quantity = player_cards.quantity + excluded.quantity;

  for v_card in
    select distinct on (c.id) c.* from unnest(v_grant) as u(id) join cards c on c.id = u.id
    order by c.id
  loop
    v_results := v_results || jsonb_build_object(
      'card_id', v_card.id, 'name', v_card.name, 'rarity', v_card.rarity,
      'card_type', v_card.card_type, 'image_url', v_card.image_url, 'foil', false,
      'slot', 'deck_box', 'converted_to_credits', false, 'credit_value', 0);
  end loop;

  insert into decks (user_id, name, leader_id, card_ids, is_valid)
  values (v_uid, left(v_leader.name, 40) || ' — Deck Box', v_leader.id, v_deck,
          coalesce(array_length(poker_deck_modes(v_leader.id, v_deck), 1), 0) > 0);

  select * into v_profile from profiles where id = v_uid;
  return jsonb_build_object('cards', v_results, 'credits', v_profile.credits,
    'vouchers', v_profile.vouchers, 'leader_id', v_leader.id, 'deck_saved', true);
end $function$;

create or replace function public.apply_card_upsert(p_card jsonb, p_overwrite boolean default false)
returns text
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_id text := btrim(coalesce(p_card->>'id', ''));
  v_name text := btrim(coalesce(p_card->>'name', ''));
  v_type text := btrim(coalesce(p_card->>'card_type', ''));
  v_rarity text := btrim(coalesce(p_card->>'rarity', ''));
  v_set text := btrim(coalesce(p_card->>'set_name', ''));
  v_flavor text := btrim(coalesce(p_card->>'flavor_text', ''));
  v_image text := btrim(coalesce(p_card->>'image_url', ''));
  v_mech jsonb := coalesce(p_card->'mechanics', '{}'::jsonb);
  v_over jsonb := p_card->'overrides';
  v_rules text := btrim(coalesce(v_mech->>'rules_text', ''));
  v_tier int;
  v_template jsonb;
  v_types text[];
  v_exists boolean;
begin
  if v_id !~ '^[a-z0-9_]{3,64}$' then
    raise exception 'id "%" must be 3-64 chars of a-z, 0-9 or _', v_id;
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    raise exception '% : name must be 1-80 characters', v_id;
  end if;
  if v_type not in ('Leader', 'Unit', 'Item', 'Event', 'Location') then
    raise exception '% : unknown card_type "%"', v_id, v_type;
  end if;
  if v_rarity not in ('Common','Uncommon','Rare','Super-Rare','Ultra-Rare','Full-Art','Alt-Art','Mythic') then
    raise exception '% : unknown rarity "%"', v_id, v_rarity;
  end if;
  if char_length(v_set) < 1 then raise exception '% : set_name is required', v_id; end if;
  if v_image !~* '^https://[^[:space:]]+$' then
    raise exception '% : image_url must be an https:// link', v_id;
  end if;
  if char_length(v_flavor) > 500 then
    raise exception '% : flavor text must be 500 characters or fewer', v_id;
  end if;

  -- Poker mechanics (mechanicsFromDef): colours, a tier for every power
  -- (stored in `might`), keywords and rules text. essence_cost, grit and
  -- resolve are retired and stored as given (null).
  if coalesce(jsonb_typeof(v_mech->'essence_types'), '') <> 'array' then
    raise exception '% : mechanics.essence_types must be an array (empty is fine for a colourless card)', v_id;
  end if;
  if v_rules = '' then
    raise exception '% : a % needs mechanics.rules_text', v_id, v_type;
  end if;
  v_tier := nullif(v_mech->>'might', '')::int;
  if v_type in ('Unit', 'Item', 'Event') and (v_tier is null or v_tier not between 1 and 5) then
    raise exception '% : a % needs its tier (1-5) in mechanics.might', v_id, v_type;
  end if;
  if v_over is not null and jsonb_typeof(v_over) not in ('object', 'null') then
    raise exception '% : overrides must be a JSON object', v_id;
  end if;
  if jsonb_typeof(v_over) = 'object' and v_over = '{}'::jsonb then
    v_over := null;
  end if;

  select exists (select 1 from cards where id = v_id) into v_exists;
  if v_exists and not p_overwrite then
    raise exception '% : a card with this id already exists', v_id;
  end if;

  select coalesce(array_agg(value::text), '{}'::text[]) into v_types
    from jsonb_array_elements_text(v_mech->'essence_types') as value;
  if exists (
    select 1 from unnest(v_types) as t
     where t not in ('Ember','Tide','Root','Gale','Light','Shadow','Void')
  ) then
    raise exception '% : essence_types contains a value that is not a colour', v_id;
  end if;

  v_template := jsonb_build_object(
    'id', v_id, 'set', v_set, 'name', v_name, 'type', v_type,
    'image', v_image, 'flavor', v_flavor, 'rarity', v_rarity
  );
  if jsonb_typeof(v_over) = 'object' then
    v_template := v_template || jsonb_build_object('overrides', v_over);
  end if;

  insert into cards (
    id, name, card_type, rarity, set_name, flavor_text, image_url, keywords, template,
    essence_cost, essence_types, might, grit, card_subtype, resolve, rules_text
  ) values (
    v_id, v_name, v_type, v_rarity, v_set, nullif(v_flavor, ''), v_image,
    nullif(btrim(coalesce(v_mech->>'keywords', '')), ''),
    v_template,
    case when jsonb_typeof(v_mech->'essence_cost') = 'object' then v_mech->'essence_cost' end,
    v_types,
    v_tier,
    nullif(v_mech->>'grit', '')::int,
    nullif(btrim(coalesce(v_mech->>'card_subtype', '')), ''),
    nullif(v_mech->>'resolve', '')::int,
    v_rules
  )
  on conflict (id) do update set
    name = excluded.name, card_type = excluded.card_type, rarity = excluded.rarity,
    set_name = excluded.set_name, flavor_text = excluded.flavor_text,
    image_url = excluded.image_url, keywords = excluded.keywords, template = excluded.template,
    essence_cost = excluded.essence_cost, essence_types = excluded.essence_types,
    might = excluded.might, grit = excluded.grit, card_subtype = excluded.card_subtype,
    resolve = excluded.resolve, rules_text = excluded.rules_text, updated_at = now();

  return case when v_exists then 'updated' else 'inserted' end;
end $function$;

-- Re-grade saved decks under the poker rules. Only ever turns a flag off
-- here (a retired 60-card list); a poker list that the old rule graded
-- false is re-graded on its next save, so no decks_built stat is granted
-- retroactively by this backfill.
update decks set is_valid = false
  where is_valid
    and coalesce(array_length(poker_deck_modes(leader_id, card_ids), 1), 0) = 0;
