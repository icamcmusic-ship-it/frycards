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
 * v28 adds two checks and one entry class:
 *
 *  - **tap targets.** The roadmap's mobile item has said since v11 that the
 *    remaining phone work is "the things a geometry check cannot see — tap
 *    target sizes, text scaling, real-device behaviour", and then nobody
 *    measured the first one for sixteen passes. Every visible control is now
 *    measured against WCAG 2.5.8 (AA)'s 24x24 CSS px minimum, counting a
 *    `.tap-target` pseudo-element's expansion where one is present. The first
 *    run found 1,300+ undersized controls across nine screens.
 *  - **an under-measurement guard.** The load pass and the click sweep read
 *    the same screen at the same width, so the load pass's count is a LOWER
 *    BOUND on what the sweep should see. When the sweep settles below it the
 *    run now reports a problem instead of printing `clicked 0 control(s)` and
 *    exiting 0 — which is v14's finding recurring through a different door
 *    (this time `inspect`, whose six controls the load pass had just counted).
 *  - **`decks@editor` / `decks@new`.** The deck LIST has five controls; the
 *    EDITOR behind its EDIT button has ~400 (the pool grid, the filters, the
 *    curve, the deck list, the save bar) and is where a player spends the
 *    whole session. Same PRELUDE rule v22 wrote for the pack reveal: a screen
 *    the player passes through is not the screen they stop on.
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
  // v26 — the Grading Lab shipped in v25 with no harness entry at all, so the
  // newest layout in the game was the only one never measured. Its two other
  // tabs are behind a tab click, which is a PRELUDE hop, not a depth-two one:
  // the sweep would measure the submit form again under a different name.
  'grading',
  'grading@limbo',
  'grading@vault',
  // v27 — the 3D Showroom, and its slab geometry separately: the slab is a
  // different object in the room (thicker solid, taller footprint, its own
  // edge material) reached only through a source-tab click, so measuring the
  // card entry measures none of it.
  'showroom',
  'showroom-slab',
  // v28 — the deck builder's LIST is five controls (back, forge, import, edit,
  // delete); everything a deck is actually built with lives in the editor
  // behind EDIT, and had never been swept at either width.
  'decks@editor',
  'decks@new',
  // v29 — the sign-in screen, which is the FIRST screen every player sees and
  // the only one this sweep had never loaded. `App` renders it above the meta
  // shell entirely (`if (!session && !guest) return <AuthScreen />`), so it
  // was never in `meta-preview.tsx`'s switch and seventeen passes of phone
  // measurement went straight past it. Both modes: CREATE ACCOUNT adds a
  // third field and is a different layout, not a different label.
  'auth',
  'auth@signup',
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
  'grading@limbo': ['AT THE GRADERS'],
  'grading@vault': ['MY SLABS'],
  'decks@editor': ['EDIT'],
  // The empty editor is a different layout from the full one: no leader, no
  // curve, an empty deck list and a pool grid with nothing dimmed.
  'decks@new': ['FORGE NEW DECK'],
  'auth@signup': ['CREATE ACCOUNT'],
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
/**
 * WCAG 1.4.10 (Reflow, AA) — the width content must survive without a
 * horizontal scrollbar. 320 CSS px is the standard's own floor, and it is
 * also what a 1280px desktop window becomes at 400% browser zoom.
 *
 * v29. The sweep has measured 375 and 1280 since v12, and the roadmap's
 * mobile item has said since v11 that "text scaling" is one of the three
 * things a geometry check cannot see. Two of those three turn out to be
 * geometry after all — v28 did tap targets, and this is the page-zoom half of
 * text scaling. See TEXT_SCALE below for the browser-font half.
 *
 * Load pass only: a full click sweep at a third width would add an hour to a
 * run that already takes one, and the failure this catches (a fixed-width
 * element pushing the page wider than the viewport) is a property of the
 * layout, not of what has been clicked.
 */
const REFLOW_W = Number(process.env.REFLOW_W ?? 320);
const SKIP_REFLOW = process.env.SKIP_REFLOW === '1';
/**
 * WCAG 1.4.4 (Resize text, AA) — text at 200% of the user's chosen size.
 *
 * Emulated the way a browser actually does it: `Page.setFontSizes` is the CDP
 * behind Chromium's own Settings → Appearance → Font size, so what this
 * measures is precisely what happens to a player who sets their browser font
 * to Very Large. Text sized in `px` does not move under that setting — by
 * design, in every browser — so on a design that sizes everything in px the
 * honest reading is a COUNT of how much of the page responds at all, printed
 * every run, rather than a gate that can only be satisfied by a rewrite.
 *
 * The first run predicted a low number and a clean sheet — a px-locked design
 * would simply not move, and the conformant path for one is page zoom (which
 * the reflow pass above measures). The number came back **40%**, and TEN
 * states across nine screens overflowed. The app is not px-locked; it is
 * MIXED.
 * Tailwind's named sizes (`text-sm`, `text-xs`, `text-3xl`) are rem and grow,
 * the arbitrary ones (`text-[10px]`) are px and do not, and both are used side
 * by side inside the same rows — so at 200% a row's label doubles while the
 * fixed-width thing beside it does not, and the row pushes off the side of the
 * phone. That is a real defect and it is gated, not printed: overflow under
 * text resize is reported exactly like overflow at 375px, with the widest
 * offending element named.
 *
 * The COUNT stays a printed measurement rather than a target. There is no
 * right value for it — a design may legitimately fix some type in px — and a
 * number that moves is what is worth looking at.
 */
