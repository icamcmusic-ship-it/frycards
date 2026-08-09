/**
 * Interactive match stress driver.
 *
 * The balance harness (`scripts/simulate-v5.ts`) plays tens of thousands of
 * CPU-vs-CPU games straight through the engine — it never touches the match
 * UI, so every bug that lives in the React seam between a click and an engine
 * call is invisible to it. v17 found five of those by reading; this plays them
 * instead: a real browser drives `board-preview.html` through whole matches,
 * taking every action the board offers, and reports crashes, dead ends and
 * layout overflow.
 *
 * What counts as a finding:
 *  - `pageerror` / console error (a React crash white-screens the match)
 *  - a HANG: the board's state signature stops moving while no action is
 *    offered — the interactive equivalent of an infinite loop
 *  - horizontal overflow at phone width (a control pushed off the screen)
 *  - a match that never reaches a winner inside the step budget
 *  - a STALE-RING: a CPU actor/target highlight still pulsing on the board
 *    when no narration is running (v19 — see below)
 *  - a NARRATION stall: a beat counter that stops advancing, or a run that
 *    never ends on its own (v19)
 *
 * v19 — the driver used to click `SKIP ▸▸` the instant it appeared, on every
 * match. That is the one control that turns the CPU's whole turn OFF, so the
 * entire narration path — the beat chain, the actor/target rings, the
 * mid-board card spotlight, the attack lunge, everything the player watches to
 * know what the opponent is doing — was never once exercised by the harness
 * that exists to exercise the match UI. Half the matches now WATCH instead:
 * they let the narration play to its own end and check that it advances, that
 * it terminates, and that it takes its rings down with it when it does.
 *
 * Run against the Vite dev server, like the other audit scripts:
 *
 *   npm run dev &
 *   npm run drive:match
 *
 * Env: AUDIT_BASE (default http://localhost:3000), MATCHES (default 6),
 * WIDTH (default 1280; the phone sweep runs at 390 automatically for the
 * first two matches), STEPS (default 1200 per match), SEED0 (default 1),
 * WATCH_EVERY (default 2 — every Nth match watches the narration instead of
 * skipping it; 0 disables watching, 1 watches every match),
 * PLAYWRIGHT_CHROMIUM to point at a preinstalled browser binary.
 *
 * Exits non-zero on any finding, so it can gate a release.
 */
import { chromium, Page } from 'playwright';

const BASE = `${process.env.AUDIT_BASE ?? 'http://localhost:3000'}/board-preview.html`;
const MATCHES = Number(process.env.MATCHES ?? 6);
const STEPS = Number(process.env.STEPS ?? 1200);
const SEED0 = Number(process.env.SEED0 ?? 1);
const WIDE = Number(process.env.WIDTH ?? 1280);
const PHONE = 390;
const WATCH_EVERY = Number(process.env.WATCH_EVERY ?? 2);

interface Finding {
  match: number;
  seed: number;
  width: number;
  kind: 'pageerror' | 'console' | 'hang' | 'overflow' | 'unfinished' | 'stale-ring' | 'narration';
  detail: string;
}

const findings: Finding[] = [];

/** Console noise the offline harness cannot avoid (no Supabase, no card CDN). */
const NOISE = /Failed to load resource|net::ERR|ERR_TUNNEL|ERR_PROXY|Failed to fetch|WebSocket/i;

interface BoardRead {
  buttons: { text: string; disabled: boolean }[];
  rings: { red: boolean; yellow: boolean; blue: boolean }[];
  handCards: number;
  bodyText: string;
  header: string;
  scrollWidth: number;
  innerWidth: number;
  /** `"3/11"` while a CPU narration beat is on screen, `''` otherwise — the
   * progress counter the bubble prints. Watch mode uses it as the liveness
   * signal: a run whose counter stops moving has stalled. */
  beat: string;
  /** Elements currently carrying the pulsing CPU actor / target highlight. */
  cpuRings: number;
}

/**
 * Everything the board can be showing, read in one round trip.
 *
 * Passed as a source STRING, not a closure: tsx compiles this file with
 * esbuild's keep-names on, which rewrites in-page arrow functions to call a
 * `__name` helper that does not exist inside the browser (`ReferenceError:
 * __name is not defined` on the first evaluate).
 */
