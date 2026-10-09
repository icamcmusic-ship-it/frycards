import { describe, expect, test } from 'vitest';
import {
  DEFAULT_FILTERS,
  MAX_PRESETS,
  activeFilterCount,
  cardMatchesFilters,
  compareCards,
  deletePreset,
  isPresetList,
  quicksellConfirmText,
  sanitizeFilters,
  savePreset,
  spareValueByRarity,
  suggestPresetName,
} from './collectionFilters';
import { quicksellPrice } from './economy';
import { POOL } from '../game/poker/cardpool';

describe('sanitizeFilters', () => {
  test('fills defaults for anything missing or foreign', () => {
    expect(sanitizeFilters(null)).toEqual(DEFAULT_FILTERS);
    expect(sanitizeFilters({ view: 'bogus', rarity: 'Plaid', sort: 7 })).toEqual(DEFAULT_FILTERS);
  });
  test('keeps valid values', () => {
    const f = sanitizeFilters({
      view: 'spares',
      rarity: 'Rare',
      type: 'Unit',
      sort: 'Tier',
      tier: '3',
      keyword: 'Peek',
      rule: 'highStakes',
    });
    expect(f).toMatchObject({
      view: 'spares',
      rarity: 'Rare',
      type: 'Unit',
      sort: 'Tier',
      tier: '3',
      keyword: 'Peek',
      rule: 'highStakes',
    });
  });
  test('a preset saved under the MTG-style game loads safely', () => {
    const legacy = {
      view: 'all',
      type: 'Unit',
      color: 'Ember',
      keyword: 'Aerial', // retired keyword
      sort: 'Cost', // retired sort
      cost: '3',
      might: 4,
      grit: '2',
      essence: 'Ember',
    };
    const f = sanitizeFilters(legacy);
    expect(f).toEqual({
      ...DEFAULT_FILTERS,
      view: 'all',
      type: 'Unit',
      color: 'Ember',
      sort: 'Tier',
    });
    expect(Object.keys(f).sort()).toEqual(Object.keys(DEFAULT_FILTERS).sort());
  });
  test('bad tier and rule values fall back; a numeric tier is accepted', () => {
    expect(sanitizeFilters({ tier: '7', rule: 'sanctum' })).toMatchObject({
      tier: 'All',
      rule: 'All',
    });
    expect(sanitizeFilters({ tier: 2 }).tier).toBe('2');
  });
});

describe('cardMatchesFilters / compareCards', () => {
  const any = { ...DEFAULT_FILTERS };
  test('tier filters match only powers of that tier', () => {
    const hits = POOL.filter((c) => cardMatchesFilters(c, { ...any, tier: '4' }));
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every((c) => c.tier === 4 && ['Unit', 'Item', 'Event'].includes(c.type))).toBe(
      true,
    );
  });
  test('the Location-rule filter matches only Locations printing that rule', () => {
    const loc = POOL.find((c) => c.type === 'Location' && c.rule)!;
    const hits = POOL.filter((c) => cardMatchesFilters(c, { ...any, rule: loc.rule!.id }));
    expect(hits).toContain(loc);
    expect(hits.every((c) => c.type === 'Location' && c.rule?.id === loc.rule!.id)).toBe(true);
  });
  test('keyword and colour filters read the poker card', () => {
    const peek = POOL.filter((c) => cardMatchesFilters(c, { ...any, keyword: 'Peek' }));
    expect(peek.length).toBeGreaterThan(0);
    // Peek is Light-gated.
    expect(peek.every((c) => c.colors.includes('Light'))).toBe(true);
    const leader = POOL.find((c) => c.type === 'Leader')!;
    expect(cardMatchesFilters(leader, { ...any, color: leader.colors[0] })).toBe(true);
    expect(cardMatchesFilters(leader, { ...any, color: 'Colorless' })).toBe(false);
  });
  test('Tier sorts ascending with tierless cards last; Rarity sorts highest first', () => {
    const byTier = [...POOL].sort(compareCards('Tier'));
    const tiers = byTier.map((c) => c.tier ?? 99);
    expect(tiers).toEqual([...tiers].sort((a, b) => a - b));
    expect(byTier[byTier.length - 1].tier).toBeUndefined();
    const byRarity = [...POOL].sort(compareCards('Rarity'));
    expect(byRarity[0].rarity).toBe('Mythic');
    const byName = [...POOL].sort(compareCards('Name'));
    expect(byName[0].name.localeCompare(byName[1].name)).toBeLessThanOrEqual(0);
  });
});

