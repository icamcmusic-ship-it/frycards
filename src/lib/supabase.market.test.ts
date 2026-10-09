/**
 * @vitest-environment jsdom
 *
 * Client side of audit B5 / B7: the market list must not ask for (or
 * trigger) anything server-private. The Supabase client is faked; nothing
 * here touches the network.
 */
import { beforeEach, expect, test, vi } from 'vitest';

const calls = vi.hoisted(() => ({
  rpc: [] as { fn: string; args: unknown }[],
  select: [] as string[],
}));

vi.mock('@supabase/supabase-js', () => {
  // Every builder method returns the same awaitable chain.
  const chain: any = new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === 'then') return (res: (v: unknown) => void) => res({ data: [], error: null });
        if (prop === 'select')
          return (cols: string) => {
            calls.select.push(cols);
            return chain;
          };
        return () => chain;
      },
    },
  );
  return {
    createClient: () => ({
      from: () => chain,
      rpc: async (fn: string, args: unknown) => {
        calls.rpc.push({ fn, args });
        return { data: { credits: 120, vouchers: 0 }, error: null };
      },
      channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
      removeChannel: () => {},
    }),
  };
});

import { fetchMarketListings, fetchMyMarketActivity } from './supabase';

beforeEach(() => {
  calls.rpc.length = 0;
  calls.select.length = 0;
});

test('the market list names its columns, never cpu_ceiling, and does not call the cron-only RPC', async () => {
  await fetchMarketListings();
  expect(calls.rpc.map((c) => c.fn)).not.toContain('settle_expired_listings');
  expect(calls.select).toHaveLength(1);
  expect(calls.select[0]).not.toBe('*');
  expect(calls.select[0]).not.toMatch(/cpu_ceiling|cpu_next_at/);
  // everything MarketListing declares is still requested
  for (const col of ['id', 'seller', 'current_bid', 'ends_at', 'cpu_leading', 'cpu_bidder_name'])
    expect(calls.select[0]).toContain(col);
});

test('my-activity reads use the same explicit column list', async () => {
  localStorage.setItem('frycards_market_bids_v1', JSON.stringify({ u1: ['l1'] }));
  await fetchMyMarketActivity('u1');
  expect(calls.select).toHaveLength(2);
  for (const cols of calls.select) expect(cols).not.toMatch(/\*|cpu_ceiling/);
});
