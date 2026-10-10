import { describe, expect, it } from 'vitest';
import { POOL, POOL_LEADERS, poolByType } from '../game/poker/cardpool';
import { isColorLegal } from '../game/poker/colors';
import { MODES } from '../game/poker/constants';
import { checkDeck } from '../game/poker/deck';
import { rngOn } from '../game/poker/rng';
import { convertRetiredList } from './deckEdits';

/** A stand-in for claim_deck_box's 60-card grant: 12 Locations plus 48
 * Units/Items/Events, all inside the Leader's colours, with some repeats. */
function retiredList(leaderIdx: number): { leaderId: string; ids: string[] } {
  const leader = POOL_LEADERS[leaderIdx];
  const legal = (t: string) => poolByType(t).filter((c) => isColorLegal(c, leader.colors));
  const locs = legal('Location').slice(0, 12);
  const powers = [...legal('Unit'), ...legal('Item'), ...legal('Event')];
  const ids = [...locs.map((c) => c.id)];
  for (let i = 0; ids.length < 60; i++) ids.push(powers[i % powers.length].id);
  return { leaderId: leader.id, ids };
}

describe('convertRetiredList (Deck Box)', () => {
  it('rebuilds a 60-card grant as a legal Standard poker deck', () => {
    for (let k = 0; k < POOL_LEADERS.length; k++) {
      const { leaderId, ids } = retiredList(k);
      const leader = POOL_LEADERS[k];
      const out = convertRetiredList(leader, ids, MODES.standard, POOL, rngOn({ rng: 3 }));
      expect(checkDeck(leaderId, out, 'standard').issues, leader.name).toEqual([]);
    }
  });

  it('never uses a card more times than the list held it', () => {
    const { ids } = retiredList(0);
    const out = convertRetiredList(POOL_LEADERS[0], ids, MODES.standard, POOL, rngOn({ rng: 9 }));
    const have = new Map<string, number>();
    for (const id of ids) have.set(id, (have.get(id) ?? 0) + 1);
    const used = new Map<string, number>();
    for (const id of out) used.set(id, (used.get(id) ?? 0) + 1);
    for (const [id, n] of used) expect(n).toBeLessThanOrEqual(have.get(id) ?? 0);
  });
});
