/**
 * @vitest-environment jsdom
 */
import { beforeEach, describe, expect, test } from 'vitest';
import { WISHLIST_KEY, loadWishlist, saveWishlist, toggleWishlisted } from './wishlist';

beforeEach(() => localStorage.clear());

describe('wishlist', () => {
  test('round-trips through storage', () => {
    saveWishlist(new Set(['a', 'b']));
    expect([...loadWishlist()].sort()).toEqual(['a', 'b']);
  });
  test('toggle adds then removes without mutating the input', () => {
    const start = new Set(['a']);
    const added = toggleWishlisted(start, 'b');
    expect([...added].sort()).toEqual(['a', 'b']);
    expect([...start]).toEqual(['a']);
    expect([...toggleWishlisted(added, 'a')]).toEqual(['b']);
  });
  test('corrupt or hand-edited storage yields an empty list, not a crash', () => {
    localStorage.setItem(WISHLIST_KEY, '{not json');
    expect(loadWishlist().size).toBe(0);
    localStorage.setItem(WISHLIST_KEY, '{"a":1}');
    expect(loadWishlist().size).toBe(0);
    localStorage.setItem(WISHLIST_KEY, JSON.stringify(['ok', 3, null]));
    expect([...loadWishlist()]).toEqual(['ok']);
  });
});
