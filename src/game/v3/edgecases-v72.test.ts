/**
 * v7.2 adversarial suite — hostile inputs aimed at the mechanics added most
 * recently (the v6.9 per-colour keywords and the `exhaust`/`weaken` effect
 * actions) plus the v7.2 Leader minus-ability override, none of which had a
 * dedicated edge-case suite. Same house rule as edgecases.test.ts: every test
 * here was written to BREAK something, and the ones that did are documented
 * with the fix they now guard.
 */
import { describe, expect, test } from 'vitest';
import { CardDef, LEADER_HP, MAX_HAND } from './cards';
import {
  DeckDef,
  GameState,
  activateLeaderAbility,
  applyEffect,
  canTarget,
  createGame,
  declareAttackers,
  declareGuards,
  effGrit,
  effMight,
  endPhase,
  findUnit,
  invokeLeader,
  legalGuardsFor,
  makeCardInst,
  mulberry32,
  remainingGrit,
  resolveClash,
  summonUnit,
} from './engine';
import { POOL_BY_ID } from './cardpool';

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
  resolve: 4,
  leaderAbilities: [
    {
      resolveDelta: -1,
      effect: { action: 'weaken', value: 2, target: 'enemyUnit' },
      text: '-1: -2/-2',
    },
    { resolveDelta: 1, effect: { action: 'exhaust', target: 'enemyUnit' }, text: '+1: exhaust' },
  ],
};
const POOL: Record<string, CardDef> = { [LEADER.id]: LEADER };

/** Both decks are stocked: `runDawn` Deals a card, so a game built on empty
 * decks ends the moment any test advances two turns, and every assertion
 * after that point silently no-ops (endPhase returns false once a winner
 * exists). Three of the tests below were originally written against empty
 * decks and "passed" for exactly that reason. */
function game(): GameState {
  const filler = Array.from({ length: 40 }, (_, i) => `pad${i}`);
  for (const id of filler) POOL[id] = U(id, 1, 1);
  const dd = (): DeckDef => ({ leaderId: LEADER.id, cards: filler });
  return createGame(dd(), dd(), POOL, { rng: mulberry32(11), shuffle: false, handSize: 0 });
}

/** Put a Leader on the field with full Resolve, bypassing the essence cost. */
function fieldLeader(state: GameState, pid: 'P1' | 'P2'): void {
  state.players[pid].essence = {
    Ember: 9,
    Tide: 9,
    Root: 9,
    Gale: 9,
    Light: 9,
    Shadow: 9,
    Void: 9,
  };
  invokeLeader(state, pid);
}

