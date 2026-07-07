/**
 * Targeted engine regression tests for game rules and keywords.
 * Usage: npx tsx scripts/engine-tests.ts
 */
import {
  initialGameState,
  gameReducer,
  payCost,
  canAfford,
  maxItemCapacity,
  effAttack,
  effMaxHealth,
} from '../src/game/engine';
import { makeToken } from '../src/game/cards';
import { GameState, GameCard } from '../src/types';

let passed = 0;
let failed = 0;
function assert(cond: boolean, name: string) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('FAIL: ' + name);
  }
}

/** A game state fast-forwarded into the ACTION phase with empty boards. */
function actionState(): GameState {
  let s = initialGameState(true);
  s.activePlayerId = 'p1';
  s.firstPlayerId = 'p1';
  s = gameReducer(s, { type: 'START_GAME' });
  s = gameReducer(s, { type: 'KEEP_HAND', playerId: 'p1' });
  s = gameReducer(s, { type: 'KEEP_HAND', playerId: 'p2' });
  s.turnNumber = 3; // past turn-1 combat restrictions
  s.phase = 'ACTION';
  return s;
}

function addUnit(
  s: GameState,
  owner: string,
  atk: number,
  hp: number,
  keywords: string[] = [],
): GameCard {
  const u = makeToken('Test ' + keywords.join('/'), atk, hp, owner);
  u.keywords = keywords;
  u.summoningSickness = false;
  s.players[owner].board.push(u);
  return u;
}

// --- payCost: generic cost drains the largest pool first --------------------
{
  const res: Record<string, number> = { Frost: 1, Tech: 3 };
  payCost({ Generic: 2 }, res);
  assert(res.Frost === 1 && res.Tech === 1, 'payCost spends generic from the largest pool');
  assert(canAfford({ Frost: 1, Generic: 1 }, res), 'scarce color preserved for later element cost');
}

// --- Lurk: cannot be targeted by attack declarations -------------------------
{
  const s = actionState();
  const mine = addUnit(s, 'p1', 3, 3);
  const lurker = addUnit(s, 'p2', 2, 2, ['Lurk']);
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: mine.instanceId,
    targetId: lurker.instanceId,
  });
  assert((c.combat?.attackers.length ?? 0) === 0, 'attack on Lurk unit rejected');
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: mine.instanceId,
    targetId: c.players.p2.leader.instanceId,
  });
  assert((c.combat?.attackers.length ?? 0) === 1, 'attack on enemy leader accepted');
}

// --- Attack declarations must aim at the enemy side --------------------------
{
  const s = actionState();
  const a = addUnit(s, 'p1', 3, 3);
  const b = addUnit(s, 'p1', 1, 1);
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, { type: 'TOGGLE_ATTACKER', instanceId: a.instanceId, targetId: b.instanceId });
  assert((c.combat?.attackers.length ?? 0) === 0, 'attack on friendly unit rejected');
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: a.instanceId,
    targetId: 'nonsense-id',
  });
  assert((c.combat?.attackers.length ?? 0) === 0, 'attack on unknown target rejected');
}

// --- Unit vs unit combat resolves with counter-damage ------------------------
{
  const s = actionState();
  const mine = addUnit(s, 'p1', 3, 4);
  const theirs = addUnit(s, 'p2', 2, 3);
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: mine.instanceId,
    targetId: theirs.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  if (c.phase === 'COMBAT_BLOCK') c = gameReducer(c, { type: 'SUBMIT_BLOCKS' });
  assert(c.players.p2.board.length === 0, 'defender unit destroyed by direct attack');
  const attacker = c.players.p1.board.find((u) => u.instanceId === mine.instanceId);
  assert(!!attacker && attacker.damageTaken === 2, 'attacker took counter-damage');
}

// --- Guard redirects unit attacks ---------------------------------------------
{
  const s = actionState();
  const mine = addUnit(s, 'p1', 5, 5);
  addUnit(s, 'p2', 1, 1); // squishy intended target
  const guard = addUnit(s, 'p2', 1, 4, ['Guard']);
  guard.exhausted = false;
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  const squishy = c.players.p2.board[0];
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: mine.instanceId,
    targetId: squishy.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  // Defender has ready blockers, so combat pauses; submit no blocks.
  if (c.phase === 'COMBAT_BLOCK') c = gameReducer(c, { type: 'SUBMIT_BLOCKS' });
  assert(
    c.players.p2.board.some((u) => u.instanceId === squishy.instanceId),
    'Guard absorbed the attack (squishy survived)',
  );
  assert(
    !c.players.p2.board.some((u) => u.instanceId === guard.instanceId),
    'Guard unit died in the redirect',
  );
}

