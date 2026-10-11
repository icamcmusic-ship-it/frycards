-- 2026-10-12 audit 2026-10-11 §5 (b.3, c.2): collection stat emitters, the
-- collection missions and achievements, and the backfill.
--
--   track_collection_stats(uid) computes the absolute own_* keys and
--   unique_cards from player_cards. Two statement-level triggers (insert,
--   update: a transition table allows one event per trigger) run it once per
--   distinct user in the statement, so a Booster Box is one call, not 49. Packs,
--   trades, shop trades, market buys, deck boxes and bounties are all covered
--   with no edits to those RPCs.
--
--   new_cards (+n) counts a card the first time it is ever held, through
--   stat_once 'own:'||card_id. Every card held now is seeded first, so the
--   existing collection pays nothing; selling and re-buying never re-counts.
--
--   track_graded_cards (INSERT) also emits graded_foil, graded_leader and
--   graded_distinct (stat_once 'gradedcard:'||card_id).
--
-- Farm-proofing: own_* are absolute and track_stat keeps the max, so a card
-- moved out and back never re-pays; new_cards and graded_distinct are once per
-- card per account for life; graded_* cost a grading fee. Targets use the
-- non-Leader counts (§a.9): Leaders only come from the sign-up Deck Box
-- (Rare or lower), so Mythic / Ultra-Rare / Full-Art Leaders have no source.
--
-- Idempotent: create or replace, `if not exists`, `on conflict do nothing`,
-- and the backfill only ever raises progress. Nothing destructive.

-------------------------------------------------------------------------------
-- 1. Emitters
-------------------------------------------------------------------------------
create or replace function public.track_collection_stats(p_uid uuid)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare
  v_key text;
  v_val int;
begin
  for v_key, v_val in
    with own as (
      select c.id, c.card_type, c.rarity, coalesce(c.essence_types, '{}'::text[]) ess,
             pc.quantity, pc.foil_quantity
        from player_cards pc join cards c on c.id = pc.card_id
       where pc.user_id = p_uid and pc.quantity + pc.foil_quantity > 0
    ), s as (
      select
        count(*)::int                                                           unique_cards,
        count(*) filter (where card_type = 'Leader')::int                       own_leaders,
        count(*) filter (where card_type <> 'Leader' and rarity = 'Mythic')::int     own_mythic,
        count(*) filter (where card_type <> 'Leader' and rarity = 'Ultra-Rare')::int own_ultra_rare,
        count(*) filter (where card_type <> 'Leader' and rarity = 'Super-Rare')::int own_super_rare,
        count(*) filter (where card_type <> 'Leader' and rarity = 'Full-Art')::int   own_full_art,
        count(*) filter (where card_type = 'Location')::int                     own_locations,
        count(*) filter (where foil_quantity > 0)::int                          own_foil_unique,
        count(*) filter (where quantity + foil_quantity >= 3)::int              own_playsets,
        count(*) filter (where card_type <> 'Leader' and 'Ember'  = any(ess))::int own_ember,
        count(*) filter (where card_type <> 'Leader' and 'Tide'   = any(ess))::int own_tide,
        count(*) filter (where card_type <> 'Leader' and 'Root'   = any(ess))::int own_root,
        count(*) filter (where card_type <> 'Leader' and 'Gale'   = any(ess))::int own_gale,
        count(*) filter (where card_type <> 'Leader' and 'Void'   = any(ess))::int own_void,
        count(*) filter (where card_type <> 'Leader' and 'Light'  = any(ess))::int own_light,
        count(*) filter (where card_type <> 'Leader' and 'Shadow' = any(ess))::int own_shadow
      from own
    )
    select k, v from s, lateral (values
      ('unique_cards', unique_cards), ('own_leaders', own_leaders), ('own_mythic', own_mythic),
      ('own_ultra_rare', own_ultra_rare), ('own_super_rare', own_super_rare),
      ('own_full_art', own_full_art), ('own_locations', own_locations),
      ('own_foil_unique', own_foil_unique), ('own_playsets', own_playsets),
      ('own_ember', own_ember), ('own_tide', own_tide), ('own_root', own_root), ('own_gale', own_gale),
      ('own_void', own_void), ('own_light', own_light), ('own_shadow', own_shadow)) as t(k, v)
  loop
    -- Skip keys with nothing left to raise (cheap: most statements change none).
    if exists (
      select 1 from achievements a
        left join player_achievements pa on pa.achievement_id = a.id and pa.user_id = p_uid
       where a.stat_key = v_key and coalesce(pa.progress, -1) < least(a.target, v_val)
    ) or exists (select 1 from missions m where m.stat_key = v_key) then
      perform track_stat(p_uid, v_key, v_val, true);
    end if;
  end loop;
