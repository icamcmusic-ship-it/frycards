/**
 * A lightweight first-game coach: contextual, dismissible callouts that walk a
 * card player who has never played Hold'em through their first FryCards Poker
 * match, one idea at a time, the first time each idea actually matters —
 * their two hole cards and the hand ranks, then betting, then the board, then
 * casting a power, and (when the table shows them) the Location rule and
 * nerve. Shown once ever (tracked in localStorage) — after that, or if
 * skipped, it never renders again.
 *
 * Each step is anchored to the element it explains (`anchor`, a selector for a
 * `data-coach` hook on the poker table — see COACH_ANCHORS): that element gets
 * a spotlight ring and the callout is placed beside it, never on top of it.
 * Without a target — the element is not on screen yet — it falls back to a
 * safe spot that covers none of the table's primary controls.
 */
import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { holdKeywordIntros } from './CardFaceV4';
import { COACH_ANCHORS, REQUIRED_COACH_STAGES, type CoachStage } from '../meta/coachPractice';
import { CAPS, NERVE } from '../game/poker/constants';

export type { CoachStage };

const DONE_KEY = 'frycards_coach_done';

function isCoachDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}

function markCoachDone(): void {
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch {
    // localStorage unavailable — the coach will just show again next visit.
  }
}

// 'location' only appears on a hand with a real table rule and 'nerve' only
// once the Leader matters, so completion must not depend on them, or the
// tutorial (whose progress ref resets each match) replays the first four
// steps in every match forever. These four always occur in a first game.
const REQUIRED_STAGES: CoachStage[] = REQUIRED_COACH_STAGES;

export const SCRIPT: { stage: CoachStage; title: string; body: string; anchor: string }[] = [
  {
    stage: 'hand',
    title: 'YOUR HAND — TWO HOLE CARDS',
    body: 'These two cards are yours alone. Your poker hand is the best five cards out of these two plus the five shared cards that will land in the middle. Best to worst: straight flush, four of a kind, full house, flush, straight, three of a kind, two pair, pair, high card.',
    anchor: COACH_ANCHORS.hand,
  },
  {
    stage: 'bet',
    title: 'BETTING — FOLD, CHECK, CALL, RAISE',
    body: 'Your turn. FOLD gives up the hand. CHECK passes when nobody has bet. CALL matches the bet. RAISE puts in more and makes everyone match it. This is pot-limit: the slider stops at the size of the pot. Keys: F fold, C check or call, R raise. The blinds are forced bets that rise on a clock.',
    anchor: COACH_ANCHORS.bet,
  },
  {
    stage: 'board',
    title: 'THE BOARD — FLOP, TURN, RIVER',
    body: 'Shared cards everyone uses: three on the flop, one on the turn, one on the river, with a betting round after each. If two or more players are still in after the river, hands are shown and the best five-card hand wins the pot. Or make everyone fold and win without showing.',
    anchor: COACH_ANCHORS.board,
  },
  {
    stage: 'power',
    title: 'POWERS — CASTING A CARD',
    body: `Your power cards: Units ★, Items ⚙, Events ϟ. Cast one on your turn before you bet — it does not use up your turn. Casting is public: the table sees the full card, and its chip cost goes into the pot. So a cast is also a bluff. Per hand: ${CAPS.unitCount} Units (${CAPS.unitStars} stars), ${CAPS.itemCount} Items (${CAPS.itemGears} gears), ${CAPS.eventBolts} bolts of Events. Quick Events can answer someone else's cast or raise.`,
    anchor: COACH_ANCHORS.power,
  },
  {
    stage: 'location',
    title: 'THE TABLE RULE — LOCATIONS',
    body: 'Every hand plays one Location rule, shown here, with the next two forecast so you can plan your casts. Each deck brings one Location to a shared bag, and a Plain Table hand with no rule comes round once a cycle.',
    anchor: COACH_ANCHORS.location,
  },
  {
    stage: 'nerve',
    title: 'NERVE & YOUR LEADER',
    body: `Nerve is public, 0 to ${NERVE.max}. Win showdowns, land bluffs or fold strong hands to gain it; get caught bluffing or hit by hostile powers and it drops. Your Leader has two abilities, one use per hand: one spends nerve, one builds it. At 0 you tilt: your Leader locks and powers cost one step more.`,
    anchor: COACH_ANCHORS.nerve,
  },
];

