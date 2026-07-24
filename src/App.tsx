import React, { useEffect, useState } from 'react';
import { fetchCardTemplates, recordMatchResult, MatchResult } from './lib/supabase';
import { GameV4 } from './components/GameV4';
import { HowToPlayScreen } from './components/HowToPlay';
import { buildDeck, deckDefFromCustom, randomArchetype } from './game/v3/decks';
import { DeckDef } from './game/v3/engine';
import { POOL_BY_ID, POOL_V4, applyCardPool } from './game/v3/cardpool';
import { preloadImages } from './lib/preload';
import { withTimeout } from './lib/utils';
import { LEADER_HP } from './game/v3/cards';
import { DeckRow } from './lib/supabase';
import { MetaProvider, useMeta } from './meta/MetaContext';
import { AuthScreen } from './meta/AuthScreen';
import { MainMenu, MetaScreen } from './meta/MainMenu';
import { StoreScreen } from './meta/StoreScreen';
import { BattlePassScreen } from './meta/BattlePassScreen';
import { AchievementsScreen } from './meta/AchievementsScreen';
import { SocialScreen } from './meta/SocialScreen';
import { MarketplaceScreen } from './meta/MarketplaceScreen';
import { PlayerShopsScreen } from './meta/PlayerShopsScreen';
import { CollectionScreen } from './meta/CollectionScreen';
import { DeckBuilderScreen } from './meta/DeckBuilderScreen';
import { ProfileScreen } from './meta/ProfileScreen';
import { SettingsScreen } from './meta/SettingsScreen';
import { ChangelogScreen } from './meta/ChangelogScreen';
import { NewsCenterScreen } from './meta/NewsCenterScreen';
import { PopButton } from './meta/ui';
import { SafeImage } from './meta/SafeImage';
import { setCardBackImage } from './meta/cardback';
import { useTheme } from './meta/useTheme';

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
        <h1 className="heading-font text-xl text-[var(--c-yellow)]">CHOOSE YOUR DECK</h1>
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
            Create an account to build and save your own decks in the Deck Builder (60+ cards, max
            4 copies each).
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
function Game({ setup, onExit }: { setup: MatchSetup; onExit: () => void }) {
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
  const [reward, setReward] = useState<MatchResult | null>(null);
  const [rewardError, setRewardError] = useState<string | null>(null);
  // While recordMatchResult() is in flight (including its retries), both
  // reward and rewardError stay null — indistinguishable from the guest
  // case (session-less players never get a reward at all), so the game-over
  // screen showed nothing at all during a real fetch. This flag lets it
  // show a "calculating…" placeholder instead of a blank gap.
  const [rewardPending, setRewardPending] = useState(false);

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
        const { data, error } = await recordMatchResult(won);
        if (data) {
          setReward(data);
          refreshProfile();
          return;
        }
        if (!error) return; // legitimately no reward to report (e.g. cooldown)
      }
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
        cpuDeck={buildDeck(cpuArch)}
        humanLabel={human.label}
        cpuLabel={cpuArch.label}
        playerName={profile?.username || 'Player 1'}
        onExit={onExit}
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
// ---------------------------------------------------------------------------
function AppInner() {
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
          FRYCARDS
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

  if (loading || !themeLoaded) {
    return (
      <div className="w-full h-screen bg-[var(--c-ink)] flex items-center justify-center">
        <div className="bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-2xl px-6 py-3 ink-border-md shadow-hard-yellow animate-pulse">
          FRYCARDS
        </div>
      </div>
    );
  }

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
        />
      </div>
    );
  }

  switch (screen) {
    case 'play':
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
      return <CollectionScreen onBack={() => setScreen('menu')} />;
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
          onBack={() => setScreen('menu')}
        />
      );
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
        const images = POOL_V4.map((c) => c.image);
        return preloadImages(images, (loaded, total) => {
          if (!cancelled) setProgress({ loaded, total });
        });
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
          FRYCARDS
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
          FRYCARDS
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
    <MetaProvider>
      <AppInner />
    </MetaProvider>
  );
}
