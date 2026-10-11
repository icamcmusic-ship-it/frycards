import { describe, expect, it } from 'vitest';
import { clampWholeText, parseWhole } from './wholeField';

describe('listing number fields (B8)', () => {
  it('lets a field be empty while typing (invalid, not 1)', () => {
    expect(parseWhole('', 1, 20)).toBeNull();
  });
  it('parses a typed price as typed', () => {
    expect(parseWhole('250', 1, 1_000_000)).toBe(250);
  });
  it('rejects out-of-range and junk', () => {
    expect(parseWhole('0', 1, 20)).toBeNull();
    expect(parseWhole('21', 1, 20)).toBeNull();
    expect(parseWhole('-3', 1, 20)).toBeNull();
    expect(parseWhole('1e3', 1, 2000)).toBeNull();
  });
  it('clamps on blur', () => {
    expect(clampWholeText('', 1, 20)).toBe('1');
    expect(clampWholeText('99', 1, 20)).toBe('20');
    expect(clampWholeText('4.6', 1, 20)).toBe('5');
  });
});
