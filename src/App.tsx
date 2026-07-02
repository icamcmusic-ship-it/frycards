import React, { useEffect, useReducer, useState } from 'react';
import { initialGameState, gameReducer } from './game/engine';
import { getCPUAction } from './game/ai';
import { getDeckableLeaders, getCard, applyCardData } from './game/cards';
import { fetchCardTemplates } from './lib/supabase';
import { Board } from './components/Board';
import { GameCard, GameState } from './types';
import { GameAction } from './game/engine';
import { cn } from './lib/utils';

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
        {/* lightweight card face */}
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

function GameOverModal({ state, onReplay }: { state: GameState; onReplay: () => void }) {
  if (!state.winner) return null;
  const winner = state.players[state.winner];
  return (
    <div className="absolute inset-0 bg-[#FFD54F] flex items-center justify-center z-50 overflow-hidden">
      <div className="absolute inset-0 starburst-ray" />
      <div className="text-center relative bg-[#F7F7F7] ink-border-lg shadow-hard-black-lg p-12">
        <h1 className="text-6xl heading-font text-[#1A1A1A] mb-4">Victory</h1>
        <p className="text-2xl heading-font text-[#E53935] mb-10">{winner.name} wins the match!</p>
        <button onClick={onReplay} className="btn-pop px-8 py-3 bg-[#1A1A1A] text-[#FFD54F] heading-font ink-border-md shadow-hard-yellow">Play Again</button>
      </div>
    </div>
  );
}

function LogPanel({ state }: { state: GameState }) {
  return (
    <div className="absolute top-24 left-2 w-64 max-h-48 overflow-y-auto bg-[#1A1A1A]/90 ink-border-sm p-2 text-[10px] text-[#F7F7F7]/80 font-mono z-30">
      {state.log.slice(-40).reverse().map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Start screen — pick your Leader
// ---------------------------------------------------------------------------
function StartScreen({ onStart, dataSource }: { onStart: (leaderId: string) => void; dataSource: string }) {
  return (
    <div className="w-full min-h-screen bg-[#F7F7F7] flex flex-col items-center justify-center text-[#1A1A1A] p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[#2C3E50] pointer-events-none opacity-15" style={{ clipPath: 'polygon(0 0, 55% 0, 30% 100%, 0% 100%)' }} />
      <div className="absolute inset-0 bg-[#FFD54F] pointer-events-none" style={{ clipPath: 'polygon(88% 0, 100% 0, 100% 100%, 75% 100%)' }} />
      <div className="relative z-10 flex flex-col items-center">
        <div className="bg-[#E53935] text-[#F7F7F7] px-3 py-1 heading-font text-xs ink-border-sm shadow-hard-black-xs mb-3">
          STARK COMIC STANDARD · BLUE CORAL SET
        </div>
        <h1 className="text-5xl sm:text-6xl heading-font leading-none text-center mb-2">
          SHIFTING<br /><span className="bg-[#1A1A1A] text-[#FFD54F] px-4 py-1 inline-block mt-1">MULTIVERSE TCG</span>
        </h1>
        <p className="text-[#2C3E50] font-bold text-sm mb-2">Choose your Leader. The CPU will pick another.</p>
        <div className="text-[10px] font-mono font-bold bg-[#1A1A1A] text-[#FFD54F] px-2 py-0.5 mb-8">CARD DATA: {dataSource}</div>
        <div className="flex gap-6 flex-wrap justify-center max-w-5xl">
          {getDeckableLeaders().map((id) => {
            const l = getCard(id)!;
            return (
              <button key={id} onClick={() => onStart(id)}
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
function Game({ leaderId, onReplay }: { leaderId: string; onReplay: () => void }) {
  const leaders = getDeckableLeaders();
  const cpuLeader = leaders.find((id) => id !== leaderId) || leaders[0];
  const [state, dispatch] = useReducer(gameReducer, null, () => initialGameState(true, leaderId, cpuLeader));

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

  return (
    <div className="relative w-full h-screen">
      <Board gameState={state} dispatch={dispatch} />
      <MulliganModal state={state} dispatch={dispatch} />
      <RollModal state={state} dispatch={dispatch} />
      <GameOverModal state={state} onReplay={onReplay} />
      <LogPanel state={state} />
    </div>
  );
}

export default function App() {
  const [leaderId, setLeaderId] = useState<string | null>(null);
  const [gameKey, setGameKey] = useState(0);
  const [dataSource, setDataSource] = useState<'LOADING…' | 'SUPABASE LIVE' | 'BUNDLED FALLBACK'>('LOADING…');

  // Load the live card pool from the Supabase backend once at startup.
  useEffect(() => {
    let cancelled = false;
    fetchCardTemplates().then((templates) => {
      if (cancelled) return;
      if (templates) {
        applyCardData(templates);
        setDataSource('SUPABASE LIVE');
      } else {
        setDataSource('BUNDLED FALLBACK');
      }
    });
    return () => { cancelled = true; };
  }, []);

  if (dataSource === 'LOADING…') {
    return (
      <div className="w-full h-screen bg-[#1A1A1A] flex flex-col items-center justify-center gap-4">
        <div className="bg-[#FFD54F] text-[#1A1A1A] heading-font text-2xl px-6 py-3 ink-border-md shadow-hard-yellow animate-pulse">
          SHIFTING MULTIVERSE
        </div>
        <div className="text-[#F7F7F7] font-mono text-xs">FETCHING CARD DATABASE…</div>
      </div>
    );
  }

  if (!leaderId) return <StartScreen onStart={setLeaderId} dataSource={dataSource} />;
  return (
    <div key={gameKey} className="contents">
      <Game leaderId={leaderId} onReplay={() => { setLeaderId(null); setGameKey((k) => k + 1); }} />
    </div>
  );
}
