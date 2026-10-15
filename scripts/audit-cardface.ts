/**
 * Card-face layout audit.
 *
 * Every card in the pool is rendered in a real browser at `full` and
 * `standard` — the two sizes that must print ALL of a card's text (compact
 * and micro abbreviate; the inspector shows the full card) — at its own
 * rarity, and additionally reprinted at the Ultra-Rare, Full-Art and Mythic templates
 * (their art-forward layouts leave the least room for text).
 *
 * Pull-tab faces (Mythic, Full-Art) are measured OPEN (`&info=open`): every
 * word must fit the expanded face. Full-Art is also measured tucked (its
 * default), where the flavour pull-quote must still print in full.
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
 *  - art window: an Ultra-Rare face whose art window is not 4:3 (±1%) at
 *    every size, or whose art is cropped (the art is 4:3 landscape, so the
 *    image's own aspect must match the window it fills);
 *  - holo: a rarity's HoloLayer (at full strength) changing a text element's
 *    pixels, or dropping its contrast (see the holo pass below);
 *  - ink: a Full-Art face whose headline or pull-quote does not print in the
 *    ink scripts/art-ink.ts chose for that card's art.
 * A text box that had to fall back to scrolling (fade cue, every word still
 * reachable) is reported but is not a failure. So is text over art that
 * misses WCAG 4.5:1 even in its best ink (from scripts/art-ink.report.json:
 * the art is measured at build time, since this harness never loads it);
 * there the text-shadow and outline carry it.
 *
 *   npm run dev &
 *   npx tsx scripts/audit-cardface.ts
 */
import { chromium } from 'playwright';
import sharp from 'sharp';
import { blockSupabase } from './lib/block-remote-media';
import { readFileSync } from 'node:fs';
import { POOL } from '../src/game/poker/cardpool';
import { FA_INK, FA_SCRIM } from '../src/components/artInk.generated';
import { MIN_CONTRAST, SCRIM_CONTRAST, decodeFaInk } from '../src/components/artInk';

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
// Remote stills come back as one local 4:3 placeholder (never the network),
// so the art-fill and art-window checks below have a real <img> to measure.
const STILL = await sharp({
  create: { width: 64, height: 48, channels: 3, background: '#808080' },
})
  .png()
  .toBuffer();
await ctx.route(/^https?:\/\/(?!localhost|127\.0\.0\.1)/, (route) =>
  route.request().resourceType() === 'image'
    ? route.fulfill({ body: STILL, contentType: 'image/png' })
    : route.fallback(),
);
// tsx/esbuild wraps named functions in `__name(...)`, which the page lacks.
await ctx.addInitScript({ content: 'window.__name = (f) => f;' });
const page = await ctx.newPage();
const problems: Problem[] = [];
const scrolled: Problem[] = [];
let renders = 0;

const runs: { rarity: string; reprint: boolean; tucked?: boolean; reveal?: boolean }[] = [
  ...RARITIES.map((rarity) => ({ rarity, reprint: false })),
  ...REPRINT.map((rarity) => ({ rarity, reprint: true })),
  // Full-Art opens tucked to its pull-quote: the flavour must fit there too.
  { rarity: 'Full-Art', reprint: true, tucked: true },
  // The pack reveal: every card laid out mid-flip (edge-on), then turned.
  { rarity: 'Uncommon', reprint: true, reveal: true },
  { rarity: 'Ultra-Rare', reprint: true, reveal: true },
];
/** Ultra-Rare art window: 4:3, within this fraction. */
const UR_ASPECT_TOL = 0.01;
const urArt: { bucket: string; aspect: number; pct: number }[] = [];

