-- Second-pass audit (2026-10-14), the additive backend fixes. Idempotent:
-- every statement can be re-run. Destructive follow-ups (revokes) are in
-- 20261014000390_pending_audit2_revokes.sql for the SQL editor.
--
--  1. Seasons (audit 4.4 / 5.1 / 6.2): Season 2 starts the instant Season 1
--     ends and runs the same length with Season 1's tier/reward structure
--     (the reward pack and cosmetics reused; there is no Season 2 art yet).
--     ensure_next_season() keeps a season row ahead from now on: it flips
--     is_active to the season whose window holds now(), and authors the
--     successor (same length, same tiers) once the active season is within
--     14 days of its end with nothing after it. A cron runs it every 10
--     minutes; season_health() is the check the tests and BACKEND_PENDING
--     point at.
--  2. Colour packs (audit 4.1 / 7.6): a weekly rotation, one colour pack
--     live at a time (is_active + available_until = the end of its ISO week),
--     by rotate_color_packs() on a daily cron (idempotent; it only changes
--     rows on a Monday). The Starter Pack's cdn.midjourney.com art link is
--     cleared (6.8).
--  3. prune_market_listing_cpu() on a daily cron (audit 1.11 / 6.1 / 7.9).
--  4. shop_regulars_own evaluates auth.uid() once per query (7.4 / 6.7).
--  5. Comments on the deny-all (server-only) tables (7.5).
--  6. Pipeline RPC rate limit (7.3): art_pipeline_gate() logs failed tokens
--     and locks every token-protected RPC for 15 minutes after 20 failures.
--     The RPCs return an empty result instead of raising on a bad token, so
--     the failure row commits (a raise would roll it back); they are
--     VOLATILE now, since they write.
--  7. Rewards: daily rotating missions pay at least 120 credits (5.5);
--     collection achievements worth 1,000+ credits move 30% of their credits
--     into a pack (5.2).

