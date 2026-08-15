/**
 * Narration-speed preference. Small surface, but it has already produced one
 * shipped bug (v17: `Number(null)` is 0, which silently made SLOW the default
 * for every player who had never touched the control) and it is now read from
 * two places — the match screen and the Settings screen — so the parsing has
 * to live in one tested function rather than be re-derived in each.
 */
import { beforeEach, describe, expect, test } from 'vitest';
import {
  CPU_SPEEDS,
  CPU_SPEED_KEY,
  DEFAULT_CPU_SPEED,
  loadCpuSpeed,
  saveCpuSpeed,
} from './matchPrefs';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  // jsdom is not configured for this project's vitest run, so stub the two
  // methods the module actually uses.
  (globalThis as unknown as { window: unknown }).window = {
    localStorage: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, v),
    },
  };
});

describe('loadCpuSpeed', () => {
  test('unset falls back to NORMAL, not SLOW', () => {
    expect(loadCpuSpeed()).toBe(DEFAULT_CPU_SPEED);
    expect(CPU_SPEEDS[loadCpuSpeed()].label).toBe('NORMAL');
  });

  test('a stored choice round-trips, by label', () => {
    for (let i = 0; i < CPU_SPEEDS.length; i++) {
      saveCpuSpeed(i);
      expect(store.get(CPU_SPEED_KEY)).toBe(CPU_SPEEDS[i].label);
      expect(loadCpuSpeed()).toBe(i);
    }
  });

  // v26 inserted CINEMATIC at the slow end of the ladder, so every index a
  // player had stored before it now names a different speed. A migration that
  // is wrong here is invisible: the match simply plays at a pace nobody chose.
  test('a legacy v17-v25 index migrates to the speed it used to mean', () => {
    for (const [stored, label] of [
      ['0', 'SLOW'],
      ['1', 'NORMAL'],
      ['2', 'FAST'],
    ] as const) {
      store.set(CPU_SPEED_KEY, stored);
      expect(CPU_SPEEDS[loadCpuSpeed()].label, `legacy ${stored}`).toBe(label);
    }
  });

  test('junk, out-of-range and fractional values fall back to NORMAL', () => {
    for (const bad of ['', 'brisk', '-1', '3', '99', '1.5', 'NaN']) {
      store.set(CPU_SPEED_KEY, bad);
      expect(loadCpuSpeed(), `stored ${JSON.stringify(bad)}`).toBe(DEFAULT_CPU_SPEED);
    }
  });

  test('a blocked localStorage (private mode) is not fatal', () => {
    (globalThis as unknown as { window: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error('blocked');
        },
        setItem: () => {
          throw new Error('blocked');
        },
      },
    };
    expect(loadCpuSpeed()).toBe(DEFAULT_CPU_SPEED);
    expect(() => saveCpuSpeed(2)).not.toThrow();
  });
});

test('the speed ladder is ordered slow → fast and every entry is labelled', () => {
  const mults = CPU_SPEEDS.map((s) => s.mult);
  expect(mults).toEqual([...mults].sort((a, b) => b - a));
  expect(CPU_SPEEDS.every((s) => s.label.length > 0 && s.blurb.length > 0)).toBe(true);
});
