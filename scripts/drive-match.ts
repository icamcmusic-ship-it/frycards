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
 * exactly one; 0 disables), WIN_EVERY (default 3 — every Nth match starts the
 * CPU on WIN_VIT Vitality so the driver can actually reach the VICTORY
 * screen; 0 disables) and WIN_VIT (default 3), PLAYWRIGHT_CHROMIUM to point
 * at a preinstalled browser binary.
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
/**
 * Every Nth match starts the CPU on `WIN_VIT` Vitality (v26). 0 disables.
 *
 * The driver plays legal-but-random lines against a CPU that plays properly,
 * and across every run this harness has ever done it has lost every single
 * match. So the VICTORY screen — its reward block, its REMATCH control, its
 * onResult callback — was the one match state the match-state harness had
 * never once rendered, and a crash there would have shipped. A handicap is
 * the honest way in: nothing about the match plays differently, the finish
 * line is just closer.
 */
const WIN_EVERY = Number(process.env.WIN_EVERY ?? 3);
const WIN_VIT = Number(process.env.WIN_VIT ?? 3);
/**
 * The HUMAN's opening Vitality on a winnable match (v29). 0 leaves it alone.
 *
 * v26 put the opponent on 3 and called the finish line closer. It is, but the
 * driver still has to reach it: it plays random legal lines against a CPU that
 * plays properly, so across v29's runs the handicap converted anywhere from
 * 1-in-3 winnable matches to **0-in-3** — and a run where it converts none
 * measures the VICTORY screen exactly as much as the pre-v26 driver did, which
 * is what the guard at the bottom of this file then correctly reports. Giving
 * the driver the full Vitality cap as well buys it the turns to get there;
 * nothing about how either side plays changes.
 */
const WIN_MY_VIT = Number(process.env.WIN_MY_VIT ?? 20);

/**
 * Every Nth match resigns instead of playing to a finish (v29). 0 disables.
 *
 * ✕ CONCEDE is the one control on the top bar in every single state of every
 * single match, and no harness had ever pressed it: the driver has clicked
 * CANCEL on its own stray concede since v19, so the confirm dialog's CONFIRM
 * half — and everything behind it — was measured exactly as much as the
 * VICTORY screen was before v26, which is to say not at all. A resignation is
 * also the only way a player ends a match they are losing, so it is not an
 * exotic path; it is the second most common way a match ends.
 */
const CONCEDE_EVERY = Number(process.env.CONCEDE_EVERY ?? 4);
/** Steps between clipped-control sweeps — the read walks every control. */
const CLIP_EVERY = Number(process.env.CLIP_EVERY ?? 25);
/** Run one phone match at 200% browser font (v29). */
const BIG_TEXT = process.env.BIG_TEXT !== '0';
/** Drive one match in phone LANDSCAPE — the short viewport (v29). */
const LANDSCAPE = process.env.LANDSCAPE !== '0';
const LANDSCAPE_W = Number(process.env.LANDSCAPE_W ?? 844);
const LANDSCAPE_H = Number(process.env.LANDSCAPE_H ?? 390);
/** How many steps a conceding match plays before resigning. */
const CONCEDE_AFTER = Number(process.env.CONCEDE_AFTER ?? 90);
/**
 * Press ↻ REMATCH on the game-over screen rather than stopping there (v29).
 *
 * The victory screen has rendered since v26 and nothing has ever pressed its
 * primary control. REMATCH remounts the whole match — a fresh deck roll, a
 * fresh engine, a fresh narration chain — while the outgoing match's timers,
 * refs and reward round-trip are still unwinding, which is the single most
 * likely place in this component for a stale timer to fire into a dead tree.
 */
const REMATCH = process.env.REMATCH !== '0';

interface Finding {
  match: number;
  seed: number;
  width: number;
  kind:
    | 'pageerror'
    | 'console'
    | 'hang'
    | 'overflow'
    | 'unfinished'
    | 'stale-ring'
    | 'narration'
    | 'coverage'
    | 'clipped';
  detail: string;
}

const findings: Finding[] = [];
/** How many driven matches actually reached the VICTORY screen. */
let victories = 0;
const winnableRun = { total: 0, won: 0 };
/** Matches scheduled to resign, and how many actually reached CONFIRM. */
const concedeRun = { total: 0, done: 0 };
/** How many ↻ REMATCH presses produced a playable board. */
let rematchesDriven = 0;

/**
 * The control census (v29) — "attempt every possible action", measured.
 *
 * Every previous stress round grew this driver by ADDING an action somebody
 * noticed it had never taken: SKIP was clicked on every match until v19,
 * RE-BOND had never been pressed until v22, ✕ CLEAR shipped in v20 and nothing
 * pressed it until v22, and the VICTORY screen had never rendered until v26.
 * Each of those was found by reading the source and remembering, which is a
 * measurement instrument made of one person's attention.
 *
 * The run already reads the whole board on every step, so it already knows
 * every control the match OFFERS. Counting which of them it ever PRESSES turns
 * "what has the driver never tried?" from a memory exercise into a number that
 * prints on every run — and a control offered in every match and pressed in
 * none is reported as a finding rather than noticed three releases later.
 *
 * Keys are normalised (see CENSUS_KEY): the arithmetic suffixes the divider
 * prints (`— TAKE 7 · LETHAL`) are the same control, and every card face
 * collapses to one `«card»` key so a 40-card hand cannot bury the chrome.
 */
