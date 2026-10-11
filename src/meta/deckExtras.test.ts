// @vitest-environment jsdom
import { describe, expect, test } from 'vitest';
import { POOL_LEADERS } from '../game/poker/cardpool';
import { MODES } from '../game/poker/constants';
import { buildDeck, deckCardIds } from '../game/poker/deck';
import { rngOn } from '../game/poker/rng';
import {
  autoDeckName,
  loadDeckVersions,
  locationFit,
  plainTextDeck,
  pushDeckVersion,
  VERSION_DEPTH,
} from './deckExtras';

const leader = POOL_LEADERS[0];
const ids = deckCardIds(buildDeck(leader, MODES.standard, rngOn({ rng: 4 })));

describe('deck extras', () => {
  test('location fit names the Location', () => {
    expect(locationFit(ids)).toMatch(/\(.+\)/);
    expect(locationFit([])).toBeNull();
  });
  test('auto name: colours plus a theme, ≤ 40 chars', () => {
    const n = autoDeckName(leader.id, ids);
    expect(n.length).toBeLessThanOrEqual(40);
    expect(n).toContain(leader.colors[0]);
  });
  test('plain text lists counts and ends with the code', () => {
    const t = plainTextDeck(leader.id, ids, 'FRY2:x');
    expect(t).toContain(`Leader: ${leader.name}`);
    expect(t).toMatch(/Events \(\d+\): \d×/);
    expect(t.endsWith('FRY2:x')).toBe(true);
  });
  test('versions: a short ring, newest first, no duplicates in a row', () => {
    for (let i = 0; i < VERSION_DEPTH + 2; i++)
      pushDeckVersion('d1', { at: i, leader_id: 'L', card_ids: [String(i)] });
    pushDeckVersion('d1', { at: 99, leader_id: 'L', card_ids: [String(VERSION_DEPTH + 1)] });
    const v = loadDeckVersions('d1');
    expect(v).toHaveLength(VERSION_DEPTH);
    expect(v[0].at).toBe(VERSION_DEPTH + 1);
  });
});
