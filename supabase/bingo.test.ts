/** Set Completion Bingo (20261007000003) on PGlite with minimal stubs. */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, expect, test } from 'vitest';

const U = '11111111-1111-1111-1111-111111111111';
let db: PGlite;
const q = async (s: string) => (await db.query(s)).rows as any[];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table profiles (id uuid primary key, credits int default 0, vouchers int default 0, updated_at timestamptz);
    create table cards (id text primary key, rarity text, card_type text, essence_types text[]);
    create table player_cards (user_id uuid, card_id text, quantity int default 0, foil_quantity int default 0,
      primary key (user_id, card_id));
    create table graded_cards (id uuid primary key default gen_random_uuid(), user_id uuid, grade numeric);
    create table stats (uid uuid, key text, n int);
    create function track_stat(p_uid uuid, p_key text, p_n int, p_abs boolean) returns void language sql
      as $$ insert into stats values (p_uid, p_key, p_n) $$;
    create function card_sell_price(r text) returns int language sql immutable as $$
      select case r when 'Mythic' then 1500 when 'Ultra-Rare' then 300 when 'Super-Rare' then 120
        when 'Rare' then 40 when 'Uncommon' then 10 else 4 end $$;
    create table missions (id text primary key, name text, description text, stat_key text, target int,
      reward_credits int, reward_vouchers int, reward_bp_xp int, cadence text);
    create table achievements (id text primary key, name text, description text, category text, stat_key text,
      target int, reward_credits int, reward_vouchers int, reward_pack_id uuid, sort int);
    insert into profiles (id) values ('${U}');
    insert into cards values ('t1','Rare','Unit',array['Tide']);
    set test.uid = '${U}';
  `);
  await db.exec(
    readFileSync(join(__dirname, 'migrations/20261007000003_collection_bingo.sql'), 'utf8'),
  );
}, 60_000);

test('a card has 25 cells, 24 distinct goals and a free centre', async () => {
  const card = (await q(`select get_bingo() r`))[0].r;
  expect(card.cells).toHaveLength(25);
  expect(card.cells[12].kind).toBe('free');
  expect(new Set(card.cells.map((c: any) => c.label)).size).toBe(25);
  expect(card.done[12]).toBe(true);
  // reading again returns the same card
  const again = (await q(`select get_bingo() r`))[0].r;
  expect(again.cells).toEqual(card.cells);
});

test('a line pays once, only when complete; blackout needs every cell', async () => {
  // Force a known card: row 0 all achievable from one owned Rare Tide Unit.
  const cell = { kind: 'rar_ess', a: 'Rare', b: 'Tide', label: 'x' };
  const cells = Array.from({ length: 25 }, (_, i) =>
    i === 12
      ? { kind: 'free', label: 'FREE' }
      : i < 5
        ? { ...cell, label: `c${i}` }
        : { kind: 'slab_min', a: '10', label: `s${i}` },
  );
  await q(`update bingo_cards set cells = '${JSON.stringify(cells)}' where user_id = '${U}'`);
  await expect(q(`select claim_bingo(0)`)).rejects.toThrow(/not complete/);
  await q(`insert into player_cards values ('${U}','t1',1,0)`);
  const card = (await q(`select get_bingo() r`))[0].r;
  expect(card.lines).toEqual([0]);
  expect((await q(`select claim_bingo(0) r`))[0].r.credits).toBe(120);
  await expect(q(`select claim_bingo(0)`)).rejects.toThrow(/already claimed/);
  await expect(q(`select claim_bingo(12)`)).rejects.toThrow(/not complete/);
  expect((await q(`select credits from profiles where id = '${U}'`))[0].credits).toBe(120);
});
