import React from 'react';
import { GameCard, GameState } from '../types';
import { CardView } from './CardView';
import { canAfford, lurkProtected, GameAction } from '../game/engine';
import { keywordValue } from '../game/cards';
import { cn } from '../lib/utils';

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

/** Punchy center-screen toast that fires whenever a new game action hits the log. */
function ActionToast({ log }: { log: string[] }) {
  const [toast, setToast] = React.useState<{ msg: string; id: number } | null>(null);
  const lastLen = React.useRef(log.length);
  React.useEffect(() => {
    if (log.length > lastLen.current) {
      const msg = log[log.length - 1];
      // Skip pure bookkeeping lines to keep the banner meaningful.
      if (!/^---/.test(msg)) setToast({ msg, id: log.length });
    }
    lastLen.current = log.length;
  }, [log.length]);
  // Auto-dismiss so a stale toast doesn't linger over the board.
  React.useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast?.id]);
  if (!toast) return null;
  const isCombat = /destroyed|Pierced|Reaped|attack|Withered|damage/i.test(toast.msg);
  return (
    <div key={toast.id} className="absolute left-1/2 top-[38%] -translate-x-1/2 z-40 pointer-events-none action-toast">
      <div className={cn(
        'heading-font text-sm px-4 py-2 ink-border-md shadow-hard-black-sm max-w-md text-center',
        isCombat ? 'bg-[#E53935] text-[#F7F7F7]' : 'bg-[#FFD54F] text-[#1A1A1A]'
      )}>
        {toast.msg}
      </div>
    </div>
  );
}

