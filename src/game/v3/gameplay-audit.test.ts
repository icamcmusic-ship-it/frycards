import { describe, expect, test } from 'vitest';
import type { CardDef } from './cards';
import {
  type DeckDef,
  type GameState,
  activateLeaderAbility,
  createGame,
  effMight,
  invokeCard,
  makeCardInst,
  mulberry32,
  settleStack,
  summonUnit,
  tapLocationForEssence,
} from './engine';

const FREE = { generic: 0, pips: {} };

const unit = (id: string, might = 2, grit = 3, keywords: string[] = []): CardDef => ({
  id,
  name: id,
  type: 'Unit',
  cost: FREE,
  might,
  grit,
  keywords,
});

const QUICK: CardDef = {
  id: 'quick-answer',
  name: 'Quick Answer',
  type: 'Event',
  subtype: 'Quick',
  cost: FREE,
  onInvoke: { action: 'damage', value: 1, target: 'enemyPlayer' },
};

const LEADER: CardDef = {
  id: 'audit-leader',
  name: 'Audit Leader',
  type: 'Leader',
  cost: FREE,
  resolve: 3,
  leaderAbilities: [
    {
      resolveDelta: -1,
      effect: { action: 'weaken', value: 1, target: 'enemyUnit' },
      text: '-1: Weaken a target enemy unit.',
    },
  ],
};

function game(): GameState {
  const filler = Array.from({ length: 40 }, (_, i) => unit(`filler-${i}`, 1, 1));
  const pool = Object.fromEntries([LEADER, QUICK, ...filler].map((def) => [def.id, def]));
  const deck = (): DeckDef => ({ leaderId: LEADER.id, cards: filler.map((def) => def.id) });
  const state = createGame(deck(), deck(), pool, {
    rng: mulberry32(20260906),
    shuffle: false,
    handSize: 0,
  });
  state.active = 'P1';
  state.phase = 'Main1';
  return state;
}

function putInHand(state: GameState, pid: 'P1' | 'P2', def: CardDef): string {
  const card = makeCardInst(def);
  state.players[pid].hand.push(card);
  return card.iid;
}

function holdForP2(state: GameState): void {
  putInHand(state, 'P2', QUICK);
}

function fieldLeader(state: GameState): void {
  const leader = state.players.P1.leader;
  leader.invoked = true;
  leader.resolve = LEADER.resolve ?? 0;
}

function expectLeaderUntouched(state: GameState): void {
  expect(state.players.P1.leader.resolve).toBe(LEADER.resolve);
  expect(state.players.P1.leader.abilityUsedThisTurn).toBe(false);
}

