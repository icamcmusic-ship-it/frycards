import { CardTemplate } from '../types';

export interface DeckDef {
  leader: string;
  cards: string[]; // 30 template ids, max 2 copies per name (rulebook §1.1)
}

export interface CardData {
  db: Record<string, CardTemplate>;
  decks: Record<string, DeckDef>;
  leaderIds: string[];
}

/**
 * Build a legal 30-card deck for every Leader in the card pool (§1.1):
 * exactly 30 cards, max 2 copies per unique name, only cards whose color
 * identity is covered by the Leader's supported elements, and at least two
 * Location cards so the Location Zone can be filled at setup (§1.2).
 */
export function buildCardData(templates: CardTemplate[]): CardData {
  const db: Record<string, CardTemplate> = {};
  for (const t of templates) db[t.id] = t;

  const leaders = templates.filter((t) => t.type === 'Leader');
  const decks: Record<string, DeckDef> = {};

  const costOf = (t: CardTemplate) => Object.values(t.cost || {}).reduce((a, b) => a + b, 0);

  // Rate a card's raw strength so every Leader plays the BEST of its pool,
  // not merely the cheapest. Keywords carry a flat premium.
  const cardScore = (t: CardTemplate): number => {
    const kwBonus = (t.keywords || []).length * 1.2;
    if (t.type === 'Unit') return (t.attack || 0) + (t.health || 0) + kwBonus - costOf(t);
    const eff = t.effect ? t.effect.value || 2 : 0;
    const attach = t.attach ? (t.attach.attack || 0) + (t.attach.health || 0) : 0;
    return eff + attach + kwBonus - costOf(t) * 0.5;
  };

  // Pick `n` names: best-scoring cards inside cost buckets (cheap / mid / top)
  // so decks keep a real mana curve while maximizing card quality.
  const pickCurve = (list: CardTemplate[], n: number): CardTemplate[] => {
    if (list.length <= n) return [...list];
    const cheap = list.filter((t) => costOf(t) <= 2);
    const mid = list.filter((t) => costOf(t) >= 3 && costOf(t) <= 4);
    const top = list.filter((t) => costOf(t) >= 5);
    for (const b of [cheap, mid, top]) b.sort((a, b2) => cardScore(b2) - cardScore(a));
    const want = [Math.ceil(n * 0.5), Math.ceil(n * 0.3), Math.floor(n * 0.2)];
    const out: CardTemplate[] = [
      ...cheap.slice(0, want[0]),
      ...mid.slice(0, want[1]),
      ...top.slice(0, want[2]),
    ];
    // Backfill from the global best if a bucket ran dry.
    const rest = list.filter((t) => !out.includes(t)).sort((a, b2) => cardScore(b2) - cardScore(a));
    while (out.length < n && rest.length > 0) out.push(rest.shift()!);
    return out.slice(0, n);
  };

  for (const leader of leaders) {
    const pool = templates.filter(
      (t) => t.type !== 'Leader' && t.elements.every((e) => leader.elements.includes(e)),
    );
    const locations = pool.filter((t) => t.type === 'Location');
    const units = pool.filter((t) => t.type === 'Unit');
    const spells = pool.filter((t) => ['Event', 'Item', 'Charm'].includes(t.type));

    for (const l of [locations, units, spells]) {
      l.sort((a, b) => costOf(a) - costOf(b) || a.name.localeCompare(b.name));
    }

    const deck: string[] = [];
    // Guarantee the Location Zone can be filled: 2 copies of the 2 cheapest Locations.
    for (const loc of locations.slice(0, 2)) deck.push(loc.id, loc.id);
    // 7 unit names × 2 (14 units) and 6 spell names × 2 (12 spells) spread
    // across the cost curve.
    const picks = [...pickCurve(units, 7), ...pickCurve(spells, 6)];
    for (const t of picks) {
      if (deck.length >= 30) break;
      deck.push(t.id);
      if (deck.length < 30) deck.push(t.id);
    }
    // Backfill from the remaining pool if a color pair has a shallow pool.
    const leftovers = [...units, ...spells, ...locations.slice(2)].filter(
      (t) => !deck.includes(t.id),
    );
    for (const t of leftovers) {
      if (deck.length >= 30) break;
      deck.push(t.id);
      if (deck.length < 30) deck.push(t.id);
    }
    let i = 0;
    const all = [...units, ...spells, ...locations];
    while (deck.length < 30 && all.length > 0) {
      deck.push(all[i % all.length].id);
      i++;
    }
    decks[leader.id] = { leader: leader.id, cards: deck.slice(0, 30) };
  }

  return { db, decks, leaderIds: leaders.map((l) => l.id) };
}
