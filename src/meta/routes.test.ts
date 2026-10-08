import { describe, expect, test } from 'vitest';
import { META_SCREENS, canEnterScreen, parseHash, resolveRoute, serializeRoute } from './routes';
import { isCpuLocked } from './cpuAccess';

describe('parseHash / serializeRoute', () => {
  test('parses a screen and its sub-path', () => {
    expect(parseHash('#/store')).toEqual({ screen: 'store', sub: [] });
    expect(parseHash('#/store/packs')).toEqual({ screen: 'store', sub: ['packs'] });
    expect(parseHash('#/market/mine/active/')).toEqual({
      screen: 'market',
      sub: ['mine', 'active'],
    });
  });

  test('ignores a query string inside the hash', () => {
    expect(parseHash('#/store/packs?x=1')).toEqual({ screen: 'store', sub: ['packs'] });
  });

  test('anything that is not a known screen is null, never a guess', () => {
    expect(parseHash('')).toBeNull();
    expect(parseHash('#')).toBeNull();
    expect(parseHash('#top')).toBeNull();
    expect(parseHash('#/')).toBeNull();
    expect(parseHash('#/nope')).toBeNull();
    // A match is not a screen: a hash can never put the player back in a game.
    expect(parseHash('#/match')).toBeNull();
    expect(parseHash('#/game/123')).toBeNull();
  });

  test('round-trips every screen, with encoded sub-segments', () => {
    for (const screen of META_SCREENS) {
      expect(parseHash(serializeRoute({ screen, sub: [] }))).toEqual({ screen, sub: [] });
    }
    const route = { screen: 'collection' as const, sub: ['a b', 'c/d'] };
    expect(serializeRoute(route)).toBe('#/collection/a%20b/c%2Fd');
    expect(parseHash(serializeRoute(route))).toEqual(route);
  });

  test('survives malformed percent-encoding', () => {
    expect(parseHash('#/store/%E0%A4%A')).toEqual({ screen: 'store', sub: ['%E0%A4%A'] });
  });
});

describe('access rules', () => {
  const account = { guest: false, cpuLocked: false };
  const lockedAccount = { guest: false, cpuLocked: true };
  const guest = { guest: true, cpuLocked: false };

  test('guests cannot open account-only screens but can open the public ones', () => {
    for (const s of ['store', 'collection', 'decks', 'market', 'profile'] as const) {
      expect(canEnterScreen(s, guest)).toBe(false);
      expect(canEnterScreen(s, account)).toBe(true);
    }
    for (const s of ['menu', 'play', 'showroom', 'social', 'howtoplay', 'settings'] as const) {
      expect(canEnterScreen(s, guest)).toBe(true);
    }
  });

  test('CPU play is refused while locked, and nothing else is', () => {
    expect(canEnterScreen('play', lockedAccount)).toBe(false);
    expect(canEnterScreen('store', lockedAccount)).toBe(true);
  });

  test('resolveRoute sends a locked link to the menu and leaves open ones alone', () => {
    expect(resolveRoute({ screen: 'store', sub: ['packs'] }, guest)).toEqual({
      screen: 'menu',
      sub: [],
    });
    expect(resolveRoute({ screen: 'play', sub: [] }, lockedAccount).screen).toBe('menu');
    const open = { screen: 'store' as const, sub: ['packs'] };
    expect(resolveRoute(open, account)).toBe(open);
  });
});

describe('isCpuLocked', () => {
  test('guests keep quick match, only the creator account is unlocked', () => {
    expect(isCpuLocked(null, true)).toBe(false);
    expect(isCpuLocked({ role: 'creator' }, false)).toBe(false);
    expect(isCpuLocked({ role: 'player' }, false)).toBe(true);
    expect(isCpuLocked(null, false)).toBe(true);
  });
});
