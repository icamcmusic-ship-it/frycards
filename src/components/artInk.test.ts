import { describe, expect, it } from 'vitest';
import {
  FA_ACCENT,
  FA_DEFAULT,
  FA_REGIONS,
  INK_HYSTERESIS,
  INK_PIVOT,
  MIN_CONTRAST,
  chooseInk,
  contrast,
  decodeFaInk,
  encodeFaInk,
  faSkyAlpha,
  hexLuminance,
  luminance,
  nextInk,
  regionStats,
  type RegionStats,
} from './artInk';
import { FA_INK, MC_INK } from './artInk.generated';
import { POOL } from '../game/poker/cardpool';

const flat = (l: number): RegionStats => ({ mean: l, lo: l, hi: l });

describe('luminance and contrast', () => {
  it('matches the WCAG reference points', () => {
    expect(luminance(0, 0, 0)).toBe(0);
    expect(luminance(255, 255, 255)).toBeCloseTo(1, 6);
    expect(hexLuminance('#808080')).toBeCloseTo(0.2159, 3);
    expect(hexLuminance('#fff')).toBeCloseTo(1, 6);
    expect(contrast(1, 0)).toBeCloseTo(21, 6);
    expect(contrast(0, 1)).toBeCloseTo(21, 6);
    // #777 on white is the classic just-under-AA grey.
    expect(contrast(hexLuminance('#777777'), 1)).toBeCloseTo(4.48, 2);
  });

  it('measures a region of a pixel buffer, darkened by the scrim', () => {
    // 2×2 RGBA: top row white, bottom row black.
    const px = [255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255];
    const top = regionStats(px, 2, 2, { x0: 0, y0: 0, x1: 1, y1: 0.5 });
    expect(top.mean).toBeCloseTo(1, 5);
    const bottom = regionStats(px, 2, 2, { x0: 0, y0: 0.5, x1: 1, y1: 1 });
    expect(bottom.mean).toBe(0);
    const whole = regionStats(px, 2, 2, { x0: 0, y0: 0, x1: 1, y1: 1 });
    expect(whole.lo).toBe(0);
    expect(whole.hi).toBeCloseTo(1, 5);
    const scrimmed = regionStats(px, 2, 2, { x0: 0, y0: 0, x1: 1, y1: 0.5 }, () => 0.5);
    expect(scrimmed.mean).toBeCloseTo(hexLuminance('#808080'), 2);
  });

  it('follows the Full-Art scrim: dark at both ends, clear in the middle', () => {
    expect(faSkyAlpha(0)).toBeCloseTo(0.78, 2);
    expect(faSkyAlpha(1)).toBeCloseTo(0.94, 2);
    expect(faSkyAlpha(0.4)).toBe(0);
  });
});

describe('chooseInk', () => {
  const accent = FA_ACCENT.Ember;
  it('keeps the design ink when it clears 4.5:1', () => {
    expect(chooseInk(flat(0.01), accent, 'accent').ink).toBe('accent');
    expect(chooseInk(flat(0.01), accent, 'light').ink).toBe('light');
  });
  it('turns dark over bright art', () => {
    const c = chooseInk(flat(0.9), accent, 'accent');
    expect(c.ink).toBe('dark');
    expect(c.ratio).toBeGreaterThanOrEqual(MIN_CONTRAST);
    expect(chooseInk(flat(0.9), accent, 'light').ink).toBe('dark');
  });
  it('never turns a white-by-design region into the accent', () => {
    // Mid-grey: white fails, Light's acid yellow passes, dark passes too.
    const c = chooseInk(flat(0.3), FA_ACCENT.Light, 'light');
    expect(c.ink).not.toBe('accent');
  });
  it('picks the better of light and dark when nothing passes', () => {
    // Busy art spanning black to white: worst case fails for every ink.
    const busy = { mean: 0.4, lo: 0, hi: 1 };
    const c = chooseInk(busy, accent, 'accent');
    expect(['light', 'dark']).toContain(c.ink);
    expect(c.ratio).toBeLessThan(MIN_CONTRAST);
  });
});

describe('nextInk hysteresis', () => {
  it('pivots where white and print-black tie', () => {
    expect(INK_PIVOT).toBeGreaterThan(0.15);
    expect(INK_PIVOT).toBeLessThan(0.2);
  });
  it('holds inside the dead band, whichever side it came from', () => {
    for (const m of [
      INK_PIVOT - INK_HYSTERESIS + 0.01,
      INK_PIVOT,
      INK_PIVOT + INK_HYSTERESIS - 0.01,
    ]) {
      expect(nextInk('light', m)).toBe('light');
      expect(nextInk('dark', m)).toBe('dark');
    }
  });
  it('flips once clearly past the band', () => {
    expect(nextInk('light', INK_PIVOT + INK_HYSTERESIS + 0.01)).toBe('dark');
    expect(nextInk('dark', INK_PIVOT - INK_HYSTERESIS - 0.01)).toBe('light');
  });
  it('does not strobe on a frame sequence jittering at the threshold', () => {
    let ink: 'light' | 'dark' = 'light';
    let flips = 0;
    for (let i = 0; i < 200; i++) {
      const next = nextInk(ink, INK_PIVOT + Math.sin(i) * INK_HYSTERESIS * 0.9);
      if (next !== ink) flips++;
      ink = next;
    }
    expect(flips).toBe(0);
  });
});

describe('generated map', () => {
  it('round-trips the encoding and falls back to the design inks', () => {
    expect(decodeFaInk(encodeFaInk({ name: 'dark', tag: 'dark', quote: 'light' }))).toEqual({
      name: 'dark',
      tag: 'dark',
      quote: 'light',
    });
    expect(decodeFaInk(undefined)).toEqual(FA_DEFAULT);
    expect(decodeFaInk('zz')).toEqual(FA_DEFAULT);
  });
  it('lists only pool cards, with valid codes', () => {
    const ids = new Set(POOL.map((c) => c.id));
    for (const [id, code] of Object.entries(FA_INK)) {
      expect(ids.has(id), id).toBe(true);
      expect(code).toMatch(/^[lda]{3}$/);
    }
    for (const id of Object.keys(MC_INK)) expect(ids.has(id), id).toBe(true);
  });
  it('defines regions inside the art box', () => {
    for (const r of Object.values(FA_REGIONS)) {
      expect(r.x0).toBeGreaterThanOrEqual(0);
      expect(r.y1).toBeLessThanOrEqual(1);
      expect(r.x1).toBeGreaterThan(r.x0);
      expect(r.y1).toBeGreaterThan(r.y0);
    }
  });
});
