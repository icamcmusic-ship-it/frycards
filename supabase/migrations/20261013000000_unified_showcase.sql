-- 2026-10-13: one profile showcase for cards AND graded slabs.
--
-- Slabs used to pin to their own profiles.showcase_slabs (max 3, a separate
-- "GRADED SHOWCASE" row). They now live in profiles.showcase_cards next to
-- cards, as 'slab:<graded_cards.id>' entries, sharing the 6-slot cap and the
-- order the owner chose.
--
-- * set_showcase_cards accepts both kinds. Card entries keep the delta-only
--   ownership check; newly added slab entries must be the caller's own,
--   graded, non-retired, non-crossover slabs.
-- * prune_showcase_slab (sold / cracked / traded / owner-changed / retired
--   triggers on graded_cards) now strips the 'slab:' entry from showcase_cards
--   (and still from the legacy column).
-- * get_showcase_slabs reads the slab entries out of showcase_cards.
-- * set_showcase_slabs stays as a compatibility shim for old clients: it
--   replaces the slab entries in showcase_cards, keeping the cards.
-- * Existing showcase_slabs pins are appended to showcase_cards (up to 6) and
--   the legacy column is emptied. Dropping it is in
--   20261013000090_pending_unified_showcase_cleanup.sql.

create or replace function public.set_showcase_cards(p_card_ids text[])
returns text[] language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ids text[];
  v_current text[];
  v_added text[];
  v_added_cards text[];
  v_added_slabs uuid[];
  v_owned int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  v_ids := coalesce(p_card_ids, '{}');
  if coalesce(array_length(v_ids, 1), 0) > 6 then
    raise exception 'You can showcase at most 6 cards and slabs';
  end if;
  if (select count(distinct x) from unnest(v_ids) as x) <> coalesce(array_length(v_ids, 1), 0) then
    raise exception 'Duplicate entries in showcase';
  end if;

  select coalesce(showcase_cards, '{}') into v_current from profiles where id = v_uid;
  if not found then raise exception 'Not authenticated'; end if;

  select coalesce(array_agg(x), '{}') into v_added
  from unnest(v_ids) as x
  where not (x = any(v_current));

  select coalesce(array_agg(x), '{}') into v_added_cards
  from unnest(v_added) as x where x not like 'slab:%';

  begin
    select coalesce(array_agg(substr(x, 6)::uuid), '{}') into v_added_slabs
    from unnest(v_added) as x where x like 'slab:%';
  exception when invalid_text_representation then
    raise exception 'Invalid slab in showcase';
  end;

  if coalesce(array_length(v_added_cards, 1), 0) > 0 then
    select count(*) into v_owned
    from player_cards
    where user_id = v_uid
      and card_id = any(v_added_cards)
      and (quantity + foil_quantity) > 0;
    if v_owned <> array_length(v_added_cards, 1) then
      raise exception 'You can only showcase cards you own';
    end if;
  end if;

  if coalesce(array_length(v_added_slabs, 1), 0) > 0 then
    select count(*) into v_owned
    from graded_cards g
    where g.id = any(v_added_slabs)
      and g.user_id = v_uid
      and g.grade is not null
      and not coalesce(g.retired, false)
      and not coalesce(g.crossover_pending, false);
    if v_owned <> array_length(v_added_slabs, 1) then
      raise exception 'You can only showcase your own graded slabs';
    end if;
  end if;

  update profiles set showcase_cards = v_ids, updated_at = now() where id = v_uid;
  return v_ids;
end;
$$;

create or replace function public.prune_showcase_slab()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update profiles
     set showcase_cards = array_remove(showcase_cards, 'slab:' || old.id::text),
         showcase_slabs = array_remove(showcase_slabs, old.id)
   where id = old.user_id
     and (('slab:' || old.id::text) = any(showcase_cards) or old.id = any(showcase_slabs));
  return old;
end;
$$;

create or replace function public.get_showcase_slabs(p_user uuid)
returns setof graded_cards language sql stable security definer set search_path = public as $$
  select g.* from profiles p
    cross join lateral unnest(p.showcase_cards) with ordinality as e(entry, ord)
    join graded_cards g on e.entry = 'slab:' || g.id::text
   where p.id = p_user and g.user_id = p_user and g.grade is not null
   order by e.ord;
$$;

-- Compatibility for clients that still call set_showcase_slabs: swap the slab
-- entries in the unified showcase, keeping the pinned cards (cards first).
create or replace function public.set_showcase_slabs(p_ids uuid[])
returns uuid[] language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ids uuid[] := coalesce(p_ids, '{}');
  v_cards text[];
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select coalesce(array_agg(x order by o), '{}') into v_cards
    from profiles p, unnest(p.showcase_cards) with ordinality as t(x, o)
   where p.id = v_uid and x not like 'slab:%';
  perform set_showcase_cards(
    v_cards || coalesce((select array_agg('slab:' || i::text order by o)
                           from unnest(v_ids) with ordinality as s(i, o)), '{}'));
  return v_ids;
end;
$$;

-- Move existing slab pins into the unified showcase (cap 6, no duplicates).
update profiles p
   set showcase_cards = (
         select coalesce(array_agg(x order by o), '{}') from (
           select x, o from unnest(p.showcase_cards) with ordinality as a(x, o)
           union all
           select 'slab:' || s::text, 100 + o
             from unnest(p.showcase_slabs) with ordinality as b(s, o)
            where not (('slab:' || s::text) = any(p.showcase_cards))
              and exists (select 1 from graded_cards g
                           where g.id = s and g.user_id = p.id and g.grade is not null)
           order by o limit 6
         ) m),
       showcase_slabs = '{}'
 where coalesce(array_length(p.showcase_slabs, 1), 0) > 0;

revoke all on function public.set_showcase_cards(text[]) from public, anon;
grant execute on function public.set_showcase_cards(text[]) to authenticated;
revoke all on function public.set_showcase_slabs(uuid[]) from public, anon;
grant execute on function public.set_showcase_slabs(uuid[]) to authenticated;
grant execute on function public.get_showcase_slabs(uuid) to anon, authenticated;
revoke all on function public.prune_showcase_slab() from public, anon, authenticated;
