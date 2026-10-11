import { describe, expect, test } from 'vitest';
import type { CardDef } from '../../game/poker/cards';
import {
  buildSellItems,
  bulkLots,
  filterSellItems,
  marketFee,
  priceWarnings,
  suggestPrices,
  validateDraft,
  youReceive,
  type SellFilter,
} from './sellLogic';

const def = (
  id: string,
  rarity: CardDef['rarity'] = 'Rare',
  extra: Partial<CardDef> = {},
): CardDef => ({
  id,
  name: id.toUpperCase(),
  type: 'Unit',
  rarity,
  colors: ['Ember'],
  ...extra,
});
const defs = {
  a: def('a'),
  b: def('b', 'Common', { colors: [] }),
  l: def('l', 'Rare', { type: 'Leader' }),
};
const F: SellFilter = {
  search: '',
  kind: 'all',
  rarity: 'All',
  color: 'All',
  type: 'All',
  set: 'All',
  showBlocked: false,
};

describe('fees', () => {
  test('ceil 5% like finalize_sale', () => {
    expect(marketFee(100)).toBe(5);
    expect(marketFee(101)).toBe(6);
    expect(youReceive(101)).toBe(95);
  });
});

describe('buildSellItems', () => {
  const items = buildSellItems({
    collection: [
      { card_id: 'a', quantity: 3, foil_quantity: 1 },
      { card_id: 'b', quantity: 1, foil_quantity: 0 },
      { card_id: 'l', quantity: 2, foil_quantity: 0 },
    ],
    decks: [{ card_ids: ['b'] }],
    serialized: [{ card_id: 'a' }],
    variants: [{ card_id: 'a', variant: 'shattered', foil: false, quantity: 1 } as never],
    slabs: [
      { id: 's1', card_id: 'a', foil: false, grade: 9, service: 'tca', submitted_at: '' } as never,
      {
        id: 's2',
        card_id: 'a',
        foil: false,
        grade: null,
        service: 'amg',
        submitted_at: '',
      } as never,
    ],
    defs,
  });
  const by = new Map(items.map((i) => [i.key, i]));
  test('splits plain / foil / variant / slab and skips Leaders', () => {
    expect(items.some((i) => i.cardId === 'l')).toBe(false);
    // 3 normal - 1 variant = 2 plain, 1 of them serialized
    expect(by.get('card:a:0:')).toMatchObject({ owned: 2, spare: 1, reserved: 1 });
    expect(by.get('card:a:1:')).toMatchObject({ spare: 1 });
    expect(by.get('card:a:0:shattered')).toMatchObject({ spare: 1 });
    expect(by.get('slab:s1')).toMatchObject({ spare: 1, blockedWhy: null });
    expect(by.get('slab:s2')?.blockedWhy).toBe('At the graders');
  });
  test('deck-locked cards carry a reason and are hidden by default', () => {
    expect(by.get('card:b:0:')?.blockedWhy).toMatch(/deck/);
    expect(filterSellItems(items, F, 'value').some((i) => i.cardId === 'b')).toBe(false);
    expect(
      filterSellItems(items, { ...F, showBlocked: true }, 'value').some((i) => i.cardId === 'b'),
    ).toBe(true);
  });
  test('filters by kind and colour', () => {
    expect(filterSellItems(items, { ...F, kind: 'slabs' }, 'value').map((i) => i.key)).toEqual([
      'slab:s1',
    ]);
    expect(
      filterSellItems(items, { ...F, color: 'Colourless', showBlocked: true }, 'name').map(
        (i) => i.cardId,
      ),
    ).toEqual(['b']);
  });
});

describe('pricing help', () => {
  test('suggestions undercut the lowest live listing but stay within floor..market', () => {
    const s = suggestPrices(40, { market: 100, recent: [], lowest_active: 90, active_count: 1 });
    expect(s.quick).toBe(88);
    expect(s.market).toBe(100);
    expect(s.premium).toBe(125);
    expect(
      suggestPrices(95, { market: 100, recent: [], lowest_active: 50, active_count: 1 }).quick,
    ).toBe(95);
  });
  test('warns below quicksell and far above market', () => {
    expect(priceWarnings(30, 1, 40, 100, 'fixed')[0].text).toMatch(/quicksell/);
    expect(priceWarnings(500, 1, 40, 100, 'fixed')[0].text).toMatch(/market/);
    expect(priceWarnings(100, 1, 40, 100, 'fixed')).toEqual([]);
  });
  test('validation mirrors create_listing', () => {
    const d = { type: 'auction' as const, quantity: 1, price: 100, buyout: 100, hours: 24 };
    expect(validateDraft(d, 1)).toMatch(/Buyout/);
    expect(validateDraft({ ...d, buyout: null }, 1)).toBeNull();
    expect(validateDraft({ ...d, buyout: null, quantity: 2 }, 1)).toMatch(/At most 1/);
    expect(validateDraft({ ...d, buyout: null, price: 0 }, 1)).toMatch(/price/);
  });
  test('bulk prices each lot at % of its market', () => {
    const items = buildSellItems({
      collection: [{ card_id: 'a', quantity: 4, foil_quantity: 0 }],
      decks: [],
      serialized: [],
      variants: [],
      slabs: [],
      defs,
    });
    const g = new Map([
      ['card:a:0:', { market: 200, recent: [], lowest_active: null, active_count: 0 }],
    ]);
    expect(bulkLots(items, g, 90, true)[0].lot).toMatchObject({
      quantity: 4,
      price: 720,
      type: 'fixed',
    });
    expect(bulkLots(items, g, 90, false)[0].lot).toMatchObject({ quantity: 1, price: 180 });
  });
});
