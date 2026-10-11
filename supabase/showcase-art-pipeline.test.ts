/**
 * 20261012000004 showcase art pipeline against PGlite: approve queues the art,
 * the Action's token-gated jobs/report calls publish it (rewriting both
 * cards.image_url and template.image), failures can be retried, and a bad
 * token is refused.
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';

const CREATOR = '11111111-1111-1111-1111-111111111111';
const P = '22222222-2222-2222-2222-222222222222';
const S1 = 'aaaaaaaa-0000-0000-0000-000000000001';
const S2 = 'aaaaaaaa-0000-0000-0000-000000000002';
const TOKEN = 'test-token-0123456789-abcdefgh';
const file = (f: string) => readFileSync(join(__dirname, 'migrations', f), 'utf8');

let db: PGlite;
const q = async (s: string, p: unknown[] = []) => (await db.query(s, p)).rows as any[];
const as = (uid: string) => db.exec(`set test.uid = '${uid}'`);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create function assert_creator() returns void language plpgsql as $$
      begin if auth.uid() is distinct from '${CREATOR}'::uuid then raise exception 'creator only'; end if; end $$;
    create table profiles (id uuid primary key, username text, submissions_banned boolean default false,
      submissions_ban_reason text, updated_at timestamptz);
    create table cards (id text primary key, image_url text, template jsonb, rarity text,
      updated_at timestamptz);
    create function apply_card_upsert(p_card jsonb, p_overwrite boolean default false) returns text
      language sql as $$
        insert into cards values (p_card->>'id', p_card->>'image_url',
          jsonb_build_object('id', p_card->>'id', 'image', p_card->>'image_url'), p_card->>'rarity', now());
        select 'inserted' $$;
    create table card_submissions (id uuid primary key, submitter uuid, set_name text, card_name text,
      card_type text, flavor_text text, image_url text, requested_treatment text, status text,
      review_note text, reviewed_by uuid, reviewed_at timestamptz, approved_card_id text references cards(id),
      approved_rarity text, created_at timestamptz default now(), updated_at timestamptz);
    insert into profiles (id, username) values ('${P}', 'pat');
    insert into card_submissions (id, submitter, set_name, card_name, card_type, flavor_text, image_url,
      requested_treatment, status) values
      ('${S1}', '${P}', 'Players Showcase 2026', 'Ashen Kite', 'Unit', 'x', 'https://gen.example/a.png', 'standard', 'pending'),
      ('${S2}', '${P}', 'Players Showcase 2026', 'Tide Shrine', 'Location', 'x', 'https://gen.example/b.png', 'standard', 'pending');
  `);
  await db.exec(file('20261012000004_showcase_art_pipeline.sql'));
  await db.exec(file('20261012000004_showcase_art_pipeline.sql')); // idempotent
  await as(CREATOR);
  await q(`select creator_set_art_pipeline_token($1)`, [TOKEN]);
});

describe('showcase art pipeline', () => {
  test('approve mints the card and queues its art', async () => {
    await q(`select creator_review_submission($1, 'approve', null, 'ashen_kite', 'Rare')`, [S1]);
    await q(`select creator_review_submission($1, 'approve', null, 'tide_shrine', 'Common')`, [S2]);
    const rows = await q(`select art_status from card_submissions order by id`);
    expect(rows.map((r) => r.art_status)).toEqual(['pending', 'pending']);
    const v2 = (await q(`select get_card_submissions_v2('approved') j`))[0].j;
    expect(v2).toHaveLength(2);
    expect(v2[0].art_status).toBe('pending');
  });

  test('a bad token is refused', async () => {
    await expect(q(`select art_pipeline_jobs('nope-nope-nope-nope-nope-nope')`)).rejects.toThrow(
      /bad token/,
    );
  });

  test('jobs lists the queue with its source url', async () => {
    const j = (await q(`select art_pipeline_jobs($1) j`, [TOKEN]))[0].j;
    expect(j.pending.map((p: any) => p.card_id).sort()).toEqual(['ashen_kite', 'tide_shrine']);
    expect(j.pending.find((p: any) => p.card_id === 'ashen_kite').source_url).toBe(
      'https://gen.example/a.png',
    );
    expect(j.published).toEqual([]);
  });

  test('report publishes and fails, rewriting the card row', async () => {
    const url = 'https://frycards-showcase.pages.dev/cards/ashen_kite.webp';
    const n = (
      await q(`select art_pipeline_report($1, $2::jsonb) n`, [
        TOKEN,
        JSON.stringify([
          { submission_id: S1, ok: true, art_url: url },
          { submission_id: S2, ok: false, error: '404 from source' },
        ]),
      ])
    )[0].n;
    expect(n).toBe(2);
    const card = (
      await q(`select image_url, template->>'image' t from cards where id = 'ashen_kite'`)
    )[0];
    expect(card).toEqual({ image_url: url, t: url });
    const subs = await q(`select art_status, art_error from card_submissions order by id`);
    expect(subs[0].art_status).toBe('published');
    expect(subs[1]).toEqual({ art_status: 'failed', art_error: '404 from source' });
    const j = (await q(`select art_pipeline_jobs($1) j`, [TOKEN]))[0].j;
    expect(j.pending).toEqual([]);
    expect(j.published).toEqual([
      { card_id: 'ashen_kite', art_url: url, source_url: 'https://gen.example/a.png' },
    ]);
  });

  test('retry re-queues a failure; non-creators cannot', async () => {
    await q(`select creator_retry_submission_art($1)`, [S2]);
    expect(
      (await q(`select art_status from card_submissions where id = $1`, [S2]))[0].art_status,
    ).toBe('pending');
    await as(P);
    await expect(q(`select creator_retry_submission_art($1)`, [S2])).rejects.toThrow(
      /creator only/,
    );
    await as(CREATOR);
  });

  test('a published report cannot be replayed onto a published row', async () => {
    const n = (
      await q(`select art_pipeline_report($1, $2::jsonb) n`, [
        TOKEN,
        JSON.stringify([{ submission_id: S1, ok: true, art_url: 'https://evil.example/x.png' }]),
      ])
    )[0].n;
    expect(n).toBe(0);
  });
});
