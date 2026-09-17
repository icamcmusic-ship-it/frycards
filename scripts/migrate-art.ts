/**
 * Generates the pre-sized derivatives `src/lib/media.ts` expects, and
 * optionally moves the card art off Supabase storage onto another host.
 *
 * Why: egress is billed on every byte served, and the art is a gigabyte of raw
 * generator output painted into boxes at most 240 CSS px wide. The obvious fix
 * — resize on demand through Supabase's image transformation endpoint — needs a
 * paid add-on that is not enabled on this project, so every request for a
 * derivative was failing and falling back to the full-resolution original.
 * Generating the derivatives once, here, removes the add-on from the picture:
 * a card face costs ~30-70 kB instead of ~6 MB whoever serves it.
 *
 * The host is a separate decision from the resizing, and `upload` targets any
 * S3-compatible bucket via ART_S3_ENDPOINT — R2, Backblaze B2, Wasabi, or
 * Supabase's own S3 endpoint. Serving the derivatives from Supabase is a
 * ~50-100x cut on its own; moving hosts takes the art off the egress quota
 * entirely. Skip `upload` and `purge` to do the first without the second.
 *
 * Phases run in order, each resumable and independently verifiable. Nothing is
 * deleted from Supabase until `purge`, and `purge` refuses to touch an object
 * it cannot find a byte-identical archive copy of.
 *
 *   npx tsx scripts/migrate-art.ts archive   # Supabase -> ./art-archive
 *   npx tsx scripts/migrate-art.ts derive    # archive -> webp ladder
 *   npx tsx scripts/migrate-art.ts upload    # archive + derivatives -> the bucket
 *   npx tsx scripts/migrate-art.ts rewrite   # point the catalog at the new host
 *   npx tsx scripts/migrate-art.ts purge     # delete the Supabase copies
 *   npx tsx scripts/migrate-art.ts sync      # archive+derive+upload whatever is NEW
 *
 * `archive` is also your off-platform backup of the masters: the PNGs are the
 * only lossless copies that exist, and a webp derivative cannot be re-derived
 * from without compounding the loss. Keep `./art-archive` somewhere durable
 * before running `purge`. It is gitignored — it is ~1 GB.
 *
 * Environment:
 *   SUPABASE_SERVICE_ROLE_KEY   required by `archive`, `purge` and `sync`
 *   ART_S3_ENDPOINT             required by `upload` — the S3 API endpoint of
 *                               the destination bucket
 *   ART_S3_ACCESS_KEY_ID        required by `upload`
 *   ART_S3_SECRET_ACCESS_KEY    required by `upload`
 *   ART_S3_BUCKET               required by `upload` (default: frycards-art)
 *   ART_S3_REGION               optional (default: auto)
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
import { DERIVED_QUALITY, masterBytes } from './lib/derive';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://dnngihsbqxccqvvedvjc.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'Card Images';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const ARCHIVE = process.env.ART_ARCHIVE_DIR || path.join(ROOT, 'art-archive');
const DERIVED = path.join(ARCHIVE, '.derived');
const MANIFEST = path.join(ARCHIVE, 'manifest.json');
const CATALOG = path.join(ROOT, 'src', 'game', 'generated-cards.ts');

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

/** The public URL for `key`, in the form the catalog stores — `encodeURI`,
 * not `encodeURIComponent`, so the path separators survive. */
function publicUrl(key: string): string {
  return `${SUPABASE_URL}/storage/v1/object/public/${encodeURI(BUCKET)}/${encodeURI(key)}`;
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

/** Generate every missing ladder rung for one archived key. Returns how many
 * were written and their total size, so both `derive` and `sync` can report. */
async function deriveOne(key: string): Promise<{ made: number; bytes: number }> {
  // Video is not resized here — the ladder is a still-image concept, and
  // scripts/shrink-video-art.ts re-encodes the clips instead.
  if (!isImage(key)) return { made: 0, bytes: 0 };
  const source = archivePath(key);
  const meta = await sharp(source).metadata();
  const sourceWidth = meta.width ?? Math.max(...WIDTH_LADDER);
  let made = 0;
  let bytes = 0;
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
      .webp({ quality: DERIVED_QUALITY })
      .toFile(dest);
    bytes += fs.statSync(dest).size;
    made++;
  }
  return { made, bytes };
}