const READ_BOARD = `(() => {
  var txt = function (el) { return (el && el.textContent ? el.textContent : '').replace(/\\s+/g, ' ').trim(); };
  var buttons = Array.prototype.slice
    .call(document.querySelectorAll('button, [role="button"]'))
    .map(function (el) {
      return { text: txt(el), disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true' };
    });
  var rings = Array.prototype.slice
    .call(document.querySelectorAll('[class*="ring-4"]'))
    .map(function (el) {
      var c = String(el.className);
      return {
        red: c.indexOf('ring-[var(--c-red)]') >= 0,
        yellow: c.indexOf('ring-[var(--c-yellow)]') >= 0,
        blue: c.indexOf('ring-[#29B6F6]') >= 0,
      };
    });
  var turn = txt(document.querySelector('[aria-label="Concede match"]') ? document.querySelector('[aria-label="Concede match"]').nextElementSibling : null);
  var body = String(document.body.innerText || '').replace(/\\s+/g, ' ').trim();
  // Read off the rendered counter rather than a DOM hook: the narration bubble
  // prints "4/11 · click ▸▸", which is the same string a player reads. Matched
  // case-INSENSITIVELY: innerText reflects CSS text-transform, and the bubble
  // is uppercased, so the literal on screen is "· CLICK ▸▸".
  var m = /(\\d+\\/\\d+) · click/i.exec(body);
  return {
    buttons: buttons,
    rings: rings,
    handCards: document.querySelectorAll('[aria-label$="— preview and invoke"]').length,
    // innerText, not textContent: the match screen carries its keyframes in
    // an inline <style>, and textContent returns all of that CSS ahead of any
    // real board text — every substring probe below was reading stylesheet.
    bodyText: body,
    header: turn,
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
    beat: m ? m[1] : '',
    cpuRings: document.querySelectorAll('.gv4-cpu-actor, .gv4-cpu-target').length,
  };
})()`;

/** An in-page evaluate that survives the page going away underneath it —
 * a Vite HMR reload mid-run used to abort the whole script. */
async function evalSafe<T>(page: Page, expr: string, fallback: T): Promise<T> {
  try {
    return (await page.evaluate(expr)) as T;
  } catch {
    return fallback;
  }
}

const EMPTY_BOARD: BoardRead = {
  buttons: [],
  rings: [],
  handCards: 0,
  bodyText: '',
  header: '',
  scrollWidth: 0,
  innerWidth: 1,
  beat: '',
  cpuRings: 0,
};

async function readBoard(page: Page): Promise<BoardRead> {
  return evalSafe<BoardRead>(page, READ_BOARD, EMPTY_BOARD);
}

const has = (b: { text: string; disabled: boolean }[], needle: string) =>
  b.some((x) => !x.disabled && x.text.includes(needle));

/**
 * Click by visible text, in the page.
 *
 * Playwright locators were the obvious choice and made a step cost seconds:
 * every miss burns the whole action timeout, and the driver misses often by
 * design (it probes for controls that may not be there). An in-page click is
 * a single round trip that returns false immediately.
 */
async function clickText(page: Page, needle: string): Promise<boolean> {
  return evalSafe(
    page,
    `(() => {
      var want = ${JSON.stringify(needle)};
      var els = Array.prototype.slice.call(document.querySelectorAll('button, [role="button"]'));
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.disabled === true || el.getAttribute('aria-disabled') === 'true') continue;
        var t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
        if (t.indexOf(want) >= 0) { el.click(); return true; }
      }
      return false;
    })()`,
    false,
  );
}

/** Click by CSS selector, nth match. */
async function clickSelector(page: Page, selector: string, idx = 0): Promise<boolean> {
  return evalSafe(
    page,
    `(() => {
      var els = document.querySelectorAll(${JSON.stringify(selector)});
      var el = els[${idx}];
      if (!el) return false;
      el.click();
      return true;
    })()`,
    false,
  );
}

/** Click the n'th element carrying a ring of the given color. Same string-body
 * rule as READ_BOARD above (esbuild keep-names). */
async function clickRing(page: Page, which: 'red' | 'yellow' | 'blue', idx = 0): Promise<boolean> {
  const cls =
    which === 'red'
      ? 'ring-[var(--c-red)]'
      : which === 'yellow'
        ? 'ring-[var(--c-yellow)]'
        : 'ring-[#29B6F6]';
  return evalSafe(
    page,
    `(() => {
      var els = Array.prototype.slice
        .call(document.querySelectorAll('[class*="ring-4"]'))
        .filter(function (el) { return String(el.className).indexOf(${JSON.stringify(cls)}) >= 0; });
      var el = els[${idx}];
      if (!el) return false;
      // The ring sits on a wrapper whose CardFace child owns the handler.
      var inner = el.querySelector('[role="button"], button');
      (inner || el).click();
      return true;
    })()`,
    false,
  );
}

