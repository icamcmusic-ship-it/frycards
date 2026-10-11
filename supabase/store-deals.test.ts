/**
 * 20261012000020 store deals + colour packs against PGlite: the daily deal is
 * deterministic per UTC day and charged by every buy RPC, limited packs stop
 * selling at `available_until`, colour packs draw from their colours, and the
 * seeded colour packs are inactive. Applied twice (idempotent).
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';

const A = '11111111-1111-1111-1111-111111111111';
const MIG = readFileSync(
  join(__dirname, 'migrations', '20261012000020_store_deals_and_color_packs.sql'),
  'utf8',
);
const P1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const P2 = 'aaaaaaaa-0000-0000-0000-000000000002';

let db: PGlite;
const q = async (s: string, p: unknown[] = []) => (await db.query(s, p)).rows as any[];
const credits = async () =>
  (await q(`select credits from profiles where id = $1`, [A]))[0].credits as number;

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
    create function roll_weighted_rarity(w jsonb, m text) returns text language sql as $$ select 'Common' $$;
    create function roll_slot_rarity(s text) returns text language sql as $$ select 'Common' $$;
    create function random_leader_of_rarity(r text, s text[]) returns text language sql as $$ select null::text $$;
    create function random_card_of_rarity(r text, s text[]) returns text language sql as $$
      select id from cards where rarity = r order by id limit 1 $$;
    insert into profiles (id, credits, vouchers) values ('${A}', 100000, 100);
    insert into cards values ('c-tide', 'Tide', 'Unit', 'Common', 'Volume #1', null, '{Tide}'),
      ('c-ember', 'Ember', 'Unit', 'Common', 'Volume #1', null, '{Ember}');
    insert into pack_types (id, name, card_count, foil_chance, has_foil_slot, price_credits, price_vouchers,
      pack_tier, slot_config, is_active, acquisition, time_limited, allowed_sets)
    values
      ('${P1}', 'One', 2, 0, false, 600, 6, 'standard', '[{"count":20,"slot_type":"foundation","foil_eligible":false,"rarity_weights":{"Common":1}}]', true, 'purchase', false, '{Volume #1}'),
      ('${P2}', 'Two', 2, 0, false, 1000, 10, 'standard', '[{"count":1,"slot_type":"foundation","foil_eligible":false,"rarity_weights":{"Common":1}}]', true, 'purchase', false, '{Volume #1}');
  `);
  await db.exec(MIG);
  await db.exec(MIG);
  await db.exec(`select set_config('test.uid', '${A}', false)`);
}, 60_000);

describe('store deals and colour packs (20261012000020)', () => {
  test('one deal per day, deterministic, ends at the next UTC midnight', async () => {
    const a = await q(`select * from daily_pack_deals('2026-10-12')`);
    const b = await q(`select * from daily_pack_deals('2026-10-12')`);
    expect(a).toHaveLength(1);
    expect(a[0].pack_id).toBe(b[0].pack_id);
    expect(a[0].pct).toBe(15);
    expect(new Date(a[0].ends_at).toISOString()).toBe('2026-10-13T00:00:00.000Z');
  });

  test('every buy RPC charges the discounted price on the deal pack only', async () => {
    const deal = (await q(`select pack_id from daily_pack_deals()`))[0].pack_id as string;
    const other = deal === P1 ? P2 : P1;
    const base = async (id: string) =>
      (await q(`select price_credits from pack_types where id = $1`, [id]))[0].price_credits;
    const want = Math.round(((await base(deal)) * 85) / 100);

    let before = await credits();
    await q(`select open_pack($1, 'credits')`, [deal]);
    expect(before - (await credits())).toBe(want);

    before = await credits();
    await q(`select buy_and_open_packs($1, 3, 'credits')`, [deal]);
    expect(before - (await credits())).toBe(want * 3);

    before = await credits();
    await q(`select buy_pack_to_inventory($1, 'credits', 2)`, [deal]);
    expect(before - (await credits())).toBe(want * 2);

    before = await credits();
    await q(`select open_pack($1, 'credits')`, [other]);
    expect(before - (await credits())).toBe(await base(other));
  });

  test('a limited pack past available_until refuses to sell', async () => {
    await q(`update pack_types set available_until = now() - interval '1 minute' where id = $1`, [
      P2,
    ]);
    await expect(q(`select open_pack($1, 'credits')`, [P2])).rejects.toThrow(/no longer available/);
    await expect(q(`select buy_pack_to_inventory($1, 'credits', 1)`, [P2])).rejects.toThrow(
      /no longer available/,
    );
    await q(`update pack_types set available_until = null where id = $1`, [P2]);
  });

  test('colour packs are seeded inactive with one colour each', async () => {
    const rows = await q(
      `select name, is_active, allowed_colors, time_limited from pack_types where pack_group like 'color_%' order by name`,
    );
    expect(rows).toHaveLength(7);
    expect(rows.every((r) => r.is_active === false && r.time_limited === true)).toBe(true);
    expect(rows.find((r) => r.name === 'Tide Pack').allowed_colors).toEqual(['Tide']);
  });

  test('a colour pack draws mostly from its colour', async () => {
    await q(`update pack_types set allowed_colors = '{Tide}' where id = $1`, [P1]);
    const r = (
      await q(`select grant_pack_contents($1, p) g from pack_types p where id = $2`, [A, P1])
    )[0].g;
    const tide = r.cards.filter((c: any) => c.card_id === 'c-tide').length;
    // default draw is always c-ember; ~75% get re-drawn from Tide.
    expect(tide).toBeGreaterThanOrEqual(8);
    await q(`update pack_types set allowed_colors = null where id = $1`, [P1]);
  });
});
