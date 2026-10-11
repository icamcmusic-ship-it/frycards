import { describe, expect, test } from 'vitest';
import { POOL, POOL_BY_ID } from '../game/poker/cardpool';
import { legalModes } from '../game/poker/deck';
import { playWithCardSetup } from './playWithCard';

describe('Card of the Day: PLAY WITH IT (Q5)', () => {
  test('every pool card yields a legal deck carrying it, unrewarded', () => {
    let built = 0;
    for (const card of POOL) {
      const s = playWithCardSetup(card, '2026-10-11');
      if (!s) continue;
      built++;
      expect(s.unrewarded).toBe(true);
      if (s.kind !== 'custom') throw new Error('custom deck expected');
      const ids = s.deck.card_ids;
      if (card.type === 'Leader') expect(s.deck.leader_id).toBe(card.id);
      else expect(ids).toContain(card.id);
      expect(legalModes(s.deck.leader_id, ids), card.id).toContain('standard');
      expect(POOL_BY_ID[s.deck.leader_id]).toBeTruthy();
    }
    expect(built).toBeGreaterThan(POOL.length * 0.9);
  });
});
