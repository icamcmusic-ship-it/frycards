import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MetaScreen, Route, parseHash, routesEqual, serializeRoute } from './routes';
import { usePersistedState } from './usePersistedState';

/**
 * A tiny dependency-free hash router over the History API.
 *
 * Why not state-only: screens used to live in React state, so the browser /
 * Android back button left the app, a refresh dropped you on the menu and
 * nothing could be linked. Now every screen change is a real history entry
 * (`#/store/packs`), `back()` walks it, and a refresh restores the screen.
 *
 * Each entry we create carries `{ frycards: true, idx }` in `history.state`.
 * `idx > 0` means "the entry before this one is also ours", which is what lets
 * a sub-screen's BACK mean "where I came from" without ever navigating the
 * player out of the app when they arrived on a deep link (idx 0 -> fall back
 * to the menu instead).
 */

interface HistoryMark {
  frycards: true;
  idx: number;
}

const markOf = (state: unknown): HistoryMark | null => {
  const s = state as Partial<HistoryMark> | null;
  return s && s.frycards === true && typeof s.idx === 'number' ? (s as HistoryMark) : null;
};
const idxOf = () => markOf(window.history.state)?.idx ?? 0;
const MENU: Route = { screen: 'menu', sub: [] };

export interface RouterApi {
  /** The route being shown (already resolved against the access rules). */
  route: Route;
  navigate: (screen: MetaScreen, sub?: string[], opts?: { replace?: boolean }) => void;
  /** Browser-style back; `fallback` is used when there is no earlier in-app entry. */
  back: (fallback?: MetaScreen) => void;
  /** Rewrite the sub-path of the CURRENT screen without adding a history entry. */
  setSub: (screen: MetaScreen, sub: string[]) => void;
}

const RouterContext = createContext<RouterApi | null>(null);
export const RouterProvider = RouterContext.Provider;
/** `null` outside the app shell (tests, the preview harness) — callers degrade. */
export const useRouter = (): RouterApi | null => useContext(RouterContext);

