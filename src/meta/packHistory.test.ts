/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, test } from 'vitest';
import { quicksellPrice } from './economy';
import { loadPackHistory, PACK_HISTORY_MAX, recordPack, summarizeSession } from './packHistory';
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

describe('summarizeSession', () => {
  const p = (rarity: string, extra: Partial<PackPull> = {}) =>
    ({ card_id: rarity, name: rarity, rarity, foil: false, ...extra }) as PackPull;

  test('empty session has no best pull', () => {
    expect(summarizeSession([])).toEqual({ packs: 0, cards: 0, best: null, keptValue: 0 });
  });

  test('picks the best pull across packs and totals kept quicksell value', () => {
    const r = summarizeSession([
      [p('Common'), p('Rare')],
      [p('Super-Rare'), p('Common', { foil: true })],
    ]);
    expect(r.packs).toBe(2);
    expect(r.cards).toBe(4);
    expect(r.best?.rarity).toBe('Super-Rare');
    expect(r.keptValue).toBe(
      quicksellPrice('Common', false) +
        quicksellPrice('Rare', false) +
        quicksellPrice('Super-Rare', false) +
        quicksellPrice('Common', true),
    );
  });

  test('over-cap conversions and Serialized prints are not counted as kept value', () => {
    const r = summarizeSession([
      [p('Rare', { converted_to_credits: true }), p('Mythic', { serialized: true }), p('Common')],
    ]);
    expect(r.keptValue).toBe(quicksellPrice('Common', false));
    expect(r.best?.serialized).toBe(true);
  });

  test('a kept copy outranks an over-cap conversion of the same rarity', () => {
    const kept = p('Rare', { card_id: 'kept' });
    const paid = p('Rare', { card_id: 'paid', converted_to_credits: true });
    expect(summarizeSession([[paid, kept]]).best?.card_id).toBe('kept');
  });
});
