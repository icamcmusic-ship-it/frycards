import React from 'react';
import { GameCard, PlayerState, GameState } from '../types';
import { CardView } from './CardView';
import { canAfford } from '../game/engine';

interface BoardProps {
  gameState: GameState;
  dispatch: React.Dispatch<any>;
}

export function Board({ gameState, dispatch }: BoardProps) {
  const { viewingPlayerId, activePlayerId, phase, combat } = gameState;
  const viewer = gameState.players[viewingPlayerId];
  const opponent = gameState.players[viewingPlayerId === gameState.player1Id ? gameState.player2Id : gameState.player1Id];
  const isViewingActive = viewingPlayerId === activePlayerId;
  const isViewingDefender = phase === 'COMBAT_BLOCK' && viewingPlayerId !== activePlayerId;

  const [selectedAttackerId, setSelectedAttackerId] = React.useState<string | null>(null);

  // Handlers
  const handlePlayCard = (instanceId: string) => {
    if (phase !== 'ACTION' || !isViewingActive) return;
    dispatch({ type: 'PLAY_CARD', instanceId });
  };

  const handleUnitClick = (card: GameCard, isOpponent: boolean) => {
    if (phase === 'COMBAT_DECLARE' && isViewingActive && !isOpponent) {
      if (card.exhausted || card.summoningSickness) return;
      dispatch({ type: 'TOGGLE_ATTACKER', instanceId: card.instanceId, targetId: opponent.leader.instanceId }); // Simplification: assume attacking leader
    }
    
    if (phase === 'COMBAT_BLOCK' && isViewingDefender) {
      if (isOpponent) {
        // Clicking an attacking unit selects it
        const isAttacking = combat?.attackers.some(a => a.instanceId === card.instanceId);
        if (isAttacking) {
          setSelectedAttackerId(selectedAttackerId === card.instanceId ? null : card.instanceId);
        }
      } else {
        // Clicking own unit to block the selected attacker
        if (selectedAttackerId && !card.exhausted) {
          dispatch({ type: 'TOGGLE_BLOCKER', attackerId: selectedAttackerId, blockerId: card.instanceId });
          setSelectedAttackerId(null);
        }
      }
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      
      {/* Opponent Area */}
      <div className="flex-1 flex flex-col border-b border-slate-800/50 p-4 relative">
        <div className="absolute top-4 left-4 flex gap-4">
          <CardView card={opponent.leader} />
          <div className="flex gap-2">
            {opponent.board.map(u => (
              <CardView 
                key={u.instanceId} 
                card={u} 
                onClick={() => handleUnitClick(u, true)}
                selected={
                  (phase === 'COMBAT_BLOCK' && selectedAttackerId === u.instanceId) || 
                  combat?.attackers.some(a => a.instanceId === u.instanceId) || 
                  combat?.attackers.some(a => a.targetId === u.instanceId) || 
                  combat?.blockers.some(b => b.attackerId === u.instanceId)
                }
              />
            ))}
          </div>
        </div>
        <div className="absolute top-4 right-4 text-right">
          <div className="text-xl font-bold text-slate-100">{opponent.name}</div>
          <div className="text-rose-500 font-mono text-2xl mt-1">{opponent.health} HP</div>
          <div className="text-slate-500 text-sm mt-2">Cards in Hand: {opponent.hand.length}</div>
        </div>
      </div>

      {/* Center Zone */}
      <div className="h-32 bg-slate-900/40 border-y border-slate-800 flex items-center justify-between px-8">
        <div className="flex gap-2">
           {/* Locations */}
           {viewer.locations.slice(0, 2).map((loc, i) => (
             <CardView key={i} card={loc} faceDown />
           ))}
        </div>
        
        <div className="flex flex-col items-center gap-3">
          <div className="text-xl font-semibold tracking-widest text-slate-400 uppercase">
             Phase: <span className="text-emerald-400">{phase}</span>
          </div>
          
          {phase === 'ACTION' && isViewingActive && (
            <div className="flex gap-3">
               <button 
                 onClick={() => dispatch({ type: 'ENTER_COMBAT' })}
                 className="px-6 py-2 bg-rose-600/20 text-rose-400 hover:bg-rose-600/30 border border-rose-600/50 rounded-md font-medium transition-colors"
               >
                 Enter Combat
               </button>
               <button 
                 onClick={() => dispatch({ type: 'END_TURN' })}
                 className="px-6 py-2 bg-slate-800 hover:bg-slate-700 rounded-md font-medium transition-colors"
               >
                 End Turn
               </button>
            </div>
          )}
          
          {phase === 'COMBAT_DECLARE' && isViewingActive && (
             <button 
               onClick={() => dispatch({ type: 'SUBMIT_ATTACKS' })}
               className="px-6 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-md font-medium transition-colors"
             >
               Confirm Attacks ({combat?.attackers.length})
             </button>
          )}

          {phase === 'COMBAT_BLOCK' && isViewingDefender && (
             <button 
               onClick={() => dispatch({ type: 'SUBMIT_BLOCKS' })}
               className="px-6 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-medium transition-colors"
             >
               Confirm Blocks
             </button>
          )}
        </div>
      </div>

      {/* Viewer Area */}
      <div className="flex-1 flex flex-col p-4 relative">
        <div className="absolute top-4 left-4 flex gap-4">
          <CardView 
            card={viewer.leader} 
            onClick={() => handleUnitClick(viewer.leader, false)}
            selected={combat?.attackers.some(a => a.instanceId === viewer.leader.instanceId)}
          />
          <div className="flex gap-2">
            {viewer.board.map(u => (
              <CardView 
                key={u.instanceId} 
                card={u} 
                onClick={() => handleUnitClick(u, false)}
                selected={combat?.attackers.some(a => a.instanceId === u.instanceId) || combat?.blockers.some(b => b.blockerId === u.instanceId)}
              />
            ))}
          </div>
        </div>
        
        <div className="absolute top-4 right-4 text-right">
          <div className="text-xl font-bold text-slate-100">{viewer.name} (You)</div>
          <div className="text-rose-500 font-mono text-2xl mt-1">{viewer.health} HP</div>
          
          <div className="mt-4 flex gap-2 justify-end">
             {Object.entries(viewer.resources).map(([el, amt]) => amt > 0 && (
               <div key={el} className="px-2 py-1 bg-slate-800 rounded text-sm font-mono border border-slate-700">
                 {amt} {el}
               </div>
             ))}
          </div>
        </div>

        <div className="mt-auto flex justify-center gap-2 max-w-full overflow-x-auto pb-4 pt-16 mask-linear">
          {viewer.hand.map(card => {
            const isPlayable = phase === 'ACTION' && isViewingActive && canAfford(card.cost, viewer.resources);
            return (
              <CardView 
                key={card.instanceId} 
                card={card} 
                playable={isPlayable}
                onClick={() => handlePlayCard(card.instanceId)}
                className="hover:-translate-y-6 z-10 hover:z-20 transform-gpu"
              />
            );
          })}
        </div>
      </div>

    </div>
  );
}
