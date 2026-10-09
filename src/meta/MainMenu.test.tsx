/**
 * @vitest-environment jsdom
 *
 * Menu ordering rules (audit §2.1 #7): a locked PLAY must not be the first,
 * biggest tile; it comes after the live ones and still leads somewhere.
 */
import React from 'react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

vi.mock('../lib/supabase', () => ({
  supabase: {},
  fetchMissions: () => Promise.resolve([]),
  fetchAchievements: () => Promise.resolve({ all: [], mine: [] }),
  claimDailyLogin: () => Promise.resolve({ data: null, error: 'x' }),
  fetchCardMarketValue: () => Promise.resolve(null),
}));
vi.mock('./CardOfTheDay', () => ({ CardOfTheDay: () => null }));

import { MainMenu } from './MainMenu';
import { MetaContext, MetaState } from './MetaContext';

const profile = (role: string) => ({
  id: 'u1',
  username: 'Tester',
  role,
  level: 1,
  xp: 0,
  credits: 10,
  vouchers: 0,
  wins: 0,
  losses: 0,
  last_login_claim_at: null,
  login_streak: 0,
});

function mount(meta: Partial<MetaState>, onNavigate = vi.fn()) {
  const value = {
    guest: false,
    shopItems: [],
    signOut: () => Promise.resolve(),
    refreshProfile: () => Promise.resolve(),
    refreshInventory: () => Promise.resolve(),
    ...meta,
  } as unknown as MetaState;
  render(
    <MetaContext.Provider value={value}>
      <MainMenu onNavigate={onNavigate} />
    </MetaContext.Provider>,
  );
  return onNavigate;
}

/** Tile labels in DOM order (the big heading inside each tile button). */
const tileLabels = () =>
  Array.from(document.querySelectorAll('button .heading-font.leading-tight')).map((e) =>
    e.textContent?.trim(),
  );

afterEach(cleanup);

describe('MainMenu tile order', () => {
  test('a locked account sees PLAY after every live tile, and it opens How to Play', () => {
    const onNavigate = mount({ profile: profile('player') as never });
    const labels = tileLabels();
    expect(labels[0]).toBe('COLLECTION');
    expect(labels.at(-1)).toBe('PLAY');
    expect(screen.getByText('COMING SOON!')).toBeTruthy();

    fireEvent.click(screen.getByText('PLAY').closest('button')!);
    expect(onNavigate).toHaveBeenCalledWith('howtoplay');
  });

  test('the creator account keeps PLAY first, and it starts the play flow', () => {
    const onNavigate = mount({ profile: profile('creator') as never });
    expect(tileLabels()[0]).toBe('PLAY');
    expect(screen.queryByText('COMING SOON!')).toBeNull();
    fireEvent.click(screen.getByText('PLAY').closest('button')!);
    expect(onNavigate).toHaveBeenCalledWith('play');
  });

  test('a guest gets PLAY first, then the open tiles, then the account-only ones', () => {
    const onNavigate = mount({ guest: true, profile: null });
    const labels = tileLabels();
    expect(labels[0]).toBe('PLAY');
    expect(labels.indexOf('3D SHOWROOM')).toBeLessThan(labels.indexOf('COLLECTION'));
    // account-only tiles stay inert
    fireEvent.click(screen.getByText('STORE').closest('button')!);
    expect(onNavigate).not.toHaveBeenCalled();
  });

  test('utility shortcuts are one labelled icon row', () => {
    mount({ profile: profile('player') as never });
    const bar = screen.getByRole('toolbar', { name: 'Menu shortcuts' });
    const names = Array.from(bar.querySelectorAll('button')).map((b) =>
      b.getAttribute('aria-label'),
    );
    expect(names).toEqual(['How to play', 'News', 'Changelog', 'Settings', 'Sign out']);
  });
});
