import { describe, expect, test } from 'vitest';
import {
  CARD_VARIANTS,
  ELEMENTAL_VARIANTS,
  VARIANT_META,
  asVariant,
  elementalForColour,
  variantArtUrl,
  variantChanceForColours,
  variantMult,
  variantsForColours,
} from './variants';
import { quicksellPrice } from './economy';
import { revealTier } from './pack/revealTier';
import { pullScore } from './packHistory';
import { sanitizeFilters, tileMatchesVariant } from './collectionFilters';
import { packVariantOdds } from './packodds';
import { shardsFor } from '../components/variants/fx/Shattered';
import { seededRandom } from '../components/variants/rng';
import type { PackType } from '../lib/supabase';

describe('card variants', () => {
  test('eight variants: Smash Cut (shattered) plus one elemental per colour', () => {
    expect(CARD_VARIANTS).toHaveLength(8);
    expect(ELEMENTAL_VARIANTS).toHaveLength(7);
    const colours = ELEMENTAL_VARIANTS.map((v) => VARIANT_META[v].colour);
    expect(new Set(colours).size).toBe(7);
    expect(elementalForColour('Void')).toBe('void_rift');
    expect(variantsForColours(['Ember', 'Tide'])).toEqual([
      'shattered',
      'ember_sparks',
      'tide_frost',
    ]);
    expect(variantsForColours([])).toEqual(['shattered']);
  });

  test('multipliers mirror variant_mult and stack with foil like quicksell_many', () => {
    expect(variantMult('shattered')).toBe(6);
    expect(variantMult('root_overgrown')).toBe(3);
    expect(variantMult(null)).toBe(1);
    expect(quicksellPrice('Rare', false, 'shattered')).toBe(240);
    // ceil(40 x 2.5) = 100, x3
    expect(quicksellPrice('Rare', true, 'gale_lightning')).toBe(300);
    expect(quicksellPrice('Rare', true)).toBe(100);
  });

  test('odds: colourless cards can only shatter', () => {
    expect(variantChanceForColours([])).toBeCloseTo(1 / 150);
    expect(variantChanceForColours(['Light'])).toBeCloseTo(1 / 150 + 149 / 150 / 40);
    const pack = {
      slot_config: [
        { count: 4, slot_type: 'foundation', rarity_weights: { Common: 1 } },
        { count: 1, slot_type: 'leader', card_type: 'Leader', rarity_weights: { Rare: 1 } },
      ],
      foil_chance: 0,
    } as unknown as PackType;
    const v = packVariantOdds(pack);
    expect(v.cards).toBe(4);
    expect(v.shattered).toBeCloseTo(1 - Math.pow(149 / 150, 4));
    expect(v.any).toBeGreaterThan(v.elemental);
  });

  test('a variant gets at least the Super-Rare reveal and beats a plain pull of its rarity', () => {
    expect(revealTier({ rarity: 'Common', converted_to_credits: false })).toBe('fast');
    expect(
      revealTier({ rarity: 'Common', converted_to_credits: false, variant: 'tide_frost' }),
    ).toBe('burst');
    expect(
      revealTier({ rarity: 'Mythic', converted_to_credits: false, variant: 'shattered' }),
    ).toBe('mythic');
    expect(pullScore({ rarity: 'Rare', foil: false, variant: 'shattered' })).toBeGreaterThan(
      pullScore({ rarity: 'Rare', foil: true }),
    );
  });

  test('collection variant filter', () => {
    expect(sanitizeFilters({ variant: 'void_rift' }).variant).toBe('void_rift');
    expect(sanitizeFilters({ variant: 'nope' }).variant).toBe('All');
    expect(tileMatchesVariant('All', null)).toBe(true);
    expect(tileMatchesVariant('Any', null)).toBe(false);
    expect(tileMatchesVariant('Any', 'shattered')).toBe(true);
    expect(tileMatchesVariant('shadow_ink', 'shattered')).toBe(false);
  });

  test('server values normalise; painted art has a fixed drop-in path', () => {
    expect(asVariant('shattered')).toBe('shattered');
    expect(asVariant('')).toBeNull();
    expect(asVariant(null)).toBeNull();
    expect(variantArtUrl('ember_sparks')).toBe(
      'https://frycards-art.pages.dev/Overlays/ember_sparks.webp',
    );
  });

  test('shards: 3-4 per card, seeded per card id', () => {
    const a = shardsFor('card-a').shards;
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(a.length).toBeLessThanOrEqual(4);
    expect(shardsFor('card-a').shards).toEqual(a);
    for (const s of a) {
      expect(s.poly.length).toBeGreaterThanOrEqual(3);
      for (const [x, y] of s.poly) {
        expect(x).toBeGreaterThanOrEqual(-0.01);
        expect(x).toBeLessThanOrEqual(100.01);
        expect(y).toBeGreaterThanOrEqual(-0.01);
        expect(y).toBeLessThanOrEqual(100.01);
      }
    }
    const r1 = seededRandom('x');
    const r2 = seededRandom('x');
    expect(r1()).toBe(r2());
  });
});
