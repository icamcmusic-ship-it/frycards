/**
 * 20261012000009 against PGlite: insurance at 25%, and slabs in player shops —
 * escrow, release on cancel/close, transfer on purchase, retire on a CPU
 * customer sale, CPU pricing from the slab's value with the favourite bump,
 * and shop_sales only from CPU customers.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const MIG = [
  '20261012000006_grading_redesign.sql',
  '20261012000093_pending_grading_rpcs.sql',
  '20261012000007_grading_market_insurance.sql',
  '20261012000009_insurance_25_and_shop_slabs.sql',
]
  .map((f) => readFileSync(join(__dirname, 'migrations', f), 'utf8'))
  .join('\n');

let db: PGlite;
const q = async (s: string, p: unknown[] = []) => (await db.query(s, p)).rows as any[];
const as = async (uid: string, s: string) => {
  await db.exec(`select set_config('test.uid', '${uid}', false)`);
  return q(s);
};
const stat = async (uid: string, key: string) =>
  (
    await q(`select coalesce(sum(n), 0)::int n from stats where uid = $1 and key = $2`, [uid, key])
  )[0].n as number;
const slab = (uid: string, grade = 9, service = 'tca') =>
  q(
    `insert into graded_cards (user_id, card_id, service, speed, fee_paid, ready_at, grade)
     values ($1, 'm1', $2, 'standard', 400, now(), $3) returning id`,
    [uid, service, grade],
  ).then((r) => r[0].id as string);
const slot = (uid: string) =>
  q(`insert into shop_slots (owner, slot_index) values ($1, 1) returning id`, [uid]).then(
    (r) => r[0].id as string,
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table cards (id text primary key, name text, card_type text, rarity text, essence_types text[]);
    create table profiles (id uuid primary key, credits int default 0, vouchers int default 0,
      updated_at timestamptz, showcase_slabs uuid[] default '{}');
    create table player_cards (user_id uuid, card_id text, quantity int default 0, foil_quantity int default 0,
      primary key (user_id, card_id));
    create table decks (user_id uuid, leader_id text, card_ids text[]);
    create table player_serialized_cards (user_id uuid, card_id text);
    create table graded_cards (id uuid primary key default gen_random_uuid(), user_id uuid not null, card_id text,
      foil boolean default false, service text, speed text, fee_paid int,
      submitted_at timestamptz default now(), ready_at timestamptz, grade numeric, revealed_at timestamptz);
    create table stats (uid uuid, key text, n int);
    create table stat_once (user_id uuid, key text, primary key (user_id, key));
    create function stat_once_claim(p_uid uuid, p_key text) returns boolean language plpgsql as $$
      begin insert into stat_once values (p_uid, p_key) on conflict do nothing; return found; end $$;
    create function track_stat(p_uid uuid, p_key text, p_n int, p_abs boolean) returns void language sql
      as $$ insert into stats values (p_uid, p_key, p_n) $$;
    create function prune_showcase_slab() returns trigger language plpgsql as $$
    begin
      update profiles set showcase_slabs = array_remove(showcase_slabs, old.id)
       where id = old.user_id and old.id = any(showcase_slabs);
      return old;
    end $$;
    create trigger graded_cards_prune_showcase_owner after update of user_id on graded_cards
      for each row when (old.user_id is distinct from new.user_id) execute function prune_showcase_slab();
    create function card_sell_price(p text) returns int language sql immutable as $$
      select case p when 'Mythic' then 1500 else 4 end $$;
    create function grading_speed_mult(s text, p text) returns numeric language sql immutable as $$ select 1.0 $$;
    create function grading_bulk_mult(s text, c int) returns numeric language sql immutable as $$ select 1.0 $$;
    create function grading_turnaround(p text) returns interval language sql immutable as $$ select interval '0' $$;
    create function grading_voucher_fee(c int) returns int language sql immutable as $$ select greatest(1, ceil(c / 100.0)::int) $$;
    create function grading_grade_mult(g numeric) returns numeric language sql immutable as $$
      select case when g >= 10 then 12.0 when g >= 9 then 4.5 else 2.0 end $$;
    create table market_listings (id uuid primary key default gen_random_uuid(), seller uuid, card_id text,
      foil boolean, quantity int, listing_type text, price int, buyout int, current_bid int, current_bidder uuid,
      bid_count int default 0, status text default 'active', created_at timestamptz default now(),
      ends_at timestamptz, cpu_leading boolean default false, cpu_bidder_name text);
    create table market_listing_cpu (listing_id uuid primary key, cpu_ceiling int, cpu_next_at timestamptz);
    create function cpu_persona_name() returns text language sql as $$ select 'The Appraiser' $$;
    create function cpu_ceiling_factor(p text) returns numeric language sql immutable as $$ select 1.0 $$;
    create function run_cpu_bidders() returns int language sql as $$ select 0 $$;
    create function finalize_sale(p market_listings, b uuid, a int) returns void language sql as $$ select $$;
    create table missions (id text primary key, name text, description text, stat_key text, target int,
      reward_credits int default 0, reward_vouchers int default 0, reward_bp_xp int default 0, cadence text, pool text);
    create table achievements (id text primary key, name text, description text, category text, stat_key text,
      target int, reward_credits int default 0, reward_vouchers int default 0, reward_pack_id uuid, sort int);
    create table player_shops (owner uuid primary key, status text default 'active', last_customer_at timestamptz);
    create table shop_slots (id uuid primary key default gen_random_uuid(), owner uuid, slot_index int,
      collateral int default 0, status text default 'empty');
    create table shop_listings (id uuid primary key default gen_random_uuid(), owner uuid, slot_id uuid,
      listing_type text, status text default 'active', cards jsonb, price int, reference_price int,
      template_id uuid, created_at timestamptz default now());
    create table shop_purchases (id uuid primary key default gen_random_uuid(), owner uuid, buyer uuid,
      listing_id uuid, listing_type text, price int, reference_price int, cards jsonb);
    create table shop_customers (id uuid primary key default gen_random_uuid(), owner uuid, listing_id uuid,
      kind text, persona text, mood text, offer_credits int, walkaway_credits int, offer_card_id text,
      offer_foil boolean, haggled boolean default false, status text default 'waiting', final_credits int,
      created_at timestamptz default now(), expires_at timestamptz default now() + interval '1 hour',
      resolved_at timestamptz);
    create table shop_mystery_pool (listing_id uuid, card_id text, foil boolean, remaining int);
    create function settle_shop_maintenance(p uuid) returns void language sql as $$ select $$;
    create function shop_listing_cpu_reference(p shop_listings) returns int language sql as $$ select 10 $$;
    create function rarity_tier(r text) returns int language sql as $$ select 1 $$;
    create table pack_types (allowed_sets text[], is_active boolean, acquisition text);
    insert into profiles (id, credits) values ('${A}', 100000), ('${B}', 100000);
    insert into player_shops (owner) values ('${A}');
    insert into cards values ('m1', 'm1', 'Unit', 'Mythic', '{Void}');
  `);
  await db.exec(MIG);
  await db.exec(MIG);
}, 60_000);

describe('insurance at 25% and slabs in player shops (20261012000009)', () => {
  test('insurance premium is 25% of the fee', async () => {
    expect(Number((await q(`select grading_insurance_rate() r`))[0].r)).toBe(0.25);
  });

  test('stock, escrow, cancel releases, buy transfers', async () => {
    const id = await slab(A);
    await q(`update profiles set showcase_slabs = array['${id}'::uuid] where id = '${A}'`);
    const s = await slot(A);
    const r = (await as(A, `select create_shop_slab_listing('${s}', '${id}', 9999) r`))[0].r;
    expect(r.reference_price).toBe(Math.ceil(1500 * 4.5 * 1.6));
    await expect(as(A, `select crack_graded_slab('${id}')`)).rejects.toThrow(/listed/);
    await expect(as(A, `select create_slab_listing('${id}', 'fixed', 10)`)).rejects.toThrow(
      /already listed/,
    );
    // Any exit (cancel, close_shop, a fraud strike) ends the listing like this.
    await q(`update shop_listings set status = 'cancelled' where id = '${r.listing_id}'`);
    expect(
      (await q(`select listing_id from graded_cards where id = '${id}'`))[0].listing_id,
    ).toBeNull();
    expect((await q(`select count(*)::int n from player_cards`))[0].n).toBe(0); // no raw card back

    await q(`update shop_slots set status = 'empty' where id = '${s}'`);
    const r2 = (await as(A, `select create_shop_slab_listing('${s}', '${id}', 5000) r`))[0].r;
    await as(B, `select buy_shop_listing('${r2.listing_id}')`);
    const row = (await q(`select user_id, listing_id from graded_cards where id = '${id}'`))[0];
    expect(row).toEqual({ user_id: B, listing_id: null });
    expect(
      (await q(`select showcase_slabs from profiles where id = '${A}'`))[0].showcase_slabs,
    ).toEqual([]);
    expect(await stat(A, 'shop_sales')).toBe(0); // player-to-player: not farm-safe
  });

  test('CPU customer: priced from the slab value with the favourite bump; sale retires', async () => {
    const id = await slab(A, 9, 'amg');
    const s = await slot(A);
    const r = (await as(A, `select create_shop_slab_listing('${s}', '${id}', 100000) r`))[0].r;
    await q(`update player_shops set last_customer_at = null where owner = '${A}'`);
    await q(`select spawn_shop_customers('${A}')`);
    const c = (await q(`select * from shop_customers where listing_id = '${r.listing_id}'`))[0];
    expect(c.kind).toBe('buy');
    const fav = (await q(`select grading_persona_favourite('The Appraiser') f`))[0].f;
    const ref = Math.round(Math.ceil(1500 * 4.5 * 1.3) * (fav === 'amg' ? 1.2 : 1));
    expect(c.offer_credits).toBeGreaterThanOrEqual(Math.round(ref * 0.55));
    expect(c.offer_credits).toBeLessThanOrEqual(Math.round(ref * 1.4) + 1);
    await as(A, `select respond_shop_customer('${c.id}', 'accept')`);
    expect((await q(`select retired from graded_cards where id = '${id}'`))[0].retired).toBe(true);
    expect(await stat(A, 'shop_sales')).toBe(1);
    expect(await stat(A, 'shop_slab_sales')).toBe(1);
  });
});
