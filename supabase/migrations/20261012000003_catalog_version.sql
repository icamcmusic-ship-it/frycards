-- 2026-10-12 audit 2026-10-11 §7 S6 (option b): a one-row catalog version.
--
-- get_catalog_version() returns md5 over every card's template (the exact
-- payload the client caches) plus the row count. The client keeps its cached
-- catalog for as long as this matches, and downloads the ~97 kB catalog only
-- when it changes, instead of on every 6 h expiry. About 40 bytes per check.
-- (Option a, a static versioned catalog.json on the Pages host, needs a deploy
-- step outside this repo's database and is not done.)
-- SECURITY INVOKER: `cards` is already readable by guests, so nothing is
-- widened (and the anon SECURITY DEFINER advisor stays quiet). Idempotent.

create or replace function public.get_catalog_version()
returns text language sql stable security invoker set search_path to 'public' as $function$
  select count(*)::text || ':' || coalesce(md5(string_agg(template::text, '|' order by id)), '')
    from cards;
$function$;
revoke all on function public.get_catalog_version() from public;
grant execute on function public.get_catalog_version() to anon, authenticated;
