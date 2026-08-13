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
 * STUDY_EVERY (default 2 — of the watching matches, every Nth one drives
 * ❚❚ HOLD / ▸ STEP and checks that a held beat stays put and a step advances
 * exactly one; 0 disables), PLAYWRIGHT_CHROMIUM to point at a preinstalled
 * browser binary.
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
/** Of the matches that WATCH, every Nth one studies instead — it drives
 * ❚❚ HOLD and ▸ STEP and checks what they promise (v20). 0 disables. */
const STUDY_EVERY = Number(process.env.STUDY_EVERY ?? 2);

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

/**
 * Open a hand card's preview and invoke it if the preview allows.
 *
 * v20 — `scan` walks the rest of the hand when the chosen card turns out to be
 * uncastable, instead of giving up on the turn.
 *
 * The old behaviour picked ONE random hand index, and a hand is mostly
 * uncastable early: too expensive, wrong colour, an Item with no body to bond
 * to. A miss returned false, the caller fell through to its phase-advance
 * ladder, and the turn ended having developed nothing. That is why every
 * driven match died between turn 6 and turn 8 while the headless sim's average
 * game runs to 21 — the driver was not losing to the CPU so much as passing
 * its turns, and everything a real match reaches later (a hand over the shed
 * limit, a full board, the long response chains) was outside the harness's
 * reach on every run it has ever done.
 */
