import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { deriveEdited } from '../../meta/cardEditor';
import type { CardOverrides, CardTemplate } from '../../types';
import { GENERATED_CARDS } from '../generated-cards';
import {
  LEADER_ABILITY_OVERRIDES,
  POOL,
  POOL_BY_ID,
  POOL_LEADERS,
  deriveCardMechanics,
  poolByType,
} from './cardpool';
import { FROZEN_COLORS } from './frozenColors';
import { CHIP_KEYWORDS, KEYWORD_SPECS, keywordAllowed } from './keywords';
import { LEADER_COLORS } from './colors';
import { ruleName, ruleText } from './locations';

describe('card pool', () => {
  it('keeps every card and its identity', () => {
    expect(POOL).toHaveLength(GENERATED_CARDS.length);
    for (const t of GENERATED_CARDS) {
      const d = POOL_BY_ID[t.id];
      expect(d.name).toBe(t.name);
      expect(d.flavor).toBe(t.flavor);
      expect(d.rarity).toBe(t.rarity);
      expect(d.image).toBe(t.image);
    }
  });

  it('no card changes colour (frozen from the MTG-style game)', () => {
    for (const d of POOL) {
      if (d.type === 'Leader' && LEADER_COLORS[d.id]) continue;
      expect([...d.colors].sort()).toEqual([...FROZEN_COLORS[d.id]].sort());
    }
  });

  it('is deterministic', () => {
    for (const t of GENERATED_CARDS.slice(0, 40)) {
      expect(deriveCardMechanics(t)).toEqual(deriveCardMechanics({ ...t }));
    }
  });

  it('powers carry a tier 1–5 and a legal, colour-gated effect', () => {
    for (const t of ['Unit', 'Item', 'Event']) {
      for (const d of poolByType(t)) {
        expect(d.tier).toBeGreaterThanOrEqual(1);
        expect(d.tier).toBeLessThanOrEqual(5);
        expect(d.effect).toBeDefined();
        expect(KEYWORD_SPECS[d.effect!.kw].kind).toBe('effect');
        for (const k of [d.effect!.kw, ...(d.mods ?? []).map((m) => m.kw)]) {
          expect(keywordAllowed(k, d.colors), `${d.name} ${k}`).toBe(true);
        }
        expect(d.text).toBeTruthy();
      }
    }
  });

  it('Snuff only prints on Quick Events', () => {
    for (const d of POOL.filter((x) => x.effect?.kw === 'Snuff')) {
      expect(d.type).toBe('Event');
      expect(d.subtype).toBe('Quick');
    }
  });

  it('Leaders have one nerve-spending and one nerve-building ability', () => {
    expect(POOL_LEADERS.length).toBeGreaterThanOrEqual(9);
    for (const l of POOL_LEADERS) {
      expect(l.abilities).toHaveLength(2);
      expect(l.abilities![0].nerve).toBeLessThan(0);
      expect(l.abilities![1].nerve).toBeGreaterThan(0);
      expect(l.colors).toHaveLength(2);
    }
  });

  it('every Location maps to a table rule', () => {
    for (const d of poolByType('Location')) expect(d.rule?.id).toBeTruthy();
  });

  it('tiers lean towards the low end of the pyramid', () => {
    const units = poolByType('Unit');
    const low = units.filter((d) => (d.tier ?? 0) <= 2).length;
    const high = units.filter((d) => (d.tier ?? 0) >= 4).length;
    expect(low).toBeGreaterThan(high * 2);
  });

  it('an override replaces only the fields it names', () => {
    const t = GENERATED_CARDS.find((c) => c.type === 'Unit')!;
    const base = deriveCardMechanics(t);
    const over = deriveCardMechanics({ ...t, overrides: { tier: 5 } });
    expect(over.tier).toBe(5);
    expect(over.name).toBe(base.name);
    expect(deriveCardMechanics({ ...t, overrides: {} })).toEqual(base);
  });
});

