/**
 * The Creator's mechanics-override editor (v13), tested at the layer the v14
 * bug hunt found the holes in: `formFor` (the generated card as the editor's
 * baseline) and `overridesFrom` (the diff that decides what actually gets
 * written). Both were reachable only through the React tree before, which is
 * why an override that silently evaporated went unnoticed.
 */
import { test, expect } from 'vitest';
import { formFor, overridesFrom, OverrideForm } from './CardSubmissionsScreen';
import { POOL_V4 } from '../game/v3/cardpool';
import { CardDef } from '../game/v3/cards';

const unitWithKeywords = POOL_V4.find(
  (c) => c.type === 'Unit' && (c.keywords?.length ?? 0) > 0,
) as CardDef;
const item = POOL_V4.find((c) => c.type === 'Item' && c.bond?.might) as CardDef;

const edit = (def: CardDef, patch: Partial<OverrideForm>) =>
  overridesFrom({ ...formFor(def), ...patch }, def);

test('the pool still has the shapes these tests assume', () => {
  expect(unitWithKeywords).toBeTruthy();
  expect(item).toBeTruthy();
});

test('an untouched form produces no override at all', () => {
  for (const def of [unitWithKeywords, item]) {
    const { overrides, problems } = overridesFrom(formFor(def), def);
    expect(problems).toEqual([]);
    expect(overrides).toBeUndefined();
  }
});

test('emptying the KEYWORDS box really strips the generated keywords', () => {
  // The v14 bug: this diffed to `keywords: []` and pruneOverrides threw the
  // empty array away, so the card printed with its generated keywords and the
  // panel reported "No overrides — this prints as generated".
  const { overrides, problems } = edit(unitWithKeywords, { keywords: '' });
  expect(problems).toEqual([]);
  expect(overrides).toEqual({ keywords: [] });
});

test('an invented keyword is reported, not printed as a dead chip', () => {
  const { overrides, problems } = edit(unitWithKeywords, { keywords: 'Aerial, Sparkly' });
  expect(problems.join(' ')).toMatch(/Sparkly/);
  expect(overrides?.keywords).toBeUndefined();
});

test("an Item's bond is editable, and writes back as one object", () => {
  const { overrides, problems } = edit(item, { bondMight: '4', bondGrit: '2' });
  expect(problems).toEqual([]);
  expect(overrides).toEqual({ bond: { might: 4, grit: 2 } });

  // Editing one half still rewrites the whole bond, keeping the other half.
  const half = edit(item, { bondMight: '9' });
  expect(half.overrides?.bond).toEqual({
    might: 9,
    ...(item.bond?.grit ? { grit: item.bond.grit } : {}),
  });

  // Emptying both clears the field rather than printing an empty object.
  expect(edit(item, { bondMight: '', bondGrit: '' }).overrides).toEqual({ bond: null });

  // And nonsense is reported.
  expect(edit(item, { bondMight: 'four' }).problems.length).toBeGreaterThan(0);
  expect(edit(item, { bondMight: '-1' }).problems.length).toBeGreaterThan(0);
});

test('an Item has no might/grit for the Unit-only boxes to touch', () => {
  // The editor renders MIGHT/GRIT for Units only now. The baseline proves why:
  // on an Item both are blank, so any value typed there was a pure invention
  // that the card face never reads.
  const base = formFor(item);
  expect(base.might).toBe('');
  expect(base.grit).toBe('');
  expect(base.bondMight || base.bondGrit).toBeTruthy();
});

test('an unreadable cost is reported instead of falling back to the generated one', () => {
  expect(edit(unitWithKeywords, { cost: 'two ember' }).problems.length).toBeGreaterThan(0);
  expect(edit(unitWithKeywords, { cost: '2 Ember, 1 generic' }).overrides).toEqual({
    cost: { generic: 1, pips: { Ember: 2 } },
  });
});

test('clearing the rules text clears the field', () => {
  const withText = POOL_V4.find((c) => c.type === 'Event' && c.text) as CardDef;
  expect(withText).toBeTruthy();
  expect(edit(withText, { text: '' }).overrides).toEqual({ text: null });
});
