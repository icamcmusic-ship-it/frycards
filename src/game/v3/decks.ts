/**
 * Riftbound v5.0 deck builder. Produces legal 30-card decks (rarity copy
 * caps, Leader color identity) from the remapped POOL_V4, each built around
 * an archetype (keyword theme + cost curve) so games exercise real strategic
 * diversity rather than one goodstuff pile. Wellsprings are auto-supplied by
 * the engine and take no deck slots; Sanctums are just utility cards.
 */
import { CardDef, totalCost } from './cards';
import { DeckDef } from './engine';
import { POOL_BY_ID, POOL_LEADERS, POOL_V4, poolByType } from './cardpool';
import { Color, isColorLegal, KEYWORDS_OF_COLOR, LEADER_COLORS } from './colors';

const DECK_SIZE = 30;
export const MAX_COPIES = 3;

/**
 * Per-rarity deck copy caps: Common/Uncommon/Rare up to 3, Super-Rare/
 * Full-Art/Ultra-Rare up to 2, Mythic exactly 1.
 */
export function maxCopiesForRarity(rarity?: string): number {
  if (rarity === 'Mythic') return 1;
  if (rarity === 'Super-Rare' || rarity === 'Full-Art' || rarity === 'Ultra-Rare') return 2;
  return MAX_COPIES;
}

export interface Archetype {
  label: string;
  leaderId: string;
  /** keyword themes to over-weight. */
  keywords: string[];
  /** effect actions to over-weight (aggro=damage, control=shatter/banish...). */
  effects?: string[];
  /** rough composition targets (sum <= 30; remainder auto-filled with units). */
  units: number;
  spells: number;
  sanctums: number;
}

/** Color-identity-filtered pool for a Leader — every generated deck must be
 * legal under the Leader's identity, same rule the deck builder UI enforces. */
function legalPoolByType(type: CardDef['type'], leaderId: string): CardDef[] {
  const identity = LEADER_COLORS[leaderId];
  const all = poolByType(type);
  return identity ? all.filter((c) => isColorLegal(c, identity)) : all;
}

function score(c: CardDef, arch: Archetype): number {
  let s = 0;
  for (const kw of c.keywords ?? []) if (arch.keywords.includes(kw)) s += 4;
  // On-color keyword coherence: reward keywords at home in the Leader's colors.
  const identity = LEADER_COLORS[arch.leaderId] ?? [];
  const onColorKws = new Set(identity.flatMap((col: Color) => KEYWORDS_OF_COLOR[col]));
  for (const kw of c.keywords ?? []) if (onColorKws.has(kw)) s += 1;
  // On-theme effect actions.
  const act = c.onInvoke?.action;
  if (act && arch.effects?.includes(act)) s += 3;
  // Board wipes are premium answers for control shells.
  if (c.onInvoke?.target === 'allEnemyUnits' && arch.effects?.includes('shatter')) s += 6;
  // Curve preference: playable total costs first.
  const tc = totalCost(c.cost);
  if (tc <= 3) s += 2;
  else if (tc >= 6) s -= 1;
  // Unit stat efficiency.
  if (c.type === 'Unit') s += ((c.might ?? 0) + (c.grit ?? 0)) / Math.max(1, tc) - 1.5;
  s += (POOL_V4.indexOf(c) % 3) * 0.1; // tiny deterministic tiebreak
  return s;
}

/** Target cost-curve buckets (totalCost 1-2 / 3-4 / 5+) as deck fractions. */
const CURVE_TARGETS: [low: number, mid: number, high: number] = [0.4, 0.4, 0.2];

function curveBucket(c: CardDef): 0 | 1 | 2 {
  const tc = totalCost(c.cost);
  return tc <= 2 ? 0 : tc <= 4 ? 1 : 2;
}

