// Dev-only card template gallery (served at /gallery.html by Vite dev).
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { CardFace, CardSize } from './components/CardFaceV4';
import { POOL_V4 } from './game/v3/cardpool';
import type { CardDef } from './game/v3/cards';

function pickBy(pred: (c: CardDef) => boolean): CardDef | undefined {
  return POOL_V4.find(pred);
}

const samples: CardDef[] = (
  [
    pickBy((c) => c.type === 'Unit' && (c.keywords?.length ?? 0) >= 2 && !!c.onInvoke),
    pickBy((c) => c.type === 'Unit' && c.keywords?.includes('Regenerate') === true),
    pickBy((c) => c.type === 'Event' && c.keywords?.includes('Resonant') === true),
    pickBy((c) => c.type === 'Event' && c.keywords?.includes('Surge') === true),
    pickBy((c) => c.type === 'Charm' && c.keywords?.includes('Soulbound') === true),
    pickBy((c) => c.type === 'Charm' && c.subtype === 'Worn' && !!c.bond?.grants),
    pickBy((c) => c.type === 'Location' && c.keywords?.includes('Bountiful') === true),
    pickBy((c) => c.type === 'Location' && c.keywords?.includes('Sacred') === true),
    pickBy((c) => c.type === 'Leader' && c.keywords?.includes('Commander') === true),
    pickBy((c) => c.rarity === 'Full-Art'),
    pickBy((c) => c.rarity === 'Mythic'),
    pickBy((c) => c.rarity === 'Ultra-Rare' && c.type === 'Unit'),
  ] as (CardDef | undefined)[]
).filter((c): c is CardDef => !!c);

function Gallery() {
  return (
    <div style={{ background: '#20242c', padding: 16 }}>
      {(['full', 'standard', 'compact', 'micro'] as CardSize[]).map((size) => (
        <div key={size} style={{ marginBottom: 24 }}>
          <h2 style={{ color: '#fff', fontFamily: 'sans-serif' }}>{size}</h2>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
            {samples.map((c) => (
              <CardFace key={c.id} def={c} size={size} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Gallery />);
