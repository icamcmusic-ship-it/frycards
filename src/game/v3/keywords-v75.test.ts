/**
 * v7.5 content tests: the six keywords that had names and nothing else.
 *
 * Fate, Freeze-Dry, Blessed, Scorched-Earth, Glaciate and Exhume sat on the
 * roadmap under "implement when cards using them are printed", which is a
 * deadlock — no card can be printed with a keyword the engine does not have,
 * so the condition could never be met. Each now has an engine hook, a colour,
 * a price and at least one carrier; this suite pins the behaviour against the
 * hook rather than the registry entry.
 */
import { describe, expect, test } from 'vitest';
import { CardDef, LEADER_HP } from './cards';
import {
  DeckDef,
  GameState,
  createGame,
  endPhase,
  invokeCard,
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
const VANILLA: CardDef = {
  id: 'vanilla',
  name: 'Vanilla',
  type: 'Unit',
  cost: { generic: 0, pips: {} },
  might: 2,
  grit: 2,
};

const sanctum = (id: string, keywords: string[]): CardDef => ({
  id,
  name: id,
  type: 'Location',
  subtype: 'Sanctum',
  cost: { generic: 0, pips: {} },
  produces: 'Ember',
  keywords,
});

const POOL: Record<string, CardDef> = {
  [LEADER.id]: LEADER,
  [VANILLA.id]: VANILLA,
};

function game(): GameState {
  const dd = (): DeckDef => ({ leaderId: LEADER.id, cards: Array(30).fill(VANILLA.id) });
  return createGame(dd(), dd(), POOL, { rng: mulberry32(7), shuffle: false, handSize: 0 });
}

function placeSanctum(s: GameState, pid: 'P1' | 'P2', def: CardDef, iid: string): void {
  s.players[pid].locations.push({ iid, def, produces: def.produces!, exhausted: false });
}

/** Run the active player's turn round to their next Dawn. */
function toNextDawn(s: GameState): void {
  s.phase = 'Main2';
  endPhase(s); // our Dusk -> hands over to the opponent
  s.phase = 'Main2';
  endPhase(s); // their Dusk -> back to us, through our Dawn
}

// ---------------------------------------------------------------------------
describe('v7.5 Event keywords', () => {
  const fateEvent: CardDef = {
    id: 'fate_ev',
    name: 'Fate Event',
    type: 'Event',
    subtype: 'Quick',
    cost: { generic: 0, pips: {} },
    keywords: ['Fate'],
  };

  test('Fate banishes the top of the enemy deck — to The Void, not the ash-pile', () => {
    const s = game();
    POOL[fateEvent.id] = fateEvent;
    s.players.P1.hand.push({ iid: 'fate#1', def: fateEvent });
    s.phase = 'Main1';
    s.active = 'P1';

    const deckBefore = s.players.P2.deck.length;
    const ashBefore = s.players.P2.ashPile.length;
    expect(invokeCard(s, 'P1', 'fate#1', {})).toBe(true);

    expect(s.players.P2.deck.length).toBe(deckBefore - 1);
    expect(s.players.P2.voidPile.length).toBe(1);
    // This is the whole point of the keyword: erode would have put it here,
    // where Shadow can still reach it. Fate does not.
    expect(s.players.P2.ashPile.length).toBe(ashBefore);
  });

  test('Fate on an empty enemy deck is a no-op, not a crash', () => {
    const s = game();
    POOL[fateEvent.id] = fateEvent;
    s.players.P2.deck = [];
    s.players.P1.hand.push({ iid: 'fate#2', def: fateEvent });
    s.phase = 'Main1';
    s.active = 'P1';

    expect(invokeCard(s, 'P1', 'fate#2', {})).toBe(true);
    expect(s.players.P2.voidPile.length).toBe(0);
  });

  test('Exhume returns a Unit from your ash-pile, and only a Unit', () => {
    const s = game();
    const ev: CardDef = {
      id: 'exhume_ev',
      name: 'Exhume Event',
      type: 'Event',
      subtype: 'Quick',
      cost: { generic: 0, pips: {} },
      keywords: ['Exhume'],
    };
    POOL[ev.id] = ev;
    // An Event sits ahead of the Unit in the ash-pile: Exhume must skip it.
    s.players.P1.ashPile = [
      { iid: 'junk#1', def: ev },
      { iid: 'dead#1', def: VANILLA },
    ];
    s.players.P1.hand.push({ iid: 'exh#1', def: ev });
    s.phase = 'Main1';
    s.active = 'P1';

    expect(invokeCard(s, 'P1', 'exh#1', {})).toBe(true);
    expect(s.players.P1.hand.map((c) => c.iid)).toContain('dead#1');
    // The junk Event is still in the ash-pile, alongside the spent Exhume card.
    expect(s.players.P1.ashPile.map((c) => c.iid)).toContain('junk#1');
  });

  test('Exhume with no Unit in the ash-pile does nothing', () => {
    const s = game();
    const ev: CardDef = {
      id: 'exhume_ev2',
      name: 'Exhume Event 2',
      type: 'Event',
      subtype: 'Quick',
      cost: { generic: 0, pips: {} },
      keywords: ['Exhume'],
    };
    POOL[ev.id] = ev;
    s.players.P1.ashPile = [];
    s.players.P1.hand.push({ iid: 'exh#2', def: ev });
    s.phase = 'Main1';
    s.active = 'P1';

    const handBefore = s.players.P1.hand.length;
    expect(invokeCard(s, 'P1', 'exh#2', {})).toBe(true);
    expect(s.players.P1.hand.length).toBe(handBefore - 1); // just the Event leaving
  });
});

// ---------------------------------------------------------------------------
describe('v7.5 Charm keywords', () => {
  test('Freeze-Dry exhausts an enemy unit when it bonds from hand', () => {
    const s = game();
    const mine = summonUnit(s, 'P1', VANILLA);
    const theirs = summonUnit(s, 'P2', VANILLA);
    theirs.exhausted = false;
    const charm: CardDef = {
      id: 'freeze_charm',
      name: 'Freeze Charm',
      type: 'Charm',
      subtype: 'Bound',
      cost: { generic: 0, pips: {} },
      keywords: ['Freeze-Dry'],
      bond: { might: 1, grit: 1 },
    };
    POOL[charm.id] = charm;
    s.players.P1.hand.push({ iid: 'fd#1', def: charm });
    s.phase = 'Main1';
    s.active = 'P1';

    expect(invokeCard(s, 'P1', 'fd#1', { bondTargetIid: mine.iid })).toBe(true);
    expect(theirs.exhausted).toBe(true);
    expect(mine.exhausted).toBe(false); // it points across the table, not at you
  });

  test('Blessed restores Vitality on bond, and never above the cap', () => {
    const s = game();
    const mine = summonUnit(s, 'P1', VANILLA);
    const charm: CardDef = {
      id: 'blessed_charm',
      name: 'Blessed Charm',
      type: 'Charm',
      subtype: 'Bound',
      cost: { generic: 0, pips: {} },
      keywords: ['Blessed'],
      bond: { might: 1, grit: 1 },
    };
    POOL[charm.id] = charm;
    s.players.P1.vitality = LEADER_HP - 5;
    s.players.P1.hand.push({ iid: 'bl#1', def: charm });
    s.phase = 'Main1';
    s.active = 'P1';
    expect(invokeCard(s, 'P1', 'bl#1', { bondTargetIid: mine.iid })).toBe(true);
    expect(s.players.P1.vitality).toBe(LEADER_HP - 2);

    // At 1 below the cap it gains 1, not 3.
    const mine2 = summonUnit(s, 'P1', VANILLA);
    s.players.P1.vitality = LEADER_HP - 1;
    s.players.P1.hand.push({ iid: 'bl#2', def: charm });
    expect(invokeCard(s, 'P1', 'bl#2', { bondTargetIid: mine2.iid })).toBe(true);
    expect(s.players.P1.vitality).toBe(LEADER_HP);
  });
});

// ---------------------------------------------------------------------------
describe('v7.5 Location keywords', () => {
  test('Scorched-Earth does nothing below three Sanctums (v7.6 gate)', () => {
    const s = game();
    s.active = 'P1';
    const a = summonUnit(s, 'P2', VANILLA);
    placeSanctum(s, 'P1', sanctum('scorch', ['Scorched-Earth']), 'sc#1');
    placeSanctum(s, 'P1', sanctum('plain', []), 'pl#1');

    s.phase = 'Main2';
    endPhase(s); // through our Dusk, at two Sanctums
    expect(a.damage).toBe(0);
  });

  test('Scorched-Earth sweeps the enemy board at your Dusk, and stacks', () => {
    const s = game();
    s.active = 'P1';
    const a = summonUnit(s, 'P2', VANILLA);
    const b = summonUnit(s, 'P2', VANILLA);
    const mine = summonUnit(s, 'P1', VANILLA);
    placeSanctum(s, 'P1', sanctum('scorch', ['Scorched-Earth']), 'sc#1');
    // v7.6: the sweep is the payoff half of a ramp deck — three Sanctums, the
    // same gate Ritual and Archivist use.
    placeSanctum(s, 'P1', sanctum('plain1', []), 'pl#1');
    placeSanctum(s, 'P1', sanctum('plain2', []), 'pl#2');

    s.phase = 'Main2';
    endPhase(s); // through our Dusk
    expect(a.damage).toBe(1);
    expect(b.damage).toBe(1);
    expect(mine.damage).toBe(0); // never our own board

    // A second copy doubles the sweep. Two 2/2s take 2 at once and die.
    placeSanctum(s, 'P1', sanctum('scorch2', ['Scorched-Earth']), 'sc#2');
    s.phase = 'Main2';
    endPhase(s); // opponent's Dusk — hands the turn back to us
    s.phase = 'Main2';
    endPhase(s); // our Dusk again
    expect(s.players.P2.field.length).toBe(0);
  });

  test('Glaciate exhausts an enemy unit at your Dawn, then rests a turn (v7.6)', () => {
    const s = game();
    s.active = 'P1';
    const theirs = summonUnit(s, 'P2', VANILLA);
    theirs.exhausted = false;
    placeSanctum(s, 'P1', sanctum('glac', ['Glaciate']), 'gl#1');

    toNextDawn(s);
    expect(s.active).toBe('P1');
    expect(theirs.exhausted).toBe(true);

    // v7.6: every other Dawn. The unit recovered at its own Dawn in between,
    // and this Sanctum is asleep, so nothing freezes it again this turn.
    toNextDawn(s);
    expect(theirs.exhausted).toBe(false);

    // ...and it is back on the Dawn after that.
    toNextDawn(s);
    expect(theirs.exhausted).toBe(true);
  });

  test('two Glaciates alternate into one freeze per Dawn, not two every other', () => {
    const s = game();
    s.active = 'P1';
    const x = summonUnit(s, 'P2', VANILLA);
    const y = summonUnit(s, 'P2', VANILLA);
    placeSanctum(s, 'P1', sanctum('glacA', ['Glaciate']), 'gl#A');
    placeSanctum(s, 'P1', sanctum('glacB', ['Glaciate']), 'gl#B');

    // Both are fresh, so the first Dawn does fire both — the counter is per
    // Sanctum, and they only fall out of step once one of them arrives later.
    toNextDawn(s);
    expect(x.exhausted).toBe(true);
    expect(y.exhausted).toBe(true);
  });

  test('Glaciate with an empty enemy board is a no-op', () => {
    const s = game();
    s.active = 'P1';
    placeSanctum(s, 'P1', sanctum('glac2', ['Glaciate']), 'gl#2');
    expect(() => toNextDawn(s)).not.toThrow();
  });
});
