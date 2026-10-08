/** The 2026-10-07 stat-tracking triggers and mission/achievement seeds, on PGlite. */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, expect, test } from 'vitest';

const U = '11111111-1111-1111-1111-111111111111';
const V = '22222222-2222-2222-2222-222222222222';
let db: PGlite;
const q = async (s: string) => (await db.query(s)).rows as any[];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create table stats (uid uuid, key text, n int);
    create function track_stat(p_uid uuid, p_key text, p_n int, p_abs boolean) returns void language sql
      as $$ insert into stats values (p_uid, p_key, p_n) $$;
    create table graded_cards (id uuid primary key default gen_random_uuid(), user_id uuid, grade numeric);
    create table decks (id uuid primary key default gen_random_uuid(), user_id uuid);
    create table market_listings (id uuid primary key default gen_random_uuid(), seller uuid,
      current_bidder uuid, bid_count int default 0);
    create table shop_purchases (id uuid primary key default gen_random_uuid(), owner uuid);
    create table missions (id text primary key, name text, description text, stat_key text, target int,
      reward_credits int, reward_vouchers int, reward_bp_xp int, cadence text);
    create table achievements (id text primary key, name text, description text, category text, stat_key text,
      target int, reward_credits int, reward_vouchers int, reward_pack_id uuid, sort int);
  `);
  await db.exec(
    readFileSync(
      join(__dirname, 'migrations/20261007000001_track_new_systems_and_missions.sql'),
      'utf8',
    ),
  );
}, 60_000);

const count = async (key: string, uid = U) =>
  (await q(`select coalesce(sum(n),0)::int n from stats where key='${key}' and uid='${uid}'`))[0].n;

test('grading: submit, then a 10 counts as both mint and gem mint; a 7 as neither', async () => {
  const [{ id }] = await q(`insert into graded_cards (user_id) values ('${U}') returning id`);
  const [{ id: low }] = await q(`insert into graded_cards (user_id) values ('${U}') returning id`);
  await q(`update graded_cards set grade = 10 where id = '${id}'`);
  await q(`update graded_cards set grade = 7 where id = '${low}'`);
  expect(await count('cards_graded')).toBe(2);
  expect(await count('slabs_mint')).toBe(1);
  expect(await count('gem_mints')).toBe(1);
});

test('decks, listings, human bids (not CPU bids) and shop sales are tracked', async () => {
  await q(`insert into decks (user_id) values ('${U}')`);
  const [{ id }] = await q(`insert into market_listings (seller) values ('${U}') returning id`);
  await q(`update market_listings set bid_count = 1, current_bidder = '${V}' where id = '${id}'`);
  await q(`update market_listings set bid_count = 2, current_bidder = null where id = '${id}'`); // CPU
  await q(`insert into shop_purchases (owner) values ('${U}')`);
  expect(await count('decks_built')).toBe(1);
  expect(await count('listings_created')).toBe(1);
  expect(await count('bids_placed', V)).toBe(1);
  expect(await count('shop_sales')).toBe(1);
});

test('seeds land and are idempotent', async () => {
  const before = (await q(`select count(*)::int n from achievements`))[0].n;
  await db.exec(
    readFileSync(
      join(__dirname, 'migrations/20261007000001_track_new_systems_and_missions.sql'),
      'utf8',
    ),
  );
  expect((await q(`select count(*)::int n from achievements`))[0].n).toBe(before);
  expect((await q(`select count(*)::int n from missions`))[0].n).toBe(10);
  expect(before).toBe(19);
});
