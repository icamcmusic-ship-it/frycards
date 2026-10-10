import { describe, expect, it } from 'vitest';
import { POOL_LEADERS } from './cardpool';
import { MODES, MODE_IDS } from './constants';
import { buildDeck, checkDeck, deckCardIds, legalModes } from './deck';
import { rngOn } from './rng';

describe('deck rules', () => {
  it('builds a legal deck for every Leader in every mode', () => {
    const rng = rngOn({ rng: 11 });
    for (const leader of POOL_LEADERS) {
      for (const mode of MODE_IDS) {
        const deck = buildDeck(leader, MODES[mode], rng);
        const check = checkDeck(leader.id, deckCardIds(deck), mode);
        expect(check.issues, `${leader.name} ${mode}`).toEqual([]);
      }
    }
  });

  it('CPU decks keep a curve and their share of revives', () => {
    const rng = rngOn({ rng: 23 });
    const revive = new Set(['Redraw', 'Windfall', 'Wild', 'Exhume']);
    for (const leader of POOL_LEADERS) {
      for (const mode of MODE_IDS) {
        const cfg = MODES[mode];
        const deck = buildDeck(leader, cfg, rng);
        const tier = (t: number) => deck.powers.filter((p) => p.tier === t).length;
        const revives = deck.powers.filter((p) => p.effect && revive.has(p.effect.kw)).length;
        expect(tier(4), `${leader.name} ${mode}`).toBeLessThanOrEqual(
          Math.max(1, Math.floor(cfg.powers * 0.125)),
        );
        expect(revives, `${leader.name} ${mode}`).toBe(Math.round(cfg.powers * 0.15));
      }
    }
  });

  it('flags the wrong count, a missing Location and too many copies', () => {
    const rng = rngOn({ rng: 2 });
    const leader = POOL_LEADERS[0];
    const deck = buildDeck(leader, MODES.standard, rng);
    const ids = deckCardIds(deck);
    expect(legalModes(leader.id, ids)).toEqual(['standard']);
    const kinds = (list: string[]) =>
      checkDeck(leader.id, list, 'standard').issues.map((i) => i.kind);
    expect(kinds(ids.slice(1))).toContain('location');
    expect(kinds(ids.slice(0, 10))).toContain('count');
    const p = ids[1];
    expect(kinds([...ids.slice(0, ids.length - 3), p, p, p])).toContain('copies');
  });

  it('old 60-card decks are illegal in every mode', () => {
    const rng = rngOn({ rng: 5 });
    const leader = POOL_LEADERS[1];
    const big = buildDeck(leader, { ...MODES.deep, powers: 59, maxCopies: 4, maxTier5: 9 }, rng);
    expect(legalModes(leader.id, deckCardIds(big))).toEqual([]);
  });
});
