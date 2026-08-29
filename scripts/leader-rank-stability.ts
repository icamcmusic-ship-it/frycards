/**
 * Leader rank stability across independent DRAWS of the pinned deck-space.
 *
 * v28 added `PINNED_RECIPE_SALT` and used it once, to re-roll the pinned
 * suite's recipes #1..#8 and ask whether a per-Leader reading was a property
 * of the kit or of the nine decks the kit was dealt. The answer was that the
 * ranking does not survive a re-roll (Spearman rho = 0.417 between the two
 * draws at 47,616 games each), and the pass wrote a standing rule out of it:
 *
 *   "A per-Leader claim is not a measurement until it holds across at least
 *    two independent draws of PINNED_RECIPE_SALT. Two draws, always, for
 *    anything about a Leader."
 *
 * That rule shipped with no instrument. The rho was computed by hand from two
 * tables that were themselves assembled by hand from sixteen reports — which
 * is the exact situation `aggregate-cohorts.ts` was written to end for the
 * sign table ("either the sim gains a cross-run mode or the table gets
 * assembled by hand each pass"), one axis over. A rule that costs an hour of
 * spreadsheet work to apply is a rule that gets applied when somebody
 * remembers it.
 *
 * So: this takes N draws, each being one pass's worth of cohort reports, and
 * prints the cross-cohort Leader mean per draw, the rank each Leader takes in
 * each draw, every pairwise Spearman rho, and — the number the rule actually
 * needs — each Leader's rank RANGE across the draws. A claim about a Leader
 * is quotable exactly when that Leader's range is small; nothing else on the
 * table is, however clean its own draw looked.
 *
 * Usage — draws separated by `--`, cohorts within a draw in cohort order:
 *
 *   npx tsx scripts/leader-rank-stability.ts \
 *     docs/sim-runs/<A..H of draw 1> -- \
 *     docs/sim-runs/<A..H of draw 2> -- \
 *     docs/sim-runs/<A..H of draw 3>
 *
 * Each draw is labelled by the `meta.pinnedRecipeSalt` its reports carry (all
 * reports in a draw must agree — a mixed draw is a mistake worth refusing
 * rather than averaging, because the whole point is that one draw is one draw).
 *
 * ---------------------------------------------------------------------------
 * v33 — the design of a draw matters as much as the number of them, and the
 * instrument was not checking it.
 *
 * v29 ran a three-draw triangle and measured rho = 0.417 / 0.733 / 0.450
 * (mean 0.53), then concluded that the pinned suite's Leader ranking barely
 * survives a recipe re-roll and that everything except the extremes is "a
 * reading of the decks". A three-draw triangle run PAIRED — the same four
 * game seeds (1337/4242/9001/777) in every draw, so the ONLY thing that
 * changes between draws is the recipe salt — measures rho = 0.933 / 0.850 /
 * 0.817, mean 0.87.
 *
 * That is not luck, it is the experiment. The question this file exists to
 * ask is "does the ranking survive a RECIPE re-roll". An unpaired triangle
 * varies the recipe salt AND the game RNG at once, so its rho is a joint
 * measure of both variances and under-states recipe stability by however much
 * game-RNG noise happens to be in the cohorts. Holding the seeds fixed
 * cancels that term and leaves the question actually being asked.
 *
 * So the instrument now READS the seeds off the reports and says which design
 * it was handed. An unpaired rho is still printed — it is a real number about
 * a real pair of draws — but it is labelled, because quoting it as a recipe
 * stability figure is the mistake v29 made and nothing on the old output
 * would have caught it. (Per the standing rule: a harness that cannot measure
 * something must say so where it would have printed the measurement.)
 *
 * Exits 0 always — a reading instrument, not a gate.
 */
import { readFileSync } from 'node:fs';

interface SuiteRow {
  id: string;
  name: string;
  winPct: number;
}
interface Report {
  meta?: { pinnedRecipeSalt?: string; seed?: number; deckSeed?: number };
  leaderPairSuiteSummary: SuiteRow[];
}

const argv = process.argv.slice(2);
if (argv.length === 0) {
  console.error(
    'Usage: leader-rank-stability.ts <draw1 reports...> -- <draw2 reports...> [-- <draw3 ...>]',
  );
  process.exit(2);
}

