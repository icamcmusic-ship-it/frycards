/**
 * Poker table UI driver.
 *
 * Replaces `drive:match`, which drove the retired MTG board. The poker
 * engine has its own invariant gate (`sim:poker --invariants`), but that
 * never touches the table component — the timers that drive the bots, the
 * cast dialog, the response-window and choice prompts, the bust → spectate →
 * result flow and the phone layout all live in `PokerTable.tsx`, and a bug in
 * any of them strands a real player with a table that will not move. So this
 * plays whole matches through the UI, the way a person would: real clicks on
 * CHECK / CALL / RAISE (and the F / C / R hotkeys), the raise slider and its
 * pot presets, casting powers through the cast dialog (targets and second
 * costs), Leader abilities, the Dealer's Choice peek, PASS on a response
 * window, hole-card choice prompts, and after a bust SKIP TO RESULT — then
 * REMATCH from the game-over overlay.
 *
 * Every scenario mounts `table-preview.html` (the offline harness, so no
 * network is needed) at instant bot speed and plays to the game-over overlay.
 * A run FAILS (exit 1) on:
 *
 *  - a page error, or a console error that is not merely a failed network
 *    call (card art is fetched from a CDN the harness may not reach);
 *  - a stuck table: the match is waiting on the human (the table root's
 *    `data-human-decision`) but no control for that decision is on screen,
 *    or nothing on the page has changed for STUCK_SECS;
 *  - an illegal action surfacing as the table's red notice;
 *  - horizontal overflow (`documentElement.scrollWidth > innerWidth`);
 *  - not reaching the game-over overlay within the scenario's time budget.
 *
 * Run against the Vite dev server, like the other harnesses:
 *
 *   npm run dev &
 *   npm run drive:table
 *
 * Env: AUDIT_BASE (default http://localhost:3000), PLAYWRIGHT_CHROMIUM to point
 * at a preinstalled browser binary, SCENARIO_SECS (default 150, per-scenario
 * budget), STUCK_SECS (default 20), ONLY=<substring> to run matching
 * scenarios, SHOTS=<dir> to save a screenshot of each failure and game over.
 * Total runtime is bounded by the scenario budgets (six scenarios; a typical
 * run is 4–6 minutes on a shared-CPU box).
 */
import { chromium, type Browser, type Page } from 'playwright';

const BASE = `${process.env.AUDIT_BASE ?? 'http://localhost:3000'}/table-preview.html`;
const SCENARIO_MS = Number(process.env.SCENARIO_SECS ?? 150) * 1000;
const STUCK_MS = Number(process.env.STUCK_SECS ?? 20) * 1000;
const ONLY = process.env.ONLY ?? '';
const SHOTS = process.env.SHOTS ?? '';
/** A control for the human's decision must appear within this long. */
const NO_CONTROL_MS = 4000;

interface Scenario {
  name: string;
  seats: number;
  seed: number;
  w: number;
  h: number;
  /** Matches to finish (the second one starts from REMATCH). */
  matches: number;
}

const DESKTOP = { w: 1280, h: 720 };
const PHONE = { w: 390, h: 844 };
const SCENARIOS: Scenario[] = [
  { name: '2 seats · desktop', seats: 2, seed: 7, ...DESKTOP, matches: 2 },
  { name: '3 seats · desktop', seats: 3, seed: 11, ...DESKTOP, matches: 2 },
  { name: '6 seats · desktop', seats: 6, seed: 3, ...DESKTOP, matches: 2 },
  { name: '2 seats · phone', seats: 2, seed: 4, ...PHONE, matches: 2 },
  { name: '3 seats · phone', seats: 3, seed: 5, ...PHONE, matches: 2 },
  { name: '6 seats · phone', seats: 6, seed: 7, ...PHONE, matches: 2 },
].filter((s) => s.name.includes(ONLY));

