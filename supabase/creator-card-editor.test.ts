/**
 * 20261012000005 creator_update_card against PGlite, over the real
 * apply_card_upsert (from 20261011000000): Creator-only, existing cards only,
 * writes overrides + mechanics columns together, RESET removes the overrides,
 * keeps the stored art, and moves get_catalog_version.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';

const CREATOR = '11111111-1111-1111-1111-111111111111';
const P = '22222222-2222-2222-2222-222222222222';
const file = (f: string) => readFileSync(join(__dirname, 'migrations', f), 'utf8');

let db: PGlite;
const q = async (s: string, p: unknown[] = []) => (await db.query(s, p)).rows as any[];
const as = (uid: string) => db.exec(`set test.uid = '${uid}'`);
const upsertSql = () => {
  const src = file('20261011000000_retire_old_rule_helpers.sql');
  const start = src.indexOf('create or replace function public.apply_card_upsert');
  const end = src.indexOf('end $function$;', start) + 'end $function$;'.length;
  return src.slice(start, end);
};
const payload = (over: Record<string, unknown> = {}) => ({
  id: 'ashen_kite',
  name: 'Ashen Kite',
  card_type: 'Unit',
  rarity: 'Rare',
  set_name: 'Players Showcase 2026',
  flavor_text: 'It circles.',
  mechanics: {
    keywords: 'Kindle',
    essence_types: ['Ember'],
    might: 3,
    card_subtype: null,
    rules_text: 'Kindle 1.',
  },
  ...over,
});

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function assert_creator() returns void language plpgsql as $$
      begin if auth.uid() is distinct from '${CREATOR}'::uuid then raise exception 'creator only'; end if; end $$;
    create table cards (id text primary key, name text, card_type text, rarity text, set_name text,
      flavor_text text, image_url text, keywords text, template jsonb, essence_cost jsonb,
      essence_types text[], might int, grit int, card_subtype text, resolve int, rules_text text,
      created_at timestamptz default now(), updated_at timestamptz default now());
  `);
  await db.exec(upsertSql());
  await db.exec(file('20261012000003_catalog_version.sql'));
  await db.exec(file('20261012000005_creator_card_editor.sql'));
  await db.exec(file('20261012000005_creator_card_editor.sql'));
  await q(`select apply_card_upsert($1::jsonb, false)`, [
    JSON.stringify(payload({ image_url: 'https://art.example/a.webp' })),
  ]);
});

describe('creator_update_card', () => {
  test('non-creators are refused', async () => {
    await as(P);
    await expect(
      q(`select creator_update_card($1::jsonb)`, [JSON.stringify(payload())]),
    ).rejects.toThrow(/creator only/);
  });

  test('writes overrides and mechanics together, keeps art, bumps the version', async () => {
    await as(CREATOR);
    const before = (await q(`select get_catalog_version() v`))[0].v;
    const ver = (
      await q(`select creator_update_card($1::jsonb) v`, [
        JSON.stringify(
          payload({
            overrides: { tier: 5, colors: ['Void'], manual: true },
            mechanics: {
              keywords: 'Burn',
              essence_types: ['Void'],
              might: 5,
              card_subtype: null,
              rules_text: 'Burn 2.',
            },
          }),
        ),
      ])
    )[0].v;
    expect(ver).not.toBe(before);
    const row = (await q(`select * from cards where id = 'ashen_kite'`))[0];
    expect(row.template.overrides).toEqual({ tier: 5, colors: ['Void'], manual: true });
    expect(row.might).toBe(5);
    expect(row.essence_types).toEqual(['Void']);
    expect(row.rules_text).toBe('Burn 2.');
    expect(row.image_url).toBe('https://art.example/a.webp');
  });

  test('reset to rolled removes the overrides', async () => {
    await q(`select creator_update_card($1::jsonb)`, [JSON.stringify(payload())]);
    const row = (await q(`select template from cards where id = 'ashen_kite'`))[0];
    expect(row.template.overrides).toBeUndefined();
  });

  test('unknown ids and invalid mechanics are refused', async () => {
    await expect(
      q(`select creator_update_card($1::jsonb)`, [JSON.stringify(payload({ id: 'nope_card' }))]),
    ).rejects.toThrow(/No card/);
    await expect(
      q(`select creator_update_card($1::jsonb)`, [
        JSON.stringify(
          payload({ mechanics: { essence_types: ['Ember'], might: 9, rules_text: 'x' } }),
        ),
      ]),
    ).rejects.toThrow(/tier/);
  });
});
