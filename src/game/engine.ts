import { GameState, GameCard, PlayerState, Phase, CombatState } from '../types';
import { createPlayer1Deck, createPlayer2Deck } from './cards';

export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'KEEP_HAND'; playerId: string }
  | { type: 'MULLIGAN'; playerId: string }
  | { type: 'START_TURN' }
  | { type: 'ROLL_DICE' }
  | { type: 'ALLOCATE_RESOURCES'; allocations: Record<string, number> }
  | { type: 'PLAY_CARD'; instanceId: string; targetId?: string }
  | { type: 'ENTER_COMBAT' }
  | { type: 'TOGGLE_ATTACKER'; instanceId: string; targetId: string }
  | { type: 'SUBMIT_ATTACKS' }
  | { type: 'TOGGLE_BLOCKER'; attackerId: string; blockerId: string }
  | { type: 'SUBMIT_BLOCKS' }
  | { type: 'END_TURN' }
  | { type: 'ACKNOWLEDGE_TRANSITION' };

// Helpers
export function canAfford(cost: Record<string, number> | undefined, resources: Record<string, number>): boolean {
  if (!cost) return true;
  let genericCost = cost.Generic || 0;
  const tempResources = { ...resources };
  
  for (const [element, amount] of Object.entries(cost)) {
    if (element === 'Generic') continue;
    if ((tempResources[element] || 0) < amount) return false;
    tempResources[element] -= amount;
  }
  
  let totalLeft = Object.values(tempResources).reduce((a, b) => a + b, 0);
  return totalLeft >= genericCost;
}

export function payCost(cost: Record<string, number> | undefined, resources: Record<string, number>) {
  if (!cost) return;
  let genericCost = cost.Generic || 0;
  for (const [element, amount] of Object.entries(cost)) {
    if (element === 'Generic') continue;
    resources[element] -= amount;
  }
  for (const element of Object.keys(resources)) {
    while (genericCost > 0 && resources[element] > 0) {
      resources[element] -= 1;
      genericCost -= 1;
    }
  }
}

