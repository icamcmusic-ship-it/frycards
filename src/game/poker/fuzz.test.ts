import { describe, expect, it } from 'vitest';
import { MODES, UNIT, type ModeId } from './constants';
import { chipsInPlay, replay } from './engine';
import { cpuTableSetup, simulateMatch } from './sim';

describe('bot-versus-bot fuzz', () => {
  it('every match ends, conserves chips and replays exactly', () => {
    for (let seed = 1; seed <= 18; seed++) {
      const mode = (['quick', 'standard', 'deep'] as ModeId[])[seed % 3];
      const seats = 2 + (seed % 5);
      const setup = cpuTableSetup({ seed: seed * 1013, mode, seats });
      const { match, actions } = simulateMatch(setup, seed);
      expect(match.phase).toBe('over');
      expect(chipsInPlay(match)).toBe(seats * MODES[mode].stackChips);
      expect(match.placements).toHaveLength(seats);
      if (seed % 6 === 0) expect(replay(setup, actions).placements).toEqual(match.placements);
    }
  }, 120_000);
});
