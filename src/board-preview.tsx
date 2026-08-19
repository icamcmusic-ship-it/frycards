// Dev-only offline harness for the match board (served at /board-preview.html
// by Vite dev). Mounts GameV4 against locally-generated decks so the layout can
// be exercised without a Supabase session.
//
// Query string (used by `scripts/drive-match.ts`, the Playwright match driver):
//   ?seed=N    deck roll AND the match RNG, so a run reproduces exactly
//   ?speed=0|1|2|3  narration speed (CINEMATIC / SLOW / NORMAL / FAST) for this
//                  page only
//   ?cpuvit=N  / ?myvit=N   opening Vitality override (harness only) — the
//     driver clicks random legal actions, so without a handicap it loses every
//     match and the VICTORY screen never renders. See GameV4's startVitality.
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { GameV4 } from './components/GameV4';
import { buildDeck, randomArchetype } from './game/v3/decks';
import { mulberry32 } from './game/v3/engine';

const params = new URLSearchParams(window.location.search);
const seedParam = Number(params.get('seed'));
const seed = Number.isFinite(seedParam) && seedParam > 0 ? seedParam : 0;
const speedParam = params.get('speed');
if (speedParam !== null) {
  try {
    window.localStorage.setItem('frycards:cpu-speed', speedParam);
  } catch {
    /* storage blocked — the page just uses the default speed */
  }
}

const vitParam = (key: string): number | undefined => {
  const n = Number(params.get(key));
  return params.get(key) !== null && Number.isFinite(n) && n > 0 ? n : undefined;
};
const startVitality = { human: vitParam('myvit'), cpu: vitParam('cpuvit') };

/**
 * One match, mounted under a key so REMATCH can remount it.
 *
 * v29 — the preview passed no `onRematch`, so the control never rendered here
 * and the match driver could never press it: a remount that tears down a live
 * narration chain, three sets of timers and an in-flight reward round-trip,
 * and rebuilds the whole component beside them, was the single largest
 * unexercised path in the match screen. `onExit` used to be a no-op too, which
 * made a resignation invisible to the harness — the board simply stayed on
 * screen — so it now renders the state the real app navigates to.
 */
function Preview() {
  const [round, setRound] = React.useState(0);
  const [exited, setExited] = React.useState(false);
  // A fresh deck roll per round, derived from the seed so a run still
  // reproduces exactly.
  const roundSeed = (seed || 7) + round * 104729;
  const a = randomArchetype(mulberry32(roundSeed));
  const b = randomArchetype(mulberry32(seed ? roundSeed * 7919 + 1 : 99 + round));
  if (exited) {
    return (
      <div className="p-8 heading-font text-lg">
        LEFT THE MATCH
        <button className="ml-4 underline" onClick={() => setExited(false)}>
          BACK TO THE BOARD
        </button>
      </div>
    );
  }
  // Keyed on the Fragment rather than on GameV4 itself: the component's props
  // are a plain object type, so `key` is not one of them.
  return (
    <React.Fragment key={round}>
      <GameV4
        humanDeck={buildDeck(a)}
        cpuDeck={buildDeck(b)}
        humanLabel={a.label}
        cpuLabel={b.label}
        playerName="Preview"
        seed={seed ? roundSeed : undefined}
        startVitality={
          startVitality.human !== undefined || startVitality.cpu !== undefined
            ? startVitality
            : undefined
        }
        onExit={() => setExited(true)}
        onRematch={() => setRound((r) => r + 1)}
      />
    </React.Fragment>
  );
}

createRoot(document.getElementById('root')!).render(<Preview />);
