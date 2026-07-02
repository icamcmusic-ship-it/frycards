import { GameState, GameCard, PlayerState } from '../types';
import { buildDeck, hasKeyword, keywordValue, keywordArg, makeToken, getDeckableLeaders } from './cards';

export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'KEEP_HAND'; playerId: string; bottomIds?: string[] }
  | { type: 'MULLIGAN'; playerId: string }
  | { type: 'ROLL_DICE' }
  | { type: 'ALLOCATE_RESOURCES'; allocations: Record<string, number> }
  | { type: 'PLAY_CARD'; instanceId: string; targetId?: string }
  | { type: 'LEADER_COMMAND'; targetId: string }
  | { type: 'ENTER_COMBAT' }
  | { type: 'TOGGLE_ATTACKER'; instanceId: string; targetId: string }
  | { type: 'SUBMIT_ATTACKS' }
  | { type: 'TOGGLE_BLOCKER'; attackerId: string; blockerId: string }
  | { type: 'SUBMIT_BLOCKS' }
  | { type: 'END_TURN' }
  | { type: 'ACKNOWLEDGE_TRANSITION' };

// ---------------------------------------------------------------------------
// Resource helpers
// ---------------------------------------------------------------------------
export function canAfford(cost: Record<string, number> | undefined, resources: Record<string, number>): boolean {
  if (!cost) return true;
  const genericCost = cost.Generic || 0;
  const tempResources = { ...resources };
  for (const [element, amount] of Object.entries(cost)) {
    if (element === 'Generic') continue;
    if ((tempResources[element] || 0) < amount) return false;
    tempResources[element] -= amount;
  }
  const totalLeft = Object.values(tempResources).reduce((a, b) => a + b, 0);
  return totalLeft >= genericCost;
}

export function payCost(cost: Record<string, number> | undefined, resources: Record<string, number>) {
  if (!cost) return;
  let genericCost = cost.Generic || 0;
  for (const [element, amount] of Object.entries(cost)) {
    if (element === 'Generic') continue;
    resources[element] = (resources[element] || 0) - amount;
  }
  for (const element of Object.keys(resources)) {
    while (genericCost > 0 && resources[element] > 0) {
      resources[element] -= 1;
      genericCost -= 1;
    }
  }
}

function refund(cost: Record<string, number> | undefined, resources: Record<string, number>) {
  if (!cost) return;
  for (const [element, amount] of Object.entries(cost)) {
    if (element === 'Generic') resources.Generic = (resources.Generic || 0) + amount;
    else resources[element] = (resources[element] || 0) + amount;
  }
}

/** A keyword only functions while the card is not Glitched (§2.3 Glitch). */
export function kwActive(card: GameCard, name: string): boolean {
  return hasKeyword(card, name) && !card.glitched;
}

/** Burden [X] (§2.1): total extra generic cost to attack with this Unit. */
export function attackBurden(unit: GameCard): number {
  return (unit.attachedItems || []).reduce(
    (s, it) => s + (it.glitched ? 0 : keywordValue(it, 'Burden')),
    0
  );
}
function kwValueActive(card: GameCard, name: string): number {
  return card.glitched ? 0 : keywordValue(card, name);
}

// ---------------------------------------------------------------------------
// Stat calculation (Layer Rule §5.3: Locations first, then Items)
// ---------------------------------------------------------------------------
function locAtkBuff(state: GameState): number {
  return state.activeLocation?.locEffect === 'ATK_ALL' ? 1 : 0;
}
function locHpBuff(state: GameState): number {
  return state.activeLocation?.locEffect === 'HP_ALL' ? 1 : 0;
}
export function itemAtk(card: GameCard): number {
  return (card.attachedItems || []).reduce((s, it) => s + (it.attach?.attack || 0), 0);
}
export function bonusHp(card: GameCard): number {
  return (card.attachedItems || []).reduce((s, it) => s + (it.attach?.health || 0), 0);
}
export function effAttack(card: GameCard, state: GameState): number {
  const loc = card.type === 'Unit' ? locAtkBuff(state) : 0;
  return Math.max(0, (card.attack || 0) + card.tempAtk + itemAtk(card) - card.witherAtk + loc);
}
export function effMaxHealth(card: GameCard, state: GameState): number {
  const loc = card.type === 'Unit' ? locHpBuff(state) : 0;
  return Math.max(1, (card.health || 0) + card.tempHp - card.witherHp + loc);
}
export function baseRemaining(card: GameCard, state: GameState): number {
  return effMaxHealth(card, state) - card.damageTaken;
}
export function totalRemaining(card: GameCard, state: GameState): number {
  return baseRemaining(card, state) + (bonusHp(card) - card.bonusDamage);
}
function isDead(card: GameCard, state: GameState): boolean {
  return baseRemaining(card, state) <= 0;
}

/**
 * Apply damage to a Unit honoring Armor, Brittle and the Stripping Rule (§5.3):
 * damage fills bonus (Item) health first, then base health.
 * Returns the amount of damage that actually landed on the card.
 */
