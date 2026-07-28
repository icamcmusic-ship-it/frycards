/**
 * v7.4 content tests: the six keywords the roadmap carried unimplemented
 * since v4.x (Fate, Freeze-Dry, Blessed, Scorched-Earth, Glaciate, Exhume).
 *
 * They arrived as a bare name list with no definitions anywhere in the repo's
 * history, so each was designed against a gap the live pool actually had:
 * ash-pile recursion, ash-pile denial, a damage shield on a unit, tempo denial
 * that outlasts a Dawn, a death trigger aimed at the board, and card
 * selection. This suite pins each one to the engine hook it resolves through.
 */
import { describe, expect, test } from 'vitest';
import { CardDef } from './cards';
import {
  DeckDef,
  GameState,
  PlayerId,
  applyEffect,
  createGame,
  endPhase,
  findUnit,
  invokeCard,
  makeCardInst,
  mulberry32,
  summonUnit,
} from './engine';

const LEADER: CardDef = {
  id: 'test_leader',
  name: 'Test Leader',
  type: 'Leader',
  cost: { generic: 0, pips: {} },
  resolve: 3,
  leaderAbilities: [],
};

const U = (id: string, might = 2, grit = 2, keywords: string[] = []): CardDef => ({
  id,
  name: id,
  type: 'Unit',
  cost: { generic: 0, pips: {} },
  might,
  grit,
  keywords,
});

const FILLER = U('filler');
const POOL: Record<string, CardDef> = { [LEADER.id]: LEADER, [FILLER.id]: FILLER };

/** Decks are stocked deliberately: an empty deck ends the game on the first
 * Dawn Deal, which silently freezes the phase machine and makes any test that
 * cycles turns assert against a finished game. */
function game(): GameState {
  const dd = (): DeckDef => ({ leaderId: LEADER.id, cards: Array(40).fill(FILLER.id) });
  return createGame(dd(), dd(), POOL, { rng: mulberry32(11), shuffle: false, handSize: 0 });
}

function toHand(s: GameState, pid: PlayerId, def: CardDef): string {
  const inst = makeCardInst(def);
  s.players[pid].hand.push(inst);
  return inst.iid;
}

function placeSanctum(s: GameState, pid: PlayerId, keywords: string[]): void {
  s.players[pid].locations.push({
    iid: `loc_${pid}_${keywords.join('_')}`,
    def: { id: 'sanc', name: 'Sanctum', type: 'Location', subtype: 'Sanctum', keywords },
    produces: 'Ember',
    exhausted: false,
  });
}

/** Round the turn back to `pid`'s own next Dawn. */
function toNextDawn(s: GameState): void {
  s.phase = 'Main2';
  endPhase(s);
  s.phase = 'Main2';
  endPhase(s);
}

describe('Exhume — ash-pile recursion', () => {
  test('returns the costliest Unit from the ash-pile on entering', () => {
    const s = game();
    const cheap = { ...U('cheap'), cost: { generic: 1, pips: {} } };
    const dear = { ...U('dear'), cost: { generic: 5, pips: {} } };
    s.players.P1.ashPile.push(makeCardInst(cheap), makeCardInst(dear));
    invokeCard(s, 'P1', toHand(s, 'P1', U('digger', 1, 1, ['Exhume'])));
    expect(s.players.P1.hand.map((c) => c.def.id)).toEqual(['dear']);
    expect(s.players.P1.ashPile.map((c) => c.def.id)).toEqual(['cheap']);
  });

  test('only Units come back, and an ash-pile with none is a no-op', () => {
    const s = game();
    s.players.P1.ashPile.push(
      makeCardInst({ id: 'ev', name: 'ev', type: 'Event', cost: { generic: 3, pips: {} } }),
    );
    invokeCard(s, 'P1', toHand(s, 'P1', U('digger', 1, 1, ['Exhume'])));
    expect(s.players.P1.hand).toHaveLength(0);
    expect(s.players.P1.ashPile).toHaveLength(1);
  });

  test('it never reaches across to the opponent ash-pile', () => {
    const s = game();
    s.players.P2.ashPile.push(makeCardInst(U('theirs')));
    invokeCard(s, 'P1', toHand(s, 'P1', U('digger', 1, 1, ['Exhume'])));
    expect(s.players.P1.hand).toHaveLength(0);
    expect(s.players.P2.ashPile).toHaveLength(1);
  });
});

