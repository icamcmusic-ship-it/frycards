/**
 * Poker table button fuzzer.
 *
 * `drive:table` plays matches the way a sensible person would. This clicks
 * the way a curious (or careless) one does: every step it collects every
 * control that is enabled, visible and actually on top at its centre (so a
 * button under a modal backdrop is not "clickable"), and clicks one at random
 * — the action bar, the raise slider and presets, power cards, the cast
 * sheet's targets and costs, Leader abilities, pre-actions, CONCEDE and its
 * confirm, the top-bar toggles, table settings, the log, hand history, seat
 * popovers, keyword chips, GOT IT, SKIP, DEAL, REMATCH — plus the odd hotkey
 * (F / C / R / P / Esc / Tab / Enter). It runs a grid of table configs
 * (2, 3 and 6 seats; phone and desktop; forced Locations, no powers, weekly
 * mutators, manual deal, standard timers) over several seeds.
 *
 * A run FAILS (exit 1) on:
 *
 *  - an uncaught page error, or any console.error that is not merely a
 *    failed network call (card art is fetched from a CDN that may be blocked);
 *  - an error-boundary fallback on screen (`[data-error-boundary]`, or the
 *    app-level "Something broke");
 *  - a blank screen (the table root gone, or next to no text on the page);
 *  - a soft-lock: the match has not advanced (`data-seq` on the table root)
 *    for STALL_SECS while the human owes nothing (and the bots are not
 *    paused, nothing is waiting on a confirm, the game is not over) — or the
 *    human owes a decision but no control for it is on screen;
 *  - the chip total (`data-chips`) drifting from the deal (`data-chips-start`).
 *
 * A fuzzer that only clicks randomly can wander in the settings forever, so
 * when the match has not moved for STALL_SECS and the human does have a
 * control, the harness presses it (counted as "nudge"), resumes bots it
 * paused, and answers a confirm — none of those is a failure.
 *
 *   npm run dev -- --port=3100 &
 *   AUDIT_BASE=http://localhost:3100 npx tsx scripts/fuzz-table-buttons.ts
 *
 * Env: AUDIT_BASE (default http://localhost:3000), PLAYWRIGHT_CHROMIUM,
 * STEPS per run (default 220), SEEDS (default 2: seeds 1..SEEDS per config),
 * STALL_SECS (default 15), ONLY=<substring of a config name>, SHOTS=<dir> for
 * a screenshot of each failure.
 */
import { chromium, type Browser, type Page } from 'playwright';

const BASE = `${process.env.AUDIT_BASE ?? 'http://localhost:3000'}/table-preview.html`;
const STEPS = Number(process.env.STEPS ?? 220);
const SEEDS = Number(process.env.SEEDS ?? 2);
const STALL_MS = Number(process.env.STALL_SECS ?? 15) * 1000;
const ONLY = process.env.ONLY ?? '';
const SHOTS = process.env.SHOTS ?? '';

const DESKTOP = { w: 1280, h: 720 };
const PHONE = { w: 390, h: 844 };

interface Config {
  name: string;
  seats: number;
  vp: { w: number; h: number };
  /** Extra query string for table-preview.html. */
  q: string;
}

const CONFIGS: Config[] = [
  { name: '2p desktop', seats: 2, vp: DESKTOP, q: '' },
  { name: '2p phone', seats: 2, vp: PHONE, q: '' },
  { name: '3p desktop location', seats: 3, vp: DESKTOP, q: '&location=1' },
  { name: '3p phone location', seats: 3, vp: PHONE, q: '&location=1' },
  { name: '6p desktop', seats: 6, vp: DESKTOP, q: '' },
  { name: '6p phone mutators', seats: 6, vp: PHONE, q: '&mutators=deepStacks,bigHands' },
  { name: '2p desktop no-powers', seats: 2, vp: DESKTOP, q: '&powers=0' },
  { name: '3p phone no-powers', seats: 3, vp: PHONE, q: '&powers=0&location=1' },
  { name: '2p desktop manual-deal', seats: 2, vp: DESKTOP, q: '&autodeal=0' },
  { name: '3p phone timers', seats: 3, vp: PHONE, q: '&timers=standard&mutators=steadyNerve' },
].filter((c) => c.name.includes(ONLY));