end;
$function$;
revoke all on function public.track_collection_stats(uuid) from public, anon, authenticated;

create or replace function public.track_collection_stats_stmt()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  v_uid uuid;
  v_new int;
begin
  for v_uid in select distinct user_id from changed_rows where user_id is not null loop
    select count(*) filter (where stat_once_claim(v_uid, 'own:' || card_id))::int into v_new
      from (select distinct card_id from changed_rows
             where user_id = v_uid and quantity + foil_quantity > 0) n;
    if v_new > 0 then perform track_stat(v_uid, 'new_cards', v_new, false); end if;
    perform track_collection_stats(v_uid);
  end loop;
  return null;
end;
$function$;
revoke all on function public.track_collection_stats_stmt() from public, anon, authenticated;

create or replace function public.track_graded_cards()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if tg_op = 'INSERT' then
    perform track_stat(new.user_id, 'cards_graded', 1, false);
    if new.foil then perform track_stat(new.user_id, 'graded_foil', 1, false); end if;
    if (select card_type from cards where id = new.card_id) = 'Leader' then
      perform track_stat(new.user_id, 'graded_leader', 1, false);
    end if;
    if stat_once_claim(new.user_id, 'gradedcard:' || new.card_id) then
      perform track_stat(new.user_id, 'graded_distinct', 1, false);
    end if;
  elsif tg_op = 'UPDATE' and old.grade is null and new.grade is not null then
    if new.grade >= 9 then perform track_stat(new.user_id, 'slabs_mint', 1, false); end if;
    if new.grade >= 10 then perform track_stat(new.user_id, 'gem_mints', 1, false); end if;
  end if;
  return null;
end;
$function$;
revoke all on function public.track_graded_cards() from public, anon, authenticated;

-------------------------------------------------------------------------------
-- 2. Seed the once-ledgers BEFORE the triggers exist, so nothing held or
--    graded today pays new_cards / graded_distinct.
-------------------------------------------------------------------------------
insert into public.stat_once (user_id, key)
select distinct user_id, 'own:' || card_id from public.player_cards
 where quantity + foil_quantity > 0
on conflict do nothing;
insert into public.stat_once (user_id, key)
select distinct user_id, 'gradedcard:' || card_id from public.graded_cards
on conflict do nothing;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'player_cards_collection_stats_ins'
                   and tgrelid = 'public.player_cards'::regclass) then
    create trigger player_cards_collection_stats_ins after insert on public.player_cards
      referencing new table as changed_rows
      for each statement execute function public.track_collection_stats_stmt();
  end if;
  if not exists (select 1 from pg_trigger where tgname = 'player_cards_collection_stats_upd'
                   and tgrelid = 'public.player_cards'::regclass) then
    create trigger player_cards_collection_stats_upd after update on public.player_cards
      referencing new table as changed_rows
      for each statement execute function public.track_collection_stats_stmt();
  end if;
end $$;

-------------------------------------------------------------------------------
-- 3. Rows (rotating pool for the missions; category collection for the rest)
-------------------------------------------------------------------------------
insert into public.missions
  (id, name, description, stat_key, target, reward_credits, reward_vouchers, reward_bp_xp, cadence)
values
  ('d_new_card_1',   'Something New', 'Add a card you have never owned to your collection', 'new_cards',  1,  50, 0, 15, 'daily'),
  ('w_new_cards_10', 'Fresh Pages',   'Add 10 never-owned cards to your collection',        'new_cards', 10, 400, 0, 120, 'weekly')
on conflict (id) do nothing;

-- Per-colour, rarity and Location targets are the live non-Leader counts,
-- computed at insert (multi-colour cards count for each colour). A target of 0
-- (an empty colour on a fresh database) is skipped: the column is > 0.
insert into public.achievements
  (id, name, description, category, stat_key, target, reward_credits, reward_vouchers, reward_pack_id, sort)
