/**
 * One-off analysis: cast-cost-format distribution across the live pool
 * (loaded the same way simulate-live.ts does), broken out overall and per
 * set, to report on how the v4.3 cost vocabulary (exact/sum/pattern gates)
 * actually landed once real card data replaced the bundled fallback.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyCardPool, POOL_V4 } from '../src/game/v3/cardpool';
import { CardTemplate } from '../src/types';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templates: CardTemplate[] = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'live-cards.json'), 'utf8'),
);
applyCardPool(templates);

function costKind(def: (typeof POOL_V4)[number]): string {
  if (def.type === 'Location') return 'free (Location)';
  if (def.comboGate) return `gate:${def.comboGate}`;
  if (def.castCostKind === 'exact') return 'exact';
  if (def.castCostKind === 'sum') return 'sum';
  if (def.threshold !== undefined) return 'atLeast (legacy/Twin)';
  return 'none (Leader)';
}

function report(cards: typeof POOL_V4, label: string) {
  console.log(`\n=== ${label} (${cards.length} cards) ===`);
  const counts: Record<string, number> = {};
  for (const c of cards) {
    if (c.type === 'Leader') continue;
    const k = costKind(c);
    counts[k] = (counts[k] || 0) + 1;
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  for (const [k, n] of Object.entries(counts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(24)} ${String(n).padStart(4)}  (${((100 * n) / total).toFixed(1)}%)`);
  }
  // sum-cost target distribution
  const sums = cards.filter((c) => c.castCostKind === 'sum').map((c) => c.threshold!);
  if (sums.length) {
    console.log(
      `  sum targets: min=${Math.min(...sums)} max=${Math.max(...sums)} avg=${(sums.reduce((a, b) => a + b, 0) / sums.length).toFixed(1)}`,
    );
  }
  const exacts = cards.filter((c) => c.castCostKind === 'exact').map((c) => c.threshold!);
  if (exacts.length) {
    const hist: Record<number, number> = {};
    for (const v of exacts) hist[v] = (hist[v] || 0) + 1;
    console.log(`  exact value histogram: ${JSON.stringify(hist)}`);
  }
}

report(POOL_V4, 'ENTIRE LIVE POOL');
for (const setName of [...new Set(POOL_V4.map((c) => c.set))]) {
  report(
    POOL_V4.filter((c) => c.set === setName),
    setName || '(no set)',
  );
}
