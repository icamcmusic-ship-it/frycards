import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchCardTemplates,
  recordMatchResult,
  beginMatch,
  MatchResult,
  MatchResultStatus,
} from './lib/supabase';
import { buildDeck, deckDefFromCustom, randomArchetype } from './game/v3/decks';
import { DeckDef, mulberry32 } from './game/v3/engine';
import { POOL_BY_ID, applyCardPool } from './game/v3/cardpool';
import { newMatchSeed, withTimeout } from './lib/utils';
import { readCache, writeCache } from './lib/cache';
import { DECK_LINK_PARAM, deckCodeFromSearch, stashPendingDeck } from './meta/deckcode';
import { DeckLinkPreview } from './meta/DeckLinkPreview';
import type { CardTemplate } from './types';
import { LEADER_HP } from './game/v3/cards';
import { DeckRow } from './lib/supabase';
import { MetaProvider, useMeta } from './meta/MetaContext';
import { AuthScreen } from './meta/AuthScreen';
import { MainMenu } from './meta/MainMenu';
import { MetaScreen, Route, resolveRoute } from './meta/routes';
import { RouterProvider, useHashRouter } from './meta/useHashRouter';
import { isCpuLocked } from './meta/cpuAccess';
import { ToastProvider, useToast } from './meta/toast';
import { CurrencyBar, CurrencyToasts } from './meta/CurrencyBar';
import { PoolOfflineBanner } from './meta/PoolOfflineBanner';
import type { ShowroomSubject } from './meta/ShowroomScreen';
import { PopButton } from './meta/ui';
import { SafeImage } from './meta/SafeImage';
import { setCardBackImage } from './meta/cardback';
import { useTheme } from './meta/useTheme';
import { useMotionMode } from './meta/useMotionMode';
import { SLAB_CSS } from './meta/slabCss';
import { ConfirmHost } from './meta/confirm';
const MotionRoot = React.lazy(() => import('./meta/MotionRoot'));
import type { MotionMode } from './meta/matchPrefs';

const CATALOG_CACHE_KEY = 'catalog';
/** How long a fetched card catalog is reused before the next visit re-fetches
 * it. Cards approved in between show up within this window. */
const CATALOG_TTL_MS = 6 * 60 * 60 * 1000;

/** One reward round-trip gets this long before it counts as a failed attempt. */
const RECORD_ATTEMPT_MS = 20_000;

const NO_REWARD_REASON: Record<MatchResultStatus, string> = {
  too_early: 'No reward: the match ended too quickly to count.',
  expired: 'No reward: this match was started too long ago to count.',
  duplicate: 'This match was already recorded — check your credits.',
  invalid: 'No reward for this match (it was not recognised by the server).',
  capped: "No reward: you've reached today's payout limit. It resets within 24 hours.",
};

/**
 * Route-level code splitting (finding 2.1).
 *
 * Everything below used to be a static import, so all 17 screens — plus the
 * 5,800-line board, the 3D showroom and the 3,200-line Player Shops screen —
 * were downloaded and parsed before the LOGIN screen could paint, in a single
 * 1.33 MB bundle. None of the existing harnesses could see it: they measure
 * geometry, not time. Each of these is now its own chunk, fetched when the
 * player actually navigates to it.
 *
 * Eager on purpose: MainMenu and AuthScreen (the first thing every session
 * renders), and the small shared UI in `./meta/ui`.
 */