describe('activeFilterCount', () => {
  test('counts narrowing filters but not the view or the sort', () => {
    expect(activeFilterCount(DEFAULT_FILTERS)).toBe(0);
    expect(
      activeFilterCount({ ...DEFAULT_FILTERS, view: 'all', sort: 'Rarity', rarity: 'Rare' }),
    ).toBe(1);
    expect(
      activeFilterCount({ ...DEFAULT_FILTERS, type: 'Unit', color: 'Ember', keyword: 'Kindle' }),
    ).toBe(3);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, tier: '2', rule: 'fog' })).toBe(2);
  });
});

describe('presets', () => {
  const f = { ...DEFAULT_FILTERS, rarity: 'Rare', color: 'Ember' };
  test('save, overwrite by name, delete', () => {
    let list = savePreset([], 'Red rares', f);
    expect(list).toHaveLength(1);
    list = savePreset(list, 'Red rares', { ...f, rarity: 'Mythic' });
    expect(list).toHaveLength(1);
    expect(list[0].filters.rarity).toBe('Mythic');
    list = deletePreset(list, 'Red rares');
    expect(list).toEqual([]);
  });
  test('blank names are ignored and long ones trimmed', () => {
    expect(savePreset([], '   ', f)).toEqual([]);
    expect(savePreset([], 'x'.repeat(60), f)[0].name).toHaveLength(24);
  });
  test('the oldest preset is dropped past the cap', () => {
    let list: ReturnType<typeof savePreset> = [];
    for (let i = 0; i < MAX_PRESETS + 2; i++) list = savePreset(list, `p${i}`, f);
    expect(list).toHaveLength(MAX_PRESETS);
    expect(list[0].name).toBe('p2');
  });
  test('stored junk is rejected', () => {
    expect(isPresetList([{ name: 'a', filters: {} }])).toBe(true);
    expect(isPresetList([{ name: 1, filters: {} }])).toBe(false);
    expect(isPresetList('nope')).toBe(false);
  });
  test('suggested names describe the filters and never collide', () => {
    expect(suggestPresetName(f, [])).toBe('Rare · Ember');
    expect(suggestPresetName(f, [{ name: 'Rare · Ember', filters: f }])).toBe('Rare · Ember 2');
    expect(suggestPresetName(DEFAULT_FILTERS, [])).toBe('My filter');
    expect(suggestPresetName({ ...DEFAULT_FILTERS, tier: '3', keyword: 'Peek' }, [])).toBe(
      'Peek · Tier 3',
    );
  });
});

describe('quicksell preview', () => {
  test('totals credits per rarity from the normal/foil split', () => {
    const m = spareValueByRarity([
      { rarity: 'Common', normal: 3, foil: 0 },
      { rarity: 'Common', normal: 2, foil: 1 },
      { rarity: 'Rare', normal: 1, foil: 0 },
      { rarity: 'Rare', normal: 0, foil: 0 },
    ]);
    const c = m.get('Common')!;
    expect(c).toMatchObject({ cards: 6, normal: 5, foil: 1 });
    expect(c.credits).toBe(5 * quicksellPrice('Common', false) + quicksellPrice('Common', true));
    expect(m.get('Rare')!.cards).toBe(1);
    expect(m.has('Mythic')).toBe(false);
  });
  test('the confirm text shows the count, the breakdown and the total', () => {
    const v = spareValueByRarity([{ rarity: 'Common', normal: 4, foil: 2 }]).get('Common')!;
    const text = quicksellConfirmText('Common', v);
    expect(text).toContain('Quicksell all 6 spare Common cards?');
    expect(text).toContain(`4 normal × ${quicksellPrice('Common', false)}`);
    expect(text).toContain(`2 foil × ${quicksellPrice('Common', true)}`);
    expect(text).toContain(`Total ≈ ${v.credits.toLocaleString('en-US')} credits`);
  });
});