/** Network failures are expected offline (card art, the HMR socket). */
const NETWORK_NOISE =
  /Failed to load resource|net::ERR_|ERR_TUNNEL|ERR_CONNECTION|WebSocket connection|\[vite\]/;

function rng(seed: number): () => number {
  let s = (seed * 2654435761) >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4294967296;
  };
}

interface Candidate {
  i: number;
  label: string;
  kind: 'click' | 'range' | 'check';
  /** In the action bar (FOLD / CHECK / CALL / RAISE / PASS / DEAL…). */
  action: boolean;
}

/** Tag every control a pointer could actually hit right now. */
async function candidates(page: Page): Promise<Candidate[]> {
  return page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll('[data-fz]')))
      el.removeAttribute('data-fz');
    const sel =
      'button:not([disabled]), [role="button"]:not([aria-disabled="true"]), input[type=range]:not([disabled]), input[type=checkbox]:not([disabled])';
    const out: Candidate[] = [];
    let i = 0;
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
      if (el.closest('[inert]')) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      const cx = Math.min(window.innerWidth - 1, Math.max(0, r.left + r.width / 2));
      const cy = Math.min(window.innerHeight - 1, Math.max(0, r.top + r.height / 2));
      if (r.bottom < 0 || r.top > window.innerHeight || r.right < 0 || r.left > window.innerWidth)
        continue;
      const hit = document.elementFromPoint(cx, cy);
      if (!hit || !(el === hit || el.contains(hit))) continue;
      const tag = String(i++);
      el.setAttribute('data-fz', tag);
      const input = el as HTMLInputElement;
      out.push({
        i: Number(tag),
        label: (
          el.getAttribute('aria-label') ||
          el.innerText ||
          el.getAttribute('title') ||
          el.tagName
        )
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 40),
        kind:
          el.tagName === 'INPUT'
            ? input.type === 'range'
              ? 'range'
              : 'check'
            : ('click' as const),
        action: !!el.closest('[data-coach="actions"]'),
      });
    }
    return out;
  });
}

interface TableState {
  present: boolean;
  seq: number;
  waiting: string;
  owed: boolean;
  paused: boolean;
  chips: number;
  chipsStart: number;
  textLen: number;
  boundary: boolean;
  confirm: boolean;
  userPaused: boolean;
  over: boolean;
}

async function readState(page: Page): Promise<TableState> {
  return page.evaluate(() => {
    const root = document.querySelector<HTMLElement>('[data-testid="poker-table"]');
    const d = root?.dataset ?? {};
    return {
      present: !!root,
      seq: Number(d.seq ?? -1),
      waiting: d.waiting ?? '',
      owed: d.humanDecision === '1',
      paused: d.paused === '1',
      chips: Number(d.chips ?? 0),
      chipsStart: Number(d.chipsStart ?? 0),
      textLen: document.body.innerText.trim().length,
      boundary:
        !!document.querySelector('[data-error-boundary]') ||
        document.body.innerText.includes('Something broke'),
      confirm: !!document.querySelector('[role="alertdialog"]'),
      userPaused: !!document.querySelector('button[aria-label="Resume the bots"]'),
      over: d.waiting === 'over',
    };
  });
}

/** The control that answers what the human owes, if one is on screen. */
async function progressControl(page: Page, st: TableState) {
  const pick = [
    page.getByRole('button', { name: /^GOT IT/ }),
    page.getByRole('button', { name: /^SKIP TO RESULT/ }),
    page.getByRole('button', { name: /^DEAL NEXT HAND/ }),
    page.getByRole('button', { name: 'PASS', exact: true }),
    page.locator('[data-coach="hole"] button[data-card]'),
    page.getByRole('button', { name: /^(CHECK|CALL)/ }),
    page.getByRole('button', { name: /^FOLD/ }),
  ];
  if (st.over) pick.unshift(page.getByRole('button', { name: 'REMATCH' }));
  for (const l of pick) {
    const n = await l.count();
    for (let k = 0; k < n; k++) {
      const el = l.nth(k);
      if ((await el.isVisible()) && (await el.isEnabled())) return el;
    }
  }
  return null;
}

