/**
 * Fry Cards v5.0 engine tests: essence payment (colored pips + generic),
 * wellsprings, phase flow + dusk shed, clash math per keyword, leader
 * resolve/shatter, charm bond/re-bond, and both win conditions.
 */
import { describe, expect, test } from 'vitest';
import { CardDef, LEADER_HP, MAX_HAND } from './cards';
import {
  DeckDef,
  GameState,
  activateLeaderAbility,
  canInvoke,
  canPayCost,
  canTarget,
  createGame,
  declareAttackers,
  declareGuards,
  effGrit,
  effKeywords,
  effMight,
  endPhase,
  essenceTotal,
  findUnit,
  invokeCard,
  invokeLeader,
  legalAttackers,
  legalGuardsFor,
  makeCardInst,
  mulberry32,
  playWellspring,
  rebondCharm,
  resolveClash,
  summonUnit,
  tapLocationForEssence,
  applyEffect,
} from './engine';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const U = (id: string, might: number, grit: number, keywords: string[] = [], extra: Partial<CardDef> = {}): CardDef => ({
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

// Uses a real LEADER_COLORS id so wellspring identity is enforced (Shadow/Void).
const ABYSS_LEADER: CardDef = { ...LEADER, id: 'avatar_of_the_abyss', name: 'Abyss' };

const VANILLA = U('vanilla', 2, 2);

const POOL: Record<string, CardDef> = {
  [LEADER.id]: LEADER,
  [ABYSS_LEADER.id]: ABYSS_LEADER,
  [VANILLA.id]: VANILLA,
};

function game(opts: { deck?: string[]; leaderId?: string; handSize?: number } = {}): GameState {
  const dd = (leaderId: string): DeckDef => ({ leaderId, cards: opts.deck ?? [] });
  return createGame(dd(opts.leaderId ?? LEADER.id), dd(opts.leaderId ?? LEADER.id), POOL, {
    rng: mulberry32(42),
    shuffle: false,
    handSize: opts.handSize ?? 0,
  });
}

/** Put a card instance into a player's hand and return its iid. */
function toHand(state: GameState, pid: 'P1' | 'P2', def: CardDef): string {
  const inst = makeCardInst(def);
  state.players[pid].hand.push(inst);
  return inst.iid;
}

// ---------------------------------------------------------------------------
// Essence payment
// ---------------------------------------------------------------------------
describe('essence payment', () => {
  test('colored pips need matching essence; generic takes anything', () => {
    expect(canPayCost({ Ember: 1, Tide: 2 }, { generic: 1, pips: { Ember: 1 } })).toBe(true);
    expect(canPayCost({ Ember: 1, Tide: 2 }, { generic: 0, pips: { Ember: 2 } })).toBe(false);
    expect(canPayCost({ Tide: 3 }, { generic: 3, pips: {} })).toBe(true);
    expect(canPayCost({ Tide: 3 }, { generic: 4, pips: {} })).toBe(false);
    expect(canPayCost({ Ember: 1 }, { generic: 0, pips: { Ember: 1 } })).toBe(true);
    expect(canPayCost({}, undefined)).toBe(true);
  });

  test('invokeCard deducts pips then generic from the pool', () => {
    const s = game();
    const def = U('pipUnit', 1, 1, [], { cost: { generic: 1, pips: { Ember: 1 } } });
    const iid = toHand(s, 'P1', def);
    s.players.P1.essence = { Ember: 1, Tide: 1 };
    expect(invokeCard(s, 'P1', iid)).toBe(true);
    expect(essenceTotal(s.players.P1.essence)).toBe(0);
    expect(s.players.P1.field.some((u) => u.def.id === 'pipUnit')).toBe(true);
  });

  test('invokeCard refuses when pips cannot be matched despite enough total', () => {
    const s = game();
    const def = U('pipUnit2', 1, 1, [], { cost: { generic: 0, pips: { Ember: 2 } } });
    const iid = toHand(s, 'P1', def);
    s.players.P1.essence = { Tide: 5 };
    expect(canInvoke(s, 'P1', iid)).toBe(false);
    expect(invokeCard(s, 'P1', iid)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Wellsprings & locations
// ---------------------------------------------------------------------------
describe('wellsprings', () => {
  test('once per turn, and tapping produces matching essence', () => {
    const s = game();
    expect(playWellspring(s, 'P1', 'Ember')).toBe(true);
    expect(playWellspring(s, 'P1', 'Ember')).toBe(false); // once/turn
    const loc = s.players.P1.locations[0];
    expect(tapLocationForEssence(s, 'P1', loc.iid)).toBe(true);
    expect(s.players.P1.essence.Ember).toBe(1);
    expect(tapLocationForEssence(s, 'P1', loc.iid)).toBe(false); // exhausted
  });

  test('wellspring type restricted to leader identity', () => {
    const s = game({ leaderId: ABYSS_LEADER.id }); // Shadow/Void identity
    expect(playWellspring(s, 'P1', 'Ember')).toBe(false);
    expect(playWellspring(s, 'P1', 'Shadow')).toBe(true);
  });

  test('not the opponent, not outside a main phase', () => {
    const s = game();
    expect(playWellspring(s, 'P2', 'Ember')).toBe(false);
    endPhase(s); // -> Clash
    expect(playWellspring(s, 'P1', 'Ember')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Phase flow
// ---------------------------------------------------------------------------
describe('phase flow', () => {
  test('Main1 -> Clash -> Main2 -> pass turn (Dawn deals 1); essence empties per phase', () => {
    const s = game({ deck: ['vanilla', 'vanilla', 'vanilla'] });
    expect(s.phase).toBe('Main1');
    expect(s.active).toBe('P1');
    // First player skipped the turn-1 Deal.
    expect(s.players.P1.hand.length).toBe(0);
    playWellspring(s, 'P1', 'Ember');
    tapLocationForEssence(s, 'P1', s.players.P1.locations[0].iid);
    expect(essenceTotal(s.players.P1.essence)).toBe(1);
    expect(endPhase(s)).toBe(true);
    expect(s.phase).toBe('Clash');
    expect(essenceTotal(s.players.P1.essence)).toBe(0); // emptied at phase end
    expect(endPhase(s)).toBe(true);
    expect(s.phase).toBe('Main2');
    expect(endPhase(s)).toBe(true); // Dusk + pass
    expect(s.active).toBe('P2');
    expect(s.phase).toBe('Main1');
    expect(s.players.P2.hand.length).toBe(1); // P2 dealt at Dawn
  });

  test('dusk sheds down to MAX_HAND', () => {
    const s = game({ deck: ['vanilla'] });
    for (let i = 0; i < MAX_HAND + 3; i++) toHand(s, 'P1', VANILLA);
    endPhase(s);
    endPhase(s);
    endPhase(s); // Dusk
    expect(s.players.P1.hand.length).toBe(MAX_HAND);
    expect(s.players.P1.ashPile.length).toBe(3);
  });

  test('recover at dawn: exhausted units and locations untap', () => {
    const s = game({ deck: ['vanilla', 'vanilla'] });
    playWellspring(s, 'P2', 'Ember'); // illegal, ignore
    const u = summonUnit(s, 'P2', VANILLA, { exhausted: true });
    s.players.P2.locations.push({ iid: 'l1', produces: 'Ember', exhausted: true });
    endPhase(s);
    endPhase(s);
    endPhase(s); // P2's Dawn ran
    expect(u.exhausted).toBe(false);
    expect(s.players.P2.locations[0].exhausted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Timing windows
// ---------------------------------------------------------------------------
describe('timing', () => {
  test('Slow events only in own main phase; Quick/Ambush usable in the reaction window', () => {
    const s = game();
    const slow: CardDef = {
      id: 'slow_ev', name: 'slow', type: 'Event', subtype: 'Slow',
      cost: { generic: 0, pips: {} }, onInvoke: { action: 'draw', value: 0, target: 'none' },
    };
    const quick: CardDef = {
      id: 'quick_ev', name: 'quick', type: 'Event', subtype: 'Quick',
      cost: { generic: 0, pips: {} }, onInvoke: { action: 'damage', value: 1, target: 'anyTarget' },
    };
    const ambush = U('ambusher', 1, 1, ['Ambush']);
    const slowIid = toHand(s, 'P2', slow);
    const quickIid = toHand(s, 'P2', quick);
    const ambushIid = toHand(s, 'P2', ambush);
    // P1's main: P2 can invoke nothing.
    expect(canInvoke(s, 'P2', slowIid)).toBe(false);
    expect(canInvoke(s, 'P2', quickIid)).toBe(false);
    // Open the reaction window: P1 attacks, P2 declares guards.
    const atk = summonUnit(s, 'P1', U('atk', 2, 2));
    endPhase(s); // Clash
    expect(declareAttackers(s, [atk.iid])).toBe(true);
    expect(declareGuards(s, {})).toBe(true);
    expect(s.clash?.step).toBe('reaction');
    expect(canInvoke(s, 'P2', slowIid)).toBe(false);
    expect(canInvoke(s, 'P2', quickIid)).toBe(true);
    expect(invokeCard(s, 'P2', ambushIid)).toBe(true);
    expect(s.players.P2.field.some((u) => u.def.id === 'ambusher')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Clash
// ---------------------------------------------------------------------------
function clashSetup(): GameState {
  const s = game();
  endPhase(s); // -> Clash
  return s;
}

describe('clash', () => {
  test('exhausted / summoning-sick / Immobile units cannot attack; Reckless can', () => {
    const s = game();
    const ex = summonUnit(s, 'P1', VANILLA, { exhausted: true });
    const sick = summonUnit(s, 'P1', VANILLA, { sick: true });
    const imm = summonUnit(s, 'P1', U('imm', 3, 3, ['Immobile']));
    const reck = summonUnit(s, 'P1', U('reck', 2, 1, ['Reckless']), { sick: true });
    const ok = summonUnit(s, 'P1', VANILLA);
    endPhase(s);
    const legal = legalAttackers(s, 'P1').map((u) => u.iid);
    expect(legal).toContain(ok.iid);
    expect(legal).toContain(reck.iid);
    expect(legal).not.toContain(ex.iid);
    expect(legal).not.toContain(sick.iid);
    expect(legal).not.toContain(imm.iid);
  });

  test('attackers exhaust unless Alert', () => {
    const s = clashSetup();
    const a = summonUnit(s, 'P1', VANILLA);
    const b = summonUnit(s, 'P1', U('alert', 2, 2, ['Alert']));
    declareAttackers(s, [a.iid, b.iid]);
    expect(a.exhausted).toBe(true);
    expect(b.exhausted).toBe(false);
  });

  test('unguarded attackers hit the defender vitality', () => {
    const s = clashSetup();
    const a = summonUnit(s, 'P1', U('big', 4, 4));
    declareAttackers(s, [a.iid]);
    declareGuards(s, {});
    resolveClash(s);
    expect(s.players.P2.vitality).toBe(LEADER_HP - 4);
  });

  test('Aerial can only be guarded by Aerial or Skywatch', () => {
    const s = clashSetup();
    const a = summonUnit(s, 'P1', U('flyer', 2, 2, ['Aerial']));
    const ground = summonUnit(s, 'P2', VANILLA);
    const sky = summonUnit(s, 'P2', U('sky', 1, 4, ['Skywatch']));
    const air = summonUnit(s, 'P2', U('air', 1, 1, ['Aerial']));
    declareAttackers(s, [a.iid]);
    const legal = legalGuardsFor(s, a.iid).map((u) => u.iid);
    expect(legal).not.toContain(ground.iid);
    expect(legal).toContain(sky.iid);
    expect(legal).toContain(air.iid);
    expect(declareGuards(s, { [a.iid]: [ground.iid] })).toBe(false);
    expect(declareGuards(s, { [a.iid]: [sky.iid] })).toBe(true);
  });

  test('Swarmproof must be guarded by 2+ units or not at all', () => {
    const s = clashSetup();
    const a = summonUnit(s, 'P1', U('swarm', 3, 3, ['Swarmproof']));
    const g1 = summonUnit(s, 'P2', VANILLA);
    const g2 = summonUnit(s, 'P2', VANILLA);
    declareAttackers(s, [a.iid]);
    expect(declareGuards(s, { [a.iid]: [g1.iid] })).toBe(false);
    expect(declareGuards(s, { [a.iid]: [g1.iid, g2.iid] })).toBe(true);
  });

  test('Quickstrike kills the guard before taking damage back', () => {
    const s = clashSetup();
    const a = summonUnit(s, 'P1', U('qs', 2, 2, ['Quickstrike']));
    const g = summonUnit(s, 'P2', VANILLA); // 2/2
    declareAttackers(s, [a.iid]);
    declareGuards(s, { [a.iid]: [g.iid] });
    resolveClash(s);
    expect(findUnit(s, g.iid)).toBeUndefined();
    expect(findUnit(s, a.iid)?.damage).toBe(0);
  });

  test('Doublestrike deals first-strike AND normal damage', () => {
    const s = clashSetup();
    const a = summonUnit(s, 'P1', U('ds', 2, 5, ['Doublestrike']));
    const g = summonUnit(s, 'P2', U('wall', 3, 4)); // survives FS (2 < 4), dies to 2+2
    declareAttackers(s, [a.iid]);
    declareGuards(s, { [a.iid]: [g.iid] });
    resolveClash(s);
    expect(findUnit(s, g.iid)).toBeUndefined();
    expect(findUnit(s, a.iid)?.damage).toBe(3); // took the wall's normal hit
  });

  test('Venomous damage is lethal to units', () => {
    const s = clashSetup();
    const a = summonUnit(s, 'P1', U('venom', 1, 1, ['Venomous']));
    const g = summonUnit(s, 'P2', U('tank', 5, 8));
    declareAttackers(s, [a.iid]);
    declareGuards(s, { [a.iid]: [g.iid] });
    resolveClash(s);
    expect(findUnit(s, g.iid)).toBeUndefined(); // 1 damage, but lethal
    expect(findUnit(s, a.iid)).toBeUndefined(); // died to 5 might back
  });

  test('Siphon gains its controller vitality equal to damage dealt', () => {
    const s = clashSetup();
    const a = summonUnit(s, 'P1', U('drainer', 3, 3, ['Siphon']));
    declareAttackers(s, [a.iid]);
    declareGuards(s, {});
    resolveClash(s);
    expect(s.players.P2.vitality).toBe(LEADER_HP - 3);
    // Siphon gain is capped at starting Vitality (same cap as healing).
    expect(s.players.P1.vitality).toBe(LEADER_HP);
  });

  test('Siphon gain restores missing vitality up to the cap', () => {
    const s = clashSetup();
    s.players.P1.vitality = 15;
    const a = summonUnit(s, 'P1', U('drainer', 3, 3, ['Siphon']));
    declareAttackers(s, [a.iid]);
    declareGuards(s, {});
    resolveClash(s);
    expect(s.players.P1.vitality).toBe(18);
  });

  test('Overrun spills excess damage past dead guards to the defender', () => {
    const s = clashSetup();
    const a = summonUnit(s, 'P1', U('trampler', 5, 5, ['Overrun']));
    const g = summonUnit(s, 'P2', VANILLA); // 2/2
    declareAttackers(s, [a.iid]);
    declareGuards(s, { [a.iid]: [g.iid] });
    resolveClash(s);
    expect(findUnit(s, g.iid)).toBeUndefined();
    expect(s.players.P2.vitality).toBe(LEADER_HP - 3);
  });

  test('without Overrun, a guarded attacker deals no face damage', () => {
    const s = clashSetup();
    const a = summonUnit(s, 'P1', U('nontrampler', 5, 5));
    const g = summonUnit(s, 'P2', VANILLA);
    declareAttackers(s, [a.iid]);
    declareGuards(s, { [a.iid]: [g.iid] });
    resolveClash(s);
    expect(s.players.P2.vitality).toBe(LEADER_HP);
  });

  test('multiple guards on one attacker; damage assigned in order', () => {
    const s = clashSetup();
    const a = summonUnit(s, 'P1', U('mid', 3, 6));
    const g1 = summonUnit(s, 'P2', VANILLA); // 2/2 dies
    const g2 = summonUnit(s, 'P2', U('g2', 2, 3)); // takes 1
    declareAttackers(s, [a.iid]);
    declareGuards(s, { [a.iid]: [g1.iid, g2.iid] });
    resolveClash(s);
    expect(findUnit(s, g1.iid)).toBeUndefined();
    expect(findUnit(s, g2.iid)?.damage).toBe(1);
    expect(findUnit(s, a.iid)?.damage).toBe(4); // both guards hit back
  });

  test('Unbreakable survives lethal damage (damage stays marked) and cannot be shattered', () => {
    const s = clashSetup();
    const a = summonUnit(s, 'P1', U('smasher', 9, 9));
    const g = summonUnit(s, 'P2', U('unb', 2, 3, ['Unbreakable']));
    declareAttackers(s, [a.iid]);
    declareGuards(s, { [a.iid]: [g.iid] });
    resolveClash(s);
    expect(findUnit(s, g.iid)).toBeDefined();
    expect(findUnit(s, g.iid)!.damage).toBeGreaterThanOrEqual(3);
    applyEffect(s, 'P1', { action: 'shatter', target: 'enemyUnit' }, g.iid);
    expect(findUnit(s, g.iid)).toBeDefined(); // shatter-proof too
  });
});

// ---------------------------------------------------------------------------
// Warded
// ---------------------------------------------------------------------------
describe('Warded', () => {
  test('cannot be targeted by the opponent, but friendly targeting works', () => {
    const s = game();
    const w = summonUnit(s, 'P2', U('warded', 2, 2, ['Warded']));
    const dmg = { action: 'damage' as const, value: 3, target: 'enemyUnit' as const };
    expect(canTarget(s, 'P1', dmg, w.iid)).toBe(false);
    const ev: CardDef = {
      id: 'bolt', name: 'bolt', type: 'Event', subtype: 'Slow',
      cost: { generic: 0, pips: {} }, onInvoke: dmg,
    };
    const iid = toHand(s, 'P1', ev);
    expect(invokeCard(s, 'P1', iid, { targetIid: w.iid })).toBe(false);
    // Friendly buffs on your own Warded unit are fine.
    expect(canTarget(s, 'P2', { action: 'buff', value: 1, target: 'friendlyUnit' }, w.iid)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Leader
// ---------------------------------------------------------------------------
describe('leader', () => {
  test('invoke pays cost; ability once per turn; shatters at resolve 0', () => {
    const s = game();
    expect(invokeLeader(s, 'P1')).toBe(false); // can't pay
    s.players.P1.essence = { Ember: 1 };
    expect(invokeLeader(s, 'P1')).toBe(true);
    expect(s.players.P1.leader.invoked).toBe(true);
    expect(s.players.P1.leader.resolve).toBe(3);
    // -1 ability: 2 damage to the enemy player.
    expect(activateLeaderAbility(s, 'P1', 0, 'P2')).toBe(true);
    expect(s.players.P2.vitality).toBe(LEADER_HP - 2);
    expect(s.players.P1.leader.resolve).toBe(2);
    expect(activateLeaderAbility(s, 'P1', 1)).toBe(false); // once per turn
    // Burn resolve to 0 over following turns -> shattered.
    s.players.P1.leader.resolve = 1;
    s.players.P1.leader.abilityUsedThisTurn = false;
    expect(activateLeaderAbility(s, 'P1', 0, 'P2')).toBe(true);
    expect(s.players.P1.leader.shattered).toBe(true);
    expect(s.players.P1.leader.invoked).toBe(false);
    s.players.P1.leader.abilityUsedThisTurn = false;
    expect(activateLeaderAbility(s, 'P1', 0, 'P2')).toBe(false); // gone for good
    s.players.P1.essence = { Ember: 5 };
    expect(invokeLeader(s, 'P1')).toBe(false); // cannot re-invoke once shattered
  });
});

// ---------------------------------------------------------------------------
// Charms
// ---------------------------------------------------------------------------
const BOUND_CHARM: CardDef = {
  id: 'bound_charm', name: 'Bound Charm', type: 'Charm', subtype: 'Bound',
  cost: { generic: 0, pips: {} }, bond: { might: 1, grit: 2 },
};
const WORN_CHARM: CardDef = {
  id: 'worn_charm', name: 'Worn Charm', type: 'Charm', subtype: 'Worn',
  cost: { generic: 0, pips: {} }, rebondCost: 2, bond: { might: 2, grants: ['Quickstrike'] },
};

describe('charms', () => {
  test('bond applies stats and granted keywords', () => {
    const s = game();
    const u = summonUnit(s, 'P1', VANILLA);
    const b = toHand(s, 'P1', BOUND_CHARM);
    const w = toHand(s, 'P1', WORN_CHARM);
    expect(invokeCard(s, 'P1', b, { bondTargetIid: u.iid })).toBe(true);
    expect(invokeCard(s, 'P1', w, { bondTargetIid: u.iid })).toBe(true);
    expect(effMight(s, u)).toBe(2 + 1 + 2);
    expect(effGrit(s, u)).toBe(2 + 2);
    expect(effKeywords(u)).toContain('Quickstrike');
  });

  test('when the unit dies, Bound goes to ash; Worn stays and can re-bond', () => {
    const s = game();
    const u = summonUnit(s, 'P1', VANILLA);
    const b = toHand(s, 'P1', BOUND_CHARM);
    const w = toHand(s, 'P1', WORN_CHARM);
    invokeCard(s, 'P1', b, { bondTargetIid: u.iid });
    invokeCard(s, 'P1', w, { bondTargetIid: u.iid });
    applyEffect(s, 'P2', { action: 'damage', value: 99, target: 'enemyUnit' }, u.iid);
    expect(findUnit(s, u.iid)).toBeUndefined();
    expect(s.players.P1.ashPile.some((c) => c.def.id === 'bound_charm')).toBe(true);
    expect(s.players.P1.wornCharms.some((c) => c.def.id === 'worn_charm')).toBe(true);
    // Re-bond the Worn charm for its generic re-bond cost.
    const u2 = summonUnit(s, 'P1', VANILLA);
    const charmIid = s.players.P1.wornCharms[0].iid;
    expect(rebondCharm(s, 'P1', charmIid, u2.iid)).toBe(false); // can't pay
    s.players.P1.essence = { Tide: 2 };
    expect(rebondCharm(s, 'P1', charmIid, u2.iid)).toBe(true);
    expect(effMight(s, u2)).toBe(4);
    expect(s.players.P1.wornCharms.length).toBe(0);
  });

  test('charms need a friendly unit to bond', () => {
    const s = game();
    const b = toHand(s, 'P1', BOUND_CHARM);
    expect(canInvoke(s, 'P1', b)).toBe(false); // empty field
    const enemy = summonUnit(s, 'P2', VANILLA);
    summonUnit(s, 'P1', VANILLA);
    expect(invokeCard(s, 'P1', b, { bondTargetIid: enemy.iid })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Effects
// ---------------------------------------------------------------------------
describe('effects', () => {
  test('erode mills the opponent; recover readies a friendly unit; banish voids', () => {
    const s = game({ deck: ['vanilla', 'vanilla', 'vanilla'] });
    applyEffect(s, 'P1', { action: 'erode', value: 2, target: 'none' });
    expect(s.players.P2.deck.length).toBe(1);
    expect(s.players.P2.ashPile.length).toBe(2);
    const mine = summonUnit(s, 'P1', VANILLA, { exhausted: true });
    applyEffect(s, 'P1', { action: 'recover', target: 'friendlyUnit' }, mine.iid);
    expect(mine.exhausted).toBe(false);
    const foe = summonUnit(s, 'P2', VANILLA);
    applyEffect(s, 'P1', { action: 'banish', target: 'enemyUnit' }, foe.iid);
    expect(findUnit(s, foe.iid)).toBeUndefined();
    expect(s.players.P2.voidPile.some((c) => c.iid === foe.iid)).toBe(true);
  });

  test('heal removes marked damage and caps player vitality', () => {
    const s = game();
    const u = summonUnit(s, 'P1', U('tanky', 2, 5));
    u.damage = 3;
    applyEffect(s, 'P1', { action: 'heal', value: 2, target: 'friendlyUnit' }, u.iid);
    expect(u.damage).toBe(1);
    applyEffect(s, 'P1', { action: 'heal', value: 5, target: 'friendlyAny' }, 'P1');
    expect(s.players.P1.vitality).toBe(LEADER_HP);
  });
});

// ---------------------------------------------------------------------------
// Win conditions
// ---------------------------------------------------------------------------
describe('win conditions', () => {
  test('vitality <= 0 loses', () => {
    const s = game();
    applyEffect(s, 'P1', { action: 'damage', value: LEADER_HP, target: 'enemyPlayer' });
    expect(s.winner).toBe('P1');
  });

  test('dealing from an empty deck loses', () => {
    const s = game(); // both decks empty; P1 skipped the turn-1 Deal
    expect(s.winner).toBeNull();
    endPhase(s);
    endPhase(s);
    endPhase(s); // P2's Dawn: must Deal from empty deck
    expect(s.winner).toBe('P1');
  });
});
