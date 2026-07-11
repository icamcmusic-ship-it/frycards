/**
 * v4.0 deck builder. Produces a wide variety of legal 30-card decks (max 3
 * copies) from the remapped POOL_V4, each built around an archetype so the
 * simulations exercise real strategic diversity rather than one goodstuff pile.
 */
import { CardDef } from './cards';
import { DeckDef } from './engine';
import { POOL_BY_ID, POOL_V4, poolByType } from './cardpool';

const DECK_SIZE = 30; // v4.0
export const MAX_COPIES = 3;

export interface Archetype {
  label: string;
  leaderId: string;
  /** keyword themes to over-weight. */
  keywords: string[];
  /** effect actions to over-weight (aggro=sap, control=bind/destroy, etc.). */
  effects?: string[];
  /** rough composition targets (they sum to <= 30; remainder auto-filled). */
  units: number;
  spells: number;
  locations: number;
  /** favor combo-gated payoffs / a straight vs matching family. */
  comboFamily?: 'match' | 'straight' | 'none';
}

function score(c: CardDef, arch: Archetype): number {
  let s = 0;
  for (const kw of c.keywords || []) if (arch.keywords.includes(kw)) s += 4;
  // Reward on-theme effect actions so keyword-light spells still sort sensibly.
  const act = c.onCast?.action || c.ability?.effect.action;
  if (act && arch.effects?.includes(act)) s += 3;
  // Board wipes are premium answers for control/reactive shells (v4.1 guidance D).
  if (c.onCast?.target === 'allEnemyUnits' && arch.effects?.includes('destroy')) s += 6;
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

function take(
  pool: CardDef[],
  arch: Archetype,
  count: number,
  used: Set<string>,
): [string, number][] {
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
      while (over > 0 && cards[id] > 0) {
        cards[id]--;
        over--;
      }
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
  {
    label: 'Abyss Echo-Recursion',
    leaderId: 'avatar_of_the_abyss',
    keywords: ['Echo', 'Twin'],
    effects: ['draw', 'sap'],
    units: 17,
    spells: 9,
    locations: 4,
    comboFamily: 'match',
  },
  {
    label: 'Abyss Sap Burn',
    leaderId: 'avatar_of_the_abyss',
    keywords: ['Frenzy', 'Pierce'],
    effects: ['sap', 'destroy'],
    units: 15,
    spells: 12,
    locations: 3,
    comboFamily: 'none',
  },

  {
    label: 'Sea Witch Bind-Control',
    leaderId: 'ethereal_sea_witch',
    keywords: ['Ward', 'Anchor'],
    effects: ['bind', 'destroy', 'draw'],
    units: 16,
    spells: 11,
    locations: 3,
    comboFamily: 'straight',
  },
  {
    label: 'Sea Witch Anchor-Ramp',
    leaderId: 'ethereal_sea_witch',
    keywords: ['Anchor', 'Ward'],
    effects: ['draw', 'bind'],
    units: 18,
    spells: 8,
    locations: 4,
    comboFamily: 'none',
  },

  {
    label: 'Mer King Guard-Wall',
    leaderId: 'mer_king',
    keywords: ['Guard', 'Ward'],
    effects: ['mend', 'destroy'],
    units: 18,
    spells: 8,
    locations: 4,
    comboFamily: 'none',
  },
  {
    label: 'Mer King Heal-Midrange',
    leaderId: 'mer_king',
    keywords: ['Guard', 'Twin'],
    effects: ['mend', 'buff'],
    units: 16,
    spells: 10,
    locations: 4,
    comboFamily: 'match',
  },

  {
    label: 'Diver Straight-Combo',
    leaderId: 'legendary_diver',
    keywords: ['Swift', 'Frenzy'],
    effects: ['sap', 'draw'],
    units: 15,
    spells: 12,
    locations: 3,
    comboFamily: 'straight',
  },
  {
    label: 'Diver Aggro-Swift',
    leaderId: 'legendary_diver',
    keywords: ['Frenzy', 'Swift', 'Pierce'],
    effects: ['sap'],
    units: 19,
    spells: 8,
    locations: 3,
    comboFamily: 'none',
  },

  {
    label: 'Crimson Frenzy-Aggro',
    leaderId: 'crimson_vector_commander',
    keywords: ['Frenzy', 'Pierce', 'Guard'],
    effects: ['sap'],
    units: 19,
    spells: 8,
    locations: 3,
    comboFamily: 'none',
  },
  {
    label: 'Crimson Match-Combo',
    leaderId: 'crimson_vector_commander',
    keywords: ['Guard', 'Frenzy'],
    effects: ['sap', 'buff'],
    units: 16,
    spells: 11,
    locations: 3,
    comboFamily: 'match',
  },

  {
    label: 'Shinobi Tempo-Anchor',
    leaderId: 'apex_nanite_shinobi',
    keywords: ['Anchor', 'Echo', 'Swift'],
    effects: ['buff', 'sap'],
    units: 17,
    spells: 10,
    locations: 3,
    comboFamily: 'none',
  },
  {
    label: 'Shinobi Echo-Straight',
    leaderId: 'apex_nanite_shinobi',
    keywords: ['Echo', 'Anchor'],
    effects: ['draw', 'sap'],
    units: 16,
    spells: 11,
    locations: 3,
    comboFamily: 'straight',
  },
];

export function allDecks(): DeckDef[] {
  return ARCHETYPES.map(buildDeck);
}

/**
 * Build a DeckDef from a saved custom deck (Supabase `decks` row: a Leader id
 * plus a flat list of card ids, one entry per copy). Used to play a
 * player-built deck through the same engine/AI as the prebuilt archetypes.
 */
export function deckDefFromCustom(leaderId: string, cardIds: string[], label: string): DeckDef {
  const cards: Record<string, number> = {};
  for (const id of cardIds) cards[id] = (cards[id] || 0) + 1;
  return { leaderId, cards, resolve: (id) => POOL_BY_ID[id], label };
}

// ---------------------------------------------------------------------------
// Random deck generation — used for the CPU opponent so every match plays a
// freshly rolled build instead of one of the twelve fixed archetypes above.
// ---------------------------------------------------------------------------
const ALL_KEYWORDS = [
  'Guard',
  'Swift',
  'Pierce',
  'Ward',
  'Frenzy',
  'Anchor',
  'Echo',
  'Rally',
  'Twin',
];
const ALL_EFFECTS = ['sap', 'mend', 'draw', 'bind', 'destroy', 'buff'];
const COMBO_FAMILIES: Array<Archetype['comboFamily']> = ['match', 'straight', 'none'];

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Builds a random-but-coherent Archetype spec: random Leader, random keyword/effect
 * leanings and a random unit/spell/location split. `buildDeck()` still does the
 * actual card scoring, so the result is a legal, sensibly-curved 30-card deck. */
export function randomArchetype(rng: () => number = Math.random): Archetype {
  const leaderIds = [...new Set(ARCHETYPES.map((a) => a.leaderId))];
  const leaderId = leaderIds[Math.floor(rng() * leaderIds.length)];
  const leader = POOL_BY_ID[leaderId];

  const keywords = shuffle(ALL_KEYWORDS, rng).slice(0, 2 + Math.floor(rng() * 2));
  const effects = shuffle(ALL_EFFECTS, rng).slice(0, 1 + Math.floor(rng() * 3));
  const comboFamily = COMBO_FAMILIES[Math.floor(rng() * COMBO_FAMILIES.length)];

  const units = 14 + Math.floor(rng() * 6); // 14-19
  const locations = 3 + Math.floor(rng() * 2); // 3-4
  const spells = Math.max(4, DECK_SIZE - units - locations);

  return {
    label: `${leader?.name || 'Unknown Leader'} — Randomized Build`,
    leaderId,
    keywords,
    effects,
    units,
    spells,
    locations,
    comboFamily,
  };
}
