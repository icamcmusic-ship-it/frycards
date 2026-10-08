/**
 * @vitest-environment jsdom
 *
 * M10: refreshProfile / refreshCollection had no ordering or account guard, so
 * an older response could overwrite a newer one, and the previous user's
 * in-flight data could land after an account switch. The backend is fully
 * mocked — nothing here touches Supabase.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function defer<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mocks = vi.hoisted(() => ({
  authListener: null as null | ((evt: string, s: unknown) => void),
  session: null as unknown,
  fetchProfile: vi.fn(),
  fetchCollection: vi.fn(),
}));

vi.mock('../lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: () => Promise.resolve({ data: { session: mocks.session } }),
      onAuthStateChange: (cb: (evt: string, s: unknown) => void) => {
        mocks.authListener = cb;
        return { data: { subscription: { unsubscribe: () => undefined } } };
      },
      signOut: () => Promise.resolve({}),
    },
  },
  fetchProfile: mocks.fetchProfile,
  fetchCollection: mocks.fetchCollection,
  fetchMySerializedCards: () => Promise.resolve([]),
  fetchCosmetics: () => Promise.resolve([]),
  fetchDecks: () => Promise.resolve([]),
  fetchInventory: () => Promise.resolve([]),
  fetchShopItems: () => Promise.resolve([]),
  fetchPackTypes: () => Promise.resolve([]),
  subscribeTable: () => () => undefined,
}));

import { MetaProvider, MetaState, useMeta } from './MetaContext';

const sessionFor = (id: string) => ({ user: { id } });
const prof = (id: string, credits: number) => ({ id, credits });

let meta!: MetaState;
function Probe() {
  meta = useMeta();
  return null;
}

async function mountSignedIn(id: string) {
  mocks.session = sessionFor(id);
  mocks.fetchProfile.mockResolvedValue(prof(id, 100));
  mocks.fetchCollection.mockResolvedValue([]);
  render(
    <MetaProvider>
      <Probe />
    </MetaProvider>,
  );
  await waitFor(() => expect(meta.dataLoading).toBe(false));
  await waitFor(() => expect(meta.profile?.id).toBe(id));
}

beforeEach(() => {
  localStorage.clear();
  mocks.fetchProfile.mockReset();
  mocks.fetchCollection.mockReset();
  mocks.authListener = null;
});
afterEach(cleanup);

describe('MetaProvider refresh guards', () => {
  test('an older refresh that resolves last does not overwrite a newer one', async () => {
    await mountSignedIn('u1');
    const slow = defer<unknown>();
    const fast = defer<unknown>();
    mocks.fetchProfile.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = meta.refreshProfile();
      second = meta.refreshProfile();
    });
    await act(async () => {
      fast.resolve(prof('u1', 500));
      await second;
    });
    expect(meta.profile?.credits).toBe(500);

    await act(async () => {
      slow.resolve(prof('u1', 250)); // issued first, answered last: stale
      await first;
    });
    expect(meta.profile?.credits).toBe(500);
  });

  test('an older response that arrives first is still applied, then superseded', async () => {
    await mountSignedIn('u1');
    const a = defer<unknown>();
    const b = defer<unknown>();
    mocks.fetchProfile.mockReturnValueOnce(a.promise).mockReturnValueOnce(b.promise);
    let pa!: Promise<void>;
    let pb!: Promise<void>;
    act(() => {
      pa = meta.refreshProfile();
      pb = meta.refreshProfile();
    });
    await act(async () => {
      a.resolve(prof('u1', 300));
      await pa;
    });
    expect(meta.profile?.credits).toBe(300);
    await act(async () => {
      b.resolve(prof('u1', 400));
      await pb;
    });
    expect(meta.profile?.credits).toBe(400);
  });

  test('refreshCollection is guarded the same way', async () => {
    await mountSignedIn('u1');
    const slow = defer<unknown[]>();
    const fast = defer<unknown[]>();
    mocks.fetchCollection.mockReturnValueOnce(slow.promise).mockReturnValueOnce(fast.promise);
    let p1!: Promise<void>;
    let p2!: Promise<void>;
    act(() => {
      p1 = meta.refreshCollection();
      p2 = meta.refreshCollection();
    });
    await act(async () => {
      fast.resolve([{ id: 'new' }]);
      await p2;
    });
    await act(async () => {
      slow.resolve([{ id: 'old' }]);
      await p1;
    });
    expect(meta.collection).toEqual([{ id: 'new' }]);
  });

  test("the previous user's in-flight refresh never lands after an account switch", async () => {
    await mountSignedIn('u1');
    const inFlight = defer<unknown>();
    mocks.fetchProfile.mockReturnValueOnce(inFlight.promise);
    let stale!: Promise<void>;
    act(() => {
      stale = meta.refreshProfile();
    });

    // Switch to another account; its own boot load answers immediately.
    mocks.fetchProfile.mockResolvedValue(prof('u2', 7));
    await act(async () => {
      mocks.authListener?.('SIGNED_IN', sessionFor('u2'));
    });
    await waitFor(() => expect(meta.profile?.id).toBe('u2'));

    await act(async () => {
      inFlight.resolve(prof('u1', 9999)); // u1's balance arriving late
      await stale;
    });
    expect(meta.profile).toEqual(prof('u2', 7));
  });
});