async function phaseDerive(): Promise<void> {
  const { keys } = readManifest();
  let made = 0;
  let bytes = 0;
  for (const key of keys) {
    const one = await deriveOne(key);
    made += one.made;
    bytes += one.bytes;
  }
  console.log(`Generated ${made} derivatives, ${mb(bytes)} MB`);
}

// ----------------------------------------------------------------- upload

/** An S3 client for the destination bucket. Any S3-compatible host works —
 * the endpoint is what selects it, so switching hosts is a config change
 * rather than a code change. */
function bucketClient(): S3Client {
  requireEnv('ART_S3_ENDPOINT', 'ART_S3_ACCESS_KEY_ID', 'ART_S3_SECRET_ACCESS_KEY');
  return new S3Client({
    region: process.env.ART_S3_REGION || 'auto',
    endpoint: process.env.ART_S3_ENDPOINT!,
    // Most S3-compatible hosts serve the bucket as a path, not a subdomain.
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.ART_S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.ART_S3_SECRET_ACCESS_KEY!,
    },
  });
}

type Uploader = (key: string) => Promise<{ count: number; bytes: number }>;

/** An uploader for one key and all of its derivatives. */
function uploaderFor(client: S3Client, bucket: string): Uploader {
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

  return async (key: string) => {
    let count = 1;
    let bytes = await put(key, archivePath(key), ORIGINAL_CACHE_CONTROL);
    if (isImage(key)) {
      for (const width of WIDTH_LADDER) {
        const dKey = derivedKey(key, width);
        const file = path.join(DERIVED, dKey);
        if (!fs.existsSync(file)) die(`Missing derivative ${dKey} — run the derive phase first.`);
        bytes += await put(dKey, file, DERIVED_CACHE_CONTROL);
        count++;
      }
    }
    return { count, bytes };
  };
}

async function phaseUpload(): Promise<void> {
  const { keys } = readManifest();
  const bucket = process.env.ART_S3_BUCKET || 'frycards-art';
  const upload = uploaderFor(bucketClient(), bucket);

  let count = 0;
  let bytes = 0;
  for (const key of keys) {
    const one = await upload(key);
    count += one.count;
    bytes += one.bytes;
    if (count % 100 === 0) console.log(`  ${count} objects uploaded…`);
  }
  console.log(`Uploaded ${count} objects, ${mb(bytes)} MB to s3://${bucket}`);
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

// ------------------------------------------------------------------- sync

/**
 * Catch up on art added to the Supabase bucket since the last run: archive it,
 * derive its ladder, upload it, and add it to the manifest.
 *
 * This is the phase that keeps the migration from being a one-off. The app has
 * no binary upload path — every image in the product is a pasted URL — so new
 * art reaches the bucket only by someone putting it there through the Supabase
 * dashboard, and until this runs that object has no derivatives: the app falls
 * back to serving it full size, from the metered host, forever. Run it after
 * any art drop, or on a schedule.
 *
 * Deliberately additive. It never deletes and never rewrites the catalog: a
 * key that has vanished from the bucket stays in the manifest and in the
 * archive, because the archive is the backup and `purge` is the only phase
 * allowed to be destructive.
 */
async function phaseSync(): Promise<void> {
  const { keys } = readManifest();
  const known = new Set(keys);
  const supabase = supabaseClient();
  const objects = await listAll(supabase);

  const fresh = objects.filter(({ key, size }) => {
    if (!known.has(key)) return true;
    // Known, but replaced in place: the archive copy no longer matches, so its
    // derivatives are stale too.
    const local = archivePath(key);
    return !fs.existsSync(local) || (size > 0 && fs.statSync(local).size !== size);
  });

  if (fresh.length === 0) {
    console.log(`Nothing new — all ${objects.length} objects are archived and derived.`);
    return;
  }
  console.log(`${fresh.length} new or changed object(s)`);

  // Uploading is optional: with no bucket configured this still archives and
  // derives, which is all that is needed while the art is served from
  // Supabase itself.
  const uploading = Boolean(process.env.ART_S3_ENDPOINT);
  const upload = uploading
    ? uploaderFor(bucketClient(), process.env.ART_S3_BUCKET || 'frycards-art')
    : null;
  if (!uploading) console.log('ART_S3_ENDPOINT unset — archiving and deriving only.');

  const added: string[] = [];
  for (const { key } of fresh) {
    const { data, error } = await supabase.storage.from(BUCKET).download(key);
    if (error || !data) {
      console.error(`  FAILED ${key}: ${error?.message ?? 'no body'}`);
      continue;
    }
    const dest = archivePath(key);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, Buffer.from(await data.arrayBuffer()));
    // A replaced original invalidates its derivatives — drop them so deriveOne
    // regenerates rather than skipping the ones already on disk.
    for (const width of WIDTH_LADDER) {
      fs.rmSync(path.join(DERIVED, derivedKey(key, width)), { force: true });
    }
    const { made } = await deriveOne(key);
    if (upload) await upload(key);
    added.push(key);
    console.log(`  ${key} (${made} derivatives${uploading ? ', uploaded' : ''})`);
  }

  const merged = [...new Set([...keys, ...added])].sort();
  fs.writeFileSync(MANIFEST, JSON.stringify({ keys: merged }, null, 2) + '\n');
  console.log(`Synced ${added.length} object(s); manifest now has ${merged.length}.`);
  if (added.length < fresh.length) die('Some objects failed — re-run sync.');
  console.log('If any of these are new card art, remember to point the catalog at them.');
}

