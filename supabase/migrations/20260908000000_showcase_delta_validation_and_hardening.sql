-- Backend audit, v33. Five findings. The first is a live, reproducible
-- lock-out; the rest are hardening that changes no shipped behaviour.

-- ---------------------------------------------------------------------------
-- 1. `set_showcase_cards` — the showcase lock-out.
--
-- THE BUG, end to end. `submit_grading` moves a copy OUT of `player_cards`
-- (quantity -> 0) and into `graded_cards`. Nothing prunes `showcase_cards`,
-- so the profile keeps pointing at a card the player no longer holds in the
-- table the ownership check reads.
--
-- `set_showcase_cards` then re-validated the WHOLE array on every write:
--
--     select count(*) into v_owned from player_cards
--     where user_id = v_uid and card_id = any(v_ids)
--       and (quantity + foil_quantity) > 0;
--     if v_owned <> array_length(v_ids, 1) then
--       raise exception 'You can only showcase cards you own';
--
-- and `CollectionScreen.toggleShowcase` always sends the whole array —
-- `[...showcase, cardId]` to pin, `showcase.filter(...)` to unpin. Either
-- way the array still contains the graded ids, so the count never matches
-- and EVERY write throws, including the unpin that would fix it. The player
-- is frozen at SHOWCASE FULL (6/6) with no path out from the UI.
--
-- Observed on a live profile: six showcased ids, all six real cards, all six
-- legitimately acquired, four of them since graded. Not referential
-- corruption — a validation-scope bug.
--
-- THE FIX: validate the DELTA, not the array. Ownership is checked for ids
-- being ADDED; ids already pinned are grandfathered and removals are always
-- allowed. That makes the state self-healing: whatever a profile is stuck
-- holding, the player can always unpin it.
--
-- This is the general shape of the hazard, and it is worth carrying to any
-- other RPC that re-validates full state on a partial edit: a full-array
-- revalidate turns "this row went stale" into "you can never edit again".
create or replace function public.set_showcase_cards(p_card_ids text[])
  returns text[]
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_ids text[];
  v_current text[];
  v_added text[];
  v_owned int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  v_ids := coalesce(p_card_ids, '{}');
  if coalesce(array_length(v_ids, 1), 0) > 6 then
    raise exception 'You can showcase at most 6 cards';
  end if;
  if (select count(distinct x) from unnest(v_ids) as x) <> coalesce(array_length(v_ids, 1), 0) then
    raise exception 'Duplicate cards in showcase';
  end if;

  select coalesce(showcase_cards, '{}') into v_current from profiles where id = v_uid;
  if not found then raise exception 'Not authenticated'; end if;

  -- Only the newly-pinned ids face the ownership check. An id already in
  -- `v_current` is kept regardless of what has happened to the holding since
  -- it was pinned, so reordering and unpinning can never be blocked.
  select coalesce(array_agg(x), '{}') into v_added
  from unnest(v_ids) as x
  where not (x = any(v_current));

  if coalesce(array_length(v_added, 1), 0) > 0 then
    select count(*) into v_owned
    from player_cards
    where user_id = v_uid
      and card_id = any(v_added)
      and (quantity + foil_quantity) > 0;
    if v_owned <> array_length(v_added, 1) then
      raise exception 'You can only showcase cards you own';
    end if;
  end if;

  update profiles set showcase_cards = v_ids, updated_at = now() where id = v_uid;
  return v_ids;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Prune on divestment.
--
-- The delta check above stops the lock-out, but a showcase that still lists
-- a card the player has graded away, quicksold, traded or listed is a lie
-- on their profile. `player_cards` is the single choke point every one of
-- those paths writes through — `submit_grading`, `quicksell_cards`,
-- `transfer_cards`, `create_listing` and the shop listing RPCs all decrement
-- or delete rows there — so one trigger covers all of them without touching
-- eight function bodies.
--
-- Deliberately narrow: it fires only on the 1 -> 0 transition (and on
-- delete), and it never adds anything. Pinning is still entirely the
-- player's call.
create or replace function public.prune_showcase_on_divest()
  returns trigger
  language plpgsql
  security definer
  set search_path to 'public'
as $function$
declare
  v_uid uuid := coalesce(new.user_id, old.user_id);
  v_card text := coalesce(new.card_id, old.card_id);
begin
  update profiles
  set showcase_cards = array_remove(showcase_cards, v_card),
      updated_at = now()
  where id = v_uid
    and showcase_cards @> array[v_card];
  return null;
end;
$function$;

drop trigger if exists prune_showcase_on_divest_upd on public.player_cards;
create trigger prune_showcase_on_divest_upd
  after update of quantity, foil_quantity on public.player_cards
  for each row
  when (new.quantity + new.foil_quantity <= 0 and old.quantity + old.foil_quantity > 0)
  execute function public.prune_showcase_on_divest();

drop trigger if exists prune_showcase_on_divest_del on public.player_cards;
create trigger prune_showcase_on_divest_del
  after delete on public.player_cards
  for each row
  when (old.quantity + old.foil_quantity > 0)
  execute function public.prune_showcase_on_divest();

