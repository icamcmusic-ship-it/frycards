import { test, expect } from 'vitest';
import { validateDeckList, formatOf } from './DeckBuilderScreen';
import { POOL, POOL_BY_ID } from '../game/poker/cardpool';
import { cardColors, isColorLegal } from '../game/poker/colors';
import { MODES } from '../game/poker/constants';
import { buildDeck, deckCardIds, legalModes } from '../game/poker/deck';
import { isPower } from '../game/poker/cards';
import { rngOn } from '../game/poker/rng';

const leader = POOL_BY_ID['avatar_of_the_abyss'];
const identity = cardColors(leader);
const legalPowers = POOL.filter((c) => isPower(c) && isColorLegal(c, identity));
const offColour = POOL.filter((c) => isPower(c) && !isColorLegal(c, identity));
const legalLocation = POOL.find((c) => c.type === 'Location' && isColorLegal(c, identity))!;

/** A legal Standard list for `leader` (Location first, then 24 powers). */
const standard = () => deckCardIds(buildDeck(leader, MODES.standard, rngOn({ rng: 7 })));
const texts = (ids: string[], mode: 'quick' | 'standard' | 'deep' = 'standard') =>
  validateDeckList(leader, ids, mode).map((i) => i.text);

test('requires a Leader before checking anything else', () => {
  expect(validateDeckList(undefined, [], 'standard')).toEqual([
    { text: 'Pick a Leader.', kind: 'leader' },
  ]);
});

test('accepts a legal Standard deck: 1 Location + 24 powers', () => {
  const ids = standard();
  expect(ids).toHaveLength(25);
  expect(validateDeckList(leader, ids, 'standard')).toEqual([]);
});

test('the power count is per format: a Standard list is short for Deep and long for Quick', () => {
  const ids = standard();
  expect(texts(ids, 'deep').some((t) => t.includes('exactly 36 power cards'))).toBe(true);
  expect(texts(ids, 'quick').some((t) => t.includes('exactly 16 power cards'))).toBe(true);
  expect(legalModes(leader.id, ids)).toEqual(['standard']);
});

test('needs exactly one Location', () => {
  const ids = standard();
  const noLoc = ids.filter((id) => POOL_BY_ID[id].type !== 'Location');
  const none = validateDeckList(leader, noLoc, 'standard');
  expect(none.some((i) => i.kind === 'location' && i.text.includes('Add exactly one'))).toBe(true);
  const other = POOL.find(
    (c) => c.type === 'Location' && c.id !== ids[0] && isColorLegal(c, identity),
  )!;
  const two = validateDeckList(leader, [other.id, ...ids], 'standard');
  expect(two.some((i) => i.kind === 'location' && i.text.includes('exactly one'))).toBe(true);
});

test('enforces the format copy limit (2 in Standard, 3 in Deep)', () => {
  const card = legalPowers.find((c) => c.tier !== 5)!;
  const base = standard()
    .filter((id) => id !== card.id)
    .slice(0, 22);
  const three = [...base, card.id, card.id, card.id];
  const issues = validateDeckList(leader, three, 'standard');
  const copies = issues.find((i) => i.kind === 'copies');
  expect(copies?.text).toContain('At most 2 copies');
  expect(copies?.cards).toEqual([card.id]);
  expect(validateDeckList(leader, three, 'deep').some((i) => i.kind === 'copies')).toBe(false);
});

test('enforces the tier-5 budget (1 in Quick)', () => {
  const t5 = legalPowers.filter((c) => c.tier === 5).slice(0, 2);
  if (t5.length < 2) throw new Error('leader has fewer than two tier-5 cards to test with');
  const fill = legalPowers
    .filter((c) => c.tier !== 5)
    .slice(0, 14)
    .map((c) => c.id);
  const ids = [legalLocation.id, ...t5.map((c) => c.id), ...fill];
  const issues = validateDeckList(leader, ids, 'quick');
  expect(issues.some((i) => i.kind === 'tier5' && i.text.includes('At most 1 tier-5'))).toBe(true);
  expect(issues.some((i) => i.kind === 'count')).toBe(false);
});

test('rejects a Leader card sitting inside the deck list', () => {
  const ids = [leader.id, ...standard()];
  const issues = validateDeckList(leader, ids, 'standard');
  expect(issues.some((i) => i.kind === 'leader' && i.text.includes('Leader slot'))).toBe(true);
});

test('enforces colour identity — an off-colour card is a colour issue naming the card', () => {
  if (offColour.length === 0) throw new Error('leader has no off-colour cards to test against');
  const off = offColour[0];
  const ids = standard();
  ids[ids.length - 1] = off.id;
  const colour = validateDeckList(leader, ids, 'standard').find((i) => i.kind === 'colour');
  expect(colour?.text).toContain(`outside ${leader.name}'s colours`);
  expect(colour?.cards).toEqual([off.id]);
});

test('a deck built only from in-identity cards raises no colour issue', () => {
  expect(validateDeckList(leader, standard(), 'standard').some((i) => i.kind === 'colour')).toBe(
    false,
  );
});

test('an old 60-card list is illegal in every format', () => {
  const sixty: string[] = [];
  for (const c of legalPowers) {
    sixty.push(c.id, c.id);
    if (sixty.length >= 60) break;
  }
  expect(legalModes(leader.id, sixty.slice(0, 60))).toEqual([]);
});

test('enforces collection ownership limits when a collection is supplied', () => {
  const ids = standard();
  const collection = [...new Set([leader.id, ...ids])].map((id) => ({
    card_id: id,
    quantity: 2,
    foil_quantity: 0,
  }));
  expect(validateDeckList(leader, ids, 'standard', collection)).toEqual([]);
  collection.find((c) => c.card_id === ids[1])!.quantity = 0;
  const issues = validateDeckList(leader, ids, 'standard', collection);
  expect(issues.some((i) => i.kind === 'ownership' && i.text.includes('available'))).toBe(true);
});

test('a Leader locked in another deck is reported', () => {
  const ids = standard();
  const collection = [...new Set([leader.id, ...ids])].map((id) => ({
    card_id: id,
    quantity: 2,
    foil_quantity: 0,
  }));
  collection[0].quantity = 1;
  const locked = new Map([[leader.id, 1]]);
  const issues = validateDeckList(leader, ids, 'standard', collection, locked);
  expect(issues.some((i) => i.text.includes('free copy of the Leader'))).toBe(true);
});

test('formatOf falls back to the list size, and to Standard for an empty deck', () => {
  expect(formatOf(null)).toBe('standard');
  expect(formatOf({ id: 'x', card_ids: [] })).toBe('standard');
  const quick = deckCardIds(buildDeck(leader, MODES.quick, rngOn({ rng: 3 })));
  expect(formatOf({ id: 'never-saved', card_ids: quick })).toBe('quick');
});