-- ---------------------------------------------------------------------------
-- 1. Seasons
-- ---------------------------------------------------------------------------
create or replace function public.ensure_next_season(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_live seasons%rowtype;
  v_cur seasons%rowtype;
  v_new uuid;
  v_created int := 0;
begin
  -- The season whose window holds now() is the active one (latest start wins).
  select * into v_live from seasons
   where starts_at <= p_now and ends_at > p_now
   order by starts_at desc limit 1;
  if found then
    update seasons set is_active = (id = v_live.id)
     where is_active is distinct from (id = v_live.id);
  end if;

  -- The newest season that has started (or the active one) is the one that
  -- needs a successor.
  select * into v_cur from seasons
   where starts_at <= p_now
   order by starts_at desc limit 1;
  if not found then
    return jsonb_build_object('active', null, 'created', 0);
  end if;
  if v_cur.ends_at < p_now + interval '14 days'
     and not exists (select 1 from seasons where starts_at >= v_cur.ends_at) then
    insert into seasons (number, name, is_active, is_free, starts_at, ends_at)
    values (
      v_cur.number + 1,
      'Season ' || (v_cur.number + 1),
      false,
      v_cur.is_free,
      v_cur.ends_at,
      v_cur.ends_at + (v_cur.ends_at - v_cur.starts_at)
    )
    on conflict (number) do nothing
    returning id into v_new;
    if v_new is not null then
      insert into battle_pass_tiers (season_id, tier, reward_type, amount, pack_type_id, shop_item_id, label)
      select v_new, tier, reward_type, amount, pack_type_id, shop_item_id, label
        from battle_pass_tiers where season_id = v_cur.id
      on conflict (season_id, tier) do nothing;
      v_created := 1;
    end if;
  end if;
  return jsonb_build_object('active', v_live.id, 'created', v_created);
end $$;

revoke all on function public.ensure_next_season(timestamptz) from public, anon, authenticated;

-- Healthy when a season is live now and, if it ends within 14 days, its
-- successor (with tiers) already exists.
create or replace function public.season_health(p_now timestamptz default now())
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with live as (
    select * from seasons where is_active and starts_at <= p_now and ends_at > p_now
    order by starts_at desc limit 1
  ), nxt as (
    select s.* from seasons s, live
     where s.starts_at >= live.ends_at order by s.starts_at limit 1
  )
  select jsonb_build_object(
    'ok', exists (select 1 from live)
          and ((select ends_at from live) >= p_now + interval '14 days'
               or exists (select 1 from nxt
                           where exists (select 1 from battle_pass_tiers t where t.season_id = nxt.id))),
    'active_ends_at', (select ends_at from live),
    'next_starts_at', (select starts_at from nxt)
  );
$$;

revoke all on function public.season_health(timestamptz) from public, anon, authenticated;

-- Season 2, authored now (Season 1 ends 2026-11-10, 27 days out): starts the
-- moment Season 1 ends, same length, Season 1's tiers.
do $$
declare v_s1 seasons%rowtype; v_s2 uuid;
begin
  select * into v_s1 from seasons where number = 1;
  if not found then return; end if;
  insert into seasons (number, name, is_active, is_free, starts_at, ends_at)
  values (2, 'Season 2 — Red Tide', false, v_s1.is_free, v_s1.ends_at,
          v_s1.ends_at + (v_s1.ends_at - v_s1.starts_at))
  on conflict (number) do nothing;
  select id into v_s2 from seasons where number = 2;
  insert into battle_pass_tiers (season_id, tier, reward_type, amount, pack_type_id, shop_item_id, label)
  select v_s2, tier, reward_type, amount, pack_type_id, shop_item_id, label
    from battle_pass_tiers where season_id = v_s1.id
  on conflict (season_id, tier) do nothing;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Colour pack weekly rotation
-- ---------------------------------------------------------------------------
create or replace function public.rotate_color_packs(p_now timestamptz default now())
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week timestamptz := date_trunc('week', p_now at time zone 'UTC') at time zone 'UTC';
  v_ids uuid[];
  v_pick uuid;
begin
  select array_agg(id order by pack_group, name) into v_ids
    from pack_types
   where pack_group like 'color\_%' and acquisition = 'purchase';
  if v_ids is null then return null; end if;
  -- ISO weeks since the epoch's first Monday (1970-01-05), round-robin.
  v_pick := v_ids[1 + (floor(extract(epoch from v_week - timestamptz '1970-01-05 00:00+00') / 604800)::bigint
                       % array_length(v_ids, 1))::int];
  update pack_types
     set is_active = (id = v_pick),
         time_limited = true,
         available_until = case when id = v_pick then v_week + interval '7 days' else available_until end
   where id = any (v_ids)
     and (is_active is distinct from (id = v_pick)
          or (id = v_pick and available_until is distinct from v_week + interval '7 days')
          or time_limited is distinct from true);
  return v_pick;
end $$;

revoke all on function public.rotate_color_packs(timestamptz) from public, anon, authenticated;

select public.rotate_color_packs();

-- 6.8: an external, unstable art host on the (inactive) Starter Pack.
update public.pack_types set image_url = null
 where image_url like 'https://cdn.midjourney.com/%';

-- ---------------------------------------------------------------------------
-- Crons (2 + 1 + 3). Skipped where pg_cron is absent (local test databases).
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    perform cron.schedule('ensure-next-season', '*/10 * * * *', 'select public.ensure_next_season()');
    perform cron.schedule('rotate-color-packs', '2 0 * * *', 'select public.rotate_color_packs()');
    if exists (select 1 from pg_proc where proname = 'prune_market_listing_cpu') then
      perform cron.schedule('prune-market-cpu', '41 3 * * *', 'select public.prune_market_listing_cpu()');
    end if;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. RLS initplan
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_policy where polname = 'shop_regulars_own') then
    alter policy shop_regulars_own on public.shop_regulars using (owner = (select auth.uid()));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Deny-all tables, documented
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['art_pipeline_secret', 'match_tickets', 'stat_once', 'match_receipts', 'market_listing_cpu'] loop
    if to_regclass('public.' || t) is not null then
      execute format(
        'comment on table public.%I is %L', t,
        'Server-only: RLS on with no policies (deny-all) on purpose; read and written only by SECURITY DEFINER functions.');
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 6. Pipeline token rate limit
-- ---------------------------------------------------------------------------
create table if not exists public.art_pipeline_attempts (
  id bigserial primary key,
  at timestamptz not null default now()
);
alter table public.art_pipeline_attempts enable row level security;
revoke all on table public.art_pipeline_attempts from anon, authenticated;
comment on table public.art_pipeline_attempts is
  'Server-only: failed art-pipeline token attempts (rate limit). RLS on with no policies (deny-all) on purpose.';
create index if not exists art_pipeline_attempts_at_idx on public.art_pipeline_attempts (at);