// --- Brittle doubles damage / Armor absorbs ----------------------------------
{
  const s = actionState();
  const mine = addUnit(s, 'p1', 2, 5);
  const brittle = addUnit(s, 'p2', 0, 5, ['Brittle']);
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: mine.instanceId,
    targetId: brittle.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  if (c.phase === 'COMBAT_BLOCK') c = gameReducer(c, { type: 'SUBMIT_BLOCKS' });
  const b = c.players.p2.board.find((u) => u.instanceId === brittle.instanceId);
  assert(!!b && b.damageTaken === 4, 'Brittle doubled incoming combat damage');
}
{
  const s = actionState();
  const mine = addUnit(s, 'p1', 2, 5);
  const armored = addUnit(s, 'p2', 0, 5, ['Armor 2']);
  armored.armor = 2;
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: mine.instanceId,
    targetId: armored.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  if (c.phase === 'COMBAT_BLOCK') c = gameReducer(c, { type: 'SUBMIT_BLOCKS' });
  const a2 = c.players.p2.board.find((u) => u.instanceId === armored.instanceId);
  assert(!!a2 && a2.damageTaken === 0, 'Armor 2 fully absorbed a 2-damage hit');
}

// --- SUBMIT_BLOCKS cannot be forced during COMBAT_DECLARE ---------------------
{
  const s = actionState();
  const mine = addUnit(s, 'p1', 3, 3);
  addUnit(s, 'p2', 2, 2); // ready blocker exists
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: mine.instanceId,
    targetId: c.players.p2.leader.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_BLOCKS' }); // attacker tries to skip blocks
  assert(c.phase === 'COMBAT_DECLARE', 'SUBMIT_BLOCKS rejected outside COMBAT_BLOCK');
}

// --- Double SUBMIT_ATTACKS does not double-exhaust/charge ----------------------
{
  const s = actionState();
  const mine = addUnit(s, 'p1', 3, 3, ['Overdrive']);
  addUnit(s, 'p2', 2, 2); // blocker so combat pauses
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: mine.instanceId,
    targetId: c.players.p2.leader.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' }); // stray duplicate
  const u = c.players.p1.board.find((b) => b.instanceId === mine.instanceId)!;
  assert(u.attacksThisTurn === 1, 'duplicate SUBMIT_ATTACKS ignored');
}

// --- Dead target: second attacker fizzles, takes no corpse counter -------------
{
  const s = actionState();
  const a1 = addUnit(s, 'p1', 5, 5);
  const a2 = addUnit(s, 'p1', 4, 4);
  const victim = addUnit(s, 'p2', 3, 3);
  victim.exhausted = true; // cannot block, combat resolves immediately
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: a1.instanceId,
    targetId: victim.instanceId,
  });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: a2.instanceId,
    targetId: victim.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  const second = c.players.p1.board.find((u) => u.instanceId === a2.instanceId);
  assert(!!second && second.damageTaken === 0, 'attack on a corpse fizzles without counter-damage');
}

// --- Glitch persists into the controller's own turn ----------------------------
{
  const s = actionState();
  const enemy = addUnit(s, 'p2', 2, 5, ['Guard']);
  enemy.glitched = true;
  const c = gameReducer(s, { type: 'END_TURN' }); // p1 cleanup must NOT clear p2's glitch
  const g = c.players.p2.board.find((u) => u.instanceId === enemy.instanceId);
  assert(!!g && g.glitched, "Glitch survives the opponent's Cleanup");
}

// --- Modularity X raises capacity by X ------------------------------------------
{
  const s = actionState();
  const u = addUnit(s, 'p1', 2, 2, ['Modularity 2']);
  assert(maxItemCapacity(u) === 4, 'Modularity 2 gives capacity 4');
  const u1 = addUnit(s, 'p1', 2, 2, ['Modularity']);
  assert(maxItemCapacity(u1) === 3, 'bare Modularity gives capacity 3');
}

// --- Command cannot ready a Frozen unit ------------------------------------------
{
  const s = actionState();
  s.players.p1.leader.keywords = [...(s.players.p1.leader.keywords || []), 'Command 1'];
  s.players.p1.resources = { Frost: 3 };
  const u = addUnit(s, 'p1', 3, 3);
  u.exhausted = true;
  u.frozen = 1;
  const c = gameReducer(s, { type: 'LEADER_COMMAND', targetId: u.instanceId });
  const after = c.players.p1.board.find((b) => b.instanceId === u.instanceId)!;
  assert(after.exhausted, 'Frozen unit cannot be Commanded');
  assert((c.players.p1.resources.Frost || 0) === 3, 'no resources spent on rejected Command');
}

// --- Simultaneous KO: active player loses ----------------------------------------
{
  const s = actionState();
  s.players.p1.leader.damageTaken = s.players.p1.leader.health || 30;
  s.players.p2.leader.damageTaken = s.players.p2.leader.health || 30;
  const c = gameReducer(s, { type: 'END_TURN' });
  assert(c.winner === 'p2', 'simultaneous KO is lost by the active player');
}

// --- Armor Break is uniform: item armor shatters with base armor --------------
{
  const s = actionState();
  const mine = addUnit(s, 'p1', 5, 5);
  const armored = addUnit(s, 'p2', 0, 9, ['Armor 1']);
  armored.armor = 1;
  const plate = makeToken('Plate', 0, 0, 'p2');
  plate.type = 'Item';
  plate.keywords = ['Armor 2'];
  armored.attachedItems.push(plate);
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: mine.instanceId,
    targetId: armored.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  if (c.phase === 'COMBAT_BLOCK') c = gameReducer(c, { type: 'SUBMIT_BLOCKS' });
  const a = c.players.p2.board.find((u) => u.instanceId === armored.instanceId)!;
  assert(a.damageTaken === 2, 'hit of 5 vs Armor 3 deals 2');
  assert(
    a.armor === 0 && !a.attachedItems[0].keywords.includes('Armor 2'),
    'Armor Break shatters base AND item armor',
  );
}

