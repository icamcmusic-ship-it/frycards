// Dev-only card template gallery (served at /gallery.html by Vite dev).
// Mirrors the coverage of the "Card Template Options" design sheet: every
// card type at every framed rarity, the two full-bleed rarities (Full-Art
// still image, Mythic looping video), Serialized prints and the static
// prismatic Foil Print row.
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { CardFace, CardSize, CARD_SIZES } from './components/CardFaceV4';
import { POOL_V4 } from './game/v3/cardpool';
import { RARITY_ORDER } from './meta/rarity';
import type { CardDef, CardType } from './game/v3/cards';

const TYPES: CardType[] = ['Unit', 'Location', 'Item', 'Event', 'Leader'];

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

/**
 * `?all=<rarity>[&size=<size>]` — every card at one rarity, one size, nothing
 * else on the page. The default gallery shows ONE card per type per rarity,
 * which is the right shape for reviewing the templates but useless for
 * auditing anything that depends on a card's own content: the v7.5 flavor-text
 * overlap only reproduced on the cards whose rules text happened to be long
 * enough to push the flavor block down onto the stat plate. Used by the
 * layout audit in `scripts/audit-cardface.ts`.
 */
function AllOfRarity({ rarity, size }: { rarity: string; size: CardSize }) {
  const cards = POOL_V4.filter((c) => c.rarity === rarity);
  return (
    <div style={{ background: '#20242c', padding: 16 }}>
      <Band title={`${rarity} — all ${cards.length}`} cards={cards} size={size} />
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

const params = new URLSearchParams(window.location.search);
const allRarity = params.get('all');
const sizeParam = params.get('size');
const allSize: CardSize = sizeParam && sizeParam in CARD_SIZES ? (sizeParam as CardSize) : 'full';
createRoot(document.getElementById('root')!).render(
  allRarity ? <AllOfRarity rarity={allRarity} size={allSize} /> : <Gallery />,
);
