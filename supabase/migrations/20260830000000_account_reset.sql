-- Account reset: a player-initiated wipe of their own collection, decks and
-- currency back to a fresh-signup state, capped at once every 7 days for
-- everyone except the `creator` role (Fry, the one admin account this
-- project has — see `assert_creator()`), who can reset without a cooldown
-- for testing.
--
-- Timestamp lives on `profiles` rather than a separate table: it is a single
-- per-account gate, not a log, and every other per-account cooldown in this
-- schema (`last_free_pack_at`, `last_login_claim_at`) already lives the same
-- way.
alter table public.profiles
  add column if not exists last_account_reset_at timestamptz;

create or replace function public.reset_account()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_profile profiles%rowtype;
  v_listing market_listings%rowtype;
  v_trade trades%rowtype;
  v_deck_box_id uuid;
begin
  if v_uid is null then raise exception 'Not authenticated'; end if;

  select * into v_profile from profiles where id = v_uid for update;
  if not found then raise exception 'Profile not found'; end if;

  if v_profile.role <> 'creator' and v_profile.last_account_reset_at is not null
     and v_profile.last_account_reset_at > now() - interval '7 days' then
    raise exception 'You can reset your account once every 7 days — next reset available %',
      to_char(v_profile.last_account_reset_at + interval '7 days', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
  end if;

  -- Refuse rather than guess at unwinding an auction someone else has
  -- already bid on: that bidder's credits are in escrow (see `place_bid`),
  -- and force-cancelling would hand this player's decision authority over
  -- money that is no longer only theirs. `cancel_listing` already refuses
  -- this same case for the same reason; ask the player to let it resolve.
  if exists (
    select 1 from market_listings where seller = v_uid and status = 'active' and bid_count > 0
  ) then
    raise exception 'You have an active auction with a bid on it — let it end before resetting';
  end if;

  -- Everything else the player owns outright gets unwound through the SAME
  -- vetted paths the UI uses (cancel_listing, close_shop, cancel_trade,
  -- respond_trade) rather than re-deriving escrow-safe unwind logic here.
  -- None of these move a counterparty's money: `cancel_listing` only returns
  -- this player's own escrowed cards, `close_shop` refunds this player's own
  -- slot collateral, and neither `trades` side escrows anything until
  -- `respond_trade` accepts (see that function) — declining or cancelling a
  -- pending trade is a pure status change.
  for v_listing in
    select * from market_listings where seller = v_uid and status = 'active' for update
  loop
    perform cancel_listing(v_listing.id);
  end loop;

  if exists (select 1 from player_shops where owner = v_uid and status <> 'dormant') then
    perform close_shop();
  end if;

  for v_trade in select * from trades where proposer = v_uid and status = 'pending' for update loop
    perform cancel_trade(v_trade.id);
  end loop;
  for v_trade in select * from trades where recipient = v_uid and status = 'pending' for update loop
    perform respond_trade(v_trade.id, false);
  end loop;

  -- The collection, decks, and progress that "reset your account" means.
  delete from player_cards where user_id = v_uid;
  delete from player_serialized_cards where user_id = v_uid;
  delete from decks where user_id = v_uid;
  delete from player_inventory where user_id = v_uid;
  delete from player_cosmetics where user_id = v_uid;
  delete from player_achievements where user_id = v_uid;
  delete from graded_cards where user_id = v_uid;
  delete from friendships where requester = v_uid or addressee = v_uid;
  delete from mystery_pack_templates where owner = v_uid;
  -- The player's own trade/listing rows are terminal now (cancelled/declined
  -- above); clear them so reset doesn't leave dead history behind. A row
  -- naming this player as the OTHER side of someone else's trade is left —
  -- that half of the record belongs to their history too.
  delete from trades where proposer = v_uid and status in ('cancelled', 'declined');
  delete from market_listings where seller = v_uid and status = 'cancelled';

  -- Deliberately NOT touched:
  --  - username, role, id: identity, not progress.
  --  - submissions_banned / submissions_ban_reason, card_submissions,
  --    shop_fraud_strikes, shop_reports, shop_buyer_ratings,
  --    player_shop_ratings: moderation and reputation history. A reset is
  --    not a way to launder a ban, a strike, or a report against you.
  --  - match_tickets, match_receipts: the anti-cheat ledger behind
  --    server-minted match currency (see the v32 migration's own history on
  --    why that ledger exists at all) — not player-visible progress, and
  --    resetting it changes nothing about what a ticket can redeem.
  --  - last_free_pack_at, last_login_claim_at, login_streak,
  --    player_battle_pass, player_missions, player_bounty_activity: every
  --    one of these gates a reward that has ALREADY been paid out on a
  --    calendar or seasonal cycle (`claim_daily_pack`, `claim_daily_login`,
  --    battle pass tier claims, bounty pity tracking). Zeroing any of them
  --    here would let a weekly reset re-open a reward window that already
  --    paid — a bounded exploit, but a real one, and there is no version of
  --    "reset your account" that should include "and also re-grant rewards
  --    you already collected."
  update profiles set
    credits = 1500,
    vouchers = 25,
    wins = 0,
    losses = 0,
    games_played = 0,
    xp = 0,
    level = 1,
    showcase_cards = '{}',
    equipped_card_back = null,
    equipped_banner = null,
    equipped_avatar = null,
    last_match_at = null,
    last_account_reset_at = now(),
    updated_at = now()
  where id = v_uid;
  -- Credits/vouchers reset to the plain signup default regardless of role —
  -- NOT re-running the founder-slot +3000 bonus from `handle_new_user`. That
  -- bonus was a one-time reward for being one of the first 25 accounts; a
  -- founder re-running it on every weekly reset would turn a one-time perk
  -- into a recurring one, which is exactly the shape of exploit the pack and
  -- bounty findings in this project's own audits keep finding elsewhere.

  -- Re-grant the same Deck Box every new account gets from `handle_new_user`,
  -- so resetting and signing up land the player in the same place: pick a
  -- Leader via `claim_deck_box`, get a ready-to-play deck.
  select id into v_deck_box_id from pack_types
    where acquisition = 'deck_box_grant' and is_active limit 1;
  if v_deck_box_id is not null then
    perform grant_inventory_pack(v_uid, v_deck_box_id, 1);
  end if;

  return jsonb_build_object('ok', true, 'reset_at', now());
end;
$function$;

revoke all on function public.reset_account() from public;
grant execute on function public.reset_account() to authenticated;
