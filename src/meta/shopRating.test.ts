import { expect, test } from 'vitest';
import { formatShopRating } from './PlayerShopsScreen';

test('shop rating is always shown on the 0-5 star scale (audit M6)', () => {
  expect(formatShopRating(4.64)).toBe('4.6');
  expect(formatShopRating(0)).toBe('0.0');
  expect(formatShopRating(5)).toBe('5.0');
  // A 0-100 composite must never print as "88.0 / 5".
  expect(formatShopRating(88)).toBe('4.4');
  expect(formatShopRating(100)).toBe('5.0');
  expect(formatShopRating(-1)).toBe('0.0');
});