export function useHashRouter({
  resolve,
  initial,
  lock = false,
  onBlockedBack,
}: {
  /** Maps the requested route to the one the viewer may see (auth / guest / CPU lock). */
  resolve: (route: Route) => Route;
  /** Route used when the address has no hash yet (e.g. the first-run How to Play). */
  initial: Route;
  /** While true (a match is mounted) back/forward are undone: a game can't be
   * re-entered from the URL, so it must not be walked away from by accident. */
  lock?: boolean;
  onBlockedBack?: () => void;
}): RouterApi {
  const [raw, setRaw] = useState<Route>(() => parseHash(window.location.hash) ?? initial);
  const rawRef = useRef(raw);
  const commit = useCallback((next: Route) => {
    rawRef.current = next;
    setRaw((prev) => (routesEqual(prev, next) ? prev : next));
  }, []);

  // Stamp our own index on the entry we booted on, and write the first-run
  // route into the address bar so a refresh keeps it.
  useEffect(() => {
    const mark = markOf(window.history.state);
    const hasHash = parseHash(window.location.hash) !== null;
    if (!mark || !hasHash) {
      window.history.replaceState(
        { frycards: true, idx: mark?.idx ?? 0 } satisfies HistoryMark,
        '',
        hasHash ? window.location.hash : serializeRoute(initial),
      );
    }
    // Boot-only: `initial` is read once, on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lockRef = useRef<{ idx: number; hash: string } | null>(null);
  useEffect(() => {
    lockRef.current = lock ? { idx: idxOf(), hash: window.location.hash } : null;
  }, [lock]);
  const onBlockedRef = useRef(onBlockedBack);
  useEffect(() => {
    onBlockedRef.current = onBlockedBack;
  }, [onBlockedBack]);

  useEffect(() => {
    let ignoreNext: number | undefined;
    let lastBlockedHref = '';
    const onChange = () => {
      if (ignoreNext !== undefined) {
        window.clearTimeout(ignoreNext);
        ignoreNext = undefined;
        return;
      }
      const lk = lockRef.current;
      if (lk) {
        // One back press fires popstate AND hashchange, and the undo below
        // fires them again: only react (and report) when there is something
        // to undo.
        const mark = markOf(window.history.state);
        if (mark && mark.idx !== lk.idx) {
          // Step straight back to the entry the match started on. Pushing
          // instead would grow the stack on every press. The flag is cleared by
          // the resulting popstate, or by a timer if the browser had nowhere to go.
          ignoreNext = window.setTimeout(() => (ignoreNext = undefined), 500);
          window.history.go(lk.idx - mark.idx);
        } else if (window.location.hash !== lk.hash) {
          window.history.replaceState(
            { frycards: true, idx: lk.idx } satisfies HistoryMark,
            '',
            lk.hash,
          );
        } else {
          return;
        }
        if (window.location.href !== lastBlockedHref) onBlockedRef.current?.();
        lastBlockedHref = window.location.href;
        return;
      }
      lastBlockedHref = '';
      commit(parseHash(window.location.hash) ?? MENU);
    };
    window.addEventListener('popstate', onChange);
    window.addEventListener('hashchange', onChange);
    return () => {
      window.removeEventListener('popstate', onChange);
      window.removeEventListener('hashchange', onChange);
      window.clearTimeout(ignoreNext);
    };
  }, [commit]);

  const navigate = useCallback<RouterApi['navigate']>(
    (screen, sub = [], opts) => {
      const next: Route = { screen, sub };
      const hash = serializeRoute(next);
      if (window.location.hash === hash) {
        commit(next);
        return;
      }
      const idx = idxOf();
      if (opts?.replace) {
        window.history.replaceState({ frycards: true, idx } satisfies HistoryMark, '', hash);
      } else {
        window.history.pushState({ frycards: true, idx: idx + 1 } satisfies HistoryMark, '', hash);
      }
      commit(next);
    },
    [commit],
  );

  const back = useCallback<RouterApi['back']>(
    (fallback = 'menu') => {
      // A deliberate exit (e.g. leaving a finished match), not a stray back press.
      lockRef.current = null;
      if (idxOf() > 0) window.history.back();
      else navigate(fallback, [], { replace: true });
    },
    [navigate],
  );

  const setSub = useCallback<RouterApi['setSub']>(
    (screen, sub) => {
      if (rawRef.current.screen !== screen) return;
      const next: Route = { screen, sub };
      if (routesEqual(rawRef.current, next)) return;
      window.history.replaceState(
        { frycards: true, idx: idxOf() } satisfies HistoryMark,
        '',
        serializeRoute(next),
      );
      commit(next);
    },
    [commit],
  );

  const route = resolve(raw);
  const effHash = serializeRoute(route);
  const rawHash = serializeRoute(raw);
  // A locked or unauthorised link is shown as the menu AND rewritten to it, so
  // the address bar never advertises a screen the viewer isn't on.
  useEffect(() => {
    if (effHash !== rawHash && window.location.hash === rawHash) {
      window.history.replaceState(window.history.state, '', effHash);
    }
  }, [effHash, rawHash]);

  return useMemo(
    () => ({ route, navigate, back, setSub }),
    // `route` is a fresh object each render; its serialised form is the identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [effHash, navigate, back, setSub],
  );
}

/**
 * Remembered tab for a screen (QOL: "a back stack that remembers each
 * screen's tab"). Precedence: the URL (`#/store/packs` — linkable) > the last
 * tab this viewer used on the screen (localStorage) > `initial`. Picking a tab
 * updates both, without adding history entries. Works without a router.
 */
export function useRouteTab<T extends string>(
  screen: MetaScreen,
  tabs: readonly T[],
  initial: T,
  /** localStorage key for the remembered tab (defaults to `tab:<screen>`). */
  storageKey: string = `tab:${screen}`,
): [T, (tab: T) => void] {
  const router = useRouter();
  const [stored, setStored] = usePersistedState<T>(
    storageKey,
    initial,
    (v): v is T => typeof v === 'string' && (tabs as readonly string[]).includes(v),
  );
  const fromUrl =
    router && router.route.screen === screen ? (router.route.sub[0] as T | undefined) : undefined;
  const value = fromUrl && tabs.includes(fromUrl) ? fromUrl : stored;
  const setSub = router?.setSub;
  const set = useCallback(
    (tab: T) => {
      setStored(tab);
      setSub?.(screen, [tab]);
    },
    [setStored, setSub, screen],
  );
  return [value, set];
}
