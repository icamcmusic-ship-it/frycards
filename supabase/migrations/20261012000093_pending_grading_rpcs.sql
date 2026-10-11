-- PENDING — not applied live (the function bodies contain DELETE, which the
-- live-apply rule routes through review). Apply by hand after review.
--
-- Grading redesign (20261012000006) quicksell + crack:
--  * quicksell prices through grading_slab_price: PRISTINE ×40, AMG low-pop
--    bump, and the daily collector's +15% for their favourite company.
--  * both refuse a slab whose crossover is still pending (the BEFORE DELETE
--    trigger graded_cards_block_pending already enforces that live).
-- Until applied, live quicksell still uses grade_mult × premium only, so a
-- PRISTINE slab sells as a Gem Mint 10.

create or replace function quicksell_graded_card(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_g graded_cards%rowtype;
  v_price int;
  v_profile profiles%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  select * into v_g from graded_cards where id = p_id and user_id = v_uid for update;
  if not found then raise exception 'Slab not found'; end if;
  if v_g.grade is null or v_g.crossover_pending then raise exception 'That card is still being graded'; end if;

  v_price := grading_slab_price(p_id);

  delete from graded_cards where id = p_id;
  update profiles set credits = credits + v_price, updated_at = now()
    where id = v_uid returning * into v_profile;

  perform track_stat(v_uid, 'cards_sold', 1, false);

  return jsonb_build_object('ok', true, 'credits', v_profile.credits, 'price', v_price,
    'favourite', grading_collector_favourite());
end $$;

create or replace function crack_graded_slab(p_id uuid)
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

  delete from graded_cards where id = p_id;
  return jsonb_build_object('ok', true);
end $$;

