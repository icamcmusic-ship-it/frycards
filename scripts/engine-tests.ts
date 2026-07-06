/**
 * Targeted engine regression tests for game rules and keywords.
 * Usage: npx tsx scripts/engine-tests.ts
 */
import { initialGameState, gameReducer, payCost, canAfford } from '../src/game/engine';
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

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