/** Plain viewport rectangle. */
export interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export type CalloutSide = 'below' | 'above' | 'right' | 'left' | 'dock-top' | 'dock-bottom';

/** Something the callout should try not to cover, and how much it matters
 * (cost is `weight` per px² covered). */
export interface AvoidRect extends Rect {
  weight: number;
}

const GAP = 12;
const MARGIN = 8;

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left);
  const h = Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top);
  return w > 0 && h > 0 ? w * h : 0;
}

/**
 * Where to put a callout of `box` size so it explains `target` without
 * covering it.
 *
 * Candidates are generated beside the target (below and above it, each flush
 * left, centred and flush right; then right and left of it) and docked to the
 * top and bottom edges. Each must lie wholly inside the viewport and must not
 * touch the target at all. Of the survivors the one covering the least of the
 * `avoid` rectangles wins (a weighted area: the board's primary button counts
 * far more than the hand dock), earlier candidates — the ones hugging the
 * target — breaking ties. If the target is so large that nothing qualifies,
 * the edge dock that overlaps it least is used. With no target (its element
 * is off screen) the same cost decides between the two edge docks.
 *
 * Pure so the landscape and tiny-viewport cases can be pinned by tests.
 */
export function placeCallout(
  target: Rect | null,
  box: { w: number; h: number },
  vp: { w: number; h: number },
  avoid: AvoidRect[] = [],
): { top: number; left: number; side: CalloutSide } {
  const clampX = (x: number) => Math.max(MARGIN, Math.min(x, vp.w - box.w - MARGIN));
  const clampY = (y: number) => Math.max(MARGIN, Math.min(y, vp.h - box.h - MARGIN));
  const rectAt = (top: number, left: number): Rect => ({ top, left, width: box.w, height: box.h });
  const avoidCost = (r: Rect) => avoid.reduce((sum, a) => sum + a.weight * overlapArea(r, a), 0);
  const inside = (r: Rect) =>
    r.left >= MARGIN - 0.5 &&
    r.top >= MARGIN - 0.5 &&
    r.left + r.width <= vp.w - MARGIN + 0.5 &&
    r.top + r.height <= vp.h - MARGIN + 0.5;

  const lefts = [clampX((vp.w - box.w) / 2), MARGIN, clampX(vp.w)];
  const candidates: { side: CalloutSide; top: number; left: number }[] = [];
  if (target) {
    const cx = target.left + target.width / 2 - box.w / 2;
    const cy = target.top + target.height / 2 - box.h / 2;
    const below = target.top + target.height + GAP;
    const above = target.top - box.h - GAP;
    for (const left of [clampX(cx), ...lefts.slice(1)])
      candidates.push({ side: 'below', top: below, left });
    for (const left of [clampX(cx), ...lefts.slice(1)])
      candidates.push({ side: 'above', top: above, left });
    candidates.push({ side: 'right', top: clampY(cy), left: target.left + target.width + GAP });
    candidates.push({ side: 'left', top: clampY(cy), left: target.left - box.w - GAP });
  }
  // The old fixed position first: clear of the hand dock along the bottom.
  const bottomTop = target ? Math.max(MARGIN, vp.h - box.h - MARGIN) : clampY(vp.h - box.h - 176);
  for (const left of lefts) candidates.push({ side: 'dock-bottom', top: bottomTop, left });
  for (const left of lefts) candidates.push({ side: 'dock-top', top: MARGIN, left });

  let best: { side: CalloutSide; top: number; left: number; cost: number } | null = null;
  for (const c of candidates) {
    const r = rectAt(c.top, c.left);
    if (!inside(r) || (target && overlapArea(r, target) > 0)) continue;
    const cost = avoidCost(r);
    if (!best || cost < best.cost) best = { ...c, cost };
  }
  if (best) return { top: best.top, left: best.left, side: best.side };

  // Nothing clears the target (it fills the viewport): dock where it covers it
  // least — covering the target dominates anything on the avoid list.
  let dock: { side: CalloutSide; top: number; left: number } = {
    side: 'dock-top',
    top: MARGIN,
    left: lefts[0],
  };
  let dockCost = Infinity;
  for (const side of ['dock-top', 'dock-bottom'] as const) {
    const top = side === 'dock-top' ? MARGIN : Math.max(MARGIN, vp.h - box.h - MARGIN);
    const r = rectAt(top, lefts[0]);
    const cost = (target ? overlapArea(r, target) * 1000 : 0) + avoidCost(r);
    if (cost < dockCost) {
      dock = { side, top, left: lefts[0] };
      dockCost = cost;
    }
  }
  return dock;
}

