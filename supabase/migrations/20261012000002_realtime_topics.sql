-- 2026-10-12 audit 2026-10-11 §7 S7: server-side change feeds for the
-- secondary screens, so they can leave unfiltered postgres_changes.
--
--   trades, friendships   one `changed` broadcast per statement to each party's
--                         private topic user:<uid> (the S1 channel; RLS
--                         already limits it to its owner). Payload {table}.
--   market_listings       one `changed` broadcast per statement to the PUBLIC
--   player_shops,         topic `market`, `shops` or `news`. The payload is
--   shop_listings,        only {table}: no row data, so a public topic leaks
--   news_posts,           nothing. Screens refetch (debounced) on a message.
--   serialized_supply
--
-- The tables stay in the supabase_realtime publication until the screens
-- switch (see 20261012000091_after_client_realtime.sql), so current clients
-- keep working. Idempotent; additive only.

create or replace function public.notify_topic_change()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  begin
    perform realtime.send(jsonb_build_object('table', TG_TABLE_NAME), 'changed', TG_ARGV[0], false);
  exception when others then
    -- Never let a notification failure roll back the write itself.
    null;
  end;
  return null;
end;
$function$;
revoke all on function public.notify_topic_change() from public, anon, authenticated;

do $$
declare
  t record;
  ev text;
begin
  -- Per-party private broadcasts (reuses notify_user_change from 20261011000004).
  for t in select * from (values
      ('trades', 'proposer'), ('trades', 'recipient'),
      ('friendships', 'requester'), ('friendships', 'addressee')) v(tbl, col)
  loop
    if to_regclass('public.' || t.tbl) is null then continue; end if;
    foreach ev in array array['ins', 'upd'] loop
      if not exists (select 1 from pg_trigger
                      where tgname = t.tbl || '_notify_' || ev || '_' || t.col
                        and tgrelid = ('public.' || t.tbl)::regclass) then
        execute format('create trigger %I after %s on public.%I referencing new table as changed_rows '
                       'for each statement execute function public.notify_user_change(%L)',
                       t.tbl || '_notify_' || ev || '_' || t.col,
                       case ev when 'ins' then 'insert' else 'update' end, t.tbl, t.col);
      end if;
    end loop;
  end loop;

  -- Public per-screen topics: one message per insert / update statement (row
  -- removals: 20261012000091, it needs the confirmation-gated keyword).
  for t in select * from (values
      ('market_listings', 'market'), ('player_shops', 'shops'), ('shop_listings', 'shops'),
      ('news_posts', 'news'), ('serialized_supply', 'news')) v(tbl, topic)
  loop
    if to_regclass('public.' || t.tbl) is null then continue; end if;
    if not exists (select 1 from pg_trigger where tgname = t.tbl || '_notify_topic'
                     and tgrelid = ('public.' || t.tbl)::regclass) then
      execute format('create trigger %I after insert or update on public.%I '
                     'for each statement execute function public.notify_topic_change(%L)',
                     t.tbl || '_notify_topic', t.tbl, t.topic);
    end if;
  end loop;
end $$;
