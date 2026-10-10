-- The last server pieces of the retired MTG-style rules.
--
-- * deck_card_cost(jsonb) summed an essence cost's pips (the 60-card game's
--   mana curve) and rarity_copy_cap(text) held its per-rarity copy limits
--   (Mythic 1, Super-Rare 2, else 4). Since 20261010000000 nothing calls
--   either: pick_deck_bucket orders by tier and save_deck uses the poker copy
--   limit. Both are dropped.
-- * apply_card_upsert stops writing the retired essence_cost / grit /
--   resolve columns at all (null), instead of passing through whatever a
--   payload carries. Otherwise identical to 20261010000000.

drop function if exists public.deck_card_cost(jsonb);
drop function if exists public.rarity_copy_cap(text);

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
  -- resolve are retired: always stored null, whatever the payload says.
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
    null,
    v_types,
    v_tier,
    null,
    nullif(btrim(coalesce(v_mech->>'card_subtype', '')), ''),
    null,
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
