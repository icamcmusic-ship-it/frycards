import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchVersionSnapshot,
  updateKind,
  UpdateKind,
  VersionSnapshot,
  CURRENT_BUILD,
} from './appVersion';

/** How often to ask the server whether anything shipped. */
const POLL_MS = 5 * 60 * 1000;
/** Don't re-poll on every focus flick — a tab switch every few seconds is
 *  normal phone behaviour and should not turn into a request each time. */
const MIN_GAP_MS = 60 * 1000;

const DISMISS_KEY = 'frycards_update_dismissed';

function readDismissed(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

/**
 * Watches for a new deploy or a changed card catalog and reports when the
 * running client is stale, so the player can be offered a refresh instead of
 * playing on against a version of the game that no longer exists.
 *
 * Polls on an interval, and — more importantly for a phone — whenever the tab
 * comes back to the foreground or the connection returns, which is exactly when
 * a client that has been asleep for a day is most likely to be out of date.
 */
export function useAppUpdate(): {
  kind: UpdateKind | null;
  /** The build id the server is serving, once known. */
  servedBuild: string | null;
  dismiss: () => void;
  refreshNow: () => void;
} {
  const [kind, setKind] = useState<UpdateKind | null>(null);
  const [servedBuild, setServedBuild] = useState<string | null>(null);
  /** What this client is running: the compiled build, and the catalog version
   *  as of the first successful poll (the pool was fetched at boot, so the
   *  first reading is the one it is actually printing). */
  const baseline = useRef<VersionSnapshot>({ build: CURRENT_BUILD, catalog: null });
  const lastCheck = useRef(0);
  const alive = useRef(true);

  const check = useCallback(async () => {
    const now = Date.now();
    if (now - lastCheck.current < MIN_GAP_MS) return;
    lastCheck.current = now;
    const latest = await fetchVersionSnapshot();
    if (!alive.current) return;
    if (latest.build) setServedBuild(latest.build);
    // First successful catalog read establishes the baseline rather than
    // counting as a change — otherwise every client would announce an update
    // on its very first poll.
    if (baseline.current.catalog === null) {
      baseline.current = { ...baseline.current, catalog: latest.catalog };
    }
    let k = updateKind(baseline.current, latest);
    // A build the player already waved away stays waved away until the next one.
    // Dropping the build from BOTH sides rather than bailing out here matters:
    // a dismissed build otherwise masks every later catalog change for as long
    // as the player stays on that page, because `updateKind` reports the build
    // first and would never get as far as the catalog.
    if (k === 'build' && latest.build && readDismissed() === latest.build) {
      k = updateKind({ ...baseline.current, build: null }, { ...latest, build: null });
    }
    if (!k) return;
    setKind(k);
  }, []);

  useEffect(() => {
    alive.current = true;
    // Check once on mount as well as on the interval: the first reading is what
    // establishes the catalog baseline, and taking it at boot (rather than five
    // minutes in) is what makes a catalog change during those five minutes
    // visible instead of silently becoming the new "normal". Deferred out of
    // the effect body so mounting never queues a render of its own.
    const first = window.setTimeout(check, 0);
    const timer = window.setInterval(check, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      alive.current = false;
      window.clearTimeout(first);
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [check]);

  const dismiss = useCallback(() => {
    if (servedBuild) {
      try {
        localStorage.setItem(DISMISS_KEY, servedBuild);
      } catch {
        // Private mode / storage full — the banner just comes back next poll.
      }
    }
    setKind(null);
  }, [servedBuild]);

  const refreshNow = useCallback(() => {
    // Clear the dismissal so a later, genuinely-different build still gets to
    // announce itself: the stored id is only meaningful as "already declined".
    try {
      localStorage.removeItem(DISMISS_KEY);
    } catch {
      // Ignore — reloading is what matters.
    }
    window.location.reload();
  }, []);

  return { kind, servedBuild, dismiss, refreshNow };
}
