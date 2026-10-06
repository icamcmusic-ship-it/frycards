/**
 * A small localStorage cache for data that changes rarely and is fetched on
 * every app load: the card catalog, pack types, shop items.
 *
 * Each of those used to be re-downloaded on every visit, by every player, from
 * a free-tier project whose egress is capped. With a TTL, a returning player
 * costs zero requests for them inside the window.
 *
 * Deliberately simple. Entries carry the time they were written and a schema
 * version, so a deploy that changes a payload's shape bumps `CACHE_VERSION`
 * and drops every old entry instead of feeding stale shapes to new code.
 * Storage that is blocked, full, or holding junk simply reads as a miss.
 */
export const CACHE_VERSION = 2;
const PREFIX = 'frycards:cache:';

interface Entry<T> {
  v: number;
  at: number;
  data: T;
}

export function readCache<T>(key: string): { data: T; ageMs: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const e = JSON.parse(raw) as Entry<T>;
    if (!e || e.v !== CACHE_VERSION || typeof e.at !== 'number' || e.data === undefined) {
      return null;
    }
    return { data: e.data, ageMs: Math.max(0, Date.now() - e.at) };
  } catch {
    return null;
  }
}

export function writeCache<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;
  try {
    const e: Entry<T> = { v: CACHE_VERSION, at: Date.now(), data };
    window.localStorage.setItem(PREFIX + key, JSON.stringify(e));
  } catch {
    /* storage blocked or full: the next load just fetches again */
  }
}

export function clearCache(key: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(PREFIX + key);
  } catch {
    /* nothing to clear */
  }
}

/**
 * Return the cached value when it is younger than `ttlMs`; otherwise run
 * `fetcher`, cache its result and return it. If the fetch throws and an older
 * copy exists, that copy is returned rather than failing — stale beats
 * nothing. `force` skips the freshness check (a deliberate refresh), and still
 * refreshes the cache on success.
 */
export async function cachedFetch<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  opts: { force?: boolean } = {},
): Promise<T> {
  const hit = readCache<T>(key);
  if (hit && !opts.force && hit.ageMs < ttlMs) return hit.data;
  try {
    const fresh = await fetcher();
    writeCache(key, fresh);
    return fresh;
  } catch (err) {
    if (hit) return hit.data;
    throw err;
  }
}
