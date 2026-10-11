/**
 * 20261014000200 against PGlite: create_listings_many (one call, per-lot
 * sub-transactions, 10-lot cap), update_listing_price (fixed only, seller
 * only) and get_sell_price_guide (recent sold, lowest live, market).
 * The single-listing RPCs are stubbed: their own checks are covered elsewhere;
 * here we only need one that succeeds and one that raises after escrowing.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const MIG = readFileSync(join(__dirname, 'migrations', '20261014000200_sell_flow.sql'), 'utf8');

let db: PGlite;
const q = async (s: string, p: unknown[] = []) => (await db.query(s, p)).rows as any[];
const as = async (uid: string, s: string, p: unknown[] = []) => {
  await db.exec(`select set_config('test.uid', '${uid}', false)`);
  return q(s, p);
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table market_listings (id uuid primary key default gen_random_uuid(), seller uuid, card_id text,
      foil boolean default false, variant text, quantity int default 1, listing_type text, price int,
      buyout int, current_bid int, status text default 'active', ends_at timestamptz default now() + interval '1 day',
      graded_id uuid, slab_grade numeric, slab_service text, slab_pristine boolean default false);
    create table stock (card_id text primary key, n int);
    create function create_listing(p_card_id text, p_foil boolean, p_quantity int, p_type text, p_price int,
      p_buyout int default null, p_hours int default 24) returns jsonb language plpgsql as $$
      declare v_id uuid;
      begin
        update stock set n = n - p_quantity where card_id = p_card_id;
        if (select n from stock where card_id = p_card_id) < 0 then raise exception 'Not enough copies'; end if;
        if p_price > 1000000 then raise exception 'Invalid price'; end if;
        insert into market_listings (seller, card_id, foil, quantity, listing_type, price, buyout)
          values (auth.uid(), p_card_id, p_foil, p_quantity, p_type, p_price, p_buyout) returning id into v_id;
        return jsonb_build_object('ok', true, 'listing_id', v_id, 'ends_at', now());
      end $$;
    create function create_variant_listing(p_card_id text, p_foil boolean, p_variant text, p_quantity int,
      p_type text, p_price int, p_buyout int default null, p_hours int default 24) returns jsonb language plpgsql as $$
      declare v_res jsonb;
      begin
        v_res := create_listing(p_card_id, p_foil, p_quantity, p_type, p_price, p_buyout, p_hours);
        update market_listings set variant = p_variant where id = (v_res->>'listing_id')::uuid;
        return v_res;
      end $$;
    create function create_slab_listing(p_graded_id uuid, p_type text, p_price int, p_buyout int default null,
      p_hours int default 24) returns jsonb language plpgsql as $$
      declare v_id uuid;
      begin
        insert into market_listings (seller, card_id, listing_type, price, graded_id, slab_grade, slab_service)
          values (auth.uid(), 'slabbed', p_type, p_price, p_graded_id, 9, 'tca') returning id into v_id;
        return jsonb_build_object('ok', true, 'listing_id', v_id, 'ends_at', now());
      end $$;
    create function card_blended_reference(p_card_id text, p_foil boolean) returns int language sql as $$
      select case when p_foil then 250 else 100 end $$;
    create function variant_mult(p_variant text) returns numeric language sql as $$ select 3::numeric $$;
    create function grading_slab_reference(p_card_id text, p_foil boolean, p_grade numeric, p_service text,
      p_pristine boolean) returns int language sql as $$ select 900 $$;
    create function get_slab_market_value(p_card_id text, p_grade numeric, p_service text, p_foil boolean,
      p_pristine boolean) returns jsonb language sql as $$ select jsonb_build_object('avg_price', null) $$;
  `);
  await db.exec(MIG);
});

beforeEach(async () => {
  await db.exec(`truncate market_listings; truncate stock;
    insert into stock values ('c1', 3), ('c2', 1);`);
});

const many = async (items: unknown[]) =>
  (await as(A, `select create_listings_many($1::jsonb) r`, [JSON.stringify(items)]))[0].r.results;

describe('create_listings_many', () => {
  test('lists every lot in one call, routing cards, variants and slabs', async () => {
    const r = await many([
      { card_id: 'c1', foil: false, quantity: 2, type: 'fixed', price: 120 },
      {
        card_id: 'c2',
        foil: false,
        variant: 'ember',
        quantity: 1,
        type: 'auction',
        price: 50,
        buyout: 90,
      },
      { graded_id: '33333333-3333-3333-3333-333333333333', type: 'fixed', price: 900 },
    ]);
    expect(r.map((x: any) => x.ok)).toEqual([true, true, true]);
    const rows = await q(
      `select card_id, variant, graded_id is not null as slab from market_listings order by price`,
    );
    expect(rows).toHaveLength(3);
    expect(rows.find((x) => x.card_id === 'c2').variant).toBe('ember');
    expect(rows.some((x) => x.slab)).toBe(true);
  });

  test('a failing lot rolls back alone and reports why', async () => {
    const r = await many([
      { card_id: 'c2', foil: false, quantity: 1, type: 'fixed', price: 10 },
      { card_id: 'c1', foil: false, quantity: 5, type: 'fixed', price: 10 },
      { card_id: 'c1', foil: false, quantity: 1, type: 'fixed', price: 10 },
    ]);
    expect(r[1]).toMatchObject({ ok: false, error: 'Not enough copies' });
    expect(r[0].ok && r[2].ok).toBe(true);
    // the failed lot's escrow was undone; only the good c1 lot took a copy
    expect((await q(`select n from stock where card_id = 'c1'`))[0].n).toBe(2);
  });

  test('refuses more than 10 lots, an empty batch, and anonymous callers', async () => {
    const lot = { card_id: 'c1', quantity: 1, type: 'fixed', price: 1 };
    await expect(many(Array(11).fill(lot))).rejects.toThrow(/At most 10/);
    await expect(many([])).rejects.toThrow(/Nothing to list/);
    await expect(as('', `select create_listings_many('[{}]'::jsonb)`)).rejects.toThrow(
      /Not authenticated/,
    );
  });
});

describe('update_listing_price', () => {
  test('re-prices the seller’s own fixed listing only', async () => {
    const [fixed] = await q(
      `insert into market_listings (seller, card_id, listing_type, price) values ($1,'c1','fixed',100) returning id`,
      [A],
    );
    const [auc] = await q(
      `insert into market_listings (seller, card_id, listing_type, price) values ($1,'c1','auction',100) returning id`,
      [A],
    );
    await as(A, `select update_listing_price($1, 150)`, [fixed.id]);
    expect((await q(`select price from market_listings where id = $1`, [fixed.id]))[0].price).toBe(
      150,
    );
    await expect(as(A, `select update_listing_price($1, 150)`, [auc.id])).rejects.toThrow(
      /Only fixed-price/,
    );
    await expect(as(B, `select update_listing_price($1, 1)`, [fixed.id])).rejects.toThrow(
      /Listing not found/,
    );
    await expect(as(A, `select update_listing_price($1, 0)`, [fixed.id])).rejects.toThrow(
      /Invalid price/,
    );
  });
});

describe('get_sell_price_guide', () => {
  test('market, recent sold unit prices and the lowest live buy-now price per lot', async () => {
    await db.exec(`
      insert into market_listings (seller, card_id, quantity, listing_type, price, current_bid, status, ends_at) values
        ('${B}', 'c1', 2, 'fixed', 300, 300, 'sold', now() - interval '1 hour'),
        ('${B}', 'c1', 1, 'auction', 50, 140, 'sold', now() - interval '2 hour');
      insert into market_listings (seller, card_id, quantity, listing_type, price, buyout) values
        ('${B}', 'c1', 1, 'fixed', 130, null),
        ('${B}', 'c1', 2, 'auction', 10, 220),
        ('${B}', 'c1', 1, 'auction', 10, null);
      insert into market_listings (seller, card_id, foil, listing_type, price) values ('${B}', 'c1', true, 'fixed', 5);
    `);
    const [r] = await as(A, `select get_sell_price_guide($1::jsonb) r`, [
      JSON.stringify([
        { card_id: 'c1', foil: false },
        { card_id: 'c1', foil: false, variant: 'ember' },
        { card_id: 'c1', foil: false, grade: 9, service: 'tca' },
      ]),
    ]);
    const [plain, variant, slab] = r.r;
    expect(plain.market).toBe(100);
    expect(plain.recent.map((x: any) => x.price)).toEqual([150, 140]);
    expect(plain.lowest_active).toBe(110);
    expect(plain.active_count).toBe(3);
    expect(variant).toMatchObject({ market: 300, lowest_active: null, active_count: 0 });
    expect(slab.market).toBe(900);
  });
});
