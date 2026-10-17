-- Store: Collector Pack + pack bundles.  Additive and idempotent.
--
-- 1. "Volume #1 Collector Pack": 5 cards, 1499 cr / 15 v. One `collector`
--    slot rolls Ultra-Rare, Full-Art or Mythic with guaranteed_min_rarity
--    'Ultra-Rare', which roll_weighted_rarity (called by grant_pack_contents)
--    enforces as a floor, plus one guaranteed-foil `foil` slot (Rare+).
--    Expected quicksell value ~917 cr (booster ~357 cr at 599), so both
--    return ~60% of their price.
-- 2. shop_bundles: N copies of one pack at a fixed bundle price. Seeded with
--    3x and 10x Volume #1 Booster Pack (about 10% and 20% off).
-- 3. bundle_purchases: one row per purchase, unique per (user, request_id),
--    so a retried call returns the first result instead of charging twice.
-- 4. purchase_bundle(bundle, currency, request_id, open): SECURITY DEFINER,
--    locks the profile, debits atomically, then grants the packs to My Packs
--    (player_inventory) or opens them in place. Charges the cheaper of the
--    bundle price and today's per-pack price times the quantity, so a daily
--    deal never makes the bundle the worse buy.
--
-- No semicolons inside string literals (the MCP apply path splits on them).
-- Applied live 2026-10-17 one statement per apply_migration call: the MCP
-- apply path hung on every multi-statement payload of this file.

insert into public.pack_types (name, description, card_count, guaranteed_rarity, image_url,
  foil_chance, has_foil_slot, price_credits, price_vouchers, pack_tier, slot_config, is_active,
  acquisition, time_limited, allowed_sets, pack_group, set_name)
select 'Volume #1 Collector Pack', null, 5, 'Ultra-Rare', null, 0.0118, true, 1499, 15, 'collector',
  '[{"count":2,"slot_type":"synergy","foil_eligible":true,"rarity_weights":{"Uncommon":0.5,"Rare":0.42,"Super-Rare":0.08},"guaranteed_min_rarity":"Uncommon"},
    {"count":1,"slot_type":"chase","foil_eligible":true,"rarity_weights":{"Rare":0.65,"Super-Rare":0.17,"Ultra-Rare":0.11,"Full-Art":0.05,"Mythic":0.02},"guaranteed_min_rarity":"Rare"},
    {"count":1,"slot_type":"foil","foil_eligible":true,"rarity_weights":{"Rare":0.6,"Super-Rare":0.28,"Ultra-Rare":0.08,"Full-Art":0.03,"Mythic":0.01},"foil_chance_override":1,"guaranteed_min_rarity":"Rare"},
    {"count":1,"slot_type":"collector","foil_eligible":true,"rarity_weights":{"Ultra-Rare":0.75,"Full-Art":0.17,"Mythic":0.08},"guaranteed_min_rarity":"Ultra-Rare"}]'::jsonb,
  true, 'purchase', false, array['Volume #1'], null, null
where not exists (select 1 from public.pack_types p where p.name = 'Volume #1 Collector Pack');

