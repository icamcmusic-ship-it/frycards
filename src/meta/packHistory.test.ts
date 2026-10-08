/**
 * @vitest-environment jsdom
 */
import { beforeEach, expect, test } from 'vitest';
import { loadPackHistory, PACK_HISTORY_MAX, recordPack } from './packHistory';
import type { PackPull } from '../lib/supabase';

const pull = (id: string): PackPull =>
  ({ card_id: id, name: id, rarity: 'Rare', foil: false, slot: 'x' }) as PackPull;

beforeEach(() => localStorage.clear());

test('newest first, capped, and empty opens are not recorded', () => {
  recordPack('A', []);
  expect(loadPackHistory()).toEqual([]);
  for (let i = 0; i < PACK_HISTORY_MAX + 5; i++) recordPack(`P${i}`, [pull(`c${i}`)]);
  const h = loadPackHistory();
  expect(h).toHaveLength(PACK_HISTORY_MAX);
  expect(h[0].packName).toBe(`P${PACK_HISTORY_MAX + 4}`);
  expect(h[0].pulls[0]).toEqual({
    card_id: `c${PACK_HISTORY_MAX + 4}`,
    name: `c${PACK_HISTORY_MAX + 4}`,
    rarity: 'Rare',
    foil: false,
    serialized: undefined,
  });
});

test('junk in storage reads as empty', () => {
  localStorage.setItem('frycards:pack-history', '{nope');
  expect(loadPackHistory()).toEqual([]);
});
