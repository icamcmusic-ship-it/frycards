/**
 * Match tickets v2 (20261011000002) against PGlite: the ticket pins mode and
 * seats (A21), `too_early` is retryable (A20/B2), the CPU gate mirrors
 * src/meta/cpuAccess.ts, rewards match src/game/poker/rewards.ts exactly
 * (F-5), and p_stats is clamped before it reaches track_stat (§5).
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { MODE_IDS } from '../src/game/poker/constants';
import { placementReward } from '../src/game/poker/rewards';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const file = (f: string) => readFileSync(join(__dirname, 'migrations', f), 'utf8');

let db: PGlite;
const q = async (s: string, p: unknown[] = []) => (await db.query(s, p)).rows as any[];

async function ticket(ageSec: number, mode: string | null, seats: number | null, uid = A) {
  const [r] = await q(
    `insert into match_tickets (uid, started_at, mode, seats)
     values ($1, now() - make_interval(secs => $2), $3, $4) returning match_id`,
    [uid, ageSec, mode, seats],
  );
  return r.match_id as string;
}
const claim = async (
  id: string,
  place: number,
  seats: number,
  mode: string,
  stats: unknown = null,
  hands: number | null = null,
) =>
  (
    await q(`select record_match_placement($1, $2, $3, $4, $5::jsonb, $6) r`, [
      id,
      place,
      seats,
      mode,
      stats === null ? null : JSON.stringify(stats),
      hands,
    ])
  )[0].r;
const stats = async () =>
  Object.fromEntries(
    (await q(`select key, sum(n)::int n from stats group by key`)).map((r) => [r.key, r.n]),
  );

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table profiles (id uuid primary key, credits int default 0, vouchers int default 0, wins int default 0,
      losses int default 0, games_played int default 0, last_match_at timestamptz, updated_at timestamptz,
      xp int default 0, level int default 1, role text default 'player');
    create table match_tickets (match_id uuid primary key default gen_random_uuid(), uid uuid,
      started_at timestamptz default now(), redeemed_at timestamptz, won boolean, place int, seats int, mode text);
    create table match_receipts (match_id uuid primary key, uid uuid);
    create table cards (id text primary key, card_type text);
    create table player_cards (user_id uuid, card_id text, quantity int default 0, foil_quantity int default 0);
    create table stat_once (user_id uuid, key text, primary key (user_id, key));
    create function stat_once_claim(p_uid uuid, p_key text) returns boolean language plpgsql as $$
      begin insert into stat_once values (p_uid, p_key) on conflict do nothing; return found; end $$;
    create function mission_period_start(p text) returns date language sql as $$
      select case when p = 'daily' then current_date else date_trunc('week', now())::date end $$;
    create function level_for_xp(p int) returns int language sql as $$ select 1 + p / 1000 $$;
    create function level_reward_credits() returns int language sql as $$ select 0 $$;
    create function grant_bp_xp(p_uid uuid, p_xp int) returns boolean language sql as $$ select true $$;
    create table stats (uid uuid, key text, n int);
    create function track_stat(p_uid uuid, p_key text, p_n int, p_abs boolean) returns void language sql
      as $$ insert into stats values (p_uid, p_key, p_n) $$;
    create function record_match_result(p_won boolean, p_match_id uuid) returns jsonb language sql as $$ select null::jsonb $$;
    grant execute on function record_match_result(boolean, uuid) to authenticated;
    create function begin_match() returns jsonb language sql as $$ select null::jsonb $$;
    grant execute on function begin_match() to authenticated;
    insert into profiles (id, role) values ('${A}', 'creator'), ('${B}', 'player');
    insert into cards values ('lead-1', 'Leader'), ('pow-1', 'Power');
    insert into player_cards values ('${A}', 'lead-1', 1, 0), ('${A}', 'pow-1', 1, 0);
  `);
  await db.exec(file('20261009000000_poker_placement_rewards.sql'));
  await db.exec(file('20261011000002_match_tickets_v2.sql'));
  // Twice: the file is idempotent.
  await db.exec(file('20261011000002_match_tickets_v2.sql'));
  await db.exec(`set test.uid = '${A}'`);
}, 60_000);

beforeEach(async () => {
  await q(`truncate stats, stat_once`);
  await q(
    `update match_tickets set redeemed_at = now() - interval '2 days' where redeemed_at is not null`,
  );
});

describe('begin_match v2', () => {
  test('records mode and seats, voids the previous open ticket, returns the floor', async () => {
    const [{ r: first }] = await q(`select begin_match('standard', 6) r`);
    expect(first.floor_seconds).toBe(720);
    const [{ r: second }] = await q(`select begin_match('quick', 2) r`);
    const [t1] = await q(`select voided_at from match_tickets where match_id = $1`, [
      first.match_id,
    ]);
    const [t2] = await q(`select mode, seats from match_tickets where match_id = $1`, [
      second.match_id,
    ]);
    expect(t1.voided_at).not.toBeNull();
    expect(t2).toEqual({ mode: 'quick', seats: 2 });
    expect((await claim(first.match_id, 1, 6, 'standard')).status).toBe('invalid');
  });

  test('a call with no arguments still works (old clients)', async () => {
    const [{ r }] = await q(`select begin_match() r`);
    expect(r.match_id).toBeTruthy();
    expect(r.floor_seconds).toBeNull();
  });

  test('is Creator-only, like the client CPU lock', async () => {
    await q(`set test.uid = '${B}'`);
    await expect(q(`select begin_match('quick', 2)`)).rejects.toThrow(/not open/);
    const id = await ticket(3600, 'quick', 2, B);
    await expect(claim(id, 1, 2, 'quick')).rejects.toThrow(/not open/);
    await q(`set test.uid = '${A}'`);
  });

  test('legacy RPCs are out of the API', async () => {
    const [r] = await q(`select
      has_function_privilege('authenticated', 'record_match_result(boolean, uuid)', 'execute') legacy,
      has_function_privilege('authenticated', 'begin_match_legacy_v0()', 'execute') b0,
      has_function_privilege('anon', 'record_match_placement(uuid,int,int,text,jsonb,int)', 'execute') anon,
      has_function_privilege('authenticated', 'record_match_placement(uuid,int,int,text,jsonb,int)', 'execute') auth`);
    expect(r).toEqual({ legacy: false, b0: false, anon: false, auth: true });
  });
});

describe('record_match_placement v2', () => {
  test('pays exactly what the client preview shows, every place, seat count and mode', async () => {
    for (const mode of MODE_IDS)
      for (let seats = 2; seats <= 6; seats++)
        for (let place = 1; place <= seats; place++) {
          const r = await claim(await ticket(7200, mode, seats), place, seats, mode);
          const want = placementReward(place, seats, mode);
          expect([r.reward, r.xp_gained, r.bp_xp_gained], `${place}/${seats} ${mode}`).toEqual([
            want.credits,
            want.xp,
            want.bpXp,
          ]);
          await q(`update match_tickets set redeemed_at = now() - interval '2 days'`);
        }
  });

  test("uses the ticket's mode and seats, not the client's (A21)", async () => {
    const id = await ticket(7200, 'quick', 6);
    const r = await claim(id, 1, 2, 'deep');
    expect([r.mode, r.seats, r.reward]).toEqual([
      'quick',
      6,
      placementReward(1, 6, 'quick').credits,
    ]);
    // The floor too: a 6-seat Standard ticket claimed as heads-up is still 12 min.
    const early = await claim(await ticket(300, 'standard', 6), 1, 2, 'standard');
    expect(early.status).toBe('too_early');
  });

  test('too_early is retryable and says when; the ticket then pays', async () => {
    const id = await ticket(600, 'standard', 6);
    const r = await claim(id, 2, 6, 'standard');
    expect(r).toMatchObject({ status: 'too_early', retryable: true });
    expect(r.retry_after).toBeGreaterThanOrEqual(119);
    expect(r.retry_after).toBeLessThanOrEqual(121);
    await q(
      `update match_tickets set started_at = now() - interval '13 minutes' where match_id = $1`,
      [id],
    );
    expect((await claim(id, 2, 6, 'standard')).reward).toBe(
      placementReward(2, 6, 'standard').credits,
    );
    expect((await claim(id, 2, 6, 'standard')).status).toBe('duplicate');
  });

  test('a non-win before max(3 x seats, 8) hands pays nothing (F-5)', async () => {
    const r = await claim(await ticket(7200, 'standard', 6), 6, 6, 'standard', null, 10);
    expect(r).toMatchObject({ status: 'too_short', min_hands: 18 });
    const ok = await claim(await ticket(7200, 'standard', 6), 6, 6, 'standard', null, 18);
    expect(ok.reward).toBe(15);
    // A claimed hand count above elapsed / 15 is clamped: 200 s allows 13 hands.
    const fast = await claim(await ticket(200, 'quick', 2), 2, 2, 'quick', null, 500);
    expect(fast.reward).toBe(placementReward(2, 2, 'quick').credits);
  });

  test('server-only stats come from the ticket', async () => {
    await claim(await ticket(7200, 'deep', 6), 1, 6, 'deep');
    const { level: _level, ...rest } = await stats();
    expect(rest).toEqual({
      games_played: 1,
      wins: 1,
      deep_wins: 1,
      full_table_wins: 1,
      podium_finishes: 1,
      long_games: 1,
    });
  });

  test('p_stats are clamped per match, keywords allow-listed and counted once', async () => {
    await claim(
      await ticket(7200, 'quick', 4),
      1,
      4,
      'quick',
      {
        hands_won: 9999,
        showdown_wins: 3,
        made_flush: 50,
        made_quads: 4,
        seats_busted: 10,
        triple_bust: 1,
        big_pots: 7,
        short_stack: true,
        powers_cast: -5,
        kw: ['Tax', 'Tax', 'Bounty', 'DROP TABLE', 'Fly'],
        leader: 'lead-1',
      },
      30,
    );
    const s = await stats();
    expect(s.hands_won).toBe(30); // ≤ hands
    expect(s.showdown_wins).toBe(3);
    expect(s.made_flush).toBe(6);
    expect(s.made_quads).toBe(1);
    expect(s.seats_busted).toBe(3);
    expect(s.triple_bust).toBe(1);
    expect(s.big_pots).toBe(5);
    expect(s.short_stack_win).toBe(1);
    expect(s.powers_cast).toBeUndefined();
    expect(s.keywords_distinct).toBe(2);
    expect(s.keywords_today).toBe(2);
    expect(s.leaders_won_with).toBe(1);
    // The same keywords and Leader again add nothing to the lifetime counts.
    await q(`truncate stats`);
    await claim(
      await ticket(7200, 'quick', 4),
      1,
      4,
      'quick',
      { kw: ['Tax'], leader: 'lead-1' },
      30,
    );
    const again = await stats();
    expect(again.keywords_distinct).toBeUndefined();
    expect(again.leaders_won_with).toBeUndefined();
  });

  test('a Leader the player does not own, or a loss, never counts for leaders_won_with', async () => {
    await claim(await ticket(7200, 'quick', 2), 1, 2, 'quick', { leader: 'lead-9' }, 30);
    await claim(await ticket(7200, 'quick', 2), 2, 2, 'quick', { leader: 'lead-1' }, 30);
    expect((await stats()).leaders_won_with).toBeUndefined();
  });

  test('triple_bust needs four seats', async () => {
    await claim(await ticket(7200, 'quick', 3), 1, 3, 'quick', { triple_bust: 1 }, 30);
    expect((await stats()).triple_bust).toBeUndefined();
  });

  test('a legacy ticket (no mode or seats) falls back to the client values', async () => {
    const r = await claim(await ticket(7200, null, null), 1, 6, 'standard');
    expect(r.reward).toBe(100);
  });
});