describe('gameplay audit regressions', () => {
  test('the active player cannot invoke another Quick while the opponent holds priority', () => {
    const state = game();
    holdForP2(state);
    const pending = putInHand(state, 'P1', unit('pending'));
    const illegalQuick = putInHand(state, 'P1', { ...QUICK, id: 'second-quick' });

    expect(invokeCard(state, 'P1', pending)).toBe(true);
    expect(state.priority?.holder).toBe('P2');
    expect(invokeCard(state, 'P1', illegalQuick)).toBe(false);
    expect(state.players.P1.hand.some((card) => card.iid === illegalQuick)).toBe(true);
  });

  test('the active player cannot tap a Location while the opponent holds priority', () => {
    const state = game();
    holdForP2(state);
    const pending = putInHand(state, 'P1', unit('pending-location'));
    state.players.P1.locations.push({ iid: 'spring-1', produces: 'Ember', exhausted: false });

    expect(invokeCard(state, 'P1', pending)).toBe(true);
    expect(state.priority?.holder).toBe('P2');
    expect(tapLocationForEssence(state, 'P1', 'spring-1')).toBe(false);
    expect(state.players.P1.locations[0].exhausted).toBe(false);
  });

  test('an automatic Event target is locked before the response window', () => {
    const state = game();
    holdForP2(state);
    const first = summonUnit(state, 'P2', unit('first-target', 5, 5));
    const second = summonUnit(state, 'P2', unit('second-target', 2, 5));
    const event = putInHand(state, 'P1', {
      id: 'locked-event',
      name: 'Locked Event',
      type: 'Event',
      subtype: 'Slow',
      cost: FREE,
      onInvoke: { action: 'damage', value: 2, target: 'enemyUnit' },
    });

    expect(invokeCard(state, 'P1', event)).toBe(true);
    expect(state.stack[0].targetIid).toBe(first.iid);
    first.def = { ...first.def, keywords: ['Warded'] };
    settleStack(state, { interactive: false });

    expect(first.damage).toBe(0);
    expect(second.damage).toBe(0);
    expect(state.log).toContain('P1 invokes Locked Event targeting first-target.');
    expect(state.log).toContain('Locked Event fizzles — its target is gone.');
  });

  test('a Leader ability rejects a friendly explicit target without spending Resolve', () => {
    const state = game();
    fieldLeader(state);
    const friendly = summonUnit(state, 'P1', unit('friendly'));

    expect(activateLeaderAbility(state, 'P1', 0, friendly.iid)).toBe(false);
    expectLeaderUntouched(state);
  });

  test('a Leader ability rejects a Warded explicit target without spending Resolve', () => {
    const state = game();
    fieldLeader(state);
    const warded = summonUnit(state, 'P2', unit('warded', 2, 3, ['Warded']));

    expect(activateLeaderAbility(state, 'P1', 0, warded.iid)).toBe(false);
    expectLeaderUntouched(state);
  });

  test('a Leader ability with no legal automatic target spends nothing', () => {
    const state = game();
    fieldLeader(state);

    expect(activateLeaderAbility(state, 'P1', 0)).toBe(false);
    expectLeaderUntouched(state);
  });

  test('an explicit Tool target becoming illegal does not retarget its debuff', () => {
    const state = game();
    holdForP2(state);
    const bearer = summonUnit(state, 'P1', unit('bearer'));
    const first = summonUnit(state, 'P2', unit('tool-first', 5, 5));
    const second = summonUnit(state, 'P2', unit('tool-second', 2, 5));
    const tool = putInHand(state, 'P1', {
      id: 'explicit-tool',
      name: 'Explicit Tool',
      type: 'Item',
      subtype: 'Tool',
      cost: FREE,
      bond: { might: 1 },
      nerf: 2,
    });

    expect(invokeCard(state, 'P1', tool, { bondTargetIid: bearer.iid, targetIid: first.iid })).toBe(
      true,
    );
    first.def = { ...first.def, keywords: ['Warded'] };
    settleStack(state, { interactive: false });

    expect(bearer.items).toHaveLength(1);
    expect(effMight(state, first)).toBe(5);
    expect(effMight(state, second)).toBe(2);
  });

  test('an automatic Tool target is locked and never switches during resolution', () => {
    const state = game();
    holdForP2(state);
    const bearer = summonUnit(state, 'P1', unit('auto-bearer'));
    const first = summonUnit(state, 'P2', unit('auto-first', 5, 5));
    const second = summonUnit(state, 'P2', unit('auto-second', 2, 5));
    const tool = putInHand(state, 'P1', {
      id: 'automatic-tool',
      name: 'Automatic Tool',
      type: 'Item',
      subtype: 'Tool',
      cost: FREE,
      bond: { might: 1 },
      nerf: 2,
    });

    expect(invokeCard(state, 'P1', tool, { bondTargetIid: bearer.iid })).toBe(true);
    expect(state.stack[0].toolTargetIid).toBe(first.iid);
    first.def = { ...first.def, keywords: ['Warded'] };
    settleStack(state, { interactive: false });

    expect(bearer.items).toHaveLength(1);
    expect(effMight(state, first)).toBe(5);
    expect(effMight(state, second)).toBe(2);
    expect(state.log).toContain('P1 invokes Automatic Tool targeting auto-first.');
  });
});