/** Split the argv on `--` into one file list per draw. */
const groups: string[][] = [[]];
for (const a of argv) {
  if (a === '--') groups.push([]);
  else groups[groups.length - 1].push(a);
}
const draws = groups.filter((g) => g.length > 0);
if (draws.length < 2) {
  console.error('Need at least TWO draws — one draw is the thing this exists to distrust.');
  process.exit(2);
}

interface Draw {
  label: string;
  cohorts: number;
  /** Leader name -> cross-cohort mean winPct. */
  mean: Map<string, number>;
  /** Leader name -> rank, 1 = highest mean. */
  rank: Map<string, number>;
  /**
   * v33: the cohort game seeds this draw was built from, sorted and joined.
   * Two draws with the SAME signature differ only in their recipe salt, which
   * is the paired design this file wants; two draws with different signatures
   * vary the game RNG as well, and their rho measures both variances at once.
   * `deckSig` is the same for `deckSeed` — a draw that also re-rolls the
   * random arm's decks is doubly unpaired.
   */
  seedSig: string;
  deckSig: string;
}

const readDraw = (files: string[], idx: number): Draw => {
  const reports = files.map((f) => JSON.parse(readFileSync(f, 'utf8')) as Report);
  const salts = new Set(reports.map((r) => r.meta?.pinnedRecipeSalt ?? ''));
  if (salts.size > 1) {
    console.error(
      `Draw ${idx + 1} mixes recipe salts (${[...salts]
        .map((s) => s || '(unsalted)')
        .join(', ')}) — that is two draws, not one.`,
    );
    process.exit(2);
  }
  const salt = [...salts][0] ?? '';
  const sums = new Map<string, { total: number; n: number }>();
  for (const r of reports) {
    for (const row of r.leaderPairSuiteSummary ?? []) {
      const acc = sums.get(row.name) ?? { total: 0, n: 0 };
      acc.total += row.winPct;
      acc.n += 1;
      sums.set(row.name, acc);
    }
  }
  const mean = new Map<string, number>();
  for (const [name, acc] of sums) mean.set(name, acc.total / acc.n);
  const ordered = [...mean.entries()].sort((a, b) => b[1] - a[1]);
  const rank = new Map<string, number>();
  ordered.forEach(([name], i) => rank.set(name, i + 1));
  const sig = (vals: (number | undefined)[]) =>
    vals
      .map((v) => (v === undefined ? '?' : String(v)))
      .sort()
      .join(',');
  return {
    label: salt ? `salt:${salt}` : '(unsalted)',
    cohorts: reports.length,
    mean,
    rank,
    seedSig: sig(reports.map((r) => r.meta?.seed)),
    deckSig: sig(reports.map((r) => r.meta?.deckSeed)),
  };
};

const parsed = draws.map(readDraw);

/**
 * Spearman's rho between two rankings of the same Leaders.
 *
 * The ranks here are dense and distinct by construction (they come from
 * sorting distinct means), so the simple 1 - 6*sum(d^2)/(n^3-n) form is exact
 * and no tie correction is needed. If a future report ever produces a genuine
 * tie the means would have to be equal to the decimal, and the ordering would
 * be arbitrary either way — which is worth knowing rather than smoothing, so
 * the tie is left to fall wherever the sort puts it.
 */
function spearman(a: Map<string, number>, b: Map<string, number>): number {
  const names = [...a.keys()].filter((n) => b.has(n));
  const n = names.length;
  if (n < 2) return NaN;
  let d2 = 0;
  for (const name of names) {
    const d = (a.get(name) as number) - (b.get(name) as number);
    d2 += d * d;
  }
  return 1 - (6 * d2) / (n * (n * n - 1));
}

// Every Leader any draw saw, ordered by the FIRST draw's ranking so the table
// reads against the ordering a single-draw pass would have quoted.
const allNames = [...parsed[0].mean.keys()].sort(
  (x, y) => (parsed[0].rank.get(x) ?? 99) - (parsed[0].rank.get(y) ?? 99),
);
for (const d of parsed) for (const n of d.mean.keys()) if (!allNames.includes(n)) allNames.push(n);

const pad = (s: string, n: number) => s.padEnd(n);
const num = (v: number | undefined, n = 5) =>
  v === undefined ? '  —  ' : v.toFixed(1).padStart(n);

