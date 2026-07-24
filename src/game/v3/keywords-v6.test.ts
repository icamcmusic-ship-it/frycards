/**
 * v6.0 type-keyword engine tests: the two new keywords for every card type
 * (Unit Regenerate/Hardened, Event Surge/Resonant, Charm Runic/Soulbound,
 * Location Bountiful/Sacred, Leader Commander/Resolute) plus the rulebook
 * mulligan (draw one fewer each time).
 */
import { describe, expect, test } from 'vitest';
import { CardDef, LEADER_HP } from './cards';
import {
  DeckDef,
  GameState,
  createGame,
  effMight,
  effectiveCost,
  endPhase,
  invokeCard,
  invokeLeader,
  makeCardInst,
  mulberry32,
  mulliganHand,
  summonUnit,
  tapLocationForEssence,
  applyEffect,
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
  cost: { generic: 0, pips: {} },
  resolve: 3,
  leaderAbilities: [
    { resolveDelta: -1, effect: { action: 'damage', value: 2, target: 'anyTarget' }, text: '-1' },
    { resolveDelta: 1, effect: { action: 'draw', value: 1, target: 'none' }, text: '+1' },
  ],
};

const POOL: Record<string, CardDef> = { [LEADER.id]: LEADER };

function game(opts: { leader?: CardDef; deck?: string[] } = {}): GameState {
  const leader = opts.leader ?? LEADER;
  const pool = { ...POOL, [leader.id]: leader };
  const dd: DeckDef = { leaderId: leader.id, cards: opts.deck ?? [] };
  return createGame(dd, dd, pool, { rng: mulberry32(7), shuffle: false, handSize: 0 });
}

function toHand(state: GameState, pid: 'P1' | 'P2', def: CardDef): string {
  const inst = makeCardInst(def);
  state.players[pid].hand.push(inst);
  return inst.iid;
}

function stockDeck(state: GameState, pid: 'P1' | 'P2', n: number): void {
  for (let i = 0; i < n; i++) state.players[pid].deck.push(makeCardInst(U(`filler${i}`, 1, 1)));
}

// ---------------------------------------------------------------------------
describe('Unit — Regenerate / Hardened', () => {
  test('Regenerate heals all marked damage at its controller Dawn', () => {
    const s = game();
    stockDeck(s, 'P1', 5);
    stockDeck(s, 'P2', 5);
    const u = summonUnit(s, 'P2', U('troll', 2, 5, ['Regenerate']));
    u.damage = 3;
    // P1 Main1 -> ... -> P2's Dawn runs Regenerate for P2's units.
    endPhase(s); // Main1 -> Clash
    endPhase(s); // Clash -> Main2
    endPhase(s); // Main2 -> Dusk -> P2 Dawn
    expect(u.damage).toBe(0);
  });

  test('Hardened reduces each damage packet by 1 (and blocks 1-point venom)', () => {
    const s = game();
    const hard = summonUnit(s, 'P1', U('golem', 1, 4, ['Hardened']));
    applyEffect(s, 'P2', { action: 'damage', value: 3, target: 'enemyUnit' }, hard.iid);
    expect(hard.damage).toBe(2);
    applyEffect(s, 'P2', { action: 'damage', value: 1, target: 'enemyUnit' }, hard.iid);
    expect(hard.damage).toBe(2); // fully absorbed
  });
});

// ---------------------------------------------------------------------------
describe('Event — Surge / Resonant', () => {
  test('Surge costs 1 less once another card was invoked this turn', () => {
    const s = game();
    const surge: CardDef = {
      id: 'surge_bolt',
      name: 'Surge Bolt',
      type: 'Event',
      subtype: 'Slow',
      cost: { generic: 2, pips: {} },
      keywords: ['Surge'],
      onInvoke: { action: 'damage', value: 1, target: 'enemyPlayer' },
    };
    expect(effectiveCost(s, 'P1', surge)).toEqual({ generic: 2, pips: {} });
    const firstIid = toHand(s, 'P1', U('cheap', 1, 1));
    expect(invokeCard(s, 'P1', firstIid)).toBe(true);
    expect(effectiveCost(s, 'P1', surge)).toEqual({ generic: 1, pips: {} });
    const surgeIid = toHand(s, 'P1', surge);
    s.players.P1.essence = { Ember: 1 };
    expect(invokeCard(s, 'P1', surgeIid)).toBe(true); // paid the discounted 1
  });

  test('Resonant events resolve their effect twice', () => {
    const s = game();
    const res: CardDef = {
      id: 'echo_bolt',
      name: 'Echo Bolt',
      type: 'Event',
      subtype: 'Slow',
      cost: { generic: 0, pips: {} },
      keywords: ['Resonant'],
      onInvoke: { action: 'damage', value: 2, target: 'enemyPlayer' },
    };
    const iid = toHand(s, 'P1', res);
    expect(invokeCard(s, 'P1', iid)).toBe(true);
    expect(s.players.P2.vitality).toBe(LEADER_HP - 4);
  });
});