function take(
  pool: CardDef[],
  arch: Archetype,
  count: number,
  used: Set<string>,
  bucketCounts: [number, number, number],
): [string, number][] {
  const ranked = pool.filter((c) => !used.has(c.id)).sort((a, b) => score(b, arch) - score(a, arch));
  const out: [string, number][] = [];
  let remaining = count;
  for (const c of ranked) {
    if (remaining <= 0) break;
    // Curve shaping: skip a card whose bucket is already over target (unless
    // nothing else will fill the deck — the final fill pass ignores curve).
    const b = curveBucket(c);
    const total = bucketCounts[0] + bucketCounts[1] + bucketCounts[2];
    if (total >= 8 && bucketCounts[b] / DECK_SIZE >= CURVE_TARGETS[b] + 0.1) continue;
    const copies = Math.min(maxCopiesForRarity(c.rarity), MAX_COPIES, remaining);
    out.push([c.id, copies]);
    used.add(c.id);
    bucketCounts[b] += copies;
    remaining -= copies;
  }
  // Curve-blind fill if the shaped pass ran dry.
  if (remaining > 0) {
    for (const c of ranked) {
      if (remaining <= 0) break;
      if (used.has(c.id)) continue;
      const copies = Math.min(maxCopiesForRarity(c.rarity), remaining);
      out.push([c.id, copies]);
      used.add(c.id);
      bucketCounts[curveBucket(c)] += copies;
      remaining -= copies;
    }
  }
  return out;
}

export function buildDeck(arch: Archetype): DeckDef {
  const used = new Set<string>();
  const counts: Record<string, number> = {};
  const buckets: [number, number, number] = [0, 0, 0];
  const add = (entries: [string, number][]) => {
    for (const [id, n] of entries) counts[id] = (counts[id] ?? 0) + n;
  };
  const units = legalPoolByType('Unit', arch.leaderId);
  const spells = [
    ...legalPoolByType('Charm', arch.leaderId),
    ...legalPoolByType('Event', arch.leaderId),
  ];
  const sanctums = legalPoolByType('Location', arch.leaderId);
  add(take(units, arch, arch.units, used, buckets));
  add(take(spells, arch, arch.spells, used, buckets));
  add(take(sanctums, arch, arch.sanctums, used, buckets));
  let total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total < DECK_SIZE) {
    add(take([...units, ...spells], arch, DECK_SIZE - total, used, buckets));
    total = Object.values(counts).reduce((a, b) => a + b, 0);
  }
  // Trim overflow deterministically.
  if (total > DECK_SIZE) {
    let over = total - DECK_SIZE;
    for (const id of Object.keys(counts).reverse()) {
      while (over > 0 && counts[id] > 0) {
        counts[id]--;
        over--;
      }
      if (counts[id] === 0) delete counts[id];
      if (over === 0) break;
    }
  }
  const cards: string[] = [];
  for (const [id, n] of Object.entries(counts)) for (let i = 0; i < n; i++) cards.push(id);
  return { leaderId: arch.leaderId, cards, label: arch.label };
}

/**
 * Build a DeckDef from a saved custom deck (a Leader id plus a flat list of
 * card ids, one entry per copy).
 */
export function deckDefFromCustom(leaderId: string, cardIds: string[], label: string): DeckDef {
  return { leaderId, cards: [...cardIds], label };
}

// ---------------------------------------------------------------------------
// Random archetype generation — CPU opponents (and players with no saved
// deck) play a freshly rolled, coherent build.
// ---------------------------------------------------------------------------
const ALL_EFFECTS = ['damage', 'heal', 'draw', 'buff', 'shatter', 'banish', 'erode', 'recover'];

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Builds a random-but-coherent Archetype spec: random Leader, keyword themes
 * drawn from the Leader's own colors, random effect leanings and composition
 * split. `buildDeck()` does the actual card scoring. */
export function randomArchetype(rng: () => number = Math.random): Archetype {
  const leaderId =
    POOL_LEADERS[Math.floor(rng() * POOL_LEADERS.length)]?.id ?? 'avatar_of_the_abyss';
  const leader = POOL_BY_ID[leaderId];
  const identity = LEADER_COLORS[leaderId] ?? [];
  const themePool = identity.flatMap((c: Color) => KEYWORDS_OF_COLOR[c]);
  const keywords = shuffle(
    themePool.length > 0 ? [...new Set(themePool)] : ['Aerial', 'Overrun', 'Siphon'],
    rng,
  ).slice(0, 2 + Math.floor(rng() * 2));
  const effects = shuffle(ALL_EFFECTS, rng).slice(0, 1 + Math.floor(rng() * 3));
  const units = 16 + Math.floor(rng() * 5); // 16-20
  const sanctums = 2 + Math.floor(rng() * 2); // 2-3
  const spells = Math.max(4, DECK_SIZE - units - sanctums);
  return {
    label: `${leader?.name ?? 'Unknown Leader'} — Randomized Build`,
    leaderId,
    keywords,
    effects,
    units,
    spells,
    sanctums,
  };
}
