/**
 * Runs the 2026-10-08 backend fixes (audit section 1.1 B1-B7 and 1.3 M9, M11)
 * against PGlite. The base state mirrors what production actually had on
 * 2026-10-08: the 20260826 ticket migration and the hand-applied 2026-10-06/07
 * files, but NOT the 20260829-20260929 files (that gap is B1). Stubs cover the
 * parts of the live schema these functions touch; they are not a model of it.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';

const DIR = __dirname + '/migrations';
const sql = (f: string) => readFileSync(join(DIR, f), 'utf8');
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const C = '33333333-3333-3333-3333-333333333333';

const CATCH_UP = '20261008000001_catch_up_drift.sql';
const TAPER = '20261008000002_match_reward_taper.sql';
const ANTI_FARM = '20261008000003_stat_tracking_anti_farm.sql';
const CPU_STATE = '20261008000004_cpu_state_side_table_and_settle_grants.sql';
const SHOP_REF = '20261008000005_shop_customer_reference.sql';
const BINGO_GUARD = '20261008000006_claim_bingo_week_guard.sql';
const CATALOG = '20261008000007_clean_achievements_and_missions.sql';

let db: PGlite;
const q = async (s: string) => (await db.query(s)).rows as any[];
const as = (uid: string) => db.exec(`set test.uid = '${uid}'`);
const stat = async (key: string, uid: string) =>
  (await q(`select coalesce(sum(n),0)::int n from stats where key='${key}' and uid='${uid}'`))[0].n;
const canExec = async (role: string, sig: string) =>
  (await q(`select has_function_privilege('${role}', '${sig}'::regprocedure, 'execute') ok`))[0].ok;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table profiles (id uuid primary key, credits int default 0 check (credits >= 0), vouchers int default 0,
      wins int default 0, losses int default 0, games_played int default 0, last_match_at timestamptz,
      updated_at timestamptz, xp int default 0, level int default 1, role text default 'player',
      showcase_cards text[], equipped_card_back uuid, equipped_banner uuid, equipped_avatar uuid);
    create table match_receipts (match_id uuid primary key, uid uuid, created_at timestamptz default now());
    create function grant_bp_xp(p_uid uuid, p_xp int) returns boolean language sql as $$ select true $$;
    create table stats (uid uuid, key text, n int);
    create function track_stat(p_uid uuid, p_key text, p_n int, p_abs boolean) returns void language sql
      as $$ insert into stats values (p_uid, p_key, p_n) $$;
    create table cards (id text primary key, rarity text, card_type text, set_name text default 'V1',
      essence_types text[]);
    create table pack_types (id uuid primary key default gen_random_uuid(), allowed_sets text[], is_active boolean,
      acquisition text, slot_config jsonb, foil_chance numeric);
    insert into pack_types (allowed_sets, is_active, acquisition) values (array['V1'], true, 'purchase');
    create table pack_grants (uid uuid, pack uuid);
    create function grant_inventory_pack(p_uid uuid, p_pack uuid, n int) returns void language sql
      as $$ insert into pack_grants values (p_uid, p_pack) $$;
    create function grant_pack_contents(p_uid uuid, p_pack pack_types) returns jsonb language sql as $$ select '{}'::jsonb $$;
    create table player_cards (user_id uuid, card_id text, quantity int default 0, foil_quantity int default 0,
      primary key (user_id, card_id));
    create table player_serialized_cards (user_id uuid);
    create table decks (id uuid primary key default gen_random_uuid(), user_id uuid, is_valid boolean default false);
    create table graded_cards (id uuid primary key default gen_random_uuid(), user_id uuid, card_id text,
      foil boolean default false, service text default 'tca', grade numeric);
    create table friendships (requester uuid, addressee uuid);
    create table mystery_pack_templates (id uuid primary key default gen_random_uuid(), owner uuid, name text,
      pack_size int, mode text, config jsonb);
    create table trades (id uuid primary key default gen_random_uuid(), proposer uuid, recipient uuid, status text);
    create function cancel_trade(p uuid) returns void language sql as $$ select $$;
    create function respond_trade(p uuid, b boolean) returns void language sql as $$ select $$;
    create table market_listings (id uuid primary key default gen_random_uuid(), seller uuid, card_id text,
      foil boolean default false, quantity int default 1, listing_type text, price int, buyout int,
      current_bid int, current_bidder uuid, bid_count int default 0, status text default 'active',
      created_at timestamptz default now(), ends_at timestamptz);
    create function cancel_listing(p uuid) returns void language sql as $$
      update market_listings set status = 'cancelled' where id = p $$;
    create table player_shops (owner uuid primary key, status text default 'active');
    create function close_shop() returns void language sql as $$ select $$;
    create table shop_slots (id uuid primary key default gen_random_uuid(), owner uuid, status text default 'occupied');
    create table shop_listings (id uuid primary key default gen_random_uuid(), owner uuid references player_shops(owner),
      slot_id uuid, listing_type text, status text default 'active', cards jsonb, price int, reference_price int);
    create table shop_purchases (id uuid primary key default gen_random_uuid(), owner uuid);
    create function settle_shop_maintenance(p uuid) returns void language sql as $$ select $$;
    create function finalize_sale(p_listing market_listings, p_buyer uuid, p_amount int) returns void language sql as $$
      update profiles set credits = credits + (p_amount - ceil(p_amount * 0.05))::int where id = p_listing.seller $$;
    create table missions (id text primary key, name text, description text, stat_key text, target int,
      reward_credits int, reward_vouchers int, reward_bp_xp int, cadence text);
    create table achievements (id text primary key, name text, description text, category text, stat_key text,
      target int, reward_credits int, reward_vouchers int, reward_pack_id uuid, sort int);
    create table player_achievements (user_id uuid, achievement_id text, progress int, claimed boolean default false);
    create function grading_base_fee(t text) returns int language sql as $$ select 1 $$;
    create function grading_bulk_mult(t text, n int) returns int language sql as $$ select 1 $$;
    create function grading_grade_mult(n numeric) returns int language sql as $$ select 1 $$;
    create function grading_roll(t text) returns int language sql as $$ select 1 $$;
    create function grading_service_premium(t text) returns int language sql as $$ select 1 $$;
    create function grading_speed_mult(t text, s text) returns int language sql as $$ select 1 $$;
    create function grading_turnaround(t text) returns int language sql as $$ select 1 $$;
    create function grading_voucher_fee(n int) returns int language sql as $$ select 1 $$;
    -- live-only helper (no repo migration defines it), copied from production
    create function rarity_tier(p_rarity text) returns int language sql immutable as $$
      select case p_rarity when 'Common' then 1 when 'Uncommon' then 2 when 'Rare' then 3
        when 'Super-Rare' then 4 when 'Ultra-Rare' then 5 when 'Full-Art' then 6 when 'Alt-Art' then 7
        when 'Mythic' then 8 else 1 end $$;
    -- the live-only pre-catch-up state of the draw helpers
    create function random_card_of_rarity(p_rarity text) returns text language sql as $$ select id from cards limit 1 $$;
    create function random_card_of_rarity(p_rarity text, p_sets text[] default null) returns text language sql
      as $$ select id from cards limit 1 $$;
    create function random_leader_of_rarity(p_rarity text) returns text language sql as $$ select id from cards limit 1 $$;
    insert into profiles (id) values ('${A}'), ('${B}'), ('${C}');
    insert into auth.users (id) values ('${A}'), ('${B}'), ('${C}');
    insert into cards values ('c1','Common','Unit','V1',null), ('r1','Rare','Unit','V1',null),
      ('r2','Rare','Unit','V1',null), ('sr1','Super-Rare','Unit','V1',null), ('m1','Mythic','Unit','V1',null),
      ('L1','Mythic','Leader','V1',null);
  `);
  // What production had on 2026-10-08.
  for (const f of [
    '20260826000000_server_minted_match_tickets.sql',
    '20261006000000_economy_rebalance_and_slab_showcase.sql',
    '20261006000001_cpu_bidders_and_shop_customers.sql',
    '20261007000001_track_new_systems_and_missions.sql',
    '20261007000003_collection_bingo.sql',
  ])
    await db.exec(sql(f));

  // Rows the data migrations must carry over untouched.
  await db.exec(`
    insert into player_achievements values ('${A}','win_100',1,false), ('${A}','collector_150',150,true),
      ('${B}','collector_150',60,false);
    insert into market_listings (id, seller, card_id, listing_type, price, ends_at, cpu_ceiling, cpu_next_at)
      values ('aaaaaaaa-0000-0000-0000-000000000001','${B}','m1','auction',100, now() + interval '1 day', 777,
              now() + interval '30 minutes');
  `);

  for (const f of [CATCH_UP, TAPER, ANTI_FARM, CPU_STATE, SHOP_REF, BINGO_GUARD, CATALOG])
    await db.exec(sql(f));
}, 120_000);

describe('B1: catch-up of the drifted functions', () => {
  test('the four missing functions exist, and the ambiguous 1-arg draws are gone', async () => {
    const names = (
      await q(`select proname from pg_proc where pronamespace = 'public'::regnamespace
        and proname in ('reset_account','prune_match_tickets','rarity_is_known','rarity_is_deliverable')
        order by 1`)
    ).map((r) => r.proname);
    expect(names).toEqual([
      'prune_match_tickets',
      'rarity_is_deliverable',
      'rarity_is_known',
      'reset_account',
    ]);
    const draws = await q(`select proname, pronargs from pg_proc
      where proname in ('random_card_of_rarity','random_leader_of_rarity') order by 1`);
    expect(draws).toEqual([
      { proname: 'random_card_of_rarity', pronargs: 2 },
      { proname: 'random_leader_of_rarity', pronargs: 2 },
    ]);
  });

  test('re-running the catch-up is harmless', async () => {
    await db.exec(sql(CATCH_UP));
    await db.exec(sql(TAPER));
    expect(
      (await q(`select count(*)::int n from pg_proc where proname='reset_account'`))[0].n,
    ).toBe(1);
  });

  test('grants: nothing new is executable by anon/public, internal helpers are not client-callable', async () => {
    const internal = [
      'prune_match_tickets()',
      'rarity_is_known(text)',
      'rarity_is_deliverable(text)',
      'random_card_of_rarity(text, text[])',
      'random_leader_of_rarity(text, text[])',
      'stat_once_claim(uuid, text)',
      'run_cpu_bidders()',
      'spawn_shop_customers(uuid)',
      'track_decks()',
      'track_market_listings()',
    ];
    for (const sig of internal) {
      expect([sig, 'authenticated', await canExec('authenticated', sig)]).toEqual([
        sig,
        'authenticated',
        false,
      ]);
      expect([sig, 'anon', await canExec('anon', sig)]).toEqual([sig, 'anon', false]);
    }
    const client = [
      'reset_account()',
      'begin_match()',
      'record_match_result(boolean, uuid)',
      'create_mystery_template(text, integer, text, jsonb)',
      'claim_bingo(integer, date)',
    ];
    for (const sig of client) {
      expect([sig, 'authenticated', await canExec('authenticated', sig)]).toEqual([
        sig,
        'authenticated',
        true,
      ]);
      expect([sig, 'anon', await canExec('anon', sig)]).toEqual([sig, 'anon', false]);
    }
  });

  test('a guarantee of a rarity with no cards is refused (Alt-Art has none)', async () => {
    await db.exec(`insert into player_shops values ('${A}','active') on conflict do nothing`);
    await as(A);
    await expect(
      db.query(
        `select create_mystery_template('t', 5, 'simple',
          '{"rarity_weights":{"Common":1},"guarantees":[{"rarity":"Alt-Art","count":1}]}'::jsonb)`,
      ),
    ).rejects.toThrow(/No cards of that rarity exist yet/);
  });

  test('prune_match_tickets removes only tickets older than a week', async () => {
    await db.exec(`insert into match_tickets (uid, started_at) values
      ('${C}', now() - interval '9 days'), ('${C}', now() - interval '1 day')`);
    const [{ n }] = await q(`select prune_match_tickets() n`);
    expect(n).toBe(1);
    expect((await q(`select count(*)::int c from match_tickets where uid='${C}'`))[0].c).toBe(1);
    await db.exec(`delete from match_tickets where uid='${C}'`);
  });
});

describe('B2: reset_account and escrowed bids', () => {
  test('refuses while the caller is the high bidder on an active auction', async () => {
    const [{ id }] = await q(`insert into market_listings
      (seller, card_id, listing_type, price, current_bid, current_bidder, bid_count, ends_at)
      values ('${B}','m1','auction',100,49000,'${A}',1, now() + interval '1 day') returning id`);
    await db.exec(`update profiles set credits = 100 where id = '${A}'`);
    await as(A);
    await expect(q(`select reset_account()`)).rejects.toThrow(/highest bidder/);
    expect((await q(`select credits from profiles where id='${A}'`))[0].credits).toBe(100);
    // once outbid (and refunded) the reset goes through
    await db.exec(`update market_listings set current_bidder = '${C}' where id = '${id}'`);
    expect((await q(`select reset_account() r`))[0].r.ok).toBe(true);
    const [p] = await q(`select credits, vouchers from profiles where id='${A}'`);
    expect(p).toEqual({ credits: 1500, vouchers: 25 });
    await db.exec(`update market_listings set status='cancelled' where id='${id}'`);
  });

  test('still refuses a seller whose auction has a bid, and keeps the 7-day cooldown', async () => {
    await db.exec(`insert into market_listings
      (seller, card_id, listing_type, price, current_bid, current_bidder, bid_count, ends_at)
      values ('${C}','m1','auction',100,500,'${B}',1, now() + interval '1 day')`);
    await as(C);
    await expect(q(`select reset_account()`)).rejects.toThrow(/active auction with a bid/);
    await as(A);
    await expect(q(`select reset_account()`)).rejects.toThrow(/once every 7 days/);
    await db.exec(`delete from market_listings where seller = '${C}'`);
  });
});

describe('B4: match reward taper', () => {
  const play = async (uid: string, won: boolean) => {
    await as(uid);
    const [{ r }] = await q(`select begin_match() r`);
    await db.exec(
      `update match_tickets set started_at = now() - interval '2 minutes' where match_id='${r.match_id}'`,
    );
    return (await q(`select record_match_result(${won}, '${r.match_id}') r`))[0].r;
  };

  test('the first 15 wins a day pay in full, later ones pay a quarter and stop counting for achievements', async () => {
    await db.exec(`insert into match_tickets (uid, started_at, redeemed_at, won)
      select '${B}', now() - interval '3 hours', now() - interval '1 hour', true from generate_series(1,14)`);
    const full = await play(B, true); // the 15th
    expect(full).toMatchObject({ reward: 100, xp_gained: 60, reduced: false });
    expect(await stat('wins', B)).toBe(1);
    const reduced = await play(B, true); // the 16th
    expect(reduced).toMatchObject({ reward: 25, xp_gained: 15, reduced: true });
    expect(await stat('wins', B)).toBe(1);
    expect(await stat('games_played', B)).toBe(1);
    // the result keys the client reads are all still there
    for (const k of ['credits', 'wins', 'losses', 'xp', 'level', 'leveled_up', 'bp_xp_gained'])
      expect(reduced).toHaveProperty(k);
  });

  test('losses are tapered on their own count, so the first loss still pays in full', async () => {
    const loss = await play(B, false);
    expect(loss).toMatchObject({ reward: 40, reduced: false });
  });

  test('100 paid claims in 24 hours is the ceiling, and a capped ticket is not burnt', async () => {
    await db.exec(`insert into match_tickets (uid, started_at, redeemed_at, won)
      select '${C}', now() - interval '3 hours', now() - interval '1 hour', (g % 2 = 0)
        from generate_series(1,100) g`);
    await as(C);
    const [{ r }] = await q(`select begin_match() r`);
    await db.exec(
      `update match_tickets set started_at = now() - interval '2 minutes' where match_id='${r.match_id}'`,
    );
    expect((await q(`select record_match_result(true, '${r.match_id}') x`))[0].x).toEqual({
      status: 'capped',
    });
    expect(
      (
        await q(`select redeemed_at is null open from match_tickets where match_id='${r.match_id}'`)
      )[0].open,
    ).toBe(true);
  });
});

describe('B3: stat tracking is not farmable', () => {
  test('decks count when first legal, once per deck and once per UTC day', async () => {
    await q(`insert into decks (user_id, is_valid) values ('${A}', false)`); // draft
    expect(await stat('decks_built', A)).toBe(0);
    const [{ id }] = await q(
      `insert into decks (user_id, is_valid) values ('${A}', false) returning id`,
    );
    await q(`update decks set is_valid = true where id = '${id}'`); // becomes legal
    expect(await stat('decks_built', A)).toBe(1);
    await q(`update decks set is_valid = false where id = '${id}'`);
    await q(`update decks set is_valid = true where id = '${id}'`); // flip-flop: same deck
    expect(await stat('decks_built', A)).toBe(1);
    // save -> delete -> save again, all legal, same day
    for (let i = 0; i < 5; i++) {
      const [{ id: d }] = await q(
        `insert into decks (user_id, is_valid) values ('${A}', true) returning id`,
      );
      await q(`delete from decks where id = '${d}'`);
    }
    expect(await stat('decks_built', A)).toBe(1);
    // the next UTC day counts again
    await db.exec(`delete from stat_once where user_id = '${A}' and key like 'deckday:%'`);
    await q(`insert into decks (user_id, is_valid) values ('${A}', true)`);
    expect(await stat('decks_built', A)).toBe(2);
  });

  test('a listing counts when it sells or expires, never on creation or cancellation', async () => {
    const mk = async () =>
      (
        await q(`insert into market_listings (seller, card_id, listing_type, price, ends_at)
          values ('${B}','c1','fixed',5, now() + interval '1 day') returning id`)
      )[0].id as string;
    const before = await stat('listings_created', B);
    const cancelled = await mk();
    expect(await stat('listings_created', B)).toBe(before);
    await q(`update market_listings set status = 'cancelled' where id = '${cancelled}'`);
    expect(await stat('listings_created', B)).toBe(before);
    const sold = await mk();
    await q(`update market_listings set status = 'sold' where id = '${sold}'`);
    const expired = await mk();
    await q(`update market_listings set status = 'expired' where id = '${expired}'`);
    expect(await stat('listings_created', B)).toBe(before + 2);
    // a settled listing is not counted twice
    await q(`update market_listings set status = 'sold' where id = '${expired}'`);
    expect(await stat('listings_created', B)).toBe(before + 2);
  });

  test('bids count once per bidder per listing, so lead-change flip-flops earn nothing', async () => {
    const mk = async () =>
      (
        await q(`insert into market_listings (seller, card_id, listing_type, price, ends_at)
          values ('${B}','c1','auction',5, now() + interval '1 day') returning id`)
      )[0].id as string;
    const bid = (id: string, bidder: string | null) =>
      q(
        `update market_listings set bid_count = bid_count + 1, current_bidder = ${
          bidder ? `'${bidder}'` : 'null'
        } where id = '${id}'`,
      );
    const one = await mk();
    for (let i = 0; i < 4; i++) {
      await bid(one, A);
      await bid(one, C);
    }
    expect(await stat('bids_placed', A)).toBe(1);
    expect(await stat('bids_placed', C)).toBe(1);
    const two = await mk();
    await bid(two, A);
    expect(await stat('bids_placed', A)).toBe(2);
    await bid(two, null); // a CPU bid
    expect(await stat('bids_placed', C)).toBe(1);
  });

  test('the dedupe table is not readable by players', async () => {
    for (const role of ['anon', 'authenticated'])
      expect(
        (await q(`select has_table_privilege('${role}', 'stat_once', 'select') ok`))[0].ok,
      ).toBe(false);
  });
});

describe('B5 / B7: CPU bookkeeping is private and settling is cron-only', () => {
  test('an open auction keeps its ceiling, moved to the side table, and nothing is left on the listing', async () => {
    const [moved] = await q(
      `select cpu_ceiling, cpu_next_at is not null has_next from market_listing_cpu
        where listing_id = 'aaaaaaaa-0000-0000-0000-000000000001'`,
    );
    expect(moved).toEqual({ cpu_ceiling: 777, has_next: true });
    const [left] = await q(
      `select cpu_ceiling, cpu_next_at from market_listings where id = 'aaaaaaaa-0000-0000-0000-000000000001'`,
    );
    expect(left).toEqual({ cpu_ceiling: null, cpu_next_at: null });
  });

  test('the CPU still bids within its ceiling, yields to humans, counters, and pays out', async () => {
    const [{ id }] =
      await q(`insert into market_listings (seller, card_id, listing_type, price, ends_at)
      values ('${B}','m1','auction',100, now() + interval '1 hour') returning id`);
    await db.exec(
      `insert into market_listing_cpu (listing_id, cpu_ceiling) values ('${id}', 1000)`,
    );
    expect((await q(`select run_cpu_bidders() n`))[0].n).toBeGreaterThanOrEqual(1);
    let [l] = await q(`select * from market_listings where id = '${id}'`);
    expect(l.cpu_leading).toBe(true);
    expect(l.current_bid).toBeGreaterThanOrEqual(100);
    expect(l.current_bid).toBeLessThanOrEqual(1000);
    expect(l.cpu_ceiling).toBeNull(); // never written back to the listing
    expect(
      (
        await q(`select cpu_next_at > now() later from market_listing_cpu where listing_id='${id}'`)
      )[0].later,
    ).toBe(true);
    // a human outbid takes the lead; the CPU counters and refunds them
    await db.exec(`update profiles set credits = 5000 where id = '${C}'`);
    await q(
      `update market_listings set current_bid = current_bid + 50, current_bidder = '${C}' where id = '${id}'`,
    );
    await q(`update market_listing_cpu set cpu_next_at = null where listing_id = '${id}'`);
    const before = (await q(`select credits from profiles where id='${C}'`))[0].credits;
    await q(`select run_cpu_bidders()`);
    [l] = await q(`select * from market_listings where id = '${id}'`);
    expect(l.cpu_leading).toBe(true);
    expect((await q(`select credits from profiles where id='${C}'`))[0].credits).toBeGreaterThan(
      before,
    );
    // the cron job (superuser here) settles it: seller is paid bid - 5%
    const sellerBefore = (await q(`select credits from profiles where id='${B}'`))[0].credits;
    await q(`update market_listings set ends_at = now() - interval '1 second' where id = '${id}'`);
    await q(`select settle_expired_listings()`);
    [l] = await q(`select * from market_listings where id = '${id}'`);
    expect(l.status).toBe('sold');
    expect(
      (await q(`select credits from profiles where id='${B}'`))[0].credits - sellerBefore,
    ).toBe(l.current_bid - Math.ceil(l.current_bid * 0.05));
    // and the finished auction's bookkeeping is swept
    await q(`select run_cpu_bidders()`);
    expect(
      (await q(`select count(*)::int n from market_listing_cpu where listing_id='${id}'`))[0].n,
    ).toBe(0);
  });

  test('a fresh auction gets its ceiling computed into the side table; an over-priced one is ignored', async () => {
    const [{ id }] =
      await q(`insert into market_listings (seller, card_id, listing_type, price, ends_at)
      values ('${B}','r1','auction',20, now() + interval '1 hour') returning id`);
    const [{ id: pricey }] =
      await q(`insert into market_listings (seller, card_id, listing_type, price, ends_at)
      values ('${B}','r1','auction',41, now() + interval '1 hour') returning id`);
    await q(`select run_cpu_bidders()`);
    const side = async (i: string) =>
      (await q(`select cpu_ceiling from market_listing_cpu where listing_id='${i}'`))[0]
        ?.cpu_ceiling;
    expect(await side(id)).toBeGreaterThan(0);
    expect(await side(pricey)).toBe(0);
    expect(
      (await q(`select current_bid, cpu_ceiling from market_listings where id='${pricey}'`))[0],
    ).toEqual({ current_bid: null, cpu_ceiling: null });
  });

  test('players cannot read the side table or run the settle job', async () => {
    for (const role of ['anon', 'authenticated']) {
      expect(
        (await q(`select has_table_privilege('${role}', 'market_listing_cpu', 'select') ok`))[0].ok,
      ).toBe(false);
      expect(await canExec(role, 'settle_expired_listings()')).toBe(false);
    }
  });
});

describe('B6: Shop Floor customers', () => {
  const listing = async (
    owner: string,
    type: string,
    cards: unknown,
    price: number,
    ref: number,
  ) => {
    await db.exec(`insert into player_shops values ('${owner}','active') on conflict do nothing`);
    const [{ id: slot }] = await q(
      `insert into shop_slots (owner) values ('${owner}') returning id`,
    );
    return (
      await q(`insert into shop_listings (owner, slot_id, listing_type, cards, price, reference_price)
        values ('${owner}','${slot}','${type}','${JSON.stringify(cards)}',${price},${ref}) returning id`)
    )[0].id as string;
  };

  test('the CPU reference is raw quicksell, however high the blended market reference is', async () => {
    const id = await listing(
      A,
      'bundle',
      [{ card_id: 'r1', quantity: 2, foil: false }],
      1_000_000,
      999_999,
    );
    const ref = (
      await q(`select shop_listing_cpu_reference(l) r from shop_listings l where l.id='${id}'`)
    )[0].r;
    expect(ref).toBe(80); // 2 x Rare (40), not 2 x quicksell x 2
    await as(A);
    const c = (await q(`select get_shop_customers() r`))[0].r.customers[0];
    expect(c.kind).toBe('buy');
    expect(c.offer_credits).toBeLessThanOrEqual(Math.ceil(80 * 1.4));
  });

  test('trade offers never come from a higher rarity tier than the listing, and are foil only for foil listings', async () => {
    const plain = await listing(
      B,
      'individual',
      [{ card_id: 'r1', quantity: 1, foil: false }],
      500,
      5000,
    );
    const foil = await listing(
      C,
      'individual',
      [{ card_id: 'r1', quantity: 1, foil: true }],
      500,
      5000,
    );
    const tiers: Record<string, number> = { Common: 1, Rare: 3, 'Super-Rare': 4, Mythic: 8 };
    let trades = 0;
    for (const [owner, id, isFoil] of [
      [B, plain, false],
      [C, foil, true],
    ] as const) {
      for (let i = 0; i < 80; i++) {
        await db.exec(`delete from shop_customers where owner='${owner}';
          update player_shops set last_customer_at = null where owner='${owner}'`);
        await q(`select spawn_shop_customers('${owner}')`);
        const rows = await q(`select c.kind, c.offer_foil, k.rarity from shop_customers c
          left join cards k on k.id = c.offer_card_id where c.owner='${owner}' and c.listing_id='${id}'`);
        for (const r of rows.filter((x) => x.kind === 'trade')) {
          trades++;
          expect(tiers[r.rarity]).toBeLessThanOrEqual(tiers.Rare);
          if (!isFoil) expect(r.offer_foil).toBe(false);
        }
      }
    }
    expect(trades).toBeGreaterThan(10); // the 35% trade branch really was exercised
  });
});

describe('M9: claim_bingo can be pinned to a week', () => {
  const week = async () => (await q(`select bingo_week_start()::text w`))[0].w as string;

  test('get_bingo returns the week_start and resets_at the client echoes back', async () => {
    await as(A);
    const card = (await q(`select get_bingo() r`))[0].r;
    expect(card.week_start).toBe(await week());
    expect(new Date(card.resets_at).getTime()).toBeGreaterThan(Date.now());
  });

  test('a claim for a stale week is refused before anything is paid; the current week and null work', async () => {
    const cells = Array.from({ length: 25 }, (_, i) =>
      i === 12
        ? { kind: 'free', label: 'FREE' }
        : { kind: 'rar_ess', a: 'Rare', b: 'Tide', label: `c${i}` },
    );
    await db.exec(`update bingo_cards set cells = '${JSON.stringify(cells)}' where user_id='${A}';
      insert into cards values ('t1','Rare','Unit','V1',array['Tide']) on conflict do nothing;
      insert into player_cards values ('${A}','t1',1,0) on conflict do nothing`);
    const credits = async () =>
      (await q(`select credits from profiles where id='${A}'`))[0].credits;
    const start = await credits();
    await expect(q(`select claim_bingo(0, '2020-01-06')`)).rejects.toThrow(/Bingo card changed/);
    expect(await credits()).toBe(start);
    expect((await q(`select claim_bingo(0, '${await week()}') r`))[0].r.credits).toBe(120);
    expect((await q(`select claim_bingo(1) r`))[0].r.credits).toBe(120); // old call shape
    expect(await credits()).toBe(start + 240);
    expect(
      (await q(`select count(*)::int n from pg_proc where proname = 'claim_bingo'`))[0].n,
    ).toBe(1);
  });
});

describe('M11: catalogue cleanup', () => {
  test('the whole catalogue is in the migration, with unique titles', async () => {
    expect((await q(`select count(*)::int n from achievements`))[0].n).toBe(63);
    expect((await q(`select count(*)::int n from missions`))[0].n).toBe(28);
    const dup = await q(`select name, count(*)::int n from (
        select name from achievements union all select name from missions) t
      group by name having count(*) > 1`);
    expect(dup).toEqual([]);
  });

  test('duplicate payouts are retired, not deleted, and nobody loses progress or a claim', async () => {
    const rows = await q(`select id, reward_credits rc, reward_vouchers rv, sort from achievements
      where id in ('win_100','wins_100','collector_150','collection_150')`);
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.win_100).toMatchObject({ rc: 0, rv: 0 });
    expect(by.collector_150).toMatchObject({ rc: 0, rv: 0 });
    expect(by.wins_100.rc).toBe(5000);
    expect(by.collection_150.rc).toBe(4000);
    expect(by.win_100.sort).toBeGreaterThan(800);
    const held = await q(`select user_id, achievement_id, progress, claimed from player_achievements
      order by 1, 2`);
    expect(held).toEqual([
      { user_id: A, achievement_id: 'collector_150', progress: 150, claimed: true },
      { user_id: A, achievement_id: 'win_100', progress: 1, claimed: false },
      { user_id: B, achievement_id: 'collector_150', progress: 60, claimed: false },
    ]);
  });

  test('a harder objective for the same stat never pays less per unit', async () => {
    const m = Object.fromEntries(
      (await q(`select id, target, reward_credits rc, reward_bp_xp bp from missions`)).map((r) => [
        r.id,
        r,
      ]),
    );
    expect(m.d_win_2.rc).toBeGreaterThan(m.d_win_1.rc);
    expect(m.d_win_2.bp).toBeGreaterThanOrEqual(m.d_win_1.bp);
    expect(m.w_play_15.rc).toBeGreaterThan(m.w_games_10.rc);
    expect(m.w_play_15.bp).toBeGreaterThan(m.w_games_10.bp);
    const a = Object.fromEntries(
      (
        await q(
          `select id, target, reward_credits rc from achievements where stat_key = 'packs_opened'`,
        )
      ).map((r) => [r.id, r]),
    );
    expect(a.packs_50.rc / a.packs_50.target).toBeGreaterThanOrEqual(
      a.packs_25.rc / a.packs_25.target,
    );
  });

  test('re-applying changes nothing', async () => {
    const snap = async () =>
      JSON.stringify(await q(`select * from achievements order by id`)) +
      JSON.stringify(await q(`select * from missions order by id`));
    const before = await snap();
    await db.exec(sql(CATALOG));
    expect(await snap()).toBe(before);
  });
});
