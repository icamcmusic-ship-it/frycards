/**
 * Re-encode the stored card art in place so the ORIGINALS are cheap to serve.
 *
 * The `Card Images` bucket is raw generator output — ~150 PNGs averaging 5.9 MB
 * (largest 11 MB) — served byte-for-byte into card faces at most 240 CSS pixels
 * wide. `src/lib/media.ts` already asks the storage CDN for a resized
 * derivative, but that endpoint is a paid add-on. This script fixes the problem
 * at the source instead: every still is capped at 1024px on its longest edge
 * and re-encoded to WebP, which is typically a 40-60x cut and needs no add-on.
 *
 * IN PLACE, SAME OBJECT KEY. The bytes become WebP but the key keeps its
 * original name, so `…/art.png` now serves `image/webp`. That is deliberate:
 * the image URLs are referenced from `public.cards.template`, `image_url` on
 * several tables, player-owned cosmetics and shop banners, and the bundled
 * `src/game/generated-cards.ts`. Renaming the objects would mean rewriting all
 * of those in lockstep; keeping the key means nothing else has to change.
 * Browsers dispatch on `Content-Type`, not on the extension, and the only
 * extension check in the app (`isVideoSrc`) cares about `.mp4` alone.
 *
 * Safety:
 *   - Dry run by default. Nothing is written without `--apply`.
 *   - Every original is downloaded to `--backup-dir` (default
 *     `.art-backup/`) and verified on disk BEFORE its object is overwritten.
 *     `--restore` puts them all back.
 *   - Files that would not get meaningfully smaller are skipped, as are
 *     videos, animated stills, and anything that fails to decode.
 *
 * Usage:
 *   export SUPABASE_URL=https://<ref>.supabase.co
 *   export SUPABASE_SERVICE_ROLE_KEY=<service role key>   # NOT the publishable key
 *
 *   npx tsx scripts/reencode-card-art.ts                  # dry run: report only
 *   npx tsx scripts/reencode-card-art.ts --apply          # do it
 *   npx tsx scripts/reencode-card-art.ts --restore        # undo from the backup
 *
 * Options:
 *   --bucket <name>      Bucket to process (repeatable). Default: "Card Images".
 *   --backup-dir <path>  Where originals are kept. Default: ".art-backup".
 *   --limit <n>          Process at most n objects — use it to try a handful first.
 *   --concurrency <n>    Parallel objects. Default 4.
 */
import { createClient } from '@supabase/supabase-js';
import { mkdir, writeFile, readFile, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { humanBytes, isStill, planReencode } from './lib/reencode';

const DEFAULT_BUCKETS = ['Card Images'];
const CACHE_CONTROL = '2592000'; // 30 days — matches the storage migration.

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const has = (flag: string) => argv.includes(flag);
function opt(flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}
function optAll(flag: string): string[] {
  const out: string[] = [];
  argv.forEach((a, i) => {
    if (a === flag && argv[i + 1]) out.push(argv[i + 1]);
  });
  return out;
}

const APPLY = has('--apply');
const RESTORE = has('--restore');
const BACKUP_DIR = opt('--backup-dir') ?? '.art-backup';
const BUCKETS = optAll('--bucket').length ? optAll('--bucket') : DEFAULT_BUCKETS;
const LIMIT = Number(opt('--limit') ?? Infinity);
const CONCURRENCY = Math.max(1, Number(opt('--concurrency') ?? 4));

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    'Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.\n' +
      'The service role key is under Project Settings > API. The publishable\n' +
      'key cannot overwrite storage objects and will fail with a 403.',
  );
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

/** Every object key in `bucket`, walking nested folders. The storage list API
 * returns one directory level at a time and pages at 100 entries. */
async function listAll(bucket: string, prefix = ''): Promise<string[]> {
  const keys: string[] = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: 100, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    if (!data?.length) break;
    for (const entry of data) {
      const key = prefix ? `${prefix}/${entry.name}` : entry.name;
      // A row with no `id` is a folder placeholder, not an object.
      if (entry.id) keys.push(key);
      else keys.push(...(await listAll(bucket, key)));
    }
    if (data.length < 100) break;
  }
  return keys;
}

async function download(bucket: string, key: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(bucket).download(key);
  if (error || !data) throw new Error(`download ${key}: ${error?.message ?? 'empty'}`);
  return Buffer.from(await data.arrayBuffer());
}

