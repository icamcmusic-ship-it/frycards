/**
 * Runs the repo's own economy/anti-abuse migrations against a real Postgres
 * (PGlite, in-process) with stubs for the parts of the Supabase project that
 * are not in the repo. It exists because these files change production
 * functions and, until now, nothing ever executed them: one of them shipped
 * with an unterminated dollar-quote that only a real parse found.
 *
 * It checks that each migration applies, and pins the behaviour of the fixes
 * the 2026-09-29 audit made (see AUDIT-2026-09-29.md). The stubs are the
 * minimum the functions touch; they are not a model of the live schema.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';

const DIR = __dirname + '/migrations';
const sql = (f: string) => readFileSync(join(DIR, f), 'utf8');
const U = '11111111-1111-1111-1111-111111111111';

let db: PGlite;
const q = async (s: string) => (await db.query(s)).rows as any[];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create table auth.users (id uuid primary key default gen_random_uuid());
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table profiles (id uuid primary key, credits int default 0, wins int default 0, losses int default 0,
      games_played int default 0, last_match_at timestamptz, updated_at timestamptz, xp int default 0, level int default 1,
      role text default 'player', vouchers int default 0, last_account_reset_at timestamptz, showcase_cards text[],
      equipped_card_back text, equipped_banner text, equipped_avatar text);
    create table match_receipts (match_id uuid primary key, uid uuid);
    create function grant_xp(p_uid uuid, p_xp int) returns jsonb language sql as $$ select '{"level":1}'::jsonb $$;
    create function grant_bp_xp(p_uid uuid, p_xp int) returns boolean language sql as $$ select true $$;
    create function track_stat(p_uid uuid, p_stat text, p_n int, p_set boolean) returns void language sql as $$ select $$;
    create table pack_grants (uid uuid, pack uuid);
    create function grant_inventory_pack(p_uid uuid, p_pack uuid, n int) returns void language sql as $$ insert into pack_grants values (p_uid, p_pack) $$;
    create table pack_types (id uuid primary key default gen_random_uuid(), acquisition text, is_active boolean);
    create function grant_pack_contents(p_uid uuid, p_pack pack_types) returns void language sql as $$ select $$;
    create table market_listings (id uuid primary key default gen_random_uuid(), seller uuid, status text, bid_count int);
    create table trades (id uuid primary key default gen_random_uuid(), proposer uuid, recipient uuid, status text);
    create function cancel_listing(p uuid) returns void language sql as $$ select $$;
    create function close_shop() returns void language sql as $$ select $$;
    create function cancel_trade(p uuid) returns void language sql as $$ select $$;
    create function respond_trade(p uuid, b boolean) returns void language sql as $$ select $$;
    create table player_shops (owner uuid, status text);
    create table cards (id text primary key, rarity text, card_type text, set_name text);
    create table mystery_pack_templates (id uuid primary key default gen_random_uuid(), owner uuid, name text,
      pack_size int, mode text, config jsonb);
    create function rarity_is_known(r text) returns boolean language sql as $$ select r in ('Common','Rare','Mythic') $$;
    create function rarity_is_deliverable(r text) returns boolean language sql as $$ select exists(select 1 from cards where rarity = r) $$;
  `);
  for (const t of [
    'player_cards',
    'player_serialized_cards',
    'decks',
    'player_inventory',
    'player_cosmetics',
    'player_achievements',
    'graded_cards',
    'friendships',
  ]) {
    await db.exec(`create table ${t} (user_id uuid, requester uuid, addressee uuid)`);
  }
  for (const f of [
    '20260826000000_server_minted_match_tickets.sql',
    '20260929000000_close_high_findings.sql',
    '20260929000001_close_medium_findings.sql',
    '20260929000002_prune_match_tickets.sql',
  ]) {
    await db.exec(sql(f));
  }
  await db.exec(`insert into auth.users values ('${U}'); insert into profiles (id) values ('${U}');
    set test.uid = '${U}'; insert into cards values ('c1','Common','Unit','S'), ('m1','Mythic','Unit','S');
    insert into player_shops values ('${U}', 'open');`);
}, 60_000);

describe('H-1 helpers are not client-callable', () => {
  test('authenticated and anon cannot execute the uid-taking helpers', async () => {
    const rows =
      await q(`select p.proname, has_function_privilege('authenticated', p.oid, 'execute') a,
      has_function_privilege('anon', p.oid, 'execute') n from pg_proc p
      where p.proname in ('grant_pack_contents','grant_xp','grant_bp_xp','track_stat','grant_inventory_pack')`);
    expect(rows).toHaveLength(5);
    for (const r of rows) expect([r.proname, r.a, r.n]).toEqual([r.proname, false, false]);
  });
});

describe('match tickets', () => {
  test('H-2: an account holds one open ticket, however often it begins a match', async () => {
    for (let i = 0; i < 3; i++) await q(`select begin_match()`);
    const [{ c }] = await q(
      `select count(*)::int c from match_tickets where uid='${U}' and redeemed_at is null`,
    );
    expect(c).toBe(1);
  });

  test('M-2: every unpayable ticket says why, and a capped ticket is not burnt', async () => {
    const status = async (id: string | null, won = true) =>
      (await q(`select record_match_result(${won}, ${id ? `'${id}'` : 'gen_random_uuid()'}) r`))[0]
        .r;
    const [{ match_id: id }] = await q(
      `select match_id from match_tickets where uid='${U}' and redeemed_at is null`,
    );
    expect((await status(id)).status).toBe('too_early');
    await db.exec(
      `update match_tickets set started_at = now() - interval '7 hours' where match_id='${id}'`,
    );
    expect((await status(id)).status).toBe('expired');
    await db.exec(
      `update match_tickets set started_at = now() - interval '2 minutes' where match_id='${id}'`,
    );
    expect((await status(id)).reward).toBe(100);
    expect((await status(id)).status).toBe('duplicate');
    expect((await status(null)).status).toBe('invalid');

    await db.exec(`insert into match_tickets (uid, started_at, redeemed_at)
      select '${U}', now() - interval '3 hours', now() - interval '2 hours' from generate_series(1,200)`);
    const [{ r }] = await q(`select begin_match() r`);
    await db.exec(
      `update match_tickets set started_at = now() - interval '2 minutes' where match_id='${r.match_id}'`,
    );
    expect((await status(r.match_id, false)).status).toBe('capped');
    const [{ open }] = await q(
      `select (redeemed_at is null) open from match_tickets where match_id='${r.match_id}'`,
    );
    expect(open).toBe(true);
  });

  test('a missing ticket still raises', async () => {
    await expect(db.query(`select record_match_result(true, null)`)).rejects.toThrow(
      /Missing match ticket/,
    );
  });

  test('pruning removes tickets older than a week and nothing newer', async () => {
    const [{ c: before }] = await q(`select count(*)::int c from match_tickets`);
    await db.exec(
      `insert into match_tickets (uid, started_at) values ('${U}', now() - interval '9 days')`,
    );
    const [{ n }] = await q(`select prune_match_tickets() n`);
    const [{ c: after }] = await q(`select count(*)::int c from match_tickets`);
    expect(n).toBe(1);
    expect(after).toBe(before);
  });
});

describe('pack and template validation', () => {
  test('M-4: an unknown rarity falls to the lowest tier, not Mythic', async () => {
    expect((await q(`select random_card_of_rarity('Bogus', null::text[]) id`))[0].id).toBe('c1');
    expect((await q(`select random_card_of_rarity('Mythic', null::text[]) id`))[0].id).toBe('m1');
  });

  test('M-8: null modes and non-numeric weights are rejected', async () => {
    const cfg = (w: string) => `'{"rarity_weights": ${w}}'::jsonb`;
    await expect(
      db.query(`select create_mystery_template('n', 5, null, ${cfg('{"Common":1}')})`),
    ).rejects.toThrow(/Unknown mode/);
    await expect(
      db.query(`select create_mystery_template('n', 5, 'simple', ${cfg('{"Common":"NaN"}')})`),
    ).rejects.toThrow(/must be numbers/);
    await expect(
      db.query(
        `select create_mystery_template('n', 2, 'advanced', '{"slots":[{"mode":"open"},{"rarity":"Rare"}]}'::jsonb)`,
      ),
    ).rejects.toThrow(/exact, minimum or open/);
    const [{ r }] = await q(
      `select create_mystery_template('n', 5, 'simple', ${cfg('{"Common":1}')}) r`,
    );
    expect(r.ok).toBe(true);
  });
});

describe('account reset', () => {
  test('H-3: keeps xp and level, resets credits, and grants the Deck Box only once', async () => {
    await db.exec(`insert into pack_types (acquisition, is_active) values ('deck_box_grant', true);
      update profiles set credits = 9999, xp = 500, level = 7, last_account_reset_at = null where id='${U}'`);
    expect((await q(`select reset_account() r`))[0].r.ok).toBe(true);
    const [p] = await q(
      `select credits, xp, level, last_account_reset_at is not null reset from profiles where id='${U}'`,
    );
    expect(p).toMatchObject({ credits: 1500, xp: 500, level: 7, reset: true });
    expect((await q(`select count(*)::int c from pack_grants`))[0].c).toBe(1);
    // Past the 7-day cooldown, a second reset must not mint another box.
    await db.exec(
      `update profiles set last_account_reset_at = now() - interval '8 days' where id='${U}'`,
    );
    await q(`select reset_account()`);
    expect((await q(`select count(*)::int c from pack_grants`))[0].c).toBe(1);
  });
});
