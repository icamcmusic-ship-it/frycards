import React, { useEffect, useReducer, useState } from 'react';
import { initialGameState, gameReducer } from './game/engine';
import { getCPUAction } from './game/ai';
import { DECKABLE_LEADERS, CARD_DB } from './game/cards';
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
    <div className="absolute inset-0 bg-slate-950/90 flex items-center justify-center z-50 backdrop-blur-sm p-4">
      <div className="bg-slate-900 p-6 rounded-xl border border-slate-700 shadow-2xl text-center max-w-4xl w-full">
        <h2 className="text-2xl font-bold text-white mb-1">Mulligan — {human.name}</h2>
        <p className="text-slate-400 mb-4 text-sm">
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
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium">
            Keep Hand
          </button>
          <button onClick={() => { dispatch({ type: 'MULLIGAN', playerId: human.id }); setBottoming([]); }}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium">
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
      <div className={cn('rounded-lg', selected && 'ring-4 ring-rose-500')}>
        {/* lightweight card face */}
        <div className="w-24 h-32 rounded-lg overflow-hidden bg-slate-800 border-2 border-slate-700 flex flex-col">
          <div className="text-[10px] font-bold px-1 py-0.5 truncate bg-slate-900">{card.name}</div>
          {card.image && <img src={card.image} className="w-full aspect-[4/3] object-cover" />}
          <div className="text-[9px] px-1 text-slate-400 mt-auto">{card.type}</div>
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
    <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center z-40 backdrop-blur-sm">
      <div className="bg-slate-900 p-8 rounded-xl border border-slate-700 shadow-2xl text-center max-w-md w-full">
        {state.phase === 'ROLL' ? (
          <>
            <h2 className="text-2xl font-bold text-white mb-6">Resource Roll Phase</h2>
            <button onClick={() => dispatch({ type: 'ROLL_DICE' })}
              className="px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white text-xl rounded-lg font-medium active:scale-95 transition-transform">
              Roll d6
            </button>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-white mb-1">Allocate Resources</h2>
            <p className="text-slate-400 mb-5 text-sm">Distribute {remaining} more into your elements.</p>
            <div className="flex flex-col gap-3 mb-6">
              {elements.map((el) => (
                <div key={el} className="flex items-center justify-between bg-slate-800 p-3 rounded-lg border border-slate-700">
                  <span className="font-bold text-slate-200">{el}</span>
                  <div className="flex items-center gap-4">
                    <button onClick={() => change(el, -1)} className="w-8 h-8 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold">-</button>
                    <span className="w-4 font-mono">{allocs[el] || 0}</span>
                    <button onClick={() => change(el, 1)} className="w-8 h-8 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold">+</button>
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => dispatch({ type: 'ALLOCATE_RESOURCES', allocations: allocs })} disabled={remaining !== 0}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium">
              Confirm ({remaining} left)
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function GameOverModal({ state, onReplay }: { state: GameState; onReplay: () => void }) {
  if (!state.winner) return null;
  const winner = state.players[state.winner];
  return (
    <div className="absolute inset-0 bg-slate-950/95 flex items-center justify-center z-50 backdrop-blur-md">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-amber-500 uppercase mb-4 tracking-widest">Victory</h1>
        <p className="text-3xl text-white mb-10">{winner.name} wins the match!</p>
        <button onClick={onReplay} className="px-8 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium">Play Again</button>
      </div>
    </div>
  );
}

function LogPanel({ state }: { state: GameState }) {
  return (
    <div className="absolute top-24 left-2 w-64 max-h-48 overflow-y-auto bg-slate-900/80 border border-slate-800 rounded-lg p-2 text-[10px] text-slate-400 font-mono z-30 backdrop-blur-sm">
      {state.log.slice(-40).reverse().map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Start screen — pick your Leader
// ---------------------------------------------------------------------------
function StartScreen({ onStart }: { onStart: (leaderId: string) => void }) {
  return (
    <div className="w-full h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-200 p-6">
      <h1 className="text-4xl font-bold text-white mb-2 tracking-widest uppercase">Shifting Multiverse</h1>
      <p className="text-slate-400 mb-8">Choose your Leader. The CPU will pick another.</p>
      <div className="flex gap-4 flex-wrap justify-center max-w-4xl">
        {DECKABLE_LEADERS.map((id) => {
          const l = CARD_DB[id];
          return (
            <button key={id} onClick={() => onStart(id)}
              className="w-52 rounded-xl overflow-hidden bg-slate-900 border-2 border-slate-700 hover:border-emerald-500 hover:-translate-y-1 transition-all text-left">
              {l.image && <img src={l.image} className="w-full aspect-[4/3] object-cover" />}
              <div className="p-3">
                <div className="font-bold text-white">{l.name}</div>
                <div className="text-xs text-slate-400 mt-1">{l.elements.join(' / ')} · {l.health} HP · {l.attack} ATK</div>
                <div className="text-[10px] text-indigo-300 mt-1">{(l.keywords || []).join(', ')}</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Game (mounted per match)
// ---------------------------------------------------------------------------
function Game({ leaderId, onReplay }: { leaderId: string; onReplay: () => void }) {
  const cpuLeader = DECKABLE_LEADERS.find((id) => id !== leaderId) || DECKABLE_LEADERS[0];
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
    <div className="relative w-full h-screen font-sans">
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

  if (!leaderId) return <StartScreen onStart={setLeaderId} />;
  return (
    <div key={gameKey} className="contents">
      <Game leaderId={leaderId} onReplay={() => { setLeaderId(null); setGameKey((k) => k + 1); }} />
    </div>
  );
}