describe('Leader abilities', () => {
  const situational = ['Straddle', 'Rerun', 'Burn', 'Cut', 'Toll', 'Bounty', 'Lock'];
  it('no Leader rolls a situational effect (Straddle, Rerun, …) as either ability', () => {
    for (const l of POOL_LEADERS)
      (l.abilities ?? []).forEach((a, i) => {
        if (LEADER_ABILITY_OVERRIDES[l.id]?.[i as 0 | 1]) return; // hand-set
        expect(situational, `${l.name}: ${a.text}`).not.toContain(a.effect.kw);
      });
  });

  it('a build ability never costs more chips than it moves', () => {
    for (const l of POOL_LEADERS) {
      const plus = l.abilities![1];
      if (plus.chipCost && plus.effect.n !== undefined && CHIP_KEYWORDS.has(plus.effect.kw))
        expect(plus.chipCost, `${l.name}: ${plus.text}`).toBeLessThanOrEqual(plus.effect.n);
    }
  });

  it('hand-rebuilding abilities spend 3 nerve, the rest 2', () => {
    const rebuild = ['Windfall', 'Wild', 'Bloom', 'Redraw', 'Exhume', 'Pass'];
    for (const l of POOL_LEADERS) {
      const minus = l.abilities![0];
      expect(minus.nerve, l.name).toBe(rebuild.includes(minus.effect.kw) ? -3 : -2);
    }
  });
});

describe('Creator overrides: colors, abilities, rule', () => {
  const sha = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex');
  const leader = GENERATED_CARDS.find((c) => c.type === 'Leader')!;
  const location = GENERATED_CARDS.find((c) => c.type === 'Location')!;
  const unit = GENERATED_CARDS.find((c) => c.type === 'Unit')!;

  it('leaves cards without overrides unchanged (pool fingerprint)', () => {
    // Fingerprint of the bundled catalog's mechanics. Moved on purpose by the
    // 2026-10-14 balance pass (Swirling Ink Cloud reprint, Sovereign of the
    // Dying Star's build ability, Bomb Pot's rule text).
    expect(sha(GENERATED_CARDS.map(deriveCardMechanics))).toBe(
      '5b95c53def2ab44ad103e84cfb7c5e868590f1f6522520c37241b0cac0e7f99c',
    );
  });

  it('a colors override wins, without re-rolling the effect', () => {
    const base = deriveCardMechanics(unit);
    const colors = base.colors.includes('Ember') ? (['Tide'] as const) : (['Ember'] as const);
    const d = deriveCardMechanics({ ...unit, overrides: { colors: [...colors] } });
    expect(d.colors).toEqual(colors);
    expect(d.effect).toEqual(base.effect);
    expect(d.mods).toEqual(base.mods);
    expect(deriveEdited({ ...unit, overrides: { colors: [...colors] } })).toEqual(d);
  });

  it('a Leader abilities override wins and matches the editor', () => {
    const overrides: CardOverrides = {
      colors: ['Ember'],
      abilities: [
        { kw: 'Windfall', nerve: -3 },
        { kw: 'Straddle', nerve: 1 },
      ],
    };
    const d = deriveCardMechanics({ ...leader, overrides });
    expect(d.colors).toEqual(['Ember']);
    expect(d.abilities!.map((a) => a.effect.kw)).toEqual(['Windfall', 'Straddle']);
    expect(d.abilities!.map((a) => a.nerve)).toEqual([-3, 1]);
    expect(d.abilities![1].chipCost).toBeUndefined();
    expect(d.keywords).toEqual(['Windfall', 'Straddle']);
    expect(d.text).toBe(d.abilities!.map((a) => a.text).join(' '));
    expect(deriveEdited({ ...leader, overrides })).toEqual(d);
  });

  it('a Location rule override wins', () => {
    const rule = { id: 'highStakes' as const, param: 2 };
    const d = deriveCardMechanics({ ...location, overrides: { rule } });
    expect(d.rule).toEqual(rule);
    expect(d.text).toBe(`${ruleName(rule)}: ${ruleText(rule)}`);
    expect(deriveEdited({ ...location, overrides: { rule } })).toEqual(d);
  });

  it('deleting the override restores the rolled card exactly', () => {
    for (const [t, overrides] of [
      [unit, { colors: ['Void', 'Light'] }],
      [
        leader,
        {
          abilities: [
            { kw: 'Windfall', nerve: -3 },
            { kw: 'Straddle', nerve: 1 },
          ],
        },
      ],
      [location, { rule: { id: 'openHand' } }],
    ] as [CardTemplate, CardOverrides][]) {
      const rolled = deriveCardMechanics(t);
      const edited: CardTemplate = { ...t, overrides };
      expect(deriveCardMechanics(edited)).not.toEqual(rolled);
      delete edited.overrides;
      expect(deriveCardMechanics(edited)).toEqual(rolled);
      expect(deriveCardMechanics({ ...t, overrides: {} })).toEqual(rolled);
    }
  });
});
