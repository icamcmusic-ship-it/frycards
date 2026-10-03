/** Regressions for the Low engine findings L-1 and L-12 of the 2026-09-29 audit. */
import { describe, expect, test } from 'vitest';
import { CardDef } from './cards';
import { DeckDef, createGame, finishDuskShed, invokeCard, mulberry32 } from './engine';

const LEADER: CardDef = {
  id: 'l',
  name: 'L',
  type: 'Leader',
  cost: { generic: 0, pips: {} },
  resolve: 3,
  leaderAbilities: [],
};
const UNIT: CardDef = {
  id: 'u',
  name: 'U',
  type: 'Unit',
  cost: { generic: 0, pips: {} },
  might: 1,
  grit: 1,
  onInvoke: { action: 'draw', value: 1, target: 'none' },
};
const POOL = { l: LEADER, u: UNIT };
const game = () => {
  const dd = (): DeckDef => ({ leaderId: 'l', cards: Array(30).fill('u') });
  return createGame(dd(), dd(), POOL, { rng: mulberry32(9), shuffle: false, handSize: 0 });
};

describe('L-1 stack ids are per game', () => {
  test('two games running the same actions produce the same stack item ids', () => {
    const run = () => {
      const s = game();
      s.phase = 'Main1';
      const iid = 'u#test';
      s.players[s.active].hand.push({ iid, def: UNIT } as never);
      const ids: string[] = [];
      s.stack.push = ((...items) => {
        ids.push(...items.map((i) => i.id));
        return Array.prototype.push.apply(s.stack, items);
      }) as typeof s.stack.push;
      invokeCard(s, s.active, iid);
      return ids;
    };
    const a = run();
    const b = run();
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
  });
});

describe('L-12 finishDuskShed', () => {
  test('does nothing unless the turn is paused in Dusk', () => {
    const s = game();
    s.phase = 'Main2';
    const active = s.active;
    finishDuskShed(s);
    expect(s.active).toBe(active);
    expect(s.phase).toBe('Main2');
  });
});
