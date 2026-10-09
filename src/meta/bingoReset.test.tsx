/**
 * @vitest-environment jsdom
 *
 * Audit M9: a bingo panel left open over the Monday UTC reset must not claim a
 * line on the NEW card. With the backend unchanged, the client re-reads the
 * card before every claim and refuses when the week moved, and reloads by
 * itself when `resets_at` passes.
 */
import { act, cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('../lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));
vi.mock('./MetaContext', () => ({ useMeta: () => ({ refreshProfile: vi.fn() }) }));

import { BingoPanel } from './BingoPanel';

const card = (week: string, resetsAt: string, extra: Record<string, unknown> = {}) => ({
  week_start: week,
  resets_at: resetsAt,
  cells: Array.from({ length: 25 }, (_, i) =>
    i === 12 ? { kind: 'free', label: 'FREE' } : { kind: 'x', label: `Cell ${i}` },
  ),
  done: Array.from({ length: 25 }, (_, i) => i < 5),
  lines: [0],
  claimed: [],
  blackout: false,
  blackout_claimed: false,
  line_reward: 400,
  blackout_reward: 3000,
  blackout_vouchers: 3,
  ...extra,
});

beforeEach(() => {
  rpc.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('BingoPanel across the weekly reset', () => {
  test('refuses to claim when the server card is a different week', async () => {
    const far = new Date(Date.now() + 5 * 86_400_000).toISOString();
    rpc.mockImplementation(async (name: string) => {
      if (name !== 'get_bingo') throw new Error('unexpected rpc ' + name);
      // First read: the card on screen. Every later read: next week's card.
      return {
        data: rpc.mock.calls.length <= 1 ? card('2026-10-05', far) : card('2026-10-12', far),
        error: null,
      };
    });
    render(<BingoPanel />);
    const btn = await screen.findByRole('button', { name: /CLAIM ROW 1/ });
    await userEvent.click(btn);

    expect(await screen.findByText(/weekly reset happened/i)).toBeTruthy();
    expect(rpc.mock.calls.some((c) => c[0] === 'claim_bingo')).toBe(false);
  });

  test('claims normally when the week is unchanged', async () => {
    const far = new Date(Date.now() + 5 * 86_400_000).toISOString();
    rpc.mockImplementation(async (name: string) =>
      name === 'claim_bingo'
        ? { data: { credits: 400, vouchers: 0 }, error: null }
        : { data: card('2026-10-05', far), error: null },
    );
    render(<BingoPanel />);
    await userEvent.click(await screen.findByRole('button', { name: /CLAIM ROW 1/ }));
    expect(await screen.findByText(/Row 1 claimed/)).toBeTruthy();
    expect(rpc).toHaveBeenCalledWith('claim_bingo', { p_line: 0 });
  });

  test('reloads by itself when resets_at passes, and clears the timer on unmount', async () => {
    vi.useFakeTimers({
      toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
    });
    const resets = new Date(Date.now() + 60_000).toISOString();
    rpc.mockImplementation(async () => ({ data: card('2026-10-05', resets), error: null }));
    const { unmount } = render(<BingoPanel />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    const before = rpc.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(62_000);
    });
    expect(rpc.mock.calls.length).toBeGreaterThan(before);

    unmount();
    const after = rpc.mock.calls.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10 * 86_400_000);
    });
    expect(rpc.mock.calls.length).toBe(after);
  });

  test('warns about unclaimed lines within a day of the reset', async () => {
    const soon = new Date(Date.now() + 5 * 3_600_000).toISOString();
    rpc.mockImplementation(async () => ({ data: card('2026-10-05', soon), error: null }));
    render(<BingoPanel />);
    expect(await screen.findByText(/1 unclaimed reward/)).toBeTruthy();
  });
});
