-- Audit 2026-09-29, section 1, Medium findings M-2, M-4 and M-8.
--
-- NOT YET APPLIED. The live project was unreachable when this was written, so
-- the function bodies below are copied from the repo migrations and have not
-- been diffed against production. Compare with pg_get_functiondef first and
-- apply on a branch.

-- M-4. An unknown or null rarity started the ladder at index 1 (Mythic), so a
-- typo in a pack's slot_config paid out the rarest tier. It now starts at the
-- lowest tier.
create or replace function public.random_card_of_rarity(p_rarity text, p_sets text[])
returns text
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_id text;
  ladder text[] := array['Mythic','Alt-Art','Full-Art','Ultra-Rare','Super-Rare','Rare','Uncommon','Common'];
  i int; start_idx int := array_length(ladder, 1);  -- unknown rarity: fall back to the lowest tier, never Mythic
begin
  for i in 1..array_length(ladder, 1) loop
    if ladder[i] = p_rarity then start_idx := i; end if;
  end loop;
  for i in start_idx..array_length(ladder, 1) loop
    select id into v_id from cards
      where rarity = ladder[i] and card_type <> 'Leader'
        and (p_sets is null or set_name = any(p_sets))
      order by random() limit 1;
    if v_id is not null then return v_id; end if;
  end loop;

  -- Set-restricted fallback: never spill outside the requested sets.
  select id into v_id from cards
    where card_type <> 'Leader' and (p_sets is null or set_name = any(p_sets))
    order by random() limit 1;
  if v_id is not null then return v_id; end if;

  -- 2. THE SPILL. The previous version's last resort was
  --    `select id from cards order by random()` with no set predicate — so a
  --    pack pinned to a set containing no cards silently paid out cards from
  --    a DIFFERENT set, and the README's "every pack_types row pins its own
  --    allowed_sets" invariant failed exactly where it was load-bearing.
  --
  --    This is not hypothetical. `Players Showcase 2026 Booster` is a real
  --    pack_types row, priced at 699 credits, pinned to allowed_sets
  --    ['Players Showcase 2026'] — and that set contains ZERO of the 297 live
  --    cards. It is `is_active = false` today, which is the only reason this
  --    is a latent finding rather than a live one: the pass that flips that
  --    flag is the pass that ships the Showcase set, and if the flag moves
  --    first the pack sells Volume #1 cards under a Showcase name.
  --
  --    Raising is the correct failure mode here precisely BECAUSE the caller
  --    is SECURITY DEFINER: the exception rolls the whole transaction back,
  --    so the player's currency is not debited for a pack that could not be
  --    filled. A refused purchase is recoverable; a mis-delivered one is a
  --    support ticket in a player-to-player economy.
  raise exception
    'No cards available for rarity % within sets % — refusing to draw outside the pinned sets',
    p_rarity, p_sets;
end;

revoke all on function public.random_card_of_rarity(text, text[]) from public;
grant execute on function public.random_card_of_rarity(text, text[]) to authenticated, service_role;

