/**
 * 20261013000002 against PGlite: the private submission-art bucket's RLS
 * (own-folder uploads, 3 pending uploads, Creator-only reads), submit_card_art,
 * the pipeline's art_path + token-gated sign/cleanup lists, and the removal
 * schedule (published -> now, denied/withdrawn -> 30 days, orphans -> 2 days).
 */
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeAll, describe, expect, test } from 'vitest';

const CREATOR = '11111111-1111-1111-1111-111111111111';
const P = '22222222-2222-2222-2222-222222222222';
const Q = '33333333-3333-3333-3333-333333333333';
const TOKEN = 'test-token-0123456789-abcdefgh';
const file = (f: string) => readFileSync(join(__dirname, 'migrations', f), 'utf8');

let db: PGlite;
const q = async (s: string, p: unknown[] = []) => (await db.query(s, p)).rows as any[];
let n = 0;
const uuid = () => `00000000-0000-0000-0000-${String(++n).padStart(12, '0')}`;
/** Runs `s` as the `authenticated` role (RLS applies) for user `uid`. */
const asUser = async (uid: string, s: string, p: unknown[] = []) => {
  await db.exec(`set test.uid = '${uid}'; set role authenticated`);
  try {
    return await q(s, p);
  } finally {
    await db.exec('reset role');
  }
};
const upload = (uid: string, name = `${uid}/${uuid()}.png`) =>
  asUser(uid, `insert into storage.objects (bucket_id, name) values ('submission-art', $1)`, [
    name,
  ]).then(() => name);

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role anon; create role authenticated; create role service_role;
    create schema auth;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean,
      file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text,
      name text, owner uuid default auth.uid(), created_at timestamptz default now());
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    alter table storage.objects enable row level security;
    grant usage on schema storage, auth to authenticated;
    grant select, insert, update, delete on storage.objects to authenticated;
    create function assert_creator() returns void language plpgsql as $$
      begin if auth.uid() is distinct from '${CREATOR}'::uuid then raise exception 'creator only'; end if; end $$;
    create table profiles (id uuid primary key, username text, role text default 'player',
      submissions_banned boolean default false, submissions_ban_reason text, updated_at timestamptz);
    create table cards (id text primary key, image_url text, template jsonb, rarity text,
      updated_at timestamptz);
    create function apply_card_upsert(p_card jsonb, p_overwrite boolean default false) returns text
      language sql as $$
        insert into cards values (p_card->>'id', p_card->>'image_url',
          jsonb_build_object('id', p_card->>'id', 'image', p_card->>'image_url'), p_card->>'rarity', now());
        select 'inserted' $$;
    create table card_submissions (id uuid primary key default gen_random_uuid(), submitter uuid,
      set_name text, card_name text, card_type text, flavor_text text, image_url text not null,
      requested_treatment text, status text default 'pending', review_note text, reviewed_by uuid,
      reviewed_at timestamptz, approved_card_id text references cards(id), approved_rarity text,
      created_at timestamptz default now(), updated_at timestamptz);
    -- Stand-in for the live submit_card (its own tests live elsewhere).
    create function submit_card(p_name text, p_type text, p_flavor text, p_image_url text,
      p_treatment text default 'standard') returns card_submissions language plpgsql as $$
      declare v card_submissions%rowtype;
      begin
        if p_treatment <> 'video_mythic' and p_image_url ~* '\\.(mp4|webm)$' then
          raise exception 'Video art can only be submitted as a video Mythic.';
        end if;
        insert into card_submissions (submitter, set_name, card_name, card_type, flavor_text, image_url,
          requested_treatment) values (auth.uid(), 'Players Showcase 2026', p_name, p_type, p_flavor,
          p_image_url, p_treatment) returning * into v;
        return v;
      end $$;
    insert into profiles (id, username, role) values
      ('${CREATOR}', 'fry', 'creator'), ('${P}', 'pat', 'player'), ('${Q}', 'quinn', 'player');
  `);
  await db.exec(file('20261012000004_showcase_art_pipeline.sql'));
  await db.exec(file('20261013000002_submission_art_uploads.sql'));
  await db.exec(file('20261013000002_submission_art_uploads.sql')); // idempotent
  await q(
    `insert into art_pipeline_secret values (1, encode(sha256(convert_to($1, 'UTF8')), 'hex'))`,
    [TOKEN],
  );
});

describe('submission-art bucket', () => {
  test('is private with an 8 MB limit and image/video types', async () => {
    const [b] = await q(`select * from storage.buckets where id = 'submission-art'`);
    expect(b.public).toBe(false);
    expect(Number(b.file_size_limit)).toBe(8 * 1024 * 1024);
    expect(b.allowed_mime_types).toEqual(
      expect.arrayContaining(['image/png', 'image/jpeg', 'image/webp', 'video/mp4', 'video/webm']),
    );
  });

  test('uploads only into your own top-level folder', async () => {
    await upload(Q);
    await expect(upload(Q, `${P}/${uuid()}.png`)).rejects.toThrow(/row-level security/);
    await expect(upload(Q, `${Q}/nested/${uuid()}.png`)).rejects.toThrow(/row-level security/);
  });

  test('at most 3 pending uploads per user', async () => {
    await upload(Q);
    await upload(Q);
    await expect(upload(Q)).rejects.toThrow(/row-level security/);
  });

  test('banned players cannot upload', async () => {
    const B = '44444444-4444-4444-4444-444444444444';
    await q(`insert into profiles (id, submissions_banned) values ($1, true)`, [B]);
    await expect(upload(B)).rejects.toThrow(/row-level security/);
  });

  test('only the Creator can read objects', async () => {
    expect(await asUser(Q, `select name from storage.objects`)).toHaveLength(0);
    expect(await asUser(P, `select name from storage.objects`)).toHaveLength(0);
    expect((await asUser(CREATOR, `select name from storage.objects`)).length).toBeGreaterThan(0);
  });
});

describe('submit_card_art and the pipeline', () => {
  let path: string;
  let sub: string;
  test('attaches an uploaded object to a new submission', async () => {
    path = await upload(P);
    const [r] = await asUser(
      P,
      `select * from submit_card_art('Ashen Kite', 'Unit', 'smoke', $1)`,
      [path],
    );
    sub = r.id;
    expect(r.art_path).toBe(path);
    expect(r.image_url).toBe(`https://submission-art.invalid/${path}`);
    await expect(
      asUser(P, `select submit_card_art('Other', 'Unit', 'smoke', $1)`, [path]),
    ).rejects.toThrow(/already attached/);
  });

  test("rejects someone else's path, missing objects and video outside video_mythic", async () => {
    const theirs = await upload(CREATOR);
    await expect(
      asUser(P, `select submit_card_art('X1', 'Unit', 'smoke', $1)`, [theirs]),
    ).rejects.toThrow(/not valid/);
    await expect(
      asUser(P, `select submit_card_art('X2', 'Unit', 'smoke', $1)`, [`${P}/${uuid()}.png`]),
    ).rejects.toThrow(/not found/);
    const vid = await upload(P, `${P}/${uuid()}.mp4`);
    await expect(
      asUser(P, `select submit_card_art('X3', 'Unit', 'smoke', $1)`, [vid]),
    ).rejects.toThrow(/video Mythic/);
  });

  test('approval exposes art_path to the token-gated sign list only', async () => {
    await q(`set test.uid = '${CREATOR}'`);
    await q(`select creator_review_submission($1, 'approve', null, 'ashen_kite', 'Rare')`, [sub]);
    const jobs = (await q(`select art_pipeline_jobs($1) j`, [TOKEN]))[0].j;
    expect(jobs.pending[0].art_path).toBe(path);
    expect((await q(`select submission_art_sign_jobs($1) s`, [TOKEN]))[0].s).toEqual([path]);
    await expect(
      q(`select submission_art_sign_jobs('wrong-token-wrong-token-xx')`),
    ).rejects.toThrow(/bad token/);
  });

  test('publishing marks the upload removable; cleanup lists it once', async () => {
    expect((await q(`select submission_art_cleanup_jobs($1) c`, [TOKEN]))[0].c).not.toContain(path);
    await q(`select art_pipeline_report($1, $2)`, [
      TOKEN,
      JSON.stringify([
        {
          submission_id: sub,
          ok: true,
          art_url: 'https://frycards-showcase.pages.dev/cards/a.webp',
        },
      ]),
    ]);
    expect((await q(`select submission_art_cleanup_jobs($1) c`, [TOKEN]))[0].c).toContain(path);
    expect((await q(`select submission_art_mark_removed($1, $2) n`, [TOKEN, [path]]))[0].n).toBe(1);
    expect((await q(`select submission_art_cleanup_jobs($1) c`, [TOKEN]))[0].c).not.toContain(path);
  });

  test('denied uploads become removable after 30 days; orphans after 2', async () => {
    const p2 = await upload(P);
    const [r] = await asUser(
      P,
      `select * from submit_card_art('Tide Shrine', 'Location', 'tide', $1)`,
      [p2],
    );
    await q(`set test.uid = '${CREATOR}'`);
    await q(`select creator_review_submission($1, 'deny', 'no')`, [r.id]);
    const [row] = await q(
      `select round(extract(epoch from art_removable_at - now()) / 86400)::int d from card_submissions where id = $1`,
      [r.id],
    );
    expect(row.d).toBe(30);
    expect((await q(`select submission_art_cleanup_jobs($1) c`, [TOKEN]))[0].c).not.toContain(p2);
    await q(
      `update card_submissions set art_removable_at = now() - interval '1 minute' where id = $1`,
      [r.id],
    );
    expect((await q(`select submission_art_cleanup_jobs($1) c`, [TOKEN]))[0].c).toContain(p2);

    const orphan = await upload(CREATOR);
    await q(`update storage.objects set created_at = now() - interval '3 days' where name = $1`, [
      orphan,
    ]);
    expect((await q(`select submission_art_cleanup_jobs($1) c`, [TOKEN]))[0].c).toContain(orphan);
  });
});
