-- 2026-10-07: Set Completion Bingo (AUDIT-2026-10-06 §4 mini-game 3, §7 P1).
--
-- Every account gets a weekly 5x5 card (weeks start Monday 00:00 UTC). Each
-- cell is a collection goal ("own a Rare Tide card", "own a slab graded 8+").
-- Cells are judged LIVE against what the player owns right now, every time the
-- card is read, so there is nothing to submit — collect, then claim. The
-- centre cell is free.
--
-- Rewards (all server-side, once per line per week):
--   each of the 12 lines (5 rows, 5 columns, 2 diagonals)   120 credits
--   blackout (all 25 cells)                                 750 credits + 5 vouchers
-- so a week is worth at most 2,190 credits + 5 vouchers — weekly-mission scale.
-- A claim re-checks the line at claim time, so a card traded away first
-- cannot be claimed against.

create table if not exists public.bingo_cards (
  user_id uuid not null references public.profiles(id) on delete cascade,
  week_start date not null,
  cells jsonb not null,
  claimed int[] not null default '{}',
  blackout_claimed boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (user_id, week_start)
);
alter table public.bingo_cards enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'bingo_cards' and policyname = 'own bingo read') then
    create policy "own bingo read" on public.bingo_cards for select using (user_id = auth.uid());
  end if;
end $$;

create or replace function public.bingo_week_start()
returns date language sql stable set search_path to 'public' as $$
  select date_trunc('week', now() at time zone 'utc')::date;
$$;

-- One cell's goal against the player's current collection.
create or replace function public.bingo_cell_done(p_uid uuid, p_cell jsonb)
returns boolean language plpgsql stable security definer set search_path to 'public' as $$
declare
  k text := p_cell->>'kind';
  a text := p_cell->>'a';
  b text := p_cell->>'b';
  n int := coalesce((p_cell->>'n')::int, 1);
begin
  if k = 'free' then return true; end if;
  if k = 'rar_ess' then
    return exists (select 1 from player_cards pc join cards c on c.id = pc.card_id
      where pc.user_id = p_uid and pc.quantity + pc.foil_quantity > 0
        and c.rarity = a and b = any(c.essence_types));
  elsif k = 'type_ess' then
    return exists (select 1 from player_cards pc join cards c on c.id = pc.card_id
      where pc.user_id = p_uid and pc.quantity + pc.foil_quantity > 0
        and c.card_type = a and b = any(c.essence_types));
  elsif k = 'foil_min' then
    return exists (select 1 from player_cards pc join cards c on c.id = pc.card_id
      where pc.user_id = p_uid and pc.foil_quantity > 0
        and card_sell_price(c.rarity) >= card_sell_price(a));
  elsif k = 'slab_min' then
    return exists (select 1 from graded_cards g
      where g.user_id = p_uid and g.grade is not null and g.grade >= a::numeric);
  elsif k = 'uniq_ess' then
    return (select count(*) from player_cards pc join cards c on c.id = pc.card_id
      where pc.user_id = p_uid and pc.quantity + pc.foil_quantity > 0
        and b = any(c.essence_types)) >= n;
  elsif k = 'uniq_rar' then
    return (select count(*) from player_cards pc join cards c on c.id = pc.card_id
      where pc.user_id = p_uid and pc.quantity + pc.foil_quantity > 0 and c.rarity = a) >= n;
  elsif k = 'playset' then
    return exists (select 1 from player_cards pc join cards c on c.id = pc.card_id
      where pc.user_id = p_uid and pc.quantity + pc.foil_quantity >= 4 and c.rarity = a);
  end if;
  return false;
end;
$$;

-- 24 distinct goals plus a free centre. Mixed difficulty: most cells are
-- reachable from ordinary packs; a few (high slabs, Ultra-Rare + essence,
-- foil Super-Rare) are the stretch that makes the blackout earned.
create or replace function public.bingo_generate()
returns jsonb language plpgsql volatile set search_path to 'public' as $$
declare
  ess text[] := array['Ember','Tide','Root','Gale','Light','Shadow','Void'];
  types text[] := array['Unit','Item','Event','Location'];
  pool jsonb := '[]'::jsonb;
  e text; t text;
  out jsonb := '[]'::jsonb;
  picked jsonb;
