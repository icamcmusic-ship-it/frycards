/**
 * 20261014000300 against PGlite: Season 2 + ensure_next_season/season_health,
 * the weekly colour-pack rotation, the pipeline token rate limit, and the
 * mission/achievement reward reshuffle.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';

const MIG = readFileSync(
  join(__dirname, 'migrations', '20261014000300_audit2_backend.sql'),
  'utf8',
);
const TOKEN = 'a-very-long-pipeline-token-123456';

let db: PGlite;
const q = async (s: string, p: unknown[] = []) => (await db.query(s, p)).rows as any[];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create table seasons (id uuid primary key default gen_random_uuid(), number int unique, name text,
      is_active boolean default false, is_free boolean default true, starts_at timestamptz, ends_at timestamptz);
    create table battle_pass_tiers (id uuid primary key default gen_random_uuid(),
      season_id uuid references seasons(id) on delete cascade, tier int, reward_type text, amount int default 1,
      pack_type_id uuid, shop_item_id uuid, label text, unique (season_id, tier));
    create table pack_types (id uuid primary key default gen_random_uuid(), name text, image_url text,
      is_active boolean default false, acquisition text default 'purchase', time_limited boolean default false,
      pack_group text, available_until timestamptz);
    create table missions (id text primary key, cadence text, pool text, reward_credits int);
    create table achievements (id text primary key, category text, reward_credits int, reward_pack_id uuid);
    create table art_pipeline_secret (token_hash text);
    create table card_submissions (id uuid primary key default gen_random_uuid(), status text,
      art_status text, art_path text, art_removed_at timestamptz, reviewed_at timestamptz,
      approved_card_id text, image_url text, requested_treatment text, art_url text, art_error text,
      art_updated_at timestamptz, art_removable_at timestamptz);
    create table cards (id text primary key, image_url text, template jsonb, updated_at timestamptz);
    create table shop_items (id uuid primary key default gen_random_uuid(), image_url text);

    insert into seasons (number, name, is_active, starts_at, ends_at)
      values (1, 'Season 1', true, '2026-07-12T00:05:26Z', '2026-11-10T00:05:26Z');
    insert into battle_pass_tiers (season_id, tier, reward_type, amount, label)
      select id, g, 'credits', g * 100, g || '00 Credits' from seasons, generate_series(1, 25) g;
    insert into pack_types (name, pack_group, image_url) values
      ('Void Pack', 'color_void', null), ('Ember Pack', 'color_ember', null),
      ('Tide Pack', 'color_tide', null),
      ('Starter Pack', null, 'https://cdn.midjourney.com/x/0_0.png'),
      ('Volume #1 Booster Pack', null, null), ('Volume #1 Booster Box', null, null);
    insert into missions values ('d1', 'daily', 'rotating', 50), ('d2', 'daily', 'rotating', 200),
      ('c1', 'daily', 'core', 50), ('w1', 'weekly', 'rotating', 400);
    insert into achievements values ('col_small', 'collection', 500, null),
      ('col_mid', 'collection', 2000, null), ('col_big', 'collection', 10000, null),
      ('bat', 'battle', 5000, null);
  `);
  await db.query(`insert into art_pipeline_secret values (encode(sha256(convert_to($1, 'UTF8')), 'hex'))`, [
    TOKEN,
  ]);
  await db.exec(MIG);
  // Re-running is a no-op (idempotent migration).
  await db.exec(MIG);
});

describe('seasons', () => {
  test('Season 2 starts the moment Season 1 ends, same length, same tiers', async () => {
    const [s1, s2] = await q(`select * from seasons order by number`);
    expect(s2.number).toBe(2);
    expect(new Date(s2.starts_at).getTime()).toBe(new Date(s1.ends_at).getTime());
    expect(new Date(s2.ends_at).getTime() - new Date(s2.starts_at).getTime()).toBe(
      new Date(s1.ends_at).getTime() - new Date(s1.starts_at).getTime(),
    );
    expect(s2.is_active).toBe(false);
    const tiers = await q(
      `select a.tier, a.amount = b.amount same from battle_pass_tiers a
         join battle_pass_tiers b on b.tier = a.tier and b.season_id = $2
        where a.season_id = $1`,
      [s1.id, s2.id],
    );
    expect(tiers).toHaveLength(25);
    expect(tiers.every((t) => t.same)).toBe(true);
  });

  test('season_health fails within 14 days of the end with no successor', async () => {
    const h = async (at: string) => (await q(`select season_health($1) h`, [at]))[0].h;
    expect((await h('2026-11-01T00:00:00Z')).ok).toBe(true);
    await db.exec(`begin; delete from seasons where number = 2;`);
    expect((await h('2026-10-20T00:00:00Z')).ok).toBe(true);
    expect((await h('2026-11-01T00:00:00Z')).ok).toBe(false);
    await db.exec('rollback');
  });

  test('ensure_next_season rolls the active season and authors the next one', async () => {
    await db.exec('begin');
    // Season 2 goes live at Season 1's end.
    let r = (await q(`select ensure_next_season('2026-11-10T01:00:00Z') r`))[0].r;
    const active = await q(`select number from seasons where is_active`);
    expect(active.map((a) => a.number)).toEqual([2]);
    expect(r.created).toBe(0);
    // Within 14 days of Season 2's end, Season 3 appears with its tiers.
    const s2End = (await q(`select ends_at from seasons where number = 2`))[0].ends_at;
    const near = new Date(new Date(s2End).getTime() - 7 * 86400_000).toISOString();
    r = (await q(`select ensure_next_season($1) r`, [near]))[0].r;
    expect(r.created).toBe(1);
    const s3 = await q(
      `select s.starts_at, count(t.*)::int n from seasons s join battle_pass_tiers t on t.season_id = s.id
        where s.number = 3 group by s.starts_at`,
    );
    expect(new Date(s3[0].starts_at).getTime()).toBe(new Date(s2End).getTime());
    expect(s3[0].n).toBe(25);
    expect((await q(`select season_health($1) h`, [near]))[0].h.ok).toBe(true);
    await db.exec('rollback');
  });
});

describe('colour pack rotation', () => {
  test('exactly one colour pack is live, until the end of its ISO week', async () => {
    const at = '2026-10-14T12:00:00Z'; // a Wednesday
    const pick = (await q(`select rotate_color_packs($1) p`, [at]))[0].p;
    const live = await q(`select id, available_until from pack_types where is_active`);
    expect(live).toHaveLength(1);
    expect(live[0].id).toBe(pick);
    expect(new Date(live[0].available_until).toISOString()).toBe('2026-10-19T00:00:00.000Z');
  });

  test('the next week rotates to another pack; all three come round', async () => {
    const seen = new Set<string>();
    for (const day of ['2026-10-14', '2026-10-21', '2026-10-28'])
      seen.add((await q(`select rotate_color_packs($1) p`, [`${day}T12:00:00Z`]))[0].p);
    expect(seen.size).toBe(3);
    expect((await q(`select count(*)::int n from pack_types where is_active`))[0].n).toBe(1);
  });

  test('the midjourney art link is gone', async () => {
    const r = await q(`select image_url from pack_types where name = 'Starter Pack'`);
    expect(r[0].image_url).toBeNull();
  });
});

describe('pipeline token rate limit', () => {
  test('a good token passes, a bad one is logged and refused without raising', async () => {
    expect((await q(`select art_pipeline_gate($1) g`, [TOKEN]))[0].g).toBe(true);
    const j = (await q(`select art_pipeline_jobs('nope-nope-nope-nope-nope-nope') j`))[0].j;
    expect(j.error).toMatch(/bad token/);
    expect((await q(`select count(*)::int n from art_pipeline_attempts`))[0].n).toBe(1);
    expect((await q(`select cosmetics_mirror_jobs($1) j`, [TOKEN]))[0].j).toEqual([]);
  });

  test('20 failures in 15 minutes lock out even the right token', async () => {
    for (let i = 0; i < 20; i++) await q(`select art_pipeline_gate('wrong-token-wrong-token-' || $1) g`, [i]);
    expect((await q(`select art_pipeline_gate($1) g`, [TOKEN]))[0].g).toBe(false);
    expect((await q(`select art_pipeline_report($1, '[]') n`, [TOKEN]))[0].n).toBe(-1);
    await expect(q(`select art_pipeline_check($1)`, [TOKEN])).rejects.toThrow(/rate limited/);
    // The window passes.
    await db.exec(`update art_pipeline_attempts set at = now() - interval '16 minutes'`);
    expect((await q(`select art_pipeline_gate($1) g`, [TOKEN]))[0].g).toBe(true);
  });
});

describe('rewards', () => {
  test('daily rotating missions pay at least 120; others untouched', async () => {
    const r = Object.fromEntries(
      (await q(`select id, reward_credits from missions`)).map((m) => [m.id, m.reward_credits]),
    );
    expect(r).toEqual({ d1: 120, d2: 200, c1: 50, w1: 400 });
  });

  test('big collection achievements trade 30% of their credits for a pack, once', async () => {
    const r = Object.fromEntries(
      (
        await q(
          `select a.id, a.reward_credits c, p.name from achievements a left join pack_types p on p.id = a.reward_pack_id`,
        )
      ).map((a) => [a.id, [a.c, a.name]]),
    );
    expect(r.col_small).toEqual([500, null]);
    expect(r.col_mid).toEqual([1400, 'Volume #1 Booster Pack']);
    expect(r.col_big).toEqual([7000, 'Volume #1 Booster Box']);
    expect(r.bat).toEqual([5000, null]);
  });
});
