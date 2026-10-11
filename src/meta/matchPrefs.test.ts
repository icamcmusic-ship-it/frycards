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
  TIMER_KEY,
  TIMER_MODES,
  TIMER_PRESETS,
  FIXED_THINK_CHARGE_MS,
  AUTO_DEAL_KEY,
  loadTimerMode,
  saveTimerMode,
  loadAutoDeal,
  saveAutoDeal,
  loadPauseOnTarget,
  loadAmountsInBB,
  fmtAmount,
  rewardFloorMs,
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
  test('unset falls back to 1×, the table pace', () => {
    expect(loadCpuSpeed()).toBe(DEFAULT_CPU_SPEED);
    expect(CPU_SPEEDS[loadCpuSpeed()].label).toBe('1×');
  });

  test('a stored choice round-trips, by label', () => {
    for (let i = 0; i < CPU_SPEEDS.length; i++) {
      saveCpuSpeed(i);
      expect(store.get(CPU_SPEED_KEY)).toBe(CPU_SPEEDS[i].label);
      expect(loadCpuSpeed()).toBe(i);
    }
  });

  // The retired match screen stored CINEMATIC / SLOW / NORMAL / FAST (and,
  // before v26, bare indexes). None of them may silently become INSTANT.
  test('a retired label or legacy index maps onto the poker ladder', () => {
    for (const [stored, label] of [
      ['CINEMATIC', '1×'],
      ['SLOW', '1×'],
      ['NORMAL', '1×'],
      ['FAST', '2×'],
      ['0', '1×'],
      ['1', '1×'],
      ['2', '2×'],
    ] as const) {
      store.set(CPU_SPEED_KEY, stored);
      expect(CPU_SPEEDS[loadCpuSpeed()].label, `legacy ${stored}`).toBe(label);
    }
  });

  test('junk, out-of-range and fractional values fall back to 1×', () => {
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
 * A page that spells the speed ladder out in prose must name every rung —
 * the v26 ladder once shipped with a rung no page mentioned. Tooltips are
 * built from CPU_SPEEDS; prose is pinned here.
 */
test('every rung of the ladder is named in the pages that document it', () => {
  for (const rel of [
    'src/components/HowToPlay.tsx',
    'src/components/PokerTable.tsx',
    'src/meta/SettingsScreen.tsx',
  ]) {
    const src = readFileSync(join(process.cwd(), rel), 'utf8');
    // A file either renders the ladder from CPU_SPEEDS (nothing to drift) or
    // spells it out in prose. Only the second kind is checked — and it is
    // checked for EVERY rung, which is exactly what v26 missed.
    const spellsItOut = /1× \/ 2×/.test(src);
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

describe('table timers (AUDIT-2026-10-11 §3.1.0)', () => {
  test('unset or junk is STANDARD; every preset round-trips by id', () => {
    expect(loadTimerMode()).toBe('standard');
    store.set(TIMER_KEY, 'lunch');
    expect(loadTimerMode()).toBe('standard');
    for (const { id } of TIMER_MODES) {
      saveTimerMode(id);
      expect(store.get(TIMER_KEY)).toBe(id);
      expect(loadTimerMode()).toBe(id);
    }
  });

  test('OFF has no forced action and a fixed think charge; STANDARD keeps today', () => {
    const off = TIMER_PRESETS.off;
    expect(off.turnMs).toBeNull();
    expect(off.windowMs).toBeNull();
    expect(off.choiceMs).toBeNull();
    expect(off.humanChargeMs).toBe(FIXED_THINK_CHARGE_MS);
    expect(TIMER_PRESETS.relaxed.humanChargeMs).toBe(FIXED_THINK_CHARGE_MS);
    const std = TIMER_PRESETS.standard;
    expect(std).toMatchObject({
      turnMs: 30_000,
      bankMs: 60_000,
      windowMs: 10_000,
      choiceMs: 30_000,
    });
    expect(std.humanChargeMs).toBe('real');
    // The bank refills per level but never past its cap (TM-3).
    for (const p of Object.values(TIMER_PRESETS))
      expect(p.bankCapMs).toBeGreaterThanOrEqual(p.bankMs);
  });

  test('AUTO-DEAL and "pause when targeted" default on; amounts in BB default off', () => {
    expect(loadAutoDeal()).toBe(true);
    expect(loadPauseOnTarget()).toBe(true);
    expect(loadAmountsInBB()).toBe(false);
    saveAutoDeal(false);
    expect(store.get(AUTO_DEAL_KEY)).toBe('0');
    expect(loadAutoDeal()).toBe(false);
  });
});

describe('fmtAmount (S-14)', () => {
  test('chips are whole; big blinds to one decimal', () => {
    expect(fmtAmount(123.4, null)).toBe('123');
    expect(fmtAmount(48, 16)).toBe('3 BB');
    expect(fmtAmount(72, 16)).toBe('4.5 BB');
    expect(fmtAmount(10, 16)).toBe('0.6 BB');
  });
});

describe('rewardFloorMs (A20) mirrors the server floor', () => {
  test('greatest(45 s, mode minimum × seats / 6)', () => {
    const MIN = 60_000;
    expect(rewardFloorMs(6 * MIN, 6)).toBe(6 * MIN);
    expect(rewardFloorMs(12 * MIN, 2)).toBe(4 * MIN);
    expect(rewardFloorMs(6 * MIN, 2)).toBe(2 * MIN);
    expect(rewardFloorMs(1 * MIN, 2)).toBe(45_000);
  });
});