function applyDamageToUnit(
  card: GameCard,
  amount: number,
  opts: { bypassArmor?: boolean } = {}
): number {
  let dmg = amount;
  if (kwActive(card, 'Brittle')) dmg *= 2; // §2.3 Brittle: incoming D becomes 2D
  if (!opts.bypassArmor && card.armor > 0 && !card.glitched) {
    if (dmg <= card.armor) return 0; // Armor absorbs, remains
    dmg -= card.armor;
    card.armor = 0; // Armor destroyed
  }
  let landed = 0;
  const bh = bonusHp(card) - card.bonusDamage;
  if (bh > 0) {
    const toBonus = Math.min(bh, dmg);
    card.bonusDamage += toBonus;
    dmg -= toBonus;
    landed += toBonus;
  }
  card.damageTaken += dmg;
  landed += dmg;
  return landed;
}

function recalcHealth(player: PlayerState) {
  player.health = (player.leader.health || 0) - player.leader.damageTaken;
}

function siphonHeal(source: GameCard, controller: PlayerState, damageDealt: number) {
  // §2.2 Siphon: Leader recovers half the damage dealt, rounded up.
  if (damageDealt > 0 && kwActive(source, 'Siphon')) {
    controller.leader.damageTaken = Math.max(0, controller.leader.damageTaken - Math.ceil(damageDealt / 2));
    recalcHealth(controller);
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
export function initialGameState(vsCPU = true, p1Leader?: string, p2Leader?: string): GameState {
  const p1Id = 'p1';
  const p2Id = 'p2';
  const leaders = getDeckableLeaders();
  const l1 = p1Leader || leaders[0];
  const l2 = p2Leader || leaders[1 % leaders.length];

  const p1Deck = buildDeck(l1, p1Id);
  const p2Deck = buildDeck(l2, p2Id);

  const makePlayer = (id: string, name: string, isCPU: boolean, d: ReturnType<typeof buildDeck>): PlayerState => ({
    id,
    name,
    isCPU,
    leader: d.leader,
    deck: d.deck,
    hand: [],
    graveyard: [],
    board: [],
    locations: d.locations,
    charms: [],
    resources: {},
    mulliganCount: 0,
    mulliganKept: false,
    health: d.leader.health || 30,
    overclockPenalty: 0,
    singleColorRoll: false,
  });

  const players: Record<string, PlayerState> = {
    [p1Id]: makePlayer(p1Id, 'Player 1', false, p1Deck),
    [p2Id]: makePlayer(p2Id, 'CPU', vsCPU, p2Deck),
  };

  for (let i = 0; i < 5; i++) {
    players[p1Id].hand.push(players[p1Id].deck.pop()!);
    players[p2Id].hand.push(players[p2Id].deck.pop()!);
  }

  // Coin toss for the first turn.
  const first = Math.random() < 0.5 ? p1Id : p2Id;

  return {
    players,
    player1Id: p1Id,
    player2Id: p2Id,
    activePlayerId: first,
    viewingPlayerId: p1Id,
    firstPlayerId: first,
    turnNumber: 0,
    phase: 'INIT',
    activeLocation: null,
    activeLocationOwnerId: null,
    combat: null,
    pendingRoll: null,
    winner: null,
    log: ['Game initialized. Coin toss decides the first turn.'],
  };
}

function checkWin(next: GameState) {
  for (const p of Object.values(next.players)) {
    recalcHealth(p);
    if (p.health <= 0 && !next.winner) {
      next.winner = p.id === next.player1Id ? next.player2Id : next.player1Id;
      next.phase = 'GAME_OVER';
    }
  }
}

// ---------------------------------------------------------------------------
// Start / end of turn sequences
// ---------------------------------------------------------------------------
function startOfTurn(next: GameState, player: PlayerState) {
  // §2.1.1 clear the active player's unspent resources first.
  player.resources = {};
  player.singleColorRoll = false;

  // Location Shell Game (§3.1): flip a random face-down opponent Location.
  const oppId = player.id === next.player1Id ? next.player2Id : next.player1Id;
  const opp = next.players[oppId];
  if (opp.locations.length > 0) {
    const pick = opp.locations[Math.floor(Math.random() * opp.locations.length)];
    next.activeLocation = pick;
    next.activeLocationOwnerId = player.id;
    next.log.push(`${player.name} revealed the Location "${pick.name}".`);
  }

  // Sustain (§2.3): heal at the very start of the turn, before the roll.
  for (const u of player.board) {
    const s = kwValueActive(u, 'Sustain');
    if (s > 0 && u.damageTaken > 0) {
      u.damageTaken = Math.max(0, u.damageTaken - s);
    }
  }
  const leaderSustain = kwValueActive(player.leader, 'Sustain');
  if (leaderSustain > 0 && player.leader.damageTaken > 0) {
    player.leader.damageTaken = Math.max(0, player.leader.damageTaken - leaderSustain);
    recalcHealth(player);
  }

  // Scorch (§3): targets take flame damage at the start of their turn.
  for (const u of player.board) {
    if (u.scorch > 0) {
      applyDamageToUnit(u, u.scorch);
      next.log.push(`${u.name} took ${u.scorch} Scorch damage.`);
    }
  }
  if (player.leader.scorch > 0) {
    player.leader.damageTaken += player.leader.scorch;
    recalcHealth(player);
    next.log.push(`${player.name}'s Leader took ${player.leader.scorch} Scorch damage.`);
  }

  // SCORCH_ALL location: singe every unit for 1 at start of the controller's turn.
  if (next.activeLocation?.locEffect === 'SCORCH_ALL') {
    for (const pl of Object.values(next.players)) {
      for (const u of pl.board) applyDamageToUnit(u, 1);
    }
  }

  // Charms activate when the affected player begins their next turn (§3.2).
  for (const charm of player.charms) {
    if (!charm.charmActivated) {
      charm.charmActivated = true;
      next.log.push(`Charm "${charm.name}" is now active on ${player.name}.`);
    }
  }

  cleanupDeaths(next);
  checkWin(next);
}

function endOfTurnCleanup(next: GameState, player: PlayerState) {
  // §2.1.4 Charms affecting the current player tick down by 1.
  const survivingCharms: GameCard[] = [];
  for (const charm of player.charms) {
    if (!charm.charmActivated) {
      survivingCharms.push(charm);
      continue;
    }
    charm.charmDuration = (charm.charmDuration || 1) - 1;
    if (charm.charmDuration <= 0) {
      // Detonate [X] (§2.1): on expiry, deal X damage to all Units that are
      // enemies of the Charm's owner (the player who cast it).
      const det = keywordValue(charm, 'Detonate');
      if (det > 0) {
        const enemyOfOwnerId = charm.ownerId === next.player1Id ? next.player2Id : next.player1Id;
        for (const u of next.players[enemyOfOwnerId].board) applyDamageToUnit(u, det);
        next.log.push(`Charm "${charm.name}" detonated for ${det} against ${next.players[enemyOfOwnerId].name}'s Units.`);
      }
      next.players[charm.ownerId].graveyard.push(charm);
      next.log.push(`Charm "${charm.name}" expired.`);
    } else {
      survivingCharms.push(charm);
    }
  }
  player.charms = survivingCharms;

  // Overdrive self-damage (§2.3): attacked twice -> 2 permanent damage.
  for (const u of player.board) {
    if (hasKeyword(u, 'Overdrive') && u.attacksThisTurn >= 2) {
      applyDamageToUnit(u, 2, { bypassArmor: true });
      next.log.push(`${u.name} took 2 damage from Overdrive.`);
    }
    u.attacksThisTurn = 0;
  }

  // Scorch counter decreases by 1 during the Cleanup Phase.
  for (const u of player.board) if (u.scorch > 0) u.scorch -= 1;
  if (player.leader.scorch > 0) player.leader.scorch -= 1;

  // Freeze wears off at end of the controller's turn (§3 Freeze).
  for (const u of player.board) if (u.frozen > 0) u.frozen -= 1;
  if (player.leader.frozen > 0) player.leader.frozen -= 1;

  // Temporary buffs expire at end of turn; Glitch wears off at Cleanup (§2.3).
  for (const pl of Object.values(next.players)) {
    for (const u of pl.board) {
      u.glitched = false;
      for (const it of u.attachedItems) it.glitched = false;
    }
    pl.leader.glitched = false;
  }
  for (const u of player.board) {
    u.tempAtk = 0;
    u.tempHp = 0;
  }

  // §2.1.4 discard down to 7.
  while (player.hand.length > 7) {
    const discarded = player.hand.pop()!;
    player.graveyard.push(discarded);
    next.log.push(`${player.name} discarded ${discarded.name} (hand size limit).`);
  }

  // Location flips back face-down at end of the turn (§3.1).
  next.activeLocation = null;
  next.activeLocationOwnerId = null;

  cleanupDeaths(next);
  checkWin(next);
}

/** Move dead units to graveyard (detaching Items) and clear tokens. */
function cleanupDeaths(next: GameState) {
  for (const p of Object.values(next.players)) {
    const survivors: GameCard[] = [];
    for (const u of p.board) {
      if (isDead(u, next)) {
        // Attached Items go to graveyard without triggering their own effects.
        for (const it of u.attachedItems) if (!it.isToken) p.graveyard.push(it);
        u.attachedItems = [];
        if (!u.isToken) p.graveyard.push(u); // Tokens vanish, bypassing graveyard triggers.
        next.log.push(`${u.name} was destroyed.`);
      } else {
        survivors.push(u);
      }
    }
    p.board = survivors;
  }
}

// ---------------------------------------------------------------------------
// Event resolution
// ---------------------------------------------------------------------------
function resolveEvent(next: GameState, caster: PlayerState, opp: PlayerState, card: GameCard, targetId?: string) {
  const eff = card.effect;
  if (!eff) return;

  // Pure (§2.3): bonus when 100% of this turn's roll went to one color.
  const pureBonus = hasKeyword(card, 'Pure') && caster.singleColorRoll ? 2 : 0;
  if (pureBonus > 0) next.log.push(`${card.name}'s Pure bonus triggers (+${pureBonus}).`);
  const val = (eff.value || 0) + pureBonus;

  const findTarget = (): GameCard | null => {
    if (!targetId) return null;
    const all = [
      ...caster.board,
      ...opp.board,
      caster.leader,
      opp.leader,
    ];
    return all.find((c) => c.instanceId === targetId) || null;
  };

  switch (eff.action) {
    case 'damage': {
      if (eff.target === 'leader') {
        opp.leader.damageTaken += val;
        recalcHealth(opp);
        siphonHeal(card, caster, val);
      } else {
        const t = findTarget();
        if (t) {
          const dealt = applyDamageToUnit(t, val);
          siphonHeal(card, caster, dealt);
        }
      }
      break;
    }
    case 'freeze': {
      const t = findTarget();
      if (t) {
        t.frozen = 1;
        next.log.push(`${t.name} was Frozen.`);
      }
      break;
    }
    case 'scorch': {
      const t = findTarget();
      if (t) {
        t.scorch += val;
        next.log.push(`${t.name} was Scorched ${val}.`);
      }
      break;
    }
    case 'heal': {
      caster.leader.damageTaken = Math.max(0, caster.leader.damageTaken - val);
      recalcHealth(caster);
      break;
    }
    case 'draw': {
      for (let i = 0; i < val; i++) {
        if (caster.deck.length > 0) caster.hand.push(caster.deck.pop()!);
        else {
          caster.leader.damageTaken += 2;
          recalcHealth(caster);
        }
      }
      break;
    }
    case 'obliterate': {
      const t = findTarget();
      if (t && t.type === 'Unit') {
        // Bypass Armor, move directly to graveyard, skip Parting Shot.
        t.damageTaken = (t.health || 0) + 999;
        next.log.push(`${t.name} was Obliterated.`);
      }
      break;
    }
    case 'meltdown': {
      // §2.3 Meltdown: destroy a target Item; deal its cost as Flame damage to the host.
      const t = findTarget();
      if (t && t.type === 'Unit' && t.attachedItems.length > 0) {
        const item = t.attachedItems.shift()!;
        const itemCost = Object.values(item.cost || {}).reduce((a, b) => a + b, 0);
        next.players[item.ownerId].graveyard.push(item);
        const dealt = applyDamageToUnit(t, itemCost);
        siphonHeal(card, caster, dealt);
        next.log.push(`Meltdown destroyed ${item.name}; ${t.name} took ${itemCost} Flame damage.`);
      }
      break;
    }
    case 'purge': {
      // §3 Purge: strip Items, statuses and temporary buffs from the target.
      const t = findTarget();
      if (t) {
        for (const it of t.attachedItems) next.players[it.ownerId].graveyard.push(it);
        t.attachedItems = [];
        t.bonusDamage = 0;
        t.scorch = 0;
        t.frozen = 0;
        t.glitched = false;
        t.tempAtk = 0;
        t.tempHp = 0;
        if (t.type === 'Leader') {
          const pl = next.players[t.ownerId];
          for (const ch of pl.charms) next.players[ch.ownerId].graveyard.push(ch);
          pl.charms = [];
        }
        next.log.push(`${t.name} was Purged of all modifications.`);
      }
      break;
    }
    case 'manifest': {
      const v = val || 1;
      caster.board.push(makeToken('Scrap Drone', v, v, caster.id));
      next.log.push(`${caster.name} Manifested a ${v}/${v} Scrap Drone.`);
      break;
    }
    case 'buff': {
      const t = findTarget();
      if (t && t.type === 'Unit') {
        t.tempAtk += val;
        t.tempHp += val;
        next.log.push(`${t.name} gained +${val}/+${val}.`);
      }
      break;
    }
  }
  cleanupDeaths(next);
  checkWin(next);
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------
export function gameReducer(state: GameState, action: GameAction): GameState {
  const next = reduce(state, action);
  // In single-player (exactly one human), the human always views their own side.
  const humans = Object.values(next.players).filter((p) => !p.isCPU);
  if (humans.length === 1) next.viewingPlayerId = humans[0].id;
  return next;
}

function reduce(state: GameState, action: GameAction): GameState {
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
      // London Mulligan: bottom X cards, X = number of mulligans taken (§1.2).
      const x = p.mulliganCount;
      if (x > 0) {
        let ids = action.bottomIds;
        if (!ids || ids.length < x) {
          // default: bottom the last X cards
          ids = p.hand.slice(p.hand.length - x).map((c) => c.instanceId);
        }
        const toBottom: GameCard[] = [];
        for (const id of ids.slice(0, x)) {
          const idx = p.hand.findIndex((c) => c.instanceId === id);
          if (idx >= 0) toBottom.push(p.hand.splice(idx, 1)[0]);
        }
        p.deck.unshift(...toBottom);
        if (toBottom.length) next.log.push(`${p.name} put ${toBottom.length} card(s) on the bottom.`);
      }
      p.mulliganKept = true;
      maybeStartFirstTurn(next);
      return next;
    }

    case 'MULLIGAN': {
      const p = next.players[action.playerId];
      p.deck = [...p.deck, ...p.hand];
      // shuffle
      for (let i = p.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]];
      }
      p.hand = p.deck.splice(-5);
      p.mulliganCount += 1;
      next.log.push(`${p.name} took mulligan #${p.mulliganCount}.`);
      return next;
    }

    case 'ACKNOWLEDGE_TRANSITION':
      if (next.phase === 'TURN_TRANSITION') {
        next.phase = 'ROLL';
        startOfTurn(next, activePlayer);
      }
      return next;

    case 'ROLL_DICE': {
      if (next.phase !== 'ROLL') return next;
      let roll = Math.floor(Math.random() * 6) + 1;
      // Boost [X] from Leader / active Location / active Charms (§2.3).
      let boost = kwValueActive(activePlayer.leader, 'Boost');
      if (next.activeLocationOwnerId === activePlayer.id && next.activeLocation) {
        boost += keywordValue(next.activeLocation, 'Boost');
      }
      for (const c of activePlayer.charms) if (c.charmActivated) boost += keywordValue(c, 'Boost');
      if (boost > 0) next.log.push(`Boost adds +${boost} to the roll.`);
      roll += boost;
      // Overclock penalty applied to this roll.
      if (activePlayer.overclockPenalty > 0) {
        roll = Math.max(0, roll - activePlayer.overclockPenalty);
        activePlayer.overclockPenalty = 0;
      }
      // Fix [Element] (§2.3): auto-allocate 1 point to the fixed element.
      // Sources: Leader, the active Location (its controller), active Charms.
      const fixSources: GameCard[] = [activePlayer.leader];
      if (next.activeLocationOwnerId === activePlayer.id && next.activeLocation) fixSources.push(next.activeLocation);
      for (const c of activePlayer.charms) if (c.charmActivated) fixSources.push(c);
      for (const src of fixSources) {
        const fixArg = keywordArg(src, 'Fix');
        if (fixArg && roll > 0) {
          activePlayer.resources[fixArg] = (activePlayer.resources[fixArg] || 0) + 1;
          roll -= 1;
          next.log.push(`Fix (${src.name}) auto-allocates 1 ${fixArg}.`);
        }
      }
      next.pendingRoll = roll;
      next.phase = 'ALLOCATE';
      next.log.push(`${activePlayer.name} rolled (result ${roll} to allocate).`);
      // If nothing to allocate, skip straight through.
      if (roll <= 0) {
        return gameReducer(next, { type: 'ALLOCATE_RESOURCES', allocations: {} });
      }
      return next;
    }

    case 'ALLOCATE_RESOURCES': {
      if (next.phase !== 'ALLOCATE') return next;
      for (const [element, amount] of Object.entries(action.allocations)) {
        activePlayer.resources[element] = (activePlayer.resources[element] || 0) + amount;
      }
      next.pendingRoll = null;

      // Pure (§2.3): remember whether the whole roll landed in a single color.
      const colorsUsed = Object.entries(activePlayer.resources).filter(([, v]) => v > 0);
      activePlayer.singleColorRoll = colorsUsed.length === 1;

      // Draw Phase — the first player skips their draw on Turn 1 (§2.1.2).
      if (next.turnNumber !== 1) {
        if (activePlayer.deck.length > 0) {
          activePlayer.hand.push(activePlayer.deck.pop()!);
          next.log.push(`${activePlayer.name} drew a card.`);
        } else {
          activePlayer.leader.damageTaken += 2; // Deckout Law: 2 damage per failed draw.
          recalcHealth(activePlayer);
          next.log.push(`${activePlayer.name} took 2 deckout damage.`);
          checkWin(next);
        }
      }

      // Ready units and clear summoning sickness for the active player.
      for (const u of activePlayer.board) {
        u.summoningSickness = false;
        u.exhausted = false;
        u.attacksThisTurn = 0;
      }
      activePlayer.leader.exhausted = false;

      if ((next.phase as string) !== 'GAME_OVER') next.phase = 'ACTION';
      return next;
    }

    case 'PLAY_CARD': {
      if (next.phase !== 'ACTION') return next;
      const cardIdx = activePlayer.hand.findIndex((c) => c.instanceId === action.instanceId);
      if (cardIdx === -1) return next;
      const card = activePlayer.hand[cardIdx];
      if (!canAfford(card.cost, activePlayer.resources)) return next;

      // Determine target for cards that need one.
      const needsTarget =
        (card.type === 'Event' && card.effect && ['unit', 'friendly'].includes(card.effect.target || '')) ||
        card.type === 'Item';
      const targetCard = action.targetId
        ? [...activePlayer.board, ...opponent.board].find((c) => c.instanceId === action.targetId)
        : undefined;
      if (needsTarget && !targetCard) return next; // wait for a valid target

      const targetsEnemy = !!targetCard && targetCard.ownerId !== activePlayer.id;

      // Guard (§2.1): targeted enemy Events must target a Unit with Guard
      // while the defender has a ready Guard Unit.
      if (targetsEnemy && card.type === 'Event') {
        const guards = opponent.board.filter(
          (u) => kwActive(u, 'Guard') && !u.exhausted && u.frozen === 0
        );
        if (guards.length > 0 && !guards.some((g) => g.instanceId === targetCard!.instanceId)) {
          next.log.push('A ready Guard Unit forces enemy Events to target it.');
          return next;
        }
      }

      // Ward [X] (§2.1): targeting an enemy card costs extra; targeting is
      // locked if the surcharge cannot be paid.
      const wardCost = targetsEnemy ? kwValueActive(targetCard!, 'Ward') : 0;
      if (wardCost > 0) {
        const combined = { ...(card.cost || {}) };
        combined.Generic = (combined.Generic || 0) + wardCost;
        if (!canAfford(combined, activePlayer.resources)) {
          next.log.push(`Cannot pay the Ward ${wardCost} surcharge.`);
          return next;
        }
      }

      payCost(card.cost, activePlayer.resources);
      if (wardCost > 0) payCost({ Generic: wardCost }, activePlayer.resources);
      activePlayer.hand.splice(cardIdx, 1);

      // Feedback (§2.2): targeted enemy may negate on a d6 of 4-6, refunding
      // everything spent (base cost and Ward surcharge) exactly.
      if (targetsEnemy && kwActive(targetCard!, 'Feedback')) {
        const roll = Math.floor(Math.random() * 6) + 1;
        if (roll >= 4) {
          next.log.push(`${targetCard!.name}'s Feedback negated ${card.name} (rolled ${roll}). Card refunded.`);
          refund(card.cost, activePlayer.resources);
          if (wardCost > 0) refund({ Generic: wardCost }, activePlayer.resources);
          activePlayer.hand.push(card);
          return next;
        }
      }

      if (card.type === 'Unit') {
        activePlayer.board.push(card);
        next.log.push(`${activePlayer.name} deployed ${card.name}.`);
      } else if (card.type === 'Location') {
        activePlayer.locations.push(card);
        next.log.push(`${activePlayer.name} set a Location face-down.`);
      } else if (card.type === 'Item') {
        if (targetCard && targetCard.type === 'Unit') {
          card.hostId = targetCard.instanceId;
          targetCard.attachedItems.push(card);
          next.log.push(`${activePlayer.name} attached ${card.name} to ${targetCard.name}.`);
        }
      } else if (card.type === 'Charm') {
        // §3.2 Charms attach to a player's profile and sit dormant until the
        // affected player's next turn. Deleterious charms (Decay) go on the
        // opponent; protective/utility charms attach to their caster.
        card.charmDuration = card.duration || 1;
        card.charmActivated = false;
        const harmful = hasKeyword(card, 'Decay');
        (harmful ? opponent : activePlayer).charms.push(card);
        next.log.push(`${activePlayer.name} played the Charm ${card.name}${harmful ? ' on the opponent' : ''}.`);
      } else if (card.type === 'Event') {
        next.log.push(`${activePlayer.name} cast ${card.name}.`);
        resolveEvent(next, activePlayer, opponent, card, action.targetId);
        // Echo (§2.3): Chaos Events may duplicate on a d6 of 5-6.
        if (hasKeyword(card, 'Echo')) {
          const roll = Math.floor(Math.random() * 6) + 1;
          if (roll >= 5) {
            next.log.push(`Echo duplicated ${card.name}!`);
            // random target for the copy
            const pool = card.effect?.target === 'friendly' ? activePlayer.board : opponent.board;
            const rnd = pool[Math.floor(Math.random() * pool.length)];
            resolveEvent(next, activePlayer, opponent, card, rnd?.instanceId);
          }
        }
        activePlayer.graveyard.push(card);
      }
      return next;
    }

    case 'LEADER_COMMAND': {
      // Command [X] (§2.1): pay X resources to instantly ready a friendly
      // Unit; it ignores summoning sickness and may attack again this turn.
      if (next.phase !== 'ACTION') return next;
      const x = kwValueActive(activePlayer.leader, 'Command');
      if (x <= 0) return next;
      const target = activePlayer.board.find((u) => u.instanceId === action.targetId && u.type === 'Unit');
      if (!target) return next;
      if (!canAfford({ Generic: x }, activePlayer.resources)) return next;
      payCost({ Generic: x }, activePlayer.resources);
      target.exhausted = false;
      target.summoningSickness = false;
      target.attacksThisTurn = Math.max(0, target.attacksThisTurn - 1);
      next.log.push(`${activePlayer.name}'s Leader Commands ${target.name}: readied for another attack.`);
      return next;
    }

    case 'ENTER_COMBAT': {
      if (next.phase !== 'ACTION') return next;
      if (next.turnNumber === 1) return next; // No attacks on Turn 1 (§2.1.2).
      next.phase = 'COMBAT_DECLARE';
      next.combat = { attackers: [], blockers: [] };
      return next;
    }

    case 'TOGGLE_ATTACKER': {
      if (next.phase !== 'COMBAT_DECLARE' || !next.combat) return next;
      const existing = next.combat.attackers.findIndex((a) => a.instanceId === action.instanceId);
      if (existing >= 0) {
        next.combat.attackers.splice(existing, 1);
        return next;
      }
      // Engine-side eligibility (§5.1): no summoning sickness, not frozen,
      // not already spent.
      const unit = activePlayer.board.find((u) => u.instanceId === action.instanceId);
      if (unit) {
        const maxAttacks = kwActive(unit, 'Overdrive') ? 2 : 1;
        if (unit.summoningSickness || unit.frozen > 0 || unit.attacksThisTurn >= maxAttacks) return next;
        if (unit.exhausted && unit.attacksThisTurn >= maxAttacks) return next;
        // Burden (§2.1): the client locks the declaration if the combined
        // surcharge of all declared attackers cannot be paid.
        const declaredBurden = next.combat.attackers.reduce((s, a) => {
          const du = activePlayer.board.find((b) => b.instanceId === a.instanceId);
          return s + (du ? attackBurden(du) : 0);
        }, 0);
        const total = declaredBurden + attackBurden(unit);
        if (total > 0 && !canAfford({ Generic: total }, activePlayer.resources)) {
          next.log.push(`${unit.name} cannot attack: Burden ${attackBurden(unit)} unpayable.`);
          return next;
        }
      } else if (activePlayer.leader.instanceId === action.instanceId) {
        if (activePlayer.leader.exhausted || activePlayer.leader.frozen > 0) return next;
        // Survival Caveat (§5.2): forbid a Leader attack whose counter is lethal.
        const target = [opponent.leader, ...opponent.board].find((c) => c.instanceId === action.targetId);
        const counter = target ? effAttack(target, next) : 0;
        const remaining = (activePlayer.leader.health || 0) - activePlayer.leader.damageTaken;
        if (counter >= remaining) {
          next.log.push('Leader attack blocked: counter-damage would be lethal.');
          return next;
        }
      } else {
        return next;
      }
      next.combat.attackers.push({ instanceId: action.instanceId, targetId: action.targetId });
      return next;
    }

    case 'SUBMIT_ATTACKS': {
      if (!next.combat) return next;
      if (next.combat.attackers.length === 0) {
        next.phase = 'ACTION';
        next.combat = null;
        return next;
      }
      // Burden [X] (§2.1): attacking with a Unit holding a Burden Item costs
      // extra generic resources; unaffordable attacks are cancelled.
      const confirmed: typeof next.combat.attackers = [];
      for (const att of next.combat.attackers) {
        const u = activePlayer.board.find((b) => b.instanceId === att.instanceId);
        if (u) {
          const burden = attackBurden(u);
          if (burden > 0) {
            if (!canAfford({ Generic: burden }, activePlayer.resources)) {
              next.log.push(`${u.name} cannot attack: Burden ${burden} unpaid.`);
              continue;
            }
            payCost({ Generic: burden }, activePlayer.resources);
            next.log.push(`${activePlayer.name} paid Burden ${burden} for ${u.name}.`);
          }
          u.exhausted = true;
          u.attacksThisTurn += 1;
          confirmed.push(att);
        } else if (activePlayer.leader.instanceId === att.instanceId) {
          activePlayer.leader.exhausted = true;
          confirmed.push(att);
        }
      }
      next.combat.attackers = confirmed;
      if (confirmed.length === 0) {
        next.phase = 'ACTION';
        next.combat = null;
        return next;
      }
      next.log.push(`${activePlayer.name} declared ${confirmed.length} attacker(s).`);

      // If the defender has no possible blockers, resolve immediately.
      const canBlock = opponent.board.some((u) => !u.exhausted && u.frozen === 0);
      if (!canBlock) {
        return resolveCombat(next, activePlayer, opponent);
      }
      next.phase = 'COMBAT_BLOCK';
      next.viewingPlayerId = opponentId;
      return next;
    }

    case 'TOGGLE_BLOCKER': {
      if (!next.combat) return next;
      // A blocker blocks at most one attacker; an attacker is blocked by at most one.
      const already = next.combat.blockers.find(
        (b) => b.blockerId === action.blockerId && b.attackerId === action.attackerId
      );
      // remove any block involving this blocker
      next.combat.blockers = next.combat.blockers.filter((b) => b.blockerId !== action.blockerId);
      if (!already) {
        // remove any existing blocker on that attacker
        next.combat.blockers = next.combat.blockers.filter((b) => b.attackerId !== action.attackerId);
        next.combat.blockers.push({ attackerId: action.attackerId, blockerId: action.blockerId });
      }
      return next;
    }

    case 'SUBMIT_BLOCKS': {
      if (!next.combat) return next;
      return resolveCombat(next, activePlayer, opponent);
    }

    case 'END_TURN': {
      if (next.phase === 'GAME_OVER') return next;
      endOfTurnCleanup(next, activePlayer);
      if ((next.phase as string) === 'GAME_OVER') return next;
      next.activePlayerId = opponentId;
      next.viewingPlayerId = opponentId;
      next.turnNumber += 1;
      next.phase = 'TURN_TRANSITION';
      next.combat = null;
      next.log.push(`--- Turn ${next.turnNumber}: ${opponent.name} ---`);
      return next;
    }
  }
  return next;
}

