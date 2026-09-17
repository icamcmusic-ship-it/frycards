/**
 * Re-encodes the mp4 card art in the `Card Images` bucket and rewrites the
 * catalog to point at the smaller copies.
 *
 * Video is the one media path the egress work in `src/lib/media.ts` cannot
 * touch: Supabase's image transformation endpoint handles stills only, so a
 * Full-Art card ships its mp4 byte-for-byte no matter what box it renders
 * into. There are only eight of them, but at the time of writing they total
 * ~43 MB — more than every one of the 289 transformed card thumbnails
 * combined — and two of them (10.7 MB and 8.9 MB) are half of that on their
 * own. `VisibleVideo` already refuses to fetch them until the card is on
 * screen; this is about what a fetch costs once it does happen.
 *
 * The encode targets the box the art actually plays in. A card face is at
 * most 240 CSS pixels wide, so 480p is already 2x oversampled; CRF 30 at that
 * height is visually clean on art this small, and the audio track is dropped
 * outright because every call site mounts the video `muted`. Expect ~300-600
 * kB per clip — roughly a 10x cut.
 *
 * Deliberately NON-DESTRUCTIVE. Shrunk clips upload to a new key (`<name>
 * .min.mp4`) and the originals are left in place:
 *
 * - The catalog rewrite and the upload are separate failure domains. If the
 *   rewrite is half-applied, or a client is running a cached bundle that
 *   still names the old key, the old key still resolves.
 * - The originals are the only masters. Re-encoding from a CRF 30 derivative
 *   later would compound the loss.
 *
 * Once the rewrite has shipped and you are satisfied, the originals can be
 * deleted from the dashboard to reclaim the storage line (they are ~43 MB;
 * this does not affect egress, which is already off them at that point).
 *
 * Requires ffmpeg on PATH and a Supabase S3 access key pair (see
 * scripts/lib/storage.ts — storage-scoped, NOT the service-role key).
 *
 *   npx tsx scripts/shrink-video-art.ts --dry-run
 *   npx tsx scripts/shrink-video-art.ts
 *
 * In CI this runs from .github/workflows/art-pipeline.yml, where ffmpeg is
 * already on the runner.
 *
 * `--dry-run` downloads and encodes into a temp dir and reports the byte
 * savings without uploading or touching any source file.
 *
 * After a real run, apply the catalog change to the live `cards` table the
 * way every other catalog change is applied:
 *
 *   npx tsx scripts/sync-cards-db.ts > cards-sync.sql
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getObject, listAll, publicUrl, putObject, ORIGINAL_CACHE_CONTROL } from './lib/storage';

const DRY_RUN = process.argv.includes('--dry-run');

/** Encode height in pixels. Card art plays into a box at most 240 CSS px
 * wide, so 480p is still 2x oversampled on a retina phone. */
const HEIGHT = 480;
/** x264 quality. 30 is a long way down from the generator's output and holds
 * up at this scale; raise it if a specific clip shows banding. */
const CRF = 30;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CATALOG = path.join(__dirname, '..', 'src', 'game', 'generated-cards.ts');

function requireFfmpeg(): void {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
  } catch {
    console.error('ffmpeg is not on PATH. Install it (brew install ffmpeg) and re-run.');
    process.exit(1);
  }
}

function shrunkKey(key: string): string {
  return key.replace(/\.(mp4|webm|mov)$/i, '.min.mp4');
}

requireFfmpeg();

/** Every video object in the bucket. */
async function listVideos(): Promise<string[]> {
  return (await listAll()).map((o) => o.key).filter((k) => /\.(mp4|webm|mov)$/i.test(k));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'frycards-video-'));
const videos = await listVideos();
if (videos.length === 0) {
  console.error('Found no video objects in the bucket — nothing to do.');
  process.exit(1);
}
console.log(`${videos.length} video objects${DRY_RUN ? ' (dry run)' : ''}\n`);

let before = 0;
let after = 0;
const rewrites = new Map<string, string>();

for (const key of videos) {
  if (/\.min\.mp4$/i.test(key)) continue; // already shrunk by an earlier run
  const source = path.join(tmp, 'in.mp4');
  const target = path.join(tmp, 'out.mp4');
  try {
    fs.writeFileSync(source, await getObject(key));
  } catch (err) {
    console.error(`  SKIP ${key}: download failed (${(err as Error).message})`);
    continue;
  }
  fs.rmSync(target, { force: true });

  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-i',
      source,
      // Never upscale a clip that is already below the target height, and
      // keep the width even — x264 rejects odd dimensions.
      '-vf',
      `scale=-2:'min(${HEIGHT},ih)'`,
      '-c:v',
      'libx264',
      '-preset',
      'slow',
      '-crf',
      String(CRF),
      '-pix_fmt',
      'yuv420p',
      // Every call site mounts these muted, so the audio track is pure cost.
      '-an',
      // Move the moov atom to the front: without it a browser must fetch to
      // the end of the file before it can start playing, which defeats the
      // point of streaming a smaller file.
      '-movflags',
      '+faststart',
      target,
    ],
    { stdio: 'ignore' },
  );

  const sizeIn = fs.statSync(source).size;
  const sizeOut = fs.statSync(target).size;
  const mb = (n: number) => (n / 1048576).toFixed(1);
  // A clip that does not actually get smaller is left alone: re-pointing the
  // catalog at it would cost a generation of quality for nothing.
  if (sizeOut >= sizeIn) {
    console.log(`  KEEP ${key} — re-encode is not smaller (${mb(sizeIn)} → ${mb(sizeOut)} MB)`);
    continue;
  }
  before += sizeIn;
  after += sizeOut;
  const dest = shrunkKey(key);
  console.log(`  ${mb(sizeIn)} → ${mb(sizeOut)} MB  ${dest}`);

  if (!DRY_RUN) {
    try {
      // Match the 30 days the 20260907000000 migration set on every other
      // object; a fresh upload otherwise lands on the 1-hour default and
      // quietly reintroduces the repeat-download problem that migration fixed.
      await putObject(dest, fs.readFileSync(target), 'video/mp4', ORIGINAL_CACHE_CONTROL);
    } catch (err) {
      const msg = (err as Error).message;
      console.error(`  UPLOAD FAILED ${dest}: ${msg} — catalog left pointing at original`);
      continue;
    }
  }
  rewrites.set(publicUrl(key), publicUrl(dest));
}

const mb = (n: number) => (n / 1048576).toFixed(1);
console.log(`\nTotal: ${mb(before)} → ${mb(after)} MB across ${rewrites.size} clips`);

if (DRY_RUN) {
  console.log('Dry run — nothing uploaded and the catalog was not touched.');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(0);
}

// Rewrite the bundled catalog. Only URLs whose upload actually succeeded are
// in `rewrites`, so a partial run leaves the rest pointing at originals that
// still resolve.
let catalog = fs.readFileSync(CATALOG, 'utf8');
let rewritten = 0;
for (const [from, to] of rewrites) {
  if (!catalog.includes(from)) {
    console.error(`  NOTE no catalog entry for ${from} — uploaded, but nothing references it`);
    continue;
  }
  catalog = catalog.split(from).join(to);
  rewritten++;
}
fs.writeFileSync(CATALOG, catalog);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(`Rewrote ${rewritten} catalog entries in ${path.relative(process.cwd(), CATALOG)}`);
console.log('Next: npx tsx scripts/sync-cards-db.ts > cards-sync.sql, then apply it.');