begin
  foreach e in array ess loop
    pool := pool
      || jsonb_build_object('kind','rar_ess','a','Rare','b',e,'label','Own a Rare '||e||' card')
      || jsonb_build_object('kind','rar_ess','a','Uncommon','b',e,'label','Own an Uncommon '||e||' card')
      || jsonb_build_object('kind','rar_ess','a','Super-Rare','b',e,'label','Own a Super-Rare '||e||' card')
      || jsonb_build_object('kind','uniq_ess','b',e,'n',8,'label','Own 8 different '||e||' cards')
      || jsonb_build_object('kind','uniq_ess','b',e,'n',15,'label','Own 15 different '||e||' cards');
    foreach t in array types loop
      pool := pool || jsonb_build_object('kind','type_ess','a',t,'b',e,
        'label','Own a '||e||' '||t);
    end loop;
  end loop;
  pool := pool
    || jsonb_build_object('kind','rar_ess','a','Ultra-Rare','b',ess[1 + floor(random()*7)::int],'label',null)
    || jsonb_build_object('kind','foil_min','a','Rare','label','Own a foil Rare or better')
    || jsonb_build_object('kind','foil_min','a','Super-Rare','label','Own a foil Super-Rare or better')
    || jsonb_build_object('kind','foil_min','a','Uncommon','label','Own a foil Uncommon or better')
    || jsonb_build_object('kind','slab_min','a','7','label','Own a slab graded 7+')
    || jsonb_build_object('kind','slab_min','a','8.5','label','Own a slab graded 8.5+')
    || jsonb_build_object('kind','slab_min','a','9.5','label','Own a slab graded 9.5+')
    || jsonb_build_object('kind','uniq_rar','a','Rare','n',10,'label','Own 10 different Rares')
    || jsonb_build_object('kind','uniq_rar','a','Super-Rare','n',3,'label','Own 3 different Super-Rares')
    || jsonb_build_object('kind','playset','a','Uncommon','label','Own 4 copies of one Uncommon')
    || jsonb_build_object('kind','playset','a','Rare','label','Own 4 copies of one Rare');

  -- The Ultra-Rare cell's label names its rolled essence.
  pool := (select jsonb_agg(case when x->>'label' is null
            then x || jsonb_build_object('label','Own an Ultra-Rare '||(x->>'b')||' card') else x end)
           from jsonb_array_elements(pool) x);

  -- 24 random goals, with the free cell spliced in at the centre (index 12).
  for picked in select x from jsonb_array_elements(pool) x order by random() limit 24 loop
    if jsonb_array_length(out) = 12 then
      out := out || jsonb_build_array(jsonb_build_object('kind','free','label','FREE'));
    end if;
    out := out || jsonb_build_array(picked);
  end loop;
  return out;
end;
$$;

create or replace function public.bingo_lines()
returns int[][] language sql immutable set search_path to 'public' as $$
  select array[
    array[0,1,2,3,4], array[5,6,7,8,9], array[10,11,12,13,14], array[15,16,17,18,19], array[20,21,22,23,24],
    array[0,5,10,15,20], array[1,6,11,16,21], array[2,7,12,17,22], array[3,8,13,18,23], array[4,9,14,19,24],
    array[0,6,12,18,24], array[4,8,12,16,20]
  ];
$$;

create or replace function public.get_bingo()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_week date := bingo_week_start();
  v_card bingo_cards%rowtype;
  v_done boolean[] := '{}';
  v_lines int[] := '{}';
  v_all boolean := true;
  i int; l int;
  ln int[][] := bingo_lines();
  ok boolean;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  insert into bingo_cards (user_id, week_start, cells)
    values (v_uid, v_week, bingo_generate())
    on conflict (user_id, week_start) do nothing;
  select * into v_card from bingo_cards where user_id = v_uid and week_start = v_week;
  for i in 0..24 loop
    v_done := v_done || bingo_cell_done(v_uid, v_card.cells->i);
    if not v_done[i + 1] then v_all := false; end if;
  end loop;
  for l in 1..12 loop
    ok := true;
    for i in 1..5 loop
      if not v_done[ln[l][i] + 1] then ok := false; end if;
    end loop;
    if ok then v_lines := v_lines || (l - 1); end if;
  end loop;
  return jsonb_build_object(
    'week_start', v_week,
    'resets_at', (v_week + 7)::timestamp at time zone 'utc',
    'cells', v_card.cells,
    'done', to_jsonb(v_done),
    'lines', to_jsonb(v_lines),
    'claimed', to_jsonb(v_card.claimed),
    'blackout', v_all,
    'blackout_claimed', v_card.blackout_claimed,
    'line_reward', 120, 'blackout_reward', 750, 'blackout_vouchers', 5
  );
end;
$$;

-- p_line 0..11 claims a line; 12 claims the blackout.
create or replace function public.claim_bingo(p_line int)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid := auth.uid();
  v_week date := bingo_week_start();
  v_card bingo_cards%rowtype;
  ln int[][] := bingo_lines();
  i int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
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
$$;

revoke execute on function public.bingo_cell_done(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.bingo_generate() from public, anon, authenticated;
revoke execute on function public.get_bingo() from public, anon;
revoke execute on function public.claim_bingo(int) from public, anon;
grant execute on function public.get_bingo() to authenticated;
grant execute on function public.claim_bingo(int) to authenticated;

insert into missions (id, name, description, stat_key, target, reward_credits, reward_vouchers, reward_bp_xp, cadence) values
  ('w_bingo_2', 'Two in a Row', 'Claim 2 bingo lines this week', 'bingo_lines', 2, 200, 0, 150, 'weekly')
on conflict (id) do nothing;
insert into achievements (id, name, description, category, stat_key, target, reward_credits, reward_vouchers, sort) values
  ('bingo_1',        'Bingo!',          'Claim your first bingo line',   'collection', 'bingo_lines',     1,  100, 0, 440),
  ('bingo_25',       'Card Shark',      'Claim 25 bingo lines',          'collection', 'bingo_lines',    25, 1000, 5, 441),
  ('blackout_1',     'Blackout',        'Fill an entire bingo card',     'collection', 'bingo_blackouts', 1, 1000, 10, 442)
on conflict (id) do nothing;
