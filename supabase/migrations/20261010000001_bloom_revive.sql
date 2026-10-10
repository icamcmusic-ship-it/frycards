-- Bloom (the new Root revive: a hole card counts one rank higher) joins the
-- revive share poker_box_deck gives every Deck Box deck, matching REVIVES in
-- src/game/poker/deck.ts. Otherwise identical to 20261010000000.

create or replace function public.poker_box_deck(p_seed text, p_granted text[])
returns text[]
language plpgsql
stable
set search_path to 'public'
as $$
declare
  c_powers constant int := 24;
  c_copies constant int := 2;
  c_tier5 constant int := 2;
  c_tier4 constant int := 3;
  c_tier3 constant int := 7;
  c_revives constant int := 4;
  v_revive constant text[] := array['Redraw', 'Windfall', 'Wild', 'Bloom', 'Exhume'];
  v_odd constant text[] := array['Rerun', 'Snuff', 'Call Out'];
  v_location text;
  v_out text[] := '{}';
  v_rec record;
  v_pass int;
  v_n int;
  v_t3 int := 0; v_t4 int := 0; v_t5 int := 0; v_rv int := 0; v_sit int := 0;
begin
  select c.id into v_location
    from unnest(p_granted) as u(id) join cards c on c.id = u.id
    where c.card_type = 'Location'
    order by array_position(array['Mythic','Alt-Art','Ultra-Rare','Full-Art','Super-Rare','Rare','Uncommon','Common'], c.rarity),
             md5(p_seed || c.id)
    limit 1;
  if v_location is null then return null; end if;

  -- Pass 0 seeds the revives, cheapest first; passes 1-2 respect the curve;
  -- pass 3 fills whatever is left (tier-5 and copy limits always hold).
  for v_pass in 0..3 loop
    for v_rec in
      select c.id, coalesce(c.might, 1) as tier, g.n as granted,
             coalesce(string_to_array(c.keywords, ', '), '{}') && v_revive as revive,
             coalesce(string_to_array(c.keywords, ', '), '{}') && v_odd as odd
        from (select id, count(*)::int as n from unnest(p_granted) as id group by id) g
        join cards c on c.id = g.id
        where c.card_type in ('Unit', 'Item', 'Event')
        order by
          case when v_pass = 0 then coalesce(c.might, 1) else 0 end,
          array_position(array['Mythic','Alt-Art','Ultra-Rare','Full-Art','Super-Rare','Rare','Uncommon','Common'], c.rarity),
          md5(p_seed || c.id)
    loop
      exit when coalesce(array_length(v_out, 1), 0) >= c_powers;
      if v_pass = 0 and (not v_rec.revive or v_rv >= c_revives) then continue; end if;
      select count(*) into v_n from unnest(v_out) as x where x = v_rec.id;
      -- One copy per card on the first passes, the second copy later.
      if v_n >= least(case when v_pass <= 1 then 1 else c_copies end, v_rec.granted) then continue; end if;
      if v_rec.tier = 5 and v_t5 >= c_tier5 then continue; end if;
      if v_pass < 3 then
        if v_rec.tier = 4 and v_t4 >= c_tier4 then continue; end if;
        if v_rec.tier = 3 and v_t3 >= c_tier3 then continue; end if;
        if v_rec.revive and v_rv >= c_revives then continue; end if;
        if v_rec.odd and v_sit >= 1 then continue; end if;
      end if;
      v_out := v_out || v_rec.id;
      if v_rec.tier = 3 then v_t3 := v_t3 + 1; end if;
      if v_rec.tier = 4 then v_t4 := v_t4 + 1; end if;
      if v_rec.tier = 5 then v_t5 := v_t5 + 1; end if;
      if v_rec.revive then v_rv := v_rv + 1; end if;
      if v_rec.odd then v_sit := v_sit + 1; end if;
    end loop;
  end loop;
  if coalesce(array_length(v_out, 1), 0) < c_powers then return null; end if;
  return v_location || v_out;
end $$;
