import { describe, expect, it } from 'vitest';
import {
  attainableCategories,
  describeHand,
  equity,
  evaluate,
  handStrength,
  preflopStrength,
} from './evaluator';
import { rngOn } from './rng';
import { cards } from './testkit';

describe('evaluate', () => {
  const cat = (s: string) => evaluate(cards(s)).category;
  it('ranks every category', () => {
    expect(cat('As Ks Qs Js Ts 2d 3c')).toBe(8);
    expect(cat('9c 9d 9h 9s 2d 3c 4h')).toBe(7);
    expect(cat('Ah Ad Ac Kd Ks 2c 3d')).toBe(6);
    expect(cat('Ah Kh 7h 2h 9h 3d 5s')).toBe(5);
    expect(cat('2h 3h 4h 5d Ac Kd 9s')).toBe(4); // the wheel
    expect(cat('7h 7d 7s Kc 2d 9h 3s')).toBe(3);
    expect(cat('Kh Kd 7s 7c 2d 9h 3s')).toBe(2);
    expect(cat('Kh Kd 7s 8c 2d 9h 3s')).toBe(1);
    expect(cat('Ah 2d 7s 9c Jd 4h 6s')).toBe(0);
  });

  it('breaks ties on kickers and splits true ties', () => {
    const a = evaluate(cards('Ah Kd 7s 7c 2d 9h 3s')).score;
    const b = evaluate(cards('Qh Jd 7s 7c 2d 9h 3s')).score;
    expect(a).toBeGreaterThan(b);
    expect(evaluate(cards('As 2c Kd Qh Jc Tc 3d')).score).toBe(
      evaluate(cards('Ad 4c Kd Qh Jc Tc 3d')).score,
    );
  });

  it('a wild hole card counts as any suit', () => {
    const c = cards('Ah Kd 7h 2h 9h 3d 5s');
    expect(evaluate(c).category).toBe(0);
    c[1].wild = true;
    expect(evaluate(c).category).toBe(5);
  });

  it('describes hands in plain words', () => {
    expect(describeHand(cards('Kh Kd 7s 8c 2d'))).toBe('Pair of Kings');
    expect(describeHand(cards('Kh Kd'))).toBe('Pocket Kings');
  });
});

describe('attainable categories (hand exclusions)', () => {
  it('everything is reachable with three or more cards to come', () => {
    expect(attainableCategories(cards('2c 7d'), [], 5).has(5)).toBe(true);
  });
  it('a flush is unreachable without enough of a suit', () => {
    const set = attainableCategories(cards('Ah Kd'), cards('7s 2c 9h'), 2);
    expect(set.has(5)).toBe(false);
    expect(set.has(1)).toBe(true);
  });
  it('on the river only the made hand remains', () => {
    const set = attainableCategories(cards('Ah Ad'), cards('7s 2c 9h Kd 4c'), 0);
    expect([...set]).toEqual([1]);
  });
});

describe('equity', () => {
  it('aces are a big favourite heads-up and win less multiway', () => {
    const rng = rngOn({ rng: 3 });
    const hu = equity({
      hole: cards('As Ah'),
      board: [],
      boardSize: 5,
      opponents: [[]],
      trials: 600,
      rng,
    });
    const five = equity({
      hole: cards('As Ah'),
      board: [],
      boardSize: 5,
      opponents: [[], [], [], [], []],
      trials: 600,
      rng,
    });
    expect(hu).toBeGreaterThan(0.75);
    expect(five).toBeLessThan(hu);
  });
  it('pre-flop strength orders hands sensibly', () => {
    expect(preflopStrength(cards('As Ah'))).toBeGreaterThan(preflopStrength(cards('Ks Qs')));
    expect(preflopStrength(cards('Ks Qs'))).toBeGreaterThan(preflopStrength(cards('7d 2c')));
  });
});

describe('hand reading', () => {
  it('handStrength ranks made hands, draws and air on the board', () => {
    const board = cards('Kd 7s 2c');
    const top = handStrength(cards('Ks Qh'), board);
    const bottom = handStrength(cards('2s Ah'), board);
    const set = handStrength(cards('7h 7d'), board);
    const air = handStrength(cards('9h 4d'), board);
    expect(set).toBeGreaterThan(top);
    expect(top).toBeGreaterThan(bottom);
    expect(bottom).toBeGreaterThan(air);
    // A flush draw reads as a real holding, ahead of air.
    expect(handStrength(cards('Ad 9d'), cards('Kd 7d 2c'))).toBeGreaterThan(air);
  });

  it('a read range makes a bluff-catcher worse against a bet', () => {
    const rng = rngOn({ rng: 11 });
    const spot = { hole: cards('Js 3h'), board: cards('Jd 9c 5h 2s'), boardSize: 5, trials: 800 };
    const vsAny = equity({ ...spot, opponents: [[]], rng });
    const vsBet = equity({ ...spot, opponents: [[]], floors: [0.6], rng });
    expect(vsAny).toBeGreaterThan(0.6);
    expect(vsBet).toBeLessThan(vsAny - 0.15);
  });
});
