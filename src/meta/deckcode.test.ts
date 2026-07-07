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
