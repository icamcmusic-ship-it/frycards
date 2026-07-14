import { test, expect } from 'vitest';
import {
  newGame,
  mulberry32,
  makeInst,
  startTurn,
  reroll,
  echoRecast,
  completeTwin,
  castLocationFree,
  applyEffect,
  abandonTwin,
} from './engine';
import { CardDef } from './cards';
import { ARCHETYPES, buildDeck } from './decks';

function freshGame() {
  const rng = mulberry32(1);
  return newGame(buildDeck(ARCHETYPES[0]), buildDeck(ARCHETYPES[1]), rng);
}

const echoUnit: CardDef = {
  id: 'test_echo_unit',
  name: 'Test Echo Unit',
  type: 'Unit',
  threshold: 1,
  atk: 2,
  hp: 3,
  keywords: ['Echo'],
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

const echoCharm: CardDef = {
  id: 'test_echo_charm',
  name: 'Test Echo Charm',
  type: 'Charm',
  threshold: 1,
  keywords: ['Echo'],
  onCast: { action: 'draw', value: 1, target: 'none' },
};

test('Echo-recasting a Charm/Event banishes it instead of returning it to Discard', () => {
  const g = freshGame();
  g.active = 'A';
  startTurn(g);
  reroll(g, []);
  const p = g.players.A;

  const inst = makeInst(echoCharm, 'A');
  p.discard.push(inst);

  const die = p.dice.findIndex((d) => !d.placed);
  p.dice[die].value = 6;
  const fodder = p.hand[0];
  const ok = echoRecast(g, die, inst.iid, fodder.iid);
  expect(ok).toBe(true);
  expect(inst.echoSpent).toBe(true);
  expect(p.banished.some((c) => c.iid === inst.iid)).toBe(true);
  expect(p.discard.some((c) => c.iid === inst.iid)).toBe(false);
});

const twinDef: CardDef = {
  id: 'test_twin_unit',
  name: 'Twin Test',
  type: 'Unit',
  threshold: 3,
  atk: 1,
  hp: 1,
  keywords: ['Twin'],
};

test('abandonTwin is a start-of-turn/Reroll-Phase action — rejected during Placement Phase', () => {
  const g = freshGame();
  g.active = 'A';
  startTurn(g);
  const p = g.players.A;

  const stagedPreRoll = makeInst(twinDef, 'A');
  stagedPreRoll.stagedDie = 4;
  p.staging.push(stagedPreRoll);
  expect(g.stage).toBe('PRE_REROLL');
  expect(abandonTwin(g, stagedPreRoll.iid)).toBe(true);
  expect(p.hand.some((c) => c.iid === stagedPreRoll.iid)).toBe(true);

  const stagedInPlacement = makeInst(twinDef, 'A');
  stagedInPlacement.stagedDie = 4;
  p.staging.push(stagedInPlacement);
  reroll(g, []);
  expect(g.stage).toBe('PLACEMENT');
  expect(abandonTwin(g, stagedInPlacement.iid)).toBe(false);
  expect(p.staging.some((c) => c.iid === stagedInPlacement.iid)).toBe(true);
});

test('applyEffect ignores an enemyUnit-target Bind supplied a friendly targetIid', () => {
  const g = freshGame();
  const p = g.players.A;
  const friendly = makeInst(
    { id: 'test_friendly_unit', name: 'Friendly', type: 'Unit', threshold: 1, atk: 1, hp: 1 },
    'A',
  );
  p.board.push(friendly);
  applyEffect(g, 'A', { action: 'bind', target: 'enemyUnit' }, friendly.iid);
  expect(friendly.boundNextTurn).toBe(false);
});

// ---------------------------------------------------------------------------
// v4.2/v4.3 audit tests: keyword edge cases & advanced rulings
// ---------------------------------------------------------------------------
import {
  attack,
  legalTargets,
  canAttack,
  castFromHand,
  activateUltimate,
  effAbilityThreshold,
  effThreshold,
  matchesPattern,
  cleanupDeaths,
  endTurn,
  Game,
} from './engine';

const mkU = (id: string, over: Partial<CardDef> = {}): CardDef => ({
  id,
  name: id,
  type: 'Unit',
  threshold: 1,
  atk: 2,
  hp: 3,
  ...over,
});

/** Put both players past turn 1 so combat is legal, with A active in Placement. */
function combatGame(): Game {
  const g = freshGame();
  g.active = 'A';
  startTurn(g);
  reroll(g, []);
  g.players.A.turnsTaken = 3;
  g.players.B.turnsTaken = 3;
  // Clear prebuilt boards/hands noise
  g.players.A.board = [];
  g.players.B.board = [];
  return g;
}

test('reroll window stays closed after being ended voluntarily (Snap ruling, §3.3/3.4)', () => {
  const g = freshGame();
  g.active = 'A';
  startTurn(g);
  const p = g.players.A;
  reroll(g, []); // voluntary end with rerolls still unspent
  expect(g.stage).toBe('PLACEMENT');
  const before = p.dice.map((d) => d.value);
  reroll(g, [0, 1, 2, 3, 4]); // must be a no-op now
  expect(p.dice.map((d) => d.value)).toEqual(before);
  expect(p.rerollsUsed).toBe(1);
});

test('reroll tolerates out-of-range indices without throwing or spending values', () => {
  const g = freshGame();
  g.active = 'A';
  startTurn(g);
  expect(() => reroll(g, [99, -1])).not.toThrow();
  expect(g.players.A.rerollsUsed).toBe(1);
});

test('Guard wall restricts targets; killing the last Guard frees later attacks (§8 sequential)', () => {
  const g = combatGame();
  const guard = makeInst(mkU('g1', { hp: 1, keywords: ['Guard'] }), 'B');
  const vanilla = makeInst(mkU('v1'), 'B');
  g.players.B.board.push(guard, vanilla);
  const att = makeInst(mkU('a1', { atk: 3 }), 'A');
  const att2 = makeInst(mkU('a2', { atk: 3 }), 'A');
  g.players.A.board.push(att, att2);

  let targets = legalTargets(g, 'A');
  expect(targets.map((t) => t.iid)).toEqual([guard.iid]); // only Guards, no leader
  expect(attack(g, att.iid, vanilla.iid)).toBe(false); // illegal past the wall
  expect(attack(g, att.iid, guard.iid)).toBe(true); // guard dies
  targets = legalTargets(g, 'A');
  expect(targets.some((t) => t.def.type === 'Leader')).toBe(true);
  expect(attack(g, att2.iid, g.players.B.leader.iid)).toBe(true);
});

test('Pierce overflow is exactly the leftover, goes through even if attacker dies, blocked by Ward', () => {
  const g = combatGame();
  const att = makeInst(mkU('p1', { atk: 5, hp: 1, keywords: ['Pierce'] }), 'A');
  const blocker = makeInst(mkU('b1', { atk: 4, hp: 2 }), 'B');
  g.players.A.board.push(att);
  g.players.B.board.push(blocker);
  expect(attack(g, att.iid, blocker.iid)).toBe(true);
  // leftover = 5 - 2 = 3 to Leader; attacker died to retaliation but overflow still lands
  expect(g.players.B.leader.damage).toBe(3);
  expect(g.players.A.board.length).toBe(0);
  expect(g.players.B.board.length).toBe(0);

  // Ward fully prevents the hit -> no leftover at all
  const att2 = makeInst(mkU('p2', { atk: 5, hp: 9, keywords: ['Pierce'] }), 'A');
  const warded = makeInst(mkU('w1', { atk: 0, hp: 2, keywords: ['Ward'] }), 'B');
  g.players.A.board.push(att2);
  g.players.B.board.push(warded);
  expect(attack(g, att2.iid, warded.iid)).toBe(true);
  expect(g.players.B.leader.damage).toBe(3); // unchanged
  expect(warded.damage).toBe(0);
});

test('Toll stacks are capped at 3 and reduce attack, Sap and Pierce-overflow Leader damage', () => {
  const g = combatGame();
  for (let i = 0; i < 4; i++) {
    g.players.B.board.push(makeInst(mkU(`t${i}`, { atk: 0, hp: 9, toll: { x: 1 } }), 'B'));
  }
  applyEffect(g, 'A', { action: 'sap', value: 5, target: 'enemyLeader' });
  expect(g.players.B.leader.damage).toBe(2); // 5 - min(3, 4 stacks)
  // Unit damage is NOT Toll-reduced
  applyEffect(g, 'A', { action: 'sap', value: 2, target: 'enemyUnit' }, g.players.B.board[0].iid);
  expect(g.players.B.board[0].damage).toBe(2);
});

test('Bulwark reduces attack + retaliation damage but never Sap (§10, Toll is the Sap answer)', () => {
  const g = combatGame();
  const bul = makeInst(mkU('bw', { atk: 3, hp: 10, bulwark: { x: 2 } }), 'B');
  g.players.B.board.push(bul);
  const att = makeInst(mkU('a', { atk: 4, hp: 10, bulwark: { x: 1 } }), 'A');
  g.players.A.board.push(att);
  expect(attack(g, att.iid, bul.iid)).toBe(true);
  expect(bul.damage).toBe(2); // 4 - 2 Bulwark
  expect(att.damage).toBe(2); // 3 retaliation - attacker's own Bulwark 1
  applyEffect(g, 'A', { action: 'sap', value: 3, target: 'enemyUnit' }, bul.iid);
  expect(bul.damage).toBe(5); // Sap ignores Bulwark entirely
});

test('Frenzy: two attacks max, only the second takes doubled retaliation, dead Frenzy gets no second', () => {
  const g = combatGame();
  const fz = makeInst(mkU('fz', { atk: 2, hp: 9, keywords: ['Frenzy'] }), 'A');
  g.players.A.board.push(fz);
  const wall = makeInst(mkU('wall', { atk: 2, hp: 20 }), 'B');
  g.players.B.board.push(wall);
  expect(attack(g, fz.iid, wall.iid)).toBe(true);
  expect(fz.damage).toBe(2); // normal retaliation on first swing
  expect(canAttack(g, fz)).toBe(true);
  expect(attack(g, fz.iid, wall.iid)).toBe(true);
  expect(fz.damage).toBe(2 + 4); // doubled retaliation on the bonus swing
  expect(canAttack(g, fz)).toBe(false); // no third attack
});

test('ATK is never negative: a debuffed 0-ATK unit deals 0, never heals (§8)', () => {
  const g = combatGame();
  const weak = makeInst(mkU('weak', { atk: 1 }), 'A');
  weak.permAtk = -5;
  g.players.A.board.push(weak);
  const tgt = makeInst(mkU('tgt', { atk: 0, hp: 5 }), 'B');
  tgt.damage = 2;
  g.players.B.board.push(tgt);
  expect(attack(g, weak.iid, tgt.iid)).toBe(true);
  expect(tgt.damage).toBe(2); // 0 damage dealt, no "healing"
});

test('Anchor reduction caps at 2 and floors at 1; Overflow keys off the effective threshold', () => {
  const g = freshGame();
  const p = g.players.A;
  for (let i = 0; i < 3; i++) p.board.push(makeInst(mkU(`an${i}`, { keywords: ['Anchor'] }), 'A'));
  const costly = mkU('anc', { threshold: 6, keywords: ['Anchor'] });
  expect(effThreshold(g, 'A', costly)).toBe(4); // -2 cap despite 3 Anchors in play
  const cheap = mkU('anc2', { threshold: 2, keywords: ['Anchor'] });
  expect(effThreshold(g, 'A', cheap)).toBe(1); // floor 1

  // Overflow vs effective threshold: printed 6, effective 4, Overflow 2 -> a 6 triggers it.
  g.active = 'A';
  startTurn(g);
  reroll(g, []);
  const of = makeInst(
    mkU('of', {
      threshold: 6,
      keywords: ['Anchor'],
      overflow: { amount: 2, effect: { action: 'buff', value: 1, target: 'self' } },
    }),
    'A',
  );
  p.hand.push(of);
  const die = p.dice.findIndex((d) => !d.placed);
  p.dice[die].value = 6;
  expect(castFromHand(g, die, of.iid)).toBe(true);
  const onBoard = p.board.find((u) => u.iid === of.iid)!;
  expect(onBoard.permAtk).toBe(1); // Overflow fired off 6 - 4 >= 2
});

test('Echo: a spent-Echo unit that dies is banished, and can never be recast a second time', () => {
  const g = freshGame();
  g.active = 'A';
  startTurn(g);
  reroll(g, []);
  const p = g.players.A;
  const inst = makeInst(mkU('eu', { keywords: ['Echo'], hp: 1 }), 'A');
  p.discard.push(inst);
  let die = p.dice.findIndex((d) => !d.placed);
  p.dice[die].value = 6;
  expect(echoRecast(g, die, inst.iid, p.hand[0].iid)).toBe(true);
  // kill it: next discard event banishes
  inst.damage = 99;
  cleanupDeaths(g);
  expect(p.banished.some((c) => c.iid === inst.iid)).toBe(true);
  // even if it somehow sat in discard, echoSpent blocks a second recast
  p.discard.push(inst);
  die = p.dice.findIndex((d) => !d.placed);
  p.dice[die].value = 6;
  expect(echoRecast(g, die, inst.iid, p.hand[0].iid)).toBe(false);
});

test('Twin one-die-per-turn: staged-this-turn card cannot complete until a later turn (v4.0)', () => {
  const g = freshGame();
  g.active = 'A';
  startTurn(g);
  reroll(g, []);
  const p = g.players.A;
  const twin = makeInst(mkU('tw', { threshold: 2, keywords: ['Twin'] }), 'A');
  p.hand.push(twin);
  const [d1, d2] = p.dice.map((d, i) => i).filter((i) => !p.dice[i].placed);
  p.dice[d1].value = 4;
  p.dice[d2].value = 4;
  expect(castFromHand(g, d1, twin.iid)).toBe(true);
  expect(p.staging.some((c) => c.iid === twin.iid)).toBe(true);
  expect(completeTwin(g, d2, twin.iid)).toBe(false); // same Placement Phase — blocked
  // wrong face value also blocked on a later turn
  twin.stagedThisTurn = false;
  p.dice[d2].value = 5;
  expect(completeTwin(g, d2, twin.iid)).toBe(false);
  p.dice[d2].value = 4;
  expect(completeTwin(g, d2, twin.iid)).toBe(true);
  expect(p.board.some((u) => u.iid === twin.iid)).toBe(true);
});

test("Twin 'sameTurn' mode auto-completes when a matching die is available", () => {
  const rng = mulberry32(2);
  const g = newGame(buildDeck(ARCHETYPES[0]), buildDeck(ARCHETYPES[1]), rng, {
    twinMode: 'sameTurn',
  });
  g.active = 'A';
  startTurn(g);
  reroll(g, []);
  const p = g.players.A;
  const twin = makeInst(mkU('tw2', { threshold: 2, keywords: ['Twin'] }), 'A');
  p.hand.push(twin);
  const idxs = p.dice.map((d, i) => i).filter((i) => !p.dice[i].placed);
  p.dice[idxs[0]].value = 3;
  p.dice[idxs[1]].value = 3;
  expect(castFromHand(g, idxs[0], twin.iid)).toBe(true);
  expect(p.board.some((u) => u.iid === twin.iid)).toBe(true); // completed same phase
  expect(p.staging.length).toBe(0);
});

test('one Combo-gated card per turn, shared between casts and Echo recasts (v4.2 errata A)', () => {
  const g = freshGame();
  g.active = 'A';
  startTurn(g);
  reroll(g, []);
  const p = g.players.A;
  p.dice.forEach((d) => {
    d.value = 5;
    d.placed = false;
  }); // Yahtzee of 5s => AnyPair met
  const gated1: CardDef = { id: 'cg1', name: 'cg1', type: 'Event', comboGate: 'AnyPair', onCast: { action: 'draw', value: 1, target: 'none' } };
  const gated2: CardDef = { id: 'cg2', name: 'cg2', type: 'Event', comboGate: 'AnyPair', onCast: { action: 'draw', value: 1, target: 'none' } };
  const a = makeInst(gated1, 'A');
  const b = makeInst(gated2, 'A');
  p.hand.push(a, b);
  expect(castFromHand(g, 0, a.iid)).toBe(true);
  expect(castFromHand(g, 1, b.iid)).toBe(false); // cap hit
  // Echo recast of a gated card is also under the cap
  const gatedEcho = makeInst(
    { id: 'cg3', name: 'cg3', type: 'Event', comboGate: 'AnyPair', keywords: ['Echo'], onCast: { action: 'draw', value: 1, target: 'none' } },
    'A',
  );
  p.discard.push(gatedEcho);
  expect(echoRecast(g, 1, gatedEcho.iid, p.hand[0].iid)).toBe(false);
});

test('pattern rulings: Yahtzee subsets, TwoPair needs distinct values, FullHouse needs a real pair', () => {
  const y = [4, 4, 4, 4, 4];
  expect(matchesPattern(y, 'AnyPair')).toBe(true);
  expect(matchesPattern(y, 'ThreeKind')).toBe(true);
  expect(matchesPattern(y, 'FourKind')).toBe(true);
  expect(matchesPattern(y, 'Yahtzee')).toBe(true);
  expect(matchesPattern(y, 'TwoPair')).toBe(false); // needs two DIFFERENT values
  expect(matchesPattern(y, 'FullHouse')).toBe(false); // no second distinct pair
  expect(matchesPattern([3, 3, 3, 3, 2], 'FullHouse')).toBe(false);
  expect(matchesPattern([3, 3, 3, 2, 2], 'FullHouse')).toBe(true);
  expect(matchesPattern([1, 2, 3, 4, 6], 'SmallStraight')).toBe(true);
  expect(matchesPattern([1, 2, 3, 5, 6], 'SmallStraight')).toBe(false);
  expect(matchesPattern([2, 3, 4, 5, 6], 'LargeStraight')).toBe(true);
  expect(matchesPattern([1, 1, 3, 5, 2], 'ThreeOdds')).toBe(true);
  expect(matchesPattern([2, 2, 4, 1, 3], 'ThreeEvens')).toBe(true);
  expect(matchesPattern([2, 2, 1, 1, 3], 'ThreeEvens')).toBe(false);
});

test('Ultimate: locked before turn N, threshold enforced, strictly once per game', () => {
  const g = freshGame();
  g.active = 'A';
  const p = g.players.A;
  p.leader.def = {
    ...p.leader.def,
    ultimate: { unlockTurn: 3, threshold: 5, effect: { action: 'sap', value: 8, target: 'enemyLeader' } },
  };
  startTurn(g);
  reroll(g, []);
  p.dice.forEach((d) => (d.value = 6));
  p.turnsTaken = 2;
  expect(activateUltimate(g, 0)).toBe(false); // locked (turn 2 < 3)
  p.turnsTaken = 3;
  p.dice[0].value = 4;
  expect(activateUltimate(g, 0)).toBe(false); // die below threshold
  expect(activateUltimate(g, 1)).toBe(true);
  expect(g.players.B.leader.damage).toBe(8);
  expect(activateUltimate(g, 2)).toBe(false); // once per game
  // survives a new turn's exhaustion reset
  endTurn(g);
  g.active = 'A';
  startTurn(g);
  reroll(g, []);
  p.dice.forEach((d) => (d.value = 6));
  expect(activateUltimate(g, 0)).toBe(false);
});

test('Resolve: Leader ability threshold drops by X at half HP or below, floor 1', () => {
  const g = freshGame();
  const p = g.players.A;
  p.leader.def = {
    ...p.leader.def,
    resolve: { x: 3 },
    ability: { threshold: 4, effect: { action: 'draw', value: 1, target: 'none' } },
  };
  expect(effAbilityThreshold(g, p.leader)).toBe(4); // full HP: no discount
  p.leader.damage = Math.ceil((p.leader.def.hp || 0) / 2);
  expect(effAbilityThreshold(g, p.leader)).toBe(1); // 4 - 3 = 1
  p.leader.def = { ...p.leader.def, resolve: { x: 5 } };
  expect(effAbilityThreshold(g, p.leader)).toBe(1); // floor at 1
});

test('Mend never over-heals: damage floors at 0 (never past max HP, §8)', () => {
  const g = freshGame();
  g.players.A.leader.damage = 2;
  applyEffect(g, 'A', { action: 'mend', value: 10, target: 'friendlyLeader' });
  expect(g.players.A.leader.damage).toBe(0);
});

test('Avenge: +1/+1 per friendly death including simultaneous deaths; a dying Avenge unit gains nothing', () => {
  const g = freshGame();
  const p = g.players.A;
  const av = makeInst(mkU('av', { hp: 9, avenge: true }), 'A');
  const dyingAv = makeInst(mkU('av2', { hp: 1, avenge: true }), 'A');
  const d1 = makeInst(mkU('d1', { hp: 1 }), 'A');
  const d2 = makeInst(mkU('d2', { hp: 1 }), 'A');
  p.board.push(av, dyingAv, d1, d2);
  applyEffect(g, 'A', { action: 'sap', value: 1, target: 'self' }, undefined, dyingAv);
  // dyingAv, d1... only dyingAv died from that sap. Now wipe d1+d2 together:
  d1.damage = 9;
  d2.damage = 9;
  cleanupDeaths(g);
  expect(av.permAtk).toBe(1 + 2); // 1 from dyingAv, 2 from the simultaneous pair
  expect(av.permHp).toBe(3);
  expect(p.board.some((u) => u.iid === dyingAv.iid)).toBe(false);
});

test('Ward is consumed by destroy (Removal) but never by Bind (§10)', () => {
  const g = freshGame();
  const w = makeInst(mkU('wd', { keywords: ['Ward'] }), 'B');
  g.players.B.board.push(w);
  applyEffect(g, 'A', { action: 'bind', target: 'enemyUnit' }, w.iid);
  expect(w.boundNextTurn).toBe(true);
  expect(w.wardUsed).toBe(false); // Bind isn't damage/Removal
  applyEffect(g, 'A', { action: 'destroy', target: 'enemyUnit' }, w.iid);
  expect(w.wardUsed).toBe(true);
  expect(g.players.B.board.some((u) => u.iid === w.iid)).toBe(true); // survived via Ward
  applyEffect(g, 'A', { action: 'destroy', target: 'enemyUnit' }, w.iid);
  expect(g.players.B.board.some((u) => u.iid === w.iid)).toBe(false);
});

test('attacking a Leader is one-directional and effect-draws never deck anyone out (§8, §9)', () => {
  const g = combatGame();
  const att = makeInst(mkU('fa', { atk: 4, hp: 4 }), 'A');
  g.players.A.board.push(att);
  expect(attack(g, att.iid, g.players.B.leader.iid)).toBe(true);
  expect(g.players.B.leader.damage).toBe(4);
  expect(att.damage).toBe(0); // no retaliation from a Leader
  // non-Draw-Phase draw on empty deck: no loss, no crash
  g.players.A.deck = [];
  applyEffect(g, 'A', { action: 'draw', value: 3, target: 'none' });
  expect(g.winner).toBe(null);
});

test('autoTarget on an empty enemy board: enemyUnit-sap fizzles safely, anyTarget goes face', () => {
  const g = freshGame();
  g.players.B.board = [];
  expect(autoTargetSafe(g)).toBe(true);
});

function autoTargetSafe(g: Game): boolean {
  applyEffect(g, 'A', { action: 'sap', value: 3, target: 'enemyUnit' }, undefined);
  const afterFizzle: number = g.players.B.leader.damage;
  if (afterFizzle !== 0) return false; // must not leak to the leader
  applyEffect(g, 'A', { action: 'sap', value: 3, target: 'anyTarget' }, g.players.B.leader.iid);
  const afterFace: number = g.players.B.leader.damage;
  return afterFace === 3;
}