/** Open a hand card's preview and invoke it if the preview allows. */
async function tryInvokeHand(page: Page, idx: number): Promise<boolean> {
  const opened = await evalSafe(
    page,
    `(() => {
      var cards = document.querySelectorAll('[aria-label$="— preview and invoke"]');
      if (cards.length === 0) return false;
      cards[${idx} % cards.length].click();
      return true;
    })()`,
    false,
  );
  if (!opened) return false;
  await page.waitForTimeout(60);
  const invoked = await evalSafe(
    page,
    `(() => {
      var els = Array.prototype.slice.call(document.querySelectorAll('button'));
      for (var i = 0; i < els.length; i++) {
        var t = (els[i].textContent || '').replace(/\\s+/g, ' ').trim();
        if (t.indexOf('INVOKE') === 0 && !els[i].disabled) { els[i].click(); return true; }
      }
      return false;
    })()`,
    false,
  );
  if (!invoked) await clickText(page, '✕ CLOSE');
  return !!invoked;
}

async function driveMatch(
  browser: import('playwright').Browser,
  match: number,
  seed: number,
  width: number,
  /** Let the CPU's narration play out instead of clicking SKIP through it. */
  watch: boolean,
) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error' && !NOISE.test(m.text())) errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  // FAST narration: a skipping driver clicks SKIP anyway, but a stalled skip
  // should not be papered over by a slow timer — and a WATCHING one has to
  // sit through every beat in real time, so it wants the short beat too.
  page.setDefaultTimeout(1000);
  await page.goto(`${BASE}?seed=${seed}&speed=2`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  await page.waitForTimeout(900);

  let lastSig = '';
  let stuckFor = 0;
  let finished = false;
  let overflowReported = false;
  let staleRingReported = false;
  let narrationReported = false;
  /** Consecutive reads showing the same narration beat, in watch mode. */
  let sameBeatFor = 0;
  let lastBeat = '';
  let beatsWatched = 0;
  let rng = seed >>> 0;
  const rand = () => (rng = (rng * 1664525 + 1013904223) >>> 0) / 0x100000000;

  for (let step = 0; step < STEPS && !finished; step++) {
    const b = await readBoard(page);
    const narrating = b.beat !== '' || has(b.buttons, 'SKIP ▸▸');

    // The CPU actor/target highlights are the "what is the opponent doing"
    // signal. They belong to the beat on screen and nothing else, so one still
    // pulsing with no narration running is a highlight the player will read as
    // live while the board waits on THEM.
    if (!staleRingReported && !narrating && b.cpuRings > 0) {
      findings.push({
        match,
        seed,
        width,
        kind: 'stale-ring',
        detail: `${b.cpuRings} CPU actor/target ring(s) still on the board with no narration running, at step ${step} (${b.header})`,
      });
      staleRingReported = true;
    }

    if (!overflowReported && b.scrollWidth > b.innerWidth + 1) {
      findings.push({
        match,
        seed,
        width,
        kind: 'overflow',
        detail: `scrollWidth ${b.scrollWidth} > innerWidth ${b.innerWidth} at step ${step}`,
      });
      overflowReported = true;
    }

    // `beat` is part of the signature so a narration advancing normally can
    // never read as a frozen board — its own text is inside bodyText, but two
    // consecutive beats can happen to be the same length.
    const sig = `${b.header}|${b.handCards}|${b.buttons.length}|${b.bodyText.length}|${b.beat}`;
    if (sig === lastSig) stuckFor++;
    else stuckFor = 0;
    lastSig = sig;
    if (stuckFor > 90) {
      findings.push({
        match,
        seed,
        width,
        kind: 'hang',
        detail: `board stopped moving for 90 steps at step ${step}. Buttons: ${b.buttons
          .filter((x) => !x.disabled)
          .map((x) => x.text)
          .join(' | ')
          .slice(0, 300)}`,
      });
      break;
    }

    const B = b.buttons;
    if (process.env.DEBUG_STEPS)
      console.log(
        `  step ${step}: ${b.header} | ${B.filter((x) => !x.disabled)
          .map((x) => x.text.slice(0, 18))
          .join(',')
          .slice(0, 200)}`,
      );
    if (process.env.DEBUG_BODY && step >= Number(process.env.DEBUG_BODY))
      console.log(`  BODY@${step}: ${b.bodyText.slice(0, 1200)}`);

    // 1. Match over.
    if (has(B, 'BACK TO MENU')) {
      finished = true;
      break;
    }
    // 2. Opening hand.
    if (has(B, 'KEEP THIS HAND')) {
      if (rand() < 0.3 && has(B, 'MULLIGAN — draw')) await clickText(page, 'MULLIGAN — draw');
      else await clickText(page, 'KEEP THIS HAND');
      continue;
    }
    // 3. Shed picker (pre-pick or the mid-Dusk forced one).
    if (has(B, 'SHED & END TURN') || b.bodyText.includes('SHED TO')) {
      await clickText(page, 'SUGGEST');
      if (!(await clickText(page, 'SHED & END TURN'))) await clickText(page, 'BACK');
      continue;
    }
    // 4. Confirm dialog (only the driver's own stray concede click can raise one).
    if (has(B, 'CANCEL') && has(B, 'CONFIRM') && b.bodyText.includes('Concede this match')) {
      await clickText(page, 'CANCEL');
      continue;
    }
    // 5. A targeting pick is open — take a legal target, or cancel it.
    if (b.bodyText.includes('PICK A TARGET') || b.bodyText.includes('BOND — pick')) {
      const reds = b.rings.filter((r) => r.red).length;
      if (reds > 0 && (await clickRing(page, 'red', Math.floor(rand() * reds)))) continue;
      // By aria-label, never by the "✕" glyph: the first ✕ in the DOM is the
      // top bar's ✕ CONCEDE, so a text match here resigned the match and every
      // run reported a turn-5 DEFEAT that the board never actually played.
      await clickSelector(page, '[aria-label="Cancel targeting"]');
      continue;
    }
    // 6. Guard step. Mostly played WELL (suggest + confirm) so matches reach
    //    the late-game states — a driver that never blocks dies on turn 5 and
    //    never opens a response window, a shed picker or a full board.
    if (has(B, 'CONFIRM GUARDS') || B.some((x) => x.text.includes('NO GUARDS — TAKE'))) {
      const reds = b.rings.filter((r) => r.red).length;
      if (rand() < 0.6 && (await clickText(page, '✦ SUGGEST'))) continue;
      if (reds > 0 && rand() < 0.5) {
        await clickRing(page, 'red', Math.floor(rand() * reds));
        continue;
      }
      if (!(await clickText(page, 'CONFIRM GUARDS'))) await clickText(page, 'NO GUARDS — TAKE');
      continue;
    }
    // 7. Response window: answer with a live card sometimes, else pass.
    if (has(B, 'PASS — LET IT RESOLVE')) {
      if (rand() < 0.4 && (await tryInvokeHand(page, Math.floor(rand() * 8)))) continue;
      await clickText(page, 'PASS — LET IT RESOLVE');
      continue;
    }
    // 8. Clash resolution / declaration.
    if (has(B, 'RESOLVE CLASH')) {
      // The attacker's own reaction window is real play — use it sometimes.
      if (rand() < 0.35 && (await tryInvokeHand(page, Math.floor(rand() * 8)))) continue;
      await clickText(page, 'RESOLVE CLASH');
      continue;
    }
    if (B.some((x) => x.text.includes('DECLARE ATTACK'))) {
      if (rand() < 0.5 && (await clickText(page, 'ALL ×'))) continue;
      await clickText(page, 'DECLARE ATTACK');
      continue;
    }
    // 9. CPU narration.
    if (narrating) {
      if (watch) {
        // Sit through it, exactly as a player would. The only thing the driver
        // does here is check that the run is alive: the counter advances, and
        // eventually the whole thing takes itself down.
        if (b.beat !== '' && b.beat === lastBeat) sameBeatFor++;
        else {
          if (b.beat !== '') beatsWatched++;
          sameBeatFor = 0;
        }
        lastBeat = b.beat;
        if (!narrationReported && sameBeatFor > 60) {
          findings.push({
            match,
            seed,
            width,
            kind: 'narration',
            detail: `narration stuck on beat ${b.beat || '(thinking)'} for 60 reads at step ${step} — it never advanced and never ended`,
          });
          narrationReported = true;
          // Fall through to SKIP so the match can still finish and report
          // whatever else is wrong with it.
          await clickText(page, 'SKIP ▸▸');
          continue;
        }
        await page.waitForTimeout(120);
        continue;
      }
      // Exercise the speed toggle too — it is a live control mid-narration.
      if (rand() < 0.1) await clickText(page, '⏱');
      await clickText(page, 'SKIP ▸▸');
      continue;
    }
    // 10. The human's own main phases / clash.
    const inClash = b.rings.some((r) => r.red) && has(B, 'SKIP TO MAIN II');
    if (inClash && rand() < 0.8) {
      const reds = b.rings.filter((r) => r.red).length;
      if (await clickRing(page, 'red', Math.floor(rand() * reds))) continue;
    }
    // Develop first, always: Leader down, Wellspring played, then cards. A
    // purely random driver skipped all three often enough to lose every match
    // by turn 6 without ever reaching a big board.
    if (await clickText(page, 'INVOKE LEADER')) continue;
    if (await clickSelector(page, 'button[aria-label^="Play a "]')) continue;
    if (b.handCards > 0 && (await tryInvokeHand(page, Math.floor(rand() * b.handCards)))) continue;

    const roll = rand();
    if (roll < 0.3 && (await clickSelector(page, '[role="button"][aria-disabled="false"]'))) {
      // Leader ability pills are the only aria-disabled="false" role=button
      // on the board; a usable one resolves, an unusable one just says why.
      continue;
    }
    if (roll < 0.38 && (await clickSelector(page, 'button[aria-label$="Wellspring"]'))) continue;
    if (roll < 0.62) {
      // Ash-pile drawer, battle log, inspector — read-only chrome that still
      // has to survive being opened mid-turn.
      const chrome = ['ASH-PILE', '▴ LOG', '▾ LOG'][Math.floor(rand() * 3)];
      if (await clickText(page, chrome)) continue;
    }
    for (const label of ['TO CLASH', 'SKIP TO MAIN II', 'END TURN', 'NEXT ▸']) {
      if (B.some((x) => !x.disabled && x.text.includes(label))) {
        if (await clickText(page, label)) break;
      }
    }
  }

  const final = await readBoard(page);
  if (!finished) {
    findings.push({
      match,
      seed,
      width,
      kind: 'unfinished',
      detail: `no winner within ${STEPS} steps (${final.header})`,
    });
  }
  for (const e of errors) {
    findings.push({
      match,
      seed,
      width,
      kind: e.startsWith('pageerror') ? 'pageerror' : 'console',
      detail: e.slice(0, 300),
    });
  }
  const outcome = finished
    ? final.bodyText.includes('VICTORY')
      ? 'VICTORY'
      : final.bodyText.includes('DEFEAT')
        ? 'DEFEAT'
        : 'ended'
    : 'UNFINISHED';
  // The game-over dialog carries the last two engine-log lines — printing them
  // is how a run of suspiciously short matches gets diagnosed (a driver that
  // was resigning read exactly like a driver that was losing).
  const why = /(?:VICTORY|DEFEAT)\s+(.{0,160})/.exec(final.bodyText)?.[1] ?? '';
  // A watch run that watched nothing is a broken harness, not a clean match —
  // it means the narration was never detected and every beat got skipped.
  if (watch && beatsWatched === 0) {
    findings.push({
      match,
      seed,
      width,
      kind: 'narration',
      detail: 'watch mode saw zero narration beats — the run never detected a CPU turn',
    });
  }
  console.log(
    `match ${match} (seed ${seed}, ${width}px, ${watch ? `watched ${beatsWatched} beats` : 'skipped'}): ${outcome} · ${final.header} · ${errors.length} console error(s)${
      why ? `\n    ↳ ${why}` : ''
    }`,
  );
  await ctx.close();
}

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {},
);

for (let m = 0; m < MATCHES; m++) {
  // The first two matches run at phone width — that is where a control
  // pushed off the side actually costs the player the game.
  const width = m < 2 ? PHONE : WIDE;
  await driveMatch(browser, m, SEED0 + m, width, WATCH_EVERY > 0 && m % WATCH_EVERY === 0);
}

await browser.close();

console.log(`\n=== ${findings.length} finding(s) ===`);
for (const f of findings) {
  console.log(`match ${f.match} seed ${f.seed} @${f.width} [${f.kind}] ${f.detail}`);
}
process.exit(findings.length > 0 ? 1 : 0);