interface CensusRow {
  /** Reads where the control was on screen and enabled. */
  offered: number;
  /** Matches in which it was offered at least once. */
  offeredIn: Set<number>;
  /** Successful driver clicks on it. */
  pressed: number;
  pressedIn: Set<number>;
}
const census = new Map<string, CensusRow>();
const censusRow = (key: string): CensusRow => {
  let row = census.get(key);
  if (!row) {
    row = { offered: 0, offeredIn: new Set(), pressed: 0, pressedIn: new Set() };
    census.set(key, row);
  }
  return row;
};
/** Which match the reads/clicks being recorded belong to. */
let censusMatch = -1;
const noteOffered = (keys: string[]) => {
  for (const k of keys) {
    const row = censusRow(k);
    row.offered += 1;
    row.offeredIn.add(censusMatch);
  }
};
const notePressed = (key: string) => {
  if (!key) return;
  const row = censusRow(key);
  row.pressed += 1;
  row.pressedIn.add(censusMatch);
};
/**
 * Controls the driver is not expected to press, with the reason.
 *
 * An exemption is declared here rather than inferred, for the same reason
 * v28's inline tap-target exception is marked on the element: an exception the
 * harness works out for itself is an exception nobody chose. The list prints
 * on every run.
 */
const CENSUS_EXEMPT = new Map<string, string>([
  ['«card»', 'card faces are clicked by ring/hand index, not by label'],
  ['BACK TO MENU', 'the driver ends a match by leaving the page, not by navigating'],
]);
/**
 * A second deterministic stream, for the coin-flips taken inside the
 * module-level helpers (which have no access to a match's own `rand`).
 * Seeded off SEED0 so a run still reproduces exactly.
 */
let auxRng = (Number(process.env.SEED0 ?? 1) * 2654435761) >>> 0;
const dblRand = () => (auxRng = (auxRng * 1664525 + 1013904223) >>> 0) / 0x100000000;

/** A control offered in this many matches and never pressed is a finding. */
const COVERAGE_MIN_MATCHES = Number(process.env.COVERAGE_MIN_MATCHES ?? 2);
/** How many never-pressed controls are reported individually. */
const COVERAGE_CAP = Number(process.env.COVERAGE_CAP ?? 12);

/** Console noise the offline harness cannot avoid (no Supabase, no card CDN). */
const NOISE = /Failed to load resource|net::ERR|ERR_TUNNEL|ERR_PROXY|Failed to fetch|WebSocket/i;

