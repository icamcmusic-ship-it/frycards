-- Cosmetic image mirror: the manual showcase-art run also copies every
-- shop_items image that is hot-linked from somewhere else (cdn.midjourney.com
-- today) onto the frycards-showcase Pages project as Cosmetics/<id>.webp, then
-- points shop_items.image_url at the copy.
--
-- Same pattern as art_pipeline_jobs / art_pipeline_report (20261012000004):
-- both calls are gated by the shared ART_PIPELINE_TOKEN (art_pipeline_check).
-- The report is compare-and-set: a row whose image_url changed since the job
-- list was read is left alone. Idempotent; no DROP or DELETE.

create or replace function public.cosmetics_mirror_jobs(p_token text)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
begin
  perform art_pipeline_check(p_token);
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'image_url', image_url) order by id)
      from shop_items
     where image_url is not null and btrim(image_url) <> ''), '[]'::jsonb);
end $function$;
revoke all on function public.cosmetics_mirror_jobs(text) from public;
grant execute on function public.cosmetics_mirror_jobs(text) to anon, authenticated;

create or replace function public.cosmetics_mirror_report(p_token text, p_results jsonb)
returns int language plpgsql security definer set search_path to 'public' as $function$
declare
  r jsonb;
  v_url text;
  v_n int := 0;
begin
  perform art_pipeline_check(p_token);
  if jsonb_typeof(p_results) <> 'array' then raise exception 'p_results must be an array'; end if;
  for r in select * from jsonb_array_elements(p_results) loop
    v_url := btrim(coalesce(r->>'image_url', ''));
    if v_url !~* '^https://[^[:space:]]+$' then
      raise exception 'image_url must be an https:// link';
    end if;
    update shop_items set image_url = v_url
     where id::text = r->>'id' and image_url = r->>'source_url';
    if found then v_n := v_n + 1; end if;
  end loop;
  return v_n;
end $function$;
revoke all on function public.cosmetics_mirror_report(text, jsonb) from public;
grant execute on function public.cosmetics_mirror_report(text, jsonb) to anon, authenticated;