// AUDIT_HOLO_ONLY=1 skips the layout runs (iterate on the holo pass alone).
for (const { rarity, reprint, tucked, reveal } of process.env.AUDIT_HOLO_ONLY ? [] : runs) {
  for (const size of SIZES) {
    const bucket = `${rarity}${reprint ? ' (reprint)' : ''}${tucked ? ' (tucked)' : ''}${reveal ? ' (pack reveal)' : ''} @ ${size}`;
    await page.goto(
      `${BASE}/gallery.html?all=${encodeURIComponent(rarity)}&size=${size}&info=${tucked ? 'tucked' : 'open'}${reprint ? '&reprint=1' : ''}${reveal ? '&reveal=1' : ''}`,
      { waitUntil: 'networkidle' },
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
      // Card art is lazy: load every still so the art checks can measure it.
      const imgs = Array.from(document.images);
      for (const i of imgs) i.loading = 'eager';
      await Promise.all(imgs.map((i) => i.decode().catch(() => {})));
    });
    // The fit pass steps in layout effects until the text fits; measure only
    // once the page has stopped resizing itself.
    await page.waitForTimeout(600);
    const inks = rarity === 'Full-Art' ? FA_INK : {};
    const found = await page.evaluate(
      ([exp, inks, decoded, tol]) => {
        const out: { id: string; kind: string; scroll?: boolean }[] = [];
        const urArt: { aspect: number; pct: number }[] = [];
        const hit = (a: DOMRect, b: DOMRect) =>
          Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top) > 0.5 &&
          Math.min(a.right, b.right) - Math.max(a.left, b.left) > 0.5;
        const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-card-id]'));
        for (const card of cards) {
          const id = card.dataset.cardId!;
          const add = (kind: string) => out.push({ id, kind });
          const cr = card.getBoundingClientRect();
          // Overlaps with the corner plate.
          // A plate folded away inside a tucked pull-tab (inert) is not drawn.
          const stats = card.querySelector('[data-fc="stats"]');
          if (stats && !stats.closest('[inert]')) {
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
          // A squeezed text column (a notch or flex sibling eating the row):
          // every rules/flavour/ability block keeps >= 40% of the text box.
          if (box && box.clientWidth > 0) {
            for (const el of Array.from(
              card.querySelectorAll<HTMLElement>(
                '[data-fc="rules"], [data-fc="flavor"] p, [data-fc="ability"]',
              ),
            )) {
              if (el.offsetParent === null || el.closest('[inert]')) continue;
              if (el.offsetWidth < box.clientWidth * 0.4)
                add(`squeezed: text column ${el.offsetWidth}px of ${box.clientWidth}px`);
            }
          }
          // The art fills its window (no letterboxed tile).
          for (const m of Array.from(card.querySelectorAll<HTMLElement>('img, video'))) {
            const win = m.parentElement;
            if (!win || m.offsetParent === null) continue;
            if (getComputedStyle(m).objectFit !== 'cover') add('art: not filling its window');
            else if (m.offsetWidth < win.clientWidth - 1 || m.offsetHeight < win.clientHeight - 1)
              add('art: smaller than its window');
          }
          // Ultra-Rare: a fixed 4:3 window (layout size, immune to the
          // reveal's transforms) showing the whole art, uncropped.
          const art = card.querySelector<HTMLElement>('[data-fc="art"]');
          if (art) {
            const aspect = art.clientWidth / art.clientHeight;
            urArt.push({
              aspect,
              pct:
                ((art.offsetWidth * art.offsetHeight) / (card.offsetWidth * card.offsetHeight)) *
                100,
            });
            if (Math.abs(aspect / (4 / 3) - 1) > tol)
              add(`art: UR window is ${aspect.toFixed(3)}:1, not 4:3`);
            const img = art.querySelector('img');
            if (img && img.naturalWidth > 0) {
              const nat = img.naturalWidth / img.naturalHeight;
              const fit = getComputedStyle(img).objectFit;
              // cover crops by the aspect mismatch; contain/fill never crop.
              const crop = fit === 'cover' ? 1 - Math.min(nat / aspect, aspect / nat) : 0;
              if (crop > tol) add(`art: UR art cropped by ${(crop * 100).toFixed(1)}%`);
            } else if (img) add('art: UR art never loaded');
          }
          // Adaptive ink: the face prints in the ink chosen for its art.
          if (inks[id]) {
            const want = decoded[id];
            const rgb = { light: 'rgb(255, 255, 255)', dark: 'rgb(20, 20, 20)' } as const;
            for (const [sel, k] of [
              ['.fa-name', 'name'],
              ['.fa-quote', 'quote'],
            ] as const) {
              const el = card.querySelector<HTMLElement>(sel);
              const ink = want[k];
              if (el && ink !== 'accent' && getComputedStyle(el).color !== rgb[ink])
                add(`ink: ${k} is ${getComputedStyle(el).color}, chose ${ink}`);
            }
          }
          const e = exp[id as keyof typeof exp] as
            { flavor: boolean; abilities: number } | undefined;
          if (e) {
            if (e.flavor && !card.querySelector('[data-fc="flavor"]'))
              add('truncated: flavor hidden');
            const n = card.querySelectorAll('[data-fc="ability"]').length;
            if (n < e.abilities) add(`truncated: ${e.abilities - n} ability rows missing`);
          }
        }
        return { out, cards: cards.length, urArt };
      },
      [
        Object.fromEntries(expect),
        inks as Record<string, string>,
        Object.fromEntries(Object.keys(inks).map((id) => [id, decodeFaInk(inks[id])])),
        UR_ASPECT_TOL,
      ] as const,
    );
    renders += found.cards;
    for (const a of found.urArt) urArt.push({ bucket, ...a });
    for (const f of found.out)
      // In the pack reveal a scroll fallback means the fit pass measured the
      // face mid-flip and ran its ladder dry (the face fits flat): a failure.
      (f.scroll && !reveal ? scrolled : problems).push({
        bucket,
        id: f.id,
        kind: f.scroll ? 'squeezed: fit pass ran dry mid-flip (scrolls)' : f.kind,
      });
    if (process.env.AUDIT_VERBOSE)
      console.log(`  ${bucket}: ${found.cards} cards, ${found.out.length} findings`);
  }
}
// ---- Holo pass ----------------------------------------------------------
// Every rarity's HoloLayer (plus the foil-copy reverse) frozen at full
// strength over the first HOLO_N pool cards reprinted at that template. Two
// checks per text element (every own-text leaf, plus `[data-holo-protect]`
// such as the Full-Art headliner title):
//  - masked: with the glare hidden, the tier layers must not change the
//    text's pixels at all (the mask cuts a hard hole there);
//  - contrast: with everything on, the text's light/dark spread must not
//    drop below min(its bare-card spread, MIN_CONTRAST) (5% slack).
const HOLO_N = Number(process.env.HOLO_N ?? 10);
const HOLO_RUNS: { rarity: string; foil?: boolean; info: string }[] = [
  ...RARITIES.filter((r) => r !== 'Alt-Art').map((rarity) => ({ rarity, info: 'open' })),
  { rarity: 'Full-Art', info: 'tucked' },
  { rarity: 'Rare', foil: true, info: 'open' },
];
const holoProblems: Problem[] = [];
let holoTexts = 0;
const lum = (r: number, g: number, b: number) => {
  const c = (v: number) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};
