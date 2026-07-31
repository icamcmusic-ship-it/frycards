/**
 * Player card submissions — pure helpers.
 *
 * Everything in this file is deliberately free of React and of the Supabase
 * client so the rules that decide whether a submission (or a bulk-import row)
 * is well-formed can be unit-tested directly. The server re-validates all of
 * it in `submit_card` / `apply_card_upsert`; these are the client-side mirror
 * that keeps a player from round-tripping just to be told the URL was wrong.
 */
import { CardType, Rarity, RARITIES, CardTemplate } from '../types';
import { deriveCardMechanics } from '../game/v3/cardpool';
import { cardColors } from '../game/v3/colors';

/** The set every player submission lands in. */
export const SHOWCASE_SET = 'Player Showcase';

/** Types a player may submit. Leaders are Creator-authored only: their colour
 * identity, Resolve and two abilities are fixed per-Leader data in
 * `colors.ts`/`cardpool.ts`, not something a submission can carry. */
export const SUBMITTABLE_TYPES: CardType[] = ['Unit', 'Charm', 'Event', 'Location'];

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

/** The `mechanics` object `apply_card_upsert` writes into the derived columns. */
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

/**
 * Run the card through the same deterministic assignment every client uses and
 * package the result for the server. Without this the new row's mechanics
 * columns stay null, which `pick_deck_bucket` reads as "colourless, cost 0"
 * and `verify:pool` reports as drift.
 */
export function mechanicsFor(t: CardTemplate): MechanicsPayload {
  const def = deriveCardMechanics(t);
  return {
    keywords: (def.keywords ?? []).join(', ') || null,
    essence_cost: def.cost ?? null,
    essence_types: cardColors(def),
    might: def.might ?? null,
    grit: def.grit ?? null,
    card_subtype: def.subtype ?? null,
    resolve: def.resolve ?? null,
    rules_text: def.text ?? null,
  };
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
}): CardUpsertPayload {
  const template: CardTemplate = {
    id: input.id,
    name: input.name,
    type: input.type,
    rarity: input.rarity,
    set: input.set,
    image: input.image,
    flavor: input.flavor,
  };
  return {
    id: input.id,
    name: input.name,
    card_type: input.type,
    rarity: input.rarity,
    set_name: input.set,
    flavor_text: input.flavor,
    image_url: input.image,
    mechanics: mechanicsFor(template),
  };
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

const ALL_TYPES: CardType[] = ['Leader', 'Unit', 'Charm', 'Event', 'Location'];

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
