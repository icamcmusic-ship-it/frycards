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
  kind: 'overflow' | 'console' | 'blank' | 'tap-target' | 'unmeasured' | 'text-scale';
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
  for (const label of PRELUDE[screen] ?? []) {
    const before = await page
      .$$(CONTROLS)
      .then((c) => c.length)
      .catch(() => 0);
    /**
     * Click the prelude step and wait for it to LAND — then say so when it
     * does not.
     *
     * v29: the wait alone was not enough. `pack@reveal` measured **1 control**
     * at 375px in a full run and 6 at 1280px on the very next load — the tear
     * click missed or the 850ms reveal timer outran the wait, the entry
     * measured the unopened wrapper it was supposed to be leaving, and every
     * check downstream (the control count, the tap targets, the text-resize
     * pass) ran on the wrong screen while the run printed a clean pass. This
     * is v14's finding and v28's, arriving through the third door: the sweep
     * has to be able to tell "this screen is fine" from "I never got to it".
     *
     * So: retry the click once, and if the control set still has not moved,
     * report it where the measurement would have gone.
     */
    let landed = false;
    for (let attempt = 0; attempt < 2 && !landed; attempt++) {
      const target = page.locator(`${CONTROLS}`, { hasText: label }).first();
      await target.click({ timeout: 4000 }).catch(() => undefined);
      for (let i = 0; i < 16; i++) {
        await page.waitForTimeout(250);
        const now = await page
          .$$(CONTROLS)
          .then((c) => c.length)
          .catch(() => 0);
        if (now !== before) {
          landed = true;
          break;
        }
      }
    }
    if (!landed) {
      problems.push({
        where: `${screen} prelude`,
        width,
        kind: 'unmeasured',
        detail:
          `the prelude step "${label}" left the control count at ${before} after two clicks ` +
          `and 8s of waiting, so this entry measured the state it was supposed to be leaving.`,
      });
    }
  }
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
  for (const label of PRELUDE[screen] ?? []) {
    await page
      .locator(`${CONTROLS}`, { hasText: label })
      .first()
      .click({ timeout: 4000 })
      .catch(() => undefined);
    await page.waitForTimeout(600);
  }
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
console.log(`\n=== ${problems.length} problem(s) ===`);
for (const p of problems) console.log(`${p.where} @${p.width} [${p.kind}] ${p.detail}`);
process.exit(problems.length > 0 ? 1 : 0);