const TEXT_SCALE = Number(process.env.TEXT_SCALE ?? 200);
/**
 * WCAG 2.1.1 / 2.4.7 / 2.1.2 — the keyboard, measured (v30).
 *
 * Every axis this sweep has ever measured is a POINTER axis. Overflow is what
 * a finger cannot scroll to, the 24x24 minimum is what a thumb cannot hit, the
 * reflow and text-resize passes are both about a phone. Eighteen passes, and
 * the question "can this screen be operated without a pointer at all" had
 * never once been asked — which matters more here than in most apps, because
 * this one draws a large share of its controls as `<div role="button">` (a
 * card face cannot be a `<button>`: it prints its own keyword and cost chips
 * as buttons, and nesting those is invalid HTML). A `div` is not focusable
 * unless somebody remembered `tabIndex`, and "somebody remembered" is exactly
 * the kind of claim a harness exists to stop trusting.
 *
 * Three checks, all driven by pressing the real Tab key rather than by
 * reasoning about the DOM — the browser's own sequential focus navigation is
 * the thing under test, and `el.focus()` would answer a different question
 * (and set `:focus-visible` under a different heuristic):
 *
 *  - **reachable (2.1.1)**: an enabled, visible control the Tab walk never
 *    lands on. Only reported once the walk has WRAPPED — a screen with more
 *    controls than MAX_TABS reports the shortfall as an unmeasured note
 *    instead, because "never reached" out of a walk that stopped early is the
 *    same silent cap this file has caught itself taking three times.
 *  - **visible focus (2.4.7)**: a control the walk lands on that matches
 *    `:focus-visible` and draws nothing — no outline and no box-shadow. The
 *    stylesheet has a global focus ring; `outline-none` is applied by hand in
 *    a dozen places, and which of the two wins is a specificity/source-order
 *    question that is much better measured than argued.
 *  - **no trap (2.1.2)**: focus that stops moving under repeated Tab presses,
 *    which is a keyboard user stuck on a screen with no way out.
 */
const MAX_TABS = Number(process.env.MAX_TABS ?? 1400);
const SKIP_KEYBOARD = process.env.SKIP_KEYBOARD === '1';
const CONTROLS = 'button:visible, [role="button"]:visible';

/**
 * A screen's identity for the purposes of "did that prelude click land?" (v30).
 *
 * It used to be the CONTROL COUNT, and the count is blind in exactly the case
 * v29 added its newest entry for. `auth@signup` drives the sign-in screen into
 * CREATE ACCOUNT mode, whose difference from SIGN IN is a third *field* — and
 * a field is an `<input>`, which `CONTROLS` does not select. The count went
 * 6 → 6, the harness concluded the click had missed, and it reported that
 * honestly; what it could not do was land. So every check `auth@signup` ran —
 * overflow at three widths, tap targets, text resize, the click sweep — ran on
 * the SIGN IN screen under the signup screen's name, which is the third time
 * this file has caught an entry measuring a state it was supposed to be
 * leaving.
 *
 * The fix is to stop using a number that only counts one kind of thing. The
 * signature is the control count, the fields, and the control LABELS — a tab
 * row that swaps two labels without changing the count moves it too, which the
 * count never did either.
 */
const SCREEN_SIG = `(() => {
  var btns = Array.prototype.slice.call(document.querySelectorAll('button, [role="button"]'));
  var labels = btns
    .map(function (el) {
      return (el.getAttribute('aria-label') || el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 24);
    })
    .join('|');
  var fields = document.querySelectorAll('input, select, textarea').length;
  return btns.length + ':' + fields + ':' + labels.slice(0, 4000);
})()`;
const screenSig = (page: import('playwright').Page) =>
  page.evaluate(SCREEN_SIG).catch(() => '') as Promise<string>;

/**
 * Walk an entry's PRELUDE into the state being measured, and say so when it
 * does not land.
 *
 * v30: this was three copies, and only one of them (the click sweep's) had the
 * retry and the signature test. `textScale` and the keyboard walk clicked once
 * and waited 600ms — so `grading@vault` measured the SUBMIT tab under the
 * vault's name in one run and the vault in the next, silently, and the
 * keyboard walk's candidate count moved between 16 and 254 depending on which
 * screen it happened to get. A prelude that is unreliable in one pass is
 * unreliable in all of them; there is one implementation now.
 */