-- M-8. create_mystery_template: a NULL mode and a slot without a mode key
-- skipped their checks (`NULL not in (...)` is NULL), and string weights such
-- as "NaN" or "Infinity" cast to numeric and were accepted.
create or replace function public.create_mystery_template(p_name text, p_pack_size integer, p_mode text, p_config jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
  v_slots jsonb;
  v_guarantees jsonb;
  v_guaranteed_total int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if not exists (select 1 from player_shops where owner = v_uid) then raise exception 'You need a shop first'; end if;
  if p_pack_size is null or p_pack_size < 1 or p_pack_size > 20 then raise exception 'Pack size must be 1-20'; end if;
  if p_mode is null or p_mode not in ('simple', 'advanced') then raise exception 'Unknown mode'; end if;
  if p_name is null or char_length(trim(p_name)) < 1 or char_length(p_name) > 40 then raise exception 'Invalid name'; end if;

  v_guarantees := p_config->'guarantees';
  if v_guarantees is not null and v_guarantees <> 'null'::jsonb then
    if jsonb_typeof(v_guarantees) <> 'array' then raise exception 'guarantees must be an array'; end if;
    -- Advanced mode's slots already fill the whole pack; a separate guarantee
    -- would be granted on top and overflow pack_size. Use minimum slots there.
    if p_mode = 'advanced' and jsonb_array_length(v_guarantees) > 0 then
      raise exception 'Guarantees are a simple-mode feature — in advanced mode use minimum slots instead';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_guarantees) gg
      where not rarity_is_known(gg->>'rarity')
         or coalesce((gg->>'count')::int, 0) < 1
    ) then
      raise exception 'Each guarantee needs a known rarity and a count of 1 or more';
    end if;
    -- v33: a guarantee is a PROMISE, so the rarity has to be one the pack can
    -- actually deliver.
    if exists (
      select 1 from jsonb_array_elements(v_guarantees) gg
      where not rarity_is_deliverable(gg->>'rarity')
    ) then
      raise exception 'No cards of that rarity exist yet, so it cannot be guaranteed';
    end if;
    select coalesce(sum((gg->>'count')::int), 0) into v_guaranteed_total
      from jsonb_array_elements(v_guarantees) gg;
    if v_guaranteed_total > p_pack_size then
      raise exception 'Guarantees total % cards but the pack only holds %', v_guaranteed_total, p_pack_size;
    end if;
  end if;

  if p_mode = 'simple' then
    if p_config->'rarity_weights' is null or jsonb_typeof(p_config->'rarity_weights') <> 'object' then
      raise exception 'Simple mode needs a rarity_weights object';
    end if;
    -- A weight given as a string ("NaN", "Infinity") casts to numeric and slips
    -- past the sign checks below, so insist on real JSON numbers first.
    if exists (
      select 1 from jsonb_each(p_config->'rarity_weights') where jsonb_typeof(value) <> 'number'
    ) then
      raise exception 'rarity_weights must be numbers';
    end if;
    if not exists (
      select 1 from jsonb_each_text(p_config->'rarity_weights') where value::numeric > 0
    ) then
      raise exception 'At least one rarity needs a weight above zero';
    end if;
    if exists (
      select 1 from jsonb_each_text(p_config->'rarity_weights')
      where not rarity_is_known(key) or value::numeric < 0
    ) then
      raise exception 'rarity_weights must map known rarities to non-negative numbers';
    end if;
    -- v33: a weight of ZERO on an unprintable rarity is harmless — it is never
    -- rolled — so only a positive weight has to be deliverable.
    if exists (
      select 1 from jsonb_each_text(p_config->'rarity_weights')
      where value::numeric > 0 and not rarity_is_deliverable(key)
    ) then
      raise exception 'No cards of that rarity exist yet, so it cannot be given a weight';
    end if;
  else
    v_slots := p_config->'slots';
    if v_slots is null or jsonb_typeof(v_slots) <> 'array' then raise exception 'Advanced mode needs a slots array'; end if;
    if jsonb_array_length(v_slots) <> p_pack_size then raise exception 'slots array must have exactly pack_size entries'; end if;
    if exists (select 1 from jsonb_array_elements(v_slots) s where coalesce(s->>'mode', '') not in ('exact', 'minimum', 'open')) then
      raise exception 'Each slot must be tagged exact, minimum or open';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_slots) s
      where s->>'mode' = 'minimum' and not rarity_is_known(coalesce(s->>'rarity',''))
    ) then
      raise exception 'A minimum slot needs a known rarity';
    end if;
    -- v33: "minimum Alt-Art" reads as a floor and delivers a Full-Art, because
    -- the ladder falls downward on an empty tier. Same promise, same fix.
    if exists (
      select 1 from jsonb_array_elements(v_slots) s
      where s->>'mode' = 'minimum' and not rarity_is_deliverable(s->>'rarity')
    ) then
      raise exception 'No cards of that rarity exist yet, so it cannot be a minimum';
    end if;
    if exists (
      select 1 from jsonb_array_elements(v_slots) s
      where s->>'mode' = 'exact' and not exists (select 1 from cards where id = s->>'card_id')
    ) then
      raise exception 'An exact slot references an unknown card';
    end if;
  end if;

  insert into mystery_pack_templates (owner, name, pack_size, mode, config)
  values (v_uid, trim(p_name), p_pack_size, p_mode, p_config)
  returning id into v_id;
  return jsonb_build_object('ok', true, 'template_id', v_id);