select v.id, v.name, v.description, 'collection', v.stat_key, t.n, v.cr, v.vo, null, v.sort
from (values
  ('own_ember_all',  'Ember Complete',  'Own every non-Leader Ember card',  'own_ember',  'Ember',  null, 2000, 10, 600),
  ('own_tide_all',   'Tide Complete',   'Own every non-Leader Tide card',   'own_tide',   'Tide',   null, 2000, 10, 601),
  ('own_root_all',   'Root Complete',   'Own every non-Leader Root card',   'own_root',   'Root',   null, 2000, 10, 602),
  ('own_gale_all',   'Gale Complete',   'Own every non-Leader Gale card',   'own_gale',   'Gale',   null, 2000, 10, 603),
  ('own_void_all',   'Void Complete',   'Own every non-Leader Void card',   'own_void',   'Void',   null, 2000, 10, 604),
  ('own_light_all',  'Light Complete',  'Own every non-Leader Light card',  'own_light',  'Light',  null, 2000, 10, 605),
  ('own_shadow_all', 'Shadow Complete', 'Own every non-Leader Shadow card', 'own_shadow', 'Shadow', null, 2000, 10, 606),
  ('own_mythic_all', 'Mythic Shelf',    'Own every Mythic power card',      'own_mythic',     null, 'Mythic',     5000, 30, 612),
  ('own_fullart_all','Gallery Wall',    'Own every Full-Art power card',    'own_full_art',   null, 'Full-Art',   4000, 25, 613),
  ('own_ultra_all',  'Ultra Set',       'Own every Ultra-Rare power card',  'own_ultra_rare', null, 'Ultra-Rare', 3000, 20, 614),
  ('own_super_all',  'Super Set',       'Own every Super-Rare card',        'own_super_rare', null, 'Super-Rare', 2000, 10, 615)
) as v(id, name, description, stat_key, ess, rar, cr, vo, sort)
cross join lateral (
  select count(*)::int n from public.cards c
   where c.card_type <> 'Leader'
     and (v.ess is null or v.ess = any(c.essence_types))
     and (v.rar is null or c.rarity = v.rar)
) t
where t.n > 0
on conflict (id) do nothing;

insert into public.achievements
  (id, name, description, category, stat_key, target, reward_credits, reward_vouchers, reward_pack_id, sort)
select 'own_locations', 'Cartographer', 'Own every Location', 'collection', 'own_locations', n, 2000, 10, null, 616
  from (select count(*)::int n from public.cards where card_type = 'Location') t
 where n > 0
on conflict (id) do nothing;

insert into public.achievements
  (id, name, description, category, stat_key, target, reward_credits, reward_vouchers, reward_pack_id, sort)
values
  -- 6 = the Leaders a Deck Box can give (Rare or lower). No 9 until the rest have a source.
  ('own_leaders_2',      'Second Opinion',    'Own 2 different Leaders',                     'collection', 'own_leaders',       2, 1000,  5, null, 610),
  ('own_leaders_6',      'Council of Leaders','Own every Leader a Deck Box can give (6)',    'collection', 'own_leaders',       6, 3000, 20, null, 611),
  ('foil_25',            'Shiny Binder',      'Own foils of 25 different cards',             'collection', 'own_foil_unique',  25, 1000,  5, null, 617),
  ('foil_100',           'Prism Collector',   'Own foils of 100 different cards',            'collection', 'own_foil_unique', 100, 5000, 20, null, 618),
  ('playsets_25',        'Full Copies',       'Own 3 or more copies of 25 different cards',  'collection', 'own_playsets',     25, 1500,  5, null, 619),
  ('graded_foil_1',      'Shiny Slab',        'Grade a foil card',                           'collection', 'graded_foil',       1,  500,  2, null, 620),
  ('graded_distinct_25', 'Slab Library',      'Have 25 different cards graded',              'collection', 'graded_distinct',  25, 2000, 10, null, 621),
  ('graded_leader_1',    'Framed Leader',     'Grade a Leader',                              'collection', 'graded_leader',     1,  500,  2, null, 622)
on conflict (id) do nothing;

-------------------------------------------------------------------------------
-- 4. Backfill (absolute; only ever raises progress)
-------------------------------------------------------------------------------
do $$
declare r record;
begin
  for r in select distinct user_id from public.player_cards where user_id is not null loop
    perform public.track_collection_stats(r.user_id);
  end loop;
  for r in
    select g.user_id,
           count(*) filter (where g.foil)::int foil,
           count(*) filter (where c.card_type = 'Leader')::int leader,
           count(distinct g.card_id)::int dist
      from public.graded_cards g left join public.cards c on c.id = g.card_id
     where g.user_id is not null
     group by g.user_id
  loop
    if r.foil > 0 then perform public.track_stat(r.user_id, 'graded_foil', r.foil, true); end if;
    if r.leader > 0 then perform public.track_stat(r.user_id, 'graded_leader', r.leader, true); end if;
    if r.dist > 0 then perform public.track_stat(r.user_id, 'graded_distinct', r.dist, true); end if;
  end loop;
end $$;
