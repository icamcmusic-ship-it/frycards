import { describe, expect, it } from 'vitest';
import {
  DISALLOWED_THEMES,
  SHOWCASE_MIN_CARDS,
  SHOWCASE_SET,
  SUBMISSION_LIMITS,
  SUBMITTABLE_TYPES,
  buildCardPayload,
  describeOverrides,
  effectChoices,
  formFor,
  formatKwRefs,
  isValidCardId,
  isVideoUrl,
  mechanicsFor,
  mechanicsFromDef,
  modifierChoices,
  overridesFrom,
  parseBulkCards,
  parseKwRef,
  parseModsInput,
  pruneOverrides,
  slugifyCardId,
  validateSubmission,
} from './submissions';
import { POOL_BY_ID, POOL, deriveCardMechanics } from '../game/poker/cardpool';
import { RARITIES, type CardOverrides, type CardTemplate } from '../types';
import { COLORS } from '../game/poker/colors';
import { KEYWORD_SPECS, tierN } from '../game/poker/keywords';
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
    expect(m).toEqual(mechanicsFromDef(known));
    expect(m.rules_text).toBe(known.text ?? null);
    expect(m.keywords).toBe((known.keywords ?? []).join(', ') || null);
    expect(m.essence_types).toEqual(known.colors);
  });

  it('maps poker mechanics onto the legacy column names', () => {
    // might = tier for powers; the MTG-only columns are written null.
    const unit = POOL.find((c) => c.type === 'Unit')!;
    const mu = mechanicsFromDef(unit);
    expect(mu.might).toBe(unit.tier);
    expect(mu.might).toBeGreaterThanOrEqual(1);
    expect(mu.might).toBeLessThanOrEqual(5);
    expect(mu.grit).toBeNull();
    expect(mu.resolve).toBeNull();
    expect(mu.essence_cost).toBeNull();

    const leader = POOL.find((c) => c.type === 'Leader')!;
    const ml = mechanicsFromDef(leader);
    expect(ml.might).toBeNull();
    expect(ml.keywords).toBe(leader.abilities!.map((a) => a.effect.kw).join(', '));

    const loc = POOL.find((c) => c.type === 'Location')!;
    const mloc = mechanicsFromDef(loc);
    expect(mloc.might).toBeNull();
    expect(mloc.keywords).toBeNull();
    expect(mloc.rules_text).toBe(loc.text);

    const item = POOL.find((c) => c.type === 'Item')!;
    expect(mechanicsFromDef(item).card_subtype).toBe(item.subtype);
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
    // A Location prints its table rule as its rules text.
    expect(p.mechanics.rules_text).toBeTruthy();
  });

  it('derives usable mechanics at every rarity a Creator can pick', () => {
    // A slice of the pool is legitimately colourless, so an empty
    // essence_types is valid — pick_deck_bucket's `essence_types <@ identity`
    // reads that as "legal in any deck". What must hold at every rarity is
    // that a Unit gets a 1–5 tier and an effect keyword, and only ever names
    // real colours.
    const seen = new Set<string>();
    for (const rarity of RARITIES) {
      const m = mechanicsFor({
        id: 'test_card_gamma',
        name: 'Gamma',
        type: 'Unit',
        rarity,
        set: SHOWCASE_SET,
      });
      expect(m.might).toBeGreaterThanOrEqual(1);
      expect(m.might).toBeLessThanOrEqual(5);
      expect(m.keywords).toBeTruthy();
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
// Creator mechanics overrides (poker: tier hint, effect, modifiers, subtype,
// text)
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
  const templateOf = (c: (typeof POOL)[number]): CardTemplate => ({
    id: c.id,
    name: c.name,
    type: c.type,
    rarity: c.rarity,
    set: c.set,
    image: c.image,
    flavor: c.flavor,
  });

  it('leaves the payload untouched when nothing is overridden', () => {
    const plain = buildCardPayload(base);
    expect(plain.overrides).toBeUndefined();
    expect(buildCardPayload({ ...base, overrides: {} }).overrides).toBeUndefined();
    expect(buildCardPayload({ ...base, overrides: null }).overrides).toBeUndefined();
  });

  it('a star hint writes the tier into the derived mechanics the server stores', () => {
    const generated = deriveCardMechanics(base);
    const hint = generated.tier === 5 ? 1 : 5;
    const overridden = buildCardPayload({ ...base, overrides: { tier: hint } });
    expect(overridden.overrides).toEqual({ tier: hint });
    expect(overridden.mechanics.might).toBe(hint);
    // Colour is identity, never a mechanic: a re-tier keeps it.
    expect(overridden.mechanics.essence_types).toEqual(
      buildCardPayload(base).mechanics.essence_types,
    );
  });

  it('an effect override prints that keyword at the tier default', () => {
    const generated = deriveCardMechanics(base);
    const kw = effectChoices('Unit', generated.colors).find((k) => k !== generated.effect?.kw)!;
    const def = deriveCardMechanics({ ...base, overrides: { effect: { kw } } });
    expect(def.effect?.kw).toBe(kw);
    expect(def.effect?.n).toBe(KEYWORD_SPECS[kw].numbered ? tierN(kw, def.tier!) : undefined);
    expect(def.keywords?.[0]).toBe(kw);
    expect(buildCardPayload({ ...base, overrides: { effect: { kw } } }).mechanics.keywords).toMatch(
      new RegExp(`^${kw}`),
    );
  });

  it('prunes undefined/null entries and every retired MTG field, but KEEPS an empty modifier list', () => {
    expect(pruneOverrides({ tier: undefined })).toBeUndefined();
    // A template saved under the MTG-style game can still carry these.
    const legacy = { might: 9, cost: { generic: 1 }, bond: {}, keywords: ['Aerial'] };
    expect(pruneOverrides(legacy as unknown as CardOverrides)).toBeUndefined();
    expect(pruneOverrides({ ...legacy, tier: 3 } as unknown as CardOverrides)).toEqual({ tier: 3 });
    expect(pruneOverrides({ text: null } as unknown as CardOverrides)).toBeUndefined();
    // `mods: []` is the Creator stripping a card's generated modifiers.
    expect(pruneOverrides({ mods: [] })).toEqual({ mods: [] });
  });

  it('an empty modifier override actually strips the generated modifiers', () => {
    const withMods = POOL.find((c) => c.type === 'Unit' && (c.mods?.length ?? 0) > 0);
    expect(withMods).toBeDefined();
    const t = templateOf(withMods!);
    const { overrides, problems } = overridesFrom({ ...formFor(withMods!), mods: '' }, t);
    expect(problems).toEqual([]);
    expect(overrides).toEqual({ mods: [] });
    const printed = deriveCardMechanics({ ...t, overrides });
    expect(printed.mods).toEqual([]);
    expect(printed.keywords).toEqual([withMods!.effect!.kw]);
  });

  it('the editor round-trips a card unchanged into no overrides at all', () => {
    for (const c of POOL.filter((d) => d.type !== 'Leader').slice(0, 60)) {
      const { overrides, problems } = overridesFrom(formFor(c), templateOf(c));
      expect(problems).toEqual([]);
      expect(overrides).toBeUndefined();
    }
  });

  it('a tier hint re-baselines the effect and modifiers at the new tier', () => {
    const c = POOL.find((d) => d.type === 'Item' && d.tier! <= 3)!;
    const t = templateOf(c);
    const hinted = deriveCardMechanics({ ...t, overrides: { tier: c.tier! + 2 } });
    // What the editor shows after picking the new tier.
    const form = { ...formFor(hinted), tier: String(c.tier! + 2) };
    const { overrides, problems } = overridesFrom(form, t);
    expect(problems).toEqual([]);
    expect(overrides).toEqual({ tier: c.tier! + 2 });
  });

  it('limits effects to keywords the card’s colours allow', () => {
    // Peek is Light-gated: a card with no Light can't carry it.
    const nonLight = POOL.find((d) => d.type === 'Unit' && !d.colors.includes('Light'))!;
    expect(effectChoices('Unit', nonLight.colors)).not.toContain('Peek');
    expect(effectChoices('Unit', ['Light'])).toContain('Peek');
    // Snuff is a response-only Event.
    expect(effectChoices('Unit', ['Void'])).not.toContain('Snuff');
    expect(effectChoices('Event', ['Void'])).toContain('Snuff');
    // Modifiers are never effects.
    expect(effectChoices('Event', ['Shadow'])).not.toContain('Veil');
    expect(modifierChoices(['Shadow'])).toContain('Veil');

    const { problems } = overridesFrom(
      { ...formFor(nonLight), effect: 'Peek' },
      templateOf(nonLight),
    );
    expect(problems.join(' ')).toMatch(/Peek can't print/);
  });

  it('writes an effect number only when it differs from the tier default', () => {
    const c = POOL.find((d) => d.type === 'Unit' && d.colors.includes('Ember'))!;
    const t = templateOf(c);
    const def = tierN('Kindle', c.tier!);
    const same = overridesFrom({ ...formFor(c), effect: 'Kindle', effectN: String(def) }, t);
    expect(same.problems).toEqual([]);
    expect(same.overrides?.effect ?? { kw: 'Kindle' }).toEqual({ kw: 'Kindle' });
    const bumped = overridesFrom({ ...formFor(c), effect: 'Kindle', effectN: '½' }, t);
    if (def === 0.5) expect(bumped.overrides?.effect).toEqual({ kw: 'Kindle' });
    else expect(bumped.overrides?.effect).toEqual({ kw: 'Kindle', n: 0.5 });
    // Whole-number keywords reject fractions; numberless ones reject numbers.
    expect(overridesFrom({ ...formFor(c), effect: 'Redraw', effectN: '2' }, t).problems).toEqual([
      'Redraw takes no number.',
    ]);
  });

  it('parses modifier boxes, rejecting retired MTG keywords and off-colour ones', () => {
    expect(parseKwRef('fuse 2')).toEqual({ kw: 'Fuse', n: 2 });
    expect(parseKwRef('Kindle 1½')).toEqual({ kw: 'Kindle', n: 1.5 });
    expect(parseKwRef('Call Out')).toEqual({ kw: 'Call Out' });
    expect(parseKwRef('Aerial')).toBeNull();
    expect(formatKwRefs([{ kw: 'Fuse', n: 1 }, { kw: 'Veil' }])).toBe('Fuse 1, Veil');

    const r = parseModsInput('Fuse 1, Veil, Aerial, Peek, Fuse', ['Shadow']);
    expect(r.mods).toEqual([{ kw: 'Fuse', n: 1 }, { kw: 'Veil' }]);
    expect(r.unknown).toEqual(['Aerial']);
    expect(r.illegal).toEqual(['Peek']); // an effect, not a modifier
  });

  it('a rules-text override is kept; a blank box means generated', () => {
    const c = POOL.find((d) => d.type === 'Location')!;
    const t = templateOf(c);
    expect(overridesFrom({ ...formFor(c), text: '  ' }, t).overrides).toBeUndefined();
    const { overrides } = overridesFrom({ ...formFor(c), text: 'House rules.' }, t);
    expect(overrides).toEqual({ text: 'House rules.' });
    expect(deriveCardMechanics({ ...t, overrides }).text).toBe('House rules.');
  });

  it('subtype overrides only accept the subtypes the engine reads', () => {
    const item = POOL.find((d) => d.type === 'Item' && d.subtype !== 'Weapon')!;
    const t = templateOf(item);
    expect(overridesFrom({ ...formFor(item), subtype: 'Weapon' }, t).overrides).toEqual({
      subtype: 'Weapon',
    });
    expect(overridesFrom({ ...formFor(item), subtype: 'Quick' }, t).problems).toHaveLength(1);
  });

  it('ALL_SET_NAMES names the real showcase set', () => {
    // Two pinned copies of the set name (README: they must move together).
    // v13 renamed SHOWCASE_SET and left this one behind, so the Store's
    // "Includes: …" line advertised a set with no rows in `cards`.
    expect(ALL_SET_NAMES).toContain(SHOWCASE_SET);
  });

  it('describes what was overridden', () => {
    expect(describeOverrides({ tier: 3, mods: [], text: 'x' })).toBe('tier, modifiers, rules text');
    expect(describeOverrides(undefined)).toBe('');
  });
});
