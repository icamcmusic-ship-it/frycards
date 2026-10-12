/**
 * Card-face layout audit.
 *
 * Every card in the pool is rendered in a real browser at `full` and
 * `standard` — the two sizes that must print ALL of a card's text (compact
 * and micro abbreviate; the inspector shows the full card) — at its own
 * rarity, and additionally reprinted at the Ultra-Rare, Full-Art and Mythic templates
 * (their art-forward layouts leave the least room for text).
 *
 * It FAILS on:
 *  - overlap: the stat plate (chip cost / starting nerve) intersecting the
 *    flavor block, the rules paragraph or a Leader ability row;
 *  - truncation: any text that trails off or is cut — an element showing an
 *    ellipsis or a line clamp that hides content, a text box whose content
 *    overflows it without the scroll fallback, a text box that slides off the
 *    card, a masthead or type line that overflows, a "+N" chip standing in
 *    for keyword chips, flavor text that is missing, or a Leader ability that
 *    is missing.
 * A text box that had to fall back to scrolling (fade cue, every word still
 * reachable) is reported but is not a failure.
 *
 *   npm run dev &
 *   npx tsx scripts/audit-cardface.ts
 */
import { chromium } from 'playwright';
import { blockSupabase } from './lib/block-remote-media';
import { POOL } from '../src/game/poker/cardpool';

const BASE = process.env.AUDIT_BASE ?? 'http://localhost:3000';
const RARITIES = [
  'Common',
  'Uncommon',
  'Rare',
  'Super-Rare',
  'Ultra-Rare',
  'Full-Art',
  'Alt-Art',
  'Mythic',
];
/** Templates every pool card is also reprinted at. */
const REPRINT = ['Ultra-Rare', 'Full-Art', 'Mythic'];
const SIZES = ['full', 'standard'];

const expect = new Map(
  POOL.map((c) => [
    c.id,
    {
      flavor: !!c.flavor,
      abilities: c.type === 'Leader' ? (c.abilities?.length ?? 0) : 0,
    },
  ]),
);

interface Problem {
  bucket: string;
  id: string;
  kind: string;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1200 } });
// Never touch the live project from a harness (see blockSupabase).
await blockSupabase(ctx);
// tsx/esbuild wraps named functions in `__name(...)`, which the page lacks.
await ctx.addInitScript({ content: 'window.__name = (f) => f;' });
const page = await ctx.newPage();
const problems: Problem[] = [];
const scrolled: Problem[] = [];
let renders = 0;

const runs: { rarity: string; reprint: boolean }[] = [
  ...RARITIES.map((rarity) => ({ rarity, reprint: false })),
  ...REPRINT.map((rarity) => ({ rarity, reprint: true })),
];

