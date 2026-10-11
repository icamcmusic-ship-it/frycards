import { describe, expect, test } from 'vitest';
import { flightsFor } from './ChipFlights';

const betAt = (i: number): [number, number] => [i * 10, 20];
const seatAt = (i: number): [number, number] => [i * 10, 0];
const pot: [number, number] = [50, 50];

describe('flightsFor (U7)', () => {
  test('a street change slides each bet into the pot', () => {
    let n = 0;
    const f = flightsFor(
      { key: '1-preflop', hand: 1, bets: [0, 16, 16], done: false },
      { key: '1-flop', hand: 1, bets: [0, 0, 0], done: false, winners: [] },
      betAt,
      seatAt,
      pot,
      () => ++n,
    );
    expect(f.map((x) => x.from)).toEqual([betAt(1), betAt(2)]);
    expect(f.every((x) => x.to === pot)).toBe(true);
  });
  test('a decided hand slides the pot to each winner after the bets', () => {
    let n = 0;
    const f = flightsFor(
      { key: '1-river', hand: 1, bets: [40, 0], done: false },
      { key: '1-river', hand: 1, bets: [40, 0], done: true, winners: [0] },
      betAt,
      seatAt,
      pot,
      () => ++n,
    );
    expect(f).toHaveLength(2);
    expect(f[1].from).toBe(pot);
    expect(f[1].to).toEqual(seatAt(0));
    expect(f[1].delay).toBeGreaterThan(0);
  });
  test('a new hand flies nothing', () => {
    const f = flightsFor(
      { key: '1-river', hand: 1, bets: [40, 0], done: true },
      { key: '2-preflop', hand: 2, bets: [8, 16], done: false, winners: [] },
      betAt,
      seatAt,
      pot,
      () => 1,
    );
    expect(f).toEqual([]);
  });
});