console.log(
  `\n${parsed.length} draw(s): ${parsed.map((d) => `${d.label} (${d.cohorts} cohorts)`).join(', ')}`,
);

console.log('\nCross-cohort pinned mean, and the rank it takes, per draw:');
console.log(
  `  ${pad('Leader', 30)}${parsed.map((d, i) => pad(`draw ${i + 1}`, 14)).join('')}${pad('rank range', 12)}`,
);
const ranges = new Map<string, number>();
for (const name of allNames) {
  const cells = parsed.map((d) => {
    const m = d.mean.get(name);
    const r = d.rank.get(name);
    return pad(`${num(m)} (#${r ?? '—'})`, 14);
  });
  const ranks = parsed.map((d) => d.rank.get(name)).filter((r): r is number => r !== undefined);
  const range = ranks.length > 1 ? Math.max(...ranks) - Math.min(...ranks) : 0;
  ranges.set(name, range);
  const flag = range === 0 ? '' : range <= 1 ? '' : range <= 3 ? '   << moves' : '   << MOVES FAR';
  console.log(`  ${pad(name, 30)}${cells.join('')}${pad(String(range), 12)}${flag}`);
}

// v33: which experiment was this? A pair of draws sharing a game-seed
// signature differs only in its recipe salt, and its rho is a clean reading of
// recipe stability. A pair that does not varies the game RNG too, and its rho
// is a joint measure that under-states recipe stability. Say which, next to
// the number, rather than leaving the reader to assume the good case.
const pairedWith = (i: number, j: number): boolean =>
  parsed[i].seedSig === parsed[j].seedSig && parsed[i].deckSig === parsed[j].deckSig;
const allPaired = parsed.every((_, i) => i === 0 || pairedWith(0, i));
const anyUnknown = parsed.some((d) => d.seedSig.includes('?'));

console.log('\nDraw design (v33):');
for (const [i, d] of parsed.entries())
  console.log(`  draw ${i + 1} (${d.label}): game seeds [${d.seedSig}], deck seeds [${d.deckSig}]`);
if (anyUnknown)
  console.log(
    '  ! At least one report predates the seed being written to meta, so the\n' +
      '    design cannot be determined. Treat every rho below as UNPAIRED.',
  );
console.log(
  allPaired && !anyUnknown
    ? '  PAIRED: every draw uses the same seeds, so the recipe salt is the only\n' +
        '  thing varying. The rho below is a clean reading of RECIPE stability.'
    : '  UNPAIRED: the draws vary the game RNG as well as the recipe salt, so\n' +
        '  each rho below measures both variances at once and UNDER-STATES recipe\n' +
        '  stability. Re-run the draws on one fixed set of seeds before quoting a\n' +
        '  number from this table — see the v33 note at the top of this file.',
);

console.log('\nPairwise Spearman rho between draw rankings:');
for (let i = 0; i < parsed.length; i++) {
  for (let j = i + 1; j < parsed.length; j++) {
    const rho = spearman(parsed[i].rank, parsed[j].rank);
    const tag = anyUnknown || !pairedWith(i, j) ? 'UNPAIRED — conflated' : 'paired';
    console.log(
      `  draw ${i + 1} (${parsed[i].label}) vs draw ${j + 1} (${parsed[j].label}):  rho = ${rho.toFixed(3)}  (${tag})`,
    );
  }
}

// The rule, applied. A Leader whose rank moves at most one place across every
// draw is one a claim can be built on; everything else is a reading of the
// decks, and saying so is the whole job of this file.
const stable = allNames.filter((n) => (ranges.get(n) ?? 99) <= 1);
const unstable = allNames.filter((n) => (ranges.get(n) ?? 99) > 1);
console.log(
  `\nQuotable per-Leader (rank range <= 1 across all ${parsed.length} draws): ${
    stable.length ? stable.join(', ') : 'NONE'
  }`,
);
console.log(
  `Not quotable (the draw moves them): ${unstable.length ? unstable.join(', ') : 'none'}`,
);
console.log(
  '\nA claim about a Leader in the first list is about the KIT. A claim about a\n' +
    'Leader in the second is about the decks it was dealt, however clean any one\n' +
    "draw's cohorts looked.",
);
