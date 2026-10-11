import { describe, expect, test } from 'vitest';
import type { PackPull } from '../../lib/supabase';
import { leakColor, newOrDupe, revealTier, shakeLevel, tearRelease } from './revealTier';
import { dealPrice, msToUtcMidnight } from '../../lib/storeApi';
import { packSlug, packArtUrl } from './packArt';

const pull = (rarity: string, extra: Partial<PackPull> = {}): PackPull => ({
  card_id: rarity,
  name: rarity,
  rarity,
  card_type: 'Unit',
  image_url: null,
  foil: false,
  slot: 's',
  converted_to_credits: false,
  credit_value: 0,
  ...extra,
});

describe('reveal tiers (D5)', () => {
  test('C/U fast, Rare glow, SR..Alt-Art burst, Mythic takeover', () => {
    expect(revealTier(pull('Common'))).toBe('fast');
    expect(revealTier(pull('Uncommon'))).toBe('fast');
    expect(revealTier(pull('Rare'))).toBe('rare');
    expect(revealTier(pull('Super-Rare'))).toBe('burst');
    expect(revealTier(pull('Ultra-Rare'))).toBe('burst');
    expect(revealTier(pull('Alt-Art'))).toBe('burst');
    expect(revealTier(pull('Mythic'))).toBe('mythic');
    expect(revealTier(pull('Mythic', { converted_to_credits: true }))).toBe('fast');
  });
});

describe('anticipation (D2/D3)', () => {
  test('shake is coarse: Rare and below share level 0', () => {
    expect(shakeLevel([pull('Common'), pull('Rare')])).toBe(0);
    expect(shakeLevel([pull('Super-Rare')])).toBe(1);
    expect(shakeLevel([pull('Ultra-Rare')])).toBe(2);
    expect(shakeLevel([pull('Full-Art')])).toBe(2);
    expect(shakeLevel([pull('Mythic')])).toBe(3);
    expect(shakeLevel([pull('Common', { serialized: true })])).toBe(3);
    expect(shakeLevel([])).toBe(0);
  });
  test('leak only for an honest Rare+ best pull', () => {
    expect(leakColor([pull('Common'), pull('Uncommon')])).toBeNull();
    expect(leakColor([pull('Common'), pull('Super-Rare')])).toBe('#A855F7');
  });
  test('release snaps below 60% and completes past it', () => {
    expect(tearRelease(0.59)).toBe('snap');
    expect(tearRelease(0.6)).toBe('complete');
  });
});

describe('NEW / DUPE (D10)', () => {
  test('new when owned <= copies pulled, before or after the refresh', () => {
    const p = [pull('Rare'), pull('Common'), pull('Common')];
    const m = newOrDupe(p, new Map([['Common', 5]]));
    expect(m.get('Rare')).toEqual({ isNew: true, copies: 1 });
    expect(m.get('Common')).toEqual({ isNew: false, copies: 5 });
    expect(newOrDupe(p, new Map([['Rare', 1]])).get('Rare')?.isNew).toBe(true);
  });
});

describe('store helpers', () => {
  test('deal price mirrors pack_effective_price', () => {
    expect(dealPrice(599, 15)).toBe(509);
    expect(dealPrice(6, 15)).toBe(5);
    expect(dealPrice(1, 15)).toBe(1);
    expect(dealPrice(599, undefined)).toBe(599);
    expect(dealPrice(null, 15)).toBeNull();
  });
  test('rotation counts down to UTC midnight', () => {
    expect(msToUtcMidnight(Date.UTC(2026, 9, 11, 23, 0))).toBe(3_600_000);
  });
  test('art paths follow the drop-in convention', () => {
    expect(packSlug('Volume #1 Booster Pack')).toBe('volume_1_booster_pack');
    expect(packArtUrl('Ember Pack', 'wrapper')).toBe(
      'https://frycards-art.pages.dev/Packs/ember_pack/wrapper.webp',
    );
  });
});
