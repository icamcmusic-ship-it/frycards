/**
 * @vitest-environment jsdom
 *
 * Battle Pass: unclaimed tiers lead, CLAIM ALL claims them in order and stops
 * on the first failure, and the first claimable tier is scrolled into view
 * (audit §2.1 #14).
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import type { BattlePassTier } from '../lib/supabase';

const claimBpTier = vi.fn();
const fetchBattlePassProgress = vi.fn();
const refreshProfile = vi.fn(async () => {});

const tiers: BattlePassTier[] = [1, 2, 3, 4, 5, 6].map((tier) => ({
  id: `t${tier}`,
  season_id: 's1',
  tier,
  reward_type: 'credits',
  amount: tier * 10,
  pack_type_id: null,
  shop_item_id: null,
  label: `Reward ${tier}`,
}));

vi.mock('../lib/supabase', async (importActual) => ({
  ...(await importActual<typeof import('../lib/supabase')>()),
  fetchActiveSeason: async () => ({
    season: {
      id: 's1',
      number: 1,
      name: 'Blue Coral',
      is_active: true,
      is_free: true,
      starts_at: '2026-01-01',
      ends_at: null,
    },
    tiers,
  }),
  fetchBattlePassProgress: (...a: unknown[]) => fetchBattlePassProgress(...a),
  claimBpTier: (...a: unknown[]) => claimBpTier(...a),
}));

vi.mock('./MetaContext', () => ({
  useMeta: () => ({
    session: { user: { id: 'u1' } },
    packTypes: [],
    shopItems: [],
    refreshProfile,
    refreshInventory: async () => {},
    refreshCosmetics: async () => {},
  }),
}));

const { BattlePassScreen } = await import('./BattlePassScreen');

/** 100 XP per tier: 450 XP unlocks tiers 1-4; tier 1 is already claimed. */
const progress = { season_id: 's1', xp: 450, claimed_tiers: [1] };

const scrollIntoView = vi.fn();

beforeEach(() => {
  localStorage.clear();
  claimBpTier.mockReset();
  refreshProfile.mockClear();
  scrollIntoView.mockClear();
  fetchBattlePassProgress.mockReset();
  fetchBattlePassProgress.mockResolvedValue({ ...progress });
  Element.prototype.scrollIntoView = scrollIntoView;
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

const tierNumbers = (region: HTMLElement) =>
  within(region)
    .getAllByText(/^TIER \d+$/)
    .map((e) => e.textContent);

describe('layout', () => {
  test('ready tiers come first, then locked ones; claimed are folded away', async () => {
    render(<BattlePassScreen onBack={() => {}} />);
    const ready = await screen.findByRole('region', { name: 'Ready to claim' });
    expect(tierNumbers(ready)).toEqual(['TIER 2', 'TIER 3', 'TIER 4']);
    expect(tierNumbers(screen.getByRole('region', { name: 'Coming up' }))).toEqual([
      'TIER 5',
      'TIER 6',
    ]);
    // The claimed tier is behind a toggle, not leading the track.
    expect(screen.queryByText('TIER 1')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /CLAIMED \(1\)/ }));
    expect(screen.getByText('TIER 1')).toBeTruthy();
  });

  test('scrolls the first claimable tier into view once loaded', async () => {
    render(<BattlePassScreen onBack={() => {}} />);
    await screen.findByRole('region', { name: 'Ready to claim' });
    await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
  });

  test('does not scroll when nothing is claimable', async () => {
    fetchBattlePassProgress.mockResolvedValue({ season_id: 's1', xp: 50, claimed_tiers: [] });
    render(<BattlePassScreen onBack={() => {}} />);
    await screen.findByText(/COMING UP/);
    expect(scrollIntoView).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /CLAIM ALL/ })).toBeNull();
  });
});

describe('CLAIM ALL', () => {
  test('claims every ready tier in order and refreshes once', async () => {
    claimBpTier.mockResolvedValue(null);
    render(<BattlePassScreen onBack={() => {}} />);
    fireEvent.click((await screen.findAllByRole('button', { name: /CLAIM ALL \(3\)/ }))[0]);
    await screen.findByText('Claimed 3 tiers.');
    expect(claimBpTier.mock.calls.map((c) => c[1])).toEqual([2, 3, 4]);
    expect(refreshProfile).toHaveBeenCalledTimes(1);
    // Everything ready is now claimed, so the ready section is gone.
    expect(screen.queryByRole('region', { name: 'Ready to claim' })).toBeNull();
  });

  test('stops on the first failure and reports how far it got', async () => {
    claimBpTier.mockImplementation(async (_s: string, tier: number) =>
      tier === 3 ? 'Not enough XP' : null,
    );
    render(<BattlePassScreen onBack={() => {}} />);
    fireEvent.click((await screen.findAllByRole('button', { name: /CLAIM ALL \(3\)/ }))[0]);
    await screen.findByText('Claimed 1 of 3 before stopping at tier 3: Not enough XP');
    expect(claimBpTier).toHaveBeenCalledTimes(2);
    // The server's truth is re-read after a failure.
    await waitFor(() => expect(fetchBattlePassProgress).toHaveBeenCalledTimes(2));
  });
});
