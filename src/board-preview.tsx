// Dev-only offline harness for the match board (served at /board-preview.html
// by Vite dev). Mounts GameV4 against locally-generated decks so the layout can
// be exercised without a Supabase session.
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { GameV4 } from './components/GameV4';
import { buildDeck, randomArchetype } from './game/v3/decks';
import { mulberry32 } from './game/v3/engine';

const a = randomArchetype(mulberry32(7));
const b = randomArchetype(mulberry32(99));

createRoot(document.getElementById('root')!).render(
  <GameV4
    humanDeck={buildDeck(a)}
    cpuDeck={buildDeck(b)}
    humanLabel={a.label}
    cpuLabel={b.label}
    playerName="Preview"
    onExit={() => undefined}
  />,
);