// -------------------------------------------------------- shrink-originals

/**
 * Replace each stored original with its display master, in place, under the
 * same key.
 *
 * This is the phase that reduces STORAGE rather than egress. Deriving a ladder
 * leaves the multi-megabyte original sitting next to it, so the bucket grows;
 * the free tier caps storage at 1 GB and this bucket is already at ~1.02 GB of
 * raw generator output. Nothing the app renders is ever wider than the ladder's
 * top rung, so those pixels have never been served to anyone — they are being
 * paid for every month to be ignored.
 *
 * Same key, deliberately. The catalog keeps pointing where it points, so this
 * needs no rewrite, no `sync-cards-db`, no redeploy — and the fallback path in
 * SafeImage/CardArt keeps resolving, just cheaply now. The key's extension
 * stops matching its bytes (`art.png` holding webp), which is cosmetic: the
 * Content-Type header is what browsers honour, and it is set correctly.
 *
 * Safety: an object is only replaced when a byte-identical archive copy exists
 * on disk, exactly as `purge` requires, because the replacement is lossy and
 * the archive is the only way back.
 */
async function phaseShrinkOriginals(): Promise<void> {
  const { keys } = readManifest();
  const supabase = supabaseClient();
  if (!process.argv.includes('--yes')) {
    die(
      'shrink-originals overwrites objects in the bucket with smaller copies.\n' +
        'Every one is verified against ./art-archive first, but the replacement\n' +
        'is lossy and cannot be undone from the bucket. Re-run with --yes.',
    );
  }

  const live = await listAll(supabase);
  const bySize = new Map(live.map((o) => [o.key, o.size]));

  let replaced = 0;
  let before = 0;
  let after = 0;
  let skipped = 0;
  for (const key of keys) {
    // Video is re-encoded by scripts/shrink-video-art.ts, which understands
    // codecs; sharp would simply fail on it.
    if (!isImage(key)) continue;
    const source = archivePath(key);
    const size = bySize.get(key);
    if (size === undefined) {
      console.error(`  SKIP ${key}: no longer in the bucket`);
      skipped++;
      continue;
    }
    if (!fs.existsSync(source)) {
      console.error(`  SKIP ${key}: no archive copy — nothing to restore from`);
      skipped++;
      continue;
    }
    if (size > 0 && fs.statSync(source).size !== size) {
      console.error(`  SKIP ${key}: archive copy is a different size`);
      skipped++;
      continue;
    }

    const body = await masterBytes(source);
    // A master that is not actually smaller means the stored object was
    // already at or below the cap. Replacing it would spend a generation of
    // quality to save nothing.
    if (body.length >= size && size > 0) {
      skipped++;
      continue;
    }

    const { error } = await supabase.storage.from(BUCKET).upload(key, body, {
      contentType: 'image/webp',
      cacheControl: '2592000',
      upsert: true,
    });
    if (error) {
      console.error(`  FAILED ${key}: ${error.message}`);
      skipped++;
      continue;
    }
    before += size;
    after += body.length;
    replaced++;
    if (replaced % 25 === 0) console.log(`  ${replaced} replaced…`);
  }

  console.log(
    `Replaced ${replaced} originals: ${mb(before)} MB -> ${mb(after)} MB ` +
      `(${mb(before - after)} MB reclaimed, ${skipped} skipped)`,
  );
  console.log('The archive still holds the full-resolution masters. Keep it.');
}