describe('Freeze-Dry — ash-pile denial', () => {
  test('an enemy Sanctum sends your dead units to the Void, not your ash-pile', () => {
    const s = game();
    placeSanctum(s, 'P2', ['Freeze-Dry']);
    const u = summonUnit(s, 'P1', U('doomed'));
    applyEffect(s, 'P2', { action: 'shatter', value: 0, target: 'enemyUnit' }, u.iid);
    expect(s.players.P1.ashPile).toHaveLength(0);
    expect(s.players.P1.voidPile.map((c) => c.def.id)).toEqual(['doomed']);
  });

  test('it does not redirect its OWN controller units', () => {
    const s = game();
    placeSanctum(s, 'P2', ['Freeze-Dry']);
    const mine = summonUnit(s, 'P2', U('mine'));
    applyEffect(s, 'P1', { action: 'shatter', value: 0, target: 'enemyUnit' }, mine.iid);
    expect(s.players.P2.ashPile.map((c) => c.def.id)).toEqual(['mine']);
    expect(s.players.P2.voidPile).toHaveLength(0);
  });

  test('it turns off Exhume, which is the point of printing it', () => {
    const s = game();
    placeSanctum(s, 'P2', ['Freeze-Dry']);
    const u = summonUnit(s, 'P1', U('food'));
    applyEffect(s, 'P2', { action: 'shatter', value: 0, target: 'enemyUnit' }, u.iid);
    invokeCard(s, 'P1', toHand(s, 'P1', U('digger', 1, 1, ['Exhume'])));
    expect(s.players.P1.hand).toHaveLength(0);
  });
});

describe('Blessed — a damage shield on a unit', () => {
  const CHARM = (): CardDef => ({
    id: 'ward',
    name: 'Ward',
    type: 'Charm',
    subtype: 'Bound',
    cost: { generic: 0, pips: {} },
    keywords: ['Blessed'],
  });

  test('prevents the first damage each turn and only the first', () => {
    const s = game();
    const u = summonUnit(s, 'P1', U('saint', 1, 5));
    u.charms.push({ iid: 'c1', def: CHARM() });
    applyEffect(s, 'P2', { action: 'damage', value: 3, target: 'enemyUnit' }, u.iid);
    expect(u.damage).toBe(0);
    applyEffect(s, 'P2', { action: 'damage', value: 3, target: 'enemyUnit' }, u.iid);
    expect(u.damage).toBe(3);
  });

  test('the shield comes back at the next Dawn', () => {
    const s = game();
    const u = summonUnit(s, 'P1', U('saint', 1, 9));
    u.charms.push({ iid: 'c1', def: CHARM() });
    applyEffect(s, 'P2', { action: 'damage', value: 2, target: 'enemyUnit' }, u.iid);
    applyEffect(s, 'P2', { action: 'damage', value: 2, target: 'enemyUnit' }, u.iid);
    expect(u.damage).toBe(2);
    toNextDawn(s);
    const live = findUnit(s, u.iid)!;
    applyEffect(s, 'P2', { action: 'damage', value: 2, target: 'enemyUnit' }, live.iid);
    expect(live.damage).toBe(2); // prevented again
  });

  test('it blanks a removal spell outright rather than shaving it', () => {
    const s = game();
    const u = summonUnit(s, 'P1', U('saint', 1, 2));
    u.charms.push({ iid: 'c1', def: CHARM() });
    applyEffect(s, 'P2', { action: 'damage', value: 9, target: 'enemyUnit' }, u.iid);
    expect(findUnit(s, u.iid)).toBeDefined();
    expect(u.damage).toBe(0);
  });
});

describe('Scorched-Earth — a death trigger aimed at the board', () => {
  test('damages every enemy unit when it leaves the field', () => {
    const s = game();
    const bomb = summonUnit(s, 'P1', U('bomb', 1, 1, ['Scorched-Earth']));
    const a = summonUnit(s, 'P2', U('a', 1, 1));
    const b = summonUnit(s, 'P2', U('b', 3, 3));
    applyEffect(s, 'P2', { action: 'shatter', value: 0, target: 'enemyUnit' }, bomb.iid);
    expect(findUnit(s, a.iid)).toBeUndefined(); // 1 grit, dies to the sweep
    expect(findUnit(s, b.iid)?.damage).toBe(1);
  });

  test('it never touches its own controller board', () => {
    const s = game();
    const bomb = summonUnit(s, 'P1', U('bomb', 1, 1, ['Scorched-Earth']));
    const friend = summonUnit(s, 'P1', U('friend', 1, 1));
    applyEffect(s, 'P2', { action: 'shatter', value: 0, target: 'enemyUnit' }, bomb.iid);
    expect(findUnit(s, friend.iid)).toBeDefined();
    expect(findUnit(s, friend.iid)?.damage).toBe(0);
  });

  test('it fires on banish too, the same as Wildfire and dies triggers', () => {
    const s = game();
    const bomb = summonUnit(s, 'P1', U('bomb', 1, 1, ['Scorched-Earth']));
    const enemy = summonUnit(s, 'P2', U('enemy', 3, 3));
    applyEffect(s, 'P2', { action: 'banish', value: 0, target: 'enemyUnit' }, bomb.iid);
    expect(findUnit(s, enemy.iid)?.damage).toBe(1);
  });
});

