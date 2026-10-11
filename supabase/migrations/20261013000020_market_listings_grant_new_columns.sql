-- Hotfix (applied live 2026-10-13): the Marketplace failed to load ("cannot
-- load marketplace"). 20261011000001 replaced table-level SELECT on
-- market_listings with a column list; the slab (#173) and variant (#174)
-- columns were added later without being granted, so the client's explicit
-- select of them was refused with "permission denied".
grant select (graded_id, slab_grade, slab_service, slab_pristine, variant)
  on public.market_listings to anon, authenticated;