-- Backfill: every profile currently pinning something it no longer holds.
-- This is what the trigger would have done at the moment of divestment, so
-- it converges the existing rows onto the new invariant. Entries the player
-- DOES still hold are untouched, so a stuck profile keeps the pins that were
-- always valid and loses only the ones that were already unrenderable.
update public.profiles p
set showcase_cards = coalesce(
      (select array_agg(id order by ord)
       from unnest(p.showcase_cards) with ordinality as t(id, ord)
       where exists (
         select 1 from public.player_cards pc
         where pc.user_id = p.id and pc.card_id = t.id
           and (pc.quantity + pc.foil_quantity) > 0
       )),
      '{}')
  , updated_at = now()
where coalesce(array_length(p.showcase_cards, 1), 0) > 0
  and exists (
    select 1 from unnest(p.showcase_cards) as id
    where not exists (
      select 1 from public.player_cards pc
      where pc.user_id = p.id and pc.card_id = id
        and (pc.quantity + pc.foil_quantity) > 0
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Five SECURITY DEFINER economy mutators were callable by `anon`.
--
-- Their ACLs carried a bare `=X/postgres` — an EXECUTE grant to PUBLIC,
-- which on Supabase includes the unauthenticated `anon` role that every
-- browser holds before sign-in. Each of them then calls `auth.uid()` and
-- raises 'Not authenticated' on null, so this was never exploitable, but a
-- PostgREST endpoint that mutates the economy should not be reachable
-- without a session at all. `record_match_result` is the notable one: it is
-- the payout path.
revoke execute on function public.crack_graded_slab(uuid) from public, anon;
revoke execute on function public.quicksell_graded_card(uuid) from public, anon;
revoke execute on function public.record_match_result(boolean, uuid) from public, anon;
revoke execute on function public.reveal_graded_cards() from public, anon;
revoke execute on function public.submit_grading(jsonb, text, text, text) from public, anon;

-- `authenticated` keeps its own explicit grant; these are the same five
-- functions the client calls after sign-in.
grant execute on function public.crack_graded_slab(uuid) to authenticated;
grant execute on function public.quicksell_graded_card(uuid) to authenticated;
grant execute on function public.record_match_result(boolean, uuid) to authenticated;
grant execute on function public.reveal_graded_cards() to authenticated;
grant execute on function public.submit_grading(jsonb, text, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Eight grading helpers with a mutable `search_path`.
--
-- The 2026-08-28 migration pinned `search_path` across the functions it
-- touched but these eight kept `proconfig = null`, so each resolves its
-- table and operator references against whatever `search_path` the caller
-- happens to have. They are pure `stable`/`immutable` pricing helpers, but
-- they are reachable over PostgREST, and an unpinned search_path on a
-- function is the standard shadowing hazard. Pinned to `public` to match
-- every other function in the schema.
alter function public.grading_base_fee(text)              set search_path to 'public';
alter function public.grading_bulk_mult(text, integer)    set search_path to 'public';
alter function public.grading_grade_mult(numeric)         set search_path to 'public';
alter function public.grading_roll(text)                  set search_path to 'public';
alter function public.grading_service_premium(text)       set search_path to 'public';
alter function public.grading_speed_mult(text, text)      set search_path to 'public';
alter function public.grading_turnaround(text)            set search_path to 'public';
alter function public.grading_voucher_fee(integer)        set search_path to 'public';

-- `grading_voucher_fee` additionally carried an EXPLICIT `anon=X/postgres`
-- grant on top of the PUBLIC one — the only function in the schema with a
-- named grant to the pre-sign-in role. It is a pure pricing helper, so this
-- was harmless, but it is an outlier with no reason to exist and
-- `authenticated` carries its own grant, so nothing signed in loses access.
revoke execute on function public.grading_voucher_fee(integer) from anon;

-- ---------------------------------------------------------------------------
-- 5. `match_receipts` / `match_tickets` — RLS on, zero policies.
--
-- The security advisor flags this as `rls_enabled_no_policy`. It is NOT a
-- bug here, and the fix is emphatically not to add a read policy: these two
-- tables are the anti-cheat ledger behind server-minted match ids, they are
-- written only from inside `begin_match` / `record_match_result` (both
-- SECURITY DEFINER, which bypasses RLS), and no client code path reads them
-- — grep of `src/` returns nothing. Deny-all is the intended posture.
--
-- Making that explicit so the next reader of the advisor does not "fix" it
-- by opening the ledger up: the grants are revoked as well as the policies
-- being absent, which states the intent in the schema rather than in a
-- comment alone.
revoke all on public.match_receipts from anon, authenticated;
revoke all on public.match_tickets  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Storage buckets had no size or MIME ceiling.
--
-- Both buckets were `file_size_limit = null`, `allowed_mime_types = null`,
-- which is how 11 MB PNGs reached the CDN and turned into the cached-egress
-- bill the 2026-09-07 migration cleaned up after. A ceiling here stops that
-- regression at upload time rather than after the invoice.
--
-- 8 MB is above every asset the generator currently produces and well below
-- the outliers. The MIME lists are the formats the app actually renders.
update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'video/mp4', 'video/webm']
where id = 'Card Images';

update storage.buckets
set file_size_limit = 8388608,
    allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/avif', 'image/gif', 'video/mp4', 'video/webm', 'application/json']
where id = 'Other files';
