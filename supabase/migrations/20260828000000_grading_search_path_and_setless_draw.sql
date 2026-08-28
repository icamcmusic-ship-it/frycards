-- Backend audit, v32. Two findings, both latent rather than live — neither
-- changes any shipped behaviour, and that is deliberate: this migration is
-- meant to be a no-op against today's callers.

-- ---------------------------------------------------------------------------
-- 1. `random_card_of_rarity(text)` — a second door into the whole catalog.
--
-- The function is OVERLOADED: `(p_rarity text, p_sets text[])` honours the
-- caller's set restriction, and a legacy `(p_rarity text)` arm ignores sets
-- entirely and draws from `cards` at large.
--
-- The README states the invariant this breaks: "Every `pack_types` row pins
-- its own `allowed_sets`; a null there means 'draw from the whole table',
-- which is not what any shipped pack wants once more than one set exists.
-- `random_card_of_rarity`, `grant_pack_contents` and `pick_deck_bucket` all
-- honour it." The 1-arg arm cannot honour it — it has nowhere to put the
-- restriction — so any caller that resolves to it silently re-weights a
-- shipped pack the moment a second set lands.
--
-- Audited before dropping, and it is unreachable today:
--   * the only function in the database whose body mentions
--     `random_card_of_rarity` is `grant_pack_contents`, and it calls the
--     2-arg form (`random_card_of_rarity(v_rarity, p_pack.allowed_sets)`);
--   * nothing in the client calls it over PostgREST, and it could not: the
--     1-arg arm's ACL is `postgres`/`service_role` only, where the 2-arg arm
--     carries `authenticated` and PUBLIC.
--
-- So it is dead code that only becomes dangerous later, which is the worst
-- shape for this hazard to be in. Dropped. Its body is reproduced here so the
-- drop is reversible from this file alone:
--
--   create or replace function public.random_card_of_rarity(p_rarity text)
--     returns text language plpgsql stable set search_path to 'public' as $fn$
--   declare
--     v_id text;
--     ladder text[] := array['Mythic','Alt-Art','Full-Art','Ultra-Rare',
--                            'Super-Rare','Rare','Uncommon','Common'];
--     i int; start_idx int := 1;
--   begin
--     for i in 1..array_length(ladder, 1) loop
--       if ladder[i] = p_rarity then start_idx := i; end if;
--     end loop;
--     for i in start_idx..array_length(ladder, 1) loop
--       select id into v_id from cards where rarity = ladder[i]
--         and card_type <> 'Leader' order by random() limit 1;
--       if v_id is not null then return v_id; end if;
--     end loop;
--     select id into v_id from cards order by random() limit 1;
--     return v_id;
--   end;
--   $fn$;
--
-- (The 2-arg arm keeps the same rarity ladder, so nothing about the fallback
-- behaviour is lost with it.)
drop function if exists public.random_card_of_rarity(text);

-- ---------------------------------------------------------------------------
-- 2. The eight `grading_*` helpers had no `search_path` set.
--
-- `proconfig` is null on all eight and non-null on every other function in
-- the database, so these are the odd ones out — shipped in a pass that did
-- not follow the house convention rather than exempted from it. They are all
-- SECURITY INVOKER, so the exposure is small; Supabase's own linter flags a
-- mutable search_path regardless, and "every function but these eight" is not
-- a convention worth keeping a hole in.
alter function public.grading_base_fee(text) set search_path to 'public';
alter function public.grading_bulk_mult(text, integer) set search_path to 'public';
alter function public.grading_grade_mult(numeric) set search_path to 'public';
alter function public.grading_roll(text) set search_path to 'public';
alter function public.grading_service_premium(text) set search_path to 'public';
alter function public.grading_speed_mult(text, text) set search_path to 'public';
alter function public.grading_turnaround(text) set search_path to 'public';
alter function public.grading_voucher_fee(integer) set search_path to 'public';
