// Dev-only offline harness for the match board (served at /board-preview.html
// by Vite dev). Mounts GameV4 against locally-generated decks so the layout can
// be exercised without a Supabase session.
//
// Query string (used by `scripts/drive-match.ts`, the Playwright match driver):
//   ?seed=N    deck roll AND the match RNG, so a run reproduces exactly
//   ?speed=0|1|2  narration speed (SLOW / NORMAL / FAST) for this page only
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

const a = randomArchetype(mulberry32(seed || 7));
const b = randomArchetype(mulberry32(seed ? seed * 7919 + 1 : 99));

createRoot(document.getElementById('root')!).render(
  <GameV4
    humanDeck={buildDeck(a)}
    cpuDeck={buildDeck(b)}
    humanLabel={a.label}
    cpuLabel={b.label}
    playerName="Preview"
    seed={seed || undefined}
    onExit={() => undefined}
  />,
);
