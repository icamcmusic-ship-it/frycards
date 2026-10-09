import { test, expect } from 'vitest';
import { encodeDeckCode, decodeDeckCode, RETIRED_CODE_ERROR } from './deckcode';
import { CardTemplate } from '../types';
import { MODES } from '../game/poker/constants';

const db = new Map<string, CardTemplate>([
  ['lead_1', { id: 'lead_1', type: 'Leader' } as CardTemplate],
  ['loc_a', { id: 'loc_a', type: 'Location' } as CardTemplate],
  ['unit_a', { id: 'unit_a', type: 'Unit' } as CardTemplate],
  ['unit_b', { id: 'unit_b', type: 'Unit' } as CardTemplate],
]);

test('round-trips a deck with duplicate cards and its format', () => {
  const ids = ['loc_a', 'unit_a', 'unit_b', 'unit_a'];
  const code = encodeDeckCode('lead_1', ids, 'quick');
  expect(code).toBe('FRY2:quick:lead_1:loc_a,unit_a*2,unit_b');
  const res = decodeDeckCode(code, db);
  expect(res).toEqual({
    leaderId: 'lead_1',
    cardIds: ['loc_a', 'unit_a', 'unit_a', 'unit_b'],
    mode: 'quick',
  });
});

test('defaults to Standard and round-trips an empty deck', () => {
  const code = encodeDeckCode('lead_1', []);
  expect(code.startsWith('FRY2:standard:')).toBe(true);
  expect(decodeDeckCode(code, db)).toEqual({ leaderId: 'lead_1', cardIds: [], mode: 'standard' });
});

test('a code from the retired game gets a clear error, not a broken deck', () => {
  // A perfectly-formed FRY1 code whose ids all exist must still be refused.
  const res = decodeDeckCode('FRY1:lead_1:unit_a*4,unit_b', db);
  expect(res).toEqual({ error: RETIRED_CODE_ERROR });
  expect(RETIRED_CODE_ERROR).toMatch(/retired/);
});

test('rejects garbage, unknown formats, unknown leaders, unknown cards, bad counts', () => {
  expect(decodeDeckCode('hello', db)).toHaveProperty('error');
  expect(decodeDeckCode('FRY2:lead_1:unit_a', db)).toHaveProperty('error'); // no format
  expect(decodeDeckCode('FRY2:huge:lead_1:unit_a', db)).toHaveProperty('error');
  expect(decodeDeckCode('FRY2:standard:nope:unit_a', db)).toHaveProperty('error');
  expect(decodeDeckCode('FRY2:standard:unit_a:unit_b', db)).toHaveProperty('error'); // non-Leader id
  expect(decodeDeckCode('FRY2:standard:lead_1:mystery', db)).toHaveProperty('error');
  expect(decodeDeckCode('FRY2:standard:lead_1:unit_a*999', db)).toHaveProperty('error');
  expect(decodeDeckCode('FRY2:standard:lead_1:unit_a**2', db)).toHaveProperty('error');
});

test('enforces the format copy limit (2 in Standard, 3 in Deep)', () => {
  expect(MODES.standard.maxCopies).toBe(2);
  expect(decodeDeckCode('FRY2:standard:lead_1:unit_a*3', db)).toHaveProperty('error');
  expect(decodeDeckCode('FRY2:deep:lead_1:unit_a*3', db)).toHaveProperty('cardIds');
});

test('caps the aggregate copy count across repeated entries for the same id', () => {
  // Each entry alone is legal (≤ 2) but the total (4) is not.
  expect(decodeDeckCode('FRY2:standard:lead_1:unit_a*2,unit_a*2', db)).toHaveProperty('error');
  const ok = decodeDeckCode('FRY2:standard:lead_1:unit_a,unit_a', db);
  expect(ok).toEqual({ leaderId: 'lead_1', cardIds: ['unit_a', 'unit_a'], mode: 'standard' });
});

test('rejects a Leader id in the deck body', () => {
  expect(decodeDeckCode('FRY2:standard:lead_1:unit_a,lead_1', db)).toHaveProperty('error');
});

test('rejects codes longer than any format can hold', () => {
  // Deep holds 36 powers + 1 Location = 37. 19 ids × 2 = 38 is one too many.
  const big = new Map(db);
  const entries: string[] = [];
  for (let i = 0; i < 19; i++) {
    const id = `bulk_${i}`;
    big.set(id, { id, type: 'Unit' } as CardTemplate);
    entries.push(`${id}*2`);
  }
  expect(decodeDeckCode(`FRY2:deep:lead_1:${entries.join(',')}`, big)).toHaveProperty('error');
  const ok = decodeDeckCode(`FRY2:deep:lead_1:${entries.slice(0, 18).join(',')},loc_a`, big);
  expect((ok as { cardIds: string[] }).cardIds).toHaveLength(37);
});

test('tolerates surrounding whitespace', () => {
  const res = decodeDeckCode('  FRY2:deep:lead_1:unit_a \n', db);
  expect(res).toEqual({ leaderId: 'lead_1', cardIds: ['unit_a'], mode: 'deep' });
});

test('deck link round-trips through the query string', async () => {
  const { deckLink, deckCodeFromSearch } = await import('./deckcode');
  const code = 'FRY2:standard:mer_king:a*2,b';
  const link = deckLink(code, { origin: 'https://x.github.io', pathname: '/frycards/' });
  expect(link).toBe('https://x.github.io/frycards/?deck=FRY2%3Astandard%3Amer_king%3Aa*2%2Cb');
  expect(deckCodeFromSearch(new URL(link).search)).toBe(code);
});

test('old FRY1 links still reach the preview (which explains they are retired)', async () => {
  const { deckCodeFromSearch } = await import('./deckcode');
  expect(deckCodeFromSearch('?deck=FRY1:x:y')).toBe('FRY1:x:y');
});

test('anything that is not a FryCards code is ignored', async () => {
  const { deckCodeFromSearch } = await import('./deckcode');
  expect(deckCodeFromSearch('')).toBeNull();
  expect(deckCodeFromSearch('?deck=nope')).toBeNull();
  expect(deckCodeFromSearch('?other=FRY2:standard:x:y')).toBeNull();
});
