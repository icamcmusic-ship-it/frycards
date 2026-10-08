/**
 * @vitest-environment jsdom
 *
 * Collection screen: search/filters come first, the heavy panels start
 * folded, the choices stick, and empty states point somewhere.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('./grading', async (orig) => ({
  ...(await orig<typeof import('./grading')>()),
  fetchGradedCards: async () => [],
}));
vi.mock('./wishlist', async (orig) => ({
  ...(await orig<typeof import('./wishlist')>()),
  syncWishlist: async () => new Set<string>(),
  pushWishlistToggle: async () => undefined,
}));

import { MetaContext, type MetaState } from './MetaContext';
import { CollectionScreen } from './CollectionScreen';
import { POOL_V4 } from '../game/v3/cardpool';

afterEach(cleanup);
beforeEach(() => {
  localStorage.clear();
  window.matchMedia = ((query: string) => ({
    matches: query.includes('max-width'),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
  window.HTMLElement.prototype.scrollIntoView = () => undefined;
  // jsdom does not implement media playback; the card art's <video> calls play().
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => undefined;
});

function mount(opts: { owned?: number; onGrading?: () => void } = {}) {
  const noop = async () => undefined;
  const owned = POOL_V4.slice(0, opts.owned ?? 6);
  const meta = {
    session: { user: { id: 'u1' } },
    guest: false,
    loading: false,
    bootError: null,
    retryBoot: () => undefined,
    dataLoading: false,
    profile: { id: 'u1', username: 'u', credits: 10, vouchers: 0, showcase_cards: [] },
    shopItems: [],
    packTypes: [],
    collection: owned.map((c) => ({ card_id: c.id, quantity: 1, foil_quantity: 0 })),
    cosmetics: [],
    decks: [],
    inventory: [],
    serializedCards: [],
    setGuest: () => undefined,
    refreshProfile: noop,
    refreshCollection: noop,
    refreshCosmetics: noop,
    refreshDecks: noop,
    refreshInventory: noop,
    refreshShopItems: noop,
    refreshPackTypes: noop,
    signOut: noop,
  } as unknown as MetaState;
  return render(
    <MetaContext.Provider value={meta}>
      <CollectionScreen onBack={() => undefined} onGrading={opts.onGrading} />
    </MetaContext.Provider>,
  );
}

describe('CollectionScreen', () => {
  test('search and filters come before the progress and showcase panels', () => {
    mount();
    const filters = screen.getByRole('complementary', { name: 'Search and filters' });
    const progress = screen.getByRole('button', { name: /COLLECTION PROGRESS/ });
    expect(within(filters).getByLabelText('Search cards')).toBeTruthy();
    // DOCUMENT_POSITION_FOLLOWING: the progress panel is after the filter bar.
    expect(
      filters.compareDocumentPosition(progress) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  test('progress and showcase start folded and remember being opened', async () => {
    const user = userEvent.setup();
    mount();
    const progress = screen.getByRole('button', { name: /COLLECTION PROGRESS/ });
    const showcase = screen.getByRole('button', { name: /MY SHOWCASE/ });
    expect(progress.getAttribute('aria-expanded')).toBe('false');
    expect(showcase.getAttribute('aria-expanded')).toBe('false');
    await user.click(showcase);
    expect(showcase.getAttribute('aria-expanded')).toBe('true');
    cleanup();
    mount();
    expect(screen.getByRole('button', { name: /MY SHOWCASE/ }).getAttribute('aria-expanded')).toBe(
      'true',
    );
  });

  test('the empty showcase offers Pin cards, which resets the filters and says what to do', async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole('tab', { name: /FULL SET/ }));
    await user.click(screen.getByRole('button', { name: /MY SHOWCASE/ }));
    await user.click(screen.getByRole('button', { name: /PIN CARDS/ }));
    expect(screen.getByRole('tab', { name: /OWNED/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('status').textContent).toContain('ADD TO SHOWCASE');
  });

  test('the view tab is a real tablist and is remembered', async () => {
    const user = userEvent.setup();
    mount();
    expect(screen.getByRole('tablist', { name: 'Collection view' })).toBeTruthy();
    await user.click(screen.getByRole('tab', { name: /FULL SET/ }));
    expect(JSON.parse(localStorage.getItem('frycards:ui:collection.filters')!).view).toBe('all');
    cleanup();
    mount();
    expect(screen.getByRole('tab', { name: /FULL SET/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });

  test('a saved filter preset can be created, applied and deleted', async () => {
    const user = userEvent.setup();
    mount();
    await user.selectOptions(screen.getByLabelText('Rarity'), 'Common');
    await user.click(screen.getByRole('button', { name: /SAVE CURRENT FILTERS/ }));
    await user.click(screen.getByRole('button', { name: 'SAVE' }));
    expect(screen.getByRole('button', { name: 'Common' })).toBeTruthy();
    await user.selectOptions(screen.getByLabelText('Rarity'), 'All');
    await user.click(screen.getByRole('button', { name: 'Common' }));
    expect((screen.getByLabelText('Rarity') as HTMLSelectElement).value).toBe('Common');
    await user.click(screen.getByRole('button', { name: 'Delete saved filter Common' }));
    expect(screen.queryByRole('button', { name: 'Common' })).toBeNull();
  });

  test('every filter select has a visible label', () => {
    mount();
    for (const l of ['Type', 'Rarity', 'Colour', 'Keyword', 'Sort by']) {
      expect(screen.getByLabelText(l).closest('label')!.textContent).toContain(l);
    }
  });

  test('an empty collection says so and an empty filtered grid offers a way out', async () => {
    const user = userEvent.setup();
    mount({ owned: 0 });
    expect(screen.getByText(/Your collection is empty/)).toBeTruthy();
    cleanup();
    mount({ owned: 3 });
    await user.click(screen.getByRole('tab', { name: /WISHLIST/ }));
    expect(screen.getByText(/Nothing on your wishlist yet/)).toBeTruthy();
  });
});
