import { describe, expect, it } from 'vitest';
import { counterText, counterValid, counterValue } from './shopCounter';

describe('shop HAGGLE counter (B3)', () => {
  it('sends the pre-filled default when the player did not type', () => {
    expect(counterText(undefined, 100)).toBe('115');
    expect(counterValue(undefined, 100)).toBe(115);
    expect(counterValid(counterValue(undefined, 100), 100)).toBe(true);
  });
  it('uses what the player typed', () => {
    expect(counterValue('140.4', 100)).toBe(140);
  });
  it('treats a cleared field as invalid, never as 0', () => {
    expect(counterValue('', 100)).toBeNaN();
    expect(counterValid(counterValue('', 100), 100)).toBe(false);
    expect(counterValid(100, 100)).toBe(false);
  });
});
