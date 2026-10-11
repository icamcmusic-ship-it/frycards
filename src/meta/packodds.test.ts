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
import {
  expectedRarities,
  packBlurb,
  packCardCount,
  packChaseRarities,
  packContentsLines,
  packFoilChance,
  packGuarantee,
  packGuaranteeBadge,
  packOdds,
  slotOdds,
  sortedWeights,
} from './packodds';
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

describe('store copy generated from slot_config (A4)', () => {
  // The live Volume #1 Booster Pack config (pack_types, 2026-10-11).
  const live = {
    id: 'b',
    name: 'Volume #1 Booster Pack',
    description: 'Six cards from Volume #1 — Guaranteed Uncommon or better',
    card_count: 8,
    guaranteed_rarity: 'Uncommon',
    image_url: null,
    open_image_url: null,
    foil_chance: 0.0118,
    has_foil_slot: true,
    price_credits: 599,
    price_vouchers: 6,
    pack_tier: 'standard',
    is_active: true,
    acquisition: 'purchase',
    time_limited: false,
    pity_note: null,
    allowed_sets: ['Volume #1'],
    pack_group: null,
    set_name: null,
    slot_config: [
      {
        count: 4,
        slot_type: 'foundation',
        rarity_weights: { Common: 0.78, Uncommon: 0.22 },
        guaranteed_min_rarity: 'Common',
      },
      {
        count: 2,
        slot_type: 'synergy',
        rarity_weights: { Rare: 0.28, Uncommon: 0.68, 'Super-Rare': 0.04 },
        guaranteed_min_rarity: 'Uncommon',
      },
      {
        count: 1,
        slot_type: 'chase',
        rarity_weights: {
          Rare: 0.65,
          Mythic: 0.02,
          'Full-Art': 0.05,
          'Super-Rare': 0.17,
          'Ultra-Rare': 0.11,
        },
        guaranteed_min_rarity: 'Rare',
      },
      {
        count: 1,
        slot_type: 'foil',
        foil_chance_override: 1,
        rarity_weights: {
          Rare: 0.22,
          Common: 0.3,
          Mythic: 0.01,
          'Full-Art': 0.02,
          Uncommon: 0.32,
          'Super-Rare': 0.09,
          'Ultra-Rare': 0.04,
        },
        guaranteed_min_rarity: 'Common',
      },
    ],
  } as unknown as PackType;

  test('the guarantee is the chase slot floor, not the stale DB column', () => {
    expect(packGuarantee(live)).toBe('Rare');
    expect(packGuaranteeBadge(live)).toBe('RARE+ GUARANTEED');
  });

  test('the blurb states the real card count, foils, floor and chase tiers', () => {
    const s = packBlurb(live);
    expect(s).toBe(
      '8 cards, one guaranteed foil, at least one Rare or better. Can hit Mythic, Full-Art, Ultra-Rare or Super-Rare.',
    );
    expect(packCardCount(live)).toBe(8);
  });

  test('every rarity the blurb names can actually drop', () => {
    const drops = new Set(expectedRarities(live).map(([r]) => r));
    for (const r of packChaseRarities(live)) expect(drops.has(r)).toBe(true);
  });

  test('what-inside lines mirror each slot row', () => {
    expect(packContentsLines(live)).toEqual([
      '4× Common to Uncommon',
      '2× Uncommon to Super-Rare',
      '1× Rare to Mythic',
      '1× foil Common to Mythic',
    ]);
  });

  test('a pack whose slots can all be Common has no badge', () => {
    const p = { ...live, slot_config: [live.slot_config[0]] } as PackType;
    expect(packGuaranteeBadge(p)).toBeNull();
    expect(packBlurb(p)).toBe('4 cards.');
  });
});
