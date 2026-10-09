import { useEffect, useRef } from 'react';
import { useMeta } from './MetaContext';
import { CreditChip, VoucherChip } from './ui';
import { StorePlus } from './StorePlus';
import { useToast, ToastKind } from './toast';
import { fmtCredits, fmtVouchers } from './economy';

/** Credits + vouchers with the "+" shortcut to the Store. Renders nothing for a
 * guest (no wallet). Screens that use `MetaHeader` already get this. */
export function CurrencyBar({ className }: { className?: string }) {
  const { profile } = useMeta();
  if (!profile) return null;
  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <CreditChip amount={profile.credits} />
      <VoucherChip amount={profile.vouchers} />
      <StorePlus />
    </div>
  );
}

export interface Wallet {
  credits: number;
  vouchers: number;
}

/** The toast text for a wallet change, or `null` when nothing moved. */
export function describeWalletChange(
  prev: Wallet,
  next: Wallet,
): { message: string; kind: ToastKind } | null {
  const dc = next.credits - prev.credits;
  const dv = next.vouchers - prev.vouchers;
  if (dc === 0 && dv === 0) return null;
  const signed = (n: number, fmt: (n: number) => string, unit: string) =>
    `${n > 0 ? '+' : '−'}${fmt(Math.abs(n))} ${unit}`;
  const parts: string[] = [];
  if (dc !== 0) parts.push(signed(dc, fmtCredits, 'credits'));
  if (dv !== 0) parts.push(signed(dv, fmtVouchers, dv === 1 || dv === -1 ? 'voucher' : 'vouchers'));
  const kind: ToastKind = dc >= 0 && dv >= 0 ? 'gain' : dc <= 0 && dv <= 0 ? 'loss' : 'info';
  return { message: parts.join(' · '), kind };
}

/**
 * Toasts every change to the wallet that arrives AFTER the first profile load
 * for a player (a claimed reward, a sale landing, a purchase). The first
 * profile for an account, and the first one after switching accounts, only
 * seed the baseline — otherwise every sign-in would open with a toast.
 * Renders nothing; mount it once under both providers.
 */
export function CurrencyToasts() {
  const { profile } = useMeta();
  const { toast } = useToast();
  const last = useRef<({ id: string } & Wallet) | null>(null);
  const id = profile?.id;
  const credits = profile?.credits;
  const vouchers = profile?.vouchers;

  useEffect(() => {
    if (!id || credits === undefined || vouchers === undefined) {
      last.current = null;
      return;
    }
    const prev = last.current;
    last.current = { id, credits, vouchers };
    if (!prev || prev.id !== id) return;
    const change = describeWalletChange(prev, { credits, vouchers });
    if (change) toast(change.message, { kind: change.kind });
  }, [id, credits, vouchers, toast]);

  return null;
}
