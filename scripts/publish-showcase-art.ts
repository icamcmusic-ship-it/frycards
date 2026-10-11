/**
 * Moves approved Player Showcase art onto Cloudflare Pages, then points the
 * card at it. Run by .github/workflows/showcase-art.yml on a schedule; safe to
 * run by hand. See docs/CARD_SUBMISSIONS.md.
 *
 *   ART_PIPELINE_TOKEN=... CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ACCOUNT_ID=... \
 *     npx tsx scripts/publish-showcase-art.ts
 *
 * One run:
 *  1. ONE rpc (art_pipeline_jobs): the approved cards whose art is pending,
 *     plus every card already published. No token -> nothing to do, exit 0.
 *     Empty queue -> exit 0 (an idle run is that single tiny query).
 *  2. Downloads each pending original from the link the player submitted,
 *     encodes it (images: the same 1200px webp master as the main art
 *     pipeline, scripts/lib/derive.ts; videos: the 480p muted faststart mp4
 *     of scripts/shrink-video-art.ts), under a content-addressed key.
 *  3. Re-downloads every already-published file from the live Pages site, so
 *     the new deployment still contains it (a Pages deploy replaces the whole
 *     site). If any of those cannot be fetched, it stops BEFORE deploying.
 *  4. `wrangler pages deploy` to the showcase project.
 *  5. ONE rpc (art_pipeline_report): published cards get cards.image_url and
 *     template.image rewritten (which moves get_catalog_version, so clients
 *     refetch the catalog); failures are recorded for the Creator to retry.
 *
 * The player's original link is never deleted: it stays on the submission row
 * (card_submissions.image_url), which is the retention policy for showcase art.
 *
 * Environment:
 *   ART_PIPELINE_TOKEN       shared secret; its SHA-256 is set in the DB with
 *                            creator_set_art_pipeline_token (see the doc)
 *   CLOUDFLARE_API_TOKEN     Pages:Edit token for wrangler
 *   CLOUDFLARE_ACCOUNT_ID    the account that owns the Pages project
 *   SHOWCASE_PAGES_PROJECT   optional, default 'frycards-showcase'
 *   SHOWCASE_ART_BASE_URL    optional, default https://<project>.pages.dev
 *   VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY   optional overrides
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { masterBytes } from './lib/derive';
import {
  PAGES_FILE_LIMIT,
  SHOWCASE_HEADERS,
  SOURCE_LIMIT,
  isVideoSource,
  keyFromUrl,
  parseJobs,
  publicBase,
  showcaseKey,
  type PendingJob,
} from './lib/showcase';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://dnngihsbqxccqvvedvjc.supabase.co';
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_oA36yEu7RVuGR2V65ZzYZA_jhOn52bN';
const TOKEN = process.env.ART_PIPELINE_TOKEN || '';
const PROJECT = process.env.SHOWCASE_PAGES_PROJECT || 'frycards-showcase';
const BASE = publicBase(PROJECT, process.env.SHOWCASE_ART_BASE_URL);
const WRANGLER = 'wrangler@3.114.0';
const DRY_RUN = process.argv.includes('--dry-run') || process.env.SHOWCASE_DRY_RUN === 'true';
/** Max cards per run: `--limit=N` or SHOWCASE_LIMIT (workflow input), 1–25. */
const LIMIT_ARG = process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1];
const LIMIT = Math.min(25, Math.max(1, Number(LIMIT_ARG ?? process.env.SHOWCASE_LIMIT) || 25));

