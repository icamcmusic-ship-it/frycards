/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ToastProvider, useToast } from './toast';
import { CurrencyToasts, describeWalletChange } from './CurrencyBar';
import { MetaContext, MetaState } from './MetaContext';

vi.mock('../lib/supabase', () => ({
  supabase: {},
  fetchCardMarketValue: () => Promise.resolve(null),
}));

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function Fire({ text }: { text: string }) {
  const { toast } = useToast();
  return <button onClick={() => toast(text)}>fire</button>;
}

describe('ToastProvider', () => {
  test('shows a toast, then it expires on its own', () => {
    render(
      <ToastProvider>
        <Fire text="Hello" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('fire'));
    expect(screen.getByText('Hello')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.queryByText('Hello')).toBeNull();
  });

  test('is dismissible, and announces politely', () => {
    render(
      <ToastProvider>
        <Fire text="Bye" />
      </ToastProvider>,
    );
    fireEvent.click(screen.getByText('fire'));
    expect(screen.getByRole('status').textContent).toContain('Bye');
    fireEvent.click(screen.getByLabelText('Dismiss notification'));
    expect(screen.queryByText('Bye')).toBeNull();
  });

  test('outside a provider toast() is a harmless no-op', () => {
    render(<Fire text="nothing" />);
    expect(() => fireEvent.click(screen.getByText('fire'))).not.toThrow();
  });
});

describe('describeWalletChange', () => {
  test('describes gains, spends and mixed changes', () => {
    const base = { credits: 1000, vouchers: 5 };
    expect(describeWalletChange(base, base)).toBeNull();
    expect(describeWalletChange(base, { credits: 1250, vouchers: 5 })).toEqual({
      message: '+250 credits',
      kind: 'gain',
    });
    expect(describeWalletChange(base, { credits: 1000, vouchers: 4 })).toEqual({
      message: '−1 voucher',
      kind: 'loss',
    });
    expect(describeWalletChange(base, { credits: 400, vouchers: 10 })).toEqual({
      message: '−600 credits · +5 vouchers',
      kind: 'info',
    });
  });
});

describe('CurrencyToasts', () => {
  const profile = (id: string, credits: number, vouchers = 0) =>
    ({ profile: { id, credits, vouchers } }) as unknown as MetaState;

  function Harness({ meta }: { meta: MetaState }) {
    return (
      <MetaContext.Provider value={meta}>
        <ToastProvider>
          <CurrencyToasts />
        </ToastProvider>
      </MetaContext.Provider>
    );
  }

  test('stays quiet on the initial load and on an account switch, toasts later changes', () => {
    const { rerender } = render(<Harness meta={profile('a', 100)} />);
    // initial load: baseline only
    expect(screen.queryByRole('status')).toBeNull();

    // a different account's wallet is a new baseline, not a "change"
    rerender(<Harness meta={profile('b', 9000)} />);
    expect(screen.queryByRole('status')).toBeNull();

    rerender(<Harness meta={profile('b', 9100)} />);
    expect(screen.getByRole('status').textContent).toContain('+100 credits');
  });
});
