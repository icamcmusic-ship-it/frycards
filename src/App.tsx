import React, { useEffect, useState } from 'react';
import { getAllCards, applyCardData } from './game/cards';
import { fetchCardTemplates, recordMatchResult } from './lib/supabase';
import { GameV4 } from './components/GameV4';
import { HowToPlay } from './components/HowToPlay';
import { CardTemplate } from './types';
import { ARCHETYPES, Archetype } from './game/v3/decks';
import { POOL_BY_ID } from './game/v3/cardpool';
import { LEADER_HP } from './game/v3/cards';
import { MetaProvider, useMeta } from './meta/MetaContext';
import { AuthScreen } from './meta/AuthScreen';
import { MainMenu, MetaScreen } from './meta/MainMenu';
import { StoreScreen } from './meta/StoreScreen';
import { CollectionScreen } from './meta/CollectionScreen';
import { DeckBuilderScreen } from './meta/DeckBuilderScreen';
import { ProfileScreen } from './meta/ProfileScreen';
import { SettingsScreen } from './meta/SettingsScreen';
import { PopButton } from './meta/ui';
import { setCardBackImage } from './meta/cardback';
import { useTheme } from './meta/useTheme';

// ---------------------------------------------------------------------------
// Play setup — pick one of the v4.2 archetype decks (Rulebook v4.2)
// ---------------------------------------------------------------------------
interface MatchSetup {
  archetype: Archetype;
}

function PlayScreen({
  onStart,
  onBack,
}: {
  onStart: (setup: MatchSetup) => void;
  onBack: () => void;
}) {
  return (
    <div className="w-full min-h-screen bg-[#F7F7F7] text-[#1A1A1A]">
      <div className="sticky top-0 z-30 flex items-center gap-3 bg-[#1A1A1A] px-4 py-2.5">
        <PopButton onClick={onBack} color="yellow">
          &lt; MENU
        </PopButton>
        <h1 className="heading-font text-xl text-[#FFD54F]">CHOOSE YOUR DECK</h1>
        <span className="text-[10px] font-bold text-[#F7F7F7]/60">
          Dice-placement rules v4.2 · 30-card archetype decks · Leaders at {LEADER_HP} HP
        </span>
      </div>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="flex flex-wrap gap-4">
          {ARCHETYPES.map((arch) => {
            const leader = POOL_BY_ID[arch.leaderId];
            return (
              <button
                key={arch.label}
                onClick={() => onStart({ archetype: arch })}
                className="btn-pop w-56 overflow-hidden bg-[#F7F7F7] ink-border-md shadow-hard-black hover:-translate-y-1 transition-all text-left"
              >
                <div className="flex justify-between items-center px-2 py-1 bg-[#1A1A1A]">
                  <span className="text-[9px] heading-font text-[#FFD54F] truncate">{arch.label}</span>
                  <span className="text-[9px] font-mono font-bold text-[#F7F7F7] shrink-0">
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
                  <div className="text-[10px] font-bold text-[#2C3E50] mt-1">
                    {leader?.ability
                      ? `Ability ${leader.ability.threshold}+ · Ultimate turn ${leader.ultimate?.unlockTurn ?? '—'}+`
                      : ''}
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {arch.keywords.map((kw) => (
                      <span key={kw} className="text-[9px] font-bold px-1 bg-[#FFD54F] ink-border-sm">
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

// ---------------------------------------------------------------------------
// Game (mounted per match)
// ---------------------------------------------------------------------------
function Game({ setup, onExit }: { setup: MatchSetup; onExit: () => void }) {
  const { session, profile, refreshProfile } = useMeta();
  const [cpuArch] = useState(() => {
    const others = ARCHETYPES.filter((a) => a.label !== setup.archetype.label);
    return others[Math.floor(Math.random() * others.length)];
  });
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
        humanArchetype={setup.archetype}
        cpuArchetype={cpuArch}
        playerName={profile?.username || 'Player 1'}
        onExit={onExit}
        onResult={onResult}
      />
      {reward !== null && (
        <div className="absolute bottom-2 right-2 z-[60] bg-[#FFD54F] text-[#1A1A1A] heading-font text-[11px] px-3 py-1 ink-border-sm shadow-hard-black-xs">
          +{reward} GOLD
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------
function AppInner({ allCards }: { allCards: CardTemplate[] }) {
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
      <div className="w-full h-screen bg-[#1A1A1A] flex items-center justify-center">
        <div className="bg-[#FFD54F] text-[#1A1A1A] heading-font text-2xl px-6 py-3 ink-border-md shadow-hard-yellow animate-pulse">
          SHIFTING MULTIVERSE
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
      return <CollectionScreen onBack={() => setScreen('menu')} allCards={allCards} />;
    case 'decks':
      return <DeckBuilderScreen onBack={() => setScreen('menu')} allCards={allCards} />;
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
  const [cardPool, setCardPool] = useState<CardTemplate[] | null>(null);

  // Load the live card pool from the Supabase backend once at startup.
  // (Used by the meta screens — collection, store, deck builder. Matches run
  // on the v4.2 pool, remapped from the same backend card identities.)
  useEffect(() => {
    let cancelled = false;
    fetchCardTemplates().then((templates) => {
      if (cancelled) return;
      if (templates) applyCardData(templates);
      // Snapshot whatever pool is now active (live or bundled fallback).
      setCardPool(getAllCards());
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!cardPool) {
    return (
      <div className="w-full h-screen bg-[#1A1A1A] flex flex-col items-center justify-center gap-4">
        <div className="bg-[#FFD54F] text-[#1A1A1A] heading-font text-2xl px-6 py-3 ink-border-md shadow-hard-yellow animate-pulse">
          SHIFTING MULTIVERSE
        </div>
        <div className="text-[#F7F7F7] font-mono text-xs">FETCHING CARD DATABASE…</div>
      </div>
    );
  }

  return (
    <MetaProvider>
      <AppInner allCards={cardPool} />
    </MetaProvider>
  );
}
