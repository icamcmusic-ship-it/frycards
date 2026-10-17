/**
 * 20261015000400 Collector Pack + bundles against PGlite, on top of the
 * 20261012000020 store RPCs: the Collector Pack's UR+ slot holds over many
 * real openings (real roll_weighted_rarity), bundles debit their price, a
 * short wallet is refused without side effects, and a retried request id
 * never grants twice. Applied twice (idempotent).
 *
 * grant_pack_contents here is the 20261012000020 one. The live 20261013000010
 * version adds variant rolls but keeps the same slot loop: weights through
 * roll_weighted_rarity(weights, floor), and a `foil` slot is always foil.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const mig = (f: string) => readFileSync(join(__dirname, 'migrations', f), 'utf8');
const DEALS = mig('20261012000020_store_deals_and_color_packs.sql');
const MIG = mig('20261015000400_collector_pack_and_bundles.sql');
const BOOSTER = 'aaaaaaaa-0000-0000-0000-000000000001';
const TIER: Record<string, number> = {
  Common: 1,
  Uncommon: 2,
  Rare: 3,
  'Super-Rare': 4,
  'Ultra-Rare': 5,
  'Full-Art': 6,
  'Alt-Art': 7,
  Mythic: 8,
};

let db: PGlite;
const q = async (s: string, p: unknown[] = []) => (await db.query(s, p)).rows as any[];
const as = (uid: string) => q(`select set_config('test.uid', $1, false)`, [uid]);
const wallet = async (uid: string) =>
  (await q(`select credits, vouchers from profiles where id = $1`, [uid]))[0] as {
    credits: number;
    vouchers: number;
  };
const inv = async (uid: string) =>
  Number(
    (await q(`select coalesce(sum(qty), 0) n from inv where uid = $1 and pack = $2`, [uid, BOOSTER]))[0]
      .n,
  );
const rid = () => crypto.randomUUID();

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
      primary key (user_id, card_id));
    create table player_serialized_cards (user_id uuid, card_id text, rarity text, serial_number int);
    create table serialized_supply (rarity text, cap int, issued int);
    create table inv (uid uuid, pack uuid, qty int);
    create table pack_types (id uuid primary key default gen_random_uuid(), name text, description text,
      card_count int, guaranteed_rarity text, image_url text, foil_chance numeric, has_foil_slot boolean,
      price_credits int, price_vouchers int, pack_tier text, slot_config jsonb, created_at timestamptz default now(),
      is_active boolean, acquisition text, time_limited boolean, pity_note text, allowed_sets text[],
      pack_group text, set_name text, open_image_url text);
    create function normalize_currency(p text) returns text language sql as $$
      select case when p in ('credits','vouchers') then p end $$;
    create function track_pack_open(p uuid) returns void language sql as $$ select $$;
    create function track_stat(a uuid, b text, c int, d boolean) returns void language sql as $$ select $$;
    create function grant_inventory_pack(a uuid, b uuid, c int) returns void language sql as $$ insert into inv values (a, b, c) $$;
    create function roll_slot_rarity(s text) returns text language sql as $$ select 'Common' $$;
    create function random_leader_of_rarity(r text, s text[]) returns text language sql as $$ select null::text $$;
    create function random_card_of_rarity(r text, s text[]) returns text language sql as $$
      select id from cards where rarity = r order by random() limit 1 $$;
    -- Live definitions (20261008 catch-up), so the floor is really tested.
    create function rarity_tier(p_rarity text) returns int language sql immutable as $$
      select case p_rarity when 'Common' then 1 when 'Uncommon' then 2 when 'Rare' then 3
        when 'Super-Rare' then 4 when 'Ultra-Rare' then 5 when 'Full-Art' then 6
        when 'Alt-Art' then 7 when 'Mythic' then 8 else 1 end $$;
    create function roll_weighted_rarity(p_weights jsonb, p_min_rarity text default null) returns text
    language plpgsql as $f$
    declare r numeric := random(); acc numeric := 0; k text; v numeric; result text := null; total numeric := 0;
    begin
      for k, v in select key, value::numeric from jsonb_each_text(p_weights) loop total := total + v; end loop;
      if total <= 0 then return coalesce(p_min_rarity, 'Common'); end if;
      r := r * total;
      for k, v in select key, value::numeric from jsonb_each_text(p_weights) order by rarity_tier(key) loop
        acc := acc + v;
        if r < acc then result := k; exit; end if;
      end loop;
      result := coalesce(result, p_min_rarity, 'Common');
      if p_min_rarity is not null and rarity_tier(result) < rarity_tier(p_min_rarity) then result := p_min_rarity; end if;
      return result;
    end $f$;
    insert into profiles (id, credits, vouchers) values ('${A}', 100000, 100), ('${B}', 1000, 5);
    insert into cards
      select 'c-' || r, r, 'Unit', r, 'Volume #1', null, '{}'::text[]
      from unnest(array['Common','Uncommon','Rare','Super-Rare','Ultra-Rare','Full-Art','Mythic']) r;
    insert into pack_types (id, name, card_count, foil_chance, has_foil_slot, price_credits, price_vouchers,
      pack_tier, slot_config, is_active, acquisition, time_limited, allowed_sets)
    values ('${BOOSTER}', 'Volume #1 Booster Pack', 8, 0, false, 599, 6, 'standard',
      '[{"count":1,"slot_type":"foundation","foil_eligible":false,"rarity_weights":{"Common":1}}]',
      true, 'purchase', false, '{Volume #1}');
  `);
  await db.exec(DEALS);
  await db.exec(MIG);
  await db.exec(MIG);
  // No daily deal in these tests: prices are the plain bundle prices.
  await db.exec(`create or replace function daily_pack_deals(p_day date default null)
    returns table (pack_id uuid, pct int, ends_at timestamptz) language sql as $$
    select null::uuid, 0, now() where false $$`);
}, 60_000);

describe('Collector Pack (20261015000400)', () => {
  test('seeded once, active, 5 cards, 1499 cr / 15 v', async () => {
    const rows = await q(`select * from pack_types where name = 'Volume #1 Collector Pack'`);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      is_active: true,
      card_count: 5,
      price_credits: 1499,
      price_vouchers: 15,
      acquisition: 'purchase',
    });
  });

  test('UR+ and a foil in every one of 400 server openings', async () => {
    await as(A);
    const pack = (await q(`select id from pack_types where name = 'Volume #1 Collector Pack'`))[0].id;
    const tally: Record<string, number> = {};
    for (let i = 0; i < 400; i++) {
      const g = (
        await q(`select grant_pack_contents($1, p) g from pack_types p where id = $2`, [A, pack])
      )[0].g;
      const cards = g.cards.filter((c: any) => !c.serialized);
      expect(cards).toHaveLength(5);
      const best = Math.max(...cards.map((c: any) => TIER[c.rarity]));
      expect(best).toBeGreaterThanOrEqual(TIER['Ultra-Rare']);
      const coll = cards.find((c: any) => c.slot === 'collector');
      expect(TIER[coll.rarity]).toBeGreaterThanOrEqual(TIER['Ultra-Rare']);
      tally[coll.rarity] = (tally[coll.rarity] ?? 0) + 1;
      expect(cards.some((c: any) => c.foil)).toBe(true);
    }
    // The weights roll, not just the floor: UR dominates, the rest appear.
    expect(tally['Ultra-Rare']).toBeGreaterThan(220);
    expect((tally['Full-Art'] ?? 0) + (tally['Mythic'] ?? 0)).toBeGreaterThan(40);
  });
});

describe('purchase_bundle (20261015000400)', () => {
  test('3-pack and 10-pack debit their bundle price and land in My Packs', async () => {
    await as(A);
    let before = await wallet(A);
    let r = (await q(`select purchase_bundle('booster_3', 'credits', $1) r`, [rid()]))[0].r;
    expect(r).toMatchObject({ ok: true, quantity: 3, opened: false, price_paid: 1619 });
    expect(before.credits - (await wallet(A)).credits).toBe(1619);
    expect(await inv(A)).toBe(3);

    before = await wallet(A);
    r = (await q(`select purchase_bundle('booster_10', 'vouchers', $1) r`, [rid()]))[0].r;
    expect(r.price_paid).toBe(48);
    expect(before.vouchers - (await wallet(A)).vouchers).toBe(48);
    expect(await inv(A)).toBe(13);
  });

  test('open mode opens every pack at the bundle price', async () => {
    await as(A);
    const before = await wallet(A);
    const r = (await q(`select purchase_bundle('booster_10', 'credits', $1, true) r`, [rid()]))[0].r;
    expect(r.opened).toBe(true);
    expect(r.packs_opened).toBe(10);
    expect(r.cards.filter((c: any) => !c.serialized)).toHaveLength(10);
    expect(before.credits - (await wallet(A)).credits).toBe(4799);
  });

  test('a short wallet is refused and nothing changes', async () => {
    await as(B);
    const before = await wallet(B);
    await expect(q(`select purchase_bundle('booster_3', 'credits', $1)`, [rid()])).rejects.toThrow(
      /Not enough credits/,
    );
    await expect(q(`select purchase_bundle('booster_10', 'vouchers', $1)`, [rid()])).rejects.toThrow(
      /Not enough vouchers/,
    );
    expect(await wallet(B)).toEqual(before);
    expect(await inv(B)).toBe(0);
    expect((await q(`select count(*)::int n from bundle_purchases where user_id = $1`, [B]))[0].n).toBe(0);
  });

  test('a retried request id replays without a second charge or grant', async () => {
    await as(A);
    const id = rid();
    const before = await wallet(A);
    const invBefore = await inv(A);
    const first = (await q(`select purchase_bundle('booster_3', 'credits', $1) r`, [id]))[0].r;
    const again = (await q(`select purchase_bundle('booster_3', 'credits', $1) r`, [id]))[0].r;
    expect(again.replayed).toBe(true);
    expect(again.price_paid).toBe(first.price_paid);
    expect(before.credits - (await wallet(A)).credits).toBe(1619);
    expect((await inv(A)) - invBefore).toBe(3);
  });

  test('rejects anonymous, unknown bundles, bad currency and a missing request id', async () => {
    await as('');
    await expect(q(`select purchase_bundle('booster_3', 'credits', $1)`, [rid()])).rejects.toThrow(
      /Not authenticated/,
    );
    await as(A);
    await expect(q(`select purchase_bundle('nope', 'credits', $1)`, [rid()])).rejects.toThrow(
      /not available/,
    );
    await expect(q(`select purchase_bundle('booster_3', 'gold!', $1)`, [rid()])).rejects.toThrow(
      /Unknown currency/,
    );
    await expect(q(`select purchase_bundle('booster_3', 'credits', null)`)).rejects.toThrow(
      /Missing request id/,
    );
  });

  test('a daily deal on the booster never makes the bundle dearer', async () => {
    await as(A);
    await db.exec(`create or replace function daily_pack_deals(p_day date default null)
      returns table (pack_id uuid, pct int, ends_at timestamptz) language sql as $$
      select '${BOOSTER}'::uuid, 15, now() $$`);
    const r = (await q(`select purchase_bundle('booster_3', 'credits', $1) r`, [rid()]))[0].r;
    // 509 x 3 = 1527 < 1619
    expect(r.price_paid).toBe(1527);
  });

  test('anon cannot execute it, bundles are readable', async () => {
    const acl = (
      await q(`select proacl::text a from pg_proc where proname = 'purchase_bundle'`)
    )[0].a as string;
    expect(acl).toContain('authenticated=X');
    expect(acl).not.toMatch(/anon=X|(^|[{,])=X/);
    const rows = await q(`select id, pack_qty from shop_bundles order by sort_order`);
    expect(rows).toEqual([
      { id: 'booster_3', pack_qty: 3 },
      { id: 'booster_10', pack_qty: 10 },
    ]);
  });
});