for (const { rarity, reprint } of runs) {
  for (const size of SIZES) {
    const bucket = `${rarity}${reprint ? ' (reprint)' : ''} @ ${size}`;
    await page.goto(
      `${BASE}/gallery.html?all=${encodeURIComponent(rarity)}&size=${size}${reprint ? '&reprint=1' : ''}`,
      { waitUntil: 'networkidle' },
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
    });
    // The fit pass steps in layout effects until the text fits; measure only
    // once the page has stopped resizing itself.
    await page.waitForTimeout(600);
    const found = await page.evaluate((exp) => {
      const out: { id: string; kind: string; scroll?: boolean }[] = [];
      const hit = (a: DOMRect, b: DOMRect) =>
        Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5 &&
        Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5;
      const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-card-id]'));
      for (const card of cards) {
        const id = card.dataset.cardId!;
        const add = (kind: string) => out.push({ id, kind });
        const cr = card.getBoundingClientRect();
        // Overlaps with the corner plate.
        const stats = card.querySelector('[data-fc="stats"]');
        if (stats) {
          const s = stats.getBoundingClientRect();
          for (const k of ['flavor', 'rules', 'ability']) {
            for (const el of Array.from(card.querySelectorAll(`[data-fc="${k}"]`))) {
              if (hit(el.getBoundingClientRect(), s)) add(`overlap: ${k} under the stat plate`);
            }
          }
        }
        // Ellipses and line clamps that hide text.
        for (const el of Array.from(card.querySelectorAll<HTMLElement>('*'))) {
          const cs = getComputedStyle(el);
          if (cs.textOverflow === 'ellipsis' && el.scrollWidth > el.clientWidth + 1)
            add(`truncated: ellipsis "${(el.textContent ?? '').slice(0, 30)}"`);
          const clamp = cs.getPropertyValue('-webkit-line-clamp');
          if (clamp && clamp !== 'none' && el.scrollHeight > el.clientHeight + 1)
            add(`truncated: line clamp "${(el.textContent ?? '').slice(0, 30)}"`);
        }
        // The text box: never overflowing unless it scrolls, never off the card.
        const box = card.querySelector<HTMLElement>('[data-fc="textbox"]');
        if (box) {
          const b = box.getBoundingClientRect();
          if (box.dataset.fcScroll === '1') out.push({ id, kind: 'scrolls', scroll: true });
          else if (box.scrollHeight > box.clientHeight + 1)
            add(`truncated: text box overflows by ${box.scrollHeight - box.clientHeight}px`);
          if (b.bottom > cr.bottom + 1 || b.top < cr.top - 1)
            add('truncated: text box off the card');
        }
        for (const k of ['masthead', 'typeline']) {
          const el = card.querySelector<HTMLElement>(`[data-fc="${k}"]`);
          if (el && el.scrollWidth > el.clientWidth + 1) add(`truncated: ${k} overflows`);
        }
        if (card.querySelector('[data-fc="chips-more"]')) add('truncated: keyword chips folded');
        const e = exp[id as keyof typeof exp] as { flavor: boolean; abilities: number } | undefined;
        if (e) {
          if (e.flavor && !card.querySelector('[data-fc="flavor"]'))
            add('truncated: flavor hidden');
          const n = card.querySelectorAll('[data-fc="ability"]').length;
          if (n < e.abilities) add(`truncated: ${e.abilities - n} ability rows missing`);
        }
      }
      return { out, cards: cards.length };
    }, Object.fromEntries(expect));
    renders += found.cards;
    for (const f of found.out)
      (f.scroll ? scrolled : problems).push({ bucket, id: f.id, kind: f.kind });
    if (process.env.AUDIT_VERBOSE)
      console.log(`  ${bucket}: ${found.cards} cards, ${found.out.length} findings`);
  }
}
await browser.close();

const overlaps = problems.filter((p) => p.kind.startsWith('overlap'));
const truncations = problems.filter((p) => p.kind.startsWith('truncated'));
console.log(
  `Checked ${renders} card renders (${POOL.length} pool cards; ${RARITIES.length} rarities + ${REPRINT.length} reprint templates x ${SIZES.length} sizes).`,
);
console.log(
  `Overlaps: ${overlaps.length}. Truncations: ${truncations.length}. Scroll fallbacks: ${scrolled.length}.`,
);
const scrollBuckets = new Map<string, string[]>();
for (const s of scrolled)
  (scrollBuckets.get(s.bucket) ?? scrollBuckets.set(s.bucket, []).get(s.bucket)!).push(s.id);
for (const [k, v] of scrollBuckets)
  console.log(
    `  scrolls: ${k}: ${v.length} (${v.slice(0, 4).join(', ')}${v.length > 4 ? ', ...' : ''})`,
  );
if (problems.length === 0) process.exit(0);
const byBucket = new Map<string, Problem[]>();
for (const o of problems)
  (byBucket.get(o.bucket) ?? byBucket.set(o.bucket, []).get(o.bucket)!).push(o);
for (const [k, v] of byBucket) {
  console.log(`\n${k}: ${v.length}`);
  for (const o of v.slice(0, 8)) console.log(`    ${o.id}  ${o.kind}`);
  if (v.length > 8) console.log(`    ...and ${v.length - 8} more`);
}
process.exit(1);
