-- PENDING / DESTRUCTIVE — not applied live. Review, then apply by hand once no
-- deployed client calls set_showcase_slabs (20261013000000 made slab pins part
-- of profiles.showcase_cards and emptied profiles.showcase_slabs).
--
-- 1. reset_account still clears showcase_slabs; rewrite it without that line
--    so the column can go.
-- 2. Drop the compatibility shim and the legacy column + its CHECK.

do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.reset_account()'::regprocedure);
  if v_def like '%showcase_slabs%' then
    execute regexp_replace(v_def, '\n\s*showcase_slabs = ''\{\}'',', '');
  end if;
end $$;

drop function if exists public.set_showcase_slabs(uuid[]);
alter table public.profiles drop constraint if exists profiles_showcase_slabs_max3;
alter table public.profiles drop column if exists showcase_slabs;
-- prune_showcase_slab references showcase_slabs; redefine it without it.
create or replace function public.prune_showcase_slab()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update profiles
     set showcase_cards = array_remove(showcase_cards, 'slab:' || old.id::text)
   where id = old.user_id and ('slab:' || old.id::text) = any(showcase_cards);
  return old;
end;
$$;
