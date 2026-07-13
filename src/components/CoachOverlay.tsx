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

type CoachStage = 'awaitRoll' | 'preRoll' | 'placement' | 'combat' | 'cpu';

const SCRIPT: { stage: CoachStage; title: string; body: string }[] = [
  {
    stage: 'awaitRoll',
    title: '1. ROLL',
    body: 'Dice are your only resource — no mana. Click ROLL DICE to roll five for this turn.',
  },
  {
    stage: 'preRoll',
    title: '2. REROLL',
    body: 'Reroll any dice you don’t like — once — or keep them all. Snap Charms can be cast right now too.',
  },
  {
    stage: 'placement',
    title: '3. PLACE YOUR DICE',
    body: 'Spend each die: pay a card’s Cast cost, activate an Ability Slot, or Pitch a leftover die to heal your Leader 1. Tap a card in your hand to see what it needs.',
  },
  {
    stage: 'combat',
    title: '4. COMBAT',
    body: 'Tap one of your Units, then tap an enemy target to attack. Guard Units must be attacked first.',
  },
  {
    stage: 'cpu',
    title: '5. OPPONENT’S TURN',
    body: 'Watch the CPU play out its turn — you’ll roll fresh dice again next round.',
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
    } else {
      // The game has moved on to a stage this step doesn't cover — hide it
      // rather than leaving it stuck on screen indefinitely (e.g. a player
      // who watches the CPU's turn play out without clicking "GOT IT" would
      // otherwise still see that callout sitting over their own next turn).
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
    <div className="absolute left-1/2 bottom-20 -translate-x-1/2 z-[70] w-[min(90vw,360px)] bg-[var(--c-ink)] text-[var(--c-paper)] ink-border-md shadow-hard-yellow p-3">
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
