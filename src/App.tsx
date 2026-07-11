import React, { useEffect, useState } from 'react';
import { fetchCardTemplates, recordMatchResult } from './lib/supabase';
import { GameV4 } from './components/GameV4';
import { HowToPlay } from './components/HowToPlay';
import {
  ARCHETYPES,
  Archetype,
  buildDeck,
  deckDefFromCustom,
  randomArchetype,
} from './game/v3/decks';
import { DeckDef } from './game/v3/engine';
import { POOL_BY_ID, applyCardPool } from './game/v3/cardpool';
import { LEADER_HP } from './game/v3/cards';
import { DeckRow } from './lib/supabase';
import { MetaProvider, useMeta } from './meta/MetaContext';
import { AuthScreen } from './meta/AuthScreen';
import { MainMenu, MetaScreen } from './meta/MainMenu';
import { StoreScreen } from './meta/StoreScreen';
import { CollectionScreen } from './meta/CollectionScreen';
import { DeckBuilderScreen } from './meta/DeckBuilderScreen';
import { ProfileScreen } from './meta/ProfileScreen';
import { SettingsScreen } from './meta/SettingsScreen';
import { ChangelogScreen } from './meta/ChangelogScreen';
import { PopButton } from './meta/ui';
import { setCardBackImage } from './meta/cardback';
import { useTheme } from './meta/useTheme';

// ---------------------------------------------------------------------------
// Play setup — a v4.2 archetype deck, or one of the player's own saved decks
// ---------------------------------------------------------------------------
type MatchSetup = { kind: 'archetype'; archetype: Archetype } | { kind: 'custom'; deck: DeckRow };

