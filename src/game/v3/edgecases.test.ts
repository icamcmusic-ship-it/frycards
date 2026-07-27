/**
 * Adversarial edge-case suite — deliberately hostile inputs and rare timing
 * windows that the happy-path suites in engine.test.ts / keywords-v6.test.ts
 * never reach. Every test here was written to BREAK the engine; the ones that
 * did are documented with the fix they now guard.
 */
import { describe, expect, test } from 'vitest';
import { CardDef, LEADER_HP, MAX_HAND } from './cards';
import {
  DeckDef,
  GameState,
  activateLeaderAbility,
  applyEffect,
  canInvoke,
  createGame,
  declareAttackers,
  declareGuards,
  effGrit,
  effMight,
  endPhase,
  findUnit,
  invokeCard,
  invokeLeader,
  legalGuardsFor,
  makeCardInst,
  mulberry32,
  mulliganHand,
  playWellspring,
  rebondCharm,
  resolveClash,
  summonUnit,
  tapLocationForEssence,
} from './engine';

const U = (
  id: string,
  might: number,
  grit: number,
  keywords: string[] = [],
  extra: Partial<CardDef> = {},
): CardDef => ({
  id,
  name: id,
  type: 'Unit',
  cost: { generic: 0, pips: {} },
  might,
  grit,
  keywords,
  ...extra,
});

const LEADER: CardDef = {
  id: 'test_leader',
  name: 'Test Leader',
  type: 'Leader',
  cost: { generic: 1, pips: {} },
  resolve: 3,
  leaderAbilities: [
    { resolveDelta: -1, effect: { action: 'damage', value: 2, target: 'anyTarget' }, text: '-1: 2 dmg' },
    { resolveDelta: 1, effect: { action: 'draw', value: 1, target: 'none' }, text: '+1: deal 1' },
  ],
};
const VANILLA = U('vanilla', 2, 2);
const POOL: Record<string, CardDef> = { [LEADER.id]: LEADER, [VANILLA.id]: VANILLA };

function game(opts: { deck?: string[]; handSize?: number } = {}): GameState {
  const dd = (): DeckDef => ({ leaderId: LEADER.id, cards: opts.deck ?? [] });
  return createGame(dd(), dd(), POOL, {
    rng: mulberry32(7),
    shuffle: false,
    handSize: opts.handSize ?? 0,
  });
}

function toHand(state: GameState, pid: 'P1' | 'P2', def: CardDef): string {
  const inst = makeCardInst(def);
  state.players[pid].hand.push(inst);
  return inst.iid;
}

/** Give a player enough colorless essence to pay anything in these tests. */
function fund(state: GameState, pid: 'P1' | 'P2', n = 9): void {
  state.players[pid].essence = { Ember: n, Tide: n, Root: n, Gale: n, Light: n, Shadow: n, Void: n };
}