/** Network failures are expected offline (card art, the HMR socket). */
const NETWORK_NOISE =
  /Failed to load resource|net::ERR_|ERR_TUNNEL|ERR_CONNECTION|WebSocket connection|\[vite\]/;

type Coverage = Record<
  | 'check'
  | 'call'
  | 'raise'
  | 'hotkey'
  | 'slider'
  | 'fold'
  | 'cast'
  | 'leader'
  | 'peek'
  | 'pass'
  | 'choose'
  | 'skip'
  | 'rematch',
  number
>;

interface Outcome {
  scenario: Scenario;
  problems: string[];
  coverage: Coverage;
  results: string[];
  ms: number;
}

/** Deterministic driver choices per scenario. */
function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

async function shot(page: Page, name: string): Promise<void> {
  if (!SHOTS) return;
  await page
    .screenshot({ path: `${SHOTS}/${name.replace(/[^a-z0-9]+/gi, '-')}.png` })
    .catch(() => {});
}

/** One driver step: act on whatever the table is asking for. Returns a label
 * for what it did (or '' when there was nothing to do). */
async function step(page: Page, rand: () => number, cov: Coverage): Promise<string> {
  // Busted: spectate a moment, then skip.
  const skip = page.getByRole('button', { name: /SKIP TO RESULT/ });
  if ((await skip.count()) && (await skip.isVisible())) {
    await skip.click();
    cov.skip++;
    return 'skip';
  }

  // Cast dialog: pick a target, which cast, the second costs; then CAST.
  const dialog = page.locator('div[role="dialog"][aria-label^="Cast "]');
  if (await dialog.count()) {
    const group = (label: string) =>
      dialog.locator(`div:has(> div:text-matches("^${label}"))`).locator('button');
    const targets = group('TARGET');
    if (await targets.count())
      await targets.nth(Math.floor(rand() * (await targets.count()))).click();
    const which = group('WHICH CAST');
    if (await which.count()) await which.first().click();
    const costs = group('SECOND COST');
    const heading = dialog.locator('div:text-matches("^SECOND COST")');
    const need = (await heading.count())
      ? Number((await heading.innerText()).match(/pick (\d+)/)?.[1] ?? 0)
      : 0;
    const n = await costs.count();
    const from = Math.floor(rand() * Math.max(1, n));
    for (let k = 0; k < n && need > 0; k++) {
      if ((await heading.innerText()).includes(`(${need}/${need})`)) break;
      await costs.nth((from + k) % n).click();
    }
    const go = dialog.getByRole('button', { name: /^(CAST|USE LEADER)/ });
    if (await go.isEnabled()) {
      const leader = (await go.innerText()).startsWith('USE');
      await go.click();
      cov[leader ? 'leader' : 'cast']++;
      return leader ? 'leader' : 'cast';
    }
    await page.keyboard.press('Escape');
    return 'cast-abandoned';
  }

  // A hole-card choice (Windfall, Pineapple, Redraw, Exhume).
  const choice = page.locator('[data-coach="hole"] button[data-card]');
  if (await choice.count()) {
    await choice.nth(Math.floor(rand() * (await choice.count()))).click();
    cov.choose++;
    return 'choose';
  }

  // Response window: sometimes answer with a castable power, else PASS.
  const pass = page.getByRole('button', { name: 'PASS', exact: true });
  if (await pass.count()) {
    await pass.click();
    cov.pass++;
    return 'pass';
  }

  const fold = page.getByRole('button', { name: /^FOLD/ });
  if (!(await fold.count())) return '';

  const peek = page.locator('span:has-text("Dealer\'s Choice peek:") > button');
  if (await peek.count()) {
    await peek.first().click();
    cov.peek++;
    return 'peek';
  }
  const r = rand();
  // Powers and Leader abilities: open the dialog (handled next step).
  if (r < 0.22) {
    const leader = page.locator('[data-coach="leader"] button:not([disabled])', {
      hasText: 'LEADER',
    });
    const powers = page.locator('[data-coach="powers"] [role="button"]');
    if (rand() < 0.4 && (await leader.count())) {
      await leader.first().click();
      return 'open-leader';
    }
    const n = await powers.count();
    if (n) {
      await powers.nth(Math.floor(rand() * n)).click();
      await page.waitForTimeout(80);
      if (await page.locator('div[role="dialog"][aria-label^="Cast "]').count()) return 'open-cast';
      // Not castable: that opened the card inspector — close it.
      await page.keyboard.press('Escape');
      return 'inspect';
    }
  }
  const hotkey = rand() < 0.35;
  if (r < 0.3) {
    if (hotkey) await page.keyboard.press('f');
    else await fold.click();
    cov.fold++;
    if (hotkey) cov.hotkey++;
    return 'fold';
  }
  const raise = page.getByRole('button', { name: /^(RAISE|BET)/ });
  if (r > 0.62 && (await raise.count())) {
    const slider = page.locator('input[type=range]');
    if (await slider.count()) {
      if (rand() < 0.5) {
        const preset = ['½', '¾', 'POT'][Math.floor(rand() * 3)];
        await page.getByRole('button', { name: preset, exact: true }).click();
      } else {
        await slider.evaluate((el: HTMLInputElement, f: number) => {
          const v = Math.round((+el.min + (+el.max - +el.min) * f) / 10) * 10;
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
            el,
            String(v),
          );
          el.dispatchEvent(new Event('input', { bubbles: true }));
        }, rand());
      }
      cov.slider++;
    }
    if (hotkey) await page.keyboard.press('r');
    else await raise.click();
    cov.raise++;
    if (hotkey) cov.hotkey++;
    return 'raise';
  }
  const cc = page.getByRole('button', { name: /^(CHECK|CALL)/ });
  const label = await cc.innerText();
  if (hotkey) await page.keyboard.press('c');
  else await cc.click();
  cov[label.startsWith('CHECK') ? 'check' : 'call']++;
  if (hotkey) cov.hotkey++;
  return 'check-call';
}

