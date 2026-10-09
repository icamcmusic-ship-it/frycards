/**
 * Pure routing helpers for the hash router (`#/store`, `#/store/packs`, …).
 *
 * Kept free of React and `window` so the parse/serialize/guard rules can be
 * unit-tested; `useHashRouter.tsx` wires them to the History API.
 *
 * A route is a screen plus optional sub-path segments (a tab, a filter). An
 * in-progress match is deliberately NOT a route: a hash can never put the
 * player back into a game, because the game state lives only in memory.
 */

export const META_SCREENS = [
  'menu',
  'play',
  'collection',
  'decks',
  'store',
  'battlepass',
  'achievements',
  'social',
  'market',
  'shops',
  'grading',
  'showroom',
  'profile',
  'history',
  'settings',
  'changelog',
  'news',
  'submissions',
  'howtoplay',
] as const;

export type MetaScreen = (typeof META_SCREENS)[number];

export interface Route {
  screen: MetaScreen;
  /** Extra path segments after the screen, e.g. `['packs']` for `#/store/packs`. */
  sub: string[];
}

/** Screens that read a signed-in player's private data — a guest has none. */
export const ACCOUNT_ONLY_SCREENS: ReadonlySet<MetaScreen> = new Set<MetaScreen>([
  'collection',
  'decks',
  'store',
  'battlepass',
  'achievements',
  'market',
  'shops',
  'grading',
  'profile',
]);

const isScreen = (s: string): s is MetaScreen => (META_SCREENS as readonly string[]).includes(s);

/** `#/store/packs` -> `{ screen: 'store', sub: ['packs'] }`. Anything that is not
 * a known screen (empty hash, an anchor, junk) is `null`, never a guess. */
export function parseHash(hash: string): Route | null {
  const raw = hash.replace(/^#/, '');
  if (!raw.startsWith('/')) return null;
  const [path] = raw.split('?');
  const segments = path
    .split('/')
    .filter(Boolean)
    .map((s) => {
      try {
        return decodeURIComponent(s);
      } catch {
        return s;
      }
    });
  const [screen, ...sub] = segments;
  if (!screen || !isScreen(screen)) return null;
  return { screen, sub };
}

export function serializeRoute(route: Route): string {
  return `#/${[route.screen, ...route.sub].map(encodeURIComponent).join('/')}`;
}

export interface RouteAccess {
  guest: boolean;
  /** CPU play is locked for this account (see `isCpuLocked`). */
  cpuLocked: boolean;
}

/** Whether the viewer may open a screen. The same rules the menu applies to its
 * tiles — enforced here too so a pasted link or a stale refresh can't skip them. */
export function canEnterScreen(screen: MetaScreen, access: RouteAccess): boolean {
  if (access.guest && ACCOUNT_ONLY_SCREENS.has(screen)) return false;
  if (screen === 'play' && access.cpuLocked) return false;
  return true;
}

/** The route the viewer actually gets: the requested one, or the menu when it is locked. */
export function resolveRoute(route: Route, access: RouteAccess): Route {
  return canEnterScreen(route.screen, access) ? route : { screen: 'menu', sub: [] };
}

export const routesEqual = (a: Route, b: Route): boolean => serializeRoute(a) === serializeRoute(b);
