-- PENDING (run by hand in the SQL editor; not applied by the agent): the
-- destructive half of the 2026-10-14 audit's backend fixes. Each step is
-- idempotent. See docs/BACKEND_PENDING.md.

-- 1. Audit 7.3: trigger functions cannot be called over RPC, but they should
--    not carry an EXECUTE grant for the API roles. Triggers still fire (the
--    grant is checked when a trigger is created, not when it runs).
revoke execute on function public.grading_pop_track() from public, anon, authenticated;
revoke execute on function public.player_card_variants_guard() from public, anon, authenticated;
revoke execute on function public.shop_listing_release_slab() from public, anon, authenticated;

-- 2. Audit 7.3: the submission-art Edge Function calls these with the
--    service-role key, so the API roles never need them.
revoke execute on function public.submission_art_sign_jobs(text) from public, anon, authenticated;
revoke execute on function public.submission_art_cleanup_jobs(text) from public, anon, authenticated;
revoke execute on function public.submission_art_mark_removed(text, text[]) from public, anon, authenticated;

-- 3. Audit 7.3: ONLY after the repo secret SUPABASE_SERVICE_ROLE_KEY is set
--    for the showcase-art workflow (scripts/publish-showcase-art.ts then calls
--    as service_role). Running this before that breaks the art pipeline.
-- revoke execute on function public.art_pipeline_jobs(text, integer) from public, anon, authenticated;
-- revoke execute on function public.art_pipeline_report(text, jsonb) from public, anon, authenticated;
-- revoke execute on function public.cosmetics_mirror_jobs(text) from public, anon, authenticated;
-- revoke execute on function public.cosmetics_mirror_report(text, jsonb) from public, anon, authenticated;

-- 4. Prune the rate-limit log (failed pipeline tokens) older than a day.
select cron.schedule('prune-art-pipeline-attempts', '47 3 * * *',
  $$delete from public.art_pipeline_attempts where at < now() - interval '1 day'$$);
