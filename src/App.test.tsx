/**
 * @vitest-environment jsdom
 *
 * M7 / M8 regression tests for the app shell. The backend and the (huge) match
 * board are mocked: nothing here talks to Supabase.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function defer<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const mocks = vi.hoisted(() => ({
  beginMatch: vi.fn(),
  recordMatchPlacement: vi.fn(),
}));

vi.mock('./lib/supabase', () => ({
  beginMatch: mocks.beginMatch,
  recordMatchPlacement: mocks.recordMatchPlacement,
  fetchCardTemplates: () => Promise.resolve(null),
  supabase: {},
}));

// The table is large; a stub that exposes the shell's contract (the props App
// hands it) is all these tests need.
vi.mock('./components/PokerTable', () => ({
  PokerTable: (props: {
    onExit: () => void;
    onRematch?: () => void;
    onResult?: (r: { place: number; seats: number; mode: string }) => void;
    rewardPending?: boolean;
  }) => (
    <div>
      <button onClick={() => props.onResult?.({ place: 2, seats: 6, mode: 'standard' })}>
        FINISH
      </button>
      <button onClick={props.onExit}>EXIT</button>
      <button onClick={props.onRematch}>REMATCH</button>
      <span data-testid="pending">{String(!!props.rewardPending)}</span>
    </div>
  ),
}));

import { Game } from './App';
import { MetaContext, MetaState } from './meta/MetaContext';
import { ToastProvider } from './meta/toast';
import { PoolOfflineBanner } from './meta/PoolOfflineBanner';

const meta = {
  session: { user: { id: 'u1' } },
  guest: false,
  profile: { id: 'u1', username: 'Tester', role: 'player' },
  refreshProfile: () => Promise.resolve(),
} as unknown as MetaState;

function mountGame(onExit: () => void, onRematch: () => void) {
  return render(
    <MetaContext.Provider value={meta}>
      <ToastProvider>
        <React.Suspense fallback={null}>
          <Game
            setup={{ kind: 'random', mode: 'quick', seats: 3, difficulty: 'normal' }}
            onExit={onExit}
            onRematch={onRematch}
          />
        </React.Suspense>
      </ToastProvider>
    </MetaContext.Provider>,
  );
}

beforeEach(() => {
  mocks.beginMatch.mockReset().mockResolvedValue({ matchId: 'ticket-1', error: null });
  mocks.recordMatchPlacement.mockReset();
});
afterEach(cleanup);

describe('M8: leaving while the reward is being recorded', () => {
  test('REMATCH and EXIT wait for the result to be saved', async () => {
    const saving = defer<unknown>();
    mocks.recordMatchPlacement.mockReturnValue(saving.promise);
    const onExit = vi.fn();
    const onRematch = vi.fn();
    mountGame(onExit, onRematch);
    await screen.findByText('FINISH');

    fireEvent.click(screen.getByText('FINISH'));
    await waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('true'));
    expect(screen.getAllByText('Saving your reward…').length).toBeGreaterThan(0);

    // begin_match (what a rematch triggers) would delete this unredeemed ticket.
    fireEvent.click(screen.getByText('REMATCH'));
    fireEvent.click(screen.getByText('EXIT'));
    expect(onRematch).not.toHaveBeenCalled();
    expect(onExit).not.toHaveBeenCalled();
    expect(mocks.beginMatch).toHaveBeenCalledTimes(1);
    // Paid by place, with the table size and mode.
    expect(mocks.recordMatchPlacement).toHaveBeenCalledWith(2, 6, 'standard', 'ticket-1');

    await act(async () => {
      saving.resolve({ data: { credits_awarded: 100 }, error: null, status: null });
      await saving.promise;
    });
    await waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('false'));

    fireEvent.click(screen.getByText('REMATCH'));
    fireEvent.click(screen.getByText('EXIT'));
    expect(onRematch).toHaveBeenCalledTimes(1);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  test('a failed save also releases the buttons (and reports once it gave up)', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      mocks.recordMatchPlacement.mockResolvedValue({ data: null, error: 'network', status: null });
      const onExit = vi.fn();
      mountGame(onExit, vi.fn());
      await screen.findByText('FINISH');
      fireEvent.click(screen.getByText('FINISH'));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5000); // two 1.5s back-offs
      });
      await waitFor(() => expect(screen.getByTestId('pending').textContent).toBe('false'));
      expect(mocks.recordMatchPlacement).toHaveBeenCalledTimes(3);
      fireEvent.click(screen.getByText('EXIT'));
      expect(onExit).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('M7: the card-database RETRY', () => {
  test('is offered on the menu and hidden while a match is mounted', () => {
    const retry = vi.fn();
    const { rerender } = render(<PoolOfflineBanner matchMounted={false} onRetry={retry} />);
    fireEvent.click(screen.getByText('RETRY'));
    expect(retry).toHaveBeenCalledTimes(1);

    rerender(<PoolOfflineBanner matchMounted onRetry={retry} />);
    expect(screen.queryByText('RETRY')).toBeNull();
    // ...but the warning itself stays visible
    expect(screen.getByText(/Card database unavailable/)).toBeTruthy();
  });
});
