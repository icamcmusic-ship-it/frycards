import { describe, expect, test } from 'vitest';
import { listingPrice, sortListings, timeLeft } from './MarketplaceScreen';

const NOW = Date.UTC(2026, 9, 8, 12, 0, 0);
const at = (ms: number) => new Date(NOW + ms).toISOString();
const H = 3_600_000;
const D = 24 * H;

describe('timeLeft (audit M5)', () => {
  test('minutes, hours and days', () => {
    expect(timeLeft(at(25 * 60_000), NOW)).toBe('25m left');
    expect(timeLeft(at(5 * H + 7 * 60_000), NOW)).toBe('5h 7m left');
    expect(timeLeft(at(3 * D), NOW)).toBe('3d left');
  });

  test('switches to weeks and months for long listings', () => {
    expect(timeLeft(at(20 * D), NOW)).toBe('2w left');
    expect(timeLeft(at(90 * D), NOW)).toBe('3mo left');
  });

  test('a year or more out reads "No expiry", never "26382d left"', () => {
    expect(timeLeft(at(400 * D), NOW)).toBe('No expiry');
    expect(timeLeft('2099-01-01T00:00:00.000Z', NOW)).toBe('No expiry');
  });

  test('past, missing and invalid ends all read "ended"', () => {
    expect(timeLeft(at(-1), NOW)).toBe('ended');
    expect(timeLeft(null, NOW)).toBe('ended');
    expect(timeLeft('not a date', NOW)).toBe('ended');
  });
});

describe('sortListings', () => {
  const l = (id: string, price: number, ends: number, bid: number | null = null) => ({
    id,
    listing_type: bid != null ? ('auction' as const) : ('fixed' as const),
    price,
    current_bid: bid,
    ends_at: at(ends),
  });
  const rows = [l('a', 500, 3 * H), l('b', 100, 9 * H), l('c', 50, 1 * H, 900), l('d', 100, 2 * H)];

  test('ending soonest', () => {
    expect(sortListings(rows, 'ending').map((r) => r.id)).toEqual(['c', 'd', 'a', 'b']);
  });

  test('price uses the standing bid for auctions, ties broken by ending soonest', () => {
    expect(listingPrice(rows[2])).toBe(900);
    expect(sortListings(rows, 'price-asc').map((r) => r.id)).toEqual(['d', 'b', 'a', 'c']);
    expect(sortListings(rows, 'price-desc').map((r) => r.id)).toEqual(['c', 'a', 'd', 'b']);
  });

  test('does not mutate its input', () => {
    const copy = [...rows];
    sortListings(rows, 'price-desc');
    expect(rows).toEqual(copy);
  });
});