export function Board({ gameState, dispatch }: BoardProps) {
  const { viewingPlayerId, activePlayerId, phase, combat } = gameState;
  const viewer = gameState.players[viewingPlayerId];
  const opponent = gameState.players[viewingPlayerId === gameState.player1Id ? gameState.player2Id : gameState.player1Id];
  const isViewingActive = viewingPlayerId === activePlayerId;
  const isViewingDefender = phase === 'COMBAT_BLOCK' && viewingPlayerId !== activePlayerId;

  const [selectedAttackerId, setSelectedAttackerId] = React.useState<string | null>(null);
  const [lastAttackerId, setLastAttackerId] = React.useState<string | null>(null); // most recent declared attacker (for retargeting)
  const [pendingCardId, setPendingCardId] = React.useState<string | null>(null); // targeting mode
  const [commandMode, setCommandMode] = React.useState(false); // Leader Command targeting
  const [viewingGraveyardPlayerId, setViewingGraveyardPlayerId] = React.useState<string | null>(null);

  const pendingCard = pendingCardId 
    ? (viewer.hand.find((c) => c.instanceId === pendingCardId) || viewer.board.find((c) => c.instanceId === pendingCardId) || (viewer.leader.instanceId === pendingCardId ? viewer.leader : null) || viewer.locations.find((c) => c.instanceId === pendingCardId)) 
    : null;
  const isPendingCardOnBoard = pendingCard && viewer.hand.findIndex((c) => c.instanceId === pendingCard.instanceId) === -1;

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

    // Targeting mode for Items / Events / Abilities
    if (pendingCard) {
      const actionType = isPendingCardOnBoard ? 'ACTIVATE_ABILITY' : 'PLAY_CARD';
      const wantsFriendly = pendingCard.type === 'Item' || pendingCard.effect?.target === 'friendly';
      if (wantsFriendly && !isOpponent && card.type === 'Unit') {
        dispatch({ type: actionType, instanceId: pendingCard.instanceId, targetId: card.instanceId });
        setPendingCardId(null);
        return;
      }
      if (!wantsFriendly && isOpponent && card.type === 'Unit') {
        dispatch({ type: actionType, instanceId: pendingCard.instanceId, targetId: card.instanceId });
        setPendingCardId(null);
        return;
      }
      // Events may also legally target Leaders (§2.1/§3): e.g. Purge your own
      // Leader to strip hostile Charms, or aim damage/freeze at the enemy
      // Leader. The engine validates Guard/Lurk/Ward and rejects if illegal.
      if (!wantsFriendly && (pendingCard.type === 'Event' || isPendingCardOnBoard) && card.type === 'Leader') {
        dispatch({ type: actionType, instanceId: pendingCard.instanceId, targetId: card.instanceId });
        setPendingCardId(null);
        return;
      }
      return;
    }

    if (phase === 'ACTION' && isViewingActive && !isOpponent && card.effect && !card.glitched &&
        card.frozen === 0 && !card.abilityUsedThisTurn) {
      if (['unit', 'friendly'].includes(card.effect.target || '')) {
        setPendingCardId(card.instanceId);
      } else {
        dispatch({ type: 'ACTIVATE_ABILITY', instanceId: card.instanceId });
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
        const already = combat?.attackers.some((a) => a.instanceId === card.instanceId);
        dispatch({ type: 'TOGGLE_ATTACKER', instanceId: card.instanceId, targetId: opponent.leader.instanceId });
        setLastAttackerId(already ? null : card.instanceId);
      } else if (card.type === 'Unit') {
        // Retarget the most recently declared attacker at this enemy Unit;
        // if none is declared, send the Leader at it (§5.2 Leader vs Unit).
        const src =
          lastAttackerId && combat?.attackers.some((a) => a.instanceId === lastAttackerId)
            ? lastAttackerId
            : !viewer.leader.exhausted && viewer.leader.frozen === 0
              ? viewer.leader.instanceId
              : null;
        if (!src) return;
        const already = combat?.attackers.find((a) => a.instanceId === src);
        if (already) dispatch({ type: 'TOGGLE_ATTACKER', instanceId: src, targetId: already.targetId });
        dispatch({ type: 'TOGGLE_ATTACKER', instanceId: src, targetId: card.instanceId });
        setLastAttackerId(src);
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
        } else if (!selectedAttackerId) {
          // Clicking an already-assigned blocker with no attacker selected unassigns it.
          const assignment = combat?.blockers.find((b) => b.blockerId === card.instanceId);
          if (assignment) dispatch({ type: 'TOGGLE_BLOCKER', attackerId: assignment.attackerId, blockerId: card.instanceId });
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

  // Surface castable Graveborn units so the player doesn't forget the mechanic.
  const hasCastableGraveborn =
    phase === 'ACTION' && isViewingActive &&
    viewer.graveyard.some(
      (c) => c.type === 'Unit' && c.keywords?.some((k) => k.split(' ')[0] === 'Graveborn') && canAfford(c.cost, viewer.resources)
    );

  const popBtn = 'btn-pop heading-font text-xs px-4 py-2 ink-border-sm shadow-hard-black-xs transition-colors';

  return (
    <div className="flex flex-col h-screen bg-[#F7F7F7] text-[#1A1A1A] overflow-hidden">
      <ActionToast log={gameState.log} />

      {/* Opponent Area — pt-12 clears the fixed CONCEDE/RULES/LOG bar at top-left */}
      <div className="flex-1 flex flex-col px-3 pb-3 pt-12 relative min-h-0 bg-[#2C3E50]">
        <div className="flex justify-between items-start">
          <div className="flex gap-3 items-start">
            <CardView card={opponent.leader} compact gameState={gameState}
              onClick={() => handleUnitClick(opponent.leader, true)}
              targetable={!!targetingEnemy && (pendingCard?.type === 'Event' || !!isPendingCardOnBoard)}
            />
            <div className="flex gap-1.5 flex-wrap">
              {opponent.board.map((u) => {
                const isAttackTarget = phase === 'COMBAT_DECLARE' && combat?.attackers.some((a) => a.targetId === u.instanceId);
                return (
                  <div key={u.instanceId} className="relative">
                    <CardView card={u} compact gameState={gameState}
                      onClick={() => handleUnitClick(u, true)}
                      targetable={!!targetingEnemy && u.type === 'Unit' && !lurkProtected(u)}
                      selected={selectedAttackerId === u.instanceId || isAttacker(u.instanceId)}
                    />
                    {isAttackTarget && <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[9px] font-black bg-[#E53935] text-[#F7F7F7] px-1 ink-border-sm pointer-events-none">⚔ TARGET</div>}
                  </div>
                );
              })}
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
          {gameState.log.length > 0 && (
            <div className="flex flex-col gap-1 w-full max-w-md items-center pointer-events-none">
              {gameState.log.slice(-3).map((logMsg, i, arr) => (
                <div key={`${gameState.log.length - arr.length + i}`} 
                     className={cn(
                       "text-[10px] font-bold text-[#1A1A1A] bg-[#F7F7F7]/90 px-2 py-0.5 ink-border-sm w-full truncate text-center transition-opacity",
                       i === arr.length - 1 ? "opacity-100 scale-100" : "opacity-40 scale-95"
                     )} 
                     title={logMsg}>
                  {logMsg}
                </div>
              ))}
            </div>
          )}

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
                className={`${popBtn} bg-[#1A1A1A] text-[#FFD54F] hover:bg-[#2C3E50]`}
                title={viewer.hand.length > 7 ? `You will discard ${viewer.hand.length - 7} card(s) down to the 7-card hand limit.` : undefined}>
                END TURN {viewer.hand.length > 7 ? `(DISCARD ${viewer.hand.length - 7})` : ''}&gt;
              </button>
            </div>
          )}

          {phase === 'COMBAT_DECLARE' && isViewingActive && (
            <div className="flex gap-3 items-center">
              <span className="text-[10px] font-bold max-w-52">Click your Units/Leader to attack the enemy Leader. Then click an enemy Unit to redirect your last attacker at it.</span>
              <button onClick={() => dispatch({ type: 'SUBMIT_ATTACKS' })}
                className={`${popBtn} bg-[#E53935] text-[#F7F7F7]`}>
                {(combat?.attackers.length ?? 0) > 0 ? `CONFIRM ATTACKS (${combat!.attackers.length})` : 'CANCEL COMBAT'}
              </button>
            </div>
          )}

          {phase === 'COMBAT_BLOCK' && isViewingDefender && (
            <div className="flex gap-3 items-center">
              <span className="text-[10px] font-bold max-w-52">Select an attacker, then a blocker. Multiple blockers may gang up on one attacker.</span>
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
              targetable={!!targetingEnemy && pendingCard?.effect?.action === 'purge'}
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
                    {blockedBy && <div className="absolute bottom-6 left-1/2 -translate-x-1/2 text-[9px] font-black bg-[#2C3E50] text-[#F7F7F7] px-1 ink-border-sm pointer-events-none">BLOCKING</div>}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="text-right shrink-0 bg-[#1A1A1A] text-[#F7F7F7] ink-border-md shadow-hard-black-sm px-4 py-2">
            <div className="heading-font text-sm text-[#FFD54F]">{viewer.name} {viewer.id === activePlayerId ? '· ACTIVE' : ''}</div>
            <div className="heading-font text-2xl text-[#E53935]">{viewer.health} HP</div>
            <div className="text-[10px] font-bold mt-1 text-[#F7F7F7]/70">
              DECK {viewer.deck.length} · <button onClick={() => setViewingGraveyardPlayerId(viewer.id)}
                className={cn('underline text-[#FFD54F] font-black hover:text-[#F7F7F7] cursor-pointer', hasCastableGraveborn && 'animate-pulse bg-[#E53935] text-[#F7F7F7] px-1')}>
                GY {viewer.graveyard.length}{hasCastableGraveborn ? ' ⭐' : ''}
              </button>
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
