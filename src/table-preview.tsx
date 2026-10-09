// Dev-only offline harness for the poker table (served at /table-preview.html
// by Vite dev). Mounts PokerTable against the bundled card pool with no
// network, so the table can be played, screenshotted and measured anywhere.
//
//   /table-preview.html?seats=6&mode=standard&seed=7
//   /table-preview.html?seats=3&mode=quick&speed=instant
//   /table-preview.html?tutorial=1
//
// `speed=instant` stores the INSTANT bot pace before mounting (handy for
// screenshots); `clear=1` wipes the coach/keyword-intro flags first.
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './fonts.css';
import { PokerTable } from './components/PokerTable';
import { POOL_LEADERS } from './game/poker/cardpool';
import { MODES, type ModeId } from './game/poker/constants';
import { buildDeck } from './game/poker/deck';
import { rngOn } from './game/poker/rng';
import { cpuTableSetup } from './game/poker/sim';
import { ToastProvider } from './meta/toast';
import { ConfirmHost } from './meta/confirm';

const q = new URLSearchParams(location.search);
const seats = Number(q.get('seats') ?? 6);
const mode = (q.get('mode') ?? 'standard') as ModeId;
const seed = Number(q.get('seed') ?? 7);
const tutorial = q.get('tutorial') === '1';
try {
  if (q.get('speed') === 'instant') localStorage.setItem('frycards:cpu-speed', 'INSTANT');
  if (q.get('clear') === '1') {
    localStorage.removeItem('frycards_coach_done');
    localStorage.removeItem('frycards_seen_keywords');
  }
} catch {
  /* storage blocked */
}

const rng = rngOn({ rng: seed });
const leader = POOL_LEADERS[seed % POOL_LEADERS.length];
const deck = buildDeck(leader, MODES[mode], rng, `${leader.name} — Preview`);
const setup = cpuTableSetup({ seed, mode, seats, seat0: { name: 'You', human: true, deck } });

function Preview() {
  const [key, setKey] = React.useState(0);
  return (
    <div className="w-full h-screen">
      <PokerTable
        key={key}
        setup={{ ...setup, seed: setup.seed + key }}
        tutorial={tutorial}
        onExit={() => setKey((k) => k + 1)}
        onRematch={() => setKey((k) => k + 1)}
      />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <ToastProvider>
    <Preview />
    <ConfirmHost />
  </ToastProvider>,
);
