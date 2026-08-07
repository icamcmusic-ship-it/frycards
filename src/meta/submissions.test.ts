import { describe, expect, it } from 'vitest';
import {
  DISALLOWED_THEMES,
  SHOWCASE_MIN_CARDS,
  SHOWCASE_SET,
  SUBMISSION_LIMITS,
  SUBMITTABLE_TYPES,
  buildCardPayload,
  describeOverrides,
  formatCostInput,
  isValidCardId,
  isVideoUrl,
  mechanicsFor,
  parseBulkCards,
  parseCostInput,
  parseKeywordsInput,
  pruneOverrides,
  slugifyCardId,
  validateSubmission,
} from './submissions';
import { formFor, overridesFrom } from './CardSubmissionsScreen';
import { POOL_BY_ID, POOL_V4, deriveCardMechanics } from '../game/v3/cardpool';
import { RARITIES, Rarity } from '../types';
import { COLORS } from '../game/v3/colors';
import { ALL_SET_NAMES } from './rarity';

const OK_IMAGE = 'https://cdn.midjourney.com/abc-123/0_0.png';
const OK_VIDEO = 'https://cdn.example.com/art/loop.mp4';

const draft = (over: Partial<Parameters<typeof validateSubmission>[0]> = {}) => ({
  title: 'Lantern of the Drowned Choir',
  type: 'Unit' as const,
  flavor: 'It hums the names of everyone the tide kept.',
  imageUrl: OK_IMAGE,
  treatment: 'standard' as const,
  ...over,
});

describe('validateSubmission', () => {
  it('accepts a well-formed draft', () => {
    expect(validateSubmission(draft())).toBeNull();
  });

  it('rejects a title outside the length bounds', () => {
    expect(validateSubmission(draft({ title: 'x' }))).toMatch(/title/i);
    expect(validateSubmission(draft({ title: 'x'.repeat(41) }))).toMatch(/title/i);
    // The boundaries themselves are legal.
    expect(validateSubmission(draft({ title: 'ab' }))).toBeNull();
    expect(validateSubmission(draft({ title: 'x'.repeat(40) }))).toBeNull();
  });

  it('trims before measuring, so padding cannot smuggle a blank title through', () => {
    expect(validateSubmission(draft({ title: '        ' }))).toMatch(/title/i);
  });

  it('rejects flavor outside the length bounds', () => {
    expect(validateSubmission(draft({ flavor: 'no' }))).toMatch(/flavor/i);
    expect(validateSubmission(draft({ flavor: 'x'.repeat(301) }))).toMatch(/flavor/i);
    expect(validateSubmission(draft({ flavor: 'x'.repeat(300) }))).toBeNull();
  });

  it('demands https — no http, no protocol-relative, no bare host', () => {
    for (const url of ['http://cdn.example.com/a.png', '//cdn.example.com/a.png', 'cdn.x/a.png']) {
      expect(validateSubmission(draft({ imageUrl: url }))).toMatch(/https/i);
    }
  });

  it('pairs video art with the video Mythic treatment, both ways', () => {
    // A video link on a non-video treatment would print a still <img> of an
    // mp4 — i.e. a blank card face.
    expect(validateSubmission(draft({ imageUrl: OK_VIDEO }))).toMatch(/video/i);
    expect(validateSubmission(draft({ imageUrl: OK_VIDEO, treatment: 'full_art' }))).toMatch(
      /video/i,
    );
    // And a still image cannot claim the video slot.
    expect(validateSubmission(draft({ treatment: 'video_mythic' }))).toMatch(/mp4/i);
    expect(validateSubmission(draft({ imageUrl: OK_VIDEO, treatment: 'video_mythic' }))).toBeNull();
  });

  it('accepts a video url carrying a query string or fragment', () => {
    expect(isVideoUrl('https://x.co/a.mp4?token=1')).toBe(true);
    expect(isVideoUrl('https://x.co/a.webm#t=2')).toBe(true);
    expect(isVideoUrl('https://x.co/a.MOV')).toBe(true);
    // Not a video: the extension has to end the path, not merely appear in it.
    expect(isVideoUrl('https://x.co/mp4-collection/art.png')).toBe(false);
  });

  it('only allows the four submittable types', () => {
    expect(SUBMITTABLE_TYPES).not.toContain('Leader');
    // 'Leader' is a valid CardType but not a submittable one — the guard has
    // to be a runtime check, not just a type-level one.
    expect(validateSubmission(draft({ type: 'Leader' }))).toMatch(/card type/i);
  });

  it('publishes the limits and the ban list the screen renders', () => {
    expect(SUBMISSION_LIMITS.fullArtPerAccount).toBe(1);
    expect(SUBMISSION_LIMITS.videoMythicPerAccount).toBe(1);
    expect(DISALLOWED_THEMES.length).toBeGreaterThan(3);
    // Pinned: `submit_card` hard-codes the same string server-side, so a
    // rename here without a migration silently splits the set in two.
    expect(SHOWCASE_SET).toBe('Players Showcase 2026');
    expect(SHOWCASE_MIN_CARDS).toBe(100);
  });
});

