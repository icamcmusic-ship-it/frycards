/**
 * 20261013000000 against PGlite: slab pins live in profiles.showcase_cards as
 * 'slab:<id>' entries next to cards, share the 6-slot cap, migrate from the
 * legacy showcase_slabs column, and are pruned on crack / owner change /
 * retire.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const MIG = readFileSync(
  join(__dirname, 'migrations', '20261013000000_unified_showcase.sql'),
  'utf8',
);

let db: PGlite;
const q = async (s: string, p: unknown[] = []) => (await db.query(s, p)).rows as any[];
const as = async (uid: string, s: string, p: unknown[] = []) => {
  await db.exec(`select set_config('test.uid', '${uid}', false)`);
  return q(s, p);
};
const slab = (uid: string, grade: number | null = 9) =>
  q(`insert into graded_cards (user_id, card_id, grade) values ($1, 'm1', $2) returning id`, [
    uid,
    grade,
  ]).then((r) => r[0].id as string);
const showcase = async (uid: string) =>
  (await q(`select showcase_cards from profiles where id = $1`, [uid]))[0]
    .showcase_cards as string[];

let legacy: string;
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table profiles (id uuid primary key, updated_at timestamptz,
      showcase_cards text[] default '{}', showcase_slabs uuid[] default '{}');
    create table player_cards (user_id uuid, card_id text, quantity int default 0, foil_quantity int default 0,
      primary key (user_id, card_id));
    create table graded_cards (id uuid primary key default gen_random_uuid(), user_id uuid not null,
      card_id text, grade numeric, retired boolean not null default false,
      crossover_pending boolean not null default false);
    create function prune_showcase_slab() returns trigger language plpgsql as $$ begin return old; end $$;
    create trigger graded_cards_prune_showcase after delete on graded_cards
      for each row execute function prune_showcase_slab();
    create trigger graded_cards_prune_showcase_owner after update of user_id on graded_cards
      for each row when (old.user_id is distinct from new.user_id) execute function prune_showcase_slab();
    create trigger graded_cards_prune_showcase_retired after update of retired on graded_cards
      for each row when (new.retired and not old.retired) execute function prune_showcase_slab();
    insert into profiles (id) values ('${A}'), ('${B}');
    insert into player_cards values ('${A}', 'c1', 1, 0), ('${A}', 'c2', 1, 0);
    update profiles set showcase_cards = '{c1}' where id = '${A}';
  `);
  legacy = await slab(A);
  await q(`update profiles set showcase_slabs = array[$1::uuid] where id = $2`, [legacy, A]);
  await db.exec(MIG);
});

describe('unified showcase', () => {
  test('legacy slab pins migrate into showcase_cards after the cards', async () => {
    expect(await showcase(A)).toEqual(['c1', `slab:${legacy}`]);
    const r = await q(`select showcase_slabs from profiles where id = $1`, [A]);
    expect(r[0].showcase_slabs).toEqual([]);
  });

  test('cards and slabs mix, in order, and get_showcase_slabs returns the slabs', async () => {
    const s2 = await slab(A, 10);
    await as(A, `select set_showcase_cards($1)`, [[`slab:${s2}`, 'c1', `slab:${legacy}`]]);
    const rows = await q(`select id from get_showcase_slabs($1)`, [A]);
    expect(rows.map((r) => r.id)).toEqual([s2, legacy]);
  });

  test('shared 6-slot cap', async () => {
    const ids = [await slab(A), await slab(A), await slab(A), await slab(A), await slab(A)];
    await expect(
      as(A, `select set_showcase_cards($1)`, [['c1', 'c2', ...ids.map((i) => `slab:${i}`)]]),
    ).rejects.toThrow(/at most 6/);
  });

  test("rejects someone else's, ungraded, retired or malformed slabs", async () => {
    const other = await slab(B);
    const ungraded = await slab(A, null);
    const retired = await slab(A);
    await q(`update graded_cards set retired = true where id = $1`, [retired]);
    for (const id of [other, ungraded, retired])
      await expect(as(A, `select set_showcase_cards($1)`, [[`slab:${id}`]])).rejects.toThrow(
        /own graded slabs/,
      );
    await expect(as(A, `select set_showcase_cards($1)`, [['slab:nope']])).rejects.toThrow(
      /Invalid slab/,
    );
  });

  test('crack, owner change and retire prune the slab entry', async () => {
    const [s1, s2, s3] = [await slab(A), await slab(A), await slab(A)];
    await as(A, `select set_showcase_cards($1)`, [
      ['c1', `slab:${s1}`, `slab:${s2}`, `slab:${s3}`],
    ]);
    await q(`delete from graded_cards where id = $1`, [s1]);
    await q(`update graded_cards set user_id = $1 where id = $2`, [B, s2]);
    await q(`update graded_cards set retired = true where id = $1`, [s3]);
    expect(await showcase(A)).toEqual(['c1']);
  });

  test('set_showcase_slabs shim swaps slab entries and keeps cards', async () => {
    const s = await slab(A);
    await as(A, `select set_showcase_slabs($1)`, [[s]]);
    expect(await showcase(A)).toEqual(['c1', `slab:${s}`]);
  });
});
