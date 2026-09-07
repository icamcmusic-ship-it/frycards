import React, { useEffect, useRef, useState } from 'react';
import { fetchCardTemplates, recordMatchResult, beginMatch, MatchResult } from './lib/supabase';
import { buildDeck, deckDefFromCustom, randomArchetype } from './game/v3/decks';
import { DeckDef } from './game/v3/engine';
import { POOL_BY_ID, POOL_V4, applyCardPool } from './game/v3/cardpool';
import { withTimeout } from './lib/utils';
import { LEADER_HP } from './game/v3/cards';
import { DeckRow } from './lib/supabase';
import { MetaProvider, useMeta } from './meta/MetaContext';
import { AuthScreen } from './meta/AuthScreen';
import { MainMenu, MetaScreen } from './meta/MainMenu';
import type { ShowroomSubject } from './meta/ShowroomScreen';
import { PopButton } from './meta/ui';
import { SafeImage } from './meta/SafeImage';
import { setCardBackImage } from './meta/cardback';
import { useTheme } from './meta/useTheme';
import { useMotionMode } from './meta/useMotionMode';
import { MotionConfig } from 'motion/react';
import type { MotionMode } from './meta/matchPrefs';

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
}: {
  onStart: (setup: MatchSetup) => void;
  onBack: () => void;
}) {
  const { decks, guest, dataLoading } = useMeta();
  const legalDecks = decks.filter((d) => d.is_valid);

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <div className="sticky top-0 z-30 flex items-center gap-3 bg-[var(--c-ink)] px-4 py-2.5">
        <PopButton onClick={onBack} color="yellow">
          &lt; MENU
        </PopButton>
        {/* Guests can't choose anything — the random deck is their only
            option, so "CHOOSE YOUR DECK" would be a lie. */}
        <h1 className="heading-font text-xl text-[var(--c-yellow)]">
          {guest ? 'QUICK MATCH' : 'CHOOSE YOUR DECK'}
        </h1>
        <span className="text-[10px] font-bold text-[var(--c-paper)]/60">
          Fry Cards rules v6.0 · 60-card decks · start at {LEADER_HP} Vitality
        </span>
      </div>
      <div className="p-6 max-w-6xl mx-auto">
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
          <p className="text-[10px] font-bold text-[var(--c-steel)] mt-2">
            Rolls a freshly randomized legal deck — no collection needed. The CPU does the same.
          </p>
        </div>
        {guest ? (
          <p className="text-[11px] font-bold text-[var(--c-steel)]">
            Create an account to build and save your own decks in the Deck Builder (60+ cards, max 4
            copies each).
          </p>
        ) : (
          <>
            <h2 className="heading-font text-base mb-3 bg-[var(--c-red)] text-[var(--c-paper)] inline-block px-2 py-0.5">
              YOUR DECKS
            </h2>
            {dataLoading ? (
              <p className="text-[11px] font-bold text-[var(--c-steel)] mb-8 animate-pulse">
                Loading your decks…
              </p>
            ) : legalDecks.length === 0 ? (
              <p className="text-[11px] font-bold text-[var(--c-steel)] mb-8">
                No legal decks yet — build one in the Deck Builder (60+ cards, max 4 copies each).
              </p>
            ) : (
              <div className="flex flex-wrap gap-4 mb-8">
                {legalDecks.map((d) => {
                  const leader = POOL_BY_ID[d.leader_id];
                  return (
                    <button
                      key={d.id}
                      onClick={() => onStart({ kind: 'custom', deck: d })}
                      className="btn-pop w-56 overflow-hidden bg-[var(--c-paper)] ink-border-md shadow-hard-black hover:-translate-y-1 transition-all text-left"
                    >
                      <div className="px-2 py-1 bg-[var(--c-red)] heading-font text-[10px] text-[var(--c-paper)] truncate">
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
                        <div className="text-[10px] font-bold text-[var(--c-steel)] mt-0.5">
                          {d.card_ids.length} cards
                        </div>
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

function setupToDeck(setup: MatchSetup): { deck: DeckDef; label: string } {
  if (setup.kind === 'random') {
    const arch = randomArchetype();
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
function Game({
  setup,
  onExit,
  onRematch,
}: {
  setup: MatchSetup;
  onExit: () => void;
  onRematch: () => void;
}) {
  const { session, profile, refreshProfile } = useMeta();
  // useState initializer, not a plain call: for a random setup, calling
  // setupToDeck on every render would silently re-roll the human's deck
  // whenever this component re-renders (e.g. the reward state updating at
  // game end). One roll per mount — the gameKey remount rolls a fresh one.
  const [human] = useState(() => setupToDeck(setup));
  // CPU plays a freshly randomized deck every match rather than one of the
  // fixed archetype presets — keeps every match legal even when the human's
  // own custom deck is still a work in progress.
  const [cpuArch] = useState(() => randomArchetype());
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
  useEffect(() => {
    if (!session) return; // guests never earn a reward, so never mint a ticket
    let cancelled = false;
    beginMatch().then(({ matchId }) => {
      if (!cancelled) matchIdRef.current = matchId;
    });
    return () => {
      cancelled = true;
    };
  }, [session]);

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
        const { data, error } = await recordMatchResult(won, matchIdRef.current ?? undefined);
        if (data) {
          setReward(data);
          // Fire-and-forget with an explicit catch: a rejected refresh here
          // must not surface as an unhandled rejection — the realtime profile
          // subscription catches the wallet up anyway.
          refreshProfile().catch(() => {});
          return;
        }
        if (!error) return; // already recorded, or legitimately no reward
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

  return (
    <div className="relative w-full h-screen">
      <GameV4
        humanDeck={human.deck}
        cpuDeck={cpuDeck}
        humanLabel={human.label}
        cpuLabel={cpuArch.label}
        playerName={profile?.username || 'Player 1'}
        onExit={onExit}
        onRematch={onRematch}
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
function AppInner({
  motionMode,
  changeMotionMode,
}: {
  motionMode: MotionMode;
  changeMotionMode: (m: MotionMode) => void;
}) {
  const { session, guest, loading, bootError, retryBoot, profile, shopItems } = useMeta();
  const { currentTheme, changeTheme, loaded: themeLoaded } = useTheme();
  // First-ever visit auto-opens the How to Play page — previously this was
  // 100% opt-in (only reachable via the Main Menu button), so a new player
  // could start a real match having never seen the turn structure or any
  // keyword explained.
  const [screen, setScreen] = useState<MetaScreen>(() => {
    try {
      return localStorage.getItem('frycards_seen_howtoplay') === '1' ? 'menu' : 'howtoplay';
    } catch {
      return 'menu';
    }
  });
  const [match, setMatch] = useState<MatchSetup | null>(null);
  // What the 3D Showroom opens on when it is reached from a deep link (the
  // Collection inspector's VIEW IN 3D, a slab in the Grading Lab vault)
  // rather than from the menu tile. Cleared by the tile itself, so a later
  // visit from the menu does not silently reopen the last deep-linked card.
  const [showroomSubject, setShowroomSubject] = useState<ShowroomSubject | null>(null);
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
    const back = shopItems.find((s) => s.id === profile?.equipped_card_back);
    setCardBackImage(back?.image_url || null);
  }, [profile?.equipped_card_back, shopItems]);

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
            setScreen('menu');
            setGameKey((k) => k + 1);
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
      if (!guest && profile?.role !== 'creator') return <MainMenu onNavigate={setScreen} />;
      return <PlayScreen onStart={setMatch} onBack={() => setScreen('menu')} />;
    case 'store':
      return <StoreScreen onBack={() => setScreen('menu')} />;
    case 'battlepass':
      return <BattlePassScreen onBack={() => setScreen('menu')} />;
    case 'achievements':
      return <AchievementsScreen onBack={() => setScreen('menu')} />;
    case 'social':
      return <SocialScreen onBack={() => setScreen('menu')} />;
    case 'market':
      return <MarketplaceScreen onBack={() => setScreen('menu')} />;
    case 'shops':
      return <PlayerShopsScreen onBack={() => setScreen('menu')} />;
    case 'collection':
      return (
        <CollectionScreen
          onBack={() => setScreen('menu')}
          onGrading={() => setScreen('grading')}
          onShowroom={(subject) => {
            setShowroomSubject(subject);
            setScreen('showroom');
          }}
        />
      );
    case 'grading':
      return (
        <GradingScreen
          onBack={() => setScreen('menu')}
          onShowroom={(subject) => {
            setShowroomSubject(subject);
            setScreen('showroom');
          }}
        />
      );
    case 'showroom':
      return (
        <ShowroomScreen
          initial={showroomSubject ?? undefined}
          onBack={() => {
            setShowroomSubject(null);
            setScreen('menu');
          }}
        />
      );
    case 'decks':
      return <DeckBuilderScreen onBack={() => setScreen('menu')} />;
    case 'profile':
      return (
        <ProfileScreen
          onBack={() => setScreen('menu')}
          onManageShowcase={() => setScreen('collection')}
        />
      );
    case 'settings':
      return (
        <SettingsScreen
          currentTheme={currentTheme}
          onThemeChange={changeTheme}
          motionMode={motionMode}
          onMotionModeChange={changeMotionMode}
          onBack={() => setScreen('menu')}
        />
      );
    case 'submissions':
      return <CardSubmissionsScreen onBack={() => setScreen('menu')} />;
    case 'changelog':
      return <ChangelogScreen onBack={() => setScreen('menu')} />;
    case 'news':
      return (
        <NewsCenterScreen
          onBack={() => setScreen('menu')}
          onOpenChangelog={() => setScreen('changelog')}
        />
      );
    case 'howtoplay':
      return (
        <HowToPlayScreen
          onBack={() => {
            markHelpSeen();
            setScreen('menu');
          }}
        />
      );
    default:
      return <MainMenu onNavigate={setScreen} />;
  }
}

export default function App() {
  // 1.8/2.4: the motion preference. The hook sets the <html data-motion>
  // attribute the CSS override keys off; the mode drives the MotionConfig
  // below, which is what makes the motion library honour any of it at all.
  const { mode: motionMode, changeMode: changeMotionMode } = useMotionMode();
  const [poolReady, setPoolReady] = useState(false);
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  const [poolError, setPoolError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

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
    // A stalled request (bad proxy, dropped connection) never rejects — it
    // just never resolves — which would otherwise strand players on this
    // screen forever with no retry button. 20s is generous enough for a
    // slow connection but bounded.
    withTimeout(fetchCardTemplates(), 20_000, null)
      .then((templates) => {
        if (cancelled) return;
        if (templates) applyCardPool(templates);
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

  if (poolError) {
    return (
      <div className="w-full h-screen bg-[var(--c-ink)] flex flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-2xl px-6 py-3 ink-border-md shadow-hard-yellow">
          FRY CARDS
        </div>
        <p className="text-[var(--c-paper)] font-bold text-sm max-w-xs">{poolError}</p>
        <button
          onClick={() => {
            setPoolError(null);
            setProgress({ loaded: 0, total: 0 });
            setAttempt((n) => n + 1);
          }}
          className="btn-pop heading-font text-sm px-5 py-2 bg-[var(--c-yellow)] text-[var(--c-ink)] ink-border-sm shadow-hard-black-xs"
        >
          RETRY
        </button>
      </div>
    );
  }

  if (!poolReady) {
    const pct = progress.total > 0 ? Math.round((progress.loaded / progress.total) * 100) : 0;
    return (
      <div className="w-full h-screen bg-[var(--c-ink)] flex flex-col items-center justify-center gap-4">
        <div className="bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-2xl px-6 py-3 ink-border-md shadow-hard-yellow animate-pulse">
          FRY CARDS
        </div>
        <div className="text-[var(--c-paper)] font-mono text-xs">
          {progress.total > 0
            ? `LOADING CARD ART… ${progress.loaded}/${progress.total}`
            : 'FETCHING CARD DATABASE…'}
        </div>
        <div className="w-64 h-2 ink-border-sm bg-[var(--c-paper)]/10 overflow-hidden">
          <div
            className="h-full bg-[var(--c-yellow)] transition-all duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      {/* 1.8: the CSS half of reduced-motion was thorough; the JS half did not
          exist. Framer-style motion animates at full tilt unless a MotionConfig
          opts in, so the match board — 10 motion sites in GameV4, 13 in
          CardFaceV4 — ignored the accessibility preference entirely while the
          decorative card bling honoured it. `reducedMotion="user"` is the whole
          fix; the in-app override on top of it lives in Settings. */}
      <MotionConfig
        reducedMotion={
          motionMode === 'system' ? 'user' : motionMode === 'reduced' ? 'always' : 'never'
        }
      >
        <MetaProvider>
          {/* One boundary above the route switch: every screen below is a
              lazy chunk, and a route transition is the only thing that can
              suspend here. */}
          <React.Suspense fallback={<ScreenFallback />}>
            <AppInner motionMode={motionMode} changeMotionMode={changeMotionMode} />
          </React.Suspense>
        </MetaProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}
