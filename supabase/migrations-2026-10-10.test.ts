/**
 * FryCards Poker deck rules on the server (20261010000000) against PGlite,
 * with the cards table filled from the real pool exactly as
 * scripts/sync-cards-db.ts writes it. The server's verdicts are checked
 * against the client's own rules (checkDeck / legalModes).
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';
import { POOL, POOL_BY_ID, POOL_LEADERS } from '../src/game/poker/cardpool';
import { MODES, MODE_IDS } from '../src/game/poker/constants';
import { buildDeck, checkDeck, deckCardIds, legalModes } from '../src/game/poker/deck';
import { rngOn } from '../src/game/poker/rng';
import { mechanicsFromDef } from '../src/meta/submissions';

const A = '11111111-1111-1111-1111-111111111111';
const MIGRATION = readFileSync(
  join(__dirname, 'migrations', '20261010000000_poker_deck_rules.sql'),
  'utf8',
);
/** 20261011000000: drops the MTG-era helpers, nulls the retired columns. */
const RETIRE = readFileSync(
  join(__dirname, 'migrations', '20261011000000_retire_old_rule_helpers.sql'),
  'utf8',
);

let db: PGlite;
const q = async (s: string, params: unknown[] = []) => (await db.query(s, params)).rows as any[];

const serverModes = async (leader: string, ids: string[]) =>
  ((await q(`select poker_deck_modes($1, $2) m`, [leader, ids]))[0].m as string[]) ?? [];

/** Give A every card in the pool, `n` copies each. */
async function ownEverything(n: number) {
  await q(`delete from player_cards`);
  await q(
    `insert into player_cards (user_id, card_id, quantity) select '${A}', id, ${n} from cards`,
  );
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create table cards (id text primary key, name text, card_type text, rarity text, set_name text,
      flavor_text text, image_url text, keywords text, template jsonb, essence_cost jsonb,
      essence_types text[], might int, grit int, card_subtype text, resolve int, rules_text text,
      updated_at timestamptz);
    create table player_cards (user_id uuid, card_id text, quantity int default 0, foil_quantity int default 0,
      primary key (user_id, card_id));
    create table decks (id uuid primary key default gen_random_uuid(), user_id uuid, name text,
      leader_id text, card_ids text[], is_valid boolean, created_at timestamptz default now(),
      updated_at timestamptz default now());
    create table pack_types (id int primary key, acquisition text, is_active boolean, allowed_sets text[]);
    create table player_inventory (user_id uuid, pack_type_id int, quantity int);
    create table profiles (id uuid primary key, credits int default 0, vouchers int default 0);
    insert into pack_types values (1, 'deck_box_grant', true, null);
    insert into profiles (id) values ('${A}');
  `);
  for (const d of POOL) {
    const m = mechanicsFromDef(d);
    await q(
      `insert into cards (id, name, card_type, rarity, set_name, keywords, essence_types, might, card_subtype, rules_text)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        d.id,
        d.name,
        d.type,
        d.rarity,
        d.set ?? 'Core',
        m.keywords,
        m.essence_types,
        m.might,
        m.card_subtype,
        m.rules_text,
      ],
    );
  }
  // The MTG-era helpers, as live had them, so the retirement drop is tested.
  await db.exec(`
    create function deck_card_cost(p jsonb) returns int language sql immutable as $$ select 0 $$;
    create function rarity_copy_cap(p_rarity text) returns int language sql immutable as $$ select 4 $$;
  `);
  await db.exec(MIGRATION);
  await db.exec(RETIRE);
  await db.exec(`set test.uid = '${A}'`);
}, 120_000);

