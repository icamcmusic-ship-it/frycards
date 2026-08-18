/**
 * Narration-speed preference. Small surface, but it has already produced one
 * shipped bug (v17: `Number(null)` is 0, which silently made SLOW the default
 * for every player who had never touched the control) and it is now read from
 * two places — the match screen and the Settings screen — so the parsing has
 * to live in one tested function rather than be re-derived in each.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, test } from 'vitest';
import {
  CPU_SPEEDS,
  CPU_SPEED_KEY,
  DEFAULT_CPU_SPEED,
  DEFAULT_HAND_SORT,
  HAND_SORTS,
  HAND_SORT_KEY,
  loadCpuSpeed,
  loadHandSort,
  saveCpuSpeed,
  saveHandSort,
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

/**
 * The v26 ladder gained a fourth rung (CINEMATIC) and three player-facing
 * strings kept advertising the three-rung v17 one — so the slowest speed in
 * the game was undiscoverable from the two controls that cycle to it and from
 * the page that documents them. The tooltips are now BUILT from the ladder;
 * the prose in How to Play cannot be, so it gets pinned here instead.
 */
test('every rung of the ladder is named in the pages that document it', () => {
  for (const rel of [
    'src/components/HowToPlay.tsx',
    'src/components/GameV4.tsx',
    'src/meta/SettingsScreen.tsx',
  ]) {
    const src = readFileSync(join(process.cwd(), rel), 'utf8');
    // A file either renders the ladder from CPU_SPEEDS (nothing to drift) or
    // spells it out in prose. Only the second kind is checked — and it is
    // checked for EVERY rung, which is exactly what v26 missed.
    const spellsItOut = /NORMAL \/ FAST/.test(src);
    if (!spellsItOut) continue;
    for (const { label } of CPU_SPEEDS) {
      expect(src, `${rel} names the speed ladder but omits ${label}`).toContain(label);
    }
  }
});

/**
 * Hand order. Stored by NAME, not index — a mode inserted in the middle of the
 * ladder must not silently turn everybody's saved "cheapest first" into
 * something else, which is the exact bug the speed ladder shipped in v26 and
 * had to migrate its way out of.
 */
describe('loadHandSort / saveHandSort', () => {
  test('an unset, empty or junk value is the default order', () => {
    expect(loadHandSort()).toBe(DEFAULT_HAND_SORT);
    for (const bad of ['', '  ', 'nonsense', '0', '1']) {
      store.set(HAND_SORT_KEY, bad);
      expect(loadHandSort(), `stored ${JSON.stringify(bad)}`).toBe(DEFAULT_HAND_SORT);
    }
  });

  test('every mode round-trips through storage', () => {
    for (const { id } of HAND_SORTS) {
      saveHandSort(id);
      expect(store.get(HAND_SORT_KEY)).toBe(id);
      expect(loadHandSort()).toBe(id);
    }
  });

  test('the stored value is the mode NAME, so inserting a mode is safe', () => {
    saveHandSort('cost');
    expect(store.get(HAND_SORT_KEY)).toBe('cost');
    expect(Number.isFinite(Number(store.get(HAND_SORT_KEY)))).toBe(false);
  });

  test('a mode that is not on the ladder is never written', () => {
    saveHandSort('bogus' as (typeof HAND_SORTS)[number]['id']);
    expect(store.has(HAND_SORT_KEY)).toBe(false);
  });

  test('the default order is one of the modes, and every mode is labelled', () => {
    expect(HAND_SORTS.some((s) => s.id === DEFAULT_HAND_SORT)).toBe(true);
    expect(HAND_SORTS.every((s) => s.label.length > 0 && s.blurb.length > 0)).toBe(true);
    expect(new Set(HAND_SORTS.map((s) => s.id)).size).toBe(HAND_SORTS.length);
  });
});