async function tryInvokeHand(page: Page, idx: number, scan = false): Promise<boolean> {
  const count = await evalSafe<number>(
    page,
    `document.querySelectorAll('[aria-label$="— preview and invoke"]').length`,
    0,
  );
  if (count === 0) return false;
  const tries = scan ? count : 1;
  for (let t = 0; t < tries; t++) {
    const at = (idx + t) % count;
    const opened = await evalSafe(
      page,
      `(() => {
        var cards = document.querySelectorAll('[aria-label$="— preview and invoke"]');
        if (!cards[${at}]) return false;
        cards[${at}].click();
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
    // v22 — pressing an enabled INVOKE is not the same as invoking. A refusal
    // that only prints a banner leaves the hand exactly as it was, and the
    // caller treats `true` as "progress was made, restart the ladder": that is
    // an infinite loop, and it is what seed 312 spent a whole match doing
    // against a targeted Event with no legal target. The UI now disables that
    // button, so this is the belt to that braces — the rule being that a driver
    // may only report an action it can SEE the board answer.
    if (invoked) {
      await page.waitForTimeout(120);
      const after = await evalSafe<number>(
        page,
        `document.querySelectorAll('[aria-label$="— preview and invoke"]').length`,
        count,
      );
      // Either the card left the hand, or a target pick is open on top of it.
      const picking = await evalSafe(
        page,
        `/PICK A TARGET|BOND — pick/i.test(String(document.body.innerText || ''))`,
        false,
      );
      if (after !== count || picking) return true;
      await clickText(page, '✕ CLOSE');
      continue;
    }
    await clickText(page, '✕ CLOSE');
  }
  return false;
}

/**
 * Play the Wellspring the HAND is asking for, falling back to any of them.
 *
 * v22 — the driver used to click `button[aria-label^="Play a "]`, which is the
 * FIRST dot in the row, which is the same colour every turn for a whole match.
 * A random deck is two or three colours, so roughly every other match the
 * driver spent nine turns building a mono-colour board in front of a hand it
 * could not cast: instrumenting one run showed the human invoking ONE card
 * across the whole game, every other hand card reporting "Needs Void essence
 * your Locations can't produce yet", and the match ending in a turn-7 defeat.
 *
 * That is why every driven match since the harness was written has ended
 * between turn 6 and turn 10 against a headless average of 21, and it is why
 * v20's "the driver was passing its turns" fix (scan the hand instead of
 * trying one card) did not move the number: the hand was not the problem, the
 * mana base was. Everything a real match reaches after turn 10 — a board wide
 * enough to need multi-guard lines, a hand over the shed limit, the long
 * response chains — has therefore never been driven.
 *
 * The match UI now rings the needed dot and names the colour in its aria-label
 * (same pass), so the driver reads the same signal a player does rather than a
 * private hook.
 */
async function playWellspring(page: Page): Promise<boolean> {
  return evalSafe(
    page,
    `(() => {
      var els = Array.prototype.slice.call(document.querySelectorAll('button[aria-label^="Play a "]'))
        .filter(function (el) { return el.disabled !== true; });
      if (els.length === 0) return false;
      // "Play a Void Wellspring — unlocks 3 cards in hand" — the count is the
      // number of hand cards that colour would turn on.
      var best = null, bestN = -1;
      for (var i = 0; i < els.length; i++) {
        var m = /unlocks (\\d+) card/.exec(els[i].getAttribute('aria-label') || '');
        var n = m ? Number(m[1]) : 0;
        if (n > bestN) { bestN = n; best = els[i]; }
      }
      var before = document.querySelectorAll('[aria-label$="Wellspring"], [aria-label$="Wellspring, exhausted"]').length;
      (best || els[0]).click();
      // v22 — report whether a Location actually ARRIVED, not merely that a dot
      // was there to press. The old form returned true on the element's mere
      // existence, and the ladder treats true as "progress was made, restart
      // the ladder": a dot that renders but is refused is then an infinite
      // loop, which is exactly the hang seed 312 produced (the engine gates
      // Wellsprings on an empty stack and the row did not). The UI now disables
      // the dot in that state, so this is the belt to that braces — an action
      // that changes nothing must never count as a step.
      return document.querySelectorAll('[aria-label$="Wellspring"], [aria-label$="Wellspring, exhausted"]').length > before;
    })()`,
    false,
  );
}

/**
 * v20 — what the driver does with the opponent's turn.
 *
 * v19 replaced "always SKIP" with "half the matches watch", on the reasoning
 * that a control which turns the CPU's whole turn off is not an exercise of
 * the narration path. The same pass then shipped ❚❚ HOLD and ▸ STEP onto the
 * same divider and the driver never touched either of them — so the two
 * newest controls on the match screen went out with exactly the coverage SKIP
 * had before v19 noticed: none.
 *
 * `study` mode drives them, and checks the two things they claim:
 *  - HOLD freezes the beat. The counter must NOT move while held.
 *  - STEP advances exactly one beat, and RESUME hands the chain back.
 * A HOLD that does not hold reads to a player as a frozen game; a STEP that
 * skips two is a move they never saw. Neither is visible to any other check
 * here, because both leave the board in a perfectly reachable state.
 */
type NarrationMode = 'skip' | 'watch' | 'study';

async function driveMatch(
  browser: import('playwright').Browser,
  match: number,
  seed: number,
  width: number,
  /** What to do with the CPU's narration — see NarrationMode. */
  mode: NarrationMode,
) {
  const watch = mode !== 'skip';
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
  /**
   * The ladder branch each of the last few iterations took (v22).
   *
   * A hang report used to name the buttons on screen and nothing about what
   * the driver was DOING with them, which makes the single most common
   * failure — a branch that fires, changes nothing, and `continue`s — invisible
   * from the report. Diagnosing one cost several full re-runs; the answer is
   * one line of state.
   */
  const recentActions: string[] = [];
  const act = <T>(name: string, result: T): T => {
    if (result) {
      recentActions.push(name);
      if (recentActions.length > 12) recentActions.shift();
    }
    return result;
  };
  let finished = false;
  let overflowReported = false;
  let staleRingReported = false;
  let narrationReported = false;
  /** Consecutive reads showing the same narration beat, in watch mode. */
  let sameBeatFor = 0;
  let lastBeat = '';
  let beatsWatched = 0;
  // ---- study mode (v20): the HOLD / STEP walk, run once per match ----------
  /** 'idle' → not started, 'freeze' → held, checking it stays put,
   *  'stepping' → walking beats one at a time, 'release' → owed a ▶ RESUME,
   *  'done' → handed back. */
  let study: 'idle' | 'freeze' | 'stepping' | 'release' | 'done' =
    mode === 'study' ? 'idle' : 'done';
  /** The beat that was on screen when HOLD was clicked. */
  let heldBeat = '';
  let freezeReads = 0;
  let stepsTaken = 0;
  let studyReported = false;
  const STUDY_FREEZE_READS = 12; // ~1.4s at the 120ms watch cadence
  const STUDY_STEPS = 3;
  const beatNum = (s: string) => Number(s.split('/')[0] || 0);
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
        detail:
          `board stopped moving for 90 steps at step ${step}. ` +
          `Last actions: ${recentActions.join(' → ') || '(none — the ladder fell through every branch)'}. ` +
          `Buttons: ${b.buttons
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
    // Case-INSENSITIVE, and the same fix v19 made for the beat counter: the
    // match screen is uppercased by CSS and `innerText` reflects that, so the
    // literal on screen is "BOND — PICK A FRIENDLY UNIT". The bond branch of
    // this rule was therefore dead from the day it was written — only the
    // already-uppercase 'PICK A TARGET' half ever matched — and a bond pick
    // left open is a state the driver could not leave, because the hand's
    // INVOKE stayed live underneath it and simply re-armed the same pick.
    if (/PICK A TARGET|BOND — pick/i.test(b.bodyText)) {
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
      // Blocking well is the single biggest thing keeping a driven match
      // alive long enough to reach a late-game board (v20: 0.6 -> 0.85).
      if (rand() < 0.85 && (await clickText(page, '✦ SUGGEST'))) continue;
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
      // v20: ALL × was an even-money call, and an all-in attack every other
      // clash is how the driver was throwing its board away — six of six runs
      // ended in DEFEAT between turn 6 and turn 8 against a headless average
      // of 21, so two thirds of every real match was outside the harness's
      // reach. Alpha-striking is still worth exercising, just not as the
      // default line.
      if (rand() < 0.2 && (await clickText(page, 'ALL ×'))) continue;
      // v22 — ✕ CLEAR, which v20 shipped onto this bar and nothing has pressed
      // since. It empties the attacker selection, so the next loop rebuilds it:
      // a control that failed to clear would read as an attack the player did
      // not choose, and one that cleared too much (dropping the clash itself)
      // would strand the turn. Occasionally, since it costs a step.
      if (rand() < 0.12 && (await clickText(page, '✕ CLEAR'))) continue;
      await clickText(page, 'DECLARE ATTACK');
      continue;
    }
    // 9. CPU narration.
    if (narrating) {
      // Checked outside the `b.beat !== ''` guard below: the release is owed
      // precisely because the run ended (no beat) while the hold survived.
      if (study === 'release') {
        if (await clickText(page, '▶ RESUME')) {
          study = 'done';
          continue;
        }
        // Not paused after all — the counter is moving on its own, so there is
        // nothing left to release and waiting for a RESUME button that will
        // never appear is its own hang.
        if (b.beat !== '' && b.beat !== lastBeat) study = 'done';
        lastBeat = b.beat;
        await page.waitForTimeout(120);
        continue;
      }
      // 9a. v20 — the HOLD / STEP walk, once per match in study mode. Runs
      //     before the passive watch below and hands back to it when done.
      if (study !== 'done' && b.beat !== '') {
        if (study === 'idle') {
          if (await clickText(page, '❚❚ HOLD')) {
            heldBeat = b.beat;
            freezeReads = 0;
            study = 'freeze';
          } else {
            // The control is not on the divider at all — that is the v19
            // feature missing, not a pacing quirk.
            if (!studyReported) {
              findings.push({
                match,
                seed,
                width,
                kind: 'narration',
                detail: `❚❚ HOLD is not on the divider while a narration beat (${b.beat}) is on screen at step ${step}`,
              });
              studyReported = true;
            }
            study = 'done';
          }
          await page.waitForTimeout(120);
          continue;
        }
        if (study === 'freeze') {
          // The whole promise of HOLD: the beat stays put until the player
          // says otherwise. A beat that moves on its own here is a hold that
          // does not hold.
          if (b.beat !== heldBeat) {
            if (!studyReported) {
              findings.push({
                match,
                seed,
                width,
                kind: 'narration',
                detail: `❚❚ HOLD did not hold — beat moved ${heldBeat} → ${b.beat} after ${freezeReads} reads with no STEP or RESUME clicked (step ${step})`,
              });
              studyReported = true;
            }
            study = 'done';
            continue;
          }
          if (++freezeReads >= STUDY_FREEZE_READS) {
            study = 'stepping';
            stepsTaken = 0;
          }
          await page.waitForTimeout(120);
          continue;
        }
        // study === 'stepping'
        const before = beatNum(b.beat);
        if (!(await clickText(page, '▸ STEP'))) {
          if (!studyReported) {
            findings.push({
              match,
              seed,
              width,
              kind: 'narration',
              detail: `▸ STEP is not on the divider while held on beat ${b.beat} at step ${step}`,
            });
            studyReported = true;
          }
          study = 'done';
          await clickText(page, '▶ RESUME');
          continue;
        }
        await page.waitForTimeout(150);
        const after = await readBoard(page);
        // An empty counter means the run ended on that step, which is a legal
        // outcome of stepping off the last beat.
        if (after.beat !== '' && beatNum(after.beat) !== before + 1 && !studyReported) {
          findings.push({
            match,
            seed,
            width,
            kind: 'narration',
            detail: `▸ STEP advanced ${before} → ${beatNum(after.beat)} (expected ${before + 1}) at step ${step}`,
          });
          studyReported = true;
        }
        beatsWatched++;
        if (++stepsTaken >= STUDY_STEPS || after.beat === '') {
          // Owed a ▶ RESUME, not necessarily able to click one yet: stepping
          // off the LAST beat of a run ends it, so `narrating` goes false and
          // the divider (and its RESUME) go with it — while the hold itself
          // survives, by design, into the next run. Clicking once here and
          // calling it done left the match held on the first beat of that next
          // run with nobody to release it, which the watch branch then
          // correctly reported as a stalled narration. Keep owing it until it
          // lands.
          study = 'release';
        }
        continue;
      }
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
    if (act('INVOKE LEADER', await clickText(page, 'INVOKE LEADER'))) continue;
    if (act('wellspring', await playWellspring(page))) continue;
    // `scan`: keep going through the hand rather than passing the turn on one
    // uncastable card — see tryInvokeHand.
    if (
      b.handCards > 0 &&
      act('invoke-hand', await tryInvokeHand(page, Math.floor(rand() * b.handCards), true))
    )
      continue;

    // v22 — RE-BOND, the one board action the driver has never taken.
    // A Weapon or Tool survives the unit it was bonded to and lands in the
    // unbonded-Item row with its own button; re-bonding it opens a `pending`
    // target pick, which is a state only this control can reach (every other
    // route into `pending` comes from the hand). `rebonds` is 6,538 a run in
    // the headless sim, so it is not a rare line — it was simply unreachable
    // from here, and so was the whole "pick a target for something that is
    // already on the board" seam.
    if (rand() < 0.7 && act('re-bond', await clickText(page, 'RE-BOND'))) continue;

    const roll = rand();
    if (
      roll < 0.3 &&
      act('leader-ability', await clickSelector(page, '[role="button"][aria-disabled="false"]'))
    ) {
      // Leader ability pills are the only aria-disabled="false" role=button
      // on the board; a usable one resolves, an unusable one just says why.
      continue;
    }
    // v20: 0.08 -> 0.02. A manual Location tap is a control worth exercising
    // and a play worth almost never making — the pool empties at the end of
    // every PHASE while the Location stays exhausted until Dawn, so a pip
    // tapped in Main I and not spent is a Location the driver has thrown away
    // for Main II. At eight percent of a long turn it was doing that several
    // times a turn, every turn.
    if (
      roll < 0.32 &&
      act('tap-location', await clickSelector(page, 'button[aria-label$="Wellspring"]'))
    )
      continue;
    if (roll < 0.62) {
      // Ash-pile drawer, battle log, inspector — read-only chrome that still
      // has to survive being opened mid-turn.
      const chrome = ['ASH-PILE', '▴ LOG', '▾ LOG'][Math.floor(rand() * 3)];
      if (act(`chrome:${chrome}`, await clickText(page, chrome))) continue;
    }
    for (const label of ['TO CLASH', 'SKIP TO MAIN II', 'END TURN', 'NEXT ▸']) {
      if (B.some((x) => !x.disabled && x.text.includes(label))) {
        if (act(`phase:${label}`, await clickText(page, label))) break;
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
  // Same rule for study mode: a run that never got as far as clicking HOLD
  // measured the two controls it exists to measure exactly as much as v19's
  // always-SKIP driver measured the narration — not at all.
  if (mode === 'study' && study === 'idle') {
    findings.push({
      match,
      seed,
      width,
      kind: 'narration',
      detail: 'study mode never reached a narration beat — ❚❚ HOLD / ▸ STEP went unexercised',
    });
  }
  console.log(
    `match ${match} (seed ${seed}, ${width}px, ${
      mode === 'skip'
        ? 'skipped'
        : mode === 'study'
          ? `studied (${stepsTaken} STEPs), ${beatsWatched} beats`
          : `watched ${beatsWatched} beats`
    }): ${outcome} · ${final.header} · ${errors.length} console error(s)${
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
  // Three-way split, in the order a player meets the controls: skip, watch,
  // study. STUDY_EVERY carves the HOLD/STEP walk out of the watching half
  // rather than out of the skipping one — a match that skips the CPU's turn
  // has no beat to hold.
  const watches = WATCH_EVERY > 0 && m % WATCH_EVERY === 0;
  const mode: NarrationMode = !watches
    ? 'skip'
    : STUDY_EVERY > 0 && Math.floor(m / Math.max(1, WATCH_EVERY)) % STUDY_EVERY === 0
      ? 'study'
      : 'watch';
  await driveMatch(browser, m, SEED0 + m, width, mode);
}

await browser.close();

console.log(`\n=== ${findings.length} finding(s) ===`);
for (const f of findings) {
  console.log(`match ${f.match} seed ${f.seed} @${f.width} [${f.kind}] ${f.detail}`);
}
process.exit(findings.length > 0 ? 1 : 0);
