-- 2026-10-06 audit: economy rebalance, easier levelling, graded-slab showcase.
--
-- 1. Quicksell rescale. Booster Pack EV at quicksell was ~141% of its 599cr
--    price and the Booster Box ~177% of 3799cr: open-and-quicksell printed
--    credits. The new table lands the pack near 59% and the box near 75%.
--    Every server price path (quicksell_cards, quicksell_graded_card,
--    card_blended_reference, the bounty RPCs) reads card_sell_price, so this
--    one function is the whole change. Client mirror: QUICKSELL_PRICES.
-- 2. Levelling curve 50·L·(L-1) -> 20·L·(L-1) (2.5x less XP per level), level
--    reward 100cr -> 75cr per level so the faster curve does not inflate the
--    credit supply 1:1, and the Player Shop unlock 50 -> 20. Existing players
--    are re-levelled on the new curve and paid the skipped levels' rewards.
--    Client mirrors: xpForLevel (ui.tsx), SHOP_UNLOCK_LEVEL (economy.ts).
-- 3. Graded-slab showcase: up to 3 slabs pinned on the profile, readable by
--    anyone through get_showcase_slabs.

-- 1 ---------------------------------------------------------------------------
create or replace function public.card_sell_price(p_rarity text)
returns integer language sql immutable set search_path to 'public' as $$
  select case p_rarity
    when 'Mythic' then 1500
    when 'Alt-Art' then 900
    when 'Full-Art' then 500
    when 'Ultra-Rare' then 300
    when 'Super-Rare' then 120
    when 'Rare' then 40
    when 'Uncommon' then 10
    else 4
  end;
$$;

-- 2 ---------------------------------------------------------------------------
create or replace function public.xp_for_level(p_level integer)
returns integer language sql immutable set search_path to 'public' as $$
  select 20 * (p_level - 1) * p_level;
$$;

create or replace function public.level_for_xp(p_xp integer)
returns integer language sql immutable set search_path to 'public' as $$
  select greatest(1, floor((1 + sqrt(1 + greatest(0, p_xp)::numeric / 5)) / 2)::int);
$$;

create or replace function public.level_reward_credits()
returns integer language sql immutable set search_path to 'public' as $$ select 75 $$;

create or replace function public.grant_xp(p_uid uuid, p_amount integer)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_profile profiles%rowtype;
  v_new_level int;
  v_credits int := 0;
  v_vouchers int := 0;
  l int;
begin
  select * into v_profile from profiles where id = p_uid for update;
  if not found then return '{}'::jsonb; end if;
  v_new_level := greatest(v_profile.level, level_for_xp(v_profile.xp + p_amount));
  if v_new_level > v_profile.level then
    for l in (v_profile.level + 1)..v_new_level loop
      v_credits := v_credits + level_reward_credits();
      if l % 5 = 0 then v_vouchers := v_vouchers + 10; end if;
    end loop;
  end if;
  update profiles
    set xp = xp + p_amount, level = v_new_level,
        credits = credits + v_credits, vouchers = vouchers + v_vouchers, updated_at = now()
    where id = p_uid;
  return jsonb_build_object(
    'xp', v_profile.xp + p_amount, 'level', v_new_level,
    'leveled_up', v_new_level > v_profile.level,
    'credits_bonus', v_credits, 'vouchers_bonus', v_vouchers);
end;
$$;

create or replace function public.shop_unlock_level()
returns integer language sql immutable set search_path to 'public' as $$ select 20 $$;

-- Re-level everyone on the new curve; a grant of 0 XP pays the skipped levels.
do $$
declare r record;
begin
  for r in select id from profiles where level < level_for_xp(xp) loop
    perform grant_xp(r.id, 0);
  end loop;
end $$;

-- 3 ---------------------------------------------------------------------------
alter table public.profiles add column if not exists showcase_slabs uuid[] not null default '{}';
do $$ begin
  alter table public.profiles add constraint profiles_showcase_slabs_max3
    check (coalesce(array_length(showcase_slabs, 1), 0) <= 3);
exception when duplicate_object then null; end $$;

create or replace function public.set_showcase_slabs(p_ids uuid[])
returns uuid[] language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[] := coalesce(p_ids, '{}');
  v_n int := coalesce(array_length(v_ids, 1), 0);
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if v_n > 3 then raise exception 'You can showcase at most 3 slabs'; end if;
  if (select count(distinct x) from unnest(v_ids) x) <> v_n then
    raise exception 'Duplicate slabs in showcase';
  end if;
  if (select count(*) from graded_cards
       where id = any(v_ids) and user_id = v_uid and grade is not null) <> v_n then
    raise exception 'You can only showcase your own graded slabs';
  end if;
  update profiles set showcase_slabs = v_ids, updated_at = now() where id = v_uid;
  return v_ids;
end;
$$;

-- Public read of a player's pinned slabs (graded_cards itself stays owner-only).
create or replace function public.get_showcase_slabs(p_user uuid)
returns setof graded_cards language sql stable security definer set search_path to 'public' as $$
  select g.* from graded_cards g
    join profiles p on p.id = p_user
   where g.id = any(p.showcase_slabs) and g.user_id = p_user and g.grade is not null
   order by array_position(p.showcase_slabs, g.id);
$$;

-- A slab that is sold or cracked leaves the showcase with it.
create or replace function public.prune_showcase_slab()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  update profiles set showcase_slabs = array_remove(showcase_slabs, old.id)
   where id = old.user_id and old.id = any(showcase_slabs);
  return old;
end;
$$;
create or replace trigger graded_cards_prune_showcase after delete on public.graded_cards
  for each row execute function public.prune_showcase_slab();

revoke all on function public.set_showcase_slabs(uuid[]) from public, anon;
grant execute on function public.set_showcase_slabs(uuid[]) to authenticated;
grant execute on function public.get_showcase_slabs(uuid) to anon, authenticated;
revoke all on function public.prune_showcase_slab() from public, anon, authenticated;
revoke all on function public.grant_xp(uuid, integer) from public, anon, authenticated;