// ---------------------------------------------------------------------------
// weaken — the v6.9 action that can drive a stat NEGATIVE
// ---------------------------------------------------------------------------
describe('weaken', () => {
  test('shrinking a unit to 0 Grit kills it immediately, leaving no 0/0 zombie', () => {
    const s = game();
    const victim = summonUnit(s, 'P2', U('vic', 3, 2));
    applyEffect(s, 'P1', { action: 'weaken', value: 2, target: 'enemyUnit' }, victim.iid);
    expect(findUnit(s, victim.iid)).toBeUndefined();
  });

  test('overshooting past 0 does not produce negative Might or Grit', () => {
    const s = game();
    const victim = summonUnit(s, 'P2', U('vic', 1, 9));
    applyEffect(s, 'P1', { action: 'weaken', value: 5, target: 'enemyUnit' }, victim.iid);
    const u = findUnit(s, victim.iid)!;
    expect(effMight(s, u)).toBe(0);
    expect(effGrit(s, u)).toBe(4);
    expect(remainingGrit(s, u)).toBe(4);
  });

  test('repeated weakens stack and eventually kill', () => {
    const s = game();
    const victim = summonUnit(s, 'P2', U('vic', 4, 5));
    for (let i = 0; i < 2; i++)
      applyEffect(s, 'P1', { action: 'weaken', value: 2, target: 'enemyUnit' }, victim.iid);
    expect(findUnit(s, victim.iid)!.permGrit).toBe(-4);
    applyEffect(s, 'P1', { action: 'weaken', value: 1, target: 'enemyUnit' }, victim.iid);
    expect(findUnit(s, victim.iid)).toBeUndefined();
  });

  test('a weaken already at lethal damage does not double-remove', () => {
    const s = game();
    const victim = summonUnit(s, 'P2', U('vic', 3, 4));
    victim.damage = 2;
    applyEffect(s, 'P1', { action: 'weaken', value: 2, target: 'enemyUnit' }, victim.iid);
    expect(findUnit(s, victim.iid)).toBeUndefined();
    expect(s.players.P2.field).toHaveLength(0);
    expect(s.players.P2.ashPile.filter((c) => c.def.id === 'vic')).toHaveLength(1);
  });

  test('weaken cannot be pointed at a Warded enemy', () => {
    const s = game();
    const warded = summonUnit(s, 'P2', U('ward', 4, 4, ['Warded']));
    expect(
      canTarget(s, 'P1', { action: 'weaken', value: 2, target: 'enemyUnit' }, warded.iid),
    ).toBe(false);
    applyEffect(s, 'P1', { action: 'weaken', value: 2, target: 'enemyUnit' }, warded.iid);
    expect(findUnit(s, warded.iid)!.permGrit).toBe(0);
  });

  test('weaken never touches a friendly unit, even if aimed at one', () => {
    const s = game();
    const mine = summonUnit(s, 'P1', U('mine', 3, 3));
    applyEffect(s, 'P1', { action: 'weaken', value: 2, target: 'enemyUnit' }, mine.iid);
    expect(findUnit(s, mine.iid)!.permGrit).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// exhaust
// ---------------------------------------------------------------------------
describe('exhaust', () => {
  test('an exhausted unit cannot be declared as a guard', () => {
    const s = game();
    const attacker = summonUnit(s, 'P1', U('atk', 3, 3));
    const guard = summonUnit(s, 'P2', U('grd', 3, 3));
    applyEffect(s, 'P1', { action: 'exhaust', target: 'enemyUnit' }, guard.iid);
    s.phase = 'Clash';
    expect(declareAttackers(s, [attacker.iid])).toBe(true);
    expect(legalGuardsFor(s, attacker.iid).map((g) => g.iid)).not.toContain(guard.iid);
    expect(declareGuards(s, { [attacker.iid]: [guard.iid] })).toBe(false);
  });

  test('exhausting an already-exhausted unit is a harmless no-op', () => {
    const s = game();
    const victim = summonUnit(s, 'P2', U('vic', 3, 3));
    victim.exhausted = true;
    applyEffect(s, 'P1', { action: 'exhaust', target: 'enemyUnit' }, victim.iid);
    expect(findUnit(s, victim.iid)!.exhausted).toBe(true);
  });

  test('an exhausted unit recovers at ITS controller Dawn, not the exhauster', () => {
    const s = game();
    s.active = 'P1';
    const victim = summonUnit(s, 'P2', U('vic', 3, 3));
    applyEffect(s, 'P1', { action: 'exhaust', target: 'enemyUnit' }, victim.iid);
    s.phase = 'Main2';
    endPhase(s); // -> P2's Dawn
    expect(findUnit(s, victim.iid)!.exhausted).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// v6.9 per-colour keywords
// ---------------------------------------------------------------------------
describe('Nimble', () => {
  test('only a strictly smaller body can guard it', () => {
    const s = game();
    const nimble = summonUnit(s, 'P1', U('nim', 3, 3, ['Nimble']));
    const equal = summonUnit(s, 'P2', U('eq', 3, 3));
    const smaller = summonUnit(s, 'P2', U('sm', 2, 5));
    s.phase = 'Clash';
    declareAttackers(s, [nimble.iid]);
    const legal = legalGuardsFor(s, nimble.iid).map((g) => g.iid);
    expect(legal).toContain(smaller.iid);
    expect(legal).not.toContain(equal.iid);
  });

  test('weakening a Nimble attacker to 0 Might makes it unguardable', () => {
    // Not a defect — a documented consequence. `effMight` floors at 0 and the
    // rule is "strictly less Might", so nothing can ever be strictly smaller
    // than a 0-Might Nimble body. It also deals 0 damage, so the unguardable
    // attack is worth nothing; recorded here so a future change to the floor
    // has to confront it deliberately.
    const s = game();
    const nimble = summonUnit(s, 'P1', U('nim', 2, 6, ['Nimble']));
    summonUnit(s, 'P2', U('sm', 1, 1));
    applyEffect(s, 'P2', { action: 'weaken', value: 3, target: 'enemyUnit' }, nimble.iid);
    s.phase = 'Clash';
    declareAttackers(s, [nimble.iid]);
    expect(effMight(s, findUnit(s, nimble.iid)!)).toBe(0);
    expect(legalGuardsFor(s, nimble.iid)).toHaveLength(0);
    const before = s.players.P2.vitality;
    resolveClash(s);
    expect(s.players.P2.vitality).toBe(before);
  });
});

describe('Thriving', () => {
  test('grows only at its OWN controller Dawn', () => {
    const s = game();
    s.active = 'P1';
    const tree = summonUnit(s, 'P1', U('tree', 1, 1, ['Thriving']));
    s.phase = 'Main2';
    endPhase(s); // P2's Dawn — must not grow
    expect(findUnit(s, tree.iid)!.permMight).toBe(0);
    s.phase = 'Main2';
    endPhase(s); // P1's Dawn
    expect(findUnit(s, tree.iid)!.permMight).toBe(1);
  });

  test('growth outruns a same-size weaken, so the two do not deadlock', () => {
    const s = game();
    s.active = 'P1';
    const tree = summonUnit(s, 'P1', U('tree', 2, 2, ['Thriving']));
    applyEffect(s, 'P2', { action: 'weaken', value: 1, target: 'enemyUnit' }, tree.iid);
    expect(findUnit(s, tree.iid)!.permGrit).toBe(-1);
    s.phase = 'Main2';
    endPhase(s);
    s.phase = 'Main2';
    endPhase(s); // back to P1's Dawn
    expect(findUnit(s, tree.iid)!.permGrit).toBe(0);
  });
});

describe('Radiant and Withering', () => {
  test('Radiant never heals above the starting Vitality cap', () => {
    const s = game();
    s.active = 'P1';
    s.players.P1.vitality = LEADER_HP;
    summonUnit(s, 'P1', U('sun', 1, 1, ['Radiant']));
    s.phase = 'Main2';
    endPhase(s);
    s.phase = 'Main2';
    endPhase(s);
    expect(s.players.P1.vitality).toBe(LEADER_HP);
  });

  test('Withering Grit loss survives a Regenerate heal', () => {
    const s = game();
    s.active = 'P1';
    const wither = summonUnit(s, 'P1', U('wth', 1, 4, ['Withering']));
    const victim = summonUnit(s, 'P2', U('vic', 0, 6, ['Regenerate']));
    s.phase = 'Clash';
    declareAttackers(s, [wither.iid]);
    declareGuards(s, { [wither.iid]: [victim.iid] });
    resolveClash(s);
    const v = findUnit(s, victim.iid)!;
    expect(v.permGrit).toBe(-1);
    s.phase = 'Main2';
    endPhase(s); // P2's Dawn: Regenerate clears marked damage only
    const after = findUnit(s, victim.iid)!;
    expect(after.damage).toBe(0);
    expect(effGrit(s, after)).toBe(5);
  });

  test('Withering cannot shrink a unit whose damage was fully absorbed by Hardened', () => {
    const s = game();
    const wither = summonUnit(s, 'P1', U('wth', 1, 4, ['Withering']));
    const armored = summonUnit(s, 'P2', U('arm', 0, 6, ['Hardened']));
    s.phase = 'Clash';
    declareAttackers(s, [wither.iid]);
    declareGuards(s, { [wither.iid]: [armored.iid] });
    resolveClash(s);
    // Hardened reduced the 1 damage to 0 and returned early, so no Grit was
    // eroded either — shrinking a body a hit never touched would be free value.
    expect(findUnit(s, armored.iid)!.permGrit).toBe(0);
  });
});

describe('Tidecaller', () => {
  test('connecting with a full hand overdraws, then sheds back down at Dusk', () => {
    // Deliberately asserts the rulebook order rather than a hand cap at draw
    // time: Tidecaller CAN take the hand past MAX_HAND mid-clash (§ "Shed to
    // MAX_HAND" happens at Dusk), and the excess must actually come off at
    // Dusk rather than persisting into the next turn.
    const s = game();
    s.active = 'P1';
    const tide = summonUnit(s, 'P1', U('tide', 3, 3, ['Tidecaller']));
    for (let i = 0; i < MAX_HAND; i++) s.players.P1.hand.push(makeCardInst(U(`h${i}`, 1, 1)));
    s.phase = 'Clash';
    declareAttackers(s, [tide.iid]);
    resolveClash(s);
    expect(s.players.P1.hand.length).toBe(MAX_HAND + 1);
    s.phase = 'Main2';
    endPhase(s);
    expect(s.players.P1.hand.length).toBe(MAX_HAND);
  });

  test('a Tidecaller that deals no damage does not draw', () => {
    const s = game();
    const tide = summonUnit(s, 'P1', U('tide', 0, 3, ['Tidecaller']));
    s.players.P1.deck.push(makeCardInst(U('spare', 1, 1)));
    const before = s.players.P1.hand.length;
    s.phase = 'Clash';
    declareAttackers(s, [tide.iid]);
    resolveClash(s);
    expect(s.players.P1.hand.length).toBe(before);
  });
});

// ---------------------------------------------------------------------------
// v7.2 Leader minus-ability override
// ---------------------------------------------------------------------------
describe('v7.2 Leader kits', () => {
  test('every overridden Leader still prints exactly two abilities, and both are usable', () => {
    for (const id of ['apex_nanite_shinobi', 'ethereal_sea_witch', 'ruinwalker_overseer']) {
      const def = POOL_BY_ID[id];
      expect(def, id).toBeDefined();
      expect(def.type).toBe('Leader');
      expect(def.leaderAbilities).toHaveLength(2);
      const [minus, plus] = def.leaderAbilities!;
      expect(minus.resolveDelta, `${id} minus`).toBeLessThan(0);
      expect(plus.resolveDelta, `${id} plus`).toBeGreaterThan(0);
      // The printed text must agree with the Resolve cost actually charged —
      // LEADER_MINUS_RESOLVE_OVERRIDE rewrites the text by string replacement,
      // so a mismatch here means a Leader advertises a price it doesn't charge.
      expect(minus.text?.startsWith(`${minus.resolveDelta}:`), `${id} text "${minus.text}"`).toBe(
        true,
      );
      expect(def.resolve!).toBeGreaterThanOrEqual(Math.abs(minus.resolveDelta));
    }
  });

  test('exactly one Leader kit still has no answer to the enemy board', () => {
    // `mapLeader` takes the minus ability from identity[0] and the plus from
    // identity[1], and neither is rolled — they are the literal array order in
    // LEADER_COLORS. A Leader whose pair happens to be written
    // "non-interactive colour first" therefore gets a kit that cannot touch
    // the enemy board at all. v7.2 fixed the three such Leaders that were
    // below baseline in both cohorts.
    //
    // Mer-King is the fourth, and it is deliberately LEFT alone: it has the
    // same fully non-interactive kit ('-1: Deal a card' + '+1: Restore 2
    // Vitality' — byte-identical to Ethereal Sea Witch's pre-v6.9 kit) and it
    // sits at 46.8% / 48.8%, dead centre of the spread. So a kit with no
    // answer is NOT sufficient on its own to sink a Leader, and this test
    // pins that counter-example down so the next pass cannot quietly
    // "fix" Mer-King on a theory the data does not support.
    const interactive = new Set(['damage', 'shatter', 'banish', 'weaken', 'exhaust', 'erode']);
    const leaders = Object.values(POOL_BY_ID).filter((d) => d.type === 'Leader');
    // 9 since v7.3, when Void Mother was reassigned Unit -> Leader. Its
    // LEADER_COLORS pair is written ['Void', 'Shadow'], so its minus half is
    // Void's Banish and it is interactive by construction.
    expect(leaders.length).toBe(9);
    const noAnswer = leaders
      .filter((l) => !(l.leaderAbilities ?? []).some((a) => interactive.has(a.effect.action)))
      .map((l) => l.id);
    expect(noAnswer).toEqual(['mer_king']);
  });

  test('a Leader ability cannot be activated below zero Resolve', () => {
    const s = game();
    fieldLeader(s, 'P1');
    const victim = summonUnit(s, 'P2', U('vic', 9, 9));
    s.players.P1.leader.resolve = 0;
    expect(activateLeaderAbility(s, 'P1', 0, victim.iid)).toBe(false);
    expect(findUnit(s, victim.iid)!.permGrit).toBe(0);
  });

  test('a Leader ability is once per turn even when it would be affordable twice', () => {
    const s = game();
    s.active = 'P1';
    s.phase = 'Main1';
    fieldLeader(s, 'P1');
    const a = summonUnit(s, 'P2', U('a', 9, 9));
    const b = summonUnit(s, 'P2', U('b', 9, 9));
    expect(activateLeaderAbility(s, 'P1', 0, a.iid)).toBe(true);
    expect(activateLeaderAbility(s, 'P1', 0, b.iid)).toBe(false);
    expect(findUnit(s, b.iid)!.permGrit).toBe(0);
  });
});
