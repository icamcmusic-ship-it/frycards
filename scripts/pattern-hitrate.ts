/**
 * v4.2 errata A: measures Combo pattern hit-rate under DIRECTED rerolling
 * (a player who knows their target pattern and rerolls toward it), not the
 * naive single-roll probability the old §6 tier table used. This is the
 * "measure it, don't guess it" pass the review asked for.
 *
 * For each pattern: roll 5d6, decide which dice to keep using a pattern-aware
 * greedy strategy (mirrors a real player optimizing toward that one target),
 * reroll the rest once, check if the pattern hits. Report hit rate over N trials.
 *
 * Usage: npx tsx scripts/pattern-hitrate.ts [trials]
 */
import { mulberry32, matchesPattern } from '../src/game/v3/engine';
import { ComboPattern } from '../src/game/v3/cards';

const TRIALS = parseInt(process.argv[2] || '200000', 10);
const PATTERNS: ComboPattern[] = [
  'AnyPair',
  'TwoPair',
  'ThreeKind',
  'SmallStraight',
  'FullHouse',
  'LargeStraight',
  'FourKind',
  'Yahtzee',
];

const rng = mulberry32(9001);
const roll5 = () => Array.from({ length: 5 }, () => Math.floor(rng() * 6) + 1);
const rerollAt = (dice: number[], keep: boolean[]) =>
  dice.map((v, i) => (keep[i] ? v : Math.floor(rng() * 6) + 1));

/**
 * Directed-reroll strategy per pattern family — what a player actually does
 * when chasing this specific pattern, not a naive "keep dice >=4" heuristic.
 */
function keepMask(dice: number[], pattern: ComboPattern): boolean[] {
  const counts: Record<number, number> = {};
  for (const v of dice) counts[v] = (counts[v] || 0) + 1;

  switch (pattern) {
    case 'SmallStraight':
    case 'LargeStraight': {
      // Straight family: keep one copy of each distinct value (duplicates and
      // nothing-contributes dice get rerolled) — the "keep distinct, fill gaps"
      // strategy the review flagged as structurally stronger than matching.
      const seen = new Set<number>();
      return dice.map((v) => {
        if (seen.has(v)) return false;
        seen.add(v);
        return true;
      });
    }
    case 'AnyPair':
    case 'TwoPair':
    case 'ThreeKind':
    case 'FourKind':
    case 'Yahtzee': {
      // Matching family: keep the largest cluster(s), reroll everything else
      // toward extending them.
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      if (pattern === 'TwoPair') {
        // Keep the two largest distinct-value clusters (up to 2 each).
        const keepValues = sorted.slice(0, 2).map(([v]) => Number(v));
        const usedPerValue: Record<number, number> = {};
        return dice.map((v) => {
          if (!keepValues.includes(v)) return false;
          usedPerValue[v] = (usedPerValue[v] || 0) + 1;
          return usedPerValue[v] <= 2;
        });
      }
      const bestValue = Number(sorted[0][0]);
      return dice.map((v) => v === bestValue);
    }
    case 'FullHouse': {
      // Keep the two largest distinct-value clusters (mirrors a 3+2 target).
      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      const keepValues = sorted.slice(0, 2).map(([v]) => Number(v));
      return dice.map((v) => keepValues.includes(v));
    }
  }
}

// v4.5: the ruleset has allowed TWO rerolls since v4.3 (§3.3), but this
// script (and the §6 hit-rate table it produced) only ever modeled one —
// the rulebook itself flagged this as understating actual hit rates. Now
// reports both `directed1` (old, one-reroll baseline, kept for comparison)
// and `directed2` (current two-reroll rule) side by side.
console.log(
  `\n=== Directed-reroll Combo pattern hit-rate (${TRIALS} trials, 1 vs 2 rerolls) ===`,
);
console.log(
  '(naive = single fresh 5d6 roll with NO reroll; directedN = reroll toward the pattern N times — v4.3+ allows 2)\n',
);
const results: { pattern: ComboPattern; naive: number; directed1: number; directed2: number }[] =
  [];
for (const pattern of PATTERNS) {
  let naiveHits = 0;
  let directed1Hits = 0;
  let directed2Hits = 0;
  for (let i = 0; i < TRIALS; i++) {
    const dice = roll5();
    if (matchesPattern(dice, pattern)) {
      naiveHits++;
      directed1Hits++;
      directed2Hits++;
      continue;
    }
    const mask1 = keepMask(dice, pattern);
    const rerolled1 = rerollAt(dice, mask1);
    if (matchesPattern(rerolled1, pattern)) {
      directed1Hits++;
      directed2Hits++;
      continue;
    }
    const mask2 = keepMask(rerolled1, pattern);
    const rerolled2 = rerollAt(rerolled1, mask2);
    if (matchesPattern(rerolled2, pattern)) directed2Hits++;
  }
  results.push({
    pattern,
    naive: (100 * naiveHits) / TRIALS,
    directed1: (100 * directed1Hits) / TRIALS,
    directed2: (100 * directed2Hits) / TRIALS,
  });
}

results.sort((a, b) => b.directed2 - a.directed2);
console.log(
  'Pattern'.padEnd(16),
  'Naive%'.padStart(8),
  'Directed1%'.padStart(12),
  'Directed2%'.padStart(12),
  'Lift(2v1)'.padStart(10),
);
for (const r of results) {
  const lift = r.directed2 - r.directed1;
  console.log(
    r.pattern.padEnd(16),
    r.naive.toFixed(1).padStart(7) + '%',
    r.directed1.toFixed(1).padStart(11) + '%',
    r.directed2.toFixed(1).padStart(11) + '%',
    ('+' + lift.toFixed(1)).padStart(10),
  );
}

console.log('\n--- Straight-family vs matching-family, same nominal "tier" (2-reroll) ---');
const byName = Object.fromEntries(results.map((r) => [r.pattern, r]));
console.log(
  `Large Straight (5 distinct)  directed2=${byName.LargeStraight.directed2.toFixed(1)}%  vs  Yahtzee (5 same)      directed2=${byName.Yahtzee.directed2.toFixed(1)}%`,
);
console.log(
  `Small Straight (4 distinct)  directed2=${byName.SmallStraight.directed2.toFixed(1)}%  vs  Three of a Kind      directed2=${byName.ThreeKind.directed2.toFixed(1)}%`,
);
console.log(
  `Large Straight               directed2=${byName.LargeStraight.directed2.toFixed(1)}%  vs  Full House (3+2)      directed2=${byName.FullHouse.directed2.toFixed(1)}%`,
);
