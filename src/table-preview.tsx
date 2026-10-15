// Dev-only offline harness for the poker table (served at /table-preview.html
// by Vite dev). Mounts PokerTable against the bundled card pool with no
// network, so the table can be played, screenshotted and measured anywhere.
//
//   /table-preview.html?seats=6&mode=standard&seed=7
//   /table-preview.html?seats=3&mode=quick&speed=instant
//   /table-preview.html?tutorial=1
//   /table-preview.html?location=1&mutators=deepStacks&powers=0&autodeal=0
//
// For the button fuzzer (scripts/fuzz-table-buttons.ts): `location=1` forces a
// pool Location into every cycle (`location=<card id>` picks one), `mutators=`
// applies weekly rule twists, `powers=0` deals your deck with no power cards
// (no Events to cast), `autodeal=0` / `timers=<standard|relaxed|off>` set
// those table prefs before mounting.
//
// `speed=instant` stores the INSTANT bot pace before mounting (handy for
// screenshots); `clear=1` wipes the coach/keyword-intro flags first.
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import './fonts.css';
import { PokerTable } from './components/PokerTable';
import { POOL_BY_ID, POOL_LEADERS, poolByType } from './game/poker/cardpool';
import { MODES, type ModeId } from './game/poker/constants';
import { buildDeck } from './game/poker/deck';
import { rngOn } from './game/poker/rng';
import type { MutatorId } from './game/poker/mutators';
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
  if (q.get('autodeal') === '0') localStorage.setItem('frycards:auto-deal', '0');
  if (q.get('autodeal') === '1') localStorage.setItem('frycards:auto-deal', '1');
  const timers = q.get('timers');
  if (timers) localStorage.setItem('frycards:timers', timers);
  if (q.get('clear') === '1') {
    localStorage.removeItem('frycards_coach_done');
    localStorage.removeItem('frycards_seen_keywords');
  }
} catch {
  /* storage blocked */
}

const rng = rngOn({ rng: seed });
const leader = POOL_LEADERS[seed % POOL_LEADERS.length];
const built = buildDeck(leader, MODES[mode], rng, `${leader.name} — Preview`);
// `&rarity=<rarity>`: your powers reprinted at that rarity, to see a
// template in the hand (e.g. `&rarity=Ultra-Rare`).
const reprint = q.get('rarity');
const reprinted = reprint
  ? { ...built, powers: built.powers.map((c) => ({ ...c, rarity: reprint }) as typeof c) }
  : built;
const deck = q.get('powers') === '0' ? { ...reprinted, powers: [] } : reprinted;
const locParam = q.get('location');
const locations = poolByType('Location');
const forcedLocation = !locParam
  ? undefined
  : (POOL_BY_ID[locParam] ?? locations[seed % Math.max(1, locations.length)]);
const mutators = (q.get('mutators') ?? '').split(',').filter(Boolean) as MutatorId[];
const setup = {
  ...cpuTableSetup({ seed, mode, seats, seat0: { name: 'You', human: true, deck } }),
  ...(forcedLocation ? { forcedLocation } : {}),
  ...(mutators.length ? { mutators } : {}),
};

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
