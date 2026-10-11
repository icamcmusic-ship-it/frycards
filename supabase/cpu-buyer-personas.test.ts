/**
 * 20261013000100 against PGlite: CPU buyer personas — offer bounds, the
 * haggle mood meter and walk-away, meet-in-the-middle, final counters, bundle
 * math, trade-plus-cash, regulars, no reroll on refresh, and persona bidders.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, beforeEach, describe, expect, test } from 'vitest';

const A = '11111111-1111-1111-1111-111111111111';
const MIG = readFileSync(
  join(__dirname, 'migrations', '20261013000100_cpu_buyer_personas.sql'),
  'utf8',
);

let db: PGlite;
const q = async (s: string, p: unknown[] = []) => (await db.query(s, p)).rows as any[];
const as = async (s: string) => {
  await db.exec(`select set_config('test.uid', '${A}', false)`);
  return q(s);
};
const listing = async (price: number, ref: number, card = 'e1', foil = false) => {
  const slot = (
    await q(`insert into shop_slots (owner, status) values ($1, 'filled') returning id`, [A])
  )[0].id;
  return (
    await q(
      `insert into shop_listings (owner, slot_id, listing_type, cards, price)
       values ($1, $2, 'individual', $3::jsonb, $4) returning id`,
      [A, slot, JSON.stringify([{ card_id: card, foil, ref }]), price],
    )
  )[0].id as string;
};
const customer = async (
  listingId: string,
  persona: string,
  offer: number,
  walk: number,
  extra: Record<string, unknown> = {},
) => {
  const cols = [
    'owner',
    'listing_id',
    'kind',
    'persona',
    'persona_id',
    'mood',
    'offer_credits',
    'walkaway_credits',
  ];
  const vals: unknown[] = [A, listingId, 'buy', 'Test', persona, 'browsing', offer, walk];
  for (const [k, v] of Object.entries(extra)) {
    cols.push(k);
    vals.push(v);
  }
  return (
    await q(
      `insert into shop_customers (${cols.join(',')}) values (${vals.map((_, i) => `$${i + 1}`).join(',')}) returning id`,
      vals,
    )
  )[0].id as string;
};
const respond = async (id: string, action: string, counter?: number) =>
  (await as(`select respond_shop_customer('${id}', '${action}', ${counter ?? 'null'}) r`))[0].r;
const credits = async () =>
  (await q(`select credits from profiles where id = $1`, [A]))[0].credits as number;

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table cards (id text primary key, name text, card_type text default 'Unit', rarity text,
      essence_types text[], set_name text default 'S1');
    insert into cards (id, rarity, essence_types) values
      ('e1', 'Rare', '{Ember}'), ('t1', 'Rare', '{Tide}'), ('c1', 'Common', '{Root}'), ('c2', 'Common', '{Void}');
    create table pack_types (allowed_sets text[], is_active boolean, acquisition text);
    insert into pack_types values ('{S1}', true, 'purchase');
    create table profiles (id uuid primary key, credits int default 0, updated_at timestamptz);
    insert into profiles (id) values ('${A}');
    create table player_cards (user_id uuid, card_id text, quantity int default 0, foil_quantity int default 0,
      primary key (user_id, card_id));
    create table stats (uid uuid, key text, n int);
    create table stat_once (user_id uuid, key text, primary key (user_id, key));
    create function stat_once_claim(p_uid uuid, p_key text) returns boolean language plpgsql as $$
      begin insert into stat_once values (p_uid, p_key) on conflict do nothing; return found; end $$;
    create function track_stat(p_uid uuid, p_key text, p_n int, p_abs boolean) returns void language sql
      as $$ insert into stats values (p_uid, p_key, p_n) $$;
    create function card_sell_price(p text) returns int language sql immutable as $$
      select case p when 'Rare' then 40 else 4 end $$;
    create function rarity_tier(r text) returns int language sql immutable as $$
      select case r when 'Rare' then 3 else 1 end $$;
    create function variant_mult(p text) returns numeric language sql immutable as $$ select 1.0 $$;
    create table graded_cards (id uuid primary key default gen_random_uuid(), user_id uuid, card_id text,
      foil boolean default false, service text, pristine boolean default false, variant text, grade numeric);
    create function shop_slab_value(p uuid) returns int language sql as $$ select 500 $$;
    create function grading_persona_favourite(p text) returns text language sql as $$ select 'tca' $$;
    create function grading_retire_slab(p uuid) returns void language sql as $$ select $$;
    create function settle_shop_maintenance(p uuid) returns void language sql as $$ select $$;
    create table player_shops (owner uuid primary key, status text default 'active', last_customer_at timestamptz);
    insert into player_shops (owner) values ('${A}');
    create table player_shop_ratings (owner uuid primary key, rating_unlocked boolean, composite_score numeric);
    create table shop_slots (id uuid primary key default gen_random_uuid(), owner uuid, slot_index int,
      status text default 'empty');
    create table shop_listings (id uuid primary key default gen_random_uuid(), owner uuid, slot_id uuid,
      listing_type text, status text default 'active', cards jsonb, price int, reference_price int,
      graded_id uuid, created_at timestamptz default now());
    create function shop_listing_cpu_reference(p shop_listings) returns int language sql as $$
      select coalesce((p.cards->0->>'ref')::int, 100) $$;
    create table shop_customers (id uuid primary key default gen_random_uuid(), owner uuid, listing_id uuid,
      kind text, persona text, mood text, offer_credits int, walkaway_credits int, offer_card_id text,
      offer_foil boolean default false, haggled boolean default false, status text default 'waiting',
      final_credits int, created_at timestamptz default now(),
      expires_at timestamptz default now() + interval '6 hours', resolved_at timestamptz);
    create table market_listings (id uuid primary key default gen_random_uuid(), seller uuid, card_id text,
      foil boolean default false, quantity int default 1, listing_type text, price int, buyout int,
      current_bid int, current_bidder uuid, bid_count int default 0, status text default 'active',
      ends_at timestamptz, cpu_leading boolean default false, cpu_bidder_name text, variant text);
    create table market_listing_cpu (listing_id uuid primary key, cpu_ceiling int, cpu_next_at timestamptz);
    create function cpu_persona_name() returns text language sql as $$ select 'Fallback' $$;
    create function cpu_ceiling_factor(p text) returns numeric language sql immutable as $$ select 1.5 $$;
  `);
  await db.exec(MIG);
  await db.exec(MIG); // idempotent
}, 60_000);

beforeEach(async () => {
  await q(`update shop_customers set status = 'declined' where status = 'waiting'`);
  await q(`update shop_listings set status = 'cancelled' where status = 'active'`);
  await q(`update shop_customers set created_at = now() - interval '2 days'`);
});

describe('CPU buyer personas (20261013000100)', () => {
  test('20 personas, every colour has a loyalist', async () => {
    const rows = await q(`select id, fav_essence from cpu_buyer_personas`);
    expect(rows.length).toBe(20);
    const ess = rows
      .map((r) => r.fav_essence)
      .filter(Boolean)
      .sort();
    expect(ess).toEqual(['Ember', 'Gale', 'Light', 'Root', 'Shadow', 'Tide', 'Void']);
  });

  test('taste hits: an Ember card suits the Ember loyalist', async () => {
    const id = await listing(500, 100, 'e1', true);
    const r = await q(
      `select p.id, shop_persona_hits(p, l) h from cpu_buyer_personas p, shop_listings l where l.id = $1`,
      [id],
    );
    const h = Object.fromEntries(r.map((x) => [x.id, x.h]));
    expect(h.loyal_ember).toBe(2);
    expect(h.loyal_tide).toBe(0);
    expect(h.foilhunter).toBe(1);
  });

  test('offers and walk-aways stay within min(ask, 1.6 x reference); bundles at 8% off', async () => {
    let bundles = 0;
    for (let i = 0; i < 80; i++) {
      // Spawns are seeded by shop + time bucket, so vary the shelf instead.
      await q(`update shop_listings set status = 'cancelled' where status = 'active'`);
      await listing(1000, 100, 'e1');
      await listing(150, 50, 'c1');
      await listing(90, 60, 't1');
      await q(
        `update shop_customers set status = 'declined', created_at = now() - interval '2 days' where status = 'waiting'`,
      );
      await q(`update player_shops set last_customer_at = null`);
      await q(`select spawn_shop_customers('${A}')`);
      const c = (
        await q(
          `select c.*, s.price, s.cards from shop_customers c join shop_listings s on s.id = c.listing_id where c.status = 'waiting'`,
        )
      )[0];
      if (!c || c.kind !== 'buy') continue;
      let ref = c.cards[0].ref as number;
      let ask = c.price as number;
      if (c.bundle_listing_id) {
        bundles++;
        const s2 = (
          await q(`select price, cards from shop_listings where id = $1`, [c.bundle_listing_id])
        )[0];
        ref = Math.round((ref + s2.cards[0].ref) * 0.92);
        ask += s2.price;
      }
      const cap = Math.min(ask, Math.ceil(ref * 1.6));
      expect(c.offer_credits).toBeGreaterThanOrEqual(1);
      expect(c.offer_credits).toBeLessThanOrEqual(cap);
      expect(c.walkaway_credits).toBeGreaterThanOrEqual(c.offer_credits);
      expect(c.walkaway_credits).toBeLessThanOrEqual(cap);
      expect(c.persona_id).toBeTruthy();
    }
    expect(bundles).toBeGreaterThan(0);
  });

  test('counter above asking is refused; a counter at or under the walk-away sells', async () => {
    const l = await listing(200, 100);
    const c = await customer(l, 'tightfist', 100, 120);
    await expect(respond(c, 'counter', 201)).rejects.toThrow(/asking/);
    await expect(respond(c, 'counter', 100)).rejects.toThrow(/more than/);
    const before = await credits();
    const r = await respond(c, 'counter', 118);
    expect(r.result).toBe('sold');
    expect((await credits()) - before).toBe(118);
  });

  test('meet in the middle follows the concession curve; a final counter over the line walks', async () => {
    const l = await listing(200, 100);
    const c = await customer(l, 'tightfist', 100, 120); // concession 0.35, patience 3
    const r = await respond(c, 'counter', 130); // 130/120 = 1.08
    expect(r.event).toBe('meet_middle');
    expect(r.offer).toBe(107);
    expect(r.mood_score).toBe(47);
    const r2 = await respond(c, 'final', 125);
    expect(r2.result).toBe('left');
  });

  test('insults sour the mood and end the visit after patience runs out', async () => {
    const l = await listing(200, 100);
    await q(
      `insert into shop_regulars (owner, persona_id, visits, good_deals) values ($1, 'tightfist', 3, 1)
             on conflict (owner, persona_id) do update set good_deals = 1`,
      [A],
    );
    const c = await customer(l, 'tightfist', 100, 110);
    const r1 = await respond(c, 'counter', 200);
    expect([r1.event, r1.mood_score]).toEqual(['insulted', 35]);
    const r2 = await respond(c, 'counter', 200);
    expect([r2.event, r2.mood_score]).toEqual(['insulted', 20]);
    const r3 = await respond(c, 'counter', 200);
    expect(r3.result).toBe('left');
    const reg = (await q(`select good_deals from shop_regulars where persona_id = 'tightfist'`))[0];
    expect(reg.good_deals).toBe(0);
    await expect(respond(c, 'accept')).rejects.toThrow(/already left/);
  });

  test('impatient personas jump to a final offer at their walk-away, then stop haggling', async () => {
    const l = await listing(200, 100);
    const c = await customer(l, 'kid', 100, 125); // patience 1
    const r = await respond(c, 'counter', 135);
    expect(r).toMatchObject({ result: 'final_offer', offer: 125 });
    await expect(respond(c, 'counter', 126)).rejects.toThrow(/will not haggle/);
    expect((await respond(c, 'accept')).credits).toBe(125);
  });

  test('a good mood stretches the walk-away a little (never past asking)', async () => {
    const l = await listing(200, 100);
    const c = await customer(l, 'tightfist', 100, 100, { mood_score: 90 });
    expect((await respond(c, 'counter', 108)).result).toBe('sold'); // 100 x 1.08
    const l2 = await listing(104, 100);
    const c2 = await customer(l2, 'tightfist', 100, 100, { mood_score: 90 });
    await expect(respond(c2, 'counter', 108)).rejects.toThrow(/asking/);
  });

  test('bundle accept sells both listings for one payment', async () => {
    const l1 = await listing(100, 80);
    const l2 = await listing(60, 40);
    const c = await customer(l1, 'completer', 120, 130, { bundle_listing_id: l2 });
    const before = await credits();
    expect((await respond(c, 'accept')).credits).toBe(120);
    expect((await credits()) - before).toBe(120);
    const st = await q(`select status from shop_listings where id in ($1, $2)`, [l1, l2]);
    expect(st.map((s) => s.status)).toEqual(['sold', 'sold']);
    // a counter on a bundle is bounded by the combined asking price
    const l3 = await listing(100, 80);
    const l4 = await listing(60, 40);
    const c2 = await customer(l3, 'completer', 120, 130, { bundle_listing_id: l4 });
    await expect(respond(c2, 'counter', 161)).rejects.toThrow(/asking/);
  });

  test('trade plus cash pays the card and the top-up', async () => {
    const l = await listing(100, 80);
    const c = (
      await q(
        `insert into shop_customers (owner, listing_id, kind, persona, persona_id, mood, offer_card_id, trade_cash)
         values ($1, $2, 'trade', 'T', 'kid', 'eager', 'c2', 25) returning id`,
        [A, l],
      )
    )[0].id;
    const before = await credits();
    await respond(c, 'accept');
    expect((await credits()) - before).toBe(25);
    expect((await q(`select quantity from player_cards where card_id = 'c2'`))[0].quantity).toBe(1);
  });

  test('regulars return friendlier', async () => {
    await q(
      `insert into shop_regulars (owner, persona_id, visits, good_deals)
             select $1, id, 5, 2 from cpu_buyer_personas
             on conflict (owner, persona_id) do update set visits = 5, good_deals = 2`,
      [A],
    );
    await listing(500, 100, 'c1');
    await q(`update player_shops set last_customer_at = null`);
    const g = (await as(`select get_shop_customers() g`))[0].g;
    expect(g.customers.length).toBe(1);
    expect(g.customers[0].regular).toBe(true);
    expect(g.customers[0].mood_score).toBeGreaterThanOrEqual(60);
    expect(g.regulars).toBe(20);
  });

  test('refreshing never rerolls customers', async () => {
    await listing(500, 100, 'c1');
    await listing(500, 100, 't1');
    await q(`update player_shops set last_customer_at = null`);
    const g1 = (await as(`select get_shop_customers() g`))[0].g;
    const g2 = (await as(`select get_shop_customers() g`))[0].g;
    const g3 = (await as(`select get_shop_customers() g`))[0].g;
    expect(g1.customers.length).toBe(1);
    expect(g2.customers).toEqual(g1.customers);
    expect(g3.customers).toEqual(g1.customers);
    // declining doesn't summon the next customer early
    await respond(g1.customers[0].id, 'decline');
    const g4 = (await as(`select get_shop_customers() g`))[0].g;
    expect(g4.customers.length).toBe(0);
  });

  test('auction bidders get a persona, a name from its pool, and respect the ceiling', async () => {
    const m = (
      await q(
        `insert into market_listings (seller, card_id, listing_type, price, ends_at)
         values ($1, 'e1', 'auction', 10, now() + interval '10 minutes') returning id`,
        [A],
      )
    )[0].id;
    await q(`select run_cpu_bidders()`);
    const cpu = (await q(`select * from market_listing_cpu where listing_id = $1`, [m]))[0];
    expect(cpu.persona_id).toBeTruthy();
    const ml = (await q(`select * from market_listings where id = $1`, [m]))[0];
    const names = (
      await q(`select names from cpu_buyer_personas where id = $1`, [cpu.persona_id])
    )[0].names;
    expect(names).toContain(ml.cpu_bidder_name);
    expect(ml.current_bid).toBeLessThanOrEqual(cpu.cpu_ceiling);
    expect(ml.current_bid).toBeGreaterThanOrEqual(10);
  });

  test('timing: refreshes between arrivals take the early exit', async () => {
    await listing(500, 100, 'c1');
    await q(`update player_shops set last_customer_at = null`);
    let t = performance.now();
    await as(`select get_shop_customers()`);
    const spawnMs = performance.now() - t;
    t = performance.now();
    for (let i = 0; i < 100; i++) await as(`select get_shop_customers()`);
    const refreshMs = (performance.now() - t) / 100;
    t = performance.now();
    for (let i = 0; i < 100; i++) await q(`select run_cpu_bidders()`);
    const idleBidderMs = (performance.now() - t) / 100;
    process.stderr.write(
      `[pglite] spawn ${spawnMs.toFixed(2)}ms, refresh ${refreshMs.toFixed(2)}ms, idle bidder tick ${idleBidderMs.toFixed(2)}ms\n`,
    );
    expect(
      (await q(`select count(*)::int n from shop_customers where status = 'waiting'`))[0].n,
    ).toBe(1);
  });
});