if (!TOKEN) {
  console.log('ART_PIPELINE_TOKEN is not set — nothing to do. See docs/CARD_SUBMISSIONS.md.');
  process.exit(0);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const { data, error } = await supabase.rpc('art_pipeline_jobs', { p_token: TOKEN, p_limit: LIMIT });
if (error) {
  console.error('art_pipeline_jobs failed:', error.message);
  process.exit(1);
}
const jobs = parseJobs(data);
console.log(`${jobs.pending.length} pending, ${jobs.published.length} already published.`);
if (jobs.pending.length === 0) process.exit(0);

if (!DRY_RUN && (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID)) {
  console.log(
    'CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID are not set — leaving the queue pending.',
  );
  process.exit(0);
}

async function download(url: string): Promise<Buffer> {
  if (!/^https:\/\//i.test(url)) throw new Error('not an https link');
  const res = await fetch(url, { signal: AbortSignal.timeout(60_000), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${new URL(url).host}`);
  const len = Number(res.headers.get('content-length') || 0);
  if (len > SOURCE_LIMIT) throw new Error(`source is ${(len / 1048576).toFixed(0)} MB`);
  const body = Buffer.from(await res.arrayBuffer());
  if (body.length > SOURCE_LIMIT) throw new Error('source too large');
  return body;
}

function encodeVideo(src: Buffer, tmp: string): Buffer {
  const inp = path.join(tmp, 'in.bin');
  const out = path.join(tmp, 'out.mp4');
  fs.writeFileSync(inp, src);
  fs.rmSync(out, { force: true });
  try {
    execFileSync(
      'ffmpeg',
      [
        '-y',
        '-i',
        inp,
        '-vf',
        "scale=-2:'min(480,ih)'",
        '-c:v',
        'libx264',
        '-preset',
        'slow',
        '-crf',
        '30',
        '-pix_fmt',
        'yuv420p',
        '-an',
        '-movflags',
        '+faststart',
        out,
      ],
      { stdio: 'ignore' },
    );
    const enc = fs.readFileSync(out);
    return enc.length < src.length ? enc : src;
  } catch {
    // No ffmpeg, or it could not read the clip: ship the original if it fits.
    return src;
  }
}

const site = fs.mkdtempSync(path.join(os.tmpdir(), 'showcase-site-'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'showcase-tmp-'));
const write = (key: string, body: Buffer) => {
  const dest = path.join(site, key);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body);
};

// 3. Everything already live must be in the new deployment too.
for (const p of jobs.published) {
  const key = keyFromUrl(p.art_url, BASE);
  if (!key) continue; // published elsewhere (a manual move); not ours to re-list
  try {
    write(key, await download(p.art_url));
  } catch (e) {
    console.error(`Could not re-fetch ${p.art_url} (${(e as Error).message}).`);
    console.error('Refusing to deploy a site that would drop a live card. Nothing changed.');
    process.exit(1);
  }
}

// 2. Encode the queue.
type Result = { submission_id: string; ok: boolean; art_url?: string; error?: string };
const results: Result[] = [];
async function processJob(j: PendingJob): Promise<Result> {
  const src = await download(j.source_url);
  let key: string;
  let body: Buffer;
  if (isVideoSource(j.source_url, j.treatment)) {
    body = encodeVideo(src, tmp);
    key = showcaseKey(j.card_id, body, 'mp4');
  } else {
    body = await masterBytes(src);
    key = showcaseKey(j.card_id, body, 'webp');
  }
  if (body.length > PAGES_FILE_LIMIT) throw new Error('over the 25 MB Pages file limit');
  write(key, body);
  return { submission_id: j.submission_id, ok: true, art_url: `${BASE}/${key}` };
}
for (const j of jobs.pending) {
  try {
    const r = await processJob(j);
    console.log(`  OK   ${j.card_id} -> ${r.art_url}`);
    results.push(r);
  } catch (e) {
    console.log(`  FAIL ${j.card_id}: ${(e as Error).message}`);
    results.push({ submission_id: j.submission_id, ok: false, error: (e as Error).message });
  }
}
fs.writeFileSync(path.join(site, '_headers'), SHOWCASE_HEADERS);

if (DRY_RUN) {
  console.log(`Dry run: site built in ${site}; not deployed, nothing reported.`);
  process.exit(0);
}

// 4. Deploy (only when something new landed; failures alone need no deploy).
if (results.some((r) => r.ok)) {
  try {
    execFileSync(
      'npx',
      ['--yes', WRANGLER, 'pages', 'project', 'create', PROJECT, '--production-branch', 'main'],
      { stdio: 'ignore' },
    );
  } catch {
    /* already exists */
  }
  execFileSync(
    'npx',
    ['--yes', WRANGLER, 'pages', 'deploy', site, '--project-name', PROJECT, '--branch', 'main'],
    { stdio: 'inherit' },
  );
}

// 5. Report.
const rep = await supabase.rpc('art_pipeline_report', { p_token: TOKEN, p_results: results });
if (rep.error) {
  console.error('art_pipeline_report failed:', rep.error.message);
  process.exit(1);
}
console.log(`Reported ${rep.data} result(s).`);
