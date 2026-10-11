/**
 * 20261012000008 cosmetics mirror against PGlite: token-gated job list, and a
 * compare-and-set report that only rewrites rows still pointing at the
 * original link.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';

const TOKEN = 'test-token-0123456789-abcdefgh';
const I1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const I2 = 'aaaaaaaa-0000-0000-0000-000000000002';
let db: PGlite;
const q = async (s: string, p: unknown[] = []) => (await db.query(s, p)).rows as any[];

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create table art_pipeline_secret (id int primary key, token_hash text not null);
    insert into art_pipeline_secret values (1, encode(sha256(convert_to('${TOKEN}', 'UTF8')), 'hex'));
    create function art_pipeline_check(p_token text) returns void language plpgsql as $$
    begin
      if p_token is null or char_length(p_token) < 24 or not exists (
        select 1 from art_pipeline_secret where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex'))
      then raise exception 'art pipeline: bad token'; end if;
    end $$;
    create table shop_items (id uuid primary key, name text, image_url text);
    insert into shop_items values
      ('${I1}', 'Back', 'https://cdn.midjourney.com/a/0_0.png'),
      ('${I2}', 'Banner', 'https://cdn.midjourney.com/b/0_1.png'),
      ('aaaaaaaa-0000-0000-0000-000000000003', 'None', null);
  `);
  const sql = readFileSync(
    join(__dirname, 'migrations', '20261012000008_cosmetics_mirror.sql'),
    'utf8',
  );
  await db.exec(sql);
  await db.exec(sql);
});

describe('cosmetics mirror RPCs', () => {
  test('jobs need the token and list every item with an image', async () => {
    await expect(
      q(`select cosmetics_mirror_jobs('nope-nope-nope-nope-nope-nope')`),
    ).rejects.toThrow(/bad token/);
    const jobs = (await q(`select cosmetics_mirror_jobs($1) j`, [TOKEN]))[0].j;
    expect(jobs.map((j: any) => j.id)).toEqual([I1, I2]);
  });

  test('report rewrites only rows still on the original link', async () => {
    await q(
      `update shop_items set image_url = 'https://elsewhere.example/x.png' where id = '${I2}'`,
    );
    const n = (
      await q(`select cosmetics_mirror_report($1, $2::jsonb) n`, [
        TOKEN,
        JSON.stringify([
          {
            id: I1,
            source_url: 'https://cdn.midjourney.com/a/0_0.png',
            image_url: `https://frycards-showcase.pages.dev/Cosmetics/${I1}.webp`,
          },
          {
            id: I2,
            source_url: 'https://cdn.midjourney.com/b/0_1.png',
            image_url: `https://frycards-showcase.pages.dev/Cosmetics/${I2}.webp`,
          },
        ]),
      ])
    )[0].n;
    expect(n).toBe(1);
    const rows = await q(`select id, image_url from shop_items order by id`);
    expect(rows[0].image_url).toBe(`https://frycards-showcase.pages.dev/Cosmetics/${I1}.webp`);
    expect(rows[1].image_url).toBe('https://elsewhere.example/x.png');
    await expect(
      q(`select cosmetics_mirror_report($1, $2::jsonb)`, [
        TOKEN,
        JSON.stringify([{ id: I1, source_url: 'x', image_url: 'http://insecure/x' }]),
      ]),
    ).rejects.toThrow(/https/);
  });
});