// ---------------------------------------------------------------------------
describe('Charm — Runic / Soulbound', () => {
  test('Runic deals a card when the charm bonds from hand', () => {
    const s = game();
    stockDeck(s, 'P1', 3);
    summonUnit(s, 'P1', U('bearer', 2, 2));
    const charm: CardDef = {
      id: 'rune_sigil',
      name: 'Rune Sigil',
      type: 'Charm',
      subtype: 'Bound',
      cost: { generic: 0, pips: {} },
      keywords: ['Runic'],
      bond: { might: 1 },
    };
    const iid = toHand(s, 'P1', charm);
    const handBefore = s.players.P1.hand.length;
    expect(invokeCard(s, 'P1', iid)).toBe(true);
    // -1 (charm left hand) +1 (Runic draw)
    expect(s.players.P1.hand.length).toBe(handBefore);
  });

  test('Soulbound charms return to hand when the bonded unit dies', () => {
    const s = game();
    const bearer = summonUnit(s, 'P1', U('bearer2', 2, 2));
    const charm: CardDef = {
      id: 'soul_locket',
      name: 'Soul Locket',
      type: 'Charm',
      subtype: 'Bound',
      cost: { generic: 0, pips: {} },
      keywords: ['Soulbound'],
      bond: { grit: 1 },
    };
    const iid = toHand(s, 'P1', charm);
    expect(invokeCard(s, 'P1', iid, { bondTargetIid: bearer.iid })).toBe(true);
    applyEffect(s, 'P2', { action: 'shatter', target: 'enemyUnit' }, bearer.iid);
    expect(s.players.P1.field.length).toBe(0);
    expect(s.players.P1.hand.some((c) => c.def.id === 'soul_locket')).toBe(true);
    expect(s.players.P1.ashPile.some((c) => c.def.id === 'soul_locket')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('Location — Bountiful / Sacred', () => {
  test('Bountiful Sanctums exhaust for 2 essence', () => {
    const s = game();
    const sanctum: CardDef = {
      id: 'rich_vein',
      name: 'Rich Vein',
      type: 'Location',
      subtype: 'Sanctum',
      cost: { generic: 0, pips: {} },
      keywords: ['Bountiful'],
      produces: 'Ember',
    };
    const iid = toHand(s, 'P1', sanctum);
    expect(invokeCard(s, 'P1', iid)).toBe(true);
    const loc = s.players.P1.locations.find((l) => l.def?.id === 'rich_vein')!;
    expect(tapLocationForEssence(s, 'P1', loc.iid)).toBe(true);
    expect(s.players.P1.essence.Ember).toBe(2);
  });

  test('Sacred Sanctums restore 1 Vitality at their controller Dawn', () => {
    const s = game();
    stockDeck(s, 'P1', 5);
    stockDeck(s, 'P2', 5);
    const sanctum: CardDef = {
      id: 'shrine',
      name: 'Shrine',
      type: 'Location',
      subtype: 'Sanctum',
      cost: { generic: 0, pips: {} },
      keywords: ['Sacred'],
      produces: 'Light',
    };
    const iid = toHand(s, 'P2', sanctum);
    s.players.P2.vitality = 15;
    // Get the sanctum onto P2's field during P2's own main phase.
    endPhase(s); // Main1 -> Clash
    endPhase(s); // Clash -> Main2
    endPhase(s); // -> P2's turn (Dawn ran with no sanctum yet, now Main1)
    expect(invokeCard(s, 'P2', iid)).toBe(true);
    endPhase(s);
    endPhase(s);
    endPhase(s); // -> P1's turn
    expect(s.players.P2.vitality).toBe(15);
    endPhase(s);
    endPhase(s);
    endPhase(s); // -> P2's Dawn fires Sacred
    expect(s.players.P2.vitality).toBe(16);
  });
});

// ---------------------------------------------------------------------------
describe('Leader — Commander / Resolute', () => {
  test('Commander gives friendly units +1 Might while the Leader is fielded', () => {
    const cmdLeader: CardDef = { ...LEADER, id: 'cmd_leader', keywords: ['Commander'] };
    const s = game({ leader: cmdLeader });
    const u = summonUnit(s, 'P1', U('grunt', 2, 2));
    expect(effMight(s, u)).toBe(2);
    expect(invokeLeader(s, 'P1')).toBe(true);
    expect(effMight(s, u)).toBe(3);
  });

  test('Resolute regrows 1 Resolve at Dawn, capped at the printed value', () => {
    const resLeader: CardDef = { ...LEADER, id: 'res_leader', keywords: ['Resolute'] };
    const s = game({ leader: resLeader });
    stockDeck(s, 'P1', 8);
    stockDeck(s, 'P2', 8);
    expect(invokeLeader(s, 'P1')).toBe(true);
    s.players.P1.leader.resolve = 1;
    // Full round back to P1's Dawn.
    endPhase(s);
    endPhase(s);
    endPhase(s); // P2's turn
    endPhase(s);
    endPhase(s);
    endPhase(s); // back to P1
    expect(s.players.P1.leader.resolve).toBe(2);
    s.players.P1.leader.resolve = 3; // at cap
    endPhase(s);
    endPhase(s);
    endPhase(s);
    endPhase(s);
    endPhase(s);
    endPhase(s);
    expect(s.players.P1.leader.resolve).toBe(3);
  });
});

// ---------------------------------------------------------------------------
describe('rulebook mulligan', () => {
  test('each mulligan draws one card fewer', () => {
    const s = game();
    stockDeck(s, 'P1', 10);
    for (let i = 0; i < 7; i++) s.players.P1.hand.push(s.players.P1.deck.pop()!);
    expect(s.players.P1.hand.length).toBe(7);
    expect(mulliganHand(s, 'P1')).toBe(true);
    expect(s.players.P1.hand.length).toBe(6);
    expect(mulliganHand(s, 'P1')).toBe(true);
    expect(s.players.P1.hand.length).toBe(5);
    // Deck + hand conservation.
    expect(s.players.P1.deck.length + s.players.P1.hand.length).toBe(10);
  });
});
