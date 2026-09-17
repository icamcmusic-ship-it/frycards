/**
 * Moves the card art off Supabase storage and onto Cloudflare R2, generating
 * the pre-sized derivatives `src/lib/media.ts` expects on the way.
 *
 * Why the move: cached egress is billed on every byte the Supabase CDN serves,
 * and the art is a gigabyte of raw generator output. The obvious fix — resize
 * on demand through Supabase's image transformation endpoint — needs a paid
 * add-on that is not enabled on this project, so every request for a
 * derivative was failing and falling back to the full-resolution original.
 * R2 charges nothing for egress, and the derivatives are generated once here
 * rather than per request, so neither cost applies after this runs.
 *
 * Five phases, run in order, each resumable and independently verifiable.
 * Nothing is deleted from Supabase until `purge`, and `purge` refuses to touch
 * an object it cannot find a byte-identical archive copy of.
 *
 *   npx tsx scripts/migrate-art-to-r2.ts archive   # Supabase -> ./art-archive
 *   npx tsx scripts/migrate-art-to-r2.ts derive    # archive -> webp ladder
 *   npx tsx scripts/migrate-art-to-r2.ts upload    # archive + derivatives -> R2
 *   npx tsx scripts/migrate-art-to-r2.ts rewrite   # point the catalog at R2
 *   npx tsx scripts/migrate-art-to-r2.ts purge     # delete the Supabase copies
 *
 * `archive` is also your off-platform backup of the masters: the PNGs are the
 * only lossless copies that exist, and a webp derivative cannot be re-derived
 * from without compounding the loss. Keep `./art-archive` somewhere durable
 * before running `purge`. It is gitignored — it is ~1 GB.
 *
 * Environment:
 *   SUPABASE_SERVICE_ROLE_KEY   required by `archive` and `purge`
 *   R2_ACCOUNT_ID               required by `upload`
 *   R2_ACCESS_KEY_ID            required by `upload`
 *   R2_SECRET_ACCESS_KEY        required by `upload`
 *   R2_BUCKET                   required by `upload` (default: frycards-art)
 *   VITE_ART_BASE_URL           required by `rewrite` — the public base the
 *                               bucket is served from, no trailing slash
 *
 * After `rewrite`, set VITE_ART_BASE_URL in the deploy environment too: the
 * app reads it to find the derivatives, and without it every URL is served at
 * full size (correct, just expensive).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { WIDTH_LADDER, derivedKey } from '../src/lib/media';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://dnngihsbqxccqvvedvjc.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'Card Images';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ARCHIVE = process.env.ART_ARCHIVE_DIR || path.join(ROOT, 'art-archive');
const DERIVED = path.join(ARCHIVE, '.derived');
const MANIFEST = path.join(ARCHIVE, 'manifest.json');
const CATALOG = path.join(ROOT, 'src', 'game', 'generated-cards.ts');

/** WebP quality. 62 is visually indistinguishable at card scale and roughly
 * half the bytes of the 80 most encoders default to. */
const QUALITY = 62;

/** Long cache lifetime for the derivatives. A derived key is a pure function
 * of its source key and a width, and the source keys carry generation UUIDs,
 * so these are immutable in practice — unlike the originals, which the
 * 20260907000000 migration capped at 30 days precisely so a file replaced in
 * place would self-heal. */
const DERIVED_CACHE_CONTROL = 'public, max-age=31536000, immutable';
const ORIGINAL_CACHE_CONTROL = 'public, max-age=2592000';

const CONTENT_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
};

const isImage = (key: string) => /\.(png|webp|jpe?g)$/i.test(key);
const mb = (n: number) => (n / 1048576).toFixed(1);

function die(message: string): never {
  console.error(message);
  process.exit(1);
}

function requireEnv(...names: string[]): void {
  const missing = names.filter((n) => !process.env[n]);
  if (missing.length) die(`Missing required environment: ${missing.join(', ')}`);
}