const GameV4 = React.lazy(() => import('./components/GameV4').then((m) => ({ default: m.GameV4 })));
const HowToPlayScreen = React.lazy(() =>
  import('./components/HowToPlay').then((m) => ({ default: m.HowToPlayScreen })),
);
const StoreScreen = React.lazy(() =>
  import('./meta/StoreScreen').then((m) => ({ default: m.StoreScreen })),
);
const BattlePassScreen = React.lazy(() =>
  import('./meta/BattlePassScreen').then((m) => ({ default: m.BattlePassScreen })),
);
const AchievementsScreen = React.lazy(() =>
  import('./meta/AchievementsScreen').then((m) => ({ default: m.AchievementsScreen })),
);
const SocialScreen = React.lazy(() =>
  import('./meta/SocialScreen').then((m) => ({ default: m.SocialScreen })),
);
const MarketplaceScreen = React.lazy(() =>
  import('./meta/MarketplaceScreen').then((m) => ({ default: m.MarketplaceScreen })),
);
const PlayerShopsScreen = React.lazy(() =>
  import('./meta/PlayerShopsScreen').then((m) => ({ default: m.PlayerShopsScreen })),
);
const CollectionScreen = React.lazy(() =>
  import('./meta/CollectionScreen').then((m) => ({ default: m.CollectionScreen })),
);
const GradingScreen = React.lazy(() =>
  import('./meta/GradingScreen').then((m) => ({ default: m.GradingScreen })),
);
const ShowroomScreen = React.lazy(() =>
  import('./meta/ShowroomScreen').then((m) => ({ default: m.ShowroomScreen })),
);
const DeckBuilderScreen = React.lazy(() =>
  import('./meta/DeckBuilderScreen').then((m) => ({ default: m.DeckBuilderScreen })),
);
const MatchHistoryScreen = React.lazy(() =>
  import('./meta/MatchHistoryScreen').then((m) => ({ default: m.MatchHistoryScreen })),
);
const ProfileScreen = React.lazy(() =>
  import('./meta/ProfileScreen').then((m) => ({ default: m.ProfileScreen })),
);
const SettingsScreen = React.lazy(() =>
  import('./meta/SettingsScreen').then((m) => ({ default: m.SettingsScreen })),
);
const ChangelogScreen = React.lazy(() =>
  import('./meta/ChangelogScreen').then((m) => ({ default: m.ChangelogScreen })),
);
const NewsCenterScreen = React.lazy(() =>
  import('./meta/NewsCenterScreen').then((m) => ({ default: m.NewsCenterScreen })),
);
const CardSubmissionsScreen = React.lazy(() =>
  import('./meta/CardSubmissionsScreen').then((m) => ({ default: m.CardSubmissionsScreen })),
);

/** Shown while a route chunk is in flight. Deliberately the same shape as the
 * boot splash so a slow connection reads as loading, not as a broken screen. */
