/**
 * @vitest-environment jsdom
 *
 * The pack-opening flow's input contract (audit §2.1 #12): tapping the pack is
 * the primary way in, the "just open it" fallback is a real button, the copy
 * matches the device, NEXT is never a dead disabled control, and the summary
 * can chain into the next owned pack.
 */
import type { ComponentProps } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { POOL_V4 } from '../game/v3/cardpool';
import type { PackPull } from '../lib/supabase';
import { PackOpening } from './PackOpening';

// The summary stage reads refresh callbacks from MetaContext; the provider
// isn't mounted here and nothing in these tests sells a card.
vi.mock('./MetaContext', () => ({
  useMeta: () => ({ refreshCollection: () => {}, refreshProfile: () => {} }),
}));

function stubPointer(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('pointer: coarse') ? coarse : false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const cards = POOL_V4.filter((c) => c.type !== 'Leader');
const makePulls = (n: number): PackPull[] =>
  cards.slice(0, n).map((c, i) => ({
    card_id: c.id,
    name: c.name,
    rarity: c.rarity ?? 'Common',
    card_type: c.type,
    image_url: null,
    foil: false,
    slot: `slot-${i}`,
    converted_to_credits: false,
    credit_value: 0,
  }));

beforeEach(() => {
  localStorage.clear();
  // Reduced motion shortens the tear to 120ms, so tests don't sit through 850.
  document.documentElement.setAttribute('data-motion', 'reduced');
  stubPointer(false);
  // jsdom has no media playback; some cards carry video art (VisibleVideo).
  window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  window.HTMLMediaElement.prototype.pause = () => {};
});
afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-motion');
});

const mount = (props: Partial<ComponentProps<typeof PackOpening>> = {}) =>
  render(
    <PackOpening
      packName="Test Pack"
      packImageUrl={null}
      pulls={makePulls(3)}
      onDone={() => {}}
      {...props}
    />,
  );

describe('tear stage', () => {
  test('says CLICK with a mouse and TAP on a touch device', () => {
    mount();
    expect(screen.getByText('CLICK THE PACK')).toBeTruthy();
    cleanup();
    stubPointer(true);
    mount();
    expect(screen.getByText('TAP THE PACK')).toBeTruthy();
  });

  test('tapping the pack opens it', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /to open Test Pack/i }));
    await waitFor(() => expect(screen.getByText(/CARD 1 \/ 3/)).toBeTruthy());
  });

  test('the fallback is a real button and does the same thing', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'JUST TEAR IT OPEN FOR ME' }));
    await waitFor(() => expect(screen.getByText(/CARD 1 \/ 3/)).toBeTruthy());
  });

  test('SKIP TO SUMMARY only appears for a multi-open', () => {
    mount();
    expect(screen.queryByRole('button', { name: /SKIP TO SUMMARY/ })).toBeNull();
    cleanup();
    mount({ packsOpened: 5, pulls: makePulls(20) });
    fireEvent.click(screen.getByRole('button', { name: /SKIP TO SUMMARY/ }));
    expect(screen.getByRole('button', { name: /DONE/ })).toBeTruthy();
  });
});

describe('reveal stage', () => {
  const toReveal = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'JUST TEAR IT OPEN FOR ME' }));
    await waitFor(() => expect(screen.getByText(/CARD 1 \/ 3/)).toBeTruthy());
  };

  test('the primary button is always live: FLIP CARD, then NEXT', async () => {
    mount();
    await toReveal();
    const primary = screen.getByRole('button', { name: 'FLIP CARD' }) as HTMLButtonElement;
    expect(primary.disabled).toBe(false);
    expect(screen.getByText(/TO FLIP/).textContent).toContain('CLICK');
    fireEvent.click(primary);
    const next = screen.getByRole('button', { name: /NEXT/ }) as HTMLButtonElement;
    expect(next.disabled).toBe(false);
    expect(screen.getByText(/TO CONTINUE/).textContent).toContain('CLICK');
  });

  test('uses TAP wording on a touch device', async () => {
    stubPointer(true);
    mount();
    await toReveal();
    expect(screen.getByText(/TO FLIP/).textContent).toContain('TAP');
  });
});

describe('summary stage', () => {
  const toSummary = async () => {
    fireEvent.click(screen.getByRole('button', { name: 'JUST TEAR IT OPEN FOR ME' }));
    await waitFor(() => screen.getByText(/CARD 1 \/ 3/));
    fireEvent.click(screen.getByRole('button', { name: /REVEAL ALL/ }));
  };

  test('offers OPEN NEXT PACK when more are owned, and calls back', async () => {
    const onOpenNext = vi.fn();
    mount({ onOpenNext, nextLabel: 'OPEN NEXT PACK (2 LEFT) ▸' });
    await toSummary();
    fireEvent.click(screen.getByRole('button', { name: 'OPEN NEXT PACK (2 LEFT) ▸' }));
    expect(onOpenNext).toHaveBeenCalledTimes(1);
  });

  test('has no OPEN NEXT PACK button when nothing more is owned', async () => {
    mount();
    await toSummary();
    expect(screen.queryByRole('button', { name: /OPEN NEXT PACK/ })).toBeNull();
  });

  test('the next button is disabled while the next pack is being fetched', async () => {
    mount({ onOpenNext: () => {}, nextBusy: true });
    await toSummary();
    expect((screen.getByRole('button', { name: 'OPENING…' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  test('recaps the run only once there is more than one pack in it', async () => {
    mount();
    await toSummary();
    expect(screen.queryByLabelText('Session recap')).toBeNull();
    cleanup();
    mount({ priorPulls: [makePulls(2)] });
    await toSummary();
    const recap = screen.getByLabelText('Session recap');
    expect(recap.textContent).toContain('2 PACKS');
    expect(recap.textContent).toContain('5 CARDS');
    expect(recap.textContent).toContain('quicksell value kept');
  });

  test('a failed next-pack fetch surfaces its error on the summary', async () => {
    mount({ onOpenNext: () => {}, nextError: 'No unopened packs left.' });
    await toSummary();
    expect(screen.getByText('No unopened packs left.')).toBeTruthy();
  });
});
