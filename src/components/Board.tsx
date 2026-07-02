import React from 'react';
import { GameCard, GameState } from '../types';
import { CardView } from './CardView';
import { canAfford, GameAction } from '../game/engine';

interface BoardProps {
  gameState: GameState;
  dispatch: React.Dispatch<GameAction>;
}

/** Which hand cards require the player to pick a target before playing. */
function needsTarget(card: GameCard): boolean {
  if (card.type === 'Item') return true;
  if (card.type === 'Event' && card.effect && (card.effect.target === 'unit' || card.effect.target === 'friendly')) return true;
  return false;
}

export function Board({ gameState, dispatch }: BoardProps) {
  const { viewingPlayerId, activePlayerId, phase, combat } = gameState;
  const viewer = gameState.players[viewingPlayerId];
  const opponent = gameState.players[viewingPlayerId === gameState.player1Id ? gameState.player2Id : gameState.player1Id];
  const isViewingActive = viewingPlayerId === activePlayerId;
  const isViewingDefender = phase === 'COMBAT_BLOCK' && viewingPlayerId !== activePlayerId;

  const [selectedAttackerId, setSelectedAttackerId] = React.useState<string | null>(null);
  const [pendingCardId, setPendingCardId] = React.useState<string | null>(null); // targeting mode

  const pendingCard = pendingCardId ? viewer.hand.find((c) => c.instanceId === pendingCardId) : null;

  const handleHandClick = (card: GameCard) => {
    if (phase !== 'ACTION' || !isViewingActive) return;
    if (!canAfford(card.cost, viewer.resources)) return;
    if (needsTarget(card)) {
      setPendingCardId(pendingCardId === card.instanceId ? null : card.instanceId);
    } else {
      dispatch({ type: 'PLAY_CARD', instanceId: card.instanceId });
    }
  };

  const handleUnitClick = (card: GameCard, isOpponent: boolean) => {
    // Targeting mode for Items / Events
    if (pendingCard) {
      const wantsFriendly = pendingCard.type === 'Item' || pendingCard.effect?.target === 'friendly';
      if (wantsFriendly && !isOpponent && card.type === 'Unit') {
        dispatch({ type: 'PLAY_CARD', instanceId: pendingCard.instanceId, targetId: card.instanceId });
        setPendingCardId(null);
        return;
      }
      if (!wantsFriendly && isOpponent && card.type === 'Unit') {
        dispatch({ type: 'PLAY_CARD', instanceId: pendingCard.instanceId, targetId: card.instanceId });
        setPendingCardId(null);
        return;
      }
      return;
    }

    // Declare attackers
    if (phase === 'COMBAT_DECLARE' && isViewingActive && !isOpponent) {
      if (card.frozen > 0) return;
      const isUnit = card.type === 'Unit';
      if (isUnit && (card.summoningSickness || (card.exhausted && card.attacksThisTurn >= (card.keywords?.some((k) => k === 'Overdrive' || k.startsWith('Overdrive')) ? 2 : 1)))) return;
      if (card.type === 'Leader' && card.exhausted) return;
      dispatch({ type: 'TOGGLE_ATTACKER', instanceId: card.instanceId, targetId: opponent.leader.instanceId });
      return;
    }

    // Blocking
    if (phase === 'COMBAT_BLOCK' && isViewingDefender) {
      if (isOpponent) {
        const isAttacking = combat?.attackers.some((a) => a.instanceId === card.instanceId);
        if (isAttacking) setSelectedAttackerId(selectedAttackerId === card.instanceId ? null : card.instanceId);
      } else {
        if (selectedAttackerId && !card.exhausted && card.frozen === 0 && card.type === 'Unit') {
          dispatch({ type: 'TOGGLE_BLOCKER', attackerId: selectedAttackerId, blockerId: card.instanceId });
          setSelectedAttackerId(null);
        }
      }
    }
  };

  const targetingFriendly = pendingCard && (pendingCard.type === 'Item' || pendingCard.effect?.target === 'friendly');
  const targetingEnemy = pendingCard && !targetingFriendly;

  const isAttacker = (id: string) => combat?.attackers.some((a) => a.instanceId === id);
  const isBlocker = (id: string) => combat?.blockers.some((b) => b.blockerId === id);
  const blockAssignedTo = (attackerId: string) => combat?.blockers.find((b) => b.attackerId === attackerId)?.blockerId;

  const activeLoc = gameState.activeLocation;

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-200 overflow-hidden font-sans">
      {/* Opponent Area */}
      <div className="flex-1 flex flex-col border-b border-slate-800/50 p-3 relative min-h-0">
        <div className="flex justify-between items-start">
          <div className="flex gap-3 items-start">
            <CardView card={opponent.leader} compact
              onClick={() => handleUnitClick(opponent.leader, true)}
              targetable={!!targetingEnemy && false}
            />
            <div className="flex gap-1.5 flex-wrap">
              {opponent.board.map((u) => (
                <CardView key={u.instanceId} card={u} compact
                  onClick={() => handleUnitClick(u, true)}
                  targetable={!!targetingEnemy && u.type === 'Unit'}
                  selected={selectedAttackerId === u.instanceId || isAttacker(u.instanceId)}
                />
              ))}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-slate-100">{opponent.name}</div>
            <div className="text-rose-500 font-mono text-2xl">{opponent.health} HP</div>
            <div className="text-slate-500 text-xs mt-1">Hand: {opponent.hand.length} · Deck: {opponent.deck.length} · GY: {opponent.graveyard.length}</div>
            <div className="text-slate-500 text-xs">Locations set: {opponent.locations.length}</div>
            {opponent.charms.length > 0 && <div className="text-fuchsia-400 text-xs">Charms: {opponent.charms.map((c) => c.name).join(', ')}</div>}
          </div>
        </div>
      </div>

      {/* Center Zone */}
      <div className="min-h-32 bg-slate-900/40 border-y border-slate-800 flex items-center justify-between px-6 py-2 gap-4">
        {/* Active location */}
        <div className="w-40 shrink-0">
          {activeLoc ? (
            <div className="flex items-center gap-2">
              <CardView card={activeLoc} compact />
              <div className="text-[10px] text-emerald-300">Active Location<br />(controlled by {gameState.players[gameState.activeLocationOwnerId!]?.name})</div>
            </div>
          ) : (
            <div className="text-xs text-slate-600">No active Location</div>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 flex-1">
          <div className="text-sm font-semibold tracking-widest text-slate-400 uppercase">
            Turn {gameState.turnNumber} · <span className="text-emerald-400">{phase}</span>
          </div>

          {pendingCard && (
            <div className="text-xs text-fuchsia-300">
              Select a {targetingFriendly ? 'friendly' : 'enemy'} unit for {pendingCard.name} ·{' '}
              <button className="underline" onClick={() => setPendingCardId(null)}>cancel</button>
            </div>
          )}

          {phase === 'ACTION' && isViewingActive && (
            <div className="flex gap-3">
              {gameState.turnNumber > 1 && (
                <button onClick={() => dispatch({ type: 'ENTER_COMBAT' })}
                  className="px-5 py-2 bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 border border-rose-600/50 rounded-md font-medium transition-colors">
                  Enter Combat
                </button>
              )}
              <button onClick={() => dispatch({ type: 'END_TURN' })}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-700 rounded-md font-medium transition-colors">
                End Turn
              </button>
            </div>
          )}

          {phase === 'COMBAT_DECLARE' && isViewingActive && (
            <div className="flex gap-3">
              <span className="text-xs text-slate-400 self-center">Click your units/leader to attack the enemy Leader.</span>
              <button onClick={() => dispatch({ type: 'SUBMIT_ATTACKS' })}
                className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-md font-medium transition-colors">
                Confirm Attacks ({combat?.attackers.length ?? 0})
              </button>
            </div>
          )}

          {phase === 'COMBAT_BLOCK' && isViewingDefender && (
            <div className="flex gap-3">
              <span className="text-xs text-slate-400 self-center">Select an attacker, then your blocker.</span>
              <button onClick={() => dispatch({ type: 'SUBMIT_BLOCKS' })}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md font-medium transition-colors">
                Confirm Blocks
              </button>
            </div>
          )}

          {phase === 'COMBAT_BLOCK' && !isViewingDefender && (
            <div className="text-xs text-slate-400">Waiting for defender to assign blocks…</div>
          )}
        </div>

        {/* Viewer's own face-down locations */}
        <div className="w-40 shrink-0 flex justify-end gap-1">
          {viewer.locations.map((loc, i) => <CardView key={i} card={loc} faceDown compact className="scale-75 origin-right" />)}
        </div>
      </div>

      {/* Viewer Area */}
      <div className="flex-1 flex flex-col p-3 relative min-h-0">
        <div className="flex justify-between items-start">
          <div className="flex gap-3 items-start">
            <CardView card={viewer.leader} compact
              onClick={() => handleUnitClick(viewer.leader, false)}
              selected={isAttacker(viewer.leader.instanceId)}
            />
            <div className="flex gap-1.5 flex-wrap">
              {viewer.board.map((u) => {
                const blockedBy = blockAssignedTo(u.instanceId);
                return (
                  <div key={u.instanceId} className="relative">
                    <CardView card={u}
                      onClick={() => handleUnitClick(u, false)}
                      targetable={!!targetingFriendly && u.type === 'Unit'}
                      selected={isAttacker(u.instanceId) || isBlocker(u.instanceId)}
                    />
                    {blockedBy && <div className="absolute -bottom-4 left-0 right-0 text-center text-[9px] text-blue-300">blocking</div>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-slate-100">{viewer.name} {viewer.id === activePlayerId ? '(active)' : ''}</div>
            <div className="text-rose-500 font-mono text-2xl">{viewer.health} HP</div>
            <div className="text-slate-500 text-xs mt-1">Deck: {viewer.deck.length} · GY: {viewer.graveyard.length}</div>
            {viewer.charms.length > 0 && <div className="text-fuchsia-400 text-xs">Charms: {viewer.charms.map((c) => c.name).join(', ')}</div>}
            <div className="mt-2 flex gap-1 justify-end flex-wrap max-w-xs">
              {Object.entries(viewer.resources).map(([el, amt]) => amt > 0 && (
                <div key={el} className="px-2 py-0.5 bg-slate-800 rounded text-xs font-mono border border-slate-700">{amt} {el}</div>
              ))}
              {Object.values(viewer.resources).every((v) => !v) && <div className="text-xs text-slate-600">no resources</div>}
            </div>
          </div>
        </div>

        {/* Hand */}
        <div className="mt-auto flex justify-center gap-2 overflow-x-auto pb-1 pt-2">
          {viewer.hand.map((card) => {
            const isPlayable = phase === 'ACTION' && isViewingActive && canAfford(card.cost, viewer.resources);
            return (
              <CardView key={card.instanceId} card={card} compact
                playable={isPlayable}
                selected={pendingCardId === card.instanceId}
                onClick={() => handleHandClick(card)}
                className="hover:-translate-y-4 z-10 hover:z-20 shrink-0"
              />
            );
          })}
          {viewer.hand.length === 0 && <div className="text-slate-600 text-sm self-center">Empty hand</div>}
        </div>
      </div>
    </div>
  );
}