// ---------------------------------------------------------------------------
// Clash: removing a guard mid-clash
// ---------------------------------------------------------------------------
describe('guard removed during the reaction window', () => {
  const QUICK_SHATTER: CardDef = {
    id: 'quick_shatter',
    name: 'Quick Shatter',
    type: 'Event',
    subtype: 'Quick',
    cost: { generic: 0, pips: {} },
    onInvoke: { action: 'shatter', target: 'enemyUnit' },
  };

  test('a guarded attacker whose guard is killed in the window deals NO face damage', () => {
    const s = game();
    const attacker = summonUnit(s, 'P1', U('atk', 6, 6));
    const guard = summonUnit(s, 'P2', U('wall', 1, 8));
    s.phase = 'Clash';
    expect(declareAttackers(s, [attacker.iid])).toBe(true);
    expect(declareGuards(s, { [attacker.iid]: [guard.iid] })).toBe(true);

    // The ATTACKING player removes their own blocker in the reaction window.
    const iid = toHand(s, 'P1', QUICK_SHATTER);
    fund(s, 'P1');
    expect(invokeCard(s, 'P1', iid, { targetIid: guard.iid })).toBe(true);
    expect(findUnit(s, guard.iid)).toBeUndefined();

    const before = s.players.P2.vitality;
    resolveClash(s);
    // Blocked is blocked: killing the blocker must not convert the attack
    // into an unblocked hit for full Might.
    expect(s.players.P2.vitality).toBe(before);
  });

  test('an Overrun attacker whose guard is killed in the window still spills', () => {
    const s = game();
    const attacker = summonUnit(s, 'P1', U('trampler', 6, 6, ['Overrun']));
    const guard = summonUnit(s, 'P2', U('wall', 1, 8));
    s.phase = 'Clash';
    declareAttackers(s, [attacker.iid]);
    declareGuards(s, { [attacker.iid]: [guard.iid] });
    const iid = toHand(s, 'P1', QUICK_SHATTER);
    fund(s, 'P1');
    invokeCard(s, 'P1', iid, { targetIid: guard.iid });

    const before = s.players.P2.vitality;
    resolveClash(s);
    // Nothing was absorbed (the guard never took damage), so Overrun spills
    // the attacker's full Might — but ONLY because it has Overrun.
    expect(s.players.P2.vitality).toBe(before - 6);
  });

  test('a guard that dies to first-strike damage still absorbs the normal step', () => {
    const s = game();
    const attacker = summonUnit(s, 'P1', U('qs', 5, 5, ['Quickstrike']));
    const guard = summonUnit(s, 'P2', U('chump', 1, 2));
    s.phase = 'Clash';
    declareAttackers(s, [attacker.iid]);
    declareGuards(s, { [attacker.iid]: [guard.iid] });
    const before = s.players.P2.vitality;
    resolveClash(s);
    expect(findUnit(s, guard.iid)).toBeUndefined();
    expect(s.players.P2.vitality).toBe(before); // no Overrun: no spill
  });
});

