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
 * v19: the sweep above is depth ONE — one click from a freshly loaded screen,
 * then the context is thrown away. Everything that only exists *behind* a
 * click was therefore never measured: every modal (the card inspector, the
 * sell form, the profile modal), every second-level panel, and every control
 * that a first click reveals. Those are exactly the surfaces a phone layout
 * breaks on, because a modal brings its own width constraints. So after a
 * first click that visibly OPENS something (the control set changed), the
 * harness now re-reads the controls and clicks each newly reachable one — a
 * fresh page load per (parent, child) pair, so no two child interactions
 * compound and every finding names the exact two clicks that produced it.
 *
 * Run against the Vite dev server, the same way `audit-cardface.ts` does:
 *
 *   npm run dev &
 *   npm run audit:screens
 *
 * Env: AUDIT_BASE (default http://localhost:3000), CLICK_CAP (default 40
 * controls per screen — the Collection grid alone renders ~1,000 card tiles),
 * SKIP_CLICKS=1 to run only the initial load pass, DEPTH=1 to skip the
 * depth-two sweep, CHILD_CAP (default 8 children per opened panel) and
 * PAIR_CAP (default 24 pairs per screen) to bound it, PLAYWRIGHT_CHROMIUM to
 * point at a preinstalled browser binary.
 *
 * Exits non-zero on any problem, so it can gate a release the way
 * `verify:pool` does for the catalog.
 */
import { chromium } from 'playwright';

const BASE = `${process.env.AUDIT_BASE ?? 'http://localhost:3000'}/meta-preview.html`;
const CLICK_CAP = Number(process.env.CLICK_CAP ?? 40);
const DEPTH = Number(process.env.DEPTH ?? 2);
/** Children clicked per panel a first click opened. */
const CHILD_CAP = Number(process.env.CHILD_CAP ?? 8);
/** Total (parent, child) pairs measured per screen — the outer bound on the
 * depth-two sweep's runtime, which is otherwise quadratic in control count. */
const PAIR_CAP = Number(process.env.PAIR_CAP ?? 24);

/**
 * Keep in sync with the `screen=` branches in src/meta-preview.tsx. An entry
 * may carry extra query string (`'submissions&role=creator'`) — the harness
 * appends it verbatim, which is how the Creator-only panels get measured: with
 * the default player profile they never mount at all.
 */
const ALL_SCREENS = [
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
  'changelog',
  'submissions',
  // v13: the review queue's mechanics-override editor and the BULK ADD
  // importer only exist for the Creator.
  'submissions&role=creator',
  // v22 — see PRELUDE. `pack` mounts on its unopened wrapper, whose only
  // control is the tear button, so the sweep measured one control and stopped:
  // the card-by-card reveal and the summary — the two screens a player sees
  // after EVERY pack they open, and where the foil treatments, the rarity
  // plates and the sell-value maths live — had never been measured at all.
  'pack@reveal',
  'pack@summary',
];

/**
 * States that only exist behind a fixed opening sequence, as button labels to
 * click after load and before the sweep begins.
 *
 * This is not the same tool as the depth-two sweep. That one clicks ONE control
 * and measures what it opened, which is right for a modal hanging off a screen
 * — but a flow whose second state is three clicks deep is invisible to it, and
 * a flow whose first control ADVANCES rather than opens (a pack tear, a reveal)
 * gets measured on the state the player passes through in half a second rather
 * than the one they stop on.
 *
 * The prelude runs before the control count is settled, so the sweep that
 * follows treats the post-prelude state as the screen: every control on it is
 * clicked one at a time, on a fresh load that replays the prelude first.
 */
const PRELUDE: Record<string, string[]> = {
  'pack@reveal': ['JUST TEAR IT OPEN FOR ME'],
  'pack@summary': ['JUST TEAR IT OPEN FOR ME', 'REVEAL ALL'],
};

