import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronRight, ChevronLeft } from 'lucide-react';

const TUTORIAL_KEY = 'frycards_tutorial_done';

interface Step {
  title: string;
  body: string;
  target?: string; // CSS selector to highlight
  position: 'center' | 'top' | 'bottom';
}

const STEPS: Step[] = [
  {
    title: 'Welcome to FryCards! 🎉',
    body: 'This quick tour will get you up to speed. You can skip at any time.',
    position: 'center'
  },
  {
    title: 'Open Your First Pack',
    body: 'Head to the SHOP to buy card packs with your starting Gold. Open them to build your collection!',
    target: '[data-nav="shop"]',
    position: 'bottom'
  },
  {
    title: 'Build a Deck',
    body: 'Go to DECKS to assemble a squad of 5 cards. You need a deck before you can battle.',
    target: '[data-nav="decks"]',
    position: 'bottom'
  },
  {
    title: 'Battle for Rewards',
    body: 'Head to BATTLE ARENA to fight AI or friends. Win XP, Gold, and season pass progress!',
    target: '[data-nav="battle"]',
    position: 'bottom'
  },
  {
    title: 'Trade & Collect',
    body: 'Use the MARKETPLACE to buy & sell cards, and TRADING to swap with friends.',
    target: '[data-nav="market"]',
    position: 'bottom'
  },
  {
    title: "You're Ready!",
    body: 'Check your daily login bonus, complete missions, and climb the season pass. Good luck!',
    position: 'center'
  }
];

const TutorialOverlay: React.FC = () => {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(false);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    const done = localStorage.getItem(TUTORIAL_KEY);
    if (!done) setVisible(true);
  }, []);

  useEffect(() => {
    const current = STEPS[step];
    if (current.target) {
      const el = document.querySelector(current.target);
      if (el) setTargetRect(el.getBoundingClientRect());
      else setTargetRect(null);
    } else {
      setTargetRect(null);
    }
  }, [step]);

  const finish = () => {
    localStorage.setItem(TUTORIAL_KEY, '1');
    setVisible(false);
  };

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <AnimatePresence>
      {visible && (
        <div className="fixed inset-0 z-[99999]">
          {/* Dim overlay */}
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

          {/* Highlight spotlight */}
          {targetRect && (
            <div
              className="absolute rounded-xl ring-4 ring-indigo-500 ring-offset-4 ring-offset-transparent bg-transparent pointer-events-none"
              style={{
                top: targetRect.top - 6,
                left: targetRect.left - 6,
                width: targetRect.width + 12,
                height: targetRect.height + 12,
              }}
            />
          )}

          {/* Tooltip */}
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className={`absolute z-10 w-80 bg-slate-900 border border-indigo-500/50 rounded-2xl p-6 shadow-2xl ${
              current.position === 'center'
                ? 'top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
                : targetRect
                ? '' : 'bottom-24 left-1/2 -translate-x-1/2'
            }`}
            style={
              current.position !== 'center' && targetRect
                ? {
                    top: current.position === 'bottom' ? targetRect.bottom + 12 : targetRect.top - 150,
                    left: Math.min(Math.max(targetRect.left - 40, 16), window.innerWidth - 336),
                  }
                : {}
            }
          >
            {/* Step indicator */}
            <div className="flex justify-between items-center mb-4">
              <div className="flex gap-1">
                {STEPS.map((_, i) => (
                  <div key={i} className={`h-1 rounded-full transition-all ${i === step ? 'w-6 bg-indigo-500' : 'w-2 bg-slate-700'}`} />
                ))}
              </div>
              <button onClick={finish} className="text-slate-600 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>

            <h3 className="font-heading font-black text-white text-lg mb-2">{current.title}</h3>
            <p className="text-slate-400 text-sm leading-relaxed mb-6">{current.body}</p>

            <div className="flex gap-2">
              {step > 0 && (
                <button onClick={() => setStep(s => s - 1)} className="flex-1 py-2 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:border-slate-500 text-sm font-bold flex items-center justify-center gap-1 transition-colors">
                  <ChevronLeft size={14} /> Back
                </button>
              )}
              <button
                onClick={isLast ? finish : () => setStep(s => s + 1)}
                className="flex-[2] py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-black flex items-center justify-center gap-1 transition-colors"
              >
                {isLast ? "Let's Go! 🚀" : <><span>Next</span><ChevronRight size={14} /></>}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};

export default TutorialOverlay;