create table if not exists public.shop_bundles (
  id text primary key,
  name text not null,
  pack_type_id uuid not null references public.pack_types(id),
  pack_qty int not null check (pack_qty between 1 and 24),
  price_credits int check (price_credits is null or price_credits > 0),
  price_vouchers int check (price_vouchers is null or price_vouchers > 0),
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
alter table public.shop_bundles enable row level security;
drop policy if exists shop_bundles_read on public.shop_bundles;
create policy shop_bundles_read on public.shop_bundles for select to anon, authenticated
  using (is_active);
revoke all on public.shop_bundles from anon, authenticated;
grant select on public.shop_bundles to anon, authenticated;

create table if not exists public.bundle_purchases (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  bundle_id text not null references public.shop_bundles(id),
  request_id uuid not null,
  currency text not null,
  price_paid int not null,
  opened boolean not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  unique (user_id, request_id)
);
alter table public.bundle_purchases enable row level security;
drop policy if exists bundle_purchases_own on public.bundle_purchases;
create policy bundle_purchases_own on public.bundle_purchases for select to authenticated
  using (user_id = auth.uid());
revoke all on public.bundle_purchases from anon, authenticated;
grant select on public.bundle_purchases to authenticated;

insert into public.shop_bundles (id, name, pack_type_id, pack_qty, price_credits, price_vouchers, sort_order)
select b.id, b.name, p.id, b.qty, b.cr, b.v, b.ord
from (values ('booster_3', 'Booster 3-Pack', 3, 1619, 16, 1),
             ('booster_10', 'Booster 10-Pack', 10, 4799, 48, 2)) as b(id, name, qty, cr, v, ord)
join public.pack_types p on p.name = 'Volume #1 Booster Pack'
on conflict (id) do nothing;

create or replace function public.purchase_bundle(p_bundle_id text, p_currency text default 'credits',
  p_request_id uuid default null, p_open boolean default false)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_cur text := normalize_currency(p_currency);
  v_bundle shop_bundles%rowtype;
  v_pack pack_types%rowtype;
  v_profile profiles%rowtype;
  v_prior jsonb;
  v_bundle_price int;
  v_unit int;
  v_price int;
  v_all jsonb := '[]'::jsonb;
  v_credits_gained int := 0;
  v_grant jsonb;
  v_result jsonb;
  v_i int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if v_cur is null then raise exception 'Unknown currency %', p_currency; end if;
  if p_request_id is null then raise exception 'Missing request id'; end if;

  -- Serialises every purchase by this player, so a retry racing the original
  -- waits for it and then sees its row.
  select * into v_profile from profiles where id = v_uid for update;
  if not found then raise exception 'No profile'; end if;

  select result into v_prior from bundle_purchases
    where user_id = v_uid and request_id = p_request_id;
  if found then
    return v_prior || jsonb_build_object('replayed', true,
      'credits', v_profile.credits, 'vouchers', v_profile.vouchers);
  end if;

  select * into v_bundle from shop_bundles where id = p_bundle_id;
  if not found or not v_bundle.is_active then raise exception 'This bundle is not available'; end if;
  select * into v_pack from pack_types where id = v_bundle.pack_type_id;
  if not found or not v_pack.is_active or v_pack.acquisition <> 'purchase'
    or (v_pack.available_until is not null and v_pack.available_until <= now()) then
    raise exception 'This bundle is not available';
  end if;

  v_bundle_price := case when v_cur = 'credits' then v_bundle.price_credits else v_bundle.price_vouchers end;
  if v_bundle_price is null then raise exception 'This bundle cannot be bought with %', v_cur; end if;
  v_unit := pack_effective_price(v_pack, v_cur);
  v_price := case when v_unit is null then v_bundle_price
    else least(v_bundle_price, v_unit * v_bundle.pack_qty) end;

  if v_cur = 'credits' then
    if v_profile.credits < v_price then raise exception 'Not enough credits'; end if;
    update profiles set credits = credits - v_price, updated_at = now() where id = v_uid;
  else
    if v_profile.vouchers < v_price then raise exception 'Not enough vouchers'; end if;
    update profiles set vouchers = vouchers - v_price, updated_at = now() where id = v_uid;
  end if;

  if p_open then
    for v_i in 1..v_bundle.pack_qty loop
      v_grant := grant_pack_contents(v_uid, v_pack);
      v_all := v_all || (v_grant->'cards');
      v_credits_gained := v_credits_gained + coalesce((v_grant->>'credits_gained')::int, 0);
      perform track_pack_open(v_uid);
    end loop;
    v_result := jsonb_build_object('ok', true, 'bundle_id', v_bundle.id, 'pack_type_id', v_pack.id,
      'quantity', v_bundle.pack_qty, 'opened', true, 'cards', v_all,
      'credits_gained', v_credits_gained, 'packs_opened', v_bundle.pack_qty, 'price_paid', v_price);
  else
    perform grant_inventory_pack(v_uid, v_pack.id, v_bundle.pack_qty);
    v_result := jsonb_build_object('ok', true, 'bundle_id', v_bundle.id, 'pack_type_id', v_pack.id,
      'quantity', v_bundle.pack_qty, 'opened', false, 'price_paid', v_price);
  end if;

  insert into bundle_purchases (user_id, bundle_id, request_id, currency, price_paid, opened, result)
  values (v_uid, v_bundle.id, p_request_id, v_cur, v_price, p_open, v_result);

  select * into v_profile from profiles where id = v_uid;
  return v_result || jsonb_build_object('credits', v_profile.credits, 'vouchers', v_profile.vouchers);
end;
$function$;

revoke all on function public.purchase_bundle(text, text, uuid, boolean) from public, anon;
grant execute on function public.purchase_bundle(text, text, uuid, boolean) to authenticated;
