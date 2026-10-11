// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const rpc = vi.hoisted(() => ({ recordMatchPlacement: vi.fn() }));
vi.mock('../lib/supabase', () => ({ recordMatchPlacement: rpc.recordMatchPlacement }));

import { holdLabel, loadPending, submitResult } from './pendingResult';

const base = { matchId: 't1', place: 2, seats: 6, mode: 'standard' as const, hands: 20, at: 0 };
const ok = { reward: 66 } as never;
const answer = (o: object) => ({
  data: null,
  error: null,
  status: null,
  retryable: false,
  retryAfterMs: null,
  ...o,
});

describe('pending result (one reward path)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    localStorage.clear();
    rpc.recordMatchPlacement.mockReset();
  });
  afterEach(() => vi.useRealTimers());

  test('too_early: held for retryAfterMs, persisted, then re-sent with the same ticket', async () => {
    rpc.recordMatchPlacement
      .mockResolvedValueOnce(answer({ status: 'too_early', retryable: true, retryAfterMs: 60_000 }))
      .mockResolvedValueOnce(answer({ data: ok }));
    const holds: (number | null)[] = [];
    const p = submitResult({ ...base, at: Date.now() }, (h) => holds.push(h));
    await vi.advanceTimersByTimeAsync(10);
    expect(holds[0]).toBeGreaterThan(Date.now());
    expect(loadPending()?.dueAt).toBe(holds[0]);
    await vi.advanceTimersByTimeAsync(62_000);
    expect(await p).toEqual({ kind: 'paid', data: ok });
    expect(rpc.recordMatchPlacement).toHaveBeenCalledTimes(2);
    expect(rpc.recordMatchPlacement.mock.calls[1][3]).toBe('t1');
    expect(loadPending()).toBeNull();
  });

  test('too_short is final and clears the stored result', async () => {
    rpc.recordMatchPlacement.mockResolvedValueOnce(answer({ status: 'too_short' }));
    const out = await submitResult({ ...base, at: Date.now() });
    expect(out).toEqual({ kind: 'refused', status: 'too_short' });
    expect(loadPending()).toBeNull();
  });

  test('a network failure keeps it for the next app start', async () => {
    rpc.recordMatchPlacement.mockResolvedValue(answer({ error: 'offline' }));
    const p = submitResult({ ...base, at: Date.now() });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await p).toEqual({ kind: 'failed' });
    expect(loadPending()?.matchId).toBe('t1');
  });

  test('holdLabel is m:ss', () => {
    expect(holdLabel(125_000, 0)).toBe('2:05');
  });
});
