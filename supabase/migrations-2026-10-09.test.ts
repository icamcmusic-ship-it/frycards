/**
 * The FryCards Poker placement reward (20261009000000) against PGlite. Stubs
 * cover only the parts of the live schema record_match_placement touches; the
 * ticket table mirrors 20260826000000 + the 20261008000002 `won` column.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { placementReward } from '../src/game/poker/rewards';

const A = '11111111-1111-1111-1111-111111111111';
const MIGRATION = readFileSync(
  join(__dirname, 'migrations', '20261009000000_poker_placement_rewards.sql'),
  'utf8',
);

let db: PGlite;
const q = async (s: string) => (await db.query(s)).rows as any[];

/** A ticket for A that started `ageSec` seconds ago. */
async function ticket(ageSec: number): Promise<string> {
  const [r] = await q(
    `insert into match_tickets (uid, started_at) values ('${A}', now() - make_interval(secs => ${ageSec})) returning match_id`,
  );
  return r.match_id;
}

const claim = async (id: string, place: number, seats: number, mode: string) =>
  (await q(`select record_match_placement('${id}', ${place}, ${seats}, '${mode}') r`))[0].r;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table profiles (id uuid primary key, credits int default 0, wins int default 0, losses int default 0,
      games_played int default 0, last_match_at timestamptz, updated_at timestamptz, xp int default 0, level int default 1);
    create table match_tickets (match_id uuid primary key default gen_random_uuid(), uid uuid,
      started_at timestamptz default now(), redeemed_at timestamptz, won boolean);
    create table match_receipts (match_id uuid primary key, uid uuid);
    create function grant_xp(p_uid uuid, p_xp int) returns jsonb language sql as $$
      update profiles set xp = xp + p_xp where id = p_uid returning jsonb_build_object('level', level, 'leveled_up', false) $$;
    create function grant_bp_xp(p_uid uuid, p_xp int) returns boolean language sql as $$ select true $$;
    create table stats (uid uuid, key text, n int);
    create function track_stat(p_uid uuid, p_key text, p_n int, p_abs boolean) returns void language sql
      as $$ insert into stats values (p_uid, p_key, p_n) $$;
    insert into profiles (id) values ('${A}');
  `);
  await db.exec(MIGRATION);
  await db.exec(`set test.uid = '${A}'`);
}, 60_000);

describe('record_match_placement', () => {
  test('pays by place exactly as the client preview does', async () => {
    for (const [place, seats, mode] of [
      [1, 6, 'standard'],
      [2, 6, 'standard'],
      [6, 6, 'standard'],
      [1, 2, 'quick'],
      [3, 4, 'deep'],
    ] as const) {
      const r = await claim(await ticket(3600), place, seats, mode);
      const want = placementReward(place, seats, mode);
      expect(r.reward, `${place}/${seats} ${mode}`).toBe(want.credits);
      expect(r.xp_gained).toBe(want.xp);
      expect(r.bp_xp_gained).toBe(want.bpXp);
    }
  });

  test('a six-seat Standard table pays 100, 76, 61, 49, 43, 40', async () => {
    const paid: number[] = [];
    for (let p = 1; p <= 6; p++)
      paid.push((await claim(await ticket(3600), p, 6, 'standard')).reward);
    expect(paid).toEqual([100, 76, 61, 49, 43, 40]);
  });

  test('records the place, seats and mode on the ticket, and the win flag for 1st', async () => {
    const id = await ticket(3600);
    await claim(id, 1, 5, 'deep');
    const [t] = await q(
      `select place, seats, mode, won from match_tickets where match_id = '${id}'`,
    );
    expect(t).toEqual({ place: 1, seats: 5, mode: 'deep', won: true });
  });

  test('the minimum length scales with mode and table size', async () => {
    // Standard floor is 12 min at six seats, 4 min heads-up.
    expect((await claim(await ticket(5 * 60), 1, 6, 'standard')).status).toBe('too_early');
    expect((await claim(await ticket(5 * 60), 1, 2, 'standard')).reward).toBe(100);
    // Never under 45 s.
    expect((await claim(await ticket(30), 2, 2, 'quick')).status).toBe('too_early');
  });

  test('rejects nonsense placements and spent tickets', async () => {
    const id = await ticket(3600);
    await expect(claim(id, 7, 6, 'standard')).rejects.toThrow(/Place/);
    await expect(claim(id, 1, 9, 'standard')).rejects.toThrow(/Seats/);
    await expect(claim(id, 1, 6, 'turbo')).rejects.toThrow(/mode/);
    await claim(id, 1, 6, 'standard');
    expect((await claim(id, 1, 6, 'standard')).status).toBe('duplicate');
    expect(
      (await q(`select record_match_placement('${A.replace('1', '9')}', 1, 2, 'quick') r`))[0].r
        .status,
    ).toBe('invalid');
  });

  test('is not callable by anonymous users', async () => {
    const [r] = await q(
      `select has_function_privilege('anon', 'record_match_placement(uuid, int, int, text)', 'execute') ok`,
    );
    expect(r.ok).toBe(false);
  });
});