end;

revoke all on function public.create_mystery_template(text, integer, text, jsonb) from public;
grant execute on function public.create_mystery_template(text, integer, text, jsonb) to authenticated;

-- M-2. record_match_result returned a bare null for a too-young, expired,
-- already-redeemed or over-cap ticket, and the daily-cap path had already
-- burnt the ticket. It now returns {"status": ...} with the reason, and the
-- cap is checked before the ticket is claimed. Otherwise identical to
-- 20260826000000.
create or replace function public.record_match_result(p_won boolean, p_match_id uuid default null::uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_reward int := case when p_won then 100 else 40 end;
  v_xp int := case when p_won then 60 else 25 end;
  v_bp_xp int := case when p_won then 50 else 20 end;
  v_bp_xp_granted int := 0;
  v_profile profiles%rowtype;
  v_lvl jsonb;
  v_started timestamptz;
  v_ticket match_tickets%rowtype;
  v_min_seconds constant int := 45;
  v_max_hours constant int := 6;
  v_paid_today int;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;
  if p_match_id is null then
    raise exception 'Missing match ticket: call begin_match() when the match starts';
  end if;

  -- Daily payout ceiling, checked BEFORE the claim so hitting it does not
  -- consume the ticket.
  select count(*) into v_paid_today
    from match_tickets
   where uid = v_uid and redeemed_at > now() - interval '24 hours';
  if v_paid_today >= 200 then
    return jsonb_build_object('status', 'capped');
  end if;

  update match_tickets
     set redeemed_at = now()
   where match_id = p_match_id
     and uid = v_uid
     and redeemed_at is null
     and started_at <= now() - make_interval(secs => v_min_seconds)
     and started_at > now() - make_interval(hours => v_max_hours)
  returning started_at into v_started;

  if v_started is null then
    select * into v_ticket from match_tickets where match_id = p_match_id and uid = v_uid;
    return jsonb_build_object('status',
      case
        when not found then 'invalid'
        when v_ticket.redeemed_at is not null then 'duplicate'
        when v_ticket.started_at > now() - make_interval(secs => v_min_seconds) then 'too_early'
        else 'expired'
      end);
  end if;

  insert into match_receipts (match_id, uid) values (p_match_id, v_uid)
    on conflict (match_id) do nothing;

  update profiles
    set credits = credits + v_reward,
        wins = wins + case when p_won then 1 else 0 end,
        losses = losses + case when p_won then 0 else 1 end,
        games_played = games_played + 1,
        last_match_at = now(),
        updated_at = now()
    where id = v_uid;
  v_lvl := grant_xp(v_uid, v_xp);
  if grant_bp_xp(v_uid, v_bp_xp) then v_bp_xp_granted := v_bp_xp; end if;
  perform track_stat(v_uid, 'games_played', 1, false);
  if p_won then perform track_stat(v_uid, 'wins', 1, false); end if;
  perform track_stat(v_uid, 'level', (v_lvl->>'level')::int, true);
  select * into v_profile from profiles where id = v_uid;
  return jsonb_build_object('reward', v_reward, 'credits', v_profile.credits,
    'wins', v_profile.wins, 'losses', v_profile.losses,
    'xp_gained', v_xp, 'xp', v_profile.xp, 'level', v_profile.level,
    'leveled_up', coalesce((v_lvl->>'leveled_up')::boolean, false),
    'level_credits_bonus', coalesce((v_lvl->>'credits_bonus')::int, 0),
    'level_vouchers_bonus', coalesce((v_lvl->>'vouchers_bonus')::int, 0),
    'bp_xp_gained', v_bp_xp_granted);
end;
$function$;

-- The original migration's grants for this function are not in the repo; a
-- create-or-replace keeps whatever ACL production has, which is what we want.
