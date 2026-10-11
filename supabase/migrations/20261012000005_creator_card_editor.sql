-- 2026-10-12 Creator card editor (docs/CARD_SUBMISSIONS.md, "Card editor").
--
-- creator_update_card writes one EXISTING card's identity, template.overrides
-- and the derived mechanics columns together, through apply_card_upsert (the
-- validator every Creator write already uses), Creator-only by role. Passing
-- no `overrides` is RESET TO ROLLED. Because get_catalog_version() hashes
-- every template, the write itself bumps the version; the new version is
-- returned so the editor can show it. Idempotent.

create or replace function public.creator_update_card(p_card jsonb)
returns text language plpgsql security definer set search_path to 'public' as $function$
declare
  v_id text := btrim(coalesce(p_card->>'id', ''));
  v_old jsonb;
begin
  perform assert_creator();
  select template into v_old from cards where id = v_id for update;
  if not found then raise exception 'No card with id "%".', v_id; end if;
  -- Art is not edited here: keep the stored URL unless one is sent.
  if btrim(coalesce(p_card->>'image_url', '')) = '' then
    p_card := p_card || jsonb_build_object('image_url', (select image_url from cards where id = v_id));
  end if;
  perform apply_card_upsert(p_card, true);
  return get_catalog_version();
end $function$;
revoke all on function public.creator_update_card(jsonb) from public, anon;
grant execute on function public.creator_update_card(jsonb) to authenticated;
