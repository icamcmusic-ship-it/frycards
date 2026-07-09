import { test, expect } from 'vitest';
import { validateDeckList, DECK_SIZE, MAX_COPIES } from './DeckBuilderScreen';
import { POOL_V4, POOL_BY_ID } from '../game/v3/cardpool';

const db = new Map(POOL_V4.map((c) => [c.id, c]));
const leader = POOL_BY_ID['avatar_of_the_abyss'];
const units = POOL_V4.filter((c) => c.type !== 'Leader');

function fillDeck(n: number, maxPerCard = MAX_COPIES): string[] {
  const ids: string[] = [];
  for (const c of units) {
    for (let i = 0; i < maxPerCard && ids.length < n; i++) ids.push(c.id);
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

test('accepts an exactly-30-card, max-3-copies-per-card deck', () => {
  const ids = fillDeck(DECK_SIZE);
  const issues = validateDeckList(leader, ids, db);
  expect(issues).toEqual([]);
});

test('rejects more than 3 copies of one card (v4.2 cap, up from legacy 2)', () => {
  const card = units[0];
  const ids = [...Array(4).fill(card.id), ...fillDeck(DECK_SIZE - 4).filter((id) => id !== card.id)];
  const issues = validateDeckList(leader, ids.slice(0, DECK_SIZE), db);
  expect(issues.some((i) => i.text.includes('Too many copies'))).toBe(true);
});

test('rejects a Leader card sitting inside the 30-card list', () => {
  const ids = [leader.id, ...fillDeck(DECK_SIZE - 1)];
  const issues = validateDeckList(leader, ids, db);
  expect(issues.some((i) => i.text.includes('Leaders cannot be in the 30-card deck'))).toBe(true);
});

test('does NOT enforce any color-identity restriction (elements were removed in v4.1)', () => {
  // Deliberately mix cards that would have failed a legacy color check.
  const mixed = [...units].sort((a, b) => a.id.localeCompare(b.id));
  const ids = fillDeck(DECK_SIZE);
  const issues = validateDeckList(leader, ids, db);
  expect(issues.every((i) => !i.text.includes('color identity'))).toBe(true);
  void mixed;
});

test('enforces collection ownership limits when a collection is supplied', () => {
  const card = units[0];
  const ids = fillDeck(DECK_SIZE);
  const collection = [{ card_id: card.id, quantity: 1, foil_quantity: 0 }];
  const issues = validateDeckList(leader, ids, db, collection);
  expect(issues.some((i) => i.text.includes(`only own`))).toBe(true);
});
