/**
 * v6.9 content tests: the seven new per-Essence-Type keywords (Wildfire,
 * Tidecaller, Thriving, Nimble, Radiant, Withering, Entropic) and the two new
 * effect actions (exhaust, weaken).
 */
import { describe, expect, test } from 'vitest';
import { CardDef, LEADER_HP } from './cards';
import {
  DeckDef,
  GameState,
  applyEffect,
  createGame,
  declareAttackers,
  declareGuards,
  effGrit,
  effMight,
  endPhase,
  findUnit,
  legalGuardsFor,
  mulberry32,
  resolveClash,
  summonUnit,
} from './engine';
import { KEYWORDS, KEYWORD_COST, KEYWORD_TEXT, KEYWORD_TYPES } from './keywords';
import { NEW_KEYWORD_OF_COLOR, COLORS } from './colors';
import { POOL_V4 } from './cardpool';

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
  leaderAbilities: [],
};
const VANILLA = U('vanilla', 2, 2);
const POOL: Record<string, CardDef> = { [LEADER.id]: LEADER, [VANILLA.id]: VANILLA };

function game(deckSize = 20): GameState {
  const dd = (): DeckDef => ({ leaderId: LEADER.id, cards: Array(deckSize).fill(VANILLA.id) });
  return createGame(dd(), dd(), POOL, { rng: mulberry32(11), shuffle: false, handSize: 0 });
}

/** Hand the turn to the other player and land in their Main1. */
function passTurn(s: GameState): void {
  s.phase = 'Main2';
  endPhase(s);
}

// ---------------------------------------------------------------------------
describe('registry hygiene', () => {
  test('every new keyword has a type, rules text and a cost weight', () => {
    for (const kw of Object.values(NEW_KEYWORD_OF_COLOR)) {
      expect(KEYWORDS).toContain(kw);
      expect(KEYWORD_TYPES[kw as keyof typeof KEYWORD_TYPES]).toBe('Unit');
      expect(KEYWORD_TEXT[kw as keyof typeof KEYWORD_TEXT]).toBeTruthy();
      expect(typeof KEYWORD_COST[kw as keyof typeof KEYWORD_COST]).toBe('number');
    }
  });

  test('every Essence Type has exactly one new-generation keyword', () => {
    const assigned = COLORS.map((c) => NEW_KEYWORD_OF_COLOR[c]);
    expect(assigned).toHaveLength(COLORS.length);
    expect(new Set(assigned).size).toBe(COLORS.length);
  });

  test('the live pool actually prints every new keyword', () => {
    for (const kw of Object.values(NEW_KEYWORD_OF_COLOR)) {
      const carriers = POOL_V4.filter(
        (c) => c.keywords?.includes(kw) || c.bond?.grants?.includes(kw),
      );
      expect(carriers.length, `${kw} has no carrier in the pool`).toBeGreaterThan(0);
    }
  });

  test('the live pool actually prints both new effect actions', () => {
    const actions = new Set<string>();
    for (const c of POOL_V4) {
      if (c.onInvoke) actions.add(c.onInvoke.action);
      for (const t of c.triggers ?? []) actions.add(t.effect.action);
    }
    expect(actions).toContain('exhaust');
    expect(actions).toContain('weaken');
  });

  test('every printed card still has non-empty rules text for its effects', () => {
    for (const c of POOL_V4) {
      if (c.onInvoke || c.triggers?.length) {
        expect(c.text, `${c.id} printed an effect with no text`).toBeTruthy();
      }
    }
  });
});

// ---------------------------------------------------------------------------
describe('Ember — Wildfire', () => {
  test('deals 2 to the enemy player when it dies', () => {
    const s = game();
    const bomb = summonUnit(s, 'P1', U('bomb', 1, 1, ['Wildfire']));
    const before = s.players.P2.vitality;
    applyEffect(s, 'P2', { action: 'shatter', target: 'enemyUnit' }, bomb.iid);
    expect(findUnit(s, bomb.iid)).toBeUndefined();
    expect(s.players.P2.vitality).toBe(before - 2);
  });

  test('fires on banish as well as shatter', () => {
    const s = game();
    const bomb = summonUnit(s, 'P1', U('bomb2', 1, 1, ['Wildfire']));
    const before = s.players.P2.vitality;
    applyEffect(s, 'P2', { action: 'banish', target: 'enemyUnit' }, bomb.iid);
    expect(s.players.P2.vitality).toBe(before - 2);
  });

  test('a Charm-granted Wildfire still fires as the Charm comes off', () => {
    const s = game();
    const u = summonUnit(s, 'P1', U('bearer', 1, 1));
    u.charms.push({
      iid: 'c#1',
      def: { id: 'c', name: 'c', type: 'Charm', subtype: 'Bound', bond: { grants: ['Wildfire'] } },
    });
    const before = s.players.P2.vitality;
    applyEffect(s, 'P2', { action: 'shatter', target: 'enemyUnit' }, u.iid);
    expect(s.players.P2.vitality).toBe(before - 2);
  });
});

