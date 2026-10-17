/**
 * @vitest-environment jsdom
 *
 * Bundles: strike-through value, SAVE X% ribbon, cost per card, and the ×10
 * BUY & OPEN charging the 10-pack bundle price.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { PackType, Profile } from '../../lib/supabase';
import { bundlePrice, type ShopBundle } from '../../lib/storeApi';
import { BundleTile } from './BundleTile';
import { PackTile } from './StoreParts';

const booster = {
  id: 'b',
  name: 'Volume #1 Booster Pack',
  card_count: 8,
  image_url: null,
  foil_chance: 0,
  price_credits: 599,
  price_vouchers: 6,
  pack_tier: 'standard',
  slot_config: [{ count: 8, slot_type: 'chase', rarity_weights: { Rare: 1 } }],
  is_active: true,
  acquisition: 'purchase',
  pack_group: null,
} as unknown as PackType;
const b10: ShopBundle = {
  id: 'booster_10',
  name: 'Booster 10-Pack',
  pack_type_id: 'b',
  pack_qty: 10,
  price_credits: 4799,
  price_vouchers: 48,
  sort_order: 2,
};
const profile = { id: 'u', credits: 10_000, vouchers: 5 } as Profile;

afterEach(cleanup);

describe('bundles', () => {
  test('price math mirrors purchase_bundle (cheaper of bundle and deal x qty)', () => {
    expect(bundlePrice(b10, booster, 'credits')).toEqual({ price: 4799, value: 5990, savePct: 20 });
    expect(bundlePrice(b10, booster, 'vouchers')).toEqual({ price: 48, value: 60, savePct: 20 });
    expect(bundlePrice({ ...b10, pack_qty: 3, price_credits: 1619 }, booster, 'credits')).toEqual({
      price: 1619,
      value: 1797,
      savePct: 10,
    });
  });

  test('tile: SAVE ribbon, struck value, per-card cost, buys into My Packs', () => {
    const onBuy = vi.fn();
    render(
      <BundleTile bundle={b10} pack={booster} profile={profile} busyId={null} onBuy={onBuy} />,
    );
    expect(screen.getByText('SAVE 20%')).toBeTruthy();
    expect(screen.getByTestId('bundle-value').tagName).toBe('S');
    expect(screen.getByText(/per card/).textContent).toMatch(/60/);
    fireEvent.click(screen.getByRole('button', { name: /BUY BUNDLE/ }));
    expect(onBuy).toHaveBeenCalledWith(b10, booster, 'credits');
  });

  test('×10 BUY & OPEN shows the bundle price, struck full price beside it', () => {
    render(
      <PackTile
        variants={[booster]}
        profile={profile}
        busyId={null}
        now={0}
        bulkCap={() => 24}
        bulkPrice={(_p, n) => (n === 10 ? 4799 : undefined)}
        onBuy={() => undefined}
        onBuyBulk={() => undefined}
        onSaveForLater={() => undefined}
        onViewOdds={() => undefined}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '10 packs' }));
    const btn = screen.getByRole('button', { name: /BUY & OPEN 10/ });
    expect(btn.textContent).toMatch(/5990/);
    expect(btn.textContent).toMatch(/4,?799/);
  });
});