const holoPage = await ctx.newPage();
for (const { rarity, foil, info } of HOLO_RUNS) {
  const bucket = `holo ${rarity}${foil ? ' foil' : ''}${info === 'tucked' ? ' (tucked)' : ''} @ full`;
  await holoPage.goto(
    `${BASE}/gallery.html?all=${encodeURIComponent(rarity)}&size=full&info=${info}&reprint=1&holo=1${foil ? '&foil=1' : ''}`,
    { waitUntil: 'networkidle' },
  );
  await holoPage.addStyleTag({
    content:
      '*,*::before,*::after{animation-play-state:paused!important;transition:none!important}',
  });
  await holoPage.evaluate(async () => {
    await document.fonts.ready;
    document.querySelectorAll('video').forEach((v) => v.pause());
  });
  await holoPage.waitForTimeout(800);
  const wraps = (await holoPage.$$('[data-holo-wrap]')).slice(0, HOLO_N);
  for (const wrap of wraps) {
    await wrap.scrollIntoViewIfNeeded();
    const info = await wrap.evaluate((root) => {
      const R = root.getBoundingClientRect();
      const rects: { x: number; y: number; w: number; h: number; tag: string }[] = [];
      root.querySelectorAll<HTMLElement>('*').forEach((el) => {
        if (el.closest('.holo')) return;
        const own = Array.from(el.childNodes).some(
          (c) => c.nodeType === 3 && (c.textContent || '').trim().length > 1,
        );
        if (!own && !el.hasAttribute('data-holo-protect')) return;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) return;
        const r = el.getBoundingClientRect();
        // Inset 1px: the hole's soft edge sits in the 2px padding outside.
        const x = Math.round(r.left - R.left) + 1;
        const y = Math.round(r.top - R.top) + 1;
        const w = Math.round(r.width) - 2;
        const h = Math.round(r.height) - 2;
        if (w < 4 || h < 4 || x < 0 || y < 0 || x + w > R.width || y + h > R.height) return;
        rects.push({
          x,
          y,
          w,
          h,
          tag: el.hasAttribute('data-holo-protect') ? 'protect' : el.tagName,
        });
      });
      return {
        id: root.getAttribute('data-holo-wrap')!,
        rects,
        layers: root.querySelectorAll('.holo__l').length,
      };
    });
    const shot = async (css: string) => {
      const tag = await holoPage.addStyleTag({ content: css });
      const png = await wrap.screenshot();
      await tag.evaluate((n) => (n as Element).remove());
      return sharp(png).raw().toBuffer({ resolveWithObject: true });
    };
    const bare = await shot('.holo{display:none!important}');
    const layers = await shot('.holo .fx-glare{display:none!important}');
    const full = await shot('.holo-audit-noop{}');
    const W = bare.info.width;
    const ch = bare.info.channels;
    for (const r of info.rects) {
      holoTexts++;
      let changed = 0;
      const lb: number[] = [];
      const lf: number[] = [];
      for (let yy = r.y; yy < r.y + r.h; yy++)
        for (let xx = r.x; xx < r.x + r.w; xx++) {
          const i = (yy * W + xx) * ch;
          const d = Math.max(
            Math.abs(bare.data[i] - layers.data[i]),
            Math.abs(bare.data[i + 1] - layers.data[i + 1]),
            Math.abs(bare.data[i + 2] - layers.data[i + 2]),
          );
          if (d > 16) changed++;
          lb.push(lum(bare.data[i], bare.data[i + 1], bare.data[i + 2]));
          lf.push(lum(full.data[i], full.data[i + 1], full.data[i + 2]));
        }
      const n = r.w * r.h;
      if (changed / n > 0.02)
        holoProblems.push({
          bucket,
          id: info.id,
          kind: `holo over text: ${r.tag} ${((100 * changed) / n).toFixed(1)}% of its pixels changed`,
        });
      const spread = (xs: number[]) => {
        xs.sort((a, b) => a - b);
        return (
          (xs[Math.floor(xs.length * 0.95)] + 0.05) / (xs[Math.floor(xs.length * 0.05)] + 0.05)
        );
      };
      const before = spread(lb);
      const after = spread(lf);
      if (after < Math.min(before, MIN_CONTRAST) * 0.95)
        holoProblems.push({
          bucket,
          id: info.id,
          kind: `holo contrast: ${r.tag} ${before.toFixed(2)}:1 → ${after.toFixed(2)}:1`,
        });
    }
  }
  if (process.env.AUDIT_VERBOSE) console.log(`  ${bucket}: ${wraps.length} cards`);
}
console.log(
  `Holo: ${holoTexts} text elements on ${HOLO_RUNS.length} tiers x ${HOLO_N} cards at full strength; ${holoProblems.length} problems.`,
);
problems.push(...holoProblems);