// ---------------------------------------------------------------------------
describe('Tide — Tidecaller', () => {
  test('Deals a card when it connects in a clash', () => {
    const s = game();
    const caller = summonUnit(s, 'P1', U('caller', 3, 3, ['Tidecaller']));
    s.phase = 'Clash';
    const before = s.players.P1.hand.length;
    declareAttackers(s, [caller.iid]);
    resolveClash(s);
    expect(s.players.P1.hand.length).toBe(before + 1);
  });

  test('does not Deal when it deals no damage', () => {
    const s = game();
    const caller = summonUnit(s, 'P1', U('caller0', 0, 3, ['Tidecaller']));
    s.phase = 'Clash';
    const before = s.players.P1.hand.length;
    declareAttackers(s, [caller.iid]);
    resolveClash(s);
    expect(s.players.P1.hand.length).toBe(before);
  });

  test('a Tidecaller guard that connects also Deals', () => {
    const s = game();
    const atk = summonUnit(s, 'P1', U('atk', 1, 9));
    const guard = summonUnit(s, 'P2', U('gcaller', 2, 5, ['Tidecaller']));
    s.phase = 'Clash';
    const before = s.players.P2.hand.length;
    declareAttackers(s, [atk.iid]);
    declareGuards(s, { [atk.iid]: [guard.iid] });
    resolveClash(s);
    expect(s.players.P2.hand.length).toBe(before + 1);
  });
});

// ---------------------------------------------------------------------------
describe('Root — Thriving', () => {
  test('grows by +1/+1 at each of its own Dawns', () => {
    const s = game();
    const tree = summonUnit(s, 'P1', U('tree', 1, 1, ['Thriving']));
    expect(effMight(s, tree)).toBe(1);
    passTurn(s); // P2's Dawn — must NOT grow
    expect(effMight(s, tree)).toBe(1);
    passTurn(s); // back to P1's Dawn
    expect(effMight(s, tree)).toBe(2);
    expect(effGrit(s, tree)).toBe(2);
  });
});

