import { describe, expect, it } from 'vitest';
import { bountySellBlockedWhy, sellableSplit } from './sellable';

describe('sellableSplit (B4)', () => {
  it('lets a Serialized copy also be the deck copy', () => {
    // 2 normal (1 Serialized), 1 in a deck: the server allows 1.
    expect(sellableSplit({ q: 2, f: 0 }, 1, 1)).toEqual({ normal: 1, foil: 0, total: 1 });
  });
  it('keeps the Serialized print', () => {
    expect(sellableSplit({ q: 1, f: 1 }, 0, 1)).toEqual({ normal: 0, foil: 1, total: 1 });
  });
  it('caps a mixed sale by the deck locks', () => {
    expect(sellableSplit({ q: 2, f: 2 }, 2, 0)).toEqual({ normal: 2, foil: 2, total: 2 });
  });
  it('is empty for an unowned card', () => {
    expect(sellableSplit(undefined, 0, 0).total).toBe(0);
  });
});

describe('bountySellBlockedWhy (B4)', () => {
  it('allows the over-blocked case', () => {
    expect(bountySellBlockedWhy({ q: 2, f: 0 }, 1, 1)).toBeNull();
  });
  it('blocks a Serialized normal even with a spare foil (server spends normal first)', () => {
    expect(bountySellBlockedWhy({ q: 1, f: 1 }, 0, 1)).toMatch(/Serialized/);
  });
  it('allows a foil-only sale', () => {
    expect(bountySellBlockedWhy({ q: 0, f: 1 }, 0, 0)).toBeNull();
  });
  it('names a deck lock', () => {
    expect(bountySellBlockedWhy({ q: 1, f: 0 }, 1, 0)).toMatch(/deck/);
  });
});