await browser.close();

const overlaps = problems.filter((p) => p.kind.startsWith('overlap'));
const squeezed = problems.filter((p) => p.kind.startsWith('squeezed') || p.kind.startsWith('art'));
const truncations = problems.filter((p) => p.kind.startsWith('truncated'));
console.log(
  `Checked ${renders} card renders (${POOL.length} pool cards; ${RARITIES.length} rarities + ${REPRINT.length} reprint templates x ${SIZES.length} sizes).`,
);
console.log(
  `Overlaps: ${overlaps.length}. Truncations: ${truncations.length}. Squeezed text / unfilled art: ${squeezed.length}. Scroll fallbacks: ${scrolled.length}.`,
);
if (urArt.length) {
  const asp = urArt.map((a) => a.aspect);
  const pct = urArt.map((a) => a.pct);
  const r = (xs: number[], d: number) =>
    `${Math.min(...xs).toFixed(d)}–${Math.max(...xs).toFixed(d)}`;
  console.log(
    `Ultra-Rare art window: ${urArt.length} faces, aspect ${r(asp, 4)} (4:3 = 1.3333), ${r(pct, 1)}% of the card.`,
  );
}
const scrollBuckets = new Map<string, string[]>();
for (const s of scrolled)
  (scrollBuckets.get(s.bucket) ?? scrollBuckets.set(s.bucket, []).get(s.bucket)!).push(s.id);