// ---------------------------------------------------------------------------
describe('Gale — Nimble', () => {
  test('cannot be guarded by an equal or bigger body', () => {
    const s = game();
    const nimble = summonUnit(s, 'P1', U('nimble', 3, 3, ['Nimble']));
    summonUnit(s, 'P2', U('equal', 3, 3));
    summonUnit(s, 'P2', U('bigger', 5, 5));
    s.phase = 'Clash';
    declareAttackers(s, [nimble.iid]);
    expect(legalGuardsFor(s, nimble.iid)).toHaveLength(0);
  });

  test('a smaller body can still catch it', () => {
    const s = game();
    const nimble = summonUnit(s, 'P1', U('nimble2', 3, 3, ['Nimble']));
    const small = summonUnit(s, 'P2', U('small', 2, 6));
    s.phase = 'Clash';
    declareAttackers(s, [nimble.iid]);
    expect(legalGuardsFor(s, nimble.iid).map((u) => u.iid)).toEqual([small.iid]);
    expect(declareGuards(s, { [nimble.iid]: [small.iid] })).toBe(true);
  });

  test('an illegal Nimble guard assignment is rejected outright', () => {
    const s = game();
    const nimble = summonUnit(s, 'P1', U('nimble3', 3, 3, ['Nimble']));
    const big = summonUnit(s, 'P2', U('big', 4, 4));
    s.phase = 'Clash';
    declareAttackers(s, [nimble.iid]);
    expect(declareGuards(s, { [nimble.iid]: [big.iid] })).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('Light — Radiant', () => {
  test('restores 1 Vitality at its own Dawn, capped at the starting total', () => {
    const s = game();
    s.players.P1.vitality = LEADER_HP - 3;
    summonUnit(s, 'P1', U('lamp', 1, 3, ['Radiant']));
    passTurn(s);
    passTurn(s); // P1's Dawn
    expect(s.players.P1.vitality).toBe(LEADER_HP - 2);
    s.players.P1.vitality = LEADER_HP;
    passTurn(s);
    passTurn(s);
    expect(s.players.P1.vitality).toBe(LEADER_HP);
  });
});

// ---------------------------------------------------------------------------
describe('Shadow — Withering', () => {
  test('permanently shrinks Grit on clash contact', () => {
    const s = game();
    const wither = summonUnit(s, 'P1', U('wither', 1, 9, ['Withering']));
    const target = summonUnit(s, 'P2', U('target', 0, 6));
    s.phase = 'Clash';
    declareAttackers(s, [wither.iid]);
    declareGuards(s, { [wither.iid]: [target.iid] });
    resolveClash(s);
    const alive = findUnit(s, target.iid);
    expect(alive).toBeDefined();
    expect(effGrit(s, alive!)).toBe(5); // 6 printed, -1 permanent
    expect(alive!.damage).toBe(1);
  });

  test('the shrink survives healing', () => {
    const s = game();
    const wither = summonUnit(s, 'P1', U('wither2', 1, 9, ['Withering']));
    const target = summonUnit(s, 'P2', U('target2', 0, 6));
    s.phase = 'Clash';
    declareAttackers(s, [wither.iid]);
    declareGuards(s, { [wither.iid]: [target.iid] });
    resolveClash(s);
    applyEffect(s, 'P2', { action: 'heal', value: 9, target: 'friendlyUnit' }, target.iid);
    const alive = findUnit(s, target.iid)!;
    expect(alive.damage).toBe(0);
    expect(effGrit(s, alive)).toBe(5);
  });
});

// ---------------------------------------------------------------------------
describe('Void — Entropic', () => {
  test('mills the opponent once per Entropic unit at Dusk', () => {
    const s = game(20);
    summonUnit(s, 'P1', U('rot1', 1, 1, ['Entropic']));
    summonUnit(s, 'P1', U('rot2', 1, 1, ['Entropic']));
    const before = s.players.P2.deck.length;
    passTurn(s);
    // 2 milled at P1's Dusk, then P2 Deals 1 for their own Dawn.
    expect(s.players.P2.deck.length).toBe(before - 3);
    expect(s.players.P2.ashPile.length).toBe(2);
  });

  test('milling an empty deck does not itself end the game', () => {
    const s = game(20);
    summonUnit(s, 'P1', U('rot3', 1, 1, ['Entropic']));
    s.players.P2.deck = [];
    s.phase = 'Main2';
    endPhase(s);
    // P2 loses on their DEAL from an empty deck, not on the erode itself.
    expect(s.winner).toBe('P1');
    expect(s.log.some((l) => l.includes('empty deck'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('new effect actions', () => {
  test('exhaust taps an enemy unit so it cannot guard', () => {
    const s = game();
    const a = summonUnit(s, 'P1', VANILLA);
    const g = summonUnit(s, 'P2', U('blocker', 2, 5));
    applyEffect(s, 'P1', { action: 'exhaust', target: 'enemyUnit' }, g.iid);
    expect(findUnit(s, g.iid)!.exhausted).toBe(true);
    s.phase = 'Clash';
    declareAttackers(s, [a.iid]);
    expect(legalGuardsFor(s, a.iid)).toHaveLength(0);
  });

  test('exhaust cannot be pointed at a friendly unit', () => {
    const s = game();
    const mine = summonUnit(s, 'P1', VANILLA);
    applyEffect(s, 'P1', { action: 'exhaust', target: 'enemyUnit' }, mine.iid);
    expect(mine.exhausted).toBe(false);
  });

  test('exhaust auto-targets the biggest READY enemy, not a tapped one', () => {
    const s = game();
    summonUnit(s, 'P2', U('bigtapped', 9, 9), { exhausted: true });
    const ready = summonUnit(s, 'P2', U('ready', 3, 3));
    applyEffect(s, 'P1', { action: 'exhaust', target: 'enemyUnit' });
    expect(findUnit(s, ready.iid)!.exhausted).toBe(true);
  });

  test('weaken permanently shrinks a unit and kills it at 0 Grit', () => {
    const s = game();
    const u = summonUnit(s, 'P2', U('shrink', 3, 3));
    applyEffect(s, 'P1', { action: 'weaken', value: 2, target: 'enemyUnit' }, u.iid);
    const alive = findUnit(s, u.iid)!;
    expect(effMight(s, alive)).toBe(1);
    expect(effGrit(s, alive)).toBe(1);
    applyEffect(s, 'P1', { action: 'weaken', value: 1, target: 'enemyUnit' }, u.iid);
    expect(findUnit(s, u.iid)).toBeUndefined();
  });

  test('weaken never drives derived stats below zero', () => {
    const s = game();
    const u = summonUnit(s, 'P2', U('tiny', 1, 8));
    applyEffect(s, 'P1', { action: 'weaken', value: 5, target: 'enemyUnit' }, u.iid);
    const alive = findUnit(s, u.iid)!;
    expect(effMight(s, alive)).toBe(0);
    expect(effGrit(s, alive)).toBe(3);
  });

  test('weaken is blocked by Warded and cannot hit your own board', () => {
    const s = game();
    const w = summonUnit(s, 'P2', U('warded', 3, 3, ['Warded']));
    const mine = summonUnit(s, 'P1', U('mine', 3, 3));
    applyEffect(s, 'P1', { action: 'weaken', value: 2, target: 'enemyUnit' }, w.iid);
    expect(effMight(s, findUnit(s, w.iid)!)).toBe(3);
    applyEffect(s, 'P1', { action: 'weaken', value: 2, target: 'enemyUnit' }, mine.iid);
    expect(effMight(s, findUnit(s, mine.iid)!)).toBe(3);
  });
});
