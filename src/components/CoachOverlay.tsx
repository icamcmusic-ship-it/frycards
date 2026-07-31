/**
 * A lightweight first-match coach: contextual, dismissible callouts that
 * walk a brand-new player through one real match's turn structure the first
 * time each phase actually happens, instead of front-loading everything
 * into a static wall of text before play starts. Shown once ever (tracked
 * in localStorage) — after that, or if skipped, it never renders again.
 */
import React, { useEffect, useRef, useState } from 'react';

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

type CoachStage = 'main1' | 'clash' | 'main2' | 'cpu' | 'respond';

// The 'respond' step only appears if the CPU's play leaves the human holding
// priority with an instant answer in hand — a window that never opens with
// many decks. Completion must not depend on it, or the tutorial (whose
// progress ref resets each match) replays steps 1-4 in every match forever.
// These four stages always occur in a first turn cycle.
const REQUIRED_STAGES: CoachStage[] = ['main1', 'clash', 'main2', 'cpu'];

const SCRIPT: { stage: CoachStage; title: string; body: string }[] = [
  {
    stage: 'main1',
    title: '1. MAIN PHASE — ESSENCE & INVOKING',
    body: 'Essence is your mana: play one free Wellspring per turn (pick a color of your Leader), and exhaust Locations to produce it. Just hit INVOKE on a hand card — the Locations tap themselves to pay. Invoke Units, Items, Events, Sanctums, or your Leader.',
  },
  {
    stage: 'clash',
    title: '2. CLASH — ATTACK!',
    body: 'Click your ready units to add them to the attack, then DECLARE ATTACK. The opponent assigns guards; unguarded attackers hit their Vitality directly. Freshly invoked units are exhausted-in-spirit (summoning sick) unless they have Reckless.',
  },
  {
    stage: 'main2',
    title: '3. MAIN PHASE II',
    body: 'A second main phase after the Clash — spend fresh essence from any Locations you didn’t tap, then END TURN. At Dusk you shed down to 7 cards and the opponent takes their turn.',
  },
  {
    stage: 'cpu',
    title: '4. OPPONENT’S TURN',
    body: 'Watch the opponent play. If it attacks, YOU assign guards — pick an attacker line, click your units to block, then confirm. A reaction window follows where Quick Events and Ambush units can still be invoked before damage.',
  },
  {
    stage: 'respond',
    title: '5. THE STACK — YOUR RESPONSE',
    body: 'Cards don’t take effect the moment they’re played: they wait on THE STACK while you get a window to answer. Whatever goes on last resolves first, so a Quick Event you play now happens BEFORE the card it’s answering. Kill the target of an enemy spell and that spell fizzles. Nothing worth answering? Just PASS.',
  },
];

export function CoachOverlay({ stage }: { stage: string }) {
  const [dismissed, setDismissed] = useState(isCoachDone);
  const [step, setStep] = useState<(typeof SCRIPT)[number] | null>(null);
  const shown = useRef<Set<CoachStage>>(new Set());

  useEffect(() => {
    if (dismissed) return;
    const next = SCRIPT.find((s) => s.stage === stage && !shown.current.has(s.stage));
    if (next) {
      shown.current.add(next.stage);
      setStep(next);
    } else if (REQUIRED_STAGES.every((s) => shown.current.has(s))) {
      // Every always-occurring step has been shown at least once — treat it as
      // a completion even if the final step's own button was never clicked (the
      // 'cpu' stage advances itself on timers with no player input required).
      markCoachDone();
      setDismissed(true);
      setStep(null);
    } else {
      // The game moved on to a stage this step doesn't cover — hide it
      // rather than leaving it stuck on screen indefinitely.
      setStep((cur) => (cur && cur.stage !== stage ? null : cur));
    }
  }, [stage, dismissed]);

  const finish = () => {
    markCoachDone();
    setDismissed(true);
    setStep(null);
  };

  if (dismissed || !step) return null;
  const isLast = step.stage === SCRIPT[SCRIPT.length - 1].stage;

  return (
    // bottom-44 keeps the callout clear of the docked hand row + its preview
    // affordances along the very bottom of the match screen.
    <div className="absolute left-1/2 bottom-44 -translate-x-1/2 z-[70] w-[min(90vw,360px)] bg-[var(--c-ink)] text-[var(--c-paper)] ink-border-md shadow-hard-yellow p-3">
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="heading-font text-[11px] text-[var(--c-yellow)]">{step.title}</span>
        <button
          onClick={finish}
          className="text-[9px] font-bold text-[var(--c-paper)]/60 hover:text-[var(--c-paper)] underline shrink-0"
        >
          Skip tutorial
        </button>
      </div>
      <p className="text-[10px] font-bold leading-snug mb-2">{step.body}</p>
      <button
        onClick={() => (isLast ? finish() : setStep(null))}
        className="btn-pop heading-font text-[10px] bg-[var(--c-yellow)] text-[var(--c-ink)] px-2 py-1 ink-border-sm w-full"
      >
        {isLast ? "GOT IT — I'M READY" : 'GOT IT'}
      </button>
    </div>
  );
}
