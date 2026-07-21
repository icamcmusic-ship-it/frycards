/**
 * Diffs the two most recent docs/sim-runs/v4-*.json balance-pass results and
 * flags anything that moved more than a threshold — a lightweight automated
 * regression check so a balance pass doesn't require manually re-reading the
 * whole console transcript to notice what changed since last time.
 *
 * Usage: npx tsx scripts/diff-sim-runs.ts [minDeltaPts=2]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const runsDir = path.join(__dirname, '..', 'docs', 'sim-runs');
const minDelta = Number(process.argv[2] ?? 2);

const files = fs
  .readdirSync(runsDir)
  .filter((f) => f.startsWith('v4-') && f.endsWith('.json'))
  .sort();
if (files.length < 2) {
  console.error(`Need at least 2 runs in ${runsDir}, found ${files.length}.`);
  process.exit(1);
}
const prevFile = files[files.length - 2];
const curFile = files[files.length - 1];
console.log(`Comparing ${prevFile} -> ${curFile} (min |delta| = ${minDelta}pt)\n`);

const prev = JSON.parse(fs.readFileSync(path.join(runsDir, prevFile), 'utf8'));
const cur = JSON.parse(fs.readFileSync(path.join(runsDir, curFile), 'utf8'));

function indexBy<T extends { name: string }>(rows: T[] | undefined): Map<string, T> {
  return new Map((rows ?? []).map((r) => [r.name, r]));
}

function diffNumericRows(
  label: string,
  prevRows: any[] | undefined,
  curRows: any[] | undefined,
  key: string,
  nKey?: string,
  minN = 0,
) {
  const p = indexBy(prevRows);
  const c = indexBy(curRows);
  const rows: { name: string; prevV: number; curV: number; delta: number }[] = [];
  for (const [name, cr] of c) {
    const pr = p.get(name);
    if (!pr) continue;
    if (nKey && ((cr as any)[nKey] < minN || (pr as any)[nKey] < minN)) continue;
    const prevV = (pr as any)[key];
    const curV = (cr as any)[key];
    if (typeof prevV !== 'number' || typeof curV !== 'number') continue;
    const delta = curV - prevV;
    if (Math.abs(delta) >= minDelta) rows.push({ name, prevV, curV, delta });
  }
  rows.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  console.log(`--- ${label} (${rows.length} moved >= ${minDelta}) ---`);
  for (const r of rows.slice(0, 25)) {
    console.log(
      `  ${r.name.padEnd(28)} ${r.prevV.toFixed(2)} -> ${r.curV.toFixed(2)}  (${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(2)})`,
    );
  }
  if (!rows.length) console.log('  (nothing moved beyond threshold)');
  console.log();
}

diffNumericRows('Card archetype-normalized residual', prev.cardArchNormalized, cur.cardArchNormalized, 'residual', 'n', 100);
diffNumericRows('Cost-efficiency z-score', prev.costEfficiency, cur.costEfficiency, 'z');
diffNumericRows('Keyword cost/value delta', prev.keywordCostValue, cur.keywordCostValue, 'delta', 'castIn', 50);

// Leader / archetype win-rate deltas come from the raw result blob.
function pctMap(w: Record<string, number>, n: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const k of Object.keys(n)) out[k] = n[k] ? (100 * (w[k] || 0)) / n[k] : NaN;
  return out;
}
function diffPctMap(label: string, prevW: any, prevN: any, curW: any, curN: any) {
  const p = pctMap(prevW ?? {}, prevN ?? {});
  const c = pctMap(curW ?? {}, curN ?? {});
  const rows = Object.keys(c)
    .filter((k) => k in p && !isNaN(p[k]) && !isNaN(c[k]))
    .map((k) => ({ name: k, prevV: p[k], curV: c[k], delta: c[k] - p[k] }))
    .filter((r) => Math.abs(r.delta) >= minDelta)
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  console.log(`--- ${label} (${rows.length} moved >= ${minDelta}pt) ---`);
  for (const r of rows.slice(0, 25)) {
    console.log(
      `  ${r.name.padEnd(28)} ${r.prevV.toFixed(1)}% -> ${r.curV.toFixed(1)}%  (${r.delta >= 0 ? '+' : ''}${r.delta.toFixed(1)}pt)`,
    );
  }
  if (!rows.length) console.log('  (nothing moved beyond threshold)');
  console.log();
}
diffPctMap('Archetype win rate', prev.result?.archW, prev.result?.archN, cur.result?.archW, cur.result?.archN);
diffPctMap('Leader win rate', prev.result?.leaderW, prev.result?.leaderN, cur.result?.leaderW, cur.result?.leaderN);

// Per-archetype lapse rate (new in this pass) — only diffable once two runs
// with the field exist.
if (prev.lapsePerGameByArch && cur.lapsePerGameByArch) {
  diffNumericRows(
    'CPU lapse rate per archetype',
    prev.lapsePerGameByArch.map((r: any) => ({ name: r.arch, ...r })),
    cur.lapsePerGameByArch.map((r: any) => ({ name: r.arch, ...r })),
    'perGame',
    'games',
    100,
  );
}
