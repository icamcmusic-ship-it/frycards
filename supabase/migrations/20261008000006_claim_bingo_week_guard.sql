-- 2026-10-08, audit M9: a bingo panel left open across the Monday 00:00 UTC
-- reset claimed line N on the NEW card, because claim_bingo resolved "this
-- week" on the server only. The client can now say which week it is looking
-- at (get_bingo already returns `week_start` and `resets_at`); if that is not
-- the current week the claim is refused and nothing is paid, so the player
-- reloads and sees the new card.
--
-- p_week_start is optional (null = the old behaviour), so existing callers keep
-- working. Adding a parameter changes the function's identity, so the
-- one-argument version is dropped first; leaving both would make a
-- one-argument call ambiguous.

drop function if exists public.claim_bingo(int);

-- p_line 0..11 claims a line; 12 claims the blackout.
create or replace function public.claim_bingo(p_line int, p_week_start date default null)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid := auth.uid();
  v_week date := bingo_week_start();
  v_card bingo_cards%rowtype;
  ln int[][] := bingo_lines();
  i int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_week_start is not null and p_week_start <> v_week then
    raise exception 'Bingo card changed — reload';
  end if;
  if p_line is null or p_line < 0 or p_line > 12 then raise exception 'Unknown line'; end if;
  select * into v_card from bingo_cards where user_id = v_uid and week_start = v_week for update;
  if not found then raise exception 'Open your bingo card first'; end if;

  if p_line = 12 then
    if v_card.blackout_claimed then raise exception 'Blackout already claimed this week'; end if;
    for i in 0..24 loop
      if not bingo_cell_done(v_uid, v_card.cells->i) then raise exception 'The card is not complete'; end if;
    end loop;
    update bingo_cards set blackout_claimed = true where user_id = v_uid and week_start = v_week;
    update profiles set credits = credits + 750, vouchers = vouchers + 5, updated_at = now() where id = v_uid;
    perform track_stat(v_uid, 'bingo_blackouts', 1, false);
    return jsonb_build_object('ok', true, 'credits', 750, 'vouchers', 5);
  end if;

  if p_line = any(v_card.claimed) then raise exception 'That line is already claimed'; end if;
  for i in 1..5 loop
    if not bingo_cell_done(v_uid, v_card.cells->(ln[p_line + 1][i])) then
      raise exception 'That line is not complete';
    end if;
  end loop;
  update bingo_cards set claimed = claimed || p_line where user_id = v_uid and week_start = v_week;
  update profiles set credits = credits + 120, updated_at = now() where id = v_uid;
  perform track_stat(v_uid, 'bingo_lines', 1, false);
  return jsonb_build_object('ok', true, 'credits', 120, 'vouchers', 0);
end;
$function$;

revoke all on function public.claim_bingo(int, date) from public, anon;
grant execute on function public.claim_bingo(int, date) to authenticated;