function maybeStartFirstTurn(next: GameState) {
  if (next.players[next.player1Id].mulliganKept && next.players[next.player2Id].mulliganKept) {
    next.turnNumber = 1;
    next.phase = 'TURN_TRANSITION';
    next.viewingPlayerId = next.activePlayerId;
    next.log.push(`Turn 1: ${next.players[next.activePlayerId].name} takes the first turn.`);
  }
}

/** Wither / Glitch / Reap triggers when `attacker` deals combat damage to `target`. */
function onCombatDamageToUnit(next: GameState, attacker: GameCard, target: GameCard) {
  const w = kwValueActive(attacker, 'Wither');
  if (w > 0 && target.type === 'Unit') {
    target.witherAtk += w;
    target.witherHp += w;
    next.log.push(`${attacker.name} Withered ${target.name} by ${w}.`);
  }
  if (kwActive(attacker, 'Glitch')) {
    target.glitched = true;
    for (const it of target.attachedItems || []) it.glitched = true;
    next.log.push(`${target.name} was Glitched: abilities disabled until Cleanup.`);
  }
}

function reapHeal(next: GameState, attacker: GameCard, victim: GameCard) {
  if (kwActive(attacker, 'Reap')) {
    const heal = victim.attack || 0; // printed base attack
    const ctrl = playerOf(next, attacker);
    ctrl.leader.damageTaken = Math.max(0, ctrl.leader.damageTaken - heal);
    recalcHealth(ctrl);
    next.log.push(`${attacker.name} Reaped ${heal} health.`);
  }
}