-- True for a good token while not locked out. A bad token is logged; 20 bad
-- tokens in 15 minutes lock every pipeline RPC (even a good token) until the
-- window passes, so the token cannot be brute-forced online.
create or replace function public.art_pipeline_gate(p_token text)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if (select count(*) from art_pipeline_attempts where at > now() - interval '15 minutes') >= 20 then
    return false;
  end if;
  if p_token is null or char_length(p_token) < 24 or not exists (
    select 1 from art_pipeline_secret
     where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    -- Old rows are pruned by a cron in the pending file (20261014000390).
    insert into art_pipeline_attempts default values;
    return false;
  end if;
  return true;
end $$;

revoke all on function public.art_pipeline_gate(text) from public, anon, authenticated;

-- Kept for any caller that wants the raising form (a raise rolls the logged
-- attempt back, so the RPCs below use the gate directly).
create or replace function public.art_pipeline_check(p_token text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not art_pipeline_gate(p_token) then
    raise exception 'art pipeline: bad token or rate limited';
  end if;
end $$;

create or replace function public.art_pipeline_jobs(p_token text, p_limit integer default 25)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not art_pipeline_gate(p_token) then
    return jsonb_build_object('pending', '[]'::jsonb, 'published', '[]'::jsonb,
                              'error', 'bad token or rate limited');
  end if;
  return jsonb_build_object(
    'pending', coalesce((
      select jsonb_agg(j order by j->>'reviewed_at') from (
        select jsonb_build_object(
          'submission_id', s.id, 'card_id', s.approved_card_id,
          'source_url', coalesce(c.image_url, s.image_url),
          'art_path', s.art_path,
          'treatment', s.requested_treatment, 'reviewed_at', s.reviewed_at) j
          from card_submissions s join cards c on c.id = s.approved_card_id
         where s.status = 'approved' and s.art_status = 'pending'
         order by s.reviewed_at
         limit greatest(1, least(coalesce(p_limit, 25), 100))
      ) q), '[]'::jsonb),
    'published', coalesce((
      select jsonb_agg(jsonb_build_object('card_id', s.approved_card_id, 'art_url', s.art_url, 'source_url', s.image_url))
        from card_submissions s
       where s.status = 'approved' and s.art_status = 'published' and s.art_url is not null), '[]'::jsonb)
  );
end $$;

create or replace function public.art_pipeline_report(p_token text, p_results jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_sub card_submissions%rowtype;
  v_url text;
  v_n int := 0;
begin
  if not art_pipeline_gate(p_token) then return -1; end if;
  if jsonb_typeof(p_results) <> 'array' then raise exception 'p_results must be an array'; end if;
  for r in select * from jsonb_array_elements(p_results) loop
    select * into v_sub from card_submissions
     where id = (r->>'submission_id')::uuid and status = 'approved' and art_status = 'pending'
     for update;
    if not found then continue; end if;
    if coalesce((r->>'ok')::boolean, false) then
      v_url := btrim(coalesce(r->>'art_url', ''));
      if v_url !~* '^https://[^[:space:]]+$' then
        raise exception 'art_url must be an https:// link';
      end if;
      update cards set image_url = v_url,
             template = jsonb_set(template, '{image}', to_jsonb(v_url)),
             updated_at = now()
       where id = v_sub.approved_card_id;
      update card_submissions set art_status = 'published', art_url = v_url, art_error = null,
             art_updated_at = now()
       where id = v_sub.id;
    else
      update card_submissions set art_status = 'failed',
             art_error = left(coalesce(r->>'error', 'unknown error'), 500), art_updated_at = now()
       where id = v_sub.id;
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

create or replace function public.cosmetics_mirror_jobs(p_token text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not art_pipeline_gate(p_token) then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', id, 'image_url', image_url) order by id)
      from shop_items
     where image_url is not null and btrim(image_url) <> ''), '[]'::jsonb);
end $$;

create or replace function public.cosmetics_mirror_report(p_token text, p_results jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r jsonb;
  v_url text;
  v_n int := 0;
begin
  if not art_pipeline_gate(p_token) then return -1; end if;
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
end $$;

create or replace function public.submission_art_sign_jobs(p_token text)
returns text[]
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if not art_pipeline_gate(p_token) then return '{}'; end if;
  return coalesce((select array_agg(art_path order by reviewed_at) from card_submissions
                    where status = 'approved' and art_status = 'pending'
                      and art_path is not null and art_removed_at is null), '{}');
end $$;

create or replace function public.submission_art_cleanup_jobs(p_token text)
returns text[]
language plpgsql
volatile
security definer
set search_path = public, storage
as $$
begin
  if not art_pipeline_gate(p_token) then return '{}'; end if;
  return coalesce((select array_agg(p) from (
    select art_path p from public.card_submissions
     where art_path is not null and art_removed_at is null and art_removable_at <= now()
    union
    select o.name from storage.objects o
     where o.bucket_id = 'submission-art' and o.created_at < now() - interval '2 days'
       and not exists (select 1 from public.card_submissions s where s.art_path = o.name)
    limit 100) q), '{}');
end $$;

create or replace function public.submission_art_mark_removed(p_token text, p_paths text[])
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare v_n int;
begin
  if not art_pipeline_gate(p_token) then return -1; end if;
  update card_submissions set art_removed_at = now()
   where art_path = any(coalesce(p_paths, '{}')) and art_removed_at is null
     and art_removable_at <= now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- ---------------------------------------------------------------------------
-- 7. Rewards
-- ---------------------------------------------------------------------------
-- 5.5: dailies were ~80 credits against ~400 for a weekly.
update public.missions set reward_credits = 120
 where cadence = 'daily' and pool = 'rotating' and reward_credits < 120;

-- 5.2: collection achievements held 191,699 credits (~320 packs), front-loaded
-- for whales. Every one worth 1,000+ credits gives 30% of its credits back as
-- a pack instead: a Booster Box from 5,000 credits, else a Booster Pack.
-- reward_pack_id is null is the once-only guard.
do $$
declare v_pack uuid; v_box uuid;
begin
  select id into v_pack from pack_types where name = 'Volume #1 Booster Pack';
  select id into v_box from pack_types where name = 'Volume #1 Booster Box';
  if v_pack is null then return; end if;
  update achievements
     set reward_pack_id = case when reward_credits >= 5000 and v_box is not null then v_box else v_pack end,
         reward_credits = (round(reward_credits * 0.7 / 50) * 50)::int
   where category = 'collection' and reward_credits >= 1000 and reward_pack_id is null;
end $$;
