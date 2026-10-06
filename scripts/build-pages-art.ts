/**
 * Builds a folder of card art ready to deploy to Cloudflare Pages, from the
 * art you already have on disk, and then points the catalog at it.
 *
 * Why Pages: it is free with no card on file, has no bandwidth cap, and allows
 * 20,000 files of up to 25 MB each. The resized art is ~1,700 files and
 * ~150 MB, so it takes the card art off Supabase's storage and egress quotas
 * entirely. See "Moving to Cloudflare Pages" in docs/ART_MIGRATION.md.
 *
 *   # 1. build ./art-pages from your local copy of the bucket
 *   npm run art:pages -- build ~/path/to/your/art
 *
 *   # 2. deploy it (first run asks you to log in to Cloudflare in a browser)
 *   npx wrangler pages deploy art-pages --project-name frycards-art --branch main
 *
 *   # 3. point the catalog at the deployed site, then commit
 *   npm run art:pages -- rewrite https://frycards-art.pages.dev
 *
 * `build` finds each catalog image in your folder by its bucket path, or by
 * file name if your folders are laid out differently. It writes a display
 * master (webp, at most 1200px wide) plus the full derivative ladder
 * `src/lib/media.ts` asks for, and lists any card it could not find. Those
 * cards keep their Supabase URL after `rewrite`, so nothing breaks, and you can
 * re-run both steps once you have found the files.
 *
 * Keys are made URL-safe on the way: the bucket has folder names with spaces
 * and full-art file names with colons and commas, which are awkward on Windows
 * and in Pages uploads. The mapping is written to art-pages/mapping.json and is
 * what `rewrite` applies.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WIDTH_LADDER, derivedKey } from '../src/lib/media';
import { derivedBytes, masterBytes } from './lib/derive';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const OUT = process.env.ART_PAGES_DIR || path.join(ROOT, 'art-pages');
const MAPPING = path.join(OUT, 'mapping.json');
const CATALOG = path.join(ROOT, 'src', 'game', 'generated-cards.ts');
const SUPABASE_BASE =
  'https://dnngihsbqxccqvvedvjc.supabase.co/storage/v1/object/public/Card%20Images/';
/** Cloudflare Pages refuses any single file over 25 MiB. */
const PAGES_FILE_LIMIT = 25 * 1024 * 1024;

const IMAGE_RE = /\.(png|webp|jpe?g)$/i;
const MEDIA_RE = /\.(png|webp|jpe?g|mp4|webm|mov)$/i;

function die(msg: string): never {
  console.error(msg);
  process.exit(1);
}

/** Lowercase, and every run of anything but letters, digits, dot and dash
 * becomes one underscore — so "Volume 1 full arts/Astral Shoal:They do…" and a
 * Windows copy saved as "Astral Shoal_They do…" compare equal. */
function normalize(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^a-z0-9.\-/]+/g, '_')
    .replace(/_+/g, '_');
}

/** Letters and digits only, extension dropped: survives a download that
 * dropped or swapped punctuation such as '?' or ':' in the file name. */
