/**
 * Build-time ink choice for text printed over still card art.
 *
 * For every pool card, load its art, crop it the way a full-bleed face
 * covers it (240×336), darken it by the Full-Art scrim, and measure the
 * luminance under each text region (see FA_REGIONS / MC_REGIONS in
 * src/components/artInk.ts). Then pick the ink per region: the design's ink
 * when it clears WCAG 4.5:1, otherwise the better of light and dark.
 *
 * Writes two checked-in files:
 *  - src/components/artInk.generated.ts: only the cards whose ink differs
 *    from the design default (the map ships in the eager bundle, so it stays
 *    a few hundred bytes);
 *  - scripts/art-ink.report.json: every card's measured contrast, read by
 *    `npm run audit:cardface` to report text that still falls short.
 *
 * Art that cannot be loaded keeps its previous entry, so a partial run never
 * wipes the map. Videos (Mythic) are measured from one frame via ffmpeg, as
 * the static fallback for the live sampler (useVideoInk).
 *
 *   npm run art:ink                       # fetch from the art host
 *   npm run art:ink -- --art-dir ~/art    # a local mirror (by URL path)
 *   npm run art:ink -- --check            # exit 1 if the map is stale
 *   npm run art:ink -- --art id=path.webp # measure one card from a file
 *
 * The art host is Cloudflare Pages (no Supabase egress); the 160 px
 * derivative is fetched where one exists.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import sharp from 'sharp';
import { POOL } from '../src/game/poker/cardpool';
import { cardColors } from '../src/game/poker/colors';
import { derivedKey, isVideoSrc } from '../src/lib/media';
import {
  FA_ACCENT,
  FA_DEFAULT,
  FA_REGIONS,
  MC_HALO_ALPHA,
  MC_REGIONS,
  MIN_CONTRAST,
  chooseInk,
  encodeFaInk,
  faSkyAlpha,
  regionStats,
  type FaRegion,
  type Ink,
} from '../src/components/artInk';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT_TS = path.join(ROOT, 'src/components/artInk.generated.ts');
const OUT_REPORT = path.join(ROOT, 'scripts/art-ink.report.json');
const ART_BASE = (process.env.ART_BASE_URL ?? 'https://frycards-art.pages.dev').replace(/\/$/, '');
/** Sample grid: the face's 240×336 at a quarter, plenty for region means. */
const W = 60;
const H = 84;

interface RegionResult {
  ink: Ink;
  ratio: number;
}
export interface CardReport {
  name: RegionResult;
  tag: RegionResult;
  quote: RegionResult;
  /** Mythic only: the static title ink for the collapsed lower-third. */
  mc?: RegionResult;
}
export interface Report {
  minContrast: number;
  cards: Record<string, CardReport>;
}

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const check = args.includes('--check');
const artDir = flag('--art-dir')?.replace(/^~(?=\/|$)/, os.homedir());
const outTs = flag('--out') ?? OUT_TS;
const outReport = flag('--report') ?? OUT_REPORT;
const overrides = new Map<string, string>();
args.forEach((a, i) => {
  if (args[i - 1] === '--art' && a.includes('=')) {
    const [id, file] = a.split('=');
    overrides.set(id, file);
  }
});

