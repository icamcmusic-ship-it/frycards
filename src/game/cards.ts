import { CardTemplate, GameCard } from '../types';
import { GENERATED_CARDS } from './generated-cards';
import { buildCardData, CardData } from './deckbuilder';

// The active card pool. Starts from the bundled fallback data and can be
// swapped for the live Supabase card set before a match starts.
let cardData: CardData = buildCardData(GENERATED_CARDS);

export function applyCardData(templates: CardTemplate[]) {
  const customIds = [
    "abyssal_soul_eater",
    "chrono_phalanx",
    "modularity_core",
    "quantum_overclocker",
    "lurking_coral_prowler",
    "starfall_wildcaster"
  ];
  const customCards = GENERATED_CARDS.filter((c) => customIds.includes(c.id));
  const merged = [...templates];
  for (const c of customCards) {
    if (!merged.some((m) => m.id === c.id)) {
      merged.push(c);
    }
  }
  const next = buildCardData(merged);
  if (next.leaderIds.length === 0) return; // refuse a pool with no Leaders
  cardData = next;
}

/** Every template in the active card pool (live Supabase set or bundled fallback). */
export function getAllCards(): CardTemplate[] {
  return Object.values(cardData.db);
}

export function getCard(id: string): CardTemplate | undefined {
  return cardData.db[id];
}

export function getLeaders(): CardTemplate[] {
  return cardData.leaderIds.map((id) => cardData.db[id]);
}

export function getDeckableLeaders(): string[] {
  return cardData.leaderIds.filter((id) => cardData.decks[id]);
}

/** Parse a keyword string like "Armor 2" into { name, value }. */
export function parseKeyword(kw: string): { name: string; value: number; arg?: string } {
  const parts = kw.split(' ');
  const name = parts[0];
  const rest = parts.slice(1).join(' ');
  const num = parseInt(rest, 10);
  return { name, value: isNaN(num) ? 0 : num, arg: isNaN(num) ? rest : undefined };
}

export function hasKeyword(card: CardTemplate | GameCard, name: string): boolean {
  return !!card.keywords?.some((k) => k.split(' ')[0] === name);
}

export function keywordValue(card: CardTemplate | GameCard, name: string): number {
  const kw = card.keywords?.find((k) => k.split(' ')[0] === name);
  return kw ? parseKeyword(kw).value : 0;
}

export function keywordArg(card: CardTemplate | GameCard, name: string): string | undefined {
  const kw = card.keywords?.find((k) => k.split(' ')[0] === name);
  return kw ? parseKeyword(kw).arg : undefined;
}

export function instantiateCard(templateId: string, ownerId: string): GameCard {
  const template = cardData.db[templateId];
  if (!template) throw new Error(`Card not found: ${templateId}`);
  return {
    ...template,
    instanceId: crypto.randomUUID(),
    ownerId,
    damageTaken: 0,
    bonusDamage: 0,
    exhausted: false,
    summoningSickness: template.type === 'Unit' ? !hasKeyword(template, 'Blitz') : false,
    scorch: 0,
    frozen: 0,
    glitched: false,
    armor: keywordValue(template, 'Armor'),
    witherAtk: 0,
    witherHp: 0,
    tempAtk: 0,
    tempHp: 0,
    attacksThisTurn: 0,
    attachedItems: [],
  };
}

/** Manifest a token unit that does not come from any deck. */
export function makeToken(name: string, attack: number, health: number, ownerId: string): GameCard {
  return {
    id: 'token_' + name.toLowerCase().replace(/\s+/g, '_'),
    name,
    type: 'Unit',
    elements: ['Generic'],
    attack,
    health,
    keywords: [],
    isToken: true,
    instanceId: crypto.randomUUID(),
    ownerId,
    damageTaken: 0,
    bonusDamage: 0,
    exhausted: false,
    summoningSickness: true,
    scorch: 0,
    frozen: 0,
    glitched: false,
    armor: 0,
    witherAtk: 0,
    witherHp: 0,
    tempAtk: 0,
    tempHp: 0,
    attacksThisTurn: 0,
    attachedItems: [],
  };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Build a player's starting board state from a leader's generated deck list.
 * Per rulebook §1.2, two Location cards are pulled from the deck into the
 * Location Zone; the remaining cards form the draw deck.
 */
export function buildDeck(leaderId: string, ownerId: string, customCards?: string[]) {
  const def = cardData.decks[leaderId];
  const cardIds = customCards && customCards.length > 0 ? customCards : def?.cards;
  if (!cardIds) throw new Error(`No deck for leader ${leaderId}`);

  const leader = instantiateCard(leaderId, ownerId);
  const cards = cardIds.filter((id) => cardData.db[id]).map((id) => instantiateCard(id, ownerId));

  // Pull 2 Location cards from the deck into the Location Zone.
  const locations: GameCard[] = [];
  const rest: GameCard[] = [];
  for (const c of cards) {
    if (c.type === 'Location' && locations.length < 2) locations.push(c);
    else rest.push(c);
  }

  return { leader, locations, deck: shuffle(rest) };
}
