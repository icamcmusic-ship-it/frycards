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
  // Each entry alone is legal (2 ≤ MAX_COPIES) but the total (4) is not.
  expect(decodeDeckCode('FRY1:lead_1:unit_a*2,unit_a*2', db)).toHaveProperty('error');
  // At exactly the cap across entries it decodes fine.
  const ok = decodeDeckCode('FRY1:lead_1:unit_a*2,unit_a', db);
  expect(ok).toEqual({ leaderId: 'lead_1', cardIds: ['unit_a', 'unit_a', 'unit_a'] });
});

test('tolerates surrounding whitespace', () => {
  const res = decodeDeckCode('  FRY1:lead_1:unit_a \n', db);
  expect(res).toEqual({ leaderId: 'lead_1', cardIds: ['unit_a'] });
});
