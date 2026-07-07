import { GameState, GameCard, PlayerState } from '../types';
import {
  buildDeck,
  hasKeyword,
  keywordValue,
  keywordArg,
  makeToken,
  getDeckableLeaders,
} from './cards';

export type GameAction =
  | { type: 'START_GAME' }
  | { type: 'KEEP_HAND'; playerId: string; bottomIds?: string[] }
  | { type: 'MULLIGAN'; playerId: string }
  | { type: 'ROLL_DICE' }
  | { type: 'ALLOCATE_RESOURCES'; allocations: Record<string, number> }
  | { type: 'PLAY_CARD'; instanceId: string; targetId?: string }
  | { type: 'ACTIVATE_ABILITY'; instanceId: string; targetId?: string }
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
export function canAfford(
  cost: Record<string, number> | undefined,
  resources: Record<string, number>,
): boolean {
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

/**
 * Deduct a cost from the pool. Returns the exact per-element amounts drained
 * so a negation (Feedback §2.2) can refund precisely what was spent —
 * including which colored pools the Generic portion was paid from.
 */
export function payCost(
  cost: Record<string, number> | undefined,
  resources: Record<string, number>,
): Record<string, number> {
  const paid: Record<string, number> = {};
  if (!cost) return paid;
  let genericCost = cost.Generic || 0;
  for (const [element, amount] of Object.entries(cost)) {
    if (element === 'Generic') continue;
    resources[element] = (resources[element] || 0) - amount;
    if (amount > 0) paid[element] = (paid[element] || 0) + amount;
  }
  // Pay generic costs from the largest remaining pool first, preserving the
  // player's scarcer colors for element-specific costs later in the turn.
  const byAmount = Object.keys(resources).sort((a, b) => (resources[b] || 0) - (resources[a] || 0));
  for (const element of byAmount) {
    while (genericCost > 0 && resources[element] > 0) {
      resources[element] -= 1;
      genericCost -= 1;
      paid[element] = (paid[element] || 0) + 1;
    }
  }
  return paid;
}

function refund(paid: Record<string, number> | undefined, resources: Record<string, number>) {
  if (!paid) return;
  for (const [element, amount] of Object.entries(paid)) {
    resources[element] = (resources[element] || 0) + amount;
  }
}

/** A keyword only functions while the card is not Glitched (§2.3 Glitch). */
export function kwActive(card: GameCard, name: string): boolean {
  return hasKeyword(card, name) && !card.glitched;
}

/**
 * Lurk (§2.1): untargetable by enemy attacks/Events until it has declared an
 * attack at least once this match; suppressed while the card has Guard.
 */
export function lurkProtected(card: GameCard): boolean {
  return kwActive(card, 'Lurk') && !kwActive(card, 'Guard') && !card.hasAttacked;
}

/** Burden [X] (§2.1): total extra generic cost to attack with this Unit. */
export function attackBurden(unit: GameCard): number {
  return (unit.attachedItems || []).reduce(
    (s, it) => s + (it.glitched ? 0 : keywordValue(it, 'Burden')),
    0,
  );
}
function kwValueActive(card: GameCard, name: string): number {
  return card.glitched ? 0 : keywordValue(card, name);
}

// ---------------------------------------------------------------------------
// Player auras (new-set keywords): Valor / Codex / Beacon / Inspire / Sync /
// Glacier / Flourish / Discord radiate from a player's Leader, their active
// Charms, and the active Location while they control it (Symmetric Locations
// radiate to both players). A bare keyword counts as 1.
// ---------------------------------------------------------------------------
function auraSources(state: GameState, playerId: string): GameCard[] {
  const p = state.players[playerId];
  if (!p) return [];
  const out: GameCard[] = [p.leader];
  for (const c of p.charms) if (c.charmActivated && !c.glitched) out.push(c);
  const loc = state.activeLocation;
  if (loc && (state.activeLocationOwnerId === playerId || hasKeyword(loc, 'Symmetric'))) {
    out.push(loc);
  }
  return out;
}
function auraValue(state: GameState, playerId: string, name: string): number {
  return auraSources(state, playerId).reduce(
    (s, c) => s + (!c.glitched && hasKeyword(c, name) ? Math.max(1, keywordValue(c, name)) : 0),
    0,
  );
}

/** Solitary [X] (new set): +X/+X while this is the owner's only Unit in play. */
function solitaryBuff(card: GameCard, state: GameState): number {
  if (card.type !== 'Unit' || !kwActive(card, 'Solitary')) return 0;
  const player = state.players[card.ownerId];
  if (!player) return 0;
  const others = player.board.filter((u) => u.instanceId !== card.instanceId).length;
  return others === 0 ? Math.max(1, keywordValue(card, 'Solitary')) : 0;
}

/** Overcharge [X] (new set): attached Items grant +X/+X while their upkeep is paid. */
function overchargeBuff(card: GameCard): number {
  return (card.attachedItems || []).reduce(
    (s, it) =>
      s +
      (!it.glitched && hasKeyword(it, 'Overcharge')
        ? Math.max(1, keywordValue(it, 'Overcharge'))
        : 0),
    0,
  );
}

/**
 * Efficient [X] (new set): reduce a Unit's deploy cost by the banked discount —
 * Generic requirements shrink first, then the largest color requirements.
 */
function discountCost(
  cost: Record<string, number> | undefined,
  discount: number,
): Record<string, number> | undefined {
  if (!cost || discount <= 0) return cost;
  const c = { ...cost };
  let d = discount;
  const take = (el: string) => {
    const t = Math.min(c[el] || 0, d);
    if (t > 0) {
      c[el] = (c[el] || 0) - t;
      d -= t;
    }
  };
  take('Generic');
  for (const el of Object.keys(c).sort((a, b) => (c[b] || 0) - (c[a] || 0))) {
    if (d <= 0) break;
    if (el !== 'Generic') take(el);
  }
  return c;
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
/**
 * Phalanx [X] (§2.2): +X max health for each OTHER ready friendly card on the
 * battlefield (health only — a dynamic buffer that never wipes damage §5.3).
 */
function phalanxHp(card: GameCard, state: GameState): number {
  if (card.type !== 'Unit' || !kwActive(card, 'Phalanx')) return 0;
  const player = state.players[card.ownerId];
  if (!player) return 0;
  const x = Math.max(1, keywordValue(card, 'Phalanx'));
  const readyOthers =
    player.board.filter((u) => u.instanceId !== card.instanceId && !u.exhausted).length +
    (player.leader.exhausted ? 0 : 1);
  return x * readyOthers;
}
export function effAttack(card: GameCard, state: GameState): number {
  const loc = card.type === 'Unit' ? locAtkBuff(state) : 0;
  // Valor (new set): an aura of +X attack on all of the controller's Units.
  const valor = card.type === 'Unit' ? auraValue(state, card.ownerId, 'Valor') : 0;
  return Math.max(
    0,
    (card.attack || 0) +
      card.tempAtk +
      itemAtk(card) -
      card.witherAtk +
      loc +
      valor +
      solitaryBuff(card, state) +
      overchargeBuff(card),
  );
}
export function effMaxHealth(card: GameCard, state: GameState): number {
  const loc = card.type === 'Unit' ? locHpBuff(state) : 0;
  // Codex (new set): an aura of +X max health on all of the controller's Units.
  const codex = card.type === 'Unit' ? auraValue(state, card.ownerId, 'Codex') : 0;
  return Math.max(
    0,
    (card.health || 0) +
      card.tempHp -
      card.witherHp +
      loc +
      phalanxHp(card, state) +
      codex +
      solitaryBuff(card, state) +
      overchargeBuff(card),
  );
}
export function baseRemaining(card: GameCard, state: GameState): number {
  return effMaxHealth(card, state) - card.damageTaken;
}
export function totalRemaining(card: GameCard, state: GameState): number {
  return baseRemaining(card, state) + (bonusHp(card) - card.bonusDamage);
}
function isDead(card: GameCard, state: GameState): boolean {
  if (card.type === 'Unit' && effMaxHealth(card, state) <= 0) return true;
  return baseRemaining(card, state) <= 0;
}

export function effArmor(card: GameCard): number {
  if (card.glitched) return 0;
  const base = card.armor;
  const itemsArmor = (card.attachedItems || []).reduce((s, it) => {
    return s + (it.glitched ? 0 : keywordValue(it, 'Armor'));
  }, 0);
  return base + itemsArmor;
}

export function maxItemCapacity(unit: GameCard): number {
  // Modularity [X] raises capacity by X (a bare "Modularity" counts as 1).
  let capacity = 2;
  if (kwActive(unit, 'Modularity')) capacity += Math.max(1, keywordValue(unit, 'Modularity'));
  for (const it of unit.attachedItems || []) {
    if (!it.glitched && hasKeyword(it, 'Modularity'))
      capacity += Math.max(1, keywordValue(it, 'Modularity'));
  }
  return capacity;
}

export function detachItem(unit: GameCard, itemId: string, graveyard: GameCard[]) {
  const idx = unit.attachedItems.findIndex((it) => it.instanceId === itemId);
  if (idx >= 0) {
    const item = unit.attachedItems.splice(idx, 1)[0];
    graveyard.push(item);
    const itemHp = item.attach?.health || 0;
    unit.bonusDamage = Math.max(0, unit.bonusDamage - itemHp);
  }
}

export function enforceItemCapacity(unit: GameCard, graveyard: GameCard[], log: string[]) {
  const cap = maxItemCapacity(unit);
  while (unit.attachedItems.length > cap) {
    const excess = unit.attachedItems.shift()!;
    graveyard.push(excess);
    const excessHp = excess.attach?.health || 0;
    unit.bonusDamage = Math.max(0, unit.bonusDamage - excessHp);
    log.push(
      `Item Capacity Overrun: ${excess.name} was destroyed because ${unit.name}'s Item capacity dropped to ${cap}.`,
    );
  }
}

function enforceAllItemCapacities(next: GameState) {
  for (const p of Object.values(next.players)) {
    for (const u of p.board) {
      enforceItemCapacity(u, p.graveyard, next.log);
    }
  }
}

/**
 * Apply damage to a Unit honoring Armor, Brittle and the Stripping Rule (§5.3):
 * damage fills bonus (Item) health first, then base health.
 * Returns the amount of damage that actually landed on the card.
 */
function applyDamageToUnit(
  card: GameCard,
  amount: number,
  opts: { bypassArmor?: boolean } = {},
): number {
  let dmg = amount;
  if (kwActive(card, 'Brittle')) dmg *= 2; // §2.3 Brittle: incoming D becomes 2D
  if (dmg > 0 && card.tainted) dmg += card.tainted; // Taint [X] (new set): +X from all sources until Cleanup

  const currentArmor = opts.bypassArmor ? 0 : effArmor(card);
  if (currentArmor > 0) {
    if (dmg <= currentArmor) return 0; // Armor absorbs, remains
    dmg -= currentArmor;
    // Armor Break (§2.1): a hit bigger than the total Armor shatters ALL of
    // it — printed Armor and Item-granted Armor alike (keyword uniformity).
    card.armor = 0;
    for (const it of card.attachedItems || []) {
      if (it.keywords?.some((k) => k.split(' ')[0] === 'Armor')) {
        it.keywords = it.keywords.filter((k) => k.split(' ')[0] !== 'Armor');
      }
    }
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

/** Non-mutating preview of applyDamageToUnit: how much of AMOUNT would land? */
export function projectedDamage(card: GameCard, amount: number): number {
  let dmg = amount;
  if (kwActive(card, 'Brittle')) dmg *= 2;
  if (dmg > 0 && card.tainted) dmg += card.tainted;
  const armor = effArmor(card);
  if (armor > 0) {
    if (dmg <= armor) return 0;
    dmg -= armor;
  }
  return dmg;
}

/**
 * Deal DAMAGE to a Leader through the standard pipeline (§5.4): Brittle,
 * Taint and Armor all apply, exactly as they do for Units (keyword
 * uniformity). Returns the damage that actually landed. Loss-of-life
 * penalties (Deckout Law, Discord) intentionally bypass this — they are not
 * "damage from a source" and no keyword mitigates them.
 */
function damageLeader(next: GameState, leader: GameCard, amount: number): number {
  const dealt = applyDamageToUnit(leader, amount);
  recalcHealth(next.players[leader.ownerId]);
  return dealt;
}

function siphonHeal(
  source: GameCard,
  controller: PlayerState,
  damageDealt: number,
  targetCard?: GameCard,
) {
  // §2.2 Siphon: Leader recovers half the damage dealt, rounded up.
  if (damageDealt > 0 && kwActive(source, 'Siphon')) {
    if (targetCard && targetCard.ownerId === controller.id) {
      // Restricts healing to damage dealt to enemy cards/Leader
      return;
    }
    controller.leader.damageTaken = Math.max(
      0,
      controller.leader.damageTaken - Math.ceil(damageDealt / 2),
    );
    recalcHealth(controller);
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
export function initialGameState(
  vsCPU = true,
  p1Leader?: string,
  p2Leader?: string,
  p1CustomDeck?: string[],
  p1Name = 'Player 1',
): GameState {
  const p1Id = 'p1';
  const p2Id = 'p2';
  const leaders = getDeckableLeaders();
  const l1 = p1Leader || leaders[0];
  const l2 = p2Leader || leaders[1 % leaders.length];

  const p1Deck = buildDeck(l1, p1Id, p1CustomDeck);
  const p2Deck = buildDeck(l2, p2Id);

  const makePlayer = (
    id: string,
    name: string,
    isCPU: boolean,
    d: ReturnType<typeof buildDeck>,
  ): PlayerState => ({
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
    [p1Id]: makePlayer(p1Id, p1Name, false, p1Deck),
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
  const all = Object.values(next.players);
  for (const p of all) recalcHealth(p);
  if (next.winner) return;
  const dead = all.filter((p) => p.health <= 0);
  if (dead.length === 0) return;
  if (dead.length === all.length) {
    // Simultaneous KO: the active player initiated the destruction and loses.
    const loserId = next.activePlayerId;
    next.winner = loserId === next.player1Id ? next.player2Id : next.player1Id;
  } else {
    next.winner = dead[0].id === next.player1Id ? next.player2Id : next.player1Id;
  }
  next.phase = 'GAME_OVER';
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

  // Hatchling [X] (new set): a revealed Location seeds X 1/1 tokens for its
  // controller; a Symmetric Location hatches for both players.
  if (next.activeLocation) {
    const hatch = keywordValue(next.activeLocation, 'Hatchling');
    if (hatch > 0) {
      const recipients = hasKeyword(next.activeLocation, 'Symmetric') ? [player, opp] : [player];
      for (const pl of recipients) {
        for (let i = 0; i < hatch; i++) pl.board.push(makeToken('Hatchling', 1, 1, pl.id));
        next.log.push(
          `Hatchling (${next.activeLocation.name}): ${pl.name} created ${hatch} 1/1 token(s).`,
        );
      }
    }
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
    // Keyword uniformity: Leader Scorch runs the same damage pipeline as
    // Units (Armor, Brittle and Taint all apply).
    const dealt = applyDamageToUnit(player.leader, player.leader.scorch);
    recalcHealth(player);
    next.log.push(`${player.name}'s Leader took ${dealt} Scorch damage.`);
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

  // Discord (new set): each active Discord source rolls the dice of fate —
  // gain 1 Generic resource, draw 1 card, or the Leader takes 1 damage.
  for (const src of auraSources(next, player.id)) {
    if (src.glitched || !hasKeyword(src, 'Discord')) continue;
    const fate = Math.floor(Math.random() * 3);
    if (fate === 0) {
      player.resources.Generic = (player.resources.Generic || 0) + 1;
      next.log.push(`Discord (${src.name}): ${player.name} gains 1 Generic resource.`);
    } else if (fate === 1) {
      if (player.deck.length > 0) {
        player.hand.push(player.deck.pop()!);
        next.log.push(`Discord (${src.name}): ${player.name} draws a card.`);
      } else {
        player.leader.damageTaken += 2; // Deckout Law still applies
        recalcHealth(player);
        next.log.push(`Discord (${src.name}): ${player.name} took 2 deckout damage.`);
      }
    } else {
      player.leader.damageTaken += 1;
      recalcHealth(player);
      next.log.push(`Discord (${src.name}): ${player.name}'s Leader takes 1 damage.`);
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
        next.log.push(
          `Charm "${charm.name}" detonated for ${det} against ${next.players[enemyOfOwnerId].name}'s Units.`,
        );
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
    if (kwActive(u, 'Overdrive') && u.attacksThisTurn >= 2) {
      applyDamageToUnit(u, 2, { bypassArmor: true });
      next.log.push(`${u.name} took 2 damage from Overdrive.`);
    }
    u.attacksThisTurn = 0;
  }

  // Overcharge [X] (new set): upkeep is paid automatically at Cleanup when
  // affordable; an unpaid Overcharge Item burns out and is destroyed.
  for (const u of player.board) {
    for (const it of [...u.attachedItems]) {
      const oc = hasKeyword(it, 'Overcharge') ? Math.max(1, keywordValue(it, 'Overcharge')) : 0;
      if (oc <= 0) continue;
      if (canAfford({ Generic: oc }, player.resources)) {
        payCost({ Generic: oc }, player.resources);
        next.log.push(`${player.name} paid Overcharge ${oc} to keep ${it.name}.`);
      } else {
        detachItem(u, it.instanceId, player.graveyard);
        next.log.push(`${it.name} burned out: its Overcharge ${oc} upkeep went unpaid.`);
      }
    }
  }

  // Scorch counter decreases by 1 during the Cleanup Phase.
  for (const u of player.board) if (u.scorch > 0) u.scorch -= 1;
  if (player.leader.scorch > 0) player.leader.scorch -= 1;

  // Freeze wears off at end of the controller's turn (§3 Freeze).
  for (const u of player.board) if (u.frozen > 0) u.frozen -= 1;
  if (player.leader.frozen > 0) player.leader.frozen -= 1;

  // Temporary buffs expire at end of turn; Glitch wears off at the affected
  // controller's own Cleanup (§2.3) — so a Unit Glitched during the enemy's
  // combat stays disabled through its controller's whole next turn.
  for (const u of player.board) {
    u.glitched = false;
    for (const it of u.attachedItems) it.glitched = false;
  }
  player.leader.glitched = false;
  for (const u of player.board) {
    u.tempAtk = 0;
    u.tempHp = 0;
    u.tainted = 0; // Taint (new set) wears off at the victim controller's Cleanup
  }
  player.leader.tainted = 0;

  // Efficient (new set): an unused deploy discount expires at end of turn.
  player.deployDiscount = 0;

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

/** One sweep of the board: move dead units to graveyard, detaching Items. */
function sweepDeathsOnce(next: GameState): boolean {
  let anyDied = false;
  for (const p of Object.values(next.players)) {
    const survivors: GameCard[] = [];
    for (const u of p.board) {
      if (isDead(u, next)) {
        anyDied = true;
        // Attached Items go to graveyard without triggering their own effects.
        for (const it of u.attachedItems) if (!it.isToken) p.graveyard.push(it);
        u.attachedItems = [];
        // Transient statuses do not follow a card into the graveyard — a Unit
        // that dies while Glitched must not have its Graveborn locked forever.
        u.glitched = false;
        u.frozen = 0;
        u.scorch = 0;
        u.tainted = 0;
        if (!u.isToken) p.graveyard.push(u); // Tokens vanish, bypassing graveyard triggers.
        next.log.push(`${u.name} was destroyed.`);
      } else {
        survivors.push(u);
      }
    }
    p.board = survivors;
  }
  return anyDied;
}

/**
 * Move dead units to graveyard, detaching Items, and re-sweep to a fixpoint.
 * Dynamic max-health effects (Phalanx) mean removing one dead Unit can drop
 * another's health below zero in the same instant (a cascade) — a single
 * pass would leave that second Unit sitting at 0 HP on the battlefield until
 * some later action happened to re-trigger the sweep.
 */
function cleanupDeaths(next: GameState) {
  // Bounded by board size: each pass removes at least one Unit, so the loop
  // cannot run more times than there are Units in play.
  const maxPasses = Object.values(next.players).reduce((s, p) => s + p.board.length, 0) + 1;
  for (let i = 0; i < maxPasses; i++) {
    if (!sweepDeathsOnce(next)) break;
  }
  enforceAllItemCapacities(next);
}

// ---------------------------------------------------------------------------
// Event resolution
// ---------------------------------------------------------------------------
function resolveEvent(
  next: GameState,
  caster: PlayerState,
  opp: PlayerState,
  card: GameCard,
  targetId?: string,
) {
  const eff = card.effect;
  if (!eff) return;

  // Pure (§2.3): bonus when 100% of this turn's roll went to one color.
  const pureBonus = hasKeyword(card, 'Pure') && caster.singleColorRoll ? 2 : 0;
  if (pureBonus > 0) next.log.push(`${card.name}'s Pure bonus triggers (+${pureBonus}).`);
  const val = (eff.value || 0) + pureBonus;

  const findTarget = (): GameCard | null => {
    if (!targetId) return null;
    const all = [...caster.board, ...opp.board, caster.leader, opp.leader];
    return all.find((c) => c.instanceId === targetId) || null;
  };

  switch (eff.action) {
    case 'damage': {
      if (eff.target === 'leader') {
        const dealt = damageLeader(next, opp.leader, val);
        siphonHeal(card, caster, dealt, opp.leader);
      } else {
        const t = findTarget();
        if (t) {
          const dealt = applyDamageToUnit(t, val);
          siphonHeal(card, caster, dealt, t);
        }
      }
      break;
    }
    case 'freeze': {
      const t = findTarget();
      if (t) {
        // §3 Freeze persists until the end of the target controller's next
        // full turn: freezing your own-side card mid-turn needs 2 ticks.
        t.frozen = t.ownerId === caster.id ? 2 : 1;
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
        const item = t.attachedItems[0];
        const itemCost = Object.values(item.cost || {}).reduce((a, b) => a + b, 0);
        detachItem(t, item.instanceId, next.players[item.ownerId].graveyard);
        const dealt = applyDamageToUnit(t, itemCost);
        siphonHeal(card, caster, dealt, t);
        next.log.push(`Meltdown destroyed ${item.name}; ${t.name} took ${itemCost} Flame damage.`);
      }
      break;
    }
    case 'purge': {
      // §3 Purge: strip Items, statuses and temporary buffs from the target.
      const t = findTarget();
      if (t) {
        while (t.attachedItems.length > 0) {
          const item = t.attachedItems[0];
          detachItem(t, item.instanceId, next.players[item.ownerId].graveyard);
        }
        t.bonusDamage = 0;
        t.scorch = 0;
        t.frozen = 0;
        t.glitched = false;
        t.tempAtk = 0;
        t.tempHp = 0;
        t.tainted = 0;
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
  // State-Based Death Sweep (§5.3): dynamic max health (Phalanx) can drop a
  // damaged Unit to 0 remaining HP from ANY action (e.g. its neighbors
  // exhausting to attack), so the death check runs after every action.
  if (next.phase !== 'INIT' && next.phase !== 'MULLIGAN') {
    cleanupDeaths(next);
    checkWin(next);
  }
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
      if (next.phase !== 'INIT') return next;
      next.phase = 'MULLIGAN';
      next.log.push('Mulligan phase started.');
      return next;

    case 'KEEP_HAND': {
      // Server authority (§1.2): keeping a hand is only legal during the
      // Mulligan phase, and only once per player.
      if (next.phase !== 'MULLIGAN') return next;
      const p = next.players[action.playerId];
      if (!p || p.mulliganKept) return next;
      // London Mulligan: bottom X cards, X = number of mulligans taken (§1.2).
      const x = p.mulliganCount;
      if (x > 0) {
        // Server authority: exactly X cards go to the bottom, no matter what
        // the client sent. Bogus/duplicate ids cannot dodge the penalty —
        // any shortfall is topped up from the back of the hand.
        const ids = [...new Set(action.bottomIds || [])];
        const toBottom: GameCard[] = [];
        for (const id of ids) {
          if (toBottom.length >= x) break;
          const idx = p.hand.findIndex((c) => c.instanceId === id);
          if (idx >= 0) toBottom.push(p.hand.splice(idx, 1)[0]);
        }
        while (toBottom.length < x && p.hand.length > 0) {
          toBottom.push(p.hand.pop()!);
        }
        p.deck.unshift(...toBottom);
        if (toBottom.length)
          next.log.push(`${p.name} put ${toBottom.length} card(s) on the bottom.`);
      }
      p.mulliganKept = true;
      maybeStartFirstTurn(next);
      return next;
    }

    case 'MULLIGAN': {
      // Server authority (§1.2): no re-shuffling once the hand is kept or
      // after the Mulligan phase has ended.
      if (next.phase !== 'MULLIGAN') return next;
      const p = next.players[action.playerId];
      if (!p || p.mulliganKept) return next;
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
      const natural = Math.floor(Math.random() * 6) + 1;
      let roll = natural;
      // Photosynthesis (§2.3): an even natural roll grants +1 Nature resource.
      if (roll % 2 === 0) {
        for (const c of activePlayer.charms) {
          if (c.charmActivated && hasKeyword(c, 'Photosynthesis') && !c.glitched) {
            activePlayer.resources.Nature = (activePlayer.resources.Nature || 0) + 1;
            next.log.push(`Photosynthesis (${c.name}): even roll grants +1 Nature.`);
          }
        }
      }
      // Confluence [X] (new set): the active Location grants its controller
      // extra Generic resources at the Resource Roll.
      if (next.activeLocation && next.activeLocationOwnerId === activePlayer.id) {
        const conf = keywordValue(next.activeLocation, 'Confluence');
        if (conf > 0) {
          activePlayer.resources.Generic = (activePlayer.resources.Generic || 0) + conf;
          next.log.push(`Confluence (${next.activeLocation.name}): +${conf} Generic resource(s).`);
        }
      }
      // Flourish [X] (new set): active sources grant X Nature at the roll.
      const flourish = auraValue(next, activePlayer.id, 'Flourish');
      if (flourish > 0) {
        activePlayer.resources.Nature = (activePlayer.resources.Nature || 0) + flourish;
        next.log.push(`Flourish grants +${flourish} Nature.`);
      }
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
      if (next.activeLocationOwnerId === activePlayer.id && next.activeLocation)
        fixSources.push(next.activeLocation);
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
      next.log.push(
        `${activePlayer.name} rolled a ${natural}${roll !== natural ? ` (modified to ${roll})` : ''} — ${roll} to allocate.`,
      );
      // If nothing to allocate, skip straight through.
      if (roll <= 0) {
        return gameReducer(next, { type: 'ALLOCATE_RESOURCES', allocations: {} });
      }
      return next;
    }

    case 'ALLOCATE_RESOURCES': {
      if (next.phase !== 'ALLOCATE') return next;
      // Validate: only the Leader's elements are legal, and the total cannot
      // exceed this turn's roll (§2.1.1).
      const legalElements = activePlayer.leader.elements.filter((e) => e !== 'Generic');
      let budget = next.pendingRoll || 0;
      for (const [element, amount] of Object.entries(action.allocations)) {
        if (!legalElements.includes(element as any)) continue;
        const granted = Math.max(0, Math.min(Math.floor(amount), budget));
        if (granted <= 0) continue;
        budget -= granted;
        activePlayer.resources[element] = (activePlayer.resources[element] || 0) + granted;
      }
      next.pendingRoll = null;

      // Pure (§2.3): remember whether the whole roll landed in a single color.
      // Generic resources (e.g. from Overclock) are not part of the roll.
      const colorsUsed = Object.entries(activePlayer.resources).filter(
        ([el, v]) => el !== 'Generic' && v > 0,
      );
      activePlayer.singleColorRoll = colorsUsed.length === 1;

      // Decay [X] (§2.3): after the Resource Roll completes but before the
      // Draw Phase, deal X Dark damage to all Units the afflicted player controls.
      for (const c of activePlayer.charms) {
        const decay = c.charmActivated && !c.glitched ? keywordValue(c, 'Decay') : 0;
        if (decay > 0 && activePlayer.board.length > 0) {
          for (const u of activePlayer.board) applyDamageToUnit(u, decay);
          next.log.push(`Decay (${c.name}) deals ${decay} to all of ${activePlayer.name}'s Units.`);
        }
      }
      cleanupDeaths(next);

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
        u.commandedThisTurn = false;
        u.abilityUsedThisTurn = false;
        for (const it of u.attachedItems) it.abilityUsedThisTurn = false;
      }
      activePlayer.leader.exhausted = false;
      activePlayer.leader.abilityUsedThisTurn = false;
      for (const loc of activePlayer.locations) loc.abilityUsedThisTurn = false;

      if ((next.phase as string) !== 'GAME_OVER') next.phase = 'ACTION';
      return next;
    }

    case 'PLAY_CARD': {
      if (next.phase !== 'ACTION') return next;

      let cardIdx = activePlayer.hand.findIndex((c) => c.instanceId === action.instanceId);
      let fromGraveyard = false;
      if (cardIdx === -1) {
        cardIdx = activePlayer.graveyard.findIndex((c) => c.instanceId === action.instanceId);
        if (cardIdx !== -1) {
          const card = activePlayer.graveyard[cardIdx];
          if (card.type === 'Unit' && kwActive(card, 'Graveborn')) {
            fromGraveyard = true;
          } else {
            return next;
          }
        } else {
          return next;
        }
      }
      const card = fromGraveyard ? activePlayer.graveyard[cardIdx] : activePlayer.hand[cardIdx];
      // Efficient (new set): a banked discount shrinks the next Unit's cost.
      const effCost =
        card.type === 'Unit'
          ? discountCost(card.cost, activePlayer.deployDiscount || 0)
          : card.cost;
      // Glacier (new set): enemy auras surcharge this player's Events.
      const glacierTax = card.type === 'Event' ? auraValue(next, opponentId, 'Glacier') : 0;
      const upfront =
        glacierTax > 0
          ? { ...(effCost || {}), Generic: (effCost?.Generic || 0) + glacierTax }
          : effCost;
      if (!canAfford(upfront, activePlayer.resources)) {
        if (glacierTax > 0) next.log.push(`Cannot pay the Glacier ${glacierTax} surcharge.`);
        return next;
      }

      // Location Zone cap: at most 3 face-down Locations per player (§3.1).
      if (card.type === 'Location' && activePlayer.locations.length >= 3) {
        next.log.push('Your Location Zone is full (max 3 face-down Locations).');
        return next;
      }

      // Determine target for cards that need one. Wildcast Events pick their
      // own random targets, so they never wait for a manual selection.
      const needsTarget =
        (card.type === 'Event' &&
          !kwActive(card, 'Wildcast') &&
          card.effect &&
          ['unit', 'friendly'].includes(card.effect.target || '')) ||
        card.type === 'Item';
      // Events may also legally reference a Leader (e.g. Purge on your own
      // Leader to strip hostile Charms); Items only ever target Units.
      const targetPool =
        card.type === 'Event'
          ? [...activePlayer.board, ...opponent.board, activePlayer.leader, opponent.leader]
          : [...activePlayer.board, ...opponent.board];
      const targetCard = action.targetId
        ? targetPool.find((c) => c.instanceId === action.targetId)
        : undefined;
      if (needsTarget && !targetCard) return next; // wait for a valid target

      // 'friendly'-target effects may only be aimed at the caster's own Units
      // (§5.3 Targeting Law) — the server rejects a mis-aimed cast outright
      // rather than letting the resources burn on a no-op.
      if (
        card.type === 'Event' &&
        !kwActive(card, 'Wildcast') &&
        card.effect?.target === 'friendly' &&
        targetCard &&
        (targetCard.ownerId !== activePlayer.id || targetCard.type !== 'Unit')
      ) {
        next.log.push(`${card.name} can only target one of your own Units.`);
        return next;
      }

      // Events aimed at the enemy Leader (effect.target 'leader') carry no
      // explicit targetId, but they still target that Leader for the purposes
      // of Guard, Ward and Feedback (§2.1/§2.2).
      // Hostile Charms (Decay) land on the enemy player, so they interact with
      // the enemy Leader's Ward/Feedback the same way a targeted Event would.
      const implicitTarget =
        !targetCard &&
        ((card.type === 'Event' &&
          !kwActive(card, 'Wildcast') &&
          card.effect?.target === 'leader') ||
          (card.type === 'Charm' && hasKeyword(card, 'Decay')))
          ? opponent.leader
          : undefined;
      const interactTarget = targetCard ?? implicitTarget;

      // Items attach only to friendly Units with spare capacity (§5.3 Capacity Law).
      if (card.type === 'Item' && targetCard) {
        if (targetCard.type !== 'Unit' || targetCard.ownerId !== activePlayer.id) return next;
        if (targetCard.attachedItems.length >= maxItemCapacity(targetCard)) {
          next.log.push(`${targetCard.name} has no free Item capacity.`);
          return next;
        }
      }

      const targetsEnemy = !!interactTarget && interactTarget.ownerId !== activePlayer.id;

      // Lurk vs Guard Conflict (§2.1): Lurk lifts after the unit's first attack.
      if (
        targetsEnemy &&
        interactTarget &&
        interactTarget.type === 'Unit' &&
        lurkProtected(interactTarget)
      ) {
        next.log.push(`Cannot target ${interactTarget.name} because it has Lurk.`);
        return next;
      }

      // Guard (§2.1): targeted enemy Events must target a Unit with Guard
      // while the defender has a ready Guard Unit. This also blocks Events
      // aimed at the enemy Leader.
      const readyGuards = opponent.board.filter(
        (u) => kwActive(u, 'Guard') && !u.exhausted && u.frozen === 0,
      );
      if (readyGuards.length > 0 && card.type === 'Event' && !kwActive(card, 'Wildcast')) {
        if (targetsEnemy && !readyGuards.some((g) => g.instanceId === interactTarget!.instanceId)) {
          next.log.push('A ready Guard Unit forces enemy Events to target it.');
          return next;
        }
      }

      // Ward [X] (§2.1): targeting an enemy card costs extra; targeting is
      // locked if the surcharge cannot be paid. Beacon (new set) grants the
      // defender's Units aura Ward on top of any printed Ward.
      const beaconWard =
        targetsEnemy && interactTarget!.type === 'Unit'
          ? auraValue(next, interactTarget!.ownerId, 'Beacon')
          : 0;
      const wardCost = (targetsEnemy ? kwValueActive(interactTarget!, 'Ward') : 0) + beaconWard;
      if (wardCost > 0) {
        const combined = { ...(effCost || {}) };
        combined.Generic = (combined.Generic || 0) + wardCost + glacierTax;
        if (!canAfford(combined, activePlayer.resources)) {
          next.log.push(`Cannot pay the Ward ${wardCost} surcharge.`);
          return next;
        }
      }

      const paidBase = payCost(effCost, activePlayer.resources);
      const paidWard =
        wardCost > 0 ? payCost({ Generic: wardCost }, activePlayer.resources) : undefined;
      let paidGlacier: Record<string, number> | undefined;
      if (glacierTax > 0) {
        paidGlacier = payCost({ Generic: glacierTax }, activePlayer.resources);
        next.log.push(
          `Glacier: ${activePlayer.name} paid ${glacierTax} extra to cast ${card.name}.`,
        );
      }

      if (fromGraveyard) {
        activePlayer.graveyard.splice(cardIdx, 1);
      } else {
        activePlayer.hand.splice(cardIdx, 1);
      }

      // Overclock keyword triggers: grants resource, adds penalty
      const overclockVal = kwValueActive(card, 'Overclock');
      if (overclockVal > 0) {
        activePlayer.resources.Generic = (activePlayer.resources.Generic || 0) + overclockVal;
        activePlayer.overclockPenalty += overclockVal;
        next.log.push(
          `${activePlayer.name} triggered Overclock ${overclockVal}: Gained ${overclockVal} resources now, but will suffer -${overclockVal} on next roll.`,
        );
      }

      // Feedback (§2.2): targeted enemy may negate on a d6 of 4-6, refunding
      // everything spent (base cost and Ward surcharge) exactly.
      if (targetsEnemy && kwActive(interactTarget!, 'Feedback')) {
        const roll = Math.floor(Math.random() * 6) + 1;
        if (roll >= 4) {
          next.log.push(
            `${interactTarget!.name}'s Feedback negated ${card.name} (rolled ${roll}). Resources refunded.`,
          );
          refund(paidBase, activePlayer.resources);
          refund(paidWard, activePlayer.resources);
          refund(paidGlacier, activePlayer.resources);
          if (overclockVal > 0) {
            activePlayer.resources.Generic = Math.max(
              0,
              (activePlayer.resources.Generic || 0) - overclockVal,
            );
            activePlayer.overclockPenalty = Math.max(
              0,
              activePlayer.overclockPenalty - overclockVal,
            );
          }
          if (fromGraveyard) {
            activePlayer.graveyard.push(card); // negated Graveborn cast returns to the graveyard
          } else {
            // Feedback negates the effect, not the card: it returns to hand.
            activePlayer.hand.push(card);
          }
          return next;
        }
      }

      if (card.type === 'Unit') {
        if (fromGraveyard) {
          // Graveborn recast (§2.1): the Unit re-enters play as a fresh copy —
          // damage, statuses and combat history do not follow it out of the
          // graveyard (it died with lethal damage marked on it).
          card.damageTaken = 0;
          card.bonusDamage = 0;
          card.exhausted = false;
          card.summoningSickness = !kwActive(card, 'Blitz');
          card.scorch = 0;
          card.frozen = 0;
          card.glitched = false;
          card.armor = keywordValue(card, 'Armor');
          card.witherAtk = 0;
          card.witherHp = 0;
          card.tempAtk = 0;
          card.tempHp = 0;
          card.tainted = 0;
          card.attacksThisTurn = 0;
          card.hasAttacked = false;
          card.attachedItems = [];
        }
        // Rally [X] (§2.1): deploying a Unit from hand costing X or less
        // grants it +1/+1 until this turn's Cleanup Phase.
        const rally = kwValueActive(activePlayer.leader, 'Rally');
        const deployCost = Object.values(card.cost || {}).reduce((a, b) => a + b, 0);
        if (rally > 0 && !fromGraveyard && deployCost <= rally) {
          card.tempAtk += 1;
          card.tempHp += 1;
          next.log.push(`Rally ${rally}: ${card.name} gains +1/+1 until Cleanup.`);
        }
        activePlayer.board.push(card);
        next.log.push(`${activePlayer.name} deployed ${card.name}.`);
        // Inspire (new set): active auras grant deployed Units +X/+X until Cleanup.
        const inspire = auraValue(next, activePlayer.id, 'Inspire');
        if (inspire > 0) {
          card.tempAtk += inspire;
          card.tempHp += inspire;
          next.log.push(`Inspire: ${card.name} gains +${inspire}/+${inspire} until Cleanup.`);
        }
        // Sync (new set): active auras convert deployments into Generic resources.
        const sync = auraValue(next, activePlayer.id, 'Sync');
        if (sync > 0) {
          activePlayer.resources.Generic = (activePlayer.resources.Generic || 0) + sync;
          next.log.push(`Sync: ${activePlayer.name} gains ${sync} Generic resource(s).`);
        }
        // Efficient (new set): the banked discount is spent on this deploy.
        if ((activePlayer.deployDiscount || 0) > 0) {
          next.log.push(
            `Efficient: ${card.name}'s cost was reduced by ${activePlayer.deployDiscount}.`,
          );
          activePlayer.deployDiscount = 0;
        }
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
        next.log.push(
          `${activePlayer.name} played the Charm ${card.name}${harmful ? ' on the opponent' : ''}.`,
        );
      } else if (card.type === 'Event') {
        next.log.push(`${activePlayer.name} cast ${card.name}.`);
        const wildcastVal = kwValueActive(card, 'Wildcast');
        if (
          wildcastVal > 0 &&
          card.effect &&
          ['unit', 'friendly'].includes(card.effect.target || '')
        ) {
          const isFriendlyOnly = card.effect.target === 'friendly';
          // §2.3 Wildcast: random battlefield targets, Leaders included.
          const eligiblePool = isFriendlyOnly
            ? [...activePlayer.board]
            : [...activePlayer.board, ...opponent.board, activePlayer.leader, opponent.leader];

          const validPool = eligiblePool.filter(
            (u) => u.ownerId === activePlayer.id || !lurkProtected(u),
          );

          // Fair Shuffling (§6): Fisher-Yates — comparator shuffles are biased.
          const shuffled = [...validPool];
          for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
          }
          const chosenTargets = shuffled.slice(0, wildcastVal);

          if (chosenTargets.length > 0) {
            next.log.push(
              `Wildcast ${wildcastVal} triggers! Selecting ${chosenTargets.length} unique random target(s).`,
            );
            for (const t of chosenTargets) {
              resolveEvent(next, activePlayer, opponent, card, t.instanceId);
            }
          } else {
            next.log.push(`Wildcast ${wildcastVal} triggered, but no valid targets were found.`);
          }
        } else {
          resolveEvent(next, activePlayer, opponent, card, action.targetId);
        }

        // Efficient [X] (new set): bank a cost discount for the next Unit
        // deployed this turn (unused discounts expire at Cleanup).
        const efficient = kwActive(card, 'Efficient')
          ? Math.max(1, keywordValue(card, 'Efficient'))
          : 0;
        if (efficient > 0) {
          activePlayer.deployDiscount = (activePlayer.deployDiscount || 0) + efficient;
          next.log.push(
            `Efficient ${efficient}: the next Unit ${activePlayer.name} deploys this turn costs ${efficient} less.`,
          );
        }

        // Rummage [X] (new set): draw X (Deckout Law applies), then discard 1
        // card at random if anything was drawn.
        const rummage = kwActive(card, 'Rummage') ? Math.max(1, keywordValue(card, 'Rummage')) : 0;
        if (rummage > 0) {
          let drew = 0;
          for (let i = 0; i < rummage; i++) {
            if (activePlayer.deck.length > 0) {
              activePlayer.hand.push(activePlayer.deck.pop()!);
              drew++;
            } else {
              activePlayer.leader.damageTaken += 2;
              recalcHealth(activePlayer);
              next.log.push(`${activePlayer.name} took 2 deckout damage (Rummage).`);
            }
          }
          if (drew > 0 && activePlayer.hand.length > 0) {
            const idx = Math.floor(Math.random() * activePlayer.hand.length);
            const tossed = activePlayer.hand.splice(idx, 1)[0];
            activePlayer.graveyard.push(tossed);
            next.log.push(
              `Rummage ${rummage}: ${activePlayer.name} drew ${drew} and discarded ${tossed.name}.`,
            );
          }
          checkWin(next);
        }

        // Echo (§2.3): Chaos Events may duplicate on a d6 of 5-6.
        if (hasKeyword(card, 'Echo')) {
          const roll = Math.floor(Math.random() * 6) + 1;
          if (roll >= 5) {
            next.log.push(`Echo duplicated ${card.name}!`);
            // random target for the copy — Lurk still protects enemy Units
            const pool =
              card.effect?.target === 'friendly'
                ? activePlayer.board
                : opponent.board.filter((u) => !lurkProtected(u));
            const rnd = pool[Math.floor(Math.random() * pool.length)];
            resolveEvent(next, activePlayer, opponent, card, rnd?.instanceId);
          }
        }
        activePlayer.graveyard.push(card);
      }
      return next;
    }

    case 'ACTIVATE_ABILITY': {
      if (next.phase !== 'ACTION') return next;
      // Find the permanent on the board (Unit, Location, Leader, or Item)
      let source =
        activePlayer.board.find((c) => c.instanceId === action.instanceId) ||
        activePlayer.locations.find((c) => c.instanceId === action.instanceId);
      if (!source && activePlayer.leader.instanceId === action.instanceId)
        source = activePlayer.leader;
      if (!source) {
        // Check items attached to units
        for (const u of activePlayer.board) {
          const item = u.attachedItems.find((it) => it.instanceId === action.instanceId);
          if (item) {
            source = item;
            break;
          }
        }
      }
      if (!source || !source.effect || source.glitched) return next;
      // Freeze (§3) also locks activated abilities; abilities are once per turn.
      if (source.frozen > 0) {
        next.log.push(`${source.name} is Frozen and cannot use its ability.`);
        return next;
      }
      if (source.abilityUsedThisTurn) {
        next.log.push(`${source.name}'s ability was already used this turn.`);
        return next;
      }

      // Ensure cost can be paid (assuming ability cost is stored in the card's base cost for simplicity,
      // or we can allow 0 cost if missing)
      if (!canAfford(source.cost, activePlayer.resources)) {
        next.log.push(`Cannot afford ${source.name}'s ability cost.`);
        return next;
      }

      const needsTarget = ['unit', 'friendly'].includes(source.effect.target || '');
      const targetPool = [
        ...activePlayer.board,
        ...opponent.board,
        activePlayer.leader,
        opponent.leader,
      ];
      const targetCard = action.targetId
        ? targetPool.find((c) => c.instanceId === action.targetId)
        : undefined;

      if (needsTarget && !targetCard) return next;

      // 'friendly'-target abilities may only be aimed at the owner's own Units.
      if (
        source.effect.target === 'friendly' &&
        targetCard &&
        (targetCard.ownerId !== activePlayer.id || targetCard.type !== 'Unit')
      ) {
        next.log.push(`${source.name}'s ability can only target one of your own Units.`);
        return next;
      }

      // Abilities aimed at the enemy Leader implicitly target it (Ward/Guard/Feedback).
      const implicitTarget =
        !targetCard && source.effect.target === 'leader' ? opponent.leader : undefined;
      const interactTarget = targetCard ?? implicitTarget;
      const targetsEnemy = !!interactTarget && interactTarget.ownerId !== activePlayer.id;

      if (
        targetsEnemy &&
        interactTarget &&
        interactTarget.type === 'Unit' &&
        lurkProtected(interactTarget)
      ) {
        next.log.push(`Cannot target ${interactTarget.name} because it has Lurk.`);
        return next;
      }

      const readyGuards = opponent.board.filter(
        (u) => kwActive(u, 'Guard') && !u.exhausted && u.frozen === 0,
      );
      if (
        readyGuards.length > 0 &&
        targetsEnemy &&
        !readyGuards.some((g) => g.instanceId === interactTarget!.instanceId)
      ) {
        next.log.push('A ready Guard Unit forces enemy abilities to target it.');
        return next;
      }

      const abilityBeacon =
        targetsEnemy && interactTarget!.type === 'Unit'
          ? auraValue(next, interactTarget!.ownerId, 'Beacon')
          : 0;
      const wardCost = (targetsEnemy ? kwValueActive(interactTarget!, 'Ward') : 0) + abilityBeacon;
      if (wardCost > 0) {
        const combined = { ...(source.cost || {}) };
        combined.Generic = (combined.Generic || 0) + wardCost;
        if (!canAfford(combined, activePlayer.resources)) {
          next.log.push(`Cannot pay the Ward ${wardCost} surcharge.`);
          return next;
        }
      }

      const paidAbility = payCost(source.cost, activePlayer.resources);
      const paidAbilityWard =
        wardCost > 0 ? payCost({ Generic: wardCost }, activePlayer.resources) : undefined;

      // Feedback negates abilities without bouncing the source
      if (targetsEnemy && kwActive(interactTarget!, 'Feedback')) {
        const roll = Math.floor(Math.random() * 6) + 1;
        if (roll >= 4) {
          next.log.push(
            `${interactTarget!.name}'s Feedback negated ${source.name}'s ability (rolled ${roll}). Resources refunded.`,
          );
          refund(paidAbility, activePlayer.resources);
          refund(paidAbilityWard, activePlayer.resources);
          return next; // ability is negated, source remains on board
        }
      }

      source.abilityUsedThisTurn = true;
      next.log.push(`${activePlayer.name} activated ${source.name}'s ability.`);
      resolveEvent(next, activePlayer, opponent, source, action.targetId);

      return next;
    }

    case 'LEADER_COMMAND': {
      // Command [X] (§2.1): pay X resources to instantly ready a friendly
      // Unit; it ignores summoning sickness and may attack again this turn.
      if (next.phase !== 'ACTION') return next;
      const x = kwValueActive(activePlayer.leader, 'Command');
      if (x <= 0) return next;
      if (activePlayer.leader.frozen > 0) return next; // Freeze locks Leader abilities (§3)
      const target = activePlayer.board.find(
        (u) => u.instanceId === action.targetId && u.type === 'Unit',
      );
      if (!target) return next;
      if (target.frozen > 0) {
        next.log.push(`${target.name} is Frozen and cannot be Commanded.`);
        return next;
      }
      // Command Cap (§2.1): each Unit may be Commanded only once per turn.
      // Without this cap, Command + resource-on-hit effects (Surge) chain
      // into an infinite attack loop.
      if (target.commandedThisTurn) {
        next.log.push(`${target.name} was already Commanded this turn.`);
        return next;
      }
      if (!canAfford({ Generic: x }, activePlayer.resources)) return next;
      payCost({ Generic: x }, activePlayer.resources);
      target.commandedThisTurn = true;
      target.exhausted = false;
      target.summoningSickness = false;
      target.attacksThisTurn = Math.max(0, target.attacksThisTurn - 1);
      next.log.push(
        `${activePlayer.name}'s Leader Commands ${target.name}: readied for another attack.`,
      );
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
      // Target validation (§2.1/§5.1): attacks may only be aimed at the enemy
      // Leader or an enemy Unit that is not Lurk-protected.
      const declaredTarget = [opponent.leader, ...opponent.board].find(
        (c) => c.instanceId === action.targetId,
      );
      if (!declaredTarget) return next;
      if (declaredTarget.type === 'Unit' && lurkProtected(declaredTarget)) {
        next.log.push(`Cannot attack ${declaredTarget.name}: it has Lurk.`);
        return next;
      }
      const unit = activePlayer.board.find((u) => u.instanceId === action.instanceId);
      if (unit) {
        const maxAttacks = kwActive(unit, 'Overdrive') ? 2 : 1;
        if (unit.summoningSickness || unit.frozen > 0 || unit.attacksThisTurn >= maxAttacks)
          return next;
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
        // Guard Interlock (§5.2): a ready Guard Unit intercepts Leader strikes,
        // so the Survival Caveat must be measured against the Guard's counter.
        let target: GameCard | undefined = declaredTarget;
        const guard = opponent.board.find(
          (u) => kwActive(u, 'Guard') && !u.exhausted && u.frozen === 0,
        );
        if (guard) target = guard;
        // Pipeline-aware (§5.4): the caveat measures the counter as it would
        // actually land on our Leader (Armor/Brittle/Taint included).
        const counter = target ? projectedDamage(activePlayer.leader, effAttack(target, next)) : 0;
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
      // Phase guard: a stray second submit (or one sent during the block step)
      // must not re-pay Burden or re-increment attacksThisTurn.
      if (next.phase !== 'COMBAT_DECLARE' || !next.combat) return next;
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
          u.hasAttacked = true; // lifts Lurk protection for the rest of the match
          confirmed.push(att);
        } else if (activePlayer.leader.instanceId === att.instanceId) {
          activePlayer.leader.exhausted = true;
          activePlayer.leader.hasAttacked = true;
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
      if (!next.combat || next.phase !== 'COMBAT_BLOCK') return next;
      // Only the defender's ready, unfrozen Units may block, and only against
      // an actually-declared attacker (§5.1).
      const blocker = opponent.board.find((u) => u.instanceId === action.blockerId);
      if (!blocker || blocker.type !== 'Unit' || blocker.exhausted || blocker.frozen > 0)
        return next;
      if (!next.combat.attackers.some((a) => a.instanceId === action.attackerId)) return next;
      // §5.1: a blocker blocks at most one attacker, but multiple blockers may
      // combine to block a single attacker.
      const already = next.combat.blockers.find(
        (b) => b.blockerId === action.blockerId && b.attackerId === action.attackerId,
      );
      // remove any block involving this blocker
      next.combat.blockers = next.combat.blockers.filter((b) => b.blockerId !== action.blockerId);
      if (!already) {
        next.combat.blockers.push({ attackerId: action.attackerId, blockerId: action.blockerId });
      }
      return next;
    }

    case 'SUBMIT_BLOCKS': {
      // Only the defender may resolve combat, and only during the block step —
      // otherwise the attacker could skip the opponent's blocks entirely.
      if (next.phase !== 'COMBAT_BLOCK' || !next.combat) return next;
      return resolveCombat(next, activePlayer, opponent);
    }

    case 'END_TURN': {
      if (next.phase !== 'ACTION') return next; // turn can only end from the Action phase
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
  // Taint [X] (new set): the damaged Unit takes +X from all sources until Cleanup.
  const taint = kwValueActive(attacker, 'Taint');
  if (taint > 0 && target.type === 'Unit') {
    target.tainted = (target.tainted || 0) + taint;
    next.log.push(`${target.name} was Tainted ${taint}.`);
  }
  // Inferno (new set): combat damage splashes 1 onto the victim's other Units.
  if (kwActive(attacker, 'Inferno') && target.type === 'Unit') {
    const victims = playerOf(next, target).board.filter((u) => u.instanceId !== target.instanceId);
    for (const u of victims) applyDamageToUnit(u, 1);
    if (victims.length > 0) {
      next.log.push(
        `${attacker.name}'s Inferno splashed 1 damage onto ${victims.length} other Unit(s).`,
      );
    }
  }
  // Surge (new set): each Surge Item on the damage dealer taps 1 Generic resource.
  if (attacker.type === 'Unit' && target.ownerId !== attacker.ownerId) {
    const surges = (attacker.attachedItems || []).filter(
      (it) => !it.glitched && hasKeyword(it, 'Surge'),
    ).length;
    if (surges > 0) {
      const ctrl = playerOf(next, attacker);
      ctrl.resources.Generic = (ctrl.resources.Generic || 0) + surges;
      next.log.push(`Surge: ${ctrl.name} gained ${surges} Generic resource(s).`);
    }
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
function resolveCombat(
  next: GameState,
  activePlayer: PlayerState,
  opponent: PlayerState,
): GameState {
  if (!next.combat) return next;
  const entityMap = new Map<string, GameCard>();
  [activePlayer.leader, opponent.leader, ...activePlayer.board, ...opponent.board].forEach((e) => {
    if (e) entityMap.set(e.instanceId, e);
  });

  for (const attack of next.combat.attackers) {
    const attacker = entityMap.get(attack.instanceId);
    if (!attacker) continue;
    const blocks = next.combat.blockers.filter((b) => b.attackerId === attack.instanceId);
    const attackerAtk = effAttack(attacker, next);

    if (blocks.length > 0) {
      // Blocked: attacker damage is assigned across the blockers in declared
      // order; every blocker deals full counter-damage (blocking does not
      // exhaust the blocker).
      let dmgLeft = attackerAtk;
      for (const block of blocks) {
        const blocker = entityMap.get(block.blockerId);
        if (!blocker || isDead(blocker, next)) continue; // died earlier in the wave
        const blockerRemaining = totalRemaining(blocker, next);
        // Assign enough to chew through Armor + remaining health, capped by what's left.
        const assigned = Math.min(dmgLeft, blockerRemaining + effArmor(blocker));
        const dealt = assigned > 0 ? applyDamageToUnit(blocker, assigned) : 0;
        dmgLeft -= assigned;
        siphonHeal(attacker, playerOf(next, attacker), dealt, blocker);
        if (dealt > 0) onCombatDamageToUnit(next, attacker, blocker);
        const counter = effAttack(blocker, next);
        const counterDealt = applyDamageToUnit(attacker, counter);
        if (counterDealt > 0) onCombatDamageToUnit(next, blocker, attacker);
        if (dealt > 0 && isDead(blocker, next)) reapHeal(next, attacker, blocker);
        if (counterDealt > 0 && isDead(attacker, next)) reapHeal(next, blocker, attacker);
        // Vengeance [X] (new set): a blocker strikes the attacking Unit for X
        // extra damage on top of its normal counter.
        const venge = kwActive(blocker, 'Vengeance')
          ? Math.max(1, keywordValue(blocker, 'Vengeance'))
          : 0;
        if (venge > 0 && attacker.type === 'Unit' && !isDead(attacker, next)) {
          const vDealt = applyDamageToUnit(attacker, venge);
          if (vDealt > 0) {
            next.log.push(`${blocker.name}'s Vengeance dealt ${venge} extra to ${attacker.name}.`);
            if (isDead(attacker, next)) reapHeal(next, blocker, attacker);
          }
        }
        if (isDead(attacker, next)) break; // attacker died mid-swing; wave ends
      }
      // Pierce (§2.1): overflow beyond the blockers' remaining health goes to
      // the defending Leader.
      if (kwActive(attacker, 'Pierce') && dmgLeft > 0 && !isDead(attacker, next)) {
        const dealt = damageLeader(next, opponent.leader, dmgLeft);
        siphonHeal(attacker, playerOf(next, attacker), dealt, opponent.leader);
        next.log.push(`${attacker.name} Pierced ${dmgLeft} to ${opponent.name}'s Leader.`);
      }
    } else {
      // Unblocked: hit the declared target. A target already destroyed
      // earlier in the wave neither absorbs the hit nor counter-attacks —
      // the attack simply fizzles (the attacker stays exhausted).
      let target = entityMap.get(attack.targetId);
      if (!target) continue;
      if (target.type === 'Unit' && isDead(target, next)) {
        next.log.push(`${attacker.name}'s attack fizzled: its target was already destroyed.`);
        continue;
      }
      if (attacker.type === 'Unit' && isDead(attacker, next)) continue; // attacker died to an earlier counter
      // Guard Interlock (§2.1/§5.2): while a ready Guard Unit stands, every
      // enemy attack (Leader strikes included) is forced onto a Guard Unit.
      if (target.ownerId === opponent.id && !kwActive(target, 'Guard')) {
        const guard = opponent.board.find(
          (u) => kwActive(u, 'Guard') && !u.exhausted && u.frozen === 0 && !isDead(u, next),
        );
        if (guard) {
          target = guard;
          next.log.push(`${attacker.name} is forced to strike the Guard unit ${guard.name}.`);
        }
      }
      if (target.type === 'Leader') {
        if (attacker.type === 'Leader') {
          // Leader vs Leader: half damage (rounded down, min 1), full counter
          // (§5.2); both hits run the standard pipeline (§5.4).
          const dmg = Math.max(1, Math.floor(attackerAtk / 2));
          const dealt = damageLeader(next, target, dmg);
          siphonHeal(attacker, playerOf(next, attacker), dealt, target);
          if (dealt > 0) onCombatDamageToUnit(next, attacker, target);
          const counter = effAttack(target, next);
          damageLeader(next, attacker, counter);
        } else {
          const dealt = damageLeader(next, target, attackerAtk);
          siphonHeal(attacker, playerOf(next, attacker), dealt, target);
          if (dealt > 0) onCombatDamageToUnit(next, attacker, target);
        }
      } else {
        // Leader (or unit) attacking a Unit: full both ways (§5.2).
        const dealt = applyDamageToUnit(target, attackerAtk);
        siphonHeal(attacker, playerOf(next, attacker), dealt, target);
        if (dealt > 0) onCombatDamageToUnit(next, attacker, target);
        const counter = effAttack(target, next);
        if (attacker.type === 'Leader') {
          damageLeader(next, attacker, counter);
        } else {
          const counterDealt = applyDamageToUnit(attacker, counter);
          if (counterDealt > 0) onCombatDamageToUnit(next, target, attacker);
        }
        if (dealt > 0 && isDead(target, next)) reapHeal(next, attacker, target);
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
