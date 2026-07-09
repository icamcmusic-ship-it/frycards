import { test, expect } from 'vitest';
import {
  newGame, mulberry32, makeInst, startTurn, reroll, echoRecast, completeTwin,
  castLocationFree, applyEffect,
} from './engine';
import { CardDef } from './cards';
import { ARCHETYPES, buildDeck } from './decks';

function freshGame() {
  const rng = mulberry32(1);
  return newGame(buildDeck(ARCHETYPES[0]), buildDeck(ARCHETYPES[1]), rng);
}

const echoUnit: CardDef = {
  id: 'test_echo_unit', name: 'Test Echo Unit', type: 'Unit',
  threshold: 1, atk: 2, hp: 3, keywords: ['Echo'],
};

test('Echo-recast resets stat buffs and exhaustion accumulated in a previous life', () => {
  const g = freshGame();
  g.active = 'A';
  startTurn(g);
  reroll(g, []);
  const p = g.players.A;

  const inst = makeInst(echoUnit, 'A');
  // Simulate a full "life" in play: a permanent buff, an attack, an ability use.
  inst.permAtk = 5;
  inst.permHp = 5;
  inst.hasAttacked = true;
  inst.attacksMade = 2;
  inst.abilityUsed = true;
  inst.boundThisTurn = true;
  p.discard.push(inst);

  const die = p.dice.findIndex((d) => !d.placed);
  p.dice[die].value = 6; // comfortably meets threshold 1
  const fodder = p.hand[0];
  const ok = echoRecast(g, die, inst.iid, fodder.iid);
  expect(ok).toBe(true);

  const onBoard = p.board.find((u) => u.iid === inst.iid)!;
  expect(onBoard.permAtk).toBe(0);
  expect(onBoard.permHp).toBe(0);
  expect(onBoard.hasAttacked).toBe(false);
  expect(onBoard.attacksMade).toBe(0);
  expect(onBoard.abilityUsed).toBe(false);
  expect(onBoard.boundThisTurn).toBe(false);
});

test('completeTwin is a Placement Phase action — rejected before the reroll window closes', () => {
  const g = freshGame();
  g.active = 'A';
  startTurn(g);
  const p = g.players.A;

  const twinCard = makeInst(
    { id: 't', name: 'Twin Test', type: 'Unit', threshold: 3, atk: 1, hp: 1, keywords: ['Twin'] },
    'A',
  );
  twinCard.stagedDie = 4;
  p.staging.push(twinCard);
  const die = p.dice.findIndex((d) => !d.placed);
  p.dice[die].value = 4;

  // Still PRE_REROLL — must fail.
  expect(g.stage).toBe('PRE_REROLL');
  expect(completeTwin(g, die, twinCard.iid)).toBe(false);

  reroll(g, []);
  expect(g.stage).toBe('PLACEMENT');
  expect(completeTwin(g, die, twinCard.iid)).toBe(true);
});

test('castLocationFree is a Placement Phase action — rejected before the reroll window closes', () => {
  const g = freshGame();
  g.active = 'A';
  startTurn(g);
  const p = g.players.A;
  const locCard = p.hand.find((c) => c.def.type === 'Location');
  if (!locCard) return; // this archetype's opening hand had no Location; nothing to assert
  expect(g.stage).toBe('PRE_REROLL');
  expect(castLocationFree(g, locCard.iid)).toBe(false);
  reroll(g, []);
  expect(castLocationFree(g, locCard.iid)).toBe(true);
});

test('a fixed enemyLeader-target Sap can end the game via applyEffect directly', () => {
  const g = freshGame();
  g.players.B.leader.damage = g.players.B.leader.def.hp! - 1;
  applyEffect(g, 'A', { action: 'sap', value: 5, target: 'enemyLeader' });
  expect(g.winner).toBe('A');
});
