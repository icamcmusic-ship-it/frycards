/**
 * @vitest-environment jsdom
 *
 * Grading Lab: shared tab strip, visible selection state, and the sticky
 * summary bar that follows the player through all four steps (audit §2.1 #13).
 */
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { POOL } from '../game/poker/cardpool';

const card = POOL.find((c) => c.type !== 'Leader' && c.rarity === 'Rare')!;

vi.mock('./MetaContext', () => ({
  useMeta: () => ({
    profile: { id: 'u1', credits: 100000, vouchers: 500 },
    collection: [{ card_id: card.id, quantity: 4, foil_quantity: 0 }],
    decks: [],
    serializedCards: [],
    refreshProfile: async () => {},
    refreshCollection: async () => {},
    dataLoading: false,
  }),
}));

vi.mock('./grading', async (importActual) => ({
  ...(await importActual<typeof import('./grading')>()),
  fetchGradedCards: async () => [],
}));

const { GradingScreen } = await import('./GradingScreen');

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = ((q: string) => ({
    matches: false,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia;
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};
});
afterEach(cleanup);

// The card face itself, not the "Remove one …" steppers that share its name.
const pickCard = () =>
  fireEvent.click(document.querySelector(`[data-card-id="${card.id}"]`) as HTMLElement);

describe('grading tabs', () => {
  test('is a tablist with the active tab aria-selected', async () => {
    render(<GradingScreen onBack={() => {}} />);
    expect(screen.getByRole('tablist', { name: 'Grading sections' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'SUBMIT CARDS' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    await waitFor(() => screen.getByRole('tab', { name: /AT THE GRADERS/ }));
  });

  test('remembers the last tab', async () => {
    const first = render(<GradingScreen onBack={() => {}} />);
    fireEvent.click(screen.getByRole('tab', { name: /MY SLABS/ }));
    first.unmount();
    render(<GradingScreen onBack={() => {}} />);
    expect(screen.getByRole('tab', { name: /MY SLABS/ }).getAttribute('aria-selected')).toBe(
      'true',
    );
  });
});

describe('picking cards', () => {
  test('shows a count badge on a selected card and none before', () => {
    render(<GradingScreen onBack={() => {}} />);
    expect(screen.getByText(/4 spare/)).toBeTruthy();
    pickCard();
    pickCard();
    expect(screen.getByText(/2 of 4/)).toBeTruthy();
  });

  test('the list is not its own scroll box on a phone', () => {
    render(<GradingScreen onBack={() => {}} />);
    const list = screen.getByText(/4 spare/).closest('div')!.parentElement!;
    // Bounded scrolling only kicks in from `sm`, never at phone width.
    expect(list.className).toContain('grid-cols-3');
    expect(list.className).not.toMatch(/(^|\s)(max-h-|overflow-y-auto)/);
  });
});

describe('summary bar', () => {
  test('is absent for an empty tray and then reads "N CARDS · SERVICE · fee"', () => {
    render(<GradingScreen onBack={() => {}} />);
    expect(screen.queryByRole('button', { name: /SUBMIT/ })).toBeNull();
    pickCard();
    pickCard();
    pickCard();
    const submit = screen.getByRole('button', { name: /SUBMIT/ });
    expect((submit as HTMLButtonElement).disabled).toBe(false);
    const bar = submit.closest('.fixed') as HTMLElement;
    expect(bar.textContent).toMatch(/3 CARDS · KEEPER ·/);
  });

  test('its extras are folded into DETAILS and the choice is remembered', () => {
    const first = render(<GradingScreen onBack={() => {}} />);
    pickCard();
    expect(screen.queryByText(/EXPECTED BACK/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /DETAILS/ }));
    expect(screen.getByText(/EXPECTED BACK/)).toBeTruthy();
    const group = screen.getByRole('group', { name: 'Pay with' });
    expect(within(group).getAllByRole('button')).toHaveLength(2);
    first.unmount();
    render(<GradingScreen onBack={() => {}} />);
    pickCard();
    expect(screen.getByText(/EXPECTED BACK/)).toBeTruthy();
  });
});

describe('odds dialog (B7)', () => {
  test('is modal and closes on Escape', async () => {
    render(<GradingScreen onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /ODDS/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Grading odds' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Grading odds' })).toBeNull());
  });
});
