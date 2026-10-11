-- 2026-10-13: players upload the art file for a card submission instead of
-- only pasting a link (docs/CARD_SUBMISSIONS.md, "Uploaded art").
--
--  * Private Storage bucket `submission-art`: 8 MB, png / jpeg / webp, plus
--    mp4 / webm for the video Mythic treatment (submit_card already allows
--    video only for video_mythic). The client uploads straight to Storage.
--  * RLS on storage.objects: an uploader may INSERT only `<own uid>/<file>`,
--    while not banned and with fewer than 3 pending uploads (uploads not yet
--    attached to a reviewed submission). Only the Creator may SELECT (review
--    screen signed URLs). Nobody gets UPDATE or DELETE through RLS.
--  * card_submissions.art_path + submit_card_art(): a submission whose art is
--    an uploaded object. image_url holds a never-resolving placeholder
--    (https://submission-art.invalid/<path>) because the column is NOT NULL
--    and submit_card's validation is reused as is; the art pipeline replaces
--    the card's image with the Cloudflare URL after approval.
--  * art_pipeline_jobs also returns each pending job's art_path; the
--    `submission-art` Edge Function signs those (and only those) for the
--    workflow after checking the token through submission_art_sign_jobs.
--  * Cleanup: a trigger marks an upload removable once its art is published,
--    or 30 days after the submission is denied / withdrawn; orphans (never
--    attached) are removable after 2 days. submission_art_cleanup_jobs lists
--    them and submission_art_mark_removed records the removal. The objects
--    themselves are deleted by the Edge Function through the Storage API —
--    Storage blocks plain SQL deletes on storage.objects (protect_delete),
--    and this keeps every DELETE out of migrations.
--
-- Idempotent; no DROP or DELETE.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('submission-art', 'submission-art', false, 8388608,
        array['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

alter table public.card_submissions add column if not exists art_path text;
alter table public.card_submissions add column if not exists art_removable_at timestamptz;
alter table public.card_submissions add column if not exists art_removed_at timestamptz;
create unique index if not exists card_submissions_art_path_key
  on public.card_submissions (art_path) where art_path is not null;
create index if not exists card_submissions_art_removable_idx
  on public.card_submissions (art_removable_at)
  where art_path is not null and art_removed_at is null;

-- Uploads by this user not yet attached to a reviewed submission.
create or replace function public.submission_art_pending_uploads(p_uid uuid)
returns int language sql stable security definer set search_path = public, storage as $$
  select count(*)::int from storage.objects o
   where o.bucket_id = 'submission-art'
     and (storage.foldername(o.name))[1] = p_uid::text
     and not exists (select 1 from public.card_submissions s
                      where s.art_path = o.name and s.status <> 'pending');
$$;
revoke all on function public.submission_art_pending_uploads(uuid) from public, anon;
grant execute on function public.submission_art_pending_uploads(uuid) to authenticated;

create or replace function public.submission_art_can_upload()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and not coalesce((select submissions_banned from profiles where id = auth.uid()), false)
     and public.submission_art_pending_uploads(auth.uid()) < 3;
$$;
revoke all on function public.submission_art_can_upload() from public, anon;
grant execute on function public.submission_art_can_upload() to authenticated;

create or replace function public.submission_art_is_creator()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'creator');
$$;
revoke all on function public.submission_art_is_creator() from public, anon;
grant execute on function public.submission_art_is_creator() to authenticated;

do $$ begin
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'submission-art: upload to own folder') then
    create policy "submission-art: upload to own folder" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'submission-art'
        and (storage.foldername(name))[1] = auth.uid()::text
        and coalesce(array_length(storage.foldername(name), 1), 0) = 1
        and public.submission_art_can_upload()
      );
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects'
                  and policyname = 'submission-art: creator reads') then
    create policy "submission-art: creator reads" on storage.objects
      for select to authenticated
      using (bucket_id = 'submission-art' and public.submission_art_is_creator());
  end if;
end $$;

-- Submit a card whose art is an uploaded object (`<uid>/<uuid>.<ext>`).
create or replace function public.submit_card_art(
  p_name text, p_type text, p_flavor text, p_art_path text, p_treatment text default 'standard')
