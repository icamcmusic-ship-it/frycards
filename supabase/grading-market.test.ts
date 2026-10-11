/**
 * 20261012000007 against PGlite: trade-ins (retire, token, no stat re-fire,
 * showcase prune), slab listings (escrow, transfer, CPU win, expiry, market
 * value reference), grade insurance, and the slab stats.
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
]
  .map((f) => readFileSync(join(__dirname, 'migrations', f), 'utf8'))
  .join('\n');

let db: PGlite;
const q = async (s: string, p: unknown[] = []) => (await db.query(s, p)).rows as any[];
const as = async (uid: string, s: string) => {
  await db.exec(`select set_config('test.uid', '${uid}', false)`);
  return q(s);
};
const credits = async (uid: string) =>
  (await q(`select credits from profiles where id = $1`, [uid]))[0].credits as number;
const stat = async (uid: string, key: string) =>
  (
    await q(`select coalesce(sum(n), 0)::int n from stats where uid = $1 and key = $2`, [uid, key])
  )[0].n as number;
const slab = (uid: string, grade: number, service = 'keeper', card = 'r1') =>
  q(
    `insert into graded_cards (user_id, card_id, service, speed, fee_paid, ready_at, grade)
     values ($1, $2, $3, 'standard', 70, now(), $4) returning id`,
    [uid, card, service, grade],
  ).then((r) => r[0].id as string);

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
    create function track_graded_cards() returns trigger language plpgsql as $$
    begin
      if tg_op = 'UPDATE' and old.grade is null and new.grade is not null then
        perform track_stat(new.user_id, 'slabs_revealed', 1, false);
      end if;
      return null;
    end $$;
    create trigger graded_cards_track after insert or update of grade on graded_cards
      for each row execute function track_graded_cards();
    create function prune_showcase_slab() returns trigger language plpgsql as $$
    begin
      update profiles set showcase_slabs = array_remove(showcase_slabs, old.id)
       where id = old.user_id and old.id = any(showcase_slabs);
      return old;
    end $$;
    create trigger graded_cards_prune_showcase_owner after update of user_id on graded_cards
      for each row when (old.user_id is distinct from new.user_id) execute function prune_showcase_slab();
    create function card_sell_price(p text) returns int language sql immutable as $$
      select case p when 'Mythic' then 1500 when 'Rare' then 40 else 4 end $$;
    create function grading_speed_mult(s text, p text) returns numeric language sql immutable as $$ select 1.0 $$;
    create function grading_bulk_mult(s text, c int) returns numeric language sql immutable as $$ select 1.0 $$;
    create function grading_turnaround(p text) returns interval language sql immutable as $$
      select case p when 'instant' then interval '0' else interval '16 hours' end $$;
    create function grading_voucher_fee(c int) returns int language sql immutable as $$ select greatest(1, ceil(c / 100.0)::int) $$;
    create function grading_grade_mult(g numeric) returns numeric language sql immutable as $$
      select case when g >= 10 then 12.0 when g >= 9 then 4.5 when g >= 7 then 2.1 else 1.5 end $$;
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
    insert into profiles (id, credits) values ('${A}', 100000), ('${B}', 100000);
    insert into cards values ('r1', 'r1', 'Unit', 'Rare', '{Ember}'), ('m1', 'm1', 'Unit', 'Mythic', '{Void}');
    insert into player_cards values ('${A}', 'r1', 50, 0), ('${A}', 'm1', 5, 0);
  `);
  await db.exec(MIG);
  await db.exec(MIG);
}, 60_000);

describe('grading market, trade-ins and insurance (20261012000007)', () => {
  test('trade-in: five sub-7 slabs → one token; retired, pruned, no stat re-fire', async () => {
    const ids = [] as string[];
    for (let i = 0; i < 5; i++) ids.push(await slab(A, 6));
    const high = await slab(A, 8);
    await q(
      `update profiles set showcase_slabs = array['${ids[0]}'::uuid, '${high}'::uuid] where id = '${A}'`,
    );
    await expect(
      as(A, `select trade_in_slabs(array['${ids.slice(0, 4).join("','")}', '${high}']::uuid[])`),
    ).rejects.toThrow(/below/);
    const before = (await q(`select count(*)::int n from stats`))[0].n;
    const r = (await as(A, `select trade_in_slabs(array['${ids.join("','")}']::uuid[]) r`))[0].r;
    expect(r.tokens).toBe(1);
    const rows = await q(`select * from graded_cards where id = any($1::uuid[])`, [ids]);
    expect(rows.every((x) => x.retired && x.grade === null && Number(x.retired_grade) === 6)).toBe(
      true,
    );
    expect(
      (await q(`select showcase_slabs from profiles where id = '${A}'`))[0].showcase_slabs,
    ).toEqual([high]);
    expect(await stat(A, 'slab_trade_ins')).toBe(1);
    expect((await q(`select count(*)::int n from stats`))[0].n).toBe(before + 1);
    // Retired slabs: never re-revealed, never sold back to the house.
    expect((await as(A, `select reveal_graded_cards() r`))[0].r.revealed).toEqual([]);
    await expect(as(A, `select quicksell_graded_card('${ids[0]}')`)).rejects.toThrow(
      /being graded/,
    );
    expect(
      (
        await q(
          `select coalesce(sum(n), 0)::int n from grading_pop where card_id = 'r1' and grade = 6`,
        )
      )[0].n,
    ).toBe(0);
  });

  test('token pays one standard card; insurance refunds the base fee only', async () => {
    const before = await credits(A);
    const r = (
      await as(
        A,
        `select submit_grading_v2('[{"card_id":"r1","qty":2}]'::jsonb, 'keeper', 'standard', 'credits', true, true) r`,
      )
    )[0].r;
    expect(r.token_used).toBe(true);
    const special = (await q(`select * from grading_week_special()`))[0];
    const unit = special.service === 'keeper' && special.colour === 'Ember' ? 35 : 70;
    expect(r.total_fee).toBe(unit);
    expect(r.insurance).toBe(Math.ceil(unit * 0.1));
    expect(await credits(A)).toBe(before - unit - Math.ceil(unit * 0.1));
    await expect(
      as(
        A,
        `select submit_grading_v2('[{"card_id":"r1","qty":1}]'::jsonb, 'keeper', 'standard', 'credits', false, true)`,
      ),
    ).rejects.toThrow(/no trade-in token/);
    // Force the paid card under 7 and reveal: the base fee comes back.
    await q(
      `update graded_cards set ready_at = now() - interval '1 minute' where user_id = '${A}' and grade is null and not retired`,
    );
    await q(
      `create or replace function grading_roll(p_service text) returns numeric language sql as $$ select 6.0 $$`,
    );
    const mid = await credits(A);
    const out = (await as(A, `select reveal_graded_cards() r`))[0].r;
    expect(out.refunded).toBe(unit);
    expect(await credits(A)).toBe(mid + unit);
    expect(await stat(A, 'insured_saves')).toBe(1);
  });

  test('slab listing: escrow, sale transfers ownership and prunes pins', async () => {
    const id = await slab(A, 9, 'tca', 'm1');
    await q(`update profiles set showcase_slabs = array['${id}'::uuid] where id = '${A}'`);
    const l = (await as(A, `select create_slab_listing('${id}', 'fixed', 5000) r`))[0].r;
    await expect(as(A, `select quicksell_graded_card('${id}')`)).rejects.toThrow(/listed/);
    await expect(as(A, `select crack_graded_slab('${id}')`)).rejects.toThrow(/listed/);
    await expect(as(A, `select create_slab_listing('${id}', 'fixed', 10)`)).rejects.toThrow(
      /already listed/,
    );
    const sellerBefore = await credits(A);
    await as(B, `select buy_listing('${l.listing_id}')`);
    const row = (await q(`select user_id, listing_id from graded_cards where id = '${id}'`))[0];
    expect(row).toEqual({ user_id: B, listing_id: null });
    expect(await credits(A)).toBe(sellerBefore + 5000 - 250);
    expect(
      (await q(`select showcase_slabs from profiles where id = '${A}'`))[0].showcase_slabs,
    ).toEqual([]);
    expect(await stat(A, 'slabs_sold_market')).toBe(1);
    // Bought slabs never fill the buyer's registry.
    const reg = await q(`select * from grading_registry_status('${B}')`);
    expect(reg.every((r) => r.have === 0)).toBe(true);
  });

  test('auction: CPU ceiling from the slab reference, CPU win retires, expiry releases', async () => {
    const id = await slab(A, 9, 'amg', 'm1');
    const l = (await as(A, `select create_slab_listing('${id}', 'auction', 100) r`))[0].r;
    const ref = Math.ceil(1500 * 4.5 * 1.3);
    const fav = l.cpu_favourite;
    const ceil = (
      await q(`select cpu_ceiling from market_listing_cpu where listing_id = '${l.listing_id}'`)
    )[0].cpu_ceiling;
    expect(ceil).toBe(Math.round(ref * (fav === 'amg' ? 1.2 : 1)));
    await q(`update market_listings set cpu_leading = true, current_bid = 9000, bid_count = 1,
             ends_at = now() - interval '1 second' where id = '${l.listing_id}'`);
    await q(`select settle_expired_listings()`);
    expect((await q(`select retired from graded_cards where id = '${id}'`))[0].retired).toBe(true);

    const id2 = await slab(A, 8, 'keeper');
    const l2 = (await as(A, `select create_slab_listing('${id2}', 'auction', 10) r`))[0].r;
    await q(
      `update market_listings set ends_at = now() - interval '1 second' where id = '${l2.listing_id}'`,
    );
    await q(`select settle_expired_listings()`);
    expect(
      (await q(`select listing_id from graded_cards where id = '${id2}'`))[0].listing_id,
    ).toBeNull();
    const mv = (await q(`select get_slab_market_value('m1', 9.0, 'amg') v`))[0].v;
    expect(mv.reference).toBe(ref);
    expect(mv.sales).toBe(1);
  });

  test('achievements and missions are seeded', async () => {
    const keys = (await q(`select stat_key from achievements`)).map((r) => r.stat_key);
    for (const k of [
      'pristine_slabs',
      'crossover_upgrades',
      'slab_trade_ins',
      'slabs_sold_market',
      'insured_saves',
      'registry_complete',
    ])
      expect(keys).toContain(k);
    expect((await q(`select count(*)::int n from missions`))[0].n).toBe(2);
  });
});
