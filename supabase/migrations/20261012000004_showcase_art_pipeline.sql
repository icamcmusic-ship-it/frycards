-- 2026-10-12 Showcase art pipeline: approved player cards move their art to
-- Cloudflare Pages automatically (docs/CARD_SUBMISSIONS.md).
--
-- Approval already minted a playable `cards` row in one RPC. What it never did
-- was move the art: the card kept pointing at whatever https link the player
-- pasted (a generator CDN that can expire or hotlink-block). This adds:
--
--  * card_submissions.art_status/art_url/art_error/art_updated_at — the
--    pipeline state the Creator screen shows: approved -> pending -> published
--    (or failed, with a retry button).
--  * creator_review_submission: identical, except an approval queues the art
--    (art_status = 'pending'). Still exactly one RPC per approval.
--  * art_pipeline_jobs / art_pipeline_report: the two calls the scheduled
--    GitHub Action makes per run, authenticated by a shared token whose
--    SHA-256 lives in art_pipeline_secret (no service-role key in CI). An idle
--    run costs one tiny query. The report rewrites cards.image_url AND
--    template.image, so get_catalog_version changes and every client picks
--    the new URL up through versionedFetch.
--  * creator_retry_submission_art: failed -> pending.
--  * get_card_submissions_v2: the review queue with the pipeline columns
--    (v1's RETURNS TABLE cannot grow columns in place; v1 is retired in
--    the pending-destructive file once no client calls it).
--
-- Idempotent and non-destructive.

alter table public.card_submissions add column if not exists art_status text;
alter table public.card_submissions add column if not exists art_url text;
alter table public.card_submissions add column if not exists art_error text;
alter table public.card_submissions add column if not exists art_updated_at timestamptz;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'card_submissions_art_status_check') then
    alter table public.card_submissions add constraint card_submissions_art_status_check
      check (art_status is null or art_status in ('pending', 'published', 'failed'));
  end if;
end $$;

create index if not exists card_submissions_art_pending_idx
  on public.card_submissions (reviewed_at) where art_status = 'pending';

-- One row: the SHA-256 (hex) of the token the Action sends. Nobody but the
-- SECURITY DEFINER functions below can read it.
create table if not exists public.art_pipeline_secret (
  id int primary key default 1 check (id = 1),
  token_hash text not null
);
alter table public.art_pipeline_secret enable row level security;
revoke all on public.art_pipeline_secret from anon, authenticated;

create or replace function public.art_pipeline_check(p_token text)
returns void language plpgsql stable security definer set search_path to 'public' as $function$
begin
  if p_token is null or char_length(p_token) < 24 or not exists (
    select 1 from art_pipeline_secret
     where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex')
  ) then
    raise exception 'art pipeline: bad token';
  end if;
end $function$;
revoke all on function public.art_pipeline_check(text) from public, anon, authenticated;

-- The Creator sets (or rotates) the token from the SQL editor or the app.
create or replace function public.creator_set_art_pipeline_token(p_token text)
returns void language plpgsql security definer set search_path to 'public' as $function$
begin
  perform assert_creator();
  if p_token is null or char_length(p_token) < 24 then
    raise exception 'Use a token of at least 24 characters.';
  end if;
  insert into art_pipeline_secret (id, token_hash)
    values (1, encode(sha256(convert_to(p_token, 'UTF8')), 'hex'))
  on conflict (id) do update set token_hash = excluded.token_hash;
end $function$;
revoke all on function public.creator_set_art_pipeline_token(text) from public, anon;
grant execute on function public.creator_set_art_pipeline_token(text) to authenticated;

create or replace function public.creator_review_submission(
  p_id uuid, p_action text, p_note text default null, p_card_id text default null,
  p_rarity text default null, p_name text default null, p_type text default null,
  p_flavor text default null, p_image_url text default null, p_mechanics jsonb default null,
  p_overrides jsonb default null)
returns card_submissions language plpgsql security definer set search_path to 'public' as $function$
declare
  v_sub card_submissions%rowtype;
  v_card_id text;
  v_rarity text;
