import { describe, expect, it } from 'vitest';
import { replay, type Match } from './engine';
import { act, rigHand, table } from './testkit';
import { cpuTableSetup, simulateMatch } from './sim';

const checkDown = (m: Match) => {
  act(m, { type: 'call', seat: 0 }, { type: 'check', seat: 1 });
  for (let k = 0; k < 3; k++) act(m, { type: 'check', seat: 1 }, { type: 'check', seat: 0 });
  return m;
};

describe('SeatStats tally', () => {
  it('a fold credits an uncontested win (a bluff when the winner holds air)', () => {
    const m = rigHand(table(2), { button: 0, holes: ['7c 2d', 'As Ks'] });
    act(m, { type: 'raise', seat: 0, to: 48 }, { type: 'fold', seat: 1 });
    const st = m.stats![0];
    expect(st.hands_won).toBe(1);
    expect(st.showdown_wins).toBe(0);
    expect(st.bluff_wins).toBe(1);
    expect(m.stats![1].hands_won).toBe(0);
  });

  it('a showdown win counts the made category', () => {
    const m = rigHand(table(2), {
      button: 0,
      holes: ['Ah Kh', 'Qs Qd'],
      deck: '2h 7h 9h Tc 3s',
    });
    checkDown(m);
    const st = m.stats![0];
    expect(st.showdown_wins).toBe(1);
    expect(st.made_flush).toBe(1);
    expect(st.strong_showdowns).toBe(1);
    expect(st.best_category).toBe(5);
    expect(m.stats![1].showdown_wins).toBe(0);
  });

  it('a pair win counts win_pair, not strong', () => {
    const m = rigHand(table(2), {
      button: 0,
      holes: ['Ah Kd', 'Qs Jd'],
      deck: 'Ac 7h 9s 4c 3s',
    });
    checkDown(m);
    expect(m.stats![0].win_pair).toBe(1);
    expect(m.stats![0].strong_showdowns).toBe(0);
  });

  it('is deterministic and consistent over whole simulated matches', () => {
    for (let seed = 1; seed <= 6; seed++) {
      const setup = cpuTableSetup({ seed, mode: 'quick', seats: 2 + (seed % 5) });
      const { match, actions } = simulateMatch(setup, seed * 31);
      const again = replay(setup, actions);
      expect(again.stats).toEqual(match.stats);
      expect(again.placements).toEqual(match.placements);
      const won = match.stats!.reduce((a, s) => a + s.hands_won, 0);
      expect(won).toBeGreaterThanOrEqual(match.handNo);
      const busted = match.stats!.reduce((a, s) => a + s.seats_busted, 0);
      expect(busted).toBe(match.seats.filter((s) => s.busted).length);
      for (const s of match.stats!) {
        expect(s.showdown_wins + s.bluff_wins).toBeLessThanOrEqual(s.hands_won);
        expect(s.strong_showdowns + s.win_pair).toBeLessThanOrEqual(s.showdown_wins);
        expect(s.big_pots_50).toBeLessThanOrEqual(s.big_pots);
      }
    }
  });
});

describe('weekly twists and forced Locations', () => {
  it('Deep Stacks and Steady Nerve change the starting table', async () => {
    const { createMatch, modeOf } = await import('./engine');
    const { MODES } = await import('./constants');
    const setup = cpuTableSetup({ seed: 5, mode: 'quick', seats: 3 });
    const m = createMatch({ ...setup, mutators: ['deepStacks', 'steadyNerve'] });
    expect(modeOf(m).stackChips).toBe(720);
    expect(m.seats[0].stack).toBe(720);
    const base = createMatch(setup);
    expect(m.seats[0].nerve).toBe(base.seats[0].nerve + 1);
    expect(modeOf(base)).toBe(MODES.quick);
  });

  it('a forced Location shows up every cycle', async () => {
    const { createMatch, applyInPlace } = await import('./engine');
    const { poolByType } = await import('./cardpool');
    const loc = poolByType('Location')[3];
    const setup = cpuTableSetup({ seed: 9, mode: 'quick', seats: 6 });
    const m = createMatch({ ...setup, forcedLocation: loc });
    applyInPlace(m, { type: 'start' });
    expect([m.hand!.location.card.id, ...m.bag.map((b) => b.card.id)]).toContain(loc.id);
  });
});