export function initialGameState(): GameState {
  const p1Id = 'p1';
  const p2Id = 'p2';
  
  const p1Deck = createPlayer1Deck(p1Id);
  const p2Deck = createPlayer2Deck(p2Id);
  
  const players: Record<string, PlayerState> = {
    [p1Id]: {
      id: p1Id,
      name: 'Player 1',
      leader: p1Deck.leader,
      deck: p1Deck.deck,
      hand: [],
      graveyard: [],
      board: [],
      locations: p1Deck.locations,
      resources: {},
      mulliganKept: false,
      health: p1Deck.leader.health || 30,
    },
    [p2Id]: {
      id: p2Id,
      name: 'Player 2',
      leader: p2Deck.leader,
      deck: p2Deck.deck,
      hand: [],
      graveyard: [],
      board: [],
      locations: p2Deck.locations,
      resources: {},
      mulliganKept: false,
      health: p2Deck.leader.health || 30,
    }
  };
  
  // draw initial 5 cards
  for (let i = 0; i < 5; i++) {
    players[p1Id].hand.push(players[p1Id].deck.pop()!);
    players[p2Id].hand.push(players[p2Id].deck.pop()!);
  }
  
  return {
    players,
    player1Id: p1Id,
    player2Id: p2Id,
    activePlayerId: p1Id, // Coin toss logic omitted, P1 goes first
    viewingPlayerId: p1Id,
    turnNumber: 0,
    phase: 'INIT',
    activeLocation: null,
    combat: null,
    pendingRoll: null,
    winner: null,
    log: ['Game initialized.'],
  };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  // Simple deep copy for state mutation
  const next = JSON.parse(JSON.stringify(state)) as GameState;
  const activePlayer = next.players[next.activePlayerId];
  const opponentId = next.activePlayerId === next.player1Id ? next.player2Id : next.player1Id;
  const opponent = next.players[opponentId];
  
  switch (action.type) {
    case 'START_GAME':
      next.phase = 'MULLIGAN';
      next.log.push('Mulligan phase started.');
      return next;
      
    case 'KEEP_HAND': {
      const p = next.players[action.playerId];
      p.mulliganKept = true;
      if (next.players[next.player1Id].mulliganKept && next.players[next.player2Id].mulliganKept) {
        next.turnNumber = 1;
        next.phase = 'TURN_TRANSITION';
        next.viewingPlayerId = next.activePlayerId;
        next.log.push(`Turn ${next.turnNumber} starts. ${activePlayer.name} takes the first turn.`);
      }
      return next;
    }
      
    case 'MULLIGAN': {
      const p = next.players[action.playerId];
      // simple mulligan: shuffle and redraw 5 (simplified London)
      p.deck = [...p.deck, ...p.hand].sort(() => Math.random() - 0.5);
      p.hand = p.deck.splice(-5);
      p.mulliganKept = true;
      if (next.players[next.player1Id].mulliganKept && next.players[next.player2Id].mulliganKept) {
        next.turnNumber = 1;
        next.phase = 'TURN_TRANSITION';
        next.viewingPlayerId = next.activePlayerId;
        next.log.push(`Turn ${next.turnNumber} starts. ${activePlayer.name} takes the first turn.`);
      }
      return next;
    }
    
    case 'ACKNOWLEDGE_TRANSITION':
      if (next.phase === 'TURN_TRANSITION') {
        next.phase = 'ROLL';
        // Clear active player resources at start of ROLL phase
        activePlayer.resources = {};
      } else if (next.phase === 'COMBAT_BLOCK') {
        // acknowledged block phase view
      }
      return next;

    case 'ROLL_DICE': {
      next.pendingRoll = Math.floor(Math.random() * 6) + 1;
      next.phase = 'ALLOCATE';
      next.log.push(`${activePlayer.name} rolled a ${next.pendingRoll}.`);
      return next;
    }

    case 'ALLOCATE_RESOURCES': {
      for (const [element, amount] of Object.entries(action.allocations)) {
        activePlayer.resources[element] = (activePlayer.resources[element] || 0) + amount;
      }
      next.pendingRoll = null;
      
      // Draw Phase
      if (next.turnNumber > 1) {
        if (activePlayer.deck.length > 0) {
          activePlayer.hand.push(activePlayer.deck.pop()!);
          next.log.push(`${activePlayer.name} drew a card.`);
        } else {
          activePlayer.leader.damageTaken += 5;
          next.log.push(`${activePlayer.name} took 5 damage from deckout.`);
        }
      }
      
      // Update summoning sickness
      for (const u of activePlayer.board) {
        u.summoningSickness = false;
        u.exhausted = false;
      }
      activePlayer.leader.exhausted = false;
      
      next.phase = 'ACTION';
      return next;
    }

    case 'PLAY_CARD': {
      const cardIdx = activePlayer.hand.findIndex(c => c.instanceId === action.instanceId);
      if (cardIdx === -1) return next;
      const card = activePlayer.hand[cardIdx];
      
      if (!canAfford(card.cost, activePlayer.resources)) return next;
      payCost(card.cost, activePlayer.resources);
      
      activePlayer.hand.splice(cardIdx, 1);
      
      if (card.type === 'Unit') {
        activePlayer.board.push(card);
        next.log.push(`${activePlayer.name} deployed ${card.name}.`);
      }
      return next;
    }

    case 'ENTER_COMBAT': {
      if (next.turnNumber === 1) return next; // No attacks turn 1
      next.phase = 'COMBAT_DECLARE';
      next.combat = { attackers: [], blockers: [] };
      return next;
    }

    case 'TOGGLE_ATTACKER': {
      if (next.phase !== 'COMBAT_DECLARE' || !next.combat) return next;
      const existing = next.combat.attackers.findIndex(a => a.instanceId === action.instanceId);
      if (existing >= 0) {
        next.combat.attackers.splice(existing, 1);
      } else {
        next.combat.attackers.push({ instanceId: action.instanceId, targetId: action.targetId });
      }
      return next;
    }

    case 'SUBMIT_ATTACKS': {
      if (!next.combat) return next;
      if (next.combat.attackers.length === 0) {
        next.phase = 'ACTION';
        next.combat = null;
        return next;
      }
      
      // Exhaust attackers
      for (const att of next.combat.attackers) {
        const u = activePlayer.board.find(b => b.instanceId === att.instanceId);
        if (u) u.exhausted = true;
        if (activePlayer.leader.instanceId === att.instanceId) activePlayer.leader.exhausted = true;
      }
      
      next.log.push(`${activePlayer.name} declared ${next.combat.attackers.length} attackers.`);
      next.phase = 'COMBAT_BLOCK';
      next.viewingPlayerId = opponentId; // Pass device to defender
      return next;
    }

    case 'TOGGLE_BLOCKER': {
      if (!next.combat) return next;
      const existing = next.combat.blockers.findIndex(b => b.blockerId === action.blockerId);
      if (existing >= 0) {
        // remove existing block
        next.combat.blockers.splice(existing, 1);
      }
      // assign new block if not toggling off
      const existingAttacker = next.combat.blockers.find(b => b.attackerId === action.attackerId && b.blockerId === action.blockerId);
      if (!existingAttacker) {
         next.combat.blockers.push({ attackerId: action.attackerId, blockerId: action.blockerId });
      }
      return next;
    }

    case 'SUBMIT_BLOCKS': {
      if (!next.combat) return next;
      
      const entityMap = new Map<string, GameCard>();
      [activePlayer.leader, opponent.leader, ...activePlayer.board, ...opponent.board].forEach(e => {
        if (e) entityMap.set(e.instanceId, e);
      });
      
      for (const attack of next.combat.attackers) {
        const attacker = entityMap.get(attack.instanceId);
        if (!attacker) continue;
        
        let targetId = attack.targetId;
        const block = next.combat.blockers.find(b => b.attackerId === attack.instanceId);
        if (block) targetId = block.blockerId;
        
        const target = entityMap.get(targetId);
        if (!target) continue;
        
        const attackerAtk = attacker.attack || 0;
        const targetAtk = target.attack || 0;
        
        if (attacker.type === 'Leader' && target.type === 'Leader') {
          target.damageTaken += Math.max(1, Math.floor(attackerAtk / 2));
          attacker.damageTaken += targetAtk;
        } else {
          target.damageTaken += attackerAtk;
          attacker.damageTaken += targetAtk;
        }
      }
      
      // Cleanup deaths
      for (const p of [activePlayer, opponent]) {
        p.health = (p.leader.health || 0) - p.leader.damageTaken;
        if (p.health <= 0) {
          next.winner = p.id === next.player1Id ? next.player2Id : next.player1Id;
        }
        const newBoard: GameCard[] = [];
        for (const u of p.board) {
          if ((u.health || 0) - u.damageTaken <= 0) {
            p.graveyard.push(u);
            next.log.push(`${u.name} was destroyed.`);
          } else {
            newBoard.push(u);
          }
        }
        p.board = newBoard;
      }
      
      next.combat = null;
      next.phase = 'ACTION';
      next.viewingPlayerId = activePlayer.id; // Pass device back
      return next;
    }

    case 'END_TURN': {
      next.activePlayerId = opponentId;
      next.viewingPlayerId = opponentId;
      next.turnNumber++;
      next.phase = 'TURN_TRANSITION';
      next.log.push(`${activePlayer.name} ended their turn.`);
      return next;
    }
  }
  return next;
}
