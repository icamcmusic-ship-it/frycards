import { describe, expect, test } from 'vitest';
import { dailySetup } from './PlayScreen';
import { checkDeck } from '../game/poker/deck';

describe('Daily Table (Q15)', () => {
  test('same day, same table; unrewarded with a fixed seed and a legal deck', () => {
    const a = dailySetup('2026-10-11');
    const b = dailySetup('2026-10-11');
    expect(a).toEqual(b);
    expect(a.unrewarded).toBe(true);
    expect(typeof a.seed).toBe('number');
    expect(dailySetup('2026-10-12').seed).not.toBe(a.seed);
    if (a.kind !== 'custom') throw new Error('custom expected');
    expect(checkDeck(a.deck.leader_id, a.deck.card_ids, 'standard').issues).toEqual([]);
  });
});
