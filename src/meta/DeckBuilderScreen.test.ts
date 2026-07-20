import { test, expect } from 'vitest';
import { validateDeckList, DECK_SIZE, MAX_COPIES } from './DeckBuilderScreen';
import { maxCopiesForRarity } from '../game/v3/decks';
import { POOL_V4, POOL_BY_ID } from '../game/v3/cardpool';
import { isColorLegal, LEADER_COLORS } from '../game/v3/colors';

const db = new Map(POOL_V4.map((c) => [c.id, c]));
const leader = POOL_BY_ID['avatar_of_the_abyss'];
// v4.13: color-identity-legal-for-this-leader subset — every test below that
// expects a clean/legal deck must build from cards actually legal under
// `leader`'s identity now that validateDeckList enforces it.
const identity = LEADER_COLORS[leader.id];
const units = POOL_V4.filter((c) => c.type !== 'Leader' && isColorLegal(c, identity));
const offColorUnits = POOL_V4.filter(
  (c) => c.type !== 'Leader' && !isColorLegal(c, identity),
);

function fillDeck(n: number, maxPerCard = MAX_COPIES): string[] {
  const ids: string[] = [];
  for (const c of units) {
    // v4.8: honor the per-rarity copy caps (Mythic 1, SR/FA/UR 2, else 3).
    const cap = Math.min(maxPerCard, maxCopiesForRarity(c.rarity));
    for (let i = 0; i < cap && ids.length < n; i++) ids.push(c.id);
    if (ids.length >= n) break;
  }
  return ids.slice(0, n);
}

test('requires a Leader before checking anything else', () => {
  const issues = validateDeckList(undefined, [], db);
  expect(issues).toEqual([{ text: 'Pick a Leader.' }]);
});

test('flags a deck that is not exactly 30 cards', () => {
  const issues = validateDeckList(leader, fillDeck(29), db);
  expect(issues.some((i) => i.text.includes('exactly 30'))).toBe(true);
});

test('accepts an exactly-30-card deck within all copy caps', () => {
  const ids = fillDeck(DECK_SIZE);
  const issues = validateDeckList(leader, ids, db);
  expect(issues).toEqual([]);
});

test('rejects more than 3 copies of one card (v4.2 cap, up from legacy 2)', () => {
  const card = units[0];
  const ids = [
    ...Array(4).fill(card.id),
    ...fillDeck(DECK_SIZE - 4).filter((id) => id !== card.id),
  ];
  const issues = validateDeckList(leader, ids.slice(0, DECK_SIZE), db);
  expect(issues.some((i) => i.text.includes('Too many copies'))).toBe(true);
});

test('rejects a Leader card sitting inside the 30-card list', () => {
  const ids = [leader.id, ...fillDeck(DECK_SIZE - 1)];
  const issues = validateDeckList(leader, ids, db);
  expect(issues.some((i) => i.text.includes('Leaders cannot be in the 30-card deck'))).toBe(true);
});

test('v4.13 enforces color identity — an off-identity card is rejected', () => {
  if (offColorUnits.length === 0) throw new Error('leader has no off-color cards to test against');
  const offCard = offColorUnits[0];
  const ids = [offCard.id, ...fillDeck(DECK_SIZE - 1).filter((id) => id !== offCard.id)].slice(
    0,
    DECK_SIZE,
  );
  const issues = validateDeckList(leader, ids, db);
  expect(issues.some((i) => i.text.includes('color identity'))).toBe(true);
});

test('v4.13 a deck built only from in-identity cards raises no color-identity issue', () => {
  const ids = fillDeck(DECK_SIZE);
  const issues = validateDeckList(leader, ids, db);
  expect(issues.every((i) => !i.text.includes('color identity'))).toBe(true);
});

test('enforces collection ownership limits when a collection is supplied', () => {
  const card = units[0];
  const ids = fillDeck(DECK_SIZE);
  const collection = [{ card_id: card.id, quantity: 1, foil_quantity: 0 }];
  const issues = validateDeckList(leader, ids, db, collection);
  expect(issues.some((i) => i.text.includes(`available`))).toBe(true);
});

test('v4.8 enforces per-rarity copy caps (Mythic max 1, Ultra-Rare max 2)', () => {
  const mythic = units.find((c) => c.rarity === 'Mythic');
  const ultra = units.find((c) => c.rarity === 'Ultra-Rare');
  if (!mythic || !ultra) throw new Error('pool is missing Mythic/Ultra-Rare cards');
  const filler = fillDeck(DECK_SIZE).filter((id) => id !== mythic.id && id !== ultra.id);
  const ids = [mythic.id, mythic.id, ultra.id, ultra.id, ultra.id, ...filler].slice(0, DECK_SIZE);
  const issues = validateDeckList(leader, ids, db);
  expect(issues.some((i) => i.text.includes(`${mythic.name} (Mythic: max 1)`))).toBe(true);
  expect(issues.some((i) => i.text.includes(`${ultra.name} (Ultra-Rare: max 2)`))).toBe(true);
});