function toRect(el: Element): Rect {
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function sameRect(a: Rect | null, b: Rect | null): boolean {
  if (!a || !b) return a === b;
  return (
    Math.abs(a.top - b.top) < 1 &&
    Math.abs(a.left - b.left) < 1 &&
    Math.abs(a.width - b.width) < 1 &&
    Math.abs(a.height - b.height) < 1
  );
}

/** First visible element for the anchor selector, clipped to the viewport. */
function readTarget(anchor: string): Rect | null {
  for (const el of Array.from(document.querySelectorAll(anchor))) {
    const r = toRect(el);
    if (r.width < 1 || r.height < 1) continue;
    const top = Math.max(0, r.top);
    const left = Math.max(0, r.left);
    const bottom = Math.min(window.innerHeight, r.top + r.height);
    const right = Math.min(window.innerWidth, r.left + r.width);
    if (bottom - top < 1 || right - left < 1) continue;
    return { top, left, width: right - left, height: bottom - top };
  }
  return null;
}

/** What the callout should stay off: the board's primary button above all
 * (it is the thing the player is about to press), then the regions marked
 * `data-coach-avoid` (header, hand dock). */
function readAvoid(): AvoidRect[] {
  const out: AvoidRect[] = [];
  const add = (selector: string, weight: number) => {
    for (const el of Array.from(document.querySelectorAll(selector))) {
      const r = toRect(el);
      if (r.width > 0 && r.height > 0) out.push({ ...r, weight });
    }
  };
  add('[data-coach-avoid]', 1);
  add('button[data-primary="1"]', 40);
  return out;
}

/** The ring's pulse, switched off by the OS preference and by the in-app
 * Motion setting alike (Tailwind's motion-safe only knows the first). */
const RING_CSS = `
@keyframes coach-ring-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.55; } }
.coach-ring { animation: coach-ring-pulse 1.4s ease-in-out infinite; }
@media (prefers-reduced-motion: reduce) {
  html:not([data-motion='full']) .coach-ring { animation: none; }
}
html[data-motion='reduced'] .coach-ring { animation: none; }
`;

export function CoachOverlay({ stage }: { stage: string }) {
  const [dismissed, setDismissed] = useState(isCoachDone);
  /** The step on screen; `last` = every scripted idea has now been shown. */
  const [step, setStep] = useState<((typeof SCRIPT)[number] & { last: boolean }) | null>(null);
  const shown = useRef<Set<CoachStage>>(new Set());

  useEffect(() => {
    if (dismissed) return;
    const next = SCRIPT.find((s) => s.stage === stage && !shown.current.has(s.stage));
    if (next) {
      shown.current.add(next.stage);
      setStep({ ...next, last: SCRIPT.every((s) => shown.current.has(s.stage)) });
    } else if (REQUIRED_STAGES.every((s) => shown.current.has(s))) {
      // Every always-occurring step has been shown at least once — treat it as
      // a completion even if the last step's own button was never clicked (the
      // table moves on by itself while CPU seats act).
      markCoachDone();
      setDismissed(true);
      setStep(null);
    } else {
      // The game moved on to a stage this step doesn't cover — hide it
      // rather than leaving it stuck on screen indefinitely.
      setStep((cur) => (cur && cur.stage !== stage ? null : cur));
    }
  }, [stage, dismissed]);

  // One teaching voice at a time: while the callout is up, first-sight keyword
  // popovers wait their turn (see holdKeywordIntros).
  const active = !dismissed && !!step;
  useEffect(() => (active ? holdKeywordIntros() : undefined), [active]);

  const boxRef = useRef<HTMLDivElement>(null);
  const [target, setTarget] = useState<Rect | null>(null);
  const [placed, setPlaced] = useState<{ top: number; left: number } | null>(null);
  const anchor = step?.anchor;

  // The table re-lays itself out under the callout (a card is dealt, a cast
  // spotlight opens, the phone rotates), so re-read the anchor on a short interval and on
  // resize rather than once at mount.
  useLayoutEffect(() => {
    if (!anchor) return;
    const box = boxRef.current;
    const measure = () => {
      const t = readTarget(anchor);
      setTarget((cur) => (sameRect(cur, t) ? cur : t));
      if (!box) return;
      const next = placeCallout(
        t,
        { w: box.offsetWidth, h: box.offsetHeight },
        { w: window.innerWidth, h: window.innerHeight },
        readAvoid(),
      );
      setPlaced((cur) => (cur && cur.top === next.top && cur.left === next.left ? cur : next));
    };
    measure();
    const id = window.setInterval(measure, 250);
    window.addEventListener('resize', measure);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', measure);
    };
  }, [anchor]);

  const finish = () => {
    markCoachDone();
    setDismissed(true);
    setStep(null);
  };

  if (dismissed || !step) return null;
  const isLast = step.last;

  return (
    <>
      <style>{RING_CSS}</style>
      {target && (
        // The spotlight: a ring (and soft glow) around what the callout is
        // talking about. Ignores pointer events so the board stays playable.
        <div
          aria-hidden="true"
          data-coach-ring="1"
          className="coach-ring fixed z-[69] pointer-events-none rounded-md border-4 border-[var(--c-yellow)]"
          style={{
            top: target.top - 4,
            left: target.left - 4,
            width: target.width + 8,
            height: target.height + 8,
            boxShadow: '0 0 0 3px var(--c-ink), 0 0 18px 4px rgba(255, 214, 0, 0.55)',
          }}
        />
      )}
      <div
        ref={boxRef}
        role="dialog"
        aria-label={step.title}
        // Hidden until measured: placing a box needs its own size, and one
        // frame at a guessed spot would flash over the very thing it explains.
        style={{
          top: placed?.top ?? 0,
          left: placed?.left ?? 0,
          visibility: placed ? 'visible' : 'hidden',
        }}
        className="fixed z-[70] w-[min(90vw,360px)] bg-[var(--c-ink)] text-[var(--c-paper)] ink-border-md shadow-hard-yellow p-3 max-h-[calc(100dvh-16px)] overflow-y-auto"
      >
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className="heading-font fs-xs text-[var(--c-yellow)]">{step.title}</span>
          <button
            onClick={finish}
            className="fs-xs font-bold text-[var(--c-paper)]/70 hover:text-[var(--c-paper)] underline shrink-0 min-h-[24px] px-1"
          >
            Skip tutorial
          </button>
        </div>
        <p className="fs-sm font-bold leading-snug mb-2">{step.body}</p>
        <button
          onClick={() => (isLast ? finish() : setStep(null))}
          className="btn-pop heading-font fs-sm bg-[var(--c-yellow)] text-[var(--c-ink)] px-2 py-1.5 ink-border-sm w-full"
        >
          {isLast ? "GOT IT — I'M READY" : 'GOT IT'}
        </button>
      </div>
    </>
  );
}
