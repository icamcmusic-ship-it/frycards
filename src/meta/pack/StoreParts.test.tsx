/**
 * @vitest-environment jsdom
 *
 * A3: one BUY & OPEN per tile, with a currency toggle and ×1/×5/×10 stepper;
 * Save for later stays reachable as the secondary action.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { PackType, Profile } from '../../lib/supabase';
import { PackTile, leavingIn } from './StoreParts';

const pack = {
  id: 'p1',
  name: 'Test Booster',
  description: 'hand-written copy that must not show',
  card_count: 2,
  guaranteed_rarity: 'Mythic',
  image_url: null,
  open_image_url: null,
  foil_chance: 0,
  has_foil_slot: false,
  price_credits: 100,
  price_vouchers: 2,
  pack_tier: 'standard',
  slot_config: [{ count: 2, slot_type: 'chase', rarity_weights: { Rare: 1 } }],
  is_active: true,
  acquisition: 'purchase',
  time_limited: false,
  pity_note: null,
  allowed_sets: null,
  pack_group: null,
  set_name: null,
} as unknown as PackType;
const profile = { id: 'u', credits: 10_000, vouchers: 5 } as Profile;

afterEach(cleanup);

function setup(extra: Partial<Parameters<typeof PackTile>[0]> = {}) {
  const onBuy = vi.fn();
  const onBuyBulk = vi.fn();
  const onSave = vi.fn();
  render(
    <PackTile
      variants={[pack]}
      profile={profile}
      busyId={null}
      now={0}
      bulkCap={() => 24}
      onBuy={onBuy}
      onBuyBulk={onBuyBulk}
      onSaveForLater={onSave}
      onViewOdds={() => undefined}
      {...extra}
    />,
  );
  return { onBuy, onBuyBulk, onSave };
}

describe('PackTile', () => {
  test('one primary buy button; copy and badge come from slot_config', () => {
    setup();
    expect(screen.getAllByRole('button', { name: /BUY & OPEN/ })).toHaveLength(1);
    expect(screen.getByText('RARE+ GUARANTEED')).toBeTruthy();
    expect(screen.queryByText(/hand-written/)).toBeNull();
    expect(screen.getByText(/^2 cards, at least one Rare or better\.$/)).toBeTruthy();
  });

  test('×5 with vouchers goes through the bulk path', () => {
    const { onBuyBulk, onBuy } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'VOUCHERS' }));
    fireEvent.click(screen.getByRole('button', { name: '5 packs' }));
    expect(screen.getByRole('button', { name: /BUY & OPEN 5/ })).toBeTruthy();
    // 5 x 2 vouchers = 10 > 5 owned: short, disabled
    expect(
      (screen.getByRole('button', { name: /BUY & OPEN 5/ }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'CREDITS' }));
    fireEvent.click(screen.getByRole('button', { name: /BUY & OPEN 5/ }));
    expect(onBuyBulk).toHaveBeenCalledWith(pack, 5, 'credits');
    expect(onBuy).not.toHaveBeenCalled();
  });

  test('save for later stays reachable', () => {
    const { onSave } = setup();
    fireEvent.click(screen.getByRole('button', { name: /SAVE 1 FOR LATER/ }));
    expect(onSave).toHaveBeenCalledWith(pack, 'credits');
  });

  test('deal price shows on the button', () => {
    setup({ dealPct: () => 15 });
    expect(screen.getByText('-15% TODAY')).toBeTruthy();
    expect(screen.getByRole('button', { name: /BUY & OPEN/ }).textContent).toMatch(/85/);
  });

  test('leaving ribbon', () => {
    expect(leavingIn(new Date(3 * 86400_000 + 5000).toISOString(), 0)).toBe('3D');
    expect(leavingIn(new Date(-1).toISOString(), 0)).toBeNull();
  });
});
