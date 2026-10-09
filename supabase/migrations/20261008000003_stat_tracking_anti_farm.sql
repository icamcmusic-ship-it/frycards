-- 2026-10-08, audit B3: stop three stats being farmed for free.
--
-- 20261007000001 tracked these with triggers that fired on activity which costs
-- nothing, and they pay listings_25, decks_10, d_list_1, w_deck_1, d_bid_1,
-- w_bids_10 and bids_50:
--   listings_created  counted every INSERT (list, cancel, repeat);
--   decks_built       counted every INSERT (save, delete, repeat);
--   bids_placed       counted every lead change (two accounts outbidding each
--                     other, the escrow refunded each time).
-- Now:
--   listings_created  counts when a listing ENDS sold or expired. A cancelled
--                     listing never counts. (A listing that is already active
--                     when this lands was counted once at INSERT and will count
--                     again when it ends; at most 10 per player, and we never
--                     take earned progress back.)
--   decks_built       counts when a deck first becomes LEGAL (is_valid), once
--                     per deck, and at most one deck per player per UTC day.
--   bids_placed       counts a bidder's first bid on each listing only
--                     (place_bid already enforces the 5% minimum raise, and CPU
--                     bids never reach this branch).
-- Progress already earned is untouched: only future events are counted
-- differently.

-- One row per (player, key): a stat event that may only count once.
create table if not exists public.stat_once (
  user_id uuid not null references public.profiles(id) on delete cascade,
  key text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);
alter table public.stat_once enable row level security;
revoke all on table public.stat_once from public, anon, authenticated;

-- true the first time (uid, key) is seen, false afterwards.
create or replace function public.stat_once_claim(p_uid uuid, p_key text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  insert into stat_once (user_id, key) values (p_uid, p_key) on conflict do nothing;
  return found;
end;
$function$;
revoke all on function public.stat_once_claim(uuid, text) from public, anon, authenticated;

create or replace function public.track_decks()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  -- Only the moment a deck becomes legal counts; edits to a legal deck and
  -- drafts do not.
  if new.is_valid is true and (tg_op = 'INSERT' or old.is_valid is distinct from true) then
    if stat_once_claim(new.user_id, 'deck:' || new.id::text)
       and stat_once_claim(new.user_id, 'deckday:' || (now() at time zone 'utc')::date::text) then
      perform track_stat(new.user_id, 'decks_built', 1, false);
    end if;
  end if;
  return null;
end;
$function$;
create or replace trigger decks_track after insert or update of is_valid on public.decks
  for each row execute function public.track_decks();

create or replace function public.track_market_listings()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
begin
  if tg_op <> 'UPDATE' then return null; end if;

  if old.status = 'active' and new.status in ('sold', 'expired') then
    perform track_stat(new.seller, 'listings_created', 1, false);
  end if;

  -- a human bid (a CPU bid leaves current_bidder null), first one per listing
  if new.current_bidder is not null
     and new.bid_count > old.bid_count
     and new.current_bidder is distinct from old.current_bidder
     and stat_once_claim(new.current_bidder, 'bid:' || new.id::text) then
    perform track_stat(new.current_bidder, 'bids_placed', 1, false);
  end if;
  return null;
end;
$function$;
create or replace trigger market_listings_track after update of bid_count, status on public.market_listings
  for each row execute function public.track_market_listings();

revoke execute on function public.track_decks() from public, anon, authenticated;
revoke execute on function public.track_market_listings() from public, anon, authenticated;
