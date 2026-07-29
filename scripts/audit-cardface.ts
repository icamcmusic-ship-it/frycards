/**
 * Card-face layout audit.
 *
 * The card templates are laid out in absolute pixels at four fixed sizes, and
 * two of their boxes are positioned independently: the flavor block is pinned
 * to the BOTTOM of the text box (`mt-auto` under the dashed rule) while the
 * Might/Grit — or Resolve — stat plate is `position: absolute` in the card's
 * bottom-right corner. `PLATE_CLEARANCE` is the padding that is supposed to
 * keep them apart. Nothing checked that it did, and on the full-bleed
 * templates it did not: flavor text rendered underneath the stat plate on
 * every Full-Art and Mythic card whose flavor ran to the full width of its
 * last line.
 *
 * This measures the two boxes in a real browser at every size and reports any
 * pair that intersects. Run against the Vite dev server:
 *
 *   npm run dev &
 *   npx tsx scripts/audit-cardface.ts
 *
 * Exits non-zero on any overlap, so it can gate a release the way
 * `verify:pool` does for the catalog.
 */
import { chromium } from 'playwright';

const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3000';
const RARITIES = ['Common', 'Uncommon', 'Rare', 'Super-Rare', 'Ultra-Rare', 'Full-Art', 'Mythic'];
const SIZES = ['full', 'standard', 'compact', 'micro'];

interface Overlap {
  rarity: string;
  size: string;
  id: string;
  overlapPx: number;
}

// The environment ships a pinned Chromium; `playwright install` is a no-op
// here and the bundled revision number will not match, so point launch() at
// the binary that exists rather than the one this playwright build expects.
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });
const overlaps: Overlap[] = [];
let cardsChecked = 0;

for (const rarity of RARITIES) {
  for (const size of SIZES) {
    await page.goto(`${BASE}/gallery.html?all=${encodeURIComponent(rarity)}&size=${size}`, {
      waitUntil: 'networkidle',
    });
    // The flavor block sheds a line at a time in a layout effect until it
    // fits, so measure only once the page has stopped resizing itself.
    await page.waitForTimeout(400);
    const found = await page.evaluate(() => {
      const out: { id: string; overlapPx: number }[] = [];
      for (const card of Array.from(document.querySelectorAll('[data-card-id]'))) {
        const flavor = card.querySelector('[data-fc="flavor"]');
        const stats = card.querySelector('[data-fc="stats"]');
        if (!flavor || !stats) continue;
        const f = flavor.getBoundingClientRect();
        const s = stats.getBoundingClientRect();
        const dy = Math.min(f.bottom, s.bottom) - Math.max(f.top, s.top);
        const dx = Math.min(f.right, s.right) - Math.max(f.left, s.left);
        if (dy > 0.5 && dx > 0.5)
          out.push({ id: (card as HTMLElement).dataset.cardId!, overlapPx: +dy.toFixed(1) });
      }
      return out;
    });
    const tally = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('[data-card-id]'));
      return {
        cards: cards.length,
        withFlavor: cards.filter((c) => c.querySelector('[data-fc="flavor"]')).length,
        withStats: cards.filter((c) => c.querySelector('[data-fc="stats"]')).length,
        pairs: cards.filter(
          (c) => c.querySelector('[data-fc="flavor"]') && c.querySelector('[data-fc="stats"]'),
        ).length,
      };
    });
    cardsChecked += tally.pairs;
    if (process.env.AUDIT_VERBOSE)
      console.log(
        `  ${rarity} @ ${size}: ${tally.cards} cards, ${tally.withFlavor} flavor, ${tally.withStats} stats, ${tally.pairs} measurable, ${found.length} overlapping`,
      );
    for (const f of found) overlaps.push({ rarity, size, ...f });
  }
}
await browser.close();

console.log(
  `Checked ${cardsChecked} card renders (both a flavor block and a stat plate) across ${RARITIES.length} rarities x ${SIZES.length} sizes.`,
);
if (overlaps.length === 0) {
  console.log('No flavor/stat-plate overlaps.');
  process.exit(0);
}
const byBucket = new Map<string, Overlap[]>();
for (const o of overlaps) {
  const k = `${o.rarity} @ ${o.size}`;
  (byBucket.get(k) ?? byBucket.set(k, []).get(k)!).push(o);
}
console.log(`\nFLAVOR TEXT UNDER THE STAT PLATE — ${overlaps.length} renders:`);
for (const [k, v] of byBucket) {
  const worst = Math.max(...v.map((o) => o.overlapPx));
  console.log(`  ${k.padEnd(26)} ${String(v.length).padStart(3)} cards, worst ${worst}px`);
  for (const o of v.slice(0, 5)) console.log(`      ${o.id} (${o.overlapPx}px)`);
  if (v.length > 5) console.log(`      ...and ${v.length - 5} more`);
}
process.exit(1);