/** The `?screen=` value for an entry — `pack@reveal` mounts plain `pack`. */
const screenQuery = (entry: string) => entry.split('@')[0];

/**
 * v20: a full sweep is ~50 minutes, and confirming ONE fix on ONE screen used
 * to cost all of it — so a fix landed mid-pass was either re-measured at that
 * price or, in practice, not re-measured at all. `ONLY` narrows the run to the
 * screens whose entry contains any of a comma-separated list of substrings:
 *
 *   ONLY=shops npm run audit:screens
 *   ONLY=market,battlepass npm run audit:screens
 *
 * An unmatched filter exits non-zero rather than running clean over nothing —
 * "0 problems" out of a run that measured nothing is the exact failure mode
 * the rest of this file exists to avoid.
 */
const ONLY = (process.env.ONLY ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const SCREENS = ONLY.length
  ? ALL_SCREENS.filter((s) => ONLY.some((f) => s.includes(f)))
  : ALL_SCREENS;
if (ONLY.length && SCREENS.length === 0) {
  console.error(`ONLY=${process.env.ONLY} matched no screen. Known: ${ALL_SCREENS.join(', ')}`);
  process.exit(2);
}

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
 * Two consecutive equal samples, or the cap, whichever comes first — and then
 * the LARGEST count seen across the whole window, not the one that happened to
 * repeat. The stability rule alone still under-reports a grid that renders
 * progressively: Collection paints ~1,000 card tiles in chunks, and two
 * consecutive samples landing inside the same chunk look exactly like a
 * settled screen. That is not a hypothetical — under load it read 10 for a
 * screen the load pass had just measured at 974, and the sweep stopped after
 * ten clicks while still printing a clean pass. A count can only be too LOW
 * here (a control does not un-render), so the max is the honest read.
 */
async function settledControlCount(page: import('playwright').Page): Promise<number> {
  let last = -1;
  let best = 0;
  for (let i = 0; i < 12; i++) {
    const n = await page
      .$$(CONTROLS)
      .then((c) => c.length)
      .catch(() => 0);
    best = Math.max(best, n);
    if (n === last && n > 0) return best;
    last = n;
    await page.waitForTimeout(250);
  }
  return best;
}

/**
 * Load `screen` at `width`, walk the click `path` (a list of control indices,
 * each re-read from the DOM the previous click left behind), then run the three
 * checks on the resulting state.
 *
 * `count` is the settled control count BEFORE any click — the depth-one sweep's
 * stop condition. `after` is the count once the path has been walked; a path
 * whose last click changed it is one that opened (or closed) something, which
 * is how the depth-two sweep decides where it is worth descending.
 */
async function check(screen: string, width: number, path: number[] = []) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(`${BASE}?screen=${screenQuery(screen)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  await page.waitForTimeout(700);
  // Walk this entry's prelude (if any) into the state being measured. Clicked
  // by LABEL rather than index because a prelude has to survive the screen it
  // opens on gaining or losing a control; a wrong index would silently measure
  // some other state and still print a clean pass.
  for (const label of PRELUDE[screen] ?? []) {
    const target = page.locator(`${CONTROLS}`, { hasText: label }).first();
    await target.click({ timeout: 4000 }).catch(() => undefined);
    await page.waitForTimeout(450);
  }
  const settled = await settledControlCount(page);

  const labels: string[] = [];
  for (let step = 0; step < path.length; step++) {
    const clickIndex = path[step];
    // The first hop is bounded on the SETTLED count, not on a fresh query —
    // see settledControlCount. Later hops read whatever the previous click
    // left on screen, so the live query is the only bound available.
    if (step === 0 && clickIndex >= settled) {
      await ctx.close();
      return { done: true, count: settled, after: settled };
    }
    // Re-query rather than trust one read: the settle above says the screen
    // HAS this many controls, so a live query that comes back short is the
    // same progressive-render race, not the end of the list.
    let controls = await page.$$(CONTROLS).catch(() => []);
    for (
      let retry = 0;
      retry < 3 && clickIndex >= controls.length && clickIndex < settled;
      retry++
    ) {
      await page.waitForTimeout(400);
      controls = await page.$$(CONTROLS).catch(() => []);
    }
    if (clickIndex >= controls.length) {
      await ctx.close();
      return { done: true, count: settled, after: controls.length };
    }
    labels.push((await controls[clickIndex].innerText().catch(() => '')).slice(0, 24).trim());
    // A click that navigates, detaches the node or opens a native dialog is not
    // itself a finding — the checks below still run on whatever state results.
    await controls[clickIndex].click({ timeout: 2000 }).catch(() => undefined);
    await page.waitForTimeout(200);
  }

  const where =
    path.length === 0
      ? screen
      : `${screen}[${path.map((n, i) => `#${n} "${labels[i]}"`).join(' → ')}]`;

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

  // A white screen is the most serious thing this harness reports, and it used
  // to be the least trustworthy: `.catch(() => '')` turned a read that FAILED
  // into a body of length 0, which is exactly what a crashed render looks like.
  // A Vite HMR reload landing between the click and the read (edit a source
  // file while the sweep runs and every open preview page reloads) therefore
  // reported two screens as blank that were both perfectly fine. Re-read
  // before believing it, and say plainly when it was the read that failed.
  let bodyText = '';
  let readError = '';
  for (let attempt = 0; attempt < 3; attempt++) {
    const r = await page.innerText('body').then(
      (s) => ({ text: s.trim(), err: '' }),
      (e: Error) => ({ text: '', err: e.message.split('\n')[0].slice(0, 120) }),
    );
    bodyText = r.text;
    readError = r.err;
    if (bodyText.length >= 10) break;
    await page.waitForTimeout(500);
  }
  if (bodyText.length < 10) {
    problems.push({
      where,
      width,
      kind: 'blank',
      detail: readError
        ? `could not read the body after 3 tries: ${readError}`
        : `body text length ${bodyText.length}`,
    });
  }

  const after =
    path.length === 0
      ? settled
      : await page.$$(CONTROLS).then(
          (c) => c.length,
          () => 0,
        );

  await ctx.close();
  return { done: false, count: settled, after };
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
    /** First clicks that revealed controls — the parents worth descending into. */
    const openers: { index: number; after: number }[] = [];
    while (i <= CLICK_CAP) {
      const r = await check(screen, 375, [i]);
      if (r.done) break;
      // Only descend where the click ADDED controls. A click that removes them
      // (a filter narrowing a grid, a tab closing a panel) reveals nothing new,
      // and a click that leaves the count alone re-offers the same controls the
      // depth-one sweep is already walking one at a time.
      if (r.after > r.count) openers.push({ index: i, after: r.after });
      i += 1;
    }
    console.log(`${screen}: clicked ${i} control(s), ${openers.length} opened a panel`);

    if (DEPTH < 2) continue;
    let pairs = 0;
    for (const parent of openers) {
      if (pairs >= PAIR_CAP) break;
      // Walk the controls the parent click revealed, newest first: a modal
      // mounts at the end of the DOM, so the tail of the list is the panel
      // itself rather than the screen still sitting behind it.
      const from = Math.max(0, parent.after - CHILD_CAP);
      for (let j = parent.after - 1; j >= from && pairs < PAIR_CAP; j--) {
        const r = await check(screen, 375, [parent.index, j]);
        pairs += 1;
        if (r.done) break;
      }
    }
    if (pairs > 0) console.log(`${screen}: + ${pairs} second-level click(s)`);
  }
}

await browser.close();

console.log(`\n=== ${problems.length} problem(s) ===`);
for (const p of problems) console.log(`${p.where} @${p.width} [${p.kind}] ${p.detail}`);
process.exit(problems.length > 0 ? 1 : 0);