function loose(s: string): string {
  return stripExt(s)
    .normalize('NFC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function stripExt(s: string): string {
  return s.replace(/\.[a-z0-9]+$/i, '');
}

/** The URL-safe key a bucket key is published under. Images become .webp,
 * because that is what the master is; video keeps its container. Long
 * generator names are trimmed so no path segment passes 120 characters. */
export function safeKey(key: string): string {
  const parts = key.split('/').map((seg) =>
    seg
      .normalize('NFC')
      .replace(/[^A-Za-z0-9.-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, ''),
  );
  let file = parts.pop() || 'art';
  const ext = IMAGE_RE.test(file) ? '.webp' : (file.match(/\.[A-Za-z0-9]+$/)?.[0] ?? '');
  let stem = stripExt(file);
  if (stem.length > 120) stem = stem.slice(0, 120);
  file = `${stem}${ext.toLowerCase()}`;
  return [...parts, file].join('/');
}

/** Every distinct Supabase art URL in the catalog, with its decoded key. */
function catalogUrls(): { url: string; key: string }[] {
  const text = fs.readFileSync(CATALOG, 'utf8');
  const seen = new Map<string, string>();
  const re =
    /"(https:\/\/dnngihsbqxccqvvedvjc\.supabase\.co\/storage\/v1\/object\/public\/Card%20Images\/[^"]+)"/g;
  for (const m of text.matchAll(re)) {
    const url = m[1];
    if (seen.has(url)) continue;
    const raw = url.slice(SUPABASE_BASE.length).split('?')[0];
    let key = raw;
    try {
      key = decodeURIComponent(raw);
    } catch {
      // Leave a malformed escape as-is; matching falls back to the file name.
    }
    seen.set(url, key);
  }
  return [...seen].map(([url, key]) => ({ url, key }));
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (MEDIA_RE.test(entry.name)) out.push(full);
  }
  return out;
}

/** Index the local folder by relative path, by file name, and by file name
 * without extension, each normalised. A name that appears more than once is
 * ambiguous and only matched by its full path. */
function indexLocal(dir: string) {
  const byPath = new Map<string, string>();
  const byName = new Map<string, string[]>();
  const byStem = new Map<string, string[]>();
  const byLoose = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, k: string, v: string) =>
    m.set(k, [...(m.get(k) ?? []), v]);
  for (const file of walk(dir)) {
    const rel = path.relative(dir, file).split(path.sep).join('/');
    byPath.set(normalize(rel), file);
    const name = normalize(path.basename(file));
    add(byName, name, file);
    add(byStem, stripExt(name), file);
    add(byLoose, loose(path.basename(file)), file);
  }
  return { byPath, byName, byStem, byLoose };
}

function findLocal(key: string, idx: ReturnType<typeof indexLocal>): string | null {
  const exact = idx.byPath.get(normalize(key));
  if (exact) return exact;
  const name = normalize(key.split('/').pop() || key);
  const named = idx.byName.get(name);
  if (named?.length === 1) return named[0];
  const stemmed = idx.byStem.get(stripExt(name));
  if (stemmed?.length === 1) return stemmed[0];
  // The bucket's "_result.webp" files are often saved locally without the
  // suffix, or as the generator's PNG.
  const bare = idx.byStem.get(stripExt(name).replace(/_result$/, ''));
  if (bare?.length === 1) return bare[0];
  const fuzzy = idx.byLoose.get(loose(key.split('/').pop() || key));
  if (fuzzy?.length === 1) return fuzzy[0];
  return null;
}

function writeFile(rel: string, body: Buffer): number {
  const dest = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, body);
  return body.length;
}

const HEADERS = `# Written by scripts/build-pages-art.ts.
# Derivatives never change under their name; a replaced card gets a new name.
/derived/*
  Cache-Control: public, max-age=31536000, immutable
  Access-Control-Allow-Origin: *

/*
  Cache-Control: public, max-age=2592000
  Access-Control-Allow-Origin: *
`;

