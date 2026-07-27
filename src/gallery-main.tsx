// Dev-only card template gallery (served at /gallery.html by Vite dev).
// Mirrors the coverage of the "Card Template Options" design sheet: every
// card type at every framed rarity, the two full-bleed rarities (Full-Art
// still image, Mythic looping video), Serialized prints and the static
// prismatic Foil Print row.
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { CardFace, CardSize } from './components/CardFaceV4';
import { POOL_V4 } from './game/v3/cardpool';
import { RARITY_ORDER } from './meta/rarity';
import type { CardDef, CardType } from './game/v3/cards';

const TYPES: CardType[] = ['Unit', 'Location', 'Charm', 'Event', 'Leader'];

function pickBy(pred: (c: CardDef) => boolean): CardDef | undefined {
  return POOL_V4.find(pred);
}

/** One card of each type at the given rarity (whatever the pool actually has). */
function row(rarity: string): CardDef[] {
  return TYPES.map((t) => pickBy((c) => c.rarity === rarity && c.type === t)).filter(
    (c): c is CardDef => !!c,
  );
}

function Band({
  title,
  note,
  cards,
  size,
  foil,
  serialized,
}: {
  key?: React.Key;
  title: string;
  note?: string;
  cards: CardDef[];
  size: CardSize;
  foil?: boolean;
  serialized?: boolean;
}) {
  if (cards.length === 0) return null;
  return (
    <div style={{ marginBottom: 28 }}>
      <h3 style={{ color: '#fff', fontFamily: 'sans-serif', fontSize: 14, margin: '0 0 8px' }}>
        {title}
        {note && <span style={{ opacity: 0.6, fontWeight: 400 }}> — {note}</span>}
      </h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-start' }}>
        {cards.map((c, i) => (
          <CardFace
            key={`${c.id}-${i}`}
            def={c}
            size={size}
            foil={foil}
            serial={serialized ? { number: 7 + i, cap: 75 } : undefined}
          />
        ))}
      </div>
    </div>
  );
}

function Gallery() {
  const premium = ['Super-Rare', 'Ultra-Rare', 'Full-Art', 'Mythic'];
  const oneEach = RARITY_ORDER.map((r) => pickBy((c) => c.rarity === r)).filter(
    (c): c is CardDef => !!c,
  );
  const serialCards = ['Mythic', 'Full-Art', 'Ultra-Rare']
    .map((r) => pickBy((c) => c.rarity === r))
    .filter((c): c is CardDef => !!c);
  return (
    <div style={{ background: '#20242c', padding: 16 }}>
      {(['full', 'standard', 'compact', 'micro'] as CardSize[]).map((size) => (
        <div key={size} style={{ marginBottom: 40 }}>
          <h2 style={{ color: '#fff', fontFamily: 'sans-serif' }}>{size}</h2>
          {RARITY_ORDER.map((r) => (
            <Band
              key={r}
              title={r}
              note={
                r === 'Mythic'
                  ? 'full-bleed, looping video art'
                  : r === 'Full-Art'
                    ? 'full-bleed still art'
                    : premium.includes(r)
                      ? 'animated art treatments'
                      : undefined
              }
              cards={row(r)}
              size={size}
            />
          ))}
          <Band
            title="Serialized"
            note="numbered prints"
            cards={serialCards}
            size={size}
            serialized
          />
          <Band
            title="Foil Print"
            note="one per rarity, static prismatic (no motion)"
            cards={oneEach}
            size={size}
            foil
          />
        </div>
      ))}
    </div>
  );
}

createRoot(document.getElementById('root')!).render(<Gallery />);
