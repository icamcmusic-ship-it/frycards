/**
 * 20261011000004 against PGlite: the broadcast triggers send one message per
 * user per statement, quicksell_many sells many lots in one go with the same
 * guards as quicksell_cards, and sell_bounty_card falls back to a foil.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const MIGRATION = readFileSync(
  join(__dirname, 'migrations', '20261011000004_realtime_broadcast_and_cost.sql'),
  'utf8',
);

let db: PGlite;
const q = async (s: string, p: unknown[] = []) => (await db.query(s, p)).rows as any[];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create schema realtime;
    create table realtime.messages (topic text, extension text, payload jsonb, event text, private boolean);
    alter table realtime.messages enable row level security;
    create function realtime.topic() returns text language sql as $$ select current_setting('realtime.topic', true) $$;
    create function realtime.send(payload jsonb, event text, topic text, private boolean) returns void
      language sql as $$ insert into realtime.messages values (topic, 'broadcast', payload, event, private) $$;
    create table profiles (id uuid primary key, credits int default 0, updated_at timestamptz);
    create table cards (id text primary key, name text, card_type text, rarity text, set_name text);
    create table player_cards (user_id uuid, card_id text, quantity int default 0, foil_quantity int default 0,
      primary key (user_id, card_id));
    create table player_inventory (user_id uuid, pack_type_id int, quantity int);
    create table decks (user_id uuid, leader_id text, card_ids text[]);
    create table player_serialized_cards (user_id uuid, card_id text);
    create table player_bounty_activity (user_id uuid, bounty_date date, card_id text, action text);
    create table graded_cards (user_id uuid, card_id text);
    create table player_wishlist (user_id uuid, card_id text);
    create table shop_customers (owner uuid, listing_id uuid, offer_card_id text);
    create table bingo_cards (user_id uuid);
    create table stats (uid uuid, key text, n int);
    create function track_stat(p_uid uuid, p_key text, p_n int, p_abs boolean) returns void language sql
      as $$ insert into stats values (p_uid, p_key, p_n) $$;
    create function card_sell_price(r text) returns int language sql as $$ select case r when 'Rare' then 30 else 5 end $$;
    create function ensure_daily_bounties(d date) returns text[] language sql as $$ select array['c1','c2'] $$;
    insert into profiles (id) values ('${A}'), ('${B}');
    insert into cards values ('c1','One','Power','Common','Core'), ('c2','Two','Power','Rare','Core'),
      ('L1','Lead','Leader','Rare','Core');
  `);
  await db.exec(MIGRATION);
  await db.exec(MIGRATION); // idempotent
  await db.exec(`set test.uid = '${A}'`);
}, 60_000);

beforeEach(async () => {
  await q(`truncate player_cards, decks, player_serialized_cards, player_bounty_activity, stats`);
  await q(`update profiles set credits = 0`);
  await q(`truncate realtime.messages`);
});

describe('broadcast triggers', () => {
  test('one message per user per statement, on the private user topic', async () => {
    await q(`insert into player_cards (user_id, card_id, quantity) values
      ('${A}','c1',1), ('${A}','c2',1), ('${A}','L1',1), ('${B}','c1',1)`);
    const msgs = await q(
      `select topic, event, payload, private from realtime.messages order by topic`,
    );
    expect(msgs).toEqual([
      { topic: `user:${A}`, event: 'changed', payload: { table: 'player_cards' }, private: true },
      { topic: `user:${B}`, event: 'changed', payload: { table: 'player_cards' }, private: true },
    ]);
    await q(`truncate realtime.messages`);
    await q(`update profiles set credits = 5 where id = '${A}'`);
    await q(`truncate player_cards`); // truncate fires no row triggers
    expect((await q(`select topic, payload from realtime.messages`)).map((r) => r.topic)).toEqual([
      `user:${A}`,
    ]);
  });

  test('a statement touching no rows sends nothing', async () => {
    await q(`update profiles set credits = 1 where id = gen_random_uuid()`);
    expect(await q(`select * from realtime.messages`)).toEqual([]);
  });

  test('realtime.messages policy: own topic only', async () => {
    const [p] = await q(
      `select qual from pg_policies where schemaname = 'realtime' and policyname = 'user topic read own'`,
    );
    expect(p.qual).toMatch(/user:/);
  });
});

describe('quicksell_many', () => {
  test('sells every lot in one transaction and tracks once', async () => {
    await q(`insert into player_cards values ('${A}','c1',5,2), ('${A}','c2',3,0)`);
    const [{ r }] = await q(`select quicksell_many($1::jsonb) r`, [
      JSON.stringify([
        { card_id: 'c1', qty: 4, foil: false },
        { card_id: 'c1', qty: 2, foil: true },
        { card_id: 'c2', qty: 1, foil: false },
      ]),
    ]);
    expect(r).toMatchObject({ ok: true, sold: 7, total: 4 * 5 + 2 * 13 + 30, credits: 76 });
    expect(await q(`select key, n from stats`)).toEqual([{ key: 'cards_sold', n: 7 }]);
    const rows = await q(
      `select card_id, quantity, foil_quantity from player_cards order by card_id`,
    );
    expect(rows).toEqual([
      { card_id: 'c1', quantity: 1, foil_quantity: 0 },
      { card_id: 'c2', quantity: 2, foil_quantity: 0 },
    ]);
  });

  test('all or nothing: a deck-locked lot fails the whole sale', async () => {
    await q(`insert into player_cards values ('${A}','c1',2,0), ('${A}','c2',1,0)`);
    await q(`insert into decks values ('${A}', 'L1', array['c2'])`);
    await expect(
      q(`select quicksell_many($1::jsonb)`, [
        JSON.stringify([
          { card_id: 'c1', qty: 2, foil: false },
          { card_id: 'c2', qty: 1, foil: false },
        ]),
      ]),
    ).rejects.toThrow(/in use by one of your decks/);
    const [c1] = await q(`select quantity from player_cards where card_id = 'c1'`);
    expect(c1.quantity).toBe(2);
  });

  test('guards Serialized copies and bad input', async () => {
    await q(`insert into player_cards values ('${A}','c2',1,0)`);
    await q(`insert into player_serialized_cards values ('${A}','c2')`);
    await expect(
      q(`select quicksell_many('[{"card_id":"c2","qty":1,"foil":false}]'::jsonb)`),
    ).rejects.toThrow(/Serialized/);
    await expect(q(`select quicksell_many('[]'::jsonb)`)).rejects.toThrow(/Nothing/);
    await expect(
      q(`select quicksell_many('[{"card_id":"c2","qty":0,"foil":false}]'::jsonb)`),
    ).rejects.toThrow(/quantity/);
    const [anon] = await q(
      `select has_function_privilege('anon', 'quicksell_many(jsonb)', 'execute') ok`,
    );
    expect(anon.ok).toBe(false);
  });
});

describe('sell_bounty_card (B4)', () => {
  test('falls back to a foil when the only normal copy backs a Serialized print', async () => {
    await q(`insert into player_cards values ('${A}','c2',1,1)`);
    await q(`insert into player_serialized_cards values ('${A}','c2')`);
    const [{ r }] = await q(`select sell_bounty_card('c2') r`);
    expect(r.sold_for).toBe(150);
    const [pc] = await q(`select quantity, foil_quantity from player_cards where card_id = 'c2'`);
    expect(pc).toEqual({ quantity: 1, foil_quantity: 0 });
  });

  test('a Serialized copy can also be the copy a deck uses (independent checks)', async () => {
    await q(`insert into player_cards values ('${A}','c1',2,0)`);
    await q(`insert into player_serialized_cards values ('${A}','c1')`);
    await q(`insert into decks values ('${A}', 'L1', array['c1'])`);
    const [{ r }] = await q(`select sell_bounty_card('c1') r`);
    expect(r.ok).toBe(true);
  });

  test('still refuses when nothing is spare', async () => {
    await q(`insert into player_cards values ('${A}','c1',1,0)`);
    await q(`insert into player_serialized_cards values ('${A}','c1')`);
    await expect(q(`select sell_bounty_card('c1')`)).rejects.toThrow(/Serialized/);
  });
});
