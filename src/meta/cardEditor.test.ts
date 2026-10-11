import { describe, expect, test } from 'vitest';
import { GENERATED_CARDS } from '../game/generated-cards';
import { deriveCardMechanics } from '../game/poker/cardpool';
import { KEYWORD_SPECS, keywordAllowed, type Keyword } from '../game/poker/keywords';
import type { CardTemplate } from '../types';
import {
  applyExtendedOverrides,
  buildEditedPayload,
  deriveEdited,
  fieldsFor,
  overridesFromDef,
  parseRefs,
  pruneExtended,
  validateEdit,
  type ExtendedOverrides,
} from './cardEditor';

const of = (type: string): CardTemplate => {
  const c = GENERATED_CARDS.find((x) => x.type === type);
  if (!c) throw new Error(`no ${type} in the bundle`);
  return { ...c, overrides: undefined };
};
const unit = of('Unit');
const leader = of('Leader');
const location = of('Location');

describe('override application', () => {
  test('no overrides = the rolled card exactly', () => {
    expect(deriveEdited(unit)).toEqual(deriveCardMechanics(unit));
  });

  test('colours, Leader abilities and Location rules are layered on', () => {
    const d = deriveEdited({ ...unit, overrides: { colors: ['Void'] } as ExtendedOverrides });
    expect(d.colors).toEqual(['Void']);

    const l = deriveEdited({
      ...leader,
      overrides: {
        colors: ['Ember'],
        abilities: [
          { kw: 'Redraw', nerve: -3 },
          { kw: 'Straddle', nerve: 1 },
        ],
      } as ExtendedOverrides,
    });
    expect(l.abilities?.map((a) => a.effect.kw)).toEqual(['Redraw', 'Straddle']);
    expect(l.abilities?.[0].text).toMatch(/^-3 nerve: /);
    expect(l.abilities?.[1].chipCost).toBeUndefined(); // Straddle pays its own way
    expect(l.text).toContain('-3 nerve');

    const loc = deriveEdited({
      ...location,
      overrides: { rule: { id: 'highStakes', param: 2 } } as ExtendedOverrides,
    });
    expect(loc.rule).toEqual({ id: 'highStakes', param: 2 });
    expect(loc.text).toMatch(/^High Stakes: Blinds ×2/);
  });

  test('a rules-text override wins over regenerated text', () => {
    // Layered alone, a text override leaves the derived text to cardpool.
    const d = applyExtendedOverrides(deriveCardMechanics(location), { rule: { id: 'openHand' } });
    expect(d.text).toMatch(/^Open Hand: /);
    const e = deriveEdited({
      ...location,
      overrides: { rule: { id: 'openHand' }, text: 'Custom.' } as ExtendedOverrides,
    });
    expect(e.text).toBe('Custom.');
  });

  test('MANUAL seeding reproduces the rolled card', () => {
    for (const t of [unit, leader, location]) {
      const o = overridesFromDef(deriveCardMechanics(t));
      expect(o.manual).toBe(true);
      const d = deriveEdited({ ...t, overrides: o });
      const r = deriveCardMechanics(t);
      expect(d.colors).toEqual(r.colors);
      expect(d.effect).toEqual(r.effect);
      expect(d.rule).toEqual(r.rule);
      expect(d.abilities?.map((a) => [a.nerve, a.effect.kw])).toEqual(
        r.abilities?.map((a) => [a.nerve, a.effect.kw]),
      );
      expect(validateEdit({ ...t, overrides: o })).toEqual([]);
    }
  });

  test('prune drops fields the type cannot carry and empty objects', () => {
    expect(pruneExtended({}, 'Unit')).toBeUndefined();
    expect(pruneExtended({ rule: { id: 'openHand' }, tier: 2 }, 'Unit')).toEqual({ tier: 2 });
    expect(fieldsFor('Leader')).toContain('abilities');
    expect(fieldsFor('Unit')).not.toContain('subtype');
  });

  test('payload writes overrides and mechanics from the same card', () => {
    const p = buildEditedPayload({
      ...unit,
      overrides: { colors: ['Void'], tier: 4 } as ExtendedOverrides,
    });
    expect(p.overrides).toEqual({ colors: ['Void'], tier: 4 });
    expect(p.mechanics.essence_types).toEqual(['Void']);
    expect(p.mechanics.might).toBe(4);
    expect(buildEditedPayload(unit).overrides).toBeUndefined();
  });
});

describe('validation', () => {
  test('rejects out-of-range and malformed fields', () => {
    const bad = (o: ExtendedOverrides, t = unit) => validateEdit({ ...t, overrides: o });
    expect(bad({ tier: 7 })).toContain('Tier must be 1–5.');
    expect(bad({ subtype: 'Weapon' })).toEqual([expect.stringMatching(/can't be Weapon/)]);
    expect(bad({ colors: ['Ember', 'Ember'] })[0]).toMatch(/twice/);
    expect(bad({ colors: ['Ember', 'Tide', 'Root'] }, leader)[0]).toMatch(/one or two/);
    expect(bad({ rule: { id: 'highStakes', param: 9 } }, location)[0]).toMatch(/takes one of/);
    expect(bad({ rule: { id: 'openHand', param: 2 } }, location)[0]).toMatch(/no parameter/);
    expect(
      bad(
        {
          abilities: [
            { kw: 'Redraw', nerve: 2 },
            { kw: 'Redraw', nerve: 1 },
          ],
        },
        leader,
      ),
    ).toContain('The spend ability costs 1–5 nerve.');
    expect(validateEdit({ ...unit, rarity: 'Shiny' as never })[0]).toMatch(/Unknown rarity/);
  });

  test('enforces colour gating and effect/modifier kinds', () => {
    const gated = (Object.keys(KEYWORD_SPECS) as Keyword[]).find(
      (k) => KEYWORD_SPECS[k].kind === 'effect' && KEYWORD_SPECS[k].gated,
    )!;
    const other = (['Ember', 'Tide', 'Root', 'Gale', 'Light', 'Shadow', 'Void'] as const).find(
      (c) => !keywordAllowed(gated, [c]),
    )!;
    const p = validateEdit({
      ...unit,
      overrides: { colors: [other], effect: { kw: gated }, mods: [] } as ExtendedOverrides,
    });
    expect(p.join(' ')).toMatch(/gated/);
    const mod = (Object.keys(KEYWORD_SPECS) as Keyword[]).find(
      (k) => KEYWORD_SPECS[k].kind === 'effect' && !KEYWORD_SPECS[k].gated,
    )!;
    expect(
      validateEdit({ ...unit, overrides: { mods: [{ kw: mod }] } as ExtendedOverrides }).join(' '),
    ).toMatch(/not a modifier/);
  });

  test('MANUAL requires every field', () => {
    const p = validateEdit({ ...unit, overrides: { manual: true, tier: 2 } as ExtendedOverrides });
    expect(p[0]).toMatch(/MANUAL mode: set colors, effect/);
  });

  test('parseRefs', () => {
    expect(parseRefs('Fuse 1, veil')).toEqual([{ kw: 'Fuse', n: 1 }, { kw: 'Veil' }]);
    expect(parseRefs('Kindle 1½')).toEqual([{ kw: 'Kindle', n: 1.5 }]);
    expect(parseRefs('Nonsense')).toBeNull();
    expect(parseRefs('')).toEqual([]);
  });
});