/**
 * Resolve the unified assault wave (§5.1-5.3): apply combat damage, honor
 * blocking, Pierce, Wither, Glitch, Siphon, Reap, Leader combat laws, then deaths.
 */
function resolveCombat(next: GameState, activePlayer: PlayerState, opponent: PlayerState): GameState {
  if (!next.combat) return next;
  const entityMap = new Map<string, GameCard>();
  [activePlayer.leader, opponent.leader, ...activePlayer.board, ...opponent.board].forEach((e) => {
    if (e) entityMap.set(e.instanceId, e);
  });

  for (const attack of next.combat.attackers) {
    const attacker = entityMap.get(attack.instanceId);
    if (!attacker) continue;
    const block = next.combat.blockers.find((b) => b.attackerId === attack.instanceId);
    const attackerAtk = effAttack(attacker, next);

    if (block) {
      // Blocked: attacker vs blocker.
      const blocker = entityMap.get(block.blockerId);
      if (!blocker) continue;
      const blockerRemaining = totalRemaining(blocker, next);
      const dealt = applyDamageToUnit(blocker, attackerAtk);
      siphonHeal(attacker, playerOf(next, attacker), dealt);
      if (dealt > 0) onCombatDamageToUnit(next, attacker, blocker);
      // Pierce (§2.1): overflow beyond the blocker's remaining health goes to
      // the defending Leader.
      if (kwActive(attacker, 'Pierce') && attackerAtk > blockerRemaining) {
        const overflow = attackerAtk - blockerRemaining;
        opponent.leader.damageTaken += overflow;
        recalcHealth(opponent);
        next.log.push(`${attacker.name} Pierced ${overflow} to ${opponent.name}'s Leader.`);
      }
      // Counter damage (blocking does not exhaust the blocker).
      const counter = effAttack(blocker, next);
      const counterDealt = applyDamageToUnit(attacker, counter);
      if (counterDealt > 0) onCombatDamageToUnit(next, blocker, attacker);
      // Reap: destroying an enemy Unit in combat heals for its base attack.
      if (isDead(blocker, next)) reapHeal(next, attacker, blocker);
      if (isDead(attacker, next)) reapHeal(next, blocker, attacker);
    } else {
      // Unblocked: hit the declared target.
      let target = entityMap.get(attack.targetId);
      if (!target) continue;
      // Guard Interlock (§5.2): if the defender has a ready Guard unit, the
      // attack is forced onto it instead of the Leader.
      if (target.type === 'Leader' && target.ownerId === opponent.id) {
        const guard = opponent.board.find(
          (u) => kwActive(u, 'Guard') && !u.exhausted && u.frozen === 0 && !isDead(u, next)
        );
        if (guard) {
          target = guard;
          next.log.push(`${attacker.name} is forced to strike the Guard unit ${guard.name}.`);
        }
      }
      if (target.type === 'Leader') {
        const targetPlayer = playerOf(next, target);
        if (attacker.type === 'Leader') {
          // Leader vs Leader: half damage (rounded down, min 1), full counter (§5.2).
          const dmg = Math.max(1, Math.floor(attackerAtk / 2));
          targetPlayer.leader.damageTaken += dmg;
          recalcHealth(targetPlayer);
          siphonHeal(attacker, playerOf(next, attacker), dmg);
          if (dmg > 0) onCombatDamageToUnit(next, attacker, target);
          const counter = effAttack(target, next);
          attacker.damageTaken += counter;
          recalcHealth(playerOf(next, attacker));
        } else {
          targetPlayer.leader.damageTaken += attackerAtk;
          recalcHealth(targetPlayer);
          siphonHeal(attacker, playerOf(next, attacker), attackerAtk);
          if (attackerAtk > 0) onCombatDamageToUnit(next, attacker, target);
        }
      } else {
        // Leader (or unit) attacking a Unit: full both ways (§5.2).
        const dealt = applyDamageToUnit(target, attackerAtk);
        siphonHeal(attacker, playerOf(next, attacker), dealt);
        if (dealt > 0) onCombatDamageToUnit(next, attacker, target);
        const counter = effAttack(target, next);
        if (attacker.type === 'Leader') {
          attacker.damageTaken += counter;
          recalcHealth(playerOf(next, attacker));
        } else {
          const counterDealt = applyDamageToUnit(attacker, counter);
          if (counterDealt > 0) onCombatDamageToUnit(next, target, attacker);
        }
        if (isDead(target, next)) reapHeal(next, attacker, target);
      }
    }
  }

  cleanupDeaths(next);
  checkWin(next);
  next.combat = null;
  if ((next.phase as string) !== 'GAME_OVER') next.phase = 'ACTION';
  next.viewingPlayerId = activePlayer.id;
  return next;
}

function playerOf(next: GameState, card: GameCard): PlayerState {
  return next.players[card.ownerId];
}
