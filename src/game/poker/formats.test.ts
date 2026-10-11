import { describe, expect, it } from 'vitest';
import { POOL_LEADERS } from './cardpool';
import { MODES, MODE_IDS } from './constants';
import { buildDeck, checkDeck, deckCardIds } from './deck';
import { FORMAT_IDS, formatTags, meetsFormat } from './formats';
import { rngOn } from './rng';

describe('constructed formats (R6)', () => {
  it('every Leader can fill a legal deck in every format and mode', () => {
    const short: string[] = [];
    for (const leader of POOL_LEADERS)
      for (const mode of MODE_IDS)
        for (const f of FORMAT_IDS) {
          const deck = buildDeck(leader, MODES[mode], rngOn({ rng: 11 }), undefined, f);
          const ids = deckCardIds(deck);
          expect(meetsFormat(f, leader.id, ids)).toBe(true);
          if (checkDeck(leader.id, ids, mode).issues.length)
            short.push(`${leader.name}/${mode}/${f}`);
        }
    expect(short).toEqual([]);
  });

  it('formatTags reads restrictions a deck already meets', () => {
    const leader = POOL_LEADERS[0];
    const deck = buildDeck(leader, MODES.quick, rngOn({ rng: 3 }), undefined, 'singleton');
    expect(formatTags(leader.id, deckCardIds(deck))).toContain('singleton');
  });
});