interface RunResult {
  name: string;
  seed: number;
  problems: string[];
  steps: number;
  games: number;
  hands: number;
  clicks: Map<string, number>;
  nudges: number;
  ms: number;
}

async function run(browser: Browser, cfg: Config, seed: number): Promise<RunResult> {
  const t0 = Date.now();
  const problems: string[] = [];
  const note = (p: string) => {
    if (!problems.includes(p)) problems.push(p);
  };
  const clicks = new Map<string, number>();
  const ctx = await browser.newContext({
    viewport: { width: cfg.vp.w, height: cfg.vp.h },
    hasTouch: cfg.vp === PHONE,
  });
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('frycards_coach_done', '1');
    } catch {
      /* storage blocked */
    }
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(1500);
  page.on('pageerror', (e) => note(`page error: ${String(e).slice(0, 300)}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !NETWORK_NOISE.test(m.text()))
      note(`console error: ${m.text().slice(0, 300)}`);
  });
  page.on('dialog', (d) => void d.dismiss());
  const url = `${BASE}?seats=${cfg.seats}&mode=quick&seed=${seed}&speed=instant${cfg.q}`;
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-testid="poker-table"]', { timeout: 20_000 });
  const rand = rng(seed * 7919 + cfg.seats * 31 + cfg.q.length);

  let lastSeq = -1;
  let lastMove = Date.now();
  let games = 1;
  let hands = 0;
  let nudges = 0;
  let prevStart = -1;
  let step = 0;
  const shot = async (why: string) => {
    if (!SHOTS) return;
    await page
      .screenshot({
        path: `${SHOTS}/fuzz-${cfg.name.replace(/[^a-z0-9]+/gi, '-')}-s${seed}-${why}.png`,
      })
      .catch(() => {});
  };
  for (; step < STEPS; step++) {
    if (problems.some((p) => p.startsWith('page error'))) break;
    const st = await readState(page);
    if (st.boundary) {
      note('error boundary fallback on screen');
      await shot('boundary');
      break;
    }
    if (!st.present || st.textLen < 20) {
      note(`blank screen (table ${st.present ? 'present' : 'gone'}, ${st.textLen} chars)`);
      await shot('blank');
      break;
    }
    if (st.chipsStart !== prevStart) {
      // A new table (REMATCH / MENU remount the preview).
      if (prevStart !== -1) games++;
      prevStart = st.chipsStart;
    }
    if (st.chips !== st.chipsStart) {
      note(`chips not conserved: ${st.chips} in play, dealt ${st.chipsStart} (${st.waiting})`);
      await shot('chips');
      break;
    }
    if (st.seq !== lastSeq) {
      if (st.waiting === 'start') hands++;
      lastSeq = st.seq;
      lastMove = Date.now();
    } else if (Date.now() - lastMove > STALL_MS) {
      // Not moving. Is that the table's fault, or the fuzzer's? Close any
      // sheet / inspector / log the fuzzer left over the controls first.
      lastMove = Date.now();
      // (Esc also passes a response window — re-read before judging.)
      if (!st.confirm) for (let k = 0; k < 3; k++) await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      if ((await readState(page)).seq !== st.seq) continue;
      try {
        if (st.confirm) {
          await page.getByRole('alertdialog').getByRole('button').first().click();
          nudges++;
        } else if (st.userPaused) {
          await page.getByRole('button', { name: 'Resume the bots' }).click();
          nudges++;
        } else {
          const ctl = await progressControl(page, st);
          if (ctl) {
            await ctl.click({ timeout: 1500 });
            nudges++;
          } else if (st.owed || st.over || !st.paused) {
            note(
              `soft-lock: no progress for ${STALL_MS / 1000}s (waiting ${st.waiting}, ` +
                `owed ${st.owed}, paused ${st.paused}) and no control to answer it`,
            );
            await shot('softlock');
            break;
          }
        }
      } catch (e) {
        note(`nudge failed (a control is covered or unclickable): ${String(e).split('\n')[0]}`);
        await shot('nudge');
      }
    }

    try {
      const r = rand();
      if (r < 0.08) {
        const keys = ['f', 'c', 'r', 'p', 'Escape', 'Escape', 'Tab', 'Enter', ' '];
        const key = keys[Math.floor(rand() * keys.length)];
        await page.keyboard.press(key);
        clicks.set(`key:${key}`, (clicks.get(`key:${key}`) ?? 0) + 1);
      } else {
        const cands = await candidates(page);
        if (cands.length === 0) {
          await page.waitForTimeout(100);
          continue;
        }
        const acts = cands.filter((c) => c.action);
        // Half the time, while the match waits on us, act — or nothing ends.
        const pool = st.owed && acts.length && rand() < 0.5 ? acts : cands;
        const c = pool[Math.floor(rand() * pool.length)];
        const el = page.locator(`[data-fz="${c.i}"]`);
        if (c.kind === 'range') {
          await el.evaluate((node: HTMLInputElement, f: number) => {
            const v = Math.round(+node.min + (+node.max - +node.min) * f);
            Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
              node,
              String(v),
            );
            node.dispatchEvent(new Event('input', { bubbles: true }));
          }, rand());
        } else if (rand() < 0.04) {
          // A right-click or long-press must not open a second layer.
          await el.click({ button: 'right' });
        } else {
          await el.click({ timeout: 1500 });
        }
        const key = c.label.replace(/[◎\d]+/g, '#');
        clicks.set(key, (clicks.get(key) ?? 0) + 1);
        // Exactly one modal dialog on screen, ever (the card sheet, the
        // inspector, history and the confirm never stack).
        const modals = await page.locator('[aria-modal="true"]').count();
        if (modals > 1) {
          note(`${modals} modal dialogs open at once after clicking "${c.label}"`);
          await shot('stacked');
        }
      }
      await page.waitForTimeout(30 + Math.floor(rand() * 90));
    } catch (e) {
      // A control that went away between the read and the click.
      const msg = String(e).split('\n')[0];
      if (!/Timeout|detached|not attached|intercepts pointer|not visible|not stable/.test(msg))
        note(`driver: ${msg}`);
    }
  }
  if (problems.length) await shot('end');
  await ctx.close();
  return {
    name: cfg.name,
    seed,
    problems,
    steps: step,
    games,
    hands,
    clicks,
    nudges,
    ms: Date.now() - t0,
  };
}

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);
const results: RunResult[] = [];
const allClicks = new Map<string, number>();
try {
  for (const cfg of CONFIGS)
    for (let seed = 1; seed <= SEEDS; seed++) {
      const r = await run(browser, cfg, seed);
      results.push(r);
      for (const [k, n] of r.clicks) allClicks.set(k, (allClicks.get(k) ?? 0) + n);
      console.log(
        `${r.problems.length ? 'FAIL' : 'ok  '} ${cfg.name.padEnd(24)} seed ${seed}  ` +
          `${r.steps} steps · ${r.games} game(s) · ${r.hands} deals · ${r.nudges} nudges · ` +
          `${(r.ms / 1000).toFixed(0)}s`,
      );
      for (const p of r.problems) console.log(`       ✗ ${p}`);
    }
} finally {
  await browser.close();
}
const failed = results.filter((r) => r.problems.length);
const top = [...allClicks.entries()].sort((a, b) => b[1] - a[1]);
console.log(`\n${top.length} distinct controls / keys exercised:`);
console.log(
  top
    .slice(0, 60)
    .map(([k, n]) => `${k} ×${n}`)
    .join(' · '),
);
console.log(
  `\n${results.length - failed.length}/${results.length} runs clean · ` +
    `${results.reduce((a, r) => a + r.steps, 0)} steps`,
);
process.exit(failed.length || results.length === 0 ? 1 : 0);
