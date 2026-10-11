/**
 * 20261013000010 card variants against PGlite: the variant roll respects its
 * odds and colour pairing, the shadow ledger can't be eaten by plain moves,
 * quicksell / market / trades carry and multiply the variant, and the
 * variant stats are farm-safe. Applied twice (idempotent).
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const MIG = readFileSync(join(__dirname, 'migrations', '20261013000010_card_variants.sql'), 'utf8');
const PENDING = readFileSync(
  join(__dirname, 'migrations', '20261013000091_pending_card_variants.sql'),
  'utf8',
);

let db: PGlite;
const q = async (s: string, p: unknown[] = []) => (await db.query(s, p)).rows as any[];
const as = (uid: string) => db.exec(`select set_config('test.uid', '${uid}', false)`);
const pc = async (uid: string, card: string) =>
  (
    await q(
      `select quantity, foil_quantity from player_cards where user_id = $1 and card_id = $2`,
      [uid, card],
    )
  )[0];
const pv = async (uid: string, card: string, variant: string, foil = false) =>
  ((
    await q(
      `select quantity from player_card_variants where user_id = $1 and card_id = $2 and variant = $3 and foil = $4`,
      [uid, card, variant, foil],
    )
  )[0]?.quantity ?? 0) as number;
const credits = async (uid: string) =>
  (await q(`select credits from profiles where id = $1`, [uid]))[0].credits as number;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table cards (id text primary key, name text, card_type text, rarity text, set_name text,
      image_url text, essence_types text[]);
    create table profiles (id uuid primary key, credits int default 0, vouchers int default 0, updated_at timestamptz);
    create table player_cards (user_id uuid, card_id text, quantity int default 0, foil_quantity int default 0,
      acquired_at timestamptz default now(), primary key (user_id, card_id));
    create table player_serialized_cards (user_id uuid, card_id text, rarity text, serial_number int);
    create table decks (id uuid default gen_random_uuid(), user_id uuid, leader_id text, card_ids text[]);
    create table stat_once (user_id uuid, key text, primary key (user_id, key));
    create table stats (user_id uuid, key text, n int);
    create table achievements (id text primary key, name text, description text, category text, stat_key text,
      target int, reward_credits int, reward_vouchers int, reward_pack_id uuid, sort int, hidden boolean);
    create table market_listings (id uuid primary key default gen_random_uuid(), seller uuid, card_id text,
      foil boolean, quantity int, listing_type text, price int, buyout int, current_bid int, current_bidder uuid,
      bid_count int default 0, status text default 'active', created_at timestamptz default now(),
      ends_at timestamptz, cpu_ceiling int, cpu_leading boolean default false, cpu_bidder_name text,
      cpu_next_at timestamptz, graded_id uuid, slab_grade numeric, slab_service text, slab_pristine boolean);
    create table market_listing_cpu (listing_id uuid primary key, cpu_ceiling int, cpu_next_at timestamptz);
    create table graded_cards (id uuid primary key default gen_random_uuid(), user_id uuid, card_id text,
      foil boolean, grade numeric, service text, pristine boolean, retired boolean, listing_id uuid,
      crossover_pending boolean default false);
    create table shop_listings (id uuid primary key default gen_random_uuid(), owner uuid, slot_id uuid,
      listing_type text, status text default 'active', cards jsonb, price int, reference_price int,
      graded_id uuid);
    create table pack_types (id uuid primary key default gen_random_uuid(), slot_config jsonb,
      foil_chance numeric, allowed_sets text[], allowed_colors text[]);
    create table serialized_supply (rarity text, cap int, issued int);
    create table grading_loyalty (user_id uuid, service text, submitted int, perks_used int);
    create table shop_slots (id uuid primary key, owner uuid, status text);
    create function track_stat(a uuid, b text, c int, d boolean) returns void language sql as $$
      insert into stats values (a, b, c) $$;
    create function stat_once_claim(p_uid uuid, p_key text) returns boolean language plpgsql as $$
      begin insert into stat_once values (p_uid, p_key) on conflict do nothing; return found; end $$;
    create function card_sell_price(r text) returns int language sql as $$ select 10 $$;
    create function card_blended_reference(c text, f boolean default false) returns int language sql as $$
      select case when f then 25 else 10 end $$;
    create function grading_slab_reference(c text, f boolean, g numeric, s text, p boolean) returns int
      language sql as $$ select 100 $$;
    create function rarity_tier(r text) returns int language sql as $$ select 1 $$;
    create function cpu_ceiling_factor(s text) returns numeric language sql as $$ select 1.0 $$;
    create function cpu_persona_name() returns text language sql as $$ select 'Bot' $$;
    create function roll_weighted_rarity(w jsonb, m text) returns text language sql as $$ select 'Common' $$;
    create function roll_slot_rarity(s text) returns text language sql as $$ select 'Common' $$;
    create function random_leader_of_rarity(r text, s text[]) returns text language sql as $$ select null::text $$;
    create function random_card_of_rarity(r text, s text[]) returns text language sql as $$
      select 'c-tide' $$;
    create function random_card_of_rarity_in_colors(r text, s text[], c text[]) returns text language sql as $$
      select null::text $$;
    -- the pre-existing crack RPC (live body, minus nothing that matters here)
    create function crack_graded_slab(p_id uuid) returns jsonb language plpgsql as $$
      declare v_g graded_cards%rowtype; begin
        select * into v_g from graded_cards where id = p_id;
        insert into player_cards (user_id, card_id, quantity, foil_quantity)
          values (v_g.user_id, v_g.card_id, case when v_g.foil then 0 else 1 end, case when v_g.foil then 1 else 0 end)
          on conflict (user_id, card_id) do update set quantity = player_cards.quantity + excluded.quantity,
            foil_quantity = player_cards.foil_quantity + excluded.foil_quantity;
        delete from graded_cards where id = p_id;
        return jsonb_build_object('ok', true);
      end $$;
    -- the pre-existing listing RPC, trimmed to its escrow behaviour
    create function create_listing(p_card_id text, p_foil boolean, p_quantity int, p_type text, p_price int,
      p_buyout int default null, p_hours int default 24) returns jsonb language plpgsql as $$
      declare v_id uuid; begin
        perform assert_cards_available(auth.uid(), jsonb_build_array(jsonb_build_object(
          'card_id', p_card_id, 'quantity', p_quantity, 'foil', p_foil)));
        update player_cards set quantity = quantity - case when p_foil then 0 else p_quantity end,
          foil_quantity = foil_quantity - case when p_foil then p_quantity else 0 end
          where user_id = auth.uid() and card_id = p_card_id;
        insert into market_listings (seller, card_id, foil, quantity, listing_type, price, ends_at)
          values (auth.uid(), p_card_id, p_foil, p_quantity, p_type, p_price, now() + interval '1 day')
          returning id into v_id;
        return jsonb_build_object('ok', true, 'listing_id', v_id);
      end $$;
    insert into profiles (id, credits) values ('${A}', 0), ('${B}', 0);
    insert into cards values
      ('c-tide', 'Tide', 'Unit', 'Common', 'Volume #1', null, '{Tide}'),
      ('c-duo', 'Duo', 'Unit', 'Common', 'Volume #1', null, '{Ember,Void}'),
      ('c-none', 'Plain', 'Unit', 'Common', 'Volume #1', null, '{}');
  `);
  await db.exec(MIG);
  await db.exec(MIG);
}, 60_000);

describe('card variants (20261013000010)', () => {
  test('helpers: colour pairing and multipliers', async () => {
    const r =
      await q(`select variant_mult('shattered') s, variant_mult('void_rift') e, variant_mult(null) n,
      card_variant_colour('root_overgrown') c, is_card_variant('nope') bad`);
    expect(Number(r[0].s)).toBe(6);
    expect(Number(r[0].e)).toBe(3);
    expect(Number(r[0].n)).toBe(1);
    expect(r[0].c).toBe('Root');
    expect(r[0].bad).toBe(false);
  });

  test('roll odds: shattered ~1/150, elemental ~1/40 and only in the card colours', async () => {
    await q(`select setseed(0.42)`);
    const rows = await q(
      `select v, count(*)::int n from (select roll_card_variant('c-duo') v from generate_series(1, 30000)) t group by v`,
    );
    const by = Object.fromEntries(rows.map((r) => [r.v ?? 'none', r.n]));
    expect(Object.keys(by).sort()).toEqual(['ember_sparks', 'none', 'shattered', 'void_rift']);
    expect(by.shattered).toBeGreaterThan(130);
    expect(by.shattered).toBeLessThan(270);
    const elemental = by.ember_sparks + by.void_rift;
    expect(elemental).toBeGreaterThan(600);
    expect(elemental).toBeLessThan(900);
    const none = await q(
      `select count(*)::int n from (select roll_card_variant('c-none') v from generate_series(1, 3000)) t
        where v is not null and v <> 'shattered'`,
    );
    expect(none[0].n).toBe(0);
  });

  test('pack grant tags results with a variant key and keeps the ledger consistent', async () => {
    await q(`select setseed(0.1)`);
    const pack = `row(gen_random_uuid(), '[{"count":400,"slot_type":"foundation","foil_eligible":false}]'::jsonb, 0, null, null)::pack_types`;
    const res = (await q(`select grant_pack_contents('${B}', ${pack}) r`))[0].r;
    const variants = res.cards.filter((c: any) => c.variant);
    expect(res.cards.every((c: any) => 'variant' in c)).toBe(true);
    expect(variants.length).toBeGreaterThan(0);
    for (const c of variants) expect(['shattered', 'tide_frost']).toContain(c.variant);
    const ledger = await q(
      `select coalesce(sum(quantity),0)::int n from player_card_variants where user_id = $1`,
      [B],
    );
    expect(ledger[0].n).toBe(variants.length);
    const st = await q(`select key, sum(n)::int n from stats where user_id = $1 group by key`, [B]);
    const stats = Object.fromEntries(st.map((r) => [r.key, r.n]));
    expect(stats.variants_pulled).toBe(variants.length);
    // farm-safe: one kind counted once however many were pulled
    expect(stats.elemental_kinds ?? 0).toBeLessThanOrEqual(1);
  });

  test('plain moves cannot eat variant copies; variant quicksell pays x6 (x2.5 foil stacks)', async () => {
    await as(A);
    await q(`insert into player_cards values ($1, 'c-tide', 2, 1)`, [A]);
    await q(`select card_variant_adjust($1, 'c-tide', false, 'shattered', 1)`, [A]);
    await q(`select card_variant_adjust($1, 'c-tide', true, 'tide_frost', 1)`, [A]);
    await expect(q(`select quicksell_many('[{"card_id":"c-tide","qty":2}]')`)).rejects.toThrow(
      /variants/,
    );
    await expect(
      q(`select quicksell_many('[{"card_id":"c-tide","qty":1,"foil":true}]')`),
    ).rejects.toThrow(/variants/);
    const r = (
      await q(`select quicksell_many('[{"card_id":"c-tide","qty":1,"variant":"shattered"}]') r`)
    )[0].r;
    expect(r.total).toBe(60);
    const f = (
      await q(
        `select quicksell_many('[{"card_id":"c-tide","qty":1,"foil":true,"variant":"tide_frost"}]') r`,
      )
    )[0].r;
    expect(f.total).toBe(75); // 10 x 2.5 = 25, x3
    expect(await pv(A, 'c-tide', 'shattered')).toBe(0);
    expect(await pc(A, 'c-tide')).toEqual({ quantity: 1, foil_quantity: 0 });
    expect(await credits(A)).toBe(135);
  });

  test('trades move the ledger rows with the copies', async () => {
    await q(
      `update player_cards set quantity = quantity + 1 where user_id = $1 and card_id = 'c-tide'`,
      [A],
    );
    await q(`select card_variant_adjust($1, 'c-tide', false, 'shattered', 1)`, [A]);
    await q(`select assert_cards_available($1, '[{"card_id":"c-tide","variant":"shattered"}]')`, [
      A,
    ]);
    await expect(
      q(
        `select assert_cards_available($1, '[{"card_id":"c-tide","variant":"shattered","quantity":2}]')`,
        [A],
      ),
    ).rejects.toThrow(/variant/);
    await q(`select transfer_cards($1, $2, '[{"card_id":"c-tide","variant":"shattered"}]')`, [
      A,
      B,
    ]);
    expect(await pv(A, 'c-tide', 'shattered')).toBe(0);
    expect(await pv(B, 'c-tide', 'shattered')).toBeGreaterThanOrEqual(1);
  });

  test('variant market listing escrows and cancel restores the variant', async () => {
    await q(
      `update player_cards set quantity = quantity + 1 where user_id = $1 and card_id = 'c-tide'`,
      [A],
    );
    await q(`select card_variant_adjust($1, 'c-tide', false, 'tide_frost', 1)`, [A]);
    const before = await pc(A, 'c-tide');
    const res = (
      await q(`select create_variant_listing('c-tide', false, 'tide_frost', 1, 'fixed', 99) r`)
    )[0].r;
    expect(res.variant).toBe('tide_frost');
    expect(await pv(A, 'c-tide', 'tide_frost')).toBe(0);
    expect((await pc(A, 'c-tide')).quantity).toBe(before.quantity - 1);
    const l = await q(`select variant from market_listings where id = $1`, [res.listing_id]);
    expect(l[0].variant).toBe('tide_frost');
    await q(`select cancel_listing($1)`, [res.listing_id]);
    expect(await pv(A, 'c-tide', 'tide_frost')).toBe(1);
    await expect(
      q(`select create_variant_listing('c-tide', false, 'shattered', 1, 'fixed', 99)`),
    ).rejects.toThrow(/variant/);
  });

  test('cracking a variant slab returns the variant copy (live wrapper, then pending body)', async () => {
    const crack = async () => {
      const id = (
        await q(
          `insert into graded_cards (user_id, card_id, foil, variant, grade, service, pristine, retired)
           values ($1, 'c-none', false, 'shattered', 9, 'tca', false, false) returning id`,
          [A],
        )
      )[0].id;
      const before = await pv(A, 'c-none', 'shattered');
      const r = (await q(`select crack_variant_slab($1) r`, [id]))[0].r;
      expect(r.variant).toBe('shattered');
      expect(await pv(A, 'c-none', 'shattered')).toBe(before + 1);
    };
    await crack();
    await db.exec(PENDING);
    await crack();
  });

  test('achievements are seeded once', async () => {
    const r = await q(
      `select id from achievements where stat_key in ('variants_pulled','elemental_kinds','shattered_pulls') order by id`,
    );
    expect(r.map((x) => x.id)).toEqual([
      'variant_elements_7',
      'variant_first',
      'variant_shattered',
    ]);
  });
});