returns card_submissions language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_path text := btrim(coalesce(p_art_path, ''));
  v_row card_submissions%rowtype;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if v_path !~ ('^' || v_uid::text || '/[0-9a-f-]{36}\.(png|jpg|jpeg|webp|mp4|webm)$') then
    raise exception 'Upload the art file again — that upload path is not valid.';
  end if;
  if not exists (select 1 from storage.objects
                  where bucket_id = 'submission-art' and name = v_path) then
    raise exception 'The uploaded art was not found — upload it again.';
  end if;
  if exists (select 1 from card_submissions where art_path = v_path) then
    raise exception 'That upload is already attached to a submission.';
  end if;
  -- Same validation as a link submission (title, type, flavor, treatment vs
  -- video, limits, duplicates); the placeholder keeps the file extension.
  v_row := submit_card(p_name, p_type, p_flavor,
                       'https://submission-art.invalid/' || v_path, p_treatment);
  update card_submissions set art_path = v_path where id = v_row.id returning * into v_row;
  return v_row;
end $$;
revoke all on function public.submit_card_art(text, text, text, text, text) from public, anon;
grant execute on function public.submit_card_art(text, text, text, text, text) to authenticated;

-- Removal schedule: published -> now; denied / withdrawn -> 30 days.
create or replace function public.card_submissions_art_retention()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.art_path is null or new.art_removed_at is not null then return new; end if;
  if new.art_status = 'published' and old.art_status is distinct from 'published' then
    new.art_removable_at := now();
  elsif new.status in ('denied', 'withdrawn') and old.status is distinct from new.status then
    new.art_removable_at := now() + interval '30 days';
  end if;
  return new;
end $$;
do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 'card_submissions_art_retention') then
    create trigger card_submissions_art_retention before update of status, art_status
      on public.card_submissions for each row execute function public.card_submissions_art_retention();
  end if;
end $$;

-- The pipeline's queue, now with each job's uploaded art_path (if any).
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
end $function$;
revoke all on function public.art_pipeline_jobs(text, int) from public;
grant execute on function public.art_pipeline_jobs(text, int) to anon, authenticated;

-- Paths the Edge Function may sign: uploads of approved cards awaiting publish.
create or replace function public.submission_art_sign_jobs(p_token text)
returns text[] language plpgsql stable security definer set search_path = public as $$
begin
  perform art_pipeline_check(p_token);
  return coalesce((select array_agg(art_path order by reviewed_at) from card_submissions
                    where status = 'approved' and art_status = 'pending'
                      and art_path is not null and art_removed_at is null), '{}');
end $$;
revoke all on function public.submission_art_sign_jobs(text) from public;
grant execute on function public.submission_art_sign_jobs(text) to anon, authenticated, service_role;

-- Paths the Edge Function may delete now (at most 100 per call).
create or replace function public.submission_art_cleanup_jobs(p_token text)
returns text[] language plpgsql stable security definer set search_path = public, storage as $$
begin
  perform art_pipeline_check(p_token);
  return coalesce((select array_agg(p) from (
    select art_path p from public.card_submissions
     where art_path is not null and art_removed_at is null and art_removable_at <= now()
    union
    select o.name from storage.objects o
     where o.bucket_id = 'submission-art' and o.created_at < now() - interval '2 days'
       and not exists (select 1 from public.card_submissions s where s.art_path = o.name)
    limit 100) q), '{}');
end $$;
revoke all on function public.submission_art_cleanup_jobs(text) from public;
grant execute on function public.submission_art_cleanup_jobs(text) to anon, authenticated, service_role;

create or replace function public.submission_art_mark_removed(p_token text, p_paths text[])
returns int language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  perform art_pipeline_check(p_token);
  update card_submissions set art_removed_at = now()
   where art_path = any(coalesce(p_paths, '{}')) and art_removed_at is null
     and art_removable_at <= now();
  get diagnostics v_n = row_count;
  return v_n;
end $$;
revoke all on function public.submission_art_mark_removed(text, text[]) from public;
grant execute on function public.submission_art_mark_removed(text, text[]) to anon, authenticated, service_role;

-- Review queue with art_path (the Creator screen signs it to preview).
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
             s.art_path, s.art_removed_at,
             case when s.status = 'pending' then 0 else 1 end as ord
        from card_submissions s
        left join profiles p on p.id = s.submitter
       where p_status is null or s.status = p_status
       order by case when s.status = 'pending' then 0 else 1 end, s.created_at
       limit greatest(1, least(coalesce(p_limit, 200), 1000))
    ) q), '[]'::jsonb);
end $function$;
