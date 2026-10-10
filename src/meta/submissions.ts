/**
 * Player card submissions — pure helpers.
 *
 * Everything in this file is deliberately free of React and of the Supabase
 * client so the rules that decide whether a submission (or a bulk-import row)
 * is well-formed can be unit-tested directly. The server re-validates all of
 * it in `submit_card` / `apply_card_upsert`; these are the client-side mirror
 * that keeps a player from round-tripping just to be told the URL was wrong.
 */
import {
  CardOverrides,
  CardType,
  Rarity,
  RARITIES,
  CardTemplate,
  OVERRIDABLE_FIELDS,
} from '../types';
import { isMeteredStorageUrl, METERED_ART_MESSAGE } from '../lib/media';
import { isPower, type CardDef, type CardSubtype, type KwRef } from '../game/poker/cards';
import {
  CHIP_KEYWORDS,
  KEYWORDS,
  KEYWORD_SPECS,
  keywordAllowed,
  tierN,
  type Keyword,
} from '../game/poker/keywords';
import { deriveCardMechanics } from '../game/poker/cardpool';
import { cardColors, type Color } from '../game/poker/colors';

/** The set every player submission lands in. Renamed in v13; the server's
 * `submit_card` pins the same string, so the two must move together. */
export const SHOWCASE_SET = 'Players Showcase 2026';

/**
 * How many cards the Showcase needs before it is worth standing up as its own
 * pool — its own booster, its own poll, its own place in the pack odds.
 *
 * This used to be "10 distinct submitters", which measured interest rather
 * than content: ten players submitting one card each is not a set, it is a
 * shelf. A hundred printed-or-pending cards is roughly a third of Volume #1
 * and is the point at which a set-restricted pack stops handing out the same
 * six cards.
 */
export const SHOWCASE_MIN_CARDS = 100;

/** Types a player may submit. Leaders are Creator-authored only: their colour
 * identity and two nerve abilities are fixed per-Leader data in
 * `poker/colors.ts`/`poker/cardpool.ts`, not something a submission can
 * carry. */
export const SUBMITTABLE_TYPES: CardType[] = ['Unit', 'Item', 'Event', 'Location'];

export type Treatment = 'standard' | 'full_art' | 'video_mythic';

export const TREATMENT_LABEL: Record<Treatment, string> = {
  standard: 'Standard frame',
  full_art: 'Full art (1 per account, per set)',
  video_mythic: 'Video Mythic (1 per account, per set)',
};

/** Label without the parenthetical limit, for inline use in a row of chips.
 * Falls back to the raw value rather than throwing on `.split` if the server
 * ever grows a treatment this build has never heard of. */
export function treatmentName(t: string): string {
  return (TREATMENT_LABEL[t as Treatment] ?? t).split(' (')[0];
}

/**
 * Art aspect ratios, per treatment. The card itself is a real trading card —
 * 2.5" x 3.5", i.e. 5:7 — and the framed template insets a 4:3 art window;
 * a full-bleed treatment (Full-Art, Alt-Art, video Mythic) has no window and
 * the art IS the card, so it wants the card's own 5:7.
 *
 * These are what CardFaceV4 actually renders (`aspect-[4/3]` on the art box,
 * `CARD_SIZES.full` = 240x336 = 5:7), so a submitter cropping to them sees no
 * surprise crop at any card size.
 */
export const ART_SPECS: Record<
  Treatment,
  { ratio: string; orientation: string; recommended: string; note: string }
> = {
  standard: {
    ratio: '4:3',
    orientation: 'landscape',
    recommended: '1600 x 1200',
    note: 'Sits in the framed art window. Anything off-ratio is centre-cropped to 4:3.',
  },
  full_art: {
    ratio: '5:7',
    orientation: 'portrait',
    recommended: '1500 x 2100',
    note: 'Edge-to-edge — the art IS the card. Keep faces and focal points clear of the outer ~8%, where the name, tier mark and chip-cost plate print over it.',
  },
  video_mythic: {
    ratio: '5:7',
    orientation: 'portrait',
    recommended: '1500 x 2100, ≤ 10s, silent loop',
    note: 'Same full-bleed frame as full art, as .mp4/.webm/.mov. It autoplays muted and loops, so it should cut cleanly back to its first frame.',
  },
};

