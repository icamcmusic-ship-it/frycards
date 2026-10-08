/**
 * @vitest-environment jsdom
 *
 * Store: the shared tab strip (ARIA + remembered tab) and the
 * MY PACKS -> OPEN PACK -> OPEN NEXT PACK chain (audit §2.1 #9, #12).
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { POOL_V4 } from '../game/v3/cardpool';
import type { PackPull, PackType } from '../lib/supabase';

const openInventoryPack = vi.fn();

vi.mock('../lib/supabase', async (importActual) => ({
  ...(await importActual<typeof import('../lib/supabase')>()),
  openInventoryPack: (...a: unknown[]) => openInventoryPack(...a),
  getDailyBounties: async () => ({ data: [], error: null }),
}));

const pack = {
  id: 'p1',
  name: 'Test Booster',
  description: '',
  card_count: 3,
  guaranteed_rarity: null,
  image_url: null,
  open_image_url: null,
  foil_chance: 0,
  has_foil_slot: false,
  price_credits: 100,
  price_vouchers: null,
  pack_tier: 'standard',
  slot_config: [],
  is_active: true,
  acquisition: 'purchase',
  time_limited: false,
  pity_note: null,
  allowed_sets: null,
  pack_group: null,
  set_name: null,
} as unknown as PackType;

let inventoryQty = 2;
vi.mock('./MetaContext', () => ({
  useMeta: () => ({
    profile: { id: 'u1', credits: 1000, vouchers: 0, last_free_pack_at: null },
    packTypes: [pack],
    shopItems: [],
    cosmetics: [],
    inventory: [{ pack_type_id: 'p1', quantity: inventoryQty }],
    decks: [],
    serializedCards: [],
    refreshProfile: async () => {},
    refreshCollection: async () => {},
    refreshCosmetics: async () => {},
    refreshInventory: async () => {},
    refreshDecks: async () => {},
  }),
}));

// Imported after the mocks are registered.
const { StoreScreen } = await import('./StoreScreen');

const cards = POOL_V4.filter((c) => c.type !== 'Leader');
const result = (offset: number) => ({
  data: {
    packs_opened: 1,
    cards: cards.slice(offset, offset + 3).map((c, i): PackPull => ({
      card_id: c.id,
      name: c.name,
      rarity: c.rarity ?? 'Common',
      card_type: c.type,
      image_url: null,
      foil: false,
      slot: `s${i}`,
      converted_to_credits: false,
      credit_value: 0,
    })),
  },
  error: null,
});

beforeEach(() => {
  localStorage.clear();
  inventoryQty = 2;
  openInventoryPack.mockReset();
  document.documentElement.setAttribute('data-motion', 'reduced');
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};
});
afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-motion');
});

describe('store tabs', () => {
  test('is a tablist and the active tab is aria-selected', () => {
    render(<StoreScreen onBack={() => {}} />);
    expect(screen.getByRole('tablist', { name: 'Store sections' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'CARD PACKS' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByRole('tab', { name: /MY PACKS/ }).getAttribute('aria-selected')).toBe(
      'false',
    );
  });

  test('remembers the last tab across visits', () => {
    const first = render(<StoreScreen onBack={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /MY PACKS/ }));
    first.unmount();
    render(<StoreScreen onBack={() => {}} />);
    expect(screen.getByRole('tab', { name: /MY PACKS/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  test('a stale stored tab id falls back to the first tab', () => {
    localStorage.setItem('frycards:ui:store:tab', JSON.stringify('gone'));
    render(<StoreScreen onBack={() => {}} />);
    expect(screen.getByRole('tab', { name: 'CARD PACKS' }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});

describe('open next pack', () => {
  const finishReveal = async () => {
    fireEvent.click(await screen.findByRole('button', { name: 'JUST TEAR IT OPEN FOR ME' }));
    fireEvent.click(await screen.findByRole('button', { name: /REVEAL ALL/ }));
  };

  test('chains through owned packs and recaps the run', async () => {
    openInventoryPack.mockResolvedValueOnce(result(0)).mockResolvedValueOnce(result(3));
    render(<StoreScreen onBack={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /MY PACKS/ }));
    fireEvent.click(screen.getByRole('button', { name: /^OPEN PACK/ }));
    await finishReveal();

    // One more is left after the first, and the button says so.
    const next = await screen.findByRole('button', { name: /OPEN NEXT PACK \(1 LEFT\)/ });
    expect(screen.queryByLabelText('Session recap')).toBeNull();
    fireEvent.click(next);

    await waitFor(() => expect(openInventoryPack).toHaveBeenCalledTimes(2));
    await finishReveal();
    // That was the last owned pack: no further OPEN NEXT, and the recap covers both.
    expect(screen.queryByRole('button', { name: /OPEN NEXT PACK/ })).toBeNull();
    expect(screen.getByLabelText('Session recap').textContent).toContain('2 PACKS');
  });

  test('a single owned pack offers no OPEN NEXT', async () => {
    inventoryQty = 1;
    openInventoryPack.mockResolvedValueOnce(result(0));
    render(<StoreScreen onBack={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /MY PACKS/ }));
    fireEvent.click(screen.getByRole('button', { name: /^OPEN PACK/ }));
    await finishReveal();
    await screen.findByRole('button', { name: /DONE/ });
    expect(screen.queryByRole('button', { name: /OPEN NEXT PACK/ })).toBeNull();
  });

  test('a failed fetch keeps the summary and shows the error', async () => {
    openInventoryPack
      .mockResolvedValueOnce(result(0))
      .mockResolvedValueOnce({ data: null, error: 'No unopened packs left.' });
    render(<StoreScreen onBack={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /MY PACKS/ }));
    fireEvent.click(screen.getByRole('button', { name: /^OPEN PACK/ }));
    await finishReveal();
    fireEvent.click(await screen.findByRole('button', { name: /OPEN NEXT PACK/ }));
    await waitFor(() =>
      expect(screen.getAllByText('No unopened packs left.').length).toBeGreaterThan(0),
    );
    expect(screen.getByRole('button', { name: /OPEN NEXT PACK/ })).toBeTruthy();
  });
});