describe('poker_deck_modes', () => {
  test('agrees with the client on built decks and on every kind of broken one', async () => {
    const rng = rngOn({ rng: 31 });
    let checked = 0;
    for (const leader of POOL_LEADERS) {
      for (const mode of MODE_IDS) {
        const ids = deckCardIds(buildDeck(leader, MODES[mode], rng));
        const offColour = POOL.find(
          (c) =>
            c.type === 'Unit' &&
            c.colors.length &&
            !c.colors.every((x) => leader.colors.includes(x)),
        )!;
        const tier5 = POOL.filter(
          (c) => c.tier === 5 && c.colors.every((x) => leader.colors.includes(x)),
        ).map((c) => c.id);
        const variants: string[][] = [
          ids,
          ids.slice(0, -1), // one power short
          [...ids, ids[1]], // one power over (and maybe a third copy)
          [...ids.slice(0, -1), ids[1], ids[1]], // too many copies
          [...ids.slice(0, -1), offColour.id], // off colour
          ids.filter((id) => POOL_BY_ID[id].type !== 'Location'), // no Location
          [...ids.slice(0, -1), ids[0]], // two Locations
          [...ids.slice(0, -1), leader.id], // a Leader in the list
          [...ids.slice(0, -1), 'not_a_card'],
          [...ids.slice(0, -4), ...tier5.slice(0, 4)], // tier-5 overflow
        ];
        for (const v of variants) {
          expect(await serverModes(leader.id, v), `${leader.name} ${mode}`).toEqual(
            legalModes(leader.id, v),
          );
          checked++;
        }
      }
    }
    expect(checked).toBe(POOL_LEADERS.length * MODE_IDS.length * 10);
  }, 120_000);
});

describe('save_deck', () => {
  test('grades legality by the poker rules, not the 60-card rule', async () => {
    await ownEverything(3);
    const leader = POOL_LEADERS[0];
    const ids = deckCardIds(buildDeck(leader, MODES.standard, rngOn({ rng: 4 })));
    const [ok] = await q(`select save_deck(null, 'Poker', $1, $2) r`, [leader.id, ids]);
    expect(ok.r.is_valid).toBe(true);
    await q(`delete from decks`);
    const [draft] = await q(`select save_deck(null, 'Draft', $1, $2) r`, [
      leader.id,
      ids.slice(0, 10),
    ]);
    expect(draft.r.is_valid).toBe(false);
    await q(`delete from decks`);
  });

  test('two copies of a Mythic are legal; four of anything are refused', async () => {
    await ownEverything(4);
    const leader = POOL_LEADERS.find((l) =>
      POOL.some(
        (c) =>
          c.rarity === 'Mythic' && c.type === 'Unit' && c.colors.every((x) => l.colors.includes(x)),
      ),
    )!;
    const mythic = POOL.find(
      (c) =>
        c.rarity === 'Mythic' &&
        c.type === 'Unit' &&
        c.colors.every((x) => leader.colors.includes(x)),
    )!;
    const ids = deckCardIds(buildDeck(leader, MODES.standard, rngOn({ rng: 9 }))).filter(
      (id) => id !== mythic.id,
    );
    const list = [...ids.slice(0, -2), mythic.id, mythic.id];
    const [r] = await q(`select save_deck(null, 'Mythics', $1, $2) r`, [leader.id, list]);
    expect(r.r.is_valid).toBe(legalModes(leader.id, list).length > 0);
    await q(`delete from decks`);
    await expect(
      q(`select save_deck(null, 'Four', $1, $2) r`, [
        leader.id,
        [...ids, mythic.id, mythic.id, mythic.id, mythic.id],
      ]),
    ).rejects.toThrow(/Too many copies/);
    await q(`delete from decks`);
  });
});