function ScreenFallback() {
  return (
    <div
      className="w-full min-h-screen bg-[var(--c-ink)] flex items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <div className="bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-xl px-5 py-2.5 ink-border-md shadow-hard-yellow animate-pulse">
        LOADING…
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Error boundary — a render crash anywhere below used to white-screen the
// whole app with no way back short of a manual reload.
// ---------------------------------------------------------------------------
class ErrorBoundary extends React.Component {
  declare props: { children: React.ReactNode };
  state = { crashed: false };

  static getDerivedStateFromError() {
    return { crashed: true };
  }

  render() {
    if (!this.state.crashed) return this.props.children;
    return (
      <div className="w-full h-screen bg-[var(--c-ink)] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-2xl px-6 py-3 ink-border-md shadow-hard-yellow">
          FRY CARDS
        </div>
        <p className="text-[var(--c-paper)] font-bold text-sm max-w-xs">
          Something broke. Your collection and progress are safe.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="btn-pop heading-font text-sm px-5 py-2 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs"
        >
          BACK TO MENU
        </button>
      </div>
    );
  }
}

// ---------------------------------------------------------------------------
// Play setup — a freshly-rolled random deck, or one of the player's own
// saved decks
// ---------------------------------------------------------------------------
type MatchSetup = { kind: 'custom'; deck: DeckRow } | { kind: 'random' };

function PlayScreen({
  onStart,
  onBack,
  practice = false,
}: {
  onStart: (setup: MatchSetup) => void;
  onBack: () => void;
  /** Arrived from a How to Play "Try it": point at the quick match, which opens
   * with the first-match coach. */
  practice?: boolean;
}) {
  const { decks, guest, dataLoading } = useMeta();
  const legalDecks = decks.filter((d) => d.is_valid);

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <div className="sticky top-0 z-30 flex flex-wrap items-center gap-x-3 gap-y-1 bg-[var(--c-ink)] px-4 py-2.5">
        <PopButton onClick={onBack} color="yellow">
          &lt; MENU
        </PopButton>
        {/* Guests can't choose anything — the random deck is their only
            option, so "CHOOSE YOUR DECK" would be a lie. */}
        <h1 className="heading-font text-xl text-[var(--c-yellow)]">
          {guest ? 'QUICK MATCH' : 'CHOOSE YOUR DECK'}
        </h1>
        <span className="fs-xs font-bold text-[var(--c-paper)]/60 hidden md:inline">
          Fry Cards rules v6.0 · 60-card decks · start at {LEADER_HP} Vitality
        </span>
        <CurrencyBar className="ml-auto" />
      </div>
      <div className="p-6 max-w-6xl mx-auto">
        {practice && (
          <p className="ink-border-sm bg-[var(--c-yellow)] text-[var(--c-ink)] fs-sm font-bold px-3 py-2 mb-4 max-w-xl">
            Practice mode: start a match and the coach walks you through your first turn, step by
            step. Skip it any time.
          </p>
        )}
        {/* Random-deck quick match — the only way to play as a guest, and a
            no-setup fallback for account holders without a legal deck yet.
            This path existed per the changelog ("playing without a saved deck
            or as a guest rolls a freshly randomized legal deck") but the
            screen had regressed into a dead end: guests got a "can't play"
            message despite the enabled PLAY tile, and a new account with no
            legal decks had no way to start a match at all. */}
        <h2 className="heading-font text-base mb-3 bg-[var(--c-ink)] text-[var(--c-yellow)] inline-block px-2 py-0.5">
          QUICK MATCH
        </h2>
        <div className="mb-8">
          <button
            onClick={() => onStart({ kind: 'random' })}
            className="btn-pop px-5 py-3 bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-sm ink-border-md shadow-hard-black hover:-translate-y-1 transition-all"
          >
            RANDOM DECK ▸
          </button>
          <p className="fs-xs font-bold text-[var(--c-steel)] mt-2">
            Rolls a freshly randomized legal deck — no collection needed. The CPU does the same.
          </p>
        </div>
        {guest ? (
          <p className="fs-xs font-bold text-[var(--c-steel)]">
            Create an account to build and save your own decks in the Deck Builder (60+ cards, max 4
            copies each).
          </p>
        ) : (
          <>
            <h2 className="heading-font text-base mb-3 bg-[var(--c-steel)] text-[var(--c-paper)] inline-block px-2 py-0.5">
              YOUR DECKS
            </h2>
            {dataLoading ? (
              <p className="fs-xs font-bold text-[var(--c-steel)] mb-8 animate-pulse">
                Loading your decks…
              </p>
            ) : legalDecks.length === 0 ? (
              <p className="fs-xs font-bold text-[var(--c-steel)] mb-8">
                No legal decks yet — build one in the Deck Builder (60+ cards, max 4 copies each).
              </p>
            ) : (
              <div className="flex flex-wrap gap-4 mb-8">
                {legalDecks.map((d) => {
                  const leader = POOL_BY_ID[d.leader_id];
                  // A deck naming a card this session's pool lacks (the catalog
                  // fetch failed and the bundled pool is older) would throw in
                  // createGame, so it is not offered until the pool loads.
                  const missing = [d.leader_id, ...d.card_ids].filter((id) => !POOL_BY_ID[id]);
                  return (
                    <button
                      key={d.id}
                      onClick={() => onStart({ kind: 'custom', deck: d })}
                      disabled={missing.length > 0}
                      title={
                        missing.length > 0
                          ? `${missing.length} card(s) in this deck aren't loaded — reload the card database`
                          : undefined
                      }
                      className="btn-pop w-56 overflow-hidden bg-[var(--c-paper)] ink-border-md shadow-hard-black hover:-translate-y-1 transition-all text-left disabled:opacity-50 disabled:hover:translate-y-0 disabled:cursor-not-allowed"
                    >
                      <div className="px-2 py-1 bg-[var(--c-steel)] heading-font fs-xs text-[var(--c-paper)] truncate">
                        {d.name}
                      </div>
                      <div className="ink-border-sm m-1.5 overflow-hidden aspect-[16/8]">
                        <SafeImage
                          src={leader?.image}
                          boxWidth={224}
                          className="w-full h-full object-cover"
                          fallbackText={leader?.name}
                        />
                      </div>
                      <div className="p-3 pt-1">
                        <div className="heading-font text-sm leading-tight">{leader?.name}</div>
                        <div className="fs-xs font-bold text-[var(--c-steel)] mt-0.5">
                          {d.card_ids.length} cards
                        </div>
                        {missing.length > 0 && (
                          <div className="fs-xs font-bold text-[var(--c-red)] mt-0.5">
                            {missing.length} card(s) not loaded — reload the card database
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function setupToDeck(setup: MatchSetup, matchSeed: number): { deck: DeckDef; label: string } {
  if (setup.kind === 'random') {
    // Rolled from the match seed, so the seed shown on the game-over screen and
    // stored in match history reproduces the decks as well as the shuffles.
    const arch = randomArchetype(mulberry32(matchSeed * 7919 + 1));
    return { deck: buildDeck(arch), label: arch.label };
  }
  return {
    deck: deckDefFromCustom(setup.deck.leader_id, setup.deck.card_ids, setup.deck.name),
    label: setup.deck.name,
  };
}

// ---------------------------------------------------------------------------
// Game (mounted per match)
// ---------------------------------------------------------------------------
// Exported for the regression test only.
export function Game({
  setup,
  onExit,
  onRematch,
}: {
  setup: MatchSetup;
  onExit: () => void;
  onRematch: () => void;
}) {
  const { session, profile, refreshProfile } = useMeta();
  const { toast } = useToast();
  // useState initializer, not a plain call: for a random setup, calling
  // setupToDeck on every render would silently re-roll the human's deck
  // whenever this component re-renders (e.g. the reward state updating at
  // game end). One roll per mount — the gameKey remount rolls a fresh one.
  const [matchSeed] = useState(newMatchSeed);
  const [human] = useState(() => setupToDeck(setup, matchSeed));
  // CPU plays a freshly randomized deck every match rather than one of the
  // fixed archetype presets — keeps every match legal even when the human's
  // own custom deck is still a work in progress.
  const [cpuArch] = useState(() => randomArchetype(mulberry32(matchSeed * 104729 + 2)));
  // Same initializer rule as the human deck above: buildDeck is random, so
  // calling it inline in the JSX re-rolled the CPU's deck on every render.
  const [cpuDeck] = useState(() => buildDeck(cpuArch));
  const [reward, setReward] = useState<MatchResult | null>(null);
  const [rewardError, setRewardError] = useState<string | null>(null);
  // While recordMatchResult() is in flight (including its retries), both
  // reward and rewardError stay null — indistinguishable from the guest
  // case (session-less players never get a reward at all), so the game-over
  // screen showed nothing at all during a real fetch. This flag lets it
  // show a "calculating…" placeholder instead of a blank gap.
  const [rewardPending, setRewardPending] = useState(false);

  // One SERVER-MINTED ticket per mounted match, requested as the match starts.
  // Retries reuse it, so the server still tells "same match, reply got lost"
  // from a genuinely new match — but it is now the server that decides a match
  // happened at all, rather than the client naming one. See `beginMatch`.
  const matchIdRef = useRef<string | null>(null);
  // Keyed on the user id, not the session object: supabase-js emits SIGNED_IN
  // on every tab refocus and TOKEN_REFRESHED hourly, each with a fresh session
  // object, and re-minting mid-match replaced the ticket (or, on a failed
  // mint, overwrote it with null).
  const ticketUserId = session?.user?.id;
  useEffect(() => {
    if (!ticketUserId) return; // guests never earn a reward, so never mint a ticket
    let cancelled = false;
    let timer: number | undefined;
    const mint = (retriesLeft: number) => {
      beginMatch().then(({ matchId, error }) => {
        if (cancelled) return;
        if (matchId) {
          matchIdRef.current = matchId;
        } else if (retriesLeft > 0) {
          // Never clobber a good ticket with null; just try again shortly.
          timer = window.setTimeout(() => mint(retriesLeft - 1), 5000);
        } else if (error) {
          console.error('beginMatch failed:', error);
        }
      });
    };
    mint(3);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [ticketUserId]);

  // recordMatchResult used to return bare `null` on both "no reward data"
  // and an outright RPC failure, so a transient network/server error meant
  // the player's win/loss, credits and XP were silently dropped with zero
  // feedback and no retry. Retry a couple of times before giving up and
  // telling the player their reward didn't sync, instead of staying silent.
  const onResult = async (won: boolean) => {
    if (!session) return;
    setRewardPending(true);
    try {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise((r) => setTimeout(r, 1500));
        // Bounded: a request that stalls instead of failing would otherwise
        // hold rewardPending (and with it REMATCH / BACK TO MENU) forever.
        const { data, error, status } = await withTimeout(
          recordMatchResult(won, matchIdRef.current ?? undefined),
          RECORD_ATTEMPT_MS,
          { data: null, error: 'timed out', status: null },
        );
        if (status) {
          setRewardError(NO_REWARD_REASON[status]);
          return;
        }
        if (data) {
          setReward(data);
          // Fire-and-forget with an explicit catch: a rejected refresh here
          // must not surface as an unhandled rejection — the realtime profile
          // subscription catches the wallet up anyway.
          refreshProfile().catch(() => {});
          return;
        }
        if (!error) {
          // An older server answers a bare null for every unpayable ticket.
          // After a retry it usually means the first attempt landed.
          setRewardError(
            attempt > 0
              ? 'This match may already have been recorded — check your credits.'
              : NO_REWARD_REASON.invalid,
          );
          return;
        }
      }
      setRewardError(
        "Couldn't record this match's result — check your connection and try again from the menu.",
      );
    } catch {
      // A thrown rejection here used to escape as an unhandled promise
      // rejection: rewardPending cleared, rewardError never set, and the
      // game-over screen showed neither a reward nor an error.
      setRewardError(
        "Couldn't record this match's result — check your connection and try again from the menu.",
      );
    } finally {
      setRewardPending(false);
    }
  };

  // M8: leaving while the result is still being recorded is not allowed. A
  // REMATCH mints a new ticket, and begin_match deletes the player's unredeemed
  // one — which is exactly the ticket this retry loop is still trying to cash.
  // Leaving to the menu and starting a match from there would do the same.
  const whenSaved = (action: () => void) => () => {
    if (rewardPending) {
      toast('Saving your reward… one moment.');
      return;
    }
    action();
  };

  return (
    <div className="relative w-full h-screen supports-[height:100dvh]:h-dvh">
      {rewardPending && (
        <div
          role="status"
          className="absolute top-2 left-1/2 -translate-x-1/2 z-[80] bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs px-3 py-1 heading-font fs-sm animate-pulse"
        >
          Saving your reward…
        </div>
      )}
      <GameV4
        seed={matchSeed}
        humanDeck={human.deck}
        cpuDeck={cpuDeck}
        humanLabel={human.label}
        cpuLabel={cpuArch.label}
        playerName={profile?.username || 'Player 1'}
        onExit={whenSaved(onExit)}
        onRematch={whenSaved(onRematch)}
        onResult={onResult}
        reward={reward}
        rewardError={rewardError}
        rewardPending={rewardPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// App shell
/**
 * Boot splash. The bootstrap allows each network call up to 20 seconds before
 * it gives up and shows the retry screen, so on a slow or flaky connection
 * the player can sit in front of a bare pulsing logo for twenty seconds with
 * no indication that anything is happening or wrong. This keeps the same
 * splash but starts explaining itself after a few seconds, and offers a
 * manual retry rather than making the player wait out the full deadline.
 */
function BootSplash({ onRetry }: { onRetry: () => void }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setElapsed((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  // Reset the clock when the player retries — otherwise the splash keeps
  // saying "still connecting — your network looks slow" (with the RETRY
  // button still up) the instant after they clicked it, as if nothing
  // happened.
  const retry = () => {
    setElapsed(0);
    onRetry();
  };
  return (
    <div className="w-full h-screen bg-[var(--c-ink)] flex flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-2xl px-6 py-3 ink-border-md shadow-hard-yellow animate-pulse">
        FRY CARDS
      </div>
      {elapsed >= 4 && (
        <p
          className="text-[var(--c-paper)]/80 font-bold text-xs max-w-xs"
          role="status"
          aria-live="polite"
        >
          {elapsed >= 10
            ? 'Still connecting — your network looks slow right now.'
            : 'Connecting to the server…'}
        </p>
      )}
      {elapsed >= 10 && (
        <button
          onClick={retry}
          className="btn-pop heading-font text-xs px-4 py-1.5 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs"
        >
          RETRY NOW
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
const MENU_ROUTE: Route = { screen: 'menu', sub: [] };
const HOWTO_ROUTE: Route = { screen: 'howtoplay', sub: [] };

function hasSeenHelp(): boolean {
  try {
    return localStorage.getItem('frycards_seen_howtoplay') === '1';
  } catch {
    return false;
  }
}

function AppInner({
  motionMode,
  changeMotionMode,
  onMatchChange,
}: {
  motionMode: MotionMode;
  changeMotionMode: (m: MotionMode) => void;
  /** Reports whether a match is mounted, so the shell can hold back anything
   * that must not happen under a live game (the card-pool RETRY). */
  onMatchChange: (mounted: boolean) => void;
}) {
  const { session, guest, loading, bootError, retryBoot, profile, shopItems, dataLoading } =
    useMeta();
  const { currentTheme, changeTheme, loaded: themeLoaded } = useTheme();
  const { toast } = useToast();
  const [match, setMatchState] = useState<MatchSetup | null>(null);
  const setMatch = (m: MatchSetup | null) => {
    setMatchState(m);
    onMatchChange(m !== null);
  };

  // Screens are real history entries (#/store/packs): browser / Android back
  // walks them, a refresh restores the screen and screens can be linked. The
  // access rules the menu applies to its tiles are enforced on the route as
  // well, so a pasted or stale link cannot skip them. A match is never a
  // route — it lives in `match` below and a hash cannot re-enter one.
  const cpuLocked = isCpuLocked(profile, guest);
  // Rules can only be judged once we know who is looking: before sign-in, and
  // until a signed-in player's profile (role) has arrived, a link is kept as is
  // instead of being bounced to the menu and losing the deep link.
  const rulesKnown =
    !loading && !bootError && (!!guest || (!!session && !dataLoading && !!profile));
  const router = useHashRouter({
    resolve: (r) => (rulesKnown ? resolveRoute(r, { guest, cpuLocked }) : r),
    // First-ever visit auto-opens the How to Play page — previously this was
    // 100% opt-in (only reachable via the Main Menu button), so a new player
    // could start a real match having never seen the turn structure.
    initial: hasSeenHelp() ? MENU_ROUTE : HOWTO_ROUTE,
    lock: match !== null,
    onBlockedBack: () => toast('A match is running — use CONCEDE to leave it.'),
  });
  const { route } = router;
  const screen: MetaScreen = route.screen;
  const go = router.navigate;
  const back = () => router.back('menu');

  // What the 3D Showroom opens on when it is reached from a deep link (the
  // Collection inspector's VIEW IN 3D, a slab in the Grading Lab vault)
  // rather than from the menu tile. Dropped as soon as the player is anywhere
  // else — including via the browser back button, which no onBack sees — so a
  // later visit from the menu does not silently reopen the last deep-linked card.
  const [showroomSubject, setShowroomSubject] = useState<ShowroomSubject | null>(null);
  const [lastScreen, setLastScreen] = useState(screen);
  if (lastScreen !== screen) {
    setLastScreen(screen);
    if (screen !== 'showroom' && showroomSubject) setShowroomSubject(null);
  }
  const openShowroom = (subject: ShowroomSubject) => {
    setShowroomSubject(subject);
    go('showroom');
  };

  const [gameKey, setGameKey] = useState(0);
  const markHelpSeen = () => {
    try {
      localStorage.setItem('frycards_seen_howtoplay', '1');
    } catch {
      // localStorage unavailable — the page will just auto-open again next visit.
    }
  };

  // Keep the equipped card back applied to in-game face-down cards.
  useEffect(() => {
    const cardBack = shopItems.find((s) => s.id === profile?.equipped_card_back);
    setCardBackImage(cardBack?.image_url || null);
  }, [profile?.equipped_card_back, shopItems]);

  // A shared `?deck=FRY1:…` link opens a read-only preview on top of whatever
  // screen the player is on (signed in, guest, or the sign-in screen). Cleared
  // from the address bar on close so a refresh does not reopen it.
  const [linkedDeck, setLinkedDeck] = useState<string | null>(() =>
    deckCodeFromSearch(window.location.search),
  );
  const closeLinkedDeck = () => {
    setLinkedDeck(null);
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete(DECK_LINK_PARAM);
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    } catch {
      /* the address bar keeps the parameter: harmless */
    }
  };

  const content = (() => {
    if (bootError) {
      return (
        <div className="w-full h-screen bg-[var(--c-ink)] flex flex-col items-center justify-center gap-4 px-6 text-center">
          <div className="bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-2xl px-6 py-3 ink-border-md shadow-hard-yellow">
            FRY CARDS
          </div>
          <p className="text-[var(--c-paper)] font-bold text-sm max-w-xs">{bootError}</p>
          <button
            onClick={retryBoot}
            className="btn-pop heading-font text-sm px-5 py-2 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs"
          >
            RETRY
          </button>
        </div>
      );
    }

    if (loading || !themeLoaded) return <BootSplash onRetry={retryBoot} />;

    if (!session && !guest) return <AuthScreen />;

    if (match) {
      return (
        <div key={gameKey} className="contents">
          <Game
            setup={match}
            onExit={() => {
              setMatch(null);
              setGameKey((k) => k + 1);
              // Back to wherever the player started the match from.
              router.back('menu');
            }}
            // Bumping the key remounts <Game>, which re-runs both deck
            // initializers: the same SETUP, a fresh roll. That is what a rematch
            // means for a random-deck quick match, and for a saved deck it is
            // the same list against a newly rolled CPU — the CPU already rerolls
            // every match, so this keeps the two consistent.
            onRematch={() => setGameKey((k) => k + 1)}
          />
        </div>
      );
    }

    switch (screen) {
      case 'play':
        // CPU battles are Creator-only for ACCOUNTS while the mode is finished
        // (the menu tile shows COMING SOON! for them) — but guests get the
        // random-deck QUICK MATCH: the Auth screen's PLAY AS GUEST button has
        // always advertised "play vs the CPU with prebuilt decks", PlayScreen
        // carries a dedicated guest branch, and gating guests on a Creator
        // role they can never hold made that whole path dead code (the
        // long-standing "guest quick match is unreachable" roadmap item).
        // The route resolver already sends a locked account to the menu; this
        // only covers the moment before the profile (role) has loaded.
        if (!rulesKnown) return <ScreenFallback />;
        return (
          <PlayScreen onStart={setMatch} onBack={back} practice={route.sub[0] === 'practice'} />
        );
      case 'store':
        return <StoreScreen onBack={back} />;
      case 'battlepass':
        return <BattlePassScreen onBack={back} />;
      case 'achievements':
        return <AchievementsScreen onBack={back} />;
      case 'social':
        return <SocialScreen onBack={back} />;
      case 'market':
        return <MarketplaceScreen onBack={back} />;
      case 'shops':
        return <PlayerShopsScreen onBack={back} />;
      case 'collection':
        return (
          <CollectionScreen
            onBack={back}
            onGrading={() => go('grading')}
            onShowroom={openShowroom}
          />
        );
      case 'grading':
        return <GradingScreen onBack={back} onShowroom={openShowroom} />;
      case 'showroom':
        return <ShowroomScreen initial={showroomSubject ?? undefined} onBack={back} />;
      case 'decks':
        return <DeckBuilderScreen onBack={back} />;
      case 'history':
        return <MatchHistoryScreen onBack={back} />;
      case 'profile':
        return <ProfileScreen onBack={back} onManageShowcase={() => go('collection')} />;
      case 'settings':
        return (
          <SettingsScreen
            currentTheme={currentTheme}
            onThemeChange={changeTheme}
            motionMode={motionMode}
            onMotionModeChange={changeMotionMode}
            onBack={back}
          />
        );
      case 'submissions':
        return <CardSubmissionsScreen onBack={back} />;
      case 'changelog':
        return <ChangelogScreen onBack={back} />;
      case 'news':
        return <NewsCenterScreen onBack={back} onOpenChangelog={() => go('changelog')} />;
      case 'howtoplay':
        return (
          <HowToPlayScreen
            onBack={() => {
              markHelpSeen();
              back();
            }}
            onNavigate={go}
          />
        );
      default:
        return <MainMenu onNavigate={go} />;
    }
  })();

  return (
    <RouterProvider value={router}>
      <CurrencyToasts />
      {content}
      {linkedDeck && !match && (
        <DeckLinkPreview
          code={linkedDeck}
          canOpenBuilder={!!session}
          onOpenBuilder={() => {
            stashPendingDeck(linkedDeck);
            closeLinkedDeck();
            go('decks');
          }}
          onClose={closeLinkedDeck}
        />
      )}
    </RouterProvider>
  );
}

export default function App() {
  // 1.8/2.4: the motion preference. The hook sets the <html data-motion>
  // attribute the CSS override keys off; the mode drives the MotionConfig
  // below, which is what makes the motion library honour any of it at all.
  const { mode: motionMode, changeMode: changeMotionMode } = useMotionMode();
  // A catalog younger than CATALOG_TTL_MS is applied straight from the cache,
  // with no request at all: every visit used to re-download the whole `cards`
  // table. A RETRY (attempt > 0) is a deliberate refresh and always fetches.
  const [poolReady, setPoolReady] = useState(() => {
    const cached = readCache<CardTemplate[]>(CATALOG_CACHE_KEY);
    return !!(cached && cached.ageMs < CATALOG_TTL_MS && applyCardPool(cached.data));
  });
  const readyAtBoot = useRef(poolReady);
  const [poolError, setPoolError] = useState<string | null>(null);
  // True when the catalog fetch failed or timed out and the session is running
  // on the bundled card set, which lags cards approved since the last sync.
  const [poolOffline, setPoolOffline] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // Whether a match is mounted (reported by AppInner). The catalog RETRY swaps
  // the shared card pool in place, so it must never run under a live game.
  const [matchMounted, setMatchMounted] = useState(false);
  const retryCatalog = useCallback(() => {
    if (matchMounted) return;
    // Dropping `poolReady` unmounts the whole screen tree (it comes back, at the
    // same hash, once the fetch settles), so the swapped pool is only ever seen
    // by a clean mount — never by a screen that was holding the old one.
    setPoolReady(false);
    setAttempt((n) => n + 1);
  }, [matchMounted]);

  // Load the universal card catalog from the Supabase backend once at
  // startup, build the v4.2 card pool from it (mechanics are assigned
  // deterministically client-side), then preload every card image so
  // nothing pops in mid-browse once the app is up. Falls back to the
  // bundled catalog if the fetch fails. preloadImages() never rejects, but
  // applyCardPool()/fetchCardTemplates() theoretically could throw on
  // malformed data — without a catch, that would strand players on this
  // screen forever with no way out, so any failure here surfaces a retry.
  useEffect(() => {
    let cancelled = false;
    if (attempt === 0 && readyAtBoot.current) return; // fresh cache already applied
    const cached = readCache<CardTemplate[]>(CATALOG_CACHE_KEY);
    // A stalled request (bad proxy, dropped connection) never rejects — it
    // just never resolves — which would otherwise strand players on this
    // screen forever with no retry button. 20s is generous enough for a
    // slow connection but bounded.
    withTimeout(fetchCardTemplates(), 20_000, null)
      .then((templates) => {
        if (cancelled) return;
        if (templates && applyCardPool(templates)) {
          // Only a catalog the pool accepted is worth caching.
          writeCache(CATALOG_CACHE_KEY, templates);
          setPoolOffline(false);
        } else if (cached && applyCardPool(cached.data)) {
          // The fetch failed but an older copy exists: it is closer to the live
          // catalog than the bundled set, so use it and still flag the failure.
          setPoolOffline(true);
        } else {
          setPoolOffline(true);
        }
        // Media loads on demand. Fetching the entire catalog here can transfer
        // over a gigabyte before a player sees a single card.
      })
      .then(() => {
        if (!cancelled) setPoolReady(true);
      })
      .catch(() => {
        if (!cancelled) setPoolError("Couldn't load the card database. Check your connection.");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // The bar used to be DETERMINATE, driven by a `progress` counter that
  // was fed by the boot-time image preload. That preload was removed when
  // media went load-on-demand, and nothing has called its setter since —
  // so `progress.total` was permanently 0, the label was permanently
  // "FETCHING CARD DATABASE…" and the bar was permanently frozen at 0%
  // for the entire splash. A progress indicator that never moves reads as
  // a hung app, which is worse than no indicator at all.
  //
  // There is only one request left to wait on (`fetchCardTemplates`) and
  // it reports no byte progress, so there is no percentage to show. The
  // bar is indeterminate now: it says "still working" honestly instead of
  // claiming 0% forever.

  return (
    <ErrorBoundary>
      {/* MetaProvider mounts immediately, in parallel with the catalog fetch:
          it only fetches (session, store data) and touches no card, so its
          requests no longer queue behind the catalog. AppInner, which does
          render cards, stays behind the gate until the pool is ready — so
          the in-place pool swap in applyCardPool is never observed by a
          mounted screen. */}
      <MetaProvider>
        {poolError ? (
          <div className="w-full h-screen bg-[var(--c-ink)] flex flex-col items-center justify-center gap-4 px-6 text-center">
            <div className="bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-2xl px-6 py-3 ink-border-md shadow-hard-yellow">
              FRY CARDS
            </div>
            <p className="text-[var(--c-paper)] font-bold text-sm max-w-xs">{poolError}</p>
            <button
              onClick={() => {
                setPoolError(null);
                setAttempt((n) => n + 1);
              }}
              className="btn-pop heading-font text-sm px-5 py-2 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs"
            >
              RETRY
            </button>
          </div>
        ) : !poolReady ? (
          <div className="w-full h-screen bg-[var(--c-ink)] flex flex-col items-center justify-center gap-4">
            <div className="bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-2xl px-6 py-3 ink-border-md shadow-hard-yellow animate-pulse">
              FRY CARDS
            </div>
            <div className="text-[var(--c-paper)] font-mono text-xs">FETCHING CARD DATABASE…</div>
            <div
              className="w-64 h-2 ink-border-sm bg-[var(--c-paper)]/10 overflow-hidden"
              role="progressbar"
              aria-label="Loading the card database"
            >
              <div className="h-full w-1/3 bg-[var(--c-yellow)] splash-indeterminate" />
            </div>
          </div>
        ) : (
          <>
            {/* One boundary above the route switch: every screen below is a
              lazy chunk, and a route transition is the only thing that can
              suspend here. */}
            {poolOffline && (
              <PoolOfflineBanner matchMounted={matchMounted} onRetry={retryCatalog} />
            )}
            {/* The root MotionConfig the comments above describe: without it,
                motion/react animations ignored the in-app Motion setting. */}
            {/* Slab keyframes (incl. @property --slab-angle), defined once. */}
            <style>{SLAB_CSS}</style>
            <ConfirmHost />
            <ToastProvider>
              <React.Suspense fallback={<ScreenFallback />}>
                <MotionRoot mode={motionMode}>
                  <AppInner
                    motionMode={motionMode}
                    changeMotionMode={changeMotionMode}
                    onMatchChange={setMatchMounted}
                  />
                </MotionRoot>
              </React.Suspense>
            </ToastProvider>
          </>
        )}
      </MetaProvider>
    </ErrorBoundary>
  );
}
