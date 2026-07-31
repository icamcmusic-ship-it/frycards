/**
 * Meta-screen layout + render audit.
 *
 * v11's roadmap entry says "re-run the harness before assuming a phone
 * regression exists" — but the harness it refers to was ad hoc and was never
 * committed, so there was nothing to re-run. This is it, as a script.
 *
 * Every screen mounted by `src/meta-preview.tsx` is loaded at a phone width and
 * a desktop width and checked for three things: a render that threw, a console
 * error that is not merely a failed network call, and horizontal overflow
 * (`documentElement.scrollWidth > innerWidth`, which is what puts a control
 * off the side of a phone). Then each screen's visible controls are clicked one
 * at a time — a fresh page load per click, so no two interactions compound —
 * and the same three checks run again on the resulting state.
 *
 * The preview harness is offline by design (it mounts against a stubbed
 * MetaState), so screens that fetch on mount render their own loading/error
 * state. That is still the real layout, which is what this measures; network
 * errors are therefore filtered out of the console check.
 *
 * Run against the Vite dev server, the same way `audit-cardface.ts` does:
 *
 *   npm run dev &
 *   npm run audit:screens
 *
 * Env: AUDIT_BASE (default http://localhost:3000), CLICK_CAP (default 40
 * controls per screen — the Collection grid alone renders ~1,000 card tiles),
 * SKIP_CLICKS=1 to run only the initial load pass, PLAYWRIGHT_CHROMIUM to point
 * at a preinstalled browser binary.
 *
 * Exits non-zero on any problem, so it can gate a release the way
 * `verify:pool` does for the catalog.
 */
import { chromium } from 'playwright';

const BASE = `${process.env.AUDIT_BASE ?? 'http://localhost:3000'}/meta-preview.html`;
const CLICK_CAP = Number(process.env.CLICK_CAP ?? 40);

/**
 * Keep in sync with the `screen=` branches in src/meta-preview.tsx. An entry
 * may carry extra query string (`'submissions&role=creator'`) — the harness
 * appends it verbatim, which is how the Creator-only panels get measured: with
 * the default player profile they never mount at all.
 */
const SCREENS = [
  'collection',
  'decks',
  'pack',
  'profile',
  'inspect',
  'social',
  'store',
  'market',
  'shops',
  'battlepass',
  'achievements',
  'news',
  'settings',
  'menu',
  'howtoplay',
  'update',
  'changelog',
  'submissions',
  // v13: the review queue's mechanics-override editor and the BULK ADD
  // importer only exist for the Creator.
  'submissions&role=creator',
];

const WIDTHS = [375, 1280];
const CONTROLS = 'button:visible, [role="button"]:visible';

/** Console noise an offline preview cannot avoid. The realtime client retries
 * its socket on every screen that subscribes, so the WebSocket/tunnel variants
 * matter as much as the fetch ones — without them a clean run reports twenty
 * "problems" that are all one dropped connection. */
const NETWORK_NOISE =
  /Failed to load resource|net::ERR|ERR_TUNNEL|ERR_PROXY|Failed to fetch|AuthRetryable|WebSocket connection|tunnel via proxy/i;

interface Problem {
  where: string;
  width: number;
  kind: 'overflow' | 'console' | 'blank';
  detail: string;
}

const problems: Problem[] = [];

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);

/**
 * Wait for the control count to stop moving before anyone reads it.
 *
 * A fixed 700ms sleep is not enough for the screens that mount their panels
 * after a fetch settles, and BOTH passes below depend on the count: the load
 * pass reports it, and the click sweep uses it as its stop condition. Sampling
 * it too early made the sweep decide a screen had *no* controls and stop at
 * index 0 — which prints as "clicked 0 control(s)" and reads exactly like
 * "checked, nothing to click". Three screens (howtoplay, changelog,
 * submissions — including `submissions&role=creator`, the Creator panels v13
 * added the harness entry for) were never clicked at all under that race while
 * the run still reported a clean pass.
 *
 * Two consecutive equal samples, or the cap, whichever comes first.
 */
async function settledControlCount(page: import('playwright').Page): Promise<number> {
  let last = -1;
  for (let i = 0; i < 12; i++) {
    const n = await page
      .$$(CONTROLS)
      .then((c) => c.length)
      .catch(() => 0);
    if (n === last && n > 0) return n;
    last = n;
    await page.waitForTimeout(250);
  }
  return Math.max(0, last);
}

async function check(screen: string, width: number, clickIndex?: number) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}?screen=${screen}`, { waitUntil: 'domcontentloaded', timeout: 20_000 });
  await page.waitForTimeout(700);
  const settled = await settledControlCount(page);

  let clicked = '';
  if (clickIndex !== undefined) {
    // Bound on the SETTLED count, not on a fresh query — see settledControlCount.
    if (clickIndex >= settled) {
      await ctx.close();
      return { done: true, count: settled };
    }
    const controls = await page.$$(CONTROLS).catch(() => []);
    if (clickIndex >= controls.length) {
      await ctx.close();
      return { done: true, count: controls.length };
    }
    clicked = (await controls[clickIndex].innerText().catch(() => '')).slice(0, 24).trim();
    // A click that navigates, detaches the node or opens a native dialog is not
    // itself a finding — the checks below still run on whatever state results.
    await controls[clickIndex].click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(200);
  }

  const where = clickIndex === undefined ? screen : `${screen}[#${clickIndex} "${clicked}"]`;

  const overflow = await page
    .evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    .catch(() => null);
  if (overflow && overflow.scrollWidth > overflow.innerWidth + 1) {
    problems.push({
      where,
      width,
      kind: 'overflow',
      detail: `scrollWidth ${overflow.scrollWidth} > innerWidth ${overflow.innerWidth}`,
    });
  }

  for (const e of errors.filter((e) => !NETWORK_NOISE.test(e))) {
    problems.push({ where, width, kind: 'console', detail: e.slice(0, 300) });
  }

  const bodyText = (await page.innerText('body').catch(() => '')).trim();
  if (bodyText.length < 10) {
    problems.push({ where, width, kind: 'blank', detail: `body text length ${bodyText.length}` });
  }

  await ctx.close();
  return { done: false, count: settled };
}

for (const screen of SCREENS) {
  for (const width of WIDTHS) {
    const r = await check(screen, width);
    console.log(`${screen} @${width}: ${r.count} controls`);
  }
}

// Click sweep at phone width only — the tighter of the two, and the one an
// overflow actually hurts on.
if (!process.env.SKIP_CLICKS) {
  for (const screen of SCREENS) {
    let i = 0;
    while (i <= CLICK_CAP) {
      const r = await check(screen, 375, i);
      if (r.done) break;
      i += 1;
    }
    console.log(`${screen}: clicked ${i} control(s)`);
  }
}

await browser.close();

console.log(`\n=== ${problems.length} problem(s) ===`);
for (const p of problems) console.log(`${p.where} @${p.width} [${p.kind}] ${p.detail}`);
process.exit(problems.length > 0 ? 1 : 0);