async function runPrelude(
  page: import('playwright').Page,
  screen: string,
  width: number,
  where = `${screen} prelude`,
) {
  for (const label of PRELUDE[screen] ?? []) {
    const before = await screenSig(page);
    let landed = false;
    // Three attempts, with a growing wait: a prelude that has to mount 241
    // controls (the deck editor) settles slower than one that swaps a form,
    // and the click sweep replays the prelude on EVERY one of its ~41 loads —
    // so a prelude that lands 39 times out of 41 stops the sweep dead at
    // whichever load missed, which is what `decks@editor` reported this pass
    // (settled at 241, clicked 5).
    for (let attempt = 0; attempt < 3 && !landed; attempt++) {
      const target = page.locator(`${CONTROLS}`, { hasText: label }).first();
      await target.click({ timeout: 4000 }).catch(() => undefined);
      for (let i = 0; i < 16 + attempt * 8; i++) {
        await page.waitForTimeout(250);
        if ((await screenSig(page)) !== before) {
          landed = true;
          break;
        }
      }
    }
    if (!landed) {
      problems.push({
        where,
        width,
        kind: 'unmeasured',
        detail:
          `the prelude step "${label}" did not change the screen after three clicks and ` +
          `~28s of waiting, so this entry measured the state it was supposed to be leaving.`,
      });
    }
  }
}

/** Console noise an offline preview cannot avoid. The realtime client retries
 * its socket on every screen that subscribes, so the WebSocket/tunnel variants
 * matter as much as the fetch ones — without them a clean run reports twenty
 * "problems" that are all one dropped connection. */
const NETWORK_NOISE =
  /Failed to load resource|net::ERR|ERR_TUNNEL|ERR_PROXY|Failed to fetch|AuthRetryable|WebSocket connection|tunnel via proxy/i;

interface Problem {
  where: string;
  width: number;
  kind: 'overflow' | 'console' | 'blank' | 'tap-target' | 'unmeasured' | 'text-scale' | 'keyboard';
  detail: string;
}

const problems: Problem[] = [];
/**
 * Controls exempted under WCAG 2.5.8's inline rule, by state.
 *
 * Printed at the end of every run. An exception that is applied silently is
 * indistinguishable from a check that stopped looking, which is the failure
 * this file has recorded three times in other forms.
 */
const inlineExempt = new Map<string, number>();

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
/**
 * What the LOAD pass counted for each screen at 375px.
 *
 * The click sweep reads the same screen at the same width, so this is a lower
 * bound on what it should settle at. v14 found a sweep that read 0 and printed
 * `clicked 0 control(s)` — indistinguishable from "checked, nothing to click"
 * — and fixed the sampling; v28 found the same line printed again, for
 * `inspect`, whose six controls the load pass had counted forty seconds
 * earlier. The sampling is not the durable fix; comparing against a number the
 * run already has is. See `expect` on `check`.
 */
const loadCount = new Map<string, number>();

