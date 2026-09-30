/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { CACHE_VERSION, cachedFetch, readCache, writeCache } from './cache';

beforeEach(() => localStorage.clear());
afterEach(() => vi.useRealTimers());

describe('cachedFetch', () => {
  test('fetches once, then serves from cache inside the TTL', async () => {
    const fetcher = vi.fn(async () => ['a']);
    expect(await cachedFetch('k', 1000, fetcher)).toEqual(['a']);
    expect(await cachedFetch('k', 1000, fetcher)).toEqual(['a']);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  test('refetches after the TTL, and force skips the freshness check', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn(async () => Date.now());
    const first = await cachedFetch('k', 1000, fetcher);
    vi.advanceTimersByTime(1500);
    const second = await cachedFetch('k', 1000, fetcher);
    expect(second).toBeGreaterThan(first);
    await cachedFetch('k', 10_000, fetcher, { force: true });
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  test('a failed refetch falls back to the stale copy; with none it throws', async () => {
    writeCache('k', ['old']);
    const boom = vi.fn(async () => {
      throw new Error('offline');
    });
    expect(await cachedFetch('k', 0, boom)).toEqual(['old']);
    await expect(cachedFetch('missing', 0, boom)).rejects.toThrow('offline');
  });

  test('entries from another cache version, or junk, read as a miss', () => {
    localStorage.setItem(
      'frycards:cache:k',
      JSON.stringify({ v: CACHE_VERSION + 1, at: Date.now(), data: 1 }),
    );
    expect(readCache('k')).toBeNull();
    localStorage.setItem('frycards:cache:k', '{oops');
    expect(readCache('k')).toBeNull();
  });
});

describe('visibleInterval', () => {
  test('skips ticks while the tab is hidden and catches up when it returns', async () => {
    const { visibleInterval } = await import('./utils');
    vi.useFakeTimers();
    let hidden = false;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
    const fn = vi.fn();
    const stop = visibleInterval(fn, 1000);
    vi.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(2);
    hidden = true;
    document.dispatchEvent(new Event('visibilitychange'));
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(2);
    hidden = false;
    document.dispatchEvent(new Event('visibilitychange'));
    expect(fn).toHaveBeenCalledTimes(3);
    stop();
    vi.advanceTimersByTime(5000);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
