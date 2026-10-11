/**
 * Missions rotation and catalogue (20261011000003) against PGlite, on top of
 * the match-ticket helpers from 20261011000002 (can_play_cpu, is_match_stat).
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';

const CREATOR = '11111111-1111-1111-1111-111111111111';
const PLAYER = '22222222-2222-2222-2222-222222222222';
const file = (f: string) => readFileSync(join(__dirname, 'migrations', f), 'utf8');

let db: PGlite;
const q = async (s: string, p: unknown[] = []) => (await db.query(s, p)).rows as any[];
const as = (uid: string) => q(`select set_config('test.uid', $1, false)`, [uid]);
const missions = async (uid: string) => {
  await as(uid);
  return (await q(`select get_missions() r`))[0].r as any[];
};

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table profiles (id uuid primary key, credits int default 0, vouchers int default 0, wins int default 0,
      losses int default 0, games_played int default 0, last_match_at timestamptz, updated_at timestamptz,
      xp int default 0, level int default 1, role text default 'player', login_streak int default 0);
    create table match_tickets (match_id uuid primary key default gen_random_uuid(), uid uuid,
      started_at timestamptz default now(), redeemed_at timestamptz, won boolean, place int, seats int, mode text);
    create table match_receipts (match_id uuid primary key, uid uuid);
    create table cards (id text primary key, card_type text);
    create table player_cards (user_id uuid, card_id text, quantity int default 0, foil_quantity int default 0);
    create table stat_once (user_id uuid, key text, primary key (user_id, key));
    create function stat_once_claim(p_uid uuid, p_key text) returns boolean language plpgsql as $$
      begin insert into stat_once values (p_uid, p_key) on conflict do nothing; return found; end $$;
    create function mission_period_start(p text) returns date language sql stable as $$
      select case when p = 'daily' then current_date else date_trunc('week', now())::date end $$;
    create function level_for_xp(p int) returns int language sql as $$ select 1 + p / 1000 $$;
    create function level_reward_credits() returns int language sql as $$ select 0 $$;
    create function grant_bp_xp(p_uid uuid, p_xp int) returns boolean language sql as $$ select true $$;
    create function poker_place_factor(p int, s int) returns numeric language sql as $$ select 1.0 $$;
    create table missions (id text primary key, name text not null, description text not null,
      stat_key text not null, target int not null check (target > 0), reward_credits int not null default 0,
      reward_vouchers int not null default 0, reward_bp_xp int not null default 0,
      cadence text not null check (cadence in ('daily','weekly')));
    create table achievements (id text primary key, name text not null, description text not null,
      category text not null default 'general', stat_key text not null, target int not null,
      reward_credits int not null default 0, reward_vouchers int not null default 0, reward_pack_id uuid,
      sort int not null default 0);
    create table player_missions (user_id uuid, mission_id text references missions(id), progress int default 0,
      claimed boolean default false, period_start date not null, primary key (user_id, mission_id));
    create table player_achievements (user_id uuid, achievement_id text, progress int default 0,
      claimed boolean default false, primary key (user_id, achievement_id));
    create table pack_types (id uuid primary key default gen_random_uuid(), name text, acquisition text, is_active boolean);
    create table graded_cards (user_id uuid, grade numeric);
    create table bingo_cards (user_id uuid, claimed int[], blackout_claimed boolean);
    insert into profiles (id, role, level, wins, games_played) values
      ('${CREATOR}', 'creator', 12, 7, 30), ('${PLAYER}', 'player', 3, 0, 0);
    insert into missions values
      ('d_login','Show Up','x','logins',1,50,0,25,'daily'),
      ('d_pack_1','Rip One','x','packs_opened',1,50,0,30,'daily'),
      ('d_win_1','Daily Victory','x','wins',1,100,0,40,'daily'),
      ('d_play_3','Warm Up','x','games_played',3,75,0,40,'daily'),
      ('d_win_2','Daily Double','x','wins',2,200,0,60,'daily'),
      ('d_sell_5','Clear the Clutter','x','cards_sold',5,100,0,30,'daily'),
      ('d_grade_1','Send It Off','x','cards_graded',1,60,0,30,'daily'),
      ('d_list_1','Open the Stall','x','listings_created',1,50,0,25,'daily'),
      ('d_bid_1','Paddle Up','x','bids_placed',1,50,0,25,'daily'),
      ('d_floor_1','Customer Service','Make a sale or trade on your Shop Floor','shop_cpu_sales',1,75,0,30,'daily'),
      ('d_open_2','Crack a Couple','x','packs_opened',2,150,0,50,'daily'),
      ('w_open_10','Bulk Ripper','x','packs_opened',10,500,3,250,'weekly'),
      ('w_win_8','Weekly Champion','x','wins',8,600,3,200,'weekly'),
      ('w_sell_5','Garage Sale','x','cards_sold',5,300,0,100,'weekly');
    insert into achievements (id, name, description, category, stat_key, target) values
      ('level_5','Rising Star','x','progress','level',5),
      ('win_100','Legend of Fry (Retired)','x','battle','wins',100),
      ('first_win','First Blood','x','battle','wins',1),
      ('econ','Liquidator','x','economy','cards_sold',10);
    insert into player_achievements values ('${CREATOR}','level_5',3,false);
  `);
  await db.exec(file('20261011000002_match_tickets_v2.sql'));
  await db.exec(file('20261011000003_missions_rotation_and_catalogue.sql'));
  await db.exec(file('20261011000003_missions_rotation_and_catalogue.sql')); // idempotent
}, 60_000);

describe('mission catalogue', () => {
  test('BP XP is trimmed once, even when the file runs twice', async () => {
    const rows = await q(
      `select id, reward_bp_xp from missions where id in ('d_login','w_win_8','d_win_2')`,
    );
    expect(Object.fromEntries(rows.map((r) => [r.id, r.reward_bp_xp]))).toEqual({
      d_login: 16,
      d_win_2: 40,
      w_win_8: 100,
    });
  });

  test('data fixes: copy, category fold, poker title, retired twin hidden', async () => {
    const [m] = await q(`select description from missions where id = 'd_floor_1'`);
    expect(m.description).toBe('Make a sale to a Shop Floor customer today');
    const a = await q(
      `select id, name, category, hidden from achievements where id in ('econ','first_win','win_100') order by id`,
    );
    expect(a).toEqual([
      { id: 'econ', name: 'Liquidator', category: 'market', hidden: false },
      { id: 'first_win', name: 'First Freezeout', category: 'battle', hidden: false },
      { id: 'win_100', name: 'Legend of Fry (Retired)', category: 'battle', hidden: true },
    ]);
  });

  test('backfill seeds new tiers and lagging level rows from the source tables', async () => {
    const rows = await q(
      `select achievement_id, progress from player_achievements where user_id = $1 and achievement_id in ('level_5','level_15','wins_500','games_500') order by 1`,
      [CREATOR],
    );
    expect(rows).toEqual([
      { achievement_id: 'games_500', progress: 30 },
      { achievement_id: 'level_15', progress: 12 },
      { achievement_id: 'level_5', progress: 5 },
      { achievement_id: 'wins_500', progress: 7 },
    ]);
  });
});

describe('rotation', () => {
  test('deals the core missions plus 4 dailies and 5 weeklies', async () => {
    const list = await missions(CREATOR);
    const daily = list.filter((m) => m.cadence === 'daily');
    const weekly = list.filter((m) => m.cadence === 'weekly');
    const core = list
      .filter((m) => m.pool === 'core')
      .map((m) => m.id)
      .sort();
    expect(core).toEqual(['d_login', 'd_pack_1', 'd_win_1', 'w_open_10', 'w_win_8']);
    expect(daily.length).toBe(3 + 4);
    expect(weekly.length).toBe(2 + 5);
  });

  test('a player who cannot start matches is never dealt a rotating match mission', async () => {
    const list = await missions(PLAYER);
    const rotatingMatch = list.filter(
      (m) => m.pool === 'rotating' && ['wins', 'games_played', 'hands_won'].includes(m.stat_key),
    );
    expect(rotatingMatch).toEqual([]);
    expect(list.filter((m) => m.cadence === 'daily').length).toBe(7);
  });

  test('progress and claims only move on dealt missions', async () => {
    await as(PLAYER);
    const dealt = new Set((await missions(PLAYER)).map((m) => m.id));
    const [off] = await q(
      `select id, stat_key from missions where cadence = 'daily' and not (id = any($1)) and not is_match_stat(stat_key) limit 1`,
      [[...dealt]],
    );
    await q(`select track_stat($1, $2, 99, false)`, [PLAYER, off.stat_key]);
    const [pm] = await q(
      `select count(*)::int n from player_missions where user_id = $1 and mission_id = $2`,
      [PLAYER, off.id],
    );
    expect(pm.n).toBe(0);
    await q(`insert into player_missions values ($1, $2, 99, false, current_date)`, [
      PLAYER,
      off.id,
    ]);
    await expect(q(`select claim_mission($1)`, [off.id])).rejects.toThrow(/rotation/);
    // A dealt one pays.
    await q(`select track_stat($1, 'logins', 1, false)`, [PLAYER]);
    const [{ r }] = await q(`select claim_mission('d_login') r`);
    expect(r.ok).toBe(true);
  });

  test('is the same for everyone and stable within the day', async () => {
    const a = (await missions(CREATOR))
      .filter((m) => !['wins', 'games_played'].includes(m.stat_key))
      .map((m) => m.id);
    const again = (await missions(CREATOR))
      .filter((m) => !['wins', 'games_played'].includes(m.stat_key))
      .map((m) => m.id);
    expect(again).toEqual(a);
  });
});