// --- Wither can shrink a unit to death (max health 0) --------------------------
{
  const s = actionState();
  const witherer = addUnit(s, 'p1', 1, 9, ['Wither 3']);
  const victim = addUnit(s, 'p2', 1, 3);
  victim.exhausted = true;
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: witherer.instanceId,
    targetId: victim.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  assert(
    !c.players.p2.board.some((u) => u.instanceId === victim.instanceId),
    'Wither 3 + 1 damage destroys a 1/3 unit',
  );
}

// --- Siphon does not heal off friendly-fire damage ------------------------------
{
  const s = actionState();
  s.players.p1.leader.damageTaken = 10;
  const ev = makeToken('Zap', 0, 0, 'p1');
  ev.type = 'Event';
  ev.keywords = ['Siphon'];
  ev.effect = { action: 'damage', target: 'unit', value: 2 };
  ev.cost = {};
  s.players.p1.hand.push(ev);
  const friendly = addUnit(s, 'p1', 1, 5);
  const c = gameReducer(s, {
    type: 'PLAY_CARD',
    instanceId: ev.instanceId,
    targetId: friendly.instanceId,
  });
  assert(c.players.p1.leader.damageTaken === 10, 'Siphon ignores damage dealt to own units');
}

// --- Graveborn recast enters clean (no stale damage/status) ---------------------
{
  const s = actionState();
  const gb = makeToken('Revenant', 2, 2, 'p1');
  gb.isToken = false;
  gb.keywords = ['Graveborn'];
  gb.cost = {};
  gb.damageTaken = 5;
  gb.scorch = 2;
  s.players.p1.graveyard.push(gb);
  const c = gameReducer(s, { type: 'PLAY_CARD', instanceId: gb.instanceId });
  const u = c.players.p1.board.find((b) => b.instanceId === gb.instanceId)!;
  assert(
    !!u && u.damageTaken === 0 && u.scorch === 0 && !u.glitched && u.summoningSickness,
    'Graveborn recast is a clean copy with summoning sickness',
  );
}

// --- Charm Detonate hits the caster's enemies on expiry -------------------------
{
  const s = actionState();
  const charm = makeToken('Bomb', 0, 0, 'p1');
  charm.type = 'Charm';
  charm.keywords = ['Detonate 3'];
  charm.charmDuration = 1;
  charm.charmActivated = true;
  s.players.p1.charms.push(charm); // self-charm cast by p1
  const enemy = addUnit(s, 'p2', 1, 3);
  const c = gameReducer(s, { type: 'END_TURN' });
  assert(
    !c.players.p2.board.some((u) => u.instanceId === enemy.instanceId),
    'Detonate 3 killed the enemy 1/3 on expiry',
  );
}

// --- Deckout Law ends the game --------------------------------------------------
{
  const s = actionState();
  s.players.p1.deck = [];
  s.players.p1.leader.damageTaken = (s.players.p1.leader.health || 30) - 1;
  s.phase = 'ALLOCATE';
  s.pendingRoll = 0;
  s.turnNumber = 3;
  const c = gameReducer(s, { type: 'ALLOCATE_RESOURCES', allocations: {} });
  assert(c.winner === 'p2' && c.phase === 'GAME_OVER', 'deckout damage can win the game');
}

