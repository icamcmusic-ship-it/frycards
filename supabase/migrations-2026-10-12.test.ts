/**
 * 2026-10-12 migrations against PGlite:
 *  - 20261012000000 collection stats: one statement-level emitter per
 *    statement, new_cards once per card for life (seeded for the existing
 *    collection), graded keys, non-Leader targets and the backfill.
 *  - 20261012000001 difficulty multiplier: recorded on the ticket at
 *    begin_match, credits only, mirrored by src/game/poker/rewards.ts.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { placementReward } from '../src/game/poker/rewards';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const file = (f: string) => readFileSync(join(__dirname, 'migrations', f), 'utf8');

let db: PGlite;
const q = async (s: string, p: unknown[] = []) => (await db.query(s, p)).rows as any[];
/** Latest absolute value / summed delta per key, per user. */
const stats = async (uid: string) =>
  Object.fromEntries(
    (
      await q(
        `select key, case when bool_or(abs) then max(n) else sum(n) end::int n
           from stats where uid = $1 group by key`,
        [uid],
      )
    ).map((r) => [r.key, r.n]),
  );
const calls = async () => (await q(`select count(*)::int n from emits`))[0].n as number;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table cards (id text primary key, card_type text, rarity text, essence_types text[]);
    create table player_cards (user_id uuid, card_id text, quantity int default 0, foil_quantity int default 0,
      primary key (user_id, card_id));
    create table graded_cards (id uuid primary key default gen_random_uuid(), user_id uuid, card_id text,
      foil boolean default false, grade numeric);
    create table stat_once (user_id uuid, key text, primary key (user_id, key));
    create function stat_once_claim(p_uid uuid, p_key text) returns boolean language plpgsql as $$
      begin insert into stat_once values (p_uid, p_key) on conflict do nothing; return found; end $$;
    create table missions (id text primary key, name text not null, description text not null,
      stat_key text not null, target int not null check (target > 0), reward_credits int not null default 0,
      reward_vouchers int not null default 0, reward_bp_xp int not null default 0,
      cadence text not null, pool text not null default 'rotating');
    create table achievements (id text primary key, name text not null, description text not null,
      category text not null default 'general', stat_key text not null, target int not null check (target > 0),
      reward_credits int not null default 0, reward_vouchers int not null default 0, reward_pack_id uuid,
      sort int not null default 0);
    create table player_achievements (user_id uuid, achievement_id text, progress int default 0,
      primary key (user_id, achievement_id));
    create table stats (uid uuid, key text, n int, abs boolean);
    create table emits (uid uuid);
    create function track_stat(p_uid uuid, p_key text, p_n int, p_abs boolean) returns void language sql
      as $$ insert into stats values (p_uid, p_key, p_n, p_abs) $$;
    insert into cards values
      ('lead-r', 'Leader', 'Rare', '{Ember}'), ('lead-m', 'Leader', 'Mythic', '{Void}'),
      ('myth-1', 'Unit', 'Mythic', '{Ember,Tide}'), ('myth-2', 'Event', 'Mythic', '{Void}'),
      ('fa-1', 'Unit', 'Full-Art', '{Tide}'), ('com-1', 'Unit', 'Common', '{Ember}'),
      ('loc-1', 'Location', 'Common', '{}'), ('loc-2', 'Location', 'Rare', '{Root}');
    insert into achievements (id, name, description, category, stat_key, target)
      values ('collector_25', 'x', 'x', 'collection', 'unique_cards', 25);
    -- A player who already owns cards and slabs before the migration.
    insert into player_cards values ('${A}', 'com-1', 3, 1), ('${A}', 'lead-r', 1, 0), ('${A}', 'myth-1', 1, 0);
    insert into graded_cards (user_id, card_id, foil, grade) values
      ('${A}', 'com-1', true, 9), ('${A}', 'com-1', false, 8), ('${A}', 'lead-r', false, null);
  `);
  await db.exec(file('20261012000000_collection_stats.sql'));
  await db.exec(file('20261012000000_collection_stats.sql'));
  // Count statement-trigger invocations through a wrapper on the per-user function.
  await db.exec(`
    create trigger graded_cards_track after insert or update of grade on graded_cards
      for each row execute function track_graded_cards();
    alter function track_collection_stats(uuid) rename to track_collection_stats_inner;
    create function track_collection_stats(p uuid) returns void language plpgsql as $$
      begin insert into emits values (p); perform track_collection_stats_inner(p); end $$;
  `);
}, 60_000);

describe('collection stats (20261012000000)', () => {
  test('targets are the non-Leader counts, computed at insert', async () => {
    const t = Object.fromEntries(
      (await q(`select id, target from achievements`)).map((r) => [r.id, r.target]),
    );
    expect(t.own_mythic_all).toBe(2); // the Mythic Leader is excluded
    expect(t.own_ember_all).toBe(2); // myth-1 + com-1, not lead-r
    expect(t.own_void_all).toBe(1);
    expect(t.own_locations).toBe(2);
    expect(t.own_leaders_6).toBe(6);
    expect(t.own_gale_all).toBeUndefined(); // empty colour: no unreachable row
    expect(
      (await q(`select count(*)::int n from missions where stat_key = 'new_cards'`))[0].n,
    ).toBe(2);
  });

  test('backfill: absolute collection and graded keys, no new_cards for what was held', async () => {
    const s = await stats(A);
    expect(s).toMatchObject({
      unique_cards: 3,
      own_leaders: 1,
      own_mythic: 1,
      own_ember: 2,
      own_tide: 1,
      own_foil_unique: 1,
      own_playsets: 1,
      graded_foil: 1,
      graded_leader: 1,
      graded_distinct: 2,
    });
    expect(s.new_cards).toBeUndefined();
  });

  describe('live emitters', () => {
    beforeEach(async () => {
      await q(`truncate stats, emits`);
    });

    test('a multi-row insert is one emitter call per user and pays new cards once', async () => {
      await q(`insert into player_cards values ('${B}', 'myth-2', 1, 0), ('${B}', 'fa-1', 2, 1),
               ('${B}', 'loc-1', 1, 0), ('${A}', 'loc-2', 1, 0)`);
      expect(await calls()).toBe(2);
      const b = await stats(B);
      expect(b).toMatchObject({ new_cards: 3, unique_cards: 3, own_full_art: 1, own_locations: 1 });
      expect((await stats(A)).new_cards).toBe(1);
    });

    test('selling and re-buying never re-pays new_cards; updates still refresh own_*', async () => {
      await q(
        `update player_cards set quantity = 0, foil_quantity = 0 where user_id = '${B}' and card_id = 'myth-2'`,
      );
      await q(`update player_cards set quantity = 1 where user_id = '${B}' and card_id = 'myth-2'`);
      await q(
        `insert into player_cards values ('${B}', 'myth-2', 1, 0) on conflict (user_id, card_id)
         do update set quantity = player_cards.quantity + 1`,
      );
      expect((await stats(B)).new_cards).toBeUndefined();
      expect((await stats(B)).own_playsets).toBe(1); // fa-1 (2 + 1 foil)
    });

    test('graded inserts emit foil / Leader / distinct, distinct once per card', async () => {
      await q(`insert into graded_cards (user_id, card_id, foil) values
               ('${B}', 'lead-m', true), ('${B}', 'lead-m', false), ('${A}', 'com-1', false)`);
      expect(await stats(B)).toMatchObject({
        cards_graded: 2,
        graded_foil: 1,
        graded_leader: 2,
        graded_distinct: 1,
      });
      expect((await stats(A)).graded_distinct).toBeUndefined(); // seeded at migration
    });
  });

  test('the emitters are out of the API', async () => {
    const [r] = await q(`select
      has_function_privilege('authenticated', 'track_collection_stats_inner(uuid)', 'execute') a,
      has_function_privilege('authenticated', 'track_collection_stats_stmt()', 'execute') b`);
    expect(r).toEqual({ a: false, b: false });
  });
});

describe('difficulty multiplier (20261012000001)', () => {
  let m: PGlite;
  const mq = async (s: string, p: unknown[] = []) => (await m.query(s, p)).rows as any[];

  beforeAll(async () => {
    m = new PGlite();
    await m.exec(`
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
      create function mission_period_start(p text) returns date language sql as $$ select current_date $$;
      create function level_for_xp(p int) returns int language sql as $$ select 1 + p / 1000 $$;
      create function level_reward_credits() returns int language sql as $$ select 0 $$;
      create function grant_bp_xp(p_uid uuid, p_xp int) returns boolean language sql as $$ select true $$;
      create function track_stat(p_uid uuid, p_key text, p_n int, p_abs boolean) returns void language sql as $$ select $$;
      create function record_match_result(p_won boolean, p_match_id uuid) returns jsonb language sql as $$ select null::jsonb $$;
      create function begin_match() returns jsonb language sql as $$ select null::jsonb $$;
      insert into profiles (id, role) values ('${A}', 'creator');
    `);
    await m.exec(file('20261009000000_poker_placement_rewards.sql'));
    await m.exec(file('20261011000002_match_tickets_v2.sql'));
    await m.exec(file('20261012000001_difficulty_reward_mult.sql'));
    await m.exec(file('20261012000001_difficulty_reward_mult.sql'));
    await m.exec(`set test.uid = '${A}'`);
  }, 60_000);

  const play = async (difficulty: string | null, place: number, seats: number, mode: string) => {
    const [{ r }] =
      difficulty === null
        ? await mq(`select begin_match($1, $2) r`, [mode, seats])
        : await mq(`select begin_match($1, $2, $3) r`, [mode, seats, difficulty]);
    await mq(
      `update match_tickets set started_at = now() - interval '2 hours' where match_id = $1`,
      [r.match_id],
    );
    // The claim cannot change it: there is no difficulty argument at all.
    const [{ c }] = await mq(`select record_match_placement($1, $2, $3, $4, null, 40) c`, [
      r.match_id,
      place,
      seats,
      mode,
    ]);
    await mq(`update match_tickets set redeemed_at = now() - interval '2 days'`);
    return { begin: r, claim: c };
  };

  test('the ticket records the difficulty; credits scale, XP does not; the client agrees', async () => {
    for (const d of ['easy', 'normal', 'hard'] as const) {
      for (const [place, seats, mode] of [
        [1, 6, 'standard'],
        [2, 2, 'quick'],
        [3, 5, 'deep'],
      ] as const) {
        const { begin, claim } = await play(d, place, seats, mode);
        expect(begin.difficulty).toBe(d);
        const want = placementReward(place, seats, mode, 40, d);
        expect(claim.reward).toBe(want.credits);
        expect(claim.xp_gained).toBe(want.xp);
        expect(claim.difficulty).toBe(d);
      }
    }
  });

  test('no difficulty (older clients) pays like Normal; junk is refused', async () => {
    const { claim } = await play(null, 1, 6, 'standard');
    expect(claim.reward).toBe(100);
    expect(claim.difficulty).toBe('normal');
    await expect(mq(`select begin_match('quick', 2, 'nightmare')`)).rejects.toThrow(/difficulty/);
  });

  test('only the three-argument begin_match is in the API', async () => {
    const [r] = await mq(`select
      has_function_privilege('authenticated', 'begin_match(text, int, text)', 'execute') v2,
      has_function_privilege('anon', 'begin_match(text, int, text)', 'execute') anon,
      has_function_privilege('authenticated', 'begin_match_legacy_v1(text, int)', 'execute') v1`);
    expect(r).toEqual({ v2: true, anon: false, v1: false });
  });
});

describe('realtime topics (20261012000002)', () => {
  let r: PGlite;
  const rq = async (s: string) => (await r.query(s)).rows as any[];

  beforeAll(async () => {
    r = new PGlite();
    await r.exec(`
      create role anon; create role authenticated;
      create schema realtime;
      create table realtime.sent (payload jsonb, event text, topic text, private boolean);
      create function realtime.send(p jsonb, e text, t text, priv boolean) returns void language sql
        as $$ insert into realtime.sent values (p, e, t, priv) $$;
      create table trades (id int primary key, proposer uuid, recipient uuid, status text);
      create table friendships (id int primary key, requester uuid, addressee uuid, status text);
      create table market_listings (id int primary key, price int);
      create table news_posts (id int primary key, title text);
      create function notify_user_change() returns trigger language plpgsql as $$
        declare v uuid;
        begin
          for v in execute format('select distinct %I from changed_rows where %I is not null', TG_ARGV[0], TG_ARGV[0]) loop
            perform realtime.send(jsonb_build_object('table', TG_TABLE_NAME), 'changed', 'user:' || v, true);
          end loop;
          return null;
        end $$;
    `);
    await r.exec(file('20261012000002_realtime_topics.sql'));
    await r.exec(file('20261012000002_realtime_topics.sql'));
  }, 60_000);

  test('a trade reaches both parties on their private topic, once per statement', async () => {
    await rq(
      `insert into trades values (1, '${A}', '${B}', 'pending'), (2, '${A}', '${B}', 'pending')`,
    );
    const rows = await rq(`select topic, private, payload from realtime.sent order by topic`);
    expect(rows).toEqual([
      { topic: `user:${A}`, private: true, payload: { table: 'trades' } },
      { topic: `user:${B}`, private: true, payload: { table: 'trades' } },
    ]);
  });

  test('market and news statements send one public message with no row data', async () => {
    await rq(`truncate realtime.sent`);
    await rq(`insert into market_listings values (1, 10), (2, 20)`);
    await rq(`update market_listings set price = price + 1`);
    await rq(`insert into news_posts values (1, 'hi')`);
    const rows = await rq(`select topic, private, payload from realtime.sent`);
    expect(rows).toEqual([
      { topic: 'market', private: false, payload: { table: 'market_listings' } },
      { topic: 'market', private: false, payload: { table: 'market_listings' } },
      { topic: 'news', private: false, payload: { table: 'news_posts' } },
    ]);
  });
});

describe('catalog version (20261012000003)', () => {
  test('changes when a template changes, and guests can read it', async () => {
    const c = new PGlite();
    await c.exec(`
      create role anon; create role authenticated;
      create table cards (id text primary key, template jsonb);
      insert into cards values ('a', '{"id":"a"}'), ('b', '{"id":"b"}');
    `);
    await c.exec(file('20261012000003_catalog_version.sql'));
    await c.exec(file('20261012000003_catalog_version.sql'));
    const v = async () =>
      (await c.query<{ v: string }>(`select get_catalog_version() v`)).rows[0].v;
    const v1 = await v();
    expect(v1).toMatch(/^2:[0-9a-f]{32}$/);
    expect(await v()).toBe(v1);
    await c.query(`update cards set template = '{"id":"b","rarity":"Rare"}' where id = 'b'`);
    expect(await v()).not.toBe(v1);
    const [r] = (
      await c.query(`select has_function_privilege('anon', 'get_catalog_version()', 'execute') a`)
    ).rows as any[];
    expect(r.a).toBe(true);
  }, 60_000);
});