/** Mirrors the limits enforced by `submit_card`. */
export const SUBMISSION_LIMITS = {
  titleMin: 2,
  titleMax: 40,
  flavorMin: 3,
  flavorMax: 300,
  maxPending: 25,
  /** Per account, per set — counted against pending + approved. */
  fullArtPerAccount: 1,
  videoMythicPerAccount: 1,
} as const;

/**
 * Submission themes that are an instant ban rather than a denial. Rendered
 * verbatim in the submission form's disclaimer — keep the wording blunt.
 */
export const DISALLOWED_THEMES: string[] = [
  'Sexual content, nudity, or any sexualisation of minors',
  'Real people, real logos, or another game/company’s intellectual property',
  'Hate symbols, slurs, or content targeting a protected group',
  'Gore, shock imagery, or depictions of real-world violence and self-harm',
  'Harassment of another player, doxxing, or private information',
  'Advertising, referral links, scams, or off-platform solicitation',
];

const VIDEO_RE = /\.(mp4|webm|mov)([?#].*)?$/i;
const HTTPS_RE = /^https:\/\/\S+$/i;

/** True when the art link points at a video file (Mythic's looping art). */
export function isVideoUrl(url: string): boolean {
  return VIDEO_RE.test(url.trim());
}

export interface SubmissionDraft {
  title: string;
  type: CardType;
  flavor: string;
  imageUrl: string;
  treatment: Treatment;
}

/**
 * Client-side mirror of `submit_card`'s validation. Returns the first problem
 * as a player-facing sentence, or null when the draft is acceptable.
 */
export function validateSubmission(d: SubmissionDraft): string | null {
  const title = d.title.trim();
  const flavor = d.flavor.trim();
  const url = d.imageUrl.trim();
  const { titleMin, titleMax, flavorMin, flavorMax } = SUBMISSION_LIMITS;

  if (title.length < titleMin || title.length > titleMax) {
    return `Card title must be ${titleMin}–${titleMax} characters.`;
  }
  if (!SUBMITTABLE_TYPES.includes(d.type)) {
    return `Card type must be one of ${SUBMITTABLE_TYPES.join(', ')}.`;
  }
  if (flavor.length < flavorMin || flavor.length > flavorMax) {
    return `Flavor text must be ${flavorMin}–${flavorMax} characters.`;
  }
  if (!HTTPS_RE.test(url)) return 'Art link must be an https:// URL.';
  // Stricter than `submit_card`, deliberately: the server accepts any https
  // link, but art served from the project's own storage is billed egress on
  // every view, at full generator resolution, with no derivative behind it.
  // See isMeteredStorageUrl.
  if (isMeteredStorageUrl(url)) return METERED_ART_MESSAGE;
  if (d.treatment === 'video_mythic' && !isVideoUrl(url)) {
    return 'A video Mythic needs an .mp4, .webm or .mov link.';
  }
  if (d.treatment !== 'video_mythic' && isVideoUrl(url)) {
    return 'Video art can only be submitted as a video Mythic.';
  }
  return null;
}

/**
 * Card ids are the hash seed for every mechanic (`id|type|rarity`), so they
 * have to be stable, lowercase and free of anything a URL or a SQL identity
 * check would mangle — the same shape the existing catalog uses
 * (`blight_snarler`, `blossom_veiled_refuge`).
 */
export function slugifyCardId(name: string): string {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
    .replace(/_+$/g, '');
}

export function isValidCardId(id: string): boolean {
  return /^[a-z0-9_]{3,64}$/.test(id);
}

/**
 * The `mechanics` object `apply_card_upsert` writes into the derived columns.
 *
 * The column NAMES are the MTG-era schema and stay as they are (renaming a
 * column is a migration and a server change). What each one now carries for
 * FryCards Poker — `mechanicsFromDef` is the single source of this mapping,
 * shared by the Creator tools and `scripts/{sync,backfill}-cards-db.ts`:
 *
 *  | column          | FryCards Poker value                                      |
 *  |-----------------|-----------------------------------------------------------|
 *  | keywords        | `def.keywords` joined with ", " (effect + modifiers, or a  |
 *  |                 | Leader's two ability keywords); null when there are none  |
 *  | essence_cost    | null — retired. A power's chip cost is a function of its  |
 *  |                 | tier (poker/constants.ts), not an essence payment         |
 *  | essence_types   | the card's colours, unchanged from the MTG-style game     |
 *  | might           | the power's TIER (Unit stars / Item gears / Event bolts,  |
 *  |                 | 1–5) — the closest analogue of "how strong is it";        |
 *  |                 | null for Leaders and Locations                            |
 *  | grit            | null — retired (no toughness in poker)                    |
 *  | card_subtype    | `def.subtype` (Charm / Weapon / Tool, Quick / Slow)       |
 *  | resolve         | null — retired (a Leader's nerve is per-match state)      |
 *  | rules_text      | `def.text` (generated, or the Creator's override)         |
 */
export interface MechanicsPayload {
  keywords: string | null;
  essence_cost: unknown | null;
  essence_types: string[];
  might: number | null;
  grit: number | null;
  card_subtype: string | null;
  resolve: number | null;
  rules_text: string | null;
}

/** Package an already-derived card for the `cards` mechanics columns — see
 * the mapping table on `MechanicsPayload`. */
export function mechanicsFromDef(def: CardDef): MechanicsPayload {
  return {
    keywords: (def.keywords ?? []).join(', ') || null,
    essence_cost: null,
    essence_types: cardColors(def),
    might: isPower(def) ? (def.tier ?? null) : null,
    grit: null,
    card_subtype: def.subtype ?? null,
    resolve: null,
    rules_text: def.text ?? null,
  };
}

/**
 * Run the card through the same deterministic assignment every client uses and
 * package the result for the server. Without this the new row's mechanics
 * columns stay null, which `pick_deck_bucket` reads as "colourless" and
 * `verify:pool` reports as drift.
 */
export function mechanicsFor(t: CardTemplate): MechanicsPayload {
  return mechanicsFromDef(deriveCardMechanics(t));
}

export interface CardUpsertPayload {
  id: string;
  name: string;
  card_type: CardType;
  rarity: Rarity;
  set_name: string;
  flavor_text: string;
  image_url: string;
  mechanics: MechanicsPayload;
  /** Present only when Fry actually changed something — see CardOverrides. */
  overrides?: CardOverrides;
}

/** Assemble one row for `creator_bulk_add_cards` / `creator_review_submission`. */
export function buildCardPayload(input: {
  id: string;
  name: string;
  type: CardType;
  rarity: Rarity;
  set: string;
  flavor: string;
  image: string;
  overrides?: CardOverrides | null;
}): CardUpsertPayload {
  const overrides = pruneOverrides(input.overrides);
  const template: CardTemplate = {
    id: input.id,
    name: input.name,
    type: input.type,
    rarity: input.rarity,
    set: input.set,
    image: input.image,
    flavor: input.flavor,
    ...(overrides ? { overrides } : {}),
  };
  return {
    id: input.id,
    name: input.name,
    card_type: input.type,
    rarity: input.rarity,
    set_name: input.set,
    flavor_text: input.flavor,
    image_url: input.image,
    // The derived columns are written from the OVERRIDDEN card, so the
    // server's own reads (deck legality, pack odds, market pricing) agree with
    // what the game prints rather than with what the hash first produced.
    mechanics: mechanicsFor(template),
    ...(overrides ? { overrides } : {}),
  };
}

// ---------------------------------------------------------------------------
// Creator mechanics overrides
// ---------------------------------------------------------------------------

/**
 * Keep only the fields the poker card model can override
 * (`OVERRIDABLE_FIELDS`: tier, effect, mods, subtype, text) and drop
 * undefined/null entries, so "opened the editor and changed nothing" never
 * writes an override object (and removing every field removes it).
 *
 * Unknown keys are dropped on purpose: a template saved under the MTG-style
 * game can still carry `cost`, `might`, `bond`, `keywords`… overrides, which
 * mean nothing to the poker derivation. Re-approving such a card must not
 * write them back.
 *
 * An EMPTY `mods` array is kept: it is the Creator stripping a card's
 * generated modifiers, not an absent override. */
export function pruneOverrides(o?: CardOverrides | null): CardOverrides | undefined {
  if (!o) return undefined;
  const out: Record<string, unknown> = {};
  for (const k of OVERRIDABLE_FIELDS) {
    const v = (o as Record<string, unknown>)[k];
    if (v === undefined || v === null) continue;
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? (out as CardOverrides) : undefined;
}

/** Effect keywords the engine never deals on a type (mirrors `NOT_ON` in
 * poker/cardpool.ts): Snuff is a response-only Event, Straddle can't bond. */
const EFFECT_NOT_ON: Partial<Record<CardType, Keyword[]>> = {
  Unit: ['Snuff'],
  Item: ['Snuff', 'Straddle'],
};

/** Effect keywords a Creator may print on a card of this type and colour:
 * every ungated effect plus the gated ones of the card's own colours. */
export function effectChoices(type: CardType, colors: Color[]): Keyword[] {
  const banned = EFFECT_NOT_ON[type] ?? [];
  return KEYWORDS.filter(
    (k) => KEYWORD_SPECS[k].kind === 'effect' && keywordAllowed(k, colors) && !banned.includes(k),
  );
}

/** Modifier keywords a Creator may print on a card of these colours. */
export function modifierChoices(colors: Color[]): Keyword[] {
  return KEYWORDS.filter((k) => KEYWORD_SPECS[k].kind === 'modifier' && keywordAllowed(k, colors));
}

/** The number a keyword prints with at a tier when nothing overrides it. */
export function defaultN(kw: Keyword, tier: number): number | undefined {
  return KEYWORD_SPECS[kw].numbered ? tierN(kw, tier) : undefined;
}

/** "½" / "1½" / "0.5" / "2" → number; null on anything else. */
export function parseKwNumber(raw: string): number | null {
  const t = raw.trim().replace(/¼/g, '.25').replace(/½/g, '.5').replace(/¾/g, '.75');
  if (!/^\d*\.?\d+$/.test(t)) return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Validate a keyword's number: chip keywords run in quarter units, every
 * other numbered keyword (Peek, Fuse, Burn…) counts whole things. */
function kwNumberProblem(kw: Keyword, n: number): string | null {
  if (!KEYWORD_SPECS[kw].numbered) return `${kw} takes no number.`;
  if (CHIP_KEYWORDS.has(kw)) {
    return Number.isInteger(n * 4) ? null : `${kw} is a chip amount in quarter units (½, 1½…).`;
  }
  return Number.isInteger(n) ? null : `${kw} must be a whole number.`;
}

/** Parse one "Keyword N" token ("Fuse 1", "Kindle ½", "Veil"). Keyword names
 * may contain a space ("Call Out"), so match against the known names. */
export function parseKwRef(raw: string): KwRef | null {
  const text = raw.trim().replace(/\s+/g, ' ');
  const lower = text.toLowerCase();
  // Longest name first, so "Call Out 1" never matches a shorter prefix.
  const names = [...KEYWORDS].sort((a, b) => b.length - a.length);
  for (const k of names) {
    const kl = k.toLowerCase();
    if (lower === kl) return { kw: k };
    if (lower.startsWith(`${kl} `)) {
      const n = parseKwNumber(text.slice(k.length + 1));
      return n === null ? null : { kw: k, n };
    }
  }
  return null;
}

/** Render keyword refs back into the editor's "Fuse 1, Veil" form. */
export function formatKwRefs(refs: KwRef[] = []): string {
  return refs.map((r) => (r.n === undefined ? r.kw : `${r.kw} ${r.n}`)).join(', ');
}

/** Split the editor's comma-separated modifier box. `unknown` = not a poker
 * keyword at all (an invented or retired MTG keyword prints a chip with no
 * rules text and does nothing); `illegal` = a real keyword this card can't
 * carry (an effect keyword, or a modifier gated to another colour). */
export function parseModsInput(
  raw: string,
  colors: Color[],
): { mods: KwRef[]; unknown: string[]; illegal: string[] } {
  const mods: KwRef[] = [];
  const unknown: string[] = [];
  const illegal: string[] = [];
  const allowed = modifierChoices(colors);
  for (const part of raw
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean)) {
    const ref = parseKwRef(part);
    if (!ref) unknown.push(part);
    else if (!allowed.includes(ref.kw)) illegal.push(ref.kw);
    else if (!mods.some((m) => m.kw === ref.kw)) mods.push(ref);
  }
  return { mods, unknown, illegal };
}

/** The editor's raw (string) form of every overridable field.
 *
 * Pure diffing logic — it decides what actually gets written into
 * `cards.template.overrides` — so it lives here, testable without mounting
 * the panel. */
export interface OverrideForm {
  /** Stars / gears / bolts, "1"–"5". The Creator's STAR HINT. */
  tier: string;
  /** The effect keyword. */
  effect: string;
  /** The effect's number; blank = the tier's default. */
  effectN: string;
  /** Modifiers, "Fuse 1, Veil". */
  mods: string;
  subtype: string;
  /** Rules-text override; blank = generated text. */
  text: string;
}

/** A card, rendered into the editor's string form — the baseline every field
 * is compared against to decide whether it is an override. Rules text starts
 * blank (generated) so an effect edit re-generates it. */
export function formFor(def: CardDef): OverrideForm {
  return {
    tier: def.tier != null ? String(def.tier) : '',
    effect: def.effect?.kw ?? '',
    effectN: def.effect?.n != null ? String(def.effect.n) : '',
    mods: formatKwRefs(def.mods),
    subtype: (def.subtype as string) ?? '',
    text: '',
  };
}

/** Same keyword list (order-insensitive), with each number filled in from the
 * tier when absent. */
function sameMods(a: KwRef[], b: KwRef[], tier: number): boolean {
  if (a.length !== b.length) return false;
  const key = (r: KwRef) => `${r.kw}:${r.n ?? defaultN(r.kw, tier) ?? ''}`;
  const bs = new Set(b.map(key));
  return a.every((r) => bs.has(key(r)));
}

/**
 * Diff the editor's form against the generated card and return only what
 * actually changed. An unparseable value is reported instead of silently
 * dropped, because a box reading "Kindle two" must not quietly print the
 * generated effect.
 *
 * The STAR HINT re-derives the card: the generator picks effects by tier (a
 * Windfall needs 3★), so the effect/modifier/subtype boxes are compared
 * against the card derived WITH the tier override — `template` is the card's
 * identity, without overrides.
 */
export function overridesFrom(
  form: OverrideForm,
  template: CardTemplate,
): { overrides?: CardOverrides; problems: string[] } {
  const identity: CardTemplate = { ...template, overrides: undefined };
  const generated = deriveCardMechanics(identity);
  const out: CardOverrides = {};
  const problems: string[] = [];

  if (isPower(generated)) {
    if (form.tier.trim() !== String(generated.tier ?? '')) {
      const t = Number(form.tier.trim());
      if (!Number.isInteger(t) || t < 1 || t > 5) problems.push('Tier must be 1–5.');
      else out.tier = t;
    }
    const base = out.tier
      ? deriveCardMechanics({ ...identity, overrides: { tier: out.tier } })
      : generated;
    const tier = base.tier ?? 1;
    const colors = base.colors;

    const kw = form.effect.trim() as Keyword;
    const effectChanged = kw !== (base.effect?.kw ?? '');
    const nRaw = form.effectN.trim();
    const baseN = base.effect?.n != null ? String(base.effect.n) : '';
    if (effectChanged || nRaw !== baseN) {
      if (!effectChoices(generated.type, colors).includes(kw)) {
        problems.push(
          KEYWORD_SPECS[kw]
            ? `${kw} can't print on this card (wrong colour or type).`
            : 'Pick an effect keyword.',
        );
      } else if (nRaw && !KEYWORD_SPECS[kw].numbered) {
        problems.push(`${kw} takes no number.`);
      } else {
        const n = nRaw ? parseKwNumber(nRaw) : undefined;
        if (n === null) problems.push(`${kw}'s number must be a positive number.`);
        else {
          const bad = n !== undefined ? kwNumberProblem(kw, n) : null;
          if (bad) problems.push(bad);
          else if (n !== undefined && n !== defaultN(kw, tier)) out.effect = { kw, n };
          else if (effectChanged) out.effect = { kw };
        }
      }
    }

    const { mods, unknown, illegal } = parseModsInput(form.mods, colors);
    if (unknown.length) {
      problems.push(`Not a poker keyword: ${unknown.join(', ')}.`);
    } else if (illegal.length) {
      problems.push(`Not a modifier this card's colours allow: ${illegal.join(', ')}.`);
    } else {
      const bad = mods
        .map((m) => (m.n !== undefined ? kwNumberProblem(m.kw, m.n) : null))
        .find(Boolean);
      if (bad) problems.push(bad);
      else if (!sameMods(mods, base.mods ?? [], tier)) {
        // Numbers equal to the tier default are left off, so a later tier
        // change keeps scaling them.
        out.mods = mods.map((m) =>
          m.n === undefined || m.n === defaultN(m.kw, tier) ? { kw: m.kw } : m,
        );
      }
    }

    if (form.subtype.trim() !== String(base.subtype ?? '')) {
      const allowed = SUBTYPE_CHOICES[generated.type] ?? [];
      const st = form.subtype.trim() as CardSubtype;
      if (!allowed.includes(st)) problems.push(`${generated.type}s can't be ${st || 'blank'}.`);
      else out.subtype = st;
    }
  }

  if (form.text.trim()) out.text = form.text.trim();

  return { overrides: pruneOverrides(out), problems };
}

/** Subtypes the Creator may set per card type — the same values `cardpool.ts`
 * generates, so an override can only ever pick a subtype the engine reads. */
export const SUBTYPE_CHOICES: Partial<Record<CardType, CardSubtype[]>> = {
  Item: ['Charm', 'Weapon', 'Tool'],
  Event: ['Quick', 'Slow'],
};

const OVERRIDE_LABEL: Record<string, string> = {
  tier: 'tier',
  effect: 'effect',
  mods: 'modifiers',
  subtype: 'subtype',
  text: 'rules text',
};

/** Human summary of what an override actually changes, for the review row and
 * the confirmation prompt. */
export function describeOverrides(o?: CardOverrides): string {
  const pruned = pruneOverrides(o);
  if (!pruned) return '';
  return Object.keys(pruned)
    .map((k) => OVERRIDE_LABEL[k] ?? k)
    .join(', ');
}

// ---------------------------------------------------------------------------
// Bulk import parsing
// ---------------------------------------------------------------------------

export interface BulkRow {
  id: string;
  name: string;
  type: CardType;
  rarity: Rarity;
  set: string;
  flavor: string;
  image: string;
}

export interface BulkParseResult {
  rows: BulkRow[];
  /** One entry per rejected line/element, in input order. */
  errors: { line: number; message: string }[];
}

const ALL_TYPES: CardType[] = ['Leader', 'Unit', 'Item', 'Event', 'Location'];

/** Accepts a type in any casing; returns the canonical spelling or null. */
function normalizeType(raw: string): CardType | null {
  const v = raw.trim().toLowerCase();
  return ALL_TYPES.find((t) => t.toLowerCase() === v) ?? null;
}

/** Accepts `Super-Rare`, `super rare`, `SUPER_RARE`… — hyphen, space and
 * underscore are interchangeable, because a spreadsheet paste never agrees
 * with itself about which one it used. */
function normalizeRarity(raw: string): Rarity | null {
  const v = raw
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  return RARITIES.find((r) => r.toLowerCase() === v) ?? null;
}

function validateRow(
  raw: Partial<Record<'id' | 'name' | 'type' | 'rarity' | 'set' | 'flavor' | 'image', string>>,
  defaultSet: string,
): { row?: BulkRow; error?: string } {
  const name = (raw.name ?? '').trim();
  if (!name) return { error: 'name is required' };
  if (name.length > 80) return { error: 'name must be 80 characters or fewer' };

  const type = normalizeType(raw.type ?? '');
  if (!type) return { error: `unknown card type "${(raw.type ?? '').trim()}"` };

  const rarity = normalizeRarity(raw.rarity ?? '');
  if (!rarity) return { error: `unknown rarity "${(raw.rarity ?? '').trim()}"` };

  const image = (raw.image ?? '').trim();
  if (!HTTPS_RE.test(image)) return { error: 'image url must be an https:// link' };
  if (isMeteredStorageUrl(image)) return { error: METERED_ART_MESSAGE };

  const flavor = (raw.flavor ?? '').trim();
  if (flavor.length > 500) return { error: 'flavor text must be 500 characters or fewer' };

  const id = ((raw.id ?? '').trim() || slugifyCardId(name)).toLowerCase();
  if (!isValidCardId(id)) {
    return { error: `id "${id}" must be 3–64 chars of a-z, 0-9 or _` };
  }

  const set = (raw.set ?? '').trim() || defaultSet;
  if (!set) return { error: 'set name is required' };

  return { row: { id, name, type, rarity, set, flavor, image } };
}

/**
 * Parse a bulk-add blob into card rows.
 *
 * Two input shapes, detected from the first non-blank character:
 *  - a JSON array of objects (`id` optional; `type`/`card_type`,
 *    `rarity`, `image`/`image_url`, `flavor`/`flavor_text`, `set`/`set_name`)
 *  - delimited lines — tab, `|` or comma — in the order
 *    `name, type, rarity, image url, flavor[, set][, id]`.
 *
 * Bad rows are collected rather than thrown, so a 200-line paste with three
 * typos reports the three typos instead of refusing the other 197.
 */
export function parseBulkCards(text: string, defaultSet = SHOWCASE_SET): BulkParseResult {
  const trimmed = text.trim();
  const errors: BulkParseResult['errors'] = [];
  const rows: BulkRow[] = [];
  if (!trimmed) return { rows, errors: [{ line: 0, message: 'Nothing to import.' }] };

  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      return {
        rows,
        errors: [{ line: 0, message: `Invalid JSON: ${(e as Error).message}` }],
      };
    }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    list.forEach((item, i) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push({ line: i + 1, message: 'expected an object' });
        return;
      }
      const o = item as Record<string, unknown>;
      const str = (...keys: string[]): string => {
        for (const k of keys) {
          const v = o[k];
          if (typeof v === 'string') return v;
          if (typeof v === 'number') return String(v);
        }
        return '';
      };
      const { row, error } = validateRow(
        {
          id: str('id'),
          name: str('name'),
          type: str('type', 'card_type'),
          rarity: str('rarity'),
          set: str('set', 'set_name'),
          flavor: str('flavor', 'flavor_text'),
          image: str('image', 'image_url', 'art', 'url'),
        },
        defaultSet,
      );
      if (row) rows.push(row);
      else errors.push({ line: i + 1, message: error! });
    });
    return dedupe(rows, errors);
  }

  const lines = trimmed.split(/\r?\n/);
  lines.forEach((line, i) => {
    const lineNo = i + 1;
    if (!line.trim() || line.trim().startsWith('#')) return;
    // Tabs and pipes win over commas: flavor text is full of commas, and a
    // comma-split would shear it in half on almost every real card.
    const delimiter = line.includes('\t') ? '\t' : line.includes('|') ? '|' : ',';
    const parts = line.split(delimiter).map((p) => p.trim());
    if (parts.length < 4) {
      errors.push({
        line: lineNo,
        message: 'expected at least: name, type, rarity, image url',
      });
      return;
    }
    // Header rows are a near-universal paste artefact — skip one silently
    // rather than reporting "unknown card type \"type\"".
    if (
      lineNo === 1 &&
      parts[0].toLowerCase() === 'name' &&
      normalizeType(parts[1]) === null &&
      parts[1].toLowerCase().includes('type')
    ) {
      return;
    }
    const [name, type, rarity, image, flavor, set, id] = parts;
    const { row, error } = validateRow({ id, name, type, rarity, set, flavor, image }, defaultSet);
    if (row) rows.push(row);
    else errors.push({ line: lineNo, message: error! });
  });
  return dedupe(rows, errors);
}

/** Two rows with the same id would silently overwrite each other in one batch
 * (last write wins), so the second occurrence is an error, not a merge. */
function dedupe(rows: BulkRow[], errors: BulkParseResult['errors']): BulkParseResult {
  const seen = new Set<string>();
  const out: BulkRow[] = [];
  for (const r of rows) {
    if (seen.has(r.id)) {
      errors.push({ line: 0, message: `duplicate card id "${r.id}" in this batch` });
      continue;
    }
    seen.add(r.id);
    out.push(r);
  }
  return { rows: out, errors };
}