async function fetchBuf(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

/** One frame (at 1 s, or the first) of a video, as PNG. */
function videoFrame(src: string): Buffer | null {
  for (const at of ['1', '0']) {
    try {
      const out = execFileSync(
        'ffmpeg',
        [
          '-v',
          'error',
          '-ss',
          at,
          '-i',
          src,
          '-frames:v',
          '1',
          '-f',
          'image2pipe',
          '-vcodec',
          'png',
          '-',
        ],
        { maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'], timeout: 60_000 },
      );
      if (out.length) return out;
    } catch {
      // try the next position, then give up
    }
  }
  return null;
}

/** The card's art as a still image buffer, or null when it can't be had. */
async function loadArt(id: string, url: string): Promise<Buffer | null> {
  const local = overrides.get(id) ?? (artDir ? localPath(url) : undefined);
  if (local) {
    if (!fs.existsSync(local)) return null;
    return isVideoSrc(local) ? videoFrame(local) : fs.readFileSync(local);
  }
  if (isVideoSrc(url)) return videoFrame(url);
  if (url.startsWith(`${ART_BASE}/`)) {
    const key = url.slice(ART_BASE.length + 1).split('?')[0];
    const small = await fetchBuf(`${ART_BASE}/${derivedKey(key, 160)}`);
    if (small) return small;
  }
  return fetchBuf(url);
}

function localPath(url: string): string | undefined {
  if (!artDir) return undefined;
  try {
    return path.join(artDir, decodeURIComponent(new URL(url).pathname));
  } catch {
    return undefined;
  }
}

/** Measure one card's art. */
async function measure(img: Buffer, accent: string, video: boolean): Promise<CardReport> {
  const { data } = await sharp(img)
    .resize(W, H, { fit: 'cover', position: 'centre' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pick = (k: FaRegion) => {
    const stats = regionStats(data, W, H, FA_REGIONS[k], faSkyAlpha, 3);
    const c = chooseInk(stats, accent, FA_DEFAULT[k]);
    return { ink: c.ink, ratio: round(c.ratio) };
  };
  const report: CardReport = { name: pick('name'), tag: pick('tag'), quote: pick('quote') };
  if (video) {
    const stats = regionStats(data, W, H, MC_REGIONS.title, () => MC_HALO_ALPHA.tucked, 3);
    const c = chooseInk(stats, '#ffffff', 'light');
    report.mc = { ink: c.ink, ratio: round(c.ratio) };
  }
  return report;
}

const round = (n: number) => Math.round(n * 100) / 100;

function readReport(): Report {
  try {
    return JSON.parse(fs.readFileSync(OUT_REPORT, 'utf8')) as Report;
  } catch {
    return { minContrast: MIN_CONTRAST, cards: {} };
  }
}

function renderTs(report: Report): string {
  const fa: string[] = [];
  const mc: string[] = [];
  for (const id of Object.keys(report.cards).sort()) {
    const r = report.cards[id];
    const code = encodeFaInk({ name: r.name.ink, tag: r.tag.ink, quote: r.quote.ink });
    if (code !== encodeFaInk(FA_DEFAULT)) fa.push(`  ${id}: '${code}',`);
    if (r.mc?.ink === 'dark') mc.push(`  ${id}: 'dark',`);
  }
  return `// Generated by scripts/art-ink.ts (npm run art:ink). Do not edit.
// Full-Art inks per card id, one letter per region (name, tag, quote:
// l = light, d = dark, a = accent). Only cards that differ from the design
// default ('${encodeFaInk(FA_DEFAULT)}') are listed.
export const FA_INK: Record<string, string> = {
${fa.join('\n')}${fa.length ? '\n' : ''}};

// Mythic static title ink (the live sampler's fallback); light unless listed.
export const MC_INK: Record<string, 'dark'> = {
${mc.join('\n')}${mc.length ? '\n' : ''}};
`;
}

async function main(): Promise<void> {
  const prev = readReport();
  const report: Report = { minContrast: MIN_CONTRAST, cards: { ...prev.cards } };
  const missing: string[] = [];
  let measured = 0;
  const queue = POOL.filter((c) => c.image);
  const work = async () => {
    for (let c = queue.shift(); c; c = queue.shift()) {
      const img = await loadArt(c.id, c.image!);
      if (!img) {
        missing.push(c.id);
        continue;
      }
      const accent = FA_ACCENT[cardColors(c)[0]] ?? FA_ACCENT.Void;
      try {
        report.cards[c.id] = await measure(img, accent, isVideoSrc(c.image!));
        measured++;
      } catch {
        missing.push(c.id);
      }
    }
  };
  await Promise.all(Array.from({ length: 6 }, work));
  // Drop cards that left the pool.
  const ids = new Set(POOL.map((c) => c.id));
  for (const id of Object.keys(report.cards)) if (!ids.has(id)) delete report.cards[id];
  const sorted: Report = {
    minContrast: MIN_CONTRAST,
    cards: Object.fromEntries(Object.entries(report.cards).sort(([a], [b]) => a.localeCompare(b))),
  };
  const ts = renderTs(sorted);
  const json = JSON.stringify(sorted, null, 2) + '\n';

  console.log(`Measured ${measured} of ${POOL.length} cards' art.`);
  if (missing.length)
    console.log(
      `Could not load art for ${missing.length} (kept their previous entries): ` +
        missing.slice(0, 8).join(', ') +
        (missing.length > 8 ? ', …' : ''),
    );
  if (check) {
    const stale = fs.existsSync(OUT_TS) && fs.readFileSync(OUT_TS, 'utf8') !== ts;
    if (stale) {
      console.error('artInk.generated.ts is stale: run npm run art:ink and commit it.');
      process.exit(1);
    }
    console.log('artInk.generated.ts is up to date.');
    return;
  }
  fs.writeFileSync(outTs, ts);
  fs.writeFileSync(outReport, json);
  console.log(`Wrote ${path.relative(ROOT, outTs)} and ${path.relative(ROOT, outReport)}.`);
}

await main();
