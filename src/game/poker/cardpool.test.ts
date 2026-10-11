import { describe, expect, it } from 'vitest';
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
