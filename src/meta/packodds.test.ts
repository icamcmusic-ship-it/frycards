/**
 * Pack-odds regression tests.
 *
 * The odds modal is the only thing a player can check a pack against before
 * spending on it, so a drift between it and `grant_pack_contents` is a
 * transparency bug, not a cosmetic one. Both of the bugs pinned here were live
 * before v7.2: the guaranteed-foil slot type and the per-slot-vs-per-pack foil
 * rate.
 */
import { describe, expect, test } from 'vitest';
import { PackType } from '../lib/supabase';
import { expectedRarities, packFoilChance, packOdds, slotOdds, sortedWeights } from './packodds';
import { RARITY_ORDER } from './rarity';

const pack = (over: Partial<PackType> = {}): PackType =>
  ({
    id: 'p',
    name: 'Test Pack',
    description: null,
    card_count: 8,
    guaranteed_rarity: null,
    image_url: null,
    open_image_url: null,
    foil_chance: 0.0118,
    has_foil_slot: true,
    price_credits: 499,
    price_vouchers: 5,
    pack_tier: 'standard',
    slot_config: [],
    is_active: true,
    acquisition: 'purchase',
    time_limited: false,
    pity_note: null,
    allowed_sets: null,
    pack_group: null,
    set_name: null,
    ...over,
  }) as PackType;

/** The live v7.2 booster, field for field. */
const BOOSTER = pack({
  slot_config: [
    {
      count: 4,
      slot_type: 'foundation',
      foil_eligible: true,
      rarity_weights: { Common: 0.78, Uncommon: 0.22 },
      guaranteed_min_rarity: 'Common',
    },
    {
      count: 2,
      slot_type: 'synergy',
      foil_eligible: true,
      rarity_weights: { Uncommon: 0.68, Rare: 0.28, 'Super-Rare': 0.04 },
      guaranteed_min_rarity: 'Uncommon',
    },
    {
      count: 1,
      slot_type: 'chase',
      foil_eligible: true,
      rarity_weights: {
        Rare: 0.7705,
        'Super-Rare': 0.13,
        'Ultra-Rare': 0.082,
        'Full-Art': 0.013,
        Mythic: 0.0045,
      },
      guaranteed_min_rarity: 'Rare',
    },
    {
      count: 1,
      slot_type: 'foil',
      foil_eligible: true,
      foil_chance_override: 1,
      rarity_weights: {
        Common: 0.34,
        Uncommon: 0.36,
        Rare: 0.22,
        'Super-Rare': 0.055,
        'Ultra-Rare': 0.02,
        'Full-Art': 0.004,
        Mythic: 0.001,
      },
      guaranteed_min_rarity: 'Common',
    },
  ],
});

describe('slot odds', () => {
  test("the v7.2 'foil' slot reads as guaranteed foil", () => {
    // Regression: `guaranteedFoil` only matched a `foil_` PREFIX (and
    // 'prismatic'), so the booster's guaranteed-foil slot — named exactly
    // 'foil' — advertised the base 1.18% chance instead of 100%.
    const odds = slotOdds(BOOSTER, BOOSTER.slot_config[3]);
    expect(odds.foilChance).toBe(1);
    expect(odds.label).toBe('FOIL');
  });

  test('a slot with foil_eligible:false never shows a foil chance', () => {
    const p = pack({
      foil_chance: 0.5,
      slot_config: [{ slot_type: 'foundation', count: 1, foil_eligible: false }],
    });
    expect(slotOdds(p, p.slot_config[0]).foilChance).toBe(0);
  });

  test('slot weights are ordered along the shared rarity ladder', () => {
    const order = sortedWeights(BOOSTER.slot_config[2].rarity_weights!).map(([r]) => r);
    expect(order).toEqual(['Rare', 'Super-Rare', 'Ultra-Rare', 'Full-Art', 'Mythic']);
    // Alt-Art must sort between Full-Art and Mythic — the copy of this ladder
    // that PackOpening.tsx used to keep omitted it entirely, ranking it as a
    // Common.
    const withAlt = sortedWeights({ Mythic: 0.1, 'Alt-Art': 0.1, Common: 0.8 }).map(([r]) => r);
    expect(withAlt).toEqual(['Common', 'Alt-Art', 'Mythic']);
    expect(RARITY_ORDER.indexOf('Alt-Art')).toBeGreaterThan(RARITY_ORDER.indexOf('Full-Art'));
  });
});

describe('pack-level totals', () => {
  test('expected rarities sum to the pack card count', () => {
    const total = expectedRarities(BOOSTER).reduce((s, [, n]) => s + n, 0);
    expect(total).toBeCloseTo(BOOSTER.card_count, 6);
  });

  test('every slot rarity weight table sums to 1', () => {
    for (const slot of BOOSTER.slot_config) {
      const sum = Object.values(slot.rarity_weights!).reduce((a, b) => a + b, 0);
      expect(sum, slot.slot_type).toBeCloseTo(1, 6);
    }
  });

  test('the booster advertises one guaranteed foil plus a ~8% bonus chance', () => {
    // The stored `foil_chance` is PER SLOT. Quoting it raw understated the
    // real rate several times over; this is the per-pack figure the store now
    // shows, and it must stay pinned to the ~8% the DB is tuned for.
    const { guaranteed, bonus } = packFoilChance(BOOSTER);
    expect(guaranteed).toBe(1);
    expect(bonus).toBeGreaterThan(0.07);
    expect(bonus).toBeLessThan(0.09);
  });

  test('a pack with no foil-eligible slots reports no foil chance at all', () => {
    const p = pack({
      foil_chance: 0,
      slot_config: [{ slot_type: 'foundation', count: 5, rarity_weights: { Common: 1 } }],
    });
    expect(packFoilChance(p)).toEqual({ guaranteed: 0, bonus: 0 });
  });

  test('identical adjacent slots collapse into one row, non-identical ones do not', () => {
    expect(packOdds(BOOSTER).map((r) => [r.label, r.count])).toEqual([
      ['FOUNDATION', 4],
      ['SYNERGY', 2],
      ['CHASE', 1],
      ['FOIL', 1],
    ]);
  });

  test('no live weight table offers a rarity the catalog cannot supply', () => {
    // `random_card_of_rarity` walks DOWN its ladder when a tier has no rows,
    // so advertising Alt-Art (zero cards in `public.cards`) silently handed
    // out Full-Art instead. v7.2 folded that weight into Full-Art; this keeps
    // it from creeping back into a client-side table.
    for (const slot of BOOSTER.slot_config) {
      expect(Object.keys(slot.rarity_weights!)).not.toContain('Alt-Art');
    }
  });
});
