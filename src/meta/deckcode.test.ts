import { test, expect } from 'vitest';
import { encodeDeckCode, decodeDeckCode } from './deckcode';
import { CardTemplate } from '../types';

const db = new Map<string, CardTemplate>([
  ['lead_1', { id: 'lead_1', type: 'Leader' } as CardTemplate],
  ['unit_a', { id: 'unit_a', type: 'Unit' } as CardTemplate],
  ['unit_b', { id: 'unit_b', type: 'Unit' } as CardTemplate],
]);

test('round-trips a deck with duplicate cards', () => {
  const ids = ['unit_a', 'unit_b', 'unit_a'];
  const code = encodeDeckCode('lead_1', ids);
  const res = decodeDeckCode(code, db);
  expect(res).toEqual({ leaderId: 'lead_1', cardIds: ['unit_a', 'unit_a', 'unit_b'] });
});

test('round-trips an empty deck', () => {
  const res = decodeDeckCode(encodeDeckCode('lead_1', []), db);
  expect(res).toEqual({ leaderId: 'lead_1', cardIds: [] });
});

test('rejects garbage, unknown leaders, unknown cards, bad counts', () => {
  expect(decodeDeckCode('hello', db)).toHaveProperty('error');
  expect(decodeDeckCode('FRY1:nope:unit_a', db)).toHaveProperty('error');
  expect(decodeDeckCode('FRY1:unit_a:unit_b', db)).toHaveProperty('error'); // non-Leader id
  expect(decodeDeckCode('FRY1:lead_1:mystery', db)).toHaveProperty('error');
  expect(decodeDeckCode('FRY1:lead_1:unit_a*999', db)).toHaveProperty('error');
});

test('caps the aggregate copy count across repeated entries for the same id', () => {
  // Each entry alone is legal (3 ≤ MAX_COPIES=4) but the total (6) is not.
  expect(decodeDeckCode('FRY1:lead_1:unit_a*3,unit_a*3', db)).toHaveProperty('error');
  // At exactly the cap across entries it decodes fine.
  const ok = decodeDeckCode('FRY1:lead_1:unit_a*3,unit_a', db);
  expect(ok).toEqual({ leaderId: 'lead_1', cardIds: ['unit_a', 'unit_a', 'unit_a', 'unit_a'] });
});

test('rejects a Leader id in the deck body', () => {
  expect(decodeDeckCode('FRY1:lead_1:unit_a,lead_1', db)).toHaveProperty('error');
});

test('rejects codes whose body exceeds DECK_MAX total cards', () => {
  // 26 distinct ids at 4 copies each = 104 > DECK_MAX (100). Every entry is
  // individually legal — only the aggregate deck size is not.
  const big = new Map(db);
  const entries: string[] = [];
  for (let i = 0; i < 26; i++) {
    const id = `bulk_${i}`;
    big.set(id, { id, type: 'Unit' } as CardTemplate);
    entries.push(`${id}*4`);
  }
  expect(decodeDeckCode(`FRY1:lead_1:${entries.join(',')}`, big)).toHaveProperty('error');
  // Exactly DECK_MAX (25 × 4 = 100) still decodes fine.
  const ok = decodeDeckCode(`FRY1:lead_1:${entries.slice(0, 25).join(',')}`, big);
  expect(ok).toHaveProperty('cardIds');
  expect((ok as { cardIds: string[] }).cardIds).toHaveLength(100);
});

test('tolerates surrounding whitespace', () => {
  const res = decodeDeckCode('  FRY1:lead_1:unit_a \n', db);
  expect(res).toEqual({ leaderId: 'lead_1', cardIds: ['unit_a'] });
});
