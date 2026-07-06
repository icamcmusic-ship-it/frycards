/**
 * Targeted engine regression tests for game rules and keywords.
 * Usage: npx tsx scripts/engine-tests.ts
 */
import { initialGameState, gameReducer, payCost, canAfford, maxItemCapacity } from '../src/game/engine';
import { makeToken } from '../src/game/cards';
import { GameState, GameCard } from '../src/types';

let passed = 0;
let failed = 0;
function assert(cond: boolean, name: string) {
  if (cond) { passed++; }
  else { failed++; console.error('FAIL: ' + name); }
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

function addUnit(s: GameState, owner: string, atk: number, hp: number, keywords: string[] = []): GameCard {
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
  c = gameReducer(c, { type: 'TOGGLE_ATTACKER', instanceId: mine.instanceId, targetId: lurker.instanceId });
  assert((c.combat?.attackers.length ?? 0) === 0, 'attack on Lurk unit rejected');
  c = gameReducer(c, { type: 'TOGGLE_ATTACKER', instanceId: mine.instanceId, targetId: c.players.p2.leader.instanceId });
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
  c = gameReducer(c, { type: 'TOGGLE_ATTACKER', instanceId: a.instanceId, targetId: 'nonsense-id' });
  assert((c.combat?.attackers.length ?? 0) === 0, 'attack on unknown target rejected');
}

// --- Unit vs unit combat resolves with counter-damage ------------------------
{
  const s = actionState();
  const mine = addUnit(s, 'p1', 3, 4);
  const theirs = addUnit(s, 'p2', 2, 3);
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, { type: 'TOGGLE_ATTACKER', instanceId: mine.instanceId, targetId: theirs.instanceId });
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
  c = gameReducer(c, { type: 'TOGGLE_ATTACKER', instanceId: mine.instanceId, targetId: squishy.instanceId });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  // Defender has ready blockers, so combat pauses; submit no blocks.
  if (c.phase === 'COMBAT_BLOCK') c = gameReducer(c, { type: 'SUBMIT_BLOCKS' });
  assert(c.players.p2.board.some((u) => u.instanceId === squishy.instanceId), 'Guard absorbed the attack (squishy survived)');
  assert(!c.players.p2.board.some((u) => u.instanceId === guard.instanceId), 'Guard unit died in the redirect');
}

// --- Brittle doubles damage / Armor absorbs ----------------------------------
{
  const s = actionState();
  const mine = addUnit(s, 'p1', 2, 5);
  const brittle = addUnit(s, 'p2', 0, 5, ['Brittle']);
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, { type: 'TOGGLE_ATTACKER', instanceId: mine.instanceId, targetId: brittle.instanceId });
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
  c = gameReducer(c, { type: 'TOGGLE_ATTACKER', instanceId: mine.instanceId, targetId: armored.instanceId });
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
  c = gameReducer(c, { type: 'TOGGLE_ATTACKER', instanceId: mine.instanceId, targetId: c.players.p2.leader.instanceId });
  c = gameReducer(c, { type: 'SUBMIT_BLOCKS' }); // attacker tries to skip blocks
  assert(c.phase === 'COMBAT_DECLARE', 'SUBMIT_BLOCKS rejected outside COMBAT_BLOCK');
}

// --- Double SUBMIT_ATTACKS does not double-exhaust/charge ----------------------
{
  const s = actionState();
  const mine = addUnit(s, 'p1', 3, 3, ['Overdrive']);
  addUnit(s, 'p2', 2, 2); // blocker so combat pauses
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, { type: 'TOGGLE_ATTACKER', instanceId: mine.instanceId, targetId: c.players.p2.leader.instanceId });
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
  c = gameReducer(c, { type: 'TOGGLE_ATTACKER', instanceId: a1.instanceId, targetId: victim.instanceId });
  c = gameReducer(c, { type: 'TOGGLE_ATTACKER', instanceId: a2.instanceId, targetId: victim.instanceId });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  const second = c.players.p1.board.find((u) => u.instanceId === a2.instanceId);
  assert(!!second && second.damageTaken === 0, 'attack on a corpse fizzles without counter-damage');
}

// --- Glitch persists into the controller's own turn ----------------------------
{
  const s = actionState();
  const enemy = addUnit(s, 'p2', 2, 5, ['Guard']);
  enemy.glitched = true;
  let c = gameReducer(s, { type: 'END_TURN' }); // p1 cleanup must NOT clear p2's glitch
  const g = c.players.p2.board.find((u) => u.instanceId === enemy.instanceId);
  assert(!!g && g.glitched, 'Glitch survives the opponent\'s Cleanup');
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
  s.players.p1.leader.damageTaken = (s.players.p1.leader.health || 30);
  s.players.p2.leader.damageTaken = (s.players.p2.leader.health || 30);
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
  c = gameReducer(c, { type: 'TOGGLE_ATTACKER', instanceId: mine.instanceId, targetId: armored.instanceId });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  if (c.phase === 'COMBAT_BLOCK') c = gameReducer(c, { type: 'SUBMIT_BLOCKS' });
  const a = c.players.p2.board.find((u) => u.instanceId === armored.instanceId)!;
  assert(a.damageTaken === 2, 'hit of 5 vs Armor 3 deals 2');
  assert(a.armor === 0 && !a.attachedItems[0].keywords.includes('Armor 2'),
    'Armor Break shatters base AND item armor');
}

// --- Wither can shrink a unit to death (max health 0) --------------------------
{
  const s = actionState();
  const witherer = addUnit(s, 'p1', 1, 9, ['Wither 3']);
  const victim = addUnit(s, 'p2', 1, 3);
  victim.exhausted = true;
  let c = gameReducer(s, { type: 'ENTER_COMBAT' });
  c = gameReducer(c, { type: 'TOGGLE_ATTACKER', instanceId: witherer.instanceId, targetId: victim.instanceId });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  assert(!c.players.p2.board.some((u) => u.instanceId === victim.instanceId),
    'Wither 3 + 1 damage destroys a 1/3 unit');
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
  const c = gameReducer(s, { type: 'PLAY_CARD', instanceId: ev.instanceId, targetId: friendly.instanceId });
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
  assert(!!u && u.damageTaken === 0 && u.scorch === 0 && !u.glitched && u.summoningSickness,
    'Graveborn recast is a clean copy with summoning sickness');
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
  assert(!c.players.p2.board.some((u) => u.instanceId === enemy.instanceId),
    'Detonate 3 killed the enemy 1/3 on expiry');
}

// --- Deckout Law ends the game --------------------------------------------------
{
  let s = actionState();
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
  c = gameReducer(c, { type: 'TOGGLE_ATTACKER', instanceId: s.players.p1.leader.instanceId, targetId: c.players.p2.leader.instanceId });
  c = gameReducer(c, { type: 'SUBMIT_ATTACKS' });
  c = gameReducer(c, { type: 'TOGGLE_BLOCKER', attackerId: s.players.p1.leader.instanceId, blockerId: blocker.instanceId });
  c = gameReducer(c, { type: 'SUBMIT_BLOCKS' });
  assert(c.players.p2.health === (c.players.p2.leader.health || 0), 'blocked Leader strike never reached the enemy Leader');
  assert(c.players.p1.leader.damageTaken === 3, 'attacking Leader took the blocker\'s counter-damage');
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