begin
  perform assert_creator();
  select * into v_sub from card_submissions where id = p_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if v_sub.status <> 'pending' then
    raise exception 'That submission was already %.', v_sub.status;
  end if;

  if p_action = 'approve' then
    v_card_id := btrim(coalesce(p_card_id, ''));
    v_rarity := btrim(coalesce(p_rarity, ''));
    if v_rarity = '' then raise exception 'Pick a rarity before approving.'; end if;

    if v_rarity = 'Full-Art' and exists (
      select 1 from card_submissions
       where submitter = v_sub.submitter and set_name = v_sub.set_name
         and status = 'approved' and approved_rarity = 'Full-Art' and id <> p_id
    ) then
      raise exception 'That player already has a Full-Art card in %.', v_sub.set_name;
    end if;
    if v_rarity = 'Mythic' and exists (
      select 1 from card_submissions
       where submitter = v_sub.submitter and set_name = v_sub.set_name
         and status = 'approved' and approved_rarity = 'Mythic' and id <> p_id
    ) then
      raise exception 'That player already has a Mythic card in %.', v_sub.set_name;
    end if;

    perform apply_card_upsert(jsonb_build_object(
      'id', v_card_id,
      'name', coalesce(nullif(btrim(coalesce(p_name, '')), ''), v_sub.card_name),
      'card_type', coalesce(nullif(btrim(coalesce(p_type, '')), ''), v_sub.card_type),
      'rarity', v_rarity,
      'set_name', v_sub.set_name,
      'flavor_text', coalesce(nullif(btrim(coalesce(p_flavor, '')), ''), v_sub.flavor_text),
      'image_url', coalesce(nullif(btrim(coalesce(p_image_url, '')), ''), v_sub.image_url),
      'mechanics', coalesce(p_mechanics, '{}'::jsonb),
      'overrides', p_overrides
    ), false);

    update card_submissions set
      status = 'approved', approved_card_id = v_card_id, approved_rarity = v_rarity,
      review_note = nullif(btrim(coalesce(p_note, '')), ''),
      reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now(),
      art_status = 'pending', art_url = null, art_error = null, art_updated_at = now()
    where id = p_id returning * into v_sub;

  elsif p_action in ('deny', 'deny_ban') then
    update card_submissions set
      status = 'denied', review_note = nullif(btrim(coalesce(p_note, '')), ''),
      reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
    where id = p_id returning * into v_sub;

    if p_action = 'deny_ban' then
      update profiles set
        submissions_banned = true,
        submissions_ban_reason = nullif(btrim(coalesce(p_note, '')), ''),
        updated_at = now()
      where id = v_sub.submitter;
      update card_submissions set
        status = 'denied', review_note = 'Account banned from submissions.',
        reviewed_by = auth.uid(), reviewed_at = now(), updated_at = now()
      where submitter = v_sub.submitter and status = 'pending';
    end if;
  else
    raise exception 'Unknown action "%" (expected approve, deny or deny_ban).', p_action;
  end if;

  return v_sub;
end $function$;

-- What the Action needs in one call: the queue, plus every already-published
-- key so it can rebuild the full Pages deployment (a Pages deploy replaces the
-- whole site, so it must re-list the old files alongside the new ones).
create or replace function public.art_pipeline_jobs(p_token text, p_limit int default 25)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
begin
  perform art_pipeline_check(p_token);
  return jsonb_build_object(
    'pending', coalesce((
      select jsonb_agg(j order by j->>'reviewed_at') from (
        select jsonb_build_object(
          'submission_id', s.id, 'card_id', s.approved_card_id,
          'source_url', coalesce(c.image_url, s.image_url),
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
end $function$;
revoke all on function public.art_pipeline_jobs(text, int) from public;
grant execute on function public.art_pipeline_jobs(text, int) to anon, authenticated;

-- p_results: [{submission_id, ok, art_url?, error?}]. One call per run.
create or replace function public.art_pipeline_report(p_token text, p_results jsonb)
returns int language plpgsql security definer set search_path to 'public' as $function$
declare
  r jsonb;
  v_sub card_submissions%rowtype;
  v_url text;
  v_n int := 0;
begin
  perform art_pipeline_check(p_token);
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
end $function$;
revoke all on function public.art_pipeline_report(text, jsonb) from public;
grant execute on function public.art_pipeline_report(text, jsonb) to anon, authenticated;

create or replace function public.creator_retry_submission_art(p_id uuid)
returns card_submissions language plpgsql security definer set search_path to 'public' as $function$
declare v_sub card_submissions%rowtype;
begin
  perform assert_creator();
  update card_submissions set art_status = 'pending', art_error = null, art_updated_at = now()
   where id = p_id and status = 'approved' and art_status in ('failed', 'pending')
  returning * into v_sub;
  if not found then raise exception 'Only an approved card whose art failed can be retried.'; end if;
  return v_sub;
end $function$;
revoke all on function public.creator_retry_submission_art(uuid) from public, anon;
grant execute on function public.creator_retry_submission_art(uuid) to authenticated;

create or replace function public.get_card_submissions_v2(p_status text default null, p_limit int default 200)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
begin
  perform assert_creator();
  return coalesce((
    select jsonb_agg(to_jsonb(q) order by q.ord, q.created_at) from (
      select s.id, s.submitter, p.username as submitter_username,
             coalesce(p.submissions_banned, false) as submitter_banned,
             s.set_name, s.card_name, s.card_type, s.flavor_text, s.image_url,
             s.requested_treatment, s.status, s.review_note, s.approved_card_id,
             s.approved_rarity, s.created_at, s.reviewed_at,
             s.art_status, s.art_url, s.art_error, s.art_updated_at,
             case when s.status = 'pending' then 0 else 1 end as ord
        from card_submissions s
        left join profiles p on p.id = s.submitter
       where p_status is null or s.status = p_status
       order by case when s.status = 'pending' then 0 else 1 end, s.created_at
       limit greatest(1, least(coalesce(p_limit, 200), 1000))
    ) q), '[]'::jsonb);
end $function$;
revoke all on function public.get_card_submissions_v2(text, int) from public, anon;
grant execute on function public.get_card_submissions_v2(text, int) to authenticated;