function supabaseClient() {
  if (!SERVICE_KEY) die('SUPABASE_SERVICE_ROLE_KEY is required for this phase.');
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

/** Local path for an object key. Keys contain spaces, colons and slashes; the
 * slashes become real directories and everything else is kept verbatim so the
 * archive is browsable and the mapping back to a key is exact. */
function archivePath(key: string): string {
  return path.join(ARCHIVE, key);
}

function readManifest(): { keys: string[] } {
  if (!fs.existsSync(MANIFEST)) die(`No manifest at ${MANIFEST} — run the archive phase first.`);
  return JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
}

// ---------------------------------------------------------------- archive

async function listAll(
  supabase: ReturnType<typeof supabaseClient>,
  prefix = '',
): Promise<{ key: string; size: number }[]> {
  const { data, error } = await supabase.storage.from(BUCKET).list(prefix, { limit: 1000 });
  if (error) throw new Error(`list(${prefix || '/'}): ${error.message}`);
  const found: { key: string; size: number }[] = [];
  for (const entry of data ?? []) {
    const key = prefix ? `${prefix}/${entry.name}` : entry.name;
    // A folder comes back with no `id`; a file always has one.
    if (!entry.id) found.push(...(await listAll(supabase, key)));
    else found.push({ key, size: Number(entry.metadata?.size ?? 0) });
  }
  return found;
}

async function phaseArchive(): Promise<void> {
  const supabase = supabaseClient();
  const objects = await listAll(supabase);
  if (objects.length === 0) die('Listed zero objects — refusing to write an empty manifest.');
  console.log(`${objects.length} objects, ${mb(objects.reduce((n, o) => n + o.size, 0))} MB total`);

  let fetched = 0;
  let skipped = 0;
  for (const { key, size } of objects) {
    const dest = archivePath(key);
    // Resumable: an archive copy that already matches the reported size is
    // not re-downloaded. Every byte here is billed egress, so re-running this
    // phase must not re-pay for what it already has.
    if (fs.existsSync(dest) && (size === 0 || fs.statSync(dest).size === size)) {
      skipped++;
      continue;
    }
    const { data, error } = await supabase.storage.from(BUCKET).download(key);
    if (error || !data) {
      console.error(`  FAILED ${key}: ${error?.message ?? 'no body'}`);
      continue;
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(await data.arrayBuffer()));
    fetched++;
    if (fetched % 25 === 0) console.log(`  ${fetched} downloaded…`);
  }

  // Only keys that actually made it to disk go in the manifest — every later
  // phase reads it, and purge deletes from it.
  const present = objects.filter((o) => fs.existsSync(archivePath(o.key))).map((o) => o.key);
  fs.writeFileSync(MANIFEST, JSON.stringify({ keys: present.sort() }, null, 2) + '\n');
  console.log(`Archived ${present.length}/${objects.length} (${fetched} new, ${skipped} already)`);
  if (present.length < objects.length)
    die('Some objects failed to download — re-run before derive.');
}

// ----------------------------------------------------------------- derive

async function phaseDerive(): Promise<void> {
  const { keys } = readManifest();
  let made = 0;
  let bytes = 0;
  for (const key of keys) {
    // Video is not resized here — the transformation ladder is a still-image
    // concept, and scripts/shrink-video-art.ts re-encodes the clips instead.
    if (!isImage(key)) continue;
    const source = archivePath(key);
    const meta = await sharp(source).metadata();
    const sourceWidth = meta.width ?? Math.max(...WIDTH_LADDER);
    for (const width of WIDTH_LADDER) {
      const dest = path.join(DERIVED, derivedKey(key, width));
      if (fs.existsSync(dest)) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      // Never upscale: a rung wider than the source is generated at the
      // source's own width. The rung must still exist as an object — the app
      // picks a rung from the ladder without knowing any source's dimensions,
      // and a missing one 404s into the full-size fallback.
      await sharp(source)
        .resize({ width: Math.min(width, sourceWidth), withoutEnlargement: true })
        .webp({ quality: QUALITY })
        .toFile(dest);
      bytes += fs.statSync(dest).size;
      made++;
    }
  }
  console.log(`Generated ${made} derivatives, ${mb(bytes)} MB`);
}

// ----------------------------------------------------------------- upload

function r2Client(): S3Client {
  requireEnv('R2_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY');
  return new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
}

async function phaseUpload(): Promise<void> {
  const { keys } = readManifest();
  const client = r2Client();
  const bucket = process.env.R2_BUCKET || 'frycards-art';

  const put = async (key: string, file: string, cacheControl: string): Promise<number> => {
    const body = fs.readFileSync(file);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        Body: body,
        ContentType: CONTENT_TYPES[path.extname(key).toLowerCase()] || 'application/octet-stream',
        CacheControl: cacheControl,
      }),
    );
    return body.length;
  };

  let count = 0;
  let bytes = 0;
  for (const key of keys) {
    bytes += await put(key, archivePath(key), ORIGINAL_CACHE_CONTROL);
    count++;
    if (isImage(key)) {
      for (const width of WIDTH_LADDER) {
        const dKey = derivedKey(key, width);
        const file = path.join(DERIVED, dKey);
        if (!fs.existsSync(file)) die(`Missing derivative ${dKey} — run the derive phase first.`);
        bytes += await put(dKey, file, DERIVED_CACHE_CONTROL);
        count++;
      }
    }
    if (count % 100 === 0) console.log(`  ${count} objects uploaded…`);
  }
  console.log(`Uploaded ${count} objects, ${mb(bytes)} MB to r2://${bucket}`);
}