// --- Blocking an attacking enemy Leader is legal and counter-damages it ---------
{
  const s = actionState();
  s.players.p1.leader.attack = 4;
  const blocker = addUnit(s, 'p2', 3, 9);
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: s.players.p1.leader.instanceId,
    targetId: c.players.p2.leader.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  c = gameReducer(c, {
    type: 'TOGGLE_BLOCKER',
    attackerId: s.players.p1.leader.instanceId,
    blockerId: blocker.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_BLOCKS' });
  assert(
    c.players.p2.health === (c.players.p2.leader.health || 0),
    'blocked Leader strike never reached the enemy Leader',
  );
  assert(
    c.players.p1.leader.damageTaken === 3,
    "attacking Leader took the blocker's counter-damage",
  );
}

// ============================================================================
// New-set keyword tests (Set 2 preview)
// ============================================================================

function makeCharm(owner: string, keywords: string[]): GameCard {
  const c = makeToken('Charm ' + keywords.join('/'), 0, 0, owner);
  c.type = 'Charm';
  c.keywords = keywords;
  c.charmActivated = true;
  c.charmDuration = 3;
  return c;
}
function makeEvent(owner: string, keywords: string[] = [], effect?: GameCard['effect']): GameCard {
  const e = makeToken('Event ' + (keywords.join('/') || 'plain'), 0, 0, owner);
  e.type = 'Event';
  e.keywords = keywords;
  e.effect = effect || { action: 'heal', value: 0, target: 'self' };
  return e;
}
function makeItem(owner: string, keywords: string[]): GameCard {
  const it = makeToken('Item ' + keywords.join('/'), 0, 0, owner);
  it.type = 'Item';
  it.keywords = keywords;
  it.attach = { attack: 0, health: 0 };
  return it;
}

// --- Vengeance: blocker deals extra damage back to the attacker ---------------
{
  const s = actionState();
  const atk = addUnit(s, 'p1', 2, 10);
  const blk = addUnit(s, 'p2', 1, 10, ['Vengeance 3']);
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: atk.instanceId,
    targetId: c.players.p2.leader.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  c = gameReducer(c, {
    type: 'TOGGLE_BLOCKER',
    attackerId: atk.instanceId,
    blockerId: blk.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_BLOCKS' });
  const a = c.players.p1.board.find((u) => u.instanceId === atk.instanceId);
  assert(!!a && a.damageTaken === 4, 'Vengeance dealt counter (1) + extra (3) to the attacker');
}

// --- Solitary: +X/+X only while alone -----------------------------------------
{
  const s = actionState();
  const solo = addUnit(s, 'p1', 1, 1, ['Solitary 2']);
  assert(effAttack(solo, s) === 3 && effMaxHealth(solo, s) === 3, 'Solitary buffs a lone Unit');
  addUnit(s, 'p1', 1, 1);
  assert(
    effAttack(solo, s) === 1 && effMaxHealth(solo, s) === 1,
    'Solitary buff lifts when an ally arrives',
  );
}

// --- Efficient: banks a deploy discount, consumed by the next Unit ------------
{
  const s = actionState();
  s.players.p1.resources = {};
  const ev = makeEvent('p1', ['Efficient 2']);
  s.players.p1.hand.push(ev);
  let c = gameReducer(s, { type: 'PLAY_CARD', instanceId: ev.instanceId });
  assert((c.players.p1.deployDiscount || 0) === 2, 'Efficient banked a 2-resource discount');
  const unit = makeToken('Costly Unit', 2, 2, 'p1');
  unit.cost = { Generic: 2 };
  c.players.p1.hand.push(unit);
  c = gameReducer(c, { type: 'PLAY_CARD', instanceId: unit.instanceId });
  assert(
    c.players.p1.board.some((u) => u.instanceId === unit.instanceId),
    'discounted Unit deployed with zero resources',
  );
  assert((c.players.p1.deployDiscount || 0) === 0, 'Efficient discount consumed by the deploy');
}

// --- Rummage: draw X then discard 1 at random ----------------------------------
{
  const s = actionState();
  const deckBefore = s.players.p1.deck.length;
  const handBefore = s.players.p1.hand.length;
  const ev = makeEvent('p1', ['Rummage 2']);
  s.players.p1.hand.push(ev);
  const c = gameReducer(s, { type: 'PLAY_CARD', instanceId: ev.instanceId });
  assert(c.players.p1.deck.length === deckBefore - 2, 'Rummage drew 2 from the deck');
  assert(
    c.players.p1.hand.length === handBefore + 1,
    'Rummage net hand: -event +2 drawn -1 discarded',
  );
}

// --- Hatchling: revealed Location seeds tokens for its controller --------------
{
  const s = actionState();
  const loc = makeToken('Nest', 0, 0, 'p1');
  loc.type = 'Location';
  loc.keywords = ['Hatchling 2'];
  s.players.p1.locations = [loc];
  let c = gameReducer(s, { type: 'END_TURN' }); // p2's turn begins
  c = gameReducer(c, { type: 'ACKNOWLEDGE_TRANSITION' }); // flips p1's Location
  assert(
    c.players.p2.board.filter((u) => u.name === 'Hatchling').length === 2,
    'Hatchling created 2 tokens for the controller',
  );
}

// --- Confluence: extra Generic at the controller's Resource Roll ---------------
{
  const s = actionState();
  const loc = makeToken('Ley Line', 0, 0, 'p1');
  loc.type = 'Location';
  loc.keywords = ['Confluence 2'];
  s.players.p1.locations = [loc];
  let c = gameReducer(s, { type: 'END_TURN' });
  c = gameReducer(c, { type: 'ACKNOWLEDGE_TRANSITION' });
  c = gameReducer(c, { type: 'ROLL_DICE' });
  assert((c.players.p2.resources.Generic || 0) === 2, 'Confluence granted 2 Generic at the roll');
}

// --- Overcharge: +X/+X stats, upkeep or the Item burns out ---------------------
{
  const s = actionState();
  const u = addUnit(s, 'p1', 2, 2);
  u.attachedItems.push(makeItem('p1', ['Overcharge 2']));
  assert(effAttack(u, s) === 4 && effMaxHealth(u, s) === 4, 'Overcharge grants +2/+2');
  s.players.p1.resources = {};
  const c = gameReducer(s, { type: 'END_TURN' });
  const u2 = c.players.p1.board.find((b) => b.instanceId === u.instanceId);
  assert(!!u2 && u2.attachedItems.length === 0, 'unpaid Overcharge Item destroyed at Cleanup');
}
{
  const s = actionState();
  const u = addUnit(s, 'p1', 2, 2);
  u.attachedItems.push(makeItem('p1', ['Overcharge 2']));
  s.players.p1.resources = { Generic: 3 };
  const c = gameReducer(s, { type: 'END_TURN' });
  const u2 = c.players.p1.board.find((b) => b.instanceId === u.instanceId);
  assert(!!u2 && u2.attachedItems.length === 1, 'paid Overcharge Item survives Cleanup');
  assert((c.players.p1.resources.Generic || 0) === 1, 'Overcharge upkeep deducted 2 Generic');
}

// --- Surge: combat damage taps Generic resources -------------------------------
{
  const s = actionState();
  const atk = addUnit(s, 'p1', 2, 10);
  atk.attachedItems.push(makeItem('p1', ['Surge']));
  const victim = addUnit(s, 'p2', 0, 5);
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: atk.instanceId,
    targetId: victim.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  if (c.phase === 'COMBAT_BLOCK') c = gameReducer(c, { type: 'SUBMIT_BLOCKS' });
  assert((c.players.p1.resources.Generic || 0) === 1, 'Surge granted 1 Generic on combat damage');
}

// --- Valor / Codex: charm auras buff all friendly Units -------------------------
{
  const s = actionState();
  s.players.p1.charms.push(makeCharm('p1', ['Valor 2']));
  s.players.p1.charms.push(makeCharm('p1', ['Codex 1']));
  const u = addUnit(s, 'p1', 1, 1);
  assert(effAttack(u, s) === 3, 'Valor 2 aura grants +2 attack');
  assert(effMaxHealth(u, s) === 2, 'Codex 1 aura grants +1 max health');
}

// --- Inspire / Sync: deploy triggers -------------------------------------------
{
  const s = actionState();
  s.players.p1.charms.push(makeCharm('p1', ['Inspire']));
  s.players.p1.charms.push(makeCharm('p1', ['Sync 2']));
  s.players.p1.resources = {};
  const unit = makeToken('Recruit', 1, 1, 'p1');
  s.players.p1.hand.push(unit);
  const c = gameReducer(s, { type: 'PLAY_CARD', instanceId: unit.instanceId });
  const deployed = c.players.p1.board.find((u) => u.instanceId === unit.instanceId);
  assert(
    !!deployed && deployed.tempAtk === 1 && deployed.tempHp === 1,
    'Inspire granted +1/+1 on deploy',
  );
  assert((c.players.p1.resources.Generic || 0) === 2, 'Sync granted 2 Generic on deploy');
}

// --- Beacon: aura Ward on friendly Units ----------------------------------------
{
  const s = actionState();
  s.players.p2.charms.push(makeCharm('p2', ['Beacon 1']));
  const tgt = addUnit(s, 'p2', 1, 3);
  const ev = makeEvent('p1', [], { action: 'damage', value: 1, target: 'unit' });
  s.players.p1.hand.push(ev);
  s.players.p1.resources = {};
  let c = gameReducer(s, {
    type: 'PLAY_CARD',
    instanceId: ev.instanceId,
    targetId: tgt.instanceId,
  });
  assert(
    c.players.p1.hand.some((h) => h.instanceId === ev.instanceId),
    'Beacon Ward surcharge blocked a free targeting',
  );
  c.players.p1.resources = { Generic: 1 };
  c = gameReducer(c, { type: 'PLAY_CARD', instanceId: ev.instanceId, targetId: tgt.instanceId });
  const t = c.players.p2.board.find((u) => u.instanceId === tgt.instanceId);
  assert(!!t && t.damageTaken === 1, 'Ward surcharge paid: the Event resolved');
}

// --- Taint: victim takes +X from all later sources until Cleanup ----------------
{
  const s = actionState();
  const atk = addUnit(s, 'p1', 1, 10, ['Taint 2']);
  const victim = addUnit(s, 'p2', 0, 10);
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: atk.instanceId,
    targetId: victim.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  if (c.phase === 'COMBAT_BLOCK') c = gameReducer(c, { type: 'SUBMIT_BLOCKS' });
  let v = c.players.p2.board.find((u) => u.instanceId === victim.instanceId);
  assert(!!v && v.damageTaken === 1 && (v.tainted || 0) === 2, 'combat damage applied Taint 2');
  const ev = makeEvent('p1', [], { action: 'damage', value: 1, target: 'unit' });
  c.players.p1.hand.push(ev);
  c = gameReducer(c, { type: 'PLAY_CARD', instanceId: ev.instanceId, targetId: victim.instanceId });
  v = c.players.p2.board.find((u) => u.instanceId === victim.instanceId);
  assert(!!v && v.damageTaken === 4, 'Tainted Unit took 1 + 2 from a later source');
}

// --- Glacier: enemy Events cost extra -------------------------------------------
{
  const s = actionState();
  s.players.p2.charms.push(makeCharm('p2', ['Glacier']));
  const ev = makeEvent('p1');
  s.players.p1.hand.push(ev);
  s.players.p1.resources = {};
  let c = gameReducer(s, { type: 'PLAY_CARD', instanceId: ev.instanceId });
  assert(
    c.players.p1.hand.some((h) => h.instanceId === ev.instanceId),
    'Glacier surcharge blocked a free Event',
  );
  c.players.p1.resources = { Generic: 1 };
  c = gameReducer(c, { type: 'PLAY_CARD', instanceId: ev.instanceId });
  assert(
    !c.players.p1.hand.some((h) => h.instanceId === ev.instanceId),
    'Glacier surcharge paid: Event cast',
  );
  assert((c.players.p1.resources.Generic || 0) === 0, 'Glacier tax consumed the resource');
}

// --- Inferno: combat damage splashes 1 onto the victim's other Units ------------
{
  const s = actionState();
  const atk = addUnit(s, 'p1', 2, 10, ['Inferno']);
  const t1 = addUnit(s, 'p2', 0, 5);
  const t2 = addUnit(s, 'p2', 0, 5);
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: atk.instanceId,
    targetId: t1.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  if (c.phase === 'COMBAT_BLOCK') c = gameReducer(c, { type: 'SUBMIT_BLOCKS' });
  const other = c.players.p2.board.find((u) => u.instanceId === t2.instanceId);
  assert(!!other && other.damageTaken === 1, 'Inferno splashed 1 onto the other enemy Unit');
}

// --- Flourish: Nature granted at the Resource Roll -------------------------------
{
  const s = actionState();
  s.players.p1.leader.keywords = [...(s.players.p1.leader.keywords || []), 'Flourish 2'];
  s.phase = 'ROLL';
  const c = gameReducer(s, { type: 'ROLL_DICE' });
  assert((c.players.p1.resources.Nature || 0) === 2, 'Flourish granted 2 Nature at the roll');
}

// --- Decay: hostile charm damages all the victim's Units after their roll -------
{
  const s = actionState();
  const victim1 = addUnit(s, 'p1', 2, 3);
  const victim2 = addUnit(s, 'p1', 2, 3);
  const hostile = makeCharm('p2', ['Decay 1']); // cast by p2, afflicting p1
  hostile.ownerId = 'p2';
  s.players.p1.charms.push(hostile);
  s.phase = 'ROLL';
  let c = gameReducer(s, { type: 'ROLL_DICE' });
  if (c.phase === 'ALLOCATE') c = gameReducer(c, { type: 'ALLOCATE_RESOURCES', allocations: {} });
  const u1 = c.players.p1.board.find((u) => u.instanceId === victim1.instanceId);
  const u2 = c.players.p1.board.find((u) => u.instanceId === victim2.instanceId);
  assert(
    !!u1 && u1.damageTaken === 1 && !!u2 && u2.damageTaken === 1,
    'Decay 1 hit all afflicted Units after the roll',
  );
}

// --- Discord: one of three random outcomes at the start of the turn --------------
{
  const s = actionState();
  s.players.p1.charms.push(makeCharm('p1', ['Discord']));
  const handBefore = s.players.p1.hand.length;
  let c = gameReducer(s, { type: 'END_TURN' });
  c = gameReducer(c, { type: 'ACKNOWLEDGE_TRANSITION' }); // p2's turn
  c = gameReducer(c, { type: 'ROLL_DICE' });
  if (c.phase === 'ALLOCATE') c = gameReducer(c, { type: 'ALLOCATE_RESOURCES', allocations: {} });
  c = gameReducer(c, { type: 'END_TURN' });
  c = gameReducer(c, { type: 'ACKNOWLEDGE_TRANSITION' }); // p1's turn: Discord fires
  const p1 = c.players.p1;
  const gotResource = (p1.resources.Generic || 0) === 1;
  const gotCard = p1.hand.length === handBefore + 1;
  const gotHurt = p1.leader.damageTaken >= 1;
  assert(gotResource || gotCard || gotHurt, 'Discord produced one of its three outcomes');
}

// --- Mulligan actions are locked outside the Mulligan phase ---------------------
{
  const s = actionState(); // both players already kept; phase is ACTION
  const deckBefore = s.players.p1.deck.length;
  const handBefore = s.players.p1.hand.length;
  let c = gameReducer(s, { type: 'MULLIGAN', playerId: 'p1' });
  assert(
    c.players.p1.deck.length === deckBefore && c.players.p1.hand.length === handBefore,
    'MULLIGAN rejected outside the Mulligan phase',
  );
  c = gameReducer(s, {
    type: 'KEEP_HAND',
    playerId: 'p1',
    bottomIds: s.players.p1.hand.map((h) => h.instanceId),
  });
  assert(c.players.p1.hand.length === handBefore, 'KEEP_HAND rejected outside the Mulligan phase');
}
{
  let s = initialGameState(true);
  s.activePlayerId = 'p1';
  s = gameReducer(s, { type: 'START_GAME' });
  s = gameReducer(s, { type: 'KEEP_HAND', playerId: 'p1' });
  const deckBefore = s.players.p1.deck.length;
  const c = gameReducer(s, { type: 'MULLIGAN', playerId: 'p1' });
  assert(
    c.players.p1.deck.length === deckBefore && c.players.p1.mulliganCount === 0,
    'a kept hand cannot be re-mulliganed',
  );
}

// --- 'friendly'-target Events cannot be aimed at enemy Units --------------------
{
  const s = actionState();
  addUnit(s, 'p1', 1, 1);
  const enemy = addUnit(s, 'p2', 2, 2);
  const ev = makeToken('Buff Bolt', 0, 0, 'p1');
  ev.type = 'Event';
  ev.cost = {};
  ev.effect = { action: 'buff', target: 'friendly', value: 2 };
  s.players.p1.hand.push(ev);
  const c = gameReducer(s, {
    type: 'PLAY_CARD',
    instanceId: ev.instanceId,
    targetId: enemy.instanceId,
  });
  const e = c.players.p2.board.find((u) => u.instanceId === enemy.instanceId);
  assert(
    !!e && e.tempAtk === 0 && c.players.p1.hand.some((h) => h.instanceId === ev.instanceId),
    "'friendly' Event rejected when aimed at an enemy Unit",
  );
}

// --- KEEP_HAND: bogus bottomIds cannot dodge the London Mulligan penalty --------
{
  let s = initialGameState(true);
  s.activePlayerId = 'p1';
  s = gameReducer(s, { type: 'START_GAME' });
  s = gameReducer(s, { type: 'MULLIGAN', playerId: 'p1' });
  s = gameReducer(s, { type: 'KEEP_HAND', playerId: 'p1', bottomIds: ['fake-id'] });
  assert(s.players.p1.hand.length === 4, 'invalid bottomIds still bottom exactly X cards');
}
{
  let s = initialGameState(true);
  s.activePlayerId = 'p1';
  s = gameReducer(s, { type: 'START_GAME' });
  s = gameReducer(s, { type: 'MULLIGAN', playerId: 'p1' });
  s = gameReducer(s, { type: 'MULLIGAN', playerId: 'p1' });
  const dup = s.players.p1.hand[0].instanceId;
  s = gameReducer(s, { type: 'KEEP_HAND', playerId: 'p1', bottomIds: [dup, dup] });
  assert(s.players.p1.hand.length === 3, 'duplicate bottomIds still bottom exactly X cards');
}

// --- Command Cap: a Unit can only be Commanded once per turn --------------------
{
  const s = actionState();
  s.players.p1.leader.keywords = ['Command 1'];
  s.players.p1.resources = { Generic: 10 };
  const u = addUnit(s, 'p1', 3, 3);
  u.exhausted = true;
  u.attacksThisTurn = 1;
  let c = gameReducer(s, { type: 'LEADER_COMMAND', targetId: u.instanceId });
  let after = c.players.p1.board.find((b) => b.instanceId === u.instanceId)!;
  assert(!after.exhausted && after.attacksThisTurn === 0, 'first Command readies the Unit');
  after.exhausted = true;
  after.attacksThisTurn = 1;
  c = gameReducer(c, { type: 'LEADER_COMMAND', targetId: u.instanceId });
  after = c.players.p1.board.find((b) => b.instanceId === u.instanceId)!;
  assert(
    after.exhausted && (c.players.p1.resources.Generic || 0) === 9,
    'second Command on the same Unit is rejected without charging resources',
  );
}

// --- Feedback refund is exact: generic paid from colors returns to those colors --
{
  const s = actionState();
  const feedbacker = addUnit(s, 'p2', 1, 9, ['Feedback']);
  const ev = makeEvent('p1', [], { action: 'damage', value: 1, target: 'unit' });
  ev.cost = { Generic: 2 };
  s.players.p1.hand.push(ev);
  s.players.p1.resources = { Frost: 2 };
  // Run until Feedback actually negates once (d6 ≥ 4 — retry a few times).
  let refunded = false;
  for (let i = 0; i < 40 && !refunded; i++) {
    const c = gameReducer(s, {
      type: 'PLAY_CARD',
      instanceId: ev.instanceId,
      targetId: feedbacker.instanceId,
    });
    if (c.players.p1.hand.some((h) => h.instanceId === ev.instanceId)) {
      refunded = true;
      assert(
        (c.players.p1.resources.Frost || 0) === 2 && !(c.players.p1.resources.Generic! > 0),
        'Feedback refunds the exact colored resources spent on a Generic cost',
      );
    }
  }
  assert(refunded, 'Feedback negation occurred at least once in 40 tries');
}

// --- Leader Scorch honors Armor (keyword uniformity) -----------------------------
{
  const s = actionState();
  const p2leader = s.players.p2.leader;
  p2leader.scorch = 2;
  p2leader.armor = 3;
  let c = gameReducer(s, { type: 'END_TURN' });
  c = gameReducer(c, { type: 'ACKNOWLEDGE_TRANSITION' }); // p2's turn starts: scorch ticks
  assert(c.players.p2.leader.damageTaken === 0, 'Leader Armor absorbed the Scorch tick');
}

// --- Scalability: extreme keyword values behave like small ones -----------------
{
  const s = actionState();
  const tank = addUnit(s, 'p2', 0, 5, ['Armor 100']);
  tank.armor = 100;
  const hitter = addUnit(s, 'p1', 50, 50);
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: hitter.instanceId,
    targetId: tank.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  if (c.phase === 'COMBAT_BLOCK') c = gameReducer(c, { type: 'SUBMIT_BLOCKS' });
  const t = c.players.p2.board.find((u) => u.instanceId === tank.instanceId);
  assert(
    !!t && t.damageTaken === 0 && t.armor === 100,
    'Armor 100 absorbs a 50 hit without breaking',
  );
}
{
  const s = actionState();
  const buffed = addUnit(s, 'p1', 1, 1);
  const ev = makeEvent('p1', [], { action: 'buff', value: 100, target: 'friendly' });
  s.players.p1.hand.push(ev);
  const c = gameReducer(s, {
    type: 'PLAY_CARD',
    instanceId: ev.instanceId,
    targetId: buffed.instanceId,
  });
  const b = c.players.p1.board.find((u) => u.instanceId === buffed.instanceId)!;
  assert(effAttack(b, c) === 101 && effMaxHealth(b, c) === 101, '+100/+100 buff applies exactly');
  const c2 = gameReducer(c, { type: 'END_TURN' });
  const b2 = c2.players.p1.board.find((u) => u.instanceId === buffed.instanceId)!;
  assert(effAttack(b2, c2) === 1, '+100/+100 buff expires at Cleanup like any temp buff');
}

// --- V1.7: Leader combat damage runs the standard pipeline (Armor) --------------
{
  const s = actionState();
  s.players.p2.leader.keywords.push('Armor 2');
  s.players.p2.leader.armor = 2;
  const a = addUnit(s, 'p1', 3, 3);
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: a.instanceId,
    targetId: s.players.p2.leader.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  if (c.phase === 'COMBAT_BLOCK') c = gameReducer(c, { type: 'SUBMIT_BLOCKS' });
  assert(
    c.players.p2.leader.damageTaken === 1 && c.players.p2.leader.armor === 0,
    'unblocked combat hit on a Leader honors Armor + Armor Break (§5.4 uniformity)',
  );
}

// --- V1.7: Event damage aimed at the Leader runs the pipeline; Siphon heals dealt --
{
  const s = actionState();
  s.players.p1.leader.damageTaken = 5;
  s.players.p1.health = (s.players.p1.leader.health || 0) - 5;
  s.players.p2.leader.keywords.push('Armor 2');
  s.players.p2.leader.armor = 2;
  const ev = makeEvent('p1', ['Siphon'], { action: 'damage', value: 5, target: 'leader' });
  s.players.p1.hand.push(ev);
  s.players.p1.resources = { Generic: 10 };
  const c = gameReducer(s, { type: 'PLAY_CARD', instanceId: ev.instanceId });
  assert(
    c.players.p2.leader.damageTaken === 3,
    'leader-target Event damage honors Leader Armor (5 - Armor 2 = 3)',
  );
  assert(
    c.players.p1.leader.damageTaken === 5 - Math.ceil(3 / 2),
    'Siphon heals half the damage that actually landed, not the raw value',
  );
}

// --- V1.7: Pierce overflow onto the Leader runs the pipeline ---------------------
{
  const s = actionState();
  s.players.p2.leader.keywords.push('Armor 2');
  s.players.p2.leader.armor = 2;
  const big = addUnit(s, 'p1', 8, 8, ['Pierce']);
  const chump = addUnit(s, 'p2', 0, 2);
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: big.instanceId,
    targetId: s.players.p2.leader.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  c = gameReducer(c, {
    type: 'TOGGLE_BLOCKER',
    attackerId: big.instanceId,
    blockerId: chump.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_BLOCKS' });
  // 8 attack, 2 assigned to the chump, 6 overflow − Armor 2 = 4 to the Leader.
  assert(c.players.p2.leader.damageTaken === 4, 'Pierce overflow honors Leader Armor');
}

// --- V1.7: Leader Survival Caveat is Armor-aware ---------------------------------
{
  const s = actionState();
  const l1 = s.players.p1.leader;
  l1.attack = 3;
  l1.damageTaken = (l1.health || 30) - 2; // 2 HP left
  s.players.p1.health = 2;
  s.players.p2.leader.attack = 3; // raw counter 3 would be lethal…
  l1.keywords.push('Armor 5'); // …but Armor 5 soaks it entirely
  l1.armor = 5;
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: l1.instanceId,
    targetId: s.players.p2.leader.instanceId,
  });
  assert(
    (c.combat?.attackers.length ?? 0) === 1,
    'Survival Caveat lets an Armored Leader attack when the projected counter is non-lethal',
  );
}

// --- V1.7: triple-stack pipeline order — Brittle × 2, then +Taint, then Armor ----
{
  const s = actionState();
  const victim = addUnit(s, 'p2', 0, 20, ['Brittle', 'Armor 3']);
  victim.armor = 3;
  victim.tainted = 2;
  const hitter = addUnit(s, 'p1', 3, 3);
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, {
    type: 'TOGGLE_ATTACKER',
    instanceId: hitter.instanceId,
    targetId: victim.instanceId,
  });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  if (c.phase === 'COMBAT_BLOCK') c = gameReducer(c, { type: 'SUBMIT_BLOCKS' });
  const v = c.players.p2.board.find((u) => u.instanceId === victim.instanceId)!;
  // 3 dmg → Brittle ×2 = 6 → Taint +2 = 8 → Armor 3 breaks, 5 lands.
  assert(
    v.damageTaken === 5 && v.armor === 0,
    'pipeline order: Brittle doubles, Taint adds, Armor breaks last (3→6→8→5)',
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