interface BoardRead {
  buttons: { text: string; disabled: boolean; key: string; shown: boolean }[];
  rings: { red: boolean; yellow: boolean; blue: boolean }[];
  /** Innermost elements past the right edge, when the page is over-wide. */
  offenders: string[];
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
 * One control's census identity, computed IN PAGE so a read and a click agree.
 *
 * Three rules, each of which a board control needed:
 *  - a card face is `«card»`. Every unit, hand card and pile card renders a
 *    `CardFace` (they carry `data-card-id`), so without this the census is
 *    three hundred card names and no chrome.
 *  - the arithmetic a divider button prints is not its identity.
 *    `CONFIRM GUARDS — TAKE 7 · LETHAL` and `CONFIRM GUARDS — NOTHING GETS
 *    THROUGH` are one control, so everything from the first em-dash or
 *    interpunct on is dropped and any surviving digit run becomes `N`.
 *  - `aria-label` wins over text, because the icon-only controls (the ✕
 *    concede, the ash-pile drawer) have no text at all and would otherwise
 *    census as `«unlabelled»` together.
 */
const CENSUS_KEY = `function __censusKey(el) {
  // A card face is '«card»' whether the element IS one, sits inside one, or
  // wraps one. The third case is the one the first run got wrong: a
  // battlefield unit is a [role=button] wrapper whose CardFace child carries
  // data-card-id, so \`closest\` found nothing and thirty card names arrived in
  // the census as thirty distinct controls.
  if (el.closest && el.closest('[data-card-id]')) return '\u00abcard\u00bb';
  if (el.querySelector && el.querySelector('[data-card-id]')) return '\u00abcard\u00bb';
  var t = el.getAttribute('aria-label') || el.textContent || '';
  t = String(t).replace(/\\s+/g, ' ').trim();
  // Everything after the first separator is STATE, not identity: an em-dash
  // introduces arithmetic, an interpunct a suffix, and a colon the current
  // value ("Narration speed: FAST. Click to change" is one control whose label
  // names the rung it is on, and keying on the whole string made every rung a
  // different control that had never been pressed).
  t = t.split('\u2014')[0].split('\u00b7')[0].split(':')[0];
  t = t.replace(/\\d+/g, 'N').replace(/\\s+/g, ' ').trim().toUpperCase();
  return t.slice(0, 48) || '\u00abunlabelled\u00bb';
}`;

/**
 * Everything the board can be showing, read in one round trip.
 *
 * Passed as a source STRING, not a closure: tsx compiles this file with
 * esbuild's keep-names on, which rewrites in-page arrow functions to call a
 * `__name` helper that does not exist inside the browser (`ReferenceError:
 * __name is not defined` on the first evaluate).
 */
const READ_BOARD = `(() => {
  ${CENSUS_KEY}
  var txt = function (el) { return (el && el.textContent ? el.textContent : '').replace(/\\s+/g, ' ').trim(); };
  var buttons = Array.prototype.slice
    .call(document.querySelectorAll('button, [role="button"]'))
    .map(function (el) {
      return {
        text: txt(el),
        disabled: el.disabled === true || el.getAttribute('aria-disabled') === 'true',
        key: __censusKey(el),
        // A control that is in the DOM but painting nothing is not being
        // OFFERED. querySelectorAll happily returns the contents of a
        // display:none panel, and the first census run reported the card
        // inspector's ↻ SHOW BACK and CLOSE (ESC) as available on 2,482 of
        // 2,715 reads — a modal nobody had opened.
        shown: el.getClientRects().length > 0,
      };
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
  // Captured in the SAME read as the overflow number it explains. A second
  // round trip is a different frame: the first version of this asked the page
  // "what is too wide?" one evaluate after noticing that something was, and on
  // a board where the offender is a popover or a banner the answer had already
  // gone away — an overflow finding with an empty offender list every time.
  var offenders = [];
  if (document.documentElement.scrollWidth > window.innerWidth + 1) {
    var W = window.innerWidth;
    var bad = [];
    var all = document.querySelectorAll('body *');
    for (var oi = 0; oi < all.length; oi++) {
      var oe = all[oi];
      var orc = oe.getBoundingClientRect();
      if (orc.width === 0 || orc.height === 0) continue;
      if (orc.right <= W + 1) continue;
      var oright = orc.right;
      for (var oa = oe.parentElement; oa; oa = oa.parentElement) {
        if (getComputedStyle(oa).overflowX === 'visible') continue;
        oright = Math.min(oright, oa.getBoundingClientRect().right);
      }
      if (oright <= W + 1) continue;
      bad.push(oe);
    }
    for (var oj = 0; oj < bad.length && offenders.length < 3; oj++) {
      var innermost = true;
      for (var ok = 0; ok < bad.length; ok++)
        if (bad[ok] !== bad[oj] && bad[oj].contains(bad[ok])) innermost = false;
      if (!innermost) continue;
      offenders.push(
        '<' + bad[oj].tagName.toLowerCase() + ' class="' + String(bad[oj].className || '').slice(0, 60) +
        '"> "' + txt(bad[oj]).slice(0, 30) + '" right=' + Math.round(bad[oj].getBoundingClientRect().right));
    }
    // Nothing sticks out, and yet the document is wider than the window. That
    // happens when the extra width belongs to an element's SCROLL extent
    // rather than to its box — a row whose contents overflow it without a
    // scrollbar — so fall back to naming it. An "overflow of no element"
    // report is worse than no report: it reads as a harness bug.
    if (offenders.length === 0) {
      // A container whose CONTENT is wider than it is and which has no
      // scroller to hold it. An overflow-x:auto row (the hand strip, the
      // Locations lane, the divider) is doing exactly what it was built to do
      // and is not the answer, so scrollers are excluded rather than reported.
      var worst = null, worstBy = 0;
      for (var wi = 0; wi < all.length; wi++) {
        var we = all[wi];
        if (getComputedStyle(we).overflowX !== 'visible') continue;
        // And nothing above it may be holding that overflow either — a column
        // inside a modal that scrolls is contained, however far its content
        // runs, and naming it sends the reader off after a non-bug.
        var held = false;
        for (var wa = we.parentElement; wa; wa = wa.parentElement)
          if (getComputedStyle(wa).overflowX !== 'visible') { held = true; break; }
        if (held) continue;
        var by = we.scrollWidth - we.clientWidth;
        if (by > worstBy && we.clientWidth > 0) { worstBy = by; worst = we; }
      }
      if (worst) {
        offenders.push('(no box past the edge) widest unscrolled overflow <' + worst.tagName.toLowerCase() +
          ' class="' + String(worst.className || '').slice(0, 60) + '"> scrollWidth ' +
          worst.scrollWidth + ' vs clientWidth ' + worst.clientWidth);
      }
    }
  }
  return {
    buttons: buttons,
    rings: rings,
    offenders: offenders,
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

/**
 * Controls the board is drawing but the player cannot reach (v29).
 *
 * Source string, same reason READ_BOARD is one. Returns one line per distinct
 * clipped control; an empty array is the clean answer.
 */
const CLIPPED_CONTROLS = `(() => {
  var W = window.innerWidth, H = window.innerHeight;
  var out = [];
  var els = document.querySelectorAll('button, [role="button"]');
  for (var i = 0; i < els.length; i++) {
    var el = els[i];
    var rc = el.getBoundingClientRect();
    if (rc.width === 0 || rc.height === 0) continue;
    var top = rc.top, bottom = rc.bottom, left = rc.left, right = rc.right;
    var scrollable = false;
    for (var a = el.parentElement; a; a = a.parentElement) {
      var st = getComputedStyle(a);
      if (st.overflowY === 'auto' || st.overflowY === 'scroll' ||
          st.overflowX === 'auto' || st.overflowX === 'scroll') scrollable = true;
      var ar = a.getBoundingClientRect();
      if (st.overflowY !== 'visible') { top = Math.max(top, ar.top); bottom = Math.min(bottom, ar.bottom); }
      if (st.overflowX !== 'visible') { left = Math.max(left, ar.left); right = Math.min(right, ar.right); }
    }
    top = Math.max(top, 0); bottom = Math.min(bottom, H);
    left = Math.max(left, 0); right = Math.min(right, W);
    if (right - left > 2 && bottom - top > 2) continue;
    // Inside something that scrolls: off screen, but one gesture away.
    if (scrollable) continue;
    var label = (el.getAttribute('aria-label') || el.textContent || el.tagName)
      .replace(/\\s+/g, ' ').trim().slice(0, 32);
    out.push(el.tagName + ' "' + label + '"');
  }
  var seen = {}, uniq = [];
  for (var j = 0; j < out.length; j++) { if (!seen[out[j]]) { seen[out[j]] = 1; uniq.push(out[j]); } }
  return uniq;
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
  offenders: [],
  handCards: 0,
  bodyText: '',
  header: '',
  scrollWidth: 0,
  innerWidth: 1,
  beat: '',
  cpuRings: 0,
};

async function readBoard(page: Page): Promise<BoardRead> {
  const board = await evalSafe<BoardRead>(page, READ_BOARD, EMPTY_BOARD);
  // Deduped within the read: two ready units both offer «card», and a control
  // the board draws twice is still one control being offered.
  noteOffered([...new Set(board.buttons.filter((b) => !b.disabled && b.shown).map((b) => b.key))]);
  return board;
}

const has = (b: { text: string; disabled: boolean }[], needle: string) =>
  b.some((x) => !x.disabled && x.text.includes(needle));

/**
 * Run a click expression that returns the census key of whatever it pressed
 * (or `''` for a miss), record the press, and hand the caller back a boolean-y
 * value — a non-empty key is truthy, so every existing `if (await clickX(...))`
 * reads exactly as it did.
 */
async function press(page: Page, expr: string): Promise<boolean> {
  const key = await evalSafe<string>(page, expr, '');
  notePressed(key);
  return key !== '';
}

/**
 * Click by visible text, in the page.
 *
 * Playwright locators were the obvious choice and made a step cost seconds:
 * every miss burns the whole action timeout, and the driver misses often by
 * design (it probes for controls that may not be there). An in-page click is
 * a single round trip that returns false immediately.
 */
async function clickText(page: Page, needle: string): Promise<boolean> {
  return press(
    page,
    `(() => {
      ${CENSUS_KEY}
      var want = ${JSON.stringify(needle)};
      var els = Array.prototype.slice.call(document.querySelectorAll('button, [role="button"]'));
      for (var i = 0; i < els.length; i++) {
        var el = els[i];
        if (el.disabled === true || el.getAttribute('aria-disabled') === 'true') continue;
        var t = (el.textContent || '').replace(/\\s+/g, ' ').trim();
        if (t.indexOf(want) >= 0) { var k = __censusKey(el); el.click(); return k; }
      }
      return '';
    })()`,
  );
}

/**
 * Press SPACE — the v26 shortcut that fires whatever the clash divider is
 * offering — instead of clicking that button with the pointer.
 *
 * v29. The shortcut has never been exercised by anything but a unit test: the
 * driver has always clicked, so the one path where a KEY has to find the
 * primary, respect its `disabled`, and stay inert under a modal was measured
 * only by reading it. The census records the control the key reached, so a
 * SPACE that lands on the wrong primary shows up as the wrong row moving.
 */
async function pressSpace(page: Page): Promise<boolean> {
  const key = await evalSafe<string>(
    page,
    `(() => {
      ${CENSUS_KEY}
      var el = document.querySelector('button[data-primary="1"]');
      if (!el || el.disabled) return '';
      // Blur first: the shortcut deliberately stands down when a BUTTON has
      // focus (the browser already gives a focused control its own Space), so
      // a driver that had just clicked something would measure nothing.
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      return __censusKey(el);
    })()`,
    '',
  );
  if (!key) return false;
  await page.keyboard.press(' ');
  notePressed(key);
  return true;
}

/**
 * Click by CSS selector, nth match. A NEGATIVE index counts from the end,
 * which is how the driver reaches into an overlay: a modal mounts at the end
 * of the DOM, so `-1` is the last card face on the page and the first one the
 * ash-pile drawer is drawing, where index 0 is a battlefield unit sitting
 * underneath the drawer that the click cannot reach anyway.
 */
async function clickSelector(page: Page, selector: string, idx = 0): Promise<boolean> {
  return press(
    page,
    `(() => {
      ${CENSUS_KEY}
      var els = document.querySelectorAll(${JSON.stringify(selector)});
      var el = ${idx} < 0 ? els[els.length + ${idx}] : els[${idx}];
      if (!el) return '';
      var k = __censusKey(el);
      el.click();
      return k;
    })()`,
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
  return press(
    page,
    `(() => {
      ${CENSUS_KEY}
      var els = Array.prototype.slice
        .call(document.querySelectorAll('[class*="ring-4"]'))
        .filter(function (el) { return String(el.className).indexOf(${JSON.stringify(cls)}) >= 0; });
      var el = els[${idx}];
      if (!el) return '';
      // The ring sits on a wrapper whose CardFace child owns the handler.
      var inner = el.querySelector('[role="button"], button');
      var target = inner || el;
      var k = __censusKey(target);
      target.click();
      return k;
    })()`,
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
    // v29 — the DOUBLE-CLICK shortcut (v26): a hand card played without ever
    // opening its preview. It is a different code path from the preview's
    // INVOKE button (a dblclick handler on the tile, not a click on a button
    // inside the panel it opens) and nothing in this harness had ever taken
    // it. Only when the caller is scanning, so a miss still falls through to
    // the preview route below and the turn is not thrown away on it.
    if (scan && dblRand() < 0.25) {
      const played = await evalSafe(
        page,
        `(() => {
          ${CENSUS_KEY}
          var cards = document.querySelectorAll('[aria-label$="— preview and invoke"]');
          var el = cards[${at}];
          if (!el) return '';
          var k = __censusKey(el);
          var ev = new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window });
          el.dispatchEvent(ev);
          return k;
        })()`,
        '',
      );
      if (played) {
        notePressed('«dblclick hand card»');
        await page.waitForTimeout(120);
        const after = await evalSafe<number>(
          page,
          `document.querySelectorAll('[aria-label$="— preview and invoke"]').length`,
          count,
        );
        const picking = await evalSafe(
          page,
          `/PICK A TARGET|BOND — pick/i.test(String(document.body.innerText || ''))`,
          false,
        );
        if (after !== count || picking) return true;
        // It opened the preview instead (a dblclick is two clicks) — close it
        // and fall through to the ordinary route for this same card.
        await clickText(page, '✕ CLOSE');
      }
    }
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
  // 15% of the time, any colour rather than the most unlocking one.
  const pickAny = dblRand() < 0.4;
  const anyIdx = Math.floor(dblRand() * 7);
  return press(
    page,
    `(() => {
      ${CENSUS_KEY}
      var __pickAny = ${pickAny};
      var __anyIdx = ${anyIdx};
      var els = Array.prototype.slice.call(document.querySelectorAll('button[aria-label^="Play a "]'))
        .filter(function (el) { return el.disabled !== true; });
      // '' and not false: this probe returns a census KEY now, and \`press\`
      // reads any non-empty return as "something was pressed" — so a stray
      // \`false\` here reported a Wellspring played on every step where there
      // was no dot to press at all, and the ladder restarted forever.
      if (els.length === 0) return '';
      // "Play a Void Wellspring — unlocks 3 cards in hand" — the count is the
      // number of hand cards that colour would turn on.
      var best = null, bestN = -1;
      for (var i = 0; i < els.length; i++) {
        var m = /unlocks (\\d+) card/.exec(els[i].getAttribute('aria-label') || '');
        var n = m ? Number(m[1]) : 0;
        if (n > bestN) { bestN = n; best = els[i]; }
      }
      // v29 — sometimes take a different colour. Always taking the BEST dot is
      // good play and bad coverage: the census showed four of the seven
      // Wellspring dots offered dozens of times and pressed never, because the
      // colour that is never the best answer is never pressed at all.
      if (__pickAny) best = els[__anyIdx % els.length];
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
      if (document.querySelectorAll('[aria-label$="Wellspring"], [aria-label$="Wellspring, exhausted"]').length <= before) return '';
      return __censusKey(best || els[0]);
    })()`,
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
  /** Hand the driver a winnable board — see WIN_EVERY. */
  winnable: boolean,
  /** Resign this match once it has played a while — see CONCEDE_EVERY. */
  concedes = false,
  /** Play this match with the browser's font size doubled (v29). */
  bigText = false,
  /** Viewport height. 900 everywhere except the landscape match (v29). */
  height = 900,
) {
  const watch = mode !== 'skip';
  censusMatch = match;
  const ctx = await browser.newContext({ viewport: { width, height } });
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
  // v29 — one phone match plays at the browser's font size doubled.
  //
  // The meta-screen sweep added this at v29 and found nine screens that push
  // off the side of a phone under it; the match board is the screen a player
  // spends the most time on and had never been measured at any font size but
  // the default. It clips rather than scrolls, so what a large font does here
  // is squeeze controls out of existence rather than off the edge — which is
  // exactly what the clipped-control check above looks for.
  const handicap = winnable
    ? `&cpuvit=${WIN_VIT}${WIN_MY_VIT > 0 ? `&myvit=${WIN_MY_VIT}` : ''}`
    : '';
  await page.goto(`${BASE}?seed=${seed}&speed=2${handicap}`, {
    waitUntil: 'domcontentloaded',
    timeout: 30_000,
  });
  if (bigText) {
    const cdp = await ctx.newCDPSession(page);
    await cdp
      .send('Page.setFontSizes', { fontSizes: { standard: 32, fixed: 26 } })
      .catch(() => undefined);
    await page.waitForTimeout(400);
    // Confirm it TOOK. A harness that silently measures the default size while
    // reporting "200% text" is the one failure this whole file exists to
    // avoid: it would print a clean sheet for a state nothing rendered.
    const rootPx = await evalSafe<number>(
      page,
      `parseFloat(getComputedStyle(document.documentElement).fontSize) || 0`,
      0,
    );
    if (rootPx < 24) {
      findings.push({
        match,
        seed,
        width,
        kind: 'unfinished',
        detail: `200% text mode did not take — the root font is ${rootPx}px, so this match measured the default size`,
      });
    }
  }
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
  /** Steps this driven match may take — grows by STEPS on a rematch. */
  let stepBudget = STEPS;
  /** This match answered CONFIRM on the concede dialog. */
  let conceded = false;
  /** How many times ↻ REMATCH was pressed and a new match came up. */
  let rematches = 0;
  let overflowReported = false;
  let clippedReported = false;
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

  for (let step = 0; step < stepBudget && !finished; step++) {
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

    /**
     * An overflow finding names the element, or it is not a finding.
     *
     * v29 spent three rounds on this. The board measured 1–12px over at 200%
     * text with no element past the edge at all; the fallback that guessed at
     * "the widest thing whose content does not fit" then named the hand strip
     * (an `overflow-x: auto` row doing its job), and after that the card
     * inspector's inner column (contained by a wrapper that scrolls both ways,
     * and 536-in-358 at the DEFAULT font too, so not a text-resize bug
     * either). Two confident wrong answers in a row.
     *
     * The overshoot itself is real but unattributable — fractional rem
     * paddings at 200% and `scrollWidth`'s rounding-up — and the failure this
     * check exists to catch, a control pushed off the side of the screen, is
     * ALWAYS a box past the edge. So the box is required. When the number
     * moves without one, the run says so on stdout and does not fail: a
     * finding nobody can act on trains people to ignore the report.
     */
    const overBy = b.scrollWidth - b.innerWidth;
    const realOffender = b.offenders.some((o) => !o.startsWith('(no box'));
    if (!overflowReported && overBy > 1 && !realOffender) {
      overflowReported = true;
      console.log(
        `    note: match ${match} measured ${b.scrollWidth} > ${b.innerWidth} at step ${step} ` +
          `with no element past the edge${b.offenders.length ? ` — ${b.offenders[0]}` : ''}`,
      );
    }
    if (!overflowReported && overBy > 1 && realOffender) {
      findings.push({
        match,
        seed,
        width,
        kind: 'overflow',
        detail:
          `scrollWidth ${b.scrollWidth} > innerWidth ${b.innerWidth} at step ${step}` +
          (b.offenders.length ? ` — widest: ${b.offenders.join(' | ')}` : ''),
      });
      overflowReported = true;
    }

    /**
     * v29 — the check the overflow check could never be.
     *
     * The match root is `w-full h-screen flex flex-col overflow-hidden`. A
     * root that clips cannot grow the document's scroll width, so
     * `scrollWidth > innerWidth` on this page is a condition the layout is
     * structurally incapable of reaching — every run since v17 has been
     * asserting something that cannot fail. (It stays: the check costs
     * nothing and the day the root stops clipping is the day it starts
     * meaning something.)
     *
     * What a clipping root DOES do to a control that no longer fits is hide
     * it, in place, with no scrollbar to reach it by. So that is what gets
     * measured: every control's rectangle intersected with each clipping
     * ancestor and with the viewport, and a report when the result is nothing
     * AND no ancestor scrolls — because a control inside a scroll strip is a
     * control the player can still get to.
     */
    if (!clippedReported && step % CLIP_EVERY === 0) {
      const clipped = await evalSafe<string[]>(page, CLIPPED_CONTROLS, []);
      if (clipped.length > 0) {
        findings.push({
          match,
          seed,
          width,
          kind: 'clipped',
          detail: `${clipped.length} control(s) clipped to nothing with no scrollable ancestor at step ${step}: ${clipped.slice(0, 4).join(' | ')}`,
        });
        clippedReported = true;
      }
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
      // v29 — ↻ REMATCH, once per driven match. The control has been on this
      // screen since v22 and on screen in this harness since v26, and nothing
      // has ever pressed it. It remounts the entire match component while the
      // outgoing one's narration timers, damage-float timers and reward
      // round-trip are still unwinding — so a stale timer firing into a dead
      // tree lands here or nowhere. Keep playing afterwards: a rematch that
      // renders and then cannot be played is not a rematch.
      if (REMATCH && rematches === 0 && has(B, '↻ REMATCH')) {
        if (await clickText(page, '↻ REMATCH')) {
          rematches += 1;
          finished = false;
          conceded = false;
          // The second match gets its own budget rather than the tail of the
          // first one's — otherwise a long first match turns REMATCH into a
          // guaranteed `unfinished` report about the wrong thing.
          stepBudget += STEPS;
          await page.waitForTimeout(600);
          const back = await readBoard(page);
          if (back.buttons.length === 0) {
            findings.push({
              match,
              seed,
              width,
              kind: 'hang',
              detail: '↻ REMATCH left the board with no controls at all',
            });
            break;
          }
          continue;
        }
      }
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
    // 4. Confirm dialog. A conceding match answers CONFIRM; every other match
    //    answers CANCEL, which is also what a stray concede click gets.
    if (has(B, 'CANCEL') && has(B, 'CONFIRM') && b.bodyText.includes('Concede this match')) {
      if (concedes && step >= CONCEDE_AFTER) {
        conceded = true;
        await clickText(page, 'CONFIRM');
      } else {
        await clickText(page, 'CANCEL');
      }
      continue;
    }
    // 4b. v29 — resign. Deliberately AFTER the dialog branch above (so the
    //     confirm it raises is answered on the next pass) and before every
    //     branch that would take an ordinary action, so the resignation is
    //     not perpetually deferred by a board that always has something to do.
    if (concedes && !conceded && step >= CONCEDE_AFTER && !narrating) {
      if (await clickSelector(page, '[aria-label="Concede match"]')) continue;
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
      // v29 — a Charm can bond to the player's own Vitality plate, which the
      // pending bar says out loud ("or your Vitality") and which nothing had
      // ever picked: the plate is a `role=button` outside the ring machinery,
      // so a driver that only ever clicked red rings could not reach it.
      if (rand() < 0.2 && (await clickSelector(page, '[aria-label*="tap to target"]'))) continue;
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
        // v29 — the ⏱ ladder, pressed while a run is actually PLAYING. The
        // skipping branch below has cycled it since v19, but a skip tears the
        // narration down in the same step: nothing had ever changed the pace
        // of a run and then watched the rest of it at the new one, which is
        // the only way the timer chain's re-read of the multiplier gets
        // exercised at all.
        if (rand() < 0.03) await clickText(page, '⏱');
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
      // 0.1 -> 0.25: at a tenth, a six-match run could and did finish with the
      // speed ladder never once cycled, which is how a control that is offered
      // on every narration read ends up pressed zero times.
      if (rand() < 0.25) await clickText(page, '⏱');
      await clickText(page, 'SKIP ▸▸');
      continue;
    }
    // 9b. v29 — the turn recap (v26). It greets the player the moment control
    //     comes back, carries the only two controls that exist on it, and no
    //     harness had ever touched either: ▴ FULL LOG (which opens the Battle
    //     Log on the opponent's slice AND clears the strip) and its own ✕.
    //     The strip does not block play, which is exactly why a driver that
    //     only ever pressed what blocked it never met either one.
    if (b.buttons.some((x) => x.key === 'DISMISS THE TURN RECAP')) {
      const roll = rand();
      if (roll < 0.3 && act('recap:log', await clickText(page, '▴ FULL LOG'))) continue;
      if (
        roll < 0.6 &&
        act('recap:dismiss', await clickSelector(page, '[aria-label="Dismiss the turn recap"]'))
      )
        continue;
      // else: leave it up and play on, which is what most players do.
    }
    // 9c. v29 — the hand-order button (v27). Presentation only, and cycling it
    //     mid-turn re-orders the dock UNDER the index tryInvokeHand is about
    //     to use: exactly the kind of seam this driver exists to shake.
    if (rand() < 0.05 && act('hand-sort', await clickText(page, '↕ '))) continue;
    // 9d. v29 — the first-match coach overlay. Two controls, offered on every
    //     match this harness has ever driven, pressed on none of them: the
    //     driver plays straight through the callouts because they do not
    //     block. GOT IT advances the script and SKIP TUTORIAL tears it down
    //     mid-flight, which is the interesting one.
    if (b.buttons.some((x) => x.key === 'GOT IT' || x.key === 'SKIP TUTORIAL')) {
      const roll = rand();
      if (roll < 0.5 && act('coach:got-it', await clickText(page, 'GOT IT'))) continue;
      if (roll < 0.6 && act('coach:skip', await clickText(page, 'Skip tutorial'))) continue;
    }
    // 9d2. v29 — the board's Tip badges. `EXHAUSTED`, `JUST INVOKED`,
    //      `ON THE DRAW`, `ASH 0`, `LOCATIONS PRODUCE YOUR ESSENCE`: every one
    //      of them is a `role="button"` with a portalled popover, every one is
    //      offered on literally every read of the board, and the census found
    //      that not one had ever been pressed. They are also the controls most
    //      likely to swallow a tap meant for the card underneath.
    if (
      rand() < 0.08 &&
      act('tip', await clickSelector(page, '[data-tip]', Math.floor(rand() * 14)))
    ) {
      await page.waitForTimeout(60);
      await page.keyboard.press('Escape');
      continue;
    }
    // 9e. v29 — the glossary. A keyword chip on a card face is a real control
    //     with a real popover behind it (and v28 spent a whole pass on the
    //     fact that these chips are the smallest targets on the board), and
    //     nothing had ever opened one. Cheap, so rarely — but never is worse.
    if (rand() < 0.06 && act('glossary', await clickSelector(page, '[data-keyword-chip]'))) {
      // The popover has no close button by design — outside click, wheel,
      // touchmove or Escape take it down. Escape is the one a keyboard player
      // uses and the one that has to keep working while a match is live.
      await page.waitForTimeout(80);
      await page.keyboard.press('Escape');
      continue;
    }
    // 9f. v29 — the ash-pile drawer, and the 3D inspector behind it.
    //
    //     The driver has OPENED this drawer since v17 and never once closed
    //     it (`CLOSE ASH-PILE`: offered 1,189 times, pressed 0), and the cards
    //     inside it are the board's only route to the 3D card inspector, whose
    //     ↻ SHOW BACK and CLOSE (ESC) had therefore never been pressed either.
    //     Three controls behind one drawer nobody shut.
    if (b.buttons.some((x) => x.key === 'CLOSE ASH-PILE')) {
      if (rand() < 0.4 && (await clickSelector(page, '[data-card-id]', -1))) {
        await page.waitForTimeout(120);
        await clickText(page, '↻ SHOW BACK');
        await page.waitForTimeout(80);
        if (!(await clickText(page, 'CLOSE (ESC)'))) await page.keyboard.press('Escape');
        act('inspect-3d', true);
        continue;
      }
      if (act('ash:close', await clickSelector(page, '[aria-label="Close ash-pile"]'))) continue;
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
      // v29 — `ASH N` (the OPPONENT's pile, top-left) against `ASH-PILE N`
      // (the player's own, bottom-right): two drawers, and the census found
      // the driver had opened one of them 3,940 times and the other never.
      const chrome = ['ASH-PILE', 'ASH ', '▴ LOG', '▾ LOG'][Math.floor(rand() * 4)];
      if (act(`chrome:${chrome}`, await clickText(page, chrome))) continue;
    }
    for (const label of ['TO CLASH', 'SKIP TO MAIN II', 'END TURN', 'NEXT ▸']) {
      if (B.some((x) => !x.disabled && x.text.includes(label))) {
        // v29 — a quarter of the time, take the phase with the SPACE shortcut
        // instead of the pointer. Same control, a path nothing had pressed.
        if (rand() < 0.25 && act(`space:${label}`, await pressSpace(page))) break;
        if (act(`phase:${label}`, await clickText(page, label))) break;
      }
    }
  }

  const final = await readBoard(page);
  // A rematch spends the same step budget on a SECOND match, so running out
  // part-way through it is the budget doing its job rather than a match that
  // could not finish. Only a driver that never reached a winner at all has
  // found the thing this report is about.
  if (!finished && rematches === 0) {
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
  if (concedes) concedeRun.total += 1;
  if (conceded) concedeRun.done += 1;
  rematchesDriven += rematches;
  if (winnable) winnableRun.total += 1;
  if (outcome === 'VICTORY') {
    victories += 1;
    if (winnable) winnableRun.won += 1;
  }
  console.log(
    `match ${match} (seed ${seed}, ${width}x${height}, ${bigText ? '200% text, ' : ''}${winnable ? 'winnable, ' : ''}${
      conceded ? 'conceded, ' : ''
    }${rematches > 0 ? `rematched ${rematches}x, ` : ''}${
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
  const winnable = WIN_EVERY > 0 && m % WIN_EVERY === 0;
  // A conceding match must not also be a winnable one — the handicap exists to
  // reach VICTORY, and a resignation throws that away.
  const concedes = CONCEDE_EVERY > 0 && !winnable && m % CONCEDE_EVERY === 0;
  // The SECOND phone match, so the first one still measures the default size:
  // a regression that only shows at 200% and one that shows at both are
  // different findings and want different reports.
  const bigText = BIG_TEXT && width === PHONE && m === 1;
  // One LANDSCAPE match (v29). Every run this harness has ever done used a
  // 900px-tall window, so the one orientation a phone spends half its life in
  // had never been driven — and the first measurement of it found twenty
  // controls clipped away with no way to reach them, the player's Leader and
  // their whole hand among them.
  const landscape = LANDSCAPE && m === 2;
  await driveMatch(
    browser,
    m,
    SEED0 + m,
    landscape ? LANDSCAPE_W : width,
    mode,
    winnable,
    concedes,
    bigText,
    landscape ? LANDSCAPE_H : 900,
  );
}

await browser.close();

// A run where the handicap never once produced a win measured the victory
// screen exactly as much as the pre-v26 driver did: not at all. Say so rather
// than printing a clean sheet for a state nothing rendered.
if (CONCEDE_EVERY > 0 && concedeRun.total > 0 && concedeRun.done === 0) {
  findings.push({
    match: -1,
    seed: SEED0,
    width: WIDE,
    kind: 'unfinished',
    detail: `${concedeRun.total} match(es) were scheduled to resign and none reached CONFIRM — the concede path went unmeasured`,
  });
}
if (WIN_EVERY > 0 && winnableRun.total > 0 && winnableRun.won === 0) {
  findings.push({
    match: -1,
    seed: SEED0,
    width: WIDE,
    kind: 'unfinished',
    detail: `${winnableRun.total} winnable match(es) and no VICTORY — the victory screen went unmeasured`,
  });
}
console.log(
  `\n${victories} VICTORY / ${MATCHES} match(es) (${winnableRun.won}/${winnableRun.total} of the winnable ones) · ${concedeRun.done}/${concedeRun.total} resigned · ${rematchesDriven} rematch(es) driven`,
);

// ---- the control census (v29) ---------------------------------------------
const rows = [...census.entries()].sort((a, b) => b[1].offeredIn.size - a[1].offeredIn.size);
console.log(`\n=== control census: ${rows.length} distinct control(s) offered ===`);
for (const [key, row] of rows) {
  const exempt = CENSUS_EXEMPT.get(key);
  const mark = row.pressed > 0 ? '  ' : exempt ? '– ' : '! ';
  console.log(
    `${mark}${key.padEnd(46)} offered ${String(row.offered).padStart(5)}x in ${
      row.offeredIn.size
    } match(es) · pressed ${String(row.pressed).padStart(4)}x in ${row.pressedIn.size}${
      exempt ? `  [exempt: ${exempt}]` : ''
    }`,
  );
}
const unpressed = rows.filter(
  ([key, row]) =>
    row.pressed === 0 && !CENSUS_EXEMPT.has(key) && row.offeredIn.size >= COVERAGE_MIN_MATCHES,
);
// Capped like the tap-target report: the point of this list is to be acted on,
// and 300 rows of it is a wall rather than a work item. The full census above
// is always complete.
for (const [key, row] of unpressed.slice(0, COVERAGE_CAP)) {
  findings.push({
    match: -1,
    seed: SEED0,
    width: WIDE,
    kind: 'coverage',
    detail: `never pressed: "${key}" was offered ${row.offered}x across ${row.offeredIn.size} match(es) and the driver never once clicked it`,
  });
}
if (unpressed.length > COVERAGE_CAP) {
  findings.push({
    match: -1,
    seed: SEED0,
    width: WIDE,
    kind: 'coverage',
    detail: `…and ${unpressed.length - COVERAGE_CAP} more control(s) offered in ${COVERAGE_MIN_MATCHES}+ matches and never pressed (full list in the census above)`,
  });
}
/**
 * Coverage is reported, not gated — and the split is deliberate.
 *
 * Every other finding this harness produces is a defect in the GAME: a crash,
 * a hang, a control clipped away, a narration that never ends. A coverage row
 * is a gap in the HARNESS — a control the driver has not learned to press yet
 * — and folding the two into one exit code says "the match is broken" when
 * what is true is "the driver is not finished". The first census found 306 of
 * them; this pass closed the ones that were reachable and left a list. Making
 * the census a gate is the job of the pass that clears it, and it should be
 * done by moving rows out of this list, never by widening the exemptions.
 */
const gating = findings.filter((f) => f.kind !== 'coverage');
const coverage = findings.filter((f) => f.kind === 'coverage');
console.log(`\n=== ${gating.length} finding(s) ===`);
for (const f of gating) {
  console.log(`match ${f.match} seed ${f.seed} @${f.width} [${f.kind}] ${f.detail}`);
}
if (coverage.length > 0) {
  console.log(`\n=== ${coverage.length} coverage gap(s) — reported, not gated ===`);
  for (const f of coverage) console.log(`[${f.kind}] ${f.detail}`);
}
process.exit(gating.length > 0 ? 1 : 0);
