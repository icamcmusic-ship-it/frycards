/**
 * One loader per lazy route chunk, shared by App's `React.lazy` declarations
 * and `preloadScreen`, so warming a screen and rendering it fetch the same
 * module (the browser and the bundler both cache a dynamic import, so a second
 * call costs nothing).
 *
 * Preloading is what keeps navigation from flashing the LOADING fallback: the
 * menu warms a tile's chunk on hover/focus/touch, and a few likely next
 * screens on idle once the menu has painted.
 */
import type { MetaScreen } from './routes';

export const SCREEN_LOADERS = {
  match: () => import('../components/PokerMatch'),
  play: () => import('./PlayScreen'),
  howtoplay: () => import('../components/HowToPlay'),
  store: () => import('./StoreScreen'),
  battlepass: () => import('./BattlePassScreen'),
  achievements: () => import('./AchievementsScreen'),
  social: () => import('./SocialScreen'),
  market: () => import('./MarketplaceScreen'),
  shops: () => import('./PlayerShopsScreen'),
  collection: () => import('./CollectionScreen'),
  grading: () => import('./GradingScreen'),
  showroom: () => import('./ShowroomScreen'),
  decks: () => import('./DeckBuilderScreen'),
  history: () => import('./MatchHistoryScreen'),
  profile: () => import('./ProfileScreen'),
  settings: () => import('./SettingsScreen'),
  changelog: () => import('./ChangelogScreen'),
  news: () => import('./NewsCenterScreen'),
  submissions: () => import('./CardSubmissionsScreen'),
} satisfies Partial<Record<MetaScreen | 'match', () => Promise<unknown>>>;

type ChunkKey = keyof typeof SCREEN_LOADERS;
const warmed = new Set<string>();

/** Start fetching a screen's chunk. Safe to call repeatedly; a failed fetch
 * (offline) is swallowed here and retried by the real navigation. */
export function preloadScreen(screen: MetaScreen | 'match'): void {
  if (warmed.has(screen) || !(screen in SCREEN_LOADERS)) return;
  warmed.add(screen);
  SCREEN_LOADERS[screen as ChunkKey]().catch(() => warmed.delete(screen));
}

/** Warm several screens one at a time when the browser is idle, so the
 * prefetch never competes with first paint or with a click. */
export function preloadWhenIdle(screens: readonly (MetaScreen | 'match')[]): () => void {
  let cancelled = false;
  let handle: number | undefined;
  const queue = [...screens];
  const ric: (cb: () => void) => number =
    typeof window !== 'undefined' && 'requestIdleCallback' in window
      ? (cb) => window.requestIdleCallback(cb, { timeout: 4000 })
      : (cb) => window.setTimeout(cb, 1500);
  const cic = (h: number) => {
    if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(h);
    else clearTimeout(h);
  };
  const next = () => {
    if (cancelled) return;
    const s = queue.shift();
    if (!s) return;
    preloadScreen(s);
    handle = ric(next);
  };
  if (typeof window === 'undefined') return () => {};
  handle = ric(next);
  return () => {
    cancelled = true;
    if (handle !== undefined) cic(handle);
  };
}