function PlayScreen({
  onStart,
  onBack,
}: {
  onStart: (setup: MatchSetup) => void;
  onBack: () => void;
}) {
  const { decks, guest } = useMeta();
  const legalDecks = decks.filter((d) => d.is_valid);

  return (
    <div className="w-full min-h-screen bg-[var(--c-paper)] text-[var(--c-ink)]">
      <div className="sticky top-0 z-30 flex items-center gap-3 bg-[var(--c-ink)] px-4 py-2.5">
        <PopButton onClick={onBack} color="yellow">
          &lt; MENU
        </PopButton>
        <h1 className="heading-font text-xl text-[var(--c-yellow)]">CHOOSE YOUR DECK</h1>
        <span className="text-[10px] font-bold text-[var(--c-paper)]/60">
          Dice-placement rules v4.2 · 30-card decks · Leaders at {LEADER_HP} HP
        </span>
      </div>
      <div className="p-6 max-w-6xl mx-auto">
        {!guest && (
          <>
            <h2 className="heading-font text-base mb-3 bg-[var(--c-red)] text-[var(--c-paper)] inline-block px-2 py-0.5">
              YOUR DECKS
            </h2>
            {legalDecks.length === 0 ? (
              <p className="text-[11px] font-bold text-[var(--c-steel)] mb-8">
                No legal decks yet — build one in the Deck Builder (30 cards, max 3 copies each).
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
                      {leader?.image && (
                        <div className="ink-border-sm m-1.5 overflow-hidden aspect-[16/8]">
                          <img src={leader.image} className="w-full h-full object-cover" />
                        </div>
                      )}
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

        <h2 className="heading-font text-base mb-3 bg-[var(--c-steel)] text-[var(--c-paper)] inline-block px-2 py-0.5">
          PREBUILT ARCHETYPES
        </h2>
        {guest && (
          <p className="text-[11px] font-bold text-[var(--c-steel)] mb-3">
            Guest mode: prebuilt decks only. Create an account to forge your own.
          </p>
        )}
        <div className="flex flex-wrap gap-4">
          {ARCHETYPES.map((arch) => {
            const leader = POOL_BY_ID[arch.leaderId];
            return (
              <button
                key={arch.label}
                onClick={() => onStart({ kind: 'archetype', archetype: arch })}
                className="btn-pop w-56 overflow-hidden bg-[var(--c-paper)] ink-border-md shadow-hard-black hover:-translate-y-1 transition-all text-left"
              >
                <div className="flex justify-between items-center px-2 py-1 bg-[var(--c-ink)]">
                  <span className="text-[9px] heading-font text-[var(--c-yellow)] truncate">
                    {arch.label}
                  </span>
                  <span className="text-[9px] font-mono font-bold text-[var(--c-paper)] shrink-0">
                    {LEADER_HP} HP
                  </span>
                </div>
                {leader?.image && (
                  <div className="ink-border-sm m-1.5 overflow-hidden aspect-[4/3]">
                    <img src={leader.image} className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="p-3 pt-1">
                  <div className="heading-font text-base leading-tight">{leader?.name}</div>
                  <div className="text-[10px] font-bold text-[var(--c-steel)] mt-1">
                    {leader?.ability
                      ? `Ability ${leader.ability.threshold}+ · Ultimate turn ${leader.ultimate?.unlockTurn ?? '—'}+`
                      : ''}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {arch.keywords.map((kw) => (
                      <span
                        key={kw}
                        className="text-[9px] font-bold px-1 bg-[var(--c-yellow)] ink-border-sm"
                      >
                        {kw}
                      </span>
                    ))}
                    {arch.comboFamily && arch.comboFamily !== 'none' && (
                      <span className="text-[9px] font-bold px-1 bg-[#8E44AD] text-white ink-border-sm">
                        {arch.comboFamily === 'straight' ? 'STRAIGHTS' : 'MATCHES'}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function setupToDeck(setup: MatchSetup): { deck: DeckDef; label: string } {
  if (setup.kind === 'archetype') {
    return { deck: buildDeck(setup.archetype), label: setup.archetype.label };
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
  const human = setupToDeck(setup);
  // CPU plays a freshly randomized deck every match rather than one of the
  // fixed archetype presets — keeps every match legal even when the human's
  // own custom deck is still a work in progress.
  const [cpuArch] = useState(() => randomArchetype());
  const [reward, setReward] = useState<number | null>(null);

  const onResult = (won: boolean) => {
    if (!session) return;
    recordMatchResult(won).then((res) => {
      if (res) {
        setReward(res.reward);
        refreshProfile();
      }
    });
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
      />
      {reward !== null && (
        <div className="absolute bottom-2 right-2 z-[60] bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-[11px] px-3 py-1 ink-border-sm shadow-hard-black-xs">
          +{reward} GOLD
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------
function AppInner() {
  const { session, guest, loading, profile, shopItems } = useMeta();
  const { currentTheme, changeTheme, loaded: themeLoaded } = useTheme();
  const [screen, setScreen] = useState<MetaScreen>('menu');
  const [match, setMatch] = useState<MatchSetup | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  // Keep the equipped card back applied to in-game face-down cards.
  useEffect(() => {
    const back = shopItems.find((s) => s.id === profile?.equipped_card_back);
    setCardBackImage(back?.image_url || null);
  }, [profile?.equipped_card_back, shopItems]);

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
    case 'collection':
      return <CollectionScreen onBack={() => setScreen('menu')} />;
    case 'decks':
      return <DeckBuilderScreen onBack={() => setScreen('menu')} />;
    case 'profile':
      return <ProfileScreen onBack={() => setScreen('menu')} />;
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
    default:
      return (
        <>
          <MainMenu onNavigate={setScreen} onHelp={() => setShowHelp(true)} />
          {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
        </>
      );
  }
}

export default function App() {
  const [poolReady, setPoolReady] = useState(false);

  // Load the universal card catalog from the Supabase backend once at
  // startup and build the v4.2 card pool from it (mechanics are assigned
  // deterministically client-side). Falls back to the bundled catalog.
  useEffect(() => {
    let cancelled = false;
    fetchCardTemplates().then((templates) => {
      if (cancelled) return;
      if (templates) applyCardPool(templates);
      setPoolReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!poolReady) {
    return (
      <div className="w-full h-screen bg-[var(--c-ink)] flex flex-col items-center justify-center gap-4">
        <div className="bg-[var(--c-yellow)] text-[var(--c-ink)] heading-font text-2xl px-6 py-3 ink-border-md shadow-hard-yellow animate-pulse">
          FRYCARDS
        </div>
        <div className="text-[var(--c-paper)] font-mono text-xs">FETCHING CARD DATABASE…</div>
      </div>
    );
  }

  return (
    <MetaProvider>
      <AppInner />
    </MetaProvider>
  );
}
