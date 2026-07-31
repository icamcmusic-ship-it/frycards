/**
 * "There's a new version — refresh" plumbing.
 *
 * A single-page app that a player leaves open on their phone for days keeps
 * running whatever bundle it loaded on the day it started, against a card
 * catalog that changes underneath it. Two separate things can go stale, and
 * both need a refresh to pick up:
 *
 *   1. The BUILD. A deploy replaces the JS/CSS on the server; the open tab
 *      still runs the old one. `vite.config.ts` writes the same build id into
 *      the bundle (`__APP_BUILD__`) and into `version.json` beside it, so the
 *      client can compare what it is running against what is being served.
 *
 *   2. The CARD CATALOG. `App.tsx` fetches `cards` exactly once at boot and
 *      derives the whole pool from it. A balance pass or a Creator override
 *      lands in the database with no deploy at all, and every open client keeps
 *      printing the old card — costs, keywords, rules text and all — until it
 *      is reloaded. `cards.updated_at` is the version of that catalog.
 *
 * Both checks are deliberately cheap and failure-tolerant: a check that cannot
 * reach the server returns `null` and the caller simply keeps whatever it knew
 * before. Never nag on a network blip.
 */
import { supabase } from './supabase';

/** The build this bundle was compiled from. */
export const CURRENT_BUILD: string = typeof __APP_BUILD__ === 'string' ? __APP_BUILD__ : 'unknown';

export type UpdateKind = 'build' | 'catalog';

/** What a single poll learned. `null` on either field means "couldn't tell". */
export interface VersionSnapshot {
  build: string | null;
  catalog: string | null;
}

/**
 * Decide whether the running client is out of date.
 *
 * `baseline` is what the client had when it booted; `latest` is what the server
 * says now. An unknown value on EITHER side is never an update — that is the
 * whole reason this is a pure function with its own tests, because getting it
 * wrong means either an update that never announces itself or a refresh prompt
 * that reappears forever on a flaky connection.
 */
export function updateKind(baseline: VersionSnapshot, latest: VersionSnapshot): UpdateKind | null {
  if (latest.build && baseline.build && latest.build !== baseline.build) return 'build';
  if (latest.catalog && baseline.catalog && latest.catalog !== baseline.catalog) return 'catalog';
  return null;
}

/**
 * The build id the server is currently serving.
 *
 * `cache: 'no-store'` plus a cache-busting query is not belt-and-braces: GitHub
 * Pages serves version.json with a 10-minute CDN TTL, and a plain fetch would
 * happily replay the response the bundle was loaded with — the one file whose
 * whole job is to be fresher than the bundle.
 */
export async function fetchServedBuild(): Promise<string | null> {
  try {
    const base = (import.meta as any).env?.BASE_URL || '/';
    const url = `${base.endsWith('/') ? base : base + '/'}version.json?t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    return typeof json?.build === 'string' ? json.build : null;
  } catch {
    return null;
  }
}

/**
 * The card catalog's version: the newest `updated_at` across the table. One
 * indexed-free-but-tiny read of a single column, at most once every few
 * minutes, against a 297-row table.
 */
export async function fetchCatalogVersion(): Promise<string | null> {
  try {
    // A plain one-row list rather than `.maybeSingle()`: single-object mode
    // asks PostgREST for a different content type and turns an empty catalog
    // into an error, and there is nothing here worth failing over.
    const { data, error } = await supabase
      .from('cards')
      .select('updated_at')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (error || !data?.length) return null;
    const v = (data as { updated_at: string | null }[])[0]?.updated_at;
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

/** One poll of both sources. Neither can reject. */
export async function fetchVersionSnapshot(): Promise<VersionSnapshot> {
  const [build, catalog] = await Promise.all([fetchServedBuild(), fetchCatalogVersion()]);
  return { build, catalog };
}
