create or replace function public.begin_match()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_recent int;
  v_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  perform pg_advisory_xact_lock(hashtextextended('begin_match:' || v_uid::text, 0));

  select count(*) into v_recent
    from match_tickets
   where uid = v_uid and started_at > now() - interval '1 hour';
  if v_recent >= 60 then
    raise exception 'Too many matches started recently';
  end if;

  delete from match_tickets where uid = v_uid and redeemed_at is null;

  insert into match_tickets (uid) values (v_uid) returning match_id into v_id;
  return jsonb_build_object('match_id', v_id, 'started_at', now());
end;
$function$;

revoke all on function public.begin_match() from public, anon;
grant execute on function public.begin_match() to authenticated;