describe('claim_deck_box', () => {
  const boxLeaders = POOL_LEADERS.filter((l) =>
    ['Common', 'Uncommon', 'Rare'].includes(l.rarity ?? 'Common'),
  );

  test.each(boxLeaders.map((l) => [l.name, l.id]))(
    '%s: grants 60 cards and saves a legal Standard deck built from them',
    async (_name, leaderId) => {
      await db.exec(`delete from player_cards; delete from decks; delete from player_inventory`);
      await q(`insert into player_inventory values ('${A}', 1, 1)`);
      const [r] = await q(`select claim_deck_box($1) r`, [leaderId]);
      expect(r.r.deck_saved).toBe(true);
      const owned = await q(`select card_id, quantity from player_cards where card_id <> $1`, [
        leaderId,
      ]);
      const have = new Map(owned.map((o) => [o.card_id as string, o.quantity as number]));
      expect([...have.values()].reduce((a, b) => a + b, 0)).toBe(60);
      const locations = owned.filter((o) => POOL_BY_ID[o.card_id].type === 'Location');
      expect(locations.reduce((a, o) => a + o.quantity, 0)).toBeLessThanOrEqual(10);

      const [deck] = await q(`select card_ids, is_valid from decks`);
      const ids = deck.card_ids as string[];
      expect(checkDeck(leaderId as string, ids, 'standard').issues).toEqual([]);
      expect(deck.is_valid).toBe(true);
      // Never more copies than the box granted.
      const used = new Map<string, number>();
      for (const id of ids) used.set(id, (used.get(id) ?? 0) + 1);
      for (const [id, n] of used) expect(n).toBeLessThanOrEqual(have.get(id) ?? 0);
      // The CPU builder's curve.
      const tier = (t: number) => ids.filter((id) => POOL_BY_ID[id].tier === t).length;
      expect(tier(4)).toBeLessThanOrEqual(3);
      expect(tier(5)).toBeLessThanOrEqual(2);
    },
  );

  test('a claim without a Deck Box is refused', async () => {
    await db.exec(`delete from player_inventory; delete from decks`);
    await expect(q(`select claim_deck_box($1)`, [boxLeaders[0].id])).rejects.toThrow(/no Deck Box/);
  });
});

describe('apply_card_upsert', () => {
  const payload = (over: Record<string, unknown> = {}) => {
    const d = POOL.find((c) => c.type === 'Unit')!;
    return {
      id: 'test_new_unit',
      name: 'Test Unit',
      card_type: 'Unit',
      rarity: 'Common',
      set_name: 'Players Showcase 2026',
      flavor_text: 'A test.',
      image_url: 'https://example.com/a.png',
      mechanics: { ...mechanicsFromDef(d), ...over },
    };
  };

  test('accepts poker mechanics (no essence cost, no grit)', async () => {
    const [r] = await q(`select apply_card_upsert($1::jsonb, false) r`, [
      JSON.stringify(payload()),
    ]);
    expect(r.r).toBe('inserted');
    const [row] = await q(`select might, essence_cost, grit from cards where id = 'test_new_unit'`);
    expect(row.might).toBeGreaterThanOrEqual(1);
    expect(row.essence_cost).toBeNull();
    expect(row.grit).toBeNull();
  });

  test('retired columns are stored null whatever the payload carries', async () => {
    const body = {
      ...payload({ essence_cost: { generic: 3 }, grit: 4, resolve: 2 }),
      id: 'test_old_stats',
    };
    await q(`select apply_card_upsert($1::jsonb, true)`, [JSON.stringify(body)]);
    const [row] = await q(
      `select essence_cost, grit, resolve from cards where id = 'test_old_stats'`,
    );
    expect(row).toEqual({ essence_cost: null, grit: null, resolve: null });
  });

  test('the MTG-era helpers are gone', async () => {
    const [r] = await q(
      `select count(*)::int n from pg_proc where proname in ('deck_card_cost', 'rarity_copy_cap')`,
    );
    expect(r.n).toBe(0);
  });

  test('a power without a tier is refused', async () => {
    await expect(
      q(`select apply_card_upsert($1::jsonb, true)`, [JSON.stringify(payload({ might: null }))]),
    ).rejects.toThrow(/tier/);
  });

  test('every card in the pool round-trips through it', async () => {
    for (const d of POOL.slice(0, 60)) {
      const body = {
        id: `rt_${d.id}`
          .slice(0, 64)
          .toLowerCase()
          .replace(/[^a-z0-9_]/g, '_'),
        name: d.name.slice(0, 80),
        card_type: d.type,
        rarity: d.rarity ?? 'Common',
        set_name: d.set ?? 'Core',
        flavor_text: (d.flavor ?? '').slice(0, 500),
        image_url: 'https://example.com/a.png',
        mechanics: mechanicsFromDef(d),
      };
      await q(`select apply_card_upsert($1::jsonb, true)`, [JSON.stringify(body)]);
    }
  });
});