for (const [k, v] of scrollBuckets)
  console.log(
    `  scrolls: ${k}: ${v.length} (${v.slice(0, 4).join(', ')}${v.length > 4 ? ', ...' : ''})`,
  );
// Text over art vs. its chosen ink, across the pool (measured at build time).
interface InkRow {
  ink: string;
  ratio: number;
}
let inkReport: Record<string, Record<string, InkRow>> = {};
try {
  inkReport = JSON.parse(readFileSync('scripts/art-ink.report.json', 'utf8')).cards ?? {};
} catch {
  // no report yet
}
const measured = POOL.filter((c) => inkReport[c.id]);
const short: string[] = [];
for (const c of measured)
  for (const [region, row] of Object.entries(inkReport[c.id]))
    if (row.ratio < MIN_CONTRAST) short.push(`${c.id} ${region} ${row.ink} ${row.ratio}:1`);
console.log(
  `Text over art: ${measured.length} of ${POOL.length} cards' art measured (npm run art:ink); ` +
    `${short.length} regions under ${MIN_CONTRAST}:1 in their best ink (text-shadow carries them).`,
);
for (const s of short.slice(0, 12)) console.log(`  contrast: ${s}`);
if (short.length > 12) console.log(`  ...and ${short.length - 12} more`);
// Audit 1.6: under SCRIM_CONTRAST the text-shadow alone is not enough; the
// region must print on a scrim (FA_SCRIM, written by npm run art:ink).
const unscrimmed: string[] = [];
for (const c of measured)
  for (const [region, row] of Object.entries(inkReport[c.id]))
    if (
      region !== 'mc' &&
      row.ratio < SCRIM_CONTRAST &&
      !(FA_SCRIM[c.id] ?? '').includes(region[0])
    )
      unscrimmed.push(`${c.id} ${region} ${row.ink} ${row.ratio}:1`);
console.log(
  `Under ${SCRIM_CONTRAST}:1: ${short.filter((s) => Number(s.split(' ').pop()!.replace(':1', '')) < SCRIM_CONTRAST).length} region(s), ${unscrimmed.length} without a scrim.`,
);
for (const s of unscrimmed.slice(0, 12)) console.log(`  NO SCRIM: ${s}`);
if (problems.length === 0 && unscrimmed.length === 0) process.exit(0);
if (problems.length === 0) {
  console.log(
    `\nFAIL: ${unscrimmed.length} region(s) under ${SCRIM_CONTRAST}:1 with no scrim (run npm run art:ink).`,
  );
  process.exit(1);
}
const byBucket = new Map<string, Problem[]>();
for (const o of problems)
  (byBucket.get(o.bucket) ?? byBucket.set(o.bucket, []).get(o.bucket)!).push(o);
for (const [k, v] of byBucket) {
  console.log(`\n${k}: ${v.length}`);
  for (const o of v.slice(0, 8)) console.log(`    ${o.id}  ${o.kind}`);
  if (v.length > 8) console.log(`    ...and ${v.length - 8} more`);
}
process.exit(1);
