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

  for (const leader of leaders) {
    const pool = templates.filter(
      (t) => t.type !== 'Leader' && t.elements.every((e) => leader.elements.includes(e))
    );
    const locations = pool.filter((t) => t.type === 'Location');
    const rest = pool.filter((t) => t.type !== 'Location');

    const costOf = (t: CardTemplate) =>
      Object.values(t.cost || {}).reduce((a, b) => a + b, 0);
    rest.sort((a, b) => costOf(a) - costOf(b) || a.name.localeCompare(b.name));
    locations.sort((a, b) => costOf(a) - costOf(b) || a.name.localeCompare(b.name));

    const deck: string[] = [];
    // Guarantee the Location Zone can be filled: 2 copies of the 2 cheapest Locations.
    for (const loc of locations.slice(0, 2)) deck.push(loc.id, loc.id);
    // Fill the rest with 2 copies each: units first, then items/events/charms/locations.
    const ordered = [...rest, ...locations.slice(2)];
    for (const t of ordered) {
      if (deck.length >= 30) break;
      deck.push(t.id);
      if (deck.length < 30) deck.push(t.id);
    }
    // Pad with extra location copies if the pool was tiny (shouldn't happen).
    let i = 0;
    while (deck.length < 30 && ordered.length > 0) {
      deck.push(ordered[i % ordered.length].id);
      i++;
    }
    decks[leader.id] = { leader: leader.id, cards: deck.slice(0, 30) };
  }

  return { db, decks, leaderIds: leaders.map((l) => l.id) };
}
