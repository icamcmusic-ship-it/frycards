import React, { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { initialGameState, gameReducer } from './game/engine';
import { getCPUAction } from './game/ai';
import { getDeckableLeaders, getCard, getAllCards, applyCardData } from './game/cards';
import { fetchCardTemplates, recordMatchResult, DeckRow } from './lib/supabase';
import { Board } from './components/Board';
import { HowToPlay } from './components/HowToPlay';
import { CardTemplate, GameCard, GameState } from './types';
import { GameAction } from './game/engine';
import { cn } from './lib/utils';
import { MetaProvider, useMeta } from './meta/MetaContext';
import { AuthScreen } from './meta/AuthScreen';
import { MainMenu, MetaScreen } from './meta/MainMenu';
import { StoreScreen } from './meta/StoreScreen';
import { CollectionScreen } from './meta/CollectionScreen';
import { DeckBuilderScreen } from './meta/DeckBuilderScreen';
import { ProfileScreen } from './meta/ProfileScreen';
import { PopButton } from './meta/ui';
import { setCardBackImage } from './meta/cardback';

// ---------------------------------------------------------------------------
// Mulligan (London protocol)
// ---------------------------------------------------------------------------
function MulliganModal({ state, dispatch }: { state: GameState; dispatch: React.Dispatch<GameAction> }) {
  const human = state.players[state.player1Id];
  const [bottoming, setBottoming] = useState<string[]>([]);
  if (state.phase !== 'MULLIGAN' || human.mulliganKept) return null;

  const needBottom = human.mulliganCount;
  const toggle = (id: string) =>
    setBottoming((b) => (b.includes(id) ? b.filter((x) => x !== id) : b.length < needBottom ? [...b, id] : b));

  const keep = () => {
    dispatch({ type: 'KEEP_HAND', playerId: human.id, bottomIds: bottoming });
    setBottoming([]);
  };

  return (
    <div className="absolute inset-0 bg-[#1A1A1A]/90 flex items-center justify-center z-50 p-4">
      <div className="bg-[#F7F7F7] text-[#1A1A1A] p-6 ink-border-md shadow-hard-yellow text-center max-w-4xl w-full">
        <h2 className="text-2xl heading-font mb-1">Mulligan — {human.name}</h2>
        <p className="text-[#2C3E50] mb-4 text-sm font-bold">
          {needBottom > 0
            ? `You have mulliganed ${needBottom} time(s). Select ${needBottom} card(s) to put on the bottom, then keep.`
            : 'Keep this hand, or mulligan to shuffle and redraw 5.'}
        </p>
        <div className="flex justify-center gap-2 flex-wrap mb-5">
          {human.hand.map((c: GameCard) => (
            <CardWithSelect key={c.instanceId} card={c} selected={bottoming.includes(c.instanceId)}
              onClick={() => needBottom > 0 && toggle(c.instanceId)} selectable={needBottom > 0} />
          ))}
        </div>
        <div className="flex gap-4 justify-center">
          <button onClick={keep} disabled={needBottom > 0 && bottoming.length !== needBottom}
            className="btn-pop px-6 py-3 bg-[#FFD54F] disabled:bg-[#2C3E50] disabled:text-[#F7F7F7]/40 text-[#1A1A1A] ink-border-sm shadow-hard-black-xs heading-font text-sm">
            Keep Hand
          </button>
          <button onClick={() => { dispatch({ type: 'MULLIGAN', playerId: human.id }); setBottoming([]); }}
            className="btn-pop px-6 py-3 bg-[#1A1A1A] text-[#FFD54F] ink-border-sm shadow-hard-black-xs heading-font text-sm">
            Mulligan ({human.hand.length} → 5)
          </button>
        </div>
      </div>
    </div>
  );
}

function CardWithSelect({ card, selected, onClick, selectable }: any) {
  return (
    <div onClick={onClick} className={cn('cursor-pointer transition-transform', selectable && 'hover:-translate-y-1', selected && '-translate-y-3')}>
      <div className={cn(selected && 'outline outline-4 outline-[#E53935]')}>
        <div className="w-24 h-[134px] overflow-hidden bg-[#F7F7F7] text-[#1A1A1A] ink-border-sm shadow-hard-black-xs flex flex-col">
          <div className="text-[9px] heading-font px-1 py-0.5 truncate bg-[#1A1A1A] text-[#FFD54F]">{card.name}</div>
          {card.image && <img src={card.image} className="w-full aspect-[4/3] object-cover" />}
          <div className="text-[8px] font-mono font-bold px-1 text-[#2C3E50] mt-auto uppercase">{card.type} · {card.rarity}</div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Resource roll & allocation
// ---------------------------------------------------------------------------
function RollModal({ state, dispatch }: { state: GameState; dispatch: React.Dispatch<GameAction> }) {
  const active = state.players[state.activePlayerId];
  const isHuman = !active.isCPU;
  const [allocs, setAllocs] = useState<Record<string, number>>({});

  useEffect(() => { setAllocs({}); }, [state.pendingRoll, state.turnNumber]);

  if (!isHuman) return null;
  if (state.phase !== 'ROLL' && state.phase !== 'ALLOCATE') return null;

  const total = (Object.values(allocs) as number[]).reduce((a, b) => a + b, 0);
  const remaining = (state.pendingRoll || 0) - total;

  const change = (el: string, d: number) => {
    const cur = allocs[el] || 0;
    if (d > 0 && remaining <= 0) return;
    if (d < 0 && cur <= 0) return;
    setAllocs({ ...allocs, [el]: cur + d });
  };

  const elements = active.leader.elements.filter((e) => e !== 'Generic');

  return (
    <div className="absolute inset-0 bg-[#1A1A1A]/85 flex items-center justify-center z-40">
      <div className="bg-[#F7F7F7] text-[#1A1A1A] p-8 ink-border-md shadow-hard-yellow text-center max-w-md w-full relative overflow-hidden">
        <div className="absolute inset-0 halftone-pattern pointer-events-none opacity-40" />
        {state.phase === 'ROLL' ? (
          <div className="relative">
            <h2 className="text-2xl heading-font mb-6">Resource Roll Phase</h2>
            <button onClick={() => dispatch({ type: 'ROLL_DICE' })}
              className="btn-pop px-10 py-4 bg-[#FFD54F] text-[#1A1A1A] heading-font text-xl ink-border-md shadow-hard-black">
              ⚄ Roll d6
            </button>
          </div>
        ) : (
          <div className="relative">
            <h2 className="text-2xl heading-font mb-1">Allocate Resources</h2>
            <p className="text-[#2C3E50] mb-5 text-sm font-bold">Distribute {remaining} more into your elements.</p>
            <div className="flex flex-col gap-3 mb-6">
              {elements.map((el) => (
                <div key={el} className="flex items-center justify-between bg-[#F7F7F7] p-3 ink-border-sm shadow-hard-black-xs">
                  <span className="heading-font text-sm">{el}</span>
                  <div className="flex items-center gap-4">
                    <button onClick={() => change(el, -1)} className="btn-pop w-8 h-8 bg-[#1A1A1A] text-[#FFD54F] font-black ink-border-sm">-</button>
                    <span className="w-4 font-mono font-black">{allocs[el] || 0}</span>
                    <button onClick={() => change(el, 1)} className="btn-pop w-8 h-8 bg-[#FFD54F] text-[#1A1A1A] font-black ink-border-sm">+</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => dispatch({ type: 'ALLOCATE_RESOURCES', allocations: allocs })} disabled={remaining !== 0}
              className="btn-pop w-full py-3 bg-[#E53935] disabled:bg-[#2C3E50] disabled:text-[#F7F7F7]/40 text-[#F7F7F7] heading-font ink-border-sm shadow-hard-black-xs">
              Confirm ({remaining} left)
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GameOverModal({ state, onReplay, reward }: { state: GameState; onReplay: () => void; reward: number | null }) {
  if (!state.winner) return null;
  const winner = state.players[state.winner];
  const humanWon = !winner.isCPU;
  return (
    <div className="absolute inset-0 bg-[#FFD54F] flex items-center justify-center z-50 overflow-hidden">
      <div className="absolute inset-0 starburst-ray" />
      <div className="text-center relative bg-[#F7F7F7] ink-border-lg shadow-hard-black-lg p-12">
        <h1 className="text-6xl heading-font text-[#1A1A1A] mb-4">{humanWon ? 'Victory' : 'Defeat'}</h1>
        <p className="text-2xl heading-font text-[#E53935] mb-4">{winner.name} wins the match!</p>
        {reward !== null && (
          <div className="heading-font text-sm bg-[#1A1A1A] text-[#FFD54F] inline-block px-4 py-2 ink-border-sm mb-8">
            +{reward} GOLD EARNED
          </div>
        )}
        <div className="flex gap-3 justify-center">
          <button onClick={onReplay} className="btn-pop px-8 py-3 bg-[#1A1A1A] text-[#FFD54F] heading-font ink-border-md shadow-hard-yellow">
            Back to Menu
          </button>
        </div>
      </div>
    </div>
  );
}

function LogPanel({ state }: { state: GameState }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="absolute top-24 left-2 z-30 w-64">
      <button onClick={() => setOpen(!open)}
        className="btn-pop heading-font text-[10px] bg-[#1A1A1A] text-[#FFD54F] px-2 py-0.5 ink-border-sm mb-0.5">
        BATTLE LOG {open ? '▾' : '▸'}
      </button>
      {open && (
        <div className="max-h-48 overflow-y-auto bg-[#1A1A1A]/90 ink-border-sm p-2 text-[10px] text-[#F7F7F7]/80 font-mono">
          {state.log.slice(-40).reverse().map((l, i) => <div key={i}>{l}</div>)}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Play setup — choose a saved deck (or a prebuilt quick-play deck)
// ---------------------------------------------------------------------------
interface MatchSetup {
  leaderId: string;
  customDeck?: string[];
  deckName: string;
}

function PlayScreen({ onStart, onBack }: { onStart: (setup: MatchSetup) => void; onBack: () => void }) {
  const { decks, guest, session } = useMeta();
  const validDecks = decks.filter((d) => d.is_valid);
  const leaders = getDeckableLeaders();

  return (
    <div className="w-full min-h-screen bg-[#F7F7F7] text-[#1A1A1A]">
      <div className="sticky top-0 z-30 flex items-center gap-3 bg-[#1A1A1A] px-4 py-2.5">
        <PopButton onClick={onBack} color="yellow">&lt; MENU</PopButton>
        <h1 className="heading-font text-xl text-[#FFD54F]">CHOOSE YOUR DECK</h1>
      </div>
      <div className="p-6 max-w-5xl mx-auto">
        {session && validDecks.length > 0 && (
          <>
            <h2 className="heading-font text-base mb-3 bg-[#E53935] text-[#F7F7F7] inline-block px-2 py-0.5">YOUR DECKS</h2>
            <div className="flex flex-wrap gap-4 mb-8">
              {validDecks.map((d: DeckRow) => {
                const leader = getCard(d.leader_id);
                return (
                  <button key={d.id}
                    onClick={() => onStart({ leaderId: d.leader_id, customDeck: d.card_ids, deckName: d.name })}
                    className="btn-pop w-56 overflow-hidden bg-[#F7F7F7] ink-border-md shadow-hard-black hover:-translate-y-1 transition-all text-left">
                    <div className="px-2 py-1 bg-[#E53935] heading-font text-[10px] text-[#F7F7F7] truncate">{d.name}</div>
                    {leader?.image && <div className="ink-border-sm m-1.5 overflow-hidden aspect-[16/8]"><img src={leader.image} className="w-full h-full object-cover" /></div>}
                    <div className="p-3 pt-1">
                      <div className="heading-font text-sm leading-tight">{leader?.name}</div>
                      <div className="text-[10px] font-bold text-[#2C3E50] mt-0.5 uppercase">{leader?.elements.join(' / ')}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <h2 className="heading-font text-base mb-3 bg-[#2C3E50] text-[#F7F7F7] inline-block px-2 py-0.5">
          QUICK PLAY · PREBUILT DECKS
        </h2>
        {guest && <p className="text-[11px] font-bold text-[#2C3E50] mb-3">Guest mode: prebuilt decks only. Create an account to forge your own.</p>}
        <div className="flex flex-wrap gap-4">
          {leaders.map((id) => {
            const l = getCard(id)!;
            return (
              <button key={id} onClick={() => onStart({ leaderId: id, deckName: `${l.name} (Prebuilt)` })}
                className="btn-pop w-56 overflow-hidden bg-[#F7F7F7] ink-border-md shadow-hard-black hover:-translate-y-1 transition-all text-left">
                <div className="flex justify-between items-center px-2 py-1 bg-[#1A1A1A]">
                  <span className="text-[9px] heading-font text-[#FFD54F]">MYTHIC LEADER ✸</span>
                  <span className="text-[9px] font-mono font-bold text-[#F7F7F7]">{l.health} HP</span>
                </div>
                {l.image && <div className="ink-border-sm m-1.5 overflow-hidden aspect-[4/3]"><img src={l.image} className="w-full h-full object-cover" /></div>}
                <div className="p-3 pt-1">
                  <div className="heading-font text-base leading-tight">{l.name}</div>
                  <div className="text-[10px] font-bold text-[#2C3E50] mt-1 uppercase">{l.elements.join(' / ')} · {l.attack} ATK</div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {(l.keywords || []).map((kw) => (
                      <span key={kw} className="text-[9px] font-bold px-1 bg-[#FFD54F] ink-border-sm">{kw}</span>
                    ))}
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
  const leaders = getDeckableLeaders();
  const cpuLeader = leaders.find((id) => id !== setup.leaderId) || leaders[0];
  const [state, dispatch] = useReducer(
    gameReducer,
    null,
    () => initialGameState(true, setup.leaderId, cpuLeader, setup.customDeck, profile?.username || 'Player 1')
  );
  const [showHelp, setShowHelp] = useState(false);
  const [reward, setReward] = useState<number | null>(null);
  const recorded = useRef(false);

  // Kick off the mulligan phase once.
  useEffect(() => { dispatch({ type: 'START_GAME' }); }, []);

  // Drive the CPU and auto-advance the human's own turn transitions.
  useEffect(() => {
    if (state.phase === 'GAME_OVER' || state.phase === 'INIT') return;
    const cpuAct = getCPUAction(state);
    if (cpuAct) {
      const t = setTimeout(() => dispatch(cpuAct), 450);
      return () => clearTimeout(t);
    }
    if (state.phase === 'TURN_TRANSITION' && !state.players[state.activePlayerId].isCPU) {
      const t = setTimeout(() => dispatch({ type: 'ACKNOWLEDGE_TRANSITION' }), 250);
      return () => clearTimeout(t);
    }
  }, [state]);

  // Record the result + pay out gold once per match (accounts only).
  useEffect(() => {
    if (state.phase !== 'GAME_OVER' || !state.winner || recorded.current) return;
    recorded.current = true;
    if (!session) return;
    const humanWon = !state.players[state.winner].isCPU;
    recordMatchResult(humanWon).then((res) => {
      if (res) {
        setReward(res.reward);
        refreshProfile();
      }
    });
  }, [state.phase, state.winner, session, state.players, refreshProfile]);

  return (
    <div className="relative w-full h-screen">
      <Board gameState={state} dispatch={dispatch} />
      <MulliganModal state={state} dispatch={dispatch} />
      <RollModal state={state} dispatch={dispatch} />
      <GameOverModal state={state} onReplay={onExit} reward={reward} />
      <LogPanel state={state} />
      <div className="absolute top-2 left-2 z-40 flex gap-1.5">
        <button onClick={onExit}
          className="btn-pop heading-font text-[11px] bg-[#1A1A1A] text-[#F7F7F7] px-2.5 py-1 ink-border-sm shadow-hard-black-xs"
          title="Concede and return to menu">
          ✕ CONCEDE
        </button>
        <button onClick={() => setShowHelp(true)}
          className="btn-pop heading-font text-[11px] bg-[#FFD54F] text-[#1A1A1A] px-2.5 py-1 ink-border-sm shadow-hard-black-xs"
          title="How to Play">
          ? RULES
        </button>
      </div>
      {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// App shell
// ---------------------------------------------------------------------------
function AppInner({ allCards }: { allCards: CardTemplate[] }) {
  const { session, guest, loading, profile, shopItems } = useMeta();
  const [screen, setScreen] = useState<MetaScreen>('menu');
  const [match, setMatch] = useState<MatchSetup | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const [showHelp, setShowHelp] = useState(false);

  // Keep the equipped card back applied to in-game face-down cards.
  useEffect(() => {
    const back = shopItems.find((s) => s.id === profile?.equipped_card_back);
    setCardBackImage(back?.image_url || null);
  }, [profile?.equipped_card_back, shopItems]);

  if (loading) {
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
        <Game setup={match} onExit={() => { setMatch(null); setScreen('menu'); setGameKey((k) => k + 1); }} />
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
  useEffect(() => {
    let cancelled = false;
    fetchCardTemplates().then((templates) => {
      if (cancelled) return;
      if (templates) applyCardData(templates);
      // Snapshot whatever pool is now active (live or bundled fallback).
      setCardPool(getAllCards());
    });
    return () => { cancelled = true; };
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