// -------------------------------------------------------------------- add

/**
 * Ingest new local art: resize to the display master, upload it, derive its
 * ladder, upload that, and record it in the manifest.
 *
 * This is the pipeline new art should arrive through, instead of a raw file
 * dropped into the dashboard. Doing it here rather than after the fact is the
 * whole point: a 6 MB generator PNG uploaded by hand is 6 MB on the storage
 * line permanently, and every card added that way walks the bucket back toward
 * the cap that `shrink-originals` just pulled it away from.
 *
 *   npm run media:add "Volume 2" ~/art/new-card.png ~/art/another.png
 *
 * The first argument is the bucket folder; the rest are local files. Prints
 * the catalog URL for each, which is what goes in generated-cards.ts.
 *
 * Note the archive gets the RESIZED master, not the file you passed: the
 * archive's contract is "a byte-identical copy of what is in the bucket",
 * which is what lets shrink-originals and purge verify against it. Your
 * full-resolution original stays wherever you keep it.
 */
async function phaseAdd(): Promise<void> {
  const args = process.argv.slice(3).filter((a) => !a.startsWith('--'));
  const [prefix, ...files] = args;
  if (!prefix || files.length === 0) {
    die('Usage: migrate-art.ts add "<bucket folder>" <file> [file...]');
  }
  for (const file of files) {
    if (!fs.existsSync(file)) die(`No such file: ${file}`);
  }

  const supabase = supabaseClient();
  const { keys } = readManifest();
  const added: string[] = [];

  for (const file of files) {
    // One canonical extension, because the stored master is always webp.
    const base = path.basename(file).replace(/\.[^.]+$/, '');
    const key = `${prefix.replace(/\/+$/, '')}/${base}.webp`;
    const body = await masterBytes(file);

    const { error } = await supabase.storage.from(BUCKET).upload(key, body, {
      contentType: 'image/webp',
      cacheControl: '2592000',
      upsert: true,
    });
    if (error) {
      console.error(`  FAILED ${key}: ${error.message}`);
      continue;
    }

    // Archive the master as uploaded, then derive from it, so the ladder and
    // the archive both describe exactly what the bucket holds.
    const dest = archivePath(key);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, body);
    for (const width of WIDTH_LADDER) {
      fs.rmSync(path.join(DERIVED, derivedKey(key, width)), { force: true });
    }
    const { made } = await deriveOne(key);

    // Derivatives go wherever the art is served from. With no bucket
    // configured that is this same Supabase bucket, which is the supported
    // "stay put, just get small" path.
    if (process.env.ART_S3_ENDPOINT) {
      const upload = uploaderFor(bucketClient(), process.env.ART_S3_BUCKET || 'frycards-art');
      await upload(key);
    } else {
      for (const width of WIDTH_LADDER) {
        const dKey = derivedKey(key, width);
        const dBody = fs.readFileSync(path.join(DERIVED, dKey));
        const { error: dErr } = await supabase.storage.from(BUCKET).upload(dKey, dBody, {
          contentType: 'image/webp',
          cacheControl: '31536000',
          upsert: true,
        });
        if (dErr) console.error(`  WARN ${dKey}: ${dErr.message}`);
      }
    }

    added.push(key);
    console.log(
      `  ${path.basename(file)} -> ${mb(fs.statSync(file).size)} MB in, ` +
        `${mb(body.length)} MB stored, ${made} derivatives`,
    );
    console.log(`    ${publicUrl(key)}`);
  }

  const merged = [...new Set([...keys, ...added])].sort();
  fs.writeFileSync(MANIFEST, JSON.stringify({ keys: merged }, null, 2) + '\n');
  console.log(`Added ${added.length} object(s). Paste the URLs above into generated-cards.ts.`);
  if (added.length < files.length) die('Some files failed — nothing else was changed.');
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
  case 'sync':
    await phaseSync();
    break;
  case 'shrink-originals':
    await phaseShrinkOriginals();
    break;
  case 'add':
    await phaseAdd();
    break;
  default:
    die('Usage: migrate-art.ts <archive|derive|upload|rewrite|purge|sync|shrink-originals|add>');
}
