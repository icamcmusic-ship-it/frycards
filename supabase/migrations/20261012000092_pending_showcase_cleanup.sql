-- PENDING / DESTRUCTIVE — not applied live. Review, then apply by hand.
--
-- 1. card_submissions.card_type's CHECK still lists the retired 'Charm'
--    instead of 'Item', while submit_card and the client both offer 'Item'.
--    Every Item submission therefore fails on insert with a constraint error.
--    Relaxing a CHECK needs a DROP CONSTRAINT, hence this file.
-- 2. get_card_submissions (v1) is superseded by get_card_submissions_v2
--    (20261012000004). Drop it once no deployed client calls v1.

do $$
declare v_name text;
begin
  select conname into v_name from pg_constraint
   where conrelid = 'public.card_submissions'::regclass
     and pg_get_constraintdef(oid) like '%Charm%';
  if v_name is not null then
    execute format('alter table public.card_submissions drop constraint %I', v_name);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'card_submissions_card_type_check_v2') then
    alter table public.card_submissions add constraint card_submissions_card_type_check_v2
      check (card_type in ('Unit', 'Item', 'Event', 'Location'));
  end if;
end $$;

drop function if exists public.get_card_submissions(text, integer);