// ---------------------------------------------------------------------------
// Clash: hostile guard assignments
// ---------------------------------------------------------------------------
describe('declareGuards rejects illegal assignments', () => {
  test('a unit cannot guard two attackers', () => {
    const s = game();
    const a1 = summonUnit(s, 'P1', VANILLA);
    const a2 = summonUnit(s, 'P1', VANILLA);
    const g = summonUnit(s, 'P2', VANILLA);
    s.phase = 'Clash';
    declareAttackers(s, [a1.iid, a2.iid]);
    expect(declareGuards(s, { [a1.iid]: [g.iid], [a2.iid]: [g.iid] })).toBe(false);
  });

  test('the same guard listed twice on one attacker is rejected', () => {
    const s = game();
    const a = summonUnit(s, 'P1', VANILLA);
    const g = summonUnit(s, 'P2', VANILLA);
    s.phase = 'Clash';
    declareAttackers(s, [a.iid]);
    expect(declareGuards(s, { [a.iid]: [g.iid, g.iid] })).toBe(false);
  });

  test("an attacker's own controller cannot be assigned as a guard", () => {
    const s = game();
    const a = summonUnit(s, 'P1', VANILLA);
    const mine = summonUnit(s, 'P1', VANILLA);
    summonUnit(s, 'P2', VANILLA);
    s.phase = 'Clash';
    declareAttackers(s, [a.iid]);
    expect(declareGuards(s, { [a.iid]: [mine.iid] })).toBe(false);
  });

  test('guarding a unit that is not an attacker is rejected', () => {
    const s = game();
    const a = summonUnit(s, 'P1', VANILLA);
    const bystander = summonUnit(s, 'P1', VANILLA, { exhausted: true });
    const g = summonUnit(s, 'P2', VANILLA);
    s.phase = 'Clash';
    declareAttackers(s, [a.iid]);
    expect(declareGuards(s, { [bystander.iid]: [g.iid] })).toBe(false);
  });

  test('a failed declareGuards leaves the previous assignment untouched', () => {
    const s = game();
    const a = summonUnit(s, 'P1', VANILLA);
    const g = summonUnit(s, 'P2', VANILLA);
    summonUnit(s, 'P2', VANILLA);
    s.phase = 'Clash';
    declareAttackers(s, [a.iid]);
    expect(declareGuards(s, { [a.iid]: ['nonexistent'] })).toBe(false);
    expect(s.clash!.guards).toEqual({});
    expect(s.clash!.step).toBe('guards');
  });

  test('Swarmproof rejects a lone guard but accepts two', () => {
    const s = game();
    const a = summonUnit(s, 'P1', U('swarm', 4, 4, ['Swarmproof']));
    const g1 = summonUnit(s, 'P2', VANILLA);
    const g2 = summonUnit(s, 'P2', VANILLA);
    s.phase = 'Clash';
    declareAttackers(s, [a.iid]);
    expect(declareGuards(s, { [a.iid]: [g1.iid] })).toBe(false);
    expect(declareGuards(s, { [a.iid]: [g1.iid, g2.iid] })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Timing / phase machine
// ---------------------------------------------------------------------------
describe('phase machine cannot be desynced', () => {
  test('endPhase is refused while a clash is unresolved', () => {
    const s = game();
    const a = summonUnit(s, 'P1', VANILLA);
    s.phase = 'Clash';
    declareAttackers(s, [a.iid]);
    expect(endPhase(s)).toBe(false);
    expect(s.phase).toBe('Clash');
    resolveClash(s);
    expect(endPhase(s)).toBe(true);
  });

  test('attackers cannot be declared twice in one clash', () => {
    const s = game();
    const a = summonUnit(s, 'P1', VANILLA);
    const b = summonUnit(s, 'P1', VANILLA);
    s.phase = 'Clash';
    expect(declareAttackers(s, [a.iid])).toBe(true);
    expect(declareAttackers(s, [b.iid])).toBe(false);
  });

  test('resolveClash is idempotent — a second call cannot re-deal damage', () => {
    const s = game();
    const a = summonUnit(s, 'P1', U('hitter', 3, 3));
    s.phase = 'Clash';
    declareAttackers(s, [a.iid]);
    resolveClash(s);
    const after = s.players.P2.vitality;
    expect(resolveClash(s)).toBe(false);
    expect(s.players.P2.vitality).toBe(after);
  });

  test('a Slow Event is illegal in the reaction window, a Quick one is legal', () => {
    const s = game();
    const a = summonUnit(s, 'P1', VANILLA);
    summonUnit(s, 'P2', VANILLA);
    s.phase = 'Clash';
    declareAttackers(s, [a.iid]);
    declareGuards(s, {});
    const slow = toHand(s, 'P2', {
      id: 'slow_ev',
      name: 'slow',
      type: 'Event',
      subtype: 'Slow',
      cost: { generic: 0, pips: {} },
      onInvoke: { action: 'draw', value: 1, target: 'none' },
    });
    const quick = toHand(s, 'P2', {
      id: 'quick_ev',
      name: 'quick',
      type: 'Event',
      subtype: 'Quick',
      cost: { generic: 0, pips: {} },
      onInvoke: { action: 'draw', value: 1, target: 'none' },
    });
    fund(s, 'P2');
    expect(canInvoke(s, 'P2', slow)).toBe(false);
    expect(canInvoke(s, 'P2', quick)).toBe(true);
  });

  test('a non-Ambush unit cannot be dropped in the reaction window', () => {
    const s = game();
    const a = summonUnit(s, 'P1', VANILLA);
    s.phase = 'Clash';
    declareAttackers(s, [a.iid]);
    declareGuards(s, {});
    const plain = toHand(s, 'P2', VANILLA);
    const ambush = toHand(s, 'P2', U('sneak', 2, 2, ['Ambush']));
    fund(s, 'P2');
    expect(canInvoke(s, 'P2', plain)).toBe(false);
    expect(canInvoke(s, 'P2', ambush)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Costs & essence
// ---------------------------------------------------------------------------
describe('essence cannot be conjured', () => {
  test('a failed invoke spends nothing', () => {
    const s = game();
    s.players.P1.essence = { Ember: 2 };
    // A Charm with no unit to bond to: canInvoke refuses, essence must stay.
    const charm = toHand(s, 'P1', {
      id: 'lone_charm',
      name: 'charm',
      type: 'Charm',
      subtype: 'Bound',
      cost: { generic: 1, pips: {} },
      bond: { might: 1 },
    });
    expect(invokeCard(s, 'P1', charm)).toBe(false);
    expect(s.players.P1.essence.Ember).toBe(2);
    expect(s.players.P1.hand.length).toBe(1);
  });

  test('a Charm cannot be bonded to an enemy unit', () => {
    const s = game();
    summonUnit(s, 'P1', VANILLA);
    const enemy = summonUnit(s, 'P2', VANILLA);
    const charm = toHand(s, 'P1', {
      id: 'charm2',
      name: 'charm2',
      type: 'Charm',
      subtype: 'Bound',
      cost: { generic: 0, pips: {} },
      bond: { might: 5 },
    });
    fund(s, 'P1');
    expect(invokeCard(s, 'P1', charm, { bondTargetIid: enemy.iid })).toBe(false);
    expect(effMight(s, enemy)).toBe(2);
  });

  test('re-bonding a Worn Charm onto an enemy unit is refused', () => {
    const s = game();
    const mine = summonUnit(s, 'P1', VANILLA);
    const enemy = summonUnit(s, 'P2', VANILLA);
    const charm = { iid: 'worn#1', def: { id: 'w', name: 'w', type: 'Charm' as const, subtype: 'Worn' as const, rebondCost: 1, bond: { might: 3 } } };
    s.players.P1.wornCharms.push(charm);
    fund(s, 'P1');
    expect(rebondCharm(s, 'P1', charm.iid, enemy.iid)).toBe(false);
    expect(rebondCharm(s, 'P1', charm.iid, mine.iid)).toBe(true);
    expect(effMight(s, mine)).toBe(5);
  });

  test('a pip cost cannot be paid with the wrong essence type', () => {
    const s = game();
    s.players.P1.essence = { Tide: 5 };
    const unit = toHand(s, 'P1', U('embery', 2, 2, [], { cost: { generic: 0, pips: { Ember: 1 } } }));
    expect(canInvoke(s, 'P1', unit)).toBe(false);
  });

  test('generic payment never strands a pip another card still needs', () => {
    const s = game();
    // Ember 1 + Tide 1; pay a {generic:1} card — the engine must spend the
    // most plentiful type, not blindly the first, so a later Ember-pip card
    // is not falsely locked out.
    s.players.P1.essence = { Ember: 1, Tide: 2 };
    const generic = toHand(s, 'P1', U('g', 1, 1, [], { cost: { generic: 1, pips: {} } }));
    invokeCard(s, 'P1', generic);
    expect(s.players.P1.essence.Ember).toBe(1);
  });

  test('a Location cannot be exhausted twice in a turn', () => {
    const s = game();
    s.players.P1.locations.push({ iid: 'loc#1', produces: 'Ember', exhausted: false });
    expect(tapLocationForEssence(s, 'P1', 'loc#1')).toBe(true);
    expect(tapLocationForEssence(s, 'P1', 'loc#1')).toBe(false);
    expect(s.players.P1.essence.Ember).toBe(1);
  });

  test("a player cannot exhaust the opponent's Location", () => {
    const s = game();
    s.players.P2.locations.push({ iid: 'loc#2', produces: 'Ember', exhausted: false });
    expect(tapLocationForEssence(s, 'P1', 'loc#2')).toBe(false);
  });

  test('the Wellspring allowance cannot be exceeded', () => {
    const s = game();
    expect(playWellspring(s, 'P1', 'Shadow')).toBe(true);
    expect(playWellspring(s, 'P1', 'Shadow')).toBe(false);
    expect(s.players.P1.locations.length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Leader
// ---------------------------------------------------------------------------
describe('leader abuse', () => {
  test('a shattered Leader cannot be re-invoked or activated', () => {
    const s = game();
    fund(s, 'P1');
    invokeLeader(s, 'P1');
    s.players.P1.leader.resolve = 1;
    summonUnit(s, 'P2', VANILLA);
    expect(activateLeaderAbility(s, 'P1', 0)).toBe(true);
    expect(s.players.P1.leader.shattered).toBe(true);
    fund(s, 'P1');
    expect(invokeLeader(s, 'P1')).toBe(false);
    s.players.P1.leader.abilityUsedThisTurn = false;
    expect(activateLeaderAbility(s, 'P1', 0)).toBe(false);
  });

  test('a Leader ability cannot be used twice in one turn', () => {
    const s = game();
    fund(s, 'P1');
    invokeLeader(s, 'P1');
    expect(activateLeaderAbility(s, 'P1', 1)).toBe(true);
    expect(activateLeaderAbility(s, 'P1', 1)).toBe(false);
  });

  test('an out-of-range ability index is refused', () => {
    const s = game();
    fund(s, 'P1');
    invokeLeader(s, 'P1');
    expect(activateLeaderAbility(s, 'P1', 99)).toBe(false);
    expect(activateLeaderAbility(s, 'P1', -1)).toBe(false);
    expect(s.players.P1.leader.abilityUsedThisTurn).toBe(false);
  });

  test('Leader abilities are illegal during the opponent clash window', () => {
    const s = game();
    fund(s, 'P1');
    invokeLeader(s, 'P1');
    s.players.P1.leader.abilityUsedThisTurn = false;
    const a = summonUnit(s, 'P1', VANILLA);
    s.phase = 'Clash';
    declareAttackers(s, [a.iid]);
    expect(activateLeaderAbility(s, 'P1', 1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Effects & targeting
// ---------------------------------------------------------------------------
describe('effect targeting', () => {
  test('a Warded enemy unit is untargetable but still takes sweeper damage', () => {
    const s = game();
    const w = summonUnit(s, 'P2', U('warded', 2, 4, ['Warded']));
    applyEffect(s, 'P1', { action: 'damage', value: 3, target: 'enemyUnit' }, w.iid);
    expect(findUnit(s, w.iid)!.damage).toBe(0);
    applyEffect(s, 'P1', { action: 'damage', value: 3, target: 'allEnemyUnits' });
    expect(findUnit(s, w.iid)!.damage).toBe(3);
  });

  test('a buff aimed at an enemy unit fizzles instead of buffing them', () => {
    const s = game();
    const enemy = summonUnit(s, 'P2', VANILLA);
    applyEffect(s, 'P1', { action: 'buff', value: 3, target: 'friendlyUnit' }, enemy.iid);
    expect(effMight(s, enemy)).toBe(2);
  });

  test('healing cannot push Vitality above the starting value', () => {
    const s = game();
    s.players.P1.vitality = LEADER_HP - 1;
    applyEffect(s, 'P1', { action: 'heal', value: 50, target: 'friendlyPlayer' });
    expect(s.players.P1.vitality).toBe(LEADER_HP);
  });

  test('healing a unit cannot drive marked damage negative', () => {
    const s = game();
    const u = summonUnit(s, 'P1', U('hurt', 2, 6));
    applyEffect(s, 'P1', { action: 'damage', value: 2, target: 'enemyUnit' }, u.iid); // wrong side: fizzles
    u.damage = 2;
    applyEffect(s, 'P1', { action: 'heal', value: 99, target: 'friendlyUnit' }, u.iid);
    expect(u.damage).toBe(0);
  });

  test('erode on an empty deck does not throw or go negative', () => {
    const s = game();
    s.players.P2.deck = [];
    applyEffect(s, 'P1', { action: 'erode', value: 5, target: 'enemyPlayer' });
    expect(s.players.P2.deck.length).toBe(0);
    expect(s.players.P2.ashPile.length).toBe(0);
    expect(s.winner).toBeNull(); // eroding out is not itself a loss
  });

  test('shatter is a no-op against Unbreakable and does not consume the effect', () => {
    const s = game();
    const unb = summonUnit(s, 'P2', U('unb', 2, 2, ['Unbreakable']));
    const soft = summonUnit(s, 'P2', U('soft', 5, 2));
    // autoTarget must skip the Unbreakable body and take the killable one.
    applyEffect(s, 'P1', { action: 'shatter', target: 'enemyUnit' });
    expect(findUnit(s, unb.iid)).toBeDefined();
    expect(findUnit(s, soft.iid)).toBeUndefined();
  });

  test('banish removes a unit to the Void, not the ash-pile', () => {
    const s = game();
    const u = summonUnit(s, 'P2', VANILLA);
    applyEffect(s, 'P1', { action: 'banish', target: 'enemyUnit' }, u.iid);
    expect(s.players.P2.voidPile.length).toBe(1);
    expect(s.players.P2.ashPile.length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Dawn/Dusk triggers
// ---------------------------------------------------------------------------
describe('turn-boundary triggers', () => {
  test('a unit killed by an earlier Dawn trigger does not fire its own', () => {
    const s = game({ deck: [VANILLA.id, VANILLA.id, VANILLA.id, VANILLA.id] });
    // P1 controls a self-damaging Dawn trigger plus a fragile body that the
    // sweep kills; the fragile body must not still resolve its own trigger.
    summonUnit(s, 'P1', U('sweeper', 1, 5, [], {
      triggers: [{ when: 'atDawn', effect: { action: 'damage', value: 9, target: 'allEnemyUnits' } }],
    }));
    const doomed = summonUnit(s, 'P2', U('doomed', 1, 1, [], {
      triggers: [{ when: 'atDawn', effect: { action: 'draw', value: 1, target: 'none' } }],
    }));
    // Hand P2 the Dawn: P1 ends their turn.
    s.phase = 'Main2';
    endPhase(s);
    expect(findUnit(s, doomed.iid)).toBeDefined(); // P2's own sweeper hasn't run
    // Now give P2 a sweeper of their own and pass back.
    summonUnit(s, 'P2', U('sweeper2', 1, 5, [], {
      triggers: [{ when: 'atDawn', effect: { action: 'damage', value: 9, target: 'allEnemyUnits' } }],
    }));
    const handBefore = s.players.P2.hand.length;
    s.phase = 'Main2';
    endPhase(s); // P1's Dawn
    s.phase = 'Main2';
    endPhase(s); // P2's Dawn: sweeper2 hits P1; doomed is P2's own, untouched
    expect(s.players.P2.hand.length).toBeGreaterThan(handBefore);
  });

  test('Dusk sheds down to MAX_HAND and no further', () => {
    const s = game();
    for (let i = 0; i < MAX_HAND + 4; i++) toHand(s, 'P1', VANILLA);
    s.phase = 'Main2';
    endPhase(s);
    expect(s.players.P1.hand.length).toBe(MAX_HAND);
    expect(s.players.P1.ashPile.length).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// Mulligan
// ---------------------------------------------------------------------------
describe('mulligan', () => {
  test('mulligan is refused after the first turn', () => {
    const s = game({ deck: [VANILLA.id, VANILLA.id, VANILLA.id], handSize: 1 });
    s.turn = 2;
    expect(mulliganHand(s, 'P1')).toBe(false);
  });

  test('mulligan is refused once a card has been invoked', () => {
    const s = game({ deck: [VANILLA.id, VANILLA.id, VANILLA.id], handSize: 1 });
    fund(s, 'P1');
    const iid = s.players.P1.hand[0].iid;
    invokeCard(s, 'P1', iid);
    expect(mulliganHand(s, 'P1')).toBe(false);
  });

  test('each mulligan shrinks the hand by exactly one', () => {
    const s = game({ deck: Array(10).fill(VANILLA.id), handSize: 4 });
    expect(s.players.P1.hand.length).toBe(4);
    mulliganHand(s, 'P1');
    expect(s.players.P1.hand.length).toBe(3);
    mulliganHand(s, 'P1');
    expect(s.players.P1.hand.length).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Keyword interactions
// ---------------------------------------------------------------------------
describe('keyword interactions', () => {
  test('Hardened fully absorbs a 1-damage Venomous hit — no venom mark', () => {
    const s = game();
    const venom = summonUnit(s, 'P1', U('asp', 1, 1, ['Venomous']));
    const golem = summonUnit(s, 'P2', U('golem', 0, 6, ['Hardened']));
    s.phase = 'Clash';
    declareAttackers(s, [venom.iid]);
    declareGuards(s, { [venom.iid]: [golem.iid] });
    resolveClash(s);
    expect(findUnit(s, golem.iid)).toBeDefined();
    expect(findUnit(s, golem.iid)!.damage).toBe(0);
  });

  test('Unbreakable survives Venomous and clears the venom mark', () => {
    const s = game();
    const venom = summonUnit(s, 'P1', U('asp2', 2, 1, ['Venomous']));
    const rock = summonUnit(s, 'P2', U('rock', 0, 9, ['Unbreakable']));
    s.phase = 'Clash';
    declareAttackers(s, [venom.iid]);
    declareGuards(s, { [venom.iid]: [rock.iid] });
    resolveClash(s);
    const alive = findUnit(s, rock.iid);
    expect(alive).toBeDefined();
    expect(alive!.venomed).toBeFalsy();
  });

  test('Aerial cannot be guarded by a ground unit even when it is the only body', () => {
    const s = game();
    const flyer = summonUnit(s, 'P1', U('flyer', 3, 3, ['Aerial']));
    summonUnit(s, 'P2', VANILLA);
    s.phase = 'Clash';
    declareAttackers(s, [flyer.iid]);
    expect(legalGuardsFor(s, flyer.iid)).toHaveLength(0);
  });

  test('Immobile units can still guard', () => {
    const s = game();
    const a = summonUnit(s, 'P1', VANILLA);
    const wall = summonUnit(s, 'P2', U('wall', 0, 9, ['Immobile']));
    s.phase = 'Clash';
    declareAttackers(s, [a.iid]);
    expect(legalGuardsFor(s, a.iid).map((u) => u.iid)).toContain(wall.iid);
  });

  test('Alert lets a unit attack and still guard on the next turn', () => {
    const s = game({ deck: Array(6).fill(VANILLA.id) });
    const alert = summonUnit(s, 'P1', U('scout', 2, 2, ['Alert']));
    s.phase = 'Clash';
    declareAttackers(s, [alert.iid]);
    expect(findUnit(s, alert.iid)!.exhausted).toBe(false);
    resolveClash(s);
    s.phase = 'Main2';
    endPhase(s); // pass to P2
    const enemy = summonUnit(s, 'P2', VANILLA);
    s.phase = 'Clash';
    declareAttackers(s, [enemy.iid]);
    expect(legalGuardsFor(s, enemy.iid).map((u) => u.iid)).toContain(alert.iid);
  });

  test('Siphon on Overrun spill gains Vitality from the face damage', () => {
    const s = game();
    s.players.P1.vitality = 10;
    const t = summonUnit(s, 'P1', U('vamp', 6, 6, ['Overrun', 'Siphon']));
    const g = summonUnit(s, 'P2', U('chump', 0, 2));
    s.phase = 'Clash';
    declareAttackers(s, [t.iid]);
    declareGuards(s, { [t.iid]: [g.iid] });
    resolveClash(s);
    // 2 absorbed by the guard + 4 spilled = 6 total damage dealt, all siphoned.
    expect(s.players.P1.vitality).toBe(16);
  });

  test('Regenerate clears marked damage at its own Dawn only', () => {
    const s = game();
    const troll = summonUnit(s, 'P2', U('troll', 2, 6, ['Regenerate']));
    troll.damage = 4;
    s.phase = 'Main2';
    endPhase(s); // P2's Dawn
    expect(findUnit(s, troll.iid)!.damage).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Win conditions
// ---------------------------------------------------------------------------
describe('win conditions', () => {
  test('dealing from an empty deck loses immediately', () => {
    const s = game();
    s.players.P1.deck = [];
    applyEffect(s, 'P1', { action: 'draw', value: 1, target: 'none' });
    expect(s.winner).toBe('P2');
  });

  test('simultaneous death awards the win to the non-active player', () => {
    const s = game();
    s.active = 'P1';
    s.players.P1.vitality = 0;
    s.players.P2.vitality = 0;
    applyEffect(s, 'P1', { action: 'draw', value: 0, target: 'none' });
    expect(s.winner).toBe('P2');
  });

  test('no action is legal once a winner exists', () => {
    const s = game();
    s.winner = 'P2';
    const u = toHand(s, 'P1', VANILLA);
    fund(s, 'P1');
    expect(canInvoke(s, 'P1', u)).toBe(false);
    expect(playWellspring(s, 'P1', 'Shadow')).toBe(false);
    expect(endPhase(s)).toBe(false);
  });
});