async function check(screen: string, width: number, path: number[] = [], expect = 0) {
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
  //
  // Each step then waits for the control count to actually MOVE, rather than a
  // flat sleep. `settledControlCount`'s two-equal-samples rule cannot cover an
  // animation: the pack tear runs an 850ms timer before it swaps in the reveal,
  // so a 450ms wait left the settle sampling `1, 1` — two equal reads, "settled"
  // — and the entry measured the state it was supposed to be leaving while
  // still printing a clean pass. Exactly the failure `settledControlCount`'s own
  // header describes, arriving through a timer instead of a progressive render.
  await runPrelude(page, screen, width);
  let settled = await settledControlCount(page);
  // A settle far below what the load pass counted is a race, not a screen with
  // fewer controls — give it a second chance before believing it. `expect` is
  // already capped at what the sweep can USE (see `sweepFloor`), so this does
  // not re-sample a 961-tile grid for the sake of the tail it will never
  // reach; it fires on the order-of-magnitude misses the guard is about.
  //
  // v29: ONE extra chance was not enough. The full 29-entry run fired this
  // guard on `pack@reveal` (clicked 4 of 6) and `pack@summary` (3 of 12) while
  // the same two entries measured perfectly under `ONLY=pack` — the difference
  // being that the full run had a balance sim on the other three cores. A
  // sampling window tuned on an idle machine is a sampling window that
  // reports "not measured" whenever the machine is busy, which is exactly when
  // a long sweep runs. Keep asking, with a longer wait each time, and stop the
  // moment the count reaches the number it is being compared against.
  for (let tries = 0; tries < 3 && expect > 0 && settled < expect; tries++) {
    await page.waitForTimeout(1200 * (tries + 1));
    settled = Math.max(settled, await settledControlCount(page));
  }

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

  // Tap targets. WCAG 2.5.8 (AA) asks every pointer target to be at least
  // 24x24 CSS px. The PAINTED box may legitimately be smaller than that — a
  // keyword chip on a card face has to be tiny or the card stops being a card
  // — so what is measured is the box UNION the `.tap-target` pseudo-element's
  // minimum, which is the whole point of that utility: grow the target, not
  // the ink. Only the phone width is checked; a 24px target is a thumb rule,
  // and the desktop pass would report the same elements against a mouse.
  if (width === 375) {
    const measured = await page
      .evaluate(() => {
        const out: string[] = [];
        let exempt = 0;
        const sel = 'button, [role="button"], input, select, a[href], summary, textarea';
        for (const el of Array.from(document.querySelectorAll(sel))) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const st = getComputedStyle(el);
          if (st.visibility === 'hidden' || st.display === 'none') continue;
          if ((el as HTMLInputElement).type === 'hidden') continue;
          // WCAG 2.5.8's INLINE exception: a target inside a sentence, whose
          // size is constrained by the line-height of the non-target text
          // around it, is out of scope. It is declared at the element (see
          // `data-inline-target` on CardFaceV4's KeywordText) rather than
          // guessed from `display`, because a <button> computes to
          // inline-block whether or not it is actually mid-sentence — and an
          // exception the harness infers is an exception nobody chose. The
          // count is reported either way, so the carve-out stays visible.
          if (el.getAttribute('data-inline-target') === '1') {
            exempt++;
            continue;
          }
          let w = r.width;
          let h = r.height;
          // A `.tap-target` expands its hit area with an absolutely positioned
          // ::after carrying min-width/min-height. Count it, or the utility
          // that fixes the finding looks like the finding.
          const after = getComputedStyle(el, '::after');
          if (after && after.content !== 'none' && after.position === 'absolute') {
            w = Math.max(w, parseFloat(after.minWidth) || 0);
            h = Math.max(h, parseFloat(after.minHeight) || 0);
            // ...but only as far as an ancestor lets it out. `overflow: hidden`
            // clips hit-testing as well as painting, so a declared 24x24 inside
            // a clipped row (the card face's own chip budget is exactly that)
            // is not 24x24 in the hand. Measuring the DECLARATION rather than
            // the result is how a check ends up certifying its own utility.
            const cx = r.left + r.width / 2;
            const cy = r.top + r.height / 2;
            let x0 = cx - w / 2;
            let x1 = cx + w / 2;
            let y0 = cy - h / 2;
            let y1 = cy + h / 2;
            for (let a = el.parentElement; a; a = a.parentElement) {
              const st2 = getComputedStyle(a);
              const clipX = st2.overflowX !== 'visible';
              const clipY = st2.overflowY !== 'visible';
              if (!clipX && !clipY) continue;
              const ar = a.getBoundingClientRect();
              if (clipX) {
                x0 = Math.max(x0, ar.left);
                x1 = Math.min(x1, ar.right);
              }
              if (clipY) {
                y0 = Math.max(y0, ar.top);
                y1 = Math.min(y1, ar.bottom);
              }
            }
            w = Math.max(r.width, x1 - x0);
            h = Math.max(r.height, y1 - y0);
          }
          if (w >= 24 && h >= 24) continue;
          const name = (
            el.getAttribute('aria-label') ||
            el.textContent ||
            (el as HTMLInputElement).placeholder ||
            el.tagName
          )
            .trim()
            .slice(0, 30);
          out.push(`${el.tagName} "${name}" ${Math.round(w)}x${Math.round(h)}`);
        }
        // One row per distinct control shape: a grid of 300 identical card
        // tiles is ONE finding repeated, and printing it 300 times buries
        // every other problem in the run.
        return { tiny: [...new Set(out)], exempt };
      })
      .catch(() => ({ tiny: [] as string[], exempt: 0 }));
    if (measured.exempt > 0) inlineExempt.set(where, measured.exempt);
    const tiny = measured.tiny;
    for (const t of tiny.slice(0, 8)) {
      problems.push({ where, width, kind: 'tap-target', detail: `${t} (min 24x24)` });
    }
    if (tiny.length > 8) {
      problems.push({
        where,
        width,
        kind: 'tap-target',
        detail: `…and ${tiny.length - 8} more distinct undersized control(s)`,
      });
    }
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

/** Run totals for the 1.4.4 measurement, printed with the summary. */
const textScaleTotals = { responded: 0, leaves: 0 };

/**
 * Load `screen` at phone width, double the browser's font-size setting, and
 * report what moved.
 *
 * `Page.setFontSizes` is Chromium's own font-size preference, so a text node
 * that does not grow under it is a text node that will not grow for a player
 * who sets their browser font larger either. Counting the LEAVES (elements
 * with text and no element children) rather than every node keeps one
 * paragraph from counting as six.
 */
async function textScale(screen: string) {
  const ctx = await browser.newContext({ viewport: { width: 375, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}?screen=${screenQuery(screen)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  await page.waitForTimeout(700);
  await runPrelude(page, screen, 375, `${screen} prelude (text resize)`);
  const SAMPLE = `(() => {
    var out = [];
    var els = document.querySelectorAll('body *');
    for (var i = 0; i < els.length && out.length < 600; i++) {
      var el = els[i];
      if (el.children.length > 0) continue;
      var t = (el.textContent || '').trim();
      if (!t) continue;
      var r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      out.push(parseFloat(getComputedStyle(el).fontSize) || 0);
    }
    return out;
  })()`;
  const before = (await page.evaluate(SAMPLE).catch(() => [])) as number[];
  const cdp = await ctx.newCDPSession(page);
  // Chromium's defaults are 16 (standard) and 13 (fixed); scale both.
  await cdp
    .send('Page.setFontSizes', {
      fontSizes: {
        standard: Math.round((16 * TEXT_SCALE) / 100),
        fixed: Math.round((13 * TEXT_SCALE) / 100),
      },
    })
    .catch(() => undefined);
  await page.waitForTimeout(500);
  const after = (await page.evaluate(SAMPLE).catch(() => [])) as number[];
  const geom = await page
    .evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }))
    .catch(() => ({ scrollWidth: 0, innerWidth: 1 }));
  // Name the element, not just the number. An overflow report that says
  // `392 > 375` sends whoever reads it back to the browser to find out WHAT
  // is 17px too wide; the page already knows.
  //
  // CLIPS COMPOSE — the lesson v28's tap-target check paid for twice. An
  // element inside an `overflow-x: auto` strip (the Showroom's HUD row, the
  // Collection's filter rail) sticks out of the viewport by its own rect and
  // contributes NOTHING to the document's scroll width, because its ancestor
  // scrolls instead. Reporting it names a control that is working as designed
  // and buries the one that is not, so every candidate's right edge is
  // intersected with every clipping ancestor before it counts.
  const offenders = (await page
    .evaluate(() => {
      const out: string[] = [];
      const w = window.innerWidth;
      const bad: Element[] = [];
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right <= w + 1) continue;
        let right = r.right;
        for (let a = el.parentElement; a; a = a.parentElement) {
          if (getComputedStyle(a).overflowX === 'visible') continue;
          right = Math.min(right, a.getBoundingClientRect().right);
        }
        if (right <= w + 1) continue;
        bad.push(el);
      }
      // Innermost only: an overflowing child makes every ancestor overflow,
      // and the ancestors are not the bug.
      for (const el of bad) {
        if (bad.some((o) => o !== el && el.contains(o))) continue;
        const cls = String((el as HTMLElement).className || '').slice(0, 70);
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30);
        out.push(
          `<${el.tagName.toLowerCase()}${cls ? ` class="${cls}"` : ''}> "${txt}" right=${Math.round(
            el.getBoundingClientRect().right,
          )}`,
        );
        if (out.length >= 3) break;
      }
      return out;
    })
    .catch(() => [])) as string[];
  const n = Math.min(before.length, after.length);
  let responded = 0;
  for (let i = 0; i < n; i++) if (after[i] > before[i] + 0.01) responded++;
  await cdp.detach().catch(() => undefined);
  await ctx.close();
  return {
    leaves: n,
    responded,
    overflow: geom.scrollWidth > geom.innerWidth + 1,
    scrollWidth: geom.scrollWidth,
    innerWidth: geom.innerWidth,
    offenders,
  };
}