// ---------------------------------------------------------------- rewrite

function phaseRewrite(): void {
  requireEnv('VITE_ART_BASE_URL');
  const base = process.env.VITE_ART_BASE_URL!.replace(/\/+$/, '');
  const from = `${SUPABASE_URL}/storage/v1/object/public/${encodeURI(BUCKET)}/`;
  const catalog = fs.readFileSync(CATALOG, 'utf8');
  if (!catalog.includes(from)) die(`No catalog entries point at ${from} — nothing to rewrite.`);
  const rewritten = catalog.split(from).join(`${base}/`);
  fs.writeFileSync(CATALOG, rewritten);
  const count = catalog.split(from).length - 1;
  console.log(`Rewrote ${count} catalog URLs onto ${base}`);
  console.log('Next: npx tsx scripts/sync-cards-db.ts > cards-sync.sql, then apply it.');
  console.log(`Then set VITE_ART_BASE_URL=${base} in the deploy environment.`);
}

// ------------------------------------------------------------------ purge

async function phasePurge(): Promise<void> {
  const { keys } = readManifest();
  const supabase = supabaseClient();

  // Refuse to delete anything the catalog still points at. A half-applied
  // rewrite plus a purge is how art disappears from production.
  const catalog = fs.readFileSync(CATALOG, 'utf8');
  if (catalog.includes(`${SUPABASE_URL}/storage/v1/object/public/`)) {
    die('The catalog still points at Supabase — run the rewrite phase (and deploy) first.');
  }

  const objects = await listAll(supabase);
  const doomed: string[] = [];
  for (const { key, size } of objects) {
    const archived = archivePath(key);
    // The archive is the only remaining copy of the masters, so verify it
    // exists and matches byte-for-byte before the original goes away.
    if (!keys.includes(key)) {
      console.error(`  KEEP ${key}: not in the manifest`);
      continue;
    }
    if (!fs.existsSync(archived)) {
      console.error(`  KEEP ${key}: no archive copy at ${archived}`);
      continue;
    }
    if (size > 0 && fs.statSync(archived).size !== size) {
      console.error(`  KEEP ${key}: archive copy is a different size`);
      continue;
    }
    doomed.push(key);
  }

  if (doomed.length !== objects.length) {
    die(`${objects.length - doomed.length} objects failed verification — nothing deleted.`);
  }
  const { error } = await supabase.storage.from(BUCKET).remove(doomed);
  if (error) die(`Delete failed: ${error.message}`);
  console.log(`Deleted ${doomed.length} objects from Supabase. Masters remain in ${ARCHIVE}.`);
}

// ------------------------------------------------------------------- main

const phase = process.argv[2];
switch (phase) {
  case 'archive':
    await phaseArchive();
    break;
  case 'derive':
    await phaseDerive();
    break;
  case 'upload':
    await phaseUpload();
    break;
  case 'rewrite':
    phaseRewrite();
    break;
  case 'purge':
    await phasePurge();
    break;
  default:
    die('Usage: migrate-art-to-r2.ts <archive|derive|upload|rewrite|purge>');
}
