// Dev-only card template gallery (served at /gallery.html by Vite dev).
// Mirrors the coverage of the "Card Template Options" design sheet: every
// card type at every framed rarity, the two full-bleed rarities (Full-Art
// still image, Mythic looping video), Serialized prints and the static
// prismatic Foil Print row.
import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import { CardFace, CardInfoMode, CardSize, CARD_SIZES } from './components/CardFaceV4';
import { POOL } from './game/poker/cardpool';
import { RARITY_ORDER } from './meta/rarity';
import type { CardDef, CardType } from './game/poker/cards';
import { GradedSlab, SLAB_CSS } from './meta/GradedSlab';
import type { GradedCard } from './meta/grading';

const TYPES: CardType[] = ['Unit', 'Location', 'Item', 'Event', 'Leader'];

function pickBy(pred: (c: CardDef) => boolean): CardDef | undefined {
  return POOL.find(pred);
}

/** One card of each type at the given rarity (whatever the pool actually has). */
function row(rarity: string): CardDef[] {
  return TYPES.map((t) => pickBy((c) => c.rarity === rarity && c.type === t)).filter(
    (c): c is CardDef => !!c,
  );
}

/**
 * `&reveal=1`: each card mounts the way the pack reveal shows it — scaled
 * 1.06 and all but edge-on mid-flip (rotateY 88°) — then turns face-up. The face's
 * layout passes run while it is edge-on, which is where the reveal once
 * measured a zero-width flavour column (see `offsetIn` in CardFaceV4).
 */
const REVEAL = new URLSearchParams(window.location.search).get('reveal') === '1';
function RevealWrap({ children }: { key?: React.Key; children: React.ReactNode }) {
  const [flat, setFlat] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setFlat(true), 250);
    return () => clearTimeout(t);
  }, []);
  return (
    <div style={{ perspective: 800 }}>
      <div
        style={{
          transform: `rotateY(${flat ? 0 : 88}deg) scale(1.06)`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
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
        {cards.map((c, i) => {
          const face = (
            <CardFace
              key={`${c.id}-${i}`}
              def={c}
              size={size}
              foil={foil}
              serial={serialized ? { number: 7 + i, cap: 75 } : undefined}
            />
          );
          return REVEAL ? <RevealWrap key={`${c.id}-${i}`}>{face}</RevealWrap> : face;
        })}
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
 * layout audit in `scripts/audit-cardface.ts`. `&foil=1` prints them all foil.
 */
function AllOfRarity({
  rarity,
  size,
  foil,
  fixtureType,
  reprint,
}: {
  rarity: string;
  size: CardSize;
  foil?: boolean;
  fixtureType?: string | null;
  reprint?: boolean;
}) {
  // `&fixture=<type>`: a preview fixture — the first card of that type,
  // reprinted at this rarity (for a rarity the pool has no card of that type at).
  const fixture = fixtureType ? POOL.find((c) => c.type === fixtureType) : undefined;
  // `&reprint=1`: every card in the pool reprinted at this rarity (the
  // layout audit checks each template against the whole pool's text).
  const cards = fixture
    ? [{ ...fixture, rarity } as CardDef]
    : reprint
      ? POOL.map((c) => ({ ...c, rarity }) as CardDef)
      : POOL.filter((c) => c.rarity === rarity);
  return (
    <div style={{ background: '#20242c', padding: 16 }}>
      <Band title={`${rarity} — all ${cards.length}`} cards={cards} size={size} foil={foil} />
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

/** ?slabs=1 — one slab per grade band: damage at 5–7.5, premium cases at 9+. */
/** `?slabs=1` slabs a Rare Unit; `?slabs=<rarity>` slabs a card of that rarity. */
function Slabs({ rarity }: { rarity: string }) {
  const def =
    POOL.find((c) => c.rarity === rarity && c.type === 'Unit') ??
    POOL.find((c) => c.rarity === rarity) ??
    POOL[0];
  const grades = [5, 6, 7, 8, 9, 9.5, 10];
  return (
    <div style={{ background: '#222', padding: 16, display: 'flex', flexWrap: 'wrap', gap: 18 }}>
      <style>{SLAB_CSS}</style>
      {grades.map((grade, i) => {
        const g: GradedCard = {
          id: `gallery-slab-${i}`,
          user_id: 'u',
          card_id: def.id,
          foil: false,
          service: (['tca', 'amg', 'keeper'] as const)[i % 3],
          speed: 'standard',
          fee_paid: 0,
          submitted_at: '',
          ready_at: '',
          grade,
          revealed_at: '',
        };
        return <GradedSlab key={g.id} g={g} size="standard" />;
      })}
    </div>
  );
}

const params = new URLSearchParams(window.location.search);
const allRarity = params.get('all');
const sizeParam = params.get('size');
const allSize: CardSize = sizeParam && sizeParam in CARD_SIZES ? (sizeParam as CardSize) : 'full';
// `&info=open|tucked`: open (or tuck) every pull-tab face (Mythic, Full-Art);
// the layout audit measures the open faces.
const infoParam = params.get('info');
const infoMode = infoParam === 'open' || infoParam === 'tucked' ? infoParam : 'auto';
createRoot(document.getElementById('root')!).render(
  <CardInfoMode.Provider value={infoMode}>
    {params.get('slabs') ? (
      <Slabs rarity={params.get('slabs') === '1' ? 'Rare' : params.get('slabs')!} />
    ) : allRarity ? (
      <AllOfRarity
        rarity={allRarity}
        size={allSize}
        foil={params.get('foil') === '1'}
        fixtureType={params.get('fixture')}
        reprint={params.get('reprint') === '1'}
      />
    ) : (
      <Gallery />
    )}
  </CardInfoMode.Provider>,
);