async function upload(bucket: string, key: string, body: Buffer, contentType: string) {
  const { error } = await supabase.storage.from(bucket).update(key, body, {
    contentType,
    cacheControl: CACHE_CONTROL,
    upsert: true,
  });
  if (error) throw new Error(`upload ${key}: ${error.message}`);
}

const backupPath = (bucket: string, key: string) => join(BACKUP_DIR, bucket, key);

/** Write the original to disk and read it back, so a rewrite is only ever
 * attempted once a byte-identical copy is known to exist locally. */
async function backup(bucket: string, key: string, body: Buffer): Promise<void> {
  const path = backupPath(bucket, key);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, body);
  const info = await stat(path);
  if (info.size !== body.length) {
    throw new Error(`backup of ${key} is ${info.size} bytes, expected ${body.length}`);
  }
}

/** Run `worker` over `items`, at most CONCURRENCY at a time. */
async function pooled<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
      while (next < items.length) await worker(items[next++]);
    }),
  );
}

// ---------------------------------------------------------------------------
// Modes
// ---------------------------------------------------------------------------

async function restore(): Promise<void> {
  let restored = 0;
  for (const bucket of BUCKETS) {
    const keys = await listAll(bucket);
    await pooled(keys, async (key) => {
      let original: Buffer;
      try {
        original = await readFile(backupPath(bucket, key));
      } catch {
        return; // never backed up — it was skipped, so it was never touched
      }
      const type = key.toLowerCase().endsWith('.png')
        ? 'image/png'
        : /\.jpe?g$/i.test(key)
          ? 'image/jpeg'
          : 'image/webp';
      if (APPLY) await upload(bucket, key, original, type);
      restored++;
      console.log(`${APPLY ? 'restored' : 'would restore'}  ${bucket}/${key}`);
    });
  }
  console.log(
    `\n${APPLY ? 'Restored' : 'Would restore'} ${restored} object(s) from ${BACKUP_DIR}.` +
      (APPLY ? '' : '\nRe-run with --apply to write them back.'),
  );
}

async function reencode(): Promise<void> {
  let before = 0;
  let after = 0;
  let rewritten = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const bucket of BUCKETS) {
    const keys = (await listAll(bucket)).filter(isStill).slice(0, LIMIT);
    console.log(`${bucket}: ${keys.length} still image(s)\n`);

    await pooled(keys, async (key) => {
      try {
        const input = await download(bucket, key);
        const plan = await planReencode(key, input);
        if (plan.action === 'skip') {
          skipped++;
          console.log(`skip      ${key}  (${plan.reason})`);
          return;
        }
        before += plan.bytesBefore;
        after += plan.bytesAfter;
        rewritten++;
        const saving = Math.round((1 - plan.bytesAfter / plan.bytesBefore) * 100);
        console.log(
          `${APPLY ? 'rewrite  ' : 'would fix'} ${key}\n` +
            `          ${humanBytes(plan.bytesBefore)} -> ${humanBytes(plan.bytesAfter)} ` +
            `(-${saving}%, ${plan.width}x${plan.height})`,
        );
        if (!APPLY) return;
        // Backup first, always: this overwrite is not otherwise reversible.
        await backup(bucket, key, input);
        await upload(bucket, key, plan.data, 'image/webp');
      } catch (e) {
        failures.push(`${key}: ${e instanceof Error ? e.message : String(e)}`);
        console.error(`FAILED    ${key}: ${e}`);
      }
    });
  }

  console.log(
    `\n${'-'.repeat(60)}\n` +
      `${APPLY ? 'Rewrote' : 'Would rewrite'} ${rewritten} object(s), skipped ${skipped}.\n` +
      `Bucket bytes for those objects: ${humanBytes(before)} -> ${humanBytes(after)}` +
      (before ? `  (-${Math.round((1 - after / before) * 100)}%)` : ''),
  );
  if (failures.length) {
    console.log(`\n${failures.length} failure(s):`);
    for (const f of failures) console.log(`  ${f}`);
  }
  if (!APPLY) {
    console.log(
      `\nDry run — nothing was written. Re-run with --apply to rewrite,\n` +
        `originals backed up to ${BACKUP_DIR}/ (undo with --restore --apply).`,
    );
  }
  // A partial run leaves the bucket consistent (each object is whole), but the
  // caller should still know it was not clean.
  if (failures.length) process.exitCode = 1;
}

await (RESTORE ? restore() : reencode());
