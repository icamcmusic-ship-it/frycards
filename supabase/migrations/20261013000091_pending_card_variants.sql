-- PENDING (not applied live): bodies that contain DELETE, which the live
-- apply path won't run unattended. Safe to apply any time after
-- 20261013000010_card_variants.sql; behaviour without it is already correct
-- (create_variant_listing pre-seeds CPU ceilings with the variant multiplier,
-- and the client cracks slabs through crack_variant_slab).
--
-- 1. (removed) run_cpu_bidders used to be redefined here with an older body.
--    20261013000100 later redefined run_cpu_bidders with the persona version;
--    applying this file after it would have silently reverted that. The
--    variant_mult handling for lazily computed ceilings belongs in the newest
--    definition (20261013000100 or later), not here.

-- 2. crack_graded_slab: restore the variant itself (then crack_variant_slab
--    can become a plain alias). Note the wrapper adds +1 too, so when this is
--    applied, ALSO redefine crack_variant_slab to just `return crack_graded_slab(p_id);`.
create or replace function public.crack_graded_slab(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_g graded_cards%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_g from graded_cards where id = p_id and user_id = v_uid for update;
  if not found then raise exception 'Slab not found'; end if;
  if v_g.grade is null or v_g.crossover_pending then raise exception 'That card is still being graded'; end if;

  insert into player_cards (user_id, card_id, quantity, foil_quantity)
    values (v_uid, v_g.card_id,
            case when v_g.foil then 0 else 1 end,
            case when v_g.foil then 1 else 0 end)
    on conflict (user_id, card_id) do update set
      quantity = player_cards.quantity + excluded.quantity,
      foil_quantity = player_cards.foil_quantity + excluded.foil_quantity;
  perform card_variant_adjust(v_uid, v_g.card_id, v_g.foil, v_g.variant, 1);

  delete from graded_cards where id = p_id;
  return jsonb_build_object('ok', true, 'variant', v_g.variant);
end $$;


create or replace function public.crack_variant_slab(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  return crack_graded_slab(p_id);
end $$;
