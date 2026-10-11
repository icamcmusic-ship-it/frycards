/**
 * Colour themes: the INK dark theme and the SYSTEM choice (AUDIT-2026-10-11
 * U61, S-13).
 */
import { describe, expect, test } from 'vitest';
import { SYSTEM_THEMES, THEMES, resolveTheme } from './themes';

const lum = (hex: string) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const [r, g, b] = c.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe('themes', () => {
  test('SYSTEM resolves to a light and a dark theme by the OS setting', () => {
    expect(resolveTheme('system', false)).toBe(SYSTEM_THEMES.light);
    expect(resolveTheme('system', true)).toBe(SYSTEM_THEMES.dark);
    expect(THEMES[SYSTEM_THEMES.dark].dark).toBe(true);
    expect(THEMES[SYSTEM_THEMES.light].dark).toBeFalsy();
    expect(resolveTheme('graphite', true)).toBe('graphite');
  });

  test('INK inverts the roles and keeps every text pairing at AA', () => {
    const { ink, paper, yellow, red, steel } = THEMES.ink.colors;
    expect(lum(paper)).toBeLessThan(lum(ink));
    expect(contrast(ink, paper)).toBeGreaterThanOrEqual(4.5); // body text
    expect(contrast(paper, yellow)).toBeGreaterThanOrEqual(4.5); // dark text on yellow (index.css)
    expect(contrast(paper, red)).toBeGreaterThanOrEqual(4.5); // paper text on red buttons
    expect(contrast(ink, steel)).toBeGreaterThanOrEqual(4.5); // light text on steel (index.css)
    expect(contrast(red, paper)).toBeGreaterThanOrEqual(4.5); // red as text
  });
});