async function runScenario(browser: Browser, sc: Scenario): Promise<Outcome> {
  const t0 = Date.now();
  const problems: string[] = [];
  const results: string[] = [];
  const cov: Coverage = {
    check: 0,
    call: 0,
    raise: 0,
    hotkey: 0,
    slider: 0,
    fold: 0,
    cast: 0,
    leader: 0,
    peek: 0,
    pass: 0,
    choose: 0,
    skip: 0,
    rematch: 0,
  };
  const ctx = await browser.newContext({ viewport: { width: sc.w, height: sc.h } });
  // The first-game coach is covered by its own tests; skip it here.
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('frycards_coach_done', '1');
    } catch {
      /* storage blocked */
    }
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(3000);
  const note = (p: string) => {
    if (!problems.includes(p)) problems.push(p);
  };
  page.on('pageerror', (e) => note(`page error: ${String(e).slice(0, 300)}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NETWORK_NOISE.test(m.text()))
      note(`console error: ${m.text().slice(0, 300)}`);
  });

  const rand = rng(sc.seed * 7919 + sc.seats);
  const url = `${BASE}?seats=${sc.seats}&mode=quick&seed=${sc.seed}&speed=instant`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="poker-table"]', { timeout: 20_000 });

  let finished = 0;
  let lastSig = '';
  let lastChange = Date.now();
  let owedSince = 0;
  let steps = 0;
  while (finished < sc.matches) {
    if (Date.now() - t0 > SCENARIO_MS) {
      note(`no game over within ${SCENARIO_MS / 1000}s (finished ${finished}/${sc.matches})`);
      await shot(page, `${sc.name}-timeout`);
      break;
    }
    if (problems.length > 0 && problems.some((p) => p.startsWith('page error'))) break;
    try {
      await page.waitForTimeout(60);
      const root = page.locator('[data-testid="poker-table"]');
      const waiting = (await root.getAttribute('data-waiting')) ?? '';
      const owed = (await root.getAttribute('data-human-decision')) === '1';
      const sig = `${waiting}|${(await page.innerText('body')).length}|${await page
        .locator('[data-testid="poker-table"]')
        .innerText()
        .then((t) => t.slice(0, 400))}`;
      if (sig !== lastSig) {
        lastSig = sig;
        lastChange = Date.now();
      } else if (Date.now() - lastChange > STUCK_MS) {
        note(`stuck: nothing changed for ${STUCK_MS / 1000}s (waiting on ${waiting})`);
        await shot(page, `${sc.name}-stuck`);
        break;
      }

      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      if (overflow > 0) note(`horizontal overflow: ${overflow}px`);

      const noticeText = await page
        .locator('[data-coach="actions"] > div[class*="bg-white"]')
        .allInnerTexts();
      for (const t of noticeText) note(`illegal action surfaced: ${t}`);

      const rematch = page.getByRole('button', { name: 'REMATCH' });
      if (await rematch.count()) {
        const title = await page.locator('h2').first().innerText();
        const rows = await page.locator('ol li').allInnerTexts();
        const youRow = rows.findIndex((r) => /\bYou\b/.test(r)) + 1;
        const m = title.match(/FINISHED (\d+)/);
        const place = /WIN THE TABLE/.test(title) ? 1 : m ? Number(m[1]) : NaN;
        if (place !== youRow) note(`game over says place ${place} but "You" is row ${youRow}`);
        results.push(`${title.trim()} after ${steps} steps`);
        await shot(page, `${sc.name}-game-over-${finished + 1}`);
        finished++;
        if (finished < sc.matches) {
          await rematch.click();
          cov.rematch++;
          await page.waitForTimeout(300);
        }
        continue;
      }

      const did = await step(page, rand, cov);
      steps++;
      if (did) owedSince = 0;
      else if (owed) {
        // The match waits on us but there is nothing to press.
        owedSince ||= Date.now();
        if (Date.now() - owedSince > NO_CONTROL_MS) {
          note(`human owed a decision (${waiting}) with no control on screen`);
          await shot(page, `${sc.name}-no-control`);
          break;
        }
      }
    } catch (e) {
      // A control that vanished between the read and the click (a bot acted
      // first, a timer fired): the next step re-reads the table.
      const msg = String(e).split('\n')[0];
      if (!/Timeout|detached|not attached|intercepts pointer/.test(msg)) note(`driver: ${msg}`);
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  await ctx.close();
  return { scenario: sc, problems, coverage: cov, results, ms: Date.now() - t0 };
}

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);
const outcomes: Outcome[] = [];
try {
  for (const sc of SCENARIOS) {
    const o = await runScenario(browser, sc);
    outcomes.push(o);
    const c = Object.entries(o.coverage)
      .filter(([, n]) => n > 0)
      .map(([k, n]) => `${k} ${n}`)
      .join(', ');
    console.log(
      `${o.problems.length ? 'FAIL' : 'ok  '} ${sc.name.padEnd(20)} ${(o.ms / 1000).toFixed(0).padStart(4)}s  ${o.results.join(' | ')}`,
    );
    console.log(`       ${c}`);
    for (const p of o.problems) console.log(`       ✗ ${p}`);
  }
} finally {
  await browser.close();
}

const failed = outcomes.filter((o) => o.problems.length > 0);
const total = outcomes.reduce(
  (acc, o) => {
    for (const [k, n] of Object.entries(o.coverage)) acc[k] = (acc[k] ?? 0) + n;
    return acc;
  },
  {} as Record<string, number>,
);
console.log(
  `\n${outcomes.length - failed.length}/${outcomes.length} scenarios clean · ` +
    Object.entries(total)
      .map(([k, n]) => `${k} ${n}`)
      .join(', '),
);
process.exit(failed.length > 0 || outcomes.length === 0 ? 1 : 0);
