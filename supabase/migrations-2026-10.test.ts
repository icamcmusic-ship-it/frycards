/**
 * Runs the 2026-10-06 migrations (economy rebalance, slab showcase, CPU
 * bidders, Shop Floor customers) against PGlite with minimal stubs of the live
 * tables they touch. Stubs mirror the live column lists; they are not a full
 * model of the schema.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';

const DIR = __dirname + '/migrations';
const sql = (f: string) => readFileSync(join(DIR, f), 'utf8');
const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

let db: PGlite;
const q = async (s: string) => (await db.query(s)).rows as any[];
const as = (uid: string) => db.exec(`set test.uid = '${uid}'`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table profiles (id uuid primary key, credits int default 0 check (credits >= 0), vouchers int default 0,
      xp int default 0, level int default 1, updated_at timestamptz, showcase_cards text[]);
    create table cards (id text primary key, rarity text, card_type text, set_name text default 'V1');
    create table pack_types (allowed_sets text[], is_active boolean, acquisition text);
    insert into pack_types values (array['V1'], true, 'purchase');
    create table player_cards (user_id uuid, card_id text, quantity int default 0, foil_quantity int default 0,
      primary key (user_id, card_id));
    create table graded_cards (id uuid primary key default gen_random_uuid(), user_id uuid, card_id text,
      foil boolean default false, service text default 'tca', grade numeric);
    create table market_listings (id uuid primary key default gen_random_uuid(), seller uuid, card_id text,
      foil boolean default false, quantity int default 1, listing_type text, price int, buyout int,
      current_bid int, current_bidder uuid, bid_count int default 0, status text default 'active',
      created_at timestamptz default now(), ends_at timestamptz);
    create table player_shops (owner uuid primary key, status text default 'active');
    create table shop_slots (id uuid primary key default gen_random_uuid(), owner uuid, status text default 'occupied');
    create table shop_listings (id uuid primary key default gen_random_uuid(), owner uuid references player_shops(owner),
      slot_id uuid, listing_type text, status text default 'active', cards jsonb, price int, reference_price int);
    create table stats (uid uuid, key text, n int);
    create function track_stat(p_uid uuid, p_key text, p_n int, p_abs boolean) returns void language sql
      as $$ insert into stats values (p_uid, p_key, p_n) $$;
    create function settle_shop_maintenance(p uuid) returns void language sql as $$ select $$;
    create function finalize_sale(p_listing market_listings, p_buyer uuid, p_amount int) returns void language sql as $$
      update profiles set credits = credits + (p_amount - ceil(p_amount * 0.05))::int where id = p_listing.seller $$;
    insert into profiles (id, xp, level) values ('${A}', 4500, 10), ('${B}', 0, 1);
    insert into cards values ('c1','Common','Unit'), ('r1','Rare','Unit'), ('r2','Rare','Unit'),
      ('m1','Mythic','Unit'), ('L1','Mythic','Leader');
  `);
  await db.exec(sql('20261006000000_economy_rebalance_and_slab_showcase.sql'));
  await db.exec(sql('20261006000001_cpu_bidders_and_shop_customers.sql'));
}, 60_000);

describe('economy rebalance', () => {
  test('quicksell table and level curve', async () => {
    const [r] =
      await q(`select card_sell_price('Mythic') m, card_sell_price('Rare') r, card_sell_price(null) c,
      xp_for_level(10) x10, level_for_xp(1800) l10, level_for_xp(1799) l9, shop_unlock_level() u`);
    expect(r).toEqual({ m: 1500, r: 40, c: 4, x10: 1800, l10: 10, l9: 9, u: 20 });
  });
  test('existing players are re-levelled and paid the skipped levels', async () => {
    // 4500 XP was level 10 on 50·L·(L-1); on 20·L·(L-1) it is level 15.
    const [a] = await q(`select level, credits, vouchers from profiles where id = '${A}'`);
    expect(a).toEqual({ level: 15, credits: 5 * 75, vouchers: 10 });
  });
});

describe('slab showcase', () => {
  test('only own graded slabs, max 3, pruned on delete', async () => {
    const [{ id: mine }] = await q(
      `insert into graded_cards (user_id, card_id, grade) values ('${A}','m1',9.5) returning id`,
    );
    const [{ id: theirs }] = await q(
      `insert into graded_cards (user_id, card_id, grade) values ('${B}','m1',9) returning id`,
    );
    await as(A);
    await expect(q(`select set_showcase_slabs(array['${theirs}']::uuid[])`)).rejects.toThrow(
      /own graded/,
    );
    await q(`select set_showcase_slabs(array['${mine}']::uuid[])`);
    expect((await q(`select count(*)::int n from get_showcase_slabs('${A}')`))[0].n).toBe(1);
    await q(`delete from graded_cards where id = '${mine}'`);
    expect(
      (await q(`select showcase_slabs from profiles where id = '${A}'`))[0].showcase_slabs,
    ).toEqual([]);
  });
});

describe('CPU bidders', () => {
  test('bids within the ceiling, yields to humans, and pays out when it wins', async () => {
    const [{ id }] =
      await q(`insert into market_listings (seller, card_id, listing_type, price, ends_at)
      values ('${B}','m1','auction',100, now() + interval '1 hour') returning id`);
    await q(`update market_listings set cpu_ceiling = 1000 where id = '${id}'`);
    expect((await q(`select run_cpu_bidders() n`))[0].n).toBeGreaterThanOrEqual(1);
    let [l] = await q(`select * from market_listings where id = '${id}'`);
    expect(l.cpu_leading).toBe(true);
    expect(l.current_bidder).toBeNull();
    expect(l.current_bid).toBeGreaterThanOrEqual(100);
    expect(l.current_bid).toBeLessThanOrEqual(1000);
    // a human outbid takes the lead
    await q(
      `update market_listings set current_bid = current_bid + 50, current_bidder = '${A}' where id = '${id}'`,
    );
    [l] = await q(`select * from market_listings where id = '${id}'`);
    expect(l.cpu_leading).toBe(false);
    // the CPU counters, refunding the human
    const before = (await q(`select credits from profiles where id = '${A}'`))[0].credits;
    await q(`update market_listings set cpu_next_at = null where id = '${id}'`);
    await q(`select run_cpu_bidders()`);
    [l] = await q(`select * from market_listings where id = '${id}'`);
    expect(l.cpu_leading).toBe(true);
    expect((await q(`select credits from profiles where id = '${A}'`))[0].credits).toBeGreaterThan(
      before,
    );
    // end it: seller is paid bid - 5%
    const sellerBefore = (await q(`select credits from profiles where id = '${B}'`))[0].credits;
    await q(`update market_listings set ends_at = now() - interval '1 second' where id = '${id}'`);
    await q(`select settle_expired_listings()`);
    [l] = await q(`select * from market_listings where id = '${id}'`);
    expect(l.status).toBe('sold');
    const seller = (await q(`select credits from profiles where id = '${B}'`))[0].credits;
    expect(seller - sellerBefore).toBe(l.current_bid - Math.ceil(l.current_bid * 0.05));
  });
  test('the ceiling is seeded per seller/card/day, so relisting cannot reroll it', async () => {
    const [r] = await q(
      `select cpu_ceiling_factor('a|m1|false|2026-10-06') x, cpu_ceiling_factor('a|m1|false|2026-10-06') y`,
    );
    expect(r.x).toBe(r.y);
  });
  test('ignores auctions opening above quicksell', async () => {
    const [{ id }] =
      await q(`insert into market_listings (seller, card_id, listing_type, price, ends_at)
      values ('${B}','r1','auction',41, now() + interval '1 hour') returning id`);
    await q(`select run_cpu_bidders()`);
    const [l] = await q(`select cpu_ceiling, current_bid from market_listings where id = '${id}'`);
    expect(l).toEqual({ cpu_ceiling: 0, current_bid: null });
  });
  test('the 8-a-day cap also holds at payout', async () => {
    const S = '33333333-3333-3333-3333-333333333333';
    await q(`insert into profiles (id) values ('${S}')`);
    for (let i = 0; i < 8; i++)
      await q(`insert into market_listings (seller, card_id, listing_type, price, status, current_bid, cpu_bidder_name, ends_at)
        values ('${S}','c1','auction',1,'sold',1,'Bot', now())`);
    await q(`insert into market_listings (seller, card_id, listing_type, price, current_bid, cpu_leading, cpu_bidder_name, ends_at)
      values ('${S}','m1','auction',1,500,true,'Bot', now() - interval '1 second')`);
    await q(`select settle_expired_listings()`);
    expect((await q(`select credits from profiles where id = '${S}'`))[0].credits).toBe(0);
    expect(
      (await q(`select quantity from player_cards where user_id = '${S}' and card_id = 'm1'`))[0]
        .quantity,
    ).toBe(1);
  });
  test('never bids past its ceiling', async () => {
    const [{ id }] =
      await q(`insert into market_listings (seller, card_id, listing_type, price, ends_at, cpu_ceiling)
      values ('${B}','c1','auction',500, now() + interval '1 hour', 10) returning id`);
    await q(`select run_cpu_bidders()`);
    expect(
      (await q(`select current_bid from market_listings where id = '${id}'`))[0].current_bid,
    ).toBeNull();
  });
});

describe('Shop Floor customers', () => {
  test('a customer arrives, offers at most the asking price, and buying pays the owner', async () => {
    await q(`insert into player_shops (owner) values ('${A}')`);
    const [{ id: slot }] = await q(`insert into shop_slots (owner) values ('${A}') returning id`);
    await q(`insert into shop_listings (owner, slot_id, listing_type, cards, price, reference_price)
      values ('${A}', '${slot}', 'bundle', '[{"card_id":"r1","quantity":2,"foil":false}]', 1000000, 999999)`);
    await as(A);
    const res = (await q(`select get_shop_customers() r`))[0].r;
    expect(res.customers).toHaveLength(1);
    const c = res.customers[0];
    expect(c.kind).toBe('buy'); // bundles never get trade offers
    // reference is capped at 2x quicksell (2 Rares = 80cr -> 160cr), so even a
    // 1,000,000cr price and a pumped reference pay at most 1.4 x 160.
    expect(c.offer_credits).toBeLessThanOrEqual(Math.ceil(160 * 1.4));
    const before = (await q(`select credits from profiles where id = '${A}'`))[0].credits;
    const out = (await q(`select respond_shop_customer('${c.id}', 'accept') r`))[0].r;
    expect(out.result).toBe('sold');
    const after = (await q(`select credits from profiles where id = '${A}'`))[0].credits;
    expect(after - before).toBe(c.offer_credits);
    expect((await q(`select status from shop_slots where id = '${slot}'`))[0].status).toBe('empty');
    // no second customer until 90 minutes pass
    expect((await q(`select get_shop_customers() r`))[0].r.customers).toHaveLength(0);
  });
  test('haggling once: within the walk-away price sells, a second haggle is refused', async () => {
    const [{ id: slot }] = await q(`insert into shop_slots (owner) values ('${A}') returning id`);
    const [{ id: lid }] =
      await q(`insert into shop_listings (owner, slot_id, listing_type, cards, price, reference_price)
      values ('${A}', '${slot}', 'bundle', '[{"card_id":"m1","quantity":1},{"card_id":"r1","quantity":1}]', 5000, 1540) returning id`);
    const [{ id: cid }] =
      await q(`insert into shop_customers (owner, listing_id, kind, persona, mood, offer_credits, walkaway_credits)
      values ('${A}', '${lid}', 'buy', 'Test', 'browsing', 1000, 1100) returning id`);
    await expect(q(`select respond_shop_customer('${cid}', 'counter', 900)`)).rejects.toThrow(
      /more than their/,
    );
    const r = (await q(`select respond_shop_customer('${cid}', 'counter', 1100) r`))[0].r;
    expect(r).toMatchObject({ result: 'sold', credits: 1100 });
    await expect(q(`select respond_shop_customer('${cid}', 'counter', 1100)`)).rejects.toThrow(
      /already left/,
    );
  });
});