describe('slugifyCardId', () => {
  it('produces the same shape as the shipped catalog ids', () => {
    expect(slugifyCardId('Blight-Snarler')).toBe('blight_snarler');
    expect(slugifyCardId('Blossom-Veiled Refuge')).toBe('blossom_veiled_refuge');
    expect(slugifyCardId("Kraken's Monolith")).toBe('krakens_monolith');
  });

  it('strips accents, punctuation and edge underscores', () => {
    expect(slugifyCardId('  Ámbar   Sphère!! ')).toBe('ambar_sphere');
    expect(slugifyCardId('—Ash—')).toBe('ash');
  });

  it('never emits a trailing underscore after the 64-char clamp', () => {
    const id = slugifyCardId(`${'a'.repeat(63)} tail`);
    expect(id.length).toBeLessThanOrEqual(64);
    expect(id.endsWith('_')).toBe(false);
    expect(isValidCardId(id)).toBe(true);
  });

  it('rejects ids the server would reject', () => {
    expect(isValidCardId('ab')).toBe(false);
    expect(isValidCardId('Has-Caps')).toBe(false);
    expect(isValidCardId('has space')).toBe(false);
    expect(isValidCardId('a'.repeat(65))).toBe(false);
    expect(isValidCardId('ok_id_1')).toBe(true);
  });
});

describe('mechanicsFor / buildCardPayload', () => {
  it('derives exactly what the live pool derives for an existing card', () => {
    const known = POOL_BY_ID['blight_snarler'];
    expect(known).toBeTruthy();
    const m = mechanicsFor({
      id: known.id,
      name: known.name,
      type: known.type,
      rarity: known.rarity,
      set: known.set,
      image: known.image,
      flavor: known.flavor,
    });
    expect(m.might).toBe(known.might ?? null);
    expect(m.grit).toBe(known.grit ?? null);
    expect(m.rules_text).toBe(known.text ?? null);
    expect(m.keywords).toBe((known.keywords ?? []).join(', ') || null);
    expect(m.essence_cost).toEqual(known.cost ?? null);
  });

  it('is a pure function of id|type|rarity — the server-side hash seed', () => {
    const base = { id: 'test_card_alpha', type: 'Unit' as const, set: SHOWCASE_SET };
    const a = mechanicsFor({ ...base, name: 'One', rarity: 'Rare', image: 'x', flavor: 'y' });
    const b = mechanicsFor({ ...base, name: 'Totally Different', rarity: 'Rare', image: 'q' });
    expect(b).toEqual(a);
    // …and rarity is part of the seed, so a re-tier is a reprint.
    const c = mechanicsFor({ ...base, name: 'One', rarity: 'Mythic' });
    expect(c).not.toEqual(a);
  });

  it('packs a payload with every column apply_card_upsert writes', () => {
    const p = buildCardPayload({
      id: 'test_card_beta',
      name: 'Test Card Beta',
      type: 'Location',
      rarity: 'Super-Rare',
      set: SHOWCASE_SET,
      flavor: 'A quiet place.',
      image: OK_IMAGE,
    });
    expect(p).toMatchObject({
      id: 'test_card_beta',
      card_type: 'Location',
      rarity: 'Super-Rare',
      set_name: SHOWCASE_SET,
      image_url: OK_IMAGE,
    });
    expect(Object.keys(p.mechanics).sort()).toEqual(
      [
        'card_subtype',
        'essence_cost',
        'essence_types',
        'grit',
        'keywords',
        'might',
        'resolve',
        'rules_text',
      ].sort(),
    );
    expect(Array.isArray(p.mechanics.essence_types)).toBe(true);
  });

  it('derives usable mechanics at every rarity a Creator can pick', () => {
    // 13 of the 297 shipped cards are legitimately colourless (all-generic
    // cost), so an empty essence_types is valid — pick_deck_bucket's
    // `essence_types <@ identity` reads that as "legal in any deck". What must
    // hold at every rarity is that a Unit gets stats and only ever names real
    // Essence types.
    const seen = new Set<string>();
    for (const rarity of RARITIES) {
      const m = mechanicsFor({
        id: 'test_card_gamma',
        name: 'Gamma',
        type: 'Unit',
        rarity,
        set: SHOWCASE_SET,
      });
      expect(m.might).not.toBeNull();
      expect(m.grit).not.toBeNull();
      for (const c of m.essence_types) {
        expect(COLORS).toContain(c);
        seen.add(c);
      }
    }
    expect(seen.size).toBeGreaterThan(0);
  });
});

