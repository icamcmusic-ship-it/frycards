import React, { useReducer, useState } from 'react';
import { initialGameState, gameReducer } from './game/engine';
import { Board } from './components/Board';

function MulliganModal({ state, dispatch }: { state: any, dispatch: any }) {
  if (state.phase !== 'MULLIGAN') return null;
  
  const p1 = state.players[state.player1Id];
  const p2 = state.players[state.player2Id];
  const needsMulligan = !p1.mulliganKept ? p1 : !p2.mulliganKept ? p2 : null;
  
  if (!needsMulligan) return null;

  return (
    <div className="absolute inset-0 bg-slate-950/90 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-slate-900 p-8 rounded-xl border border-slate-700 shadow-2xl text-center max-w-md w-full">
        <h2 className="text-2xl font-bold text-white mb-2">{needsMulligan.name}</h2>
        <p className="text-slate-400 mb-8">Review your hand. You may mulligan once to shuffle your hand into your deck and redraw.</p>
        <div className="flex gap-4 justify-center">
          <button 
            onClick={() => dispatch({ type: 'KEEP_HAND', playerId: needsMulligan.id })}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-medium transition-colors"
          >
            Keep Hand
          </button>
          <button 
            onClick={() => dispatch({ type: 'MULLIGAN', playerId: needsMulligan.id })}
            className="px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
          >
            Mulligan
          </button>
        </div>
      </div>
    </div>
  );
}

function TransitionModal({ state, dispatch }: { state: any, dispatch: any }) {
  if (state.phase !== 'TURN_TRANSITION' && state.phase !== 'INIT') return null;
  
  const title = state.phase === 'INIT' ? 'Game Ready' : `Turn ${state.turnNumber}`;
  const subtitle = state.phase === 'INIT' ? 'Press start to begin.' : `Pass device to ${state.players[state.activePlayerId].name}.`;

  const handleStart = () => {
    if (state.phase === 'INIT') {
      dispatch({ type: 'START_GAME' });
    } else {
      dispatch({ type: 'ACKNOWLEDGE_TRANSITION' });
    }
  };

  return (
    <div className="absolute inset-0 bg-slate-950/95 flex items-center justify-center z-50 backdrop-blur-md">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-white tracking-widest uppercase mb-4">{title}</h1>
        <p className="text-xl text-slate-400 mb-12">{subtitle}</p>
        <button 
          onClick={handleStart}
          className="px-10 py-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xl rounded-lg font-medium transition-transform active:scale-95"
        >
          {state.phase === 'INIT' ? 'Begin Game' : 'Start Turn'}
        </button>
      </div>
    </div>
  );
}

function RollModal({ state, dispatch }: { state: any, dispatch: any }) {
  if (state.phase !== 'ROLL' && state.phase !== 'ALLOCATE') return null;
  const activePlayer = state.players[state.activePlayerId];

  const handleRoll = () => dispatch({ type: 'ROLL_DICE' });
  
  // Allocate
  const [allocs, setAllocs] = useState<Record<string, number>>({});
  let totalAllocated = 0;
  for (const v of Object.values(allocs)) {
    totalAllocated += (v as number);
  }
  const remaining = (state.pendingRoll || 0) - totalAllocated;

  const handleAllocate = (el: string, delta: number) => {
    const cur = allocs[el] || 0;
    if (delta > 0 && remaining <= 0) return;
    if (delta < 0 && cur <= 0) return;
    setAllocs({ ...allocs, [el]: cur + delta });
  };

  const submitAllocations = () => {
    if (remaining !== 0) return;
    dispatch({ type: 'ALLOCATE_RESOURCES', allocations: allocs });
    setAllocs({}); // reset for next time
  };

  return (
    <div className="absolute inset-0 bg-slate-950/80 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-slate-900 p-8 rounded-xl border border-slate-700 shadow-2xl text-center max-w-md w-full">
        {state.phase === 'ROLL' ? (
          <>
            <h2 className="text-3xl font-bold text-white mb-8">Resource Phase</h2>
            <button 
              onClick={handleRoll}
              className="px-8 py-4 bg-amber-600 hover:bg-amber-500 text-white text-xl rounded-lg font-medium transition-transform active:scale-95"
            >
              Roll Resource Dice
            </button>
          </>
        ) : (
          <>
            <h2 className="text-3xl font-bold text-white mb-2">Rolled a {state.pendingRoll}</h2>
            <p className="text-slate-400 mb-6">Allocate {remaining} more points to your elements.</p>
            
            <div className="flex flex-col gap-4 mb-8">
              {activePlayer.leader.elements.map((el: string) => (
                <div key={el} className="flex items-center justify-between bg-slate-800 p-3 rounded-lg border border-slate-700">
                  <span className="font-bold text-lg text-slate-200">{el}</span>
                  <div className="flex items-center gap-4">
                    <button onClick={() => handleAllocate(el, -1)} className="w-8 h-8 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold">-</button>
                    <span className="w-4 font-mono text-lg">{allocs[el] || 0}</span>
                    <button onClick={() => handleAllocate(el, 1)} className="w-8 h-8 rounded bg-slate-700 hover:bg-slate-600 text-white font-bold">+</button>
                  </div>
                </div>
              ))}
            </div>

            <button 
              onClick={submitAllocations}
              disabled={remaining !== 0}
              className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-lg rounded-lg font-medium transition-colors"
            >
              Confirm Allocations
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function GameOverModal({ state }: { state: any }) {
  if (!state.winner) return null;
  const winner = state.players[state.winner!];
  
  return (
    <div className="absolute inset-0 bg-slate-950/95 flex items-center justify-center z-50 backdrop-blur-md">
      <div className="text-center">
        <h1 className="text-6xl font-bold text-amber-500 uppercase mb-4 tracking-widest">Victory</h1>
        <p className="text-3xl text-white mb-12">{winner.name} has won the match!</p>
        <button 
          onClick={() => window.location.reload()}
          className="px-8 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors"
        >
          Play Again
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [state, dispatch] = useReducer(gameReducer, null, initialGameState);

  return (
    <div className="relative w-full h-screen font-sans">
      <Board gameState={state} dispatch={dispatch} />
      
      <TransitionModal state={state} dispatch={dispatch} />
      <MulliganModal state={state} dispatch={dispatch} />
      <RollModal state={state} dispatch={dispatch} />
      <GameOverModal state={state} />
    </div>
  );
}
