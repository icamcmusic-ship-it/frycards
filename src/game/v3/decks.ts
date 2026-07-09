/**
 * v4.0 deck builder. Produces a wide variety of legal 30-card decks (max 3
 * copies) from the remapped POOL_V4, each built around an archetype so the
 * simulations exercise real strategic diversity rather than one goodstuff pile.
 */
import { CardDef } from './cards';
import { DeckDef } from './engine';
import { POOL_BY_ID, POOL_V4, poolByType } from './cardpool';

const DECK_SIZE = 30; // v4.0
const MAX_COPIES = 3;

export interface Archetype {
  label: string;
  leaderId: string;
  /** preferred elements (soft filter). */
  elements: string[];
  /** keyword themes to over-weight. */
  keywords: string[];
  /** rough composition targets (they sum to <= 30; remainder auto-filled). */
  units: number;
  spells: number;
  locations: number;
  /** favor combo-gated payoffs / a straight vs matching family. */
  comboFamily?: 'match' | 'straight' | 'none';
}

function score(c: CardDef, arch: Archetype): number {
  let s = 0;
  for (const el of c.elements || []) if (arch.elements.includes(el)) s += 3;
  for (const kw of c.keywords || []) if (arch.keywords.includes(kw)) s += 4;
  // Combo-family coherence (guidance F2: don't mix straight & matching gates).
  if (c.comboGate) {
    const isStraight = c.comboGate === 'SmallStraight' || c.comboGate === 'LargeStraight';
    if (arch.comboFamily === 'straight') s += isStraight ? 5 : -6;
    else if (arch.comboFamily === 'match') s += isStraight ? -6 : 5;
    else s -= 2;
  }
  if (c.combo) {
    const isStraight = c.combo.pattern === 'SmallStraight' || c.combo.pattern === 'LargeStraight';
    if (arch.comboFamily === 'straight') s += isStraight ? 3 : -2;
    else if (arch.comboFamily === 'match') s += isStraight ? -2 : 3;
  }
  // Slight curve preference: reward playable thresholds.
  if ((c.threshold ?? 3) <= 4) s += 1;
  s += (POOL_V4.indexOf(c) % 3) * 0.1; // tiny deterministic tiebreak
  return s;
}

function take(pool: CardDef[], arch: Archetype, count: number, used: Set<string>): [string, number][] {
  const ranked = pool
    .filter((c) => !used.has(c.id))
    .sort((a, b) => score(b, arch) - score(a, arch));
  const out: [string, number][] = [];
  let remaining = count;
  for (const c of ranked) {
    if (remaining <= 0) break;
    const copies = Math.min(MAX_COPIES, remaining);
    out.push([c.id, copies]);
    used.add(c.id);
    remaining -= copies;
  }
  return out;
}

export function buildDeck(arch: Archetype): DeckDef {
  const used = new Set<string>();
  const cards: Record<string, number> = {};
  const add = (entries: [string, number][]) => {
    for (const [id, n] of entries) cards[id] = (cards[id] || 0) + n;
  };
  add(take(poolByType('Unit'), arch, arch.units, used));
  add(take([...poolByType('Charm'), ...poolByType('Event')], arch, arch.spells, used));
  add(take(poolByType('Location'), arch, arch.locations, used));
  // Fill any shortfall (if a category ran dry) with best remaining units.
  let total = Object.values(cards).reduce((a, b) => a + b, 0);
  if (total < DECK_SIZE) {
    add(take(poolByType('Unit'), arch, DECK_SIZE - total, used));
    total = Object.values(cards).reduce((a, b) => a + b, 0);
  }
  // Trim overflow deterministically.
  if (total > DECK_SIZE) {
    const ids = Object.keys(cards);
    let over = total - DECK_SIZE;
    for (const id of ids.reverse()) {
      while (over > 0 && cards[id] > 0) { cards[id]--; over--; }
      if (cards[id] === 0) delete cards[id];
      if (over === 0) break;
    }
  }
  return { leaderId: arch.leaderId, cards, resolve: (id) => POOL_BY_ID[id], label: arch.label };
}

// ---------------------------------------------------------------------------
// A varied roster of archetypes across all six real Leaders.
// ---------------------------------------------------------------------------
export const ARCHETYPES: Archetype[] = [
  { label: 'Abyss Echo-Recursion', leaderId: 'avatar_of_the_abyss',
    elements: ['Dark', 'Nature'], keywords: ['Echo', 'Twin'],
    units: 17, spells: 9, locations: 4, comboFamily: 'match' },
  { label: 'Abyss Sap Burn', leaderId: 'avatar_of_the_abyss',
    elements: ['Dark', 'Flame'], keywords: ['Frenzy', 'Pierce'],
    units: 15, spells: 12, locations: 3, comboFamily: 'none' },

  { label: 'Sea Witch Bind-Control', leaderId: 'ethereal_sea_witch',
    elements: ['Frost', 'Tech'], keywords: ['Ward', 'Anchor'],
    units: 16, spells: 11, locations: 3, comboFamily: 'straight' },
  { label: 'Sea Witch Anchor-Ramp', leaderId: 'ethereal_sea_witch',
    elements: ['Tech', 'Frost'], keywords: ['Anchor', 'Ward'],
    units: 18, spells: 8, locations: 4, comboFamily: 'none' },

  { label: 'Mer King Guard-Wall', leaderId: 'mer_king',
    elements: ['Light', 'Order'], keywords: ['Guard', 'Ward'],
    units: 18, spells: 8, locations: 4, comboFamily: 'none' },
  { label: 'Mer King Heal-Midrange', leaderId: 'mer_king',
    elements: ['Light', 'Nature'], keywords: ['Guard', 'Twin'],
    units: 16, spells: 10, locations: 4, comboFamily: 'match' },

  { label: 'Diver Straight-Combo', leaderId: 'legendary_diver',
    elements: ['Flame', 'Chaos'], keywords: ['Swift', 'Frenzy'],
    units: 15, spells: 12, locations: 3, comboFamily: 'straight' },
  { label: 'Diver Aggro-Swift', leaderId: 'legendary_diver',
    elements: ['Flame', 'Chaos'], keywords: ['Frenzy', 'Swift', 'Pierce'],
    units: 19, spells: 8, locations: 3, comboFamily: 'none' },

  { label: 'Crimson Frenzy-Aggro', leaderId: 'crimson_vector_commander',
    elements: ['Flame', 'Order'], keywords: ['Frenzy', 'Pierce', 'Guard'],
    units: 19, spells: 8, locations: 3, comboFamily: 'none' },
  { label: 'Crimson Match-Combo', leaderId: 'crimson_vector_commander',
    elements: ['Flame', 'Order'], keywords: ['Guard', 'Frenzy'],
    units: 16, spells: 11, locations: 3, comboFamily: 'match' },

  { label: 'Shinobi Tempo-Anchor', leaderId: 'apex_nanite_shinobi',
    elements: ['Tech', 'Dark'], keywords: ['Anchor', 'Echo', 'Swift'],
    units: 17, spells: 10, locations: 3, comboFamily: 'none' },
  { label: 'Shinobi Echo-Straight', leaderId: 'apex_nanite_shinobi',
    elements: ['Tech', 'Dark'], keywords: ['Echo', 'Anchor'],
    units: 16, spells: 11, locations: 3, comboFamily: 'straight' },
];

export function allDecks(): DeckDef[] {
  return ARCHETYPES.map(buildDeck);
}