describe('Glaciate — tempo denial that outlasts a Dawn', () => {
  const FROST = (): CardDef => ({
    id: 'frost',
    name: 'Frost',
    type: 'Event',
    subtype: 'Quick',
    cost: { generic: 0, pips: {} },
    keywords: ['Glaciate'],
  });

  test('exhausts an enemy unit and holds it through their next Dawn', () => {
    const s = game();
    const victim = summonUnit(s, 'P2', U('victim', 3, 3));
    invokeCard(s, 'P1', toHand(s, 'P1', FROST()));
    expect(victim.exhausted).toBe(true);
    expect(victim.frozen).toBe(true);

    endPhase(s); // Clash
    endPhase(s); // Main2
    endPhase(s); // Dusk -> P2's Dawn, which it must NOT recover on
    expect(findUnit(s, victim.iid)?.exhausted).toBe(true);
    expect(findUnit(s, victim.iid)?.frozen).toBe(false);
  });

  test('it thaws, so the Dawn after that recovers normally', () => {
    const s = game();
    const victim = summonUnit(s, 'P2', U('victim', 3, 3));
    invokeCard(s, 'P1', toHand(s, 'P1', FROST()));
    endPhase(s);
    endPhase(s);
    endPhase(s); // P2's frozen Dawn
    s.phase = 'Main2';
    endPhase(s); // P2's Dusk -> P1
    s.phase = 'Main2';
    endPhase(s); // P1's Dusk -> P2's next Dawn
    expect(findUnit(s, victim.iid)?.exhausted).toBe(false);
  });

  test('an empty enemy board is a clean no-op', () => {
    const s = game();
    expect(invokeCard(s, 'P1', toHand(s, 'P1', FROST()))).toBe(true);
    expect(s.players.P1.ashPile).toHaveLength(1);
  });
});

describe('Fate — card selection', () => {
  const SEER = (): CardDef => ({
    id: 'seer',
    name: 'Seer',
    type: 'Event',
    subtype: 'Slow',
    cost: { generic: 0, pips: {} },
    keywords: ['Fate'],
  });

  test('deals a card, then bottoms the costliest card it cannot pay for', () => {
    const s = game();
    const cheap = { ...U('cheap'), cost: { generic: 1, pips: {} } };
    const dear = { ...U('dear'), cost: { generic: 6, pips: {} } };
    s.players.P1.deck.push(makeCardInst(cheap));
    toHand(s, 'P1', dear);
    // One Location: 'cheap' is payable, 'dear' is not.
    s.players.P1.locations.push({ iid: 'w1', produces: 'Ember', exhausted: false });
    invokeCard(s, 'P1', toHand(s, 'P1', SEER()));
    expect(s.players.P1.hand.map((c) => c.def.id)).toEqual(['cheap']);
    expect(s.players.P1.deck[0].def.id).toBe('dear');
  });

  test('it never bottoms a card the hand can actually pay for', () => {
    const s = game();
    const affordable = { ...U('affordable'), cost: { generic: 0, pips: {} } };
    toHand(s, 'P1', affordable);
    const before = s.players.P1.deck.length;
    invokeCard(s, 'P1', toHand(s, 'P1', SEER()));
    // Drew one and kept everything: nothing is castable-but-discarded.
    expect(s.players.P1.hand.map((c) => c.def.id).sort()).toEqual(['affordable', 'filler']);
    expect(s.players.P1.deck).toHaveLength(before - 1);
  });

  test('the bottomed card goes under the deck, not into the ash-pile', () => {
    const s = game();
    // Cost 5 with no Locations: unpayable, so Fate has something to bottom.
    s.players.P1.deck.push(makeCardInst({ ...U('top'), cost: { generic: 5, pips: {} } }));
    const before = s.players.P1.deck.length;
    invokeCard(s, 'P1', toHand(s, 'P1', SEER()));
    // Drew one off the top and put one back underneath: net zero, and the
    // card is at the BOTTOM (index 0 — dealCards pops from the end).
    expect(s.players.P1.deck).toHaveLength(before);
    expect(s.players.P1.deck[0].def.id).toBe('top');
    // Only the Event itself is in the ash-pile — nothing was discarded.
    expect(s.players.P1.ashPile.map((c) => c.def.id)).toEqual(['seer']);
  });
});
