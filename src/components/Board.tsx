import React from 'react';
import { GameCard, GameState } from '../types';
import { CardView } from './CardView';
import { canAfford, GameAction } from '../game/engine';
import { keywordValue } from '../game/cards';

interface BoardProps {
  gameState: GameState;
  dispatch: React.Dispatch<GameAction>;
}

/** Which hand cards require the player to pick a target before playing. */
function needsTarget(card: GameCard): boolean {
  if (card.type === 'Item') return true;
  // Wildcast Events pick their own random targets — no manual selection.
  if (card.keywords?.some((k) => k.split(' ')[0] === 'Wildcast')) return false;
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
  const [commandMode, setCommandMode] = React.useState(false); // Leader Command targeting
  const [viewingGraveyardPlayerId, setViewingGraveyardPlayerId] = React.useState<string | null>(null);

  const pendingCard = pendingCardId ? viewer.hand.find((c) => c.instanceId === pendingCardId) : null;

  const kwActive = (card: GameCard, kw: string) => {
    if (card.glitched) return false;
    return !!card.keywords?.some((k) => k.split(' ')[0] === kw);
  };

  const commandCost = keywordValue(viewer.leader, 'Command');
  const canCommand =
    phase === 'ACTION' && isViewingActive && commandCost > 0 &&
    canAfford({ Generic: commandCost }, viewer.resources) && viewer.board.length > 0;

  const handleHandClick = (card: GameCard) => {
    if (phase !== 'ACTION' || !isViewingActive) return;
    if (!canAfford(card.cost, viewer.resources)) return;
    setCommandMode(false);
    if (needsTarget(card)) {
      setPendingCardId(pendingCardId === card.instanceId ? null : card.instanceId);
    } else {
      dispatch({ type: 'PLAY_CARD', instanceId: card.instanceId });
    }
  };

  const handleUnitClick = (card: GameCard, isOpponent: boolean) => {
    // Leader Command targeting (§2.1 Command [X])
    if (commandMode && !isOpponent && card.type === 'Unit') {
      dispatch({ type: 'LEADER_COMMAND', targetId: card.instanceId });
      setCommandMode(false);
      return;
    }

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
    if (phase === 'COMBAT_DECLARE' && isViewingActive) {
      if (!isOpponent) {
        if (card.frozen > 0) return;
        const isUnit = card.type === 'Unit';
        if (isUnit && (card.summoningSickness || (card.exhausted && card.attacksThisTurn >= (card.keywords?.some((k) => k.startsWith('Overdrive')) ? 2 : 1)))) return;
        if (card.type === 'Leader' && card.exhausted) return;
        dispatch({ type: 'TOGGLE_ATTACKER', instanceId: card.instanceId, targetId: opponent.leader.instanceId });
      } else if (card.type === 'Unit') {
        // Leader vs Unit combat (§5.2): click an enemy Unit to send your
        // Leader at it instead of the enemy Leader.
        if (!viewer.leader.exhausted && viewer.leader.frozen === 0) {
          const already = combat?.attackers.find((a) => a.instanceId === viewer.leader.instanceId);
          if (already) dispatch({ type: 'TOGGLE_ATTACKER', instanceId: viewer.leader.instanceId, targetId: already.targetId });
          dispatch({ type: 'TOGGLE_ATTACKER', instanceId: viewer.leader.instanceId, targetId: card.instanceId });
        }
      }
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

  const popBtn = 'btn-pop heading-font text-xs px-4 py-2 ink-border-sm shadow-hard-black-xs transition-colors';

  return (
    <div className="flex flex-col h-screen bg-[#F7F7F7] text-[#1A1A1A] overflow-hidden">
      {/* Opponent Area */}
      <div className="flex-1 flex flex-col p-3 relative min-h-0 bg-[#2C3E50]">
        <div className="flex justify-between items-start">
          <div className="flex gap-3 items-start">
            <CardView card={opponent.leader} compact gameState={gameState}
              onClick={() => handleUnitClick(opponent.leader, true)}
              targetable={false}
            />
            <div className="flex gap-1.5 flex-wrap">
              {opponent.board.map((u) => (
                <CardView key={u.instanceId} card={u} compact gameState={gameState}
                  onClick={() => handleUnitClick(u, true)}
                  targetable={!!targetingEnemy && u.type === 'Unit' && !(kwActive(u, 'Lurk') && !kwActive(u, 'Guard'))}
                  selected={selectedAttackerId === u.instanceId || isAttacker(u.instanceId)}
                />
              ))}
            </div>
          </div>
          <div className="text-right shrink-0 bg-[#F7F7F7] ink-border-md shadow-hard-black-sm px-4 py-2">
            <div className="heading-font text-sm">{opponent.name}</div>
            <div className="heading-font text-2xl text-[#E53935]">{opponent.health} HP</div>
            <div className="text-[#2C3E50] text-[10px] font-bold mt-1">
              HAND {opponent.hand.length} · DECK {opponent.deck.length} · <button onClick={() => setViewingGraveyardPlayerId(opponent.id)} className="underline text-[#E53935] font-black hover:text-[#1A1A1A] cursor-pointer">GY {opponent.graveyard.length}</button>
            </div>
            <div className="text-[#2C3E50] text-[10px] font-bold">LOCATIONS SET: {opponent.locations.length}</div>
            {opponent.charms.length > 0 && (
              <div className="text-[10px] font-bold bg-[#FFD54F] px-1 mt-1 inline-block">
                CHARMS: {opponent.charms.map((c) => `${c.name} (${c.charmDuration}T)`).join(', ')}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Center Zone */}
      <div className="min-h-32 bg-[#FFD54F] border-y-4 border-[#1A1A1A] flex items-center justify-between px-6 py-2 gap-4 relative">
        <div className="absolute inset-0 halftone-pattern pointer-events-none" />
        {/* Active location */}
        <div className="w-44 shrink-0 z-10">
          {activeLoc ? (
            <div className="flex items-center gap-2">
              <CardView card={activeLoc} compact gameState={gameState} />
              <div className="text-[9px] font-black heading-font bg-[#1A1A1A] text-[#FFD54F] px-1.5 py-1">
                ACTIVE LOCATION<br />
                <span className="text-[#F7F7F7]">{gameState.players[gameState.activeLocationOwnerId!]?.name} CONTROLS</span>
              </div>
            </div>
          ) : (
            <div className="text-[10px] font-black heading-font text-[#1A1A1A] opacity-60">NO ACTIVE LOCATION</div>
          )}
        </div>

        <div className="flex flex-col items-center gap-2 flex-1 z-10">
          <div className="heading-font text-sm bg-[#1A1A1A] text-[#FFD54F] px-3 py-0.5">
            TURN {gameState.turnNumber} · {phase.replace('_', ' ')}
          </div>

          {pendingCard && (
            <div className="text-[11px] font-bold bg-[#E53935] text-[#F7F7F7] px-2 py-0.5 ink-border-sm">
              SELECT A {targetingFriendly ? 'FRIENDLY' : 'ENEMY'} UNIT FOR {pendingCard.name.toUpperCase()} ·{' '}
              <button className="underline" onClick={() => setPendingCardId(null)}>CANCEL</button>
            </div>
          )}
          {commandMode && (
            <div className="text-[11px] font-bold bg-[#E53935] text-[#F7F7F7] px-2 py-0.5 ink-border-sm">
              COMMAND: SELECT A FRIENDLY UNIT TO READY ·{' '}
              <button className="underline" onClick={() => setCommandMode(false)}>CANCEL</button>
            </div>
          )}

          {phase === 'ACTION' && isViewingActive && (
            <div className="flex gap-3 flex-wrap justify-center">
              {gameState.turnNumber > 1 && (
                <button onClick={() => dispatch({ type: 'ENTER_COMBAT' })}
                  className={`${popBtn} bg-[#E53935] text-[#F7F7F7] hover:bg-[#1A1A1A]`}>
                  ⚔ ENTER COMBAT
                </button>
              )}
              {canCommand && (
                <button onClick={() => { setCommandMode(!commandMode); setPendingCardId(null); }}
                  className={`${popBtn} bg-[#2C3E50] text-[#FFD54F] hover:bg-[#1A1A1A]`}>
                  ★ COMMAND {commandCost}
                </button>
              )}
              <button onClick={() => dispatch({ type: 'END_TURN' })}
                className={`${popBtn} bg-[#1A1A1A] text-[#FFD54F] hover:bg-[#2C3E50]`}>
                END TURN &gt;
              </button>
            </div>
          )}

          {phase === 'COMBAT_DECLARE' && isViewingActive && (
            <div className="flex gap-3 items-center">
              <span className="text-[10px] font-bold max-w-52">Click your Units/Leader to attack the enemy Leader. Click an enemy Unit to send your Leader at it.</span>
              <button onClick={() => dispatch({ type: 'SUBMIT_ATTACKS' })}
                className={`${popBtn} bg-[#E53935] text-[#F7F7F7]`}>
                {(combat?.attackers.length ?? 0) > 0 ? `CONFIRM ATTACKS (${combat!.attackers.length})` : 'CANCEL COMBAT'}
              </button>
            </div>
          )}

          {phase === 'COMBAT_BLOCK' && isViewingDefender && (
            <div className="flex gap-3 items-center">
              <span className="text-[10px] font-bold">Select an attacker, then your blocker.</span>
              <button onClick={() => dispatch({ type: 'SUBMIT_BLOCKS' })}
                className={`${popBtn} bg-[#2C3E50] text-[#F7F7F7]`}>
                CONFIRM BLOCKS
              </button>
            </div>
          )}

          {phase === 'COMBAT_BLOCK' && !isViewingDefender && (
            <div className="text-[11px] font-bold">WAITING FOR DEFENDER TO ASSIGN BLOCKS…</div>
          )}
        </div>

        {/* Viewer's own face-down locations */}
        <div className="w-44 shrink-0 flex justify-end gap-1 z-10">
          {viewer.locations.map((loc, i) => <CardView key={i} card={loc} faceDown compact className="scale-75 origin-right" />)}
        </div>
      </div>

      {/* Viewer Area */}
      <div className="flex-1 flex flex-col p-3 relative min-h-0 bg-[#F7F7F7]">
        <div className="flex justify-between items-start">
          <div className="flex gap-3 items-start">
            <CardView card={viewer.leader} compact gameState={gameState}
              onClick={() => handleUnitClick(viewer.leader, false)}
              selected={isAttacker(viewer.leader.instanceId)}
            />
            <div className="flex gap-1.5 flex-wrap">
              {viewer.board.map((u) => {
                const blockedBy = blockAssignedTo(u.instanceId);
                return (
                  <div key={u.instanceId} className="relative">
                    <CardView card={u} compact gameState={gameState}
                      onClick={() => handleUnitClick(u, false)}
                      targetable={(!!targetingFriendly || commandMode) && u.type === 'Unit'}
                      selected={isAttacker(u.instanceId) || isBlocker(u.instanceId)}
                    />
                    {blockedBy && <div className="absolute -bottom-4 left-0 right-0 text-center text-[9px] font-black text-[#2C3E50]">BLOCKING</div>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="text-right shrink-0 bg-[#1A1A1A] text-[#F7F7F7] ink-border-md shadow-hard-black-sm px-4 py-2">
            <div className="heading-font text-sm text-[#FFD54F]">{viewer.name} {viewer.id === activePlayerId ? '· ACTIVE' : ''}</div>
            <div className="heading-font text-2xl text-[#E53935]">{viewer.health} HP</div>
            <div className="text-[10px] font-bold mt-1 text-[#F7F7F7]/70">
              DECK {viewer.deck.length} · <button onClick={() => setViewingGraveyardPlayerId(viewer.id)} className="underline text-[#FFD54F] font-black hover:text-[#F7F7F7] cursor-pointer">GY {viewer.graveyard.length}</button>
            </div>
            {viewer.charms.length > 0 && (
              <div className="text-[10px] font-bold bg-[#FFD54F] text-[#1A1A1A] px-1 mt-1 inline-block">
                CHARMS: {viewer.charms.map((c) => `${c.name} (${c.charmDuration}T)`).join(', ')}
              </div>
            )}
            <div className="mt-2 flex gap-1 justify-end flex-wrap max-w-xs">
              {Object.entries(viewer.resources).map(([el, amt]) => amt > 0 && (
                <div key={el} className="px-1.5 py-0.5 bg-[#FFD54F] text-[#1A1A1A] text-[10px] font-black heading-font">{amt} {el.toUpperCase()}</div>
              ))}
              {Object.values(viewer.resources).every((v) => !v) && <div className="text-[10px] font-bold text-[#F7F7F7]/50">NO RESOURCES</div>}
            </div>
          </div>
        </div>

        {/* Hand */}
        <div className="mt-auto flex justify-center gap-2 overflow-x-auto pb-1 pt-3">
          {viewer.hand.map((card) => {
            const isPlayable = phase === 'ACTION' && isViewingActive && canAfford(card.cost, viewer.resources);
            return (
              <CardView key={card.instanceId} card={card} compact gameState={gameState}
                playable={isPlayable}
                selected={pendingCardId === card.instanceId}
                onClick={() => handleHandClick(card)}
                className={`hover:-translate-y-4 z-10 hover:z-20 shrink-0 ${phase === 'ACTION' && isViewingActive && !isPlayable ? 'opacity-50 saturate-50' : ''}`}
              />
            );
          })}
          {viewer.hand.length === 0 && <div className="text-[#2C3E50] font-bold text-sm self-center">EMPTY HAND</div>}
        </div>
      </div>

      {/* Graveyard Modal Overlay */}
      {(() => {
        const gyPlayer = viewingGraveyardPlayerId ? gameState.players[viewingGraveyardPlayerId] : null;
        if (!gyPlayer) return null;
        return (
          <div className="absolute inset-0 bg-[#1A1A1A]/90 flex items-center justify-center z-50 p-4">
            <div className="bg-[#F7F7F7] text-[#1A1A1A] p-6 ink-border-md shadow-hard-yellow text-center max-w-4xl w-full flex flex-col max-h-[85vh]">
              <div className="flex justify-between items-center mb-4 border-b-4 border-[#1A1A1A] pb-2">
                <h2 className="text-2xl heading-font">{gyPlayer.name}'s Graveyard</h2>
                <button onClick={() => setViewingGraveyardPlayerId(null)} className="btn-pop bg-[#E53935] text-[#F7F7F7] px-3 py-1 font-black ink-border-sm heading-font">
                  Close [X]
                </button>
              </div>
              <div className="flex-1 overflow-y-auto flex gap-4 flex-wrap justify-center p-2">
                {gyPlayer.graveyard.map((card, idx) => {
                  const isPlayableGraveborn =
                    viewingGraveyardPlayerId === activePlayerId &&
                    phase === 'ACTION' &&
                    isViewingActive &&
                    card.type === 'Unit' &&
                    card.keywords?.some((k) => k.split(' ')[0] === 'Graveborn') &&
                    canAfford(card.cost, viewer.resources);

                  return (
                    <div key={card.instanceId + '_' + idx} className="flex flex-col items-center gap-2 bg-[#F7F7F7] p-2 ink-border-sm shadow-hard-black-xs relative">
                      <CardView card={card} compact gameState={gameState} />
                      {isPlayableGraveborn ? (
                        <button
                          onClick={() => {
                            dispatch({ type: 'PLAY_CARD', instanceId: card.instanceId });
                            setViewingGraveyardPlayerId(null);
                          }}
                          className="btn-pop px-3 py-1 bg-[#FFD54F] text-[#1A1A1A] font-black text-xs ink-border-sm shadow-hard-black-xs animate-bounce"
                        >
                          Graveborn Cast
                        </button>
                      ) : (
                        <div className="text-[9px] font-mono font-bold text-[#2C3E50]/60 uppercase mt-1">
                          {card.keywords?.some((k) => k.split(' ')[0] === 'Graveborn') ? '⭐ Graveborn' : card.type}
                        </div>
                      )}
                    </div>
                  );
                })}
                {gyPlayer.graveyard.length === 0 && (
                  <div className="text-[#2C3E50] font-black text-sm my-10">GRAVEYARD IS EMPTY</div>
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
