/**
 * Cross-cohort aggregator — the sign table, mechanized.
 *
 * v22 carry-forward #3 retired `|gap| >= 10` as a gate (it fires on ~24% of
 * all readings) and named the discriminating statistic instead: a pinned-vs-
 * random gap that is ONE-SIGNED across every cohort that samples the Leader.
 * The sim report cannot compute that — it is single-run — so v22 assembled the
 * sign table by hand and said so: "either the sim gains a cross-run mode or
 * the sign table gets assembled by hand each pass." This is the cross-run
 * mode.
 *
 * It also aggregates the pinned suite's per-deck split across cohorts, which
 * is what actually resolved the v22 Ruin-Walker item: a single recipe roll
 * (deck #1) reading 12-19% in EVERY cohort is a persistent lemon dragging the
 * 9-deck mean, not a kit reading — and no single run can tell a lemon from a
 * bad night. A deck is flagged when its cross-cohort mean sits 15+ points
 * under its Leader's cross-cohort deck median.
 *
 * Usage: pass the report JSONs of one pass's cohorts, in cohort order:
 *
 *   npx tsx scripts/aggregate-cohorts.ts docs/sim-runs/v5-<A>.json docs/sim-runs/v5-<B>.json ...
 *
 * Exits 0 always — this is a reading instrument, not a gate.
 */
import { readFileSync } from 'node:fs';

interface SuiteRow {
  id: string;
  name: string;
  winPct: number;
  games: number;
  byDeck: number[];
  deckMedian: number;
}
interface RandomRow {
  name: string;
  winPct: number;
  games: number;
}
interface Report {
  leaderPairSuiteSummary: SuiteRow[];
  randomDeckLeaderDiagnostic: Record<string, RandomRow>;
}

const paths = process.argv.slice(2);
if (paths.length < 2) {
  console.error('Pass at least two cohort report JSONs (docs/sim-runs/v5-*.json).');
  process.exit(1);
}
const cohorts: Report[] = paths.map((p) => JSON.parse(readFileSync(p, 'utf8')));
const labels = cohorts.map((_, i) => String.fromCharCode(65 + i));

const leaderIds = cohorts[0].leaderPairSuiteSummary.map((r) => r.id);
const nameOf: Record<string, string> = {};
for (const r of cohorts[0].leaderPairSuiteSummary) nameOf[r.id] = r.name;

const fmt = (v: number | null, w = 6) =>
  (v === null ? '—' : (v > 0 ? '+' : '') + v.toFixed(1)).padStart(w);

console.log(`Cohorts: ${labels.join(' ')} (${paths.length} reports)\n`);

// ---- pinned means and medians ------------------------------------------
console.log('PINNED suite across cohorts (winPct per cohort | cross-cohort mean | median-of-deck-medians):');
const pinnedMean: Record<string, number> = {};
for (const lid of leaderIds) {
  const wps = cohorts.map(
    (c) => c.leaderPairSuiteSummary.find((r) => r.id === lid)?.winPct ?? NaN,
  );
  const meds = cohorts.map(
    (c) => c.leaderPairSuiteSummary.find((r) => r.id === lid)?.deckMedian ?? NaN,
  );
  pinnedMean[lid] = wps.reduce((a, b) => a + b, 0) / wps.length;
  const medMean = meds.reduce((a, b) => a + b, 0) / meds.length;
  console.log(
    `  ${nameOf[lid].padEnd(28)} ${wps.map((w) => w.toFixed(1).padStart(5)).join(' ')}  mean ${pinnedMean[lid].toFixed(1).padStart(5)}  med ${medMean.toFixed(1).padStart(5)}`,
  );
}

// ---- the sign table -----------------------------------------------------
console.log('\nPinned-minus-random GAP per cohort (— = that cohort\'s random arm never rolled the Leader):');
for (const lid of leaderIds) {
  const gaps: (number | null)[] = cohorts.map((c) => {
    const p = c.leaderPairSuiteSummary.find((r) => r.id === lid);
    const rand = c.randomDeckLeaderDiagnostic[lid];
    if (!p || !rand || rand.games === 0) return null;
    return p.winPct - rand.winPct;
  });
  const vals = gaps.filter((g): g is number => g !== null);
  const mean = vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length);
  const oneSigned =
    vals.length >= 2 && (vals.every((g) => g > 0) || vals.every((g) => g < 0));
  console.log(
    `  ${nameOf[lid].padEnd(28)} ${gaps.map((g) => fmt(g)).join(' ')}  mean ${fmt(mean)}` +
      (oneSigned ? '   << ONE-SIGNED across every sampling cohort' : ''),
  );
}

// ---- persistent-lemon decks --------------------------------------------
console.log('\nPer-deck cross-cohort means (a deck 15+ points under its Leader\'s deck median is flagged):');
for (const lid of leaderIds) {
  const rows = cohorts.map((c) => c.leaderPairSuiteSummary.find((r) => r.id === lid));
  const deckCount = rows[0]?.byDeck.length ?? 0;
  const deckMeans = Array.from({ length: deckCount }, (_, k) => {
    const vs = rows.map((r) => r?.byDeck[k] ?? NaN);
    return vs.reduce((a, b) => a + b, 0) / vs.length;
  });
  const sorted = [...deckMeans].sort((a, b) => a - b);
  const median =
    sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2;
  const flagged = deckMeans
    .map((m, k) => ({ m, k }))
    .filter(({ m }) => median - m >= 15);
  console.log(
    `  ${nameOf[lid].padEnd(28)} [${deckMeans.map((m) => m.toFixed(1)).join(' / ')}]  median ${median.toFixed(1)}` +
      (flagged.length
        ? `   << LEMON deck${flagged.length > 1 ? 's' : ''} ${flagged.map(({ m, k }) => `#${k} (${m.toFixed(1)}%)`).join(', ')}`
        : ''),
  );
}