/** Run totals for the keyboard pass, printed with the summary. */
const keyboardTotals = { reached: 0, candidates: 0, wrapped: 0, screens: 0 };

/**
 * Tab through a screen and report what the keyboard cannot do.
 *
 * The walk runs at desktop width: a keyboard is a desktop/AT input, and the
 * phone widths the rest of this file measures would only change which controls
 * are on screen, not whether Tab reaches them.
 */
async function keyboard(screen: string) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}?screen=${screenQuery(screen)}`, {
    waitUntil: 'domcontentloaded',
    timeout: 20_000,
  });
  await page.waitForTimeout(700);
  await runPrelude(page, screen, 1280, `${screen} prelude (keyboard)`);
  await page.waitForTimeout(400);

  // Tag every candidate so a Tab landing can be identified by index rather
  // than by a selector re-derived per press (which would not survive a screen
  // that re-renders mid-walk).
  const candidates = (await page
    .evaluate(() => {
      const sel = [
        'button:not([disabled])',
        '[role="button"]',
        'a[href]',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        'summary',
      ].join(', ');
      const out: { i: number; name: string; optedOut: boolean }[] = [];
      let i = 0;
      for (const el of Array.from(document.querySelectorAll(sel))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const st = getComputedStyle(el);
        if (st.visibility === 'hidden' || st.display === 'none') continue;
        if ((el as HTMLInputElement).type === 'hidden') continue;
        if (el.getAttribute('aria-disabled') === 'true') continue;
        if (el.closest('[aria-hidden="true"], [inert]')) continue;
        const name = (
          el.getAttribute('aria-label') ||
          el.textContent ||
          (el as HTMLInputElement).placeholder ||
          el.tagName
        )
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 34);
        el.setAttribute('data-kbd-i', String(i));
        out.push({
          i,
          name: `<${el.tagName.toLowerCase()}> "${name}"`,
          // An explicit `tabindex="-1"` is a DECLARATION that this control is
          // not in the tab order — sometimes correct (a roving-tabindex group,
          // a programmatically focused dialog), sometimes the bug itself. It
          // is counted and named separately rather than folded into the
          // unreachable list, the same way v28's inline tap-target exception
          // is declared at the element rather than inferred.
          optedOut: el.getAttribute('tabindex') === '-1',
        });
        i++;
      }
      return out;
    })
    .catch(() => [] as { i: number; name: string; optedOut: boolean }[])) as {
    i: number;
    name: string;
    optedOut: boolean;
  }[];

  // Start the walk from the top of the document, not from wherever the
  // PRELUDE left focus. A prelude clicks a button, which focuses it, and Tab
  // then continues FORWARD from there — so every control ahead of the prelude
  // button in the tab order was only reachable after a wrap the walk stops at,
  // and the first run reported "< MENU", "SIGN IN" and "CREATE ACCOUNT" as
  // unreachable on screens where they are the first things a Tab press finds.
  await page
    .evaluate(() => {
      (window as unknown as { __kbdFirst?: Element | null }).__kbdFirst = null;
      const el = document.activeElement as HTMLElement | null;
      el?.blur?.();
      // Reset the browser's SEQUENTIAL FOCUS NAVIGATION STARTING POINT, which
      // is not the same thing as focus and is not cleared by `blur()`: a click
      // sets it, so after a PRELUDE click Tab carries on from the clicked
      // control and everything ahead of it in the tab order is only reachable
      // after a wrap. Focusing the body moves the starting point to the top of
      // the document, which is where a fresh Tab press should begin.
      const b = document.body;
      const had = b.getAttribute('tabindex');
      b.setAttribute('tabindex', '-1');
      b.focus();
      if (had === null) b.removeAttribute('tabindex');
    })
    .catch(() => undefined);
  const reached = new Set<number>();
  /** Controls that were focused but drew no focus indicator. */
  const invisible = new Set<string>();
  /**
   * Controls that took `:focus-visible` AND drew something.
   *
   * Printed beside the failures on purpose. A 2.4.7 check that reports "0
   * without a ring" is indistinguishable from a 2.4.7 check whose
   * `:focus-visible` predicate never matches anything — a green light and a
   * dead instrument print the same line — so the run also prints how many
   * times the check FIRED positively.
   */
  let ringed = 0;
  let wrapped = false;
  let trap = '';
  let lastKey = '';
  let sameRun = 0;

  for (let t = 0; t < MAX_TABS; t++) {
    await page.keyboard.press('Tab');
    const at = (await page
      .evaluate(() => {
        const w = window as unknown as { __kbdFirst?: Element | null };
        const el = document.activeElement as HTMLElement | null;
        if (!el || el === document.body || el === document.documentElement) {
          return { key: 'body', i: -1, indicator: true, name: 'body', isFirst: false };
        }
        // NODE identity for "have we come back to the start", not the label:
        // two controls can share a name, and a walk that decides it has
        // wrapped the second time it sees a familiar-looking one then reports
        // everything it had not yet visited as unreachable.
        let isFirst = false;
        if (!w.__kbdFirst) w.__kbdFirst = el;
        else isFirst = w.__kbdFirst === el;
        const st = getComputedStyle(el);
        const outline = st.outlineStyle !== 'none' && (parseFloat(st.outlineWidth) || 0) >= 1;
        const shadow = st.boxShadow !== 'none' && st.boxShadow !== '';
        // Only elements the browser itself has decided to show a ring for are
        // held to 2.4.7 — `:focus-visible` is the standard's own "did this
        // focus come from the keyboard" answer, and second-guessing it here
        // would report every mouse click as a violation.
        const visible = el.matches(':focus-visible');
        const iAttr = el.getAttribute('data-kbd-i');
        const name = (
          el.getAttribute('aria-label') ||
          el.textContent ||
          (el as HTMLInputElement).placeholder ||
          el.tagName
        )
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 34);
        return {
          key: `${iAttr ?? 'x'}:${el.tagName}:${name}`,
          i: iAttr === null ? -1 : Number(iAttr),
          focusVisible: visible,
          indicator: !visible || outline || shadow,
          name: `<${el.tagName.toLowerCase()}> "${name}"`,
          isFirst,
        };
      })
      .catch(() => null)) as {
      key: string;
      i: number;
      focusVisible: boolean;
      indicator: boolean;
      name: string;
      isFirst: boolean;
    } | null;
    if (!at) break;

    if (at.key === lastKey) {
      sameRun += 1;
      // Four presses that do not move focus is not a slow screen; it is a
      // control that has taken the keyboard and will not give it back —
      // UNLESS the screen has exactly one tabbable control, in which case Tab
      // has nowhere else to go and landing on it again is the cycle, not a
      // trap. The pack screen (one control before the pack is torn) reported
      // a keyboard trap on JUST TEAR IT OPEN FOR ME for exactly that reason.
      if (sameRun >= 4 && at.key !== 'body' && candidates.length > 1) {
        trap = at.name;
        break;
      }
      if (sameRun >= 4) {
        wrapped = true;
        break;
      }
    } else {
      sameRun = 0;
    }
    lastKey = at.key;

    if (at.i >= 0) {
      if (at.isFirst && reached.size > 1) {
        wrapped = true;
        break;
      }
      reached.add(at.i);
      if (!at.indicator) invisible.add(at.name);
      else if (at.focusVisible) ringed += 1;
    } else if (at.key === 'body' && reached.size > 0) {
      // Tab has walked off the end of the document and back to the browser
      // chrome — the walk is complete for this screen.
      wrapped = true;
      break;
    }
  }

  await ctx.close();

  const optedOut = candidates.filter((c) => c.optedOut);
  const unreached = candidates.filter((c) => !c.optedOut && !reached.has(c.i));

  if (trap) {
    problems.push({
      where: `${screen} keyboard`,
      width: 1280,
      kind: 'keyboard',
      detail: `focus did not move across 4 Tab presses on ${trap} (WCAG 2.1.2, no keyboard trap)`,
    });
  }
  for (const name of [...invisible].slice(0, 6)) {
    problems.push({
      where: `${screen} keyboard`,
      width: 1280,
      kind: 'keyboard',
      detail: `${name} takes :focus-visible and draws no outline or shadow (WCAG 2.4.7)`,
    });
  }
  if (invisible.size > 6) {
    problems.push({
      where: `${screen} keyboard`,
      width: 1280,
      kind: 'keyboard',
      detail: `…and ${invisible.size - 6} more focused control(s) with no visible focus indicator`,
    });
  }
  if (wrapped) {
    // One row per distinct control shape, same rule the tap-target check uses:
    // a grid of 300 identical tiles is one finding repeated.
    const shapes = [...new Set(unreached.map((c) => c.name))];
    for (const name of shapes.slice(0, 6)) {
      problems.push({
        where: `${screen} keyboard`,
        width: 1280,
        kind: 'keyboard',
        detail: `${name} is enabled and visible and Tab never reaches it (WCAG 2.1.1)`,
      });
    }
    if (shapes.length > 6) {
      problems.push({
        where: `${screen} keyboard`,
        width: 1280,
        kind: 'keyboard',
        detail: `…and ${shapes.length - 6} more distinct control shape(s) Tab never reaches`,
      });
    }
  } else if (candidates.length > 0) {
    // NOT a pass. The walk stopped at the cap, so "never reached" is unknown
    // for whatever is past it — say so where the answer would have gone.
    problems.push({
      where: `${screen} keyboard`,
      width: 1280,
      kind: 'unmeasured',
      detail:
        `the Tab walk hit its ${MAX_TABS}-press cap after reaching ${reached.size} of ` +
        `${candidates.length} candidate control(s) without wrapping, so 2.1.1 is unmeasured ` +
        `for the rest. Raise MAX_TABS to measure this screen.`,
    });
  }

  keyboardTotals.reached += reached.size;
  keyboardTotals.candidates += candidates.length;
  keyboardTotals.screens += 1;
  if (wrapped) keyboardTotals.wrapped += 1;
  return {
    reached: reached.size,
    candidates: candidates.length,
    optedOut: optedOut.length,
    invisible: invisible.size,
    ringed,
    unreached: wrapped ? unreached.length : -1,
    trap,
  };
}

for (const screen of SCREENS) {
  for (const width of WIDTHS) {
    const r = await check(screen, width);
    if (width === 375) loadCount.set(screen, r.count);
    console.log(`${screen} @${width}: ${r.count} controls`);
  }
  if (!SKIP_REFLOW) {
    const r = await check(screen, REFLOW_W);
    console.log(`${screen} @${REFLOW_W} (reflow): ${r.count} controls`);
  }
}

// ---- WCAG 1.4.4, measured (v29) -------------------------------------------
if (TEXT_SCALE > 0) {
  console.log(`\n=== text resize to ${TEXT_SCALE}% (WCAG 1.4.4) ===`);
  let respond = 0;
  let total = 0;
  for (const screen of SCREENS) {
    const r = await textScale(screen);
    respond += r.responded;
    total += r.leaves;
    console.log(
      `${screen}: ${r.responded}/${r.leaves} text node(s) grew · ` +
        `overflow ${r.overflow ? `YES (${r.scrollWidth} > ${r.innerWidth})` : 'no'}`,
    );
    if (r.overflow) {
      problems.push({
        where: `${screen} @${TEXT_SCALE}% text`,
        width: 375,
        kind: 'text-scale',
        detail:
          `scrollWidth ${r.scrollWidth} > innerWidth ${r.innerWidth} with the browser font at ` +
          `${TEXT_SCALE}%${r.offenders.length ? ` — widest: ${r.offenders.join(' | ')}` : ''}`,
      });
    }
  }
  textScaleTotals.responded = respond;
  textScaleTotals.leaves = total;
}

// ---- WCAG 2.1.1 / 2.4.7 / 2.1.2, measured (v30) ---------------------------
if (!SKIP_KEYBOARD) {
  console.log(`\n=== keyboard walk (WCAG 2.1.1 / 2.4.7 / 2.1.2) ===`);
  for (const screen of SCREENS) {
    const r = await keyboard(screen);
    console.log(
      `${screen}: Tab reached ${r.reached}/${r.candidates} control(s)` +
        (r.unreached >= 0 ? ` · ${r.unreached} unreachable` : ' · did not wrap') +
        ` · ${r.ringed} drew a focus ring, ${r.invisible} did not` +
        (r.optedOut ? ` · ${r.optedOut} tabindex=-1` : '') +
        (r.trap ? ` · TRAP on ${r.trap}` : ''),
    );
  }
}

// Click sweep at phone width only — the tighter of the two, and the one an
// overflow actually hurts on.
if (!process.env.SKIP_CLICKS) {
  for (const screen of SCREENS) {
    let i = 0;
    /** First clicks that revealed controls — the parents worth descending into. */
    const openers: { index: number; after: number }[] = [];
    const expected = loadCount.get(screen) ?? 0;
    /**
     * The number of clicks this screen owes the sweep.
     *
     * Not `expected` itself: the sweep stops at CLICK_CAP by design, so a
     * 961-control Collection owes 41 clicks and not 961. What the guard is
     * for is the case where the sweep sees a small fraction of a screen the
     * load pass had just counted — `inspect` reading 0 against 6 — and prints
     * `clicked 0 control(s)` as though that were an answer.
     */
    const sweepFloor = Math.min(expected, CLICK_CAP + 1);
    /** What the sweep itself settled at, for the guard below. */
    let sweptCount = 0;
    while (i <= CLICK_CAP) {
      const r = await check(screen, 375, [i], sweepFloor);
      sweptCount = Math.max(sweptCount, r.count);
      if (r.done) break;
      // Only descend where the click ADDED controls. A click that removes them
      // (a filter narrowing a grid, a tab closing a panel) reveals nothing new,
      // and a click that leaves the count alone re-offers the same controls the
      // depth-one sweep is already walking one at a time.
      if (r.after > r.count) openers.push({ index: i, after: r.after });
      i += 1;
    }
    console.log(
      `${screen}: clicked ${i} control(s), ${openers.length} opened a panel` +
        (expected ? ` (load pass counted ${expected})` : ''),
    );
    // The guard. Say it where the measurement would have been printed.
    if (sweepFloor > 0 && i < sweepFloor) {
      problems.push({
        where: `${screen} click sweep`,
        width: 375,
        kind: 'unmeasured',
        detail:
          `the load pass counted ${expected} control(s) at this width, so the sweep ` +
          `owed ${sweepFloor} click(s); it settled at ${sweptCount} and clicked ${i}. ` +
          `The screen was not measured.`,
      });
    }

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

const exemptTotal = [...inlineExempt.values()].reduce((a, b) => a + b, 0);
if (exemptTotal > 0) {
  const worst = [...inlineExempt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  console.log(
    `\ntap targets: ${exemptTotal} inline exemption(s) across ${inlineExempt.size} state(s) ` +
      `(WCAG 2.5.8 inline rule; most in ${worst.map(([w, n]) => `${w} ${n}`).join(', ')})`,
  );
}
if (TEXT_SCALE > 0 && textScaleTotals.leaves > 0) {
  const pct = Math.round((textScaleTotals.responded / textScaleTotals.leaves) * 100);
  console.log(
    `\ntext resize (WCAG 1.4.4): ${textScaleTotals.responded}/${textScaleTotals.leaves} ` +
      `sampled text node(s) — ${pct}% — grow when the browser's font size is set to ` +
      `${TEXT_SCALE}%. The app is MIXED: Tailwind's named sizes are rem and grow, its ` +
      `arbitrary \`text-[Npx]\` ones do not, and both sit in the same rows — which is why ` +
      `the OVERFLOW column beside each screen is gated and this percentage is not. ` +
      `There is no right value for it; a number that MOVES is the thing to look at.`,
  );
}
if (!SKIP_KEYBOARD && keyboardTotals.candidates > 0) {
  const pct = Math.round((keyboardTotals.reached / keyboardTotals.candidates) * 100);
  console.log(
    `\nkeyboard (WCAG 2.1.1): Tab reached ${keyboardTotals.reached}/` +
      `${keyboardTotals.candidates} enabled visible control(s) — ${pct}% — across ` +
      `${keyboardTotals.screens} state(s), of which ${keyboardTotals.wrapped} completed a full ` +
      `focus cycle inside the ${MAX_TABS}-press cap. A state that did not wrap is reported as ` +
      `UNMEASURED rather than counted as a pass: "nothing unreachable" out of a walk that ` +
      `stopped early is the silent cap this file has caught itself taking three times.`,
  );
}
/**
 * One line per distinct problem, with the number of times it was hit.
 *
 * The click sweep replays a screen's prelude on every one of its ~41 loads, so
 * a prelude that cannot land reports itself ~41 times — v30's `auth@signup`
 * printed seven identical paragraphs in an eleven-line report, which buries
 * the other finding rather than emphasising this one. The COUNT is kept
 * because it is the interesting part: a prelude that fails once is a race and
 * one that fails every time is a detector that cannot see the change.
 */
const seen = new Map<string, { p: Problem; n: number }>();
for (const p of problems) {
  const k = `${p.where}|${p.width}|${p.kind}|${p.detail}`;
  const row = seen.get(k);
  if (row) row.n += 1;
  else seen.set(k, { p, n: 1 });
}
console.log(`\n=== ${seen.size} distinct problem(s) (${problems.length} total) ===`);
for (const { p, n } of seen.values()) {
  console.log(`${p.where} @${p.width} [${p.kind}]${n > 1 ? ` (x${n})` : ''} ${p.detail}`);
}
process.exit(problems.length > 0 ? 1 : 0);