async function build(srcDir: string | undefined): Promise<void> {
  if (!srcDir) die('Usage: npm run art:pages -- build <folder with your art>');
  const src = path.resolve(srcDir.replace(/^~(?=\/|$)/, process.env.HOME || '~'));
  if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) die(`Not a folder: ${src}`);

  const entries = catalogUrls();
  if (entries.length === 0) die('The catalog has no Supabase art URLs left — nothing to build.');
  const idx = indexLocal(src);
  console.log(
    `${entries.length} art URLs in the catalog, ${idx.byPath.size} media files in ${src}`,
  );

  fs.mkdirSync(OUT, { recursive: true });
  const mapping: Record<string, string> = {};
  const owners = new Map<string, string>();
  const missing: string[] = [];
  const tooBig: string[] = [];
  let files = 0;
  let bytes = 0;

  for (const [i, { url, key }] of entries.entries()) {
    const local = findLocal(key, idx);
    if (!local) {
      missing.push(key);
      continue;
    }
    const target = safeKey(key);
    const clash = owners.get(target);
    if (clash && clash !== key) die(`Two cards would publish to ${target}:\n  ${clash}\n  ${key}`);
    owners.set(target, key);

    if (IMAGE_RE.test(local)) {
      bytes += writeFile(target, await masterBytes(local));
      files++;
      for (const width of WIDTH_LADDER) {
        bytes += writeFile(derivedKey(target, width), await derivedBytes(local, width));
        files++;
      }
    } else {
      const size = fs.statSync(local).size;
      if (size > PAGES_FILE_LIMIT) {
        tooBig.push(`${key} (${(size / 1048576).toFixed(1)} MB)`);
        continue;
      }
      bytes += writeFile(target, fs.readFileSync(local));
      files++;
    }
    mapping[url] = target;
    if ((i + 1) % 25 === 0) console.log(`  ${i + 1}/${entries.length}…`);
  }

  fs.writeFileSync(path.join(OUT, '_headers'), HEADERS);
  fs.writeFileSync(MAPPING, `${JSON.stringify(mapping, null, 2)}\n`);

  console.log(
    `\nBuilt ${Object.keys(mapping).length}/${entries.length} cards: ${files} files, ` +
      `${(bytes / 1048576).toFixed(1)} MB in ${path.relative(ROOT, OUT) || OUT}`,
  );
  if (files > 19000) console.warn('WARNING: Pages allows 20,000 files per deploy.');
  if (tooBig.length) {
    console.warn(`\n${tooBig.length} video(s) are over Pages' 25 MB limit and were skipped:`);
    for (const t of tooBig) console.warn(`  ${t}`);
    console.warn('Shrink them first (npm run media:shrink-video) and build again.');
  }
  if (missing.length) {
    console.warn(`\n${missing.length} card(s) not found in your folder (they stay on Supabase):`);
    for (const m of missing) console.warn(`  ${m}`);
  }
  console.log(
    '\nNext:\n  npx wrangler pages deploy art-pages --project-name frycards-art --branch main\n' +
      '  npm run art:pages -- rewrite https://<your-project>.pages.dev',
  );
}

function rewrite(baseArg: string | undefined): void {
  if (!baseArg || !/^https:\/\//.test(baseArg)) {
    die('Usage: npm run art:pages -- rewrite https://<your-project>.pages.dev');
  }
  if (!fs.existsSync(MAPPING)) die(`No ${MAPPING} — run the build step first.`);
  const base = baseArg.replace(/\/+$/, '');
  const mapping: Record<string, string> = JSON.parse(fs.readFileSync(MAPPING, 'utf8'));
  let text = fs.readFileSync(CATALOG, 'utf8');
  let count = 0;
  for (const [from, key] of Object.entries(mapping)) {
    const to = `${base}/${encodeURI(key)}`;
    const parts = text.split(`"${from}"`);
    count += parts.length - 1;
    text = parts.join(`"${to}"`);
  }
  fs.writeFileSync(CATALOG, text);
  const left = catalogUrls().length;
  console.log(`Rewrote ${count} catalog URLs onto ${base}; ${left} still point at Supabase.`);
  console.log(
    `\nNext: set the GitHub Actions variable ART_BASE_URL to ${base}, commit, and push.` +
      '\nThen, once Supabase answers again: npx tsx scripts/sync-cards-db.ts > cards-sync.sql and apply it.',
  );
}

const [phase, arg] = process.argv.slice(2);
if (phase === 'build') await build(arg);
else if (phase === 'rewrite') rewrite(arg);
else die('Usage: npm run art:pages -- build <folder> | rewrite <https://base>');
