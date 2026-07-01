import { CardTemplate, GameCard } from '../types';

export const CARD_DB: Record<string, CardTemplate> = {
  // Leaders
  'L_AURELIUS': { id: 'L_AURELIUS', name: 'Aurelius, Radiant', type: 'Leader', elements: ['Light', 'Order'], health: 30, attack: 2 },
  'L_MALAKOR': { id: 'L_MALAKOR', name: 'Malakor, Void', type: 'Leader', elements: ['Dark', 'Chaos'], health: 30, attack: 3 },
  
  // Units P1
  'U_PALADIN': { id: 'U_PALADIN', name: 'Lightblade Paladin', type: 'Unit', elements: ['Light'], cost: { Light: 2 }, health: 3, attack: 2, keywords: ['Guard'] },
  'U_ENFORCER': { id: 'U_ENFORCER', name: 'Order Enforcer', type: 'Unit', elements: ['Order'], cost: { Order: 1, Generic: 1 }, health: 2, attack: 1, keywords: ['Blitz'] },
  'U_CLERIC': { id: 'U_CLERIC', name: 'Cleric of Dawn', type: 'Unit', elements: ['Light'], cost: { Light: 1 }, health: 2, attack: 1 },
  'U_KNIGHT': { id: 'U_KNIGHT', name: 'High Knight', type: 'Unit', elements: ['Order'], cost: { Order: 2, Generic: 1 }, health: 4, attack: 3 },
  'U_ARCHER': { id: 'U_ARCHER', name: 'Sunbow Archer', type: 'Unit', elements: ['Light'], cost: { Light: 1, Generic: 1 }, health: 2, attack: 2 },
  
  // Units P2
  'U_FIEND': { id: 'U_FIEND', name: 'Void Fiend', type: 'Unit', elements: ['Dark'], cost: { Dark: 2 }, health: 2, attack: 3 },
  'U_CHAOS': { id: 'U_CHAOS', name: 'Chaos Elemental', type: 'Unit', elements: ['Chaos'], cost: { Chaos: 2, Generic: 1 }, health: 4, attack: 2, keywords: ['Pierce'] },
  'U_CULTIST': { id: 'U_CULTIST', name: 'Void Cultist', type: 'Unit', elements: ['Dark'], cost: { Dark: 1 }, health: 1, attack: 2 },
  'U_BEHEMOTH': { id: 'U_BEHEMOTH', name: 'Abyssal Behemoth', type: 'Unit', elements: ['Chaos'], cost: { Chaos: 3, Generic: 1 }, health: 5, attack: 4 },
  'U_SHADE': { id: 'U_SHADE', name: 'Creeping Shade', type: 'Unit', elements: ['Dark'], cost: { Dark: 1, Generic: 1 }, health: 2, attack: 2 },
  
  // Locations
  'LOC_SANCTUARY': { id: 'LOC_SANCTUARY', name: 'Sanctuary of Light', type: 'Location', elements: ['Light'] },
  'LOC_ABYSS': { id: 'LOC_ABYSS', name: 'The Endless Abyss', type: 'Location', elements: ['Dark'] },
};

export function instantiateCard(templateId: string, ownerId: string): GameCard {
  const template = CARD_DB[templateId];
  if (!template) throw new Error(`Card not found: ${templateId}`);
  return {
    ...template,
    instanceId: crypto.randomUUID(),
    ownerId,
    damageTaken: 0,
    exhausted: false,
    summoningSickness: template.type === 'Unit' ? !template.keywords?.includes('Blitz') : false,
  };
}

export function createPlayer1Deck(ownerId: string) {
  const leader = instantiateCard('L_AURELIUS', ownerId);
  const locations = Array(4).fill(0).map(() => instantiateCard('LOC_SANCTUARY', ownerId));
  const deck = [
    ...Array(3).fill('U_PALADIN'),
    ...Array(3).fill('U_ENFORCER'),
    ...Array(3).fill('U_CLERIC'),
    ...Array(3).fill('U_KNIGHT'),
    ...Array(3).fill('U_ARCHER'),
  ].map(id => instantiateCard(id, ownerId)).sort(() => Math.random() - 0.5);
  
  return { leader, locations, deck };
}

export function createPlayer2Deck(ownerId: string) {
  const leader = instantiateCard('L_MALAKOR', ownerId);
  const locations = Array(4).fill(0).map(() => instantiateCard('LOC_ABYSS', ownerId));
  const deck = [
    ...Array(3).fill('U_FIEND'),
    ...Array(3).fill('U_CHAOS'),
    ...Array(3).fill('U_CULTIST'),
    ...Array(3).fill('U_BEHEMOTH'),
    ...Array(3).fill('U_SHADE'),
  ].map(id => instantiateCard(id, ownerId)).sort(() => Math.random() - 0.5);
  
  return { leader, locations, deck };
}