describe('parseBulkCards — delimited lines', () => {
  it('parses a pipe-delimited batch and slugs the ids', () => {
    const { rows, errors } = parseBulkCards(
      [
        `Ashen Kite | Unit | Uncommon | ${OK_IMAGE} | It circles what the fire left.`,
        `Tidewrack Reliquary | Location | Rare | ${OK_IMAGE} | Every shelf is a drowned promise.`,
      ].join('\n'),
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      id: 'ashen_kite',
      name: 'Ashen Kite',
      type: 'Unit',
      rarity: 'Uncommon',
      set: SHOWCASE_SET,
    });
    expect(rows[1].id).toBe('tidewrack_reliquary');
  });

  it('prefers tabs and pipes over commas so flavor text survives', () => {
    const { rows, errors } = parseBulkCards(
      `Ashen Kite\tUnit\tUncommon\t${OK_IMAGE}\tIt circles, it waits, it leaves.`,
    );
    expect(errors).toEqual([]);
    expect(rows[0].flavor).toBe('It circles, it waits, it leaves.');
  });

  it('still parses a comma-delimited line when nothing better is present', () => {
    const { rows } = parseBulkCards(`Ashen Kite,Unit,Uncommon,${OK_IMAGE},Short flavor`);
    expect(rows[0].flavor).toBe('Short flavor');
  });

  it('accepts optional set and id columns', () => {
    const { rows, errors } = parseBulkCards(
      `Ashen Kite | Unit | Uncommon | ${OK_IMAGE} | flavor | Volume #1 | custom_kite_id`,
    );
    expect(errors).toEqual([]);
    expect(rows[0].set).toBe('Volume #1');
    expect(rows[0].id).toBe('custom_kite_id');
  });

  it('normalizes casing and separators in type and rarity', () => {
    const { rows, errors } = parseBulkCards(
      [
        `A Card | unit | super rare | ${OK_IMAGE} | f`,
        `B Card | LOCATION | SUPER_RARE | ${OK_IMAGE} | f`,
        `C Card | Event | ultra-rare | ${OK_IMAGE} | f`,
      ].join('\n'),
    );
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.rarity)).toEqual(['Super-Rare', 'Super-Rare', 'Ultra-Rare']);
    expect(rows.map((r) => r.type)).toEqual(['Unit', 'Location', 'Event']);
  });

  it('skips blank lines and # comments', () => {
    const { rows, errors } = parseBulkCards(
      ['# my batch', '', `Ashen Kite | Unit | Uncommon | ${OK_IMAGE} | f`, '  '].join('\n'),
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it('skips a spreadsheet header row instead of reporting it as a bad type', () => {
    const { rows, errors } = parseBulkCards(
      [
        'name | card type | rarity | image | flavor',
        `Ashen Kite | Unit | Uncommon | ${OK_IMAGE} | f`,
      ].join('\n'),
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it('reports bad rows by line number and keeps the good ones', () => {
    const { rows, errors } = parseBulkCards(
      [
        `Good One | Unit | Common | ${OK_IMAGE} | f`,
        `Bad Type | Wizard | Common | ${OK_IMAGE} | f`,
        `Bad Rarity | Unit | Legendary | ${OK_IMAGE} | f`,
        `Bad Url | Unit | Common | ftp://x/a.png | f`,
        `Too Few | Unit | Common`,
        `Good Two | Event | Rare | ${OK_IMAGE} | f`,
      ].join('\n'),
    );
    expect(rows.map((r) => r.name)).toEqual(['Good One', 'Good Two']);
    expect(errors.map((e) => e.line)).toEqual([2, 3, 4, 5]);
    expect(errors[0].message).toMatch(/card type/i);
    expect(errors[1].message).toMatch(/rarity/i);
    expect(errors[2].message).toMatch(/https/i);
    expect(errors[3].message).toMatch(/at least/i);
  });

  it('rejects a duplicate id inside one batch rather than silently overwriting', () => {
    const { rows, errors } = parseBulkCards(
      [
        `Ashen Kite | Unit | Common | ${OK_IMAGE} | one`,
        `Ashen  Kite | Unit | Rare | ${OK_IMAGE} | two`,
      ].join('\n'),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].flavor).toBe('one');
    expect(errors[0].message).toMatch(/duplicate/i);
  });

  it('rejects an over-long name, an over-long flavor and an unusable id', () => {
    const { rows, errors } = parseBulkCards(
      [
        `${'n'.repeat(81)} | Unit | Common | ${OK_IMAGE} | f`,
        `Long Flavor | Unit | Common | ${OK_IMAGE} | ${'f'.repeat(501)}`,
        `!! | Unit | Common | ${OK_IMAGE} | f`,
      ].join('\n'),
    );
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(3);
    expect(errors[0].message).toMatch(/80 characters/);
    expect(errors[1].message).toMatch(/500 characters/);
    expect(errors[2].message).toMatch(/id/);
  });

  it('reports an empty paste rather than returning a silent empty batch', () => {
    const { rows, errors } = parseBulkCards('   \n  ');
    expect(rows).toEqual([]);
    expect(errors[0].message).toMatch(/nothing/i);
  });

  it('honours the default set passed by the bulk panel', () => {
    const { rows } = parseBulkCards(`A Card | Unit | Common | ${OK_IMAGE} | f`, 'Volume #2');
    expect(rows[0].set).toBe('Volume #2');
  });
});

describe('parseBulkCards — JSON', () => {
  it('parses an array of objects with either key spelling', () => {
    const { rows, errors } = parseBulkCards(
      JSON.stringify([
        {
          name: 'Ashen Kite',
          card_type: 'Unit',
          rarity: 'Uncommon',
          image_url: OK_IMAGE,
          flavor_text: 'one',
        },
        { name: 'Tide Bell', type: 'Item', rarity: 'Rare', image: OK_IMAGE, flavor: 'two' },
      ]),
    );
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.id)).toEqual(['ashen_kite', 'tide_bell']);
    expect(rows[1].type).toBe('Item');
  });

  it('accepts a single object as a one-card batch', () => {
    const { rows, errors } = parseBulkCards(
      JSON.stringify({ name: 'Solo', type: 'Event', rarity: 'Common', image: OK_IMAGE }),
    );
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0].flavor).toBe('');
  });

  it('reports invalid JSON once, without pretending anything parsed', () => {
    const { rows, errors } = parseBulkCards('[{"name": "Broken"');
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/invalid json/i);
  });

  it('reports a non-object element by its index', () => {
    const { rows, errors } = parseBulkCards(
      JSON.stringify([
        'just a string',
        { name: 'Okay Card', type: 'Unit', rarity: 'Common', image: OK_IMAGE },
      ]),
    );
    expect(rows).toHaveLength(1);
    expect(errors[0]).toMatchObject({ line: 1 });
  });

  it('round-trips through buildCardPayload for every parsed row', () => {
    const { rows } = parseBulkCards(
      [
        `Ashen Kite | Unit | Uncommon | ${OK_IMAGE} | one`,
        `Tide Bell | Item | Rare | ${OK_IMAGE} | two`,
      ].join('\n'),
    );
    const payloads = rows.map((r) =>
      buildCardPayload({
        id: r.id,
        name: r.name,
        type: r.type,
        rarity: r.rarity,
        set: r.set,
        flavor: r.flavor,
        image: r.image,
      }),
    );
    expect(payloads).toHaveLength(2);
    for (const p of payloads) {
      expect(isValidCardId(p.id)).toBe(true);
      expect(p.set_name).toBe(SHOWCASE_SET);
      expect(p.mechanics.essence_types.length).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// v13: Creator mechanics overrides
// ---------------------------------------------------------------------------
describe('mechanics overrides', () => {
  const base = {
    id: 'override_probe',
    name: 'Override Probe',
    type: 'Unit' as const,
    rarity: 'Rare' as const,
    set: SHOWCASE_SET,
    flavor: 'probe',
    image: OK_IMAGE,
  };

  it('leaves the payload untouched when nothing is overridden', () => {
    const plain = buildCardPayload(base);
    expect(plain.overrides).toBeUndefined();
    expect(buildCardPayload({ ...base, overrides: {} }).overrides).toBeUndefined();
    expect(buildCardPayload({ ...base, overrides: null }).overrides).toBeUndefined();
  });

  it('writes the overridden value into the derived mechanics the server stores', () => {
    const generated = buildCardPayload(base);
    const overridden = buildCardPayload({ ...base, overrides: { might: 9, grit: 9 } });
    expect(overridden.overrides).toEqual({ might: 9, grit: 9 });
    expect(overridden.mechanics.might).toBe(9);
    expect(overridden.mechanics.grit).toBe(9);
    // Untouched fields still come from the hash.
    expect(overridden.mechanics.keywords).toBe(generated.mechanics.keywords);
  });

  it('overriding the cost also moves the essence types the server indexes', () => {
    const overridden = buildCardPayload({
      ...base,
      overrides: { cost: { generic: 1, pips: { Void: 2 } } },
    });
    expect(overridden.mechanics.essence_cost).toEqual({ generic: 1, pips: { Void: 2 } });
    expect(overridden.mechanics.essence_types).toEqual(['Void']);
  });

  it('prunes undefined entries but KEEPS an empty keyword list', () => {
    expect(pruneOverrides({ might: undefined })).toBeUndefined();
    expect(pruneOverrides({ keywords: ['Aerial'] })).toEqual({ keywords: ['Aerial'] });
    // `keywords: []` is the Creator clearing a card's generated keywords, not
    // an absent override. Pruning it made emptying the KEYWORDS box a silent
    // no-op — the card printed with its generated keywords intact.
    expect(pruneOverrides({ keywords: [] })).toEqual({ keywords: [] });
    expect(pruneOverrides({ keywords: [], might: undefined })).toEqual({ keywords: [] });
  });

  it('an empty keyword override actually strips the generated keywords', () => {
    // Find a card the hash gives keywords to, then clear them.
    const withKw = POOL_V4.find((c) => c.type === 'Unit' && (c.keywords?.length ?? 0) > 0);
    expect(withKw).toBeDefined();
    const cleared = buildCardPayload({
      id: withKw!.id,
      name: withKw!.name,
      type: 'Unit',
      rarity: (withKw!.rarity as Rarity) ?? 'Common',
      set: SHOWCASE_SET,
      flavor: 'x',
      image: OK_IMAGE,
      overrides: { keywords: [] },
    });
    expect(cleared.overrides).toEqual({ keywords: [] });
    expect(cleared.mechanics.keywords).toBeNull();
    // …and the layered CardDef the game renders really has none.
    expect(deriveCardMechanics({ ...withKw!, overrides: { keywords: [] } }).keywords).toEqual([]);
  });

  it('an Item carries its stats in bond, not in might/grit', () => {
    // The override editor used to offer MIGHT/GRIT on every card type. Only
    // Units have them, so on an Item the boxes wrote a field nothing renders
    // while `cards.might/grit` came back disagreeing with the printed card.
    const items = POOL_V4.filter((c) => c.type === 'Item');
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((c) => c.might == null && c.grit == null)).toBe(true);
    expect(items.every((c) => c.bond != null)).toBe(true);

    const item = items[0];
    const bonded = deriveCardMechanics({
      ...item,
      overrides: { bond: { might: 4, grit: 2 } },
    });
    expect(bonded.bond).toEqual({ might: 4, grit: 2 });
  });

  it('editing an Item bond keeps the keyword that bond grants', () => {
    // `bond` holds three things — might, grit and `grants`, the keyword the
    // Item hands to the unit it bonds to (28 of the 61 Items print one) — and
    // the editor only has boxes for the first two. Rebuilding the object from
    // those boxes alone overwrote `grants` with nothing, so nudging BOND
    // +MIGHT by one silently stripped the keyword off every unit the Item
    // would ever bond to, while the panel called it a stats-only edit.
    const granter = POOL_V4.find((c) => c.type === 'Item' && (c.bond?.grants?.length ?? 0) > 0);
    expect(granter).toBeDefined();
    const form = formFor(granter!);
    const { overrides, problems } = overridesFrom(
      { ...form, bondMight: String((granter!.bond?.might ?? 0) + 1) },
      granter!,
    );
    expect(problems).toEqual([]);
    expect(overrides?.bond?.might).toBe((granter!.bond?.might ?? 0) + 1);
    expect(overrides?.bond?.grants).toEqual(granter!.bond!.grants);
    // …and the card the game actually prints still grants it.
    const printed = deriveCardMechanics({ ...granter!, overrides });
    expect(printed.bond?.grants).toEqual(granter!.bond!.grants);
  });

  it('clearing both bond boxes clears the bond outright', () => {
    const item = POOL_V4.find((c) => c.type === 'Item' && !c.bond?.grants?.length);
    expect(item).toBeDefined();
    const { overrides, problems } = overridesFrom(
      { ...formFor(item!), bondMight: '', bondGrit: '' },
      item!,
    );
    expect(problems).toEqual([]);
    expect(overrides?.bond).toBeNull();
    expect(deriveCardMechanics({ ...item!, overrides }).bond).toBeUndefined();
  });

  it('ALL_SET_NAMES names the real showcase set', () => {
    // Two pinned copies of the set name (README: they must move together).
    // v13 renamed SHOWCASE_SET and left this one behind, so the Store's
    // "Includes: …" line advertised a set with no rows in `cards`.
    expect(ALL_SET_NAMES).toContain(SHOWCASE_SET);
  });

  it('parses and re-renders a cost', () => {
    expect(parseCostInput('2 ember, 1 void, 3')).toEqual({
      generic: 3,
      pips: { Ember: 2, Void: 1 },
    });
    expect(parseCostInput('')).toBeNull();
    expect(parseCostInput('two ember')).toBeNull();
    expect(parseCostInput('4 nonsense')).toBeNull();
    expect(formatCostInput({ generic: 2, pips: { Tide: 1 } })).toBe('2 generic, 1 Tide');
    expect(parseCostInput(formatCostInput({ generic: 2, pips: { Tide: 1 } }))).toEqual({
      generic: 2,
      pips: { Tide: 1 },
    });
  });

  it('rejects keywords the engine does not implement', () => {
    const { keywords, unknown } = parseKeywordsInput('aerial, Overrun, Sparkly');
    expect(keywords).toEqual(['Aerial', 'Overrun']);
    expect(unknown).toEqual(['Sparkly']);
  });

  it('describes what was overridden', () => {
    expect(describeOverrides({ might: 3, text: 'x' })).toBe('might, rules text');
    expect(describeOverrides(undefined)).toBe('');
  });
});
