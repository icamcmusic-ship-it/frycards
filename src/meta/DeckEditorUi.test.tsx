/**
 * @vitest-environment jsdom
 *
 * Deck editor: the cost curve renders real bars (audit M4), the legality
 * banner is one line with a one-click colour fix (audit #10), and edits can be
 * undone.
 */
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { MetaContext, type MetaState } from './MetaContext';
import { CostCurve, DeckBuilderScreen } from './DeckBuilderScreen';
import { curveBarHeight, legalitySummary, pushUndo, UNDO_LIMIT } from './deckEdits';
import { POOL_V4 } from '../game/v3/cardpool';
import { LEADER_COLORS, isColorLegal } from '../game/v3/colors';

afterEach(cleanup);

beforeEach(() => {
  localStorage.clear();
  // Phone-width by default: matchMedia reports `max-width: 639px` as a match.
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
});

describe('cost curve (audit M4)', () => {
  test('every bucket with cards gets a visible bar, scaled to the tallest', () => {
    render(<CostCurve curve={{ '1': 2, '3': 8, '7+': 1 }} max={8} />);
    const h = (b: string) => parseInt(screen.getByTestId(`curve-bar-${b}`).style.height, 10);
    expect(h('3')).toBe(56);
    expect(h('1')).toBe(14);
    // One card is still a visible stub, not the 2px of an empty bucket.
    expect(h('7+')).toBeGreaterThanOrEqual(4);
    expect(h('0')).toBeLessThan(h('7+'));
  });

  test('prints the count above each bar and leaves empty buckets blank', () => {
    render(<CostCurve curve={{ '2': 5 }} max={5} />);
    expect(screen.getByRole('img', { name: /5 at 2/ })).toBeTruthy();
    const col = screen.getByTestId('curve-bar-2').parentElement!;
    expect(within(col).getByText('5')).toBeTruthy();
    expect(screen.getByTestId('curve-bar-4').parentElement!.textContent).toBe('4');
  });

  test('bar heights are pixels, not a percentage of an indefinite parent', () => {
    expect(curveBarHeight(0, 10, 56)).toBe(2);
    expect(curveBarHeight(10, 10, 56)).toBe(56);
    expect(curveBarHeight(1, 100, 56)).toBe(4);
    expect(curveBarHeight(3, 0, 56)).toBe(56);
  });
});

describe('undo history', () => {
  test('is capped', () => {
    let h: string[][] = [];
    for (let i = 0; i < UNDO_LIMIT + 20; i++) h = pushUndo(h, [String(i)]);
    expect(h).toHaveLength(UNDO_LIMIT);
    expect(h[h.length - 1]).toEqual([String(UNDO_LIMIT + 19)]);
  });
});

describe('legality summary', () => {
  test('off-colour cards collapse to one headline, other issues are counted', () => {
    const s = legalitySummary(
      [
        { text: 'a is outside x', kind: 'colour' },
        { text: 'b is outside x', kind: 'colour' },
        { text: 'Deck must be at least 60 cards (currently 3).' },
      ],
      41,
      'Maelstrom',
    );
    expect(s.headline).toBe("41 cards outside Maelstrom's colours");
    expect(s.others).toHaveLength(1);
    expect(s.hasDetails).toBe(true);
  });

  test('without colour problems the first issue leads', () => {
    const s = legalitySummary([{ text: 'one' }, { text: 'two' }, { text: 'three' }], 0, 'L');
    expect(s.headline).toBe('one');
    expect(s.others.map((i) => i.text)).toEqual(['two', 'three']);
  });
});

// ---- the editor itself ----------------------------------------------------

const leader = POOL_V4.find(
  (c) => c.type === 'Leader' && (LEADER_COLORS[c.id] ?? []).length === 2,
)!;
const identity = LEADER_COLORS[leader.id];
const nonLeaders = POOL_V4.filter((c) => c.type !== 'Leader');
const legal = nonLeaders.filter((c) => isColorLegal(c, identity)).slice(0, 4);
const off = nonLeaders.filter((c) => !isColorLegal(c, identity)).slice(0, 3);

function renderEditor(cardIds: string[]) {
  const noop = async () => undefined;
  const meta = {
    session: { user: { id: 'u' } },
    guest: false,
    loading: false,
    bootError: null,
    retryBoot: () => undefined,
    dataLoading: false,
    profile: null,
    shopItems: [],
    packTypes: [],
    collection: [leader, ...legal, ...off].map((c) => ({
      card_id: c.id,
      quantity: 3,
      foil_quantity: 0,
    })),
    cosmetics: [],
    decks: [
      {
        id: 'd1',
        user_id: 'u',
        name: 'Test Deck',
        leader_id: leader.id,
        card_ids: cardIds,
        is_valid: false,
        updated_at: new Date(0).toISOString(),
      },
    ],
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
  render(
    <MetaContext.Provider value={meta}>
      <DeckBuilderScreen onBack={() => undefined} />
    </MetaContext.Provider>,
  );
}

describe('deck editor', () => {
  test('one-line banner with a clickable fix; the fix is undoable', async () => {
    const user = userEvent.setup();
    renderEditor([...legal.map((c) => c.id), ...off.map((c) => c.id)]);
    await user.click(screen.getByRole('button', { name: 'EDIT' }));

    const banner = screen.getByText(`${off.length} cards outside ${leader.name}'s colours`, {
      exact: false,
    });
    expect(banner).toBeTruthy();
    const fix = screen.getByRole('button', { name: /remove off-colour cards/i });
    await user.click(fix);

    // The colour problem is gone (the 60-card minimum still shows).
    expect(screen.queryByRole('button', { name: /remove off-colour cards/i })).toBeNull();
    expect(screen.queryByText(/outside .*'s colours/)).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Undo last deck edit' }));
    expect(screen.getByRole('button', { name: /remove off-colour cards/i })).toBeTruthy();
    // Nothing left to undo.
    expect(
      (screen.getByRole('button', { name: 'Undo last deck edit' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  test('on a phone the deck panel is a sheet that starts collapsed', async () => {
    const user = userEvent.setup();
    renderEditor(legal.map((c) => c.id));
    await user.click(screen.getByRole('button', { name: 'EDIT' }));
    const handle = screen.getByRole('button', { name: /^DECK/ });
    expect(handle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('tablist', { name: 'Deck panel' })).toBeNull();
    await user.click(handle);
    expect(screen.getByRole('tablist', { name: 'Deck panel' })).toBeTruthy();
    // Remembered for the next visit.
    expect(localStorage.getItem('frycards:ui:deck.sheetOpen')).toBe('true');
  });

  test('every filter select has a visible label', async () => {
    const user = userEvent.setup();
    renderEditor([]);
    await user.click(screen.getByRole('button', { name: 'EDIT' }));
    for (const label of ['Type', 'Cost']) {
      const select = screen.getByLabelText(label);
      expect(select.tagName).toBe('SELECT');
      expect(select.closest('label')!.textContent).toContain(label);
    }
  });
});
