/**
 * 20261012000006 grading redesign against PGlite: AMG minimum, loyalty perks,
 * weekly special, strict TCA roll + Pristine, crossover (once, never lower,
 * never Pristine, no stat re-fire), pop report trigger, registry milestones
 * paid once for life, and the quicksell price modifiers.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { collectorFavourite, weekSpecial } from '../src/meta/grading';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const MIG = ['20261012000006_grading_redesign.sql', '20261012000093_pending_grading_rpcs.sql']
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
const special = async () => (await q(`select * from grading_week_special()`))[0];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table cards (id text primary key, name text, card_type text, rarity text, essence_types text[]);
    create table profiles (id uuid primary key, credits int default 0, vouchers int default 0, updated_at timestamptz);
    create table player_cards (user_id uuid, card_id text, quantity int default 0, foil_quantity int default 0,
      primary key (user_id, card_id));
    create table decks (user_id uuid, leader_id text, card_ids text[]);
    create table player_serialized_cards (user_id uuid, card_id text);
    create table graded_cards (id uuid primary key default gen_random_uuid(), user_id uuid, card_id text,
      foil boolean default false, service text, speed text, fee_paid int,
      submitted_at timestamptz default now(), ready_at timestamptz, grade numeric, revealed_at timestamptz);
    create table stats (uid uuid, key text, n int);
    create function track_stat(p_uid uuid, p_key text, p_n int, p_abs boolean) returns void language sql
      as $$ insert into stats values (p_uid, p_key, p_n) $$;
    create function track_graded_cards() returns trigger language plpgsql as $$
    begin
      if tg_op = 'UPDATE' and old.grade is null and new.grade is not null then
        if new.grade >= 9 then perform track_stat(new.user_id, 'slabs_mint', 1, false); end if;
      end if;
      return null;
    end $$;
    create trigger graded_cards_track after insert or update of grade on graded_cards
      for each row execute function track_graded_cards();
    create function card_sell_price(p text) returns int language sql immutable as $$
      select case p when 'Mythic' then 1500 when 'Rare' then 40 else 4 end $$;
    create function grading_speed_mult(s text, p text) returns numeric language sql immutable as $$ select 1.0 $$;
    create function grading_bulk_mult(s text, c int) returns numeric language sql immutable as $$ select 1.0 $$;
    create function grading_turnaround(p text) returns interval language sql immutable as $$
      select case p when 'instant' then interval '0' else interval '16 hours' end $$;
    create function grading_voucher_fee(c int) returns int language sql immutable as $$ select greatest(1, ceil(c / 100.0)::int) $$;
    create function grading_grade_mult(g numeric) returns numeric language sql immutable as $$
      select case when g >= 10 then 12.0 when g >= 9 then 4.5 else 2.0 end $$;
    insert into profiles (id, credits) values ('${A}', 100000), ('${B}', 100000);
  `);
  // Four Ember cards (registry total 4 → each card is a 25% milestone).
  const cards = ['e1', 'e2', 'e3', 'e4'];
  for (const c of cards) {
    await q(`insert into cards values ($1, $1, 'Unit', 'Rare', '{Ember}')`, [c]);
    await q(`insert into player_cards values ($1, $2, 50, 0)`, [A, c]);
  }
  await q(`insert into cards values ('lead', 'lead', 'Leader', 'Mythic', '{Ember}')`);
  await db.exec(MIG);
  await db.exec(MIG); // idempotent
}, 60_000);

const submit = (uid: string, items: string, service: string, speed = 'instant') =>
  as(uid, `select submit_grading('${items}'::jsonb, '${service}', '${speed}') r`);
const reveal = async (uid: string) => (await as(uid, `select reveal_graded_cards() r`))[0].r;

describe('grading redesign (20261012000006)', () => {
  test('weekly special and collector favourite mirror the client', async () => {
    const s = await special();
    const at = new Date();
    expect(weekSpecial(at)).toEqual({ service: s.service, colour: s.colour });
    const fav = (await q(`select grading_collector_favourite() f`))[0].f;
    expect(collectorFavourite(at)).toBe(fav);
  });

  test('AMG needs at least 3 cards', async () => {
    await expect(submit(A, '[{"card_id":"e1","qty":2}]', 'amg')).rejects.toThrow(/at least 3/);
  });

  test('AMG order pays the fee and (after reveal) fills the registry once', async () => {
    const before = await credits(A);
    const r = (await submit(A, '[{"card_id":"e1","qty":1},{"card_id":"e2","qty":2}]', 'amg'))[0].r;
    const s = await special();
    const unit = s.service === 'amg' && s.colour === 'Ember' ? 75 : 150;
    expect(r.total_fee).toBe(unit * 3);
    const out = await reveal(A);
    expect(out.revealed).toHaveLength(3);
    // e1 + e2 = 2 of 4 distinct → 25% (400) and 50% (1000), not 75%.
    expect(out.registry.map((x: any) => x.milestone)).toEqual([25, 50]);
    expect(await credits(A)).toBe(before - unit * 3 + 1400);
    // Sell every e2 slab and regrade one: milestone 50 must not pay again.
    const e2 = await q(`select id from graded_cards where card_id = 'e2' and user_id = '${A}'`);
    for (const { id } of e2) await as(A, `select quicksell_graded_card('${id}')`);
    await submit(A, '[{"card_id":"e2","qty":3}]', 'amg');
    expect((await reveal(A)).registry).toEqual([]);
  });

  test('pop report is maintained by trigger', async () => {
    const live = await q(`select card_id, service, grade, count(*)::int n from graded_cards
       where grade is not null and not crossover_pending group by 1, 2, 3 order by 1, 2, 3`);
    const pop = await q(
      `select card_id, service, grade, n from grading_pop where n > 0 order by 1, 2, 3`,
    );
    expect(pop.map((p) => ({ ...p, grade: Number(p.grade) }))).toEqual(
      live.map((p) => ({ ...p, grade: Number(p.grade) })),
    );
  });

  test('loyalty: the 11th card to Keeper is graded free', async () => {
    await submit(A, JSON.stringify([{ card_id: 'e3', qty: 10 }]), 'keeper');
    const r = (await submit(A, '[{"card_id":"e3","qty":1}]', 'keeper'))[0].r;
    expect(r.perk_used).toBe(true);
    expect(r.total_fee).toBe(0);
    expect(r.charged).toBe(0);
    const again = (await submit(A, '[{"card_id":"e3","qty":1}]', 'keeper'))[0].r;
    expect(again.perk_used).toBe(false);
    await reveal(A);
  });

  test('TCA roll is strict and only direct 10s go Pristine', async () => {
    const rolls = await q(`select grading_roll('tca') g from generate_series(1, 4000)`);
    const avg = rolls.reduce((s, r) => s + Number(r.g), 0) / rolls.length;
    expect(avg).toBeGreaterThan(7.45);
    expect(avg).toBeLessThan(7.9); // plain table averages ~8.15, TCA ~7.66
    const sub = (await q(`select grading_subgrades(10.0, true) s`))[0].s;
    expect(Object.values(sub).map(Number)).toEqual([10, 10, 10, 10]);
    const low = (await q(`select grading_subgrades(8.0, false) s`))[0].s;
    expect(Math.min(...Object.values(low).map(Number))).toBe(8);
  });

  test('crossover: once, full fee, grade never drops, no stat re-fire, never Pristine', async () => {
    const [{ id, grade }] = await q(
      `select id, grade from graded_cards where user_id = '${A}' and service = 'keeper' and grade is not null limit 1`,
    );
    const statsBefore = (await q(`select count(*)::int n from stats`))[0].n;
    const before = await credits(A);
    await as(A, `select crossover_slab('${id}', 'tca')`);
    expect(await credits(A)).toBe(before - 400);
    let row = (await q(`select * from graded_cards where id = '${id}'`))[0];
    expect(row.grade).not.toBeNull();
    expect(row.crossover_pending).toBe(true);
    expect(row.service).toBe('keeper'); // target waits in crossover_target
    expect(row.crossover_target).toBe('tca');
    await expect(as(A, `select quicksell_graded_card('${id}')`)).rejects.toThrow(
      /still being graded/,
    );
    await q(`update graded_cards set ready_at = now() - interval '1 second' where id = '${id}'`);
    await reveal(A);
    row = (await q(`select * from graded_cards where id = '${id}'`))[0];
    expect(Number(row.grade)).toBeGreaterThanOrEqual(Number(grade));
    expect(row.pristine).toBe(false);
    expect(row.crossed_from).toBe('keeper');
    expect(row.service).toBe('tca');
    expect(row.subgrades).not.toBeNull();
    expect((await q(`select count(*)::int n from stats`))[0].n).toBe(statsBefore);
    await expect(as(A, `select crossover_slab('${id}', 'amg')`)).rejects.toThrow(/Only Keeper/);
  });

  test('quicksell applies pristine, pop and reputation modifiers', async () => {
    const [{ id }] = await q(
      `insert into graded_cards (user_id, card_id, service, speed, fee_paid, ready_at, grade, pristine)
       values ('${B}', 'e4', 'tca', 'standard', 0, now(), 10.0, true) returning id`,
    );
    const fav = (await q(`select grading_collector_favourite() f`))[0].f;
    const expected = Math.ceil(40 * 40 * 1.6 * (fav === 'tca' ? 1.15 : 1));
    expect((await q(`select grading_slab_price('${id}') p`))[0].p).toBe(expected);
    const r = (await as(B, `select quicksell_graded_card('${id}') r`))[0].r;
    expect(r.price).toBe(expected);
  });
});
